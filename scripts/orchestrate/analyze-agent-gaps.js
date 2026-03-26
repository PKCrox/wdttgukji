#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

function parseArgs(argv) {
  const args = {
    runDir: null,
    registry: path.join(process.cwd(), 'docs', 'agent-registry.json'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--run-dir') args.runDir = argv[++i] || null;
    else if (token === '--registry') args.registry = argv[++i] || args.registry;
  }

  if (!args.runDir) throw new Error('--run-dir is required');
  return args;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function readJsonIfExists(filePath, fallback) {
  try {
    return await readJson(filePath);
  } catch {
    return fallback;
  }
}

function rankCoverageGaps(requiredAxes, aggregate) {
  const totalCounts = aggregate.total_axis_counts || {};
  const averageCounts = aggregate.average_axis_counts || {};
  return requiredAxes.map((axis) => ({
    axis,
    total_count: totalCounts[axis] || 0,
    average_count: averageCounts[axis] || 0,
  })).sort((a, b) => a.total_count - b.total_count || a.axis.localeCompare(b.axis, 'ko'));
}

function buildLaneAgentIndex(registry) {
  const index = {};
  for (const agent of registry.agents || []) {
    for (const lane of agent.lanes || []) {
      if (!index[lane]) index[lane] = [];
      index[lane].push(agent.id);
    }
  }
  return index;
}

function deriveRecommendations({ aggregate, registry, fitness }) {
  const laneAgentIndex = buildLaneAgentIndex(registry);
  const requiredAxes = aggregate.required_axes || [];
  const coverageGaps = rankCoverageGaps(requiredAxes, aggregate);
  const laneFitness = Object.fromEntries((fitness.fitness || []).flatMap((entry) =>
    (entry.owned_lanes || []).map((lane) => [lane, Math.max(entry.score || 0, entry.average_lane_coverage || 0)])
  ));
  const recommendations = [];

  for (const lane of coverageGaps) {
    const assignedAgents = laneAgentIndex[lane.axis] || [];
    const lowCoverage = lane.total_count === 0 || lane.average_count < 1;
    const noOwnership = assignedAgents.length === 0;
    const lowFitness = (laneFitness[lane.axis] || 0) < 1.5;
    const pendingExists = (registry.pending_agents || []).some((entry) => entry.lane === lane.axis && entry.status !== 'resolved');
    if ((!lowCoverage && !noOwnership && !lowFitness) || pendingExists) continue;

    const narrowOwnership = assignedAgents.length <= 2;
    const issue = noOwnership
      ? 'missing_lane_ownership'
      : lowFitness && narrowOwnership
        ? 'expand_lane_capacity'
        : lowFitness
          ? 'weak_lane_fitness'
          : 'weak_lane_coverage';

    recommendations.push({
      lane: lane.axis,
      issue,
      assigned_agents: assignedAgents,
      lane_fitness: laneFitness[lane.axis] || 0,
      suggested_actions: noOwnership
        ? [`Create a dedicated ${lane.axis} owner or expand an adjacent agent.`]
        : issue === 'expand_lane_capacity'
          ? [`Create a specialist dedicated to ${lane.axis}.`, `Keep existing owners, but stop treating ${lane.axis} as a side-duty lane.`]
        : lowFitness
          ? [`Increase routing pressure for ${lane.axis}.`, `Expand fit signals or split ownership for ${lane.axis}.`]
          : [`Increase routing pressure for ${lane.axis}.`, `Review whether current agents expose enough fit signals for ${lane.axis}.`],
    });
  }

  if ((aggregate.max_candidate_streak_observed || 0) >= 3 || (aggregate.max_axis_streak_observed || 0) >= 3) {
    recommendations.push({
      lane: 'meta-review',
      issue: 'repetition_pressure',
      assigned_agents: ['release-orchestrator', 'pipeline-architect'],
      suggested_actions: [
        'Increase cool-down or repetition penalty in routing policy.',
        'Consider splitting overloaded agents into narrower specialists.',
      ],
    });
  }

  return recommendations;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const registry = await readJson(path.resolve(args.registry));
  const fitness = await readJsonIfExists(path.join(path.resolve(args.runDir), 'agent-fitness.json'), { fitness: [] });
  const aggregatePath = path.join(path.resolve(args.runDir), 'aggregate.json');
  const partialPath = path.join(path.resolve(args.runDir), 'aggregate.partial.json');

  let aggregate;
  try {
    aggregate = await readJson(aggregatePath);
  } catch {
    aggregate = await readJson(partialPath);
  }

  const recommendations = deriveRecommendations({ aggregate, registry, fitness });
  const laneAgentIndex = buildLaneAgentIndex(registry);

  const report = {
    analyzed_at: new Date().toISOString(),
    run_dir: path.resolve(args.runDir),
    required_axes: aggregate.required_axes || [],
    lane_agent_index: laneAgentIndex,
    lane_fitness: fitness.fitness || [],
    coverage_gaps: rankCoverageGaps(aggregate.required_axes || [], aggregate),
    recommendations,
  };

  const outPath = path.join(path.resolve(args.runDir), 'agent-gaps.json');
  await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ output: outPath, recommendations: recommendations.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
