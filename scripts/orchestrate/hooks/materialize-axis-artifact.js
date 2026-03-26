#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const root = process.cwd();

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

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonOrDefault(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function countFiles(dirPath, suffix) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(suffix)).length;
}

function countCollectionEntries(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

async function collectJsFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectJsFiles(fullPath);
    return fullPath.endsWith('.js') ? [fullPath] : [];
  }));
  return files.flat();
}

async function sha1(filePath) {
  const raw = await fs.readFile(filePath);
  return crypto.createHash('sha1').update(raw).digest('hex');
}

async function latestBalanceRun() {
  const runsDir = join(root, 'scripts', 'balance', 'runs');
  const files = (await readdir(runsDir))
    .filter((file) => file.endsWith('.json'))
    .sort((a, b) => Number(b.replace('.json', '')) - Number(a.replace('.json', '')));
  if (!files.length) throw new Error('No balance run files found');
  return join(runsDir, files[0]);
}

async function buildContentPipelineArtifact() {
  const soulDir = path.join(root, 'data', 'characters');
  const soulDataDir = path.join(root, 'data', 'processed', 'soul-data');
  const eventsPath = path.join(root, 'data', 'events', 'all-events.json');
  const geographyPath = path.join(root, 'data', 'processed', 'geography-expanded.json');
  const relationshipPath = path.join(root, 'data', 'processed', 'relationship-graph.json');
  const eventsRaw = await fs.readFile(eventsPath, 'utf8');
  const events = JSON.parse(eventsRaw);
  const eventCount = Array.isArray(events) ? events.length : Array.isArray(events.events) ? events.events.length : 0;

  return {
    lane: 'content-pipeline',
    soulCount: await countFiles(soulDir, '.soul.md'),
    soulDataCount: await countFiles(soulDataDir, '.txt'),
    eventCount,
    geographyExists: await fileExists(geographyPath),
    relationshipExists: await fileExists(relationshipPath),
    keyArtifacts: {
      eventsSha1: await sha1(eventsPath),
      geographySha1: await sha1(geographyPath),
      relationshipSha1: await sha1(relationshipPath),
    },
  };
}

async function buildEngineSliceArtifact() {
  const engineFiles = await collectJsFiles(path.join(root, 'engine'));
  const scenarioPath = path.join(root, 'engine', 'data', 'scenarios', '208-red-cliffs.json');
  const scenario = JSON.parse(await fs.readFile(scenarioPath, 'utf8'));
  return {
    lane: 'engine-slice',
    engineFileCount: engineFiles.length,
    coreModules: engineFiles
      .filter((file) => file.includes(`${path.sep}core${path.sep}`))
      .map((file) => path.relative(root, file))
      .sort(),
    scenario: {
      id: scenario.id,
      title: scenario.title,
      factionCount: countCollectionEntries(scenario.factions),
      cityCount: countCollectionEntries(scenario.cities),
      characterCount: countCollectionEntries(scenario.characters),
      connectionCount: countCollectionEntries(scenario.connections),
    },
    keyArtifacts: {
      scenarioSha1: await sha1(scenarioPath),
      gameStateSha1: await sha1(path.join(root, 'engine', 'core', 'game-state.js')),
      turnLoopSha1: await sha1(path.join(root, 'engine', 'core', 'turn-loop.js')),
    },
  };
}

async function buildDesignSurfaceArtifact() {
  const files = [
    path.join(root, 'public', 'index.html'),
    path.join(root, 'public', 'css', 'style.css'),
    path.join(root, 'public', 'js', 'app.js'),
    path.join(root, 'public', 'assets', 'maps', 'red-cliffs-base.svg'),
  ];
  const stats = await Promise.all(files.map(async (file) => ({
    path: path.relative(root, file),
    bytes: (await fs.stat(file)).size,
    sha1: await sha1(file),
  })));
  return {
    lane: 'design-surface',
    trackedFiles: stats,
    contracts: [
      'docs/macbook14-ux-contract.md',
      'docs/map-art-direction.md',
      'docs/ux-first-frame-priority.md',
    ],
  };
}

async function buildAutotestArtifact() {
  const runPath = await latestBalanceRun();
  const data = JSON.parse(await readFile(runPath, 'utf8'));
  return {
    lane: 'autotest',
    runFile: path.relative(root, runPath),
    balanceScore: data.balance_score,
    summary: data.summary || {},
    components: data.components || {},
  };
}

