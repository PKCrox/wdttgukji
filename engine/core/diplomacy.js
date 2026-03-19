// Diplomacy — 평판 기반 외교 시스템
//
// 평판 (reputation): 0~200, 100=중립
//   - 높을수록 외교 제안 수락률 상승, 동맹 안정
//   - 낮을수록 고립, AI가 적대시
//
// 외교 행동:
//   - 강화 (peace): 전쟁 종료 + 6턴 휴전
//   - 동맹 (alliance): 불가침 + 공동 방어
//   - 선전포고 (war): 전쟁 개시 (휴전 중이면 평판 대폭 하락)
//   - 조공 (tribute): 금을 보내고 호감 + 평판 구매
//   - 위협 (threaten): 강한 세력이 약한 세력에 압박
//   - 혼인동맹 (marriage): 특수 동맹, 높은 안정성

import { getTechEffects } from './tech-tree.js';
import { addExperienceFromSource } from './growth.js';

// ─── 상수 ───

const PEACE_BASE_CHANCE = 0.3;
const ALLIANCE_BASE_CHANCE = 0.25;
const MARRIAGE_BASE_CHANCE = 0.15;
const THREATEN_BASE_CHANCE = 0.2;

const REP_SCALE = 0.003;         // 평판 차이 1당 확률 ±0.3%
const WAR_WEARINESS_BONUS = 0.02; // 전쟁 턴당 강화 확률 +2%
const COMMON_ENEMY_BONUS = 0.2;   // 공통 적 있을 때 동맹 확률 +20%

const TRUCE_DURATION = 6;         // 기본 휴전 기간 (턴)
const MARRIAGE_TRUCE = 18;        // 혼인동맹 휴전 기간

const REP_GAIN_PEACE = 5;
const REP_GAIN_ALLIANCE = 8;
const REP_GAIN_TRIBUTE = 3;
const REP_GAIN_MARRIAGE = 10;
const REP_LOSS_WAR = -10;
const REP_LOSS_TRUCE_BREAK = -25;
const REP_LOSS_ALLIANCE_BREAK = -30;
const REP_LOSS_THREATEN = -5;

// ─── 확률 계산 ───

/**
 * 외교 성공 확률 계산
 * @param {string} fromFaction
 * @param {string} toFaction
 * @param {'peace'|'alliance'|'marriage'|'threaten'} actionType
 * @param {object} state
 * @returns {{ chance: number, factors: object }}
 */
