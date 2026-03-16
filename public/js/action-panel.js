// ActionPanel — 하단: 내정/외교/출진/인사 행동 버튼 (4시스템 통합)

import { resolveEnhancedCombat, chooseFormation, getAvailableFormations, FORMATIONS } from '../../engine/core/enhanced-combat.js';
import { attemptCapture } from '../../engine/core/character-manager.js';
import { investTrack, INVEST_BASE_COST } from '../../engine/core/domestic.js';
import { calculateDiplomacyChance } from '../../engine/core/diplomacy.js';
import * as diplomacy from '../../engine/core/diplomacy.js';
import * as charMgr from '../../engine/core/character-manager.js';
import { getCharName } from './sidebar.js';
import { canBuild, startConstruction, getAvailableBuildings, BUILDINGS } from '../../engine/core/buildings.js';
import { getAvailableTechs, startResearch, getResearchStatus, TECHS } from '../../engine/core/tech-tree.js';
import { ESPIONAGE_ACTIONS, calculateEspionageChance, executeEspionage } from '../../engine/core/espionage.js';
import { canMoveArmy, moveArmy, previewMovement } from '../../engine/core/troop-movement.js';

// ─── 행동 카테고리 ───
const CATEGORIES = {
  domestic: { name: '내정', icon: '⚒' },
  military: { name: '군사', icon: '⚔' },
  diplomacy: { name: '외교', icon: '🤝' },
  personnel: { name: '인사', icon: '👤' },
  build: { name: '건설', icon: '🏗' },
  research: { name: '연구', icon: '📜' },
  espionage: { name: '첩보', icon: '🕵' }
};

export class ActionPanel {
  constructor() {
    this.panel = document.getElementById('action-panel');
    this.contentArea = document.getElementById('action-panel-content');
    this.buttons = document.getElementById('action-buttons');
    this.tabBar = document.getElementById('action-tab-bar');
    this.titleEl = document.getElementById('action-panel-title');
    this.onAction = null;
    this._connections = [];
    this._activeCategory = null;

    // 닫기 버튼
    document.getElementById('action-panel-close').addEventListener('click', () => {
      this.hide();
    });
  }

  show(cityId, state) {
    const city = state.cities[cityId];
    if (!city) return this.hide();

    const isOwned = city.owner === state.player.factionId;
    const faction = state.getFaction(state.player.factionId);
    const noActions = state.actionsRemaining <= 0;

    // 헤더 도시명 업데이트
    const ownerName = city.owner ? (state.factions[city.owner]?.name || '') : '';
    this.titleEl.textContent = `${city.name}${ownerName ? ` — ${ownerName}` : ''}`;

    // 탭 바 (하단 고정)
    this.tabBar.innerHTML = '';
    this.buttons.innerHTML = '';

    const categories = isOwned
      ? ['domestic', 'military', 'personnel', 'diplomacy', 'build', 'research', 'espionage']
      : ['military', 'diplomacy', 'espionage'];

    for (const cat of categories) {
      const tab = document.createElement('button');
      tab.className = 'action-tab' + (cat === (this._activeCategory || categories[0]) ? ' active' : '');
      tab.textContent = `${CATEGORIES[cat].icon} ${CATEGORIES[cat].name}`;
      tab.addEventListener('click', () => {
        this._activeCategory = cat;
        this.show(cityId, state);
      });
      this.tabBar.appendChild(tab);
    }

    const activeCategory = this._activeCategory || categories[0];
    const content = document.createElement('div');
    content.className = 'action-content';

    switch (activeCategory) {
      case 'domestic':
        this._buildDomesticActions(content, cityId, state, faction, noActions);
        break;
      case 'military':
        this._buildMilitaryActions(content, cityId, state, faction, noActions, isOwned);
        break;
      case 'personnel':
        this._buildPersonnelActions(content, cityId, state, faction, noActions);
        break;
      case 'diplomacy':
        this._buildDiplomacyActions(content, cityId, state, faction, noActions);
        break;
      case 'build':
        this._buildBuildingActions(content, cityId, state, faction, noActions);
        break;
      case 'research':
        this._buildResearchActions(content, cityId, state, faction, noActions);
        break;
      case 'espionage':
        this._buildEspionageActions(content, cityId, state, faction, noActions);
        break;
    }

    this.buttons.appendChild(content);
    this.panel.classList.remove('hidden');
  }

