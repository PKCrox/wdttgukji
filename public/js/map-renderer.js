const DEFAULT_W = 1600;
const DEFAULT_H = 900;
const LEGACY_W = 920;
const LEGACY_H = 700;

export const MAP_FACTION_PALETTE = {
  wei: {
    fill: 'rgba(98, 129, 167, 0.28)',
    edge: '#8ca8c8',
    glow: 'rgba(162, 190, 223, 0.32)',
    badge: '#6d8db0',
    badgeDark: '#304357',
  },
  shu: {
    fill: 'rgba(90, 132, 90, 0.3)',
    edge: '#9eb78e',
    glow: 'rgba(173, 201, 149, 0.3)',
    badge: '#658d63',
    badgeDark: '#314731',
  },
  wu: {
    fill: 'rgba(162, 96, 79, 0.28)',
    edge: '#d29b84',
    glow: 'rgba(222, 160, 141, 0.26)',
    badge: '#ae6857',
    badgeDark: '#513128',
  },
  liu_zhang: {
    fill: 'rgba(171, 137, 75, 0.26)',
    edge: '#d4ba7d',
    glow: 'rgba(216, 192, 130, 0.24)',
    badge: '#a98349',
    badgeDark: '#4e3d1f',
  },
  zhang_lu: {
    fill: 'rgba(132, 101, 152, 0.25)',
    edge: '#c4a8d4',
    glow: 'rgba(197, 167, 218, 0.22)',
    badge: '#8a6a9d',
    badgeDark: '#43314b',
  },
  neutral: {
    fill: 'rgba(118, 110, 93, 0.22)',
    edge: '#b8a98d',
    glow: 'rgba(207, 192, 163, 0.18)',
    badge: '#7b705d',
    badgeDark: '#3b3429',
  },
};

const ROAD_STYLE = {
  major: {
    base: 'rgba(38, 28, 19, 0.64)',
    line: 'rgba(213, 183, 122, 0.5)',
    width: 10,
    glow: 'rgba(233, 214, 177, 0.16)',
  },
  normal: {
    base: 'rgba(30, 24, 18, 0.46)',
    line: 'rgba(189, 165, 117, 0.24)',
    width: 6,
    glow: 'rgba(224, 204, 168, 0.08)',
  },
};

export function resolveMapLayout(scenario) {
  const base = scenario?.mapLayout || {};
  const safeBounds = {
    left: 80,
    top: 60,
    right: 1520,
    bottom: 840,
    ...(base.safeBounds || {}),
  };
  const generatedAnchors = projectLegacyAnchors(scenario.cityPositions || {}, safeBounds);
  const cityAnchors = {
    ...generatedAnchors,
    ...(base.cityAnchors || {}),
  };

  const layout = {
    baseAsset: base.baseAsset || '/assets/maps/red-cliffs-base.svg',
    designWidth: base.designWidth || DEFAULT_W,
    designHeight: base.designHeight || DEFAULT_H,
    safeBounds,
    cityAnchors,
    roads: base.roads || [],
    territoryPolygons: base.territoryPolygons || {},
    labels: base.labels || [],
    landmarks: base.landmarks || [],
    waterPolygons: base.waterPolygons || [],
    ridgePaths: base.ridgePaths || [],
    frontlineAnchors: base.frontlineAnchors || [],
    cityBadgeOffsets: {
      ...generateAutoBadgeOffsets(cityAnchors, safeBounds),
      ...(base.cityBadgeOffsets || {}),
    },
    focusZones: base.focusZones || [],
  };

  layout.roads = buildRoads(scenario, layout);
  return layout;
}

export function measureMapViewport(layout, width, height) {
  const designWidth = layout.designWidth || DEFAULT_W;
  const designHeight = layout.designHeight || DEFAULT_H;
  const scale = Math.min(width / designWidth, height / designHeight);
  const offsetX = (width - designWidth * scale) / 2;
  const offsetY = (height - designHeight * scale) / 2;

  return {
    width,
    height,
    scale,
    offsetX,
    offsetY,
    designWidth,
    designHeight,
  };
}

export class MapRenderer {
  constructor(canvas, scenario) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scenario = scenario;
    this.layout = resolveMapLayout(scenario);
    this.positions = Object.fromEntries(
      Object.entries(this.layout.cityAnchors).filter(([cityId]) => scenario.cities?.[cityId])
    );
    this.connections = scenario.connections || [];
    this.roads = this.layout.roads || buildRoads(scenario, this.layout);
    this.selectedCity = null;
    this.hoveredCity = null;
    this.eventCities = new Map();
    this.movements = [];
    this.viewport = null;
    this._lastState = null;
    this._animFrame = null;
    this._animating = false;
    this._boundResize = () => {
      this._resize();
      if (this._lastState) this.render(this._lastState);
    };

