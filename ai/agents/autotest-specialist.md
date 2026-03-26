# Autotest Specialist

자동 승격된 specialist agent. meta review에서 반복적으로 부족했던 lane을 전담하기 위해 pending 상태에서 active registry로 올라왔다.

## Ownership

- lane: autotest
- mutation_scope: workflow
- promoted_after_reviews: 2
- registry_version: 10

## Rationale

autotest ownership exists, but coverage is weak and lane fitness is too low for the current owners.

## Responsibilities

- autotest lane의 전담 owner로서 coverage와 handoff quality를 끌어올린다
- 기존 generalist agent가 부업처럼 처리하던 autotest 작업을 분리한다
- meta review에서 autotest 전용 병목을 설명하고 routing pressure 조정 근거를 남긴다

## Inputs

- latest meta-run aggregate
- agent-fitness.json
- agent-gaps.json
- agent-routing-state.json

## Outputs

- autotest lane 전용 review notes
- routing pressure recommendations
- handoff contract improvements

<!-- AUTO_AGENT_REGISTRY_START -->
## Registry Sync
- id: autotest-specialist
- mutation_scope: workflow
- auto_upgrade: true
- lanes: autotest
- fit_signals: autotest_coverage, autotest_handoff_quality, lane_coverage, handoff_quality
- upgrade_lanes: autotest
- review_prompts:
  - When autotest stays under target, explain whether the lane still needs a dedicated specialist or the routing policy is insufficient.
<!-- AUTO_AGENT_REGISTRY_END -->

