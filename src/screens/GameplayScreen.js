/**
 * GameplayScreen — 게임 루프 오케스트레이터
 * engine/와 Phaser 씬들 사이의 중재자
 *
 * 턴 흐름:
 *   executeTurnEvents() → 플레이어 이벤트 표시 → 플레이어 명령 → AI → endTurn() → 맵 갱신
 */

import { GameState } from '../../engine/core/game-state.js';
import { executeTurnEvents, processPlayerChoice, endTurn, buildTurnSummary } from '../../engine/core/turn-loop.js';
import { decideAndExecute } from '../../engine/ai/faction-ai.js';
import { investTrack, previewInvestment, conscriptTroops, previewConscript, getCityForecast } from '../../engine/core/domestic.js';
import { searchForTalent, offerRecruitment, rewardOfficer, transferOfficer } from '../../engine/core/character-manager.js';
import { resolveEnhancedCombat, chooseFormation } from '../../engine/core/enhanced-combat.js';
import { attemptCapture } from '../../engine/core/character-manager.js';
import { CHAR_NAMES } from '../../engine/data/names.js';
import EventBus, { EVENTS } from '../utils/EventBus.js';

const SAVE_META_KEY = 'wdttgukji_save_meta';

export default class GameplayScreen {
  constructor(scenario, allEvents, playerFactionId) {
    // 시나리오에 playerFaction 설정
    const scenarioClone = structuredClone(scenario);
    scenarioClone.playerFaction = playerFactionId;
    scenarioClone.playerCharacter = scenario.factions[playerFactionId]?.leader;

    this.state = new GameState(scenarioClone);
    this.connections = scenarioClone.connections || [];
    // allEvents는 { events: [...] } 래퍼일 수 있음 → 배열 추출
    this.allEvents = Array.isArray(allEvents) ? allEvents : (allEvents?.events || []);
    this.pendingPlayerEvents = [];
    this.turnSummaryItems = [];

    this.setupEventListeners();
  }

  setupEventListeners() {
    // STATE_CHANGED로 UI에 라이브 데이터 전파 (CITY_SELECTED 재방출하면 무한 루프)
    EventBus.on(EVENTS.STATE_CHANGED, () => {
      // UI 씬들이 registry.get('gameplay').state에서 라이브 데이터 읽음
    });
  }

  // ─── 턴 시작 ───
  startTurn() {
    console.log(`[GamePlay] === 턴 ${this.state.turn} 시작 (${this.state.year}년 ${this.state.month}월) ===`);

    // 1. 이벤트 체크
    this.pendingPlayerEvents = executeTurnEvents(this.state, this.allEvents);

    if (this.pendingPlayerEvents.length > 0) {
      // 플레이어 이벤트가 있으면 UI에 알림
      EventBus.emit(EVENTS.SHOW_EVENT, {
        event: this.pendingPlayerEvents[0],
        remaining: this.pendingPlayerEvents.length - 1,
      });
    }

    // 상태 변경 알림
    this.emitStateChanged();
    return this.pendingPlayerEvents;
  }

  // ─── 플레이어 이벤트 선택 처리 ───
  handleEventChoice(event, choiceId) {
    processPlayerChoice(this.state, event, choiceId);
    this.pendingPlayerEvents.shift();

    if (this.pendingPlayerEvents.length > 0) {
      EventBus.emit(EVENTS.SHOW_EVENT, {
        event: this.pendingPlayerEvents[0],
        remaining: this.pendingPlayerEvents.length - 1,
      });
    }

    this.emitStateChanged();
  }

  // ─── 플레이어 명령 실행 ───
  executeAction(actionType, params) {
    if (this.state.actionsRemaining <= 0) {
      return { success: false, reason: '행동력이 부족합니다' };
    }

    let result;
    switch (actionType) {
      case 'invest':
        result = investTrack(params.cityId, params.track, this.state, params.governorId);
        break;
      case 'conscript':
        result = conscriptTroops(params.cityId, this.state, params.governorId);
        break;
      case 'search_talent':
        result = searchForTalent(params.cityId, params.searcherId, this.state);
        break;
      case 'recruit':
        result = offerRecruitment(params.charId, params.recruiterId, this.state.player.factionId, this.state);
        break;
      case 'reward':
        result = rewardOfficer(this.state, params.charId, params.goldCost);
        break;
      case 'transfer':
        result = transferOfficer(this.state, params.charId, params.toCityId);
        break;
      case 'attack': {
        const from = this.state.getCity(params.fromCityId);
        const to = this.state.getCity(params.toCityId);
        if (!from || !to) { result = { success: false, reason: '도시를 찾을 수 없습니다' }; break; }
        if (from.army < 3000) { result = { success: false, reason: '출진 최소 병력(3000)이 부족합니다' }; break; }

        const attackArmy = Math.floor(from.army * 0.6);
        from.army -= attackArmy;

        const atkGenerals = this.state.getCharactersInCity(params.fromCityId)
          .filter(c => c.faction === this.state.player.factionId)
          .sort((a, b) => (b.stats?.command || 0) - (a.stats?.command || 0));
        const defGenerals = this.state.getCharactersInCity(params.toCityId)
          .filter(c => c.faction === to.owner)
          .sort((a, b) => (b.stats?.command || 0) - (a.stats?.command || 0));

        const terrain = this.state.getConnectionTerrain?.(params.fromCityId, params.toCityId) || 'plains';
        const armyRatio = attackArmy / Math.max(1, to.army);
        const atkFormation = chooseFormation(atkGenerals, terrain, true, armyRatio);
        const defFormation = chooseFormation(defGenerals, terrain, false, 1 / armyRatio);

        const combatResult = resolveEnhancedCombat(
          { army: attackArmy, morale: from.morale, generals: atkGenerals, formation: atkFormation, factionId: this.state.player.factionId },
          { army: to.army, morale: to.morale, defense: to.defense || 50, generals: defGenerals, formation: defFormation, factionId: to.owner },
          { terrain },
          this.state,
        );

        const defenderFaction = to.owner;
        to.army = combatResult.defenderRemaining;
        const survivors = combatResult.attackerRemaining;

        if (combatResult.winner === 'attacker') {
          const captured = attemptCapture(defGenerals.map(g => g.id), this.state.player.factionId, this.state);
          to.owner = this.state.player.factionId;
          to.army = survivors;
          to.morale = Math.max(20, combatResult.attackerMorale);
          result = { success: true, combat: combatResult, captured, fromCity: from.name, toCity: to.name, oldOwner: defenderFaction, defenderFaction };
        } else {
          from.army += survivors;
          result = { success: true, combat: combatResult, captured: [], fromCity: from.name, toCity: to.name, defenderFaction };
        }
        break;
      }
      default:
        result = { success: false, reason: `알 수 없는 명령: ${actionType}` };
    }

    if (result?.success) {
      this.state.actionsRemaining--;
    }

    this.emitStateChanged();
    return result;
  }

