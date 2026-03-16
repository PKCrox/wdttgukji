#!/usr/bin/env node
/**
 * AI soul.md 생성 파이프라인
 *
 * 크롤된 나무위키 데이터 + Koei 능력치 + 조조/유비 few-shot 예시
 * → GPT-4o-mini로 soul.md 자동 생성
 *
 * Usage:
 *   node scripts/generate/generate-soul.js                  # 미생성된 전원
 *   node scripts/generate/generate-soul.js --name 장료      # 특정 캐릭터
 *   node scripts/generate/generate-soul.js --tier 0         # Tier 0만
 *   node scripts/generate/generate-soul.js --force           # 기존 파일 덮어쓰기
 *   node scripts/generate/generate-soul.js --dry-run         # API 호출 없이 프롬프트만 출력
 *
 * Requires: OPENAI_API_KEY (env or ../../.env or ../../../vibechanbob/.env.local)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const BIOS_DIR = join(ROOT, 'data', 'raw', 'characters-namu-bios');
const STATS_FILE = join(ROOT, 'data', 'raw', 'characters-rotk11-stats.json');
const OUT_DIR = join(ROOT, 'data', 'characters');

// ── API Key 로드 ──
function loadApiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const envPaths = [
    join(ROOT, '.env'),
    join(ROOT, '.env.local'),
    join(ROOT, '..', 'vibechanbob', '.env.local'),
  ];
  for (const p of envPaths) {
    try {
      const content = readFileSync(p, 'utf-8');
      const match = content.match(/^OPENAI_API_KEY=(.+)$/m);
      if (match) return match[1].trim();
    } catch { /* skip */ }
  }
  return null;
}

// ── CLI ──
const args = process.argv.slice(2);
const getArg = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const hasFlag = (f) => args.includes(f);

const nameFilter = getArg('--name');
const tierFilter = getArg('--tier');
const force = hasFlag('--force');
const dryRun = hasFlag('--dry-run');

// ── 데이터 로드 ──
function loadStats() {
  try {
    const raw = JSON.parse(readFileSync(STATS_FILE, 'utf-8'));
    const map = {};
    for (const c of raw.data) map[c.name_kr] = c;
    return map;
  } catch { return {}; }
}

