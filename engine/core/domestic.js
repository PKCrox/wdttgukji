import { getBuildingEffects } from './buildings.js';
import { getTechEffects } from './tech-tree.js';
import { addExperienceFromSource } from './growth.js';

// Domestic — 4트랙 내정 시스템 (농업/상업/기술/치안)
//
// 투자 메카닉:
//   - 태수의 관련 능력치가 투자 효율 결정
//   - 높은 수치일수록 상승 폭 감소 (체감 수익)
//   - 도시별 자연 보너스로 특화 가능
//
// 결산 메카닉:
//   - 농업 → 식량 생산
//   - 상업 → 금 수입
//   - 기술 → 군사/건설 효율 (간접)
//   - 치안 → 반란 방지, 인구 성장 보정

// ─── 상수 ───

const TRACK_STAT_MAP = {
  agriculture: 'politics',    // 농업 투자 → 정치력
  commerce:    'intellect',   // 상업 투자 → 지력
  technology:  'intellect',   // 기술 투자 → 지력
  publicOrder: 'charisma'     // 치안 투자 → 매력
};

const INVEST_BASE_COST = 500;       // 기본 투자 비용
const INVEST_BASE_GAIN = 3;         // 기본 상승량
const INVEST_GOVERNOR_SCALE = 0.04; // 능력치 1당 보너스 (80이면 +3.2 → 총 6.2)

// 결산 상수
const FOOD_PER_AGRI = 6;           // 농업 1 → 식량 6/월 (인구 보정 전)
const GOLD_PER_COMM = 12;          // 상업 1 → 금 12/월 (인구 보정 전)
const FOOD_PER_SOLDIER = 0.05;     // 병사 1명 = 월 식량 0.05
const FOOD_PER_POP = 0.005;        // 인구 1명 = 월 식량 0.005
const STARVATION_DESERTION_RATE = 0.05;
const STARVATION_MORALE_PENALTY = 10;

const POP_GROWTH_BASE = 0.002;     // 기본 인구 증가율
const POP_GROWTH_ORDER_BONUS = 0.003; // 치안 100일 때 추가 증가율

const MORALE_DECAY = 1;            // 월 사기 자연 조정 (50 기준)

const REBELLION_THRESHOLD = 25;    // 치안 이 미만이면 반란 위험
const REBELLION_CHANCE_BASE = 0.15; // 치안 0일 때 반란 확률 15%

const TECH_EFFICIENCY = {
  recruit_bonus: 0.005,   // 기술 1당 모집 효율 +0.5%
  defense_bonus: 0.003,   // 기술 1당 방어 보너스 +0.3%
  invest_bonus: 0.002     // 기술 1당 투자 효율 +0.2%
};

const CONSCRIPTION_MIN_PUBLIC_ORDER = 20;
const CONSCRIPTION_BASE_RATE = 0.08;
const CONSCRIPTION_MAX = 4000;
const CONSCRIPTION_GOLD_PER_SOLDIER = 0.35;
const CONSCRIPTION_FOOD_PER_SOLDIER = 0.40;
const CONSCRIPTION_POP_PER_SOLDIER = 0.45;

export const CITY_DOMESTIC_POLICIES = {
  balanced: { key: 'balanced', name: '균형 시정', track: null, goldMult: 1, foodMult: 1, orderDelta: 0, bonus: '균형 성장' },
  agriculture: { key: 'agriculture', name: '농업 우선', track: 'agriculture', goldMult: 0.96, foodMult: 1.08, orderDelta: 0, bonus: '식량 생산 강화' },
  commerce: { key: 'commerce', name: '상업 우선', track: 'commerce', goldMult: 1.08, foodMult: 0.96, orderDelta: 0, bonus: '금 수입 강화' },
  technology: { key: 'technology', name: '기술 우선', track: 'technology', goldMult: 1.02, foodMult: 1.02, orderDelta: 0, bonus: '기술 축 누적' },
  public_order: { key: 'public_order', name: '치안 우선', track: 'publicOrder', goldMult: 0.97, foodMult: 0.98, orderDelta: 1, bonus: '민심 안정' },
};

