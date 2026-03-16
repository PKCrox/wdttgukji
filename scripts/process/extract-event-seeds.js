#!/usr/bin/env node
/**
 * P4: 전투/이벤트 시드 — event-schema 형식으로 80% 사전 구조화
 *
 * 입력:
 *   - data/raw/battles/ (28 전투)
 *   - data/raw/novel/ (26 에피소드)
 *   - data/raw/events-timeline-namuwiki.json (45 이벤트)
 *   - data/raw/events-timeline-yellow.json (73 이벤트)
 *   - data/raw/events-romance-chapters.json (120회 이벤트)
 *
 * 출력:
 *   - data/processed/event-seeds.json       (event-schema 형식 시드)
 *   - data/processed/timeline-unified.json   (통합 연표)
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const RAW = join(ROOT, 'data', 'raw');
const OUT = join(ROOT, 'data', 'processed');

// ── 이름 매핑 ──
async function loadNameMap() {
  const { ALL_CHARACTERS, buildNameMap } = await import('../crawl/character-list.js');
  const { kr2en } = buildNameMap();
  // 추가 매핑 (character-list에 없는 인물)
  kr2en['헌제'] = 'Emperor Xian';
  kr2en['도겸'] = 'Tao Qian';
  kr2en['유장'] = 'Liu Zhang';
  kr2en['이각'] = 'Li Jue';
  kr2en['곽사'] = 'Guo Si';
  kr2en['원담'] = 'Yuan Tan';
  kr2en['원상'] = 'Yuan Shang';
  kr2en['왕윤'] = 'Wang Yun';
  kr2en['사마휘'] = 'Sima Hui';
  kr2en['유종'] = 'Liu Cong';
  kr2en['조방'] = 'Cao Fang';
  kr2en['조예'] = 'Cao Rui';
  kr2en['사마소'] = 'Sima Zhao';
  kr2en['조모'] = 'Cao Mao';
  kr2en['사마염'] = 'Sima Yan';
  kr2en['정현'] = 'Zheng Xuan';
  kr2en['노식'] = 'Lu Zhi';
  kr2en['하진'] = 'He Jin';
  kr2en['황보숭'] = 'Huangfu Song';
  kr2en['한수'] = 'Han Sui';
  kr2en['유언'] = 'Liu Yan';
  kr2en['장로'] = 'Zhang Lu';
  kr2en['공손연'] = 'Gongsun Yuan';
  kr2en['조상'] = 'Cao Shuang';
  kr2en['마등'] = 'Ma Teng';
  kr2en['영제'] = 'Emperor Ling';
  kr2en['정원'] = 'Ding Yuan';
  return { kr2en, ALL_CHARACTERS };
}

function toCharId(nameEn) {
  return nameEn.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function resolveParticipants(names, kr2en) {
  return names
    .map(name => {
      const en = kr2en[name];
      if (!en) return null;
      return { character_id: toCharId(en), name_kr: name, name_en: en };
    })
    .filter(Boolean);
}

// ── 전투 데이터 → 이벤트 시드 ──
function processBattles(kr2en) {
  const dir = join(RAW, 'battles');
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  const seeds = [];

  for (const file of files) {
    const data = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
    const year = data.year;
    const idBase = file.replace('.json', '').replace(/^battle-of-/, 'hist_').replace(/^(coalition|fall|massacre|seven|war|yuan|yellow)/, 'hist_');
    const id = `hist_${year || 'xxx'}_${idBase.replace(/^hist_/, '')}`;

    const allParticipants = [
      ...(data.participants?.side_a || []),
      ...(data.participants?.side_b || []),
    ];
    const resolved = resolveParticipants(allParticipants, kr2en);

    // 기본 이벤트 시드
    const seed = {
      id: id.replace(/[^a-z0-9_-]/g, '_'),
      layer: 'historical',
      name: data.name_kr || data.title_kr || file.replace('.json', ''),
      period: year ? { year } : {},
      location: data.location || null,
      trigger: {
        conditions: [
          ...(year ? [{ type: 'year_range', params: { min: year - 1, max: year + 2 } }] : []),
          ...resolved.slice(0, 3).map(p => ({
            type: 'character_alive',
            params: { character_id: p.character_id },
          })),
        ],
        priority: 80,
      },
      participants: resolved.map((p, i) => ({
        character_id: p.character_id,
        role: i === 0 ? 'protagonist' : (
          (data.participants?.side_b || []).includes(p.name_kr) ? 'antagonist' : 'supporter'
        ),
        required: i < 2,
      })),
      narrative: {
        text: `{TODO: LLM 서사 생성 필요}`,
        generation: 'manual',
      },
      effects: [],
      choices: [],
      historical_basis: `전투 데이터: ${file}`,
      tags: ['battle'],
      _source: 'battles',
      _completeness: 0.6,
    };

    seeds.push(seed);
  }

  return seeds;
}

// ── 에피소드 데이터 → 이벤트 시드 ──
function processEpisodes(kr2en) {
  const dir = join(RAW, 'novel');
  const files = readdirSync(dir).filter(f => f.startsWith('episode-') && f.endsWith('.json'));
  const seeds = [];

  for (const file of files) {
    const data = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
    const title = data.title_kr || file.replace('episode-', '').replace('.json', '');
    const chars = data.characters_mentioned || [];
    const resolved = resolveParticipants(chars, kr2en);

    const seed = {
      id: `rel_${toCharId(data.title_en || title)}`,
      layer: 'relational',
      name: title,
      period: {},
      trigger: {
        conditions: resolved.slice(0, 3).map(p => ({
          type: 'character_alive',
          params: { character_id: p.character_id },
        })),
        priority: 70,
      },
      participants: resolved.slice(0, 6).map((p, i) => ({
        character_id: p.character_id,
        role: i === 0 ? 'protagonist' : 'supporter',
        required: i < 2,
      })),
      narrative: {
        text: `{TODO: LLM 서사 생성 필요}`,
        generation: 'manual',
      },
      effects: [],
      choices: [],
      historical_basis: `에피소드: ${title}`,
      tags: ['episode'],
      _source: 'episodes',
      _completeness: 0.5,
    };

    seeds.push(seed);
  }

  return seeds;
}

// ── 연표 통합 ──
function processTimelines(kr2en) {
  const timelineEntries = [];

  // 나무위키 연표
  const namu = JSON.parse(readFileSync(join(RAW, 'events-timeline-namuwiki.json'), 'utf-8'));
  for (const entry of namu.data) {
    if (entry.event_group) {
      for (const sub of entry.event_group) {
        timelineEntries.push({
          year: entry.year,
          event_kr: sub.event,
          event_en: sub.event_en || '',
          participants: sub.participants || [],
          location: sub.location || null,
          significance: sub.significance || '',
          source: 'namuwiki',
        });
      }
    } else {
      timelineEntries.push({
        year: entry.year,
        event_kr: entry.event,
        event_en: entry.event_en || '',
        participants: entry.participants || [],
        location: entry.location || null,
        significance: entry.significance || '',
        source: 'namuwiki',
      });
    }
  }

  // Yellow 연표
  try {
    const yellow = JSON.parse(readFileSync(join(RAW, 'events-timeline-yellow.json'), 'utf-8'));
    for (const entry of (yellow.data || [])) {
      if (entry.event_group) {
        for (const sub of entry.event_group) {
          timelineEntries.push({
            year: entry.year,
            event_kr: sub.event || sub.event_kr || '',
            event_en: sub.event_en || '',
            participants: sub.participants || [],
            location: sub.location || null,
            significance: sub.significance || '',
            source: 'yellow',
          });
        }
      } else {
        timelineEntries.push({
          year: entry.year,
          event_kr: entry.event || entry.event_kr || '',
          event_en: entry.event_en || '',
          participants: entry.participants || [],
          location: entry.location || null,
          significance: entry.significance || '',
          source: 'yellow',
        });
      }
    }
  } catch { /* skip if missing */ }

  // 연대순 정렬
  timelineEntries.sort((a, b) => (a.year || 0) - (b.year || 0));

  // 연표에서 이벤트 시드 추출
  const seeds = [];
  for (const entry of timelineEntries) {
    const participants = resolveParticipants(entry.participants, kr2en);
    if (participants.length === 0) continue;

    const idSlug = (entry.event_en || entry.event_kr || 'unknown')
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 40);

    seeds.push({
      id: `hist_${entry.year}_${idSlug}`,
      layer: 'historical',
      name: entry.event_kr,
      period: { year: entry.year },
      location: entry.location || null,
      trigger: {
        conditions: [
          { type: 'year_range', params: { min: entry.year - 1, max: entry.year + 2 } },
          ...participants.slice(0, 2).map(p => ({
            type: 'character_alive',
            params: { character_id: p.character_id },
          })),
        ],
        priority: 60,
      },
      participants: participants.map((p, i) => ({
        character_id: p.character_id,
        role: i === 0 ? 'protagonist' : 'supporter',
        required: i < 2,
      })),
      narrative: {
        text: `{TODO: LLM 서사 생성 필요}`,
        generation: 'manual',
      },
      effects: [],
      choices: [],
      historical_basis: `연표 (${entry.source}): ${entry.event_kr}`,
      tags: ['timeline'],
      _source: `timeline-${entry.source}`,
      _completeness: 0.4,
      _significance: entry.significance || '',
    });
  }

  return { seeds, timeline: timelineEntries };
}

