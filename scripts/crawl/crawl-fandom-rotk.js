#!/usr/bin/env node
/**
 * Fandom 위키 삼국지/ROTK 캐릭터 크롤러
 *
 * MediaWiki API를 사용하여 Fandom 봇 차단(403) 우회.
 *
 * 두 개의 Fandom 위키에서 캐릭터 데이터 수집:
 * 1. Koei 위키 (koei.fandom.com) — Wei/Shu/Wu/Jin/Other 진영별 캐릭터 + 능력치/전기
 * 2. Three Kingdoms 위키 (threekingdoms.fandom.com) — 역사 캐릭터 전기
 *
 * Usage:
 *   node scripts/crawl/crawl-fandom-rotk.js                     # Koei + 3K 위키 전체
 *   node scripts/crawl/crawl-fandom-rotk.js --source koei       # Koei 위키만
 *   node scripts/crawl/crawl-fandom-rotk.js --source 3k         # Three Kingdoms 위키만
 *   node scripts/crawl/crawl-fandom-rotk.js --resume             # 이미 존재하면 스킵
 *   node scripts/crawl/crawl-fandom-rotk.js --delay 2000         # 요청 간격 (ms, 기본 2000)
 *   node scripts/crawl/crawl-fandom-rotk.js --limit 10           # 최대 N명만
 *
 * Output:
 *   data/raw/fandom-koei/{character-slug}.json
 *   data/raw/fandom-3k/{character-slug}.json
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const KOEI_OUT_DIR = join(ROOT, 'data', 'raw', 'fandom-koei');
const TK_OUT_DIR = join(ROOT, 'data', 'raw', 'fandom-3k');

// ── CLI ──
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const hasFlag = (f) => args.includes(f);

const source = getArg('--source') || 'all';    // koei | 3k | all
const resume = hasFlag('--resume');
const delay = parseInt(getArg('--delay') || '2000', 10);
const limitN = getArg('--limit') ? parseInt(getArg('--limit'), 10) : Infinity;

const UA = 'WdttGukjiBot/1.0 (Three Kingdoms data crawl; github.com/vibechanbob/wdttgukji)';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const safeFilename = (name) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');

// ══════════════════════════════════════════════
// MediaWiki API helpers
// ══════════════════════════════════════════════

/**
 * Fetch JSON from MediaWiki API with retry
 */
async function mwApiFetch(baseUrl, params, retries = 2) {
  const url = new URL(`${baseUrl}/api.php`);
  url.searchParams.set('format', 'json');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
      });

      if (res.status === 429) {
        console.log(`   429 rate limited, waiting 10s...`);
        await sleep(10000);
        continue;
      }
      if (!res.ok) {
        if (attempt < retries) { await sleep(3000); continue; }
        return { ok: false, status: res.status, data: null };
      }
      return { ok: true, status: 200, data: await res.json() };
    } catch (err) {
      if (attempt < retries) { await sleep(3000); continue; }
      return { ok: false, status: 0, data: null, error: err.message };
    }
  }
  return { ok: false, status: 0, data: null };
}

/**
 * Get all members of a category (with pagination)
 */
async function getCategoryMembers(baseUrl, category, namespace = 0) {
  const members = [];
  let cmcontinue = '';

  while (true) {
    const params = {
      action: 'query',
      list: 'categorymembers',
      cmtitle: `Category:${category}`,
      cmnamespace: String(namespace),
      cmlimit: '500',
    };
    if (cmcontinue) params.cmcontinue = cmcontinue;

    const result = await mwApiFetch(baseUrl, params);
    if (!result.ok || !result.data?.query?.categorymembers) break;

    for (const m of result.data.query.categorymembers) {
      members.push({ pageid: m.pageid, title: m.title });
    }

    cmcontinue = result.data?.continue?.cmcontinue || '';
    if (!cmcontinue) break;
    await sleep(500);
  }

  return members;
}

/**
 * Search pages by keyword
 */
