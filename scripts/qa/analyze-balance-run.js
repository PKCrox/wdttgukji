#!/usr/bin/env node

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const RUNS_DIR = join(process.cwd(), 'scripts/balance/runs');

async function findLatestRun() {
  const files = (await readdir(RUNS_DIR))
    .filter((file) => file.endsWith('.json'))
    .sort((a, b) => Number(b.replace('.json', '')) - Number(a.replace('.json', '')));

  if (!files.length) {
    throw new Error('No balance run files found in scripts/balance/runs');
  }

  return join(RUNS_DIR, files[0]);
}

function classify(summary) {
  const issues = {
    bugs: [],
    systemRisks: [],
    feedbackGaps: [],
    nextActions: [],
  };

  if ((summary.avgEventReach || 0) < 45) {
    issues.bugs.push(`이벤트 도달률이 낮음 (${summary.avgEventReach}%)`);
    issues.nextActions.push('이벤트 효과 타입 미지원, 트리거 과경직, 연도 필터 누락 여부를 먼저 점검');
  }

  if ((summary.winDistribution?.wei || 0) > 60) {
    issues.systemRisks.push(`위 승률 과도 (${summary.winDistribution.wei}%)`);
    issues.nextActions.push('AI 공격성 상수와 위/촉/오 병력 전개 비율을 우선 조정');
  }

  if ((summary.avgReversals || 0) < 1) {
    issues.systemRisks.push(`역전 부족 (평균 ${summary.avgReversals}회)`);
    issues.nextActions.push('공격 임계치와 방어/증원 확률을 낮춰 판세 이동성을 높임');
  }

  if ((summary.stalemateRate || 0) > 10) {
    issues.systemRisks.push(`교착 비율 높음 (${summary.stalemateRate}%)`);
    issues.nextActions.push('전투 강도와 AI 공격 시도 빈도를 소폭 상향');
  }

  if ((summary.avgTurns || 0) < 180 || (summary.avgTurns || 0) > 320) {
    issues.feedbackGaps.push(`게임 길이 목표 이탈 (${summary.avgTurns}턴)`);
  }

  if ((summary.dramaRate || 0) === 0) {
    issues.feedbackGaps.push('드라마 게임 비율 0: 판세 변화가 플레이어에게 체감되지 않을 가능성 높음');
  }

  if (!issues.nextActions.length) {
    issues.nextActions.push('현재 지표는 허용 범위. 다음은 UI 피드백 보강과 페르소나 테스트로 이동');
  }

  return issues;
}

async function main() {
  const target = process.argv[2] || await findLatestRun();
  const data = JSON.parse(await readFile(target, 'utf8'));
  const summary = data.summary || {};
  const issues = classify(summary);

  const report = {
    runFile: target,
    balanceScore: data.balance_score,
    summary,
    issues,
  };

  console.log(JSON.stringify(report, null, 2));

  if (issues.bugs.length > 0 || issues.systemRisks.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
