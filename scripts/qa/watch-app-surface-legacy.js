#!/usr/bin/env node

import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const BASE_URL = process.env.WDTT_SPECTATOR_BASE_URL || 'http://127.0.0.1:3001/';
const DEFAULT_ARTIFACT_DIR = path.resolve('runs/live-spectator');
const SERVER_BOOT_TIMEOUT_MS = 10000;
const DEFAULT_INTERVAL_MS = 15000;
const DESKTOP_VIEWPORT = { width: 1512, height: 982 };
const MOBILE_VIEWPORT = {
  width: 390,
  height: 844,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
};
const FORBIDDEN_VISIBLE_TERMS = [
  'onboarding surface',
  'session runway',
  'turn seal',
  'decision sheet',
  'seal route',
  'seal live',
  'handoff',
  'field dock',
  'agent-routing-state',
  'generated surface active',
  'command flow',
];
const GENERATED_SELECTOR_LIST = [
  'meta[name="wdttgukji-generated-run"]',
  'meta[name="wdttgukji-generated-summary"]',
  '#generated-app-surface-stamp',
  'template#generated-app-surface-stamp',
];

function parseArgs(argv) {
  const args = {
    artifactDir: DEFAULT_ARTIFACT_DIR,
    intervalMs: DEFAULT_INTERVAL_MS,
    once: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--artifact-dir') args.artifactDir = path.resolve(argv[++index] || args.artifactDir);
    else if (token === '--interval-ms') args.intervalMs = Number(argv[++index] || DEFAULT_INTERVAL_MS);
    else if (token === '--once') args.once = true;
  }

  if (!Number.isFinite(args.intervalMs) || args.intervalMs < 1000) {
    throw new Error(`Invalid --interval-ms value: ${args.intervalMs}`);
  }

  return args;
}

