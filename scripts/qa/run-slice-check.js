#!/usr/bin/env node

import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { chromium } from 'playwright';

const BASE_URL = 'http://127.0.0.1:3001/';
const SERVER_BOOT_TIMEOUT_MS = 10000;

async function waitForServer(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
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

  try {
    await waitForServer(BASE_URL, 400);
  } catch {
    server = spawn(process.execPath, ['server.js'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
  }

  try {
    await waitForServer(BASE_URL, SERVER_BOOT_TIMEOUT_MS);

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
    const openingKicker = await page.locator('#war-room-kicker').textContent();
    const openingTitle = await page.locator('#war-room-title').textContent();
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
      };
    });

    const before = await page.evaluate(() => window.__wdttgukji.getMapCamera());
    const canvas = await page.locator('#game-map').boundingBox();
    if (!canvas) throw new Error('Game map bounding box missing');
    const fromX = canvas.x + canvas.width * 0.5;
    const fromY = canvas.y + canvas.height * 0.5;
    await page.mouse.move(fromX, fromY);
    await page.mouse.down();
    await page.mouse.move(fromX - 140, fromY + 40, { steps: 12 });
    await page.mouse.up();
    const after = await page.evaluate(() => window.__wdttgukji.getMapCamera());

    await page.evaluate(() => window.__wdttgukji.selectCity('jiangling'));
    await page.waitForSelector('#field-reaction-banner.visible');
    const fieldReactionTitle = await page.locator('#field-reaction-title').textContent();
    await page.evaluate(() => window.__wdttgukji.openCommand('jiangling', 'government'));
    const commandTitle = await page.locator('#action-panel-title').textContent();
    const openingChipCount = await page.locator('.opening-command-chip').count();
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__wdttgukji.runTurnForTest());
    const turnBridgeTitle = await page.locator('#turn-bridge-title').textContent();
    await page.waitForSelector('#turn-start-card.visible');
    const turnStartTitle = await page.locator('#turn-start-title').textContent();
    const turnStartBody = await page.locator('#turn-start-body').textContent();
    const saveMeta = await page.evaluate(() => JSON.parse(localStorage.getItem('wdttgukji_save_meta')));
    const yearLabel = await page.locator('#year-display').textContent();
    const turnLabel = await page.locator('#turn-display').textContent();

    await browser.close();

    const report = {
      consoleErrors,
      commandTitle: commandTitle?.trim() || '',
      dragPanChanged: Math.abs(after.panX - before.panX) > 1 || Math.abs(after.panY - before.panY) > 1,
      openingKicker: openingKicker?.trim() || '',
      openingTitle: openingTitle?.trim() || '',
      openingChipCount,
      startFit,
      battlefieldFit,
      fieldReactionTitle: fieldReactionTitle?.trim() || '',
      turnBridgeTitle: turnBridgeTitle?.trim() || '',
      turnStartTitle: turnStartTitle?.trim() || '',
      turnStartBody: turnStartBody?.trim() || '',
      saveMeta,
      yearLabel,
      turnLabel,
    };

    console.log(JSON.stringify(report, null, 2));

    if (
      consoleErrors.length > 0 ||
      startFit.bottom > startFit.viewportHeight ||
      battlefieldFit.bottom > battlefieldFit.viewportHeight ||
      battlefieldFit.top < 0 ||
      battlefieldFit.left < 0 ||
      battlefieldFit.right > battlefieldFit.viewportWidth ||
      battlefieldFit.warRoomBottom >= battlefieldFit.selectionTop ||
      !report.dragPanChanged ||
      !report.openingKicker.includes('오프닝 액트') ||
      report.openingChipCount < 1 ||
      !report.fieldReactionTitle ||
      !report.turnBridgeTitle ||
      !report.commandTitle ||
      !report.turnStartTitle ||
      !report.turnStartBody ||
      saveMeta?.turn !== 2 ||
      report.turnLabel?.trim() !== '턴 2'
    ) {
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
