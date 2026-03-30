# Battlefield Operational Map Plan

`wdttgukji` 전장은 “도시를 클릭하는 전략 UI”가 아니라 “지형과 공세축을 읽는 작전지도”가 되어야 한다.

이 문서는 `208 적벽대전` Phaser 전장을 코에이식 작전지도 문법으로 끌어올리기 위한 상세 실행 계획이다.

## 1. 현재 판정

좋은 점:
- `WorldMapScene`에 선택 도시 중심 포커스, 압박 축, 지원선, 브리프 카드가 이미 있다.
- `UIOverlay`는 이전보다 얇아졌고, `command`와 `battlefield`가 같은 전장 맥락을 공유한다.
- `StrategyMapOverlay`로 Google My Maps를 즉시 열 수 있어 외부 참조도는 확보했다.

부족한 점:
- 줌이 아직 “확대/축소”일 뿐 “다른 작전 정보 단계”가 아니다.
- 우리 편/적 편/접경권이 면과 선으로 분리되지 않는다.
- 강/산맥/관문 같은 지형 구속이 맵 읽기의 주연이 아니다.
- 도시 선택 전에도 “지금 어느 전선이 뜨거운지”가 잘 보이지 않는다.

## 2. 이미 있는 데이터

`208-red-cliffs.json`의 `mapLayout`에는 이미 아래 데이터가 있다.

- `cityAnchors`
- `roads`
- `territoryPolygons`
- `labels`
- `landmarks`
- `waterPolygons`
- `ridgePaths`
- `frontlineAnchors`
- `focusZones`

즉 본선은 “새 데이터 invent”보다 “기존 데이터의 의미를 살려 semantic zoom과 전선 문법으로 묶는 것”이다.

## 3. 목표 경험

### 전략 줌

플레이어가 읽어야 하는 것:
- 세력권
- 대하와 산맥
- 거대 지역명
- 핵심 전선 축
- 수도/주요 거점

플레이어 질문:
- `지금 판세가 어디서 갈리는가`

### 전선 줌

플레이어가 읽어야 하는 것:
- 접경 도시
- 아군 지원선
- 적 압박 축
- 관문/병목
- 주전선 브리프

플레이어 질문:
- `이번 턴 어느 방면을 붙잡아야 하는가`

### 국지 줌

플레이어가 읽어야 하는 것:
- 선택 도시
- 인접 위협
- 병력/사기
- 바로 열 명령

플레이어 질문:
- `이 거점에서 지금 무엇을 실행할 것인가`

## 4. Zoom Tier 계약

### Tier A. Strategic

- zoom 범위: `0.78 ~ 0.91`
- 보이는 것:
  - `territoryPolygons`
  - `waterPolygons`
  - `ridgePaths`
  - `labels`
  - `landmarks`
  - `frontlineAnchors`
- 줄이거나 숨길 것:
  - 일반 도시 라벨
  - 일반 병력 바
  - minor road

### Tier B. Frontline

- zoom 범위: `0.92 ~ 1.27`
- 보이는 것:
  - Strategic 요소 전부
  - major road
  - 접경 도시 라벨
  - 선택 도시 브리프
  - 압박 축 / 지원선
- 줄이거나 숨길 것:
  - 저중요도 도시 디테일
  - 과한 설명 패널

### Tier C. Local

- zoom 범위: `1.28 ~ 1.8`
- 보이는 것:
  - 선택 도시 중심 포커스
  - 인접 도시 라벨과 병력/사기
  - local axis arrows
  - 명령 진입 직전 브리프
- 줄이거나 숨길 것:
  - 큰 지역명
  - 원거리 front overlay

## 5. Zoom Bounds 계약

### 자유 탐색

- `minZoom = 0.78`
- `maxZoom = 1.32`

### 도시 선택 상태

- `minZoom = 0.92`
- `maxZoom = 1.55`

### 명령 패널 열림

- `minZoom = 1.02`
- `maxZoom = 1.65`

### 나중에 추가할 모드

- `overview mode`
  - 전국 판세만 볼 때 `0.68` 허용
  - 명시적 토글로만 진입

## 6. 전장 문법

### 도시