async function searchPages(baseUrl, query, limit = 50) {
  const result = await mwApiFetch(baseUrl, {
    action: 'query',
    list: 'search',
    srsearch: query,
    srnamespace: '0',
    srlimit: String(limit),
  });

  if (!result.ok || !result.data?.query?.search) return [];
  return result.data.query.search.map(s => ({
    pageid: s.pageid,
    title: s.title,
    size: s.size,
    wordcount: s.wordcount,
  }));
}

/**
 * Get parsed page content (wikitext + categories + HTML)
 */
async function getPageContent(baseUrl, title) {
  const result = await mwApiFetch(baseUrl, {
    action: 'parse',
    page: title,
    prop: 'wikitext|categories|text',
    disablelimitreport: 'true',
  });

  if (!result.ok || !result.data?.parse) {
    return { ok: false, error: result.error || `HTTP ${result.status}` };
  }

  const parsed = result.data.parse;
  return {
    ok: true,
    title: parsed.title,
    pageid: parsed.pageid,
    wikitext: parsed.wikitext?.['*'] || '',
    html: parsed.text?.['*'] || '',
    categories: (parsed.categories || []).map(c => c['*']?.replace(/_/g, ' ')),
  };
}

// ══════════════════════════════════════════════
// Wikitext/HTML parser
// ══════════════════════════════════════════════

/**
 * Parse infobox from wikitext
 */
