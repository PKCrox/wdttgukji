#!/usr/bin/env node
/**
 * kongming.net 삼국지 백과사전 캐릭터 크롤러
 *
 * Three Kingdoms Encyclopedia — 1000+ 인물 프로필 크롤링
 * Main page: https://kongming.net/encyclopedia/
 * Featured officers: https://kongming.net/encyclopedia/officers/{Name} (74 featured)
 * Full directory: https://kongming.net/encyclopedia/directory/{Wei|Shu|Wu|Han|Jin|Other}
 * Individual: https://kongming.net/encyclopedia/{Name} (from directory pages)
 *
 * Usage:
 *   node scripts/crawl/crawl-kongming-encyclopedia.js                    # 전체
 *   node scripts/crawl/crawl-kongming-encyclopedia.js --resume           # 이미 크롤된 건 스킵
 *   node scripts/crawl/crawl-kongming-encyclopedia.js --delay 3000       # 요청 간격 (ms, 기본 2000)
 *   node scripts/crawl/crawl-kongming-encyclopedia.js --limit 50         # 최대 N명
 *   node scripts/crawl/crawl-kongming-encyclopedia.js --faction wei      # 진영 필터
 *   node scripts/crawl/crawl-kongming-encyclopedia.js --refresh-index    # 인덱스 캐시 무시
 *
 * Output: data/raw/kongming-encyclopedia/{name-slug}.json
 */

import { writeFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'data', 'raw', 'kongming-encyclopedia');
const INDEX_CACHE = join(OUT_DIR, '_index-cache.json');

// ── CLI ──
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const hasFlag = (f) => args.includes(f);

const resume = hasFlag('--resume');
const delay = parseInt(getArg('--delay') || '2000', 10);
const limit = getArg('--limit') ? parseInt(getArg('--limit'), 10) : Infinity;
const factionFilter = getArg('--faction')?.toLowerCase() || null;
const refreshIndex = hasFlag('--refresh-index');

// ── Utils ──
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function safeSlug(name) {
  return name
    .toLowerCase()
    .replace(/[''`"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function fetchWithRetry(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (res.status === 404) return { status: 404, html: null };
      if (res.status === 403) return { status: 403, html: null };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      return { status: res.status, html };
    } catch (err) {
      if (attempt === retries) throw err;
      const backoff = delay * attempt;
      console.warn(`  Retry ${attempt}/${retries} for ${url} (${backoff}ms): ${err.message}`);
      await sleep(backoff);
    }
  }
}

/**
 * Extract text from a cheerio element, preserving paragraph breaks
 */
function extractText($, el) {
  if (!el || !el.length) return '';
  const blockTags = new Set([
    'p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'li', 'blockquote', 'pre', 'tr', 'dt', 'dd',
  ]);
  const blocks = [];

  function walk(node) {
    if (node.type === 'text') {
      const t = node.data.replace(/\s+/g, ' ');
      if (t.trim()) blocks.push(t.trim());
      return;
    }
    if (node.type === 'tag') {
      const tag = node.tagName.toLowerCase();
      if (['script', 'style', 'noscript'].includes(tag)) return;
      const isBlock = blockTags.has(tag);
      if (isBlock) blocks.push('\n');
      for (const child of node.children || []) walk(child);
      if (isBlock) blocks.push('\n');
    }
  }

  el.each((_, node) => walk(node));
  return blocks.join('').split('\n').map(l => l.trim()).filter(Boolean).join('\n');
}

// ── Factions ──
const FACTIONS = ['Wei', 'Shu', 'Wu', 'Han', 'Jin', 'Other'];

/**
 * Discover all officer URLs from the encyclopedia.
 *
 * Two sources:
 * 1. Featured officers from /encyclopedia/ main page → /encyclopedia/officers/{Name}
 * 2. Full directory from /encyclopedia/directory/{Faction} → /encyclopedia/{Name}
 */
async function discoverOfficerLinks() {
  // Check cache
  if (!refreshIndex && existsSync(INDEX_CACHE)) {
    try {
      const cached = JSON.parse(readFileSync(INDEX_CACHE, 'utf-8'));
      if (cached.officers?.length > 0) {
        console.log(`Using cached index (${cached.officers.length} officers, cached at ${cached.cached_at})`);
        return cached.officers;
      }
    } catch { /* ignore corrupt cache */ }
  }

  console.log('Fetching encyclopedia index + faction directories...\n');

  /** @type {Map<string, { name: string, url: string, faction: string }>} */
  const officers = new Map();

  // ── Phase 1: Featured officers from main page ──
  try {
    const result = await fetchWithRetry('https://kongming.net/encyclopedia/', 3);
    if (result.html) {
      const $ = cheerio.load(result.html);
      $('a[href]').each((_, a) => {
        const href = $(a).attr('href') || '';
        const text = $(a).text().trim();
        if (!text || text.length < 2) return;

        // Match /encyclopedia/officers/{Name}
        const officerMatch = href.match(/\/encyclopedia\/officers\/([\w-]+)/);
        if (officerMatch) {
          const fullUrl = `https://kongming.net${href}`;
          const slug = safeSlug(text);
          if (!officers.has(slug)) {
            officers.set(slug, { name: text, url: fullUrl, faction: 'unknown' });
          }
        }
      });
      console.log(`  Main page: ${officers.size} featured officers`);
    }
    await sleep(Math.min(1000, delay));
  } catch (err) {
    console.warn(`  Main page fetch failed: ${err.message}`);
  }

  // ── Phase 2: Faction directories ──
  for (const faction of FACTIONS) {
    const dirUrl = `https://kongming.net/encyclopedia/directory/${faction}`;
    try {
      const result = await fetchWithRetry(dirUrl, 2);
      if (!result.html || result.status === 404) {
        console.warn(`  Directory ${faction}: not found`);
        continue;
      }

      const $ = cheerio.load(result.html);
      let count = 0;

      $('a[href]').each((_, a) => {
        const href = $(a).attr('href') || '';
        const text = $(a).text().trim();
        if (!text || text.length < 2) return;

        // Match /encyclopedia/{Name} (but not /encyclopedia/directory/ or /encyclopedia/officers/)
        const match = href.match(/^\/encyclopedia\/([\w-]+)$/);
        if (match) {
          const name = match[1];
          // Skip directory/meta pages
          if (['directory', 'officers', 'search', 'about'].includes(name.toLowerCase())) return;

          const fullUrl = `https://kongming.net${href}`;
          const slug = safeSlug(name);

          if (!officers.has(slug)) {
            officers.set(slug, { name: text, url: fullUrl, faction: faction.toLowerCase() });
            count++;
          }
        }
      });

      console.log(`  Directory ${faction}: +${count} officers (total: ${officers.size})`);
      await sleep(delay);
    } catch (err) {
      console.warn(`  Directory ${faction} fetch failed: ${err.message}`);
    }
  }

  const officerList = Array.from(officers.values());

  // Sort by faction then name
  officerList.sort((a, b) => a.faction.localeCompare(b.faction) || a.name.localeCompare(b.name));

  // Cache
  writeFileSync(INDEX_CACHE, JSON.stringify({
    officers: officerList,
    cached_at: new Date().toISOString(),
    count: officerList.length,
    by_faction: FACTIONS.reduce((acc, f) => {
      acc[f.toLowerCase()] = officerList.filter(o => o.faction === f.toLowerCase()).length;
      return acc;
    }, {}),
  }, null, 2), 'utf-8');

  console.log(`\nDiscovered ${officerList.length} officer entries total\n`);
  return officerList;
}

