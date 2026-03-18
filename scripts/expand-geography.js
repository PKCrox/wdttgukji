#!/usr/bin/env node
// expand-geography.js — 18도시→42도시 확장 + 루트/지형/전략가치
// 기존 raw geo 데이터에서 하위 도시 추출 + 게임용 구조화

import { readFileSync, writeFileSync } from 'fs';

// === 42도시 마스터 정의 ===
// 좌표: 게임 맵 좌표 (0-1000), 대략적 역사 지리 반영
// terrain: plains/mountain/river/forest/marsh/desert/coastal
// strategic: 1-10 전략 중요도

const cities = [
  // ── 중원 (Central Plains) ──
  { id:'luoyang', name_kr:'낙양', name_cn:'洛陽', name_en:'Luoyang',
    x:480, y:380, province:'sili', terrain:'plains',
    strategic:10, desc:'후한 수도, 천하의 중심', pop:8, food:7, commerce:9 },
  { id:'xuchang', name_kr:'허창', name_cn:'許昌', name_en:'Xuchang',
    x:520, y:420, province:'yuzhou', terrain:'plains',
    strategic:9, desc:'조조의 수도, 헌제 거처', pop:7, food:8, commerce:7 },
  { id:'ye', name_kr:'업', name_cn:'鄴', name_en:'Ye',
    x:510, y:290, province:'jizhou', terrain:'plains',
    strategic:8, desc:'원소→조조의 북방 거점', pop:7, food:7, commerce:6 },
  { id:'chenliu', name_kr:'진류', name_cn:'陳留', name_en:'Chenliu',
    x:530, y:370, province:'yanzhou', terrain:'plains',
    strategic:6, desc:'조조 거병지, 연주 요충', pop:5, food:7, commerce:5 },
  { id:'puyang', name_kr:'복양', name_cn:'濮陽', name_en:'Puyang',
    x:540, y:330, province:'yanzhou', terrain:'plains',
    strategic:5, desc:'연주 전장, 조조vs여포 격전지', pop:4, food:6, commerce:4 },
  { id:'runan', name_kr:'여남', name_cn:'汝南', name_en:'Runan',
    x:540, y:450, province:'yuzhou', terrain:'plains',
    strategic:5, desc:'유비 잠시 거점, 황건적 출몰지', pop:5, food:7, commerce:4 },

  // ── 관중 (Guanzhong / West) ──
  { id:'changan', name_kr:'장안', name_cn:'長安', name_en:"Chang'an",
    x:330, y:370, province:'yongzhou', terrain:'plains',
    strategic:9, desc:'서한 수도, 동탁 천도지', pop:7, food:6, commerce:7 },
  { id:'tianshui', name_kr:'천수', name_cn:'天水', name_en:'Tianshui',
    x:240, y:350, province:'yongzhou', terrain:'mountain',
    strategic:7, desc:'강유 고향, 제갈량 북벌 목표', pop:4, food:4, commerce:3 },
  { id:'longxi', name_kr:'농서', name_cn:'隴西', name_en:'Longxi',
    x:200, y:330, province:'yongzhou', terrain:'mountain',
    strategic:6, desc:'서쪽 관문, 강족 접경', pop:3, food:3, commerce:2 },
  { id:'wuwei', name_kr:'무위', name_cn:'武威', name_en:'Wuwei',
    x:150, y:280, province:'liangzhou', terrain:'desert',
    strategic:6, desc:'마등/마초 거점, 실크로드 요충', pop:3, food:2, commerce:5 },

  // ── 하북 (Hebei / North) ──
  { id:'nanpi', name_kr:'남피', name_cn:'南皮', name_en:'Nanpi',
    x:560, y:270, province:'jizhou', terrain:'plains',
    strategic:4, desc:'원소 보조 거점', pop:4, food:5, commerce:3 },
  { id:'ji', name_kr:'계', name_cn:'薊', name_en:'Ji',
    x:560, y:200, province:'youzhou', terrain:'plains',
    strategic:7, desc:'유주 수도, 공손찬/유우 거점', pop:5, food:4, commerce:5 },
  { id:'liaodong', name_kr:'요동', name_cn:'遼東', name_en:'Liaodong',
    x:680, y:150, province:'youzhou', terrain:'forest',
    strategic:5, desc:'공손도 독립 세력, 변경', pop:3, food:3, commerce:3 },
  { id:'jinyang', name_kr:'진양', name_cn:'晉陽', name_en:'Jinyang',
    x:430, y:260, province:'bingzhou', terrain:'mountain',
    strategic:6, desc:'병주 수도, 북방 방어선', pop:4, food:4, commerce:3 },
  { id:'pingyuan', name_kr:'평원', name_cn:'平原', name_en:'Pingyuan',
    x:570, y:310, province:'qingzhou', terrain:'plains',
    strategic:4, desc:'유비 초기 거점, 청주 접경', pop:4, food:6, commerce:3 },
  { id:'beihai', name_kr:'북해', name_cn:'北海', name_en:'Beihai',
    x:620, y:320, province:'qingzhou', terrain:'coastal',
    strategic:4, desc:'공융 거점, 동부 해안', pop:4, food:5, commerce:4 },

  // ── 서주 (Xuzhou) ──
  { id:'xiapi', name_kr:'하비', name_cn:'下邳', name_en:'Xiapi',
    x:590, y:400, province:'xuzhou', terrain:'river',
    strategic:7, desc:'서주 수도, 여포 최후의 거점', pop:5, food:6, commerce:5 },
  { id:'guangling', name_kr:'광릉', name_cn:'廣陵', name_en:'Guangling',
    x:610, y:430, province:'xuzhou', terrain:'river',
    strategic:5, desc:'동부 서주, 회남 접경', pop:4, food:5, commerce:5 },
  { id:'xiaopei', name_kr:'소패', name_cn:'小沛', name_en:'Xiaopei',
    x:570, y:390, province:'xuzhou', terrain:'plains',
    strategic:4, desc:'유비 초기 거점', pop:3, food:5, commerce:3 },

  // ── 형주 (Jingzhou) ──
  { id:'xiangyang', name_kr:'양양', name_cn:'襄陽', name_en:'Xiangyang',
    x:440, y:460, province:'jingzhou', terrain:'river',
    strategic:9, desc:'형주 수도, 유표 거점, 천하 요충', pop:7, food:7, commerce:7 },
  { id:'jiangling', name_kr:'강릉', name_cn:'江陵', name_en:'Jiangling',
    x:420, y:510, province:'jingzhou', terrain:'river',
    strategic:8, desc:'형주 남부 수도, 장강 요충', pop:6, food:7, commerce:6 },
  { id:'wan', name_kr:'완', name_cn:'宛', name_en:'Wan',
    x:470, y:440, province:'jingzhou', terrain:'plains',
    strategic:6, desc:'남양, 장수 거점, 제갈량 수학지', pop:5, food:7, commerce:5 },
  { id:'changsha', name_kr:'장사', name_cn:'長沙', name_en:'Changsha',
    x:440, y:580, province:'jingzhou', terrain:'river',
    strategic:5, desc:'형남 4군 맹주, 황충 거점', pop:5, food:6, commerce:5 },
  { id:'jiangxia', name_kr:'강하', name_cn:'江夏', name_en:'Jiangxia',
    x:490, y:490, province:'jingzhou', terrain:'river',
    strategic:7, desc:'형주 동부, 유기→손권, 현 우한', pop:5, food:5, commerce:6 },
  { id:'xinye', name_kr:'신야', name_cn:'新野', name_en:'Xinye',
    x:460, y:450, province:'jingzhou', terrain:'plains',
    strategic:4, desc:'유비 형주 초기 거점', pop:3, food:5, commerce:3 },
  { id:'shangyong', name_kr:'상용', name_cn:'上庸', name_en:'Shangyong',
    x:380, y:430, province:'jingzhou', terrain:'mountain',
    strategic:5, desc:'유봉/맹달 거점, 한중↔형주 연결', pop:2, food:3, commerce:2 },

  // ── 양주 (Yangzhou / Southeast) ──
  { id:'shouchun', name_kr:'수춘', name_cn:'壽春', name_en:'Shouchun',
    x:560, y:460, province:'yangzhou', terrain:'river',
    strategic:7, desc:'양주 북부 수도, 원술 거점', pop:5, food:6, commerce:5 },
  { id:'lujiang', name_kr:'여강', name_cn:'廬江', name_en:'Lujiang',
    x:560, y:490, province:'yangzhou', terrain:'river',
    strategic:5, desc:'강북 양주, 수군 거점', pop:4, food:5, commerce:4 },
  { id:'wuchang', name_kr:'무창', name_cn:'武昌', name_en:'Wuchang',
    x:510, y:510, province:'yangzhou', terrain:'river',
    strategic:7, desc:'손권 임시 수도, 장강 방어선', pop:5, food:5, commerce:6 },
  { id:'jianye', name_kr:'건업', name_cn:'建業', name_en:'Jianye',
    x:590, y:480, province:'yangzhou', terrain:'river',
    strategic:9, desc:'오나라 수도, 현 남경', pop:7, food:6, commerce:8 },
  { id:'kuaiji', name_kr:'회계', name_cn:'會稽', name_en:'Kuaiji',
    x:640, y:510, province:'yangzhou', terrain:'coastal',
    strategic:4, desc:'강동 남부, 후방 생산기지', pop:4, food:5, commerce:4 },

  // ── 익주 (Yizhou / Southwest) ──
  { id:'chengdu', name_kr:'성도', name_cn:'成都', name_en:'Chengdu',
    x:260, y:500, province:'yizhou', terrain:'plains',
    strategic:9, desc:'촉한 수도, 천부지국', pop:7, food:9, commerce:7 },
  { id:'hanzhong', name_kr:'한중', name_cn:'漢中', name_en:'Hanzhong',
    x:320, y:420, province:'yizhou', terrain:'mountain',
    strategic:9, desc:'촉한 북방 관문, 유비 왕호 선포', pop:5, food:6, commerce:4 },
  { id:'jiameng', name_kr:'검맹관', name_cn:'葭萌關', name_en:'Jiamengguan',
    x:290, y:450, province:'yizhou', terrain:'mountain',
    strategic:6, desc:'익주 입구, 유비 입촉 거점', pop:2, food:3, commerce:2 },
  { id:'jianning', name_kr:'건녕', name_cn:'建寧', name_en:'Jianning',
    x:260, y:600, province:'yizhou', terrain:'forest',
    strategic:5, desc:'남중 수도, 맹획 토벌전', pop:3, food:4, commerce:2 },
  { id:'yongchang', name_kr:'영창', name_cn:'永昌', name_en:'Yongchang',
    x:200, y:620, province:'yizhou', terrain:'forest',
    strategic:3, desc:'익주 최남단, 남만 접경', pop:2, food:3, commerce:2 },
  { id:'baidi', name_kr:'백제성', name_cn:'白帝城', name_en:'Baidi',
    x:330, y:490, province:'yizhou', terrain:'mountain',
    strategic:6, desc:'유비 임종지, 익주 동쪽 관문', pop:2, food:3, commerce:2 },

  // ── 교주 (Jiaozhou / Far South) ──
  { id:'panyu', name_kr:'번우', name_cn:'番禺', name_en:'Panyu',
    x:420, y:680, province:'jiaozhou', terrain:'coastal',
    strategic:3, desc:'교주 수도, 사섭 거점, 현 광저우', pop:3, food:4, commerce:4 },

  // ── 전략 거점 (Passes & Fortresses) ──
  { id:'hulao', name_kr:'호뢰관', name_cn:'虎牢關', name_en:'Hulao Pass',
    x:490, y:370, province:'sili', terrain:'mountain',
    strategic:7, desc:'낙양 동쪽 관문, 삼영전여포', pop:1, food:1, commerce:1 },
  { id:'tongguan', name_kr:'동관', name_cn:'潼關', name_en:'Tong Pass',
    x:400, y:370, province:'sili', terrain:'mountain',
    strategic:8, desc:'관중 동쪽 관문, 마초vs조조 격전', pop:1, food:1, commerce:1 },
  { id:'jiange', name_kr:'검각', name_cn:'劍閣', name_en:'Jiange',
    x:280, y:460, province:'yizhou', terrain:'mountain',
    strategic:8, desc:'촉한 최후 방어선, 강유vs종회', pop:1, food:1, commerce:1 },
  { id:'yangpingguan', name_kr:'양평관', name_cn:'陽平關', name_en:'Yangping Pass',
    x:300, y:430, province:'yizhou', terrain:'mountain',
    strategic:7, desc:'한중 입구, 장로 거점', pop:1, food:2, commerce:1 },
];

