import { getSkillEffects, hasSkill } from './skills.js';
import { getTechEffects } from './tech-tree.js';

// EnhancedCombat — 다중 라운드 전술 전투
//
// 전투 흐름:
//   1. 진형 선택 (공격/수비 측 각각)
//   2. 1~5 라운드 반복:
//      a. 계략 시도 (조건 충족 시)
//      b. 일기토 (양측 무장 있으면)
//      c. 본대 교전 (병력 충돌)
//      d. 사기 체크 → 패주 판정
//   3. 전투 종료: 승패, 손실, 포로 판정
//
// 진형: 병력 배치 패턴, 장수 능력치 요구
// 계략: 지력 기반 특수 행동, 큰 영향력
// 일기토: 무력 비교 + 랜덤, 사기 보정

// ─── 진형 ───

export const FORMATIONS = {
  standard: {
    name: '방진', nameKo: '방진(方陣)',
    desc: '기본 진형. 균형 잡힌 공수',
    requirement: { command: 0 },
    attackMod: 1.0, defenseMod: 1.0, moraleMod: 0,
    counterBy: null // 특별 상극 없음
  },
  charge: {
    name: '돌격', nameKo: '추격진(錐行陣)',
    desc: '공격 특화. 방어력 감소',
    requirement: { command: 70, war: 60 },
    attackMod: 1.3, defenseMod: 0.7, moraleMod: 5,
    counterBy: 'turtle' // 방어진에 약함
  },
  turtle: {
    name: '방어', nameKo: '원진(圓陣)',
    desc: '수비 특화. 공격력 감소',
    requirement: { command: 60 },
    attackMod: 0.7, defenseMod: 1.4, moraleMod: 0,
    counterBy: 'surround'
  },
  surround: {
    name: '포위', nameKo: '학익진(鶴翼陣)',
    desc: '포위 공격. 병력 우세 시 강력',
    requirement: { command: 80, intellect: 60 },
    attackMod: 1.2, defenseMod: 0.9, moraleMod: 0,
    counterBy: 'charge', // 돌격에 약함 (중앙 돌파)
    armyRequirement: 1.3 // 상대보다 1.3배 이상 병력 필요
  },
  ambush: {
    name: '매복', nameKo: '매복진(埋伏陣)',
    desc: '기습 공격. 성공 시 사기 대폭 감소',
    requirement: { intellect: 75, command: 65 },
    attackMod: 1.1, defenseMod: 0.8, moraleMod: -10,
    counterBy: 'standard',
    terrainBonus: ['forest', 'mountain'] // 숲/산에서 효과 증대
  },
  river_defense: {
    name: '수전', nameKo: '수군진(水軍陣)',
    desc: '수전 특화. 강/수로에서 방어 극대화',
    requirement: { command: 70, intellect: 50 },
    attackMod: 0.9, defenseMod: 1.0, moraleMod: 0,
    terrainBonus: ['river'] // 강에서 방어 1.5배
  }
};

// ─── 계략 ───

export const STRATAGEMS = {
  fire_attack: {
    name: '화공', nameKo: '화공(火攻)',
    desc: '적 진영에 불을 놓아 병력 손실 유발',
    requirement: { intellect: 85 },
    successBase: 0.35,
    intellectScale: 0.005,
    effect: { armyDamage: 0.15, moraleDamage: 15 },
    terrainBonus: { river: 0.15, forest: 0.1 }, // 적벽!
    counterStat: 'intellect' // 방어 측 지력으로 방어
  },
  ambush_attack: {
    name: '매복', nameKo: '기습(奇襲)',
    desc: '기습 공격으로 적 사기를 꺾는다',
    requirement: { intellect: 70, command: 65 },
    successBase: 0.4,
    intellectScale: 0.004,
    effect: { armyDamage: 0.08, moraleDamage: 20 },
    terrainBonus: { mountain: 0.15, forest: 0.2 },
    counterStat: 'intellect'
  },
  feigned_retreat: {
    name: '양동', nameKo: '허퇴(虛退)',
    desc: '거짓 퇴각으로 적을 유인',
    requirement: { intellect: 80, command: 70 },
    successBase: 0.3,
    intellectScale: 0.005,
    effect: { formationBreak: true, moraleDamage: 10 },
    terrainBonus: { plains: 0.1 },
    counterStat: 'intellect'
  },
  demoralize: {
    name: '심공', nameKo: '이간(離間)',
    desc: '적 장수의 사기와 충성도를 흔든다',
    requirement: { intellect: 75, charisma: 70 },
    successBase: 0.35,
    intellectScale: 0.004,
    effect: { moraleDamage: 25, loyaltyDamage: 5 },
    terrainBonus: {},
    counterStat: 'charisma'
  }
};

