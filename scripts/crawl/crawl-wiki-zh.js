#!/usr/bin/env node
/**
 * 중국어 위키백과 삼국지 캐릭터 크롤러
 *
 * Chinese Wikipedia REST API를 사용하여 캐릭터 정보 수집.
 * - Summary: https://zh.wikipedia.org/api/rest_v1/page/summary/{title}
 * - HTML:    https://zh.wikipedia.org/api/rest_v1/page/html/{title}
 *
 * Usage:
 *   node scripts/crawl/crawl-wiki-zh.js              # Tier 0 + Tier 1 (80명)
 *   node scripts/crawl/crawl-wiki-zh.js --tier 0      # Tier 0만 (20명)
 *   node scripts/crawl/crawl-wiki-zh.js --name 조조   # 특정 캐릭터 (KR/EN/CN 이름)
 *   node scripts/crawl/crawl-wiki-zh.js --resume       # 이미 크롤된 건 스킵
 *
 * Output: data/raw/characters-wiki-zh/{name_en_lower}.json
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { TIER_0, TIER_1, ALL_CHARACTERS } from './character-list.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'data', 'raw', 'characters-wiki-zh');

// ── CLI ──
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const hasFlag = (f) => args.includes(f);

const tierFilter = getArg('--tier');
const nameFilter = getArg('--name');
const resume = hasFlag('--resume');
const delay = parseInt(getArg('--delay') || '1000', 10);

// ── 대상 선정 ──
let targets;
if (nameFilter) {
  targets = ALL_CHARACTERS.filter(c =>
    c.name_kr === nameFilter ||
    c.name_en.toLowerCase() === nameFilter.toLowerCase() ||
    c.name_cn === nameFilter
  );
  if (!targets.length) { console.error(`"${nameFilter}" not found in character list`); process.exit(1); }
} else if (tierFilter === '0') {
  targets = TIER_0;
} else if (tierFilter === '1') {
  targets = TIER_1;
} else {
  targets = ALL_CHARACTERS;
}

// ── 유틸 ──
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const safeFilename = (name) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

const UA = 'wdttgukji-crawler/1.0 (https://github.com/pkc; Three Kingdoms research project)';

const WIKI_API = 'https://zh.wikipedia.org/api/rest_v1/page';

/**
 * 동음이의어 대응을 위한 대체 제목 패턴.
 * name_cn 으로 404이면 순서대로 시도.
 */
const DISAMBIGUATION_SUFFIXES = [
  '_(三國)',
  '_(東漢)',
  '_(三国)',
  '_(东汉)',
  '_(蜀漢)',
  '_(蜀汉)',
  '_(東吳)',
  '_(东吴)',
  '_(曹魏)',
];

/**
 * Wikipedia REST API summary fetch.
 * @returns {{ title: string, extract: string, content_urls: object } | null}
 */
async function fetchSummary(title) {
  const url = `${WIKI_API}/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'application/json',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Summary API ${res.status} for "${title}"`);
  return res.json();
}

/**
 * Wikipedia REST API HTML fetch.
 * @returns {string | null} raw HTML
 */
async function fetchHtml(title) {
  const url = `${WIKI_API}/html/${encodeURIComponent(title)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTML API ${res.status} for "${title}"`);
  return res.text();
}

/**
 * Try title with disambiguation suffixes if direct title returns 404.
 * @returns {{ title: string, summary: object, html: string } | null}
 */
async function fetchWithDisambiguation(baseName) {
  // 1. 직접 시도
  const summary = await fetchSummary(baseName);
  if (summary) {
    await sleep(300); // mini delay before HTML fetch
    const html = await fetchHtml(summary.title || baseName);
    return { title: summary.title || baseName, summary, html };
  }

  // 2. 동음이의어 패턴 순회
  for (const suffix of DISAMBIGUATION_SUFFIXES) {
    const altTitle = baseName + suffix;
    await sleep(300);
    const altSummary = await fetchSummary(altTitle);
    if (altSummary) {
      await sleep(300);
      const html = await fetchHtml(altSummary.title || altTitle);
      return { title: altSummary.title || altTitle, summary: altSummary, html };
    }
  }

  return null;
}

// ── HTML 파싱 ──

/**
 * MediaWiki REST API HTML에서 섹션 + 본문 추출.
 *
 * 중국어 위키백과 REST API HTML 구조:
 * - <section data-mw-section-id="N"> 으로 섹션 래핑
 * - 헤딩: <h2 id="...">, <h3 id="..."> (REST API는 mw-headline span 대신 직접 id)
 * - 본문: <p> 태그
 * - 스킵: .infobox, .navbox, .mw-references-wrap, .reference, .mbox, .sistersitebox
 */
