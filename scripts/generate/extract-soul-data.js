#!/usr/bin/env node
/**
 * P7 헬퍼: 각 캐릭터 프로필에서 soul.md 생성에 필요한 핵심 데이터만 추출
 * → data/processed/soul-data/{name}.txt
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const PROFILES = join(ROOT, 'data', 'processed', 'character-profiles');
const TIMELINE_FILE = join(ROOT, 'data', 'processed', 'timeline-unified.json');
const OUT = join(ROOT, 'data', 'processed', 'soul-data');

mkdirSync(OUT, { recursive: true });

const { ALL_CHARACTERS } = await import('../crawl/character-list.js');

// 연표
let timeline = [];
try { timeline = JSON.parse(readFileSync(TIMELINE_FILE, 'utf-8')).entries || []; } catch {}

// 골드 스탠다드 (스킵)
const GOLD = new Set(['cao-cao', 'liu-bei', 'zhang-fei']);

let count = 0;
for (const char of ALL_CHARACTERS) {
  const fn = char.name_en.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (GOLD.has(fn)) continue;

  const profilePath = join(PROFILES, `${fn}.json`);
  if (!existsSync(profilePath)) continue;

  const p = JSON.parse(readFileSync(profilePath, 'utf-8'));

  // 연표 이벤트
  const events = timeline
    .filter(e => (e.participants || []).some(n => n === char.name_kr || n === char.name_en))
    .slice(0, 12)
    .map(e => `${e.year}년: ${e.event_kr}`)
    .join('\n');

  // 나무위키 바이오 핵심 (최대 2000자)
  const namuSections = p.biography?.namu || {};
  let namuText = '';
  for (const [k, v] of Object.entries(namuSections)) {
    if (!v || typeof v !== 'string') continue;
    const add = `[${k}] ${v.substring(0, 600)}\n`;
    if (namuText.length + add.length > 2000) break;
    namuText += add;
  }

  // EN 위키 요약
  const enSummary = (p.biography?.wiki_en?.summary || '').substring(0, 400);

  const out = `=== ${p.name_kr} (${p.name_cn}, ${p.name_en}) ===
자: ${p.courtesy_kr || '불명'} (${p.courtesy_cn || '불명'})
진영: ${p.faction} | 티어: ${p.tier} | 역할: ${p.role}

## 능력치
${p.stats ? `통솔:${p.stats.leadership} 무력:${p.stats.war} 지력:${p.stats.intelligence} 정치:${p.stats.politics} 매력:${p.stats.charisma} 총합:${p.stats.total}
생:${p.stats.birth || '?'} 몰:${p.stats.death || '?'}` : '(없음)'}

## 연의 등장
${p.novel_presence ? `${p.novel_presence.first_chapter || '?'}~${p.novel_presence.last_chapter || '?'}회, 총 ${p.novel_presence.chapter_count}개 회차
회차: ${typeof p.novel_presence.chapters === 'string' ? p.novel_presence.chapters : (p.novel_presence.chapters_from_cooccurrence || []).join(',')}` : '(없음)'}

## 실제 연의 대사 (P1 추출, 중국어 원문)
${(p.dialogues || []).map(d => `[${d.chapter}회] ${d.text}`).join('\n\n') || '(없음)'}

## 관계 (P3)
${(p.relationships || []).map(r => `${r.target}: ${r.type_kr} (강도${r.intensity}, ${r.evidence})`).join('\n') || '(없음)'}

## 연표 이벤트
${events || '(없음)'}

## 나무위키
${namuText || '(없음)'}

## EN Wikipedia
${enSummary || '(없음)'}
`;

  writeFileSync(join(OUT, `${fn}.txt`), out, 'utf-8');
  count++;
}

console.log(`✅ ${count}개 soul-data 추출 완료 → ${OUT}`);