// ── 연의 120회 이벤트 → 시드 ──
function processRomanceChapters(kr2en) {
  const data = JSON.parse(readFileSync(join(RAW, 'events-romance-chapters.json'), 'utf-8'));
  const seeds = [];

  for (const ch of (data.data || [])) {
    for (const event of (ch.events || [])) {
      const chars = ch.key_characters || [];
      const resolved = resolveParticipants(chars, kr2en);
      const slug = event.replace(/[^가-힣a-z0-9]+/g, '_').substring(0, 30);

      seeds.push({
        id: `novel_ch${ch.chapter}_${slug}`,
        layer: 'historical',
        name: event,
        period: {},
        trigger: {
          conditions: resolved.slice(0, 2).map(p => ({
            type: 'character_alive',
            params: { character_id: p.character_id },
          })),
          priority: 50,
        },
        participants: resolved.map((p, i) => ({
          character_id: p.character_id,
          role: i === 0 ? 'protagonist' : 'supporter',
          required: i === 0,
        })),
        narrative: {
          text: `{TODO: LLM 서사 생성 필요}`,
          generation: 'manual',
        },
        effects: [],
        choices: [],
        historical_basis: `연의 ${ch.chapter}회: ${ch.title}`,
        tags: ['novel_chapter'],
        _source: 'romance-chapters',
        _chapter: ch.chapter,
        _completeness: 0.3,
      });
    }
  }

  return seeds;
}

