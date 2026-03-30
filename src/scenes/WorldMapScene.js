import Phaser from 'phaser';
import { COLORS, COLORS_CSS, FONT_STYLES, FONTS, FACTION_COLORS, SPACING } from '../utils/Theme.js';
import EventBus, { EVENTS } from '../utils/EventBus.js';
import GameplayScreen from '../screens/GameplayScreen.js';

const LEGACY_W = 920;
const LEGACY_H = 700;
const DESIGN_W = 1600;
const DESIGN_H = 900;
const SAFE_BOUNDS = { left: 80, top: 60, right: 1520, bottom: 840 };

// 레거시 좌표(920x700) → 신규 좌표(1600x900) 투영
function projectLegacyAnchors(cityPositions) {
  const w = SAFE_BOUNDS.right - SAFE_BOUNDS.left;
  const h = SAFE_BOUNDS.bottom - SAFE_BOUNDS.top;
  const anchors = {};
  for (const [id, pos] of Object.entries(cityPositions || {})) {
    anchors[id] = {
      x: Math.round(SAFE_BOUNDS.left + (pos.x / LEGACY_W) * w),
      y: Math.round(SAFE_BOUNDS.top + (pos.y / LEGACY_H) * h),
    };
  }
  return anchors;
}

// mapLayout.cityAnchors(명시) + cityPositions(레거시 변환) 병합
function resolveAllAnchors(scenario) {
  const legacy = projectLegacyAnchors(scenario.cityPositions || {});
  const explicit = scenario.mapLayout?.cityAnchors || {};
  return { ...legacy, ...explicit };
}

export default class WorldMapScene extends Phaser.Scene {
  constructor() {
    super('WorldMap');
    this.cityAnchors = {};
    this.selectedCityId = null;
    this.cityGraphics = {};
  }

  create() {
    this.cameras.main.fadeIn(500, 10, 10, 15);

    const scenario = this.registry.get('scenario');
    if (!scenario) {
      this.add.text(800, 450, '시나리오 데이터 없음', FONT_STYLES.body).setOrigin(0.5);
      return;
    }

    this.scenario = scenario;
    this.cityAnchors = resolveAllAnchors(scenario);
    this.factionId = this.registry.get('selectedFaction') || 'shu';

    // 맵 월드 크기 (카메라 바운드)
    const mapW = DESIGN_W;
    const mapH = DESIGN_H;

    // 배경
    this.add.graphics().fillStyle(COLORS.bg, 1).fillRect(0, 0, mapW, mapH);

    if (this.textures.exists('map-base')) {
      this.add.image(mapW / 2, mapH / 2, 'map-base')
        .setDisplaySize(mapW, mapH)
        .setAlpha(0.35);
    }

    // 렌더링 레이어 (순서 중요)
    this.drawTerritories(scenario);
    this.drawRegionLabels(scenario);
    this.drawRoads(scenario);
    this.drawCities(scenario);

    // 카메라 설정
    this.setupCamera(mapW, mapH);

    // GameplayScreen (engine 연결)
    const allEvents = this.registry.get('allEvents') || [];
    this.gameplay = new GameplayScreen(scenario, allEvents, this.factionId);
    this.registry.set('gameplay', this.gameplay);

    // 첫 턴 시작
    this.gameplay.startTurn();
    this.gameplay.save(); // 자동 저장

    // UIOverlay 병렬 실행
    if (!this.scene.isActive('UIOverlay')) {
      this.scene.launch('UIOverlay');
      this.scene.bringToTop('UIOverlay');
    }

    // ActionPanel 이벤트 리스너
    EventBus.on(EVENTS.OPEN_ACTION_PANEL, this.openActionPanel, this);
    EventBus.on(EVENTS.CLOSE_ACTION_PANEL, this.onActionPanelClosed, this);
    EventBus.on(EVENTS.STATE_CHANGED, this.refreshCityMarkers, this);
    this.events.on('shutdown', () => {
      EventBus.off(EVENTS.OPEN_ACTION_PANEL, this.openActionPanel, this);
      EventBus.off(EVENTS.CLOSE_ACTION_PANEL, this.onActionPanelClosed, this);
      EventBus.off(EVENTS.STATE_CHANGED, this.refreshCityMarkers, this);
      this.scene.stop('UIOverlay');
    });
  }

