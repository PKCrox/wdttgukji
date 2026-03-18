#!/usr/bin/env node
/**
 * 커뮤니티 평가/센티먼트 크롤러
 *
 * Reddit (JSON API) + 나무위키 게임 평가 + 캐릭터별 코에이 평가 수집.
 *
 * Usage:
 *   node scripts/crawl/crawl-community.js                    # 전체 (reddit + namu)
 *   node scripts/crawl/crawl-community.js --source reddit    # Reddit만
 *   node scripts/crawl/crawl-community.js --source namu      # 나무위키만
 *   node scripts/crawl/crawl-community.js --resume           # 이미 크롤된 건 스킵
 *   node scripts/crawl/crawl-community.js --delay 2000       # Reddit 딜레이 (ms, 기본 1000)
 *
 * Output: data/raw/community/
 *   reddit-{subreddit}-{query}.json
 *   koei-review-{slug}.json
 *   koei-character-eval-{slug}.json
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseNamuHtml } from './lib/namu-parser.js';
import { TIER_0 } from './character-list.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'data', 'raw', 'community');
const BIOS_DIR = join(ROOT, 'data', 'raw', 'characters-namu-bios');

// ── CLI ──
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const hasFlag = (f) => args.includes(f);

const sourceFilter = getArg('--source') || 'all'; // reddit | namu | all
const resume = hasFlag('--resume');
const redditDelay = parseInt(getArg('--delay') || '1000', 10);
const namuDelay = 2500;

if (!['reddit', 'namu', 'all'].includes(sourceFilter)) {
  console.error(`--source must be reddit|namu|all, got "${sourceFilter}"`);
  process.exit(1);
}

// ── 설정 ──

const REDDIT_UA = 'wdttgukji-research/1.0';
const NAMU_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const SUBREDDITS = ['koei', 'RotMK', 'dynastywarriors'];
const REDDIT_QUERIES = [
  'ROTK',
  'Romance of Three Kingdoms',
  'balance',
  'abilities',
  'stats',
  'best officer',
  'worst officer',
  'tier list',
];

/** 나무위키 코에이 삼국지 시리즈 리뷰 대상 */
const KOEI_REVIEW_PAGES = [
  { slug: 'series',       namu_title: '삼국지(코에이 시리즈)',  title_kr: '삼국지 시리즈' },
  { slug: 'sam3',         namu_title: '삼국지3(게임)',          title_kr: '삼국지3' },
  { slug: 'sam5',         namu_title: '삼국지5(게임)',          title_kr: '삼국지5' },
  { slug: 'sam8',         namu_title: '삼국지8(게임)',          title_kr: '삼국지8' },
  { slug: 'sam8-remake',  namu_title: '삼국지8 리메이크',       title_kr: '삼국지8 리메이크' },
  { slug: 'sam9',         namu_title: '삼국지9(게임)',          title_kr: '삼국지9' },
  { slug: 'sam11',        namu_title: '삼국지11(게임)',         title_kr: '삼국지11' },
  { slug: 'sam13',        namu_title: '삼국지13(게임)',         title_kr: '삼국지13' },
  { slug: 'sam14',        namu_title: '삼국지14(게임)',         title_kr: '삼국지14' },
];

/** 섹션 필터: 게임 평가 관련 키워드 */
const REVIEW_SECTION_PATTERNS = /평가|시스템|밸런스|장단점|장점|단점|문제점|게임성|총평|비판|호평|불만|개선|버그/;

/** 캐릭터 "코에이 삼국지" 섹션 필터 */
const KOEI_CHAR_SECTION_PATTERNS = /코에이 삼국지|삼국지 시리즈에서|게임에서의|코에이|삼국지 시리즈/;

// ── 유틸 ──
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const safeFilename = (s) => s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9가-힣-]/g, '');

// ── Reddit 크롤 ──

/**
 * Reddit JSON API로 검색 결과 + 상위 댓글 수집
 */
