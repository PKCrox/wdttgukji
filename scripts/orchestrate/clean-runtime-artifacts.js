#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

const TARGETS = [
  'runs',
  path.join('docs', 'automation-status'),
  path.join('scripts', 'orchestrate', 'generated', 'runtime-state.json'),
  path.join('scripts', 'orchestrate', 'generated', 'factory-runtime-summary.json'),
  'screenshot-build-tab.png',
  'screenshot-research-tab.png',
  'tmp-command-debug.png',
  'tmp-playwright-debug.png',
];

async function removeTarget(target) {
  const absolute = path.join(process.cwd(), target);
  await fs.rm(absolute, { recursive: true, force: true });
  return target;
}

async function main() {
  const removed = [];
  for (const target of TARGETS) {
    removed.push(await removeTarget(target));
  }
  console.log(JSON.stringify({
    status: 'cleaned',
    removed,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
