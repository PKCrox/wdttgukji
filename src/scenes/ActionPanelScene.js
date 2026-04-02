import Phaser from 'phaser';
import { COLORS, COLORS_CSS, FONT_STYLES, FONTS, FACTION_COLORS } from '../utils/Theme.js';
import EventBus, { EVENTS } from '../utils/EventBus.js';
import { ensureStrategyMapOverlay } from '../utils/StrategyMapOverlay.js';
import { CHAR_NAMES } from '../../engine/data/names.js';

/**
 * 명령 패널 씬 — 도시 명령 4탭 모달
 * 시정(政) / 군사(戰) / 외교(盟) / 인사(將)
 */

const TABS = [
  { key: 'government', label: '시정', emblem: '政', desc: '내정 투자, 정책, 건설, 연구', tone: 0x4a8d63, css: '#7fd39a', kicker: '정무 당번', stripTitle: '시정 정비' },
  { key: 'military', label: '군사', emblem: '戰', desc: '출진, 징병, 보급', tone: 0xb7644c, css: '#ef9a79', kicker: '군막 결심', stripTitle: '주공 축 선택' },
  { key: 'diplomacy', label: '외교', emblem: '盟', desc: '동맹, 선전포고, 화친', tone: 0x5d7fb6, css: '#94baff', kicker: '외교 사절', stripTitle: '외교 조정' },
  { key: 'personnel', label: '인사', emblem: '將', desc: '인재 탐색, 등용, 이동, 포상', tone: 0xa7864d, css: '#d7b77b', kicker: '인사 장부', stripTitle: '장수 배치' },
];

export default class ActionPanelScene extends Phaser.Scene {
  constructor() {
    super('ActionPanel');
    this.elements = [];
    this.activeTab = 'government';
    this.contentElements = [];
  }

  init(data) {
    this.cityId = data.cityId;
    this.city = data.city;
    this.activeTab = data.activeTab || 'government';
  }

  create() {
    const scenario = this.registry.get('scenario');
    const factionId = this.registry.get('selectedFaction');
    if (!scenario || !this.city) return;

    this.scenario = scenario;
    this.factionId = factionId;
    this.faction = scenario.factions[factionId];
    this.fc = FACTION_COLORS[factionId] || FACTION_COLORS.neutral;
    this.strategyMapOverlay = ensureStrategyMapOverlay();

    // 엔진 연결 — 라이브 데이터 읽기
    this.gameplay = this.registry.get('gameplay');
    if (this.gameplay) {
      const liveCity = this.gameplay.state.getCity(this.cityId);
      if (liveCity) this.city = liveCity;
    }

    this.isOwned = this.city.owner === factionId;
    this.directive = this.buildDirective();

    // 반투명 배경 (클릭 시 닫기)
    const dimBg = this.add.graphics();
    dimBg.fillStyle(0x020205, 0.72);
    dimBg.fillRect(0, 0, 1600, 900);
    dimBg.setInteractive(new Phaser.Geom.Rectangle(0, 0, 1600, 900), Phaser.Geom.Rectangle.Contains);
    dimBg.on('pointerdown', (ptr) => {
      // 패널 영역 외 클릭 시 닫기
      if (ptr.x < this.panelX || ptr.x > this.panelX + this.panelW ||
          ptr.y < this.panelY || ptr.y > this.panelY + this.panelH) {
        this.closePanel();
      }
    });

    // 패널 크기/위치
    this.panelW = 920;
    this.panelH = 740;
    this.panelX = (1600 - this.panelW) / 2;
    this.panelY = 92;

    this.drawPanelFrame();
    this.drawTabs();
    this.showTabContent(this.activeTab);

    // ESC로 닫기
    this.input.keyboard.once('keydown-ESC', () => this.closePanel());
    this.input.keyboard.on('keydown-M', this.toggleStrategyMapOverlay, this);
    this.events.on('shutdown', () => {
      this.input.keyboard.off('keydown-M', this.toggleStrategyMapOverlay, this);
    });
  }

  getTabMeta(tabKey = this.activeTab) {
    return TABS.find((tab) => tab.key === tabKey) || TABS[0];
  }

  drawPanelFrame() {
    const { panelX: x, panelY: y, panelW: w, panelH: h, fc } = this;
    const tabMeta = this.getTabMeta();

    // 패널 배경
    const bg = this.add.graphics();
    bg.fillStyle(0x0c0e14, 0.98);
    bg.fillRoundedRect(x, y, w, h, 12);
    bg.lineStyle(1.2, fc.primary, 0.4);
    bg.strokeRoundedRect(x, y, w, h, 12);
    bg.lineStyle(1, 0x1e2636, 0.12);
    bg.strokeRoundedRect(x + 4, y + 4, w - 8, h - 8, 10);

    // 상단 색상 바
    bg.fillStyle(fc.primary, 0.7);
    bg.fillRoundedRect(x, y, w, 4, { tl: 12, tr: 12 });

    // 헤더
    this.add.text(x + 20, y + 18, this.city.name, {
      fontFamily: FONTS.title, fontSize: '22px', fontStyle: '700', color: fc.css,
    });

    const factionName = this.scenario.factions[this.city.owner]?.name || '';
    this.add.text(x + 20, y + 46, factionName, {
      ...FONT_STYLES.bodyDim, fontSize: '11px',
    });

    // 행동력 표시 (라이브)
    const ar = this.gameplay?.actionsRemaining ?? 3;
    this.add.text(x + w - 20, y + 24, `행동력 ${ar}/3`, {
      fontFamily: FONTS.ui, fontSize: '13px', fontStyle: '700',
      color: ar > 0 ? COLORS_CSS.accent : '#f44336',
    }).setOrigin(1, 0);

    const mapBtnX = x + w - 126;
    const mapBtnY = y + 16;
    const mapBtn = this.add.graphics();
    mapBtn.fillStyle(0x10141b, 0.92);
    mapBtn.fillRoundedRect(mapBtnX, mapBtnY, 84, 24, 12);
    mapBtn.lineStyle(1, COLORS.accent, 0.22);
    mapBtn.strokeRoundedRect(mapBtnX, mapBtnY, 84, 24, 12);
    const mapBtnLabel = this.add.text(mapBtnX + 42, mapBtnY + 12, '작전도', {
      fontFamily: FONTS.ui,
      fontSize: '10px',
      fontStyle: '700',
      color: COLORS_CSS.textBright,
    }).setOrigin(0.5);
    const mapZone = this.add.zone(mapBtnX + 42, mapBtnY + 12, 84, 24).setInteractive({ useHandCursor: true });
    mapZone.on('pointerdown', () => this.toggleStrategyMapOverlay());
    mapZone.on('pointerover', () => {
      mapBtn.clear();
      mapBtn.fillStyle(0x161b25, 0.96);
      mapBtn.fillRoundedRect(mapBtnX, mapBtnY, 84, 24, 12);
      mapBtn.lineStyle(1, COLORS.accent, 0.36);
      mapBtn.strokeRoundedRect(mapBtnX, mapBtnY, 84, 24, 12);
      mapBtnLabel.setColor(COLORS_CSS.accent);
    });
    mapZone.on('pointerout', () => {
      mapBtn.clear();
      mapBtn.fillStyle(0x10141b, 0.92);
      mapBtn.fillRoundedRect(mapBtnX, mapBtnY, 84, 24, 12);
      mapBtn.lineStyle(1, COLORS.accent, 0.22);
      mapBtn.strokeRoundedRect(mapBtnX, mapBtnY, 84, 24, 12);
      mapBtnLabel.setColor(COLORS_CSS.textBright);
    });

    // 닫기 버튼
    const closeBtn = this.add.text(x + w - 20, y + 46, '✕ 닫기', {
      fontFamily: FONTS.ui, fontSize: '11px', color: COLORS_CSS.textDim,
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.closePanel());
    closeBtn.on('pointerover', () => closeBtn.setColor(COLORS_CSS.accent));
    closeBtn.on('pointerout', () => closeBtn.setColor(COLORS_CSS.textDim));

    const stripY = y + 76;
    const stripH = 58;
    const strip = this.add.graphics();
    strip.fillStyle(0x0e1119, 0.96);
    strip.fillRoundedRect(x + 20, stripY, w - 40, stripH, 12);
    strip.lineStyle(1, tabMeta.tone, 0.26);
    strip.strokeRoundedRect(x + 20, stripY, w - 40, stripH, 12);
    strip.fillStyle(tabMeta.tone, 0.12);
    strip.fillRoundedRect(x + 32, stripY + 12, 84, 22, 11);

    this.add.text(x + 74, stripY + 23, tabMeta.kicker, {
      fontFamily: FONTS.ui, fontSize: '10px', fontStyle: '700', color: tabMeta.css,
    }).setOrigin(0.5);
    this.add.text(x + 132, stripY + 12, tabMeta.stripTitle, {
      fontFamily: FONTS.title, fontSize: '17px', fontStyle: '700', color: COLORS_CSS.textBright,
    });
    this.add.text(x + 132, stripY + 34, `${tabMeta.desc} · ${this.directive.body}`, {
      fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
      wordWrap: { width: 440 },
    });

    const metrics = [
      `병력 ${Math.round((this.city.army || 0) / 1000)}k`,
      `식량 ${Math.round((this.city.food || 0) / 1000)}k`,
      `사기 ${this.city.morale || 0}`,
    ];
    metrics.forEach((metric, index) => {
      const chipX = x + w - 272 + index * 84;
      const chip = this.add.graphics();
      chip.fillStyle(0x0d1119, 0.96);
      chip.fillRoundedRect(chipX, stripY + 14, 76, 24, 12);
      chip.lineStyle(1, index === 0 ? tabMeta.tone : COLORS.border, index === 0 ? 0.24 : 0.14);
      chip.strokeRoundedRect(chipX, stripY + 14, 76, 24, 12);
      this.add.text(chipX + 38, stripY + 26, metric, {
        fontFamily: FONTS.ui, fontSize: '10px', fontStyle: '700',
        color: index === 0 ? tabMeta.css : COLORS_CSS.textBright,
      }).setOrigin(0.5);
    });
  }

  drawTabs() {
    const x = this.panelX;
    const y = this.panelY + 146;
    const tabW = this.panelW / TABS.length;

    // 탭 구분선
    const line = this.add.graphics();
    line.lineStyle(1, COLORS.border, 0.3);
    line.lineBetween(x, y + 44, x + this.panelW, y + 44);

    this.tabElements = [];

    TABS.forEach((tab, i) => {
      const tx = x + i * tabW;
      const isActive = tab.key === this.activeTab;
      const tone = tab.tone;

      // 탭 배경
      const tabBg = this.add.graphics();
      if (isActive) {
        tabBg.fillStyle(tone, 0.12);
        tabBg.fillRect(tx, y, tabW, 44);
      }

      // 한자 + 한글
      const emblem = this.add.text(tx + tabW / 2 - 16, y + 10, tab.emblem, {
        fontFamily: FONTS.title, fontSize: '18px', fontStyle: '700',
        color: isActive ? tab.css : COLORS_CSS.textDim,
      }).setOrigin(0.5, 0);

      const label = this.add.text(tx + tabW / 2 + 12, y + 14, tab.label, {
        fontFamily: FONTS.ui, fontSize: '13px', fontStyle: isActive ? '700' : '400',
        color: isActive ? COLORS_CSS.textBright : COLORS_CSS.textDim,
      }).setOrigin(0.5, 0);

      // 활성 탭 하단 바
      if (isActive) {
        const bar = this.add.graphics();
        bar.fillStyle(tone, 0.9);
        bar.fillRoundedRect(tx + 12, y + 41, tabW - 24, 3, 1.5);
      }

      // 탭 클릭 영역
      const zone = this.add.zone(tx + tabW / 2, y + 22, tabW, 44)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        if (this.activeTab !== tab.key) {
          this.scene.restart({ cityId: this.cityId, city: this.city, activeTab: tab.key });
        }
      });

      this.tabElements.push({ tabBg, emblem, label, zone });
    });

