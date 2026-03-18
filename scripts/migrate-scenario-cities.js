#!/usr/bin/env node
// migrate-scenario-cities.js — 208 시나리오 州급 도시 → 구체 도시 마이그레이션
// 기존 26도시 → ~42도시 (expanded geography 기반)

import { readFileSync, writeFileSync } from 'fs';

const geo = JSON.parse(readFileSync('data/processed/geography-expanded.json', 'utf8'));
const scn = JSON.parse(readFileSync('engine/data/scenarios/208-red-cliffs.json', 'utf8'));

// === 州급 → 대표 도시 매핑 ===
// 기존 州급 도시의 자원/병력을 대표 도시에 이전하고, 나머지 새 도시로 분산
const migrations = {
  // yanzhou → chenliu (조조 거병지) + puyang (전장)
  yanzhou: {
    primary: 'chenliu',
    split: [
      { id:'puyang', owner:'wei', popRatio:0.35, armyRatio:0.3 },
    ],
  },
  // yuzhou → runan (여남, 이미 xuchang 있으므로 나머지)
  yuzhou: {
    primary: 'runan',
    split: [],
  },
  // xuzhou → xiapi (수도) + guangling + xiaopei
  xuzhou: {
    primary: 'xiapi',
    split: [
      { id:'guangling', owner:'wei', popRatio:0.3, armyRatio:0.25 },
      { id:'xiaopei', owner:'wei', popRatio:0.2, armyRatio:0.15 },
    ],
  },
  // jizhou → nanpi (업은 이미 있음)
  jizhou: {
    primary: 'nanpi',
    split: [],
  },
  // youzhou → ji (유주 수도) + liaodong (공손씨, 반독립)
  youzhou: {
    primary: 'ji',
    split: [
      { id:'liaodong', owner:'wei', popRatio:0.35, armyRatio:0.4 },
    ],
  },
  // bingzhou → jinyang (병주 수도)
  bingzhou: {
    primary: 'jinyang',
    split: [],
  },
  // jingzhou → jiangling (이미 xiangyang/changsha/wuling/nanyang 있음)
  jingzhou: {
    primary: 'jiangling',
    split: [
      { id:'jiangxia', owner:'wu', popRatio:0.25, armyRatio:0.2 }, // 208년 적벽 후 오 영역
      { id:'xinye', owner:'shu', popRatio:0.1, armyRatio:0.05 },
    ],
  },
  // yangzhou → shouchun (북양주, 이미 jianye/lujiang/kuaiji 있음)
  yangzhou: {
    primary: 'shouchun',
    split: [
      { id:'wuchang', owner:'wu', popRatio:0.35, armyRatio:0.3 },
    ],
  },
  // yizhou → jiameng (이미 chengdu/hanzhong 있음) + 남중
  yizhou: {
    primary: 'jiameng',
    split: [
      { id:'jianning', owner:'liu_zhang', popRatio:0.25, armyRatio:0.2 },
      { id:'yongchang', owner:'liu_zhang', popRatio:0.15, armyRatio:0.1 },
    ],
  },
  // yongzhou → longxi (이미 changan/tianshui 있음)
  yongzhou: {
    primary: 'longxi',
    split: [
      { id:'wuwei', owner:'wei', popRatio:0.4, armyRatio:0.3 },
    ],
  },
  // jiaozhou → panyu
  jiaozhou: {
    primary: 'panyu',
    split: [],
  },
  // qingzhou → pingyuan + beihai
  qingzhou: {
    primary: 'pingyuan',
    split: [
      { id:'beihai', owner:'wei', popRatio:0.4, armyRatio:0.35 },
    ],
  },
  // nanyang → wan (완성, 남양의 구체 도시명)
  nanyang: {
    primary: 'wan',
    split: [],
  },
  // wuling은 그대로 유지 (형남 4군 중 하나)
};

// === 관문/전략 거점 추가 ===
const fortresses = [
  { id:'hulao', owner:'wei', population:3000, army:5000, morale:80, food:1000, commerce:500 },
  { id:'tongguan', owner:'wei', population:2000, army:8000, morale:85, food:800, commerce:300 },
  { id:'jiange', owner:'liu_zhang', population:2000, army:6000, morale:75, food:600, commerce:200 },
  { id:'yangpingguan', owner:'zhang_lu', population:1500, army:4000, morale:70, food:500, commerce:200 },
  { id:'shangyong', owner:'liu_zhang', population:8000, army:3000, morale:60, food:2000, commerce:1000 },
  { id:'baidi', owner:'liu_zhang', population:5000, army:2000, morale:65, food:1500, commerce:800 },
];

