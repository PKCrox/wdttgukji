#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

import { PASS_PROFILES } from '../orchestrate/pass-profiles.js';
import { REPLAY_BY_AXIS } from './run-factory-replay-suite.js';

const ROOT = process.cwd();

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function parseArgs(argv) {
  const args = {
    axis: null,
    output: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--axis') args.axis = argv[++index] || null;
    else if (token === '--output') args.output = argv[++index] || null;
  }

  return args;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(filePath, payload) {
  const resolvedPath = path.resolve(ROOT, filePath);
  await ensureDir(path.dirname(resolvedPath));
  await fs.writeFile(resolvedPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return resolvedPath;
}

function collectAxisCoverage() {
  const axisMap = new Map();

  for (const [profileId, profile] of Object.entries(PASS_PROFILES)) {
    const requiredAxes = new Set(profile.requiredAxes || []);
    const candidateAxes = unique((profile.candidates || []).map((candidate) => candidate.axis));

    for (const axis of unique([...requiredAxes, ...candidateAxes])) {
      if (!axisMap.has(axis)) {
        axisMap.set(axis, {
          axis,
          profile_ids: [],
          required_in_profiles: [],
          candidate_ids: [],
          candidate_labels: [],
        });
      }

      const entry = axisMap.get(axis);
      entry.profile_ids.push(profileId);
      if (requiredAxes.has(axis)) entry.required_in_profiles.push(profileId);

      for (const candidate of profile.candidates || []) {
        if (candidate.axis !== axis) continue;
        entry.candidate_ids.push(candidate.id);
        entry.candidate_labels.push(candidate.label);
      }
    }
  }

  return [...axisMap.values()]
    .map((entry) => {
      const replayChecks = Array.isArray(REPLAY_BY_AXIS[entry.axis]) ? REPLAY_BY_AXIS[entry.axis] : [];
      const uniqueChecks = replayChecks.filter((check, index, list) => (
        list.findIndex((other) => other.id === check.id && other.script === check.script) === index
      ));
      const requiredProfiles = unique(entry.required_in_profiles).sort();
      const coverageStatus = uniqueChecks.length ? 'covered' : 'gap';
      const gapCategory = coverageStatus === 'gap'
        ? (requiredProfiles.length ? 'product-required-gap' : 'diagnostic-gap')
        : null;

      return {
        axis: entry.axis,
        coverage_status: coverageStatus,
        gap_category: gapCategory,
        profile_ids: unique(entry.profile_ids).sort(),
        required_in_profiles: requiredProfiles,
        candidate_ids: unique(entry.candidate_ids).sort(),
        candidate_labels: unique(entry.candidate_labels).sort(),
        replay_check_ids: uniqueChecks.map((check) => check.id),
        replay_scripts: uniqueChecks.map((check) => check.script),
        replay_check_count: uniqueChecks.length,
      };
    })
    .sort((left, right) => {
      if (left.coverage_status !== right.coverage_status) {
        return left.coverage_status === 'covered' ? -1 : 1;
      }
      if (left.required_in_profiles.length !== right.required_in_profiles.length) {
        return right.required_in_profiles.length - left.required_in_profiles.length;
      }
      return left.axis.localeCompare(right.axis);
    });
}

function buildProfileCoverage() {
  return Object.entries(PASS_PROFILES)
    .map(([profileId, profile]) => {
      const axes = unique([
        ...(profile.requiredAxes || []),
        ...((profile.candidates || []).map((candidate) => candidate.axis)),
      ]).sort();
      const coveredAxes = axes.filter((axis) => Array.isArray(REPLAY_BY_AXIS[axis]) && REPLAY_BY_AXIS[axis].length);
      const uncoveredAxes = axes.filter((axis) => !coveredAxes.includes(axis));

      return {
        profile_id: profileId,
        total_axes: axes.length,
        covered_axes: coveredAxes,
        uncovered_axes: uncoveredAxes,
        coverage_ratio: axes.length ? Number((coveredAxes.length / axes.length).toFixed(2)) : 0,
      };
    })
    .sort((left, right) => left.profile_id.localeCompare(right.profile_id));
}

function buildFocusedAxisAudit(axisEntry) {
  if (!axisEntry) return null;
  const commands = [
    `node scripts/qa/list-replay-coverage.js --axis ${axisEntry.axis}`,
  ];
  const recommendedAction = axisEntry.coverage_status === 'covered'
    ? `Replay coverage already exists for ${axisEntry.axis}; use this audit as inventory and review the listed replay checks before changing verification policy.`
    : axisEntry.axis === 'theme-independence'
      ? 'Theme-independence is still a product-required replay gap; keep follow-up work inside docs/qa/runtime hooks until a factory-safe verification path is added.'
      : `Add or expand factory-safe verification coverage for ${axisEntry.axis} before promoting broader runtime mutation.`;

  return {
    axis: axisEntry.axis,
    coverage_status: axisEntry.coverage_status,
    gap_category: axisEntry.gap_category,
    replay_check_count: axisEntry.replay_check_count,
    replay_check_ids: axisEntry.replay_check_ids,
    replay_scripts: axisEntry.replay_scripts,
    required_in_profiles: axisEntry.required_in_profiles,
    candidate_ids: axisEntry.candidate_ids,
    candidate_labels: axisEntry.candidate_labels,
    recommended_action: recommendedAction,
    operator_commands: commands,
    summary_lines: [
      `Focused axis: ${axisEntry.axis}`,
      `Coverage status: ${axisEntry.coverage_status}`,
      `Replay checks: ${axisEntry.replay_check_ids.join(', ') || 'none'}`,
      `Required in profiles: ${axisEntry.required_in_profiles.join(', ') || 'none'}`,
      `Recommended action: ${recommendedAction}`,
    ],
  };
}

function buildReport(options = {}) {
  const axes = collectAxisCoverage();
  const coveredAxes = axes.filter((entry) => entry.coverage_status === 'covered').map((entry) => entry.axis);
  const uncoveredAxes = axes.filter((entry) => entry.coverage_status === 'gap').map((entry) => entry.axis);
  const productRequiredGaps = axes
    .filter((entry) => entry.gap_category === 'product-required-gap')
    .map((entry) => entry.axis);
  const diagnosticGaps = axes
    .filter((entry) => entry.gap_category === 'diagnostic-gap')
    .map((entry) => entry.axis);
  const replayCheckInventory = unique(
    Object.values(REPLAY_BY_AXIS).flatMap((checks) => (checks || []).map((check) => check.id)),
  ).sort();
  const focusedAxisAudit = options.axis
    ? buildFocusedAxisAudit(axes.find((entry) => entry.axis === options.axis) || null)
    : null;

  if (options.axis && !focusedAxisAudit) {
    throw new Error(`Unknown axis: ${options.axis}`);
  }

  return {
    status: 'completed',
    generated_at: new Date().toISOString(),
    focused_axis: options.axis || null,
    focused_axis_audit: focusedAxisAudit,
    total_axes: axes.length,
    covered_axis_count: coveredAxes.length,
    uncovered_axis_count: uncoveredAxes.length,
    covered_axes: coveredAxes,
    uncovered_axes: uncoveredAxes,
    product_required_gap_axes: productRequiredGaps,
    diagnostic_gap_axes: diagnosticGaps,
    replay_check_inventory: replayCheckInventory,
    profile_coverage: buildProfileCoverage(),
    axes,
    summary_lines: [
      `Replay coverage: ${coveredAxes.length}/${axes.length} axes covered`,
      `Covered axes: ${coveredAxes.join(', ') || 'none'}`,
      `Product-required gaps: ${productRequiredGaps.join(', ') || 'none'}`,
      `Diagnostic-only gaps: ${diagnosticGaps.join(', ') || 'none'}`,
      ...(focusedAxisAudit ? focusedAxisAudit.summary_lines : []),
    ],
  };
}

const args = parseArgs(process.argv.slice(2));
const report = buildReport(args);
if (args.output) {
  report.output_path = await writeJson(args.output, report);
}
console.log(JSON.stringify(report, null, 2));
