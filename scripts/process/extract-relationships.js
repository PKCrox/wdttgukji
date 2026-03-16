#!/usr/bin/env node
/**
 * P3: 관계 그래프 추출
 *
 * 입력:
 *   - data/processed/novel-cooccurrence.json (P1 출력)
 *   - data/raw/characters-namu-bios/ (나무위키 바이오)
 *   - data/raw/characters-rotk11-stats.json (스탯)
 *
 * 출력:
 *   - data/processed/relationship-graph.json
 *     (타입, 강도, 근거가 있는 관계 엣지)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const PROCESSED = join(ROOT, 'data', 'processed');
const RAW = join(ROOT, 'data', 'raw');

// ── 관계 타입 정의 ──
const RELATIONSHIP_TYPES = {
  sworn_brothers: { kr: '의형제', base_intensity: 95 },
  lord_vassal: { kr: '군신', base_intensity: 70 },
  mentor_student: { kr: '사제', base_intensity: 65 },
  spouse: { kr: '부부', base_intensity: 80 },
  parent_child: { kr: '부자', base_intensity: 85 },
  siblings: { kr: '형제', base_intensity: 80 },
  rivalry: { kr: '적대', base_intensity: 60 },
  friendship: { kr: '우정', base_intensity: 55 },
  alliance: { kr: '동맹', base_intensity: 50 },
  betrayal: { kr: '배신', base_intensity: 75 },
};

// ── 알려진 관계 (역사적 사실 기반, 수작업 시드) ──
const KNOWN_RELATIONSHIPS = [
  // 의형제
  { a: 'Liu Bei', b: 'Guan Yu', type: 'sworn_brothers', evidence: '연의 1회 도원결의' },
  { a: 'Liu Bei', b: 'Zhang Fei', type: 'sworn_brothers', evidence: '연의 1회 도원결의' },
  { a: 'Guan Yu', b: 'Zhang Fei', type: 'sworn_brothers', evidence: '연의 1회 도원결의' },

  // 군신 (촉)
  { a: 'Liu Bei', b: 'Zhuge Liang', type: 'lord_vassal', evidence: '37~38회 삼고초려' },
  { a: 'Liu Bei', b: 'Zhao Yun', type: 'lord_vassal', evidence: '장판파에서 유선 구출' },
  { a: 'Liu Bei', b: 'Huang Zhong', type: 'lord_vassal', evidence: '53회 귀순' },
  { a: 'Liu Bei', b: 'Ma Chao', type: 'lord_vassal', evidence: '64회 귀순' },
  { a: 'Liu Bei', b: 'Wei Yan', type: 'lord_vassal', evidence: '53회 귀순' },
  { a: 'Liu Bei', b: 'Pang Tong', type: 'lord_vassal', evidence: '57회 합류' },
  { a: 'Zhuge Liang', b: 'Jiang Wei', type: 'mentor_student', evidence: '92회 항복 후 후계' },

  // 군신 (위)
  { a: 'Cao Cao', b: 'Xiahou Dun', type: 'lord_vassal', evidence: '혈족 맹장' },
  { a: 'Cao Cao', b: 'Xun Yu', type: 'lord_vassal', evidence: '왕좌지재' },
  { a: 'Cao Cao', b: 'Guo Jia', type: 'lord_vassal', evidence: '최측근 참모' },
  { a: 'Cao Cao', b: 'Jia Xu', type: 'lord_vassal', evidence: '독사 참모' },
  { a: 'Cao Cao', b: 'Zhang Liao', type: 'lord_vassal', evidence: '여포 사후 등용' },
  { a: 'Cao Cao', b: 'Dian Wei', type: 'lord_vassal', evidence: '근위대장' },
  { a: 'Cao Cao', b: 'Xu Chu', type: 'lord_vassal', evidence: '호치(虎癡)' },
  { a: 'Cao Cao', b: 'Sima Yi', type: 'lord_vassal', evidence: '후기 핵심 참모' },

  // 군신 (오)
  { a: 'Sun Quan', b: 'Zhou Yu', type: 'lord_vassal', evidence: '적벽 총사령관' },
  { a: 'Sun Quan', b: 'Lu Su', type: 'lord_vassal', evidence: '외교 참모' },
  { a: 'Sun Quan', b: 'Lu Meng', type: 'lord_vassal', evidence: '형주 탈환' },
  { a: 'Sun Quan', b: 'Lu Xun', type: 'lord_vassal', evidence: '이릉 승리' },
  { a: 'Sun Quan', b: 'Gan Ning', type: 'lord_vassal', evidence: '백기기습' },

  // 적대
  { a: 'Liu Bei', b: 'Cao Cao', type: 'rivalry', evidence: '21회 영웅론, 전편 대립' },
  { a: 'Guan Yu', b: 'Cao Cao', type: 'friendship', evidence: '25~27회 의리와 존경의 복잡한 관계' },
  { a: 'Zhuge Liang', b: 'Zhou Yu', type: 'rivalry', evidence: '44~57회 지략 대결' },
  { a: 'Zhuge Liang', b: 'Sima Yi', type: 'rivalry', evidence: '93~104회 북벌 대립' },
  { a: 'Lu Bu', b: 'Dong Zhuo', type: 'betrayal', evidence: '9회 여포가 동탁 살해' },
  { a: 'Lu Bu', b: 'Cao Cao', type: 'rivalry', evidence: '19회 하비 전투' },

  // 부부
  { a: 'Liu Bei', b: 'Sun Shangxiang', type: 'spouse', evidence: '54회 정략결혼' },
  { a: 'Sun Ce', b: 'Da Qiao', type: 'spouse', evidence: '교교자매' },
  { a: 'Zhou Yu', b: 'Xiao Qiao', type: 'spouse', evidence: '교교자매' },
  { a: 'Lu Bu', b: 'Diao Chan', type: 'spouse', evidence: '미인계' },

  // 부자
  { a: 'Cao Cao', b: 'Cao Pi', type: 'parent_child', evidence: '위 초대 황제' },
  { a: 'Sun Jian', b: 'Sun Ce', type: 'parent_child', evidence: '강동의 호랑이' },
  { a: 'Sun Jian', b: 'Sun Quan', type: 'parent_child', evidence: '오 건국자' },
  { a: 'Sun Ce', b: 'Sun Quan', type: 'siblings', evidence: '형제 계승' },
  { a: 'Liu Bei', b: 'Liu Shan', type: 'parent_child', evidence: '촉한 2대' },
  { a: 'Guan Yu', b: 'Guan Xing', type: 'parent_child', evidence: '관우의 아들' },
  { a: 'Zhang Fei', b: 'Zhang Bao', type: 'parent_child', evidence: '장비의 아들' },
  { a: 'Ma Chao', b: 'Pang De', type: 'lord_vassal', evidence: '서량 시절 부하 → 독립' },

  // 사제
  { a: 'Dong Zhuo', b: 'Lu Bu', type: 'lord_vassal', evidence: '의부자 관계' },
];

// ── 메인 ──
async function main() {
  console.log('\n🔗 P3: 관계 그래프 추출 파이프라인\n');

  const { ALL_CHARACTERS, buildNameMap } = await import('../crawl/character-list.js');
  const { kr2en, en2kr } = buildNameMap();

  // P1 동시출현 데이터 로드
  const coocPath = join(PROCESSED, 'novel-cooccurrence.json');
  if (!existsSync(coocPath)) {
    console.error('  ❌ novel-cooccurrence.json 없음. P1을 먼저 실행하세요.');
    process.exit(1);
  }

  const coocData = JSON.parse(readFileSync(coocPath, 'utf-8'));
  const coocPairs = coocData.pairs || [];

  // 동시출현 → 빠른 조회 맵
  const coocMap = {};
  for (const pair of coocPairs) {
    const key = [pair.a, pair.b].sort().join(':');
    coocMap[key] = pair;
  }

  function getCooccurrence(a, b) {
    const key = [a, b].sort().join(':');
    return coocMap[key]?.count || 0;
  }

  // 관계 엣지 구축
  const edges = [];

  for (const rel of KNOWN_RELATIONSHIPS) {
    const coocCount = getCooccurrence(rel.a, rel.b);
    const relType = RELATIONSHIP_TYPES[rel.type];

    // 강도 = 기본값 + 동시출현 보너스 (최대 100)
    const coocBonus = Math.min(coocCount * 0.5, 15);
    const intensity = Math.min(100, Math.round(relType.base_intensity + coocBonus));

    edges.push({
      a: rel.a,
      b: rel.b,
      a_id: rel.a.toLowerCase().replace(/\s+/g, '_'),
      b_id: rel.b.toLowerCase().replace(/\s+/g, '_'),
      type: rel.type,
      type_kr: relType.kr,
      intensity,
      cooccurrence_count: coocCount,
      evidence: rel.evidence,
      bidirectional: !['parent_child', 'mentor_student', 'betrayal'].includes(rel.type),
    });
  }

  // 동시출현이 높지만 알려진 관계에 없는 쌍 → 잠재 관계 추출
  const knownPairSet = new Set(KNOWN_RELATIONSHIPS.map(r => [r.a, r.b].sort().join(':')));
  const charNameSet = new Set(ALL_CHARACTERS.map(c => c.name_en));

  const potentialEdges = [];
  for (const pair of coocPairs) {
    if (pair.count < 5) continue; // 최소 5회 동시출현
    const key = [pair.a, pair.b].sort().join(':');
    if (knownPairSet.has(key)) continue;
    if (!charNameSet.has(pair.a) || !charNameSet.has(pair.b)) continue;

    potentialEdges.push({
      a: pair.a,
      b: pair.b,
      a_id: pair.a.toLowerCase().replace(/\s+/g, '_'),
      b_id: pair.b.toLowerCase().replace(/\s+/g, '_'),
      type: 'unknown',
      type_kr: '미분류',
      intensity: Math.min(50, Math.round(pair.count * 1.5)),
      cooccurrence_count: pair.count,
      evidence: `동시출현 ${pair.count}회 (${pair.chapters.slice(0, 5).join(', ')}...)`,
      bidirectional: true,
      _needs_classification: true,
    });
  }

  // 통계
  const typeDistribution = {};
  for (const e of edges) {
    typeDistribution[e.type_kr] = (typeDistribution[e.type_kr] || 0) + 1;
  }

  console.log(`  확정 관계: ${edges.length}`);
  console.log(`  잠재 관계 (미분류): ${potentialEdges.length}`);
  console.log(`  관계 유형 분포:`, typeDistribution);
  console.log(`\n  Top 10 강도:`);
  const topEdges = [...edges].sort((a, b) => b.intensity - a.intensity).slice(0, 10);
  for (const e of topEdges) {
    console.log(`    ${e.a} ↔ ${e.b}: ${e.intensity} (${e.type_kr}, 동시출현 ${e.cooccurrence_count}회)`);
  }

  // 저장
  writeFileSync(
    join(PROCESSED, 'relationship-graph.json'),
    JSON.stringify({
      total_edges: edges.length + potentialEdges.length,
      confirmed_edges: edges.length,
      potential_edges: potentialEdges.length,
      type_distribution: typeDistribution,
      generated_at: new Date().toISOString(),
      edges,
      potential: potentialEdges,
    }, null, 2),
    'utf-8'
  );

  console.log(`\n  ✅ relationship-graph.json (${edges.length} confirmed + ${potentialEdges.length} potential)\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
