#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

const ROOT = process.cwd();
const GENERATED_DIR = path.join(ROOT, 'scripts', 'orchestrate', 'generated');
const DEFAULT_SESSION_PATH = path.join(GENERATED_DIR, 'codex-factory-session.json');
const DEFAULT_MODEL = 'gpt-5.4';
const FACTORY_UPGRADE_BACKLOG_PATH = path.join(ROOT, 'scripts', 'orchestrate', 'factory-upgrade-backlog.json');
const FACTORY_RUNTIME_HANDOFF_PATH = path.join(ROOT, 'docs', 'factory-runtime-handoff.md');
const FACTORY_BACKLOG_REFRESH_PATH = path.join(GENERATED_DIR, 'factory-backlog-refresh.json');
const FACTORY_CANDIDATE_ITEMS_PATH = path.join(GENERATED_DIR, 'factory-candidate-items.json');
const FACTORY_AUTO_RESEED_CANDIDATES = [
  {
    id: 'qa-coverage-audit',
    title: 'Audit replay coverage by axis and emit a gap report',
    priority: 1,
    owner: 'factory-codex',
    owned_paths: [
      'scripts/qa/list-replay-coverage.js',
      'docs/factory-self-upgrade-lane.md',
    ],
    done_when: [
      'operator can see which axes have replay coverage and which do not',
      'candidate stays read-mostly and bounded to docs/qa paths',
    ],
    notes: [
      'Prefer inventory/reporting over new runtime mutation.',
    ],
  },
  {
    id: 'operator-run-digest',
    title: 'Add a compact factory run digest beside replay digests',
    priority: 2,
    owner: 'factory-codex',
    owned_paths: [
      'scripts/orchestrate/hooks/run-codex-factory-agent.js',
      'docs/factory-runtime-handoff.md',
    ],
    done_when: [
      'operator can inspect one small summary for the whole factory pass',
      'digest stays compact and points back to richer artifacts',
    ],
    notes: [
      'Favor summary pointers, not full transcript duplication.',
    ],
  },
  {
    id: 'candidate-artifact',
    title: 'Persist auto-reseed candidates into a generated artifact',
    priority: 3,
    owner: 'factory-codex',
    owned_paths: [
      'scripts/orchestrate/hooks/run-codex-factory-agent.js',
      'scripts/orchestrate/generated/factory-candidate-items.json',
    ],
    done_when: [
      'candidate items can be inspected outside the hook JSON',
      'artifact stays worktree-safe and generated',
    ],
    notes: [
      'Prefer generated JSON over editing runtime policy files.',
    ],
  },
];

function parseArgs(argv) {
  const args = {
    runDir: null,
    passJson: null,
    materializeCandidateArtifactOnly: false,
    materializeOperatorRunDigestOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--run-dir') args.runDir = argv[++index] || null;
    else if (token === '--pass-json') args.passJson = argv[++index] || null;
    else if (token === '--materialize-candidate-artifact') args.materializeCandidateArtifactOnly = true;
    else if (token === '--materialize-operator-run-digest') args.materializeOperatorRunDigestOnly = true;
  }

  if (!args.materializeCandidateArtifactOnly) {
    if (!args.runDir) throw new Error('--run-dir is required');
    if (!args.passJson) throw new Error('--pass-json is required');
  }
  return args;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJsonArtifact(filePath, payload) {
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(tempPath, serialized, 'utf8');
  await fs.rename(tempPath, filePath);
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

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeOwnedPath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
}

function normalizeGitStatusPath(rawPath) {
  const target = rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1) : rawPath;
  return normalizeOwnedPath(target.replace(/^"+|"+$/g, ''));
}

function parseGitStatusShort(stdout) {
  const dirtyTrackedPaths = [];
  const untrackedPaths = [];

  for (const rawLine of stdout.split('\n')) {
    if (!rawLine.trim()) continue;
    const status = rawLine.slice(0, 2);
    const target = normalizeGitStatusPath(rawLine.slice(3).trim());
    if (!target) continue;
    if (status === '??') {
      untrackedPaths.push(target);
    } else {
      dirtyTrackedPaths.push(target);
    }
  }

  return {
    dirtyTrackedPaths,
    untrackedPaths,
  };
}

function runProcess(command, args, cwd = ROOT) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

async function collectWorktreeStatus(rootDir = ROOT) {
  const result = await runProcess('git', ['status', '--short', '--untracked-files=all'], rootDir);
  if (!result.ok) {
    return {
      dirtyTrackedPaths: [],
      untrackedPaths: [],
      dirtyTrackedCount: 0,
      untrackedCount: 0,
      source: 'git-status-failed',
    };
  }

  const parsed = parseGitStatusShort(result.stdout);
  return {
    ...parsed,
    dirtyTrackedCount: parsed.dirtyTrackedPaths.length,
    untrackedCount: parsed.untrackedPaths.length,
    source: 'git-status',
  };
}

function overlapsOwnedPath(changedPath, ownedPath) {
  const normalizedChanged = normalizeOwnedPath(changedPath);
  const normalizedOwned = normalizeOwnedPath(ownedPath);
  if (!normalizedChanged || !normalizedOwned) return false;
  return normalizedChanged === normalizedOwned
    || normalizedChanged.startsWith(`${normalizedOwned}/`);
}

