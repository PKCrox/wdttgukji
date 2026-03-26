#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

const START = '<!-- AUTO_AGENT_REGISTRY_START -->';
const END = '<!-- AUTO_AGENT_REGISTRY_END -->';

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

function buildBlock(agent) {
  const lines = [
    START,
    '## Registry Sync',
    `- id: ${agent.id}`,
    `- mutation_scope: ${agent.mutation_scope}`,
    `- auto_upgrade: ${agent.auto_upgrade ? 'true' : 'false'}`,
    `- lanes: ${(agent.lanes || []).join(', ') || 'none'}`,
    `- fit_signals: ${(agent.fit_signals || []).join(', ') || 'none'}`,
    `- upgrade_lanes: ${(agent.upgrade_lanes || []).join(', ') || 'none'}`,
  ];

  if (Array.isArray(agent.review_prompts) && agent.review_prompts.length) {
    lines.push('- review_prompts:');
    for (const prompt of agent.review_prompts) {
      lines.push(`  - ${prompt}`);
    }
  }

  lines.push(END);
  return `${lines.join('\n')}\n`;
}

async function updateDoc(docPath, block) {
  const content = await fs.readFile(docPath, 'utf8');
  if (content.includes(START) && content.includes(END)) {
    return content.replace(new RegExp(`${START}[\\s\\S]*?${END}\\n?`, 'm'), block);
  }
  return `${content.trimEnd()}\n\n${block}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const registry = await readJson(path.resolve(args.registry));
  const updated = [];

  for (const agent of registry.agents || []) {
    if (!agent.path) continue;
    const docPath = path.resolve(process.cwd(), agent.path);
    const nextContent = await updateDoc(docPath, buildBlock(agent));
    await fs.writeFile(docPath, nextContent, 'utf8');
    updated.push(agent.path);
  }

  console.log(JSON.stringify({ updated }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