// ─── 지형 ───

const TERRAIN_MODS = {
  plains:   { attack: 1.0, defense: 1.0, retreatLoss: 0.05 },
  river:    { attack: 0.8, defense: 1.1, retreatLoss: 0.15 },
  mountain: { attack: 0.7, defense: 1.3, retreatLoss: 0.1 },
  forest:   { attack: 0.9, defense: 1.1, retreatLoss: 0.08 },
  wetland:  { attack: 0.85, defense: 1.0, retreatLoss: 0.12 }
};

// ─── 전투 해결 ───

/**
 * 다중 라운드 전술 전투 해결
 *
 * @param {object} attacker - { army, morale, generals: [{id, stats}], formation: string }
 * @param {object} defender - { army, morale, defense, generals: [{id, stats}], formation: string }
 * @param {object} options  - { terrain, maxRounds, allowStratagems, allowDuels }
 * @param {object} state    - GameState (계략/관계 참조용)
 * @returns {object} 전투 결과
 */
export function resolveEnhancedCombat(attacker, defender, options = {}, state = null) {
  const terrain = options.terrain || 'plains';
  const maxRounds = options.maxRounds || 4;
  const allowStratagems = options.allowStratagems !== false;
  const allowDuels = options.allowDuels !== false;

  const terrainMod = TERRAIN_MODS[terrain] || TERRAIN_MODS.plains;
  const atkFormation = FORMATIONS[attacker.formation] || FORMATIONS.standard;
  const defFormation = FORMATIONS[defender.formation] || FORMATIONS.standard;

  // 전투 상태
  let atkArmy = attacker.army;
  let defArmy = defender.army;
  let atkMorale = attacker.morale || 70;
  let defMorale = defender.morale || 70;

  const atkLead = attacker.generals?.[0] || { stats: { command: 50, war: 50, intellect: 50, charisma: 50 } };
  const defLead = defender.generals?.[0] || { stats: { command: 50, war: 50, intellect: 50, charisma: 50 } };
  const atkTech = state && attacker.factionId ? getTechEffects(state, attacker.factionId) : {};
  const defTech = state && defender.factionId ? getTechEffects(state, defender.factionId) : {};

  const rounds = [];
  let duelOccurred = false;
  let stratagemUsed = null;
  let winner = null;

  // 진형 상극 체크
  let atkFormBonus = 1.0;
  let defFormBonus = 1.0;
  if (defFormation.counterBy === attacker.formation) {
    atkFormBonus = 1.15; // 상대 진형의 약점 공략
  }
  if (atkFormation.counterBy === defender.formation) {
    defFormBonus = 1.15;
  }

  // 진형 지형 보너스
  if (atkFormation.terrainBonus?.includes(terrain)) {
    atkFormBonus *= 1.2;
  }
  if (defFormation.terrainBonus?.includes(terrain)) {
    defFormBonus *= 1.2;
  }

  // 진형 병력 요구 체크
  if (atkFormation.armyRequirement && atkArmy < defArmy * atkFormation.armyRequirement) {
    atkFormBonus *= 0.8; // 병력 부족으로 진형 효과 감소
  }

  // ── 장수 스킬 보너스 ──
  if (hasSkill(atkLead, 'charge_master') && attacker.formation === 'charge') {
    atkFormBonus *= (1 + getSkillEffects(atkLead.skills, 'charge_attack'));
  }
  if (hasSkill(defLead, 'iron_wall') && defender.formation === 'turtle') {
    defFormBonus *= (1 + getSkillEffects(defLead.skills, 'turtle_defense'));
  }
  if (hasSkill(atkLead, 'ambush_master') && attacker.formation === 'ambush') {
    atkFormBonus *= (1 + getSkillEffects(atkLead.skills, 'ambush_formation'));
  }
  if (hasSkill(atkLead, 'cavalry') && terrain === 'plains') {
    atkFormBonus *= (1 + getSkillEffects(atkLead.skills, 'plains_combat'));
  }
  if (terrain === 'river') {
    if (hasSkill(atkLead, 'naval')) {
      atkFormBonus *= (1 + getSkillEffects(atkLead.skills, 'river_combat'));
    }
    if (hasSkill(defLead, 'naval')) {
      defFormBonus *= (1 + getSkillEffects(defLead.skills, 'river_combat'));
    }
  }

  if (terrain === 'plains') {
    atkFormBonus *= 1 + (atkTech.plainsBonus || 0);
    defFormBonus *= 1 + (defTech.plainsBonus || 0);
  }
  if (terrain === 'river') {
    atkFormBonus *= 1 + (atkTech.navalBonus || 0);
    defFormBonus *= 1 + (defTech.navalBonus || 0);
  }

  for (let round = 1; round <= maxRounds; round++) {
    const roundLog = { round, events: [] };

    // ── 계략 시도 (1라운드만) ──
    if (round === 1 && allowStratagems) {
      const stratagemResult = tryBestStratagem(atkLead, defLead, terrain, atkArmy, defArmy);
      if (stratagemResult) {
        stratagemUsed = stratagemResult;
        roundLog.events.push({
          type: 'stratagem',
          side: 'attacker',
          stratagem: stratagemResult.name,
          success: stratagemResult.success
        });

        if (stratagemResult.success) {
          if (stratagemResult.effect.armyDamage) {
            const dmg = Math.floor(defArmy * stratagemResult.effect.armyDamage);
            defArmy = Math.max(0, defArmy - dmg);
            roundLog.events.push({ type: 'damage', side: 'defender', amount: dmg, cause: 'stratagem' });
          }
          if (stratagemResult.effect.moraleDamage) {
            defMorale = Math.max(0, defMorale - stratagemResult.effect.moraleDamage);
          }
          if (stratagemResult.effect.formationBreak) {
            defFormBonus *= 0.7; // 진형 붕괴
          }
        }
      }

      // 수비 측도 계략 시도
      const defStratagem = tryBestStratagem(defLead, atkLead, terrain, defArmy, atkArmy);
      if (defStratagem) {
        roundLog.events.push({
          type: 'stratagem',
          side: 'defender',
          stratagem: defStratagem.name,
          success: defStratagem.success
        });

        if (defStratagem.success) {
          if (defStratagem.effect.armyDamage) {
            const dmg = Math.floor(atkArmy * defStratagem.effect.armyDamage);
            atkArmy = Math.max(0, atkArmy - dmg);
          }
          if (defStratagem.effect.moraleDamage) {
            atkMorale = Math.max(0, atkMorale - defStratagem.effect.moraleDamage);
          }
        }
      }
    }

    // ── 일기토 (1라운드만) ──
    if (round === 1 && allowDuels && attacker.generals?.length > 0 && defender.generals?.length > 0) {
      // 무력 상위 장수끼리
      const atkDuelist = attacker.generals.reduce((best, g) =>
        (g.stats?.war || 0) > (best.stats?.war || 0) ? g : best);
      const defDuelist = defender.generals.reduce((best, g) =>
        (g.stats?.war || 0) > (best.stats?.war || 0) ? g : best);

      const duel = resolveDuel(atkDuelist, defDuelist);
      duelOccurred = true;

      roundLog.events.push({
        type: 'duel',
        attackerGeneral: atkDuelist.id,
        defenderGeneral: defDuelist.id,
        winner: duel.winner,
        margin: duel.margin,
        loserInjured: duel.loserInjured
      });

      if (duel.winner === 'attacker') {
        atkMorale = Math.min(100, atkMorale + duel.moraleBonus);
        defMorale = Math.max(0, defMorale - duel.moraleBonus);
      } else {
        defMorale = Math.min(100, defMorale + duel.moraleBonus);
        atkMorale = Math.max(0, atkMorale - duel.moraleBonus);
      }
    }

    // ── 본대 교전 ──
    const atkPower = atkArmy
      * (atkMorale / 100)
      * (1 + atkLead.stats.command / 200)
      * (1 + atkLead.stats.war / 300)
      * (1 + (atkTech.combatAttack || 0) + (atkTech.rangedAttack || 0) + (atkTech.cavalryBonus || 0))
      * terrainMod.attack
      * atkFormation.attackMod
      * atkFormBonus;

    const siegeOffset = Math.max(0, (atkTech.siegeBonus || 0) - (defTech.siegeBonus || 0) * 0.5);
    const defBonus = Math.max(1, 1 + (defender.defense || 50) / 200 - siegeOffset);
    const defPower = defArmy
      * (defMorale / 100)
      * (1 + defLead.stats.command / 200)
      * (1 + defLead.stats.war / 300)
      * terrainMod.defense
      * defFormation.defenseMod
      * defFormBonus
      * defBonus;

    const total = atkPower + defPower;
    if (total === 0) break;

    const ratio = atkPower / total;

    // 라운드별 피해 (전체 전투의 일부)
    const roundIntensity = 0.15 + round * 0.05; // 라운드가 진행될수록 격렬
    const atkLoss = Math.floor(atkArmy * (1 - ratio) * roundIntensity);
    const defLoss = Math.floor(defArmy * ratio * roundIntensity);

    atkArmy = Math.max(0, atkArmy - atkLoss);
    defArmy = Math.max(0, defArmy - defLoss);

    // 사기 변동
    const moraleDelta = Math.floor((ratio - 0.5) * 15);
    atkMorale = Math.max(0, Math.min(100, atkMorale + moraleDelta));
    defMorale = Math.max(0, Math.min(100, defMorale - moraleDelta));

    roundLog.events.push({
      type: 'clash',
      attackerLoss: atkLoss,
      defenderLoss: defLoss,
      ratio: Math.round(ratio * 100) / 100,
      atkMorale: Math.round(atkMorale),
      defMorale: Math.round(defMorale)
    });

    rounds.push(roundLog);

    // ── 패주 판정 ──
    if (atkMorale <= 10 || atkArmy <= 0) {
      winner = 'defender';
      break;
    }
    if (defMorale <= 10 || defArmy <= 0) {
      winner = 'attacker';
      break;
    }

    // 사기 차이 크면 조기 종료
    if (atkMorale - defMorale > 40 && ratio > 0.6) {
      winner = 'attacker';
      break;
    }
    if (defMorale - atkMorale > 40 && ratio < 0.4) {
      winner = 'defender';
      break;
    }
  }

  // 최종 판정 (라운드 모두 소진 시)
  if (!winner) {
    if (atkArmy > defArmy * 1.2) winner = 'attacker';
    else if (defArmy > atkArmy * 1.2) winner = 'defender';
    else winner = 'draw';
  }

  // 퇴각 손실 계산
  const retreatLoss = terrainMod.retreatLoss || 0.05;
  let retreatCasualties = 0;
  if (winner === 'attacker') {
    retreatCasualties = Math.floor(defArmy * retreatLoss);
    defArmy = Math.max(0, defArmy - retreatCasualties);
  } else if (winner === 'defender') {
    retreatCasualties = Math.floor(atkArmy * retreatLoss);
    atkArmy = Math.max(0, atkArmy - retreatCasualties);
  }

  return {
    winner,
    rounds: rounds.length,
    attackerRemaining: atkArmy,
    defenderRemaining: defArmy,
    attackerLoss: attacker.army - atkArmy,
    defenderLoss: defender.army - defArmy,
    attackerMorale: Math.round(atkMorale),
    defenderMorale: Math.round(defMorale),
    retreatCasualties,
    duelOccurred,
    stratagemUsed: stratagemUsed ? {
      name: stratagemUsed.nameKo,
      success: stratagemUsed.success
    } : null,
    roundDetails: rounds,
    terrain,
    formations: {
      attacker: atkFormation.nameKo,
      defender: defFormation.nameKo
    }
  };
}

