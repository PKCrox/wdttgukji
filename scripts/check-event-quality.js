#!/usr/bin/env node

import { readFile } from 'fs/promises';

const EVENT_FILE = new URL('../data/events/all-events.json', import.meta.url);
const ALLOWED_EFFECT_TYPES = new Set([
  'army_change',
  'character_death',
  'character_join',
  'character_leave',
  'custom',
  'faction_alliance',
  'faction_peace',
  'faction_war',
  'gold_change',
  'loyalty_change',
  'relationship_change',
  'reputation_change',
  'resource_change',
  'stat_change',
  'territory_change',
  'unlock_event',
  'unlock_tech',
]);

function collectEffects(event) {
  return [
    ...(event.effects || []),
    ...((event.choices || []).flatMap((choice) => choice.effects || [])),
  ];
}

function countNonChoiceHistorical(events) {
  return events.filter((event) =>
    event.layer === 'historical' && (!event.choices || event.choices.length === 0)
  ).length;
}

async function main() {
  const raw = await readFile(EVENT_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  const events = Array.isArray(parsed) ? parsed : (parsed.events || Object.values(parsed));

  const unsupportedEffects = new Map();
  const todoNarratives = [];
  const invalidChoices = [];

  for (const event of events) {
    const narrativeText = event.narrative?.text || '';
    if (narrativeText.includes('TODO')) {
      todoNarratives.push(event.id);
    }

    if (event.choices?.length) {
      for (const choice of event.choices) {
        if (!choice.id || !choice.text) {
          invalidChoices.push({ eventId: event.id, choiceId: choice.id || null });
        }
      }
    }

    for (const effect of collectEffects(event)) {
      if (!ALLOWED_EFFECT_TYPES.has(effect.type)) {
        unsupportedEffects.set(effect.type, (unsupportedEffects.get(effect.type) || 0) + 1);
      }
    }
  }

  const report = {
    totalEvents: events.length,
    todoNarratives: todoNarratives.length,
    unsupportedEffectTypes: Object.fromEntries([...unsupportedEffects.entries()].sort()),
    choiceLessHistoricalEvents: countNonChoiceHistorical(events),
    choiceLessEvents: events.filter((event) => !event.choices || event.choices.length === 0).length,
    invalidChoices: invalidChoices.length,
  };

  console.log(JSON.stringify(report, null, 2));

  if (
    todoNarratives.length > 0 ||
    unsupportedEffects.size > 0 ||
    invalidChoices.length > 0
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
