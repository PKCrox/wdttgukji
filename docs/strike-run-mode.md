# Strike Run Mode

`strike run`은 기존 durable long-run과 다른 운영 모드다.

차이:
- durable long-run: pass 단위, gate 단위, 후보 순환형
- strike run: 같은 focus를 한 thread로 계속 밀어붙이는 session형

목표:
- 한 화면 또는 한 product bundle을 60~90분 동안 같은 문맥으로 밀어붙인다.
- 매 pass마다 다시 삼각측량하지 않는다.
- `lead codex`가 구조를 쥐고, 필요하면 `Spark` sidecar를 붙인다.

기본 구조:
- lead owner: `gpt-5.4` 계열
- optional sidecars: `gpt-5.3-codex-spark`
- checkpoint: 20~30분
- verification: checkpoint 뒤에만 공통 체크 실행

핵심 파일:
- launcher: `scripts/orchestrate/run-strike-run.js`
- monitor: `scripts/orchestrate/monitor-strike-run.js`
- config: `scripts/orchestrate/strike-run.config.json`

왜 필요한가:
- 기존 redesign campaign는 구조 교체 지향이어도 여전히 micro-pass loop다.
- 그래서 "세션처럼 쭉 미는 감각"이 약하다.
- strike run은 같은 focus를 유지하고 동일 thread를 resume하므로 그 감각을 최대한 흉내 낸다.

기본 예시:
```bash
cd /Users/pkcmini/wdttgukji
node scripts/orchestrate/run-strike-run.js --focus battlefield --duration-minutes 90
```

Spark 포함:
```bash
cd /Users/pkcmini/wdttgukji
node scripts/orchestrate/run-strike-run.js --focus battlefield --duration-minutes 90
```

Spark 없이 lead만:
```bash
cd /Users/pkcmini/wdttgukji
node scripts/orchestrate/run-strike-run.js --focus battlefield --duration-minutes 90 --without-spark
```

상태 보기:
```bash
cd /Users/pkcmini/wdttgukji
node scripts/orchestrate/monitor-strike-run.js
```

의도적 제한:
- 기존 dirty orchestration 파일은 직접 덮지 않는다.
- strike-run 계열은 새 파일로만 추가해 기존 durable lane과 분리한다.
- Spark는 sidecar ownership이 닫히는 slice에만 붙인다.
