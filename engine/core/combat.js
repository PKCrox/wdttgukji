// Combat — 전투 자동 해결

const TERRAIN_MODS = {
  land: 1.0,
  river: 0.8,    // 강 건너기 → 공격 측 불리
  mountain: 0.7  // 산지 → 공격 측 불리
};

function defaultRandom() {
  return Math.random();
}

export function resolveCombat(attacker, defender, options = {}) {
  const terrain = options.terrain || 'land';
  const terrainMod = TERRAIN_MODS[terrain] || 1.0;

  // 공격측 전투력
  const atkGeneral = options.attackerGeneral || { stats: { command: 50, war: 50, intellect: 50 } };
  const defGeneral = options.defenderGeneral || { stats: { command: 50, war: 50, intellect: 50 } };

  const powerA = attacker.army
    * (attacker.morale / 100)
    * (1 + atkGeneral.stats.command / 200)
    * (1 + atkGeneral.stats.war / 300)
    * terrainMod;

  // 수비측 전투력 (방어 보정)
  const defenseBonus = 1 + (defender.defense || 50) / 200;
  const powerD = defender.army
    * (defender.morale / 100)
    * (1 + defGeneral.stats.command / 200)
    * (1 + defGeneral.stats.war / 300)
    * defenseBonus;

  const total = powerA + powerD;
  if (total === 0) return { winner: 'draw', attackerLoss: 0, defenderLoss: 0 };

  const ratio = powerA / total;

  // 승패
  const attackerWins = ratio > 0.5;

  // 피해 계산 — 패자가 더 많이 잃음
  const baseCasualty = 0.3;
  const attackerLoss = Math.floor(attacker.army * (1 - ratio) * baseCasualty);
  const defenderLoss = Math.floor(defender.army * ratio * baseCasualty);

  // 사기 변동
  const moraleDelta = Math.floor((ratio - 0.5) * 40);

  return {
    winner: attackerWins ? 'attacker' : 'defender',
    ratio: Math.round(ratio * 100) / 100,
    attackerLoss,
    defenderLoss,
    attackerMoraleDelta: moraleDelta,
    defenderMoraleDelta: -moraleDelta,
    details: {
      powerA: Math.round(powerA),
      powerD: Math.round(powerD),
      terrain,
      terrainMod,
      defenseBonus: Math.round(defenseBonus * 100) / 100
    }
  };
}

// 일기토 (1v1) — 장수 무력 비교 + 랜덤
// options.random 주입으로 replay harness에서 결정적 검증이 가능하다.
export function resolveDuel(charA, charB, options = {}) {
  const random = typeof options.random === 'function' ? options.random : defaultRandom;
  const loserKilledRoll = typeof options.loserKilledRoll === 'number' ? options.loserKilledRoll : random();
  const warA = charA.stats.war + random() * 20 - 10;
  const warB = charB.stats.war + random() * 20 - 10;
  const winner = warA >= warB ? 'a' : 'b';
  const margin = Math.abs(warA - warB);

  return {
    winner,
    margin: Math.round(margin),
    moraleBonus: Math.min(20, Math.floor(margin)),
    // 큰 차이 → 패자 부상/사망 가능
    loserInjured: margin > 30,
    loserKilled: margin > 50 && loserKilledRoll < 0.3
  };
}
