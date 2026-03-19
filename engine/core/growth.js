// Growth — 장수 경험치 및 능력치 성장 시스템
//
// 경험치 획득 → 레벨업 → 잠재력(potential)에 따른 능력치 성장
// char.experience = 누적 경험치, char.level = 현재 레벨 (1~10)
// char.potential = { command: 80, war: 90, ... } → 해당 능력치 성장 상한

// ─── 상수 ───

/** 경험치 소스별 획득량 */
export const EXP_SOURCES = {
  battle_participation: 20,
  battle_victory:       50,
  duel_victory:         30,
  domestic_work:        10,
  construction_completion: 18,
  research_completion: 35,
  diplomatic_success:   15,
  espionage_success:    20,
  stratagem_success:    25
};

/** 레벨별 누적 경험치 요구량 (인덱스 = 레벨 - 1) */
const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500];

const MAX_LEVEL = LEVEL_THRESHOLDS.length; // 10

// ─── 레벨 계산 ───

/**
 * 누적 경험치로 현재 레벨 산출
 *
 * @param {number} exp - 누적 경험치
 * @returns {number} 레벨 (1~10)
 */
export function getLevel(exp) {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (exp >= LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

/**
 * 다음 레벨까지 남은 경험치
 *
 * @param {number} exp - 현재 누적 경험치
 * @returns {number} 남은 경험치 (최대 레벨이면 0)
 */
export function expToNextLevel(exp) {
  const level = getLevel(exp);
  if (level >= MAX_LEVEL) return 0;
  return LEVEL_THRESHOLDS[level] - exp;
}

// ─── 경험치 부여 ───

/**
 * 캐릭터에게 경험치를 부여하고 레벨업 처리
 *
 * @param {object} state - GameState
 * @param {string} charId - 대상 캐릭터 ID
 * @param {number} amount - 부여할 경험치량
 * @param {string} source - 경험치 소스 키 (EXP_SOURCES 참조, 로그용)
 * @returns {{ gained: number, leveledUp: boolean, newLevel: number, statGrowth: object|null }}
 */
export function addExperience(state, charId, amount, source) {
  const char = state.getCharacter(charId);
  if (!char || !char.alive) {
    return { gained: 0, leveledUp: false, newLevel: 0, statGrowth: null };
  }

  // 필드 초기화 (이전 세이브 호환)
  if (char.experience == null) char.experience = 0;
  if (char.level == null) char.level = getLevel(char.experience);

  const prevLevel = char.level;
  char.experience += amount;

  const result = checkLevelUp(state, charId);

  return {
    gained: amount,
    leveledUp: result.leveledUp,
    newLevel: char.level,
    statGrowth: result.statGrowth
  };
}

/**
 * 사전 정의된 소스 키로 경험치 부여 (편의 함수)
 *
 * @param {object} state - GameState
 * @param {string} charId - 대상 캐릭터 ID
 * @param {string} sourceKey - EXP_SOURCES 키 (예: 'battle_victory')
 * @returns {{ gained: number, leveledUp: boolean, newLevel: number, statGrowth: object|null }}
 */
export function addExperienceFromSource(state, charId, sourceKey) {
  const amount = EXP_SOURCES[sourceKey];
  if (amount == null) {
    return { gained: 0, leveledUp: false, newLevel: 0, statGrowth: null };
  }
  return addExperience(state, charId, amount, sourceKey);
}

// ─── 레벨업 ───

/**
 * 레벨업 조건 확인 및 능력치 성장 적용
 *
 * @param {object} state - GameState
 * @param {string} charId - 캐릭터 ID
 * @returns {{ leveledUp: boolean, statGrowth: object|null }}
 */
export function checkLevelUp(state, charId) {
  const char = state.getCharacter(charId);
  if (!char || !char.alive) {
    return { leveledUp: false, statGrowth: null };
  }

  if (char.experience == null) char.experience = 0;
  if (char.level == null) char.level = 1;

  const newLevel = getLevel(char.experience);
  if (newLevel <= char.level) {
    return { leveledUp: false, statGrowth: null };
  }

  // 레벨업 발생 — 여러 레벨을 한번에 올라갈 수도 있음
  const levelsGained = newLevel - char.level;
  const statGrowth = {};

  const potential = char.potential || {};
  const statKeys = ['command', 'war', 'intellect', 'politics', 'charisma'];

  for (const stat of statKeys) {
    const pot = potential[stat] || 50; // 잠재력 기본값
    const growthPerLevel = Math.floor(1 + pot / 100);
    const totalGrowth = growthPerLevel * levelsGained;

    // 잠재력 상한 적용
    const currentVal = char.stats[stat] || 0;
    const maxVal = pot;
    const actualGrowth = Math.min(totalGrowth, Math.max(0, maxVal - currentVal));

    if (actualGrowth > 0) {
      char.stats[stat] = currentVal + actualGrowth;
      statGrowth[stat] = actualGrowth;
    }
  }

  char.level = newLevel;

  if (state.log) {
    const growthStr = Object.entries(statGrowth)
      .map(([stat, val]) => `${stat}+${val}`)
      .join(', ');
    if (growthStr) {
      state.log(`${charId} 레벨업! Lv.${newLevel} (${growthStr})`, 'levelup');
    }
  }

  return { leveledUp: true, statGrowth };
}

/**
 * 캐릭터 경험치/레벨 정보 조회
 *
 * @param {object} char - 캐릭터 객체
 * @returns {{ level: number, experience: number, nextLevelExp: number, progress: number }}
 */
export function getGrowthInfo(char) {
  const exp = char.experience || 0;
  const level = char.level || getLevel(exp);
  const toNext = expToNextLevel(exp);

  // 현재 레벨 구간 내 진행률 (0~1)
  let progress = 0;
  if (level < MAX_LEVEL) {
    const currentThreshold = LEVEL_THRESHOLDS[level - 1];
    const nextThreshold = LEVEL_THRESHOLDS[level];
    const range = nextThreshold - currentThreshold;
    progress = range > 0 ? (exp - currentThreshold) / range : 0;
  } else {
    progress = 1;
  }

  return { level, experience: exp, nextLevelExp: toNext, progress };
}

export { MAX_LEVEL, LEVEL_THRESHOLDS };
