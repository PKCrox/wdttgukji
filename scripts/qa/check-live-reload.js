#!/usr/bin/env node

import path from 'node:path';
import { access, utimes } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BASE_URL = process.env.WDTT_LIVE_RELOAD_BASE_URL || 'http://127.0.0.1:3001/';
const VIEWPORT = { width: 1512, height: 982 };
const PROBE_FILE_CANDIDATES = [
  path.join(REPO_ROOT, 'public', 'old', 'js', 'app.js'),
  path.join(REPO_ROOT, 'public', 'js', 'app.js'),
];

async function resolveProbeFile() {
  for (const candidate of PROBE_FILE_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error(`Probe file not found: ${PROBE_FILE_CANDIDATES.join(', ')}`);
}

async function freshLoad(page) {
  console.log('[live-reload-check] fresh load');
  await page.goto(BASE_URL, { waitUntil: 'load' });
  await page.evaluate(() => {
    localStorage.removeItem('wdttgukji_save');
    localStorage.removeItem('wdttgukji_save_meta');
    sessionStorage.removeItem('__wdttgukji_live_reload_restore__');
  });
  await page.reload({ waitUntil: 'load' });
}

async function enterCommand(page) {
  console.log('[live-reload-check] enter command');
  await page.getByRole('button', { name: '적벽으로 들어간다' }).click();
  console.log('[live-reload-check] start clicked');
  await page.waitForSelector('.faction-card[data-faction="shu"]');
  console.log('[live-reload-check] faction screen ready');
  await page.evaluate(() => window.__wdttgukji.selectFaction('shu'));
  console.log('[live-reload-check] faction selected');
  await page.evaluate(() => window.__wdttgukji.showIntro());
  await page.waitForSelector('#intro-screen:not(.hidden)');
  console.log('[live-reload-check] intro ready');
  await page.evaluate(() => {
    for (let index = 0; index < 16; index += 1) window.__wdttgukji.advanceDialogue();
  });
  console.log('[live-reload-check] dialogue skipped');
  await page.evaluate(() => window.__wdttgukji.startGame());
  await page.waitForSelector('#game-screen:not(.hidden)');
  console.log('[live-reload-check] game screen ready');
  await page.evaluate(() => window.__wdttgukji.selectCity('jiangling'));
  await page.waitForFunction(() => document.getElementById('game-screen')?.classList.contains('selection-focus'));
  console.log('[live-reload-check] city selected');
  const commandOpened = await page.evaluate(() => window.__wdttgukji.openCommand('jiangling'));
  console.log(`[live-reload-check] openCommand returned: ${commandOpened}`);
  const immediateCommandState = await page.evaluate(() => ({
    modalHidden: document.getElementById('command-modal')?.classList.contains('hidden') ?? null,
    scene: document.getElementById('action-panel')?.dataset?.scene || null,
  }));
  console.log(`[live-reload-check] immediate modalHidden=${immediateCommandState.modalHidden} scene=${immediateCommandState.scene}`);
  await page.waitForFunction(() => !document.getElementById('command-modal')?.classList.contains('hidden'), { timeout: 5000 });
  console.log('[live-reload-check] modal visible');
  await page.waitForFunction(() => !!document.getElementById('action-panel')?.dataset?.scene, { timeout: 5000 });
  console.log('[live-reload-check] command modal ready');
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  const probeFile = await resolveProbeFile();

  try {
    await freshLoad(page);
    await enterCommand(page);
    console.log('[live-reload-check] command ready');

    const before = await page.evaluate(() => ({
      screen: window.__wdttgukji.getVisibleScreen(),
      city: window.__wdttgukji.getSelectedCity(),
      commandOpen: window.__wdttgukji.isCommandOpen(),
      commandScene: window.__wdttgukji.getCommandScene(),
    }));

    const now = new Date();
    console.log('[live-reload-check] touching probe file');
    await utimes(probeFile, now, now);

    console.log('[live-reload-check] waiting for reload badge');
    await page.getByText('변경 반영').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => !!window.__wdttgukji && !document.getElementById('command-modal')?.classList.contains('hidden'));
    await page.waitForFunction(
      (expectedScene) => document.getElementById('action-panel')?.dataset?.scene === expectedScene,
      before.commandScene,
    );
    console.log('[live-reload-check] restore ready');

    const after = await page.evaluate(() => ({
      screen: window.__wdttgukji.getVisibleScreen(),
      city: window.__wdttgukji.getSelectedCity(),
      commandOpen: window.__wdttgukji.isCommandOpen(),
      commandScene: window.__wdttgukji.getCommandScene(),
    }));

    const ok = before.screen === after.screen
      && before.city === after.city
      && before.commandOpen === after.commandOpen
      && before.commandScene === after.commandScene;

    if (!ok) {
      throw new Error(`Live reload restore mismatch: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
    }

    console.log(JSON.stringify({ ok: true, before, after }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
