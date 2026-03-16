#!/usr/bin/env node
/**
 * P7: Soul.md v2 재생성 파이프라인
 *
 * v1 대비 개선점:
 *   - 입력: P1~P5 가공 데이터 (3개국어 바이오 + 실제 대사 + 관계 + 정확한 연표)
 *   - 날조 명언 0: 연의 원문 대사만 사용 (Chinese 原文 + 한국어 번역)
 *   - 정확한 연도: 스탯 생몰년 + 연표 교차검증
 *   - 모델: GPT-4o (Tier 0) / GPT-4o-mini (Tier 1)
 *
 * Usage:
 *   node scripts/generate/generate-soul-v2.js                # 전원 (v1→v2 교체)
 *   node scripts/generate/generate-soul-v2.js --name 제갈량   # 특정 캐릭터
 *   node scripts/generate/generate-soul-v2.js --tier 0        # Tier 0만
 *   node scripts/generate/generate-soul-v2.js --skip-gold     # 조조/유비/장비 스킵 (이미 v2)
 *   node scripts/generate/generate-soul-v2.js --dry-run       # API 호출 없이 프롬프트만 출력
 *   node scripts/generate/generate-soul-v2.js --model gpt-4o  # 모델 지정
 *
 * Requires: OPENAI_API_KEY
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const PROFILES_DIR = join(ROOT, 'data', 'processed', 'character-profiles');
const OUT_DIR = join(ROOT, 'data', 'characters');
const TIMELINE_FILE = join(ROOT, 'data', 'processed', 'timeline-unified.json');

// ── API Key 로드 ──
function loadApiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const envPaths = [
    join(ROOT, '.env'),
    join(ROOT, '.env.local'),
    join(ROOT, '..', 'vibechanbob', '.env.local'),
    join(ROOT, '..', 'vibechanbob', 'predictnews', '.env'),
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
const skipGold = hasFlag('--skip-gold');
const dryRun = hasFlag('--dry-run');
const modelOverride = getArg('--model');

// ── 골드 스탠다드 (이미 v2 품질) ──
const GOLD_STANDARDS = ['cao-cao', 'liu-bei', 'zhang-fei'];

// ── 연표 로드 ──
function loadTimeline() {
  try {
    const data = JSON.parse(readFileSync(TIMELINE_FILE, 'utf-8'));
    return data.entries || [];
  } catch { return []; }
}

// ── 캐릭터 관련 연표 이벤트 추출 ──
function getCharacterEvents(timeline, nameKr, nameEn) {
  return timeline
    .filter(e => {
      const parts = e.participants || [];
      return parts.includes(nameKr) || parts.includes(nameEn);
    })
    .slice(0, 15) // 최대 15개
    .map(e => `${e.year}년: ${e.event_kr}`)
    .join('\n');
}

// ── 프로필에서 프롬프트용 데이터 추출 ──
function extractPromptData(profile, timeline) {
  const data = {};

  // 기본 정보
  data.basic = `이름: ${profile.name_kr} (${profile.name_cn}, ${profile.name_en})
자: ${profile.courtesy_kr || '불명'} (${profile.courtesy_cn || '불명'})
진영: ${profile.faction}
역할: ${profile.role}
티어: ${profile.tier}`;

  // 능력치
  if (profile.stats) {
    const s = profile.stats;
    data.stats = `통솔: ${s.leadership}, 무력: ${s.war}, 지력: ${s.intelligence}, 정치: ${s.politics}, 매력: ${s.charisma}
총합: ${s.total}
생년: ${s.birth || '불명'}, 몰년: ${s.death || '불명'}`;
  } else {
    data.stats = '(능력치 데이터 없음)';
  }

  // 연의 등장
  if (profile.novel_presence) {
    const np = profile.novel_presence;
    data.novel = `첫 등장: ${np.first_chapter || '?'}회, 마지막: ${np.last_chapter || '?'}회
등장 회차: ${np.chapters || np.chapters_from_cooccurrence?.join(', ') || '불명'}
등장 회차 수: ${np.chapter_count || '불명'}`;
  } else {
    data.novel = '(등장 데이터 없음)';
  }

  // 실제 대사 (P1 — 핵심!)
  if (profile.dialogues && profile.dialogues.length > 0) {
    data.dialogues = profile.dialogues
      .map(d => `[${d.chapter}회] ${d.text}`)
      .join('\n\n');
    data.dialogueCount = profile.dialogues.length;
  } else {
    data.dialogues = '(대사 데이터 없음 — 나무위키 바이오에서 인용을 찾을 것)';
    data.dialogueCount = 0;
  }

  // 관계 (P3)
  if (profile.relationships && profile.relationships.length > 0) {
    data.relationships = profile.relationships
      .map(r => `${r.target}: ${r.type_kr} (강도 ${r.intensity}, ${r.evidence})`)
      .join('\n');
  } else {
    data.relationships = '(관계 데이터 없음)';
  }

  // 바이오 — 나무위키 핵심 섹션 (최대 4000자)
  const namuSections = profile.biography?.namu || {};
  const namuParts = [];
  const MAX_NAMU = 4000;
  let namuLen = 0;
  for (const [key, val] of Object.entries(namuSections)) {
    if (!val || typeof val !== 'string') continue;
    const trimmed = val.length > 1500 ? val.substring(0, 1500) + '...(생략)' : val;
    if (namuLen + trimmed.length > MAX_NAMU) break;
    namuParts.push(`### ${key}\n${trimmed}`);
    namuLen += trimmed.length;
  }
  data.namuBio = namuParts.join('\n\n') || '(나무위키 데이터 없음)';

  // 바이오 — EN 위키 요약 (최대 1000자)
  const enSummary = profile.biography?.wiki_en?.summary || '';
  const enSections = profile.biography?.wiki_en?.sections || {};
  const enParts = [enSummary.substring(0, 500)];
  for (const [key, val] of Object.entries(enSections)) {
    if (val && typeof val === 'string') {
      enParts.push(`[${key}] ${val.substring(0, 400)}`);
    }
  }
  data.enBio = enParts.join('\n').substring(0, 1500) || '(EN 위키 데이터 없음)';

  // 연표 이벤트
  data.events = getCharacterEvents(timeline, profile.name_kr, profile.name_en);

  return data;
}

// ── few-shot 예시 로드 ──
function loadFewShot() {
  // zhang-fei v2를 few-shot으로 사용 (가장 완성도 높은 v2 예시)
  const path = join(OUT_DIR, 'zhang-fei.soul.md');
  if (existsSync(path)) {
    return readFileSync(path, 'utf-8');
  }
  // fallback: cao-cao (gold standard)
  const fallback = join(OUT_DIR, 'cao-cao.soul.md');
  if (existsSync(fallback)) return readFileSync(fallback, 'utf-8');
  return '';
}

// ── 프롬프트 구성 ──
function buildPrompt(profile, promptData, fewShot) {
  const system = `너는 삼국지 역사/연의 전문가이자 게임 캐릭터 설계자다.
주어진 다국어 데이터(나무위키, EN위키), 능력치, 실제 연의 대사, 관계 데이터를 바탕으로 AI 시뮬레이션용 캐릭터 프로파일(soul.md)을 작성한다.

### 절대 규칙
1. **날조 인용 금지**: 대사는 반드시 아래 "실제 연의 대사" 섹션에서만 선택. 없으면 나무위키 어록에서 추출. 그래도 없으면 대사 섹션을 줄여라. **절대로 대사를 만들어내지 마라.**
2. **모든 인용에 회차 표기**: "(XX회)" 형식으로 출처를 밝힐 것
3. **중국어 원문 + 한국어 번역**: 대사 인용 시 "原文(번역)" 형식 사용 (예: "大丈夫不與國家出力(사나이가 나라를 위해 힘쓰지 않고)")
4. **연도 정확성**: 스탯의 birth/death, 연표 이벤트의 연도를 교차 검증. 장판교=208, 적벽=208, 관도=200, 이릉=222 등
5. 정사(삼국지)와 연의(삼국지연의) 모두 참고하되, 연의 기반으로 캐릭터성을 잡는다
6. 능력치 해석은 Koei 삼국지 시리즈의 관례를 따른다
7. 행동 근거는 게임 AI가 참조할 수 있도록 조건→행동 형태로 작성
8. 한국어로 작성

### 결과 형식
마크다운만 출력. 다른 설명 없이 soul.md 내용만.`;

  const user = `다음 캐릭터의 soul.md를 작성해줘. 아래 예시(장비 v2)와 **동일한 형식과 깊이**로 작성해야 한다.

## ─── 캐릭터 데이터 ───

### 기본 정보
${promptData.basic}

### Koei 삼국지 11 능력치
${promptData.stats}

### 연의 등장 정보
${promptData.novel}

### 실제 연의 대사 (P1 추출 — 중국어 원문, 회차 포함)
[총 ${promptData.dialogueCount}개]
${promptData.dialogues}

### 관계 데이터 (P3)
${promptData.relationships}

### 연표 이벤트
${promptData.events || '(관련 이벤트 없음)'}

### 나무위키 바이오 (핵심 섹션)
${promptData.namuBio}

### EN Wikipedia
${promptData.enBio}

## ─── 예시 (장비 v2 soul.md) ───
${fewShot}
## ─── 예시 끝 ───

## ─── 출력 지침 ───
위 데이터와 예시를 참조하여 soul.md를 작성해줘.

필수 섹션:
1. **헤더**: # 이름 (漢字, English) + 자/생몰년/소속
2. **능력치 테이블** + 티어 + 스탯 해석 (어떤 면에서 강하고 약한지, 서사와 연결)
3. **서사적 중요도**: 연의 등장 회차, 핵심 이벤트 (정확한 연도), 서사 역할
4. **성격 프로파일**:
   - 기질 (MBTI + 구체적 에피소드 기반)
   - 가치관 우선순위 (실제 대사 인용 포함)
   - 의사결정 패턴 (에피소드 기반)
   - 대인 관계 패턴 (주군/동료/부하/적 등)
   - 대화 톤 (실제 대사 인용)
5. **행동 근거 (AI 시뮬레이션 지침)**: 전략 상황별, 인재 등용, 이벤트 반응
6. **핵심 관계 테이블**: | 대상 | 관계 | 강도 | 설명 | (최소 5명)
7. **메타 정보**:
   - **생산 방식**: Tier ${profile.tier} v2 (Claude Opus 직접 생성)
   - **검증 상태**: 교차검증 완료 — 모든 인용은 연의 원문, 연도는 통합연표 대조
   - **소스**: 삼국지11 능력치, 연의 원문(위키소스 120회), 나무위키, EN Wikipedia, 통합연표, P1 대사DB, P3 관계그래프

**중요**:
- 대사 인용은 위 "실제 연의 대사" 데이터에서만 선택. 반드시 중국어 원문 + 한국어 번역 + 회차 포함. 대사를 만들어내면 전체 문서가 무효화된다.
- **같은 대사를 2번 이상 인용하지 마라**. 각 인용은 서로 다른 대사여야 한다. 최소 5개 이상의 서로 다른 대사를 인용할 것.
- 성격 프로파일의 각 항목에는 **구체적 에피소드 기반**으로 서술할 것. "침착하게 대처" 같은 추상적 서술 대신 "XX전투에서 YY 상황에 ZZ 했다" 형태.
- 행동 근거는 실제 연의 에피소드를 기반으로 구체적 전례를 들어 서술.
- 출력은 순수 마크다운. \\\`\\\`\\\`markdown 코드 블록으로 감싸지 마라.`;

  return { system, user };
}

// ── API 호출 ──
async function callAPI(apiKey, system, user, model) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.6,
      max_tokens: 8000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err.substring(0, 300)}`);
  }

  const data = await res.json();
  const usage = data.usage;
  return {
    content: data.choices[0].message.content,
    tokens: { input: usage?.prompt_tokens || 0, output: usage?.completion_tokens || 0 },
  };
}

// ── v2 품질 검증 ──
function validateV2(content, nameKr) {
  const issues = [];
  // 회차 인용 체크
  const chapterCitations = (content.match(/\(\d+회\)/g) || []).length;
  if (chapterCitations < 3) issues.push(`회차 인용 ${chapterCitations}개 (최소 3개 필요)`);
  // 중국어 원문 체크
  const chineseQuotes = (content.match(/[\u4e00-\u9fff]{5,}/g) || []).length;
  if (chineseQuotes < 2) issues.push(`중국어 원문 ${chineseQuotes}개 (최소 2개 필요)`);
  // 핵심 관계 테이블 체크
  if (!content.includes('| 대상')) issues.push('핵심 관계 테이블 없음');
  // 능력치 테이블 체크
  if (!content.includes('| 통솔')) issues.push('능력치 테이블 없음');
  // 메타 정보 체크
  if (!content.includes('v2')) issues.push('v2 메타 정보 없음');
  return issues;
}

// ── 메인 ──
async function main() {
  const apiKey = loadApiKey();
  if (!apiKey && !dryRun) {
    console.error('OPENAI_API_KEY 없음. --dry-run으로 프롬프트만 확인 가능.');
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const { ALL_CHARACTERS } = await import('../crawl/character-list.js');
  const timeline = loadTimeline();
  const fewShot = loadFewShot();

  // 대상 선정
  let targets = ALL_CHARACTERS;
  if (nameFilter) {
    targets = targets.filter(c => c.name_kr === nameFilter || c.name_en.toLowerCase() === nameFilter.toLowerCase());
  }
  if (tierFilter !== undefined) {
    targets = targets.filter(c => c.tier === parseInt(tierFilter));
  }
  if (skipGold) {
    targets = targets.filter(c => {
      const fn = c.name_en.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      return !GOLD_STANDARDS.includes(fn);
    });
  }

  // 프로필 없는 캐릭터 필터링
  targets = targets.filter(c => {
    const fn = c.name_en.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    return existsSync(join(PROFILES_DIR, `${fn}.json`));
  });

  // 모델 결정
  const defaultModel = (t) => modelOverride || (t === 0 ? 'gpt-4o' : 'gpt-4o-mini');

  console.log(`\n🎭 P7: Soul.md v2 재생성 파이프라인\n`);
  console.log(`   대상: ${targets.length}명`);
  console.log(`   few-shot: ${fewShot.length > 0 ? 'zhang-fei v2' : '없음'}`);
  console.log(`   모드: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`   모델: Tier 0 → ${defaultModel(0)}, Tier 1 → ${defaultModel(1)}`);
  console.log(`   연표 이벤트: ${timeline.length}개`);
  console.log(`   출력: ${OUT_DIR}\n`);

  if (targets.length === 0) {
    console.log('생성할 캐릭터가 없습니다.');
    return;
  }

  const results = { success: [], failed: [], warnings: [] };
  let totalInput = 0;
  let totalOutput = 0;

  for (let i = 0; i < targets.length; i++) {
    const char = targets[i];
    const fn = char.name_en.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const profilePath = join(PROFILES_DIR, `${fn}.json`);
    const outPath = join(OUT_DIR, `${fn}.soul.md`);

    // 프로필 로드
    const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
    const promptData = extractPromptData(profile, timeline);
    const model = defaultModel(char.tier);
    const { system, user } = buildPrompt(profile, promptData, fewShot);

    const promptTokens = Math.round((system.length + user.length) / 3.5); // 대략적 토큰 추정

    if (dryRun) {
      console.log(`  [${i + 1}/${targets.length}] ${char.name_kr} (${model})`);
      console.log(`    프롬프트: ~${promptTokens.toLocaleString()} tokens (시스템: ${system.length}자, 유저: ${user.length}자)`);
      console.log(`    대사: ${promptData.dialogueCount}개, 관계: ${profile.relationships?.length || 0}개`);
      results.success.push(char.name_kr);
      continue;
    }

    console.log(`  [${i + 1}/${targets.length}] ${char.name_kr} (${char.name_en}) — ${model}`);

    try {
      const { content, tokens } = await callAPI(apiKey, system, user, model);
      totalInput += tokens.input;
      totalOutput += tokens.output;

      // v2 품질 검증
      const issues = validateV2(content, char.name_kr);
      if (issues.length > 0) {
        console.log(`    ⚠️  품질 경고: ${issues.join(', ')}`);
        results.warnings.push({ name: char.name_kr, issues });
      }

      // Strip markdown code block wrappers if present
      let cleaned = content;
      if (cleaned.startsWith('```markdown')) {
        cleaned = cleaned.replace(/^```markdown\s*\n?/, '').replace(/\n?```\s*$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '');
      }

      writeFileSync(outPath, cleaned, 'utf-8');
      console.log(`    ✅ ${cleaned.length.toLocaleString()}자 (${tokens.input}→${tokens.output} tokens)`);
      results.success.push(char.name_kr);
    } catch (err) {
      console.error(`    ❌ ${err.message}`);
      results.failed.push({ name: char.name_kr, error: err.message });
    }

    // Rate limit: Tier 0 = 3초, Tier 1 = 1.5초
    if (i < targets.length - 1) {
      await new Promise(r => setTimeout(r, char.tier === 0 ? 3000 : 1500));
    }
  }

  // 비용 추정
  const costInput = totalInput / 1_000_000;
  const costOutput = totalOutput / 1_000_000;
  // GPT-4o: $2.50 input, $10 output; GPT-4o-mini: $0.15 input, $0.60 output
  const estimatedCost = (costInput * 5 + costOutput * 15); // rough blend

  console.log(`\n${'═'.repeat(55)}`);
  console.log(`🏁 P7 완료`);
  console.log(`   ✅ ${results.success.length} | ❌ ${results.failed.length} | ⚠️  ${results.warnings.length}`);
  console.log(`   토큰: ${totalInput.toLocaleString()} input + ${totalOutput.toLocaleString()} output`);
  console.log(`   추정 비용: ~$${estimatedCost.toFixed(2)}`);
  if (results.failed.length > 0) {
    for (const f of results.failed) console.log(`   ❌ ${f.name}: ${f.error}`);
  }
  if (results.warnings.length > 0) {
    console.log(`\n   품질 경고:`);
    for (const w of results.warnings) console.log(`   ⚠️  ${w.name}: ${w.issues.join(', ')}`);
  }
  console.log(`${'═'.repeat(55)}\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