export function calculateDiplomacyChance(fromFaction, toFaction, actionType, state) {
  const from = state.getFaction(fromFaction);
  const to = state.getFaction(toFaction);
  if (!from || !to) return { chance: 0, factors: {} };

  const factors = {};
  const fromTech = getTechEffects(state, fromFaction);

  // 기본 확률
  let chance;
  switch (actionType) {
    case 'peace': chance = PEACE_BASE_CHANCE; break;
    case 'alliance': chance = ALLIANCE_BASE_CHANCE; break;
    case 'marriage': chance = MARRIAGE_BASE_CHANCE; break;
    case 'threaten': chance = THREATEN_BASE_CHANCE; break;
    default: chance = 0.3;
  }
  factors.base = chance;

  // 평판 차이 보정 (from의 평판이 높으면 유리)
  const repDiff = (from.reputation || 100) - 100;
  const repBonus = repDiff * REP_SCALE;
  chance += repBonus;
  factors.reputation = repBonus;

  if (fromTech.diplomacyBonus) {
    chance += fromTech.diplomacyBonus;
    factors.tech = fromTech.diplomacyBonus;
  }

  const tactician = state.getTactician ? state.getTactician(fromFaction) : null;
  if (tactician) {
    const tacticianBonus = Math.min(0.08, Math.max(0, (tactician.stats.intellect - 70) * 0.0015));
    chance += tacticianBonus;
    factors.tactician = tacticianBonus;
  }

  // 관계 보정 (리더 간)
  const leaderRel = state.getRelationship(from.leader, to.leader);
  if (leaderRel) {
    let relMod = 0;
    if (leaderRel.type === 'friendship' || leaderRel.type === 'respect') relMod = 0.15;
    else if (leaderRel.type === 'rivalry') relMod = -0.1;
    else if (leaderRel.type === 'enmity') relMod = -0.25;
    else if (leaderRel.type === 'sworn_brothers') relMod = 0.3;
    chance += relMod;
    factors.relationship = relMod;
  }

  // 전쟁 피로 (강화 시)
  if (actionType === 'peace' && state.isAtWar(fromFaction, toFaction)) {
    // 전쟁 기간 추정 (간단히 현재 턴 기반)
    const weariness = 0.1; // 전쟁 중이면 기본 보너스
    chance += weariness;
    factors.warWeariness = weariness;
  }

  // 공통 적 (동맹 시)
  if (actionType === 'alliance' || actionType === 'marriage') {
    const commonEnemies = from.enemies.filter(e => to.enemies.includes(e));
    if (commonEnemies.length > 0) {
      chance += COMMON_ENEMY_BONUS;
      factors.commonEnemy = COMMON_ENEMY_BONUS;
    }
  }

  // 세력 격차 (위협 시)
  if (actionType === 'threaten') {
    const fromArmy = state.getTotalArmy(fromFaction);
    const toArmy = state.getTotalArmy(toFaction);
    const ratio = fromArmy / Math.max(1, toArmy);
    const powerBonus = Math.max(0, (ratio - 1) * 0.15); // 2배 병력이면 +15%
    chance += powerBonus;
    factors.powerRatio = powerBonus;

    // 상대 평판이 높으면 위협에 덜 굴복
    const targetRep = ((to.reputation || 100) - 100) * -0.002;
    chance += targetRep;
    factors.targetReputation = targetRep;
  }

  chance = Math.max(0.05, Math.min(0.95, chance));
  return { chance, factors };
}

// ─── 외교 행동 실행 ───

/**
 * 강화 제안
 */
export function proposePeace(fromFaction, toFaction, state) {
  if (!state.isAtWar(fromFaction, toFaction)) {
    return { success: false, reason: 'not_at_war' };
  }

  const { chance, factors } = calculateDiplomacyChance(fromFaction, toFaction, 'peace', state);

  if (Math.random() < chance) {
    state.makePeace(fromFaction, toFaction, TRUCE_DURATION);
    const techEffects = getTechEffects(state, fromFaction);
    const repGain = REP_GAIN_PEACE + Math.round((techEffects.reputationGain || 0) * 10);
    state._adjustReputation(fromFaction, repGain);
    state._adjustReputation(toFaction, REP_GAIN_PEACE);
    addExperienceFromSource(state, state.getFaction(fromFaction)?.leader, 'diplomatic_success');
    state.recordSummary('majorEvents', {
      type: 'peace',
      fromFaction,
      toFaction,
    });
    return { success: true, chance, factors };
  }

  return { success: false, reason: 'rejected', chance, factors };
}

/**
 * 동맹 제안
 */
export function proposeAlliance(fromFaction, toFaction, state) {
  if (state.isAtWar(fromFaction, toFaction)) {
    return { success: false, reason: 'at_war' };
  }
  if (state.isAllied(fromFaction, toFaction)) {
    return { success: false, reason: 'already_allied' };
  }

  const { chance, factors } = calculateDiplomacyChance(fromFaction, toFaction, 'alliance', state);

  if (Math.random() < chance) {
    state.makeAlliance(fromFaction, toFaction);
    const techEffects = getTechEffects(state, fromFaction);
    const repGain = REP_GAIN_ALLIANCE + Math.round((techEffects.reputationGain || 0) * 10);
    state._adjustReputation(fromFaction, repGain);
    addExperienceFromSource(state, state.getFaction(fromFaction)?.leader, 'diplomatic_success');
    state.recordSummary('majorEvents', {
      type: 'alliance',
      fromFaction,
      toFaction,
    });
    return { success: true, chance, factors };
  }

  return { success: false, reason: 'rejected', chance, factors };
}

/**
 * 선전포고
 */
