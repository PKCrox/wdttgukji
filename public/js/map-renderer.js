// MapRenderer — 전략 맵: 보로노이 영토 + 경계선 + 병력 이동 + 지형
//
// 렌더 순서:
//   1. 배경 + 지형 (강/산/해)
//   2. 영토 채색 (보로노이) + 경계선
//   3. 도로
//   4. 이벤트 펄스
//   5. 병력 이동 애니메이션
//   6. 성채 (도시)
//   7. 비네팅

const CITY_R = 14;
const CITY_R_CAP = 18;
const VORONOI_STEP = 6; // 보로노이 그리드 해상도 (논리좌표 px) — 작을수록 부드러움

// 지형 기저 색 (어두운 고지도 톤)
const TERRAIN_BASE = [28, 25, 20];     // 기본 땅 (어두운 황토)
const TERRAIN_NORTH = [32, 30, 22];    // 북부 평원 (밝은 황토)
const TERRAIN_SOUTH = [22, 28, 20];    // 남부 (약간 초록)
const TERRAIN_MOUNT = [20, 18, 16];    // 산지 (어두움)

const FC = {
  wei:       { b: '#4A90D9', l: '#7AB8FF', d: '#2A5A8A', t: [130,180,255] },
  shu:       { b: '#27C96A', l: '#50F090', d: '#168A42', t: [39,201,106] },
  wu:        { b: '#E7553C', l: '#FF7A60', d: '#A02020', t: [231,85,60] },
  liu_zhang: { b: '#F5A623', l: '#FFc850', d: '#B07008', t: [245,166,35] },
  zhang_lu:  { b: '#A66BBE', l: '#C88AE0', d: '#6A3080', t: [166,107,190] },
};

// ─── 지리 ───

const YELLOW_RIVER = [
  [150,240],[200,260],[260,290],[320,280],[380,270],
  [430,265],[480,270],[530,255],[580,250],[630,248],
  [680,240],[740,230],[800,225],[860,220]
];
const YANGTZE = [
  [150,510],[200,500],[260,495],[310,480],[370,465],
  [430,455],[490,445],[540,438],[590,425],[640,415],
  [690,408],[740,430],[790,440],[850,445]
];
const MOUNTAINS = [
  { pts:[[510,160],[530,190],[550,170],[520,210],[540,230],[560,210]], name:'太行' },
  { pts:[[300,350],[320,370],[340,355],[360,375],[380,360],[350,340]], name:'秦嶺' },
  { pts:[[310,430],[330,450],[350,435],[320,460],[340,470]], name:'' },
];
const COAST = [
  [800,60],[810,130],[805,180],[790,230],
  [780,280],[790,320],[800,370],[810,420],
  [800,460],[790,500],[780,550],[770,600],[760,680]
];

export class MapRenderer {
  constructor(canvas, scenario) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.positions = scenario.cityPositions;
    this.connections = scenario.connections;
    this.selectedCity = null;
    this.hoveredCity = null;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    // 이벤트 펄스
    this.eventCities = new Map();

    // 병력 이동 애니메이션
    this.movements = [];    // [{from,to,color,progress,type}]
    this._animating = false;
    this._animFrame = null;

    // 영토 캐시
    this._territoryHash = '';
    this._territoryImg = null;

