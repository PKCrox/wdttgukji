#!/usr/bin/env node
/**
 * P8 결합: data/events/tier-*.json → data/events/all-events.json
 * + event-schema.json 기본 검증
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const EVENTS_DIR = join(ROOT, 'data', 'events');
const SCHEMA = JSON.parse(readFileSync(join(ROOT, 'docs', 'schemas', 'event-schema.json'), 'utf-8'));
const OUT = join(EVENTS_DIR, 'all-events.json');

const REQUIRED = SCHEMA.required; // ["id", "layer", "name", "trigger", "narrative", "effects"]
const VALID_LAYERS = SCHEMA.properties.layer.enum;
const VALID_EFFECT_TYPES = SCHEMA.$defs.effects.items.properties.type.enum;

const files = readdirSync(EVENTS_DIR)
  .filter(f => f.startsWith('tier-') && f.endsWith('.json'))
  .sort();

console.log(`\n⚔️  P8 결합: ${files.length}개 이벤트 파일\n`);

const allEvents = [];
let errors = 0;
let warnings = 0;

for (const f of files) {
  try {
    const data = JSON.parse(readFileSync(join(EVENTS_DIR, f), 'utf-8'));
    const events = data.events || [];

    let fileErrors = 0;
    for (const evt of events) {
      // 필수 필드 체크
      for (const req of REQUIRED) {
        if (!(req in evt)) {
          console.warn(`    ⚠️  ${evt.id || '(no id)'}: missing required field '${req}'`);
          fileErrors++;
        }
      }
      // layer 유효성
      if (evt.layer && !VALID_LAYERS.includes(evt.layer)) {
        console.warn(`    ⚠️  ${evt.id}: invalid layer '${evt.layer}'`);
        fileErrors++;
      }
      // effects 타입 유효성
      for (const eff of (evt.effects || [])) {
        if (eff.type && !VALID_EFFECT_TYPES.includes(eff.type)) {
          console.warn(`    ⚠️  ${evt.id}: invalid effect type '${eff.type}'`);
          fileErrors++;
        }
      }
      // narrative TODO 잔존 체크
      if (evt.narrative?.text?.includes('TODO')) {
        console.warn(`    ⚠️  ${evt.id}: narrative still contains TODO`);
        fileErrors++;
      }
      // 내부 필드 잔존 체크
      if (evt._source || evt._completeness || evt._chapter) {
        console.warn(`    ⚠️  ${evt.id}: internal fields not cleaned`);
        fileErrors++;
      }
    }

    allEvents.push(...events);
    warnings += fileErrors;
    console.log(`  ✅ ${f}: ${events.length}개 이벤트${fileErrors ? ` (⚠️ ${fileErrors} warnings)` : ''}`);
  } catch (err) {
    console.error(`  ❌ ${f}: ${err.message}`);
    errors++;
  }
}

// ID 중복 체크
const ids = allEvents.map(e => e.id);
const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dups.length) {
  console.warn(`\n  ⚠️  중복 ID ${dups.length}개: ${[...new Set(dups)].slice(0, 5).join(', ')}...`);
  warnings += dups.length;
}

// 통계
const layerDist = {};
const choiceCount = { with: 0, without: 0 };
const effectCount = { with: 0, without: 0 };

for (const evt of allEvents) {
  layerDist[evt.layer] = (layerDist[evt.layer] || 0) + 1;
  if ((evt.choices || []).length > 0) choiceCount.with++;
  else choiceCount.without++;
  if ((evt.effects || []).length > 0) effectCount.with++;
  else effectCount.without++;
}

const result = {
  total: allEvents.length,
  generated_at: new Date().toISOString(),
  layer_distribution: layerDist,
  stats: {
    with_choices: choiceCount.with,
    without_choices: choiceCount.without,
    with_effects: effectCount.with,
    without_effects: effectCount.without,
  },
  events: allEvents,
};

writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf-8');

console.log(`\n  총 ${allEvents.length}/337 이벤트`);
console.log(`  레이어: ${JSON.stringify(layerDist)}`);
console.log(`  선택지 있음: ${choiceCount.with}, 없음: ${choiceCount.without}`);
console.log(`  효과 있음: ${effectCount.with}, 없음: ${effectCount.without}`);
if (warnings) console.log(`  ⚠️  경고: ${warnings}개`);
if (errors) console.log(`  ❌ 오류: ${errors}개 파일`);
console.log(`  ✅ → ${OUT}\n`);
