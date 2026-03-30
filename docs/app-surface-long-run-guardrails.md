# App Surface Long-Run Guardrails

이 문서는 durable `game phase`가 app-surface를 만질 때 지켜야 하는 금지 규칙이다.

## Primary Rule

한 pass는 플레이어가 실제로 더 잘 판단하거나 더 빨리 행동할 수 있게 만들어야 한다.

렌더 성공이나 분위기 강화만으로는 충분하지 않다.

## Forbidden on Player Surface

다음 문자열이나 개념을 플레이어 표면에 직접 노출하지 않는다.

- `generated`
- `factory`
- `lane`
- `urgency`
- `agent-routing-state`
- runtime/internal contract 설명
- 운영용 backlog, queue, pass, axis, tie 정보

이 정보가 필요하면 spectator artifact 또는 개발자용 비가시 영역에서만 다룬다.

## Required Biases

- 작은 장식 변경보다 행동 흐름 개선을 우선한다.
- 새 패널을 늘리기보다 기존 패널 책임을 명확히 한다.
- 한 pass에서 한 화면 또는 한 흐름을 분명히 좋게 만든다.
- 시작 화면, 전장 허브, 명령 패널 중 어디를 개선하는지 먼저 명시한다.

## Safe Improvement Targets

- 시나리오/세력 선택 진입 강화
- 도시 선택 -> 액션 선택 흐름 단축
- 우측 패널의 액션 우선순위 정리
- 명령 패널의 탭/확정 구조 정리
- 지도 판독성 향상과 선택 상태 강화
- 플레이어 카피를 행동 중심으로 재작성

## Suspicious Changes

다음 변화는 기본적으로 실패 후보로 본다.

- 텍스트 블록이 늘어났는데 CTA는 그대로인 경우
- generated fragment가 더 많은 영역으로 퍼진 경우
- 지도 위 오버레이가 늘어 시야가 더 가려진 경우
- 설명은 늘었는데 클릭 수가 줄지 않은 경우
- 명령 패널에 큰 빈 영역이 남는 경우

## Review Questions

pass를 마치기 전에 아래 질문에 예라고 답할 수 있어야 한다.

1. 플레이어가 이 화면에서 다음 행동을 더 빨리 찾을 수 있는가
2. 첫 프레임의 시선 흐름이 더 단순해졌는가
3. 내부 운영 메타가 플레이어 UI에 새지 않았는가
4. 변화가 하나의 화면 책임을 더 명확히 만들었는가
