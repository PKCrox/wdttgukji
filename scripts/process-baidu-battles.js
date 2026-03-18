#!/usr/bin/env node
// process-baidu-battles.js — 바이두 전투 데이터 → 게임용 구조화
// 인포박스에서 참전방/병력/지휘관/결과/의의 추출 + 전략 분석

import { readFileSync, writeFileSync, readdirSync } from 'fs';

const BAIDU_DIR = 'data/raw/baidu';
const OUT_FILE = 'data/processed/battles-structured.json';

// 캐릭터 이름→slug 매핑 (중문)
const nameToSlug = {
  '曹操':'cao_cao', '刘备':'liu_bei', '孙权':'sun_quan', '诸葛亮':'zhuge_liang',
  '关羽':'guan_yu', '张飞':'zhang_fei', '赵云':'zhao_yun', '周瑜':'zhou_yu',
  '吕布':'lv_bu', '司马懿':'sima_yi', '袁绍':'yuan_shao', '孙策':'sun_ce',
  '孙坚':'sun_jian', '曹丕':'cao_pi', '曹仁':'cao_ren', '夏侯惇':'xiahou_dun',
  '夏侯渊':'xiahou_yuan', '张辽':'zhang_liao', '许褚':'xu_chu', '典韦':'dian_wei',
  '徐晃':'xu_huang', '张郃':'zhang_he', '于禁':'yu_jin', '乐进':'yue_jin',
  '李典':'li_dian', '荀彧':'xun_yu', '郭嘉':'guo_jia', '贾诩':'jia_xu',
  '陆逊':'lu_xun', '鲁肃':'lu_su', '吕蒙':'lv_meng', '甘宁':'gan_ning',
  '黄盖':'huang_gai', '程普':'cheng_pu', '韩当':'han_dang', '太史慈':'taishi_ci',
  '周泰':'zhou_tai', '凌统':'ling_tong', '马超':'ma_chao', '黄忠':'huang_zhong',
  '魏延':'wei_yan', '法正':'fa_zheng', '庞统':'pang_tong', '姜维':'jiang_wei',
  '邓艾':'deng_ai', '钟会':'zhong_hui', '庞德':'pang_de', '徐庶':'xu_shu',
  '马谡':'ma_su', '王平':'wang_ping', '文聘':'wen_pin', '满宠':'man_chong',
  '孙桓':'sun_huan', '朱然':'zhu_ran', '潘璋':'pan_zhang', '徐盛':'xu_sheng',
  '丁奉':'ding_feng', '司马昭':'sima_zhao', '司马师':'sima_shi',
  '袁术':'yuan_shu', '吕布':'lv_bu', '张绣':'zhang_xiu', '颜良':'yan_liang',
  '文丑':'wen_chou', '高览':'gao_lan', '审配':'shen_pei', '许攸':'xu_you',
  '田丰':'tian_feng', '沮授':'ju_shou', '刘表':'liu_biao', '刘璋':'liu_zhang',
  '张鲁':'zhang_lu', '公孙瓒':'gongsun_zan', '董卓':'dong_zhuo',
  '黄权':'huang_quan', '张南':'zhang_nan', '冯习':'feng_xi',
  '孟获':'meng_huo', '马岱':'ma_dai', '王允':'wang_yun',
  '陈宫':'chen_gong', '高顺':'gao_shun', '马腾':'ma_teng', '韩遂':'han_sui',
  '曹真':'cao_zhen', '曹休':'cao_xiu', '司马炎':'sima_yan', '杜预':'du_yu',
  '羊祜':'yang_hu',
};

// 세력 매핑
const factionKeywords = {
  wei: ['曹军', '曹操', '曹魏', '魏军', '魏国'],
  shu: ['蜀军', '刘备', '蜀汉', '蜀国', '汉军'],
  wu: ['吴军', '孙权', '东吴', '吴国', '孙刘联军'],
  yuan: ['袁军', '袁绍', '袁术'],
  dong_zhuo: ['董卓'],
  gongsun: ['公孙瓒'],
  yellow_turbans: ['黄巾', '黄巾军'],
  jin: ['晋军', '西晋'],
  nanman: ['南蛮', '孟获', '蛮夷'],
};

function parseBelligerents(str) {
  if (!str) return [];
  return str.split(/[；;,，、]/).map(s => s.trim()).filter(Boolean);
}

