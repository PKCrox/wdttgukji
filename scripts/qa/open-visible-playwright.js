#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import {
  BASE_URL,
  callBridge,
  DESKTOP_VIEWPORT,
  ensureViteServer,
  enterBattlefield,
  enterCommand,
  freshStart,
  gotoApp,
  waitForRoute,
} from './phaser-playwright-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LOCK_PATH = path.join(REPO_ROOT, 'runs', 'playwright-visible.lock.json');

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
    appMode: 'phaser',
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

async function prepareScene(page, args) {
  if (args.fresh) {
    await freshStart(page, DESKTOP_VIEWPORT);
  } else {
    await gotoApp(page, DESKTOP_VIEWPORT);
  }

  if (args.scene === 'battlefield') {
    await enterBattlefield(page, args.faction);
    await callBridge(page, 'selectCity', 'xiangyang');
    return;
  }

  if (args.scene === 'command') {
    await enterCommand(page, { faction: args.faction, cityId: 'xiangyang', tab: 'government' });
    return;
  }

  await waitForRoute(page, 'start');
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
    ({ server } = await ensureViteServer(REPO_ROOT));

    browser = await chromium.launch({
      headless: false,
      args: [`--window-size=${DESKTOP_VIEWPORT.width},${DESKTOP_VIEWPORT.height}`],
    });
    const context = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
    const page = await context.newPage();

    page.on('pageerror', (error) => {
      console.error(`[pageerror] ${error.message}`);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') console.error(`[console.error] ${message.text()}`);
    });

    await prepareScene(page, args);

    console.log([
      'Visible Playwright ready.',
      'app_mode: phaser',
      `scene: ${args.scene}`,
      `url: ${BASE_URL}`,
      `viewport: ${DESKTOP_VIEWPORT.width}x${DESKTOP_VIEWPORT.height}`,
      'live_reload: vite hmr',
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
