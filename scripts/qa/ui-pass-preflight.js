#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const EXPECTED_REPO_NAME = 'wdttgukji';
const EXPECTED_VIEWPORT = '1512x982';
const LOCK_PATH = path.join(REPO_ROOT, 'runs', 'playwright-visible.lock.json');

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

async function main() {
  const packageJson = await readJson(path.join(REPO_ROOT, 'package.json'));
  if (packageJson.name !== EXPECTED_REPO_NAME) {
    throw new Error(`Unexpected package name: ${packageJson.name}`);
  }

  const cwd = path.resolve(process.cwd());
  const root = path.resolve(REPO_ROOT);
  if (cwd !== root) {
    throw new Error([
      'Run this preflight from the wdttgukji repo root.',
      `cwd: ${cwd}`,
      `expected: ${root}`,
    ].join('\n'));
  }

  let visibleSession = 'none';
  try {
    const lock = await readJson(LOCK_PATH);
    visibleSession = isProcessAlive(lock.pid)
      ? `active pid=${lock.pid} scene=${lock.scene || 'start'}`
      : `stale lock pid=${lock.pid}`;
  } catch {}

  const lines = [
    'wdttgukji UI pass preflight',
    `repo: ${root}`,
    `viewport: ${EXPECTED_VIEWPORT} (MacBook 14 contract)`,
    `visible_playwright: ${visibleSession}`,
    'primary_specialists: ux-stage-director, map-art-director, content-planner',
    'defer_specialist: qa-persona-simulator (after fit/map/tone stabilize)',
    'execution_order: visible browser -> inspect -> patch -> visible browser re-check -> qa:slice/watch-app-surface',
    'next_commands:',
    '  npm run qa:visible -- --scene start',
    '  npm run qa:visible -- --scene battlefield --replace',
  ];

  console.log(lines.join('\n'));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