    this._resize();
    window.addEventListener('resize', this._boundResize);
  }

  _resize() {
    const container = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;
    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewport = measureMapViewport(this.layout, width, height);
  }

  _toWorld(screenX, screenY) {
    const { offsetX, offsetY, scale } = this.viewport;
    return {
      x: (screenX - offsetX) / scale,
      y: (screenY - offsetY) / scale,
    };
  }

  _toScreen(worldX, worldY) {
    const { offsetX, offsetY, scale } = this.viewport;
    return {
      x: worldX * scale + offsetX,
      y: worldY * scale + offsetY,
    };
  }

  hitTest(screenX, screenY) {
    const world = this._toWorld(screenX, screenY);
    let closest = null;
    let bestDistance = Infinity;

    for (const [cityId, anchor] of Object.entries(this.positions)) {
      const distance = Math.hypot(world.x - anchor.x, world.y - anchor.y);
      const threshold = 34;
      if (distance < threshold && distance < bestDistance) {
        bestDistance = distance;
        closest = cityId;
      }
    }

    return closest;
  }

  addEventPulse(cityId, color = '#D4B36C') {
    this.eventCities.set(cityId, {
      color,
      startedAt: Date.now(),
    });
    this._startAnim();
  }

  clearEventPulses() {
    this.eventCities.clear();
  }

  animateMovements(movements) {
    if (!movements?.length) return;
    for (const move of movements) {
      this.movements.push({
        ...move,
        startedAt: Date.now(),
        duration: move.type === 'attack' ? 1300 : 900,
      });
    }
    this._startAnim();
  }

  _startAnim() {
    if (this._animating) return;
    this._animating = true;

    const tick = () => {
      const now = Date.now();
      for (const [cityId, pulse] of this.eventCities.entries()) {
        if (now - pulse.startedAt > 3200) {
          this.eventCities.delete(cityId);
        }
      }
      this.movements = this.movements.filter(move => now - move.startedAt < move.duration);

      if (!this.eventCities.size && !this.movements.length) {
        this._animating = false;
        if (this._lastState) this.render(this._lastState);
        return;
      }

      if (this._lastState) this.render(this._lastState);
      this._animFrame = requestAnimationFrame(tick);
    };

    this._animFrame = requestAnimationFrame(tick);
  }

  render(state) {
    this._lastState = state;
    const ctx = this.ctx;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    ctx.clearRect(0, 0, width, height);

    this._drawFocusZones(ctx);
    this._drawWaterPolygons(ctx);
    this._drawTerritories(ctx, state);
    this._drawRidgePaths(ctx);
    this._drawRoads(ctx, state);
    this._drawFrontlines(ctx, state);
    this._drawMovements(ctx);
    this._drawEventPulses(ctx);
    this._drawCities(ctx, state);
    this._drawEdgeShade(ctx, width, height);
  }

  _drawFocusZones(ctx) {
    for (const zone of this.layout.focusZones || []) {
      const center = this._toScreen(zone.x, zone.y);
      const radius = (zone.radius || 180) * this.viewport.scale;
      const palette = MAP_FACTION_PALETTE[zone.factionId] || MAP_FACTION_PALETTE.neutral;
      const gradient = ctx.createRadialGradient(center.x, center.y, radius * 0.1, center.x, center.y, radius);
      gradient.addColorStop(0, addAlpha(palette.glow, zone.alpha || 0.18));
      gradient.addColorStop(1, addAlpha(palette.glow, 0));
      ctx.save();
      ctx.fillStyle = gradient;
      ctx.fillRect(center.x - radius, center.y - radius, radius * 2, radius * 2);
      ctx.restore();
    }
  }

  _drawWaterPolygons(ctx) {
    for (const polygon of this.layout.waterPolygons || []) {
      const points = polygon.points || [];
      if (!points.length) continue;
      ctx.save();
      drawPolygon(ctx, points, this.viewport);
      const extent = getExtent(points);
      const center = this._toScreen(extent.minX + extent.width / 2, extent.minY + extent.height / 2);
      const radius = Math.max(extent.width, extent.height) * this.viewport.scale * 0.8;
      const gradient = ctx.createRadialGradient(center.x, center.y, radius * 0.1, center.x, center.y, radius);
      gradient.addColorStop(0, 'rgba(105, 151, 182, 0.22)');
      gradient.addColorStop(1, 'rgba(55, 93, 118, 0.04)');
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = polygon.kind === 'river' ? 'rgba(177, 211, 226, 0.22)' : 'rgba(147, 181, 198, 0.16)';
      ctx.lineWidth = (polygon.kind === 'river' ? 2.2 : 1.4) * this.viewport.scale;
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawTerritories(ctx, state) {
    const drawOrder = ['liu_zhang', 'zhang_lu', 'shu', 'wu', 'wei'];
    const selectedOwner = this.selectedCity ? state.cities[this.selectedCity]?.owner : null;

    for (const factionId of drawOrder) {
      const points = this.layout.territoryPolygons?.[factionId];
      if (!points?.length) continue;

      const style = MAP_FACTION_PALETTE[factionId] || MAP_FACTION_PALETTE.neutral;
      const centroid = getCentroid(points);
      const center = this._toScreen(centroid.x, centroid.y);
      const extent = getExtent(points);
      const radius = Math.max(extent.width, extent.height) * this.viewport.scale * 0.7;
      const highlight = selectedOwner === factionId || state.player.factionId === factionId;
      const alpha = highlight ? 0.38 : 0.28;

      ctx.save();
      drawPolygon(ctx, points, this.viewport);
      const gradient = ctx.createRadialGradient(center.x, center.y, radius * 0.12, center.x, center.y, radius);
      gradient.addColorStop(0, addAlpha(style.glow, highlight ? 0.42 : 0.24));
      gradient.addColorStop(0.55, addAlpha(style.fill, alpha));
      gradient.addColorStop(1, addAlpha(style.fill, 0.14));
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.clip();
      drawHatching(ctx, points, this.viewport, style.edge, highlight ? 0.11 : 0.06);
      ctx.restore();

      ctx.save();
      drawPolygon(ctx, points, this.viewport);
      ctx.strokeStyle = 'rgba(24, 18, 12, 0.72)';
      ctx.lineWidth = 8 * this.viewport.scale;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.strokeStyle = highlight ? style.edge : addAlpha(style.edge, 0.66);
      ctx.lineWidth = 2.2 * this.viewport.scale;
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawRidgePaths(ctx) {
    for (const ridge of this.layout.ridgePaths || []) {
      const points = ridge.points || [];
      if (points.length < 2) continue;
      const width = (ridge.thickness || 18) * this.viewport.scale;
      ctx.save();
      ctx.beginPath();
      drawPolyline(ctx, points, this.viewport);
      ctx.strokeStyle = 'rgba(26, 18, 13, 0.42)';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = width;
      ctx.stroke();

      ctx.beginPath();
      drawPolyline(ctx, points, this.viewport);
      ctx.strokeStyle = 'rgba(194, 178, 144, 0.18)';
      ctx.lineWidth = width * 0.46;
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawRoads(ctx, state) {
    const selected = this.selectedCity;

    for (const road of this.roads) {
      const from = this.positions[road.from];
      const to = this.positions[road.to];
      if (!from || !to) continue;

      const selectedBoost = selected && (road.from === selected || road.to === selected);
      const localContext = selected && (isConnected(this.connections, selected, road.from) || isConnected(this.connections, selected, road.to));
      const front = selected && isConnected(this.connections, selected, road.from) && isConnected(this.connections, selected, road.to);
      if (!selected && road.grade === 'normal' && road.kind === 'road') continue;
      if (selected && !selectedBoost && !localContext && road.grade === 'normal' && road.kind === 'road') continue;
      const emphasis = selectedBoost ? 'focused' : localContext || front ? 'context' : 'ambient';
      const style = getRoadDescriptor(road, emphasis);
      const control = getRoadControl(from, to, road.grade, road.curve);
      const fromScreen = this._toScreen(from.x, from.y);
      const toScreen = this._toScreen(to.x, to.y);
      const controlScreen = this._toScreen(control.x, control.y);

      ctx.save();
      ctx.lineCap = 'round';
      ctx.setLineDash(style.baseDash || []);
      ctx.beginPath();
      ctx.moveTo(fromScreen.x, fromScreen.y);
      ctx.quadraticCurveTo(controlScreen.x, controlScreen.y, toScreen.x, toScreen.y);
      ctx.strokeStyle = style.base;
      ctx.lineWidth = style.width * this.viewport.scale;
      ctx.stroke();

      ctx.setLineDash(style.lineDash || []);
      ctx.beginPath();
      ctx.moveTo(fromScreen.x, fromScreen.y);
      ctx.quadraticCurveTo(controlScreen.x, controlScreen.y, toScreen.x, toScreen.y);
      ctx.strokeStyle = style.line;
      ctx.lineWidth = (style.width * style.lineWidthRatio + (selectedBoost ? 0.8 : 0)) * this.viewport.scale;
      ctx.stroke();

      if (selectedBoost || front) {
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(fromScreen.x, fromScreen.y);
        ctx.quadraticCurveTo(controlScreen.x, controlScreen.y, toScreen.x, toScreen.y);
        ctx.strokeStyle = style.glow;
        ctx.lineWidth = (style.width + 10) * this.viewport.scale;
        ctx.filter = 'blur(6px)';
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  _drawFrontlines(ctx, state) {
    for (const [cityAId, cityBId] of this.connections) {
      const cityA = state.cities[cityAId];
      const cityB = state.cities[cityBId];
      if (!cityA || !cityB || !cityA.owner || !cityB.owner) continue;
      if (cityA.owner === cityB.owner) continue;

      const atWar = state.isAtWar(cityA.owner, cityB.owner);
      const playerEdge = cityA.owner === state.player.factionId || cityB.owner === state.player.factionId;
      if (!atWar && !playerEdge) continue;

      const from = this.positions[cityAId];
      const to = this.positions[cityBId];
      if (!from || !to) continue;
      const customPath = getFrontlinePath(this.layout.frontlineAnchors, cityAId, cityBId);

      ctx.save();
      ctx.beginPath();
      if (customPath) {
        drawPolyline(ctx, customPath, this.viewport);
      } else {
        const control = getRoadControl(from, to, 'major', 0.16);
        const fromScreen = this._toScreen(from.x, from.y);
        const toScreen = this._toScreen(to.x, to.y);
        const controlScreen = this._toScreen(control.x, control.y);
        ctx.moveTo(fromScreen.x, fromScreen.y);
        ctx.quadraticCurveTo(controlScreen.x, controlScreen.y, toScreen.x, toScreen.y);
      }
      ctx.setLineDash([10 * this.viewport.scale, 8 * this.viewport.scale]);
      ctx.lineCap = 'round';
      ctx.lineWidth = (atWar ? 4 : 3) * this.viewport.scale;
      ctx.strokeStyle = atWar ? 'rgba(214, 92, 71, 0.82)' : 'rgba(221, 190, 118, 0.6)';
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawMovements(ctx) {
    const now = Date.now();
    for (const move of this.movements) {
      const from = this.positions[move.from];
      const to = this.positions[move.to];
      if (!from || !to) continue;

      const progress = Math.min(1, (now - move.startedAt) / move.duration);
      const control = getRoadControl(from, to, 'major', 0.12);
      const point = evaluateQuadratic(from, control, to, progress);
      const head = evaluateQuadratic(from, control, to, Math.min(1, progress + 0.02));
      const screen = this._toScreen(point.x, point.y);
      const headScreen = this._toScreen(head.x, head.y);
      const angle = Math.atan2(headScreen.y - screen.y, headScreen.x - screen.x);
      const color = MAP_FACTION_PALETTE[move.factionId]?.edge || '#D7B270';

      ctx.save();
      ctx.beginPath();
      const fromScreen = this._toScreen(from.x, from.y);
      const controlScreen = this._toScreen(control.x, control.y);
      ctx.moveTo(fromScreen.x, fromScreen.y);
      ctx.quadraticCurveTo(controlScreen.x, controlScreen.y, screen.x, screen.y);
      ctx.strokeStyle = addAlpha(color, 0.5);
      ctx.lineWidth = 3 * this.viewport.scale;
      ctx.stroke();

      ctx.translate(screen.x, screen.y);
      ctx.rotate(angle);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-16 * this.viewport.scale, -8 * this.viewport.scale);
      ctx.lineTo(-12 * this.viewport.scale, 0);
      ctx.lineTo(-16 * this.viewport.scale, 8 * this.viewport.scale);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  _drawEventPulses(ctx) {
    const now = Date.now();
    for (const [cityId, pulse] of this.eventCities.entries()) {
      const anchor = this.positions[cityId];
      if (!anchor) continue;
      const age = (now - pulse.startedAt) / 3200;
      const screen = this._toScreen(anchor.x, anchor.y);
      const radius = (26 + age * 70) * this.viewport.scale;
      const opacity = Math.max(0, 0.52 - age * 0.5);

      ctx.save();
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = addAlpha(pulse.color, opacity);
      ctx.lineWidth = 4 * this.viewport.scale;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius * 0.55, 0, Math.PI * 2);
      ctx.strokeStyle = addAlpha(pulse.color, opacity * 0.7);
      ctx.lineWidth = 2 * this.viewport.scale;
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawCities(ctx, state) {
    const ordered = Object.entries(this.positions).sort(([, a], [, b]) => a.y - b.y);

    for (const [cityId, anchor] of ordered) {
      const city = state.cities[cityId];
      if (!city) continue;
      const owner = city.owner || 'neutral';
      const palette = MAP_FACTION_PALETTE[owner] || MAP_FACTION_PALETTE.neutral;
      const capital = city.owner && city.governor && state.factions[city.owner]?.leader === city.governor;
      const selected = cityId === this.selectedCity;
      const hovered = cityId === this.hoveredCity;
      const adjacent = this.selectedCity && isConnected(this.connections, cityId, this.selectedCity);
      const position = this._toScreen(anchor.x, anchor.y);
      const badgeOffset = this.layout.cityBadgeOffsets?.[cityId] || {};
      const importance = city.strategic_importance || 0;
      const baseSize = capital ? 20 : importance >= 8 ? 18 : importance >= 6 ? 16 : 14;
      const markerSize = (baseSize + (selected ? 4 : hovered ? 2 : 0)) * this.viewport.scale;

      drawTerrainHalo(ctx, position.x, position.y, markerSize, city.terrain?.type, selected, hovered, importance);

      if (selected || hovered) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(position.x, position.y, markerSize + 16 * this.viewport.scale, 0, Math.PI * 2);
        ctx.fillStyle = selected ? addAlpha(palette.edge, 0.18) : 'rgba(243, 223, 184, 0.08)';
        ctx.fill();
        ctx.restore();
      }

      drawSealMarker(ctx, position.x, position.y, markerSize, palette, capital, selected || hovered);

      if (capital) {
        drawStar(ctx, position.x, position.y - markerSize - 10 * this.viewport.scale, 6 * this.viewport.scale, '#E4C87E');
      }

      if (adjacent && !selected) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(position.x, position.y, markerSize + 7 * this.viewport.scale, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(228, 200, 126, 0.4)';
        ctx.lineWidth = 1.6 * this.viewport.scale;
        ctx.stroke();
        ctx.restore();
      }

      const armyText = formatArmyBadge(city.army);
      const badgeX = position.x + ((badgeOffset.badge?.[0] || 0) * this.viewport.scale);
      const badgeY = position.y + markerSize + 12 * this.viewport.scale + ((badgeOffset.badge?.[1] || 0) * this.viewport.scale);
      const labelX = position.x + ((badgeOffset.label?.[0] || 0) * this.viewport.scale);
      const labelY = position.y + markerSize + 33 * this.viewport.scale + ((badgeOffset.label?.[1] || 0) * this.viewport.scale);
      drawBadge(ctx, badgeX, badgeY, armyText, palette.badge, palette.badgeDark, this.viewport.scale);
      drawLabelPlaque(ctx, labelX, labelY, city.name, selected, this.viewport.scale);
      if (selected || hovered) {
        drawCityTerrainStrip(
          ctx,
          labelX + ((badgeOffset.terrain?.[0] || 0) * this.viewport.scale),
          labelY + 20 * this.viewport.scale + ((badgeOffset.terrain?.[1] || 0) * this.viewport.scale),
          city,
          selected ? palette.edge : '#D4C099',
          this.viewport.scale
        );
      }

      if (selected) {
        drawCommandRibbon(
          ctx,
          position.x + ((badgeOffset.command?.[0] || 0) * this.viewport.scale),
          position.y - markerSize - 24 * this.viewport.scale + ((badgeOffset.command?.[1] || 0) * this.viewport.scale),
          this.viewport.scale
        );
      } else if (hovered) {
        drawHintTag(ctx, position.x, position.y - markerSize - 18 * this.viewport.scale, state.factions[owner]?.name || '무주지', this.viewport.scale);
      }
    }
  }

  _drawEdgeShade(ctx, width, height) {
    const vignette = ctx.createRadialGradient(width * 0.52, height * 0.46, width * 0.12, width * 0.52, height * 0.46, width * 0.78);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(6, 4, 3, 0.46)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.fillRect(0, 0, width, 18);
    ctx.fillRect(0, height - 18, width, 18);
  }
}

function buildRoads(scenario, layout) {
  const lookup = new Map();
  const cityIds = new Set(Object.keys(scenario.cities || {}));

  for (const road of layout.roads || []) {
    if (!cityIds.has(road.from) || !cityIds.has(road.to)) continue;
    const key = pairKey(road.from, road.to);
    lookup.set(key, normalizeRoad(road, scenario, road.from, road.to));
  }

  for (const [from, to] of scenario.connections || []) {
    const key = pairKey(from, to);
    if (!lookup.has(key)) {
      lookup.set(key, inferRoad(from, to, scenario, layout));
    }
  }

  return [...lookup.values()];
}

function projectLegacyAnchors(cityPositions, safeBounds) {
  const anchors = {};
  const usableWidth = safeBounds.right - safeBounds.left;
  const usableHeight = safeBounds.bottom - safeBounds.top;

  for (const [cityId, pos] of Object.entries(cityPositions || {})) {
    anchors[cityId] = {
      x: Math.round(safeBounds.left + (pos.x / LEGACY_W) * usableWidth),
      y: Math.round(safeBounds.top + (pos.y / LEGACY_H) * usableHeight),
    };
  }

  return anchors;
}

function generateAutoBadgeOffsets(anchors, safeBounds) {
  const patterns = [
    { badge: [0, 0], label: [0, 0], command: [0, 0], terrain: [0, 0] },
    { badge: [24, -4], label: [30, -44], command: [34, -14], terrain: [34, -20] },
    { badge: [-24, -4], label: [-30, -44], command: [-34, -14], terrain: [-34, -20] },
    { badge: [28, 6], label: [32, -14], command: [34, -28], terrain: [32, 6] },
    { badge: [-28, 6], label: [-32, -14], command: [-34, -28], terrain: [-32, 6] },
    { badge: [0, 8], label: [0, 14], command: [0, -30], terrain: [0, 24] },
  ];
  const entries = Object.entries(anchors);
  const offsets = {};

  for (const [cityId, anchor] of entries) {
    let bestPattern = patterns[0];
    let bestScore = -Infinity;

    for (const pattern of patterns) {
      const labelPoint = {
        x: anchor.x + pattern.label[0],
        y: anchor.y + 30 + pattern.label[1],
      };
      const badgePoint = {
        x: anchor.x + pattern.badge[0],
        y: anchor.y + 14 + pattern.badge[1],
      };

      let score = 0;
      for (const [otherId, otherAnchor] of entries) {
        if (otherId === cityId) continue;
        const labelDistance = Math.hypot(labelPoint.x - otherAnchor.x, labelPoint.y - otherAnchor.y);
        const badgeDistance = Math.hypot(badgePoint.x - otherAnchor.x, badgePoint.y - otherAnchor.y);
        score += Math.min(labelDistance, 120) * 0.7 + Math.min(badgeDistance, 100) * 0.3;
        if (labelDistance < 68) score -= 140;
        if (badgeDistance < 44) score -= 90;
      }

      if (labelPoint.x < safeBounds.left + 40 || labelPoint.x > safeBounds.right - 40) score -= 120;
      if (labelPoint.y < safeBounds.top + 18 || labelPoint.y > safeBounds.bottom - 20) score -= 120;
      if (badgePoint.x < safeBounds.left + 24 || badgePoint.x > safeBounds.right - 24) score -= 80;
      if (badgePoint.y < safeBounds.top + 18 || badgePoint.y > safeBounds.bottom - 18) score -= 80;

      if (score > bestScore) {
        bestScore = score;
        bestPattern = pattern;
      }
    }

    offsets[cityId] = bestPattern;
  }

  return offsets;
}

function drawPolygon(ctx, points, viewport) {
  const first = projectPoint(points[0], viewport);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i += 1) {
    const point = projectPoint(points[i], viewport);
    ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
}

function drawPolyline(ctx, points, viewport) {
  const first = projectPoint(points[0], viewport);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i += 1) {
    const point = projectPoint(points[i], viewport);
    ctx.lineTo(point.x, point.y);
  }
}

function drawHatching(ctx, points, viewport, color, opacity) {
  const extent = getExtent(points);
  const padding = 40;
  ctx.save();
  ctx.strokeStyle = addAlpha(color, opacity);
  ctx.lineWidth = 1 * viewport.scale;
  const spacing = 28 * viewport.scale;
  const left = (extent.minX - padding) * viewport.scale + viewport.offsetX;
  const right = (extent.maxX + padding) * viewport.scale + viewport.offsetX;
  const top = (extent.minY - padding) * viewport.scale + viewport.offsetY;
  const bottom = (extent.maxY + padding) * viewport.scale + viewport.offsetY;

  for (let x = left - (bottom - top); x < right + (bottom - top); x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, bottom);
    ctx.lineTo(x + (bottom - top), top);
    ctx.stroke();
  }
  ctx.restore();
}

function getExtent(points) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function getCentroid(points) {
  let area = 0;
  let x = 0;
  let y = 0;

  for (let i = 0; i < points.length; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    x += (x0 + x1) * cross;
    y += (y0 + y1) * cross;
  }

  if (!area) return { x: points[0][0], y: points[0][1] };
  area *= 0.5;
  return {
    x: x / (6 * area),
    y: y / (6 * area),
  };
}

function getRoadControl(from, to, grade = 'normal', explicitCurve) {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const curve = explicitCurve ?? (grade === 'major' ? 0.09 : 0.05);
  const bias = Math.sin((from.x + to.y) * 0.01) >= 0 ? 1 : -1;

  return {
    x: midX + nx * length * curve * bias,
    y: midY + ny * length * curve * bias,
  };
}

function inferRoad(from, to, scenario, layout) {
  const kind = getConnectionKind(scenario, from, to);
  const cityA = scenario.cities?.[from];
  const cityB = scenario.cities?.[to];
  const strategicScore = (cityA?.strategic_importance || 0) + (cityB?.strategic_importance || 0);
  let grade = kind === 'river' ? 'major' : strategicScore >= 14 ? 'major' : 'normal';
  if (kind === 'mountain_pass' || kind === 'desert_road') grade = 'normal';

  const anchorA = layout.cityAnchors?.[from];
  const anchorB = layout.cityAnchors?.[to];
  const length = anchorA && anchorB ? Math.hypot(anchorA.x - anchorB.x, anchorA.y - anchorB.y) : 120;
  const curve = kind === 'river'
    ? 0.14
    : kind === 'mountain_pass'
      ? 0.18
      : length > 250
        ? 0.1
        : 0.06;

  return normalizeRoad({ from, to, grade, kind, curve }, scenario, from, to);
}

function normalizeRoad(road, scenario, from, to) {
  const kind = road.kind || getConnectionKind(scenario, from, to);
  return {
    ...road,
    kind,
    grade: road.grade || (kind === 'river' ? 'major' : 'normal'),
  };
}

function getConnectionKind(scenario, from, to) {
  return scenario.connectionTerrains?.[`${from}_${to}`]
    || scenario.connectionTerrains?.[`${to}_${from}`]
    || 'road';
}

function projectPoint(point, viewport) {
  return {
    x: point[0] * viewport.scale + viewport.offsetX,
    y: point[1] * viewport.scale + viewport.offsetY,
  };
}

function evaluateQuadratic(p0, p1, p2, t) {
  const inv = 1 - t;
  return {
    x: inv * inv * p0.x + 2 * inv * t * p1.x + t * t * p2.x,
    y: inv * inv * p0.y + 2 * inv * t * p1.y + t * t * p2.y,
  };
}

function drawTerrainHalo(ctx, x, y, markerSize, terrainType, selected, hovered, importance) {
  const accent = getTerrainAccent(terrainType);
  const radius = markerSize + (importance >= 8 ? 10 : 6);
  const alpha = selected ? 0.28 : hovered ? 0.2 : importance >= 8 ? 0.12 : 0.08;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = addAlpha(accent, alpha);
  ctx.fill();
  ctx.strokeStyle = addAlpha(accent, selected ? 0.42 : 0.18);
  ctx.lineWidth = (importance >= 8 ? 1.8 : 1.2) * 1;
  ctx.stroke();
  ctx.restore();
}

function drawSealMarker(ctx, x, y, size, palette, capital, focused) {
  const outer = size;
  const inner = size * 0.78;

  ctx.save();
  ctx.translate(x, y);

  ctx.beginPath();
  hexPath(ctx, outer);
  ctx.fillStyle = '#21160F';
  ctx.fill();

  ctx.beginPath();
  hexPath(ctx, outer);
  ctx.strokeStyle = focused ? '#F0D8A0' : addAlpha(palette.edge, 0.82);
  ctx.lineWidth = focused ? 2.4 : 1.8;
  ctx.stroke();

  ctx.beginPath();
  hexPath(ctx, inner);
  ctx.fillStyle = palette.badge;
  ctx.fill();

  ctx.beginPath();
  hexPath(ctx, inner * 0.58);
  ctx.fillStyle = 'rgba(255, 248, 236, 0.16)';
  ctx.fill();

  if (capital) {
    ctx.beginPath();
    ctx.arc(0, 0, inner * 0.26, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 244, 214, 0.75)';
    ctx.fill();
  }

  ctx.restore();
}

function hexPath(ctx, radius) {
  const angle = Math.PI / 3;
  ctx.moveTo(Math.cos(-Math.PI / 2) * radius, Math.sin(-Math.PI / 2) * radius);
  for (let i = 1; i <= 6; i += 1) {
    ctx.lineTo(
      Math.cos(-Math.PI / 2 + angle * i) * radius,
      Math.sin(-Math.PI / 2 + angle * i) * radius,
    );
  }
  ctx.closePath();
}

function drawStar(ctx, x, y, radius, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const step = i % 2 === 0 ? radius : radius * 0.42;
    const angle = -Math.PI / 2 + (Math.PI / 5) * i;
    const px = Math.cos(angle) * step;
    const py = Math.sin(angle) * step;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawBadge(ctx, x, y, text, fill, border, scale) {
  ctx.save();
  ctx.font = `${Math.max(10, 11 * scale)}px "Noto Sans KR", sans-serif`;
  const width = Math.max(34 * scale, ctx.measureText(text).width + 16 * scale);
  const height = 16 * scale;
  drawRoundedRect(ctx, x - width / 2, y - height / 2, width, height, 7 * scale);
  ctx.fillStyle = '#1B140F';
  ctx.fill();
  ctx.strokeStyle = addAlpha(border, 0.72);
  ctx.lineWidth = 1.2 * scale;
  ctx.stroke();
  drawRoundedRect(ctx, x - width / 2 + 2 * scale, y - height / 2 + 2 * scale, width - 4 * scale, height - 4 * scale, 6 * scale);
  ctx.fillStyle = addAlpha(fill, 0.9);
  ctx.fill();
  ctx.fillStyle = '#FFF8EA';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5 * scale);
  ctx.restore();
}

function drawLabelPlaque(ctx, x, y, text, selected, scale) {
  ctx.save();
  ctx.font = `${Math.max(11, 13 * scale)}px "Noto Serif KR", serif`;
  const width = Math.max(48 * scale, ctx.measureText(text).width + 18 * scale);
  const height = 20 * scale;
  drawRoundedRect(ctx, x - width / 2, y - height / 2, width, height, 6 * scale);
  ctx.fillStyle = selected ? 'rgba(33, 23, 16, 0.92)' : 'rgba(23, 16, 11, 0.84)';
  ctx.fill();
  ctx.strokeStyle = selected ? 'rgba(231, 210, 166, 0.54)' : 'rgba(192, 161, 104, 0.22)';
  ctx.lineWidth = 1 * scale;
  ctx.stroke();
  ctx.fillStyle = selected ? '#FFF3D3' : '#F0E4CB';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5 * scale);
  ctx.restore();
}

function drawCommandRibbon(ctx, x, y, scale) {
  ctx.save();
  ctx.font = `${Math.max(10, 11 * scale)}px "Noto Sans KR", sans-serif`;
  const text = '명령';
  const width = ctx.measureText(text).width + 18 * scale;
  const height = 18 * scale;
  drawRoundedRect(ctx, x - width / 2, y - height / 2, width, height, 8 * scale);
  ctx.fillStyle = 'rgba(212, 179, 108, 0.95)';
  ctx.fill();
  ctx.fillStyle = '#2B190D';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5 * scale);
  ctx.restore();
}

function drawHintTag(ctx, x, y, text, scale) {
  ctx.save();
  ctx.font = `${Math.max(10, 11 * scale)}px "Noto Sans KR", sans-serif`;
  const width = ctx.measureText(text).width + 16 * scale;
  const height = 18 * scale;
  drawRoundedRect(ctx, x - width / 2, y - height / 2, width, height, 8 * scale);
  ctx.fillStyle = 'rgba(24, 18, 12, 0.84)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(214, 195, 157, 0.28)';
  ctx.lineWidth = 1 * scale;
  ctx.stroke();
  ctx.fillStyle = '#F3E8CD';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5 * scale);
  ctx.restore();
}

function drawCityTerrainStrip(ctx, x, y, city, borderColor, scale) {
  const terrainLabel = TERRAIN_SHORT_LABEL[city.terrain?.type] || '지형';
  const agri = formatCityStat(city.agriculture);
  const comm = formatCityStat(city.commerce);
  const defense = formatCityStat(city.defense);
  const importance = city.strategic_importance ? `요충 ${city.strategic_importance}` : null;
  const text = [terrainLabel, `농 ${agri}`, `상 ${comm}`, `방 ${defense}`, importance].filter(Boolean).join(' · ');

  ctx.save();
  ctx.font = `${Math.max(9, 10 * scale)}px "Noto Sans KR", sans-serif`;
  const width = Math.max(96 * scale, ctx.measureText(text).width + 18 * scale);
  const height = 16 * scale;
  drawRoundedRect(ctx, x - width / 2, y - height / 2, width, height, 7 * scale);
  ctx.fillStyle = 'rgba(20, 14, 10, 0.84)';
  ctx.fill();
  ctx.strokeStyle = addAlpha(borderColor, 0.46);
  ctx.lineWidth = 1 * scale;
  ctx.stroke();
  ctx.fillStyle = '#EEDDB9';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5 * scale);
  ctx.restore();
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function formatArmyBadge(value) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}만`;
  if (value >= 1000) return `${Math.round(value / 1000)}천`;
  return String(value);
}

function pairKey(a, b) {
  return [a, b].sort().join(':');
}

function getRoadDescriptor(road, emphasis = 'ambient') {
  const basePreset = ROAD_STYLE[road.grade] || ROAD_STYLE.normal;
  const emphasisAlpha = emphasis === 'focused' ? 1 : emphasis === 'context' ? 0.78 : 0.46;

  if (road.kind === 'river') {
    return {
      base: `rgba(34, 58, 76, ${0.38 * emphasisAlpha})`,
      line: emphasis === 'focused' ? 'rgba(196, 226, 241, 0.92)' : `rgba(150, 194, 215, ${0.52 * emphasisAlpha})`,
      glow: `rgba(135, 187, 211, ${0.22 * emphasisAlpha})`,
      width: Math.max(5, basePreset.width - 1),
      lineWidthRatio: 0.34,
      baseDash: [],
      lineDash: [10, 7],
    };
  }

  if (road.kind === 'mountain_pass') {
    return {
      base: `rgba(25, 20, 15, ${0.52 * emphasisAlpha})`,
      line: emphasis === 'focused' ? 'rgba(234, 214, 168, 0.84)' : `rgba(182, 164, 124, ${0.4 * emphasisAlpha})`,
      glow: `rgba(214, 188, 137, ${0.14 * emphasisAlpha})`,
      width: Math.max(4, basePreset.width - 1.6),
      lineWidthRatio: 0.3,
      baseDash: [],
      lineDash: [7, 6],
    };
  }

  if (road.kind === 'desert_road') {
    return {
      base: `rgba(52, 37, 19, ${0.44 * emphasisAlpha})`,
      line: emphasis === 'focused' ? 'rgba(240, 205, 140, 0.9)' : `rgba(208, 176, 117, ${0.42 * emphasisAlpha})`,
      glow: `rgba(225, 182, 102, ${0.14 * emphasisAlpha})`,
      width: Math.max(4, basePreset.width - 1),
      lineWidthRatio: 0.34,
      baseDash: [],
      lineDash: [11, 8],
    };
  }

  return {
    base: basePreset.base.replace(/0\.\d+\)$/, `${0.55 * emphasisAlpha})`),
    line: emphasis === 'focused' ? 'rgba(246, 227, 176, 0.82)' : addAlpha(basePreset.line, 0.82 * emphasisAlpha),
    glow: addAlpha(basePreset.glow, 0.92 * emphasisAlpha),
    width: basePreset.width,
    lineWidthRatio: 0.42,
    baseDash: [],
    lineDash: [],
  };
}

function getFrontlinePath(frontlineAnchors, cityA, cityB) {
  return (frontlineAnchors || []).find((entry) => {
    const pair = entry.pair || [];
    return (pair[0] === cityA && pair[1] === cityB) || (pair[0] === cityB && pair[1] === cityA);
  })?.points || null;
}

function isConnected(connections, cityA, cityB) {
  return connections.some(([a, b]) =>
    (a === cityA && b === cityB) || (a === cityB && b === cityA)
  );
}

function addAlpha(color, alpha) {
  if (color.startsWith('rgba') || color.startsWith('rgb')) {
    const body = color.slice(color.indexOf('(') + 1, color.lastIndexOf(')'));
    const parts = body.split(',').map(part => part.trim());
    return `rgba(${parts.slice(0, 3).join(', ')}, ${alpha})`;
  }
  if (color.startsWith('#')) {
    const normalized = color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color;
    const r = parseInt(normalized.slice(1, 3), 16);
    const g = parseInt(normalized.slice(3, 5), 16);
    const b = parseInt(normalized.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

const TERRAIN_SHORT_LABEL = {
  plains: '평야',
  mountain: '산지',
  forest: '산림',
  river: '수변',
  coastal: '해안',
  desert: '사막',
};

function getTerrainAccent(terrainType) {
  switch (terrainType) {
    case 'mountain':
      return '#98836B';
    case 'forest':
      return '#7D9D65';
    case 'river':
      return '#76A8C2';
    case 'coastal':
      return '#89B8C6';
    case 'desert':
      return '#C6A266';
    default:
      return '#B79E74';
  }
}

function formatCityStat(value) {
  return Number.isFinite(value) ? Math.round(value) : '—';
}
