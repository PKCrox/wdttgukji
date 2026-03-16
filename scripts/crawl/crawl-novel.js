#!/usr/bin/env node
/**
 * 나무위키 삼국지연의 소설 크롤러
 *
 * 삼국지연의 개별 회차(제1회~제120회) + 유명 에피소드/사건/전략/유물 페이지 크롤링
 *
 * Usage:
 *   node scripts/crawl/crawl-novel.js                    # 전체 (120회 + 에피소드)
 *   node scripts/crawl/crawl-novel.js --chapters         # 회차만
 *   node scripts/crawl/crawl-novel.js --episodes         # 에피소드만
 *   node scripts/crawl/crawl-novel.js --resume           # 이미 크롤된 건 스킵
 *   node scripts/crawl/crawl-novel.js --delay 3000       # 요청 간격 (ms, 기본 2000)
 *   node scripts/crawl/crawl-novel.js --chapter 42       # 특정 회차만
 *   node scripts/crawl/crawl-novel.js --episode 도원결의  # 특정 에피소드만
 *
 * Output: data/raw/novel/{chapter-NNN.json | episode-{slug}.json}
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseNamuHtml } from './lib/namu-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'data', 'raw', 'novel');

// ── CLI ──
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const hasFlag = (f) => args.includes(f);

const chaptersOnly = hasFlag('--chapters');
const episodesOnly = hasFlag('--episodes');
const resume = hasFlag('--resume');
const delay = parseInt(getArg('--delay') || '2000', 10);
const singleChapter = getArg('--chapter') ? parseInt(getArg('--chapter'), 10) : null;
const singleEpisode = getArg('--episode');

// ── 유틸 ──
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function safeSlug(str) {
  return str
    .toLowerCase()
    .replace(/[/\\]/g, '-')
    .replace(/[()（）]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function fetchPage(title) {
  const url = `https://namu.wiki/w/${encodeURIComponent(title)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${title}`);
  const html = await res.text();
  if (html.includes('cf-challenge') || html.includes('Checking your browser')) {
    throw new Error(`Cloudflare for ${title}`);
  }
  return html;
}

/**
 * 주요 삼국지 인물 목록 (본문에서 언급 감지용)
 * 완전 매칭이 아니라 includes 기반이므로 주요 인물만
 */
const KNOWN_CHARACTERS = [
  '유비', '관우', '장비', '제갈량', '조조', '손권', '여포', '동탁', '원소',
  '조운', '마초', '황충', '위연', '방통', '강유', '유선', '마속', '법정',
  '사마의', '순욱', '곽가', '하후돈', '하후연', '장료', '장합', '서황',
  '전위', '허저', '조인', '조비', '방덕', '서서', '종회', '등애', '가후',
  '주유', '노숙', '여몽', '육손', '손견', '손책', '감녕', '주태', '태사자',
  '황개', '초선', '원술', '진궁', '장각', '유표', '장수', '공손찬', '맹획',
  '화타', '손부인', '손상향', '안량', '문추', '마량', '관흥', '장포',
  '조홍', '문앙', '이엄', '감택', '대교', '소교', '축융', '장송',
  '왕윤', '조자룡', '공명', '현덕', '운장', '익덕', '맹덕', '중달',
  '봉선', '관평', '요화', '장완', '비의', '동승', '복황후', '헌제',
  '유장', '장임', '엄안', '곽도', '심배', '전풍', '저수', '순유',
  '조앙', '조식', '정욱', '만총', '이전', '악진', '우금',
  '정보', '여대', '제갈각', '제갈근', '보연사', '제갈첨',
  '마대', '왕평', '장익', '하후무재', '조상', '사마소', '사마사', '사마염',
];

/**
 * 본문에서 캐릭터 언급 추출
 */
function extractCharacters(text) {
  if (!text) return [];
  const found = new Set();
  for (const name of KNOWN_CHARACTERS) {
    if (text.includes(name)) found.add(name);
  }
  return [...found].sort();
}

// ── 회차 정의 (제1회 ~ 제120회) ──
// 나무위키 URL 패턴 후보: 삼국지연의/제N회, 삼국지연의/N회 등
function buildChapterTargets() {
  const chapters = [];
  const start = singleChapter || 1;
  const end = singleChapter || 120;

  for (let n = start; n <= end; n++) {
    const padded = String(n);
    chapters.push({
      num: n,
      // 시도할 나무위키 제목 패턴 (우선순위순)
      titleCandidates: [
        `삼국지연의/제${padded}회`,
        `삼국지연의/${padded}회`,
        `삼국지연의 제${padded}회`,
      ],
      filename: `chapter-${String(n).padStart(3, '0')}.json`,
      type: 'chapter',
    });
  }
  return chapters;
}

