// app.js — 우당탕탕삼국지 진입점

import { GameState } from '../../engine/core/game-state.js';
import { loadScenario, loadEvents, filterEventsForScenario } from '../../engine/data/loader.js';
import { executeTurnEvents, processPlayerChoice, endTurn, buildTurnSummary } from '../../engine/core/turn-loop.js';
import { decideAndExecute } from '../../engine/ai/faction-ai.js';
import { MAP_FACTION_PALETTE, MapRenderer, measureMapViewport, resolveMapLayout } from './map-renderer.js';
import { EventUI } from './event-ui.js';
import { Sidebar, getCharName, FACTION_COLORS, showCharacterModal } from './sidebar.js';
import { ActionPanel, executePlayerAction } from './action-panel.js';
import { TurnResolution, getLogIcon } from './turn-resolution.js';
import {
  COMMAND_SCENES,
  getFactionDoctrine,
  getFactionSealLabel,
  getFactionSurfaceTheme,
  getGeneratedStartScreenContent,
} from './presentation-meta.js';
import {
  buildBattlefieldDirectorPacket,
  buildCommandDirectorPacket,
  buildFactionDirectorPacket,
  registerTurnDirectorProvider,
} from './turn-director.js';
import {
  SAVE_KEY,
  SAVE_META_KEY,
  FACTION_META,
  OPENING_OBJECTIVES,
  FACTION_LEADERS,
  FACTION_DIALOGUES,
  OPENING_ACT,
  buildSaveMeta,
  getFactionSnapshot,
  getNarrativeModeLabel,
  getOpeningActBeat,
} from './campaign-config.js';

// --- 글로벌 상태 ---
let state = null;
let scenario = null;
let allEvents = [];
let map = null;
let eventUI = null;
let sidebar = null;
let actionPanel = null;
let selectedNarrativeMode = 'both'; // 'history' | 'romance' | 'both'
let processing = false;
let logVisible = false;
let turnResolution = null;
let selectedFaction = null;
let startScreenSpotlightFactionId = null;
const SCREEN_IDS = ['start-screen', 'faction-screen', 'intro-screen', 'game-screen'];
const START_SCREEN_FACTION_ORDER = ['wei', 'shu', 'wu', 'liu_zhang', 'zhang_lu'];
const FACTION_UI_COLORS = {
  wei: '#4A90D9',
  shu: '#2ECC71',
  wu: '#E74C3C',
  liu_zhang: '#F39C12',
  zhang_lu: '#9B59B6',
};
const NARRATIVE_MODE_OPTIONS = [
  { id: 'both', label: '혼합', desc: '정사+연의 모두' },
  { id: 'history', label: '정사', desc: '역사 기록 기반' },
  { id: 'romance', label: '연의', desc: '소설적 드라마' },
];
const PLAYER_SURFACE_RUNTIME = {
  preserveAuthoredStartFrame: true,
};
const uiState = {
  openingCityId: null,
  commandSpotlightShown: false,
  turnSpotlightTimer: null,
  turnBridgeTimer: null,
  turnStartTimer: null,
  actionResultTimer: null,
  fieldReactionTimer: null,
  transitionTimer: null,
  openingActActive: false,
  mapOverlayMode: 'default',
  frontlinePreviewCityId: null,
};
let viewportLayoutRaf = 0;
let scenarioLoadPromise = null;
let eventLoadPromise = null;
const COMMAND_SCENE_ORDER = ['government', 'military', 'diplomacy', 'personnel'];
const COMMAND_SCENE_HINTS = {
  government: ['government', '시정', '내정', '행정'],
  military: ['military', '군사', '전투', '전장', '군령'],
  diplomacy: ['diplomacy', '외교', '교섭', '동맹', '강화'],
  personnel: ['personnel', '인사', '장수', '등용', '배치'],
};

function joinCopyParts(...parts) {
  return parts
    .map((part) => `${part || ''}`.trim())
    .filter(Boolean)
    .join(' ');
}

function getViewportLayoutMetrics() {
  const width = window.innerWidth || document.documentElement.clientWidth || 1512;
  const height = window.innerHeight || document.documentElement.clientHeight || 982;
  const desktop = width >= 1181;
  const shortDesktop = desktop && height <= 1030;
  const compactDesktop = desktop && (width < 1360 || height < 930);
  const wideDesktop = desktop && width >= 1900;
  const desktopPadding = desktop ? (shortDesktop ? 2 : 14) : 6;
  const frameWidthGap = desktop ? (shortDesktop ? 24 : 40) : 12;
  const frameHeightGap = desktop ? (shortDesktop ? 112 : 44) : 12;
  const frameCap = wideDesktop ? 1560 : compactDesktop ? 1420 : 1496;
  const frameWidth = desktop
    ? Math.max(1120, Math.min(width - frameWidthGap, ((height - frameHeightGap) * 16) / 9, frameCap))
    : Math.max(320, Math.min(width - frameWidthGap, ((height - frameHeightGap) * 16) / 9));
  const frameHeight = desktop ? Math.max(680, height - frameHeightGap) : Math.max(560, height - frameHeightGap);

  return {
    width,
    height,
    desktop,
    shortDesktop,
    compactDesktop,
    frameWidth,
    frameHeight,
    startCols: compactDesktop ? 'minmax(0,1fr) 300px' : 'minmax(0,1.24fr) 320px',
    factionCols: compactDesktop ? '200px minmax(0,1fr) 300px' : '214px minmax(0,1fr) 320px',
    introCols: compactDesktop ? '220px minmax(0,1fr)' : '244px minmax(0,1fr)',
    battlefieldCols: compactDesktop ? '164px minmax(0,1fr) 248px' : '176px minmax(0,1fr) 276px',
    battlefieldCollapsedCols: compactDesktop ? '0 minmax(0,1fr) 248px' : '0 minmax(0,1fr) 276px',
    actionBoardCols: compactDesktop ? 'minmax(0,1fr) 300px' : 'minmax(0,1fr) 320px',
    actionBodyCols: compactDesktop ? '208px minmax(0,1fr)' : '220px minmax(0,1fr)',
    screenPadding: desktopPadding,
  };
}

function applyViewportLayoutLock() {
  const root = document.documentElement;
  const metrics = getViewportLayoutMetrics();
  root.dataset.viewportTier = metrics.desktop ? 'desktop' : 'compact';
  root.dataset.viewportHeightTier = metrics.shortDesktop ? 'short' : 'regular';
  root.style.setProperty('--runtime-stage-width', `${Math.round(metrics.frameWidth)}px`);
  root.style.setProperty('--runtime-stage-height', `${Math.round(metrics.frameHeight)}px`);
  root.style.setProperty('--runtime-start-cols', metrics.startCols);
  root.style.setProperty('--runtime-faction-cols', metrics.factionCols);
  root.style.setProperty('--runtime-intro-cols', metrics.introCols);
  root.style.setProperty('--runtime-battlefield-cols', metrics.battlefieldCols);
  root.style.setProperty('--runtime-battlefield-collapsed-cols', metrics.battlefieldCollapsedCols);
  root.style.setProperty('--runtime-action-board-cols', metrics.actionBoardCols);
  root.style.setProperty('--runtime-action-body-cols', metrics.actionBodyCols);
  root.style.setProperty('--runtime-screen-padding', `${metrics.screenPadding}px`);
}

function scheduleViewportLayoutLock() {
  if (viewportLayoutRaf) cancelAnimationFrame(viewportLayoutRaf);
  viewportLayoutRaf = requestAnimationFrame(() => {
    applyViewportLayoutLock();
    viewportLayoutRaf = 0;
  });
}

function getVisibleScreenId() {
  return SCREEN_IDS.find((screenId) => {
    const screen = document.getElementById(screenId);
    return screen && !screen.classList.contains('hidden');
  }) || null;
}

function getSurfaceTheme(factionId = state?.player?.factionId || selectedFaction || startScreenSpotlightFactionId || null) {
  return getFactionSurfaceTheme(factionId);
}

function applyFactionSurfaceTheme(factionId = state?.player?.factionId || selectedFaction || startScreenSpotlightFactionId || null) {
  const theme = getSurfaceTheme(factionId);
  const root = document.documentElement;
  root.dataset.playerFaction = theme.id;
  root.style.setProperty('--surface-faction-accent-rgb', theme.accentRgb);
  root.style.setProperty('--surface-faction-glow-rgb', theme.glowRgb);
  root.style.setProperty('--surface-faction-deep-rgb', theme.deepRgb);
  [
    'start-screen',
    'faction-screen',
    'intro-screen',
    'game-screen',
    'command-modal',
    'turn-cinematic',
    'turn-bridge-card',
    'turn-start-card',
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.dataset.playerFaction = theme.id;
  });
  return theme;
}

function renderMapActionButtonLabel(label, hotkey) {
  return `<span class="map-selection-action-label">${label}</span><kbd>${hotkey}</kbd>`;
}

function renderOverlayToggleLabel(label, hotkey) {
  return `<span>${label}</span><kbd>${hotkey}</kbd>`;
}

function renderMapControlHint(parts) {
  return parts.map((part) => {
    if (part.type === 'key') return `<kbd>${part.value}</kbd>`;
    return `<span>${part.value}</span>`;
  }).join('<span class="map-selection-control-sep">/</span>');
}

async function ensureScenarioLoaded() {
  if (scenario) return scenario;
  if (!scenarioLoadPromise) {
    scenarioLoadPromise = loadScenario('/engine/data/scenarios/208-red-cliffs.json')
      .then((loadedScenario) => {
        scenario = loadedScenario;
        applyScenarioMapArt(loadedScenario);
        renderStartScreenSurface(loadedScenario);
        return loadedScenario;
      })
      .catch((err) => {
        scenarioLoadPromise = null;
        throw err;
      });
  }
  return scenarioLoadPromise;
}

async function ensureEventsLoaded() {
  if (allEvents.length) return allEvents;
  if (!eventLoadPromise) {
    eventLoadPromise = loadEvents('/data/events/all-events.json')
      .then((rawEvents) => {
        allEvents = filterEventsForScenario(rawEvents, 208, 225);
        return allEvents;
      })
      .catch((err) => {
        eventLoadPromise = null;
        throw err;
      });
  }
  return eventLoadPromise;
}

