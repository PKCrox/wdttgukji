import Phaser from 'phaser';
import { COLORS, COLORS_CSS, FONT_STYLES, FONTS, FACTION_COLORS, SPACING, MAP_PALETTE, CITY_TIERS, ROAD_STYLES, TERRITORY_STYLE } from '../utils/Theme.js';
import EventBus, { EVENTS } from '../utils/EventBus.js';
import GameplayScreen from '../screens/GameplayScreen.js';
import { WORLD_W, WORLD_H, resolveAllAnchors, geoToWorld, oldPixelToWorld, syncLeafletToCamera, setLeafletVisible, invalidateLeafletSize } from '../utils/LeafletBridge.js';

const DESIGN_W = 1600;
const DESIGN_H = 900;

// Zoom tiers — wider range for larger Mercator world
const ZOOM_TIERS = {
  strategic: { min: 0.45, max: 0.64 },
  frontline: { min: 0.65, max: 1.05 },
  local: { min: 1.06, max: 1.8 },
};

export default class WorldMapScene extends Phaser.Scene {
  constructor() {
    super('WorldMap');
    this.cityAnchors = {};
    this.selectedCityId = null;
    this.cityGraphics = {};
    this.focusGraphics = null;
    this.focusPulse = null;
    this.focusDecorations = [];
    this.focusConnectedIds = [];
    this.regionLabels = [];
    this.landmarkLabels = [];
    this.terrainGraphics = {};
    this.frontlineGraphics = [];
    this.focusZoneGraphics = [];
    this.zoomTier = 'frontline';
    this.lastZoom = null;
  }

  create() {
    this.cameras.main.fadeIn(500, 10, 10, 15);

    const scenario = this.registry.get('scenario') || this.cache.json.get('scenario-208');
    if (!scenario) {
      this.add.text(800, 450, '시나리오 데이터 없음', FONT_STYLES.body).setOrigin(0.5);
      return;
    }

    this.scenario = scenario;
    this.cityAnchors = resolveAllAnchors(scenario);
    this.factionId = this.registry.get('selectedFaction') || 'shu';
    const allEvents = this.registry.get('allEvents') || this.cache.json.get('all-events') || [];
    const loadRequested = this.registry.get('loadRequested') === true;
    const loadSlotKey = this.registry.get('loadSlotKey') || 'autosave';

    if (loadRequested && GameplayScreen.hasSave(loadSlotKey)) {
      this.gameplay = GameplayScreen.load(loadSlotKey, allEvents);
      if (this.gameplay) {
        this.factionId = this.gameplay.playerFaction || this.factionId;
        this.registry.set('selectedFaction', this.factionId);
      }
    }
    if (!this.gameplay) {
      this.gameplay = new GameplayScreen(scenario, allEvents, this.factionId);
      this.gameplay.startTurn();
      this.gameplay.save(loadSlotKey);
    }

    this.registry.set('loadRequested', false);
    this.registry.set('loadSlotKey', null);
    this.registry.set('scenario', scenario);
    this.registry.set('allEvents', allEvents);
    this.registry.set('gameplay', this.gameplay);

    // 맵 월드 크기 — Mercator 투영 기반 (Leaflet 타일과 정렬)
    const mapW = Math.round(WORLD_W);
    const mapH = Math.round(WORLD_H);
    this.mapW = mapW;
    this.mapH = mapH;

    // Leaflet 타일맵 활성화 + 크기 재계산
    setLeafletVisible(true);
    invalidateLeafletSize();

    // 렌더링 레이어 — Leaflet 타일 위에 게임 요소만
    this.drawTerritories(scenario);
    this.drawRoads(scenario);
    this.drawCities(scenario);
    this.focusGraphics = this.add.graphics();
    this.focusGraphics.setDepth(40);

    // 카메라 설정 (Mercator 월드 크기)
    this.setupCamera(mapW, mapH);

    // 초기 카메라 위치 — 맵 중앙
    const cam = this.cameras.main;
    cam.centerOn(mapW / 2, mapH / 2);
    cam.zoom = 0.55; // 전략 줌에서 시작
    this.refreshSemanticZoom(true);

    // UIOverlay 병렬 실행
    if (!this.scene.isActive('UIOverlay')) {
      this.scene.launch('UIOverlay');
      this.scene.bringToTop('UIOverlay');
    }

    // ActionPanel 이벤트 리스너
    EventBus.on(EVENTS.OPEN_ACTION_PANEL, this.openActionPanel, this);
    EventBus.on(EVENTS.CLOSE_ACTION_PANEL, this.onActionPanelClosed, this);
    EventBus.on(EVENTS.CITY_DESELECTED, this.onCityDeselected, this);
    EventBus.on(EVENTS.STATE_CHANGED, this.refreshCityMarkers, this);
    this.events.on('shutdown', () => {
      EventBus.off(EVENTS.OPEN_ACTION_PANEL, this.openActionPanel, this);
      EventBus.off(EVENTS.CLOSE_ACTION_PANEL, this.onActionPanelClosed, this);
      EventBus.off(EVENTS.CITY_DESELECTED, this.onCityDeselected, this);
      EventBus.off(EVENTS.STATE_CHANGED, this.refreshCityMarkers, this);
      setLeafletVisible(false);
      this.scene.stop('UIOverlay');
    });
  }

  drawMapAtmosphere(mapW, mapH) {
    // Leaflet이 배경 처리 — 별도 비네팅 불필요
  }

