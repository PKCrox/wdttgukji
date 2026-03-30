# Hybrid Turn Director Contract

`wdttgukji`는 게임 진행 전체를 LLM에게 넘기지 않는다.

원칙:
- 전투 판정, 수치 계산, 세이브/로드, 턴 진행, 이벤트 효과 적용은 코드가 소유한다.
- LLM 또는 director provider는 `무엇을 먼저 보여줄지`, `왜 지금 이 선택이 중요한지`, `어떤 선택지를 권고할지`를 만든다.
- provider가 실패하거나 응답이 없어도 게임은 heuristic fallback으로 그대로 진행된다.

현재 연결점:
- 전장 브리프: [`public/js/turn-director.js`](/Users/pkcmini/wdttgukji/public/js/turn-director.js)
- command sheet: [`public/js/action-panel.js`](/Users/pkcmini/wdttgukji/public/js/action-panel.js)
- 이벤트 모달: [`public/js/event-ui.js`](/Users/pkcmini/wdttgukji/public/js/event-ui.js)
- 턴 결산: [`public/js/turn-resolution.js`](/Users/pkcmini/wdttgukji/public/js/turn-resolution.js)

브라우저 주입 인터페이스:
- `window.__wdttgukji.registerTurnDirectorProvider(provider, { mode })`
- `window.__wdttgukji.clearTurnDirectorProvider()`

provider 시그니처:
```js
(kind, payload) => {
  if (kind === 'battlefield') return { title, objective, action, focus, risk, scene, whyNow, tags };
  if (kind === 'command') return { headline, subhead, status };
  if (kind === 'faction') return { headline, body, tags, directive };
  if (kind === 'event') return { kicker, headline, summary, flavor, stakes, recommendedChoiceId, choices };
  if (kind === 'resolution') return { kicker, headline, body };
  return null;
}
```

이 구조의 의미:
- 코어 규칙은 deterministic하게 유지된다.
- LLM은 게임을 "연출하고 안내하는 director"로 붙는다.
- 나중에 실제 모델 호출을 붙여도 UI 소비자 코드는 갈아엎을 필요가 없다.