function deriveRouteMetadata({ passRecord, runtimeState, factorySummary, agentRoutingState, session }) {
  const laneLabel = (entry) => {
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object') return entry.lane || entry.axis || entry.name || 'n/a';
    return 'n/a';
  };
  const routeSource = agentRoutingState.routeSource
    || runtimeState.routeSource
    || factorySummary.routeSource
    || session?.route_source
    || (runtimeState.primaryFocusAxis ? 'runtime-state' : null)
    || 'derived';
  const routeContextOrigin = (() => {
    if (agentRoutingState.routeContextOrigin) return agentRoutingState.routeContextOrigin;
    if (runtimeState.routeContextOrigin) return runtimeState.routeContextOrigin;
    if (factorySummary.routeContextOrigin) return factorySummary.routeContextOrigin;
    if (session?.route_context_origin) return session.route_context_origin;
    if (routeSource === 'agent-routing-state') return 'agent-routing-state';
    if (routeSource === 'runtime-state') return 'runtime-state';
    if (routeSource === 'factory-summary') return 'factory-summary';
    return 'derived';
  })();
  const topAxis = agentRoutingState.primaryFocusAxis
    || agentRoutingState.topUrgencyLane
    || runtimeState.topUrgencyLane
    || factorySummary.primaryFocusAxis
    || factorySummary.topUrgencyLane
    || session?.primary_focus_axis
    || session?.top_urgency_lane
    || (runtimeState.persistentBoostAxes || [])[0]
    || passRecord.candidate.axis;
  const topUrgencyLane = agentRoutingState.topUrgencyLane || runtimeState.topUrgencyLane || factorySummary.topUrgencyLane || session?.top_urgency_lane || topAxis;
  const topUrgencyValue = agentRoutingState.topUrgencyValue ?? runtimeState.topUrgencyValue ?? factorySummary.topUrgencyValue ?? session?.top_urgency_value ?? agentRoutingState.laneUrgency?.[topUrgencyLane] ?? 'n/a';
  const persistentBoostAxes = runtimeState.persistentBoostAxes || [];
  const latestReviewAxes = runtimeState.lastCheckpointReview?.boost_axes || [];
  const axisStatus = runtimeState.axisStatus?.[passRecord.candidate.axis] || null;
  const primaryFocusAxis = agentRoutingState.primaryFocusAxis || runtimeState.primaryFocusAxis || factorySummary.primaryFocusAxis || session?.primary_focus_axis || axisStatus?.dominant_bottleneck || topAxis;
  const routeScoreGap = passRecord.reprioritized?.score_gap;
  const urgencySnapshot = (agentRoutingState.urgencySnapshot
    || runtimeState.urgencySnapshot
    || factorySummary.urgencySnapshot
    || session?.urgency_snapshot
    || (Array.isArray(agentRoutingState.sortedLanes) && agentRoutingState.laneUrgency
    ? agentRoutingState.sortedLanes.slice(0, 3).map((entry) => {
      const lane = laneLabel(entry);
      return `${lane}:${agentRoutingState.laneUrgency[lane] ?? entry?.urgency ?? 'n/a'}`;
    }).join(', ')
    : 'n/a'));
  const computedTopUrgencyTie = Array.isArray(agentRoutingState.sortedLanes)
    ? agentRoutingState.sortedLanes.filter((entry) => (entry?.urgency ?? null) === topUrgencyValue).map(laneLabel)
    : [];
  const topUrgencyTie = Array.isArray(agentRoutingState.topUrgencyTie) && agentRoutingState.topUrgencyTie.length
    ? agentRoutingState.topUrgencyTie
    : Array.isArray(runtimeState.topUrgencyTie) && runtimeState.topUrgencyTie.length
      ? runtimeState.topUrgencyTie
      : Array.isArray(factorySummary.topUrgencyTie) && factorySummary.topUrgencyTie.length
        ? factorySummary.topUrgencyTie
      : Array.isArray(session?.top_urgency_tie) && session.top_urgency_tie.length
        ? session.top_urgency_tie
        : computedTopUrgencyTie;
  const topUrgencyTieCount = agentRoutingState.topUrgencyTieCount ?? runtimeState.topUrgencyTieCount ?? factorySummary.topUrgencyTieCount ?? session?.top_urgency_tie_count ?? topUrgencyTie.length;
  const topUrgencyTieText = agentRoutingState.topUrgencyTieText
    || runtimeState.topUrgencyTieText
    || factorySummary.topUrgencyTieText
    || session?.top_urgency_tie_text
    || (((agentRoutingState.topUrgencyTieCount ?? topUrgencyTie.length) > 1 || topUrgencyTie.length > 1)
      ? `${topUrgencyTie.join(', ')} (${topUrgencyValue})`
      : 'none');
  const focusAlignment = runtimeState.focusAlignment
    || factorySummary.focusAlignment
    || session?.focus_alignment
    || (primaryFocusAxis === passRecord.candidate.axis
      ? 'aligned'
      : `boosted toward ${primaryFocusAxis}`);
  const routeConfidence = passRecord.reprioritized?.selection_confidence
    || agentRoutingState.routeConfidence
    || runtimeState.routeConfidence
    || factorySummary.routeConfidence
    || session?.route_confidence
    || ((agentRoutingState.topUrgencyTieCount ?? topUrgencyTie.length) > 1 || topUrgencyTie.length > 1
      ? 'tied'
      : (primaryFocusAxis === passRecord.candidate.axis ? 'aligned' : 'boosted'));
  const routeConfidenceText = agentRoutingState.routeConfidenceText
    || runtimeState.routeConfidenceText
    || factorySummary.routeConfidenceText
    || session?.route_confidence_text
    || (routeConfidence === 'tied'
      ? `tied (${topUrgencyTieCount}-way tie)`
      : routeConfidence);
  const baseRouteSummary = agentRoutingState.routeSummary
    || runtimeState.routeSummary
    || factorySummary.routeSummary
    || session?.route_summary
    || `top urgency lane: ${topUrgencyLane} (${topUrgencyValue}) · tie ${topUrgencyTieText} · tie count ${topUrgencyTieCount} · ${routeConfidenceText} · ${routeSource} · origin ${routeContextOrigin}`;
  const routeSummary = baseRouteSummary.includes('· origin ') ? baseRouteSummary : `${baseRouteSummary} · origin ${routeContextOrigin}`;
  return {
    routeSource,
    routeContextOrigin,
    topAxis,
    topUrgencyLane,
    topUrgencyValue,
    topUrgencyTie,
    topUrgencyTieCount,
    topUrgencyTieText,
    persistentBoostAxes,
    latestReviewAxes,
    axisStatus,
    primaryFocusAxis,
    routeScoreGap,
    urgencySnapshot,
    focusAlignment,
    routeConfidence,
    routeConfidenceText,
    routeSummary,
  };
}

async function collectAutoReseedCandidateCompletion(rootDir = ROOT) {
  const runtimeHandoffText = await readTextIfExists(FACTORY_RUNTIME_HANDOFF_PATH, '');
  return {
    'qa-coverage-audit': await fileExists(path.join(rootDir, 'scripts', 'qa', 'list-replay-coverage.js')),
    'operator-run-digest': runtimeHandoffText.includes('factory_run_digest_path'),
    'candidate-artifact': await fileExists(FACTORY_CANDIDATE_ITEMS_PATH),
  };
}

