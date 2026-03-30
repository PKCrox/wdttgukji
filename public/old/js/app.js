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
const SCREEN_IDS = ['start-screen', 'faction-screen', 'intro-screen', 'game-screen'];
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
};
let viewportLayoutRaf = 0;

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
    startCols: compactDesktop ? 'minmax(0,1fr) 332px' : 'minmax(0,1.08fr) 372px',
    factionCols: compactDesktop ? '206px minmax(0,1fr) 260px' : '224px minmax(0,1fr) 292px',
    introCols: compactDesktop ? '220px minmax(0,1fr)' : '244px minmax(0,1fr)',
    battlefieldCols: compactDesktop ? '180px minmax(0,1fr) 236px' : '192px minmax(0,1fr) 248px',
    battlefieldCollapsedCols: compactDesktop ? '0 minmax(0,1fr) 236px' : '0 minmax(0,1fr) 248px',
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

// --- 초기화 ---
async function init() {
  applyViewportLayoutLock();
  eventUI = new EventUI();
  sidebar = new Sidebar();
  actionPanel = new ActionPanel();
  turnResolution = new TurnResolution();

  // 버튼 바인딩
  document.getElementById('btn-new-game').addEventListener('click', () => { void showFactionSelect(); });
  document.getElementById('btn-load-game').addEventListener('click', loadGame);
  document.getElementById('btn-next-turn').addEventListener('click', nextTurn);
  document.getElementById('btn-save').addEventListener('click', saveGame);
  document.getElementById('btn-menu').addEventListener('click', returnToMenu);
  document.getElementById('btn-restart').addEventListener('click', returnToMenu);
  document.getElementById('btn-confirm-faction').addEventListener('click', () => { void showIntro(); });
  document.getElementById('btn-back-to-start').addEventListener('click', () => { void backToStart(); });
  document.getElementById('btn-start-game').addEventListener('click', startNewGame);
  document.getElementById('intro-dialogue').addEventListener('click', advanceDialogue);
  document.getElementById('btn-open-command').addEventListener('click', openSelectedCityCommand);

  document.getElementById('btn-toggle-log').addEventListener('click', toggleLog);
  window.addEventListener('resize', scheduleViewportLayoutLock);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (document.getElementById('game-screen').classList.contains('hidden')) return;
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
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    return { glyph: '戰', copy: '군령 인준', tone: 'military' };
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
  const compact = isShortViewport();
  const panel = document.getElementById('war-room-brief');

  const title = compact && payload.selectedCity
    ? `${payload.selectedCity.name} · ${payload.openingBeat?.title || '첫 명령'}`
    : payload.selectedCity
    ? `${payload.selectedCity.name}에 시선을 고정하십시오`
    : payload.openingBeat?.title || `${payload.factionName}의 첫 10분 동선을 제시합니다`;
  const objective = payload.selectedCity
    ? payload.selectedCity.owner === state.player.factionId
      ? `${payload.selectedCity.name}은(는) 현재 당신의 거점입니다. ${payload.action}`
      : `${payload.selectedCity.name}은(는) 외부 전선입니다. ${payload.action}`
    : payload.objective;
  const compactObjective = payload.selectedCity
    ? payload.action
    : `${payload.focus} · ${payload.action}`;

  document.getElementById('war-room-title').textContent = title;
  document.getElementById('war-room-objective').textContent = compact ? compactObjective : objective;
  document.getElementById('war-room-action').textContent = payload.action;
  document.getElementById('war-room-focus').textContent = payload.focus;
  document.getElementById('war-room-risk').textContent = payload.risk;
  document.getElementById('war-room-kicker').textContent =
    uiState.openingActActive && payload.openingBeat
      ? `오프닝 액트 ${Math.min(state.turn, 3)}`
      : payload.selectedCity ? '현장 브리프' : '작전 브리프';
  if (panel) panel.dataset.layout = compact ? 'compact' : 'full';
}

