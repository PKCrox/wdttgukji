#!/usr/bin/env node
/**
 * P2: 3개국어 캐릭터 통합 프로필
 *
 * 입력:
 *   - data/raw/characters-namu-bios/ (나무위키, 깊이)
 *   - data/raw/characters-wiki-en/ (EN 위키, 사실)
 *   - data/raw/characters-wiki-zh/ (ZH 위키, 문화평가)
 *   - data/raw/characters-rotk11-stats.json (능력치)
 *   - data/raw/characters-novel-appearances.json (등장 회차)
 *   - data/processed/novel-dialogues.json (P1: 대사)
 *   - data/processed/novel-cooccurrence.json (P1: 동시출현)
 *   - data/processed/relationship-graph.json (P3: 관계)
 *
 * 출력:
 *   - data/processed/character-profiles/{name-en}.json
 *     소스별 강점 융합: 나무(깊이), EN(사실), ZH(문화평가)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const RAW = join(ROOT, 'data', 'raw');
const PROCESSED = join(ROOT, 'data', 'processed');
const OUT = join(PROCESSED, 'character-profiles');

function toFilename(nameEn) {
  return nameEn.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function loadJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function truncateSection(text, maxLen = 2000) {
  if (!text || text.length <= maxLen) return text || '';
  return text.substring(0, maxLen) + '... (truncated)';
}

// ── 나무위키에서 핵심 섹션 추출 ──
function extractNamuSections(data) {
  if (!data?.sections) return {};
  const result = {};
  const targetHeadings = ['개요', '생애', '평가', '어록', '성격', '인물됨', '업적', '기타', '무덤'];

  for (const section of data.sections) {
    const heading = section.heading || '';
    // soul_relevant가 있으면 그것 사용
    if (data.soul_relevant) return data.soul_relevant;

    for (const target of targetHeadings) {
      if (heading.includes(target)) {
        result[heading] = truncateSection(section.content);
        break;
      }
    }
  }
  return result;
}

// ── EN 위키에서 factual 데이터 추출 ──
function extractEnWikiData(data) {
  if (!data?.sections) return { summary: data?.summary || '', sections: {} };
  const result = { summary: data?.summary || '', sections: {} };
  const targetHeadings = ['Lead', 'Background', 'early life', 'Career', 'Military', 'Death', 'Legacy', 'Assessment', 'Personality'];

  for (const section of data.sections) {
    const heading = section.heading || '';
    for (const target of targetHeadings) {
      if (heading.toLowerCase().includes(target.toLowerCase())) {
        result.sections[heading] = truncateSection(section.content, 1500);
        break;
      }
    }
  }
  return result;
}

// ── ZH 위키에서 문화적 평가 추출 ──
function extractZhWikiData(data) {
  if (!data?.sections) return { summary: data?.summary || '', sections: {} };
  const result = { summary: data?.summary || '', sections: {} };
  const targetHeadings = ['Introduction', '评价', '家族', '历史', '艺术', '文学', '影响'];

  for (const section of data.sections) {
    const heading = section.heading || '';
    for (const target of targetHeadings) {
      if (heading.includes(target)) {
        result.sections[heading] = truncateSection(section.content, 1500);
        break;
      }
    }
  }
  return result;
}

// ── 메인 ──
async function main() {
  console.log('\n👤 P2: 3개국어 캐릭터 통합 프로필\n');

  const { ALL_CHARACTERS, buildNameMap } = await import('../crawl/character-list.js');
  const { kr2en } = buildNameMap();

  mkdirSync(OUT, { recursive: true });

  // 능력치 로드
  const statsRaw = loadJson(join(RAW, 'characters-rotk11-stats.json'));
  const statsMap = {};
  if (statsRaw?.data) {
    for (const s of statsRaw.data) statsMap[s.name_kr] = s;
  }

  // 연의 등장 로드
  const appearancesRaw = loadJson(join(RAW, 'characters-novel-appearances.json'));
  const appearancesMap = {};
  if (appearancesRaw?.data) {
    for (const a of appearancesRaw.data) appearancesMap[a.name] = a;
  }

  // P1: 대사 로드
  const dialoguesRaw = loadJson(join(PROCESSED, 'novel-dialogues.json'));
  const dialoguesByChar = {};
  if (dialoguesRaw?.dialogues) {
    for (const d of dialoguesRaw.dialogues) {
      if (d.speaker) {
        const name = d.speaker.name_en;
        if (!dialoguesByChar[name]) dialoguesByChar[name] = [];
        dialoguesByChar[name].push(d);
      }
    }
  }

  // P1: 동시출현 로드
  const coocRaw = loadJson(join(PROCESSED, 'novel-cooccurrence.json'));
  const chapterAppearances = coocRaw?.chapter_appearances || {};

  // P3: 관계 로드
  const relRaw = loadJson(join(PROCESSED, 'relationship-graph.json'));
  const relationshipsByChar = {};
  if (relRaw?.edges) {
    for (const e of relRaw.edges) {
      if (!relationshipsByChar[e.a]) relationshipsByChar[e.a] = [];
      relationshipsByChar[e.a].push(e);
      if (e.bidirectional) {
        if (!relationshipsByChar[e.b]) relationshipsByChar[e.b] = [];
        relationshipsByChar[e.b].push({ ...e, a: e.b, b: e.a });
      }
    }
  }

  let created = 0;
  let skipped = 0;

  for (const char of ALL_CHARACTERS) {
    const filename = toFilename(char.name_en);

    // 나무위키
    const namuData = loadJson(join(RAW, 'characters-namu-bios', `${filename}.json`));
    const namuSections = namuData ? extractNamuSections(namuData) : {};

    // EN 위키
    const enData = loadJson(join(RAW, 'characters-wiki-en', `${filename}.json`));
    const enExtract = enData ? extractEnWikiData(enData) : { summary: '', sections: {} };

    // ZH 위키
    const zhData = loadJson(join(RAW, 'characters-wiki-zh', `${filename}.json`));
    const zhExtract = zhData ? extractZhWikiData(zhData) : { summary: '', sections: {} };

    // 능력치
    const stats = statsMap[char.name_kr] || null;

    // 연의 등장
    const appearances = appearancesMap[char.name_en] || null;

    // 대사 (최대 20개, 길이 순 정렬)
    const dialogues = (dialoguesByChar[char.name_en] || [])
      .sort((a, b) => b.text_length - a.text_length)
      .slice(0, 20)
      .map(d => ({
        chapter: d.chapter,
        text: d.text.substring(0, 300),
        text_length: d.text_length,
      }));

    // 동시출현 장 목록
    const chapters = chapterAppearances[char.name_en] || [];

    // 관계
    const relationships = (relationshipsByChar[char.name_en] || [])
      .map(r => ({
        target: r.b,
        type: r.type,
        type_kr: r.type_kr,
        intensity: r.intensity,
        evidence: r.evidence,
      }));

    // 소스 커버리지
    const sources = {
      namu: Object.keys(namuSections).length > 0,
      wiki_en: Object.keys(enExtract.sections).length > 0 || enExtract.summary.length > 0,
      wiki_zh: Object.keys(zhExtract.sections).length > 0 || zhExtract.summary.length > 0,
      stats: stats !== null,
      novel_appearances: appearances !== null,
      dialogues: dialogues.length > 0,
      relationships: relationships.length > 0,
    };
    const sourceCount = Object.values(sources).filter(Boolean).length;

    if (sourceCount < 2) {
      skipped++;
      continue;
    }

    // 통합 프로필 생성
    const profile = {
      // 기본 정보
      name_kr: char.name_kr,
      name_en: char.name_en,
      name_cn: char.name_cn,
      courtesy_kr: char.courtesy_kr || null,
      courtesy_cn: char.courtesy_cn || null,
      faction: char.faction,
      tier: char.tier,
      role: char.role,

      // 능력치
      stats: stats ? {
        leadership: stats.leadership,
        war: stats.war,
        intelligence: stats.intelligence,
        politics: stats.politics,
        charisma: stats.charisma,
        total: stats.leadership + stats.war + stats.intelligence + stats.politics + stats.charisma,
        birth: stats.birth || null,
        death: stats.death || null,
      } : null,

      // 연의 등장
      novel_presence: appearances ? {
        first_chapter: appearances.first_chapter,
        last_chapter: appearances.last_chapter,
        chapters: appearances.chapters,
        chapter_count: typeof appearances.chapters === 'string'
          ? appearances.chapters.split(',').length
          : (appearances.chapters?.length || 0),
      } : {
        chapters_from_cooccurrence: chapters,
        chapter_count: chapters.length,
      },

      // 3개국어 바이오
      biography: {
        namu: namuSections,
        wiki_en: enExtract,
        wiki_zh: zhExtract,
      },

      // 실제 대사 (P1)
      dialogues,

      // 관계 (P3)
      relationships,

      // 메타
      source_coverage: sources,
      source_count: sourceCount,
      generated_at: new Date().toISOString(),
    };

    writeFileSync(
      join(OUT, `${filename}.json`),
      JSON.stringify(profile, null, 2),
      'utf-8'
    );

    created++;
    process.stdout.write(`  [${created}] ${char.name_kr} (${char.name_en}) — ${sourceCount}/7 소스\r`);
  }

  console.log(`\n\n  생성: ${created}`);
  console.log(`  건너뜀 (소스 부족): ${skipped}`);

  // 소스 커버리지 통계
  const coverageStats = { namu: 0, wiki_en: 0, wiki_zh: 0, stats: 0, appearances: 0, dialogues: 0, relationships: 0 };
  // 이미 파일 쓰기 완료되었으므로 실제 커버리지는 위에서 계산된 것과 동일

  console.log(`\n  ✅ character-profiles/ (${created} profiles)\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
