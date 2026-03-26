#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

function parseArgs(argv) {
  const args = {
    durationHours: 8,
    batchIterations: 3,
    passes: 10,
    profile: 'wdttgukji-product-core',
    goal: 'sustained factory long run',
    reviewInterval: 5,
    continueOnFailure: true,
    includeHybrid: false,
    splitFactoryGame: false,
    factoryHours: 4,
    gameHours: 4,
    factoryProfile: 'wdttgukji-diagnostic',
    gameProfile: 'wdttgukji-product-core',
    factoryBatchIterations: 3,
    gameBatchIterations: 3,
    factoryPasses: 10,
    gamePasses: 10,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--duration-hours') args.durationHours = Number(argv[++i] || 8);
    else if (token === '--batch-iterations') args.batchIterations = Number(argv[++i] || 3);
    else if (token === '--passes') args.passes = Number(argv[++i] || 10);
    else if (token === '--profile') args.profile = argv[++i] || args.profile;
    else if (token === '--goal') args.goal = argv[++i] || args.goal;
    else if (token === '--review-interval') args.reviewInterval = Number(argv[++i] || 5);
    else if (token === '--continue-on-failure') args.continueOnFailure = true;
    else if (token === '--include-hybrid') args.includeHybrid = true;
    else if (token === '--split-factory-game') args.splitFactoryGame = true;
    else if (token === '--factory-hours') args.factoryHours = Number(argv[++i] || 4);
    else if (token === '--game-hours') args.gameHours = Number(argv[++i] || 4);
    else if (token === '--factory-profile') args.factoryProfile = argv[++i] || args.factoryProfile;
    else if (token === '--game-profile') args.gameProfile = argv[++i] || args.gameProfile;
    else if (token === '--factory-batch-iterations') args.factoryBatchIterations = Number(argv[++i] || 3);
    else if (token === '--game-batch-iterations') args.gameBatchIterations = Number(argv[++i] || 3);
    else if (token === '--factory-passes') args.factoryPasses = Number(argv[++i] || 10);
    else if (token === '--game-passes') args.gamePasses = Number(argv[++i] || 10);
  }

  if (!Number.isFinite(args.durationHours) || args.durationHours <= 0) {
    throw new Error(`Invalid --duration-hours value: ${args.durationHours}`);
  }
  if (!Number.isFinite(args.batchIterations) || args.batchIterations < 1) {
    throw new Error(`Invalid --batch-iterations value: ${args.batchIterations}`);
  }
  if (!Number.isFinite(args.passes) || args.passes < 1) {
    throw new Error(`Invalid --passes value: ${args.passes}`);
  }
  if (!Number.isFinite(args.reviewInterval) || args.reviewInterval < 1) {
    throw new Error(`Invalid --review-interval value: ${args.reviewInterval}`);
  }

  return args;
}

function buildPhases(args) {
  if (!args.splitFactoryGame) {
    return [{
      id: 'default',
      label: 'default',
      durationHours: args.durationHours,
      profile: args.profile,
      batchIterations: args.batchIterations,
      passes: args.passes,
      goal: args.goal,
      env: {},
    }];
  }

  return [
    {
      id: 'factory',
      label: 'factory',
      durationHours: args.factoryHours,
      profile: args.factoryProfile,
      batchIterations: args.factoryBatchIterations,
      passes: args.factoryPasses,
      goal: `${args.goal} :: factory phase`,
      env: {
        WDTT_RUNTIME_MUTATION_MODE: 'product-core',
        WDTT_RUNTIME_ALLOW_APP_SURFACE: 'false',
      },
    },
    {
      id: 'game',
      label: 'game',
      durationHours: args.gameHours,
      profile: args.gameProfile,
      batchIterations: args.gameBatchIterations,
      passes: args.gamePasses,
      goal: `${args.goal} :: game phase`,
      env: {
        WDTT_RUNTIME_MUTATION_MODE: 'full',
        WDTT_RUNTIME_ALLOW_APP_SURFACE: 'true',
      },
    },
  ];
}

function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function appendLog(filePath, line) {
  await fs.appendFile(filePath, `${new Date().toISOString()} ${line}\n`, 'utf8');
}