export const CITY_MILITARY_POLICIES = {
  balanced: { key: 'balanced', name: '균형 군령', moraleDelta: 0, defenseDelta: 0, recruitEfficiency: 0, recruitOrderPenalty: 0, bonus: '균형 전선' },
  fortify: { key: 'fortify', name: '수비 우선', moraleDelta: 0, defenseDelta: 2, recruitEfficiency: 0, recruitOrderPenalty: 0, bonus: '성방 강화' },
  mobilize: { key: 'mobilize', name: '동원 우선', moraleDelta: 0, defenseDelta: 0, recruitEfficiency: 0.16, recruitOrderPenalty: 1, bonus: '징병 효율 강화' },
  aggressive: { key: 'aggressive', name: '공세 우선', moraleDelta: 2, defenseDelta: -1, recruitEfficiency: 0.05, recruitOrderPenalty: 0, bonus: '공격 사기 고양' },
};

// ─── 투자 ───

/**
 * 내정 투자 실행
 * @param {string} cityId
 * @param {'agriculture'|'commerce'|'technology'|'publicOrder'} track
 * @param {object} state - GameState
 * @param {string|null} governorId - 투자를 감독하는 장수 (없으면 기본)
 * @returns {{ success: boolean, gain: number, cost: number }}
 */
export function investTrack(cityId, track, state, governorId = null) {
  const city = state.cities[cityId];
  if (!city) return { success: false, gain: 0, cost: 0 };

  const faction = state.getFaction(city.owner);
  if (!faction) return { success: false, gain: 0, cost: 0 };

  const cost = INVEST_BASE_COST;
  if (faction.gold < cost) return { success: false, gain: 0, cost };

  // 현재 수치
  const current = city[track] || 0;
  if (current >= 100) return { success: false, gain: 0, cost };

  // 태수/감독관 능력치 보너스
  const statKey = TRACK_STAT_MAP[track];
  let governorBonus = 0;
  if (governorId) {
    const gov = state.getCharacter(governorId);
    if (gov && gov.alive && gov.status === 'active') {
      governorBonus = (gov.stats[statKey] || 50) * INVEST_GOVERNOR_SCALE;
    }
  }

  // 기술 레벨 보너스 + 학당 기술 속도 보너스
  const bEffects = getBuildingEffects(city);
  const factionTech = getTechEffects(state, city.owner);
  const techBonus = (city.technology || 0) * TECH_EFFICIENCY.invest_bonus
    + (bEffects.techSpeed || 0)
    + (factionTech.investBonus || 0);

  // 체감 수익: 수치가 높을수록 상승 폭 감소
  // 0~40: 풀 게인, 40~70: 80%, 70~90: 50%, 90~100: 30%
  let diminishing = 1.0;
  if (current > 90) diminishing = 0.3;
  else if (current > 70) diminishing = 0.5;
  else if (current > 40) diminishing = 0.8;

  const rawGain = (INVEST_BASE_GAIN + governorBonus) * (1 + techBonus) * diminishing;
  const gain = Math.max(1, Math.round(rawGain));

  // 적용
  faction.gold -= cost;
  city[track] = Math.min(100, current + gain);
  if (governorId) addExperienceFromSource(state, governorId, 'domestic_work');

  return { success: true, gain, cost };
}

/**
 * 투자 예상 결과 미리보기 (비용 차감 없음)
 */
export function previewInvestment(cityId, track, state, governorId = null) {
  const city = state.cities[cityId];
  if (!city) return { gain: 0, cost: INVEST_BASE_COST };

  const current = city[track] || 0;
  const statKey = TRACK_STAT_MAP[track];
  let governorBonus = 0;
  if (governorId) {
    const gov = state.getCharacter(governorId);
    if (gov && gov.alive && gov.status === 'active') {
      governorBonus = (gov.stats[statKey] || 50) * INVEST_GOVERNOR_SCALE;
    }
  }
  const bEffects = getBuildingEffects(city);
  const factionTech = getTechEffects(state, city.owner);
  const techBonus = (city.technology || 0) * TECH_EFFICIENCY.invest_bonus
    + (bEffects.techSpeed || 0)
    + (factionTech.investBonus || 0);

  let diminishing = 1.0;
  if (current > 90) diminishing = 0.3;
  else if (current > 70) diminishing = 0.5;
  else if (current > 40) diminishing = 0.8;

  const rawGain = (INVEST_BASE_GAIN + governorBonus) * (1 + techBonus) * diminishing;
  return { gain: Math.max(1, Math.round(rawGain)), cost: INVEST_BASE_COST };
}

