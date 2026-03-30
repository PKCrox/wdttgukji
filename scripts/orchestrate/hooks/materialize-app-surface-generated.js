#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const GENERATED_DIR = path.join(ROOT, 'scripts', 'orchestrate', 'generated');
const PUBLIC_DIR = path.join(ROOT, 'public');

async function readJsonOrDefault(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeFile(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf8');
}

function mapAxisQuestion(axis) {
  const questions = {
    'engine-slice': '첫 10분 플레이 감각이 어디서 무너지는가',
    'design-surface': '이번 턴에 화면 리듬을 더 밀어야 하나',
    'content-pipeline': '장수와 이벤트 자산을 어느 장면에 먼저 꽂을 것인가',
    autotest: '지금 보정해야 할 이상치와 밸런스 경고는 무엇인가',
    'theme-independence': '삼국지 밖으로도 남을 구조를 어디서 지키는가',
    'app-surface': '실제 장면 품질을 가장 빨리 끌어올릴 손잡이는 무엇인가',
  };
  return questions[axis] || `${axis} lane을 어디에 먼저 연결할 것인가`;
}

function mapLoopStep(axis) {
  const steps = {
    'engine-slice': {
      title: '세력 선택',
      body: '첫 세 턴 목표와 generated 브리프를 함께 보고 시작 압박을 읽는다.',
    },
    'design-surface': {
      title: '거점 선택',
      body: '도시를 찍으면 장면 리듬과 command scene이 현재 런타임 상태를 반영해 열린다.',
    },
    'content-pipeline': {
      title: '명령 확정',
      body: '명령 하나를 고르면 자산, 리스크, 다음 턴 흐름이 같은 화면에서 다시 정렬된다.',
    },
    autotest: {
      title: '검증 확인',
      body: '결정 직후 QA와 이상치 지표가 같은 루프 안에서 바로 피드백된다.',
    },
    'app-surface': {
      title: '장면 갱신',
      body: 'machine-managed generated 산출물이 시작 화면과 명령 장면 복사본을 즉시 갱신한다.',
    },
  };
  return steps[axis] || null;
}

function buildStartScreenContent(snapshot, runtimeState) {
  const boostAxes = runtimeState.persistentBoostAxes || [];
  const primaryFocusAxis = snapshot.primary_focus_axis
    || snapshot.agent_routing_state?.primaryFocusAxis
    || runtimeState.primaryFocusAxis
    || boostAxes[0]
    || 'engine-slice';
  const focusAlignment = snapshot.focus_alignment
    || runtimeState.focusAlignment
    || (snapshot.primary_focus_axis ? `boosted toward ${snapshot.primary_focus_axis}` : 'unknown');
  const routeSummary = snapshot.agent_routing_state?.routeSummary
    || runtimeState.routeSummary
    || 'route pending';
  const routeSource = snapshot.agent_routing_state?.routeSource
    || runtimeState.routeSource
    || 'n/a';
  const routeContextOrigin = snapshot.agent_routing_state?.routeContextOrigin
    || runtimeState.routeContextOrigin
    || 'derived';
  const routeConfidence = snapshot.agent_routing_state?.routeConfidence
    || runtimeState.routeConfidence
    || 'n/a';
  const routeConfidenceText = snapshot.agent_routing_state?.routeConfidenceText
    || runtimeState.routeConfidenceText
    || routeConfidence;
  const urgencySnapshot = snapshot.agent_routing_state?.urgencySnapshot
    || runtimeState.urgencySnapshot
    || 'n/a';
  const topUrgencyLane = snapshot.agent_routing_state?.topUrgencyLane
    || runtimeState.topUrgencyLane
    || 'n/a';
  const topUrgencyValue = snapshot.agent_routing_state?.topUrgencyValue
    ?? runtimeState.topUrgencyValue
    ?? 'n/a';
  const topUrgencyTie = snapshot.agent_routing_state?.topUrgencyTie
    || runtimeState.topUrgencyTie
    || [];
  const topUrgencyTieText = snapshot.agent_routing_state?.topUrgencyTieText
    || runtimeState.topUrgencyTieText
    || 'none';
  const topUrgencyTieCount = snapshot.agent_routing_state?.topUrgencyTieCount
    ?? runtimeState.topUrgencyTieCount
    ?? 0;
  const topAxes = boostAxes.length ? boostAxes.slice(0, 3) : ['engine-slice', 'design-surface', 'content-pipeline'];
  const focusSummary = topAxes
    .map((axis) => snapshot.axes?.[axis]?.summary)
    .filter(Boolean)
    .join(' / ');

  const loopAxes = boostAxes.length ? boostAxes.slice(0, 3) : topAxes;
  const loopSteps = loopAxes
    .map((axis) => mapLoopStep(axis))
    .filter(Boolean);

  return {
    primaryFocusAxis,
    focusAlignment,
    routeSummary,
    routeSource,
    routeContextOrigin,
    routeConfidence,
    routeConfidenceRaw: routeConfidence,
    routeConfidenceText,
    urgencySnapshot,
    topUrgencyLane,
    topUrgencyValue,
    topUrgencyTie,
    topUrgencyTieText,
    topUrgencyTieCount,
    questions: topAxes.map((axis) => mapAxisQuestion(axis)),
    focusTitle: '공장 산출물이 실제 장면으로 닿는 적벽 수직 슬라이스',
    focusCopy: focusSummary
      ? `현재 강조 축은 ${focusSummary} 입니다. game phase generated 산출물이 실제 화면 카피와 상태 패널에 반영됩니다.`
      : 'game phase generated 산출물이 실제 화면 카피와 상태 패널에 반영됩니다.',
    loopSteps: loopSteps.length ? loopSteps : [
      mapLoopStep('engine-slice'),
      mapLoopStep('design-surface'),
      mapLoopStep('content-pipeline'),
    ],
  };
}

function buildCommandSceneOverrides(snapshot, runtimeState) {
  const boostAxes = new Set(runtimeState.persistentBoostAxes || []);
  const engineSummary = snapshot.axes?.['engine-slice']?.summary || 'campaign loop baseline active';
  const designSummary = snapshot.axes?.['design-surface']?.summary || 'stage rhythm baseline active';
  const contentSummary = snapshot.axes?.['content-pipeline']?.summary || 'content baseline active';
  const autotestSummary = snapshot.axes?.autotest?.summary || 'autotest baseline active';

  return {
    government: {
      captionOwned: boostAxes.has('content-pipeline')
        ? `도시 성장과 장기 보너스를 설계하며, 현재 자산 상태(${contentSummary})를 함께 본다.`
        : undefined,
    },
    military: {
      captionOwned: boostAxes.has('engine-slice')
        ? `전선, 징병, 병력, 지형, 보급선을 한 화면에서 보고 즉시 군령을 내린다. 현재 기준: ${engineSummary}.`
        : undefined,
    },
    diplomacy: {
      placeholderCopy: boostAxes.has('autotest')
        ? `강화, 동맹, 위협, 첩보 중 하나를 고르면 성공률과 평판 변화에 더해 QA 기준(${autotestSummary})도 같이 정리된다.`
        : undefined,
    },
    personnel: {
      placeholderCopy: boostAxes.has('design-surface')
        ? `탐색, 포상, 이동, 임명 중 하나를 고르면 담당 장수와 화면 리듬 기준(${designSummary})이 함께 정리된다.`
        : undefined,
    },
  };
}

function resolveRouteContextOrigin(snapshot, runtimeState, factorySummary) {
  if (snapshot.agent_routing_state?.routeContextOrigin) return snapshot.agent_routing_state.routeContextOrigin;
  if (runtimeState.routeContextOrigin) return runtimeState.routeContextOrigin;
  if (factorySummary.routeContextOrigin) return factorySummary.routeContextOrigin;
  if (runtimeState.routeSource === 'agent-routing-state') return 'agent-routing-state';
  if (runtimeState.routeSource === 'factory-summary') return 'factory-summary';
  if (runtimeState.routeSummary || runtimeState.routeSource) return 'runtime-state';
  if (factorySummary.routeSource === 'agent-routing-state') return 'agent-routing-state';
  if (factorySummary.routeSummary || factorySummary.routeSource) return 'factory-summary';
  return 'derived';
}

function resolveRouteSource(snapshot, runtimeState, factorySummary) {
  return snapshot.agent_routing_state?.routeSource
    || runtimeState.routeSource
    || factorySummary.routeSource
    || null;
}

function resolveRouteConfidence(snapshot, runtimeState, factorySummary) {
  return snapshot.agent_routing_state?.routeConfidence
    || runtimeState.routeConfidence
    || factorySummary.routeConfidence
    || null;
}

function resolveRouteConfidenceText(snapshot, runtimeState, factorySummary) {
  return snapshot.agent_routing_state?.routeConfidenceText
    || runtimeState.routeConfidenceText
    || factorySummary.routeConfidenceText
    || resolveRouteConfidence(snapshot, runtimeState, factorySummary)
    || null;
}

function resolveUrgencySnapshot(snapshot, runtimeState, factorySummary) {
  return snapshot.agent_routing_state?.urgencySnapshot
    || runtimeState.urgencySnapshot
    || factorySummary.urgencySnapshot
    || null;
}

function resolveTopUrgency(snapshot, runtimeState, factorySummary) {
  return {
    lane: snapshot.agent_routing_state?.topUrgencyLane
      || runtimeState.topUrgencyLane
      || factorySummary.topUrgencyLane
      || null,
    value: snapshot.agent_routing_state?.topUrgencyValue
      ?? runtimeState.topUrgencyValue
      ?? factorySummary.topUrgencyValue
      ?? null,
    tie: snapshot.agent_routing_state?.topUrgencyTie
      || runtimeState.topUrgencyTie
      || factorySummary.topUrgencyTie
      || [],
    tieText: snapshot.agent_routing_state?.topUrgencyTieText
      || runtimeState.topUrgencyTieText
      || factorySummary.topUrgencyTieText
      || 'none',
    tieCount: snapshot.agent_routing_state?.topUrgencyTieCount
      ?? runtimeState.topUrgencyTieCount
      ?? factorySummary.topUrgencyTieCount
      ?? 0,
  };
}

function resolvePrimaryFocusAxis(snapshot, runtimeState, factorySummary) {
  return snapshot.primary_focus_axis
    || snapshot.agent_routing_state?.primaryFocusAxis
    || runtimeState.primaryFocusAxis
    || factorySummary.primaryFocusAxis
    || (runtimeState.persistentBoostAxes || [])[0]
    || 'engine-slice';
}

function resolveFocusAlignment(snapshot, runtimeState, factorySummary) {
  return snapshot.focus_alignment
    || runtimeState.focusAlignment
    || factorySummary.focusAlignment
    || (runtimeState.primaryFocusAxis || factorySummary.primaryFocusAxis
      ? `boosted toward ${resolvePrimaryFocusAxis(snapshot, runtimeState, factorySummary)}`
      : 'unknown');
}

function resolveRouteSummary(snapshot, runtimeState, factorySummary) {
  const routeContextOrigin = resolveRouteContextOrigin(snapshot, runtimeState, factorySummary);
  const routeSource = resolveRouteSource(snapshot, runtimeState, factorySummary) || 'n/a';
  const routeConfidenceText = resolveRouteConfidenceText(snapshot, runtimeState, factorySummary) || 'n/a';
  const topUrgency = resolveTopUrgency(snapshot, runtimeState, factorySummary);
  const baseRouteSummary = snapshot.agent_routing_state?.routeSummary
    || runtimeState.routeSummary
    || factorySummary.routeSummary
    || `top urgency lane: ${topUrgency.lane || 'n/a'} (${topUrgency.value ?? 'n/a'})${topUrgency.tieText !== 'none' ? ` · tie ${topUrgency.tieText}` : ''} · ${routeConfidenceText} · ${routeSource} · origin ${routeContextOrigin}`;
  return baseRouteSummary.includes('· origin ') ? baseRouteSummary : `${baseRouteSummary} · origin ${routeContextOrigin}`;
}

function buildWarRoomMeta(snapshot, runtimeState, factorySummary) {
  const topAxis = resolvePrimaryFocusAxis(snapshot, runtimeState, factorySummary);
  const focusAlignment = resolveFocusAlignment(snapshot, runtimeState, factorySummary);
  const routeSummary = resolveRouteSummary(snapshot, runtimeState, factorySummary);
  const routeContextOrigin = resolveRouteContextOrigin(snapshot, runtimeState, factorySummary);
  const routeConfidenceText = resolveRouteConfidenceText(snapshot, runtimeState, factorySummary);
  const topUrgency = resolveTopUrgency(snapshot, runtimeState, factorySummary);
  const urgencySnapshot = resolveUrgencySnapshot(snapshot, runtimeState, factorySummary);
  return {
    kickerSuffix: `generated ${topAxis}`,
    titlePrefix: '공장 브리프',
    objectiveSuffix: `${routeSummary} · 현재 우선 축은 ${topAxis} 이며, generated surface가 전장 브리프와 명령 장면에 반영됩니다.`,
    primaryFocusAxis: topAxis,
    focusAlignment,
    routeContextOrigin,
    routeSource: resolveRouteSource(snapshot, runtimeState, factorySummary),
    routeConfidence: resolveRouteConfidence(snapshot, runtimeState, factorySummary),
    routeConfidenceRaw: resolveRouteConfidence(snapshot, runtimeState, factorySummary),
    routeConfidenceText,
    routeSummary,
    urgencySnapshot,
    topUrgencyLane: topUrgency.lane,
    topUrgencyTie: topUrgency.tie,
    topUrgencyTieText: topUrgency.tieText,
    topUrgencyTieCount: topUrgency.tieCount,
    topUrgencyValue: topUrgency.value,
  };
}

function buildCommandStatusMeta(snapshot, runtimeState, factorySummary) {
  const emphasized = new Set(runtimeState.persistentBoostAxes || []);
  const suffix = emphasized.has('app-surface') ? 'generated' : 'runtime';
  const topAxis = resolvePrimaryFocusAxis(snapshot, runtimeState, factorySummary);
  const focusAlignment = resolveFocusAlignment(snapshot, runtimeState, factorySummary);
  const routeContextOrigin = resolveRouteContextOrigin(snapshot, runtimeState, factorySummary);
  const routeConfidenceText = resolveRouteConfidenceText(snapshot, runtimeState, factorySummary);
  const topUrgency = resolveTopUrgency(snapshot, runtimeState, factorySummary);
  const urgencySnapshot = resolveUrgencySnapshot(snapshot, runtimeState, factorySummary);
  return {
    government: {
      briefLabel: `시정 브리프 · ${suffix}`,
      decisionLabel: `시정 결정 · ${suffix}`,
    },
    military: {
      briefLabel: `군령 브리프 · ${suffix}`,
      decisionLabel: `군령 결정 · ${suffix}`,
    },
    diplomacy: {
      briefLabel: `외교 브리프 · ${suffix}`,
      decisionLabel: `외교 결정 · ${suffix}`,
    },
    personnel: {
      briefLabel: `인사 브리프 · ${suffix}`,
      decisionLabel: `인사 결정 · ${suffix}`,
    },
    primaryFocusAxis: topAxis,
    focusAlignment,
    routeContextOrigin,
    routeSource: resolveRouteSource(snapshot, runtimeState, factorySummary),
    routeConfidence: resolveRouteConfidence(snapshot, runtimeState, factorySummary),
    routeConfidenceRaw: resolveRouteConfidence(snapshot, runtimeState, factorySummary),
    routeConfidenceText,
    routeSummary: resolveRouteSummary(snapshot, runtimeState, factorySummary),
    urgencySnapshot,
    topUrgencyLane: topUrgency.lane,
    topUrgencyTie: topUrgency.tie,
    topUrgencyTieText: topUrgency.tieText,
    topUrgencyTieCount: topUrgency.tieCount,
    topUrgencyValue: topUrgency.value,
  };
}

function pruneUndefined(value) {
  if (Array.isArray(value)) return value.map(pruneUndefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, pruneUndefined(entry)])
  );
}