function runCommand(command, cwd, envOverrides = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: {
        ...process.env,
        ...envOverrides,
      },
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

async function runAndCapture(command, cwd, prefix, envOverrides = {}) {
  const result = await runCommand(command, cwd, envOverrides);
  await fs.writeFile(`${prefix}.stdout.log`, result.stdout, 'utf8');
  await fs.writeFile(`${prefix}.stderr.log`, result.stderr, 'utf8');
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const runId = `long-run-${timestamp()}`;
  const runDir = path.join(rootDir, 'runs', 'long-runs', runId);
  const commandsDir = path.join(runDir, 'commands');
  const logPath = path.join(runDir, 'long-run.log');
  await ensureDir(commandsDir);

  const phases = buildPhases(args);
  const startedAt = new Date();
  const totalHours = phases.reduce((acc, phase) => acc + phase.durationHours, 0);
  const deadlineAt = new Date(startedAt.getTime() + (totalHours * 60 * 60 * 1000));
  const state = {
    long_run_id: runId,
    profile: args.profile,
    goal: args.goal,
    duration_hours: totalHours,
    batch_iterations: args.batchIterations,
    passes_per_batch: args.passes,
    review_interval: args.reviewInterval,
    continue_on_failure: args.continueOnFailure,
    include_hybrid: args.includeHybrid,
    split_factory_game: args.splitFactoryGame,
    phases,
    started_at: startedAt.toISOString(),
    deadline_at: deadlineAt.toISOString(),
    status: 'running',
    completed_batches: 0,
    batches: [],
  };

  await writeJson(path.join(runDir, 'state.json'), state);
  await appendLog(logPath, `long run started: ${runId}`);

  let batchIndex = 0;
  let phaseCursor = startedAt.getTime();
  for (const phase of phases) {
    const phaseDeadline = phaseCursor + (phase.durationHours * 60 * 60 * 1000);
    await appendLog(logPath, `phase ${phase.label} started with profile ${phase.profile}`);

    while (Date.now() < phaseDeadline) {
      batchIndex += 1;
      const remainingMs = phaseDeadline - Date.now();
      const remainingMinutes = Math.max(0, Math.round(remainingMs / 60000));
      const batchCommand = [
        'node scripts/orchestrate/iterate-pass-runs.js',
        `--iterations ${phase.batchIterations}`,
        `--passes ${phase.passes}`,
        `--profile ${phase.profile}`,
        `--review-interval ${args.reviewInterval}`,
        `--goal "${phase.goal} :: batch ${batchIndex}"`,
      ];
      if (args.continueOnFailure) batchCommand.push('--continue-on-failure');
      if (args.includeHybrid) batchCommand.push('--include-hybrid');

      await appendLog(logPath, `batch ${batchIndex} [${phase.label}] starting with ~${remainingMinutes} minutes remaining in phase`);
      const prefix = path.join(commandsDir, `batch-${String(batchIndex).padStart(3, '0')}`);
      const result = await runAndCapture(batchCommand.join(' '), rootDir, prefix, phase.env || {});

      let summary = null;
      try {
        summary = JSON.parse(result.stdout.trim());
      } catch {
        summary = {
          status: result.ok ? 'completed_without_json_summary' : 'failed_without_json_summary',
        };
      }

      const batchRecord = {
        batch: batchIndex,
        phase: phase.label,
        profile: phase.profile,
        env: phase.env || {},
        finished_at: new Date().toISOString(),
        ok: result.ok,
        summary,
        stdout_log: path.relative(runDir, `${prefix}.stdout.log`),
        stderr_log: path.relative(runDir, `${prefix}.stderr.log`),
      };
      state.batches.push(batchRecord);
      state.completed_batches = batchIndex;
      await writeJson(path.join(runDir, 'state.json'), state);
      await appendLog(logPath, `batch ${batchIndex} [${phase.label}] completed with status ${summary.status || (result.ok ? 'ok' : 'failed')}`);

      if (!result.ok && !args.continueOnFailure) {
        state.status = 'stopped_on_failure';
        break;
      }
    }

    phaseCursor = phaseDeadline;
    await appendLog(logPath, `phase ${phase.label} finished`);
    if (state.status === 'stopped_on_failure') break;
  }

  if (state.status === 'running') {
    state.status = 'completed';
  }
  state.completed_at = new Date().toISOString();
  await writeJson(path.join(runDir, 'state.json'), state);
  await appendLog(logPath, `long run finished with status ${state.status}`);

  console.log(JSON.stringify({
    long_run_id: runId,
    status: state.status,
    run_dir: runDir,
    completed_batches: state.completed_batches,
    deadline_at: state.deadline_at,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
