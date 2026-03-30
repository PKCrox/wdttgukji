# Mac Mini Handoff

이 문서는 다른 맥에서 `wdttgukji` 작업을 바로 이어받기 위한 최소 체크리스트다.

## 1. 코드 받기

```bash
git clone https://github.com/PKCrox/wdttgukji.git
cd wdttgukji
git checkout main
git pull origin main
```

현재 기준 커밋:

```bash
git rev-parse --short HEAD
# 기대값: b0213da 이상
```

## 2. 런타임 준비

필수:

- Node.js 18+
- npm

권장:

```bash
npx playwright install
```

## 3. 의존성 설치

```bash
npm install
```

## 4. 가장 먼저 확인할 것

게임 로컬 실행:

```bash
npm run dev
```

기본 QA:

```bash
npm run qa:slice
npm run passes:dry -- --passes 1 --profile wdttgukji-product-core
```

## 5. 장기 런 관련

split long-run 기준:

```bash
npm run passes:long-run -- --duration-hours 8 --split-factory-game --batch-iterations 3 --passes 10
```

설명:

- 앞 4시간: `factory`
- 뒤 4시간: `game`
- 기본 경로: `durable runtime`
- game phase는 `full + app-surface` 정책으로 실제 UI mutation lane까지 포함

## 6. durable runtime

이 기능은 추가 환경변수가 있어야 한다.

```bash
export WDTT_RUNTIME_DATABASE_URL=...
export WDTT_RUNTIME_REDIS_URL=...
```

준비 후:

```bash
npm run passes:runtime:migrate
npm run passes:runtime:health
```

## 7. 주요 문서

- 런타임 개요: [`agentic-runtime-2.0.md`](/Users/pkc/wdttgukji/docs/agentic-runtime-2.0.md)
- 에이전트 레지스트리: [`agent-registry-summary.md`](/Users/pkc/wdttgukji/docs/agent-registry-summary.md)
- 앱 표면 변경 계약: [`app-surface-mutation-contract.md`](/Users/pkc/wdttgukji/docs/app-surface-mutation-contract.md)
- 장기 런 요약: [`long-run-verification.md`](/Users/pkc/wdttgukji/docs/long-run-verification.md)

## 8. 주의

- `public/`와 orchestration 변경이 큰 커밋으로 이미 들어가 있으니, 새 작업은 작은 브랜치로 나누는 편이 안전하다.
- `runs/` 아래 산출물은 로컬 상태에 따라 달라지고, 일반 clone에는 없을 수 있다.
- 따라서 “146 batch long-run 완료” 같은 주장 검증은 `runs/`가 아니라 [`long-run-verification.md`](/Users/pkc/wdttgukji/docs/long-run-verification.md)를 기준으로 본다.
- preview 배포는 필요할 때만 하고, 파일 수가 많으면 `--archive=tgz`를 사용한다.

## 9. Current Checkpoint

2026-03-27 Mac mini 기준 최신 체크포인트:

- local durable runtime 준비 완료
  - Postgres 로컬 DB: `wdttgukji_runtime`
  - Redis 로컬 실행
  - `~/.zshrc`에 `WDTT_RUNTIME_DATABASE_URL`, `WDTT_RUNTIME_REDIS_URL` 설정됨
- split long-run 기본 경로는 `durable runtime + logged-in codex exec`
- Codex 기본 모델은 `gpt-5.4`
- factory phase는 `WDTT_CODEX_FACTORY_ENABLED=true`
- game phase는 `WDTT_CODEX_AGENT_ENABLED=true`
- Codex hook는 pass별 usage를 아래에 남긴다
  - factory: `runs/durable-runtime/<run-id>/codex-factory/pass-XXX-usage.json`
  - game: `runs/durable-runtime/<run-id>/codex/pass-XXX-usage.json`
- long-run monitor 명령:

```bash
cd /Users/pkcmini/wdttgukji
npm run passes:monitor -- --run-id <long-run-id> --interval-ms 5000
```

- 6시간 재시작 런:
  - long run id: `long-run-20260327-044050`
  - monitor 대상 경로: `runs/long-runs/long-run-20260327-044050`
- 최근 수정된 런타임 이슈:
  - `durable-runner.js`의 `readJsonOrDefault` 누락으로 factory 후반 배치가 `failed_without_json_summary`로 깨지던 문제 수정
  - monitor가 `batch / latest pass`를 같이 보여주도록 추가
  - Codex usage jsonl/json 아티팩트 저장 추가

- 현재 실행/모니터 재시작 예시:

```bash
cd /Users/pkcmini/wdttgukji
source ~/.zshrc
export WDTT_CODEX_MODEL=gpt-5.4
npm run passes:long-run -- \
  --split-factory-game \
  --factory-hours 3 \
  --game-hours 3 \
  --factory-profile wdttgukji-diagnostic \
  --game-profile wdttgukji-product-core \
  --factory-batch-iterations 3 \
  --game-batch-iterations 3 \
  --factory-passes 10 \
  --game-passes 10 \
  --review-interval 5 \
  --inline-workers 4 \
  --goal "6h overnight durable split long run"
```

추가 최신 상태:

- `6h overnight durable split long run` 완주
  - long run id: `long-run-20260327-044050`
  - status: `completed`
  - completed batches: `78`
  - factory 3시간 + game 3시간 구조 그대로 끝까지 완료
- game phase에서 `app-surface-evolution` 반복 선택 확인
  - 예: `durable-run-20260327-102735-d96a09c0`, `durable-run-20260327-103024-424deee7`, `durable-run-20260327-103607-4ebf6dee`, `durable-run-20260327-103908-8d7dbdc3`
- 다만 game phase app-surface 패스는 inner Codex hook가 자기 안에서 `qa:slice`를 다시 돌리다 sandbox `listen EPERM`로 실패 처리되던 문제가 있었고, 이후 prompt를 바꿔 inner hook는 `node --check` 중심으로 닫도록 수정
- app-surface lane은 이제 작은 polish 전용이 아니라 `bounded feature-sized lane`으로 승격됨
  - 지도 상호작용, selection/command flow, war-room rail, tactical overlay, keyboard control 같은 한 pass 안의 coherent feature 허용
- usage 로깅은 누적값 단순 합산이 아니라 `delta_*` 기준으로 보도록 수정
  - `delta_input_tokens`
  - `delta_output_tokens`
  - `delta_total_tokens`
- monitor는 아직 거칠지만 `latest pass`와 `delta token`을 보여주도록 보강됨
- `3h game-only durable run` 테스트 런도 한 번 올렸으나, 사용자 요청으로 중단
  - long run id: `long-run-20260327-170435`
  - 현재 `long-runner.js`, `durable-runner.js`, `monitor-long-run.js` 관련 프로세스는 모두 종료된 상태

다음에 바로 이어볼 추천 순서:

```bash
cd /Users/pkcmini/wdttgukji
source ~/.zshrc
export WDTT_CODEX_MODEL=gpt-5.4
npm run passes:long-run -- \
  --duration-hours 3 \
  --profile wdttgukji-product-core \
  --passes 10 \
  --batch-iterations 3 \
  --review-interval 5 \
  --inline-workers 4 \
  --runtime-mode durable \
  --include-hybrid \
  --goal "3h game-only durable run"
```

실시간 추적:

```bash
cd /Users/pkcmini/wdttgukji
npm run passes:monitor -- --run-id <long-run-id> --interval-ms 5000
```
