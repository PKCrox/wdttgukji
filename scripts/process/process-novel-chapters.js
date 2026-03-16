#!/usr/bin/env node
/**
 * P1: 연의 원문 처리 — 대화 추출 + 캐릭터 동시출현 매트릭스
 *
 * 입력: data/raw/novel-wikisource/ (120회 중문 원문)
 * 출력:
 *   - data/processed/novel-dialogues.json     (화자 귀속 대화)
 *   - data/processed/novel-cooccurrence.json   (캐릭터 동시출현 매트릭스)
 *   - data/processed/novel-chapter-index.json  (회차별 인덱스)
 *
 * 화자 귀속 로직:
 *   1. 「...」 또는 "..." 패턴에서 대화 추출
 *   2. XX曰: 패턴으로 화자 귀속 (曰/言/道/叫/喝/怒/笑/歎/嘆)
 *   3. 캐릭터 명사전(character-list.js)의 name_cn으로 매칭
 *   4. 자(字)로도 매칭 (孟德→조조, 玄德→유비 등)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const NOVEL_DIR = join(ROOT, 'data', 'raw', 'novel-wikisource');
const OUT_DIR = join(ROOT, 'data', 'processed');

// ── 캐릭터 명사전 구축 ──
async function buildCharacterDict() {
  const { ALL_CHARACTERS } = await import('../crawl/character-list.js');

  // name_cn → character 매핑
  const cnMap = {};
  // 자(字, courtesy) → character 매핑
  const courtesyMap = {};
  // 성(姓) → [characters] 매핑 (XX曰에서 성만 나올 때)
  const surnameMap = {};

  for (const c of ALL_CHARACTERS) {
    cnMap[c.name_cn] = c;

    // 자 매핑
    if (c.courtesy_cn) {
      courtesyMap[c.courtesy_cn] = c;
    }

    // 성 매핑 (첫 글자, 복성 고려)
    const cn = c.name_cn;
    const doubleSurnames = ['夏侯', '諸葛', '司馬', '公孫', '太史'];
    let surname;
    for (const ds of doubleSurnames) {
      if (cn.startsWith(ds)) { surname = ds; break; }
    }
    if (!surname) surname = cn[0];

    if (!surnameMap[surname]) surnameMap[surname] = [];
    surnameMap[surname].push(c);
  }

  return { cnMap, courtesyMap, surnameMap, ALL_CHARACTERS };
}

// ── 대화 추출 ──
function extractDialogues(text, chapter, dict) {
  const dialogues = [];
  const { cnMap, courtesyMap, surnameMap } = dict;

  // 패턴: XX曰(언/도/...): 「...」 또는 "..."
  // 화자 + 발화동사 + 대화 내용
  const speechVerbs = '曰|言|道|叫|喝|怒曰|笑曰|大怒曰|嘆曰|歎曰|嘆息曰|大喜曰|問曰|答曰|呵曰|罵曰|謂.*曰|對.*曰|告.*曰|密謂.*曰';

  // 패턴1: "XX(발화동사)：「대사」" 형태
  const pattern1 = new RegExp(
    `([\\u4e00-\\u9fff]{1,6})(?:${speechVerbs})[：:]?\\s*[「"]((?:[^」"]*?(?:\\n(?![\\u4e00-\\u9fff]{1,6}(?:${speechVerbs})))[^」"]*?)*[^」"]*?)[」"]`,
    'g'
  );

  // 패턴2: "XX曰：대사。" (따옴표 없이 。로 끝나는 경우)
  const pattern2 = new RegExp(
    `([\\u4e00-\\u9fff]{1,6})(?:${speechVerbs})[：:]\\s*([^。]+。)`,
    'g'
  );

  const seen = new Set(); // 중복 방지

  for (const pattern of [pattern1, pattern2]) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const speakerRaw = match[1].trim();
      const dialogue = match[2].trim();

      if (dialogue.length < 4) continue; // 너무 짧은 건 스킵

      const key = `${speakerRaw}:${dialogue.substring(0, 30)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // 화자 해석
      const character = resolveCharacter(speakerRaw, dict);

      dialogues.push({
        chapter,
        speaker_raw: speakerRaw,
        speaker: character ? {
          name_kr: character.name_kr,
          name_en: character.name_en,
          name_cn: character.name_cn,
          faction: character.faction,
        } : null,
        text: dialogue,
        text_length: dialogue.length,
      });
    }
  }

  return dialogues;
}

// ── 화자 해석 ──
function resolveCharacter(raw, dict) {
  const { cnMap, courtesyMap, surnameMap } = dict;

  // 정확 매칭: 풀네임
  if (cnMap[raw]) return cnMap[raw];

  // 자(字) 매칭
  if (courtesyMap[raw]) return courtesyMap[raw];

  // 성+이름 부분 매칭 (XX 중 XX가 풀네임의 일부)
  for (const [cn, char] of Object.entries(cnMap)) {
    if (cn.includes(raw) || raw.includes(cn)) return char;
  }

  // 성만으로 매칭 (해당 장에서 유일한 캐릭터면 귀속)
  // 이 경우는 null 반환하고, 후처리에서 컨텍스트로 해석
  return null;
}

// ── 동시출현 매트릭스 ──
function buildCooccurrence(chapterData) {
  const matrix = {};
  const chapterAppearances = {};

  for (const { chapter, characters } of chapterData) {
    // 해당 장에 등장하는 캐릭터 리스트
    const chars = [...new Set(characters)];

    for (const c of chars) {
      if (!chapterAppearances[c]) chapterAppearances[c] = [];
      chapterAppearances[c].push(chapter);
    }

    // 모든 쌍 조합
    for (let i = 0; i < chars.length; i++) {
      for (let j = i + 1; j < chars.length; j++) {
        const a = chars[i] < chars[j] ? chars[i] : chars[j];
        const b = chars[i] < chars[j] ? chars[j] : chars[i];
        const key = `${a}:${b}`;
        if (!matrix[key]) matrix[key] = { a, b, count: 0, chapters: [] };
        matrix[key].count++;
        matrix[key].chapters.push(chapter);
      }
    }
  }

  return { matrix: Object.values(matrix), chapterAppearances };
}

// ── 메인 ──
async function main() {
  console.log('\n📖 P1: 연의 원문 처리 파이프라인\n');

  const dict = await buildCharacterDict();
  console.log(`  캐릭터 사전: ${Object.keys(dict.cnMap).length}명 (CN), ${Object.keys(dict.courtesyMap).length}명 (字)`);

  // 120회 로드
  const files = readdirSync(NOVEL_DIR)
    .filter(f => f.startsWith('chapter-') && f.endsWith('.json'))
    .sort();

  console.log(`  원문 파일: ${files.length}회\n`);

  const allDialogues = [];
  const chapterIndex = [];
  const chapterData = [];

  for (const file of files) {
    const path = join(NOVEL_DIR, file);
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    const chapter = raw.chapter_number;
    const text = raw.text || '';

    // 대화 추출
    const dialogues = extractDialogues(text, chapter, dict);
    allDialogues.push(...dialogues);

    // 해당 장에 언급된 캐릭터 (크롤 데이터 + 대화 화자)
    const mentionedFromCrawl = (raw.characters_mentioned || [])
      .map(c => c.name_en)
      .filter(Boolean);
    const mentionedFromDialogue = dialogues
      .filter(d => d.speaker)
      .map(d => d.speaker.name_en);
    const allMentioned = [...new Set([...mentionedFromCrawl, ...mentionedFromDialogue])];

    chapterData.push({ chapter, characters: allMentioned });

    // 인덱스 엔트리
    const attributed = dialogues.filter(d => d.speaker !== null).length;
    chapterIndex.push({
      chapter,
      title: raw.chapter_title || '',
      title_full: raw.chapter_title_full || '',
      text_length: text.length,
      dialogue_count: dialogues.length,
      attributed_count: attributed,
      attribution_rate: dialogues.length > 0 ? +(attributed / dialogues.length * 100).toFixed(1) : 0,
      characters_mentioned: allMentioned,
      character_count: allMentioned.length,
    });

    const rate = dialogues.length > 0 ? (attributed / dialogues.length * 100).toFixed(0) : 'N/A';
    process.stdout.write(`  [${String(chapter).padStart(3)}] ${dialogues.length}대화 (귀속 ${rate}%) ${allMentioned.length}명\r`);
  }

  console.log('\n');

  // 동시출현 매트릭스
  const { matrix, chapterAppearances } = buildCooccurrence(chapterData);

  // 통계
  const totalDialogues = allDialogues.length;
  const attributed = allDialogues.filter(d => d.speaker !== null).length;
  const topSpeakers = {};
  for (const d of allDialogues) {
    if (d.speaker) {
      const name = d.speaker.name_en;
      topSpeakers[name] = (topSpeakers[name] || 0) + 1;
    }
  }
  const topSpeakerList = Object.entries(topSpeakers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  console.log(`  총 대화: ${totalDialogues}`);
  console.log(`  화자 귀속: ${attributed} (${(attributed / totalDialogues * 100).toFixed(1)}%)`);
  console.log(`  동시출현 쌍: ${matrix.length}`);
  console.log(`\n  Top 15 화자:`);
  for (const [name, count] of topSpeakerList) {
    console.log(`    ${name}: ${count}회`);
  }

  // 대화 중 가장 많이 동시출현하는 쌍
  const topPairs = matrix.sort((a, b) => b.count - a.count).slice(0, 10);
  console.log(`\n  Top 10 동시출현:`);
  for (const p of topPairs) {
    console.log(`    ${p.a} ↔ ${p.b}: ${p.count}회`);
  }

  // 저장
  writeFileSync(
    join(OUT_DIR, 'novel-dialogues.json'),
    JSON.stringify({
      total: totalDialogues,
      attributed: attributed,
      attribution_rate: +(attributed / totalDialogues * 100).toFixed(1),
      generated_at: new Date().toISOString(),
      dialogues: allDialogues,
    }, null, 2),
    'utf-8'
  );

  writeFileSync(
    join(OUT_DIR, 'novel-cooccurrence.json'),
    JSON.stringify({
      total_pairs: matrix.length,
      chapter_appearances: chapterAppearances,
      generated_at: new Date().toISOString(),
      pairs: matrix,
    }, null, 2),
    'utf-8'
  );

  writeFileSync(
    join(OUT_DIR, 'novel-chapter-index.json'),
    JSON.stringify({
      total_chapters: chapterIndex.length,
      generated_at: new Date().toISOString(),
      chapters: chapterIndex,
    }, null, 2),
    'utf-8'
  );

  console.log(`\n  ✅ novel-dialogues.json (${totalDialogues} dialogues)`);
  console.log(`  ✅ novel-cooccurrence.json (${matrix.length} pairs)`);
  console.log(`  ✅ novel-chapter-index.json (${chapterIndex.length} chapters)\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
