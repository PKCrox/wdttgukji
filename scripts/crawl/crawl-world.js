#!/usr/bin/env node
/**
 * 나무위키 삼국지 세계관 크롤러
 *
 * 세력, 지리, 시대 배경, 제도, 전투 등 세계관 데이터 수집
 *
 * Usage:
 *   node scripts/crawl/crawl-world.js                    # 전체 (~40 페이지)
 *   node scripts/crawl/crawl-world.js --category faction  # 세력만
 *   node scripts/crawl/crawl-world.js --name 낙양          # 특정 페이지만
 *   node scripts/crawl/crawl-world.js --resume            # 이미 크롤된 건 스킵
 *   node scripts/crawl/crawl-world.js --delay 3000        # 요청 간격 (ms, 기본 2000)
 *   node scripts/crawl/crawl-world.js --no-subpages       # 하위 문서 스킵
 *
 * Output: data/raw/world/{slug}.json
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseNamuHtml } from './lib/namu-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'data', 'raw', 'world');

// ── 크롤 대상 페이지 목록 ──

const PAGES = [
  // ── Factions (세력) ──
  { title_kr: '위(삼국시대)',    namu_title: '위(삼국시대)',    category: 'faction', slug: 'faction-wei' },
  { title_kr: '촉한',           namu_title: '촉한',           category: 'faction', slug: 'faction-shu' },
  { title_kr: '오(삼국시대)',    namu_title: '오(삼국시대)',    category: 'faction', slug: 'faction-wu' },
  { title_kr: '후한',           namu_title: '후한',           category: 'faction', slug: 'faction-later-han' },
  { title_kr: '진(서진)',       namu_title: '서진',           category: 'faction', slug: 'faction-western-jin' },
  { title_kr: '원소 세력',      namu_title: '원소(삼국지)',    category: 'faction', slug: 'faction-yuan-shao' },
  { title_kr: '동탁 정권',      namu_title: '동탁',           category: 'faction', slug: 'faction-dong-zhuo' },
  { title_kr: '유표 세력',      namu_title: '유표',           category: 'faction', slug: 'faction-liu-biao' },
  { title_kr: '황건적',         namu_title: '황건적',         category: 'faction', slug: 'faction-yellow-turbans' },
  { title_kr: '서량',           namu_title: '서량',           category: 'faction', slug: 'faction-xiliang' },
  { title_kr: '남만',           namu_title: '남만',           category: 'faction', slug: 'faction-nanman' },

  // ── Geography — 수도/주요 도시 ──
  { title_kr: '낙양',           namu_title: '낙양',           category: 'geography', slug: 'geo-luoyang' },
  { title_kr: '장안',           namu_title: '장안',           category: 'geography', slug: 'geo-changan' },
  { title_kr: '허창',           namu_title: '허창시',         category: 'geography', slug: 'geo-xuchang' },
  { title_kr: '업성',           namu_title: '업성',           category: 'geography', slug: 'geo-ye' },
  { title_kr: '성도',           namu_title: '성도시',         category: 'geography', slug: 'geo-chengdu' },
  { title_kr: '건업',           namu_title: '건업',           category: 'geography', slug: 'geo-jianye' },
  { title_kr: '한중',           namu_title: '한중시',         category: 'geography', slug: 'geo-hanzhong' },

  // ── Geography — 주(州) ──
  { title_kr: '형주',           namu_title: '형주',           category: 'geography', slug: 'geo-jingzhou' },
  { title_kr: '익주',           namu_title: '익주',           category: 'geography', slug: 'geo-yizhou' },
  { title_kr: '서주',           namu_title: '서주(중국)',     category: 'geography', slug: 'geo-xuzhou' },
  { title_kr: '연주',           namu_title: '연주(중국)',     category: 'geography', slug: 'geo-yanzhou' },
  { title_kr: '예주',           namu_title: '예주',           category: 'geography', slug: 'geo-yuzhou' },
  { title_kr: '양주',           namu_title: '양주(안후이성)', category: 'geography', slug: 'geo-yangzhou' },
  { title_kr: '옹주',           namu_title: '옹주',           category: 'geography', slug: 'geo-yongzhou' },
  { title_kr: '유주',           namu_title: '유주(중국)',     category: 'geography', slug: 'geo-youzhou' },
  { title_kr: '병주',           namu_title: '병주',           category: 'geography', slug: 'geo-bingzhou' },
  { title_kr: '기주',           namu_title: '기주',           category: 'geography', slug: 'geo-jizhou' },
  { title_kr: '교주',           namu_title: '교주(중국)',     category: 'geography', slug: 'geo-jiaozhou' },

  // ── Context — 시대/문헌 ──
  { title_kr: '삼국시대(중국)', namu_title: '삼국시대(중국)', category: 'context', slug: 'ctx-three-kingdoms-era' },
  { title_kr: '삼국지',         namu_title: '삼국지',         category: 'context', slug: 'ctx-sanguozhi' },
  { title_kr: '삼국지연의',     namu_title: '삼국지연의',     category: 'context', slug: 'ctx-romance' },
  { title_kr: '한나라',         namu_title: '한나라',         category: 'context', slug: 'ctx-han-dynasty' },
  { title_kr: '오호십육국시대', namu_title: '오호십육국시대', category: 'context', slug: 'ctx-sixteen-kingdoms' },

  // ── Context — 제도/관직 ──
  { title_kr: '구품중정제',     namu_title: '구품중정제',     category: 'context', slug: 'ctx-nine-rank-system' },
  { title_kr: '둔전제',         namu_title: '둔전제',         category: 'context', slug: 'ctx-tuntian' },
  { title_kr: '삼공',           namu_title: '삼공',           category: 'context', slug: 'ctx-three-excellencies' },

  // ── Military — 주요 전투 배경 ──
  { title_kr: '적벽대전',       namu_title: '적벽대전',       category: 'military', slug: 'mil-red-cliffs' },
  { title_kr: '관도대전',       namu_title: '관도대전',       category: 'military', slug: 'mil-guandu' },
  { title_kr: '이릉대전',       namu_title: '이릉대전',       category: 'military', slug: 'mil-yiling' },
  { title_kr: '합비대전',       namu_title: '합비 전투',      category: 'military', slug: 'mil-hefei' },
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
  if (!targets.length) { console.error(`"${nameFilter}" 없음. 사용 가능: ${PAGES.map(p => p.title_kr).join(', ')}`); process.exit(1); }
} else if (categoryFilter) {
  const valid = ['faction', 'geography', 'context', 'military'];
  if (!valid.includes(categoryFilter)) {
    console.error(`유효한 카테고리: ${valid.join(', ')}`);
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

  console.log(`\n=== namuwiki world-building crawler ===`);
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
 */