/**
 * Parse an individual officer/encyclopedia page.
 *
 * Structure (from live inspection of /encyclopedia/officers/Cao-Cao):
 * - Name with Chinese characters and courtesy name
 * - Life span (AD xxx-yyy)
 * - Birthplace
 * - Romanization variants (Pinyin, Wade-Giles)
 * - Ranks/titles as <ul> list
 * - Family as hierarchical <ul> (father, sons by mother, etc.)
 * - Affiliations as linked items
 * - Sections with h3/h4 headings (History, Novel, etc.)
 */
function parseOfficerPage(html, officerInfo) {
  const $ = cheerio.load(html);

  // Remove noise
  $('script, style, noscript, iframe').remove();

  const pageTitle = $('title').text().trim();

  const result = {
    name: officerInfo.name,
    page_title: pageTitle,
    url: officerInfo.url,
    faction: officerInfo.faction,
    courtesy_name: '',
    life_span: '',
    birthplace: '',
    chinese_name: '',
    affiliations: [],
    family: [],
    ranks: [],
    historical_notes: '',
    novel_notes: '',
    quotes: [],
    sections: {},
    full_text: '',
  };

  // ── Extract structured fields ──

  // Look for Chinese characters in the title/headings
  const titleText = $('h1').first().text();
  const chineseMatch = titleText.match(/([\u4e00-\u9fff]+)/);
  if (chineseMatch) result.chinese_name = chineseMatch[1];

  // Courtesy name: "styled Mengde (孟德)" pattern
  const courtesyMatch = titleText.match(/styled?\s+(\w+)/i);
  if (courtesyMatch) result.courtesy_name = courtesyMatch[1];

  // Life span: "AD 155–220" pattern anywhere in page
  const fullText = $('body').text();
  const lifeMatch = fullText.match(/(?:AD\s+)?(\d{2,3})\s*[-–—]\s*(\d{2,3})\s*(?:AD)?/);
  if (lifeMatch) result.life_span = `AD ${lifeMatch[1]}–${lifeMatch[2]}`;

  // Extract from definition lists
  $('dl').each((_, dl) => {
    $(dl).find('dt').each((_, dt) => {
      const label = $(dt).text().trim().toLowerCase();
      const dd = $(dt).next('dd');
      const value = dd.length ? dd.text().trim() : '';
      if (!value) return;

      if (label.match(/courtesy|style\s*name/i)) result.courtesy_name = result.courtesy_name || value;
      else if (label.match(/life|born|died|years|span/i)) result.life_span = result.life_span || value;
      else if (label.match(/birthplace|birth\s*place|origin/i)) result.birthplace = value;
      else if (label.match(/faction|allegiance|affiliation|kingdom|served/i)) {
        result.affiliations = value.split(/[,;]/).map(s => s.trim()).filter(Boolean);
      }
    });
  });

  // Extract from tables
  $('table').each((_, table) => {
    $(table).find('tr').each((_, tr) => {
      const cells = $(tr).find('td, th').toArray();
      if (cells.length >= 2) {
        const label = $(cells[0]).text().trim().toLowerCase();
        const value = $(cells[1]).text().trim();
        if (label.match(/courtesy|style/i) && !result.courtesy_name) result.courtesy_name = value;
        else if (label.match(/life|born|died|years/i) && !result.life_span) result.life_span = value;
        else if (label.match(/birthplace/i) && !result.birthplace) result.birthplace = value;
      }
    });
  });

  // ── Extract sections by headings ──
  $('h2, h3, h4').each((_, h) => {
    const heading = $(h).text().trim();
    const headingLower = heading.toLowerCase().replace(/[^a-z\s]/g, '');
    if (heading.length < 2) return;

    // Collect text from siblings until next heading
    const parts = [];
    let next = $(h).next();
    while (next.length) {
      const tag = next.prop('tagName')?.toLowerCase();
      if (tag && ['h1', 'h2', 'h3', 'h4'].includes(tag)) break;
      const text = next.text().trim();
      if (text) parts.push(text);
      next = next.next();
    }
    const content = parts.join('\n');

    // Map to structured fields
    if (headingLower.match(/histor/)) {
      result.historical_notes = result.historical_notes || content;
      result.sections['historical'] = content;
    } else if (headingLower.match(/novel|romance|fiction/)) {
      result.novel_notes = result.novel_notes || content;
      result.sections['novel'] = content;
    } else if (headingLower.match(/quote/)) {
      result.quotes = content.split('\n').map(q => q.trim()).filter(q => q.length > 5);
      result.sections['quotes'] = content;
    } else if (headingLower.match(/rank|title|position|office/)) {
      result.ranks = content.split('\n').map(r => r.trim()).filter(r => r.length > 2);
      result.sections['ranks'] = content;
    } else if (headingLower.match(/family|relative/)) {
      const familyLines = content.split('\n').map(l => l.trim()).filter(Boolean);
      result.family = familyLines.map(line => {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) return { relation: line.slice(0, colonIdx).trim(), name: line.slice(colonIdx + 1).trim() };
        return { relation: 'member', name: line };
      });
      result.sections['family'] = content;
    } else if (headingLower.match(/affiliation|allegiance|kingdom/)) {
      if (result.affiliations.length === 0) {
        result.affiliations = content.split(/[\n,;]/).map(s => s.trim()).filter(Boolean);
      }
      result.sections['affiliations'] = content;
    } else if (heading.length > 2) {
      result.sections[safeSlug(heading)] = content;
    }
  });

  // ── Ranks from <ul> directly (kongming.net uses ul for ranks) ──
  if (result.ranks.length === 0) {
    // Find ul that's likely ranks (contains official-sounding items)
    $('ul').each((_, ul) => {
      const items = [];
      $(ul).find('li').each((_, li) => {
        items.push($(li).text().trim());
      });
      // Heuristic: if multiple items contain words like "Commandant", "General", "Duke", "King"
      const officialCount = items.filter(i =>
        i.match(/commandant|general|duke|king|governor|minister|chancellor|master|lord|marquis|colonel/i)
      ).length;
      if (officialCount >= 2 && result.ranks.length === 0) {
        result.ranks = items;
      }
    });
  }

  // ── Full text ──
  $('nav, header, footer, .sidebar, .navigation, .menu').remove();
  const mainContent = $('article, main, #content, .content, body').first();
  result.full_text = extractText($, mainContent);

  // ── Detect faction from text if unknown ──
  if (result.faction === 'unknown') {
    const textLower = result.full_text.toLowerCase();
    // Check affiliations first
    const affiliationText = result.affiliations.join(' ').toLowerCase();
    const combined = affiliationText + ' ' + textLower.slice(0, 2000);

    if (combined.match(/\bshu[\s-]han\b/) || combined.match(/\bliu bei\b/)) result.faction = 'shu';
    else if (combined.match(/\bcao wei\b/) || combined.match(/\bcao cao\b/)) result.faction = 'wei';
    else if (combined.match(/\beastern wu\b/) || combined.match(/\bsun quan\b/)) result.faction = 'wu';
    else if (combined.match(/\bjin dynasty\b/) || combined.match(/\bsima yan\b/)) result.faction = 'jin';
    else if (combined.match(/\bhan dynasty\b/)) result.faction = 'han';
  }

  return result;
}