async function fetchRedditSearch(subreddit, query) {
  const url = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&sort=top&t=all&limit=100&restrict_sr=on`;
  const res = await fetch(url, {
    headers: { 'User-Agent': REDDIT_UA },
  });
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '60', 10);
    throw new Error(`Reddit rate limited (429). Retry after ${retryAfter}s`);
  }
  if (!res.ok) throw new Error(`Reddit HTTP ${res.status} for r/${subreddit} q="${query}"`);
  const json = await res.json();
  return json;
}

/**
 * Reddit 게시글의 상위 댓글 fetch
 */
async function fetchRedditComments(permalink) {
  const url = `https://www.reddit.com${permalink}.json?sort=top&limit=25`;
  const res = await fetch(url, {
    headers: { 'User-Agent': REDDIT_UA },
  });
  if (!res.ok) return [];
  const json = await res.json();

  // json[1] = comments listing
  if (!Array.isArray(json) || json.length < 2) return [];
  const commentListing = json[1]?.data?.children || [];
  return commentListing
    .filter(c => c.kind === 't1' && c.data?.body)
    .map(c => ({
      author: c.data.author,
      body: c.data.body.slice(0, 2000), // 댓글 2000자 상한
      score: c.data.score,
      created_utc: c.data.created_utc,
    }));
}

/**
 * 단일 서브레딧 + 쿼리 크롤
 */
async function crawlRedditQuery(subreddit, query, idx, total) {
  const slug = safeFilename(`${subreddit}-${query}`);
  const outPath = join(OUT_DIR, `reddit-${slug}.json`);

  if (resume && existsSync(outPath)) {
    console.log(`  [${idx}/${total}] [REDDIT] r/${subreddit} "${query}" — skip (exists)`);
    return { status: 'skipped' };
  }

  console.log(`  [${idx}/${total}] [REDDIT] r/${subreddit} "${query}" — fetching...`);

  const searchResult = await fetchRedditSearch(subreddit, query);
  const posts = (searchResult?.data?.children || []).filter(c => c.kind === 't3');

  if (posts.length === 0) {
    console.log(`  [${idx}/${total}] [REDDIT] r/${subreddit} "${query}" — 0 posts, skip`);
    return { status: 'empty' };
  }

  // 상위 10개 게시글에서 댓글도 수집
  const enrichedPosts = [];
  const topPosts = posts.slice(0, 10);

  for (let pi = 0; pi < topPosts.length; pi++) {
    const post = topPosts[pi].data;
    await sleep(redditDelay);

    let comments = [];
    try {
      comments = await fetchRedditComments(post.permalink);
    } catch {
      // 댓글 실패는 무시
    }

    enrichedPosts.push({
      title: post.title,
      selftext: (post.selftext || '').slice(0, 5000),
      score: post.score,
      num_comments: post.num_comments,
      created_utc: post.created_utc,
      permalink: post.permalink,
      url: post.url,
      top_comments: comments,
    });
  }

  // 나머지 게시글은 댓글 없이 메타만
  const restPosts = posts.slice(10).map(c => ({
    title: c.data.title,
    selftext: (c.data.selftext || '').slice(0, 2000),
    score: c.data.score,
    num_comments: c.data.num_comments,
    created_utc: c.data.created_utc,
    permalink: c.data.permalink,
    url: c.data.url,
    top_comments: [],
  }));

  const output = {
    source: 'reddit',
    subreddit,
    query,
    total_posts: posts.length,
    posts_with_comments: enrichedPosts.length,
    posts: [...enrichedPosts, ...restPosts],
    crawled_at: new Date().toISOString(),
  };

  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
  const totalComments = enrichedPosts.reduce((sum, p) => sum + p.top_comments.length, 0);
  console.log(`  [${idx}/${total}] [REDDIT] r/${subreddit} "${query}" — ${posts.length} posts, ${totalComments} comments`);
  return { status: 'success', posts: posts.length, comments: totalComments };
}

async function crawlReddit() {
  const tasks = [];
  for (const sub of SUBREDDITS) {
    for (const query of REDDIT_QUERIES) {
      tasks.push({ sub, query });
    }
  }

  console.log(`\n=== Reddit community crawler ===`);
  console.log(`   subreddits: ${SUBREDDITS.join(', ')}`);
  console.log(`   queries: ${REDDIT_QUERIES.length}`);
  console.log(`   total: ${tasks.length} requests`);
  console.log(`   delay: ${redditDelay}ms\n`);

  const results = { success: 0, skipped: 0, empty: 0, failed: 0 };

  for (let i = 0; i < tasks.length; i++) {
    const { sub, query } = tasks[i];
    try {
      const r = await crawlRedditQuery(sub, query, i + 1, tasks.length);
      results[r.status] = (results[r.status] || 0) + 1;
    } catch (err) {
      console.log(`  [${i + 1}/${tasks.length}] [REDDIT] r/${sub} "${query}" — FAIL: ${err.message}`);
      results.failed++;

      // rate limit: 긴 대기
      if (err.message.includes('429')) {
        console.log(`  [REDDIT] Rate limited — waiting 60s...`);
        await sleep(60000);
      }
    }

    if (i < tasks.length - 1) await sleep(redditDelay);
  }

  return results;
}

