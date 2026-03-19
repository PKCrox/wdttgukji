# Samgukji Designer

Claude에서 쓰던 `samgukji-designer`의 Codex 호환 버전.

## 현재 역할

기존 단일 설계자 역할을 아래 세 에이전트로 강화했다.

- 총괄 오케스트레이션: [pipeline-architect](/Users/pkc/wdttgukji/ai/agents/pipeline-architect.md)
- 콘텐츠 생산 설계: [content-planner](/Users/pkc/wdttgukji/ai/agents/content-planner.md)
- 밸런스 실험 설계: [balance-researcher](/Users/pkc/wdttgukji/ai/agents/balance-researcher.md)

## 왜 강화했는가

- 이 프로젝트는 "게임 디자인"보다 "게임 생산 공장 설계" 비중이 더 크다.
- 콘텐츠 티어 전략과 밸런스 오토리서치는 설계 원리는 같아도 실행 규칙이 다르다.
- Codex에서 실제 작업할 때는 책임이 잘게 나뉘어 있어야 수정 범위를 통제하기 쉽다.

## 이 이름으로 처리할 작업

- 에이전틱 워크플로우 설계
- 하드코딩 vs AI 경계 설정
- 새 생산 티어, 품질 게이트, 공장 구조 재설계
