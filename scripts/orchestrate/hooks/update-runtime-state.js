#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

const RUNTIME_STATE_PATH = path.join(process.cwd(), 'scripts', 'orchestrate', 'generated', 'runtime-state.json');
const FACTORY_RUNTIME_SUMMARY_PATH = path.join(process.cwd(), 'scripts', 'orchestrate', 'generated', 'factory-runtime-summary.json');

function parseArgs(argv) {
  const args = {
    axis: null,
    runDir: null,
    passJson: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--axis') args.axis = argv[++i] || null;
    else if (token === '--run-dir') args.runDir = argv[++i] || null;
    else if (token === '--pass-json') args.passJson = argv[++i] || null;
  }

  if (!args.axis) throw new Error('--axis is required');
  if (!args.runDir) throw new Error('--run-dir is required');
  if (!args.passJson) throw new Error('--pass-json is required');
  return args;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJsonOrDefault(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const passRecord = JSON.parse(await fs.readFile(args.passJson, 'utf8'));
  const runStatePath = path.join(args.runDir, 'state.json');
  const runState = JSON.parse(await fs.readFile(runStatePath, 'utf8'));
  const runtimeState = await readJsonOrDefault(RUNTIME_STATE_PATH, {
    updated_at: null,
    last_run_id: null,
    persistentBoostAxes: [],
    lastCheckpointReview: null,
    axisStatus: {},
  });

  const latestReview = Array.isArray(runState.reviews) && runState.reviews.length
    ? runState.reviews[runState.reviews.length - 1]
    : null;

  runtimeState.updated_at = new Date().toISOString();
  runtimeState.last_run_id = runState.run_id;
  runtimeState.lastCheckpointReview = latestReview;
  runtimeState.persistentBoostAxes = latestReview?.boost_axes || [];
  runtimeState.axisStatus = {
    ...runtimeState.axisStatus,
    [args.axis]: {
      updated_at: runtimeState.updated_at,
      run_id: runState.run_id,
      pass_index: passRecord.index,
      candidate: passRecord.candidate.id,
      status: passRecord.status,
      chosen_next_pass: passRecord.reprioritized?.chosen_next_pass || null,
      dominant_bottleneck: passRecord.reprioritized?.dominant_bottleneck || null,
      command_summary: passRecord.reprioritized?.command_summary || null,
    },
  };

  await ensureDir(path.dirname(RUNTIME_STATE_PATH));
  await fs.writeFile(RUNTIME_STATE_PATH, `${JSON.stringify(runtimeState, null, 2)}\n`, 'utf8');
  await ensureDir(path.dirname(FACTORY_RUNTIME_SUMMARY_PATH));
  await fs.writeFile(FACTORY_RUNTIME_SUMMARY_PATH, `${JSON.stringify({
    updatedAt: runtimeState.updated_at,
    lastRunId: runtimeState.last_run_id,
    persistentBoostAxes: runtimeState.persistentBoostAxes || [],
    axisStatus: runtimeState.axisStatus || {},
  }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    output: RUNTIME_STATE_PATH,
    summary_output: FACTORY_RUNTIME_SUMMARY_PATH,
    persistentBoostAxes: runtimeState.persistentBoostAxes,
    axis: args.axis,
    status: 'updated',
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
