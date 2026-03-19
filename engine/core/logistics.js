// Logistics — 인접 아군 도시 간 병참 수송
//
// 현재 엔진은 금을 세력 단위로 관리하므로, 1차 패스에서는 도시 단위 자원인 식량을 수송한다.
// 병력 이동은 troop-movement.js, 군량 수송은 여기서 처리한다.

import { canMoveArmy } from './troop-movement.js';
import { addExperienceFromSource } from './growth.js';
import { getBuildingEffects } from './buildings.js';
import { getTechEffects } from './tech-tree.js';

const MIN_SOURCE_FOOD_BUFFER = 1500;
const MARKET_SAFETY_BUFFER = 2000;
const BASE_BUY_RATE = 0.28;
const BASE_SELL_RATE = 0.18;

export function canTransportFood(state, fromCityId, toCityId, amount, connections = null) {
  const linkCheck = canMoveArmy(state, fromCityId, toCityId, connections);
  if (!linkCheck.canMove) {
    return { canTransport: false, reason: linkCheck.reason };
  }

  const fromCity = state.getCity(fromCityId);
  const toCity = state.getCity(toCityId);
  if (!fromCity || !toCity) {
    return { canTransport: false, reason: 'invalid_city' };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return { canTransport: false, reason: 'invalid_amount' };
  }

  if (fromCity.food < amount) {
    return { canTransport: false, reason: 'insufficient_food' };
  }

  if (fromCity.food - amount < 0) {
    return { canTransport: false, reason: 'negative_food' };
  }

  return {
    canTransport: true,
    amount,
    sourceAfter: fromCity.food - amount,
    targetAfter: toCity.food + amount,
    leavesBuffer: fromCity.food - amount >= MIN_SOURCE_FOOD_BUFFER,
    reason: 'ok',
  };
}

export function previewFoodTransport(state, fromCityId, toCityId, amount, connections = null) {
  const result = canTransportFood(state, fromCityId, toCityId, amount, connections);
  if (!result.canTransport) {
    return { amount: 0, sourceAfter: 0, targetAfter: 0, reason: result.reason };
  }

  return {
    amount: result.amount,
    sourceAfter: result.sourceAfter,
    targetAfter: result.targetAfter,
    leavesBuffer: result.leavesBuffer,
    reason: 'ok',
  };
}

export function transportFood(state, fromCityId, toCityId, amount, connections = null) {
  const result = canTransportFood(state, fromCityId, toCityId, amount, connections);
  if (!result.canTransport) {
    return { success: false, transferred: 0, reason: result.reason };
  }

  const fromCity = state.getCity(fromCityId);
  const toCity = state.getCity(toCityId);
  const transferred = Math.floor(amount);

  fromCity.food -= transferred;
  toCity.food += transferred;

  const governorId = fromCity.governor || toCity.governor || null;
  if (governorId) addExperienceFromSource(state, governorId, 'domestic_investment');

  if (state.log) {
    state.log(`${fromCity.name} → ${toCity.name}: 군량 ${transferred.toLocaleString()} 수송`, 'logistics');
  }

  return {
    success: true,
    transferred,
    sourceAfter: fromCity.food,
    targetAfter: toCity.food,
    leavesBuffer: result.leavesBuffer,
    reason: 'transported',
  };
}

