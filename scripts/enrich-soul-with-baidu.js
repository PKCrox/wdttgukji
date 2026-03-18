#!/usr/bin/env node
// enrich-soul-with-baidu.js — 바이두 관계/전투 데이터로 soul.md 역주입
// 926 관계 엣지 + 39 전투 참전 정보 → 기존 soul.md 관계 테이블 + 전투 이력 보강

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';

const SOUL_DIR = 'data/characters';
const REL_FILE = 'data/processed/relationship-graph.json';
const BATTLE_FILE = 'data/processed/battles-structured.json';

// === 데이터 로드 ===
const relData = JSON.parse(readFileSync(REL_FILE, 'utf8'));
const battleData = JSON.parse(readFileSync(BATTLE_FILE, 'utf8'));

// 관계를 캐릭터별로 인덱싱
const relIndex = {}; // slug → [{target, type, intensity, evidence}]
const edges = relData.edges || relData.relationships || [];
for (const r of edges) {
  const a = r.a, b = r.b;
  if (!relIndex[a]) relIndex[a] = [];
  if (!relIndex[b]) relIndex[b] = [];
  relIndex[a].push({ target: b, type: r.type, intensity: r.intensity, evidence: r.evidence, source: r.source });
  relIndex[b].push({ target: a, type: r.type, intensity: r.intensity, evidence: r.evidence, source: r.source });
}

// 전투를 참전 캐릭터별로 인덱싱
const battleIndex = {}; // slug → [{battle_name, role, side, strategies}]
for (const b of battleData.battles) {
  const allCommanders = [];
  if (b.commanders) {
    for (const side of b.commanders) {
      for (const cmd of side) {
        if (cmd.slug) {
          allCommanders.push(cmd.slug);
        }
      }
    }
  }
  for (const slug of allCommanders) {
    if (!battleIndex[slug]) battleIndex[slug] = [];
    battleIndex[slug].push({
      name_cn: b.name_cn,
      name_kr: b.name_kr,
      date: b.date,
      result: b.result,
      strategies: b.strategies.map(s => s.type),
    });
  }
}

// 관계 타입 한글 매핑
const typeKr = {
  'lord_vassal': '군신', 'spouse': '부부', 'parent_child': '부자',
  'succession': '계승', 'family': '가족', 'collateral': '방계',
  'sworn_brothers': '의형제', 'defection': '귀순', 'betrayal': '배신',
  'marriage': '혼인', 'apprentice': '사제', 'nemesis': '숙적',
  'close_friend': '친우', 'fellow_student': '동문', 'mentioned': '언급',
  // 기존 그래프 타입
  '귀순': '귀순', '배신': '배신', '혼인': '혼인', '가족': '가족',
  '친우': '친우', '숙적': '숙적', '의형제': '의형제', '군신': '군신',
  '부부': '부부', '부자': '부자', '방계': '방계', '사제': '사제',
  '적대': '적대', '계승': '계승', '형제': '형제', '우정': '우정',
};

