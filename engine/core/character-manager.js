// CharacterManager — 장수 생애주기: 탐색/등용/포로/배신/이동/임명
//
// 상태 전이:
//   active → captive (전투 패배 후 포로)
//   active → wandering (배신 후 떠남 / 세력 멸망)

import { getCharName } from '../data/names.js';
import { getItemName } from '../data/names.js';
import { equipItem, ITEMS, unequipItem } from './items.js';
//   captive → active (등용 수락)
//   captive → wandering (석방)
//   captive → dead (처형)
//   wandering → active (탐색 후 등용)

// ─── 상수 ───

const SEARCH_BASE_CHANCE = 0.3;       // 인재 탐색 기본 발견 확률
const SEARCH_CHARISMA_SCALE = 0.005;  // 매력 1당 탐색 확률 +0.5%
const RECRUIT_BASE_CHANCE = 0.4;      // 등용 기본 수락 확률
const RECRUIT_CHARISMA_SCALE = 0.005; // 매력 1당 등용 확률 +0.5%

const PERSUADE_BASE_CHANCE = 0.15;    // 포로 설득 기본 확률
const PERSUADE_CHARISMA_SCALE = 0.006; // 매력 1당 설득 확률 +0.6%
const PERSUADE_LOYALTY_PENALTY = 0.005; // 포로의 구 세력 충성도 1당 -0.5%

const DEFECTION_CHECK_THRESHOLD = 30; // 충성도 이 미만이면 배신 체크
const DEFECTION_BASE_CHANCE = 0.05;   // 매 턴 배신 기본 확률
const DEFECTION_LOYALTY_SCALE = 0.003; // 충성도 1 낮을수록 +0.3%

const LOYALTY_DECAY_BASE = 1;         // 매 턴 충성도 자연 변동
const LOYALTY_LEADER_CHARISMA = 0.02; // 리더 매력 1당 충성도 감소 방지

const CAPTURE_CHANCE = 0.35;          // 전투 후 포로 포획 확률 (캐릭터당)
const ESCAPE_BASE_CHANCE = 0.1;       // 포로 탈출 기본 확률 (턴당)
const ESCAPE_PER_TURN = 0.03;         // 감금 턴당 추가 탈출 확률

// ─── 인재 탐색 ───

/**
 * 도시에서 방랑 인재를 탐색
 * @param {string} cityId - 탐색할 도시
 * @param {string} searcherId - 탐색을 수행하는 장수
 * @param {object} state - GameState
 * @returns {{ found: boolean, character: object|null }}
 */
export function searchForTalent(cityId, searcherId, state) {
  const searcher = state.getCharacter(searcherId);
  if (!searcher || searcher.status !== 'active') return { found: false, character: null };

  const wanderers = state.getWanderingInCity(cityId);
  if (wanderers.length === 0) return { found: false, character: null };

  const { chance, factors } = calculateSearchChance(cityId, searcherId, state);
  if (Math.random() >= chance) return { found: false, character: null, chance, factors };

  // 가장 능력치 합이 높은 인재를 우선 발견
  const target = wanderers.sort((a, b) => {
    const totalA = Object.values(a.stats).reduce((s, v) => s + v, 0);
    const totalB = Object.values(b.stats).reduce((s, v) => s + v, 0);
    return totalB - totalA;
  })[0];

  return { found: true, character: target, chance, factors };
}

/**
 * 발견한 인재에게 등용 제안
 * @returns {{ accepted: boolean, reason: string }}
 */
export function offerRecruitment(charId, recruiterId, factionId, state) {
  const target = state.getCharacter(charId);
  const recruiter = state.getCharacter(recruiterId);
  if (!target || target.status !== 'wandering') return { accepted: false, reason: 'invalid_target' };
  if (!recruiter) return { accepted: false, reason: 'invalid_recruiter' };

  const { chance, factors } = calculateRecruitChance(charId, recruiterId, factionId, state);

  if (Math.random() < chance) {
    state.recruitWandering(charId, factionId, state.getCharacter(recruiterId).city);
    return { accepted: true, reason: 'success', chance, factors };
  }

  return { accepted: false, reason: 'refused', chance, factors };
}