  hide() {
    this.panel.classList.add('hidden');
    this._activeCategory = null;
  }

  // ─── 내정 ───

  _buildDomesticActions(container, cityId, state, faction, noActions) {
    const city = state.cities[cityId];
    const governor = city.governor;
    const tracks = [
      { key: 'agriculture', name: '농업', desc: '식량 생산 증가' },
      { key: 'commerce', name: '상업', desc: '금 수입 증가' },
      { key: 'technology', name: '기술', desc: '모집·방어·투자 효율' },
      { key: 'publicOrder', name: '치안', desc: '반란 방지, 인구 성장' }
    ];

    for (const track of tracks) {
      const current = city[track.key] || 0;
      const label = `${track.name} 투자 (${current}/100) — ${track.desc}`;
      this._addButton(label, `invest_${track.key}`, {
        cityId, track: track.key, governorId: governor,
        disabled: noActions || faction.gold < INVEST_BASE_COST || current >= 100,
        cost: `금 ${INVEST_BASE_COST}`
      }, container);
    }

    // 방어 강화 (별도)
    this._addButton(`방어 강화 (${city.defense}/100) — 금 500`, 'invest_defense', {
      cityId,
      disabled: noActions || faction.gold < 500 || city.defense >= 100,
      cost: '금 500'
    }, container);

    // 병력 모집
    this._addButton('병력 모집 — 금 1000', 'recruit', {
      cityId,
      disabled: noActions || faction.gold < 1000,
      cost: '금 1000'
    }, container);
  }

  // ─── 군사 ───

  _buildMilitaryActions(container, cityId, state, faction, noActions, isOwned) {
    const city = state.cities[cityId];

    if (isOwned) {
      // 출진 (인접 적 도시)
      const neighbors = this._getEnemyNeighbors(cityId, state);
      if (neighbors.length > 0) {
        for (const n of neighbors) {
          const target = state.cities[n];
          const terrain = state.getConnectionTerrain(cityId, n);
          const terrainLabel = { plains: '평지', river: '강', mountain: '산', forest: '숲', wetland: '습지' }[terrain] || '';
          this._addButton(
            `출진 → ${target.name} (병력 ${target.army.toLocaleString()}) [${terrainLabel}]`,
            'attack', {
              fromCity: cityId, toCity: n, terrain,
              disabled: noActions || city.army < 3000
            }, container);
        }
      } else {
        const hint = document.createElement('div');
        hint.className = 'action-hint';
        hint.textContent = '인접한 적 도시가 없습니다 (전쟁 중인 세력의 도시만 공격 가능)';
        container.appendChild(hint);
      }

      // 선전포고 (인접 비적대 세력)
      const nonHostileNeighbors = this._getNonHostileNeighborFactions(cityId, state);
      for (const fId of nonHostileNeighbors) {
        if (state.hasTruce(state.player.factionId, fId)) {
          this._addButton(
            `${state.factions[fId].name}에 선전포고 (휴전 중 — 평판 대폭 하락!)`,
            'declare_war', { targetFaction: fId, disabled: noActions },
            container);
        } else {
          this._addButton(
            `${state.factions[fId].name}에 선전포고`,
            'declare_war', { targetFaction: fId, disabled: noActions },
            container);
        }
      }

      // 병력 이동 (같은 세력 인접 도시)
      const friendlyNeighbors = this._getFriendlyNeighbors(cityId, state);
      if (friendlyNeighbors.length > 0 && city.army > 0) {
        const moveHeader = document.createElement('div');
        moveHeader.className = 'action-faction-header';
        moveHeader.textContent = '병력 이동';
        container.appendChild(moveHeader);

        for (const n of friendlyNeighbors) {
          const target = state.cities[n];
          const preview = previewMovement(state, cityId, Math.floor(city.army * 0.5));
          this._addButton(
            `→ ${target.name}에 병력 절반(${Math.floor(city.army * 0.5).toLocaleString()}) 이동`,
            'move_troops', {
              fromCity: cityId, toCity: n, amount: Math.floor(city.army * 0.5), generals: [],
              disabled: noActions || city.army < 1000
            }, container);
        }
      }
    } else if (city.owner) {
      // 적 도시: 선전포고
      if (!state.isAtWar(state.player.factionId, city.owner)) {
        this._addButton(`${state.factions[city.owner].name}에 선전포고`, 'declare_war', {
          targetFaction: city.owner,
          disabled: noActions
        }, container);
      }
    }
  }

