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
let logVisible = true;
let turnResolution = null;
let selectedFaction = null;

// --- 초기화 ---
async function init() {
  eventUI = new EventUI();
  sidebar = new Sidebar();
  actionPanel = new ActionPanel();
  turnResolution = new TurnResolution();

  // 버튼 바인딩
  document.getElementById('btn-new-game').addEventListener('click', showFactionSelect);
  document.getElementById('btn-load-game').addEventListener('click', loadGame);
  document.getElementById('btn-next-turn').addEventListener('click', nextTurn);
  document.getElementById('btn-save').addEventListener('click', saveGame);
  document.getElementById('btn-menu').addEventListener('click', returnToMenu);
  document.getElementById('btn-restart').addEventListener('click', returnToMenu);
  document.getElementById('btn-confirm-faction').addEventListener('click', showIntro);
  document.getElementById('btn-back-to-start').addEventListener('click', backToStart);
  document.getElementById('btn-start-game').addEventListener('click', startNewGame);
  document.getElementById('intro-dialogue').addEventListener('click', advanceDialogue);
  document.getElementById('btn-open-command').addEventListener('click', openSelectedCityCommand);

  document.getElementById('btn-toggle-log').addEventListener('click', toggleLog);
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
  const saved = localStorage.getItem('wdttgukji_save');
  if (!saved) {
    document.getElementById('btn-load-game').disabled = true;
    document.getElementById('btn-load-game').style.opacity = '0.4';
  }
}

// --- 세력 선택 데이터 ---
const FACTION_META = {
  wei: {
    leader: '조조 (曹操)',
    diff: 'easy', diffLabel: '쉬움',
    desc: '천하의 절반을 이미 손에 넣은 난세의 간웅. 압도적 병력과 인재로 남하를 노린다.',
    intro: [
      '건안 13년. 천하의 절반이 이미 당신의 손 안에 있다.',
      '형주의 유종이 항복하며 수군까지 얻었다. 80만 대군을 이끌고 장강을 건너면 강동의 손권과 떠돌이 유비 따위는 단숨에 쓸어버릴 수 있다.',
      '그러나 전쟁은 언제나 변수가 있는 법. 남방의 풍토, 수전에 익숙지 않은 북방 병사들, 그리고 아직 항복하지 않은 자들의 절박함 —',
      '천하통일의 마지막 퍼즐을 맞춰라.',
    ],
  },
  shu: {
    leader: '유비 (劉備)',
    diff: 'hard', diffLabel: '어려움',
    desc: '형주에서 겨우 버티는 한실의 후예. 제갈량의 천하삼분지계가 유일한 희망.',
    intro: [
      '건안 13년. 당신에게 남은 것은 형주 한 귀퉁이와 4만의 병사, 그리고 사람들.',
      '조조의 80만 대군이 남하하고 있다. 혼자서는 버틸 수 없다. 제갈량이 말했다 — 강동의 손권과 손잡으면 살 길이 있다고.',
      '한실 부흥의 대의를 내걸었지만, 지금은 살아남는 것이 먼저다. 적벽에서 기적을 만들 수 있다면, 삼분천하의 한 축이 될 수 있다.',
      '바닥에서 시작하는 역전의 서사. 당신의 선택이 역사를 바꾼다.',
    ],
  },
  wu: {
    leader: '손권 (孫權)',
    diff: 'normal', diffLabel: '보통',
    desc: '강동의 젊은 군주. 아버지와 형이 남긴 기반 위에서 난세를 헤쳐나간다.',
    intro: [
      '건안 13년. 아버지 손견, 형 손책이 피로 일군 강동 땅이 위기에 처했다.',
      '조조가 80만을 이끌고 남하한다. 조정의 대신들은 항복을 외치고, 무장들은 결전을 부르짖는다. 결정은 당신의 몫이다.',
      '주유와 노숙이 있고, 장강의 천험이 있다. 유비와 손을 잡으면 승산이 생긴다 — 하지만 동맹은 영원하지 않다.',
      '지금은 함께 싸우되, 전쟁이 끝난 뒤의 판도까지 내다봐라.',
    ],
  },
  liu_zhang: {
    leader: '유장 (劉璋)',
    diff: 'hard', diffLabel: '어려움',
    desc: '익주의 안일한 군주. 비옥한 땅이 있지만 야심도, 인재도 부족하다.',
    intro: [
      '건안 13년. 익주와 성도는 천혜의 요새다. 촉도(蜀道)의 험준함이 외적을 막아주고, 비옥한 분지가 백성을 먹여살린다.',
      '그러나 편안함은 독이 되었다. 조조가 한중을 넘보고, 유비가 형주에서 서쪽을 바라본다. 장로가 북쪽에서 호시탐탐 노린다.',
      '아버지 유언이 남긴 땅을 지키는 것만으로도 벅차다. 인재는 떠나고, 신하들은 각자의 속셈이 있다.',
      '난세에서 안일함은 죽음이다. 살아남으려면 변해야 한다.',
    ],
  },
  zhang_lu: {
    leader: '장로 (張魯)',
    diff: 'vhard', diffLabel: '매우 어려움',
    desc: '한중의 오두미도 교주. 작은 땅, 적은 병력. 생존 자체가 도전.',
    intro: [
      '건안 13년. 한중 땅 하나, 병사 만 명. 이것이 당신의 전부다.',
      '북쪽의 조조는 관중을 평정한 뒤 언제든 남하할 수 있고, 남쪽의 유장과는 오랜 원한이 있다. 사방이 적이다.',
      '오두미도의 신도들이 당신을 따르지만, 전쟁은 신앙만으로 이길 수 없다.',
      '최소한의 자원으로 최대한의 외교를 펼쳐라. 한중의 지형을 이용하고, 강자들 사이에서 살아남는 길을 찾아라.',
    ],
  },
};

