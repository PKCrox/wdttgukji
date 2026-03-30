import {
  FACTION_META,
  OPENING_OBJECTIVES,
  getOpeningActBeat,
  getFactionSnapshot,
} from './campaign-config.js';
import { getFactionDoctrine } from './presentation-meta.js';

const DIRECTOR_RUNTIME = {
  mode: 'heuristic',
  provider: null,
};

export function registerTurnDirectorProvider(provider, { mode = 'custom' } = {}) {
  if (typeof provider !== 'function') {
    DIRECTOR_RUNTIME.provider = null;
    DIRECTOR_RUNTIME.mode = 'heuristic';
    return;
  }
  DIRECTOR_RUNTIME.provider = provider;
  DIRECTOR_RUNTIME.mode = mode || 'custom';
}

export function getTurnDirectorRuntime() {
  return { ...DIRECTOR_RUNTIME };
}

function normalizeEffects(effects) {
  return Array.isArray(effects) ? effects : [];
}

const START_SCREEN_BASE_SCENE = '작전 개시';
const START_SCREEN_FALLBACK_FOCUS = '전장 전체';
const START_SCREEN_ONBOARDING_TAGS = ['온보딩', '전장 약속', '브리핑 정렬', '첫 3턴'];

function clampStartBeatIndex(value = 1) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 1;
  return Math.max(1, Math.min(3, Math.trunc(raw)));
}

function buildStartPresentationStartupPacket({
  title = START_SCREEN_BASE_SCENE,
  objective = '',
  scene = START_SCREEN_BASE_SCENE,
  sceneId = null,
  beatIndex = 1,
  focusCity = START_SCREEN_FALLBACK_FOCUS,
} = {}) {
  const safeBeatIndex = clampStartBeatIndex(beatIndex);
  const sceneLabel = scene || commandSceneLabel(sceneId || 'government') || START_SCREEN_BASE_SCENE;

  return {
    title,
    beatObjective: objective,
    battleFocus: focusCity,
    sequence: `${sceneLabel} · ${safeBeatIndex}턴 약속`,
    sceneId,
    beatIndex: safeBeatIndex,
    focusCity,
    flow: 'start-screen-onboarding',
  };
}

function buildStartFallbackPresentationPacket() {
  const startCopy = buildStartPresentationPacket({ scenario: null, factionId: null });
  return {
    headline: startCopy.title,
    body: startCopy.body,
    tags: startCopy.tags,
    directive: startCopy.directive,
    objective: startCopy.objective,
    action: startCopy.action,
    focus: startCopy.focus,
    scene: startCopy.scene,
    risk: startCopy.risk,
    startup: startCopy.startup,
  };
}

function resolveCityNameFromState(state, cityId) {
  if (!state?.cities || !cityId) return null;
  const city = state.cities[cityId];
  if (city?.name) return city.name;
  const fallback = Object.values(state.cities).find((item) => item && item.id === cityId);
  return fallback?.name || null;
}

function joinCopyParts(...parts) {
  return parts
    .map((part) => `${part || ''}`.trim())
    .filter(Boolean)
    .join(' ');
}

function getDoctrineScene(doctrine, sceneId) {
  return doctrine?.command?.[sceneId] || doctrine?.command?.government || null;
}

function getOpeningCommitmentCopy({ state, factionId, turn = 1 }) {
  const openingBeat = getOpeningActBeat(factionId, turn);
  const sceneId = normalizeCommandSceneId(openingBeat?.preferredScene) || 'government';
  const sceneLabel = commandSceneLabel(sceneId);
  const focusCityName = resolveCityNameFromState(state, openingBeat?.focusCityId) || START_SCREEN_FALLBACK_FOCUS;
  const beatIndex = clampStartBeatIndex(turn);
  const objective = openingBeat?.objective || `${focusCityName} 중심 ${sceneLabel}로 첫 약속을 정렬합니다.`;
  const action = openingBeat?.action || `${focusCityName}에서 ${sceneLabel}을(를) 열고 첫 약속을 확정합니다.`;
  const risk = openingBeat?.risk || '판독 타이밍을 놓치면 후속 선택 폭이 줄어듭니다.';

  return {
    title: openingBeat?.title || `${sceneLabel} 우선`,
    sceneId,
    scene: sceneLabel,
    cityName: focusCityName,
    objective,
    action,
    risk,
    beatIndex,
    directive: `${focusCityName} 중심 ${sceneLabel}로 ${beatIndex}턴 약속이 고정되며, 지도·브리프·명령이 같은 흐름으로 정렬됩니다.`,
    body: `${objective} ${action} ${risk}`.trim(),
    summary: `${beatIndex}턴 약속 · ${sceneLabel} · ${focusCityName}`.trim(),
  };
}

function buildStartScreenCopyPayload() {
  return {
    title: '전장 약속을 먼저 고정하고 출발하세요',
    objective: '세력 선택 시 지도·브리프·명령이 동일 기준으로 맞물려 첫 3턴 약속 경로로 바로 전환됩니다.',
    action: '스포트라이트에서 깃발을 고르면 집중 거점과 첫 장면이 즉시 고정됩니다.',
    body: '시작 화면의 전장 약속 뷰가 선택한 세력 기준으로 즉시 갱신되어 브리핑 진입이 바로 열립니다.',
    focus: START_SCREEN_FALLBACK_FOCUS,
    risk: '선택 지연 시 첫 1턴 우선순위와 브리핑 축이 확정되지 않습니다.',
    scene: START_SCREEN_BASE_SCENE,
    tags: START_SCREEN_ONBOARDING_TAGS,
    directive: '세력 하나를 고르면 시작 화면의 브리프와 전장 약속이 즉시 같은 흐름으로 정렬됩니다.',
  };
}

function buildStartPresentationDirective({
  factionId = null,
  factionName = '',
  scene = START_SCREEN_BASE_SCENE,
  cityName = '전장 전체',
  beatIndex = 1,
} = {}) {
  const safeBeat = clampStartBeatIndex(beatIndex);
  const lead = factionName || '선택 세력';
  const isPreselect = !factionId;
  if (isPreselect) {
    return '세력 하나를 고르면 시작 화면의 브리프, 지도, 명령이 같은 전장 약속으로 즉시 정렬됩니다.';
  }
  return `${lead}의 첫 ${safeBeat}턴 약속은 ${scene} 기준 ${cityName}에서 고정되며, 브리핑·지도·명령이 즉시 같은 흐름으로 맞물립니다.`;
}

