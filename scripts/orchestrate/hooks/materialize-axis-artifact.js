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

function buildRouteContext(axis, runtimeState, factorySummary, agentRoutingState) {
  const routeContextOrigin = (() => {
    if (agentRoutingState?.routeContextOrigin) return agentRoutingState.routeContextOrigin;
    if (agentRoutingState?.routeSummary || agentRoutingState?.routeSource) return 'agent-routing-state';
    if (runtimeState?.routeContextOrigin) return runtimeState.routeContextOrigin;
    if (runtimeState?.routeSource === 'agent-routing-state') return 'agent-routing-state';
    if (runtimeState?.routeSource === 'factory-summary') return 'factory-summary';
    if (runtimeState?.routeSummary || runtimeState?.routeSource) return 'runtime-state';
    if (factorySummary?.routeContextOrigin) return factorySummary.routeContextOrigin;
    if (factorySummary?.routeSource === 'agent-routing-state') return 'agent-routing-state';
    if (factorySummary?.routeSummary || factorySummary?.routeSource) return 'factory-summary';
    return 'derived';
  })();
  const routeSource = agentRoutingState?.routeSource
    || runtimeState?.routeSource
    || factorySummary?.routeSource
    || (runtimeState?.primaryFocusAxis ? 'runtime-state' : null)
    || 'derived';
  const primaryFocusAxis = runtimeState?.primaryFocusAxis
    || factorySummary?.primaryFocusAxis
    || agentRoutingState?.primaryFocusAxis
    || runtimeState?.persistentBoostAxes?.[0]
    || null;
  const topUrgencyLane = agentRoutingState?.topUrgencyLane
    || runtimeState?.topUrgencyLane
    || factorySummary?.topUrgencyLane
    || null;
  const topUrgencyValue = agentRoutingState?.topUrgencyValue
    ?? runtimeState?.topUrgencyValue
    ?? factorySummary?.topUrgencyValue
    ?? null;
  const topUrgencyTie = Array.isArray(agentRoutingState?.topUrgencyTie) && agentRoutingState.topUrgencyTie.length
    ? agentRoutingState.topUrgencyTie
    : Array.isArray(runtimeState?.topUrgencyTie) && runtimeState.topUrgencyTie.length
      ? runtimeState.topUrgencyTie
      : Array.isArray(factorySummary?.topUrgencyTie) && factorySummary.topUrgencyTie.length
        ? factorySummary.topUrgencyTie
      : [];
  const topUrgencyTieCount = agentRoutingState?.topUrgencyTieCount
    ?? runtimeState?.topUrgencyTieCount
    ?? factorySummary?.topUrgencyTieCount
    ?? topUrgencyTie.length;
  const urgencySnapshot = agentRoutingState?.urgencySnapshot
    || runtimeState?.urgencySnapshot
    || factorySummary?.urgencySnapshot
    || (agentRoutingState?.sortedLanes || [])
      .slice(0, 3)
      .map((entry) => `${entry?.lane || entry?.axis || entry?.name || 'n/a'}:${entry?.urgency ?? 'n/a'}`)
      .join(', ');
  const routeConfidence = agentRoutingState?.routeConfidence
    || runtimeState?.routeConfidence
    || factorySummary?.routeConfidence
    || runtimeState?.axisStatus?.[axis]?.selection_confidence
    || (primaryFocusAxis ? (primaryFocusAxis === axis ? 'aligned' : 'boosted') : 'unknown');
  const routeConfidenceText = agentRoutingState?.routeConfidenceText
    || runtimeState?.routeConfidenceText
    || factorySummary?.routeConfidenceText
    || (routeConfidence === 'tied'
      ? `tied (${topUrgencyTieCount}-way tie)`
      : routeConfidence);
  const topUrgencyTieText = agentRoutingState?.topUrgencyTieText
    || runtimeState?.topUrgencyTieText
    || factorySummary?.topUrgencyTieText
    || (topUrgencyTie.length
      ? `${topUrgencyTie.join(', ')} (${topUrgencyValue ?? 'n/a'})`
      : 'none');
  return {
    route_context_origin: routeContextOrigin,
    route_source: routeSource,
    urgency_snapshot: urgencySnapshot,
    top_urgency_lane: topUrgencyLane,
    top_urgency_value: topUrgencyValue,
    top_urgency_tie: topUrgencyTie,
    top_urgency_tie_text: topUrgencyTieText,
    top_urgency_tie_count: topUrgencyTieCount,
    primary_focus_axis: primaryFocusAxis,
    focus_alignment: runtimeState?.focusAlignment
      || factorySummary?.focusAlignment
      || (primaryFocusAxis
        ? (primaryFocusAxis === axis ? 'aligned' : `boosted toward ${primaryFocusAxis}`)
        : 'unknown'),
    route_confidence: routeConfidence,
    route_confidence_raw: routeConfidence,
    route_confidence_text: routeConfidenceText,
    route_summary: (() => {
      const baseRouteSummary = agentRoutingState?.routeSummary
        || runtimeState?.routeSummary
        || factorySummary?.routeSummary
        || `${primaryFocusAxis
          ? (primaryFocusAxis === axis ? 'aligned' : `boosted toward ${primaryFocusAxis}`)
          : 'unknown'}${topUrgencyTieText !== 'none'
            ? ` · tie ${topUrgencyTieText}`
            : ''} · ${agentRoutingState?.routeConfidenceText
          || routeConfidenceText} · ${routeSource} · origin ${routeContextOrigin}`;
      return baseRouteSummary.includes('· origin ') ? baseRouteSummary : `${baseRouteSummary} · origin ${routeContextOrigin}`;
    })(),
  };
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

async function buildMapArtArtifact(lane = 'map-art') {
  const directionPath = path.join(root, 'docs', 'map-art-direction.md');
  const baseMapPath = path.join(root, 'public', 'assets', 'maps', 'red-cliffs-base.svg');
  const rendererPath = path.join(root, 'public', 'js', 'map-renderer.js');
  const appPath = path.join(root, 'public', 'js', 'app.js');
  const direction = await fs.readFile(directionPath, 'utf8');
  const svg = await fs.readFile(baseMapPath, 'utf8');
  const rendererSource = await fs.readFile(rendererPath, 'utf8');
  const appSource = await fs.readFile(appPath, 'utf8');
  const viewBoxMatch = svg.match(/viewBox="([^"]+)"/i);
  const sizeMatch = svg.match(/width="([^"]+)".*height="([^"]+)"/is);
  const prioritySection = direction
    .split('\n')
    .filter((line) => /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^\d+\.\s+/, '').trim())
    .filter(Boolean);

  return {
    lane,
    directionDoc: {
      path: path.relative(root, directionPath),
      sha1: await sha1(directionPath),
      priorities: prioritySection,
    },
    baseMap: {
      path: path.relative(root, baseMapPath),
      bytes: (await fs.stat(baseMapPath)).size,
      viewBox: viewBoxMatch?.[1] || null,
      width: sizeMatch?.[1] || null,
      height: sizeMatch?.[2] || null,
      elementCounts: {
        paths: (svg.match(/<path\b/gi) || []).length,
        polygons: (svg.match(/<polygon\b/gi) || []).length,
        circles: (svg.match(/<circle\b/gi) || []).length,
        lines: (svg.match(/<line\b/gi) || []).length,
        groups: (svg.match(/<g\b/gi) || []).length,
      },
    },
    rendererContract: {
      path: path.relative(root, rendererPath),
      sha1: await sha1(rendererPath),
      baseAssetReference: rendererSource.includes('/assets/maps/red-cliffs-base.svg'),
      territoryLayerReference: rendererSource.includes('territoryPolygons'),
      viewportLockReference: rendererSource.includes('measureMapViewport'),
      appShellPath: path.relative(root, appPath),
      appShellSha1: await sha1(appPath),
      appShellBaseAssetReference: appSource.includes('/assets/maps/red-cliffs-base.svg'),
    },
  };
}