// ── 에피소드/사건/유물/전략 정의 ──
/**
 * @typedef {{ title_kr: string, title_en: string, namu_titles: string[], type: string }} EpisodeDef
 */

/** @type {EpisodeDef[]} */
const EPISODE_DEFS = [
  // ── 유명 사건/에피소드 ──
  { title_kr: '도원결의', title_en: 'Oath of the Peach Garden', namu_titles: ['도원결의'], type: 'episode' },
  { title_kr: '삼고초려', title_en: 'Three Visits to the Thatched Cottage', namu_titles: ['삼고초려'], type: 'episode' },
  { title_kr: '출사표', title_en: 'Memorial on Dispatching the Troops', namu_titles: ['출사표'], type: 'episode' },
  { title_kr: '후출사표', title_en: 'Later Memorial on Dispatching the Troops', namu_titles: ['후출사표'], type: 'episode' },
  { title_kr: '적벽대전', title_en: 'Battle of Red Cliffs', namu_titles: ['적벽대전', '적벽대전/삼국지연의', '적벽 대전'], type: 'episode' },
  { title_kr: '관도대전', title_en: 'Battle of Guandu', namu_titles: ['관도대전', '관도대전/삼국지연의', '관도 대전'], type: 'episode' },
  { title_kr: '이릉대전', title_en: 'Battle of Yiling', namu_titles: ['이릉대전', '이릉대전/삼국지연의', '이릉 대전'], type: 'episode' },

  // ── 유명 유물/무기 ──
  { title_kr: '적토마', title_en: 'Red Hare', namu_titles: ['적토마'], type: 'artifact' },
  { title_kr: '청룡언월도', title_en: 'Green Dragon Crescent Blade', namu_titles: ['청룡언월도'], type: 'artifact' },
  { title_kr: '방천화극', title_en: 'Sky Piercer Halberd', namu_titles: ['방천화극'], type: 'artifact' },

  // ── 전략/계책 ──
  { title_kr: '칠종칠금', title_en: 'Seven Captures of Meng Huo', namu_titles: ['칠종칠금'], type: 'strategy' },
  { title_kr: '공성계', title_en: 'Empty Fort Strategy', namu_titles: ['공성계'], type: 'strategy' },
  { title_kr: '고육지계', title_en: 'Self-Injury Scheme', namu_titles: ['고육지계', '고육계'], type: 'strategy' },
  { title_kr: '연환계', title_en: 'Chain Stratagem', namu_titles: ['연환계'], type: 'strategy' },
  { title_kr: '이간계', title_en: 'Sow Discord', namu_titles: ['이간계'], type: 'strategy' },
  { title_kr: '미인계', title_en: 'Beauty Trap', namu_titles: ['미인계(삼국지연의)', '미인계'], type: 'strategy' },

  // ── 유명 장면/고사 ──
  { title_kr: '읍참마속', title_en: 'Weeping as Ma Su is Executed', namu_titles: ['읍참마속'], type: 'episode' },
  { title_kr: '사마사중달', title_en: 'Dead Zhuge Scares Away Living Sima', namu_titles: ['사마사중달', '죽은 공명이 산 중달을 쫓다'], type: 'episode' },
  { title_kr: '천하삼분지계', title_en: 'Plan for Three Kingdoms', namu_titles: ['천하삼분지계', '천하삼분'], type: 'strategy' },
  { title_kr: '융중대', title_en: 'Longzhong Plan', namu_titles: ['융중대', '융중대(삼국지)'], type: 'episode' },

  // ── 유명 시/문학 ──
  { title_kr: '단가행', title_en: 'Short Song Style (Duan Ge Xing)', namu_titles: ['단가행'], type: 'episode' },
  { title_kr: '동작대', title_en: 'Bronze Sparrow Terrace', namu_titles: ['동작대'], type: 'artifact' },

  // ── 추가 유명 사건 ──
  { title_kr: '장판파 전투', title_en: 'Battle of Changban', namu_titles: ['장판파 전투', '장판교'], type: 'episode' },
  { title_kr: '합비 전투', title_en: 'Battle of Hefei', namu_titles: ['합비 전투', '합비대전'], type: 'episode' },
  { title_kr: '정군산 전투', title_en: 'Battle of Mount Dingjun', namu_titles: ['정군산 전투', '정군산'], type: 'episode' },
  { title_kr: '오장원', title_en: 'Wuzhang Plains', namu_titles: ['오장원'], type: 'episode' },
  { title_kr: '가정 전투', title_en: 'Battle of Jieting', namu_titles: ['가정 전투', '가정전투'], type: 'episode' },
  { title_kr: '번성 전투', title_en: 'Battle of Fancheng', namu_titles: ['번성 전투', '번성대전'], type: 'episode' },
  { title_kr: '연의 명장면', title_en: 'Famous Scenes', namu_titles: ['삼국지연의/명장면', '삼국지연의/명대사'], type: 'episode' },

  // ── 삼국지연의 메인 문서 ──
  { title_kr: '삼국지연의', title_en: 'Romance of the Three Kingdoms', namu_titles: ['삼국지연의'], type: 'episode' },
];

