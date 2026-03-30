import Phaser from 'phaser';
import { COLORS, COLORS_CSS, FONT_STYLES, FONTS, FACTION_COLORS } from '../utils/Theme.js';
import { CHAR_NAMES } from '../../engine/data/names.js';

export default class FactionSelectScene extends Phaser.Scene {
  constructor() {
    super('FactionSelect');
    this.previewElements = {};
    this.previewFactionId = null;
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.fadeIn(400, 10, 10, 15);

    // 배경
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x17120f, 0x17131c, 0x090a10, 0x090a10, 1);
    bg.fillRect(0, 0, width, height);

    if (this.textures.exists('map-base')) {
      this.add.image(width / 2, height / 2, 'map-base')
        .setDisplaySize(width * 0.94, height * 0.84)
        .setAlpha(0.16);
    }

    const frame = this.add.graphics();
    frame.fillStyle(0x0c1018, 0.86);
    frame.fillRoundedRect(72, 102, width - 144, 776, 20);
    frame.lineStyle(1, COLORS.accent, 0.18);
    frame.strokeRoundedRect(72, 102, width - 144, 776, 20);

    const headerStrip = this.add.graphics();
    headerStrip.fillStyle(0x101621, 0.96);
    headerStrip.fillRoundedRect(110, 146, width - 220, 104, 16);
    headerStrip.lineStyle(1, COLORS.border, 0.18);
    headerStrip.strokeRoundedRect(110, 146, width - 220, 104, 16);

    // 타이틀
    this.add.text(width / 2, 62, '누구의 깃발을 들 것인가', {
      fontFamily: FONTS.title,
      fontSize: '34px',
      fontStyle: '700',
      color: COLORS_CSS.accent,
    }).setOrigin(0.5);

    this.add.text(width / 2, 96, '208년 적벽대전 · 첫 세 턴의 결심이 세력마다 전혀 다르다', {
      ...FONT_STYLES.bodyDim, color: '#b9c0d0',
    }).setOrigin(0.5);

    // 시나리오 데이터 로드
    const scenario = this.cache.json.get('scenario-208');
    if (!scenario) {
      this.add.text(width / 2, height / 2, '시나리오 로드 실패', FONT_STYLES.body).setOrigin(0.5);
      return;
    }

    this.scenario = scenario;

    this.add.text(132, 164, '전장 브리프', {
      fontFamily: FONTS.ui,
      fontSize: '11px',
      fontStyle: '700',
      color: COLORS_CSS.accent,
    });
    this.add.text(132, 188, '적벽은 같은 방식으로 시작하지 않는다', {
      fontFamily: FONTS.title,
      fontSize: '28px',
      fontStyle: '700',
      color: COLORS_CSS.textBright,
    });
    this.add.text(132, 220, '위는 남하 압박, 촉은 연대 생존, 오는 결전 준비다. 익주와 한중은 더 느린 생존전을 치른다.', {
      fontFamily: FONTS.ui,
      fontSize: '12px',
      color: COLORS_CSS.textDim,
      wordWrap: { width: width - 360 },
    });
    this.add.text(width - 132, 176, '주역 3세력 + 주변 2세력', {
      fontFamily: FONTS.ui,
      fontSize: '12px',
      fontStyle: '700',
      color: COLORS_CSS.textDim,
    }).setOrigin(1, 0);
    this.add.text(width - 132, 202, 'hover로 첫 3턴 책략을 먼저 본다', {
      fontFamily: FONTS.ui,
      fontSize: '11px',
      color: COLORS_CSS.textDim,
    }).setOrigin(1, 0);

    const majorRow = ['wei', 'shu', 'wu'];
    const supportRow = ['liu_zhang', 'zhang_lu'];
    const defaultPreviewFaction = scenario.playerFaction || majorRow[1];
    this.createPreviewBoard(width / 2, 332, width - 216, 170, defaultPreviewFaction);

