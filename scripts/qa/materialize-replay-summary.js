#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const args = {
    input: null,
    output: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--input') args.input = argv[++index] || null;
    else if (token === '--output') args.output = argv[++index] || null;
  }

  if (!args.input) throw new Error('--input is required');
  if (!args.output) throw new Error('--output is required');
  return args;
}

function buildDigest(summary, inputPath) {
  const checks = Array.isArray(summary?.checks) ? summary.checks : [];
  const passedChecks = checks.filter((check) => check?.status === 'passed');
  const failedChecks = checks.filter((check) => check?.status === 'failed');

  return {
    source_path: inputPath,
    source_file: path.basename(inputPath),
    generated_at: new Date().toISOString(),
    status: summary?.status || 'unknown',
    axis: summary?.axis || null,
    total_checks: checks.length,
    passed_count: passedChecks.length,
    failed_count: failedChecks.length,
    passed_check_ids: passedChecks.map((check) => check.id),
    failed_check_ids: failedChecks.map((check) => check.id),
    checks: checks.map((check) => ({
      id: check.id,
      status: check.status,
      script: check.script,
      trace_id: check.report?.trace_id ?? null,
      report_keys: check.report && typeof check.report === 'object'
        ? Object.keys(check.report).slice(0, 8)
        : [],
      failure_summary: check.failure_summary || null,
    })),
  };
}

async function main() {
  const { input, output } = parseArgs(process.argv.slice(2));
  const summary = JSON.parse(await fs.readFile(input, 'utf8'));
  const digest = buildDigest(summary, input);

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(digest, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(digest, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