const OPENING_OBJECTIVES = {
  wei: [
    '남하 전선을 정리하고 형주 병력을 한 축으로 몰아붙인다.',
    '초반 몇 턴은 연구나 병참보다 전선 집결과 압박이 우선이다.',
  ],
  shu: [
    '생존이 최우선이다. 외교와 내정으로 첫 파도를 버틴다.',
    '형주의 약한 도시를 보강하고 연구/건설 한 축을 빠르게 연다.',
  ],
  wu: [
    '강동 수비와 전선 정비가 먼저다. 무리한 선공보다 방어 준비를 우선한다.',
    '외교와 연구를 통해 반격 타이밍을 만든다.',
  ],
  liu_zhang: [
    '익주의 안전지대를 활용해 내정과 방어 시설을 정비한다.',
    '전선이 열리기 전에 병력과 치안을 같이 쌓는다.',
  ],
  zhang_lu: [
    '한중 관문 방어와 치안 유지가 핵심이다.',
    '병력 손실 없이 시간을 벌며 연구와 방비를 축적한다.',
  ],
};

const FACTION_LEADERS = {
  wei: 'cao_cao', shu: 'liu_bei', wu: 'sun_quan',
  liu_zhang: 'liu_zhang_char', zhang_lu: 'zhang_lu_char',
};