    this._resize();
    this._bindEvents();
  }

  _resize() {
    const ctr = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const w = ctr.clientWidth, h = ctr.clientHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.scale = Math.min(w / 920, h / 700) * 0.95;
    this.offsetX = (w - 920 * this.scale) / 2;
    this.offsetY = (h - 700 * this.scale) / 2;
    this._territoryImg = null; // 캐시 무효화
  }

  _bindEvents() {
    window.addEventListener('resize', () => {
      this._resize();
      if (this._lastState) this.render(this._lastState);
    });
  }

  _s(x, y) { return { x: x * this.scale + this.offsetX, y: y * this.scale + this.offsetY }; }
  _fromScreen(sx, sy) { return { x: (sx - this.offsetX) / this.scale, y: (sy - this.offsetY) / this.scale }; }

  hitTest(sx, sy) {
    const { x, y } = this._fromScreen(sx, sy);
    const hr = CITY_R * 1.8;
    for (const [id, p] of Object.entries(this.positions)) {
      if ((x - p.x) ** 2 + (y - p.y) ** 2 < hr * hr) return id;
    }
    return null;
  }

  // ── 이벤트 펄스 ──
  addEventPulse(cityId, color) {
    this.eventCities.set(cityId, { time: Date.now(), color: color || '#c9a84c' });
    this._startAnim();
  }
  clearEventPulses() { this.eventCities.clear(); }

  // ── 병력 이동 애니메이션 ──
  // movements: [{ from: cityId, to: cityId, type: 'attack'|'reinforce'|'move', factionId }]
  animateMovements(mvs) {
    if (!mvs || mvs.length === 0) return;
    for (const m of mvs) {
      const fc = FC[m.factionId];
      this.movements.push({
        from: m.from, to: m.to,
        color: fc ? fc.b : '#888',
        type: m.type || 'move',
        startTime: Date.now(),
        duration: m.type === 'attack' ? 1200 : 800,
      });
    }
    this._startAnim();
  }

  _startAnim() {
    if (this._animating) return;
    this._animating = true;
    const tick = () => {
      const now = Date.now();
      // 만료 이벤트 펄스 제거
      for (const [id, p] of this.eventCities) {
        if (now - p.time > 4000) this.eventCities.delete(id);
      }
      // 만료 이동 제거
      this.movements = this.movements.filter(m => now - m.startTime < m.duration);

      if (this.eventCities.size === 0 && this.movements.length === 0) {
        this._animating = false;
        if (this._lastState) this.render(this._lastState);
        return;
      }
      if (this._lastState) this.render(this._lastState);
      this._animFrame = requestAnimationFrame(tick);
    };
    this._animFrame = requestAnimationFrame(tick);
  }

  // ═══════════════════════════════════
  //  메인 렌더
  // ═══════════════════════════════════

  render(state) {
    this._lastState = state;
    const ctx = this.ctx;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    this._drawBackground(ctx, w, h);
    this._drawTerritory(ctx, state, w, h);
    this._drawRoads(ctx, state);
    this._drawEventPulses(ctx);
    this._drawMovements(ctx);
    this._drawCities(ctx, state);
    this._drawVignette(ctx, w, h);
  }

  // ─── 배경 + 지형 ───

  _drawBackground(ctx, w, h) {
    // 기저: 어두운 땅 색 (코에이풍 고지도)
    ctx.fillStyle = `rgb(${TERRAIN_BASE[0]},${TERRAIN_BASE[1]},${TERRAIN_BASE[2]})`;
    ctx.fillRect(0, 0, w, h);

    // 지형 존: 북부(밝은 황토) / 남부(약간 초록) 그라데이션
    const midY = this._s(0, 380).y;  // 황하-장강 중간
    // 북부 (위쪽)
    const northGrad = ctx.createLinearGradient(0, 0, 0, midY);
    northGrad.addColorStop(0, `rgba(${TERRAIN_NORTH[0]},${TERRAIN_NORTH[1]},${TERRAIN_NORTH[2]},0.6)`);
    northGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = northGrad;
    ctx.fillRect(0, 0, w, midY);
    // 남부 (아래쪽)
    const southGrad = ctx.createLinearGradient(0, midY, 0, h);
    southGrad.addColorStop(0, 'rgba(0,0,0,0)');
    southGrad.addColorStop(1, `rgba(${TERRAIN_SOUTH[0]},${TERRAIN_SOUTH[1]},${TERRAIN_SOUTH[2]},0.5)`);
    ctx.fillStyle = southGrad;
    ctx.fillRect(0, midY, w, h - midY);

    // 미세 질감 (종이 느낌)
    ctx.strokeStyle = 'rgba(255,240,200,0.018)';
    ctx.lineWidth = 0.5;
    const gs = 25 * this.scale;
    for (let x = this.offsetX % gs; x < w; x += gs) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = this.offsetY % gs; y < h; y += gs) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    this._drawSea(ctx, w, h);
    this._drawRiver(ctx, YELLOW_RIVER, [190, 170, 80], 6);
    this._drawRiver(ctx, YANGTZE, [70, 150, 220], 7);
    this._drawMountains(ctx);
  }

  _drawSea(ctx, w, h) {
    ctx.save();
    ctx.beginPath();
    const f = this._s(COAST[0][0], COAST[0][1]);
    ctx.moveTo(f.x, f.y);
    for (let i = 1; i < COAST.length; i++) {
      const p = this._s(COAST[i][0], COAST[i][1]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.lineTo(w, h); ctx.lineTo(w, 0); ctx.closePath();
    const sg = ctx.createLinearGradient(this._s(780, 0).x, 0, w, 0);
    sg.addColorStop(0, 'rgba(15,30,55,0.3)');
    sg.addColorStop(1, 'rgba(10,22,40,0.55)');
    ctx.fillStyle = sg;
    ctx.fill();

    // 해안선 점선
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    for (let i = 1; i < COAST.length; i++) {
      const p = this._s(COAST[i][0], COAST[i][1]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = 'rgba(50,90,130,0.3)';
    ctx.lineWidth = 1.5 * this.scale;
    ctx.setLineDash([5 * this.scale, 4 * this.scale]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  _drawRiver(ctx, pts, rgb, w) {
    if (pts.length < 2) return;
    ctx.save();
    // 넓은 글로우
    this._smoothCurve(ctx, pts);
    ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.12)`;
    ctx.lineWidth = (w + 14) * this.scale;
    ctx.lineCap = 'round';
    ctx.stroke();
    // 중간 글로우
    this._smoothCurve(ctx, pts);
    ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.22)`;
    ctx.lineWidth = (w + 6) * this.scale;
    ctx.stroke();
    // 본체
    this._smoothCurve(ctx, pts);
    ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.40)`;
    ctx.lineWidth = w * this.scale;
    ctx.stroke();
    ctx.restore();
  }

  _smoothCurve(ctx, pts) {
    ctx.beginPath();
    const p0 = this._s(pts[0][0], pts[0][1]);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length - 1; i++) {
      const c = this._s(pts[i][0], pts[i][1]);
      const n = this._s(pts[i + 1][0], pts[i + 1][1]);
      ctx.quadraticCurveTo(c.x, c.y, (c.x + n.x) / 2, (c.y + n.y) / 2);
    }
    const last = this._s(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    ctx.lineTo(last.x, last.y);
  }

  _drawMountains(ctx) {
    ctx.save();
    for (const mt of MOUNTAINS) {
      for (const [mx, my] of mt.pts) {
        const s = this._s(mx, my);
        const sz = (8 + Math.random() * 5) * this.scale;
        // 삼각 봉우리
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - sz);
        ctx.lineTo(s.x - sz * .65, s.y + sz * .25);
        ctx.lineTo(s.x + sz * .65, s.y + sz * .25);
        ctx.closePath();
        const g = ctx.createLinearGradient(s.x, s.y - sz, s.x, s.y + sz * .25);
        g.addColorStop(0, 'rgba(110,100,75,0.20)');
        g.addColorStop(1, 'rgba(60,55,45,0.05)');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = 'rgba(130,120,85,0.12)';
        ctx.lineWidth = .7 * this.scale;
        ctx.stroke();
      }
      if (mt.name) {
        const cx = mt.pts.reduce((a, p) => a + p[0], 0) / mt.pts.length;
        const cy = mt.pts.reduce((a, p) => a + p[1], 0) / mt.pts.length;
        const sc = this._s(cx, cy - 18);
        ctx.font = `${8 * this.scale}px "Noto Serif KR", serif`;
        ctx.fillStyle = 'rgba(180,160,120,0.30)';
        ctx.textAlign = 'center';
        ctx.fillText(mt.name, sc.x, sc.y);
      }
    }
    ctx.restore();
  }

  // ─── 보로노이 영토 + 경계선 ───

  _drawTerritory(ctx, state, w, h) {
    // 소유권 해시 → 캐시
    const hash = Object.entries(state.cities).map(([id, c]) => id + ':' + (c.owner || '')).join(',');
    if (hash !== this._territoryHash || !this._territoryImg) {
      this._territoryHash = hash;
      this._territoryImg = this._buildTerritoryImage(state, w, h);
    }
    ctx.drawImage(this._territoryImg, 0, 0, w, h);
  }

  _buildTerritoryImage(state, w, h) {
    const oc = document.createElement('canvas');
    oc.width = w; oc.height = h;
    const ox = oc.getContext('2d');

    // 도시 배열 (보로노이 시드)
    const seeds = [];
    for (const [id, pos] of Object.entries(this.positions)) {
      const city = state.cities[id];
      const s = this._s(pos.x, pos.y);
      seeds.push({ x: s.x, y: s.y, owner: city?.owner || null, id });
    }

    // 그리드 기반 보로노이 — 코에이풍: 모든 땅이 누군가에게 속함
    const step = Math.max(3, Math.round(VORONOI_STEP * this.scale));
    const cols = Math.ceil(w / step);
    const rows = Math.ceil(h / step);
    const grid = new Array(cols * rows); // owner per cell

    const BASE_ALPHA = 0.38;        // 전체 균일 영토 알파 (코에이풍 — 진하게)
    const CITY_BOOST = 0.18;        // 도시 근처 추가 밝기
    const BOOST_RANGE = 100;        // 부스트 범위 (논리좌표)

    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const px = gx * step + step / 2;
        const py = gy * step + step / 2;
        let minDist = Infinity, nearest = null;
        for (const s of seeds) {
          const d = (px - s.x) ** 2 + (py - s.y) ** 2;
          if (d < minDist) { minDist = d; nearest = s; }
        }
        const idx = gy * cols + gx;
        grid[idx] = nearest?.owner || null;

        // 영토 채색 — 모든 셀 균일 채색 + 도시 근처 부스트
        if (nearest?.owner) {
          const fc = FC[nearest.owner];
          if (fc) {
            const dist = Math.sqrt(minDist);
            const boostDist = BOOST_RANGE * this.scale;
            const boost = dist < boostDist ? CITY_BOOST * (1 - dist / boostDist) : 0;
            const alpha = BASE_ALPHA + boost;
            ox.fillStyle = `rgba(${fc.t[0]},${fc.t[1]},${fc.t[2]},${alpha.toFixed(3)})`;
            ox.fillRect(gx * step, gy * step, step, step);
          }
        }
      }
    }

    // 영토 색을 블러 처리 (계단 현상 완화)
    const blur = document.createElement('canvas');
    blur.width = w; blur.height = h;
    const bx2 = blur.getContext('2d');
    bx2.filter = 'blur(4px)';
    bx2.drawImage(oc, 0, 0);
    // 블러된 영토를 원본 위에 덮어쓰기
    ox.clearRect(0, 0, w, h);
    ox.drawImage(blur, 0, 0);

    // 경계선 — 세력 국경 (그림자 + 밝은 선)
    const borderSegs = []; // {x1,y1,x2,y2,owner}
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const idx = gy * cols + gx;
        const owner = grid[idx];
        if (!owner) continue;
        // 오른쪽
        if (gx < cols - 1 && grid[idx + 1] && grid[idx + 1] !== owner) {
          borderSegs.push({ x1: (gx+1)*step, y1: gy*step, x2: (gx+1)*step, y2: (gy+1)*step, owner });
        }
        // 아래
        if (gy < rows - 1 && grid[(gy+1)*cols+gx] && grid[(gy+1)*cols+gx] !== owner) {
          borderSegs.push({ x1: gx*step, y1: (gy+1)*step, x2: (gx+1)*step, y2: (gy+1)*step, owner });
        }
      }
    }

    // 그림자 레이어 (한 번에)
    ox.lineCap = 'round';
    ox.strokeStyle = 'rgba(0,0,0,0.55)';
    ox.lineWidth = Math.max(3.5, 4.5 * this.scale);
    ox.beginPath();
    for (const seg of borderSegs) {
      ox.moveTo(seg.x1, seg.y1);
      ox.lineTo(seg.x2, seg.y2);
    }
    ox.stroke();

    // 세력색 레이어 (세력별로 그룹핑)
    const byOwner = {};
    for (const seg of borderSegs) {
      if (!byOwner[seg.owner]) byOwner[seg.owner] = [];
      byOwner[seg.owner].push(seg);
    }
    for (const [own, segs] of Object.entries(byOwner)) {
      const fc = FC[own];
      ox.strokeStyle = fc ? `rgba(${fc.t[0]},${fc.t[1]},${fc.t[2]},0.65)` : 'rgba(255,255,255,0.30)';
      ox.lineWidth = Math.max(1.5, 2.2 * this.scale);
      ox.beginPath();
      for (const seg of segs) {
        ox.moveTo(seg.x1, seg.y1);
        ox.lineTo(seg.x2, seg.y2);
      }
      ox.stroke();
    }

    return oc;
  }

  // ─── 도로 ───

  _drawRoads(ctx, state) {
    ctx.save();
    for (const [from, to] of this.connections) {
      const pa = this.positions[from], pb = this.positions[to];
      if (!pa || !pb) continue;
      const a = this._s(pa.x, pa.y), b = this._s(pb.x, pb.y);
      const cA = state.cities[from], cB = state.cities[to];
      const same = cA && cB && cA.owner && cA.owner === cB.owner;

      // 도로 그림자
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.02)';
      ctx.lineWidth = 6 * this.scale; ctx.lineCap = 'round';
      ctx.stroke();

      // 도로 본체
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      if (same) {
        const fc = FC[cA.owner];
        ctx.strokeStyle = fc ? `rgba(${fc.t[0]},${fc.t[1]},${fc.t[2]},0.35)` : 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 2.2 * this.scale;
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1 * this.scale;
        ctx.setLineDash([4 * this.scale, 5 * this.scale]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // ─── 이벤트 펄스 ───

  _drawEventPulses(ctx) {
    const now = Date.now();
    ctx.save();
    for (const [id, pulse] of this.eventCities) {
      const pos = this.positions[id];
      if (!pos) continue;
      const s = this._s(pos.x, pos.y);
      const progress = (now - pulse.time) / 4000;

      for (let i = 0; i < 3; i++) {
        const p = (progress + i * .25) % 1;
        const r = (CITY_R + 12 + p * 40) * this.scale;
        const a = Math.max(0, .5 * (1 - p));
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = pulse.color + hex(a);
        ctx.lineWidth = (2.5 - p * 1.5) * this.scale;
        ctx.stroke();
      }

      // 글로우
      const ga = .15 * (1 - progress);
      const gr = (CITY_R + 35) * this.scale;
      const gg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, gr);
      gg.addColorStop(0, pulse.color + hex(ga));
      gg.addColorStop(1, pulse.color + '00');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(s.x, s.y, gr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // ─── 병력 이동 애니메이션 ───

  _drawMovements(ctx) {
    const now = Date.now();
    ctx.save();

    for (const m of this.movements) {
      const pf = this.positions[m.from], pt = this.positions[m.to];
      if (!pf || !pt) continue;

      const a = this._s(pf.x, pf.y), b = this._s(pt.x, pt.y);
      const t = Math.min(1, (now - m.startTime) / m.duration);
      const ease = t < .5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2; // easeInOutQuad

      const cx = a.x + (b.x - a.x) * ease;
      const cy = a.y + (b.y - a.y) * ease;

      // 궤적선 (지나온 경로)
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(cx, cy);
      ctx.strokeStyle = m.color + '60';
      ctx.lineWidth = 2.5 * this.scale;
      ctx.lineCap = 'round';
      ctx.stroke();

      // 이동 도트 (삼각 화살)
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const sz = (m.type === 'attack' ? 8 : 6) * this.scale;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(sz, 0);
      ctx.lineTo(-sz * .6, -sz * .5);
      ctx.lineTo(-sz * .6, sz * .5);
      ctx.closePath();
      ctx.fillStyle = m.type === 'attack' ? '#FF4040' : m.color;
      ctx.shadowColor = m.type === 'attack' ? '#FF4040' : m.color;
      ctx.shadowBlur = 8 * this.scale;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();

      // 잔상 도트들
      for (let i = 1; i <= 3; i++) {
        const tt = Math.max(0, ease - i * 0.08);
        const tx = a.x + (b.x - a.x) * tt;
        const ty = a.y + (b.y - a.y) * tt;
        const ta = .3 - i * .08;
        ctx.beginPath(); ctx.arc(tx, ty, (3 - i * .5) * this.scale, 0, Math.PI * 2);
        ctx.fillStyle = m.color + hex(ta);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // ─── 도시 렌더링 ───

  _drawCities(ctx, state) {
    const entries = Object.entries(this.positions).sort(([a], [b]) => {
      if (a === this.selectedCity) return 1;
      if (b === this.selectedCity) return -1;
      return 0;
    });

    for (const [id, pos] of entries) {
      const city = state.cities[id];
      if (!city) continue;

      const s = this._s(pos.x, pos.y);
      const fac = state.factions[city.owner];
      const isCap = fac && fac.leader && city.governor === fac.leader;
      const r = (isCap ? CITY_R_CAP : CITY_R) * this.scale;
      const fc = FC[city.owner] || { b: '#555', l: '#777', d: '#333', t: [85,85,85] };
      const sel = id === this.selectedCity;
      const hov = id === this.hoveredCity && !sel;

      // 선택 글로우
      if (sel) {
        const gr = r + 20 * this.scale;
        const gg = ctx.createRadialGradient(s.x, s.y, r * .5, s.x, s.y, gr);
        gg.addColorStop(0, `rgba(${fc.t[0]},${fc.t[1]},${fc.t[2]},0.35)`);
        gg.addColorStop(1, `rgba(${fc.t[0]},${fc.t[1]},${fc.t[2]},0)`);
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(s.x, s.y, gr, 0, Math.PI * 2); ctx.fill();

        // 선택 링
        ctx.beginPath(); ctx.arc(s.x, s.y, r + 5 * this.scale, 0, Math.PI * 2);
        ctx.strokeStyle = fc.b; ctx.lineWidth = 2 * this.scale; ctx.stroke();
      }

      // 호버
      if (hov) {
        ctx.beginPath(); ctx.arc(s.x, s.y, r + 4 * this.scale, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = 1 * this.scale; ctx.stroke();
      }

      // 성채 (다각형)
      const sides = isCap ? 8 : 6;
      const a0 = -Math.PI / 2;

      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = a0 + (Math.PI * 2 * i) / sides;
        const px = s.x + r * Math.cos(a), py = s.y + r * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();

      // 채우기
      const cg = ctx.createRadialGradient(s.x - r * .2, s.y - r * .2, 0, s.x, s.y, r * 1.1);
      cg.addColorStop(0, fc.l + 'ee');
      cg.addColorStop(0.5, fc.b + 'cc');
      cg.addColorStop(1, fc.d + 'bb');
      ctx.fillStyle = cg;
      ctx.fill();

      // 외벽
      ctx.strokeStyle = fc.l;
      ctx.lineWidth = (isCap ? 2.5 : 1.5) * this.scale;
      ctx.stroke();

      // 내벽
      const ir = r * .55;
      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = a0 + (Math.PI * 2 * i) / sides;
        const px = s.x + ir * Math.cos(a), py = s.y + ir * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,255,255,0.20)';
      ctx.lineWidth = .5 * this.scale;
      ctx.stroke();

      // 수도 탑
      if (isCap) {
        for (let i = 0; i < 4; i++) {
          const a = a0 + (Math.PI * 2 * i) / 4;
          const tx = s.x + (r + 3 * this.scale) * Math.cos(a);
          const ty = s.y + (r + 3 * this.scale) * Math.sin(a);
          ctx.beginPath(); ctx.arc(tx, ty, 2.5 * this.scale, 0, Math.PI * 2);
          ctx.fillStyle = fc.b; ctx.fill();
          ctx.strokeStyle = fc.l; ctx.lineWidth = .7 * this.scale; ctx.stroke();
        }
      }

      // 병력 텍스트
      ctx.font = `bold ${(isCap ? 9 : 8) * this.scale}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const at = city.army >= 10000 ? Math.floor(city.army / 10000) + '만' :
                 city.army >= 1000 ? Math.floor(city.army / 1000) + '천' : String(city.army);
      ctx.fillText(at, s.x, s.y);

      // 사기 바
      if (city.morale !== undefined) {
        const bw = r * 1.6, bh = 2.5 * this.scale;
        const by = s.y + r + 2 * this.scale, bx = s.x - bw / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(bx, by, bw, bh);
        const mr = Math.max(0, Math.min(1, city.morale / 100));
        ctx.fillStyle = mr > .6 ? fc.b : mr > .3 ? '#F5A623' : '#E74C3C';
        ctx.fillRect(bx, by, bw * mr, bh);
      }

      // 도시 이름
      const name = city.name;
      ctx.font = `600 ${10 * this.scale}px "Noto Sans KR", sans-serif`;
      const nw = ctx.measureText(name).width;
      const ny = s.y + r + 13 * this.scale;
      // 배경 플레이트
      const pd = 3 * this.scale;
      ctx.fillStyle = 'rgba(10,10,16,0.80)';
      ctx.beginPath();
      rr(ctx, s.x - nw / 2 - pd, ny - 6 * this.scale, nw + pd * 2, 13 * this.scale, 2 * this.scale);
      ctx.fill();
      // 텍스트
      ctx.fillStyle = sel ? '#fff' : '#bbb';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(name, s.x, ny);

      // 수도 별
      if (isCap) {
        ctx.font = `${8 * this.scale}px sans-serif`;
        ctx.fillStyle = '#c9a84c';
        ctx.fillText('★', s.x, s.y - r - 5 * this.scale);
      }
    }
  }

  // ─── 비네팅 ───

  _drawVignette(ctx, w, h) {
    const g = ctx.createRadialGradient(w * .45, h * .45, w * .18, w * .5, h * .5, w * .78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

// ── 유틸 ──
function hex(a) {
  return Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
}
function rr(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
}
