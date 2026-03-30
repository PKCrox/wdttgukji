#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const RUNS_DIR = path.join(ROOT, 'runs', 'strike-marathons');

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function latestRunDir() {
  const entries = await fs.readdir(RUNS_DIR, { withFileTypes: true }).catch(() => []);
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (!dirs.length) return null;
  return path.join(RUNS_DIR, dirs.at(-1));
}

async function main() {
  const runDir = process.argv[2] ? path.resolve(process.argv[2]) : await latestRunDir();
  if (!runDir) {
    console.log(JSON.stringify({ status: 'missing', reason: 'no strike marathon found' }, null, 2));
    return;
  }

  const state = await readJson(path.join(runDir, 'state.json'));
  console.log(JSON.stringify({
    run_dir: runDir,
    run_id: state.run_id,
    status: state.status,
    preset: state.preset,
    goal: state.goal,
    current_segment: state.current_segment,
    segments: (state.segments || []).map((segment) => ({
      index: segment.index,
      focus: segment.focus,
      status: segment.status,
      strike_run_dir: segment.strike_run_dir,
      started_at: segment.started_at,
      completed_at: segment.completed_at,
      exit_code: segment.exit_code ?? null,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