// --- 세력별 도입 대화 ---
const FACTION_DIALOGUES = {
  wei: [
    { speaker: '순욱', text: '승상, 형주의 유종이 항복하며 수군까지 얻었습니다. 장강을 건너는 것은 시간 문제입니다.' },
    { speaker: '조조', text: '하하, 주유와 제갈량이 손을 잡는다 한들 80만 앞에서는 무력하지.' },
    { speaker: '가후', text: '승상, 한 가지 우려가 있습니다. 북방 병사들은 수전에 익숙하지 않고, 남방의 풍토병도...' },
    { speaker: '조조', text: '걱정 마라. 연환계로 배를 잇대면 육지나 다름없다. 병사들의 멀미도 해결될 것이야.' },
    { speaker: '순유', text: '손권에게 항복을 권하는 서신을 보내는 것도 일책입니다. 전의를 꺾으면 피를 흘리지 않아도 됩니다.' },
    { speaker: '조조', text: '좋다. 전쟁은 시작 전에 이기는 것이 상책. — 그러나 거부한다면, 남김없이 쓸어버릴 것이다.' },
  ],
  shu: [
    { speaker: '제갈량', text: '주공, 조조의 80만 대군이 남하합니다. 우리 힘만으로는 막을 수 없습니다.' },
    { speaker: '유비', text: '군사의 뜻은 알겠소. 하나 손권이 우리와 손잡을 이유가 있겠소?' },
    { speaker: '제갈량', text: '손권 역시 조조를 두려워합니다. 제가 강동으로 건너가 설득하겠습니다. 함께라면 승산이 있습니다.' },
    { speaker: '관우', text: '형님, 군사를 믿으십시오. 우리에게는 아직 대의가 있고, 따르는 백성이 있습니다.' },
    { speaker: '장비', text: '형님! 이 장익덕이 살아있는 한, 형님 뒤는 제가 지킵니다!' },
    { speaker: '유비', text: '...좋다. 군사, 강동으로 가시오. 한실 부흥의 마지막 불씨를 — 우리가 지켜야 하오.' },
  ],
  wu: [
    { speaker: '노숙', text: '주공, 유비 쪽에서 제갈량이라는 자가 사신으로 왔습니다. 연합을 제안하고 있습니다.' },
    { speaker: '손권', text: '조조가 80만을 이끌고 온다... 조정의 대신들은 뭐라 하던가?' },
    { speaker: '노숙', text: '장소, 진군 등은 항복을 주장합니다. 조조의 세가 너무 크다고...' },
    { speaker: '주유', text: '항복이라니! 손가 3대가 피로 일군 강동을 고스란히 바치자는 겁니까!' },
    { speaker: '손권', text: '...도독의 뜻은?' },
    { speaker: '주유', text: '제게 정예 5만을 주십시오. 장강의 바람과 불로 — 조조의 목을 가져오겠습니다.' },
  ],
  liu_zhang: [
    { speaker: '장송', text: '주공, 조조가 관중을 평정하고 한중을 넘봅니다. 우리도 대비가 필요합니다.' },
    { speaker: '유장', text: '촉도가 험하니 쉽게 들어오지는 못할 것이다...' },
    { speaker: '법정', text: '주공, 촉도만 믿어서는 안 됩니다. 병사를 훈련시키고 관문을 보강해야 합니다.' },
    { speaker: '장송', text: '(천하의 영웅들이 움직이는데, 이 분은 언제까지 성도에 앉아만 계시려나...)' },
    { speaker: '유장', text: '...아버지가 남기신 이 땅만은 지켜야지. 그래, 우선 관문부터 점검하자.' },
  ],
  zhang_lu: [
    { speaker: '양송', text: '교주, 남쪽 유장과의 갈등이 심해지고 있습니다. 유장이 장수를 파견했다는 소식도...' },
    { speaker: '장로', text: '도의 힘으로 백성을 다스리면 만사가 평안한 법이다.' },
    { speaker: '방덕', text: '교주, 도로 나라를 지킬 수는 없습니다. 조조가 관중을 평정하면 한중이 다음 목표입니다.' },
    { speaker: '장로', text: '......' },
    { speaker: '방덕', text: '한중의 지형은 천혜의 요새입니다. 양평관만 굳건히 지키면 10만 대군도 막아낼 수 있습니다.' },
    { speaker: '장로', text: '그래... 우선은 방어를 굳히자. 신도들의 힘을 모아, 한중만은 지켜내야 한다.' },
  ],
};

