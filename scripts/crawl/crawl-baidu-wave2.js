#!/usr/bin/env node
// crawl-baidu-wave2.js — 百度百科 2차 대규모 크롤링
// 캐릭터 150+ / 전투 30+ / 유명 사건 / 세력 / 군사제도
// 기존 수집분 자동 스킵

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { resolve } from 'path';

const OUT_DIR = 'data/raw/baidu';
mkdirSync(OUT_DIR, { recursive: true });

const DELAY_MS = 1500;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ═══════════════════════════════════════
// 수집 대상 정의
// ═══════════════════════════════════════

// === 1. 캐릭터 2차 (150명) — Tier 1+2 핵심 ===
const characters2 = [
  // 위 - 모사/장수
  { slug:'cao-ren', baidu:'曹仁' }, { slug:'cao-hong', baidu:'曹洪' },
  { slug:'cao-zhen', baidu:'曹真' }, { slug:'cao-xiu', baidu:'曹休' },
  { slug:'cao-zhi', baidu:'曹植' }, { slug:'cao-zhang', baidu:'曹彰' },
  { slug:'cao-chong', baidu:'曹冲' }, { slug:'cao-rui', baidu:'曹睿' },
  { slug:'cao-ang', baidu:'曹昂' },
  { slug:'xun-you', baidu:'荀攸' }, { slug:'cheng-yu', baidu:'程昱' },
  { slug:'liu-ye', baidu:'刘晔' }, { slug:'man-chong', baidu:'满宠' },
  { slug:'yu-jin', baidu:'于禁' }, { slug:'yue-jin', baidu:'乐进' },
  { slug:'li-dian', baidu:'李典' }, { slug:'wen-pin', baidu:'文聘' },
  { slug:'chen-qun', baidu:'陈群' }, { slug:'jia-kui', baidu:'贾逵' },
  { slug:'sima-lang', baidu:'司马朗' }, { slug:'zhong-yao', baidu:'钟繇' },
  { slug:'wang-lang', baidu:'王朗' }, { slug:'hua-xin', baidu:'华歆' },
  { slug:'xu-you', baidu:'许攸' }, { slug:'chen-lin', baidu:'陈琳' },
  { slug:'xiahou-ba', baidu:'夏侯霸' }, { slug:'xiahou-shang', baidu:'夏侯尚' },
  { slug:'cao-chun', baidu:'曹纯' }, { slug:'wen-yang', baidu:'文鸯' },
  { slug:'zhuge-dan', baidu:'诸葛诞' }, { slug:'deng-zhi', baidu:'邓芝' },
  { slug:'wang-ping', baidu:'王平' }, { slug:'wen-qin', baidu:'文钦' },
  // 촉 - 모사/장수
  { slug:'ma-liang', baidu:'马良' }, { slug:'ma-su', baidu:'马谡' },
  { slug:'jiang-wan', baidu:'蒋琬' }, { slug:'fei-yi', baidu:'费祎' },
  { slug:'dong-yun', baidu:'董允' }, { slug:'li-yan', baidu:'李严' },
  { slug:'liu-feng', baidu:'刘封' }, { slug:'meng-da', baidu:'孟达' },
  { slug:'guan-xing', baidu:'关兴' }, { slug:'zhang-bao', baidu:'张苞' },
  { slug:'guan-ping', baidu:'关平' }, { slug:'liu-shan', baidu:'刘禅' },
  { slug:'liao-hua', baidu:'廖化' }, { slug:'wang-ping', baidu:'王平' },
  { slug:'ma-dai', baidu:'马岱' }, { slug:'yan-yan', baidu:'严颜' },
  { slug:'huang-yueying', baidu:'黄月英' }, { slug:'mi-zhu', baidu:'糜竺' },
  { slug:'jian-yong', baidu:'简雍' }, { slug:'sun-qian', baidu:'孙乾' },
  { slug:'qiao-zhou', baidu:'谯周' }, { slug:'fei-shi', baidu:'费诗' },
  { slug:'zhang-yi', baidu:'张翼' }, { slug:'luo-xian', baidu:'罗宪' },
  // 오 - 모사/장수
  { slug:'zhang-zhao', baidu:'张昭' }, { slug:'gu-yong', baidu:'顾雍' },
  { slug:'kan-ze', baidu:'阚泽' }, { slug:'yu-fan', baidu:'虞翻' },
  { slug:'cheng-pu', baidu:'程普' }, { slug:'han-dang', baidu:'韩当' },
  { slug:'zhou-tai', baidu:'周泰' }, { slug:'ling-tong', baidu:'凌统' },
  { slug:'ding-feng', baidu:'丁奉' }, { slug:'pan-zhang', baidu:'潘璋' },
  { slug:'zhu-ran', baidu:'朱然' }, { slug:'lu-kang', baidu:'陆抗' },
  { slug:'zhuge-ke', baidu:'诸葛恪' }, { slug:'sun-deng', baidu:'孙登' },
  { slug:'sun-huan', baidu:'孙桓' }, { slug:'bu-zhi', baidu:'步骘' },
  { slug:'xu-sheng', baidu:'徐盛' }, { slug:'zhu-huan', baidu:'朱桓' },
  { slug:'lv-dai', baidu:'吕岱' }, { slug:'quan-cong', baidu:'全琮' },
  // 여성
  { slug:'sun-shangxiang', baidu:'孙尚香' }, { slug:'da-qiao', baidu:'大乔' },
  { slug:'xiao-qiao', baidu:'小乔' }, { slug:'lady-zhen', baidu:'甄姬' },
  { slug:'cai-wenji', baidu:'蔡文姬' },
  // 군벌/독립세력
  { slug:'chen-gong', baidu:'陈宫' }, { slug:'gao-shun', baidu:'高顺' },
  { slug:'zhang-xiu', baidu:'张绣' }, { slug:'ma-teng', baidu:'马腾' },
  { slug:'han-sui', baidu:'韩遂' }, { slug:'gongsun-zan', baidu:'公孙瓒' },
  { slug:'tao-qian', baidu:'陶谦' }, { slug:'kong-rong', baidu:'孔融' },
  { slug:'liu-yan', baidu:'刘焉' }, { slug:'zhang-song', baidu:'张松' },
  { slug:'zhang-ren', baidu:'张任' }, { slug:'wang-yun', baidu:'王允' },
  { slug:'lu-zhi', baidu:'卢植' }, { slug:'huangfu-song', baidu:'皇甫嵩' },
  { slug:'he-jin', baidu:'何进' },
  // 원소 세력
  { slug:'yuan-tan', baidu:'袁谭' }, { slug:'yuan-shang', baidu:'袁尚' },
  { slug:'shen-pei', baidu:'审配' }, { slug:'tian-feng', baidu:'田丰' },
  { slug:'ju-shou', baidu:'沮授' }, { slug:'yan-liang', baidu:'颜良' },
  { slug:'wen-chou', baidu:'文丑' }, { slug:'gao-lan', baidu:'高览' },
  // 후기 진
  { slug:'sima-yan', baidu:'司马炎' }, { slug:'du-yu', baidu:'杜预' },
  { slug:'yang-hu', baidu:'羊祜' }, { slug:'wang-jun', baidu:'王濬' },
  // 의사/학자/명사
  { slug:'hua-tuo', baidu:'华佗' }, { slug:'zhang-jiao', baidu:'张角' },
  { slug:'zuo-ci', baidu:'左慈' }, { slug:'guan-lu', baidu:'管辂' },
  { slug:'xi-zhicai', baidu:'戏志才' },
  // 남만
  { slug:'meng-you', baidu:'孟优' }, { slug:'shamoke', baidu:'沙摩柯' },
].map(c => ({ ...c, cat: 'character' }));