// ─── 계략 시도 ───

function tryBestStratagem(user, target, terrain, userArmy, targetArmy) {
  // 사용 가능한 계략 중 성공률 가장 높은 것 선택
  let best = null;
  let bestChance = 0;

  for (const [key, strat] of Object.entries(STRATAGEMS)) {
    // 능력치 요구 체크
    let canUse = true;
    for (const [stat, req] of Object.entries(strat.requirement)) {
      if ((user.stats?.[stat] || 0) < req) {
        canUse = false;
        break;
      }
    }
    if (!canUse) continue;

    // 성공 확률 계산
    let chance = strat.successBase + (user.stats?.intellect || 50) * strat.intellectScale;

    // 지형 보너스
    if (strat.terrainBonus[terrain]) {
      chance += strat.terrainBonus[terrain];
    }

    // 스킬 보너스 (화공 스킬 등)
    if (key === 'fire_attack') {
      chance += getSkillEffects(user.skills, 'fire_stratagem');
    }

    // 상대 방어 (counterStat)
    const counterVal = target.stats?.[strat.counterStat] || 50;
    chance -= counterVal * 0.003;

    // 간파 스킬로 계략 방어
    chance -= getSkillEffects(target.skills, 'counter_stratagem');

    chance = Math.max(0.05, Math.min(0.8, chance));

    if (chance > bestChance) {
      bestChance = chance;
      best = { key, ...strat, calculatedChance: chance };
    }
  }

  if (!best || bestChance < 0.15) return null;

  // 시도
  const success = Math.random() < bestChance;
  return {
    name: best.key,
    nameKo: best.nameKo,
    success,
    effect: success ? best.effect : {},
    chance: Math.round(bestChance * 100)
  };
}

