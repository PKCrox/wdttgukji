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

function buildAgentMap(registry) {
  return new Map((registry.agents || []).map((agent) => [agent.id, agent]));
}

function getCooldownWindow(registry) {
  return Number(registry.upgrade_policy?.proposal_cooldown_runs || 2);
}

function collectRecentProposalKeys(registry) {
  const recent = registry.recent_proposals || [];
  return new Set(
    recent
      .slice(-getCooldownWindow(registry))
      .map((entry) => `${entry.type}:${entry.lane}:${entry.agent || 'lane'}`)
  );
}

function hasPendingLaneProposal(registry, lane) {
  return (registry.pending_agents || []).some((entry) => entry.lane === lane && entry.status !== 'resolved');
}

function agentAlreadyCoversLane(agent, lane) {
  const expected = [`${lane}_coverage`, `${lane}_handoff_quality`];
  return expected.every((signal) => (agent?.fit_signals || []).includes(signal));
}

function proposeChanges({ gaps, registry }) {
  const agentMap = buildAgentMap(registry);
  const recentProposalKeys = collectRecentProposalKeys(registry);
  const proposals = [];
  const skipped = [];

  for (const rec of gaps.recommendations || []) {
    if (rec.issue === 'missing_lane_ownership') {
      const key = `new-agent:${rec.lane}:lane`;
      if (hasPendingLaneProposal(registry, rec.lane) || recentProposalKeys.has(key)) {
        skipped.push({ lane: rec.lane, reason: 'pending_or_recent_new_agent_proposal_exists' });
        continue;
      }
      proposals.push({
        type: 'new-agent',
        lane: rec.lane,
        title: `Create a dedicated ${rec.lane} specialist`,
        rationale: `${rec.lane} has no explicit ownership in the registry.`,
        suggested_contract: {
          lanes: [rec.lane],
          mutation_scope: rec.lane === 'app-surface' ? 'product-core' : 'workflow',
          fit_signals: ['lane_coverage', 'gate_quality', 'handoff_quality'],
        },
      });
      continue;
    }

    if (rec.issue === 'expand_lane_capacity') {
      const key = `new-agent:${rec.lane}:lane`;
      if (hasPendingLaneProposal(registry, rec.lane) || recentProposalKeys.has(key)) {
        skipped.push({ lane: rec.lane, reason: 'pending_or_recent_capacity_expansion_exists' });
        continue;
      }
      proposals.push({
        type: 'new-agent',
        lane: rec.lane,
        title: `Create an additional ${rec.lane} specialist`,
        rationale: `${rec.lane} ownership exists, but coverage is weak and lane fitness is too low for the current owners.`,
        suggested_contract: {
          lanes: [rec.lane],
          mutation_scope: rec.lane === 'app-surface' ? 'product-core' : 'workflow',
          fit_signals: [`${rec.lane}_coverage`, `${rec.lane}_handoff_quality`, 'lane_coverage', 'handoff_quality'],
        },
      });
      continue;
    }

    if (rec.issue === 'weak_lane_coverage' || rec.issue === 'weak_lane_fitness') {
      const upgrades = rec.assigned_agents.map((agentId) => {
        const agent = agentMap.get(agentId);
        const key = `agent-upgrade:${rec.lane}:${agentId}`;
        if (!agent) {
          skipped.push({ lane: rec.lane, agent: agentId, reason: 'agent_missing' });
          return null;
        }
        if (agentAlreadyCoversLane(agent, rec.lane)) {
          skipped.push({ lane: rec.lane, agent: agentId, reason: 'lane_signals_already_present' });
          return null;
        }
        if (recentProposalKeys.has(key)) {
          skipped.push({ lane: rec.lane, agent: agentId, reason: 'recent_proposal_exists' });
          return null;
        }
        return {
          type: 'agent-upgrade',
          lane: rec.lane,
          agent: agentId,
          title: `Upgrade ${agentId} for ${rec.lane}`,
          rationale: `${rec.lane} coverage is weak despite existing ownership.`,
          suggested_changes: {
            add_fit_signals: [`${rec.lane}_coverage`, `${rec.lane}_handoff_quality`],
            add_review_prompt: `When ${rec.lane} stays under target, explain whether the issue is routing, missing capability, or contract shape.`,
            mutation_scope: agent?.mutation_scope || 'workflow',
          },
        };
      });
      proposals.push(...upgrades.filter(Boolean));
      continue;
    }

    if (rec.issue === 'repetition_pressure') {
      proposals.push({
        type: 'policy-upgrade',
        lane: rec.lane,
        title: 'Increase agent diversity pressure',
        rationale: 'The same agents/lanes are repeating too often across the meta-run.',
        suggested_changes: {
          routing_policy: 'increase repetition penalty and cool-down window',
          agent_registry: 'consider splitting overloaded agents into narrower specialists',
        },
      });
    }
  }

  return { proposals, skipped };
}

function toMarkdown(proposals) {
  if (!proposals.length) {
    return '# Agent Upgrade Proposals\n\n- No changes proposed.\n';
  }

  return `# Agent Upgrade Proposals

${proposals.map((proposal) => {
  const body = proposal.suggested_contract
    ? `- suggested_contract: \`${JSON.stringify(proposal.suggested_contract)}\``
    : proposal.suggested_changes
      ? `- suggested_changes: \`${JSON.stringify(proposal.suggested_changes)}\``
      : '- suggested_changes: n/a';
  return `## ${proposal.title}

- type: ${proposal.type}
- lane: ${proposal.lane}
- rationale: ${proposal.rationale}
${body}
`;
}).join('\n')}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runDir = path.resolve(args.runDir);
  const registry = await readJson(path.resolve(args.registry));
  const gaps = await readJson(path.join(runDir, 'agent-gaps.json'));
  const { proposals, skipped } = proposeChanges({ gaps, registry });

  const report = {
    analyzed_at: new Date().toISOString(),
    run_dir: runDir,
    proposal_count: proposals.length,
    skipped_count: skipped.length,
    skipped,
    proposals,
  };

  const jsonPath = path.join(runDir, 'agent-upgrade-proposals.json');
  const mdPath = path.join(runDir, 'agent-upgrade-proposals.md');
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(mdPath, `${toMarkdown(proposals)}\n`, 'utf8');

  console.log(JSON.stringify({ json: jsonPath, markdown: mdPath, proposals: proposals.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
