// GameState — 게임 상태 관리 (JSON 직렬화 가능 = save/load 무료)

export class GameState {
  constructor(scenario) {
    this.turn = 1;
    this.year = scenario.year;
    this.month = scenario.month;
    this.player = {
      factionId: scenario.playerFaction,
      characterId: scenario.playerCharacter
    };
    this.cities = structuredClone(scenario.cities);
    this.factions = structuredClone(scenario.factions);
    this.characters = structuredClone(scenario.characters);
    this.relationships = structuredClone(scenario.relationships);

    // 미소속 인재풀 → characters에 병합
    if (scenario.unaffiliatedPool) {
      for (const [id, char] of Object.entries(scenario.unaffiliatedPool)) {
        this.characters[id] = structuredClone(char);
      }
    }

    // 연결 지형 데이터
    this.connectionTerrains = scenario.connectionTerrains
      ? structuredClone(scenario.connectionTerrains) : {};

    this.firedEvents = [];
    this.turnLog = [];
    this.currentTurnLog = [];
    this.actionsRemaining = 3;
    this.gameOver = false;
    this.winner = null;

    // 외교 기록 (턴별 행동 추적)
    this.diplomacyLog = [];
  }

  // ─── 조회: 기본 ───

  getCity(cityId) {
    return this.cities[cityId] || null;
  }

  getFaction(factionId) {
    return this.factions[factionId] || null;
  }

  getCharacter(charId) {
    return this.characters[charId] || null;
  }

  // ─── 조회: 캐릭터 ───

  /** 도시에 소속된 활성 장수 */
  getCharactersInCity(cityId) {
    return Object.entries(this.characters)
      .filter(([, c]) => c.city === cityId && c.alive && c.status === 'active')
      .map(([id, c]) => ({ id, ...c }));
  }

  /** 세력 소속 활성 장수 */
  getCharactersOfFaction(factionId) {
    return Object.entries(this.characters)
      .filter(([, c]) => c.faction === factionId && c.alive && c.status === 'active')
      .map(([id, c]) => ({ id, ...c }));
  }

  /** 특정 도시 근처의 방랑 인재 */
  getWanderingInCity(cityId) {
    return Object.entries(this.characters)
      .filter(([, c]) => c.city === cityId && c.alive && c.status === 'wandering')
      .map(([id, c]) => ({ id, ...c }));
  }

  /** 세력이 보유한 포로 */
  getCaptivesOfFaction(factionId) {
    return Object.entries(this.characters)
      .filter(([, c]) => c.alive && c.status === 'captive' && c.capturedBy === factionId)
      .map(([id, c]) => ({ id, ...c }));
  }

  /** 특정 도시에 있는 포로 */
  getCaptivesInCity(cityId) {
    return Object.entries(this.characters)
      .filter(([, c]) => c.city === cityId && c.alive && c.status === 'captive')
      .map(([id, c]) => ({ id, ...c }));
  }

  /** 모든 방랑 인재 */
  getAllWandering() {
    return Object.entries(this.characters)
      .filter(([, c]) => c.alive && c.status === 'wandering')
      .map(([id, c]) => ({ id, ...c }));
  }

  // ─── 조회: 도시/세력 ───

  getCitiesOfFaction(factionId) {
    return Object.entries(this.cities)
      .filter(([, c]) => c.owner === factionId)
      .map(([id, c]) => ({ id, ...c }));
  }

  getTotalArmy(factionId) {
    return this.getCitiesOfFaction(factionId)
      .reduce((sum, c) => sum + c.army, 0);
  }

  /** 도시의 종합 내정 수준 (4트랙 평균) */
  getCityEconomy(cityId) {
    const city = this.cities[cityId];
    if (!city) return 0;
    return Math.floor((city.agriculture + city.commerce + city.technology + city.publicOrder) / 4);
  }

  // ─── 조회: 관계/외교 ───

  getRelationship(aId, bId) {
    return this.relationships.find(
      r => (r.a === aId && r.b === bId) || (r.a === bId && r.b === aId)
    );
  }

  isAlive(charId) {
    const c = this.characters[charId];
    return c && c.alive;
  }

  isAtWar(factionA, factionB) {
    const a = this.factions[factionA];
    return a && a.enemies.includes(factionB);
  }