  drawWaterPolygons(scenario) {
    const polygons = scenario.mapLayout?.waterPolygons;
    if (!polygons?.length) return;

    const waterGraphics = this.add.graphics();
    waterGraphics.setDepth(1);
    polygons.forEach((polygon) => {
      const isBay = polygon.kind === 'bay';
      const pts = polygon.points.map(([x, y]) => { const w = oldPixelToWorld(x, y); return [w.x, w.y]; });
      waterGraphics.fillStyle(MAP_PALETTE.water, isBay ? 0.15 : 0.12);
      waterGraphics.beginPath();
      pts.forEach(([x, y], index) => {
        if (index === 0) waterGraphics.moveTo(x, y);
        else waterGraphics.lineTo(x, y);
      });
      waterGraphics.closePath();
      waterGraphics.fillPath();
      waterGraphics.lineStyle(isBay ? 2.0 : 2.4, MAP_PALETTE.waterEdge, isBay ? 0.2 : 0.22);
      waterGraphics.beginPath();
      pts.forEach(([x, y], index) => {
        if (index === 0) waterGraphics.moveTo(x, y);
        else waterGraphics.lineTo(x, y);
      });
      waterGraphics.closePath();
      waterGraphics.strokePath();
    });
    this.terrainGraphics.water = waterGraphics;
  }

  drawFocusZones(scenario) {
    const zones = scenario.mapLayout?.focusZones;
    if (!zones?.length) return;

    zones.forEach((zone) => {
      const fc = FACTION_COLORS[zone.factionId] || FACTION_COLORS.neutral;
      const w = oldPixelToWorld(zone.x, zone.y);
      const scale = WORLD_W / 1600; // radius 스케일링
      const gfx = this.add.graphics();
      gfx.setDepth(1);
      gfx.fillStyle(fc.primary, zone.alpha || 0.12);
      gfx.fillCircle(w.x, w.y, (zone.radius || 100) * scale);
      gfx.lineStyle(2, fc.primary, 0.16);
      gfx.strokeCircle(w.x, w.y, (zone.radius || 100) * scale * 0.92);

      const label = this.add.text(w.x, w.y, this.scenario.factions?.[zone.factionId]?.name || zone.factionId, {
        fontFamily: FONTS.title,
        fontSize: '18px',
        fontStyle: '700',
        color: fc.css,
      }).setOrigin(0.5).setAlpha(0.16).setDepth(11);
      this.focusZoneGraphics.push({ gfx, label, factionId: zone.factionId, baseAlpha: zone.alpha || 0.12 });
    });
  }

  // ─── 영토 폴리곤 ───
  drawTerritories(scenario) {
    const polys = scenario.mapLayout?.territoryPolygons;
    if (!polys) return;

    const gfx = this.add.graphics();
    gfx.setDepth(2);
    for (const [factionId, rawPoints] of Object.entries(polys)) {
      const fc = FACTION_COLORS[factionId] || FACTION_COLORS.neutral;
      // 좌표 변환: 구 1600×900 → Mercator 월드
      const points = rawPoints.map(p => {
        const w = oldPixelToWorld(p[0], p[1]);
        return [w.x, w.y];
      });
      const tracePath = () => {
        gfx.beginPath();
        points.forEach((p, i) => {
          if (i === 0) gfx.moveTo(p[0], p[1]);
          else gfx.lineTo(p[0], p[1]);
        });
        gfx.closePath();
      };

      // 영토 틴트 — 위성 지형 위에 가볍게만 (지형이 보여야 함)
      gfx.fillStyle(fc.fill, 0.06);
      tracePath();
      gfx.fillPath();

      // 영토 경계선
      gfx.lineStyle(2.0, fc.primary, 0.16);
      tracePath();
      gfx.strokePath();
    }
    this.terrainGraphics.territories = gfx;
  }

  drawRidgePaths(scenario) {
    const ridges = scenario.mapLayout?.ridgePaths;
    if (!ridges?.length) return;

    const ridgeGraphics = this.add.graphics();
    ridgeGraphics.setDepth(3);
    ridges.forEach((ridge) => {
      const t = ridge.thickness || 20;
      const pts = ridge.points.map(([x, y]) => { const w = oldPixelToWorld(x, y); return [w.x, w.y]; });
      const tracePath = () => {
        ridgeGraphics.beginPath();
        pts.forEach(([x, y], index) => {
          if (index === 0) ridgeGraphics.moveTo(x, y);
          else ridgeGraphics.lineTo(x, y);
        });
        ridgeGraphics.strokePath();
      };

      // Pass 1: 넓은 그림자 (실제 지형 위 보조)
      ridgeGraphics.lineStyle(t * 0.8, MAP_PALETTE.ridge, 0.12);
      tracePath();

      // Pass 2: 가는 하이라이트
      ridgeGraphics.lineStyle(Math.max(3, t * 0.2), MAP_PALETTE.ridgeHighlight, 0.1);
      tracePath();
    });
    this.terrainGraphics.ridges = ridgeGraphics;
  }

  // ─── 지역 라벨 (하북, 관중, 중원...) ───
  drawRegionLabels(scenario) {
    const labels = scenario.mapLayout?.labels;
    if (!labels) return;

    labels.forEach(label => {
      const w = oldPixelToWorld(label.x, label.y);
      const text = this.add.text(w.x, w.y, label.text, {
        fontFamily: FONTS.title,
        fontSize: `${label.size || 36}px`,
        fontStyle: '700',
        color: MAP_PALETTE.regionLabel,
      }).setOrigin(0.5).setAlpha(0.24).setDepth(12);
      text.setShadow(0, 1, '#000000', 8, false, true);
      this.regionLabels.push(text);
    });
  }

  drawLandmarks(scenario) {
    const landmarks = scenario.mapLayout?.landmarks;
    if (!landmarks?.length) return;

    landmarks.forEach((landmark) => {
      const w = oldPixelToWorld(landmark.x, landmark.y);
      const css = landmark.type === 'river' ? MAP_PALETTE.waterLabel : MAP_PALETTE.ridgeLabel;
      const text = this.add.text(w.x, w.y, landmark.text, {
        fontFamily: FONTS.ui,
        fontSize: '11px',
        fontStyle: '700',
        color: css,
      }).setOrigin(0.5).setAlpha(0.3).setDepth(13);
      text.setShadow(0, 1, '#000000', 6, false, true);
      this.landmarkLabels.push(text);
    });
  }