// === 2. 전투 2차 (35건) ===
const battles2 = [
  { slug:'battle-bowang', baidu:'博望坡之战' },
  { slug:'battle-xinye', baidu:'新野之战' },
  { slug:'battle-hanzhong', baidu:'汉中之战' },
  { slug:'battle-jiangling', baidu:'江陵之战' },
  { slug:'battle-xiangyang', baidu:'樊城之战' },
  { slug:'battle-ruxukou', baidu:'濡须口之战' },
  { slug:'battle-xiaoyao', baidu:'逍遥津之战' },
  { slug:'battle-hanshui', baidu:'汉水之战' },
  { slug:'battle-shouchun', baidu:'寿春之战' },
  { slug:'battle-chencang', baidu:'陈仓之战' },
  { slug:'battle-wuzhang2', baidu:'五丈原之战' },
  { slug:'battle-tielung', baidu:'铁笼山之战' },
  { slug:'battle-mianzhu', baidu:'绵竹之战' },
  { slug:'battle-luocheng', baidu:'雒城之战' },
  { slug:'battle-jiameng', baidu:'葭萌关之战' },
  { slug:'battle-tianshuiguan', baidu:'天水关之战' },
  { slug:'battle-nanman', baidu:'南蛮之战' },
  { slug:'battle-jieqiao', baidu:'界桥之战' },
  { slug:'battle-yangren', baidu:'阳人之战' },
  { slug:'battle-puyang', baidu:'兖州之战' },
  { slug:'battle-xuzhou', baidu:'徐州之战' },
  { slug:'battle-shiting', baidu:'石亭之战' },
  { slug:'battle-dongxing', baidu:'东兴之战' },
  { slug:'battle-jiange', baidu:'剑阁之战' },
  { slug:'battle-chengdu-fall', baidu:'蜀汉灭亡' },
  { slug:'battle-wu-fall', baidu:'西晋灭吴之战' },
  { slug:'battle-xiangping', baidu:'襄平之战' },
  { slug:'battle-baidi', baidu:'白帝城托孤' },
  { slug:'battle-dingmilitao', baidu:'讨伐董卓' },
  { slug:'battle-yellowturban', baidu:'黄巾起义' },
  { slug:'battle-hulao2', baidu:'汜水关之战' },
].map(b => ({ ...b, cat: 'battle' }));

