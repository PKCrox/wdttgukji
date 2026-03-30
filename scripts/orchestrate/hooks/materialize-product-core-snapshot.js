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
  const routeSuffix = payload.route_context
    ? ` / ${payload.route_context.route_summary || `${payload.route_context.focus_alignment}${payload.route_context.route_confidence ? ` · ${payload.route_context.route_confidence}` : ''}${payload.route_context.route_source ? ` · ${payload.route_context.route_source}` : ''}`}`
    : '';

  if (axis === 'engine-slice') {
    return {
      axis,
      status: 'ready',
      summary: `scenario ${payload.scenario?.id || 'n/a'} / factions ${payload.scenario?.factionCount ?? 0} / cities ${payload.scenario?.cityCount ?? 0}${routeSuffix}`,
    };
  }
  if (axis === 'design-surface') {
    return {
      axis,
      status: 'ready',
      summary: `tracked files ${Array.isArray(payload.trackedFiles) ? payload.trackedFiles.length : 0}${routeSuffix}`,
    };
  }
  if (axis === 'content-pipeline') {
    return {
      axis,
      status: 'ready',
      summary: `souls ${payload.soulCount ?? 0} / events ${payload.eventCount ?? 0}${routeSuffix}`,
    };
  }
  if (axis === 'autotest') {
    return {
      axis,
      status: 'ready',
      summary: `balance ${payload.balanceScore ?? 'n/a'} / anomaly ${(payload.summary?.anomalyRate ?? 'n/a')}${routeSuffix}`,
    };
  }
  if (axis === 'ux-first-frame') {
    return {
      axis,
      status: 'ready',
      summary: `viewport ${payload.viewport || 'n/a'} / start-screen must-show ${payload.priorityDoc?.startScreen?.mustShow?.length ?? 0} / approvals ${payload.contractDoc?.approvals?.length ?? 0}${routeSuffix}`,
    };
  }
  if (axis === 'map-renderer-integrity') {
    return {
      axis,
      status: 'ready',
      summary: `base asset ${payload.rendererContract?.baseAssetReference ? 'referenced' : 'missing'} / territory layer ${payload.rendererContract?.territoryLayerReference ? 'wired' : 'missing'}${routeSuffix}`,
    };
  }
  if (axis === 'qa-debt') {
    return {
      axis,
      status: 'ready',
      summary: `slice gate ${payload.gate?.checks?.length ?? 0} checks / viewport ${payload.gate?.viewport || 'n/a'}${routeSuffix}`,
    };
  }
  if (axis === 'theme-independence') {
    return {
      axis,
      status: 'ready',
      summary: `ui leaks ${payload.uiImportViolations ?? 0} / browser globals ${payload.browserGlobalViolations ?? 0}${routeSuffix}`,
    };
  }
  if (axis === 'app-surface') {
    return {
      axis,
      status: 'ready',
      summary: `stages ${payload.stageCount ?? 0} / transition cards ${payload.transitionCards ?? 0}${routeSuffix}`,
    };
  }

  return { axis, status: 'ready', summary: `artifact present${routeSuffix}` };
}

