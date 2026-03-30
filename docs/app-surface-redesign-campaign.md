# App Surface Redesign Campaign

이 모드는 `작은 polish 누적`이 아니라 `화면 교체`를 목표로 한다.

원칙
- app-surface pass는 한 번에 한 화면만 맡는다.
- 같은 화면을 두 번 연속 만졌는데 전역 구조가 안 바뀌면 다음 pass는 variant 또는 replacement로 강제 전환한다.
- 현재 구성이 답이 아니라고 판단되면 레이아웃 계약 자체를 버리고 다시 짜도 된다.
- 승리 조건은 `플레이어가 더 빨리 읽고 더 빨리 행동하는가`다.

캠페인 화면
- `battlefield-hub-reset`
- `command-sheet-reset`
- `start-screen-reset`

운영 규칙
- 후보안은 `A/B/C` variant로 돌린다.
- focus가 바뀌거나 stagnation guard가 발동하면 app-surface Codex thread를 새로 시작한다.
- 같은 thread에서 같은 surface를 계속 미세수정하지 않는다.

패스 평가
- battlefield: 선택 도시와 다음 행동이 같은 시선 덩어리 안에 있는가
- command: 첫 행동 후보가 즉시 보이는가
- start: 시나리오/세력/첫 턴 약속이 선명한가

실패 패턴
- overlay를 더 얹어서 해결하려는 시도
- 기존 셸을 유지하려고 빈 공간만 재배치하는 시도
- generated/factory meta가 플레이어 표면에 다시 새는 시도