function summarizeFactoryBacklog(backlog, worktreeStatus, candidateCompletion = {}, backlogRefresh = null, refreshContext = null) {
  const annotateWorktreeSafety = (items) => items
    .map((item) => {
      const dirtyOverlap = (item.owned_paths || [])
        .flatMap((ownedPath) => (worktreeStatus?.dirtyTrackedPaths || [])
          .filter((changedPath) => overlapsOwnedPath(changedPath, ownedPath)))
        .slice(0, 8);
      return {
        ...item,
        dirty_overlap: [...new Set(dirtyOverlap)],
        safe_in_worktree: dirtyOverlap.length === 0,
      };
    })
    .sort((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER));
  const availableCandidateItems = FACTORY_AUTO_RESEED_CANDIDATES
    .filter((item) => !candidateCompletion[item.id]);
  if (!backlog || !Array.isArray(backlog.items) || !backlog.items.length) {
    const candidateItems = annotateWorktreeSafety(availableCandidateItems);
    const safeCandidateItems = candidateItems.filter((item) => item.safe_in_worktree);
    const backlogRefreshSummary = summarizeBacklogRefresh(backlogRefresh, refreshContext);
    return {
      activeItems: safeCandidateItems.slice(0, 3),
      candidateItems,
      summaryLines: safeCandidateItems.length ? [
        'Factory self-upgrade backlog: none',
        `Factory worktree guard: dirty tracked ${worktreeStatus?.dirtyTrackedCount ?? 0}, untracked ${worktreeStatus?.untrackedCount ?? 0}, safe candidate ${safeCandidateItems.length}, blocked candidate ${candidateItems.length - safeCandidateItems.length}`,
        ...safeCandidateItems.slice(0, 3).flatMap((item, index) => [
          `Candidate item ${index + 1}: [${item.id}] ${item.title}`,
          `  worktree_guard=${item.safe_in_worktree ? 'safe' : `blocked by dirty overlap: ${item.dirty_overlap.join(', ')}`}`,
          `  owned_paths=${Array.isArray(item.owned_paths) && item.owned_paths.length ? item.owned_paths.join(', ') : 'n/a'}`,
          `  done_when=${Array.isArray(item.done_when) && item.done_when.length ? item.done_when.join(' | ') : 'n/a'}`,
          `  notes=${Array.isArray(item.notes) && item.notes.length ? item.notes.join(' | ') : 'n/a'}`,
        ]),
      ] : buildPromotedBacklogSummaryLines([
        'Factory self-upgrade backlog: none',
        `Factory worktree guard: dirty tracked ${worktreeStatus?.dirtyTrackedCount ?? 0}, untracked ${worktreeStatus?.untrackedCount ?? 0}, safe candidate ${safeCandidateItems.length}, blocked candidate ${candidateItems.length - safeCandidateItems.length}`,
        'Factory next step: no safe candidate items remain; refresh scripts/orchestrate/factory-upgrade-backlog.json or promote a new bounded operator/runtime task.',
      ], backlogRefreshSummary, 'Refresh scripts/orchestrate/factory-upgrade-backlog.json with a new bounded factory improvement or promote a new candidate from runtime handoff and agent-gap artifacts.'),
      guardSummary: {
        dirty_tracked_count: worktreeStatus?.dirtyTrackedCount ?? 0,
        untracked_count: worktreeStatus?.untrackedCount ?? 0,
        safe_open_item_count: 0,
        blocked_open_item_count: 0,
        safe_candidate_item_count: safeCandidateItems.length,
        blocked_candidate_item_count: candidateItems.length - safeCandidateItems.length,
      },
    };
  }

  const openItems = annotateWorktreeSafety(backlog.items.filter((item) => item?.status === 'open'));
  const safeOpenItems = openItems.filter((item) => item.safe_in_worktree);
  const blockedOpenItems = openItems.filter((item) => !item.safe_in_worktree);
  const activeItems = (safeOpenItems.length ? safeOpenItems : openItems).slice(0, 3);

  if (!activeItems.length) {
    const candidateItems = annotateWorktreeSafety(availableCandidateItems);
    const safeCandidateItems = candidateItems.filter((item) => item.safe_in_worktree);
    const backlogRefreshSummary = summarizeBacklogRefresh(backlogRefresh, refreshContext);
    return {
      activeItems: safeCandidateItems.slice(0, 3),
      candidateItems,
      summaryLines: safeCandidateItems.length ? [
        'Factory self-upgrade backlog: no open items',
        `Factory worktree guard: dirty tracked ${worktreeStatus?.dirtyTrackedCount ?? 0}, untracked ${worktreeStatus?.untrackedCount ?? 0}, safe candidate ${safeCandidateItems.length}, blocked candidate ${candidateItems.length - safeCandidateItems.length}`,
        ...safeCandidateItems.slice(0, 3).flatMap((item, index) => [
          `Candidate item ${index + 1}: [${item.id}] ${item.title}`,
          `  worktree_guard=${item.safe_in_worktree ? 'safe' : `blocked by dirty overlap: ${item.dirty_overlap.join(', ')}`}`,
          `  owned_paths=${Array.isArray(item.owned_paths) && item.owned_paths.length ? item.owned_paths.join(', ') : 'n/a'}`,
          `  done_when=${Array.isArray(item.done_when) && item.done_when.length ? item.done_when.join(' | ') : 'n/a'}`,
          `  notes=${Array.isArray(item.notes) && item.notes.length ? item.notes.join(' | ') : 'n/a'}`,
        ]),
      ] : buildPromotedBacklogSummaryLines([
        'Factory self-upgrade backlog: no open items',
        `Factory worktree guard: dirty tracked ${worktreeStatus?.dirtyTrackedCount ?? 0}, untracked ${worktreeStatus?.untrackedCount ?? 0}, safe candidate ${safeCandidateItems.length}, blocked candidate ${candidateItems.length - safeCandidateItems.length}`,
        'Factory next step: no safe candidate items remain; refresh scripts/orchestrate/factory-upgrade-backlog.json or promote a new bounded operator/runtime task.',
      ], backlogRefreshSummary, 'Refresh scripts/orchestrate/factory-upgrade-backlog.json with a new bounded factory improvement or promote a new candidate from runtime handoff and agent-gap artifacts.'),
      guardSummary: {
        dirty_tracked_count: worktreeStatus?.dirtyTrackedCount ?? 0,
        untracked_count: worktreeStatus?.untrackedCount ?? 0,
        safe_open_item_count: 0,
        blocked_open_item_count: 0,
        safe_candidate_item_count: safeCandidateItems.length,
        blocked_candidate_item_count: candidateItems.length - safeCandidateItems.length,
      },
    };
  }

  return {
    activeItems,
    candidateItems: [],
    summaryLines: [
      `Factory self-upgrade campaign: ${backlog.campaign || 'n/a'}`,
      `Factory self-upgrade goal: ${backlog.goal || 'n/a'}`,
      `Factory worktree guard: dirty tracked ${worktreeStatus?.dirtyTrackedCount ?? 0}, untracked ${worktreeStatus?.untrackedCount ?? 0}, safe open ${safeOpenItems.length}, blocked open ${blockedOpenItems.length}`,
      ...activeItems.flatMap((item, index) => [
        `Upgrade item ${index + 1}: [${item.id}] ${item.title}`,
        `  status=${item.status} priority=${item.priority ?? 'n/a'} owner=${item.owner || 'n/a'}`,
        `  worktree_guard=${item.safe_in_worktree ? 'safe' : `blocked by dirty overlap: ${item.dirty_overlap.join(', ')}`}`,
        `  owned_paths=${Array.isArray(item.owned_paths) && item.owned_paths.length ? item.owned_paths.join(', ') : 'n/a'}`,
        `  done_when=${Array.isArray(item.done_when) && item.done_when.length ? item.done_when.join(' | ') : 'n/a'}`,
        `  verification=${Array.isArray(item.verification) && item.verification.length ? item.verification.join(' | ') : 'n/a'}`,
        `  notes=${Array.isArray(item.notes) && item.notes.length ? item.notes.join(' | ') : 'n/a'}`,
      ]),
    ],
    guardSummary: {
      dirty_tracked_count: worktreeStatus?.dirtyTrackedCount ?? 0,
      untracked_count: worktreeStatus?.untrackedCount ?? 0,
      safe_open_item_count: safeOpenItems.length,
      blocked_open_item_count: blockedOpenItems.length,
      blocked_open_items: blockedOpenItems.map((item) => ({
        id: item.id,
        dirty_overlap: item.dirty_overlap,
      })),
    },
  };
}

function summarizeHandoffText(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, 18);
  return {
    hasHandoff: lines.length > 0,
    lines,
  };
}

function summarizeFactoryItem(item) {
  return {
    id: item?.id || null,
    title: item?.title || null,
    priority: item?.priority ?? null,
    status: item?.status || null,
    owner: item?.owner || null,
    safe_in_worktree: item?.safe_in_worktree ?? null,
    dirty_overlap: Array.isArray(item?.dirty_overlap) ? item.dirty_overlap : [],
    owned_paths: Array.isArray(item?.owned_paths) ? item.owned_paths : [],
    done_when: Array.isArray(item?.done_when) ? item.done_when : [],
    verification: Array.isArray(item?.verification) ? item.verification : [],
    notes: Array.isArray(item?.notes) ? item.notes : [],
  };
}

function deriveFactoryUpgradeQueueState(backlogSummary) {
  const safeOpenCount = backlogSummary?.guardSummary?.safe_open_item_count ?? 0;
  const safeCandidateCount = backlogSummary?.guardSummary?.safe_candidate_item_count ?? 0;

  if (safeOpenCount > 0) {
    return {
      status: 'open-backlog',
      next_action: 'Continue the highest-priority safe backlog item.',
    };
  }
  if (safeCandidateCount > 0) {
    return {
      status: 'candidate-available',
      next_action: 'Continue the highest-priority safe candidate item.',
    };
  }
  return {
    status: 'exhausted',
    next_action: 'Refresh scripts/orchestrate/factory-upgrade-backlog.json with a new bounded factory improvement or promote a new candidate from runtime handoff and agent-gap artifacts.',
  };
}

function buildFactoryBacklogRefreshSources() {
  return [
    {
      id: 'canonical_backlog',
      path: FACTORY_UPGRADE_BACKLOG_PATH,
      reason: 'Refresh the canonical factory self-upgrade queue with the next bounded item.',
    },
    {
      id: 'runtime_handoff',
      path: FACTORY_RUNTIME_HANDOFF_PATH,
      reason: 'Review current guarantees and next-direction operator guidance.',
    },
    {
      id: 'agent_routing_state',
      path: path.join(GENERATED_DIR, 'agent-routing-state.json'),
      reason: 'Use current urgency and tie signals to choose the next lane.',
    },
    {
      id: 'factory_candidate_items',
      path: FACTORY_CANDIDATE_ITEMS_PATH,
      reason: 'Confirm queue exhaustion and current worktree guard counts.',
    },
    {
      id: 'factory_backlog_refresh',
      path: FACTORY_BACKLOG_REFRESH_PATH,
      reason: 'Inspect the latest generated reseed proposals before inventing a new backlog item.',
    },
  ];
}

