#!/usr/bin/env node

import assert from 'node:assert/strict';

import { GameState } from '../../engine/core/game-state.js';
import {
  aiDiplomacy,
  calculateDiplomacyChance,
  proposeAlliance,
  proposePeace,
  threaten,
} from '../../engine/core/diplomacy.js';

function makeSequenceRandom(values) {
  const queue = [...values];
  return () => {
    if (!queue.length) {
      throw new Error('random sequence exhausted');
    }
    return queue.shift();
  };
}

function assertApprox(actual, expected, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${expected}, received ${actual}`
  );
}

function createScenario() {
  return {
    year: 208,
    month: 7,
    playerFaction: 'shu',
    playerCharacter: 'liu_bei',
    cities: {
      chengdu: {
        name: 'Chengdu',
        owner: 'shu',
        army: 18000,
        agriculture: 70,
        commerce: 62,
        technology: 48,
        publicOrder: 78,
      },
      yongan: {
        name: 'Yongan',
        owner: 'shu',
        army: 7000,
        agriculture: 58,
        commerce: 45,
        technology: 32,
        publicOrder: 69,
      },
      jianye: {
        name: 'Jianye',
        owner: 'wu',
        army: 15000,
        agriculture: 66,
        commerce: 68,
        technology: 44,
        publicOrder: 72,
      },
      chai_sang: {
        name: 'Chaisang',
        owner: 'wu',
        army: 8000,
        agriculture: 60,
        commerce: 50,
        technology: 38,
        publicOrder: 67,
      },
      xuchang: {
        name: 'Xuchang',
        owner: 'wei',
        army: 22000,
        agriculture: 74,
        commerce: 70,
        technology: 52,
        publicOrder: 75,
      },
      ye: {
        name: 'Ye',
        owner: 'wei',
        army: 19000,
        agriculture: 68,
        commerce: 63,
        technology: 47,
        publicOrder: 70,
      },
      luoyang: {
        name: 'Luoyang',
        owner: 'wei',
        army: 18000,
        agriculture: 71,
        commerce: 66,
        technology: 50,
        publicOrder: 74,
      },
      hefei: {
        name: 'Hefei',
        owner: 'wei',
        army: 14000,
        agriculture: 59,
        commerce: 52,
        technology: 39,
        publicOrder: 68,
      },
      youzhou: {
        name: 'Youzhou',
        owner: 'yan',
        army: 4000,
        agriculture: 42,
        commerce: 31,
        technology: 20,
        publicOrder: 55,
      },
    },
    factions: {
      shu: {
        name: 'Shu',
        leader: 'liu_bei',
        tactician: 'zhuge_liang',
        gold: 12000,
        reputation: 130,
        allies: [],
        enemies: ['wei'],
        truces: {},
        active: true,
        research: { completed: ['diplomacy_school'], current: null },
      },
      wu: {
        name: 'Wu',
        leader: 'sun_quan',
        tactician: 'zhou_yu',
        gold: 9000,
        reputation: 112,
        allies: [],
        enemies: ['wei'],
        truces: {},
        active: true,
        research: { completed: [], current: null },
      },
      wei: {
        name: 'Wei',
        leader: 'cao_cao',
        tactician: 'xun_yu',
        gold: 18000,
        reputation: 105,
        allies: [],
        enemies: ['shu', 'wu'],
        truces: {},
        active: true,
        research: { completed: [], current: null },
      },
      yan: {
        name: 'Yan',
        leader: 'gongsun_du',
        tactician: 'gongsun_kang',
        gold: 3000,
        reputation: 90,
        allies: [],
        enemies: [],
        truces: {},
        active: true,
        research: { completed: [], current: null },
      },
    },
    characters: {
      liu_bei: {
        alive: true,
        status: 'active',
        city: 'chengdu',
        faction: 'shu',
        experience: 0,
        level: 1,
        potential: { command: 88, war: 82, intellect: 81, politics: 78, charisma: 95 },
        stats: { command: 82, war: 75, intellect: 78, politics: 72, charisma: 92 },
      },
      zhuge_liang: {
        alive: true,
        status: 'active',
        city: 'chengdu',
        faction: 'shu',
        experience: 0,
        level: 1,
        potential: { command: 82, war: 55, intellect: 99, politics: 98, charisma: 86 },
        stats: { command: 74, war: 42, intellect: 98, politics: 97, charisma: 81 },
      },
      sun_quan: {
        alive: true,
        status: 'active',
        city: 'jianye',
        faction: 'wu',
        experience: 0,
        level: 1,
        potential: { command: 84, war: 74, intellect: 76, politics: 79, charisma: 88 },
        stats: { command: 78, war: 70, intellect: 74, politics: 75, charisma: 85 },
      },
      zhou_yu: {
        alive: true,
        status: 'active',
        city: 'jianye',
        faction: 'wu',
        experience: 0,
        level: 1,
        potential: { command: 90, war: 86, intellect: 95, politics: 84, charisma: 82 },
        stats: { command: 86, war: 82, intellect: 92, politics: 78, charisma: 80 },
      },
      cao_cao: {
        alive: true,
        status: 'active',
        city: 'xuchang',
        faction: 'wei',
        experience: 0,
        level: 1,
        potential: { command: 92, war: 83, intellect: 90, politics: 91, charisma: 88 },
        stats: { command: 90, war: 78, intellect: 88, politics: 89, charisma: 84 },
      },
      xun_yu: {
        alive: true,
        status: 'active',
        city: 'xuchang',
        faction: 'wei',
        experience: 0,
        level: 1,
        potential: { command: 75, war: 40, intellect: 96, politics: 94, charisma: 70 },
        stats: { command: 62, war: 35, intellect: 94, politics: 91, charisma: 64 },
      },
      gongsun_du: {
        alive: true,
        status: 'active',
        city: 'youzhou',
        faction: 'yan',
        experience: 0,
        level: 1,
        potential: { command: 70, war: 68, intellect: 63, politics: 61, charisma: 58 },
        stats: { command: 60, war: 62, intellect: 58, politics: 56, charisma: 52 },
      },
      gongsun_kang: {
        alive: true,
        status: 'active',
        city: 'youzhou',
        faction: 'yan',
        experience: 0,
        level: 1,
        potential: { command: 68, war: 66, intellect: 72, politics: 65, charisma: 59 },
        stats: { command: 58, war: 55, intellect: 66, politics: 59, charisma: 54 },
      },
    },
    relationships: [
      { a: 'liu_bei', b: 'sun_quan', type: 'friendship', intensity: 70 },
      { a: 'liu_bei', b: 'cao_cao', type: 'enmity', intensity: 90 },
      { a: 'sun_quan', b: 'cao_cao', type: 'rivalry', intensity: 75 },
    ],
  };
}

function makeState(mutator) {
  const state = new GameState(createScenario());
  if (typeof mutator === 'function') {
    mutator(state);
  }
  return state;
}

const allianceState = makeState();
const allianceChance = calculateDiplomacyChance('shu', 'wu', 'alliance', allianceState);
assertApprox(allianceChance.chance, 0.8320000000000001);
assertApprox(allianceChance.factors.base, 0.25);
assertApprox(allianceChance.factors.reputation, 0.09);
assertApprox(allianceChance.factors.tech, 0.1);
assertApprox(allianceChance.factors.tactician, 0.042);
assertApprox(allianceChance.factors.relationship, 0.15);
assertApprox(allianceChance.factors.commonEnemy, 0.2);

const allianceResult = proposeAlliance('shu', 'wu', allianceState, {
  random: makeSequenceRandom([0.4]),
});
assert.equal(allianceResult.success, true);
assert.equal(allianceState.isAllied('shu', 'wu'), true);
assert.equal(allianceState.getFaction('shu').reputation, 145);
assert.equal(allianceState.getFaction('wu').reputation, 117);
assert.equal(allianceState.turnSummary.majorEvents.at(-1).type, 'alliance');

const peaceState = makeState();
const peaceChance = calculateDiplomacyChance('shu', 'wei', 'peace', peaceState);
assertApprox(peaceChance.chance, 0.382);
assert.equal(peaceChance.factors.relationship, -0.25);
assert.equal(peaceChance.factors.warWeariness, 0.1);

const peaceResult = proposePeace('shu', 'wei', peaceState, {
  random: makeSequenceRandom([0.2]),
});
assert.equal(peaceResult.success, true);
assert.equal(peaceState.isAtWar('shu', 'wei'), false);
assert.equal(peaceState.hasTruce('shu', 'wei'), true);
assert.equal(peaceState.getFaction('shu').reputation, 137);
assert.equal(peaceState.getFaction('wei').reputation, 110);
assert.equal(peaceState.turnSummary.majorEvents.at(-1).type, 'peace');

const threatenState = makeState();
const threatenChance = calculateDiplomacyChance('wei', 'yan', 'threaten', threatenState);
assertApprox(threatenChance.chance, 0.95);
assertApprox(threatenChance.factors.reputation, 0.015);
assertApprox(threatenChance.factors.tactician, 0.036000000000000004);
assertApprox(threatenChance.factors.targetReputation, 0.02);
assert.ok(threatenChance.factors.powerRatio > 2.5);

const threatenResult = threaten('wei', 'yan', threatenState, {
  random: makeSequenceRandom([0.3]),
});
assert.equal(threatenResult.success, true);
assert.equal(threatenResult.tribute, 600);
assert.equal(threatenState.getFaction('wei').gold, 18600);
assert.equal(threatenState.getFaction('yan').gold, 2400);
assert.equal(threatenState.getFaction('wei').reputation, 100);

const aiState = makeState((state) => {
  state.factions.wu.enemies = [];
  state.factions.shu.enemies = [];
  state.factions.wei.enemies = [];
});
const aiActions = aiDiplomacy(
  'wu',
  aiState,
  { diplomacy: 1.1, attack: 1.0 },
  { random: makeSequenceRandom([0.2, 0.2]) }
);
assert.equal(aiActions.length, 1);
assert.equal(aiActions[0].action, 'alliance');
assert.equal(aiActions[0].target, 'shu');
assert.equal(aiState.isAllied('wu', 'shu'), true);

console.log(JSON.stringify({
  trace_id: 'spark-diplomacy-replay-001',
  phase_type: 'report',
  mutation_scope: 'product-core',
  touches_app_surface: false,
  fixtures: {
    alliance: {
      chance: Number(allianceChance.chance.toFixed(3)),
      result: allianceResult.success,
      reputations: {
        shu: allianceState.getFaction('shu').reputation,
        wu: allianceState.getFaction('wu').reputation,
      },
    },
    peace: {
      chance: Number(peaceChance.chance.toFixed(3)),
      result: peaceResult.success,
      truce_until: peaceState.getFaction('shu').truces.wei,
    },
    threaten: {
      chance: Number(threatenChance.chance.toFixed(3)),
      result: threatenResult.success,
      tribute: threatenResult.tribute,
    },
    ai: {
      action: aiActions[0].action,
      target: aiActions[0].target,
      message: aiActions[0].message,
    },
  },
}, null, 2));
