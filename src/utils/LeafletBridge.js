/**
 * LeafletBridge — Leaflet tile map behind Phaser canvas.
 *
 * Leaflet handles Google Maps terrain tile rendering (Mercator projection).
 * Phaser handles game elements on a transparent canvas on top.
 * This bridge syncs Leaflet view to Phaser camera state.
 *
 * Coordinate flow:
 *   legacy (920×700) → lat/lng → Mercator world pixel → Phaser world
 *   Phaser camera viewport → lat/lng bounds → Leaflet.setView()
 */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ── Game geo bounds ──
const LON_MIN = 96.76;
const LON_MAX = 125.59;
const LAT_MIN = 20.58;
const LAT_MAX = 43.83;

// Reference zoom for Mercator pixel calculations
const REF_ZOOM = 7;
const TILE_SIZE = 256;
const TOTAL_PX = TILE_SIZE * (1 << REF_ZOOM); // 32768

// ── Mercator helpers ──
function lngToMercX(lng) {
  return ((lng + 180) / 360) * TOTAL_PX;
}

function latToMercY(lat) {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / Math.PI) / 2) * TOTAL_PX;
}

function mercXToLng(mx) {
  return (mx / TOTAL_PX) * 360 - 180;
}

function mercYToLat(my) {
  const n = Math.PI - (2 * Math.PI * my) / TOTAL_PX;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

// ── World origin (NW corner in Mercator pixels) ──
const ORIGIN_X = lngToMercX(LON_MIN);
const ORIGIN_Y = latToMercY(LAT_MAX); // upper-left = max lat

// ── World dimensions in Mercator pixels ──
export const WORLD_W = lngToMercX(LON_MAX) - ORIGIN_X;
export const WORLD_H = latToMercY(LAT_MIN) - ORIGIN_Y;

/**
 * Convert lat/lng to Phaser world coordinates (Mercator-projected).
 */
export function geoToWorld(lat, lng) {
  return {
    x: lngToMercX(lng) - ORIGIN_X,
    y: latToMercY(lat) - ORIGIN_Y,
  };
}

/**
 * Convert Phaser world coordinates to lat/lng.
 */
export function worldToGeo(wx, wy) {
  return {
    lat: mercYToLat(wy + ORIGIN_Y),
    lng: mercXToLng(wx + ORIGIN_X),
  };
}

/**
 * Convert legacy city position (920×700) to Phaser world coordinates.
 * legacy → lat/lng → Mercator world pixel
 */
export function legacyToWorld(legacyX, legacyY) {
  const lng = 0.02820 * legacyX + 98.20;
  const lat = -0.02879 * legacyY + 42.28;
  return geoToWorld(lat, lng);
}

/**
 * Convert all city positions from legacy to Mercator world coordinates.
 */
export function projectCityAnchors(cityPositions) {
  const anchors = {};
  for (const [id, pos] of Object.entries(cityPositions || {})) {
    const w = legacyToWorld(pos.x, pos.y);
    anchors[id] = { x: Math.round(w.x), y: Math.round(w.y) };
  }
  return anchors;
}

/**
 * Resolve anchors: explicit mapLayout overrides (as lat/lng) + legacy fallback.
 */
export function resolveAllAnchors(scenario) {
  const legacy = projectCityAnchors(scenario.cityPositions || {});
  const explicit = {};
  if (scenario.mapLayout?.cityAnchors) {
    for (const [id, pos] of Object.entries(scenario.mapLayout.cityAnchors)) {
      if (pos.lat !== undefined && pos.lng !== undefined) {
        const w = geoToWorld(pos.lat, pos.lng);
        explicit[id] = { x: Math.round(w.x), y: Math.round(w.y) };
      } else {
        // Already in pixel coords — convert from old equirectangular to Mercator
        // Use inverse equirect to get lat/lng, then project to Mercator
        const lx = ((pos.x - 80) / (1520 - 80)) * 920;
        const ly = ((pos.y - 60) / (840 - 60)) * 700;
        const w = legacyToWorld(lx, ly);
        explicit[id] = { x: Math.round(w.x), y: Math.round(w.y) };
      }
    }
  }
  return { ...legacy, ...explicit };
}

// ── Leaflet map instance ──
let leafletMap = null;
let tileLayer = null;

/**
 * Initialize Leaflet map behind Phaser canvas.
 * Call once after Phaser game is created.
 *
 * Strategy: Leaflet div lives OUTSIDE #game (as body's first child)
 * so it never touches Phaser's DOM. Canvas stays transparent via config.
 * A ResizeObserver keeps the Leaflet div aligned with the canvas.
 */
export function initLeaflet(phaserGame) {
  const gameCanvas = phaserGame.canvas;

  // Create Leaflet container OUTSIDE Phaser's parent — zero DOM interference
  const mapDiv = document.createElement('div');
  mapDiv.id = 'leaflet-map';
  mapDiv.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100vw; height: 100dvh;
    pointer-events: none;
  `;
  document.body.insertBefore(mapDiv, document.body.firstChild);

  // Sync Leaflet div position/size with Phaser canvas (handles letterboxing)
  const syncSize = () => {
    const rect = gameCanvas.getBoundingClientRect();
    mapDiv.style.top = `${rect.top}px`;
    mapDiv.style.left = `${rect.left}px`;
    mapDiv.style.width = `${rect.width}px`;
    mapDiv.style.height = `${rect.height}px`;
    if (leafletMap) leafletMap.invalidateSize({ animate: false });
  };
  new ResizeObserver(syncSize).observe(gameCanvas);
  // Initial sync after a tick (canvas may not be sized yet)
  requestAnimationFrame(syncSize);

  // Create Leaflet map (all interaction disabled — Phaser handles input)
  leafletMap = L.map(mapDiv, {
    center: [(LAT_MIN + LAT_MAX) / 2, (LON_MIN + LON_MAX) / 2],
    zoom: 6,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    touchZoom: false,
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
  });

  // Google Maps satellite tiles (NO labels — game provides its own)
  tileLayer = L.tileLayer(
    'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    {
      subdomains: '0123',
      maxZoom: 12,
      minZoom: 4,
      tileSize: 256,
    }
  ).addTo(leafletMap);

  // Dark antique war-map filter: warm sepia, terrain readable, game UI pops
  mapDiv.style.filter = 'brightness(0.42) contrast(1.2) saturate(0.35) sepia(0.3)';

  return leafletMap;
}

/**
 * Sync Leaflet view to Phaser camera state.
 * Call every frame from WorldMapScene.update().
 */
export function syncLeafletToCamera(cam) {
  if (!leafletMap) return;

  // Camera center in world coords — use Phaser's own midPoint (accounts for origin/zoom)
  const center = worldToGeo(cam.midPoint.x, cam.midPoint.y);

  // Visible world width in degrees
  const pxPerDegLng = WORLD_W / (LON_MAX - LON_MIN);
  const viewWidthDeg = cam.worldView.width / pxPerDegLng;

  // Leaflet container CSS pixel width
  const containerW = leafletMap.getContainer().offsetWidth || 1;

  // Leaflet zoom: containerW CSS pixels should cover viewWidthDeg degrees
  // At zoom z, one 256px tile covers 360/2^z degrees
  // containerW pixels = containerW/256 tiles = containerW * 360 / (256 * 2^z) degrees
  const leafletZoom = Math.log2((containerW * 360) / (256 * viewWidthDeg));
  const clampedZoom = Math.max(4, Math.min(12, leafletZoom));

  leafletMap.setView([center.lat, center.lng], clampedZoom, { animate: false });
}

/**
 * Invalidate Leaflet size (call on window resize).
 */
export function invalidateLeafletSize() {
  if (leafletMap) {
    leafletMap.invalidateSize({ animate: false });
  }
}

/**
 * Show/hide the Leaflet map layer.
 * Hide during menu/loading scenes, show during WorldMap.
 */
export function setLeafletVisible(visible) {
  if (!leafletMap) return;
  const container = leafletMap.getContainer();
  if (container) {
    container.style.display = visible ? '' : 'none';
  }
}

/**
 * Get the Leaflet map instance.
 */
export function getLeafletMap() {
  return leafletMap;
}

/**
 * Convert old equirectangular pixel coordinates (1600×900 space) to Mercator world.
 * Old system: SAFE_BOUNDS {left:80, top:60, right:1520, bottom:840}
 * mapped linearly to geo bounds.
 */
const OLD_SAFE = { left: 80, top: 60, right: 1520, bottom: 840 };
const OLD_W = OLD_SAFE.right - OLD_SAFE.left; // 1440
const OLD_H = OLD_SAFE.bottom - OLD_SAFE.top; // 780

export function oldPixelToWorld(px, py) {
  // Old pixel → normalized [0,1]
  const nx = (px - OLD_SAFE.left) / OLD_W;
  const ny = (py - OLD_SAFE.top) / OLD_H;
  // Normalized → lat/lng (equirectangular linear mapping)
  const lng = LON_MIN + nx * (LON_MAX - LON_MIN);
  const lat = LAT_MAX - ny * (LAT_MAX - LAT_MIN); // top=maxLat, bottom=minLat
  // lat/lng → Mercator world
  return geoToWorld(lat, lng);
}

export { LON_MIN, LON_MAX, LAT_MIN, LAT_MAX };
