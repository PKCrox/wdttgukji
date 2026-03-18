#!/usr/bin/env node
// crawl-baidu.js — 百度百科 삼국지 크롤링
// 캐릭터 관계, 지리 상세, 전투 디테일 수집
// 출력: data/raw/baidu/

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';

const OUT_DIR = 'data/raw/baidu';
mkdirSync(OUT_DIR, { recursive: true });

const DELAY_MS = 2000; // 바이두 rate limit 방지
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// === 수집 대상 ===

// 1. 핵심 캐릭터 (관계 + 상세 바이오)
const characters = [
  // Tier 0 (20명 핵심)
  { slug:'cao-cao', baidu:'曹操', cat:'character' },
  { slug:'liu-bei', baidu:'刘备', cat:'character' },
  { slug:'sun-quan', baidu:'孙权', cat:'character' },
  { slug:'zhuge-liang', baidu:'诸葛亮', cat:'character' },
  { slug:'guan-yu', baidu:'关羽', cat:'character' },
  { slug:'zhang-fei', baidu:'张飞', cat:'character' },
  { slug:'zhao-yun', baidu:'赵云', cat:'character' },
  { slug:'lu-bu', baidu:'吕布', cat:'character' },
  { slug:'sima-yi', baidu:'司马懿', cat:'character' },
  { slug:'zhou-yu', baidu:'周瑜', cat:'character' },
  { slug:'diao-chan', baidu:'貂蝉', cat:'character' },
  { slug:'dong-zhuo', baidu:'董卓', cat:'character' },
  { slug:'yuan-shao', baidu:'袁绍', cat:'character' },
  { slug:'sun-ce', baidu:'孙策', cat:'character' },
  { slug:'sun-jian', baidu:'孙坚', cat:'character' },
  { slug:'cao-pi', baidu:'曹丕', cat:'character' },
  { slug:'liu-biao', baidu:'刘表', cat:'character' },
  { slug:'ma-chao', baidu:'马超', cat:'character' },
  { slug:'huang-zhong', baidu:'黄忠', cat:'character' },
  { slug:'pang-tong', baidu:'庞统', cat:'character' },
  // Tier 1 주요 인물
  { slug:'xu-shu', baidu:'徐庶', cat:'character' },
  { slug:'jia-xu', baidu:'贾诩', cat:'character' },
  { slug:'guo-jia', baidu:'郭嘉', cat:'character' },
  { slug:'xun-yu', baidu:'荀彧', cat:'character' },
  { slug:'lu-su', baidu:'鲁肃', cat:'character' },
  { slug:'lu-meng', baidu:'吕蒙', cat:'character' },
  { slug:'lu-xun', baidu:'陆逊', cat:'character' },
  { slug:'jiang-wei', baidu:'姜维', cat:'character' },
  { slug:'deng-ai', baidu:'邓艾', cat:'character' },
  { slug:'zhong-hui', baidu:'钟会', cat:'character' },
  { slug:'xiahou-dun', baidu:'夏侯惇', cat:'character' },
  { slug:'xiahou-yuan', baidu:'夏侯渊', cat:'character' },
  { slug:'xu-huang', baidu:'徐晃', cat:'character' },
  { slug:'zhang-liao', baidu:'张辽', cat:'character' },
  { slug:'xu-chu', baidu:'许褚', cat:'character' },
  { slug:'dian-wei', baidu:'典韦', cat:'character' },
  { slug:'gan-ning', baidu:'甘宁', cat:'character' },
  { slug:'taishi-ci', baidu:'太史慈', cat:'character' },
  { slug:'huang-gai', baidu:'黄盖', cat:'character' },
  { slug:'wei-yan', baidu:'魏延', cat:'character' },
  { slug:'fa-zheng', baidu:'法正', cat:'character' },
  { slug:'pang-de', baidu:'庞德', cat:'character' },
  { slug:'zhang-he', baidu:'张郃', cat:'character' },
  { slug:'sima-zhao', baidu:'司马昭', cat:'character' },
  { slug:'sima-shi', baidu:'司马师', cat:'character' },
  { slug:'meng-huo', baidu:'孟获', cat:'character' },
  { slug:'zhu-rong', baidu:'祝融', cat:'character' },
  { slug:'yuan-shu', baidu:'袁术', cat:'character' },
  { slug:'liu-zhang', baidu:'刘璋', cat:'character' },
  { slug:'zhang-lu', baidu:'张鲁', cat:'character' },
];

