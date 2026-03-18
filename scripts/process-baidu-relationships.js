#!/usr/bin/env node
// process-baidu-relationships.js — 바이두백과에서 관계 그래프 추출
// 인포박스 + 가족/후대 섹션 + 본문 키워드 매칭

import { readFileSync, writeFileSync, readdirSync } from 'fs';

const BAIDU_DIR = 'data/raw/baidu';
const OUT_FILE = 'data/processed/relationships-baidu.json';

// === 캐릭터 이름 매핑 (중문→slug) ===
// 바이두 50명 + 주요 인물 확장
const nameToSlug = {
  '曹操': 'cao_cao', '刘备': 'liu_bei', '孙权': 'sun_quan',
  '诸葛亮': 'zhuge_liang', '关羽': 'guan_yu', '张飞': 'zhang_fei',
  '赵云': 'zhao_yun', '吕布': 'lv_bu', '司马懿': 'sima_yi',
  '周瑜': 'zhou_yu', '貂蝉': 'diao_chan', '董卓': 'dong_zhuo',
  '袁绍': 'yuan_shao', '孙策': 'sun_ce', '孙坚': 'sun_jian',
  '曹丕': 'cao_pi', '刘表': 'liu_biao', '马超': 'ma_chao',
  '黄忠': 'huang_zhong', '庞统': 'pang_tong',
  '徐庶': 'xu_shu', '贾诩': 'jia_xu', '郭嘉': 'guo_jia',
  '荀彧': 'xun_yu', '鲁肃': 'lu_su', '吕蒙': 'lv_meng',
  '陆逊': 'lu_xun', '姜维': 'jiang_wei', '邓艾': 'deng_ai',
  '钟会': 'zhong_hui', '夏侯惇': 'xiahou_dun', '夏侯渊': 'xiahou_yuan',
  '徐晃': 'xu_huang', '张辽': 'zhang_liao', '许褚': 'xu_chu',
  '典韦': 'dian_wei', '甘宁': 'gan_ning', '太史慈': 'taishi_ci',
  '黄盖': 'huang_gai', '魏延': 'wei_yan', '法正': 'fa_zheng',
  '庞德': 'pang_de', '张郃': 'zhang_he', '司马昭': 'sima_zhao',
  '司马师': 'sima_shi', '孟获': 'meng_huo', '祝融': 'zhu_rong',
  '袁术': 'yuan_shu', '刘璋': 'liu_zhang', '张鲁': 'zhang_lu',
  // 확장: 바이두 본문에서 자주 언급되는 인물
  '曹仁': 'cao_ren', '曹洪': 'cao_hong', '曹真': 'cao_zhen',
  '曹休': 'cao_xiu', '曹植': 'cao_zhi', '曹彰': 'cao_zhang',
  '曹冲': 'cao_chong', '曹睿': 'cao_rui', '曹昂': 'cao_ang',
  '荀攸': 'xun_you', '程昱': 'cheng_yu', '刘晔': 'liu_ye',
  '满宠': 'man_chong', '于禁': 'yu_jin', '乐进': 'yue_jin',
  '李典': 'li_dian', '文聘': 'wen_pin', '张绣': 'zhang_xiu',
  '马腾': 'ma_teng', '马岱': 'ma_dai', '马良': 'ma_liang',
  '马谡': 'ma_su', '关平': 'guan_ping', '关兴': 'guan_xing',
  '张苞': 'zhang_bao', '刘封': 'liu_feng', '刘禅': 'liu_shan',
  '孟达': 'meng_da', '李严': 'li_yan', '蒋琬': 'jiang_wan',
  '费祎': 'fei_yi', '董允': 'dong_yun', '黄月英': 'huang_yueying',
  '诸葛瑾': 'zhuge_jun', '诸葛恪': 'zhuge_ke', '陆抗': 'lu_kang',
  '甄姬': 'lady_zhen', '大乔': 'da_qiao', '小乔': 'xiao_qiao',
  '孙尚香': 'sun_shangxiang', '孙登': 'sun_deng',
  '周泰': 'zhou_tai', '凌统': 'ling_tong', '韩当': 'han_dang',
  '程普': 'cheng_pu', '潘璋': 'pan_zhang', '丁奉': 'ding_feng',
  '朱然': 'zhu_ran', '吕岱': 'lv_dai', '顾雍': 'gu_yong',
  '张昭': 'zhang_zhao', '虞翻': 'yu_fan', '阚泽': 'kan_ze',
  '严颜': 'yan_yan', '张任': 'zhang_ren', '吴懿': 'wu_yi',
  '费观': 'fei_guan', '王平': 'wang_ping', '廖化': 'liao_hua',
  '陈宫': 'chen_gong', '高顺': 'gao_shun',
  '袁谭': 'yuan_tan', '袁尚': 'yuan_shang', '袁熙': 'yuan_xi',
  '审配': 'shen_pei', '田丰': 'tian_feng', '许攸': 'xu_you',
  '张松': 'zhang_song', '法正': 'fa_zheng',
  '王允': 'wang_yun', '司马炎': 'sima_yan',
  '公孙瓒': 'gongsun_zan', '陶谦': 'tao_qian',
  '华佗': 'hua_tuo', '左慈': 'zuo_ci',
};

