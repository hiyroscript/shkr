/* ---- sim.js ---- */
/* ============================================================================
   SIM — deterministic fixed-timestep simulation, shared by the game and by the
   Node beatability solver. Everything is measured in beats and world units
   (4 units per beat), so a level plays identically at any tempo.
   ========================================================================== */
const SIM = (function () {
  "use strict";
  const TPB = 96, DT = 1 / TPB, UPB = 4, DX = UPB * DT;
  const PH = 1.7, SH = 0.8, HW = 0.3, CH = 6.5;
  const G0 = { g: 20, v: 10, off: 2 }, GD = { g: 12, v: 9, off: 3 }, GA = { g: 57.6, v: 14.4, off: 1 };
  const COY = Math.round(0.15 * TPB), BUF = Math.round(0.2 * TPB), SMIN = Math.round(0.25 * TPB);
  const FADE = Math.round(0.42 * TPB);
  const ZP = { D: "d", A: "a", T: "t", Z: "z", L: "l" };
  const JUMPC = "^MI_uU+#H!%&@", EMPTY = [];
  /* moving plain obstacles, both pure functions of the tick (so replays and the solver's state hash, which starts
     with the tick, are unaffected): a crusher is down (on the ground) around every off-beat and up around every
     beat; a rolling blade moves left at BLADE units per beat and reaches its cell's spike position exactly when
     the runner does */
  const CRUSH_UP = 2.2, BLADE = 2;
  function crushY(tick) {
    const p = (tick % TPB) / TPB, d = Math.abs(p - 0.5);   /* 0 on the off-beat, 0.5 on the beat */
    return d < 0.22 ? 0 : d > 0.28 ? CRUSH_UP : CRUSH_UP * (d - 0.22) / 0.06;
  }

  function expand(def) {
    let T = "", H = "", energy = [], e = 1;
    for (const tok of def.form.replace(/\s+/g, "")) {
      if (tok >= "0" && tok <= "9") { e = +tok; continue; }
      const p = def.phr[tok];
      if (!p) throw new Error("L" + def.n + ": unknown phrase " + tok);
      let parts = p.replace(/\s+/g, "").split("/"), t = parts[0], h = parts[1] || ".".repeat(t.length);
      if (t.length % 8 || h.length !== t.length) throw new Error("L" + def.n + ": bad phrase " + tok + " " + t.length + "/" + h.length);
      T += t; H += h;
      for (let i = 0; i < t.length / 8; i++) energy.push(e);
    }
    return { T: T.split(""), H: H.split(""), energy: energy };
  }

  /* The per-cell work of a chart, shared by compile() (a whole level) and append() (one chunk of an Infinite Shadow
     stream), so a hazard can never behave differently in one than in the other. T, H: the cells; c0: the global index
     of T[0] (x = 2 * (c0 + i)); y0: the ground height at its left edge; id: the first object id; X0, X1: how far its
     ground reaches; chart / ci: where its action cells are written (chart[ci + i]); tag: names it in errors. */
  function build(T, H, c0, y0, id, X0, X1, chart, ci, tag) {
    const n = T.length, zones = [], rails = [], coils = [], segs = [], objs = [];
    /* zones */
    const open = {};
    for (let i = 0; i < n; i++) {
      const c = H[i];
      if (ZP[c]) { if (open[c] !== undefined) throw new Error(tag + ": zone " + c + " reopened @" + i); open[c] = i; }
      else for (const k in ZP) if (ZP[k] === c) {
        if (open[k] === undefined) throw new Error(tag + ": zone end " + c + " without start @" + i);
        zones.push({ k: k, x0: 2 * (c0 + open[k]), x1: 2 * (c0 + i), base: 0 }); delete open[k];
      }
    }
    for (const k in open) throw new Error(tag + ": zone " + k + " never closed");
    const inZ = function (x, k) { for (const z of zones) if (z.k === k && x >= z.x0 && x < z.x1) return z; return null; };
    const offAt = function (x) { return inZ(x, "A") ? 1 : inZ(x, "D") ? 3 : 2; };
    /* terrain edits */
    const gaps = [], steps = [];
    for (let i = 0; i < n; i++) {
      const x = 2 * (c0 + i), c = T[i], h = H[i], off = offAt(x);
      if (c === "_") gaps.push(off === 1 ? [x + 0.5, x + 1.5] : off === 3 ? [x + 1, x + 5] : [x + 1, x + 3]);
      else if (c === "u") gaps.push([x + 0.6, x + 3.4]);
      else if (c === "U") gaps.push([x + 1, x + 5]);
      else if (c === "~") gaps.push([x, x + 2]);
      else if (c === "+" || c === "%") steps.push([x + off, 1]);
      else if (c === "#") steps.push([x + off, 2]);
      else if (c === "H") steps.push([x + off, 4]);
      else if (c === "v") steps.push([x + 2, -1]);
      else if (c === "V") steps.push([x + 2, -2]);
      else if (c === "Y") steps.push([x + 2, -4]);
      if (h === "F" || h === "1" || h === "2") gaps.push([x, x + 2]);
      chart[ci + i] = JUMPC.indexOf(c) >= 0 || "KORC".indexOf(h) >= 0 || (c === "|" && (c0 + i) % 2 === 0) ? 1 :
        c === "-" || c === "*" || (c === "=" && T[i - 1] !== "=") || h === "S" ? 2 : h !== "." && "BFX12Ee".indexOf(h) >= 0 ? 3 : 0;
    }
    /* a hurdle pair asks for the slide one beat after its jump */
    for (let i = 0; i < n; i++) if (T[i] === "&" && i + 2 < n && !chart[ci + i + 2]) chart[ci + i + 2] = 2;
    steps.sort(function (a, b) { return a[0] - b[0]; });
    gaps.sort(function (a, b) { return a[0] - b[0]; });
    const baseAt = function (x) { let b = y0; for (const s of steps) { if (s[0] <= x) b += s[1]; else break; } return b; };
    for (const z of zones) z.base = baseAt(z.x0 + 0.01);
    /* ground segments */
    let bp = [X0, X1];
    gaps.forEach(function (g) { bp.push(g[0], g[1]); });
    steps.forEach(function (s) { bp.push(s[0]); });
    zones.forEach(function (z) { if (z.k === "Z") bp.push(z.x0, z.x1); });
    bp = Array.from(new Set(bp.map(function (v) { return Math.round(v * 1000) / 1000; }))).sort(function (a, b) { return a - b; });
    let minY = y0, maxY = y0;
    for (let i = 0; i < bp.length - 1; i++) {
      const a = bp[i], b = bp[i + 1], mid = (a + b) / 2;
      let gap = false;
      for (const g of gaps) { if (g[0] > mid) break; if (mid < g[1]) { gap = true; break; } }
      if (gap) continue;
      const h = baseAt(mid), fl = !!inZ(mid, "Z"), last = segs[segs.length - 1];
      minY = Math.min(minY, h); maxY = Math.max(maxY, h);
      if (last && last.x1 === a && last.top === h && last.flip === fl) last.x1 = b;
      else segs.push({ x0: a, x1: b, top: h, bot: -1e9, kind: "", id: 0, flip: fl });
    }
    /* objects */
    const box = function (k, x0, x1, y0, y1, extra) {
      const o = Object.assign({ k: k, x0: x0, x1: x1, y0: y0, y1: y1, id: id++, x: (x0 + x1) / 2, flip: !!inZ((x0 + x1) / 2, "Z") }, extra || {});
      objs.push(o); return o;
    };
    const circ = function (k, cx, cy, r, extra) {
      const o = Object.assign({ k: k, cx: cx, cy: cy, r: r, id: id++, x: cx, x0: cx - r, x1: cx + r, flip: !!inZ(cx, "Z") }, extra || {});
      objs.push(o); return o;
    };
    let lastKey = 0, lastEye = 0, tile = null, coil = null, glass = null;
    for (let i = 0; i < n; i++) {
      const x = 2 * (c0 + i), c = T[i], h = H[i], off = offAt(x), cx = x + off, b = baseAt(cx - 0.01), b0 = baseAt(x + 0.01);
      if (c === "^") { if (off === 1) box("L", cx - 0.15, cx + 0.15, b, b + 0.5, { v: "sp" }); else box("L", cx - 0.45, cx + 0.45, b, b + 0.8, { v: "sp" }); }
      else if (c === "M") box("L", cx - 0.8, cx + 0.8, b, b + 0.8, { v: "sp" });
      else if (c === "I") box("L", cx - 0.25, cx + 0.25, b, b + 1.5, { v: "sp" });
      else if (c === "!") box("L", x + 1.6, x + 2.4, baseAt(x + 2), baseAt(x + 2) + 2.5, { v: "tw" });
      else if (c === "-") { const bb = baseAt(x + 1.6); box("L", x + 1.0, x + 2.6, bb + 1.0, bb + 9, { v: "bar", c: 1 }); }
      else if (c === "'") { const bb = baseAt(x + 2); box("L", x + 1.6, x + 2.4, bb + 2.0, bb + 9, { v: "st" }); }
      /* newer plain obstacles: floating spike block, low tunnel (one box per run of "="), spiked step edge,
         hurdle pair (spike, then a bar one beat later), beat crusher, rolling blade */
      else if (c === "*") box("L", cx - 0.4, cx + 0.4, b + 1.1, b + 1.8, { v: "fb", c: 1 });
      else if (c === "=") { if (T[i - 1] !== "=") { let j = i; while (T[j + 1] === "=") j++; const bb = baseAt(x + 1); box("L", x + 1, 2 * (c0 + j) + 3, bb + 1.0, bb + 2.6, { v: "tn", c: 1 }); } }
      else if (c === "%") box("L", cx, cx + 0.6, b + 1, b + 1.6, { v: "ss" });
      else if (c === "&") { const bb = baseAt(x + 2); box("L", x + 1.6, x + 2.4, bb, bb + 0.8, { v: "hs" }); box("L", x + 4.6, x + 6.2, bb + 1.0, bb + 9, { v: "hb", c: 1 }); }
      else if (c === "|") { const bb = baseAt(x + 2); box("L", x + 1.6, x + 2.4, bb, bb + 0.9, { v: "cr", mv: 1 }); }
      else if (c === "@") { const bb = baseAt(x + 2); box("L", x + 1.55, x + 2.45, bb, bb + 1.1, { v: "rb", mv: 2, tm: (x + 2) / DX, vx: BLADE / TPB }); }
      /* hazards */
      const tl = h === "F" || h === "1" || h === "2" ? h : "";
      if (tl) {
        if (tile && tile.kind === tl && tile.x1 === x && tile.top === b0) tile.x1 = x + 2;
        else { tile = { x0: x, x1: x + 2, top: b0, bot: b0 - 0.45, kind: tl, id: id++, flip: !!inZ(x + 1, "Z") }; segs.push(tile); }
      }
      if (h === "X") {
        if (glass && glass.x1 === x) glass.x1 = x + 2;
        else { glass = { x0: x, x1: x + 2, top: b0 + 4, bot: b0 + 3.72, kind: "X", id: id++, flip: false }; segs.push(glass); }
      }
      if (h === "S") { if (coil && coil.x1 === x) coil.x1 = x + 2; else { coil = { x0: x, x1: x + 2, y: b0, flip: !!inZ(x + 1, "Z") }; coils.push(coil); } }
      if (h === "B") box("bl", x + 0.3, x + 1.7, b0, b0 + 0.7);
      else if (h === "O") circ("ha", x, baseAt(x - 0.01) + 2.4, 0.8);
      else if (h === "K") lastKey = circ("ke", x + 2, baseAt(x + 2) + 2.3, 0.7).id;
      else if (h === "G") box("ga", x + 0.9, x + 1.1, b0, b0 + 9, { key: lastKey });
      else if (h === "R") circ("ri", x + 1.2, b0 + 2.2, 0.8, { ey: b0 + 4.8 });
      else if (h === "C") circ("co", x + 2, baseAt(x + 2) + 2.7, 0.8);
      else if (h === "n") box("L", x + 1.6, x + 2.4, b0 + 3.0, b0 + 9, { v: "bn" });
      else if (h === "m") box("L", x + 1.6, x + 2.4, b0, b0 + 3.0, { v: "bm" });
      else if (h === "E") lastEye = box("ey", x + 1.95, x + 2.05, b0, b0 + 9, { b: baseAt(x + 2) }).id;
      else if (h === "e") box("em", x + 1.75, x + 2.25, b0, b0 + 9, { eye: lastEye, b: baseAt(x + 2) });
      else if (h === "x") { const r = inZ(x + 2, "L"); if (r) { const ry = baseAt(r.x0 + 0.01) + 3.6; box("L", x + 1.7, x + 2.3, ry - 1.3, ry + 0.4, { v: "kn" }); } }
    }
    zones.forEach(function (z) { if (z.k === "L") rails.push({ x0: z.x0, x1: z.x1, y: z.base + 3.6, flip: !!inZ(z.x0 + 0.1, "Z") }); });
    segs.sort(function (a, b) { return a.x0 - b.x0; });
    objs.sort(function (a, b) { return a.x0 - b.x0; });
    return { zones: zones.filter(function (z) { return z.k !== "L"; }), rails: rails, coils: coils, segs: segs, objs: objs, baseAt: baseAt,
      minY: minY, maxY: maxY, id: id, end: baseAt(X1) };
  }
  /* buckets (4 units wide, entries padded by 1.5 units) */
  function put(arr, a, b, v) { for (let k = Math.max(0, Math.floor((a - 1.5) / 4)); k <= Math.floor((b + 1.5) / 4); k++) (arr[k] || (arr[k] = [])).push(v); }

  function compile(def) {
    const ex = expand(def), T = ex.T, H = ex.H, n = T.length;
    (def.fix || []).forEach(function (f) { (f[1] ? H : T)[f[0]] = "."; });
    const L = { n: def.n, cells: n, bars: n / 8, energy: ex.energy, T: T, H: H, zones: [], rails: [], coils: [], segs: [], objs: [], endX: 2 * n + 8, sb: [], ob: [], zb: [], chart: new Uint8Array(n + 8) };
    const B = build(T, H, 0, 0, 1, -60, L.endX + 400, L.chart, 0, "L" + def.n);
    L.zones = B.zones; L.rails = B.rails; L.coils = B.coils; L.segs = B.segs; L.objs = B.objs;
    L.baseAt = B.baseAt; L.minY = B.minY; L.maxY = B.maxY;
    L.ox = {}; L.objs.forEach(function (o) { L.ox[o.id] = o.x; });
    L.segs.forEach(function (s) { if (s.id) L.ox[s.id] = s.x0; });
    L.segs.forEach(function (s) { put(L.sb, s.x0, s.x1, s); });
    L.objs.forEach(function (o) { put(L.ob, o.x0, o.x1, o); });
    L.zones.forEach(function (z) { put(L.zb, z.x0, z.x1, z); });
    L.rb = []; L.rails.forEach(function (r, i) { r.i = i; put(L.rb, r.x0, r.x1, r); });
    L.cb = []; L.coils.forEach(function (c) { put(L.cb, c.x0, c.x1, c); });
    return L;
  }

  /* ---------------- streams (Infinite Shadow) ----------------
     A level that grows at the front and is trimmed at the back. It has the shape step() reads (segs, objs, zones,
     rails, coils, the buckets, ox, minY), with endX = Infinity so s.won never fires. append() compiles one chunk at
     the current end through the same build() as compile(): global cells and x, the ground height carried over, ids
     counting on. A chunk's ground never merges with the chunk before (at margin 0 two touching segments of one height
     are the same floor). minY is fixed by the stream (def.minY, the floor of the generator's height band), so a fall
     dies at the same tick however far ahead the stream has been generated. chart grows by doubling. A stream can also
     start in the middle (def.c0, def.base, def.id): the generator compiles a candidate chunk on its own that way, at
     exactly the place, height and ids it would get in the real stream. Cell i's action is chart[i - c00]. */
  function stream(def) {
    def = def || {};
    const c0 = def.c0 || 0;
    const L = { n: def.n === undefined ? "inf" : def.n, stream: true, cells: c0, c00: c0, bars: c0 / 8, energy: [], chart: new Uint8Array(256),
      zones: [], rails: [], coils: [], segs: [], objs: [], endX: Infinity, sb: [], ob: [], zb: [], rb: [], cb: [], ox: {},
      minY: def.minY === undefined ? -8 : def.minY, maxY: def.base || 0, base: def.base || 0, id: def.id || 1, chunks: [], tb: 0 };
    L.baseAt = function (x) {
      const C = L.chunks;
      if (!C.length || x < C[0].x0) return C.length ? C[0].b0 : L.base;
      let lo = 0, hi = C.length - 1;
      while (lo < hi) { const md = (lo + hi + 1) >> 1; if (C[md].x0 <= x) lo = md; else hi = md - 1; }
      return x >= C[lo].x1 && lo === C.length - 1 ? L.base : C[lo].baseAt(x);
    };
    return L;
  }
  /* one chunk ("terrain/overlay", 8 cells a bar) at the end of stream L; energy: a digit for all its bars, or one per bar */
  function append(L, phrase, energy) {
    let parts = phrase.replace(/\s+/g, "").split("/"), t = parts[0], h = parts[1] || ".".repeat(t.length);
    if (t.length % 8 || h.length !== t.length) throw new Error("stream: bad chunk " + t.length + "/" + h.length);
    const T = t.split(""), Hc = h.split(""), n = T.length, c0 = L.cells, x0 = 2 * c0, x1 = 2 * (c0 + n);
    if (L.chart.length < c0 - L.c00 + n + 8) { let k = L.chart.length * 2; while (k < c0 - L.c00 + n + 8) k *= 2; const a = new Uint8Array(k); a.set(L.chart); L.chart = a; }
    const B = build(T, Hc, c0, L.base, L.id, L.cells === 0 ? -60 : x0, x1, L.chart, c0 - L.c00, "stream@" + c0);
    const r0 = L.rails.length;
    B.objs.forEach(function (o) { L.objs.push(o); L.ox[o.id] = o.x; put(L.ob, o.x0, o.x1, o); });
    B.segs.forEach(function (s) { L.segs.push(s); if (s.id) L.ox[s.id] = s.x0; put(L.sb, s.x0, s.x1, s); });
    B.zones.forEach(function (z) { L.zones.push(z); put(L.zb, z.x0, z.x1, z); });
    B.rails.forEach(function (r, i) { r.i = r0 + i; L.rails.push(r); put(L.rb, r.x0, r.x1, r); });
    B.coils.forEach(function (c) { L.coils.push(c); put(L.cb, c.x0, c.x1, c); });
    for (let b = 0; b < n / 8; b++) L.energy.push(typeof energy === "number" ? energy : energy && energy[b] !== undefined ? energy[b] : 1);
    const ch = { c0: c0, n: n, x0: x0, x1: x1, b0: L.base, b1: B.end, id0: L.id, id1: B.id, T: t, H: h, baseAt: B.baseAt,
      lo: B.minY, hi: B.maxY, ns: B.segs.length, no: B.objs.length, nz: B.zones.length, nc: B.coils.length, r0: r0, r1: L.rails.length };
    L.chunks.push(ch);
    L.cells = c0 + n; L.bars = L.cells / 8; L.base = B.end; L.id = B.id; L.maxY = Math.max(L.maxY, B.maxY);
    return ch;
  }
  /* drop every chunk that ends more than `keep` units behind x, with its buckets, objects, ids and, in state s (if
     given), the s.dyn entries of its objects: none of them can be read again, so a run plays exactly as untrimmed */
  function trim(L, x, s, keep) {
    const lim = x - (keep === undefined ? 64 : keep);
    let dropped = 0;
    while (L.chunks.length > 1 && L.chunks[0].x1 < lim) {
      const ch = L.chunks.shift();
      L.segs.splice(0, ch.ns).forEach(function (q) { if (q.id) delete L.ox[q.id]; });
      L.objs.splice(0, ch.no).forEach(function (o) { delete L.ox[o.id]; });
      L.zones.splice(0, ch.nz); L.coils.splice(0, ch.nc);
      for (let i = ch.r0; i < ch.r1; i++) delete L.rails[i];
      if (s) for (const k in s.dyn) if (+k < ch.id1) delete s.dyn[k];
      const hiB = Math.floor((ch.x1 - 4) / 4);
      for (let k = L.tb; k < hiB; k++) { delete L.sb[k]; delete L.ob[k]; delete L.zb[k]; delete L.rb[k]; delete L.cb[k]; }
      L.tb = Math.max(L.tb, hiB); dropped++;
    }
    return dropped;
  }

  function newState() {
    return { tick: 0, y: 0, vy: 0, gr: true, sl: false, slT: 0, coy: 0, buf: 0, jp: false, air: 0, gl: 0, hang: -1,
      flip: false, zz: null, par: 0, ch: 0, dl: false, bl: -99, dead: "", won: false, dyn: {}, h: PH, dive: false, ev: null };
  }
  function clone(s) { const c = Object.assign({}, s); c.dyn = Object.assign({}, s.dyn); return c; }

  function solid(g, s) {
    if (!g.kind) return true;
    if (g.kind === "F") { const t = s.dyn[g.id]; return t === undefined || s.tick - t < FADE; }
    if (g.kind === "X") return !s.dyn[g.id];
    return s.par === (g.kind === "1" ? 0 : 1);
  }
  function hitC(o, r, x, y0, y1) {
    const nx = Math.max(x - HW, Math.min(o.cx, x + HW)), ny = Math.max(y0, Math.min(o.cy, y1));
    const dx = nx - o.cx, dy = ny - o.cy;
    return dx * dx + dy * dy < r * r;
  }
  function ceilAbove(L, s, x, bk) {
    const ob = L.ob[bk] || EMPTY;
    for (const o of ob) if (o.c === 1 && o.flip === s.flip && x + HW + 0.1 > o.x0 && x - HW - 0.1 < o.x1 && s.y + PH > o.y0) return true;
    return false;
  }

  function step(L, s, J, S, m) {
    if (s.dead || s.won) return;
    m = m || 0;
    const m0 = m;
    const xp = s.tick * DX; s.tick++;
    const x = s.tick * DX, bk = Math.floor(x / 4), ev = s.ev;
    let grav = G0, th = null, zen = null;
    const zs = L.zb[bk] || EMPTY;
    for (const z of zs) {
      /* leaving a zone alive is getting through it (an event only: Infinite Shadow scores it) */
      if (x < z.x0 || x >= z.x1) { if (ev && xp < z.x1 && x >= z.x1) ev.push("exit" + z.k); continue; }
      if (z.k === "D") grav = GD; else if (z.k === "A") { grav = GA; m = m0 * 0.5; } else if (z.k === "T") th = z; else zen = z;
    }
    if (!!zen !== s.flip) {
      const z = zen || s.zz;
      s.y = 2 * z.base + CH - s.y - s.h; s.vy = -s.vy; s.flip = !!zen; s.zz = zen;
      s.gr = false; s.coy = 0; s.sl = false; s.h = PH; s.hang = -1; s.gl = 0;
      if (ev) ev.push("flip");
    }
    if (J && !s.jp) s.buf = BUF; else if (s.buf > 0) s.buf--;
    s.jp = !!J;
    if (!S) s.dl = false;
    if (!s.gr && s.coy > 0) s.coy--;
    if (s.hang >= 0) {
      const r = L.rails[s.hang];
      if (!J || x > r.x1) { s.hang = -1; s.vy = 0; s.buf = 0; s.h = PH; s.y = r.y - 1.75; }
      else { s.vy = 0; s.h = S ? 0.9 : 1.75; s.y = r.y - s.h; }
    }
    const inTh = !!th && s.hang < 0;
    if (s.hang < 0 && !inTh) {
      if ((s.gr || s.coy > 0) && (s.buf > 0 || J)) {
        s.vy = grav.v; s.gr = false; s.coy = 0; s.buf = 0; s.sl = false; s.h = PH; s.par ^= 1; s.ch = 0;
        if (ev) ev.push("jump");
      } else if (s.buf > 0 && s.air > 0 && !s.gr) {
        s.vy = grav.v; s.air = 0; s.buf = 0; s.par ^= 1; s.gl = 0;
        if (ev) ev.push("air");
      }
    }
    s.dive = false;
    if (s.gr) {
      if (S) { if (!s.sl) { s.sl = true; s.slT = SMIN; if (ev) ev.push("slide"); } }
      else if (s.sl && s.slT <= 0 && !ceilAbove(L, s, x, bk)) s.sl = false;
      if (s.slT > 0) s.slT--;
      s.h = s.sl ? SH : PH;
      /* coil */
      let onCoil = false;
      const cs = L.cb[bk] || EMPTY;
      for (const c of cs) if (xp >= c.x0 && xp < c.x1 && c.flip === s.flip) onCoil = true;
      if (s.sl && S && onCoil) s.ch += DT;
      else if (s.ch > 0) {
        if (s.ch > 0.15) {
          s.vy = 10 + 5 * Math.min(1, s.ch); s.gr = false; s.sl = false; s.h = PH; s.dl = true; s.coy = 0;
          if (ev) ev.push("coil");
        }
        s.ch = 0;
      }
    } else {
      s.ch = 0;
      if (S && !s.dl && !inTh && s.gl <= 0 && s.hang < 0) s.dive = true;
    }
    /* vertical motion */
    const py = s.y, wasGr = s.gr;
    if (s.hang >= 0) { /* fixed to the rail */ }
    else if (inTh) {
      if (!(s.gr && S)) {
        const tv = S ? -7 : 5, d = tv - s.vy, a = 40 * DT;
        s.vy += d > a ? a : d < -a ? -a : d;
        s.gr = false; s.sl = false; s.h = PH; s.y += s.vy * DT;
        const cap = th.base + 4.4;
        if (s.y > cap) { s.y = cap; if (s.vy > 0) s.vy = 0; }
      }
    } else if (s.gl > 0) { s.gl -= DT; s.vy = 0; if (S && !s.dl) s.gl = 0; }
    else if (!s.gr) {
      s.vy -= grav.g * (s.dive ? 3 : 1) * DT;
      if (s.vy < -42) s.vy = -42;
      s.y += s.vy * DT;
    }
    /* terrain */
    if (s.hang < 0) {
      const segs = L.sb[bk] || EMPTY;
      let sup = null;
      for (const g of segs) {
        if (g.flip !== s.flip || !solid(g, s)) continue;
        const half = (g.x1 - g.x0) / 2, mm = Math.min(m, Math.max(0, half - 0.5));
        if (x < g.x0 - HW + mm || x > g.x1 + 0.2 - mm) continue;
        if (s.y > g.top + 1e-6) continue;
        if (wasGr) { if (g.top - s.y <= 0.35 + 1e-6 && (!sup || g.top > sup.top)) sup = g; }
        else if (s.vy <= 0 && (py >= g.top - 1e-6 || s.y >= g.top - 0.35) && (!sup || g.top > sup.top)) sup = g;
      }
      if (sup && sup.kind === "X" && !wasGr && s.dive) {
        s.dyn[sup.id] = 1; s.vy *= 0.6; sup = null;
        if (ev) ev.push("break");
      }
      if (sup) {
        if (!wasGr && ev) ev.push(s.vy < -13 ? "land2" : "land");
        s.y = sup.top; s.vy = 0; s.gr = true; s.air = 0; s.gl = 0;
        if (!wasGr) { s.h = PH; s.sl = false; }
        if (sup.kind === "F" && s.dyn[sup.id] === undefined) { s.dyn[sup.id] = s.tick; if (ev) ev.push("fade"); }
        else if (!wasGr && ev && (sup.kind === "1" || sup.kind === "2")) ev.push("flick");
      } else if (wasGr && !(inTh && !S)) { s.gr = false; s.coy = COY; s.sl = false; s.h = PH; }
      else if (wasGr) s.gr = false;
      for (const g of segs) {
        if (g.flip !== s.flip || g === sup || !solid(g, s)) continue;
        if (x + HW <= g.x0 - m || x - HW >= g.x1) continue;
        if (x > g.x1 + 0.2 - Math.min(m, Math.max(0, (g.x1 - g.x0) / 2 - 0.5))) continue;
        if (s.y < g.top - 0.35 && s.y + s.h > g.bot + 0.05) {
          if (s.vy > 0 && py + s.h <= g.bot + 0.3) { s.y = g.bot - s.h - 0.02; s.vy = 0; }
          else { s.dead = "wall"; break; }
        }
      }
      if (s.y < (s.flip ? s.zz.base : L.minY) - 9) s.dead = "fall";
    }
    /* objects */
    const y0 = s.y, y1 = s.y + s.h, obs = L.ob[bk] || EMPTY;
    for (let i = 0; i < obs.length && !s.dead; i++) {
      const o = obs[i];
      if (o.flip !== s.flip) continue;
      switch (o.k) {
        case "L": {
          /* a moving obstacle is the same deadly box, shifted by a pure function of the tick */
          const ox = o.mv === 2 ? (o.tm - s.tick) * o.vx : 0, oy = o.mv === 1 ? crushY(s.tick) : 0;
          if (x + HW > o.x0 + ox - m && x - HW < o.x1 + ox + m && y1 > o.y0 + oy && y0 < o.y1 + oy) s.dead = o.v;
          break;
        }
        case "bl":
          if (x + HW > o.x0 && x - HW < o.x1 && y1 > o.y0 && y0 < o.y1 && s.tick - s.bl > 16) {
            s.vy = 15; s.gr = false; s.sl = false; s.h = PH; s.dl = true; s.bl = s.tick; s.gl = 0; s.coy = 0; s.hang = -1;
            if (ev) ev.push("bounce");
          }
          break;
        case "ha":
          if (!s.dyn[o.id] && hitC(o, o.r - m * 0.4, x, y0, y1)) { s.dyn[o.id] = 1; s.air = 1; if (ev) ev.push("halo"); }
          break;
        case "ke":
          if (!s.dyn[o.id] && hitC(o, o.r - m * 0.4, x, y0, y1)) { s.dyn[o.id] = 1; if (ev) ev.push("key"); }
          break;
        case "ga":
          if (!s.dyn[o.key]) { if (x + HW > o.x0 - m && x - HW < o.x1 + m) s.dead = "gate"; }
          else if (!s.dyn[o.id] && x > o.x0 - 3) { s.dyn[o.id] = 1; if (ev) ev.push("gate"); }
          break;
        case "ri":
          if (!s.dyn[o.id] && hitC(o, o.r - m * 0.4, x, y0, y1)) {
            s.dyn[o.id] = 1; s.y = o.ey; s.vy = 0; s.gr = false; s.sl = false; s.h = PH; s.gl = 0; s.coy = 0;
            if (ev) ev.push("rift");
          }
          break;
        case "co":
          if (!s.dyn[o.id] && !s.gr && hitC(o, o.r - m * 0.4, x, y0, y1)) { s.dyn[o.id] = 1; s.gl = 1; s.vy = 0; if (ev) ev.push("comet"); }
          break;
        case "ey":
          if (s.dyn[o.id] === undefined && x >= o.x) { s.dyn[o.id] = s.y - o.b >= 1.0 ? 2 : 1; if (ev) ev.push("eye"); }
          break;
        case "em": {
          const band = s.dyn[o.eye] || 1, lo = band === 1 ? o.b : o.b + 1.9, hi = band === 1 ? o.b + 1.1 : o.b + 9;
          if (x + HW > o.x0 - m * 0.5 && x - HW < o.x1 + m * 0.5 && y1 > lo && y0 < hi) s.dead = "beam";
          else if (ev && xp - HW < o.x1 && x - HW >= o.x1) ev.push("dodge");
          break;
        }
      }
    }
    /* rails */
    if (s.hang < 0 && J && !s.gr && !s.dead) {
      const rs = L.rb[bk] || EMPTY;
      for (const r of rs) {
        if (r.flip !== s.flip || x < r.x0 || x > r.x1 - 0.2) continue;
        if (s.y >= r.y - 2.25 && s.y <= r.y - 1.05) {
          s.hang = r.i; s.h = 1.75; s.y = r.y - 1.75; s.vy = 0; s.gl = 0; s.dive = false;
          if (ev) ev.push("grab");
          break;
        }
      }
    }
    if (s.dead) { if (ev) ev.push("die"); }
    else if (x >= L.endX) s.won = true;
  }

  function hash(L, s) {
    const x = s.tick * DX;
    let d = "";
    for (const k in s.dyn) {
      if (L.ox[k] < x - 44) continue;
      const v = s.dyn[k];
      d += k + ":" + (v > 2 ? Math.min(FADE, s.tick - v) : v) + ",";
    }
    return s.tick + "|" + Math.round(s.y * 10) + "|" + Math.round(s.vy * 2) + "|" + (s.gr ? 1 : 0) + (s.sl ? 1 : 0) + (s.jp ? 1 : 0) +
      (s.flip ? 1 : 0) + (s.dl ? 1 : 0) + s.par + s.air + "|" + s.hang + "|" + Math.ceil(s.gl * 8) + "|" + Math.ceil(s.ch * 8) + "|" +
      (s.coy > 0 ? 1 : 0) + (s.buf > 0 && s.air > 0 ? 1 : 0) + (s.slT > 0 ? 1 : 0) + "|" + d;
  }

  /* Depth-first search over inputs, changed at most every DEC ticks, with a
     visited set. `m` widens every lethal shape and narrows every ledge, so a
     solution found at margin m leaves that much room for human timing.
     Inputs that cannot matter in the current state are not branched on. */
  function options(L, s, last, di) {
    if (s.hang >= 0) return [1, 3, 0];
    const x = s.tick * DX, bk = Math.floor(x / 4), zs = L.zb[bk] || EMPTY;
    for (const z of zs) if (z.k === "T" && x >= z.x0 - 0.5 && x < z.x1) return last & 2 ? [2, 0] : [0, 2];
    if (s.gr) return last & 2 ? [0, 2, 1] : [0, 1, 2];
    const o = [0];
    if (s.air > 0 || (L.rb[bk] && L.rb[bk].length)) o.push(1);
    if (last & 2) o.unshift(2); else if (di % 2 === 0 && !s.dl) o.push(2);
    return o;
  }
  /* The search, resumable: search(L, m, DEC, from, goal) returns { run(n) }, and run(n) searches on for about n more
     ticks of simulation, returning the result once there is one and null while it is still going (Infinite Shadow
     validates its chunks a few milliseconds a frame). from: a state to start from (its clone, without events), or
     none for a new run; goal(s), checked after every decision: true ends the search there, false drops that branch,
     undefined goes on (default: s.won). solve() is a search run to its budget in one go. */
  function search(L, m, DEC, from, goal) {
    DEC = DEC || 6;
    const seen = new Set(), path = [], s0 = from ? clone(from) : newState();
    s0.ev = null;
    const stack = [{ s: s0, o: from ? options(L, s0, 0, 0) : [0, 1, 2], i: 0 }];
    let steps = 0, best = 0, cause = "", out = null;
    function run(n) {
      if (out) return out;
      const lim = steps + n;
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.i >= top.o.length) { stack.pop(); continue; }
        const inp = top.o[top.i++], s2 = clone(top.s);
        for (let k = 0; k < DEC && !s2.dead && !s2.won; k++) step(L, s2, inp & 1, inp & 2, m);
        steps += DEC;
        if (s2.dead) { const xx = s2.tick * DX; if (xx > best) { best = xx; cause = s2.dead; } continue; }
        path[stack.length - 1] = inp;
        const g = goal ? goal(s2) : s2.won || undefined;
        if (g === true) return (out = goal ? { ok: true, path: path.slice(0, stack.length), steps: steps, DEC: DEC, s: s2 } : { ok: true, path: path.slice(0, stack.length), steps: steps, DEC: DEC });
        if (g === false) continue;
        const key = hash(L, s2);
        if (seen.has(key)) continue;
        seen.add(key);
        stack.push({ s: s2, o: options(L, s2, inp, stack.length), i: 0 });
        if (steps > lim) return null;
      }
      return (out = fail());
    }
    /* where it got to (for a search stopped at its budget) */
    function fail() { return { ok: false, best: best, cause: cause, steps: steps }; }
    return { run: run, fail: fail, get steps() { return steps; } };
  }
  function solve(L, m, budget, DEC) {
    const S = search(L, m, DEC || 6);
    return S.run(budget || 6e6) || S.fail();
  }
  function replay(L, path, DEC, m) {
    const s = newState();
    for (let i = 0; i < path.length && !s.dead && !s.won; i++)
      for (let k = 0; k < DEC && !s.dead && !s.won; k++) step(L, s, path[i] & 1, path[i] & 2, m || 0);
    return s;
  }

  return { TPB: TPB, DT: DT, UPB: UPB, DX: DX, PH: PH, SH: SH, HW: HW, CH: CH, FADE: FADE, compile: compile, expand: expand,
    newState: newState, clone: clone, step: step, solve: solve, search: search, replay: replay, solid: solid, crushY: crushY,
    stream: stream, append: append, trim: trim };
})();

