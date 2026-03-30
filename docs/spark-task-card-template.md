# Spark Task Card Template

아래 템플릿은 `gpt-5.3-codex-spark` worker에 그대로 넘길 수 있게 `wdttgukji` 계약에 맞춰 축약한 형식이다.

## Base Template

```text
Target worker model: gpt-5.3-codex-spark

Goal:
- [bounded feature or fix]

Inputs:
- [docs or files the worker must read first]

Owned paths:
- path/a
- path/b

Non-goals:
- runtime policy changes
- registry/routing changes
- save/load contract changes
- unrelated UI churn

Done criteria:
- [observable result 1]
- [observable result 2]

Gates:
- [exact command or manual verification]
- [exact command or manual verification]

Trace:
- trace_id: [id]
- phase_type: report
- mutation_scope: product-core
- touches_app_surface: false

Handoff:
- [what the lead integrator or reviewer should verify next]

Escalate if:
- another subsystem must change
- active long run already owns these files
- app surface core blocks must change
- save/load compatibility is affected
```

## Example 1: Engine Slice

```text
Target worker model: gpt-5.3-codex-spark

Goal:
- Fix one isolated battle-resolution bug in an engine slice

Inputs:
- engine/core/battle-resolution.js
- docs/spark-assignment-contract.md

Owned paths:
- engine/core/battle-resolution.js
- scripts/qa/replay-battle-resolution.js

Non-goals:
- UI changes
- save/load schema changes
- orchestrator/runtime changes

Done criteria:
- the targeted replay no longer diverges
- the harness documents the regression and the fixed output

Gates:
- node scripts/qa/replay-battle-resolution.js

Trace:
- trace_id: engine-slice-battle-resolution-001
- phase_type: report
- mutation_scope: product-core
- touches_app_surface: false

Handoff:
- engine-integrator verifies no cross-slice contract drift

Escalate if:
- public/js/app.js also needs changes
- battle state serialization changes are required
```

## Example 2: Content Batch

```text
Target worker model: gpt-5.3-codex-spark

Goal:
- Patch one event batch with missing source metadata and broken choice effects

Inputs:
- data/events/208/*
- docs/agent-contracts.md

Owned paths:
- data/events/208/*.json

Non-goals:
- event engine changes
- character schema changes
- large narrative rewrite without evidence

Done criteria:
- each edited event has source/url/crawled_at
- no placeholder choice effect remains in the owned files

Gates:
- node scripts/check-event-quality.js

Trace:
- trace_id: content-batch-208-001
- phase_type: report
- mutation_scope: product-core
- touches_app_surface: false

Handoff:
- content-planner rechecks quality gate and evidence links

Escalate if:
- event schema changes are needed
- engine support for a new effect type is required
```

## Example 3: Generated App Surface Lane

이 예시는 lane이 명시적으로 열렸을 때만 사용한다.

```text
Target worker model: gpt-5.3-codex-spark

Goal:
- Update one machine-managed generated fragment for the opened app-surface lane

Inputs:
- docs/app-surface-mutation-contract.md
- public/fragments/generated/war-room-status.html

Owned paths:
- public/fragments/generated/war-room-status.html

Non-goals:
- public/index.html changes
- public/css/style.css changes
- public/js/app.js changes

Done criteria:
- the generated fragment matches the requested information hierarchy
- no core block outside generated paths is edited

Gates:
- [manual browser verification for the opened lane]

Trace:
- trace_id: app-surface-generated-001
- phase_type: report
- mutation_scope: full
- touches_app_surface: true

Handoff:
- lead integrator reviews whether controlled patch escalation is needed

Escalate if:
- core app-surface blocks must change
- the lane policy is not explicitly open
```
