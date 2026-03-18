/**
 * 멀티버전 스탯 밸런싱 — ROTK 10/11/12 교차 비교 + 커뮤니티 감정 반영
 *
 * 1. soul.md 현재 스탯 vs ROTK 10/11/12 비교
 * 2. 큰 편차(±10 이상) 있으면 보정 제안
 * 3. 커뮤니티 감정 스코어 → charisma 보정 가이드
 * 4. 보정 JSON 출력 → apply-balance.js로 적용
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';

// === 데이터 로드 ===
const rotk10 = JSON.parse(readFileSync('data/raw/characters-rotk10-stats.json','utf8')).data;
const rotk11 = JSON.parse(readFileSync('data/raw/characters-rotk11-stats.json','utf8')).data;
const rotk12 = JSON.parse(readFileSync('data/raw/characters-rotk12-stats.json','utf8')).data;
const sentiment = JSON.parse(readFileSync('data/processed/community-sentiment.json','utf8')).characters;
const nameXref = JSON.parse(readFileSync('data/processed/name-xref.json','utf8'));

// name_kr → rotk stats 매핑
function buildStatMap(data) {
  const m = {};
  for (const c of data) {
    m[c.name_kr] = {
      command: c.leadership, war: c.war, intellect: c.intelligence || c.intellect,
      politics: c.politics, charisma: c.charisma
    };
  }
  return m;
}
const r10 = buildStatMap(rotk10);
const r11 = buildStatMap(rotk11);
const r12 = buildStatMap(rotk12);

// sentiment: name_kr → score
const sentMap = {};
for (const c of sentiment) {
  sentMap[c.name_kr] = { score: c.sentiment_score, mentions: c.total_mentions, weighted: c.weighted_score };
}

// soul.md → current stats
function extractFromSoul(slug) {
  try {
    const md = readFileSync(`data/characters/${slug}.soul.md`, 'utf8');
    const nameMatch = md.match(/^# (.+?) \(/m);
    const name_kr = nameMatch ? nameMatch[1] : null;
    const statMatch = md.match(/\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/);
    if (!statMatch || !name_kr) return null;
    return {
      name_kr,
      stats: {
        command: +statMatch[1], war: +statMatch[2], intellect: +statMatch[3],
        politics: +statMatch[4], charisma: +statMatch[5]
      },
      total: +statMatch[6]
    };
  } catch { return null; }
}

// === 분석 ===
const slugs = readdirSync('data/characters').filter(f=>f.endsWith('.soul.md')).map(f=>f.replace('.soul.md',''));
const adjustments = [];
const THRESHOLD = 8; // 편차 임계치
const statKeys = ['command','war','intellect','politics','charisma'];

let analyzed = 0, withIssues = 0;

for (const slug of slugs) {
  const soul = extractFromSoul(slug);
  if (!soul) continue;
  analyzed++;

  const { name_kr, stats } = soul;
  const versions = {};
  if (r10[name_kr]) versions['r10'] = r10[name_kr];
  if (r11[name_kr]) versions['r11'] = r11[name_kr];
  if (r12[name_kr]) versions['r12'] = r12[name_kr];

  if (Object.keys(versions).length < 2) continue; // 비교 불가

  // 버전별 평균 계산
  const avg = {};
  for (const sk of statKeys) {
    const vals = Object.values(versions).map(v => v[sk]).filter(v => v != null && v > 0);
    avg[sk] = vals.length ? Math.round(vals.reduce((a,b)=>a+b,0) / vals.length) : null;
  }

  // 현재 soul.md 스탯과 평균 비교
  const diffs = {};
  let hasIssue = false;
  for (const sk of statKeys) {
    if (avg[sk] == null) continue;
    const diff = stats[sk] - avg[sk];
    if (Math.abs(diff) >= THRESHOLD) {
      diffs[sk] = { current: stats[sk], avg: avg[sk], diff, versions: {} };
      for (const [vk,vv] of Object.entries(versions)) {
        if (vv[sk] != null) diffs[sk].versions[vk] = vv[sk];
      }
      hasIssue = true;
    }
  }

  // 커뮤니티 감정 체크
  const sent = sentMap[name_kr];
  let charismaAdj = null;
  if (sent && sent.mentions >= 5) {
    // 감정이 매우 긍정(>75)인데 매력이 낮으면(<60) 보정 제안
    if (sent.score > 75 && stats.charisma < 60) {
      charismaAdj = { current: stats.charisma, sentimentScore: sent.score, mentions: sent.mentions, suggest: Math.min(stats.charisma + 10, 70) };
      hasIssue = true;
    }
    // 감정이 매우 부정(<30)인데 매력이 높으면(>70) 보정 제안
    if (sent.score < 30 && stats.charisma > 70) {
      charismaAdj = { current: stats.charisma, sentimentScore: sent.score, mentions: sent.mentions, suggest: Math.max(stats.charisma - 10, 50) };
      hasIssue = true;
    }
  }

  if (hasIssue) {
    withIssues++;
    const adj = { slug, name_kr, currentStats: stats, diffs };
    if (charismaAdj) adj.charismaFromSentiment = charismaAdj;

    // 보정 제안 생성
    const proposed = { ...stats };
    for (const [sk, d] of Object.entries(diffs)) {
      // 평균쪽으로 50% 보정
      proposed[sk] = Math.round(stats[sk] + (d.avg - stats[sk]) * 0.5);
    }
    if (charismaAdj) {
      proposed.charisma = charismaAdj.suggest;
    }
    adj.proposedStats = proposed;
    adjustments.push(adj);
  }
}

// 통계
console.log(`Analyzed: ${analyzed} characters`);
console.log(`With balance issues (±${THRESHOLD}): ${withIssues}`);
console.log(`ROTK10: ${Object.keys(r10).length}, ROTK11: ${Object.keys(r11).length}, ROTK12: ${Object.keys(r12).length}`);
console.log(`Community sentiment: ${sentiment.length} characters`);

// Top 10 biggest diffs
const allDiffs = [];
for (const adj of adjustments) {
  for (const [sk, d] of Object.entries(adj.diffs)) {
    allDiffs.push({ name: adj.name_kr, slug: adj.slug, stat: sk, diff: d.diff, current: d.current, avg: d.avg });
  }
}
allDiffs.sort((a,b) => Math.abs(b.diff) - Math.abs(a.diff));
console.log('\nTop 20 largest deviations:');
for (const d of allDiffs.slice(0, 20)) {
  console.log(`  ${d.name} ${d.stat}: ${d.current} (soul) vs ${d.avg} (avg) → Δ${d.diff > 0 ? '+' : ''}${d.diff}`);
}

// 저장
writeFileSync('data/processed/stat-balance-adjustments.json', JSON.stringify({ analyzed, withIssues, threshold: THRESHOLD, adjustments }, null, 2));
console.log(`\nSaved ${adjustments.length} adjustments to data/processed/stat-balance-adjustments.json`);
