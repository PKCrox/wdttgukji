#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

function parseArgs(argv) {
  const args = {
    runDir: null,
    registry: path.join(process.cwd(), 'docs', 'agent-registry.json'),
    out: path.join(process.cwd(), 'scripts', 'orchestrate', 'generated', 'agent-routing-state.json'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--run-dir') args.runDir = argv[++i] || null;
    else if (token === '--registry') args.registry = argv[++i] || args.registry;
    else if (token === '--out') args.out = argv[++i] || args.out;
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

function round(value) {
  return Number(Number(value || 0).toFixed(2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runDir = path.resolve(args.runDir);
  const registry = await readJson(path.resolve(args.registry));
  const fitness = await readJsonIfExists(path.join(runDir, 'agent-fitness.json'), { lane_stats: {}, fitness: [] });
  const gaps = await readJsonIfExists(path.join(runDir, 'agent-gaps.json'), { coverage_gaps: [] });
  const proposals = await readJsonIfExists(path.join(runDir, 'agent-upgrade-proposals.json'), { proposals: [] });

  const laneUrgency = {};
  const laneDiagnostics = {};
  for (const [lane, stats] of Object.entries(fitness.lane_stats || {})) {
    const gap = (gaps.coverage_gaps || []).find((entry) => entry.axis === lane);
    const pendingCount = (registry.pending_agents || []).filter((entry) => entry.lane === lane && entry.status !== 'resolved').length;
    const proposalCount = (proposals.proposals || []).filter((entry) => entry.lane === lane).length;
    const urgency =
      Math.max(0, 2 - Number(stats.average || 0))
      + ((gap?.average_count || 0) < 1 ? 1.5 : 0)
      + proposalCount
      + (pendingCount ? 0.5 : 0);

    laneUrgency[lane] = round(urgency);
    laneDiagnostics[lane] = {
      averageCoverage: round(stats.average || 0),
      totalCoverage: stats.total || 0,
      pendingCount,
      proposalCount,
      urgency: laneUrgency[lane],
    };
  }

  const payload = {
    updated_at: new Date().toISOString(),
    source_run: runDir,
    registry_version: registry.version || 0,
    laneUrgency,
    laneDiagnostics,
    pendingAgents: registry.pending_agents || [],
  };

  const outPath = path.resolve(args.out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const runCopy = path.join(runDir, 'agent-routing-state.json');
  await fs.writeFile(runCopy, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({ output: outPath, run_copy: runCopy }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
