#!/usr/bin/env node

import assert from 'node:assert/strict';

import { resolveCombat, resolveDuel } from '../../engine/core/combat.js';

function makeSequenceRandom(values) {
  let index = 0;
  return () => {
    const value = values[index];
    index += 1;
    if (typeof value !== 'number') {
      throw new Error(`sequence random exhausted at index ${index - 1}`);
    }
    return value;
  };
}

function runCombatFixtures() {
  const attacker = { army: 10000, morale: 90 };
  const defender = { army: 9000, morale: 85, defense: 60 };
  const attackerGeneral = { stats: { command: 82, war: 78, intellect: 65 } };
  const defenderGeneral = { stats: { command: 77, war: 74, intellect: 70 } };

  const land = resolveCombat(attacker, defender, {
    terrain: 'land',
    attackerGeneral,
    defenderGeneral,
  });
  const river = resolveCombat(attacker, defender, {
    terrain: 'river',
    attackerGeneral,
    defenderGeneral,
  });
  const mountain = resolveCombat(attacker, defender, {
    terrain: 'mountain',
    attackerGeneral,
    defenderGeneral,
  });
  const draw = resolveCombat(
    { army: 0, morale: 0 },
    { army: 0, morale: 0, defense: 0 },
    {}
  );

  assert.deepEqual(land, {
    winner: 'defender',
    ratio: 0.48,
    attackerLoss: 1553,
    defenderLoss: 1301,
    attackerMoraleDelta: -1,
    defenderMoraleDelta: 1,
    details: {
      powerA: 15989,
      powerD: 17171,
      terrain: 'land',
      terrainMod: 1,
      defenseBonus: 1.3,
    },
  });

  assert.deepEqual(river, {
    winner: 'defender',
    ratio: 0.43,
    attackerLoss: 1719,
    defenderLoss: 1152,
    attackerMoraleDelta: -3,
    defenderMoraleDelta: 3,
    details: {
      powerA: 12792,
      powerD: 17171,
      terrain: 'river',
      terrainMod: 0.8,
      defenseBonus: 1.3,
    },
  });

  assert.deepEqual(mountain, {
    winner: 'defender',
    ratio: 0.39,
    attackerLoss: 1816,
    defenderLoss: 1065,
    attackerMoraleDelta: -5,
    defenderMoraleDelta: 5,
    details: {
      powerA: 11193,
      powerD: 17171,
      terrain: 'mountain',
      terrainMod: 0.7,
      defenseBonus: 1.3,
    },
  });

  assert.deepEqual(draw, {
    winner: 'draw',
    attackerLoss: 0,
    defenderLoss: 0,
  });

  return { land, river, mountain, draw };
}

function runDuelFixtures() {
  const decisive = resolveDuel(
    { stats: { war: 95 } },
    { stats: { war: 70 } },
    { random: makeSequenceRandom([0.9, 0.1, 0.2]) }
  );
  const closeFight = resolveDuel(
    { stats: { war: 82 } },
    { stats: { war: 81 } },
    { random: makeSequenceRandom([0.55, 0.5, 0.9]) }
  );

  assert.deepEqual(decisive, {
    winner: 'a',
    margin: 23,
    moraleBonus: 20,
    loserInjured: false,
    loserKilled: false,
  });

  assert.deepEqual(closeFight, {
    winner: 'b',
    margin: 7,
    moraleBonus: 7,
    loserInjured: false,
    loserKilled: false,
  });

  return { decisive, closeFight };
}

function main() {
  const combat = runCombatFixtures();
  const duel = runDuelFixtures();
  const report = {
    trace_id: 'spark-combat-replay-001',
    phase_type: 'report',
    mutation_scope: 'product-core',
    touches_app_surface: false,
    combat,
    duel,
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