// ─── 일기토 ───

/**
 * 장수 일기토 (1v1)
 */
export function resolveDuel(charA, charB) {
  let warA = (charA.stats?.war || 50) + Math.random() * 20 - 10;
  let warB = (charB.stats?.war || 50) + Math.random() * 20 - 10;

  // 일기토 스킬 보너스
  warA += getSkillEffects(charA?.skills, 'duel_war_bonus');
  warB += getSkillEffects(charB?.skills, 'duel_war_bonus');

  const margin = Math.abs(warA - warB);

  const winner = warA >= warB ? 'attacker' : 'defender';

  return {
    winner,
    margin: Math.round(margin),
    moraleBonus: Math.min(20, Math.floor(margin * 0.7)),
    loserInjured: margin > 25,
    loserKilled: margin > 45 && Math.random() < 0.2
  };
}

/**
 * 진형 선택 가능 여부 체크
 */
export function getAvailableFormations(generals) {
  const lead = generals?.[0];
  if (!lead) return ['standard'];

  const available = [];
  for (const [key, form] of Object.entries(FORMATIONS)) {
    let canUse = true;
    for (const [stat, req] of Object.entries(form.requirement)) {
      if ((lead.stats?.[stat] || 0) < req) {
        canUse = false;
        break;
      }
    }
    if (canUse) available.push(key);
  }
  return available;
}

/**
 * AI 진형 자동 선택
 */
export function chooseFormation(generals, terrain, isAttacker, armyRatio) {
  const available = getAvailableFormations(generals);
  const lead = generals?.[0];

  // 지형 우선
  if (terrain === 'river' && available.includes('river_defense') && !isAttacker) {
    return 'river_defense';
  }
  if ((terrain === 'forest' || terrain === 'mountain') && available.includes('ambush') && isAttacker) {
    return 'ambush';
  }

  // 병력 비율
  if (armyRatio > 1.5 && available.includes('surround')) return 'surround';
  if (armyRatio < 0.7 && available.includes('turtle')) return 'turtle';

  // 장수 특성
  if (lead) {
    if (lead.stats.war > 85 && available.includes('charge') && isAttacker) return 'charge';
    if (lead.stats.intellect > 80 && available.includes('ambush') && isAttacker) return 'ambush';
  }

  // 기본 돌격 (공격) / 방어 (수비)
  if (isAttacker && available.includes('charge')) return 'charge';
  if (!isAttacker && available.includes('turtle')) return 'turtle';

  return 'standard';
}
