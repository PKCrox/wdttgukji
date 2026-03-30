import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);

function readArg(flag, fallback = null) {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

function hasFlag(flag) {
  return args.includes(flag);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function getLatestLongRunDir(rootDir, explicitRunId) {
  if (explicitRunId) {
    return path.join(rootDir, explicitRunId);
  }

  const entries = fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('long-run-'))
    .map((entry) => ({
      name: entry.name,
      fullPath: path.join(rootDir, entry.name),
      mtimeMs: fs.statSync(path.join(rootDir, entry.name)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (!entries.length) {
    throw new Error(`No long-run directories found under ${rootDir}`);
  }

  return entries[0].fullPath;
}

function findLatestDurableRunId(runtimeRoot, startedAtMs, knownRunIds) {
  const entries = fs
    .readdirSync(runtimeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('durable-run-'))
    .map((entry) => {
      const fullPath = path.join(runtimeRoot, entry.name);
      const stat = fs.statSync(fullPath);
      return { name: entry.name, fullPath, mtimeMs: stat.mtimeMs };
    })
    .filter((entry) => entry.mtimeMs >= startedAtMs - 60_000)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return entries.find((entry) => !knownRunIds.has(entry.name))?.name ?? entries[0]?.name ?? null;
}

function findLatestPass(runtimeRoot, runId) {
  if (!runId) return null;
  const runDir = path.join(runtimeRoot, runId);
  if (!fileExists(runDir)) return null;

  const passFiles = fs
    .readdirSync(runDir)
    .filter((name) => /^pass-\d+\.json$/.test(name))
    .sort();

  if (!passFiles.length) return null;

  const fileName = passFiles[passFiles.length - 1];
  const payload = readJson(path.join(runDir, fileName));
  return {
    fileName,
    path: path.join(runDir, fileName),
    payload,
  };
}

function findCodexUsage(runtimeRoot, runId, passInfo) {
  if (!runId || !passInfo) return null;
  const passStem = passInfo.fileName.replace('.json', '');
  const candidates = [
    path.join(runtimeRoot, runId, 'codex', `${passStem}-usage.json`),
    path.join(runtimeRoot, runId, 'codex-factory', `${passStem}-usage.json`),
  ];
  for (const filePath of candidates) {
    if (fileExists(filePath)) {
      return readJson(filePath);
    }
  }
  return null;
}

function formatBatchSummary(batch) {
  const summary = batch.summary ?? {};
  const runId = summary.run_id ?? 'unknown-run';
  const passes = `${summary.completed_passes ?? 0}/${summary.requested_passes ?? 0}`;
  return `[batch ${batch.batch}] phase=${batch.phase} ok=${batch.ok} run=${runId} passes=${passes} reviews=${summary.review_count ?? 0}`;
}

function formatPassSummary(runId, passInfo) {
  const payload = passInfo.payload;
  const candidate = payload.candidate ?? {};
  const summary = payload.reprioritized?.command_summary ?? {};
  const usage = findCodexUsage(path.dirname(path.dirname(passInfo.path)), runId, passInfo);
  const usageText = usage
    ? ` tokens=${usage.delta_total_tokens ?? usage.total_tokens ?? 'n/a'} in=${usage.delta_input_tokens ?? usage.input_tokens ?? 'n/a'} out=${usage.delta_output_tokens ?? usage.output_tokens ?? 'n/a'} model=${usage.model ?? 'n/a'}`
    : '';
  return `[pass] run=${runId} ${passInfo.fileName.replace('.json', '')} candidate=${candidate.id ?? 'unknown'} axis=${candidate.axis ?? 'unknown'} ok=${payload.status ?? 'unknown'} commands=${summary.successfulCommands ?? 0}/${(summary.successfulCommands ?? 0) + (summary.failedCommands ?? 0) + (summary.softFailedCommands ?? 0)}${usageText}`;
}

async function main() {
  const longRunRoot = readArg('--long-run-root', path.resolve('runs/long-runs'));
  const runtimeRoot = readArg('--runtime-root', path.resolve('runs/durable-runtime'));
  const runId = readArg('--run-id');
  const intervalMs = Number(readArg('--interval-ms', '5000'));
  const once = hasFlag('--once');

  const longRunDir = getLatestLongRunDir(longRunRoot, runId);
  const statePath = path.join(longRunDir, 'state.json');
  const logPath = path.join(longRunDir, 'long-run.log');

  if (!fileExists(statePath) || !fileExists(logPath)) {
    throw new Error(`Missing state/log for long run at ${longRunDir}`);
  }

  const seenBatchKeys = new Set();
  const seenPassKeys = new Set();
  const knownRunIds = new Set();
  let logOffset = 0;

  console.log(`[monitor] long-run=${path.basename(longRunDir)}`);
  console.log(`[monitor] log=${logPath}`);

  while (true) {
    const state = readJson(statePath);
    const startedAtMs = Date.parse(state.started_at);

    if (fileExists(logPath)) {
      const content = fs.readFileSync(logPath, 'utf8');
      if (content.length > logOffset) {
        const chunk = content.slice(logOffset);
        logOffset = content.length;
        const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
        for (const line of lines) {
          console.log(`[log] ${line}`);
        }
      }
    }

    for (const batch of state.batches ?? []) {
      const key = `${batch.batch}:${batch.summary?.run_id ?? 'unknown'}`;
      if (seenBatchKeys.has(key)) continue;
      seenBatchKeys.add(key);
      if (batch.summary?.run_id) knownRunIds.add(batch.summary.run_id);
      console.log(formatBatchSummary(batch));
    }

    const latestKnownRunId = state.batches?.at(-1)?.summary?.run_id ?? null;
    const activeRunId = findLatestDurableRunId(runtimeRoot, startedAtMs, new Set([...knownRunIds].filter(Boolean)));
    const candidateRunIds = [activeRunId, latestKnownRunId].filter(Boolean);

    for (const durableRunId of candidateRunIds) {
      const passInfo = findLatestPass(runtimeRoot, durableRunId);
      if (!passInfo) continue;
      const key = `${durableRunId}:${passInfo.fileName}`;
      if (seenPassKeys.has(key)) continue;
      seenPassKeys.add(key);
      console.log(formatPassSummary(durableRunId, passInfo));
    }

    if (state.status !== 'running') {
      console.log(`[monitor] long-run status=${state.status} completed_batches=${state.completed_batches ?? 0}`);
      break;
    }

    if (once) break;
    await sleep(intervalMs);
  }
}

main().catch((error) => {
  console.error(`[monitor] failed: ${error.message}`);
  process.exit(1);
});