function updateOpeningHudBrief() {
  const container = document.getElementById('opening-hud-brief');
  if (!container) return;
  if (!uiState.openingActActive || !state?.player?.factionId) {
    container.classList.add('hidden');
    return;
  }
  const beat = getOpeningActPayload(state.turn, state.player.factionId);
  document.getElementById('opening-hud-kicker').textContent = `오프닝 액트 ${Math.min(state.turn, 3)}`;
  document.getElementById('opening-hud-title').textContent = beat?.action || beat?.title || '첫 목표를 진행하십시오';
  container.classList.remove('hidden');
}

function updateIntroGuidance(factionId) {
  const box = document.getElementById('intro-guidance');
  if (!box || !scenario) return;
  const focusCity = getOpeningFocusCity(factionId, null, scenario);
  const beat1 = getOpeningActBeat(factionId, 1);
  const beat2 = getOpeningActBeat(factionId, 2);
  const beat3 = getOpeningActBeat(factionId, 3);

  box.innerHTML = `
    <div class="intro-guidance-card">
      <span class="intro-guidance-label">1턴</span>
      <strong>${beat1?.title || (OPENING_OBJECTIVES[factionId] || [])[0] || '첫 목표를 설정하십시오.'}<br>${beat1?.action || getRecommendedActionText(factionId, focusCity, true)}</strong>
    </div>
    <div class="intro-guidance-card">
      <span class="intro-guidance-label">2턴</span>
      <strong>${beat2?.title || (OPENING_OBJECTIVES[factionId] || [])[1] || '두 번째 목표를 설정하십시오.'}<br>${beat2?.objective || '다음 파도를 버틸 선택을 준비하십시오.'}</strong>
    </div>
    <div class="intro-guidance-card">
      <span class="intro-guidance-label">3턴</span>
      <strong>${focusCity?.name || '전장 전체'} · ${beat3?.risk || '세 번째 턴에는 판세 리스크를 확인하십시오.'}</strong>
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
  panel.dataset.tone = tone;
  document.getElementById('turn-bridge-kicker').textContent = kicker || '전선 재배치';
  document.getElementById('turn-bridge-title').textContent = title;
  document.getElementById('turn-bridge-body').textContent = body || '';
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
  panel.dataset.tone = beat.preferredScene || 'opening';

  document.getElementById('turn-start-kicker').textContent = `턴 ${turn} 개시`;
  document.getElementById('turn-start-title').textContent = beat.title || '다음 판단을 정리하십시오';
  document.getElementById('turn-start-body').textContent = `${beat.objective || beat.action || '핵심 거점을 먼저 확인하십시오.'} ${beat.action || ''}`.trim();
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
      fieldBody: '',
    };
  }

  const faction = city.owner ? state.factions?.[city.owner] : null;
  if (city.owner === state?.player?.factionId) {
    return {
      tone: 'selection',
      panelTone: 'own',
      kicker: '거점 보고',
      title: `${city.name} 거점 장부를 엽니다`,
      ownerLine: `${faction?.name || '아군'} · 병력 ${city.army.toLocaleString()} · 사기 ${city.morale}`,
      action: getRecommendedActionText(state.player.factionId, city, true),
      scene: '시정 또는 군사 장면',
      buttonLabel: `${city.name} 명령`,
      fieldBody: '내정, 병참, 장수 배치를 바로 손댈 수 있는 아군 거점입니다.',
    };
  }

  if (!city.owner) {
    return {
      tone: 'opportunity',
      panelTone: 'neutral',
      kicker: '점령 관측',
      title: `${city.name} 점령 각을 살핍니다`,
      ownerLine: `무주지 · 병력 ${city.army.toLocaleString()} · 사기 ${city.morale}`,
      action: `${city.name}는 아직 주인이 없습니다. 병력 두께와 인접 거점을 확인한 뒤 바로 점령 압박이나 선점 수비를 고려하십시오.`,
      scene: '군사 장면',
      buttonLabel: `${city.name} 점령 구상`,
      fieldBody: '비어 있는 깃발입니다. 선점만 성공하면 다음 전선의 발판이 됩니다.',
    };
  }

  return {
    tone: 'hostile',
    panelTone: 'hostile',
    kicker: '적정 관측',
    title: `${city.name} 적 전선을 관측합니다`,
    ownerLine: `${faction?.name || '적 세력'} · 병력 ${city.army.toLocaleString()} · 사기 ${city.morale}`,
    action: `${city.name}의 병력과 배후 연결을 먼저 읽으십시오. 외교로 칼끝을 무디게 하거나 군사 장면에서 공세 각을 비교하는 편이 안전합니다.`,
    scene: '군사 또는 외교 장면',
    buttonLabel: `${city.name} 정세 보기`,
    fieldBody: '적의 병력 두께와 지원선을 먼저 읽고 외교 혹은 공세 각을 비교해야 합니다.',
  };
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
  panel.dataset.tone = tone;
  document.getElementById('field-reaction-kicker').textContent = kicker;
  document.getElementById('field-reaction-title').textContent = title;
  if (bodyEl) {
    const reactionBody = shortenReactionBody(body);
    bodyEl.textContent = reactionBody;
    bodyEl.classList.toggle('hidden', !reactionBody);
  }
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('visible'));
  clearTimeout(uiState.fieldReactionTimer);
  uiState.fieldReactionTimer = setTimeout(() => {
    panel.classList.remove('visible');
    setTimeout(() => panel.classList.add('hidden'), 180);
  }, 1600);
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
  const focusCity = brief?.focus || getOpeningFocusCity(playerFactionId)?.name || '전선';
  const monthLabel = `${state?.year || 208}년 ${state?.month || 1}월`;
  let tone = beat ? 'opening' : 'neutral';
  if ((summary?.relationshipChanges || []).length > 0) tone = 'diplomacy';
  if ((summary?.buildingsCompleted || []).length > 0) tone = 'fortify';
  if ((summary?.techCompleted || []).length > 0) tone = 'growth';
  return {
    kicker: `${monthLabel} 전장 재정렬`,
    title: beat?.title || `${focusCity} 쪽 전선이 다시 움직입니다`,
    body: beat?.action || beat?.objective || `${focusCity}부터 열고 이번 달 첫 판단을 내리십시오.`,
    tone,
  };
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

// --- 세력 선택 화면 ---
async function showFactionSelect() {
  try {
    scenario = await loadScenario('/engine/data/scenarios/208-red-cliffs.json');
    const rawEvents = await loadEvents('/data/events/all-events.json');
    allEvents = filterEventsForScenario(rawEvents, 208, 225);
  } catch (err) {
    console.error('Failed to load scenario:', err);
    alert('게임 데이터 로드 실패: ' + err.message);
    return;
  }

  applyScenarioMapArt(scenario);

  selectedFaction = null;
  const confirmBtn = document.getElementById('btn-confirm-faction');
  confirmBtn.disabled = true;
  confirmBtn.textContent = '세력을 선택하십시오';

  const container = document.getElementById('faction-cards');
  container.innerHTML = '';

  const COLORS = { wei: '#4A90D9', shu: '#2ECC71', wu: '#E74C3C', liu_zhang: '#F39C12', zhang_lu: '#9B59B6' };
  const ORDER = ['wei', 'shu', 'wu', 'liu_zhang', 'zhang_lu'];

  for (const fid of ORDER) {
    const snapshot = getFactionSnapshot(scenario, fid);
    const { faction: f, meta, cities, army, characters } = snapshot;

    const card = document.createElement('div');
    card.className = 'faction-card';
    card.dataset.faction = fid;
    card.innerHTML = `
      <span class="faction-card-diff ${meta.diff}">${meta.diffLabel}</span>
      <div class="faction-card-name">
        <span class="faction-card-dot" style="background:${COLORS[fid]}"></span>
        ${f.name}
      </div>
      <div class="faction-card-leader">${meta.leader}</div>
      <div class="faction-card-tags">${getFactionCardTags(fid).map((tag) => `<span>${tag}</span>`).join('')}</div>
      <div class="faction-card-stats">
        <span>도시 <span class="val">${cities.length}성</span></span>
        <span>병력 <span class="val">${(army/10000).toFixed(1)}만</span></span>
        <span>자금 <span class="val">${f.gold.toLocaleString()}</span></span>
        <span>장수 <span class="val">${characters.length}명</span></span>
      </div>
      <div class="faction-card-desc">${meta.desc}</div>
    `;

    card.addEventListener('click', () => {
      container.querySelectorAll('.faction-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedFaction = fid;
      confirmBtn.disabled = false;
      confirmBtn.textContent = `${f.name}으로 출정`;
      renderFactionPreviewMap(scenario, fid);
      renderFactionPreviewPanel(scenario, fid);
    });

    container.appendChild(card);
  }

  // 정사/연의 모드 셀렉터
  let modeContainer = document.getElementById('narrative-mode-selector');
  if (!modeContainer) {
    modeContainer = document.createElement('div');
    modeContainer.id = 'narrative-mode-selector';
    modeContainer.style.cssText = 'display:flex;gap:8px;justify-content:center;margin:12px 0 4px';
    const modes = [
      { id: 'both', label: '혼합', desc: '정사+연의 모두' },
      { id: 'history', label: '정사', desc: '역사 기록 기반' },
      { id: 'romance', label: '연의', desc: '소설적 드라마' },
    ];
    for (const m of modes) {
      const btn = document.createElement('button');
      btn.className = 'mode-btn' + (m.id === selectedNarrativeMode ? ' active' : '');
      btn.dataset.mode = m.id;
      btn.title = m.desc;
      btn.textContent = m.label;
      btn.style.cssText = 'padding:6px 16px;border:1px solid #555;border-radius:4px;background:' +
        (m.id === selectedNarrativeMode ? '#c9a84c' : '#2a2a2a') + ';color:' +
        (m.id === selectedNarrativeMode ? '#1a1a1a' : '#ccc') + ';cursor:pointer;font-size:13px';
      btn.addEventListener('click', () => {
        selectedNarrativeMode = m.id;
        modeContainer.querySelectorAll('button').forEach(b => {
          const isActive = b.dataset.mode === m.id;
          b.style.background = isActive ? '#c9a84c' : '#2a2a2a';
          b.style.color = isActive ? '#1a1a1a' : '#ccc';
        });
      });
      modeContainer.appendChild(btn);
    }
    document.getElementById('faction-cards').before(modeContainer);
  }

  await switchScreen('faction-screen', {
    kicker: '전장 개시',
    title: '누구의 깃발 아래 설 것인가',
    body: '세력을 고르면 즉시 전장 위치와 첫 행동 추천이 갱신됩니다.',
  });

  renderFactionPreviewMap(scenario, null);
  renderFactionPreviewPanel(scenario, null);
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

function renderFactionPreviewPanel(sc, factionId) {
  const panel = document.getElementById('faction-preview-card');
  if (!panel || !sc) return;

  const COLORS = {
    wei: '#4A90D9',
    shu: '#2ECC71',
    wu: '#E74C3C',
    liu_zhang: '#F39C12',
    zhang_lu: '#9B59B6'
  };

  if (!factionId) {
    panel.innerHTML = `
      <div class="faction-preview-kicker">적벽대전 전장</div>
      <div class="faction-preview-title">누구의 깃발 아래 설 것인가</div>
      <div class="faction-preview-copy">
        위는 남하를 강행하고, 오는 장강을 붙들며, 촉은 생존과 외교 사이를 줄타기합니다.
        익주와 한중 역시 관망만으로는 버틸 수 없습니다.
      </div>
      <div class="faction-preview-grid">
        <div class="faction-preview-stat"><span class="label">핵심 축</span><span class="value">조조 · 유비 · 손권</span></div>
        <div class="faction-preview-stat"><span class="label">시작 압박</span><span class="value">남하 / 연합 / 생존</span></div>
        <div class="faction-preview-stat"><span class="label">판세 성격</span><span class="value">외교와 전쟁 동시 개막</span></div>
        <div class="faction-preview-stat"><span class="label">추천 흐름</span><span class="value">좌측에서 세력을 고르십시오</span></div>
      </div>
      <div class="faction-preview-cue-board">
        <div class="faction-preview-cue">
          <span class="label">쉬운 시작</span>
          <strong>위</strong>
          <p>병력과 도시 수가 많아 첫 10분이 가장 읽기 쉽습니다.</p>
        </div>
        <div class="faction-preview-cue">
          <span class="label">드라마형</span>
          <strong>촉</strong>
          <p>생존과 외교를 섞어야 해서 첫 세 턴 감정 곡선이 큽니다.</p>
        </div>
        <div class="faction-preview-cue">
          <span class="label">균형형</span>
          <strong>오</strong>
          <p>방어와 결전 준비를 모두 맛볼 수 있는 중간 선택지입니다.</p>
        </div>
      </div>
      <div class="faction-preview-footer">좌측에서 세력을 선택하면 시작 목표와 전력, 전장 위치가 즉시 갱신됩니다.</div>
    `;
    return;
  }

  const snapshot = getFactionSnapshot(sc, factionId);
  const { faction, meta, cities, army, characters, allies, enemies } = snapshot;
  const objectives = OPENING_OBJECTIVES[factionId] || [];
  const compareRows = getFactionComparisonLines(factionId, snapshot);
  const color = COLORS[factionId] || '#c19a55';
  const beats = [1, 2, 3].map((turn) => getOpeningActBeat(factionId, turn)).filter(Boolean);
  const tags = getFactionCardTags(factionId);

  panel.innerHTML = `
    <div class="faction-preview-kicker" style="color:${color}">${meta.diffLabel} 난도</div>
    <div class="faction-preview-title">${faction.name}</div>
    <div class="faction-preview-meta">${meta.leader}</div>
    <div class="faction-preview-copy">${meta.desc}</div>
    <div class="faction-preview-tag-row">
      ${tags.map((tag) => `<span>${tag}</span>`).join('')}
    </div>
    <div class="faction-preview-playcue">${getFactionPlayCue(factionId)}</div>
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
}

