#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { GameState } from '../../engine/core/game-state.js';
import { buildTurnSummary, executeTurnEvents, processPlayerChoice } from '../../engine/core/turn-loop.js';

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
  state.turn = 22;
  state.year = 208;
  state.month = 8;
  state.narrativeMode = 'history';
  state.firedEvents = [];
  state.turnLog = [];
  state.currentTurnLog = [];
  return state;
}

function buildTurnFixtures(state) {
  const playerFactionId = state.player.factionId;
  const playerCharId = state.player.characterId;
  const playerChar = state.getCharacter(playerCharId);
  const homeCityId = playerChar.city;
  const rivalFactionId = Object.keys(state.factions)
    .find((id) => id !== playerFactionId && state.getFaction(id)?.active);
  const rivalFaction = state.getFaction(rivalFactionId);
  const rivalCityId = state.getCitiesOfFaction(rivalFactionId)[0].id;

  return {
    context: {
      playerFactionId,
      playerCharId,
      homeCityId,
      rivalFactionId,
      rivalLeaderId: rivalFaction.leader,
      rivalCityId,
    },
    events: [
      {
        id: 'qa_turn_player_petition',
        name: 'Supply Petition',
        mode: 'history',
        participants: [{ character_id: playerCharId }],
        period: { year: 208 },
        trigger: {
          priority: 95,
          conditions: [
            { type: 'character_alive', params: { character_id: playerCharId } },
            { type: 'faction_controls', params: { faction: playerFactionId, territory: homeCityId } },
          ],
        },
        effects: [
          { type: 'reputation_change', target: playerFactionId, value: { delta: 1 } },
        ],
        choices: [
          {
            id: 'approve_petition',
            text: '보급 청원을 승인한다',
            effects: [
              { type: 'gold_change', target: playerFactionId, value: { delta: 180 } },
            ],
          },
        ],
      },
      {
        id: 'qa_turn_ai_requisition',
        name: 'Frontline Requisition',
        mode: 'history',
        participants: [{ character_id: rivalFaction.leader }],
        period: { year: 208 },
        trigger: {
          priority: 85,
          conditions: [
            { type: 'faction_controls', params: { faction: rivalFactionId, territory: rivalCityId } },
          ],
        },
        effects: [
          { type: 'gold_change', target: rivalFactionId, value: { delta: 90 } },
        ],
        choices: [
          {
            id: 'reinforce_front',
            text: '전선을 강화한다',
            effects: [
              { type: 'reputation_change', target: rivalFactionId, value: { delta: 2 } },
            ],
          },
        ],
      },
      {
        id: 'qa_turn_random_filtered',
        name: 'Random Filtered Petition',
        mode: 'history',
        participants: [{ character_id: playerCharId }],
        period: { year: 208 },
        trigger: {
          priority: 82,
          conditions: [
            { type: 'character_alive', params: { character_id: playerCharId } },
            { type: 'random_chance', params: { probability: 0.2 } },
          ],
        },
        effects: [
          { type: 'gold_change', target: playerFactionId, value: { delta: 999 } },
        ],
      },
      {
        id: 'qa_turn_player_decree',
        name: 'Granary Decree',
        mode: 'history',
        participants: [{ character_id: playerCharId }],
        period: { year: 208 },
        trigger: {
          priority: 74,
          conditions: [
            { type: 'character_alive', params: { character_id: playerCharId } },
          ],
        },
        effects: [
          { type: 'gold_change', target: playerFactionId, value: { delta: 50 } },
        ],
      },
      {
        id: 'qa_turn_ai_overflow',
        name: 'Overflow Draft',
        mode: 'history',
        participants: [{ character_id: rivalFaction.leader }],
        period: { year: 208 },
        trigger: {
          priority: 64,
          conditions: [
            { type: 'faction_controls', params: { faction: rivalFactionId, territory: rivalCityId } },
          ],
        },
        effects: [
          { type: 'gold_change', target: rivalFactionId, value: { delta: 400 } },
        ],
      },
    ],
  };
}

