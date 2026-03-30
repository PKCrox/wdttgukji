# Spark Dispatch: Combat Replay Harness

이 카드는 active long run과 충돌하지 않는 bounded Spark 작업을 바로 실행하기 위한 실제 dispatch 문서다.

관련 문서:

- `docs/spark-assignment-contract.md`
- `docs/spark-task-card-template.md`
- `ai/workflows/spark-bounded-worker-loop.md`

## Pre-dispatch Check

- `engine/core/combat.js`: clean
- `scripts/qa/replay-combat.js`: not present yet
- runtime / registry / core app-surface 경로 포함 없음

dispatch 직전에 아래를 다시 확인한다.

```bash
git status --short -- engine/core/combat.js scripts/qa/replay-combat.js
```

## Worker Card

```text
Target worker model: gpt-5.3-codex-spark

Goal:
- Add a deterministic replay harness for `resolveCombat` and make duel outcomes testable without touching runtime or UI layers

Inputs:
- engine/core/combat.js
- docs/spark-assignment-contract.md
- docs/agent-contracts.md

Owned paths:
- engine/core/combat.js
- scripts/qa/replay-combat.js

Non-goals:
- UI battle presentation changes
- save/load schema changes
- orchestrator/runtime changes
- faction AI policy changes
- unrelated refactors outside owned paths

Done criteria:
- a replay script can run fixed combat fixtures and print stable results
- duel logic is testable through explicit injected randomness or equivalent bounded mechanism
- the worker does not modify runtime, app-surface core blocks, or unrelated files

Gates:
- node scripts/qa/replay-combat.js

Trace:
- trace_id: spark-combat-replay-001
- phase_type: report
- mutation_scope: product-core
- touches_app_surface: false

Handoff:
- engine-integrator verifies the harness proves determinism without changing cross-system contracts

Escalate if:
- battle state serialization must change
- faction AI or UI files become required
- owned paths are no longer clean at dispatch time
```
