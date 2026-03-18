#!/usr/bin/env node
// crawl-baidu-wave3.js — 바이두 3차: 도시 개별 페이지 + 제도/편제 + 관문/요새
// 도시 역사·특산·전략가치 + 제도(둔전/구품/도독) + 관문(호뢰/동관/검각/양평)

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';

const OUT_DIR = 'data/raw/baidu';
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const DELAY = 2000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// === 크롤링 대상 ===
const targets = [
  // ── 주요 도시 (42도시 중 바이두 독립 문서 있을 것) ──
  { slug: 'city-luoyang', title: '洛阳', category: 'city' },
  { slug: 'city-changan', title: '长安', category: 'city' },
  { slug: 'city-xuchang', title: '许昌', category: 'city' },
  { slug: 'city-ye', title: '邺城', category: 'city' },
  { slug: 'city-chengdu', title: '成都', category: 'city' },
  { slug: 'city-jianye', title: '建业', category: 'city' },
  { slug: 'city-xiangyang', title: '襄阳', category: 'city' },
  { slug: 'city-jiangling', title: '江陵', category: 'city' },
  { slug: 'city-hefei', title: '合肥', category: 'city' },
  { slug: 'city-hanzhong', title: '汉中', category: 'city' },
  { slug: 'city-wan', title: '宛城', category: 'city' },
  { slug: 'city-shouchun', title: '寿春', category: 'city' },
  { slug: 'city-xiapi', title: '下邳', category: 'city' },
  { slug: 'city-puyang', title: '濮阳', category: 'city' },
  { slug: 'city-runan', title: '汝南', category: 'city' },
  { slug: 'city-changsha', title: '长沙', category: 'city' },
  { slug: 'city-wuling', title: '武陵', category: 'city' },
  { slug: 'city-lingling', title: '零陵', category: 'city' },
  { slug: 'city-guiyang', title: '桂阳', category: 'city' },
  { slug: 'city-jiangxia', title: '江夏', category: 'city' },
  { slug: 'city-kuaiji', title: '会稽', category: 'city' },
  { slug: 'city-wuchang', title: '武昌', category: 'city' },
  { slug: 'city-guangling', title: '广陵', category: 'city' },
  { slug: 'city-beihai', title: '北海', category: 'city' },
  { slug: 'city-pingyuan', title: '平原', category: 'city' },
  { slug: 'city-nanpi', title: '南皮', category: 'city' },
  { slug: 'city-jinyang', title: '晋阳', category: 'city' },
  { slug: 'city-liaodong', title: '辽东', category: 'city' },
  { slug: 'city-longxi', title: '陇西', category: 'city' },
  { slug: 'city-wuwei', title: '武威', category: 'city' },
  { slug: 'city-jiameng', title: '葭萌关', category: 'city' },
  { slug: 'city-baidi', title: '白帝城', category: 'city' },
  { slug: 'city-jianning', title: '建宁', category: 'city' },
  { slug: 'city-panyu', title: '番禺', category: 'city' },

  // ── 관문/요새 ──
  { slug: 'pass-hulao', title: '虎牢关', category: 'pass' },
  { slug: 'pass-tongguan', title: '潼关', category: 'pass' },
  { slug: 'pass-yangping', title: '阳平关', category: 'pass' },
  { slug: 'pass-jiange', title: '剑阁', category: 'pass' },
  { slug: 'pass-shangyong', title: '上庸', category: 'pass' },
  { slug: 'pass-rushui', title: '濡须口', category: 'pass' },
  { slug: 'pass-jieting', title: '街亭', category: 'pass' },
  { slug: 'pass-dingjunshan', title: '定军山', category: 'pass' },
  { slug: 'pass-wuzhangyuan', title: '五丈原', category: 'pass' },

  // ── 제도/편제 ──
  { slug: 'sys-jiupin-zhongzheng', title: '九品中正制', category: 'institution' },
  { slug: 'sys-tuntian-cao', title: '曹魏屯田', category: 'institution' },
  { slug: 'sys-dudu', title: '都督制', category: 'institution' },
  { slug: 'sys-cishi', title: '刺史', category: 'institution' },
  { slug: 'sys-chengxiang', title: '丞相', category: 'institution' },
  { slug: 'sys-taiwei', title: '太尉', category: 'institution' },
  { slug: 'sys-dasima', title: '大司马', category: 'institution' },
  { slug: 'sys-zhongshuling', title: '中书令', category: 'institution' },
  { slug: 'sys-jiananjian', title: '建安七子', category: 'culture' },
  { slug: 'sys-zhulinqixian', title: '竹林七贤', category: 'culture' },
  { slug: 'sys-sanxuan', title: '三玄', category: 'culture' },

  // ── 군사 편제/전술 ──
  { slug: 'mil-qibing', title: '骑兵', category: 'military' },
  { slug: 'mil-bubing', title: '步兵', category: 'military' },
  { slug: 'mil-shuijun', title: '水军', category: 'military' },
  { slug: 'mil-zhenfa', title: '阵法', category: 'military' },
  { slug: 'mil-gongcheng', title: '攻城战', category: 'military' },
  { slug: 'mil-shoucheng', title: '守城战', category: 'military' },
  { slug: 'mil-huogong', title: '火攻', category: 'military' },
  { slug: 'mil-fubing', title: '伏兵', category: 'military' },

  // ── 주요 주(州) — 행정구역 ──
  { slug: 'prov-yanzhou', title: '兖州', category: 'province' },
  { slug: 'prov-xuzhou', title: '徐州', category: 'province' },
  { slug: 'prov-jingzhou', title: '荆州', category: 'province' },
  { slug: 'prov-yizhou', title: '益州', category: 'province' },
  { slug: 'prov-yangzhou', title: '扬州', category: 'province' },
  { slug: 'prov-jizhou', title: '冀州', category: 'province' },
  { slug: 'prov-youzhou', title: '幽州', category: 'province' },
  { slug: 'prov-bingzhou', title: '并州', category: 'province' },
  { slug: 'prov-liangzhou', title: '凉州', category: 'province' },
  { slug: 'prov-jiaozhi', title: '交州', category: 'province' },
  { slug: 'prov-qingzhou', title: '青州', category: 'province' },
  { slug: 'prov-yuzhou', title: '豫州', category: 'province' },
  { slug: 'prov-sizhou', title: '司隶', category: 'province' },
];