  // ─── 인사 ───

  _buildPersonnelActions(container, cityId, state, faction, noActions) {
    const city = state.cities[cityId];

    // 인재 탐색
    const wanderers = state.getWanderingInCity(cityId);
    this._addButton(
      `인재 탐색 ${wanderers.length > 0 ? `(${wanderers.length}명 감지)` : '(미발견)'}`,
      'search_talent', {
        cityId,
        disabled: noActions
      }, container);

    // 포로 관리
    const captives = state.getCaptivesOfFaction(state.player.factionId)
      .filter(c => c.city === cityId);

    for (const captive of captives) {
      const totalStats = Object.values(captive.stats).reduce((s, v) => s + v, 0);
      this._addButton(
        `포로 설득: ${getCharName(captive.id)} (총${totalStats}, 감금 ${captive.turnsInCaptivity || 0}턴)`,
        'persuade_captive', {
          captiveId: captive.id, cityId,
          disabled: noActions
        }, container);

      this._addButton(
        `포로 석방: ${getCharName(captive.id)}`,
        'release_captive', {
          captiveId: captive.id,
          disabled: noActions
        }, container);
    }

    // 장수 이동 (같은 세력 다른 도시로)
    const generals = state.getCharactersInCity(cityId)
      .filter(c => c.faction === state.player.factionId && c.id !== faction.leader);

    if (generals.length > 0) {
      const myOtherCities = state.getCitiesOfFaction(state.player.factionId)
        .filter(c => c.id !== cityId);

      if (myOtherCities.length > 0) {
        for (const gen of generals.slice(0, 3)) { // 최대 3명 표시
          for (const targetCity of myOtherCities.slice(0, 2)) { // 최대 2도시
            this._addButton(
              `${getCharName(gen.id)} → ${targetCity.name} 이동`,
              'move_general', {
                charId: gen.id, fromCity: cityId, toCity: targetCity.id,
                disabled: noActions
              }, container);
          }
        }
      }
    }

    // 태수 임명
    if (city.owner === state.player.factionId) {
      const candidates = state.getCharactersInCity(cityId)
        .filter(c => c.faction === state.player.factionId && c.id !== city.governor);

      for (const cand of candidates.slice(0, 3)) {
        this._addButton(
          `${getCharName(cand.id)}를 태수로 임명`,
          'appoint_governor', {
            charId: cand.id, cityId,
            disabled: noActions
          }, container);
      }
    }
  }

  // ─── 외교 ───

  _buildDiplomacyActions(container, cityId, state, faction, noActions) {
    const city = state.cities[cityId];
    if (!city.owner || city.owner === state.player.factionId) {
      // 내 도시일 때: 모든 세력 대상 외교
      for (const [fId, f] of Object.entries(state.factions)) {
        if (fId === state.player.factionId || !f.active) continue;
        this._buildDiplomacyForFaction(container, fId, state, faction, noActions);
      }
    } else {
      // 다른 세력 도시: 해당 세력만
      this._buildDiplomacyForFaction(container, city.owner, state, faction, noActions);
    }
  }

