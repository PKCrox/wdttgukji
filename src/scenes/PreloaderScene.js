import Phaser from 'phaser';
import { COLORS, COLORS_CSS, FONT_STYLES } from '../utils/Theme.js';

// Vite JSON import — engine/, data/는 public/ 외부이므로 ES import 사용
import scenarioData from '../../engine/data/scenarios/208-red-cliffs.json';
import eventsData from '../../data/events/all-events.json';

export default class PreloaderScene extends Phaser.Scene {
  constructor() {
    super('Preloader');
  }

  preload() {
    const { width, height } = this.scale;

    // 불투명 배경 (캔버스 투명이므로 직접 그리기)
    this.add.graphics().fillStyle(0x0a0a0f, 1).fillRect(0, 0, width, height);

    // 프로그레스 바
    const barBg = this.add.graphics();
    barBg.fillStyle(0x2a2a3a, 1);
    barBg.fillRoundedRect(width * 0.2, height / 2 + 40, width * 0.6, 12, 6);

    const bar = this.add.graphics();

    this.add.text(width / 2, height / 2, '우당탕탕삼국지', {
      ...FONT_STYLES.title,
      fontSize: '36px',
    }).setOrigin(0.5);

    const loadText = this.add.text(width / 2, height / 2 + 70, '에셋 로딩 중...', {
      ...FONT_STYLES.bodyDim,
    }).setOrigin(0.5);

    this.load.on('progress', (value) => {
      bar.clear();
      bar.fillStyle(COLORS.accent, 1);
      bar.fillRoundedRect(width * 0.2, height / 2 + 40, width * 0.6 * value, 12, 6);
      loadText.setText(`에셋 로딩 중... ${Math.round(value * 100)}%`);
    });

    // === 에셋 로드 ===

    // JSON 데이터는 ES import로 이미 로드됨 → create()에서 캐시 등록

    // 맵 배경은 Leaflet 타일 레이어가 실시간 렌더링 (정적 이미지 불필요)
  }

  create() {
    // ES import로 가져온 JSON → Phaser 캐시에 등록
    this.cache.json.add('scenario-208', scenarioData);
    this.cache.json.add('all-events', eventsData);

    // 플레이스홀더 텍스처 생성 (초상화, 도시 마커 등)
    this.createPlaceholders();

    // 메인 메뉴로 전환
    this.scene.start('MainMenu');
  }

  createPlaceholders() {
    // 도시 마커 플레이스홀더 (원형)
    const cityGfx = this.add.graphics();
    cityGfx.fillStyle(0xc9a84c, 1);
    cityGfx.fillCircle(16, 16, 14);
    cityGfx.lineStyle(2, 0xffffff, 0.4);
    cityGfx.strokeCircle(16, 16, 14);
    cityGfx.generateTexture('city-marker', 32, 32);
    cityGfx.destroy();

    // 초상화 플레이스홀더 (회색 사각형)
    const portraitGfx = this.add.graphics();
    portraitGfx.fillStyle(0x2a2a3a, 1);
    portraitGfx.fillRoundedRect(0, 0, 64, 80, 4);
    portraitGfx.lineStyle(1, 0x444466, 1);
    portraitGfx.strokeRoundedRect(0, 0, 64, 80, 4);
    // 사람 아이콘 간략 표현
    portraitGfx.fillStyle(0x555577, 1);
    portraitGfx.fillCircle(32, 28, 12);
    portraitGfx.fillRoundedRect(16, 44, 32, 28, 4);
    portraitGfx.generateTexture('placeholder-portrait', 64, 80);
    portraitGfx.destroy();

    // 패널 배경 텍스처
    const panelGfx = this.add.graphics();
    panelGfx.fillStyle(0x12121a, 0.95);
    panelGfx.fillRoundedRect(0, 0, 32, 32, 8);
    panelGfx.lineStyle(1, 0x2a2a3a, 1);
    panelGfx.strokeRoundedRect(0, 0, 32, 32, 8);
    panelGfx.generateTexture('panel-bg', 32, 32);
    panelGfx.destroy();
  }
}
