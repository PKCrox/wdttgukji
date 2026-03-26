#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { getProfile } from '../pass-profiles.js';
import { getRuntimeConfig, assertRuntimeConfig } from './config.js';
import { RuntimeStore } from './db.js';
import { RuntimeQueue } from './queue.js';
import { resolveMutationPolicy } from './policy.js';
import { chooseCandidate, buildCheckpointReview, summarizePass } from './pass-selection.js';
import { compilePassGraph } from './graph.js';
import { exportRunArtifacts } from './exporter.js';
import { writeVersionSnapshot } from '../versioning.js';

const AGENT_ROUTING_STATE_PATH = path.join(process.cwd(), 'scripts', 'orchestrate', 'generated', 'agent-routing-state.json');

function parseArgs(argv) {
  const args = {
    passes: 1,
    profile: 'wdttgukji-product-core',
    goal: 'durable adaptive pass run',
    continueOnFailure: false,
    reviewInterval: 5,
    inlineWorkers: 0,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--passes') args.passes = Number(argv[++i] || 1);
    else if (token === '--profile') args.profile = argv[++i] || args.profile;
    else if (token === '--goal') args.goal = argv[++i] || args.goal;
    else if (token === '--continue-on-failure') args.continueOnFailure = true;
    else if (token === '--review-interval') args.reviewInterval = Number(argv[++i] || 5);
    else if (token === '--inline-workers') args.inlineWorkers = Number(argv[++i] || 0);
  }

  return args;
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
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function readAgentRoutingState() {
  try {
    return JSON.parse(await fs.readFile(AGENT_ROUTING_STATE_PATH, 'utf8'));
  } catch {
    return {
      updated_at: null,
      laneUrgency: {},
      laneDiagnostics: {},
      pendingAgents: [],
    };
  }
}

async function appendRunLog(runDir, line) {
  await fs.appendFile(path.join(runDir, 'runtime.log'), `${new Date().toISOString()} ${line}\n`, 'utf8');
}

function runCommand(command, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
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

async function runAndCapture(command, cwd, outputBase) {
  const result = await runCommand(command, cwd);
  await fs.writeFile(`${outputBase}.stdout.log`, result.stdout, 'utf8');
  await fs.writeFile(`${outputBase}.stderr.log`, result.stderr, 'utf8');
  return result;
}

async function writeRuntimeStateArtifacts(rootDir, runId, reviewHints, passState) {
  const generatedDir = path.join(rootDir, 'scripts', 'orchestrate', 'generated');
  const runtimeStatePath = path.join(generatedDir, 'runtime-state.json');
  const summaryPath = path.join(generatedDir, 'factory-runtime-summary.json');
  const axisStatus = passState.passes.reduce((acc, entry) => {
    acc[entry.candidate.axis] = {
      updated_at: new Date().toISOString(),
      run_id: runId,
      pass_index: entry.index,
      candidate: entry.candidate.id,
      status: entry.status,
      chosen_next_pass: entry.reprioritized?.chosen_next_pass || null,
      dominant_bottleneck: entry.reprioritized?.dominant_bottleneck || null,
      command_summary: entry.reprioritized?.command_summary || null,
    };
    return acc;
  }, {});
  const runtimeState = {
    updated_at: new Date().toISOString(),
    last_run_id: runId,
    persistentBoostAxes: reviewHints.boostAxes || [],
    lastCheckpointReview: passState.reviews.at(-1) || null,
    axisStatus,
  };
  await writeJson(runtimeStatePath, runtimeState);
  await writeJson(summaryPath, {
    updatedAt: runtimeState.updated_at,
    lastRunId: runtimeState.last_run_id,
    persistentBoostAxes: runtimeState.persistentBoostAxes,
    axisStatus: runtimeState.axisStatus,
  });
}

async function pollPassCompletion(store, queue, passId, pollMs) {
  while (true) {
    const overview = await store.getPassOverview(passId);
    const total = Number(overview.total || 0);
    const completed = Number(overview.completed || 0);
    const softFailed = Number(overview.soft_failed || 0);
    const failed = Number(overview.failed || 0);
    const cancelled = Number(overview.cancelled || 0);
    const done = completed + softFailed + failed + cancelled;
    if (failed > 0 || done >= total) {
      return {
        total,
        completed,
        softFailed,
        failed,
        cancelled,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

function spawnInlineWorkers(count) {
  const workers = [];
  for (let index = 0; index < count; index += 1) {
    workers.push(spawn(
      'node',
      ['scripts/orchestrate/runtime/worker.js', '--worker-id', `inline-${process.pid}-${index + 1}`],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: 'inherit',
      }
    ));
  }
  return workers;
}

async function stopInlineWorkers(workers) {
  await Promise.all(workers.map((worker) => new Promise((resolve) => {
    worker.once('exit', () => resolve());
    worker.kill('SIGTERM');
    setTimeout(() => {
      if (!worker.killed) worker.kill('SIGKILL');
    }, 2000);
  })));
}

async function runAgentEvolutionPostpass(runDir, rootDir) {
  const commandsDir = path.join(runDir, 'commands');
  await ensureDir(commandsDir);
  const fitnessResult = await runAndCapture(
    `node scripts/orchestrate/analyze-agent-fitness.js --run-dir ${runDir}`,
    rootDir,
    path.join(commandsDir, 'agent-fitness')
  );
  const gapsResult = await runAndCapture(
    `node scripts/orchestrate/analyze-agent-gaps.js --run-dir ${runDir}`,
    rootDir,
    path.join(commandsDir, 'agent-gaps')
  );
  const proposalsResult = await runAndCapture(
    `node scripts/orchestrate/propose-agent-upgrades.js --run-dir ${runDir}`,
    rootDir,
    path.join(commandsDir, 'agent-upgrades')
  );
  const applyResult = await runAndCapture(
    `node scripts/orchestrate/apply-agent-upgrades.js --run-dir ${runDir}`,
    rootDir,
    path.join(commandsDir, 'agent-upgrade-apply')
  );
  const routingStateResult = await runAndCapture(
    `node scripts/orchestrate/materialize-agent-routing-state.js --run-dir ${runDir}`,
    rootDir,
    path.join(commandsDir, 'agent-routing-state')
  );
  const pendingAgentsResult = await runAndCapture(
    'node scripts/orchestrate/materialize-pending-agents.js',
    rootDir,
    path.join(commandsDir, 'pending-agents')
  );
  const pendingAgentDocsResult = await runAndCapture(
    'node scripts/orchestrate/materialize-pending-agent-docs.js',
    rootDir,
    path.join(commandsDir, 'pending-agent-docs')
  );
  const promotePendingAgentsResult = await runAndCapture(
    `node scripts/orchestrate/promote-pending-agents.js --run-dir ${runDir}`,
    rootDir,
    path.join(commandsDir, 'promote-pending-agents')
  );
  const syncDocsResult = await runAndCapture(
    'node scripts/orchestrate/sync-agent-docs-from-registry.js',
    rootDir,
    path.join(commandsDir, 'agent-doc-sync')
  );
  const summaryResult = await runAndCapture(
    'node scripts/orchestrate/materialize-agent-registry-summary.js',
    rootDir,
    path.join(commandsDir, 'agent-registry-summary')
  );

  return {
    agent_gap_status: gapsResult.ok ? 'completed' : 'failed',
    agent_fitness_status: fitnessResult.ok ? 'completed' : 'failed',
    agent_upgrade_status: proposalsResult.ok ? 'completed' : 'failed',
    agent_apply_status: applyResult.ok ? 'completed' : 'failed',
    agent_routing_state_status: routingStateResult.ok ? 'completed' : 'failed',
    pending_agent_manifest_status: pendingAgentsResult.ok ? 'completed' : 'failed',
    pending_agent_docs_status: pendingAgentDocsResult.ok ? 'completed' : 'failed',
    pending_agent_promotion_status: promotePendingAgentsResult.ok ? 'completed' : 'failed',
    agent_doc_sync_status: syncDocsResult.ok ? 'completed' : 'failed',
    agent_summary_status: summaryResult.ok ? 'completed' : 'failed',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = getRuntimeConfig();
  assertRuntimeConfig(config);

  const profile = getProfile(args.profile);
  const policy = resolveMutationPolicy();
  const store = new RuntimeStore(config);
  const queue = new RuntimeQueue(config);
  const runId = `durable-run-${timestamp()}-${randomUUID().slice(0, 8)}`;
  const runDir = path.join(config.artifactRoot, runId);
  const workers = args.inlineWorkers > 0 ? spawnInlineWorkers(args.inlineWorkers) : [];

  const state = {
    run_id: runId,
    goal: args.goal,
    profile: profile.id,
    requested_passes: args.passes,
    completed_passes: 0,
    completedCounts: {},
    failedCounts: {},
    reviews: [],
    versions: [],
    reviewHints: {
      boostAxes: [],
      lastReviewAfterPass: 0,
    },
    runtimeHints: {
      persistentBoostAxes: [],
    },
    agentRoutingHints: await readAgentRoutingState(),
    passes: [],
  };

  await ensureDir(runDir);
  await store.ensureSchema();
  await queue.connect();

  try {
    await store.createRun({
      runId,
      goal: args.goal,
      profile: profile.id,
      requestedPasses: args.passes,
      runDir,
      policySnapshot: policy,
      metadata: {
        productAnchors: profile.productAnchors || [],
        appSurfaceMutation: false,
      },
    });
    await store.createPolicySnapshot({
      runId,
      version: 1,
      scope: 'default',
      policy,
    });

    for (let passIndex = 1; passIndex <= args.passes; passIndex += 1) {
      const { chosen, ranked } = chooseCandidate(profile, state, { dryRun: false, includeHybrid: false });
      if (!chosen) break;

      const rankingSnapshot = ranked.map(({ candidate, score }) => ({
        id: candidate.id,
        label: candidate.label,
        axis: candidate.axis,
        automationLevel: candidate.automationLevel || 'scripted',
        score,
      }));

      const passId = await store.createPass({
        runId,
        index: passIndex,
        candidate: chosen,
        rankingSnapshot,
        metadata: {
          streams: chosen.streams || [],
          acceptanceSignals: chosen.acceptanceSignals || [],
        },
      });

      const graph = compilePassGraph(chosen);
      await appendRunLog(runDir, `[pass ${passIndex}] selected ${chosen.id} axis=${chosen.axis} tasks=${graph.length}`);
      await store.insertTasks({ runId, passId, tasks: graph });
      const readyTaskIds = await store.getReadyTaskIds(passId);
      const queuedTaskIds = await store.markTasksQueued(readyTaskIds);
      await queue.enqueueTasks(queuedTaskIds);

      const overview = await pollPassCompletion(store, queue, passId, config.pollIntervalMs);
      await appendRunLog(runDir, `[pass ${passIndex}] completed=${overview.completed} soft_failed=${overview.softFailed} failed=${overview.failed} cancelled=${overview.cancelled}`);
      if (overview.failed > 0) {
        await store.cancelPendingPassTasks(passId);
      }

      const passRecord = {
        index: passIndex,
        candidate: {
          id: chosen.id,
          label: chosen.label,
          axis: chosen.axis,
          streams: chosen.streams,
          automationLevel: chosen.automationLevel || 'scripted',
          acceptanceSignals: chosen.acceptanceSignals || [],
        },
        commands: graph.map((task) => ({
          phase: task.phase,
          command: task.command,
          ok: overview.failed === 0 || task.allowFailure,
          allowFailure: task.allowFailure,
        })),
        status: overview.failed > 0 ? 'failed' : 'completed',
      };
      passRecord.reprioritized = summarizePass(passRecord, ranked);

      await store.updatePassStatus({
        passId,
        status: passRecord.status,
        reprioritized: passRecord.reprioritized,
      });

      state.passes.push(passRecord);
      if (passRecord.status === 'completed') {
        state.completed_passes += 1;
        state.completedCounts[chosen.id] = (state.completedCounts[chosen.id] || 0) + 1;
      } else {
        state.failedCounts[chosen.id] = (state.failedCounts[chosen.id] || 0) + 1;
      }

      if (passIndex % args.reviewInterval === 0 || passIndex === args.passes) {
        const review = buildCheckpointReview(profile, state, passIndex);
        state.reviews.push(review);
        state.reviewHints = {
          boostAxes: review.boost_axes,
          lastReviewAfterPass: passIndex,
        };
        state.runtimeHints = {
          persistentBoostAxes: review.boost_axes,
          lastCheckpointReview: review,
        };
        await store.recordReview({
          runId,
          afterPass: passIndex,
          review,
        });
        await writeRuntimeStateArtifacts(process.cwd(), runId, state.reviewHints, state);
        await writeJson(path.join(runDir, 'state.partial.json'), state);
        const snapshotHook = `node scripts/orchestrate/hooks/materialize-product-core-snapshot.js --axis ${chosen.axis} --run-dir ${runDir} --pass-json ${path.join(runDir, `pass-${String(passIndex).padStart(3, '0')}.json`)}`;
        const snapshotResult = await runCommand(snapshotHook, process.cwd());
        await fs.writeFile(path.join(runDir, `review-snapshot-${String(passIndex).padStart(3, '0')}.stdout.log`), snapshotResult.stdout, 'utf8');
        await fs.writeFile(path.join(runDir, `review-snapshot-${String(passIndex).padStart(3, '0')}.stderr.log`), snapshotResult.stderr, 'utf8');
        const versionPath = await writeVersionSnapshot({
          baseDir: runDir,
          family: 'durable-run',
          version: state.reviews.length,
          label: `after-pass-${String(passIndex).padStart(3, '0')}`,
          snapshot: {
            run_id: runId,
            profile: profile.id,
            pass_index: passIndex,
            review,
            review_hints: state.reviewHints,
            runtime_hints: state.runtimeHints,
            completed_passes: state.completed_passes,
            requested_passes: state.requested_passes,
            latest_pass: state.passes[state.passes.length - 1] || null,
            mutation_policy: policy,
          },
        });
        state.versions.push({
          version: state.reviews.length,
          after_pass: passIndex,
          path: path.relative(runDir, versionPath),
        });
        await appendRunLog(runDir, `[review ${passIndex}] boost=${(review.boost_axes || []).join(',') || 'none'}`);
      }

      await writeRuntimeStateArtifacts(process.cwd(), runId, state.reviewHints, state);
      await exportRunArtifacts(store, runId);
      await writeJson(path.join(runDir, 'state.partial.json'), state);

      if (passRecord.status === 'failed' && !args.continueOnFailure) {
        await store.updateRunStatus({ runId, status: 'failed' });
        const finalExport = await exportRunArtifacts(store, runId);
        await writeJson(path.join(runDir, 'durable-summary.json'), {
          run_id: runId,
          status: 'failed',
          failed_pass: passIndex,
          failed_candidate: chosen.label,
          run_dir: finalExport.runDir,
        });
        console.log(JSON.stringify({
          run_id: runId,
          status: 'failed',
          failed_pass: passIndex,
          failed_candidate: chosen.label,
          run_dir: finalExport.runDir,
        }, null, 2));
        return;
      }
    }

    await store.updateRunStatus({ runId, status: 'completed' });
    await writeRuntimeStateArtifacts(process.cwd(), runId, state.reviewHints, state);
    const exported = await exportRunArtifacts(store, runId);
    const agentEvolution = await runAgentEvolutionPostpass(exported.runDir, process.cwd());
    const summary = {
      run_id: runId,
      goal: args.goal,
      profile: profile.id,
      status: 'completed',
      requested_passes: args.passes,
      completed_passes: state.completed_passes,
      review_count: state.reviews.length,
      mutation_policy: policy,
      run_dir: exported.runDir,
      ...agentEvolution,
    };
    await writeJson(path.join(runDir, 'durable-summary.json'), summary);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (workers.length) {
      await stopInlineWorkers(workers);
    }
    await queue.close();
    await store.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