// ── 중복 제거 ──
function deduplicateSeeds(seeds) {
  // 같은 이벤트를 다른 소스에서 중복 생성한 경우, 높은 completeness 유지
  const map = {};
  for (const seed of seeds) {
    // 같은 이름+같은 연도면 중복 후보
    const key = `${seed.name}_${seed.period?.year || 'x'}`;
    if (!map[key] || (seed._completeness || 0) > (map[key]._completeness || 0)) {
      // 더 완성도 높은 것으로 교체, 소스 정보 병합
      if (map[key]) {
        seed._merged_from = [map[key]._source, seed._source];
      }
      map[key] = seed;
    }
  }
  return Object.values(map);
}

// ── 메인 ──
async function main() {
  console.log('\n⚔️  P4: 전투/이벤트 시드 추출 파이프라인\n');

  const { kr2en } = await loadNameMap();

  // 4개 소스에서 시드 추출
  const battleSeeds = processBattles(kr2en);
  console.log(`  전투 시드: ${battleSeeds.length}`);

  const episodeSeeds = processEpisodes(kr2en);
  console.log(`  에피소드 시드: ${episodeSeeds.length}`);

  const { seeds: timelineSeeds, timeline } = processTimelines(kr2en);
  console.log(`  연표 시드: ${timelineSeeds.length}`);
  console.log(`  통합 연표 엔트리: ${timeline.length}`);

  const novelSeeds = processRomanceChapters(kr2en);
  console.log(`  연의 120회 시드: ${novelSeeds.length}`);

  // 병합 + 중복 제거
  const allSeeds = [...battleSeeds, ...episodeSeeds, ...timelineSeeds, ...novelSeeds];
  const deduped = deduplicateSeeds(allSeeds);

  console.log(`\n  총 시드: ${allSeeds.length} → 중복 제거 후: ${deduped.length}`);

  // completeness 분포
  const compDist = {};
  for (const s of deduped) {
    const bucket = Math.round((s._completeness || 0) * 10) / 10;
    compDist[bucket] = (compDist[bucket] || 0) + 1;
  }
  console.log(`  완성도 분포:`, compDist);

  // 소스별 분포
  const srcDist = {};
  for (const s of deduped) {
    srcDist[s._source] = (srcDist[s._source] || 0) + 1;
  }
  console.log(`  소스 분포:`, srcDist);

  // 저장
  writeFileSync(
    join(OUT, 'event-seeds.json'),
    JSON.stringify({
      total: deduped.length,
      generated_at: new Date().toISOString(),
      completeness_distribution: compDist,
      source_distribution: srcDist,
      seeds: deduped,
    }, null, 2),
    'utf-8'
  );

  writeFileSync(
    join(OUT, 'timeline-unified.json'),
    JSON.stringify({
      total_entries: timeline.length,
      period: `${timeline[0]?.year || '?'} CE - ${timeline[timeline.length - 1]?.year || '?'} CE`,
      generated_at: new Date().toISOString(),
      entries: timeline,
    }, null, 2),
    'utf-8'
  );

  console.log(`\n  ✅ event-seeds.json (${deduped.length} seeds)`);
  console.log(`  ✅ timeline-unified.json (${timeline.length} entries)\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