function buildFactoryStatusHtml(snapshot, runtimeState, factorySummary, summary) {
  const boostAxes = runtimeState.persistentBoostAxes || [];
  const primaryFocusAxis = resolvePrimaryFocusAxis(snapshot, runtimeState, factorySummary);
  const focusAlignment = resolveFocusAlignment(snapshot, runtimeState, factorySummary);
  const routeContextOrigin = resolveRouteContextOrigin(snapshot, runtimeState, factorySummary);
  const fallbackAxes = [
    snapshot.primary_focus_axis,
    snapshot.agent_routing_state?.topUrgencyLane,
    snapshot.source_axis,
  ].filter(Boolean);
  const priorityAxes = [
    snapshot.primary_focus_axis,
    snapshot.agent_routing_state?.topUrgencyLane,
    snapshot.source_axis,
  ].filter(Boolean);
  const axisLines = Object.entries(snapshot.axes || {})
    .sort(([leftAxis], [rightAxis]) => {
      const leftIndex = priorityAxes.indexOf(leftAxis);
      const rightIndex = priorityAxes.indexOf(rightAxis);
      if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex;
      if (leftIndex >= 0) return -1;
      if (rightIndex >= 0) return 1;
      return leftAxis.localeCompare(rightAxis);
    })
    .slice(0, 4)
    .map(([, axis]) => `<span>${axis.axis}: ${axis.summary}</span>`)
    .join('');
  const routeSummary = resolveRouteSummary(snapshot, runtimeState, factorySummary);
  const routeSource = resolveRouteSource(snapshot, runtimeState, factorySummary) || 'n/a';
  const routeConfidence = resolveRouteConfidenceText(snapshot, runtimeState, factorySummary) || 'n/a';
  const routeConfidenceRaw = resolveRouteConfidence(snapshot, runtimeState, factorySummary) || 'n/a';
  const topUrgency = resolveTopUrgency(snapshot, runtimeState, factorySummary);
  const urgencySnapshot = resolveUrgencySnapshot(snapshot, runtimeState, factorySummary) || 'n/a';

  return `<section class="factory-status-card">
  <span class="factory-status-kicker">Generated Surface</span>
  <strong>${summary}</strong>
  <p>run ${runtimeState.last_run_id || snapshot.run_id || 'unknown'} · contract v2 · ${routeSummary} · ${routeSource}</p>
  <p>focus axis: ${primaryFocusAxis}</p>
  <p>focus alignment: ${focusAlignment}</p>
  <p>route context origin: ${routeContextOrigin}</p>
  <div class="factory-status-list">
    <span>confidence: ${routeConfidence}</span>
    <span>confidence raw: ${routeConfidenceRaw}</span>
    <span>lane: ${topUrgency.lane || 'n/a'}</span>
    <span>tie: ${topUrgency.tieText}</span>
    <span>tie count: ${topUrgency.tieCount}</span>
    <span>urgency: ${topUrgency.value ?? 'n/a'}</span>
  </div>
  <p>urgency snapshot: ${urgencySnapshot}</p>
  <div class="factory-status-list">
    ${(boostAxes.length ? boostAxes : fallbackAxes.length ? fallbackAxes : ['engine-slice', 'design-surface', 'content-pipeline']).map((axis) => `<span>${axis}</span>`).join('')}
  </div>
  <div class="factory-status-list">
    ${axisLines}
  </div>
</section>
`;
}

