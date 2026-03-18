#!/usr/bin/env node
// integrate-geography-engine.js — geography-expanded.json → 208 시나리오 엔진 통합
// 좌표 동기화 + 루트 통합 + 지형 보너스 적용 + 도시 메타데이터 보강

import { readFileSync, writeFileSync } from 'fs';

const GEO_FILE = 'data/processed/geography-expanded.json';
const SCENARIO_FILE = 'engine/data/scenarios/208-red-cliffs.json';

const geo = JSON.parse(readFileSync(GEO_FILE, 'utf8'));
const scn = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8'));

// === 1. 좌표 동기화 ===
// geography-expanded.json의 좌표 → scenario cityPositions
let posUpdated = 0;
for (const city of geo.cities) {
  if (scn.cities[city.id]) {
    scn.cityPositions[city.id] = { x: city.position.x, y: city.position.y };
    posUpdated++;
  }
}
console.log(`좌표 동기화: ${posUpdated}개 도시`);

// === 2. 연결(routes) 동기화 ===
// geography routes → scenario connections
const newConnections = [];
const connSet = new Set();

for (const route of geo.routes) {
  // 양쪽 도시 모두 시나리오에 있어야
  if (!scn.cities[route.from] || !scn.cities[route.to]) continue;

  const key = [route.from, route.to].sort().join('|');
  if (!connSet.has(key)) {
    connSet.add(key);
    newConnections.push([route.from, route.to]);
  }
}

// 기존 연결 중 geography에 없는 것도 보존
for (const conn of scn.connections) {
  const key = [conn[0], conn[1]].sort().join('|');
  if (!connSet.has(key)) {
    connSet.add(key);
    newConnections.push(conn);
  }
}

scn.connections = newConnections;
console.log(`연결: ${newConnections.length}개 (기존 ${scn.connections?.length || 0})`);

// === 3. 지형 보너스 적용 ===
// geography terrain → scenario city naturalBonus
let terrainApplied = 0;
for (const city of geo.cities) {
  const scnCity = scn.cities[city.id];
  if (!scnCity) continue;

  const t = city.terrain;
  const bonuses = {};

  // 지형별 보너스를 multiplicator로 변환
  if (t.food > 0) bonuses.agriculture = 1 + t.food * 0.05;
  if (t.food < 0) bonuses.agriculture = 1 + t.food * 0.05; // 감소도 반영
  if (t.commerce > 0) bonuses.commerce = 1 + t.commerce * 0.05;
  if (t.commerce < 0) bonuses.commerce = 1 + t.commerce * 0.05;
  if (t.defense > 0) bonuses.defense_bonus = t.defense * 5; // 방어 가산치

  // 기존 naturalBonus와 병합
  scnCity.naturalBonus = { ...scnCity.naturalBonus, ...bonuses };

  // 지형 메타데이터 추가
  scnCity.terrain = {
    type: t.type,
    desc: t.desc,
  };

  // 전략적 중요도
  scnCity.strategic_importance = city.strategic_importance;

  // 다국어 이름
  if (city.name) {
    scnCity.name_cn = city.name.cn;
    scnCity.name_en = city.name.en;
    // scnCity.name은 기존 한글명 유지
  }

  // 역사적 전투 태그
  if (city.battles?.length) {
    scnCity.historical_battles = city.battles;
  }

  terrainApplied++;
}
console.log(`지형 보너스: ${terrainApplied}개 도시`);

// === 4. 루트 타입 메타데이터 ===
// connections에 루트 타입 정보 추가 (connectionTerrains)
if (!scn.connectionTerrains) scn.connectionTerrains = {};
let routeTyped = 0;
for (const route of geo.routes) {
  if (!scn.cities[route.from] || !scn.cities[route.to]) continue;
  const key = `${route.from}_${route.to}`;
  const keyRev = `${route.to}_${route.from}`;
  scn.connectionTerrains[key] = route.type || 'road';
  scn.connectionTerrains[keyRev] = route.type || 'road';
  routeTyped++;
}
console.log(`루트 타입: ${routeTyped}개`);

// === 5. 기지 자원 조정 ===
// geography base_resources → scenario 도시 초기 수치 보정
let resourceAdjusted = 0;
for (const city of geo.cities) {
  const scnCity = scn.cities[city.id];
  if (!scnCity || !city.base_resources) continue;

  const br = city.base_resources;

  // base_resources (1-10) → 게임 수치 스케일링
  // population: 1-10 → 20000-100000
  // food_potential → agriculture 기본치 영향 (1-10 → 40-90)
  // commerce_potential → commerce 기본치 (1-10 → 40-90)
  // defense_bonus → defense 가산 (0-10 → 0-30)

  // 기존 값이 너무 낮거나 높으면 조정
  const targetPop = 10000 + br.population * 10000;
  const targetAgri = 30 + br.food_potential * 6;
  const targetComm = 30 + br.commerce_potential * 6;

  // 기존 값과 타겟의 가중 평균 (기존 70%, 지리 30%)
  scnCity.population = Math.round(scnCity.population * 0.7 + targetPop * 0.3);
  scnCity.agriculture = Math.round(scnCity.agriculture * 0.7 + targetAgri * 0.3);
  scnCity.commerce = Math.round(scnCity.commerce * 0.7 + targetComm * 0.3);

  // 방어 가산
  if (br.defense_bonus > 0) {
    scnCity.defense = Math.min(100, scnCity.defense + br.defense_bonus * 2);
  }

  resourceAdjusted++;
}
console.log(`자원 조정: ${resourceAdjusted}개 도시`);

// === 저장 ===
writeFileSync(SCENARIO_FILE, JSON.stringify(scn, null, 2));
console.log(`\n→ ${SCENARIO_FILE} 저장 완료`);

// === 검증 ===
const totalCities = Object.keys(scn.cities).length;
const withTerrain = Object.values(scn.cities).filter(c => c.terrain).length;
const withBattles = Object.values(scn.cities).filter(c => c.historical_battles?.length).length;
const withCn = Object.values(scn.cities).filter(c => c.name_cn).length;

console.log(`\n=== 검증 ===`);
console.log(`도시: ${totalCities}개`);
console.log(`지형 정보: ${withTerrain}개`);
console.log(`역사 전투 태그: ${withBattles}개`);
console.log(`중문 이름: ${withCn}개`);
console.log(`연결: ${scn.connections.length}개`);
console.log(`루트 타입: ${Object.keys(scn.connectionTerrains).length}개`);
