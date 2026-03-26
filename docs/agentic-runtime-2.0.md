# Agentic Runtime 2.0

`wdttgukji`의 오케스트레이션은 더 이상 단순 스크립트 묶음이 아니라 `Postgres + Redis` 기반 durable runtime을 목표로 한다.

## 목표

- README의 핵심 축을 lane 단위로 운영한다.
- pass는 task graph로 컴파일되고, worker가 분산 실행한다.
- canonical state는 DB에 저장하고, 파일 출력은 export artifact로 유지한다.
- app surface는 현재 rollout에서 mutation 금지다.

## 핵심 구성

- `scripts/orchestrate/runtime/durable-runner.js`
  - run, pass, review, policy snapshot을 생성
- `scripts/orchestrate/runtime/worker.js`
  - Redis queue에서 task를 꺼내고 lease를 획득해 실행
- `scripts/orchestrate/runtime/db.js`
  - Postgres canonical store
- `scripts/orchestrate/runtime/graph.js`
  - candidate를 task graph로 컴파일
- `scripts/orchestrate/runtime/policy.js`
  - mutation scope와 app-surface 금지 정책 집행

## Mutation Policy

- 기본 mode: `product-core`
- `allowAppSurface: false`
- workflow/docs/generated/runtime artifacts는 mutation 허용
- `public/` 앱 표면은 현재 자동 변경 금지
- app surface lane은 구조적으로 존재하지만, `WDTT_RUNTIME_MUTATION_MODE=full` 과 `WDTT_RUNTIME_ALLOW_APP_SURFACE=true`를 같이 열어야 dispatch된다
- app surface lane을 열더라도 `docs/app-surface-mutation-contract.md`의 machine-managed 경로 밖은 수정하지 않는다

## 운영 커맨드

- `npm run passes:runtime:migrate`
- `npm run passes:runtime:health`
- `npm run passes:runtime:worker`
- `npm run passes:runtime:run -- --passes 10 --inline-workers 4`
- `npm run passes:clean`

## 현재 단계

- durable schema, queue, worker, review loop, export layer까지 구현
- 기존 `adaptive-pass-runner`는 lightweight orchestrator로 유지
- 새 runtime이 안정화되면 장기 런의 기본 엔트리포인트를 durable runtime으로 전환
- `runs/`, `docs/automation-status/`, `scripts/orchestrate/generated/*.json`은 generated artifact로 간주하고 추적하지 않는다
- `reviewInterval`마다 `runs/.../versions/` 아래에 버전 스냅샷이 자동 생성된다
