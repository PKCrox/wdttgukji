import Phaser from 'phaser';
import { COLORS, COLORS_CSS, FONT_STYLES, FONTS, SPACING } from '../utils/Theme.js';
import EventBus, { EVENTS } from '../utils/EventBus.js';

export default class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenu');
  }

  create() {
    const { width, height } = this.scale;

    // 배경 그라데이션 (방사형)
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1a1020, 0x1a1020, 0x0a0a0f, 0x0a0a0f, 1);
    bg.fillRect(0, 0, width, height);

    // 타이틀
    const kicker = this.add.text(width / 2, height * 0.28, 'Grand Strategy Chronicle', {
      ...FONT_STYLES.label,
      fontSize: '14px',
      letterSpacing: 4,
    }).setOrigin(0.5).setAlpha(0);

    const title = this.add.text(width / 2, height * 0.36, '우당탕탕삼국지', {
      fontFamily: FONTS.title,
      fontSize: '56px',
      fontStyle: '900',
      color: COLORS_CSS.accent,
    }).setOrigin(0.5).setAlpha(0);

    const subtitle = this.add.text(width / 2, height * 0.44, '난세를 굴리는 군주제 전략극', {
      ...FONT_STYLES.subtitle,
      fontSize: '16px',
    }).setOrigin(0.5).setAlpha(0);

    // 페이드인 애니메이션
    this.tweens.add({ targets: kicker, alpha: 1, y: kicker.y - 8, duration: 600, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: title, alpha: 1, y: title.y - 8, duration: 800, delay: 200, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: subtitle, alpha: 1, y: subtitle.y - 8, duration: 600, delay: 400, ease: 'Sine.easeOut' });

    // 버튼 영역
    const btnY = height * 0.6;

    this.createButton(width / 2, btnY, '적벽으로 들어간다', COLORS.accent, () => {
      this.cameras.main.fadeOut(400, 10, 10, 15);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('FactionSelect');
      });
    });

    // 이어하기 버튼 (세이브 있을 때만 활성)
    const hasSave = localStorage.getItem('game-save') !== null;
    this.createButton(width / 2, btnY + 60, '이어하기', hasSave ? 0x3a3a4a : 0x1a1a28, () => {
      if (!hasSave) return;
      this.cameras.main.fadeOut(400, 10, 10, 15);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        EventBus.emit(EVENTS.LOAD_GAME);
        this.scene.start('WorldMap');
      });
    }, hasSave ? 1 : 0.4);

    // 세이브 정보 표시
    if (hasSave) {
      try {
        const save = JSON.parse(localStorage.getItem('game-save'));
        const date = new Date(save.timestamp).toLocaleDateString('ko-KR');
        const turn = save.turnNumber || save.state?.turn || '?';
        this.add.text(width / 2, btnY + 100, `저장: ${date} · ${turn}턴`, {
          ...FONT_STYLES.bodyDim,
          fontSize: '12px',
        }).setOrigin(0.5);
      } catch { /* 무시 */ }
    }

    // 하단 크레딧
    this.add.text(width / 2, height - 40, 'wdttgukji v0.1 · Phaser 3', {
      ...FONT_STYLES.bodyDim,
      fontSize: '11px',
    }).setOrigin(0.5).setAlpha(0.5);

    // 페이드인
    this.cameras.main.fadeIn(500, 10, 10, 15);
  }

  createButton(x, y, text, bgColor, onClick, alpha = 1) {
    const btnWidth = 280;
    const btnHeight = 48;

    const bg = this.add.graphics();
    bg.fillStyle(bgColor, 1);
    bg.fillRoundedRect(x - btnWidth / 2, y - btnHeight / 2, btnWidth, btnHeight, 6);

    const label = this.add.text(x, y, text, {
      fontFamily: FONTS.ui,
      fontSize: '16px',
      fontStyle: '700',
      color: bgColor === COLORS.accent ? COLORS_CSS.bg : COLORS_CSS.text,
    }).setOrigin(0.5);

    const hitZone = this.add.zone(x, y, btnWidth, btnHeight).setInteractive({ useHandCursor: true });

    hitZone.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(bgColor, 1);
      bg.fillRoundedRect(x - btnWidth / 2 - 2, y - btnHeight / 2 - 2, btnWidth + 4, btnHeight + 4, 8);
    });
    hitZone.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(bgColor, 1);
      bg.fillRoundedRect(x - btnWidth / 2, y - btnHeight / 2, btnWidth, btnHeight, 6);
    });
    hitZone.on('pointerdown', onClick);

    if (alpha < 1) {
      bg.setAlpha(alpha);
      label.setAlpha(alpha);
    }

    // 페이드인
    bg.setAlpha(0);
    label.setAlpha(0);
    this.tweens.add({ targets: [bg, label], alpha: alpha, duration: 600, delay: 600, ease: 'Sine.easeOut' });
  }
}
