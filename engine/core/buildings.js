// Buildings — 도시 시설/건축 시스템
//
// 도시별 최대 5개 건물 슬롯
// city.buildings = { market: { level: 1, building: false, turnsLeft: 0 }, ... }
// 빈 슬롯: 키 미존재. 건설 중: building=true, turnsLeft>0
// 레벨업: 기존 건물에 재건설 (비용 = 기본비용 × 레벨)

// ─── 건물 정의 ───

import { addExperienceFromSource } from './growth.js';

const MAX_BUILDING_SLOTS = 5;

export const BUILDINGS = {
  market: {
    id: 'market',
    name: '시장',
    desc: '교역을 활성화하여 상업 수입을 늘린다',
    baseCost: 2000,
    buildTime: 2,
    maxLevel: 3,
    effects: { commerce: 10 }
  },
  forge: {
    id: 'forge',
    name: '대장간',
    desc: '무기와 갑주를 제작하여 기술력을 높인다',
    baseCost: 3000,
    buildTime: 3,
    maxLevel: 3,
    effects: { technology: 10 }
  },
  barracks: {
    id: 'barracks',
    name: '병영',
    desc: '병사 훈련 시설. 모집 효율과 사기를 높인다',
    baseCost: 2500,
    buildTime: 2,
    maxLevel: 3,
    effects: { recruitEfficiency: 0.2, morale: 5 }
  },
  walls: {
    id: 'walls',
    name: '성벽',
    desc: '도시 방어력을 크게 높인다',
    baseCost: 4000,
    buildTime: 4,
    maxLevel: 3,
    effects: { defense: 15 }
  },
  watchtower: {
    id: 'watchtower',
    name: '망루',
    desc: '적의 첩보를 감지하고 주변을 감시한다',
    baseCost: 1500,
    buildTime: 2,
    maxLevel: 2,
    effects: { espionageDefense: 0.2, vision: true }
  },
  granary: {
    id: 'granary',
    name: '곡창',
    desc: '식량 저장량을 늘리고 보존율을 높인다',
    baseCost: 2000,
    buildTime: 2,
    maxLevel: 3,
    effects: { foodCapacity: 5000, foodPreservation: 0.1 }
  },
  academy: {
    id: 'academy',
    name: '학당',
    desc: '장수 경험치 보너스와 기술 연구 속도를 높인다',
    baseCost: 3000,
    buildTime: 3,
    maxLevel: 2,
    effects: { expBonus: 0.2, techSpeed: 0.15 }
  }
};

// ─── 건설 ───

/**
 * 건설 가능 여부 확인
 *
 * @param {object} state - GameState
 * @param {string} cityId - 도시 ID
 * @param {string} buildingId - 건물 ID (BUILDINGS 키)
 * @returns {{ canBuild: boolean, reason: string, cost: number }}
 */
export function canBuild(state, cityId, buildingId) {
  const city = state.getCity(cityId);
  if (!city) return { canBuild: false, reason: 'invalid_city', cost: 0 };

  const bDef = BUILDINGS[buildingId];
  if (!bDef) return { canBuild: false, reason: 'invalid_building', cost: 0 };

  const faction = state.getFaction(city.owner);
  if (!faction) return { canBuild: false, reason: 'no_owner', cost: 0 };

  // 건물 슬롯 초기화
  if (!city.buildings) city.buildings = {};

  const existing = city.buildings[buildingId];

  // 신축: 슬롯 수 체크
  if (!existing) {
    const slotCount = Object.keys(city.buildings).length;
    if (slotCount >= MAX_BUILDING_SLOTS) {
      return { canBuild: false, reason: 'no_slots', cost: 0 };
    }
  }

  // 레벨업: 최대 레벨 체크
  if (existing && existing.level >= bDef.maxLevel) {
    return { canBuild: false, reason: 'max_level', cost: 0 };
  }

  // 건설 중인지 체크
  if (existing && existing.building) {
    return { canBuild: false, reason: 'already_building', cost: 0 };
  }

  // 비용 계산 (레벨업 시 = baseCost × 다음레벨)
  const nextLevel = existing ? existing.level + 1 : 1;
  const cost = bDef.baseCost * nextLevel;

  if (faction.gold < cost) {
    return { canBuild: false, reason: 'insufficient_gold', cost };
  }

  return { canBuild: true, reason: 'ok', cost };
}

/**
 * 건설 시작
 *
 * @param {object} state - GameState
 * @param {string} cityId - 도시 ID
 * @param {string} buildingId - 건물 ID
 * @returns {{ success: boolean, cost: number, turnsLeft: number, reason: string }}
 */