// ── Main ──
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\n=== kongming.net Three Kingdoms Encyclopedia Crawler ===`);
  console.log(`Resume: ${resume}, Delay: ${delay}ms, Limit: ${limit === Infinity ? 'none' : limit}`);
  if (factionFilter) console.log(`Faction filter: ${factionFilter}`);
  console.log('');

  // Phase 1: Discover all officer links
  let officers = await discoverOfficerLinks();

  // Apply faction filter
  if (factionFilter) {
    officers = officers.filter(o => o.faction === factionFilter);
    console.log(`After faction filter (${factionFilter}): ${officers.length} officers\n`);
  }

  // Apply limit
  if (officers.length > limit) {
    officers = officers.slice(0, limit);
    console.log(`Limited to ${limit} officers\n`);
  }

  if (officers.length === 0) {
    console.log('No officers to crawl. Try --refresh-index or check faction filter.');
    return;
  }

  // Phase 2: Crawl individual pages
  const stats = { crawled: 0, skipped: 0, failed: 0, notFound: 0, totalChars: 0 };
  const failures = [];

  for (let i = 0; i < officers.length; i++) {
    const officer = officers[i];
    const slug = safeSlug(officer.name);
    const outPath = join(OUT_DIR, `${slug}.json`);

    // Resume check
    if (resume && existsSync(outPath)) {
      stats.skipped++;
      continue;
    }

    try {
      const result = await fetchWithRetry(officer.url, 3);

      if (!result.html || result.status === 404 || result.status === 403) {
        // Try alternate URL: /encyclopedia/{Name} ↔ /encyclopedia/officers/{Name}
        const altUrl = officer.url.includes('/officers/')
          ? officer.url.replace('/officers/', '/')
          : officer.url.replace('/encyclopedia/', '/encyclopedia/officers/');

        const altResult = await fetchWithRetry(altUrl, 1);
        if (altResult.html && altResult.status !== 404 && altResult.status !== 403) {
          officer.url = altUrl;
          const parsed = parseOfficerPage(altResult.html, officer);
          const charCount = parsed.full_text.length;

          writeFileSync(outPath, JSON.stringify({
            ...parsed,
            crawled_at: new Date().toISOString(),
            char_count: charCount,
          }, null, 2), 'utf-8');

          stats.crawled++;
          stats.totalChars += charCount;
          const fTag = parsed.faction !== 'unknown' ? ` [${parsed.faction}]` : '';
          console.log(`  [${i + 1}/${officers.length}] ${officer.name}${fTag} (${charCount.toLocaleString()} chars) [alt URL]`);
          if (i < officers.length - 1) await sleep(delay);
          continue;
        }

        stats.notFound++;
        if (i < officers.length - 1) await sleep(delay);
        continue;
      }

      const parsed = parseOfficerPage(result.html, officer);
      const charCount = parsed.full_text.length;

      writeFileSync(outPath, JSON.stringify({
        ...parsed,
        crawled_at: new Date().toISOString(),
        char_count: charCount,
      }, null, 2), 'utf-8');

      stats.crawled++;
      stats.totalChars += charCount;

      const fTag = parsed.faction !== 'unknown' ? ` [${parsed.faction}]` : '';
      console.log(`  [${i + 1}/${officers.length}] ${officer.name}${fTag} (${charCount.toLocaleString()} chars)`);
    } catch (err) {
      console.error(`  [${i + 1}/${officers.length}] FAILED ${officer.name}: ${err.message}`);
      stats.failed++;
      failures.push(officer.name);
    }

    if (i < officers.length - 1) await sleep(delay);
  }

  // ── Summary ──
  console.log('\n=== Summary ===');
  console.log(`Discovered: ${officers.length} officers`);
  console.log(`Crawled: ${stats.crawled}`);
  console.log(`Skipped (resume): ${stats.skipped}`);
  console.log(`Not found (404/403): ${stats.notFound}`);
  console.log(`Failed (error): ${stats.failed}`);
  console.log(`Total chars: ${stats.totalChars.toLocaleString()}`);
  if (failures.length) {
    console.log(`Failed: ${failures.slice(0, 20).join(', ')}${failures.length > 20 ? ` ... (+${failures.length - 20} more)` : ''}`);
  }

  const files = readdirSync(OUT_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  console.log(`Total files in ${OUT_DIR}: ${files.length}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
