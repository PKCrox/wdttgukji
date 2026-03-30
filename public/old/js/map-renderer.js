const DEFAULT_W = 1600;
const DEFAULT_H = 900;
const LEGACY_W = 920;
const LEGACY_H = 700;

export const MAP_FACTION_PALETTE = {
  wei: {
    fill: 'rgba(98, 129, 167, 0.18)',
    edge: '#8ca8c8',
    glow: 'rgba(162, 190, 223, 0.22)',
    badge: '#6d8db0',
    badgeDark: '#304357',
  },
  shu: {
    fill: 'rgba(90, 132, 90, 0.19)',
    edge: '#9eb78e',
    glow: 'rgba(173, 201, 149, 0.2)',
    badge: '#658d63',
    badgeDark: '#314731',
  },
  wu: {
    fill: 'rgba(162, 96, 79, 0.18)',
    edge: '#d29b84',
    glow: 'rgba(222, 160, 141, 0.18)',
    badge: '#ae6857',
    badgeDark: '#513128',
  },
  liu_zhang: {
    fill: 'rgba(171, 137, 75, 0.17)',
    edge: '#d4ba7d',
    glow: 'rgba(216, 192, 130, 0.17)',
    badge: '#a98349',
    badgeDark: '#4e3d1f',
  },
  zhang_lu: {
    fill: 'rgba(132, 101, 152, 0.16)',
    edge: '#c4a8d4',
    glow: 'rgba(197, 167, 218, 0.16)',
    badge: '#8a6a9d',
    badgeDark: '#43314b',
  },
  neutral: {
    fill: 'rgba(118, 110, 93, 0.14)',
    edge: '#b8a98d',
    glow: 'rgba(207, 192, 163, 0.12)',
    badge: '#7b705d',
    badgeDark: '#3b3429',
  },
};

const SELECTION_TONE_STYLE = {
  selection: {
    roadGlow: 'rgba(228, 200, 126, 0.28)',
    frontGlow: 'rgba(240, 208, 132, 0.22)',
    cityRing: '#d7bf7f',
    cityFill: 'rgba(215, 191, 127, 0.18)',
  },
  hostile: {
    roadGlow: 'rgba(214, 108, 86, 0.28)',
    frontGlow: 'rgba(228, 118, 92, 0.24)',
    cityRing: '#d8846f',
    cityFill: 'rgba(216, 132, 111, 0.2)',
  },
  opportunity: {
    roadGlow: 'rgba(122, 170, 116, 0.26)',
    frontGlow: 'rgba(144, 195, 127, 0.22)',
    cityRing: '#8eb679',
    cityFill: 'rgba(142, 182, 121, 0.18)',
  },
  fortify: {
    roadGlow: 'rgba(111, 146, 182, 0.28)',
    frontGlow: 'rgba(128, 163, 201, 0.24)',
    cityRing: '#7f9fc4',
    cityFill: 'rgba(127, 159, 196, 0.2)',
  },
  military: {
    roadGlow: 'rgba(174, 118, 94, 0.28)',
    frontGlow: 'rgba(190, 128, 102, 0.24)',
    cityRing: '#c38d72',
    cityFill: 'rgba(195, 141, 114, 0.2)',
  },
  diplomacy: {
    roadGlow: 'rgba(150, 108, 178, 0.28)',
    frontGlow: 'rgba(165, 122, 194, 0.24)',
    cityRing: '#ab87cb',
    cityFill: 'rgba(171, 135, 203, 0.2)',
  },
  victory: {
    roadGlow: 'rgba(212, 184, 92, 0.3)',
    frontGlow: 'rgba(229, 202, 110, 0.26)',
    cityRing: '#e0c46a',
    cityFill: 'rgba(224, 196, 106, 0.2)',
  },
};

const ROAD_STYLE = {
  major: {
    base: 'rgba(38, 28, 19, 0.64)',
    line: 'rgba(213, 183, 122, 0.5)',
    width: 8,
    glow: 'rgba(233, 214, 177, 0.12)',
  },
  normal: {
    base: 'rgba(30, 24, 18, 0.46)',
    line: 'rgba(189, 165, 117, 0.24)',
    width: 4.5,
    glow: 'rgba(224, 204, 168, 0.06)',
  },
};