  isAllied(factionA, factionB) {
    const a = this.factions[factionA];
    return a && a.allies.includes(factionB);
  }

  hasTruce(factionA, factionB) {
    const a = this.factions[factionA];
    if (!a || !a.truces) return false;
    const expiry = a.truces[factionB];
    return expiry && expiry > this.turn;
  }

  factionControls(factionId, cityId) {
    const city = this.cities[cityId];
    return city && city.owner === factionId;
  }

  /** 연결의 지형 조회 */
  getConnectionTerrain(cityA, cityB) {
    const key1 = `${cityA}:${cityB}`;
    const key2 = `${cityB}:${cityA}`;
    return this.connectionTerrains[key1] || this.connectionTerrains[key2] || 'plains';
  }

  // ─── 변경: 로그 ───

  log(message, type = 'info') {
    this.currentTurnLog.push({ turn: this.turn, year: this.year, month: this.month, message, type });
  }

  // ─── 변경: 턴 ───

  advanceMonth() {
    this.turnLog.push(...this.currentTurnLog);
    this.currentTurnLog = [];
    this.month++;
    if (this.month > 12) {
      this.month = 1;
      this.year++;
    }
    this.turn++;
    this.actionsRemaining = 3;
  }

  // ─── 변경: 외교 ───

  declareWar(factionA, factionB) {
    const a = this.factions[factionA];
    const b = this.factions[factionB];
    if (!a || !b) return;
    if (!a.enemies.includes(factionB)) a.enemies.push(factionB);
    if (!b.enemies.includes(factionA)) b.enemies.push(factionA);
    // 동맹 해제
    a.allies = a.allies.filter(id => id !== factionB);
    b.allies = b.allies.filter(id => id !== factionA);
    // 휴전 파기
    if (a.truces) delete a.truces[factionB];
    if (b.truces) delete b.truces[factionA];
    // 평판 하락 (휴전 파기 시 추가 하락)
    this._adjustReputation(factionA, -10);
  }

  makePeace(factionA, factionB, truceDuration = 6) {
    const a = this.factions[factionA];
    const b = this.factions[factionB];
    if (!a || !b) return;
    a.enemies = a.enemies.filter(id => id !== factionB);
    b.enemies = b.enemies.filter(id => id !== factionA);
    // 휴전 설정
    if (!a.truces) a.truces = {};
    if (!b.truces) b.truces = {};
    a.truces[factionB] = this.turn + truceDuration;
    b.truces[factionA] = this.turn + truceDuration;
  }

  makeAlliance(factionA, factionB) {
    const a = this.factions[factionA];
    const b = this.factions[factionB];
    if (!a || !b) return;
    if (!a.allies.includes(factionB)) a.allies.push(factionB);
    if (!b.allies.includes(factionA)) b.allies.push(factionA);
    this.makePeace(factionA, factionB, 12);
    this._adjustReputation(factionA, 5);
    this._adjustReputation(factionB, 5);
  }

  breakAlliance(factionA, factionB) {
    const a = this.factions[factionA];
    const b = this.factions[factionB];
    if (!a || !b) return;
    a.allies = a.allies.filter(id => id !== factionB);
    b.allies = b.allies.filter(id => id !== factionA);
    // 동맹 파기는 큰 평판 타격
    this._adjustReputation(factionA, -20);
  }

  _adjustReputation(factionId, delta) {
    const f = this.factions[factionId];
    if (!f) return;
    f.reputation = Math.max(0, Math.min(200, (f.reputation || 100) + delta));
  }

  /** 만료된 휴전 정리 */
  expireTruces() {
    for (const [, faction] of Object.entries(this.factions)) {
      if (!faction.truces) continue;
      for (const [targetId, expiry] of Object.entries(faction.truces)) {
        if (expiry <= this.turn) {
          delete faction.truces[targetId];
        }
      }
    }
  }

  // ─── 변경: 캐릭터 ───

  killCharacter(charId) {
    const c = this.characters[charId];
    if (c) {
      c.alive = false;
      c.status = 'dead';
    }
  }

  moveCharacter(charId, cityId) {
    const c = this.characters[charId];
    if (c) c.city = cityId;
  }

  /** 포로로 잡기 */
  captureCharacter(charId, captorFactionId) {
    const c = this.characters[charId];
    if (!c || !c.alive) return;
    c.status = 'captive';
    c.capturedBy = captorFactionId;
    c.turnsInCaptivity = 0;
  }

