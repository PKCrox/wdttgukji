# Spark Bounded Worker Loop

이 워크플로우는 `wdttgukji`에서 `gpt-5.3-codex-spark`를 실제 구현 worker로 붙일 때의 최소 루프다.

기본 전제:

- Spark는 리더가 아니다.
- Spark는 bounded implementation worker다.
- long run이 활성일 때는 runtime, registry, core app-surface 파일을 건드리지 않는다.

관련 문서:

- `docs/spark-assignment-contract.md`
- `docs/spark-task-card-template.md`
- `docs/agent-contracts.md`
- `ai/workflows/multi-agent-escalation.md`
- `ai/workflows/factory-loop.md`

## 1. Assignability Check

먼저 이 작업이 Spark로 내려도 되는지 확인한다.

- 파일 소유 범위가 닫혀 있는가
- 이미 정해진 계약 위 구현인가
- 완료 조건을 테스트 또는 수동 검증으로 닫을 수 있는가
- active long run과 파일 충돌이 없는가

아래 중 하나라도 해당하면 Spark에 내리지 않는다.

- runtime, registry, routing, policy 수정
- save/load 계약 수정
- cross-lane merge
- core app-surface block 수정
- balance philosophy 또는 UX 방향 자체를 다시 정해야 함

## 2. Lead Owner Selection

Spark 앞단에는 반드시 lead owner가 있다.

- engine slice: `engine-integrator`
- content batch: `content-planner`
- balance helper: `balance-researcher`
- generated app surface: `ux-stage-director` 또는 `engine-integrator`
- 계약 재정의: `pipeline-architect`

lead owner는 방향, non-goals, done criteria를 고정하고 Spark는 구현만 맡는다.

## 3. Task Card Creation

카드는 `docs/spark-task-card-template.md`를 기반으로 만든다.

필수 항목:

- goal
- inputs
- owned paths
- non-goals
- done criteria
- gates
- trace
- handoff

카드가 모호하면 worker를 보내지 말고 lead owner가 먼저 재작성한다.

## 4. File Lock Check

Spark dispatch 전에 아래를 확인한다.

- `git status --short` 에서 owned paths가 이미 modified 인지
- long run이 `scripts/orchestrate/**` 또는 `runs/**`를 생성 중인지
- app-surface lane이 실제로 열려 있는지

충돌이 있으면:

- 같은 파일을 두 worker에게 동시에 주지 않는다
- runtime/generated artifact path는 active long run 동안 잠근다
- 필요하면 report-only task로 축소한다

## 5. Worker Execution

Spark worker는 아래 규칙을 따른다.

- owned paths 밖으로 나가지 않는다
- 카드에 없는 리팩터를 하지 않는다
- first pass에서 요구 테스트를 먼저 다시 적는다
- 실패 원인이 다른 subsystem이면 즉시 escalate 한다

## 6. Verification and Handoff

worker 종료 후 lead owner 또는 reviewer가 확인한다.

- gates 통과 여부
- owned paths 침범 여부
- contract drift 여부
- next pass 후보 변경 여부

handoff는 최소 아래를 남긴다.

- changed files
- what is proven
- what remains unproven
- escalation blockers

## 7. Integration Decision

최종 통합은 Spark가 아니라 lead owner가 판단한다.

- engine slice는 `engine-integrator`
- content batch는 `content-planner`
- balance helper는 `balance-researcher`
- app-surface lane은 `ux-stage-director` 또는 `engine-integrator`
- pass closeout은 `release-orchestrator`

## Recommended Spark Work Types

- isolated engine rule fix
- deterministic converter or generator
- content metadata patch
- replay or QA harness
- generated fragment update in an opened lane

## Anti-Patterns

- “게임 하나 끝까지 알아서 만들어”
- “필요한 파일 다 고쳐”
- runtime와 product surface를 한 카드에 같이 넣기
- save/load 계약과 UI 구현을 같은 worker에게 맡기기
- 테스트 없는 cross-system patch

## Minimal Prompt Shape

```text
Use the spark-assignment contract.
You are a bounded implementation worker.
Stay within owned paths.
Do not touch runtime, registry, save/load contract, or core app-surface blocks.
Run the specified gates.
If the task expands, stop and escalate instead of improvising.
```
