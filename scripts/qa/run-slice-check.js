#!/usr/bin/env node

import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { chromium } from 'playwright';

const BASE_URL = 'http://127.0.0.1:3001/';
const SERVER_BOOT_TIMEOUT_MS = 10000;

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
      const resp = await fetch(url);
      if (resp.ok) return;
    } catch {}
    await delay(150);
  }
  throw new Error(`Dev server did not start within ${timeoutMs}ms`);
}

async function main() {
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
      cwd: process.cwd(),
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

  try {
    await waitForServer(BASE_URL, SERVER_BOOT_TIMEOUT_MS, serverState);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(BASE_URL);
    await page.evaluate(() => {
      localStorage.removeItem('wdttgukji_save');
      localStorage.removeItem('wdttgukji_save_meta');
    });
    await page.reload();

    const startFit = await page.evaluate(() => {
      const frame = document.querySelector('.stage-frame');
      const rect = frame?.getBoundingClientRect();
      return {
        width: rect?.width || 0,
        height: rect?.height || 0,
        top: rect?.top || 0,
        bottom: rect?.bottom || 0,
        left: rect?.left || 0,
        right: rect?.right || 0,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });

    await page.getByRole('button', { name: '적벽으로 들어간다' }).click();
    await page.waitForSelector('.faction-card[data-faction="shu"]');
    await page.evaluate(() => window.__wdttgukji.selectFaction('shu'));
    await page.evaluate(() => window.__wdttgukji.showIntro());
    await page.waitForSelector('#intro-screen:not(.hidden)');
    await page.evaluate(() => {
      for (let i = 0; i < 16; i += 1) window.__wdttgukji.advanceDialogue();
    });
    await page.evaluate(() => window.__wdttgukji.startGame());
    await page.waitForFunction(() => {
      const grid = document.getElementById('war-room-grid');
      const track = document.getElementById('war-room-session-track');
      return (grid?.childElementCount || 0) > 0 && (track?.childElementCount || 0) > 0;
    });
    const openingKicker = await page.locator('#war-room-kicker').textContent();
    const openingTitle = await page.locator('#war-room-title').textContent();
    const warRoomObjective = await page.locator('#war-room-objective').textContent();
    const warRoomGridText = await page.locator('#war-room-grid').textContent();
    const battlefieldFit = await page.evaluate(() => {
      const frame = document.querySelector('#game-screen .stage-frame');
      const rect = frame?.getBoundingClientRect();
      const warRoom = document.querySelector('.war-room-brief');
      const selection = document.querySelector('#map-selection-panel');
      return {
        width: rect?.width || 0,
        height: rect?.height || 0,
        top: rect?.top || 0,
        bottom: rect?.bottom || 0,
        left: rect?.left || 0,
        right: rect?.right || 0,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        warRoomBottom: warRoom?.getBoundingClientRect().bottom || 0,
        selectionTop: selection?.getBoundingClientRect().top || 0,
        selectionVisible: !!selection && !selection.classList.contains('hidden'),
      };
    });

    await page.evaluate(() => window.__wdttgukji.selectCity('jiangling'));
    await page.waitForFunction(() => {
      const title = document.getElementById('field-reaction-title');
      return !!title?.textContent?.trim() && title.textContent.trim() !== '전장을 정리 중입니다.';
    });
    await page.waitForFunction(() => document.getElementById('game-screen')?.classList.contains('selection-focus'));
    const fieldReactionTitle = await page.locator('#field-reaction-title').textContent();
    await page.evaluate(() => window.__wdttgukji.openCommand('jiangling', 'government'));
    await page.waitForFunction(() => {
      const bridge = document.getElementById('command-bridge');
      const candidate = document.getElementById('command-candidate-live');
      return !!bridge?.textContent?.trim() && !!candidate?.textContent?.trim();
    });
    const commandTitle = await page.locator('#action-panel-title').textContent();
    const commandBridgeText = await page.locator('#command-bridge').textContent();
    const commandCandidateText = await page.locator('#command-candidate-live').textContent();
    const commandSelectionStatus = await page.locator('#command-selection-status').textContent();
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__wdttgukji.runTurnForTest());
    await page.waitForFunction(() => {
      const turnLabel = document.getElementById('turn-display');
      const bridgeTitle = document.getElementById('turn-bridge-title');
      return turnLabel?.textContent?.trim() === '턴 2'
        && !!bridgeTitle?.textContent?.trim()
        && bridgeTitle.textContent.trim() !== '다음 달 전황으로 넘어갑니다.';
    });
    const turnBridgeTitle = await page.locator('#turn-bridge-title').textContent();
    await page.waitForFunction(() => {
      const title = document.getElementById('turn-start-title');
      const body = document.getElementById('turn-start-body');
      return !!title?.textContent?.trim()
        && title.textContent.trim() !== '다음 턴 목표를 정리 중입니다.'
        && !!body?.textContent?.trim();
    });
    const turnStartTitle = await page.locator('#turn-start-title').textContent();
    const turnStartBody = await page.locator('#turn-start-body').textContent();
    const saveMeta = await page.evaluate(() => JSON.parse(localStorage.getItem('wdttgukji_save_meta')));
    const yearLabel = await page.locator('#year-display').textContent();
    const turnLabel = await page.locator('#turn-display').textContent();

    await browser.close();

    const report = {
      consoleErrors,
      commandTitle: commandTitle?.trim() || '',
      commandBridgeText: commandBridgeText?.trim() || '',
      commandCandidateText: commandCandidateText?.trim() || '',
      commandSelectionStatus: commandSelectionStatus?.trim() || '',
      openingKicker: openingKicker?.trim() || '',
      openingTitle: openingTitle?.trim() || '',
      startFit,
      battlefieldFit,
      fieldReactionTitle: fieldReactionTitle?.trim() || '',
      turnBridgeTitle: turnBridgeTitle?.trim() || '',
      turnStartTitle: turnStartTitle?.trim() || '',
      turnStartBody: turnStartBody?.trim() || '',
      warRoomGridText: warRoomGridText?.trim() || '',
      warRoomObjective: warRoomObjective?.trim() || '',
      saveMeta,
      yearLabel,
      turnLabel,
    };

    const failedChecks = [];
    const addFailure = (name, details) => {
      failedChecks.push(details ? `${name}: ${details}` : name);
    };

    if (consoleErrors.length > 0) addFailure('console errors', consoleErrors.join(' | '));
    if (startFit.bottom > startFit.viewportHeight) addFailure('start fit', `bottom ${startFit.bottom} > viewport ${startFit.viewportHeight}`);
    if (battlefieldFit.bottom > battlefieldFit.viewportHeight) addFailure('battlefield fit', `bottom ${battlefieldFit.bottom} > viewport ${battlefieldFit.viewportHeight}`);
    if (battlefieldFit.top < 0) addFailure('battlefield fit', `top ${battlefieldFit.top} < 0`);
    if (battlefieldFit.left < 0) addFailure('battlefield fit', `left ${battlefieldFit.left} < 0`);
    if (battlefieldFit.right > battlefieldFit.viewportWidth) addFailure('battlefield fit', `right ${battlefieldFit.right} > viewport ${battlefieldFit.viewportWidth}`);
    if (battlefieldFit.selectionVisible && battlefieldFit.warRoomBottom >= battlefieldFit.selectionTop) {
      addFailure('battlefield layout', `war room bottom ${battlefieldFit.warRoomBottom} >= selection top ${battlefieldFit.selectionTop}`);
    }
    if (!report.warRoomObjective) addFailure('war room objective', 'war room objective remained empty');
    if (!report.warRoomGridText) addFailure('war room grid', 'war room grid remained empty');
    if (!report.commandBridgeText) addFailure('command bridge text', 'command bridge remained empty');
    if (!report.commandCandidateText) addFailure('command candidate text', 'command candidate remained empty');
    if (!report.commandSelectionStatus) addFailure('command selection status', 'command selection status remained empty');
    if (!report.openingKicker.includes('오프닝 액트')) addFailure('opening kicker', report.openingKicker || 'missing kicker text');
    if (!report.fieldReactionTitle) addFailure('field reaction title', 'missing field reaction title');
    if (!report.turnBridgeTitle) addFailure('turn bridge title', 'missing turn bridge title');
    if (!report.commandTitle) addFailure('command title', 'missing action panel title');
    if (!report.turnStartTitle) addFailure('turn start title', 'missing turn start title');
    if (!report.turnStartBody) addFailure('turn start body', 'missing turn start body');
    if (saveMeta?.turn !== 2) addFailure('save meta turn', `expected 2, got ${saveMeta?.turn ?? 'missing'}`);
    if (report.turnLabel?.trim() !== '턴 2') addFailure('turn label', report.turnLabel || 'missing turn label');

    report.failedChecks = failedChecks;

    console.log(JSON.stringify(report, null, 2));

    if (failedChecks.length > 0) {
      console.error(`slice check failed (${failedChecks.length}): ${failedChecks.join('; ')}`);
      process.exitCode = 1;
    }
  } finally {
    server?.kill('SIGTERM');
    if (stderr.trim()) process.stderr.write(stderr);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
