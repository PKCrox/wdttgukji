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

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function mergeUnique(base = [], additions = []) {
  return Array.from(new Set([...(base || []), ...(additions || [])])).sort((a, b) => a.localeCompare(b, 'ko'));
}

function dedupePendingAgents(items = []) {
  const seen = new Set();
  const deduped = [];
  for (const item of items) {
    const key = `${item.lane}:${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const registryPath = path.resolve(args.registry);
  const runDir = path.resolve(args.runDir);
  const proposalsPath = path.join(runDir, 'agent-upgrade-proposals.json');
  const historyDir = path.join(path.dirname(registryPath), 'agent-registry-history');

  const registry = await readJson(registryPath);
  const proposals = await readJson(proposalsPath);
  const original = JSON.parse(JSON.stringify(registry));
  registry.pending_agents = dedupePendingAgents(registry.pending_agents || []);
  registry.recent_proposals = registry.recent_proposals || [];
  registry.upgrade_policy = {
    proposal_cooldown_runs: 2,
    ...(registry.upgrade_policy || {}),
  };

  const applied = [];
  for (const proposal of proposals.proposals || []) {
    if (proposal.type === 'agent-upgrade') {
      const agent = (registry.agents || []).find((entry) => entry.id === proposal.agent);
      if (!agent) continue;
      agent.fit_signals = mergeUnique(agent.fit_signals, proposal.suggested_changes?.add_fit_signals || []);
      agent.review_prompts = mergeUnique(agent.review_prompts, proposal.suggested_changes?.add_review_prompt ? [proposal.suggested_changes.add_review_prompt] : []);
      agent.upgrade_lanes = mergeUnique(agent.upgrade_lanes, proposal.lane ? [proposal.lane] : []);
      agent.last_upgrade_at = new Date().toISOString();
      applied.push({
        type: proposal.type,
        agent: proposal.agent,
        lane: proposal.lane,
      });
      continue;
    }

    if (proposal.type === 'new-agent') {
      registry.pending_agents = registry.pending_agents || [];
      registry.pending_agents.push({
        lane: proposal.lane,
        title: proposal.title,
        rationale: proposal.rationale,
        suggested_contract: proposal.suggested_contract || {},
        proposed_at: new Date().toISOString(),
        status: 'pending',
        review_count: 0,
      });
      applied.push({
        type: proposal.type,
        lane: proposal.lane,
      });
    }

    registry.recent_proposals.push({
      type: proposal.type,
      lane: proposal.lane,
      agent: proposal.agent || null,
      applied_at: new Date().toISOString(),
      source_run: runDir,
    });
  }

  registry.pending_agents = dedupePendingAgents(registry.pending_agents || []);
  registry.recent_proposals = (registry.recent_proposals || []).slice(-25);
  registry.version = Number(registry.version || 0) + 1;
  registry.updated_at = new Date().toISOString();
  registry.last_upgrade_run = runDir;

  await fs.mkdir(historyDir, { recursive: true });
  const historyPath = path.join(historyDir, `agent-registry-v${String(registry.version).padStart(3, '0')}.json`);
  await writeJson(historyPath, {
    upgraded_at: registry.updated_at,
    source_run: runDir,
    applied,
    previous_version: original.version || 0,
    next_version: registry.version,
    registry,
  });
  await writeJson(registryPath, registry);

  const summaryPath = path.join(runDir, 'agent-upgrade-application.json');
  await writeJson(summaryPath, {
    applied_at: registry.updated_at,
    registry_path: registryPath,
    history_path: historyPath,
    applied,
    new_version: registry.version,
  });

  console.log(JSON.stringify({
    registry: registryPath,
    history: historyPath,
    summary: summaryPath,
    applied: applied.length,
    version: registry.version,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