export function previewFoodTrade(state, cityId, amount, mode = 'buy') {
  const city = state.getCity(cityId);
  if (!city) {
    return { allowed: false, amount: 0, gold: 0, foodAfter: 0, reason: 'invalid_city' };
  }

  const faction = state.getFaction(city.owner);
  if (!faction) {
    return { allowed: false, amount: 0, gold: 0, foodAfter: 0, reason: 'invalid_faction' };
  }

  const normalizedAmount = Math.max(0, Math.floor(amount / 500) * 500);
  if (!normalizedAmount) {
    return { allowed: false, amount: 0, gold: 0, foodAfter: city.food, reason: 'invalid_amount' };
  }

  const rate = getFoodTradeRate(state, cityId, mode);
  const gold = Math.max(100, Math.round(normalizedAmount * rate / 50) * 50);

  if (mode === 'buy') {
    if (faction.gold < gold) {
      return { allowed: false, amount: normalizedAmount, gold, foodAfter: city.food, reason: 'insufficient_gold', season: getTradeSeason(state.month), rate };
    }
    return {
      allowed: true,
      amount: normalizedAmount,
      gold,
      foodAfter: city.food + normalizedAmount,
      factionGoldAfter: faction.gold - gold,
      season: getTradeSeason(state.month),
      rate,
      reason: 'ok',
    };
  }

  if (city.food - normalizedAmount < MARKET_SAFETY_BUFFER) {
    return { allowed: false, amount: normalizedAmount, gold, foodAfter: city.food, reason: 'insufficient_food_buffer', season: getTradeSeason(state.month), rate };
  }
  return {
    allowed: true,
    amount: normalizedAmount,
    gold,
    foodAfter: city.food - normalizedAmount,
    factionGoldAfter: faction.gold + gold,
    season: getTradeSeason(state.month),
    rate,
    reason: 'ok',
  };
}

export function tradeFood(state, cityId, amount, mode = 'buy') {
  const preview = previewFoodTrade(state, cityId, amount, mode);
  if (!preview.allowed) {
    return { success: false, amount: preview.amount, gold: preview.gold, reason: preview.reason };
  }

  const city = state.getCity(cityId);
  const faction = state.getFaction(city.owner);
  if (mode === 'buy') {
    faction.gold -= preview.gold;
    city.food += preview.amount;
  } else {
    faction.gold += preview.gold;
    city.food -= preview.amount;
  }

  const governorId = city.governor || faction.leader || null;
  if (governorId) addExperienceFromSource(state, governorId, 'domestic_work');

  return {
    success: true,
    mode,
    amount: preview.amount,
    gold: preview.gold,
    foodAfter: city.food,
    factionGoldAfter: faction.gold,
    season: preview.season,
    rate: preview.rate,
    reason: mode === 'buy' ? 'purchased' : 'sold',
  };
}

export function getTradeSeason(month) {
  if ([3, 4, 5].includes(month)) return 'spring';
  if ([6, 7, 8].includes(month)) return 'summer';
  if ([9, 10, 11].includes(month)) return 'autumn';
  return 'winter';
}

export function getFoodTradeRate(state, cityId, mode = 'buy') {
  const city = state.getCity(cityId);
  if (!city) return mode === 'buy' ? BASE_BUY_RATE : BASE_SELL_RATE;

  const season = getTradeSeason(state.month);
  const seasonMult = mode === 'buy'
    ? { spring: 1.02, summer: 1.08, autumn: 0.88, winter: 1.12 }[season]
    : { spring: 0.96, summer: 0.92, autumn: 1.14, winter: 1.02 }[season];
  const bEffects = getBuildingEffects(city);
  const factionTech = getTechEffects(state, city.owner);
  const cityCommerce = Math.max(0, city.commerce || 0);
  const marketDiscount = Math.min(0.18, (bEffects.commerce || 0) * 0.0035);
  const techDiscount = Math.min(0.08, (factionTech.commerceBonus || 0) * 0.35 + (factionTech.taxBonus || 0) * 0.15);
  const commerceDiscount = Math.min(0.10, cityCommerce / 800);
  const totalDiscount = marketDiscount + techDiscount + commerceDiscount;

  if (mode === 'buy') {
    return BASE_BUY_RATE * seasonMult * (1 - totalDiscount);
  }
  return BASE_SELL_RATE * seasonMult * (1 + totalDiscount * 0.9);
}

export { MIN_SOURCE_FOOD_BUFFER, MARKET_SAFETY_BUFFER };
