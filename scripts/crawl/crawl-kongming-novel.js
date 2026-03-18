#!/usr/bin/env node
/**
 * kongming.net 삼국지연의 영문 번역 크롤러
 *
 * Romance of the Three Kingdoms 영문 번역본 120회 전체 크롤링
 * Index: https://kongming.net/threekingdoms/
 * Chapters: https://kongming.net/threekingdoms/{1-120}
 *
 * Usage:
 *   node scripts/crawl/crawl-kongming-novel.js                        # 전체 120회
 *   node scripts/crawl/crawl-kongming-novel.js --resume                # 이미 크롤된 건 스킵
 *   node scripts/crawl/crawl-kongming-novel.js --delay 3000            # 요청 간격 (ms, 기본 2000)
 *   node scripts/crawl/crawl-kongming-novel.js --start 50 --end 60    # 범위 지정
 *
 * Output: data/raw/novel-kongming/{chapter_number}.json
 */

import { writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'data', 'raw', 'novel-kongming');

// ── CLI ──
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const hasFlag = (f) => args.includes(f);

const resume = hasFlag('--resume');
const delay = parseInt(getArg('--delay') || '2000', 10);
const startChapter = parseInt(getArg('--start') || '1', 10);
const endChapter = parseInt(getArg('--end') || '120', 10);

// ── Utils ──
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Fetch a page with retry (up to 3 attempts, exponential backoff)
 */
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      return { status: res.status, html };
    } catch (err) {
      if (attempt === retries) throw err;
      const backoff = delay * attempt;
      console.warn(`  Retry ${attempt}/${retries} for ${url} (waiting ${backoff}ms): ${err.message}`);
      await sleep(backoff);
    }
  }
}

/**
 * Extract text from a cheerio element, preserving paragraph breaks
 */