function parseInfobox(wikitext) {
  const info = {};

  // Match {{Infobox ...}} or {{Infobox Wei ...}} etc
  const infoboxMatch = wikitext.match(/\{\{Infobox[^}]*?\n([\s\S]*?)\}\}/i)
    || wikitext.match(/\{\{Infobox_[^}]*?\n([\s\S]*?)\}\}/i)
    || wikitext.match(/\{\{(?:Wei|Shu|Wu|Jin|Other)[^}]*?\n([\s\S]*?)\}\}/);

  if (!infoboxMatch) return info;

  const lines = infoboxMatch[1].split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*\|([^=]+)=\s*(.+)/);
    if (!m) continue;
    const key = m[1].trim();
    const rawValue = m[2].trim();
    // Clean wikitext markup: [[link|display]] → display, [[link]] → link, '''bold''' → bold
    const value = rawValue
      .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/'''([^']+)'''/g, '$1')
      .replace(/''([^']+)''/g, '$1')
      .replace(/<br\s*\/?>/gi, ', ')
      .trim();
    if (value) info[key] = value;
  }

  return info;
}

/**
 * Parse stats tables from rendered HTML
 */
function parseStatsTables(html) {
  const $ = cheerio.load(html);
  const statsTables = [];

  $('table.wikitable, table[class*="wikitable"]').each((_, table) => {
    const $table = $(table);
    const headers = [];
    $table.find('tr').first().find('th').each((_, th) => {
      headers.push($(th).text().trim());
    });

    const statKeywords = ['WAR', 'INT', 'POL', 'CHR', 'LEA', 'STR', 'Leadership', 'War',
      'Intelligence', 'Politics', 'Charisma', 'Attack', 'Defense', 'Govern', 'Charm',
      'Power', 'Ingenuity', 'HP', 'Lead', 'Command'];
    const isStatsTable = headers.some(h =>
      statKeywords.some(k => h.toLowerCase().includes(k.toLowerCase()))
    );

    if (!isStatsTable) return;

    const rows = [];
    $table.find('tr').each((idx, row) => {
      if (idx === 0) return;
      const cells = [];
      $(row).find('td, th').each((_, cell) => {
        cells.push($(cell).text().trim());
      });
      if (cells.length > 0) {
        const rowObj = {};
        cells.forEach((c, i) => { if (headers[i]) rowObj[headers[i]] = c; });
        rows.push(rowObj);
      }
    });

    if (rows.length > 0) {
      statsTables.push({ headers, rows });
    }
  });

  return statsTables;
}

/**
 * Parse sections from rendered HTML
 *
 * Fandom's parse API wraps headings in <div> containers and uses
 * .mw-parser-output as root. We walk ALL descendant h2/h3/h4 elements
 * in document order and collect text between them.
 */
function parseSections(html) {
  const $ = cheerio.load(html);
  const sections = [];

  const skipHeadings = /^(Contents|See also|References|External links|Notes|Gallery|Navigation|Sources|Videos)$/i;

  // Collect all headings with their DOM positions
  const headingEls = [];
  $('h2, h3, h4').each((_, el) => {
    const $el = $(el);
    const rawText = $el.text().replace(/\[\s*edit\s*\]/gi, '').replace(/\[\]$/g, '').trim();
    if (!rawText || skipHeadings.test(rawText)) return;
    const tag = el.tagName.toLowerCase();
    headingEls.push({ el, tag, text: rawText, level: parseInt(tag[1], 10) });
  });

  if (headingEls.length === 0) {
    // No headings: return all text as single section
    const allText = collectText($, $.root());
    if (allText.length > 5) {
      sections.push({ heading: 'Lead', level: 1, content: allText });
    }
    return sections;
  }

  // Gather "Lead" text: all <p> elements that appear before the first heading
  const firstHeadingEl = headingEls[0].el;
  const leadParagraphs = [];
  $('p').each((_, p) => {
    // Check if this <p> comes before the first heading in document order
    const $p = $(p);
    // Use a simple heuristic: if the paragraph is not inside a table/infobox
    // and appears in .mw-parser-output
    if ($p.closest('table, aside, .infobox, .portable-infobox, .navbox').length) return;
    // Check document order by comparing text position
    const pHtml = $.html(p);
    const headingHtml = $.html(firstHeadingEl);
    if (html.indexOf(pHtml) < html.indexOf(headingHtml)) {
      const text = $p.text().trim();
      if (text.length > 0) leadParagraphs.push(text);
    }
  });
  if (leadParagraphs.length > 0) {
    sections.push({ heading: 'Lead', level: 1, content: leadParagraphs.join('\n\n') });
  }

  // For each heading, collect text until the next heading of same or higher level
  for (let i = 0; i < headingEls.length; i++) {
    const current = headingEls[i];
    const next = headingEls[i + 1];

    // Collect all <p>, <ul>, <ol>, <dl> between this heading and the next
    const currentHtml = $.html(current.el);
    const currentPos = html.indexOf(currentHtml);
    const nextPos = next ? html.indexOf($.html(next.el)) : html.length;

    if (currentPos < 0) continue;

    // Extract the HTML slice between headings and parse it
    const sliceHtml = html.slice(currentPos + currentHtml.length, nextPos);
    const $slice = cheerio.load(sliceHtml);
    const paragraphs = [];

    $slice('p').each((_, p) => {
      const $p = $slice(p);
      if ($p.closest('table, aside, .infobox, .portable-infobox, .navbox').length) return;
      const text = $p.text().trim();
      if (text.length > 0) paragraphs.push(text);
    });
    $slice('ul > li, ol > li').each((_, li) => {
      const text = $slice(li).text().trim();
      if (text.length > 3) paragraphs.push('- ' + text);
    });
    $slice('dd').each((_, dd) => {
      const text = $slice(dd).text().trim();
      if (text.length > 3) paragraphs.push(text);
    });

    const content = paragraphs.join('\n\n').trim();
    if (content.length > 5) {
      sections.push({ heading: current.text, level: current.level, content });
    }
  }

  return sections;
}

/**
 * Detect game appearances from wikitext
 */
function detectGameAppearances(wikitext) {
  const appearances = [];
  const patterns = [
    /Romance of the Three Kingdoms\s+(\w+)/gi,
    /ROTK\s*(\d+|[XIVLC]+)/gi,
    /Dynasty Warriors\s+(\d+)/gi,
    /Warriors Orochi\s+(\d+)/gi,
    /Kessen\s+(\w+)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(wikitext)) !== null) {
      const game = match[0].trim();
      if (!appearances.includes(game)) appearances.push(game);
    }
  }

  return appearances;
}

// ══════════════════════════════════════════════
// Part 1: Koei Fandom Wiki (koei.fandom.com)
// ══════════════════════════════════════════════

const KOEI_BASE = 'https://koei.fandom.com';

