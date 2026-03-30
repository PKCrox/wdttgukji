#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LOCK_PATH = path.join(REPO_ROOT, 'runs', 'playwright-visible.lock.json');
const BASE_URL = process.env.WDTT_VISIBLE_BASE_URL || 'http://127.0.0.1:3001/';
const VIEWPORT = { width: 1512, height: 982 };
const SERVER_BOOT_TIMEOUT_MS = 10000;

function parseArgs(argv) {
  const args = {
    replace: false,
    fresh: true,
    scene: 'start',
    faction: 'shu',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--replace') args.replace = true;
    else if (token === '--no-fresh') args.fresh = false;
    else if (token === '--scene') args.scene = argv[++index] || args.scene;
    else if (token === '--faction') args.faction = argv[++index] || args.faction;
  }

  if (!['start', 'battlefield', 'command'].includes(args.scene)) {
    throw new Error(`Unsupported --scene value: ${args.scene}`);
  }

  return args;
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
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

async function ensureServer() {
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
      cwd: REPO_ROOT,
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
  return { server, serverState };
}

async function ensureRepoRoot() {
  const packageJson = await readJson(path.join(REPO_ROOT, 'package.json'));
  if (packageJson.name !== 'wdttgukji') {
    throw new Error(`Unexpected package name: ${packageJson.name}`);
  }

  const cwd = path.resolve(process.cwd());
  if (cwd !== REPO_ROOT) {
    throw new Error([
      'Visible Playwright must be launched from the wdttgukji repo root.',
      `cwd: ${cwd}`,
      `expected: ${REPO_ROOT}`,
    ].join('\n'));
  }
}

async function acquireLock(scene, replace) {
  await mkdir(path.dirname(LOCK_PATH), { recursive: true });

  try {
    const lock = await readJson(LOCK_PATH);
    if (isProcessAlive(lock.pid)) {
      if (!replace) {
        throw new Error(
          `Visible Playwright session already active (pid ${lock.pid}, scene ${lock.scene || 'start'}). Re-run with --replace to recycle it.`,
        );
      }
      process.kill(lock.pid, 'SIGTERM');
      for (let index = 0; index < 10; index += 1) {
        if (!isProcessAlive(lock.pid)) break;
        await delay(150);
      }
      if (isProcessAlive(lock.pid)) process.kill(lock.pid, 'SIGKILL');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const payload = {
    pid: process.pid,
    scene,
    cwd: REPO_ROOT,
    startedAt: new Date().toISOString(),
  };
  await writeFile(LOCK_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function releaseLock() {
  try {
    const lock = await readJson(LOCK_PATH);
    if (lock.pid === process.pid) {
      await rm(LOCK_PATH, { force: true });
    }
  } catch {}
}

async function freshLoad(page) {
  await page.goto(BASE_URL, { waitUntil: 'load' });
  await page.evaluate(() => {
    localStorage.removeItem('wdttgukji_save');
    localStorage.removeItem('wdttgukji_save_meta');
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.stage-frame');
}

async function enterBattlefield(page, faction) {
  await page.getByRole('button', { name: '적벽으로 들어간다' }).click();
  await page.waitForSelector(`.faction-card[data-faction="${faction}"]`);
  await page.evaluate((targetFaction) => window.__wdttgukji.selectFaction(targetFaction), faction);
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
}

async function enterCommand(page) {
  await page.evaluate(() => window.__wdttgukji.selectCity('jiangling'));
  await page.waitForFunction(() => {
    const title = document.getElementById('field-reaction-title');
    return !!title?.textContent?.trim() && title.textContent.trim() !== '전장을 정리 중입니다.';
  });
  await page.waitForFunction(() => document.getElementById('game-screen')?.classList.contains('selection-focus'));
  await page.evaluate(() => window.__wdttgukji.openCommand('jiangling', 'government'));
  await page.waitForFunction(() => {
    const bridge = document.getElementById('command-bridge');
    const candidate = document.getElementById('command-candidate-live');
    return !!bridge?.textContent?.trim() && !!candidate?.textContent?.trim();
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await ensureRepoRoot();
  await acquireLock(args.scene, args.replace);

  let browser;
  let server;

  const cleanup = async () => {
    await releaseLock();
    await browser?.close().catch(() => {});
    server?.kill('SIGTERM');
  };

  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await cleanup();
    process.exit(0);
  });

  try {
    ({ server } = await ensureServer());

    browser = await chromium.launch({
      headless: false,
      args: [`--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
    });
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();

    page.on('pageerror', (error) => {
      console.error(`[pageerror] ${error.message}`);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') console.error(`[console.error] ${message.text()}`);
    });

    if (args.fresh) await freshLoad(page);
    else await page.goto(BASE_URL, { waitUntil: 'load' });

    if (args.scene === 'battlefield' || args.scene === 'command') {
      await enterBattlefield(page, args.faction);
    }
    if (args.scene === 'command') {
      await enterCommand(page);
    }

    console.log([
      'Visible Playwright ready.',
      `scene: ${args.scene}`,
      `url: ${BASE_URL}`,
      `viewport: ${VIEWPORT.width}x${VIEWPORT.height}`,
      'live_reload: on (source patch -> auto reload -> scene restore)',
      'Keep this process running while you inspect the browser. Press Ctrl+C to close it.',
    ].join('\n'));

    await new Promise(() => {});
  } catch (error) {
    await cleanup();
    throw error;
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
