#!/usr/bin/env node
/**
 * 영어 위키피디아 삼국지 캐릭터 크롤러
 *
 * Wikipedia REST API 사용:
 * - /page/summary/{title} — 간단 요약 (plain text extract)
 * - /page/html/{title} — 전체 HTML (cheerio로 섹션 파싱)
 *
 * Usage:
 *   node scripts/crawl/crawl-wiki-en.js              # Tier 0 + Tier 1 (80명)
 *   node scripts/crawl/crawl-wiki-en.js --tier 0      # Tier 0만 (20명)
 *   node scripts/crawl/crawl-wiki-en.js --name "Cao Cao"  # 특정 캐릭터만
 *   node scripts/crawl/crawl-wiki-en.js --resume      # 이미 크롤된 건 스킵
 *   node scripts/crawl/crawl-wiki-en.js --delay 1500  # 요청 간격 (ms, 기본 1000)
 *
 * Output: data/raw/characters-wiki-en/{name_en_lower}.json
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load as cheerioLoad } from 'cheerio';
import { TIER_0, TIER_1, ALL_CHARACTERS } from './character-list.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'data', 'raw', 'characters-wiki-en');

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
    c.name_kr === nameFilter || c.name_en.toLowerCase() === nameFilter.toLowerCase()
  );
  if (!targets.length) { console.error(`"${nameFilter}" not found`); process.exit(1); }
} else if (tierFilter === '0') {
  targets = TIER_0;
} else if (tierFilter === '1') {
  targets = TIER_1;
} else {
  targets = ALL_CHARACTERS;
}

// ── 위키피디아 타이틀 특수 매핑 ──
// 일부 캐릭터는 영어 위키피디아 문서 제목이 name_en과 다름
const TITLE_OVERRIDES = {
  'Diao Chan': 'Diaochan',
  'Lu Bu': 'Lü_Bu',
  'Sun Shangxiang': 'Lady_Sun',
  'Lu Lingqi': 'Lü_Lingqi',
  'Zhu Rong': 'Lady_Zhurong',
  'Da Qiao': 'Two_Qiaos',
  'Xiao Qiao': 'Two_Qiaos',
  'Xun Gongda': 'Xun_You',             // 순공달 → 순유(荀攸)
  'Wen Yang': 'Wen_Yang_(Three_Kingdoms)',
  'Zhang Bao': 'Zhang_Bao_(Shu_Han)',
  'Kan Ze': 'Kan_Ze',
};

// ── 유틸 ──
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const safeFilename = (name) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

const API_BASE = 'https://en.wikipedia.org/api/rest_v1';
const UA = 'WdttGukjiBot/1.0 (https://github.com/vibechanbob/wdttgukji; contact: crawl script)';

/**
 * name_en → Wikipedia article title 변환
 * "Cao Cao" → "Cao_Cao", 오버라이드 있으면 우선
 */
function toWikiTitle(nameEn) {
  if (TITLE_OVERRIDES[nameEn]) return TITLE_OVERRIDES[nameEn];
  return nameEn.replace(/\s+/g, '_');
}

/**
 * Wikipedia REST API fetch (summary or html)
 * @param {'summary'|'html'} endpoint
 * @param {string} title - Wiki article title (underscored)
 * @returns {Promise<{status: number, data: any, contentType: string}>}
 */
