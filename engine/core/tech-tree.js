// TechTree — 세력 기술 연구 시스템
//
// 세력별 1개씩 연구 진행 가능
// faction.research = { completed: ['irrigation'], current: { techId: 'trade_routes', turnsLeft: 2 } }
// 선행 기술 요구, 카테고리: military / economy / special

// ─── 기술 정의 ───

export const TECHS = {
  // ── 군사 ──
  improved_weapons: {
    id: 'improved_weapons',
    name: '개량 병기',
    category: 'military',
    desc: '병기를 개량하여 보병 공격력을 높인다',
    cost: 3000,
    turns: 3,
    requires: [],
    effects: { combatAttack: 0.05 }
  },
  siege_engines: {
    id: 'siege_engines',
    name: '공성기',
    category: 'military',
    desc: '공성 장비를 개발하여 성벽 공략을 용이하게 한다',
    cost: 5000,
    turns: 5,
    requires: ['improved_weapons'],
    effects: { siegeBonus: 0.30 }
  },
  crossbow: {
    id: 'crossbow',
    name: '연노',
    category: 'military',
    desc: '연발 석궁을 개발하여 원거리 공격력을 높인다',
    cost: 4000,
    turns: 4,
    requires: ['improved_weapons'],
    effects: { rangedAttack: 0.10 }
  },
  cavalry_training: {
    id: 'cavalry_training',
    name: '기병 훈련',
    category: 'military',
    desc: '기병대를 양성하여 평지에서의 전투력을 높인다',
    cost: 3500,
    turns: 3,
    requires: [],
    effects: { cavalryBonus: 0.10, plainsBonus: 0.10 }
  },
  naval_tech: {
    id: 'naval_tech',
    name: '조선술',
    category: 'military',
    desc: '전선을 건조하여 수전 능력을 높인다',
    cost: 4000,
    turns: 4,
    requires: [],
    effects: { navalBonus: 0.20 }
  },

  // ── 경제 ──
  irrigation: {
    id: 'irrigation',
    name: '관개 수리',
    category: 'economy',
    desc: '수리 시설을 정비하여 농업 생산을 늘린다',
    cost: 2000,
    turns: 3,
    requires: [],
    effects: { agricultureBonus: 0.15 }
  },
  trade_routes: {
    id: 'trade_routes',
    name: '교역로',
    category: 'economy',
    desc: '교역로를 개설하여 상업 수입을 늘린다',
    cost: 2500,
    turns: 3,
    requires: [],
    effects: { commerceBonus: 0.15 }
  },
  currency_reform: {
    id: 'currency_reform',
    name: '화폐 개혁',
    category: 'economy',
    desc: '화폐를 통일하여 세수를 늘린다',
    cost: 4000,
    turns: 4,
    requires: ['trade_routes'],
    effects: { taxBonus: 0.10 }
  },

  // ── 특수 ──
  medicine_tech: {
    id: 'medicine_tech',
    name: '의술 연구',
    category: 'special',
    desc: '의술을 발전시켜 부상병 회복과 사기 회복을 높인다',
    cost: 2000,
    turns: 3,
    requires: [],
    effects: { healRate: 0.10, moraleRecovery: 2 }
  },
  espionage_network: {
    id: 'espionage_network',
    name: '첩보망',
    category: 'special',
    desc: '첩보 조직을 구축하여 정보 수집 능력을 높인다',
    cost: 3000,
    turns: 4,
    requires: [],
    effects: { espionageBonus: 0.20 }
  },
  diplomacy_school: {
    id: 'diplomacy_school',
    name: '외교술',
    category: 'special',
    desc: '외교 인재를 양성하여 외교 성공률과 평판을 높인다',
    cost: 2500,
    turns: 3,
    requires: [],
    effects: { diplomacyBonus: 0.10, reputationGain: 0.2 }
  }
};

// ─── 연구 관리 ───

/**
 * 세력이 특정 기술을 연구 완료했는지 확인
 *
 * @param {object} state - GameState
 * @param {string} factionId
 * @param {string} techId
 * @returns {boolean}
 */
export function hasTech(state, factionId, techId) {
  const faction = state.getFaction(factionId);
  if (!faction || !faction.research) return false;
  return (faction.research.completed || []).includes(techId);
}

/**
 * 세력이 연구 가능한 기술 목록 조회
 *
 * @param {object} state - GameState
 * @param {string} factionId
 * @returns {Array<{id: string, name: string, category: string, cost: number, turns: number, available: boolean, reason: string}>}
 */
export function getAvailableTechs(state, factionId) {
  const faction = state.getFaction(factionId);
  if (!faction) return [];

  _ensureResearch(faction);
  const completed = faction.research.completed;
  const currentId = faction.research.current?.techId || null;

  const result = [];
  for (const [id, tech] of Object.entries(TECHS)) {
    // 이미 완료
    if (completed.includes(id)) continue;

    // 현재 연구 중
    if (id === currentId) continue;

    // 선행 기술 체크
    const prereqMet = tech.requires.every(req => completed.includes(req));

    let available = prereqMet;
    let reason = 'ok';

    if (!prereqMet) {
      const missing = tech.requires.filter(req => !completed.includes(req));
      reason = `선행 기술 필요: ${missing.map(m => TECHS[m]?.name || m).join(', ')}`;
      available = false;
    } else if (currentId) {
      reason = '다른 연구가 진행 중';
      available = false;
    } else if (faction.gold < tech.cost) {
      reason = '자금 부족';
      available = false;
    }

    result.push({
      id,
      name: tech.name,
      category: tech.category,
      cost: tech.cost,
      turns: tech.turns,
      available,
      reason
    });
  }

  return result;
}