  // ─── 턴 종료 ───
  finishTurn() {
    console.log(`[GamePlay] 턴 ${this.state.turn} 종료 — AI 실행 중...`);

    // AI 세력 실행
    const aiFactions = Object.keys(this.state.factions)
      .filter(id => id !== this.state.player.factionId && this.state.factions[id]?.active !== false);

    for (const factionId of aiFactions) {
      try {
        decideAndExecute(factionId, this.state, this.connections);
      } catch (e) {
        console.warn(`[GamePlay] AI 오류 (${factionId}):`, e.message);
      }
    }

    // 결산
    endTurn(this.state);

    // 턴 요약 빌드
    this.turnSummaryItems = buildTurnSummary(this.state);
    console.log(`[GamePlay] 턴 요약: ${this.turnSummaryItems.length}건`);

    // 게임오버 체크
    if (this.state.gameOver) {
      EventBus.emit(EVENTS.GAME_OVER, {
        winner: this.state.winner,
        turn: this.state.turn,
      });
      return { gameOver: true, winner: this.state.winner };
    }

    // 상태 갱신 알림
    this.emitStateChanged();

    return {
      gameOver: false,
      turn: this.state.turn,
      year: this.state.year,
      month: this.state.month,
      summary: this.turnSummaryItems,
    };
  }

  // ─── 프리뷰 (UI용, 상태 변경 없음) ───
  previewInvest(cityId, track) {
    return previewInvestment(cityId, track, this.state);
  }

  previewConscription(cityId) {
    return previewConscript(cityId, this.state);
  }

  getCityForecast(cityId) {
    return getCityForecast(cityId, this.state);
  }

  // ─── 세이브/로드 ───
  save(slotKey = 'autosave') {
    const json = this.state.serialize();
    localStorage.setItem(`wdttgukji_save_${slotKey}`, json);
    localStorage.setItem(SAVE_META_KEY, JSON.stringify({
      slotKey,
      timestamp: Date.now(),
      turn: this.state.turn,
      year: this.state.year,
      month: this.state.month,
      factionId: this.state.player?.factionId || null,
    }));
    console.log(`[GamePlay] 저장 완료: ${slotKey}`);
    return true;
  }

  static load(slotKey = 'autosave', allEvents) {
    const json = localStorage.getItem(`wdttgukji_save_${slotKey}`);
    if (!json) return null;

    const screen = Object.create(GameplayScreen.prototype);
    screen.state = GameState.deserialize(json);
    screen.allEvents = allEvents;
    screen.pendingPlayerEvents = [];
    screen.turnSummaryItems = [];
    screen.setupEventListeners();

    console.log(`[GamePlay] 로드 완료: ${slotKey} (턴 ${screen.state.turn})`);
    return screen;
  }

  static hasSave(slotKey = 'autosave') {
    return !!localStorage.getItem(`wdttgukji_save_${slotKey}`);
  }

  static readSaveMeta(slotKey = 'autosave') {
    try {
      const meta = JSON.parse(localStorage.getItem(SAVE_META_KEY) || 'null');
      if (meta?.slotKey === slotKey) return meta;
    } catch {}

    try {
      const raw = localStorage.getItem(`wdttgukji_save_${slotKey}`);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      return {
        slotKey,
        timestamp: null,
        turn: payload.turn ?? null,
        year: payload.year ?? null,
        month: payload.month ?? null,
        factionId: payload.player?.factionId || null,
      };
    } catch {
      return null;
    }
  }

  // ─── 유틸 ───
  emitStateChanged() {
    EventBus.emit(EVENTS.STATE_CHANGED, { state: this.state });
  }

  get actionsRemaining() {
    return this.state.actionsRemaining;
  }

  get playerFaction() {
    return this.state.player.factionId;
  }

  get turn() {
    return this.state.turn;
  }

  get year() {
    return this.state.year;
  }

  get month() {
    return this.state.month;
  }
}
