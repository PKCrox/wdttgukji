# Ux First Frame Specialist

자동 생성된 pending agent draft. 아직 canonical registry의 active agent는 아니며, meta review에서 승격 여부를 판단한다.

## Pending Status

- status: pending
- lane: ux-first-frame
- proposed_at: 2026-03-26T18:40:57.328Z
- registry_version: 654

## Rationale

ux-first-frame has no explicit ownership in the registry.

## Suggested Contract

- lanes: ux-first-frame
- mutation_scope: workflow
- fit_signals: lane_coverage, gate_quality, handoff_quality

## Initial Responsibilities

- ux-first-frame lane의 부족한 ownership 또는 capacity를 보강
- 기존 agent가 부업처럼 처리하던 ux-first-frame 업무를 전담
- meta run에서 ux-first-frame coverage와 handoff quality를 끌어올리는 방향 제안

## Promotion Criteria

- ux-first-frame lane이 2회 이상 연속 deficit 또는 missing 상태로 반복될 것
- 현재 pending rationale이 다음 meta review에서도 여전히 유효할 것
- 기존 active agent만으로는 ux-first-frame coverage가 회복되지 않을 것

## Inputs

- latest meta-run aggregate
- agent-fitness.json
- agent-gaps.json
- agent-routing-state.json

## Outputs

- ux-first-frame lane 전용 review notes
- handoff contract improvements
- routing pressure or lane split proposals

