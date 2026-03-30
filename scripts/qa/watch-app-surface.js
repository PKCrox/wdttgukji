#!/usr/bin/env node

import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import {
  BASE_URL,
  DESKTOP_VIEWPORT,
  MOBILE_VIEWPORT,
  callBridge,
  collectAudit,
  ensureViteServer,
  enterBattlefield,
  freshStart,
} from './phaser-playwright-helpers.js';

const DEFAULT_ARTIFACT_DIR = path.resolve('runs/live-spectator');
const DEFAULT_INTERVAL_MS = 15000;
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

async function archiveLatest(sourcePath, latestPath, archivePath) {
  await copyFile(sourcePath, latestPath);
  await copyFile(sourcePath, archivePath);
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
    if (!scene.canvasFitsViewport) {
      failures.push(`${viewportLabel}/${sceneName}: phaser canvas exceeds viewport bounds`);
    }
    if (sceneName === 'start' && scene.route !== 'start') {
      failures.push(`${viewportLabel}/start: route is ${scene.route || 'missing'}`);
    }
    if (sceneName === 'battlefield') {
      if (scene.route !== 'battlefield') failures.push(`${viewportLabel}/battlefield: route is ${scene.route || 'missing'}`);
      if (!scene.selectedCity) failures.push(`${viewportLabel}/battlefield: no city is selected`);
    }
    if (sceneName === 'command') {
      if (scene.route !== 'command') failures.push(`${viewportLabel}/command: route is ${scene.route || 'missing'}`);
      if (!scene.actionPanel?.open) failures.push(`${viewportLabel}/command: action panel is not open`);
      if (!scene.commandPanelFitsViewport) failures.push(`${viewportLabel}/command: action panel exceeds 1600x900 scene bounds`);
    }
  }
  return failures;
}

async function runFlow(page, { capturePaths = null } = {}) {
  await freshStart(page, page.viewportSize() || DESKTOP_VIEWPORT);

  const startAudit = await collectAudit(page, 'start', FORBIDDEN_VISIBLE_TERMS, GENERATED_SELECTOR_LIST);
  if (capturePaths?.start) {
    await page.screenshot({ path: capturePaths.start, fullPage: true });
  }

  await enterBattlefield(page, 'shu');
  await page.evaluate(() => window.__wdttgukjiPhaser.selectCity('xiangyang'));
  const battlefieldAudit = await collectAudit(page, 'battlefield', FORBIDDEN_VISIBLE_TERMS, GENERATED_SELECTOR_LIST);
  if (capturePaths?.battlefield) {
    await page.screenshot({ path: capturePaths.battlefield, fullPage: true });
  }

  await callBridge(page, 'openActionPanel', 'xiangyang', 'government');
  await page.waitForFunction(() => {
    const snapshot = window.__wdttgukjiPhaser?.getSnapshot?.();
    return snapshot?.route === 'command' && snapshot?.actionPanel?.open === true;
  }, undefined, { timeout: 5000 });
  const commandAudit = await collectAudit(page, 'command', FORBIDDEN_VISIBLE_TERMS, GENERATED_SELECTOR_LIST);
  if (capturePaths?.command) {
    await page.screenshot({ path: capturePaths.command, fullPage: true });
  }

  const meta = await page.evaluate(() => window.__wdttgukjiPhaser.getSnapshot());

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
  const mobileContext = await browser.newContext({
    viewport: { width: MOBILE_VIEWPORT.width, height: MOBILE_VIEWPORT.height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: MOBILE_VIEWPORT.deviceScaleFactor,
  });
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

    const failures = [
      ...buildAuditFailures(desktop, 'desktop'),
      ...buildAuditFailures(mobile, 'mobile'),
    ];

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
      app_mode: 'phaser',
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
    console.log(JSON.stringify(summary, null, 2));

    if (failures.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await desktopContext.close();
    await mobileContext.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(args.artifactDir, { recursive: true });

  const { server } = await ensureViteServer(process.cwd());
  const browser = await chromium.launch({ headless: true });

  try {
    do {
      await captureCycle(browser, args.artifactDir);
      if (args.once) break;
      await delay(args.intervalMs);
    } while (true);
  } finally {
    await browser.close();
    server?.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