export function calculateSearchChance(cityId, searcherId, state) {
  const searcher = state.getCharacter(searcherId);
  const wanderers = state.getWanderingInCity(cityId);
  if (!searcher || searcher.status !== 'active' || wanderers.length === 0) {
    return { chance: 0, factors: { error: 'invalid_searcher_or_targets' } };
  }

  let chance = SEARCH_BASE_CHANCE + searcher.stats.charisma * SEARCH_CHARISMA_SCALE;
  const factors = {
    base: SEARCH_BASE_CHANCE,
    charisma: searcher.stats.charisma * SEARCH_CHARISMA_SCALE,
  };

  const tactician = state.getTactician ? state.getTactician(searcher.faction) : null;
  if (tactician) {
    const tacticianBonus = Math.min(0.08, Math.max(0, (tactician.stats.intellect - 70) * 0.0014));
    chance += tacticianBonus;
    factors.tactician = tacticianBonus;
  }

  chance = Math.max(0.08, Math.min(0.9, chance));
  factors.final = chance;
  return { chance, factors };
}

export function calculateRecruitChance(charId, recruiterId, factionId, state) {
  const target = state.getCharacter(charId);
  const recruiter = state.getCharacter(recruiterId);
  if (!target || target.status !== 'wandering' || !recruiter) {
    return { chance: 0, factors: { error: 'invalid_recruit_target' } };
  }

  let chance = RECRUIT_BASE_CHANCE + recruiter.stats.charisma * RECRUIT_CHARISMA_SCALE;
  const factors = {
    base: RECRUIT_BASE_CHANCE,
    charisma: recruiter.stats.charisma * RECRUIT_CHARISMA_SCALE,
  };

  const tactician = state.getTactician ? state.getTactician(factionId) : null;
  if (tactician) {
    const tacticianBonus = Math.min(0.08, Math.max(0, (tactician.stats.intellect - 70) * 0.0014));
    chance += tacticianBonus;
    factors.tactician = tacticianBonus;
  }

  // 관계 보정
  const rel = state.getRelationship(charId, recruiterId);
  if (rel) {
    if (rel.type === 'friendship' || rel.type === 'respect') {
      chance += 0.2;
      factors.personalRelation = 0.2;
    }
    if (rel.type === 'enmity') {
      chance -= 0.3;
      factors.personalRelation = -0.3;
    }
    if (rel.type === 'sworn_brothers') {
      chance += 0.4;
      factors.personalRelation = 0.4;
    }
  }

  // 리더와의 관계
  const faction = state.getFaction(factionId);
  if (faction) {
    const leaderRel = state.getRelationship(charId, faction.leader);
    if (leaderRel) {
      if (leaderRel.type === 'respect' || leaderRel.type === 'friendship') {
        chance += 0.15;
        factors.leaderRelation = 0.15;
      }
      if (leaderRel.type === 'enmity') {
        chance -= 0.25;
        factors.leaderRelation = -0.25;
      }
    }
  }

  // 세력 평판 보정
  const reputation = state.factions[factionId]?.reputation || 100;
  const reputationBonus = (reputation - 100) * 0.002;
  chance += reputationBonus; // 평판 150이면 +10%
  factors.reputation = reputationBonus;

  chance = Math.max(0.05, Math.min(0.95, chance));
  factors.final = chance;
  return { chance, factors };
}

// ─── 포로 관리 ───

/**
 * 전투 후 포로 포획 시도 (패배한 측 장수 각각에 대해)
 * @param {Array<string>} loserCharIds - 패배 측 장수 ID 목록
 * @param {string} captorFactionId - 승리한 세력
 * @param {object} state
 * @returns {Array<string>} captured character IDs
 */
export function attemptCapture(loserCharIds, captorFactionId, state) {
  const captured = [];

  for (const charId of loserCharIds) {
    const char = state.getCharacter(charId);
    if (!char || !char.alive || char.status !== 'active') continue;

    // 리더는 포획 불가 (도주)
    const charFaction = state.getFaction(char.faction);
    if (charFaction && charFaction.leader === charId) continue;

    if (Math.random() < CAPTURE_CHANCE) {
      state.captureCharacter(charId, captorFactionId);
      captured.push(charId);
    }
  }

  return captured;
}

/**
 * 포로 설득 시도
 * @returns {{ success: boolean, reason: string }}
 */
