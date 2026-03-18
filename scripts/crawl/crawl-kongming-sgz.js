#!/usr/bin/env node
/**
 * kongming.net 정사삼국지 (Sanguozhi) 영문 번역 크롤러
 *
 * Records of the Three Kingdoms (正史三国志) 번역된 전기 크롤링
 * Index: https://kongming.net/novel/sgz/
 * Biographies: https://kongming.net/biographies/sanguozhi/{Character-Name}/{Translator}
 *
 * Verified: 288 entries, ~175 unique characters, translators include
 * LadyWu, jiuwan, JackYuan, ZL181, StephenSo, Battleroyale, Sonken, etc.
 *
 * Usage:
 *   node scripts/crawl/crawl-kongming-sgz.js                    # 전체
 *   node scripts/crawl/crawl-kongming-sgz.js --resume           # 이미 크롤된 건 스킵
 *   node scripts/crawl/crawl-kongming-sgz.js --delay 3000       # 요청 간격 (ms, 기본 2000)
 *   node scripts/crawl/crawl-kongming-sgz.js --limit 50         # 최대 N명
 *   node scripts/crawl/crawl-kongming-sgz.js --refresh-index    # 인덱스 캐시 무시
 *
 * Output: data/raw/kongming-sgz/{character-slug}.json
 *         (multiple translators merged into one file per character)
 */

import { writeFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'data', 'raw', 'kongming-sgz');
const INDEX_CACHE = join(OUT_DIR, '_index-cache.json');

// ── CLI ──
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const hasFlag = (f) => args.includes(f);

const resume = hasFlag('--resume');
const delay = parseInt(getArg('--delay') || '2000', 10);
const limit = getArg('--limit') ? parseInt(getArg('--limit'), 10) : Infinity;
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

/**
 * Discover all SGZ biography links from the index page.
 *
 * Verified URL pattern: /biographies/sanguozhi/{Character-Name}/{Translator}
 * Index page at /novel/sgz/ lists all 288 entries.
 * Some characters have multiple translators.
 */
async function discoverBiographyLinks() {
  // Check cache
  if (!refreshIndex && existsSync(INDEX_CACHE)) {
    try {
      const cached = JSON.parse(readFileSync(INDEX_CACHE, 'utf-8'));
      if (cached.characters?.length > 0) {
        console.log(`Using cached index (${cached.characters.length} characters, ${cached.total_entries} entries, cached at ${cached.cached_at})`);
        return cached.characters;
      }
    } catch { /* ignore corrupt cache */ }
  }

  console.log('Fetching SGZ index page...\n');

  /** @type {Map<string, { name: string, slug: string, entries: Array<{url: string, translator: string, label: string}> }>} */
  const characters = new Map();
  let totalEntries = 0;

  const indexUrl = 'https://kongming.net/novel/sgz/';
  try {
    const result = await fetchWithRetry(indexUrl, 3);
    if (!result.html || result.status === 404) {
      console.error('  SGZ index page not found!');
      return [];
    }

    const $ = cheerio.load(result.html);

    $('a[href]').each((_, a) => {
      const href = $(a).attr('href') || '';
      const text = $(a).text().trim();
      if (!text || text.length < 2) return;

      // Match: /biographies/sanguozhi/{Character-Name}/{Translator}
      const match = href.match(/\/biographies\/sanguozhi\/([\w-]+)\/([\w-]+)/);
      if (!match) return;

      const charPath = match[1]; // e.g., "Cao-Cao"
      const translator = match[2]; // e.g., "JackYuan"
      const fullUrl = `https://kongming.net${href}`;

      // Extract character name from link text (strip courtesy name in parens)
      const name = text.replace(/\s*\(.*?\)\s*/g, '').trim();
      const slug = safeSlug(charPath);

      if (characters.has(slug)) {
        const existing = characters.get(slug);
        // Add translator variant if not duplicate
        if (!existing.entries.some(e => e.url === fullUrl)) {
          existing.entries.push({ url: fullUrl, translator, label: text });
          totalEntries++;
        }
      } else {
        characters.set(slug, {
          name: name || charPath.replace(/-/g, ' '),
          slug,
          entries: [{ url: fullUrl, translator, label: text }],
        });
        totalEntries++;
      }
    });

    console.log(`  Index page: ${characters.size} unique characters, ${totalEntries} total entries`);
  } catch (err) {
    console.error(`  Index fetch failed: ${err.message}`);
    return [];
  }

  const charList = Array.from(characters.values());
  charList.sort((a, b) => a.name.localeCompare(b.name));

  // Cache
  writeFileSync(INDEX_CACHE, JSON.stringify({
    characters: charList,
    cached_at: new Date().toISOString(),
    count: charList.length,
    total_entries: totalEntries,
  }, null, 2), 'utf-8');

  console.log(`\nDiscovered ${charList.length} characters (${totalEntries} total biography entries)\n`);
  return charList;
}