function extractBullets(markdown, heading) {
  const lines = markdown.split('\n');
  const startIndex = lines.findIndex((line) => line.trim() === heading);
  if (startIndex < 0) return [];

  const bullets = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    if (line.startsWith('## ') && line !== heading) break;
    if (line.startsWith('- ')) bullets.push(line.slice(2).trim());
    if (/^\d+\.\s+/.test(line)) bullets.push(line.replace(/^\d+\.\s+/, '').trim());
  }
  return bullets;
}

async function buildUxFirstFrameArtifact() {
  const priorityPath = path.join(root, 'docs', 'ux-first-frame-priority.md');
  const contractPath = path.join(root, 'docs', 'macbook14-ux-contract.md');
  const priorityDoc = await fs.readFile(priorityPath, 'utf8');
  const contractDoc = await fs.readFile(contractPath, 'utf8');

  return {
    lane: 'ux-first-frame',
    viewport: '1512x982',
    priorityDoc: {
      path: path.relative(root, priorityPath),
      sha1: await sha1(priorityPath),
      startScreen: {
        mustShow: extractBullets(priorityDoc, '## 시작 화면'),
        mustTrim: extractBullets(priorityDoc, '## 시작 화면').slice(4),
      },
      factionSelect: {
        mustShow: extractBullets(priorityDoc, '## 세력 선택').slice(0, 3),
        mustTrim: extractBullets(priorityDoc, '## 세력 선택').slice(3),
      },
      intro: {
        mustShow: extractBullets(priorityDoc, '## 인트로'),
        mustTrim: extractBullets(priorityDoc, '## 인트로').slice(3),
      },
      battlefield: {
        mustShow: extractBullets(priorityDoc, '## 전장 첫 프레임').slice(0, 4),
        mustTrim: extractBullets(priorityDoc, '## 전장 첫 프레임').slice(4),
      },
      operatingPrinciples: extractBullets(priorityDoc, '## 운영 원칙'),
    },
    contractDoc: {
      path: path.relative(root, contractPath),
      sha1: await sha1(contractPath),
      keyRules: extractBullets(contractDoc, '## 1. 기준 뷰포트')
        .concat(extractBullets(contractDoc, '## 2. 첫 10분 화면 규칙'))
        .concat(extractBullets(contractDoc, '## 3. 레이아웃 규칙'))
        .concat(extractBullets(contractDoc, '## 4. 금지 사항'))
        .concat(extractBullets(contractDoc, '## 5. 지도 파이프라인 계약')),
      approvals: extractBullets(contractDoc, '## 6. 승인 기준'),
    },
  };
}