function parseWikiHtml(html) {
  if (!html) return { sections: [], fullText: '' };

  const $ = cheerio.load(html);

  // 불필요한 요소 제거
  $('table.infobox, table.navbox, .navbox, .mw-references-wrap, .reflist').remove();
  $('sup.reference, .reference, .mbox-small, .sistersitebox, .mbox').remove();
  $('table.wikitable').remove(); // 통계 테이블 등
  $('style, script').remove();
  $('.mw-empty-elt').remove();
  $('figure, figcaption').remove(); // 이미지/캡션
  $('.hatnote, .dablink').remove(); // 동음이의어 안내
  $('div.toc, #toc').remove(); // 목차

  const sections = [];
  let currentHeading = 'Introduction';
  let currentLevel = 1;
  let currentParagraphs = [];

  // 섹션 종료 시 저장
  function flushSection() {
    const content = currentParagraphs.join('\n\n').trim();
    if (content.length > 0) {
      sections.push({
        heading: currentHeading,
        level: currentLevel,
        content,
      });
    }
    currentParagraphs = [];
  }

  // 스킵할 섹션 패턴
  const SKIP_HEADINGS = /^(参考文献|參考文獻|参考资料|參考資料|注释|註釋|注释与参考|外部链接|外部連結|延伸阅读|延伸閱讀|参见|參見|相关条目|相關條目|导航|導航|脚注|腳註)$/;

  let skipCurrent = false;

  // REST API HTML: 구조가 flat하거나 <section> 래핑될 수 있음
  // body 내부의 직계 자식을 순회
  const body = $('body').length > 0 ? $('body') : $.root();
  const topLevel = body.children().toArray();

  for (const el of topLevel) {
    const $el = $(el);
    const tag = el.tagName?.toLowerCase();

    // <section> wrapper 안의 내용 처리
    if (tag === 'section') {
      // section 내부를 재귀적으로 처리
      processSectionChildren($, $el, sections, {
        currentHeading, currentLevel, currentParagraphs, skipCurrent,
        flushSection, SKIP_HEADINGS,
      });
      continue;
    }

    // 헤딩 처리
    if (tag === 'h2' || tag === 'h3' || tag === 'h4') {
      flushSection();
      const headingText = $el.text().replace(/\[编辑\]|\[編輯\]|\[edit\]/g, '').trim();
      skipCurrent = SKIP_HEADINGS.test(headingText);
      if (!skipCurrent) {
        currentHeading = headingText;
        currentLevel = parseInt(tag[1], 10);
      }
      continue;
    }

    if (skipCurrent) continue;

    // 본문 <p> 추출
    if (tag === 'p') {
      const text = $el.text().trim();
      if (text.length > 0) {
        currentParagraphs.push(text);
      }
    }

    // <ul>/<ol> 리스트도 텍스트로 수집
    if (tag === 'ul' || tag === 'ol') {
      const items = [];
      $el.find('li').each((_, li) => {
        const text = $(li).text().trim();
        if (text.length > 0) items.push(`- ${text}`);
      });
      if (items.length > 0) {
        currentParagraphs.push(items.join('\n'));
      }
    }
  }

  // 마지막 섹션 flush
  flushSection();

  const fullText = sections
    .map(s => `## ${s.heading}\n${s.content}`)
    .join('\n\n')
    .trim();

  return { sections, fullText };
}

/**
 * <section> 내부 자식 요소를 재귀 처리.
 */