async function wikiApiFetch(endpoint, title) {
  const url = `${API_BASE}/page/${endpoint}/${encodeURIComponent(title)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': endpoint === 'summary'
        ? 'application/json'
        : 'text/html; charset=utf-8',
    },
  });

  if (!res.ok) {
    return { status: res.status, data: null, contentType: '' };
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('json')) {
    return { status: res.status, data: await res.json(), contentType };
  }
  return { status: res.status, data: await res.text(), contentType };
}

/**
 * 여러 타이틀 후보를 순서대로 시도
 * @param {'summary'|'html'} endpoint
 * @param {string[]} titleCandidates
 * @returns {Promise<{status: number, data: any, contentType: string, usedTitle: string}>}
 */
async function wikiApiFetchWithFallback(endpoint, titleCandidates) {
  for (const title of titleCandidates) {
    const result = await wikiApiFetch(endpoint, title);
    if (result.status === 200) {
      return { ...result, usedTitle: title };
    }
    // 404 → 다음 후보, 그 외 에러 → 다음 후보
    if (result.status !== 404) {
      // rate limit (429) 등은 잠시 대기 후 다음 후보
      if (result.status === 429) await sleep(5000);
    }
  }
  return { status: 404, data: null, contentType: '', usedTitle: titleCandidates[0] };
}

/**
 * name_en에서 fallback 타이틀 후보 목록 생성
 * 1. Override or basic (e.g. "Cao_Cao")
 * 2. "Lu_Bu" if override is "Lü_Bu"
 * 3. "{Name}_(Three_Kingdoms)" disambiguation
 */
function buildTitleCandidates(nameEn) {
  const candidates = [];
  const primary = toWikiTitle(nameEn);
  candidates.push(primary);

  // 원래 이름 기반 (오버라이드와 다를 때)
  const plain = nameEn.replace(/\s+/g, '_');
  if (plain !== primary) {
    candidates.push(plain);
  }

  // disambiguation fallback
  const disambig = `${plain}_(Three_Kingdoms)`;
  if (!candidates.includes(disambig)) {
    candidates.push(disambig);
  }

  return candidates;
}

/**
 * Wikipedia HTML에서 섹션 구조 파싱 (cheerio)
 *
 * Wikipedia REST API HTML은 <section> 태그로 섹션이 구분되며,
 * 각 섹션 내 <h2>/<h3> 등의 헤딩과 <p> 본문을 가짐.
 * 또한 mw-headline 클래스의 span이 헤딩 텍스트를 담음.
 */
function parseWikiHtml(html) {
  const $ = cheerioLoad(html);
  const sections = [];
  const categories = [];

  // 방법 1: <section> 태그 기반 파싱 (REST API HTML)
  const sectionEls = $('section');
  if (sectionEls.length > 1) {
    sectionEls.each((_, sectionEl) => {
      const $sec = $(sectionEl);
      const heading = $sec.find('h2, h3, h4').first();
      let headingText = '';
      let level = 2;

      if (heading.length) {
        // REST API: 헤딩 id 또는 텍스트
        headingText = heading.find('.mw-headline').text().trim()
          || heading.text().replace(/\[edit\]/g, '').trim();
        const tag = heading.prop('tagName')?.toLowerCase() || 'h2';
        level = parseInt(tag.replace('h', ''), 10) || 2;
      } else {
        headingText = 'Lead';
        level = 1;
      }

      // 불필요한 섹션 스킵
      if (shouldSkipSection(headingText)) return;

      // 본문 텍스트 수집
      const paragraphs = [];
      $sec.find('p').each((_, p) => {
        const text = $(p).text().trim();
        if (text.length > 0) paragraphs.push(text);
      });

      // 리스트 텍스트 수집 (ul/ol)
      $sec.find('ul > li, ol > li').each((_, li) => {
        const text = $(li).text().trim();
        if (text.length > 5) paragraphs.push('- ' + text);
      });

      const content = paragraphs.join('\n\n');
      if (content.length > 5) {
        sections.push({ heading: headingText, level, content });
      }
    });
  } else {
    // 방법 2: heading 태그 기반 fallback 파싱
    const headings = $('h2, h3');
    let currentHeading = 'Lead';
    let currentLevel = 1;
    let currentParagraphs = [];

    // Lead 섹션 (첫 h2 전까지)
    $('body').children().each((_, el) => {
      const $el = $(el);
      const tag = el.tagName?.toLowerCase();

      if (tag === 'h2' || tag === 'h3') {
        // 이전 섹션 저장
        const content = currentParagraphs.join('\n\n');
        if (content.length > 5 && !shouldSkipSection(currentHeading)) {
          sections.push({ heading: currentHeading, level: currentLevel, content });
        }
        currentHeading = $el.find('.mw-headline').text().trim()
          || $el.text().replace(/\[edit\]/g, '').trim();
        currentLevel = tag === 'h2' ? 2 : 3;
        currentParagraphs = [];
      } else if (tag === 'p') {
        const text = $el.text().trim();
        if (text.length > 0) currentParagraphs.push(text);
      }
    });

    // 마지막 섹션
    const content = currentParagraphs.join('\n\n');
    if (content.length > 5 && !shouldSkipSection(currentHeading)) {
      sections.push({ heading: currentHeading, level: currentLevel, content });
    }
  }

  // 카테고리 추출 (있으면)
  $('link[rel="mw:PageProp/Category"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const cat = decodeURIComponent(href.replace(/^.*\/Category:/, '').replace(/_/g, ' '));
    if (cat) categories.push(cat);
  });
  // fallback: catlinks div
  if (categories.length === 0) {
    $('#catlinks a').each((_, el) => {
      const text = $(el).text().trim();
      if (text && text !== 'Categories') categories.push(text);
    });
  }

  return { sections, categories };
}

/**
 * 스킵할 섹션인지 판단
 */
function shouldSkipSection(heading) {
  const skip = /^(See also|References|External links|Notes|Bibliography|Further reading|Navigation|Sources)$/i;
  return skip.test(heading);
}

/**
 * 캐릭터 하나 크롤
 */
async function crawlCharacter(char) {
  const candidates = buildTitleCandidates(char.name_en);

  // 1. Summary API
  const summaryResult = await wikiApiFetchWithFallback('summary', candidates);
  if (summaryResult.status !== 200 || !summaryResult.data) {
    throw new Error(`Summary API failed for all candidates: ${candidates.join(', ')} (status: ${summaryResult.status})`);
  }

  const summaryData = summaryResult.data;
  const wikiTitle = summaryResult.usedTitle;
  const summary = summaryData.extract || '';
  const wikiUrl = summaryData.content_urls?.desktop?.page
    || `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`;

  await sleep(500); // summary → html 사이 짧은 간격

  // 2. Full HTML API (같은 타이틀 사용)
  const htmlResult = await wikiApiFetch('html', wikiTitle);
  let sections = [];
  let categories = [];
  let fullText = summary; // fallback: summary만

  if (htmlResult.status === 200 && htmlResult.data) {
    const parsed = parseWikiHtml(htmlResult.data);
    sections = parsed.sections;
    categories = parsed.categories;

    // full_text 조합
    fullText = sections
      .map(s => {
        const prefix = s.heading === 'Lead' ? '' : `## ${s.heading}\n`;
        return prefix + s.content;
      })
      .join('\n\n')
      .trim();
  }

  return {
    name_en: char.name_en,
    name_kr: char.name_kr,
    wiki_title: wikiTitle,
    summary,
    sections,
    full_text: fullText,
    full_text_length: fullText.length,
    categories,
    wiki_url: wikiUrl,
    crawled_at: new Date().toISOString(),
  };
}

