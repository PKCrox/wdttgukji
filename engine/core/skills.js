// Skills — 장수 고유 특기 시스템
//
// 장수당 1~3개 스킬 보유 (char.skills = ['fire_attack', 'insight', ...])
// 스킬은 전투/내정/사교/첩보/지원/기술 6분류
// 효과: 해당 행동의 성공률/효율에 가산 보너스

// ─── 스킬 정의 ───

export const SKILLS = {
  fire_attack: {
    id: 'fire_attack',
    name: '화공',
    type: 'combat',
    desc: '화공 계략의 성공률이 크게 상승한다',
    effects: { fire_stratagem: 0.20 }
  },
  charge_master: {
    id: 'charge_master',
    name: '돌격',
    type: 'combat',
    desc: '추격진(돌격) 진형 사용 시 공격력이 상승한다',
    effects: { charge_attack: 0.15 }
  },
  naval: {
    id: 'naval',
    name: '수군',
    type: 'combat',
    desc: '강/수로 지형에서 전투력이 상승한다',
    effects: { river_combat: 0.20 }
  },
  ambush_master: {
    id: 'ambush_master',
    name: '매복',
    type: 'combat',
    desc: '매복진 사용 시 효과가 극대화된다',
    effects: { ambush_formation: 0.20 }
  },
  iron_wall: {
    id: 'iron_wall',
    name: '철벽',
    type: 'combat',
    desc: '원진(방어) 진형 사용 시 방어력이 대폭 상승한다',
    effects: { turtle_defense: 0.20 }
  },
  insight: {
    id: 'insight',
    name: '간파',
    type: 'combat',
    desc: '적의 계략을 간파하여 무력화 확률이 상승한다',
    effects: { counter_stratagem: 0.25 }
  },
  duel_master: {
    id: 'duel_master',
    name: '일기토',
    type: 'combat',
    desc: '일기토 시 무력 보정치가 추가된다',
    effects: { duel_war_bonus: 10 }
  },
  cavalry: {
    id: 'cavalry',
    name: '기마',
    type: 'combat',
    desc: '평지에서 기병 돌격의 공격력이 상승한다',
    effects: { plains_combat: 0.15 }
  },
  governance: {
    id: 'governance',
    name: '치국',
    type: 'domestic',
    desc: '내정 투자 효율이 크게 상승한다',
    effects: { invest_efficiency: 0.30 }
  },
  recruitment_master: {
    id: 'recruitment_master',
    name: '징모',
    type: 'domestic',
    desc: '병사 모집 비용이 절감되고 효율이 상승한다',
    effects: { recruit_cost: -0.20, recruit_efficiency: 0.20 }
  },
  charm: {
    id: 'charm',
    name: '인덕',
    type: 'social',
    desc: '인재 등용 성공률이 상승한다',
    effects: { recruitment_success: 0.15 }
  },
  spy_master: {
    id: 'spy_master',
    name: '첩보',
    type: 'espionage',
    desc: '첩보 활동의 성공률이 상승한다',
    effects: { espionage_success: 0.20 }
  },
  logistics: {
    id: 'logistics',
    name: '보급',
    type: 'support',
    desc: '관할 도시의 식량 소비가 절감된다',
    effects: { food_consumption: -0.20 }
  },
  medicine: {
    id: 'medicine',
    name: '의술',
    type: 'support',
    desc: '전투 후 부상병 회복률이 크게 상승한다',
    effects: { post_battle_heal: 0.30 }
  },
  inventor: {
    id: 'inventor',
    name: '발명',
    type: 'tech',
    desc: '기술 연구 속도가 크게 상승한다',
    effects: { tech_research_speed: 0.25 }
  }
};

// ─── 스킬 효과 조회 ───

/**
 * 캐릭터 스킬 목록에서 특정 효과 타입의 총합 보너스를 계산
 *
 * @param {string[]} charSkills - 캐릭터의 스킬 ID 배열 (char.skills)
 * @param {string} effectType - 효과 타입 키 (예: 'fire_stratagem', 'invest_efficiency')
 * @returns {number} 해당 효과의 합산 보너스 (없으면 0)
 *
 * @example
 * // 화공 + 간파 보유 캐릭터의 화공 보너스
 * getSkillEffects(['fire_attack', 'insight'], 'fire_stratagem') // → 0.20
 */
export function getSkillEffects(charSkills, effectType) {
  if (!charSkills || !Array.isArray(charSkills)) return 0;

  let total = 0;
  for (const skillId of charSkills) {
    const skill = SKILLS[skillId];
    if (!skill) continue;
    const value = skill.effects[effectType];
    if (value != null) {
      total += value;
    }
  }
  return total;
}

/**
 * 캐릭터가 특정 스킬을 보유하고 있는지 확인
 *
 * @param {object} char - 캐릭터 객체 (char.skills 배열 필요)
 * @param {string} skillId - 확인할 스킬 ID
 * @returns {boolean}
 */
export function hasSkill(char, skillId) {
  if (!char || !Array.isArray(char.skills)) return false;
  return char.skills.includes(skillId);
}

/**
 * 캐릭터의 모든 스킬 효과를 맵으로 반환
 *
 * @param {string[]} charSkills - 캐릭터의 스킬 ID 배열
 * @returns {Object<string, number>} { effectType: totalBonus }
 */
export function getAllSkillEffects(charSkills) {
  if (!charSkills || !Array.isArray(charSkills)) return {};

  const effects = {};
  for (const skillId of charSkills) {
    const skill = SKILLS[skillId];
    if (!skill) continue;
    for (const [key, value] of Object.entries(skill.effects)) {
      effects[key] = (effects[key] || 0) + value;
    }
  }
  return effects;
}

/**
 * 특정 타입의 스킬 목록 조회
 *
 * @param {'combat'|'domestic'|'social'|'espionage'|'support'|'tech'} type
 * @returns {object[]} 해당 타입 스킬 배열
 */
export function getSkillsByType(type) {
  return Object.values(SKILLS).filter(s => s.type === type);
}
