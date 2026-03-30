import Phaser from 'phaser';
import { COLORS, COLORS_CSS, FONT_STYLES, FONTS, FACTION_COLORS, SPACING, SIZES } from '../utils/Theme.js';
import EventBus, { EVENTS } from '../utils/EventBus.js';
import { CHAR_NAMES } from '../../engine/data/names.js';

/**
 * 명령 패널 씬 — 도시 명령 4탭 모달
 * 시정(政) / 군사(戰) / 외교(盟) / 인사(將)
 */

const TABS = [
  { key: 'government', label: '시정', emblem: '政', desc: '내정 투자, 정책, 건설, 연구' },
  { key: 'military', label: '군사', emblem: '戰', desc: '출진, 징병, 보급' },
  { key: 'diplomacy', label: '외교', emblem: '盟', desc: '동맹, 선전포고, 화친' },
  { key: 'personnel', label: '인사', emblem: '將', desc: '인재 탐색, 등용, 이동, 포상' },
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
  }

  create() {
    const scenario = this.registry.get('scenario');
    const factionId = this.registry.get('selectedFaction');
    if (!scenario || !this.city) return;

    this.scenario = scenario;
    this.factionId = factionId;
    this.faction = scenario.factions[factionId];
    this.fc = FACTION_COLORS[factionId] || FACTION_COLORS.neutral;

    // 엔진 연결 — 라이브 데이터 읽기
    this.gameplay = this.registry.get('gameplay');
    if (this.gameplay) {
      const liveCity = this.gameplay.state.getCity(this.cityId);
      if (liveCity) this.city = liveCity;
    }

    this.isOwned = this.city.owner === factionId;

    // 반투명 배경 (클릭 시 닫기)
    const dimBg = this.add.graphics();
    dimBg.fillStyle(0x000000, 0.55);
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
    this.panelW = 720;
    this.panelH = 620;
    this.panelX = (1600 - this.panelW) / 2;
    this.panelY = (900 - this.panelH) / 2;

    this.drawPanelFrame();
    this.drawTabs();
    this.showTabContent(this.activeTab);

    // ESC로 닫기
    this.input.keyboard.once('keydown-ESC', () => this.closePanel());
  }

  drawPanelFrame() {
    const { panelX: x, panelY: y, panelW: w, panelH: h, fc } = this;

    // 패널 배경
    const bg = this.add.graphics();
    bg.fillStyle(0x0e0e16, 0.97);
    bg.fillRoundedRect(x, y, w, h, 12);
    bg.lineStyle(1, fc.primary, 0.4);
    bg.strokeRoundedRect(x, y, w, h, 12);

    // 상단 색상 바
    bg.fillStyle(fc.primary, 0.6);
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

    // 닫기 버튼
    const closeBtn = this.add.text(x + w - 20, y + 46, '✕ 닫기', {
      fontFamily: FONTS.ui, fontSize: '11px', color: COLORS_CSS.textDim,
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.closePanel());
    closeBtn.on('pointerover', () => closeBtn.setColor(COLORS_CSS.accent));
    closeBtn.on('pointerout', () => closeBtn.setColor(COLORS_CSS.textDim));
  }

  drawTabs() {
    const x = this.panelX;
    const y = this.panelY + 72;
    const tabW = this.panelW / TABS.length;

    // 탭 구분선
    const line = this.add.graphics();
    line.lineStyle(1, COLORS.border, 0.3);
    line.lineBetween(x, y + 44, x + this.panelW, y + 44);

    this.tabElements = [];

    TABS.forEach((tab, i) => {
      const tx = x + i * tabW;
      const isActive = tab.key === this.activeTab;

      // 탭 배경
      const tabBg = this.add.graphics();
      if (isActive) {
        tabBg.fillStyle(this.fc.primary, 0.12);
        tabBg.fillRect(tx, y, tabW, 44);
      }

      // 한자 + 한글
      const emblem = this.add.text(tx + tabW / 2 - 16, y + 10, tab.emblem, {
        fontFamily: FONTS.title, fontSize: '18px', fontStyle: '700',
        color: isActive ? this.fc.css : COLORS_CSS.textDim,
      }).setOrigin(0.5, 0);

      const label = this.add.text(tx + tabW / 2 + 12, y + 14, tab.label, {
        fontFamily: FONTS.ui, fontSize: '13px', fontStyle: isActive ? '700' : '400',
        color: isActive ? COLORS_CSS.textBright : COLORS_CSS.textDim,
      }).setOrigin(0.5, 0);

      // 활성 탭 하단 바
      if (isActive) {
        const bar = this.add.graphics();
        bar.fillStyle(this.fc.primary, 0.8);
        bar.fillRect(tx + 8, y + 41, tabW - 16, 3);
      }

      // 탭 클릭 영역
      const zone = this.add.zone(tx + tabW / 2, y + 22, tabW, 44)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        if (this.activeTab !== tab.key) {
          this.activeTab = tab.key;
          this.scene.restart({ cityId: this.cityId, city: this.city });
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

    switch (tabKey) {
      case 'government': cy = this.drawGovernmentTab(cx, cy, cw); break;
      case 'military': cy = this.drawMilitaryTab(cx, cy, cw); break;
      case 'diplomacy': cy = this.drawDiplomacyTab(cx, cy, cw); break;
      case 'personnel': cy = this.drawPersonnelTab(cx, cy, cw); break;
    }
  }

  // ─── 시정 탭 ───
  drawGovernmentTab(cx, cy, cw) {
    // 4트랙 투자
    const tracks = [
      { key: 'agriculture', label: '농업 투자', icon: '🌾', stat: 'politics' },
      { key: 'commerce', label: '상업 투자', icon: '💰', stat: 'intellect' },
      { key: 'technology', label: '기술 투자', icon: '⚙', stat: 'intellect' },
      { key: 'publicOrder', label: '치안 투자', icon: '🛡', stat: 'charisma' },
    ];

    this.addContent(this.add.text(cx, cy, '내정 투자', {
      ...FONT_STYLES.heading, fontSize: '14px',
    }));
    cy += 24;

    const noActions = (this.gameplay?.actionsRemaining ?? 0) <= 0;

    tracks.forEach(t => {
      const val = this.city[t.key] || 0;
      const canDo = val < 100 && !noActions;
      cy = this.drawActionRow(cx, cy, cw, {
        title: t.label,
        subtitle: `현재 ${val}/100`,
        cost: '금 500 · 행동력 1',
        enabled: canDo,
        disabledReason: val >= 100 ? '최대' : noActions ? '행동력 부족' : null,
        onConfirm: () => this.executeAction('invest', { cityId: this.cityId, track: t.key }),
      });
    });

    // 구분선
    cy += 8;
    this.contentLine(cx, cy, cw);
    cy += 12;

    // 방어 보강
    cy = this.drawActionRow(cx, cy, cw, {
      title: '성벽 보강',
      subtitle: `방어력 ${this.city.defense || 0}/100`,
      cost: '금 500 · 행동력 1',
      enabled: (this.city.defense || 0) < 100,
    });

    // 군량 매매
    cy += 8;
    this.contentLine(cx, cy, cw);
    cy += 12;

    this.addContent(this.add.text(cx, cy, '군량 매매', {
      ...FONT_STYLES.heading, fontSize: '14px',
    }));
    cy += 24;

    cy = this.drawActionRow(cx, cy, cw, {
      title: '군량 매입',
      subtitle: `식량 +2000`,
      cost: '금 800',
      enabled: true,
    });

    cy = this.drawActionRow(cx, cy, cw, {
      title: '군량 매각',
      subtitle: `식량 -2000`,
      cost: '금 +600',
      enabled: (this.city.food || 0) >= 2000,
    });

    return cy;
  }

  // ─── 군사 탭 ───
  drawMilitaryTab(cx, cy, cw) {
    this.addContent(this.add.text(cx, cy, '병력 징병', {
      ...FONT_STYLES.heading, fontSize: '14px',
    }));
    cy += 24;

    const pop = this.city.population || 0;
    const recruits = Math.floor(pop * 0.05);

    const noActionsM = (this.gameplay?.actionsRemaining ?? 0) <= 0;
    cy = this.drawActionRow(cx, cy, cw, {
      title: '징병',
      subtitle: `예상 ${recruits.toLocaleString()}명 충원`,
      cost: '금 1000 · 식량 500 · 행동력 1',
      enabled: pop >= 5000 && !noActionsM,
      disabledReason: pop < 5000 ? '인구 부족' : noActionsM ? '행동력 부족' : null,
      onConfirm: () => this.executeAction('conscript', { cityId: this.cityId }),
    });

    cy += 8;
    this.contentLine(cx, cy, cw);
    cy += 12;

    // 출진 (인접 적 도시)
    this.addContent(this.add.text(cx, cy, '출진', {
      ...FONT_STYLES.heading, fontSize: '14px',
    }));
    cy += 24;

    const roads = this.scenario.mapLayout?.roads || [];
    const neighbors = roads
      .filter(r => r.from === this.cityId || r.to === this.cityId)
      .map(r => r.from === this.cityId ? r.to : r.from)
      .filter(id => this.scenario.cities[id] && this.scenario.cities[id].owner !== this.factionId);

    if (neighbors.length === 0) {
      this.addContent(this.add.text(cx, cy, '인접 적 도시 없음', {
        ...FONT_STYLES.bodyDim, fontSize: '12px',
      }));
      cy += 24;
    } else {
      neighbors.slice(0, 4).forEach(nid => {
        const nc = this.gameplay?.state?.getCity(nid) || this.scenario.cities[nid];
        const nfc = FACTION_COLORS[nc.owner] || FACTION_COLORS.neutral;
        cy = this.drawActionRow(cx, cy, cw, {
          title: `${nc.name} 공격`,
          subtitle: `적 병력 ${(nc.army || 0).toLocaleString()} · 방어 ${nc.defense || 0}`,
          cost: '행동력 1',
          enabled: (this.city.army || 0) >= 1000 && !noActionsM,
          disabledReason: noActionsM ? '행동력 부족' : null,
          titleColor: nfc.css,
          onConfirm: () => this.executeAction('attack', { fromCityId: this.cityId, toCityId: nid }),
        });
      });
    }

    cy += 8;
    this.contentLine(cx, cy, cw);
    cy += 12;

    // 보급
    this.addContent(this.add.text(cx, cy, '보급선', {
      ...FONT_STYLES.heading, fontSize: '14px',
    }));
    cy += 24;

    const allyNeighbors = roads
      .filter(r => r.from === this.cityId || r.to === this.cityId)
      .map(r => r.from === this.cityId ? r.to : r.from)
      .filter(id => this.scenario.cities[id] && this.scenario.cities[id].owner === this.factionId && id !== this.cityId);

    if (allyNeighbors.length === 0) {
      this.addContent(this.add.text(cx, cy, '인접 아군 도시 없음', {
        ...FONT_STYLES.bodyDim, fontSize: '12px',
      }));
      cy += 24;
    } else {
      allyNeighbors.slice(0, 3).forEach(nid => {
        const nc = this.scenario.cities[nid];
        cy = this.drawActionRow(cx, cy, cw, {
          title: `→ ${nc.name} 병력 이동`,
          subtitle: `현재 ${(nc.army || 0).toLocaleString()}명`,
          cost: '행동력 1',
          enabled: (this.city.army || 0) >= 2000,
        });
      });
    }

    return cy;
  }

  // ─── 외교 탭 ───
  drawDiplomacyTab(cx, cy, cw) {
    this.addContent(this.add.text(cx, cy, '외교 관계', {
      ...FONT_STYLES.heading, fontSize: '14px',
    }));
    cy += 24;

    const otherFactions = Object.entries(this.scenario.factions)
      .filter(([id]) => id !== this.factionId && this.scenario.factions[id].active !== false);

    otherFactions.forEach(([fid, f]) => {
      const ffc = FACTION_COLORS[fid] || FACTION_COLORS.neutral;
      const relation = this.getRelationStatus(fid);

      cy = this.drawActionRow(cx, cy, cw, {
        title: f.name,
        subtitle: relation.label,
        cost: relation.actions,
        enabled: true,
        titleColor: ffc.css,
      });
    });

    return cy;
  }

  // ─── 인사 탭 ───
  drawPersonnelTab(cx, cy, cw) {
    // 인재 탐색
    this.addContent(this.add.text(cx, cy, '인재 탐색', {
      ...FONT_STYLES.heading, fontSize: '14px',
    }));
    cy += 24;

    const chars = this.gameplay?.state?.characters || this.scenario.characters;
    const noActionsP = (this.gameplay?.actionsRemaining ?? 0) <= 0;
    const wanderers = Object.entries(chars)
      .filter(([, c]) => c.city === this.cityId && (!c.faction || c.status === 'wandering') && c.alive !== false);

    cy = this.drawActionRow(cx, cy, cw, {
      title: '인재 수소문',
      subtitle: wanderers.length > 0 ? `${wanderers.length}명의 재야 인재 감지` : '재야 인재 탐색',
      cost: '행동력 1',
      enabled: !noActionsP,
      disabledReason: noActionsP ? '행동력 부족' : null,
      onConfirm: () => this.executeAction('search_talent', { cityId: this.cityId }),
    });

    cy += 8;
    this.contentLine(cx, cy, cw);
    cy += 12;

    // 장수 이동
    this.addContent(this.add.text(cx, cy, '장수 관리', {
      ...FONT_STYLES.heading, fontSize: '14px',
    }));
    cy += 24;

    const garrison = Object.entries(chars)
      .filter(([, c]) => c.city === this.cityId && c.faction === this.factionId && c.alive !== false)
      .map(([id, c]) => ({ id, ...c }))
      .slice(0, 5);

    garrison.forEach(char => {
      const s = char.stats || {};
      const isLeader = this.faction?.leader === char.id;

      cy = this.drawActionRow(cx, cy, cw, {
        title: CHAR_NAMES[char.id] || char.id,
        subtitle: `통${s.command || 0} 무${s.war || 0} 지${s.intellect || 0} 정${s.politics || 0} 매${s.charisma || 0} · 충${Math.round(char.loyalty || 0)}`,
        cost: isLeader ? '군주' : '이동/포상',
        enabled: !isLeader,
      });
    });

    // 포로
    const captives = Object.entries(chars)
      .filter(([, c]) => c.city === this.cityId && c.status === 'captive' && c.capturedBy === this.factionId);

    if (captives.length > 0) {
      cy += 8;
      this.contentLine(cx, cy, cw);
      cy += 12;

      this.addContent(this.add.text(cx, cy, `포로 (${captives.length}명)`, {
        ...FONT_STYLES.heading, fontSize: '14px',
      }));
      cy += 24;

      captives.slice(0, 3).forEach(([id, c]) => {
        cy = this.drawActionRow(cx, cy, cw, {
          title: `⛓ ${CHAR_NAMES[id] || id}`,
          subtitle: `설득 / 석방 / 처형`,
          cost: '행동력 1',
          enabled: true,
        });
      });
    }

    return cy;
  }

  // ─── 공통 액션 행 ───
  drawActionRow(cx, cy, cw, { title, subtitle, cost, enabled = true, disabledReason, onConfirm, titleColor }) {
    const alpha = enabled ? 1 : 0.4;

    // 배경 (호버용)
    const rowBg = this.add.graphics();
    this.addContent(rowBg);

    // 제목
    this.addContent(this.add.text(cx + 4, cy, title, {
      fontFamily: FONTS.ui, fontSize: '13px', fontStyle: '600',
      color: titleColor || (enabled ? COLORS_CSS.text : COLORS_CSS.textDim),
    }).setAlpha(alpha));

    // 비용 (우측)
    const costColor = enabled ? COLORS_CSS.accent : COLORS_CSS.textDim;
    this.addContent(this.add.text(cx + cw, cy, disabledReason || cost, {
      fontFamily: FONTS.ui, fontSize: '10px',
      color: disabledReason ? '#f44336' : costColor,
    }).setOrigin(1, 0).setAlpha(alpha));

    // 부제
    if (subtitle) {
      this.addContent(this.add.text(cx + 4, cy + 17, subtitle, {
        fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
      }).setAlpha(alpha));
    }

    // 호버/클릭 영역
    if (enabled) {
      const zone = this.add.zone(cx + cw / 2, cy + 14, cw, 34)
        .setInteractive({ useHandCursor: true });
      this.addContent(zone);

      zone.on('pointerover', () => {
        rowBg.clear();
        rowBg.fillStyle(COLORS.bgHover, 0.5);
        rowBg.fillRoundedRect(cx, cy - 2, cw, 34, 4);
      });
      zone.on('pointerout', () => rowBg.clear());
      zone.on('pointerdown', () => {
        if (onConfirm) onConfirm();
        else console.log(`[ActionPanel] ${title} (Phase 4에서 engine 연결)`);
      });
    }

    return cy + 36;
  }

  // ─── 유틸 ───
  getRelationStatus(factionId) {
    // Phase 4에서 GameState.isAtWar() 등으로 대체
    const f = this.scenario.factions[factionId];
    const enemies = this.faction?.enemies || [];
    const allies = this.faction?.allies || [];

    if (enemies.includes(factionId)) return { label: '교전 중', actions: '화친 제안' };
    if (allies.includes(factionId)) return { label: '동맹', actions: '동맹 파기' };
    return { label: '중립', actions: '동맹 / 선전포고' };
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
      this.scene.restart({ cityId: this.cityId, city: this.city });
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
    this.scene.stop('ActionPanel');
    EventBus.emit(EVENTS.CLOSE_ACTION_PANEL);
  }
}