async function runExecuteFixtures() {
  const state = await createState();
  const { context, events } = buildTurnFixtures(state);
  const playerFaction = state.getFaction(context.playerFactionId);
  const rivalFaction = state.getFaction(context.rivalFactionId);
  const before = {
    playerGold: playerFaction.gold,
    playerReputation: playerFaction.reputation,
    rivalGold: rivalFaction.gold,
    rivalReputation: rivalFaction.reputation,
  };

  const playerEvents = executeTurnEvents(state, events, {
    random: makeSequenceRandom([0.91]),
  });

  assert.deepEqual(
    playerEvents.map((event) => event.id),
    ['qa_turn_player_petition', 'qa_turn_player_decree']
  );
  assert.deepEqual(state.firedEvents, ['qa_turn_ai_requisition']);
  assert.equal(playerFaction.gold, before.playerGold);
  assert.equal(playerFaction.reputation, before.playerReputation);
  assert.equal(rivalFaction.gold, before.rivalGold + 90);
  assert.equal(rivalFaction.reputation, before.rivalReputation + 2);
  assert.equal(state.turnSummary.turn, state.turn);
  assert.deepEqual(
    state.turnSummary.majorEvents.map((event) => event.eventId),
    ['qa_turn_ai_requisition']
  );
  assert.ok(state.currentTurnLog.some((entry) => entry.type === 'event'));
  assert.ok(state.currentTurnLog.some((entry) => entry.type === 'ai_choice'));
  assert.equal(state.firedEvents.includes('qa_turn_random_filtered'), false);
  assert.equal(state.firedEvents.includes('qa_turn_ai_overflow'), false);

  const timeline = buildTurnSummary(state);
  assert.equal(timeline.length, 1);
  assert.match(timeline[0].text, /Frontline Requisition/);

  return {
    returned_player_event_ids: playerEvents.map((event) => event.id),
    fired_events: state.firedEvents,
    ai_event_count: state.turnSummary.majorEvents.length,
    rival_gold_delta: rivalFaction.gold - before.rivalGold,
    rival_reputation_delta: rivalFaction.reputation - before.rivalReputation,
    timeline_text: timeline[0].text,
  };
}

async function runChoiceFixtures() {
  const state = await createState();
  const { context, events } = buildTurnFixtures(state);
  const playerFaction = state.getFaction(context.playerFactionId);
  const before = {
    playerGold: playerFaction.gold,
    playerReputation: playerFaction.reputation,
  };

  const playerEvents = executeTurnEvents(state, events, {
    random: makeSequenceRandom([0.91]),
  });

  processPlayerChoice(state, playerEvents[0], 'approve_petition');
  processPlayerChoice(state, playerEvents[1]);

  const eventIds = state.turnSummary.majorEvents.map((event) => event.eventId);
  const choiceLog = state.currentTurnLog.find((entry) => entry.type === 'player_choice');
  const timeline = buildTurnSummary(state)
    .filter((entry) => entry.type === 'event')
    .map((entry) => entry.text);

  assert.deepEqual(eventIds, [
    'qa_turn_ai_requisition',
    'qa_turn_player_petition',
    'qa_turn_player_decree',
  ]);
  assert.deepEqual(state.firedEvents, [
    'qa_turn_ai_requisition',
    'qa_turn_player_petition',
    'qa_turn_player_decree',
  ]);
  assert.equal(playerFaction.gold, before.playerGold + 230);
  assert.equal(playerFaction.reputation, before.playerReputation + 1);
  assert.equal(state.turnSummary.majorEvents[1].playerChoice, 'approve_petition');
  assert.equal(state.turnSummary.majorEvents[2].playerChoice, null);
  assert.ok(choiceLog);
  assert.match(choiceLog.message, /보급 청원을 승인한다/);
  assert.deepEqual(timeline, [
    '중대 이벤트: Frontline Requisition',
    '중대 이벤트: Supply Petition',
    '중대 이벤트: Granary Decree',
  ]);

  return {
    fired_events: state.firedEvents,
    player_gold_delta: playerFaction.gold - before.playerGold,
    player_reputation_delta: playerFaction.reputation - before.playerReputation,
    player_choice: state.turnSummary.majorEvents[1].playerChoice,
    timeline,
  };
}

async function main() {
  const execute = await runExecuteFixtures();
  const choices = await runChoiceFixtures();

  console.log(JSON.stringify({
    trace_id: 'spark-turn-loop-replay-001',
    phase_type: 'report',
    mutation_scope: 'product-core',
    touches_app_surface: false,
    execute,
    choices,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
