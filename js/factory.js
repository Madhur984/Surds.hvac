/* Surds — factory floor THERMAL SENSOR feed + analytics boundaries.
   A top-down infrared capture (ironbow heat-map, grain, scanlines) like a
   ceiling-mounted thermal sensor, with a crisp analytics overlay locked on:
   - walls + machine bays outlined as boundaries,
   - furnaces boxed and labelled as hotspots,
   - every worker wrapped in a tracking box,
   - cooling zones flagged where the floor runs over comfort.
   The heat-map is a diffusing scalar field; the boundaries are vector-crisp
   on top, so it reads as real sensor + software, not an illustration. */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cv = document.getElementById('faccanvas');
  if (!cv || !cv.getContext) return;
  const ctx = cv.getContext('2d', { alpha: false });
  const stage = cv.parentElement;

  // ---- plan space (the layout is authored in these units) ----
  const PW = 1200, PH = 675;
  const WALL = { x: 50, y: 50, w: 1100, h: 575 };
  const MACH = [
    { n: 'CNC-1', x: 95, y: 95, w: 150, h: 110, t: 0.30 },
    { n: 'CNC-2', x: 265, y: 95, w: 150, h: 110, t: 0.28 },
    { n: 'LATHE', x: 455, y: 95, w: 150, h: 110, t: 0.33 },
    { n: 'PRESS', x: 645, y: 95, w: 150, h: 110, t: 0.46 },
    { n: 'STORAGE', x: 845, y: 95, w: 255, h: 175, t: 0.05 },
    { n: 'ASSEMBLY', x: 560, y: 305, w: 235, h: 140, t: 0.36 },
    { n: 'QC', x: 845, y: 300, w: 255, h: 160, t: 0.10 },
    { n: 'WELD', x: 110, y: 505, w: 175, h: 100, t: 0.54 },
    { n: 'PACK', x: 320, y: 505, w: 175, h: 100, t: 0.20 },
    { n: 'CONTROL', x: 560, y: 505, w: 235, h: 100, t: 0.05 },
    { n: 'DOCK', x: 845, y: 505, w: 255, h: 100, t: 0.04 }
  ];
  const FURN = [
    { n: 'FURNACE 01', x: 110, y: 305, w: 165, h: 140, t: 0.97, c: '312°C' },
    { n: 'FURNACE 02', x: 320, y: 305, w: 165, h: 140, t: 0.97, c: '305°C' }
  ];
  const COOL = [
    { x: 250, y: 250, lab: 'ADD COOLING' },
    { x: 430, y: 480, lab: 'COOL ZONE' },
    { x: 700, y: 250, lab: 'ADD COOLING' }
  ];
  const PEOPLE = [
    { k: 'h', y: 250, x0: 130, x1: 1070, sp: 0.050, ph: 0.0 },
    { k: 'h', y: 250, x0: 1070, x1: 130, sp: 0.040, ph: 1.6 },
    { k: 'h', y: 480, x0: 150, x1: 1060, sp: 0.045, ph: 3.0 },
    { k: 'v', x: 820, y0: 130, y1: 580, sp: 0.050, ph: 0.7 },
    { k: 's', x: 175, y: 235 }, { k: 's', x: 530, y: 235 },
    { k: 's', x: 192, y: 472 }, { k: 's', x: 402, y: 472 },
    { k: 's', x: 677, y: 470 }, { k: 's', x: 965, y: 285 }
  ];
  function ppos(p, t) {
    if (p.k === 'h') { const u = 0.5 + 0.5 * Math.sin(t * p.sp * TAU + p.ph); return { x: p.x0 + (p.x1 - p.x0) * u, y: p.y }; }
    if (p.k === 'v') { const u = 0.5 + 0.5 * Math.sin(t * p.sp * TAU + p.ph); return { x: p.x, y: p.y0 + (p.y1 - p.y0) * u }; }
    return { x: p.x + 3 * Math.sin(t * 0.8 + p.x), y: p.y + 2 * Math.cos(t * 0.6 + p.y) };
  }

  // ---- heat field ----
  const FW = 240, FH = 135, N = FW * FH, SC = PW / FW;   // plan->field divisor (=5)
  let cur = new Float32Array(N), nxt = new Float32Array(N);
  const amb = new Float32Array(N);
  const off = document.createElement('canvas'); off.width = FW; off.height = FH;
  const octx = off.getContext('2d');
  const fimg = octx.createImageData(FW, FH);
  const GW = 128, GH = 72;
  const grain = document.createElement('canvas'); grain.width = GW; grain.height = GH;
  const gctx = grain.getContext('2d');
  const gimg = gctx.createImageData(GW, GH);

  // ironbow LUT
  const STOPS = [[0.00, 6, 4, 20], [0.12, 28, 2, 54], [0.26, 74, 10, 110], [0.40, 138, 24, 104], [0.53, 196, 34, 86], [0.64, 236, 86, 30], [0.76, 255, 138, 24], [0.86, 255, 192, 26], [0.94, 255, 232, 138], [1.00, 255, 253, 242]];
  const LUT = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) { const t = i / 255; let a = STOPS[0], b = STOPS[STOPS.length - 1]; for (let s = 0; s < STOPS.length - 1; s++) if (t >= STOPS[s][0] && t <= STOPS[s + 1][0]) { a = STOPS[s]; b = STOPS[s + 1]; break; } const f = (t - a[0]) / (b[0] - a[0] || 1); LUT[i * 3] = a[1] + (b[1] - a[1]) * f; LUT[i * 3 + 1] = a[2] + (b[2] - a[2]) * f; LUT[i * 3 + 2] = a[3] + (b[3] - a[3]) * f; }

  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) amb[y * FW + x] = 0.12 + 0.04 * Math.sin(x * 0.08 + y * 0.05);

  // pin a rectangular equipment temperature into the field (soft edges)
  function pinRect(px, py, pw, ph, val) {
    const x0 = px / SC, y0 = py / SC, x1 = (px + pw) / SC, y1 = (py + ph) / SC, E = 3;
    const ix0 = Math.max(1, x0 | 0), ix1 = Math.min(FW - 2, Math.ceil(x1)), iy0 = Math.max(1, y0 | 0), iy1 = Math.min(FH - 2, Math.ceil(y1));
    for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) {
      const e = Math.min(x - x0, x1 - x, y - y0, y1 - y);
      const f = e <= 0 ? 0 : e >= E ? 1 : e / E;
      const i = y * FW + x, target = amb[i] + (val - amb[i]) * f;
      if (target > cur[i]) cur[i] = target;
    }
  }
  function addBlob(cx, cy, peak, rx, ry) {
    const x0 = Math.max(1, (cx - rx) | 0), x1 = Math.min(FW - 2, Math.ceil(cx + rx)), y0 = Math.max(1, (cy - ry) | 0), y1 = Math.min(FH - 2, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const dx = (x - cx) / rx, dy = (y - cy) / ry, d = dx * dx + dy * dy; if (d > 1) continue; const i = y * FW + x, v = cur[i] + peak * Math.exp(-d * 2.3); cur[i] = v > 1 ? 1 : v; }
  }

  function step(t) {
    const DIFF = 0.13, DECAY = 0.05;
    for (let y = 1; y < FH - 1; y++) { const row = y * FW; for (let x = 1; x < FW - 1; x++) { const i = row + x; const lap = (cur[i - 1] + cur[i + 1] + cur[i - FW] + cur[i + FW]) * 0.25 - cur[i]; let v = cur[i] + DIFF * lap; v += (amb[i] - v) * DECAY; nxt[i] = v; } }
    const tmp = cur; cur = nxt; nxt = tmp;
    for (let x = 0; x < FW; x++) { cur[x] = amb[x]; cur[(FH - 1) * FW + x] = amb[(FH - 1) * FW + x]; }
    for (let y = 0; y < FH; y++) { cur[y * FW] = amb[y * FW]; cur[y * FW + FW - 1] = amb[y * FW + FW - 1]; }
    for (let m = 0; m < MACH.length; m++) { const o = MACH[m]; if (o.t > 0.14) pinRect(o.x, o.y, o.w, o.h, o.t); }
    for (let f = 0; f < FURN.length; f++) { const o = FURN[f], fl = 0.94 + 0.06 * Math.sin(t * (2 + f) + f); pinRect(o.x, o.y, o.w, o.h, o.t * fl); }
    for (let q = 0; q < PEOPLE.length; q++) { const o = ppos(PEOPLE[q], t), fx = o.x / SC, fy = o.y / SC; addBlob(fx, fy, 0.55, 2.0, 2.6); addBlob(fx, fy - 0.6, 0.66, 1.3, 1.3); }
  }

  function paintField() { const d = fimg.data; for (let i = 0, p = 0; i < N; i++, p += 4) { let v = cur[i]; v = v < 0 ? 0 : v > 1 ? 1 : v; const l = ((v * 255) | 0) * 3; d[p] = LUT[l]; d[p + 1] = LUT[l + 1]; d[p + 2] = LUT[l + 2]; d[p + 3] = 255; } octx.putImageData(fimg, 0, 0); }

  // ---- analytics boundary overlay ----
  let cw = 0, ch = 0, dpr = 1, blurOK = true, sx = 1, sy = 1;
  function R(px, py, pw, ph) { ctx.strokeRect(px * sx, py * sy, pw * sx, ph * sy); }
  function corners(px, py, pw, ph, c) {
    const x = px * sx, y = py * sy, w = pw * sx, h = ph * sy;
    ctx.beginPath();
    ctx.moveTo(x, y + c); ctx.lineTo(x, y); ctx.lineTo(x + c, y);
    ctx.moveTo(x + w - c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + c);
    ctx.moveTo(x + w, y + h - c); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - c, y + h);
    ctx.moveTo(x + c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - c); ctx.stroke();
  }
  function drawBoundaries(t) {
    ctx.save();
    ctx.lineJoin = 'round'; ctx.textBaseline = 'alphabetic';
    const fs = Math.round(cw / 112);
    ctx.font = '700 ' + fs + 'px "Space Mono", monospace';
    // wall
    ctx.lineWidth = Math.max(1.4, cw / 700); ctx.strokeStyle = 'rgba(120,225,235,0.5)';
    R(WALL.x, WALL.y, WALL.w, WALL.h);
    // machine bays
    ctx.lineWidth = Math.max(1, cw / 1000);
    for (let m = 0; m < MACH.length; m++) { const o = MACH[m]; ctx.strokeStyle = 'rgba(150,225,235,0.34)'; R(o.x, o.y, o.w, o.h); ctx.fillStyle = 'rgba(196,240,245,0.55)'; ctx.fillText(o.n, o.x * sx + 5, o.y * sy + fs + 4); }
    // furnaces (hotspot boxes)
    ctx.lineWidth = Math.max(1.4, cw / 760); ctx.strokeStyle = 'rgba(255,196,120,0.92)';
    for (let f = 0; f < FURN.length; f++) {
      const o = FURN[f]; R(o.x, o.y, o.w, o.h); corners(o.x - 4, o.y - 4, o.w + 8, o.h + 8, Math.min(o.w, o.h) * sx * 0.18);
      ctx.fillStyle = 'rgba(255,210,140,0.95)'; ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 4;
      ctx.fillText(o.n, o.x * sx + 6, o.y * sy - 6 * sy);
      ctx.font = '700 ' + Math.round(fs * 0.82) + 'px "Space Mono", monospace';
      ctx.fillStyle = 'rgba(255,150,80,0.95)'; ctx.fillText('HOTSPOT ' + o.c, o.x * sx + 6, (o.y + o.h) * sy + fs);
      ctx.font = '700 ' + fs + 'px "Space Mono", monospace'; ctx.shadowBlur = 0;
    }
    // worker tracking boxes
    ctx.lineWidth = Math.max(1, cw / 1000); ctx.font = '700 ' + Math.round(fs * 0.78) + 'px "Space Mono", monospace';
    for (let q = 0; q < PEOPLE.length; q++) {
      const o = ppos(PEOPLE[q], t), bx = o.x - 17, by = o.y - 26;
      ctx.strokeStyle = 'rgba(150,245,205,0.82)'; R(bx, by, 34, 52);
      ctx.fillStyle = 'rgba(150,245,205,0.9)'; ctx.fillText('P' + (q + 1), bx * sx, by * sy - 3);
    }
    // cooling zones (dashed)
    ctx.setLineDash([7, 5]); ctx.lineWidth = Math.max(1.3, cw / 820); ctx.font = '700 ' + Math.round(fs * 0.9) + 'px "Space Mono", monospace';
    const br = 1 + 0.07 * Math.sin(t * 1.7);
    for (let c = 0; c < COOL.length; c++) {
      const o = COOL[c], w = 64 * br, h = 56 * br;
      ctx.strokeStyle = 'rgba(105,215,222,0.92)'; R(o.x - w / 2, o.y - h / 2, w, h);
      ctx.setLineDash([]); ctx.beginPath();
      ctx.moveTo((o.x - 9) * sx, o.y * sy); ctx.lineTo((o.x + 9) * sx, o.y * sy);
      ctx.moveTo(o.x * sx, (o.y - 9) * sy); ctx.lineTo(o.x * sx, (o.y + 9) * sy); ctx.stroke();
      ctx.setLineDash([7, 5]);
      ctx.fillStyle = 'rgba(150,240,245,0.95)'; ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 4;
      ctx.fillText(o.lab, (o.x - w / 2) * sx, (o.y - h / 2) * sy - 5); ctx.shadowBlur = 0;
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawGrain() { const gd = gimg.data; for (let i = 0, p = 0; i < GW * GH; i++, p += 4) { const n = (Math.random() * 255) | 0; gd[p] = gd[p + 1] = gd[p + 2] = n; gd[p + 3] = 22; } gctx.putImageData(gimg, 0, 0); ctx.globalCompositeOperation = 'overlay'; ctx.imageSmoothingEnabled = true; ctx.drawImage(grain, 0, 0, cw, ch); ctx.globalCompositeOperation = 'source-over'; }

  function resize() {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = Math.max(2, Math.round(r.width)); ch = Math.max(2, Math.round(r.height));
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sx = cw / PW; sy = ch / PH; blurOK = (typeof ctx.filter !== 'undefined');
  }

  const elClk = document.getElementById('fac-clock');
  let lastHud = -1e9;

  function frame(t) {
    // thermal heat-map with a faint handheld drift
    const shx = Math.sin(t * 0.8) * (cw * 0.003), shy = Math.cos(t * 1.05) * (ch * 0.003), bleed = Math.max(5, cw * 0.016);
    ctx.save(); ctx.translate(shx, shy); ctx.imageSmoothingEnabled = true;
    if (blurOK) ctx.filter = 'blur(' + Math.max(2, cw / 420).toFixed(1) + 'px)';
    ctx.drawImage(off, 0, 0, FW, FH, -bleed, -bleed, cw + bleed * 2, ch + bleed * 2);
    if (blurOK) ctx.filter = 'none';
    ctx.restore();
    drawBoundaries(t);
    drawGrain();
  }

  function render(now) {
    const t = now / 1000;
    step(t); paintField(); frame(t);
    if (elClk && now - lastHud > 250) { lastHud = now; const d = new Date(); elClk.textContent = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':'); }
    raf = requestAnimationFrame(render);
  }

  let raf = 0, running = false;
  const start = () => { if (!running) { running = true; lastHud = -1e9; raf = requestAnimationFrame(render); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  function init() { resize(); cur.set(amb); for (let i = 0; i < 120; i++) step(i * 0.1); paintField(); frame(0); }
  window.addEventListener('resize', () => { resize(); if (reduce) frame(0); }, { passive: true });
  init();

  if (!reduce) {
    if ('IntersectionObserver' in window) { new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting ? start() : stop()), { threshold: 0.04 }).observe(cv); document.addEventListener('visibilitychange', () => document.hidden ? stop() : start()); }
    else start();
  }
})();