export function persuadeCaptive(captiveId, persuaderId, newFactionId, state) {
  const captive = state.getCharacter(captiveId);
  const persuader = state.getCharacter(persuaderId);
  if (!captive || captive.status !== 'captive') return { success: false, reason: 'not_captive' };
  if (!persuader) return { success: false, reason: 'no_persuader' };

  let chance = PERSUADE_BASE_CHANCE + persuader.stats.charisma * PERSUADE_CHARISMA_SCALE;

  // 구 세력 충성도가 높으면 설득 어려움
  chance -= captive.loyalty * PERSUADE_LOYALTY_PENALTY;

  // 감금 기간이 길수록 설득 쉬워짐
  chance += (captive.turnsInCaptivity || 0) * 0.02;

  // 관계 보정
  const rel = state.getRelationship(captiveId, persuaderId);
  if (rel) {
    if (rel.type === 'respect' || rel.type === 'friendship') chance += 0.15;
    if (rel.type === 'sworn_brothers') chance -= 0.5; // 의형제는 거의 불가
    if (rel.type === 'enmity') chance -= 0.2;
  }

  // 리더와의 관계 (구 세력)
  const oldFaction = state.getFaction(captive.faction);
  if (oldFaction) {
    const leaderRel = state.getRelationship(captiveId, oldFaction.leader);
    if (leaderRel && leaderRel.type === 'sworn_brothers') {
      return { success: false, reason: 'sworn_loyalty' }; // 절대 배신 안 함
    }
  }

  chance = Math.max(0.02, Math.min(0.9, chance));

  if (Math.random() < chance) {
    state.recruitCaptive(captiveId, newFactionId);
    return { success: true, reason: 'accepted' };
  }

  return { success: false, reason: 'refused' };
}

// ─── 포로 탈출 체크 (매 턴) ───

export function checkCaptiveEscapes(state) {
  const escaped = [];

  for (const [charId, char] of Object.entries(state.characters)) {
    if (char.status !== 'captive') continue;

    // 감금 턴 증가
    char.turnsInCaptivity = (char.turnsInCaptivity || 0) + 1;

    // 탈출 확률 = 기본 + 턴당 증가 + 지력 보정
    const chance = ESCAPE_BASE_CHANCE
      + char.turnsInCaptivity * ESCAPE_PER_TURN
      + char.stats.intellect * 0.001;

    if (Math.random() < Math.min(0.5, chance)) {
      state.releaseCaptive(charId);
      state.log(`포로 ${getCharName(charId)}이(가) 탈출했습니다!`, 'captive');
      escaped.push(charId);
    }
  }

  return escaped;
}

// ─── 배신 체크 (매 턴) ───

/**
 * 충성도 낮은 장수의 배신 체크
 * @returns {Array<{charId, fromFaction, toFaction}>}
 */
export function checkDefections(state) {
  const defections = [];

  for (const [charId, char] of Object.entries(state.characters)) {
    if (char.status !== 'active' || !char.alive || !char.faction) continue;
    if (char.loyalty >= DEFECTION_CHECK_THRESHOLD) continue;

    // 리더는 배신 안 함
    const faction = state.getFaction(char.faction);
    if (faction && faction.leader === charId) continue;

    // 배신 확률
    const chance = DEFECTION_BASE_CHANCE + (DEFECTION_CHECK_THRESHOLD - char.loyalty) * DEFECTION_LOYALTY_SCALE;
    if (Math.random() >= chance) continue;

    // 배신할 세력 선택 (인접 세력 중 평판 높은 곳)
    const city = state.cities[char.city];
    if (!city) continue;

    let bestFaction = null;
    let bestScore = -Infinity;

    for (const [fId, f] of Object.entries(state.factions)) {
      if (fId === char.faction || !f.active) continue;
      const cities = state.getCitiesOfFaction(fId);
      if (cities.length === 0) continue;

      let score = (f.reputation || 100) - 100;
      // 관계 보정
      const leaderRel = state.getRelationship(charId, f.leader);
      if (leaderRel) {
        if (leaderRel.type === 'respect' || leaderRel.type === 'friendship') score += 30;
        if (leaderRel.type === 'enmity') score -= 50;
      }

      if (score > bestScore) {
        bestScore = score;
        bestFaction = fId;
      }
    }

    if (bestFaction) {
      const targetCities = state.getCitiesOfFaction(bestFaction);
      const targetCity = targetCities[0]?.id;
      if (targetCity) {
        state.defectCharacter(charId, bestFaction, targetCity);
        defections.push({ charId, fromFaction: char.faction, toFaction: bestFaction });
      }
    }
  }

  return defections;
}