function truncateLine(text = '', max = 72) {
  const compact = `${text}`.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function normalizeCommandSceneId(sceneHint = '') {
  const hint = `${sceneHint || ''}`.trim().toLowerCase();
  if (!hint) return null;
  return Object.entries(COMMAND_SCENE_HINTS).find(([, aliases]) => aliases.some((alias) => hint.includes(alias.toLowerCase())))?.[0] || null;
}

function getCommandScenesForCity(cityId) {
  const city = state?.cities?.[cityId];
  if (!city) return [];
  return city.owner === state.player.factionId
    ? [...COMMAND_SCENE_ORDER]
    : COMMAND_SCENE_ORDER.filter((sceneId) => sceneId !== 'government' && sceneId !== 'personnel');
}

function resolveRecommendedCommandSceneId(cityId, director = null) {
  const scenes = getCommandScenesForCity(cityId);
  if (!scenes.length) return null;
  const directScene = normalizeCommandSceneId(director?.scene);
  if (directScene && scenes.includes(directScene)) return directScene;
  const selectionScene = normalizeCommandSceneId(getCitySelectionProfile(cityId)?.scene);
  if (selectionScene && scenes.includes(selectionScene)) return selectionScene;
  return scenes[0];
}

function buildSelectionMapReadout(cityId, selection = null) {
  if (!cityId || !state?.cities?.[cityId]) return '판독 정보 없음';
  const tacticalStrip = selection?.tacticalStrip || buildSelectionTacticalStrip(cityId);
  if (!tacticalStrip.length) return '지도에서 전선과 성방을 함께 읽으십시오.';
  const terrain = tacticalStrip.find((item) => item.label === '지형')?.value;
  const frontline = tacticalStrip.find((item) => item.label === '전선')?.value;
  const defense = tacticalStrip.find((item) => item.label === '성방')?.value;
  return [terrain, frontline, defense ? `성방 ${defense}` : null].filter(Boolean).join(' · ');
}

function getCommandSceneTeaser(cityId, sceneId) {
  if (!cityId || !sceneId || !state?.cities?.[cityId]) return COMMAND_SCENES[sceneId]?.placeholderCopy || '';
  const director = buildCommandDirectorPacket({
    cityId,
    sceneId,
    state,
    connections: scenario?.connections || [],
  });
  const actionLine = director?.status?.find?.(([label]) => label === '권고')?.[1];
  return truncateLine(actionLine || director?.subhead || COMMAND_SCENES[sceneId]?.placeholderCopy || '', 54);
}

function renderBattlefieldSessionSpine(steps = [], { layout = 'stack', density = 'regular' } = {}) {
  if (!steps.length) return '';
  const stripCount = Math.max(1, steps.length);
  return `
    <div class="battlefield-session-spine" data-layout="${layout}" data-density="${density}" style="--battlefield-session-strip-count:${stripCount}">
      ${steps.map((step, index) => `
        <article class="battlefield-session-step is-${step.status || 'pending'}">
          <span class="battlefield-session-step-index">${index + 1}</span>
          <div class="battlefield-session-step-copy">
            <span class="battlefield-session-step-label">${step.label}</span>
            <strong>${truncateLine(step.title || step.value || '', density === 'compact' ? 38 : 48)}</strong>
            <small>${truncateLine(step.detail || '', density === 'compact' ? 74 : 96)}</small>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function renderCitySessionTacticalStrip(items = []) {
  if (!items.length) return '';
  return `
    <div class="city-session-tactical-strip">
      ${items.map((item) => `
        <span class="city-session-tactical-chip tone-${item.tone || 'steady'}">
          <em>${item.label}</em>
          <strong>${item.value}</strong>
        </span>
      `).join('')}
    </div>
  `;
}

function renderCitySessionStatusBar({
  label = '전장 판단',
  badge = '',
  detail = '',
} = {}) {
  return `
    <div class="city-session-status-bar">
      <div class="city-session-status-copy">
        <span class="city-session-status-label">${label}</span>
        <strong>${truncateLine(detail || badge || '', 74)}</strong>
      </div>
      ${badge ? `<span class="city-session-status-badge">${truncateLine(badge, 28)}</span>` : ''}
    </div>
  `;
}

function buildBattlefieldStrikeCards(frame) {
  const selected = frame.state === 'selection';
  const director = frame.director || buildBattlefieldDirectorPacket({ state, scenario, cityId: frame.cityId || null });
  const sceneName = frame.recommendedSceneMeta?.name || frame.sceneLabel || director?.scene || '명령';
  const actionsRemaining = state?.actionsRemaining ?? 0;
  const maxActions = state?.maxActions || 3;
  const routeLine = selected
    ? `${frame.title} -> ${sceneName} -> 턴 확정`
    : `${director?.focus || frame.focusLead || '접경 허브'} -> 거점 선택 -> ${sceneName}`;

  return [
    {
      label: selected ? '지금 목표' : '첫 목표',
      value: director?.objective || frame.noteLine || frame.actionLine || frame.sessionDetail || '작전 목표 정리 중',
      tone: 'primary',
    },
    {
      label: '리스크',
      value: director?.risk || frame.reasonLine || '판독 리스크 정리 중',
      tone: 'risk',
    },
    {
      label: '행동 창',
      value: selected
        ? `${sceneName} · ${actionsRemaining}/${maxActions} 행동`
        : `${frame.frontlineCities?.length || 0} 접경 후보 · ${actionsRemaining}/${maxActions} 행동`,
      tone: 'window',
    },
    {
      label: '확정선',
      value: routeLine,
      tone: 'route',
    },
  ];
}

function renderBattlefieldStrikeStrip(frame, { context = 'war-room' } = {}) {
  const cards = buildBattlefieldStrikeCards(frame);
  return `
    <div class="battlefield-strike-strip" data-context="${context}" data-state="${frame.state}" data-tone="${frame.tone || 'overview'}">
      ${cards.map((card) => `
        <article class="battlefield-strike-card tone-${card.tone}">
          <span class="battlefield-strike-label">${card.label}</span>
          <strong>${truncateLine(card.value, context === 'selection' ? 64 : 72)}</strong>
        </article>
      `).join('')}
    </div>
  `;
}

function renderWarRoomSessionBudget(frame) {
  const theme = getSurfaceTheme();
  const actionsRemaining = state?.actionsRemaining ?? 0;
  const maxActions = state?.maxActions || 3;
  const exhausted = actionsRemaining <= 0;
  const stateLabel = exhausted
    ? '턴 종료 가능'
    : frame?.state === 'selection'
      ? '거점 확정'
      : '거점 선택 대기';
  const title = exhausted
    ? `행동 ${actionsRemaining}/${maxActions} · 턴 종료 가능`
    : frame?.state === 'selection'
      ? `행동 ${actionsRemaining}/${maxActions} · ${truncateLine(frame.title || '선택 도시', 18)}`
      : `행동 ${actionsRemaining}/${maxActions} · 첫 거점 대기`;
  const note = exhausted
    ? '남은 행동이 없어 턴 종료를 눌러 다음 달로 넘어갈 수 있습니다.'
    : frame?.state === 'selection'
      ? `${frame.sceneLabel || '명령'} 장면이 같은 세션 축으로 이어집니다.`
      : '도시를 고르면 선택 도시, 지도 판독, 다음 행동이 함께 잠깁니다.';

  return `
    <div class="war-room-session-budget-card" data-state="${exhausted ? 'end' : frame?.state === 'selection' ? 'selection' : 'overview'}">
      <span class="war-room-session-budget-label">${exhausted ? stateLabel : frame?.state === 'selection' ? theme.cityLockedKicker : theme.warRoomKicker}</span>
      <strong>${title}</strong>
      <small>${note}</small>
    </div>
  `;
}

function buildBattlefieldSessionFocusItems(frame) {
  if (frame.tacticalStrip?.length) return frame.tacticalStrip.slice(0, 3);

  const items = [];
  if (frame.frontlineCities?.length) {
    items.push({
      label: '접경',
      value: `${frame.frontlineCities.length} 후보`,
      tone: 'front',
    });
  }
  if (frame.sceneLabel) {
    items.push({
      label: '장면',
      value: frame.sceneLabel,
      tone: 'rear',
    });
  }
  items.push({
    label: '행동력',
    value: `${state?.actionsRemaining ?? 0}/${state?.maxActions || 3} 남음`,
    tone: 'fortified',
  });
  return items;
}

function buildBattlefieldSessionStatusDetail(frame) {
  const actionBudget = `${state?.actionsRemaining ?? 0}/${state?.maxActions || 3} 행동`;
  if (frame.state === 'selection') {
    return `${actionBudget} · ${frame.overlayActive ? '전선 시야' : '기본 시야'}`;
  }
  return `${frame.frontlineCities?.length || 0} 접경 후보 · ${actionBudget}`;
}

function renderBattlefieldSessionBand(frame, { context = 'dock' } = {}) {
  const selected = frame.state === 'selection';
  const compact = context === 'dock';
  const focusLine = truncateLine(frame.selection?.ownerLine || frame.ownerLine || '', compact ? 62 : 76);
  const focusNote = truncateLine(
    selected
      ? frame.noteLine || frame.actionLine || focusLine
      : frame.noteLine || '전장 첫 세션을 시작할 접경 허브를 고르십시오.',
    compact ? 88 : 112
  );
  const readoutDetail = truncateLine(frame.reasonLine || frame.noteLine || focusLine, compact ? 92 : 104);
  const actionTitle = truncateLine(
    selected
      ? frame.recommendedSceneMeta?.name || frame.sceneLabel || '명령'
      : frame.sessionBadge || frame.sceneLabel || '거점 선택',
    compact ? 30 : 34
  );
  const actionDetail = truncateLine(
    selected
      ? frame.actionLine || getCommandSceneTeaser(frame.cityId, frame.recommendedSceneId)
      : frame.sessionDetail || frame.actionLine || '접경 허브를 눌러 다음 행동을 고정합니다.',
    compact ? 90 : 108
  );
  const cityStrip = selected
    ? renderCitySessionTacticalStrip((frame.tacticalStrip || []).slice(0, compact ? 2 : 3))
    : renderCitySessionTacticalStrip(buildBattlefieldSessionFocusItems(frame).slice(0, compact ? 2 : 3));
  const actionNote = selected
    ? frame.recommendedSceneId
      ? `${frame.recommendedSceneMeta?.name || frame.sceneLabel || '권장 장면'}에서 다음 행동을 엽니다.`
      : '명령 장면을 열어 다음 행동을 고정합니다.'
    : '거점을 고르면 선택 도시, 지도 판독, 다음 행동이 한 번에 잠깁니다.';

  return `
    <div class="battlefield-session-band" data-context="${context}" data-state="${frame.state}" data-tone="${frame.tone || 'overview'}">
      <article class="battlefield-session-band-card" data-slot="city">
        <span class="battlefield-session-band-label">${selected ? '선택 도시' : '세션 시작'}</span>
        <strong>${truncateLine(frame.title || '', compact ? 30 : 34)}</strong>
        <small>${focusLine}</small>
        <p class="battlefield-session-band-note">${focusNote}</p>
        ${cityStrip}
      </article>
      <article class="battlefield-session-band-card" data-slot="map">
        <span class="battlefield-session-band-label">지도 판독</span>
        <strong>${truncateLine(frame.readoutLine || '', compact ? 44 : 54)}</strong>
        <small>${readoutDetail}</small>
        <div class="battlefield-session-inline-note battlefield-session-inline-note-subtle">${frame.overlayActive ? '전선 시야 중' : '기본 시야'}</div>
      </article>
      <article class="battlefield-session-band-card battlefield-session-band-card-primary" data-slot="action">
        <span class="battlefield-session-band-label">다음 행동</span>
        <strong>${actionTitle}</strong>
        <small>${actionDetail}</small>
        <p class="battlefield-session-band-note">${truncateLine(actionNote, compact ? 84 : 102)}</p>
      </article>
    </div>
  `;
}

function buildBattlefieldDecisionRoute(frame) {
  const selected = frame.state === 'selection';
  const actionBudget = `${state?.actionsRemaining ?? 0}/${state?.maxActions || 3} 행동`;
  return [
    {
      label: '거점',
      value: selected ? frame.title : '접경 허브',
      state: selected ? 'active' : 'pending',
    },
    {
      label: '판독',
      value: selected ? frame.readoutLine || '판독 대기' : frame.overlayActive ? '전선 시야' : '거점 판독',
      state: selected ? 'active' : 'ready',
    },
    {
      label: '장면',
      value: selected ? frame.recommendedSceneMeta?.name || frame.sceneLabel || '명령' : '거점 선택',
      state: selected ? 'ready' : 'pending',
    },
    {
      label: '실행',
      value: selected ? actionBudget : '대기',
      state: selected ? 'armed' : 'pending',
    },
  ];
}

function renderBattlefieldDecisionDeck(frame, { context = 'dock' } = {}) {
  const selected = frame.state === 'selection';
  const compact = context === 'rail' || context === 'bridge';
  const route = buildBattlefieldDecisionRoute(frame);
  const headTitle = selected
    ? `${frame.title} · ${frame.recommendedSceneMeta?.name || frame.sceneLabel || '명령'}`
    : '첫 전장 결정을 고릅니다';
  const headCopy = selected
    ? truncateLine(
      getCommandSceneTeaser(frame.cityId, frame.recommendedSceneId)
        || frame.actionLine
        || frame.noteLine
        || '',
      compact ? 96 : 118
    )
    : truncateLine(
      frame.noteLine
        || frame.sessionDetail
        || '전선 시야 또는 접경 후보를 눌러 선택 도시와 다음 행동을 함께 잠그십시오.',
      compact ? 96 : 118
    );
  const deckNote = selected
    ? frame.recommendedSceneId
      ? `${frame.recommendedSceneMeta?.name || frame.sceneLabel || '권장 장면'}으로 들어가면 결정 패널이 같은 축을 이어받습니다.`
      : '명령 장면을 열어 같은 결정 축을 이어갑니다.'
    : frame.overlayActive
      ? '전선 시야가 켜져 있어 접경 허브 후보를 곧바로 눌러 세션을 열 수 있습니다.'
      : '전선 시야를 켜면 접경 허브 후보와 지원로가 더 선명하게 드러납니다.';
  const primarySceneId = frame.recommendedSceneId || frame.visibleScenes?.[0] || null;
  const metaChips = [
    `${state?.actionsRemaining ?? 0}/${state?.maxActions || 3} 행동`,
    frame.overlayActive ? '전선 시야' : '기본 시야',
    selected
      ? frame.sceneLabel || '선택 유지'
      : `${frame.frontlineCities?.length || 0} 접경 후보`,
  ];

  return `
    <aside class="battlefield-decision-deck" data-context="${context}" data-state="${frame.state}" data-tone="${frame.tone || 'overview'}">
      <div class="battlefield-decision-deck-head">
        <div class="battlefield-decision-deck-copy">
          <span class="battlefield-decision-deck-kicker">${selected ? '다음 행동' : '선택 흐름'}</span>
          <strong>${truncateLine(headTitle, compact ? 44 : 56)}</strong>
          <small>${headCopy}</small>
        </div>
        <span class="battlefield-decision-deck-state">${selected ? '즉시 진행' : '선택 대기'}</span>
      </div>
      <div class="battlefield-decision-route">
        ${route.map((entry) => `
          <article class="battlefield-decision-route-step is-${entry.state}">
            <em>${entry.label}</em>
            <strong>${truncateLine(entry.value, compact ? 24 : 30)}</strong>
          </article>
        `).join('')}
      </div>
      <div class="battlefield-decision-focus">
        <span class="battlefield-decision-focus-label">${selected ? '지금 고정된 축' : '세션 시작 규칙'}</span>
        <strong>${truncateLine(selected ? `${frame.title} · ${frame.readoutLine || frame.sceneLabel || '명령'}` : frame.sessionBadge || frame.title || '전장 허브', compact ? 46 : 60)}</strong>
        <p>${truncateLine(deckNote, compact ? 108 : 144)}</p>
      </div>
      ${renderBattlefieldStrikeStrip(frame, { context })}
      ${selected && primarySceneId ? `
        <button
          type="button"
          class="city-session-action-button city-session-action-button-primary battlefield-decision-open"
          data-command-scene="${primarySceneId}"
          data-tone="${frame.tone}"
        >
          <span class="city-session-action-label">권장 장면</span>
          <strong>${frame.recommendedSceneMeta?.name || frame.sceneLabel || '명령'} 바로 열기</strong>
          <small>${truncateLine(getCommandSceneTeaser(frame.cityId, primarySceneId) || frame.actionLine || frame.noteLine || '', compact ? 88 : 116)}</small>
        </button>
      ` : ''}
      <div class="battlefield-decision-meta">
        ${metaChips.map((entry) => `<span class="battlefield-decision-meta-chip">${truncateLine(entry, compact ? 28 : 34)}</span>`).join('')}
      </div>
    </aside>
  `;
}

function renderBattlefieldSessionDockSurface(frame) {
  return `
    <section class="battlefield-session-dock-shell" data-state="${frame.state}" data-tone="${frame.tone || 'overview'}">
      ${renderCitySessionStatusBar({
        label: '전장 결정',
        badge: frame.sessionBadge || (frame.state === 'selection' ? '선택 도시' : '거점 선택'),
        detail: buildBattlefieldSessionStatusDetail(frame),
      })}
      <div class="battlefield-session-dock-grid" data-state="${frame.state}">
        <div class="battlefield-session-dock-main">
          ${renderBattlefieldSessionBand(frame, { context: 'dock' })}
          ${renderBattlefieldSessionSupportLane(frame, { context: 'dock' })}
        </div>
        ${renderBattlefieldDecisionDeck(frame, { context: 'dock' })}
      </div>
    </section>
  `;
}

function renderBattlefieldSessionPivot(frame, {
  context = 'rail',
  includePrimaryAction = false,
} = {}) {
  const focusLine = truncateLine(frame.selection?.ownerLine || frame.ownerLine || '', context === 'dock' ? 68 : 84);
  const focusNote = truncateLine(frame.noteLine || frame.actionLine || focusLine, context === 'dock' ? 118 : 144);
  const readoutDetail = truncateLine(frame.reasonLine || frame.noteLine || focusLine, context === 'dock' ? 84 : 104);
  const sceneTitle = truncateLine(frame.sceneLabel || frame.sessionBadge || '거점 선택', 34);
  const sceneTeaser = frame.recommendedSceneId
    ? getCommandSceneTeaser(frame.cityId, frame.recommendedSceneId)
    : '';
  const actionDetail = truncateLine(frame.actionLine || sceneTeaser || frame.sessionDetail || '', context === 'dock' ? 84 : 104);
  const recommendedTitle = truncateLine(frame.recommendedSceneMeta?.name || sceneTitle, 34);
  const focusLabel = frame.state === 'selection' ? '선택 도시' : '세션 시작';
  const readoutMode = frame.overlayActive ? '전선 시야 중' : '기본 시야';
  const actionMeta = frame.state === 'selection'
    ? `권장 장면 · ${recommendedTitle}`
    : '첫 거점을 고르면 장면이 이어집니다.';
  const actionSupport = !includePrimaryAction && sceneTeaser
    ? `<div class="battlefield-session-inline-note">${truncateLine(sceneTeaser, 72)}</div>`
    : '';

  return `
    <div class="battlefield-session-pivot" data-context="${context}" data-state="${frame.state}" data-tone="${frame.tone || 'overview'}">
      <article class="battlefield-session-focus-card" data-slot="city">
        <div class="battlefield-session-focus-head">
          <div class="battlefield-session-focus-seal" style="--session-seal-color:${frame.sealColor || '#f0dfb9'}">${frame.sealGlyph || '戰'}</div>
          <div class="battlefield-session-focus-copy">
            <span class="battlefield-session-focus-kicker">${focusLabel}</span>
            <strong>${truncateLine(frame.title || '', context === 'dock' ? 28 : 34)}</strong>
            <span class="battlefield-session-focus-subline">${focusLine}</span>
          </div>
        </div>
        <p class="battlefield-session-focus-note">${focusNote}</p>
        ${renderCitySessionTacticalStrip(buildBattlefieldSessionFocusItems(frame))}
      </article>
      <article class="battlefield-session-pivot-card" data-slot="map">
        <span class="battlefield-session-pivot-label">지도 판독</span>
        <strong>${truncateLine(frame.readoutLine || '', context === 'dock' ? 42 : 54)}</strong>
        <small>${readoutDetail}</small>
        <div class="battlefield-session-inline-note battlefield-session-inline-note-subtle">${readoutMode}</div>
      </article>
      <article class="battlefield-session-pivot-card battlefield-session-pivot-card-primary" data-slot="action">
        <span class="battlefield-session-pivot-label">다음 행동</span>
        <strong>${sceneTitle}</strong>
        <small>${actionDetail}</small>
        <div class="battlefield-session-inline-note battlefield-session-inline-note-subtle">${actionMeta}</div>
        ${includePrimaryAction && frame.recommendedSceneId ? `
          <button
            type="button"
            class="city-session-action-button city-session-action-button-primary battlefield-session-inline-action"
            data-command-scene="${frame.recommendedSceneId}"
            data-tone="${frame.tone}"
          >
            <span class="city-session-action-label">권장 장면</span>
            <strong>${recommendedTitle}</strong>
            <small>${truncateLine(sceneTeaser || frame.actionLine || '', 72)}</small>
          </button>
        ` : ''}
        ${actionSupport}
      </article>
    </div>
  `;
}

function renderBattlefieldSessionSupportLane(frame, { context = 'rail' } = {}) {
  const selected = frame.state === 'selection';
  const content = selected
    ? renderBattlefieldSessionSceneStrip(frame, { context, variant: context === 'dock' ? 'embedded' : 'default' })
    : renderCitySessionFocusCandidates(frame, { context, includeLead: false });
  if (!content) return '';

  const title = selected
    ? `${frame.recommendedSceneMeta?.name || frame.sceneLabel || '권장 장면'}부터 바로 이어집니다`
    : frame.focusLead || '접경 허브 후보';
  const detail = selected
    ? '장면을 여기서 바로 고른 뒤 결정 패널로 이어갑니다.'
    : frame.overlayActive
      ? '전선 시야에 잡힌 접경 허브를 눌러 첫 세션을 시작합니다.'
      : '접경 허브 후보를 눌러 첫 거점과 장면을 함께 고릅니다.';

  return `
    <section class="battlefield-session-support-lane" data-context="${context}" data-state="${frame.state}" data-tone="${frame.tone || 'overview'}">
      <div class="battlefield-session-support-head">
        <span class="battlefield-session-support-label">${selected ? '장면 전개' : '접경 후보'}</span>
        <strong>${truncateLine(title, context === 'dock' ? 44 : 56)}</strong>
        <small>${truncateLine(detail, context === 'dock' ? 78 : 96)}</small>
      </div>
      ${content}
    </section>
  `;
}

function renderBattlefieldSessionSceneStrip(frame, { context = 'rail', variant = 'default' } = {}) {
  if (!frame.visibleScenes?.length) return '';
  return `
    <div class="battlefield-session-scene-strip" data-context="${context}" data-variant="${variant}">
      ${frame.visibleScenes.map((sceneId) => {
        const meta = COMMAND_SCENES[sceneId];
        const recommended = sceneId === frame.recommendedSceneId;
        return `
          <button
            type="button"
            class="city-session-scene-button battlefield-session-scene-button${recommended ? ' is-recommended' : ''}"
            data-command-scene="${sceneId}"
            data-tone="${frame.tone}"
            data-recommended="${recommended ? 'true' : 'false'}"
          >
            <span class="city-session-scene-kicker">${recommended ? '권장 장면' : variant === 'embedded' ? '다음 장면' : '바로 열기'}</span>
            <strong>${meta?.name || sceneId}</strong>
            <small>${truncateLine(getCommandSceneTeaser(frame.cityId, sceneId), variant === 'embedded' ? 54 : 68)}</small>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function renderMapSelectionSession(frame) {
  if (frame.state === 'selection') {
    const sceneTitle = frame.recommendedSceneMeta?.name || frame.sceneLabel || '명령';
    const sceneTeaser = getCommandSceneTeaser(frame.cityId, frame.recommendedSceneId)
      || frame.actionLine
      || frame.noteLine
      || '이번 턴에 열 장면을 고르십시오.';
    const statusDetail = `${truncateLine(frame.title || '', 26)} · ${buildBattlefieldSessionStatusDetail(frame)}`;
    const actionMeta = [
      'Enter · 명령',
      'F · 재집중',
      'V · 전선 시야',
    ];
    const readoutMeta = [
      frame.overlayActive ? '전선 시야 중' : '기본 시야',
      `${state?.actionsRemaining ?? 0}/${state?.maxActions || 3} 행동`,
      frame.selection?.buttonLabel || '명령 열기',
    ];

    return `
      <section class="battlefield-selection-hub" data-state="${frame.state}" data-tone="${frame.tone || 'overview'}">
        ${renderCitySessionStatusBar({
          label: '선택 도시',
          badge: sceneTitle,
          detail: statusDetail,
        })}
        <div class="battlefield-selection-hero">
          <article class="battlefield-selection-card battlefield-selection-card-city">
            <div class="battlefield-selection-hero-head">
              <div class="battlefield-session-focus-seal" style="--session-seal-color:${frame.sealColor || '#f0dfb9'}">${frame.sealGlyph || '戰'}</div>
              <div class="battlefield-selection-hero-copy">
                <span class="battlefield-selection-card-kicker">선택 도시</span>
                <strong>${frame.title}</strong>
                <small>${truncateLine(frame.selection?.ownerLine || frame.ownerLine || '', 108)}</small>
              </div>
            </div>
            <p class="battlefield-selection-hero-note">${truncateLine(frame.noteLine || frame.selection?.fieldBody || frame.actionLine || '', 168)}</p>
            ${renderCitySessionTacticalStrip(buildBattlefieldSessionFocusItems(frame))}
          </article>
          <article class="battlefield-selection-card battlefield-selection-card-action">
            <span class="battlefield-selection-card-kicker">다음 행동</span>
            <strong>${sceneTitle}</strong>
            <small>${truncateLine(frame.actionLine || sceneTeaser, 132)}</small>
            <p class="battlefield-selection-hero-note">${truncateLine(sceneTeaser || frame.reasonLine || frame.readoutLine || '', 148)}</p>
            <div class="battlefield-selection-meta-strip">
              ${actionMeta.map((entry) => `<span class="battlefield-selection-meta-chip">${entry}</span>`).join('')}
            </div>
            ${renderBattlefieldSessionSceneStrip(frame, { context: 'selection-hub', variant: 'embedded' })}
          </article>
        </div>
        <article class="battlefield-selection-readout">
          <div class="battlefield-selection-readout-copy">
            <span class="battlefield-selection-card-kicker">지도 판독</span>
            <strong>${truncateLine(frame.readoutLine || frame.reasonLine || '', 96)}</strong>
            <small>${truncateLine(frame.reasonLine || frame.selection?.fieldBody || frame.noteLine || '', 160)}</small>
          </div>
          <div class="battlefield-selection-readout-meta">
            ${readoutMeta.map((entry) => `<span class="battlefield-selection-meta-chip">${truncateLine(entry, 24)}</span>`).join('')}
          </div>
        </article>
        ${renderBattlefieldStrikeStrip(frame, { context: 'selection' })}
      </section>
    `;
  }
  return renderBattlefieldFieldDockSurface(frame);
}

function renderBattlefieldSessionStoryGrid(frame, {
  context = 'dock',
  includePrimaryAction = false,
} = {}) {
  return `
    <div class="battlefield-session-story-grid" data-context="${context}" data-state="${frame.state}" data-tone="${frame.tone || 'overview'}">
      ${renderBattlefieldSessionPivot(frame, { context, includePrimaryAction })}
      ${renderBattlefieldSessionSupportLane(frame, { context })}
    </div>
  `;
}

function renderBattlefieldSessionLockSurface(frame, { context = 'dock' } = {}) {
  const label = context === 'dock' ? '거점 선택' : '전장 판단';
  const badge = frame.sessionBadge || (frame.state === 'selection' ? '선택 도시' : '거점 선택');
  const detail = frame.state === 'selection'
    ? `${truncateLine(frame.title || '', 28)} · ${buildBattlefieldSessionStatusDetail(frame)}`
    : frame.sessionDetail || buildBattlefieldSessionStatusDetail(frame);

  return `
    <section class="battlefield-session-lock-panel" data-context="${context}" data-state="${frame.state}" data-tone="${frame.tone || 'overview'}">
      ${renderCitySessionStatusBar({ label, badge, detail })}
      ${renderBattlefieldSessionSpine(frame.steps || [], {
        layout: 'strip',
        density: context === 'dock' ? 'compact' : 'regular',
      })}
      ${renderBattlefieldSessionStoryGrid(frame, {
        context,
        includePrimaryAction: context !== 'dock',
      })}
    </section>
  `;
}

function renderBattlefieldWarRoomHub(frame) {
  return `
    <div class="war-room-grid-main">
      ${renderBattlefieldSessionStoryGrid(frame, {
        context: 'war-room',
        includePrimaryAction: frame.state === 'selection',
      })}
    </div>
    <div class="war-room-grid-side">
      ${renderBattlefieldDecisionDeck(frame, { context: 'war-room' })}
    </div>
  `;
}

function renderBattlefieldFieldDockSurface(frame) {
  const selected = frame.state === 'selection';
  const supportMarkup = selected
    ? renderBattlefieldSessionSceneStrip(frame, { context: 'dock', variant: 'embedded' })
    : renderCitySessionFocusCandidates(frame, { context: 'dock', includeLead: false });
  const supportTitle = selected
    ? `${frame.recommendedSceneMeta?.name || frame.sceneLabel || '권장 장면'}로 바로 연결`
    : frame.focusLead || '접경 허브 후보';
  const supportBody = selected
    ? '현재 허브에서 바로 장면을 골라 결정 패널로 이어갑니다.'
    : frame.overlayActive
      ? '전선 시야에 잡힌 접경 허브를 눌러 선택 도시를 잠급니다.'
      : '접경 허브를 눌러 선택 도시와 다음 행동을 함께 고정합니다.';

  return `
    <section class="battlefield-field-dock" data-state="${frame.state}" data-tone="${frame.tone || 'overview'}">
      ${renderCitySessionStatusBar({
        label: '전장 결정',
        badge: frame.state === 'selection' ? (frame.sceneLabel || frame.sessionBadge || '선택 도시') : '거점 선택',
        detail: frame.state === 'selection'
          ? `${truncateLine(frame.title || '', 26)} · ${buildBattlefieldSessionStatusDetail(frame)}`
          : buildBattlefieldSessionStatusDetail(frame),
      })}
      ${renderBattlefieldSessionBand(frame, { context: 'dock' })}
      ${supportMarkup ? `
        <section class="battlefield-field-dock-support" data-state="${frame.state}" data-tone="${frame.tone || 'overview'}">
          <div class="battlefield-field-dock-support-head">
            <span class="battlefield-field-dock-support-label">${selected ? '장면 연결' : '접경 후보'}</span>
            <strong>${truncateLine(supportTitle, 52)}</strong>
            <small>${truncateLine(supportBody, 92)}</small>
          </div>
          ${supportMarkup}
        </section>
      ` : ''}
    </section>
  `;
}

function renderBattlefieldFieldUtilityDeck(frame) {
  const selected = frame.state === 'selection';
  const rows = selected
    ? [
        {
          label: '다음 행동',
          value: `${frame.title} → ${frame.recommendedSceneMeta?.name || frame.sceneLabel || '명령'}`,
          detail: frame.actionLine || '선택 도시 허브에서 바로 결정 패널로 이어집니다.',
        },
        {
          label: '빠른 입력',
          value: 'Enter · F · V',
          detail: 'Enter 또는 Space로 명령을 열고, F로 재집중, V로 전선 시야를 켭니다.',
        },
        {
          label: '행동력',
          value: `${state?.actionsRemaining ?? 0}/${state?.maxActions || 3} 행동`,
          detail: frame.readoutLine || '지형, 전선, 성방을 함께 읽으며 결정을 유지합니다.',
        },
      ]
    : [
        {
          label: '다음 행동',
          value: '거점 선택 → 장면 잠금',
          detail: frame.noteLine || '접경 허브 하나를 눌러 선택 도시와 다음 행동을 같이 고정합니다.',
        },
        {
          label: '빠른 입력',
          value: '도시 클릭 · V',
          detail: '도시를 누르거나 전선 시야를 켜서 첫 세션 진입선을 정리합니다.',
        },
        {
          label: '접경 후보',
          value: `${frame.frontlineCities?.length || 0}곳`,
          detail: frame.readoutLine || '접경 후보를 계산 중입니다.',
        },
      ];
  const chips = [
    frame.overlayActive ? '전선 시야' : '기본 시야',
    selected ? (frame.recommendedSceneMeta?.name || frame.sceneLabel || '명령') : `${frame.frontlineCities?.length || 0} 접경 후보`,
    `${state?.actionsRemaining ?? 0}/${state?.maxActions || 3} AP`,
  ];

  return `
    <aside class="battlefield-field-utility-card" data-state="${frame.state}" data-tone="${frame.tone || 'overview'}">
      <div class="battlefield-field-utility-head">
        <div class="battlefield-field-utility-copy">
          <span class="battlefield-field-utility-kicker">${selected ? '선택 유지' : '선택 준비'}</span>
          <strong>${truncateLine(selected ? `${frame.title} 세션 잠금 유지` : '전장 허브를 잠그는 첫 규칙', 46)}</strong>
          <small>${truncateLine(
            selected
              ? frame.noteLine || frame.actionLine || '선택 도시와 다음 행동을 같은 도크에서 계속 유지합니다.'
              : frame.noteLine || '전선 시야를 켜고 접경 허브를 눌러 첫 세션을 시작합니다.',
            126
          )}</small>
        </div>
        <span class="battlefield-field-utility-state">${selected ? '진행 중' : '대기'}</span>
      </div>
      <div class="battlefield-field-utility-grid">
        ${rows.map((row) => `
          <article class="battlefield-field-utility-row">
            <span class="battlefield-field-utility-label">${row.label}</span>
            <strong>${truncateLine(row.value, 34)}</strong>
            <small>${truncateLine(row.detail, 88)}</small>
          </article>
        `).join('')}
      </div>
      <div class="battlefield-field-utility-meta">
        ${chips.map((chip) => `<span class="battlefield-field-utility-chip">${truncateLine(chip, 28)}</span>`).join('')}
      </div>
    </aside>
  `;
}

function renderBattlefieldSessionControlDeck(frame) {
  const selected = frame.state === 'selection';
  const title = selected
    ? `${frame.title} 허브 잠금 완료`
    : '첫 전장 세션 잠금 전';
  const copy = selected
    ? frame.noteLine || frame.readoutLine || '선택 도시와 다음 행동을 같은 축으로 묶었습니다.'
    : frame.noteLine || '전선 시야를 켜고 접경 허브를 고르면 선택 도시와 다음 행동이 함께 잠깁니다.';
  const rows = selected
    ? [
      {
        label: '선택 도시',
        value: frame.title,
        detail: frame.selection?.ownerLine || frame.ownerLine || '도시 정보 정리 중',
      },
      {
        label: '다음 행동',
        value: frame.recommendedSceneMeta?.name || frame.sceneLabel || '명령',
        detail: frame.actionLine || getCommandSceneTeaser(frame.cityId, frame.recommendedSceneId) || '장면 권고를 계산 중입니다.',
      },
      {
        label: '빠른 입력',
        value: 'Enter · Space · F',
        detail: '명령 열기, 재집중, 전선 시야 전환을 같은 도크에서 바로 이어갑니다.',
      },
    ]
    : [
      {
        label: '접경 허브',
        value: frame.frontlineCities?.[0]?.city?.name || '도시 선택 대기',
        detail: frame.frontlineCities?.length
          ? `${frame.frontlineCities.length}개 접경 후보가 첫 세션 진입선으로 열려 있습니다.`
          : '접경 후보를 계산 중입니다.',
      },
      {
        label: '첫 행동',
        value: '지도에서 거점 선택',
        detail: frame.sessionDetail || '도시를 눌러 선택 도시와 장면 축을 함께 잠급니다.',
      },
      {
        label: '빠른 입력',
        value: '도시 클릭 · V',
        detail: '전선 시야를 켜고 접경 허브를 읽은 뒤 첫 세션을 시작합니다.',
      },
    ];
  const meta = [
    `${state?.actionsRemaining ?? 0}/${state?.maxActions || 3} 행동`,
    frame.overlayActive ? '전선 시야' : '기본 시야',
    selected
      ? frame.recommendedSceneMeta?.name || frame.sceneLabel || '명령'
      : `${frame.frontlineCities?.length || 0} 접경 후보`,
  ];

  return `
    <aside class="battlefield-session-control-card" data-state="${frame.state}" data-tone="${frame.tone || 'overview'}">
      <div class="battlefield-session-control-head">
        <div class="battlefield-session-control-copy">
          <span class="battlefield-session-control-kicker">${selected ? '선택 조작' : '선택 준비'}</span>
          <strong>${truncateLine(title, 42)}</strong>
          <small>${truncateLine(copy, 120)}</small>
        </div>
        <span class="battlefield-session-control-state">${selected ? '진행 중' : '대기'}</span>
      </div>
      <div class="battlefield-session-control-list">
        ${rows.map((row) => `
          <article class="battlefield-session-control-row">
            <span class="battlefield-session-control-label">${row.label}</span>
            <strong>${truncateLine(row.value, 34)}</strong>
            <small>${truncateLine(row.detail, 92)}</small>
          </article>
        `).join('')}
      </div>
      <div class="battlefield-session-control-meta">
        ${meta.map((entry) => `<span class="battlefield-session-control-chip">${truncateLine(entry, 28)}</span>`).join('')}
      </div>
    </aside>
  `;
}

function buildBattlefieldSessionFrame(cityId = null) {
  const selectedCityId = cityId && state?.cities?.[cityId] ? cityId : null;
  const overlayActive = uiState.mapOverlayMode === 'frontline';

  if (!selectedCityId) {
    const director = buildBattlefieldDirectorPacket({ state, scenario, cityId: null });
    const frontlineCities = getPrioritizedFrontlineCities(3);
    const overlayCopy = getFrontlineOverlayCopy(frontlineCities);
    return {
      cityId: null,
      state: 'overview',
      tone: 'overview',
      overlayActive,
      title: director.title || '첫 거점을 선택하십시오',
      ownerLine: director.objective || '전장을 읽고 첫 행동을 고르십시오.',
      sessionKicker: '전장 허브',
      sessionBadge: director.scene || '거점 선택',
      sessionDetail: director.action || '지도에서 이번 턴의 첫 거점을 집습니다.',
      sealGlyph: '戰',
      sealColor: '#f0dfb9',
      actionLine: director.action || '지도에서 핵심 거점을 먼저 선택합니다.',
      readoutLine: truncateLine(overlayCopy.body || '전선 시야를 켜고 접경 거점을 확인하십시오.', 56),
      reasonLine: `${state?.actionsRemaining ?? 0}/${state?.maxActions || 3} 남음`,
      noteLine: overlayCopy.body || director.whyNow || '전선 시야를 켜면 접경 거점과 지원로를 빠르게 고를 수 있습니다.',
      sceneLabel: director.scene || '거점 선택',
      steps: [
        {
          label: '선택 도시',
          title: director.focus || '첫 거점을 고르십시오',
          detail: '접경 허브 후보를 눌러 세션을 시작합니다.',
          status: 'active',
        },
        {
          label: '지도 판독',
          title: overlayCopy.title || '접경 거점을 강조합니다',
          detail: overlayCopy.body || '전선 시야를 켜면 접경 거점과 지원로를 바로 훑을 수 있습니다.',
          status: 'ready',
        },
        {
          label: '다음 행동',
          title: director.scene || '거점 선택',
          detail: director.action || '장면을 고정할 거점을 집습니다.',
          status: 'pending',
        },
      ],
      tacticalStrip: [],
      frontlineCities,
      focusLead: frontlineCities.length ? '접경 허브 후보' : '접경 허브 후보 없음',
      visibleScenes: [],
      recommendedSceneId: null,
      recommendedSceneMeta: null,
      selection: null,
      city: null,
    };
  }

  const city = state?.cities?.[selectedCityId];
  if (!city) return buildBattlefieldSessionFrame(null);

  const selection = getCitySelectionProfile(selectedCityId);
  const director = buildBattlefieldDirectorPacket({ state, scenario, cityId: selectedCityId });
  const readout = buildSelectionMapReadout(selectedCityId, selection);
  const visibleScenes = getCommandScenesForCity(selectedCityId);
  const recommendedSceneId = resolveRecommendedCommandSceneId(selectedCityId, director);
  const ownerName = city.owner ? state.factions?.[city.owner]?.name || '세력 미상' : '무주지';
  const recommendedSceneMeta = COMMAND_SCENES[recommendedSceneId] || COMMAND_SCENES[visibleScenes[0]] || null;
  const sceneLabel = recommendedSceneMeta?.name || director.scene || selection.scene || '명령';
  const actionLine = director.action || selection.action;
  const noteLine = director.objective || director.whyNow || selection.fieldBody;

  return {
    cityId: selectedCityId,
    state: 'selection',
    tone: selection.panelTone,
    overlayActive,
    title: city.name,
    ownerLine: `${ownerName} · ${director.scene || selection.scene}`,
    sessionKicker: '선택 도시 허브',
    sessionBadge: sceneLabel,
    sessionDetail: actionLine,
    sealGlyph: getFactionSealLabel(city.owner),
    sealColor: FACTION_COLORS[city.owner] || (selection.panelTone === 'neutral' ? '#7f9270' : '#8f6a3e'),
    actionLine,
    readoutLine: readout,
    reasonLine: truncateLine(director.whyNow || selection.fieldBody || '', 48),
    noteLine,
    sceneLabel,
    steps: [
      {
        label: '선택 도시',
        title: city.name,
        detail: selection.ownerLine,
        status: 'complete',
      },
      {
        label: '지도 판독',
        title: readout,
        detail: director.whyNow || selection.fieldBody || '전선과 성방을 함께 읽습니다.',
        status: 'active',
      },
      {
        label: '다음 행동',
        title: sceneLabel,
        detail: actionLine,
        status: 'ready',
      },
    ],
    tacticalStrip: selection.tacticalStrip || [],
    frontlineCities: [],
    focusLead: '',
    visibleScenes,
    recommendedSceneId,
    recommendedSceneMeta,
    selection,
    city,
    director,
    ownerName,
  };
}

function renderCitySessionFocusCandidates(frame, { context = 'rail', includeLead = true } = {}) {
  if (!frame.frontlineCities?.length) return '';
  return `
    ${includeLead ? `<div class="city-session-focus-lead">${frame.focusLead}</div>` : ''}
    <div class="city-session-focus-grid" data-context="${context}">
      ${frame.frontlineCities.map((entry) => `
        <button type="button" class="city-session-focus-button" data-city-id="${entry.cityId}" data-tone="${entry.owned ? 'own' : 'hostile'}">
          <span class="city-session-focus-city">${entry.city.name}</span>
          <span class="city-session-focus-copy">${entry.frontLine?.value || '전선 확인'} · 병력 ${formatArmy(entry.city.army)}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function buildCityRailSceneCards(frame) {
  const actionBudget = `${state?.actionsRemaining ?? 0}/${state?.maxActions || 3} 행동`;
  if (frame.state === 'selection') {
    return [
      {
        label: '집중 거점',
        title: frame.title || '선택 도시',
        detail: truncateLine(frame.ownerLine || frame.noteLine || '선택 도시를 유지합니다.', 80),
        tone: 'primary',
      },
      {
        label: '권장 장면',
        title: frame.recommendedSceneMeta?.name || frame.sceneLabel || '명령',
        detail: truncateLine(frame.actionLine || '장면을 잠가 다음 명령으로 이어갑니다.', 80),
        tone: 'scene',
      },
      {
        label: '지도 판독',
        title: truncateLine(frame.readoutLine || frame.reasonLine || '전황 판독 유지', 32),
        detail: truncateLine(frame.reasonLine || frame.noteLine || '지형과 전선을 함께 읽습니다.', 80),
        tone: 'summary',
      },
      {
        label: '행동 예산',
        title: actionBudget,
        detail: frame.overlayActive ? '전선 시야 활성화' : '기본 시야 유지',
        tone: 'risk',
      },
    ];
  }

  return [
    {
      label: '출정 장면',
      title: frame.sessionBadge || frame.sceneLabel || '거점 선택',
      detail: truncateLine(frame.actionLine || '첫 거점을 고르면 장면과 명령이 함께 잠깁니다.', 80),
      tone: 'primary',
    },
    {
      label: '첫 거점',
      title: truncateLine(frame.steps?.[0]?.title || frame.title || '거점 선택 대기', 32),
      detail: truncateLine(frame.noteLine || '접경 허브를 눌러 첫 세션을 시작합니다.', 80),
      tone: 'scene',
    },
    {
      label: '전선 시야',
      title: frame.overlayActive ? '접경 강조 중' : '기본 시야',
      detail: truncateLine(frame.readoutLine || '전선과 지원로를 읽어 첫 거점을 고릅니다.', 80),
      tone: 'summary',
    },
    {
      label: '행동 예산',
      title: actionBudget,
      detail: `${frame.frontlineCities?.length || 0}개 접경 후보`,
      tone: 'risk',
    },
  ];
}

function renderCityRailSceneBoard(frame) {
  const theme = getSurfaceTheme();
  const cards = buildCityRailSceneCards(frame);
  const headline = frame.state === 'selection'
    ? `${frame.title || '선택 도시'}에서 ${frame.recommendedSceneMeta?.name || frame.sceneLabel || '명령'}로 연결`
    : '첫 거점을 잠가 command까지 같은 흐름으로 잇습니다';
  const body = frame.state === 'selection'
    ? frame.noteLine || frame.actionLine || '선택 도시와 다음 행동이 같은 세션으로 유지됩니다.'
    : frame.noteLine || frame.actionLine || '전선 시야와 접경 허브를 먼저 읽어 첫 명령을 여십시오.';

  return `
    <section class="city-rail-scene-board" data-state="${frame.state}" data-tone="${frame.tone || 'overview'}">
      <div class="city-rail-scene-board-head">
        <div class="city-rail-scene-board-copy">
          <span class="city-rail-scene-board-kicker">${frame.state === 'selection' ? theme.cityLockedKicker : theme.cityOverviewKicker}</span>
          <strong>${truncateLine(headline, 52)}</strong>
          <small>${truncateLine(body, 118)}</small>
        </div>
        <span class="city-rail-scene-board-state">${frame.state === 'selection' ? '진행 중' : '준비'}</span>
      </div>
      <div class="city-rail-scene-board-grid">
        ${cards.map((card) => `
          <article class="city-rail-scene-card tone-${card.tone}">
            <span class="city-rail-scene-card-label">${card.label}</span>
            <strong>${card.title}</strong>
            <small>${card.detail}</small>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderBattlefieldSessionRunwaySurface(frame) {
  return `
    <section class="city-session-panel battlefield-session-runway battlefield-rail-surface" data-state="${frame.state}" data-tone="${frame.tone || 'overview'}">
      ${renderCitySessionStatusBar({
        label: '전장 판단',
        badge: frame.sessionBadge,
        detail: frame.sessionDetail || buildBattlefieldSessionStatusDetail(frame),
      })}
      ${renderCityRailSceneBoard(frame)}
      ${renderBattlefieldSessionSpine(frame.steps || [], { layout: 'strip', density: 'regular' })}
      <div class="battlefield-session-runway-grid" data-state="${frame.state}" data-tone="${frame.tone || 'overview'}">
        <div class="battlefield-session-runway-main">
          ${renderBattlefieldSessionStoryGrid(frame, {
            context: 'rail',
            includePrimaryAction: frame.state === 'selection',
          })}
        </div>
        ${renderBattlefieldDecisionDeck(frame, { context: 'rail' })}
      </div>
      <div class="city-session-action-row">
        <button
          type="button"
          class="city-session-utility-button"
          data-battlefield-action="toggle-overlay"
          data-active="${frame.overlayActive ? 'true' : 'false'}"
        >
          <span>${frame.overlayActive ? '전선 시야 중' : '전선 시야'}</span>
          <kbd>V</kbd>
        </button>
        ${frame.state === 'selection' ? `
          <button type="button" class="city-session-utility-button" data-battlefield-action="refocus-city">
            <span>재집중</span>
            <kbd>F</kbd>
          </button>
        ` : frame.frontlineCities.length > 1 ? `
          <button type="button" class="city-session-utility-button" data-battlefield-action="next-frontline">
            <span>다음 접경</span>
            <kbd>&rarr;</kbd>
          </button>
        ` : ''}
      </div>
    </section>
  `;
}

function renderCitySessionBoardOverview() {
  const frame = buildBattlefieldSessionFrame(null);
  return renderBattlefieldSessionRunwaySurface(frame);
}

function renderCitySessionBoardSelection(cityId) {
  const frame = buildBattlefieldSessionFrame(cityId);
  if (frame.state !== 'selection') return renderCitySessionBoardOverview();
  return renderBattlefieldSessionRunwaySurface(frame);
}

function updateCitySessionBoard() {
  const board = document.getElementById('city-session-board');
  if (!board) return;
  board.innerHTML = map?.selectedCity && state?.cities?.[map.selectedCity]
    ? renderCitySessionBoardSelection(map.selectedCity)
    : renderCitySessionBoardOverview();
}

async function handleBattlefieldBoardAction(action) {
  if (processing) return false;
  switch (action) {
    case 'toggle-overlay':
      toggleMapOverlayMode();
      return true;
    case 'next-frontline':
      return cycleFrontlineCity(1);
    case 'refocus-city':
      return refocusSelectedCity();
    case 'open-command':
      await openSelectedCityCommand();
      return true;
    default:
      return false;
  }
}

function getSelectionRailCopy(selection) {
  if (selection.panelTone === 'own') return `${selection.scene}에서 이번 턴 주력 명령을 바로 확정합니다.`;
  if (selection.panelTone === 'neutral') return `${selection.scene}에서 선점 각과 수비 여력을 바로 비교합니다.`;
  return `${selection.scene}에서 압박선과 외교 여지를 먼저 읽습니다.`;
}

function renderCityRailNote(frame) {
  const city = frame?.city;
  const selection = frame?.selection;
  if (!city || !selection) return '도시를 선택하면 이곳에서 바로 결정 패널로 들어갑니다.';
  const readout = truncateLine(frame.readoutLine || '', 28);
  return `
    <span class="city-rail-cta-strip">
      <span class="city-rail-note-chip">${city.name}</span>
      <span class="city-rail-note-chip">${frame.sceneLabel || selection.scene}</span>
      <span class="city-rail-note-chip">${readout}</span>
    </span>
    <span class="city-rail-cta-copy">${frame.actionLine || getSelectionRailCopy(selection)}</span>
  `;
}

// --- 초기화 ---
async function init() {
  applyViewportLayoutLock();
  eventUI = new EventUI();
  sidebar = new Sidebar();
  actionPanel = new ActionPanel();
  turnResolution = new TurnResolution();

  // 버튼 바인딩
  document.getElementById('btn-new-game').addEventListener('click', (event) => {
    const button = event.currentTarget;
    const factionId = button instanceof HTMLButtonElement ? button.dataset.preselectedFaction || null : null;
    void showFactionSelect(factionId);
  });
  document.getElementById('btn-load-game').addEventListener('click', loadGame);
  document.getElementById('start-faction-strip')?.addEventListener('mouseover', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !scenario) return;
    const button = target.closest('[data-faction-pick]');
    if (!(button instanceof HTMLButtonElement) || !button.dataset.factionPick) return;
    renderStartScreenSpotlight(scenario, button.dataset.factionPick);
  });
  document.getElementById('start-faction-strip')?.addEventListener('focusin', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !scenario) return;
    const button = target.closest('[data-faction-pick]');
    if (!(button instanceof HTMLButtonElement) || !button.dataset.factionPick) return;
    renderStartScreenSpotlight(scenario, button.dataset.factionPick);
  });
  document.getElementById('start-faction-strip')?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('[data-faction-pick]');
    if (!(button instanceof HTMLButtonElement) || !button.dataset.factionPick) return;
    void showFactionSelect(button.dataset.factionPick);
  });
  document.getElementById('btn-next-turn').addEventListener('click', nextTurn);
  document.getElementById('btn-save').addEventListener('click', saveGame);
  document.getElementById('btn-menu').addEventListener('click', returnToMenu);
  document.getElementById('btn-restart').addEventListener('click', returnToMenu);
  document.getElementById('btn-confirm-faction').addEventListener('click', () => { void showIntro(); });
  document.getElementById('btn-back-to-start').addEventListener('click', () => { void backToStart(); });
  document.getElementById('btn-start-game').addEventListener('click', startNewGame);
  document.getElementById('intro-dialogue').addEventListener('click', advanceDialogue);
  document.getElementById('btn-open-command').addEventListener('click', openSelectedCityCommand);
  document.getElementById('btn-toggle-frontline-overlay-dock').addEventListener('click', toggleMapOverlayMode);
  document.getElementById('btn-refocus-city').addEventListener('click', () => { void refocusSelectedCity(); });
  document.getElementById('btn-open-command-rail').addEventListener('click', openSelectedCityCommand);
  document.getElementById('map-selection-panel')?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || processing) return;
    const sceneButton = target.closest('[data-command-scene]');
    if (sceneButton instanceof HTMLButtonElement && sceneButton.dataset.commandScene) {
      void openSelectedCityCommandScene(sceneButton.dataset.commandScene);
      return;
    }
    const cityButton = target.closest('[data-city-id]');
    if (cityButton instanceof HTMLButtonElement && cityButton.dataset.cityId) {
      selectCityById(cityButton.dataset.cityId);
    }
  });
  document.getElementById('map-selection-panel')?.addEventListener('mouseover', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('[data-city-id]');
    if (!(button instanceof HTMLElement) || !button.dataset.cityId || processing) return;
    previewFrontlineCity(button.dataset.cityId, button);
  });
  document.getElementById('map-selection-panel')?.addEventListener('focusin', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('[data-city-id]');
    if (!(button instanceof HTMLElement) || !button.dataset.cityId || processing) return;
    previewFrontlineCity(button.dataset.cityId, button);
  });
  document.getElementById('map-selection-panel')?.addEventListener('mouseout', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('[data-city-id]');
    if (!(button instanceof HTMLElement) || !button.dataset.cityId) return;
    if (event.relatedTarget instanceof Node && button.contains(event.relatedTarget)) return;
    clearFrontlineCityPreview(button.dataset.cityId);
  });
  document.getElementById('map-selection-panel')?.addEventListener('focusout', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('[data-city-id]');
    if (!(button instanceof HTMLElement) || !button.dataset.cityId) return;
    if (event.relatedTarget instanceof Node && button.contains(event.relatedTarget)) return;
    clearFrontlineCityPreview(button.dataset.cityId);
  });
  document.getElementById('war-room-grid')?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || processing) return;
    const sceneButton = target.closest('[data-command-scene]');
    if (sceneButton instanceof HTMLButtonElement && sceneButton.dataset.commandScene) {
      void openSelectedCityCommandScene(sceneButton.dataset.commandScene);
      return;
    }
    const cityButton = target.closest('[data-city-id]');
    if (cityButton instanceof HTMLButtonElement && cityButton.dataset.cityId) {
      selectCityById(cityButton.dataset.cityId);
    }
  });
  document.getElementById('war-room-grid')?.addEventListener('mouseover', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('[data-city-id]');
    if (!(button instanceof HTMLElement) || !button.dataset.cityId || processing) return;
    previewFrontlineCity(button.dataset.cityId, button);
  });
  document.getElementById('war-room-grid')?.addEventListener('focusin', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('[data-city-id]');
    if (!(button instanceof HTMLElement) || !button.dataset.cityId || processing) return;
    previewFrontlineCity(button.dataset.cityId, button);
  });
  document.getElementById('war-room-grid')?.addEventListener('mouseout', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('[data-city-id]');
    if (!(button instanceof HTMLElement) || !button.dataset.cityId) return;
    if (event.relatedTarget instanceof Node && button.contains(event.relatedTarget)) return;
    clearFrontlineCityPreview(button.dataset.cityId);
  });
  document.getElementById('war-room-grid')?.addEventListener('focusout', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('[data-city-id]');
    if (!(button instanceof HTMLElement) || !button.dataset.cityId) return;
    if (event.relatedTarget instanceof Node && button.contains(event.relatedTarget)) return;
    clearFrontlineCityPreview(button.dataset.cityId);
  });
  document.getElementById('city-session-board')?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || processing) return;
    const actionButton = target.closest('[data-battlefield-action]');
    if (actionButton instanceof HTMLButtonElement && actionButton.dataset.battlefieldAction) {
      void handleBattlefieldBoardAction(actionButton.dataset.battlefieldAction);
      return;
    }
    const sceneButton = target.closest('[data-command-scene]');
    if (sceneButton instanceof HTMLButtonElement && sceneButton.dataset.commandScene) {
      void openSelectedCityCommandScene(sceneButton.dataset.commandScene);
      return;
    }
    const cityButton = target.closest('[data-city-id]');
    if (cityButton instanceof HTMLButtonElement && cityButton.dataset.cityId) {
      selectCityById(cityButton.dataset.cityId);
    }
  });
  document.getElementById('city-session-board')?.addEventListener('mouseover', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('[data-city-id]');
    if (!(button instanceof HTMLElement) || !button.dataset.cityId || processing) return;
    previewFrontlineCity(button.dataset.cityId, button);
  });
  document.getElementById('city-session-board')?.addEventListener('focusin', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('[data-city-id]');
    if (!(button instanceof HTMLElement) || !button.dataset.cityId || processing) return;
    previewFrontlineCity(button.dataset.cityId, button);
  });
  document.getElementById('city-session-board')?.addEventListener('mouseout', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('[data-city-id]');
    if (!(button instanceof HTMLElement) || !button.dataset.cityId) return;
    if (event.relatedTarget instanceof Node && button.contains(event.relatedTarget)) return;
    clearFrontlineCityPreview(button.dataset.cityId);
  });
  document.getElementById('city-session-board')?.addEventListener('focusout', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('[data-city-id]');
    if (!(button instanceof HTMLElement) || !button.dataset.cityId) return;
    if (event.relatedTarget instanceof Node && button.contains(event.relatedTarget)) return;
    clearFrontlineCityPreview(button.dataset.cityId);
  });
  document.getElementById('btn-toggle-frontline-overlay').addEventListener('click', toggleMapOverlayMode);
  document.getElementById('btn-frontline-prev').addEventListener('click', () => { cycleFrontlineCity(-1); });
  document.getElementById('btn-frontline-next').addEventListener('click', () => { cycleFrontlineCity(1); });
  const frontlineStrip = document.getElementById('war-room-frontline-strip');
  frontlineStrip.addEventListener('click', (event) => {
    const button = event.target.closest('[data-city-id]');
    if (!button || !button.dataset.cityId || processing) return;
    selectCityById(button.dataset.cityId);
  });
  frontlineStrip.addEventListener('mouseover', (event) => {
    const button = event.target.closest('[data-city-id]');
    if (!(button instanceof HTMLElement) || !button.dataset.cityId || processing) return;
    previewFrontlineCity(button.dataset.cityId, button);
  });
  frontlineStrip.addEventListener('focusin', (event) => {
    const button = event.target.closest('[data-city-id]');
    if (!(button instanceof HTMLElement) || !button.dataset.cityId || processing) return;
    previewFrontlineCity(button.dataset.cityId, button);
  });
  frontlineStrip.addEventListener('mouseout', (event) => {
    const button = event.target.closest('[data-city-id]');
    if (!(button instanceof HTMLElement) || !button.dataset.cityId) return;
    const related = event.relatedTarget;
    if (related instanceof Node && button.contains(related)) return;
    clearFrontlineCityPreview(button.dataset.cityId);
  });
  frontlineStrip.addEventListener('focusout', (event) => {
    const button = event.target.closest('[data-city-id]');
    if (!(button instanceof HTMLElement) || !button.dataset.cityId) return;
    const related = event.relatedTarget;
    if (related instanceof HTMLElement && related.closest('[data-city-id]')) return;
    clearFrontlineCityPreview(button.dataset.cityId);
  });

  document.getElementById('btn-toggle-log').addEventListener('click', toggleLog);
  window.addEventListener('resize', scheduleViewportLayoutLock);
  document.addEventListener('keydown', (e) => {
    if (document.getElementById('game-screen').classList.contains('hidden')) return;
    if (e.key.toLowerCase() === 'v' && map && !processing) {
      if (!document.getElementById('event-modal').classList.contains('hidden')) return;
      if (!document.getElementById('char-modal').classList.contains('hidden')) return;
      if (!document.getElementById('turn-resolution').classList.contains('hidden')) return;
      if (actionPanel?.isOpen()) return;
      e.preventDefault();
      toggleMapOverlayMode();
      return;
    }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && map && !processing) {
      if (!document.getElementById('event-modal').classList.contains('hidden')) return;
      if (!document.getElementById('char-modal').classList.contains('hidden')) return;
      if (!document.getElementById('turn-resolution').classList.contains('hidden')) return;
      if (actionPanel?.isOpen()) return;
      e.preventDefault();
      cycleFrontlineCity(e.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (e.key.toLowerCase() === 'f' && map?.selectedCity && !processing) {
      if (refocusSelectedCity()) e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && map?.selectedCity && !processing) {
      if (!document.getElementById('event-modal').classList.contains('hidden')) return;
      if (!document.getElementById('char-modal').classList.contains('hidden')) return;
      if (!document.getElementById('turn-resolution').classList.contains('hidden')) return;
      if (actionPanel?.isOpen()) return;
      e.preventDefault();
      clearSelectedCity();
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (!map?.selectedCity || processing) return;
    if (!document.getElementById('event-modal').classList.contains('hidden')) return;
    if (!document.getElementById('char-modal').classList.contains('hidden')) return;
    if (!document.getElementById('turn-resolution').classList.contains('hidden')) return;
    if (actionPanel?.isOpen()) return;
    e.preventDefault();
    openSelectedCityCommand();
  });

  // 이어하기 버튼 상태
  refreshSaveSlot();
  applyGeneratedStartScreenContent();
  void warmStartScreenSurface();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function applyGeneratedStartScreenContent() {
  // During structural redesign, keep the authored first frame stable.
  if (PLAYER_SURFACE_RUNTIME.preserveAuthoredStartFrame) return;
  const content = getGeneratedStartScreenContent();
  if (!content) return;

  const questionEls = Array.from(document.querySelectorAll('.start-hero-questions .hero-meta-card strong'));
  (content.questions || []).slice(0, questionEls.length).forEach((text, index) => {
    if (questionEls[index]) questionEls[index].textContent = text;
  });

  const focusTitle = document.querySelector('.start-focus-title');
  const focusCopy = document.querySelector('.start-focus-copy');
  if (focusTitle && content.focusTitle) focusTitle.textContent = content.focusTitle;
  if (focusCopy && content.focusCopy) focusCopy.textContent = content.focusCopy;

  const loopStepEls = Array.from(document.querySelectorAll('.start-loop-step'));
  (content.loopSteps || []).slice(0, loopStepEls.length).forEach((step, index) => {
    const node = loopStepEls[index];
    if (!node) return;
    const title = node.querySelector('strong');
    const body = node.querySelector('p');
    if (title && step.title) title.textContent = step.title;
    if (body && step.body) body.textContent = step.body;
  });
}

async function switchScreen(targetId, {
  kicker = '장면 전환',
  title = '',
  body = '',
} = {}) {
  const overlay = document.getElementById('screen-transition');
  if (!overlay) {
    for (const screenId of SCREEN_IDS) {
      document.getElementById(screenId)?.classList.toggle('hidden', screenId !== targetId);
    }
    return;
  }

  document.getElementById('screen-transition-kicker').textContent = kicker;
  document.getElementById('screen-transition-title').textContent = title || '장면 이동';
  document.getElementById('screen-transition-body').textContent = body;
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => overlay.classList.add('visible'));
  await sleep(180);

  for (const screenId of SCREEN_IDS) {
    document.getElementById(screenId)?.classList.toggle('hidden', screenId !== targetId);
  }

  await sleep(280);
  overlay.classList.remove('visible');
  clearTimeout(uiState.transitionTimer);
  uiState.transitionTimer = setTimeout(() => overlay.classList.add('hidden'), 280);
}

async function showSceneTransitionCard({
  kicker = '장면 전환',
  title = '장면 이동',
  body = '',
  duration = 520,
  variant = 'default',
} = {}) {
  const overlay = document.getElementById('screen-transition');
  if (!overlay) return;
  clearTimeout(uiState.transitionTimer);
  overlay.dataset.variant = variant;
  document.getElementById('screen-transition-kicker').textContent = kicker;
  document.getElementById('screen-transition-title').textContent = title;
  document.getElementById('screen-transition-body').textContent = body;
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => overlay.classList.add('visible'));
  await sleep(duration);
  overlay.classList.remove('visible');
  uiState.transitionTimer = setTimeout(() => overlay.classList.add('hidden'), 240);
  await sleep(180);
}

