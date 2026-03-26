#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const GENERATED_DIR = path.join(ROOT, 'scripts', 'orchestrate', 'generated');
const AXES_DIR = path.join(GENERATED_DIR, 'axes');
const SNAPSHOT_DIR = path.join(GENERATED_DIR, 'snapshots');
const SNAPSHOT_PATH = path.join(SNAPSHOT_DIR, 'product-core-snapshot.json');
const LATEST_MD_PATH = path.join(SNAPSHOT_DIR, 'product-core-snapshot.md');

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

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJsonOrDefault(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function summarizeAxisArtifact(axis, payload) {
  if (!payload) return { axis, status: 'missing' };

  if (axis === 'engine-slice') {
    return {
      axis,
      status: 'ready',
      summary: `scenario ${payload.scenario?.id || 'n/a'} / factions ${payload.scenario?.factionCount ?? 0} / cities ${payload.scenario?.cityCount ?? 0}`,
    };
  }
  if (axis === 'design-surface') {
    return {
      axis,
      status: 'ready',
      summary: `tracked files ${Array.isArray(payload.trackedFiles) ? payload.trackedFiles.length : 0}`,
    };
  }
  if (axis === 'content-pipeline') {
    return {
      axis,
      status: 'ready',
      summary: `souls ${payload.soulCount ?? 0} / events ${payload.eventCount ?? 0}`,
    };
  }
  if (axis === 'autotest') {
    return {
      axis,
      status: 'ready',
      summary: `balance ${payload.balanceScore ?? 'n/a'} / anomaly ${(payload.summary?.anomalyRate ?? 'n/a')}`,
    };
  }
  if (axis === 'theme-independence') {
    return {
      axis,
      status: 'ready',
      summary: `ui leaks ${payload.uiImportViolations ?? 0} / browser globals ${payload.browserGlobalViolations ?? 0}`,
    };
  }
  if (axis === 'app-surface') {
    return {
      axis,
      status: 'ready',
      summary: `stages ${payload.stageCount ?? 0} / transition cards ${payload.transitionCards ?? 0}`,
    };
  }

  return { axis, status: 'ready', summary: 'artifact present' };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const passRecord = JSON.parse(await fs.readFile(args.passJson, 'utf8'));
  const runState = JSON.parse(await fs.readFile(path.join(args.runDir, 'state.json'), 'utf8'));
  const runtimeState = await readJsonOrDefault(path.join(GENERATED_DIR, 'runtime-state.json'), {});
  const factorySummary = await readJsonOrDefault(path.join(GENERATED_DIR, 'factory-runtime-summary.json'), {});

  const axes = ['engine-slice', 'design-surface', 'content-pipeline', 'autotest', 'theme-independence', 'app-surface'];
  const axisArtifacts = {};

  for (const axis of axes) {
    const artifact = await readJsonOrDefault(path.join(AXES_DIR, `${axis}.json`), null);
    axisArtifacts[axis] = artifact?.payload || null;
  }

  const snapshot = {
    updated_at: new Date().toISOString(),
    source_axis: args.axis,
    source_candidate: passRecord.candidate.id,
    run_id: runState.run_id,
    pass_index: passRecord.index,
    product_anchors: runState.product_anchors || [],
    review_hints: runState.reviewHints || {},
    runtime_state: {
      last_run_id: runtimeState.last_run_id || null,
      persistentBoostAxes: runtimeState.persistentBoostAxes || [],
    },
    factory_summary: {
      lastRunId: factorySummary.lastRunId || null,
      persistentBoostAxes: factorySummary.persistentBoostAxes || [],
    },
    axes: Object.fromEntries(
      Object.entries(axisArtifacts).map(([axis, payload]) => [axis, summarizeAxisArtifact(axis, payload)])
    ),
  };

  await ensureDir(SNAPSHOT_DIR);
  await fs.writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  const markdown = `# Product Core Snapshot

- updated_at: ${snapshot.updated_at}
- run_id: ${snapshot.run_id}
- source_axis: ${snapshot.source_axis}
- pass_index: ${snapshot.pass_index}
- persistent_boost_axes: ${(snapshot.runtime_state.persistentBoostAxes || []).join(', ') || 'none'}

## Axes

${Object.values(snapshot.axes).map((entry) => `- ${entry.axis}: ${entry.summary}`).join('\n')}
`;

  await fs.writeFile(LATEST_MD_PATH, `${markdown}\n`, 'utf8');

  console.log(JSON.stringify({
    output: SNAPSHOT_PATH,
    markdown_output: LATEST_MD_PATH,
    status: 'updated',
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
