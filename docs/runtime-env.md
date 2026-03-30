# Runtime Environment

## Required

- `WDTT_RUNTIME_DATABASE_URL`
  - Postgres connection string
- `WDTT_RUNTIME_REDIS_URL`
  - Redis connection string

런타임은 `dotenv`를 자동 로드하지 않는다. `process.env`를 직접 읽는다.
즉 아래 둘 중 하나로 넣어야 한다.

- 셸에서 `export ...`
- 실행 커맨드 앞에 inline env 지정

## Optional

- `WDTT_RUNTIME_QUEUE`
  - default: `wdtt:tasks:ready`
- `WDTT_RUNTIME_LEASE_SECONDS`
  - default: `120`
- `WDTT_RUNTIME_POLL_MS`
  - default: `1000`
- `WDTT_RUNTIME_DEQUEUE_TIMEOUT_SECONDS`
  - default: `5`
- `WDTT_RUNTIME_MUTATION_MODE`
  - `workflow`, `product-core`, `full`
  - default: `product-core`
- `WDTT_RUNTIME_ALLOW_APP_SURFACE`
  - default: `false`
  - `true`로 열어도 `WDTT_RUNTIME_MUTATION_MODE=full`이 아니면 app-surface task는 차단된다
- `WDTT_CODEX_AGENT_ENABLED`
  - default: `false`
  - `true`면 app-surface game phase에서 local `codex exec` / `codex exec resume`를 사용해 같은 machine-local Codex thread를 이어받는다
- `WDTT_CODEX_FACTORY_ENABLED`
  - default: `false`
  - `true`면 factory phase와 scripted lane edit hook가 local `codex exec` / `codex exec resume`로 공장 자체를 개선한다
- `WDTT_CODEX_MODEL`
  - optional
  - local Codex exec에 넘길 모델 override

## App Surface Contract

- contract 문서: `docs/app-surface-mutation-contract.md`
- current contract version: `2`
- app-surface task는 metadata에 아래를 포함해야 한다
  - `managedSurfaceAreas`
  - `appSurfaceContractVersion`

## Notes

- 기본 rollout에서는 app surface mutation을 닫고, split long-run의 `game phase`에서만 controlled generated surface를 연다.
- `durable-runner`는 worker를 외부 프로세스로 돌리거나 `--inline-workers N`으로 직접 띄울 수 있다.
- `durable-runner`는 `--include-hybrid`를 받거나, `WDTT_RUNTIME_MUTATION_MODE=full` 과 `WDTT_RUNTIME_ALLOW_APP_SURFACE=true`가 모두 켜져 있으면 hybrid `app-surface` lane도 dispatch한다.
- 기본 fallback 이름도 허용한다.
  - DB: `WDTT_RUNTIME_DATABASE_URL` 또는 `DATABASE_URL`
  - Redis: `WDTT_RUNTIME_REDIS_URL` 또는 `REDIS_URL`
- split long-run의 game phase durable 기본 env는 `WDTT_CODEX_AGENT_ENABLED=true`다.
- split long-run의 factory phase durable 기본 env는 `WDTT_CODEX_FACTORY_ENABLED=true`다.
