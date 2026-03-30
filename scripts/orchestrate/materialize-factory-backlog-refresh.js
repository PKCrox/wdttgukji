#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const GENERATED_DIR = path.join(ROOT, 'scripts', 'orchestrate', 'generated');
const FACTORY_BACKLOG_PATH = path.join(ROOT, 'scripts', 'orchestrate', 'factory-upgrade-backlog.json');
const FACTORY_HANDOFF_PATH = path.join(ROOT, 'docs', 'factory-runtime-handoff.md');
const AGENT_ROUTING_STATE_PATH = path.join(GENERATED_DIR, 'agent-routing-state.json');
const FACTORY_CANDIDATE_ITEMS_PATH = path.join(GENERATED_DIR, 'factory-candidate-items.json');
const DEFAULT_OUTPUT_PATH = path.join(GENERATED_DIR, 'factory-backlog-refresh.json');
const DIAGNOSTIC_LANES = ['ux-first-frame', 'qa-debt', 'map-art'];

function parseArgs(argv) {
  const args = {
    runDir: null,
    passJson: null,
    output: DEFAULT_OUTPUT_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--run-dir') args.runDir = argv[++index] || null;
    else if (token === '--pass-json') args.passJson = argv[++index] || null;
    else if (token === '--output') args.output = argv[++index] || DEFAULT_OUTPUT_PATH;
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

function buildQueueNextAction(topProposedItem, outputPath) {
  if (!topProposedItem?.id) {
    return 'Refresh scripts/orchestrate/factory-upgrade-backlog.json with a new bounded factory improvement or promote a new candidate from runtime handoff and agent-gap artifacts.';
  }
  return `Promote ${topProposedItem.id} from ${outputPath} or refresh ${FACTORY_BACKLOG_PATH}.`;
}

function sanitizeLane(lane) {
  return String(lane || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildLaneAuditPath(lane) {
  return path.join(GENERATED_DIR, `factory-${sanitizeLane(lane)}-follow-through-audit.json`);
}

function summarizeLaneAudit(audit, filePath) {
  if (!audit || typeof audit !== 'object') return null;
  return {
    path: filePath,
    run_dir: audit.run_dir || null,
    lane: audit.lane || null,
    pass_index: audit.pass_index ?? null,
    candidate_axis: audit.candidate_axis || null,
    recommendation: audit.recommendation || null,
    pending_agent_title: audit.pending_agent?.title || null,
    backlog_open_count: audit.backlog_coverage?.open_count ?? null,
    backlog_completed_count: audit.backlog_coverage?.completed_count ?? null,
    promote_backlog_item: audit.promote_backlog_item
      ? {
        id: audit.promote_backlog_item.id || null,
        title: audit.promote_backlog_item.title || null,
        status: audit.promote_backlog_item.status || null,
        priority: audit.promote_backlog_item.priority ?? null,
        owner: audit.promote_backlog_item.owner || null,
        owned_paths: Array.isArray(audit.promote_backlog_item.owned_paths) ? audit.promote_backlog_item.owned_paths : [],
        done_when: Array.isArray(audit.promote_backlog_item.done_when) ? audit.promote_backlog_item.done_when : [],
        verification: Array.isArray(audit.promote_backlog_item.verification) ? audit.promote_backlog_item.verification : [],
        notes: Array.isArray(audit.promote_backlog_item.notes) ? audit.promote_backlog_item.notes : [],
      }
      : null,
  };
}

function summarizeLaneAuditFreshness(auditSummary, runDir, passRecord) {
  if (!auditSummary) {
    return {
      status: 'missing',
      stale_reasons: [],
    };
  }

  const staleReasons = [];
  if (runDir && auditSummary.run_dir && auditSummary.run_dir !== runDir) {
    staleReasons.push(`run dir mismatch: ${auditSummary.run_dir}`);
  }
  if (Number.isFinite(passRecord?.index) && Number.isFinite(auditSummary.pass_index) && auditSummary.pass_index !== passRecord.index) {
    staleReasons.push(`pass mismatch: ${auditSummary.pass_index}`);
  }
  if (passRecord?.candidate?.axis && auditSummary.candidate_axis && auditSummary.candidate_axis !== passRecord.candidate.axis) {
    staleReasons.push(`candidate axis mismatch: ${auditSummary.candidate_axis}`);
  }

  return {
    status: staleReasons.length ? 'stale' : 'current',
    stale_reasons: staleReasons,
  };
}

function summarizeHandoff(text, limit = 6) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function laneKeywords(lane) {
  const keywords = {
    'app-surface': ['app-surface'],
    'theme-independence': ['theme', 'boundary'],
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

function summarizeBacklogLaneCoverage(backlog, lane) {
  const items = Array.isArray(backlog?.items) ? backlog.items : [];
  const openItems = items.filter((item) => item?.status === 'open' && supportsLane(item, lane));
  const completedItems = items.filter((item) => item?.status === 'completed' && supportsLane(item, lane));
  return {
    open_count: openItems.length,
    completed_count: completedItems.length,
    open_ids: openItems.map((item) => item.id),
    completed_ids: completedItems.map((item) => item.id),
  };
}

function buildDiagnosticLaneProposals({ route, passRecord, routing, backlog }) {
  const tiedLanes = Array.isArray(route.top_urgency_tie) ? route.top_urgency_tie : [];
  const candidateAxis = passRecord?.candidate?.axis || null;
  const diagnosticCandidates = [
    ...tiedLanes.filter((lane) => DIAGNOSTIC_LANES.includes(lane)),
    DIAGNOSTIC_LANES.includes(route.top_urgency_lane) ? route.top_urgency_lane : null,
    DIAGNOSTIC_LANES.includes(candidateAxis) ? candidateAxis : null,
  ].filter(Boolean);
  const lanes = [...new Set(diagnosticCandidates)];

  if (!lanes.length) return [];

  const laneDiagnostics = routing?.laneDiagnostics || {};
  const pendingAgents = Array.isArray(routing?.pendingAgents) ? routing.pendingAgents : [];
  const tieCount = tiedLanes.length;

  return lanes
    .map((lane, index) => {
      const diagnostics = laneDiagnostics[lane] || {};
      const pendingAgent = pendingAgents.find((agent) => agent?.lane === lane) || null;
      const backlogCoverage = summarizeBacklogLaneCoverage(backlog, lane);
      const score = (
        (route.top_urgency_lane === lane ? 8 : 0)
        + (tiedLanes.includes(lane) ? 4 : 0)
        + (candidateAxis === lane ? 2 : 0)
        + Math.max(0, 4 - (diagnostics.averageCoverage ?? 4))
        + Math.max(0, 2 - (diagnostics.proposalCount ?? 0))
        + Math.min(diagnostics.pendingCount ?? 0, 3)
      );
      const reasons = [];
      if (route.top_urgency_lane === lane && tieCount > 1) {
        reasons.push(`${lane} is the current top urgency lane inside a ${tieCount}-way tie`);
      } else if (tiedLanes.includes(lane) && tieCount > 1) {
        reasons.push(`${lane} is still tied at the top urgency layer`);
      }
      if (candidateAxis === lane) reasons.push(`${lane} is the active pass axis`);
      reasons.push(`coverage ${diagnostics.averageCoverage ?? 'n/a'}`);
      reasons.push(`pending specialists ${diagnostics.pendingCount ?? 0}`);
      reasons.push(`backlog follow-through open ${backlogCoverage.open_count} / completed ${backlogCoverage.completed_count}`);

      return {
        lane,
        score,
        index,
        diagnostics,
        pendingAgent,
        backlogCoverage,
        why_now: reasons.join('; '),
      };
    })
    .sort((left, right) => (
      right.score - left.score
      || left.index - right.index
    ))
    .map((entry, index) => ({
      id: `${entry.lane}-factory-gap-audit`,
      title: `Audit ${entry.lane} factory follow-through gaps`,
      priority: 4 + index,
      owned_paths: [
        'scripts/orchestrate/materialize-factory-lane-follow-through-audit.js',
        'docs/factory-runtime-handoff.md',
      ],
      why_now: entry.why_now,
      done_when: [
        `operator can inspect a lane-specific ${entry.lane} follow-through audit before promoting a new backlog item`,
        'audit stays compact and grounded in routing diagnostics, pending-agent proposals, and backlog history',
      ],
      lane: entry.lane,
      lane_diagnostics: {
        average_coverage: entry.diagnostics.averageCoverage ?? null,
        total_coverage: entry.diagnostics.totalCoverage ?? null,
        pending_count: entry.diagnostics.pendingCount ?? 0,
        proposal_count: entry.diagnostics.proposalCount ?? 0,
        open_backlog_count: entry.backlogCoverage.open_count,
        completed_backlog_count: entry.backlogCoverage.completed_count,
        pending_agent_title: entry.pendingAgent?.title || null,
      },
    }));
}

function buildProposalCatalog({ route, passRecord, routing, backlog }) {
  const proposals = [];

  if ((route.top_urgency_tie || []).length > 1) {
    proposals.push({
      id: 'route-tie-break-digest',
      title: 'Materialize a compact tie-break digest for route ties',
      priority: 1,
      owned_paths: [
        'scripts/orchestrate/hooks/run-codex-factory-agent.js',
        'docs/factory-runtime-handoff.md',
      ],
      why_now: `top urgency tie: ${(route.top_urgency_tie || []).join(', ')} (${route.top_urgency_value ?? 'n/a'})`,
      done_when: [
        'operator can see why a top-urgency tie exists and which safe factory lane should be preferred next',
        'tie-break summary stays compact and points back to richer routing artifacts',
      ],
    });
  }

  if (route.top_urgency_lane === 'app-surface') {
    proposals.push({
      id: 'app-surface-factory-guard-review',
      title: 'Audit factory-only guardrails for app-surface pressure',
      priority: 2,
      owned_paths: [
        'scripts/orchestrate/hooks/run-codex-factory-agent.js',
        'docs/factory-runtime-handoff.md',
      ],
      why_now: 'app-surface remains the top urgency lane, but factory work must stay outside public app-surface files.',
      done_when: [
        'operator can see whether app-surface pressure still needs a factory-only mitigation before product-core edits',
        'review stays in docs/runtime hooks only',
      ],
    });
  }

  if (route.top_urgency_lane === 'theme-independence' || (route.top_urgency_tie || []).includes('theme-independence')) {
    proposals.push({
      id: 'theme-boundary-coverage-audit',
      title: 'Audit theme-independence coverage for the current route',
      priority: route.top_urgency_lane === 'theme-independence' ? 1 : 3,
      owned_paths: [
        'scripts/qa/list-replay-coverage.js',
        'docs/factory-self-upgrade-lane.md',
      ],
      why_now: route.top_urgency_lane === 'theme-independence'
        ? 'theme-independence is the current top urgency lane and needs a factory-safe audit path before any runtime/product mutation.'
        : 'theme-independence is still tied at the top urgency layer and needs a factory-safe audit path.',
      done_when: [
        'operator can see whether theme-independence still lacks enough factory-safe verification coverage',
        'audit stays bounded to docs and QA inventory',
      ],
    });
  }

  proposals.push(...buildDiagnosticLaneProposals({ route, passRecord, routing, backlog }));

  return proposals.sort((left, right) => left.priority - right.priority);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const passRecord = JSON.parse(await fs.readFile(args.passJson, 'utf8'));
  const backlog = await readJsonIfExists(FACTORY_BACKLOG_PATH, { items: [] });
  const routing = await readJsonIfExists(AGENT_ROUTING_STATE_PATH, {});
  const candidateItems = await readJsonIfExists(FACTORY_CANDIDATE_ITEMS_PATH, {});
  const handoffText = await readTextIfExists(FACTORY_HANDOFF_PATH, '');

  const route = {
    route_source: routing.routeSource || null,
    route_context_origin: routing.routeContextOrigin || null,
    route_summary: routing.routeSummary || null,
    top_urgency_lane: routing.topUrgencyLane || null,
    top_urgency_value: routing.topUrgencyValue ?? null,
    top_urgency_tie: Array.isArray(routing.topUrgencyTie) ? routing.topUrgencyTie : [],
    urgency_snapshot: routing.urgencySnapshot || null,
  };

  const openItemIds = new Set((backlog.items || []).filter((item) => item?.status === 'open').map((item) => item.id));
  const completedItemIds = new Set((backlog.items || []).filter((item) => item?.status === 'completed').map((item) => item.id));
  const proposalCatalog = buildProposalCatalog({
    route,
    passRecord,
    routing,
    backlog,
  });
  const proposedItems = [];
  const suppressedItems = [];

  for (const proposal of proposalCatalog) {
    if (openItemIds.has(proposal.id)) {
      suppressedItems.push({ id: proposal.id, reason: 'already-open-in-backlog' });
      continue;
    }
    if (completedItemIds.has(proposal.id)) {
      suppressedItems.push({ id: proposal.id, reason: 'already-completed-in-backlog' });
      continue;
    }
    proposedItems.push(proposal);
  }

  const topProposedItem = proposedItems[0]
    ? {
      id: proposedItems[0].id || null,
      title: proposedItems[0].title || null,
      priority: proposedItems[0].priority ?? null,
      lane: proposedItems[0].lane || null,
    }
    : null;
  const topProposedLaneAuditPath = topProposedItem?.lane ? buildLaneAuditPath(topProposedItem.lane) : null;
  const rawTopProposedLaneAudit = topProposedLaneAuditPath
    ? summarizeLaneAudit(await readJsonIfExists(topProposedLaneAuditPath, null), topProposedLaneAuditPath)
    : null;
  const topProposedLaneAuditFreshness = summarizeLaneAuditFreshness(rawTopProposedLaneAudit, args.runDir, passRecord);
  const topProposedLaneAudit = topProposedLaneAuditFreshness.status === 'current'
    ? rawTopProposedLaneAudit
    : null;
  if (topProposedItem && topProposedLaneAudit) {
    topProposedItem.lane_audit_path = topProposedLaneAudit.path;
  }
  const topProposedBacklogItem = topProposedLaneAudit?.promote_backlog_item || null;
  const topProposedLaneAuditRefreshCommand = topProposedItem?.lane && topProposedLaneAuditFreshness.status === 'stale'
    ? `node scripts/orchestrate/materialize-factory-lane-follow-through-audit.js --run-dir ${args.runDir} --pass-json ${args.passJson} --lane ${topProposedItem.lane}`
    : null;
  const queueNextAction = buildQueueNextAction(topProposedItem, args.output);

  const summary = {
    generated_at: new Date().toISOString(),
    status: 'completed',
    run_dir: args.runDir,
    pass_index: passRecord.index,
    candidate_id: passRecord.candidate.id,
    candidate_axis: passRecord.candidate.axis,
    queue_status: candidateItems.factory_upgrade_queue_status || null,
    queue_next_action: queueNextAction,
    sources: [
      { id: 'factory_backlog', path: FACTORY_BACKLOG_PATH },
      { id: 'factory_handoff', path: FACTORY_HANDOFF_PATH },
      { id: 'agent_routing_state', path: AGENT_ROUTING_STATE_PATH },
      { id: 'factory_candidate_items', path: FACTORY_CANDIDATE_ITEMS_PATH },
      { id: 'pass_json', path: args.passJson },
    ],
    route,
    open_backlog_items: [...openItemIds],
    top_proposed_item: topProposedItem,
    top_proposed_lane_audit: topProposedLaneAudit,
    top_proposed_lane_audit_status: topProposedLaneAuditFreshness.status,
    top_proposed_lane_audit_stale_reasons: topProposedLaneAuditFreshness.stale_reasons,
    top_proposed_lane_audit_refresh_command: topProposedLaneAuditRefreshCommand,
    top_proposed_backlog_item: topProposedBacklogItem,
    proposed_items: proposedItems,
    suppressed_items: suppressedItems,
    handoff_excerpt: summarizeHandoff(handoffText),
    summary_lines: [
      `Queue status: ${candidateItems.factory_upgrade_queue_status || 'n/a'}`,
      `Open backlog items: ${[...openItemIds].join(', ') || 'none'}`,
      ...(topProposedItem ? [`Top proposed refresh item: ${topProposedItem.id}`] : []),
      ...(topProposedLaneAudit ? [`Top proposed lane audit: ${topProposedLaneAudit.path}`] : []),
      ...(topProposedLaneAuditFreshness.status === 'stale'
        ? [`Top proposed lane audit status: stale (${topProposedLaneAuditFreshness.stale_reasons.join(' | ') || 'context mismatch'})`]
        : []),
      ...(topProposedLaneAuditRefreshCommand ? [`Top proposed lane audit refresh command: ${topProposedLaneAuditRefreshCommand}`] : []),
      ...(topProposedBacklogItem ? [`Top proposed backlog template: ${topProposedBacklogItem.id}`] : []),
      `Proposed refresh items: ${proposedItems.map((item) => item.id).join(', ') || 'none'}`,
    ],
  };

  await writeJson(args.output, summary);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
