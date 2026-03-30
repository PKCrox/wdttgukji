#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

async function readJson(filePath) {
  const { readFile } = await import('node:fs/promises');
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function ensureRepoRoot() {
  const cwd = path.resolve(process.cwd());
  if (cwd !== REPO_ROOT) {
    throw new Error([
      'Run `ui:pass:verify` from the wdttgukji repo root.',
      `cwd: ${cwd}`,
      `expected: ${REPO_ROOT}`,
    ].join('\n'));
  }

  const packageJson = await readJson(path.join(REPO_ROOT, 'package.json'));
  if (packageJson.name !== 'wdttgukji') {
    throw new Error(`Unexpected package name: ${packageJson.name}`);
  }
}

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed: node ${args.join(' ')} (${signal || code})`));
    });
  });
}

async function main() {
  await ensureRepoRoot();
  console.log('wdttgukji UI verify');
  console.log('1. slice check');
  await runNode(['scripts/qa/run-slice-check.js']);
  console.log('2. app surface audit');
  await runNode(['scripts/qa/watch-app-surface.js', '--once']);
  console.log('ui verify complete');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