  _buildDiplomacyForFaction(container, targetFactionId, state, faction, noActions) {
    const target = state.factions[targetFactionId];
    if (!target) return;

    const header = document.createElement('div');
    header.className = 'action-faction-header';
    header.textContent = `${target.name} (평판 ${target.reputation || 100})`;
    container.appendChild(header);

    const isAtWar = state.isAtWar(state.player.factionId, targetFactionId);
    const isAllied = state.isAllied(state.player.factionId, targetFactionId);
    const hasTruce = state.hasTruce(state.player.factionId, targetFactionId);

    if (isAtWar) {
      // 강화 제안
      const { chance } = calculateDiplomacyChance(state.player.factionId, targetFactionId, 'peace', state);
      this._addButton(
        `강화 제안 (성공률 ${Math.round(chance * 100)}%)`,
        'propose_peace', { targetFaction: targetFactionId, disabled: noActions },
        container);
    }

    if (!isAtWar && !isAllied) {
      // 동맹 제안
      const { chance } = calculateDiplomacyChance(state.player.factionId, targetFactionId, 'alliance', state);
      this._addButton(
        `동맹 제안 (성공률 ${Math.round(chance * 100)}%)`,
        'propose_alliance', { targetFaction: targetFactionId, disabled: noActions },
        container);

      // 혼인동맹
      const mChance = calculateDiplomacyChance(state.player.factionId, targetFactionId, 'marriage', state);
      this._addButton(
        `혼인동맹 (성공률 ${Math.round(mChance.chance * 100)}%)`,
        'propose_marriage', { targetFaction: targetFactionId, disabled: noActions },
        container);
    }

    // 조공
    if (!isAtWar && faction.gold >= 2000) {
      this._addButton(
        `조공 (금 2000) — 호감·평판 상승`,
        'send_tribute', { targetFaction: targetFactionId, amount: 2000, disabled: noActions },
        container);
    }

    // 위협 (병력 우세 시만)
    if (!isAtWar && !isAllied) {
      const myArmy = state.getTotalArmy(state.player.factionId);
      const targetArmy = state.getTotalArmy(targetFactionId);
      if (myArmy > targetArmy * 2) {
        const { chance } = calculateDiplomacyChance(state.player.factionId, targetFactionId, 'threaten', state);
        this._addButton(
          `위협 (성공률 ${Math.round(chance * 100)}%) — 평판 하락`,
          'threaten', { targetFaction: targetFactionId, disabled: noActions },
          container);
      }
    }
  }

  // ─── 건설 ───

  _buildBuildingActions(container, cityId, state, faction, noActions) {
    const city = state.cities[cityId];
    const buildings = getAvailableBuildings(state, cityId);

    // 현재 건물 상태
    const existing = city.buildings ? Object.entries(city.buildings) : [];
    if (existing.length > 0) {
      const statusBar = document.createElement('div');
      statusBar.className = 'action-status-bar';
      for (const [bId, b] of existing) {
        const name = BUILDINGS[bId]?.name || bId;
        if (b.building) {
          statusBar.innerHTML += `<span class="status-tag building">🔨 ${name} 건설중 (${b.turnsLeft}턴)</span>`;
        } else {
          statusBar.innerHTML += `<span class="status-tag done">${name} Lv.${b.level}</span>`;
        }
      }
      container.appendChild(statusBar);
    }

    const grid = document.createElement('div');
    grid.className = 'action-card-grid';

    for (const b of buildings) {
      const ex = city.buildings?.[b.id];
      const levelStr = ex ? `Lv.${ex.level}→${ex.level + 1}` : 'Lv.1';
      const disabled = noActions || !b.canBuild;
      const card = document.createElement('button');
      card.className = 'action-card' + (disabled ? ' disabled' : '');
      card.disabled = disabled;
      card.innerHTML = `
        <div class="ac-name">${b.name} <span class="ac-level">${levelStr}</span></div>
        <div class="ac-desc">${BUILDINGS[b.id]?.desc || ''}</div>
        <div class="ac-cost">금 ${b.cost.toLocaleString()}</div>`;
      card.addEventListener('click', () => {
        if (this.onAction) this.onAction('build', { cityId, buildingId: b.id });
      });
      grid.appendChild(card);
    }
    container.appendChild(grid);
  }

  // ─── 연구 ───