// ── 메인 ──
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\n=== English Wikipedia Three Kingdoms Character Crawler ===`);
  console.log(`    Targets: ${targets.length}`);
  console.log(`    Delay: ${delay}ms`);
  console.log(`    Resume: ${resume}`);
  console.log(`    Output: ${OUT_DIR}\n`);

  const results = { success: [], failed: [], skipped: [] };

  for (let i = 0; i < targets.length; i++) {
    const char = targets[i];
    const filename = `${safeFilename(char.name_en)}.json`;
    const outPath = join(OUT_DIR, filename);

    if (resume && existsSync(outPath)) {
      log(i, char, 'SKIP (already exists)');
      results.skipped.push(char.name_en);
      continue;
    }

    const candidates = buildTitleCandidates(char.name_en);
    log(i, char, `fetching... candidates: [${candidates.join(', ')}]`);

    try {
      const output = await crawlCharacter(char);

      writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

      log(i, char, `OK: ${output.full_text_length.toLocaleString()} chars, ${output.sections.length} sections, title="${output.wiki_title}"`);
      results.success.push(char.name_en);

    } catch (err) {
      log(i, char, `FAIL: ${err.message}`);
      results.failed.push({ name: char.name_en, name_kr: char.name_kr, error: err.message });
    }

    if (i < targets.length - 1) await sleep(delay);
  }

  // ── 서머리 ──
  console.log(`\n${'='.repeat(55)}`);
  console.log(`  Done: OK=${results.success.length}  SKIP=${results.skipped.length}  FAIL=${results.failed.length}`);
  if (results.failed.length > 0) {
    console.log(`  Failed:`);
    for (const f of results.failed) {
      console.log(`    - ${f.name} (${f.name_kr}): ${f.error}`);
    }
  }

  // 총 텍스트 통계
  let totalChars = 0;
  for (const name of results.success) {
    const c = ALL_CHARACTERS.find(ch => ch.name_en === name);
    if (!c) continue;
    try {
      const data = JSON.parse(readFileSync(join(OUT_DIR, `${safeFilename(c.name_en)}.json`), 'utf-8'));
      totalChars += data.full_text_length;
    } catch { /* ignore */ }
  }
  if (totalChars > 0) {
    console.log(`  Total text: ${totalChars.toLocaleString()} chars`);
  }
  console.log(`${'='.repeat(55)}\n`);

  // 실패가 있으면 exit code 1 (CI 친화)
  if (results.failed.length > 0) process.exit(1);
}

function log(i, char, msg) {
  console.log(`  [${i + 1}/${targets.length}] ${char.name_en} (${char.name_kr}) ${msg}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
