#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

const root = process.cwd();

function parseArgs(argv) {
  const args = { scope: 'all' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--scope') args.scope = argv[i + 1] || 'all';
  }
  return args;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function countFiles(dirPath, suffix) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(suffix)).length;
}

async function checkCharacters() {
  const soulDir = path.join(root, 'data', 'characters');
  const soulDataDir = path.join(root, 'data', 'processed', 'soul-data');
  const soulCount = await countFiles(soulDir, '.soul.md');
  const soulDataCount = await countFiles(soulDataDir, '.txt');
  return {
    scope: 'characters',
    soulCount,
    soulDataCount,
    ok: soulCount >= 400 && soulDataCount >= 400,
    note: 'README baseline expects 426 soul.md and 423+ soul-data style artifacts.',
  };
}

async function checkEvents() {
  const eventsPath = path.join(root, 'data', 'events', 'all-events.json');
  const raw = await fs.readFile(eventsPath, 'utf8');
  const parsed = JSON.parse(raw);
  const eventCount = Array.isArray(parsed) ? parsed.length : Array.isArray(parsed.events) ? parsed.events.length : 0;
  return {
    scope: 'events',
    eventCount,
    ok: eventCount >= 300,
    note: 'README baseline expects 337 generated events.',
  };
}

async function checkWorld() {
  const geographyPath = path.join(root, 'data', 'processed', 'geography-expanded.json');
  const relationshipPath = path.join(root, 'data', 'processed', 'relationship-graph.json');
  const worldOk = await fileExists(geographyPath) && await fileExists(relationshipPath);
  return {
    scope: 'world',
    geographyExists: await fileExists(geographyPath),
    relationshipExists: await fileExists(relationshipPath),
    ok: worldOk,
    note: 'README core pipeline expects structured geography and relationship artifacts.',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const checks = [];

  if (args.scope === 'all' || args.scope === 'characters') checks.push(await checkCharacters());
  if (args.scope === 'all' || args.scope === 'events') checks.push(await checkEvents());
  if (args.scope === 'all' || args.scope === 'world') checks.push(await checkWorld());

  const report = {
    scope: args.scope,
    checks,
    ok: checks.every((entry) => entry.ok),
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