/**
 * Parse a biography page.
 *
 * Structure (from live inspection of /biographies/sanguozhi/Cao-Cao/JackYuan):
 * - Title: "Cao Cao (Mengde) 曹操 (孟德)"
 * - Metadata: dates (AD 155-220), translator, year
 * - Main text in <p> tags — chronological narrative
 * - Some pages have Chinese source text alongside English
 * - Appraisal/commentary section at the end
 */
function parseBiographyPage(html, charName, translator) {
  const $ = cheerio.load(html);

  // Remove noise
  $('script, style, noscript, iframe').remove();
  $('nav, header, footer, .sidebar, .navigation, .menu').remove();

  const pageTitle = $('title').text().trim();

  // Extract Chinese name from title
  let chineseName = '';
  const chMatch = pageTitle.match(/([\u4e00-\u9fff]+)/);
  if (chMatch) chineseName = chMatch[1];

  // Extract dates
  let lifeSpan = '';
  const bodyText = $('body').text();
  const dateMatch = bodyText.match(/(?:AD\s+)?(\d{2,3})\s*[-–—]\s*(\d{2,3})/);
  if (dateMatch) lifeSpan = `AD ${dateMatch[1]}–${dateMatch[2]}`;

  // Detect translator from page if different from URL
  let detectedTranslator = translator;
  const transMatch = bodyText.match(/[Tt]ranslat(?:ed|ion)\s+by\s+([\w\s.]+?)(?:\.|,|\n|$)/);
  if (transMatch) detectedTranslator = transMatch[1].trim();

  // Extract source reference
  let source = '';
  const srcMatch = bodyText.match(/((?:Book|Records)\s+of\s+(?:the\s+)?(?:Wei|Shu|Wu|Three Kingdoms|Jin)[^.\n]{0,100})/i);
  if (srcMatch) source = srcMatch[1].trim();

  // Main content extraction
  const mainContent = $('article, main, #content, .content, body').first();
  const fullText = extractText($, mainContent);

  // Separate Chinese source text from English translation
  let sourceText = '';
  let translationText = fullText;

  // Detect continuous Chinese text blocks (at least 10 consecutive characters)
  const chinesePattern = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]{10,}/g;
  const chineseBlocks = fullText.match(chinesePattern);
  if (chineseBlocks && chineseBlocks.length > 0) {
    sourceText = chineseBlocks.join('\n\n');
    // Don't strip Chinese from translation — keep it interleaved as-is for context
  }

  // Extract sections by headings
  const sections = {};
  $('h2, h3, h4').each((_, h) => {
    const heading = $(h).text().trim();
    if (heading.length < 2) return;

    const parts = [];
    let next = $(h).next();
    while (next.length) {
      const tag = next.prop('tagName')?.toLowerCase();
      if (tag && ['h1', 'h2', 'h3', 'h4'].includes(tag)) break;
      const text = next.text().trim();
      if (text) parts.push(text);
      next = next.next();
    }

    if (parts.length) {
      sections[safeSlug(heading)] = parts.join('\n');
    }
  });

  return {
    translator: detectedTranslator,
    url_translator: translator,
    source,
    chinese_name: chineseName,
    life_span: lifeSpan,
    source_text: sourceText,
    translation: fullText,
    sections,
    page_title: pageTitle,
    char_count: fullText.length,
  };
}