const DECISION_CAMERA = {
  zoom: {
    default: 1.34,
    min: 0.92,
    max: 1.58,
    selection: {
      edgeMargin: 0.24,
      edgeDrop: 0.1,
      clusterBonus: {
        max: 0.08,
        neighbors: 8,
      },
    },
  },
  viewport: {
    inset: {
      x: 0.032,
      y: 0.028,
    },
    battleInset: {
      x: 0.076,
      y: 0.042,
    },
    battleFocusedInset: {
      x: 0.108,
      y: 0.05,
    },
  },
  focus: {
    targetX: 0.472,
    targetY: 0.445,
    readWindow: {
      base: {
        xMin: 0.16,
        xMax: 0.8,
        yMin: 0.1,
        yMax: 0.75,
        pad: {
          x: 0.02,
          y: 0.02,
        },
      },
      selected: {
        xMin: 0.128,
        xMax: 0.72,
        yMin: 0.08,
        yMax: 0.7,
        pad: {
          x: 0.042,
          y: 0.032,
        },
      },
      focused: {
        xMin: 0.112,
        xMax: 0.7,
        yMin: 0.076,
        yMax: 0.705,
        pad: {
          x: 0.06,
          y: 0.038,
        },
      },
    },
    pad: {
      x: {
        maxRatio: 0.26,
        slackRatio: 0.058,
      },
      y: {
        maxRatio: 0.22,
        slackRatio: 0.05,
      },
    },
    bias: {
      // 선택 도시를 중앙 판독권 안쪽으로 당기되, 다음 행동 레일과 정보의 여유를 유지한다.
      x: -0.028,
      y: -0.01,
      adaptive: {
        x: 0.08,
        y: 0.036,
        scaleX: 0.36,
        scaleY: 0.16,
      },
      anchor: {
        x: 0.36,
        y: 0.25,
        maxX: 0.2,
        maxY: 0.13,
      },
      // 선택 도시를 중심으로 이웃 도시 편차를 보정해 연결망 판독을 유지한다.
      context: {
        scaleX: 0.22,
        scaleY: 0.15,
        maxOffsetX: 0.038,
        maxOffsetY: 0.028,
      },
      connectedNeighbors: 8,
    },
  },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

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

export function measureMapViewport(layout, width, height, options = {}) {
  const { mode = 'default', insetX: forcedInsetX, insetY: forcedInsetY } = options;
  const insetProfile = mode === 'battle' ? DECISION_CAMERA.viewport.battleInset : DECISION_CAMERA.viewport.inset;
  const designWidth = layout.designWidth || DEFAULT_W;
  const designHeight = layout.designHeight || DEFAULT_H;
  const insetX = width * (Number.isFinite(forcedInsetX)
    ? forcedInsetX
    : ((insetProfile?.x ?? DECISION_CAMERA.viewport.inset.x) || 0));
  const insetY = height * (Number.isFinite(forcedInsetY)
    ? forcedInsetY
    : ((insetProfile?.y ?? DECISION_CAMERA.viewport.inset.y) || 0));
  const fitWidth = Math.max(1, width - insetX * 2);
  const fitHeight = Math.max(1, height - insetY * 2);
  const scale = Math.min(fitWidth / designWidth, fitHeight / designHeight);
  const offsetX = ((fitWidth - designWidth * scale) / 2) + insetX;
  const offsetY = ((fitHeight - designHeight * scale) / 2) + insetY;

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
    this._cameraAnimFrame = null;
    this._containerResizeObserver = null;
    this._resizeScheduled = false;
    this.selectionPulse = { cityId: null, startedAt: 0, tone: 'selection' };
    this.camera = { zoom: DECISION_CAMERA.zoom.default, panX: 0, panY: 0 };
    this.overlayMode = 'default';
    this.minZoom = DECISION_CAMERA.zoom.min;
    this.maxZoom = DECISION_CAMERA.zoom.max;
    this._boundResize = () => {
      this._resize();
      if (this.selectedCity) {
        if (!this.focusOnCity(this.selectedCity, { immediate: true })) {
          if (this._lastState) this.render(this._lastState);
        }
        return;
      }
      if (this._lastState) this.render(this._lastState);
    };

    this._resize();
    window.addEventListener('resize', this._boundResize);

    const container = this.canvas.parentElement;
    if (container && typeof ResizeObserver !== 'undefined') {
      this._containerResizeObserver = new ResizeObserver(() => {
        if (this._resizeScheduled) return;
        this._resizeScheduled = true;
        requestAnimationFrame(() => {
          this._resizeScheduled = false;
          this._boundResize();
        });
      });
      this._containerResizeObserver.observe(container);
    }
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
    this._refreshDecisionViewport(width, height);
    this._clampCamera();
  }

  _isSessionMode() {
    return Boolean(this.selectedCity);
  }

  _resolveDecisionViewportInset() {
    const profile = this._isSessionMode()
      ? DECISION_CAMERA.viewport.battleFocusedInset
      : DECISION_CAMERA.viewport.battleInset;
    return {
      x: Number.isFinite(profile?.x) ? profile.x : DECISION_CAMERA.viewport.battleInset.x,
      y: Number.isFinite(profile?.y) ? profile.y : DECISION_CAMERA.viewport.battleInset.y,
    };
  }

  _refreshDecisionViewport(width = this.canvas?.clientWidth, height = this.canvas?.clientHeight) {
    if (!this.canvas || !Number.isFinite(width) || !Number.isFinite(height)) return false;
    const inset = this._resolveDecisionViewportInset();
    this.viewport = measureMapViewport(this.layout, width, height, {
      mode: 'battle',
      insetX: inset.x,
      insetY: inset.y,
    });
    return true;
  }

  _getViewTransform() {
    const { width, height, designWidth, designHeight } = this.viewport;
    const scale = this.viewport.scale * this.camera.zoom;
    const offsetX = (width - designWidth * scale) / 2 + this.camera.panX;
    const offsetY = (height - designHeight * scale) / 2 + this.camera.panY;
    return { scale, offsetX, offsetY };
  }

  _clampCamera(focusTarget = null) {
    if (!this.viewport) return;
    const { width, height, designWidth, designHeight } = this.viewport;
    const scale = this.viewport.scale * this.camera.zoom;
    const baseMaxPanX = Math.max(0, (designWidth * scale - width) / 2);
    const baseMaxPanY = Math.max(0, (designHeight * scale - height) / 2);
    const focusPadX = this._focusPad(baseMaxPanX, focusTarget?.panX, 'x');
    const focusPadY = this._focusPad(baseMaxPanY, focusTarget?.panY, 'y');
    const maxPanX = baseMaxPanX + focusPadX;
    const maxPanY = baseMaxPanY + focusPadY;
    this.camera.panX = clamp(this.camera.panX, -maxPanX, maxPanX);
    this.camera.panY = clamp(this.camera.panY, -maxPanY, maxPanY);
  }

  panBy(deltaX, deltaY) {
    this.camera.panX += deltaX;
    this.camera.panY += deltaY;
    this._clampCamera();
    if (this._lastState) this.render(this._lastState);
  }

  resetCamera() {
    if (this._cameraAnimFrame) cancelAnimationFrame(this._cameraAnimFrame);
    this.camera.zoom = DECISION_CAMERA.zoom.default;
    this.camera.panX = 0;
    this.camera.panY = 0;
    if (this._lastState) this.render(this._lastState);
  }

  setOverlayMode(mode = 'default') {
    const nextMode = mode === 'frontline' ? 'frontline' : 'default';
    if (this.overlayMode === nextMode) return;
    this.overlayMode = nextMode;
    if (this._lastState) this.render(this._lastState);
  }

  focusOnCity(cityId, {
    immediate = false,
    targetXRatio = DECISION_CAMERA.focus.targetX,
    targetYRatio = DECISION_CAMERA.focus.targetY,
  } = {}) {
    const anchor = this.positions?.[cityId];
    if (!anchor) return false;
    if (!this._refreshDecisionViewport()) return false;
    const readWindow = this._resolveDecisionReadWindow(cityId);
    const clampedTarget = this._clampDecisionTarget(targetXRatio, targetYRatio, cityId);
    const focusedTarget = this._composeDecisionTarget(cityId, clampedTarget, readWindow);
    const targetZoom = this._resolveDecisionZoom(cityId);
    if (this._cameraAnimFrame) {
      cancelAnimationFrame(this._cameraAnimFrame);
      this._cameraAnimFrame = null;
    }

    const scale = this.viewport.scale * targetZoom;
    const baseOffsetX = (this.viewport.width - this.viewport.designWidth * scale) / 2;
    const baseOffsetY = (this.viewport.height - this.viewport.designHeight * scale) / 2;
    const nextPanX = (this.viewport.width * focusedTarget.x) - (anchor.x * scale) - baseOffsetX;
    const nextPanY = (this.viewport.height * focusedTarget.y) - (anchor.y * scale) - baseOffsetY;
    const target = {
      panX: nextPanX,
      panY: nextPanY,
      zoom: targetZoom,
    };

    if (immediate) {
      this.camera.panX = target.panX;
      this.camera.panY = target.panY;
      this.camera.zoom = target.zoom;
      this._clampCamera(target);
      if (this._lastState) this.render(this._lastState);
      return true;
    }

    const start = {
      panX: this.camera.panX,
      panY: this.camera.panY,
      zoom: this.camera.zoom,
    };
    const startedAt = performance.now();
    const duration = 280;
    const easeOut = (t) => 1 - ((1 - t) * (1 - t) * (1 - t));

    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = easeOut(progress);
      this.camera.panX = start.panX + ((target.panX - start.panX) * eased);
      this.camera.panY = start.panY + ((target.panY - start.panY) * eased);
      this.camera.zoom = start.zoom + ((target.zoom - start.zoom) * eased);
      this._clampCamera(target);
      if (this._lastState) this.render(this._lastState);
      if (progress < 1) {
        this._cameraAnimFrame = requestAnimationFrame(tick);
      } else {
        this._cameraAnimFrame = null;
      }
    };

    this._cameraAnimFrame = requestAnimationFrame(tick);
    return true;
  }

  _resolveDecisionReadWindow(cityId = null) {
    const config = DECISION_CAMERA.focus.readWindow || {};
    const selectedCity = cityId || this.selectedCity;
    const base = config.base || config;
    const selectedWindow = this._isSessionMode() && config.focused ? config.focused : config.selected;
    const selected = selectedCity ? selectedWindow : null;
    const hasSelected = Boolean(selectedCity && this.positions?.[selectedCity]);
    const useSelected = hasSelected && selected
      && Number.isFinite(selected.xMin) && Number.isFinite(selected.xMax)
      && Number.isFinite(selected.yMin) && Number.isFinite(selected.yMax);
    const readWindow = {
      xMin: clamp(useSelected ? selected.xMin : (Number.isFinite(base.xMin) ? base.xMin : 0.2), 0, 1),
      xMax: clamp(useSelected ? selected.xMax : (Number.isFinite(base.xMax) ? base.xMax : 0.8), 0, 1),
      yMin: clamp(useSelected ? selected.yMin : (Number.isFinite(base.yMin) ? base.yMin : 0.16), 0, 1),
      yMax: clamp(useSelected ? selected.yMax : (Number.isFinite(base.yMax) ? base.yMax : 0.75), 0, 1),
      pad: useSelected ? (selected.pad || {}) : (base.pad || {}),
    };

    return this._withDecisionReadWindowPadding(readWindow);
  }

  _withDecisionReadWindowPadding(readWindow) {
    const pad = readWindow?.pad || {};
    const padX = clamp(Number.isFinite(pad.x) ? pad.x : 0, 0, 0.24);
    const padY = clamp(Number.isFinite(pad.y) ? pad.y : 0, 0, 0.24);
    const width = readWindow.xMax - readWindow.xMin;
    const height = readWindow.yMax - readWindow.yMin;
    const safePadX = Math.min(padX, width / 2 - 0.0001);
    const safePadY = Math.min(padY, height / 2 - 0.0001);

    const xMin = readWindow.xMin + safePadX;
    const xMax = readWindow.xMax - safePadX;
    const yMin = readWindow.yMin + safePadY;
    const yMax = readWindow.yMax - safePadY;

    return {
      xMin: clamp(xMin < xMax ? xMin : readWindow.xMin, 0, 1),
      xMax: clamp(xMax > xMin ? xMax : readWindow.xMax, 0, 1),
      yMin: clamp(yMin < yMax ? yMin : readWindow.yMin, 0, 1),
      yMax: clamp(yMax > yMin ? yMax : readWindow.yMax, 0, 1),
    };
  }

  _resolveDecisionZoom(cityId) {
    if (!this.viewport || !this.positions?.[cityId]) return DECISION_CAMERA.zoom.default;
    const city = this.positions[cityId];
    const selectionCfg = DECISION_CAMERA.zoom.selection || {};
    const layoutWidth = this.viewport.designWidth || 1;
    const layoutHeight = this.viewport.designHeight || 1;
    const xRatio = city.x / layoutWidth;
    const yRatio = city.y / layoutHeight;
    const nearestEdge = Math.min(xRatio, 1 - xRatio, yRatio, 1 - yRatio);
    const edgeMargin = Number.isFinite(selectionCfg.edgeMargin) ? selectionCfg.edgeMargin : 0.22;
    const edgePressure = clamp((edgeMargin - nearestEdge) / edgeMargin, 0, 1);
    const edgeDrop = Number.isFinite(selectionCfg.edgeDrop) ? selectionCfg.edgeDrop : 0;
    const clusterMax = Math.min(
      this.connections.filter(([from, to]) => from === cityId || to === cityId).length,
      Number.isFinite(selectionCfg.clusterBonus?.neighbors) ? selectionCfg.clusterBonus.neighbors : 8,
    );
    const clusterDensity = selectionCfg.clusterBonus?.neighbors
      ? clusterMax / selectionCfg.clusterBonus.neighbors
      : 0;
    const clusterBoost = Number.isFinite(selectionCfg.clusterBonus?.max) ? selectionCfg.clusterBonus.max : 0;
    const target = DECISION_CAMERA.zoom.default - (edgePressure * edgeDrop) + (clusterBoost * clusterDensity);

    return clamp(target, DECISION_CAMERA.zoom.min, DECISION_CAMERA.zoom.max);
  }

  _clampDecisionTarget(targetXRatio, targetYRatio, cityId = null) {
    const readWindow = this._resolveDecisionReadWindow(cityId);
    return {
      x: clamp(targetXRatio, readWindow.xMin, readWindow.xMax),
      y: clamp(targetYRatio, readWindow.yMin, readWindow.yMax),
    };
  }

  _composeDecisionTarget(cityId, baseTarget, readWindow = null) {
    const anchor = this.positions?.[cityId];
    if (!anchor || !this.viewport) return baseTarget;
    if (!baseTarget) return baseTarget;
    const window = readWindow || this._resolveDecisionReadWindow(cityId);
    const bias = DECISION_CAMERA.focus.bias || {};
    const adaptiveBias = this._resolveDecisionAdaptiveBias(cityId, window);
    const anchorBias = this._resolveDecisionAnchorBias(cityId, window);
    const context = this._getDecisionContext(cityId);
    const cx = this.viewport.designWidth || 1;
    const cy = this.viewport.designHeight || 1;
    const connectedShiftX = this._worldVectorBias(context?.xOffset || 0, cx, bias.context?.scaleX || 0, bias.context?.maxOffsetX || 0);
    const connectedShiftY = this._worldVectorBias(context?.yOffset || 0, cy, bias.context?.scaleY || 0, bias.context?.maxOffsetY || 0);

    return {
      x: clamp(
        baseTarget.x + (Number.isFinite(bias.x) ? bias.x : 0) + adaptiveBias.x + anchorBias.x - connectedShiftX,
        window.xMin,
        window.xMax,
      ),
      y: clamp(
        baseTarget.y + (Number.isFinite(bias.y) ? bias.y : 0) + adaptiveBias.y + anchorBias.y - connectedShiftY,
        window.yMin,
        window.yMax,
      ),
    };
  }

  _resolveDecisionAnchorBias(cityId, readWindow = null) {
    const anchor = this.positions?.[cityId];
    if (!anchor || !this.viewport) return { x: 0, y: 0 };

    const config = DECISION_CAMERA.focus.bias?.anchor || {};
    const maxX = Number.isFinite(config.maxX) ? config.maxX : 0;
    const maxY = Number.isFinite(config.maxY) ? config.maxY : 0;
    if (!maxX && !maxY) return { x: 0, y: 0 };

    const window = readWindow || this._resolveDecisionReadWindow(cityId);
    const anchorX = anchor.x / (this.viewport.designWidth || 1);
    const anchorY = anchor.y / (this.viewport.designHeight || 1);
    const readCenterX = (window.xMin + window.xMax) / 2;
    const readCenterY = (window.yMin + window.yMax) / 2;
    const scaleX = Number.isFinite(config.scaleX) ? config.scaleX : 0;
    const scaleY = Number.isFinite(config.scaleY) ? config.scaleY : 0;

    return {
      x: clamp((anchorX - readCenterX) * scaleX, -maxX, maxX),
      y: clamp((anchorY - readCenterY) * scaleY, -maxY, maxY),
    };
  }

  _resolveDecisionAdaptiveBias(cityId, readWindow = null) {
    const anchor = this.positions?.[cityId];
    const bias = DECISION_CAMERA.focus.bias?.adaptive || {};
    const window = readWindow || this._resolveDecisionReadWindow(cityId);
    const maxX = Number.isFinite(bias.x) ? bias.x : 0;
    const maxY = Number.isFinite(bias.y) ? bias.y : 0;
    if (!anchor || !this.viewport || (!maxX && !maxY)) return { x: 0, y: 0 };

    const centerX = (window.xMin + window.xMax) / 2;
    const centerY = (window.yMin + window.yMax) / 2;
    const ratioX = (anchor.x / (this.viewport.designWidth || 1)) - centerX;
    const ratioY = (anchor.y / (this.viewport.designHeight || 1)) - centerY;
    const scaleX = Number.isFinite(bias.scaleX) ? bias.scaleX : 0;
    const scaleY = Number.isFinite(bias.scaleY) ? bias.scaleY : 0;

    return {
      x: clamp(ratioX * scaleX * -1, -maxX, maxX),
      y: clamp(ratioY * scaleY * -1, -maxY, maxY),
    };
  }

  _worldVectorBias(delta, axisLength, scale, maxOffset) {
    if (!axisLength) return 0;
    const strength = Number.isFinite(scale) ? scale : 0;
    const maxShift = Number.isFinite(maxOffset) ? maxOffset : 0;
    return clamp((delta / axisLength) * strength, -maxShift, maxShift);
  }

  _getDecisionContext(cityId) {
    const selected = this.positions?.[cityId];
    if (!selected) return { xOffset: 0, yOffset: 0 };

    const connectedCities = [];
    const limit = Math.max(1, Math.min((DECISION_CAMERA.focus.bias?.connectedNeighbors || 4), 6));
    for (const [from, to] of this.connections) {
      if (from !== cityId && to !== cityId) continue;
      const neighborId = from === cityId ? to : from;
      const anchor = this.positions?.[neighborId];
      if (!anchor) continue;

      const cityMeta = this.scenario?.cities?.[neighborId] || {};
      const importance = Number.isFinite(cityMeta.strategic_importance) ? cityMeta.strategic_importance : 0;
      const weight = 1 + Math.min(1.8, Math.max(0.25, importance / 10));
      connectedCities.push({ anchor, weight });
    }

    const topNeighbors = connectedCities
      .sort((a, b) => b.weight - a.weight)
      .slice(0, limit);

    if (!topNeighbors.length) {
      return { xOffset: 0, yOffset: 0 };
    }

    let weightedX = selected.x * 1.4;
    let weightedY = selected.y * 1.4;
    let totalWeight = 1.4;

    for (const item of topNeighbors) {
      weightedX += item.anchor.x * item.weight;
      weightedY += item.anchor.y * item.weight;
      totalWeight += item.weight;
    }

    return {
      xOffset: (weightedX / totalWeight) - selected.x,
      yOffset: (weightedY / totalWeight) - selected.y,
    };
  }

  _focusPad(baseMaxPan, targetPan, axis) {
    if (!Number.isFinite(targetPan) || !this.viewport) return 0;

    const needed = Math.abs(targetPan) - baseMaxPan;
    if (needed <= 0) return 0;

    const config = axis === 'y' ? DECISION_CAMERA.focus.pad.y : DECISION_CAMERA.focus.pad.x;
    const viewportLength = axis === 'y' ? this.viewport.height : this.viewport.width;
    const maxPad = viewportLength * config.maxRatio;
    const slack = viewportLength * config.slackRatio;
    return clamp(needed + slack, 0, maxPad);
  }

  _toWorld(screenX, screenY) {
    const { offsetX, offsetY, scale } = this._getViewTransform();
    return {
      x: (screenX - offsetX) / scale,
      y: (screenY - offsetY) / scale,
    };
  }

  _toScreen(worldX, worldY) {
    const { offsetX, offsetY, scale } = this._getViewTransform();
    return {
      x: worldX * scale + offsetX,
      y: worldY * scale + offsetY,
    };
  }

  _clampUiPoint(x, y, margin = 18) {
    if (!this.viewport) return { x, y };
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const pad = margin * (this.viewport.scale || 1);
    return {
      x: clamp(x, pad, width - pad),
      y: clamp(y, pad, height - pad),
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

  signalSelection(cityId, tone = 'selection') {
    this.selectionPulse = {
      cityId,
      startedAt: Date.now(),
      tone,
    };
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
      if (this.selectionPulse.cityId && now - this.selectionPulse.startedAt > 1100) {
        this.selectionPulse = { cityId: null, startedAt: 0, tone: 'selection' };
      }
      this.movements = this.movements.filter(move => now - move.startedAt < move.duration);

      if (!this.eventCities.size && !this.movements.length && !this.selectionPulse.cityId) {
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
    const frontlineOverlay = this._getFrontlineOverlayState(state);
    ctx.clearRect(0, 0, width, height);

    this._drawFocusZones(ctx);
    this._drawWaterPolygons(ctx);
    this._drawTerritories(ctx, state);
    this._drawRidgePaths(ctx);
    this._drawRoads(ctx, state, frontlineOverlay);
    this._drawFrontlines(ctx, state, frontlineOverlay);
    this._drawMovements(ctx);
    this._drawEventPulses(ctx);
    this._drawCities(ctx, state, frontlineOverlay);
    this._drawEdgeShade(ctx, width, height);
  }

  _getFrontlineOverlayState(state) {
    if (this.overlayMode !== 'frontline' || !state?.player?.factionId) return null;

    const frontlineEdges = new Set();
    const frontlineCities = new Set();
    const playerCities = new Set();
    const hostileCities = new Set();
    const hotRoads = new Set();
    const supportRoads = new Set();

    for (const [cityAId, cityBId] of this.connections) {
      const cityA = state.cities[cityAId];
      const cityB = state.cities[cityBId];
      if (!cityA || !cityB || !cityA.owner || !cityB.owner) continue;
      if (cityA.owner === cityB.owner) continue;

      const atWar = state.isAtWar(cityA.owner, cityB.owner);
      const playerEdge = cityA.owner === state.player.factionId || cityB.owner === state.player.factionId;
      if (!atWar && !playerEdge) continue;

      frontlineEdges.add(pairKey(cityAId, cityBId));
      frontlineCities.add(cityAId);
      frontlineCities.add(cityBId);
      if (cityA.owner === state.player.factionId) playerCities.add(cityAId);
      else hostileCities.add(cityAId);
      if (cityB.owner === state.player.factionId) playerCities.add(cityBId);
      else hostileCities.add(cityBId);
    }

    for (const road of this.roads) {
      const fromFrontline = frontlineCities.has(road.from);
      const toFrontline = frontlineCities.has(road.to);
      if (fromFrontline && toFrontline) {
        hotRoads.add(pairKey(road.from, road.to));
        supportRoads.add(pairKey(road.from, road.to));
      } else if (fromFrontline || toFrontline) {
        supportRoads.add(pairKey(road.from, road.to));
      }
    }

    return {
      frontlineEdges,
      frontlineCities,
      playerCities,
      hostileCities,
      hotRoads,
      supportRoads,
    };
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
    const selectionFocus = this._isSessionMode();

    for (const factionId of drawOrder) {
      const points = this.layout.territoryPolygons?.[factionId];
      if (!points?.length) continue;

      const style = MAP_FACTION_PALETTE[factionId] || MAP_FACTION_PALETTE.neutral;
      const centroid = getCentroid(points);
      const center = this._toScreen(centroid.x, centroid.y);
      const extent = getExtent(points);
      const radius = Math.max(extent.width, extent.height) * this.viewport.scale * 0.7;
      const highlight = selectionFocus
        ? selectedOwner === factionId
        : (selectedOwner === factionId || state.player.factionId === factionId);
      const alpha = highlight ? 0.26 : 0.17;

      ctx.save();
      drawPolygon(ctx, points, this.viewport);
      const gradient = ctx.createRadialGradient(center.x, center.y, radius * 0.12, center.x, center.y, radius);
      gradient.addColorStop(0, addAlpha(style.glow, highlight ? 0.32 : 0.16));
      gradient.addColorStop(0.55, addAlpha(style.fill, alpha));
      gradient.addColorStop(1, addAlpha(style.fill, 0.09));
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.clip();
      drawHatching(ctx, points, this.viewport, style.edge, highlight ? 0.08 : 0.04);
      ctx.restore();

      ctx.save();
      drawPolygon(ctx, points, this.viewport);
      ctx.strokeStyle = 'rgba(24, 18, 12, 0.58)';
      ctx.lineWidth = 6 * this.viewport.scale;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.strokeStyle = highlight ? style.edge : addAlpha(style.edge, 0.66);
      ctx.lineWidth = 1.8 * this.viewport.scale;
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawRidgePaths(ctx) {
    for (const ridge of this.layout.ridgePaths || []) {
      const points = ridge.points || [];
      if (points.length < 2) continue;
      const width = (ridge.thickness || 18) * this.viewport.scale * 0.82;
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

  _drawRoads(ctx, state, frontlineOverlay = null) {
    const selected = this.selectedCity;
    const selectedPulseActive = this.selectionPulse.cityId === selected && (Date.now() - this.selectionPulse.startedAt < 1100);
    const selectionTone = SELECTION_TONE_STYLE[this.selectionPulse.tone] || SELECTION_TONE_STYLE.selection;

    for (const road of this.roads) {
      const from = this.positions[road.from];
      const to = this.positions[road.to];
      if (!from || !to) continue;

      const roadKey = pairKey(road.from, road.to);
      const selectedBoost = selected && (road.from === selected || road.to === selected);
      const localContext = selected && (isConnected(this.connections, selected, road.from) || isConnected(this.connections, selected, road.to));
      const front = selected && isConnected(this.connections, selected, road.from) && isConnected(this.connections, selected, road.to);
      const overlayFocused = frontlineOverlay?.hotRoads.has(roadKey);
      const overlayContext = frontlineOverlay?.supportRoads.has(roadKey);
      if (!selected && !overlayFocused && !overlayContext && road.grade === 'normal' && road.kind === 'road') continue;
      if (selected && !selectedBoost && !localContext && !front && !overlayFocused && !overlayContext && road.grade === 'normal' && road.kind === 'road') continue;
      const emphasis = selectedBoost || overlayFocused ? 'focused' : localContext || front || overlayContext ? 'context' : 'ambient';
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

      if (selectedBoost || front || overlayFocused || (overlayContext && road.grade === 'major')) {
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(fromScreen.x, fromScreen.y);
        ctx.quadraticCurveTo(controlScreen.x, controlScreen.y, toScreen.x, toScreen.y);
        ctx.strokeStyle = selectedPulseActive ? selectionTone.roadGlow : style.glow;
        ctx.lineWidth = (
          style.width
          + 10
          + (selectedBoost && selectedPulseActive ? 5 : 0)
          + (overlayFocused ? 4 : overlayContext ? 1.5 : 0)
        ) * this.viewport.scale;
        ctx.filter = 'blur(6px)';
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  _drawFrontlines(ctx, state, frontlineOverlay = null) {
    const selected = this.selectedCity;
    const selectedPulseActive = this.selectionPulse.cityId === selected && (Date.now() - this.selectionPulse.startedAt < 1100);
    const selectionTone = SELECTION_TONE_STYLE[this.selectionPulse.tone] || SELECTION_TONE_STYLE.selection;
    for (const [cityAId, cityBId] of this.connections) {
      const cityA = state.cities[cityAId];
      const cityB = state.cities[cityBId];
      if (!cityA || !cityB || !cityA.owner || !cityB.owner) continue;
      if (cityA.owner === cityB.owner) continue;

      const atWar = state.isAtWar(cityA.owner, cityB.owner);
      const playerEdge = cityA.owner === state.player.factionId || cityB.owner === state.player.factionId;
      if (!atWar && !playerEdge) continue;
      const overlayEdge = frontlineOverlay?.frontlineEdges.has(pairKey(cityAId, cityBId));
      const selectedEdge = selected && (cityAId === selected || cityBId === selected);
      const contextEdge = selected && !selectedEdge && (isConnected(this.connections, selected, cityAId) || isConnected(this.connections, selected, cityBId));
      if (selected && !selectedEdge && !contextEdge && !atWar && !overlayEdge) continue;

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
      ctx.lineWidth = (atWar ? 4.2 : 3.1) * this.viewport.scale;
      if (selectedEdge) ctx.lineWidth += 1.4 * this.viewport.scale;
      if (overlayEdge) ctx.lineWidth += 1.1 * this.viewport.scale;
      ctx.strokeStyle = atWar
        ? (selectedEdge ? 'rgba(229, 114, 90, 0.96)' : overlayEdge ? 'rgba(226, 106, 80, 0.92)' : contextEdge ? 'rgba(222, 105, 79, 0.88)' : 'rgba(214, 92, 71, 0.82)')
        : (selectedEdge ? 'rgba(240, 208, 132, 0.86)' : overlayEdge ? 'rgba(231, 196, 116, 0.8)' : 'rgba(221, 190, 118, 0.6)');
      ctx.stroke();

      if (selectedEdge || (contextEdge && selectedPulseActive) || overlayEdge) {
        ctx.setLineDash([]);
        ctx.strokeStyle = selectedPulseActive
          ? selectionTone.frontGlow
          : (atWar ? 'rgba(229, 114, 90, 0.24)' : 'rgba(240, 208, 132, 0.22)');
        ctx.lineWidth = (12 + (selectedPulseActive ? 4 : 0) + (overlayEdge ? 4 : 0)) * this.viewport.scale;
        ctx.filter = 'blur(8px)';
        ctx.stroke();
      }
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

  _drawCities(ctx, state, frontlineOverlay = null) {
    const ordered = Object.entries(this.positions).sort(([, a], [, b]) => a.y - b.y);
    const selectedIndex = this.selectedCity
      ? ordered.findIndex(([cityId]) => cityId === this.selectedCity)
      : -1;
    if (selectedIndex > -1) {
      const [selectedCityEntry] = ordered.splice(selectedIndex, 1);
      ordered.push(selectedCityEntry);
    }
    const selectionTone = SELECTION_TONE_STYLE[this.selectionPulse.tone] || SELECTION_TONE_STYLE.selection;

    for (const [cityId, anchor] of ordered) {
      const city = state.cities[cityId];
      if (!city) continue;
      const owner = city.owner || 'neutral';
      const palette = MAP_FACTION_PALETTE[owner] || MAP_FACTION_PALETTE.neutral;
      const capital = city.owner && city.governor && state.factions[city.owner]?.leader === city.governor;
      const selected = cityId === this.selectedCity;
      const hovered = cityId === this.hoveredCity;
      const selectionFocus = this._isSessionMode();
      const adjacent = this.selectedCity && isConnected(this.connections, cityId, this.selectedCity);
      const frontlineCity = frontlineOverlay?.frontlineCities.has(cityId);
      const playerFrontline = frontlineOverlay?.playerCities.has(cityId);
      const selectionPulse = selected && this.selectionPulse.cityId === cityId
        ? Math.max(0, 1 - ((Date.now() - this.selectionPulse.startedAt) / 1100))
        : 0;
      const position = this._toScreen(anchor.x, anchor.y);
      const badgeOffset = this.layout.cityBadgeOffsets?.[cityId] || {};
      const importance = city.strategic_importance || 0;
      const baseSize = capital ? 20 : importance >= 8 ? 18 : importance >= 6 ? 16 : 14;
      const markerSize = (baseSize + (selected ? 4 : hovered ? 2 : 0)) * this.viewport.scale;

      drawTerrainHalo(ctx, position.x, position.y, markerSize, city.terrain?.type, selected, hovered, importance);

      if (selected || (!selectionFocus && hovered)) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(position.x, position.y, markerSize + (16 + (selectionPulse * 16)) * this.viewport.scale, 0, Math.PI * 2);
        ctx.fillStyle = selected
          ? (selectionPulse > 0 ? addAlpha(selectionTone.cityFill, 0.88) : addAlpha(palette.edge, 0.18 + (selectionPulse * 0.12)))
          : 'rgba(243, 223, 184, 0.08)';
        ctx.fill();
        ctx.restore();
      }

      if (frontlineCity && !selected && !hovered && !selectionFocus) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(position.x, position.y, markerSize + 10 * this.viewport.scale, 0, Math.PI * 2);
        ctx.setLineDash([6 * this.viewport.scale, 5 * this.viewport.scale]);
        ctx.strokeStyle = playerFrontline ? 'rgba(228, 200, 126, 0.56)' : 'rgba(220, 111, 88, 0.5)';
        ctx.lineWidth = 1.8 * this.viewport.scale;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      if (selectionPulse > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(position.x, position.y, markerSize + (22 + ((1 - selectionPulse) * 22)) * this.viewport.scale, 0, Math.PI * 2);
        ctx.strokeStyle = addAlpha(selectionTone.cityRing, 0.34 * selectionPulse);
        ctx.lineWidth = 3 * this.viewport.scale;
        ctx.stroke();

        if (this.selectionPulse.tone === 'hostile') {
          const reach = markerSize + 26 * this.viewport.scale;
          ctx.strokeStyle = addAlpha(selectionTone.cityRing, 0.42 * selectionPulse);
          ctx.lineWidth = 2 * this.viewport.scale;
          ctx.beginPath();
          ctx.moveTo(position.x - reach, position.y);
          ctx.lineTo(position.x - (markerSize + 8 * this.viewport.scale), position.y);
          ctx.moveTo(position.x + (markerSize + 8 * this.viewport.scale), position.y);
          ctx.lineTo(position.x + reach, position.y);
          ctx.moveTo(position.x, position.y - reach);
          ctx.lineTo(position.x, position.y - (markerSize + 8 * this.viewport.scale));
          ctx.moveTo(position.x, position.y + (markerSize + 8 * this.viewport.scale));
          ctx.lineTo(position.x, position.y + reach);
          ctx.stroke();
        } else if (this.selectionPulse.tone === 'opportunity') {
          ctx.setLineDash([6 * this.viewport.scale, 5 * this.viewport.scale]);
          ctx.beginPath();
          ctx.arc(position.x, position.y, markerSize + 30 * this.viewport.scale, 0, Math.PI * 2);
          ctx.strokeStyle = addAlpha(selectionTone.cityRing, 0.38 * selectionPulse);
          ctx.lineWidth = 2 * this.viewport.scale;
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (this.selectionPulse.tone === 'fortify') {
          const frame = markerSize + 24 * this.viewport.scale;
          ctx.strokeStyle = addAlpha(selectionTone.cityRing, 0.34 * selectionPulse);
          ctx.lineWidth = 2 * this.viewport.scale;
          ctx.strokeRect(position.x - frame, position.y - frame, frame * 2, frame * 2);
        }
        ctx.restore();
      }

      drawSealMarker(ctx, position.x, position.y, markerSize, palette, capital, selected || (!selectionFocus && hovered));

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

      const showBadge = selectionFocus
        ? selected
        : frontlineCity || selected || hovered || adjacent || capital || owner === state.player.factionId || importance >= 8;
      const showLabel = selectionFocus
        ? selected
        : frontlineCity || showBadge || importance >= 6;
      const armyText = formatArmyBadge(city.army);
      const badgeX = position.x + ((badgeOffset.badge?.[0] || 0) * this.viewport.scale);
      const badgeY = position.y + markerSize + 12 * this.viewport.scale + ((badgeOffset.badge?.[1] || 0) * this.viewport.scale);
      const labelX = position.x + ((badgeOffset.label?.[0] || 0) * this.viewport.scale);
      const labelY = position.y + markerSize + 33 * this.viewport.scale + ((badgeOffset.label?.[1] || 0) * this.viewport.scale);
      const showOverlayAdjust = selected || (!selectionFocus && hovered);
      const uiPad = selected ? 24 : hovered ? 18 : 16;
      const badgePoint = showOverlayAdjust
        ? this._clampUiPoint(badgeX, badgeY, uiPad)
        : { x: badgeX, y: badgeY };
      const labelPoint = showOverlayAdjust
        ? this._clampUiPoint(labelX, labelY, uiPad)
        : { x: labelX, y: labelY };
      const terrainPoint = showOverlayAdjust
        ? this._clampUiPoint(
          labelX + ((badgeOffset.terrain?.[0] || 0) * this.viewport.scale),
          labelY + 20 * this.viewport.scale + ((badgeOffset.terrain?.[1] || 0) * this.viewport.scale),
          uiPad,
        )
        : {
            x: labelX + ((badgeOffset.terrain?.[0] || 0) * this.viewport.scale),
            y: labelY + 20 * this.viewport.scale + ((badgeOffset.terrain?.[1] || 0) * this.viewport.scale),
          };
      const commandPoint = selected
        ? this._clampUiPoint(
          position.x + ((badgeOffset.command?.[0] || 0) * this.viewport.scale),
          position.y - markerSize - 24 * this.viewport.scale + ((badgeOffset.command?.[1] || 0) * this.viewport.scale),
          20,
        )
        : { x: 0, y: 0 };

      if (showBadge) {
        const badgeAlpha = selected || hovered ? 1 : frontlineCity ? 0.9 : adjacent || capital ? 0.92 : owner === state.player.factionId ? 0.82 : 0.7;
        ctx.save();
        ctx.globalAlpha = badgeAlpha;
        drawBadge(ctx, badgePoint.x, badgePoint.y, armyText, palette.badge, palette.badgeDark, this.viewport.scale);
        ctx.restore();
      }
      if (showLabel) {
        const labelAlpha = selected || hovered ? 1 : frontlineCity ? 0.9 : adjacent || capital ? 0.92 : owner === state.player.factionId ? 0.84 : importance >= 8 ? 0.78 : 0.62;
        ctx.save();
        ctx.globalAlpha = labelAlpha;
        drawLabelPlaque(ctx, labelPoint.x, labelPoint.y, city.name, selected, this.viewport.scale);
        ctx.restore();
      }
      if (selected) {
        drawCityTerrainStrip(
          ctx,
          terrainPoint.x,
          terrainPoint.y,
          city,
          selected ? palette.edge : '#D4C099',
          this.viewport.scale
        );
      }

      if (selected) {
        drawCommandRibbon(
          ctx,
          commandPoint.x,
          commandPoint.y,
          this.viewport.scale
        );
      } else if (hovered && !selectionFocus) {
        const hintPoint = this._clampUiPoint(position.x, position.y - markerSize - 18 * this.viewport.scale, 12);
        drawHintTag(ctx, hintPoint.x, hintPoint.y, state.factions[owner]?.name || '무주지', this.viewport.scale);
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
  ctx.font = `${Math.max(9, 10 * scale)}px "Noto Sans KR", sans-serif`;
  const width = Math.max(32 * scale, ctx.measureText(text).width + 14 * scale);
  const height = 15 * scale;
  drawRoundedRect(ctx, x - width / 2, y - height / 2, width, height, 7 * scale);
  ctx.fillStyle = 'rgba(23, 16, 11, 0.92)';
  ctx.fill();
  ctx.strokeStyle = addAlpha(border, 0.58);
  ctx.lineWidth = 1 * scale;
  ctx.stroke();
  drawRoundedRect(ctx, x - width / 2 + 2 * scale, y - height / 2 + 2 * scale, width - 4 * scale, height - 4 * scale, 6 * scale);
  ctx.fillStyle = addAlpha(fill, 0.84);
  ctx.fill();
  ctx.fillStyle = '#FFF8EA';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5 * scale);
  ctx.restore();
}

function drawLabelPlaque(ctx, x, y, text, selected, scale) {
  ctx.save();
  ctx.font = `${Math.max(10, 12 * scale)}px "Noto Serif KR", serif`;
  const width = Math.max(44 * scale, ctx.measureText(text).width + 16 * scale);
  const height = 18 * scale;
  drawRoundedRect(ctx, x - width / 2, y - height / 2, width, height, 6 * scale);
  ctx.fillStyle = selected ? 'rgba(33, 23, 16, 0.9)' : 'rgba(18, 13, 10, 0.72)';
  ctx.fill();
  ctx.strokeStyle = selected ? 'rgba(231, 210, 166, 0.48)' : 'rgba(192, 161, 104, 0.18)';
  ctx.lineWidth = 0.9 * scale;
  ctx.stroke();
  ctx.fillStyle = selected ? '#FFF3D3' : 'rgba(240, 228, 203, 0.92)';
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
  const emphasisAlpha = emphasis === 'focused' ? 1 : emphasis === 'context' ? 0.72 : 0.3;

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
    lineWidthRatio: 0.36,
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
