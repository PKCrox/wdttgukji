import Phaser from 'phaser';
import { COLORS, FONT_STYLES } from '../utils/Theme.js';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // 최소 에셋만 로드 (로딩 화면용)
    // 프로그레스 바 배경용 그래픽은 코드로 생성
  }

  create() {
    // 로딩 텍스트 표시 후 Preloader로 전환
    const { width, height } = this.scale;

    this.add.text(width / 2, height / 2, '우당탕탕삼국지', {
      ...FONT_STYLES.title,
      fontSize: '36px',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 + 60, '로딩 중...', {
      ...FONT_STYLES.bodyDim,
    }).setOrigin(0.5);

    // 짧은 딜레이 후 Preloader로
    this.time.delayedCall(300, () => {
      this.scene.start('Preloader');
    });
  }
}
