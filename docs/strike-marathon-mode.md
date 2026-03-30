# Strike Marathon Mode

`strike-marathon`은 sleep 동안 여러 screen focus를 연속으로 도는 launcher다.

구성:
- `battlefield`
- `command`
- `start`
- 필요하면 다시 `battlefield`

목적:
- 같은 부위만 오래 문지르지 않고 화면 축을 순환한다.
- 각 segment는 내부적으로 `run-strike-run.js`를 사용한다.
- checkpoint feedback는 `strike-run-memory`로 누적된다.

기본 실행:
```bash
cd /Users/pkcmini/wdttgukji
node scripts/orchestrate/run-strike-marathon.js --preset overnight
```

상태 보기:
```bash
cd /Users/pkcmini/wdttgukji
node scripts/orchestrate/monitor-strike-marathon.js
```

세부 상태:
```bash
cd /Users/pkcmini/wdttgukji
node scripts/orchestrate/monitor-strike-run.js
```
