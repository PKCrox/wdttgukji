#!/usr/bin/env node
/**
 * 나무위키 정사삼국지 크롤러
 *
 * 정사(삼국지) 관련 페이지 + 주요 캐릭터의 정사 평가 섹션 수집
 *
 * Usage:
 *   node scripts/crawl/crawl-history.js                    # 전체
 *   node scripts/crawl/crawl-history.js --category source  # 카테고리 필터
 *   node scripts/crawl/crawl-history.js --name 조조         # 특정 페이지만
 *   node scripts/crawl/crawl-history.js --resume            # 이미 크롤된 건 스킵
 *   node scripts/crawl/crawl-history.js --delay 3000        # 요청 간격 (ms, 기본 2000)
 *   node scripts/crawl/crawl-history.js --no-subpages       # 하위 문서 스킵
 *
 * Output: data/raw/history/{slug}.json
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseNamuHtml } from './lib/namu-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'data', 'raw', 'history');

// ── 크롤 대상 페이지 목록 ──

const PAGES = [
  // ── 정사 문헌 (source) ──
  // 위서·촉서·오서는 독립 문서가 없음 → 삼국지(정사) 본문에 포함
  // 위서(삼국지) 문서는 인물 '위서'에 대한 것이므로 사용 금지
  { title_kr: '정사 삼국지',           namu_title: '삼국지(정사)',               category: 'source', slug: 'zhengshi-main' },

  // ── 인물 목록 (roster) ──
  // 위/촉/오 분리 문서 없음 → 단일 문서 삼국지/인물에 전체 수록
  { title_kr: '삼국지/인물',           namu_title: '삼국지/인물',               category: 'roster', slug: 'roster-all' },

  // ── 평가/비교 (analysis) ──
  // 삼국지/평가 독립 문서 없음 → 삼국지(정사) 본문 내 서술상 특징·주의점 섹션
  // 삼국지연의/정사와의 차이점 독립 문서 없음 → 삼국지연의 본문 내 '일관성이 없는 부분 및 역사적 오류' 섹션
  { title_kr: '삼국지연의(정사비교)',   namu_title: '삼국지연의',               category: 'analysis', slug: 'analysis-zhengshi-vs-yanyi', extractSections: /일관성|역사적 오류|정사|차이/ },

  // ── 저자/주석가 (author) ──
  { title_kr: '진수(역사가)',           namu_title: '진수(역사가)',               category: 'author', slug: 'author-chenshou' },
  { title_kr: '배송지',                namu_title: '배송지',                     category: 'author', slug: 'author-peisongzhi' },

  // ── 주요 캐릭터 정사 평가 (character) ──
  // 각 캐릭터의 전체 페이지 크롤 후, 정사/사서 관련 섹션만 추출
  { title_kr: '조조 정사',   namu_title: '조조',         category: 'character', slug: 'char-caocao',       extractSections: /정사|사서의 평가|삼국지 기록|진수/ },
  { title_kr: '유비 정사',   namu_title: '유비',         category: 'character', slug: 'char-liubei',       extractSections: /정사|사서의 평가|삼국지 기록|진수/ },
  { title_kr: '손권 정사',   namu_title: '손권',         category: 'character', slug: 'char-sunquan',      extractSections: /정사|사서의 평가|삼국지 기록|진수/ },
  { title_kr: '제갈량 정사', namu_title: '제갈량',       category: 'character', slug: 'char-zhugeliang',    extractSections: /정사|사서의 평가|삼국지 기록|진수/ },
  { title_kr: '관우 정사',   namu_title: '관우',         category: 'character', slug: 'char-guanyu',       extractSections: /정사|사서의 평가|삼국지 기록|진수/ },
  { title_kr: '장비 정사',   namu_title: '장비',         category: 'character', slug: 'char-zhangfei',     extractSections: /정사|사서의 평가|삼국지 기록|진수/ },
  { title_kr: '사마의 정사', namu_title: '사마의',       category: 'character', slug: 'char-simayi',       extractSections: /정사|사서의 평가|삼국지 기록|진수/ },
  { title_kr: '주유 정사',   namu_title: '주유(삼국지)', category: 'character', slug: 'char-zhouyu',       extractSections: /정사|사서의 평가|삼국지 기록|진수/ },
  { title_kr: '여포 정사',   namu_title: '여포',         category: 'character', slug: 'char-lubu',         extractSections: /정사|사서의 평가|삼국지 기록|진수/ },
  { title_kr: '조운 정사',   namu_title: '조운',         category: 'character', slug: 'char-zhaoyun',      extractSections: /정사|사서의 평가|삼국지 기록|진수/ },
  { title_kr: '순욱 정사',   namu_title: '순욱',         category: 'character', slug: 'char-xunyu',        extractSections: /정사|사서의 평가|삼국지 기록|진수/ },
  { title_kr: '곽가 정사',   namu_title: '곽가',         category: 'character', slug: 'char-guojia',       extractSections: /정사|사서의 평가|삼국지 기록|진수/ },
  { title_kr: '육손 정사',   namu_title: '육손',         category: 'character', slug: 'char-luxun',        extractSections: /정사|사서의 평가|삼국지 기록|진수/ },
  { title_kr: '강유 정사',   namu_title: '강유',         category: 'character', slug: 'char-jiangwei',     extractSections: /정사|사서의 평가|삼국지 기록|진수/ },
  { title_kr: '등애 정사',   namu_title: '등애',         category: 'character', slug: 'char-dengai',       extractSections: /정사|사서의 평가|삼국지 기록|진수/ },
];

// ── CLI ──
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const hasFlag = (f) => args.includes(f);

const categoryFilter = getArg('--category');
const nameFilter = getArg('--name');
const resume = hasFlag('--resume');
const noSubpages = hasFlag('--no-subpages');
const delay = parseInt(getArg('--delay') || '2000', 10);

// ── 대상 선정 ──
let targets;
if (nameFilter) {
  targets = PAGES.filter(p =>
    p.title_kr === nameFilter || p.slug === nameFilter || p.namu_title === nameFilter
  );
  if (!targets.length) { console.error(`"${nameFilter}" not found. Available: ${PAGES.map(p => p.title_kr).join(', ')}`); process.exit(1); }
} else if (categoryFilter) {
  const valid = ['source', 'roster', 'analysis', 'author', 'character'];
  if (!valid.includes(categoryFilter)) {
    console.error(`Valid categories: ${valid.join(', ')}`);
    process.exit(1);
  }
  targets = PAGES.filter(p => p.category === categoryFilter);
} else {
  targets = PAGES;
}

// ── 유틸 ──
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function fetchPage(title) {
  const url = `https://namu.wiki/w/${encodeURIComponent(title)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${title}`);
  const html = await res.text();
  if (html.includes('cf-challenge') || html.includes('Checking your browser')) {
    throw new Error(`Cloudflare for ${title}`);
  }
  return html;
}

// ── 메인 ──
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const catCounts = {};
  for (const p of targets) catCounts[p.category] = (catCounts[p.category] || 0) + 1;
  const catSummary = Object.entries(catCounts).map(([k, v]) => `${k}:${v}`).join(', ');

  console.log(`\n=== namuwiki zhengshi (history) crawler ===`);
  console.log(`   targets: ${targets.length} pages (${catSummary})`);
  console.log(`   delay: ${delay}ms, subpages: ${!noSubpages}`);
  console.log(`   output: ${OUT_DIR}\n`);

  const results = { success: [], failed: [], skipped: [] };

  for (let i = 0; i < targets.length; i++) {
    const page = targets[i];
    const outPath = join(OUT_DIR, `${page.slug}.json`);

    if (resume && existsSync(outPath)) {
      log(i, page, 'skip (exists)');
      results.skipped.push(page.title_kr);
      continue;
    }

    log(i, page, `fetching — namu.wiki/w/${page.namu_title}`);

    try {
      const output = await crawlPage(page, i);
      writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

      log(i, page, `done: ${output.full_text_length.toLocaleString()} chars, ${output.sections.length} sections, ${output.subpages_fetched.length} subpages`);
      results.success.push(page.title_kr);

    } catch (err) {
      log(i, page, `FAIL: ${err.message}`);
      results.failed.push({ name: page.title_kr, error: err.message });

      // Cloudflare: long wait + retry
      if (err.message.includes('Cloudflare')) {
        log(i, page, '   waiting 15s for Cloudflare...');
        await sleep(15000);
        try {
          const output = await crawlPage(page, i);
          writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
          log(i, page, `retry ok: ${output.full_text_length.toLocaleString()} chars`);
          results.failed.pop();
          results.success.push(page.title_kr);
        } catch (e) {
          log(i, page, `retry FAIL: ${e.message}`);
        }
      }
    }

    if (i < targets.length - 1) await sleep(delay);
  }

  // ── Summary ──
  console.log(`\n${'='.repeat(50)}`);
  console.log(`done: ok=${results.success.length} skip=${results.skipped.length} fail=${results.failed.length}`);
  if (results.failed.length > 0) {
    for (const f of results.failed) console.log(`   FAIL ${f.name}: ${f.error}`);
  }

  // total text stats
  let totalChars = 0;
  for (const name of results.success) {
    const p = PAGES.find(p => p.title_kr === name);
    if (!p) continue;
    try {
      const data = JSON.parse(readFileSync(join(OUT_DIR, `${p.slug}.json`), 'utf-8'));
      totalChars += data.full_text_length;
    } catch { /* ignore */ }
  }
  if (totalChars > 0) console.log(`   total text: ${totalChars.toLocaleString()} chars`);
  console.log(`${'='.repeat(50)}\n`);
}

