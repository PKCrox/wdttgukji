import { getBuildingEffects } from './buildings.js';

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
  const techBonus = (city.technology || 0) * TECH_EFFICIENCY.invest_bonus + (bEffects.techSpeed || 0);

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
  const techBonus = (city.technology || 0) * TECH_EFFICIENCY.invest_bonus;

  let diminishing = 1.0;
  if (current > 90) diminishing = 0.3;
  else if (current > 70) diminishing = 0.5;
  else if (current > 40) diminishing = 0.8;

  const rawGain = (INVEST_BASE_GAIN + governorBonus) * (1 + techBonus) * diminishing;
  return { gain: Math.max(1, Math.round(rawGain)), cost: INVEST_BASE_COST };
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
  const popFactor = city.population / 50000; // 인구 스케일 팩터

  // 1. 상업 → 금 수입 (건물 상업 보너스 적용)
  const bonus = city.naturalBonus || {};
  const commMult = bonus.commerce || 1.0;
  const income = Math.floor(city.commerce * GOLD_PER_COMM * popFactor * commMult * (1 + (bEffects.commerce || 0) / 100));
  faction.gold += income;

  // 2. 농업 → 식량 생산
  const agriMult = bonus.agriculture || 1.0;
  const foodProd = Math.floor(city.agriculture * FOOD_PER_AGRI * popFactor * agriMult);
  city.food += foodProd;

  // 3. 식량 소비 (곡창 보존 효과로 소비 절감)
  const rawFoodCost = Math.floor(city.army * FOOD_PER_SOLDIER + city.population * FOOD_PER_POP);
  const foodCost = Math.floor(rawFoodCost * (1 - (bEffects.foodPreservation || 0)));
  city.food = Math.max(0, city.food - foodCost);

  // 4. 식량 부족 → 탈영 + 사기 하락
  if (city.food === 0 && city.army > 0) {
    const deserters = Math.floor(city.army * 0.05);
    city.army = Math.max(0, city.army - deserters);
    city.morale = Math.max(0, city.morale - 10);
    city.publicOrder = Math.max(0, city.publicOrder - 3);
    state.log(`${city.name}: 식량 부족! 탈영 ${deserters}명, 사기·치안 하락`, 'warning');
  }

  // 5. 인구 성장 (치안 영향)
  const orderFactor = (city.publicOrder || 50) / 100;
  const popGrowth = POP_GROWTH_BASE + (POP_GROWTH_ORDER_BONUS * orderFactor);
  city.population += Math.floor(city.population * popGrowth);

  // 6. 사기 자연 조정 (50 + 건물 사기 보너스 기준)
  const moraleFloor = 50 + (bEffects.morale || 0);
  if (city.morale > moraleFloor) {
    city.morale = Math.max(moraleFloor, city.morale - MORALE_DECAY);
  } else if (city.morale < moraleFloor) {
    city.morale = Math.min(moraleFloor, city.morale + MORALE_DECAY);
  }

  // 7. 치안 자연 감소 (병력 적으면 치안 하락)
  if (city.army < city.population * 0.05) {
    city.publicOrder = Math.max(0, city.publicOrder - 1);
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
    } else {
      // 소규모 반란: 치안·사기 감소
      city.morale = Math.max(10, city.morale - 10);
      city.publicOrder = Math.max(0, city.publicOrder - 5);
      state.log(`${city.name}: 소규모 반란 진압 (치안·사기 하락)`, 'rebellion');
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

export { INVEST_BASE_COST, TRACK_STAT_MAP };
