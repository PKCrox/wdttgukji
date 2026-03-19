# Factory Loop

`wdttgukji`의 기본 운영 루프. 각 단계는 독립적으로 재실행 가능해야 하며, 다음 단계가 소비할 출력 형식을 명확히 남겨야 한다.

## 1. 수집

- 담당: `world-data-researcher`
- 입력: 외부 소스
- 출력: `data/raw/`

## 2. 가공

- 담당: `world-data-researcher`
- 입력: `data/raw/`
- 출력: `data/processed/`

## 3. 콘텐츠 생성/검수

- 담당: `content-planner`
- 입력: `data/processed/`
- 출력: `data/characters/`, `data/events/`

## 4. 엔진 통합

- 담당: `engine-integrator`
- 입력: 시나리오, 이벤트, 캐릭터 데이터
- 출력: 플레이 가능한 상태 머신과 UI

## 5. 밸런스 실험

- 담당: `balance-researcher`
- 입력: `program.md`, `train.js`
- 출력: score, runs, 채택/폐기 판단

## 6. 플레이 테스트

- 담당: `qa-persona-simulator`
- 입력: 플레이 로그, 헤드리스 결과, 실제 UI 플레이
- 출력: 리스크 리포트와 다음 루프의 우선순위

## 7. 구조 재설계

- 담당: `pipeline-architect`
- 목적: 병목 제거, 테마 독립성 강화, 단계간 계약 재정의