// === 도시 간 루트 정의 ===
// [cityA, cityB, distance(1-10), type(road/river/mountain_pass)]
const routes = [
  // 중원 내부
  ['luoyang','xuchang',3,'road'], ['luoyang','chenliu',3,'road'],
  ['luoyang','hulao',1,'mountain_pass'], ['hulao','chenliu',2,'road'],
  ['xuchang','chenliu',2,'road'], ['xuchang','runan',2,'road'],
  ['chenliu','puyang',2,'road'], ['puyang','ye',3,'road'],

  // 관중
  ['luoyang','tongguan',3,'mountain_pass'], ['tongguan','changan',2,'road'],
  ['changan','tianshui',4,'road'], ['tianshui','longxi',2,'road'],
  ['longxi','wuwei',4,'desert_road'],

  // 하북
  ['ye','nanpi',3,'road'], ['nanpi','ji',4,'road'],
  ['ji','liaodong',6,'road'], ['ye','jinyang',4,'mountain_pass'],
  ['nanpi','pingyuan',2,'road'], ['pingyuan','beihai',3,'road'],
  ['puyang','pingyuan',2,'road'],

  // 서주
  ['chenliu','xiapi',4,'road'], ['xiapi','guangling',3,'road'],
  ['xiapi','xiaopei',1,'road'], ['guangling','shouchun',3,'road'],
  ['runan','xiapi',4,'road'], ['xiaopei','pingyuan',4,'road'],

  // 형주
  ['xuchang','wan',3,'road'], ['wan','xiangyang',2,'road'],
  ['wan','xinye',1,'road'], ['xinye','xiangyang',1,'road'],
  ['xiangyang','jiangling',2,'river'], ['jiangling','changsha',3,'river'],
  ['jiangxia','xiangyang',3,'river'], ['jiangxia','jiangling',3,'river'],
  ['shangyong','xiangyang',3,'mountain_pass'],
  ['changsha','panyu',5,'road'],

  // 양주
  ['shouchun','lujiang',2,'road'], ['lujiang','wuchang',3,'river'],
  ['shouchun','runan',3,'road'], ['lujiang','jianye',3,'river'],
  ['wuchang','jiangxia',2,'river'], ['jianye','kuaiji',3,'road'],
  ['guangling','jianye',3,'river'],

  // 익주
  ['hanzhong','yangpingguan',1,'mountain_pass'],
  ['yangpingguan','changan',4,'mountain_pass'],
  ['hanzhong','jiameng',2,'mountain_pass'], ['jiameng','chengdu',3,'road'],
  ['chengdu','baidi',4,'river'], ['baidi','jiangling',3,'river'],
  ['chengdu','jianning',4,'road'], ['jianning','yongchang',3,'road'],
  ['shangyong','hanzhong',3,'mountain_pass'],
  ['chengdu','jiange',2,'mountain_pass'], ['jiange','hanzhong',2,'mountain_pass'],
  ['tianshui','hanzhong',4,'mountain_pass'],

  // 교주
  ['panyu','jianning',5,'road'], ['panyu','changsha',5,'road'],
];

