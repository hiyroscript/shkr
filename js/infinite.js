/* ---- infinite.js ---- */
/* ============================================================================
   INF — Infinite Shadow: an endless run through The Convergence, generated
   while you run. No DOM, no audio: Node tools load it in a vm context after
   sim.js and levels.js, exactly as the game does.

   The generator writes chart phrases in the language of js/levels.js
   (terrain/overlay, 8 cells a bar), so every rule of every hazard stays in
   one place, js/sim.js. A run is a stream of chunks of 2 to 4 bars (a
   breather is 1), each one ". content .." so it starts and ends on a neutral
   seam: solid flat ground, no zone, rail or glide open. A chunk is compiled
   on its own at its place in the stream (SIM.stream), solved from the exact
   state the run reaches its seam in (margin 0.08, DEC 12), replayed at
   margin 0, and checked against the view rule, the density band and its
   place in the difficulty wave. Only then is it appended to the run. A chunk
   that fails is thrown away: new knobs, then a new template, then the plain
   safe generator. Everything comes from one 32-bit seed: the same seed is
   the same world.

   Sections: tables → rules (shared with tools/) → plan (waves, biomes) →
   pieces (atoms, fillers, set pieces, combos) → validation and the job loop.
   ========================================================================== */
const INF = (function () {
  "use strict";
  /* gameplay, like a level's mu[0]: every run is at this tempo from the first bar to the last, and the music never
     speeds up. 144 sits mid-campaign (112 to 200), around levels 9 and 10: brisk, and still easy to read */
  const BPM = 144;
  const TPB = SIM.TPB, DX = SIM.DX, DEC = 12, MARGIN = 0.08, EASY = 0.2, BAR = 16, TBAR = TPB * 4;
  /* the ground's height band (units around 0) and the stream's fall floor */
  const BAND = [-6, 10], MINY = -6;
  /* solver budget per attempt (ticks) and the attempt ladder: knobs, then templates, then the safe generator */
  const BUDGET = 90000, KNOB_TRIES = 4, TPL_TRIES = 8, SAFE_TRIES = 3;
  const VIEW = 10.8;   /* the narrowest view render.js allows, in units (tools/check-levels.js) */

  function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function mix(a, b, c) { let h = Math.imul((a >>> 0) ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul((b | 0) + 0x632BE5AB, 0xC2B2AE35) ^ Math.imul((c | 0) + 0x27D4EB2F, 0x165667B1); h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; return h >>> 0; }
  const ri = function (R, a, b) { return a + Math.floor(R() * (b - a + 1)); };
  const pick = function (R, a) { return a[Math.floor(R() * a.length)]; };
  function wpick(R, items, wf) {
    let sum = 0; const w = items.map(function (it) { const v = Math.max(0, wf(it)); sum += v; return v; });
    if (sum <= 0) return null;
    let r = R() * sum; for (let i = 0; i < items.length; i++) { r -= w[i]; if (r < 0) return items[i]; }
    return items[items.length - 1];
  }

  /* ---------------- tables ---------------- */
  /* hazard keys (HAZ[].k) in order; the overlay / zone character each one is written with */
  const HK = HAZ.map(function (h) { return h.k; });
  /* how hard a hazard is to read the first time: tier 1 from the warm-up, 2 on the ramp, 3 once cruising */
  const TIER = { bl: 1, ha: 1, F: 1, co: 1, ke: 1, D: 1, A: 2, L: 2, ri: 2, T: 2, S: 2, X: 2, ey: 3, "1": 3, Z: 3 };
  /* the worlds of The Convergence: each level's th tuple, in families, so back-to-back worlds contrast (forest into
     foundry, harbour into citadel) */
  const FAM = { 1: "wood", 8: "wood", 16: "wood", 5: "plain", 17: "plain", 6: "sand", 27: "sand", 7: "ice", 13: "ice", 3: "sea", 11: "sea", 12: "sea", 18: "sea",
    2: "city", 14: "city", 4: "iron", 10: "iron", 24: "iron", 25: "iron", 26: "iron", 9: "cave", 19: "fire", 20: "fire", 21: "hall", 22: "hall", 23: "hall", 29: "hall",
    15: "sky", 28: "sky", 30: "sky" };
  /* collision motifs: a third world bleeding into the sky (render.js draws them in fog grey, far away) */
  const MOTIF = [["ringsun", 30], ["zeppelins", 28], ["castles", 29], ["meteors", 17], ["kites", 5], ["lighthouse", 12], ["domes", 15], ["ferris", 14]];

  /* ---------------- rules (shared with tools/density.js, tools/difficulty.js, tools/check-levels.js) ---------------- */
  /* README › Density: obstacle characters are the terrain row's non-"." cells; a cell is busy when its terrain is not
     "." or its overlay holds a hazard object (zone edges do not count) */
  const HAZ_OVERLAY = "BOKGRCEenmxXS12F", TERRAIN = "_uU~+%#HvVY", TILES = "F12X", EDGES = "DdAaTtZz", OVER = "-'*=|&";
  function busy(T, H, i) { return T[i] !== "." || HAZ_OVERLAY.indexOf(H[i]) >= 0; }
  /* the density measures of a chart from cell `from` (density.js: after the 2-bar intro) */
  function chartStats(T, H, from) {
    const n = T.length;
    let obst = 0;
    for (let i = 0; i < n; i++) if (T[i] !== ".") obst++;
    const busyAt = [];
    for (let i = from; i < n; i++) if (busy(T, H, i)) busyAt.push(i);
    const gaps = [], at = [];
    for (let i = 1; i < busyAt.length; i++) { gaps.push((busyAt[i] - busyAt[i - 1]) / 2); at.push(busyAt[i - 1]); }
    let flat = 0, run = 0;
    for (let i = from; i < n; i++) {
      if (TERRAIN.indexOf(T[i]) >= 0 || TILES.indexOf(H[i]) >= 0 || EDGES.indexOf(H[i]) >= 0) run = 0; else run++;
      flat = Math.max(flat, run);
    }
    let rail = false, over = 0;
    const under = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (H[i] === "L") rail = true;
      if (rail || OVER.indexOf(T[i]) >= 0 || H[i] === "n") under[i] = 1;
      if (T[i] === "&" && i + 2 < n) under[i + 2] = 1;
      if (H[i] === "l") rail = false;
    }
    busyAt.forEach(function (i) { if (under[i]) over++; });
    return { obst: obst, busy: busyAt, gaps: gaps, at: at, flat: flat, over: busyAt.length ? over / busyAt.length : 0 };
  }
  /* README › Density bands */
  function band(n) {
    return n <= 9 ? { lo: 2.5, hi: 3.5, gap: 3, breather: 0 } : n <= 20 ? { lo: 3.5, hi: 5.0, gap: 2, breather: 0 } : { lo: 5.0, hi: 7.0, gap: 1.5, breather: 4 };
  }
  /* hazard kind of every compiled thing that belongs to a hazard (difficulty.js: mech and combos) */
  const KIND = { bl: "bl", ha: "ha", ke: "ke", ga: "ke", ri: "ri", co: "co", ey: "ey", em: "ey", F: "F", X: "X", "1": "1", "2": "1" };
  function hazards(L) {
    const out = [], byId = {};
    L.objs.forEach(function (o) { byId[o.id] = o; });
    L.objs.forEach(function (o) {
      const k = KIND[o.k]; if (!k) return;
      if (o.k === "ga") { const key = byId[o.key]; out.push({ k: k, x0: key ? key.cx : o.x0, x1: o.x1 }); }
      else if (o.k === "em") { const eye = byId[o.eye]; out.push({ k: k, x0: eye ? eye.x : o.x0, x1: o.x1 }); }
      else if (o.k !== "ke" && o.k !== "ey") out.push({ k: k, x0: o.x0, x1: o.x1 });
    });
    L.segs.forEach(function (s) { if (s.kind && KIND[s.kind]) out.push({ k: KIND[s.kind], x0: s.x0, x1: s.x1 }); });
    L.coils.forEach(function (c) { out.push({ k: "S", x0: c.x0, x1: c.x1 }); });
    L.rails.forEach(function (r) { if (r) out.push({ k: "L", x0: r.x0, x1: r.x1, zone: true }); });
    L.zones.forEach(function (z) { out.push({ k: z.k, x0: z.x0, x1: z.x1, zone: true }); });
    return out.sort(function (a, b) { return a.x0 - b.x0; });
  }
  /* mean number of distinct hazards in each 2-bar window of bars [b0, b1) */
  function mech(hz, b0, b1) {
    if (b1 - b0 < 2) return 0;
    let sum = 0;
    for (let b = b0; b + 2 <= b1; b++) {
      const w0 = b * 16, w1 = w0 + 32, set = {};
      for (const h of hz) if (h.x1 > w0 && h.x0 < w1) set[h.k] = 1;
      sum += Object.keys(set).length;
    }
    return sum / (b1 - b0 - 1);
  }
  /* combo places: pairs of different hazards within 2 beats (8 units), grouped into 2-beat places */
  function combos(hz) {
    const locs = [];
    for (let i = 0; i < hz.length; i++) for (let j = i + 1; j < hz.length; j++) {
      const a = hz[i], b = hz[j];
      if (b.x0 > a.x1 + 8 && !a.zone) break;
      if (a.k === b.k) continue;
      const gap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
      if (gap > 8) continue;
      locs.push(gap <= 0 ? Math.max(a.x0, b.x0) : (Math.min(a.x1, b.x1) + Math.max(a.x0, b.x0)) / 2);
    }
    locs.sort(function (a, b) { return a - b; });
    const places = [];
    for (const x of locs) if (!places.length || x - places[places.length - 1] > 8) places.push(x);
    return places;
  }
  /* README › Difficulty: D and its fixed weights */
  const W = { a: 0.2, b: 0.15, c: 0.3, d: 0.5, e: 0.1 }, SLACK_MAX = 0.3;
  /* the cruise band: D of levels 10 and 14 on the 1.10-per-level curve from level 1's 0.403 */
  const D_LO = 0.403 * Math.pow(1.1, 9), D_HI = 0.403 * Math.pow(1.1, 13);
  function scoreD(t) {
    return t.aps * (1 + W.a * t.mech) * (1 + W.b * t.combo / 10) * (1 + W.c * (SLACK_MAX - t.slack) / SLACK_MAX) *
      (1 - W.d * t.rest) * Math.pow(0.25 / Math.max(t.gap10, 0.12), W.e);
  }
  /* the view rule (check-levels.js): an input may only be for something on screen a beat ahead. things: every object,
     segment edge, zone, rail and coil as [x0, x1] (a rolling blade where it meets the runner); returns the worst distance
     from an input to the nearest thing it could be for, and the rolling blades seen less than a beat before their input */
  function things(L, merge) {
    const out = [];
    L.objs.forEach(function (o) { out.push([o.x0, o.x1]); });
    /* in a stream, two touching ground segments of one height are one floor: a chunk seam is not a thing */
    let last = null;
    L.segs.forEach(function (s) {
      if (merge && !s.kind && last && last.x1 === s.x0 && last.top === s.top && last.flip === s.flip) { out[out.length - 1] = [s.x1, s.x1]; last = s; return; }
      out.push([s.x0, s.x0], [s.x1, s.x1]); if (!s.kind) last = s;
    });
    L.zones.forEach(function (z) { out.push([z.x0, z.x1]); });
    L.rails.forEach(function (r) { if (r) out.push([r.x0, r.x1]); });
    L.coils.forEach(function (c) { out.push([c.x0, c.x1]); });
    return out;
  }
  function view(L, acts, merge) {
    const th = things(L, merge), late = [];
    let worst = 0, at = 0;
    acts.forEach(function (a) {
      const xa = a.t * DX; let nx = Infinity;
      for (const t of th) if (t[1] >= xa - 0.5) nx = Math.min(nx, Math.max(0, t[0] - xa));
      if (nx !== Infinity && nx > worst) { worst = nx; at = xa; }
    });
    L.objs.forEach(function (o) {
      if (o.v !== "rb") return;
      const k = o.vx / DX, cx = o.x, seenAt = (cx * (1 + k) - VIEW) / (1 + k);
      const before = acts.filter(function (a) { return a.t * DX < cx; }).pop();
      if (before && before.t * DX - seenAt < 4) late.push({ x: cx, beats: (before.t * DX - seenAt) / 4 });
    });
    return { worst: worst, at: at, late: late, max: VIEW - 4 };
  }
  /* presses on a path (t in ticks from tick t0), and releases that end a hold of half a beat or more off a Rail, a
     charging Coil or in a Thermal (the releases tools/difficulty.js finds by replay, read here from the replayed states) */
  function pressList(path, t0, st) {
    const out = []; let prev = 0, tj = 0, ts = 0;
    for (let i = 0; i <= path.length; i++) {
      const v = i < path.length ? path[i] : 0, t = t0 + i * DEC;
      if ((v & 1) && !(prev & 1)) { out.push({ t: t, k: "jump" }); tj = t; }
      else if (!(v & 1) && (prev & 1) && t - tj >= TPB / 2 && st && st[i] && st[i].hang >= 0) out.push({ t: t, k: "drop" });
      if ((v & 2) && !(prev & 2)) { out.push({ t: t, k: "slide" }); ts = t; }
      else if (!(v & 2) && (prev & 2) && t - ts >= TPB / 2 && st && st[i] && (st[i].ch > 0.15 || st[i].th)) out.push({ t: t, k: "release" });
      prev = v;
    }
    return out;
  }
  const rules = { busy: busy, chartStats: chartStats, band: band, hazards: hazards, mech: mech, combos: combos, scoreD: scoreD, W: W, SLACK_MAX: SLACK_MAX,
    things: things, view: view, VIEW: VIEW, HAZ_OVERLAY: HAZ_OVERLAY, TERRAIN: TERRAIN, TILES: TILES, EDGES: EDGES, OVER: OVER, presses: pressList };

  /* ---------------- plan: the difficulty wave ----------------
     Warm-up (8 bars, about level 3; the first 2 bars hold no hazard), a ramp to about 90 s (bar 54), then cruise for
     ever, with D inside the band of levels 10-14 and never past about level 16 (README › Infinite Shadow). Inside it,
     difficulty breathes like a level's sections: build, peak (combos allowed), a 1-bar breather with no input, a second
     peak and a cool-down, in cycles of 12, 16 or 20 bars whose order varies a little. lv is the level whose D the bars
     aim at; the generator turns it into required actions per bar. */
  const WARM = 8, RAMP = 54;
  const CYCLES = [
    [["build", 3], ["peak", 3], ["rest", 1], ["peak2", 3], ["cool", 2]],
    [["build", 4], ["peak", 4], ["rest", 1], ["peak2", 5], ["cool", 2]],
    [["build", 5], ["peak", 5], ["rest", 1], ["peak2", 6], ["cool", 3]],
    [["build", 4], ["peak2", 4], ["rest", 1], ["peak", 5], ["cool", 2]],
    [["cool", 2], ["build", 4], ["peak", 4], ["rest", 1], ["peak2", 5]],
    [["build", 3], ["peak", 5], ["rest", 1], ["peak2", 4], ["cool", 3]]
  ];
  /* energy digit (the music's sections) and level offset of each phase */
  const PHASE = { intro: [0, 0], warm: [1, 0], build: [2, -0.5], peak: [3, 1.5], rest: [1, 0], peak2: [4, 2.5], cool: [2, -1.5] };
  function baseLv(bar) { return bar < WARM ? 3 : bar < RAMP ? 3 + 8 * (bar - WARM) / (RAMP - WARM) : 11; }
  /* actions per bar that land a window at level lv (calibrated with tools/infinite-check.js against D) */
  function actsFor(lv) { return Math.max(0.7, 0.5 + 0.1 * lv); }

  /* ---------------- pieces ----------------
     A piece is a template instance: its terrain and overlay strings and the knob values it was rolled with. Fillers
     (connective terrain) pad a chunk around its piece from the motif table; they climb and drop in stairs, towers and
     pits, and put bars, walls, blocks, tunnels and crushers overhead. */
  /* motif: [terrain, presses, height change, class, from tier]: g ground jump, p pit, u step up, d step down,
     o overhead (roll or stay down), n no input, m moving. Dense on purpose: the levels reach 3.5-5 obstacle characters a
     bar with steps down, hanging walls, pits and tunnels, most of which need one press or none */
  const MOT = [
    ["^.", 1, 0, "g", 0], ["M.", 1, 0, "g", 0], ["I.", 1, 0, "g", 1], ["^v", 1, -1, "g", 0], ["Mv", 1, -1, "g", 0],
    ["_.", 1, 0, "p", 0], ["_v", 1, -1, "p", 0], ["u.", 1, 0, "p", 1], ["~~.", 1, 0, "p", 1],
    ["+.", 1, 1, "u", 0], ["+.'", 1, 1, "u", 0], ["#.", 1, 2, "u", 0], ["#.'", 1, 2, "u", 0], ["%.", 1, 1, "u", 1], ["+v", 1, 0, "u", 0],
    ["v", 0, -1, "d", 0], ["vv", 0, -2, "d", 0], ["V", 0, -2, "d", 0], ["v.", 0, -1, "d", 0],
    ["-.", 1, 0, "o", 0], ["-v", 1, -1, "o", 0], ["-'", 1, 0, "o", 0], ["-.'", 1, 0, "o", 0], ["'", 0, 0, "n", 0], ["'.", 0, 0, "n", 0], ["'.'", 0, 0, "n", 0], ["'v", 0, -1, "n", 0],
    ["*.", 1, 0, "o", 0], ["*v", 1, -1, "o", 0], ["===.", 1, 0, "o", 1], ["====.", 1, 0, "o", 1], ["&...", 2, 0, "o", 2],
    ["|.", 1, 0, "m", 2], ["|v", 1, -1, "m", 2], ["@.", 1, 0, "m", 2], ["@v", 1, -1, "m", 2]
  ];
  /* what may come right after what, measured: every pair of motifs solved from a calm seam (margin 0.08, DEC 12).
     Only two kinds of neighbour fail: a ground-jump obstacle right after a hanging wall (the take-off is under the
     wall), and a roll right after an obstacle that ends on a step down (you are still falling). A dot between fixes
     both. Applied at every join: motif to motif, filler to piece and piece to filler. */
  function okAfter(prev, next, nextH) {
    if (!prev || !next) return true;
    const a = prev[prev.length - 1], b = prev[prev.length - 2], n = next[0];
    if (a === "'" && "^MIu~#%&|@".indexOf(n) >= 0) return false;
    if (a === "v" && b && "^M+-'*|@".indexOf(b) >= 0 && "-=".indexOf(n) >= 0) return false;
    /* a Bloom, Rift, Coil or air hazard just after a hanging wall throws you up into it (measured the same way) */
    if (nextH && (a === "'" || b === "'") && /[BRSOCKE]/.test(nextH.slice(0, 3))) return false;
    return true;
  }
  MOT.forEach(function (m) { let k = 0; for (const ch of m[0]) if (ch !== ".") k++; m.push(k); });   /* m[5]: obstacle characters */
  function dh(t) { let d = 0; for (const c of t) d += c === "+" || c === "%" ? 1 : c === "#" ? 2 : c === "H" ? 4 : c === "v" ? -1 : c === "V" ? -2 : c === "Y" ? -4 : 0; return d; }
  function presses(t) { let p = 0; for (let i = 0; i < t.length; i++) { const c = t[i]; if ("^MI_u+#%-*&|@~".indexOf(c) >= 0 && !(c === "~" && t[i - 1] === "~")) p++; if (c === "=" && t[i - 1] !== "=") p++; } return p; }
  function chars(t) { let k = 0; for (const c of t) if (c !== ".") k++; return k; }
  /* n cells of connective terrain from height `base`: about `dens` obstacle characters and `want` presses. It keeps
     inside the band and steers back to its middle, leans the way c.lean asks (by class), changes the ground's height
     before it has been flat for c.flat + 12 cells, and never leaves more than three empty cells between busy ones:
     c.lead empty cells come right before it, and with c.end its last cell is busy (the seam adds three) */
  const CHANGE = "_uU~+%#HvVY";
  function filler(R, n, c) {
    let t = "", y = c.base, p = 0, k = 0, dots = c.lead === undefined ? 1 : c.lead, flat = c.flat || 0;
    const tier = c.tier || 0, want = c.want === undefined ? n / 4 : c.want, dens = c.dens === undefined ? n * 0.55 : c.dens, lean = c.lean || {};
    while (t.length < n) {
      const room = n - t.length, pace = (dens - k) / room, last = c.end && room <= 2;
      if (dots < 3 && !(last && room === 1) && (pace < 0.35 || room === 1 && pace < 0.6) && R() < 0.7 && !(c.end && room <= 1)) { t += "."; dots++; flat++; continue; }
      const m = wpick(R, MOT, function (m) {
        if (m[0].length > room || m[4] > tier) return 0;
        if (c.quiet && m[1] > 0 && !(c.quiet === 2 && m[2] > 0 && y < 0 && p < 1)) return 0;
        if (!okAfter(dots ? "." : t ? t : c.prev, m[0]) || m[0].length === room && !okAfter(m[0], c.next)) return 0;
        if (last && m[0][m[0].length - 1] === "." && m[0].length === room) return 0;
        const ny = y + m[2];
        if (ny < BAND[0] + 1 || ny > BAND[1] - 1) return 0;
        let ch = false; for (const q of m[0]) if (CHANGE.indexOf(q) >= 0) ch = true;
        if (flat >= 12 && !ch) return 0;
        let w = 1;
        const md = m[5] / m[0].length;
        w *= pace > 0.65 ? (md >= 0.99 ? 3 : md > 0.6 ? 1.5 : 0.4) : pace < 0.4 ? (md >= 0.99 ? 0.3 : 1) : 1;
        /* presses are the budget: past it only a motif that buys height cheaply (a step of 2) gets through */
        if (flat >= 12) { /* the height must change now, presses or not */ }
        else if (m[1] > 0 && p + m[1] > want + 0.35) w *= m[2] >= 2 && y < 0 ? 0.4 : 0.02; else if (m[1] === 0 && p < want - 0.6) w *= 0.5;
        if (m[1] > 0 && m[2] === 1) w *= 0.5;
        if (m[2] > 0) w *= y > 4 ? 0.15 : y < -1 ? 4 : y < 1 ? 1.6 : 1;
        if (m[2] < 0) w *= y < -1 ? 0.1 : y < 1 ? 0.6 : y > 4 ? 3 : 1;
        /* the next block needs to start inside [goal[0], goal[1]] to stay in the band */
        if (c.goal && ny > c.goal[1]) w *= m[2] < 0 ? 6 : m[2] > 0 ? 0.02 : 0.5;
        if (c.goal && ny < c.goal[0]) w *= m[2] > 0 ? 6 : m[2] < 0 ? 0.02 : 0.5;
        if (lean[m[3]]) w *= lean[m[3]];
        if (m[3] === "o" || m[3] === "m") w *= c.over || 1;
        return w;
      });
      if (!m) { t += c.end && room === 1 ? "'" : "."; dots = c.end && room === 1 ? 0 : dots + 1; flat++; continue; }
      t += m[0]; y += m[2]; p += m[1]; k += m[5];
      let i = m[0].length - 1; dots = 0; while (i >= 0 && m[0][i] === ".") { dots++; i--; }
      for (let q = 0; q < m[0].length; q++) { if (CHANGE.indexOf(m[0][q]) >= 0) flat = 0; else flat++; }
    }
    return { t: t, h: ".".repeat(t.length), y: y, p: p, k: k, flat: flat, dots: dots };
  }
  /* the lowest and highest a piece's ground goes, relative to where it starts */
  function excursion(t) { let y = 0, lo = 0, hi = 0; for (const c of t) { y += dh(c); lo = Math.min(lo, y); hi = Math.max(hi, y); } return [lo, hi]; }
  /* empty cells at the end / start of a piece, and cells since its last change of height */
  function trailing(t, h) { let i = t.length - 1, k = 0; while (i >= 0 && !busy(t, h, i)) { k++; i--; } return k; }
  function leading(t, h) { let i = 0; while (i < t.length && !busy(t, h, i)) i++; return i; }
  function flatEnd(t, h, f) { for (let i = 0; i < t.length; i++) { if (CHANGE.indexOf(t[i]) >= 0 || TILES.indexOf(h[i]) >= 0 || EDGES.indexOf(h[i]) >= 0) f = 0; else f++; } return f; }
  /* a chart builder: add(terrain, overlay) in parts, spaces ignored, overlay padded with "." */
  function B() {
    const o = { t: "", h: "" };
    o.add = function (t, h) { t = t.replace(/ /g, ""); h = (h || "").replace(/ /g, ""); o.t += t; o.h += h + ".".repeat(t.length - h.length); return o; };
    return o;
  }
  const rep = function (s, n) { return new Array(n + 1).join(s); };

  /* Set pieces, one or more per hazard, modelled on how the levels use them (js/levels.js). A template is a generator
     of pieces: gen(R, c) rolls its knobs inside safe ranges and returns { t, h, kn } (kn: the knob values, for the
     no-repeat memory). c: room (cells it may use), y (ground height where it starts), par (Flicker parity, only for
     pieces that start the chunk: first) */
  const TPL = [
    { k: "bloomTower", haz: ["bl"], gen: function (R, c) {
      const top = pick(R, ["..", ".'.", "..^.", ".'.'", ".*.", "'.."]), down = pick(R, ["Y", "V.V", "VV"]), mir = c.y + 4 > BAND[1] - 1;
      const b = B();
      if (mir) b.add(down === "Y" ? "Y.." : down + "..").add(".H" + top + ".", "B");
      else b.add(".H" + top + ".", "B").add(down);
      return { t: b.t, h: b.h, kn: [top, down, mir] };
    } },
    { k: "bloomPit", haz: ["bl"], gen: function (R, c) {
      const pre = pick(R, ["", "^..", "M...", "'.."]), post = pick(R, ["v.", "'.", "v'", "^.", "vv"]), wide = R() < 0.5;
      const b = B().add(pre).add(wide ? "U..." : "U..", "B").add(post);
      return { t: b.t, h: b.h, kn: [pre, post, wide] };
    } },
    { k: "haloChain", haz: ["ha"], gen: function (R, c) {
      const k = ri(R, 1, 2), post = pick(R, [".'.v", "..v", ".v.", "..'."]);
      const b = B().add(".").add(rep("~~", k + 1), rep(".O", k)).add(post);
      return { t: b.t, h: b.h, kn: [k, post] };
    } },
    { k: "haloTower", haz: ["ha"], gen: function (R, c) {
      const top = pick(R, ["..", "...", ".'.", "..."]), mir = c.y + 4 > BAND[1] - 1;
      const b = B();
      if (mir) b.add("Y..");
      b.add(".H" + top + (mir ? "" : "Y"), ".O");
      if (!mir) b.add(".");
      return { t: b.t, h: b.h, kn: [top, mir] };
    } },
    { k: "haloSpikes", haz: ["ha"], gen: function (R, c) {
      const k = ri(R, 1, 2), post = pick(R, ["v.", ".v", "'.", "vv"]);
      const b = B().add(".").add(rep("M..", k + 1), rep(".O.", k)).add(post);
      return { t: b.t, h: b.h, kn: [k, post] };
    } },
    { k: "driftField", haz: ["D"], gen: function (R, c) {
      const parts = [], n = ri(R, 2, 3), b = B();
      for (let i = 0; i < n; i++) parts.push(pick(R, ["~~.v", "_..v", "M..'", "^.v", "'.^.", "~~~.", "+..", "V.'.", "~~.'"]));
      const body = "." + parts.join("");
      b.add(body + ".", "D" + rep(".", body.length - 1) + "d");
      return { t: b.t, h: b.h, kn: parts };
    } },
    { k: "fadeBridge", haz: ["F"], gen: function (R, c) {
      const k = ri(R, 2, 5), pre = pick(R, ["", "^..", "'.", "v."]), post = pick(R, ["..v", ".v.", "...", "'.", "#.."]);
      const b = B().add(pre).add(".").add(rep("~~", k), rep("F.", k)).add(post);
      return { t: b.t, h: b.h, kn: [k, pre, post] };
    } },
    { k: "prismGate", haz: ["ke"], gen: function (R, c) {
      const v = ri(R, 0, 3), gap = ri(R, 2, 3), b = B();
      if (v === 0) b.add("-." + rep(".", 1)).add("." + rep(".", gap) + "v", "K" + rep(".", gap - 1) + "G");
      else if (v === 1) b.add("M..").add("." + rep(".", gap) + ".", "K" + rep(".", gap - 1) + "G").add("v.");
      else if (v === 2) b.add("^..").add("." + rep(".", gap - 1) + "====.", "K" + rep(".", gap - 1) + "G");
      else b.add("+.").add("." + rep(".", gap) + "v.", "K" + rep(".", gap - 1) + "G");
      return { t: b.t, h: b.h, kn: [v, gap] };
    } },
    { k: "anchorComb", haz: ["A"], gen: function (R, c) {
      const body = pick(R, ["_.^_.^*v", "_...^.v.", "^.^.^.v.", "_.^_.^.v", "^_^_^.v.", "_..^_..v", "^.^_.^.v"]);
      const b = B().add(body + ".", "A" + rep(".", body.length - 1) + "a");
      return { t: b.t, h: b.h, kn: [body] };
    } },
    { k: "railRide", haz: ["L"], gen: function (R, c) {
      const under = pick(R, ["spikes", "pit", "posts", "knife"]), len = under === "knife" ? ri(R, 9, 10) : ri(R, 6, 10);
      let u;
      if (under === "spikes") u = rep("^.", len >> 1) + (len & 1 ? "^" : "");
      else if (under === "pit") u = rep("~", len);
      else if (under === "posts") u = ("MI!IM" + rep("^.", 4)).slice(0, len);
      else u = "^M....." + ("^M^").slice(0, len - 7);
      const knife = under === "knife" ? 4 : -1;
      let h = ".L"; for (let i = 1; i < len; i++) h += i === knife ? "x" : "."; h += "l";
      const b = B().add(".." + u.slice(1) + ".v", h);
      return { t: b.t, h: b.h, kn: [len, under] };
    } },
    { k: "riftLedge", haz: ["ri"], gen: function (R, c) {
      const ledge = pick(R, [".", "..", ".^.", "'..", ".*."]), pre = pick(R, ["", "^..", "-.."]), down = pick(R, ["Y", "VV", "V.V"]);
      if (c.y + 4 > BAND[1] - 1) return null;
      const b = B().add(pre).add("H" + ledge + down, "R").add(".");
      return { t: b.t, h: b.h, kn: [ledge, pre, down] };
    } },
    { k: "cometGlide", haz: ["co"], gen: function (R, c) {
      const k = ri(R, 1, 4), post = pick(R, ["..v", ".v.", "..^.", "'."]);
      const b = B().add(".").add(rep("~~", k), rep("C.", k)).add(post);
      return { t: b.t, h: b.h, kn: [k, post] };
    } },
    { k: "thermalLift", haz: ["T"], gen: function (R, c) {
      const len = ri(R, 12, 16), t = [], h = [];
      for (let i = 0; i < len; i++) { t.push("."); h.push("."); }
      h[0] = "T"; h[len - 1] = "t";
      let i = 2; const kn = [];
      while (i < len - 3) {
        const what = pick(R, ["n", "m", "s", "M", "I", "ms", "nv"]);
        if (what === "n" || what === "m") h[i] = what;
        else if (what === "ms") { h[i] = "m"; t[i] = "^"; }
        else if (what === "nv") { h[i] = "n"; t[i + 1] = "v"; }
        else t[i] = what === "s" ? "^" : what;
        kn.push(what); i += ri(R, 2, 3);
      }
      for (let q = 1; q < len - 1; q++) if (t[q] === "." && h[q] === "." && t[q - 1] === "." && h[q - 1] === "." && R() < 0.5) t[q] = pick(R, ["^", "'"]);
      /* no four empty cells in a row (zone edges are not busy), and the piece ends on something */
      for (let q = 0, run = 0; q < len; q++) { if (busy(t, h, q)) run = 0; else if (++run >= 3 && q < len - 1) { t[q] = "^"; run = 0; } }
      t.push("v");
      return { t: t.join(""), h: h.join("") + ".", kn: kn };
    } },
    { k: "mimicPair", haz: ["ey"], gen: function (R, c) {
      const v = ri(R, 0, 2), b = B();
      if (v === 0) b.add("M.^.*'-v", "..E...e.");
      else if (v === 1) b.add(pick(R, ["^.", ".."]) + "..'." + pick(R, ["v.", ".."]), "..E...e.");
      else b.add("^.-''.^v", "E.e.E.e.");
      b.add(".");
      return { t: b.t, h: b.h, kn: [v, b.t] };
    } },
    { k: "glassDive", haz: ["X"], gen: function (R, c) {
      const len = ri(R, 3, 5), under = pick(R, ["spikes", "bars", "plain"]), back = pick(R, ["#.#.", "#..#", "+#.+"]);
      const u = under === "spikes" ? (".^.^.^").slice(0, len) : rep(".", len);
      /* on low ground, climb first and stay down after the pane (same pane, mirrored order) */
      if (c.y - 4 < BAND[0] + 1) {
        if (c.y + 4 > BAND[1] - 1) return null;
        const b = B().add("#.'.#..Y" + u + (under === "bars" ? "--.'" : "..'."), "........" + rep("X", len));
        return { t: b.t, h: b.h, kn: [len, under, "low"] };
      }
      const after = under === "bars" ? "--.." + back : ".." + back;
      const b = B().add("..Y" + u + after, "..." + rep("X", len));
      return { t: b.t, h: b.h, kn: [len, under, back] };
    } },
    { k: "coilLaunch", haz: ["S"], gen: function (R, c) {
      const target = pick(R, ["H", "#", "U"]), len = ri(R, 2, 3);
      if (target === "H" && c.y + 4 > BAND[1] - 1) return null;
      const b = B().add("." + rep(".", len), "." + rep("S", len));
      if (target === "H") b.add("H.." + pick(R, ["Y", "V.V"]));
      else if (target === "#") b.add("#.." + pick(R, ["V", "v.v"]));
      else b.add("U..v");
      return { t: b.t, h: b.h, kn: [target, len] };
    } },
    { k: "flickerRun", haz: ["1"], first: true, gen: function (R, c) {
      const k = ri(R, 2, 4), pre = pick(R, ["'.", "v."]);
      let tiles = "", p = c.par ^ 1;
      for (let i = 0; i < k; i++) { tiles += (p === 0 ? "1" : "2") + "."; p ^= 1; }
      const b = B().add(pre + ".").add(rep("~", 2 * k + 1), "." + tiles).add(pick(R, ["..v", ".^.", "'..", "..."]));
      return { t: b.t, h: b.h, kn: [k, pre] };
    } },
    { k: "zenithRun", haz: ["Z"], gen: function (R, c) {
      const f = filler(R, ri(R, 10, 16), { base: c.y, tier: 1, want: 3, dots: 2 });
      const body = "v.." + f.t.slice(2);
      const b = B().add(body + "v", "Z" + rep(".", body.length - 1) + "z").add(".");
      return { t: b.t, h: b.h, kn: [body.length, f.t] };
    } }
  ];
  /* Combos: two or three hazards overlapping, back to back or one inside another's zone, like the later levels. The
     table is explicit, so nonsense pairs never come up; a combo appears only in a wave's peaks, and the music marks it
     with its riser (music.js comboBars). how: overlap, chain or inside. */
  const COMBO = [
    { k: "haloFade", haz: ["ha", "F"], how: "overlap", gen: function (R, c) {
      const k = ri(R, 2, 3), post = pick(R, ["..v", ".'.", "..^.", ".v."]), b = B().add(".");
      b.add(rep("~~", k + 1), rep("F.", k) + "O.").add(post);
      return { t: b.t, h: b.h, kn: [k, post] };
    } },
    { k: "glassCoil", haz: ["X", "S"], how: "chain", gen: function (R, c) {
      if (c.y - 4 < BAND[0] + 1) return null;
      const v = ri(R, 0, 1), pre = pick(R, ["^..", "M..", "'.."]);
      const b = B().add(v ? pre + "Y..'. ..H.'.^v" : pre + "Y.... ..H..Y..", v ? "....XXXS SS......" : "....XXXS SS......").add(".");
      return { t: b.t, h: b.h, kn: [v, pre] };
    } },
    { k: "thermalMimic", haz: ["T", "ey"], how: "inside", gen: function (R, c) {
      const v = ri(R, 0, 1);
      const sp = pick(R, ["^", "M", "I"]);
      const b = B().add(v ? "..^.M... " + sp + ".I.M.^." : ".M...... ." + sp + "I...M.", v ? ".T.E...e ......t." : "T...E... e.....t.").add("..");
      return { t: b.t, h: b.h, kn: [v, sp] };
    } },
    { k: "bloomComet", haz: ["bl", "co"], how: "chain", gen: function (R, c) {
      /* bounce onto a tower, then a comet off its edge carries you over a pit at the top */
      if (c.y + 4 > BAND[1] - 1) return null;
      const k = ri(R, 1, 2), top = pick(R, ["..", "..."]), down = pick(R, ["Y", "VV"]);
      const b = B().add(".H" + top, "B").add(rep("~~", k) + "~", rep("C.", k)).add(".." + down + ".");
      return { t: b.t, h: b.h, kn: [k, top, down] };
    } },
    { k: "railFlicker", haz: ["L", "1"], how: "overlap", first: true, gen: function (R, c) {
      const p0 = c.par ^ 1, k = ri(R, 1, 2), post = pick(R, ["..v", ".'.", "..^."]);
      let tiles = "", p = p0;
      for (let i = 0; i < k; i++) { tiles += (p === 0 ? "1" : "2") + "."; p ^= 1; }
      const b = B().add("'..").add("~~~~~~" + rep("~~", k) + "~", ".L....l" + tiles).add(post);
      return { t: b.t, h: b.h, kn: [k, post] };
    } },
    { k: "riftDrift", haz: ["ri", "D"], how: "chain", gen: function (R, c) {
      if (c.y + 4 > BAND[1] - 1) return null;
      const inner = pick(R, ["~~.v", "_..v", "M..v", "~~.'"]), pre = pick(R, ["^..", "M..", "'.."]);
      const b = B().add(pre + "H.." + inner + "..Y.", "...RD" + rep(".", inner.length + 3) + "d").add(".");
      return { t: b.t, h: b.h, kn: [inner, pre] };
    } },
    { k: "haloDrift", haz: ["ha", "D"], how: "inside", gen: function (R, c) {
      if (c.y + 4 > BAND[1] - 1) return null;
      const a1 = pick(R, ["v.", "'.", ".v"]), a2 = pick(R, ["..V.'.V.", "..V.^.V.", ".'V..'V."]);
      const b = B().add("...H.." + a1 + a2, ".D.O.... ......d.");
      return { t: b.t, h: b.h, kn: [a1, a2] };
    } },
    { k: "prismDrift", haz: ["ke", "D"], how: "inside", gen: function (R, c) {
      const v = ri(R, 0, 1), sp = pick(R, ["^", "M", "'"]);
      const b = B().add(v ? ".._.v.'. .." + sp + "...v." : "..~~v.'. .." + sp + "...v.", ".D..K... ....G.d.");
      return { t: b.t, h: b.h, kn: [v, sp] };
    } },
    { k: "fadeDrift", haz: ["F", "D"], how: "inside", gen: function (R, c) {
      const k = ri(R, 2, 3), end = pick(R, [".v..^.", "..'.^.", "...^v."]);
      const b = B().add(".." + rep("~~~", k) + "~" + end, ".D" + rep("F..", k) + ".....d").add(".");
      return { t: b.t, h: b.h, kn: [k, end] };
    } },
    { k: "anchorFade", haz: ["A", "F"], how: "chain", gen: function (R, c) {
      const body = pick(R, ["..^...v.", "._.^..v.", ".^.^..v."]);
      const b = B().add(body + "~~~~..v.", ".A.....a F.F.....");
      return { t: b.t, h: b.h, kn: [body] };
    } },
    { k: "anchorComet", haz: ["A", "co"], how: "chain", gen: function (R, c) {
      const body = pick(R, ["...^...^", "..^_..^.", "._..^.v."]);
      const b = B().add(body + ".~~..'.v", ".A...... a.C.....");
      return { t: b.t, h: b.h, kn: [body] };
    } },
    { k: "anchorPrism", haz: ["A", "ke"], how: "inside", gen: function (R, c) {
      const body = pick(R, ["_.^_.^*v", "_.^..^.v", "^.^_.^.v"]);
      const b = B().add(body + ".", "A.K..G.a");
      return { t: b.t, h: b.h, kn: [body] };
    } },
    { k: "bloomPrism", haz: ["bl", "ke"], how: "chain", gen: function (R, c) {
      const pre = pick(R, ["^...", "M...", "'...", "-..."]), post = pick(R, ["v.'.'.v.", ".v'..^v.", "v..'..v."]);
      const b = B().add(pre + "U..." + post, "....BK.. ..G.....");
      return { t: b.t, h: b.h, kn: [pre, post] };
    } },
    { k: "riftBloom", haz: ["ri", "bl"], how: "chain", gen: function (R, c) {
      if (c.y + 4 > BAND[1] - 1) return null;
      if (c.y + 7 > BAND[1]) return null;
      const pre = pick(R, ["..v.", "..'.", ".^..", "-..."]), top = pick(R, ["'.", ".'", "^."]), down = pick(R, ["YY", "Y.Y"]);
      const b = B().add(pre + "H." + top + " ..H..'" + down, "....R... .B......").add(".");
      return { t: b.t, h: b.h, kn: [pre, top, down] };
    } },
    { k: "railMimic", haz: ["L", "ey"], how: "inside", gen: function (R, c) {
      const under = pick(R, ["^M^M^.", "~~~~~.", "^.^.^.", "M.M.^."]), after = pick(R, ["-.-.*.-v", "-.'.*.-v", "-.-.'.-v"]);
      const b = B().add("'." + under + after, "...L.E.. l...e...").add(".");
      return { t: b.t, h: b.h, kn: [under, after] };
    } },
    { k: "haloMimic", haz: ["ha", "ey"], how: "chain", gen: function (R, c) {
      const b = B().add(pick(R, ["@.-.@.^v", "^.-.^.^v", "^.-.@.^v"]), "..E.O.e.").add(".");
      return { t: b.t, h: b.h, kn: [b.t] };
    } },
    { k: "coilComet", haz: ["S", "co"], how: "chain", gen: function (R, c) {
      const k = ri(R, 1, 2), post = pick(R, ["..v", "..'", ".v."]);
      const b = B().add("..." + rep("~~", k + 2) + post, ".SS." + rep("C.", k + 1)).add(".");
      return { t: b.t, h: b.h, kn: [k, post] };
    } },
    { k: "zenithHalo", haz: ["Z", "ha"], how: "inside", gen: function (R, c) {
      const a1 = pick(R, ["^.", "M.", "-."]), a2 = pick(R, ["^.v.", "M.v.", "'.v."]);
      const b = B().add("v.." + a1 + "~~~~.." + a2 + "v", "Z......O.......z").add(".");
      return { t: b.t, h: b.h, kn: [a1, a2] };
    } },
    { k: "bloomHalo", haz: ["bl", "ha"], how: "chain", gen: function (R, c) {
      /* bounce onto a tower, then a Halo off its edge for an air jump over a pit at the top */
      if (c.y + 4 > BAND[1] - 1) return null;
      const top = ri(R, 2, 3), down = pick(R, ["Y", "VV"]);
      const b = B().add(".H" + rep(".", top), "B").add("~~~~", rep(".", top - 1) + "O").add(".." + down + ".");
      return { t: b.t, h: b.h, kn: [top, down] };
    } },
    { k: "flickerHalo", haz: ["1", "ha"], how: "overlap", first: true, gen: function (R, c) {
      /* a tile, a Halo whose air jump swaps the sets once more, and a tile of the same set */
      const p = c.par ^ 1, s = function (q) { return q === 0 ? "1" : "2"; }, pre = pick(R, ["'.", "v."]);
      const b = B().add(pre + ".").add("~~~~~~~", "." + s(p) + ".O." + s(p) + ".").add(pick(R, ["..v", ".^.", "'.."]));
      return { t: b.t, h: b.h, kn: [p, pre] };
    } },
    { k: "thermalPrism", haz: ["T", "ke"], how: "inside", gen: function (R, c) {
      const a1 = pick(R, ["..^...^.", ".M....^.", "..I...M."]), a2 = pick(R, ["..M...^.", "..^.M.^.", "..I...^."]);
      const b = B().add(a1 + " " + a2, ".T..K... .G..n.t.").add("..");
      return { t: b.t, h: b.h, kn: [a1, a2] };
    } },
    { k: "cometFade", haz: ["co", "F"], how: "chain", gen: function (R, c) {
      const k = ri(R, 1, 2), two = R() < 0.5;
      const b = B().add(".." + rep("~", (two ? 5 : 3) + 2 * k) + "..v", (two ? ".C.C.." : ".C..") + rep("F.", k)).add(".");
      return { t: b.t, h: b.h, kn: [k, two] };
    } }
  ];
  /* the compatibility table, derived from COMBO: which hazards combine, and how */
  const COMPAT = {};
  COMBO.forEach(function (c) { const key = c.haz.slice().sort().join("+"); (COMPAT[key] || (COMPAT[key] = [])).push(c.how); });
  /* plain templates (filler only), so plain stretches have flavours of their own too */
  const PLAIN = [
    { k: "stairs", lean: { u: 2.5, d: 2.5 } }, { k: "overhead", lean: { o: 3, n: 2 }, over: 2 }, { k: "pits", lean: { p: 3, g: 1.5 } },
    { k: "machines", lean: { m: 4, o: 1.5 }, tier: 2 }, { k: "spikes", lean: { g: 3 } }, { k: "mixed", lean: {} }
  ];

  /* Accents: one hazard in a few cells, set among the fillers around a chunk's main piece (and in plain stretches), so
     a hazard is in view almost all the time, as in the levels (mech 1.3-1.5 from level 10). Each was solved on its own
     from a calm seam. gen(R, y) returns { t, h } or null */
  const ACC = [
    { k: "bl", gen: function (R) { return pick(R, [{ t: "U..", h: "B.." }, { t: "U...", h: "B..." }, { t: "U..'", h: "B..." }]); } },
    { k: "ha", gen: function (R) { return pick(R, [{ t: "~~~~.", h: ".O..." }, { t: ".~~~~.'", h: "..O...." }]); } },
    { k: "co", gen: function (R) { return pick(R, [{ t: "~~~.", h: "C..." }, { t: "~~~.'", h: "C...." }]); } },
    { k: "F", gen: function (R) { return pick(R, [{ t: "~~~~.", h: "F.F.." }, { t: "~~~~.'", h: "F.F..." }]); } },
    { k: "ke", gen: function (R) { return pick(R, [{ t: "-....", h: "..K.G" }, { t: "^......", h: "..K..G." }, { t: "-.....", h: "..K..G" }]); } },
    { k: "ey", tier: 3, gen: function (R) { return pick(R, [{ t: "..'...", h: "E...e." }, { t: "^...'..", h: "E.....e" }]); } }
  ];

  /* ---------------- generator ---------------- */
  function calm(s) {
    return s.gr && !s.sl && !s.jp && s.hang < 0 && s.gl <= 0 && s.ch === 0 && !s.flip && s.buf === 0 && s.slT === 0 && s.air === 0 && !s.dl && s.vy === 0 && s.coy === 0 && !s.dead;
  }
  function cleanState(s) { const c = SIM.clone(s); c.dyn = {}; c.ev = null; return c; }
  const now = typeof performance !== "undefined" && performance.now ? function () { return performance.now(); } : function () { return Date.now(); };

  function create(seed, opt) {
    opt = opt || {};
    seed = seed >>> 0;
    const L = SIM.stream({ minY: MINY });
    const g = { seed: seed, L: L, s: SIM.newState(), path: [], bars: 0, chunks: [], biomes: [], job: null, log: [], F: 1.3, kW: 1, rate: 200,
      stats: { chunks: 0, attempts: 0, fallbacks: 0, safe: 0, emergency: 0, ms: [], ticks: 0 } };
    const PR = rng(mix(seed, 1, 0));            /* the plan: wave cycles */
    const plan = [];
    let planBar = 0;
    function planTo(bar) {
      while (planBar <= bar + 24) {
        if (planBar === 0) { plan.push({ ph: "intro", b0: 0, n: 2 }, { ph: "warm", b0: 2, n: WARM - 2 }); planBar = WARM; continue; }
        const cyc = CYCLES[Math.floor(PR() * CYCLES.length)];
        for (const p of cyc) { plan.push({ ph: p[0], b0: planBar, n: p[1] }); planBar += p[1]; }
      }
    }
    function phaseAt(bar) { planTo(bar); for (let i = plan.length - 1; i >= 0; i--) if (plan[i].b0 <= bar) return plan[i]; return plan[0]; }
    /* biomes: 16-32 bars each, all 30 worlds before any repeats (a seeded shuffle bag), never two of a family in a row */
    const BR = rng(mix(seed, 2, 0));
    let bag = [], bBar = 0;
    function biomesTo(bar) {
      while (bBar <= bar + 40) {
        if (!bag.length) { bag = []; for (let n = 1; n <= 30; n++) bag.push(n); for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(BR() * (i + 1)); const t = bag[i]; bag[i] = bag[j]; bag[j] = t; } }
        const prev = g.biomes.length ? g.biomes[g.biomes.length - 1].w : 0;
        let k = 0; while (k < bag.length - 1 && prev && FAM[bag[k]] === FAM[prev]) k++;
        const w = bag.splice(k, 1)[0], n = bBar === 0 ? 16 + 4 * Math.floor(BR() * 3) : 16 + 4 * Math.floor(BR() * 5);
        let motif = null;
        if (bBar > 0 && BR() < 0.35) {
          const ok = MOTIF.filter(function (m) { return FAM[m[1]] !== FAM[w] && FAM[m[1]] !== FAM[prev]; });
          if (ok.length) { const m = ok[Math.floor(BR() * ok.length)]; motif = { kind: m[0], from: m[1], seed: Math.floor(BR() * 1e9) }; }
        }
        g.biomes.push({ w: w, b0: bBar, n: n, motif: motif, lead: Math.floor(BR() * 1e9) });
        bBar += n;
      }
    }
    biomesTo(0);
    /* the wave's phase { ph, b0, n } a bar belongs to (the music reads it to pick its section) */
    g.phaseOf = function (bar) { return phaseAt(bar); };
    g.biomeAt = function (bar) { biomesTo(bar); for (let i = g.biomes.length - 1; i >= 0; i--) if (g.biomes[i].b0 <= bar) return g.biomes[i]; return g.biomes[0]; };

    /* memory: when each hazard and template was last used, recent piece hazards, signatures, knobs */
    const lastHaz = {}, lastTpl = {}, sigs = {}, lastKn = {}, recent = [];
    HK.forEach(function (k) { lastHaz[k] = -1000; });
    let flatRun = 0, gapRun = 0, prevRest = false;

    /* what the last 8 bars did: height trend, overhead share, rolls vs jumps */
    function lean() {
      const out = {}, cs = g.chunks.slice(-3);
      let dy = 0, over = 0, all = 0, rolls = 0, jumps = 0;
      cs.forEach(function (c) { dy += c.dy; over += c.over; all += c.busy; rolls += c.rolls; jumps += c.jumps; });
      if (dy > 3) out.d = 2.5; else if (dy < -3) out.u = 2.5;
      if (all && over / all < 0.25) { out.o = 2; out.n = 1.5; } else if (all && over / all > 0.5) { out.g = 1.6; out.p = 1.6; }
      if (jumps > 3 * (rolls + 1)) out.o = (out.o || 1) * 1.6;
      return out;
    }

    /* the spec of chunk i: its bars, phase, energy and target */
    function spec() {
      const bar = g.bars, ph = phaseAt(bar), left = ph.b0 + ph.n - bar;
      let n;
      if (ph.ph === "rest") n = 1;
      else if (ph.ph === "intro") n = 2;
      else if (left <= 4) n = left === 1 ? 1 : left;
      else n = left - 2 <= 1 ? 2 : ri(PR, 2, Math.min(4, left - 2));
      if (n === 1 && ph.ph !== "rest") n = 1;
      const lv = ph.ph === "rest" ? 0 : Math.min(15, baseLv(bar) + (bar < WARM ? 0 : PHASE[ph.ph][1] * (bar < RAMP ? 0.6 : 1)));
      const sp = { i: g.chunks.length, bar: bar, n: n, ph: ph.ph, energy: PHASE[ph.ph][0], lv: lv };
      sp.want = wantFor(sp);
      return sp;
    }
    /* hazard weights: the least recently used first; never in more than 2 pieces in a row; tier by time */
    function hazWeight(k, sp) {
      const tier = sp.bar < 30 ? 1 : sp.bar < RAMP + 10 ? 2 : 3;
      if (TIER[k] > tier) return 0;
      if (recent.length >= 2 && recent[recent.length - 1].indexOf(k) >= 0 && recent[recent.length - 2].indexOf(k) >= 0) return 0;
      const since = sp.bar - lastHaz[k];
      return since > 70 ? 1e6 : Math.pow(since + 1, 2);
    }
    function tplOk(t, sp, kn) {
      if (lastTpl[t.k] !== undefined && sp.bar - lastTpl[t.k] < 8) return false;
      return true;
    }
    /* one candidate for a spec, at attempt a: { t, h, tpl, haz, combo, kn, safe, sig }. The piece is rolled once; its
       fillers are rolled again (up to 12 times) until the chunk passes the static rules, so a validation attempt is only
       spent on a chunk that could be kept */
    function candidate(sp, a, avoid) {
      const R = rng(mix(seed, 1000 + sp.i, a)), n = sp.n * 8, room = n - 3, restNext = phaseAt(sp.bar + sp.n).ph === "rest";
      const c = { y: L.base, par: g.s.par, room: room };
      const tier = sp.bar < 30 ? 0 : sp.bar < RAMP ? 1 : 2, want = sp.want * sp.n;
      /* obstacle characters: what the last 36 bars still need to average the band's middle, within this chunk's own range */
      const bd = band(sp.bar < WARM ? 3 : 12), mid = (bd.lo + bd.hi) / 2, dh0 = densHist();
      const dens = Math.max((bd.lo - 0.8) * sp.n, Math.min((bd.hi + 0.8) * sp.n, mid * (dh0.bars + sp.n) - dh0.chars));
      let piece = null, tpl = null, haz = [], combo = false, safe = false, first = false, plain = null, kind = "", accents = [];
      if (sp.ph === "intro") kind = "intro";
      else if (a >= 20) kind = "flat";
      else if (sp.ph === "rest" && a < 3) kind = "rest";
      else if (sp.ph === "rest" || a >= KNOB_TRIES + TPL_TRIES + SAFE_TRIES) { kind = "last"; safe = sp.ph !== "rest"; }
      else if (a >= KNOB_TRIES + TPL_TRIES || sp.ph === "warm" && a >= KNOB_TRIES + 1) { kind = "safe"; safe = sp.ph !== "warm"; }
      else {
        /* which template: a hazard piece, a combo (peaks only) or a plain flavour */
        const hazChance = sp.ph === "warm" ? 0.75 : sp.ph === "cool" ? 0.55 : 0.85;
        /* a seed running short of combos (under 4.6 places a minute over the last two) leans on them harder */
        const low = sp.bar >= RAMP + 18 && comboRate() < 4.6;
        const comboChance = sp.ph === "peak" || sp.ph === "peak2" ? (sp.bar < RAMP ? 0.4 : low ? 1 : 0.8) : sp.ph === "build" && sp.bar >= RAMP ? (low ? 0.6 : 0.3) : 0;
        const TR = rng(mix(seed, 5000 + sp.i, a < KNOB_TRIES ? 0 : a));
        const tryTpl = function (t) {
          for (let k = 0; k < 8; k++) {
            const pc = t.gen(R, c);
            if (!pc || pc.t.length > room - 1) continue;
            if ((pc.p === undefined ? presses(pc.t) : pc.p) > want * 1.8 + 1) continue;
            if (lastKn[t.k]) { let d = 0; const a0 = lastKn[t.k]; pc.kn.forEach(function (v, i) { if (String(v) !== String(a0[i])) d++; }); if (d < Math.min(2, pc.kn.length)) continue; }
            const sg = t.k + "|" + pc.kn.join(",") + "|" + t.haz.join(",");
            if (sigs[sg] !== undefined && sp.bar - sigs[sg] < 180) continue;
            return pc;
          }
          return null;
        };
        /* a hazard not seen for 75 bars gets its own set piece now, so every one is in every 3 minutes */
        const tierNow = sp.bar < 30 ? 1 : sp.bar < RAMP + 10 ? 2 : 3;
        let overdue = null;
        HK.forEach(function (k) { if (TIER[k] <= tierNow && sp.bar - lastHaz[k] > 75 && (!overdue || lastHaz[k] < lastHaz[overdue])) overdue = k; });
        const roll = overdue ? 1 : TR();
        if (overdue) {
          const opts = TPL.filter(function (t) { return t.haz[0] === overdue && !avoid[t.k]; });
          while (opts.length && !piece) { const t = opts.splice(Math.floor(TR() * opts.length), 1)[0]; piece = tryTpl(t); if (piece) tpl = t; else avoid[t.k] = 1; }
        }
        if (!piece && roll < comboChance && sp.n >= 2) {
          tpl = wpick(TR, COMBO, function (cb) {
            if (avoid[cb.k] || !tplOk(cb, sp)) return 0;
            let w = 1; for (const k of cb.haz) { const hw = hazWeight(k, sp); if (!hw) return 0; w *= Math.sqrt(hw); }
            return w;
          });
          combo = !!tpl;
        }
        if (tpl && !piece) { piece = tryTpl(tpl); if (!piece) { avoid[tpl.k] = 1; tpl = null; combo = false; } }
        if (!tpl && roll < comboChance + hazChance * (1 - comboChance)) {
          /* a set piece for the least recently used hazard that has one which fits; another hazard if none does */
          for (let tries = 0; tries < 4 && !piece; tries++) {
            const hk = wpick(TR, HK, function (k) { return TPL.some(function (t) { return t.haz[0] === k && !avoid[t.k] && tplOk(t, sp); }) ? hazWeight(k, sp) : 0; });
            if (!hk) break;
            const opts = TPL.filter(function (t) { return t.haz[0] === hk && !avoid[t.k] && tplOk(t, sp); });
            while (opts.length && !piece) { const t = opts.splice(Math.floor(TR() * opts.length), 1)[0]; piece = tryTpl(t); if (piece) tpl = t; else avoid[t.k] = 1; }
          }
        }
        if (tpl) { kind = "piece"; first = !!tpl.first; haz = tpl.haz.slice(); }
        if (!tpl) {
          plain = wpick(TR, PLAIN, function (p) { return (p.tier || 0) > tier || avoid["plain:" + p.k] || (lastTpl["plain:" + p.k] !== undefined && sp.bar - lastTpl["plain:" + p.k] < 8) ? 0 : 1; });
          if (!plain) return null;
          kind = "plain";
        }
        /* accents: one or two more hazards among the fillers, the least recently used first */
        const na = (kind === "plain" ? 1 : 0) + (sp.n >= 3 && TR() < 0.6 ? 1 : 0) + (sp.n >= 4 && TR() < 0.4 ? 1 : 0);
        for (let q = 0; q < na; q++) {
          const ac = wpick(TR, ACC, function (a) { if (haz.indexOf(a.k) >= 0 || accents.some(function (x) { return x.k === a.k; }) || (a.tier || 1) > (sp.bar < 30 ? 1 : sp.bar < RAMP + 10 ? 2 : 3)) return 0; return hazWeight(a.k, sp); });
          if (!ac) break;
          const g0 = ac.gen(R); accents.push({ k: ac.k, t: g0.t, h: g0.h });
        }
        accents.forEach(function (a) { if (haz.indexOf(a.k) < 0) haz.push(a.k); });
      }
      let why = "", last = null;
      for (let k = 0; k < 24; k++) {
        const FR = rng(mix(seed, 9000 + sp.i, a * 32 + k)), ln = lean();
        let body;
        if (kind === "flat") {
          /* nothing can go wrong on flat ground: the end of the ladder */
          body = { t: rep(".", room), h: rep(".", room) };
        } else if (kind === "intro") {
          /* two calm bars: nothing for a bar, then a couple of plain obstacles */
          const f = filler(FR, 7, { base: L.base, tier: 0, want: 1, dens: 3, lead: 2, end: true, flat: 6 });
          body = { t: "......" + f.t, h: rep(".", 13) };
        } else if (kind === "rest" || kind === "last") {
          /* the breather (and the last resort): no input at all, steps down and walls to stay under */
          const f = filler(FR, room, { base: L.base, tier: 0, quiet: kind === "last" ? 2 : 1, dens: room * 0.4, lead: 3, end: true, flat: flatRun + 1 });
          body = { t: f.t, h: f.h };
        } else if (kind === "safe") {
          const f = filler(FR, room, { base: L.base, tier: 0, want: Math.max(1, want * 0.8), dens: dens, lead: 3, end: true, flat: flatRun + 1 });
          body = { t: f.t, h: f.h };
        } else {
          /* blocks (the piece and its accents) in order, with fillers between them at the heights they leave */
          const blocks = [];
          if (piece) blocks.push({ t: piece.t, h: piece.h, p: piece.p === undefined ? presses(piece.t) : piece.p, main: true });
          accents.forEach(function (ac) { blocks.push({ t: ac.t, h: ac.h, p: presses(ac.t) + (ac.k === "ha" ? 1 : 0) }); });
          if (!first) for (let q = blocks.length - 1; q > 0; q--) { const r = Math.floor(FR() * (q + 1)), tmp = blocks[q]; blocks[q] = blocks[r]; blocks[r] = tmp; }
          /* accents that do not fit leave */
          let used = 0; blocks.forEach(function (bk) { used += bk.t.length; });
          while (used > room - blocks.length + 1 && blocks.length > 1) { const q = blocks.findIndex(function (bk) { return !bk.main; }); if (q < 0) break; used -= blocks[q].t.length; blocks.splice(q, 1); }
          let bp = 0, bc = 0; blocks.forEach(function (bk) { bp += bk.p; bc += chars(bk.t); });
          const free = room - used;
          if (free < 0) continue;
          /* split the free cells into blocks + 1 gaps (none before a piece that starts the chunk); a join that would leave
             four empty cells in a row (the seam counts three) gets at least one cell of filler, which ends busy */
          const need = [], nb0 = blocks.length;
          for (let q = 0; q <= nb0; q++) {
            const pt = q ? trailing(blocks[q - 1].t, blocks[q - 1].h) : 3, nl = q < nb0 ? leading(blocks[q].t, blocks[q].h) : 3;
            need.push(pt + nl >= 4 || q === nb0 && pt > 0 ? 1 : 0);
          }
          if (first) need[0] = 0;
          let rest0 = free; need.forEach(function (v) { rest0 -= v; });
          if (rest0 < 0) continue;
          const cut = []; for (let q = 0; q < nb0; q++) cut.push(Math.floor(FR() * (rest0 + 1)));
          cut.sort(function (x, y) { return x - y; });
          const gaps = []; let lastCut = 0; cut.forEach(function (x) { gaps.push(x - lastCut); lastCut = x; }); gaps.push(rest0 - lastCut);
          if (first && gaps[0]) { gaps[1] += gaps[0]; gaps[0] = 0; }
          for (let q = 0; q <= nb0; q++) gaps[q] += need[q];
          /* an accent often sits right against the main piece: two hazards within two beats make a combo place */
          for (let q = 1; q < nb0; q++) if ((blocks[q - 1].main || blocks[q].main) && FR() < 0.75 && gaps[q] > need[q]) { gaps[nb0] += gaps[q] - need[q]; gaps[q] = need[q]; }
          const lp = Object.assign({}, ln); if (plain) for (const q in plain.lean) lp[q] = (lp[q] || 1) * plain.lean[q];
          const pw = Math.max(0, want - bp), pd = Math.max(0, dens - bc);
          let tt = "", hh = "", y = L.base, fl = flatRun + 1, lead = 3, okJ = true;
          for (let q = 0; q <= blocks.length; q++) {
            const nb = blocks[q], n0 = gaps[q];
            if (n0 > 0) {
              const ex = nb ? excursion(nb.t) : [0, 0], goal = [BAND[0] + 1 - ex[0] + (!nb && restNext ? 2 : 0), BAND[1] - 1 - ex[1]];
              const f = filler(FR, n0, { base: y, tier: tier, want: pw * n0 / Math.max(1, free), dens: pd * n0 / Math.max(1, free), lean: lp, over: plain && plain.over,
                lead: lead, flat: fl, prev: tt || ".", next: nb ? nb.t : ".", end: nb ? leading(nb.t, nb.h) > 0 : true, goal: goal });
              if (!okAfter(tt || ".", f.t)) okJ = false;
              tt += f.t; hh += f.h; y = f.y; fl = f.flat; lead = f.dots;
              if (nb && !okAfter(tt, nb.t, nb.h)) okJ = false;
            } else if (nb && tt && !okAfter(tt, nb.t, nb.h)) okJ = false;
            if (!nb) break;
            tt += nb.t; hh += nb.h; y += dh(nb.t); fl = flatEnd(nb.t, nb.h, fl); lead = trailing(nb.t, nb.h);
          }
          if (!okJ) continue;
          body = { t: tt, h: hh };
        }
        const t = "." + body.t + "..", h = "." + body.h + "..";
        const tk = kind === "piece" ? tpl.k : kind === "plain" ? "plain:" + plain.k : kind;
        const kn = (kind === "piece" ? piece.kn : [body.t]).concat(accents.map(function (a) { return a.k + ":" + a.t; }));
        /* the signature: template, its main knobs and its hazards (the no-repeat memory keeps it 5 minutes) */
        const cd = { t: t, h: h, tpl: tk, haz: haz, combo: combo, kn: kn, safe: safe,
          sig: kind === "piece" ? tpl.k + "|" + piece.kn.join(",") + "|" + tpl.haz.join(",") : tk + "|" + body.t + "|" + haz.join(",") };
        why = staticOk(sp, cd);
        if (!why) return cd;
        last = cd;
      }
      return { err: why || "assembly", last: last };
    }

    /* the running difficulty estimate over the last 36 bars (README › Difficulty) */
    function dEst(f0, f1) {
      let bars = 0, acts = [], hz = [], lvw = 0;
      for (let i = g.chunks.length - 1; i >= 0 && bars < 36; i--) {
        const q = g.chunks[i];
        if (f1 !== undefined && q.bar >= f1) continue;
        if (f0 !== undefined && q.bar + q.bars <= f0) break;
        bars += q.bars; acts = q.acts.concat(acts); hz = q.hz.concat(hz);
        lvw += (q.ph === "rest" || q.ph === "intro" ? baseLv(q.bar) : q.lv) * q.bars;
      }
      if (bars < (f0 !== undefined ? 6 : 12)) return null;
      /* a window [f0, f1) is measured the way tools/infinite-check.js measures a minute: its own bars only, and the
         hazards and combo places inside it (a chunk that started before it brings only what is in it) */
      if (f0 !== undefined) bars = f1 - f0;
      const b1 = f1 !== undefined ? f1 : g.bars, b0 = b1 - bars, sec = bars * 4 * 60 / BPM, spb = 60 / BPM;
      if (f0 !== undefined) {
        acts = acts.filter(function (t) { return t >= f0 * TBAR && t < f1 * TBAR; });
        hz = hz.filter(function (h) { return h.x1 > f0 * BAR && h.x0 < f1 * BAR; });
      }
      hz.sort(function (a, b) { return a.x0 - b.x0; });
      const gaps = []; for (let i = 1; i < acts.length; i++) gaps.push((acts[i] - acts[i - 1]) / TPB * spb);
      gaps.sort(function (a, b) { return a - b; });
      const hit = {}; acts.forEach(function (t) { hit[Math.floor(t / TBAR)] = 1; });
      let quiet = 0; for (let b = b0; b < b1; b++) if (!hit[b]) quiet++;
      const places = combos(hz).filter(function (x) { return f0 === undefined || x >= f0 * BAR && x < f1 * BAR; });
      const D = scoreD({ aps: acts.length / sec, mech: mech(hz, b0, b1), combo: places.length * 60 / sec, slack: EASY, rest: quiet / bars,
        gap10: gaps.length ? gaps[Math.floor(0.1 * (gaps.length - 1))] : 1 });
      return { D: D, aps: acts.length / sec, target: 0.403 * Math.pow(1.1, lvw / bars - 1), rest: quiet / bars, b0: b0, b1: b1 };
    }
    /* the share of bars in [b0, b1) that the wave plan makes breathers */
    function restPlan(b0, b1) { let r = 0; for (let b = b0; b < b1; b++) if (phaseAt(b).ph === "rest") r++; return r / Math.max(1, b1 - b0); }
    /* combo places a minute over the last 72 bars (2 minutes), memoised per bar count */
    const crMemo = { b: -1, v: 0 };
    function comboRate() {
      if (crMemo.b === g.bars) return crMemo.v;
      let bars = 0, hz = [];
      for (let i = g.chunks.length - 1; i >= 0 && bars < 72 && g.chunks[i].hz; i--) { bars += g.chunks[i].bars; hz = g.chunks[i].hz.concat(hz); }
      hz.sort(function (a, b) { return a.x0 - b.x0; });
      crMemo.b = g.bars; crMemo.v = bars ? combos(hz).length * 60 / (bars * 4 * 60 / BPM) : 0;
      return crMemo.v;
    }
    /* presses a bar for the chunk about to be made: D is judged per minute (36 bars), so the minute this chunk is in should
       land on D of the levels its waves aim at. F is D over aps for the last 36 bars (mech, combos, rest, the fastest
       gaps and slack, which change slowly); the presses still needed this minute are spread over its remaining bars,
       shaped by the wave (more in peaks, fewer in builds and cool-downs) */
    function wantFor(sp) {
      if (sp.bar < 12) return actsFor(sp.lv);
      const W = BPM / 4, w0 = Math.floor(sp.bar / W) * W, w1 = w0 + W, t0 = w0 * TBAR;
      let lvs = 0, shape = 0, done = 0;
      for (let b = w0; b < w1; b++) { const ph = phaseAt(b), lv = ph.ph === "rest" ? baseLv(b) : Math.min(15, baseLv(b) + (b < WARM ? 0 : PHASE[ph.ph][1] * (b < RAMP ? 0.6 : 1))); lvs += lv; if (b >= sp.bar) shape += ph.ph === "rest" ? 0 : actsFor(lv); }
      for (let i = g.chunks.length - 1; i >= 0; i--) { const q = g.chunks[i]; if (q.bar + q.bars <= w0) break; for (const t of q.acts) if (t >= t0) done++; }
      /* the factor D / aps: the trailing one, more and more this minute's own as it fills */
      let F = g.F;
      /* breathers are planned: a minute with fewer of them than the trailing 36 bars had is harder at the same presses */
      if (g.rT !== undefined) {
        const WD = rules.W.d, rPred = Math.max(0, Math.min(0.9, g.rT - restPlan(g.rB0, g.rB1) + restPlan(w0, w1)));
        F *= (1 - WD * rPred) / (1 - WD * g.rT);
      }
      const db = sp.bar - w0, dw = db >= 8 ? dEst(w0, sp.bar) : null;
      if (dw && dw.aps > 0) F = (g.F * (W - db) + dw.D / dw.aps * db) / W;
      const target = 0.403 * Math.pow(1.1, lvs / W - 1) * g.kW, need = target / F * (W * 4 * 60 / BPM) - done;
      const per = need / Math.max(1, shape) * actsFor(sp.lv);
      return Math.max(0.6 * actsFor(sp.lv), Math.min(1.6 * actsFor(sp.lv) + 0.3, per));
    }
    /* the obstacle characters and bars of the last 36 bars that count for density (no breather, intro or warm-up) */
    function densHist() {
      let chars = 0, bars = 0;
      for (let i = g.chunks.length - 1; i >= 0 && bars < 36; i--) { const q = g.chunks[i]; if (q.ph === "rest" || q.ph === "intro" || q.bar < WARM || q.tpl === "last") continue; chars += q.obst; bars += q.bars; }
      return { chars: chars, bars: bars };
    }
    /* static rules of a candidate (no solve): density band, busy gaps across the seam, flat ground, height, signature */
    function staticOk(sp, cd) {
      const T = cd.t, H = cd.h, n = T.length, st = chartStats(T, H, 0);
      if (n !== sp.n * 8) return "length";
      if (cd.tpl === "flat") return "";
      const quiet = sp.ph === "rest" || sp.ph === "intro" || cd.tpl === "last";
      if (!quiet) {
        /* README › Density is an average over a minute: a chunk may stray by 0.8 a bar, and the last 36 bars with it
           must stay inside the band once there are 12 of them */
        const bd = band(sp.bar < WARM ? 3 : 12), per = st.obst / (n / 8), dh0 = densHist();
        if (per < bd.lo - 0.8 - 1e-9 || per > bd.hi + 0.8 + 1e-9) return "density " + per.toFixed(2);
        if (sp.bar >= WARM && dh0.bars >= 12) { const av = (dh0.chars + st.obst) / (dh0.bars + sp.n); if (av < bd.lo - 1e-9 || av > bd.hi + 1e-9) return "density avg " + av.toFixed(2); }
        /* gaps, counted on from the chunk before (after a breather it may stretch) */
        const lim = bd.gap * 2;
        let run = gapRun;
        for (let i = 0; i < n; i++) { if (busy(T, H, i)) { if (run + 1 > lim && !prevRest) return "gap"; run = 0; } else run++; }
        /* and leave the next chunk a start: its head adds one more empty cell */
        if (run > 2) return "gap end";
      }
      if (cd.tpl !== "last" && sp.ph !== "intro" && !(sp.ph === "rest" && L.base <= BAND[0] + 1)) {
        let fr = flatRun;
        for (let i = 0; i < n; i++) { if (TERRAIN.indexOf(T[i]) >= 0 || TILES.indexOf(H[i]) >= 0 || EDGES.indexOf(H[i]) >= 0) fr = 0; else fr++; if (fr > 3 * 8 - 2) return "flat"; }
        if (fr > 14 && !quiet) return "flat end";
      }
      let y = L.base; for (const ch of T) { y += dh(ch); if (y < BAND[0] || y > BAND[1]) return "band"; }
      if (!cd.safe && !quiet && sigs[cd.sig] !== undefined && sp.bar - sigs[cd.sig] < 180) return "repeat";
      return "";
    }
    /* compile a candidate on its own, at its place in the stream; check heights and that it keeps off its seams */
    function compileOk(cd) {
      const S = SIM.stream({ c0: L.cells, base: L.base, id: L.id, minY: MINY });
      /* with a bar of flat ground after it, in the same compile: the ground goes on past the seam as the next chunk's
         flat head will, and the two do not meet as separate segments (above a margin of 0.25 two segments of one
         height leave a hairline between them, which would make every chunk look tighter than it is) */
      let ch;
      try { ch = SIM.append(S, cd.t + "......../" + cd.h + "........", 1); } catch (e) { return { err: "compile " + e.message }; }
      ch = { x0: ch.x0, x1: ch.x0 + 2 * cd.t.length, lo: ch.lo, hi: ch.hi, b1: ch.b1 };
      if (ch.lo < BAND[0] || ch.hi > BAND[1] || ch.b1 < BAND[0] + 1 || ch.b1 > BAND[1] - 1) return { err: "band" };
      const x0 = ch.x0 + 1.2, x1 = ch.x1 - 1.2;
      for (const o of S.objs) if (o.x0 < x0 || o.x1 > x1) return { err: "seam" };
      for (const q of S.segs) if (q.kind && (q.x0 < x0 || q.x1 > x1)) return { err: "seam" };
      for (const z of S.zones) if (z.x0 < x0 || z.x1 > x1) return { err: "seam" };
      for (const r of S.rails) if (r.x0 < x0 || r.x1 > x1) return { err: "seam" };
      for (const c of S.coils) if (c.x0 < x0 || c.x1 > x1) return { err: "seam" };
      return { S: S, ch: ch };
    }

    /* the job: one chunk being validated, a few milliseconds at a time */
    function newJob() {
      const sp = spec();
      g.job = { sp: sp, a: 0, cd: null, S: null, srch: null, sol: null, t0: now(), avoid: {}, ms: 0, why: [] };
    }
    function reject(j, why) { j.sol = null; j.min = null; j.why.push(why); if (opt.trace) opt.trace(j, why); j.a++; j.cd = null; j.srch = null; j.S = null; g.stats.attempts++; }
    /* advance the job by up to `ticks` solver ticks; true when a chunk was appended */
    function advance(j, ticks) {
      if (!j.cd) {
        if (j.a >= KNOB_TRIES && j.lastTpl) j.avoid[j.lastTpl] = 1;
        const cd = candidate(j.sp, j.a, j.avoid);
        if (!cd || cd.err) { j.cd = cd && cd.last; reject(j, cd ? cd.err : "no piece"); return false; }
        j.lastTpl = cd.tpl;
        const cc = compileOk(cd);
        if (cc.err) { reject(j, cc.err); return false; }
        j.cd = cd; j.S = cc.S; j.ch = cc.ch;
        const T1 = j.ch.x1 / DX;
        j.srch = SIM.search(j.S, MARGIN, DEC, cleanState(g.s), function (s) { return s.tick < T1 ? undefined : calm(s); });
        j.used = 0;
      }
      if (j.min) {
        let used = 0;
        while (used < ticks) { const u = j.min.step(); if (u < 0) return accept(j, j.min.path, j.solSteps, j.min.acts); used += u; }
        return false;
      }
      const r = j.srch.run(ticks);
      j.used += ticks;
      if (!r) { if (j.used > (j.sol ? j.probeBudget : BUDGET)) { if (j.sol) reject(j, "tight"); else reject(j, "budget"); } return false; }
      if (!r.ok) { reject(j, (j.sol ? "tight " : "unsolved ") + r.cause); return false; }
      if (!j.sol && j.sp.ph !== "rest" && j.cd.tpl !== "flat") {
        /* easy to run through: the chunk must also solve with a wider margin, so no minute gets one tight spot that
           would raise its D (README › Infinite Shadow). The path played is still the one found at 0.08 */
        j.sol = r; j.probeBudget = Math.max(15000, 3 * r.steps); j.used = 0;
        const T1 = j.ch.x1 / DX;
        j.srch = SIM.search(j.S, EASY, DEC, cleanState(g.s), function (s) { return s.tick < T1 ? undefined : calm(s); });
        return false;
      }
      if (!j.min) {
        const sol = j.sol || r;
        j.min = minimizer(j.S, cleanState(g.s), sol.path, j.ch.x0 / DX, j.ch.x1 / DX); j.solSteps = sol.steps;
      }
      return false;
    }
    /* the path made locally minimal, and its actions, exactly as tools/difficulty.js counts them: every hold the path can
       do without is dropped, a slide joins the slide before when that still wins, then the presses and the releases
       whose timing matters (letting go half a beat later loses). One replay a step, so no frame waits on it */
    function minimizer(S, s0, p0, T0, T1) {
      const p = p0.slice(), acts = [], n = p.length;
      const wins = function (q) {
        const s = SIM.clone(s0);
        for (let i = 0; i < q.length && !s.dead; i++) for (let k = 0; k < DEC && !s.dead; k++) SIM.step(S, s, q[i] & 1, q[i] & 2, MARGIN);
        return !s.dead && s.tick === T1 && calm(s);
      };
      let stage = 0, bit = 1, i = 0, changed = false, merge = -1, prev = 0, tj = 0, ts = 0;
      /* one test; returns the ticks it simulated, or -1 once finished */
      function step() {
        if (stage === 0) {
          for (;;) {
            if (i >= n) { if (bit === 1) { bit = 2; i = 0; continue; } if (changed) { changed = false; bit = 1; i = 0; continue; } stage = 1; i = 0; return 0; }
            if (!(p[i] & bit) || (i && (p[i - 1] & bit))) { i++; continue; }
            break;
          }
          let e = i; while (e + 1 < n && (p[e + 1] & bit)) e++;
          if (merge < 0) {
            const q = p.slice(); for (let k = i; k <= e; k++) q[k] &= ~bit;
            if (wins(q)) { for (let k = i; k <= e; k++) p[k] = q[k]; changed = true; i = e + 1; return n * DEC; }
            let a = i - 1; while (a >= 0 && !(p[a] & bit)) a--;
            if (bit === 2 && a >= 0 && (i - a) * DEC <= TPB) { merge = a; return n * DEC; }
            i = e + 1; return n * DEC;
          }
          const r = p.slice(); for (let k = merge + 1; k < i; k++) r[k] |= bit;
          if (wins(r)) { for (let k = merge + 1; k < i; k++) p[k] = r[k]; changed = true; }
          merge = -1; i = e + 1; return n * DEC;
        }
        if (i > n) return -1;
        const v = i < n ? p[i] : 0, t = T0 + i * DEC;
        let used = 0;
        const matters = function (b) {
          let k = i; const lim = i + Math.round(TPB / 2 / DEC);
          while (k < n && k < lim && !(p[k] & b)) k++;
          if (k === i) return false;
          const q = p.slice(); for (let x = i; x < k && x < q.length; x++) q[x] |= b;
          used += n * DEC; return !wins(q);
        };
        if ((v & 1) && !(prev & 1)) { acts.push({ t: t, k: "jump" }); tj = t; }
        else if (!(v & 1) && (prev & 1) && t - tj >= TPB / 2 && matters(1)) acts.push({ t: t, k: "drop" });
        if ((v & 2) && !(prev & 2)) { acts.push({ t: t, k: "slide" }); ts = t; }
        else if (!(v & 2) && (prev & 2) && t - ts >= TPB / 2 && matters(2)) acts.push({ t: t, k: "release" });
        prev = v; i++;
        return used;
      }
      return { step: step, path: p, acts: acts };
    }
    /* replay at margin 0, the view rule and the chunk's place in the wave; then append it to the run */
    function accept(j, path, steps, minActs) {
      const s = cleanState(g.s), sts = [];
      for (let i = 0; i < path.length; i++) {
        for (let k = 0; k < DEC; k++) SIM.step(j.S, s, path[i] & 1, path[i] & 2, 0);
        const zs = j.S.zb[Math.floor(s.tick * DX / 4)] || [];
        let th = false; for (const z of zs) if (z.k === "T" && s.tick * DX >= z.x0 && s.tick * DX < z.x1) th = true;
        sts.push({ hang: s.hang, ch: s.ch, th: th });
      }
      if (!calm(s)) { reject(j, "replay " + (s.dead || "not calm")); return false; }
      const t0 = j.ch.x0 / DX, acts = minActs || pressList(path, t0, [{ hang: -1, ch: 0 }].concat(sts));
      const sp = j.sp, per = acts.length / sp.n, want = sp.want;
      if (sp.ph === "rest" && acts.length) { reject(j, "rest has input"); return false; }
      if (!j.cd.safe && sp.ph !== "rest" && sp.ph !== "intro" && j.a < KNOB_TRIES + TPL_TRIES) {
        /* the density band alone asks for about 1.5 presses a bar, so the cap never goes under 1.75 */
        const hi = Math.max(sp.n <= 2 ? 2.25 : 2, want * 1.3 + 0.2), lo = want * 0.65 - 0.1;
        if (per > hi) { reject(j, "too many actions " + per.toFixed(2)); return false; }
        if (per < lo && sp.bar >= WARM) { reject(j, "too few actions " + per.toFixed(2)); return false; }
      }
      const vw = view(j.S, acts, true);
      if (vw.worst > vw.max || vw.late.length) { reject(j, "view"); return false; }
      /* the minute's guard: once two thirds of a minute are made, a chunk may not take that minute's D out of the band
         (README › Infinite Shadow). It is tried again with fewer presses (or more, for the last chunk of a minute that
         came out too easy); the last template tries are free of it, so the guard never forces the safe generator */
      if (!j.cd.safe && sp.ph !== "rest" && sp.ph !== "intro" && j.a < KNOB_TRIES + TPL_TRIES - 2 && sp.bar >= 36) {
        const MW = BPM / 4, w0 = Math.floor(sp.bar / MW) * MW, end = Math.min(sp.bar + sp.n, w0 + MW);
        if (end - w0 >= 24) {
          g.chunks.push({ bar: sp.bar, bars: sp.n, ph: sp.ph, lv: sp.lv, acts: acts.map(function (a) { return a.t; }), hz: hazards(j.S).filter(function (h) { return h.x0 < j.ch.x1; }) });
          const dm = dEst(w0, end); g.chunks.pop();
          if (dm && dm.D > D_HI - 0.03) { sp.want *= 0.85; reject(j, "minute D " + dm.D.toFixed(3)); return false; }
          /* on the low side, as if every chunk of the minute kept the most slack D counts (0.3, not the 0.2 each one is
             probed at), which takes a tenth off */
          if (dm && end === w0 + MW && w0 >= 2 * MW && dm.D / 1.1 < D_LO + 0.01) { sp.want *= 1.15; reject(j, "minute D " + dm.D.toFixed(3)); return false; }
        }
      }
      /* append for real, and replay the path on the real stream from the real seam state */
      const cd = j.cd, ch = SIM.append(L, cd.t + "/" + cd.h, sp.energy);
      const st = cleanState(g.s); st.ev = [];
      const evs = {};
      for (let i = 0; i < path.length; i++) for (let k = 0; k < DEC; k++) { SIM.step(L, st, path[i] & 1, path[i] & 2, 0); for (const e of st.ev) evs[e] = (evs[e] || 0) + 1; st.ev.length = 0; }
      if (!calm(st) || st.tick !== s.tick || st.y !== s.y) throw new Error("INF: chunk " + sp.i + " plays differently in the stream (seed " + seed + ")");
      st.ev = null; st.dyn = {};
      g.s = st;
      for (const v of path) g.path.push(v);
      /* memory */
      const T = cd.t, H = cd.h, cs = chartStats(T, H, 0);
      let rolls = 0, jumps = 0; acts.forEach(function (a) { if (a.k === "slide") rolls++; else if (a.k === "jump") jumps++; });
      const meta = { i: sp.i, bar: sp.bar, bars: sp.n, c0: ch.c0, x0: ch.x0, x1: ch.x1, ph: sp.ph, energy: sp.energy, lv: sp.lv, tpl: cd.tpl, haz: cd.haz, combo: cd.combo,
        sig: cd.sig, obst: cs.obst, acts: acts.map(function (a) { return a.t; }), kinds: acts.map(function (a) { return a.k; }), safe: cd.safe, attempts: j.a + 1, dy: ch.b1 - ch.b0,
        over: Math.round(cs.over * cs.busy.length), busy: cs.busy.length, rolls: rolls, jumps: jumps, ms: j.ms, ev: evs, T: T, H: H, steps: steps || 0 };
      meta.hz = hazards(j.S).filter(function (h) { return h.x0 < ch.x1; });
      if (cd.combo) { const hz = meta.hz; meta.cx0 = hz.length ? hz[0].x0 : ch.x0; meta.cx1 = hz.length ? Math.max.apply(null, hz.map(function (h) { return h.x1; })) : ch.x1; }
      g.chunks.push(meta);
      if (cd.haz.length) { recent.push(cd.haz); if (recent.length > 4) recent.shift(); cd.haz.forEach(function (k) { lastHaz[k] = sp.bar; }); }
      lastTpl[cd.tpl] = sp.bar; sigs[cd.sig] = sp.bar; lastKn[cd.tpl] = cd.kn;
      for (let i = 0; i < T.length; i++) { if (TERRAIN.indexOf(T[i]) >= 0 || TILES.indexOf(H[i]) >= 0 || EDGES.indexOf(H[i]) >= 0) flatRun = 0; else flatRun++; if (busy(T, H, i)) gapRun = 0; else gapRun++; }
      prevRest = sp.ph === "rest" || cd.tpl === "last";
      g.bars += sp.n; g.stats.chunks++; g.stats.attempts++;
      /* D of the last 36 bars, the way tools/difficulty.js scores a minute (slack taken as the 0.2 every chunk keeps),
         against D of the levels their waves aim at: the next chunks' presses are scaled to close the gap */
      const de = dEst();
      if (de && de.aps > 0) { g.F = de.D / de.aps; g.rT = de.rest; g.rB0 = de.b0; g.rB1 = de.b1; }
      /* a minute just finished: how far it landed from its target corrects the next ones (slowly; it removes the
         small bias between this estimate and the full measure) */
      const W = BPM / 4;
      if (Math.floor(g.bars / W) > Math.floor((g.bars - sp.n) / W) && g.bars >= 2 * W) {
        const w1 = Math.floor(g.bars / W) * W, de2 = dEst(w1 - W, w1);
        if (de2) g.kW = Math.max(0.8, Math.min(1.2, g.kW * Math.pow(de2.target / de2.D, 0.4)));
      }
      if (cd.safe) { g.stats.fallbacks++; g.log.push({ i: sp.i, bar: sp.bar, why: j.why.slice() }); }
      g.stats.ms.push(j.ms);
      g.job = null;
      return true;
    }
    /* generate for up to `ms` milliseconds (the game: a few a frame), or until `bars` are ready */
    g.work = function (ms, bars) {
      const end = now() + ms;
      let added = 0;
      while (now() < end && !(bars !== undefined && g.bars >= bars)) {
        if (!g.job) newJob();
        /* a step sized to the time left, from the measured simulation speed (a slow phone runs a quarter as many ticks) */
        const j = g.job, t = now(), q = Math.max(48, Math.min(2400, Math.round(g.rate * Math.max(0.2, end - t))));
        const done = advance(j, q);
        const dt = now() - t;
        j.ms += dt;
        if (dt > 0.05 && j.srch) g.rate += (q / dt - g.rate) * 0.2;
        if (done) added++;
      }
      return added;
    };
    /* synchronously, until `bars` bars are ready (tools, and the start of a run) */
    g.fill = function (bars) { while (g.bars < bars) g.work(1e9, bars); return g; };
    /* the buffer ran low: one plain chunk now, without the solver's search (an empty-of-input breather always solves) */
    g.emergency = function () {
      g.job = null; const sp = spec(); sp.ph = "rest"; sp.n = 1; sp.energy = 1;
      g.job = { sp: sp, a: KNOB_TRIES + TPL_TRIES + SAFE_TRIES, cd: null, avoid: {}, ms: 0, why: ["emergency"] };
      while (!advance(g.job, 1e9)) { /* the breather has no input: the first path the search tries */ }
      g.stats.emergency++; g.log.push({ i: sp.i, bar: sp.bar, why: ["emergency"] });
    };
    /* forget the heavy parts of chunks that ended before `bar` (their charts, hazards and actions): a run's memory stays
       flat; what the music and the score still read (bar, x, phase, combo, hazards' kinds) is kept */
    g.prune = function (bar) {
      bar = Math.min(bar, g.bars - 80);   /* the difficulty control reads the last 36 bars, the combo rate the last 72 */
      for (let i = g.pruned || 0; i < g.chunks.length; i++) {
        const c = g.chunks[i]; if (c.bar + c.bars >= bar) { g.pruned = i; return; }
        c.T = c.H = null; c.hz = null; c.acts = c.kinds = null; c.ev = null;
      }
    };
    g.chunkAt = function (x) { const C = g.chunks; let lo = 0, hi = C.length - 1; while (lo < hi) { const md = (lo + hi + 1) >> 1; if (C[md].x0 <= x) lo = md; else hi = md - 1; } return C[lo]; };
    return g;
  }

  return { BPM: BPM, DEC: DEC, MARGIN: MARGIN, BAND: BAND, WARM: WARM, RAMP: RAMP, create: create, rules: rules, TPL: TPL, COMBO: COMBO, COMPAT: COMPAT,
    PLAIN: PLAIN, TIER: TIER, FAM: FAM, MOTIF: MOTIF, PHASE: PHASE, baseLv: baseLv, actsFor: actsFor, calm: calm, rng: rng, mix: mix };
})();