// === 3. 유명 사건·계략 (30건) ===
const events = [
  { slug:'event-taoyuan', baidu:'桃园三结义' },
  { slug:'event-sangucaolu', baidu:'三顾茅庐' },
  { slug:'event-kongchengji', baidu:'空城计' },
  { slug:'event-caochuanjiejian', baidu:'草船借箭' },
  { slug:'event-lianhuanji', baidu:'连环计' },
  { slug:'event-jiedonghfeng', baidu:'借东风' },
  { slug:'event-qiqinmenghuo', baidu:'七擒孟获' },
  { slug:'event-danaochangban', baidu:'长坂坡' },
  { slug:'event-guanyu-wuguan', baidu:'过五关斩六将' },
  { slug:'event-jiuxi', baidu:'九锡' },
  { slug:'event-chushipiao', baidu:'出师表' },
  { slug:'event-longzhongdui', baidu:'隆中对' },
  { slug:'event-tongquefu', baidu:'铜雀台赋' },
  { slug:'event-meiren-ji', baidu:'美人计' },
  { slug:'event-huarong-dao', baidu:'华容道' },
  { slug:'event-shanyang-gong', baidu:'禅让' },
  { slug:'event-jianandiliu', baidu:'建安七子' },
  { slug:'event-zhugeliang-beifa', baidu:'诸葛亮北伐' },
  { slug:'event-jiangwei-beifa', baidu:'姜维北伐' },
  { slug:'event-gaopingling', baidu:'高平陵之变' },
  { slug:'event-yijuyi-tuogu', baidu:'白帝城托孤' },
  { slug:'event-guanyu-death', baidu:'关羽之死' },
  { slug:'event-lvbu-death', baidu:'白门楼' },
  { slug:'event-chibifu', baidu:'赤壁赋' },
  { slug:'event-duanyi-guojiang', baidu:'单刀赴会' },
].map(e => ({ ...e, cat: 'event' }));

// === 4. 세력·국가 (10건) ===
const factions = [
  { slug:'faction-caowei', baidu:'曹魏' },
  { slug:'faction-shuhan', baidu:'蜀汉' },
  { slug:'faction-dongwu', baidu:'东吴' },
  { slug:'faction-dong-zhuo', baidu:'董卓集团' },
  { slug:'faction-yuan-shao', baidu:'袁绍' },
  { slug:'faction-yuan-shu', baidu:'袁术' },
  { slug:'faction-gongsun', baidu:'辽东公孙氏' },
  { slug:'faction-liu-biao', baidu:'刘表' },
  { slug:'faction-western-jin', baidu:'西晋' },
  { slug:'faction-wuhuan', baidu:'乌桓' },
].map(f => ({ ...f, cat: 'faction' }));

// === 5. 군사·제도·문화 (15건) ===
const systems = [
  { slug:'sys-hubaoji', baidu:'虎豹骑' },
  { slug:'sys-wuwei', baidu:'五校尉' },
  { slug:'sys-badu', baidu:'八阵图' },
  { slug:'sys-zhugenu', baidu:'诸葛连弩' },
  { slug:'sys-mutongniu', baidu:'木牛流马' },
  { slug:'sys-tuntian', baidu:'屯田' },
  { slug:'sys-jiupin', baidu:'九品中正制' },
  { slug:'sys-juntun', baidu:'军屯' },
  { slug:'sys-xishi', baidu:'西蜀' },
  { slug:'sys-fangtianhalberd', baidu:'方天画戟' },
  { slug:'sys-qinglongyanyue', baidu:'青龙偃月刀' },
  { slug:'sys-zhangbashemao', baidu:'丈八蛇矛' },
  { slug:'sys-qilinsword', baidu:'倚天剑' },
  { slug:'sys-bimosword', baidu:'青釭剑' },
  { slug:'sys-jiananzhi', baidu:'建安文学' },
].map(s => ({ ...s, cat: 'system' }));

const allTargets = [...characters2, ...battles2, ...events, ...factions, ...systems];