// === 주요 전투 위치 매핑 ===
const battleSites = [
  { city:'xiangyang', battles:['형주 공방전','양양 포위전'] },
  { city:'jiangling', battles:['적벽대전 후 강릉 쟁탈'] },
  { city:'luoyang', battles:['낙양 함락','동탁 토벌'] },
  { city:'hulao', battles:['호뢰관 전투','삼영전여포'] },
  { city:'tongguan', battles:['동관 전투','마초vs조조'] },
  { city:'ye', battles:['업성 공방전'] },
  { city:'xiapi', battles:['하비 전투','여포 포위전'] },
  { city:'puyang', battles:['복양 전투','조조vs여포'] },
  { city:'hanzhong', battles:['한중 쟁탈전','정군산 전투'] },
  { city:'jiange', battles:['검각 방어전','강유vs종회'] },
  { city:'shouchun', battles:['수춘 전투','제갈탄의 난'] },
  { city:'tianshui', battles:['천수 전투','제갈량 1차 북벌'] },
  { city:'baidi', battles:['이릉 전투 후 유비 퇴각'] },
  { city:'wuchang', battles:['무창 천도'] },
  { city:'ji', battles:['공손찬vs원소'] },
  { city:'changan', battles:['장안 함락','이각곽사의 난'] },
  { city:'wan', battles:['완성 전투','장수vs조조'] },
  { city:'changsha', battles:['장사 공략','황충 귀순'] },
  { id:'guangling', battles:['광릉 침공'] },
  { city:'jiameng', battles:['유비 입촉','검맹관 대치'] },
];

