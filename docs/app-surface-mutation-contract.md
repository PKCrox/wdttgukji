# App Surface Mutation Contract

이 문서는 `wdttgukji` 공장이 향후 app surface lane을 열 때 지켜야 할 계약을 고정한다.

현재 기본 정책은 **factory phase에서는 자동 app mutation 금지**, `game phase`에서만 controlled mutation 허용이다.

## 기본 원칙

- 기본 mutation policy는 `product-core`
- `public/` 전체를 자유 수정하는 것은 금지
- `game phase`에서도 허용된 게임 핵심 파일과 machine-managed 영역만 수정 가능
- 사람 승인 없이 무관한 경로나 임의 파일 전체를 덮어쓰지 않는다

## 허용 가능한 controlled 경로

- `public/js/app.js`
- `public/js/action-panel.js`
- `public/js/map-renderer.js`
- `public/js/sidebar.js`
- `public/index.html`
- `public/css/style.css`
- `public/assets/maps/`
- `public/js/generated/`
- `public/css/generated/`
- `public/fragments/generated/`

위 경로 바깥의 `public/` 파일은 app-surface lane이 직접 수정하지 않는다.

## 허용되는 작업

- generated scene card fragment 갱신
- generated CSS token/variant 갱신
- generated UI summary module 갱신
- 작전/전장/장면 흐름 관련 핵심 JS/CSS/HTML 수정
- 지도 베이스맵 및 전장 오버레이 관련 자산 수정

## 금지되는 작업

- 허용 경로 밖의 `public/` 파일 수정
- unrelated 서비스의 UI 파일 수정
- 계약 없이 대규모 경로 이동/삭제
- 사람 검토 없이 무차별적 전체 재작성

## 활성화 조건

아래 두 조건을 모두 만족해야 한다.

1. `WDTT_RUNTIME_MUTATION_MODE=full`
2. `WDTT_RUNTIME_ALLOW_APP_SURFACE=true`

그리고 task metadata가 아래를 포함해야 한다.

- `managedSurfaceAreas`
- `appSurfaceContractVersion`

## 현재 계약 버전

- `appSurfaceContractVersion: 2`

## 향후 확장 방향

- generated fragment를 앱이 읽는 include 구조 도입
- generated CSS layer를 `@layer generated`로 분리
- generated JS module을 앱 오케스트레이터가 안전하게 import