function buildWarRoomStatusHtml(snapshot, runtimeState, factorySummary) {
  const boostAxes = runtimeState.persistentBoostAxes || [];
  const primaryFocusAxis = resolvePrimaryFocusAxis(snapshot, runtimeState, factorySummary);
  const focusAlignment = resolveFocusAlignment(snapshot, runtimeState, factorySummary);
  const routeContextOrigin = resolveRouteContextOrigin(snapshot, runtimeState, factorySummary);
  const routeSummary = resolveRouteSummary(snapshot, runtimeState, factorySummary);
  const routeConfidence = resolveRouteConfidenceText(snapshot, runtimeState, factorySummary) || 'n/a';
  const routeConfidenceRaw = resolveRouteConfidence(snapshot, runtimeState, factorySummary) || 'n/a';
  const routeSource = resolveRouteSource(snapshot, runtimeState, factorySummary) || 'n/a';
  const topUrgency = resolveTopUrgency(snapshot, runtimeState, factorySummary);
  const urgencySnapshot = resolveUrgencySnapshot(snapshot, runtimeState, factorySummary) || 'n/a';
  return `<div class="factory-status-list">
  <span>${routeSummary}</span>
  <span>${routeConfidence}</span>
  <span>raw: ${routeConfidenceRaw}</span>
  <span>${routeSource}</span>
  <span>focus axis: ${primaryFocusAxis}</span>
  <span>focus alignment: ${focusAlignment}</span>
  <span>origin: ${routeContextOrigin}</span>
  <span>lane: ${topUrgency.lane || 'n/a'}</span>
  <span>tie: ${topUrgency.tieText}</span>
  <span>tie count: ${topUrgency.tieCount}</span>
  <span>urgency: ${topUrgency.value ?? 'n/a'}</span>
  <span>snapshot: ${urgencySnapshot}</span>
  ${(boostAxes.length ? boostAxes.slice(0, 3) : ['engine-slice', 'design-surface', 'content-pipeline'])
    .map((axis) => `<span>${axis}</span>`).join('')}
</div>
`;
}