  drawFrontlineAnchors(scenario) {
    const frontlines = scenario.mapLayout?.frontlineAnchors;
    if (!frontlines?.length) return;

    frontlines.forEach((frontline) => {
      const pts = frontline.points.map(([x, y]) => { const w = oldPixelToWorld(x, y); return [w.x, w.y]; });
      const gfx = this.add.graphics();
      gfx.setDepth(8);
      gfx.lineStyle(8, 0x0a0907, 0.24);
      gfx.beginPath();
      pts.forEach(([x, y], index) => {
        if (index === 0) gfx.moveTo(x, y);
        else gfx.lineTo(x, y);
      });
      gfx.strokePath();
      gfx.lineStyle(2.4, 0xd3b36b, 0.3);
      gfx.beginPath();
      pts.forEach(([x, y], index) => {
        if (index === 0) gfx.moveTo(x, y);
        else gfx.lineTo(x, y);
      });
      gfx.strokePath();
      this.frontlineGraphics.push({ gfx, pair: frontline.pair });
    });
  }

  // ─── 도로 ───
  drawRoads(scenario) {
    const roads = scenario.mapLayout?.roads;
    if (!roads) return;

    const shadow = this.add.graphics();
    const major = this.add.graphics();
    const minor = this.add.graphics();
    shadow.setDepth(7);
    minor.setDepth(8);
    major.setDepth(9);

    roads.forEach(road => {
      const fromPos = this.cityAnchors[road.from];
      const toPos = this.cityAnchors[road.to];
      if (!fromPos || !toPos) return;

      const isMajor = road.grade === 'major';

      // 패스 1: 그림자 (깊이감)
      if (isMajor) {
        shadow.lineStyle(4.5, 0x080604, 0.3);
        shadow.beginPath();
        shadow.moveTo(fromPos.x + 1, fromPos.y + 1);
        shadow.lineTo(toPos.x + 1, toPos.y + 1);
        shadow.strokePath();
      }

      // 패스 2: 메인 도로선
      const gfx = isMajor ? major : minor;
      gfx.lineStyle(
        isMajor ? 2.2 : 1.0,
        isMajor ? 0xb8a060 : 0x706858,
        isMajor ? 0.55 : 0.30,
      );
      gfx.beginPath();
      gfx.moveTo(fromPos.x, fromPos.y);
      gfx.lineTo(toPos.x, toPos.y);
      gfx.strokePath();

      // 패스 3: 주요 도로 하이라이트 (중앙선)
      if (isMajor) {
        gfx.lineStyle(0.8, 0xd4c080, 0.25);
        gfx.beginPath();
        gfx.moveTo(fromPos.x, fromPos.y);
        gfx.lineTo(toPos.x, toPos.y);
        gfx.strokePath();
      }
    });
    this.terrainGraphics.roadShadow = shadow;
    this.terrainGraphics.majorRoads = major;
    this.terrainGraphics.minorRoads = minor;
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
      const liveCity = this.gameplay?.state?.getCity(cityId) || city;
      const fc = FACTION_COLORS[liveCity.owner] || FACTION_COLORS.neutral;
      const isCapital = liveCity.owner && this.gameplay?.state?.factions?.[liveCity.owner]?.capital === cityId;
      const importance = liveCity.strategic_importance || 0;
      const tier = isCapital ? CITY_TIERS.capital : importance >= 8 ? CITY_TIERS.major : importance >= 5 ? CITY_TIERS.standard : CITY_TIERS.minor;
      const baseR = tier.radius;

      // 도시 그래픽
      const gfx = this.add.graphics();
      this.drawCityMarker(gfx, anchor.x, anchor.y, baseR, fc, isCapital, false);
      gfx.setDepth(20);

      // 도시명 라벨 — 배경 필 포함
      const badgeOff = scenario.mapLayout?.cityBadgeOffsets?.[cityId];
      const labelDx = badgeOff?.label?.[0] || 0;
      const labelDy = badgeOff?.label?.[1] || 0;
      const defaultLabelY = baseR + 8;
      const labelFontSize = isCapital ? '13px' : importance >= 8 ? '12px' : '11px';

      const label = this.add.text(anchor.x + labelDx, anchor.y + defaultLabelY + labelDy, city.name, {
        fontFamily: FONTS.ui,
        fontSize: labelFontSize,
        fontStyle: '700',
        color: COLORS_CSS.textBright,
        padding: { left: 6, right: 6, top: 3, bottom: 3 },
      }).setOrigin(0.5, 0).setDepth(21);
      label.setShadow(0, 1, '#000000', 4, false, true);

      // 라벨 배경 필 (어두운 반투명)
      const labelBg = this.add.graphics();
      const lbW = label.width + 2;
      const lbH = label.height;
      const lbX = anchor.x + labelDx - lbW / 2;
      const lbY = anchor.y + defaultLabelY + labelDy;
      labelBg.fillStyle(0x0a0a10, 0.78);
      labelBg.fillRoundedRect(lbX, lbY, lbW, lbH, 4);
      // 세력 색상 좌측 액센트
      labelBg.fillStyle(fc.primary, 0.6);
      labelBg.fillRect(lbX, lbY + 3, 2, lbH - 6);
      labelBg.setDepth(20);

      // 병력 바 (라벨 아래)
      const armyBarY = lbY + lbH + 3;
      const armyBar = this.drawArmyBar(anchor.x + labelDx, armyBarY, liveCity, fc);
      armyBar.setDepth(20);

      this.cityGraphics[cityId] = { gfx, anchor, baseR, fc, isCapital, armyBar, label, labelBg, importance };

      // 클릭/호버 영역
      const hitZone = this.add.zone(anchor.x, anchor.y, baseR * 4, baseR * 4)
        .setInteractive({ useHandCursor: true });

      hitZone.on('pointerdown', () => this.selectCity(cityId, liveCity));
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
    // 1. 호버 — 넓은 글로우
    if (hovered) {
      gfx.fillStyle(fc.primary, 0.06);
      gfx.fillCircle(x, y, r + 18);
      gfx.fillStyle(fc.primary, 0.10);
      gfx.fillCircle(x, y, r + 10);
    }

    // 2. 드롭 섀도우 (깊이감)
    gfx.fillStyle(0x000000, 0.35);
    gfx.fillCircle(x + 1, y + 2, r + 2);

    // 3. 외곽 링 — 두꺼운 세력 색상
    gfx.fillStyle(fc.primary, hovered ? 0.92 : 0.72);
    gfx.fillCircle(x, y, r + 1);

    // 4. 내부 채우기 — 어두운 색 (링 효과)
    gfx.fillStyle(fc.badgeDark, 0.95);
    gfx.fillCircle(x, y, r - 2);

    // 5. 내부 하이라이트 (입체감)
    gfx.fillStyle(fc.badge, 0.45);
    gfx.fillCircle(x, y - r * 0.2, r * 0.55);

    // 6. 외곽 광택 링
    gfx.lineStyle(1, 0xffffff, hovered ? 0.22 : 0.10);
    gfx.strokeCircle(x, y, r + 1);

    // 7. 수도 — 밝은 내부 점 + 외곽 이중링
    if (isCapital) {
      gfx.fillStyle(0xffffff, 0.85);
      gfx.fillCircle(x, y, 3.5);
      gfx.lineStyle(1.5, fc.primary, 0.6);
      gfx.strokeCircle(x, y, r + 5);
    }
  }

