#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { GameState } from '../../engine/core/game-state.js';

const SCENARIO_URL = new URL('../../engine/data/scenarios/208-red-cliffs.json', import.meta.url);

function createLegacySaveFixture() {
  return {
    turn: 7,
    year: 208,
    month: 4,
    player: {
      factionId: 'shu',
      characterId: 'liu_bei',
    },
    cities: {
      chengdu: {
        name: 'Chengdu',
        owner: 'shu',
        economy: 56,
      },
      xuchang: {
        name: 'Xuchang',
        owner: 'wei',
        economy: 64,
      },
    },
    factions: {
      shu: {
        name: 'Shu',
        leader: 'liu_bei',
        active: true,
        allies: [],
        enemies: ['wei'],
      },
      wei: {
        name: 'Wei',
        leader: 'cao_cao',
        active: true,
        allies: [],
        enemies: ['shu'],
      },
    },
    characters: {
      liu_bei: {
        alive: true,
        city: 'chengdu',
        faction: 'shu',
        stats: {
          command: 82,
          war: 75,
          intellect: 78,
          politics: 72,
          charisma: 92,
        },
      },
      zhuge_liang: {
        alive: true,
        city: 'chengdu',
        faction: 'shu',
        stats: {
          command: 74,
          war: 42,
          intellect: 98,
          politics: 97,
          charisma: 81,
        },
      },
      cao_cao: {
        alive: true,
        city: 'xuchang',
        faction: 'wei',
        stats: {
          command: 90,
          war: 78,
          intellect: 88,
          politics: 89,
          charisma: 84,
        },
      },
    },
    relationships: [],
  };
}

function buildRoundTripSnapshot(state, context) {
  const faction = state.getFaction(context.playerFactionId);
  const leader = state.getCharacter(context.leaderId);
  const city = state.getCity(context.homeCityId);

  return {
    turn: state.turn,
    year: state.year,
    month: state.month,
    actionsRemaining: state.actionsRemaining,
    player: state.player,
    firedEvents: state.firedEvents,
    connectionTerrain: state.connectionTerrains[context.connectionKey],
    diplomacyLog: state.diplomacyLog,
    aiState: state.aiState[context.playerFactionId],
    turnSummary: state.turnSummary,
    faction: {
      reputation: faction.reputation,
      truces: faction.truces,
      research: faction.research,
      inventory: faction.inventory,
    },
    city: {
      buildings: city.buildings,
      policy: state.getCityPolicy(context.homeCityId),
    },
    leader: {
      experience: leader.experience,
      level: leader.level,
      skills: leader.skills,
      equipment: leader.equipment,
      potential: leader.potential,
    },
  };
}

async function loadScenario() {
  const raw = await readFile(SCENARIO_URL, 'utf8');
  return JSON.parse(raw);
}

async function runScenarioRoundTrip() {
  const scenario = await loadScenario();
  const state = new GameState(scenario);

  const playerFactionId = state.player.factionId;
  const leaderId = state.player.characterId;
  const homeCityId = state.getCharacter(leaderId).city;
  const rivalFactionId = Object.keys(state.factions)
    .find((id) => id !== playerFactionId && state.getFaction(id)?.active);
  const rivalCityId = state.getCitiesOfFaction(rivalFactionId)[0].id;
  const connectionKey = `${homeCityId}:${rivalCityId}`;

  state.turn = 18;
  state.year = 209;
  state.month = 6;
  state.actionsRemaining = 1;
  state.firedEvents.push('qa_save_load_round_trip');
  state.turnLog.push({
    turn: 17,
    year: 209,
    month: 5,
    message: 'previous turn snapshot',
    type: 'info',
  });
  state.currentTurnLog.push({
    turn: 18,
    year: 209,
    month: 6,
    message: 'round trip mutation probe',
    type: 'qa',
  });
  state.connectionTerrains[connectionKey] = 'river';
  state.diplomacyLog.push({
    turn: state.turn,
    type: 'probe_alliance',
    fromFaction: playerFactionId,
    toFaction: rivalFactionId,
    result: 'accepted',
  });

  state.ensureAIState(playerFactionId);
  state.aiState[playerFactionId].posture = 'assault';
  state.aiState[playerFactionId].targetFactionId = rivalFactionId;
  state.aiState[playerFactionId].targetCityId = rivalCityId;
  state.aiState[playerFactionId].stagingCityId = homeCityId;
  state.aiState[playerFactionId].turnsSinceWar = 3;
  state.aiState[playerFactionId].pressureScore = 88;

  state.setCityPolicy(homeCityId, {
    domesticFocus: 'commerce',
    militaryPosture: 'fortify',
  });
  state.cities[homeCityId].buildings ||= {};
  state.cities[homeCityId].buildings.market = 2;
  state.cities[homeCityId].buildings.watchtower = 1;

  const playerFaction = state.getFaction(playerFactionId);
  playerFaction.reputation = 147;
  playerFaction.truces[rivalFactionId] = state.turn + 5;
  playerFaction.research = {
    completed: ['river_navy', 'granary_system'],
    current: 'supply_depots',
  };
  playerFaction.inventory = [...(playerFaction.inventory || []), 'qa_seal'];

  const leader = state.getCharacter(leaderId);
  leader.experience = 245;
  leader.level = 5;
  leader.skills = ['inspire', 'forced_march'];
  leader.equipment = {
    weapon: 'serpent_spear',
    armor: 'scale_mail',
    horse: 'swift_horse',
    accessory: 'war_drum',
  };
  leader.potential = {
    ...leader.potential,
    charisma: 97,
  };

  state.resetTurnSummary();
  state.recordSummary('warsStarted', {
    fromFaction: playerFactionId,
    toFaction: rivalFactionId,
    turn: state.turn,
  });
  state.recordSummary('majorEvents', {
    id: 'qa_save_load_round_trip',
    cityId: homeCityId,
  });

  const expected = buildRoundTripSnapshot(state, {
    playerFactionId,
    leaderId,
    homeCityId,
    connectionKey,
  });

  const recovered = GameState.deserialize(state.serialize());

  assert.ok(recovered instanceof GameState);
  assert.equal(typeof recovered.serialize, 'function');
  assert.deepEqual(
    buildRoundTripSnapshot(recovered, {
      playerFactionId,
      leaderId,
      homeCityId,
      connectionKey,
    }),
    expected
  );
  assert.equal(recovered.getTactician(playerFactionId)?.faction, playerFactionId);

  return {
    playerFactionId,
    leaderId,
    homeCityId,
    rivalFactionId,
    rivalCityId,
    snapshot: expected,
  };
}