  /** 포로를 등용 (세력 합류) */
  recruitCaptive(charId, newFactionId) {
    const c = this.characters[charId];
    if (!c || c.status !== 'captive') return;
    c.status = 'active';
    c.faction = newFactionId;
    c.capturedBy = null;
    c.turnsInCaptivity = 0;
    c.loyalty = 40; // 초기 충성도 낮음
  }

  /** 포로 석방 (방랑자로) */
  releaseCaptive(charId) {
    const c = this.characters[charId];
    if (!c || c.status !== 'captive') return;
    c.status = 'wandering';
    c.faction = null;
    c.capturedBy = null;
    c.turnsInCaptivity = 0;
    c.loyalty = 0;
  }

  /** 방랑 인재를 등용 */
  recruitWandering(charId, factionId, cityId) {
    const c = this.characters[charId];
    if (!c || c.status !== 'wandering') return false;
    c.status = 'active';
    c.faction = factionId;
    c.city = cityId;
    c.loyalty = 50; // 새 등용 기본 충성도
    return true;
  }

  /** 장수 배신 (다른 세력으로) */
  defectCharacter(charId, newFactionId, newCityId) {
    const c = this.characters[charId];
    if (!c || !c.alive) return;
    const oldFaction = c.faction;
    c.faction = newFactionId;
    c.city = newCityId;
    c.status = 'active';
    c.loyalty = 55;
    this.log(`${charId}이(가) ${this.factions[oldFaction]?.name}을 배신하고 ${this.factions[newFactionId]?.name}에 합류!`, 'defection');
  }

  /** 태수 임명 */
  appointGovernor(charId, cityId) {
    const city = this.cities[cityId];
    const char = this.characters[charId];
    if (!city || !char) return false;
    if (char.faction !== city.owner || char.status !== 'active') return false;
    city.governor = charId;
    char.city = cityId;
    return true;
  }

  // ─── 게임오버 체크 ───

  checkGameOver() {
    const activeFactions = Object.entries(this.factions)
      .filter(([id, f]) => f.active && this.getCitiesOfFaction(id).length > 0);

    // 플레이어 세력 멸망
    if (this.getCitiesOfFaction(this.player.factionId).length === 0) {
      this.gameOver = true;
      this.winner = null;
      this.log('당신의 세력이 멸망했습니다.', 'gameover');
      return true;
    }

    // 천하통일
    if (activeFactions.length === 1) {
      this.gameOver = true;
      this.winner = activeFactions[0][0];
      this.log(`${this.factions[this.winner].name}이(가) 천하를 통일했습니다!`, 'gameover');
      return true;
    }

    return false;
  }

  // ─── 직렬화 ───

  serialize() {
    return JSON.stringify({
      turn: this.turn, year: this.year, month: this.month,
      player: this.player,
      cities: this.cities, factions: this.factions,
      characters: this.characters, relationships: this.relationships,
      connectionTerrains: this.connectionTerrains,
      firedEvents: this.firedEvents, turnLog: this.turnLog,
      currentTurnLog: this.currentTurnLog,
      actionsRemaining: this.actionsRemaining,
      gameOver: this.gameOver, winner: this.winner,
      diplomacyLog: this.diplomacyLog
    });
  }

  static deserialize(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const state = Object.create(GameState.prototype);
    Object.assign(state, data);
    // 이전 세이브 호환: 누락 필드 기본값
    if (!state.connectionTerrains) state.connectionTerrains = {};
    if (!state.diplomacyLog) state.diplomacyLog = [];
    for (const [, f] of Object.entries(state.factions)) {
      if (f.reputation == null) f.reputation = 100;
      if (!f.truces) f.truces = {};
    }
    for (const [, c] of Object.entries(state.characters)) {
      if (!c.status) c.status = c.alive ? 'active' : 'dead';
    }
    for (const [, city] of Object.entries(state.cities)) {
      // 이전 economy → 4트랙 변환
      if (city.agriculture == null) {
        const eco = city.economy || 50;
        city.agriculture = eco;
        city.commerce = eco;
        city.technology = Math.max(10, eco - 15);
        city.publicOrder = Math.min(100, eco + 5);
        city.naturalBonus = {};
      }
    }
    return state;
  }
}