function buildCommandDigestHtml(snapshot, runtimeState, factorySummary) {
  const routeContextOrigin = resolveRouteContextOrigin(snapshot, runtimeState, factorySummary);
  const topAxis = resolvePrimaryFocusAxis(snapshot, runtimeState, factorySummary);
  const focusAlignment = resolveFocusAlignment(snapshot, runtimeState, factorySummary);
  const routeSummary = resolveRouteSummary(snapshot, runtimeState, factorySummary);
  const routeConfidence = resolveRouteConfidenceText(snapshot, runtimeState, factorySummary) || 'n/a';
  const routeConfidenceRaw = resolveRouteConfidence(snapshot, runtimeState, factorySummary) || 'n/a';
  const routeSource = resolveRouteSource(snapshot, runtimeState, factorySummary) || 'n/a';
  const topUrgency = resolveTopUrgency(snapshot, runtimeState, factorySummary);
  const urgencySnapshot = resolveUrgencySnapshot(snapshot, runtimeState, factorySummary) || 'n/a';
  return `<section class="factory-status-card">
  <span class="factory-status-kicker">Generated Command Digest</span>
  <strong>${topAxis} lane active</strong>
  <p>${routeSummary}</p>
  <p>focus axis: ${topAxis}</p>
  <p>focus alignment: ${focusAlignment}</p>
  <p>route context origin: ${routeContextOrigin}</p>
  <p>confidence: ${routeConfidence} · raw: ${routeConfidenceRaw} · source: ${routeSource} · lane: ${topUrgency.lane || 'n/a'} · tie: ${topUrgency.tieText} · tie count: ${topUrgency.tieCount} · urgency: ${topUrgency.value ?? 'n/a'} · 현재 app-surface lane은 generated 상태와 controlled patch를 함께 사용합니다.</p>
  <p>urgency snapshot: ${urgencySnapshot}</p>
</section>
`;
}