// === 지형 보너스 정의 ===
const terrainBonuses = {
  plains:    { food:2, commerce:1, defense:0, desc:'평야 — 식량 풍부, 방어 취약' },
  mountain:  { food:-1, commerce:-1, defense:3, desc:'산지 — 방어 유리, 경제 약세' },
  river:     { food:1, commerce:2, defense:1, desc:'수변 — 수운 + 식량, 수군 필요' },
  forest:    { food:1, commerce:-1, defense:2, desc:'삼림 — 매복 유리, 교역 불편' },
  marsh:     { food:0, commerce:-1, defense:2, desc:'습지 — 기동 불리, 방어 유리' },
  desert:    { food:-2, commerce:1, defense:1, desc:'사막 — 식량 부족, 실크로드' },
  coastal:   { food:1, commerce:3, defense:0, desc:'해안 — 교역 활발, 해적 위험' },
  mountain_pass: { food:-2, commerce:-2, defense:5, desc:'관문 — 최고 방어, 경제 없음' },
};

// === raw 데이터에서 전략 요약 추출 ===
function extractStrategicSummary(cityId) {
  const geoFiles = [
    `data/raw/world/geo-${cityId}.json`,
    // 주 파일에서 하위 도시 찾기
  ];
  for (const f of geoFiles) {
    try {
      const data = JSON.parse(readFileSync(f, 'utf8'));
      // 전략적 중요성 섹션 우선
      const strategicSection = data.sections?.find(s =>
        s.heading?.includes('전략') || s.heading?.includes('중요')
      );
      if (strategicSection?.content) {
        return strategicSection.content.slice(0, 500);
      }
      // 역사 섹션 fallback
      const histSection = data.sections?.find(s => s.heading === '역사');
      if (histSection?.content) {
        return histSection.content.slice(0, 500);
      }
      // 개요 fallback
      const overview = data.sections?.find(s => s.heading === '개요');
      if (overview?.content) {
        return overview.content.slice(0, 500);
      }
    } catch {}
  }
  return null;
}