async function buildThemeArtifact() {
  const engineFiles = await collectJsFiles(path.join(root, 'engine'));
  let browserGlobalViolations = 0;
  let uiImportViolations = 0;

  for (const file of engineFiles) {
    const content = await fs.readFile(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line) => {
      if (/from ['"].*public\//.test(line) || /from ['"].*campaign-config/.test(line)) uiImportViolations += 1;
      if (/window\.|document\./.test(line)) browserGlobalViolations += 1;
    });
  }

  return {
    lane: 'theme-independence',
    checkedFiles: engineFiles.length,
    uiImportViolations,
    browserGlobalViolations,
    keyArtifacts: {
      balanceConfigSha1: await sha1(path.join(root, 'engine', 'core', 'balance-config.js')),
      factionAiSha1: await sha1(path.join(root, 'engine', 'ai', 'faction-ai.js')),
    },
  };
}

async function buildAppSurfaceArtifact() {
  const htmlPath = path.join(root, 'public', 'index.html');
  const appPath = path.join(root, 'public', 'js', 'app.js');
  const actionPanelPath = path.join(root, 'public', 'js', 'action-panel.js');
  const stylePath = path.join(root, 'public', 'css', 'style.css');
  const [html, appSource] = await Promise.all([
    fs.readFile(htmlPath, 'utf8'),
    fs.readFile(appPath, 'utf8'),
  ]);
  const screenIds = Array.from(html.matchAll(/id="([a-z-]+screen|game-screen|start-screen|faction-screen|intro-screen)"/g))
    .map((match) => match[1]);
  const transitionCards = (appSource.match(/showSceneTransitionCard/g) || []).length;
  const spotlightCards = (appSource.match(/showTurnSpotlight/g) || []).length;

  return {
    lane: 'app-surface',
    screenIds,
    stageCount: screenIds.length,
    transitionCards,
    spotlightCards,
    keyArtifacts: {
      htmlSha1: await sha1(htmlPath),
      appSha1: await sha1(appPath),
      actionPanelSha1: await sha1(actionPanelPath),
      styleSha1: await sha1(stylePath),
    },
  };
}

async function buildArtifact(axis) {
  if (axis === 'content-pipeline') return buildContentPipelineArtifact();
  if (axis === 'engine-slice') return buildEngineSliceArtifact();
  if (axis === 'design-surface') return buildDesignSurfaceArtifact();
  if (axis === 'autotest') return buildAutotestArtifact();
  if (axis === 'theme-independence') return buildThemeArtifact();
  if (axis === 'app-surface') return buildAppSurfaceArtifact();
  return {
    lane: axis,
    note: 'No artifact generator defined for axis',
  };
}

function toMarkdown(axis, payload, passRecord) {
  return `# ${axis} artifact

- updated_at: ${new Date().toISOString()}
- candidate: ${passRecord.candidate.label}
- pass_index: ${passRecord.index}
- run_dir: \`${passRecord.run_dir || 'n/a'}\`

\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\`
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const passRecord = JSON.parse(await fs.readFile(args.passJson, 'utf8'));
  passRecord.run_dir = args.runDir;
  const payload = await buildArtifact(args.axis);
  const baseDir = path.join(root, 'scripts', 'orchestrate', 'generated', 'axes');
  await ensureDir(baseDir);

  const jsonPath = path.join(baseDir, `${args.axis}.json`);
  const mdPath = path.join(baseDir, `${args.axis}.md`);
  const historyPath = path.join(baseDir, `${args.axis}.history.json`);
  await fs.writeFile(jsonPath, `${JSON.stringify({
    axis: args.axis,
    updated_at: new Date().toISOString(),
    candidate: passRecord.candidate.id,
    pass_index: passRecord.index,
    payload,
  }, null, 2)}\n`, 'utf8');
  await fs.writeFile(mdPath, `${toMarkdown(args.axis, payload, passRecord)}\n`, 'utf8');
  const history = await readJsonOrDefault(historyPath, []);
  history.push({
    updated_at: new Date().toISOString(),
    axis: args.axis,
    candidate: passRecord.candidate.id,
    pass_index: passRecord.index,
    run_dir: args.runDir,
    payload,
  });
  await fs.writeFile(historyPath, `${JSON.stringify(history.slice(-25), null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    axis: args.axis,
    json_output: jsonPath,
    markdown_output: mdPath,
    history_output: historyPath,
    status: 'materialized',
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
