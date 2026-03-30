# UX Slice Loop

`factory-loop`의 4단계(엔진 통합)와 6단계(플레이 테스트) 사이에서 반복되는 `플레이어 경험 전용 루프`.

목표는 “코드를 조금씩 고치는 것”이 아니라 “기준 viewport에서 플레이어가 한 화면 안에서 게임을 읽을 수 있게 만드는 것”이다.

이 루프는 `레이아웃/장면/카피 안정화`를 위한 루프다. 페르소나 시뮬레이션은 그 다음 단계다.

## 스트림

### A. UX Contract
- 입력: `docs/macbook14-ux-contract.md`
- 입력: `docs/game-philosophy.md`
- 출력: 이번 패스에서 건드릴 화면과 금지선

### B. Philosophy / Scene Direction
- 담당: `koei-systems-designer` + `ux-stage-director`
- 입력: 시작/세력/인트로/전장/작전/결산 장면
- 출력: 장면의 극적 질문, 무엇을 보여줄지, 무엇을 접을지

### C. Map Presence
- 담당: `map-art-director`
- 입력: 전장 맵, 시작 전 화면 잔상, 선택 상태의 맵 존재감
- 출력: 지도 위계, 베이스맵/오버레이 경계, 장면별 지도 노출 판단

### D. Tone / Copy Fit
- 담당: `content-planner`
- 입력: 장면 제목, 브리프, command digest, turn bridge/start copy
- 출력: 시대 톤에 맞는 문장과 off-tone 제거 목록

### E. UI Integration
- 담당: `engine-integrator`
- 입력: `src/scenes`, `src/screens`, `src/utils`, `index.html`
- 출력: 실제 동작하는 장면과 상호작용

### F. Fit QA
- 담당: visible Playwright + `ux-stage-director`
- 입력: `1512x982`, `1280x800`, `qa:slice`, `watch-app-surface`
- 출력: frame fit, first-frame fit, overflow 여부

### G. Persona Pass
- 담당: `qa-persona-simulator`
- 입력: 위 단계가 안정된 뒤의 1~3턴 플레이 흐름
- 출력: “이상한 대사”, “행동 유도 실패”, “장면 의도와 다른 체감” 보고

## 패스 순서

1. `npm run qa:ui-preflight`로 repo 경계, viewport, specialist 조합을 다시 확인한다.
2. `docs/game-philosophy.md` 기준으로 이 화면의 극적 질문과 주연을 먼저 적는다.
3. visible Playwright를 먼저 열고 실제 장면을 본다.
4. 첫 프레임에서 꼭 보여야 할 정보만 남긴다.
5. 넘치는 정보는 패널 내부 스크롤이나 접힘으로 보낸다.
6. 수정 후 visible Playwright로 먼저 재확인한다.
7. `qa:slice`와 viewport fit 검사를 같이 통과시킨다.
8. 그 다음 패스는 “무엇을 더할지”보다 “무엇을 덜 보여줄지”부터 판단한다.

## 체크리스트

- 시작 화면 첫 프레임이 깔끔한가
- 세력 선택이 세로로 넘치지 않는가
- 전장 첫 프레임이 한 화면에 들어오는가
- 사용자가 전체 페이지 스크롤을 시도하게 만들고 있지 않은가
- 지도 퀄리티 문제가 레이아웃으로 위장되어 있지 않은가
- 캡처만 보고 판단하지 않았는가
- `qa-persona-simulator`를 너무 이른 단계에 올리지 않았는가
- 이 화면의 극적 질문이 하나로 읽히는가
- 주연이 패널 중복 때문에 죽지 않았는가