function parseForces(str) {
  if (!str) return null;
  // "袁绍军约110000人曹操军约20000人" → 구조화
  const forces = [];
  const regex = /([^0-9约余万千]+)[约余]?([0-9,]+(?:余?万?千?)人?)/g;
  let m;
  while ((m = regex.exec(str)) !== null) {
    forces.push({ side: m[1].trim(), count: m[2].replace(/[人,]/g, '') });
  }
  if (forces.length === 0) return str; // 파싱 실패 시 원문
  return forces;
}

function parseCommanders(str) {
  if (!str) return [];
  const sides = str.split(/[；;]/);
  return sides.map(side => {
    const names = side.split(/[、,，]/).map(n => n.trim()).filter(Boolean);
    return names.map(name => ({
      name,
      slug: nameToSlug[name] || null,
    }));
  });
}

function identifyFaction(text) {
  for (const [faction, keywords] of Object.entries(factionKeywords)) {
    if (keywords.some(kw => text.includes(kw))) return faction;
  }
  return 'unknown';
}

function extractStrategies(sections) {
  const strategies = [];
  const stratKeywords = ['火攻', '伏兵', '奇袭', '围城', '水攻', '断粮', '诈降', '离间', '空城',
    '连环', '夜袭', '草船', '借东风', '诱敌', '声东击西', '围魏救赵'];

  for (const section of sections) {
    for (const kw of stratKeywords) {
      if (section.content.includes(kw)) {
        strategies.push({
          type: kw,
          context: section.heading,
        });
      }
    }
  }
  return [...new Map(strategies.map(s => [s.type, s])).values()];
}

// === 메인 처리 ===
const files = readdirSync(BAIDU_DIR);
const battleFiles = files.filter(f => {
  try {
    const d = JSON.parse(readFileSync(`${BAIDU_DIR}/${f}`, 'utf8'));
    return d.category === 'battle' || d.battle_data;
  } catch { return false; }
});

console.log(`전투 파일: ${battleFiles.length}개`);

const battles = [];

for (const f of battleFiles) {
  const data = JSON.parse(readFileSync(`${BAIDU_DIR}/${f}`, 'utf8'));
  const info = data.infobox || {};

  const battle = {
    id: data.slug,
    name_cn: data.title,
    name_kr: null, // 후처리로 매핑
    date: info['发生时间'] || null,
    location: info['地点'] || null,
    belligerents: parseBelligerents(info['参战方']),
    forces: parseForces(info['参战方兵力']),
    casualties: info['伤亡情况'] || null,
    commanders: parseCommanders(info['主要指挥官']),
    result: info['结果'] || null,
    significance: info['战争意义'] || info['历史意义'] || null,
    strategies: extractStrategies(data.sections),
    sections_summary: data.sections.slice(0, 3).map(s => ({
      heading: s.heading,
      excerpt: s.content.slice(0, 300),
    })),
    source: 'baidu_baike',
    section_count: data.section_count,
  };

  // 한글명 매핑
  const krNames = {
    '官渡之战':'관도 대전', '赤壁之战':'적벽 대전', '夷陵之战':'이릉 대전',
    '长坂坡之战':'장판파 전투', '合肥之战':'합비 전투', '定军山之战':'정군산 전투',
    '潼关之战':'동관 전투', '街亭之战':'가정 전투', '五丈原之战':'오장원 전투',
    '猇亭之战':'효정 전투', '诸葛亮南征':'남만 정벌', '下邳之战':'하비 전투',
    '虎牢关之战':'호뢰관 전투', '宛城之战':'완성 전투', '襄樊之战':'양번 전투',
  };
  battle.name_kr = krNames[data.title] || data.title;

  battles.push(battle);
  console.log(`  ${battle.name_cn}: ${battle.belligerents.join(' vs ')} | 전략: ${battle.strategies.map(s=>s.type).join(',') || '없음'}`);
}

const output = {
  total: battles.length,
  generated_at: new Date().toISOString(),
  source: 'baidu_baike',
  battles,
};

writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
console.log(`\n→ ${OUT_FILE} (${battles.length}건)`);

// 전략 유형 통계
const stratCount = {};
battles.forEach(b => b.strategies.forEach(s => stratCount[s.type] = (stratCount[s.type]||0)+1));
if (Object.keys(stratCount).length) {
  console.log('\n전략 유형 통계:');
  Object.entries(stratCount).sort((a,b)=>b[1]-a[1]).forEach(([t,c]) => console.log(`  ${t}: ${c}회`));
}