function buildEpisodeTargets() {
  if (singleEpisode) {
    const match = EPISODE_DEFS.find(e =>
      e.title_kr === singleEpisode || e.title_en.toLowerCase() === singleEpisode.toLowerCase()
    );
    if (!match) {
      console.error(`"${singleEpisode}" 에피소드 없음. 가능한 목록:`);
      for (const e of EPISODE_DEFS) console.error(`  - ${e.title_kr} (${e.title_en})`);
      process.exit(1);
    }
    return [match];
  }
  return EPISODE_DEFS;
}

// ── 크롤 함수 ──

/**
 * 회차 크롤 — 여러 제목 패턴을 순차 시도
 */
async function crawlChapter(target) {
  for (const title of target.titleCandidates) {
    const html = await fetchPage(title);
    if (html) {
      return { html, usedTitle: title };
    }
    // 404: 다음 패턴 시도 (딜레이 없이)
  }
  return null;
}

/**
 * 에피소드 크롤 — 여러 제목 패턴을 순차 시도
 */
async function crawlEpisode(epDef) {
  for (const title of epDef.namu_titles) {
    const html = await fetchPage(title);
    if (html) {
      return { html, usedTitle: title };
    }
  }
  return null;
}

/**
 * 파싱 결과를 출력 JSON으로 변환
 */
function buildOutput({ parsed, usedTitle, type, chapterNum, titleKr, titleEn }) {
  const fullText = parsed.sections
    .map(s => `## ${s.heading}\n${s.content || ''}`)
    .join('\n\n')
    .trim();

  const characters = extractCharacters(fullText);

  return {
    type,
    title_kr: titleKr || parsed.title,
    title_en: titleEn || null,
    chapter_num: chapterNum || null,
    characters_mentioned: characters,
    sections: parsed.sections.map(s => ({
      heading: s.heading,
      level: s.level,
      content: s.content || '',
    })),
    full_text: fullText,
    full_text_length: fullText.length,
    namu_url: `https://namu.wiki/w/${encodeURIComponent(usedTitle)}`,
    namu_title_used: usedTitle,
    internal_links: parsed.internalLinks || [],
    crawled_at: new Date().toISOString(),
  };
}