// ── 나무위키: 코에이 삼국지 시리즈 평가 크롤 ──

async function fetchNamuPage(title) {
  const url = `https://namu.wiki/w/${encodeURIComponent(title)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': NAMU_UA,
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

/**
 * 나무위키 게임 페이지에서 평가/시스템/밸런스 섹션 추출
 */
async function crawlKoeiReview(page, idx, total) {
  const outPath = join(OUT_DIR, `koei-review-${page.slug}.json`);

  if (resume && existsSync(outPath)) {
    console.log(`  [${idx}/${total}] [NAMU-REVIEW] ${page.title_kr} — skip (exists)`);
    return { status: 'skipped' };
  }

  console.log(`  [${idx}/${total}] [NAMU-REVIEW] ${page.title_kr} — fetching ${page.namu_title}...`);

  const html = await fetchNamuPage(page.namu_title);
  const parsed = parseNamuHtml(html);

  // 관련 섹션 필터
  const reviewSections = parsed.sections.filter(s =>
    REVIEW_SECTION_PATTERNS.test(s.heading) && s.content && s.content.length > 30
  );

  // 하위 문서 중 평가 관련도 있으면 fetch
  const subReviewLinks = parsed.subpageLinks.filter(l =>
    REVIEW_SECTION_PATTERNS.test(l.sectionName)
  );

  const subpageContents = [];
  for (const sub of subReviewLinks) {
    await sleep(namuDelay);
    try {
      const subHtml = await fetchNamuPage(sub.url);
      const subParsed = parseNamuHtml(subHtml);
      const subText = subParsed.sections
        .filter(s => s.content && s.content.length > 30)
        .map(s => `### ${s.heading}\n${s.content}`)
        .join('\n\n');
      subpageContents.push({
        section: sub.sectionName,
        url: sub.url,
        text: subText,
        char_count: subText.length,
      });
      console.log(`  [${idx}/${total}] [NAMU-REVIEW]    + subpage "${sub.sectionName}": ${subText.length.toLocaleString()} chars`);
    } catch (err) {
      console.log(`  [${idx}/${total}] [NAMU-REVIEW]    ! subpage "${sub.sectionName}" failed: ${err.message}`);
    }
  }

  const output = {
    source: 'namu.wiki',
    type: 'koei_review',
    title_kr: page.title_kr,
    slug: page.slug,
    namu_title: parsed.title,
    namu_url: `https://namu.wiki/w/${encodeURIComponent(page.namu_title)}`,

    review_sections: reviewSections.map(s => ({
      heading: s.heading,
      level: s.level,
      content: s.content,
      char_count: s.content.length,
    })),

    subpage_reviews: subpageContents,

    // 전체 섹션 목록 (어떤 섹션이 있는지 참고용)
    all_section_headings: parsed.sections.map(s => s.heading),

    total_review_chars: reviewSections.reduce((sum, s) => sum + s.content.length, 0)
      + subpageContents.reduce((sum, s) => sum + s.char_count, 0),

    crawled_at: new Date().toISOString(),
  };

  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`  [${idx}/${total}] [NAMU-REVIEW] ${page.title_kr} — ${reviewSections.length} sections, ${output.total_review_chars.toLocaleString()} chars`);
  return { status: 'success', sections: reviewSections.length, chars: output.total_review_chars };
}

async function crawlKoeiReviews() {
  console.log(`\n=== Namu Wiki Koei ROTK review crawler ===`);
  console.log(`   targets: ${KOEI_REVIEW_PAGES.length} titles`);
  console.log(`   delay: ${namuDelay}ms\n`);

  const results = { success: 0, skipped: 0, failed: 0 };

  for (let i = 0; i < KOEI_REVIEW_PAGES.length; i++) {
    const page = KOEI_REVIEW_PAGES[i];
    try {
      const r = await crawlKoeiReview(page, i + 1, KOEI_REVIEW_PAGES.length);
      results[r.status]++;
    } catch (err) {
      console.log(`  [${i + 1}/${KOEI_REVIEW_PAGES.length}] [NAMU-REVIEW] ${page.title_kr} — FAIL: ${err.message}`);
      results.failed++;

      // Cloudflare: long wait + retry
      if (err.message.includes('Cloudflare')) {
        console.log(`  [NAMU-REVIEW] Cloudflare — waiting 15s...`);
        await sleep(15000);
      }
    }

    if (i < KOEI_REVIEW_PAGES.length - 1) await sleep(namuDelay);
  }

  return results;
}