  _buildResearchActions(container, cityId, state, faction, noActions) {
    const CATEGORY_LABELS = { military: '군사', economy: '경제', special: '특수' };
    const CATEGORY_COLORS = { military: '#E74C3C', economy: '#F39C12', special: '#9B59B6' };
    const status = getResearchStatus(state, state.player.factionId);

    const statusBar = document.createElement('div');
    statusBar.className = 'action-status-bar';
    if (status.researching) {
      statusBar.innerHTML += `<span class="status-tag building">📜 ${status.name} 연구중 (${status.turnsLeft}턴)</span>`;
    }
    statusBar.innerHTML += `<span class="status-tag done">완료 ${status.completedCount}개</span>`;
    container.appendChild(statusBar);

    const grid = document.createElement('div');
    grid.className = 'action-card-grid';

    const techs = getAvailableTechs(state, state.player.factionId);
    for (const t of techs) {
      const disabled = noActions || !t.available;
      const catLabel = CATEGORY_LABELS[t.category] || t.category;
      const catColor = CATEGORY_COLORS[t.category] || '#666';
      const card = document.createElement('button');
      card.className = 'action-card' + (disabled ? ' disabled' : '');
      card.disabled = disabled;
      card.innerHTML = `
        <div class="ac-name">${t.name} <span class="ac-cat" style="background:${catColor}">${catLabel}</span></div>
        <div class="ac-desc">${TECHS[t.id]?.desc || ''}${!t.available ? `<br><span class="ac-lock">🔒 ${t.reason}</span>` : ''}</div>
        <div class="ac-cost">금 ${t.cost.toLocaleString()} · ${t.turns}턴</div>`;
      card.addEventListener('click', () => {
        if (this.onAction) this.onAction('start_research', { techId: t.id });
      });
      grid.appendChild(card);
    }
    container.appendChild(grid);
  }

  // ─── 첩보 ───

  _buildEspionageActions(container, cityId, state, faction, noActions) {
    const city = state.cities[cityId];
    const isOwned = city.owner === state.player.factionId;

    if (isOwned) {
      const hint = document.createElement('div');
      hint.className = 'action-hint';
      hint.textContent = '적 도시를 선택하면 첩보 활동을 수행할 수 있습니다';
      container.appendChild(hint);
      return;
    }

    const myChars = state.getCharactersOfFaction(state.player.factionId);
    const spies = myChars.filter(c => c.stats.intellect >= 60).sort((a, b) => b.stats.intellect - a.stats.intellect);
    const bestSpy = spies[0];

    if (!bestSpy) {
      const hint = document.createElement('div');
      hint.className = 'action-hint';
      hint.textContent = '지력 60 이상의 장수가 없어 첩보 불가';
      container.appendChild(hint);
      return;
    }

    const statusBar = document.createElement('div');
    statusBar.className = 'action-status-bar';
    statusBar.innerHTML = `<span class="status-tag done">🕵 ${getCharName(bestSpy.id)} (지력 ${bestSpy.stats.intellect})</span>`;
    container.appendChild(statusBar);

    const grid = document.createElement('div');
    grid.className = 'action-card-grid';

    for (const [actionId, action] of Object.entries(ESPIONAGE_ACTIONS)) {
      const { chance } = calculateEspionageChance(state, bestSpy.id, cityId, actionId);
      const disabled = noActions || faction.gold < action.cost;
      const chanceColor = chance >= 0.6 ? '#2ECC71' : chance >= 0.3 ? '#F39C12' : '#E74C3C';
      const card = document.createElement('button');
      card.className = 'action-card' + (disabled ? ' disabled' : '');
      card.disabled = disabled;
      card.innerHTML = `
        <div class="ac-name">${action.name} <span class="ac-chance" style="color:${chanceColor}">${Math.round(chance * 100)}%</span></div>
        <div class="ac-desc">${action.desc}</div>
        <div class="ac-cost">금 ${action.cost.toLocaleString()}</div>`;
      card.addEventListener('click', () => {
        if (this.onAction) this.onAction('espionage', {
          spyId: bestSpy.id, targetCityId: cityId, actionType: actionId
        });
      });
      grid.appendChild(card);
    }
    container.appendChild(grid);
  }

