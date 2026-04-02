import Phaser from 'phaser';
import { COLORS, COLORS_CSS, FONT_STYLES, FONTS, FACTION_COLORS, SIZES, SPACING, HUD_STYLE } from '../utils/Theme.js';
import EventBus, { EVENTS } from '../utils/EventBus.js';
import { ensureStrategyMapOverlay } from '../utils/StrategyMapOverlay.js';
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
    this.sidebarSuppressed = false;
    this.mapContext = { zoomTier: 'frontline', selectedCityId: null, connectedIds: [] };
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
    this.strategyMapOverlay = ensureStrategyMapOverlay();
    this.strategyMapOverlay.close();

    this.hudElements = [];
    this.drawHUD();
    this.drawStrategyMapButton();
    this.drawEndTurnButton();
    this.createSidebarContainer();

    // 이벤트 리스너
    EventBus.on(EVENTS.CITY_SELECTED, this.onCitySelected, this);
    EventBus.on(EVENTS.CITY_DESELECTED, this.onCityDeselected, this);
    EventBus.on(EVENTS.OPEN_ACTION_PANEL, this.onActionPanelOpened, this);
    EventBus.on(EVENTS.CLOSE_ACTION_PANEL, this.onActionPanelClosed, this);
    EventBus.on(EVENTS.STATE_CHANGED, this.refreshAll, this);
    EventBus.on(EVENTS.MAP_CONTEXT_CHANGED, this.onMapContextChanged, this);

    this.events.on('shutdown', () => {
      EventBus.off(EVENTS.CITY_SELECTED, this.onCitySelected, this);
      EventBus.off(EVENTS.CITY_DESELECTED, this.onCityDeselected, this);
      EventBus.off(EVENTS.OPEN_ACTION_PANEL, this.onActionPanelOpened, this);
      EventBus.off(EVENTS.CLOSE_ACTION_PANEL, this.onActionPanelClosed, this);
      EventBus.off(EVENTS.STATE_CHANGED, this.refreshAll, this);
      EventBus.off(EVENTS.MAP_CONTEXT_CHANGED, this.onMapContextChanged, this);
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
    bg.fillStyle(0x08080e, HUD_STYLE.bgAlpha);
    bg.fillRect(0, 0, W, H);
    // primary accent line
    bg.lineStyle(1.5, this.fc.primary, HUD_STYLE.borderAlpha);
    bg.lineBetween(0, H, W, H);
    // subtle secondary line 1px below
    bg.lineStyle(1, 0x1a1a28, 0.2);
    bg.lineBetween(0, H + 1.5, W, H + 1.5);

    // 세력 색 dot + 이름
    const factionObj = src.factions?.[this.factionId] || {};
    const dot = this.add.graphics();
    dot.fillStyle(this.fc.primary, 1);
    dot.fillCircle(12, H / 2, 4);
    this.add.text(22, H / 2, `${factionObj.name || this.factionId}`, {
      fontFamily: FONTS.title, fontSize: '16px', fontStyle: '700', color: this.fc.css,
    }).setOrigin(0, 0.5);

    // 턴/연도
    const year = gs?.year || 208;
    const month = gs?.month || 1;
    const turn = gs?.turn || 1;
    const season = month <= 3 ? '봄' : month <= 6 ? '여름' : month <= 9 ? '가을' : '겨울';
    this.hudTurnText = this.add.text(146, H / 2, `${year}년 ${season} · ${turn}턴`, {
      ...FONT_STYLES.bodyDim, fontSize: '12px',
    }).setOrigin(0, 0.5);
    // hudTurnText, hudActionsLabel, hudActionDots는 hudElements에 넣지 않음 (refreshHUD에서 in-place 업데이트)

    // 자원 표시 (우측) — chip 기반
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

    let rx = W - 16;
    resources.reverse().forEach(r => {
      // measure text widths (invisible first)
      const valText = this.add.text(0, 0, r.value, {
        fontFamily: FONTS.ui, fontSize: '13px', fontStyle: '700', color: r.color,
      }).setVisible(false);
      const lblText = this.add.text(0, 0, r.label, {
        fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
      }).setVisible(false);
      const chipW = valText.width + lblText.width + 24;

      // chip background
      const chip = this.add.graphics();
      chip.fillStyle(HUD_STYLE.chipBg, HUD_STYLE.chipAlpha);
      chip.fillRoundedRect(rx - chipW, (H - HUD_STYLE.chipHeight) / 2, chipW, HUD_STYLE.chipHeight, HUD_STYLE.chipRadius);

      // position text inside chip
      valText.setPosition(rx - 8, H / 2).setOrigin(1, 0.5).setVisible(true);
      lblText.setPosition(rx - 8 - valText.width - 4, H / 2).setOrigin(1, 0.5).setVisible(true);

      this.hudElements.push(chip, valText, lblText);
      rx -= chipW + HUD_STYLE.chipGap;
    });

    // 행동력 표시 — 라벨 + 도트
    const actions = gs?.actionsRemaining ?? 3;
    const maxActions = 3;
    this.hudActionsLabel = this.add.text(310, H / 2, '행동력', {
      fontFamily: FONTS.ui, fontSize: '11px', fontStyle: '600', color: COLORS_CSS.textDim,
    }).setOrigin(0, 0.5);

    this.hudActionDots = this.add.graphics();
    this._drawActionDots(this.hudActionDots, 310 + this.hudActionsLabel.width + 8, H / 2, actions, maxActions);
  }

  /** 행동력 도트 그리기 헬퍼 */
  _drawActionDots(gfx, startX, cy, filled, total) {
    gfx.clear();
    const size = 8;
    const radius = 2;
    const gap = 4;
    for (let i = 0; i < total; i++) {
      const dx = startX + i * (size + gap);
      const dy = cy - size / 2;
      if (i < filled) {
        gfx.fillStyle(this.fc.primary, 0.9);
      } else {
        gfx.fillStyle(COLORS.border, 0.4);
      }
      gfx.fillRoundedRect(dx, dy, size, size, radius);
    }
  }

  // ─── 턴 종료 버튼 ───
  drawEndTurnButton() {
    const btnW = 140;
    const btnH = 38;
    const btnX = 1600 / 2 - btnW / 2;
    const btnY = 900 - 50;

    const btnBg = this.add.graphics();
    btnBg.fillStyle(this.fc.primary, 0.75);
    btnBg.fillRoundedRect(btnX, btnY, btnW, btnH, 6);
    btnBg.lineStyle(1, this.fc.primary, 0.3);
    btnBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 6);

    const btnLabel = this.add.text(btnX + btnW / 2, btnY + btnH / 2, '턴 종료', {
      fontFamily: FONTS.ui, fontSize: '14px', fontStyle: '700', color: '#000000',
    }).setOrigin(0.5);

    const zone = this.add.zone(btnX + btnW / 2, btnY + btnH / 2, btnW, btnH)
      .setInteractive({ useHandCursor: true });

    zone.on('pointerover', () => {
      btnBg.clear();
      btnBg.fillStyle(this.fc.primary, 1);
      btnBg.fillRoundedRect(btnX, btnY, btnW, btnH, 6);
      btnBg.lineStyle(1, this.fc.primary, 0.6);
      btnBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 6);
    });
    zone.on('pointerout', () => {
      btnBg.clear();
      btnBg.fillStyle(this.fc.primary, 0.75);
      btnBg.fillRoundedRect(btnX, btnY, btnW, btnH, 6);
      btnBg.lineStyle(1, this.fc.primary, 0.3);
      btnBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 6);
    });
    zone.on('pointerdown', () => this.onEndTurn());
  }

  drawStrategyMapButton() {
    const btnW = 132;
    const btnH = 30;
    const btnX = 1600 - btnW - 262;
    const btnY = 10;

    const btnBg = this.add.graphics();
    btnBg.fillStyle(0x10141b, 0.82);
    btnBg.fillRoundedRect(btnX, btnY, btnW, btnH, 15);
    btnBg.lineStyle(1, COLORS.accent, 0.24);
    btnBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 15);

    this.strategyMapButtonText = this.add.text(btnX + btnW / 2, btnY + btnH / 2, '작전도', {
      fontFamily: FONTS.ui,
      fontSize: '12px',
      fontStyle: '700',
      color: COLORS_CSS.textBright,
    }).setOrigin(0.5);

    const zone = this.add.zone(btnX + btnW / 2, btnY + btnH / 2, btnW, btnH)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => this.toggleStrategyMapOverlay());
    zone.on('pointerover', () => {
      btnBg.clear();
      btnBg.fillStyle(0x161b25, 0.92);
      btnBg.fillRoundedRect(btnX, btnY, btnW, btnH, 15);
      btnBg.lineStyle(1, COLORS.accent, 0.36);
      btnBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 15);
    });
    zone.on('pointerout', () => {
      btnBg.clear();
      btnBg.fillStyle(0x10141b, 0.82);
      btnBg.fillRoundedRect(btnX, btnY, btnW, btnH, 15);
      btnBg.lineStyle(1, COLORS.accent, 0.24);
      btnBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 15);
    });

    this.input.keyboard.on('keydown-M', this.toggleStrategyMapOverlay, this);
    this.events.on('shutdown', () => {
      this.input.keyboard.off('keydown-M', this.toggleStrategyMapOverlay, this);
    });
  }

  toggleStrategyMapOverlay() {
    const context = this.selectedCityId && this.liveState?.cities?.[this.selectedCityId]
      ? `${this.liveState.cities[this.selectedCityId].name} 기준으로 방면과 수로, 관문 흐름을 함께 봅니다.`
      : '현재 전장의 방면과 수로, 관문 흐름을 함께 봅니다.';
    this.strategyMapOverlay?.toggle(context);
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
    const SX = 1600 - SW - 20;
    const SY = SIZES.hudHeight + 18;

    // 사이드바 배경 (처음에는 숨김)
    this.sidebarBg = this.add.graphics();
    this.sidebarBg.setVisible(false);

    this.sidebarX = SX;
    this.sidebarY = SY;
    this.sidebarW = SW;
    this.sidebarH = 396;
  }

  // ─── 도시 선택 시 ───
  onCitySelected({ cityId, city }) {
    this.selectedCityId = cityId;
    // 라이브 GameState 데이터 우선 사용
    const liveCity = this.liveState?.cities?.[cityId] || city;
    if (this.strategyMapButtonText) {
      this.strategyMapButtonText.setText(`작전도 · ${liveCity?.name || city?.name || ''}`);
    }
    this.strategyMapOverlay?.setContext(`${liveCity?.name || city?.name || '현재 전장'} 기준으로 방면과 수로, 관문 흐름을 함께 봅니다.`);
    this.showSidebar(cityId, liveCity);
  }

  onCityDeselected() {
    this.selectedCityId = null;
    if (this.strategyMapButtonText) {
      this.strategyMapButtonText.setText('작전도');
    }
    this.strategyMapOverlay?.setContext('현재 전장의 방면과 수로, 관문 흐름을 함께 봅니다.');
    this.hideSidebar();
  }

  onActionPanelOpened() {
    this.sidebarSuppressed = true;
    this.strategyMapOverlay?.close();
    this.setSidebarVisible(false);
  }

  onActionPanelClosed() {
    this.sidebarSuppressed = false;
    if (this.selectedCityId && this.liveState?.cities?.[this.selectedCityId]) {
      this.showSidebar(this.selectedCityId, this.liveState.cities[this.selectedCityId]);
      return;
    }
    this.setSidebarVisible(false);
  }

  onMapContextChanged(payload = {}) {
    this.mapContext = {
      zoomTier: payload.zoomTier || this.mapContext.zoomTier,
      selectedCityId: payload.selectedCityId ?? this.mapContext.selectedCityId,
      connectedIds: payload.connectedIds || [],
    };
    if (this.selectedCityId && this.liveState?.cities?.[this.selectedCityId] && !this.sidebarSuppressed) {
      this.showSidebar(this.selectedCityId, this.liveState.cities[this.selectedCityId]);
    }
  }

  getTierMeta() {
    switch (this.mapContext?.zoomTier) {
      case 'strategic':
        return { label: '전략 판세', sidebarHeight: 320, showOfficer: false, frontCards: 2 };
      case 'local':
        return { label: '국지 지휘', sidebarHeight: 404, showOfficer: true, frontCards: 1 };
      case 'frontline':
      default:
        return { label: '전선 판독', sidebarHeight: 364, showOfficer: false, frontCards: 1 };
    }
  }

  showSidebar(cityId, city) {
    this.clearSidebar();
    if (this.sidebarSuppressed) {
      this.setSidebarVisible(false);
      return;
    }

    const x = this.sidebarX;
    const y = this.sidebarY;
    const w = this.sidebarW;
    const tierMeta = this.getTierMeta();
    const h = tierMeta.sidebarHeight;
    this.sidebarH = h;
    const fc = FACTION_COLORS[city.owner] || FACTION_COLORS.neutral;
    const pad = SPACING.lg;

    // 배경
    this.sidebarBg.setVisible(true);
    this.sidebarBg.clear();
    this.sidebarBg.fillStyle(0x080a10, 0.72);
    this.sidebarBg.fillRoundedRect(x, y, w, h, 12);
    this.sidebarBg.lineStyle(1, fc.primary, 0.22);
    this.sidebarBg.strokeRoundedRect(x, y, w, h, 12);
    this.sidebarBg.fillStyle(fc.primary, 0.16);
    this.sidebarBg.fillRoundedRect(x, y, w, 4, { tl: 12, tr: 12 });

    let cy = y + pad;
    const cx = x + pad;
    const cw = w - pad * 2;
    const directive = this.buildCityDirective(cityId, city);
    const roads = this.scenario.mapLayout?.roads || [];
    const neighborIds = roads
      .filter((road) => road.from === cityId || road.to === cityId)
      .map((road) => (road.from === cityId ? road.to : road.from));
    const enemyNeighbors = neighborIds
      .map((id) => this.liveState?.cities?.[id] || this.scenario.cities?.[id])
      .filter((neighbor) => neighbor && neighbor.owner !== this.factionId);
    const allyNeighbors = neighborIds
      .map((id) => this.liveState?.cities?.[id] || this.scenario.cities?.[id])
      .filter((neighbor) => neighbor && neighbor.owner === this.factionId && neighbor.id !== cityId);
    const directiveLine = enemyNeighbors.length > 0
      ? `적 ${enemyNeighbors.length} · 지원 ${allyNeighbors.length} · ${directive.risk}`
      : `접경 없음 · 지원 ${allyNeighbors.length} · ${directive.risk}`;

    // 도시명 + 세력
    const factionName = this.scenario.factions[city.owner]?.name || city.owner;
    this.sidebarAdd(this.add.text(cx, cy, city.name, {
      fontFamily: FONTS.title, fontSize: '22px', fontStyle: '700', color: fc.css,
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

    const headerCard = this.add.graphics();
    headerCard.fillStyle(fc.badgeDark || COLORS.bgHover, 0.46);
    headerCard.fillRoundedRect(cx, cy, cw, 60, 10);
    headerCard.lineStyle(1, fc.primary, 0.16);
    headerCard.strokeRoundedRect(cx, cy, cw, 60, 10);
    this.sidebarAdd(headerCard);

    this.sidebarAdd(this.add.text(cx + 14, cy + 12, `${tierMeta.label} · ${directive.tag}`, {
      fontFamily: FONTS.ui, fontSize: '10px', fontStyle: '700', color: fc.css,
    }));
    this.sidebarAdd(this.add.text(cx + 14, cy + 28, directive.focus, {
      fontFamily: FONTS.title, fontSize: '17px', fontStyle: '700', color: COLORS_CSS.textBright,
    }));
    this.sidebarAdd(this.add.text(cx + 14, cy + 46, directiveLine, {
      fontFamily: FONTS.ui, fontSize: '10px', fontStyle: '600', color: COLORS_CSS.textDim, wordWrap: { width: cw - 28 },
    }));

    const summaryCards = [
      { label: '병력', value: `${Math.round((city.army || 0) / 1000)}k`, tone: '#e57373' },
      { label: '사기', value: `${city.morale || 0}`, tone: this.moraleColor(city.morale) },
      { label: '방어', value: `${city.defense || 0}`, tone: '#90caf9' },
      { label: '식량', value: `${Math.round((city.food || 0) / 1000)}k`, tone: '#8bc34a' },
    ];
    cy += 70;
    const cardGap = 8;
    const metricW = (cw - cardGap * 3) / 4;
    summaryCards.forEach((card, index) => {
      const row = 0;
      const col = index;
      const cardX = cx + col * (metricW + cardGap);
      const cardY = cy + row * 42;
      const metricBg = this.add.graphics();
      metricBg.fillStyle(0x0d1016, 0.6);
      metricBg.fillRoundedRect(cardX, cardY, metricW, 34, 8);
      metricBg.lineStyle(1, COLORS.border, 0.1);
      metricBg.strokeRoundedRect(cardX, cardY, metricW, 34, 8);
      this.sidebarAdd(metricBg);
      this.sidebarAdd(this.add.text(cardX + 8, cardY + 17, card.label, {
        fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
      }).setOrigin(0, 0.5));
      this.sidebarAdd(this.add.text(cardX + metricW - 8, cardY + 17, card.value, {
        fontFamily: FONTS.ui, fontSize: '12px', fontStyle: '700', color: card.tone,
      }).setOrigin(1, 0.5));
    });
    cy += 46;

    this.sidebarLine(x + pad, cy, cw, fc.primary);
    cy += 10;

    this.sidebarAdd(this.add.text(cx, cy, '전선 판독', {
      fontFamily: FONTS.ui, fontSize: '11px', fontStyle: '700', color: COLORS_CSS.textDim,
    }));
    this.sidebarAdd(this.add.text(cx + cw, cy, `적 ${enemyNeighbors.length} · 지원 ${allyNeighbors.length}`, {
      fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
    }).setOrigin(1, 0));
    cy += 16;

    const frontCards = [];
    enemyNeighbors.slice(0, 2).forEach((neighbor) => {
      frontCards.push({
        tag: '접경',
        title: `${neighbor.name} 방면`,
        body: `적 병력 ${Math.round((neighbor.army || 0) / 1000)}k · 방어 ${neighbor.defense || 0}`,
        color: COLORS_CSS.accent,
      });
    });
    if (frontCards.length === 0) {
      allyNeighbors.slice(0, 2).forEach((neighbor) => {
        frontCards.push({
          tag: '연결',
          title: `${neighbor.name} 지원선`,
          body: `아군 병력 ${Math.round((neighbor.army || 0) / 1000)}k · 식량 ${Math.round((neighbor.food || 0) / 1000)}k`,
          color: fc.css,
        });
      });
    }
    if (frontCards.length === 0) {
      frontCards.push({
        tag: '후방',
        title: '직접 접경 없음',
        body: '병참과 인재 정비에 집중해 다음 공세를 떠받칠 수 있는 거점입니다.',
        color: COLORS_CSS.textBright,
      });
    }

    frontCards.slice(0, tierMeta.frontCards).forEach((card, index) => {
      const cardY = cy + index * 50;
      const frontBg = this.add.graphics();
      frontBg.fillStyle(0x10141b, 0.54);
      frontBg.fillRoundedRect(cx, cardY, cw, 48, 8);
      frontBg.lineStyle(1, fc.primary, 0.1);
      frontBg.strokeRoundedRect(cx, cardY, cw, 48, 8);
      this.sidebarAdd(frontBg);
      this.sidebarAdd(this.add.text(cx + 12, cardY + 9, card.tag, {
        fontFamily: FONTS.ui, fontSize: '10px', fontStyle: '700', color: card.color,
      }));
      this.sidebarAdd(this.add.text(cx + 12, cardY + 21, card.title, {
        fontFamily: FONTS.ui, fontSize: '12px', fontStyle: '700', color: COLORS_CSS.textBright,
      }));
      this.sidebarAdd(this.add.text(cx + 12, cardY + 34, card.body, {
        fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
        wordWrap: { width: cw - 24 },
      }));
    });
    cy += Math.min(frontCards.length, tierMeta.frontCards) * 54 + 2;

    if (tierMeta.showOfficer) {
      this.sidebarLine(x + pad, cy, cw, fc.primary);
      cy += 10;

      this.sidebarAdd(this.add.text(cx, cy, '지휘 장수', {
        fontFamily: FONTS.ui, fontSize: '11px', fontStyle: '600', color: COLORS_CSS.textDim,
      }));
      cy += 18;

      const leadOfficer = this.getGarrison(cityId)[0];
      if (leadOfficer) {
        const officerBg = this.add.graphics();
        officerBg.fillStyle(0x10141b, 0.52);
        officerBg.fillRoundedRect(cx, cy, cw, 34, 8);
        officerBg.lineStyle(1, COLORS.border, 0.1);
        officerBg.strokeRoundedRect(cx, cy, cw, 34, 8);
        this.sidebarAdd(officerBg);

        const role = this.scenario.factions[city.owner]?.leader === leadOfficer.id
          ? '군주'
          : city.governor === leadOfficer.id
            ? '태수'
            : '참모';
        this.sidebarAdd(this.add.text(cx + 12, cy + 7, `${this.charName(leadOfficer.id)} · ${role}`, {
          fontFamily: FONTS.ui, fontSize: '11px', fontStyle: '700', color: COLORS_CSS.textBright,
        }));
        this.sidebarAdd(this.add.text(cx + 12, cy + 19, this.summarizeOfficer(leadOfficer.stats || {}), {
          fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
        }));
      }
    }

    // ── 명령 버튼 ──
    cy = y + h - 46;
    const btnW = cw;
    const btnH = 32;
    const btnBg = this.add.graphics();
    btnBg.fillStyle(fc.primary, 0.85);
    btnBg.fillRoundedRect(cx, cy, btnW, btnH, 6);
    this.sidebarAdd(btnBg);

    this.sidebarAdd(this.add.text(cx + btnW / 2, cy + btnH / 2, '명령 열기', {
      fontFamily: FONTS.ui, fontSize: '13px', fontStyle: '700', color: '#000000',
    }).setOrigin(0.5));

    const btnZone = this.add.zone(cx + btnW / 2, cy + btnH / 2, btnW, btnH)
      .setInteractive({ useHandCursor: true });
    this.sidebarAdd(btnZone);

    btnZone.on('pointerdown', () => {
      EventBus.emit(EVENTS.OPEN_ACTION_PANEL, { cityId, city, activeTab: directive.recommendedTab });
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

    this.sidebarAdd(this.add.text(cx, cy - 16, `권장 명령 · ${directive.recommendedLabel}`, {
      fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
    }));

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

  setSidebarVisible(visible) {
    this.sidebarBg.setVisible(visible);
    this.sidebarElements.forEach((el) => el.setVisible?.(visible));
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

  summarizeOfficer(stats) {
    const order = [
      ['command', '통솔'],
      ['war', '무력'],
      ['intellect', '지력'],
      ['politics', '정무'],
      ['charisma', '매력'],
    ];
    const [topKey, topLabel] = order
      .map(([key, label]) => [key, label, stats[key] || 0])
      .sort((a, b) => b[2] - a[2])[0];
    const topValue = stats[topKey] || 0;
    return `${topLabel} ${topValue} · 통${stats.command || 0} 무${stats.war || 0} 지${stats.intellect || 0}`;
  }

  buildCityDirective(cityId, city) {
    const roads = this.scenario.mapLayout?.roads || [];
    const neighborIds = roads
      .filter((road) => road.from === cityId || road.to === cityId)
      .map((road) => (road.from === cityId ? road.to : road.from));
    const enemyNeighbors = neighborIds
      .map((id) => this.liveState?.cities?.[id] || this.scenario.cities?.[id])
      .filter((neighbor) => neighbor && neighbor.owner !== this.factionId);
    const allyNeighbors = neighborIds
      .map((id) => this.liveState?.cities?.[id] || this.scenario.cities?.[id])
      .filter((neighbor) => neighbor && neighbor.owner === this.factionId && neighbor.id !== cityId);

    const army = city.army || 0;
    const food = city.food || 0;

    if (enemyNeighbors.length > 0 && army >= 25000) {
      return {
        tag: '접경 전선',
        focus: '주공 축을 열 수 있습니다',
        body: `${enemyNeighbors.slice(0, 2).map((neighbor) => neighbor.name).join(' · ')} 방향으로 바로 흔들 수 있습니다.`,
        risk: '공세',
        recommendedTab: 'military',
        recommendedLabel: '군사',
      };
    }
    if (enemyNeighbors.length > 0) {
      return {
        tag: '압박 거점',
        focus: '징병과 치안을 먼저 붙드십시오',
        body: `${enemyNeighbors[0].name} 접경 압박이 남아 있습니다. 지금은 군량과 병력 정비가 우선입니다.`,
        risk: '방비',
        recommendedTab: 'government',
        recommendedLabel: '시정',
      };
    }
    if (food < 14000 || (city.agriculture || 0) < 45) {
      return {
        tag: '후방 운영',
        focus: '곡창과 상업 축을 끌어올릴 구간입니다',
        body: '당장 칼이 들어오지 않는 거점입니다. 식량과 상업을 끌어올려 다음 전선을 받치십시오.',
        risk: '정비',
        recommendedTab: 'government',
        recommendedLabel: '시정',
      };
    }
    return {
      tag: '병참 거점',
      focus: '인재와 병참을 함께 정리할 수 있습니다',
      body: `아군 연결 도시 ${allyNeighbors.length || 1}곳을 받칩니다. 장수와 보급선을 정리해 다음 턴을 준비하십시오.`,
      risk: '지원',
      recommendedTab: 'personnel',
      recommendedLabel: '인사',
    };
  }

  refreshAll({ state } = {}) {
    if (state) this.liveState = state;
    this.gameplay = this.registry.get('gameplay');
    if (this.gameplay) this.liveState = this.gameplay.state;
    this.faction = this.liveState?.factions?.[this.factionId] || this.scenario.factions[this.factionId];
    const worldMap = this.scene.isActive('WorldMap') ? this.scene.get('WorldMap') : null;
    if (worldMap?.zoomTier) {
      this.mapContext.zoomTier = worldMap.zoomTier;
      this.mapContext.connectedIds = [...(worldMap.focusConnectedIds || [])];
    }
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

    // 행동력 도트 갱신
    const actions = gs.actionsRemaining ?? 0;
    const maxActions = 3;
    if (this.hudActionsLabel && this.hudActionDots) {
      this.hudActionsLabel.setColor(actions > 0 ? COLORS_CSS.textDim : '#f44336');
      this._drawActionDots(this.hudActionDots, 310 + this.hudActionsLabel.width + 8, H / 2, actions, maxActions);
    }

    // 자원 chip 갱신
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

    let rx = W - 16;
    resources.reverse().forEach(r => {
      const valText = this.add.text(0, 0, r.value, {
        fontFamily: FONTS.ui, fontSize: '13px', fontStyle: '700', color: r.color,
      }).setVisible(false);
      const lblText = this.add.text(0, 0, r.label, {
        fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
      }).setVisible(false);
      const chipW = valText.width + lblText.width + 24;

      const chip = this.add.graphics();
      chip.fillStyle(HUD_STYLE.chipBg, HUD_STYLE.chipAlpha);
      chip.fillRoundedRect(rx - chipW, (H - HUD_STYLE.chipHeight) / 2, chipW, HUD_STYLE.chipHeight, HUD_STYLE.chipRadius);

      valText.setPosition(rx - 8, H / 2).setOrigin(1, 0.5).setVisible(true);
      lblText.setPosition(rx - 8 - valText.width - 4, H / 2).setOrigin(1, 0.5).setVisible(true);

      this.hudElements.push(chip, valText, lblText);
      rx -= chipW + HUD_STYLE.chipGap;
    });
  }
}