// ── Main ──
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\n=== kongming.net Sanguozhi (正史三国志) Biography Crawler ===`);
  console.log(`URL pattern: /biographies/sanguozhi/{Name}/{Translator}`);
  console.log(`Resume: ${resume}, Delay: ${delay}ms, Limit: ${limit === Infinity ? 'none' : limit}`);
  console.log('');

  // Phase 1: Discover all biography links
  let characters = await discoverBiographyLinks();

  // Apply limit
  if (characters.length > limit) {
    characters = characters.slice(0, limit);
    console.log(`Limited to ${limit} characters\n`);
  }

  if (characters.length === 0) {
    console.log('No biographies to crawl. Try --refresh-index.');
    return;
  }

  // Phase 2: Crawl individual biography pages
  const stats = { crawled: 0, skipped: 0, failed: 0, notFound: 0, totalChars: 0, totalTranslations: 0 };
  const failures = [];

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    const outPath = join(OUT_DIR, `${char.slug}.json`);

    // Resume check
    if (resume && existsSync(outPath)) {
      stats.skipped++;
      continue;
    }

    const translations = [];

    // Crawl each translator's version
    for (let j = 0; j < char.entries.length; j++) {
      const entry = char.entries[j];

      try {
        const result = await fetchWithRetry(entry.url, 3);

        if (!result.html || result.status === 404 || result.status === 403) {
          // Not found — skip this translation
          continue;
        }

        const parsed = parseBiographyPage(result.html, char.name, entry.translator);

        translations.push({
          ...parsed,
          url: entry.url,
        });

        // Delay between translator variants
        if (j < char.entries.length - 1) await sleep(delay);
      } catch (err) {
        console.warn(`    Error: ${entry.url}: ${err.message}`);
      }
    }

    if (translations.length > 0) {
      const totalChars = translations.reduce((sum, t) => sum + t.char_count, 0);

      const record = {
        character: char.name,
        slug: char.slug,
        translation_count: translations.length,
        translations,
        crawled_at: new Date().toISOString(),
        total_char_count: totalChars,
      };

      writeFileSync(outPath, JSON.stringify(record, null, 2), 'utf-8');
      stats.crawled++;
      stats.totalChars += totalChars;
      stats.totalTranslations += translations.length;

      const transInfo = translations.length > 1 ? ` (${translations.length} translators)` : '';
      const transNames = translations.map(t => t.url_translator).join(', ');
      console.log(`  [${i + 1}/${characters.length}] ${char.name}${transInfo} — ${transNames} (${totalChars.toLocaleString()} chars)`);
    } else {
      stats.notFound++;
      // Only log as failure if we actually expected content
      if (char.entries.length > 0) {
        console.warn(`  [${i + 1}/${characters.length}] ${char.name}: all ${char.entries.length} URLs returned 404`);
      }
    }

    // Delay between characters
    if (i < characters.length - 1) await sleep(delay);
  }

  // ── Summary ──
  console.log('\n=== Summary ===');
  console.log(`Discovered: ${characters.length} characters`);
  console.log(`Crawled: ${stats.crawled} characters`);
  console.log(`Total translations fetched: ${stats.totalTranslations}`);
  console.log(`Skipped (resume): ${stats.skipped}`);
  console.log(`Not found (all 404): ${stats.notFound}`);
  console.log(`Total chars: ${stats.totalChars.toLocaleString()}`);
  if (failures.length) {
    console.log(`Errors: ${failures.slice(0, 20).join(', ')}${failures.length > 20 ? ` ... (+${failures.length - 20} more)` : ''}`);
  }

  const files = readdirSync(OUT_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  console.log(`Total files in ${OUT_DIR}: ${files.length}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