function buildCss(runtimeState) {
  const boostCount = (runtimeState.persistentBoostAxes || []).length;
  const glow = Math.min(0.24, 0.12 + (boostCount * 0.01));
  return `@layer generated {
  .factory-status-card {
    border: 1px solid rgba(216, 179, 106, ${Number((glow + 0.08).toFixed(2))});
    background:
      linear-gradient(140deg, rgba(216, 179, 106, ${Number(glow.toFixed(2))}), rgba(24, 25, 31, 0.92)),
      rgba(15, 16, 22, 0.92);
    border-radius: 18px;
    padding: 14px 16px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }

  .factory-status-card .factory-status-kicker {
    display: block;
    font-size: 0.7rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(216, 179, 106, 0.78);
    margin-bottom: 6px;
  }

  .factory-status-card strong {
    display: block;
    font-size: 0.98rem;
    color: #f7f0dc;
    margin-bottom: 8px;
  }

  .factory-status-card p {
    margin: 0;
    color: rgba(247, 240, 220, 0.76);
    line-height: 1.5;
  }

  .factory-status-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }

  .factory-status-list span {
    border-radius: 999px;
    padding: 5px 10px;
    background: rgba(255, 255, 255, 0.06);
    color: rgba(247, 240, 220, 0.78);
    font-size: 0.76rem;
  }
}
`;
}

