// Espionage — 첩보/간첩 시스템
//
// 장수를 적 도시에 파견하여 정찰/유언비어/공작/이간/기밀탈취 수행
// 성공률: 기본 + 지력 보정 + 스킬(첩보) + 대상 도시 태수 지력/망루 방어
// 실패 시 30% 확률로 포로 포획

import { hasSkill } from './skills.js';
import { getBuildingEffects } from './buildings.js';

// ─── 첩보 행동 정의 ───

export const ESPIONAGE_ACTIONS = {
  scout: {
    id: 'scout',
    name: '정찰',
    desc: '적 도시의 병력, 방어력, 식량 정보를 파악한다',
    cost: 500,
    successBase: 0.50,
    captureOnFail: 0.30
  },
  rumor: {
    id: 'rumor',
    name: '유언비어',
    desc: '적 도시에 유언비어를 퍼뜨려 치안과 사기를 떨어뜨린다',
    cost: 1000,
    successBase: 0.35,
    captureOnFail: 0.30,
    effects: { publicOrder: -10, morale: -5 }
  },
  sabotage: {
    id: 'sabotage',
    name: '공작',
    desc: '적 도시의 방어 시설을 파괴하거나 건물을 훼손한다',
    cost: 2000,
    successBase: 0.25,
    captureOnFail: 0.30,
    effects: { defense: -10 }
  },
  incite: {
    id: 'incite',
    name: '이간',
    desc: '적 장수의 충성심을 흔들어 이탈을 유도한다',
    cost: 1500,
    successBase: 0.30,
    captureOnFail: 0.30,
    effects: { loyaltyMin: -25, loyaltyMax: -15 }
  },
  steal_info: {
    id: 'steal_info',
    name: '기밀 탈취',
    desc: '적 세력의 연구 상황과 외교 관계를 파악한다',
    cost: 800,
    successBase: 0.40,
    captureOnFail: 0.30
  }
};

// ─── 성공률 계산 ───

/**
 * 첩보 성공 확률 계산
 *
 * @param {object} state - GameState
 * @param {string} spyId - 첩자 장수 ID
 * @param {string} targetCityId - 대상 도시 ID
 * @param {string} actionType - ESPIONAGE_ACTIONS 키
 * @returns {{ chance: number, factors: object }}
 */
export function calculateEspionageChance(state, spyId, targetCityId, actionType) {
  const spy = state.getCharacter(spyId);
  const city = state.getCity(targetCityId);
  const action = ESPIONAGE_ACTIONS[actionType];

  if (!spy || !city || !action) {
    return { chance: 0, factors: { error: 'invalid_params' } };
  }

  const factors = {};

  // 기본 성공률
  let chance = action.successBase;
  factors.base = action.successBase;

  // 첩자 지력 보정 (+0.4% per intellect)
  const spyIntBonus = spy.stats.intellect * 0.004;
  chance += spyIntBonus;
  factors.spyIntellect = spyIntBonus;

  // 첩보 스킬 보너스
  if (hasSkill(spy, 'spy_master')) {
    chance += 0.20;
    factors.spyMasterSkill = 0.20;
  }

  // 대상 도시 태수(governor) 지력 방어 (-0.3% per intellect)
  if (city.governor) {
    const governor = state.getCharacter(city.governor);
    if (governor && governor.alive && governor.status === 'active') {
      const govDefense = governor.stats.intellect * 0.003;
      chance -= govDefense;
      factors.governorDefense = -govDefense;
    }
  }

  // 망루 보유 시 방어 보너스
  const buildingEffects = getBuildingEffects(city);
  if (buildingEffects.espionageDefense) {
    const towerPenalty = buildingEffects.espionageDefense;
    chance -= towerPenalty;
    factors.watchtower = -towerPenalty;
  }

  // 상한/하한
  chance = Math.max(0.05, Math.min(0.90, chance));
  factors.final = chance;

  return { chance, factors };
}

// ─── 첩보 실행 ───

/**
 * 첩보 활동 실행
 *
 * @param {object} state - GameState
 * @param {string} spyId - 첩자 장수 ID
 * @param {string} targetCityId - 대상 도시 ID
 * @param {string} actionType - ESPIONAGE_ACTIONS 키
 * @returns {object} 실행 결과
 */
export function executeEspionage(state, spyId, targetCityId, actionType) {
  const spy = state.getCharacter(spyId);
  const city = state.getCity(targetCityId);
  const action = ESPIONAGE_ACTIONS[actionType];

  if (!spy || !spy.alive || spy.status !== 'active') {
    return { success: false, reason: 'invalid_spy' };
  }
  if (!city) {
    return { success: false, reason: 'invalid_city' };
  }
  if (!action) {
    return { success: false, reason: 'invalid_action' };
  }

  // 자기 도시에는 첩보 불가
  const spyFaction = spy.faction;
  if (city.owner === spyFaction) {
    return { success: false, reason: 'own_city' };
  }

  // 비용 체크 및 차감
  const faction = state.getFaction(spyFaction);
  if (!faction || faction.gold < action.cost) {
    return { success: false, reason: 'insufficient_gold' };
  }
  faction.gold -= action.cost;

  // 성공 판정
  const { chance, factors } = calculateEspionageChance(state, spyId, targetCityId, actionType);
  const roll = Math.random();
  const succeeded = roll < chance;

  if (succeeded) {
    return _applySuccess(state, spy, spyId, city, targetCityId, actionType, action, chance, factors);
  } else {
    return _applyFailure(state, spy, spyId, city, targetCityId, actionType, action, chance, factors);
  }
}

