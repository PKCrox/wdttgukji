// app.js — 왜 다 턴 가지구 진입점

import { GameState } from '../../engine/core/game-state.js';
import { loadScenario, loadEvents, filterEventsForScenario } from '../../engine/data/loader.js';
import { executeTurnEvents, processPlayerChoice, endTurn } from '../../engine/core/turn-loop.js';
import { decideAndExecute } from '../../engine/ai/faction-ai.js';
import { MapRenderer } from './map-renderer.js';
import { EventUI } from './event-ui.js';
import { Sidebar, getCharName, FACTION_COLORS, showCharacterModal } from './sidebar.js';
import { ActionPanel, executePlayerAction } from './action-panel.js';

// --- 글로벌 상태 ---
let state = null;
let scenario = null;
let allEvents = [];
let map = null;
let eventUI = null;
let sidebar = null;
let actionPanel = null;
let processing = false;
let logVisible = false;
let selectedFaction = null;

// --- 초기화 ---
async function init() {
  eventUI = new EventUI();
  sidebar = new Sidebar();
  actionPanel = new ActionPanel();

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

  // 턴 로그 토글
  document.getElementById('btn-toggle-log').addEventListener('click', toggleLog);
  document.getElementById('btn-close-log').addEventListener('click', () => {
    document.getElementById('turn-log').classList.add('hidden');
    document.getElementById('btn-toggle-log').classList.remove('active');
    logVisible = false;
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

const FACTION_LEADERS = {
  wei: 'cao_cao', shu: 'liu_bei', wu: 'sun_quan',
  liu_zhang: 'liu_zhang_char', zhang_lu: 'zhang_lu_char',
};

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

  selectedFaction = null;
  document.getElementById('btn-confirm-faction').disabled = true;

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
      document.getElementById('btn-confirm-faction').disabled = false;
    });

    container.appendChild(card);
  }

  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('faction-screen').classList.remove('hidden');
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
  document.getElementById('intro-narrative').innerHTML = meta.intro.map(p => `<p>${p}</p>`).join('');
  document.getElementById('intro-stats').innerHTML = `
    <div class="intro-stat"><div class="label">영토</div><div class="value">${cities.length}성</div></div>
    <div class="intro-stat"><div class="label">병력</div><div class="value">${(army/10000).toFixed(1)}만</div></div>
    <div class="intro-stat"><div class="label">장수</div><div class="value">${chars.length}명</div></div>
  `;

  document.getElementById('faction-screen').classList.add('hidden');
  document.getElementById('intro-screen').classList.remove('hidden');
}

// --- 게임 시작 ---
async function startNewGame() {
  // 선택한 세력으로 오버라이드
  if (selectedFaction) {
    scenario.playerFaction = selectedFaction;
    scenario.playerCharacter = FACTION_LEADERS[selectedFaction];
  }

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
  logVisible = false;
}

// --- 게임 화면 초기화 ---
function initGameScreen() {
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');

  // 맵 초기화
  const canvas = document.getElementById('game-map');
  map = new MapRenderer(canvas, scenario);
  actionPanel.setConnections(scenario.connections);

  // 캐릭터 클릭 콜백
  sidebar.onCharacterClick = (charId) => {
    showCharacterModal(charId, state);
  };

  // 맵 클릭 이벤트
  canvas.addEventListener('click', (e) => {
    if (processing) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cityId = map.hitTest(x, y);

    if (cityId) {
      map.selectedCity = cityId;
      sidebar.showCityDetail(cityId, state);
      actionPanel.show(cityId, state);
    } else {
      map.selectedCity = null;
      sidebar.clearCityDetail();
      actionPanel.hide();
    }
    map.render(state);
  });

  // 맵 호버
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cityId = map.hitTest(x, y);
    if (cityId !== map.hoveredCity) {
      map.hoveredCity = cityId;
      canvas.style.cursor = cityId ? 'pointer' : 'crosshair';
      map.render(state);
    }
  });

  // 행동 콜백
  actionPanel.onAction = (actionType, params) => {
    if (processing) return;
    const success = executePlayerAction(actionType, params, state);
    if (success) {
      updateUI();
      if (map.selectedCity) {
        sidebar.showCityDetail(map.selectedCity, state);
        actionPanel.show(map.selectedCity, state);
      }
    }
  };

  updateUI();
}

// --- 턴 진행 ---
async function nextTurn() {
  if (processing || !state || state.gameOver) return;
  processing = true;
  document.getElementById('btn-next-turn').disabled = true;

  try {
    // 이벤트 펄스 초기화
    map.clearEventPulses();

    // 병력 스냅샷 (이동 감지용)
    const armyBefore = {};
    const ownerBefore = {};
    for (const [cid, c] of Object.entries(state.cities)) {
      armyBefore[cid] = c.army;
      ownerBefore[cid] = c.owner;
    }

    // 1. 이벤트 체크
    const playerEvents = executeTurnEvents(state, allEvents);

    // 2. 플레이어 이벤트 처리 + 이벤트 도시 펄스
    for (const event of playerEvents) {
      // 이벤트 관련 도시에 펄스
      addEventPulsesForEvent(event);

      const choiceId = await eventUI.show(event);
      processPlayerChoice(state, event, choiceId);
      updateUI();
    }

    // 3. AI 세력 행동
    for (const [factionId, faction] of Object.entries(state.factions)) {
      if (factionId === state.player.factionId) continue;
      if (!faction.active) continue;
      if (state.getCitiesOfFaction(factionId).length === 0) {
        faction.active = false;
        continue;
      }
      decideAndExecute(factionId, state, scenario.connections);
    }

    // 4. 자원 결산 + 턴 진행
    endTurn(state);

    // 5. 병력 이동 애니메이션 감지
    detectAndAnimateMovements(armyBefore, ownerBefore, state);

    // 6. UI 갱신
    updateUI();
    updateTurnLog();

    // 6. 게임오버 체크
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

  // 상단 바
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

  // 맵
  map.render(state);

  // 사이드바
  sidebar.updateFactionSummary(state);
}

// --- 턴 로그 (누적, 토글 방식) ---
function toggleLog() {
  const logContainer = document.getElementById('turn-log');
  const btn = document.getElementById('btn-toggle-log');

  if (logVisible) {
    logContainer.classList.add('hidden');
    btn.classList.remove('active');
    logVisible = false;
  } else {
    updateTurnLogContent();
    logContainer.classList.remove('hidden');
    btn.classList.add('active');
    logVisible = true;
  }
}

function updateTurnLog() {
  if (logVisible) {
    updateTurnLogContent();
  }
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

  // 최근 10턴만 표시
  for (const turn of turns.slice(0, 10)) {
    const entries = grouped.get(turn);
    const first = entries[0];

    const header = document.createElement('div');
    header.className = 'log-turn-header';
    header.textContent = `${first.year}년 ${first.month}월 (턴 ${turn})`;
    logContent.appendChild(header);

    for (const entry of entries) {
      const div = document.createElement('div');
      div.className = `log-entry ${entry.type}`;
      div.textContent = entry.message;
      logContent.appendChild(div);
    }
  }
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
  toast.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:var(--accent);color:#0a0a0f;padding:0.5rem 1.5rem;border-radius:6px;font-weight:600;font-size:0.85rem;z-index:200;opacity:0;transition:opacity 0.3s';
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; });
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 1500);
}

// --- 부트 ---
init();
