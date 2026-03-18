#!/usr/bin/env node
/**
 * 제타위키 삼국지 능력치 크롤러
 *
 * ROTK 10/11/12 능력치 데이터를 zetawiki.com에서 크롤.
 * 각 게임마다 테이블 컬럼이 다름 — 자동 감지.
 *
 * Usage:
 *   node scripts/crawl/crawl-zetawiki-stats.js                  # 전체 (10, 12) — 11은 이미 존재
 *   node scripts/crawl/crawl-zetawiki-stats.js --game 10        # ROTK 10만
 *   node scripts/crawl/crawl-zetawiki-stats.js --game 12        # ROTK 12만
 *   node scripts/crawl/crawl-zetawiki-stats.js --game all       # 10 + 12 (11은 스킵)
 *   node scripts/crawl/crawl-zetawiki-stats.js --game 11        # 11 강제 재크롤
 *   node scripts/crawl/crawl-zetawiki-stats.js --resume         # 이미 존재하는 파일 스킵
 *   node scripts/crawl/crawl-zetawiki-stats.js --delay 3000     # 요청 간격 (ms, 기본 2000)
 *
 * Output: data/raw/characters-rotk{N}-stats.json
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'data', 'raw');

// ── CLI ──
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const hasFlag = (f) => args.includes(f);

const gameFilter = getArg('--game') || 'all';
const resume = hasFlag('--resume');
const delay = parseInt(getArg('--delay') || '2000', 10);

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── 게임별 설정 ──
// Korean stat column name → English key mapping
const STAT_KEY_MAP = {
  '통솔': 'leadership',
  '무력': 'war',
  '지력': 'intelligence',
  '정치': 'politics',
  '매력': 'charisma',
  '능력종합': 'total_stats',
  '이름': 'name_kr',
  '이름(한글)': 'name_kr',
  '이름(한자)': 'name_cn',
  '등장연도': 'appearance_year',
  '탄생연도': 'birth',
  '사망연도': 'death',
  '세력상성': 'faction_affinity',
  '개인상성': 'personal_affinity',
  '병과': 'troop_type',
  '전법': 'battle_tactic',
};

// Columns that should be parsed as integers
const NUMERIC_COLS = new Set([
  'leadership', 'war', 'intelligence', 'politics', 'charisma',
  'total_stats', 'appearance_year', 'birth', 'death',
  'faction_affinity', 'personal_affinity',
]);

const GAMES = {
  10: {
    title: '삼국지 10',
    title_en: 'Romance of the Three Kingdoms X',
    url: 'https://zetawiki.com/wiki/%EC%82%BC%EA%B5%AD%EC%A7%80_10_%EB%8A%A5%EB%A0%A5%EC%B9%98_%EB%AA%A9%EB%A1%9D',
    outFile: 'characters-rotk10-stats.json',
  },
  11: {
    title: '삼국지 11',
    title_en: 'Romance of the Three Kingdoms XI',
    url: 'https://zetawiki.com/wiki/%EC%82%BC%EA%B5%AD%EC%A7%80_11_%EB%8A%A5%EB%A0%A5%EC%B9%98_%EB%AA%A9%EB%A1%9D',
    outFile: 'characters-rotk11-stats.json',
  },
  12: {
    title: '삼국지 12',
    title_en: 'Romance of the Three Kingdoms XII',
    url: 'https://zetawiki.com/wiki/%EC%82%BC%EA%B5%AD%EC%A7%80_12_%EB%8A%A5%EB%A0%A5%EC%B9%98_%EB%AA%A9%EB%A1%9D',
    outFile: 'characters-rotk12-stats.json',
  },
};

// ── 대상 선정 ──
function getTargetGames() {
  if (gameFilter === 'all') {
    // Default: 10, 12 (11 already exists, skip unless --game 11)
    return Object.entries(GAMES)
      .filter(([n]) => n !== '11')
      .map(([n, g]) => ({ num: Number(n), ...g }));
  }
  const nums = gameFilter.split(',').map(s => s.trim());
  return nums
    .filter(n => GAMES[n])
    .map(n => ({ num: Number(n), ...GAMES[n] }));
}

// ── HTML Fetch ──
async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// ── 테이블 파싱 ──
function parseStatsTable(html, gameNum) {
  const $ = cheerio.load(html);

  // Find the main data table — usually the largest table with wikitable class
  // or the first sortable table
  const tables = $('table.wikitable, table.sortable, table.mw-datatable');
  let targetTable = null;

  if (tables.length === 0) {
    // Fallback: find any table with enough rows
    const allTables = $('table');
    let maxRows = 0;
    allTables.each((_, tbl) => {
      const rowCount = $(tbl).find('tr').length;
      if (rowCount > maxRows) {
        maxRows = rowCount;
        targetTable = tbl;
      }
    });
  } else {
    // Pick the largest wikitable
    let maxRows = 0;
    tables.each((_, tbl) => {
      const rowCount = $(tbl).find('tr').length;
      if (rowCount > maxRows) {
        maxRows = rowCount;
        targetTable = tbl;
      }
    });
  }

  if (!targetTable) throw new Error('No data table found');

  const $table = $(targetTable);

  // Extract headers
  const headerRow = $table.find('tr').first();
  const headers = [];
  headerRow.find('th, td').each((_, el) => {
    const text = $(el).text().trim();
    headers.push(text);
  });

  if (headers.length < 3) {
    // Maybe headers are in a thead
    const theadRow = $table.find('thead tr').first();
    headers.length = 0;
    theadRow.find('th').each((_, el) => {
      headers.push($(el).text().trim());
    });
  }

  console.log(`   Headers detected: [${headers.join(', ')}]`);

  // Map headers to English keys
  const colMap = headers.map(h => {
    // Direct match
    if (STAT_KEY_MAP[h]) return STAT_KEY_MAP[h];
    // Partial match — strip parenthetical
    const base = h.replace(/\(.*\)/, '').trim();
    if (STAT_KEY_MAP[base]) return STAT_KEY_MAP[base];
    // Fallback: keep Korean as key, sanitized
    return h.toLowerCase().replace(/[^a-z가-힣0-9]/g, '_').replace(/_+/g, '_');
  });

  // Parse data rows
  const officers = [];
  const dataRows = $table.find('tr').slice(1); // skip header

  dataRows.each((_, row) => {
    const cells = $(row).find('td, th');
    if (cells.length < headers.length * 0.5) return; // skip malformed rows

    const entry = {};
    let hasName = false;

    cells.each((ci, cell) => {
      if (ci >= colMap.length) return;
      const key = colMap[ci];
      let val = $(cell).text().trim();

      if (!val) return;

      if (NUMERIC_COLS.has(key)) {
        // Parse as integer, strip commas or spaces
        const num = parseInt(val.replace(/[,\s]/g, ''), 10);
        if (!isNaN(num)) entry[key] = num;
      } else {
        entry[key] = val;
        if (key === 'name_kr' && val) hasName = true;
      }
    });

    // Must have a name to be a valid entry
    if (hasName && entry.name_kr) {
      officers.push(entry);
    }
  });

  // Build stat_categories from detected numeric columns (in order)
  const statCategories = [];
  const coreStats = ['leadership', 'war', 'intelligence', 'politics', 'charisma'];
  for (const key of coreStats) {
    if (officers.length > 0 && officers[0][key] !== undefined) {
      const krName = Object.entries(STAT_KEY_MAP).find(([, v]) => v === key)?.[0] || key;
      statCategories.push(`${krName}(${capitalize(key)})`);
    }
  }

  // Detect additional columns beyond the core 5
  const additionalCols = [];
  if (officers.length > 0) {
    for (const key of Object.keys(officers[0])) {
      if (key === 'name_kr') continue;
      if (coreStats.includes(key)) continue;
      additionalCols.push(key);
    }
  }

  return { officers, statCategories, additionalCols, headerCount: headers.length };
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── 메인 ──
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const targets = getTargetGames();
  if (targets.length === 0) {
    console.error(`Invalid --game value: "${gameFilter}". Use 10, 11, 12, or all.`);
    process.exit(1);
  }

  console.log(`\n=== Zetawiki ROTK Stats Crawler ===`);
  console.log(`   Games: ${targets.map(g => `ROTK${g.num}`).join(', ')}`);
  console.log(`   Delay: ${delay}ms, Resume: ${resume}`);
  console.log(`   Output: ${OUT_DIR}\n`);

  const results = { success: [], skipped: [], failed: [] };

  for (let i = 0; i < targets.length; i++) {
    const game = targets[i];
    const outPath = join(OUT_DIR, game.outFile);

    console.log(`[${i + 1}/${targets.length}] ${game.title} (ROTK${game.num})`);

    // Resume check
    if (resume && existsSync(outPath)) {
      try {
        const existing = JSON.parse(readFileSync(outPath, 'utf-8'));
        console.log(`   SKIP (already exists: ${existing.total_characters || existing.data?.length || '?'} characters)\n`);
        results.skipped.push(game.num);
        continue;
      } catch {
        // File corrupt, re-crawl
      }
    }

    try {
      console.log(`   Fetching: ${game.url}`);
      const html = await fetchPage(game.url);
      console.log(`   HTML received: ${(html.length / 1024).toFixed(0)} KB`);

      const { officers, statCategories, additionalCols, headerCount } = parseStatsTable(html, game.num);

      if (officers.length === 0) {
        throw new Error('No officers parsed from table');
      }

      // Build format string
      const formatParts = ['name'];
      const coreStats = ['leadership', 'war', 'intelligence', 'politics', 'charisma'];
      for (const s of coreStats) {
        if (officers[0][s] !== undefined) formatParts.push(s);
      }
      for (const col of additionalCols) {
        if (!coreStats.includes(col)) formatParts.push(col);
      }

      const output = {
        source: `zetawiki.com - ${game.title} 능력치 목록`,
        url: game.url,
        crawled_at: new Date().toISOString().split('T')[0],
        game: game.title_en,
        total_characters: officers.length,
        stat_categories: statCategories,
        format: formatParts.join('|'),
        data: officers,
      };

      writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

      // Summary
      const sampleNames = officers.slice(0, 3).map(o => o.name_kr).join(', ');
      console.log(`   OK: ${officers.length} characters, ${headerCount} columns`);
      console.log(`   Stats: [${statCategories.join(', ')}]`);
      if (additionalCols.length > 0) {
        console.log(`   Extra: [${additionalCols.join(', ')}]`);
      }
      console.log(`   Sample: ${sampleNames}...`);
      console.log(`   Saved: ${outPath}\n`);
      results.success.push(game.num);

    } catch (err) {
      console.error(`   FAILED: ${err.message}\n`);
      results.failed.push({ game: game.num, error: err.message });
    }

    // Delay between pages
    if (i < targets.length - 1) {
      await sleep(delay);
    }
  }

  // ── Summary ──
  console.log('='.repeat(50));
  console.log(`Done: OK=${results.success.length} SKIP=${results.skipped.length} FAIL=${results.failed.length}`);
  if (results.success.length > 0) {
    console.log(`   Crawled: ROTK ${results.success.join(', ')}`);
  }
  if (results.failed.length > 0) {
    for (const f of results.failed) {
      console.log(`   FAIL ROTK${f.game}: ${f.error}`);
    }
  }
  console.log('='.repeat(50) + '\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
