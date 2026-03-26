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
# 기대값: bad53c8
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
- 최근 장기 런: [`long-run-20260324-235741`](/Users/pkc/wdttgukji/runs/long-runs/long-run-20260324-235741)

## 8. 주의

- `public/`와 orchestration 변경이 큰 커밋으로 이미 들어가 있으니, 새 작업은 작은 브랜치로 나누는 편이 안전하다.
- `runs/` 아래 산출물은 로컬 상태에 따라 달라질 수 있다.
- preview 배포는 필요할 때만 하고, 파일 수가 많으면 `--archive=tgz`를 사용한다.
