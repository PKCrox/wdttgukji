#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const GENERATED_DIR = path.join(ROOT, 'scripts', 'orchestrate', 'generated');
const FACTORY_BACKLOG_PATH = path.join(ROOT, 'scripts', 'orchestrate', 'factory-upgrade-backlog.json');
const FACTORY_HANDOFF_PATH = path.join(ROOT, 'docs', 'factory-runtime-handoff.md');
const AGENT_ROUTING_STATE_PATH = path.join(GENERATED_DIR, 'agent-routing-state.json');
const FACTORY_BACKLOG_REFRESH_PATH = path.join(GENERATED_DIR, 'factory-backlog-refresh.json');
const DIAGNOSTIC_LANES = ['ux-first-frame', 'qa-debt', 'map-art'];

function parseArgs(argv) {
  const args = {
    runDir: null,
    passJson: null,
    lane: null,
    output: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--run-dir') args.runDir = argv[++index] || null;
    else if (token === '--pass-json') args.passJson = argv[++index] || null;
    else if (token === '--lane') args.lane = argv[++index] || null;
    else if (token === '--output') args.output = argv[++index] || null;
  }

  if (!args.runDir) throw new Error('--run-dir is required');
  if (!args.passJson) throw new Error('--pass-json is required');
  return args;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function readJsonIfExists(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function readTextIfExists(filePath, fallback = '') {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

function sanitizeLane(lane) {
  return String(lane || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildDefaultOutput(lane) {
  return path.join(GENERATED_DIR, `factory-${sanitizeLane(lane)}-follow-through-audit.json`);
}

function summarizeHandoff(text, limit = 8) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function laneKeywords(lane) {
  const keywords = {
    'ux-first-frame': ['ux-first-frame', 'ux', 'first-frame', 'macbook14'],
    'qa-debt': ['qa-debt', 'qa', 'diagnostic', 'regression'],
    'map-art': ['map-art', 'map', 'renderer', 'basemap'],
  };
  return keywords[lane] || [lane];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function supportsLane(entry, lane) {
  const haystack = [
    entry?.id,
    entry?.title,
    ...(Array.isArray(entry?.owned_paths) ? entry.owned_paths : []),
  ]
    .filter(Boolean)
    .join(' ');
  return laneKeywords(lane).some((keyword) => {
    const pattern = escapeRegExp(keyword).replace(/\\ /g, '\\s+');
    return new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`, 'i').test(haystack);
  });
}

function summarizeBacklogCoverage(backlog, lane) {
  const items = Array.isArray(backlog?.items) ? backlog.items : [];
  const openItems = items.filter((item) => item?.status === 'open' && supportsLane(item, lane));
  const completedItems = items.filter((item) => item?.status === 'completed' && supportsLane(item, lane));
  return {
    open_count: openItems.length,
    open_ids: openItems.map((item) => item.id),
    completed_count: completedItems.length,
    completed_ids: completedItems.map((item) => item.id),
  };
}

function determineLane(argsLane, passRecord, backlogRefresh) {
  if (argsLane) return argsLane;
  if (backlogRefresh?.top_proposed_item?.lane) return backlogRefresh.top_proposed_item.lane;
  if (DIAGNOSTIC_LANES.includes(passRecord?.candidate?.axis)) return passRecord.candidate.axis;
  return null;
}

function buildVerificationCommands(ownedPaths, lane) {
  const jsChecks = (Array.isArray(ownedPaths) ? ownedPaths : [])
    .filter((item) => String(item).endsWith('.js'))
    .map((item) => `node --check ${item}`);
  const laneFlag = lane ? ` --lane ${lane}` : '';
  return [
    ...jsChecks,
    `node scripts/orchestrate/materialize-factory-lane-follow-through-audit.js --run-dir <run-dir> --pass-json <pass-json>${laneFlag}`,
  ];
}

function buildBacklogItemTemplate(refreshProposal, lane) {
  if (!refreshProposal) return null;
  return {
    id: refreshProposal.id || null,
    title: refreshProposal.title || null,
    status: 'open',
    priority: refreshProposal.priority ?? null,
    owner: 'factory-codex',
    owned_paths: Array.isArray(refreshProposal.owned_paths) ? refreshProposal.owned_paths : [],
    done_when: Array.isArray(refreshProposal.done_when) ? refreshProposal.done_when : [],
    verification: buildVerificationCommands(refreshProposal.owned_paths, lane),
    notes: [
      `Promoted from factory-backlog-refresh for lane ${lane}.`,
      refreshProposal.why_now ? `why_now: ${refreshProposal.why_now}` : null,
      'Do not touch public app-surface files.',
    ].filter(Boolean),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const passRecord = JSON.parse(await fs.readFile(args.passJson, 'utf8'));
  const backlog = await readJsonIfExists(FACTORY_BACKLOG_PATH, { items: [] });
  const routing = await readJsonIfExists(AGENT_ROUTING_STATE_PATH, {});
  const backlogRefresh = await readJsonIfExists(FACTORY_BACKLOG_REFRESH_PATH, {});
  const handoffText = await readTextIfExists(FACTORY_HANDOFF_PATH, '');

  const lane = determineLane(args.lane, passRecord, backlogRefresh);
  if (!lane) throw new Error('Unable to determine lane. Pass --lane explicitly.');

  const outputPath = args.output || buildDefaultOutput(lane);
  const laneDiagnostics = routing?.laneDiagnostics?.[lane] || {};
  const pendingAgent = Array.isArray(routing?.pendingAgents)
    ? routing.pendingAgents.find((agent) => agent?.lane === lane) || null
    : null;
  const backlogCoverage = summarizeBacklogCoverage(backlog, lane);
  const refreshProposal = Array.isArray(backlogRefresh?.proposed_items)
    ? backlogRefresh.proposed_items.find((item) => item?.lane === lane) || null
    : null;
  const recommendation = refreshProposal
    ? `Promote ${refreshProposal.id} from ${FACTORY_BACKLOG_REFRESH_PATH} or refresh ${FACTORY_BACKLOG_PATH}.`
    : backlogRefresh?.queue_next_action || `Refresh ${FACTORY_BACKLOG_PATH} with a new bounded ${lane} task.`;
  const promoteBacklogItem = buildBacklogItemTemplate(refreshProposal, lane);

  const summary = {
    generated_at: new Date().toISOString(),
    status: 'completed',
    run_dir: args.runDir,
    pass_index: passRecord.index,
    candidate_id: passRecord.candidate.id,
    candidate_axis: passRecord.candidate.axis,
    lane,
    route: {
      route_source: routing.routeSource || null,
      route_context_origin: routing.routeContextOrigin || null,
      route_summary: routing.routeSummary || null,
      top_urgency_lane: routing.topUrgencyLane || null,
      top_urgency_tie: Array.isArray(routing.topUrgencyTie) ? routing.topUrgencyTie : [],
      urgency_snapshot: routing.urgencySnapshot || null,
    },
    lane_diagnostics: {
      average_coverage: laneDiagnostics.averageCoverage ?? null,
      total_coverage: laneDiagnostics.totalCoverage ?? null,
      pending_count: laneDiagnostics.pendingCount ?? 0,
      proposal_count: laneDiagnostics.proposalCount ?? 0,
    },
    pending_agent: pendingAgent
      ? {
        lane: pendingAgent.lane || null,
        title: pendingAgent.title || null,
        rationale: pendingAgent.rationale || null,
        status: pendingAgent.status || null,
        review_count: pendingAgent.review_count ?? null,
      }
      : null,
    backlog_coverage: backlogCoverage,
    refresh_proposal: refreshProposal
      ? {
        id: refreshProposal.id || null,
        title: refreshProposal.title || null,
        priority: refreshProposal.priority ?? null,
        why_now: refreshProposal.why_now || null,
      }
      : null,
    promote_backlog_item: promoteBacklogItem,
    recommendation,
    sources: [
      { id: 'factory_backlog', path: FACTORY_BACKLOG_PATH },
      { id: 'factory_backlog_refresh', path: FACTORY_BACKLOG_REFRESH_PATH },
      { id: 'agent_routing_state', path: AGENT_ROUTING_STATE_PATH },
      { id: 'factory_handoff', path: FACTORY_HANDOFF_PATH },
      { id: 'pass_json', path: args.passJson },
    ],
    handoff_excerpt: summarizeHandoff(handoffText),
    summary_lines: [
      `Lane audit: ${lane}`,
      `Coverage: avg ${laneDiagnostics.averageCoverage ?? 'n/a'}, total ${laneDiagnostics.totalCoverage ?? 'n/a'}`,
      `Pending specialist count: ${laneDiagnostics.pendingCount ?? 0}`,
      `Backlog follow-through: open ${backlogCoverage.open_count}, completed ${backlogCoverage.completed_count}`,
      ...(promoteBacklogItem?.id ? [`Promotion template: ${promoteBacklogItem.id}`] : []),
      `Recommended next step: ${recommendation}`,
    ],
  };

  await writeJson(outputPath, summary);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