function getActionSealMeta(result = {}) {
  const actionType = result.actionType || '';
  if (['attack', 'declare_war', 'move_troops', 'conscript'].includes(actionType) || result.tone === 'military') {
    return { glyph: '戰', copy: '군령 확정', tone: 'military' };
  }
  if (['propose_peace', 'propose_alliance', 'propose_marriage', 'send_tribute', 'threaten', 'espionage'].includes(actionType) || result.tone === 'diplomacy') {
    return { glyph: '盟', copy: '교섭 재가', tone: 'diplomacy' };
  }
  if (['appoint_governor', 'appoint_tactician', 'move_general', 'search_talent', 'reward_officer', 'bestow_item', 'dismiss_officer'].includes(actionType)) {
    return { glyph: '將', copy: '인사 재가', tone: 'personnel' };
  }
  if (result.tone === 'fortify') {
    return { glyph: '城', copy: '성방 재가', tone: 'fortify' };
  }
  return { glyph: '政', copy: '시정 재가', tone: result.tone === 'growth' ? 'government' : 'government' };
}

function showCommandSealFlash(result = {}) {
  if (!result?.title) return;
  const panel = document.getElementById('command-seal-flash');
  if (!panel) return;
  const seal = getActionSealMeta(result);
  panel.dataset.tone = seal.tone;
  document.getElementById('command-seal-mark').textContent = seal.glyph;
  document.getElementById('command-seal-copy').textContent = seal.copy;
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('visible'));
  setTimeout(() => {
    panel.classList.remove('visible');
    setTimeout(() => panel.classList.add('hidden'), 220);
  }, 680);
}

let dialogueState = { lines: [], index: 0 };

