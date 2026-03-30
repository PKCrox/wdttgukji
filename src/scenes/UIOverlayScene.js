import Phaser from 'phaser';
import { COLORS, COLORS_CSS, FONT_STYLES, FONTS, FACTION_COLORS, SIZES, SPACING } from '../utils/Theme.js';
import EventBus, { EVENTS } from '../utils/EventBus.js';
import { CHAR_NAMES } from '../../engine/data/names.js';

/**
 * UI 오버레이 씬 — WorldMapScene 위에 병렬 실행
 * 상단 HUD + 우측 사이드바(도시 상세) + 하단 로그
 */
export default class UIOverlayScene extends Phaser.Scene {
  constructor() {
    super('UIOverlay');
    this.sidebarElements = [];
    this.selectedCityId = null;
  }

  create() {
    const scenario = this.registry.get('scenario');
    const factionId = this.registry.get('selectedFaction') || 'shu';
    if (!scenario) return;

    this.scenario = scenario;
    this.factionId = factionId;
    this.fc = FACTION_COLORS[factionId] || FACTION_COLORS.neutral;

    // GameState에서 라이브 데이터 가져오기
    this.gameplay = this.registry.get('gameplay');
    this.liveState = this.gameplay?.state || null;
    this.faction = this.liveState?.factions?.[factionId] || scenario.factions[factionId];

    this.hudElements = [];
    this.drawHUD();
    this.drawEndTurnButton();
    this.createSidebarContainer();

    // 이벤트 리스너
    EventBus.on(EVENTS.CITY_SELECTED, this.onCitySelected, this);
    EventBus.on(EVENTS.CITY_DESELECTED, this.onCityDeselected, this);
    EventBus.on(EVENTS.STATE_CHANGED, this.refreshAll, this);

    this.events.on('shutdown', () => {
      EventBus.off(EVENTS.CITY_SELECTED, this.onCitySelected, this);
      EventBus.off(EVENTS.CITY_DESELECTED, this.onCityDeselected, this);
      EventBus.off(EVENTS.STATE_CHANGED, this.refreshAll, this);
    });
  }

  // ─── 상단 HUD ───
  drawHUD() {
    const W = 1600;
    const H = SIZES.hudHeight;
    const gs = this.liveState; // GameState (라이브)
    const src = gs || this.scenario; // fallback to static scenario

    // HUD 배경
    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a0f, 0.88);
    bg.fillRect(0, 0, W, H);
    bg.lineStyle(1, this.fc.primary, 0.3);
    bg.lineBetween(0, H, W, H);

    // 세력 문장 + 이름
    const factionObj = src.factions?.[this.factionId] || {};
    this.add.text(16, H / 2, `${factionObj.name || this.factionId}`, {
      fontFamily: FONTS.title, fontSize: '16px', fontStyle: '700', color: this.fc.css,
    }).setOrigin(0, 0.5);

    // 턴/연도
    const year = gs?.year || 208;
    const month = gs?.month || 1;
    const turn = gs?.turn || 1;
    const season = month <= 3 ? '봄' : month <= 6 ? '여름' : month <= 9 ? '가을' : '겨울';
    this.hudTurnText = this.add.text(140, H / 2, `${year}년 ${season} · ${turn}턴`, {
      ...FONT_STYLES.bodyDim, fontSize: '12px',
    }).setOrigin(0, 0.5);
    // hudTurnText와 hudActionsText는 hudElements에 넣지 않음 (refreshHUD에서 in-place 업데이트)

    // 자원 표시 (우측)
    const cities = Object.values(src.cities || {}).filter(c => c.owner === this.factionId);
    const totalArmy = cities.reduce((s, c) => s + (c.army || 0), 0);
    const totalFood = cities.reduce((s, c) => s + (c.food || 0), 0);
    const chars = Object.values(src.characters || {}).filter(c => c.faction === this.factionId && c.alive !== false);