function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function waitForServer(url, timeoutMs, abortState = null) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (abortState?.exited) {
      const details = [
        abortState.code != null ? `code ${abortState.code}` : null,
        abortState.signal ? `signal ${abortState.signal}` : null,
        abortState.stderr?.trim() ? abortState.stderr.trim() : null,
      ].filter(Boolean).join('\n');
      throw new Error(`Dev server exited before becoming ready${details ? `:\n${details}` : ''}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await delay(150);
  }
  throw new Error(`Dev server did not start within ${timeoutMs}ms`);
}

async function ensureServer(rootDir) {
  let server = null;
  let stderr = '';
  const serverState = {
    exited: false,
    code: null,
    signal: null,
    stderr: '',
  };

  try {
    await waitForServer(BASE_URL, 400);
  } catch {
    server = spawn(process.execPath, ['server.js'], {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      serverState.stderr = stderr;
    });
    server.once('exit', (code, signal) => {
      serverState.exited = true;
      serverState.code = code;
      serverState.signal = signal;
    });
  }

  await waitForServer(BASE_URL, SERVER_BOOT_TIMEOUT_MS, serverState);
  return { server };
}

async function archiveLatest(sourcePath, latestPath, archivePath) {
  await copyFile(sourcePath, latestPath);
  await copyFile(sourcePath, archivePath);
}

function normalizeText(value = '') {
  return `${value}`.replace(/\s+/g, ' ').trim().toLowerCase();
}

function buildAuditFailures(audit, viewportLabel) {
  const failures = [];
  for (const [sceneName, scene] of Object.entries(audit.scenes || {})) {
    if (scene.generated_artifacts_present) {
      failures.push(`${viewportLabel}/${sceneName}: generated metadata leaked into DOM`);
    }
    if ((scene.forbidden_terms || []).length) {
      failures.push(`${viewportLabel}/${sceneName}: forbidden visible terms -> ${scene.forbidden_terms.join(', ')}`);
    }
    if ((scene.overflow_x || 0) > 4) {
      failures.push(`${viewportLabel}/${sceneName}: horizontal overflow ${scene.overflow_x}px`);
    }
    if (sceneName === 'battlefield') {
      if (!scene.selection_focus_active) failures.push(`${viewportLabel}/battlefield: selected city did not activate selection-focus mode`);
      if (viewportLabel === 'desktop' && scene.chronicle_visible) failures.push(`${viewportLabel}/battlefield: chronicle rail still visible after city selection`);
      if (viewportLabel === 'desktop' && scene.war_room_visible) failures.push(`${viewportLabel}/battlefield: war-room brief still visible after city selection`);
      if (viewportLabel === 'desktop' && !scene.map_selection_visible) failures.push(`${viewportLabel}/battlefield: map selection panel is not visible`);
      if (viewportLabel === 'desktop' && !scene.map_selection_visible && !scene.city_rail_visible) {
        failures.push(`${viewportLabel}/battlefield: no actionable selection surface is visible`);
      }
      if (viewportLabel === 'mobile' && !scene.map_selection_visible && !scene.city_rail_visible) {
        failures.push(`${viewportLabel}/battlefield: no actionable selection surface is visible`);
      }
    }
    if (sceneName === 'command') {
      if (scene.command_stage_strip_visible) failures.push(`${viewportLabel}/command: command stage strip is still visible`);
      if (!scene.command_confirm_visible) failures.push(`${viewportLabel}/command: confirm button is not visible`);
      if (!scene.command_panel_fits_viewport) failures.push(`${viewportLabel}/command: command panel exceeds viewport bounds`);
    }
  }
  return failures;
}

async function preparePage(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(BASE_URL, { waitUntil: 'load' });
  await page.evaluate(() => {
    localStorage.removeItem('wdttgukji_save');
    localStorage.removeItem('wdttgukji_save_meta');
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.stage-frame');
}

async function collectSceneAudit(page, scene) {
  return page.evaluate(({ scene, forbiddenTerms, generatedSelectors }) => {
    const normalize = (value = '') => `${value}`.replace(/\s+/g, ' ').trim().toLowerCase();
    const isVisible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const visibleText = normalize(document.body.innerText || '');
    const forbidden = forbiddenTerms.filter((term) => visibleText.includes(term));
    const generatedPresent = generatedSelectors.some((selector) => document.querySelector(selector));
    const docEl = document.documentElement;
    const commandPanel = document.getElementById('action-panel');
    const commandRect = commandPanel instanceof HTMLElement ? commandPanel.getBoundingClientRect() : null;
    const commandPanelFitsViewport = !commandRect
      || (
        commandRect.left >= -1
        && commandRect.top >= -1
        && commandRect.right <= window.innerWidth + 1
        && commandRect.bottom <= window.innerHeight + 1
      );

    return {
      scene,
      forbidden_terms: forbidden,
      generated_artifacts_present: generatedPresent,
      overflow_x: Math.max(0, docEl.scrollWidth - window.innerWidth),
      overflow_y: Math.max(0, docEl.scrollHeight - window.innerHeight),
      selection_focus_active: document.getElementById('game-screen')?.classList.contains('selection-focus') || false,
      chronicle_visible: isVisible(document.getElementById('chronicle-rail')),
      war_room_visible: isVisible(document.getElementById('war-room-brief')),
      map_selection_visible: isVisible(document.getElementById('map-selection-panel')),
      city_rail_visible: isVisible(document.getElementById('city-rail')),
      command_stage_strip_visible: isVisible(document.getElementById('command-stage-strip')),
      command_confirm_visible: isVisible(document.getElementById('action-panel-confirm')),
      command_panel_fits_viewport: commandPanelFitsViewport,
      primary_cta_text: document.querySelector('#btn-new-game, #btn-open-command, #action-panel-confirm')?.textContent?.trim() || '',
    };
  }, {
    scene,
    forbiddenTerms: FORBIDDEN_VISIBLE_TERMS,
    generatedSelectors: GENERATED_SELECTOR_LIST,
  });
}

async function runFlow(page, { capturePaths = null } = {}) {
  await preparePage(page, page.viewportSize() || DESKTOP_VIEWPORT);

  const startAudit = await collectSceneAudit(page, 'start');
  if (capturePaths?.start) {
    await page.screenshot({ path: capturePaths.start, fullPage: true });
  }

  await page.click('#btn-new-game');
  await page.waitForSelector('.faction-card[data-faction="shu"]');
  await page.evaluate(() => window.__wdttgukji.selectFaction('shu'));
  await page.evaluate(() => window.__wdttgukji.showIntro());
  await page.waitForSelector('#intro-screen:not(.hidden)');
  await page.evaluate(() => {
    for (let index = 0; index < 16; index += 1) window.__wdttgukji.advanceDialogue();
  });
  await page.evaluate(() => window.__wdttgukji.startGame());
  await page.waitForSelector('#game-screen:not(.hidden)');
  await page.waitForFunction(() => {
    const title = document.getElementById('war-room-title')?.textContent?.trim() || '';
    const objective = document.getElementById('war-room-objective')?.textContent?.trim() || '';
    return Boolean(title && objective);
  });
  await page.evaluate(() => window.__wdttgukji.selectCity('jiangling'));
  await page.waitForFunction(() => {
    const title = document.getElementById('field-reaction-title');
    return !!title?.textContent?.trim() && title.textContent.trim() !== '전장을 정리 중입니다.';
  });
  await page.waitForFunction(() => document.getElementById('game-screen')?.classList.contains('selection-focus'));
  await page.waitForFunction(() => {
    const isVisible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0.05) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    return isVisible(document.getElementById('map-selection-panel')) || isVisible(document.getElementById('city-rail'));
  });

  const battlefieldAudit = await collectSceneAudit(page, 'battlefield');
  if (capturePaths?.battlefield) {
    await page.screenshot({ path: capturePaths.battlefield, fullPage: true });
  }

  await page.evaluate(() => window.__wdttgukji.openCommand('jiangling', 'government'));
  await page.waitForSelector('#command-modal:not(.hidden)');
  await page.waitForFunction(() => {
    const summary = document.getElementById('command-selection-status')?.textContent?.trim() || '';
    const city = document.getElementById('command-city-caption')?.textContent?.trim() || '';
    return Boolean(summary && city);
  });

  const commandAudit = await collectSceneAudit(page, 'command');
  if (capturePaths?.command) {
    await page.screenshot({ path: capturePaths.command, fullPage: true });
  }

  const meta = await page.evaluate(() => ({
    openingKicker: document.getElementById('war-room-kicker')?.textContent?.trim() || '',
    openingTitle: document.getElementById('war-room-title')?.textContent?.trim() || '',
    openingObjective: document.getElementById('war-room-objective')?.textContent?.trim() || '',
    turnLabel: document.getElementById('turn-display')?.textContent?.trim() || '',
    yearLabel: document.getElementById('year-display')?.textContent?.trim() || '',
    battlefieldAction: document.getElementById('war-room-action')?.textContent?.trim() || '',
    battlefieldFocus: document.getElementById('war-room-focus')?.textContent?.trim() || '',
    battlefieldRisk: document.getElementById('war-room-risk')?.textContent?.trim() || '',
    commandStatusText: document.getElementById('command-selection-status')?.textContent?.trim() || '',
    commandCityCaption: document.getElementById('command-city-caption')?.textContent?.trim() || '',
  }));

  return {
    scenes: {
      start: startAudit,
      battlefield: battlefieldAudit,
      command: commandAudit,
    },
    meta,
  };
}

async function captureCycle(browser, artifactDir) {
  const startedAt = new Date();
  const stamp = timestampSlug(startedAt);
  const tmpDir = path.join(artifactDir, '.tmp');
  await mkdir(tmpDir, { recursive: true });

  const desktopContext = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
  const desktopPage = await desktopContext.newPage();
  const mobileContext = await browser.newContext({ viewport: { width: MOBILE_VIEWPORT.width, height: MOBILE_VIEWPORT.height }, isMobile: true, hasTouch: true, deviceScaleFactor: MOBILE_VIEWPORT.deviceScaleFactor });
  const mobilePage = await mobileContext.newPage();

  const startTmp = path.join(tmpDir, `${stamp}-start.tmp.png`);
  const battlefieldTmp = path.join(tmpDir, `${stamp}-battlefield.tmp.png`);
  const commandTmp = path.join(tmpDir, `${stamp}-command.tmp.png`);

  try {
    const desktop = await runFlow(desktopPage, {
      capturePaths: {
        start: startTmp,
        battlefield: battlefieldTmp,
        command: commandTmp,
      },
    });
    const mobile = await runFlow(mobilePage);

    const desktopFailures = buildAuditFailures(desktop, 'desktop');
    const mobileFailures = buildAuditFailures(mobile, 'mobile');
    const failures = [...desktopFailures, ...mobileFailures];

    const archiveDir = path.join(artifactDir, 'history');
    await mkdir(archiveDir, { recursive: true });

    const startArchive = path.join(archiveDir, `${stamp}-start.png`);
    const battlefieldArchive = path.join(archiveDir, `${stamp}-battlefield.png`);
    const commandArchive = path.join(archiveDir, `${stamp}-command.png`);

    await archiveLatest(startTmp, path.join(artifactDir, 'latest-start.png'), startArchive);
    await archiveLatest(battlefieldTmp, path.join(artifactDir, 'latest-battlefield.png'), battlefieldArchive);
    await archiveLatest(commandTmp, path.join(artifactDir, 'latest-command.png'), commandArchive);

    const summary = {
      status: failures.length ? 'failed' : 'completed',
      captured_at: startedAt.toISOString(),
      base_url: BASE_URL,
      start_screen: path.relative(artifactDir, startArchive),
      battlefield: path.relative(artifactDir, battlefieldArchive),
      command_panel: path.relative(artifactDir, commandArchive),
      latest_files: {
        start_screen: 'latest-start.png',
        battlefield: 'latest-battlefield.png',
        command_panel: 'latest-command.png',
      },
      audits: {
        desktop: desktop.scenes,
        mobile: mobile.scenes,
        failures,
      },
      meta: desktop.meta,
    };

    await writeFile(path.join(artifactDir, 'latest.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(summary));

    if (failures.length) {
      throw new Error(failures.join('\n'));
    }

    return summary;
  } finally {
    await Promise.allSettled([
      desktopContext.close(),
      mobileContext.close(),
    ]);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  await mkdir(args.artifactDir, { recursive: true });

  const { server } = await ensureServer(rootDir);
  const browser = await chromium.launch({ headless: true });

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    await browser.close().catch(() => {});
    server?.kill('SIGTERM');
  };

  process.on('SIGINT', () => { shutdown().finally(() => process.exit(130)); });
  process.on('SIGTERM', () => { shutdown().finally(() => process.exit(143)); });

  let fatalError = null;
  try {
    do {
      try {
        await captureCycle(browser, args.artifactDir);
      } catch (error) {
        fatalError = error;
        const failure = {
          status: 'failed',
          captured_at: new Date().toISOString(),
          base_url: BASE_URL,
          error: error.message,
        };
        await writeFile(path.join(args.artifactDir, 'latest.json'), `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
        console.error(error);
        if (args.once) throw error;
      }

      if (args.once) break;
      await delay(args.intervalMs);
    } while (true);
  } finally {
    await shutdown();
  }

  if (fatalError && args.once) {
    throw fatalError;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
