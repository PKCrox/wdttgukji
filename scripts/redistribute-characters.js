#!/usr/bin/env node
// redistribute-characters.js — 무인도시에 역사적 배치 기반 캐릭터 재분배
// + 새 도시 주둔 NPC 추가

import { readFileSync, writeFileSync } from 'fs';

const scn = JSON.parse(readFileSync('engine/data/scenarios/208-red-cliffs.json', 'utf8'));

// === 역사적 캐릭터 재배치 ===
// 마이그레이션으로 강릉에 몰린 형주 캐릭터를 올바른 도시로 분산
// 조조 세력 분산도 포함

const reassignments = {
  // ── 형주 (shu) 분산: jiangling → 각 도시 ──
  'guan_yu':     'xiangyang',   // 관우 — 양양/번성 수비
  'guan_ping':   'xiangyang',   // 관평 — 관우 수행
  'zhou_cang':   'xiangyang',   // 주창 — 관우 호위
  'mi_fang':     'jiangling',   // 미방 — 강릉 수비 (역사적으로 배신)
  'liu_feng':    'xinye',       // 유봉 — 신야 방면
  'ma_liang':    'changsha',    // 마량 — 장사 출신
  'huang_zhong': 'changsha',    // 황충 — 장사 태수 산하
  'wei_yan':     'changsha',    // 위연 — 장사 귀순
  'liao_hua':    'jiangling',   // 요화 — 형주 본대
  'yi_ji':       'wuling',      // 이적 — 무릉 출신 (있다면)

  // ── 조위 분산 ──
  'cao_ren':     'wan',         // 조인 — 완성 수비
  'man_chong':   'wan',         // 만총 — 완성
  'xiahou_dun':  'luoyang',     // 하후돈 — 낙양 수비
  'xu_huang':    'luoyang',     // 서황 — 낙양 방면
  'zhang_liao':  'hefei',       // 장료 — 합비... 합비가 없으니 shouchun이 가까움
  'li_dian':     'puyang',      // 이전 — 복양
  'yue_jin':     'puyang',      // 악진 — 복양
  'xiahou_yuan': 'changan',     // 하후연 — 서쪽 방면
  'zhang_he':    'ye',          // 장합 — 업성
  'xu_chu':      'xuchang',     // 허저 — 허창 호위
  'cao_hong':    'chenliu',     // 조홍 — 진류
  'cheng_yu':    'chenliu',     // 정욱 — 진류 (연주 모사)
  'liu_ye':      'runan',       // 유엽 — 여남
  'wen_pin':     'jiangxia',    // 문빈 — 강하 (위 소속 208 이후)

  // ── 조위 북방 ──
  'tian_yu':     'ji',          // 전예 — 유주
  'gongsun_du':  'liaodong',    // 공손도 — 요동
  'han_hao':     'jinyang',     // 한호 — 병주
  'liang_xi':    'longxi',      // 양습 — 농서
  'ma_teng':     'wuwei',       // 마등 — 무위 (208 실제론 입조)
  'kong_rong':   'beihai',      // 공융 — 북해 (이미 사망이지만 시나리오용)
  'liu_bei_gen': 'pingyuan',    // 평원 — 빈 도시 채우기

  // ── 오 분산 ──
  'zhou_tai':    'wuchang',     // 주태 — 무창
  'cheng_pu':    'wuchang',     // 정보 — 무창
  'lu_su':       'jiangxia',    // 노숙 — 강하 방면
  'ling_tong':   'kuaiji',      // 능통 — 회계
  'han_dang':    'shouchun',    // 한당 — 수춘 방면

  // ── 유장 분산 ──
  'yan_yan':     'baidi',       // 엄안 — 백제성 수비
  'zhang_ren':   'jiange',      // 장임 — 검각 방면
  'wang_lei':    'jianning',    // 왕루 — 건녕
  'gao_ding':    'jianning',    // 고정 — 남중
  'li_yan':      'shangyong',   // 이엄 — 상용 방면
  'fei_guan':    'jiameng',     // 비관 — 검맹관

  // ── 장로 ──
  'yang_song':   'yangpingguan', // 양송 — 양평관
};

// 실행
let moved = 0;
for (const [charId, newCity] of Object.entries(reassignments)) {
  const char = scn.characters[charId];
  if (char && scn.cities[newCity]) {
    const oldCity = char.city;
    char.city = newCity;
    moved++;
  }
}