export function previewConscript(cityId, state, governorId = null) {
  const city = state.cities[cityId];
  if (!city) {
    return { allowed: false, recruits: 0, goldCost: 0, foodCost: 0, orderLoss: 0, populationLoss: 0, reason: 'invalid_city' };
  }

  const faction = state.getFaction(city.owner);
  if (!faction) {
    return { allowed: false, recruits: 0, goldCost: 0, foodCost: 0, orderLoss: 0, populationLoss: 0, reason: 'invalid_faction' };
  }

  const resolvedGovernorId = governorId || city.governor || faction.leader || null;
  const governor = resolvedGovernorId ? state.getCharacter(resolvedGovernorId) : null;
  const publicOrder = toNumber(city.publicOrder, 50);
  const population = toNumber(city.population, 0);
  const bEffects = getBuildingEffects(city);
  const factionTech = getTechEffects(state, city.owner);
  const policyEffects = getCityPolicyEffects(city);

  const leadershipBonus = governor
    ? (toNumber(governor.stats.command, 50) - 50) * 0.003 + (toNumber(governor.stats.charisma, 50) - 50) * 0.0035
    : 0;
  const orderFactor = 0.65 + (publicOrder / 100) * 0.65;
  const efficiency = 1
    + (toNumber(city.technology, 0) * TECH_EFFICIENCY.recruit_bonus)
    + (toNumber(bEffects.recruitEfficiency, 0))
    + (toNumber(factionTech.recruitEfficiency, 0))
    + (policyEffects.recruitEfficiency || 0);
  const manpowerPool = Math.floor(population * CONSCRIPTION_BASE_RATE);
  const recruits = Math.max(
    0,
    Math.min(
      CONSCRIPTION_MAX,
      Math.floor((manpowerPool * (0.92 + leadershipBonus) * orderFactor * efficiency) / 50) * 50
    )
  );
  const goldCost = Math.max(600, Math.round((recruits * CONSCRIPTION_GOLD_PER_SOLDIER) / 50) * 50);
  const foodCost = Math.max(250, Math.round((recruits * CONSCRIPTION_FOOD_PER_SOLDIER) / 50) * 50);
  const orderLoss = Math.max(
    3,
    Math.min(12, Math.round(5 + recruits / 700 - ((toNumber(governor?.stats?.charisma, 50) - 50) * 0.03) + (policyEffects.recruitOrderPenalty || 0)))
  );
  const populationLoss = Math.max(150, Math.round(recruits * CONSCRIPTION_POP_PER_SOLDIER));

  if (publicOrder < CONSCRIPTION_MIN_PUBLIC_ORDER) {
    return { allowed: false, recruits, goldCost, foodCost, orderLoss, populationLoss, governorId: resolvedGovernorId, reason: 'public_order_too_low' };
  }
  if (population <= populationLoss + 2000) {
    return { allowed: false, recruits, goldCost, foodCost, orderLoss, populationLoss, governorId: resolvedGovernorId, reason: 'population_too_low' };
  }
  if (faction.gold < goldCost) {
    return { allowed: false, recruits, goldCost, foodCost, orderLoss, populationLoss, governorId: resolvedGovernorId, reason: 'insufficient_gold' };
  }
  if (city.food < foodCost) {
    return { allowed: false, recruits, goldCost, foodCost, orderLoss, populationLoss, governorId: resolvedGovernorId, reason: 'insufficient_food' };
  }

  return {
    allowed: recruits > 0,
    recruits,
    goldCost,
    foodCost,
    orderLoss,
    populationLoss,
    governorId: resolvedGovernorId,
    publicOrderAfter: Math.max(0, publicOrder - orderLoss),
    populationAfter: Math.max(0, population - populationLoss),
    foodAfter: Math.max(0, city.food - foodCost),
    reason: recruits > 0 ? 'ok' : 'no_manpower',
  };
}

export function conscriptTroops(cityId, state, governorId = null) {
  const preview = previewConscript(cityId, state, governorId);
  if (!preview.allowed) {
    return {
      success: false,
      recruits: 0,
      goldCost: preview.goldCost,
      foodCost: preview.foodCost,
      orderLoss: preview.orderLoss,
      populationLoss: preview.populationLoss,
      reason: preview.reason,
    };
  }

  const city = state.cities[cityId];
  const faction = state.getFaction(city.owner);
  faction.gold -= preview.goldCost;
  city.food = preview.foodAfter;
  city.population = preview.populationAfter;
  city.publicOrder = preview.publicOrderAfter;
  city.army += preview.recruits;

  if (preview.governorId) addExperienceFromSource(state, preview.governorId, 'domestic_work');

  return {
    success: true,
    recruits: preview.recruits,
    goldCost: preview.goldCost,
    foodCost: preview.foodCost,
    orderLoss: preview.orderLoss,
    populationLoss: preview.populationLoss,
    publicOrderAfter: city.publicOrder,
    populationAfter: city.population,
    foodAfter: city.food,
    armyAfter: city.army,
    reason: 'conscripted',
  };
}

