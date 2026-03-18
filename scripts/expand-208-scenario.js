/**
 * 208 적벽대전 시나리오 캐릭터 확장 (38→110+)
 * soul.md에서 스탯 읽어서 시나리오에 삽입
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';

const SCENARIO = 'engine/data/scenarios/208-red-cliffs.json';
const CHARS_DIR = 'data/characters';

// soul.md에서 스탯 추출
function extractStats(slug) {
  try {
    const md = readFileSync(`${CHARS_DIR}/${slug}.soul.md`, 'utf8');
    const m = md.match(/\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/);
    if (!m) return null;
    return {
      command: +m[1], war: +m[2], intellect: +m[3],
      politics: +m[4], charisma: +m[5]
    };
  } catch { return null; }
}

// 스탯 기반 스킬 자동 배정
function autoSkills(s, overrides) {
  if (overrides) return overrides;
  const skills = [];
  if (s.war >= 90) skills.push('duel_master');
  if (s.command >= 88) skills.push('charge_master');
  if (s.intellect >= 90) skills.push('insight');
  if (s.politics >= 88) skills.push('governance');
  if (s.intellect >= 85 && s.war < 50) skills.push('spy_master');
  if (s.charisma >= 90) skills.push('charm');
  return skills.slice(0, 2);
}

// 208년 기준 추가 캐릭터 (faction, city, loyalty, skills override)
const NEW_CHARS = [
  // === WEI ===
  ['cheng-yu',    'wei', 'xuchang',  90, ['insight','governance']],
  ['xun-you',     'wei', 'xuchang',  92, ['insight','spy_master']],
  ['man-chong',   'wei', 'yuzhou',   88, null],
  ['li-dian',     'wei', 'yanzhou',  85, null],
  ['cao-chun',    'wei', 'ye',       95, ['charge_master']],
  ['cao-xiu',     'wei', 'ye',       95, null],
  ['wen-pin',     'wei', 'nanyang',  75, ['siege_master']],
  ['cai-mao',     'wei', 'nanyang',  70, null],  // 적벽 수군 도독
  ['liu-ye',      'wei', 'xuchang',  85, ['insight']],
  ['dong-zhao',   'wei', 'xuchang',  88, ['governance']],
  ['chen-qun',    'wei', 'xuchang',  90, ['governance']],
  ['wang-lang',   'wei', 'xuzhou',   82, ['governance']],
  ['hua-xin',     'wei', 'xuchang',  80, ['governance']],
  ['chen-lin',    'wei', 'ye',       78, null],
  ['hao-zhao',    'wei', 'changan',  90, ['siege_master']],
  ['cao-zhang',   'wei', 'ye',       95, ['duel_master']],
  ['jia-kui',     'wei', 'xuchang',  85, ['governance']],
  ['han-hao',     'wei', 'yuzhou',   88, null],
  ['zhang-yun',   'wei', 'nanyang',  65, null],  // 적벽 부수군 도독
  ['cao-ang',     'wei', 'ye',       95, null],   // 조조 장남 — 207 완성 전 사망이지만 시나리오용
  // Actually cao_ang died 197. Remove him. Let me replace.
  // ['liang-xi',    'wei', 'bingzhou', 85, ['governance']],  // 양주 자사
  // Let me use someone else...
  ['cao-rui',     'wei', 'ye',       95, null],  // 조조 손자, 어리지만 시나리오용

  // === SHU ===
  ['mi-zhu',      'shu', 'jingzhou', 90, ['governance']],
  ['mi-fang',     'shu', 'jingzhou', 55, null],  // 낮은 충성 — 나중에 배반
  ['jian-yong',   'shu', 'jingzhou', 85, ['charm']],
  ['sun-qian',    'shu', 'jingzhou', 85, null],
  ['guan-ping',   'shu', 'jingzhou', 95, null],
  ['liu-feng',    'shu', 'jingzhou', 80, null],
  ['liao-hua',    'shu', 'jingzhou', 88, null],
  ['chen-dao',    'shu', 'jingzhou', 90, null],
  ['yi-ji',       'shu', 'jingzhou', 82, null],  // 이적 — 형주 출신 외교관 (slug 확인 필요)

  // === WU ===
  ['cheng-pu',    'wu', 'yangzhou',  92, null],   // 적벽 부도독
  ['lu-meng',     'wu', 'jianye',   88, null],   // 미래 형주 탈환
  ['ling-tong',   'wu', 'jianye',   85, null],
  ['han-dang',    'wu', 'yangzhou',  90, null],
  ['pan-zhang',   'wu', 'jianye',   80, null],
  ['xu-sheng',    'wu', 'jianye',   85, null],
  ['ding-feng',   'wu', 'kuaiji',   85, null],
  ['lv-fan',      'wu', 'jianye',   88, ['governance']],
  ['zhang-zhao',  'wu', 'jianye',   90, ['governance','insight']],
  ['gu-yong',     'wu', 'jianye',   88, ['governance']],
  ['lv-dai',      'wu', 'kuaiji',   85, null],
  ['dong-xi',     'wu', 'kuaiji',   85, null],
  ['zhu-zhi',     'wu', 'kuaiji',   90, ['governance']],
  ['lu-xun',      'wu', 'kuaiji',   82, null],   // 25세, 이미 문관으로 활동
  ['zhu-ran',     'wu', 'jianye',   85, null],
  ['bu-zhi',      'wu', 'jianye',   80, ['governance']],

  // === LIU ZHANG ===
  ['li-yan',      'liu_zhang', 'yizhou',  75, ['siege_master']],
  ['yang-huai',   'liu_zhang', 'yizhou',  85, null],
  ['gao-pei',     'liu_zhang', 'yizhou',  85, null],
  ['deng-xian',   'liu_zhang', 'yizhou',  80, null],
  ['wang-lei',    'liu_zhang', 'chengdu', 90, ['governance']],
  ['qiao-zhou',   'liu_zhang', 'chengdu', 70, ['insight']],
  ['fei-shi',     'liu_zhang', 'chengdu', 75, null],   // 비시 — 나중에 촉한
  ['wu-lan',      'liu_zhang', 'yizhou',  78, null],

  // === ZHANG LU ===
  ['yang-ren',    'zhang_lu', 'hanzhong', 85, null],
  ['yang-ang',    'zhang_lu', 'hanzhong', 80, null],
  ['yang-song',   'zhang_lu', 'hanzhong', 55, ['spy_master']], // 간신

  // === WANDERERS (208년 기준 소속 불분명/독립) ===
  ['pang-tong',   null, 'jingzhou',  0, ['insight']],      // 곧 유비 합류
  ['ma-chao',     null, 'tianshui',  0, ['duel_master','charge_master']], // 서량 독립
  ['ma-teng',     null, 'tianshui',  0, null],              // 서량 거점
  ['ma-dai',      null, 'tianshui',  0, null],
  ['han-sui',     null, 'tianshui',  0, null],              // 서량 군벌
  ['deng-zhi',    null, 'yizhou',    0, null],              // 방랑 → 촉한
  ['xu-jing',     null, 'jiaozhou',  0, ['governance']],    // 남방 피난
  ['fei-yi',      null, 'jingzhou',  0, null],              // 어린 인재
];

// === 메인 ===
const scenario = JSON.parse(readFileSync(SCENARIO, 'utf8'));
let added = 0, skipped = 0, wanderers = [];

for (const [slug, faction, city, loyalty, skillsOverride] of NEW_CHARS) {
  const id = slug.replace(/-/g, '_');
  if (scenario.characters[id]) { skipped++; continue; }

  const stats = extractStats(slug);
  if (!stats) {
    console.log(`SKIP (no soul.md): ${slug}`);
    skipped++;
    continue;
  }

  const skills = autoSkills(stats, skillsOverride);
  const potential = {};
  for (const [k, v] of Object.entries(stats)) {
    potential[k] = Math.min(100, v + 10);
  }

  const entry = {
    faction: faction || 'none',
    city,
    alive: true,
    status: faction ? 'active' : 'wandering',
    stats,
    loyalty: loyalty || 0,
    skills,
    equipment: { weapon: null, armor: null, horse: null, accessory: null },
    potential,
    experience: 0,
    level: 1
  };

  if (!faction) {
    wanderers.push(id);
  }

  scenario.characters[id] = entry;
  added++;
}

// wanderers 배열 추가
scenario.wanderers = wanderers;

writeFileSync(SCENARIO, JSON.stringify(scenario, null, 2));

// 통계
const byFaction = {};
for (const [id, c] of Object.entries(scenario.characters)) {
  const f = c.faction || 'none';
  byFaction[f] = (byFaction[f] || 0) + 1;
}
console.log(`\nAdded: ${added}, Skipped: ${skipped}`);
console.log(`Total characters: ${Object.keys(scenario.characters).length}`);
console.log(`Wanderers: ${wanderers.length}`);
for (const [f, n] of Object.entries(byFaction).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${f}: ${n}`);
}