// slug→중문명 역매핑
const slugToName = {};
for (const [cn, slug] of Object.entries(nameToSlug)) {
  if (!slugToName[slug]) slugToName[slug] = cn;
}

// === 관계 타입 매핑 ===
const relPatterns = [
  // 가족
  { pattern: /父(?:亲)?[：:]\s*(.+)/g, type: 'father', dir: 'parent' },
  { pattern: /母(?:亲)?[：:]\s*(.+)/g, type: 'mother', dir: 'parent' },
  { pattern: /(?:妻|配偶)[：:]\s*(.+)/g, type: 'spouse', dir: 'spouse' },
  { pattern: /(?:妻妾|妾)[：:]\s*(.+)/g, type: 'concubine', dir: 'spouse' },
  { pattern: /(?:子|儿子|嗣子)[：:]\s*(.+)/g, type: 'child', dir: 'child' },
  { pattern: /(?:女|女儿)[：:]\s*(.+)/g, type: 'daughter', dir: 'child' },
  { pattern: /(?:兄弟|弟|兄)[：:]\s*(.+)/g, type: 'sibling', dir: 'sibling' },
  // 군신
  { pattern: /(?:主君|主公)[：:]\s*(.+)/g, type: 'lord', dir: 'lord' },
  { pattern: /(?:师父|师傅)[：:]\s*(.+)/g, type: 'master', dir: 'master' },
];

// 관계 키워드 (본문 매칭)
const relKeywords = [
  { keywords: ['结义', '桃园', '义兄弟', '金兰'], type: 'sworn_brothers', intensity: 100 },
  { keywords: ['归降', '投降', '归附', '投奔'], type: 'defection', intensity: 50 },
  { keywords: ['背叛', '反叛', '谋反'], type: 'betrayal', intensity: 80 },
  { keywords: ['联姻', '嫁给', '娶'], type: 'marriage', intensity: 70 },
  { keywords: ['师从', '拜师', '学艺'], type: 'apprentice', intensity: 60 },
  { keywords: ['仇敌', '死敌', '宿敌'], type: 'nemesis', intensity: 90 },
  { keywords: ['挚友', '知己', '好友'], type: 'close_friend', intensity: 80 },
  { keywords: ['同门', '同窗'], type: 'fellow_student', intensity: 50 },
];

// === 추출 함수 ===

function extractFromInfobox(infobox, sourceSlug) {
  const rels = [];
  const relFields = {
    '主君': 'lord_vassal',
    '配偶': 'spouse',
    '父亲': 'parent_child',
    '母亲': 'parent_child',
    '前任': 'succession',
    '继任': 'succession',
  };

  for (const [key, relType] of Object.entries(relFields)) {
    const val = infobox[key];
    if (!val) continue;

    // 중문명에서 slug 매칭
    for (const [cn, slug] of Object.entries(nameToSlug)) {
      if (val.includes(cn) && slug !== sourceSlug) {
        rels.push({
          a: sourceSlug,
          b: slug,
          type: relType,
          source: 'infobox',
          field: key,
          evidence: `${key}: ${val.slice(0, 100)}`,
          intensity: relType === 'spouse' ? 80 : relType === 'parent_child' ? 90 : 70,
        });
      }
    }
  }
  return rels;
}

