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

function buildLaneStats(aggregate) {
  const totalAxisCounts = aggregate.total_axis_counts || {};
  const avgAxisCounts = aggregate.average_axis_counts || {};
  const requiredAxes = aggregate.required_axes || Object.keys(totalAxisCounts);
  return Object.fromEntries(
    requiredAxes.map((axis) => [axis, {
      total: totalAxisCounts[axis] || 0,
      average: avgAxisCounts[axis] || 0,
    }])
  );
}

function scoreAgent(agent, laneStats) {
  const ownedLanes = (agent.lanes || []).filter((lane) => laneStats[lane]);
  const coverage = ownedLanes.reduce((acc, lane) => acc + (laneStats[lane]?.average || 0), 0);
  const ownershipBreadth = ownedLanes.length;
  const score = Number((coverage + (ownershipBreadth * 0.25)).toFixed(2));
  return {
    agent: agent.id,
    owned_lanes: ownedLanes,
    average_lane_coverage: Number((ownedLanes.reduce((acc, lane) => acc + (laneStats[lane]?.average || 0), 0) / Math.max(ownedLanes.length, 1)).toFixed(2)),
    score,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runDir = path.resolve(args.runDir);
  const registry = await readJson(path.resolve(args.registry));
  const aggregatePath = path.join(runDir, 'aggregate.json');
  const partialPath = path.join(runDir, 'aggregate.partial.json');
  let aggregate;
  try {
    aggregate = await readJson(aggregatePath);
  } catch {
    aggregate = await readJson(partialPath);
  }

  const laneStats = buildLaneStats(aggregate);
  const fitness = (registry.agents || [])
    .map((agent) => scoreAgent(agent, laneStats))
    .sort((a, b) => b.score - a.score || a.agent.localeCompare(b.agent, 'ko'));

  const report = {
    analyzed_at: new Date().toISOString(),
    run_dir: runDir,
    lane_stats: laneStats,
    fitness,
  };

  const outPath = path.join(runDir, 'agent-fitness.json');
  await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ output: outPath, agents: fitness.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