  // ─── 유틸 ───

  _addButton(label, actionType, params = {}, container = null) {
    const btn = document.createElement('button');
    btn.className = 'btn-action';
    btn.textContent = label;
    btn.disabled = params.disabled || false;
    btn.addEventListener('click', () => {
      if (this.onAction) this.onAction(actionType, params);
    });
    (container || this.buttons).appendChild(btn);
  }

  _getFriendlyNeighbors(cityId, state) {
    const result = [];
    if (!this._connections) return result;
    for (const [a, b] of this._connections) {
      let neighbor = null;
      if (a === cityId) neighbor = b;
      else if (b === cityId) neighbor = a;
      if (neighbor) {
        const city = state.cities[neighbor];
        if (city && city.owner === state.player.factionId) {
          result.push(neighbor);
        }
      }
    }
    return result;
  }

  _getEnemyNeighbors(cityId, state) {
    const result = [];
    if (!this._connections) return result;

    for (const [a, b] of this._connections) {
      let neighbor = null;
      if (a === cityId) neighbor = b;
      else if (b === cityId) neighbor = a;

      if (neighbor) {
        const city = state.cities[neighbor];
        if (city && city.owner && city.owner !== state.player.factionId &&
            state.isAtWar(state.player.factionId, city.owner)) {
          result.push(neighbor);
        }
      }
    }
    return result;
  }

  _getNonHostileNeighborFactions(cityId, state) {
    const factions = new Set();
    if (!this._connections) return [];

    for (const [a, b] of this._connections) {
      let neighbor = null;
      if (a === cityId) neighbor = b;
      else if (b === cityId) neighbor = a;

      if (neighbor) {
        const city = state.cities[neighbor];
        if (city && city.owner && city.owner !== state.player.factionId &&
            !state.isAtWar(state.player.factionId, city.owner)) {
          factions.add(city.owner);
        }
      }
    }
    return [...factions];
  }

  setConnections(connections) {
    this._connections = connections;
  }
}

// ─── 플레이어 행동 실행 ───

