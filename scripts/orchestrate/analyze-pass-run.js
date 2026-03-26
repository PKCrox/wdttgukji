#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { getProfile } from './pass-profiles.js';

function parseArgs(argv) {
  const args = { runDir: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--run-dir') args.runDir = argv[i + 1] || null;
  }
  if (!args.runDir) throw new Error('--run-dir is required');
  return args;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const statePath = path.join(args.runDir, 'state.json');
  const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  const profile = getProfile(state.profile);
  const axes = state.passes.map((pass) => pass.candidate.axis);
  const candidates = state.passes.map((pass) => pass.candidate.id);
  const failedPasses = state.passes.filter((pass) => pass.status === 'failed').map((pass) => ({
    index: pass.index,
    candidate: pass.candidate.id,
    axis: pass.candidate.axis,
  }));
  const axisCounts = summarizeCounts(axes);
  const candidateCounts = summarizeCounts(candidates);
  const missingAxes = (profile.requiredAxes || []).filter((axis) => !axisCounts[axis]);
  const targetAxisCounts = profile.targetAxisCounts || {};
  const targetDeficits = Object.entries(targetAxisCounts)
    .map(([axis, target]) => ({
      axis,
      target,
      actual: axisCounts[axis] || 0,
      deficit: Math.max(0, target - (axisCounts[axis] || 0)),
    }))
    .filter((entry) => entry.deficit > 0);
  const presentAxes = Object.keys(axisCounts);

  const report = {
    run_id: state.run_id,
    profile: state.profile,
    completed_passes: state.completed_passes,
    axis_counts: axisCounts,
    candidate_counts: candidateCounts,
    failed_passes: failedPasses,
    axis_max_streak: maxStreak(axes),
    candidate_max_streak: maxStreak(candidates),
    required_axes: profile.requiredAxes || [],
    target_axis_counts: targetAxisCounts,
    target_deficits: targetDeficits,
    missing_axes: missingAxes,
    present_axes: presentAxes,
    feedback: [],
  };

  if (missingAxes.length) {
    report.feedback.push(`Required axes not covered: ${missingAxes.join(', ')}`);
  }
  if (report.candidate_max_streak >= 3) {
    report.feedback.push(`Candidate repetition is too high (max streak ${report.candidate_max_streak})`);
  }
  if (report.axis_max_streak >= 3) {
    report.feedback.push(`Axis repetition is too high (max streak ${report.axis_max_streak})`);
  }
  if (failedPasses.length) {
    report.feedback.push(`Pass failures detected: ${failedPasses.map((entry) => `#${entry.index}:${entry.axis}`).join(', ')}`);
  }
  if (targetDeficits.length) {
    report.feedback.push(`Axis target deficits detected: ${targetDeficits.map((entry) => `${entry.axis} (${entry.actual}/${entry.target})`).join(', ')}`);
  }
  if (!report.feedback.length) {
    report.feedback.push('Coverage and repetition are within expected range.');
  }

  console.log(JSON.stringify(report, null, 2));
  if (missingAxes.length || report.candidate_max_streak >= 3 || report.axis_max_streak >= 3 || targetDeficits.length || failedPasses.length) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