function laneLabel(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') return entry.lane || entry.axis || entry.name || 'n/a';
  return 'n/a';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const passRecord = JSON.parse(await fs.readFile(args.passJson, 'utf8'));
  const runState = JSON.parse(await fs.readFile(path.join(args.runDir, 'state.json'), 'utf8'));
  const runtimeState = await readJsonOrDefault(path.join(GENERATED_DIR, 'runtime-state.json'), {});
  const factorySummary = await readJsonOrDefault(path.join(GENERATED_DIR, 'factory-runtime-summary.json'), {});
  const agentRoutingState = await readJsonOrDefault(path.join(GENERATED_DIR, 'agent-routing-state.json'), {});
  const routeContextOrigin = (() => {
    if (agentRoutingState.routeContextOrigin) return agentRoutingState.routeContextOrigin;
    if (agentRoutingState.routeSummary || agentRoutingState.routeSource) return 'agent-routing-state';
    if (runtimeState.routeContextOrigin) return runtimeState.routeContextOrigin;
    if (runtimeState.routeSource === 'agent-routing-state') return 'agent-routing-state';
    if (runtimeState.routeSource === 'factory-summary') return 'factory-summary';
    if (runtimeState.routeSummary || runtimeState.routeSource) return 'runtime-state';
    if (factorySummary.routeContextOrigin) return factorySummary.routeContextOrigin;
    if (factorySummary.routeSource === 'agent-routing-state') return 'agent-routing-state';
    if (factorySummary.routeSummary || factorySummary.routeSource) return 'factory-summary';
    return 'derived';
  })();
  const topUrgencyValue = agentRoutingState.topUrgencyValue
    ?? runtimeState.topUrgencyValue
    ?? factorySummary.topUrgencyValue
    ?? null;
  const topUrgencyTie = Array.isArray(agentRoutingState.topUrgencyTie) && agentRoutingState.topUrgencyTie.length
    ? agentRoutingState.topUrgencyTie
    : Array.isArray(runtimeState.topUrgencyTie) && runtimeState.topUrgencyTie.length
      ? runtimeState.topUrgencyTie
      : Array.isArray(factorySummary.topUrgencyTie) && factorySummary.topUrgencyTie.length
        ? factorySummary.topUrgencyTie
    : Array.isArray(agentRoutingState.sortedLanes)
    ? agentRoutingState.sortedLanes.filter((entry) => (entry?.urgency ?? null) === topUrgencyValue).map(laneLabel)
    : [];
  const routeConfidence = agentRoutingState.routeConfidence || runtimeState.routeConfidence || factorySummary.routeConfidence || null;
  const routeConfidenceText = agentRoutingState.routeConfidenceText
    || runtimeState.routeConfidenceText
    || factorySummary.routeConfidenceText
    || (routeConfidence === 'tied'
      ? `tied (${agentRoutingState.topUrgencyTieCount ?? runtimeState.topUrgencyTieCount ?? factorySummary.topUrgencyTieCount ?? topUrgencyTie.length}-way tie)`
      : routeConfidence);

  const axes = [
    'engine-slice',
    'design-surface',
    'content-pipeline',
    'autotest',
    'theme-independence',
    'ux-first-frame',
    'map-art',
    'map-renderer-integrity',
    'qa-debt',
    'app-surface',
  ];
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
      primaryFocusAxis: runtimeState.primaryFocusAxis || null,
      focusAlignment: runtimeState.focusAlignment || null,
    },
    factory_summary: {
      lastRunId: factorySummary.lastRunId || null,
      persistentBoostAxes: factorySummary.persistentBoostAxes || [],
      primaryFocusAxis: factorySummary.primaryFocusAxis || null,
      focusAlignment: factorySummary.focusAlignment || null,
      routeSource: factorySummary.routeSource || null,
      routeContextOrigin: factorySummary.routeContextOrigin || 'derived',
      routeConfidence: factorySummary.routeConfidence || null,
      routeConfidenceRaw: factorySummary.routeConfidence || null,
      routeConfidenceText: factorySummary.routeConfidenceText || null,
      routeSummary: (() => {
        const baseRouteSummary = factorySummary.routeSummary
          || (factorySummary.routeSource || factorySummary.topUrgencyLane || factorySummary.routeConfidenceText
            ? `top urgency lane: ${factorySummary.topUrgencyLane || 'n/a'} (${factorySummary.topUrgencyValue ?? 'n/a'})${factorySummary.topUrgencyTieText && factorySummary.topUrgencyTieText !== 'none' ? ` · tie ${factorySummary.topUrgencyTieText}` : ''} · ${factorySummary.routeConfidenceText || factorySummary.routeConfidence || 'n/a'} · ${factorySummary.routeSource || 'n/a'} · origin ${factorySummary.routeContextOrigin || 'derived'}`
            : null);
        return baseRouteSummary && !baseRouteSummary.includes('· origin ')
          ? `${baseRouteSummary} · origin ${factorySummary.routeContextOrigin || 'derived'}`
          : baseRouteSummary;
      })(),
      urgencySnapshot: factorySummary.urgencySnapshot || null,
      topUrgencyLane: factorySummary.topUrgencyLane || null,
      topUrgencyValue: factorySummary.topUrgencyValue ?? null,
      topUrgencyTie: factorySummary.topUrgencyTie || [],
      topUrgencyTieText: factorySummary.topUrgencyTieText || null,
      topUrgencyTieCount: factorySummary.topUrgencyTieCount ?? 0,
    },
    agent_routing_state: {
      routeContextOrigin,
      routeSource: agentRoutingState.routeSource || runtimeState.routeSource || factorySummary.routeSource || null,
      primaryFocusAxis: agentRoutingState.primaryFocusAxis || runtimeState.primaryFocusAxis || factorySummary.primaryFocusAxis || null,
      topUrgencyLane: agentRoutingState.topUrgencyLane || runtimeState.topUrgencyLane || factorySummary.topUrgencyLane || null,
      topUrgencyValue,
      topUrgencyTie,
      topUrgencyTieText: agentRoutingState.topUrgencyTieText
        || runtimeState.topUrgencyTieText
        || factorySummary.topUrgencyTieText
        || ((topUrgencyTie || []).length ? `${topUrgencyTie.join(', ')} (${topUrgencyValue ?? 'n/a'})` : 'none'),
      topUrgencyTieCount: agentRoutingState.topUrgencyTieCount ?? runtimeState.topUrgencyTieCount ?? factorySummary.topUrgencyTieCount ?? topUrgencyTie.length,
      routeConfidence,
      routeConfidenceRaw: routeConfidence,
      routeConfidenceText,
      routeSummary: (() => {
        const baseRouteSummary = agentRoutingState.routeSummary
          || runtimeState.routeSummary
          || factorySummary.routeSummary
          || `top urgency lane: ${agentRoutingState.topUrgencyLane || runtimeState.topUrgencyLane || factorySummary.topUrgencyLane || 'n/a'} (${topUrgencyValue ?? 'n/a'})${topUrgencyTieText !== 'none' ? ` · tie ${topUrgencyTieText}` : ''} · ${routeConfidenceText} · ${agentRoutingState.routeSource || runtimeState.routeSource || factorySummary.routeSource || 'n/a'} · origin ${routeContextOrigin}`;
        return baseRouteSummary.includes('· origin ') ? baseRouteSummary : `${baseRouteSummary} · origin ${routeContextOrigin}`;
      })(),
      urgencySnapshot: agentRoutingState.urgencySnapshot
        || runtimeState.urgencySnapshot
        || factorySummary.urgencySnapshot
        || (agentRoutingState.sortedLanes || []).slice(0, 3).map((entry) => `${laneLabel(entry)}:${entry?.urgency ?? 'n/a'}`).join(', '),
      sortedLanes: agentRoutingState.sortedLanes || [],
    },
    primary_focus_axis: runtimeState.primaryFocusAxis || factorySummary.primaryFocusAxis || agentRoutingState.primaryFocusAxis || runState.reviewHints?.boostAxes?.[0] || null,
    focus_alignment: runtimeState.focusAlignment
      || factorySummary.focusAlignment
      || ((runtimeState.primaryFocusAxis || factorySummary.primaryFocusAxis || agentRoutingState.primaryFocusAxis || runState.reviewHints?.boostAxes?.[0] || null) === args.axis
        ? 'aligned'
        : `boosted toward ${runtimeState.primaryFocusAxis || factorySummary.primaryFocusAxis || agentRoutingState.primaryFocusAxis || runState.reviewHints?.boostAxes?.[0] || 'n/a'}`),
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
- route_source: ${snapshot.agent_routing_state.routeSource || 'n/a'}
- route_context_origin: ${snapshot.agent_routing_state.routeContextOrigin || 'n/a'}
- primary_focus_axis: ${snapshot.primary_focus_axis || 'none'}
- focus_alignment: ${snapshot.focus_alignment}
- runtime_focus_alignment: ${snapshot.runtime_state.focusAlignment || 'n/a'}
- top_urgency_lane: ${snapshot.agent_routing_state.topUrgencyLane || 'n/a'}
- top_urgency_value: ${snapshot.agent_routing_state.topUrgencyValue ?? 'n/a'}
- top_urgency_tie: ${(snapshot.agent_routing_state.topUrgencyTie || []).length ? snapshot.agent_routing_state.topUrgencyTie.join(', ') : 'none'}
- top_urgency_tie_text: ${snapshot.agent_routing_state.topUrgencyTieText || 'n/a'}
- top_urgency_tie_count: ${snapshot.agent_routing_state.topUrgencyTieCount ?? 0}
- route_confidence_raw: ${snapshot.agent_routing_state.routeConfidence || 'n/a'}
- route_confidence: ${snapshot.agent_routing_state.routeConfidenceText || 'n/a'}
- route_summary: ${snapshot.agent_routing_state.routeSummary || 'n/a'}
- urgency_snapshot: ${snapshot.agent_routing_state.urgencySnapshot || 'n/a'}
- factory_route_source: ${snapshot.factory_summary.routeSource || 'n/a'}
- factory_route_context_origin: ${snapshot.factory_summary.routeContextOrigin || 'n/a'}
- factory_focus_alignment: ${snapshot.factory_summary.focusAlignment || 'n/a'}
- factory_route_confidence_raw: ${snapshot.factory_summary.routeConfidence || 'n/a'}
- factory_route_confidence: ${snapshot.factory_summary.routeConfidenceText || 'n/a'}
- factory_route_summary: ${snapshot.factory_summary.routeSummary || 'n/a'}
- factory_urgency_snapshot: ${snapshot.factory_summary.urgencySnapshot || 'n/a'}
- factory_top_urgency_lane: ${snapshot.factory_summary.topUrgencyLane || 'n/a'}
- factory_top_urgency_value: ${snapshot.factory_summary.topUrgencyValue ?? 'n/a'}
- factory_top_urgency_tie: ${(snapshot.factory_summary.topUrgencyTie || []).length ? snapshot.factory_summary.topUrgencyTie.join(', ') : 'none'}
- factory_top_urgency_tie_text: ${snapshot.factory_summary.topUrgencyTieText || 'n/a'}
- factory_top_urgency_tie_count: ${snapshot.factory_summary.topUrgencyTieCount ?? 0}
- persistent_boost_axes: ${(snapshot.runtime_state.persistentBoostAxes || []).join(', ') || 'none'}

