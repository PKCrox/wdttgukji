#!/usr/bin/env node
/**
 * P5: 지리/영토 구조화
 *
 * 입력: data/raw/world/ (geo-17 + faction-11)
 * 출력:
 *   - data/processed/geography.json   (도시 노드 + 연결 그래프)
 *   - data/processed/factions.json    (세력 데이터 + 영토)
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const WORLD_DIR = join(ROOT, 'data', 'raw', 'world');
const OUT = join(ROOT, 'data', 'processed');

// ── 지리 정보 알려진 연결 (수작업 정의, 역사적 근거) ──
const CONNECTIONS = [
  // 북방
  { from: 'youzhou', to: 'jizhou', type: 'land', strategic: true },
  { from: 'jizhou', to: 'bingzhou', type: 'land', strategic: false },
  { from: 'jizhou', to: 'yanzhou', type: 'land', strategic: true },
  { from: 'jizhou', to: 'ye', type: 'land', strategic: true },
  { from: 'ye', to: 'yanzhou', type: 'land', strategic: true },

  // 중원
  { from: 'yanzhou', to: 'xuzhou', type: 'land', strategic: true },
  { from: 'yanzhou', to: 'yuzhou', type: 'land', strategic: true },
  { from: 'yanzhou', to: 'xuchang', type: 'land', strategic: true },
  { from: 'xuchang', to: 'yuzhou', type: 'land', strategic: true },
  { from: 'xuchang', to: 'luoyang', type: 'land', strategic: true },
  { from: 'luoyang', to: 'changan', type: 'land', strategic: true },
  { from: 'luoyang', to: 'yanzhou', type: 'land', strategic: true },
  { from: 'changan', to: 'yongzhou', type: 'land', strategic: true },

  // 형주 축
  { from: 'yuzhou', to: 'jingzhou', type: 'land', strategic: true },
  { from: 'jingzhou', to: 'yangzhou', type: 'river', strategic: true },
  { from: 'jingzhou', to: 'yizhou', type: 'land', strategic: true },
  { from: 'jingzhou', to: 'jiaozhou', type: 'land', strategic: false },

  // 동부
  { from: 'xuzhou', to: 'yangzhou', type: 'land', strategic: true },
  { from: 'yangzhou', to: 'jianye', type: 'river', strategic: true },

  // 서부/촉
  { from: 'yizhou', to: 'chengdu', type: 'land', strategic: true },
  { from: 'yizhou', to: 'hanzhong', type: 'land', strategic: true },
  { from: 'hanzhong', to: 'changan', type: 'land', strategic: true },
  { from: 'hanzhong', to: 'yongzhou', type: 'land', strategic: true },

  // 강동
  { from: 'jianye', to: 'yangzhou', type: 'river', strategic: true },
];

// ── 초기 세력 영토 (190년 기준) ──
const INITIAL_TERRITORIES = {
  'dong_zhuo': ['luoyang', 'changan'],
  'yuan_shao': ['jizhou', 'ye'],
  'yuan_shu': ['yuzhou'],
  'cao_cao': ['yanzhou', 'xuchang'],
  'liu_biao': ['jingzhou'],
  'liu_yan': ['yizhou', 'chengdu'],
  'sun_jian': [],
  'gongsun_zan': ['youzhou'],
  'yellow_turbans': [],
  'later_han': ['luoyang'],
};

// ── 시나리오별 영토 ──
const SCENARIO_TERRITORIES = {
  '190_coalition': {
    year: 190,
    description: '반동탁 연합 (게임 시작 시나리오 1)',
    territories: { ...INITIAL_TERRITORIES },
  },
  '200_guandu': {
    year: 200,
    description: '관도대전 직전',
    territories: {
      'cao_cao': ['yanzhou', 'xuchang', 'yuzhou', 'xuzhou', 'luoyang'],
      'yuan_shao': ['jizhou', 'ye', 'youzhou', 'bingzhou'],
      'liu_biao': ['jingzhou'],
      'sun_ce': ['yangzhou', 'jianye'],
      'liu_zhang': ['yizhou', 'chengdu'],
      'liu_bei': [],
      'zhang_lu': ['hanzhong'],
    },
  },
  '208_red_cliffs': {
    year: 208,
    description: '적벽대전 직전',
    territories: {
      'cao_cao': ['yanzhou', 'xuchang', 'yuzhou', 'xuzhou', 'luoyang', 'ye', 'jizhou', 'youzhou', 'bingzhou', 'jingzhou'],
      'sun_quan': ['yangzhou', 'jianye'],
      'liu_bei': [],
      'liu_zhang': ['yizhou', 'chengdu'],
      'zhang_lu': ['hanzhong'],
    },
  },
  '220_three_kingdoms': {
    year: 220,
    description: '삼국 정립',
    territories: {
      'wei': ['yanzhou', 'xuchang', 'yuzhou', 'xuzhou', 'luoyang', 'ye', 'jizhou', 'youzhou', 'bingzhou', 'yongzhou', 'changan'],
      'shu': ['yizhou', 'chengdu', 'hanzhong'],
      'wu': ['yangzhou', 'jianye', 'jiaozhou'],
    },
  },
};

// ── 지리 파일 처리 ──
function processGeography() {
  const files = readdirSync(WORLD_DIR).filter(f => f.startsWith('geo-') && f.endsWith('.json'));
  const cities = [];

  for (const file of files) {
    const data = JSON.parse(readFileSync(join(WORLD_DIR, file), 'utf-8'));
    const id = file.replace('geo-', '').replace('.json', '');

    // sections에서 전략적 중요도 추출
    const strategicSection = (data.sections || []).find(s =>
      s.heading && (s.heading.includes('전략') || s.heading.includes('개요'))
    );
    const strategicText = strategicSection?.content?.substring(0, 500) || '';

    cities.push({
      id,
      name_kr: data.title_kr || id,
      category: data.category || 'geography',
      strategic_summary: strategicText.substring(0, 200),
      sections_count: (data.sections || []).length,
      source_url: data.namu_url || null,
    });
  }

  return cities;
}

// ── 세력 파일 처리 ──
function processFactions() {
  const files = readdirSync(WORLD_DIR).filter(f => f.startsWith('faction-') && f.endsWith('.json'));
  const factions = [];

  for (const file of files) {
    const data = JSON.parse(readFileSync(join(WORLD_DIR, file), 'utf-8'));
    const id = file.replace('faction-', '').replace('.json', '');

    // sections에서 핵심 정보 추출
    const overviewSection = (data.sections || []).find(s =>
      s.heading === '개요'
    );
    const overview = overviewSection?.content?.substring(0, 300) || '';

    // 연표 섹션
    const timelineSection = (data.sections || []).find(s =>
      s.heading === '연표' || s.heading?.includes('연표')
    );
    const timeline = timelineSection?.content?.substring(0, 200) || '';

    factions.push({
      id,
      name_kr: data.title_kr || id,
      category: data.category || 'faction',
      overview: overview.substring(0, 200),
      timeline_snippet: timeline.substring(0, 200),
      sections_count: (data.sections || []).length,
      source_url: data.namu_url || null,
    });
  }

  return factions;
}

// ── 메인 ──
function main() {
  console.log('\n🗺️  P5: 지리/영토 구조화 파이프라인\n');

  const cities = processGeography();
  console.log(`  도시 노드: ${cities.length}`);

  const factions = processFactions();
  console.log(`  세력 데이터: ${factions.length}`);

  console.log(`  연결 그래프: ${CONNECTIONS.length} edges`);
  console.log(`  시나리오: ${Object.keys(SCENARIO_TERRITORIES).length}`);

  // 저장
  writeFileSync(
    join(OUT, 'geography.json'),
    JSON.stringify({
      total_cities: cities.length,
      total_connections: CONNECTIONS.length,
      generated_at: new Date().toISOString(),
      cities,
      connections: CONNECTIONS,
      scenarios: SCENARIO_TERRITORIES,
    }, null, 2),
    'utf-8'
  );

  writeFileSync(
    join(OUT, 'factions.json'),
    JSON.stringify({
      total_factions: factions.length,
      generated_at: new Date().toISOString(),
      factions,
      initial_territories: INITIAL_TERRITORIES,
      scenarios: SCENARIO_TERRITORIES,
    }, null, 2),
    'utf-8'
  );

  console.log(`\n  ✅ geography.json (${cities.length} cities, ${CONNECTIONS.length} connections)`);
  console.log(`  ✅ factions.json (${factions.length} factions)\n`);
}

main();
