#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { GameState } from '../../engine/core/game-state.js';
import { applyEffects, checkEvents, evaluateTrigger } from '../../engine/core/event-engine.js';

const SCENARIO_URL = new URL('../../engine/data/scenarios/208-red-cliffs.json', import.meta.url);

function makeSequenceRandom(values) {
  const queue = [...values];
  return () => {
    if (!queue.length) {
      throw new Error('random sequence exhausted');
    }
    return queue.shift();
  };
}

async function createState() {
  const raw = await readFile(SCENARIO_URL, 'utf8');
  const scenario = JSON.parse(raw);
  const state = new GameState(scenario);
  state.turn = 12;
  state.year = 208;
  state.month = 5;
  state.narrativeMode = 'history';
  return state;
}

function buildTriggerFixture(homeCityId) {
  return {
    id: 'qa_event_random_probe',
    name: 'QA Event Random Probe',
    period: { year: 208 },
    trigger: {
      priority: 70,
      conditions: [
        {
          type: 'character_alive',
          params: { character_id: 'liu_bei' },
        },
        {
          type: 'faction_controls',
          params: { faction: 'shu', territory: homeCityId },
        },
        {
          type: 'random_chance',
          params: { probability: 0.4 },
        },
      ],
    },
  };
}

async function runTriggerFixtures() {
  const state = await createState();
  const homeCityId = state.getCharacter(state.player.characterId).city;
  const triggerFixture = buildTriggerFixture(homeCityId);

  assert.equal(
    evaluateTrigger(triggerFixture, state, { random: makeSequenceRandom([0.2]) }),
    true
  );
  assert.equal(
    evaluateTrigger(triggerFixture, state, { random: makeSequenceRandom([0.8]) }),
    false
  );

  state.firedEvents.push(triggerFixture.id);
  assert.equal(
    evaluateTrigger(triggerFixture, state, { random: makeSequenceRandom([0.1]) }),
    false
  );

  const stateForPeriod = await createState();
  assert.equal(
    evaluateTrigger({
      id: 'qa_event_period_guard',
      name: 'QA Event Period Guard',
      period: { year: 220 },
      trigger: {
        priority: 10,
        conditions: [
          {
            type: 'character_alive',
            params: { character_id: 'liu_bei' },
          },
        ],
      },
    }, stateForPeriod),
    false
  );

  return {
    random_pass_probability: 0.4,
    random_success_roll: 0.2,
    random_failure_roll: 0.8,
    fired_event_guard: true,
    period_guard: true,
  };
}

async function runOrderingFixtures() {
  const state = await createState();
  const homeCityId = state.getCharacter(state.player.characterId).city;
  const events = [
    {
      id: 'qa_low_priority',
      name: 'Low Priority Stable Event',
      mode: 'history',
      trigger: {
        priority: 30,
        conditions: [
          {
            type: 'character_alive',
            params: { character_id: 'liu_bei' },
          },
        ],
      },
    },
    {
      id: 'qa_random_priority',
      name: 'Random Priority Event',
      mode: 'history',
      trigger: {
        priority: 90,
        conditions: [
          {
            type: 'faction_controls',
            params: { faction: 'shu', territory: homeCityId },
          },
          {
            type: 'random_chance',
            params: { probability: 0.5 },
          },
        ],
      },
    },
    {
      id: 'qa_romance_only',
      name: 'Romance Only Event',
      mode: 'romance',
      trigger: {
        priority: 99,
        conditions: [
          {
            type: 'character_alive',
            params: { character_id: 'liu_bei' },
          },
        ],
      },
    },
    {
      id: 'qa_random_filtered',
      name: 'Random Filtered Event',
      mode: 'history',
      trigger: {
        priority: 80,
        conditions: [
          {
            type: 'random_chance',
            params: { probability: 0.1 },
          },
        ],
      },
    },
  ];

  const triggered = checkEvents(events, state, {
    random: makeSequenceRandom([0.2, 0.7]),
  });

  assert.deepEqual(
    triggered.map((event) => event.id),
    ['qa_random_priority', 'qa_low_priority']
  );

  return {
    ordered_ids: triggered.map((event) => event.id),
    top_priority: triggered[0].trigger.priority,
    filtered: {
      romance_mode_blocked: true,
      random_failure_blocked: true,
    },
  };
}