export function executePlayerAction(actionType, params, state) {
  const faction = state.getFaction(state.player.factionId);
  if (!faction || state.actionsRemaining <= 0) return false;

  switch (actionType) {
    // ── 내정 ──
    case 'invest_agriculture':
    case 'invest_commerce':
    case 'invest_technology':
    case 'invest_publicOrder': {
      const track = actionType.replace('invest_', '');
      const result = investTrack(params.cityId, track, state, params.governorId);
      if (!result.success) return false;
      const names = { agriculture: '농업', commerce: '상업', technology: '기술', publicOrder: '치안' };
      state.actionsRemaining--;
      state.log(`${state.cities[params.cityId].name}에 ${names[track]} 투자 (+${result.gain})`, 'player');
      return true;
    }

    case 'invest_defense': {
      const city = state.cities[params.cityId];
      if (!city || faction.gold < 500) return false;
      faction.gold -= 500;
      city.defense = Math.min(100, city.defense + 5);
      state.actionsRemaining--;
      state.log(`${city.name}에 방어 강화 (방어 +5)`, 'player');
      return true;
    }

    case 'recruit': {
      const city = state.cities[params.cityId];
      if (!city || faction.gold < 1000) return false;
      faction.gold -= 1000;
      const techBonus = 1 + (city.technology || 0) * 0.005;
      const recruits = Math.min(3000, Math.floor(city.population * 0.05 * techBonus));
      city.army += recruits;
      state.actionsRemaining--;
      state.log(`${city.name}에서 ${recruits}명 모집`, 'player');
      return true;
    }

    // ── 군사 ──
    case 'attack': {
      const from = state.cities[params.fromCity];
      const to = state.cities[params.toCity];
      if (!from || !to || from.army < 3000) return false;

      const attackArmy = Math.floor(from.army * 0.6);
      from.army -= attackArmy;

      const atkGenerals = state.getCharactersInCity(params.fromCity)
        .filter(c => c.faction === state.player.factionId)
        .sort((a, b) => b.stats.command - a.stats.command);
      const defGenerals = state.getCharactersInCity(params.toCity)
        .filter(c => c.faction === to.owner)
        .sort((a, b) => b.stats.command - a.stats.command);

      const terrain = state.getConnectionTerrain(params.fromCity, params.toCity);
      const armyRatio = attackArmy / Math.max(1, to.army);
      const atkFormation = chooseFormation(atkGenerals, terrain, true, armyRatio);
      const defFormation = chooseFormation(defGenerals, terrain, false, 1 / armyRatio);

      const result = resolveEnhancedCombat(
        { army: attackArmy, morale: from.morale, generals: atkGenerals, formation: atkFormation },
        { army: to.army, morale: to.morale, defense: to.defense, generals: defGenerals, formation: defFormation },
        { terrain },
        state
      );

      to.army = result.defenderRemaining;
      const survivors = result.attackerRemaining;

      if (result.winner === 'attacker') {
        // 포로 포획
        const defCharIds = defGenerals.map(g => g.id);
        const captured = attemptCapture(defCharIds, state.player.factionId, state);

        to.owner = state.player.factionId;
        to.army = survivors;
        to.morale = Math.max(20, result.attackerMorale);

        let msg = `${to.name} 점령! (${result.rounds}라운드, ${result.formations.attacker} vs ${result.formations.defender})`;
        if (result.stratagemUsed?.success) msg += ` [${result.stratagemUsed.name}]`;
        if (captured.length > 0) msg += ` (포로 ${captured.length}명)`;
        state.log(msg, 'territory');
      } else {
        from.army += survivors;
        let msg = `${to.name} 공격 실패 (아군 -${result.attackerLoss}, 적 -${result.defenderLoss})`;
        if (result.stratagemUsed) msg += ` [${result.stratagemUsed.name} ${result.stratagemUsed.success ? '성공' : '실패'}]`;
        state.log(msg, 'war');
      }

      state.actionsRemaining--;
      return true;
    }

    case 'declare_war': {
      diplomacy.declareWar(state.player.factionId, params.targetFaction, state);
      state.actionsRemaining--;
      state.log(`${state.factions[params.targetFaction].name}에 선전포고!`, 'war');
      return true;
    }

    // ── 외교 ──
    case 'propose_peace': {
      const result = diplomacy.proposePeace(state.player.factionId, params.targetFaction, state);
      state.actionsRemaining--;
      if (result.success) {
        state.log(`${state.factions[params.targetFaction].name}와 강화 성립!`, 'diplomacy');
      } else {
        state.log(`${state.factions[params.targetFaction].name}이(가) 강화를 거절`, 'info');
      }
      return true;
    }

    case 'propose_alliance': {
      const result = diplomacy.proposeAlliance(state.player.factionId, params.targetFaction, state);
      state.actionsRemaining--;
      if (result.success) {
        state.log(`${state.factions[params.targetFaction].name}와 동맹 체결!`, 'alliance');
      } else {
        state.log(`${state.factions[params.targetFaction].name}이(가) 동맹을 거절`, 'info');
      }
      return true;
    }

    case 'propose_marriage': {
      const result = diplomacy.proposeMarriage(state.player.factionId, params.targetFaction, state);
      state.actionsRemaining--;
      if (result.success) {
        state.log(`${state.factions[params.targetFaction].name}와 혼인동맹!`, 'alliance');
      } else {
        state.log(`${state.factions[params.targetFaction].name}이(가) 혼인을 거절`, 'info');
      }
      return true;
    }

    case 'send_tribute': {
      const result = diplomacy.sendTribute(state.player.factionId, params.targetFaction, params.amount, state);
      state.actionsRemaining--;
      if (result.success) {
        state.log(`${state.factions[params.targetFaction].name}에 조공 (금 ${result.amount}, 평판 +${result.repGain})`, 'diplomacy');
      }
      return true;
    }

    case 'threaten': {
      const result = diplomacy.threaten(state.player.factionId, params.targetFaction, state);
      state.actionsRemaining--;
      if (result.success) {
        state.log(`${state.factions[params.targetFaction].name}를 위협! (금 ${result.tribute} 획득)`, 'diplomacy');
      } else {
        state.log(`${state.factions[params.targetFaction].name}이(가) 위협에 불응`, 'info');
      }
      return true;
    }

    // ── 인사 ──
    case 'search_talent': {
      const myChars = state.getCharactersInCity(params.cityId)
        .filter(c => c.faction === state.player.factionId);
      const searcher = myChars.sort((a, b) => b.stats.charisma - a.stats.charisma)[0];
      if (!searcher) {
        state.log('탐색할 장수가 없습니다', 'info');
        state.actionsRemaining--;
        return true;
      }

      const result = charMgr.searchForTalent(params.cityId, searcher.id, state);
      state.actionsRemaining--;
      if (result.found) {
        // 자동 등용 시도
        const recruitResult = charMgr.offerRecruitment(
          result.character.id, searcher.id, state.player.factionId, state
        );
        if (recruitResult.accepted) {
          state.log(`인재 발견! ${getCharName(result.character.id)} 등용 성공`, 'recruit');
        } else {
          state.log(`인재 발견: ${getCharName(result.character.id)} — 등용 거절`, 'info');
        }
      } else {
        state.log(`${state.cities[params.cityId].name}에서 인재를 찾지 못함`, 'info');
      }
      return true;
    }

    case 'persuade_captive': {
      const myChars = state.getCharactersInCity(params.cityId)
        .filter(c => c.faction === state.player.factionId);
      const persuader = myChars.sort((a, b) => b.stats.charisma - a.stats.charisma)[0];
      if (!persuader) return false;

      const result = charMgr.persuadeCaptive(
        params.captiveId, persuader.id, state.player.factionId, state
      );
      state.actionsRemaining--;
      if (result.success) {
        state.log(`포로 ${getCharName(params.captiveId)} 등용 성공!`, 'recruit');
      } else {
        state.log(`포로 ${getCharName(params.captiveId)}이(가) 설득을 거부 (${result.reason})`, 'info');
      }
      return true;
    }

    case 'release_captive': {
      state.releaseCaptive(params.captiveId);
      state.actionsRemaining--;
      state.log(`포로 ${getCharName(params.captiveId)} 석방`, 'info');
      return true;
    }

    case 'move_general': {
      state.moveCharacter(params.charId, params.toCity);
      state.actionsRemaining--;
      state.log(`${getCharName(params.charId)}를 ${state.cities[params.toCity].name}으로 이동`, 'player');
      return true;
    }

    case 'appoint_governor': {
      const success = state.appointGovernor(params.charId, params.cityId);
      if (!success) return false;
      state.actionsRemaining--;
      state.log(`${getCharName(params.charId)}를 ${state.cities[params.cityId].name} 태수로 임명`, 'player');
      return true;
    }

    // ── 건설 ──
    case 'build': {
      const result = startConstruction(state, params.cityId, params.buildingId);
      if (!result.success) return false;
      state.actionsRemaining--;
      return true;
    }

    // ── 연구 ──
    case 'start_research': {
      const result = startResearch(state, state.player.factionId, params.techId);
      if (!result.success) return false;
      state.actionsRemaining--;
      const tech = TECHS[params.techId];
      state.log(`${tech?.name || params.techId} 연구 시작 (${result.turns}턴)`, 'research');
      return true;
    }

    // ── 첩보 ──
    case 'espionage': {
      const result = executeEspionage(state, params.spyId, params.targetCityId, params.actionType);
      state.actionsRemaining--;
      if (result.success) {
        state.log(`첩보 성공: ${result.actionName}`, 'espionage');
      } else {
        let msg = `첩보 실패: ${result.actionName}`;
        if (result.captured) msg += ' (첩자 포로!)';
        state.log(msg, 'espionage');
      }
      return true;
    }

    // ── 병력 이동 ──
    case 'move_troops': {
      const result = moveArmy(state, params.fromCity, params.toCity, params.amount, params.generals || [], this._connections);
      if (!result.success) return false;
      state.actionsRemaining--;
      return true;
    }

    default:
      return false;
  }
}
