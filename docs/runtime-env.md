# Runtime Environment

## Required

- `WDTT_RUNTIME_DATABASE_URL`
  - Postgres connection string
- `WDTT_RUNTIME_REDIS_URL`
  - Redis connection string

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

## App Surface Contract

- contract 문서: `docs/app-surface-mutation-contract.md`
- current contract version: `1`
- app-surface task는 metadata에 아래를 포함해야 한다
  - `managedSurfaceAreas`
  - `appSurfaceContractVersion`

## Notes

- 현재 rollout에서는 app surface mutation을 열지 않는다.
- `durable-runner`는 worker를 외부 프로세스로 돌리거나 `--inline-workers N`으로 직접 띄울 수 있다.
