// TurnLoop — 턴 실행: 이벤트체크 → 플레이어행동 → AI행동 → 결산

import { checkEvents, applyEffects, isPlayerEvent } from './event-engine.js';
import { settleAllCities } from './domestic.js';
import { checkDefections, updateLoyalty, checkCaptiveEscapes } from './character-manager.js';
import { advanceConstruction } from './buildings.js';
import { advanceResearch } from './tech-tree.js';
import { getCharName } from '../data/names.js';

const MAX_EVENTS_PER_TURN = 3;

export function executeTurnEvents(state, allEvents) {
  state.resetTurnSummary();
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
    state.recordSummary('majorEvents', {
      type: 'event',
      eventId: event.id,
      name: event.name,
      layer: event.layer || 'historical',
    });

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
  state.recordSummary('majorEvents', {
    type: 'event',
    eventId: event.id,
    name: event.name,
    layer: event.layer || 'historical',
    playerChoice: choiceId || null,
  });

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

export function buildTurnSummary(state) {
  const summary = state.turnSummary || {};
  const items = [];

  for (const war of summary.warsStarted || []) {
    items.push({
      phase: '전쟁',
      icon: '⚔️',
      text: `${getFactionName(state, war.fromFaction)}이(가) ${getFactionName(state, war.toFaction)}에 선전포고`,
      type: 'war',
    });
  }

  for (const capture of summary.citiesCaptured || []) {
    items.push({
      phase: '전쟁',
      icon: '🏰',
      text: `${capture.cityName} 함락 — ${getFactionName(state, capture.fromFaction)} → ${getFactionName(state, capture.toFaction)}`,
      type: 'territory',
    });
  }

  for (const building of summary.buildingsCompleted || []) {
    items.push({
      phase: '도시 운영',
      icon: '🔨',
      text: `${building.cityName}: ${building.buildingName} Lv.${building.level} 완공`,
      type: 'construction',
    });
  }

  for (const tech of summary.techCompleted || []) {
    items.push({
      phase: '도시 운영',
      icon: '📚',
      text: `${tech.factionName}: ${tech.techName} 연구 완료`,
      type: 'research',
    });
  }

  for (const rebellion of summary.rebellions || []) {
    items.push({
      phase: '도시 운영',
      icon: '🔥',
      text: `${rebellion.cityName}: ${rebellion.severity === 'major' ? '대규모' : '소규모'} 반란`,
      type: 'rebellion',
    });
  }

  for (const shortage of summary.shortages || []) {
    items.push({
      phase: '도시 운영',
      icon: '⚠️',
      text: `${shortage.cityName}: 식량난으로 탈영 ${shortage.deserters}명`,
      type: 'warning',
    });
  }

  for (const event of summary.majorEvents || []) {
    if (event.type === 'event') {
      items.push({
        phase: '정세',
        icon: '📜',
        text: `중대 이벤트: ${event.name}`,
        type: 'event',
      });
    } else if (event.type === 'alliance') {
      items.push({
        phase: '정세',
        icon: '🤝',
        text: `${getFactionName(state, event.fromFaction)}과 ${getFactionName(state, event.toFaction)}가 동맹`,
        type: 'alliance',
      });
    } else if (event.type === 'peace') {
      items.push({
        phase: '정세',
        icon: '🕊️',
        text: `${getFactionName(state, event.fromFaction)}과 ${getFactionName(state, event.toFaction)}가 강화`,
        type: 'diplomacy',
      });
    } else if (event.type === 'marriage') {
      items.push({
        phase: '정세',
        icon: '💍',
        text: `${getFactionName(state, event.fromFaction)}과 ${getFactionName(state, event.toFaction)}의 혼인동맹`,
        type: 'alliance',
      });
    }
  }

  return items;
}

function getFactionName(state, factionId) {
  return state.factions[factionId]?.name || factionId || '불명';
}
