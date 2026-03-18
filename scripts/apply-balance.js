/**
 * 스탯 밸런싱 적용 — stat-balance-adjustments.json의 proposed 스탯을
 * soul.md 파일과 208 시나리오에 반영
 */
import { readFileSync, writeFileSync } from 'fs';

const adj = JSON.parse(readFileSync('data/processed/stat-balance-adjustments.json','utf8'));
const SCENARIO = 'engine/data/scenarios/208-red-cliffs.json';

let soulFixed = 0, scenarioFixed = 0;

// 1. soul.md 스탯 업데이트
for (const a of adj.adjustments) {
  const path = `data/characters/${a.slug}.soul.md`;
  let md;
  try { md = readFileSync(path, 'utf8'); } catch { continue; }

  const { currentStats: cur, proposedStats: prop } = a;
  const oldTotal = cur.command + cur.war + cur.intellect + cur.politics + cur.charisma;
  const newTotal = prop.command + prop.war + prop.intellect + prop.politics + prop.charisma;

  // 기존 스탯 행 찾아서 교체
  const oldLine = `| ${cur.command} | ${cur.war} | ${cur.intellect} | ${cur.politics} | ${cur.charisma} | ${oldTotal} |`;
  const newLine = `| ${prop.command} | ${prop.war} | ${prop.intellect} | ${prop.politics} | ${prop.charisma} | ${newTotal} |`;

  if (md.includes(oldLine)) {
    md = md.replace(oldLine, newLine);
    writeFileSync(path, md);
    soulFixed++;
  }
}

// 2. 시나리오 스탯 업데이트
const scenario = JSON.parse(readFileSync(SCENARIO, 'utf8'));
for (const a of adj.adjustments) {
  const id = a.slug.replace(/-/g, '_');
  const char = scenario.characters[id];
  if (!char) continue;

  const { proposedStats: prop } = a;
  char.stats = { ...prop };
  // potential도 업데이트 (stats + 10, cap 100)
  char.potential = {};
  for (const [k, v] of Object.entries(prop)) {
    char.potential[k] = Math.min(100, v + 10);
  }
  scenarioFixed++;
}
writeFileSync(SCENARIO, JSON.stringify(scenario, null, 2));

console.log(`Soul.md fixed: ${soulFixed}/${adj.adjustments.length}`);
console.log(`Scenario fixed: ${scenarioFixed}`);

// 주요 보정 내역 출력
console.log('\nKey corrections:');
for (const a of adj.adjustments.slice(0, 15)) {
  const diffs = Object.entries(a.diffs).map(([k,d]) => `${k}: ${d.current}→${a.proposedStats[k]}`).join(', ');
  console.log(`  ${a.name_kr} (${a.slug}): ${diffs}`);
}