// 2. 지리 (42도시 + 관문)
const geography = [
  { slug:'luoyang', baidu:'洛阳', cat:'geography' },
  { slug:'changan', baidu:'长安', cat:'geography' },
  { slug:'xuchang', baidu:'许昌', cat:'geography' },
  { slug:'ye-city', baidu:'邺城', cat:'geography' },
  { slug:'chengdu-3k', baidu:'成都', baidu_suffix:'(三国)', cat:'geography' },
  { slug:'jianye', baidu:'建业', cat:'geography' },
  { slug:'hanzhong-3k', baidu:'汉中', baidu_suffix:'(三国)', cat:'geography' },
  { slug:'xiangyang-3k', baidu:'襄阳', cat:'geography' },
  { slug:'jingzhou-3k', baidu:'荆州', baidu_suffix:'(古代)', cat:'geography' },
  { slug:'hefei-3k', baidu:'合肥之战', cat:'geography' },
  { slug:'chibi', baidu:'赤壁之战', cat:'geography' },
  { slug:'tianshui', baidu:'天水', baidu_suffix:'(古代地名)', cat:'geography' },
  { slug:'jiange', baidu:'剑阁', cat:'geography' },
  { slug:'hangu-pass', baidu:'函谷关', cat:'geography' },
  { slug:'tongguan-3k', baidu:'潼关', cat:'geography' },
  { slug:'wuzhang', baidu:'五丈原', cat:'geography' },
  { slug:'dingjun', baidu:'定军山', cat:'geography' },
  { slug:'bowang', baidu:'博望坡之战', cat:'geography' },
];

// 3. 전투 상세
const battles = [
  { slug:'battle-guandu', baidu:'官渡之战', cat:'battle' },
  { slug:'battle-chibi', baidu:'赤壁之战', cat:'battle' },
  { slug:'battle-yiling', baidu:'夷陵之战', cat:'battle' },
  { slug:'battle-changban', baidu:'长坂坡之战', cat:'battle' },
  { slug:'battle-fancheng', baidu:'襄樊之战', cat:'battle' },
  { slug:'battle-hefei', baidu:'合肥之战', cat:'battle' },
  { slug:'battle-dingjun', baidu:'定军山之战', cat:'battle' },
  { slug:'battle-tongguan', baidu:'潼关之战', cat:'battle' },
  { slug:'battle-jieting', baidu:'街亭之战', cat:'battle' },
  { slug:'battle-wuzhang', baidu:'五丈原之战', cat:'battle' },
  { slug:'battle-xiaoting', baidu:'猇亭之战', cat:'battle' },
  { slug:'battle-nanman', baidu:'诸葛亮南征', cat:'battle' },
  { slug:'battle-xiapi', baidu:'下邳之战', cat:'battle' },
  { slug:'battle-hulao', baidu:'虎牢关之战', cat:'battle' },
  { slug:'battle-wancheng', baidu:'宛城之战', cat:'battle' },
];

// 4. 삼국지 주제 문서
const topics = [
  { slug:'topic-five-tiger', baidu:'五虎上将', cat:'topic' },
  { slug:'topic-five-counselor', baidu:'五大谋士', cat:'topic' },
  { slug:'topic-sanguozhi', baidu:'三国志', cat:'topic' },
  { slug:'topic-nine-rank', baidu:'九品中正制', cat:'topic' },
  { slug:'topic-tuntian', baidu:'屯田制', cat:'topic' },
  { slug:'topic-three-kingdoms', baidu:'三国', cat:'topic' },
  { slug:'topic-yellow-turbans', baidu:'黄巾起义', cat:'topic' },
  { slug:'topic-peach-garden', baidu:'桃园三结义', cat:'topic' },
];

const allTargets = [...characters, ...geography, ...battles, ...topics];

