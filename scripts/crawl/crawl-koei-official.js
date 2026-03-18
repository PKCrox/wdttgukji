#!/usr/bin/env node
/**
 * Koei 공식 사이트 캐릭터 크롤러
 *
 * koeitecmoamerica.com에서 RTK14 캐릭터 데이터 수집.
 * 메인 페이지는 캐릭터 목록(이름+진영+썸네일), 개별 페이지는 설명.
 * JS-rendered이므로 메인에서 캐릭터 ID 추출 후 개별 상세 페이지 크롤.
 *
 * Usage:
 *   node scripts/crawl/crawl-koei-official.js                  # 전체
 *   node scripts/crawl/crawl-koei-official.js --resume          # 이미 존재하면 스킵
 *   node scripts/crawl/crawl-koei-official.js --delay 3000      # 요청 간격 (ms, 기본 2000)
 *   node scripts/crawl/crawl-koei-official.js --limit 5         # 최대 N명만
 *   node scripts/crawl/crawl-koei-official.js --list-only       # 목록만 출력, 상세 크롤 안 함
 *
 * Output: data/raw/koei-official/rtk14-characters.json
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'data', 'raw', 'koei-official');

// ── CLI ──
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const hasFlag = (f) => args.includes(f);

const resume = hasFlag('--resume');
const listOnly = hasFlag('--list-only');
const delay = parseInt(getArg('--delay') || '2000', 10);
const limitN = getArg('--limit') ? parseInt(getArg('--limit'), 10) : Infinity;

const BASE_URL = 'https://www.koeitecmoamerica.com/rtk14';
const CHARACTERS_URL = `${BASE_URL}/characters.html`;
const CREATOR_URL = `${BASE_URL}/creator.html`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Faction mapping ──
const FACTION_MAP = {
  gi: 'Wei',
  go: 'Wu',
  shoku: 'Shu',
  other: 'Other',
};

// ── HTML Fetch ──
async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9,ko;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// ── Step 1: Parse character list from main page ──
function parseCharacterList(html) {
  const $ = cheerio.load(html);
  const characters = [];

  // Characters are <a class="character modaal-chara {faction}"> with <img>
  // The rel attribute is set by JS at runtime, so extract ID from img src.
  // Image src pattern: "images/characters/list_{id}.jpg"
  $('a.character').each((_, el) => {
    const $el = $(el);

    const $img = $el.find('img');
    const alt = $img.attr('alt') || '';
    const imgSrc = $img.attr('src') || '';

    // Extract character ID from image filename: list_{id}.jpg
    const idMatch = imgSrc.match(/list_([^.]+)\./);
    const id = idMatch ? idMatch[1] : '';
    if (!id) return;

    // Get text content (name lines like "許褚\n            Xu Chu")
    const text = $el.text().trim();

    // Detect faction from element class: "character modaal-chara gi new"
    let faction = 'Other';
    const selfClasses = ($el.attr('class') || '').split(/\s+/);
    for (const cls of selfClasses) {
      if (FACTION_MAP[cls]) {
        faction = FACTION_MAP[cls];
        break;
      }
    }

    // Parse name: text is "許褚\n            Xu Chu" or "許褚 / Xu Chu"
    let nameCn = alt;
    let nameEn = '';
    const lines = text.split(/\n/).map(s => s.trim()).filter(Boolean);
    if (lines.length >= 2) {
      nameCn = lines[0];
      nameEn = lines[1];
    } else if (text.includes('/')) {
      const parts = text.split('/').map(s => s.trim());
      nameCn = parts[0] || alt;
      nameEn = parts[1] || '';
    }

    const portraitUrl = imgSrc ? new URL(imgSrc, CHARACTERS_URL).href : '';

    characters.push({
      id,
      name_cn: nameCn,
      name_en: nameEn,
      faction,
      portrait_url: portraitUrl,
      detail_url: `${BASE_URL}/chara_${id}.html`,
    });
  });

  return characters;
}

// ── Step 2: Fetch individual character detail page ──
async function fetchCharacterDetail(char) {
  try {
    const html = await fetchPage(char.detail_url);
    const $ = cheerio.load(html);

    // The detail page has character description text
    // Try various selectors for the content
    let description = '';

    // Look for paragraph text in the main content area
    const contentSelectors = [
      '.modaal__chara__text',
      '.character-detail',
      '.chara-detail',
      '.detail',
      'article',
      '.content',
      'main',
      'p',
    ];

    for (const sel of contentSelectors) {
      const $found = $(sel);
      if ($found.length > 0) {
        const text = $found.text().trim();
        if (text.length > 20) {
          description = text;
          break;
        }
      }
    }

    // Fallback: gather all paragraph text
    if (!description) {
      const paragraphs = [];
      $('p').each((_, el) => {
        const t = $(el).text().trim();
        if (t.length > 10) paragraphs.push(t);
      });
      description = paragraphs.join('\n\n');
    }

    // Look for any image in the detail page (full portrait)
    let fullPortraitUrl = '';
    $('img').each((_, el) => {
      const src = $(el).attr('src') || '';
      if (src.includes('image_') || src.includes('chara_')) {
        fullPortraitUrl = new URL(src, char.detail_url).href;
      }
    });

    // Check if page was JS-rendered (empty content)
    const bodyText = $('body').text().trim();
    const isEmpty = bodyText.length < 50;

    return {
      description: description || null,
      full_portrait_url: fullPortraitUrl || null,
      js_rendered: isEmpty,
      raw_text_length: bodyText.length,
    };
  } catch (err) {
    return {
      description: null,
      full_portrait_url: null,
      js_rendered: false,
      error: err.message,
    };
  }
}

// ── Step 3: Fetch creator page ──
async function fetchCreatorPage() {
  try {
    const html = await fetchPage(CREATOR_URL);
    const $ = cheerio.load(html);

    const interviews = [];

    // Look for interview sections
    const volumeHeaders = [];
    $('h2, h3, .volume, [class*="volume"]').each((_, el) => {
      const text = $(el).text().trim();
      if (text.toLowerCase().includes('vol') || text.includes('Volume')) {
        volumeHeaders.push(text);
      }
    });

    // Extract Q&A pairs
    const qaBlocks = [];
    $('dt, .question, [class*="question"]').each((_, el) => {
      const q = $(el).text().trim();
      const a = $(el).next('dd, .answer, [class*="answer"]').text().trim();
      if (q && a) {
        qaBlocks.push({ question: q, answer: a });
      }
    });

    // Gather all text
    const allText = $('body').text().trim();

    return {
      url: CREATOR_URL,
      volumes: volumeHeaders,
      qa_pairs: qaBlocks,
      text_length: allText.length,
      has_content: allText.length > 200,
    };
  } catch (err) {
    return { url: CREATOR_URL, error: err.message };
  }
}

// ── Main ──
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, 'rtk14-characters.json');

  console.log(`\n=== Koei Official RTK14 Character Crawler ===`);
  console.log(`   Delay: ${delay}ms, Resume: ${resume}`);
  console.log(`   Output: ${OUT_DIR}\n`);

  // Resume check
  if (resume && existsSync(outPath)) {
    try {
      const existing = JSON.parse(readFileSync(outPath, 'utf-8'));
      console.log(`SKIP (already exists: ${existing.total_characters} characters)`);
      return;
    } catch { /* corrupt, re-crawl */ }
  }

  // ── Step 1: Character list ──
  console.log(`[1/3] Fetching character list: ${CHARACTERS_URL}`);
  const listHtml = await fetchPage(CHARACTERS_URL);
  console.log(`   HTML received: ${(listHtml.length / 1024).toFixed(0)} KB`);

  const characters = parseCharacterList(listHtml);
  console.log(`   Characters found: ${characters.length}`);

  if (characters.length === 0) {
    console.log('   WARNING: No characters extracted. Page may be fully JS-rendered.');
    console.log('   Saving empty result with raw HTML note.\n');

    const output = {
      source: 'koeitecmoamerica.com - RTK14 Characters',
      url: CHARACTERS_URL,
      crawled_at: new Date().toISOString(),
      total_characters: 0,
      note: 'Page appears to be JavaScript-rendered. Characters could not be extracted via static HTML parsing. Consider using a headless browser (Playwright) for full extraction.',
      characters: [],
    };
    writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
    return;
  }

  // Faction breakdown
  const factions = {};
  for (const c of characters) {
    factions[c.faction] = (factions[c.faction] || 0) + 1;
  }
  console.log(`   Factions: ${Object.entries(factions).map(([k, v]) => `${k}=${v}`).join(', ')}`);

  if (listOnly) {
    console.log('\n   --list-only mode. Characters:');
    for (const c of characters) {
      console.log(`     ${c.id}: ${c.name_cn} / ${c.name_en} [${c.faction}]`);
    }
    return;
  }

  // ── Step 2: Character details ──
  const targetChars = characters.slice(0, limitN);
  console.log(`\n[2/3] Fetching character details: ${targetChars.length} characters`);

  let detailSuccess = 0;
  let detailJsRendered = 0;
  let detailFailed = 0;

  for (let i = 0; i < targetChars.length; i++) {
    const char = targetChars[i];

    if (i > 0) await sleep(delay);

    const detail = await fetchCharacterDetail(char);

    if (detail.error) {
      console.log(`   [${i + 1}/${targetChars.length}] ${char.name_cn} -- FAILED: ${detail.error}`);
      char.detail = { error: detail.error };
      detailFailed++;
    } else if (detail.js_rendered) {
      // Detail page is JS-rendered, note it
      char.detail = {
        description: null,
        note: 'Detail page is JavaScript-rendered. Description not available via static fetch.',
      };
      if (detail.full_portrait_url) char.full_portrait_url = detail.full_portrait_url;
      detailJsRendered++;
    } else {
      if (detail.description) {
        char.description = detail.description;
      }
      if (detail.full_portrait_url) {
        char.full_portrait_url = detail.full_portrait_url;
      }
      detailSuccess++;
    }

    // Progress every 10
    if ((i + 1) % 10 === 0 || i === targetChars.length - 1) {
      console.log(`   [${i + 1}/${targetChars.length}] OK=${detailSuccess} JS-only=${detailJsRendered} FAIL=${detailFailed}`);
    }
  }

  // ── Step 3: Creator page ──
  console.log(`\n[3/3] Fetching creator page: ${CREATOR_URL}`);
  await sleep(delay);
  const creatorData = await fetchCreatorPage();
  if (creatorData.error) {
    console.log(`   Creator page FAILED: ${creatorData.error}`);
  } else {
    console.log(`   Creator page: ${creatorData.text_length} chars, ${creatorData.qa_pairs?.length || 0} Q&A pairs`);
  }

  // ── Build output ──
  // Clean up internal fields from characters for output
  const outputChars = targetChars.map(c => {
    const entry = {
      id: c.id,
      name_cn: c.name_cn,
      name_en: c.name_en,
      faction: c.faction,
      portrait_url: c.portrait_url,
    };
    if (c.full_portrait_url) entry.full_portrait_url = c.full_portrait_url;
    if (c.description) entry.description = c.description;
    if (c.detail?.note) entry.note = c.detail.note;
    if (c.detail?.error) entry.error = c.detail.error;
    return entry;
  });

  const output = {
    source: 'koeitecmoamerica.com - RTK14',
    urls: {
      characters: CHARACTERS_URL,
      creator: CREATOR_URL,
    },
    crawled_at: new Date().toISOString(),
    total_characters: outputChars.length,
    factions,
    detail_stats: {
      with_description: detailSuccess,
      js_rendered_only: detailJsRendered,
      failed: detailFailed,
    },
    characters: outputChars,
    creator: creatorData,
  };

  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n   Saved: ${outPath}`);

  // ── Summary ──
  console.log('\n' + '='.repeat(50));
  console.log(`Done: ${outputChars.length} characters`);
  console.log(`   Descriptions: ${detailSuccess}, JS-only: ${detailJsRendered}, Failed: ${detailFailed}`);
  if (detailJsRendered > 0) {
    console.log(`   NOTE: ${detailJsRendered} detail pages were JS-rendered. Use Playwright for full extraction.`);
  }
  console.log('='.repeat(50) + '\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
