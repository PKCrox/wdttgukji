# Factory Loop

`wdttgukji`의 기본 운영 루프는 “단계 목록”이 아니라 “단계별 계약”이어야 한다.

각 단계는 다음 조건을 만족해야 한다.
- 입력 산출물을 명확히 가진다.
- 출력 산출물의 위치와 형식을 남긴다.
- 통과/실패 기준이 있다.
- 다음 단계로 넘어갈 승인 조건이 있다.
- 재실행 가능하다.
- 장기 런은 durable runtime(Postgres + Redis)에서 재개 가능해야 한다.

## Phase 1. 수집

- 담당: `world-data-researcher`
- 입력: 외부 소스, 수집 대상 목록
- 출력: `data/raw/`
- 필수 메타: `source`, `url`, `crawled_at`, `license/usage note`, `entity id`
- 게이트:
  - raw 파일이 출처별로 구분되어 있어야 한다.
  - 재수집 시 resume/fallback 경로가 있어야 한다.
- 다음 단계 승인:
  - 입력 엔티티 기준으로 누락률이 허용 범위 이내
  - 출처 메타 누락 0

## Phase 2. 가공

- 담당: `world-data-researcher`
- 입력: `data/raw/`
- 출력: `data/processed/`
- 필수 산출물:
  - 정규화된 엔티티
  - 이름 교차참조
  - 관계/연표/지리 구조화 데이터
- 게이트:
  - downstream이 읽을 수 있는 안정된 스키마
  - raw 근거를 역참조할 수 있어야 한다
- 다음 단계 승인:
  - 처리 실패/누락 엔티티 목록이 남아 있어야 한다
  - 스키마 위반 0

## Phase 3. 콘텐츠 생성/검수

- 담당: `content-planner`
- 입력: `data/processed/`
- 출력: `data/characters/`, `data/events/`
- 필수 산출물:
  - soul.md / soul-data
  - 이벤트 JSON
  - 품질 게이트 리포트
- 게이트:
  - 서사 텍스트에 근거 추적 가능
  - TODO, placeholder, 빈 선택지 금지
- 다음 단계 승인:
  - 이벤트 품질 검사 통과
  - 핵심 인물/이벤트 누락 없음

## Phase 4. 엔진 통합

- 담당: `engine-integrator`
- 입력: 시나리오, 이벤트, 캐릭터 데이터
- 출력: 플레이 가능한 상태 머신과 UI
- 필수 산출물:
  - `engine/`에서 재사용 가능한 순수 로직
  - `public/`의 플레이 가능한 장면
  - 저장/로드 호환성
- 게이트:
  - 브라우저 경로와 헤드리스 경로가 같은 규칙을 공유
  - 테마 데이터와 엔진 규칙이 섞이지 않음
- 다음 단계 승인:
  - slice QA 통과
  - 첫 플레이 루프가 진행 막힘 없이 동작

## Phase 5. 밸런스 실험

- 담당: `balance-researcher`
- 입력: `scripts/balance/program.md`, `train.js`, `prepare.js`
- 출력: score, run artifacts, 채택/폐기 판단
- 필수 산출물:
  - 실험 변수
  - 이전 run 대비 비교
  - 채택/폐기 이유
- 게이트:
  - 점수 개선 근거 없이 감으로 채택 금지
  - anomaly 악화 시 채택 금지
- 다음 단계 승인:
  - `program.md`에 accepted/rejected 기록
  - latest run trace 저장

## Phase 6. 플레이 테스트

- 담당: `qa-persona-simulator`
- 입력: UI 플레이, 헤드리스 결과, 로그, run artifacts
- 출력: 버그/리스크 목록, 다음 루프 우선순위
- 필수 산출물:
  - 페르소나별 문제
  - 시스템 리스크
  - UI 피드백 리스크
- 게이트:
  - “재미 없는 실패”와 “망가진 실패”를 구분
  - 수치와 플레이 흐름을 같이 기록
- 다음 단계 승인:
  - 다음 루프 우선순위가 명시되어야 함

## Phase 7. 구조 재설계

- 담당: `pipeline-architect`
- 목적: 병목 제거, 테마 독립성 강화, 단계간 계약 재정의
- 입력:
  - phase gate 실패 패턴
  - trace / runs / QA 리포트
- 출력:
  - 새 계약
  - 디렉터리 구조 변경안
  - multi-agent escalation 판단

## 공통 필수 계약

모든 단계는 아래를 남긴다.
- 입력 경로
- 출력 경로
- 통과 조건
- 실패 이유
- 다음 액션
- trace id 또는 run id

관련 문서:
- `docs/agent-contracts.md`
- `docs/pass-priority-rubric.md`
- `ai/workflows/multi-agent-escalation.md`
- `ai/workflows/ux-slice-loop.md`
- `ai/workflows/n-pass-adaptive-loop.md`
- `docs/agentic-runtime-2.0.md`