// === 크롤링 ===

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchBaiduPage(term, suffix) {
  const query = suffix ? `${term}${suffix}` : term;
  const url = `https://baike.baidu.com/item/${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      console.error(`  HTTP ${res.status} for ${query}`);
      return null;
    }

    const html = await res.text();
    return { url, html, term: query };
  } catch (err) {
    console.error(`  Fetch error for ${query}: ${err.message}`);
    return null;
  }
}

// HTML에서 주요 정보 추출
function extractContent(html, term) {
  const result = {
    title: term,
    summary: '',
    sections: [],
    infobox: {},
    relationships: [],
    raw_text: '',
  };

  // 제목 추출
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  if (titleMatch) result.title = titleMatch[1].trim();

  // 요약 (첫 번째 단락)
  const summaryMatch = html.match(/<div[^>]*class="[^"]*lemma-summary[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  if (summaryMatch) {
    result.summary = summaryMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }

  // 메타 설명 fallback
  if (!result.summary) {
    const metaMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/);
    if (metaMatch) result.summary = metaMatch[1].trim();
  }

  // 섹션 추출 (h2/h3 — 바이두는 plain text 또는 data-level 속성)
  const sectionRegex = /<h([23])[^>]*(?:data-level="(\d)")?[^>]*>([\s\S]*?)<\/h[23]>/g;
  let match;
  const headings = [];
  while ((match = sectionRegex.exec(html)) !== null) {
    const text = match[3].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim();
    if (text && text !== '目录' && text.length < 100) {
      headings.push({ heading: text, level: parseInt(match[1]), index: match.index });
    }
  }

  // 각 섹션의 텍스트 추출
  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].index;
    const end = i + 1 < headings.length ? headings[i + 1].index : html.length;
    const sectionHtml = html.slice(start, end);
    const text = sectionHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (text.length > 20) {
      result.sections.push({
        heading: headings[i].heading,
        content: text.slice(0, 2000), // 섹션당 최대 2000자
      });
    }
  }

  // 인포박스 추출 (키-값 쌍 — 바이두 dt에 &nbsp; 패딩 있음)
  const infoRegex = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g;
  while ((match = infoRegex.exec(html)) !== null) {
    const key = match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').replace(/\s+/g, '').trim();
    const val = match[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').replace(/\s+/g, ' ').trim();
    if (key && val && key.length < 20) result.infobox[key] = val;
  }

  // 전체 텍스트 (관계 추출용)
  const bodyMatch = html.match(/<div[^>]*class="[^"]*mainContent[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/);
  if (bodyMatch) {
    result.raw_text = bodyMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 10000);
  }

  return result;
}

// 캐릭터에서 관계 키워드 추출
function extractRelationships(content, slug) {
  const rels = [];
  const text = content.raw_text || content.summary || '';

  // 인포박스에서 관계 정보
  const relKeys = ['主君', '配偶', '父亲', '母亲', '子女', '兄弟', '师父', '弟子', '盟友', '敌人'];
  for (const key of relKeys) {
    if (content.infobox[key]) {
      rels.push({ type: key, value: content.infobox[key] });
    }
  }

  return rels;
}

// === 메인 실행 ===
async function main() {
  console.log(`=== 百度百科 삼국지 크롤링 ===`);
  console.log(`대상: ${allTargets.length}개 (캐릭터 ${characters.length} + 지리 ${geography.length} + 전투 ${battles.length} + 주제 ${topics.length})`);

  let success = 0, fail = 0, skip = 0;

  for (let i = 0; i < allTargets.length; i++) {
    const target = allTargets[i];
    const outFile = resolve(OUT_DIR, `${target.slug}.json`);

    // 이미 수집된 파일 스킵
    if (existsSync(outFile)) {
      skip++;
      continue;
    }

    console.log(`[${i + 1}/${allTargets.length}] ${target.baidu} (${target.cat})`);

    const page = await fetchBaiduPage(target.baidu, target.baidu_suffix);
    if (!page) {
      fail++;
      await sleep(DELAY_MS);
      continue;
    }

    const content = extractContent(page.html, target.baidu);
    const relationships = target.cat === 'character' ? extractRelationships(content, target.slug) : [];

    const output = {
      slug: target.slug,
      category: target.cat,
      baidu_term: target.baidu,
      url: page.url,
      crawled_at: new Date().toISOString(),
      title: content.title,
      summary: content.summary,
      sections: content.sections,
      infobox: content.infobox,
      relationships,
      section_count: content.sections.length,
      has_infobox: Object.keys(content.infobox).length > 0,
    };

    writeFileSync(outFile, JSON.stringify(output, null, 2));
    success++;

    if (content.sections.length === 0 && !content.summary) {
      console.log(`  ⚠ 내용 없음 (봇 차단 가능)`);
    } else {
      console.log(`  ✓ ${content.sections.length}섹션, 인포박스 ${Object.keys(content.infobox).length}항목, 관계 ${relationships.length}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n=== 완료 ===`);
  console.log(`성공: ${success}, 실패: ${fail}, 스킵: ${skip}`);
  console.log(`출력: ${OUT_DIR}/`);
}

main().catch(console.error);
