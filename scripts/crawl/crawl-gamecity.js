#!/usr/bin/env node
/**
 * Gamecity RTK14 (삼국지14) 무장 목록 크롤러
 *
 * 공식 코에이 삼국지14 무장 일람 페이지에서 1000명의 무장 데이터 수집
 * URL: https://www.gamecity.ne.jp/sangokushi14/officers-list.html
 *
 * 추출 데이터: 번호, 일본어 이름 (한자), 가타카나 읽기
 * (이 페이지에는 능력치 없음 — 이름+읽기만 수록)
 *
 * Usage:
 *   node scripts/crawl/crawl-gamecity.js               # 전체 크롤
 *   node scripts/crawl/crawl-gamecity.js --delay 2000   # 요청 간격 (ms, 기본 2000)
 *
 * Output: data/raw/gamecity-rtk14-officers.json
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'data', 'raw');
const OUT_FILE = join(OUT_DIR, 'gamecity-rtk14-officers.json');

const URL = 'https://www.gamecity.ne.jp/sangokushi14/officers-list.html';

// ── CLI ──
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const delay = parseInt(getArg('--delay') || '2000', 10);

// ── Utils ──
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function fetchWithRetry(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ja,en;q=0.9',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Page is UTF-8 (declared in meta charset)
      const html = await res.text();
      return html;
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`  retry ${attempt}/${retries}: ${err.message}`);
      await sleep(delay * attempt);
    }
  }
}

/**
 * Parse the officers list page.
 *
 * HTML structure:
 *   <div class="officers">
 *     <div>1<b>阿会喃</b>（アカイナン）</div>
 *     <div>2<b>阿貴</b>（アキ）</div>
 *     ...
 *   </div>
 *
 * Each <div> inside .officers contains:
 *   - A number prefix (officer index)
 *   - <b> tag with the kanji name
 *   - Katakana reading in full-width parentheses （...）
 */
function parseOfficers(html) {
  const $ = cheerio.load(html);
  const officers = [];

  $('.officers > div').each((_i, el) => {
    const $el = $(el);
    const fullText = $el.text().trim();
    const nameJa = $el.find('b').text().trim();

    if (!nameJa) return; // skip empty/structural divs

    // Extract number prefix: everything before the <b> tag
    // The HTML is like: "1<b>阿会喃</b>（アカイナン）"
    // After cheerio text(): "1阿会喃（アカイナン）"
    const numMatch = fullText.match(/^(\d+)/);
    const index = numMatch ? parseInt(numMatch[1], 10) : null;

    // Extract katakana reading from full-width parentheses
    const readingMatch = fullText.match(/（(.+?)）/);
    const reading = readingMatch ? readingMatch[1].trim() : null;

    officers.push({
      index,
      name_ja: nameJa,
      reading_katakana: reading,
    });
  });

  return officers;
}

// ── Main ──
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log('\n=== Gamecity RTK14 Officers Crawler ===');
  console.log(`   url: ${URL}`);
  console.log(`   output: ${OUT_FILE}\n`);

  console.log('  fetching officers list...');
  const html = await fetchWithRetry(URL);

  console.log('  parsing HTML...');
  const officers = parseOfficers(html);

  if (officers.length === 0) {
    console.error('  ERROR: no officers parsed. Page structure may have changed.');
    process.exit(1);
  }

  // Validate: check for expected count (~1000)
  const hasIndex = officers.filter(o => o.index !== null);
  const maxIndex = hasIndex.length > 0 ? Math.max(...hasIndex.map(o => o.index)) : 0;

  console.log(`  parsed: ${officers.length} officers (max index: ${maxIndex})`);

  // Check for duplicates
  const names = officers.map(o => o.name_ja);
  const uniqueNames = new Set(names);
  if (uniqueNames.size < names.length) {
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    console.log(`  note: ${dupes.length} duplicate name(s): ${[...new Set(dupes)].slice(0, 5).join(', ')}...`);
  }

  // Build output
  const output = {
    source: 'gamecity.ne.jp',
    source_url: URL,
    game: '三國志14 (RTK14)',
    description: 'Official Koei Tecmo RTK14 officer list — names and katakana readings only (no stats on this page)',
    total_officers: officers.length,
    officers,
    crawled_at: new Date().toISOString(),
  };

  writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`\n  done: ${officers.length} officers → ${OUT_FILE}`);
  console.log(`  file size: ${(JSON.stringify(output).length / 1024).toFixed(1)} KB\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