    this.contentY = y + 52;
  }

  showTabContent(tabKey) {
    this.clearContent();
    const cx = this.panelX + 20;
    const cw = this.panelW - 40;
    let cy = this.contentY;

    if (!this.isOwned) {
      this.addContent(this.add.text(cx + cw / 2, cy + 60, '상대 세력의 도시입니다', {
        ...FONT_STYLES.bodyDim, fontSize: '14px',
      }).setOrigin(0.5));
      return;
    }

    const stageW = 248;
    const stageGap = 14;
    const mainW = cw - stageW - stageGap;
    this.drawTabStageBoard(cx + mainW + stageGap, cy, stageW, tabKey);

    switch (tabKey) {
      case 'government': cy = this.drawGovernmentTab(cx, cy, mainW); break;
      case 'military': cy = this.drawMilitaryTab(cx, cy, mainW); break;
      case 'diplomacy': cy = this.drawDiplomacyTab(cx, cy, mainW); break;
      case 'personnel': cy = this.drawPersonnelTab(cx, cy, mainW); break;
    }
  }

  getTabStageCopy(tabKey) {
    const actionsRemaining = this.gameplay?.actionsRemaining ?? 0;
    const army = `${Math.round((this.city.army || 0) / 1000)}k`;
    const food = `${Math.round((this.city.food || 0) / 1000)}k`;

    switch (tabKey) {
      case 'government':
        return {
          kicker: '시정 국면',
          title: '후방을 굴려 다음 달 전선을 만든다',
          body: '군량과 치안은 화려하지 않지만, 이 둘이 비면 다음 턴 공세가 즉시 꺾입니다.',
          bullets: [
            `거점 성격 · ${this.directive.tag}`,
            `비축 · 병력 ${army} / 식량 ${food}`,
            `행동력 · ${actionsRemaining}회 남음`,
          ],
        };
      case 'military':
        return {
          kicker: '군사 국면',
          title: '이번 턴 어느 축에 칼을 꽂을지 고른다',
          body: '주공은 한 곳이면 충분합니다. 나머지는 징병과 보급으로 그 한 칼을 받치는 일입니다.',
          bullets: [
            `전선 평가 · ${this.directive.tag}`,
            `즉응 병력 · ${army}`,
            `행동력 · ${actionsRemaining}회 남음`,
          ],
        };
      case 'diplomacy':
        return {
          kicker: '외교 국면',
          title: '누구와 시간을 벌고 누구를 묶을지 정한다',
          body: '외교는 장식이 아니라, 전장 안의 압박을 다른 방향으로 돌리는 판세 조정입니다.',
          bullets: [
            `현재 국면 · ${this.directive.tag}`,
            '우선순위 · 화친, 동맹, 견제',
            `행동력 · ${actionsRemaining}회 남음`,
          ],
        };
      case 'personnel':
      default:
        return {
          kicker: '인사 국면',
          title: '누구를 붙잡고 누구를 움직일지 정한다',
          body: '장수 배치는 보조 메뉴가 아니라 다음 전투의 승패를 미리 정하는 전력 편성입니다.',
          bullets: [
            `거점 역할 · ${this.directive.tag}`,
            `주둔 병력 · ${army}`,
            `행동력 · ${actionsRemaining}회 남음`,
          ],
        };
    }
  }

  drawTabStageBoard(x, y, w, tabKey) {
    const copy = this.getTabStageCopy(tabKey);
    const tabMeta = this.getTabMeta(tabKey);
    const h = 248;
    const bg = this.add.graphics();
    bg.fillStyle(0x0e1119, 0.96);
    bg.fillRoundedRect(x, y, w, h, 12);
    bg.lineStyle(1, tabMeta.tone, 0.26);
    bg.strokeRoundedRect(x, y, w, h, 12);
    this.addContent(bg);

    const header = this.add.graphics();
    header.fillStyle(tabMeta.tone, 0.16);
    header.fillRoundedRect(x + 12, y + 12, w - 24, 34, 10);
    this.addContent(header);

    this.addContent(this.add.text(x + 22, y + 21, copy.kicker, {
      fontFamily: FONTS.ui, fontSize: '10px', fontStyle: '700', color: tabMeta.css,
    }));
    this.addContent(this.add.text(x + 16, y + 58, copy.title, {
      fontFamily: FONTS.title, fontSize: '18px', fontStyle: '700', color: COLORS_CSS.textBright,
      wordWrap: { width: w - 32 },
    }));
    this.addContent(this.add.text(x + 16, y + 112, copy.body, {
      fontFamily: FONTS.ui, fontSize: '11px', color: COLORS_CSS.textDim,
      wordWrap: { width: w - 32 },
    }));

    copy.bullets.forEach((bullet, index) => {
      const rowY = y + 164 + index * 24;
      const dot = this.add.graphics();
      dot.fillStyle(tabMeta.tone, 0.82);
      dot.fillCircle(x + 22, rowY + 5, 3);
      this.addContent(dot);
      this.addContent(this.add.text(x + 34, rowY, bullet, {
        fontFamily: FONTS.ui, fontSize: '10px',
        color: index === 0 ? COLORS_CSS.textBright : COLORS_CSS.textDim,
        wordWrap: { width: w - 48 },
      }));
    });
  }

  drawSectionCard(cx, cy, cw, label, detail) {
    const tabMeta = this.getTabMeta();
    const bg = this.add.graphics();
    bg.fillStyle(0x0e1119, 0.95);
    bg.fillRoundedRect(cx, cy, cw, 40, 10);
    bg.lineStyle(1, tabMeta.tone, 0.2);
    bg.strokeRoundedRect(cx, cy, cw, 40, 10);
    this.addContent(bg);

    const kicker = this.add.graphics();
    kicker.fillStyle(tabMeta.tone, 0.18);
    kicker.fillRoundedRect(cx + 10, cy + 9, 68, 22, 11);
    this.addContent(kicker);
    this.addContent(this.add.text(cx + 44, cy + 20, label, {
      fontFamily: FONTS.ui,
      fontSize: '10px',
      fontStyle: '700',
      color: tabMeta.css,
    }).setOrigin(0.5));

    this.addContent(this.add.text(cx + 90, cy + 13, detail, {
      fontFamily: FONTS.ui,
      fontSize: '10px',
      color: COLORS_CSS.textDim,
      wordWrap: { width: cw - 104 },
    }));

    return cy + 50;
  }

  drawMiniActionPill(cx, cy, label, {
    enabled = true,
    accentColor = this.fc.primary,
    textColor = COLORS_CSS.textBright,
    disabledTextColor = COLORS_CSS.textDim,
    width = null,
    onConfirm,
  } = {}) {
    const w = width || Math.max(56, 26 + label.length * 10);
    const h = 24;
    const bg = this.add.graphics();
    bg.fillStyle(accentColor, enabled ? 0.18 : 0.08);
    bg.fillRoundedRect(cx, cy, w, h, 12);
    bg.lineStyle(1, accentColor, enabled ? 0.28 : 0.12);
    bg.strokeRoundedRect(cx, cy, w, h, 12);
    this.addContent(bg);

    const labelText = this.add.text(cx + w / 2, cy + h / 2, label, {
      fontFamily: FONTS.ui,
      fontSize: '10px',
      fontStyle: '700',
      color: enabled ? textColor : disabledTextColor,
    }).setOrigin(0.5);
    this.addContent(labelText);

    if (enabled) {
      const zone = this.add.zone(cx + w / 2, cy + h / 2, w, h).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => onConfirm?.());
      this.addContent(zone);
    }

    return w;
  }

  // ─── 시정 탭 ───
  drawGovernmentTab(cx, cy, cw) {
    cy = this.drawDecisionBanner(cx, cy, cw, {
      kicker: '시정 명령',
      title: '도시를 붙드는 정비가 먼저입니다',
      detail: '지금 턴에 바로 숫자가 오르기보다 다음 턴 전선이 무너지지 않게 버팀목을 세우는 결정입니다.',
    });

    // 4트랙 투자
    const tracks = [
      { key: 'agriculture', label: '농업 투자', icon: '🌾', stat: 'politics' },
      { key: 'commerce', label: '상업 투자', icon: '💰', stat: 'intellect' },
      { key: 'technology', label: '기술 투자', icon: '⚙', stat: 'intellect' },
      { key: 'publicOrder', label: '치안 투자', icon: '🛡', stat: 'charisma' },
    ];

    const noActions = (this.gameplay?.actionsRemaining ?? 0) <= 0;
    cy = this.drawSectionCard(cx, cy, cw, '내정 회의', '농업, 상업, 기술, 치안 중 이번 달 주연이 될 축을 고른다');
    cy = this.drawGovernmentCouncilBoard(cx, cy, cw, tracks, noActions);
    return this.drawGovernmentReserveBoard(cx, cy, cw, noActions);
  }

  // ─── 군사 탭 ───
  drawMilitaryTab(cx, cy, cw) {
    cy = this.drawDecisionBanner(cx, cy, cw, {
      kicker: '군사 명령',
      title: '이번 턴 칼끝을 어느 축에 꽂을지 정합니다',
      detail: '출진과 징병은 같은 목록이 아니라 공세 시점과 병참 준비를 가르는 다른 결심입니다.',
    });

    const pop = this.city.population || 0;
    const recruits = Math.floor(pop * 0.05);
    const roads = this.scenario.mapLayout?.roads || [];
    const neighborIds = roads
      .filter(r => r.from === this.cityId || r.to === this.cityId)
      .map(r => r.from === this.cityId ? r.to : r.from)
      .filter(id => this.scenario.cities[id]);
    const enemyNeighbors = neighborIds
      .map(id => ({ id, ...(this.gameplay?.state?.getCity(id) || this.scenario.cities[id]) }))
      .filter(city => city && city.owner !== this.factionId);
    const allyNeighbors = neighborIds
      .map(id => ({ id, ...(this.gameplay?.state?.getCity(id) || this.scenario.cities[id]) }))
      .filter(city => city && city.owner === this.factionId && city.id !== this.cityId);
    const noActionsM = (this.gameplay?.actionsRemaining ?? 0) <= 0;

    cy = this.drawMilitaryOperationsBoard(cx, cy, cw, {
      enemyNeighbors,
      allyNeighbors,
      recruits,
      noActions: noActionsM,
      canConscript: pop >= 5000 && !noActionsM,
    });
    return cy;
  }

  // ─── 외교 탭 ───
  drawDiplomacyTab(cx, cy, cw) {
    cy = this.drawDecisionBanner(cx, cy, cw, {
      kicker: '외교 명령',
      title: '칼을 빼기 전 판세의 기울기를 흔듭니다',
      detail: '동맹과 화친은 장식이 아니라 주공을 어디에 모을지 정하는 판세 조정입니다.',
    });

    const otherFactions = Object.entries(this.scenario.factions)
      .filter(([id]) => id !== this.factionId && this.scenario.factions[id].active !== false);
    cy = this.drawDiplomacyOverviewBoard(cx, cy, cw, otherFactions);
    cy = this.drawDiplomacyRelationBoard(cx, cy, cw, otherFactions);
    return cy;
  }

  drawGovernmentCouncilBoard(cx, cy, cw, tracks, noActions) {
    const gap = 12;
    const cardW = Math.floor((cw - gap) / 2);
    const cardH = 100;

    tracks.forEach((track, index) => {
      const cardX = cx + (index % 2) * (cardW + gap);
      const cardY = cy + Math.floor(index / 2) * (cardH + gap);
      const value = this.city[track.key] || 0;
      const canDo = value < 100 && !noActions;
      const accent = value >= 80 ? COLORS.success : this.fc.primary;
      const effect = this.getInvestmentEffect(track.key);

      const card = this.add.graphics();
      card.fillStyle(0x10141c, 0.97);
      card.fillRoundedRect(cardX, cardY, cardW, cardH, 12);
      card.lineStyle(1, accent, 0.18);
      card.strokeRoundedRect(cardX, cardY, cardW, cardH, 12);
      card.fillStyle(accent, 0.1);
      card.fillRoundedRect(cardX + 12, cardY + 12, 84, 22, 11);
      this.addContent(card);

      this.addContent(this.add.text(cardX + 54, cardY + 23, track.label, {
        fontFamily: FONTS.ui, fontSize: '10px', fontStyle: '700', color: track.key === 'publicOrder' ? '#9ed5ff' : this.fc.css,
      }).setOrigin(0.5));
      this.addContent(this.add.text(cardX + 14, cardY + 42, `현재 ${value}/100`, {
        fontFamily: FONTS.title, fontSize: '22px', fontStyle: '700', color: COLORS_CSS.textBright,
      }));
      this.addContent(this.add.text(cardX + 14, cardY + 64, effect, {
        fontFamily: FONTS.ui, fontSize: '9px', color: COLORS_CSS.textDim,
        wordWrap: { width: cardW - 28 },
      }));

      const barBg = this.add.graphics();
      barBg.fillStyle(0x0a0d13, 0.88);
      barBg.fillRoundedRect(cardX + 14, cardY + 80, cardW - 114, 8, 4);
      barBg.fillStyle(accent, 0.82);
      barBg.fillRoundedRect(cardX + 14, cardY + 80, (cardW - 114) * Math.min(1, value / 100), 8, 4);
      this.addContent(barBg);

      this.drawMiniActionPill(cardX + cardW - 88, cardY + 72, canDo ? '투자 집행' : (noActions ? '행동력 부족' : '최대'), {
        width: 74,
        enabled: canDo,
        accentColor: accent,
        onConfirm: () => this.executeAction('invest', { cityId: this.cityId, track: track.key }),
      });
    });

    return cy + Math.ceil(tracks.length / 2) * (cardH + gap);
  }

  drawGovernmentReserveBoard(cx, cy, cw, noActions) {
    const gap = 12;
    const leftW = Math.floor((cw - gap) * 0.46);
    const rightW = cw - leftW - gap;
    const cardH = 110;

    const fortressBg = this.add.graphics();
    fortressBg.fillStyle(0x10151d, 0.97);
    fortressBg.fillRoundedRect(cx, cy, leftW, cardH, 12);
    fortressBg.lineStyle(1, this.fc.primary, 0.18);
    fortressBg.strokeRoundedRect(cx, cy, leftW, cardH, 12);
    this.addContent(fortressBg);
    this.addContent(this.add.text(cx + 14, cy + 14, '수성', {
      fontFamily: FONTS.ui, fontSize: '10px', fontStyle: '700', color: this.fc.css,
    }));
    this.addContent(this.add.text(cx + 14, cy + 34, `성벽 ${this.city.defense || 0}/100`, {
      fontFamily: FONTS.title, fontSize: '18px', fontStyle: '700', color: COLORS_CSS.textBright,
    }));
    this.addContent(this.add.text(cx + 14, cy + 58, '정면 충돌 전에는 성벽과 치안이 한 턴을 더 벌어 줍니다.', {
      fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
      wordWrap: { width: leftW - 28 },
    }));
    this.drawMiniActionPill(cx + 14, cy + 80, (this.city.defense || 0) < 100 && !noActions ? '성벽 보강' : ((this.city.defense || 0) >= 100 ? '최대' : '행동력 부족'), {
      width: leftW - 28,
      enabled: (this.city.defense || 0) < 100 && !noActions,
    });

    const logisticsX = cx + leftW + gap;
    const logisticsBg = this.add.graphics();
    logisticsBg.fillStyle(0x10151d, 0.97);
    logisticsBg.fillRoundedRect(logisticsX, cy, rightW, cardH, 12);
    logisticsBg.lineStyle(1, this.fc.primary, 0.18);
    logisticsBg.strokeRoundedRect(logisticsX, cy, rightW, cardH, 12);
    this.addContent(logisticsBg);
    this.addContent(this.add.text(logisticsX + 14, cy + 14, '병참 장부', {
      fontFamily: FONTS.ui, fontSize: '10px', fontStyle: '700', color: this.fc.css,
    }));
    this.addContent(this.add.text(logisticsX + 14, cy + 34, `금 ${(this.faction?.gold || 0).toLocaleString()} · 식량 ${(this.city.food || 0).toLocaleString()}`, {
      fontFamily: FONTS.title, fontSize: '16px', fontStyle: '700', color: COLORS_CSS.textBright,
      wordWrap: { width: rightW - 28 },
    }));
    this.addContent(this.add.text(logisticsX + 14, cy + 58, '사면 숨통이 트이고, 팔면 즉시 자금이 생깁니다.', {
      fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
      wordWrap: { width: rightW - 28 },
    }));
    const pillW = Math.floor((rightW - 42) / 2);
    this.drawMiniActionPill(logisticsX + 14, cy + 80, '군량 매입', {
      width: pillW,
      enabled: true,
    });
    this.drawMiniActionPill(logisticsX + 22 + pillW, cy + 80, (this.city.food || 0) >= 2000 ? '군량 매각' : '식량 부족', {
      width: pillW,
      enabled: (this.city.food || 0) >= 2000,
    });

    return cy + cardH + 14;
  }

  drawMilitaryOperationsBoard(cx, cy, cw, {
    enemyNeighbors,
    allyNeighbors,
    recruits,
    noActions,
    canConscript,
  }) {
    const gap = 12;
    const leftW = Math.floor(cw * 0.58);
    const rightW = cw - leftW - gap;
    const boardH = 220;
    const leftX = cx;
    const rightX = cx + leftW + gap;

    const frontBg = this.add.graphics();
    frontBg.fillStyle(0x0f131b, 0.97);
    frontBg.fillRoundedRect(leftX, cy, leftW, boardH, 12);
    frontBg.lineStyle(1, this.fc.primary, 0.22);
    frontBg.strokeRoundedRect(leftX, cy, leftW, boardH, 12);
    this.addContent(frontBg);
    this.addContent(this.add.text(leftX + 16, cy + 14, '주공 축', {
      fontFamily: FONTS.ui, fontSize: '10px', fontStyle: '700', color: this.fc.css,
    }));
    this.addContent(this.add.text(leftX + 16, cy + 34, '이번 턴 칼끝을 뽑을 전선', {
      fontFamily: FONTS.title, fontSize: '18px', fontStyle: '700', color: COLORS_CSS.textBright,
    }));

    if (enemyNeighbors.length === 0) {
      this.addContent(this.add.text(leftX + 16, cy + 86, '직접 개전할 적 접경이 아직 없습니다.', {
        fontFamily: FONTS.ui, fontSize: '13px', fontStyle: '700', color: COLORS_CSS.textBright,
      }));
      this.addContent(this.add.text(leftX + 16, cy + 112, '이 거점은 지금 칼을 뽑기보다 징병과 병참으로 다음 전선을 준비하는 쪽이 맞습니다.', {
        fontFamily: FONTS.ui, fontSize: '11px', color: COLORS_CSS.textDim,
        wordWrap: { width: leftW - 32 },
      }));
    } else {
      const mapX = leftX + 14;
      const mapY = cy + 62;
      const mapW = leftW - 28;
      const mapH = 110;
      const theaterBg = this.add.graphics();
      theaterBg.fillStyle(0x131925, 0.98);
      theaterBg.fillRoundedRect(mapX, mapY, mapW, mapH, 10);
      theaterBg.lineStyle(1, this.fc.primary, 0.16);
      theaterBg.strokeRoundedRect(mapX, mapY, mapW, mapH, 10);
      this.addContent(theaterBg);

      const routeGfx = this.add.graphics();
      const originX = mapX + 54;
      const originY = mapY + mapH / 2;
      const hubX = mapX + mapW / 2 - 20;
      const hubY = mapY + mapH / 2;
      routeGfx.lineStyle(2, this.fc.primary, 0.42);
      routeGfx.lineBetween(originX, originY, hubX, hubY);
      routeGfx.fillStyle(this.fc.primary, 0.86);
      routeGfx.fillCircle(originX, originY, 8);
      routeGfx.fillCircle(hubX, hubY, 6);

      enemyNeighbors.slice(0, 2).forEach((target, index) => {
        const enemyFc = FACTION_COLORS[target.owner] || FACTION_COLORS.neutral;
        const targetX = mapX + mapW - 92;
        const targetY = mapY + 30 + index * 48;
        routeGfx.lineStyle(2, enemyFc.primary, 0.54);
        routeGfx.lineBetween(hubX, hubY, targetX, targetY);
        routeGfx.fillStyle(enemyFc.primary, 0.9);
        routeGfx.fillCircle(targetX, targetY, 8);

        this.addContent(this.add.text(targetX - 16, targetY - 14, `${target.name} 방면`, {
          fontFamily: FONTS.ui, fontSize: '11px', fontStyle: '700', color: enemyFc.css,
        }).setOrigin(1, 0));
        this.addContent(this.add.text(targetX - 16, targetY + 2, `병력 ${(target.army || 0).toLocaleString()} · 방어 ${target.defense || 0}`, {
          fontFamily: FONTS.ui, fontSize: '8px', color: COLORS_CSS.textDim,
        }).setOrigin(1, 0));
        this.drawMiniActionPill(targetX + 14, targetY - 11, '출진', {
          width: 54,
          enabled: (this.city.army || 0) >= 1000 && !noActions,
          accentColor: enemyFc.primary,
          onConfirm: () => this.executeAction('attack', { fromCityId: this.cityId, toCityId: target.id }),
        });
      });

      allyNeighbors.slice(0, 1).forEach((target) => {
        const allyX = mapX + mapW / 2;
        const allyY = mapY + mapH - 18;
        routeGfx.lineStyle(1.5, this.fc.primary, 0.24);
        routeGfx.lineBetween(hubX, hubY, allyX, allyY);
        routeGfx.fillStyle(this.fc.primary, 0.54);
        routeGfx.fillCircle(allyX, allyY, 5);
        this.addContent(this.add.text(allyX, allyY + 8, `지원선 · ${target.name}`, {
          fontFamily: FONTS.ui, fontSize: '8px', color: COLORS_CSS.textDim,
        }).setOrigin(0.5, 0));
      });

      this.addContent(routeGfx);
      this.addContent(this.add.text(originX, originY - 22, this.city.name, {
        fontFamily: FONTS.ui, fontSize: '12px', fontStyle: '700', color: this.fc.css,
      }).setOrigin(0.5, 0));
      this.addContent(this.add.text(originX, originY + 12, `출진 병력 ${(this.city.army || 0).toLocaleString()}`, {
        fontFamily: FONTS.ui, fontSize: '8px', color: COLORS_CSS.textDim,
      }).setOrigin(0.5, 0));
    }

    const frontNote = this.add.graphics();
    frontNote.fillStyle(this.fc.primary, 0.1);
    frontNote.fillRoundedRect(leftX + 14, cy + boardH - 52, leftW - 28, 36, 10);
    this.addContent(frontNote);
    this.addContent(this.add.text(leftX + 28, cy + boardH - 40, enemyNeighbors.length > 0
      ? '주공은 한 축만 잡고, 나머지는 징병과 보급으로 받칩니다.'
      : '직접 개전축이 없을수록 다음 턴을 위한 병력 축적이 우선입니다.', {
      fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
      wordWrap: { width: leftW - 56 },
    }));

    const recruitY = cy;
    const recruitH = 104;
    const recruitRatio = Math.min(1, recruits / 4000);
    const recruitBg = this.add.graphics();
    recruitBg.fillStyle(0x10151d, 0.97);
    recruitBg.fillRoundedRect(rightX, recruitY, rightW, recruitH, 12);
    recruitBg.lineStyle(1, this.fc.primary, 0.18);
    recruitBg.strokeRoundedRect(rightX, recruitY, rightW, recruitH, 12);
    this.addContent(recruitBg);
    this.addContent(this.add.text(rightX + 14, recruitY + 14, '징병 장부', {
      fontFamily: FONTS.ui, fontSize: '10px', fontStyle: '700', color: this.fc.css,
    }));
    this.addContent(this.add.text(rightX + 14, recruitY + 34, `징병 ${recruits.toLocaleString()}명`, {
      fontFamily: FONTS.title, fontSize: '18px', fontStyle: '700', color: COLORS_CSS.textBright,
    }));
    this.addContent(this.add.text(rightX + 14, recruitY + 58, '즉시 병력을 끌어와 전열을 두껍게 만듭니다.', {
      fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
      wordWrap: { width: rightW - 28 },
    }));
    const recruitBarBg = this.add.graphics();
    recruitBarBg.fillStyle(0x0b1017, 0.92);
    recruitBarBg.fillRoundedRect(rightX + 14, recruitY + 82, rightW - 116, 6, 3);
    recruitBarBg.fillStyle(this.fc.primary, 0.8);
    recruitBarBg.fillRoundedRect(rightX + 14, recruitY + 82, (rightW - 116) * recruitRatio, 6, 3);
    this.addContent(recruitBarBg);
    this.addContent(this.add.text(rightX + 14, recruitY + 88, recruitRatio >= 0.75 ? '즉시 전열 강화 가능' : '보조 증원 수준', {
      fontFamily: FONTS.ui, fontSize: '8px', color: COLORS_CSS.textDim,
    }));
    this.drawMiniActionPill(rightX + rightW - 96, recruitY + 72, canConscript ? '징병 집행' : (noActions ? '행동력 부족' : '인구 부족'), {
      width: 82,
      enabled: canConscript,
      onConfirm: () => this.executeAction('conscript', { cityId: this.cityId }),
    });

    const supportY = recruitY + recruitH + 12;
    const supportH = 104;
    const supportBg = this.add.graphics();
    supportBg.fillStyle(0x10151d, 0.97);
    supportBg.fillRoundedRect(rightX, supportY, rightW, supportH, 12);
    supportBg.lineStyle(1, this.fc.primary, 0.18);
    supportBg.strokeRoundedRect(rightX, supportY, rightW, supportH, 12);
    this.addContent(supportBg);
    this.addContent(this.add.text(rightX + 14, supportY + 14, '병참선', {
      fontFamily: FONTS.ui, fontSize: '10px', fontStyle: '700', color: this.fc.css,
    }));
    this.addContent(this.add.text(rightX + 14, supportY + 34, allyNeighbors.length > 0 ? '주공을 받칠 아군 거점' : '지금 연결된 병참선 없음', {
      fontFamily: FONTS.title, fontSize: allyNeighbors.length > 0 ? '16px' : '14px', fontStyle: '700', color: COLORS_CSS.textBright,
      wordWrap: { width: rightW - 28 },
    }));

    if (allyNeighbors.length === 0) {
      this.addContent(this.add.text(rightX + 14, supportY + 60, '이 턴은 독자 방어에 집중해야 합니다.', {
        fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
        wordWrap: { width: rightW - 28 },
      }));
    } else {
      allyNeighbors.slice(0, 2).forEach((target, index) => {
        const rowY = supportY + 56 + index * 22;
        this.addContent(this.add.text(rightX + 14, rowY, `${target.name} · ${(target.army || 0).toLocaleString()}명`, {
          fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
        }));
        this.drawMiniActionPill(rightX + rightW - 82, rowY - 6, '보급', {
          width: 56,
          enabled: (this.city.army || 0) >= 2000 && !noActions,
          onConfirm: () => console.log(`[ActionPanel] ${target.name} 지원 이동 (Phase 4에서 engine 연결)`),
        });
      });
    }

    return cy + boardH + 14;
  }

  drawDiplomacyOverviewBoard(cx, cy, cw, otherFactions) {
    const wars = otherFactions.filter(([fid]) => this.getRelationStatus(fid).label === '교전 중').length;
    const allies = otherFactions.filter(([fid]) => this.getRelationStatus(fid).label === '동맹').length;
    const neutrals = otherFactions.length - wars - allies;

    const board = this.add.graphics();
    board.fillStyle(0x0f131b, 0.97);
    board.fillRoundedRect(cx, cy, cw, 96, 10);
    board.lineStyle(1, this.fc.primary, 0.16);
    board.strokeRoundedRect(cx, cy, cw, 96, 10);
    this.addContent(board);

    this.addContent(this.add.text(cx + 14, cy + 12, '사절단 회의', {
      fontFamily: FONTS.ui, fontSize: '10px', fontStyle: '700', color: this.fc.css,
    }));
    this.addContent(this.add.text(cx + 14, cy + 30, '누구를 묶고 누구를 늦출지 먼저 고른다', {
      fontFamily: FONTS.title, fontSize: '17px', fontStyle: '700', color: COLORS_CSS.textBright,
    }));
    this.addContent(this.add.text(cx + 14, cy + 50, '동맹은 유지, 교전은 조절, 중립은 끌어당길 시간이다.', {
      fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
    }));
    const doctrineBg = this.add.graphics();
    doctrineBg.fillStyle(0x0d1119, 0.94);
    doctrineBg.fillRoundedRect(cx + 14, cy + 68, 238, 18, 9);
    doctrineBg.lineStyle(1, this.fc.primary, 0.12);
    doctrineBg.strokeRoundedRect(cx + 14, cy + 68, 238, 18, 9);
    this.addContent(doctrineBg);
    this.addContent(this.add.text(cx + 24, cy + 77, '권고 · 화친으로 시간을 벌고, 서찰로 중립을 먼저 흔든다', {
      fontFamily: FONTS.ui, fontSize: '8px', color: COLORS_CSS.textDim,
    }));

    const chips = [
      { label: '교전', value: `${wars}`, color: COLORS.warning, css: COLORS_CSS.warning },
      { label: '동맹', value: `${allies}`, color: this.fc.primary, css: this.fc.css },
      { label: '중립', value: `${neutrals}`, color: COLORS.border, css: COLORS_CSS.textDim },
    ];

    chips.forEach((chip, index) => {
      const chipX = cx + cw - 82 - (2 - index) * 88;
      const chipBg = this.add.graphics();
      chipBg.fillStyle(chip.color, 0.12);
      chipBg.fillRoundedRect(chipX, cy + 18, 76, 56, 12);
      chipBg.lineStyle(1, chip.color, 0.18);
      chipBg.strokeRoundedRect(chipX, cy + 18, 76, 56, 12);
      this.addContent(chipBg);
      this.addContent(this.add.text(chipX + 38, cy + 31, chip.label, {
        fontFamily: FONTS.ui, fontSize: '9px', fontStyle: '700', color: chip.css,
      }).setOrigin(0.5));
      this.addContent(this.add.text(chipX + 38, cy + 51, chip.value, {
        fontFamily: FONTS.title, fontSize: '18px', fontStyle: '700', color: COLORS_CSS.textBright,
      }).setOrigin(0.5));
      this.addContent(this.add.text(chipX + 38, cy + 68, index === 0 ? '조절' : index === 1 ? '유지' : '탐색', {
        fontFamily: FONTS.ui, fontSize: '8px', fontStyle: '700', color: chip.css,
      }).setOrigin(0.5));
    });

    return cy + 108;
  }

  drawDiplomacyRelationBoard(cx, cy, cw, otherFactions) {
    const gap = 12;
    const cardW = Math.floor((cw - gap) / 2);
    const cardH = 136;

    otherFactions.forEach(([fid, faction], index) => {
      const cardX = cx + (index % 2) * (cardW + gap);
      const cardY = cy + Math.floor(index / 2) * (cardH + gap);
      const relation = this.getRelationStatus(fid);
      const accent = FACTION_COLORS[fid] || FACTION_COLORS.neutral;

      const card = this.add.graphics();
      card.fillStyle(0x10141c, 0.97);
      card.fillRoundedRect(cardX, cardY, cardW, cardH, 12);
      card.lineStyle(1, accent.primary, 0.18);
      card.strokeRoundedRect(cardX, cardY, cardW, cardH, 12);
      card.fillStyle(accent.primary, 0.62);
      card.fillRoundedRect(cardX + 10, cardY + 12, 4, cardH - 24, 2);
      this.addContent(card);

      this.addContent(this.add.text(cardX + 24, cardY + 14, faction.name, {
        fontFamily: FONTS.title, fontSize: '18px', fontStyle: '700', color: accent.css,
      }));

      const relationTone = relation.label === '교전 중'
        ? COLORS.warning
        : relation.label === '동맹'
          ? this.fc.primary
          : COLORS.border;
      const relationCss = relation.label === '교전 중'
        ? COLORS_CSS.warning
        : relation.label === '동맹'
          ? this.fc.css
          : COLORS_CSS.textDim;
      this.drawMiniActionPill(cardX + cardW - 102, cardY + 14, relation.label, {
        width: 82,
        enabled: false,
        accentColor: relationTone,
        textColor: relationCss,
        disabledTextColor: relationCss,
      });

      const posture = relation.label === '교전 중'
        ? '압박이 이미 닿았습니다. 이 세력은 지금 시간을 벌어도 좋고, 위협을 더 밀어도 되는 상대입니다.'
        : relation.label === '동맹'
          ? '지금은 우호를 소비할지 유지할지 고르는 단계입니다. 여유를 어느 전선에 돌릴지 함께 계산해야 합니다.'
          : '아직 손을 잡을 수도, 적으로 돌릴 수도 있습니다. 이번 턴 외교 여력을 어디에 쓰는지 시험하는 상대입니다.';
      this.addContent(this.add.text(cardX + 24, cardY + 44, posture, {
        fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
        wordWrap: { width: cardW - 48 },
      }));

      const intentY = cardY + 92;
      const intentBg = this.add.graphics();
      intentBg.fillStyle(0x0e1219, 0.92);
      intentBg.fillRoundedRect(cardX + 20, intentY, cardW - 40, 28, 10);
      intentBg.lineStyle(1, accent.primary, 0.12);
      intentBg.strokeRoundedRect(cardX + 20, intentY, cardW - 40, 28, 10);
      this.addContent(intentBg);
      const intentText = relation.label === '교전 중'
        ? '권고 · 화친으로 턴을 비틀거나, 위협으로 적 전선을 묶는다'
        : relation.label === '동맹'
          ? '권고 · 동맹을 유지하며 다른 전선에 칼을 모은다'
          : '권고 · 서찰로 탐색한 뒤 동맹 또는 견제를 선택한다';
      this.addContent(this.add.text(cardX + 30, intentY + 10, intentText, {
        fontFamily: FONTS.ui, fontSize: '9px', color: COLORS_CSS.textDim,
        wordWrap: { width: cardW - 60 },
      }));

      const actions = relation.actions.split('/').map((value) => value.trim()).filter(Boolean);
      actions.slice(0, 2).forEach((actionLabel, actionIndex) => {
        this.drawMiniActionPill(cardX + 24 + actionIndex * 94, cardY + 126, actionLabel, {
          width: 82,
          accentColor: accent.primary,
          onConfirm: () => console.log(`[ActionPanel] ${faction.name} ${actionLabel} (Phase 4에서 engine 연결)`),
        });
      });

      this.addContent(this.add.text(cardX + cardW - 20, cardY + cardH - 16, relation.label === '교전 중' ? '긴장' : relation.label === '동맹' ? '유지' : '탐색', {
        fontFamily: FONTS.ui, fontSize: '10px', fontStyle: '700', color: accent.css,
      }).setOrigin(1, 0.5));
    });

    const rows = Math.ceil(otherFactions.length / 2);
    return cy + rows * (cardH + gap);
  }

  // ─── 인사 탭 ───
  drawPersonnelTab(cx, cy, cw) {
    cy = this.drawDecisionBanner(cx, cy, cw, {
      kicker: '인사 명령',
      title: '이번 턴의 빈칸을 사람으로 메웁니다',
      detail: '장수 이동과 포상은 보조 메뉴가 아니라 다음 전선을 버티게 할 지휘 배치입니다.',
    });

    const chars = this.gameplay?.state?.characters || this.scenario.characters;
    const noActionsP = (this.gameplay?.actionsRemaining ?? 0) <= 0;
    const wanderers = Object.entries(chars)
      .filter(([, c]) => c.city === this.cityId && (!c.faction || c.status === 'wandering') && c.alive !== false);

    const garrison = Object.entries(chars)
      .filter(([, c]) => c.city === this.cityId && c.faction === this.factionId && c.alive !== false)
      .map(([id, c]) => ({ id, ...c }))
      .slice(0, 5);

    cy = this.drawPersonnelStaffBoard(cx, cy, cw, {
      wanderers,
      garrison,
      noActions: noActionsP,
    });
    cy = this.drawPersonnelRosterBoard(cx, cy, cw, garrison);

    // 포로
    const captives = Object.entries(chars)
      .filter(([, c]) => c.city === this.cityId && c.status === 'captive' && c.capturedBy === this.factionId);

    if (captives.length > 0) {
      cy += 8;
      this.contentLine(cx, cy, cw);
      cy += 12;

      cy = this.drawSectionCard(cx, cy, cw, `포로 ${captives.length}명`, '붙잡아 둘지, 돌려보낼지, 꺾을지 고른다');

      captives.slice(0, 3).forEach(([id, c]) => {
        cy = this.drawActionRow(cx, cy, cw, {
          title: `⛓ ${CHAR_NAMES[id] || id}`,
          subtitle: `설득 / 석방 / 처형`,
          effect: '포로 처리 방식은 충성, 악명, 다음 등용 가능성을 함께 흔든다',
          badge: '처리',
          cost: '행동력 1',
          enabled: true,
        });
      });
    }

    return cy;
  }

  drawPersonnelRosterBoard(cx, cy, cw, garrison) {
    const tabMeta = this.getTabMeta('personnel');
    const gap = 12;
    const cardW = Math.floor((cw - gap) / 2);
    const cardH = 84;
    const roster = garrison.slice(0, 4);

    if (roster.length === 0) {
      const emptyBg = this.add.graphics();
      emptyBg.fillStyle(0x10141c, 0.95);
      emptyBg.fillRoundedRect(cx, cy, cw, 72, 10);
      emptyBg.lineStyle(1, tabMeta.tone, 0.16);
      emptyBg.strokeRoundedRect(cx, cy, cw, 72, 10);
      this.addContent(emptyBg);
      this.addContent(this.add.text(cx + 16, cy + 18, '지금 이 거점에 배치할 장수가 없습니다', {
        fontFamily: FONTS.ui, fontSize: '13px', fontStyle: '700', color: COLORS_CSS.textBright,
      }));
      this.addContent(this.add.text(cx + 16, cy + 40, '탐색이나 이동으로 먼저 인력을 채워야 합니다.', {
        fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
      }));
      return cy + 78;
    }

    roster.forEach((char, index) => {
      const cardX = cx + (index % 2) * (cardW + gap);
      const cardY = cy + Math.floor(index / 2) * (cardH + gap);
      const s = char.stats || {};
      const isLeader = this.faction?.leader === char.id;
      const role = isLeader ? '군주' : this.city.governor === char.id ? '태수' : '장수';

      const cardBg = this.add.graphics();
      cardBg.fillStyle(0x10141c, 0.97);
      cardBg.fillRoundedRect(cardX, cardY, cardW, cardH, 12);
      cardBg.lineStyle(1, tabMeta.tone, 0.18);
      cardBg.strokeRoundedRect(cardX, cardY, cardW, cardH, 12);
      this.addContent(cardBg);

      const roleChip = this.add.graphics();
      roleChip.fillStyle(tabMeta.tone, 0.18);
      roleChip.fillRoundedRect(cardX + 12, cardY + 12, 52, 22, 11);
      this.addContent(roleChip);
      this.addContent(this.add.text(cardX + 38, cardY + 23, role, {
        fontFamily: FONTS.ui, fontSize: '10px', fontStyle: '700', color: tabMeta.css,
      }).setOrigin(0.5));
      this.addContent(this.add.text(cardX + 76, cardY + 14, CHAR_NAMES[char.id] || char.id, {
        fontFamily: FONTS.ui, fontSize: '13px', fontStyle: '700', color: COLORS_CSS.textBright,
      }));
      this.addContent(this.add.text(cardX + 76, cardY + 33, `통${s.command || 0} · 무${s.war || 0} · 지${s.intellect || 0} · 충${Math.round(char.loyalty || 0)}`, {
        fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
      }));

      this.drawMiniActionPill(cardX + cardW - 86, cardY + 48, isLeader ? '고정' : '배치', {
        width: 68,
        enabled: !isLeader,
        accentColor: tabMeta.tone,
        onConfirm: () => console.log(`[ActionPanel] ${CHAR_NAMES[char.id] || char.id} 배치 조정 (Phase 4에서 engine 연결)`),
      });
      this.addContent(this.add.text(cardX + 12, cardY + 58, isLeader ? '군주는 이 거점의 기준점입니다.' : '배치와 포상으로 다음 턴 효율을 바꿉니다.', {
        fontFamily: FONTS.ui, fontSize: '9px', color: COLORS_CSS.textDim,
        wordWrap: { width: cardW - 92 },
      }));
    });

    if (garrison.length > roster.length) {
      this.addContent(this.add.text(cx + cw, cy + Math.ceil(roster.length / 2) * (cardH + gap) - 4, `외 ${garrison.length - roster.length}명 대기`, {
        fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
      }).setOrigin(1, 0));
    }

    return cy + Math.ceil(roster.length / 2) * (cardH + gap);
  }

  drawPersonnelStaffBoard(cx, cy, cw, {
    wanderers,
    garrison,
    noActions,
  }) {
    const gap = 12;
    const leftW = Math.floor((cw - gap) * 0.46);
    const rightW = cw - leftW - gap;
    const boardH = 88;
    const rightX = cx + leftW + gap;

    const scoutBg = this.add.graphics();
    scoutBg.fillStyle(0x10151d, 0.97);
    scoutBg.fillRoundedRect(cx, cy, leftW, boardH, 12);
    scoutBg.lineStyle(1, this.getTabMeta('personnel').tone, 0.18);
    scoutBg.strokeRoundedRect(cx, cy, leftW, boardH, 12);
    this.addContent(scoutBg);
    this.addContent(this.add.text(cx + 14, cy + 14, '탐색', {
      fontFamily: FONTS.ui, fontSize: '10px', fontStyle: '700', color: this.getTabMeta('personnel').css,
    }));
    this.addContent(this.add.text(cx + 14, cy + 34, wanderers.length > 0 ? `${wanderers.length}명의 재야 인재 감지` : '재야 인재 수소문', {
      fontFamily: FONTS.title, fontSize: '15px', fontStyle: '700', color: COLORS_CSS.textBright,
      wordWrap: { width: leftW - 28 },
    }));
    this.drawMiniActionPill(cx + 14, cy + 56, noActions ? '행동력 부족' : '수소 집행', {
      width: leftW - 28,
      enabled: !noActions,
      accentColor: this.getTabMeta('personnel').tone,
      onConfirm: () => this.executeAction('search_talent', { cityId: this.cityId }),
    });

    const doctrineBg = this.add.graphics();
    doctrineBg.fillStyle(0x10151d, 0.97);
    doctrineBg.fillRoundedRect(rightX, cy, rightW, boardH, 12);
    doctrineBg.lineStyle(1, this.getTabMeta('personnel').tone, 0.18);
    doctrineBg.strokeRoundedRect(rightX, cy, rightW, boardH, 12);
    this.addContent(doctrineBg);
    this.addContent(this.add.text(rightX + 14, cy + 14, '배치 원칙', {
      fontFamily: FONTS.ui, fontSize: '10px', fontStyle: '700', color: this.getTabMeta('personnel').css,
    }));
    this.addContent(this.add.text(rightX + 14, cy + 34, `주력 ${Math.min(garrison.length, 4)}명 · 빈 거점만 이동`, {
      fontFamily: FONTS.title, fontSize: '15px', fontStyle: '700', color: COLORS_CSS.textBright,
      wordWrap: { width: rightW - 28 },
    }));
    this.addContent(this.add.text(rightX + 14, cy + 56, '핵심 장수는 남기고, 포상과 배치로 다음 턴 지휘 효율을 올립니다.', {
      fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
      wordWrap: { width: rightW - 28 },
    }));

    return cy + boardH + 12;
  }

  // ─── 공통 액션 행 ───
  drawActionRow(cx, cy, cw, {
    title,
    subtitle,
    effect,
    badge,
    cost,
    enabled = true,
    disabledReason,
    onConfirm,
    titleColor,
  }) {
    const alpha = enabled ? 1 : 0.4;
    const rowH = effect ? 60 : subtitle ? 46 : 40;
    const pillText = disabledReason || cost;
    const pillW = Math.max(84, Math.min(132, 28 + pillText.length * 7));
    const actionChipW = 54;
    const chipY = cy + Math.floor((rowH - 22) / 2);
    const badgeW = badge ? Math.max(44, 20 + badge.length * 8) : 0;

    const rowBg = this.add.graphics();
    rowBg.fillStyle(enabled ? 0x10141c : 0x0c1017, 0.95);
    rowBg.fillRoundedRect(cx, cy, cw, rowH, 8);
    rowBg.lineStyle(1, enabled ? this.fc.primary : COLORS.border, enabled ? 0.16 : 0.1);
    rowBg.strokeRoundedRect(cx, cy, cw, rowH, 8);
    this.addContent(rowBg);

    const accentBar = this.add.graphics();
    accentBar.fillStyle(enabled ? this.fc.primary : COLORS.border, enabled ? 0.42 : 0.18);
    accentBar.fillRoundedRect(cx + 8, cy + 8, 4, rowH - 16, 2);
    this.addContent(accentBar);

    const hoverBg = this.add.graphics();
    this.addContent(hoverBg);

    this.addContent(this.add.text(cx + 20, cy + 9, title, {
      fontFamily: FONTS.ui, fontSize: '14px', fontStyle: '700',
      color: titleColor || (enabled ? COLORS_CSS.text : COLORS_CSS.textDim),
    }).setAlpha(alpha));

    const actionChipX = cx + cw - actionChipW - 12;
    const badgeX = badge ? actionChipX - badgeW - 8 : actionChipX;
    const pillX = badge ? badgeX - pillW - 8 : actionChipX - pillW - 8;
    const pillBg = this.add.graphics();
    pillBg.fillStyle(enabled ? this.fc.primary : COLORS.border, enabled ? 0.16 : 0.12);
    pillBg.fillRoundedRect(pillX, chipY, pillW, 22, 11);
    this.addContent(pillBg);

    const costColor = enabled ? COLORS_CSS.accent : COLORS_CSS.textDim;
    this.addContent(this.add.text(pillX + pillW / 2, chipY + 11, pillText, {
      fontFamily: FONTS.ui, fontSize: '10px', fontStyle: '700',
      color: disabledReason ? '#f44336' : costColor,
    }).setOrigin(0.5).setAlpha(alpha));

    if (badge) {
      const badgeBg = this.add.graphics();
      badgeBg.fillStyle(enabled ? this.fc.primary : COLORS.border, enabled ? 0.1 : 0.08);
      badgeBg.fillRoundedRect(badgeX, chipY, badgeW, 22, 11);
      badgeBg.lineStyle(1, enabled ? this.fc.primary : COLORS.border, enabled ? 0.18 : 0.1);
      badgeBg.strokeRoundedRect(badgeX, chipY, badgeW, 22, 11);
      this.addContent(badgeBg);
      this.addContent(this.add.text(badgeX + badgeW / 2, chipY + 11, badge, {
        fontFamily: FONTS.ui, fontSize: '10px', fontStyle: '700',
        color: enabled ? this.fc.css : COLORS_CSS.textDim,
      }).setOrigin(0.5).setAlpha(alpha));
    }

    const actionChip = this.add.graphics();
    actionChip.fillStyle(enabled ? this.fc.primary : COLORS.border, enabled ? 0.24 : 0.12);
    actionChip.fillRoundedRect(actionChipX, chipY, actionChipW, 22, 11);
    this.addContent(actionChip);
    this.addContent(this.add.text(actionChipX + actionChipW / 2, chipY + 11, enabled ? '집행' : '잠김', {
      fontFamily: FONTS.ui, fontSize: '10px', fontStyle: '700',
      color: enabled ? COLORS_CSS.textBright : COLORS_CSS.textDim,
    }).setOrigin(0.5).setAlpha(alpha));

    if (subtitle) {
      this.addContent(this.add.text(cx + 20, cy + 28, subtitle, {
        fontFamily: FONTS.ui, fontSize: '9px', color: COLORS_CSS.textDim,
      }).setAlpha(alpha));
    }

    if (effect) {
      this.addContent(this.add.text(cx + 20, cy + 44, effect, {
        fontFamily: FONTS.ui, fontSize: '9px', color: enabled ? COLORS_CSS.accent : COLORS_CSS.textDim,
      }).setAlpha(alpha));
    }

    if (enabled) {
      const zone = this.add.zone(cx + cw / 2, cy + rowH / 2, cw, rowH)
        .setInteractive({ useHandCursor: true });
      this.addContent(zone);

      zone.on('pointerover', () => {
        hoverBg.clear();
        hoverBg.fillStyle(this.fc.primary, 0.1);
        hoverBg.fillRoundedRect(cx, cy, cw, rowH, 8);
      });
      zone.on('pointerout', () => hoverBg.clear());
      zone.on('pointerdown', () => {
        if (onConfirm) onConfirm();
        else console.log(`[ActionPanel] ${title} (Phase 4에서 engine 연결)`);
      });
    }

    return cy + rowH + 6;
  }

  drawDecisionBanner(cx, cy, cw, { kicker, title, detail }) {
    const tabMeta = this.getTabMeta();
    const detailWidth = Math.min(220, Math.max(140, cw - 220));
    const banner = this.add.graphics();
    banner.fillStyle(0x0f131b, 0.96);
    banner.fillRoundedRect(cx, cy, cw, 56, 8);
    banner.lineStyle(1, tabMeta.tone, 0.2);
    banner.strokeRoundedRect(cx, cy, cw, 56, 8);
    this.addContent(banner);

    this.addContent(this.add.text(cx + 12, cy + 8, kicker, {
      fontFamily: FONTS.ui, fontSize: '10px', fontStyle: '700', color: tabMeta.css,
    }));
    this.addContent(this.add.text(cx + 12, cy + 25, title, {
      fontFamily: FONTS.ui, fontSize: '12px', fontStyle: '700', color: COLORS_CSS.textBright,
    }));
    this.addContent(this.add.text(cx + cw - 12, cy + 20, detail, {
      fontFamily: FONTS.ui, fontSize: '9px', color: COLORS_CSS.textDim,
      wordWrap: { width: detailWidth },
      align: 'right',
    }).setOrigin(1, 0));

    return cy + 68;
  }

  // ─── 유틸 ───
  getRelationStatus(factionId) {
    // Phase 4에서 GameState.isAtWar() 등으로 대체
    const enemies = this.faction?.enemies || [];
    const allies = this.faction?.allies || [];

    if (enemies.includes(factionId)) return { label: '교전 중', actions: '화친 / 위협' };
    if (allies.includes(factionId)) return { label: '동맹', actions: '원병 / 서신' };
    return { label: '중립', actions: '서찰 / 동맹' };
  }

  getInvestmentEffect(trackKey) {
    const effects = {
      agriculture: '식량 생산 기반을 올려 장기전 버팀목을 두껍게 한다',
      commerce: '금 수입 여지를 만들어 다음 명령 선택폭을 넓힌다',
      technology: '병종과 전술 선택지를 앞당기는 축적이다',
      publicOrder: '치안과 충성 이탈 위험을 눌러 후방을 안정시킨다',
    };
    return effects[trackKey] || '거점의 다음 턴 기반을 다진다';
  }

  buildDirective() {
    const roads = this.scenario.mapLayout?.roads || [];
    const neighborIds = roads
      .filter((road) => road.from === this.cityId || road.to === this.cityId)
      .map((road) => (road.from === this.cityId ? road.to : road.from));
    const enemyNeighbors = neighborIds
      .map((id) => this.gameplay?.state?.getCity(id) || this.scenario.cities[id])
      .filter((neighbor) => neighbor && neighbor.owner !== this.factionId);

    if (enemyNeighbors.length > 0 && (this.city.army || 0) >= 25000) {
      return {
        tag: '접경 전선',
        focus: '군사 주공',
        body: `${enemyNeighbors.slice(0, 2).map((neighbor) => neighbor.name).join(' · ')} 방향으로 바로 흔들 수 있습니다.`,
        recommendedLabel: '군사',
      };
    }
    if (enemyNeighbors.length > 0) {
      return {
        tag: '방어선 유지',
        focus: '시정 정비',
        body: `${enemyNeighbors[0].name} 압박이 가까워 먼저 병력과 치안을 손봐야 합니다.`,
        recommendedLabel: '시정',
      };
    }
    return {
      tag: '후방 거점',
      focus: '인재와 병참',
      body: '당장 칼이 닿지 않는 거점입니다. 성장과 장수 정비로 다음 턴을 준비하십시오.',
      recommendedLabel: '인사',
    };
  }

  contentLine(cx, cy, cw) {
    const gfx = this.add.graphics();
    gfx.lineStyle(1, COLORS.border, 0.15);
    gfx.lineBetween(cx, cy, cx + cw, cy);
    this.addContent(gfx);
  }

  addContent(el) {
    this.contentElements.push(el);
    return el;
  }

  clearContent() {
    this.contentElements.forEach(el => el.destroy());
    this.contentElements = [];
  }

  // ─── 엔진 액션 실행 ───
  executeAction(actionType, params) {
    if (!this.gameplay) return;
    const result = this.gameplay.executeAction(actionType, params);
    console.log(`[ActionPanel] ${actionType}:`, result);

    if (result?.success) {
      // 전투 결과 → ActionPanel 닫고 BattleScene 표시
      if (actionType === 'attack' && result.combat) {
        const battleData = {
          combat: result.combat,
          fromCity: result.fromCity,
          toCity: result.toCity,
          captured: result.captured || [],
          oldOwner: result.oldOwner,
          attackerFaction: this.factionId,
          defenderFaction: result.defenderFaction,
          returnCityId: this.cityId,
        };
        this.scene.stop('ActionPanel');
        this.scene.launch('Battle', battleData);
        this.scene.bringToTop('Battle');
        return;
      }

      // 라이브 데이터로 패널 새로고침
      const liveCity = this.gameplay.state.getCity(this.cityId);
      if (liveCity) this.city = liveCity;
      this.scene.restart({ cityId: this.cityId, city: this.city, activeTab: this.activeTab });
    } else {
      this.showResultMessage(result?.reason || '실행 실패');
    }
  }

  showResultMessage(msg) {
    if (this.resultMsg) this.resultMsg.destroy();
    this.resultMsg = this.add.text(
      this.panelX + this.panelW / 2, this.panelY + this.panelH - 24, msg,
      { fontFamily: FONTS.ui, fontSize: '12px', fontStyle: '600', color: '#f44336' },
    ).setOrigin(0.5);
    this.time.delayedCall(2000, () => {
      if (this.resultMsg) this.resultMsg.destroy();
    });
  }

  closePanel() {
    this.strategyMapOverlay?.close();
    this.scene.stop('ActionPanel');
    EventBus.emit(EVENTS.CLOSE_ACTION_PANEL);
  }

  toggleStrategyMapOverlay() {
    const context = `${this.city?.name || '현재 거점'} 기준으로 방면과 수로, 관문 흐름을 함께 봅니다.`;
    this.strategyMapOverlay?.toggle(context);
  }
}