function runLegacyRecovery() {
  const recovered = GameState.deserialize(createLegacySaveFixture());

  assert.deepEqual(recovered.connectionTerrains, {});
  assert.deepEqual(recovered.diplomacyLog, []);
  assert.equal(recovered.turnSummary.turn, 7);
  assert.deepEqual(recovered.turnSummary.warsStarted, []);

  assert.equal(recovered.cities.chengdu.agriculture, 56);
  assert.equal(recovered.cities.chengdu.commerce, 56);
  assert.equal(recovered.cities.chengdu.technology, 41);
  assert.equal(recovered.cities.chengdu.publicOrder, 61);
  assert.deepEqual(recovered.cities.chengdu.buildings, {});
  assert.deepEqual(recovered.getCityPolicy('chengdu'), {
    domesticFocus: 'balanced',
    militaryPosture: 'balanced',
  });

  assert.equal(recovered.factions.shu.reputation, 100);
  assert.deepEqual(recovered.factions.shu.truces, {});
  assert.deepEqual(recovered.factions.shu.inventory, []);
  assert.deepEqual(recovered.factions.shu.research, {
    completed: [],
    current: null,
  });
  assert.equal(recovered.factions.shu.tactician, 'zhuge_liang');

  assert.equal(recovered.characters.liu_bei.status, 'active');
  assert.deepEqual(recovered.characters.liu_bei.skills, []);
  assert.deepEqual(recovered.characters.liu_bei.equipment, {
    weapon: null,
    armor: null,
    horse: null,
    accessory: null,
  });
  assert.equal(recovered.characters.liu_bei.experience, 0);
  assert.equal(recovered.characters.liu_bei.level, 1);
  assert.deepEqual(recovered.characters.liu_bei.potential, {});

  return {
    playerFactionId: recovered.player.factionId,
    tactician: recovered.factions.shu.tactician,
    chengdu: {
      agriculture: recovered.cities.chengdu.agriculture,
      commerce: recovered.cities.chengdu.commerce,
      technology: recovered.cities.chengdu.technology,
      publicOrder: recovered.cities.chengdu.publicOrder,
      buildings: recovered.cities.chengdu.buildings,
      policy: recovered.getCityPolicy('chengdu'),
    },
    shu: {
      reputation: recovered.factions.shu.reputation,
      truces: recovered.factions.shu.truces,
      inventory: recovered.factions.shu.inventory,
      research: recovered.factions.shu.research,
    },
    liuBei: {
      status: recovered.characters.liu_bei.status,
      skills: recovered.characters.liu_bei.skills,
      equipment: recovered.characters.liu_bei.equipment,
      experience: recovered.characters.liu_bei.experience,
      level: recovered.characters.liu_bei.level,
      potential: recovered.characters.liu_bei.potential,
    },
  };
}

async function main() {
  const scenarioRoundTrip = await runScenarioRoundTrip();
  const legacyRecovery = runLegacyRecovery();

  console.log(JSON.stringify({
    trace_id: 'spark-save-load-replay-001',
    phase_type: 'report',
    mutation_scope: 'product-core',
    touches_app_surface: false,
    scenario_round_trip: scenarioRoundTrip,
    legacy_recovery: legacyRecovery,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