function summarizeBacklogRefresh(backlogRefresh, refreshContext = null) {
  if (!backlogRefresh || typeof backlogRefresh !== 'object') return null;
  const proposedItems = Array.isArray(backlogRefresh.proposed_items) ? backlogRefresh.proposed_items : [];
  const topProposedItem = backlogRefresh.top_proposed_item || proposedItems[0] || null;
  const topProposedBacklogItem = backlogRefresh.top_proposed_backlog_item
    || backlogRefresh.top_proposed_lane_audit?.promote_backlog_item
    || null;
  const staleReasons = [];
  if (refreshContext?.runDir && backlogRefresh.run_dir && backlogRefresh.run_dir !== refreshContext.runDir) {
    staleReasons.push(`run dir mismatch: ${backlogRefresh.run_dir}`);
  }
  if (Number.isFinite(refreshContext?.passIndex) && Number.isFinite(backlogRefresh.pass_index)
    && backlogRefresh.pass_index !== refreshContext.passIndex) {
    staleReasons.push(`pass mismatch: ${backlogRefresh.pass_index}`);
  }
  if (refreshContext?.candidateAxis && backlogRefresh.candidate_axis && backlogRefresh.candidate_axis !== refreshContext.candidateAxis) {
    staleReasons.push(`candidate axis mismatch: ${backlogRefresh.candidate_axis}`);
  }
  const freshnessStatus = staleReasons.length ? 'stale' : 'current';
  const refreshCommand = refreshContext?.runDir && refreshContext?.passJsonPath
    ? `node scripts/orchestrate/materialize-factory-backlog-refresh.js --run-dir ${refreshContext.runDir} --pass-json ${refreshContext.passJsonPath}`
    : null;
  return {
    generated_at: backlogRefresh.generated_at || null,
    run_dir: backlogRefresh.run_dir || null,
    pass_index: backlogRefresh.pass_index ?? null,
    candidate_axis: backlogRefresh.candidate_axis || null,
    queue_status: backlogRefresh.queue_status || null,
    queue_next_action: backlogRefresh.queue_next_action || null,
    freshness_status: freshnessStatus,
    stale_reasons: staleReasons,
    refresh_command: refreshCommand,
    proposed_item_count: proposedItems.length,
    proposed_item_ids: proposedItems.slice(0, 3).map((item) => item.id),
    top_proposed_lane_audit: backlogRefresh.top_proposed_lane_audit || null,
    top_proposed_item: topProposedItem
      ? {
        id: topProposedItem.id || null,
        title: topProposedItem.title || null,
        priority: topProposedItem.priority ?? null,
        lane: topProposedItem.lane || null,
        lane_audit_path: topProposedItem.lane_audit_path || backlogRefresh.top_proposed_lane_audit?.path || null,
      }
      : null,
    top_proposed_backlog_item: topProposedBacklogItem
      ? {
        id: topProposedBacklogItem.id || null,
        title: topProposedBacklogItem.title || null,
        status: topProposedBacklogItem.status || null,
        priority: topProposedBacklogItem.priority ?? null,
        owner: topProposedBacklogItem.owner || null,
        owned_paths: Array.isArray(topProposedBacklogItem.owned_paths) ? topProposedBacklogItem.owned_paths : [],
        done_when: Array.isArray(topProposedBacklogItem.done_when) ? topProposedBacklogItem.done_when : [],
        verification: Array.isArray(topProposedBacklogItem.verification) ? topProposedBacklogItem.verification : [],
        notes: Array.isArray(topProposedBacklogItem.notes) ? topProposedBacklogItem.notes : [],
      }
      : null,
  };
}

function buildExhaustedNextAction(backlogRefreshSummary, fallback) {
  if (backlogRefreshSummary?.freshness_status === 'stale') {
    if (backlogRefreshSummary.refresh_command) {
      return `Refresh ${FACTORY_BACKLOG_REFRESH_PATH} for the current run/pass via ${backlogRefreshSummary.refresh_command} before promoting a backlog item.`;
    }
    return `Refresh ${FACTORY_BACKLOG_REFRESH_PATH} for the current run/pass before promoting a backlog item.`;
  }
  if (backlogRefreshSummary?.queue_next_action) return backlogRefreshSummary.queue_next_action;
  const topProposal = backlogRefreshSummary?.top_proposed_item;
  if (!topProposal?.id) return fallback;
  return `Promote ${topProposal.id} from ${FACTORY_BACKLOG_REFRESH_PATH} or refresh ${FACTORY_UPGRADE_BACKLOG_PATH}.`;
}

function buildPromotedBacklogSummaryLines(summaryLines, backlogRefreshSummary, fallbackNextAction) {
  const nextAction = buildExhaustedNextAction(backlogRefreshSummary, fallbackNextAction);
  const promotedLines = (Array.isArray(summaryLines) ? summaryLines : []).map((line) => (
    line.startsWith('Factory next step:')
      ? `Factory next step: ${nextAction}`
      : line
  ));
  if (backlogRefreshSummary?.freshness_status === 'stale') {
    const staleLine = `Backlog refresh status: stale (${backlogRefreshSummary.stale_reasons.join(' | ') || 'context mismatch'})`;
    if (!promotedLines.includes(staleLine)) promotedLines.push(staleLine);
    const refreshCommandLine = backlogRefreshSummary.refresh_command
      ? `Backlog refresh refresh command: ${backlogRefreshSummary.refresh_command}`
      : null;
    if (refreshCommandLine && !promotedLines.includes(refreshCommandLine)) promotedLines.push(refreshCommandLine);
    return promotedLines;
  }
  const topProposalLine = backlogRefreshSummary?.top_proposed_item
    ? `Backlog refresh top proposal: ${backlogRefreshSummary.top_proposed_item.id}`
    : null;
  if (topProposalLine && !promotedLines.includes(topProposalLine)) promotedLines.push(topProposalLine);
  const topAuditLine = backlogRefreshSummary?.top_proposed_item?.lane_audit_path
    ? `Backlog refresh top audit: ${backlogRefreshSummary.top_proposed_item.lane_audit_path}`
    : null;
  if (topAuditLine && !promotedLines.includes(topAuditLine)) promotedLines.push(topAuditLine);
  const topBacklogTemplateLine = backlogRefreshSummary?.top_proposed_backlog_item?.id
    ? `Backlog refresh promotion template: ${backlogRefreshSummary.top_proposed_backlog_item.id}`
    : null;
  if (topBacklogTemplateLine && !promotedLines.includes(topBacklogTemplateLine)) promotedLines.push(topBacklogTemplateLine);
  return promotedLines;
}

async function materializeCandidateItemsArtifact({
  backlogSummary,
  backlogRefresh = null,
  runDir = null,
  passRecord = null,
  passJsonPath = null,
}) {
  const queueState = deriveFactoryUpgradeQueueState(backlogSummary);
  const refreshSources = queueState.status === 'exhausted' ? buildFactoryBacklogRefreshSources() : [];
  const backlogRefreshSummary = queueState.status === 'exhausted'
    ? summarizeBacklogRefresh(backlogRefresh, {
      runDir,
      passIndex: passRecord?.index ?? null,
      candidateAxis: passRecord?.candidate?.axis || null,
      passJsonPath,
    })
    : null;
  const nextAction = queueState.status === 'exhausted'
    ? buildExhaustedNextAction(backlogRefreshSummary, queueState.next_action)
    : queueState.next_action;
  const summaryLines = queueState.status === 'exhausted'
    ? buildPromotedBacklogSummaryLines(backlogSummary.summaryLines, backlogRefreshSummary, queueState.next_action)
    : backlogSummary.summaryLines;
  const artifact = {
    generated_at: new Date().toISOString(),
    source: 'run-codex-factory-agent',
    run_dir: runDir,
    pass_index: passRecord?.index ?? null,
    candidate_id: passRecord?.candidate?.id ?? null,
    candidate_axis: passRecord?.candidate?.axis ?? null,
    factory_upgrade_queue_status: queueState.status,
    next_action: nextAction,
    refresh_sources: refreshSources,
    factory_backlog_refresh_path: backlogRefreshSummary ? FACTORY_BACKLOG_REFRESH_PATH : null,
    factory_backlog_refresh: backlogRefreshSummary,
    worktree_guard: backlogSummary.guardSummary,
    summary_lines: summaryLines,
    factory_upgrade_focus: (backlogSummary.activeItems || []).map(summarizeFactoryItem),
    factory_candidate_items: (backlogSummary.candidateItems || []).map(summarizeFactoryItem),
  };

  await writeJsonArtifact(FACTORY_CANDIDATE_ITEMS_PATH, artifact);
  return {
    path: FACTORY_CANDIDATE_ITEMS_PATH,
    summary: artifact,
  };
}

