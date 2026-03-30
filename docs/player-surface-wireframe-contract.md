# Player Surface Wireframe Contract

기준 viewport는 [macbook14-ux-contract.md](./macbook14-ux-contract.md)의 `1512x982`를 따른다.

이 문서는 app-surface를 세 개의 플레이어 화면으로 고정한다.

## 1. Start Screen

목표: 시나리오와 세력 선택으로 빠르게 진입시킨다.

### Required regions
- 상단 좌측: 게임 타이틀, 한 줄 톤 설명
- 중앙 좌측: 메인 CTA, 최근 저장
- 중앙: 시나리오/세력 진입 모듈
- 우측: 현재 시나리오 요약, 승리 감각, 핵심 수치 3~4개

### Required content
- 지금 시작할 시나리오가 무엇인지
- 누가 플레이어 세력인지 또는 어떤 세력을 고를 수 있는지
- 첫 3턴의 감각 한 문단
- 메인 CTA 하나, 보조 CTA 하나

### Must not appear
- `generated`, `factory`, `lane`, `urgency`, `agent` 같은 운영 메타
- 질문 카드 3개 이상
- 플레이 전부터 보이는 전장용 디버그 정보

### Interaction contract
- 클릭 1~2번 안에 게임 시작 가능해야 한다.
- 저장 슬롯은 CTA 근처에서 바로 이해되어야 한다.

## 2. Battlefield Hub

목표: 현재 턴의 판단을 내리는 메인 보드 역할을 한다.

### Required regions
- 상단 HUD: 연도/턴/자원/병력/행동 여유/다음 턴
- 중앙 메인: 전략 지도
- 좌상단 또는 중앙 상단: 이번 턴 짧은 브리프
- 우측 고정 패널: 선택 도시 카드 + 핵심 행동 3~5개
- 하단 보조 영역: 최근 결과 또는 로그 1개 묶음

### Required content
- 현재 선택 도시 이름과 소속
- 도시 압박 요약 2~3줄
- 즉시 실행 가능한 액션 3~5개
- 턴 종료 전 확인 포인트 1개 이상

### Must not appear
- 장문의 generated narrative
- lane/urgency/agent-routing-state 같은 내부 진단 문자열
- 지도 위를 가리는 큰 장식 패널
- 행동보다 긴 설명이 먼저 오는 우측 패널

### Interaction contract
- 도시 클릭 -> 우측 패널 내용 즉시 갱신
- 액션 클릭 -> 명령 패널 또는 즉시 실행
- 턴 종료는 항상 시야 안에 있어야 한다.

## 3. Command Sheet

목표: 선택 도시에서 구체적인 결정을 내리는 작업면이 된다.

### Required regions
- 상단: 도시명, 현재 턴 맥락, 닫기/확정
- 좌측 또는 상단 탭: 군사 / 내정 / 외교
- 본문: 선택한 명령의 효과, 비용, 위험, 예상 결과
- 우측 또는 하단: 확정 버튼, 대안 액션, 관련 장수/자원 정보

### Required content
- 내가 지금 무엇을 결정하는지
- 비용과 보상
- 이번 턴에 적용되는 제약
- 이 행동이 도시에 어떤 변화를 주는지

### Must not appear
- 큰 빈 공간
- 화면 밖으로 잘린 카드 조합
- 배경 설명만 있고 행동 확정점이 없는 구조

### Interaction contract
- 명령 패널은 스스로 완결된 작업면이어야 한다.
- 스크롤이 필요하다면 본문 내부에서만 발생해야 한다.
- 확정 버튼은 항상 패널 안에서 노출되어야 한다.

## Shared Guardrails

- 플레이어 표면은 내부 운영 아티팩트의 표시판이 아니다.
- 각 화면의 첫 프레임에서 핵심 행동이 보여야 한다.
- 같은 정보를 두 패널에서 반복하지 않는다.
- 장식은 정보 구조가 완성된 뒤에만 허용한다.