async function backToStart() {
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

  document.getElementById('intro-title').textContent = `${f.name} — ${meta.leader}`;
  document.getElementById('intro-brief').textContent = meta.desc;
  document.getElementById('intro-narrative').innerHTML = meta.intro.map(p => `<p>${p}</p>`).join('');
  document.getElementById('intro-stats').innerHTML = `
    <div class="intro-stat"><div class="label">영토</div><div class="value">${cities.length}성</div></div>
    <div class="intro-stat"><div class="label">병력</div><div class="value">${(army/10000).toFixed(1)}만</div></div>
    <div class="intro-stat"><div class="label">장수</div><div class="value">${characters.length}명</div></div>
    <div class="intro-stat"><div class="label">자금</div><div class="value">${f.gold.toLocaleString()}</div></div>
    <div class="intro-stat"><div class="label">우호</div><div class="value">${allies.join(' · ') || '없음'}</div></div>
    <div class="intro-stat"><div class="label">적대</div><div class="value">${enemies.join(' · ') || '없음'}</div></div>
  `;
  document.getElementById('intro-objectives').innerHTML = `
    <h3>출정 목표</h3>
    <ul>${(OPENING_OBJECTIVES[selectedFaction] || []).map(line => `<li>${line}</li>`).join('')}</ul>
  `;
  updateIntroGuidance(selectedFaction);

  // 대화 시퀀스 초기화
  const lines = FACTION_DIALOGUES[selectedFaction] || [];
  dialogueState = { lines, index: 0 };
  const dlgEl = document.getElementById('intro-dialogue');
  const startBtn = document.getElementById('btn-start-game');

  if (lines.length > 0) {
    dlgEl.classList.remove('hidden');
    startBtn.classList.add('hidden');
    showDialogueLine();
  } else {
    dlgEl.classList.add('hidden');
    startBtn.classList.remove('hidden');
  }
  startBtn.textContent = `${f.name}의 운명을 맡는다`;

  await switchScreen('intro-screen', {
    kicker: '출정 문서',
    title: `${f.name}의 운명을 맡습니다`,
    body: '짧은 장면 뒤에 바로 첫 명령과 핵심 거점이 안내됩니다.',
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
  textEl.textContent = '';
  progressEl.textContent = `${index + 1} / ${lines.length}`;

  // 타이핑 애니메이션
  let charIdx = 0;
  const chars = [...line.text];
  if (dialogueState._timer) clearInterval(dialogueState._timer);
  dialogueState._typing = true;

  dialogueState._timer = setInterval(() => {
    if (charIdx < chars.length) {
      textEl.textContent += chars[charIdx];
      charIdx++;
    } else {
      clearInterval(dialogueState._timer);
      dialogueState._typing = false;
    }
  }, 30);
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
  // 선택한 세력으로 오버라이드
  if (selectedFaction) {
    scenario.playerFaction = selectedFaction;
    scenario.playerCharacter = FACTION_LEADERS[selectedFaction];
  }

  // 정사/연의 모드 적용
  scenario.narrativeMode = selectedNarrativeMode;
  state = new GameState(scenario);
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
    selectedNarrativeMode = state.narrativeMode || 'both';
    scenario = await loadScenario('/engine/data/scenarios/208-red-cliffs.json');
    const rawEvents = await loadEvents('/data/events/all-events.json');
    allEvents = filterEventsForScenario(rawEvents, 208, 225);
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

function selectCityFromCanvasPoint(x, y) {
  const cityId = map.hitTest(x, y);

  if (cityId) {
    const selection = getCitySelectionProfile(cityId);
    map.selectedCity = cityId;
    map.focusOnCity(cityId);
    map.signalSelection(cityId, selection.tone);
    map.addEventPulse(cityId, getSelectionPulseColor(selection.tone));
    sidebar.showCityDetail(cityId, state);
    actionPanel.setContext(cityId, state);
    document.getElementById('game-screen').classList.add('city-rail-open');
    showFieldReaction({
      kicker: selection.kicker,
      title: selection.title,
      body: selection.fieldBody,
      tone: selection.tone,
    });
  } else {
    map.selectedCity = null;
    sidebar.clearCityDetail(state);
    actionPanel.setContext(null, state);
    actionPanel.hide();
    document.getElementById('game-screen').classList.remove('city-rail-open');
  }

  updateMapSelectionPanel();
  updateWarRoomBrief();
  map.render(state);
}

function updateMapHoverFromCanvasPoint(canvas, x, y, force = false) {
  const cityId = map.hitTest(x, y);
  if (!force && cityId === map.hoveredCity) return;
  map.hoveredCity = cityId;
  canvas.style.cursor = cityId ? 'pointer' : 'grab';
  map.render(state);
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
  updateMapSelectionPanel();
  updateWarRoomBrief();
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
  document.getElementById('btn-toggle-log').classList.remove('active');
  document.getElementById('btn-toggle-log').textContent = '전황 열기';
  logVisible = false;
  applyScenarioMapArt(scenario);

  // 맵 초기화
  const canvas = document.getElementById('game-map');
  map = new MapRenderer(canvas, scenario);
  actionPanel.setConnections(scenario.connections);
  actionPanel.setOpeningContext({
    active: uiState.openingActActive,
    turn: state.turn,
    factionId: state.player.factionId,
  });
  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'none';

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
  canvas.onpointerleave = () => {
    if (dragState) return;
    map.hoveredCity = null;
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
      const choiceId = await eventUI.show(event);
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
    await turnResolution.show(resolutionItems);

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

  document.getElementById('year-display').textContent = `${state.year}년`;
  document.getElementById('month-display').textContent = `${state.month}월`;
  document.getElementById('turn-display').textContent = `턴 ${state.turn}`;

  const faction = state.getFaction(state.player.factionId);
  const factionNameEl = document.getElementById('faction-name');
  factionNameEl.textContent = faction.name;
  factionNameEl.style.background = FACTION_COLORS[state.player.factionId] || '#666';

  document.getElementById('gold-display').textContent = `금: ${faction.gold.toLocaleString()}`;
  document.getElementById('army-display').textContent = `총 병력: ${state.getTotalArmy(state.player.factionId).toLocaleString()}`;
  document.getElementById('actions-display').textContent = `행동: ${state.actionsRemaining}/3`;
  document.getElementById('rep-display').textContent = `평판: ${faction.reputation || 100}`;

  updateChronicleSummary();
  updateMapSelectionPanel();
  updateWarRoomBrief();
  updateOpeningHudBrief();
  actionPanel.setOpeningContext({
    active: uiState.openingActActive,
    turn: state.turn,
    factionId: state.player.factionId,
  });
  map.render(state);
  if (map.selectedCity) {
    sidebar.showCityDetail(map.selectedCity, state);
    actionPanel.setContext(map.selectedCity, state);
    document.getElementById('game-screen').classList.add('city-rail-open');
  } else {
    sidebar.showOverview(state);
    actionPanel.setContext(null, state);
    document.getElementById('game-screen').classList.remove('city-rail-open');
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
}

function updateMapSelectionPanel() {
  const panel = document.getElementById('map-selection-panel');
  const cityEl = document.getElementById('map-selection-city');
  const ownerEl = document.getElementById('map-selection-owner');
  const actionEl = document.getElementById('map-selection-action');
  const sceneEl = document.getElementById('map-selection-scene');
  const button = document.getElementById('btn-open-command');
  if (!panel || !cityEl || !ownerEl || !actionEl || !sceneEl || !button) return;

  if (!map?.selectedCity || !state?.cities?.[map.selectedCity]) {
    panel.dataset.tone = 'own';
    panel.dataset.state = 'empty';
    panel.classList.remove('visible');
    panel.classList.add('hidden');
    button.textContent = '명령 열기';
    button.disabled = true;
    return;
  }

  const city = state.cities[map.selectedCity];
  const selection = getCitySelectionProfile(map.selectedCity);
  panel.dataset.tone = selection.panelTone;
  panel.dataset.state = 'active';
  panel.classList.remove('hidden');
  panel.classList.remove('visible');
  requestAnimationFrame(() => panel.classList.add('visible'));
  cityEl.textContent = city.name;
  ownerEl.textContent = selection.ownerLine;
  actionEl.textContent = selection.action;
  sceneEl.textContent = selection.scene;
  button.textContent = selection.buttonLabel;
  button.disabled = false;
}

async function openSelectedCityCommand() {
  if (!map?.selectedCity || !state || processing) return;
  const city = state.cities[map.selectedCity];
  const ownCity = city?.owner === state.player.factionId;
  await showSceneTransitionCard({
    kicker: ownCity ? '작전 장면' : '정세 장면',
    title: ownCity ? `${city.name} 군의실로 들어갑니다` : `${city.name} 전황 분석으로 들어갑니다`,
    body: ownCity
      ? '시정, 군사, 외교 중 이번 턴 하나를 정하고 바로 확정 단계로 넘어갑니다.'
      : '적 도시의 병력, 외교, 침공 가능성을 읽고 이번 턴의 대응을 고릅니다.',
    duration: 620,
    variant: 'command',
  });
  actionPanel.open(map.selectedCity, state);
  if (!uiState.commandSpotlightShown) {
    showTurnSpotlight({
      kicker: ownCity ? '군의실 입장' : '전장 관측',
      title: ownCity ? `${city.name} 명령 장면이 열렸습니다` : `${city.name}의 정세를 펼쳤습니다`,
      body: ownCity
        ? '상단 장면 탭을 넘기며 시정, 군사, 외교 중 지금 필요한 행동 하나만 먼저 결정하십시오.'
        : '외부 도시에서는 군사와 외교 장면으로 압박과 대응 수단을 먼저 읽는 편이 좋습니다.',
    });
    uiState.commandSpotlightShown = true;
  }
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
    getSelectedFaction: () => selectedFaction,
    getSelectedCity: () => map?.selectedCity || null,
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
      const selection = getCitySelectionProfile(cityId);
      map.selectedCity = cityId;
      map.focusOnCity(cityId, { immediate: true });
      map.signalSelection(cityId, selection.tone);
      map.addEventPulse(cityId, getSelectionPulseColor(selection.tone));
      sidebar.showCityDetail(cityId, state);
      actionPanel.setContext(cityId, state);
      document.getElementById('game-screen').classList.add('city-rail-open');
      showFieldReaction({
        kicker: selection.kicker,
        title: selection.title,
        body: selection.fieldBody,
        tone: selection.tone,
      });
      updateMapSelectionPanel();
      map.render(state);
      return true;
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
  };
}

// --- 부트 ---
init();
exposeTestHooks();