## Axes

${Object.values(snapshot.axes).map((entry) => `- ${entry.axis}: ${entry.summary}`).join('\n')}
`;

  await fs.writeFile(LATEST_MD_PATH, `${markdown}\n`, 'utf8');

  console.log(JSON.stringify({
    output: SNAPSHOT_PATH,
    markdown_output: LATEST_MD_PATH,
    runtimeFocusAlignment: snapshot.runtime_state.focusAlignment || null,
    factoryRouteSource: snapshot.factory_summary.routeSource || null,
    factoryRouteContextOrigin: snapshot.factory_summary.routeContextOrigin || null,
    factoryFocusAlignment: snapshot.factory_summary.focusAlignment || null,
    factoryRouteConfidence: snapshot.factory_summary.routeConfidence || null,
    factoryRouteConfidenceRaw: snapshot.factory_summary.routeConfidence || null,
    factoryRouteConfidenceText: snapshot.factory_summary.routeConfidenceText || null,
    factoryRouteSummary: snapshot.factory_summary.routeSummary || null,
    factoryUrgencySnapshot: snapshot.factory_summary.urgencySnapshot || null,
    factoryTopUrgencyLane: snapshot.factory_summary.topUrgencyLane || null,
    factoryTopUrgencyValue: snapshot.factory_summary.topUrgencyValue ?? null,
    factoryTopUrgencyTie: snapshot.factory_summary.topUrgencyTie || [],
    factoryTopUrgencyTieText: snapshot.factory_summary.topUrgencyTieText || null,
    factoryTopUrgencyTieCount: snapshot.factory_summary.topUrgencyTieCount ?? 0,
    routeContextOrigin: snapshot.agent_routing_state.routeContextOrigin || null,
    routeSource: snapshot.agent_routing_state.routeSource || null,
    routeSummary: snapshot.agent_routing_state.routeSummary || null,
    routeConfidence: snapshot.agent_routing_state.routeConfidence || null,
    routeConfidenceRaw: snapshot.agent_routing_state.routeConfidence || null,
    routeConfidenceText: snapshot.agent_routing_state.routeConfidenceText || null,
    primaryFocusAxis: snapshot.agent_routing_state.primaryFocusAxis || snapshot.primary_focus_axis || null,
    focusAlignment: snapshot.focus_alignment || null,
    topUrgencyLane: snapshot.agent_routing_state.topUrgencyLane || null,
    topUrgencyValue: snapshot.agent_routing_state.topUrgencyValue ?? null,
    topUrgencyTie: snapshot.agent_routing_state.topUrgencyTie || [],
    topUrgencyTieCount: snapshot.agent_routing_state.topUrgencyTieCount ?? 0,
    topUrgencyTieText: snapshot.agent_routing_state.topUrgencyTieText || 'none',
    urgencySnapshot: snapshot.agent_routing_state.urgencySnapshot || null,
    status: 'updated',
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