/**
 * 단일 페이지 크롤 + 하위 문서 합산
 * character 카테고리는 정사 관련 섹션만 추출
 */
async function crawlPage(page, idx) {
  // 1. 메인 페이지 fetch + parse
  const mainHtml = await fetchPage(page.namu_title);
  const mainParsed = parseNamuHtml(mainHtml);

  // 2. 하위 문서 fetch
  const subpageContents = {};
  if (!noSubpages && mainParsed.subpageLinks.length > 0) {
    const skipPatterns = /창작물|게임|매체|둘러보기|관련 문서|각주|외부 링크|대항해시대|온라인|같이보기/;
    const relevantSubs = mainParsed.subpageLinks.filter(l => !skipPatterns.test(l.sectionName));

    // character 카테고리: 정사 관련 하위 문서만 추적
    const filteredSubs = page.extractSections
      ? relevantSubs.filter(l => page.extractSections.test(l.sectionName) || /평가|생애/.test(l.sectionName))
      : relevantSubs;

    if (filteredSubs.length > 0) {
      log(idx, page, `   subpages: ${filteredSubs.length} (${filteredSubs.map(l => l.sectionName).join(', ')})`);
    }

    for (const sub of filteredSubs) {
      await sleep(delay);
      try {
        const subHtml = await fetchPage(sub.url);
        const subParsed = parseNamuHtml(subHtml);
        subpageContents[sub.sectionName] = {
          url: sub.url,
          sections: subParsed.sections,
          links: subParsed.internalLinks,
        };

        const totalChars = subParsed.sections.reduce((sum, s) => sum + (s.content?.length || 0), 0);
        log(idx, page, `   + ${sub.sectionName}: ${totalChars.toLocaleString()} chars`);
      } catch (subErr) {
        log(idx, page, `   ! ${sub.sectionName} failed: ${subErr.message}`);
      }
    }
  }

  // 3. 섹션 합산 — 메인 + 하위 문서
  let allSections = [];
  for (const section of mainParsed.sections) {
    if (subpageContents[section.heading]) {
      const sub = subpageContents[section.heading];
      allSections.push({
        heading: section.heading,
        level: section.level,
        content: sub.sections.map(s => {
          const prefix = s.heading !== '본문' ? `### ${s.heading}\n` : '';
          return prefix + (s.content || '');
        }).join('\n\n'),
        source: 'subpage',
        subpage_url: sub.url,
      });
    } else if (section.content && section.content.length > 10) {
      allSections.push(section);
    }
  }

  // 4. character 카테고리: 정사 관련 섹션만 필터링
  if (page.extractSections) {
    const filtered = allSections.filter(s => page.extractSections.test(s.heading));
    // 필터 결과가 있으면 사용, 없으면 전체 유지 (fallback)
    if (filtered.length > 0) {
      allSections = filtered;
    }
  }

  // 5. 내부 링크 합산
  const allLinks = new Set(mainParsed.internalLinks);
  for (const sub of Object.values(subpageContents)) {
    sub.links.forEach(l => allLinks.add(l));
  }

  // 6. 전체 텍스트
  const fullText = allSections
    .map(s => `## ${s.heading}\n${s.content || ''}`)
    .join('\n\n')
    .trim();

  // 7. 출력 구조
  return {
    title_kr: page.title_kr,
    category: page.category,

    namu_url: `https://namu.wiki/w/${encodeURIComponent(page.namu_title)}`,
    namu_title: mainParsed.title,

    sections: allSections,
    subpages_fetched: Object.keys(subpageContents),

    internal_links: [...allLinks],

    full_text_length: fullText.length,
    full_text: fullText,

    crawled_at: new Date().toISOString(),
    source: 'namu.wiki',
  };
}

function log(i, page, msg) {
  const cat = page.category.slice(0, 4).toUpperCase();
  console.log(`  [${i + 1}/${targets.length}] [${cat}] ${page.title_kr} ${msg}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
