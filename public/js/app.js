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

// --- 초기화 ---
async function init() {
  eventUI = new EventUI();
  sidebar = new Sidebar();
  actionPanel = new ActionPanel();

  // 버튼 바인딩
  document.getElementById('btn-new-game').addEventListener('click', startNewGame);
  document.getElementById('btn-load-game').addEventListener('click', loadGame);
  document.getElementById('btn-next-turn').addEventListener('click', nextTurn);
  document.getElementById('btn-save').addEventListener('click', saveGame);
  document.getElementById('btn-menu').addEventListener('click', returnToMenu);
  document.getElementById('btn-restart').addEventListener('click', returnToMenu);

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

async function startNewGame() {
  try {
    scenario = await loadScenario('/engine/data/scenarios/208-red-cliffs.json');
    const rawEvents = await loadEvents('/data/events/all-events.json');
    allEvents = filterEventsForScenario(rawEvents, 208, 225);

    state = new GameState(scenario);
    initGameScreen();
  } catch (err) {
    console.error('Failed to start game:', err);
    alert('게임 데이터 로드 실패: ' + err.message);
  }
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
  document.getElementById('start-screen').classList.remove('hidden');

  const saved = localStorage.getItem('wdttgukji_save');
  const btn = document.getElementById('btn-load-game');
  btn.disabled = !saved;
  btn.style.opacity = saved ? '1' : '0.4';

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