/**
 * 연구 시작
 *
 * @param {object} state - GameState
 * @param {string} factionId
 * @param {string} techId
 * @returns {{ success: boolean, cost: number, turns: number, reason: string }}
 */
export function startResearch(state, factionId, techId) {
  const faction = state.getFaction(factionId);
  if (!faction) return { success: false, cost: 0, turns: 0, reason: 'invalid_faction' };

  _ensureResearch(faction);

  const tech = TECHS[techId];
  if (!tech) return { success: false, cost: 0, turns: 0, reason: 'invalid_tech' };

  // 이미 완료
  if (faction.research.completed.includes(techId)) {
    return { success: false, cost: 0, turns: 0, reason: 'already_completed' };
  }

  // 진행 중인 연구 있음
  if (faction.research.current) {
    return { success: false, cost: 0, turns: 0, reason: 'research_in_progress' };
  }

  // 선행 기술 체크
  const prereqMet = tech.requires.every(req => faction.research.completed.includes(req));
  if (!prereqMet) {
    return { success: false, cost: 0, turns: 0, reason: 'prerequisites_not_met' };
  }

  // 비용 체크
  if (faction.gold < tech.cost) {
    return { success: false, cost: tech.cost, turns: 0, reason: 'insufficient_gold' };
  }

  // 연구 시작
  faction.gold -= tech.cost;
  faction.research.current = {
    techId,
    turnsLeft: tech.turns
  };

  if (state.log) {
    state.log(`${faction.name}: ${tech.name} 연구 시작 (${tech.turns}턴)`, 'research');
  }

  return { success: true, cost: tech.cost, turns: tech.turns, reason: 'started' };
}

// ─── 턴 진행 ───

/**
 * 전체 세력 연구 진행 (매 턴 호출)
 *
 * @param {object} state - GameState
 * @returns {Array<{factionId: string, techId: string, name: string}>} 완료된 연구 목록
 */
export function advanceResearch(state) {
  const completed = [];

  for (const [factionId, faction] of Object.entries(state.factions)) {
    _ensureResearch(faction);

    if (!faction.research.current) continue;

    faction.research.current.turnsLeft--;

    if (faction.research.current.turnsLeft <= 0) {
      const techId = faction.research.current.techId;
      faction.research.completed.push(techId);
      faction.research.current = null;

      const tech = TECHS[techId];
      const name = tech ? tech.name : techId;

      if (state.log) {
        state.log(`${faction.name}: ${name} 연구 완료!`, 'research');
      }

      completed.push({ factionId, techId, name });
    }
  }

  return completed;
}

// ─── 효과 집계 ───

/**
 * 세력의 완료된 기술 효과를 종합 집계
 *
 * @param {object} state - GameState
 * @param {string} factionId
 * @returns {object} { effectKey: totalValue, ... }
 *
 * @example
 * // irrigation + trade_routes 완료 세력
 * getTechEffects(state, 'shu')
 * // → { agricultureBonus: 0.15, commerceBonus: 0.15 }
 */
export function getTechEffects(state, factionId) {
  const faction = state.getFaction(factionId);
  if (!faction) return {};

  _ensureResearch(faction);
  const effects = {};

  for (const techId of faction.research.completed) {
    const tech = TECHS[techId];
    if (!tech) continue;

    for (const [key, value] of Object.entries(tech.effects)) {
      effects[key] = (effects[key] || 0) + value;
    }
  }

  return effects;
}

/**
 * 세력의 현재 연구 진행 상태 조회
 *
 * @param {object} state - GameState
 * @param {string} factionId
 * @returns {{ researching: boolean, techId: string|null, name: string|null, turnsLeft: number, completedCount: number }}
 */
export function getResearchStatus(state, factionId) {
  const faction = state.getFaction(factionId);
  if (!faction) return { researching: false, techId: null, name: null, turnsLeft: 0, completedCount: 0 };

  _ensureResearch(faction);

  const current = faction.research.current;
  const tech = current ? TECHS[current.techId] : null;

  return {
    researching: !!current,
    techId: current?.techId || null,
    name: tech?.name || null,
    turnsLeft: current?.turnsLeft || 0,
    completedCount: faction.research.completed.length
  };
}

// ─── 내부 유틸 ───

/**
 * 세력의 research 필드 초기화 (이전 세이브 호환)
 * @param {object} faction
 */
function _ensureResearch(faction) {
  if (!faction.research) {
    faction.research = { completed: [], current: null };
  }
  if (!faction.research.completed) {
    faction.research.completed = [];
  }
}
