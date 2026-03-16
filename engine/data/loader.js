// DataLoader — JSON 데이터 로드 + GameState 초기화

import { GameState } from '../core/game-state.js';

export async function loadScenario(scenarioPath) {
  const resp = await fetch(scenarioPath);
  if (!resp.ok) throw new Error(`Failed to load scenario: ${resp.status}`);
  return resp.json();
}

export async function loadEvents(eventsPath) {
  const resp = await fetch(eventsPath);
  if (!resp.ok) throw new Error(`Failed to load events: ${resp.status}`);
  const data = await resp.json();
  return data.events || [];
}

export function createGameState(scenario) {
  return new GameState(scenario);
}

// 시나리오 연도 범위에 해당하는 이벤트만 필터 + 중복 제거
export function filterEventsForScenario(events, startYear, endYear = startYear + 30) {
  // 이름 기반 중복 제거 (같은 이름의 이벤트 → 선택지 있는 쪽 우선)
  const byName = new Map();
  for (const ev of events) {
    if (!ev.trigger || !ev.trigger.conditions) continue;

    // period.year 기반 필터 (이벤트 자체 시기)
    if (ev.period?.year) {
      if (ev.period.year < startYear - 2 || ev.period.year > endYear) continue;
    }

    // trigger의 year_range 필터
    const yearCond = ev.trigger.conditions.find(c => c.type === 'year_range');
    if (yearCond && (yearCond.params.max < startYear || yearCond.params.min > endYear)) continue;

    const existing = byName.get(ev.name);
    if (existing) {
      const existingChoices = existing.choices?.length || 0;
      const newChoices = ev.choices?.length || 0;
      if (newChoices > existingChoices) {
        byName.set(ev.name, ev);
      }
    } else {
      byName.set(ev.name, ev);
    }
  }

  return Array.from(byName.values());
}
