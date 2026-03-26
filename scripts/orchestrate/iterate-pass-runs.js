#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { getProfile } from './pass-profiles.js';
import { writeVersionSnapshot } from './versioning.js';

function parseArgs(argv) {
  const args = {
    iterations: 10,
    passes: 10,
    profile: 'wdttgukji-product-core',
    goal: 'meta adaptive pass run',
    continueOnFailure: true,
    dryRun: false,
    includeHybrid: false,
    reviewInterval: 5,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--iterations') args.iterations = Number(argv[++i] || 10);
    else if (token === '--passes') args.passes = Number(argv[++i] || 10);
    else if (token === '--profile') args.profile = argv[++i] || args.profile;
    else if (token === '--goal') args.goal = argv[++i] || args.goal;
    else if (token === '--continue-on-failure') args.continueOnFailure = true;
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--include-hybrid') args.includeHybrid = true;
    else if (token === '--review-interval') args.reviewInterval = Number(argv[++i] || 5);
  }

  if (!Number.isFinite(args.iterations) || args.iterations < 1) {
    throw new Error(`Invalid --iterations value: ${args.iterations}`);
  }
  if (!Number.isFinite(args.passes) || args.passes < 1) {
    throw new Error(`Invalid --passes value: ${args.passes}`);
  }
  if (!Number.isFinite(args.reviewInterval) || args.reviewInterval < 1) {
    throw new Error(`Invalid --review-interval value: ${args.reviewInterval}`);
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
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
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
        command,
        code: code ?? 1,
        ok: code === 0,
        stdout,
        stderr,
      });
    });
  });
}

async function runAndCapture(command, cwd, fileBase) {
  const result = await runCommand(command, cwd);
  await fs.writeFile(`${fileBase}.stdout.log`, result.stdout, 'utf8');
  await fs.writeFile(`${fileBase}.stderr.log`, result.stderr, 'utf8');
  return result;
}

