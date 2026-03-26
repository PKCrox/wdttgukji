#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

function parseArgs(argv) {
  const args = {
    registry: path.join(process.cwd(), 'docs', 'agent-registry.json'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--registry') args.registry = argv[++i] || args.registry;
  }

  return args;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const registryPath = path.resolve(args.registry);
  const registry = await readJson(registryPath);
  const outPath = path.join(path.dirname(registryPath), 'agent-registry-summary.md');

  const markdown = `# Agent Registry Summary

- version: ${registry.version}
- updated_at: ${registry.updated_at}
- last_upgrade_run: ${registry.last_upgrade_run || 'n/a'}

## Agents

${(registry.agents || []).map((agent) => `### ${agent.id}

- role: ${agent.role}
- lanes: ${(agent.lanes || []).join(', ') || 'none'}
- mutation_scope: ${agent.mutation_scope}
- auto_upgrade: ${agent.auto_upgrade ? 'true' : 'false'}
- fit_signals: ${(agent.fit_signals || []).join(', ') || 'none'}
- upgrade_lanes: ${(agent.upgrade_lanes || []).join(', ') || 'none'}
`).join('\n')}

## Pending Agents

${(registry.pending_agents || []).length
  ? (registry.pending_agents || []).map((entry) => `- ${entry.lane}: ${entry.title} (${entry.status || 'pending'})`).join('\n')
  : '- none'}
`;

  await fs.writeFile(outPath, `${markdown}\n`, 'utf8');
  console.log(JSON.stringify({ output: outPath, agents: (registry.agents || []).length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