// ─── 결산 ───

/**
 * 도시별 월간 자원 결산 (매 턴 endTurn에서 호출)
 */
export function settleCity(cityId, state) {
  const city = state.cities[cityId];
  if (!city || !city.owner) return;

  const faction = state.getFaction(city.owner);
  if (!faction) return;

  const bEffects = getBuildingEffects(city);
  const techEffects = getTechEffects(state, city.owner);
  const popFactor = city.population / 50000; // 인구 스케일 팩터

  // 1. 상업 → 금 수입 (건물 상업 보너스 적용)
  const bonus = city.naturalBonus || {};
  const policyEffects = getCityPolicyEffects(city);
  const commMult = bonus.commerce || 1.0;
  const commerceMultiplier = 1
    + (bEffects.commerce || 0) / 100
    + (techEffects.commerceBonus || 0)
    + (techEffects.taxBonus || 0);
  const income = Math.floor(city.commerce * GOLD_PER_COMM * popFactor * commMult * commerceMultiplier * (policyEffects.goldMult || 1));
  faction.gold += income;

  // 2. 농업 → 식량 생산
  const agriMult = bonus.agriculture || 1.0;
  const foodProd = Math.floor(
    city.agriculture * FOOD_PER_AGRI * popFactor * agriMult * (1 + (techEffects.agricultureBonus || 0)) * (policyEffects.foodMult || 1)
  );
  city.food += foodProd;

  // 3. 식량 소비 (곡창 보존 효과로 소비 절감)
  const rawFoodCost = Math.floor(city.army * FOOD_PER_SOLDIER + city.population * FOOD_PER_POP);
  const foodCost = Math.floor(rawFoodCost * (1 - (bEffects.foodPreservation || 0)));
  city.food = Math.max(0, city.food - foodCost);

  // 4. 식량 부족 → 탈영 + 사기 하락
  if (city.food === 0 && city.army > 0) {
    const deserters = Math.floor(city.army * STARVATION_DESERTION_RATE);
    city.army = Math.max(0, city.army - deserters);
    city.morale = Math.max(0, city.morale - STARVATION_MORALE_PENALTY);
    city.publicOrder = Math.max(0, city.publicOrder - 3);
    state.log(`${city.name}: 식량 부족! 탈영 ${deserters}명, 사기·치안 하락`, 'warning');
    state.recordSummary('shortages', {
      cityId,
      cityName: city.name,
      deserters,
      moraleLoss: STARVATION_MORALE_PENALTY,
    });
  }

  // 5. 인구 성장 (치안 영향)
  const orderFactor = (city.publicOrder || 50) / 100;
  const popGrowth = POP_GROWTH_BASE
    + (POP_GROWTH_ORDER_BONUS * orderFactor)
    + ((techEffects.healRate || 0) * 0.25);
  city.population += Math.floor(city.population * popGrowth);

  // 6. 사기 자연 조정 (50 + 건물 사기 보너스 기준)
  const moraleFloor = 50 + (bEffects.morale || 0) + (techEffects.moraleRecovery || 0);
  if (city.morale > moraleFloor) {
    city.morale = Math.max(moraleFloor, city.morale - MORALE_DECAY);
  } else if (city.morale < moraleFloor) {
    city.morale = Math.min(moraleFloor, city.morale + MORALE_DECAY);
  }

  // 7. 치안 자연 감소 (병력 적으면 치안 하락)
  if (city.army < city.population * 0.05) {
    city.publicOrder = Math.max(0, city.publicOrder - 1);
  }

  if (policyEffects.orderDelta) {
    city.publicOrder = Math.min(100, Math.max(0, city.publicOrder + policyEffects.orderDelta));
  }
  if (policyEffects.moraleDelta) {
    city.morale = Math.min(100, Math.max(0, city.morale + policyEffects.moraleDelta));
  }
  if (policyEffects.defenseDelta) {
    city.defense = Math.min(100, Math.max(0, toNumber(city.defense, 0) + policyEffects.defenseDelta));
  }
  if (policyEffects.track) {
    city[policyEffects.track] = Math.min(100, toNumber(city[policyEffects.track], 0) + 1);
  }
}

/**
 * 반란 체크 (치안 낮은 도시)
 * @returns {Array<{cityId, severity}>}
 */