  // ─── 영토 폴리곤 ───
  drawTerritories(scenario) {
    const polys = scenario.mapLayout?.territoryPolygons;
    if (!polys) return;

    const gfx = this.add.graphics();
    for (const [factionId, points] of Object.entries(polys)) {
      const fc = FACTION_COLORS[factionId] || FACTION_COLORS.neutral;
      // 채우기
      gfx.fillStyle(fc.fill, fc.fillAlpha);
      gfx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) gfx.moveTo(p[0], p[1]);
        else gfx.lineTo(p[0], p[1]);
      });
      gfx.closePath();
      gfx.fillPath();

      // 경계선
      gfx.lineStyle(1, fc.edge, 0.15);
      gfx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) gfx.moveTo(p[0], p[1]);
        else gfx.lineTo(p[0], p[1]);
      });
      gfx.closePath();
      gfx.strokePath();
    }
  }

  // ─── 지역 라벨 (하북, 관중, 중원...) ───
  drawRegionLabels(scenario) {
    const labels = scenario.mapLayout?.labels;
    if (!labels) return;

    labels.forEach(label => {
      this.add.text(label.x, label.y, label.text, {
        fontFamily: FONTS.title,
        fontSize: `${label.size || 36}px`,
        fontStyle: '700',
        color: 'rgba(200,190,170,0.08)',
      }).setOrigin(0.5);
    });
  }

  // ─── 도로 ───
  drawRoads(scenario) {
    const roads = scenario.mapLayout?.roads;
    if (!roads) return;

    const gfx = this.add.graphics();
    roads.forEach(road => {
      const fromPos = this.cityAnchors[road.from];
      const toPos = this.cityAnchors[road.to];
      if (!fromPos || !toPos) return;

      const isMajor = road.grade === 'major';

      // 도로 배경 (두꺼운 어두운 선)
      if (isMajor) {
        gfx.lineStyle(6, 0x1a140e, 0.5);
        gfx.beginPath();
        gfx.moveTo(fromPos.x, fromPos.y);
        gfx.lineTo(toPos.x, toPos.y);
        gfx.strokePath();
      }

      // 도로 본선
      gfx.lineStyle(
        isMajor ? 2.5 : 1.2,
        isMajor ? 0xd5b77a : 0x3a3a4a,
        isMajor ? 0.5 : 0.25,
      );
      gfx.beginPath();
      gfx.moveTo(fromPos.x, fromPos.y);
      gfx.lineTo(toPos.x, toPos.y);
      gfx.strokePath();
    });
  }

  // ─── 도시 마커 ───
  drawCities(scenario) {
    // y좌표 순 정렬 (위→아래 렌더링, 겹침 자연스럽게)
    const entries = Object.entries(scenario.cities)
      .filter(([id]) => this.cityAnchors[id])
      .sort(([aId], [bId]) => {
        return (this.cityAnchors[aId]?.y || 0) - (this.cityAnchors[bId]?.y || 0);
      });

    for (const [cityId, city] of entries) {
      const anchor = this.cityAnchors[cityId];
      const fc = FACTION_COLORS[city.owner] || FACTION_COLORS.neutral;
      const isCapital = city.owner && scenario.factions[city.owner]?.capital === cityId;
      const importance = city.strategic_importance || 0;
      const baseR = isCapital ? 11 : importance >= 8 ? 9 : importance >= 6 ? 8 : 7;

      // 도시 그래픽
      const gfx = this.add.graphics();
      this.drawCityMarker(gfx, anchor.x, anchor.y, baseR, fc, isCapital, false);
      this.cityGraphics[cityId] = { gfx, anchor, baseR, fc, isCapital };

      // 병력 바 (도시 아래)
      this.drawArmyBar(anchor.x, anchor.y + baseR + 4, city, fc);

      // 도시명 라벨
      const badgeOff = scenario.mapLayout?.cityBadgeOffsets?.[cityId];
      const labelDx = badgeOff?.label?.[0] || 0;
      const labelDy = badgeOff?.label?.[1] || 0;
      const defaultLabelY = baseR + 10;
      this.add.text(anchor.x + labelDx, anchor.y + defaultLabelY + labelDy, city.name, {
        fontFamily: FONTS.ui,
        fontSize: '10px',
        fontStyle: '600',
        color: COLORS_CSS.textDim,
      }).setOrigin(0.5, 0);

      // 클릭/호버 영역
      const hitZone = this.add.zone(anchor.x, anchor.y, baseR * 4, baseR * 4)
        .setInteractive({ useHandCursor: true });

      hitZone.on('pointerdown', () => this.selectCity(cityId, city));
      hitZone.on('pointerover', () => {
        gfx.clear();
        this.drawCityMarker(gfx, anchor.x, anchor.y, baseR + 3, fc, isCapital, true);
      });
      hitZone.on('pointerout', () => {
        gfx.clear();
        this.drawCityMarker(gfx, anchor.x, anchor.y, baseR, fc, isCapital, false);
      });
    }
  }

  drawCityMarker(gfx, x, y, r, fc, isCapital, hovered) {
    // 외곽 글로우 (호버 시)
    if (hovered) {
      gfx.fillStyle(fc.primary, 0.12);
      gfx.fillCircle(x, y, r + 10);
    }

    // 외곽 링
    gfx.lineStyle(isCapital ? 3 : 2, hovered ? COLORS.accent : fc.edge, hovered ? 0.9 : 0.6);
    gfx.strokeCircle(x, y, r);

    // 내부 채우기
    gfx.fillStyle(fc.badge, 0.9);
    gfx.fillCircle(x, y, r - 1);

    // 수도 표시 (내부 원)
    if (isCapital) {
      gfx.fillStyle(fc.primary, 1);
      gfx.fillCircle(x, y, 3);
    }
  }

  drawArmyBar(x, y, city, fc) {
    const army = city.army || 0;
    const maxArmy = 80000;
    const ratio = Math.min(army / maxArmy, 1);
    const barW = 24;
    const barH = 2.5;

    const gfx = this.add.graphics();
    // 배경
    gfx.fillStyle(0x1a1a28, 0.6);
    gfx.fillRect(x - barW / 2, y, barW, barH);
    // 병력 바
    if (ratio > 0) {
      gfx.fillStyle(fc.primary, 0.7);
      gfx.fillRect(x - barW / 2, y, barW * ratio, barH);
    }
  }

  selectCity(cityId, city) {
    // 이전 선택 해제
    if (this.selectedCityId && this.cityGraphics[this.selectedCityId]) {
      const prev = this.cityGraphics[this.selectedCityId];
      prev.gfx.clear();
      this.drawCityMarker(prev.gfx, prev.anchor.x, prev.anchor.y, prev.baseR, prev.fc, prev.isCapital, false);
    }

    this.selectedCityId = cityId;

    // 새 선택 강조
    const curr = this.cityGraphics[cityId];
    if (curr) {
      curr.gfx.clear();
      this.drawCityMarker(curr.gfx, curr.anchor.x, curr.anchor.y, curr.baseR + 2, curr.fc, curr.isCapital, true);
    }

    EventBus.emit(EVENTS.CITY_SELECTED, { cityId, city });
    console.log(`[WorldMap] 도시 선택: ${city.name} (${cityId}) — 병력 ${city.army}, 사기 ${city.morale}`);
  }

  // ─── ActionPanel 제어 ───
  openActionPanel({ cityId, city }) {
    if (!this.scene.isActive('ActionPanel')) {
      this.scene.launch('ActionPanel', { cityId, city });
      this.scene.bringToTop('ActionPanel');
    }
  }

  onActionPanelClosed() {
    // 패널 닫힌 후 맵 갱신
    this.refreshCityMarkers();
  }

  refreshCityMarkers() {
    const gs = this.gameplay?.state;
    if (!gs) return;

    for (const [cityId, cg] of Object.entries(this.cityGraphics)) {
      const liveCity = gs.getCity(cityId);
      if (!liveCity) continue;

      const newFc = FACTION_COLORS[liveCity.owner] || FACTION_COLORS.neutral;
      const isCapital = liveCity.owner && gs.factions[liveCity.owner]?.capital === cityId;
      const isSelected = this.selectedCityId === cityId;

      // 색상이나 수도 상태가 변했을 때만 다시 그리기
      if (cg.fc !== newFc || cg.isCapital !== isCapital) {
        cg.fc = newFc;
        cg.isCapital = isCapital;
        cg.gfx.clear();
        this.drawCityMarker(cg.gfx, cg.anchor.x, cg.anchor.y,
          isSelected ? cg.baseR + 2 : cg.baseR, newFc, isCapital, isSelected);
      }
    }
  }

  // ─── 카메라: 드래그 + 줌 + 키보드 ───
  setupCamera(mapW, mapH) {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, mapW, mapH);

    // 드래그 팬
    this.input.on('pointermove', (pointer) => {
      if (!pointer.isDown) return;
      // 우클릭 또는 중클릭 드래그, 또는 빈 공간 좌클릭 드래그
      cam.scrollX -= (pointer.x - pointer.prevPosition.x) / cam.zoom;
      cam.scrollY -= (pointer.y - pointer.prevPosition.y) / cam.zoom;
    });

    // 마우스 휠 줌
    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      const zoomDelta = deltaY > 0 ? -0.08 : 0.08;
      const newZoom = Phaser.Math.Clamp(cam.zoom + zoomDelta, 0.5, 2.5);
      cam.zoom = newZoom;
    });

    // 키보드 스크롤
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: 'W', down: 'S', left: 'A', right: 'D',
    });
  }

  update(time, delta) {
    const cam = this.cameras.main;
    const speed = 400 / cam.zoom * (delta / 1000);

    if (this.cursors?.left.isDown || this.wasd?.left.isDown) cam.scrollX -= speed;
    if (this.cursors?.right.isDown || this.wasd?.right.isDown) cam.scrollX += speed;
    if (this.cursors?.up.isDown || this.wasd?.up.isDown) cam.scrollY -= speed;
    if (this.cursors?.down.isDown || this.wasd?.down.isDown) cam.scrollY += speed;
  }
}