function buildStartPresentationPacket({ scenario, factionId = null }) {
  if (!scenario || !factionId || !scenario.factions?.[factionId]) {
    const base = buildStartScreenCopyPayload();
    const startup = buildStartPresentationStartupPacket({
      title: base.title,
      objective: base.objective,
      scene: base.scene,
      sceneId: null,
      beatIndex: 1,
      focusCity: base.focus,
    });

    return {
      title: base.title,
      objective: base.objective,
      action: base.action,
      body: base.body,
      focus: base.focus,
      scene: base.scene,
      risk: base.risk,
      tags: [...base.tags],
      startup,
      cityName: base.focus,
      cityId: null,
      directive: buildStartPresentationDirective({
        scene: base.scene,
        cityName: base.focus,
      }),
      sceneId: null,
      beatIndex: 1,
      sequence: startup.sequence,
      onboardingMode: 'select-only',
    };
  }

  const openingBeat = getOpeningActBeat(factionId, 1);
  const openingCommitment = getOpeningCommitmentCopy({ state: scenario, factionId, turn: 1 });
  const openingObjective = OPENING_OBJECTIVES[factionId]?.[0];
  const focusCityName = openingCommitment.cityName || START_SCREEN_FALLBACK_FOCUS;
  const sceneId = normalizeCommandSceneId(openingBeat?.preferredScene) || 'government';
  const scene = commandSceneLabel(sceneId);
  const beatIndex = clampStartBeatIndex(openingCommitment.beatIndex);
  const startup = buildStartPresentationStartupPacket({
    title: openingCommitment.title || `${scene} 우선`,
    objective: openingBeat?.objective || openingCommitment.objective,
    scene,
    sceneId,
    beatIndex,
    focusCity: focusCityName,
  });
  const directive = buildStartPresentationDirective({
    factionId,
    factionName: scenario?.factions?.[factionId]?.name || '',
    scene,
    cityName: focusCityName,
    beatIndex,
  });
  const objective = openingBeat?.objective || openingCommitment.objective;
  const action = openingBeat?.action || openingCommitment.action;
  const risk = openingBeat?.risk || openingCommitment.risk;
  const title = openingCommitment.title;

  return {
    title,
    objective,
    action,
    body: `${objective}${action ? ` ${action}` : ''}`.trim(),
    focus: focusCityName,
    scene,
    risk,
    tags: [title, scene, `${beatIndex}턴`, focusCityName],
    directive: openingObjective ? `${openingObjective} ${directive}` : directive,
    startup,
    cityName: focusCityName,
    cityId: openingBeat?.focusCityId || null,
    beatIndex,
    sequence: startup.sequence,
    onboardingMode: 'selected-faction',
  };
}

function extractLeadSentence(text = '') {
  if (!text) return '';
  const firstSentence = text.split(/(?<=[.!?다])\s+/u).find(Boolean) || text;
  return firstSentence.length > 96 ? `${firstSentence.slice(0, 93).trim()}...` : firstSentence;
}

function normalizeCityRef(state, candidate) {
  if (!state?.cities || !candidate) return null;
  const cityId = candidate?.id ?? candidate?.cityId ?? candidate;
  if (!cityId && typeof candidate === 'object' && candidate.name) {
    const fallback = Object.values(state.cities || {}).find((c) => c.name === candidate.name);
    return fallback ? { ...fallback } : null;
  }
  if (!cityId && typeof candidate === 'object' && candidate.owner) {
    return candidate;
  }
  if (!cityId) return null;
  const key = `${cityId}`;
  const raw = state.cities[key];
  if (!raw) return null;
  return { ...raw, id: raw.id || key };
}

function normalizeCityCollection(state, list) {
  return Array.isArray(list)
    ? list
      .map((item) => normalizeCityRef(state, item))
      .filter(Boolean)
    : [];
}

function pickEventCity(state, event = {}) {
  const candidates = [
    event.cityId,
    event.city,
    event.location?.cityId,
    event.location,
    state?.activeCityId,
    state?.selectedCityId,
    state?.currentCityId,
    state?.hoveredCityId,
    state?.lastActionCityId,
    state?.frontlinePreviewCityId,
    state?.focusCityId,
    state?.lastPlayerActionResult?.focusCityId,
  ];

  for (const candidate of candidates) {
    const city = normalizeCityRef(state, candidate);
    if (city) return city;
  }

  const ownCities = normalizeCityCollection(state, state?.getCitiesOfFaction?.(state?.player?.factionId));
  if (ownCities.length === 0) return null;
  return [...ownCities].sort((a, b) => (b.army || 0) - (a.army || 0))[0];
}

function buildEventMapLine(city, state) {
  if (!city) {
    return '전장 전체 판독: 지도에서 압박이 큰 구역을 우선 고릅니다.';
  }
  const pressure = summarizeCityPressure(city.id, state, state?.connections || []);
  return `${city.name} 주변 적 ${pressure.hostile}면, 우군 ${pressure.friendly}개, 중립 ${pressure.neutral}개`;
}

function buildResolutionMapLine(focusCity, state) {
  if (!focusCity) {
    return '판독 신호가 약해 전장 전체의 기조로 운영합니다.';
  }
  const pressure = summarizeCityPressure(focusCity.id, state, state?.connections || []);
  return `${focusCity.name} 주변 적 ${pressure.hostile}면, 우군 ${pressure.friendly}개, 중립 ${pressure.neutral}개`;
}

function pickResolutionFocusCity(state, items = [], playerCities = []) {
  const signalTypes = new Set(['war', 'territory', 'warning', 'rebellion', 'defection', 'diplomacy', 'alliance']);
  const citySignals = items
    .filter((item) => signalTypes.has(item.type))
    .map((item) => ({
      city: normalizeCityRef(state, item.cityId || item.city || item.cityName),
      item,
    }))
    .filter((entry) => entry.city);

  const signalPriority = citySignals.find((entry) => entry.item.type === 'war' || entry.item.type === 'territory');
  if (signalPriority) return signalPriority.city;

  if (citySignals.length > 0) return citySignals[0].city;

  const contextCity = pickResolutionContextCity(state);
  if (contextCity) return contextCity;

  if (playerCities.length > 0) {
    return [...playerCities].sort((a, b) => (b.army || 0) - (a.army || 0))[0];
  }

  return null;
}

function pickResolutionContextCity(state) {
  const candidateIds = [
    state?.lastActionCityId,
    state?.frontlinePreviewCityId,
    state?.selectedCityId,
    state?.activeCityId,
    state?.currentCityId,
    state?.openingCityId,
    state?.hoveredCityId,
    state?.focusCityId,
    state?.cityId,
  ];

  for (const candidateId of candidateIds) {
    const city = normalizeCityRef(state, candidateId);
    if (city) return city;
  }

  return null;
}

function buildResolutionPhaseGuide(items = []) {
  const guide = {};
  items.forEach((item) => {
    const phase = item?.phase || '기본';
    if (guide[phase]) return;
    if (!item?.text) return;
    guide[phase] = extractLeadSentence(item.text);
  });
  return guide;
}

