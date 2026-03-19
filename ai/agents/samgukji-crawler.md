# Samgukji Crawler

Claude에서 쓰던 `samgukji-crawler`의 Codex 호환 버전.

## 현재 역할

이 역할은 단일 크롤러가 아니라 아래 두 에이전트로 분해해 운용한다.

- 주 역할: [world-data-researcher](/Users/pkc/wdttgukji/ai/agents/world-data-researcher.md)
- 보조 역할: [content-planner](/Users/pkc/wdttgukji/ai/agents/content-planner.md)

## 왜 분해했는가

- 크롤링과 콘텐츠 기획은 다른 품질 게이트를 가진다.
- raw 수집 품질과 soul/event 생산 품질을 한 파일에 섞으면 책임이 흐려진다.
- 새 테마 적용 시 크롤 프레임워크는 재사용하고, 콘텐츠 정책만 바꿔야 하기 때문이다.

## 이 이름으로 처리할 작업

- 새 데이터 소스 추가
- `scripts/crawl/` 또는 `data/raw/` 점검
- `raw → processed` 변환 입력 누락 탐지
