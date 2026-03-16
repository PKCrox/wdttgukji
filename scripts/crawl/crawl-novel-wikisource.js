#!/usr/bin/env node
/**
 * Chinese Wikisource 三國演義 크롤러
 *
 * 나무위키에 개별 회차 페이지가 없어서 중국어 위키문헌에서 원문 수집.
 * URL 패턴: https://zh.wikisource.org/wiki/三國演義/第NNN回 (001~120)
 *
 * Usage:
 *   node scripts/crawl/crawl-novel-wikisource.js              # 전체 120회
 *   node scripts/crawl/crawl-novel-wikisource.js --resume      # 이미 크롤된 건 스킵
 *   node scripts/crawl/crawl-novel-wikisource.js --chapter 42  # 특정 회차만
 *   node scripts/crawl/crawl-novel-wikisource.js --delay 2000  # 요청 간격 (ms, 기본 1000)
 *
 * Output: data/raw/novel-wikisource/chapter-NNN.json
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { ALL_CHARACTERS } from './character-list.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'data', 'raw', 'novel-wikisource');

// ── CLI ──
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const hasFlag = (f) => args.includes(f);

const resume = hasFlag('--resume');
const delay = parseInt(getArg('--delay') || '1000', 10);
const singleChapter = getArg('--chapter') ? parseInt(getArg('--chapter'), 10) : null;

// ── Character detection (name_cn + courtesy_cn) ──
const CN_NAMES = [];
for (const c of ALL_CHARACTERS) {
  // Map each Chinese name/courtesy back to the character object
  if (c.name_cn) CN_NAMES.push({ text: c.name_cn, char: c });
  if (c.courtesy_cn) CN_NAMES.push({ text: c.courtesy_cn, char: c });
}
// Sort by length descending so longer names match first (e.g. 諸葛亮 before 葛亮)
CN_NAMES.sort((a, b) => b.text.length - a.text.length);

function detectCharacters(text) {
  if (!text) return [];
  const found = new Map(); // name_cn -> character object
  for (const { text: name, char } of CN_NAMES) {
    if (text.includes(name) && !found.has(char.name_cn)) {
      found.set(char.name_cn, {
        name_cn: char.name_cn,
        name_kr: char.name_kr,
        name_en: char.name_en,
        faction: char.faction,
        tier: char.tier,
      });
    }
  }
  // Sort by tier (0 first), then by name
  return [...found.values()].sort((a, b) => a.tier - b.tier || a.name_cn.localeCompare(b.name_cn));
}

// ── Utils ──
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Fetch a chapter page from Chinese Wikisource.
 * Uses the regular wiki page (not REST API) as it's more reliable.
 * Returns HTML string or null on 404.
 */
async function fetchChapter(num) {
  const padded = String(num).padStart(3, '0');
  const title = `三國演義/第${padded}回`;
  const url = `https://zh.wikisource.org/wiki/${encodeURIComponent(title)}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-TW,zh;q=0.9',
    },
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for chapter ${num}`);
  return await res.text();
}

/**
 * Parse chapter HTML and extract title + clean text.
 */
function parseChapter(html, chapterNum) {
  const $ = cheerio.load(html);

  // ── Extract chapter title from the ws-header table ──
  // Pattern: "第一回　宴桃園豪傑三結義　斬黃巾英雄首立功"
  let chapterTitle = '';
  let chapterTitleFull = '';

  // The header is in a table with class ws-header
  const headerCells = $('table.ws-header td');
  headerCells.each((_, td) => {
    const text = $(td).text().trim();
    // Match "第X回" pattern followed by the title
    const match = text.match(/^(第[一二三四五六七八九十百零廿卅〇０-９0-9]+回)[　\s]+(.+)$/);
    if (match) {
      chapterTitleFull = text;
      chapterTitle = match[2].trim();
    }
  });

  // If we didn't find it in headers, try the page title
  if (!chapterTitle) {
    const pageTitle = $('title').text();
    const m = pageTitle.match(/第\d+回[　\s]+(.+?)(?:\s*-|$)/);
    if (m) chapterTitle = m[1].trim();
  }

  // ── Extract body text ──
  // The content is inside .mw-parser-output, after the ws-header tables
  const $content = $('.mw-parser-output');

  // Remove navigation tables (ws-header), category links, edit links, noprint elements
  $content.find('table.ws-header').remove();
  $content.find('.noprint').remove();
  $content.find('.catlinks').remove();
  $content.find('[typeof="mw:Transclusion"]').each((_, el) => {
    // Remove the Novel-f footer template (navigation)
    const $el = $(el);
    if ($el.is('div') || $el.is('table')) {
      const mwData = $el.attr('data-mw');
      if (mwData && (mwData.includes('Novel-f') || mwData.includes('"Novel"'))) {
        $el.remove();
      }
    }
  });

  // Also remove remaining navigation tables at the bottom
  $content.find('table').each((_, table) => {
    const $table = $(table);
    const text = $table.text();
    if (text.includes('上一回') || text.includes('下一回') || text.includes('返回頁首')) {
      $table.remove();
    }
  });

  // Remove any remaining elements with ws-header after the Novel template removal
  $content.find('table.ws-header').remove();

  // Extract text from paragraphs and poetry (dl/dd)
  const paragraphs = [];
  $content.children('p, dl, section').each((_, el) => {
    const $el = $(el);
    if ($el.is('section')) {
      // For section elements, extract p and dl within
      $el.children('p, dl').each((_, child) => {
        const text = extractElementText($, $(child));
        if (text) paragraphs.push(text);
      });
    } else {
      const text = extractElementText($, $el);
      if (text) paragraphs.push(text);
    }
  });

  // If content was wrapped in a section, also get direct children
  if (paragraphs.length === 0) {
    $content.find('p, dl > dd > dl > dd').each((_, el) => {
      const text = $(el).text().trim();
      if (text) paragraphs.push(text);
    });
  }

  const fullText = paragraphs.join('\n\n');

  return {
    chapter_title: chapterTitle,
    chapter_title_full: chapterTitleFull,
    text: fullText,
  };
}

