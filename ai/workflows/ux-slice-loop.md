# UX Slice Loop

`factory-loop`의 4단계(엔진 통합)와 6단계(플레이 테스트) 사이에서 반복되는 `플레이어 경험 전용 루프`.

목표는 “코드를 조금씩 고치는 것”이 아니라 “기준 viewport에서 플레이어가 한 화면 안에서 게임을 읽을 수 있게 만드는 것”이다.

## 스트림

### A. UX Contract
- 입력: `docs/macbook14-ux-contract.md`
- 출력: 이번 패스에서 건드릴 화면과 금지선

### B. Scene Design
- 담당: `koei-systems-designer`
- 입력: 시작/세력/인트로/전장/작전/결산 장면
- 출력: 무엇을 보여줄지, 무엇을 접을지

### C. UI Integration
- 담당: `engine-integrator`
- 입력: `public/js`, `public/css`, `public/index.html`
- 출력: 실제 동작하는 장면과 상호작용

### D. Fit QA
- 담당: `qa-persona-simulator`
- 입력: `1512x982`, `1280x800`
- 출력: frame fit, first-frame fit, overflow 여부

## 패스 순서

1. 기준 viewport를 고정한다.
2. 첫 프레임에서 꼭 보여야 할 정보만 남긴다.
3. 넘치는 정보는 패널 내부 스크롤이나 접힘으로 보낸다.
4. `qa:slice`와 viewport fit 검사를 같이 통과시킨다.
5. 다음 패스는 “무엇을 더할지”보다 “무엇을 덜 보여줄지”부터 판단한다.

## 체크리스트

- 시작 화면 첫 프레임이 깔끔한가
- 세력 선택이 세로로 넘치지 않는가
- 전장 첫 프레임이 한 화면에 들어오는가
- 사용자가 전체 페이지 스크롤을 시도하게 만들고 있지 않은가
- 지도 퀄리티 문제가 레이아웃으로 위장되어 있지 않은가