async function runEffectFixtures() {
  const state = await createState();
  const shuFaction = state.getFaction('shu');
  const weiFaction = state.getFaction('wei');
  const liuBei = state.getCharacter('liu_bei');
  const initialRelationship = state.getRelationship('liu_bei', 'sun_quan');
  const firstShuCityId = state.getCitiesOfFaction('shu')[0].id;
  const firstShuCity = state.getCity(firstShuCityId);
  const largestShuCityId = state.getCitiesOfFaction('shu')
    .sort((left, right) => right.army - left.army)[0].id;
  const largestShuCity = state.getCity(largestShuCityId);

  const before = {
    gold: shuFaction.gold,
    reputation: shuFaction.reputation,
    tech: shuFaction.tech,
    liuBeiCommand: liuBei.stats.command,
    relationshipIntensity: initialRelationship?.intensity ?? null,
    commerce: firstShuCity.commerce,
    army: largestShuCity.army,
    morale: largestShuCity.morale ?? 0,
  };

  largestShuCity.morale = before.morale;

  applyEffects([
    { type: 'gold_change', target: 'shu', value: { delta: 400 } },
    { type: 'reputation_change', target: 'shu', value: { delta: 7 } },
    { type: 'stat_change', target: 'liu_bei', value: { stat: 'command', delta: 2 } },
    { type: 'relationship_change', target: 'liu_bei', value: { with: 'sun_quan', type: 'friendship', delta: 8 } },
    { type: 'resource_change', target: 'shu', value: { resource: 'commerce', delta: 5 } },
    { type: 'army_change', target: 'shu', value: { delta: 1200, morale: 6 } },
    { type: 'faction_peace', target: 'shu', value: 'wei' },
    { type: 'unlock_tech', target: 'shu' },
  ], state);

  const relationship = state.getRelationship('liu_bei', 'sun_quan');
  assert.equal(shuFaction.gold, before.gold + 400);
  assert.equal(shuFaction.reputation, before.reputation + 7);
  assert.equal(liuBei.stats.command, before.liuBeiCommand + 2);
  assert.equal(
    relationship.intensity,
    before.relationshipIntensity == null ? 8 : before.relationshipIntensity + 8
  );
  assert.equal(firstShuCity.commerce, before.commerce + 5);
  assert.equal(largestShuCity.army, before.army + 1200);
  assert.equal(largestShuCity.morale, before.morale + 6);
  assert.equal(state.isAtWar('shu', 'wei'), false);
  assert.ok(state.hasTruce('shu', 'wei'));
  assert.equal(shuFaction.tech, Math.min(10, before.tech + 1));
  const logTypes = new Set(state.currentTurnLog.map((entry) => entry.type));
  assert.ok(logTypes.has('effect'));
  assert.ok(logTypes.has('army'));
  assert.ok(logTypes.has('peace'));
  assert.ok(logTypes.has('tech'));

  assert.equal(weiFaction.enemies.includes('shu'), false);

  return {
    first_shu_city_id: firstShuCityId,
    largest_shu_city_id: largestShuCityId,
    gold_delta: shuFaction.gold - before.gold,
    reputation_delta: shuFaction.reputation - before.reputation,
    command_delta: liuBei.stats.command - before.liuBeiCommand,
    relationship_delta: relationship.intensity - (before.relationshipIntensity ?? 0),
    commerce_delta: firstShuCity.commerce - before.commerce,
    army_delta: largestShuCity.army - before.army,
    morale_delta: largestShuCity.morale - before.morale,
    truce_until: shuFaction.truces.wei,
    tech_level: shuFaction.tech,
    log_entries: state.currentTurnLog.length,
    log_types: [...logTypes].sort(),
  };
}

async function runTerritoryFixtures() {
  const defenseState = await createState();
  const playerCityId = defenseState.getCharacter(defenseState.player.characterId).city;
  const playerCity = defenseState.getCity(playerCityId);
  playerCity.army = 10000;
  playerCity.morale = 70;

  applyEffects([
    { type: 'territory_change', target: 'wei', value: { city: playerCityId, action: 'capture' } },
  ], defenseState);

  assert.equal(defenseState.getCity(playerCityId).owner, defenseState.player.factionId);
  assert.equal(defenseState.getCity(playerCityId).army, 8500);
  assert.equal(defenseState.getCity(playerCityId).morale, 60);

  const captureState = await createState();
  const capturedCityId = captureState.getCitiesOfFaction('wei')[0].id;
  applyEffects([
    { type: 'territory_change', target: 'shu', value: { city: capturedCityId, action: 'capture' } },
  ], captureState);

  assert.equal(captureState.getCity(capturedCityId).owner, 'shu');

  return {
    defended_player_city_id: playerCityId,
    defended_player_city_army: defenseState.getCity(playerCityId).army,
    defended_player_city_morale: defenseState.getCity(playerCityId).morale,
    captured_enemy_city_id: capturedCityId,
    captured_enemy_city_owner: captureState.getCity(capturedCityId).owner,
  };
}

async function main() {
  const triggers = await runTriggerFixtures();
  const ordering = await runOrderingFixtures();
  const effects = await runEffectFixtures();
  const territory = await runTerritoryFixtures();

  console.log(JSON.stringify({
    trace_id: 'spark-event-engine-replay-001',
    phase_type: 'report',
    mutation_scope: 'product-core',
    touches_app_surface: false,
    triggers,
    ordering,
    effects,
    territory,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
