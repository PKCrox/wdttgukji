// Faction AI — 규칙 기반 세력 의사결정 (4시스템 통합)

import { getTendency } from './tendency-tables.js';
import { resolveEnhancedCombat, chooseFormation } from '../core/enhanced-combat.js';
import { attemptCapture } from '../core/character-manager.js';
import { investTrack } from '../core/domestic.js';
import { aiDiplomacy } from '../core/diplomacy.js';
import { getCharName } from '../data/names.js';
import { canBuild, startConstruction, BUILDINGS } from '../core/buildings.js';
import { getAvailableTechs, startResearch } from '../core/tech-tree.js';
import { executeEspionage, ESPIONAGE_ACTIONS } from '../core/espionage.js';
import { moveArmy } from '../core/troop-movement.js';

export function decideAndExecute(factionId, state, connections) {
  const faction = state.getFaction(factionId);
  if (!faction || !faction.active) return;

  const tendency = getTendency(faction.leader);
  const myCities = state.getCitiesOfFaction(factionId);
  if (myCities.length === 0) {
    faction.active = false;
    return;
  }

  const actions = [];

  // ── 1. 외교 (매 턴 독립 실행) ──
  const dipActions = aiDiplomacy(factionId, state, tendency);
  for (const a of dipActions) {
    actions.push(a.message);
  }

  // ── 2. 위기 대응: 위협받는 도시 방어 ──
  const threatenedCities = findThreatenedCities(factionId, state, connections);
  if (threatenedCities.length > 0 && Math.random() < 0.6 * tendency.defend) {
    const city = threatenedCities[0];
    reinforceCity(city.id, state, factionId);
    actions.push(`${faction.name}: ${state.cities[city.id].name} 방어 강화`);
  }

  // ── 3. 기회 공격 ──
  else if (Math.random() < 0.3 * tendency.attack * tendency.risk) {
    const target = findWeakNeighbor(factionId, state, connections);
    if (target) {
      const targetCity = state.cities[target.to];
      const isPlayerCity = targetCity && targetCity.owner === state.player.factionId;
      if (isPlayerCity && state.turn <= 4) {
        actions.push(`${faction.name}: 정세를 관망 중`);
      } else {
        const result = executeAttack(factionId, target.from, target.to, state, connections);
        if (result) actions.push(result);
      }
    }
  }

  // ── 4. 내정: 4트랙 투자 ──
  else if (Math.random() < 0.5 * tendency.economy) {
    const investment = aiInvest(factionId, state, tendency);
    if (investment) actions.push(investment);
  }

  // ── 5. 인재 탐색/등용 ──
  else if (Math.random() < 0.25 * tendency.recruit) {
    const recruit = aiRecruit(factionId, state);
    if (recruit) actions.push(recruit);
  }

  // ── 6. 포로 처리 ──
  else if (Math.random() < 0.3) {
    const captiveAction = aiHandleCaptives(factionId, state, tendency);
    if (captiveAction) actions.push(captiveAction);
  }

  // ── 7. 병력 모집 ──
  else if (faction.gold > 3000) {
    const capital = myCities.sort((a, b) => b.population - a.population)[0];
    if (capital) {
      const recruits = Math.min(2000, Math.floor(faction.gold / 5));
      faction.gold -= recruits * 5;
      state.cities[capital.id].army += recruits;
      actions.push(`${faction.name}: ${state.cities[capital.id].name}에서 ${recruits}명 모집`);
    }
  }

  // ── 8. 건설 (자금 여유 + 건물 슬롯 여유) ──
  if (faction.gold > 5000 && Math.random() < 0.3) {
    const buildAction = aiBuild(factionId, state);
    if (buildAction) actions.push(buildAction);
  }

  // ── 9. 기술 연구 ──
  if (!faction.research?.current && faction.gold > 3000 && Math.random() < 0.25) {
    const researchAction = aiResearch(factionId, state);
    if (researchAction) actions.push(researchAction);
  }

  // ── 10. 병력 재배치 ──
  if (myCities.length > 1 && Math.random() < 0.2) {
    const moveAction = aiTroopMovement(factionId, state, connections);
    if (moveAction) actions.push(moveAction);
  }

  for (const action of actions) {
    state.log(`[AI] ${action}`, 'ai');
  }
}

// ─── AI 내정 투자 ───

