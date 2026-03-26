# Autotest Specialist

자동 생성된 pending agent draft. 아직 canonical registry의 active agent는 아니며, meta review에서 승격 여부를 판단한다.

## Pending Status

- status: pending
- lane: autotest
- proposed_at: 2026-03-24T14:31:45.991Z
- registry_version: 9

## Rationale

autotest ownership exists, but coverage is weak and lane fitness is too low for the current owners.

## Suggested Contract

- lanes: autotest
- mutation_scope: workflow
- fit_signals: autotest_coverage, autotest_handoff_quality, lane_coverage, handoff_quality

## Initial Responsibilities

- autotest lane의 부족한 ownership 또는 capacity를 보강
- 기존 agent가 부업처럼 처리하던 autotest 업무를 전담
- meta run에서 autotest coverage와 handoff quality를 끌어올리는 방향 제안

## Promotion Criteria

- autotest lane이 2회 이상 연속 deficit 또는 missing 상태로 반복될 것
- 현재 pending rationale이 다음 meta review에서도 여전히 유효할 것
- 기존 active agent만으로는 autotest coverage가 회복되지 않을 것

## Inputs

- latest meta-run aggregate
- agent-fitness.json
- agent-gaps.json
- agent-routing-state.json

## Outputs

- autotest lane 전용 review notes
- handoff contract improvements
- routing pressure or lane split proposals

