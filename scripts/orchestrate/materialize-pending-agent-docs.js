#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

function parseArgs(argv) {
  const args = {
    registry: path.join(process.cwd(), 'docs', 'agent-registry.json'),
    manifest: path.join(process.cwd(), 'scripts', 'orchestrate', 'generated', 'pending-agents', 'manifest.json'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--registry') args.registry = argv[++i] || args.registry;
    else if (token === '--manifest') args.manifest = argv[++i] || args.manifest;
  }

  return args;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function toTitle(value) {
  return String(value || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildDoc(payload, registry) {
  const registryVersion = registry.version || 0;
  const fitSignals = payload.suggested_contract?.fit_signals || [];
  const mutationScope = payload.suggested_contract?.mutation_scope || 'workflow';
  const lanes = payload.suggested_contract?.lanes || [payload.lane];

  return `# ${toTitle(payload.agent_id)}

자동 생성된 pending agent draft. 아직 canonical registry의 active agent는 아니며, meta review에서 승격 여부를 판단한다.

## Pending Status

- status: ${payload.status || 'pending'}
- lane: ${payload.lane}
- proposed_at: ${payload.proposed_at || 'n/a'}
- registry_version: ${registryVersion}

## Rationale

${payload.rationale}

## Suggested Contract

- lanes: ${lanes.join(', ') || 'none'}
- mutation_scope: ${mutationScope}
- fit_signals: ${fitSignals.join(', ') || 'none'}

## Initial Responsibilities

- ${payload.lane} lane의 부족한 ownership 또는 capacity를 보강
- 기존 agent가 부업처럼 처리하던 ${payload.lane} 업무를 전담
- meta run에서 ${payload.lane} coverage와 handoff quality를 끌어올리는 방향 제안

## Promotion Criteria

- ${payload.lane} lane이 2회 이상 연속 deficit 또는 missing 상태로 반복될 것
- 현재 pending rationale이 다음 meta review에서도 여전히 유효할 것
- 기존 active agent만으로는 ${payload.lane} coverage가 회복되지 않을 것

## Inputs

- latest meta-run aggregate
- agent-fitness.json
- agent-gaps.json
- agent-routing-state.json

## Outputs

- ${payload.lane} lane 전용 review notes
- handoff contract improvements
- routing pressure or lane split proposals
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const registry = await readJson(path.resolve(args.registry));
  const manifest = await readJson(path.resolve(args.manifest));
  const pendingDir = path.dirname(path.resolve(args.manifest));
  const updated = [];

  for (const relativeFile of manifest.files || []) {
    const payload = await readJson(path.resolve(process.cwd(), relativeFile));
    const docPath = path.resolve(process.cwd(), payload.target_doc_path);
    await fs.mkdir(path.dirname(docPath), { recursive: true });
    await fs.writeFile(docPath, `${buildDoc(payload, registry)}\n`, 'utf8');
    updated.push(path.relative(process.cwd(), docPath));
  }

  const summaryPath = path.join(pendingDir, 'docs-manifest.json');
  await fs.writeFile(summaryPath, `${JSON.stringify({
    generated_at: new Date().toISOString(),
    docs: updated,
  }, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({ updated, summary: summaryPath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
