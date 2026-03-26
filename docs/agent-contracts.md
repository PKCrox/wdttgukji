# Agent Contracts

에이전트 이름만 있는 구조는 운영 체계가 아니다.

이 문서는 각 에이전트의 입력, 출력, 실패 조건, trace 의무를 명확히 고정한다.

## 공통 계약

모든 에이전트는 최소 아래를 남긴다.

- `goal`: 이번 작업의 목표
- `inputs`: 읽은 파일/산출물
- `outputs`: 생성/수정한 파일
- `gates`: 통과해야 할 검사
- `trace`: 판단 근거와 run id
- `handoff`: 다음 에이전트가 소비할 요약
- `phase_type`: `gate` 또는 `report`
- `mutation_scope`: `none`, `workflow`, `product-core`, `full`
- `touches_app_surface`: `true|false`

`report` 단계는 장기 메타 런에서 `soft-fail signal`로 취급할 수 있다. 이 경우:

- stderr/stdout는 반드시 artifact로 남긴다
- pass 전체를 즉시 실패시키지 않는다
- aggregate 분석에서 별도 failure histogram으로 집계한다

## world-data-researcher

- 입력: `data/raw/`, 크롤링 스크립트, 엔티티 목록
- 출력: `data/raw/`, `data/processed/`
- 게이트:
  - 출처 메타 누락 0
  - resume 가능한 수집 경로 유지
- 실패 조건:
  - source/url/crawled_at 누락
  - 처리 후 역참조 불가

## content-planner

- 입력: `data/processed/`, 스키마, 기존 이벤트/캐릭터 자산
- 출력: `data/characters/`, `data/events/`
- 게이트:
  - TODO / placeholder 0
  - 근거 추적 가능
  - 선택지/효과 구조 완결
- 실패 조건:
  - 서사 텍스트만 있고 시스템 연결 근거 없음

## koei-systems-designer

- 입력: `docs/koei-analysis.md`, `public/js/`, `engine/core/`
- 출력: 장면 구조 메모, 시스템 비교, 단순화 제안
- 게이트:
  - “무엇을 더할지”보다 “무엇을 덜 보여줄지” 판단 포함
  - 코에이 참조가 현재 구현과 연결됨
- 실패 조건:
  - 레퍼런스 나열만 하고 실제 구현 판단이 없음

## map-art-director

- 입력: `public/assets/maps/`, `public/js/map-renderer.js`, UX 계약 문서
- 출력: 베이스맵 방향, 지도 시각 언어, 아트 교체 우선순위
- 게이트:
  - 베이스맵과 오버레이 책임 분리
  - 지도 가독성과 게임성의 위계 명확
- 실패 조건:
  - CSS 효과로 맵 품질 문제를 덮음

## ux-stage-director

- 입력: UX 계약, 장면 구조, 현재 화면
- 출력: first-frame fit 우선순위, 접을 정보 목록, 장면 역할 정의
- 게이트:
  - 첫 프레임 기준 판단 포함
  - 장면별 행동 유도 설계 포함
- 실패 조건:
  - 보기 좋은 박스 정리에 그치고 플레이 흐름 판단이 없음

## engine-integrator

- 입력: `engine/`, `public/`, 시나리오 데이터, 이벤트 데이터
- 출력: 플레이 가능한 UI + 상태 머신
- 게이트:
  - 브라우저/헤드리스 경로 정합
  - 저장/로드 호환
  - UI와 엔진 경계 유지
- 실패 조건:
  - 프런트 편의 상수가 엔진 규칙을 왜곡
  - 중복 로직이 브라우저와 CLI에 따로 생김

## balance-researcher

- 입력: `scripts/balance/program.md`, `train.js`, `runs/`
- 출력: run 비교, 채택/폐기 판단
- 게이트:
  - accepted 값은 수치 근거 기반
  - anomaly 악화 시 reject
- 실패 조건:
  - 감으로 채택
  - run artifact 없이 수치 변경

## qa-persona-simulator

