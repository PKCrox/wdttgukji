#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

function parseArgs(argv) {
  const args = {
    axis: null,
    runDir: null,
    passJson: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--axis') args.axis = argv[++i] || null;
    else if (token === '--run-dir') args.runDir = argv[++i] || null;
    else if (token === '--pass-json') args.passJson = argv[++i] || null;
  }

  if (!args.axis) throw new Error('--axis is required');
  if (!args.runDir) throw new Error('--run-dir is required');
  if (!args.passJson) throw new Error('--pass-json is required');
  return args;
}

function axisFileName(axis) {
  return axis.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function summarizeCommands(commands) {
  return commands.map((entry) => {
    const status = entry.ok ? 'pass' : (entry.allowFailure ? 'soft-fail' : 'fail');
    return `- [${status}] \`${entry.phase}\` ${entry.command}`;
  }).join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const passRecord = JSON.parse(await fs.readFile(args.passJson, 'utf8'));
  const docsDir = path.join(process.cwd(), 'docs', 'automation-status');
  await ensureDir(docsDir);

  const outputPath = path.join(docsDir, `${axisFileName(args.axis)}.md`);
  const content = `# ${args.axis} status

- updated_at: ${new Date().toISOString()}
- run_dir: \`${args.runDir}\`
- pass_index: ${passRecord.index}
- candidate: ${passRecord.candidate.label}
- status: ${passRecord.status}
- automation_level: ${passRecord.candidate.automationLevel}

## Acceptance Signals

${(passRecord.candidate.acceptanceSignals || []).map((signal) => `- ${signal}`).join('\n')}

## Commands

${summarizeCommands(passRecord.commands)}

## Reprioritization

- dominant_bottleneck: ${passRecord.reprioritized?.dominant_bottleneck || 'n/a'}
- chosen_next_pass: ${passRecord.reprioritized?.chosen_next_pass || 'n/a'}
- why_not_others:
${(passRecord.reprioritized?.why_not_others || []).map((item) => `  - ${item}`).join('\n') || '  - n/a'}
`;

  await fs.writeFile(outputPath, `${content}\n`, 'utf8');
  console.log(JSON.stringify({
    axis: args.axis,
    output: outputPath,
    status: 'updated',
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