export function declareWar(fromFaction, toFaction, state) {
  if (state.isAtWar(fromFaction, toFaction)) {
    return { success: false, reason: 'already_at_war' };
  }

  // 동맹 파기 체크
  if (state.isAllied(fromFaction, toFaction)) {
    state.breakAlliance(fromFaction, toFaction);
  }

  // 휴전 파기 체크
  const trucePenalty = state.hasTruce(fromFaction, toFaction);
  if (trucePenalty) {
    state._adjustReputation(fromFaction, REP_LOSS_TRUCE_BREAK);
    state.log(`${state.factions[fromFaction].name}: 휴전 파기! 평판 대폭 하락`, 'diplomacy');
  }

  state.declareWar(fromFaction, toFaction);
  state._adjustReputation(fromFaction, REP_LOSS_WAR);

  return { success: true, truceBroken: !!trucePenalty };
}

/**
 * 조공 (금을 보내서 호감 구매)
 */
export function sendTribute(fromFaction, toFaction, amount, state) {
  const from = state.getFaction(fromFaction);
  const to = state.getFaction(toFaction);
  if (!from || !to) return { success: false, reason: 'invalid_faction' };
  if (from.gold < amount) return { success: false, reason: 'insufficient_gold' };

  from.gold -= amount;
  to.gold += amount;

  // 평판 상승 (양측 모두)
  const repGain = Math.min(REP_GAIN_TRIBUTE * 3, Math.floor(amount / 1000) * REP_GAIN_TRIBUTE);
  state._adjustReputation(fromFaction, repGain);

  // 관계 개선 (리더 간 관계 intensity 증가)
  const rel = state.getRelationship(from.leader, to.leader);
  if (rel) {
    rel.intensity = Math.min(100, rel.intensity + Math.floor(amount / 500));
  }

  return { success: true, repGain, amount };
}

/**
 * 혼인동맹 제안
 */
export function proposeMarriage(fromFaction, toFaction, state) {
  if (state.isAtWar(fromFaction, toFaction)) {
    return { success: false, reason: 'at_war' };
  }

  const { chance, factors } = calculateDiplomacyChance(fromFaction, toFaction, 'marriage', state);

  if (Math.random() < chance) {
    state.makeAlliance(fromFaction, toFaction);
    // 혼인동맹은 더 긴 휴전
    const from = state.factions[fromFaction];
    const to = state.factions[toFaction];
    if (from.truces) from.truces[toFaction] = state.turn + MARRIAGE_TRUCE;
    if (to.truces) to.truces[fromFaction] = state.turn + MARRIAGE_TRUCE;
    const techEffects = getTechEffects(state, fromFaction);
    const repGain = REP_GAIN_MARRIAGE + Math.round((techEffects.reputationGain || 0) * 10);
    state._adjustReputation(fromFaction, repGain);
    state._adjustReputation(toFaction, REP_GAIN_MARRIAGE);
    addExperienceFromSource(state, state.getFaction(fromFaction)?.leader, 'diplomatic_success');
    state.recordSummary('majorEvents', {
      type: 'marriage',
      fromFaction,
      toFaction,
    });
    return { success: true, chance, factors };
  }

  return { success: false, reason: 'rejected', chance, factors };
}

/**
 * 위협 (항복/조공 요구)
 */
export function threaten(fromFaction, toFaction, state) {
  const { chance, factors } = calculateDiplomacyChance(fromFaction, toFaction, 'threaten', state);

  state._adjustReputation(fromFaction, REP_LOSS_THREATEN);

  if (Math.random() < chance) {
    // 위협 성공: 조공 수취
    const to = state.getFaction(toFaction);
    const tribute = Math.floor((to.gold || 0) * 0.2);
    if (tribute > 0) {
      to.gold -= tribute;
      state.getFaction(fromFaction).gold += tribute;
    }
    addExperienceFromSource(state, state.getFaction(fromFaction)?.leader, 'diplomatic_success');
    return { success: true, tribute, chance, factors };
  }

  // 위협 실패: 적대감 상승
  const toFac = state.getFaction(toFaction);
  if (toFac && !toFac.enemies.includes(fromFaction)) {
    // 적대감만 올라감 (전쟁 미선언)
  }
  return { success: false, reason: 'defied', chance, factors };
}