function getStoredSaveMeta() {
  try {
    const raw = localStorage.getItem(SAVE_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function recoverSaveMeta() {
  const saved = localStorage.getItem(SAVE_KEY);
  if (!saved) return null;
  try {
    const recoveredState = GameState.deserialize(saved);
    const meta = buildSaveMeta(recoveredState);
    if (meta) localStorage.setItem(SAVE_META_KEY, JSON.stringify(meta));
    return meta;
  } catch {
    return null;
  }
}

function clearStoredSave() {
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(SAVE_META_KEY);
}

function persistSave({ silent = false, source = 'manual' } = {}) {
  if (!state) return false;
  try {
    const meta = buildSaveMeta(state);
    localStorage.setItem(SAVE_KEY, state.serialize());
    if (meta) localStorage.setItem(SAVE_META_KEY, JSON.stringify(meta));
    refreshSaveSlot(meta);
    if (!silent) {
      showToast(source === 'auto' ? '자동 저장 완료' : '저장 완료');
    }
    return true;
  } catch (err) {
    console.error('Failed to persist save:', err);
    if (!silent) alert('저장에 실패했습니다.');
    return false;
  }
}

function refreshSaveSlot(meta = getStoredSaveMeta()) {
  const btn = document.getElementById('btn-load-game');
  const card = document.getElementById('save-slot-card');
  if (!btn || !card) return;

  const rawSave = localStorage.getItem(SAVE_KEY);
  const effectiveMeta = meta || recoverSaveMeta();
  const hasSave = !!rawSave && !!effectiveMeta;
  btn.disabled = !hasSave;
  btn.style.opacity = hasSave ? '1' : '0.4';
  btn.textContent = hasSave ? '이어하기' : '저장 없음';

  if (!hasSave) {
    card.classList.add('hidden');
    card.innerHTML = '';
    return;
  }

  const savedAt = effectiveMeta.savedAt
    ? new Date(effectiveMeta.savedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '방금 전';

  card.classList.remove('hidden');
  card.innerHTML = `
    <div class="save-slot-kicker">최근 저장</div>
    <div class="save-slot-main">
      <div class="save-slot-title">${effectiveMeta.factionName}</div>
      <div class="save-slot-turn">턴 ${effectiveMeta.turn}</div>
    </div>
    <div class="save-slot-meta">${effectiveMeta.year}년 ${effectiveMeta.month}월 · ${effectiveMeta.leader} · 도시 ${effectiveMeta.cityCount}개</div>
    <div class="save-slot-foot">${getNarrativeModeLabel(effectiveMeta.narrativeMode)} 기준 · ${savedAt} 저장</div>
  `;
}

function getScenarioCityName(sourceScenario, cityId) {
  if (!sourceScenario?.cities || !cityId) return null;
  const city = sourceScenario.cities[cityId];
  if (city?.name) return city.name;
  return Object.values(sourceScenario.cities).find((entry) => entry?.id === cityId)?.name || null;
}

function getAvailableStartScreenFactions(sourceScenario = scenario) {
  return START_SCREEN_FACTION_ORDER.filter((factionId) => sourceScenario?.factions?.[factionId]);
}

function updateStartScreenLaunchButton(sourceScenario = scenario, factionId = null) {
  const button = document.getElementById('btn-new-game');
  if (!button) return;
  const factionName = factionId && sourceScenario?.factions?.[factionId]?.name;
  button.dataset.preselectedFaction = factionName ? factionId : '';
  button.textContent = factionName ? `${factionName} 브리핑 열기` : '전장 브리핑 열기';
}

function buildBattlePromiseGridMarkup({
  focus = '전장 전체',
  scene = '작전 개시',
  risk = '',
  className = 'battle-promise-grid',
  riskMax = 72,
} = {}) {
  return `
    <div class="${className}">
      <div class="battle-promise-cell">
        <span>집중 거점</span>
        <strong>${focus || '전장 전체'}</strong>
      </div>
      <div class="battle-promise-cell">
        <span>첫 장면</span>
        <strong>${scene || '작전 개시'}</strong>
      </div>
      <div class="battle-promise-cell battle-promise-cell-wide">
        <span>지금 리스크</span>
        <strong>${truncateLine(risk || '전선 리스크를 확인하십시오.', riskMax)}</strong>
      </div>
    </div>
  `;
}

function buildBriefingStageMarkup(steps = []) {
  return steps.map((step, index) => `
    <div class="briefing-stage" data-state="${step.state || 'pending'}">
      <span class="briefing-stage-index">${step.index || index + 1}</span>
      <div class="briefing-stage-copy">
        <span class="briefing-stage-label">${step.label || `단계 ${index + 1}`}</span>
        <strong>${step.title || ''}</strong>
        <p>${step.body || ''}</p>
      </div>
    </div>
  `).join('');
}

function normalizeSessionStepStatus(status = 'pending') {
  if (status === 'done') return 'complete';
  return status || 'pending';
}

function renderOnboardingSessionSpine(steps = [], options = {}) {
  return renderBattlefieldSessionSpine(
    steps.map((step) => ({
      label: step.label || '',
      title: step.title || '',
      detail: step.body || step.detail || '',
      status: normalizeSessionStepStatus(step.state || step.status),
    })),
    {
      layout: 'strip',
      density: 'compact',
      ...options,
    },
  );
}

function renderOnboardingSessionTrack(trackItems = []) {
  if (!trackItems.length) return '';
  return `
    <div class="battlefield-session-track onboarding-session-track">
      ${trackItems.map((item) => `
        <article class="battlefield-session-track-card is-${item.status || 'pending'}" data-slot="${item.slot || 'overview'}">
          <span class="battlefield-session-track-label">${item.label || ''}</span>
          <strong>${truncateLine(item.value || item.title || '', 38)}</strong>
          <small>${truncateLine(item.detail || '', 88)}</small>
        </article>
      `).join('')}
    </div>
  `;
}

function renderOnboardingSessionDock({
  kicker = '',
  title = '',
  body = '',
  supportMarkup = '',
  footMarkup = '',
  accent = '',
} = {}) {
  const accentStyle = accent ? ` style="--onboarding-session-accent:${accent}"` : '';
  return `
    <div class="battlefield-session-dock-summary onboarding-session-dock"${accentStyle}>
      <div class="battlefield-session-dock-copy">
        ${kicker ? `<span class="onboarding-session-dock-kicker">${kicker}</span>` : ''}
        <strong>${truncateLine(title, 88)}</strong>
        <p>${truncateLine(body, 220)}</p>
      </div>
      ${supportMarkup ? `<div class="battlefield-session-dock-support">${supportMarkup}</div>` : ''}
      ${footMarkup ? `<div class="onboarding-session-dock-foot">${footMarkup}</div>` : ''}
    </div>
  `;
}

function renderOnboardingSessionSurface({
  steps = [],
  trackItems = [],
  dockMarkup = '',
  className = '',
  accent = '',
} = {}) {
  const accentStyle = accent ? ` style="--onboarding-session-accent:${accent}"` : '';
  const safeClassName = className ? ` ${className}` : '';
  return `
    <section class="battlefield-session-surface onboarding-session-surface${safeClassName}"${accentStyle}>
      ${renderOnboardingSessionSpine(steps)}
      ${renderOnboardingSessionTrack(trackItems)}
      ${dockMarkup}
    </section>
  `;
}

function renderStartSessionBridgeMarkup({
  sourceScenario = scenario,
  factionId = null,
  snapshot = null,
  director = null,
  focus = '전장 전체',
  scene = '작전 개시',
  risk = '',
} = {}) {
  const hasFaction = !!factionId && !!sourceScenario?.factions?.[factionId];
  const effectiveSnapshot = hasFaction ? (snapshot || getFactionSnapshot(sourceScenario, factionId)) : null;
  const effectiveDirector = director || buildFactionDirectorPacket({ scenario: sourceScenario, factionId: hasFaction ? factionId : null });
  const focusLine = focus || effectiveDirector.focus || '전장 전체';
  const sceneLine = scene || effectiveDirector.scene || '작전 개시';
  const riskLine = risk || effectiveDirector.risk || '세력을 고르면 첫 1턴 우선순위가 여기 고정됩니다.';
  const bodyLine = hasFaction
    ? (effectiveDirector.action || effectiveDirector.objective || effectiveDirector.directive || effectiveSnapshot.meta.desc)
    : '깃발을 고르면 첫 거점, 첫 장면, 지금 리스크가 한 번에 잠깁니다.';

  const cards = [
    {
      label: '집중 거점',
      value: focusLine,
      detail: hasFaction
        ? `${effectiveSnapshot.faction.name}의 첫 압박 축`
        : '세력을 고르면 이 거점이 먼저 고정됩니다.',
    },
    {
      label: '첫 장면',
      value: sceneLine,
      detail: hasFaction
        ? '브리핑 진입 직후 여는 첫 결정 장면'
        : '선택 직후 첫 장면이 함께 결정됩니다.',
    },
    {
      label: '지금 리스크',
      value: riskLine,
      detail: hasFaction
        ? '출정 전에 마지막으로 읽을 압박선'
        : '비교 단계에서는 전체 전장의 위험을 먼저 읽습니다.',
    },
  ];

  return `
    <section
      class="start-session-brief"
      data-state="${hasFaction ? 'locked' : 'idle'}"
      style="--start-session-accent:${hasFaction ? (FACTION_UI_COLORS[factionId] || '#c19a55') : '#c19a55'}"
    >
      <div class="start-session-brief-head">
        <span class="start-session-brief-kicker">${hasFaction ? `${effectiveSnapshot.faction.name} 출정선` : '출정선 예고'}</span>
        <strong>${truncateLine(bodyLine, 96)}</strong>
      </div>
      <div class="start-session-brief-grid">
        ${cards.map((card) => `
          <article class="start-session-brief-card">
            <span>${card.label}</span>
            <strong>${truncateLine(card.value, 30)}</strong>
            <small>${truncateLine(card.detail, 56)}</small>
          </article>
        `).join('')}
      </div>
      <div class="start-session-ladder-card">
        <span class="battlefield-session-track-label">첫 3턴 압박</span>
        <div class="start-spotlight-ladder">
          ${renderStartSpotlightLadderMarkup(hasFaction ? factionId : null)}
        </div>
      </div>
    </section>
  `;
}

function buildStartOverviewStageData({
  sourceScenario = scenario,
  factionId = null,
  snapshot = null,
  director = null,
  focus = '전장 전체',
  scene = '작전 개시',
  risk = '',
} = {}) {
  if (!factionId || !sourceScenario?.factions?.[factionId]) {
    return [
      {
        label: '세력 비교',
        title: '빠른 보기에서 첫 약속을 훑습니다',
        body: '세력별 집중 거점, 첫 장면, 리스크를 같은 형식으로 바로 비교합니다.',
        state: 'active',
      },
      {
        label: '전장 약속',
        title: '선택한 세력의 3턴 약속을 잠급니다',
        body: '스포트라이트와 브리프가 같은 세력 기준으로 맞물립니다.',
        state: 'pending',
      },
      {
        label: '브리핑 진입',
        title: '세력 선택 화면으로 바로 넘깁니다',
        body: '전장 브리핑 열기를 누르면 같은 약속이 지도 위로 이어집니다.',
        state: 'pending',
      },
    ];
  }

  const effectiveSnapshot = snapshot || getFactionSnapshot(sourceScenario, factionId);
  const effectiveDirector = director || buildFactionDirectorPacket({ scenario: sourceScenario, factionId });
  return [
    {
      label: '지금 보는 깃발',
      title: `${effectiveSnapshot.faction.name} · ${effectiveSnapshot.meta.diffLabel}`,
      body: `${getFactionPlayCue(factionId)} · ${effectiveSnapshot.cities.length}성 · ${formatArmy(effectiveSnapshot.army)}`,
      state: 'done',
    },
    {
      label: '전장 약속',
      title: `${focus || effectiveDirector.focus || '전장 전체'} · ${scene || effectiveDirector.scene || '작전 개시'}`,
      body: truncateLine(risk || effectiveDirector.risk || getRiskLabel(factionId), 76),
      state: 'active',
    },
    {
      label: '다음 화면',
      title: `${effectiveSnapshot.faction.name} 브리핑 열기`,
      body: `${focus || effectiveDirector.focus || '전장 전체'} 기준 브리핑과 지도 프리뷰가 먼저 펼쳐집니다.`,
      state: 'pending',
    },
  ];
}

function buildFactionSelectionStageData({
  sourceScenario = scenario,
  factionId = null,
  snapshot = null,
  director = null,
  focus = '전장 전체',
} = {}) {
  if (!factionId || !sourceScenario?.factions?.[factionId]) {
    return [
      {
        label: '세력 선택',
        title: '좌측 카드에서 깃발을 고르십시오',
        body: '한 세력을 먼저 골라야 중앙 지도와 우측 브리프가 같은 약속으로 잠깁니다.',
        state: 'active',
      },
      {
        label: '지도 고정',
        title: '집중 거점과 첫 장면이 지도에 고정됩니다',
        body: '카드를 누르는 즉시 지도 오버레이와 3턴 track이 선택 세력 기준으로 바뀝니다.',
        state: 'pending',
      },
      {
        label: '출정 결정',
        title: '연출 기준과 출정 CTA가 열립니다',
        body: '선택 세력 기준으로 confirm CTA가 활성화됩니다.',
        state: 'pending',
      },
    ];
  }

  const effectiveSnapshot = snapshot || getFactionSnapshot(sourceScenario, factionId);
  const effectiveDirector = director || buildFactionDirectorPacket({ scenario: sourceScenario, factionId });
  return [
    {
      label: '세력 선택',
      title: `${effectiveSnapshot.faction.name} 선택됨`,
      body: `${effectiveSnapshot.meta.diffLabel} · ${getFactionPlayCue(factionId)}`,
      state: 'done',
    },
    {
      label: '지도 고정',
      title: `${focus || effectiveDirector.focus || '전장 전체'} · ${effectiveDirector.scene || '작전 개시'}`,
      body: truncateLine(effectiveDirector.action || effectiveDirector.objective || effectiveDirector.directive, 76),
      state: 'active',
    },
    {
      label: '출정 결정',
      title: `${getNarrativeModeLabel(selectedNarrativeMode)} 연출 · 출정`,
      body: `${effectiveSnapshot.faction.name} 기준으로 confirm CTA와 우측 도감이 마지막 확인 단계에 들어갑니다.`,
      state: 'ready',
    },
  ];
}

function renderStartSpotlightLadderMarkup(factionId) {
  if (!factionId) {
    return '<div class="start-spotlight-empty">세력을 고르면 첫 3턴 사다리가 여기에 표시됩니다.</div>';
  }
  const beats = [1, 2, 3].map((turn) => getOpeningActBeat(factionId, turn)).filter(Boolean);
  if (!beats.length) {
    return '<div class="start-spotlight-empty">세력을 고르면 첫 3턴 사다리가 여기에 표시됩니다.</div>';
  }

  return beats.map((beat, index) => `
    <article class="start-spotlight-step ${index === 0 ? 'is-active' : ''}">
      <span>턴 ${index + 1}</span>
      <strong>${beat.title || '시작 약속'}</strong>
      <p>${beat.action || beat.objective || ''}</p>
    </article>
  `).join('');
}

function renderStartScreenSpotlight(sourceScenario = scenario, factionId = null) {
  if (!sourceScenario) return;

  const overviewHeadline = document.getElementById('start-overview-headline');
  const overviewBody = document.getElementById('start-overview-body');
  const overviewTags = document.getElementById('start-overview-tags');
  const overviewSequenceTitle = document.getElementById('start-overview-sequence-title');
  const overviewSequenceBody = document.getElementById('start-overview-sequence-body');
  const overviewRoute = document.getElementById('start-overview-route');
  const launchTitle = document.getElementById('start-launch-title');
  const launchNote = document.getElementById('start-launch-note');
  const spotlightKicker = document.getElementById('start-spotlight-kicker');
  const spotlightTitle = document.getElementById('start-spotlight-title');
  const spotlightCopy = document.getElementById('start-spotlight-copy');
  const spotlightSeal = document.getElementById('start-spotlight-seal');
  const sessionBridge = document.getElementById('start-session-bridge');
  const factionStrip = document.getElementById('start-faction-strip');

  const availableFactions = getAvailableStartScreenFactions(sourceScenario);
  const fallbackFactionId = availableFactions[0] || null;
  const effectiveFactionId = availableFactions.includes(factionId)
    ? factionId
    : availableFactions.includes(startScreenSpotlightFactionId)
      ? startScreenSpotlightFactionId
      : fallbackFactionId;

  if (!effectiveFactionId) {
    applyFactionSurfaceTheme(null);
    const director = buildFactionDirectorPacket({ scenario: sourceScenario, factionId: null });
    if (overviewHeadline) overviewHeadline.textContent = director.headline || '세력 선택으로 첫 3턴 약속이 열립니다';
    if (overviewBody) overviewBody.textContent = director.directive || director.body || director.objective || '';
    if (overviewTags) {
      overviewTags.innerHTML = (director.tags || [])
        .slice(0, 4)
        .map((tag) => `<span>${tag}</span>`)
        .join('');
    }
    if (overviewSequenceTitle) overviewSequenceTitle.textContent = '세력 선택 뒤 곧바로 브리핑으로 들어갑니다';
    if (overviewSequenceBody) overviewSequenceBody.textContent = '빠른 보기에서 눈에 든 세력을 고르면 시작 브리프와 지도가 같은 세력 기준으로 맞춰집니다.';
    if (overviewRoute) {
      overviewRoute.innerHTML = buildBriefingStageMarkup(buildStartOverviewStageData({ sourceScenario, factionId: null }));
    }
    if (launchTitle) launchTitle.textContent = '지금 고른 세력으로 바로 브리핑에 들어갑니다';
    if (launchNote) launchNote.textContent = '깃발을 고르면 세력 선택 화면이 같은 전장 흐름으로 열립니다.';
    if (spotlightKicker) spotlightKicker.textContent = '전장 스포트라이트';
    if (spotlightTitle) spotlightTitle.textContent = '깃발을 고르면 첫 3턴 약속이 여기 고정됩니다';
    if (spotlightCopy) spotlightCopy.textContent = '빠른 보기 카드에 커서를 올리면 집중 거점, 첫 장면, 첫 리스크와 3턴 사다리가 즉시 비교됩니다.';
    if (spotlightSeal) spotlightSeal.textContent = '戰';
    if (sessionBridge) {
      sessionBridge.innerHTML = renderStartSessionBridgeMarkup({
        sourceScenario,
        factionId: null,
        director,
        focus: director.focus || '시나리오 전체',
        scene: director.scene || '작전 개시',
        risk: director.risk || '세력을 고르면 첫 1턴 우선순위가 여기 고정됩니다.',
      });
    }
    updateStartScreenLaunchButton(sourceScenario, null);
    factionStrip?.querySelectorAll('[data-faction-pick]').forEach((button) => {
      button.classList.remove('is-spotlight');
    });
    startScreenSpotlightFactionId = null;
    return;
  }

  startScreenSpotlightFactionId = effectiveFactionId;
  applyFactionSurfaceTheme(effectiveFactionId);
  const snapshot = getFactionSnapshot(sourceScenario, effectiveFactionId);
  const theme = getFactionSurfaceTheme(effectiveFactionId);
  const director = buildFactionDirectorPacket({ scenario: sourceScenario, factionId: effectiveFactionId });
  const title = director.startup?.title || director.headline || `${snapshot.faction.name}의 첫 3턴`;
  const body = director.directive || director.body || director.objective || snapshot.meta.desc;
  const actionLine = director.action || director.objective || director.directive || snapshot.meta.desc;
  const focusLine = director.focus || '전장 전체';
  const sceneLine = director.scene || '작전 개시';
  const riskLine = director.risk || getRiskLabel(effectiveFactionId);
  const tags = [
    snapshot.faction.name,
    snapshot.meta.diffLabel,
    `${snapshot.cities.length}성`,
    formatArmy(snapshot.army),
  ];

  if (overviewHeadline) overviewHeadline.textContent = director.headline || `${snapshot.faction.name}의 시작 약속`;
  if (overviewBody) overviewBody.textContent = body;
  if (overviewTags) {
    overviewTags.innerHTML = tags
      .slice(0, 4)
      .map((tag) => `<span>${tag}</span>`)
      .join('');
  }
  if (overviewSequenceTitle) overviewSequenceTitle.textContent = `${snapshot.faction.name} 세력을 고르면 지도와 브리프가 같은 흐름으로 이어집니다`;
  if (overviewSequenceBody) overviewSequenceBody.textContent = director.directive || `${focusLine} 기준으로 전장 브리프와 세력 판단이 함께 맞춰집니다.`;
  if (overviewRoute) {
    overviewRoute.innerHTML = buildBriefingStageMarkup(buildStartOverviewStageData({
      sourceScenario,
      factionId: effectiveFactionId,
      snapshot,
      director,
      focus: focusLine,
      scene: sceneLine,
      risk: riskLine,
    }));
  }
  if (launchTitle) launchTitle.textContent = `${snapshot.faction.name} 브리핑으로 바로 들어갈 수 있습니다`;
  if (launchNote) launchNote.textContent = `${focusLine} · ${sceneLine} 기준으로 세력 선택 화면이 열립니다.`;

  if (spotlightKicker) spotlightKicker.textContent = `${snapshot.faction.name} 스포트라이트 · ${theme.warRoomKicker}`;
  if (spotlightTitle) spotlightTitle.textContent = title;
  if (spotlightCopy) spotlightCopy.textContent = actionLine;
  if (spotlightSeal) spotlightSeal.textContent = getFactionSealLabel(effectiveFactionId);
  if (sessionBridge) {
    sessionBridge.innerHTML = renderStartSessionBridgeMarkup({
      sourceScenario,
      factionId: effectiveFactionId,
      snapshot,
      director,
      focus: focusLine,
      scene: sceneLine,
      risk: riskLine,
    });
  }
  updateStartScreenLaunchButton(sourceScenario, effectiveFactionId);

  factionStrip?.querySelectorAll('[data-faction-pick]').forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    button.classList.toggle('is-spotlight', button.dataset.factionPick === effectiveFactionId);
  });
}

function buildStartFactionPickMarkup(sourceScenario, factionId) {
  const snapshot = getFactionSnapshot(sourceScenario, factionId);
  const theme = getFactionSurfaceTheme(factionId);
  const director = buildFactionDirectorPacket({ scenario: sourceScenario, factionId });
  const openingBeat = getOpeningActBeat(factionId, 1);
  const focusCity = director.focus || getScenarioCityName(sourceScenario, openingBeat?.focusCityId) || '전장 전체';
  const title = director.startup?.title || openingBeat?.title || director.headline;
  const scene = director.scene || '작전 개시';
  const body = director.risk || director.action || openingBeat?.action || director.directive || director.body;
  const risk = director.risk || getRiskLabel(factionId);
  const color = FACTION_UI_COLORS[factionId] || '#c19a55';

  return `
    <button
      type="button"
      class="start-faction-pick"
      data-faction-pick="${factionId}"
      data-tone="${factionId}"
      style="--start-faction-accent:${color}"
    >
      <div class="start-faction-pick-head">
        <span class="start-faction-pick-kicker">${snapshot.meta.diffLabel} · ${theme.warRoomKicker}</span>
        <div class="start-faction-pick-meta">
          <span>${focusCity}</span>
          <span>${scene}</span>
        </div>
      </div>
      <strong class="start-faction-pick-name">${snapshot.faction.name}</strong>
      <span class="start-faction-pick-title">${title}</span>
      <p class="start-faction-pick-body">${truncateLine(body, 72)}</p>
      <div class="start-faction-pick-route">
        <span>집중 거점 ${focusCity}</span>
        <span>${truncateLine(risk, 36)}</span>
      </div>
    </button>
  `;
}

function renderStartScreenSurface(sourceScenario = scenario) {
  if (!sourceScenario) return;

  const summaryFactions = document.getElementById('start-summary-factions');
  const summaryCities = document.getElementById('start-summary-cities');
  const summaryCharacters = document.getElementById('start-summary-characters');
  const summaryConnections = document.getElementById('start-summary-connections');
  const factionStrip = document.getElementById('start-faction-strip');

  if (summaryFactions) summaryFactions.textContent = `${Object.keys(sourceScenario.factions || {}).length}`;
  if (summaryCities) summaryCities.textContent = `${Object.keys(sourceScenario.cities || {}).length}`;
  if (summaryCharacters) summaryCharacters.textContent = `${Object.keys(sourceScenario.characters || {}).length}+`;
  if (summaryConnections) summaryConnections.textContent = `${(sourceScenario.connections || []).length}`;

  if (factionStrip) {
    factionStrip.innerHTML = START_SCREEN_FACTION_ORDER
      .filter((factionId) => sourceScenario.factions?.[factionId])
      .map((factionId) => buildStartFactionPickMarkup(sourceScenario, factionId))
      .join('');
  }

  renderStartScreenSpotlight(sourceScenario, startScreenSpotlightFactionId);
}

async function warmStartScreenSurface() {
  try {
    const loadedScenario = await ensureScenarioLoaded();
    renderStartScreenSurface(loadedScenario);
  } catch (err) {
    console.error('Failed to warm start screen surface:', err);
  }
}

function getOpeningFocusCity(factionId, sourceState = state, sourceScenario = scenario) {
  const scriptedCityId = OPENING_ACT[factionId]?.focusCityId;
  const scriptedCity = (sourceState?.cities?.[scriptedCityId] || sourceScenario?.cities?.[scriptedCityId])
    ? {
        id: scriptedCityId,
        ...(sourceState?.cities?.[scriptedCityId] || sourceScenario?.cities?.[scriptedCityId]),
      }
    : null;
  if (scriptedCity) return scriptedCity;

  const citySource = sourceState?.cities || sourceScenario?.cities || {};
  const connectionSource = sourceScenario?.connections || [];
  const cities = Object.entries(citySource)
    .filter(([, city]) => city.owner === factionId)
    .map(([id, city]) => ({ id, ...city }));

  if (!cities.length) return null;

  return cities
    .map((city) => {
      const neighbors = connectionSource.reduce((list, [a, b]) => {
        if (a === city.id) list.push(b);
        else if (b === city.id) list.push(a);
        return list;
      }, []);
      const enemyFronts = neighbors.filter((neighborId) => citySource[neighborId]?.owner && citySource[neighborId]?.owner !== factionId).length;
      const friendlyLinks = neighbors.filter((neighborId) => citySource[neighborId]?.owner === factionId).length;
      return { ...city, enemyFronts, friendlyLinks };
    })
    .sort((a, b) => (
      b.enemyFronts - a.enemyFronts
      || (b.strategic_importance || 0) - (a.strategic_importance || 0)
      || b.army - a.army
      || a.friendlyLinks - b.friendlyLinks
    ))[0];
}

function isOpeningActActive(turn = state?.turn || 1) {
  return !!(state?.player?.factionId && turn <= 3);
}

function getOpeningActPayload(turn = state?.turn || 1, factionId = state?.player?.factionId || selectedFaction) {
  if (!factionId) return null;
  return getOpeningActBeat(factionId, turn);
}

function isShortViewport() {
  return document.documentElement.dataset.viewportHeightTier === 'short';
}

function getRiskLabel(factionId) {
  switch (factionId) {
    case 'wei':
      return '남하 전선이 넓어 병참과 수전 적응이 동시에 흔들릴 수 있음';
    case 'shu':
      return '조조의 첫 파도와 약한 형주 전선이 동시에 압박함';
    case 'wu':
      return '항복론과 결전론 사이에서 방어 준비가 늦어질 수 있음';
    case 'liu_zhang':
      return '익주의 안전지대에 안주하면 외부 침투에 늦게 반응함';
    case 'zhang_lu':
      return '병력 손실 한 번이 바로 멸망 압박으로 이어짐';
    default:
      return '주도권보다 생존과 병참을 먼저 점검해야 함';
  }
}

function getRecommendedActionText(factionId, focusedCity, owned = true) {
  const beat = getOpeningActPayload(state?.turn || 1, factionId);
  if (beat?.action && owned) return beat.action;
  if (!owned && focusedCity) return `${focusedCity.name}의 전황을 읽고 외교·군사 탭으로 압박을 확인하세요.`;
  const cityName = focusedCity?.name || '핵심 거점';
  switch (factionId) {
    case 'wei':
      return `${cityName}에서 군사 장면을 열고 적 인접 도시 압박부터 시작하세요.`;
    case 'shu':
      return `${cityName}에서 시정 장면을 열어 방비나 치안을 먼저 올리세요.`;
    case 'wu':
      return `${cityName}에서 군사 장면으로 방어선과 보급 여력을 먼저 확인하세요.`;
    case 'liu_zhang':
      return `${cityName}에서 시정 장면을 열고 건설·방비를 먼저 누적하세요.`;
    case 'zhang_lu':
      return `${cityName}에서 방어 준비와 병력 보존 중심으로 첫 행동을 결정하세요.`;
    default:
      return `${cityName}에서 첫 명령을 열어 상황을 정리하세요.`;
  }
}

function getBriefingPayload({ factionId, selectedCityId = null } = {}) {
  const effectiveFactionId = factionId || state?.player?.factionId || selectedFaction;
  if (!effectiveFactionId) return null;
  const openingBeat = getOpeningActPayload(state?.turn || 1, effectiveFactionId);

  const focusedCity = selectedCityId && state?.cities?.[selectedCityId]
    ? { id: selectedCityId, ...state.cities[selectedCityId] }
    : getOpeningFocusCity(effectiveFactionId);
  const faction = state?.factions?.[effectiveFactionId] || scenario?.factions?.[effectiveFactionId];
  const city = selectedCityId ? state?.cities?.[selectedCityId] : null;
  const isOwnedSelection = !city || city.owner === effectiveFactionId;
  const objective = openingBeat?.objective || (OPENING_OBJECTIVES[effectiveFactionId] || [])[0] || '첫 거점의 전황을 읽고 명령을 시작하세요.';

  return {
    factionName: faction?.name || effectiveFactionId,
    objective,
    action: openingBeat?.action || getRecommendedActionText(effectiveFactionId, focusedCity, isOwnedSelection),
    focus: focusedCity?.name || '전장 전체',
    risk: openingBeat?.risk || getRiskLabel(effectiveFactionId),
    selectedCity: city,
    openingBeat,
  };
}

function updateWarRoomBrief() {
  const payload = getBriefingPayload({ selectedCityId: map?.selectedCity || null });
  if (!payload) return;
  const theme = getSurfaceTheme(state?.player?.factionId);
  const compact = isShortViewport();
  const panel = document.getElementById('war-room-brief');
  const gridEl = document.getElementById('war-room-grid');
  const sessionTrackEl = document.getElementById('war-room-session-track');
  const sessionBudgetEl = document.getElementById('war-room-session-budget');
  if (
    !panel
    || !gridEl
    || !sessionTrackEl
    || !sessionBudgetEl
  ) return;
  const selection = payload.selectedCity ? getCitySelectionProfile(payload.selectedCity.id || map?.selectedCity) : null;
  const director = buildBattlefieldDirectorPacket({
    state,
    scenario,
    cityId: map?.selectedCity || null,
  });
  const frame = buildBattlefieldSessionFrame(map?.selectedCity || null);

  const title = compact && payload.selectedCity
    ? director.title
    : payload.selectedCity
    ? director.title
    : director.title || payload.openingBeat?.title || `${payload.factionName}의 첫 10분 동선을 제시합니다`;
  const objective = payload.selectedCity
    ? director.objective || selection?.fieldBody || selection?.action || payload.action
    : director.objective || payload.objective;
  const compactObjective = payload.selectedCity
    ? director.action || selection?.action || payload.action
    : director.action || `${payload.focus} · ${payload.action}`;

  document.getElementById('war-room-title').textContent = title;
  document.getElementById('war-room-objective').textContent = compact ? compactObjective : objective;
  gridEl.innerHTML = renderBattlefieldWarRoomHub(frame);
  sessionTrackEl.innerHTML = renderBattlefieldSessionSpine(frame.steps || [], {
    layout: 'strip',
    density: payload.selectedCity || compact ? 'compact' : 'regular',
  });
  sessionBudgetEl.innerHTML = renderWarRoomSessionBudget(frame);
  document.getElementById('war-room-kicker').textContent =
    uiState.openingActActive && payload.openingBeat
      ? `오프닝 액트 ${Math.min(state.turn, 3)} · ${theme.openingHudKicker}`
      : payload.selectedCity ? theme.cityLockedKicker : theme.warRoomKicker;
  panel.dataset.layout = payload.selectedCity ? 'session' : compact ? 'compact' : 'full';
  panel.dataset.context = payload.selectedCity ? 'selection' : 'overview';
  panel.dataset.tone = selection?.panelTone || 'overview';
}

function getFrontlineOverlaySummary() {
  if (!state?.player?.factionId || !scenario?.connections?.length) {
    return {
      playerCities: 0,
      hostileCities: 0,
      totalEdges: 0,
    };
  }

  const playerCities = new Set();
  const hostileCities = new Set();
  let totalEdges = 0;

  for (const [cityAId, cityBId] of scenario.connections) {
    const cityA = state.cities?.[cityAId];
    const cityB = state.cities?.[cityBId];
    if (!cityA || !cityB || !cityA.owner || !cityB.owner) continue;
    if (cityA.owner === cityB.owner) continue;

    const atWar = state.isAtWar(cityA.owner, cityB.owner);
    const playerEdge = cityA.owner === state.player.factionId || cityB.owner === state.player.factionId;
    if (!atWar && !playerEdge) continue;

    totalEdges += 1;
    if (cityA.owner === state.player.factionId) playerCities.add(cityAId);
    else hostileCities.add(cityAId);
    if (cityB.owner === state.player.factionId) playerCities.add(cityBId);
    else hostileCities.add(cityBId);
  }

  return {
    playerCities: playerCities.size,
    hostileCities: hostileCities.size,
    totalEdges,
  };
}

function getPrioritizedFrontlineCities(limit = 4) {
  if (!state?.player?.factionId || !scenario?.connections?.length) return [];

  const cityScores = new Map();

  for (const [cityAId, cityBId] of scenario.connections) {
    const cityA = state.cities?.[cityAId];
    const cityB = state.cities?.[cityBId];
    if (!cityA || !cityB || !cityA.owner || !cityB.owner) continue;
    if (cityA.owner === cityB.owner) continue;

    const atWar = state.isAtWar(cityA.owner, cityB.owner);
    const playerEdge = cityA.owner === state.player.factionId || cityB.owner === state.player.factionId;
    if (!atWar && !playerEdge) continue;

    const register = (cityId) => {
      const city = state.cities?.[cityId];
      if (!city) return;
      const tacticalStrip = buildSelectionTacticalStrip(cityId);
      const frontLine = tacticalStrip.find((item) => item.label === '전선');
      const enemyNeighbors = getNeighborCities(cityId).filter((neighborId) => {
        const neighborOwner = state.cities?.[neighborId]?.owner;
        return neighborOwner && neighborOwner !== city.owner;
      }).length;
      const owned = city.owner === state.player.factionId;
      const current = cityScores.get(cityId) || {
        cityId,
        city,
        owned,
        frontLine,
        enemyNeighbors,
        score: 0,
      };
      current.score += (owned ? 100 : 40) + (enemyNeighbors * 18) + ((city.strategic_importance || 0) * 6) + Math.min(city.army / 1000, 18);
      current.frontLine = frontLine;
      current.enemyNeighbors = enemyNeighbors;
      cityScores.set(cityId, current);
    };

    register(cityAId);
    register(cityBId);
  }

  return [...cityScores.values()]
    .sort((a, b) => b.score - a.score || (b.city.strategic_importance || 0) - (a.city.strategic_importance || 0) || b.city.army - a.city.army)
    .slice(0, limit);
}

function cycleFrontlineCity(step = 1) {
  const cities = getPrioritizedFrontlineCities();
  if (!cities.length) return false;
  const currentIndex = cities.findIndex((entry) => entry.cityId === map?.selectedCity);
  const fallbackIndex = step < 0 ? cities.length - 1 : 0;
  const nextIndex = currentIndex >= 0
    ? (currentIndex + step + cities.length) % cities.length
    : fallbackIndex;
  return selectCityById(cities[nextIndex].cityId);
}

function getFrontlineOverlayCopy(cities = getPrioritizedFrontlineCities()) {
  const active = uiState.mapOverlayMode === 'frontline';
  const summary = getFrontlineOverlaySummary();
  const spotlightCityId = uiState.frontlinePreviewCityId
    || (cities.some((entry) => entry.cityId === map?.selectedCity) ? map?.selectedCity : null);
  if (spotlightCityId && state?.cities?.[spotlightCityId]) {
    const city = state.cities[spotlightCityId];
    const selection = getCitySelectionProfile(spotlightCityId);
    const frontLine = selection.tacticalStrip?.find((item) => item.label === '전선')?.value || '전선 정보 확인';
    return {
      title: `${city.name} · ${selection.kicker}`,
      body: `${selection.ownerLine} · ${frontLine}. ${selection.fieldBody}`,
    };
  }
  return {
    title: active
      ? '접경 거점과 지원로를 강조하고 있습니다.'
      : '후방을 걷고 접경선만 골라 볼 수 있습니다.',
    body: summary.totalEdges > 0
      ? `아군 접경 ${summary.playerCities}성 · 외부 전선 ${summary.hostileCities}성 · 교전선 ${summary.totalEdges}개`
      : '아직 강조할 전선이 없습니다.',
  };
}

function updateFrontlineOverlayCopy(cities = getPrioritizedFrontlineCities()) {
  const titleEl = document.getElementById('war-room-overlay-title');
  const bodyEl = document.getElementById('war-room-overlay-body');
  if (!titleEl || !bodyEl) return;
  const copy = getFrontlineOverlayCopy(cities);
  titleEl.textContent = copy.title;
  bodyEl.textContent = copy.body;
}

function updateMapOverlayControls() {
  const button = document.getElementById('btn-toggle-frontline-overlay');
  const prevButton = document.getElementById('btn-frontline-prev');
  const nextButton = document.getElementById('btn-frontline-next');
  const stripEl = document.getElementById('war-room-frontline-strip');
  const panel = document.getElementById('war-room-brief');
  if (!button || !prevButton || !nextButton || !stripEl || !panel) return;

  const active = uiState.mapOverlayMode === 'frontline';
  const cities = getPrioritizedFrontlineCities();
  panel.dataset.overlay = active ? 'frontline' : 'default';
  updateFrontlineOverlayCopy(cities);
  stripEl.innerHTML = cities.length
    ? cities.map((entry) => {
      const tone = entry.owned ? 'own' : 'hostile';
      const activeChip = entry.cityId === map?.selectedCity;
      const meta = entry.frontLine?.value || '전선';
      return `
        <button class="war-room-frontline-chip" type="button" data-city-id="${entry.cityId}" data-tone="${tone}" title="${entry.city.name} · ${meta} · 병력 ${formatArmy(entry.city.army)} · 올리면 정찰, 누르면 집중" ${activeChip ? 'data-active="true"' : ''}>
          <span class="war-room-frontline-city">${entry.city.name}</span>
          <span class="war-room-frontline-meta">${meta} · 병력 ${formatArmy(entry.city.army)}</span>
        </button>
      `;
    }).join('')
    : '<span class="war-room-frontline-empty">표시할 접경 거점이 없습니다.</span>';
  button.innerHTML = renderOverlayToggleLabel(active ? '전선 시야 중' : '전선 시야', 'V');
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
  button.title = active
    ? '후방을 걷고 접경 거점과 지원로를 강조합니다.'
    : '전선 시야를 켜고 접경 거점과 지원로를 강조합니다.';
  prevButton.disabled = !cities.length;
  nextButton.disabled = !cities.length;
  prevButton.title = cities.length ? '이전 접경 거점으로 이동합니다. 단축키 ←' : '이동할 접경 거점이 없습니다.';
  nextButton.title = cities.length ? '다음 접경 거점으로 이동합니다. 단축키 →' : '이동할 접경 거점이 없습니다.';
}

function setMapOverlayMode(mode = 'default') {
  uiState.mapOverlayMode = mode === 'frontline' ? 'frontline' : 'default';
  map?.setOverlayMode(uiState.mapOverlayMode);
  updateMapOverlayControls();
  updateMapSelectionPanel();
  updateCitySessionBoard();
  if (map && state) map.render(state);
}

function toggleMapOverlayMode() {
  setMapOverlayMode(uiState.mapOverlayMode === 'frontline' ? 'default' : 'frontline');
}

function updateOpeningHudBrief() {
  const container = document.getElementById('opening-hud-brief');
  if (!container) return;
  if (!uiState.openingActActive || !state?.player?.factionId || map?.selectedCity || actionPanel?.isOpen?.()) {
    container.classList.add('hidden');
    return;
  }
  const beat = getOpeningActPayload(state.turn, state.player.factionId);
  const theme = getSurfaceTheme(state.player.factionId);
  document.getElementById('opening-hud-kicker').textContent = `오프닝 액트 ${Math.min(state.turn, 3)} · ${theme.openingHudKicker}`;
  document.getElementById('opening-hud-title').textContent = beat?.title || beat?.action || '첫 목표를 진행하십시오';
  container.classList.remove('hidden');
}

function updateIntroGuidance(factionId) {
  const box = document.getElementById('intro-guidance');
  if (!box || !scenario) return;
  const focusCity = getOpeningFocusCity(factionId, null, scenario);
  const beat1 = getOpeningActBeat(factionId, 1);

  box.innerHTML = `
    <div class="intro-guidance-card">
      <span class="intro-guidance-label">첫 압박</span>
      <strong>${beat1?.title || (OPENING_OBJECTIVES[factionId] || [])[0] || '첫 목표를 설정하십시오.'}</strong>
      <small>${beat1?.action || getRecommendedActionText(factionId, focusCity, true)}</small>
    </div>
  `;
}

async function showTurnSpotlight({ kicker, title, body, tone = 'neutral', eventKind = 'summary', duration = 1800 }) {
  const panel = document.getElementById('turn-cinematic');
  if (!panel) return;
  panel.dataset.tone = tone;
  panel.dataset.eventKind = eventKind;
  document.getElementById('turn-cinematic-kicker').textContent = kicker;
  document.getElementById('turn-cinematic-title').textContent = title;
  document.getElementById('turn-cinematic-body').textContent = body;
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('visible'));
  clearTimeout(uiState.turnSpotlightTimer);
  await sleep(duration);
  panel.classList.remove('visible');
  await sleep(260);
  panel.classList.add('hidden');
}

function hideTurnSpotlight({ immediate = false } = {}) {
  const panel = document.getElementById('turn-cinematic');
  if (!panel) return;
  panel.classList.remove('visible');
  if (immediate) {
    panel.classList.add('hidden');
    return;
  }
  setTimeout(() => panel.classList.add('hidden'), 260);
}

function hideTurnBridgeCard({ immediate = false } = {}) {
  const panel = document.getElementById('turn-bridge-card');
  if (!panel) return;
  clearTimeout(uiState.turnBridgeTimer);
  panel.classList.remove('visible');
  if (immediate) {
    panel.classList.add('hidden');
    return;
  }
  setTimeout(() => panel.classList.add('hidden'), 220);
}

async function showTurnBridgeCard({ kicker, title, body, tone = 'neutral' } = {}) {
  const panel = document.getElementById('turn-bridge-card');
  if (!panel || !title) return;
  const theme = getSurfaceTheme(state?.player?.factionId);
  panel.dataset.tone = tone;
  document.getElementById('turn-bridge-kicker').textContent = kicker || theme.bridgeKicker;
  document.getElementById('turn-bridge-title').textContent = title;
  document.getElementById('turn-bridge-body').textContent = body || '';
  const stripEl = document.getElementById('turn-bridge-strip');
  if (stripEl) stripEl.innerHTML = renderTurnSceneStrip(buildTurnSceneCards({ mode: 'bridge' }), { context: 'bridge' });
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('visible'));
  clearTimeout(uiState.turnBridgeTimer);
  await sleep(1100);
  panel.classList.remove('visible');
  await sleep(220);
  panel.classList.add('hidden');
}