  drawArmyBar(x, y, city, fc) {
    const army = city.army || 0;
    const maxArmy = 80000;
    const ratio = Math.min(army / maxArmy, 1);
    const barW = 36;
    const barH = 3;

    const gfx = this.add.graphics();
    // 배경
    gfx.fillStyle(0x000000, 0.5);
    gfx.fillRoundedRect(x - barW / 2, y, barW, barH, 1.5);
    // 병력 바
    if (ratio > 0) {
      const fillColor = ratio > 0.6 ? fc.primary : ratio > 0.3 ? COLORS.warning : COLORS.danger;
      gfx.fillStyle(fillColor, 0.85);
      gfx.fillRoundedRect(x - barW / 2, y, barW * ratio, barH, 1.5);
    }
    return gfx;
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

    this.drawSelectionFocus(cityId);
    this.focusCameraOnCity(cityId);
    this.refreshSemanticZoom(true);
    EventBus.emit(EVENTS.CITY_SELECTED, { cityId, city });
    console.log(`[WorldMap] 도시 선택: ${city.name} (${cityId}) — 병력 ${city.army}, 사기 ${city.morale}`);
  }

  onCityDeselected() {
    if (this.selectedCityId && this.cityGraphics[this.selectedCityId]) {
      const prev = this.cityGraphics[this.selectedCityId];
      prev.gfx.clear();
      this.drawCityMarker(prev.gfx, prev.anchor.x, prev.anchor.y, prev.baseR, prev.fc, prev.isCapital, false);
    }
    this.selectedCityId = null;
    this.applySelectionEmphasis(null);
    this.clearSelectionFocus();
    this.refreshSemanticZoom(true);
  }

  // ─── ActionPanel 제어 ───
  openActionPanel({ cityId, city, activeTab = 'government' }) {
    if (this.scene.isActive('ActionPanel')) {
      this.scene.stop('ActionPanel');
    }
    this.scene.launch('ActionPanel', { cityId, city, activeTab });
    this.scene.bringToTop('ActionPanel');
    this.refreshSemanticZoom(true);
  }