/**
 * Extract clean text from a p or dl element.
 */
function extractElementText($, $el) {
  if ($el.is('p')) {
    return $el.text().trim();
  }
  if ($el.is('dl')) {
    // Poetry structure: <dl><dd><dl><dd>line1</dd><dd>line2</dd></dl></dd></dl>
    // Only extract the innermost dd elements (those without nested dl/dd)
    const lines = [];
    $el.find('dd').each((_, dd) => {
      const $dd = $(dd);
      // Skip dd elements that contain nested dl (they're just wrappers)
      if ($dd.children('dl').length > 0) return;
      const line = $dd.text().trim();
      if (line) lines.push(line);
    });
    return lines.join('\n');
  }
  return '';
}

// ── Main ──
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const start = singleChapter || 1;
  const end = singleChapter || 120;
  const totalCount = end - start + 1;

  console.log(`\n=== Chinese Wikisource 三國演義 크롤러 ===`);
  console.log(`   범위: 제${start}회 ~ 제${end}회 (${totalCount}개)`);
  console.log(`   딜레이: ${delay}ms, 재개모드: ${resume}`);
  console.log(`   캐릭터 DB: ${ALL_CHARACTERS.length}명 (name_cn + courtesy_cn)`);
  console.log(`   출력: ${OUT_DIR}\n`);

  const results = { success: [], failed: [], skipped: [], notFound: [] };

  for (let n = start; n <= end; n++) {
    const idx = n - start + 1;
    const padded = String(n).padStart(3, '0');
    const filename = `chapter-${padded}.json`;
    const outPath = join(OUT_DIR, filename);

    // ── Resume check ──
    if (resume && existsSync(outPath)) {
      log(idx, totalCount, `제${n}회`, 'SKIP (이미 존재)');
      results.skipped.push(n);
      continue;
    }

    log(idx, totalCount, `제${n}회`, '크롤 시작...');

    try {
      const html = await fetchChapter(n);

      if (!html) {
        log(idx, totalCount, `제${n}회`, '404 — 페이지 없음');
        results.notFound.push(n);
        if (idx < totalCount) await sleep(delay);
        continue;
      }

      const parsed = parseChapter(html, n);
      const characters = detectCharacters(parsed.text);

      const output = {
        chapter_number: n,
        chapter_title: parsed.chapter_title,
        chapter_title_full: parsed.chapter_title_full,
        text: parsed.text,
        text_length: parsed.text.length,
        characters_mentioned: characters,
        characters_count: characters.length,
        source_url: `https://zh.wikisource.org/wiki/${encodeURIComponent(`三國演義/第${padded}回`)}`,
        crawled_at: new Date().toISOString(),
      };

      writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
      log(idx, totalCount, `제${n}회`,
        `OK: "${parsed.chapter_title}" — ${parsed.text.length.toLocaleString()}자, ${characters.length}인물`);
      results.success.push(n);

    } catch (err) {
      log(idx, totalCount, `제${n}회`, `FAIL: ${err.message}`);
      results.failed.push({ num: n, error: err.message });
    }

    if (idx < totalCount) await sleep(delay);
  }

  // ── Summary ──
  console.log(`\n${'='.repeat(60)}`);
  console.log(`완료:`);
  console.log(`  OK:       ${results.success.length}`);
  console.log(`  SKIP:     ${results.skipped.length}`);
  console.log(`  404:      ${results.notFound.length}`);
  console.log(`  FAIL:     ${results.failed.length}`);

  if (results.notFound.length > 0) {
    console.log(`\n404 목록:`);
    for (const n of results.notFound) console.log(`  - 제${n}회`);
  }

  if (results.failed.length > 0) {
    console.log(`\n실패 목록:`);
    for (const f of results.failed) console.log(`  - 제${f.num}회: ${f.error}`);
  }

  // Total stats across all files
  let totalChars = 0;
  let fileCount = 0;
  try {
    const files = readdirSync(OUT_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const data = JSON.parse(readFileSync(join(OUT_DIR, f), 'utf-8'));
        totalChars += data.text_length || 0;
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
