#!/usr/bin/env node
/**
 * 나무위키 삼국지 주요 전투 크롤러
 *
 * 나무위키 구조 대응:
 * - 메인 페이지에서 섹션 구조 + 하위 문서 링크 감지
 * - 하위 문서 자동 fetch (배경, 전개, 결과 등 분리된 문서)
 * - 모든 텍스트 합산하여 구조화된 JSON 출력
 *
 * Usage:
 *   node scripts/crawl/crawl-battles.js              # 전체 (~30개)
 *   node scripts/crawl/crawl-battles.js --name 관도대전  # 특정 전투만
 *   node scripts/crawl/crawl-battles.js --resume      # 이미 크롤된 건 스킵
 *   node scripts/crawl/crawl-battles.js --delay 3000  # 요청 간격 (ms, 기본 2000)
 *   node scripts/crawl/crawl-battles.js --no-subpages # 하위 문서 스킵
 *
 * Output: data/raw/battles/{name_en_kebab}.json
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseNamuHtml } from './lib/namu-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'data', 'raw', 'battles');

// ── 전투 목록 ──

/** @typedef {{ name_kr: string, name_en: string, year: number|null, namu_title: string, participants: { side_a: string[], side_b: string[] } }} BattleEntry */

/** @type {BattleEntry[]} */
const BATTLES = [
  // ── 후한 말 / 군웅할거 ──
  {
    name_kr: '황건적의 난',
    name_en: 'Yellow Turban Rebellion',
    year: 184,
    namu_title: '황건적의 난',
    participants: { side_a: ['후한 조정', '유비', '조조', '손견'], side_b: ['장각', '장보', '장량'] },
  },
  {
    name_kr: '반동탁 연합',
    name_en: 'Coalition Against Dong Zhuo',
    year: 190,
    namu_title: '반동탁 연합군',
    participants: { side_a: ['원소', '조조', '손견', '유비', '원술'], side_b: ['동탁', '여포', '이유'] },
  },
  {
    name_kr: '서주 대학살',
    name_en: 'Massacre of Xu Province',
    year: 193,
    namu_title: '서주 대학살',
    participants: { side_a: ['조조'], side_b: ['도겸', '서주 주민'] },
  },
  {
    name_kr: '완성 전투',
    name_en: 'Battle of Wancheng',
    year: 197,
    namu_title: '장수(삼국지)',
    participants: { side_a: ['조조', '전위'], side_b: ['장수', '가후'] },
  },
  {
    name_kr: '하비성 전투',
    name_en: 'Battle of Xiapi',
    year: 198,
    namu_title: '여포 토벌전',
    participants: { side_a: ['조조', '유비'], side_b: ['여포', '진궁'] },
  },
  {
    name_kr: '원소 대 공손찬',
    name_en: 'Yuan Shao vs Gongsun Zan',
    year: 199,
    namu_title: '계교 전투',
    participants: { side_a: ['원소'], side_b: ['공손찬'] },
  },

  // ── 관도 전투군 ──
  {
    name_kr: '백마 전투',
    name_en: 'Battle of Boma',
    year: 200,
    namu_title: '관도대전',  // 백마 전투 독립 문서 없음, 관도대전 문서에서 다룸
    participants: { side_a: ['조조', '관우', '장료'], side_b: ['원소', '안량'] },
  },
  {
    name_kr: '관도대전',
    name_en: 'Battle of Guandu',
    year: 200,
    namu_title: '관도대전',
    participants: { side_a: ['조조', '순욱', '곽가'], side_b: ['원소', '안량', '문추'] },
  },

  // ── 적벽 / 형주 ──
  {
    name_kr: '장판파 전투',
    name_en: 'Battle of Changban',
    year: 208,
    namu_title: '장판 전투',
    participants: { side_a: ['유비', '조운', '장비'], side_b: ['조조'] },
  },
  {
    name_kr: '적벽대전',
    name_en: 'Battle of Red Cliffs',
    year: 208,
    namu_title: '적벽대전',
    participants: { side_a: ['손권', '주유', '유비', '제갈량'], side_b: ['조조'] },
  },

  // ── 서량 / 한중 ──
  {
    name_kr: '동관 전투',
    name_en: 'Battle of Tong Pass',
    year: 211,
    namu_title: '동관 전투',
    participants: { side_a: ['조조', '허저'], side_b: ['마초', '한수'] },
  },
  {
    name_kr: '한중 공방전',
    name_en: 'Battle of Hanzhong',
    year: 217,
    namu_title: '한중 공방전',
    participants: { side_a: ['유비', '법정', '황충'], side_b: ['조조', '하후연'] },
  },
  {
    name_kr: '정군산 전투',
    name_en: 'Battle of Mount Dingjun',
    year: 219,
    namu_title: '한중 공방전',  // 정군산 전투 독립 문서 없음, 한중 공방전 문서에서 다룸
    participants: { side_a: ['유비', '황충', '법정'], side_b: ['하후연', '장합'] },
  },

  // ── 번성 / 형주 상실 ──
  {
    name_kr: '번성 공방전',
    name_en: 'Battle of Fancheng',
    year: 219,
    namu_title: '형주 공방전',  // 번성 공방전 → 형주 공방전으로 리다이렉트됨
    participants: { side_a: ['관우'], side_b: ['조인', '서황', '방덕', '우금'] },
  },
  {
    name_kr: '맥성 전투',
    name_en: 'Battle of Maicheng',
    year: 219,
    namu_title: '형주 공방전',  // 맥성 전투 독립 문서 없음, 형주 공방전 문서에서 다룸
    participants: { side_a: ['관우'], side_b: ['여몽', '육손', '손권'] },
  },

  // ── 이릉 / 촉한 ──
  {
    name_kr: '이릉대전',
    name_en: 'Battle of Yiling',
    year: 222,
    namu_title: '이릉 전투',
    participants: { side_a: ['유비', '마량'], side_b: ['육손', '손권'] },
  },
  {
    name_kr: '합비대전',
    name_en: 'Battle of Hefei',
    year: 215,
    namu_title: '합비 전투',
    participants: { side_a: ['장료', '이전', '악진'], side_b: ['손권'] },
  },

  // ── 남만 ──
  {
    name_kr: '칠종칠금',
    name_en: 'Seven Captures of Meng Huo',
    year: 225,
    namu_title: '칠종칠금',
    participants: { side_a: ['제갈량'], side_b: ['맹획'] },
  },

  // ── 북벌 전투들 ──
  {
    name_kr: '기산 전투',
    name_en: 'Battle of Qishan',
    year: 228,
    namu_title: '기산',
    participants: { side_a: ['제갈량'], side_b: ['사마의', '장합'] },
  },
  {
    name_kr: '가정 전투',
    name_en: 'Battle of Jieting',
    year: 228,
    namu_title: '가정 전투',
    participants: { side_a: ['마속'], side_b: ['장합'] },
  },
  {
    name_kr: '석정 전투',
    name_en: 'Battle of Shiting',
    year: 228,
    namu_title: '석정 전투',
    participants: { side_a: ['손권', '육손'], side_b: ['조휴'] },
  },
  {
    name_kr: '진창 전투',
    name_en: 'Battle of Chencang',
    year: 228,
    namu_title: '제갈량의 북벌',  // 진창 전투 독립 문서 없음, 제갈량의 북벌 문서에서 다룸
    participants: { side_a: ['제갈량'], side_b: ['학소'] },
  },
  {
    name_kr: '오장원 전투',
    name_en: 'Battle of Wuzhang Plains',
    year: 234,
    namu_title: '오장원',
    participants: { side_a: ['제갈량'], side_b: ['사마의'] },
  },

  // ── 후기 전투들 ──
  {
    name_kr: '흥세 전투',
    name_en: 'Battle of Xingshi',
    year: 244,
    namu_title: '흥세 전투',
    participants: { side_a: ['비의', '왕평'], side_b: ['조상'] },
  },
  {
    name_kr: '음평 전투',
    name_en: 'Battle of Yinping',
    year: 263,
    namu_title: '음평',
    participants: { side_a: ['등애'], side_b: ['촉한'] },
  },

  // ── 멸망 ──
  {
    name_kr: '촉한 멸망',
    name_en: 'Fall of Shu Han',
    year: 263,
    namu_title: '촉한멸망전',
    participants: { side_a: ['종회', '등애', '사마소'], side_b: ['유선', '강유'] },
  },
  {
    name_kr: '동오 멸망',
    name_en: 'Fall of Eastern Wu',
    year: 280,
    namu_title: '오멸망전',
    participants: { side_a: ['사마염', '두예', '왕준'], side_b: ['손호'] },
  },
  {
    name_kr: '삼국통일전쟁',
    name_en: 'War of Reunification',
    year: 263,
    namu_title: '삼국통일전쟁',
    participants: { side_a: ['사마씨 (진)'], side_b: ['촉한', '동오'] },
  },
];

