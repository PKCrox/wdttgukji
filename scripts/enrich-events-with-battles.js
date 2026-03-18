#!/usr/bin/env node
// enrich-events-with-battles.js — 구조화된 전투 데이터로 이벤트 보강
// 39 전투의 지휘관/병력/전략 → 매칭 이벤트에 battle_data 필드 추가

import { readFileSync, writeFileSync } from 'fs';

const EVENTS_FILE = 'data/events/all-events.json';
const BATTLE_FILE = 'data/processed/battles-structured.json';

const eventsData = JSON.parse(readFileSync(EVENTS_FILE, 'utf8'));
const battleData = JSON.parse(readFileSync(BATTLE_FILE, 'utf8'));

// 전투명 → 이벤트 매칭 키워드
const battleKeywords = {};
for (const b of battleData.battles) {
  // 전투명에서 키워드 추출 (之战 제거)
  const keywords = [
    b.name_cn,
    b.name_cn.replace(/之战|战役/g, ''),
    b.name_kr,
    b.name_kr?.replace(/ (대)?전(투)?/g, ''),
  ].filter(Boolean);

  battleKeywords[b.id] = { battle: b, keywords };
}

// === 이벤트 매칭 + 보강 ===
let matched = 0, unmatched = 0;
const matchLog = [];

for (const event of eventsData.events) {
  const eName = event.name || '';
  const eText = event.narrative?.text || '';
  const eFlavor = event.narrative?.flavor || '';
  const searchText = `${eName} ${eText} ${eFlavor}`;

  let bestMatch = null;
  let bestScore = 0;

  for (const [battleId, { battle, keywords }] of Object.entries(battleKeywords)) {
    let score = 0;

    // 이름 직접 매칭 (강력)
    for (const kw of keywords) {
      if (eName.includes(kw)) score += 10;
      else if (searchText.includes(kw)) score += 3;
    }

    // 참전 캐릭터 매칭
    if (battle.commanders) {
      for (const side of battle.commanders) {
        for (const cmd of side) {
          if (cmd.slug && event.participants?.some(p => p.character_id === cmd.slug)) {
            score += 2;
          }
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = battle;
    }
  }

  // 임계치 이상만 매칭
  if (bestMatch && bestScore >= 5) {
    event.battle_data = {
      name_cn: bestMatch.name_cn,
      name_kr: bestMatch.name_kr,
      date: bestMatch.date,
      belligerents: bestMatch.belligerents,
      forces: bestMatch.forces,
      casualties: bestMatch.casualties,
      result: bestMatch.result,
      significance: bestMatch.significance,
      strategies: bestMatch.strategies,
      commanders: bestMatch.commanders?.map(side =>
        side.map(c => ({ name: c.name, slug: c.slug }))
      ),
      match_score: bestScore,
    };
    matched++;
    matchLog.push(`  ✓ ${eName} ↔ ${bestMatch.name_cn} (score=${bestScore})`);
  }
}

// === 전략 유형 → 계략 효과 매핑 (이벤트에 전략 선택지 추가) ===
const strategyEffects = {
  '火攻': { type: 'army_change', desc: '화공으로 적 병력 대량 소실', delta: -8000 },
  '伏兵': { type: 'morale_change', desc: '매복 성공, 적 사기 급락', delta: -30 },
  '奇袭': { type: 'army_change', desc: '기습 성공, 적 혼란', delta: -5000 },
  '围城': { type: 'food_change', desc: '포위전으로 적 식량 고갈', delta: -5000 },
  '水攻': { type: 'army_change', desc: '수공으로 적 진영 수몰', delta: -10000 },
  '断粮': { type: 'food_change', desc: '보급로 차단', delta: -8000 },
  '诈降': { type: 'morale_change', desc: '거짓 항복으로 적 방심 유도', delta: -25 },
  '离间': { type: 'loyalty_change', desc: '이간계로 적 내부 분열', delta: -20 },
  '空城': { type: 'morale_change', desc: '공성계 성공, 적 퇴각', delta: -15 },
  '连环': { type: 'army_change', desc: '연환계로 적 기동력 마비', delta: -6000 },
  '夜袭': { type: 'army_change', desc: '야습 성공', delta: -4000 },
  '草船': { type: 'stat_change', desc: '초선차전, 화살 10만 확보', delta: 10 },
  '诱敌': { type: 'army_change', desc: '유인 성공, 적 포위', delta: -5000 },
  '声东击西': { type: 'morale_change', desc: '성동격서로 허를 찔림', delta: -20 },
  '围魏救赵': { type: 'army_change', desc: '우회 기동 성공', delta: -3000 },
};

// 전투 매칭된 이벤트에 전략 기반 선택지 보강
let strategyEnriched = 0;
for (const event of eventsData.events) {
  if (!event.battle_data?.strategies?.length) continue;
  if (!event.choices || event.choices.length === 0) continue; // 선택지 없는 이벤트는 건너뜀

  // 기존 선택지에 전략 효과가 없으면 전략 정보만 태그로 추가
  if (!event.battle_data.strategies_applied) {
    event.battle_data.strategies_applied = event.battle_data.strategies.map(s => ({
      type: s.type,
      effect: strategyEffects[s.type] || null,
    }));
    strategyEnriched++;
  }
}

// === 통계 ===
console.log(`=== 이벤트-전투 매칭 결과 ===`);
console.log(`매칭 성공: ${matched}개`);
console.log(`전략 보강: ${strategyEnriched}개`);
console.log(`총 이벤트: ${eventsData.events.length}개`);
console.log(`총 전투: ${battleData.battles.length}개`);
console.log(`\n매칭 로그:`);
matchLog.forEach(l => console.log(l));

// 전략 유형 분포
const stratCounts = {};
for (const event of eventsData.events) {
  if (event.battle_data?.strategies) {
    for (const s of event.battle_data.strategies) {
      stratCounts[s.type] = (stratCounts[s.type] || 0) + 1;
    }
  }
}
if (Object.keys(stratCounts).length) {
  console.log(`\n전략 유형 분포 (매칭된 이벤트):`);
  Object.entries(stratCounts).sort((a, b) => b[1] - a[1])
    .forEach(([t, c]) => console.log(`  ${t}: ${c}`));
}

// === 저장 ===
eventsData.battle_enrichment = {
  matched,
  strategy_enriched: strategyEnriched,
  enriched_at: new Date().toISOString(),
};

writeFileSync(EVENTS_FILE, JSON.stringify(eventsData, null, 2));
console.log(`\n→ ${EVENTS_FILE} 저장 완료`);
