#!/usr/bin/env node
// prepare.js — 고정 인프라. 에이전트가 수정하지 않는다.
//
// Karpathy autoresearch 패턴에서 prepare.py에 해당.
// train.js의 밸런스 상수를 로드 → N회 헤드리스 시뮬 → balance_score 산출.
//
// 사용법:
//   node scripts/balance/prepare.js                  # 기본 100회 시뮬
//   node scripts/balance/prepare.js --sims 500       # 500회 시뮬
//   node scripts/balance/prepare.js --verbose         # 진행 상황 출력
//   node scripts/balance/prepare.js --report          # 상세 리포트 + runs/ 저장

import { readFile, writeFile, mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

// ── 게임 엔진 임포트 (DOM 의존성 없는 것만) ──
import { GameState } from '../../engine/core/game-state.js';
import { executeTurnEvents, processPlayerChoice, endTurn } from '../../engine/core/turn-loop.js';
import { decideAndExecute } from '../../engine/ai/faction-ai.js';
import { loadConfig } from '../../engine/core/balance-config.js';
import { filterEventsForScenario } from '../../engine/data/loader.js';

// ── train.js에서 밸런스 상수 임포트 ──
import { BALANCE } from './train.js';

// ── CLI 파싱 ──
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const idx = args.indexOf('--' + name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
};
const hasFlag = (name) => args.includes('--' + name);

const SIMS = parseInt(getArg('sims', '100'), 10);
const MAX_TURNS = parseInt(getArg('max-turns', '400'), 10);
const VERBOSE = hasFlag('verbose');
const REPORT = hasFlag('report');

// ── 목표 분포 (program.md에서 정의) ──
const TARGET_WIN_PCT = { wei: 45, shu: 25, wu: 15 };
const TARGET_OTHER_PCT = 15;
const TARGET_AVG_TURNS = 250;
const TARGET_MIN_REVERSALS = 2;

// ── balance_score 가중치 ──
const W = { winKL: 0.35, pacing: 0.25, drama: 0.25, anomaly: 0.15 };

// ── 메인 ──
async function main() {
  // train.js 상수를 게임 엔진에 로드
  loadConfig(BALANCE);

  // 시나리오 + 이벤트 로드
  const scenarioRaw = await readFile(join(ROOT, 'engine/data/scenarios/208-red-cliffs.json'), 'utf-8');
  const scenario = JSON.parse(scenarioRaw);
  const eventsRaw = await readFile(join(ROOT, 'data/events/all-events.json'), 'utf-8');
  const allEventsData = JSON.parse(eventsRaw);
  const rawEvents = Array.isArray(allEventsData) ? allEventsData :
    allEventsData.events || Object.values(allEventsData);
  const events = filterEventsForScenario(rawEvents, scenario.year, scenario.year + 17);

  if (VERBOSE) console.error(`[prepare] ${SIMS} sims × max ${MAX_TURNS} turns`);
  const startTime = Date.now();
  const results = [];

  for (let i = 0; i < SIMS; i++) {
    results.push(simulate(scenario, events, MAX_TURNS));
    if (VERBOSE && (i + 1) % 50 === 0) {
      console.error(`  ... ${i + 1}/${SIMS}`);
    }
  }

  const elapsed = Date.now() - startTime;
  if (VERBOSE) console.error(`[prepare] done in ${(elapsed / 1000).toFixed(1)}s (${(elapsed / SIMS).toFixed(1)}ms/sim)`);

  // 집계 + balance_score 산출
  const summary = aggregate(results);
  const score = computeBalanceScore(summary);

  // 출력: JSON (에이전트가 파싱)
  const output = {
    balance_score: score.total,
    components: score.components,
    summary,
    sims: SIMS,
    elapsed_ms: elapsed,
  };

  // stdout은 JSON만 — 에이전트가 파싱한다
  console.log(JSON.stringify(output, null, 2));

  // 리포트 모드: 상세 출력 + runs/ 저장
  if (REPORT) {
    printReport(summary, score, elapsed);
    await mkdir(join(__dirname, 'runs'), { recursive: true });
    const outPath = join(__dirname, 'runs', `${Date.now()}.json`);
    await writeFile(outPath, JSON.stringify({ ...output, results }, null, 2));
    console.error(`[report] saved: ${outPath}`);
  }
}

// ── 단일 시뮬레이션 ──
function simulate(scenario, events, maxTurns) {
  const state = new GameState(scenario);
  const firedSet = new Set();
  let reversals = 0;
  let prevLeader = null;

  while (!state.gameOver && state.turn < maxTurns) {
    // 이벤트 (플레이어 이벤트는 첫 번째 선택지 자동 선택)
    const playerEvents = executeTurnEvents(state, events);
    for (const event of playerEvents) {
      if (event.choices && event.choices.length > 0) {
        processPlayerChoice(state, event, event.choices[0]?.id || null);
      } else {
        processPlayerChoice(state, event, null);
      }
      firedSet.add(event.id);
    }

    // 모든 세력 AI 행동
    for (const [factionId, faction] of Object.entries(state.factions)) {
      if (!faction.active) continue;
      if (state.getCitiesOfFaction(factionId).length === 0) {
        faction.active = false;
        continue;
      }
      decideAndExecute(factionId, state, scenario.connections);
    }

    endTurn(state);

    // 역전 감지
    const leader = getLeadingFaction(state);
    if (prevLeader && leader !== prevLeader) reversals++;
    prevLeader = leader;
  }

  return {
    winner: state.winner || null,
    turns: state.turn,
    firedEvents: state.firedEvents?.length || firedSet.size,
    totalEvents: events.length,
    reversals,
    stalemate: state.turn >= maxTurns && !state.gameOver,
    earlyElim: detectEarlyElimination(state),
  };
}

// ── 집계 ──
function aggregate(results) {
  const n = results.length;
  const wins = {};
  let totalTurns = 0, totalReversals = 0, totalFired = 0;
  let stalemates = 0, earlyElims = 0;
  let dramaGames = 0; // 역전 2회 이상

  for (const r of results) {
    if (r.winner) wins[r.winner] = (wins[r.winner] || 0) + 1;
    totalTurns += r.turns;
    totalReversals += r.reversals;
    totalFired += r.firedEvents;
    if (r.stalemate) stalemates++;
    if (r.earlyElim) earlyElims++;
    if (r.reversals >= TARGET_MIN_REVERSALS) dramaGames++;
  }

  const winPct = {};
  for (const [fid, count] of Object.entries(wins)) {
    winPct[fid] = +(count / n * 100).toFixed(1);
  }

  const turns = results.map(r => r.turns);
  const avgTurns = totalTurns / n;
  const stdTurns = Math.sqrt(turns.reduce((s, t) => s + (t - avgTurns) ** 2, 0) / n);

  return {
    n,
    winDistribution: winPct,
    avgTurns: +avgTurns.toFixed(1),
    stdTurns: +stdTurns.toFixed(1),
    avgReversals: +(totalReversals / n).toFixed(2),
    dramaRate: +(dramaGames / n).toFixed(3),
    avgEventReach: +((totalFired / n) / (results[0]?.totalEvents || 1) * 100).toFixed(1),
    stalemateRate: +((stalemates / n) * 100).toFixed(1),
    earlyElimRate: +((earlyElims / n) * 100).toFixed(1),
    anomalyRate: +(((stalemates + earlyElims) / n) * 100).toFixed(1),
  };
}

// ── balance_score 산출 (lower = better) ──
function computeBalanceScore(s) {
  // 1. winKL: KL-divergence of actual win distribution vs target
  const target = { ...TARGET_WIN_PCT };
  const otherActual = 100 - (s.winDistribution.wei || 0) - (s.winDistribution.shu || 0) - (s.winDistribution.wu || 0);
  const actual = {
    wei: s.winDistribution.wei || 0,
    shu: s.winDistribution.shu || 0,
    wu:  s.winDistribution.wu || 0,
    other: otherActual,
  };
  target.other = TARGET_OTHER_PCT;

  let winKL = 0;
  for (const key of Object.keys(target)) {
    const p = Math.max(actual[key], 0.1) / 100;  // actual (avoid log(0))
    const q = target[key] / 100;                   // target
    winKL += p * Math.log(p / q);
  }
  winKL = Math.max(0, winKL);

  // 2. pacingDev: deviation from target pacing
  const pacingDev = Math.abs(s.avgTurns - TARGET_AVG_TURNS) / TARGET_AVG_TURNS
                  + s.stdTurns / TARGET_AVG_TURNS;

  // 3. dramaRate: 역전 2회 이상인 게임 비율 (1이면 완벽 → 1-drama로 반전)
  const dramaPenalty = 1 - s.dramaRate;

  // 4. anomalyRate: 이상 게임 비율 (0~1 스케일)
  const anomaly = s.anomalyRate / 100;

  const total = W.winKL * winKL
              + W.pacing * pacingDev
              + W.drama * dramaPenalty
              + W.anomaly * anomaly;

  return {
    total: +total.toFixed(4),
    components: {
      winKL: +winKL.toFixed(4),
      pacingDev: +pacingDev.toFixed(4),
      dramaPenalty: +dramaPenalty.toFixed(4),
      anomaly: +anomaly.toFixed(4),
    },
  };
}

// ── 유틸 ──
function getLeadingFaction(state) {
  let maxCities = 0, leader = null;
  for (const [fid, f] of Object.entries(state.factions)) {
    if (!f.active) continue;
    const count = state.getCitiesOfFaction(fid).length;
    if (count > maxCities) { maxCities = count; leader = fid; }
  }
  return leader;
}

function detectEarlyElimination(state) {
  if (state.turn > 10) return false;
  return ['wei', 'shu', 'wu'].some(fid => {
    const f = state.factions[fid];
    return f && !f.active;
  });
}

// ── 리포트 (stderr, 사람용) ──
function printReport(s, score, elapsed) {
  console.error('\n═══ Balance Auto-Research Report ═══');
  console.error(`Sims: ${s.n} | Duration: ${(elapsed / 1000).toFixed(1)}s`);
  console.error(`balance_score: ${score.total} (lower=better)\n`);

  console.error('Components:');
  console.error(`  winKL:        ${score.components.winKL}`);
  console.error(`  pacingDev:    ${score.components.pacingDev}`);
  console.error(`  dramaPenalty: ${score.components.dramaPenalty}`);
  console.error(`  anomaly:      ${score.components.anomaly}\n`);

  console.error('Win Distribution:');
  for (const [fid, target] of Object.entries(TARGET_WIN_PCT)) {
    const actual = s.winDistribution[fid] || 0;
    const diff = actual - target;
    const arrow = diff > 1 ? '▲' : diff < -1 ? '▼' : '≈';
    console.error(`  ${fid}: ${actual.toFixed(1)}% (target ${target}%) ${arrow} ${diff > 0 ? '+' : ''}${diff.toFixed(1)}pp`);
  }
  const otherPct = 100 - (s.winDistribution.wei || 0) - (s.winDistribution.shu || 0) - (s.winDistribution.wu || 0);
  console.error(`  other: ${otherPct.toFixed(1)}% (target ${TARGET_OTHER_PCT}%)\n`);

  console.error(`Pacing: avg ${s.avgTurns} turns (σ=${s.stdTurns})`);
  console.error(`Drama: ${(s.dramaRate * 100).toFixed(1)}% games with ≥${TARGET_MIN_REVERSALS} reversals`);
  console.error(`Events: ${s.avgEventReach}% reach`);
  console.error(`Anomaly: ${s.anomalyRate}% (stalemate ${s.stalemateRate}% + early elim ${s.earlyElimRate}%)`);
  console.error('═══════════════════════════════════\n');
}

main().catch(err => {
  console.error('[fatal]', err);
  process.exit(1);
});