function summarizeReplayDigestSummary(replayDigest, replayFailures) {
  if (!replayDigest?.summary) return null;
  return {
    status: replayDigest.summary.status || null,
    axis: replayDigest.summary.axis || null,
    total_checks: replayDigest.summary.total_checks ?? null,
    passed_count: replayDigest.summary.passed_count ?? null,
    failed_count: replayDigest.summary.failed_count ?? replayFailures?.failed_check_ids?.length ?? null,
    passed_check_ids: Array.isArray(replayDigest.summary.passed_check_ids) ? replayDigest.summary.passed_check_ids : [],
    failed_check_ids: Array.isArray(replayDigest.summary.failed_check_ids)
      ? replayDigest.summary.failed_check_ids
      : (replayFailures?.failed_check_ids || []),
    source_path: replayDigest.summary.source_path || null,
    source_file: replayDigest.summary.source_file || null,
  };
}

function laneKeywords(lane) {
  const keywords = {
    'app-surface': ['app-surface'],
    'theme-independence': ['theme', 'boundary'],
    'engine-slice': ['engine', 'slice'],
    'design-surface': ['design', 'surface'],
    'content-pipeline': ['content', 'pipeline'],
    autotest: ['autotest', 'qa'],
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
    entry?.why_now,
    ...(Array.isArray(entry?.done_when) ? entry.done_when : []),
  ]
    .filter(Boolean)
    .join(' ');
  return laneKeywords(lane).some((keyword) => {
    const pattern = escapeRegExp(keyword).replace(/\\ /g, '\\s+');
    return new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`, 'i').test(haystack);
  });
}

function buildRouteTieBreak(routeMeta, backlogSummary, backlogRefresh) {
  const tiedLanes = Array.isArray(routeMeta?.topUrgencyTie) && routeMeta.topUrgencyTie.length
    ? routeMeta.topUrgencyTie
    : (routeMeta?.topUrgencyLane ? [routeMeta.topUrgencyLane] : []);
  if (tiedLanes.length <= 1) {
    return {
      status: 'not-needed',
      tied_lanes: tiedLanes,
      recommended_lane: routeMeta?.topUrgencyLane || null,
      reason: 'No top-urgency tie detected.',
      supporting_items: [],
    };
  }

  const backlogRefreshItems = Array.isArray(backlogRefresh?.proposed_items) ? backlogRefresh.proposed_items : [];
  const openBacklogItems = Array.isArray(backlogSummary?.activeItems) ? backlogSummary.activeItems : [];
  const scoredLanes = tiedLanes.map((lane, index) => {
    const proposalSupport = backlogRefreshItems.filter((item) => supportsLane(item, lane)).map((item) => ({
      source: 'backlog-refresh',
      id: item.id,
      title: item.title,
    }));
    const openSupport = openBacklogItems.filter((item) => supportsLane(item, lane)).map((item) => ({
      source: 'open-backlog',
      id: item.id,
      title: item.title,
    }));
    const supportingItems = [...proposalSupport, ...openSupport];
    const factoryRestricted = lane === 'app-surface';
    return {
      lane,
      index,
      factory_restricted: factoryRestricted,
      supporting_items: supportingItems,
      score: (factoryRestricted ? 0 : 2) + supportingItems.length,
    };
  }).sort((left, right) => (
    right.score - left.score
    || Number(left.factory_restricted) - Number(right.factory_restricted)
    || left.index - right.index
  ));

  const recommended = scoredLanes[0];
  const otherRestrictedLanes = scoredLanes.filter((entry) => entry.factory_restricted).map((entry) => entry.lane);
  const reasons = [];
  if (otherRestrictedLanes.length) {
    reasons.push(`factory phase avoids direct ${otherRestrictedLanes.join(', ')} mutation even when urgency is tied`);
  }
  if (recommended.supporting_items.length) {
    reasons.push(`${recommended.lane} has the strongest factory-safe follow-up signal via ${recommended.supporting_items.map((item) => item.id).join(', ')}`);
  } else {
    reasons.push('no lane-specific factory-safe follow-up item exists, so tie order is used as the fallback');
  }

  return {
    status: 'tied',
    tied_lanes: tiedLanes,
    recommended_lane: recommended.lane,
    reason: reasons.join('; '),
    supporting_items: recommended.supporting_items,
  };
}

async function materializeFactoryRunDigest({
  runDir,
  passRecord,
  routeMeta,
  backlogSummary,
  backlogRefresh = null,
  passJsonPath = null,
  model = null,
  threadId = null,
  status,
  phase,
  replayVerification = null,
  replayDigest = null,
  replayFailures = null,
  sessionPath = null,
  lastMessagePath = null,
  usagePath = null,
  transcriptPath = null,
  usage = null,
  usageDelta = null,
  factoryCandidateItemsPath = null,
  resumed = null,
}) {
  const codexDir = path.join(runDir, 'codex-factory');
  const digestPath = path.join(codexDir, `pass-${String(passRecord.index).padStart(3, '0')}-factory-run-digest.json`);
  const queueState = deriveFactoryUpgradeQueueState(backlogSummary);
  const refreshSources = queueState.status === 'exhausted' ? buildFactoryBacklogRefreshSources() : [];
  const backlogRefreshSummary = queueState.status === 'exhausted'
    ? summarizeBacklogRefresh(backlogRefresh, {
      runDir,
      passIndex: passRecord?.index ?? null,
      candidateAxis: passRecord?.candidate?.axis || null,
      passJsonPath,
    })
    : null;
  const routeTieBreak = buildRouteTieBreak(
    routeMeta,
    backlogSummary,
    backlogRefreshSummary?.freshness_status === 'current' ? backlogRefresh : null,
  );
  const nextAction = queueState.status === 'exhausted'
    ? buildExhaustedNextAction(backlogRefreshSummary, queueState.next_action)
    : queueState.next_action;
  const digest = {
    generated_at: new Date().toISOString(),
    source: 'run-codex-factory-agent',
    status,
    phase,
    run_dir: runDir,
    pass_index: passRecord.index,
    candidate_id: passRecord.candidate.id,
    candidate_axis: passRecord.candidate.axis,
    factory_upgrade_queue_status: queueState.status,
    next_action: nextAction,
    refresh_sources: refreshSources,
    factory_backlog_refresh_path: backlogRefreshSummary ? FACTORY_BACKLOG_REFRESH_PATH : null,
    factory_backlog_refresh: backlogRefreshSummary,
    route_tie_break: routeTieBreak,
    route: {
      primary_focus_axis: routeMeta?.primaryFocusAxis ?? null,
      focus_alignment: routeMeta?.focusAlignment ?? null,
      route_source: routeMeta?.routeSource ?? null,
      route_context_origin: routeMeta?.routeContextOrigin ?? null,
      route_summary: routeMeta?.routeSummary ?? null,
      route_confidence_text: routeMeta?.routeConfidenceText ?? routeMeta?.routeConfidence ?? null,
      top_urgency_lane: routeMeta?.topUrgencyLane ?? null,
      top_urgency_value: routeMeta?.topUrgencyValue ?? null,
      top_urgency_tie_text: routeMeta?.topUrgencyTieText ?? null,
      urgency_snapshot: routeMeta?.urgencySnapshot ?? null,
    },
    worktree_guard: backlogSummary.guardSummary,
    factory_upgrade_focus: (backlogSummary.activeItems || []).map((item) => ({
      id: item.id,
      title: item.title,
      priority: item.priority ?? null,
      safe_in_worktree: item.safe_in_worktree,
      dirty_overlap: item.dirty_overlap,
    })),
    artifacts: {
      factory_candidate_items_path: factoryCandidateItemsPath,
      factory_backlog_refresh_path: backlogRefreshSummary ? FACTORY_BACKLOG_REFRESH_PATH : null,
      factory_lane_follow_through_audit_path: backlogRefreshSummary?.top_proposed_item?.lane_audit_path || null,
      replay_verification_path: replayVerification?.path || null,
      replay_digest_path: replayDigest?.path || null,
      session_path: sessionPath,
      last_message_path: lastMessagePath,
      usage_path: usagePath,
      transcript_path: transcriptPath,
    },
    replay_digest: summarizeReplayDigestSummary(replayDigest, replayFailures),
    replay_failure_ids: replayFailures?.failed_check_ids || [],
    usage,
    usage_delta: usageDelta,
    model,
    thread_id: threadId,
    resumed,
  };

  await ensureDir(codexDir);
  await writeJsonArtifact(digestPath, digest);
  return {
    path: digestPath,
    summary: digest,
  };
}

function buildPrompt({
  runDir,
  passRecord,
  runtimeState,
  factorySummary,
  agentRoutingState,
  session,
  backlogSummary,
  worktreeStatus,
  factoryHandoffPath,
  factoryHandoffText,
}) {
  const {
    routeSource,
    routeContextOrigin,
    topAxis,
    topUrgencyLane,
    topUrgencyValue,
    topUrgencyTieText,
    topUrgencyTieCount,
    urgencySnapshot,
    routeSummary,
    primaryFocusAxis,
    focusAlignment,
    routeConfidence,
    routeConfidenceText,
    routeScoreGap,
    persistentBoostAxes,
    latestReviewAxes,
    axisStatus,
  } = deriveRouteMetadata({ passRecord, runtimeState, factorySummary, agentRoutingState, session });
  const handoff = summarizeHandoffText(factoryHandoffText);
  return [
    'Continue the wdttgukji factory-improvement lane using this Codex thread context.',
    `Current durable run dir: ${runDir}`,
    `Current pass json: ${path.join(runDir, `pass-${String(passRecord.index).padStart(3, '0')}.json`)}`,
    `Current candidate axis: ${passRecord.candidate.axis}`,
    `Top runtime boost axis: ${topAxis}`,
    `Route source: ${routeSource}`,
    `Route context origin: ${routeContextOrigin}`,
    `Top urgency lane: ${topUrgencyLane}`,
    `Top urgency value: ${topUrgencyValue}`,
    `Top urgency tie count: ${topUrgencyTieCount}`,
    `Top urgency tie: ${topUrgencyTieText}`,
    `Urgency snapshot: ${urgencySnapshot}`,
    `Route summary: ${routeSummary}`,
    `Primary improvement target: ${primaryFocusAxis}`,
    `Focus alignment: ${focusAlignment}`,
    `Route confidence raw: ${routeConfidence}${routeScoreGap != null ? ` (score gap ${routeScoreGap})` : ''}`,
    `Route confidence: ${routeConfidenceText}${routeScoreGap != null ? ` (score gap ${routeScoreGap})` : ''}`,
    `Persistent boost axes: ${persistentBoostAxes.length ? persistentBoostAxes.join(', ') : 'none'}`,
    `Latest checkpoint boost axes: ${latestReviewAxes.length ? latestReviewAxes.join(', ') : 'none'}`,
    `Current axis routing status: ${axisStatus ? `pass ${axisStatus.pass_index}, chosen next ${axisStatus.chosen_next_pass || 'n/a'}, bottleneck ${axisStatus.dominant_bottleneck || 'n/a'}` : 'none'}`,
    `Factory worktree status source: ${worktreeStatus?.source || 'n/a'}`,
    ...backlogSummary.summaryLines,
    ...(handoff.hasHandoff
      ? [
        `Factory runtime handoff path: ${factoryHandoffPath}`,
        'Factory runtime handoff excerpt:',
        ...handoff.lines.map((line) => `  ${line}`),
      ]
      : []),
    'Task:',
    '- Make one concrete, bounded improvement to the factory itself.',
    '- Prefer scripts/orchestrate, scripts/qa, docs, README, or other workflow/runtime files.',
    '- Improve orchestration quality, QA quality, policy quality, routing, review signals, or artifact usefulness.',
    '- Do not touch public app-surface files in this factory hook.',
    '- Keep changes bounded and directly relevant to the current lane or factory reliability.',
    '- If the factory self-upgrade backlog has open items, prefer the highest-priority item whose owned paths are safe to edit in the current worktree.',
    '- Treat backlog items blocked by dirty tracked overlap as read-only unless the overlap is clearly your own intentional continuation.',
    '- If you complete or materially advance a backlog item, update scripts/orchestrate/factory-upgrade-backlog.json with the new status or notes.',
    'Verification:',
    '- Run node --check on any changed .js file.',
    '- Run one relevant lightweight command if it helps prove the change.',
    'Finish by briefly listing changed files and verification results.',
  ].join('\n');
}

function runCodex(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn('codex', args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

function runNodeCommand(args, cwd = ROOT) {
  return runProcess(process.execPath, args, cwd);
}

function extractThreadId(stdout, fallback) {
  const lines = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'thread.started' && parsed.thread_id) return parsed.thread_id;
    } catch {}
  }
  return fallback;
}

function extractUsage(stdout) {
  const lines = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(lines[index]);
      const usage = parsed.usage || parsed.response?.usage || parsed.result?.usage || parsed.event?.usage;
      if (usage) {
        return {
          input_tokens: usage.input_tokens ?? usage.inputTokens ?? null,
          output_tokens: usage.output_tokens ?? usage.outputTokens ?? null,
          total_tokens: usage.total_tokens ?? usage.totalTokens ?? null,
        };
      }
    } catch {}
  }
  return {
    input_tokens: null,
    output_tokens: null,
    total_tokens: null,
  };
}

function computeUsageDelta(currentUsage, previousUsage) {
  const diff = (current, previous) => {
    if (!Number.isFinite(current)) return null;
    if (!Number.isFinite(previous)) return current;
    return Math.max(0, current - previous);
  };

  const deltaInput = diff(currentUsage.input_tokens, previousUsage?.input_tokens);
  const deltaOutput = diff(currentUsage.output_tokens, previousUsage?.output_tokens);
  const deltaTotal = Number.isFinite(currentUsage.total_tokens)
    ? diff(currentUsage.total_tokens, previousUsage?.total_tokens)
    : (Number.isFinite(deltaInput) || Number.isFinite(deltaOutput)
      ? (deltaInput ?? 0) + (deltaOutput ?? 0)
      : null);

  return {
    delta_input_tokens: deltaInput,
    delta_output_tokens: deltaOutput,
    delta_total_tokens: deltaTotal,
  };
}

function extractJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function summarizeReplayFailures(summary) {
  const failedChecks = Array.isArray(summary?.failed_checks)
    ? summary.failed_checks
    : Array.isArray(summary?.checks)
      ? summary.checks.filter((check) => check?.status === 'failed').map((check) => ({
        id: check.id,
        script: check.script,
        code: check.code,
        failure_summary: check.failure_summary || null,
        failure_excerpt: check.failure_excerpt || null,
      }))
      : [];
  return {
    failed_check_ids: failedChecks.map((check) => check.id),
    failed_checks: failedChecks,
  };
}

async function runReplayVerification(passRecord, codexDir) {
  const axis = passRecord.candidate.axis;
  const replayPath = path.join(codexDir, `pass-${String(passRecord.index).padStart(3, '0')}-replay-suite.json`);
  const result = await runNodeCommand(['scripts/qa/run-factory-replay-suite.js', '--axis', axis], ROOT);
  await fs.writeFile(replayPath, result.stdout, 'utf8');
  return {
    path: replayPath,
    result,
    summary: extractJson(result.stdout),
  };
}

async function materializeReplayDigest(passRecord, codexDir, replayVerificationPath) {
  const digestPath = path.join(codexDir, `pass-${String(passRecord.index).padStart(3, '0')}-replay-digest.json`);
  const result = await runNodeCommand([
    'scripts/qa/materialize-replay-summary.js',
    '--input',
    replayVerificationPath,
    '--output',
    digestPath,
  ], ROOT);
  return {
    path: digestPath,
    result,
    summary: extractJson(result.stdout),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const passRecord = args.passJson
    ? JSON.parse(await fs.readFile(args.passJson, 'utf8'))
    : null;
  const factoryBacklog = await readJsonIfExists(FACTORY_UPGRADE_BACKLOG_PATH, null);
  const backlogRefresh = await readJsonIfExists(FACTORY_BACKLOG_REFRESH_PATH, null);
  const worktreeStatus = await collectWorktreeStatus(ROOT);
  const candidateCompletion = await collectAutoReseedCandidateCompletion(ROOT);
  const backlogSummary = summarizeFactoryBacklog(factoryBacklog, worktreeStatus, candidateCompletion, backlogRefresh, {
    runDir: args.runDir,
    passIndex: passRecord?.index ?? null,
    candidateAxis: passRecord?.candidate?.axis || null,
    passJsonPath: args.passJson,
  });
  const candidateArtifact = await materializeCandidateItemsArtifact({
    backlogSummary,
    backlogRefresh,
    runDir: args.runDir,
    passRecord,
    passJsonPath: args.passJson,
  });

  if (args.materializeCandidateArtifactOnly) {
    console.log(JSON.stringify({
      status: 'completed',
      phase: 'factory-candidate-artifact',
      factory_candidate_items_path: candidateArtifact.path,
      factory_upgrade_queue_status: candidateArtifact.summary.factory_upgrade_queue_status,
      next_action: candidateArtifact.summary.next_action,
      refresh_sources: candidateArtifact.summary.refresh_sources,
      factory_backlog_refresh_path: candidateArtifact.summary.factory_backlog_refresh_path,
      factory_backlog_refresh: candidateArtifact.summary.factory_backlog_refresh,
      factory_candidate_items: candidateArtifact.summary.factory_candidate_items,
      factory_upgrade_focus: candidateArtifact.summary.factory_upgrade_focus,
      worktree_guard: backlogSummary.guardSummary,
    }, null, 2));
    return;
  }

  if (process.env.WDTT_CODEX_FACTORY_ENABLED !== 'true') {
    console.log(JSON.stringify({
      status: 'skipped',
      reason: 'WDTT_CODEX_FACTORY_ENABLED=false',
      factory_candidate_items_path: candidateArtifact.path,
      factory_upgrade_queue_status: candidateArtifact.summary.factory_upgrade_queue_status,
      next_action: candidateArtifact.summary.next_action,
      refresh_sources: candidateArtifact.summary.refresh_sources,
      factory_backlog_refresh_path: candidateArtifact.summary.factory_backlog_refresh_path,
      factory_backlog_refresh: candidateArtifact.summary.factory_backlog_refresh,
      factory_candidate_items: candidateArtifact.summary.factory_candidate_items,
      factory_upgrade_focus: candidateArtifact.summary.factory_upgrade_focus,
      worktree_guard: backlogSummary.guardSummary,
    }, null, 2));
    return;
  }

  const runtimeState = await readJsonIfExists(path.join(GENERATED_DIR, 'runtime-state.json'), {});
  const factorySummary = await readJsonIfExists(path.join(GENERATED_DIR, 'factory-runtime-summary.json'), {});
  const agentRoutingState = await readJsonIfExists(path.join(GENERATED_DIR, 'agent-routing-state.json'), {});
  const factoryHandoffText = await readTextIfExists(FACTORY_RUNTIME_HANDOFF_PATH, '');
  const sessionPath = process.env.WDTT_CODEX_FACTORY_SESSION_FILE || DEFAULT_SESSION_PATH;
  const session = await readJsonIfExists(sessionPath, null);
  const routeMeta = deriveRouteMetadata({ passRecord, runtimeState, factorySummary, agentRoutingState, session });

  if (args.materializeOperatorRunDigestOnly) {
    const factoryRunDigest = await materializeFactoryRunDigest({
      runDir: args.runDir,
      passRecord,
      routeMeta,
      backlogSummary,
      backlogRefresh,
      passJsonPath: args.passJson,
      status: 'planned',
      phase: 'preflight',
      sessionPath,
      factoryCandidateItemsPath: candidateArtifact.path,
      resumed: !!session?.thread_id,
      model: process.env.WDTT_CODEX_MODEL || DEFAULT_MODEL,
    });
    console.log(JSON.stringify({
      status: 'completed',
      phase: 'factory-run-digest',
      factory_run_digest_path: factoryRunDigest.path,
      factory_run_digest: factoryRunDigest.summary,
      factory_candidate_items_path: candidateArtifact.path,
      worktree_guard: backlogSummary.guardSummary,
    }, null, 2));
    return;
  }

  const codexDir = path.join(args.runDir, 'codex-factory');
  await ensureDir(codexDir);
  const lastMessagePath = path.join(codexDir, `pass-${String(passRecord.index).padStart(3, '0')}-last-message.txt`);
  const usagePath = path.join(codexDir, `pass-${String(passRecord.index).padStart(3, '0')}-usage.json`);
  const transcriptPath = path.join(codexDir, `pass-${String(passRecord.index).padStart(3, '0')}-codex.jsonl`);
  const prompt = buildPrompt({
    runDir: args.runDir,
    passRecord,
    runtimeState,
    factorySummary,
    agentRoutingState,
    session,
    backlogSummary,
    worktreeStatus,
    factoryHandoffPath: FACTORY_RUNTIME_HANDOFF_PATH,
    factoryHandoffText,
  });
  const model = process.env.WDTT_CODEX_MODEL || DEFAULT_MODEL;

  const codexArgs = session?.thread_id
    ? ['exec', 'resume', session.thread_id, '--json', '-o', lastMessagePath, prompt]
    : ['exec', '--json', '--full-auto', '-C', ROOT, '-o', lastMessagePath, prompt];
  if (model) {
    const insertAt = session?.thread_id ? 3 : 2;
    codexArgs.splice(insertAt, 0, '--model', model);
  }

  const result = await runCodex(codexArgs, ROOT);
  const threadId = extractThreadId(result.stdout, session?.thread_id || null);
  const usage = extractUsage(result.stdout);
  const usageDelta = computeUsageDelta(usage, session?.last_usage || null);
  await ensureDir(path.dirname(sessionPath));
  await fs.writeFile(transcriptPath, result.stdout, 'utf8');
  await fs.writeFile(usagePath, `${JSON.stringify({
    model,
    thread_id: threadId,
    resumed: !!session?.thread_id,
    pass_index: passRecord.index,
    candidate_id: passRecord.candidate.id,
    candidate_axis: passRecord.candidate.axis,
    ...usage,
    ...usageDelta,
    updated_at: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8');
  if (threadId) {
    await fs.writeFile(sessionPath, `${JSON.stringify({
      thread_id: threadId,
      model,
      updated_at: new Date().toISOString(),
      last_run_dir: args.runDir,
      last_pass_index: passRecord.index,
      last_axis: passRecord.candidate.axis,
      primary_focus_axis: agentRoutingState.primaryFocusAxis || runtimeState.primaryFocusAxis || factorySummary.primaryFocusAxis || null,
      focus_alignment: routeMeta.focusAlignment,
      top_urgency_lane: agentRoutingState.topUrgencyLane || runtimeState.topUrgencyLane || factorySummary.topUrgencyLane || null,
      top_urgency_value: agentRoutingState.topUrgencyValue ?? runtimeState.topUrgencyValue ?? factorySummary.topUrgencyValue ?? null,
      route_source: agentRoutingState.routeSource || runtimeState.routeSource || factorySummary.routeSource || null,
      route_context_origin: routeMeta.routeContextOrigin,
      route_confidence: agentRoutingState.routeConfidence || runtimeState.routeConfidence || factorySummary.routeConfidence || null,
      route_confidence_raw: agentRoutingState.routeConfidence || runtimeState.routeConfidence || factorySummary.routeConfidence || null,
      route_confidence_text: routeMeta.routeConfidenceText,
      route_summary: routeMeta.routeSummary,
      urgency_snapshot: agentRoutingState.urgencySnapshot || runtimeState.urgencySnapshot || factorySummary.urgencySnapshot || routeMeta.urgencySnapshot,
      top_urgency_tie: agentRoutingState.topUrgencyTie || runtimeState.topUrgencyTie || factorySummary.topUrgencyTie || [],
      top_urgency_tie_text: agentRoutingState.topUrgencyTieText || runtimeState.topUrgencyTieText || factorySummary.topUrgencyTieText || 'none',
      top_urgency_tie_count: agentRoutingState.topUrgencyTieCount ?? runtimeState.topUrgencyTieCount ?? factorySummary.topUrgencyTieCount ?? 0,
      worktree_guard: backlogSummary.guardSummary,
      last_usage: usage,
    }, null, 2)}\n`, 'utf8');
  }

  if (!result.ok) {
    console.error(result.stderr || result.stdout);
    process.exit(result.code || 1);
  }

  const replayVerification = await runReplayVerification(passRecord, codexDir);
  const replayFailures = summarizeReplayFailures(replayVerification.summary);
  const replayDigest = await materializeReplayDigest(passRecord, codexDir, replayVerification.path);
  const factoryRunDigest = await materializeFactoryRunDigest({
    runDir: args.runDir,
    passRecord,
    routeMeta,
    backlogSummary,
    backlogRefresh,
    passJsonPath: args.passJson,
    model,
    threadId,
    status: replayDigest.result.ok && replayVerification.result.ok ? 'completed' : 'failed',
    phase: replayDigest.result.ok ? (replayVerification.result.ok ? 'completed' : 'replay-verification') : 'replay-summary',
    replayVerification,
    replayDigest,
    replayFailures,
    sessionPath,
    lastMessagePath,
    usagePath,
    transcriptPath,
    usage,
    usageDelta,
    factoryCandidateItemsPath: candidateArtifact.path,
    resumed: !!session?.thread_id,
  });
  if (!replayDigest.result.ok) {
    console.log(JSON.stringify({
      status: 'failed',
      phase: 'replay-summary',
      code: replayDigest.result.code || 1,
      thread_id: threadId,
      model,
      primary_focus_axis: agentRoutingState.primaryFocusAxis || runtimeState.primaryFocusAxis || factorySummary.primaryFocusAxis || null,
      focus_alignment: routeMeta.focusAlignment,
      route_source: agentRoutingState.routeSource || runtimeState.routeSource || factorySummary.routeSource || null,
      route_context_origin: routeMeta.routeContextOrigin,
      route_summary: routeMeta.routeSummary,
      replay_verification_path: replayVerification.path,
      replay_verification: replayVerification.summary,
      replay_digest_path: replayDigest.path,
      replay_digest: replayDigest.summary,
      replay_failure_ids: replayFailures.failed_check_ids,
      replay_failures: replayFailures.failed_checks,
      factory_run_digest_path: factoryRunDigest.path,
      factory_run_digest: factoryRunDigest.summary,
      factory_candidate_items_path: candidateArtifact.path,
      factory_candidate_items: candidateArtifact.summary.factory_candidate_items,
      worktree_guard: backlogSummary.guardSummary,
      session_path: sessionPath,
      last_message_path: lastMessagePath,
      usage_path: usagePath,
      transcript_path: transcriptPath,
    }, null, 2));
    process.exit(replayDigest.result.code || 1);
  }
  if (!replayVerification.result.ok) {
    console.log(JSON.stringify({
      status: 'failed',
      phase: 'replay-verification',
      code: replayVerification.result.code || 1,
      thread_id: threadId,
      model,
      primary_focus_axis: agentRoutingState.primaryFocusAxis || runtimeState.primaryFocusAxis || factorySummary.primaryFocusAxis || null,
      focus_alignment: routeMeta.focusAlignment,
      route_source: agentRoutingState.routeSource || runtimeState.routeSource || factorySummary.routeSource || null,
      route_context_origin: routeMeta.routeContextOrigin,
      route_summary: routeMeta.routeSummary,
      replay_verification_path: replayVerification.path,
      replay_verification: replayVerification.summary,
      replay_digest_path: replayDigest.path,
      replay_digest: replayDigest.summary,
      replay_failure_ids: replayFailures.failed_check_ids,
      replay_failures: replayFailures.failed_checks,
      factory_run_digest_path: factoryRunDigest.path,
      factory_run_digest: factoryRunDigest.summary,
      factory_candidate_items_path: candidateArtifact.path,
      factory_candidate_items: candidateArtifact.summary.factory_candidate_items,
      worktree_guard: backlogSummary.guardSummary,
      session_path: sessionPath,
      last_message_path: lastMessagePath,
      usage_path: usagePath,
      transcript_path: transcriptPath,
    }, null, 2));
    process.exit(replayVerification.result.code || 1);
  }

  console.log(JSON.stringify({
    status: 'completed',
    code: result.code,
    thread_id: threadId,
    model,
    primary_focus_axis: agentRoutingState.primaryFocusAxis || runtimeState.primaryFocusAxis || factorySummary.primaryFocusAxis || null,
    focus_alignment: routeMeta.focusAlignment,
    route_source: agentRoutingState.routeSource || runtimeState.routeSource || factorySummary.routeSource || null,
    route_context_origin: routeMeta.routeContextOrigin,
    route_summary: routeMeta.routeSummary,
    route_confidence_raw: agentRoutingState.routeConfidence || runtimeState.routeConfidence || factorySummary.routeConfidence || null,
    route_confidence_text: routeMeta.routeConfidenceText,
    urgency_snapshot: agentRoutingState.urgencySnapshot || runtimeState.urgencySnapshot || factorySummary.urgencySnapshot || routeMeta.urgencySnapshot,
    top_urgency_lane: agentRoutingState.topUrgencyLane || runtimeState.topUrgencyLane || factorySummary.topUrgencyLane || null,
    top_urgency_value: agentRoutingState.topUrgencyValue ?? runtimeState.topUrgencyValue ?? factorySummary.topUrgencyValue ?? null,
    top_urgency_tie: agentRoutingState.topUrgencyTie || runtimeState.topUrgencyTie || factorySummary.topUrgencyTie || [],
    top_urgency_tie_text: agentRoutingState.topUrgencyTieText || runtimeState.topUrgencyTieText || factorySummary.topUrgencyTieText || 'none',
    top_urgency_tie_count: agentRoutingState.topUrgencyTieCount ?? runtimeState.topUrgencyTieCount ?? factorySummary.topUrgencyTieCount ?? 0,
    session_path: sessionPath,
    last_message_path: lastMessagePath,
    usage_path: usagePath,
    transcript_path: transcriptPath,
    factory_upgrade_backlog_path: factoryBacklog ? FACTORY_UPGRADE_BACKLOG_PATH : null,
    factory_runtime_handoff_path: factoryHandoffText ? FACTORY_RUNTIME_HANDOFF_PATH : null,
    factory_run_digest_path: factoryRunDigest.path,
    factory_run_digest: factoryRunDigest.summary,
    factory_candidate_items_path: candidateArtifact.path,
    factory_upgrade_focus: backlogSummary.activeItems.map((item) => ({
      id: item.id,
      title: item.title,
      priority: item.priority ?? null,
      status: item.status,
      safe_in_worktree: item.safe_in_worktree,
      dirty_overlap: item.dirty_overlap,
    })),
    factory_candidate_items: (backlogSummary.candidateItems || []).map((item) => ({
      id: item.id,
      title: item.title,
      priority: item.priority ?? null,
      safe_in_worktree: item.safe_in_worktree,
      dirty_overlap: item.dirty_overlap,
    })),
    replay_verification_path: replayVerification.path,
    replay_verification: replayVerification.summary,
    replay_digest_path: replayDigest.path,
    replay_digest: replayDigest.summary,
    replay_failure_ids: replayFailures.failed_check_ids,
    replay_failures: replayFailures.failed_checks,
    worktree_guard: backlogSummary.guardSummary,
    usage,
    usage_delta: usageDelta,
    resumed: !!session?.thread_id,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
