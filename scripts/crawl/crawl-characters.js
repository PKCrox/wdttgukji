#!/usr/bin/env node
/**
 * 나무위키 삼국지 캐릭터 크롤러
 *
 * 나무위키 구조 대응:
 * - 메인 페이지에서 섹션 구조 + 하위 문서 링크 감지
 * - 하위 문서 자동 fetch (생애, 평가 등 분리된 문서)
 * - 모든 텍스트 합산하여 구조화된 JSON 출력
 *
 * Usage:
 *   node scripts/crawl/crawl-characters.js              # Tier 0 + Tier 1 (80명)
 *   node scripts/crawl/crawl-characters.js --tier 0      # Tier 0만 (20명)
 *   node scripts/crawl/crawl-characters.js --name 조조   # 특정 캐릭터만
 *   node scripts/crawl/crawl-characters.js --resume      # 이미 크롤된 건 스킵
 *   node scripts/crawl/crawl-characters.js --delay 3000  # 요청 간격 (ms, 기본 2000)
 *   node scripts/crawl/crawl-characters.js --no-subpages # 하위 문서 스킵
 *
 * Output: data/raw/characters-namu-bios/{name_en_lower}.json
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseNamuHtml, extractSoulRelevant } from './lib/namu-parser.js';
import { TIER_0, TIER_1, ALL_CHARACTERS, buildNameMap } from './character-list.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'data', 'raw', 'characters-namu-bios');
const NAME_MAP_OUT = join(ROOT, 'data', 'raw', 'name-mapping.json');

// ── CLI ──
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const hasFlag = (f) => args.includes(f);

const tierFilter = getArg('--tier');
const nameFilter = getArg('--name');
const resume = hasFlag('--resume');
const noSubpages = hasFlag('--no-subpages');
const delay = parseInt(getArg('--delay') || '2000', 10);

// ── 대상 선정 ──
let targets;
if (nameFilter) {
  targets = ALL_CHARACTERS.filter(c =>
    c.name_kr === nameFilter || c.name_en.toLowerCase() === nameFilter.toLowerCase()
  );
  if (!targets.length) { console.error(`"${nameFilter}" 없음`); process.exit(1); }
} else if (tierFilter === '0') {
  targets = TIER_0;
} else if (tierFilter === '1') {
  targets = TIER_1;
} else {
  targets = ALL_CHARACTERS;
}

// ── 유틸 ──
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const safeFilename = (name) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

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

  console.log(`\n🏯 나무위키 삼국지 캐릭터 크롤러 v2`);
  console.log(`   대상: ${targets.length}명`);
  console.log(`   딜레이: ${delay}ms, 하위문서: ${!noSubpages}`);
  console.log(`   출력: ${OUT_DIR}\n`);

  const results = { success: [], failed: [], skipped: [] };

  for (let i = 0; i < targets.length; i++) {
    const char = targets[i];
    const filename = `${safeFilename(char.name_en)}.json`;
    const outPath = join(OUT_DIR, filename);

    if (resume && existsSync(outPath)) {
      log(i, char, '⏭ 스킵 (이미 존재)');
      results.skipped.push(char.name_kr);
      continue;
    }

    log(i, char, `📥 크롤 시작 — namu.wiki/w/${char.namu_title}`);

    try {
      // 1. 메인 페이지 fetch + parse
      const mainHtml = await fetchPage(char.namu_title);
      const mainParsed = parseNamuHtml(mainHtml);

      // 2. 하위 문서 fetch
      const subpageContents = {};
      if (!noSubpages && mainParsed.subpageLinks.length > 0) {
        log(i, char, `   📄 하위 문서 ${mainParsed.subpageLinks.length}개: ${mainParsed.subpageLinks.map(l => l.sectionName).join(', ')}`);

        // 기타 창작물, 둘러보기 등 불필요한 하위 문서 스킵
        const skipPatterns = /창작물|게임|매체|둘러보기|관련 문서/;
        const relevantSubs = mainParsed.subpageLinks.filter(l => !skipPatterns.test(l.sectionName));

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
            log(i, char, `   ✅ ${sub.sectionName}: ${totalChars.toLocaleString()}자, ${subParsed.sections.length}섹션`);
          } catch (subErr) {
            log(i, char, `   ⚠️ ${sub.sectionName} 실패: ${subErr.message}`);
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

      // 4. soul.md 관련 추출
      const soulRelevant = extractSoulRelevant(allSections);

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

      // 7. 출력
      const output = {
        name_kr: char.name_kr,
        name_en: char.name_en,
        name_cn: char.name_cn,
        courtesy_kr: char.courtesy_kr || null,
        courtesy_cn: char.courtesy_cn || null,
        faction: char.faction,
        tier: char.tier,
        role: char.role,

        namu_url: `https://namu.wiki/w/${encodeURIComponent(char.namu_title)}`,
        namu_title: mainParsed.title,

        sections: allSections,
        subpages_fetched: Object.keys(subpageContents),

        soul_relevant: soulRelevant,
        internal_links: [...allLinks],

        full_text_length: fullText.length,
        full_text: fullText,

        crawled_at: new Date().toISOString(),
        source: 'namu.wiki',
      };

      writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

      const soulKeys = Object.keys(soulRelevant).filter(k => soulRelevant[k]);
      log(i, char, `   ✅ 완료: ${fullText.length.toLocaleString()}자, 섹션 ${allSections.length}개, 하위문서 ${Object.keys(subpageContents).length}개, soul: [${soulKeys.join(',')}]`);
      results.success.push(char.name_kr);

    } catch (err) {
      log(i, char, `   ❌ 실패: ${err.message}`);
      results.failed.push({ name: char.name_kr, error: err.message });

      // Cloudflare면 긴 대기 후 재시도
      if (err.message.includes('Cloudflare')) {
        log(i, char, `   ⏳ Cloudflare — 15초 대기 후 재시도`);
        await sleep(15000);
        try {
          const html = await fetchPage(char.namu_title);
          const parsed = parseNamuHtml(html);
          const fullText = parsed.sections.map(s => `## ${s.heading}\n${s.content || ''}`).join('\n\n').trim();
          const output = {
            name_kr: char.name_kr, name_en: char.name_en, name_cn: char.name_cn,
            courtesy_kr: char.courtesy_kr || null, courtesy_cn: char.courtesy_cn || null,
            faction: char.faction, tier: char.tier, role: char.role,
            namu_url: `https://namu.wiki/w/${encodeURIComponent(char.namu_title)}`,
            namu_title: parsed.title, sections: parsed.sections, subpages_fetched: [],
            soul_relevant: extractSoulRelevant(parsed.sections),
            internal_links: parsed.internalLinks,
            full_text_length: fullText.length, full_text: fullText,
            crawled_at: new Date().toISOString(), source: 'namu.wiki',
          };
          writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
          log(i, char, `   ✅ 재시도 성공: ${fullText.length.toLocaleString()}자`);
          results.failed.pop();
          results.success.push(char.name_kr);
        } catch (e) {
          log(i, char, `   ❌ 재시도 실패: ${e.message}`);
        }
      }
    }

    if (i < targets.length - 1) await sleep(delay);
  }

  // ── 이름 매핑 ──
  const nameMap = buildNameMap();
  writeFileSync(NAME_MAP_OUT, JSON.stringify(nameMap, null, 2), 'utf-8');

  // ── 서머리 ──
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`🏁 완료: ✅${results.success.length} ⏭${results.skipped.length} ❌${results.failed.length}`);
  if (results.failed.length > 0) {
    for (const f of results.failed) console.log(`   ❌ ${f.name}: ${f.error}`);
  }

  // 총 텍스트 통계
  let totalChars = 0;
  for (const name of results.success) {
    const c = ALL_CHARACTERS.find(c => c.name_kr === name);
    if (!c) continue;
    try {
      const data = JSON.parse(require('fs').readFileSync(join(OUT_DIR, `${safeFilename(c.name_en)}.json`), 'utf-8'));
      totalChars += data.full_text_length;
    } catch { /* ignore */ }
  }
  if (totalChars > 0) console.log(`   📊 총 텍스트: ${totalChars.toLocaleString()}자`);
  console.log(`${'═'.repeat(50)}\n`);
}

function log(i, char, msg) {
  console.log(`  [${i + 1}/${targets.length}] ${char.name_kr} ${msg}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