let dialogueState = { lines: [], index: 0 };

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
    const f = scenario.factions[fid];
    const meta = FACTION_META[fid];
    const cities = Object.values(scenario.cities).filter(c => c.owner === fid);
    const army = cities.reduce((a, c) => a + c.army, 0);
    const chars = Object.values(scenario.characters).filter(c => c.faction === fid);

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
      <div class="faction-card-stats">
        <span>도시 <span class="val">${cities.length}성</span></span>
        <span>병력 <span class="val">${(army/10000).toFixed(1)}만</span></span>
        <span>자금 <span class="val">${f.gold.toLocaleString()}</span></span>
        <span>장수 <span class="val">${chars.length}명</span></span>
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

  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('faction-screen').classList.remove('hidden');

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
      <div class="faction-preview-footer">좌측에서 세력을 선택하면 시작 목표와 전력, 전장 위치가 즉시 갱신됩니다.</div>
    `;
    return;
  }

  const faction = sc.factions[factionId];
  const meta = FACTION_META[factionId];
  const cities = Object.values(sc.cities).filter(city => city.owner === factionId);
  const army = cities.reduce((sum, city) => sum + city.army, 0);
  const chars = Object.values(sc.characters).filter(char => char.faction === factionId);
  const allies = (faction.allies || []).map(id => sc.factions[id]?.name).filter(Boolean).join(' · ') || '없음';
  const enemies = (faction.enemies || []).map(id => sc.factions[id]?.name).filter(Boolean).join(' · ') || '없음';
  const objectives = OPENING_OBJECTIVES[factionId] || [];
  const color = COLORS[factionId] || '#c19a55';

  panel.innerHTML = `
    <div class="faction-preview-kicker" style="color:${color}">${meta.diffLabel} 난도</div>
    <div class="faction-preview-title">${faction.name}</div>
    <div class="faction-preview-meta">${meta.leader}</div>
    <div class="faction-preview-copy">${meta.desc}</div>
    <div class="faction-preview-grid">
      <div class="faction-preview-stat"><span class="label">보유 도시</span><span class="value">${cities.length}성</span></div>
      <div class="faction-preview-stat"><span class="label">총병력</span><span class="value">${(army / 10000).toFixed(1)}만</span></div>
      <div class="faction-preview-stat"><span class="label">장수</span><span class="value">${chars.length}명</span></div>
      <div class="faction-preview-stat"><span class="label">자금</span><span class="value">${faction.gold.toLocaleString()}</span></div>
    </div>
    <div class="faction-preview-objectives">
      <h3>오프닝 목표</h3>
      <ul>${objectives.map(line => `<li>${line}</li>`).join('')}</ul>
    </div>
    <div class="faction-preview-footer">우호: ${allies}<br>적대: ${enemies}</div>
  `;
}

function backToStart() {
  document.getElementById('faction-screen').classList.add('hidden');
  document.getElementById('start-screen').classList.remove('hidden');
}

// --- 도입 스토리 ---
function showIntro() {
  if (!selectedFaction) return;
  const meta = FACTION_META[selectedFaction];
  const f = scenario.factions[selectedFaction];
  const cities = Object.values(scenario.cities).filter(c => c.owner === selectedFaction);
  const army = cities.reduce((a, c) => a + c.army, 0);
  const chars = Object.values(scenario.characters).filter(c => c.faction === selectedFaction);

  document.getElementById('intro-title').textContent = `${f.name} — ${meta.leader}`;
  document.getElementById('intro-brief').textContent = meta.desc;
  document.getElementById('intro-narrative').innerHTML = meta.intro.map(p => `<p>${p}</p>`).join('');
  document.getElementById('intro-stats').innerHTML = `
    <div class="intro-stat"><div class="label">영토</div><div class="value">${cities.length}성</div></div>
    <div class="intro-stat"><div class="label">병력</div><div class="value">${(army/10000).toFixed(1)}만</div></div>
    <div class="intro-stat"><div class="label">장수</div><div class="value">${chars.length}명</div></div>
    <div class="intro-stat"><div class="label">자금</div><div class="value">${f.gold.toLocaleString()}</div></div>
    <div class="intro-stat"><div class="label">우호</div><div class="value">${(f.allies || []).map(id => scenario.factions[id]?.name).filter(Boolean).join(' · ') || '없음'}</div></div>
    <div class="intro-stat"><div class="label">적대</div><div class="value">${(f.enemies || []).map(id => scenario.factions[id]?.name).filter(Boolean).join(' · ') || '없음'}</div></div>
  `;
  document.getElementById('intro-objectives').innerHTML = `
    <h3>출정 목표</h3>
    <ul>${(OPENING_OBJECTIVES[selectedFaction] || []).map(line => `<li>${line}</li>`).join('')}</ul>
  `;

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

  document.getElementById('faction-screen').classList.add('hidden');
  document.getElementById('intro-screen').classList.remove('hidden');
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

  document.getElementById('intro-screen').classList.add('hidden');
  initGameScreen();
}

function loadGame() {
  const saved = localStorage.getItem('wdttgukji_save');
  if (!saved) return;

  try {
    state = GameState.deserialize(saved);
    // 시나리오 데이터는 별도 로드 필요
    loadScenario('/engine/data/scenarios/208-red-cliffs.json').then(s => {
      scenario = s;
      loadEvents('/data/events/all-events.json').then(rawEvents => {
        allEvents = filterEventsForScenario(rawEvents, 208, 225);
        initGameScreen();
      });
    });
  } catch (err) {
    console.error('Failed to load save:', err);
    alert('저장 데이터가 손상되었습니다.');
  }
}

function saveGame() {
  if (!state) return;
  localStorage.setItem('wdttgukji_save', state.serialize());
  showToast('저장 완료');
}

function returnToMenu() {
  if (dialogueState._timer) clearInterval(dialogueState._timer);
  actionPanel?.hide();
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('gameover-modal').classList.add('hidden');
  document.getElementById('faction-screen').classList.add('hidden');
  document.getElementById('intro-screen').classList.add('hidden');
  document.getElementById('start-screen').classList.remove('hidden');

  const saved = localStorage.getItem('wdttgukji_save');
  const btn = document.getElementById('btn-load-game');
  btn.disabled = !saved;
  btn.style.opacity = saved ? '1' : '0.4';

  selectedFaction = null;
  logVisible = true;
}

// --- 게임 화면 초기화 ---
function initGameScreen() {
  const gameScreen = document.getElementById('game-screen');
  document.getElementById('start-screen').classList.add('hidden');
  gameScreen.classList.remove('hidden');
  gameScreen.classList.remove('chronicle-collapsed');
  gameScreen.classList.remove('city-rail-open');
  document.getElementById('btn-toggle-log').classList.add('active');
  logVisible = true;
  applyScenarioMapArt(scenario);

  // 맵 초기화
  const canvas = document.getElementById('game-map');
  map = new MapRenderer(canvas, scenario);
  actionPanel.setConnections(scenario.connections);

  // 캐릭터 클릭 콜백
  sidebar.onCharacterClick = (charId) => {
    showCharacterModal(charId, state);
  };
  sidebar.onOpenCommand = () => {
    openSelectedCityCommand();
  };
  sidebar.setOpeningBrief(OPENING_OBJECTIVES[state.player.factionId] || []);

  // 맵 클릭 이벤트
  canvas.onclick = (e) => {
    if (processing) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cityId = map.hitTest(x, y);

    if (cityId) {
      map.selectedCity = cityId;
      sidebar.showCityDetail(cityId, state);
      actionPanel.setContext(cityId, state);
      document.getElementById('game-screen').classList.add('city-rail-open');
    } else {
      map.selectedCity = null;
      sidebar.clearCityDetail(state);
      actionPanel.setContext(null, state);
      actionPanel.hide();
      document.getElementById('game-screen').classList.remove('city-rail-open');
    }
    updateMapSelectionPanel();
    map.render(state);
  };

  // 맵 호버
  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cityId = map.hitTest(x, y);
    if (cityId !== map.hoveredCity) {
      map.hoveredCity = cityId;
      canvas.style.cursor = cityId ? 'pointer' : 'crosshair';
      map.render(state);
    }
  };

  // 행동 콜백
  actionPanel.onAction = (actionType, params) => {
    if (processing) return;
    const success = executePlayerAction(actionType, params, state, scenario.connections);
    if (success) {
      updateUI();
      if (map.selectedCity) {
        sidebar.showCityDetail(map.selectedCity, state);
        actionPanel.setContext(map.selectedCity, state);
      }
    }
    return success;
  };

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
  const button = document.getElementById('btn-open-command');
  if (!panel || !cityEl || !ownerEl || !button) return;

  if (!map?.selectedCity || !state?.cities?.[map.selectedCity]) {
    panel.classList.add('hidden');
    button.textContent = '명령 열기';
    button.disabled = true;
    return;
  }

  const city = state.cities[map.selectedCity];
  const faction = city.owner ? state.factions[city.owner] : null;
  panel.classList.remove('hidden');
  cityEl.textContent = city.name;
  ownerEl.textContent = faction
    ? `${faction.name} · 병력 ${city.army.toLocaleString()} · 사기 ${city.morale}`
    : `무주지 · 병력 ${city.army.toLocaleString()} · 사기 ${city.morale}`;
  button.textContent = `${city.name} 명령`;
  button.disabled = false;
}

function openSelectedCityCommand() {
  if (!map?.selectedCity || !state || processing) return;
  actionPanel.open(map.selectedCity, state);
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
    getSelectedFaction: () => selectedFaction,
    getSelectedCity: () => map?.selectedCity || null,
    selectFaction: (factionId) => {
      const card = document.querySelector(`.faction-card[data-faction="${factionId}"]`);
      if (!card) return false;
      card.click();
      return true;
    },
    showIntro: () => {
      showIntro();
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
    selectCity: (cityId) => {
      if (!state || !map || !state.cities?.[cityId]) return false;
      map.selectedCity = cityId;
      sidebar.showCityDetail(cityId, state);
      actionPanel.setContext(cityId, state);
      document.getElementById('game-screen').classList.add('city-rail-open');
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
