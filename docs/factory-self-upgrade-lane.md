# Factory Self-Upgrade Lane

이 문서는 `wdttgukji` 장기 런이 공장 자체를 자동 개선하도록 돌릴 때의 canonical operator entry를 고정한다.

## 목적

- 채팅으로 pass를 하나씩 지정하지 않아도 factory hook가 backlog를 읽고 우선순위 높은 개선부터 진행한다.
- split durable long-run 안에서 `factory phase`는 오케스트레이션/QA/정책/레지스트리 품질을 계속 개선한다.
- `engine-slice`, `autotest` replay suite와 같은 검증 계층은 long-run 산출물에 바로 반영된다.

## Canonical Entry

```bash
node scripts/orchestrate/run-unified-long-run.js --preset 3h --goal "factory self-upgrade campaign"
```

야간 런:

```bash
node scripts/orchestrate/run-unified-long-run.js --preset overnight --goal "factory self-upgrade campaign"
```

모니터:

```bash
node scripts/orchestrate/monitor-long-run.js
```

## Backlog Source

- canonical backlog: `scripts/orchestrate/factory-upgrade-backlog.json`
- factory hook: `scripts/orchestrate/hooks/run-codex-factory-agent.js`
- hook는 open item 중 priority가 높은 항목부터 prompt에 주입한다.
- open item이 비면 hook는 보수적인 candidate item을 다시 제안해서 lane이 공백으로 멈추지 않게 한다.

## Operator Rule

- app-surface 작업이 목적이면 split durable mode가 아니면 안 된다.
- `run-unified-long-run.js`를 쓰고, 예전 `passes:long-run --include-hybrid` 단독 진입은 기본 경로로 보지 않는다.
- `--print-only` 출력의 `preflight.app_surface_policy`와 phase별 `allow_app_surface`를 먼저 확인한다.
- dirty tracked runtime/policy 파일이 많을 때는 factory가 backlog에서 안전한 owned path를 우선 고른다.
- replay coverage gap을 볼 때는 `node scripts/qa/list-replay-coverage.js`를 먼저 돌린다.

## Replay Coverage Audit

- `scripts/qa/list-replay-coverage.js`는 pass-profile 전체 축과 `run-factory-replay-suite.js`의 replay 배정을 교차해 coverage/gap을 JSON으로 출력한다.
- `node scripts/qa/list-replay-coverage.js --axis theme-independence`로 현재 route에 맞춘 focused audit을 바로 볼 수 있다.
- `--output scripts/orchestrate/generated/theme-independence-replay-coverage.json`를 함께 주면 operator가 나중에 다시 열어볼 수 있는 generated artifact로 남길 수 있다.
- 현재 replay suite가 붙은 축은 `engine-slice`, `autotest`다.
- product-required gap은 `app-surface`, `content-pipeline`, `design-surface`, `theme-independence`다.
- diagnostic-only gap은 `architecture-debt`, `map-art`, `qa-debt`, `ux-first-frame`다.
- 현재 `theme-independence` focused audit은 replay check `0`개인 product-required gap으로 남아 있어 factory-safe verification 확장이 다음 과제다.

## Current Focus

- deterministic event-engine replay 추가 완료
- replay failure diff 리포트 개선 완료
- non-split long-run launch mistake를 줄이는 preflight/launcher 가드 완료
- deterministic turn-loop replay 및 replay digest artifact 완료
- replay coverage audit 명령 추가로 축별 coverage/gap 확인 가능
- 다음 단계는 empty backlog 시 자동 제안되는 conservative candidate item을 따라가면 된다