// === 하위 도시 raw 데이터 매핑 ===
// 주 파일에서 하위 도시 설명 추출
function extractSubCitySummary(provinceId, subcityName) {
  try {
    const data = JSON.parse(readFileSync(`data/raw/world/geo-${provinceId}.json`, 'utf8'));
    const section = data.sections?.find(s => s.heading?.includes(subcityName));
    if (section?.content) return section.content.slice(0, 500);
  } catch {}
  return null;
}

// === 빌드 ===
const enrichedCities = cities.map(c => {
  const bonus = terrainBonuses[c.terrain] || terrainBonuses.plains;
  const battles = battleSites.find(b => b.city === c.id);

  // raw 데이터에서 요약 추출 시도
  let rawSummary = extractStrategicSummary(c.id);
  if (!rawSummary && c.province) {
    rawSummary = extractSubCitySummary(c.province.replace('zhou','zhou'), c.name_kr);
  }

  return {
    id: c.id,
    name: { kr: c.name_kr, cn: c.name_cn, en: c.name_en },
    position: { x: c.x, y: c.y },
    province: c.province,
    terrain: {
      type: c.terrain,
      ...bonus,
    },
    strategic_importance: c.strategic,
    description: c.desc,
    base_resources: {
      population: c.pop,
      food_potential: c.food + bonus.food,
      commerce_potential: c.commerce + bonus.commerce,
      defense_bonus: bonus.defense,
    },
    battles: battles?.battles || [],
    raw_summary: rawSummary || null,
  };
});

const enrichedRoutes = routes.map(([a, b, dist, type]) => ({
  from: a, to: b,
  distance: dist,
  type,
  bidirectional: true,
}));

const output = {
  total_cities: enrichedCities.length,
  total_routes: enrichedRoutes.length,
  terrain_types: terrainBonuses,
  generated_at: new Date().toISOString(),
  cities: enrichedCities,
  routes: enrichedRoutes,
};

writeFileSync('data/processed/geography-expanded.json', JSON.stringify(output, null, 2));

console.log(`Cities: ${output.total_cities}`);
console.log(`Routes: ${output.total_routes}`);
console.log(`Terrain types: ${Object.keys(terrainBonuses).length}`);
console.log(`With raw summary: ${enrichedCities.filter(c=>c.raw_summary).length}`);
console.log(`With battles: ${enrichedCities.filter(c=>c.battles.length).length}`);
console.log('→ data/processed/geography-expanded.json');
