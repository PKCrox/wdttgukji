/**
 * 디자인 토큰 — 기존 CSS 변수에서 추출
 * Phaser 씬에서 색상/폰트/간격 참조용
 */

export const COLORS = {
  bg: 0x0a0a0f,
  bgPanel: 0x12121a,
  bgHover: 0x1a1a28,
  border: 0x2a2a3a,
  text: 0xd4d4dc,
  textDim: 0x8888a0,
  textBright: 0xf0f0ff,
  accent: 0xc9a84c,
  accentDim: 0x8a7030,
  danger: 0xe74c3c,
  success: 0x2ecc71,
  warning: 0xf39c12,
};

export const COLORS_CSS = {
  bg: '#0a0a0f',
  bgPanel: '#12121a',
  bgHover: '#1a1a28',
  border: '#2a2a3a',
  text: '#d4d4dc',
  textDim: '#8888a0',
  textBright: '#f0f0ff',
  accent: '#c9a84c',
  accentDim: '#8a7030',
  danger: '#e74c3c',
  success: '#2ecc71',
  warning: '#f39c12',
};

export const FACTION_COLORS = {
  wei: { primary: 0x4a90d9, css: '#4A90D9', fill: 0x6281a7, fillAlpha: 0.18, edge: 0x8ca8c8, badge: 0x6d8db0, badgeDark: 0x304357 },
  shu: { primary: 0x2ecc71, css: '#2ECC71', fill: 0x5a845a, fillAlpha: 0.19, edge: 0x9eb78e, badge: 0x658d63, badgeDark: 0x314731 },
  wu: { primary: 0xe74c3c, css: '#E74C3C', fill: 0xa2604f, fillAlpha: 0.18, edge: 0xd29b84, badge: 0xae6857, badgeDark: 0x513128 },
  liu_zhang: { primary: 0xf39c12, css: '#F39C12', fill: 0xab894b, fillAlpha: 0.17, edge: 0xd4ba7d, badge: 0xa98349, badgeDark: 0x4e3d1f },
  zhang_lu: { primary: 0x9b59b6, css: '#9B59B6', fill: 0x846598, fillAlpha: 0.16, edge: 0xc4a8d4, badge: 0x8a6a9d, badgeDark: 0x43314b },
  neutral: { primary: 0x666666, css: '#666666', fill: 0x766e5d, fillAlpha: 0.14, edge: 0xb8a98d, badge: 0x7b705d, badgeDark: 0x3b3429 },
};

export const FONTS = {
  ui: "'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif",
  title: "'Noto Serif KR', serif",
};

export const FONT_STYLES = {
  title: { fontFamily: FONTS.title, fontSize: '48px', fontStyle: 'bold', color: COLORS_CSS.accent },
  subtitle: { fontFamily: FONTS.ui, fontSize: '18px', color: COLORS_CSS.textDim },
  heading: { fontFamily: FONTS.ui, fontSize: '20px', fontStyle: 'bold', color: COLORS_CSS.textBright },
  body: { fontFamily: FONTS.ui, fontSize: '14px', color: COLORS_CSS.text },
  bodyDim: { fontFamily: FONTS.ui, fontSize: '13px', color: COLORS_CSS.textDim },
  label: { fontFamily: FONTS.ui, fontSize: '12px', fontStyle: '600', color: COLORS_CSS.textDim },
  value: { fontFamily: FONTS.ui, fontSize: '14px', fontStyle: '700', color: COLORS_CSS.textBright },
  button: { fontFamily: FONTS.ui, fontSize: '16px', fontStyle: '700', color: COLORS_CSS.bg },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const SIZES = {
  panelRadius: 8,
  buttonRadius: 6,
  sidebarWidth: 220,
  hudHeight: 48,
};

// ─── 맵 렌더링 토큰 ───

export const MAP_PALETTE = {
  land: 0x13110e,
  water: 0x162838,
  waterEdge: 0x3a6080,
  waterLabel: '#6aacd4',
  ridge: 0x2a2218,
  ridgeHighlight: 0x6d5a3a,
  ridgeLabel: '#b8a27d',
  roadMajor: 0xc4a86a,
  roadMajorShadow: 0x100d08,
  roadMinor: 0x484840,
  regionLabel: '#c8b890',
  frontline: 0xd3b36b,
  frontlineShadow: 0x0a0907,
};

export const CITY_TIERS = {
  capital:  { radius: 13, stroke: 3.5, innerDot: 4 },
  major:    { radius: 11, stroke: 2.5, innerDot: 0 },
  standard: { radius: 9,  stroke: 2,   innerDot: 0 },
  minor:    { radius: 7,  stroke: 1.5, innerDot: 0 },
};

export const ROAD_STYLES = {
  major: { width: 3.2, shadowWidth: 8, alpha: 0.78 },
  minor: { width: 1.6, shadowWidth: 0, alpha: 0.44 },
};

export const TERRITORY_STYLE = {
  fillBoost: 0.05,      // fillAlpha에 더할 값
  maxFill: 0.24,
  edgeWidth: 1.8,
  edgeAlpha: 0.3,
  innerEdgeWidth: 4,
  innerEdgeAlpha: 0.06,  // 내부 glow 효과
};

export const HUD_STYLE = {
  bgAlpha: 0.92,
  borderAlpha: 0.35,
  chipBg: 0x161620,
  chipAlpha: 0.85,
  chipRadius: 10,
  chipHeight: 28,
  chipGap: 8,
};
