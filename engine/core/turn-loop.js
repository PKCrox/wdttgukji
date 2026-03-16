// TurnLoop — 턴 실행: 이벤트체크 → 플레이어행동 → AI행동 → 결산

import { checkEvents, applyEffects, isPlayerEvent } from './event-engine.js';
import { settleAllCities } from './domestic.js';
import { checkDefections, updateLoyalty, checkCaptiveEscapes } from './character-manager.js';
import { advanceConstruction } from './buildings.js';
import { advanceResearch } from './tech-tree.js';
import { getCharName } from '../data/names.js';

const MAX_EVENTS_PER_TURN = 3;

export function executeTurnEvents(state, allEvents) {
  const triggered = checkEvents(allEvents, state);
  const playerEvents = [];
  const aiEvents = [];
  let eventCount = 0;

  for (const event of triggered) {
    if (eventCount >= MAX_EVENTS_PER_TURN) break;
    if (isPlayerEvent(event, state)) {
      playerEvents.push(event);
    } else {
      aiEvents.push(event);
    }
    eventCount++;
  }

  // AI 이벤트 자동 처리 (첫 번째 선택지 또는 기본 효과)
  for (const event of aiEvents) {
    state.firedEvents.push(event.id);
    state.log(`[이벤트] ${event.name}`, 'event');

    if (event.effects) {
      applyEffects(event.effects, state);
    }
    if (event.choices && event.choices.length > 0) {
      const choice = event.choices[0];
      applyEffects(choice.effects, state);
      state.log(`→ AI 선택: ${choice.text}`, 'ai_choice');
    }
  }

  return playerEvents;
}

export function processPlayerChoice(state, event, choiceId) {
  state.firedEvents.push(event.id);

  if (event.effects) {
    applyEffects(event.effects, state);
  }

  if (choiceId && event.choices) {
    const choice = event.choices.find(c => c.id === choiceId);
    if (choice) {
      applyEffects(choice.effects, state);
      state.log(`→ 선택: ${choice.text}`, 'player_choice');
    }
  }
}

/**
 * 턴 종료: 결산 + 캐릭터 시스템 + 게임오버 체크
 */
export function endTurn(state) {
  // 1. 자원 결산 (4트랙 기반)
  settleAllCities(state);

  // 2. 충성도 변동
  updateLoyalty(state);

  // 3. 배신 체크
  const defections = checkDefections(state);
  for (const d of defections) {
    state.log(`[배신] ${getCharName(d.charId)}이(가) ${state.factions[d.toFaction]?.name}에 투항`, 'defection');
  }

  // 4. 포로 탈출 체크
  checkCaptiveEscapes(state);

  // 5. 건설 진행
  advanceConstruction(state);

  // 6. 연구 진행
  advanceResearch(state);

  // 7. 휴전 만료
  state.expireTruces();

  // 8. 게임오버 체크
  state.checkGameOver();

  // 9. 턴 진행
  state.advanceMonth();
}