// Faction categories from koei.fandom.com
const KOEI_FACTION_CATEGORIES = [
  { category: 'Wei_Characters', faction: 'Wei' },
  { category: 'Shu_Characters', faction: 'Shu' },
  { category: 'Wu_Characters', faction: 'Wu' },
  { category: 'Jin_Characters', faction: 'Jin' },
  { category: 'Other_Characters', faction: 'Other' },
];

async function crawlKoeiFandom() {
  mkdirSync(KOEI_OUT_DIR, { recursive: true });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Koei Fandom Wiki Crawler (koei.fandom.com)`);
  console.log(`  Method: MediaWiki API (bypasses Fandom 403 bot block)`);
  console.log(`  Delay: ${delay}ms | Resume: ${resume} | Limit: ${limitN === Infinity ? 'none' : limitN}`);
  console.log(`${'='.repeat(60)}\n`);

  // ── Step 1: Collect characters from faction categories ──
  console.log(`[1/2] Collecting characters from faction categories...`);

  const allCharacters = [];
  const seen = new Set();

  for (const { category, faction } of KOEI_FACTION_CATEGORIES) {
    const members = await getCategoryMembers(KOEI_BASE, category);
    let added = 0;
    for (const m of members) {
      if (seen.has(m.title)) continue;
      // Skip sub-pages (e.g. "Cao Cao/Quotes")
      if (m.title.includes('/')) continue;
      seen.add(m.title);
      allCharacters.push({ ...m, faction });
      added++;
    }
    console.log(`   ${faction} (${category}): ${members.length} members, ${added} new`);
    await sleep(500);
  }

  console.log(`   Total unique characters: ${allCharacters.length}`);

  if (allCharacters.length === 0) {
    console.log(`   No characters found via category API.`);
    return { success: 0, failed: 0, skipped: 0, errors: [] };
  }

  // ── Step 2: Crawl individual character pages ──
  const targets = allCharacters.slice(0, limitN);
  console.log(`\n[2/2] Crawling ${targets.length} character pages via parse API...\n`);

  const results = { success: 0, failed: 0, skipped: 0, errors: [] };

  for (let i = 0; i < targets.length; i++) {
    const char = targets[i];
    const slug = safeFilename(char.title);
    const outPath = join(KOEI_OUT_DIR, `${slug}.json`);

    if (resume && existsSync(outPath)) {
      results.skipped++;
      if ((i + 1) % 20 === 0 || i === targets.length - 1) {
        console.log(`   [${i + 1}/${targets.length}] ... (${results.skipped} skipped so far)`);
      }
      continue;
    }

    try {
      const page = await getPageContent(KOEI_BASE, char.title);

      if (!page.ok) {
        console.log(`   [${i + 1}/${targets.length}] ${char.title} — FAILED: ${page.error}`);
        results.failed++;
        results.errors.push({ name: char.title, error: page.error });
      } else {
        // Parse the content
        const infobox = parseInfobox(page.wikitext);
        const statsTables = parseStatsTables(page.html);
        const sections = parseSections(page.html);
        const gameAppearances = detectGameAppearances(page.wikitext);

        const data = {
          name: char.title,
          pageid: page.pageid,
          faction: char.faction,
          biographical_info: infobox,
          game_stats: statsTables.length > 0 ? statsTables : {},
          game_appearances: gameAppearances,
          sections,
          categories: page.categories,
          source_url: `${KOEI_BASE}/wiki/${encodeURIComponent(char.title.replace(/ /g, '_'))}`,
          crawled_at: new Date().toISOString(),
        };

        writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');

        const statsCount = statsTables.length;
        const sectionCount = sections.length;
        const infoCount = Object.keys(infobox).length;
        console.log(`   [${i + 1}/${targets.length}] ${char.title} [${char.faction}] — OK (${sectionCount} sections, ${statsCount} stat tables, ${infoCount} info fields)`);
        results.success++;
      }
    } catch (err) {
      console.log(`   [${i + 1}/${targets.length}] ${char.title} — ERROR: ${err.message}`);
      results.failed++;
      results.errors.push({ name: char.title, error: err.message });
    }

    if (i < targets.length - 1) await sleep(delay);
  }

  return results;
}

// ══════════════════════════════════════════════
// Part 2: Three Kingdoms Fandom Wiki
// ══════════════════════════════════════════════

const TK_WIKIS = [
  { base: 'https://threekingdoms.fandom.com', name: 'threekingdoms.fandom.com' },
  { base: 'https://three-kingdoms.fandom.com', name: 'three-kingdoms.fandom.com' },
];

async function crawlThreeKingdomsFandom() {
  mkdirSync(TK_OUT_DIR, { recursive: true });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Three Kingdoms Fandom Wiki Crawler`);
  console.log(`  Method: MediaWiki API`);
  console.log(`  Delay: ${delay}ms | Resume: ${resume} | Limit: ${limitN === Infinity ? 'none' : limitN}`);
  console.log(`${'='.repeat(60)}\n`);

  // ── Step 1: Find working wiki and gather characters ──
  console.log(`[1/2] Searching for character pages across Three Kingdoms wikis...\n`);

  let baseUrl = '';
  let wikiName = '';
  let characters = [];

  for (const wiki of TK_WIKIS) {
    console.log(`   Trying ${wiki.name}...`);

    // Try category-based discovery
    const charCategories = ['Characters', 'People', 'Historical_characters', 'Warlords',
      'Three_Kingdoms_characters', 'Generals'];

    for (const cat of charCategories) {
      const members = await getCategoryMembers(wiki.base, cat);
      if (members.length > 0) {
        console.log(`   Found ${members.length} members in Category:${cat}`);
        characters.push(...members.map(m => ({ ...m, source_category: cat })));
      }
      await sleep(300);
    }

    // If categories are empty, use search for major characters
    if (characters.length === 0) {
      console.log(`   No character categories found. Searching for major characters...`);
      const searchTerms = ['Cao Cao', 'Liu Bei', 'Sun Quan', 'Zhuge Liang', 'Guan Yu',
        'Zhang Fei', 'Lu Bu', 'Zhou Yu', 'Sima Yi', 'Diao Chan'];

      for (const term of searchTerms) {
        const results = await searchPages(wiki.base, term, 5);
        for (const r of results) {
          if (!characters.find(c => c.pageid === r.pageid) && !r.title.includes('/')) {
            characters.push({ pageid: r.pageid, title: r.title, source_category: 'search' });
          }
        }
        await sleep(300);
      }
    }

    // Also try allpages to get everything (for smaller wikis)
    if (characters.length < 20) {
      console.log(`   Fetching all pages (small wiki)...`);
      let apcontinue = '';
      let pageCount = 0;
      while (pageCount < 500) {
        const params = {
          action: 'query',
          list: 'allpages',
          apnamespace: '0',
          aplimit: '500',
        };
        if (apcontinue) params.apcontinue = apcontinue;

        const result = await mwApiFetch(wiki.base, params);
        if (!result.ok) break;

        const pages = result.data?.query?.allpages || [];
        for (const p of pages) {
          if (!p.title.includes('/') && !p.title.includes(':') &&
              !characters.find(c => c.pageid === p.pageid)) {
            characters.push({ pageid: p.pageid, title: p.title, source_category: 'allpages' });
          }
        }
        pageCount += pages.length;

        apcontinue = result.data?.continue?.apcontinue || '';
        if (!apcontinue) break;
        await sleep(300);
      }
    }

    if (characters.length > 0) {
      baseUrl = wiki.base;
      wikiName = wiki.name;
      break;
    }
  }

  if (characters.length === 0) {
    console.log(`   No character pages found on any Three Kingdoms wiki.`);
    return { success: 0, failed: 0, skipped: 0, errors: [] };
  }

  // Deduplicate by pageid
  const uniqueMap = new Map();
  for (const c of characters) {
    if (!uniqueMap.has(c.pageid)) uniqueMap.set(c.pageid, c);
  }
  characters = [...uniqueMap.values()];

  console.log(`\n   Using: ${wikiName}`);
  console.log(`   Total unique pages: ${characters.length}`);

  // ── Step 2: Crawl pages ──
  const targets = characters.slice(0, limitN);
  console.log(`\n[2/2] Crawling ${targets.length} pages...\n`);

  const results = { success: 0, failed: 0, skipped: 0, errors: [] };

  for (let i = 0; i < targets.length; i++) {
    const char = targets[i];
    const slug = safeFilename(char.title);
    const outPath = join(TK_OUT_DIR, `${slug}.json`);

    if (resume && existsSync(outPath)) {
      results.skipped++;
      if ((i + 1) % 20 === 0 || i === targets.length - 1) {
        console.log(`   [${i + 1}/${targets.length}] ... (${results.skipped} skipped)`);
      }
      continue;
    }

    try {
      const page = await getPageContent(baseUrl, char.title);

      if (!page.ok) {
        results.failed++;
        results.errors.push({ name: char.title, error: page.error });
        if (results.failed <= 5) {
          console.log(`   [${i + 1}/${targets.length}] ${char.title} — FAILED: ${page.error}`);
        }
        continue;
      }

      const infobox = parseInfobox(page.wikitext);
      const sections = parseSections(page.html);

      // Extract internal links from HTML
      const $ = cheerio.load(page.html);
      const internalLinks = [];
      const linksSeen = new Set();
      $('a').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (href.startsWith('/wiki/') && !href.includes(':') && !linksSeen.has(href)) {
          linksSeen.add(href);
          internalLinks.push(decodeURIComponent(href.replace('/wiki/', '').replace(/_/g, ' ')));
        }
      });

      const data = {
        name: char.title,
        pageid: page.pageid,
        biographical_info: infobox,
        sections,
        categories: page.categories,
        internal_links: internalLinks,
        source_url: `${baseUrl}/wiki/${encodeURIComponent(char.title.replace(/ /g, '_'))}`,
        source_wiki: wikiName,
        crawled_at: new Date().toISOString(),
      };

      writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`   [${i + 1}/${targets.length}] ${char.title} — OK (${sections.length} sections, ${Object.keys(infobox).length} info)`);
      results.success++;
    } catch (err) {
      results.failed++;
      results.errors.push({ name: char.title, error: err.message });
    }

    if (i < targets.length - 1) await sleep(delay);
  }

  return results;
}

