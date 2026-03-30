#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const PLAN_PATH = path.join(ROOT, 'scripts', 'orchestrate', 'strike-marathon.plan.json');
const RUNS_DIR = path.join(ROOT, 'runs', 'strike-marathons');

function timestampId(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
}

function parseArgs(argv) {
  const args = {
    preset: null,
    goal: null,
    printOnly: false,
    withoutSpark: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--preset') args.preset = argv[++index] || null;
    else if (token === '--goal') args.goal = argv[++index] || null;
    else if (token === '--without-spark') args.withoutSpark = true;
    else if (token === '--print-only') args.printOnly = true;
  }
  return args;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function focusArg(value) {
  if (value === 'battlefield') return 'battlefield';
  if (value === 'command') return 'command';
  if (value === 'start') return 'start';
  return value;
}

function launch(command, cwd = ROOT) {
  return new Promise((resolve) => {
    const child = spawn('/bin/zsh', ['-lc', command], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => resolve({ ok: code === 0, code: code ?? 1, stdout, stderr, command }));
  });
}

async function latestStrikeRunDir() {
  const base = path.join(ROOT, 'runs', 'strike-runs');
  const entries = await fs.readdir(base, { withFileTypes: true }).catch(() => []);
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  return dirs.length ? path.join(base, dirs.at(-1)) : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const plan = await readJson(PLAN_PATH);
  const presetId = args.preset || plan.defaultPreset;
  const preset = plan.presets[presetId];
  if (!preset) {
    throw new Error(`Unknown strike marathon preset: ${presetId}`);
  }

  const resolved = {
    preset: presetId,
    goal: args.goal || preset.goal,
    without_spark: args.withoutSpark,
    segments: preset.segments,
  };

  if (args.printOnly) {
    console.log(JSON.stringify(resolved, null, 2));
    return;
  }

  const runId = `strike-marathon-${timestampId()}`;
  const runDir = path.join(RUNS_DIR, runId);
  await ensureDir(runDir);

  const statePath = path.join(runDir, 'state.json');
  const logPath = path.join(runDir, 'run.log');
  const state = {
    run_id: runId,
    status: 'running',
    started_at: new Date().toISOString(),
    preset: presetId,
    goal: resolved.goal,
    without_spark: args.withoutSpark,
    current_segment: 0,
    segments: preset.segments.map((segment, index) => ({
      index: index + 1,
      focus: segment.focus,
      duration_minutes: segment.duration_minutes,
      checkpoint_minutes: segment.checkpoint_minutes,
      status: 'pending',
      strike_run_dir: null,
      started_at: null,
      completed_at: null,
    })),
  };
  await writeJson(statePath, state);
  await fs.writeFile(logPath, `start ${state.started_at} preset=${presetId}\n`, 'utf8');

  for (let index = 0; index < preset.segments.length; index += 1) {
    const segment = preset.segments[index];
    const stateSegment = state.segments[index];
    state.current_segment = index + 1;
    stateSegment.status = 'running';
    stateSegment.started_at = new Date().toISOString();
    await writeJson(statePath, state);
    await fs.appendFile(logPath, `segment ${index + 1} focus=${segment.focus} start ${stateSegment.started_at}\n`, 'utf8');

    const beforeLatest = await latestStrikeRunDir();
    const command = [
      'node scripts/orchestrate/run-strike-run.js',
      `--focus ${focusArg(segment.focus)}`,
      `--duration-minutes ${segment.duration_minutes}`,
      `--checkpoint-minutes ${segment.checkpoint_minutes}`,
      `--goal ${JSON.stringify(`${resolved.goal} :: ${segment.focus}`)}`,
      args.withoutSpark ? '--without-spark' : '',
    ].filter(Boolean).join(' ');

    const result = await launch(command, ROOT);
    const afterLatest = await latestStrikeRunDir();
    stateSegment.strike_run_dir = afterLatest && afterLatest !== beforeLatest ? afterLatest : afterLatest;
    stateSegment.completed_at = new Date().toISOString();
    stateSegment.status = result.ok ? 'completed' : 'failed';
    stateSegment.exit_code = result.code;
    stateSegment.stderr_tail = result.stderr.split('\n').filter(Boolean).slice(-20);
    await writeJson(statePath, state);
    await fs.appendFile(logPath, `segment ${index + 1} focus=${segment.focus} done ok=${result.ok} ${stateSegment.completed_at}\n`, 'utf8');

    if (!result.ok) {
      state.status = 'failed';
      state.failed_segment = index + 1;
      state.completed_at = new Date().toISOString();
      await writeJson(statePath, state);
      return;
    }
  }

  state.status = 'completed';
  state.completed_at = new Date().toISOString();
  await writeJson(statePath, state);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