// ─── AI 외교 판단 ───

/**
 * AI 세력의 외교 행동 결정
 * @returns {Array<{action, target, result}>}
 */
export function aiDiplomacy(factionId, state, tendency) {
  const faction = state.getFaction(factionId);
  if (!faction || !faction.active) return [];

  const actions = [];
  const dipWeight = tendency.diplomacy || 1.0;
  const hegemon = getHegemonState(state);

  // 1. 전쟁 중인 상대에게 강화 고려 (병력 열세 시)
  for (const enemyId of [...faction.enemies]) {
    const myArmy = state.getTotalArmy(factionId);
    const enemyArmy = state.getTotalArmy(enemyId);

    // 병력 열세이거나 도시가 적으면 강화 시도
    if (myArmy < enemyArmy * 0.6 && Math.random() < 0.4 * dipWeight) {
      const result = proposePeace(factionId, enemyId, state);
      if (result.success) {
        actions.push({
          action: 'peace', target: enemyId,
          message: `${faction.name}이(가) ${state.factions[enemyId].name}와 강화`
        });
      }
      break; // 턴당 1회 외교 행동
    }
  }

  // 2. 패권 견제 동맹
  if (actions.length === 0 && hegemon && hegemon.id !== factionId && Math.random() < 0.45 * dipWeight) {
    for (const [otherId, other] of Object.entries(state.factions)) {
      if (otherId === factionId || otherId === hegemon.id || !other.active) continue;
      if (state.isAllied(factionId, otherId) || state.isAtWar(factionId, otherId)) continue;

      const myCities = state.getCitiesOfFaction(factionId).length;
      const hegemonThreat = hegemon.cities >= Math.max(7, myCities + 3)
        || hegemon.army >= Math.max(1, state.getTotalArmy(factionId) * 1.4);
      if (!hegemonThreat) continue;

      const result = proposeAlliance(factionId, otherId, state);
      if (result.success) {
        actions.push({
          action: 'alliance', target: otherId,
          message: `${faction.name}이(가) ${other.name}와 반패권 동맹 체결`
        });
      }
      break;
    }
  }

  // 3. 공통 적이 있는 세력에 동맹 제안
  if (actions.length === 0 && Math.random() < 0.3 * dipWeight) {
    for (const [otherId, other] of Object.entries(state.factions)) {
      if (otherId === factionId || !other.active) continue;
      if (state.isAllied(factionId, otherId) || state.isAtWar(factionId, otherId)) continue;

      const commonEnemy = faction.enemies.some(e => other.enemies.includes(e));
      if (commonEnemy) {
        const result = proposeAlliance(factionId, otherId, state);
        if (result.success) {
          actions.push({
            action: 'alliance', target: otherId,
            message: `${faction.name}이(가) ${other.name}와 동맹 체결`
          });
        }
        break;
      }
    }
  }

  // 4. 약한 이웃에 위협 (공격적 성향)
  if (actions.length === 0 && (tendency.attack || 1) > 1.2 && Math.random() < 0.15) {
    for (const [otherId, other] of Object.entries(state.factions)) {
      if (otherId === factionId || !other.active) continue;
      if (state.isAllied(factionId, otherId) || state.isAtWar(factionId, otherId)) continue;

      const myArmy = state.getTotalArmy(factionId);
      const otherArmy = state.getTotalArmy(otherId);
      if (myArmy > otherArmy * 2.5) {
        const result = threaten(factionId, otherId, state);
        if (result.success) {
          actions.push({
            action: 'threaten', target: otherId,
            message: `${faction.name}이(가) ${other.name}를 위협 (금 ${result.tribute} 획득)`
          });
        }
        break;
      }
    }
  }

  return actions;
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

export {
  TRUCE_DURATION, MARRIAGE_TRUCE,
  REP_GAIN_PEACE, REP_LOSS_WAR, REP_LOSS_TRUCE_BREAK
};