export function startConstruction(state, cityId, buildingId) {
  const check = canBuild(state, cityId, buildingId);
  if (!check.canBuild) {
    return { success: false, cost: 0, turnsLeft: 0, reason: check.reason };
  }

  const city = state.getCity(cityId);
  const faction = state.getFaction(city.owner);
  const bDef = BUILDINGS[buildingId];

  if (!city.buildings) city.buildings = {};

  // 비용 차감
  faction.gold -= check.cost;

  const existing = city.buildings[buildingId];
  if (existing) {
    // 레벨업 건설
    existing.building = true;
    existing.turnsLeft = bDef.buildTime;
  } else {
    // 신축
    city.buildings[buildingId] = {
      level: 0,      // 건설 완료 시 1로 변경
      building: true,
      turnsLeft: bDef.buildTime
    };
  }

  if (state.log) {
    const levelStr = existing ? `Lv.${existing.level + 1}` : 'Lv.1';
    state.log(`${city.name}: ${bDef.name} ${levelStr} 건설 시작 (${bDef.buildTime}턴)`, 'construction');
  }

  return {
    success: true,
    cost: check.cost,
    turnsLeft: bDef.buildTime,
    reason: 'started'
  };
}

// ─── 턴 진행 ───

/**
 * 전체 도시 건설 진행 (매 턴 호출)
 *
 * @param {object} state - GameState
 * @returns {Array<{cityId: string, buildingId: string, level: number}>} 완공된 건물 목록
 */
export function advanceConstruction(state) {
  const completed = [];

  for (const [cityId, city] of Object.entries(state.cities)) {
    if (!city.buildings) continue;

    for (const [buildingId, building] of Object.entries(city.buildings)) {
      if (!building.building) continue;

      building.turnsLeft--;

      if (building.turnsLeft <= 0) {
        // 건설 완료
        building.building = false;
        building.turnsLeft = 0;
        building.level++;

        const bDef = BUILDINGS[buildingId];
        const name = bDef ? bDef.name : buildingId;

        if (state.log) {
          state.log(`${city.name}: ${name} Lv.${building.level} 완공!`, 'construction');
        }

        const governorId = city.governor || state.getFaction(city.owner)?.leader;
        if (governorId) {
          addExperienceFromSource(state, governorId, 'construction_completion');
        }
        state.recordSummary('buildingsCompleted', {
          cityId,
          cityName: city.name,
          buildingId,
          buildingName: name,
          level: building.level,
          owner: city.owner,
        });

        completed.push({ cityId, buildingId, level: building.level });
      }
    }
  }

  return completed;
}

// ─── 효과 집계 ───

/**
 * 도시의 건물 효과를 종합 집계
 *
 * @param {object} city - 도시 객체
 * @returns {object} 합산된 건물 효과
 *
 * @example
 * // 시장 Lv.2 + 성벽 Lv.1 도시
 * getBuildingEffects(city)
 * // → { commerce: 20, defense: 15 }
 */
export function getBuildingEffects(city) {
  const effects = {};
  if (!city.buildings) return effects;

  for (const [buildingId, building] of Object.entries(city.buildings)) {
    // 건설 중이거나 레벨 0이면 효과 없음
    if (building.building || building.level <= 0) continue;

    const bDef = BUILDINGS[buildingId];
    if (!bDef) continue;

    for (const [key, baseValue] of Object.entries(bDef.effects)) {
      if (typeof baseValue === 'boolean') {
        // boolean 효과: 레벨 무관, 존재 여부만
        effects[key] = true;
      } else {
        // 수치 효과: 레벨에 비례
        effects[key] = (effects[key] || 0) + baseValue * building.level;
      }
    }
  }

  return effects;
}

/**
 * 도시의 현재 건물 수 (건설 중 포함)
 *
 * @param {object} city
 * @returns {number}
 */
export function getBuildingCount(city) {
  if (!city.buildings) return 0;
  return Object.keys(city.buildings).length;
}

/**
 * 도시에 건설 가능한 건물 목록
 *
 * @param {object} state - GameState
 * @param {string} cityId
 * @returns {Array<{id: string, name: string, cost: number, canBuild: boolean, reason: string}>}
 */
export function getAvailableBuildings(state, cityId) {
  const result = [];
  for (const [id, bDef] of Object.entries(BUILDINGS)) {
    const check = canBuild(state, cityId, id);
    result.push({
      id,
      name: bDef.name,
      cost: check.cost,
      canBuild: check.canBuild,
      reason: check.reason
    });
  }
  return result;
}

export { MAX_BUILDING_SLOTS };