function loadBio(nameEn) {
  const filename = nameEn.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '.json';
  const path = join(BIOS_DIR, filename);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function loadFewShot() {
  const examples = [];
  for (const name of ['cao-cao', 'liu-bei']) {
    const path = join(OUT_DIR, `${name}.soul.md`);
    if (existsSync(path)) {
      examples.push(readFileSync(path, 'utf-8'));
    }
  }
  return examples;
}

// ── 프롬프트 구성 ──
function buildPrompt(bio, stats, fewShots) {
  // soul_relevant에서 핵심 텍스트 추출 (토큰 제한 고려 — 각 섹션 최대 3000자)
  const MAX_SECTION = 3000;
  const relevantSections = {};
  if (bio.soul_relevant) {
    for (const [key, val] of Object.entries(bio.soul_relevant)) {
      if (val && val.length > 0) {
        relevantSections[key] = val.length > MAX_SECTION ? val.substring(0, MAX_SECTION) + '...(생략)' : val;
      }
    }
  }

  // 능력치 정보
  let statsBlock = '(능력치 데이터 없음)';
  if (stats) {
    statsBlock = `통솔: ${stats.leadership}, 무력: ${stats.war}, 지력: ${stats.intelligence}, 정치: ${stats.politics}, 매력: ${stats.charisma}`;
    if (stats.birth) statsBlock += `, 생년: ${stats.birth}`;
    if (stats.death) statsBlock += `, 몰년: ${stats.death}`;
  }

  const system = `너는 삼국지 역사/연의 전문가이자 게임 캐릭터 설계자다.
주어진 나무위키 자료와 Koei 삼국지 능력치를 바탕으로, AI 시뮬레이션용 캐릭터 프로파일(soul.md)을 작성한다.

규칙:
1. 정사(삼국지)와 연의(삼국지연의) 모두 참고하되, 연의 기반으로 캐릭터성을 잡는다
2. 능력치 해석은 Koei 삼국지 시리즈의 관례를 따른다
3. 성격 프로파일은 구체적 에피소드 기반으로 작성 (추상적 묘사 금지)
4. 대화 톤에는 실제 어록/명대사를 인용한다
5. 행동 근거는 게임 AI가 참조할 수 있도록 조건→행동 형태로 작성
6. 핵심 관계는 강도(0-100)를 수치화하고 근거를 명시
7. 한국어로 작성`;

  const fewShotBlock = fewShots.length > 0
    ? `\n\n=== 예시 (조조, 유비 soul.md) ===\n\n${fewShots.map((ex, i) => `--- 예시 ${i + 1} ---\n${ex}`).join('\n\n')}\n\n=== 예시 끝 ===`
    : '';

  const user = `다음 캐릭터의 soul.md를 작성해줘. 예시(조조, 유비)와 동일한 형식과 깊이로 작성해야 한다.

## 캐릭터 기본 정보
- 이름(한): ${bio.name_kr}
- 이름(영): ${bio.name_en}
- 이름(중): ${bio.name_cn}
- 자(한): ${bio.courtesy_kr || '불명'}
- 자(중): ${bio.courtesy_cn || '불명'}
- 진영: ${bio.faction}
- 역할: ${bio.role}
- Tier: ${bio.tier}

## Koei 삼국지 11 능력치
${statsBlock}

## 나무위키 자료 (핵심 섹션)
${Object.entries(relevantSections).map(([k, v]) => `### ${k}\n${v}`).join('\n\n')}

${fewShotBlock}

위 자료를 바탕으로 soul.md를 작성해줘. 반드시 예시와 동일한 섹션 구조를 따를 것:
1. 헤더 (# 이름)
2. 능력치 테이블 + 티어 + 특성 해석
3. 서사적 중요도
4. 성격 프로파일 (기질, 가치관, 의사결정 패턴, 대인 관계, 대화 톤)
5. 행동 근거 (전략 상황, 인재 등용, 이벤트 반응)
6. 핵심 관계 테이블
7. 메타 정보 — 반드시 아래 형식 사용:
   - **생산 방식**: Tier ${bio.tier} (AI 생성, GPT-4o-mini)
   - **검증 상태**: 초안 — 역사 고증 검수 필요
   - **소스**: 삼국지11 능력치, 나무위키

중요:
- 대화 톤에는 반드시 실제 명대사/어록을 인용할 것 (나무위키 자료에서 추출)
- 핵심 관계 테이블에는 최소 5명 포함
- 행동 근거는 실제 에피소드를 기반으로 구체적으로 작성
- 서사적 중요도에는 실제 참여한 전투/사건을 정확히 기재

마크다운만 출력. 다른 설명 없이 soul.md 내용만.`;

  return { system, user };
}

// ── GPT API 호출 ──
async function callGPT(apiKey, system, user) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GPT API ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

// ── 메인 ──
async function main() {
  const apiKey = loadApiKey();
  if (!apiKey && !dryRun) {
    console.error('OPENAI_API_KEY 없음. --dry-run으로 프롬프트만 확인 가능.');
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const statsMap = loadStats();
  const fewShots = loadFewShot();

  // character-list.js에서 가져오기
  const { ALL_CHARACTERS } = await import('../crawl/character-list.js');

  // 대상 선정
  let targets = ALL_CHARACTERS;
  if (nameFilter) {
    targets = targets.filter(c => c.name_kr === nameFilter || c.name_en.toLowerCase() === nameFilter.toLowerCase());
  }
  if (tierFilter !== undefined) {
    targets = targets.filter(c => c.tier === parseInt(tierFilter));
  }

  // 이미 수작업된 Tier 0 예시는 스킵 (force가 아니면)
  const manualSouls = ['cao-cao', 'liu-bei'];
  if (!force) {
    targets = targets.filter(c => {
      const filename = c.name_en.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      return !manualSouls.includes(filename);
    });
  }

  // 이미 생성된 것 스킵
  if (!force) {
    targets = targets.filter(c => {
      const filename = c.name_en.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '.soul.md';
      return !existsSync(join(OUT_DIR, filename));
    });
  }

  console.log(`\n🎭 AI soul.md 생성 파이프라인`);
  console.log(`   대상: ${targets.length}명`);
  console.log(`   few-shot 예시: ${fewShots.length}개`);
  console.log(`   모드: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`   출력: ${OUT_DIR}\n`);

  if (targets.length === 0) {
    console.log('생성할 캐릭터가 없습니다. --force로 덮어쓰기 가능.');
    return;
  }

  const results = { success: [], failed: [], skipped: [] };

  for (let i = 0; i < targets.length; i++) {
    const char = targets[i];
    const bio = loadBio(char.name_en);

    if (!bio) {
      console.log(`  [${i + 1}/${targets.length}] ${char.name_kr} ⏭ 크롤 데이터 없음`);
      results.skipped.push(char.name_kr);
      continue;
    }

    const stats = statsMap[char.name_kr] || null;
    const { system, user } = buildPrompt(bio, stats, fewShots);

    const filename = char.name_en.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '.soul.md';
    const outPath = join(OUT_DIR, filename);

    if (dryRun) {
      console.log(`  [${i + 1}/${targets.length}] ${char.name_kr} — DRY RUN`);
      console.log(`    system: ${system.length}자`);
      console.log(`    user: ${user.length}자`);
      console.log(`    stats: ${stats ? 'OK' : 'MISSING'}`);
      console.log(`    bio sections: ${Object.keys(bio.soul_relevant || {}).filter(k => bio.soul_relevant[k]).join(', ')}`);
      results.success.push(char.name_kr);
      continue;
    }

    console.log(`  [${i + 1}/${targets.length}] ${char.name_kr} (${char.name_en}) 생성 중...`);

    try {
      const soulMd = await callGPT(apiKey, system, user);
      writeFileSync(outPath, soulMd, 'utf-8');
      console.log(`    ✅ ${soulMd.length.toLocaleString()}자 → ${filename}`);
      results.success.push(char.name_kr);
    } catch (err) {
      console.error(`    ❌ ${err.message}`);
      results.failed.push({ name: char.name_kr, error: err.message });
    }

    // Rate limit: 3초 간격
    if (i < targets.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`🏁 완료: ✅${results.success.length} ⏭${results.skipped.length} ❌${results.failed.length}`);
  if (results.failed.length > 0) {
    for (const f of results.failed) console.log(`   ❌ ${f.name}: ${f.error}`);
  }
  console.log(`${'═'.repeat(50)}\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