- 입력: UI 플레이, 헤드리스 결과, logs, runs
- 출력: 버그/리스크/우선순위 리포트
- 게이트:
  - 수치와 플레이 흐름을 같이 다룸
  - 페르소나 기준이 명시됨
- 실패 조건:
  - “느낌상 별로”만 있고 재현 조건이 없음

## pipeline-architect

- 입력: phase gate 실패 패턴, trace, QA 리포트, README 방향성
- 출력: 구조 변경안, 계약 변경안, escalation 판단
- 게이트:
  - 공장 재현성 개선이 명시됨
  - upstream/downstream 계약이 다시 정의됨
- 실패 조건:
  - 제품 한 장면 최적화에 머무름

## release-orchestrator

- 입력: workflow 계약, trace, QA 결과, 변경 파일
- 출력: 패스 목표, 게이트 결과, handoff, 다음 액션
- 게이트:
  - 종료 조건과 미완료 리스크를 함께 남김
  - 어떤 승격 경로를 탔는지 명시
- 실패 조건:
  - 많이 바꿨다는 서술만 있고 게이트 상태가 없음

## Trace Schema

권장 trace 형식:

```json
{
  "trace_id": "ux-slice-20260324-001",
  "goal": "macbook14 first-frame fit",
  "agent": "engine-integrator",
  "inputs": [
    "docs/macbook14-ux-contract.md",
    "public/js/app.js",
    "public/css/style.css"
  ],
  "outputs": [
    "public/js/app.js",
    "public/css/style.css"
  ],
  "gates": [
    "npm run qa:macbook14"
  ],
  "result": "pass",
  "dominant_bottleneck": "war-room first-frame cost",
  "next_pass_candidates": [
    {
      "label": "city rail compression",
      "axis": "ux-first-frame",
      "score": 12
    },
    {
      "label": "map symbol redesign",
      "axis": "map-art",
      "score": 10
    }
  ],
  "chosen_next_pass": "city rail compression",
  "why_not_others": [
    "map symbol redesign matters, but first-frame density still causes more player harm"
  ],
  "handoff": "war-room remains the largest vertical cost center"
}
```

이 trace는 파일로 저장해도 되고, run artifact에 포함되어도 된다.

멀티패스 작업에서는 아래 필드를 추가 권장사항이 아니라 기본 필드로 본다.

- `dominant_bottleneck`
- `next_pass_candidates`
- `chosen_next_pass`
- `why_not_others`
- `target_axis_counts`
- `target_deficits`
- `failed_passes`
- `policy_snapshot_version`
- `review_after_pass`

## Agent Registry

에이전트 목록의 canonical source는 `docs/agent-registry.json`이다.

- 개별 `ai/agents/*.md`는 역할 설명 문서
- `agent-registry.json`은 실행 가능한 roster
- 메타 런 종료 시 아래 artifact가 자동 생성된다
  - `agent-fitness.json`
  - `agent-gaps.json`
  - `agent-upgrade-proposals.json`
  - `agent-upgrade-application.json`
  - `agent-routing-state.json`
  - `agent-registry-summary.md`
  - `ai/agents/*.md` registry sync block
- `agent-upgrade-proposals.json`은 최근 proposal history와 cooldown을 참고해 중복 제안을 줄여야 한다.
- `agent-routing-state.json`은 lane urgency와 pending agent 상태를 adaptive routing에 재주입하는 canonical runtime hint다.
- 신규 agent 생성은 즉시 docs를 쓰기보다 우선 `pending_agents`에 등록하고, 후속 review에서 승격한다.
- `scripts/orchestrate/generated/pending-agents/*.json`은 pending agent를 실제 생성 후보 manifest로 물질화한 machine-managed 영역이다.
- `ai/agents/pending/*.md`는 pending agent manifest로부터 자동 생성된 draft 문서 영역이다.
- `promote-pending-agents.js`는 pending agent가 반복 review를 통과하면 active registry와 `ai/agents/*.md`로 승격시키는 단계다.

즉 agent 체계도 고정 명단이 아니라 메타 런에서 계속 검토되는 대상으로 본다.