function getCityNeighbors(cityId, connections = []) {
  return connections
    .filter(([a, b]) => a === cityId || b === cityId)
    .map(([a, b]) => (a === cityId ? b : a));
}

function buildDecisionContext({
  city,
  state,
  scene,
  nextAction,
  mapReadout,
  pressure,
  connections = [],
  fallbackCity = '전장 전체',
}) {
  if (!city) {
    const resolvedScene = scene || '전장 정렬';
    const resolvedAction = nextAction || '전장 판독 우선으로 다음 행동 우선순위를 정렬합니다.';
    const resolvedMapReadout = mapReadout || '전장 전체 판독: 우선순위는 지도 접점과 경로로 정해집니다.';
    return {
      cityId: null,
      cityName: fallbackCity,
      decisionCity: fallbackCity,
      focusCity: fallbackCity,
      scene: resolvedScene,
      focusScene: resolvedScene,
      mapReadout: resolvedMapReadout,
      frontline: '판독 대기',
      nextAction: resolvedAction,
      tags: [{ label: '판독', value: '대기' }],
    };
  }

  const cityPressure = pressure || summarizeCityPressure(city.id, state, connections);
  const selectedScene = scene || getRecommendedScene(city, state, connections);
  const selectedAction = nextAction || buildActionLine(city, cityPressure, state);
  const selectedMap = mapReadout || buildEventMapLine(city, state);

  return {
    cityId: city.id,
    cityName: city.name,
    decisionCity: city.name,
    focusCity: city.name,
    scene: selectedScene,
    focusScene: selectedScene,
    mapReadout: selectedMap,
    frontline: `적 ${cityPressure.hostile}면 / 우군 ${cityPressure.friendly}선`,
    nextAction: selectedAction,
    tags: buildSelectionTags(city, cityPressure),
  };
}

function buildSessionTrace(decisionFrame = {}) {
  const cityName = decisionFrame?.cityName
    || decisionFrame?.decisionCity
    || decisionFrame?.focusCity
    || '전장 전체';
  return {
    city: cityName,
    scene: decisionFrame?.scene || decisionFrame?.focusScene || null,
    focusScene: decisionFrame?.focusScene || decisionFrame?.scene || null,
    frontline: decisionFrame?.frontline || null,
    nextAction: decisionFrame?.nextAction || null,
    mapReadout: decisionFrame?.mapReadout || null,
    cityId: decisionFrame?.cityId || null,
    tags: Array.isArray(decisionFrame?.tags) ? decisionFrame.tags : [],
  };
}