function processSectionChildren($, $section, sections, state) {
  const children = $section.children().toArray();

  for (const el of children) {
    const $el = $(el);
    const tag = el.tagName?.toLowerCase();

    // 중첩 <section>
    if (tag === 'section') {
      processSectionChildren($, $el, sections, state);
      continue;
    }

    // 헤딩
    if (tag === 'h2' || tag === 'h3' || tag === 'h4') {
      // flush 이전 콘텐츠
      const content = state.currentParagraphs.join('\n\n').trim();
      if (content.length > 0) {
        sections.push({
          heading: state.currentHeading,
          level: state.currentLevel,
          content,
        });
      }
      state.currentParagraphs = [];

      const headingText = $el.text().replace(/\[编辑\]|\[編輯\]|\[edit\]/g, '').trim();
      state.skipCurrent = state.SKIP_HEADINGS.test(headingText);
      if (!state.skipCurrent) {
        state.currentHeading = headingText;
        state.currentLevel = parseInt(tag[1], 10);
      }
      continue;
    }

    if (state.skipCurrent) continue;

    if (tag === 'p') {
      const text = $el.text().trim();
      if (text.length > 0) {
        state.currentParagraphs.push(text);
      }
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = [];
      $el.find('li').each((_, li) => {
        const text = $(li).text().trim();
        if (text.length > 0) items.push(`- ${text}`);
      });
      if (items.length > 0) {
        state.currentParagraphs.push(items.join('\n'));
      }
    }
  }

  // section 끝에서 flush (마지막 섹션용)
  const content = state.currentParagraphs.join('\n\n').trim();
  if (content.length > 0) {
    sections.push({
      heading: state.currentHeading,
      level: state.currentLevel,
      content,
    });
    state.currentParagraphs = [];
  }
}

// ── 메인 ──
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\n== Chinese Wikipedia Three Kingdoms Crawler ==`);
  console.log(`   Targets: ${targets.length} characters`);
  console.log(`   Delay: ${delay}ms, Resume: ${resume}`);
  console.log(`   Output: ${OUT_DIR}\n`);

  const results = { success: [], failed: [], skipped: [] };

  for (let i = 0; i < targets.length; i++) {
    const char = targets[i];
    const filename = `${safeFilename(char.name_en)}.json`;
    const outPath = join(OUT_DIR, filename);

    // --resume: 이미 존재하면 스킵
    if (resume && existsSync(outPath)) {
      log(i, char, 'SKIP (already exists)');
      results.skipped.push(char.name_kr);
      continue;
    }

    log(i, char, `fetching "${char.name_cn}" ...`);

    try {
      // 1. Summary + HTML fetch (with disambiguation fallback)
      const result = await fetchWithDisambiguation(char.name_cn);

      if (!result) {
        log(i, char, `  MISS: no Wikipedia page found for "${char.name_cn}"`);
        results.failed.push({ name: char.name_kr, name_cn: char.name_cn, error: '404 - page not found' });
        if (i < targets.length - 1) await sleep(delay);
        continue;
      }

      const { title: wikiTitle, summary: summaryData, html } = result;

      if (wikiTitle !== char.name_cn) {
        log(i, char, `  resolved: "${char.name_cn}" -> "${wikiTitle}"`);
      }

      // 2. Parse HTML
      const { sections, fullText } = parseWikiHtml(html);

      // 3. Build output
      const extract = summaryData?.extract || '';
      const wikiUrl = summaryData?.content_urls?.desktop?.page
        || `https://zh.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`;

      const output = {
        name_cn: char.name_cn,
        name_kr: char.name_kr,
        name_en: char.name_en,
        wiki_title: wikiTitle,
        summary: extract,
        sections,
        full_text: fullText,
        full_text_length: fullText.length,
        wiki_url: wikiUrl,
        crawled_at: new Date().toISOString(),
      };

      writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

      log(i, char, `  OK: ${fullText.length.toLocaleString()} chars, ${sections.length} sections`);
      results.success.push(char.name_kr);

    } catch (err) {
      log(i, char, `  FAIL: ${err.message}`);
      results.failed.push({ name: char.name_kr, name_cn: char.name_cn, error: err.message });
    }

    // Rate limit
    if (i < targets.length - 1) await sleep(delay);
  }

  // ── Summary ──
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Done: OK ${results.success.length} / SKIP ${results.skipped.length} / FAIL ${results.failed.length}`);
  if (results.failed.length > 0) {
    console.log('Failed:');
    for (const f of results.failed) {
      console.log(`  - ${f.name} (${f.name_cn}): ${f.error}`);
    }
  }

  // 총 텍스트 통계
  let totalChars = 0;
  for (const name of results.success) {
    const c = ALL_CHARACTERS.find(ch => ch.name_kr === name);
    if (!c) continue;
    try {
      const data = JSON.parse(readFileSync(join(OUT_DIR, `${safeFilename(c.name_en)}.json`), 'utf-8'));
      totalChars += data.full_text_length;
    } catch { /* ignore */ }
  }
  if (totalChars > 0) console.log(`Total text: ${totalChars.toLocaleString()} chars`);
  console.log(`${'='.repeat(50)}\n`);
}

function log(i, char, msg) {
  console.log(`  [${i + 1}/${targets.length}] ${char.name_kr}(${char.name_cn}) ${msg}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
