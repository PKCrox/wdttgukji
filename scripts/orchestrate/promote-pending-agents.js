#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

function parseArgs(argv) {
  const args = {
    registry: path.join(process.cwd(), 'docs', 'agent-registry.json'),
    runDir: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--registry') args.registry = argv[++i] || args.registry;
    else if (token === '--run-dir') args.runDir = argv[++i] || null;
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

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildAgentId(lane) {
  return `${lane}-specialist`;
}

function toTitle(value) {
  return String(value || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function roleFromLane(lane) {
  const map = {
    'theme-independence': 'theme-specialist',
    'content-pipeline': 'content-specialist',
    autotest: 'autotest-specialist',
    'engine-slice': 'engine-specialist',
    'design-surface': 'design-specialist',
    'app-surface': 'app-specialist',
  };
  return map[lane] || 'specialist';
}

function buildActiveDoc({ id, lane, suggestedContract, rationale, reviewCount, registryVersion }) {
  const lanes = suggestedContract?.lanes || [lane];
  const mutationScope = suggestedContract?.mutation_scope || 'workflow';
  const fitSignals = suggestedContract?.fit_signals || [];

  return `# ${toTitle(id)}

자동 승격된 specialist agent. meta review에서 반복적으로 부족했던 lane을 전담하기 위해 pending 상태에서 active registry로 올라왔다.

## Ownership

- lane: ${lane}
- mutation_scope: ${mutationScope}
- promoted_after_reviews: ${reviewCount}
- registry_version: ${registryVersion}

## Rationale

${rationale}

## Responsibilities

- ${lane} lane의 전담 owner로서 coverage와 handoff quality를 끌어올린다
- 기존 generalist agent가 부업처럼 처리하던 ${lane} 작업을 분리한다
- meta review에서 ${lane} 전용 병목을 설명하고 routing pressure 조정 근거를 남긴다

## Inputs

- latest meta-run aggregate
- agent-fitness.json
- agent-gaps.json
- agent-routing-state.json

## Outputs

- ${lane} lane 전용 review notes
- routing pressure recommendations
- handoff contract improvements

<!-- AUTO_AGENT_REGISTRY_START -->
## Registry Sync
- id: ${id}
- mutation_scope: ${mutationScope}
- auto_upgrade: true
- lanes: ${lanes.join(', ') || 'none'}
- fit_signals: ${fitSignals.join(', ') || 'none'}
- upgrade_lanes: ${lane}
<!-- AUTO_AGENT_REGISTRY_END -->
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const registryPath = path.resolve(args.registry);
  const runDir = path.resolve(args.runDir);
  const routingState = await readJson(path.join(runDir, 'agent-routing-state.json'));
  const registry = await readJson(registryPath);
  const historyDir = path.join(path.dirname(registryPath), 'agent-registry-history');
  const original = JSON.parse(JSON.stringify(registry));

  const promoted = [];
  const retained = [];
  const nextPending = [];
  const now = new Date().toISOString();

  for (const pending of registry.pending_agents || []) {
    const laneUrgency = Number(routingState.laneUrgency?.[pending.lane] || 0);
    const reviewCount = Number(pending.review_count || 0) + (laneUrgency >= 2.5 ? 1 : 0);
    const updatedPending = {
      ...pending,
      review_count: reviewCount,
      last_reviewed_at: now,
    };

    const agentId = buildAgentId(pending.lane);
    const alreadyActive = (registry.agents || []).some((agent) => agent.id === agentId);
    const shouldPromote = !alreadyActive && reviewCount >= 2;

    if (shouldPromote) {
      const docPath = path.join(process.cwd(), 'ai', 'agents', `${slugify(agentId)}.md`);
      await fs.mkdir(path.dirname(docPath), { recursive: true });
      await fs.writeFile(docPath, `${buildActiveDoc({
        id: agentId,
        lane: pending.lane,
        suggestedContract: pending.suggested_contract || {},
        rationale: pending.rationale,
        reviewCount,
        registryVersion: Number(registry.version || 0) + 1,
      })}\n`, 'utf8');

      registry.agents.push({
        id: agentId,
        path: path.relative(process.cwd(), docPath),
        role: roleFromLane(pending.lane),
        lanes: pending.suggested_contract?.lanes || [pending.lane],
        mutation_scope: pending.suggested_contract?.mutation_scope || 'workflow',
        auto_upgrade: true,
        fit_signals: pending.suggested_contract?.fit_signals || ['lane_coverage', 'handoff_quality'],
        review_prompts: [
          `When ${pending.lane} stays under target, explain whether the lane still needs a dedicated specialist or the routing policy is insufficient.`,
        ],
        upgrade_lanes: [pending.lane],
        promoted_from_pending: true,
        promoted_at: now,
      });
      promoted.push({
        lane: pending.lane,
        id: agentId,
        path: path.relative(process.cwd(), docPath),
      });
      continue;
    }

    if (alreadyActive) {
      retained.push({
        lane: pending.lane,
        reason: 'already_active',
      });
      continue;
    }

    nextPending.push(updatedPending);
    retained.push({
      lane: pending.lane,
      review_count: reviewCount,
    });
  }

  registry.pending_agents = nextPending;
  registry.version = Number(registry.version || 0) + 1;
  registry.updated_at = now;
  registry.last_upgrade_run = runDir;

  await fs.mkdir(historyDir, { recursive: true });
  const historyPath = path.join(historyDir, `agent-registry-v${String(registry.version).padStart(3, '0')}.json`);
  await writeJson(historyPath, {
    upgraded_at: now,
    source_run: runDir,
    previous_version: original.version || 0,
    next_version: registry.version,
    promoted,
    retained,
    registry,
  });
  await writeJson(registryPath, registry);

  const outPath = path.join(runDir, 'pending-agent-promotion.json');
  await writeJson(outPath, {
    promoted_at: now,
    promoted,
    retained,
    registry_path: registryPath,
    history_path: historyPath,
  });

  console.log(JSON.stringify({ output: outPath, promoted: promoted.length, retained: retained.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