// === 크롤링 엔진 (1차와 동일 + 전투 특화 파서) ===
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchBaiduPage(term) {
  const url = `https://baike.baidu.com/item/${encodeURIComponent(term)}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'zh-CN,zh;q=0.9' },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return { url, html: await res.text(), term };
  } catch { return null; }
}

function extractContent(html, term) {
  const result = { title: term, summary: '', sections: [], infobox: {}, battle_data: null };

  // 제목
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  if (titleMatch) result.title = titleMatch[1].trim();

  // 요약
  const summaryMatch = html.match(/<div[^>]*class="[^"]*lemma-summary[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  if (summaryMatch) result.summary = summaryMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (!result.summary) {
    const metaMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/);
    if (metaMatch) result.summary = metaMatch[1].trim();
  }

  // 섹션
  const sectionRegex = /<h([23])[^>]*(?:data-level="\d")?[^>]*>([\s\S]*?)<\/h[23]>/g;
  let match; const headings = [];
  while ((match = sectionRegex.exec(html)) !== null) {
    const text = match[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim();
    if (text && text !== '目录' && text.length < 100) headings.push({ heading: text, level: parseInt(match[1]), index: match.index });
  }
  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].index;
    const end = i + 1 < headings.length ? headings[i + 1].index : start + 10000;
    const sectionHtml = html.slice(start, Math.min(end, start + 10000));
    const text = sectionHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (text.length > 20) result.sections.push({ heading: headings[i].heading, level: headings[i].level, content: text.slice(0, 2000) });
  }

  // 인포박스
  const infoRegex = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g;
  while ((match = infoRegex.exec(html)) !== null) {
    const key = match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').replace(/\s+/g, '').trim();
    const val = match[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').replace(/\s+/g, ' ').trim();
    if (key && val && key.length < 30) result.infobox[key] = val;
  }

  // 전투 특화: 구조화된 전투 데이터 추출
  const battleFields = ['参战方', '参战方兵力', '伤亡情况', '主要指挥官', '结果', '发生时间', '地点', '战争意义', '历史意义'];
  const hasBattleData = battleFields.some(f => result.infobox[f]);
  if (hasBattleData) {
    result.battle_data = {
      belligerents: (result.infobox['参战方'] || '').split(/[；;,，]/),
      forces: result.infobox['参战方兵力'] || null,
      casualties: result.infobox['伤亡情况'] || null,
      commanders: (result.infobox['主要指挥官'] || '').split(/[；;]/),
      result: result.infobox['结果'] || null,
      date: result.infobox['发生时间'] || null,
      location: result.infobox['地点'] || null,
      significance: result.infobox['战争意义'] || result.infobox['历史意义'] || null,
    };
  }

  return result;
}

// === 메인 ===
async function main() {
  console.log(`=== 百度百科 2차 크롤링 ===`);
  console.log(`대상: ${allTargets.length}개 (캐릭터 ${characters2.length} + 전투 ${battles2.length} + 사건 ${events.length} + 세력 ${factions.length} + 제도 ${systems.length})`);

  let success = 0, fail = 0, skip = 0;

  for (let i = 0; i < allTargets.length; i++) {
    const target = allTargets[i];
    const outFile = resolve(OUT_DIR, `${target.slug}.json`);

    if (existsSync(outFile)) { skip++; continue; }

    process.stdout.write(`[${i + 1}/${allTargets.length}] ${target.baidu} (${target.cat})... `);

    const page = await fetchBaiduPage(target.baidu);
    if (!page) { console.log('FAIL'); fail++; await sleep(DELAY_MS); continue; }

    const content = extractContent(page.html, target.baidu);

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
      battle_data: content.battle_data,
      section_count: content.sections.length,
      has_infobox: Object.keys(content.infobox).length > 0,
    };

    writeFileSync(outFile, JSON.stringify(output, null, 2));
    success++;

    const info = [];
    if (content.sections.length) info.push(`${content.sections.length}섹션`);
    if (Object.keys(content.infobox).length) info.push(`${Object.keys(content.infobox).length}인포`);
    if (content.battle_data) info.push('전투데이터✓');
    console.log(info.join(', ') || '빈 결과');

    await sleep(DELAY_MS);
  }

  console.log(`\n=== 완료 ===`);
  console.log(`성공: ${success}, 실패: ${fail}, 스킵(기존): ${skip}`);

  // 전체 바이두 데이터 통계
  const allFiles = readdirSync(OUT_DIR).filter(f => f.endsWith('.json'));
  const catCount = {};
  let totalSections = 0, totalBattle = 0;
  allFiles.forEach(f => {
    try {
      const d = JSON.parse(readFileSync(`${OUT_DIR}/${f}`, 'utf8'));
      catCount[d.category] = (catCount[d.category] || 0) + 1;
      totalSections += d.section_count || 0;
      if (d.battle_data) totalBattle++;
    } catch {}
  });
  console.log(`\n=== 전체 바이두 인벤토리 ===`);
  console.log(`총 파일: ${allFiles.length}`);
  console.log(`카테고리:`, JSON.stringify(catCount));
  console.log(`총 섹션: ${totalSections}, 전투데이터: ${totalBattle}`);
}

main().catch(console.error);
