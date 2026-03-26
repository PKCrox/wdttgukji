#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { getProfile } from './pass-profiles.js';
import { writeVersionSnapshot } from './versioning.js';

const GENERATED_DIR = path.join(process.cwd(), 'scripts', 'orchestrate', 'generated');
const RUNTIME_STATE_PATH = path.join(GENERATED_DIR, 'runtime-state.json');
const FACTORY_RUNTIME_SUMMARY_PATH = path.join(GENERATED_DIR, 'factory-runtime-summary.json');
const AGENT_ROUTING_STATE_PATH = path.join(GENERATED_DIR, 'agent-routing-state.json');

function parseArgs(argv) {
  const args = {
    passes: 1,
    profile: 'wdttgukji-product-core',
    goal: 'adaptive pass run',
    continueOnFailure: false,
    dryRun: false,
    includeHybrid: false,
    reviewInterval: 5,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--passes') args.passes = Number(argv[++i] || 1);
    else if (token === '--profile') args.profile = argv[++i] || args.profile;
    else if (token === '--goal') args.goal = argv[++i] || args.goal;
    else if (token === '--continue-on-failure') args.continueOnFailure = true;
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--include-hybrid') args.includeHybrid = true;
    else if (token === '--review-interval') args.reviewInterval = Number(argv[++i] || 5);
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

function totalScore(scores) {
  return (scores.playerHarm || 0)
    + (scores.visibility || 0)
    + (scores.leverage || 0)
    + (scores.confidence || 0)
    + (scores.gatePressure || 0);
}

function summarizeCounts(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function maxStreak(values) {
  let best = 0;
  let current = 0;
  let prev = null;
  for (const value of values) {
    if (value === prev) current += 1;
    else current = 1;
    prev = value;
    best = Math.max(best, current);
  }
  return best;
}

function getRecentPasses(state, count = 2) {
  return state.passes.slice(Math.max(0, state.passes.length - count));
}

function getRemainingPasses(state) {
  return Math.max(0, state.requested_passes - state.passes.length);
}

function getUnseenRequiredAxes(profile, state) {
  const seen = new Set(state.passes.map((entry) => entry.candidate.axis));
  return (profile.requiredAxes || []).filter((axis) => !seen.has(axis));
}

function getAxisCounts(state) {
  return state.passes.reduce((acc, entry) => {
    const axis = entry.candidate.axis;
    acc[axis] = (acc[axis] || 0) + 1;
    return acc;
  }, {});
}

function scoreCandidate(candidate, state) {
  const completedCount = state.completedCounts[candidate.id] || 0;
  const failedCount = state.failedCounts[candidate.id] || 0;
  const recentPasses = getRecentPasses(state, 2);
  const sameCandidateRecent = recentPasses.filter((entry) => entry.candidate.id === candidate.id).length;
  const sameAxisRecent = recentPasses.filter((entry) => entry.candidate.axis === candidate.axis).length;
  const completionPenalty = candidate.repeatable ? completedCount * 0.75 : completedCount * 4;
  const repetitionPenalty = (sameCandidateRecent * 3.5) + (sameAxisRecent * 1.5);
  return totalScore(candidate.scores) - completionPenalty - repetitionPenalty - (failedCount * 2);
}

function chooseCandidate(profile, state, options = {}) {
  const unseenRequiredAxes = getUnseenRequiredAxes(profile, state);
  const remainingPasses = getRemainingPasses(state);
  const axisCounts = getAxisCounts(state);
  const targetAxisCounts = profile.targetAxisCounts || {};
  const reviewBoostAxes = state.reviewHints?.boostAxes || [];
  const persistentBoostAxes = state.runtimeHints?.persistentBoostAxes || [];
  const laneUrgency = state.agentRoutingHints?.laneUrgency || {};
  const totalAxisDeficit = Object.entries(targetAxisCounts)
    .reduce((acc, [axis, target]) => acc + Math.max(0, target - (axisCounts[axis] || 0)), 0);

  const ranked = profile.candidates
    .map((candidate) => {
      const eligible = options.dryRun || candidate.commands.length > 0 || (options.includeHybrid && candidate.automationLevel === 'hybrid');
      const unseenAxis = unseenRequiredAxes.includes(candidate.axis);
      const seenCandidate = !!state.completedCounts[candidate.id];
      const currentAxisCount = axisCounts[candidate.axis] || 0;
      const targetAxisCount = targetAxisCounts[candidate.axis] || 0;
      const axisDeficit = Math.max(0, targetAxisCount - currentAxisCount);
      const axisSurplus = Math.max(0, currentAxisCount - targetAxisCount);
      let score = scoreCandidate(candidate, state);

      if (unseenAxis) score += 3.5;
      if (!seenCandidate) score += 1.5;
      if (unseenAxis && remainingPasses <= unseenRequiredAxes.length) score += 6;
      if (axisDeficit > 0) score += axisDeficit * 2.5;
      if (axisDeficit > 0 && remainingPasses <= totalAxisDeficit + unseenRequiredAxes.length) score += 4.5;
      if (axisDeficit > 0 && remainingPasses <= unseenRequiredAxes.length + 2) score += 2;
      if (axisSurplus > 0) score -= axisSurplus * 4;
      if (targetAxisCount > 0 && currentAxisCount >= targetAxisCount) score -= 2;
      if (reviewBoostAxes.includes(candidate.axis)) score += 2;
      if (persistentBoostAxes.includes(candidate.axis)) score += 1;
      if ((laneUrgency[candidate.axis] || 0) > 0) score += Math.min(3, laneUrgency[candidate.axis]);

      return {
        candidate,
        score,
        eligible,
      };
    })
    .filter((entry) => entry.eligible)
    .sort((a, b) => b.score - a.score || a.candidate.label.localeCompare(b.candidate.label, 'ko'));

  return {
    chosen: ranked[0]?.candidate || null,
    ranked,
  };
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function readRuntimeState() {
  try {
    return JSON.parse(await fs.readFile(RUNTIME_STATE_PATH, 'utf8'));
  } catch {
    return {
      updated_at: null,
      last_run_id: null,
      persistentBoostAxes: [],
      lastCheckpointReview: null,
      axisStatus: {},
    };
  }
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

async function writeRuntimeState(runtimeState) {
  await ensureDir(path.dirname(RUNTIME_STATE_PATH));
  const existing = await readRuntimeState();
  const nextState = {
    ...existing,
    ...runtimeState,
    axisStatus: {
      ...(existing.axisStatus || {}),
      ...(runtimeState.axisStatus || {}),
    },
  };
  await writeJson(RUNTIME_STATE_PATH, nextState);
  await writeJson(FACTORY_RUNTIME_SUMMARY_PATH, {
    updatedAt: nextState.updated_at || null,
    lastRunId: nextState.last_run_id || null,
    persistentBoostAxes: nextState.persistentBoostAxes || [],
    axisStatus: nextState.axisStatus || {},
  });
}

function buildCheckpointReview(profile, state, uptoPass) {
  const consideredPasses = state.passes.filter((entry) => entry.index <= uptoPass);
  const axes = consideredPasses.map((entry) => entry.candidate.axis);
  const candidates = consideredPasses.map((entry) => entry.candidate.id);
  const axisCounts = summarizeCounts(axes);
  const candidateCounts = summarizeCounts(candidates);
  const targetAxisCounts = profile.targetAxisCounts || {};
  const expectedByNow = Object.fromEntries(
    Object.entries(targetAxisCounts).map(([axis, target]) => [axis, Number(((target * uptoPass) / state.requested_passes).toFixed(2))])
  );
  const paceDeficits = Object.entries(expectedByNow)
    .map(([axis, expected]) => ({
      axis,
      expected,
      actual: axisCounts[axis] || 0,
      deficit: Number(Math.max(0, expected - (axisCounts[axis] || 0)).toFixed(2)),
    }))
    .filter((entry) => entry.deficit > 0);
  const boostAxes = paceDeficits
    .sort((a, b) => b.deficit - a.deficit || a.axis.localeCompare(b.axis, 'ko'))
    .map((entry) => entry.axis);

  return {
    review_after_pass: uptoPass,
    axis_counts: axisCounts,
    candidate_counts: candidateCounts,
    axis_max_streak: maxStreak(axes),
    candidate_max_streak: maxStreak(candidates),
    target_axis_counts: targetAxisCounts,
    expected_by_now: expectedByNow,
    pace_deficits: paceDeficits,
    boost_axes: boostAxes,
    feedback: boostAxes.length
      ? [`Intermediate review recommends boosting: ${boostAxes.join(', ')}`]
      : ['Intermediate review is on pace.'],
  };
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

async function runHookCommand(command, cwd, commandsDir, filePrefix) {
  const result = await runCommand(command, cwd);
  await fs.writeFile(path.join(commandsDir, `${filePrefix}.stdout.log`), result.stdout, 'utf8');
  await fs.writeFile(path.join(commandsDir, `${filePrefix}.stderr.log`), result.stderr, 'utf8');
  return result;
}

async function executeCommandBatch({ passIndex, commandSpecs, rootDir, commandsDir, startIndex = 0 }) {
  const indexedSpecs = commandSpecs.map((spec, offset) => ({
    spec,
    commandIndex: offset,
  }));

  const results = await Promise.all(indexedSpecs.map(async ({ spec, commandIndex }) => {
    const result = await runCommand(spec.run, rootDir);
    const absoluteIndex = startIndex + commandIndex + 1;
    const stdoutFile = `commands/pass-${String(passIndex).padStart(3, '0')}-cmd-${String(absoluteIndex).padStart(2, '0')}.stdout.log`;
    const stderrFile = `commands/pass-${String(passIndex).padStart(3, '0')}-cmd-${String(absoluteIndex).padStart(2, '0')}.stderr.log`;

    await fs.writeFile(path.join(commandsDir, path.basename(stdoutFile)), result.stdout, 'utf8');
    await fs.writeFile(path.join(commandsDir, path.basename(stderrFile)), result.stderr, 'utf8');

    return {
      phase: spec.phase,
      command: spec.run,
      ok: result.ok,
      code: result.code,
      allowFailure: !!spec.allowFailure,
      stdout_file: stdoutFile,
      stderr_file: stderrFile,
    };
  }));

  return results;
}

function chunkCommandSpecs(commandSpecs) {
  const chunks = [];
  let index = 0;
  while (index < commandSpecs.length) {
    const current = commandSpecs[index];
    if (current.parallelGroup) {
      const group = [current];
      index += 1;
      while (index < commandSpecs.length && commandSpecs[index].parallelGroup === current.parallelGroup) {
        group.push(commandSpecs[index]);
        index += 1;
      }
      chunks.push(group);
      continue;
    }

    chunks.push([current]);
    index += 1;
  }

  return chunks;
}

function summarizePass(passRecord, ranked) {
  const successfulCommands = passRecord.commands.filter((entry) => entry.ok).length;
  const failedCommands = passRecord.commands.filter((entry) => !entry.ok && !entry.allowFailure).length;
  const softFailedCommands = passRecord.commands.filter((entry) => !entry.ok && entry.allowFailure).length;
  const nextPassCandidates = ranked.slice(0, 3).map(({ candidate, score }) => ({
    label: candidate.label,
    axis: candidate.axis,
    score,
  }));

  return {
    dominant_bottleneck: passRecord.candidate.axis,
    next_pass_candidates: nextPassCandidates,
    chosen_next_pass: nextPassCandidates[0]?.label || null,
    why_not_others: nextPassCandidates.slice(1).map((entry) =>
      `${entry.label} scored lower than ${nextPassCandidates[0]?.label || 'the chosen pass'}`
    ),
        command_summary: {
      successfulCommands,
      failedCommands,
      softFailedCommands,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const profile = getProfile(args.profile);
  const runId = `adaptive-run-${timestamp()}`;
  const runDir = path.join(rootDir, 'runs', 'pass-runs', runId);
  const commandsDir = path.join(runDir, 'commands');

  await ensureDir(commandsDir);

  const state = {
    run_id: runId,
    goal: args.goal,
    profile: profile.id,
    product_anchors: profile.productAnchors || [],
    status: 'running',
    mode: args.dryRun ? 'dry-run' : 'active',
    created_at: new Date().toISOString(),
    requested_passes: args.passes,
    completed_passes: 0,
    completedCounts: {},
    failedCounts: {},
    runtimeHints: await readRuntimeState(),
    agentRoutingHints: await readAgentRoutingState(),
    reviews: [],
    versions: [],
    reviewHints: {
      boostAxes: [],
      lastReviewAfterPass: 0,
    },
    passes: [],
  };

  await writeJson(path.join(runDir, 'state.json'), state);

  for (let passIndex = 1; passIndex <= args.passes; passIndex += 1) {
    const { chosen, ranked } = chooseCandidate(profile, state, {
      dryRun: args.dryRun,
      includeHybrid: args.includeHybrid,
    });
    if (!chosen) break;

    const passRecord = {
      index: passIndex,
      started_at: new Date().toISOString(),
      candidate: {
        id: chosen.id,
        label: chosen.label,
        axis: chosen.axis,
        streams: chosen.streams,
        automationLevel: chosen.automationLevel || 'scripted',
        acceptanceSignals: chosen.acceptanceSignals || [],
      },
        ranking_snapshot: ranked.map(({ candidate, score }) => ({
        id: candidate.id,
        label: candidate.label,
        axis: candidate.axis,
        automationLevel: candidate.automationLevel || 'scripted',
        score,
      })),
      commands: [],
      status: 'running',
    };

    if (args.dryRun) {
      for (const command of chosen.commands) {
        passRecord.commands.push({
          phase: command.phase,
          command: command.run,
          ok: true,
          code: 0,
          dryRun: true,
          allowFailure: !!command.allowFailure,
        });
      }
      passRecord.status = 'completed';
    } else {
      const commandBatches = chunkCommandSpecs(chosen.commands);
      let commandCursor = 0;
      for (const batch of commandBatches) {
        const results = await executeCommandBatch({
          passIndex,
          commandSpecs: batch,
          rootDir,
          commandsDir,
          startIndex: commandCursor,
        });

        for (const entry of results) {
          passRecord.commands.push(entry);
          commandCursor += 1;
        }

        const hardFailure = results.find((entry) => !entry.ok && !entry.allowFailure);
        if (hardFailure) {
          passRecord.status = 'failed';
          state.failedCounts[chosen.id] = (state.failedCounts[chosen.id] || 0) + 1;
          break;
        }
      }

      if (passRecord.status !== 'failed') {
        passRecord.status = 'completed';
      }

    }

    passRecord.completed_at = new Date().toISOString();
    passRecord.reprioritized = summarizePass(passRecord, ranked);
    await writeJson(path.join(runDir, `pass-${String(passIndex).padStart(3, '0')}.json`), passRecord);

    if (passRecord.status === 'completed' && Array.isArray(chosen.editHooks) && chosen.editHooks.length) {
      for (let hookIndex = 0; hookIndex < chosen.editHooks.length; hookIndex += 1) {
        const hookSpec = chosen.editHooks[hookIndex];
        const hookCommand = `${hookSpec.run} --run-dir ${runDir} --pass-json ${path.join(runDir, `pass-${String(passIndex).padStart(3, '0')}.json`)}`;
        const hookResult = await runCommand(hookCommand, rootDir);
        passRecord.commands.push({
          phase: hookSpec.phase || 'edit',
          command: hookCommand,
          ok: hookResult.ok,
          code: hookResult.code,
          allowFailure: !!hookSpec.allowFailure,
          stdout_file: `commands/pass-${String(passIndex).padStart(3, '0')}-hook-${String(hookIndex + 1).padStart(2, '0')}.stdout.log`,
          stderr_file: `commands/pass-${String(passIndex).padStart(3, '0')}-hook-${String(hookIndex + 1).padStart(2, '0')}.stderr.log`,
        });

        await fs.writeFile(
          path.join(commandsDir, `pass-${String(passIndex).padStart(3, '0')}-hook-${String(hookIndex + 1).padStart(2, '0')}.stdout.log`),
          hookResult.stdout,
          'utf8'
        );
        await fs.writeFile(
          path.join(commandsDir, `pass-${String(passIndex).padStart(3, '0')}-hook-${String(hookIndex + 1).padStart(2, '0')}.stderr.log`),
          hookResult.stderr,
          'utf8'
        );

        if (!hookResult.ok && !hookSpec.allowFailure) {
          passRecord.status = 'failed';
          state.failedCounts[chosen.id] = (state.failedCounts[chosen.id] || 0) + 1;
          break;
        }

        await writeJson(path.join(runDir, `pass-${String(passIndex).padStart(3, '0')}.json`), passRecord);
      }
    }

    passRecord.reprioritized = summarizePass(passRecord, ranked);
    await writeJson(path.join(runDir, `pass-${String(passIndex).padStart(3, '0')}.json`), passRecord);

    state.passes.push(passRecord);

    if (passRecord.status === 'completed') {
      state.completed_passes += 1;
      state.completedCounts[chosen.id] = (state.completedCounts[chosen.id] || 0) + 1;
    }

    await writeJson(path.join(runDir, `pass-${String(passIndex).padStart(3, '0')}.json`), passRecord);

    if (passIndex % args.reviewInterval === 0 || passIndex === args.passes) {
      const review = buildCheckpointReview(profile, state, passIndex);
      state.reviews.push(review);
      state.reviewHints = {
        boostAxes: review.boost_axes,
        lastReviewAfterPass: passIndex,
      };
      state.runtimeHints = {
        ...(state.runtimeHints || {}),
        lastCheckpointReview: review,
        persistentBoostAxes: review.boost_axes,
      };
      await writeRuntimeState({
        ...(state.runtimeHints || {}),
        updated_at: new Date().toISOString(),
        last_run_id: state.run_id,
      });
      await writeJson(path.join(runDir, 'state.json'), state);
      const snapshotHook = `node scripts/orchestrate/hooks/materialize-product-core-snapshot.js --axis ${chosen.axis} --run-dir ${runDir} --pass-json ${path.join(runDir, `pass-${String(passIndex).padStart(3, '0')}.json`)}`;
      await runHookCommand(
        snapshotHook,
        rootDir,
        commandsDir,
        `pass-${String(passIndex).padStart(3, '0')}-review-snapshot`
      );
      await writeJson(path.join(runDir, `checkpoint-review-${String(passIndex).padStart(3, '0')}.json`), review);
      const versionPath = await writeVersionSnapshot({
        baseDir: runDir,
        family: 'adaptive-pass-run',
        version: state.reviews.length,
        label: `after-pass-${String(passIndex).padStart(3, '0')}`,
        snapshot: {
          run_id: state.run_id,
          pass_index: passIndex,
          profile: state.profile,
          review,
          review_hints: state.reviewHints,
          runtime_hints: state.runtimeHints,
          completed_passes: state.completed_passes,
          requested_passes: state.requested_passes,
          latest_pass: state.passes[state.passes.length - 1] || null,
        },
      });
      state.versions.push({
        version: state.reviews.length,
        after_pass: passIndex,
        path: path.relative(runDir, versionPath),
      });
    }

    await writeJson(path.join(runDir, 'state.json'), state);

    if (passRecord.status === 'failed' && !args.continueOnFailure) {
      state.status = 'failed';
      await writeJson(path.join(runDir, 'state.json'), state);
      console.log(JSON.stringify({
        run_id: runId,
        status: 'failed',
        failed_pass: passIndex,
        failed_candidate: chosen.label,
        run_dir: runDir,
      }, null, 2));
      return;
    }
  }

  state.status = 'completed';
  state.completed_at = new Date().toISOString();
  const lastPass = state.passes[state.passes.length - 1] || null;
  const summary = {
    run_id: runId,
    goal: args.goal,
    profile: profile.id,
    status: state.status,
    requested_passes: args.passes,
    completed_passes: state.completed_passes,
    last_dominant_bottleneck: lastPass?.reprioritized?.dominant_bottleneck || null,
    chosen_next_pass: lastPass?.reprioritized?.chosen_next_pass || null,
    run_dir: runDir,
  };

  await writeJson(path.join(runDir, 'summary.json'), summary);
  await writeJson(path.join(runDir, 'state.json'), state);
  await writeRuntimeState({
    ...(state.runtimeHints || {}),
    updated_at: new Date().toISOString(),
    last_run_id: state.run_id,
  });
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