// === geo에서 도시명 가져오기 ===
const geoMap = {};
geo.cities.forEach(c => geoMap[c.id] = c);

// === 마이그레이션 실행 ===
const newCities = { ...scn.cities };
let migratedCount = 0;

for (const [oldId, migration] of Object.entries(migrations)) {
  const oldCity = newCities[oldId];
  if (!oldCity) {
    console.log(`SKIP: ${oldId} not in scenario`);
    continue;
  }

  // 1. primary 도시 생성 (기존 자원 대부분 이전)
  const splitTotal = migration.split.reduce((s, sp) => ({
    pop: s.pop + sp.popRatio,
    army: s.army + sp.armyRatio,
  }), { pop: 0, army: 0 });

  const primaryRatio = { pop: 1 - splitTotal.pop, army: 1 - splitTotal.army };
  const geoInfo = geoMap[migration.primary];

  newCities[migration.primary] = {
    name: geoInfo?.name?.kr || migration.primary,
    owner: oldCity.owner,
    population: Math.round(oldCity.population * primaryRatio.pop),
    army: Math.round(oldCity.army * primaryRatio.army),
    morale: oldCity.morale || 70,
    food: Math.round((oldCity.food || 5000) * primaryRatio.pop),
    commerce: Math.round((oldCity.commerce || 3000) * primaryRatio.pop),
  };

  // 2. split 도시 생성
  for (const sp of migration.split) {
    const spGeo = geoMap[sp.id];
    newCities[sp.id] = {
      name: spGeo?.name?.kr || sp.id,
      owner: sp.owner,
      population: Math.round(oldCity.population * sp.popRatio),
      army: Math.round(oldCity.army * sp.armyRatio),
      morale: oldCity.morale ? Math.max(50, oldCity.morale - 5) : 65,
      food: Math.round((oldCity.food || 5000) * sp.popRatio),
      commerce: Math.round((oldCity.commerce || 3000) * sp.popRatio),
    };
  }

  // 3. 기존 州급 도시 삭제
  delete newCities[oldId];
  migratedCount++;
  console.log(`${oldId} → ${migration.primary}${migration.split.length ? ' + ' + migration.split.map(s=>s.id).join(', ') : ''}`);
}

// === 관문 추가 ===
for (const fort of fortresses) {
  if (!newCities[fort.id]) {
    newCities[fort.id] = {
      name: geoMap[fort.id]?.name?.kr || fort.id,
      owner: fort.owner,
      population: fort.population,
      army: fort.army,
      morale: fort.morale,
      food: fort.food,
      commerce: fort.commerce,
    };
    console.log(`ADD fortress: ${fort.id} (${fort.owner})`);
  }
}

// === 캐릭터 도시 매핑 업데이트 ===
// 州급 도시에 배치된 캐릭터를 대표 도시로 이동
const cityRemap = {};
for (const [oldId, migration] of Object.entries(migrations)) {
  cityRemap[oldId] = migration.primary;
}

let charMoved = 0;
for (const [charId, char] of Object.entries(scn.characters)) {
  if (char.city && cityRemap[char.city]) {
    const oldCity = char.city;
    char.city = cityRemap[char.city];
    charMoved++;
  }
}

// 방랑자도 체크
if (scn.wanderers) {
  for (const w of scn.wanderers) {
    if (w.city && cityRemap[w.city]) {
      w.city = cityRemap[w.city];
      charMoved++;
    }
  }
}

// === 저장 ===
scn.cities = newCities;
writeFileSync('engine/data/scenarios/208-red-cliffs.json', JSON.stringify(scn, null, 2));

console.log(`\n=== 결과 ===`);
console.log(`마이그레이션: ${migratedCount}개 州 → 구체 도시`);
console.log(`총 도시: ${Object.keys(newCities).length}개`);
console.log(`캐릭터 재배치: ${charMoved}명`);

// 세력별 도시 수
const factionCities = {};
for (const [id, c] of Object.entries(newCities)) {
  factionCities[c.owner] = (factionCities[c.owner] || 0) + 1;
}
console.log('세력별 도시:', JSON.stringify(factionCities));