// ─── 충성도 변동 (매 턴) ───

/**
 * 전체 장수 충성도 자연 변동
 */
export function updateLoyalty(state) {
  for (const [charId, char] of Object.entries(state.characters)) {
    if (char.status !== 'active' || !char.alive || !char.faction) continue;
    if (char.loyalty >= 100) continue; // 이미 만충

    const faction = state.getFaction(char.faction);
    if (!faction) continue;

    // 리더는 항상 100
    if (faction.leader === charId) {
      char.loyalty = 100;
      continue;
    }

    // 리더 매력에 의한 충성도 회복
    const leader = state.getCharacter(faction.leader);
    const leaderCharisma = leader ? leader.stats.charisma : 50;
    const recovery = leaderCharisma * LOYALTY_LEADER_CHARISMA;

    // 관계 보정
    const rel = state.getRelationship(charId, faction.leader);
    let relBonus = 0;
    if (rel) {
      if (rel.type === 'sworn_brothers') relBonus = 2;
      else if (rel.type === 'lord_vassal') relBonus = 1;
      else if (rel.type === 'loyalty' || rel.type === 'respect') relBonus = 0.5;
      else if (rel.type === 'enmity') relBonus = -2;
    }

    // 자연 변동: 50 미만은 느리게 회복, 50 이상은 느리게 감소 (리더 매력 만회)
    let delta = 0;
    if (char.loyalty < 70) {
      delta = recovery + relBonus - LOYALTY_DECAY_BASE * 0.5;
    } else {
      delta = recovery + relBonus - LOYALTY_DECAY_BASE;
    }

    char.loyalty = Math.max(0, Math.min(100, char.loyalty + delta));
  }
}

/**
 * 금 포상으로 충성도를 올린다.
 */
export function rewardOfficer(state, charId, goldCost = 1000) {
  const char = state.getCharacter(charId);
  if (!char || !char.alive || char.status !== 'active' || !char.faction) {
    return { success: false, loyaltyGain: 0, reason: 'invalid_character' };
  }

  const faction = state.getFaction(char.faction);
  if (!faction || faction.gold < goldCost) {
    return { success: false, loyaltyGain: 0, reason: 'insufficient_gold' };
  }

  const before = char.loyalty ?? 50;
  const baseGain = goldCost >= 1500 ? 14 : 10;
  const charismaBonus = Math.max(0, Math.floor((state.getCharacter(faction.leader)?.stats.charisma || 50) / 30));
  const loyaltyGain = Math.max(4, Math.min(20, baseGain + charismaBonus));

  faction.gold -= goldCost;
  char.loyalty = Math.min(100, before + loyaltyGain);

  return {
    success: true,
    loyaltyGain: char.loyalty - before,
    reason: 'rewarded',
  };
}

/**
 * 세력 인벤토리의 보물을 장수에게 하사하고 충성도를 올린다.
 */
export function bestowItem(state, charId, itemId) {
  const char = state.getCharacter(charId);
  if (!char || !char.alive || char.status !== 'active' || !char.faction) {
    return { success: false, loyaltyGain: 0, reason: 'invalid_character' };
  }

  const item = ITEMS[itemId];
  if (!item) {
    return { success: false, loyaltyGain: 0, reason: 'invalid_item' };
  }

  const result = equipItem(state, charId, itemId);
  if (!result.success) {
    return { success: false, loyaltyGain: 0, reason: result.reason };
  }

  const before = char.loyalty ?? 50;
  const loyaltyGain = item.rarity === 'legendary' ? 18 : 12;
  char.loyalty = Math.min(100, before + loyaltyGain);

  return {
    success: true,
    loyaltyGain: char.loyalty - before,
    itemName: getItemName(itemId),
    unequipped: result.unequipped,
    reason: 'bestowed',
  };
}

