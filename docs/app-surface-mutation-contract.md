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
- `public/js/presentation-meta.js`
- `public/index.html`
- `public/css/style.css`
- `public/assets/maps/`
- `public/js/generated/`
- `public/css/generated/`
- `public/fragments/generated/`

위 경로 바깥의 `public/` 파일은 app-surface lane이 직접 수정하지 않는다.

## 허용되는 작업

- local Codex session을 이어받아 수행하는 app-surface agent edit
- generated scene card fragment 갱신
- generated CSS token/variant 갱신
- generated UI summary module 갱신
- 작전/전장/장면 흐름 관련 핵심 JS/CSS/HTML의 machine-managed block 수정
- 지도 베이스맵 및 전장 오버레이 관련 자산 수정
- 하나의 pass 안에서 완결 가능한 bounded feature-sized app interaction 추가
  - 예: 도시 선택 흐름 강화, command rail 확장, tactical overlay, keyboard control, war-room briefing 개선
  - 단, 허용 경로 안에서 끝나고 outer QA gate를 통과할 수 있어야 한다

## 현재 구현된 machine-managed block

- `public/index.html`
  - generated run/meta block
  - generated war room / command slot mount point
- `public/css/style.css`
  - generated accent/style block
- `public/js/app.js`
  - war room generated runtime block
- `public/js/action-panel.js`
  - command panel generated runtime block

위 블록 바깥의 사람 코드는 app-surface controlled patch가 직접 덮어쓰지 않는다.

## 금지되는 작업

- 허용 경로 밖의 `public/` 파일 수정
- unrelated 서비스의 UI 파일 수정
- 계약 없이 대규모 경로 이동/삭제
- 사람 검토 없이 무차별적 전체 재작성
- QA gate 없이 죽은 shell 기능만 남기는 반쪽짜리 feature 추가

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

- generated fragment를 더 많은 장면 카드와 briefing rail로 확장
- durable runtime에서 `WDTT_RUNTIME_MUTATION_MODE=full` + `WDTT_RUNTIME_ALLOW_APP_SURFACE=true` 또는 `--include-hybrid`로 hybrid lane을 더 공격적으로 운영
- app-surface game phase에서 local `codex exec resume` thread를 더 안정적으로 lane 전용 세션으로 고정
- generated JS block와 app surface QA를 lane fitness 신호와 더 강하게 연결
- 작은 polish lane을 넘어서 bounded feature lane으로 운영하되, inner hook는 `node --check` 중심으로 닫고 최종 `qa:slice`는 outer durable gate 하나로 통일

## 관련 factory hook

- factory phase의 local Codex hook는 별도 세션으로 운영한다
- factory hook는 orchestration/QA/policy/docs를 우선 만지고, app-surface core 파일은 직접 수정하지 않는다