// ─── 성공 처리 ───

function _applySuccess(state, spy, spyId, city, targetCityId, actionType, action, chance, factors) {
  const result = {
    success: true,
    action: actionType,
    actionName: action.name,
    chance: Math.round(chance * 100),
    spy: spyId,
    target: targetCityId,
    details: {}
  };

  switch (actionType) {
    case 'scout': {
      // 도시 정보 공개
      result.details = {
        army: city.army,
        defense: city.defense,
        food: city.food,
        morale: city.morale,
        governor: city.governor || null
      };
      break;
    }

    case 'rumor': {
      // 치안/사기 하락
      city.publicOrder = Math.max(0, city.publicOrder + action.effects.publicOrder);
      city.morale = Math.max(0, city.morale + action.effects.morale);
      result.details = {
        publicOrderDelta: action.effects.publicOrder,
        moraleDelta: action.effects.morale
      };
      break;
    }

    case 'sabotage': {
      // 방어력 하락 또는 건물 피해
      city.defense = Math.max(0, city.defense + action.effects.defense);
      result.details = { defenseDelta: action.effects.defense };

      // 건물 피해 (30% 확률로 랜덤 건물 1레벨 하락)
      if (city.buildings && Math.random() < 0.30) {
        const buildingKeys = Object.keys(city.buildings).filter(
          k => city.buildings[k].level > 0 && !city.buildings[k].building
        );
        if (buildingKeys.length > 0) {
          const targetKey = buildingKeys[Math.floor(Math.random() * buildingKeys.length)];
          city.buildings[targetKey].level = Math.max(0, city.buildings[targetKey].level - 1);
          // 레벨 0이면 건물 제거
          if (city.buildings[targetKey].level <= 0) {
            delete city.buildings[targetKey];
          }
          result.details.buildingDamaged = targetKey;
        }
      }
      break;
    }

    case 'incite': {
      // 랜덤 장수 1명의 충성도 하락
      const enemyChars = state.getCharactersInCity(targetCityId)
        .filter(c => c.faction === city.owner);

      if (enemyChars.length > 0) {
        // 리더 제외
        const targets = enemyChars.filter(c => {
          const f = state.getFaction(c.faction);
          return !f || f.leader !== c.id;
        });

        if (targets.length > 0) {
          const target = targets[Math.floor(Math.random() * targets.length)];
          const loyaltyDelta = action.effects.loyaltyMax
            + Math.floor(Math.random() * (action.effects.loyaltyMin - action.effects.loyaltyMax + 1));
          const charObj = state.getCharacter(target.id);
          if (charObj) {
            charObj.loyalty = Math.max(0, charObj.loyalty + loyaltyDelta);
          }
          result.details = { targetChar: target.id, loyaltyDelta };
        } else {
          result.details = { note: '이간 대상 없음 (리더만 주둔)' };
        }
      } else {
        result.details = { note: '도시에 장수 없음' };
      }
      break;
    }

    case 'steal_info': {
      // 적 세력의 연구/외교 정보 공개
      const enemyFaction = state.getFaction(city.owner);
      if (enemyFaction) {
        result.details = {
          research: enemyFaction.research ? {
            completed: enemyFaction.research.completed || [],
            current: enemyFaction.research.current?.techId || null
          } : null,
          allies: enemyFaction.allies || [],
          enemies: enemyFaction.enemies || [],
          gold: enemyFaction.gold,
          reputation: enemyFaction.reputation
        };
      }
      break;
    }
  }

  if (state.log) {
    state.log(`[첩보] ${action.name} 성공! (${city.name})`, 'espionage');
  }

  return result;
}

// ─── 실패 처리 ───

function _applyFailure(state, spy, spyId, city, targetCityId, actionType, action, chance, factors) {
  const result = {
    success: false,
    action: actionType,
    actionName: action.name,
    chance: Math.round(chance * 100),
    spy: spyId,
    target: targetCityId,
    captured: false
  };

  // 포획 판정
  if (Math.random() < action.captureOnFail) {
    state.captureCharacter(spyId, city.owner);
    result.captured = true;

    if (state.log) {
      state.log(`[첩보] ${action.name} 실패 — 첩자가 포로로 잡혔습니다! (${city.name})`, 'espionage');
    }
  } else {
    if (state.log) {
      state.log(`[첩보] ${action.name} 실패 (${city.name})`, 'espionage');
    }
  }

  return result;
}