async function buildQaDebtArtifact() {
  const sliceGatePath = path.join(root, 'scripts', 'qa', 'run-slice-check.js');
  const contractPath = path.join(root, 'docs', 'macbook14-ux-contract.md');
  const statusPaths = [
    path.join(root, 'docs', 'automation-status', 'app-surface.md'),
    path.join(root, 'docs', 'automation-status', 'engine-slice.md'),
    path.join(root, 'docs', 'automation-status', 'autotest.md'),
  ];

  const gateChecks = [
    'dev server boot',
    'console error scan',
    'start screen fit',
    'battlefield fit',
    'map drag pan',
    'field reaction banner',
    'generated command slot',
    'opening kicker',
    'turn bridge',
    'turn start card',
    'save meta turn',
  ];

  return {
    lane: 'qa-debt',
    gate: {
      script: path.relative(root, sliceGatePath),
      sha1: await sha1(sliceGatePath),
      viewport: '1512x982',
      checks: gateChecks,
      failureSignal: 'failedChecks',
    },
    uxContract: {
      path: path.relative(root, contractPath),
      sha1: await sha1(contractPath),
    },
    automationStatusDocs: await Promise.all(statusPaths.map(async (filePath) => ({
      path: path.relative(root, filePath),
      sha1: await sha1(filePath),
    }))),
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
  if (axis === 'ux-first-frame') return buildUxFirstFrameArtifact();
  if (axis === 'map-art') return buildMapArtArtifact();
  if (axis === 'map-renderer-integrity') return buildMapArtArtifact('map-renderer-integrity');
  if (axis === 'qa-debt') return buildQaDebtArtifact();
  if (axis === 'autotest') return buildAutotestArtifact();
  if (axis === 'theme-independence') return buildThemeArtifact();
  if (axis === 'app-surface') return buildAppSurfaceArtifact();
  return {
    lane: axis,
    note: 'No artifact generator defined for axis',
  };
}

function toMarkdown(axis, payload, passRecord) {
  const route = payload.route_context || {};
  return `# ${axis} artifact

- updated_at: ${new Date().toISOString()}
- candidate: ${passRecord.candidate.label}
- pass_index: ${passRecord.index}
- run_dir: \`${passRecord.run_dir || 'n/a'}\`
- route_source: ${route.route_source || 'n/a'}
- route_context_origin: ${route.route_context_origin || 'n/a'}
- urgency_snapshot: ${route.urgency_snapshot || 'n/a'}
- top_urgency_lane: ${route.top_urgency_lane || 'n/a'}
- top_urgency_value: ${route.top_urgency_value ?? 'n/a'}
- top_urgency_tie: ${(route.top_urgency_tie || []).length ? route.top_urgency_tie.join(', ') : 'none'}
- top_urgency_tie_text: ${route.top_urgency_tie_text || 'none'}
- top_urgency_tie_count: ${route.top_urgency_tie_count ?? 0}
- primary_focus_axis: ${route.primary_focus_axis || 'n/a'}
- focus_alignment: ${route.focus_alignment || 'n/a'}
- route_confidence: ${route.route_confidence || 'n/a'}
- route_confidence_raw: ${route.route_confidence || 'n/a'}
- route_confidence_text: ${route.route_confidence_text || 'n/a'}
- route_summary: ${route.route_summary || 'n/a'}

\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\`
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const passRecord = JSON.parse(await fs.readFile(args.passJson, 'utf8'));
  passRecord.run_dir = args.runDir;
  const runtimeState = await readJsonOrDefault(path.join(root, 'scripts', 'orchestrate', 'generated', 'runtime-state.json'), {});
  const factorySummary = await readJsonOrDefault(path.join(root, 'scripts', 'orchestrate', 'generated', 'factory-runtime-summary.json'), {});
  const agentRoutingState = await readJsonOrDefault(path.join(root, 'scripts', 'orchestrate', 'generated', 'agent-routing-state.json'), {});
  const payload = {
    ...(await buildArtifact(args.axis)),
    route_context: buildRouteContext(args.axis, runtimeState, factorySummary, agentRoutingState),
  };
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
    route_context_origin: payload.route_context?.route_context_origin || null,
    route_source: payload.route_context?.route_source || null,
    urgency_snapshot: payload.route_context?.urgency_snapshot || null,
    route_summary: payload.route_context?.route_summary || null,
    route_confidence: payload.route_context?.route_confidence || null,
    route_confidence_raw: payload.route_context?.route_confidence || null,
    route_confidence_text: payload.route_context?.route_confidence_text || null,
    primary_focus_axis: payload.route_context?.primary_focus_axis || null,
    focus_alignment: payload.route_context?.focus_alignment || null,
    top_urgency_lane: payload.route_context?.top_urgency_lane || null,
    top_urgency_value: payload.route_context?.top_urgency_value ?? null,
    top_urgency_tie: payload.route_context?.top_urgency_tie || [],
    top_urgency_tie_count: payload.route_context?.top_urgency_tie_count ?? 0,
    top_urgency_tie_text: payload.route_context?.top_urgency_tie_text || 'none',
    status: 'materialized',
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