// === 파서 ===
function parseHtml(html) {
  // 제목
  const titleMatch = html.match(/<title>(.+?)[-_—]/);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // 요약 (meta description 또는 첫 단락)
  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  const summary = descMatch ? descMatch[1].trim() : '';

  // 인포박스
  const infobox = {};
  const dtRegex = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g;
  let m;
  while ((m = dtRegex.exec(html)) !== null) {
    const key = m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim();
    const val = m[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim();
    if (key && val) infobox[key] = val;
  }

  // 섹션
  const sections = [];
  const sectionRegex = /<h([23])[^>]*(?:data-level="\d")?[^>]*>([\s\S]*?)<\/h[23]>/g;
  const sectionPositions = [];
  while ((m = sectionRegex.exec(html)) !== null) {
    sectionPositions.push({
      level: parseInt(m[1]),
      heading: m[2].replace(/<[^>]+>/g, '').trim(),
      start: m.index + m[0].length,
    });
  }
  for (let i = 0; i < sectionPositions.length; i++) {
    const end = i + 1 < sectionPositions.length ? sectionPositions[i + 1].start : html.length;
    const raw = html.slice(sectionPositions[i].start, end);
    const content = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (content.length > 20) {
      sections.push({
        level: sectionPositions[i].level,
        heading: sectionPositions[i].heading,
        content: content.slice(0, 5000),
      });
    }
  }

  return { title, summary, infobox, sections };
}

// === 크롤링 실행 ===
async function crawl() {
  let success = 0, fail = 0, skip = 0;

  for (const t of targets) {
    const outFile = `${OUT_DIR}/${t.slug}.json`;
    if (existsSync(outFile)) {
      skip++;
      continue;
    }

    try {
      const url = `https://baike.baidu.com/item/${encodeURIComponent(t.title)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
      });

      if (!res.ok) {
        console.log(`  ✗ ${t.slug}: HTTP ${res.status}`);
        fail++;
        await sleep(DELAY);
        continue;
      }

      const html = await res.text();
      const parsed = parseHtml(html);

      const data = {
        slug: t.slug,
        title: t.title,
        category: t.category,
        url: url,
        summary: parsed.summary,
        infobox: parsed.infobox,
        sections: parsed.sections,
        section_count: parsed.sections.length,
        crawled_at: new Date().toISOString(),
      };

      writeFileSync(outFile, JSON.stringify(data, null, 2));
      console.log(`  ✓ ${t.slug}: ${parsed.sections.length} sections, ${Object.keys(parsed.infobox).length} infobox`);
      success++;
    } catch (e) {
      console.log(`  ✗ ${t.slug}: ${e.message}`);
      fail++;
    }

    await sleep(DELAY);
  }

  console.log(`\n=== Wave 3 완료 ===`);
  console.log(`성공: ${success}, 실패: ${fail}, 스킵: ${skip}`);
  console.log(`총 타겟: ${targets.length}`);
}

crawl();