// ── 나무위키: 캐릭터별 코에이 삼국지 섹션 추출 ──

/**
 * 이미 크롤된 캐릭터 바이오에서 "코에이 삼국지 시리즈에서" 섹션 추출.
 * 바이오 파일이 없으면 나무위키 직접 fetch.
 */
async function crawlCharacterKoeiEvals() {
  const targets = TIER_0;

  console.log(`\n=== Namu Wiki character Koei evaluation crawler ===`);
  console.log(`   targets: ${targets.length} characters (Tier 0)`);
  console.log(`   bios dir: ${BIOS_DIR}`);
  console.log(`   delay: ${namuDelay}ms (for fresh fetches)\n`);

  const results = { success: 0, skipped: 0, failed: 0, from_cache: 0 };
  const safeNameFn = (name) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  for (let i = 0; i < targets.length; i++) {
    const char = targets[i];
    const slug = safeNameFn(char.name_en);
    const outPath = join(OUT_DIR, `koei-character-eval-${slug}.json`);

    if (resume && existsSync(outPath)) {
      console.log(`  [${i + 1}/${targets.length}] [CHAR-EVAL] ${char.name_kr} — skip (exists)`);
      results.skipped++;
      continue;
    }

    // 1차: 기존 바이오 파일에서 추출 시도
    const bioPath = join(BIOS_DIR, `${slug}.json`);
    let koeiSections = [];
    let fromCache = false;

    if (existsSync(bioPath)) {
      try {
        const bio = JSON.parse(readFileSync(bioPath, 'utf-8'));
        koeiSections = (bio.sections || []).filter(s =>
          KOEI_CHAR_SECTION_PATTERNS.test(s.heading) && s.content && s.content.length > 50
        );
        if (koeiSections.length > 0) {
          fromCache = true;
          console.log(`  [${i + 1}/${targets.length}] [CHAR-EVAL] ${char.name_kr} — from cached bio (${koeiSections.length} sections)`);
        }
      } catch {
        // 파싱 실패 시 fresh fetch로 fallback
      }
    }

    // 2차: 기존 바이오에 없으면 직접 fetch
    if (koeiSections.length === 0) {
      console.log(`  [${i + 1}/${targets.length}] [CHAR-EVAL] ${char.name_kr} — fetching ${char.namu_title}...`);
      try {
        const html = await fetchNamuPage(char.namu_title);
        const parsed = parseNamuHtml(html);

        koeiSections = parsed.sections.filter(s =>
          KOEI_CHAR_SECTION_PATTERNS.test(s.heading) && s.content && s.content.length > 50
        );

        // 하위 문서에 "코에이 삼국지" 관련이 있으면 fetch
        const koeiSubLinks = parsed.subpageLinks.filter(l =>
          KOEI_CHAR_SECTION_PATTERNS.test(l.sectionName)
        );

        for (const sub of koeiSubLinks) {
          await sleep(namuDelay);
          try {
            const subHtml = await fetchNamuPage(sub.url);
            const subParsed = parseNamuHtml(subHtml);
            const mergedContent = subParsed.sections
              .filter(s => s.content && s.content.length > 30)
              .map(s => `### ${s.heading}\n${s.content}`)
              .join('\n\n');

            if (mergedContent.length > 50) {
              koeiSections.push({
                heading: sub.sectionName,
                level: 2,
                content: mergedContent,
                source: 'subpage',
                subpage_url: sub.url,
              });
              console.log(`  [${i + 1}/${targets.length}] [CHAR-EVAL]    + subpage "${sub.sectionName}": ${mergedContent.length.toLocaleString()} chars`);
            }
          } catch (subErr) {
            console.log(`  [${i + 1}/${targets.length}] [CHAR-EVAL]    ! subpage "${sub.sectionName}" failed: ${subErr.message}`);
          }
        }

        if (i < targets.length - 1 && koeiSubLinks.length === 0) await sleep(namuDelay);
      } catch (err) {
        console.log(`  [${i + 1}/${targets.length}] [CHAR-EVAL] ${char.name_kr} — FAIL: ${err.message}`);
        results.failed++;

        if (err.message.includes('Cloudflare')) {
          console.log(`  [CHAR-EVAL] Cloudflare — waiting 15s...`);
          await sleep(15000);
        }
        continue;
      }
    }

    if (koeiSections.length === 0) {
      console.log(`  [${i + 1}/${targets.length}] [CHAR-EVAL] ${char.name_kr} — no Koei sections found`);
      results.failed++;
      continue;
    }

    const totalChars = koeiSections.reduce((sum, s) => sum + (s.content?.length || 0), 0);

    const output = {
      source: fromCache ? 'namu.wiki (cached bio)' : 'namu.wiki',
      type: 'koei_character_eval',
      name_kr: char.name_kr,
      name_en: char.name_en,
      name_cn: char.name_cn,
      faction: char.faction,
      tier: char.tier,
      namu_url: `https://namu.wiki/w/${encodeURIComponent(char.namu_title)}`,

      koei_sections: koeiSections.map(s => ({
        heading: s.heading,
        level: s.level,
        content: s.content,
        char_count: s.content.length,
        ...(s.source === 'subpage' ? { source: 'subpage', subpage_url: s.subpage_url } : {}),
      })),

      total_chars: totalChars,
      crawled_at: new Date().toISOString(),
    };

    writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`  [${i + 1}/${targets.length}] [CHAR-EVAL] ${char.name_kr} — ${koeiSections.length} sections, ${totalChars.toLocaleString()} chars`);

    results.success++;
    if (fromCache) results.from_cache++;

    // fresh fetch인 경우에만 delay (캐시에서 읽으면 불필요)
    if (!fromCache && i < targets.length - 1) await sleep(namuDelay);
  }

  return results;
}

