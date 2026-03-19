// TroopMovement — 도시 간 병력 이동
//
// 연결된 도시 사이에서 병력 + 장수를 이동
// 이동 시 식량 소비 (병력 × 0.01)
// 액션 1회 소비

// ─── 상수 ───

const FOOD_COST_PER_SOLDIER = 0.01; // 병사 1명당 행군 식량 소비

// ─── 이동 가능 여부 ───

/**
 * 도시 간 병력 이동 가능 여부 확인
 *
 * @param {object} state - GameState
 * @param {string} fromCityId - 출발 도시 ID
 * @param {string} toCityId - 도착 도시 ID
 * @param {object} connections - 도시 연결 데이터 { cityId: [connectedCityId, ...] }
 * @returns {{ canMove: boolean, reason: string }}
 */
export function canMoveArmy(state, fromCityId, toCityId, connections) {
  const fromCity = state.getCity(fromCityId);
  const toCity = state.getCity(toCityId);

  if (!fromCity) return { canMove: false, reason: 'invalid_from_city' };
  if (!toCity) return { canMove: false, reason: 'invalid_to_city' };
  if (fromCityId === toCityId) return { canMove: false, reason: 'same_city' };

  // 같은 세력 소유인지 확인
  if (!fromCity.owner) return { canMove: false, reason: 'no_owner' };
  if (fromCity.owner !== toCity.owner) return { canMove: false, reason: 'different_faction' };

  // 연결 확인
  if (!connections) return { canMove: false, reason: 'no_connection_data' };

  const fromConnections = getConnectionsForCity(fromCityId, connections);
  if (!fromConnections.includes(toCityId)) {
    return { canMove: false, reason: 'not_connected' };
  }

  return { canMove: true, reason: 'ok' };
}

// ─── 병력 이동 ───

/**
 * 도시 간 병력 및 장수 이동 실행
 *
 * @param {object} state - GameState
 * @param {string} fromCityId - 출발 도시 ID
 * @param {string} toCityId - 도착 도시 ID
 * @param {number} amount - 이동할 병력 수
 * @param {string[]} generalIds - 함께 이동할 장수 ID 목록
 * @param {object} connections - 도시 연결 데이터
 * @returns {{ success: boolean, transferred: number, foodCost: number, generals: string[], reason: string }}
 */
export function moveArmy(state, fromCityId, toCityId, amount, generalIds = [], connections = null) {
  // 연결 확인
  if (connections) {
    const check = canMoveArmy(state, fromCityId, toCityId, connections);
    if (!check.canMove) {
      return { success: false, transferred: 0, foodCost: 0, generals: [], reason: check.reason };
    }
  }

  const fromCity = state.getCity(fromCityId);
  const toCity = state.getCity(toCityId);

  if (!fromCity || !toCity) {
    return { success: false, transferred: 0, foodCost: 0, generals: [], reason: 'invalid_city' };
  }

  // 같은 세력인지 재확인
  if (fromCity.owner !== toCity.owner) {
    return { success: false, transferred: 0, foodCost: 0, generals: [], reason: 'different_faction' };
  }

  // 이동 병력 검증
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, transferred: 0, foodCost: 0, generals: [], reason: 'invalid_amount' };
  }

  // 실제 이동 가능 병력 (출발 도시 병력 이내)
  const actual = Math.min(amount, fromCity.army);
  if (actual <= 0) {
    return { success: false, transferred: 0, foodCost: 0, generals: [], reason: 'no_army' };
  }

  // 식량 소비
  const foodCost = Math.ceil(actual * FOOD_COST_PER_SOLDIER);
  if (fromCity.food < foodCost) {
    return { success: false, transferred: 0, foodCost, generals: [], reason: 'insufficient_food' };
  }

  // 장수 검증 — 출발 도시에 있는 활성 장수만 이동
  const movedGenerals = [];
  for (const genId of generalIds) {
    const gen = state.getCharacter(genId);
    if (!gen || !gen.alive || gen.status !== 'active') continue;
    if (gen.city !== fromCityId) continue;
    if (gen.faction !== fromCity.owner) continue;

    movedGenerals.push(genId);
  }

  // 병력 이동
  fromCity.army -= actual;
  toCity.army += actual;

  // 식량 차감
  fromCity.food -= foodCost;

  // 장수 이동
  for (const genId of movedGenerals) {
    state.moveCharacter(genId, toCityId);

    // 태수가 이동한 경우, 출발 도시 태수 해제
    if (fromCity.governor === genId) {
      fromCity.governor = null;
    }
  }

  if (state.log) {
    const genStr = movedGenerals.length > 0
      ? ` (장수 ${movedGenerals.length}명 동행)`
      : '';
    state.log(
      `${fromCity.name} → ${toCity.name}: 병력 ${actual.toLocaleString()}명 이동${genStr} (식량 -${foodCost})`,
      'movement'
    );
  }

  return {
    success: true,
    transferred: actual,
    foodCost,
    generals: movedGenerals,
    reason: 'moved'
  };
}

/**
 * 이동 미리보기 (비용만 확인, 상태 변경 없음)
 *
 * @param {object} state - GameState
 * @param {string} fromCityId
 * @param {number} amount
 * @returns {{ foodCost: number, maxTransfer: number }}
 */
export function previewMovement(state, fromCityId, amount) {
  const city = state.getCity(fromCityId);
  if (!city) return { foodCost: 0, maxTransfer: 0 };

  const actual = Math.min(amount, city.army);
  const foodCost = Math.ceil(actual * FOOD_COST_PER_SOLDIER);

  // 식량으로 이동 가능한 최대 병력
  const maxByFood = Math.floor(city.food / FOOD_COST_PER_SOLDIER);
  const maxTransfer = Math.min(city.army, maxByFood);

  return { foodCost, maxTransfer };
}

export { FOOD_COST_PER_SOLDIER };

function getConnectionsForCity(cityId, connections) {
  if (!connections) return [];
  if (Array.isArray(connections)) {
    const result = [];
    for (const edge of connections) {
      if (!Array.isArray(edge) || edge.length < 2) continue;
      const [a, b] = edge;
      if (a === cityId) result.push(b);
      else if (b === cityId) result.push(a);
    }
    return result;
  }

  const result = connections[cityId];
  return Array.isArray(result) ? result : [];
}