async function crawlPage(page, idx) {
  // 1. 메인 페이지 fetch + parse
  const mainHtml = await fetchPage(page.namu_title);
  const mainParsed = parseNamuHtml(mainHtml);

  // 2. 하위 문서 fetch
  const subpageContents = {};
  if (!noSubpages && mainParsed.subpageLinks.length > 0) {
    // 세계관 문서에서 불필요한 하위 문서 패턴
    const skipPatterns = /창작물|게임|매체|둘러보기|관련 문서|각주|외부 링크|대항해시대|온라인|같이보기/;
    const relevantSubs = mainParsed.subpageLinks.filter(l => !skipPatterns.test(l.sectionName));

    if (relevantSubs.length > 0) {
      log(idx, page, `   subpages: ${relevantSubs.length} (${relevantSubs.map(l => l.sectionName).join(', ')})`);
    }

    for (const sub of relevantSubs) {
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
  const allSections = [];
  for (const section of mainParsed.sections) {
    if (subpageContents[section.heading]) {
      // 하위 문서 내용으로 대체
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

  // 4. 내부 링크 합산
  const allLinks = new Set(mainParsed.internalLinks);
  for (const sub of Object.values(subpageContents)) {
    sub.links.forEach(l => allLinks.add(l));
  }

  // 5. 전체 텍스트
  const fullText = allSections
    .map(s => `## ${s.heading}\n${s.content || ''}`)
    .join('\n\n')
    .trim();

  // 6. 출력 구조
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
  const cat = page.category.slice(0, 3).toUpperCase();
  console.log(`  [${i + 1}/${targets.length}] [${cat}] ${page.title_kr} ${msg}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