// ── 메인 ──

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  community sentiment crawler`);
  console.log(`  source: ${sourceFilter}`);
  console.log(`  resume: ${resume}`);
  console.log(`  output: ${OUT_DIR}`);
  console.log(`${'='.repeat(50)}`);

  const summary = {};

  // 1. Reddit
  if (sourceFilter === 'all' || sourceFilter === 'reddit') {
    summary.reddit = await crawlReddit();
  }

  // 2. 나무위키 코에이 삼국지 시리즈 평가
  if (sourceFilter === 'all' || sourceFilter === 'namu') {
    summary.koei_reviews = await crawlKoeiReviews();
  }

  // 3. 나무위키 캐릭터별 코에이 평가
  if (sourceFilter === 'all' || sourceFilter === 'namu') {
    summary.koei_character_evals = await crawlCharacterKoeiEvals();
  }

  // ── 최종 요약 ──
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  SUMMARY`);
  console.log(`${'='.repeat(50)}`);

  if (summary.reddit) {
    const r = summary.reddit;
    console.log(`  [Reddit]`);
    console.log(`    success: ${r.success}, skipped: ${r.skipped}, empty: ${r.empty}, failed: ${r.failed}`);
  }

  if (summary.koei_reviews) {
    const r = summary.koei_reviews;
    console.log(`  [Koei Reviews]`);
    console.log(`    success: ${r.success}, skipped: ${r.skipped}, failed: ${r.failed}`);
  }

  if (summary.koei_character_evals) {
    const r = summary.koei_character_evals;
    console.log(`  [Character Evals]`);
    console.log(`    success: ${r.success}, skipped: ${r.skipped}, failed: ${r.failed}, from_cache: ${r.from_cache}`);
  }

  // 파일 수 집계
  try {
    const files = readdirSync(OUT_DIR).filter(f => f.endsWith('.json'));
    const redditFiles = files.filter(f => f.startsWith('reddit-'));
    const reviewFiles = files.filter(f => f.startsWith('koei-review-'));
    const evalFiles = files.filter(f => f.startsWith('koei-character-eval-'));
    console.log(`\n  Files in ${OUT_DIR}:`);
    console.log(`    reddit: ${redditFiles.length}, reviews: ${reviewFiles.length}, char-evals: ${evalFiles.length}`);
    console.log(`    total: ${files.length} files`);
  } catch { /* ignore */ }

  console.log(`${'='.repeat(50)}\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