function aiInvest(factionId, state, tendency) {
  const cities = state.getCitiesOfFaction(factionId);
  const faction = state.getFaction(factionId);
  if (faction.gold < 500) return null;

  // 가장 약한 트랙을 가진 도시 찾기
  let bestCity = null;
  let bestTrack = null;
  let lowestVal = Infinity;

  for (const city of cities) {
    const tracks = ['agriculture', 'commerce', 'technology', 'publicOrder'];
    for (const track of tracks) {
      const val = state.cities[city.id][track] || 0;
      if (val < lowestVal && val < 80) {
        lowestVal = val;
        bestCity = city;
        bestTrack = track;
      }
    }
  }

  if (!bestCity || !bestTrack) return null;

  // 성향에 따라 우선 투자 트랙 보정
  if (tendency.economy > 1.1 && state.cities[bestCity.id].commerce < 75) {
    bestTrack = 'commerce';
  }
  if (tendency.defend > 1.3 && state.cities[bestCity.id].publicOrder < 60) {
    bestTrack = 'publicOrder';
  }

  const governor = state.cities[bestCity.id].governor;
  const result = investTrack(bestCity.id, bestTrack, state, governor);

  if (result.success) {
    const trackNames = {
      agriculture: '농업', commerce: '상업',
      technology: '기술', publicOrder: '치안'
    };
    return `${faction.name}: ${state.cities[bestCity.id].name} ${trackNames[bestTrack]} 투자 (+${result.gain})`;
  }
  return null;
}

// ─── AI 인재 등용 ───

function aiRecruit(factionId, state) {
  const faction = state.getFaction(factionId);
  const cities = state.getCitiesOfFaction(factionId);

  for (const city of cities) {
    const wanderers = state.getWanderingInCity(city.id);
    if (wanderers.length === 0) continue;

    // 매력 높은 장수로 등용 시도
    const myChars = state.getCharactersInCity(city.id);
    const recruiter = myChars.sort((a, b) => b.stats.charisma - a.stats.charisma)[0];
    if (!recruiter) continue;

    const target = wanderers[0];
    const chance = 0.4 + recruiter.stats.charisma * 0.005;

    if (Math.random() < chance) {
      state.recruitWandering(target.id, factionId, city.id);
      return `${faction.name}: ${getCharName(target.id)} 등용 성공 (${state.cities[city.id].name})`;
    }
  }
  return null;
}

// ─── AI 포로 처리 ───

function aiHandleCaptives(factionId, state, tendency) {
  const captives = state.getCaptivesOfFaction(factionId);
  if (captives.length === 0) return null;

  const faction = state.getFaction(factionId);
  const captive = captives[0]; // 첫 번째 포로

  // 인재 등용 성향 높으면 설득 시도
  if (tendency.recruit > 1.0) {
    const chance = 0.2 + (captive.turnsInCaptivity || 0) * 0.03;
    if (Math.random() < chance && captive.loyalty < 60) {
      state.recruitCaptive(captive.id, factionId);
      return `${faction.name}: 포로 ${getCharName(captive.id)}를 등용`;
    }
  }

  // 오래 감금된 포로는 석방
  if ((captive.turnsInCaptivity || 0) > 8) {
    state.releaseCaptive(captive.id);
    return `${faction.name}: 포로 ${getCharName(captive.id)}를 석방`;
  }

  return null;
}

// ─── AI 건설 ───

function aiBuild(factionId, state) {
  const cities = state.getCitiesOfFaction(factionId);
  const faction = state.getFaction(factionId);

  // 우선순위: 병영 > 시장 > 성벽 > 곡창
  const priority = ['barracks', 'market', 'walls', 'granary'];

  for (const city of cities) {
    for (const buildingId of priority) {
      const check = canBuild(state, city.id, buildingId);
      if (check.canBuild && faction.gold >= check.cost * 2) { // 여유 있을 때만
        const result = startConstruction(state, city.id, buildingId);
        if (result.success) {
          return `${faction.name}: ${state.cities[city.id].name}에 ${BUILDINGS[buildingId].name} 건설 시작`;
        }
      }
    }
  }
  return null;
}

// ─── AI 연구 ───

function aiResearch(factionId, state) {
  const faction = state.getFaction(factionId);
  const available = getAvailableTechs(state, factionId);

  // 가용한 것 중 비용 가장 낮은 것 선택
  const affordable = available.filter(t => t.available).sort((a, b) => a.cost - b.cost);
  if (affordable.length === 0) return null;

  const tech = affordable[0];
  const result = startResearch(state, factionId, tech.id);
  if (result.success) {
    return `${faction.name}: ${tech.name} 연구 시작 (${result.turns}턴)`;
  }
  return null;
}

// ─── AI 병력 재배치 ───

function aiTroopMovement(factionId, state, connections) {
  const cities = state.getCitiesOfFaction(factionId);
  if (cities.length < 2) return null;

  const faction = state.getFaction(factionId);

  // 병력 과잉 도시 → 병력 부족 도시로 이동
  const sorted = cities.sort((a, b) => b.army - a.army);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];

  if (strongest.army > weakest.army * 3 && strongest.army > 10000) {
    const transfer = Math.floor(strongest.army * 0.2);
    const result = moveArmy(state, strongest.id, weakest.id, transfer, [], connections);
    if (result.success) {
      return `${faction.name}: ${state.cities[strongest.id].name} → ${state.cities[weakest.id].name} 병력 ${transfer}명 이동`;
    }
  }
  return null;
}