// === 관문/요새에 주둔군 NPC 추가 ===
// 무인 도시에 기본 태수/장수 추가 (soul.md 없어도 시나리오에서 활동)
const garrisonNpcs = [
  // 무인 도시에 역사적 인물 추가 (이미 시나리오에 없는 인물)
  { id:'cao_xiu', name:'조휴', city:'guangling', faction:'wei', stats:{command:72,war:68,intellect:65,politics:58,charisma:60}, loyalty:85 },
  { id:'niu_jin', name:'우금', city:'xiaopei', faction:'wei', stats:{command:70,war:72,intellect:55,politics:45,charisma:50}, loyalty:80 },
  { id:'zang_ba', name:'장패', city:'xiapi', faction:'wei', stats:{command:68,war:74,intellect:52,politics:40,charisma:55}, loyalty:75 },
  { id:'cao_zhang_2', name:'조창', city:'nanpi', faction:'wei', stats:{command:65,war:80,intellect:40,politics:35,charisma:55}, loyalty:90 },
  { id:'wang_shuang', name:'왕쌍', city:'longxi', faction:'wei', stats:{command:55,war:78,intellect:35,politics:30,charisma:40}, loyalty:80 },
  { id:'yang_huai', name:'양회', city:'jiange', faction:'liu_zhang', stats:{command:58,war:62,intellect:45,politics:40,charisma:45}, loyalty:75 },
  { id:'leng_bao', name:'냉포', city:'jianning', faction:'liu_zhang', stats:{command:45,war:55,intellect:35,politics:30,charisma:35}, loyalty:60 },
  { id:'yang_ren', name:'양임', city:'yangpingguan', faction:'zhang_lu', stats:{command:62,war:68,intellect:50,politics:40,charisma:45}, loyalty:80 },
  { id:'shi_xie', name:'사섭', city:'panyu', faction:'shu', stats:{command:55,war:40,intellect:70,politics:75,charisma:72}, loyalty:60 },
  { id:'pan_zhang_npc', name:'반장', city:'wuchang', faction:'wu', stats:{command:60,war:68,intellect:48,politics:42,charisma:40}, loyalty:75 },
  { id:'zhu_huan_npc', name:'주환', city:'shouchun', faction:'wu', stats:{command:68,war:70,intellect:60,politics:50,charisma:55}, loyalty:80 },
  { id:'sun_huan_npc', name:'손환', city:'kuaiji', faction:'wu', stats:{command:55,war:58,intellect:52,politics:48,charisma:55}, loyalty:85 },
  // 관문 수비대
  { id:'hulao_guard', name:'호뢰관 수비장', city:'hulao', faction:'wei', stats:{command:50,war:55,intellect:40,politics:35,charisma:40}, loyalty:70 },
  { id:'tongguan_guard', name:'동관 수비장', city:'tongguan', faction:'wei', stats:{command:55,war:60,intellect:42,politics:38,charisma:42}, loyalty:75 },
];

let added = 0;
for (const npc of garrisonNpcs) {
  if (!scn.characters[npc.id]) {
    scn.characters[npc.id] = {
      name: npc.name,
      faction: npc.faction,
      city: npc.city,
      stats: npc.stats,
      loyalty: npc.loyalty,
      potential: Math.round((npc.stats.command + npc.stats.war + npc.stats.intellect) / 3),
      skills: [],
      alive: true,
    };
    added++;
  }
}

// === 저장 ===
writeFileSync('engine/data/scenarios/208-red-cliffs.json', JSON.stringify(scn, null, 2));

// === 검증 ===
const cityCounts = {};
for (const c of Object.values(scn.characters)) {
  cityCounts[c.city] = (cityCounts[c.city] || 0) + 1;
}
const emptyCities = Object.keys(scn.cities).filter(id => !cityCounts[id]);

console.log(`재배치: ${moved}명, NPC 추가: ${added}명`);
console.log(`총 캐릭터: ${Object.keys(scn.characters).length}명`);
console.log(`무인도시: ${emptyCities.length}개${emptyCities.length ? ' — ' + emptyCities.join(', ') : ''}`);
console.log('\n도시별 캐릭터:');
Object.entries(cityCounts).sort((a,b)=>b[1]-a[1]).forEach(([city,cnt]) => {
  console.log(`  ${city.padEnd(16)} ${cnt}명`);
});
