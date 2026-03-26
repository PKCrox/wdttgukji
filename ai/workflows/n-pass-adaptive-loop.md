# N-Pass Adaptive Loop

`wdttgukji`에서 사용자가 `n패스 돌려`라고 요청하면, 그 의미는 “처음 정한 할 일 n개를 수행”이 아니다.

정확한 의미는 아래와 같다.

1. 현재 병목을 가장 먼저 친다.
2. 패스를 닫을 때 QA/브라우저/trace를 본다.
3. 다음 패스 우선순위를 다시 계산한다.
4. 남은 패스 수 안에서 가장 가치가 큰 작업 묶음을 다시 고른다.

즉, `n패스`는 고정 작업 큐가 아니라 `재판단을 포함한 반복 루프`다.

단, 이 적응성은 무예산 상태가 아니다.

- 각 패스 내부는 여러 스트림이 동시에 붙는 `multi-stream execution`
- 전체 `n패스` 묶음은 제품 핵심 축에 대한 `soft budget`

즉 `패스 내부 병렬`과 `런 전체 예산 제어`를 같이 가져가야 한다.

## 입력

- 사용자 목표
- 남은 패스 수
- 최신 trace
- 최신 QA 결과
- 최신 브라우저/플레이 체감
- 관련 계약 문서

## 패스 단위 공통 순서

### 1. Diagnose

- 현재 dominant bottleneck 하나를 고른다.
- bottleneck은 반드시 하나의 짧은 문장으로 표현한다.
- 예:
  - `첫 프레임 세로 비용이 너무 크다`
  - `지도 아트가 프로토타입처럼 보인다`
  - `작전 장면이 명령 장면과 체감상 분리되지 않는다`

### 2. Route

- bottleneck을 해결하는 데 필요한 최소 스트림 조합을 고른다.
- 선택 기준:
  - 장면/위계: `ux-stage-director`
  - 전장 아트/지도 언어: `map-art-director`
  - 구현/통합: `engine-integrator`
  - 검증/플레이감: `qa-persona-simulator`
  - 종료/trace: `release-orchestrator`
- 코에이 레퍼런스 판단이 핵심이면 `koei-systems-designer`를 추가한다.
- 계약 재정의가 필요하면 `pipeline-architect`를 추가한다.

### 3. Execute

- 한 패스 안에서 여러 스트림이 병렬로 읽기/분석/검증을 수행할 수 있다.
- 공통 파일 수정은 `engine-integrator`가 최종 병합한다.
- 패스는 “작은 fix 여러 개”가 아니라 “하나의 병목을 실제로 줄이는 묶음”이어야 한다.

### 4. Gate

- 패스 종료 전 최소 게이트를 실행한다.
- UX 작업:
  - `qa:macbook14`
- 맵 작업:
  - 브라우저 확인 + relevant syntax check
- 엔진 작업:
  - 관련 `node --check`
- 게이트 실패 시 그 패스는 미완료다.
- 단, 메타 반복 런에서 `report` 단계는 `soft-fail signal`로 둘 수 있다.
  - 예: `qa:triage`
  - 목적은 런 중단이 아니라 불건강 신호를 aggregate feedback으로 축적하는 것이다.

### 5. Re-prioritize

- `docs/pass-priority-rubric.md`로 다음 병목 후보를 점수화한다.
- 제품 프로필에 `targetAxisCounts`가 있으면, 단순 커버리지뿐 아니라 축별 `soft budget`도 함께 본다.
- 최소 아래를 남긴다.
  - `dominant_bottleneck`
  - `next_pass_candidates`
  - `chosen_next_pass`
  - `why_not_others`

### 6. Record

- 각 패스는 trace를 남긴다.
- trace가 없으면 패스가 닫힌 것이 아니다.

### 7. Agent Review

- 메타 런이 닫히면 lane coverage와 반복 패턴을 기준으로 agent roster도 다시 본다.
- 산출물:
  - `agent-gaps.json`
  - `agent-fitness.json`
  - `agent-upgrade-proposals.json`
  - `agent-routing-state.json`
- 목적:
  - 필요한 agent가 빠져 있는지
  - 기존 agent contract가 lane에 비해 약한지
  - repetition pressure가 agent 구조 문제인지
- 반복 제안은 `proposal cooldown`으로 묶는다.
- 신규 agent가 정말 필요하면 즉시 문서를 생성하지 않고 `pending agent`로 먼저 등록한다.
- 다음 adaptive run은 `agent-routing-state`의 lane urgency를 실제 점수에 반영한다.

## 적응형 규칙

### 고정 금지

아래는 `n패스` 요청에서 금지한다.

- 시작 시점에 모든 패스를 미리 고정하는 것
- 첫 패스 결과를 무시하고 동일한 TODO를 계속 미는 것
- QA 실패 상태에서 다음 패스로 넘어가는 것

### 허용되는 계획 수준

패스 시작 시에는 아래까지만 미리 정할 수 있다.

- 최종 목표
- 첫 패스의 유력 병목
- 2~3개의 예비 후보

그 이후는 매 패스 종료 시 재판단한다.

## 종료 조건

`n패스` 루프는 아래 중 하나에서 멈춘다.

- 요청한 패스 수를 모두 소진
- dominant bottleneck이 더 이상 구현보다 방향 결정 문제로 바뀜
- 계약 문서 변경이 먼저 필요한 상태가 됨
- 사람 확인이 필요한 변경점에 도달

## 보고 형식

`n패스` 완료 보고에는 최소 아래가 있어야 한다.

- 각 패스의 dominant bottleneck
- 실제로 바뀐 산출물
- 통과/실패 게이트
- 마지막 시점의 남은 가장 큰 병목
- 다음 패스 첫 후보

## 관련 문서

- `docs/pass-priority-rubric.md`
- `docs/agent-contracts.md`
- `ai/workflows/multi-agent-escalation.md`
- `ai/workflows/ux-slice-loop.md`