function summarizeCounts(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function sumCountObjects(items) {
  return items.reduce((acc, counts) => {
    for (const [key, value] of Object.entries(counts || {})) {
      acc[key] = (acc[key] || 0) + value;
    }
    return acc;
  }, {});
}

function averageCountObject(totalCounts, divisor) {
  return Object.fromEntries(
    Object.entries(totalCounts).map(([key, value]) => [key, Number((value / divisor).toFixed(2))])
  );
}

function buildAggregate(iterations, profile) {
  const axisCountsList = iterations.map((entry) => entry.analysis.axis_counts || {});
  const candidateCountsList = iterations.map((entry) => entry.analysis.candidate_counts || {});
  const totalAxisCounts = sumCountObjects(axisCountsList);
  const totalCandidateCounts = sumCountObjects(candidateCountsList);
  const missingAxesHistogram = summarizeCounts(iterations.flatMap((entry) => entry.analysis.missing_axes || []));
  const targetDeficitHistogram = summarizeCounts(
    iterations.flatMap((entry) => (entry.analysis.target_deficits || []).map((deficit) => deficit.axis))
  );
  const failedPassHistogram = summarizeCounts(
    iterations.flatMap((entry) => (entry.analysis.failed_passes || []).map((pass) => pass.axis))
  );
  const totalFailedPasses = iterations.reduce((acc, entry) => acc + ((entry.analysis.failed_passes || []).length), 0);
  const candidateMaxStreak = Math.max(...iterations.map((entry) => entry.analysis.candidate_max_streak || 0), 0);
  const axisMaxStreak = Math.max(...iterations.map((entry) => entry.analysis.axis_max_streak || 0), 0);
  const failedIterations = iterations.filter((entry) => !entry.ok).map((entry) => entry.iteration);
  const requiredAxes = profile.requiredAxes || [];
  const iterationsWithFullCoverage = iterations.filter((entry) => !(entry.analysis.missing_axes || []).length).length;

  const recommendations = [];
  if (Object.keys(targetDeficitHistogram).length) {
    recommendations.push('Target axis deficits appeared across the meta-run. Increase deficit pressure for under-served axes.');
  }
  if (totalFailedPasses > 0) {
    recommendations.push('Some passes failed but the meta-run continued. Convert known red-signal gates into feedback-only phases when they are exploratory.');
  }
  if (candidateMaxStreak >= 3 || axisMaxStreak >= 3) {
    recommendations.push('Repetition spikes appeared. Increase recent-pass penalties or add a cool-down window.');
  }
  if (!recommendations.length) {
    recommendations.push('Coverage and repetition stayed within the expected range. Keep current scoring policy.');
  }

  return {
    iterations: iterations.length,
    required_axes: requiredAxes,
    iterations_with_full_coverage: iterationsWithFullCoverage,
    failed_iterations: failedIterations,
    total_axis_counts: totalAxisCounts,
    average_axis_counts: averageCountObject(totalAxisCounts, iterations.length),
    total_candidate_counts: totalCandidateCounts,
    average_candidate_counts: averageCountObject(totalCandidateCounts, iterations.length),
    missing_axes_histogram: missingAxesHistogram,
    target_deficit_histogram: targetDeficitHistogram,
    total_failed_passes: totalFailedPasses,
    failed_pass_histogram: failedPassHistogram,
    max_candidate_streak_observed: candidateMaxStreak,
    max_axis_streak_observed: axisMaxStreak,
    recommendations,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const profile = getProfile(args.profile);
  const metaRunId = `meta-run-${timestamp()}`;
  const metaRunDir = path.join(rootDir, 'runs', 'pass-runs', metaRunId);
  const commandsDir = path.join(metaRunDir, 'commands');
  await ensureDir(commandsDir);

  const state = {
    meta_run_id: metaRunId,
    profile: args.profile,
    goal: args.goal,
    mode: args.dryRun ? 'dry-run' : 'active',
    iterations_requested: args.iterations,
    passes_per_iteration: args.passes,
    product_anchors: profile.productAnchors || [],
    status: 'running',
    created_at: new Date().toISOString(),
    iterations: [],
    versions: [],
  };

  await writeJson(path.join(metaRunDir, 'state.json'), state);

  for (let iteration = 1; iteration <= args.iterations; iteration += 1) {
    const runnerArgs = [
      'node scripts/orchestrate/adaptive-pass-runner.js',
      `--profile ${args.profile}`,
      `--passes ${args.passes}`,
      `--review-interval ${args.reviewInterval}`,
      `--goal "${args.goal} :: iteration ${iteration}"`,
    ];
    if (args.continueOnFailure) runnerArgs.push('--continue-on-failure');
    if (args.dryRun) runnerArgs.push('--dry-run');
    if (args.includeHybrid) runnerArgs.push('--include-hybrid');

    const iterationPrefix = path.join(commandsDir, `iteration-${String(iteration).padStart(2, '0')}`);
    const runResult = await runAndCapture(runnerArgs.join(' '), rootDir, `${iterationPrefix}.runner`);
    let runnerSummary = null;
    try {
      runnerSummary = JSON.parse(runResult.stdout.trim());
    } catch (error) {
      state.iterations.push({
        iteration,
        ok: false,
        status: 'runner_failed',
        error: 'adaptive-pass-runner did not emit JSON summary',
      });
      state.status = 'failed';
      await writeJson(path.join(metaRunDir, 'state.json'), state);
      console.log(JSON.stringify({
        meta_run_id: metaRunId,
        status: state.status,
        failed_iteration: iteration,
        meta_run_dir: metaRunDir,
      }, null, 2));
      return;
    }

    const analyzeCommand = `node scripts/orchestrate/analyze-pass-run.js --run-dir ${runnerSummary.run_dir}`;
    const analysisResult = await runAndCapture(analyzeCommand, rootDir, `${iterationPrefix}.analyze`);

    const analysis = JSON.parse(analysisResult.stdout.trim());
    const entry = {
      iteration,
      ok: analysisResult.ok,
      run_id: runnerSummary.run_id,
      run_dir: runnerSummary.run_dir,
      status: runnerSummary.status,
      analysis,
    };
    state.iterations.push(entry);
    await writeJson(path.join(metaRunDir, `iteration-${String(iteration).padStart(2, '0')}.json`), entry);
    const versionPath = await writeVersionSnapshot({
      baseDir: metaRunDir,
      family: 'meta-run',
      version: iteration,
      label: `iteration-${String(iteration).padStart(2, '0')}`,
      snapshot: entry,
    });
    state.versions.push({
      version: iteration,
      iteration,
      path: path.relative(metaRunDir, versionPath),
    });
    const partialAggregate = buildAggregate(state.iterations, profile);
    await writeJson(path.join(metaRunDir, 'aggregate.partial.json'), partialAggregate);
    await writeJson(path.join(metaRunDir, 'state.json'), state);
    console.error(`[meta-run] iteration ${iteration}/${args.iterations} completed: ${entry.run_id}`);
  }

  state.status = state.iterations.every((entry) => entry.ok) ? 'completed' : 'completed_with_feedback';
  state.completed_at = new Date().toISOString();
  const aggregate = buildAggregate(state.iterations, profile);
  const fitnessCommand = `node scripts/orchestrate/analyze-agent-fitness.js --run-dir ${metaRunDir}`;
  const fitnessResult = await runAndCapture(fitnessCommand, rootDir, path.join(commandsDir, 'agent-fitness'));
  const gapsCommand = `node scripts/orchestrate/analyze-agent-gaps.js --run-dir ${metaRunDir}`;
  const gapsResult = await runAndCapture(gapsCommand, rootDir, path.join(commandsDir, 'agent-gaps'));
  const proposalsCommand = `node scripts/orchestrate/propose-agent-upgrades.js --run-dir ${metaRunDir}`;
  const proposalsResult = await runAndCapture(proposalsCommand, rootDir, path.join(commandsDir, 'agent-upgrades'));
  const applyCommand = `node scripts/orchestrate/apply-agent-upgrades.js --run-dir ${metaRunDir}`;
  const applyResult = await runAndCapture(applyCommand, rootDir, path.join(commandsDir, 'agent-upgrade-apply'));
  const routingStateCommand = `node scripts/orchestrate/materialize-agent-routing-state.js --run-dir ${metaRunDir}`;
  const routingStateResult = await runAndCapture(routingStateCommand, rootDir, path.join(commandsDir, 'agent-routing-state'));
  const pendingAgentsCommand = 'node scripts/orchestrate/materialize-pending-agents.js';
  const pendingAgentsResult = await runAndCapture(pendingAgentsCommand, rootDir, path.join(commandsDir, 'pending-agents'));
  const pendingAgentDocsCommand = 'node scripts/orchestrate/materialize-pending-agent-docs.js';
  const pendingAgentDocsResult = await runAndCapture(pendingAgentDocsCommand, rootDir, path.join(commandsDir, 'pending-agent-docs'));
  const promotePendingAgentsCommand = `node scripts/orchestrate/promote-pending-agents.js --run-dir ${metaRunDir}`;
  const promotePendingAgentsResult = await runAndCapture(promotePendingAgentsCommand, rootDir, path.join(commandsDir, 'promote-pending-agents'));
  const syncDocsCommand = 'node scripts/orchestrate/sync-agent-docs-from-registry.js';
  const syncDocsResult = await runAndCapture(syncDocsCommand, rootDir, path.join(commandsDir, 'agent-doc-sync'));
  const summaryCommand = 'node scripts/orchestrate/materialize-agent-registry-summary.js';
  const summaryResult = await runAndCapture(summaryCommand, rootDir, path.join(commandsDir, 'agent-registry-summary'));
  const summary = {
    meta_run_id: metaRunId,
    profile: args.profile,
    status: state.status,
    iterations_requested: args.iterations,
    passes_per_iteration: args.passes,
    meta_run_dir: metaRunDir,
    aggregate,
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

  await writeJson(path.join(metaRunDir, 'aggregate.json'), aggregate);
  await writeJson(path.join(metaRunDir, 'summary.json'), summary);
  await writeJson(path.join(metaRunDir, 'state.json'), state);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
