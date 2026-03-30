#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IS_MAIN = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;

export const REPLAY_BY_AXIS = {
  'engine-slice': [
    { id: 'combat', script: 'scripts/qa/replay-combat.js' },
    { id: 'diplomacy', script: 'scripts/qa/replay-diplomacy.js' },
    { id: 'event-engine', script: 'scripts/qa/replay-event-engine.js' },
    { id: 'turn-loop', script: 'scripts/qa/replay-turn-loop.js' },
    { id: 'save-load', script: 'scripts/qa/replay-save-load.js' },
  ],
  autotest: [
    { id: 'combat', script: 'scripts/qa/replay-combat.js' },
    { id: 'diplomacy', script: 'scripts/qa/replay-diplomacy.js' },
    { id: 'event-engine', script: 'scripts/qa/replay-event-engine.js' },
    { id: 'turn-loop', script: 'scripts/qa/replay-turn-loop.js' },
    { id: 'save-load', script: 'scripts/qa/replay-save-load.js' },
  ],
};

function parseArgs(argv) {
  const args = {
    axis: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--axis') args.axis = argv[++index] || null;
  }

  if (!args.axis) throw new Error('--axis is required');
  return args;
}

function runNodeScript(scriptPath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

function parseJsonIfPossible(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function extractFailureDetails(result) {
  const source = result.stderr || result.stdout || '';
  const lines = source
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (!lines.length) {
    return {
      failure_summary: null,
      failure_excerpt: null,
    };
  }

  const preferredIndex = lines.findIndex((line) => (
    /AssertionError|TypeError|ReferenceError|SyntaxError|RangeError|Error:/.test(line)
  ));
  const startIndex = preferredIndex >= 0 ? preferredIndex : 0;
  const failure_summary = lines[startIndex];
  const failure_excerpt = lines.slice(startIndex, startIndex + 6).join('\n');

  return {
    failure_summary,
    failure_excerpt,
  };
}

async function main() {
  const { axis } = parseArgs(process.argv.slice(2));
  const selected = REPLAY_BY_AXIS[axis] || [];

  if (!selected.length) {
    console.log(JSON.stringify({
      status: 'skipped',
      axis,
      reason: 'no replay suite assigned for axis',
      checks: [],
    }, null, 2));
    return;
  }

  const checks = [];
  let failed = false;

  for (const entry of selected) {
    const absoluteScript = path.join(ROOT, entry.script);
    const result = await runNodeScript(absoluteScript);
    const report = parseJsonIfPossible(result.stdout);
    const failureDetails = !result.ok ? extractFailureDetails(result) : {
      failure_summary: null,
      failure_excerpt: null,
    };
    const check = {
      id: entry.id,
      script: entry.script,
      status: result.ok ? 'passed' : 'failed',
      code: result.code,
      report,
      stdout: report ? null : result.stdout.trim() || null,
      stderr: result.stderr.trim() || null,
      ...failureDetails,
    };
    checks.push(check);
    if (!result.ok) failed = true;
  }

  const failedChecks = checks
    .filter((check) => check.status === 'failed')
    .map((check) => ({
      id: check.id,
      script: check.script,
      code: check.code,
      failure_summary: check.failure_summary,
      failure_excerpt: check.failure_excerpt,
    }));

  const summary = {
    status: failed ? 'failed' : 'completed',
    axis,
    total_checks: checks.length,
    passed_check_ids: checks.filter((check) => check.status === 'passed').map((check) => check.id),
    failed_check_ids: failedChecks.map((check) => check.id),
    failed_checks: failedChecks,
    checks,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (failed) {
    process.exitCode = 1;
  }
}

if (IS_MAIN) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