function shortenReactionBody(text = '') {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  const sentence = compact.split(/(?<=[.!?])\s+/)[0];
  return sentence.length > 96 ? `${sentence.slice(0, 93).trim()}...` : sentence;
}

function hideTurnStartCard({ immediate = false } = {}) {
  const panel = document.getElementById('turn-start-card');
  if (!panel) return;
  clearTimeout(uiState.turnStartTimer);
  panel.classList.remove('visible');
  if (immediate) {
    panel.classList.add('hidden');
    return;
  }
  setTimeout(() => panel.classList.add('hidden'), 220);
}

function showTurnStartCard(turn = state?.turn || 1) {
  if (!uiState.openingActActive || !state?.player?.factionId || turn <= 1) {
    hideTurnStartCard({ immediate: true });
    return;
  }

  const beat = getOpeningActPayload(turn, state.player.factionId);
  if (!beat) {
    hideTurnStartCard({ immediate: true });
    return;
  }

  const panel = document.getElementById('turn-start-card');
  if (!panel) return;
  const theme = getSurfaceTheme(state.player.factionId);
  panel.dataset.tone = beat.preferredScene || 'opening';

  document.getElementById('turn-start-kicker').textContent = `오프닝 액트 ${turn} · ${theme.openingHudKicker}`;
  document.getElementById('turn-start-title').textContent = beat.title || '다음 판단을 정리하십시오';
  document.getElementById('turn-start-body').textContent = `${beat.objective || beat.action || '핵심 거점을 먼저 확인하십시오.'} ${beat.action || ''}`.trim();
  const stripEl = document.getElementById('turn-start-strip');
  if (stripEl) stripEl.innerHTML = renderTurnSceneStrip(buildTurnSceneCards({ mode: 'start' }), { context: 'start' });
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('visible'));
  clearTimeout(uiState.turnStartTimer);
  uiState.turnStartTimer = setTimeout(() => {
    panel.classList.remove('visible');
    setTimeout(() => panel.classList.add('hidden'), 220);
  }, 2400);
}

function hideActionResultBanner({ immediate = false } = {}) {
  const panel = document.getElementById('action-result-banner');
  if (!panel) return;
  clearTimeout(uiState.actionResultTimer);
  panel.classList.remove('visible');
  if (immediate) {
    panel.classList.add('hidden');
    return;
  }
  setTimeout(() => panel.classList.add('hidden'), 220);
}

function showActionResultBanner(result) {
  if (!result?.title) {
    hideActionResultBanner({ immediate: true });
    return;
  }
  const toneKickers = {
    victory: '전과 보고',
    warning: '전황 경고',
    diplomacy: '외교 속보',
    growth: '내정 결산',
    military: '군령 보고',
    fortify: '성방 보고',
    neutral: '명령 결과',
  };
  const panel = document.getElementById('action-result-banner');
  if (!panel) return;
  panel.dataset.tone = result.tone || 'neutral';
  document.getElementById('action-result-kicker').textContent = result.kicker || toneKickers[result.tone] || '명령 결과';
  document.getElementById('action-result-title').textContent = result.title;
  document.getElementById('action-result-body').textContent = result.body || '';
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('visible'));
  clearTimeout(uiState.actionResultTimer);
  uiState.actionResultTimer = setTimeout(() => {
    panel.classList.remove('visible');
    setTimeout(() => panel.classList.add('hidden'), 220);
  }, 2200);
}

function getCitySelectionProfile(cityId) {
  const city = state?.cities?.[cityId];
  if (!city) {
    return {
      tone: 'selection',
      panelTone: 'own',
      kicker: '현장 포착',
      title: '전황을 펼칩니다',
      ownerLine: '도시를 클릭해 전황과 명령을 확인하세요',
      action: '도시를 선택하세요',
      scene: '-',
      buttonLabel: '명령 열기',
      tacticalStrip: [],
      fieldBody: '',
    };
  }

  const faction = city.owner ? state.factions?.[city.owner] : null;
  const tacticalStrip = buildSelectionTacticalStrip(cityId);
  if (city.owner === state?.player?.factionId) {
    return {
      tone: 'selection',
      panelTone: 'own',
      kicker: '거점 보고',
      title: `${city.name} 거점 장부를 엽니다`,
      ownerLine: `${faction?.name || '아군'} · 병력 ${city.army.toLocaleString()} · 사기 ${city.morale}`,
      action: `${city.name}에서 이번 턴 운영 축을 먼저 잠그고 방비나 병참을 확정하십시오.`,
      scene: '시정/군사 장면',
      buttonLabel: `${city.name} 명령 축 잠그기`,
      tacticalStrip,
      fieldBody: '아군 거점입니다. 지금은 버티는 축을 잠그는 편이 가장 싸게 먹힙니다.',
    };
  }

  if (!city.owner) {
    return {
      tone: 'opportunity',
      panelTone: 'neutral',
      kicker: '점령 관측',
      title: `${city.name} 점령 각을 살핍니다`,
      ownerLine: `무주지 · 병력 ${city.army.toLocaleString()} · 사기 ${city.morale}`,
      action: `${city.name}의 병력과 인접 거점을 읽고 선점 시점을 먼저 고르십시오.`,
      scene: '군사 장면',
      buttonLabel: `${city.name} 선점 검토`,
      tacticalStrip,
      fieldBody: '비어 있는 거점입니다. 선점만 성공해도 다음 전선의 발판이 바로 열린다.',
    };
  }

  return {
    tone: 'hostile',
    panelTone: 'hostile',
    kicker: '적정 관측',
    title: `${city.name} 전황을 살핍니다`,
    ownerLine: `${faction?.name || '적 세력'} · 병력 ${city.army.toLocaleString()} · 사기 ${city.morale}`,
    action: `${city.name}에서는 공격, 봉쇄, 외교 압박 가운데 하나를 먼저 고르십시오.`,
    scene: '군사/외교 장면',
    buttonLabel: `${city.name} 대응 고르기`,
    tacticalStrip,
    fieldBody: '적 거점입니다. 방어선을 흔들지, 길목을 막을지, 외교로 압박할지 먼저 정해야 합니다.',
  };
}

function buildSelectionTacticalStrip(cityId) {
  const city = state?.cities?.[cityId];
  if (!city) return [];

  const neighbors = getNeighborCities(cityId);
  const enemyNeighbors = neighbors.filter((neighborId) => {
    const owner = state?.cities?.[neighborId]?.owner;
    return owner && owner !== state.player.factionId;
  }).length;
  const friendlyNeighbors = neighbors.filter((neighborId) => state?.cities?.[neighborId]?.owner === state.player.factionId).length;
  const openNeighbors = neighbors.filter((neighborId) => !state?.cities?.[neighborId]?.owner).length;
  const defense = Number(city.defense) || 0;
  const terrain = city.terrain?.type || city.terrain || 'plains';

  let frontLabel = '후방';
  let frontTone = 'rear';
  if (enemyNeighbors >= 2) {
    frontLabel = `격전 ${enemyNeighbors}면`;
    frontTone = 'hot';
  } else if (enemyNeighbors === 1) {
    frontLabel = '접경 1면';
    frontTone = 'front';
  } else if (openNeighbors > 0) {
    frontLabel = `공백 ${openNeighbors}면`;
    frontTone = 'open';
  } else if (friendlyNeighbors > 1) {
    frontLabel = `배후 ${friendlyNeighbors}선`;
  }

  let defenseTone = 'steady';
  if (defense >= 75) defenseTone = 'fortified';
  else if (defense <= 35) defenseTone = 'weak';

  return [
    { label: '지형', value: mapTerrainLabel(terrain), tone: terrain },
    { label: '전선', value: frontLabel, tone: frontTone },
    { label: '성방', value: `${defense}`, tone: defenseTone },
  ];
}

function mapTerrainLabel(terrain) {
  return {
    plains: '평야',
    river: '강안',
    mountain: '산지',
    forest: '산림',
    wetland: '습지',
    land: '육상',
  }[terrain] || '평야';
}

function getSelectionPulseColor(tone = 'selection') {
  return {
    selection: '#e4c87e',
    hostile: '#cf7b61',
    opportunity: '#87b36f',
    victory: '#d4b85c',
    warning: '#c26e56',
    diplomacy: '#8e7ad4',
    growth: '#68a76f',
    military: '#ae765e',
    fortify: '#6f92b6',
    neutral: '#d8c29b',
  }[tone] || '#d8c29b';
}

function hideFieldReaction({ immediate = false } = {}) {
  const panel = document.getElementById('field-reaction-banner');
  if (!panel) return;
  clearTimeout(uiState.fieldReactionTimer);
  panel.classList.remove('visible');
  if (immediate) {
    panel.classList.add('hidden');
    return;
  }
  setTimeout(() => panel.classList.add('hidden'), 180);
}

function showFieldReaction({ kicker = '현장 반응', title, body = '', tone = 'neutral' } = {}) {
  if (!title) {
    hideFieldReaction({ immediate: true });
    return;
  }
  const panel = document.getElementById('field-reaction-banner');
  const bodyEl = document.getElementById('field-reaction-body');
  if (!panel) return;
  const compact = tone === 'selection';
  panel.dataset.tone = tone;
  panel.dataset.compact = compact ? 'true' : 'false';
  document.getElementById('field-reaction-kicker').textContent = kicker;
  document.getElementById('field-reaction-title').textContent = title;
  if (bodyEl) {
    const reactionBody = compact ? '' : shortenReactionBody(body);
    bodyEl.textContent = reactionBody;
    bodyEl.classList.toggle('hidden', !reactionBody);
  }
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('visible'));
  clearTimeout(uiState.fieldReactionTimer);
  uiState.fieldReactionTimer = setTimeout(() => {
    panel.classList.remove('visible');
    setTimeout(() => panel.classList.add('hidden'), 180);
  }, compact ? 1200 : 1600);
}

function buildTurnSpotlightSummary() {
  const summary = state?.turnSummary;
  const playerFactionId = state?.player?.factionId;
  if (!summary || !playerFactionId) return null;

  const captures = summary.citiesCaptured || [];
  const playerCapture = captures.find((item) => item.toFaction === playerFactionId);
  const lostCity = captures.find((item) => item.fromFaction === playerFactionId);
  const tech = (summary.techCompleted || [])[0];
  const build = (summary.buildingsCompleted || [])[0];
  const drama = (summary.relationshipChanges || [])[0];
  const brief = getBriefingPayload();
  const beat = getOpeningActPayload(Math.max(1, (state?.turn || 1) - 1), playerFactionId);
  const nextBeat = getOpeningActPayload(state?.turn || 1, playerFactionId);
  const nextCue = nextBeat?.action ? `다음 턴 지시: ${nextBeat.action}` : null;

  if (playerCapture) {
    return {
      kicker: uiState.openingActActive && beat ? `오프닝 액트 ${Math.max(1, state.turn - 1)} 성과` : `${state.year}년 ${state.month}월 전황`,
      title: `${playerCapture.cityName}을(를) 움켜쥐었습니다`,
      body: `${beat?.victoryCue || brief?.action || '다음 거점을 정하고 압박을 이어가세요.'}${nextCue ? ` ${nextCue}` : ''}`,
      tone: 'victory',
      eventKind: 'capture',
    };
  }
  if (lostCity) {
    return {
      kicker: uiState.openingActActive && beat ? `오프닝 액트 ${Math.max(1, state.turn - 1)} 경고` : `${state.year}년 ${state.month}월 전황`,
      title: `${lostCity.cityName} 전선이 무너지고 있습니다`,
      body: `${beat?.risk || `${brief?.focus || '핵심 거점'}을 중심으로 방어선과 병참을 재정비해야 합니다.`}${nextCue ? ` ${nextCue}` : ''}`,
      tone: 'warning',
      eventKind: 'loss',
    };
  }
  if (tech) {
    return {
      kicker: '기술 결산',
      title: `${tech.techName || '연구'}가 완료되었습니다`,
      body: '이제 장면 전환 없이 다음 명령에서 연구 효과를 바로 체감할 수 있습니다.',
      tone: 'growth',
      eventKind: 'tech',
    };
  }
  if (build) {
    return {
      kicker: '건설 결산',
      title: `${build.cityName || '도시'}의 공사가 완료되었습니다`,
      body: `${brief?.focus || '핵심 거점'}의 다음 행동 우선순위를 다시 조정하십시오.`,
      tone: 'fortify',
      eventKind: 'build',
    };
  }
  if (drama) {
    return {
      kicker: '정세 변동',
      title: '세력 관계가 흔들리고 있습니다',
      body: '연대기를 열어 외교 변화와 다음 전선 압박을 확인하십시오.',
      tone: 'diplomacy',
      eventKind: 'diplomacy',
    };
  }

  return {
    kicker: uiState.openingActActive && beat ? `오프닝 액트 ${Math.max(1, state.turn - 1)} 종료` : `${state.year}년 ${state.month}월 결산`,
    title: beat?.title ? `${beat.title} — 판단을 남겼습니다` : '한 달의 움직임이 정리되었습니다',
    body: `${beat?.victoryCue || brief?.action || '핵심 거점을 선택해 다음 명령으로 주도권을 이어가세요.'}${nextCue ? ` ${nextCue}` : ''}`,
    tone: uiState.openingActActive ? 'opening' : 'neutral',
    eventKind: uiState.openingActActive ? 'opening' : 'summary',
  };
}