- 점이 아니라 전선 노드
- 선택 시:
  - 원거리 도시는 눌린다
  - 연결 전선만 살아난다
  - 요충도/병력/사기로 중요도가 달라진다

### 길

- `major road`: 전선 줌 이상에서 강하게
- `minor road`: local에서만 충분히
- `mountain_pass`: 길이 아니라 병목으로 표시
- `river corridor`: 일반 road보다 두껍고 흐름이 살아야 한다

### 지형

- 강:
  - 장강 / 황하를 “배경 장식”이 아니라 전략 장벽으로 그림
- 산맥:
  - 태행산 / 진령 / 촉도를 이동 제한 구조로 보이게 그림
- 관문:
  - 후속 데이터 확장 대상
  - 하후/동관/양평관/검각 등은 별도 glyph 필요

### 전선

- `frontlineAnchors`를 단순 장식선이 아니라 전선 belt로 승격
- 선택 도시가 해당 전선에 속하면 선 두께/alpha 상승
- 적이 더 강한 축은 `주공 축`
- 아군 보급이 강한 축은 `중핵 지원선`

## 7. Overlay 역할 재정의

### UIOverlay

전장에서는:
- 숫자 ledger
- 짧은 directive line
- command entry

하지 말 것:
- 긴 설명문
- 지도 위 정보를 다시 패널에서 반복

### StrategyMapOverlay

- 목적: 외부 참조도
- 위치: 보조 도구
- 역할:
  - 실제 전장 검수
  - 방면/수로/관문 해석 보조
  - 도시별 authored briefing 지원

최종 목표:
- Phaser 맵이 주연
- Google My Maps는 보조

## 8. 구현 단계

### Phase 1. Semantic Zoom 연결

대상:
- `src/scenes/WorldMapScene.js`

할 일:
- zoom tier 계산
- zoom bounds 상태 분기
- `waterPolygons`, `ridgePaths`, `landmarks`, `frontlineAnchors` 렌더 연결
- tier별 alpha/visibility 조정

완료 기준:
- 확대 수준에 따라 보이는 정보가 바뀐다
- 전략/전선/국지 3단계가 체감된다

### Phase 2. 전선 Ownership 문법

대상:
- `WorldMapScene`
- 시나리오 `mapLayout`

할 일:
- 아군권/적권/접경 belt 정리
- selected front emphasis
- corridor strength 시각화

완료 기준:
- 우리 편/적 편/접경이 도시 점보다 면과 선으로 먼저 읽힌다

### Phase 3. 지형 제약 문법

대상:
- 시나리오 데이터
- `WorldMapScene`

할 일:
- 관문/도강/수로/산맥 이동 병목 glyph
- river crossing / pass marker

완료 기준:
- “왜 이 길이 중요하지?”가 아니라 “이 길이 막히면 판세가 바뀐다”가 보인다

### Phase 4. 도시별 authored briefing

대상:
- `UIOverlayScene`
- `ActionPanelScene`
- 시나리오 authored data

할 일:
- 양양, 강릉, 장사, 합비 계열 등 핵심 도시마다 다른 전장 브리프
- 작전도 overlay header와 동기화

완료 기준:
- 같은 UI라도 도시마다 읽히는 전장 서사가 다르다

## 9. QA 기준

- `1512x982`에서 전장 first frame이 여전히 맵 중심이어야 한다
- `390x844`에서도 깨지지 않아야 한다
- `qa:surface`, `ui:pass:verify` 통과
- semantic zoom에서 텍스트 겹침이 없어야 한다
- 선택 도시 없는 상태 / 선택 상태 / command 열린 상태에서 zoom bounds가 다르게 동작해야 한다

## 10. 바로 다음 작업

다음 구현 우선순위:
1. `WorldMapScene`에 semantic zoom tier 추가
2. 이미 있는 `waterPolygons`, `ridgePaths`, `landmarks`, `frontlineAnchors` 렌더 연결
3. selected / unselected 상태에 맞는 min zoom clamp 도입

즉, 다음 한 수는 새 아이디어가 아니라:

> `이미 있는 지형 데이터`를 `줌 단계별 작전지도 문법`으로 살리는 것