function truncateDecisionText(value, max = 64) {
  const text = `${value || ''}`.trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(20, max - 1)).trim()}…`;
}

function buildDecisionTrackLines(decisionFrame = {}) {
  return buildBattlefieldSessionLines(decisionFrame);
}

function buildBattlefieldSessionLines(decisionFrame = {}) {
  const frame = buildDecisionSurface(decisionFrame);
  const city = decisionFrame?.cityName
    || decisionFrame?.decisionCity
    || decisionFrame?.focusCity
    || frame.cityName
    || frame.city
    || '전장 전체';
  const action = decisionFrame?.nextAction || frame.nextAction || `${city}에서 다음 행동을 정렬합니다.`;
  const mapReadout = decisionFrame?.mapReadout || frame.mapReadout || `${city} 주변 지도를 기준으로 판독 우선순위를 정렬합니다.`;
  const scene = decisionFrame?.scene
    || decisionFrame?.focusScene
    || frame.scene
    || frame.focusScene
    || '전장 정렬';
  const frontline = decisionFrame?.frontline || frame.frontline || '판독 대기';

  return [
    `선택 도시: ${truncateDecisionText(city, 24)}`,
    `다음 행동: ${truncateDecisionText(action, 54)}`,
    `지도 판독: ${truncateDecisionText(mapReadout, 54)}`,
    `전선: ${truncateDecisionText(frontline, 22)}`,
    `장면: ${truncateDecisionText(scene, 24)}`,
  ];
}

function buildDecisionSessionLines(decisionFrame = {}) {
  const frame = buildSessionTrace(decisionFrame);
  const city = decisionFrame?.cityName
    || decisionFrame?.decisionCity
    || decisionFrame?.focusCity
    || frame.city
    || '전장 전체';
  const action = decisionFrame?.nextAction || frame.nextAction;
  const mapReadout = decisionFrame?.mapReadout || frame.mapReadout;
  const scene = decisionFrame?.scene || decisionFrame?.focusScene || frame.scene;
  const frontline = decisionFrame?.frontline || frame.frontline;
  const lines = [];
  if (city) lines.push(`선택 도시: ${truncateDecisionText(city, 24)}`);
  if (action) lines.push(`다음 행동: ${truncateDecisionText(action, 54)}`);
  if (mapReadout) lines.push(`지도 판독: ${truncateDecisionText(mapReadout, 54)}`);
  if (frontline) lines.push(`전선: ${truncateDecisionText(frontline, 22)}`);
  if (scene) lines.push(`장면: ${truncateDecisionText(scene, 24)}`);
  return lines;
}

function buildDecisionSessionPacket(decisionFrame = {}) {
  const decisionTrack = buildDecisionSessionLines(decisionFrame);
  const battlefieldSessionLines = buildBattlefieldSessionLines(decisionFrame);
  const battlefieldDecisionFocus = battlefieldSessionLines.slice(0, 2);
  return {
    sessionTrace: buildSessionTrace(decisionFrame),
    decisionSurface: buildDecisionSurface(decisionFrame),
    decisionTrack,
    decisionPulse: decisionTrack.slice(0, 5),
    battlefieldSessionLines,
    battlefieldDecisionFocus,
    decisionSurfaceLines: battlefieldSessionLines,
  };
}

function buildDecisionSurface(decisionFrame = {}) {
  const frame = buildSessionTrace(decisionFrame);
  const cityName = decisionFrame?.cityName
    || decisionFrame?.decisionCity
    || decisionFrame?.focusCity
    || frame.city
    || '전장 전체';
  const scene = decisionFrame?.scene
    || decisionFrame?.focusScene
    || frame.scene
    || '전장 정렬';
  return {
    ...frame,
    cityName,
    decisionCity: decisionFrame?.decisionCity || cityName,
    focusCity: decisionFrame?.focusCity || cityName,
    scene,
    focusScene: decisionFrame?.focusScene || scene,
    nextAction: decisionFrame?.nextAction || frame.nextAction || `${cityName}에서 다음 행동 우선순위를 정렬합니다.`,
    mapReadout: decisionFrame?.mapReadout || frame.mapReadout || `${cityName}의 지도 판독으로 다음 동선을 정렬합니다.`,
    frontline: decisionFrame?.frontline || frame.frontline || '판독 대기',
    cityId: decisionFrame?.cityId || frame.cityId || null,
    tags: Array.isArray(decisionFrame?.tags) ? decisionFrame.tags : [],
  };
}

function summarizeCityPressure(cityId, state, connections = []) {
  const neighbors = getCityNeighbors(cityId, connections);
  let friendly = 0;
  let hostile = 0;
  let neutral = 0;

  neighbors.forEach((neighborId) => {
    const neighbor = state?.cities?.[neighborId];
    if (!neighbor) return;
    if (!neighbor.owner) {
      neutral += 1;
      return;
    }
    if (neighbor.owner === state.player.factionId) friendly += 1;
    else hostile += 1;
  });

  return {
    friendly,
    hostile,
    neutral,
    total: neighbors.length,
  };
}

function getRecommendedScene(city, state, connections = []) {
  const pressure = summarizeCityPressure(city.id, state, connections);
  const isOwned = city.owner === state.player.factionId;
  if (isOwned) {
    if (pressure.hostile > 0 || city.army < 18000) return '군사';
    if (city.gold < 1200 || city.food < 9000 || city.publicOrder < 70) return '시정';
    return '외교';
  }
  if (!city.owner) return pressure.hostile > 0 ? '군사' : '시정';
  return state.isAtWar(state.player.factionId, city.owner) ? '군사' : '외교';
}

function buildRiskLine(city, pressure, state) {
  if (city.owner === state.player.factionId) {
    if (pressure.hostile >= 2) return `격전 ${pressure.hostile}면`;
    if (city.food < 7000) return '군량 부족';
    if (city.publicOrder < 65) return '치안 불안';
    return '후방 안정';
  }
  if (!city.owner) return pressure.hostile > 0 ? '선점 경쟁' : '무주 공백';
  return state.isAtWar(state.player.factionId, city.owner) ? '공격 기회' : '외교 접촉';
}

function buildActionLine(city, pressure, state) {
  const scene = getRecommendedScene(city, state, state?.connections || []);
  if (city.owner === state.player.factionId) {
    if (scene === '군사') return `${city.name}에서 방비, 징병, 수송 중 하나를 바로 확정합니다.`;
    if (scene === '시정') return `${city.name}에서 금, 식량, 치안 중 가장 약한 축을 먼저 보강합니다.`;
    return `${city.name}에서 외교 여지와 다음 전선 준비를 함께 정리합니다.`;
  }
  if (!city.owner) return `${city.name}의 빈틈을 보고 선점 또는 견제 명령을 고릅니다.`;
  if (state.isAtWar(state.player.factionId, city.owner)) return `${city.name}을 향한 공격 각과 병참 부담을 동시에 비교합니다.`;
  return `${city.name}과의 관계를 읽고 위협, 강화, 동맹 여지를 검토합니다.`;
}

function buildWhyNow(city, pressure, state) {
  if (city.owner === state.player.factionId) {
    if (pressure.hostile > 0) return `인접 적성 ${pressure.hostile}곳이 바로 연결돼 있어 이번 턴 군령 가치가 높습니다.`;
    if (city.gold < 1200 || city.food < 9000) return '자원이 빠듯해 뒤로 미루면 다음 턴 선택지가 줄어듭니다.';
    return '지금 정한 한 번의 내정/외교 선택이 다음 턴 거점 역할을 고정합니다.';
  }
  if (!city.owner) return '빈 땅은 누구도 보유하지 않으므로 선점 타이밍이 곧 가치입니다.';
  if (state.isAtWar(state.player.factionId, city.owner)) return '이미 적대 상태라 외교보다 압박/방어 계산이 먼저입니다.';
  return '적대가 아니면 병력보다 관계 정리가 더 싼 비용으로 판세를 움직일 수 있습니다.';
}

function normalizeCommandSceneId(sceneId) {
  if (!sceneId || typeof sceneId !== 'string') return null;
  const normalized = sceneId.trim().toLowerCase();
  if (!normalized) return null;
  const normalizedSceneMap = {
    government: 'government',
    군정: 'government',
    행정: 'government',
    military: 'military',
    군사: 'military',
    diplomacy: 'diplomacy',
    외교: 'diplomacy',
    personnel: 'personnel',
    인사: 'personnel',
  };
  return normalizedSceneMap[normalized] || null;
}

function commandSceneLabel(sceneId = null) {
  return {
    government: '시정',
    military: '군사',
    diplomacy: '외교',
    personnel: '인사',
  }[sceneId] || '명령';
}

function commandSceneActionLine({ sceneId, city, pressure, state }) {
  if (!city) return '지금부터 이번 턴 핵심 명령을 고르십시오.';
  switch (sceneId) {
    case 'government':
      if (city.owner === state.player.factionId) {
        return `${city.name}에서 월별 수지와 치안 중 급한 항목부터 바로 확정합니다.`;
      }
      return `${city.name}에서 교체 없이 운영 가능한 행정 카드를 먼저 압축 점검합니다.`;
    case 'military':
      return buildActionLine(city, pressure, state);
    case 'diplomacy':
      if (!city.owner) return `${city.name}의 외부 관계를 활용해 동맹/협상 여지를 빠르게 정리합니다.`;
      return state.isAtWar?.(state.player.factionId, city.owner)
        ? `${city.name} 중심으로 압박 완화와 전환 교섭을 동시에 검토합니다.`
        : `${city.name}에서 강화/협상 중 장기 효율이 좋은 한 가지를 우선합니다.`;
    case 'personnel':
      return `${city.name}에서 인사 배치·회수·보상 중 현재 판세에 직접 닿는 한 가지를 정리합니다.`;
    default:
      return buildActionLine(city, pressure, state);
  }
}

function buildCommandDecisionFlowCopy({ sceneId, city, state }) {
  const resolvedSceneId = normalizeCommandSceneId(sceneId) || 'government';
  const resolvedSceneLabel = commandSceneLabel(resolvedSceneId);
  const cityName = city?.name || '선택 도시';
  const baseRoute = `${cityName}의 ${resolvedSceneLabel} 카드`;
  if (!city) {
    return {
      route: '도시를 먼저 고르면 바로 명령 패널이 열립니다',
      flow: '도시와 장면을 고르면 카드 후보가 즉시 이번 턴 결정으로 이어집니다.',
    };
  }
  const isOwned = city.owner === state?.player?.factionId;
  const isWar = state?.isAtWar?.(state?.player?.factionId, city.owner);
  const baseFlow = `${baseRoute} 한 장을 고르면 명령 패널로 바로 이동해 이번 턴 결정으로 이어집니다.`;

  if (resolvedSceneId === 'government') {
    return {
      route: `${baseRoute} 선택 즉시 명령 패널`,
      flow: isOwned
        ? `${baseFlow} 현재 내정 판단이 즉시 확정 대기로 전환됩니다.`
        : `${baseFlow} 현재 판세를 이번 턴 결정에 곧바로 반영합니다.`,
    };
  }

  if (resolvedSceneId === 'military') {
    return {
      route: `${baseRoute} 선택 즉시 명령 패널`,
      flow: `${baseFlow} 군사 판단은 즉시 이번 턴 확정 후보로 고정됩니다.`,
    };
  }

  if (resolvedSceneId === 'diplomacy') {
    if (!city.owner) {
      return {
        route: `${baseRoute} 선택 즉시 명령 패널`,
        flow: `${baseFlow} 무주지 외교도 즉시 이번 턴 실행 후보로 연결됩니다.`,
      };
    }
    return {
      route: `${baseRoute} 선택 즉시 명령 패널`,
      flow: `${baseFlow} ${city.name}의 ${isWar ? '전환' : '안정화'} 흐름이 곧바로 이번 턴 확정으로 이어집니다.`,
    };
  }

  if (resolvedSceneId === 'personnel') {
    return {
      route: `${baseRoute} 선택 즉시 명령 패널`,
      flow: `${baseFlow} 인사 조정은 즉시 이번 턴 결정으로 연결됩니다.`,
    };
  }

  return {
    route: `${baseRoute} 선택 즉시 명령 패널`,
    flow: `${baseFlow} 곧바로 이번 턴 결정으로 연결됩니다.`,
  };
}

function commandSceneDecisionFlow({ sceneId, city, state }) {
  return buildCommandDecisionFlowCopy({ sceneId, city, state }).flow;
}

function commandSceneDecisionRoute({ sceneId, city }) {
  return buildCommandDecisionFlowCopy({ sceneId, city }).route;
}

function commandSceneSubhead({ sceneId, city, pressure, state }) {
  switch (sceneId) {
    case 'government':
      if (city?.owner === state.player.factionId) return '시정 카드 1장이 곧바로 턴 확정 대기 상태가 됩니다.';
      if (!city?.owner) return '무주지 시정 카드 1장으로 결정 패널에 들어가 즉시 턴 결정을 진행합니다.';
      return '교섭 전 내정 안정축도 카드 1장으로 바로 턴 확정 흐름에 연결됩니다.';
    case 'military':
      if (!city) return '군사 장면에서 출정·징병의 즉시 우선순위를 정합니다.';
      if (pressure?.hostile > 0) return `${pressure.hostile}개 접경이 보유하고 있으므로 병력 판정을 카드 1장으로 즉시 실행 후보에 올립니다.`;
      return '접경 압박이 낮아도 군사 카드 1장으로 바로 턴 확정 흐름을 열 수 있는 장면입니다.';
    case 'diplomacy':
      if (!city?.owner) return '무주지 외교도 카드 1장으로 곧바로 결정 패널에 올라갑니다.';
      return state.isAtWar?.(state.player.factionId, city.owner)
        ? '전쟁 지속 외교가 카드 1장으로 즉시 턴 확정 흐름을 열어 판세를 확정합니다.'
        : '외교 선택은 1장으로 바로 턴 확정 단계에 들어갑니다.';
    case 'personnel':
      return '인사 카드는 1장 선택 즉시 턴 확정 후보가 됩니다.';
    default:
      return '지금 장면에서 판세를 바로 정렬해 턴 결정을 진행합니다.';
  }
}

function commandSceneStatus({ sceneId, city, state, pressure }) {
  if (!city || !state) return [];
  const actionBudget = `${state.actionsRemaining ?? 3}/${state.maxActions || 3} 남음`;
  const cityName = city.name || '선택 도시';
  const scene = commandSceneLabel(sceneId);
  const frontline = pressure?.hostile > 0 ? `${pressure.hostile}면 압박` : '전면 안정';
  const decisionFlow = commandSceneDecisionFlow({ sceneId, city, state });
  const decisionRoute = commandSceneDecisionRoute({ sceneId, city });
  const baseStatus = [
    ['거점', cityName],
    ['장면', scene],
    ['결정', decisionRoute],
    ['행동력', actionBudget],
  ];
  const actionLine = commandSceneActionLine({ sceneId, city, pressure, state });
  const friendlyLine = pressure?.friendly > 0 ? `${pressure.friendly}면 지원` : '지원 비어있음';

  if (sceneId === 'government') {
    return [
      ...baseStatus,
      ['도시재정', `${formatCompactNumber(city.gold || 0)} 금 · ${formatCompactNumber(city.food || 0)} 식량`],
      ['치안/성방', `${city.publicOrder ?? 70} / ${formatCompactNumber(city.defense || 0)}`],
      ['권고', actionLine],
      ['전선', frontline],
    ];
  }

  if (sceneId === 'military') {
    return [
      ...baseStatus,
      ['병력', formatCompactNumber(city.army || 0)],
      ['지지', friendlyLine],
      ['전선', frontline],
      ['권고', actionLine],
    ];
  }

  if (sceneId === 'diplomacy') {
    const ownerName = city.owner && state.factions?.[city.owner]?.name ? state.factions[city.owner].name : '무주지';
    const relation = !city.owner
      ? '무주지'
      : state.isAtWar?.(state.player.factionId, city.owner)
        ? '전쟁'
        : '평화';
    return [
      ...baseStatus,
      ['상대', ownerName],
      ['관계', relation],
      ['전선', frontline],
      ['권고', actionLine],
    ];
  }

  if (sceneId === 'personnel') {
    const governor = city.governor || '공석';
    return [
      ...baseStatus,
      ['통제', governor],
      ['지원', friendlyLine],
      ['수지', `${formatCompactNumber(city.gold || 0)} 금 · ${formatCompactNumber(city.food || 0)} 식량`],
      ['권고', actionLine],
    ];
  }

  return [
    ...baseStatus,
    ['전선', frontline],
    ['권고', buildActionLine(city, pressure, state)],
  ];
}

function buildSelectionTags(city, pressure) {
  return [
    { label: '전선', value: pressure.hostile > 0 ? `${pressure.hostile}면` : '안정' },
    { label: '지원', value: pressure.friendly > 0 ? `${pressure.friendly}선` : '고립' },
    { label: '군량', value: formatCompactNumber(city.food || 0) },
  ];
}

function formatCompactNumber(value) {
  const number = Number(value) || 0;
  if (number >= 10000) return `${(number / 10000).toFixed(1)}만`;
  return number.toLocaleString();
}

function describeEffectImpact(effect, state) {
  if (!effect || typeof effect !== 'object') return null;
  const value = effect.value ?? {};
  switch (effect.type) {
    case 'gold_change': {
      const delta = Number(typeof value === 'number' ? value : value.delta || 0);
      if (!delta) return null;
      return `${delta > 0 ? '금 확보' : '금 지출'} ${formatCompactNumber(Math.abs(delta))}`;
    }
    case 'resource_change': {
      const delta = Number(value.delta || 0);
      if (!delta || !value.resource) return null;
      return `${value.resource} ${delta > 0 ? '+' : ''}${formatCompactNumber(delta)}`;
    }
    case 'army_change': {
      const delta = Number(value.delta || 0);
      if (!delta) return null;
      return `${delta > 0 ? '병력 보강' : '병력 손실'} ${formatCompactNumber(Math.abs(delta))}`;
    }
    case 'territory_change':
      if (value.city && value.action) return `${value.city} ${value.action === 'capture' ? '점령 시도' : '판세 변화'}`;
      return '영토 판세 변화';
    case 'reputation_change': {
      const delta = Number(typeof value === 'number' ? value : value.delta || 0);
      if (!delta) return null;
      return `평판 ${delta > 0 ? '상승' : '하락'} ${Math.abs(delta)}`;
    }
    case 'relationship_change':
      return '관계 강도 변화';
    case 'loyalty_change': {
      const delta = Number(typeof value === 'number' ? value : value.delta || 0);
      if (!delta) return null;
      return `충성 ${delta > 0 ? '상승' : '하락'} ${Math.abs(delta)}`;
    }
    case 'stat_change':
      return '능력치 변화';
    default:
      return null;
  }
}

function scoreEffect(effect, state) {
  if (!effect || typeof effect !== 'object') return 0;
  const playerFactionId = state?.player?.factionId;
  const value = effect.value ?? {};
  const targetBias = effect.target === playerFactionId ? 1 : effect.target && effect.target !== playerFactionId ? -0.55 : 0.3;
  switch (effect.type) {
    case 'gold_change':
      return Number(typeof value === 'number' ? value : value.delta || 0) * 0.0035 * targetBias;
    case 'resource_change':
      return Number(value.delta || 0) * (value.resource === 'food' ? 0.0018 : 0.0024) * targetBias;
    case 'army_change':
      return Number(value.delta || 0) * 0.0007 * targetBias;
    case 'reputation_change':
      return Number(typeof value === 'number' ? value : value.delta || 0) * 0.55 * targetBias;
    case 'loyalty_change':
      return Number(typeof value === 'number' ? value : value.delta || 0) * 0.45 * targetBias;
    case 'territory_change':
      return (value.action === 'gain' || value.action === 'capture' ? 8 : 4) * targetBias;
    case 'relationship_change':
      return Number(value.delta || 0) * 0.24 * targetBias;
    case 'stat_change':
      return Number(value.delta || value.amount || 0) * 0.18 * targetBias;
    default:
      return 0;
  }
}

function summarizeChoiceEffects(choice, state) {
  const effects = normalizeEffects(choice?.effects);
  const score = effects.reduce((sum, effect) => sum + scoreEffect(effect, state), 0);
  const notes = effects
    .map((effect) => describeEffectImpact(effect, state))
    .filter(Boolean)
    .slice(0, 3);
  return {
    score,
    notes,
    tone: score > 1.4 ? 'advantage' : score < -1.4 ? 'cost' : 'neutral',
  };
}

function buildChoiceRecommendation(choice, summary) {
  if (summary.notes.length > 0) return summary.notes.join(' · ');
  if (summary.tone === 'advantage') return `${choice.text} 쪽이 이번 턴 수지와 판세에 유리합니다.`;
  if (summary.tone === 'cost') return `${choice.text} 는 손실을 감수하는 선택입니다.`;
  return `${choice.text} 는 중립적이지만 흐름을 바꿀 수 있는 선택입니다.`;
}

function buildHeuristicBattlefieldPacket({ state, scenario, cityId }) {
  const connections = scenario?.connections || [];
  const city = cityId && state?.cities?.[cityId] ? { id: cityId, ...state.cities[cityId] } : null;
  const doctrine = getFactionDoctrine(state?.player?.factionId);
  const openingCommitment = getOpeningCommitmentCopy({
    state,
    factionId: state?.player?.factionId,
    turn: state?.turn || 1,
  });

  if (!city) {
    return {
      title: openingCommitment.title,
      objective: openingCommitment.objective,
      action: openingCommitment.action,
      focus: openingCommitment.cityName,
      risk: openingCommitment.risk,
      scene: openingCommitment.scene,
      whyNow: openingCommitment.directive,
      directive: openingCommitment.directive,
      tags: [
        { label: '온보딩', value: `${openingCommitment.beatIndex}턴` },
        { label: '장면', value: openingCommitment.scene },
      ],
    };
  }

  const pressure = summarizeCityPressure(city.id, state, connections);
  const scene = getRecommendedScene(city, state, connections);
  const whyNow = buildWhyNow(city, pressure, state);
  const action = buildActionLine(city, pressure, state);
  const risk = buildRiskLine(city, pressure, state);
  return {
    title: `${city.name} · ${doctrine?.battlefield?.title || `${scene} 우선`}`,
    objective: joinCopyParts(doctrine?.battlefield?.objectiveLead, whyNow),
    action: joinCopyParts(doctrine?.battlefield?.actionLead, action),
    focus: city.name,
    risk: joinCopyParts(doctrine?.battlefield?.riskLead, risk),
    scene,
    whyNow: joinCopyParts(doctrine?.battlefield?.whyNowLead, whyNow),
    tags: [
      ...buildSelectionTags(city, pressure),
      doctrine?.label ? { label: '교리', value: doctrine.label } : null,
    ].filter(Boolean),
  };
}

function buildHeuristicCommandPacket({ cityId, sceneId, state, connections = [] }) {
  const city = state?.cities?.[cityId];
  const resolvedSceneId = normalizeCommandSceneId(sceneId) || 'government';
  const doctrine = getFactionDoctrine(state?.player?.factionId);
  const waitingDoctrine = getDoctrineScene(doctrine, resolvedSceneId);
  if (!city) {
    const actionBudget = `${state?.actionsRemaining ?? 0}/${state?.maxActions || 3} 남음`;
    const decisionFlow = commandSceneDecisionFlow({ sceneId: resolvedSceneId, city: null, state });
    const decisionRoute = commandSceneDecisionRoute({ sceneId: resolvedSceneId });
    return {
      headline: '명령 대기',
      subhead: joinCopyParts(
        waitingDoctrine?.subhead,
        '도시를 선택하면 결정 패널로 바로 연결되어 즉시 확정 후보가 됩니다.'
      ),
      summary: joinCopyParts(waitingDoctrine?.summaryLead, decisionFlow),
      status: [
        ['교리', waitingDoctrine?.status || doctrine?.label || '전선 정렬'],
        ['장면', '선택 대기'],
        ['결정', decisionRoute],
        ['다음 행동', decisionFlow],
        ['행동력', actionBudget],
      ],
    };
  }

  const pressure = summarizeCityPressure(cityId, state, connections);
  const cityWithId = { id: cityId, ...city };
  const contextScene = normalizeCommandSceneId(sceneId) || getRecommendedScene(cityWithId, state, connections);
  const sceneName = commandSceneLabel(contextScene);
  const sceneDoctrine = getDoctrineScene(doctrine, contextScene);
  const decisionFlow = commandSceneDecisionFlow({
    sceneId: contextScene,
    city: cityWithId,
    state,
  });
  const decisionRoute = commandSceneDecisionRoute({
    sceneId: contextScene,
    city: cityWithId,
  });
  const actionLine = commandSceneActionLine({
    sceneId: contextScene,
    city: cityWithId,
    pressure,
    state,
  });
  const status = commandSceneStatus({
    sceneId: contextScene,
    city: cityWithId,
    state,
    pressure,
  });

  return {
    headline: `${city.name} ${sceneName} 결정`,
    subhead: joinCopyParts(
      sceneDoctrine?.subhead,
      commandSceneSubhead({
        sceneId: contextScene,
        city: cityWithId,
        pressure,
        state,
      })
    ),
    summary: joinCopyParts(sceneDoctrine?.summaryLead, decisionFlow),
    scene: sceneName,
    action: joinCopyParts(sceneDoctrine?.actionLead, actionLine),
    status: [
      ['교리', sceneDoctrine?.status || doctrine?.label || '전선 정렬'],
      ...status,
      ['다음 행동', decisionFlow],
    ],
  };
}

function buildHeuristicFactionPacket({ scenario, factionId }) {
  if (!scenario || !factionId) {
    return buildStartFallbackPresentationPacket();
  }

  const snapshot = getFactionSnapshot(scenario, factionId);
  if (!snapshot) {
    return buildStartFallbackPresentationPacket();
  }

  const openingCommitment = buildStartPresentationPacket({ scenario, factionId });
  const { faction, meta, cities, army, characters } = snapshot;
  const startup = {
    title: openingCommitment.startup?.title || `${faction.name}의 시작 약속`,
    beatObjective: openingCommitment.objective,
    battleFocus: openingCommitment.focus,
    sequence: openingCommitment.startup?.sequence || `${openingCommitment.scene || START_SCREEN_BASE_SCENE}·${openingCommitment.beatIndex || 1}턴`,
    sceneId: openingCommitment.startup?.sceneId || 'government',
    beatIndex: openingCommitment.beatIndex || 1,
  };

  return {
    headline: `${faction.name}의 시작 약속`,
    body: openingCommitment.body || openingCommitment.action || openingCommitment.objective,
    tags: [
      `${cities.length}성`,
      `${(army / 10000).toFixed(1)}만`,
      `${characters.length}명`,
      FACTION_META[factionId]?.diffLabel || meta.diffLabel,
      openingCommitment.scene || START_SCREEN_BASE_SCENE,
    ],
    directive: openingCommitment.directive,
    objective: openingCommitment.objective,
    action: openingCommitment.action,
    focus: openingCommitment.focus,
    scene: openingCommitment.scene,
    risk: openingCommitment.risk,
    startup,
  };
}

function buildHeuristicEventPacket({ event, state }) {
  const city = pickEventCity(state, event);
  const cityScene = city ? getRecommendedScene(city, state, state?.connections || []) : '전장 정렬';
  const pressure = city ? summarizeCityPressure(city.id, state, state?.connections || []) : null;
  const actionLine = city
    ? `${city.name}에서 ${buildActionLine(city, pressure, state)}`
    : '전장 허브에서 다음 액션 우선순위를 정렬합니다.';
  const mapLine = buildEventMapLine(city, state);
  const decisionFrame = buildDecisionContext({
    city,
    state,
    scene: cityScene,
    nextAction: actionLine,
    mapReadout: mapLine,
    pressure,
    connections: state?.connections || [],
  });
  const {
    sessionTrace,
    decisionSurface,
    decisionTrack,
    decisionPulse,
    battlefieldSessionLines,
    decisionSurfaceLines,
    battlefieldDecisionFocus,
  } = buildDecisionSessionPacket(decisionFrame);
  const choices = (event?.choices || []).map((choice) => {
    const summary = summarizeChoiceEffects(choice, state);
    const frontline = decisionFrame.frontline || (pressure ? `${pressure.hostile}면 적 압박` : '기본 판독');
    return {
      id: choice.id,
      label: choice.text,
      impact: summary.notes,
      tone: summary.tone,
      score: summary.score,
      cityName: decisionFrame.cityName || null,
      cityId: decisionFrame.cityId || null,
      scene: decisionFrame.scene,
      frontline,
      nextAction: decisionFrame.nextAction,
      mapReadout: decisionFrame.mapReadout,
      decisionCity: decisionFrame.decisionCity || null,
      tags: decisionFrame.tags,
      decisionTrack,
      decisionPulse,
      battlefieldSessionLines,
      battlefieldDecisionFocus,
      decisionSurfaceLines,
      battlefieldSession: decisionFrame,
      decisionSurface,
      sessionTrace,
      rationale: buildChoiceRecommendation(choice, summary),
    };
  });
  const sortedChoices = [...choices].sort((a, b) => b.score - a.score);
  const recommended = sortedChoices[0] || null;
  const eventLabel = event?.layer === 'historical' ? '연의 사건' : '정세 보고';
  return {
    kicker: eventLabel,
    headline: event?.name || '정세 변화',
    summary: recommended?.rationale || extractLeadSentence(event?.narrative?.text) || '이 사건이 전장의 흐름을 바꿀 수 있습니다.',
    flavor: event?.narrative?.flavor || '',
    stakes: recommended?.rationale
      || (decisionFrame.focusCity
        ? `${decisionFrame.focusCity}에서 ${decisionFrame.nextAction}`
        : '이번 선택이 다음 달 전황과 전선 압박을 바꿉니다.'),
    cityId: decisionFrame.cityId,
    cityName: decisionFrame.cityName,
    focusCity: decisionFrame.focusCity,
    focusScene: decisionFrame.focusScene,
    decisionTrack,
    sessionTrace,
    battlefieldDecisionFocus,
    mapReadout: decisionFrame.mapReadout,
    scene: decisionFrame.scene,
    nextAction: decisionFrame.nextAction,
    battlefieldSession: decisionFrame,
    decisionFrame,
    continueLabel: city ? `${city.name} 판단 완료` : '보고 접수',
    recommendedChoiceId: recommended?.id || null,
    decisionSurface,
    choices,
    decisionPulse,
    decisionSurfaceLines,
    battlefieldSessionLines,
  };
}

function buildHeuristicResolutionPacket({ items = [], state }) {
  const doctrine = getFactionDoctrine(state?.player?.factionId);
  const playerCities = state?.getCitiesOfFaction?.(state?.player?.factionId) || [];
  const warItem = items.find((item) => item.type === 'war' || item.type === 'territory');
  const eventItem = items.find((item) => item.type === 'event' || item.type === 'alliance' || item.type === 'diplomacy');
  const warningCount = items.filter((item) => item.type === 'warning' || item.type === 'rebellion').length;
  const incomeCount = items.filter((item) => item.type === 'income' || item.type === 'food' || item.type === 'construction' || item.type === 'research').length;
  const frontCity = pickResolutionFocusCity(state, items, playerCities);
  const focusPressure = frontCity ? summarizeCityPressure(frontCity.id, state, state?.connections || []) : null;
  const opener = warItem || eventItem || items[0];
  const playbook = [
    frontCity ? `${doctrine?.resolution?.focusLabel || '판독 포인트'}: ${frontCity.name}` : `${doctrine?.resolution?.focusLabel || '판독 포인트'}: 전장 전체`,
    focusPressure
      ? `${doctrine?.resolution?.pressureLabel || '전선 압박'}: 적 ${focusPressure.hostile}면, 우군 ${focusPressure.friendly}개`
      : `${doctrine?.resolution?.pressureLabel || '전선 압박'}: 즉시 경고 신호를 확인하십시오.`,
    warningCount > 0
      ? `${doctrine?.resolution?.actionLabel || '우선 조치'}: 경고 ${warningCount}건`
      : `${doctrine?.resolution?.actionLabel || '우선 조치'}: 다음 월말 동선 확정`,
  ];
  const decisionFrame = buildDecisionContext({
    city: frontCity,
    state,
    pressure: focusPressure,
    mapReadout: buildResolutionMapLine(frontCity, state),
    scene: frontCity
      ? getRecommendedScene(frontCity, state, state?.connections || [])
      : '전장 정렬',
    connections: state?.connections || [],
    fallbackCity: '전장 전체',
  });
  const baseRisk = warningCount > 0
    ? `${warningCount}개의 경고가 다음 턴 선택지를 압박합니다.`
    : frontCity
      ? `${frontCity.name}을 중심으로 병력 ${formatCompactNumber(frontCity.army || 0)}를 유지해야 합니다.`
      : '지금은 전선보다 command sequencing이 더 중요합니다.';
  const baseAction = incomeCount > warningCount
    ? '이번 달 이익을 굳힐 거점을 먼저 열고 추가 명령을 이어가십시오.'
    : '경고가 뜬 거점부터 열어 손실 확산을 막는 편이 안전합니다.';
  const risk = joinCopyParts(doctrine?.resolution?.riskLead, baseRisk);
  const action = frontCity
    ? `${frontCity.name}에서 ${warningCount > 0 ? '경고 도시부터 열어 수비 균열을 막고 다음 명령을 배치하십시오.' : baseAction}`
    : baseAction;
  const directedAction = joinCopyParts(doctrine?.resolution?.actionLead, action);
  decisionFrame.nextAction = directedAction;
  const {
    sessionTrace,
    decisionSurface,
    decisionTrack,
    decisionPulse,
    battlefieldSessionLines,
    decisionSurfaceLines,
    battlefieldDecisionFocus,
  } = buildDecisionSessionPacket(decisionFrame);
  return {
    kicker: doctrine?.resolution?.kicker || '월말 전황',
    headline: opener?.text || '이번 달 결과를 정리합니다.',
    body: `${risk} ${directedAction}`.trim(),
    decisionFrame,
    focusScene: decisionFrame.focusScene,
    battlefieldSession: decisionFrame,
    focusCity: decisionFrame.focusCity,
    frontline: decisionFrame.frontline || '전선 판독 불가',
    mapReadout: decisionFrame.mapReadout,
    nextAction: decisionFrame.nextAction,
    decisionTrack,
    decisionPulse,
    decisionSurfaceLines,
    battlefieldDecisionFocus,
    battlefieldSessionLines,
    cityId: decisionFrame.cityId,
    decisionCity: decisionFrame.cityName,
    scene: decisionFrame.scene,
    decisionSurface,
    sessionTrace,
    playbook,
    phaseGuide: buildResolutionPhaseGuide(items),
  };
}

export function buildBattlefieldDirectorPacket(payload) {
  if (DIRECTOR_RUNTIME.provider) {
    const result = DIRECTOR_RUNTIME.provider('battlefield', payload);
    if (result) return result;
  }
  return buildHeuristicBattlefieldPacket(payload);
}

export function buildCommandDirectorPacket(payload) {
  if (DIRECTOR_RUNTIME.provider) {
    const result = DIRECTOR_RUNTIME.provider('command', payload);
    if (result) return result;
  }
  return buildHeuristicCommandPacket(payload);
}

export function buildFactionDirectorPacket(payload) {
  if (DIRECTOR_RUNTIME.provider) {
    const result = DIRECTOR_RUNTIME.provider('faction', payload);
    if (result) return result;
  }
  return buildHeuristicFactionPacket(payload);
}

export function buildEventDirectorPacket(payload) {
  if (DIRECTOR_RUNTIME.provider) {
    const result = DIRECTOR_RUNTIME.provider('event', payload);
    if (result) return result;
  }
  return buildHeuristicEventPacket(payload);
}

export function buildTurnResolutionDirectorPacket(payload) {
  if (DIRECTOR_RUNTIME.provider) {
    const result = DIRECTOR_RUNTIME.provider('resolution', payload);
    if (result) return result;
  }
  return buildHeuristicResolutionPacket(payload);
}

export function getBattlefieldSessionLines(source = {}, maxLines = 5) {
  const frame = source?.decisionSurface
    || source?.battlefieldSession
    || source?.sessionTrace
    || source?.decisionFrame
    || source
    || {};
  const track = Array.isArray(source?.battlefieldSessionLines) && source.battlefieldSessionLines.length > 0
    ? source.battlefieldSessionLines
    : Array.isArray(source?.decisionPulse) && source.decisionPulse.length > 0
      ? source.decisionPulse
      : Array.isArray(source?.decisionTrack) && source.decisionTrack.length > 0
        ? source.decisionTrack
        : buildBattlefieldSessionLines(frame);
  return track
    .map((line) => `${line || ''}`.trim())
    .filter(Boolean)
    .slice(0, maxLines);
}