function buildTurnBridgeSummary() {
  const playerFactionId = state?.player?.factionId;
  if (!playerFactionId) return null;

  const brief = getBriefingPayload();
  const summary = state?.turnSummary;
  const beat = getOpeningActPayload(state?.turn || 1, playerFactionId);
  const doctrine = getFactionDoctrine(playerFactionId);
  const focusCity = brief?.focus || getOpeningFocusCity(playerFactionId)?.name || '전선';
  const monthLabel = `${state?.year || 208}년 ${state?.month || 1}월`;
  let tone = beat ? 'opening' : 'neutral';
  if ((summary?.relationshipChanges || []).length > 0) tone = 'diplomacy';
  if ((summary?.buildingsCompleted || []).length > 0) tone = 'fortify';
  if ((summary?.techCompleted || []).length > 0) tone = 'growth';
  return {
    kicker: `${monthLabel} ${doctrine?.bridge?.kicker || '전장 재정렬'}`,
    title: beat?.title || `${focusCity} · ${doctrine?.bridge?.titleSuffix || '전선이 다시 움직입니다'}`,
    body: beat?.action || beat?.objective || joinCopyParts(doctrine?.bridge?.bodyLead, `${focusCity}부터 열고 이번 달 첫 판단을 내리십시오.`),
    tone,
  };
}

function summarizeTurnSummary(summary = state?.turnSummary) {
  if (!summary) return '큰 변동 없음';
  const parts = [];
  if ((summary.citiesCaptured || []).length) parts.push(`점령 ${(summary.citiesCaptured || []).length}건`);
  if ((summary.techCompleted || []).length) parts.push(`기술 ${(summary.techCompleted || []).length}건`);
  if ((summary.buildingsCompleted || []).length) parts.push(`건설 ${(summary.buildingsCompleted || []).length}건`);
  if ((summary.relationshipChanges || []).length) parts.push(`외교 ${(summary.relationshipChanges || []).length}건`);
  if ((summary.rebellions || []).length) parts.push(`반란 ${(summary.rebellions || []).length}건`);
  return parts.join(' · ') || '큰 변동 없음';
}

function buildTurnSceneCards({ mode = 'bridge' } = {}) {
  const playerFactionId = state?.player?.factionId;
  const brief = getBriefingPayload({ selectedCityId: map?.selectedCity || null });
  const spotlight = buildTurnSpotlightSummary();
  const bridge = buildTurnBridgeSummary();
  const beat = getOpeningActPayload(state?.turn || 1, playerFactionId);
  const doctrine = getFactionDoctrine(playerFactionId);
  const sceneId = normalizeCommandSceneId(beat?.preferredScene)
    || normalizeCommandSceneId(buildBattlefieldDirectorPacket({
      state,
      scenario,
      cityId: map?.selectedCity || null,
    })?.scene)
    || 'military';
  const sceneMeta = COMMAND_SCENES[sceneId] || null;
  const sceneDoctrine = doctrine?.command?.[sceneId] || null;
  const summaryLine = summarizeTurnSummary(state?.turnSummary);

  if (mode === 'start') {
    return [
      {
        label: '집중 거점',
        value: brief?.focus || '전장 전체',
        detail: brief?.objective || '다음 턴 핵심 거점을 먼저 확인하십시오.',
        tone: 'primary',
      },
      {
        label: '권장 장면',
        value: sceneMeta?.name || '명령',
        detail: beat?.action || sceneDoctrine?.summaryLead || sceneMeta?.captionOwned || '첫 장면을 고른 뒤 즉시 결정을 잠급니다.',
        tone: 'scene',
      },
      {
        label: '첫 명령',
        value: brief?.action || '명령 대기',
        detail: sceneDoctrine?.actionLead || summaryLine,
        tone: 'window',
      },
      {
        label: '경고',
        value: beat?.risk || brief?.risk || '리스크 판독 대기',
        detail: bridge?.body || doctrine?.bridge?.bodyLead || spotlight?.title || '전황 요약 대기',
        tone: 'risk',
      },
    ];
  }

  return [
    {
      label: '월간 결산',
      value: spotlight?.title || '한 달이 정리되었습니다',
      detail: summaryLine,
      tone: 'primary',
    },
    {
      label: '집중 거점',
      value: brief?.focus || '전장 전체',
      detail: brief?.objective || doctrine?.bridge?.bodyLead || bridge?.body || '다음 턴 집중 거점을 정하십시오.',
      tone: 'scene',
    },
    {
      label: '다음 장면',
      value: sceneMeta?.name || '명령',
      detail: bridge?.body || sceneDoctrine?.summaryLead || beat?.action || '장면 전환 준비',
      tone: 'window',
    },
    {
      label: '전장 리스크',
      value: beat?.risk || brief?.risk || '전선 재정렬 중',
      detail: sceneDoctrine?.actionLead || brief?.action || '다음 턴 첫 행동을 정하십시오.',
      tone: 'risk',
    },
  ];
}

function renderTurnSceneStrip(cards = [], { context = 'bridge' } = {}) {
  if (!cards.length) return '';
  return `
    <div class="turn-scene-strip" data-context="${context}">
      ${cards.map((card) => `
        <article class="turn-scene-card tone-${card.tone || 'steady'}">
          <span class="turn-scene-label">${card.label}</span>
          <strong>${card.value}</strong>
          ${card.detail ? `<small>${card.detail}</small>` : ''}
        </article>
      `).join('')}
    </div>
  `;
}

function renderChronicleSessionBoard({ ranked = [] } = {}) {
  const brief = getBriefingPayload({ selectedCityId: map?.selectedCity || null });
  const beat = getOpeningActPayload(state?.turn || 1, state?.player?.factionId);
  const spotlight = buildTurnSpotlightSummary();
  const leader = ranked[0];
  const sceneId = normalizeCommandSceneId(beat?.preferredScene) || 'military';
  const sceneMeta = COMMAND_SCENES[sceneId] || null;
  const cards = [
    {
      label: '집중 거점',
      value: brief?.focus || '전장 전체',
      detail: brief?.objective || '전황 목표 정리 중',
      tone: 'primary',
    },
    {
      label: '권장 장면',
      value: sceneMeta?.name || '명령',
      detail: beat?.action || brief?.action || '장면 권고 대기',
      tone: 'scene',
    },
    {
      label: '월간 결산',
      value: spotlight?.title || summarizeTurnSummary(state?.turnSummary),
      detail: summarizeTurnSummary(state?.turnSummary),
      tone: 'summary',
    },
    {
      label: '패권 구도',
      value: leader ? `${leader.faction.name} · ${leader.cities.length}성` : '집계 대기',
      detail: leader ? `총군 ${formatArmy(leader.army)} · 평판 ${leader.faction.reputation || 100}` : '세력 집계 중',
      tone: 'risk',
    },
  ];

  return `
    <section class="chronicle-session-board" data-tone="${map?.selectedCity ? 'selection' : 'overview'}">
      <div class="chronicle-session-head">
        <div class="chronicle-session-copy">
          <span class="chronicle-session-kicker">${uiState.openingActActive && beat ? `오프닝 액트 ${Math.min(state.turn, 3)}` : '월간 지휘판'}</span>
          <strong>${spotlight?.title || brief?.objective || '전황 요약을 정리 중입니다.'}</strong>
          <small>${brief?.action || beat?.action || '핵심 거점과 장면을 먼저 고르십시오.'}</small>
        </div>
      </div>
      <div class="chronicle-session-grid">
        ${cards.map((card) => `
          <article class="chronicle-session-card tone-${card.tone}">
            <span class="chronicle-session-label">${card.label}</span>
            <strong>${card.value}</strong>
            <small>${card.detail}</small>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function getFactionComparisonLines(factionId, snapshot) {
  const styleMap = {
    wei: ['압박형', '전선 확장', '군사 우선'],
    shu: ['생존형', '방비/외교', '약자 역전'],
    wu: ['균형형', '결전 준비', '방어 후 반격'],
    liu_zhang: ['내정형', '요새 운영', '장기전'],
    zhang_lu: ['극한 생존형', '관문 방어', '외교 의존'],
  };
  const row = styleMap[factionId] || ['균형형', '상황 대응', '혼합'];
  return [
    { label: '플레이 스타일', value: row[0] },
    { label: '첫 판단', value: row[1] },
    { label: '체감 난점', value: row[2] },
    { label: '병력 규모', value: `${(snapshot.army / 10000).toFixed(1)}만` },
  ];
}

function getFactionCardTags(factionId) {
  const tags = {
    wei: ['압박', '확장', '쉬운 시작'],
    shu: ['생존', '외교', '역전'],
    wu: ['결전', '균형', '준비형'],
    liu_zhang: ['내정', '요새', '장기전'],
    zhang_lu: ['관문', '생존', '극한'],
  };
  return tags[factionId] || ['균형', '표준', '혼합'];
}

function getFactionPlayCue(factionId) {
  return {
    wei: '큰 병력으로 남하를 밀어붙이는 정면 돌파형',
    shu: '약한 전선을 외교와 방비로 버티는 역전형',
    wu: '장강 방어와 결전 타이밍을 재는 준비형',
    liu_zhang: '안정된 후방을 오래 굴리는 내정형',
    zhang_lu: '좁은 관문에서 살아남아야 하는 극한형',
  }[factionId] || '상황 적응형';
}

function renderNarrativeModeSelector() {
  const container = document.getElementById('narrative-mode-selector');
  if (!container) return;

  container.innerHTML = NARRATIVE_MODE_OPTIONS.map((mode) => `
    <button
      type="button"
      class="mode-btn ${mode.id === selectedNarrativeMode ? 'active' : ''}"
      data-mode="${mode.id}"
      title="${mode.desc}"
      aria-pressed="${mode.id === selectedNarrativeMode ? 'true' : 'false'}"
    >
      <span>${mode.label}</span>
      <small>${mode.desc}</small>
    </button>
  `).join('');

  container.querySelectorAll('[data-mode]').forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    button.addEventListener('click', () => {
      if (!button.dataset.mode || button.dataset.mode === selectedNarrativeMode) return;
      selectedNarrativeMode = button.dataset.mode;
      renderNarrativeModeSelector();
      renderFactionSelectionRail(scenario, selectedFaction);
    });
  });
}

function renderFactionSelectionRail(sc, factionId) {
  const summary = document.getElementById('faction-selection-summary');
  if (!summary || !sc) return;
  summary.classList.remove('has-onboarding-session');
  summary.style.removeProperty('--faction-selection-accent');

  if (!factionId || !sc.factions?.[factionId]) {
    summary.innerHTML = `
      <div class="faction-selection-summary-empty">
        <strong>깃발을 고르면 출정선이 여기 잠깁니다.</strong>
        <p>좌측 카드에서 세력을 하나 고르면 집중 거점, 첫 장면, 지금 리스크가 바로 정리됩니다.</p>
      </div>
    `;
    return;
  }

  const snapshot = getFactionSnapshot(sc, factionId);
  const theme = getFactionSurfaceTheme(factionId);
  const director = buildFactionDirectorPacket({ scenario: sc, factionId });
  const openingBeat = getOpeningActBeat(factionId, 1);
  const focusCity = director.focus || getScenarioCityName(sc, openingBeat?.focusCityId) || '전장 전체';
  const title = director.startup?.title || openingBeat?.title || director.headline;
  const copy = director.action || director.objective || director.directive || snapshot.meta.desc;
  const color = FACTION_UI_COLORS[factionId] || '#c19a55';
  summary.style.setProperty('--faction-selection-accent', color);
  summary.innerHTML = `
    <div class="faction-selection-summary-head">
      <div class="faction-selection-summary-copy">
        <span class="faction-selection-summary-kicker">${snapshot.faction.name} 출정선 · ${theme.warRoomKicker}</span>
        <h3 class="faction-selection-summary-title">${title}</h3>
      </div>
      <div class="faction-selection-summary-seal">${getFactionSealLabel(factionId)}</div>
    </div>
    <p class="faction-selection-summary-body">${truncateLine(copy, 104)}</p>
    <div class="faction-selection-brief-grid">
      <article class="faction-selection-brief-card">
        <span>집중 거점</span>
        <strong>${focusCity}</strong>
        <small>${snapshot.faction.name}의 첫 압박 축</small>
      </article>
      <article class="faction-selection-brief-card">
        <span>첫 장면</span>
        <strong>${director.scene || '작전 개시'}</strong>
        <small>브리핑 진입 직후 열릴 결정 장면</small>
      </article>
      <article class="faction-selection-brief-card faction-selection-brief-card-wide">
        <span>지금 리스크</span>
        <strong>${truncateLine(director.risk || getRiskLabel(factionId), 44)}</strong>
        <small>${getNarrativeModeLabel(selectedNarrativeMode)} 연출 기준으로 출정합니다.</small>
      </article>
    </div>
    <div class="faction-selection-summary-foot">${director.risk || getRiskLabel(factionId)}</div>
  `;
}

// --- 세력 선택 화면 ---
async function showFactionSelect(preselectedFactionId = null) {
  try {
    scenario = await ensureScenarioLoaded();
  } catch (err) {
    console.error('Failed to load scenario:', err);
    alert('게임 데이터 로드 실패: ' + err.message);
    return;
  }

  applyScenarioMapArt(scenario);

  selectedFaction = null;
  applyFactionSurfaceTheme(null);
  const confirmBtn = document.getElementById('btn-confirm-faction');
  confirmBtn.disabled = true;
  confirmBtn.textContent = '세력을 선택하십시오';

  const container = document.getElementById('faction-cards');
  container.innerHTML = '';
  const cardRegistry = new Map();
  const ORDER = START_SCREEN_FACTION_ORDER.filter((factionId) => scenario.factions?.[factionId]);

  const applyFactionSelection = (factionId) => {
    const snapshot = getFactionSnapshot(scenario, factionId);
    const card = cardRegistry.get(factionId);
    cardRegistry.forEach((entry, entryId) => {
      entry.classList.toggle('selected', entryId === factionId);
    });
    selectedFaction = factionId;
    applyFactionSurfaceTheme(factionId);
    confirmBtn.disabled = false;
    confirmBtn.textContent = `${snapshot.faction.name}으로 출정`;
    renderFactionPreviewMap(scenario, factionId);
    renderFactionMapBrief(scenario, factionId);
    renderFactionPreviewPanel(scenario, factionId);
    renderFactionSelectionRail(scenario, factionId);
    card?.scrollIntoView?.({ block: 'nearest' });
  };

  for (const fid of ORDER) {
    const snapshot = getFactionSnapshot(scenario, fid);
    const { faction: f, meta, cities, army, characters } = snapshot;
    const director = buildFactionDirectorPacket({ scenario, factionId: fid });
    const openingBeat = getOpeningActBeat(fid, 1);
    const focusCity = director.focus || getScenarioCityName(scenario, openingBeat?.focusCityId) || '전장 전체';

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'faction-card';
    card.dataset.faction = fid;
    card.style.setProperty('--faction-card-accent', FACTION_UI_COLORS[fid] || '#c19a55');
    card.innerHTML = `
      <span class="faction-card-diff ${meta.diff}">${meta.diffLabel}</span>
      <div class="faction-card-head">
        <div class="faction-card-name">
          <span class="faction-card-dot" style="background:${FACTION_UI_COLORS[fid] || '#c19a55'}"></span>
          ${f.name}
        </div>
        <div class="faction-card-leader">${meta.leader}</div>
      </div>
      <div class="faction-card-commitment">
        <strong>${director.startup?.title || openingBeat?.title || director.headline}</strong>
        <p>${truncateLine(director.objective || director.directive || meta.desc, 90)}</p>
      </div>
      <div class="faction-card-route">
        <span>${focusCity}</span>
        <span>${director.scene || '작전 개시'}</span>
      </div>
      <p class="faction-card-risk">${truncateLine(director.risk || getRiskLabel(fid), 74)}</p>
      <div class="faction-card-tags">${getFactionCardTags(fid).slice(0, 2).map((tag) => `<span>${tag}</span>`).join('')}</div>
      <div class="faction-card-stats">
        <span>도시 <span class="val">${cities.length}성</span></span>
        <span>병력 <span class="val">${formatArmy(army)}</span></span>
      </div>
    `;

    card.addEventListener('click', () => applyFactionSelection(fid));

    cardRegistry.set(fid, card);
    container.appendChild(card);
  }

  renderNarrativeModeSelector();
  renderFactionSelectionRail(scenario, null);

  await switchScreen('faction-screen', {
    kicker: '전장 개시',
    title: '누구의 깃발 아래 설 것인가',
    body: '세력을 고르면 즉시 전장 위치와 첫 행동 추천이 갱신됩니다.',
  });

  if (preselectedFactionId && cardRegistry.has(preselectedFactionId)) {
    applyFactionSelection(preselectedFactionId);
    return;
  }

  renderFactionPreviewMap(scenario, null);
  renderFactionMapBrief(scenario, null);
  renderFactionPreviewPanel(scenario, null);
  renderFactionSelectionRail(scenario, null);
}

// --- 세력 선택 프리뷰 맵 ---
function applyScenarioMapArt(sc) {
  const asset = sc?.mapLayout?.baseAsset || '/assets/maps/red-cliffs-base.svg';
  document.documentElement.style.setProperty('--scenario-map-art', `url("${asset}")`);
  for (const id of ['faction-map-base', 'game-map-base']) {
    const el = document.getElementById(id);
    if (el) {
      el.style.backgroundImage = `url("${asset}")`;
    }
  }
}

function renderFactionPreviewMap(sc, highlightFaction) {
  const canvas = document.getElementById('faction-map');
  if (!canvas) return;
  const ctr = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const w = ctr.clientWidth;
  const h = ctr.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const layout = resolveMapLayout(sc);
  const viewport = measureMapViewport(layout, w, h);

  ctx.clearRect(0, 0, w, h);
  renderPreviewTerritories(ctx, sc, layout, viewport, highlightFaction);
  renderPreviewRoads(ctx, sc, layout, viewport, highlightFaction);
  renderPreviewCities(ctx, sc, layout, viewport, highlightFaction);
  renderPreviewOverlay(ctx, w, h);
}

function renderPreviewTerritories(ctx, sc, layout, viewport, highlightFaction) {
  const order = ['liu_zhang', 'zhang_lu', 'shu', 'wu', 'wei'];
  for (const factionId of order) {
    const points = layout.territoryPolygons?.[factionId];
    if (!points?.length) continue;
    const palette = MAP_FACTION_PALETTE[factionId] || MAP_FACTION_PALETTE.neutral;
    const active = !highlightFaction || factionId === highlightFaction;
    const center = getPreviewCentroid(points);
    const screenCenter = projectPreview(center.x, center.y, viewport);
    const extent = getPreviewExtent(points);
    const radius = Math.max(extent.width, extent.height) * viewport.scale * 0.7;

    ctx.save();
    previewPolygon(ctx, points, viewport);
    const gradient = ctx.createRadialGradient(screenCenter.x, screenCenter.y, radius * 0.12, screenCenter.x, screenCenter.y, radius);
    gradient.addColorStop(0, previewAddAlpha(palette.glow, active ? 0.34 : 0.14));
    gradient.addColorStop(0.6, previewAddAlpha(palette.fill, active ? 0.34 : 0.15));
    gradient.addColorStop(1, previewAddAlpha(palette.fill, 0.08));
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = previewAddAlpha(active ? palette.edge : '#A58F69', active ? 0.62 : 0.2);
    ctx.lineWidth = (active ? 2.4 : 1.3) * viewport.scale;
    ctx.stroke();
    ctx.restore();
  }
}

function renderPreviewRoads(ctx, sc, layout, viewport, highlightFaction) {
  const roads = [...(layout.roads || [])];

  for (const road of roads) {
    const from = layout.cityAnchors[road.from];
    const to = layout.cityAnchors[road.to];
    if (!from || !to) continue;
    const ownerA = sc.cities[road.from]?.owner;
    const ownerB = sc.cities[road.to]?.owner;
    const active = !highlightFaction || ownerA === highlightFaction || ownerB === highlightFaction;
    if (!active && road.grade === 'normal' && road.kind === 'road') continue;
    const start = projectPreview(from.x, from.y, viewport);
    const end = projectPreview(to.x, to.y, viewport);
    const control = projectPreviewRoadControl(from, to, road.grade, viewport);
    const style = getPreviewRoadStyle(road, active);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
    ctx.setLineDash(style.dash || []);
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.width * viewport.scale;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }
}

function renderPreviewCities(ctx, sc, layout, viewport, highlightFaction) {
  const anchors = Object.entries(layout.cityAnchors || {}).sort(([, a], [, b]) => a.y - b.y);

  for (const [cityId, anchor] of anchors) {
    const city = sc.cities[cityId];
    if (!city) continue;

    const owner = city.owner || 'neutral';
    const palette = MAP_FACTION_PALETTE[owner] || MAP_FACTION_PALETTE.neutral;
    const active = !highlightFaction || owner === highlightFaction;
    const point = projectPreview(anchor.x, anchor.y, viewport);
    const importance = city.strategic_importance || 0;
    const size = ((owner === highlightFaction ? 12.8 : 10.2) + Math.min(3, importance * 0.22)) * viewport.scale;

    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.82, -size * 0.28);
    ctx.lineTo(size * 0.82, size * 0.58);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.82, size * 0.58);
    ctx.lineTo(-size * 0.82, -size * 0.28);
    ctx.closePath();
    ctx.fillStyle = active ? '#20150E' : 'rgba(20, 15, 11, 0.48)';
    ctx.fill();
    ctx.strokeStyle = previewAddAlpha(active ? palette.edge : '#A08863', active ? 0.9 : 0.28);
    ctx.lineWidth = 1.5 * viewport.scale;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -size * 0.7);
    ctx.lineTo(size * 0.56, -size * 0.16);
    ctx.lineTo(size * 0.56, size * 0.42);
    ctx.lineTo(0, size * 0.7);
    ctx.lineTo(-size * 0.56, size * 0.42);
    ctx.lineTo(-size * 0.56, -size * 0.16);
    ctx.closePath();
    ctx.fillStyle = previewAddAlpha(palette.badge, active ? 0.95 : 0.4);
    ctx.fill();
    ctx.restore();

    if (importance >= 8) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(point.x, point.y, size + 5 * viewport.scale, 0, Math.PI * 2);
      ctx.strokeStyle = active ? 'rgba(241, 221, 176, 0.42)' : 'rgba(202, 182, 147, 0.18)';
      ctx.lineWidth = 1.2 * viewport.scale;
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.font = `${Math.max(10, 11 * viewport.scale)}px "Noto Serif KR", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = active ? '#F6EED8' : 'rgba(220, 206, 180, 0.42)';
    ctx.fillText(city.name, point.x, point.y + size + 8 * viewport.scale);
    ctx.restore();
  }

  for (const label of layout.labels || []) {
    const point = projectPreview(label.x, label.y, viewport);
    ctx.save();
    ctx.font = `${Math.max(18, label.size * viewport.scale * 0.54)}px "Noto Serif KR", serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(238, 225, 193, 0.2)';
    ctx.fillText(label.text, point.x, point.y);
    ctx.restore();
  }
}

function renderPreviewOverlay(ctx, width, height) {
  const vignette = ctx.createRadialGradient(width * 0.56, height * 0.42, width * 0.12, width * 0.56, height * 0.42, width * 0.72);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(8, 6, 4, 0.44)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(227, 196, 138, 0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(12, 12, width - 24, height - 24);
}

function previewPolygon(ctx, points, viewport) {
  const first = projectPreview(points[0][0], points[0][1], viewport);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i += 1) {
    const point = projectPreview(points[i][0], points[i][1], viewport);
    ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
}

function projectPreview(x, y, viewport) {
  return {
    x: x * viewport.scale + viewport.offsetX,
    y: y * viewport.scale + viewport.offsetY,
  };
}

function projectPreviewRoadControl(from, to, grade, viewport) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const curve = grade === 'major' ? 0.09 : 0.05;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const nx = -dy / length;
  const ny = dx / length;
  const bias = Math.sin((from.x + to.y) * 0.01) >= 0 ? 1 : -1;
  return projectPreview(midX + nx * length * curve * bias, midY + ny * length * curve * bias, viewport);
}

function getPreviewExtent(points) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { width: maxX - minX, height: maxY - minY };
}

function getPreviewCentroid(points) {
  let area = 0;
  let x = 0;
  let y = 0;

  for (let i = 0; i < points.length; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    x += (x0 + x1) * cross;
    y += (y0 + y1) * cross;
  }

  if (!area) return { x: points[0][0], y: points[0][1] };
  area *= 0.5;
  return {
    x: x / (6 * area),
    y: y / (6 * area),
  };
}

