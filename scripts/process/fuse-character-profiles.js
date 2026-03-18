#!/usr/bin/env node
/**
 * P2: 다국어 캐릭터 통합 프로필 (확장판)
 *
 * 입력:
 *   - data/raw/characters-namu-bios/ (나무위키, 깊이)
 *   - data/raw/characters-wiki-en/ (EN 위키, 사실)
 *   - data/raw/characters-wiki-zh/ (ZH 위키, 문화평가)
 *   - data/raw/history/char-*.json (정사삼국지, 역사적 평가)
 *   - data/raw/characters-rotk{10,11,12}-stats.json (멀티버전 능력치)
 *   - data/raw/kongming-encyclopedia/{name}.json (영문 백과사전)
 *   - data/raw/kongming-sgz/{name}.json (영문 정사 번역)
 *   - data/raw/koei-official/rtk14-characters.json (공식 Koei 바이오)
 *   - data/raw/fandom-koei/{name}.json (Fandom 위키 게임 데이터)
 *   - data/raw/characters-novel-appearances.json (등장 회차)
 *   - data/processed/novel-dialogues.json (P1: 대사)
 *   - data/processed/novel-cooccurrence.json (P1: 동시출현)
 *   - data/processed/relationship-graph.json (P3: 관계)
 *   - data/processed/community-sentiment.json (커뮤니티 감정)
 *
 * 출력:
 *   - data/processed/character-profiles/{name-en}.json
 *     소스별 강점 융합: 나무(깊이), EN(사실), ZH(문화평가), 정사(역사),
 *     kongming(영문학술), SGZ(정사영역), Fandom(게임), Koei(공식), 커뮤니티(감정)
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

// ── 정사삼국지에서 역사적 평가 추출 ──
function extractHistoryData(data) {
  if (!data?.sections) return { summary: '', sections: {} };
  const result = { summary: '', sections: {} };
  const targetHeadings = ['개요', '생애', '평가', '어록', '성격', '인물됨', '업적', '사망', '가족'];

  for (const section of data.sections) {
    const heading = section.heading || '';
    for (const target of targetHeadings) {
      if (heading.includes(target)) {
        result.sections[heading] = truncateSection(section.content, 1500);
        break;
      }
    }
    // 첫 번째 개요 섹션을 summary로
    if (!result.summary && heading === '개요' && section.content) {
      result.summary = truncateSection(section.content, 500);
    }
  }
  return result;
}

// ── 메인 ──
async function main() {
  console.log('\n👤 P2: 다국어 캐릭터 통합 프로필 (나무+EN+ZH+정사)\n');

  const { ALL_CHARACTERS, buildNameMap } = await import('../crawl/character-list.js');
  const { kr2en } = buildNameMap();

  mkdirSync(OUT, { recursive: true });

  // Load name cross-reference (built by build-name-xref.js)
  const xrefPath = join(PROCESSED, 'name-xref.json');
  let xrefMap = {}; // name_en → xref entry
  if (existsSync(xrefPath)) {
    const xrefData = loadJson(xrefPath);
    if (xrefData?.characters) {
      for (const entry of xrefData.characters) {
        xrefMap[entry.name_en] = entry;
      }
    }
    console.log(`  Name xref: ${Object.keys(xrefMap).length}명 (kongming: ${xrefData?.stats?.kongming_matched || 0} matched)`);
  } else {
    console.log(`  Name xref: not found (run build-name-xref.js first). Falling back to filename-based lookup.`);
  }

  // 멀티버전 능력치 로드 (ROTK 10/11/12)
  const statsMap = {};   // name_kr → rotk11 stats (primary)
  const multiStats = {}; // name_kr → { rotk10, rotk11, rotk12 }
  for (const ver of [10, 11, 12]) {
    const raw = loadJson(join(RAW, `characters-rotk${ver}-stats.json`));
    if (!raw?.data) continue;
    for (const s of raw.data) {
      const key = s.name_kr || s.name;
      if (!key) continue;
      if (!multiStats[key]) multiStats[key] = {};
      multiStats[key][`rotk${ver}`] = s;
      if (ver === 11) statsMap[key] = s; // primary
    }
  }
  console.log(`  멀티버전 능력치: ROTK10=${Object.values(multiStats).filter(m=>m.rotk10).length}, ROTK11=${Object.values(multiStats).filter(m=>m.rotk11).length}, ROTK12=${Object.values(multiStats).filter(m=>m.rotk12).length}`);

  // Kongming encyclopedia 로드 — slug (filename without .json) + name-based slug 양방향 인덱스
  const kongmingDir = join(RAW, 'kongming-encyclopedia');
  const kongmingMap = {};
  if (existsSync(kongmingDir)) {
    const { readdirSync } = await import('fs');
    for (const f of readdirSync(kongmingDir).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
      const data = loadJson(join(kongmingDir, f));
      if (!data) continue;
      const fileSlug = f.slice(0, -5); // filename-based slug (xref uses this)
      kongmingMap[fileSlug] = data;
      // Also index by name-based slug for backward compatibility
      if (data.name) {
        const nameSlug = data.name.toLowerCase().replace(/\s+/g, '-');
        if (!kongmingMap[nameSlug]) kongmingMap[nameSlug] = data;
      }
    }
  }
  console.log(`  Kongming 백과사전: ${Object.keys(kongmingMap).length}명`);

  // Kongming SGZ (영문 정사 번역) 로드 — slug (filename) + character name 양방향 인덱스
  const sgzDir = join(RAW, 'kongming-sgz');
  const sgzMap = {};
  if (existsSync(sgzDir)) {
    const { readdirSync } = await import('fs');
    for (const f of readdirSync(sgzDir).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
      const data = loadJson(join(sgzDir, f));
      if (!data) continue;
      const fileSlug = f.slice(0, -5);
      sgzMap[fileSlug] = data;
      if (data.character) {
        const nameSlug = data.character.toLowerCase().replace(/\s+/g, '-');
        if (!sgzMap[nameSlug]) sgzMap[nameSlug] = data;
      }
    }
  }
  console.log(`  Kongming SGZ 번역: ${Object.keys(sgzMap).length}명`);

  // Koei official 바이오 로드
  const koeiOfficial = loadJson(join(RAW, 'koei-official', 'rtk14-characters.json'));
  const koeiMap = {};
  if (koeiOfficial?.characters) {
    for (const c of koeiOfficial.characters) {
      if (c.name) koeiMap[c.name.toLowerCase().replace(/\s+/g, '-')] = c;
    }
  }
  console.log(`  Koei 공식: ${Object.keys(koeiMap).length}명`);

  // Fandom wiki 데이터 로드 — slug (filename) + title/name 양방향 인덱스
  const fandomDir = join(RAW, 'fandom-koei');
  const fandomMap = {};
  if (existsSync(fandomDir)) {
    const { readdirSync } = await import('fs');
    for (const f of readdirSync(fandomDir).filter(f => f.endsWith('.json'))) {
      const data = loadJson(join(fandomDir, f));
      if (!data) continue;
      const fileSlug = f.slice(0, -5);
      fandomMap[fileSlug] = data;
      // Also index by name/title slug for backward compat
      const name = data.title || data.name || '';
      if (name) {
        const nameSlug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        if (!fandomMap[nameSlug]) fandomMap[nameSlug] = data;
      }
    }
  }
  console.log(`  Fandom Koei: ${Object.keys(fandomMap).length}명`);

  // 커뮤니티 감정 로드
  const communityRaw = loadJson(join(PROCESSED, 'community-sentiment.json'));
  const communityMap = {};
  if (communityRaw?.characters) {
    for (const c of communityRaw.characters) {
      if (c.name_en) communityMap[c.name_en.toLowerCase().replace(/\s+/g, '-')] = c;
    }
  }
  console.log(`  커뮤니티 감정: ${Object.keys(communityMap).length}명`);

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

  // 정사삼국지 캐릭터 데이터 로드 (data/raw/history/char-*.json)
  const historyByChar = {};
  {
    const histDir = join(RAW, 'history');
    if (existsSync(histDir)) {
      const { readdirSync } = await import('fs');
      const files = readdirSync(histDir).filter(f => f.startsWith('char-') && f.endsWith('.json'));
      for (const file of files) {
        const data = loadJson(join(histDir, file));
        if (data?.title_kr) {
          // title_kr: "조조 정사" → "조조"
          const nameKr = data.title_kr.replace(/\s*정사$/, '').trim();
          historyByChar[nameKr] = data;
        }
      }
    }
  }
  console.log(`  정사 캐릭터 데이터: ${Object.keys(historyByChar).length}명`);

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

    // Resolve xref slugs (if xref available, use cross-referenced slugs; else fallback to filename)
    const xref = xrefMap[char.name_en] || null;
    const kongmingSlug = (xref?.kongming_has_file && xref.kongming_slug) || filename;
    const sgzSlug = (xref?.sgz_has_file && xref.sgz_slug) || filename;
    const fandomSlug = (xref?.fandom_has_file && xref.fandom_slug) || filename;

    // 나무위키 — Tier 0/1은 romanized filename, Tier 2는 Korean filename
    const namuData = loadJson(join(RAW, 'characters-namu-bios', `${filename}.json`))
      || loadJson(join(RAW, 'characters-namu-bios', `${char.name_kr}.json`));
    const namuSections = namuData ? extractNamuSections(namuData) : {};

    // EN 위키
    const enData = loadJson(join(RAW, 'characters-wiki-en', `${filename}.json`));
    const enExtract = enData ? extractEnWikiData(enData) : { summary: '', sections: {} };

    // ZH 위키
    const zhData = loadJson(join(RAW, 'characters-wiki-zh', `${filename}.json`));
    const zhExtract = zhData ? extractZhWikiData(zhData) : { summary: '', sections: {} };

    // 정사삼국지
    const historyData = historyByChar[char.name_kr] || null;
    const histExtract = historyData ? extractHistoryData(historyData) : { summary: '', sections: {} };

    // 능력치 — global stats 우선, fallback: namu bio 내장 rotk11_stats (Tier 2)
    const stats = statsMap[char.name_kr] || namuData?.rotk11_stats || null;
    const multiVersionStats = multiStats[char.name_kr] || null;

    // Kongming encyclopedia — xref slug 우선, filename fallback
    const kongmingData = kongmingMap[kongmingSlug] || kongmingMap[filename] || null;

    // Kongming SGZ (영문 정사 번역) — xref slug 우선
    const sgzData = sgzMap[sgzSlug] || sgzMap[filename] || null;

    // Koei official
    const koeiData = koeiMap[filename] || null;

    // Fandom data — xref slug 우선
    const fandomData = fandomMap[fandomSlug] || fandomMap[filename] || null;

    // 커뮤니티 감정
    const communityData = communityMap[filename] || null;

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
      history: Object.keys(histExtract.sections).length > 0 || histExtract.summary.length > 0,
      kongming: kongmingData !== null,
      sgz_en: sgzData !== null,
      koei_official: koeiData !== null,
      fandom: fandomData !== null,
      community: communityData !== null,
      stats: stats !== null,
      multi_stats: multiVersionStats !== null,
      novel_appearances: appearances !== null,
      dialogues: dialogues.length > 0,
      relationships: relationships.length > 0,
    };
    const sourceCount = Object.values(sources).filter(Boolean).length;

    if (sourceCount < 2) {
      skipped++;
      continue;
    }

    // 멀티버전 능력치 통합
    const statsMulti = multiVersionStats ? Object.fromEntries(
      Object.entries(multiVersionStats).map(([ver, s]) => [ver, {
        leadership: s.leadership ?? s.통솔,
        war: s.war ?? s.무력,
        intelligence: s.intelligence ?? s.지력,
        politics: s.politics ?? s.정치,
        charisma: s.charisma ?? s.매력,
      }])
    ) : null;

    // Kongming 요약 (영문 학술 소스)
    const kongmingSummary = kongmingData ? {
      life_span: kongmingData.life_span || null,
      courtesy_name: kongmingData.courtesy_name || null,
      affiliations: kongmingData.affiliations || null,
      family: kongmingData.family || null,
      ranks: kongmingData.ranks || null,
      historical_notes: truncateSection(kongmingData.historical_notes, 2000),
      novel_notes: truncateSection(kongmingData.novel_notes, 1500),
      quotes: kongmingData.quotes || [],
    } : null;

    // SGZ 영문 번역 요약
    const sgzSummary = sgzData ? {
      translation_count: sgzData.translation_count || 0,
      total_char_count: sgzData.total_char_count || 0,
      first_translation: sgzData.translations?.[0] ? {
        translator: sgzData.translations[0].translator,
        excerpt: truncateSection(sgzData.translations[0].translation, 2000),
      } : null,
    } : null;

    // 커뮤니티 요약
    const communitySummary = communityData ? {
      sentiment_score: communityData.sentiment_score,
      mention_count: communityData.mention_count,
      top_keywords: communityData.top_keywords?.slice(0, 10) || [],
    } : null;

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

      // 능력치 (ROTK11 primary)
      stats: stats ? {
        leadership: stats.leadership,
        war: stats.war,
        intelligence: stats.intelligence,
        politics: stats.politics,
        charisma: stats.charisma,
        total: (stats.leadership || 0) + (stats.war || 0) + (stats.intelligence || 0) + (stats.politics || 0) + (stats.charisma || 0),
        birth: stats.birth || null,
        death: stats.death || null,
      } : null,

      // 멀티버전 능력치
      stats_multi: statsMulti,

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

      // 다국어 바이오 + 정사 + kongming + SGZ
      biography: {
        namu: namuSections,
        wiki_en: enExtract,
        wiki_zh: zhExtract,
        history: histExtract,
        kongming: kongmingSummary,
        sgz_english: sgzSummary,
      },

      // Koei 공식 데이터
      koei_official: koeiData ? {
        description: koeiData.description || null,
        faction: koeiData.faction || null,
      } : null,

      // Fandom 데이터
      fandom: fandomData ? {
        infobox: fandomData.infobox || null,
        game_stats: fandomData.game_stats || null,
        game_appearances: fandomData.game_appearances || null,
      } : null,

      // 커뮤니티 감정
      community: communitySummary,

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
    process.stdout.write(`  [${created}] ${char.name_kr} (${char.name_en}) — ${sourceCount}/8 소스\r`);
  }

  console.log(`\n\n  생성: ${created}`);
  console.log(`  건너뜀 (소스 부족): ${skipped}`);
  console.log(`\n  ✅ character-profiles/ (${created} profiles, 14-source fusion)\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
