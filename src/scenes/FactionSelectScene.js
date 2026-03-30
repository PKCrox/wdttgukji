import Phaser from 'phaser';
import { COLORS, COLORS_CSS, FONT_STYLES, FONTS, FACTION_COLORS, SPACING } from '../utils/Theme.js';
import EventBus, { EVENTS } from '../utils/EventBus.js';
import { CHAR_NAMES } from '../../engine/data/names.js';

export default class FactionSelectScene extends Phaser.Scene {
  constructor() {
    super('FactionSelect');
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.fadeIn(400, 10, 10, 15);

    // 배경
    this.add.graphics().fillStyle(COLORS.bg, 1).fillRect(0, 0, width, height);

    // 타이틀
    this.add.text(width / 2, 60, '세력을 선택하라', {
      fontFamily: FONTS.title,
      fontSize: '32px',
      fontStyle: '700',
      color: COLORS_CSS.accent,
    }).setOrigin(0.5);

    this.add.text(width / 2, 95, '208년 적벽대전 — 5세력이 뒤엉킨 난세', {
      ...FONT_STYLES.bodyDim,
    }).setOrigin(0.5);

    // 시나리오 데이터 로드
    const scenario = this.cache.json.get('scenario-208');
    if (!scenario) {
      this.add.text(width / 2, height / 2, '시나리오 로드 실패', FONT_STYLES.body).setOrigin(0.5);
      return;
    }

    // 세력 카드 생성
    const factionIds = Object.keys(scenario.factions).filter(id => scenario.factions[id].active !== false);
    const cardWidth = 240;
    const cardHeight = 340;
    const gap = 20;
    const totalWidth = factionIds.length * (cardWidth + gap) - gap;
    const startX = (width - totalWidth) / 2 + cardWidth / 2;
    const cardY = height * 0.45;

    factionIds.forEach((factionId, i) => {
      const faction = scenario.factions[factionId];
      const x = startX + i * (cardWidth + gap);
      this.createFactionCard(x, cardY, cardWidth, cardHeight, factionId, faction, scenario);
    });

    // 뒤로가기
    const backText = this.add.text(40, height - 40, '← 메인 메뉴', {
      ...FONT_STYLES.body,
      color: COLORS_CSS.textDim,
    }).setInteractive({ useHandCursor: true });
    backText.on('pointerdown', () => {
      this.cameras.main.fadeOut(300, 10, 10, 15);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('MainMenu');
      });
    });
    backText.on('pointerover', () => backText.setColor(COLORS_CSS.accent));
    backText.on('pointerout', () => backText.setColor(COLORS_CSS.textDim));
  }

  createFactionCard(x, y, w, h, factionId, faction, scenario) {
    const fc = FACTION_COLORS[factionId] || FACTION_COLORS.neutral;
    const container = this.add.container(x, y);

    // 카드 배경
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.bgPanel, 0.95);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    bg.lineStyle(2, fc.primary, 0.4);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);

    // 세력 색상 상단 바
    const topBar = this.add.graphics();
    topBar.fillStyle(fc.primary, 0.8);
    topBar.fillRoundedRect(-w / 2, -h / 2, w, 6, { tl: 10, tr: 10 });

    // 세력명
    const nameText = this.add.text(0, -h / 2 + 30, faction.name, {
      fontFamily: FONTS.title,
      fontSize: '24px',
      fontStyle: '700',
      color: fc.css,
    }).setOrigin(0.5);

    // 군주명
    const leaderName = this.getCharacterName(faction.leader);
    const leaderText = this.add.text(0, -h / 2 + 60, `군주: ${leaderName}`, {
      ...FONT_STYLES.body,
      color: COLORS_CSS.textDim,
    }).setOrigin(0.5);

    // 도시 수, 병력
    const cities = Object.values(scenario.cities).filter(c => c.owner === factionId);
    const totalArmy = cities.reduce((sum, c) => sum + (c.army || 0), 0);
    const chars = Object.values(scenario.characters).filter(c => c.faction === factionId);

    const statsY = -h / 2 + 100;
    const statsStyle = { ...FONT_STYLES.bodyDim, fontSize: '13px' };
    const statsText = this.add.text(0, statsY, `도시 ${cities.length} · 병력 ${(totalArmy / 1000).toFixed(0)}k · 장수 ${chars.length}`, statsStyle).setOrigin(0.5);

    // 도시 목록
    const cityNames = cities.map(c => c.name).slice(0, 5).join(', ');
    const cityText = this.add.text(0, statsY + 25, cityNames, {
      ...FONT_STYLES.bodyDim,
      fontSize: '11px',
      wordWrap: { width: w - 30 },
      align: 'center',
    }).setOrigin(0.5);

    // 골드
    const goldText = this.add.text(0, statsY + 55, `금 ${faction.gold?.toLocaleString() || 0}`, {
      ...FONT_STYLES.label,
      color: COLORS_CSS.accent,
    }).setOrigin(0.5);

    // "선택" 버튼
    const btnY = h / 2 - 40;
    const btnBg = this.add.graphics();
    btnBg.fillStyle(fc.primary, 0.8);
    btnBg.fillRoundedRect(-80, btnY - 18, 160, 36, 6);
    const btnLabel = this.add.text(0, btnY, '이 세력으로', {
      fontFamily: FONTS.ui,
      fontSize: '14px',
      fontStyle: '700',
      color: '#000000',
    }).setOrigin(0.5);

    container.add([bg, topBar, nameText, leaderText, statsText, cityText, goldText, btnBg, btnLabel]);

    // 인터랙션
    const hitZone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });

    hitZone.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(COLORS.bgHover, 0.95);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
      bg.lineStyle(2, fc.primary, 0.8);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    });

    hitZone.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(COLORS.bgPanel, 0.95);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
      bg.lineStyle(2, fc.primary, 0.4);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    });

    hitZone.on('pointerdown', () => {
      // 세력 선택 → registry에 저장 → WorldMap 시작
      this.registry.set('selectedFaction', factionId);
      this.registry.set('scenario', this.cache.json.get('scenario-208'));
      this.registry.set('allEvents', this.cache.json.get('all-events'));

      this.cameras.main.fadeOut(500, 10, 10, 15);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('WorldMap');
      });
    });
  }

  getCharacterName(charId) {
    return CHAR_NAMES[charId] || charId;
  }
}
