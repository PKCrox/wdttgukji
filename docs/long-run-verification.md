# Long-run Verification

이 문서는 Git에 포함되지 않는 `runs/` 로컬 산출물을 대신해, 가장 최근 검증된 split long-run의 핵심 결과를 사람이 확인할 수 있게 남긴 요약이다.

## Verified Run

- long run id: `long-run-20260324-235741`
- mode: `factory 4h -> game 4h`
- started_at: `2026-03-24T14:57:41.202Z`
- completed_at: `2026-03-24T22:58:43.215Z`
- status: `completed`
- completed_batches: `146`
- phase_counts:
  - `factory: 102`
  - `game: 44`

## Verification Source

이 요약은 source machine의 아래 로컬 산출물을 기준으로 기록됐다.

- `runs/long-runs/long-run-20260324-235741/state.json`
- `runs/long-runs/long-run-20260324-235741/long-run.log`

일반 clone에는 `runs/`가 비어 있을 수 있으므로, clone만으로 위 수치를 재현하지 못해도 이상이 아니다.

## Final Game-phase Aggregate

마지막 game batch의 평균 축 분포:

- `engine-slice: 2`
- `design-surface: 2`
- `app-surface: 1`
- `content-pipeline: 2`
- `autotest: 2`
- `theme-independence: 1`

## Interpretation

- factory phase는 orchestration, routing, registry evolution을 안정화하는 역할을 했다.
- game phase는 `wdttgukji-product-core` profile로 실제 제품 lanes를 태웠다.
- long-run이 끝난 시점에는 specialist 승격과 registry sync가 모두 닫힌 상태였다.