export function confiscateEquippedItem(state, charId, slot = null) {
  const char = state.getCharacter(charId);
  if (!char || !char.alive || char.status !== 'active' || !char.faction) {
    return { success: false, itemId: null, loyaltyLoss: 0, reason: 'invalid_character' };
  }

  const resolvedSlot = slot || ['accessory', 'weapon', 'horse', 'armor'].find((candidate) => char.equipment?.[candidate]);
  if (!resolvedSlot) {
    return { success: false, itemId: null, loyaltyLoss: 0, reason: 'slot_empty' };
  }

  const itemId = char.equipment?.[resolvedSlot];
  const item = itemId ? ITEMS[itemId] : null;
  if (!item) {
    return { success: false, itemId: null, loyaltyLoss: 0, reason: 'invalid_item' };
  }

  const result = unequipItem(state, charId, resolvedSlot);
  if (!result.success) {
    return { success: false, itemId: null, loyaltyLoss: 0, reason: result.reason };
  }

  const before = char.loyalty ?? 50;
  const baseLoss = item.rarity === 'legendary' ? 14 : 10;
  const loyaltyLoss = Math.max(6, baseLoss);
  char.loyalty = Math.max(0, before - loyaltyLoss);

  return {
    success: true,
    itemId,
    itemName: getItemName(itemId),
    slot: resolvedSlot,
    loyaltyLoss: before - char.loyalty,
    reason: 'confiscated',
  };
}

export function transferOfficer(state, charId, toCityId) {
  const char = state.getCharacter(charId);
  const toCity = state.getCity(toCityId);
  const fromCity = char ? state.getCity(char.city) : null;
  const fromCityId = char?.city || null;
  if (!char || !toCity || !fromCity) {
    return { success: false, reason: 'invalid_target' };
  }
  if (!char.alive || char.status !== 'active') {
    return { success: false, reason: 'invalid_status' };
  }
  if (char.faction !== toCity.owner || fromCity.owner !== toCity.owner) {
    return { success: false, reason: 'different_faction' };
  }
  const faction = state.getFaction(char.faction);
  if (faction?.leader === charId) {
    return { success: false, reason: 'leader_fixed' };
  }
  if (char.city === toCityId) {
    return { success: false, reason: 'same_city' };
  }

  const clearedGovernor = fromCity.governor === charId;
  if (clearedGovernor) fromCity.governor = null;
  char.city = toCityId;

  return {
    success: true,
    fromCityId,
    toCityId,
    clearedGovernor,
    reason: 'transferred',
  };
}

export function dismissOfficer(state, charId) {
  const char = state.getCharacter(charId);
  if (!char || !char.alive || char.status !== 'active') {
    return { success: false, reason: 'invalid_status' };
  }

  const faction = state.getFaction(char.faction);
  if (!faction) {
    return { success: false, reason: 'invalid_faction' };
  }
  if (faction.leader === charId) {
    return { success: false, reason: 'leader_fixed' };
  }

  const city = state.getCity(char.city);
  if (!city) {
    return { success: false, reason: 'invalid_city' };
  }

  const cityOfficers = state.getCharactersInCity(city.id)
    .filter((candidate) => candidate.faction === char.faction && candidate.status === 'active' && candidate.alive);
  if (cityOfficers.length <= 1) {
    return { success: false, reason: 'no_replacement' };
  }

  const clearedGovernor = city.governor === charId;
  if (clearedGovernor) city.governor = null;

  const clearedTactician = faction.tactician === charId;
  if (clearedTactician) faction.tactician = null;

  const reputationBefore = faction.reputation || 100;
  faction.reputation = Math.max(0, reputationBefore - 8);

  char.status = 'wandering';
  char.faction = null;
  char.loyalty = 0;

  return {
    success: true,
    cityId: city.id,
    clearedGovernor,
    clearedTactician,
    reputationLoss: reputationBefore - faction.reputation,
    reason: 'dismissed',
  };
}

// ─── 세력 멸망 시 장수 처리 ───

/**
 * 멸망한 세력의 장수를 방랑자로 전환
 */
export function handleFactionDestroyed(factionId, state) {
  for (const [charId, char] of Object.entries(state.characters)) {
    if (char.faction !== factionId || !char.alive) continue;

    if (char.status === 'active') {
      char.status = 'wandering';
      char.faction = null;
      char.loyalty = 0;
    }
  }
}

export {
  SEARCH_BASE_CHANCE, RECRUIT_BASE_CHANCE,
  CAPTURE_CHANCE, DEFECTION_CHECK_THRESHOLD
};