// ─── 기존 함수들 (업데이트) ───

function findThreatenedCities(factionId, state, connections) {
  const myCities = state.getCitiesOfFaction(factionId);
  const threatened = [];

  for (const city of myCities) {
    const neighbors = getNeighbors(city.id, connections);
    for (const nId of neighbors) {
      const neighbor = state.cities[nId];
      if (neighbor && neighbor.owner && neighbor.owner !== factionId) {
        if (state.isAtWar(factionId, neighbor.owner) && neighbor.army > city.army * 0.6) {
          threatened.push(city);
          break;
        }
      }
    }
  }
  return threatened;
}

function findWeakNeighbor(factionId, state, connections) {
  const myCities = state.getCitiesOfFaction(factionId);

  for (const city of myCities) {
    if (city.army < 5000) continue;
    const neighbors = getNeighbors(city.id, connections);
    for (const nId of neighbors) {
      const neighbor = state.cities[nId];
      if (!neighbor || neighbor.owner === factionId || !neighbor.owner) continue;
      if (city.army > neighbor.army * 1.5 && state.isAtWar(factionId, neighbor.owner)) {
        return { from: city.id, to: nId };
      }
    }
  }
  return null;
}

function reinforceCity(cityId, state, factionId) {
  const myCities = state.getCitiesOfFaction(factionId);
  const target = state.cities[cityId];

  for (const c of myCities) {
    if (c.id === cityId) continue;
    const source = state.cities[c.id];
    if (source.army > 8000) {
      const transfer = Math.floor(source.army * 0.3);
      source.army -= transfer;
      target.army += transfer;
      break;
    }
  }
}

function executeAttack(factionId, fromCityId, toCityId, state, connections) {
  const from = state.cities[fromCityId];
  const to = state.cities[toCityId];
  if (!from || !to) return null;

  const attackArmy = Math.floor(from.army * 0.6);
  from.army -= attackArmy;

  const attackerGenerals = state.getCharactersInCity(fromCityId)
    .filter(c => c.faction === factionId)
    .sort((a, b) => b.stats.command - a.stats.command);
  const defenderGenerals = state.getCharactersInCity(toCityId)
    .filter(c => c.faction === to.owner)
    .sort((a, b) => b.stats.command - a.stats.command);

  // 지형 조회
  const terrain = state.getConnectionTerrain(fromCityId, toCityId);

  // AI 진형 선택
  const armyRatio = attackArmy / Math.max(1, to.army);
  const atkFormation = chooseFormation(attackerGenerals, terrain, true, armyRatio);
  const defFormation = chooseFormation(defenderGenerals, terrain, false, 1 / armyRatio);

  // 강화 전투
  const result = resolveEnhancedCombat(
    {
      army: attackArmy, morale: from.morale,
      generals: attackerGenerals, formation: atkFormation
    },
    {
      army: to.army, morale: to.morale, defense: to.defense,
      generals: defenderGenerals, formation: defFormation
    },
    { terrain },
    state
  );

  to.army = result.defenderRemaining;
  const survivors = result.attackerRemaining;
  const faction = state.factions[factionId];

  if (result.winner === 'attacker') {
    const oldOwner = to.owner;

    // 포로 포획 시도
    const defCharIds = defenderGenerals.map(g => g.id);
    const captured = attemptCapture(defCharIds, factionId, state);
    for (const cId of captured) {
      state.log(`[포로] ${getCharName(cId)} 포획!`, 'captive');
    }

    to.owner = factionId;
    to.army = survivors;
    to.morale = Math.max(20, result.attackerMorale);

    let msg = `${faction.name}이(가) ${to.name}을(를) ${state.factions[oldOwner]?.name || '무주'}로부터 점령!`;
    if (result.stratagemUsed?.success) msg += ` (${result.stratagemUsed.name} 성공)`;
    if (captured.length > 0) msg += ` (포로 ${captured.length}명)`;
    return msg;
  } else {
    from.army += survivors;
    to.morale = Math.min(100, result.defenderMorale);
    let msg = `${faction.name}의 ${to.name} 공격 실패`;
    if (result.stratagemUsed?.success) msg += ` (${result.stratagemUsed.name} 성공했으나)`;
    return msg;
  }
}

function findPotentialAlly(factionId, state) {
  const myEnemies = state.factions[factionId].enemies;
  if (myEnemies.length === 0) return null;

  for (const [otherId, other] of Object.entries(state.factions)) {
    if (otherId === factionId || !other.active) continue;
    if (state.isAllied(factionId, otherId)) continue;
    const commonEnemy = myEnemies.some(e => other.enemies.includes(e));
    if (commonEnemy) return otherId;
  }
  return null;
}

function getNeighbors(cityId, connections) {
  const neighbors = [];
  for (const [a, b] of connections) {
    if (a === cityId) neighbors.push(b);
    else if (b === cityId) neighbors.push(a);
  }
  return neighbors;
}
