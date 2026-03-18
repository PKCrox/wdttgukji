#!/usr/bin/env node
/**
 * Tier 2 캐릭터 대량 크롤러
 *
 * ROTK11 능력치 데이터(182명)에서 기존 Tier 0+1(80명)에 없는 캐릭터를
 * 나무위키에서 자동 크롤. 능력치 총합 기준 정렬.
 *
 * 나무위키 제목 fallback: {name_kr} → {name_kr}(삼국지) → {name_kr}(후한)
 *
 * Usage:
 *   node scripts/crawl/crawl-tier2.js                # 전체 Tier 2
 *   node scripts/crawl/crawl-tier2.js --resume        # 이미 크롤된 건 스킵
 *   node scripts/crawl/crawl-tier2.js --top 30        # 능력치 총합 상위 30명만
 *   node scripts/crawl/crawl-tier2.js --limit 10      # 최대 10명만 크롤
 *   node scripts/crawl/crawl-tier2.js --delay 3000    # 요청 간격 (ms, 기본 2500)
 *
 * Output: data/raw/characters-namu-bios/{name_kr}.json
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseNamuHtml, extractSoulRelevant } from './lib/namu-parser.js';
import { ALL_CHARACTERS } from './character-list.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'data', 'raw', 'characters-namu-bios');
const STATS_PATH = join(ROOT, 'data', 'raw', 'characters-rotk11-stats.json');

// ── CLI ──
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const hasFlag = (f) => args.includes(f);

const resume = hasFlag('--resume');
const delay = parseInt(getArg('--delay') || '2500', 10);
const limitN = getArg('--limit') ? parseInt(getArg('--limit'), 10) : Infinity;
const topN = getArg('--top') ? parseInt(getArg('--top'), 10) : Infinity;

// ── 대상 선정 ──
// 1. ROTK11 stats 로드
const statsData = JSON.parse(readFileSync(STATS_PATH, 'utf-8'));
const allStats = statsData.data;

// 2. 기존 Tier 0+1 이름 Set
const existingNames = new Set(ALL_CHARACTERS.map(c => c.name_kr));

// 3. 중복 제거 (ROTK11 데이터에 같은 이름 중복 가능) + Tier 0+1 제외
const seen = new Set();
const tier2Candidates = [];
for (const entry of allStats) {
  if (existingNames.has(entry.name_kr)) continue;
  if (seen.has(entry.name_kr)) continue;
  seen.add(entry.name_kr);

  const total = entry.leadership + entry.war + entry.intelligence + entry.politics + entry.charisma;
  tier2Candidates.push({ ...entry, total });
}

// 4. 능력치 총합 기준 내림차순 정렬
tier2Candidates.sort((a, b) => b.total - a.total);

// 5. --top N 적용
let targets = topN < Infinity ? tier2Candidates.slice(0, topN) : tier2Candidates;

// 6. --limit N 적용
if (limitN < Infinity) {
  targets = targets.slice(0, limitN);
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
    throw new Error(`CLOUDFLARE_BLOCK`);
  }
  return html;
}

/**
 * 나무위키 제목 fallback 시도: name → name(삼국지) → name(후한)
 * @returns {{ html: string, namuTitle: string }}
 */
async function fetchWithFallback(nameKr) {
  const titles = [nameKr, `${nameKr}(삼국지)`, `${nameKr}(후한)`];

  for (let i = 0; i < titles.length; i++) {
    try {
      const html = await fetchPage(titles[i]);
      return { html, namuTitle: titles[i] };
    } catch (err) {
      if (err.message === 'CLOUDFLARE_BLOCK') throw err;
      // HTTP 404 등 → 다음 title 시도
      if (i < titles.length - 1) {
        await sleep(Math.min(delay, 1000)); // fallback 간 짧은 대기
      } else {
        throw new Error(`All titles failed for ${nameKr}: ${titles.join(', ')}`);
      }
    }
  }
}

// ── 메인 ──
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\n=== Tier 2 character crawler ===`);
  console.log(`   ROTK11 total: ${allStats.length}, existing Tier 0+1: ${existingNames.size}`);
  console.log(`   Tier 2 candidates: ${tier2Candidates.length}, targets: ${targets.length}`);
  console.log(`   delay: ${delay}ms, resume: ${resume}`);
  console.log(`   output: ${OUT_DIR}\n`);

  if (targets.length > 0) {
    const top = targets[0];
    const bottom = targets[targets.length - 1];
    console.log(`   stat range: ${top.name_kr}(${top.total}) ~ ${bottom.name_kr}(${bottom.total})\n`);
  }

  const results = { success: [], failed: [], skipped: [] };

  for (let i = 0; i < targets.length; i++) {
    const char = targets[i];
    const outPath = join(OUT_DIR, `${char.name_kr}.json`);

    if (resume && existsSync(outPath)) {
      log(i, char, 'skip (exists)');
      results.skipped.push(char.name_kr);
      continue;
    }

    log(i, char, `crawling (stat total: ${char.total})`);

    try {
      // 1. fetch with title fallback
      const { html, namuTitle } = await fetchWithFallback(char.name_kr);
      const mainParsed = parseNamuHtml(html);

      // 2. Tier 2는 하위 문서 크롤 생략 (대량 크롤이므로 메인 페이지만)
      const allSections = mainParsed.sections.filter(s => s.content && s.content.length > 10);

      // 3. soul.md 관련 추출
      const soulRelevant = extractSoulRelevant(allSections);

      // 4. 전체 텍스트
      const fullText = allSections
        .map(s => `## ${s.heading}\n${s.content || ''}`)
        .join('\n\n')
        .trim();

      // 5. 출력
      const output = {
        name_kr: char.name_kr,
        namu_url: `https://namu.wiki/w/${encodeURIComponent(namuTitle)}`,
        sections: allSections,
        soulRelevant,
        internalLinks: mainParsed.internalLinks,
        crawled_at: new Date().toISOString(),
        source: 'namu',
        rotk11_stats: {
          leadership: char.leadership,
          war: char.war,
          intelligence: char.intelligence,
          politics: char.politics,
          charisma: char.charisma,
          total: char.total,
          birth: char.birth,
          death: char.death,
        },
      };

      writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

      const soulKeys = Object.keys(soulRelevant).filter(k => soulRelevant[k]);
      log(i, char, `ok: ${fullText.length.toLocaleString()} chars, ${allSections.length} sections, title="${namuTitle}", soul=[${soulKeys.join(',')}]`);
      results.success.push(char.name_kr);

    } catch (err) {
      if (err.message === 'CLOUDFLARE_BLOCK') {
        log(i, char, 'CLOUDFLARE DETECTED — stopping all crawls');
        results.failed.push({ name: char.name_kr, error: 'Cloudflare block' });
        break; // Cloudflare면 더 이상 크롤 무의미
      }

      log(i, char, `FAIL: ${err.message}`);
      results.failed.push({ name: char.name_kr, error: err.message });
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
    try {
      const data = JSON.parse(readFileSync(join(OUT_DIR, `${name}.json`), 'utf-8'));
      totalChars += data.sections.reduce((sum, s) => sum + (s.content?.length || 0), 0);
    } catch { /* ignore */ }
  }
  if (totalChars > 0) console.log(`   total text: ${totalChars.toLocaleString()} chars`);
  console.log(`${'='.repeat(50)}\n`);
}

function log(i, char, msg) {
  console.log(`  [${i + 1}/${targets.length}] ${char.name_kr} ${msg}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