export function checkRebellions(state) {
  const rebellions = [];

  for (const [cityId, city] of Object.entries(state.cities)) {
    if (!city.owner) continue;
    if (city.publicOrder >= REBELLION_THRESHOLD) continue;

    // 치안이 낮을수록 반란 확률 증가
    const chance = REBELLION_CHANCE_BASE * (1 - city.publicOrder / REBELLION_THRESHOLD);
    if (Math.random() >= chance) continue;

    // 반란 발생!
    const severity = city.publicOrder < 10 ? 'major' : 'minor';
    rebellions.push({ cityId, severity });

    if (severity === 'major') {
      // 대규모 반란: 병력 30% 손실, 식량 약탈
      const armyLoss = Math.floor(city.army * 0.3);
      const foodLoss = Math.floor(city.food * 0.2);
      city.army = Math.max(0, city.army - armyLoss);
      city.food = Math.max(0, city.food - foodLoss);
      city.morale = Math.max(10, city.morale - 20);
      city.publicOrder = Math.max(0, city.publicOrder - 10);
      state.log(`${city.name}: 대규모 반란 발생! 병력 ${armyLoss}명 손실`, 'rebellion');
      state.recordSummary('rebellions', {
        cityId,
        cityName: city.name,
        severity,
        armyLoss,
      });
    } else {
      // 소규모 반란: 치안·사기 감소
      city.morale = Math.max(10, city.morale - 10);
      city.publicOrder = Math.max(0, city.publicOrder - 5);
      state.log(`${city.name}: 소규모 반란 진압 (치안·사기 하락)`, 'rebellion');
      state.recordSummary('rebellions', {
        cityId,
        cityName: city.name,
        severity,
        armyLoss: 0,
      });
    }
  }

  return rebellions;
}

/**
 * 전체 도시 자원 결산 (settleResources 대체)
 */
export function settleAllCities(state) {
  for (const [cityId] of Object.entries(state.cities)) {
    settleCity(cityId, state);
  }
  checkRebellions(state);
}

/**
 * 기술 레벨에 따른 모집 보너스
 */
export function getRecruitBonus(city) {
  return 1 + (city.technology || 0) * TECH_EFFICIENCY.recruit_bonus;
}

/**
 * 기술 레벨에 따른 방어 보너스
 */
export function getDefenseBonus(city) {
  return 1 + (city.technology || 0) * TECH_EFFICIENCY.defense_bonus;
}