function extractTextWithParagraphs($, el) {
  if (!el || !el.length) return '';

  const blocks = [];
  const blockTags = new Set([
    'p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'li', 'blockquote', 'pre', 'tr',
  ]);

  function walk(node) {
    if (node.type === 'text') {
      const t = node.data.replace(/\s+/g, ' ');
      if (t.trim()) blocks.push(t.trim());
      return;
    }
    if (node.type === 'tag') {
      const tag = node.tagName.toLowerCase();
      if (['script', 'style', 'noscript', 'nav'].includes(tag)) return;

      const isBlock = blockTags.has(tag);
      if (isBlock) blocks.push('\n');

      for (const child of node.children || []) {
        walk(child);
      }

      if (isBlock) blocks.push('\n');
    }
  }

  el.each((_, node) => walk(node));

  return blocks
    .join('')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Extract heading text, replacing <br> with " / " for clean formatting.
 * kongming.net uses <br> inside h1/h2 to separate lines.
 */
function headingText($, el) {
  // Replace <br> tags with a separator before extracting text
  $(el).find('br').replaceWith(' / ');
  return $(el).text().trim().replace(/\s+/g, ' ');
}

/**
 * Parse chapter page from kongming.net/threekingdoms/{N}
 *
 * Structure (verified live):
 * - H1: "Romance of the Three Kingdoms<br>Chapter N"
 * - H2: "English Title Part 1<br>English Title Part 2"
 * - Breadcrumb nav at top
 * - Prev/next chapter nav (⏴/⏵)
 * - Main text in <p> tags, blockquotes for poetry
 * - Internal links to encyclopedia entries
 */
function parseChapterPage(html, chapterNum) {
  const $ = cheerio.load(html);

  // ── Extract title ──
  let title = '';

  // Strategy 1: H1 containing "Chapter"
  $('h1').each((_, h) => {
    const text = headingText($, $(h));
    if (text.match(/chapter/i) && !title) title = text;
  });

  // Strategy 2: H2 subtitle (the actual chapter name)
  let subtitle = '';
  $('h2').each((_, h) => {
    const text = headingText($, $(h));
    // Skip navigation-like headings
    if (text.length > 5 && !text.match(/^(home|menu|nav|search|kongming|archives)/i)) {
      if (!subtitle) subtitle = text;
    }
  });

  // Combine: "Chapter N: Subtitle Part 1 / Subtitle Part 2"
  if (title && subtitle) {
    title = `${title} — ${subtitle}`;
  } else if (!title && subtitle) {
    title = `Chapter ${chapterNum} — ${subtitle}`;
  } else if (!title) {
    title = $('title').text().trim().replace(/\s*[-|].*kongming.*$/i, '');
  }

  // ── Remove noise elements ──
  $('nav, header, footer, .sidebar, .navigation, .menu').remove();
  $('script, style, noscript, iframe').remove();

  // Remove breadcrumb navigation text
  $('a').each((_, a) => {
    const text = $(a).text().trim();
    if (text === 'Kongming\'s Archives' || text === 'Scholars of Shen Zhou' ||
        text === 'Romance of the Three Kingdoms' || text === '⏴' || text === '⏵') {
      $(a).remove();
    }
  });

  // ── Find main content ──
  let contentEl = null;

  // Try known selectors
  const selectors = [
    'article', 'main', '#content', '.content',
    '#main-content', '.main-content', '.entry-content',
  ];

  for (const sel of selectors) {
    const el = $(sel);
    if (el.length && el.text().trim().length > 500) {
      contentEl = el;
      break;
    }
  }

  // Fallback: find the largest text block
  if (!contentEl) {
    let maxLen = 0;
    $('body').find('div, td, section, article, main').each((_, el) => {
      const textLen = $(el).text().trim().length;
      const childDivs = $(el).find('div, section, article').length;
      // Prefer deep containers with lots of text but few structural children
      if (textLen > maxLen && (childDivs < 8 || textLen > maxLen * 1.5)) {
        maxLen = textLen;
        contentEl = $(el);
      }
    });
  }

  // Final fallback
  if (!contentEl || contentEl.text().trim().length < 200) {
    contentEl = $('body');
  }

  const text = extractTextWithParagraphs($, contentEl);

  return { title, text };
}

// ── Main ──
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\n=== kongming.net Romance of the Three Kingdoms Crawler ===`);
  console.log(`URL: https://kongming.net/threekingdoms/{N}`);
  console.log(`Range: Chapter ${startChapter} to ${endChapter}`);
  console.log(`Resume: ${resume}, Delay: ${delay}ms\n`);

  const stats = { crawled: 0, skipped: 0, failed: 0, totalChars: 0 };
  const failures = [];

  for (let ch = startChapter; ch <= endChapter; ch++) {
    const outPath = join(OUT_DIR, `${ch}.json`);

    // Resume check
    if (resume && existsSync(outPath)) {
      stats.skipped++;
      continue;
    }

    const url = `https://kongming.net/threekingdoms/${ch}`;

    try {
      const result = await fetchWithRetry(url, 3);

      if (!result.html || result.status === 404) {
        console.error(`  FAILED Chapter ${ch}: ${result.status || 'empty response'}`);
        stats.failed++;
        failures.push(ch);
        await sleep(delay);
        continue;
      }

      const { title, text } = parseChapterPage(result.html, ch);
      const charCount = text.length;

      const record = {
        chapter: ch,
        title: title || `Chapter ${ch}`,
        text,
        url,
        crawled_at: new Date().toISOString(),
        char_count: charCount,
      };

      writeFileSync(outPath, JSON.stringify(record, null, 2), 'utf-8');
      stats.crawled++;
      stats.totalChars += charCount;

      console.log(`Chapter ${ch}/120: ${record.title} (${charCount.toLocaleString()} chars)`);
    } catch (err) {
      console.error(`  FAILED Chapter ${ch}: ${err.message}`);
      stats.failed++;
      failures.push(ch);
    }

    // Delay between requests
    if (ch < endChapter) await sleep(delay);
  }

  // ── Summary ──
  console.log('\n=== Summary ===');
  console.log(`Crawled: ${stats.crawled}`);
  console.log(`Skipped (resume): ${stats.skipped}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`Total chars: ${stats.totalChars.toLocaleString()}`);
  if (failures.length) {
    console.log(`Failed chapters: ${failures.join(', ')}`);
  }

  const files = readdirSync(OUT_DIR).filter(f => f.endsWith('.json'));
  console.log(`Total files in ${OUT_DIR}: ${files.length}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
