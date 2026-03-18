#!/usr/bin/env node
/**
 * P-Community: Reddit/커뮤니티 데이터에서 캐릭터별 센티먼트 집계
 *
 * 입력:
 *   - data/raw/community/reddit-dynastywarriors-*.json (Reddit 포스트/댓글)
 *
 * 출력:
 *   - data/processed/community-sentiment.json
 *     캐릭터별: mentions, sentiment(positive/negative/neutral), top_quotes, game_tier_mentions
 *
 * 로직:
 *   1. 모든 Reddit 포스트+댓글 텍스트 수집
 *   2. 캐릭터 이름(EN) 매칭 → mentions 집계
 *   3. 키워드 기반 센티먼트 분류 (positive/negative/neutral)
 *   4. 게임 평가 관련 포스트에서 티어/랭킹 언급 추출
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const COMMUNITY_DIR = join(ROOT, 'data', 'raw', 'community');
const OUT = join(ROOT, 'data', 'processed');

// ── 센티먼트 키워드 사전 ──
const POSITIVE_KEYWORDS = [
  'best', 'amazing', 'incredible', 'overpowered', 'op', 'favorite', 'favourite',
  'love', 'great', 'strong', 'powerful', 'godlike', 'god tier', 'top tier',
  's tier', 'a tier', 'goat', 'legend', 'legendary', 'beast', 'broken',
  'clutch', 'reliable', 'underrated', 'carried', 'mvp', 'excellent',
  'badass', 'chad', 'king', 'queen', 'iconic',
];

const NEGATIVE_KEYWORDS = [
  'worst', 'terrible', 'awful', 'weak', 'useless', 'trash', 'garbage',
  'boring', 'annoying', 'overrated', 'nerf', 'nerfed', 'bottom tier',
  'f tier', 'd tier', 'hate', 'hated', 'disappointing', 'forgettable',
  'irrelevant', 'wasted', 'pathetic', 'joke', 'meme', 'laughable',
];

// ── 이름 변형 생성 (성만, 풀네임, 공백 없는 버전) ──
function buildNameVariants(nameEn) {
  const lower = nameEn.toLowerCase();
  const parts = lower.split(' ');
  const variants = new Set();

  // 풀네임
  variants.add(lower);

  // 성 + 이름 붙인 것 (caocao, liubei 등)
  if (parts.length === 2) {
    variants.add(parts.join(''));
  }

  // 이름만 (2글자 이상이면, 너무 짧으면 제외)
  // 성만으로는 모호해서 제외 (liu, cao 등은 너무 흔함)
  // 특별 케이스: Lu Bu, Diao Chan 등은 성만으로도 유명
  const famousByFirst = ['lu bu', 'diao chan', 'dong zhuo', 'yuan shao', 'yuan shu'];
  if (famousByFirst.includes(lower)) {
    variants.add(parts[0] + ' ' + parts[1]); // already added above
  }

  return [...variants];
}

// ── 텍스트에서 캐릭터 멘션 찾기 ──
function findMentions(text, nameVariants) {
  const lower = text.toLowerCase();
  for (const variant of nameVariants) {
    // 단어 경계 매칭 (부분 문자열 false positive 방지)
    const regex = new RegExp(`\\b${variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lower)) return true;
  }
  return false;
}

// ── 문장 근처 센티먼트 판별 ──
function analyzeSentiment(text) {
  const lower = text.toLowerCase();
  let posScore = 0;
  let negScore = 0;

  for (const kw of POSITIVE_KEYWORDS) {
    if (lower.includes(kw)) posScore++;
  }
  for (const kw of NEGATIVE_KEYWORDS) {
    if (lower.includes(kw)) negScore++;
  }

  if (posScore > negScore) return 'positive';
  if (negScore > posScore) return 'negative';
  return 'neutral';
}

// ── 티어/랭킹 언급 추출 ──
function extractTierMention(text) {
  const lower = text.toLowerCase();
  const tierPatterns = [
    /\b(s|a|b|c|d|f)\s*tier\b/i,
    /\btop\s*\d+\b/i,
    /\b(god|top|high|mid|low|bottom)\s*tier\b/i,
    /\b(overpowered|op|broken|busted)\b/i,
    /\b(worst|best|strongest|weakest)\b/i,
  ];

  const matches = [];
  for (const p of tierPatterns) {
    const m = lower.match(p);
    if (m) matches.push(m[0]);
  }
  return matches;
}

// ── 메인 ──
async function main() {
  console.log('\n💬 P-Community: 커뮤니티 센티먼트 집계\n');

  const { ALL_CHARACTERS } = await import('../crawl/character-list.js');

  // 캐릭터 이름 변형 맵 구축
  const charVariants = {};
  for (const char of ALL_CHARACTERS) {
    charVariants[char.name_en] = buildNameVariants(char.name_en);
  }

  // Reddit 데이터 로드
  const files = readdirSync(COMMUNITY_DIR).filter(f => f.endsWith('.json'));
  console.log(`  커뮤니티 파일: ${files.length}`);

  const allTexts = []; // { text, source, score, isComment }

  for (const file of files) {
    const data = JSON.parse(readFileSync(join(COMMUNITY_DIR, file), 'utf-8'));
    const source = file.replace('.json', '');

    for (const post of (data.posts || [])) {
      const postText = `${post.title} ${post.selftext || ''}`.trim();
      if (postText.length > 10) {
        allTexts.push({
          text: postText,
          source,
          score: post.score || 0,
          isComment: false,
          permalink: post.permalink || null,
        });
      }

      for (const comment of (post.top_comments || [])) {
        if (comment.body && comment.body.length > 10) {
          allTexts.push({
            text: comment.body,
            source,
            score: comment.score || 0,
            isComment: true,
            permalink: post.permalink || null,
          });
        }
      }
    }
  }

  console.log(`  총 텍스트 유닛: ${allTexts.length} (posts + comments)`);

  // 캐릭터별 집계
  const charSentiment = {};

  for (const char of ALL_CHARACTERS) {
    const variants = charVariants[char.name_en];
    const mentions = [];

    for (const item of allTexts) {
      if (findMentions(item.text, variants)) {
        const sentiment = analyzeSentiment(item.text);
        const tiers = extractTierMention(item.text);

        mentions.push({
          sentiment,
          score: item.score,
          isComment: item.isComment,
          source: item.source,
          tiers,
          quote: item.text.substring(0, 200),
        });
      }
    }

    if (mentions.length === 0) continue;

    // 집계
    const sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
    let totalScore = 0;
    const tierMentions = [];
    const topQuotes = [];

    for (const m of mentions) {
      sentimentCounts[m.sentiment]++;
      totalScore += m.score;
      if (m.tiers.length > 0) tierMentions.push(...m.tiers);

      // 높은 스코어 포스트에서 인용문 수집
      if (m.score >= 10 && !m.isComment) {
        topQuotes.push({ quote: m.quote, score: m.score, sentiment: m.sentiment });
      }
    }

    // 센티먼트 점수 (정규화)
    const total = sentimentCounts.positive + sentimentCounts.negative + sentimentCounts.neutral;
    const sentimentScore = total > 0
      ? Math.round(((sentimentCounts.positive - sentimentCounts.negative) / total) * 100)
      : 0;

    charSentiment[char.name_en] = {
      name_kr: char.name_kr,
      name_en: char.name_en,
      faction: char.faction,
      tier: char.tier,
      total_mentions: mentions.length,
      sentiment_counts: sentimentCounts,
      sentiment_score: sentimentScore, // -100 ~ +100
      weighted_score: totalScore, // Reddit upvote 가중
      tier_mentions: [...new Set(tierMentions)],
      top_quotes: topQuotes
        .sort((a, b) => b.score - a.score)
        .slice(0, 5),
    };
  }

  // 결과 정렬 (멘션 수 내림차순)
  const sorted = Object.values(charSentiment)
    .sort((a, b) => b.total_mentions - a.total_mentions);

  // 통계
  console.log(`\n  캐릭터 멘션 감지: ${sorted.length}명`);
  console.log(`\n  Top 20 멘션:`);
  for (const c of sorted.slice(0, 20)) {
    const sent = c.sentiment_score > 0 ? `+${c.sentiment_score}` : c.sentiment_score;
    console.log(`    ${c.name_kr} (${c.name_en}): ${c.total_mentions}회, 센티먼트: ${sent}, tiers: [${c.tier_mentions.join(', ')}]`);
  }

  // 센티먼트 극단값
  const mostPositive = sorted.filter(c => c.total_mentions >= 3).sort((a, b) => b.sentiment_score - a.sentiment_score).slice(0, 5);
  const mostNegative = sorted.filter(c => c.total_mentions >= 3).sort((a, b) => a.sentiment_score - b.sentiment_score).slice(0, 5);

  console.log(`\n  가장 긍정적:`);
  for (const c of mostPositive) console.log(`    ${c.name_kr}: +${c.sentiment_score} (${c.total_mentions}회)`);
  console.log(`  가장 부정적:`);
  for (const c of mostNegative) console.log(`    ${c.name_kr}: ${c.sentiment_score} (${c.total_mentions}회)`);

  // 저장
  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, 'community-sentiment.json'),
    JSON.stringify({
      total_characters: sorted.length,
      total_text_units: allTexts.length,
      sources: files.map(f => f.replace('.json', '')),
      generated_at: new Date().toISOString(),
      characters: sorted,
    }, null, 2),
    'utf-8'
  );

  console.log(`\n  ✅ community-sentiment.json (${sorted.length} characters)\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
