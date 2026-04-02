import Phaser from 'phaser';
import { COLORS, COLORS_CSS, FONT_STYLES, FONTS } from '../utils/Theme.js';
import GameplayScreen from '../screens/GameplayScreen.js';

export default class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenu');
  }

  create() {
    const { width, height } = this.scale;
    const hasSave = GameplayScreen.hasSave();
    const saveMeta = GameplayScreen.readSaveMeta();
    const scenario = this.cache.json.get('scenario-208');
    const allEvents = this.cache.json.get('all-events');
    const scenarioName = scenario?.name || '적벽대전';
    const scenarioDescription = scenario?.description || '조조의 남하를 막고 손유 연대를 성사시켜야 하는 첫 전장입니다.';
    const saveLabel = saveMeta?.year && saveMeta?.month
      ? `${saveMeta.year}년 ${saveMeta.month}월 · ${saveMeta.turn || '?'}턴`
      : '기록 없음';
    const timeline = ['정월 · 형주 혼란', '조조 남하', '손유 연대 전야'];

    this.debugCopy = {
      kicker: '역사 전략극',
      chapter: '第一幕 · 적벽대전',
      title: '우당탕탕삼국지',
      subtitle: '현재 개방된 첫 전장은 208 적벽대전 하나다',
      primaryCta: '적벽 전장으로 들어간다',
      secondaryCta: '이어하기',
    };

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1a1410, 0x14101a, 0x0a0a0f, 0x0b0910, 1);
    bg.fillRect(0, 0, width, height);

    // 메뉴 배경 — 어두운 그래디언트만 (맵 텍스처 불필요)

    const atmosphere = this.add.graphics();
    atmosphere.fillStyle(0x76542c, 0.14);
    atmosphere.fillCircle(width * 0.38, height * 0.38, 240);
    atmosphere.fillStyle(0x223245, 0.12);
    atmosphere.fillCircle(width * 0.74, height * 0.54, 220);
    atmosphere.fillStyle(0x05070d, 0.18);
    atmosphere.fillRect(0, 0, width, 72);
    atmosphere.fillRect(0, height - 84, width, 84);

    const frame = this.add.graphics();
    frame.fillStyle(0x0c0e14, 0.9);
    frame.fillRoundedRect(width / 2 - 476, 112, 952, 620, 20);
    frame.lineStyle(1, COLORS.accent, 0.28);
    frame.strokeRoundedRect(width / 2 - 476, 112, 952, 620, 20);
    frame.lineStyle(1, 0x1e2636, 0.14);
    frame.strokeRoundedRect(width / 2 - 456, 132, 912, 580, 16);

    const titleX = width / 2 - 400;
    const rightX = width / 2 + 112;

    const chapterSeal = this.add.graphics();
    chapterSeal.fillStyle(0x18120e, 0.96);
    chapterSeal.fillRoundedRect(titleX, 160, 168, 34, 12);
    chapterSeal.lineStyle(1, COLORS.accent, 0.32);
    chapterSeal.strokeRoundedRect(titleX, 160, 168, 34, 12);

    const kicker = this.add.text(titleX + 84, 177, this.debugCopy.kicker, {
      ...FONT_STYLES.label,
      fontSize: '12px',
      letterSpacing: 4,
      color: COLORS_CSS.accent,
    }).setOrigin(0.5).setAlpha(0.92);

    const title = this.add.text(titleX, 214, this.debugCopy.title, {
      fontFamily: FONTS.title,
      fontSize: '54px',
      fontStyle: '900',
      color: COLORS_CSS.accent,
    }).setOrigin(0, 0).setAlpha(0.96);

    this.add.text(titleX, 290, this.debugCopy.chapter, {
      fontFamily: FONTS.ui,
      fontSize: '12px',
      fontStyle: '700',
      color: COLORS_CSS.accent,
    });

    const subtitle = this.add.text(titleX, 316, this.debugCopy.subtitle, {
      ...FONT_STYLES.subtitle,
      fontSize: '15px',
      color: '#bfc4d4',
      wordWrap: { width: 454 },
    }).setOrigin(0, 0).setAlpha(0.88);

    timeline.forEach((entry, index) => {
      const pillX = titleX + index * 150;
      const pillY = 382;
      const pill = this.add.graphics();
      pill.fillStyle(index === 1 ? 0x2a1a10 : 0x10141e, 0.94);
      pill.fillRoundedRect(pillX, pillY, 142, 32, 14);
      pill.lineStyle(1, index === 1 ? COLORS.accent : COLORS.border, index === 1 ? 0.32 : 0.14);
      pill.strokeRoundedRect(pillX, pillY, 142, 32, 14);
      this.add.text(pillX + 71, pillY + 16, entry, {
        fontFamily: FONTS.ui,
        fontSize: '10px',
        fontStyle: '700',
        color: index === 1 ? COLORS_CSS.accent : COLORS_CSS.textDim,
      }).setOrigin(0.5);
    });

    const briefingCard = this.add.graphics();
    briefingCard.fillStyle(0x0e1119, 0.95);
    briefingCard.fillRoundedRect(titleX, 430, 498, 132, 14);
    briefingCard.lineStyle(1, COLORS.border, 0.16);
    briefingCard.strokeRoundedRect(titleX, 430, 498, 132, 14);
    this.add.text(titleX + 18, 448, '전장 브리핑', {
      fontFamily: FONTS.ui,
      fontSize: '11px',
      fontStyle: '700',
      color: COLORS_CSS.accent,
    });
    this.add.text(titleX + 18, 472, `${scenarioName} · 현재 플레이 가능한 첫 시나리오`, {
      fontFamily: FONTS.ui,
      fontSize: '20px',
      fontStyle: '700',
      color: COLORS_CSS.textBright,
    });
    this.add.text(titleX + 18, 502, scenarioDescription, {
      fontFamily: FONTS.ui,
      fontSize: '12px',
      color: COLORS_CSS.textDim,
      wordWrap: { width: 460 },
    });

    const statusCard = this.add.graphics();
    statusCard.fillStyle(0x0e1119, 0.95);
    statusCard.fillRoundedRect(rightX, 176, 244, 132, 14);
    statusCard.lineStyle(1, COLORS.border, 0.16);
    statusCard.strokeRoundedRect(rightX, 176, 244, 132, 14);
    this.add.text(rightX + 18, 194, '현재 개방 상태', {
      fontFamily: FONTS.ui,
      fontSize: '10px',
      fontStyle: '700',
      color: COLORS_CSS.textDim,
    });
    this.add.text(rightX + 18, 218, scenarioName, {
      fontFamily: FONTS.title,
      fontSize: '26px',
      fontStyle: '700',
      color: COLORS_CSS.textBright,
    });
    this.add.text(rightX + 18, 252, '현재 시나리오 1개 · 세력 5개', {
      fontFamily: FONTS.ui,
      fontSize: '11px',
      color: COLORS_CSS.textDim,
    });
    this.add.text(rightX + 18, 274, hasSave ? '이어하기 가능' : '새 전장 개시', {
      fontFamily: FONTS.ui,
      fontSize: '11px',
      color: hasSave ? '#7ed58b' : COLORS_CSS.textDim,
    });

    const ledgerCard = this.add.graphics();
    ledgerCard.fillStyle(0x0e1119, 0.95);
    ledgerCard.fillRoundedRect(rightX, 332, 244, 230, 14);
    ledgerCard.lineStyle(1, COLORS.border, 0.16);
    ledgerCard.strokeRoundedRect(rightX, 332, 244, 230, 14);
    this.add.text(rightX + 18, 350, '작전 장부', {
      fontFamily: FONTS.ui,
      fontSize: '10px',
      fontStyle: '700',
      color: COLORS_CSS.accent,
    });
    this.add.text(rightX + 18, 372, '지금 이 빌드에서 확인할 것', {
      fontFamily: FONTS.ui,
      fontSize: '16px',
      fontStyle: '700',
      color: COLORS_CSS.textBright,
    });
    [
      '누구의 깃발을 들 것인가',
      '어느 거점을 붙들 것인가',
      '언제 군사와 병참을 나눌 것인가',
      '턴 종료 전 무엇을 잠글 것인가',
    ].forEach((line, index) => {
      const rowY = 408 + index * 34;
      const dot = this.add.graphics();
      dot.fillStyle(index === 1 ? COLORS.accent : COLORS.border, index === 1 ? 0.9 : 0.6);
      dot.fillCircle(rightX + 22, rowY + 7, 4);
      this.add.existing(dot);
      this.add.text(rightX + 36, rowY, line, {
        fontFamily: FONTS.ui,
        fontSize: '11px',
        color: index === 1 ? COLORS_CSS.textBright : COLORS_CSS.textDim,
        wordWrap: { width: 188 },
      });
    });

    this.tweens.add({ targets: [kicker, title, subtitle], y: '-=6', duration: 700, ease: 'Sine.easeOut' });

    const btnX = titleX + 168;
    const btnY = 634;

    this.createButton(btnX, btnY, this.debugCopy.primaryCta, COLORS.accent, () => {
      this.cameras.main.fadeOut(400, 10, 10, 15);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('FactionSelect');
      });
    });

    this.createButton(btnX, btnY + 60, this.debugCopy.secondaryCta, hasSave ? 0x3a3a4a : 0x1a1a28, () => {
      if (!hasSave) return;
      this.registry.set('scenario', scenario);
      this.registry.set('allEvents', allEvents);
      this.registry.set('selectedFaction', saveMeta?.factionId || null);
      this.registry.set('loadRequested', true);
      this.registry.set('loadSlotKey', 'autosave');
      this.cameras.main.fadeOut(400, 10, 10, 15);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('WorldMap');
      });
    }, hasSave ? 1 : 0.4);

    this.add.text(btnX, btnY + 102, `저장: ${saveLabel}`, {
      ...FONT_STYLES.bodyDim,
      fontSize: '12px',
    }).setOrigin(0.5).setAlpha(hasSave ? 1 : 0.5);

    this.add.text(width / 2, height - 40, '우당탕탕삼국지 v0.2 · 적벽대전', {
      ...FONT_STYLES.bodyDim,
      fontSize: '11px',
    }).setOrigin(0.5).setAlpha(0.5);

    this.cameras.main.fadeIn(220, 10, 10, 15);
  }

  createButton(x, y, text, bgColor, onClick, alpha = 1) {
    const btnWidth = 280;
    const btnHeight = 48;

    const bg = this.add.graphics();
    bg.fillStyle(bgColor, 1);
    bg.fillRoundedRect(x - btnWidth / 2, y - btnHeight / 2, btnWidth, btnHeight, 6);
    bg.lineStyle(1, COLORS.accent, 0.12);
    bg.strokeRoundedRect(x - btnWidth / 2, y - btnHeight / 2, btnWidth, btnHeight, 6);

    const label = this.add.text(x, y, text, {
      fontFamily: FONTS.ui,
      fontSize: '16px',
      fontStyle: '700',
      color: bgColor === COLORS.accent ? COLORS_CSS.bg : COLORS_CSS.text,
    }).setOrigin(0.5);

    const hitZone = this.add.zone(x, y, btnWidth, btnHeight).setInteractive({ useHandCursor: true });

    hitZone.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(bgColor, 0.85);
      bg.fillRoundedRect(x - btnWidth / 2 - 1, y - btnHeight / 2 - 1, btnWidth + 2, btnHeight + 2, 7);
      bg.lineStyle(1, COLORS.accent, 0.3);
      bg.strokeRoundedRect(x - btnWidth / 2 - 1, y - btnHeight / 2 - 1, btnWidth + 2, btnHeight + 2, 7);
    });
    hitZone.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(bgColor, 1);
      bg.fillRoundedRect(x - btnWidth / 2, y - btnHeight / 2, btnWidth, btnHeight, 6);
      bg.lineStyle(1, COLORS.accent, 0.12);
      bg.strokeRoundedRect(x - btnWidth / 2, y - btnHeight / 2, btnWidth, btnHeight, 6);
    });
    hitZone.on('pointerdown', onClick);

    bg.setAlpha(alpha);
    label.setAlpha(alpha);

    this.tweens.add({
      targets: [bg, label],
      y: '-=4',
      duration: 420,
      ease: 'Sine.easeOut',
    });
  }

  getDebugCopy() {
    return this.debugCopy || null;
  }
}