// ══════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════

async function main() {
  const startTime = Date.now();
  let koeiResults = null;
  let tkResults = null;

  if (source === 'all' || source === 'koei') {
    koeiResults = await crawlKoeiFandom();
  }

  if (source === 'all' || source === '3k') {
    tkResults = await crawlThreeKingdomsFandom();
  }

  // ── Summary ──
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  SUMMARY (${elapsed}s)`);
  console.log(`${'='.repeat(60)}`);

  if (koeiResults) {
    console.log(`\n  Koei Fandom Wiki (koei.fandom.com):`);
    console.log(`    OK: ${koeiResults.success} | Skipped: ${koeiResults.skipped} | Failed: ${koeiResults.failed}`);
    if (koeiResults.errors?.length > 0) {
      console.log(`    Errors:`);
      for (const e of koeiResults.errors.slice(0, 10)) {
        console.log(`      - ${e.name}: ${e.error}`);
      }
      if (koeiResults.errors.length > 10) {
        console.log(`      ... and ${koeiResults.errors.length - 10} more`);
      }
    }
  }

  if (tkResults) {
    console.log(`\n  Three Kingdoms Wiki:`);
    console.log(`    OK: ${tkResults.success} | Skipped: ${tkResults.skipped} | Failed: ${tkResults.failed}`);
    if (tkResults.errors?.length > 0) {
      console.log(`    Errors:`);
      for (const e of tkResults.errors.slice(0, 10)) {
        console.log(`      - ${e.name}: ${e.error}`);
      }
      if (tkResults.errors.length > 10) {
        console.log(`      ... and ${tkResults.errors.length - 10} more`);
      }
    }
  }

  console.log(`\n${'='.repeat(60)}\n`);

  const totalFailed = (koeiResults?.failed || 0) + (tkResults?.failed || 0);
  const totalSuccess = (koeiResults?.success || 0) + (tkResults?.success || 0);
  if (totalSuccess === 0 && totalFailed > 0) process.exit(1);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
