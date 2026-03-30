# Spark Assignment Contract

`gpt-5.3-codex-spark`는 이 저장소에서 "빠른 구현자"이지, 런타임 설계자나 최종 통합 책임자가 아니다.

이 문서는 active long run이 돌고 있는 동안에도 Spark worker를 안전하게 붙일 수 있게 역할 경계와 금지 구역을 고정한다.

## 목적

- lead Codex 또는 `pipeline-architect`가 이미 정한 방향 안에서 bounded implementation만 빠르게 처리한다.
- long run과 충돌하는 runtime, registry, policy 파일은 잠금 구역으로 본다.
- worker output이 `docs/agent-contracts.md`의 공통 계약 필드와 연결되도록 한다.

## Spark를 붙여도 되는 조건

아래를 모두 만족할 때만 `gpt-5.3-codex-spark`에 할당한다.

- 파일 소유 범위가 1개 workstream 안에서 닫힌다.
- upstream/downstream 계약이 이미 문서나 코드로 확정돼 있다.
- done criteria를 테스트 또는 수동 검증 절차로 적을 수 있다.
- save/load, runtime policy, registry, lane dispatch 규칙을 건드리지 않는다.
- 현재 장기 런이 같은 파일을 점유하고 있지 않다.

## Spark-safe ownership 예시

- `engine/core/**` 안의 고립된 규칙 모듈 1개
- `engine/ai/**` 안의 국소 휴리스틱 또는 evaluator 1개
- `engine/data/**` 변환기/adapter 1개
- `data/events/**`, `data/characters/**`의 근거 추적 가능한 콘텐츠 패치
- `scripts/generate/**`, `scripts/process/**`, `scripts/crawl/**`의 단일 목적 툴
- `scripts/qa/**`의 리포트/재현 harness
- `public/fragments/generated/**`, `public/js/generated/**`, `public/css/generated/**`

마지막 generated app surface 계열은 아래 두 조건이 모두 참일 때만 허용한다.

- 해당 패스가 app-surface lane으로 명시적으로 열려 있다.
- machine-managed block 또는 generated fragment만 수정한다.

## Spark가 건드리면 안 되는 구역

아래는 lead Codex 또는 사람 승인 없이는 Spark 금지다.

- `scripts/orchestrate/runtime/**`
- `scripts/orchestrate/generated/**`
- `runs/**`
- `docs/agent-registry.json`
- `docs/agent-registry-summary.md`
- `docs/runtime-env.md`
- `docs/agentic-runtime-2.0.md`
- `public/index.html`
- `public/css/style.css`
- `public/js/app.js`
- `public/js/action-panel.js`
- `server.js`
- `package.json`
- `vercel.json`

위 파일은 runtime, routing, app-surface, deploy, registry의 교차 계약 지점이라 Spark 단독 소유로 두지 않는다.

## Active Long Run Guardrails

3시간 이상짜리 런이 활성 상태일 때는 아래를 추가 잠금으로 본다.

- `git status --short` 에서 이미 modified 상태인 파일
- 현재 pass artifact를 생성 중인 `scripts/orchestrate/**`
- export artifact가 밀리는 `runs/**`
- registry, routing-state, runtime-env 계열 문서

즉 active long run 동안 Spark는 원칙적으로 아래 셋 중 하나만 맡긴다.

- isolated engine slice
- content/data batch patch
- non-runtime QA or tooling

## Required Task Card Fields

Spark worker에 넘기는 카드에는 최소 아래가 있어야 한다.

- `goal`
- `inputs`
- `owned_paths`
- `non_goals`
- `done_criteria`
- `gates`
- `trace`
- `handoff`
- `phase_type`
- `mutation_scope`
- `touches_app_surface`

이는 `docs/agent-contracts.md`의 공통 계약과 맞춘다.

## Default Values

대부분의 Spark 작업은 아래 기본값으로 시작한다.

- `phase_type`: `report`
- `mutation_scope`: `product-core`
- `touches_app_surface`: `false`

아래 경우만 예외다.

- generated app-surface lane에 명시적으로 배정된 경우: `touches_app_surface=true`
- pure workflow/doc/tooling 작업인 경우: `mutation_scope=workflow`

## Escalate Immediately If

- 다른 subsystem 파일이 추가로 필요하다.
- save/load 호환성 판단이 필요하다.
- runtime queue, policy, registry, routing-state를 만지게 된다.
- `public/index.html`, `public/css/style.css`, `public/js/app.js`, `public/js/action-panel.js` 변경이 필요하다.
- done criteria를 테스트로 닫지 못한다.
- 현재 장기 런이 같은 파일을 쓰고 있다.

## Ownership Bundles

### Engine slice
- lead owner: `engine-integrator`
- Spark owned paths:
  - `engine/core/**`
  - optional local tests or harness under `scripts/qa/**`

### Content patch
- lead owner: `content-planner`
- Spark owned paths:
  - `data/events/**`
  - `data/characters/**`
  - optional helper under `scripts/process/**`

### Balance helper
- lead owner: `balance-researcher`
- Spark owned paths:
  - `scripts/balance/**`
  - report-only artifacts outside active runtime paths

### Generated app surface
- lead owner: `ux-stage-director` or `engine-integrator`
- Spark owned paths:
  - `public/fragments/generated/**`
  - `public/js/generated/**`
  - `public/css/generated/**`

이 경우에도 machine-managed core block patch는 lead가 최종 승인한다.