    const majorWidth = 288;
    const majorHeight = 246;
    const majorGap = 18;
    const majorStartX = (width - (majorRow.length * majorWidth + (majorRow.length - 1) * majorGap)) / 2 + majorWidth / 2;
    const majorY = 560;
    majorRow.forEach((factionId, index) => {
      const faction = scenario.factions[factionId];
      const x = majorStartX + index * (majorWidth + majorGap);
      this.createFactionCard(x, majorY, majorWidth, majorHeight, factionId, faction, scenario, { tier: 'major' });
    });

    const supportTitleY = 704;
    this.add.text(width / 2, supportTitleY, '주변 세력', {
      fontFamily: FONTS.ui,
      fontSize: '10px',
      fontStyle: '700',
      color: COLORS_CSS.textDim,
      letterSpacing: 2,
    }).setOrigin(0.5);
    const supportDivider = this.add.graphics();
    supportDivider.lineStyle(1, COLORS.border, 0.14);
    supportDivider.lineBetween(134, supportTitleY + 14, width - 134, supportTitleY + 14);

    const supportWidth = 338;
    const supportHeight = 118;
    const supportGap = 28;
    const supportCenterX = width / 2;
    const supportOffset = (supportWidth + supportGap) / 2;
    const supportY = 782;
    supportRow.forEach((factionId, index) => {
      const faction = scenario.factions[factionId];
      const x = supportCenterX + (index === 0 ? -supportOffset : supportOffset);
      this.createFactionCard(x, supportY, supportWidth, supportHeight, factionId, faction, scenario, { tier: 'support' });
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

  createPreviewBoard(x, y, w, h, factionId) {
    this.previewBounds = { x: x - w / 2, y: y - h / 2, w, h };
    this.previewBg = this.add.graphics();
    this.previewAccent = this.add.graphics();

    this.previewElements.kicker = this.add.text(this.previewBounds.x + 22, this.previewBounds.y + 20, '', {
      fontFamily: FONTS.ui,
      fontSize: '11px',
      fontStyle: '700',
      color: COLORS_CSS.textDim,
    });
    this.previewElements.name = this.add.text(this.previewBounds.x + 22, this.previewBounds.y + 42, '', {
      fontFamily: FONTS.title,
      fontSize: '30px',
      fontStyle: '700',
      color: COLORS_CSS.textBright,
    });
    this.previewElements.leader = this.add.text(this.previewBounds.x + 24, this.previewBounds.y + 78, '', {
      fontFamily: FONTS.ui,
      fontSize: '12px',
      color: COLORS_CSS.textDim,
    });
    this.previewElements.stats = this.add.text(this.previewBounds.x + w - 22, this.previewBounds.y + 28, '', {
      fontFamily: FONTS.ui,
      fontSize: '12px',
      fontStyle: '700',
      color: COLORS_CSS.textBright,
      align: 'right',
    }).setOrigin(1, 0);
    this.previewElements.openingLabel = this.add.text(this.previewBounds.x + 22, this.previewBounds.y + 112, '첫 3턴 운영', {
      fontFamily: FONTS.ui,
      fontSize: '10px',
      fontStyle: '700',
      color: COLORS_CSS.textDim,
    });
    this.previewElements.opening = this.add.text(this.previewBounds.x + 22, this.previewBounds.y + 130, '', {
      fontFamily: FONTS.ui,
      fontSize: '14px',
      fontStyle: '700',
      color: COLORS_CSS.textBright,
      wordWrap: { width: w - 300 },
    });
    this.previewElements.riskLabel = this.add.text(this.previewBounds.x + w - 248, this.previewBounds.y + 112, '리스크', {
      fontFamily: FONTS.ui,
      fontSize: '10px',
      fontStyle: '700',
      color: COLORS_CSS.textDim,
    });
    this.previewElements.risk = this.add.text(this.previewBounds.x + w - 248, this.previewBounds.y + 130, '', {
      fontFamily: FONTS.ui,
      fontSize: '12px',
      color: COLORS_CSS.textDim,
      wordWrap: { width: 226 },
    });
    this.previewElements.citiesLabel = this.add.text(this.previewBounds.x + w - 248, this.previewBounds.y + 64, '주요 거점', {
      fontFamily: FONTS.ui,
      fontSize: '10px',
      fontStyle: '700',
      color: COLORS_CSS.textDim,
    });
    this.previewElements.cities = this.add.text(this.previewBounds.x + w - 248, this.previewBounds.y + 82, '', {
      fontFamily: FONTS.ui,
      fontSize: '12px',
      fontStyle: '700',
      color: COLORS_CSS.textBright,
      wordWrap: { width: 226 },
    });

    this.updatePreviewBoard(factionId);
  }

  updatePreviewBoard(factionId) {
    const faction = this.scenario.factions[factionId];
    if (!faction) return;

    const brief = this.getFactionBrief(factionId, this.scenario);
    const fc = FACTION_COLORS[factionId] || FACTION_COLORS.neutral;
    const cities = Object.values(this.scenario.cities).filter((city) => city.owner === factionId);
    const totalArmy = cities.reduce((sum, city) => sum + (city.army || 0), 0);
    const chars = Object.values(this.scenario.characters).filter((char) => char.faction === factionId);

    this.previewFactionId = factionId;

    this.previewBg.clear();
    this.previewBg.fillStyle(0x0f141d, 0.94);
    this.previewBg.fillRoundedRect(this.previewBounds.x, this.previewBounds.y, this.previewBounds.w, this.previewBounds.h, 18);
    this.previewBg.lineStyle(1, fc.primary, 0.24);
    this.previewBg.strokeRoundedRect(this.previewBounds.x, this.previewBounds.y, this.previewBounds.w, this.previewBounds.h, 18);

    this.previewAccent.clear();
    this.previewAccent.fillStyle(fc.primary, 0.2);
    this.previewAccent.fillRoundedRect(this.previewBounds.x + 18, this.previewBounds.y + 18, this.previewBounds.w - 36, 32, 14);
    this.previewAccent.fillStyle(fc.primary, 0.78);
    this.previewAccent.fillRoundedRect(this.previewBounds.x + 18, this.previewBounds.y + 18, 88, 32, 14);

    this.previewElements.kicker.setText(brief.kicker).setColor('#000000');
    this.previewElements.name.setText(faction.name).setColor(fc.css);
    this.previewElements.leader.setText(`군주 · ${this.getCharacterName(faction.leader)}`);
    this.previewElements.stats.setText(`도시 ${cities.length} · 병력 ${(totalArmy / 1000).toFixed(0)}k · 장수 ${chars.length}`);
    this.previewElements.opening.setText(brief.opening);
    this.previewElements.risk.setText(brief.risk);
    this.previewElements.cities.setText(brief.anchors);
  }

  createFactionCard(x, y, w, h, factionId, faction, scenario, { tier = 'major' } = {}) {
    const fc = FACTION_COLORS[factionId] || FACTION_COLORS.neutral;
    const container = this.add.container(x, y);
    const brief = this.getFactionBrief(factionId, scenario);
    const isSupport = tier === 'support';
    const cities = Object.values(scenario.cities).filter((c) => c.owner === factionId);
    const totalArmy = cities.reduce((sum, c) => sum + (c.army || 0), 0);
    const chars = Object.values(scenario.characters).filter((c) => c.faction === factionId);
    const leaderName = this.getCharacterName(faction.leader);
    const left = -w / 2 + 18;
    const right = w / 2 - 18;

    const bg = this.add.graphics();
    bg.fillStyle(0x10141d, 0.96);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    bg.lineStyle(1, fc.primary, 0.4);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);

    const topBar = this.add.graphics();
    topBar.fillStyle(fc.primary, 0.8);
    topBar.fillRoundedRect(-w / 2, -h / 2, w, 6, { tl: 12, tr: 12 });

    const content = [bg, topBar];

    if (isSupport) {
      const chip = this.add.graphics();
      chip.fillStyle(fc.badgeDark || COLORS.bgHover, 0.94);
      chip.fillRoundedRect(left, -h / 2 + 16, 86, 22, 11);
      const kickerText = this.add.text(left + 43, -h / 2 + 27, brief.kicker, {
        fontFamily: FONTS.ui,
        fontSize: '10px',
        fontStyle: '700',
        color: fc.css,
      }).setOrigin(0.5);
      const nameText = this.add.text(left, -h / 2 + 48, faction.name, {
        fontFamily: FONTS.title,
        fontSize: '22px',
        fontStyle: '700',
        color: fc.css,
      });
      const leaderText = this.add.text(left, -h / 2 + 74, `군주 · ${leaderName}`, {
        fontFamily: FONTS.ui,
        fontSize: '11px',
        color: COLORS_CSS.textDim,
      });
      const statsText = this.add.text(right, -h / 2 + 20, `도시 ${cities.length} · 병력 ${(totalArmy / 1000).toFixed(0)}k`, {
        fontFamily: FONTS.ui,
        fontSize: '11px',
        fontStyle: '700',
        color: COLORS_CSS.textBright,
        align: 'right',
      }).setOrigin(1, 0);
      const anchorText = this.add.text(left, -h / 2 + 98, `${brief.anchors} · ${brief.opening}`, {
        fontFamily: FONTS.ui,
        fontSize: '11px',
        color: COLORS_CSS.textBright,
        wordWrap: { width: w - 170 },
      });
      const riskText = this.add.text(right, -h / 2 + 78, `경계 · ${brief.risk}`, {
        fontFamily: FONTS.ui,
        fontSize: '10px',
        color: COLORS_CSS.textDim,
        wordWrap: { width: 132 },
        align: 'right',
      }).setOrigin(1, 0);
      const btnBg = this.add.graphics();
      btnBg.fillStyle(fc.primary, 0.82);
      btnBg.fillRoundedRect(w / 2 - 150, h / 2 - 42, 132, 30, 8);
      const btnLabel = this.add.text(w / 2 - 84, h / 2 - 27, '이 세력으로 간다', {
        fontFamily: FONTS.ui,
        fontSize: '11px',
        fontStyle: '700',
        color: '#000000',
      }).setOrigin(0.5);
      content.push(chip, kickerText, nameText, leaderText, statsText, anchorText, riskText, btnBg, btnLabel);
    } else {
      const kickerText = this.add.text(left, -h / 2 + 16, brief.kicker, {
        fontFamily: FONTS.ui,
        fontSize: '10px',
        fontStyle: '700',
        color: fc.css,
      });
      const nameText = this.add.text(left, -h / 2 + 36, faction.name, {
        fontFamily: FONTS.title,
        fontSize: '30px',
        fontStyle: '700',
        color: fc.css,
      });
      const leaderText = this.add.text(left, -h / 2 + 72, `군주 · ${leaderName}`, {
        fontFamily: FONTS.ui,
        fontSize: '12px',
        color: COLORS_CSS.textDim,
      });
      const statsText = this.add.text(right, -h / 2 + 18, `도시 ${cities.length} · 병력 ${(totalArmy / 1000).toFixed(0)}k · 장수 ${chars.length}`, {
        fontFamily: FONTS.ui,
        fontSize: '11px',
        fontStyle: '700',
        color: COLORS_CSS.textBright,
        align: 'right',
      }).setOrigin(1, 0);
      const anchorText = this.add.text(left, -h / 2 + 100, `거점 · ${brief.anchors}`, {
        fontFamily: FONTS.ui,
        fontSize: '10px',
        color: COLORS_CSS.textDim,
        wordWrap: { width: w - 36 },
      });

      const openingCard = this.add.graphics();
      openingCard.fillStyle(0x141b28, 0.94);
      openingCard.fillRoundedRect(left, -h / 2 + 126, w - 36, 56, 10);
      openingCard.lineStyle(1, COLORS.border, 0.14);
      openingCard.strokeRoundedRect(left, -h / 2 + 126, w - 36, 56, 10);
      const openingLabel = this.add.text(left + 12, -h / 2 + 138, '첫 세 턴 성격', {
        fontFamily: FONTS.ui,
        fontSize: '10px',
        fontStyle: '700',
        color: fc.css,
      });
      const openingText = this.add.text(left + 12, -h / 2 + 156, brief.opening, {
        fontFamily: FONTS.ui,
        fontSize: '12px',
        fontStyle: '700',
        color: COLORS_CSS.textBright,
        wordWrap: { width: w - 60 },
      });

      const riskChip = this.add.graphics();
      riskChip.fillStyle(0x0f141d, 0.94);
      riskChip.fillRoundedRect(left, h / 2 - 56, w - 36, 26, 13);
      riskChip.lineStyle(1, COLORS.border, 0.14);
      riskChip.strokeRoundedRect(left, h / 2 - 56, w - 36, 26, 13);
      const riskText = this.add.text(left + 12, h / 2 - 43, `리스크 · ${brief.risk}`, {
        fontFamily: FONTS.ui,
        fontSize: '10px',
        color: COLORS_CSS.textDim,
      });

      const btnBg = this.add.graphics();
      btnBg.fillStyle(fc.primary, 0.82);
      btnBg.fillRoundedRect(-76, h / 2 - 24, 152, 32, 8);
      const btnLabel = this.add.text(0, h / 2 - 8, '이 깃발을 든다', {
        fontFamily: FONTS.ui,
        fontSize: '12px',
        fontStyle: '700',
        color: '#000000',
      }).setOrigin(0.5);

      content.push(
        kickerText,
        nameText,
        leaderText,
        statsText,
        anchorText,
        openingCard,
        openingLabel,
        openingText,
        riskChip,
        riskText,
        btnBg,
        btnLabel,
      );
    }

    container.add(content);

    // 인터랙션
    const hitZone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });

    hitZone.on('pointerover', () => {
      this.updatePreviewBoard(factionId);
      bg.clear();
      bg.fillStyle(COLORS.bgHover, 0.97);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
      bg.lineStyle(2, fc.primary, 0.82);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
      container.setScale(isSupport ? 1.015 : 1.02);
    });

    hitZone.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(0x10141d, 0.96);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
      bg.lineStyle(1, fc.primary, 0.4);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
      container.setScale(1);
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

  getFactionBrief(factionId, scenario) {
    const cityNames = Object.values(scenario.cities)
      .filter((city) => city.owner === factionId)
      .map((city) => city.name);

    switch (factionId) {
      case 'wei':
        return {
          kicker: '북방 주공',
          anchors: cityNames.slice(0, 2).join(' · '),
          opening: '남하 주공을 한 축으로 모은다',
          risk: '전선을 넓히면 병참이 바로 늘어진다.',
        };
      case 'shu':
        return {
          kicker: '연대 생존',
          anchors: cityNames.slice(0, 2).join(' · '),
          opening: '형주를 버티며 적벽 연대를 세운다',
          risk: '정면전을 서두르면 병력과 병량이 먼저 마른다.',
        };
      case 'wu':
        return {
          kicker: '결전 준비',
          anchors: cityNames.slice(0, 2).join(' · '),
          opening: '강동 결전의 조건을 먼저 갖춘다',
          risk: '준비 없이 뛰면 장강의 이점이 사라진다.',
        };
      case 'liu_zhang':
        return {
          kicker: '익주 수비',
          anchors: cityNames.slice(0, 2).join(' · '),
          opening: '후방을 닫고 시간을 번다',
          risk: '너무 움츠리면 인재와 외교도 같이 굳는다.',
        };
      case 'zhang_lu':
      default:
        return {
          kicker: '한중 보존',
          anchors: cityNames.slice(0, 2).join(' · '),
          opening: '거점을 지키며 기회를 기다린다',
          risk: '한 번의 무리한 출진이 곧 거점 상실로 이어진다.',
        };
    }
  }
}