  onActionPanelClosed() {
    // 패널 닫힌 후 맵 갱신
    this.refreshCityMarkers();
    if (this.selectedCityId) this.drawSelectionFocus(this.selectedCityId);
    this.refreshSemanticZoom(true);
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

  clearSelectionFocus() {
    this.focusGraphics?.clear();
    this.focusDecorations.forEach((node) => node.destroy());
    this.focusDecorations = [];
    if (this.focusPulse) {
      this.tweens.killTweensOf(this.focusPulse);
      this.focusPulse.destroy();
      this.focusPulse = null;
    }
  }

  drawSelectionFocus(cityId) {
    this.clearSelectionFocus();
    const anchor = this.cityAnchors[cityId];
    const cityMeta = this.cityGraphics[cityId];
    const liveCity = this.gameplay?.state?.getCity(cityId) || this.scenario.cities[cityId];
    if (!anchor || !cityMeta || !this.focusGraphics) return;

    const roads = this.scenario.mapLayout?.roads || [];
    const connected = roads.filter((road) => road.from === cityId || road.to === cityId);
    this.applySelectionEmphasis(cityId, connected.map((road) => (road.from === cityId ? road.to : road.from)));
    const allyAxes = [];
    const enemyAxes = [];
    connected.forEach((road) => {
      const neighborId = road.from === cityId ? road.to : road.from;
      const neighborAnchor = this.cityAnchors[neighborId];
      const neighbor = this.gameplay?.state?.getCity(neighborId) || this.scenario.cities[neighborId];
      if (!neighborAnchor || !neighbor) return;
      const ally = neighbor.owner === this.factionId;
      const relationColor = ally ? (FACTION_COLORS[neighbor.owner]?.primary || COLORS.border) : COLORS.accent;
      const axisScore = this.scoreAxis(road, neighbor, ally);
      const labelKicker = ally
        ? (axisScore >= 5 ? '중핵 지원선' : '지원선')
        : (axisScore >= 6 ? '주공 축' : '압박 축');
      (ally ? allyAxes : enemyAxes).push(neighbor);

      this.focusGraphics.lineStyle(ally ? 3.8 + axisScore * 0.2 : 4.6 + axisScore * 0.26, 0x08090d, ally ? 0.24 : 0.3);
      this.focusGraphics.beginPath();
      this.focusGraphics.moveTo(anchor.x, anchor.y);
      this.focusGraphics.lineTo(neighborAnchor.x, neighborAnchor.y);
      this.focusGraphics.strokePath();

      this.focusGraphics.lineStyle(ally ? 1.4 + axisScore * 0.18 : 2 + axisScore * 0.22, relationColor, ally ? 0.34 + axisScore * 0.04 : 0.64 + axisScore * 0.04);
      this.focusGraphics.beginPath();
      this.focusGraphics.moveTo(anchor.x, anchor.y);
      this.focusGraphics.lineTo(neighborAnchor.x, neighborAnchor.y);
      this.focusGraphics.strokePath();

      this.focusGraphics.fillStyle(relationColor, ally ? 0.08 + axisScore * 0.02 : 0.14 + axisScore * 0.02);
      this.focusGraphics.fillCircle(neighborAnchor.x, neighborAnchor.y, ally ? 7 + axisScore * 0.6 : 10 + axisScore * 0.8);
      this.focusGraphics.lineStyle(ally ? 1.1 + axisScore * 0.08 : 1.5 + axisScore * 0.1, relationColor, ally ? 0.36 + axisScore * 0.03 : 0.56 + axisScore * 0.03);
      this.focusGraphics.strokeCircle(neighborAnchor.x, neighborAnchor.y, ally ? 9 + axisScore * 0.7 : 13 + axisScore * 0.9);
      this.drawAxisArrow(anchor, neighborAnchor, relationColor, ally, axisScore);

      const midX = (anchor.x + neighborAnchor.x) / 2;
      const midY = (anchor.y + neighborAnchor.y) / 2;
      const lineAngle = Phaser.Math.Angle.Between(anchor.x, anchor.y, neighborAnchor.x, neighborAnchor.y);
      const offsetAngle = lineAngle + Math.PI / 2;
      const offsetDistance = ally ? -18 : 18;
      const plateX = midX + Math.cos(offsetAngle) * offsetDistance;
      const plateY = midY + Math.sin(offsetAngle) * offsetDistance;
      const plateW = ally ? 96 + axisScore * 4 : 106 + axisScore * 5;
      const plateH = 34;
      const plateBg = this.add.graphics();
      plateBg.fillStyle(ally ? 0x0f1a24 : 0x2a160d, 0.96);
      plateBg.fillRoundedRect(plateX - plateW / 2, plateY - plateH / 2, plateW, plateH, 11);
      plateBg.lineStyle(1.2, relationColor, ally ? 0.3 : 0.5);
      plateBg.strokeRoundedRect(plateX - plateW / 2, plateY - plateH / 2, plateW, plateH, 11);
      this.focusDecorations.push(plateBg);

      const plateKicker = this.add.text(plateX, plateY - 7, labelKicker, {
        fontFamily: FONTS.ui,
        fontSize: '8px',
        fontStyle: '700',
        color: ally ? '#9cc7ff' : COLORS_CSS.accent,
      }).setOrigin(0.5);
      plateKicker.setShadow(0, 0, '#000000', 6, false, true);
      this.focusDecorations.push(plateKicker);
      const plateText = this.add.text(plateX, plateY + 7, `${neighbor.name} 방면`, {
        fontFamily: FONTS.ui,
        fontSize: ally ? '10px' : '11px',
        fontStyle: '700',
        color: COLORS_CSS.textBright,
      }).setOrigin(0.5);
      plateText.setShadow(0, 0, '#000000', 6, false, true);
      this.focusDecorations.push(plateText);

      if (!ally) {
        const angle = Phaser.Math.Angle.Between(neighborAnchor.x, neighborAnchor.y, anchor.x, anchor.y);
        const arrowX = plateX + Math.cos(angle) * 32;
        const arrowY = plateY + Math.sin(angle) * 32;
        const arrow = this.add.graphics();
        arrow.fillStyle(COLORS.accent, 0.9);
        arrow.beginPath();
        arrow.moveTo(arrowX, arrowY);
        arrow.lineTo(
          arrowX - Math.cos(angle - 0.55) * 12,
          arrowY - Math.sin(angle - 0.55) * 12,
        );
        arrow.lineTo(
          arrowX - Math.cos(angle + 0.55) * 12,
          arrowY - Math.sin(angle + 0.55) * 12,
        );
        arrow.closePath();
        arrow.fillPath();
        this.focusDecorations.push(arrow);
      }
    });

    const sortedAllyAxes = [...allyAxes].sort((a, b) => (b.army || 0) - (a.army || 0));
    const sortedEnemyAxes = [...enemyAxes].sort((a, b) => (b.army || 0) - (a.army || 0));
    this.drawSelectedCityBrief(anchor, liveCity, sortedAllyAxes, sortedEnemyAxes, cityMeta);

    this.focusGraphics.fillStyle(COLORS.accent, 0.08);
    this.focusGraphics.fillCircle(anchor.x, anchor.y, cityMeta.baseR + 14);
    this.focusGraphics.lineStyle(2, COLORS.accent, 0.95);
    this.focusGraphics.strokeCircle(anchor.x, anchor.y, cityMeta.baseR + 10);
    this.focusGraphics.lineStyle(1.2, cityMeta.fc.primary, 0.56);
    this.focusGraphics.strokeCircle(anchor.x, anchor.y, cityMeta.baseR + 22);
    this.focusGraphics.lineBetween(anchor.x - (cityMeta.baseR + 24), anchor.y, anchor.x - (cityMeta.baseR + 12), anchor.y);
    this.focusGraphics.lineBetween(anchor.x + (cityMeta.baseR + 12), anchor.y, anchor.x + (cityMeta.baseR + 24), anchor.y);
    this.focusGraphics.lineBetween(anchor.x, anchor.y - (cityMeta.baseR + 24), anchor.x, anchor.y - (cityMeta.baseR + 12));
    this.focusGraphics.lineBetween(anchor.x, anchor.y + (cityMeta.baseR + 12), anchor.x, anchor.y + (cityMeta.baseR + 24));

    this.focusPulse = this.add.circle(anchor.x, anchor.y, cityMeta.baseR + 8, cityMeta.fc.primary, 0.08);
    this.focusPulse.setStrokeStyle(2, cityMeta.fc.primary, 0.6);
    this.tweens.add({
      targets: this.focusPulse,
      alpha: 0,
      scale: 1.55,
      duration: 880,
      ease: 'Sine.easeOut',
      repeat: -1,
    });
  }

  drawAxisArrow(anchor, neighborAnchor, color, ally, axisScore = 1) {
    const angle = Phaser.Math.Angle.Between(neighborAnchor.x, neighborAnchor.y, anchor.x, anchor.y);
    const ratio = ally ? 0.42 : 0.32;
    const arrowX = Phaser.Math.Linear(neighborAnchor.x, anchor.x, ratio);
    const arrowY = Phaser.Math.Linear(neighborAnchor.y, anchor.y, ratio);
    const arrow = this.add.graphics();
    arrow.fillStyle(color, ally ? 0.7 : 0.92);
    arrow.beginPath();
    arrow.moveTo(arrowX, arrowY);
    arrow.lineTo(
      arrowX - Math.cos(angle - 0.6) * (ally ? 9 + axisScore : 11 + axisScore),
      arrowY - Math.sin(angle - 0.6) * (ally ? 9 + axisScore : 11 + axisScore),
    );
    arrow.lineTo(
      arrowX - Math.cos(angle + 0.6) * (ally ? 9 + axisScore : 11 + axisScore),
      arrowY - Math.sin(angle + 0.6) * (ally ? 9 + axisScore : 11 + axisScore),
    );
    arrow.closePath();
    arrow.fillPath();
    this.focusDecorations.push(arrow);
  }

  scoreAxis(road, neighbor, ally) {
    const armyWeight = Math.min((neighbor.army || 0) / 18000, 3.2);
    const moraleWeight = Math.min((neighbor.morale || 50) / 32, 2.8);
    const importanceWeight = Math.min((neighbor.strategic_importance || 0) / 2.5, 3);
    const roadWeight = road.grade === 'major' ? 1.8 : 0.9;
    const stanceWeight = ally ? 0.6 : 1.2;
    return Math.max(1, Math.min(7, Math.round((armyWeight + moraleWeight + importanceWeight + roadWeight + stanceWeight) * 0.7)));
  }

  applySelectionEmphasis(selectedCityId, connectedIds = []) {
    this.focusConnectedIds = [...connectedIds];
    this.refreshCityPresentation();
  }

  getZoomBounds() {
    if (this.scene.isActive('ActionPanel')) {
      return { min: 0.72, max: 1.8 };
    }
    if (this.selectedCityId) {
      return { min: 0.55, max: 1.6 };
    }
    return { min: 0.45, max: 1.4 };
  }

  resolveZoomTier(zoom) {
    if (zoom <= ZOOM_TIERS.strategic.max) return 'strategic';
    if (zoom <= ZOOM_TIERS.frontline.max) return 'frontline';
    return 'local';
  }

  refreshSemanticZoom(force = false) {
    const cam = this.cameras.main;
    if (!cam) return;

    const bounds = this.getZoomBounds();
    const clampedZoom = Phaser.Math.Clamp(cam.zoom, bounds.min, bounds.max);
    if (clampedZoom !== cam.zoom) {
      cam.zoom = clampedZoom;
    }

    const tier = this.resolveZoomTier(cam.zoom);
    if (!force && tier === this.zoomTier && Math.abs((this.lastZoom ?? cam.zoom) - cam.zoom) < 0.01) {
      return;
    }
    this.zoomTier = tier;
    this.lastZoom = cam.zoom;

    const waterAlpha = tier === 'strategic' ? 0.92 : tier === 'frontline' ? 0.74 : 0.52;
    const ridgeAlpha = tier === 'strategic' ? 0.92 : tier === 'frontline' ? 0.7 : 0.46;
    const territoryAlpha = tier === 'strategic' ? 1 : tier === 'frontline' ? 0.84 : 0.72;
    const majorRoadAlpha = tier === 'strategic' ? 0.34 : tier === 'frontline' ? 0.82 : 0.88;
    const minorRoadAlpha = tier === 'strategic' ? 0 : tier === 'frontline' ? 0.34 : 0.62;

    if (this.terrainGraphics.water) this.terrainGraphics.water.setAlpha(waterAlpha);
    if (this.terrainGraphics.ridges) this.terrainGraphics.ridges.setAlpha(ridgeAlpha);
    if (this.terrainGraphics.territories) this.terrainGraphics.territories.setAlpha(territoryAlpha);
    if (this.terrainGraphics.majorRoads) this.terrainGraphics.majorRoads.setAlpha(majorRoadAlpha);
    if (this.terrainGraphics.minorRoads) {
      this.terrainGraphics.minorRoads.setVisible(minorRoadAlpha > 0.02);
      this.terrainGraphics.minorRoads.setAlpha(minorRoadAlpha);
    }

    this.regionLabels.forEach((label) => {
      const alpha = tier === 'strategic' ? 0.2 : tier === 'frontline' ? 0.1 : 0;
      label.setAlpha(alpha);
      label.setVisible(alpha > 0.01);
    });
    this.landmarkLabels.forEach((label) => {
      const alpha = tier === 'strategic' ? 0.32 : tier === 'frontline' ? 0.24 : 0.12;
      label.setAlpha(alpha);
      label.setVisible(alpha > 0.01);
    });
    this.frontlineGraphics.forEach(({ gfx, pair }) => {
      const highlighted = this.selectedCityId && pair?.includes(this.selectedCityId);
      const alpha = tier === 'strategic'
        ? (highlighted ? 0.78 : 0.34)
        : tier === 'frontline'
          ? (highlighted ? 0.9 : 0.48)
          : (highlighted ? 0.32 : 0.08);
      gfx.setAlpha(alpha);
      gfx.setVisible(alpha > 0.03);
    });
    this.focusZoneGraphics.forEach(({ gfx, label, factionId, baseAlpha }) => {
      const isPlayerZone = factionId === this.factionId;
      const alpha = tier === 'strategic'
        ? (isPlayerZone ? baseAlpha + 0.1 : baseAlpha + 0.02)
        : tier === 'frontline'
          ? (isPlayerZone ? baseAlpha + 0.04 : baseAlpha * 0.7)
          : (isPlayerZone ? 0.06 : 0.03);
      gfx.setAlpha(alpha);
      gfx.setVisible(alpha > 0.02);
      const labelAlpha = tier === 'strategic' ? (isPlayerZone ? 0.3 : 0.18) : tier === 'frontline' ? 0.12 : 0;
      label.setAlpha(labelAlpha);
      label.setVisible(labelAlpha > 0.01);
    });

    this.refreshCityPresentation();
    EventBus.emit(EVENTS.MAP_CONTEXT_CHANGED, {
      zoomTier: this.zoomTier,
      selectedCityId: this.selectedCityId,
      connectedIds: [...this.focusConnectedIds],
    });
  }

  refreshCityPresentation() {
    const highlighted = new Set([this.selectedCityId, ...this.focusConnectedIds].filter(Boolean));
    Object.entries(this.cityGraphics).forEach(([cityId, cg]) => {
      const isSelected = cityId === this.selectedCityId;
      const isConnected = highlighted.has(cityId) && !isSelected;
      const strategicCity = cg.isCapital || cg.importance >= 8;
      const frontlineCity = strategicCity || cg.importance >= 6 || isConnected || isSelected;

      let tierMarkerAlpha = 1;
      let tierDetailAlpha = 0.92;
      if (this.zoomTier === 'strategic') {
        tierMarkerAlpha = strategicCity ? 0.88 : 0.16;
        tierDetailAlpha = strategicCity ? 0.56 : 0;
      } else if (this.zoomTier === 'frontline') {
        tierMarkerAlpha = frontlineCity ? 0.88 : 0.38;
        tierDetailAlpha = frontlineCity ? 0.7 : 0.16;
      }

      const markerAlpha = !this.selectedCityId ? tierMarkerAlpha : isSelected ? 1 : isConnected ? tierMarkerAlpha * 0.8 : tierMarkerAlpha * 0.26;
      const detailAlpha = !this.selectedCityId ? tierDetailAlpha : isSelected ? 1 : isConnected ? tierDetailAlpha * 0.82 : tierDetailAlpha * 0.18;
      const depth = isSelected ? 60 : isConnected ? 34 : 14;

      cg.gfx.setAlpha(markerAlpha);
      cg.gfx.setDepth(depth);
      cg.armyBar?.setAlpha(detailAlpha);
      cg.armyBar?.setVisible(detailAlpha > 0.02);
      cg.armyBar?.setDepth(depth - 1);
      cg.label?.setAlpha(detailAlpha);
      cg.label?.setVisible(detailAlpha > 0.02);
      cg.label?.setDepth(depth + 1);
      cg.labelBg?.setAlpha(detailAlpha);
      cg.labelBg?.setVisible(detailAlpha > 0.02);
      cg.labelBg?.setDepth(depth);
      if (cg.label) {
        cg.label.setScale(isSelected ? 1.06 : strategicCity && this.zoomTier === 'strategic' ? 1.02 : 1);
      }
    });
  }

  drawSelectedCityBrief(anchor, city, allyAxes, enemyAxes, cityMeta) {
    if (!city) return;

    const importance = city.strategic_importance || 0;
    const doctrine = enemyAxes.length >= 2
      ? '주공 방어선'
      : enemyAxes.length === 1
        ? '접적 전선'
        : allyAxes.length >= 2
          ? '집결 거점'
          : '배후 거점';
    const mw = this.mapW || WORLD_W;
    const mh = this.mapH || WORLD_H;
    const positionX = Phaser.Math.Clamp(
      anchor.x + (anchor.x < mw * 0.56 ? 194 : -194),
      160,
      mw - 160,
    );
    const positionY = Phaser.Math.Clamp(
      anchor.y + (anchor.y < mh * 0.48 ? 110 : -110),
      74,
      mh - 82,
    );
    const briefW = 236;
    const briefH = 124;
    const isRight = positionX > anchor.x;

    this.focusGraphics.lineStyle(2.4, cityMeta.fc.primary, 0.22);
    this.focusGraphics.lineBetween(
      anchor.x + (isRight ? cityMeta.baseR + 16 : -(cityMeta.baseR + 16)),
      anchor.y - 8,
      positionX + (isRight ? -briefW / 2 + 18 : briefW / 2 - 18),
      positionY - 16,
    );

    const plate = this.add.graphics();
    plate.fillStyle(0x08090d, 0.94);
    plate.fillRoundedRect(positionX - briefW / 2, positionY - briefH / 2, briefW, briefH, 18);
    plate.fillStyle(cityMeta.fc.badge, 0.08);
    plate.fillRoundedRect(positionX - briefW / 2, positionY - briefH / 2, briefW, 34, 18);
    plate.lineStyle(1.4, cityMeta.fc.primary, 0.42);
    plate.strokeRoundedRect(positionX - briefW / 2, positionY - briefH / 2, briefW, briefH, 18);
    this.focusDecorations.push(plate);

    const kicker = this.add.text(positionX - 98, positionY - 44, '전장 브리프', {
      fontFamily: FONTS.ui,
      fontSize: '8px',
      fontStyle: '700',
      color: cityMeta.fc.css,
    }).setOrigin(0, 0.5);
    this.focusDecorations.push(kicker);

    const title = this.add.text(positionX - 98, positionY - 25, `${city.name} · ${doctrine}`, {
      fontFamily: FONTS.title,
      fontSize: '16px',
      fontStyle: '700',
      color: COLORS_CSS.textBright,
    }).setOrigin(0, 0.5);
    this.focusDecorations.push(title);

    const summary = this.add.text(positionX - 98, positionY - 6, this.describeBriefSummary(city, enemyAxes, allyAxes, importance), {
      fontFamily: FONTS.ui,
      fontSize: '10px',
      fontStyle: '600',
      color: COLORS_CSS.textDim,
      wordWrap: { width: 178 },
      lineSpacing: 2,
    }).setOrigin(0, 0);
    this.focusDecorations.push(summary);

    const stats = [
      { label: '병력', value: this.formatCompact(city.army || 0), color: '#f2d8aa' },
      { label: '사기', value: `${city.morale || 0}`, color: city.morale >= 65 ? '#98d889' : '#f7b267' },
      { label: '압박', value: `${enemyAxes.length}`, color: COLORS_CSS.accent },
      { label: '지원', value: `${allyAxes.length}`, color: '#8bbcff' },
    ];
    stats.forEach((stat, index) => {
      const x = positionX - 98 + index * 54;
      const statLabel = this.add.text(x, positionY + 35, stat.label, {
        fontFamily: FONTS.ui,
        fontSize: '8px',
        fontStyle: '700',
        color: COLORS_CSS.textDim,
      }).setOrigin(0, 0.5);
      this.focusDecorations.push(statLabel);
      const statValue = this.add.text(x, positionY + 50, stat.value, {
        fontFamily: FONTS.ui,
        fontSize: '12px',
        fontStyle: '700',
        color: stat.color,
      }).setOrigin(0, 0.5);
      this.focusDecorations.push(statValue);
    });
  }

  describeBriefSummary(city, enemyAxes, allyAxes, importance) {
    if (enemyAxes.length >= 2) {
      return `${enemyAxes[0]?.name || '북측'} · ${enemyAxes[1]?.name || '서측'} 압박을 함께 받는 핵심 전선`;
    }
    if (enemyAxes.length === 1) {
      return `${enemyAxes[0]?.name || '인접 적군'}과 맞붙는 접적 거점. 병참선 유지가 우선`;
    }
    if (allyAxes.length >= 2) {
      return `${allyAxes[0]?.name || '후방'}과 ${allyAxes[1]?.name || '인접 거점'}에서 병참을 받는 집결지`;
    }
    if (importance >= 8) {
      return '지형상 비중이 큰 전략 요충지. 배치와 보급 결정을 먼저 잠가야 한다';
    }
    return '주전장으로 키울 수 있는 보조 거점. 병력과 보급을 정리해 다음 전선을 준비한다';
  }

  formatCompact(value) {
    if (value >= 10000) {
      return `${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}k`;
    }
    return `${value}`;
  }

  focusCameraOnCity(cityId) {
    const anchor = this.cityAnchors[cityId];
    if (!anchor) return;
    const cam = this.cameras.main;
    const roads = this.scenario.mapLayout?.roads || [];
    const connected = roads
      .filter((road) => road.from === cityId || road.to === cityId)
      .map((road) => {
        const neighborId = road.from === cityId ? road.to : road.from;
        const neighbor = this.gameplay?.state?.getCity(neighborId) || this.scenario.cities[neighborId];
        const neighborAnchor = this.cityAnchors[neighborId];
        if (!neighbor || !neighborAnchor) return null;
        const score = (road.grade === 'major' ? 2 : 1)
          + ((neighbor.army || 0) / 18000)
          + ((neighbor.morale || 50) / 45)
          + ((neighbor.strategic_importance || 0) / 3)
          + (neighbor.owner === this.factionId ? 0.7 : 1.4);
        return { neighborAnchor, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);

    const framePoints = [anchor, ...connected.map((entry) => entry.neighborAnchor)];
    const minX = Math.min(...framePoints.map((point) => point.x));
    const maxX = Math.max(...framePoints.map((point) => point.x));
    const minY = Math.min(...framePoints.map((point) => point.y));
    const maxY = Math.max(...framePoints.map((point) => point.y));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const span = Math.max(maxX - minX, (maxY - minY) * 1.1, 300);
    const bounds = this.getZoomBounds();
    const targetZoom = Phaser.Math.Clamp(900 / span, Math.max(0.72, bounds.min), Math.min(1.2, bounds.max));

    cam.pan(centerX, centerY, 240, 'Sine.easeOut', true);
    if (targetZoom !== cam.zoom) {
      cam.zoomTo(targetZoom, 240, 'Sine.easeOut', true);
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
      const bounds = this.getZoomBounds();
      const newZoom = Phaser.Math.Clamp(cam.zoom + zoomDelta, bounds.min, bounds.max);
      cam.zoom = newZoom;
      this.refreshSemanticZoom();
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

    this.refreshSemanticZoom();

    if (this.cursors?.left.isDown || this.wasd?.left.isDown) cam.scrollX -= speed;
    if (this.cursors?.right.isDown || this.wasd?.right.isDown) cam.scrollX += speed;
    if (this.cursors?.up.isDown || this.wasd?.up.isDown) cam.scrollY -= speed;
    if (this.cursors?.down.isDown || this.wasd?.down.isDown) cam.scrollY += speed;

    // Leaflet 타일맵 동기화 — Phaser 카메라 → Leaflet 뷰
    syncLeafletToCamera(cam);
  }
}