export function getCityForecast(cityId, state) {
  const city = state.getCity(cityId);
  if (!city || !city.owner) {
    return {
      goldDelta: 0,
      foodDelta: 0,
      popDelta: 0,
      moraleDelta: 0,
      orderDelta: 0,
      risks: [],
      bonuses: [],
      recommendations: [],
    };
  }

  const bEffects = getBuildingEffects(city);
  const techEffects = getTechEffects(state, city.owner);
  const bonus = city.naturalBonus || {};
  const policyEffects = getCityPolicyEffects(city);
  const popFactor = city.population / 50000;

  const commerceMultiplier = 1
    + (bEffects.commerce || 0) / 100
    + (techEffects.commerceBonus || 0)
    + (techEffects.taxBonus || 0);
  const goldDelta = Math.floor(
    city.commerce * GOLD_PER_COMM * popFactor * (bonus.commerce || 1.0) * commerceMultiplier * (policyEffects.goldMult || 1)
  );
  const foodProd = Math.floor(
    city.agriculture * FOOD_PER_AGRI * popFactor * (bonus.agriculture || 1.0) * (1 + (techEffects.agricultureBonus || 0)) * (policyEffects.foodMult || 1)
  );
  const foodCost = Math.floor(
    Math.floor(city.army * FOOD_PER_SOLDIER + city.population * FOOD_PER_POP)
    * (1 - (bEffects.foodPreservation || 0))
  );
  const foodDelta = foodProd - foodCost;
  const popGrowthRate = POP_GROWTH_BASE
    + (POP_GROWTH_ORDER_BONUS * ((city.publicOrder || 50) / 100))
    + ((techEffects.healRate || 0) * 0.25);
  const popDelta = Math.floor(city.population * popGrowthRate);
  const moraleFloor = 50 + (bEffects.morale || 0) + (techEffects.moraleRecovery || 0);
  let moraleDelta = 0;
  if (city.food + foodDelta <= 0 && city.army > 0) moraleDelta -= STARVATION_MORALE_PENALTY;
  else if (city.morale > moraleFloor) moraleDelta -= Math.min(MORALE_DECAY, city.morale - moraleFloor);
  else if (city.morale < moraleFloor) moraleDelta += Math.min(MORALE_DECAY, moraleFloor - city.morale);

  const underGarrisoned = city.army < city.population * 0.05;
  const orderDelta = (underGarrisoned ? -1 : 0) + (policyEffects.orderDelta || 0);

  const risks = [];
  if (city.food + foodDelta <= 0 && city.army > 0) risks.push('식량난');
  if ((city.publicOrder || 0) < REBELLION_THRESHOLD + 10) risks.push('반란 위험');
  if (underGarrisoned) risks.push('병력 부족');
  if (policyEffects.defenseDelta < 0) risks.push('공세 편향');

  const bonuses = [];
  if (bonus.agriculture > 1) bonuses.push(`농업 지형 ×${bonus.agriculture}`);
  if (bonus.commerce > 1) bonuses.push(`상업 지형 ×${bonus.commerce}`);
  if (bonus.technology > 1) bonuses.push(`기술 지형 ×${bonus.technology}`);
  if (bonus.publicOrder > 1) bonuses.push(`치안 지형 ×${bonus.publicOrder}`);
  if (techEffects.agricultureBonus) bonuses.push(`관개 보너스 +${Math.round(techEffects.agricultureBonus * 100)}%`);
  if (techEffects.commerceBonus) bonuses.push(`교역 보너스 +${Math.round(techEffects.commerceBonus * 100)}%`);
  if (bEffects.techSpeed) bonuses.push(`학당 연구속도 +${Math.round(bEffects.techSpeed * 100)}%`);
  if (bEffects.foodPreservation) bonuses.push(`곡창 보존율 +${Math.round(bEffects.foodPreservation * 100)}%`);
  if (policyEffects.domestic?.bonus) bonuses.push(`시정 정책: ${policyEffects.domestic.bonus}`);
  if (policyEffects.military?.bonus) bonuses.push(`군령 정책: ${policyEffects.military.bonus}`);

  const recommendations = deriveCityRecommendations(city, risks, policyEffects);

  return { goldDelta, foodDelta, popDelta, moraleDelta, orderDelta, risks, bonuses, recommendations };
}

function deriveCityRecommendations(city, risks, policyEffects = getCityPolicyEffects(city)) {
  const recs = [];
  if (risks.includes('식량난')) recs.push('농업 투자 또는 곡창 건설');
  if ((city.publicOrder || 0) < 45) recs.push('치안 투자');
  if ((city.technology || 0) < 40) recs.push('기술 투자 또는 학당/대장간');
  if ((city.commerce || 0) < 45) recs.push('상업 투자');
  if (policyEffects.domestic?.track === 'agriculture') recs.unshift('농업 우선 정책 유지');
  if (policyEffects.domestic?.track === 'commerce') recs.unshift('상업 우선 정책 유지');
  if (policyEffects.domestic?.track === 'technology') recs.unshift('기술 우선 정책 유지');
  if (policyEffects.domestic?.track === 'publicOrder') recs.unshift('치안 우선 정책 유지');
  if (policyEffects.military?.key === 'mobilize') recs.push('동원 우선으로 징병 체감 강화');
  if (policyEffects.military?.key === 'fortify') recs.push('수비 우선으로 성방 누적');
  return recs.slice(0, 2);
}

export function getCityPolicy(city) {
  const domesticFocus = city?.policy?.domesticFocus || 'balanced';
  const militaryPosture = city?.policy?.militaryPosture || 'balanced';
  return {
    domesticFocus,
    militaryPosture,
    domestic: CITY_DOMESTIC_POLICIES[domesticFocus] || CITY_DOMESTIC_POLICIES.balanced,
    military: CITY_MILITARY_POLICIES[militaryPosture] || CITY_MILITARY_POLICIES.balanced,
  };
}

export function getCityPolicyEffects(city) {
  const policy = getCityPolicy(city);
  return {
    ...policy,
    goldMult: policy.domestic.goldMult || 1,
    foodMult: policy.domestic.foodMult || 1,
    orderDelta: (policy.domestic.orderDelta || 0),
    moraleDelta: (policy.military.moraleDelta || 0),
    defenseDelta: (policy.military.defenseDelta || 0),
    recruitEfficiency: (policy.military.recruitEfficiency || 0),
    recruitOrderPenalty: (policy.military.recruitOrderPenalty || 0),
    track: policy.domestic.track || null,
  };
}

function toNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export { INVEST_BASE_COST, TRACK_STAT_MAP };
