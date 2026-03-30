# Initial Spark Candidate Cards

이 문서는 active long run을 멈추지 않고도 바로 꺼낼 수 있는 `gpt-5.3-codex-spark` 후보 카드만 모아둔다.

주의:

- 아래 카드는 "안전한 후보"이지, 이미 버그가 있다고 단정하는 문서는 아니다.
- dispatch 전에 반드시 `git status --short -- [owned paths]` 로 다시 잠금 여부를 확인한다.
- 최종 통합 판단은 lead owner가 한다.

관련 문서:

- `docs/spark-assignment-contract.md`
- `docs/spark-task-card-template.md`
- `ai/workflows/spark-bounded-worker-loop.md`

## Candidate 1. Combat Replay Harness

왜 지금 안전한가:

- `engine/core/combat.js` 는 현재 git status 기준 수정 흔적이 없다.
- core app-surface, runtime, registry를 건드리지 않는다.
- 전투 계산과 일기토는 재현 harness를 붙이기 좋은 고립된 slice다.

Lead owner:

- `engine-integrator`

Task card:

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

Done criteria:
- a replay script can run fixed combat fixtures and print stable results
- duel logic is testable through explicit injected randomness or equivalent bounded mechanism

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
```

## Candidate 2. Diplomacy Probability Probe

왜 지금 안전한가:

- `engine/core/diplomacy.js` 도 현재 modified 상태가 아니다.
- 외교 확률 함수는 이미 factor breakdown을 반환하고 있어서, bounded probe/harness 작업으로 자르기 쉽다.

Lead owner:

- `engine-integrator`

Task card:

```text
Target worker model: gpt-5.3-codex-spark

Goal:
- Build a small diplomacy replay/probe harness for peace, alliance, marriage, and threaten chance breakdowns

Inputs:
- engine/core/diplomacy.js
- docs/spark-assignment-contract.md

Owned paths:
- engine/core/diplomacy.js
- scripts/qa/replay-diplomacy.js

Non-goals:
- AI war posture redesign
- save/load contract changes
- app-surface changes
- runtime policy changes

Done criteria:
- the probe script can print factor breakdowns for representative diplomacy fixtures
- the worker does not modify unrelated AI or UI files

Gates:
- node scripts/qa/replay-diplomacy.js

Trace:
- trace_id: spark-diplomacy-probe-001
- phase_type: report
- mutation_scope: product-core
- touches_app_surface: false

Handoff:
- engine-integrator reviews whether the probe exposes a real balance defect worth a larger pass

Escalate if:
- faction AI files are required to make sense of the change
- the work turns into balance-policy redesign instead of bounded instrumentation
```

## Candidate 3. Tier-C Event Metadata Batch

왜 지금 안전한가:

- `data/events/*.json` 은 현재 git status 기준 수정 흔적이 없다.
- 콘텐츠 배치는 runtime, registry, app-surface와 독립적으로 다룰 수 있다.
- 품질 게이트가 이미 존재한다.

Lead owner:

- `content-planner`

Task card:

```text
Target worker model: gpt-5.3-codex-spark

Goal:
- Patch a small Tier-C event batch for evidence completeness and effect completeness

Inputs:
- data/events/tier-c-01.json
- data/events/tier-c-02.json
- data/events/tier-c-03.json
- docs/agent-contracts.md

Owned paths:
- data/events/tier-c-01.json
- data/events/tier-c-02.json
- data/events/tier-c-03.json

Non-goals:
- event engine changes
- character schema changes
- large narrative rewrite without evidence
- bulk regeneration outside the owned files

Done criteria:
- edited events have source/url/crawled_at where required by current schema conventions
- placeholder choice effects or structurally incomplete effects are removed from the owned files

Gates:
- node scripts/check-event-quality.js

Trace:
- trace_id: spark-tierc-batch-001
- phase_type: report
- mutation_scope: product-core
- touches_app_surface: false

Handoff:
- content-planner rechecks evidence quality and confirms the batch is safe for downstream engine use

Escalate if:
- the current event schema cannot represent the intended effect cleanly
- engine support for a new effect type becomes necessary
```

## Do Not Stop The Long Run Yet

지금은 런을 유지하는 쪽이 맞다. 아래 경우에만 멈추는 걸 검토한다.

- `scripts/orchestrate/runtime/**` 또는 `scripts/orchestrate/generated/**` 를 직접 수정해야 할 때
- `public/index.html`, `public/css/style.css`, `public/js/app.js`, `public/js/action-panel.js` 를 즉시 바꿔야 할 때
- registry/runtime 문서를 본문 수정해야 할 때
- same-file collision이 실제로 발생했을 때