    const resources = [
      { label: '금', value: (factionObj.gold || 0).toLocaleString(), color: COLORS_CSS.accent },
      { label: '식량', value: totalFood.toLocaleString(), color: '#8bc34a' },
      { label: '병력', value: `${(totalArmy / 1000).toFixed(0)}k`, color: '#e57373' },
      { label: '도시', value: `${cities.length}`, color: COLORS_CSS.textBright },
      { label: '장수', value: `${chars.length}`, color: COLORS_CSS.textBright },
    ];

    let rx = W - 20;
    resources.reverse().forEach(r => {
      const valText = this.add.text(rx, H / 2, r.value, {
        fontFamily: FONTS.ui, fontSize: '13px', fontStyle: '700', color: r.color,
      }).setOrigin(1, 0.5);
      this.hudElements.push(valText);
      rx -= valText.width + 4;

      const lblText = this.add.text(rx, H / 2, r.label, {
        fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
      }).setOrigin(1, 0.5);
      this.hudElements.push(lblText);
      rx -= lblText.width + 16;
    });

    // 행동력 표시
    const actions = gs?.actionsRemaining ?? 3;
    this.hudActionsText = this.add.text(310, H / 2, `행동력 ${actions}/3`, {
      fontFamily: FONTS.ui, fontSize: '12px', fontStyle: '600', color: COLORS_CSS.accent,
    }).setOrigin(0, 0.5);
  }

  // ─── 턴 종료 버튼 ───
  drawEndTurnButton() {
    const btnW = 120;
    const btnH = 32;
    const btnX = 1600 / 2 - btnW / 2;
    const btnY = 900 - 44;

    const btnBg = this.add.graphics();
    btnBg.fillStyle(this.fc.primary, 0.75);
    btnBg.fillRoundedRect(btnX, btnY, btnW, btnH, 6);

    const btnLabel = this.add.text(btnX + btnW / 2, btnY + btnH / 2, '턴 종료', {
      fontFamily: FONTS.ui, fontSize: '14px', fontStyle: '700', color: '#000000',
    }).setOrigin(0.5);

    const zone = this.add.zone(btnX + btnW / 2, btnY + btnH / 2, btnW, btnH)
      .setInteractive({ useHandCursor: true });

    zone.on('pointerover', () => {
      btnBg.clear();
      btnBg.fillStyle(this.fc.primary, 1);
      btnBg.fillRoundedRect(btnX, btnY, btnW, btnH, 6);
    });
    zone.on('pointerout', () => {
      btnBg.clear();
      btnBg.fillStyle(this.fc.primary, 0.75);
      btnBg.fillRoundedRect(btnX, btnY, btnW, btnH, 6);
    });
    zone.on('pointerdown', () => this.onEndTurn());
  }

  onEndTurn() {
    if (!this.gameplay) return;

    const result = this.gameplay.finishTurn();
    console.log(`[UIOverlay] 턴 종료 → ${result.gameOver ? 'GAME OVER' : `턴 ${result.turn}`}`);

    if (result.gameOver) {
      // TODO: 게임오버 화면
      return;
    }

    // 다음 턴 시작
    this.gameplay.startTurn();
    this.gameplay.save();

    // 턴 시작 시네마틱 배너
    this.showTurnBanner();

    // HUD 전체 갱신
    this.refreshHUD();
  }

  showTurnBanner() {
    const gs = this.gameplay?.state;
    if (!gs) return;

    const year = gs.year || 208;
    const month = gs.month || 1;
    const turn = gs.turn || 1;
    const season = month <= 3 ? '봄' : month <= 6 ? '여름' : month <= 9 ? '가을' : '겨울';
    const seasonColor = { '봄': '#66bb6a', '여름': '#ffa726', '가을': '#ef5350', '겨울': '#42a5f5' }[season];

    // 반투명 배경 바
    const bannerBg = this.add.graphics();
    bannerBg.fillStyle(0x000000, 0.7);
    bannerBg.fillRect(0, 370, 1600, 160);
    bannerBg.setAlpha(0);

    // 세력 색상 라인
    const line = this.add.graphics();
    line.fillStyle(this.fc.primary, 0.6);
    line.fillRect(0, 370, 1600, 3);
    line.fillRect(0, 527, 1600, 3);
    line.setAlpha(0);

    // 턴 번호
    const turnText = this.add.text(800, 420, `제 ${turn} 턴`, {
      fontFamily: FONTS.title, fontSize: '36px', fontStyle: '700', color: '#ffffff',
    }).setOrigin(0.5).setAlpha(0);

    // 연도 + 계절
    const dateText = this.add.text(800, 470, `${year}년 ${month}월 · ${season}`, {
      fontFamily: FONTS.ui, fontSize: '18px', fontStyle: '600', color: seasonColor,
    }).setOrigin(0.5).setAlpha(0);

    // 세력명
    const factionName = gs.factions?.[this.factionId]?.name || '';
    const factionText = this.add.text(800, 500, factionName, {
      fontFamily: FONTS.ui, fontSize: '13px', color: this.fc.css,
    }).setOrigin(0.5).setAlpha(0);

    const all = [bannerBg, line, turnText, dateText, factionText];

    // 페이드인
    this.tweens.add({
      targets: all, alpha: 1, duration: 300, ease: 'Sine.easeOut',
      onComplete: () => {
        // 1.2초 유지 후 페이드아웃
        this.time.delayedCall(1200, () => {
          this.tweens.add({
            targets: all, alpha: 0, duration: 400, ease: 'Sine.easeIn',
            onComplete: () => all.forEach(e => e.destroy()),
          });
        });
      },
    });
  }

  // ─── 사이드바 컨테이너 ───
  createSidebarContainer() {
    const SW = SIZES.sidebarWidth;
    const SX = 1600 - SW;
    const SY = SIZES.hudHeight + 8;

    // 사이드바 배경 (처음에는 숨김)
    this.sidebarBg = this.add.graphics();
    this.sidebarBg.setVisible(false);

    this.sidebarX = SX;
    this.sidebarY = SY;
    this.sidebarW = SW;
  }

  // ─── 도시 선택 시 ───
  onCitySelected({ cityId, city }) {
    this.selectedCityId = cityId;
    // 라이브 GameState 데이터 우선 사용
    const liveCity = this.liveState?.cities?.[cityId] || city;
    this.showSidebar(cityId, liveCity);
  }

  onCityDeselected() {
    this.selectedCityId = null;
    this.hideSidebar();
  }

  showSidebar(cityId, city) {
    this.clearSidebar();

    const x = this.sidebarX;
    const y = this.sidebarY;
    const w = this.sidebarW;
    const h = 900 - y - 8;
    const fc = FACTION_COLORS[city.owner] || FACTION_COLORS.neutral;
    const pad = SPACING.lg;

    // 배경
    this.sidebarBg.setVisible(true);
    this.sidebarBg.clear();
    this.sidebarBg.fillStyle(0x0a0a0f, 0.92);
    this.sidebarBg.fillRoundedRect(x, y, w, h, 8);
    this.sidebarBg.lineStyle(1, fc.primary, 0.3);
    this.sidebarBg.strokeRoundedRect(x, y, w, h, 8);

    let cy = y + pad;
    const cx = x + pad;
    const cw = w - pad * 2;

    // 도시명 + 세력
    const factionName = this.scenario.factions[city.owner]?.name || city.owner;
    this.sidebarAdd(this.add.text(cx, cy, city.name, {
      fontFamily: FONTS.title, fontSize: '20px', fontStyle: '700', color: fc.css,
    }));
    cy += 28;

    this.sidebarAdd(this.add.text(cx, cy, factionName, {
      ...FONT_STYLES.bodyDim, fontSize: '11px',
    }));

    // 태수
    const governor = city.governor ? this.scenario.characters[city.governor] : null;
    if (governor) {
      this.sidebarAdd(this.add.text(cx + cw, cy, `태수: ${this.charName(city.governor)}`, {
        ...FONT_STYLES.bodyDim, fontSize: '11px',
      }).setOrigin(1, 0));
    }
    cy += 24;

    // 구분선
    this.sidebarLine(x + pad, cy, cw, fc.primary);
    cy += 10;

    // ── 핵심 스탯 (2열 그리드) ──
    const stats = [
      { label: '병력', value: (city.army || 0).toLocaleString(), color: '#e57373' },
      { label: '사기', value: `${city.morale || 0}`, color: this.moraleColor(city.morale) },
      { label: '인구', value: (city.population || 0).toLocaleString(), color: COLORS_CSS.textBright },
      { label: '방어', value: `${city.defense || 0}`, color: '#90caf9' },
      { label: '식량', value: (city.food || 0).toLocaleString(), color: '#8bc34a' },
      { label: '장수', value: `${this.getGarrisonCount(cityId)}명`, color: COLORS_CSS.textBright },
    ];

    const colW = cw / 2;
    stats.forEach((s, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const sx = cx + col * colW;
      const sy = cy + row * 26;

      this.sidebarAdd(this.add.text(sx, sy, s.label, {
        fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
      }));
      this.sidebarAdd(this.add.text(sx + 36, sy, s.value, {
        fontFamily: FONTS.ui, fontSize: '13px', fontStyle: '700', color: s.color,
      }));
    });
    cy += Math.ceil(stats.length / 2) * 26 + 8;

    // ── 4트랙 (농업/상업/기술/치안) ──
    this.sidebarLine(x + pad, cy, cw, fc.primary);
    cy += 10;

    const tracks = [
      { key: 'agriculture', label: '농업', color: 0x8bc34a },
      { key: 'commerce', label: '상업', color: 0xffc107 },
      { key: 'technology', label: '기술', color: 0x42a5f5 },
      { key: 'publicOrder', label: '치안', color: 0xab47bc },
    ];

    tracks.forEach(t => {
      const val = city[t.key] || 0;
      const bonus = city.naturalBonus?.[t.key] || 0;

      this.sidebarAdd(this.add.text(cx, cy, t.label, {
        fontFamily: FONTS.ui, fontSize: '11px', color: COLORS_CSS.textDim,
      }));
      this.sidebarAdd(this.add.text(cx + 34, cy, `${val}`, {
        fontFamily: FONTS.ui, fontSize: '12px', fontStyle: '700', color: COLORS_CSS.textBright,
      }));

      // 프로그레스 바
      const barX = cx + 60;
      const barW = cw - 60;
      const barH = 6;
      const barGfx = this.add.graphics();
      barGfx.fillStyle(0x1a1a28, 0.8);
      barGfx.fillRoundedRect(barX, cy + 3, barW, barH, 3);
      barGfx.fillStyle(t.color, 0.7);
      barGfx.fillRoundedRect(barX, cy + 3, barW * (val / 100), barH, 3);
      this.sidebarAdd(barGfx);

      if (bonus > 0) {
        this.sidebarAdd(this.add.text(cx + cw, cy, `+${bonus}`, {
          fontFamily: FONTS.ui, fontSize: '9px', color: '#66bb6a',
        }).setOrigin(1, 0));
      }

      cy += 22;
    });

    // ── 주둔 장수 목록 ──
    cy += 4;
    this.sidebarLine(x + pad, cy, cw, fc.primary);
    cy += 10;

    this.sidebarAdd(this.add.text(cx, cy, '주둔 장수', {
      fontFamily: FONTS.ui, fontSize: '11px', fontStyle: '600', color: COLORS_CSS.textDim,
    }));
    cy += 18;

    const garrison = this.getGarrison(cityId);
    const maxShow = 6;
    garrison.slice(0, maxShow).forEach(char => {
      const isLeader = this.scenario.factions[city.owner]?.leader === char.id;
      const isGovernor = city.governor === char.id;
      const s = char.stats || {};
      const total = (s.command || 0) + (s.war || 0) + (s.intellect || 0) + (s.politics || 0) + (s.charisma || 0);

      // 이름 + 역할
      const role = isLeader ? '군주' : isGovernor ? '태수' : '';
      const name = this.charName(char.id);
      const nameStr = role ? `${name} [${role}]` : name;
      this.sidebarAdd(this.add.text(cx, cy, nameStr, {
        fontFamily: FONTS.ui, fontSize: '11px', fontStyle: '600',
        color: isLeader ? COLORS_CSS.accent : COLORS_CSS.text,
      }));

      // 스탯 요약
      this.sidebarAdd(this.add.text(cx + cw, cy, `통${s.command || 0} 무${s.war || 0} 지${s.intellect || 0} (${total})`, {
        fontFamily: FONTS.ui, fontSize: '9px', color: COLORS_CSS.textDim,
      }).setOrigin(1, 0));

      // 충성도 바
      const loyW = 40;
      const loyGfx = this.add.graphics();
      loyGfx.fillStyle(0x1a1a28, 0.6);
      loyGfx.fillRect(cx, cy + 15, loyW, 3);
      const loy = Math.round(char.loyalty || 0);
      loyGfx.fillStyle(loy >= 80 ? 0x4caf50 : loy >= 50 ? 0xff9800 : 0xf44336, 0.8);
      loyGfx.fillRect(cx, cy + 15, loyW * (loy / 100), 3);
      this.sidebarAdd(loyGfx);

      this.sidebarAdd(this.add.text(cx + loyW + 4, cy + 12, `충${loy}`, {
        fontFamily: FONTS.ui, fontSize: '8px', color: COLORS_CSS.textDim,
      }));

      cy += 24;
    });

    if (garrison.length > maxShow) {
      this.sidebarAdd(this.add.text(cx, cy, `... 외 ${garrison.length - maxShow}명`, {
        ...FONT_STYLES.bodyDim, fontSize: '10px',
      }));
      cy += 18;
    }

    // ── 명령 버튼 ──
    cy = 900 - 60;
    const btnW = cw;
    const btnH = 36;
    const btnBg = this.add.graphics();
    btnBg.fillStyle(fc.primary, 0.85);
    btnBg.fillRoundedRect(cx, cy, btnW, btnH, 6);
    this.sidebarAdd(btnBg);

    this.sidebarAdd(this.add.text(cx + btnW / 2, cy + btnH / 2, '명령 열기', {
      fontFamily: FONTS.ui, fontSize: '14px', fontStyle: '700', color: '#000000',
    }).setOrigin(0.5));

    const btnZone = this.add.zone(cx + btnW / 2, cy + btnH / 2, btnW, btnH)
      .setInteractive({ useHandCursor: true });
    this.sidebarAdd(btnZone);

    btnZone.on('pointerdown', () => {
      EventBus.emit(EVENTS.OPEN_ACTION_PANEL, { cityId, city });
    });
    btnZone.on('pointerover', () => {
      btnBg.clear();
      btnBg.fillStyle(fc.primary, 1);
      btnBg.fillRoundedRect(cx, cy, btnW, btnH, 6);
    });
    btnZone.on('pointerout', () => {
      btnBg.clear();
      btnBg.fillStyle(fc.primary, 0.85);
      btnBg.fillRoundedRect(cx, cy, btnW, btnH, 6);
    });

    // ESC로 사이드바 닫기
    this.input.keyboard.once('keydown-ESC', () => {
      this.hideSidebar();
      EventBus.emit(EVENTS.CITY_DESELECTED);
    });
  }

  hideSidebar() {
    this.clearSidebar();
    this.sidebarBg.setVisible(false);
    this.selectedCityId = null;
  }

  clearSidebar() {
    this.sidebarElements.forEach(el => el.destroy());
    this.sidebarElements = [];
  }

  sidebarAdd(element) {
    this.sidebarElements.push(element);
    return element;
  }

  sidebarLine(x, y, w, color) {
    const gfx = this.add.graphics();
    gfx.lineStyle(1, color, 0.15);
    gfx.lineBetween(x, y, x + w, y);
    this.sidebarAdd(gfx);
  }

  // ─── 헬퍼 ───
  getGarrison(cityId) {
    const chars = this.liveState?.characters || this.scenario.characters;
    return Object.entries(chars)
      .filter(([, c]) => c.city === cityId && c.faction && c.alive !== false && c.status !== 'dead')
      .map(([id, c]) => ({ id, ...c }))
      .sort((a, b) => {
        const sa = a.stats || {};
        const sb = b.stats || {};
        const ta = (sa.command || 0) + (sa.war || 0) + (sa.intellect || 0) + (sa.politics || 0) + (sa.charisma || 0);
        const tb = (sb.command || 0) + (sb.war || 0) + (sb.intellect || 0) + (sb.politics || 0) + (sb.charisma || 0);
        return tb - ta;
      });
  }

  getGarrisonCount(cityId) {
    const chars = this.liveState?.characters || this.scenario.characters;
    return Object.values(chars)
      .filter(c => c.city === cityId && c.faction && c.alive !== false && c.status !== 'dead')
      .length;
  }

  charName(charId) {
    return CHAR_NAMES[charId] || charId;
  }

  moraleColor(morale) {
    if (morale >= 80) return '#4caf50';
    if (morale >= 60) return '#ffc107';
    if (morale >= 40) return '#ff9800';
    return '#f44336';
  }

  refreshAll({ state } = {}) {
    if (state) this.liveState = state;
    this.gameplay = this.registry.get('gameplay');
    if (this.gameplay) this.liveState = this.gameplay.state;
    this.faction = this.liveState?.factions?.[this.factionId] || this.scenario.factions[this.factionId];
    this.refreshHUD();

    // 사이드바도 갱신 (선택된 도시가 있으면)
    if (this.selectedCityId && this.liveState) {
      const liveCity = this.liveState.cities?.[this.selectedCityId];
      if (liveCity) this.showSidebar(this.selectedCityId, liveCity);
    }
  }

  refreshHUD() {
    // 동적 HUD 요소 전부 파괴 후 재생성
    this.hudElements.forEach(el => el.destroy());
    this.hudElements = [];
    const gs = this.liveState;
    if (!gs) return;

    const H = SIZES.hudHeight;
    const W = 1600;
    const year = gs.year || 208;
    const month = gs.month || 1;
    const turn = gs.turn || 1;
    const season = month <= 3 ? '봄' : month <= 6 ? '여름' : month <= 9 ? '가을' : '겨울';

    if (this.hudTurnText) this.hudTurnText.setText(`${year}년 ${season} · ${turn}턴`);

    const actions = gs.actionsRemaining ?? 0;
    if (this.hudActionsText) {
      this.hudActionsText.setText(`행동력 ${actions}/3`);
      this.hudActionsText.setColor(actions > 0 ? COLORS_CSS.accent : '#f44336');
    }

    // 자원 텍스트 갱신
    const factionObj = gs.factions?.[this.factionId] || {};
    const cities = Object.values(gs.cities || {}).filter(c => c.owner === this.factionId);
    const totalArmy = cities.reduce((s, c) => s + (c.army || 0), 0);
    const totalFood = cities.reduce((s, c) => s + (c.food || 0), 0);
    const chars = Object.values(gs.characters || {}).filter(c => c.faction === this.factionId && c.alive !== false);

    const resources = [
      { label: '금', value: (factionObj.gold || 0).toLocaleString(), color: COLORS_CSS.accent },
      { label: '식량', value: totalFood.toLocaleString(), color: '#8bc34a' },
      { label: '병력', value: `${(totalArmy / 1000).toFixed(0)}k`, color: '#e57373' },
      { label: '도시', value: `${cities.length}`, color: COLORS_CSS.textBright },
      { label: '장수', value: `${chars.length}`, color: COLORS_CSS.textBright },
    ];

    let rx = W - 20;
    resources.reverse().forEach(r => {
      const valText = this.add.text(rx, H / 2, r.value, {
        fontFamily: FONTS.ui, fontSize: '13px', fontStyle: '700', color: r.color,
      }).setOrigin(1, 0.5);
      this.hudElements.push(valText);
      rx -= valText.width + 4;

      const lblText = this.add.text(rx, H / 2, r.label, {
        fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
      }).setOrigin(1, 0.5);
      this.hudElements.push(lblText);
      rx -= lblText.width + 16;
    });
  }
}