// ── 메인 ──
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const chapterTargets = (!episodesOnly) ? buildChapterTargets() : [];
  const episodeTargets = (!chaptersOnly) ? buildEpisodeTargets() : [];

  const totalCount = chapterTargets.length + episodeTargets.length;

  console.log(`\n=== 나무위키 삼국지연의 소설 크롤러 ===`);
  console.log(`   회차: ${chapterTargets.length}개, 에피소드: ${episodeTargets.length}개`);
  console.log(`   총 대상: ${totalCount}개`);
  console.log(`   딜레이: ${delay}ms, 재개모드: ${resume}`);
  console.log(`   출력: ${OUT_DIR}\n`);

  const results = { success: [], failed: [], skipped: [], notFound: [] };
  let idx = 0;

  // ── Phase 1: 회차 크롤 ──
  if (chapterTargets.length > 0) {
    console.log(`--- Phase 1: 회차 크롤 (${chapterTargets.length}개) ---\n`);

    for (const target of chapterTargets) {
      idx++;
      const outPath = join(OUT_DIR, target.filename);

      if (resume && existsSync(outPath)) {
        log(idx, totalCount, `제${target.num}회`, 'SKIP (이미 존재)');
        results.skipped.push(`제${target.num}회`);
        continue;
      }

      log(idx, totalCount, `제${target.num}회`, '크롤 시작...');

      try {
        const result = await crawlChapter(target);

        if (!result) {
          log(idx, totalCount, `제${target.num}회`, '404 — 페이지 없음');
          results.notFound.push(`제${target.num}회`);
          if (idx < totalCount) await sleep(delay);
          continue;
        }

        const parsed = parseNamuHtml(result.html);
        const output = buildOutput({
          parsed,
          usedTitle: result.usedTitle,
          type: 'chapter',
          chapterNum: target.num,
          titleKr: `삼국지연의 제${target.num}회`,
          titleEn: `Romance of the Three Kingdoms Ch.${target.num}`,
        });

        writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
        log(idx, totalCount, `제${target.num}회`,
          `OK: ${output.full_text_length.toLocaleString()}자, ${output.sections.length}섹션, ${output.characters_mentioned.length}인물, 패턴="${result.usedTitle}"`);
        results.success.push(`제${target.num}회`);

      } catch (err) {
        log(idx, totalCount, `제${target.num}회`, `FAIL: ${err.message}`);
        results.failed.push({ name: `제${target.num}회`, error: err.message });

        if (err.message.includes('Cloudflare')) {
          log(idx, totalCount, `제${target.num}회`, 'Cloudflare 감지 — 15초 대기');
          await sleep(15000);
        }
      }

      if (idx < totalCount) await sleep(delay);
    }
  }

  // ── Phase 2: 에피소드 크롤 ──
  if (episodeTargets.length > 0) {
    console.log(`\n--- Phase 2: 에피소드/사건/유물/전략 크롤 (${episodeTargets.length}개) ---\n`);

    for (const epDef of episodeTargets) {
      idx++;
      const slug = safeSlug(epDef.title_kr);
      const filename = `episode-${slug}.json`;
      const outPath = join(OUT_DIR, filename);

      if (resume && existsSync(outPath)) {
        log(idx, totalCount, epDef.title_kr, 'SKIP (이미 존재)');
        results.skipped.push(epDef.title_kr);
        continue;
      }

      log(idx, totalCount, epDef.title_kr, `크롤 시작... (${epDef.type})`);

      try {
        const result = await crawlEpisode(epDef);

        if (!result) {
          log(idx, totalCount, epDef.title_kr, '404 — 페이지 없음');
          results.notFound.push(epDef.title_kr);
          if (idx < totalCount) await sleep(delay);
          continue;
        }

        const parsed = parseNamuHtml(result.html);
        const output = buildOutput({
          parsed,
          usedTitle: result.usedTitle,
          type: epDef.type,
          chapterNum: null,
          titleKr: epDef.title_kr,
          titleEn: epDef.title_en,
        });

        writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
        log(idx, totalCount, epDef.title_kr,
          `OK: ${output.full_text_length.toLocaleString()}자, ${output.sections.length}섹션, ${output.characters_mentioned.length}인물`);
        results.success.push(epDef.title_kr);

      } catch (err) {
        log(idx, totalCount, epDef.title_kr, `FAIL: ${err.message}`);
        results.failed.push({ name: epDef.title_kr, error: err.message });

        if (err.message.includes('Cloudflare')) {
          log(idx, totalCount, epDef.title_kr, 'Cloudflare 감지 — 15초 대기');
          await sleep(15000);
        }
      }

      if (idx < totalCount) await sleep(delay);
    }
  }

  // ── 서머리 ──
  console.log(`\n${'='.repeat(60)}`);
  console.log(`완료:`);
  console.log(`  OK:       ${results.success.length}`);
  console.log(`  SKIP:     ${results.skipped.length}`);
  console.log(`  404:      ${results.notFound.length}`);
  console.log(`  FAIL:     ${results.failed.length}`);

  if (results.notFound.length > 0) {
    console.log(`\n404 목록:`);
    for (const name of results.notFound) console.log(`  - ${name}`);
  }

  if (results.failed.length > 0) {
    console.log(`\n실패 목록:`);
    for (const f of results.failed) console.log(`  - ${f.name}: ${f.error}`);
  }

  // 총 텍스트 통계
  let totalChars = 0;
  let fileCount = 0;
  try {
    const { readdirSync } = await import('fs');
    const files = readdirSync(OUT_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const data = JSON.parse(readFileSync(join(OUT_DIR, f), 'utf-8'));
        totalChars += data.full_text_length || 0;
        fileCount++;
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  if (fileCount > 0) {
    console.log(`\n총 파일: ${fileCount}개, 총 텍스트: ${totalChars.toLocaleString()}자`);
  }
  console.log(`${'='.repeat(60)}\n`);
}

function log(idx, total, name, msg) {
  console.log(`  [${idx}/${total}] ${name} — ${msg}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