function extractFromSections(sections, sourceSlug) {
  const rels = [];
  const familySections = ['家族', '妻妾', '后代', '旁系', '亲属', '家庭', '婚姻'];

  for (const section of sections) {
    const isFamily = familySections.some(fs => section.heading.includes(fs));
    const text = section.content;

    // 가족 섹션에서 이름 매칭
    if (isFamily) {
      for (const [cn, slug] of Object.entries(nameToSlug)) {
        if (text.includes(cn) && slug !== sourceSlug) {
          // 관계 유형 추론
          let type = 'family';
          if (section.heading.includes('妻')) type = 'spouse';
          else if (section.heading.includes('后代') || section.heading.includes('子')) type = 'parent_child';
          else if (section.heading.includes('旁系')) type = 'collateral';

          rels.push({
            a: sourceSlug,
            b: slug,
            type,
            source: 'section',
            section: section.heading,
            evidence: `${section.heading}에서 ${cn} 언급`,
            intensity: type === 'spouse' ? 80 : type === 'parent_child' ? 90 : 50,
          });
        }
      }
    }

    // 본문에서 관계 키워드 매칭
    for (const pattern of relKeywords) {
      for (const kw of pattern.keywords) {
        if (text.includes(kw)) {
          // 키워드 주변에서 인물명 찾기
          const kwIdx = text.indexOf(kw);
          const context = text.slice(Math.max(0, kwIdx - 50), Math.min(text.length, kwIdx + 50));

          for (const [cn, slug] of Object.entries(nameToSlug)) {
            if (context.includes(cn) && slug !== sourceSlug) {
              rels.push({
                a: sourceSlug,
                b: slug,
                type: pattern.type,
                source: 'keyword',
                keyword: kw,
                evidence: context.slice(0, 100),
                intensity: pattern.intensity,
              });
            }
          }
        }
      }
    }
  }

  return rels;
}

function extractFromSummary(summary, sourceSlug) {
  const rels = [];
  // 요약에서 주요 인물 관계 추출
  for (const [cn, slug] of Object.entries(nameToSlug)) {
    if (summary.includes(cn) && slug !== sourceSlug) {
      rels.push({
        a: sourceSlug,
        b: slug,
        type: 'mentioned',
        source: 'summary',
        evidence: `요약에서 ${cn} 언급`,
        intensity: 30,
      });
    }
  }
  return rels;
}

// === 메인 ===
const files = readdirSync(BAIDU_DIR);
const charFiles = files.filter(f => {
  try {
    const d = JSON.parse(readFileSync(`${BAIDU_DIR}/${f}`, 'utf8'));
    return d.category === 'character';
  } catch { return false; }
});

console.log(`캐릭터 파일: ${charFiles.length}개`);

const allRels = [];
const relSet = new Set(); // 중복 방지

for (const f of charFiles) {
  const data = JSON.parse(readFileSync(`${BAIDU_DIR}/${f}`, 'utf8'));
  const slug = data.slug.replace(/-/g, '_');

  // 1. 인포박스에서 추출
  const infoRels = extractFromInfobox(data.infobox, slug);

  // 2. 섹션에서 추출
  const sectionRels = extractFromSections(data.sections, slug);

  // 3. 요약에서 추출
  const summaryRels = extractFromSummary(data.summary, slug);

  const charRels = [...infoRels, ...sectionRels, ...summaryRels];

  // 중복 제거
  for (const rel of charRels) {
    const key = [rel.a, rel.b, rel.type].sort().join('|');
    if (!relSet.has(key)) {
      relSet.add(key);
      allRels.push(rel);
    }
  }
}

// === 관계 통계 ===
const typeCount = {};
const sourceCount = {};
for (const r of allRels) {
  typeCount[r.type] = (typeCount[r.type] || 0) + 1;
  sourceCount[r.source] = (sourceCount[r.source] || 0) + 1;
}

console.log(`\n=== 추출 결과 ===`);
console.log(`총 관계: ${allRels.length}`);
console.log(`\n타입별:`);
Object.entries(typeCount).sort((a,b) => b[1]-a[1]).forEach(([t,c]) => console.log(`  ${t}: ${c}`));
console.log(`\n소스별:`);
Object.entries(sourceCount).sort((a,b) => b[1]-a[1]).forEach(([s,c]) => console.log(`  ${s}: ${c}`));

// 가장 연결 많은 캐릭터
const charConnections = {};
for (const r of allRels) {
  charConnections[r.a] = (charConnections[r.a] || 0) + 1;
  charConnections[r.b] = (charConnections[r.b] || 0) + 1;
}
console.log(`\n연결 Top 10:`);
Object.entries(charConnections).sort((a,b) => b[1]-a[1]).slice(0,10)
  .forEach(([slug,cnt]) => console.log(`  ${slug}: ${cnt}`));

// === 저장 ===
const output = {
  total: allRels.length,
  type_distribution: typeCount,
  source_distribution: sourceCount,
  generated_at: new Date().toISOString(),
  source: 'baidu_baike',
  relationships: allRels,
};

writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
console.log(`\n→ ${OUT_FILE}`);
