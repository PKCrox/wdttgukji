# AGENTS.md

이 저장소의 우선순위는 "삼국지 게임 하나"보다 "세계관 데이터를 넣으면 코에이급 전략 게임이 나오는 공장"을 만드는 것이다. 기능 구현, 데이터 수집, 밸런스 조정 모두 이 관점에서 판단한다.

## 우선 원칙

- 파이프라인 재현성이 개별 산출물보다 중요하다.
- 삼국지 종속 로직은 가능하면 `engine/`가 아니라 테마 데이터 또는 변환 레이어로 밀어낸다.
- 콘텐츠 품질 작업은 근거 추적이 있어야 한다. `source`, `url`, `crawled_at`, 회차/연표 근거를 남긴다.
- 밸런스 조정은 `scripts/balance/program.md`의 목표와 `prepare.js`의 점수 체계를 기준으로 한다.
- 오토리서치 중에는 `scripts/balance/train.js`만 수정하는 것을 기본으로 삼는다. `prepare.js` 수정은 인프라 버그를 고칠 때만 한다.

## 에이전트 맵

Codex가 작업 전 참고해야 할 repo-local 에이전트 명세:

- `ai/agents/pipeline-architect.md`
- `ai/agents/world-data-researcher.md`
- `ai/agents/koei-systems-designer.md`
- `ai/agents/map-art-director.md`
- `ai/agents/ux-stage-director.md`
- `ai/agents/content-planner.md`
- `ai/agents/engine-integrator.md`
- `ai/agents/balance-researcher.md`
- `ai/agents/qa-persona-simulator.md`
- `ai/agents/release-orchestrator.md`
- `ai/agents/samgukji-crawler.md` / `samgukji-designer.md` / `samgukji-historian.md` (`.claude` 시절 이름 호환)

## 작업별 선택 기준

- 크롤링, 데이터 소스 확장, raw/processed 정합성: `world-data-researcher`
- 코에이 레퍼런스, 시스템 설계, 메카닉 비교: `koei-systems-designer`
- 지도 아트, 지형/도시/전선 시각 언어, 베이스맵 구조: `map-art-director`
- 첫 10분 경험, 장면별 정보 위계, first-frame fit 판단: `ux-stage-director`
- soul.md, 이벤트 대량 생성, Tier 전략, 품질 게이트: `content-planner`
- 엔진 구현, UI-엔진 연결, 데이터 스키마를 게임 상태로 연결: `engine-integrator`
- 밸런스 튜닝, 시뮬레이션, score 개선 루프: `balance-researcher`
- 플레이테스트, 이상 게임 탐지, AI 페르소나 검증: `qa-persona-simulator`
- 여러 팀을 엮는 큰 구조 변경, 새 테마 적용, 단계간 계약 정의: `pipeline-architect`
- 패스 목표, 게이트, trace, handoff 정리: `release-orchestrator`

## 워크플로우 문서

- 공장 전체 루프: `ai/workflows/factory-loop.md`
- 멀티에이전트 승격 규칙: `ai/workflows/multi-agent-escalation.md`
- 적응형 n패스 루프: `ai/workflows/n-pass-adaptive-loop.md`
- 밸런스 오토리서치: `ai/workflows/balance-loop.md`
- 테마 일반화: `ai/workflows/theme-generalization.md`
- UX 전용 루프: `ai/workflows/ux-slice-loop.md`
- 게임 철학 계약: `docs/game-philosophy.md`
- durable runtime 운영: `docs/agentic-runtime-2.0.md`
- runtime 환경 변수: `docs/runtime-env.md`

## 계약 문서

- 에이전트 계약: `docs/agent-contracts.md`
- 에이전트 레지스트리: `docs/agent-registry.json`
- 맥북14 UX 기준: `docs/macbook14-ux-contract.md`
- 패스 우선순위 점수표: `docs/pass-priority-rubric.md`

## 현재 저장소 기준 메모

- `ai/`는 Codex용 운영 명세 레이어다. 실제 실행 코드는 `scripts/`, `engine/`, `public/`, `data/` 아래에 있다.
- README에 적힌 `ai/`, `themes/` 구조 중 일부는 아직 진행 중이다. 문서와 실제 구현이 다를 때는 실제 파일을 우선 확인하되, 문서가 의도하는 방향을 훼손하지 말 것.
- 복합 작업은 `single-agent → routed specialist → escalated multi-agent` 순으로 판단한다.
- `1512x982` 기준의 UX fit은 문서가 아니라 게이트다. `qa:macbook14`가 실패하면 레이아웃 승인이 아니다.
- 사용자가 `n패스 돌려`라고 요청한 경우, 각 패스 종료마다 병목을 재판단하고 다음 패스 우선순위를 다시 계산한다. 시작 시 전체 패스를 고정하지 않는다.
- canonical workflow state는 durable runtime에선 Postgres가 맡고, `runs/`는 export artifact로 유지한다.
- mutation policy 기본값은 `product-core`이며 `public/` app surface 자동 변경은 금지한다.
- agent roster는 고정 명단이 아니라 메타 런 종료 시 gap/proposal artifact로 재검토된다.
- agent registry는 메타 런 종료 후 자동 apply 단계로도 진화할 수 있으며, 변경 이력은 `docs/agent-registry-history/`에 남긴다.

## Codex UI Guardrails

`wdttgukji`의 UI/layout/copy/Playwright 작업은 아래 순서를 기본 계약으로 삼는다.

- 작업 시작 전에 repo root를 다시 확인한다. 기준 경로는 `/Users/pkcmini/wdttgukji`다.
- app surface를 만지기 전에 `docs/game-philosophy.md`를 먼저 기준으로 잡는다.
- 기본 시작 명령은 `npm run ui:pass -- --scene start|battlefield|command`다.
- 기본 검증 명령은 `npm run ui:pass:verify`다.
- UI 패스는 먼저 `npm run qa:ui-preflight`로 시작한다.
- 실브라우저 검증이 필요하면 `npm run qa:visible -- --scene start|battlefield|command`로 visible Playwright를 먼저 연다.
- 기본 app surface는 Phaser/Vite(`src/**`, `index.html`)다. legacy DOM surface는 `public/old/**`에만 남긴다.
- legacy 점검이 꼭 필요할 때만 `qa:visible:legacy`, `qa:slice:legacy`, `qa:surface:legacy`, `qa:live-reload:legacy`를 쓴다.
- visible Playwright 세션은 기본적으로 하나만 유지한다. 기존 세션을 갈아끼울 때만 `--replace`를 쓴다.
- app surface 전용 패스의 기본 specialist lead는 `koei-systems-designer`다.
- 실행 셀은 `koei-systems-designer`, `ux-stage-director`, `map-art-director`, `engine-integrator`를 우선한다.
- `content-planner`는 카피 정리용 보조다. 표면 철학의 리드가 아니다.
- `qa-persona-simulator`는 first-frame fit, 맵 가독성, 장면 카피가 안정된 뒤의 플레이감 검증에만 올린다. 레이아웃 핫픽스의 1순위가 아니다.
- 검증 순서는 `visible Playwright → 수정 → visible Playwright 재확인 → qa:slice/watch-app-surface`다.
- 스크린샷과 headless QA는 회귀 증거다. 실브라우저 확인을 대체하지 않는다.
