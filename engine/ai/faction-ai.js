// Faction AI — 규칙 기반 세력 의사결정 (4시스템 통합)

import { getTendency } from './tendency-tables.js';
import { resolveEnhancedCombat, chooseFormation } from '../core/enhanced-combat.js';
import { attemptCapture } from '../core/character-manager.js';
import { investTrack } from '../core/domestic.js';
import { aiDiplomacy, declareWar as declareWarAction } from '../core/diplomacy.js';
import { getCharName } from '../data/names.js';
import { canBuild, startConstruction, BUILDINGS } from '../core/buildings.js';
import { getAvailableTechs, startResearch } from '../core/tech-tree.js';
import { executeEspionage, ESPIONAGE_ACTIONS } from '../core/espionage.js';
import { moveArmy } from '../core/troop-movement.js';
import { addExperienceFromSource } from '../core/growth.js';

export function decideAndExecute(factionId, state, connections) {
  const faction = state.getFaction(factionId);
  if (!faction || !faction.active) return;

  const tendency = getTendency(faction.leader);
  const myCities = state.getCitiesOfFaction(factionId);
  const aiState = state.ensureAIState(factionId);
  if (myCities.length === 0) {
    faction.active = false;
    return;
  }

  const actions = [];

  syncWarState(factionId, state, connections);

  // ── 1. 전쟁 계획/집결/침공 ──
  const warAction = executeWarPlan(factionId, state, connections, tendency, aiState);
  if (warAction) actions.push(warAction);

  // ── 2. 외교 (전쟁 준비 중이 아닐 때만 독립 실행) ──
  if (!warAction && aiState.posture === 'build') {
    const dipActions = aiDiplomacy(factionId, state, tendency);
    for (const a of dipActions) actions.push(a.message);
  }

  // ── 3. 위기 대응: 위협받는 도시 방어 ──
  const threatenedCities = findThreatenedCities(factionId, state, connections);
  if (!warAction && threatenedCities.length > 0 && Math.random() < 0.7 * tendency.defend) {
    const city = threatenedCities[0];
    reinforceCity(city.id, state, factionId);
    actions.push(`${faction.name}: ${state.cities[city.id].name} 방어 강화`);
  }

  // ── 4. 연구/건설/내정 ──
  else if (!faction.research?.current && faction.gold > 2500 && (state.turn <= 6 || Math.random() < 0.45 * tendency.economy)) {
    const researchAction = aiResearch(factionId, state);
    if (researchAction) actions.push(researchAction);
  }

  else if (faction.gold > 3500 && (state.turn <= 8 || Math.random() < 0.35 * tendency.economy)) {
    const buildAction = aiBuild(factionId, state);
    if (buildAction) actions.push(buildAction);
  }

  else if (Math.random() < 0.6 * tendency.economy) {
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

  // ── 8. 병력 재배치 ──
  if (!warAction && myCities.length > 1 && Math.random() < 0.25) {
    const moveAction = aiTroopMovement(factionId, state, connections);
    if (moveAction) actions.push(moveAction);
  }

  for (const action of actions) {
    state.log(`[AI] ${action}`, 'ai');
  }
}

function syncWarState(factionId, state, connections) {
  const aiState = state.ensureAIState(factionId);

  if (aiState.targetFactionId && !state.getFaction(aiState.targetFactionId)?.active) {
    resetWarState(aiState);
    return;
  }

  if (aiState.targetCityId && state.cities[aiState.targetCityId]?.owner === factionId) {
    resetWarState(aiState);
  }

  if (aiState.posture === 'war') {
    aiState.turnsSinceWar = (aiState.turnsSinceWar || 0) + 1;
  } else {
    aiState.turnsSinceWar = 0;
  }
}

function executeWarPlan(factionId, state, connections, tendency, aiState) {
  const faction = state.getFaction(factionId);
  const targetPlan = planWarTarget(factionId, state, connections);

  if (targetPlan && targetPlan.score > aiState.pressureScore) {
    aiState.targetFactionId = targetPlan.targetFactionId;
    aiState.targetCityId = targetPlan.targetCityId;
    aiState.stagingCityId = targetPlan.stagingCityId;
    aiState.pressureScore = targetPlan.score;
    if (aiState.posture === 'build') {
      aiState.posture = targetPlan.score >= 1.35 ? 'prepare_war' : 'build';
    }
  }

  if (!aiState.targetFactionId || !aiState.targetCityId || !aiState.stagingCityId) {
    aiState.posture = 'build';
    aiState.pressureScore = 0;
    return null;
  }

  const targetCity = state.cities[aiState.targetCityId];
  const stagingCity = state.cities[aiState.stagingCityId];
  if (!targetCity || !stagingCity) {
    resetWarState(aiState);
    return null;
  }

  if (targetCity.owner === factionId) {
    resetWarState(aiState);
    return `${faction.name}: 전선 재정비`;
  }

  const targetFactionId = aiState.targetFactionId;
  const playerProtected = targetFactionId === state.player.factionId && state.turn <= 4;
  const stagingRatio = stagingCity.army / Math.max(1, targetCity.army);

  if (aiState.posture === 'build' && targetPlan?.score >= 1.35 && !playerProtected) {
    aiState.posture = 'prepare_war';
  }

  if (aiState.posture === 'prepare_war') {
    if (!state.isAtWar(factionId, targetFactionId) && !playerProtected) {
      declareWarAction(factionId, targetFactionId, state);
      aiState.posture = 'war';
      return `${faction.name}: ${state.factions[targetFactionId].name} 정벌을 선언`;
    }

    const moved = gatherForWar(factionId, aiState.stagingCityId, state, connections);
    if (moved) return `${faction.name}: ${moved}`;

    if (stagingRatio >= 1.15 || stagingCity.army >= 12000) {
      aiState.posture = 'war';
    }
    return `${faction.name}: ${stagingCity.name}에 병력 집결`;
  }

  if (aiState.posture === 'war') {
    if (!state.isAtWar(factionId, targetFactionId)) {
      aiState.posture = 'recover';
      return `${faction.name}: 전쟁 계획 보류`;
    }

    if (stagingRatio < 0.9 && aiState.turnsSinceWar < 2) {
      const moved = gatherForWar(factionId, aiState.stagingCityId, state, connections);
      if (moved) return `${faction.name}: ${moved}`;
    }

    if (stagingCity.army >= 6000 && stagingRatio >= 1.05) {
      const result = executeAttack(factionId, aiState.stagingCityId, aiState.targetCityId, state, connections);
      if (result) {
        if (state.cities[aiState.targetCityId]?.owner === factionId) resetWarState(aiState);
        return result;
      }
    }

    const moved = gatherForWar(factionId, aiState.stagingCityId, state, connections);
    if (moved) return `${faction.name}: ${moved}`;

    if (stagingRatio < 0.7) {
      aiState.posture = 'recover';
      return `${faction.name}: 전선 재정비`;
    }
  }

  if (aiState.posture === 'recover') {
    if (state.getTotalArmy(factionId) > state.getTotalArmy(targetFactionId) * 0.85) {
      aiState.posture = 'build';
      aiState.pressureScore *= 0.7;
    }
    return `${faction.name}: 병력 재편 중`;
  }

  return null;
}

export function planWarTarget(factionId, state, connections) {
  const myCities = state.getCitiesOfFaction(factionId);
  const faction = state.getFaction(factionId);
  const tendency = getTendency(faction.leader);
  const hegemon = getHegemonState(state);
  let best = null;

  for (const city of myCities) {
    const neighbors = getNeighbors(city.id, connections);
    for (const nId of neighbors) {
      const neighbor = state.cities[nId];
      if (!neighbor || !neighbor.owner || neighbor.owner === factionId) continue;

      const targetFactionId = neighbor.owner;
      const playerProtected = targetFactionId === state.player.factionId && state.turn <= 4;
      if (playerProtected) continue;
      if (state.hasTruce(factionId, targetFactionId)) continue;

      const localRatio = city.army / Math.max(1, neighbor.army);
      const totalRatio = state.getTotalArmy(factionId) / Math.max(1, state.getTotalArmy(targetFactionId));
      let score = (localRatio * 0.8) + (totalRatio * 0.4) + tendency.attack + tendency.risk;

      if (state.isAtWar(factionId, targetFactionId)) score += 0.4;
      if (state.isAllied(factionId, targetFactionId)) score -= 0.8;
      if (neighbor.defense > 70) score -= 0.2;
      score += getOpeningBias(factionId, targetFactionId, state);
      score += getContainmentBias(factionId, targetFactionId, hegemon, state);

      if (!best || score > best.score) {
        best = {
          targetFactionId,
          targetCityId: nId,
          stagingCityId: city.id,
          score,
        };
      }
    }
  }

  return best;
}

function getOpeningBias(factionId, targetFactionId, state) {
  if (state.year !== 208 || state.turn > 12) return 0;
  if (factionId === 'wei') {
    if (targetFactionId === 'shu') return 0.55;
    if (targetFactionId === 'wu') return 0.35;
  }
  if (factionId === 'shu') {
    if (targetFactionId === 'wei') return 0.45;
    if (targetFactionId === 'wu') return -1.8;
  }
  if (factionId === 'wu' && targetFactionId === 'wei') {
    return state.turn <= 6 ? 0.1 : 0.45;
  }
  if (factionId === 'wu' && targetFactionId === 'shu') return -1.9;
  return 0;
}

function getContainmentBias(factionId, targetFactionId, hegemon, state) {
  if (!hegemon || hegemon.id === factionId) return 0;

  const myCities = state.getCitiesOfFaction(factionId).length;
  const myArmy = state.getTotalArmy(factionId);
  const targetCities = state.getCitiesOfFaction(targetFactionId).length;
  const targetArmy = state.getTotalArmy(targetFactionId);
  const hegemonThreat = hegemon.cities >= Math.max(7, myCities + 3) || hegemon.army >= Math.max(1, myArmy * 1.45);

  if (!hegemonThreat) return 0;
  if (targetFactionId === hegemon.id) return 1.1;
  if (targetCities < hegemon.cities && targetArmy < hegemon.army) return -0.8;
  return 0;
}

function getHegemonState(state) {
  const ranked = Object.entries(state.factions)
    .filter(([id, faction]) => faction.active && state.getCitiesOfFaction(id).length > 0)
    .map(([id, faction]) => ({
      id,
      faction,
      cities: state.getCitiesOfFaction(id).length,
      army: state.getTotalArmy(id),
    }))
    .sort((a, b) => b.cities - a.cities || b.army - a.army);

  return ranked[0] || null;
}

function gatherForWar(factionId, stagingCityId, state, connections) {
  const myCities = state.getCitiesOfFaction(factionId)
    .filter(c => c.id !== stagingCityId)
    .sort((a, b) => b.army - a.army);

  for (const city of myCities) {
    if (city.army < 5000) continue;
    const transfer = Math.floor(city.army * 0.3);
    if (transfer < 1500) continue;
    const result = moveArmy(state, city.id, stagingCityId, transfer, [], connections);
    if (result.success) {
      return `${state.cities[city.id].name} → ${state.cities[stagingCityId].name} 병력 ${transfer}명 집결`;
    }
  }
  return null;
}

function resetWarState(aiState) {
  aiState.posture = 'build';
  aiState.targetFactionId = null;
  aiState.targetCityId = null;
  aiState.stagingCityId = null;
  aiState.turnsSinceWar = 0;
  aiState.pressureScore = 0;
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
  const defenderFactionId = to.owner;

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
      generals: attackerGenerals, formation: atkFormation, factionId
    },
    {
      army: to.army, morale: to.morale, defense: to.defense,
      generals: defenderGenerals, formation: defFormation, factionId: defenderFactionId
    },
    { terrain },
    state
  );

  to.army = result.defenderRemaining;
  const survivors = result.attackerRemaining;
  const faction = state.factions[factionId];

  for (const general of attackerGenerals) {
    addExperienceFromSource(state, general.id, 'battle_participation');
  }
  for (const general of defenderGenerals) {
    addExperienceFromSource(state, general.id, 'battle_participation');
  }

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
    state.recordSummary('citiesCaptured', {
      cityId: toCityId,
      cityName: to.name,
      fromFaction: oldOwner,
      toFaction: factionId,
    });
    for (const general of attackerGenerals) {
      addExperienceFromSource(state, general.id, 'battle_victory');
    }

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