async function main() {
  const snapshot = await readJsonOrDefault(path.join(GENERATED_DIR, 'snapshots', 'product-core-snapshot.json'), {});
  const runtimeState = await readJsonOrDefault(path.join(GENERATED_DIR, 'runtime-state.json'), {});
  const factorySummary = await readJsonOrDefault(path.join(GENERATED_DIR, 'factory-runtime-summary.json'), {});
  const primaryFocusAxis = resolvePrimaryFocusAxis(snapshot, runtimeState, factorySummary);
  const focusAlignment = resolveFocusAlignment(snapshot, runtimeState, factorySummary);
  const runtimeRouteSource = resolveRouteSource(snapshot, runtimeState, factorySummary);
  const routeContextOrigin = resolveRouteContextOrigin(snapshot, runtimeState, factorySummary);
  const runtimeRouteConfidence = resolveRouteConfidence(snapshot, runtimeState, factorySummary) || 'n/a';
  const runtimeRouteConfidenceText = resolveRouteConfidenceText(snapshot, runtimeState, factorySummary) || runtimeRouteConfidence;
  const runtimeRouteSummary = resolveRouteSummary(snapshot, runtimeState, factorySummary);
  const runtimeTopUrgency = resolveTopUrgency(snapshot, runtimeState, factorySummary);
  const runtimeUrgencySnapshot = resolveUrgencySnapshot(snapshot, runtimeState, factorySummary) || 'n/a';
  const summary = factorySummary.lastRunId
    ? `game phase generated surface active · ${runtimeRouteSummary || runtimeRouteSource || 'route pending'} · focus ${primaryFocusAxis} · ${focusAlignment} · origin ${routeContextOrigin} · ${runtimeRouteConfidenceText} · raw ${runtimeRouteConfidence} · lane ${runtimeTopUrgency.lane || 'n/a'} (${runtimeTopUrgency.value ?? 'n/a'}) · tie ${runtimeTopUrgency.tieText} · tie count ${runtimeTopUrgency.tieCount}`
    : 'generated surface awaiting first game-phase run';

  const startScreenContent = buildStartScreenContent(snapshot, runtimeState);
  const commandSceneOverrides = pruneUndefined(buildCommandSceneOverrides(snapshot, runtimeState));
  const warRoomMeta = buildWarRoomMeta(snapshot, runtimeState, factorySummary);
  const commandStatusMeta = buildCommandStatusMeta(snapshot, runtimeState, factorySummary);
  const jsOutput = `export const GENERATED_COMMAND_SCENE_OVERRIDES = ${JSON.stringify(commandSceneOverrides, null, 2)};

export const GENERATED_WAR_ROOM_META = ${JSON.stringify(warRoomMeta, null, 2)};

export const GENERATED_COMMAND_STATUS_META = ${JSON.stringify(commandStatusMeta, null, 2)};

export const GENERATED_START_SCREEN_CONTENT = ${JSON.stringify(startScreenContent, null, 2)};

export const GENERATED_FACTORY_STATUS_META = ${JSON.stringify({
    runId: factorySummary.lastRunId || runtimeState.last_run_id || snapshot.run_id || null,
    summary,
    primaryFocusAxis,
    focusAlignment,
    routeContextOrigin,
    routeSource: runtimeRouteSource,
    routeConfidence: resolveRouteConfidence(snapshot, runtimeState, factorySummary),
    routeConfidenceRaw: resolveRouteConfidence(snapshot, runtimeState, factorySummary),
    routeConfidenceText: runtimeRouteConfidenceText,
    routeSummary: runtimeRouteSummary,
    urgencySnapshot: runtimeUrgencySnapshot,
    topUrgencyLane: runtimeTopUrgency.lane,
    topUrgencyTie: runtimeTopUrgency.tie,
    topUrgencyTieText: runtimeTopUrgency.tieText,
    topUrgencyTieCount: runtimeTopUrgency.tieCount,
    topUrgencyValue: runtimeTopUrgency.value,
  }, null, 2)};
`;

  const cssOutput = buildCss(runtimeState);
  const htmlOutput = buildFactoryStatusHtml(snapshot, runtimeState, factorySummary, summary);
  const warRoomHtmlOutput = buildWarRoomStatusHtml(snapshot, runtimeState, factorySummary);
  const commandHtmlOutput = buildCommandDigestHtml(snapshot, runtimeState, factorySummary);

  const jsPath = path.join(PUBLIC_DIR, 'js', 'generated', 'app-surface-meta.js');
  const cssPath = path.join(PUBLIC_DIR, 'css', 'generated', 'app-surface.css');
  const htmlPath = path.join(PUBLIC_DIR, 'fragments', 'generated', 'factory-status.html');
  const warRoomPath = path.join(PUBLIC_DIR, 'fragments', 'generated', 'war-room-status.html');
  const commandPath = path.join(PUBLIC_DIR, 'fragments', 'generated', 'command-scene-digest.html');

  await writeFile(jsPath, `${jsOutput}\n`);
  await writeFile(cssPath, cssOutput);
  await writeFile(htmlPath, htmlOutput);
  await writeFile(warRoomPath, warRoomHtmlOutput);
  await writeFile(commandPath, commandHtmlOutput);

  console.log(JSON.stringify({
    status: 'materialized',
    js: jsPath,
    css: cssPath,
    fragment: htmlPath,
    war_room_fragment: warRoomPath,
    command_fragment: commandPath,
    runId: factorySummary.lastRunId || runtimeState.last_run_id || snapshot.run_id || null,
    primaryFocusAxis,
    focusAlignment,
    routeContextOrigin,
    routeSource: runtimeRouteSource,
    routeConfidence: resolveRouteConfidence(snapshot, runtimeState, factorySummary),
    routeConfidenceRaw: resolveRouteConfidence(snapshot, runtimeState, factorySummary),
    routeConfidenceText: runtimeRouteConfidenceText,
    routeSummary: runtimeRouteSummary,
    urgencySnapshot: runtimeUrgencySnapshot,
    topUrgencyLane: runtimeTopUrgency.lane,
    topUrgencyTie: runtimeTopUrgency.tie,
    topUrgencyTieText: runtimeTopUrgency.tieText,
    topUrgencyTieCount: runtimeTopUrgency.tieCount,
    topUrgencyValue: runtimeTopUrgency.value,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