function previewAddAlpha(color, alpha) {
  if (color.startsWith('rgba')) {
    const parts = color.slice(5, -1).split(',').map(part => part.trim());
    return `rgba(${parts.slice(0, 3).join(', ')}, ${alpha})`;
  }
  if (color.startsWith('#')) {
    const normalized = color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color;
    const r = parseInt(normalized.slice(1, 3), 16);
    const g = parseInt(normalized.slice(3, 5), 16);
    const b = parseInt(normalized.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

function sameRoad(road, from, to) {
  return (road.from === from && road.to === to) || (road.from === to && road.to === from);
}

function getPreviewRoadStyle(road, active) {
  if (road.kind === 'river') {
    return {
      stroke: active ? 'rgba(160, 200, 221, 0.4)' : 'rgba(121, 151, 166, 0.18)',
      width: road.grade === 'major' ? 4 : 3,
      dash: [8, 6],
    };
  }
  if (road.kind === 'mountain_pass') {
    return {
      stroke: active ? 'rgba(205, 186, 146, 0.32)' : 'rgba(116, 101, 80, 0.18)',
      width: 2.8,
      dash: [6, 5],
    };
  }
  if (road.kind === 'desert_road') {
    return {
      stroke: active ? 'rgba(225, 193, 132, 0.32)' : 'rgba(130, 110, 77, 0.18)',
      width: 2.6,
      dash: [10, 7],
    };
  }
  return {
    stroke: active
      ? (road.grade === 'major' ? 'rgba(222, 198, 139, 0.38)' : 'rgba(170, 150, 117, 0.2)')
      : 'rgba(105, 92, 75, 0.14)',
    width: road.grade === 'major' ? 4.2 : 2.4,
    dash: [],
  };
}

function renderFactionMapBrief(sc, factionId) {
  const kickerEl = document.getElementById('faction-map-kicker');
  const titleEl = document.getElementById('faction-map-title');
  const bodyEl = document.getElementById('faction-map-body');
  const tagsEl = document.getElementById('faction-map-tag-row');
  const focusEl = document.getElementById('faction-map-focus');
  const sceneEl = document.getElementById('faction-map-scene');
  const riskEl = document.getElementById('faction-map-risk');
  const footerEl = document.getElementById('faction-map-footer');
  if (!kickerEl || !titleEl || !bodyEl || !tagsEl || !focusEl || !sceneEl || !riskEl || !footerEl || !sc) return;

  const director = buildFactionDirectorPacket({ scenario: sc, factionId });

  if (!factionId) {
    kickerEl.textContent = '전장 약속';
    titleEl.textContent = director.headline || '세력을 고르면 첫 거점과 첫 명령이 고정됩니다';
    bodyEl.textContent = director.directive || director.body || director.objective || '';
    focusEl.textContent = director.focus || '시나리오 전체';
    sceneEl.textContent = director.scene || '작전 개시';
    riskEl.textContent = director.risk || '세력을 고르면 첫 1턴 우선순위가 고정됩니다.';
    tagsEl.innerHTML = (director.tags || []).map((tag) => `<span>${tag}</span>`).join('');
    footerEl.innerHTML = `
      <div class="faction-map-footer-track">
        ${START_SCREEN_FACTION_ORDER.slice(0, 3).map((candidateId) => {
          const beat = getOpeningActBeat(candidateId, 1);
          const factionName = sc.factions?.[candidateId]?.name || candidateId;
          const focusCity = getScenarioCityName(sc, beat?.focusCityId) || '전장 전체';
          const sceneName = COMMAND_SCENES[normalizeCommandSceneId(beat?.preferredScene) || 'government']?.name || '작전 개시';
          return `
            <article class="faction-map-step">
              <span>${factionName}</span>
              <strong>${beat?.title || '시작 약속'}</strong>
              <p>${focusCity} · ${sceneName}</p>
            </article>
          `;
        }).join('')}
      </div>
    `;
    return;
  }

  const snapshot = getFactionSnapshot(sc, factionId);
  const beats = [1, 2, 3].map((turn) => getOpeningActBeat(factionId, turn)).filter(Boolean);
  kickerEl.textContent = `${snapshot.faction.name} 시작 약속`;
  titleEl.textContent = director.startup?.title || director.headline || `${snapshot.faction.name}의 첫 1턴`;
  bodyEl.textContent = director.action || director.directive || director.body || '';
  focusEl.textContent = director.focus || '전장 전체';
  sceneEl.textContent = director.scene || '작전 개시';
  riskEl.textContent = director.risk || getRiskLabel(factionId);
  tagsEl.innerHTML = (director.tags || []).slice(0, 5).map((tag) => `<span>${tag}</span>`).join('');
  footerEl.innerHTML = `
    <div class="faction-map-footer-track">
      ${beats.map((beat, index) => `
        <article class="faction-map-step ${index === 0 ? 'is-active' : ''}">
          <span>턴 ${index + 1}</span>
          <strong>${beat.title}</strong>
          <p>${beat.action || beat.objective || ''}</p>
        </article>
      `).join('')}
    </div>
  `;
}

function renderFactionPreviewPanel(sc, factionId) {
  const panel = document.getElementById('faction-preview-card');
  if (!panel || !sc) return;

  if (!factionId) {
    const director = buildFactionDirectorPacket({ scenario: sc, factionId: null });
    panel.innerHTML = `
      <div class="faction-preview-hero">
        <div class="faction-preview-kicker">선택 대기</div>
        <div class="faction-preview-title">${director.headline}</div>
        <div class="faction-preview-copy">
          ${director.directive || director.body || director.objective}
        </div>
        <div class="faction-preview-tag-row">
          ${(director.tags || []).map((tag) => `<span>${tag}</span>`).join('')}
        </div>
      </div>
      <div class="faction-promise-board">
        <article class="faction-promise-card faction-promise-card-primary">
          <span class="label">무엇이 바뀌나</span>
          <strong>중앙 지도, 우측 브리프, 출정 CTA가 같은 약속으로 묶입니다</strong>
          <p>세력 카드 하나를 누르면 집중 거점과 첫 장면이 곧바로 읽히도록 화면 전체가 같은 기준으로 갱신됩니다.</p>
        </article>
        <article class="faction-promise-card">
          <span class="label">추천 읽기 순서</span>
          <strong>왼쪽 카드 → 중앙 지도 → 오른쪽 3턴 사다리</strong>
          <p>위는 남하 압박, 촉은 생존, 오는 결전 준비가 가장 빠르게 대비됩니다.</p>
        </article>
      </div>
      <div class="faction-preview-grid">
        <div class="faction-preview-stat"><span class="label">핵심 축</span><span class="value">조조 · 유비 · 손권</span></div>
        <div class="faction-preview-stat"><span class="label">시작 압박</span><span class="value">남하 / 연합 / 생존</span></div>
        <div class="faction-preview-stat"><span class="label">판세 성격</span><span class="value">외교와 전쟁 동시 개막</span></div>
        <div class="faction-preview-stat"><span class="label">추천 흐름</span><span class="value">좌측 카드로 시작 약속을 고르십시오</span></div>
      </div>
      <div class="faction-preview-footer">좌측에서 세력을 선택하면 시작 목표와 전력, 전장 위치가 즉시 갱신됩니다.</div>
    `;
    panel.scrollTop = 0;
    return;
  }

  const snapshot = getFactionSnapshot(sc, factionId);
  const { faction, meta, cities, army, characters, allies, enemies } = snapshot;
  const objectives = OPENING_OBJECTIVES[factionId] || [];
  const compareRows = getFactionComparisonLines(factionId, snapshot);
  const color = FACTION_UI_COLORS[factionId] || '#c19a55';
  const beats = [1, 2, 3].map((turn) => getOpeningActBeat(factionId, turn)).filter(Boolean);
  const tags = getFactionCardTags(factionId);
  const director = buildFactionDirectorPacket({ scenario: sc, factionId });

  panel.innerHTML = `
    <div class="faction-preview-hero">
      <div class="faction-preview-kicker" style="color:${color}">${meta.diffLabel} 난도</div>
      <div class="faction-preview-title">${faction.name}</div>
      <div class="faction-preview-meta">${meta.leader}</div>
      <div class="faction-preview-copy">${director.directive || director.body || meta.desc}</div>
      <div class="faction-preview-tag-row">
        ${[...tags, ...(director.tags || [])].slice(0, 5).map((tag) => `<span>${tag}</span>`).join('')}
      </div>
      <div class="faction-preview-playcue">${getFactionPlayCue(factionId)}</div>
    </div>
    <div class="faction-promise-board">
      <article class="faction-promise-card faction-promise-card-primary">
        <span class="label">첫 1턴 약속</span>
        <strong>${director.startup?.title || beats[0]?.title || director.headline}</strong>
        <p>${director.action || beats[0]?.action || director.directive}</p>
      </article>
      <article class="faction-promise-card">
        <span class="label">집중 거점</span>
        <strong>${director.focus || '전장 전체'} · ${director.scene || '작전 개시'}</strong>
        <p>${director.risk || getRiskLabel(factionId)}</p>
      </article>
    </div>
    <div class="start-focus-card">
      <div class="screen-kicker">시작 목표</div>
      <h3 class="start-focus-title">${director.headline}</h3>
      <p class="start-focus-copy">${director.objective || director.directive || objectives[0] || meta.desc}</p>
    </div>
    <div class="faction-preview-grid">
      <div class="faction-preview-stat"><span class="label">보유 도시</span><span class="value">${cities.length}성</span></div>
      <div class="faction-preview-stat"><span class="label">총병력</span><span class="value">${(army / 10000).toFixed(1)}만</span></div>
      <div class="faction-preview-stat"><span class="label">장수</span><span class="value">${characters.length}명</span></div>
      <div class="faction-preview-stat"><span class="label">자금</span><span class="value">${faction.gold.toLocaleString()}</span></div>
    </div>
    <div class="faction-preview-compare">
      ${compareRows.map((row) => `
        <div class="faction-compare-row">
          <span class="label">${row.label}</span>
          <strong class="value">${row.value}</strong>
        </div>
      `).join('')}
    </div>
    <div class="faction-opening-ladder">
      ${beats.map((beat, index) => `
        <div class="faction-opening-step">
          <span class="step-turn">턴 ${index + 1}</span>
          <strong>${beat.title}</strong>
          <p>${beat.action}</p>
        </div>
      `).join('')}
    </div>
    <div class="faction-preview-objectives">
      <h3>오프닝 목표</h3>
      <ul>${objectives.map(line => `<li>${line}</li>`).join('')}</ul>
    </div>
    <div class="faction-preview-footer">우호: ${allies.join(' · ') || '없음'}<br>적대: ${enemies.join(' · ') || '없음'}</div>
  `;
  panel.scrollTop = 0;
}

async function backToStart() {
  if (selectedFaction) startScreenSpotlightFactionId = selectedFaction;
  selectedFaction = null;
  if (scenario) renderStartScreenSurface(scenario);
  await switchScreen('start-screen', {
    kicker: '장면 복귀',
    title: '로비로 돌아갑니다',
    body: '시나리오와 세력을 다시 고를 수 있습니다.',
  });
}

// --- 도입 스토리 ---
async function showIntro() {
  if (!selectedFaction) return;
  const snapshot = getFactionSnapshot(scenario, selectedFaction);
  const { meta, faction: f, cities, army, characters, allies, enemies } = snapshot;
  const openingBeat = getOpeningActBeat(selectedFaction, 1);

  document.getElementById('intro-title').textContent = `${f.name} — ${meta.leader}`;
  document.getElementById('intro-brief').textContent = meta.desc;
  document.getElementById('intro-narrative').innerHTML = meta.intro.map(p => `<p>${p}</p>`).join('');
  document.getElementById('intro-stats').innerHTML = `
    <div class="intro-stat"><div class="label">영토</div><div class="value">${cities.length}성</div></div>
    <div class="intro-stat"><div class="label">병력</div><div class="value">${(army/10000).toFixed(1)}만</div></div>
    <div class="intro-stat"><div class="label">적대</div><div class="value">${enemies.join(' · ') || '없음'}</div></div>
  `;
  document.getElementById('intro-objectives').innerHTML = `
    <h3>첫 결단</h3>
    <p>${openingBeat?.action || (OPENING_OBJECTIVES[selectedFaction] || [])[0] || '첫 거점을 정하고 출정을 시작하십시오.'}</p>
  `;
  updateIntroGuidance(selectedFaction);

  // 대화 시퀀스 초기화
  const lines = FACTION_DIALOGUES[selectedFaction] || [];
  dialogueState = { lines, index: 0 };
  const dlgEl = document.getElementById('intro-dialogue');
  const startBtn = document.getElementById('btn-start-game');

  if (lines.length > 0) {
    dlgEl.classList.remove('hidden');
    startBtn.classList.remove('hidden');
    showDialogueLine();
  } else {
    dlgEl.classList.add('hidden');
    startBtn.classList.remove('hidden');
  }
  startBtn.textContent = `${f.name}의 운명을 맡는다`;

  await switchScreen('intro-screen', {
    kicker: '출정 서약',
    title: `${f.name}의 운명을 맡습니다`,
    body: openingBeat?.action || '첫 거점을 정하고 곧바로 출정하십시오.',
  });
}

function showDialogueLine() {
  const { lines, index } = dialogueState;
  if (index >= lines.length) {
    // 대화 끝 → 시작 버튼 표시
    document.getElementById('intro-dialogue').classList.add('hidden');
    document.getElementById('btn-start-game').classList.remove('hidden');
    return;
  }

  const line = lines[index];
  const speakerEl = document.getElementById('dialogue-speaker');
  const textEl = document.getElementById('dialogue-text');
  const progressEl = document.getElementById('dialogue-progress');

  speakerEl.textContent = line.speaker;
  textEl.textContent = line.text;
  progressEl.textContent = `${index + 1} / ${lines.length}`;
  if (dialogueState._timer) clearInterval(dialogueState._timer);
  dialogueState._typing = false;
  dialogueState._timer = null;
}

function advanceDialogue() {
  if (dialogueState._typing) {
    // 타이핑 중이면 즉시 완료
    clearInterval(dialogueState._timer);
    dialogueState._typing = false;
    const line = dialogueState.lines[dialogueState.index];
    document.getElementById('dialogue-text').textContent = line.text;
    return;
  }
  dialogueState.index++;
  showDialogueLine();
}

// --- 게임 시작 ---
async function startNewGame() {
  try {
    await ensureScenarioLoaded();
    await ensureEventsLoaded();
  } catch (err) {
    console.error('Failed to prepare new game:', err);
    alert('게임 데이터를 준비하지 못했습니다: ' + err.message);
    return;
  }

  // 선택한 세력으로 오버라이드
  if (selectedFaction) {
    scenario.playerFaction = selectedFaction;
    scenario.playerCharacter = FACTION_LEADERS[selectedFaction];
  }

  // 정사/연의 모드 적용
  scenario.narrativeMode = selectedNarrativeMode;
  state = new GameState(scenario);
  applyFactionSurfaceTheme(state.player.factionId);
  uiState.openingCityId = getOpeningFocusCity(state.player.factionId)?.id || null;
  uiState.commandSpotlightShown = false;
  uiState.openingActActive = isOpeningActActive(1);
  hideTurnBridgeCard({ immediate: true });
  hideTurnStartCard({ immediate: true });

  await switchScreen('game-screen', {
    kicker: '전장 진입',
    title: `${state.factions[state.player.factionId].name}의 첫 달이 시작됩니다`,
    body: '핵심 거점을 먼저 열고 첫 명령을 결정하십시오.',
  });
  initGameScreen();
  const brief = getBriefingPayload();
  const openingBeat = getOpeningActPayload(1, state.player.factionId);
  showTurnSpotlight({
    kicker: '오프닝 액트 1',
    title: openingBeat?.title || (brief?.focus ? `${brief.focus}부터 확인하십시오` : '첫 거점을 선택하십시오'),
    body: openingBeat?.action || brief?.action || '도시를 선택해 첫 명령을 시작하세요.',
  });
  persistSave({ silent: true, source: 'auto' });
}

async function loadGame() {
  const saved = localStorage.getItem(SAVE_KEY);
  if (!saved) return;

  try {
    state = GameState.deserialize(saved);
    applyFactionSurfaceTheme(state.player.factionId);
    selectedNarrativeMode = state.narrativeMode || 'both';
    scenario = await ensureScenarioLoaded();
    await ensureEventsLoaded();
    uiState.openingCityId = getOpeningFocusCity(state.player.factionId)?.id || null;
    uiState.openingActActive = isOpeningActActive(state.turn);
    hideTurnBridgeCard({ immediate: true });
    hideTurnStartCard({ immediate: true });
    initGameScreen();
    const loadBeat = getOpeningActPayload(state.turn, state.player.factionId);
    await switchScreen('game-screen', {
      kicker: '전장 복귀',
      title: `${state.factions[state.player.factionId].name}의 기록을 이어갑니다`,
      body: `턴 ${state.turn}부터 다시 시작합니다.`,
    });
    if (uiState.openingActActive && loadBeat) {
      showTurnSpotlight({
        kicker: `오프닝 액트 ${state.turn}`,
        title: loadBeat.title,
        body: loadBeat.action,
      });
      showTurnStartCard(state.turn);
    }
    refreshSaveSlot();
  } catch (err) {
    console.error('Failed to load save:', err);
    clearStoredSave();
    refreshSaveSlot();
    alert('저장 데이터를 불러오지 못했습니다. 손상된 저장은 정리했습니다.');
  }
}

function saveGame() {
  persistSave({ source: 'manual' });
}

function returnToMenu() {
  if (dialogueState._timer) clearInterval(dialogueState._timer);
  actionPanel?.hide();
  document.getElementById('gameover-modal').classList.add('hidden');
  hideTurnBridgeCard({ immediate: true });
  hideTurnStartCard({ immediate: true });
  hideActionResultBanner({ immediate: true });
  hideFieldReaction({ immediate: true });

  selectedFaction = null;
  applyFactionSurfaceTheme(null);
  logVisible = false;
  uiState.openingActActive = false;
  refreshSaveSlot();
  void switchScreen('start-screen', {
    kicker: '막간',
    title: '메인 로비로 돌아갑니다',
    body: '저장은 유지되고, 다른 세력이나 시나리오 흐름을 다시 고를 수 있습니다.',
  });
}

function getCanvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function setSelectionFocus(active) {
  const gameScreen = document.getElementById('game-screen');
  if (!gameScreen) return;
  gameScreen.classList.toggle('selection-focus', Boolean(active));
}

function clearSelectedCity() {
  map.selectedCity = null;
  uiState.frontlinePreviewCityId = null;
  sidebar.clearCityDetail(state);
  actionPanel.setContext(null, state);
  actionPanel.hide();
  document.getElementById('game-screen').classList.remove('city-rail-open');
  setSelectionFocus(false);
  updateMapHoverCard(null);
  updateMapSelectionPanel();
  updateWarRoomBrief();
  updateCitySessionBoard();
  updateOpeningHudBrief();
  updateMapOverlayControls();
  map.render(state);
}

function clearSelectedCityFromContextMenu(event) {
  event.preventDefault();
  if (!map?.selectedCity || processing) return;
  if (!document.getElementById('event-modal').classList.contains('hidden')) return;
  if (!document.getElementById('char-modal').classList.contains('hidden')) return;
  if (!document.getElementById('turn-resolution').classList.contains('hidden')) return;
  if (actionPanel?.isOpen()) return;
  clearSelectedCity();
}

function refocusSelectedCity() {
  if (!map?.selectedCity || !state?.cities?.[map.selectedCity] || processing) return false;
  if (!document.getElementById('event-modal').classList.contains('hidden')) return false;
  if (!document.getElementById('char-modal').classList.contains('hidden')) return false;
  if (!document.getElementById('turn-resolution').classList.contains('hidden')) return false;
  if (actionPanel?.isOpen()) return false;
  const selection = getCitySelectionProfile(map.selectedCity);
  map.focusOnCity(map.selectedCity);
  map.signalSelection(map.selectedCity, selection.tone);
  map.addEventPulse(map.selectedCity, getSelectionPulseColor(selection.tone));
  return true;
}

function selectCityById(cityId, { immediate = false, showReaction = true } = {}) {
  if (!map || !state?.cities?.[cityId]) return false;
  const selection = getCitySelectionProfile(cityId);
  uiState.frontlinePreviewCityId = null;
  hideTurnSpotlight({ immediate: true });
  hideTurnStartCard({ immediate: true });
  map.selectedCity = cityId;
  map.hoveredCity = null;
  map.focusOnCity(cityId, { immediate });
  map.signalSelection(cityId, selection.tone);
  map.addEventPulse(cityId, getSelectionPulseColor(selection.tone));
  sidebar.showCityDetail(cityId, state);
  actionPanel.setContext(cityId, state);
  document.getElementById('game-screen').classList.add('city-rail-open');
  setSelectionFocus(true);
  updateMapHoverCard(null);
  if (showReaction) {
    showFieldReaction({
      kicker: selection.kicker,
      title: selection.title,
      body: selection.fieldBody,
      tone: selection.tone,
    });
  }
  updateMapSelectionPanel();
  updateWarRoomBrief();
  updateCitySessionBoard();
  updateOpeningHudBrief();
  updateMapOverlayControls();
  map.render(state);
  return true;
}

function selectCityFromCanvasPoint(x, y) {
  const cityId = map.hitTest(x, y);

  if (cityId) {
    selectCityById(cityId);
  } else {
    clearSelectedCity();
  }
}

function updateMapHoverCard(cityId, x = 0, y = 0) {
  const card = document.getElementById('map-hover-card');
  const cityEl = document.getElementById('map-hover-city');
  const ownerEl = document.getElementById('map-hover-owner');
  const metaEl = document.getElementById('map-hover-meta');
  const hintEl = document.getElementById('map-hover-hint');
  const container = document.getElementById('map-container');
  if (!card || !cityEl || !ownerEl || !metaEl || !hintEl || !container) return;

  if (!cityId || !state?.cities?.[cityId]) {
    card.classList.add('hidden');
    return;
  }

  const city = state.cities[cityId];
  const selection = getCitySelectionProfile(cityId);
  const isSelected = cityId === map?.selectedCity;
  const ownerName = city.owner ? state.factions?.[city.owner]?.name || '세력 미상' : '무주지';
  card.dataset.tone = city.owner === state.player.factionId ? 'own' : city.owner ? 'hostile' : 'neutral';
  card.dataset.state = isSelected ? 'selected' : 'hover';
  cityEl.innerHTML = isSelected
    ? `${city.name}<span class="map-hover-selected-badge">선택 중</span>`
    : city.name;
  ownerEl.textContent = `${ownerName} · 병력 ${city.army.toLocaleString()}`;
  metaEl.textContent = `${mapTerrainLabel(city.terrain?.type || city.terrain)} · 성방 ${Number(city.defense) || 0}`;
  hintEl.innerHTML = isSelected
    ? renderMapControlHint([
      { type: 'text', value: '현재 선택 도시' },
      { type: 'key', value: 'Enter' },
      { type: 'text', value: selection.buttonLabel },
      { type: 'key', value: 'F' },
      { type: 'text', value: '재집중' },
      { type: 'key', value: 'Esc' },
      { type: 'key', value: '우클릭' },
      { type: 'text', value: '선택 해제' },
    ])
    : renderMapControlHint([
      { type: 'key', value: 'Enter' },
      { type: 'text', value: selection.buttonLabel },
      { type: 'text', value: '두 번 · 즉시 진입' },
    ]);
  const maxX = Math.max(18, container.clientWidth - 238);
  const maxY = Math.max(18, container.clientHeight - 98);
  card.style.left = `${Math.max(18, Math.min(x + 18, maxX))}px`;
  card.style.top = `${Math.max(18, Math.min(y - 8, maxY))}px`;
  card.classList.remove('hidden');
}

function updateMapHoverFromCanvasPoint(canvas, x, y, force = false) {
  const cityId = map.hitTest(x, y);
  if (!force && cityId === map.hoveredCity) return;
  uiState.frontlinePreviewCityId = null;
  map.hoveredCity = cityId;
  canvas.style.cursor = cityId ? 'pointer' : 'grab';
  updateMapHoverCard(cityId, x, y);
  map.render(state);
}

function previewFrontlineCity(cityId, anchorEl = null) {
  if (!map || !state?.cities?.[cityId]) return false;
  const container = document.getElementById('map-container');
  const containerRect = container?.getBoundingClientRect?.();
  const anchorRect = anchorEl instanceof HTMLElement ? anchorEl.getBoundingClientRect() : null;
  const x = containerRect && anchorRect
    ? anchorRect.left - containerRect.left + Math.min(anchorRect.width * 0.72, 116)
    : 48;
  const y = containerRect && anchorRect
    ? anchorRect.top - containerRect.top + (anchorRect.height * 0.5)
    : 48;
  uiState.frontlinePreviewCityId = cityId;
  map.hoveredCity = cityId;
  updateMapHoverCard(cityId, x, y);
  updateFrontlineOverlayCopy();
  map.render(state);
  return true;
}

function clearFrontlineCityPreview(cityId = null) {
  if (!map || !uiState.frontlinePreviewCityId) return false;
  if (cityId && uiState.frontlinePreviewCityId !== cityId) return false;
  uiState.frontlinePreviewCityId = null;
  map.hoveredCity = null;
  updateMapHoverCard(null);
  updateFrontlineOverlayCopy();
  map.render(state);
  return true;
}

function primeOpeningFocus() {
  const focusCityId = uiState.openingCityId || getOpeningFocusCity(state?.player?.factionId)?.id || null;
  if (!focusCityId || !state?.cities?.[focusCityId] || !map) return;
  const selection = getCitySelectionProfile(focusCityId);
  uiState.openingCityId = focusCityId;
  map.selectedCity = focusCityId;
  map.focusOnCity(focusCityId, { immediate: true });
  map.signalSelection(focusCityId, selection.tone);
  sidebar.showCityDetail(focusCityId, state);
  actionPanel.setContext(focusCityId, state);
  document.getElementById('game-screen').classList.add('city-rail-open');
  setSelectionFocus(true);
  updateMapSelectionPanel();
  updateWarRoomBrief();
  updateCitySessionBoard();
  updateOpeningHudBrief();
  map.render(state);
}

// --- 게임 화면 초기화 ---
function initGameScreen() {
  const gameScreen = document.getElementById('game-screen');
  document.getElementById('start-screen').classList.add('hidden');
  gameScreen.classList.remove('hidden');
  gameScreen.classList.add('chronicle-collapsed');
  gameScreen.classList.remove('city-rail-open');
  gameScreen.classList.remove('selection-focus');
  document.getElementById('btn-toggle-log').classList.remove('active');
  document.getElementById('btn-toggle-log').textContent = '전황 열기';
  logVisible = false;
  applyScenarioMapArt(scenario);

  // 맵 초기화
  const canvas = document.getElementById('game-map');
  map = new MapRenderer(canvas, scenario);
  map.setOverlayMode(uiState.mapOverlayMode);
  actionPanel.setConnections(scenario.connections);
  actionPanel.setOpeningContext({
    active: uiState.openingActActive,
    turn: state.turn,
    factionId: state.player.factionId,
  });
  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'none';
  canvas.oncontextmenu = clearSelectedCityFromContextMenu;

  // 캐릭터 클릭 콜백
  sidebar.onCharacterClick = (charId) => {
    showCharacterModal(charId, state);
  };
  sidebar.onOpenCommand = () => {
    openSelectedCityCommand();
  };
  sidebar.setOpeningBrief(OPENING_OBJECTIVES[state.player.factionId] || []);

  let dragState = null;

  canvas.onpointerdown = (event) => {
    if (processing) return;
    const point = getCanvasPoint(canvas, event);
    dragState = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      dragged: false,
    };
    canvas.setPointerCapture?.(event.pointerId);
    canvas.style.cursor = 'grabbing';
  };

  canvas.onpointermove = (event) => {
    const point = getCanvasPoint(canvas, event);

    if (!dragState || dragState.pointerId !== event.pointerId) {
      updateMapHoverFromCanvasPoint(canvas, point.x, point.y);
      return;
    }

    const deltaX = point.x - dragState.lastX;
    const deltaY = point.y - dragState.lastY;
    const moved = Math.hypot(point.x - dragState.startX, point.y - dragState.startY);
    if (moved > 6) dragState.dragged = true;
    if (dragState.dragged) {
      map.panBy(deltaX, deltaY);
    }
    dragState.lastX = point.x;
    dragState.lastY = point.y;
  };

  const releasePointer = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const point = getCanvasPoint(canvas, event);
    const wasDragged = dragState.dragged;
    dragState = null;
    canvas.releasePointerCapture?.(event.pointerId);
    if (!wasDragged && !processing) {
      selectCityFromCanvasPoint(point.x, point.y);
      updateMapHoverFromCanvasPoint(canvas, point.x, point.y, true);
      return;
    }
    updateMapHoverFromCanvasPoint(canvas, point.x, point.y, true);
  };

  canvas.onpointerup = releasePointer;
  canvas.onpointercancel = releasePointer;
  canvas.ondblclick = (event) => {
    if (processing || actionPanel?.isOpen()) return;
    const point = getCanvasPoint(canvas, event);
    const cityId = map.hitTest(point.x, point.y);
    if (!cityId) return;
    if (map.selectedCity !== cityId) {
      selectCityFromCanvasPoint(point.x, point.y);
    }
    openSelectedCityCommand();
  };
  canvas.onpointerleave = () => {
    if (dragState) return;
    map.hoveredCity = null;
    updateMapHoverCard(null);
    canvas.style.cursor = 'grab';
    map.render(state);
  };

  // 행동 콜백
  actionPanel.onAction = (actionType, params) => {
    if (processing) return;
    const success = executePlayerAction(actionType, params, state, scenario.connections);
    if (success) {
      showCommandSealFlash(state.lastPlayerActionResult);
      showActionResultBanner(state.lastPlayerActionResult);
      const focusCityId = state.lastPlayerActionResult?.focusCityId || map.selectedCity;
      if (focusCityId && state.cities[focusCityId]) {
        const tone = state.lastPlayerActionResult?.tone || 'neutral';
        map.selectedCity = focusCityId;
        map.focusOnCity(focusCityId);
        map.signalSelection(focusCityId, tone);
        map.addEventPulse(focusCityId, getSelectionPulseColor(tone));
        showFieldReaction({
          kicker: state.lastPlayerActionResult?.kicker || '현장 반응',
          title: state.lastPlayerActionResult?.title,
          body: state.lastPlayerActionResult?.body,
          tone,
        });
      }
      updateUI();
      if (focusCityId && state.cities[focusCityId]) {
        sidebar.showCityDetail(focusCityId, state);
        actionPanel.setContext(focusCityId, state);
      }
    }
    return success;
  };

  primeOpeningFocus();
  updateUI();
}

// --- 턴 진행 (결산 오버레이 방식) ---
async function nextTurn() {
  if (processing || !state || state.gameOver) return;
  processing = true;
  document.getElementById('btn-next-turn').disabled = true;
  actionPanel.hide();

  try {
    map.clearEventPulses();

    // 병력 스냅샷 (이동 감지용)
    const armyBefore = {};
    const ownerBefore = {};
    for (const [cid, c] of Object.entries(state.cities)) {
      armyBefore[cid] = c.army;
      ownerBefore[cid] = c.owner;
    }

    const resolutionItems = [];
    let logMark = state.currentTurnLog.length;

    // ── Phase 1: 이벤트 ──
    const playerEvents = executeTurnEvents(state, allEvents);

    // AI 이벤트 로그 수집
    const eventLogs = state.currentTurnLog.slice(logMark);
    for (const entry of eventLogs) {
      resolutionItems.push({
        phase: '이벤트', icon: getLogIcon(entry.type),
        text: entry.message, type: entry.type,
      });
    }
    logMark = state.currentTurnLog.length;

    // 플레이어 이벤트 → 기존 모달로 처리 (선택지 인터랙션 필요)
    for (const event of playerEvents) {
      addEventPulsesForEvent(event);
      const choiceId = await eventUI.show(event, state);
      processPlayerChoice(state, event, choiceId);
      updateUI();
    }

    // 플레이어 선택 로그 수집
    const playerChoiceLogs = state.currentTurnLog.slice(logMark);
    for (const entry of playerChoiceLogs) {
      resolutionItems.push({
        phase: '이벤트', icon: getLogIcon(entry.type),
        text: entry.message, type: entry.type,
      });
    }
    logMark = state.currentTurnLog.length;

    // ── Phase 2: AI 행동 ──
    for (const [factionId, faction] of Object.entries(state.factions)) {
      if (factionId === state.player.factionId) continue;
      if (!faction.active) continue;
      if (state.getCitiesOfFaction(factionId).length === 0) {
        faction.active = false;
        continue;
      }
      decideAndExecute(factionId, state, scenario.connections);
    }

    const aiLogs = state.currentTurnLog.slice(logMark);
    for (const entry of aiLogs) {
      resolutionItems.push({
        phase: 'AI 행동', icon: getLogIcon(entry.type),
        text: entry.message, type: entry.type,
      });
    }

    // ── Phase 3: 결산 ──
    // 자원 스냅샷 (endTurn 전)
    const playerFaction = state.getFaction(state.player.factionId);
    const goldBefore = playerFaction.gold;
    const playerCities = state.getCitiesOfFaction(state.player.factionId);
    const foodBefore = playerCities.reduce((sum, c) => sum + c.food, 0);

    const turnLogBefore = state.turnLog.length;
    const currentLogMark = state.currentTurnLog.length;

    endTurn(state); // settleAll → loyalty → defections → captives → construction → research → truces → gameOver → advanceMonth (clears currentTurnLog)

    // 자원 스냅샷 (endTurn 후)
    const goldAfter = playerFaction.gold;
    const playerCitiesAfter = state.getCitiesOfFaction(state.player.factionId);
    const foodAfter = playerCitiesAfter.reduce((sum, c) => sum + c.food, 0);

    // 결산 로그 수집 (advanceMonth가 currentTurnLog→turnLog로 이동시킴)
    const allNewTurnLogs = state.turnLog.slice(turnLogBefore);
    const settleLogs = allNewTurnLogs.slice(currentLogMark);

    // 금/식량 변동 요약
    const goldDelta = goldAfter - goldBefore;
    if (goldDelta !== 0) {
      resolutionItems.push({
        phase: '결산', icon: goldDelta >= 0 ? '💰' : '💸',
        text: `금 ${goldDelta >= 0 ? '+' : ''}${goldDelta.toLocaleString()} (보유: ${goldAfter.toLocaleString()})`,
        type: goldDelta >= 0 ? 'income' : 'warning',
      });
    }
    const foodDelta = foodAfter - foodBefore;
    if (foodDelta !== 0) {
      resolutionItems.push({
        phase: '결산', icon: foodDelta >= 0 ? '🌾' : '🔥',
        text: `식량 ${foodDelta >= 0 ? '+' : ''}${foodDelta.toLocaleString()}`,
        type: foodDelta >= 0 ? 'food' : 'warning',
      });
    }

    // 결산 페이즈 로그 (배신, 건설 완료, 연구 완료, 반란 등)
    const summaryItems = buildTurnSummary(state);
    for (const item of summaryItems) {
      resolutionItems.push(item);
    }

    for (const entry of settleLogs) {
      resolutionItems.push({
        phase: '결산', icon: getLogIcon(entry.type),
        text: entry.message, type: entry.type,
      });
    }

    // 아무 일도 없었으면 평화 메시지
    if (resolutionItems.length === 0) {
      resolutionItems.push({
        phase: '결산', icon: '☀️',
        text: '평화로운 한 달이 지나갔다.', type: 'info',
      });
    }

    // ── 결산 오버레이 표시 ──
    await turnResolution.show(resolutionItems, { state, summaryItems });

    // ── 후처리 ──
    detectAndAnimateMovements(armyBefore, ownerBefore, state);
    updateUI();
    updateTurnLog();
    uiState.openingActActive = isOpeningActActive(state.turn);
    const spotlight = buildTurnSpotlightSummary();
    if (spotlight) await showTurnSpotlight(spotlight);
    const bridge = buildTurnBridgeSummary();
    if (bridge) await showTurnBridgeCard(bridge);
    if (uiState.openingActActive) showTurnStartCard(state.turn);
    persistSave({ silent: true, source: 'auto' });

    if (state.gameOver) {
      showGameOver();
    }
  } catch (err) {
    console.error('Turn error:', err);
  } finally {
    processing = false;
    document.getElementById('btn-next-turn').disabled = false;
  }
}

function addEventPulsesForEvent(event) {
  if (!event || !map) return;

  // 이벤트 효과에서 도시 관련 정보 추출
  if (event.effects) {
    for (const effect of event.effects) {
      if (effect.type === 'territory_change' && effect.value?.city) {
        map.addEventPulse(effect.value.city, '#F39C12');
      }
      if (effect.type === 'army_change') {
        // 세력의 도시에 펄스
        const cities = state.getCitiesOfFaction(effect.target);
        if (cities.length > 0) {
          map.addEventPulse(cities[0].id, '#E74C3C');
        }
      }
    }
  }

  // 참가자의 도시에도 펄스
  if (event.participants) {
    for (const p of event.participants) {
      const char = state.getCharacter(p.character_id);
      if (char?.city) {
        map.addEventPulse(char.city, '#c9a84c');
      }
    }
  }
}

// --- 병력 이동 감지 + 애니메이션 ---
function detectAndAnimateMovements(armyBefore, ownerBefore, state) {
  if (!map) return;
  const movements = [];

  for (const [cityId, city] of Object.entries(state.cities)) {
    // 점령 감지: 소유자가 바뀜
    if (ownerBefore[cityId] && ownerBefore[cityId] !== city.owner && city.owner) {
      // 인접 도시 중 새 소유자 도시에서 온 것으로 추정
      const neighbors = getNeighborCities(cityId);
      const attackFrom = neighbors.find(n => state.cities[n]?.owner === city.owner);
      if (attackFrom) {
        movements.push({
          from: attackFrom, to: cityId,
          type: 'attack', factionId: city.owner
        });
      }
    }

    // 병력 대폭 증가 (보강): 인접 동맹 도시에서 온 것으로 추정
    const delta = city.army - (armyBefore[cityId] || 0);
    if (delta > 3000 && city.owner === ownerBefore[cityId]) {
      const neighbors = getNeighborCities(cityId);
      const reinforceFrom = neighbors.find(n => {
        const nc = state.cities[n];
        return nc && nc.owner === city.owner && (armyBefore[n] || 0) - nc.army > 2000;
      });
      if (reinforceFrom) {
        movements.push({
          from: reinforceFrom, to: cityId,
          type: 'reinforce', factionId: city.owner
        });
      }
    }
  }

  if (movements.length > 0) {
    map.animateMovements(movements);
  }
}

function getNeighborCities(cityId) {
  if (!scenario) return [];
  const neighbors = [];
  for (const [a, b] of scenario.connections) {
    if (a === cityId) neighbors.push(b);
    else if (b === cityId) neighbors.push(a);
  }
  return neighbors;
}

// --- UI 갱신 ---
function updateUI() {
  if (!state || !map) return;
  applyFactionSurfaceTheme(state.player.factionId);

  document.getElementById('year-display').textContent = `${state.year}년`;
  document.getElementById('month-display').textContent = `${state.month}월`;
  document.getElementById('turn-display').textContent = `턴 ${state.turn}`;

  const faction = state.getFaction(state.player.factionId);
  const factionNameEl = document.getElementById('faction-name');
  factionNameEl.textContent = faction.name;
  factionNameEl.style.background = FACTION_COLORS[state.player.factionId] || '#666';

  document.getElementById('gold-display').textContent = `금: ${faction.gold.toLocaleString()}`;
  document.getElementById('army-display').textContent = `총 병력: ${state.getTotalArmy(state.player.factionId).toLocaleString()}`;
  const actionsDisplay = document.getElementById('actions-display');
  actionsDisplay.textContent = `행동: ${state.actionsRemaining}/3`;
  actionsDisplay.dataset.state = state.actionsRemaining <= 0 ? 'empty' : state.actionsRemaining === 1 ? 'low' : 'ready';
  document.getElementById('rep-display').textContent = `평판: ${faction.reputation || 100}`;
  const nextTurnButton = document.getElementById('btn-next-turn');
  if (nextTurnButton) {
    const exhausted = state.actionsRemaining <= 0;
    nextTurnButton.dataset.state = exhausted ? 'end' : 'ready';
    nextTurnButton.textContent = exhausted ? '턴 종료' : '다음 턴';
    nextTurnButton.title = exhausted ? '남은 행동이 없어 턴을 마감합니다.' : '지금 턴을 넘기고 다음 달로 진행합니다.';
  }

  updateChronicleSummary();
  updateMapSelectionPanel();
  updateWarRoomBrief();
  updateCitySessionBoard();
  updateMapOverlayControls();
  updateOpeningHudBrief();
  actionPanel.setOpeningContext({
    active: uiState.openingActActive,
    turn: state.turn,
    factionId: state.player.factionId,
  });
  map.setOverlayMode(uiState.mapOverlayMode);
  map.render(state);
  if (map.selectedCity) {
    sidebar.showCityDetail(map.selectedCity, state);
    actionPanel.setContext(map.selectedCity, state);
    document.getElementById('game-screen').classList.add('city-rail-open');
    setSelectionFocus(true);
  } else {
    sidebar.showOverview(state);
    actionPanel.setContext(null, state);
    document.getElementById('game-screen').classList.remove('city-rail-open');
    setSelectionFocus(false);
  }
  updateTurnLogContent();
}

// --- 좌측 연대기 레일 토글 ---
function toggleLog() {
  const gameScreen = document.getElementById('game-screen');
  const btn = document.getElementById('btn-toggle-log');
  logVisible = !logVisible;
  gameScreen.classList.toggle('chronicle-collapsed', !logVisible);
  btn.classList.toggle('active', logVisible);
  btn.textContent = logVisible ? '전황 닫기' : '전황 열기';
}

function updateTurnLog() {
  updateTurnLogContent();
}

function updateTurnLogContent() {
  const logContent = document.getElementById('turn-log-content');
  if (!state || state.turnLog.length === 0) {
    logContent.innerHTML = '<div class="log-entry" style="color:var(--text-dim)">아직 기록이 없습니다</div>';
    return;
  }

  // 턴별로 그룹핑, 최근 턴부터
  const grouped = new Map();
  for (const entry of state.turnLog) {
    const key = entry.turn;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  }

  logContent.innerHTML = '';
  const turns = [...grouped.keys()].sort((a, b) => b - a);

  // 최근 20턴만 표시
  for (const turn of turns.slice(0, 20)) {
    const entries = grouped.get(turn);
    const first = entries[0];

    const header = document.createElement('div');
    header.className = 'log-turn-header';
    header.innerHTML = `<span class="log-turn-date">${first.year}년 ${first.month}월</span><span class="log-turn-meta">턴 ${turn}</span>`;
    logContent.appendChild(header);

    for (const entry of entries) {
      const div = document.createElement('div');
      div.className = `log-entry ${entry.type}`;
      div.innerHTML = `<span class="log-entry-icon">${getLogIcon(entry.type)}</span><span class="log-entry-text">${entry.message}</span>`;
      logContent.appendChild(div);
    }
  }
}

function updateChronicleSummary() {
  const dateEl = document.getElementById('chronicle-date');
  const factionsEl = document.getElementById('chronicle-factions');
  const sessionBoardEl = document.getElementById('chronicle-session-board');
  if (!dateEl || !factionsEl || !state) return;

  dateEl.textContent = `${state.year}년 ${state.month}월 · 턴 ${state.turn}`;

  const ranked = Object.entries(state.factions)
    .filter(([, faction]) => faction.active)
    .map(([factionId, faction]) => {
      const cities = state.getCitiesOfFaction(factionId);
      const army = state.getTotalArmy(factionId);
      const score = cities.length * 100000 + army + (faction.reputation || 100) * 100;
      return { factionId, faction, cities, army, score };
    })
    .sort((a, b) => b.score - a.score);

  factionsEl.innerHTML = ranked.slice(0, 5).map((entry, index) => `
    <div class="chronicle-faction">
      <div class="chronicle-faction-rank">${index + 1}</div>
      <div class="chronicle-faction-main">
        <div class="chronicle-faction-name">
          <span class="chronicle-faction-dot" style="background:${FACTION_COLORS[entry.factionId] || '#666'}"></span>
          <span>${entry.faction.name}</span>
        </div>
        <div class="chronicle-faction-meta">${entry.cities.length}성 · 병력 ${formatArmy(entry.army)} · 평판 ${entry.faction.reputation || 100}</div>
      </div>
      <div class="chronicle-faction-score">보유 ${entry.cities.length}성<br>총군 ${entry.army.toLocaleString()}</div>
    </div>
  `).join('');
  if (sessionBoardEl) {
    sessionBoardEl.innerHTML = renderChronicleSessionBoard({ ranked });
  }
}

function updateMapSelectionPanel() {
  const panel = document.getElementById('map-selection-panel');
  const cityEl = document.getElementById('map-selection-city');
  const ownerEl = document.getElementById('map-selection-owner');
  const sessionEl = document.getElementById('map-selection-session');
  const decisionEl = document.getElementById('map-selection-decision');
  const controlHintEl = document.getElementById('map-selection-control-hint');
  const overlayButton = document.getElementById('btn-toggle-frontline-overlay-dock');
  const button = document.getElementById('btn-open-command');
  const refocusButton = document.getElementById('btn-refocus-city');
  const actionButtons = document.querySelector('.map-selection-actions');
  const railButton = document.getElementById('btn-open-command-rail');
  const railNote = document.getElementById('city-rail-cta-note');
  if (!panel || !cityEl || !ownerEl || !sessionEl || !decisionEl || !controlHintEl || !overlayButton || !button || !refocusButton || !actionButtons || !railButton || !railNote) return;
  const frame = buildBattlefieldSessionFrame(map?.selectedCity || null);

  if (frame.state === 'overview') {
    panel.dataset.tone = 'own';
    panel.dataset.state = 'empty';
    panel.dataset.scene = 'overview';
    actionButtons.dataset.mode = 'overview';
    panel.classList.remove('hidden');
    panel.classList.add('visible');
    cityEl.textContent = frame.title;
    ownerEl.textContent = frame.ownerLine;
    sessionEl.innerHTML = renderMapSelectionSession(frame);
    decisionEl.innerHTML = renderBattlefieldFieldUtilityDeck(frame);
    overlayButton.innerHTML = renderMapActionButtonLabel(frame.overlayActive ? '전선 시야 중' : '전선 시야', 'V');
    overlayButton.disabled = false;
    overlayButton.dataset.active = frame.overlayActive ? 'true' : 'false';
    overlayButton.title = frame.overlayActive
      ? '접경 거점과 지원로 강조를 끕니다. 단축키 V'
      : '접경 거점과 지원로 강조를 켭니다. 단축키 V';
    button.hidden = false;
    button.innerHTML = renderMapActionButtonLabel('도시 선택 필요', 'Enter');
    button.disabled = true;
    delete button.dataset.tone;
    refocusButton.hidden = true;
    refocusButton.textContent = '재집중';
    refocusButton.disabled = true;
    refocusButton.title = '도시를 선택하면 F로 다시 이 거점에 시선을 맞출 수 있습니다.';
    delete refocusButton.dataset.tone;
    railButton.textContent = '도시 선택 필요';
    railButton.disabled = true;
    delete railButton.dataset.tone;
    delete railNote.dataset.tone;
    railNote.textContent = '도시를 선택하면 이곳에서 바로 결정 패널로 들어갑니다.';
    controlHintEl.innerHTML = renderMapControlHint([
      { type: 'text', value: '지도의 도시' },
      { type: 'text', value: '또는 아래 접경 후보를 눌러 세션 시작' },
      { type: 'key', value: 'V' },
      { type: 'text', value: '전선 시야 전환' },
    ]);
    return;
  }

  panel.dataset.tone = frame.tone;
  panel.dataset.state = 'active';
  panel.dataset.scene = frame.sceneLabel;
  actionButtons.dataset.mode = 'utility';
  panel.classList.remove('hidden');
  panel.classList.add('visible');
  cityEl.textContent = frame.title;
  ownerEl.textContent = frame.selection?.ownerLine || frame.ownerLine;
  sessionEl.innerHTML = renderMapSelectionSession(frame);
  decisionEl.innerHTML = renderBattlefieldFieldUtilityDeck(frame);
  overlayButton.innerHTML = renderMapActionButtonLabel(frame.overlayActive ? '전선 시야 중' : '전선 시야', 'V');
  overlayButton.disabled = false;
  overlayButton.dataset.active = frame.overlayActive ? 'true' : 'false';
  overlayButton.title = frame.overlayActive
    ? '접경 거점과 지원로 강조를 끕니다. 단축키 V'
    : '접경 거점과 지원로 강조를 켭니다. 단축키 V';
  controlHintEl.innerHTML = renderMapControlHint([
    { type: 'key', value: 'Space' },
    { type: 'key', value: 'Enter' },
    { type: 'text', value: frame.selection?.buttonLabel || '명령 열기' },
    { type: 'key', value: 'V' },
    { type: 'text', value: '전선 시야' },
    { type: 'key', value: 'F' },
    { type: 'text', value: '재집중' },
    { type: 'key', value: 'Esc' },
    { type: 'key', value: '우클릭' },
    { type: 'text', value: '선택 해제' },
    { type: 'text', value: '드래그 · 지도 이동' },
  ]);
  refocusButton.hidden = false;
  refocusButton.innerHTML = renderMapActionButtonLabel('재집중', 'F');
  refocusButton.disabled = false;
  refocusButton.title = `${frame.title}에 다시 시선을 맞춥니다. 단축키 F`;
  refocusButton.dataset.tone = frame.tone;
  button.hidden = false;
  button.innerHTML = renderMapActionButtonLabel(frame.selection?.buttonLabel || '명령 열기', 'Enter');
  button.disabled = false;
  button.dataset.tone = frame.tone;
  railButton.innerHTML = renderMapActionButtonLabel(frame.selection?.buttonLabel || '명령 열기', 'Enter');
  railButton.disabled = false;
  railButton.dataset.tone = frame.tone;
  railNote.dataset.tone = frame.tone;
  railNote.innerHTML = renderCityRailNote(frame);
}

async function openSelectedCityCommandInternal(sceneId = null) {
  if (!map?.selectedCity || !state || processing) return;
  const city = state.cities[map.selectedCity];
  const ownCity = city?.owner === state.player.factionId;
  const availableScenes = getCommandScenesForCity(map.selectedCity);
  const battlefieldDirector = buildBattlefieldDirectorPacket({
    state,
    scenario,
    cityId: map.selectedCity,
  });
  const fallbackSceneId = resolveRecommendedCommandSceneId(map.selectedCity, battlefieldDirector);
  const targetSceneId = sceneId && availableScenes.includes(sceneId)
    ? sceneId
    : fallbackSceneId && availableScenes.includes(fallbackSceneId)
      ? fallbackSceneId
      : null;
  const targetSceneMeta = targetSceneId ? COMMAND_SCENES[targetSceneId] : null;
  hideTurnSpotlight({ immediate: true });
  hideTurnStartCard({ immediate: true });
  await showSceneTransitionCard({
    kicker: targetSceneMeta ? `${targetSceneMeta.name} 장면` : ownCity ? '작전 장면' : '정세 장면',
    title: targetSceneMeta
      ? `${city.name} ${targetSceneMeta.name} 장면으로 들어갑니다`
      : ownCity ? `${city.name} 군의실로 들어갑니다` : `${city.name} 전황 분석으로 들어갑니다`,
    body: targetSceneMeta
      ? ownCity
        ? targetSceneMeta.captionOwned
        : targetSceneMeta.captionForeign
      : ownCity
        ? '시정, 군사, 외교 중 이번 턴 하나를 결정 패널에서 바로 확정합니다.'
        : '적 도시의 병력, 외교, 침공 가능성을 읽고 결정 패널에서 이번 턴 대응을 바로 정합니다.',
    duration: 620,
    variant: 'command',
  });
  actionPanel.open(map.selectedCity, state, targetSceneId || undefined);
  updateOpeningHudBrief();
  uiState.commandSpotlightShown = true;
}

async function openSelectedCityCommand() {
  await openSelectedCityCommandInternal();
}

async function openSelectedCityCommandScene(sceneId) {
  const normalizedSceneId = normalizeCommandSceneId(sceneId);
  await openSelectedCityCommandInternal(normalizedSceneId);
}

function formatArmy(value) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}만`;
  if (value >= 1000) return `${Math.floor(value / 1000)}천`;
  return value.toLocaleString();
}

function showGameOver() {
  const modal = document.getElementById('gameover-modal');
  const title = document.getElementById('gameover-title');
  const message = document.getElementById('gameover-message');
  const stats = document.getElementById('gameover-stats');

  if (state.winner === state.player.factionId) {
    title.textContent = '천하통일';
    message.textContent = `${state.factions[state.winner].name}이(가) 천하를 통일했습니다!`;
  } else if (state.winner) {
    title.textContent = '패배';
    message.textContent = `${state.factions[state.winner].name}이(가) 천하를 통일했습니다.`;
  } else {
    title.textContent = '멸망';
    message.textContent = '당신의 세력이 역사에서 사라졌습니다.';
  }

  stats.innerHTML = `
    <div class="stat-row"><span class="stat-label">플레이 턴</span><span class="stat-value">${state.turn}</span></div>
    <div class="stat-row"><span class="stat-label">최종 연도</span><span class="stat-value">${state.year}년 ${state.month}월</span></div>
    <div class="stat-row"><span class="stat-label">발화 이벤트</span><span class="stat-value">${state.firedEvents.length}개</span></div>
    <div class="stat-row"><span class="stat-label">보유 도시</span><span class="stat-value">${state.getCitiesOfFaction(state.player.factionId).length}개</span></div>
  `;

  modal.classList.remove('hidden');
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = 'position:fixed;top:76px;left:50%;transform:translateX(-50%);background:linear-gradient(180deg,#dabb7b 0%,#b88a3e 100%);color:#24160b;padding:0.65rem 1.5rem;border-radius:999px;border:1px solid rgba(96,63,22,0.5);font-weight:700;font-size:0.85rem;z-index:200;opacity:0;transition:opacity 0.3s;box-shadow:0 12px 24px rgba(0,0,0,0.24)';
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; });
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 1500);
}

// --- Playwright / 디버그 테스트 훅 ---
function exposeTestHooks() {
  if (typeof window === 'undefined') return;
  window.__wdttgukji = {
    getState: () => state,
    getScenario: () => scenario,
    getMapCamera: () => map ? { ...map.camera } : null,
    getVisibleScreen: () => getVisibleScreenId(),
    getSelectedFaction: () => selectedFaction,
    getSelectedCity: () => map?.selectedCity || null,
    isCommandOpen: () => actionPanel?.isOpen?.() || false,
    getCommandScene: () => document.getElementById('action-panel')?.dataset?.scene || null,
    selectFaction: (factionId) => {
      const card = document.querySelector(`.faction-card[data-faction="${factionId}"]`);
      if (!card) return false;
      card.click();
      return true;
    },
    showIntro: async () => {
      await showIntro();
      return true;
    },
    advanceDialogue: () => {
      advanceDialogue();
      return true;
    },
    startGame: async () => {
      await startNewGame();
      return true;
    },
    persistSave: () => persistSave({ silent: true, source: 'auto' }),
    loadSave: async () => {
      await loadGame();
      return true;
    },
    runTurnForTest: async () => {
      if (!state || processing) return false;
      const originalEventShow = eventUI.show.bind(eventUI);
      const originalResolutionShow = turnResolution.show.bind(turnResolution);
      eventUI.show = async (event) => event.choices?.[0]?.id || null;
      turnResolution.show = async () => {};
      try {
        await nextTurn();
        return true;
      } finally {
        eventUI.show = originalEventShow;
        turnResolution.show = originalResolutionShow;
      }
    },
    selectCity: (cityId) => {
      if (!state || !map || !state.cities?.[cityId]) return false;
      return selectCityById(cityId, { immediate: true, showReaction: true });
    },
    openCommand: (cityId = null, sceneKey = null) => {
      const targetCity = cityId || map?.selectedCity;
      if (!targetCity || !state) return false;
      actionPanel.open(targetCity, state, sceneKey || undefined);
      return true;
    },
    executeAction: (actionType, params = {}) => {
      if (!actionPanel?.onAction) return false;
      return actionPanel.onAction(actionType, params);
    },
    setCommandScene: (sceneKey) => {
      if (!actionPanel?.isOpen?.()) return false;
      actionPanel.switchScene(sceneKey);
      return true;
    },
    registerTurnDirectorProvider: (provider, options = {}) => {
      registerTurnDirectorProvider(provider, options);
      updateUI();
      return true;
    },
    clearTurnDirectorProvider: () => {
      registerTurnDirectorProvider(null);
      updateUI();
      return true;
    },
  };
}

// --- 부트 ---
init();
exposeTestHooks();
