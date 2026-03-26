#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

function parseArgs(argv) {
  const args = {
    registry: path.join(process.cwd(), 'docs', 'agent-registry.json'),
    outDir: path.join(process.cwd(), 'scripts', 'orchestrate', 'generated', 'pending-agents'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--registry') args.registry = argv[++i] || args.registry;
    else if (token === '--out-dir') args.outDir = argv[++i] || args.outDir;
  }

  return args;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildPendingAgentId(entry) {
  return `${entry.lane}-specialist`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const registry = await readJson(path.resolve(args.registry));
  const outDir = path.resolve(args.outDir);
  await fs.mkdir(outDir, { recursive: true });

  const pending = (registry.pending_agents || []).filter((entry) => entry.status !== 'resolved');
  const generated = [];

  for (const entry of pending) {
    const agentId = buildPendingAgentId(entry);
    const slug = slugify(agentId);
    const payload = {
      agent_id: agentId,
      lane: entry.lane,
      title: entry.title,
      rationale: entry.rationale,
      suggested_contract: entry.suggested_contract || {},
      status: entry.status || 'pending',
      proposed_at: entry.proposed_at || null,
      target_doc_path: `ai/agents/pending/${slug}.md`,
    };
    const filePath = path.join(outDir, `${slug}.json`);
    await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    generated.push(path.relative(process.cwd(), filePath));
  }

  const manifestPath = path.join(outDir, 'manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify({
    generated_at: new Date().toISOString(),
    pending_count: pending.length,
    files: generated,
  }, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({ manifest: manifestPath, generated_count: generated.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
