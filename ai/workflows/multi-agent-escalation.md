# Multi-Agent Escalation

`wdttgukji`는 무조건 멀티에이전트로 시작하지 않는다.

기본 순서는 아래와 같다.

1. single-agent
2. routed specialist
3. escalated multi-agent
4. pipeline-architect review

## 1. Single-Agent로 처리하는 경우

조건:
- 파일 1~3개 수정
- 한 레이어 안의 국소 변경
- upstream/downstream 계약이 이미 명확
- QA 기준이 단순

예:
- 이벤트 effect alias 추가
- 저장 메타 버그 수정
- UI 문구 변경

## 2. Routed Specialist로 승격하는 경우

조건:
- 한 레이어를 넘지만 주도권이 명확
- 특정 전문 판단이 중요
- 사람 검토 없이도 목표가 안정적

라우팅 기준:
- 데이터/크롤링: `world-data-researcher`
- 코에이 레퍼런스/장면 구조: `koei-systems-designer`
- 지도 아트/전장 비주얼: `map-art-director`
- 첫 10분 UX/장면 위계: `ux-stage-director`
- 콘텐츠 품질: `content-planner`
- 엔진/프런트 연결: `engine-integrator`
- 수치 실험: `balance-researcher`
- 플레이감/실패 사례: `qa-persona-simulator`
- 종료 조건/trace/handoff 정리: `release-orchestrator`

## 3. Escalated Multi-Agent가 필요한 경우

아래 중 하나라도 만족하면 멀티에이전트로 올린다.

- 데이터, UI, 엔진이 동시에 바뀐다
- 하나의 변경이 3개 이상 단계에 영향을 준다
- “품질 기준”과 “구현 방식”이 동시에 불명확하다
- 단일 파일 수정이 아니라 계약 재정의가 필요하다
- 같은 문제에 대해 UX, 시스템, QA 관점이 충돌한다

대표 예:
- 지도 파이프라인 교체
- 테마 독립 인터페이스 도입
- 첫 10분 UX 전면 재설계
- 콘텐츠 스키마와 이벤트 엔진 동시 개편

## 4. Escalated Multi-Agent 운영 방식

필수 스트림:
- Design stream: `koei-systems-designer`
- UX stream: `ux-stage-director`
- Integration stream: `engine-integrator`
- QA stream: `qa-persona-simulator`

필요시 추가:
- Art stream: `map-art-director`
- Content stream: `content-planner`
- Data stream: `world-data-researcher`
- Architecture stream: `pipeline-architect`
- Delivery stream: `release-orchestrator`

운영 규칙:
- 각 스트림은 같은 파일을 직접 동시에 수정하지 않는다.
- 공통 파일(`public/js/app.js`, `public/css/style.css`)은 `engine-integrator`가 최종 병합한다.
- QA는 구현 후행이 아니라 중간 게이트다.
- 승격된 작업은 trace를 남긴다.
- 사용자가 `n패스`를 요청한 작업은 `ai/workflows/n-pass-adaptive-loop.md`를 따른다.
- durable runtime에서는 병렬성의 기준이 “에이전트 수”가 아니라 task graph의 독립성이다.
- app surface mutation task는 구조적으로 지원하더라도 기본 policy에서는 dispatch하지 않는다.

## 5. Human-In-The-Loop 지점

다음은 사람 확인 없이 진행하지 않는다.

- 아트 방향 변경
- 핵심 UX 기준 viewport 변경
- 테마 독립 인터페이스 파괴
- balance accepted 값 교체
- 대규모 콘텐츠 삭제/재생성

## 6. 종료 조건

멀티에이전트 작업은 아래가 있어야 닫힌다.

- 변경 요약
- 영향 범위
- 게이트 결과
- 남은 리스크
- 다음 루프 우선순위
- `dominant_bottleneck`
- `chosen_next_pass`