// slug → 한글명 매핑 (soul.md 파일명에서 추출)
const slugToKr = {};
const soulFiles = readdirSync(SOUL_DIR).filter(f => f.endsWith('.soul.md'));
for (const f of soulFiles) {
  const fileSlug = f.replace('.soul.md', '');
  const underscoreSlug = fileSlug.replace(/-/g, '_');
  const content = readFileSync(`${SOUL_DIR}/${f}`, 'utf8');
  const nameMatch = content.match(/^#\s+(.+?)[\s(（]/m);
  if (nameMatch) {
    slugToKr[underscoreSlug] = nameMatch[1].trim();
    slugToKr[fileSlug] = nameMatch[1].trim();
  }
}

// === soul.md 보강 ===
let enriched = 0, skipped = 0;

for (const f of soulFiles) {
  const fileSlug = f.replace('.soul.md', '');
  // soul.md uses hyphens (cao-cao), relationship graph uses underscores (cao_cao)
  const slug = fileSlug.replace(/-/g, '_');
  const rels = relIndex[slug] || [];
  const battles = battleIndex[slug] || [];

  // 언급 타입(intensity 30)은 제외, 중요한 관계만
  const significantRels = rels
    .filter(r => r.type !== 'mentioned' && r.intensity >= 40)
    .sort((a, b) => b.intensity - a.intensity);

  // 중복 타겟 제거 (같은 타겟의 가장 높은 강도만)
  const seen = new Set();
  const uniqueRels = [];
  for (const r of significantRels) {
    if (!seen.has(r.target)) {
      seen.add(r.target);
      uniqueRels.push(r);
    }
  }

  if (uniqueRels.length === 0 && battles.length === 0) {
    skipped++;
    continue;
  }

  let content = readFileSync(`${SOUL_DIR}/${f}`, 'utf8');
  let changed = false;

  // --- 바이두 관계 보강 섹션 추가 ---
  if (uniqueRels.length > 0) {
    // 기존 관계 테이블에 이미 있는 대상 확인
    const existingRels = new Set();
    const relTableRegex = /\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*(.+?)\s*\|/g;
    let rm;
    while ((rm = relTableRegex.exec(content)) !== null) {
      existingRels.add(rm[1].trim());
    }

    // 새로운 관계만 필터
    const newRels = uniqueRels.filter(r => {
      const targetName = slugToKr[r.target] || r.target;
      return !existingRels.has(targetName) && !existingRels.has(r.target);
    }).slice(0, 15); // 최대 15개

    if (newRels.length > 0) {
      const relSection = `\n## 바이두 관계 (자동 추출)\n\n| 대상 | 관계 | 강도 | 근거 |\n|---|---|---|---|\n` +
        newRels.map(r => {
          const name = slugToKr[r.target] || r.target;
          const type = typeKr[r.type] || r.type;
          const evidence = (r.evidence || '').slice(0, 60).replace(/\|/g, '/');
          return `| ${name} | ${type} | ${r.intensity} | ${evidence} |`;
        }).join('\n') + '\n';

      // 메타 정보 섹션 앞에 삽입, 없으면 끝에 추가
      if (content.includes('## 메타 정보') || content.includes('## 메타')) {
        content = content.replace(/(## 메타\s*(정보)?)/, relSection + '\n$1');
      } else {
        content += '\n' + relSection;
      }
      changed = true;
    }
  }

  // --- 전투 참전 이력 추가 ---
  if (battles.length > 0 && !content.includes('## 전투 참전 이력')) {
    const battleSection = `\n## 전투 참전 이력 (바이두 추출)\n\n| 전투 | 시기 | 결과 | 전략 |\n|---|---|---|---|\n` +
      battles.map(b => {
        const strats = b.strategies.length > 0 ? b.strategies.join(', ') : '-';
        return `| ${b.name_kr || b.name_cn} | ${b.date || '?'} | ${(b.result || '?').slice(0, 30)} | ${strats} |`;
      }).join('\n') + '\n';

    if (content.includes('## 메타 정보') || content.includes('## 메타')) {
      content = content.replace(/(## 메타\s*(정보)?)/, battleSection + '\n$1');
    } else if (content.includes('## 바이두 관계')) {
      content = content.replace(/(## 바이두 관계[\s\S]*?\n\n)/, '$1' + battleSection + '\n');
    } else {
      content += '\n' + battleSection;
    }
    changed = true;
  }

  if (changed) {
    writeFileSync(`${SOUL_DIR}/${f}`, content);
    enriched++;
    const relCount = uniqueRels.filter(r => {
      const targetName = slugToKr[r.target] || r.target;
      return true; // count all for logging
    }).length;
    console.log(`  ✓ ${slug}: +${uniqueRels.length} 관계, +${battles.length} 전투`);
  } else {
    skipped++;
  }
}

console.log(`\n=== soul.md 보강 완료 ===`);
console.log(`보강: ${enriched}명, 스킵: ${skipped}명 (신규 데이터 없음)`);
console.log(`총 soul.md: ${soulFiles.length}`);
console.log(`관계 인덱스: ${Object.keys(relIndex).length}명`);
console.log(`전투 인덱스: ${Object.keys(battleIndex).length}명`);