// ── CLI ──
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const hasFlag = (f) => args.includes(f);

const nameFilter = getArg('--name');
const resume = hasFlag('--resume');
const noSubpages = hasFlag('--no-subpages');
const delay = parseInt(getArg('--delay') || '2000', 10);

// ── 대상 선정 ──
let targets;
if (nameFilter) {
  targets = BATTLES.filter(b =>
    b.name_kr === nameFilter || b.name_en.toLowerCase() === nameFilter.toLowerCase()
  );
  if (!targets.length) { console.error(`"${nameFilter}" 없음`); process.exit(1); }
} else {
  targets = BATTLES;
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

  console.log(`\n⚔️  나무위키 삼국지 전투 크롤러`);
  console.log(`   대상: ${targets.length}개 전투`);
  console.log(`   딜레이: ${delay}ms, 하위문서: ${!noSubpages}`);
  console.log(`   출력: ${OUT_DIR}\n`);

  const results = { success: [], failed: [], skipped: [] };

  for (let i = 0; i < targets.length; i++) {
    const battle = targets[i];
    const filename = `${safeFilename(battle.name_en)}.json`;
    const outPath = join(OUT_DIR, filename);

    if (resume && existsSync(outPath)) {
      log(i, battle, '⏭ 스킵 (이미 존재)');
      results.skipped.push(battle.name_kr);
      continue;
    }

    log(i, battle, `📥 크롤 시작 — namu.wiki/w/${battle.namu_title}`);

    try {
      // 1. 메인 페이지 fetch + parse
      const mainHtml = await fetchPage(battle.namu_title);
      const mainParsed = parseNamuHtml(mainHtml);

      // 2. 하위 문서 fetch
      const subpageContents = {};
      if (!noSubpages && mainParsed.subpageLinks.length > 0) {
        log(i, battle, `   📄 하위 문서 ${mainParsed.subpageLinks.length}개: ${mainParsed.subpageLinks.map(l => l.sectionName).join(', ')}`);

        // 둘러보기 등 불필요한 하위 문서 스킵
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
            log(i, battle, `   ✅ ${sub.sectionName}: ${totalChars.toLocaleString()}자, ${subParsed.sections.length}섹션`);
          } catch (subErr) {
            log(i, battle, `   ⚠️ ${sub.sectionName} 실패: ${subErr.message}`);
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

      // 6. 출력
      const output = {
        name_kr: battle.name_kr,
        name_en: battle.name_en,
        year: battle.year,
        participants: battle.participants,

        namu_url: `https://namu.wiki/w/${encodeURIComponent(battle.namu_title)}`,
        namu_title: mainParsed.title,

        sections: allSections,
        subpages_fetched: Object.keys(subpageContents),

        internal_links: [...allLinks],

        full_text_length: fullText.length,
        full_text: fullText,

        crawled_at: new Date().toISOString(),
        source: 'namu.wiki',
      };

      writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

      log(i, battle, `   ✅ 완료: ${fullText.length.toLocaleString()}자, 섹션 ${allSections.length}개, 하위문서 ${Object.keys(subpageContents).length}개`);
      results.success.push(battle.name_kr);

    } catch (err) {
      log(i, battle, `   ❌ 실패: ${err.message}`);
      results.failed.push({ name: battle.name_kr, error: err.message });

      // Cloudflare면 긴 대기 후 재시도
      if (err.message.includes('Cloudflare')) {
        log(i, battle, `   ⏳ Cloudflare — 15초 대기 후 재시도`);
        await sleep(15000);
        try {
          const html = await fetchPage(battle.namu_title);
          const parsed = parseNamuHtml(html);
          const fullText = parsed.sections.map(s => `## ${s.heading}\n${s.content || ''}`).join('\n\n').trim();
          const output = {
            name_kr: battle.name_kr, name_en: battle.name_en, year: battle.year,
            participants: battle.participants,
            namu_url: `https://namu.wiki/w/${encodeURIComponent(battle.namu_title)}`,
            namu_title: parsed.title, sections: parsed.sections, subpages_fetched: [],
            internal_links: parsed.internalLinks,
            full_text_length: fullText.length, full_text: fullText,
            crawled_at: new Date().toISOString(), source: 'namu.wiki',
          };
          writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
          log(i, battle, `   ✅ 재시도 성공: ${fullText.length.toLocaleString()}자`);
          results.failed.pop();
          results.success.push(battle.name_kr);
        } catch (e) {
          log(i, battle, `   ❌ 재시도 실패: ${e.message}`);
        }
      }
    }

    if (i < targets.length - 1) await sleep(delay);
  }

  // ── 서머리 ──
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`🏁 완료: ✅${results.success.length} ⏭${results.skipped.length} ❌${results.failed.length}`);
  if (results.failed.length > 0) {
    for (const f of results.failed) console.log(`   ❌ ${f.name}: ${f.error}`);
  }

  // 총 텍스트 통계
  let totalChars = 0;
  for (const name of results.success) {
    const b = BATTLES.find(b => b.name_kr === name);
    if (!b) continue;
    try {
      const data = JSON.parse(readFileSync(join(OUT_DIR, `${safeFilename(b.name_en)}.json`), 'utf-8'));
      totalChars += data.full_text_length;
    } catch { /* ignore */ }
  }
  if (totalChars > 0) console.log(`   📊 총 텍스트: ${totalChars.toLocaleString()}자`);
  console.log(`${'═'.repeat(50)}\n`);
}

function log(i, battle, msg) {
  console.log(`  [${i + 1}/${targets.length}] ${battle.name_kr} (${battle.year || '?'}) ${msg}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
