#!/usr/bin/env node
/**
 * P-History: 정사삼국지 데이터 구조화
 *
 * 입력:
 *   - data/raw/history/char-*.json (캐릭터별 정사 데이터)
 *   - data/raw/history/zhengshi-*.json (정사 서지 데이터)
 *   - data/raw/history/author-*.json (저자/주석가 데이터)
 *
 * 출력:
 *   - data/processed/history-profiles/{name-en}.json (캐릭터별 정사 프로필)
 *   - data/processed/history-index.json (정사 메타데이터 인덱스)
 *
 * 정사 데이터는 fuse-character-profiles.js에서도 통합되지만,
 * 이 스크립트는 정사 전용 상세 프로필을 별도 생성한다.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const HISTORY_DIR = join(ROOT, 'data', 'raw', 'history');
const OUT_PROFILES = join(ROOT, 'data', 'processed', 'history-profiles');
const OUT = join(ROOT, 'data', 'processed');

function truncate(text, maxLen = 3000) {
  if (!text || text.length <= maxLen) return text || '';
  return text.substring(0, maxLen) + '... (truncated)';
}

// ── 정사 캐릭터 프로필 추출 ──
function extractHistoryProfile(data, nameKr) {
  const sections = data.sections || [];
  const profile = {
    name_kr: nameKr,
    title: data.title_kr || '',
    source_url: data.namu_url || '',
    category: data.category || 'history',

    // 핵심 섹션 추출
    overview: '',
    life: '',
    evaluation: '',
    quotes: '',
    personality: '',
    family: '',
    death: '',
    other: '',

    // 전체 섹션 목록
    all_sections: [],
    total_text_length: 0,
  };

  const sectionMap = {
    '개요': 'overview',
    '생애': 'life',
    '평가': 'evaluation',
    '어록': 'quotes',
    '성격': 'personality',
    '인물됨': 'personality',
    '가족': 'family',
    '가족 관계': 'family',
    '사망': 'death',
    '기타': 'other',
    '업적': 'life', // 업적은 life에 병합
  };

  for (const section of sections) {
    const heading = section.heading || '';
    const content = section.content || '';
    profile.total_text_length += content.length;

    profile.all_sections.push({
      heading,
      content_length: content.length,
    });

    // 매핑된 필드에 추가
    for (const [pattern, field] of Object.entries(sectionMap)) {
      if (heading.includes(pattern)) {
        if (profile[field]) {
          profile[field] += '\n\n' + truncate(content);
        } else {
          profile[field] = truncate(content);
        }
        break;
      }
    }
  }

  // 연의 vs 정사 차이점 추출 (정사 특유의 통찰)
  const fullText = sections.map(s => (s.content || '')).join(' ');
  const historyInsights = [];

  // "실제로는", "정사에서는", "연의와 달리" 등의 패턴 탐색
  const insightPatterns = [
    /정사에서는[^.。]*[.。]/g,
    /실제로는[^.。]*[.。]/g,
    /연의와\s*달리[^.。]*[.。]/g,
    /역사적으로[^.。]*[.。]/g,
    /사실은[^.。]*[.。]/g,
  ];

  for (const pattern of insightPatterns) {
    const matches = fullText.match(pattern);
    if (matches) {
      for (const m of matches.slice(0, 3)) {
        historyInsights.push(m.trim());
      }
    }
  }

  profile.history_vs_novel = historyInsights.slice(0, 10);

  return profile;
}

// ── 서지 데이터 처리 ──
function processMetadata() {
  const metadata = {
    works: [],
    authors: [],
  };

  // 정사 서지
  const zhengshiFiles = readdirSync(HISTORY_DIR).filter(f => f.startsWith('zhengshi-') && f.endsWith('.json'));
  for (const file of zhengshiFiles) {
    const data = JSON.parse(readFileSync(join(HISTORY_DIR, file), 'utf-8'));
    metadata.works.push({
      id: file.replace('.json', ''),
      title: data.title_kr || '',
      sections_count: (data.sections || []).length,
      text_length: (data.full_text || '').length,
    });
  }

  // 저자/주석가
  const authorFiles = readdirSync(HISTORY_DIR).filter(f => f.startsWith('author-') && f.endsWith('.json'));
  for (const file of authorFiles) {
    const data = JSON.parse(readFileSync(join(HISTORY_DIR, file), 'utf-8'));
    metadata.authors.push({
      id: file.replace('.json', ''),
      title: data.title_kr || '',
      sections_count: (data.sections || []).length,
    });
  }

  return metadata;
}

// ── 메인 ──
async function main() {
  console.log('\n📜 P-History: 정사삼국지 데이터 구조화\n');

  const { ALL_CHARACTERS, buildNameMap } = await import('../crawl/character-list.js');
  const { kr2en } = buildNameMap();

  mkdirSync(OUT_PROFILES, { recursive: true });

  // 캐릭터별 정사 파일 처리
  const charFiles = readdirSync(HISTORY_DIR).filter(f => f.startsWith('char-') && f.endsWith('.json'));
  console.log(`  정사 캐릭터 파일: ${charFiles.length}`);

  let created = 0;
  const profiles = [];

  for (const file of charFiles) {
    const data = JSON.parse(readFileSync(join(HISTORY_DIR, file), 'utf-8'));
    const nameKr = (data.title_kr || '').replace(/\s*정사$/, '').trim();

    if (!nameKr) {
      console.log(`  [SKIP] ${file}: title_kr 없음`);
      continue;
    }

    const profile = extractHistoryProfile(data, nameKr);

    // EN name 매핑
    const nameEn = kr2en[nameKr];
    if (nameEn) {
      profile.name_en = nameEn;
      const filename = nameEn.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      writeFileSync(
        join(OUT_PROFILES, `${filename}.json`),
        JSON.stringify(profile, null, 2),
        'utf-8'
      );
    } else {
      // EN name 없는 경우 KR name으로 저장
      profile.name_en = null;
      writeFileSync(
        join(OUT_PROFILES, `${nameKr}.json`),
        JSON.stringify(profile, null, 2),
        'utf-8'
      );
    }

    profiles.push({
      name_kr: nameKr,
      name_en: nameEn || null,
      total_text_length: profile.total_text_length,
      sections_count: profile.all_sections.length,
      has_evaluation: profile.evaluation.length > 0,
      has_quotes: profile.quotes.length > 0,
      history_insights_count: profile.history_vs_novel.length,
    });

    created++;
    console.log(`  [${created}] ${nameKr}${nameEn ? ` (${nameEn})` : ''} — ${profile.total_text_length.toLocaleString()}자, ${profile.all_sections.length} 섹션, 정사인사이트 ${profile.history_vs_novel.length}건`);
  }

  // 서지 메타데이터
  const metadata = processMetadata();

  // 인덱스 저장
  writeFileSync(
    join(OUT, 'history-index.json'),
    JSON.stringify({
      total_characters: profiles.length,
      total_works: metadata.works.length,
      total_authors: metadata.authors.length,
      generated_at: new Date().toISOString(),
      characters: profiles,
      works: metadata.works,
      authors: metadata.authors,
    }, null, 2),
    'utf-8'
  );

  console.log(`\n  ✅ history-profiles/ (${created} profiles)`);
  console.log(`  ✅ history-index.json (${profiles.length} chars, ${metadata.works.length} works)\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
