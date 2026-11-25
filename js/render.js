/* ---- render.js ---- */
/* ============================================================================
   RENDER — "fog silhouette": a pale misty sky, five layers of grey
   silhouettes that fade with distance, pure black terrain with rough cliff
   faces and foliage, a solid black stickman, and colour only where a hazard
   lives. Hazards are drawn last-but-player, on top of every fog layer.
   RENDER draws the game on the full-screen canvas. RENDER.create(fit) makes
   another, independent renderer (its own canvas, camera, particles and runner
   animation) for a fixed-size view such as the hazard preview in a card:
   fit = { w, h (CSS px), dpr, sc (px per unit), px, gy (runner x and ground y
   as shares of w and h), top (px kept clear above the runner's head) }.
   ========================================================================== */
const RENDER = (function make(fit) {
  "use strict";
  const TAU = Math.PI * 2, CH = SIM.CH;
  const COL = {}; HAZ.forEach(function (h) { COL[h.k] = h.col; }); COL["2"] = COL["1"]; COL.em = COL.ey; COL.ga = COL.ke;
  const SPK = { thorn: "thorn", antenna: "mast", post: "mast", cog: "tri", fence: "tri", cactus: "cactus", ice: "shard", stake: "tri", crystal: "shard",
    rebar: "mast", coral: "coral", rock: "shard", cone: "cone", bone: "bone", flame: "flame", candle: "flame", quill: "thorn", insul: "mast", pot: "cone", spear: "tri" };
  const BAR = { trunk: "pillar", lintel: "pillar", pipe: "pipe", chain: "chain", hook: "chain", piston: "piston", cloth: "cloth", stal: "stal", vine: "stal", beam: "beam" };
  const AMB = { leaves: [0, -1.2, .7, 1], petals: [0, -.8, .5, 1], confetti: [0, -.3, .9, 1], paper: [0, -.5, .35, 1.6], dust: [1, -.25, .05, .5], ash: [1, -.3, .3, .6],
    stars: [1, 0, 0, .5], embers: [1, -.2, -.7, .6], sparks: [1, -.6, -1.1, .5], snow: [1, -.5, .6, .7], rain: [2, -3, 9, 1], bubbles: [3, -.1, -.6, 1], steam: [3, -.2, -.5, 1.6], gulls: [4, -.9, 0, 1] };

  /* ---------------- fog palette ---------------- */
  const FOG = {
    sky: ["#EFEFEF", "#FBFBFB", "#FFFFFF"],                          /* top -> mid -> horizon */
    layers: ["#E2E2E2", "#CDCDCD", "#B2B2B2", "#8E8E8E", "#5E5E5E"], /* far -> near */
    mist: "rgba(255,255,255,0.55)",                                  /* fog band wash */
    ground: "#000000",
    rim: "rgba(255,255,255,0.22)"                                    /* light rim on black silhouettes */
  };
  /* per-level tint, render-only (never in LEVELS): a few RGB steps, < 8% saturation */
  const TINT = { cool: [-5, -1, 5], warm: [6, 1, -5], reef: [-7, 0, 6] };
  const MOOD = { 7: "cool", 9: "cool", 12: "cool", 13: "cool", 28: "cool", 11: "reef", 3: "warm", 6: "warm", 10: "warm", 20: "warm", 27: "warm" };
  const LAST = { sky: ["#B6B6B6", "#CFCFCF", "#E8E8E8"], layers: ["#F4F4F4", "#ABABAB", "#8E8E8E", "#6B6B6B", "#3E3E3E"], mist: "rgba(232,232,232,0.5)" };
  /* organic worlds get broad canopy trees (or their own big plant) on the nearest backdrop layer */
  const ORG = { 1: "canopy", 5: "canopy", 8: "canopy", 16: "canopy", 17: "canopy", 11: "kelp", 6: "palms" };
  /* backdrop layers far -> near: size, parallax factor, baseline lift (units), loop width (units), softness */
  const LAY = [{ s: .4, f: .05, up: 1.7, w: 100, soft: 1.5 }, { s: .5, f: .1, up: 1.15, w: 84, soft: 1 }, { s: .62, f: .18, up: .7, w: 66 },
    { s: .8, f: .26, up: .32, w: 54 }, { s: 1, f: .34, up: 0, w: 46 }];
  /* foliage family per ground style */
  const FOL = { grass: "tuft", tiles: "tuft", bricks: "tuft", snow: "snow", sand: "dry", roof: "ind", rivets: "ind", girder: "ind", train: "ind", hull: "ind",
    planks: "ind", rock: "peb", obsidian: "peb", checker: "cand", books: "cand" };
  const RM = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const hexRGB = function (h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const rgbHex = function (v) { return "#" + v.map(function (c) { c = Math.max(0, Math.min(255, Math.round(c))); return (c < 16 ? "0" : "") + c.toString(16); }).join(""); };
  const mixHex = function (a, b, t) { const x = hexRGB(a), y = hexRGB(b); return rgbHex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; })); };
  function palette(n) {
    const base = n === 30 ? LAST : FOG, t = TINT[MOOD[n]] || [0, 0, 0];
    const tone = function (h) { const v = hexRGB(h), k = (v[0] + v[1] + v[2]) / 765; return rgbHex(v.map(function (c, i) { return c + t[i] * (.35 + .65 * k); })); };
    const m = base.mist.match(/[\d.]+/g).map(Number);
    return { sky: base.sky.map(tone), layers: base.layers.map(tone), mist: [m[0] + t[0], m[1] + t[1], m[2] + t[2]].map(function (c) { return Math.max(0, Math.min(255, c)); }).concat(m[3]) };
  }

  let cv, g, W = 0, H = 0, dpr = 1, sc = 32, px0 = 0, gy = 0, camX = 0, camY = 0, shake = 0, L = null, th = null, seed = 1, lvN = 1, pal = palette(1);
  let home = false, glows = {}, fx = [], lastCamX = 0, si = 0, oi = 0, tNow = 0, pulse = 0, quality = 1, zLines = [];
  /* the world being drawn (a level's look), and for The Convergence the biome source and what is visible: A at the
     left edge, B at the right, xf the fracture between them (null when there is none on screen) */
  let cw = null, conv = null, wA = null, wB = null, xf = null, fmix = 0, POPFONT = "monospace";
  const worlds = [];

  const hsh = function (n) { let x = Math.imul((n | 0) ^ 0x9E3779B9, 0x85EBCA6B); x ^= x >>> 13; x = Math.imul(x, 0xC2B2AE35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
  const X = function (wx) { return px0 + (wx - camX) * sc; };
  const Y = function (wy) { return gy - (wy - camY) * sc; };
  function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }
  function glowSprite(col) {
    if (glows[col]) return glows[col];
    const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(col, .62)); gr.addColorStop(.45, rgba(col, .24)); gr.addColorStop(1, rgba(col, 0));
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return (glows[col] = c);
  }
  function glow(col, x, y, r) { g.drawImage(glowSprite(col), x - r, y - r, r * 2, r * 2); }

  function resize(canvas) {
    cv = canvas || cv; if (!cv) return;
    W = fit ? fit.w : window.innerWidth; H = fit ? fit.h : window.innerHeight;
    const mobile = Math.min(W, H) < 700;
    dpr = fit ? fit.dpr : Math.min(window.devicePixelRatio || 1, mobile ? 2 : 2) * quality;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g = cv.getContext("2d", { alpha: false });
    sc = fit ? fit.sc : Math.max(W / 26, Math.min(W / 15, H / 14));
    const portrait = H > W;
    if (fit) { px0 = W * fit.px; gy = H * fit.gy; }
    else { px0 = W * (home ? .2 : portrait ? .24 : .28); gy = H * (home ? (portrait ? .8 : .84) : portrait ? .66 : .72); }
    /* a world is rebuilt only when what its strips depend on changed (its key: size, ground line, scale); a new pixel
       ratio alone (the low-quality fallback) keeps them, so it never stalls a run */
    if (cw) buildWorld(cw, Infinity);
  }

  /* ---------------- worlds ----------------
     A world is one level's look: its theme tuple, palette, the five backdrop strips, sky, mist and wisp sprites, its
     ambient particles and wisps. A level shows one. The Convergence (Infinite Shadow) passes through all 30 and shows two
     around a fracture; built worlds are kept (at most three: the one on screen, the next and the last), the oldest dropped
     first, and the next one is built a layer a frame while it is still far off, so a fracture never waits on it. */
  function makeWorld(n, theme, sd, fast) {
    const w = { n: n, th: theme, seed: sd, fast: !!fast, pal: palette(n), strips: [], key: "", done: 0, job: null, sky: null, mist: null, wisp: null, amb: [], wisps: [], used: 0, frame: -9, motif: null };
    const A = AMB[theme[5]] || AMB.dust;
    for (let i = 0; i < 44; i++) w.amb.push({ x: hsh(i * 3 + 1) * 1.2, y: hsh(i * 5 + 2), z: .4 + hsh(i * 7) * .9, p: hsh(i * 11) * TAU, a: A });
    for (let i = 0; i < 4; i++) w.wisps.push({ x: hsh(i * 13 + sd) * 1.4 - .2, y: .4 + hsh(i * 17 + 2) * .38, w: 6 + hsh(i * 19) * 5, h: .8 + hsh(i * 23) * .8, a: .08 + hsh(i * 29) * .07, v: .006 + hsh(i * 31) * .01 });
    return w;
  }
  /* the world for (n, theme, seed), built or not. At most three are kept: past that, the least recently used goes, never
     the one just asked for and never one drawn or asked for this frame or the last (then the cache stays one bigger for a
     moment). A world let go gives back its canvases at once: iOS keeps a canvas's memory until it is collected */
  let frameNo = 0;
  function worldFor(n, theme, sd, fast) {
    let w = null;
    for (const x of worlds) if (x.n === n && x.th === theme && x.seed === sd && x.fast === !!fast) w = x;
    if (!w) {
      w = makeWorld(n, theme, sd, fast); worlds.push(w);
      if (worlds.length > 3) {
        let old = null;
        for (const x of worlds) if (x !== w && x.frame < frameNo - 1 && (!old || x.used < old.used)) old = x;
        if (old) { worlds.splice(worlds.indexOf(old), 1); dropWorld(old); }
      }
    }
    w.used = msNow(); w.frame = frameNo;
    return w;
  }
  function dropWorld(w) {
    const free = function (c) { if (c) c.width = c.height = 0; };
    w.strips.forEach(free); free(w.sky); free(w.mist); free(w.wisp); free(w.motifCv);
    w.strips = []; w.sky = w.mist = w.wisp = w.motifCv = null; w.key = ""; w.done = 0; w.job = null;
  }
  /* which generators feed each of the five layers */
  function layerGens(w, i) {
    const a = w.th[0], b = w.th[1], org = ORG[w.n], S = w.seed;
    switch (i) {
      case 0: return w.n === 30 ? [["ringsun", S * 7 + 1, 1, 1.5]] : [["hills", S * 3 + 2, 1, 1]].concat(org ? [["spire", S * 5 + 9, 1, 1]] : [], [[a, S * 7 + 1, 1.3, 1]]);
      case 1: return w.n === 30 ? [["shards", S * 11 + 3, 1.4, 1]] : org === "canopy" ? [[a, S * 7 + 4, 2, .9], ["canopy", S * 19 + 7, .65, .6]] : [[a, S * 7 + 4, 1, 1]];
      case 2: return [[b, S * 13 + 5, 1, 1]];
      case 3: return [[b, S * 17 + 11, 1.6, 1.15, 4]];
      default: return org ? [[org, S * 23 + 13, org === "canopy" ? 1.8 : 3, org === "canopy" ? 1 : 1.5, 9]] : [[b, S * 29 + 17, 2.6, 1.25, 15]];
    }
  }
  /* build a world's strips and sprites for the current size, for up to `ms` milliseconds (Infinity: all of it now); true
     when it is complete. A strip is a BACKDROPS.job of small steps, so a world can be built across many frames */
  const msNow = function () { return performance.now(); };
  function buildWorld(w, ms) {
    const key = "fog5|" + w.th[0] + w.th[1] + w.seed + "|" + w.n + "|" + W + "x" + H + "|" + gy.toFixed(2) + "|" + sc.toFixed(3);
    if (key !== w.key) { w.key = key; w.done = 0; w.job = null; }
    const bs = sc > 50 ? 1 : 1.5, hpx = (gy + sc * 2.6) * bs, pal = w.pal, end = msNow() + ms;
    while (w.done < 6) {
      const i = w.done;
      if (i < 5) {
        const l = LAY[i], tone = pal.layers[i];
        if (!w.job) w.job = BACKDROPS.job({ gens: layerGens(w, i), widthU: l.w, hPx: hpx, groundPx: (gy - l.up * sc) * bs, u: sc * l.s * bs,
          tone: tone, dark: mixHex(tone, "#000000", .1), light: mixHex(tone, pal.sky[2], .45), mist: pal.mist, soft: l.soft || 0, minLine: i < 2 ? .05 : 0, fast: w.fast });
        const out = w.job.step(Math.max(0.5, end - msNow()));
        if (!out) return false;
        w.strips[i] = out; w.job = null; w.done++;
        if (msNow() >= end) break;
        continue;
      }
      w.done++;
      w.strips.bs = bs;
      /* sky: vertical gradient + wide soft horizon glow, at half size and upscaled (gradients scale cleanly) */
      const sw = Math.max(8, Math.ceil(W / 2)), sh = Math.max(8, Math.ceil(H / 2));
      w.sky = document.createElement("canvas"); w.sky.width = sw; w.sky.height = sh;
      let c = w.sky.getContext("2d"), gr = c.createLinearGradient(0, 0, 0, sh);
      gr.addColorStop(0, pal.sky[0]); gr.addColorStop(.38, pal.sky[1]); gr.addColorStop(.6, pal.sky[2]); gr.addColorStop(1, pal.sky[2]);
      c.fillStyle = gr; c.fillRect(0, 0, sw, sh);
      c.save(); c.translate(sw / 2, sh * .6); c.scale(1, .42);
      gr = c.createRadialGradient(0, 0, 0, 0, 0, sw * .62); gr.addColorStop(0, rgba(pal.sky[2], .95)); gr.addColorStop(.55, rgba(pal.sky[2], .45)); gr.addColorStop(1, rgba(pal.sky[2], 0));
      c.fillStyle = gr; c.fillRect(-sw, -sh * 3, sw * 2, sh * 6); c.restore();
      /* mist band (drawn between layers) and soft wisp sprite */
      const mc = "rgba(" + pal.mist[0] + "," + pal.mist[1] + "," + pal.mist[2] + ",";
      w.mist = document.createElement("canvas"); w.mist.width = 2; w.mist.height = 64;
      c = w.mist.getContext("2d"); gr = c.createLinearGradient(0, 0, 0, 64);
      gr.addColorStop(0, mc + "0)"); gr.addColorStop(.62, mc + ".42)"); gr.addColorStop(1, mc + "0)");
      c.fillStyle = gr; c.fillRect(0, 0, 2, 64);
      w.wisp = document.createElement("canvas"); w.wisp.width = w.wisp.height = 64;
      c = w.wisp.getContext("2d"); gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, mc + "1)"); gr.addColorStop(.5, mc + ".55)"); gr.addColorStop(1, mc + "0)");
      c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
    }
    return w.done >= 6;
  }
  function useWorld(w) { cw = w; th = w.th; seed = w.seed; lvN = w.n; pal = w.pal; buildWorld(w, Infinity); }
  function levelOf(theme) { for (let i = 0; i < LEVELS.length; i++) if (LEVELS[i].th === theme) return LEVELS[i].n; return 1; }
  /* render-only caches on a compiled level: exposed cliff faces and where foliage must stay away from hazards
     (fm, from x = L.fmx in quarter units) */
  function decorate(L) {
    if (L.deco && !L.stream) return; L.deco = true;
    const plain = L.segs.filter(function (q) { return !q.kind; });
    plain.forEach(function (q) { q.ln = q.rn = undefined; });
    for (let i = 0; i < plain.length; i++) for (let k = i + 1; k < plain.length; k++) {
      const a = plain[i], b = plain[k]; if (b.x0 > a.x1 + 1e-6) break;
      if (Math.abs(b.x0 - a.x1) > 1e-6) continue;
      /* neighbour edge, in the same orientation, or null where that side is open */
      if (!a.flip) a.rn = b.flip ? b.fb : b.top; else a.rn = b.flip ? 2 * b.fb + CH - b.top : null;
      if (!b.flip) b.ln = a.flip ? a.fb : a.top; else b.ln = a.flip ? 2 * a.fb + CH - a.top : null;
    }
    plain.forEach(function (q) { if (q.ln === undefined) q.ln = null; if (q.rn === undefined) q.rn = null; });
    const x0 = L.stream ? (L.segs.length ? L.segs[0].x0 : 0) - 64 : -64, x1 = L.stream ? (L.segs.length ? L.segs[L.segs.length - 1].x1 : 0) + 64 : L.endX + 416;
    const fm = new Uint8Array(Math.ceil((x1 - x0) * 4)), mark = function (a, b) { for (let i = Math.max(0, Math.floor((a - .6 - x0) * 4)); i <= Math.ceil((b + .6 - x0) * 4) && i < fm.length; i++) fm[i] = 1; };
    L.objs.forEach(function (o) { mark(o.x0, o.x1); });
    L.segs.forEach(function (q) { if (q.kind) mark(q.x0, q.x1); });
    L.coils.forEach(function (c) { mark(c.x0, c.x1); });
    L.fm = fm; L.fmx = x0;
  }
  /* the base of the Zenith zone a flipped thing sits in, the rolling blades, cliff faces and props: for a level once,
     for a stream again after every append and trim (it holds only a few screens, so this stays cheap) */
  function dress(L) {
    const zb = function (x) { for (const z of L.zones) if (z.k === "Z" && x >= z.x0 && x < z.x1) return z.base; return 0; };
    L.segs.forEach(function (s) { if (s.flip) s.fb = zb((s.x0 + s.x1) / 2); });
    L.objs.forEach(function (o) { if (o.flip) o.fb = zb(o.x); });
    L.rails.forEach(function (o) { if (o && o.flip) o.fb = zb(o.x0 + .1); });
    L.coils.forEach(function (o) { if (o.flip) o.fb = zb(o.x0 + .1); });
    L.blades = L.objs.filter(function (o) { return o.v === "rb"; });
    decorate(L);
    /* props sit where the chart is quiet */
    L.props = [];
    const quietProps = function (T, H, c0, n) {
      for (let i = 2; i < n - 2; i++) {
        let quiet = true; for (let k = -1; k <= 2; k++) if (T[i + k] !== "." || H[i + k] !== ".") quiet = false;
        const gi = c0 + i;
        if (quiet && hsh(gi * 31 + seed) < .5) L.props.push({ x: gi * 2 + 1 + hsh(gi) * .6, y: L.baseAt(gi * 2 + 1.3), v: hsh(gi * 7 + 3), flip: false });
      }
    };
    if (L.stream) L.chunks.forEach(function (ch) { quietProps(ch.T, ch.H, ch.c0, ch.n); });
    else quietProps(L.T, L.H, 0, L.cells);
    if (!L.stream || L.chunks.length && L.chunks[0].c0 === 0) for (let x = -40; x < 0; x += 5) L.props.push({ x: x + hsh(x) * 2, y: 0, v: hsh(x * 3 + 1) });
  }
  function setLevel(level, theme, sd, src) {
    L = level; si = 0; oi = 0; fx.length = 0; camY = 0; lastCamX = 0;
    conv = src || null; wA = wB = null; xf = null; fmix = 0;
    seed = sd || 1;
    if (conv) { const b = conv(0); theme = LEVELS[b.w - 1].th; useWorld(worldFor(b.w, theme, b.w * 101, true)); }
    else useWorld(worldFor(levelOf(theme), theme, seed));
    seed = sd || 1;
    dress(L);
  }

  /* ---------------- drawing helpers (unit space, y up) ---------------- */
  function at(x, y, flip, fb) {
    g.save();
    if (flip) { g.translate(X(x), Y(2 * fb + CH - y)); g.scale(sc, sc); } else { g.translate(X(x), Y(y)); g.scale(sc, -sc); }
  }
  /* black silhouette with a thin light rim just inside its edge; `base` hides the rim where the shape sits on the ground */
  function ink(base) {
    g.lineJoin = "round"; g.fillStyle = "#000"; g.fill();
    g.save(); g.clip(); g.lineWidth = .07; g.strokeStyle = FOG.rim; g.stroke();
    if (base) { g.fillStyle = "#000"; g.fillRect(-9, -1, 18, 1.07); }
    g.restore();
  }
  function poly(p) { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.closePath(); }
  function wline(p, w) { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.lineWidth = w || .05; g.strokeStyle = "rgba(255,255,255,.14)"; g.stroke(); }

  function spike(style, w, h, id) {
    const hw = w / 2 + .08, hh = h + .12, t = tNow;
    switch (SPK[style] || "tri") {
      case "thorn":
        for (let i = 0; i < 3; i++) { const x = (i - 1) * hw * .62, k = (i - 1) * .22; g.beginPath(); g.moveTo(x - hw * .34, 0); g.quadraticCurveTo(x - hw * .1 + k, hh * .6, x + k * 1.6, hh * (i === 1 ? 1 : .78)); g.quadraticCurveTo(x + hw * .2 + k, hh * .5, x + hw * .34, 0); g.closePath(); ink(1); }
        break;
      case "shard":
        poly([-hw, 0, -hw * .55, hh * .7, -hw * .2, hh * .45, .05, hh, hw * .35, hh * .5, hw * .7, hh * .78, hw, 0]); ink(1); wline([.05, hh * .92, -.05, .1], .04);
        break;
      case "mast":
        poly([-.1, 0, -.07, hh, .07, hh, .1, 0]); ink(1); poly([-hw, 0, -hw * .7, .16, hw * .7, .16, hw, 0]); ink(1);
        for (let i = 1; i <= 2; i++) { const y = hh * (.3 + i * .22), ww = hw * (1.1 - i * .3); poly([-ww, y - .04, ww, y - .04, ww, y + .04, -ww, y + .04]); ink(1); }
        g.beginPath(); g.arc(0, hh + .04, .11, 0, TAU); ink(1);
        break;
      case "cactus": {
        /* saguaro, one outline so the rim has no seam where an arm joins: a trunk with a domed top, two arms that leave it
           as a rounded elbow and turn up, at different heights. The arms reach the hitbox width plus the usual margin
           (hw), up to 0.5 past the trunk; trunk and arms slim down on narrow hitboxes so a gap still shows between them */
        const t = Math.min(.2, hw * .36), R = Math.min(hw, t + .5), aw = Math.min(.17, t * .9, hh * .16), hi = hsh(id * 7 + 1) < .5 ? -1 : 1;
        const arm = function (d, yb, yt) {
          const ro = Math.min(aw, (R - t) * .7), ri = Math.max(0, Math.min(aw * .55, R - aw - t - .01, yt - aw * 1.5 - yb)), xo = d * R, xi = d * (R - aw);
          if (d < 0) {   /* left arm, drawn going up the trunk */
            g.lineTo(-t, yb); g.lineTo(xo + ro, yb); g.quadraticCurveTo(xo, yb, xo, yb + ro); g.lineTo(xo, yt - aw / 2);
            g.arc(xo + aw / 2, yt - aw / 2, aw / 2, Math.PI, 0, true); g.lineTo(xi, yb + aw + ri); g.quadraticCurveTo(xi, yb + aw, xi + ri, yb + aw); g.lineTo(-t, yb + aw);
          } else {       /* right arm, drawn coming down */
            g.lineTo(t, yb + aw); g.lineTo(xi - ri, yb + aw); g.quadraticCurveTo(xi, yb + aw, xi, yb + aw + ri); g.lineTo(xi, yt - aw / 2);
            g.arc(xo - aw / 2, yt - aw / 2, aw / 2, Math.PI, 0, true); g.lineTo(xo, yb + ro); g.quadraticCurveTo(xo, yb, xo - ro, yb); g.lineTo(t, yb);
          }
        };
        const lo = [hh * .36, hh * .72], up = [hh * .48, hh * .85], la = hi < 0 ? up : lo, ra = hi < 0 ? lo : up;
        g.beginPath(); g.moveTo(-t, 0); arm(-1, la[0], la[1]); g.lineTo(-t, hh - t); g.arc(0, hh - t, t, Math.PI, 0, true); arm(1, ra[0], ra[1]); g.lineTo(t, 0); g.closePath(); ink(1);
        /* faint ribs down the trunk and up each arm */
        for (const x of t > .15 ? [-t * .5, 0, t * .5] : [-t * .4, t * .4]) wline([x, .1, x, hh - t * (x ? .75 : .45)], .025);
        if (aw > .12) { wline([-R + aw / 2, la[0] + aw, -R + aw / 2, la[1] - aw * .6], .025); wline([R - aw / 2, ra[0] + aw, R - aw / 2, ra[1] - aw * .6], .025); }
        break;
      }
      case "bone":
        for (const d of [-1, 1]) { g.beginPath(); g.moveTo(d * hw, 0); g.quadraticCurveTo(d * hw * 1.1, hh * .8, d * .05, hh); g.quadraticCurveTo(d * hw * .5, hh * .6, d * hw * .45, 0); g.closePath(); ink(1); }
        break;
      case "coral":
        for (let i = -1; i <= 1; i++) { const x = i * hw * .62, top = hh * (i ? .72 : 1); g.beginPath(); g.roundRect(x - .11, 0, .22, top, .1); ink(1); g.beginPath(); g.arc(x, top, .16, 0, TAU); ink(1); }
        poly([-hw * .62, .1, hw * .62, .1, hw * .62, .3, -hw * .62, .3]); g.fillStyle = "#000"; g.fill();
        break;
      case "flame":
        for (let i = -1; i <= 1; i++) { const x = i * hw * .55, top = hh * (i ? .7 : 1) * (1 + .1 * Math.sin(t * 9 + i * 2 + id)), sw = .12 * Math.sin(t * 7 + i + id); g.beginPath(); g.moveTo(x - hw * .4, 0); g.bezierCurveTo(x - hw * .5, top * .5, x + sw - .05, top * .6, x + sw, top); g.bezierCurveTo(x + sw + .08, top * .6, x + hw * .5, top * .5, x + hw * .4, 0); g.closePath(); ink(1); }
        g.beginPath(); g.ellipse(0, hh * .25, hw * .25, hh * .2, 0, 0, TAU); g.fillStyle = "rgba(255,255,255,.18)"; g.fill();
        break;
      case "cone":
        poly([-hw, 0, 0, hh, hw, 0]); ink(1); for (let i = 1; i <= 2; i++) { const y = hh * i * .28, ww = hw * (1 - i * .28) * .82; wline([-ww, y, ww, y], .07); }
        break;
      default: {
        const n = Math.max(1, Math.round(w / .45));
        /* crisp teeth with slightly concave sides; tips exactly where they always were */
        for (let i = 0; i < n; i++) {
          const x0 = -hw + i * (2 * hw / n), x1 = x0 + 2 * hw / n, xm = (x0 + x1) / 2, tp = hh * (n > 1 && i % 2 ? .82 : 1), k = (x1 - x0) * .07;
          g.beginPath(); g.moveTo(x0, 0); g.quadraticCurveTo((x0 + xm) / 2 + k, tp * .45, xm, tp); g.quadraticCurveTo((xm + x1) / 2 - k, tp * .45, x1, 0); g.closePath(); ink(1);
        }
      }
    }
  }
  /* two chains of alternating oval / edge-on links, from y0 up to y1 (unit space) */
  function chains(xs, y0, y1) {
    g.beginPath();
    for (const cx of xs) for (let y = y0 - .04, k = 0; y < y1; y += .2, k++) {
      if (k % 2) { g.moveTo(cx + .06, y + .14); g.ellipse(cx, y + .14, .06, .14, 0, 0, TAU); }
      else g.rect(cx - .016, y, .032, .28);
    }
    g.lineWidth = .1; g.strokeStyle = FOG.rim; g.stroke();
    g.lineWidth = .045; g.strokeStyle = "#000"; g.stroke();
  }
  /* a few grass blades on top of a hanging slab (unit space, y up) */
  function slabGrass(hw, y, id) {
    g.beginPath();
    for (let i = 0; i < 9; i++) {
      if (hsh(id * 13 + i) < .35) continue;
      const x = -hw + .12 + i * (2 * hw - .24) / 8, hb = .14 + hsh(id * 7 + i) * .22, ln = (hsh(id * 5 + i) - .5) * .14;
      g.moveTo(x - .03, y - .02); g.quadraticCurveTo(x + ln * .3, y + hb * .6, x + ln, y + hb); g.quadraticCurveTo(x + .01 + ln * .3, y + hb * .5, x + .03, y - .02);
    }
    g.fillStyle = "#000"; g.fill();
  }
  /* hanging bars: w = hitbox width, bh = hitbox height, up = art height for styles that rise as a column,
     lim = how far up chains need to go to leave the screen */
  function bar(style, w, up, id, bh, lim) {
    const hw = w / 2, t = tNow;
    bh = bh || up; lim = Math.max(bh, lim || up);
    switch (BAR[style] || "pillar") {
      case "pipe":
        poly([-hw * .7, 0, hw * .7, 0, hw * .7, up, -hw * .7, up]); ink(); poly([-hw, 0, hw, 0, hw, .3, -hw, .3]); ink();
        for (let y = 1.3; y < up; y += 1.6) wline([-hw * .7, y, hw * .7, y], .06); wline([-hw * .35, .5, -hw * .35, up], .04);
        break;
      case "chain":
        chains([-hw * .45, hw * .45], 1.3, Math.max(up, lim));
        g.beginPath(); g.roundRect(-hw, 0, w, 1.3, .16); ink(); wline([-hw * .6, .4, hw * .6, .4], .05); wline([-hw * .6, .85, hw * .6, .85], .05);
        break;
      case "piston": {
        const b = .1 * pulse;
        poly([-hw * .3, 1, hw * .3, 1, hw * .3, up, -hw * .3, up]); ink(); g.beginPath(); g.roundRect(-hw, -b, w, 1.15, .08); ink();
        for (let i = -2; i <= 2; i++) wline([i * hw * .38, .12 - b, i * hw * .38, .4 - b], .05); wline([-hw * .8, .75 - b, hw * .8, .75 - b], .05);
        break;
      }
      case "cloth": {
        g.beginPath(); g.moveTo(-hw, up); g.lineTo(-hw, .25);
        for (let i = 0; i <= 8; i++) g.lineTo(-hw + i * w / 8, .12 + (i % 2 ? .22 : 0) + .05 * Math.sin(t * 3 + i + id));
        g.lineTo(hw, up); g.closePath(); ink();
        for (let x = -hw + w / 6; x < hw; x += w / 3) wline([x, .6, x, up], .08);
        break;
      }
      case "stal":
        poly([-hw, up, -hw, 1.4, -hw * .7, .5, -hw * .4, 1.1, -.05, 0, hw * .3, .9, hw * .65, .35, hw, 1.5, hw, up]); ink(); wline([-.1, .5, -.2, up * .6], .035); wline([hw * .5, .9, hw * .6, up * .4], .035);
        break;
      default: {
        /* the reference's hanging platform: a black slab filling the hitbox, a row of teeth along its underside
           (tips on the hitbox floor, so they stay inside it), grass on top, hung from two chains */
        const beam = BAR[style] === "beam", n = Math.max(2, Math.round(w / .4)), tw = w / n, th0 = .45;
        chains([-hw * .55, hw * .55], bh, lim);
        g.beginPath(); g.moveTo(-hw, bh); g.lineTo(-hw, th0);
        for (let i = 0; i < n; i++) { const x0 = -hw + i * tw; g.lineTo(x0 + tw / 2, 0); g.lineTo(x0 + tw, th0); }
        g.lineTo(hw, bh); g.closePath(); ink();
        if (beam) { for (let y = th0 + .2; y < bh - 1; y += 1.5) { wline([-hw * .8, y, hw * .8, y + 1.3], .05); wline([hw * .8, y, -hw * .8, y + 1.3], .05); wline([-hw * .8, y, hw * .8, y], .05); } }
        else { for (let i = 0; i < 4; i++) { const x = -hw * .7 + i * hw * .47, y0 = .7 + hsh(id * 9 + i) * 1.5; wline([x, y0, x + .05, y0 + 1.2 + hsh(id + i) * 2], .04); } slabGrass(hw, bh, id); }
      }
    }
  }

  /* ---------------- newer plain obstacles (unit space, origin at the hitbox's bottom centre, y up) ----------------
     Each has its own silhouette so it reads at a glance: a hovering spiked block, a long spiked slab you slide
     under, a toothed lip on a step, a striped hurdle pair, a piston crusher and a rolling saw. */
  function teeth(x0, x1, y, h, n, dir) {
    const tw = (x1 - x0) / n; g.beginPath();
    for (let i = 0; i < n; i++) { const a = x0 + i * tw; g.moveTo(a, y); g.lineTo(a + tw / 2, y + h * dir); g.lineTo(a + tw, y); }
    g.closePath(); ink();
  }
  function floatBlock(w, h) {
    const hw = w / 2, b0 = .16, b1 = h - .14;
    g.beginPath(); g.roundRect(-hw + .1, b0, w - .2, b1 - b0, .08); ink();
    teeth(-hw + .12, hw - .12, b0, -b0, 3, 1); teeth(-hw + .12, hw - .12, b1, h - b1, 3, 1);
    poly([-hw + .1, b0 + .08, -hw, (b0 + b1) / 2, -hw + .1, b1 - .08]); ink(); poly([hw - .1, b0 + .08, hw, (b0 + b1) / 2, hw - .1, b1 - .08]); ink();
    wline([-hw * .45, (b0 + b1) / 2, hw * .45, (b0 + b1) / 2], .05);
  }
  function tunnel(w, h, lim) {
    const hw = w / 2, slab = .95;
    chains([-hw + .5, hw - .5], h, lim);
    g.beginPath(); g.rect(-hw, 0, w, slab); ink();
    for (let x = -hw + .5; x < hw - .3; x += 1) { g.beginPath(); g.arc(x, .22, .06, 0, TAU); g.fillStyle = FOG.rim; g.fill(); }
    teeth(-hw, hw, slab, h - slab, Math.max(2, Math.round(w / .4)), 1);
  }
  function stepLip(w, h) {
    g.beginPath(); g.rect(0, 0, w, .12); ink();
    g.beginPath(); for (let i = 0; i < 3; i++) { const a = i * w / 3; g.moveTo(a, .1); g.lineTo(a + w / 6 - .06, h); g.lineTo(a + w / 3, .1); } g.closePath(); ink();
  }
  function stripes(x0, x1, y0, y1) {
    g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip(); g.beginPath();
    for (let x = x0 - (y1 - y0); x < x1; x += .36) { g.moveTo(x, y0); g.lineTo(x + (y1 - y0), y1); }
    g.lineWidth = .1; g.strokeStyle = "rgba(255,255,255,.2)"; g.stroke(); g.restore();
  }
  function hurdleSpike(w, h) {
    const hw = w / 2;
    poly([-hw, 0, -hw + .1, 0, 0, h * .7, hw - .1, 0, hw, 0, .05, h * .78, -.05, h * .78]); ink(1);
    g.beginPath(); g.rect(-hw, h * .55, w, .16); ink(); stripes(-hw, hw, h * .55, h * .71);
    teeth(-hw, hw, h * .71, h * .29, 3, 1);
  }
  function hurdleBar(w, lim) {
    const hw = w / 2;
    g.beginPath(); g.rect(-.07, 1, .14, lim); ink();
    g.beginPath(); g.roundRect(-hw, 0, w, 1.05, .1); ink(); stripes(-hw, hw, .12, .93);
  }
  function crusher(w, h, lim) {
    const hw = w / 2;
    g.beginPath(); g.rect(-.11, h, .22, lim); ink(); wline([-.04, h + .2, -.04, Math.min(lim, 12)], .03);
    g.beginPath(); g.rect(-hw - .08, h - .3, w + .16, .3); ink();
    g.beginPath(); g.rect(-hw, .18, w, h - .48); ink(); wline([-hw * .7, h * .5, hw * .7, h * .5], .05);
    teeth(-hw, hw, .18, -.18, 4, 1);
  }
  function saw(r, rot) {
    const n = 12; g.beginPath();
    for (let k = 0; k < n * 2; k++) { const a = rot + k / (n * 2) * TAU, rd = k % 2 ? r : r * .76; g.lineTo(Math.cos(a) * rd, Math.sin(a) * rd); }
    g.closePath(); ink();
    g.beginPath(); g.arc(0, 0, r * .25, 0, TAU); g.fillStyle = FOG.rim; g.fill();
    g.beginPath(); for (let k = 0; k < 3; k++) { const a = rot + k * TAU / 3; g.moveTo(Math.cos(a) * r * .3, Math.sin(a) * r * .3); g.lineTo(Math.cos(a) * r * .62, Math.sin(a) * r * .62); }
    g.lineWidth = .05; g.strokeStyle = FOG.rim; g.stroke();
  }

  /* ---------------- ground ---------------- */
  function groundDetail(style, x0, x1, depth) {
    /* local space: x = world x, y = units below the top edge (positive down) */
    const a = Math.floor(x0), b = Math.ceil(x1);
    g.fillStyle = "#161616"; g.strokeStyle = "#161616"; g.lineWidth = .05;
    switch (style) {
      case "roof":
        g.fillRect(x0, .12, x1 - x0, .06);
        for (let x = a; x < b; x++) for (let r = 0; r < 5; r++) for (let k = 0; k < 2; k++) { const wx = x + .14 + k * .5; if (wx > x0 + .15 && wx < x1 - .5 && hsh(x * 131 + r * 17 + k) < .62) g.fillRect(wx, .6 + r * .95, .28, .5); }
        break;
      case "planks":
        g.fillRect(x0, .28, x1 - x0, .05); for (let x = a; x < b; x++) if (x > x0 && x < x1) g.fillRect(x, .33, .04, .9 + hsh(x) * .5);
        break;
      case "rivets":
        g.fillRect(x0, .5, x1 - x0, .05); for (let x = a; x < b; x += .5) if (x > x0 + .1 && x < x1 - .1) { g.beginPath(); g.arc(x + .12, .25, .06, 0, TAU); g.fill(); }
        break;
      case "bricks":
        for (let r = 0; r < 4; r++) { g.fillRect(x0, .45 + r * .5, x1 - x0, .04); for (let x = a; x < b; x++) { const wx = x + (r % 2 ? .5 : 0); if (wx > x0 + .05 && wx < x1 - .05) g.fillRect(wx, .45 + r * .5 - .5, .04, .5); } }
        break;
      case "snow":
        g.beginPath(); g.moveTo(x0, .1); g.lineTo(x1, .1); for (let x = x1; x >= x0; x -= .25) g.lineTo(x, .3 + .14 * Math.sin(x * 3.1) + .1 * hsh(Math.round(x * 4))); g.closePath(); g.fill();
        break;
      case "sand":
        for (let x = a; x < b; x += .25) { const wx = x + hsh(x * 40) * .2, d = .15 + hsh(x * 91 + 1) * 1.4; if (wx > x0 && wx < x1) g.fillRect(wx, d, .05, .05); }
        break;
      case "rock": case "obsidian":
        for (let x = a; x < b; x++) { const wx = x + hsh(x * 3) * .7, d = .2 + hsh(x * 5) * .6; if (wx > x0 + .2 && wx < x1 - .6) { g.beginPath(); g.moveTo(wx, d); g.lineTo(wx + .3, d + .35); g.lineTo(wx + .2, d + .8); g.stroke(); } }
        break;
      case "tiles":
        for (let x = a; x < b; x += .5) if (x > x0 - .01 && x < x1 - .4) { g.beginPath(); g.arc(x + .25, .12, .25, 0, Math.PI); g.stroke(); }
        g.fillRect(x0, .55, x1 - x0, .04);
        break;
      case "checker":
        for (let x = a; x < b; x += .5) for (let r = 0; r < 2; r++) if (((x * 2 + r) & 1) === 0 && x > x0 - .01 && x < x1 - .49) g.fillRect(x + .03, .12 + r * .5, .44, .44);
        break;
      case "books":
        for (let x = a; x < b; x += .25) { const wx = x + hsh(x * 13) * .1; if (wx > x0 + .05 && wx < x1 - .1) g.fillRect(wx, .15, .03, .55 + hsh(x * 7) * .45); } g.fillRect(x0, 1.25, x1 - x0, .05);
        break;
      case "girder":
        g.fillRect(x0, .16, x1 - x0, .05); g.fillRect(x0, .95, x1 - x0, .05);
        for (let x = a; x < b; x++) if (x > x0 - .01 && x < x1 - .9) { g.beginPath(); g.moveTo(x, .95); g.lineTo(x + .5, .2); g.lineTo(x + 1, .95); g.stroke(); }
        break;
      case "train":
        g.fillRect(x0, .2, x1 - x0, .05); g.fillRect(x0, 1.3, x1 - x0, .05);
        for (let x = a; x < b; x += 2) if (x > x0 + .3 && x < x1 - .8) { g.beginPath(); g.arc(x + .5, 1.9, .34, 0, TAU); g.stroke(); g.beginPath(); g.arc(x + .5, 1.9, .08, 0, TAU); g.fill(); }
        for (let x = a; x < b; x++) if (x > x0 && x < x1 - .1 && x % 2) g.fillRect(x, .25, .04, 1.05);
        break;
      case "hull":
        g.fillRect(x0, .3, x1 - x0, .05); for (let x = a; x < b; x++) if (x > x0 + .2 && x < x1 - .6) { if (x % 3 === 0) { g.beginPath(); g.arc(x + .4, .95, .22, 0, TAU); g.stroke(); } else { g.beginPath(); g.arc(x + .4, .15, .05, 0, TAU); g.fill(); } }
        break;
      default: break;
    }
  }
  /* ---------------- terrain silhouette ---------------- */
  /* jagged points down (or up) an exposed cliff face, only ever notched inward, stable per block */
  function jag(out, x, y0, y1, inw, sd) {
    const st = .25 * sc, sg = y1 > y0 ? 1 : -1, n = Math.floor(Math.abs(y1 - y0) / st), lim = sg > 0 ? H + 60 : -60;
    for (let k = 1; k < n; k++) { const y = y0 + sg * k * st; if (sg > 0 ? y > lim : y < lim) break; out.push(x + inw * hsh(sd * 131 + k) * .12 * sc, y); }
    return out;
  }
  /* body of one ground segment as a path; dn = 1 grows down from its edge (floor), -1 grows up (Zenith ceiling).
     Returns the rim polyline (exposed faces + edge). */
  function segPath(q, xa, xb, ye, yFar, dn, edgeW) {
    const exp = function (n) { if (n === null) return dn > 0 ? H + 60 : -60; const yn = Y(n); return dn > 0 ? (n < edgeW ? Math.min(yn, H + 60) : ye) : (n > edgeW ? Math.max(yn, -60) : ye); };
    const lE = exp(q.ln), rE = exp(q.rn);
    const R = jag([], xb, ye, rE, -1, Math.round(q.x1 * 8) + 7), Lp = jag([], xa, ye, lE, 1, Math.round(q.x0 * 8));
    g.beginPath(); g.moveTo(xa, ye); g.lineTo(xb, ye);
    for (let i = 0; i < R.length; i += 2) g.lineTo(R[i], R[i + 1]);
    g.lineTo(xb, rE); g.lineTo(xb, yFar); g.lineTo(xa, yFar); g.lineTo(xa, lE);
    for (let i = Lp.length - 2; i >= 0; i -= 2) g.lineTo(Lp[i], Lp[i + 1]);
    g.closePath();
    const rim = [xa, lE]; for (let i = Lp.length - 2; i >= 0; i -= 2) rim.push(Lp[i], Lp[i + 1]);
    rim.push(xa, ye, xb, ye); for (let i = 0; i < R.length; i += 2) rim.push(R[i], R[i + 1]); rim.push(xb, rE);
    return rim;
  }
  /* foliage silhouettes along a top edge, added to the current path (screen px). s = 1 grows up, -1 hangs down */
  function foliage(kind, q, left, right, ye, s) {
    const st = .3, a = Math.max(q.x0 + .14, left), b = Math.min(q.x1 - .14, right), fm = L.fm, fx0 = L.fmx, u = sc;
    const sway = RM ? 0 : 1;
    for (let wx = Math.ceil(a / st) * st; wx < b; wx += st) {
      if (fm[Math.floor((wx - fx0) * 4)]) continue;
      const i = Math.round(wx / st), h = hsh(i * 7 + 13), h2 = hsh(i * 11 + 5), px = X(wx + (hsh(i * 3 + 1) - .5) * .2), y = ye + s;
      switch (kind) {
        case "tuft": case "dry": case "snow": {
          if (kind === "snow" && h < .3) { const r = (.07 + h2 * .09) * u; g.moveTo(px - r, y); g.quadraticCurveTo(px - r, y - s * r * 1.3, px, y - s * r * 1.3); g.quadraticCurveTo(px + r, y - s * r * 1.3, px + r, y); break; }
          const dens = kind === "tuft" ? .52 : kind === "dry" ? .2 : .42;
          if (h < dens) {
            const n = kind === "dry" ? 2 + Math.floor(h2 * 2) : 3 + Math.floor(h2 * 5), H0 = (kind === "snow" ? .1 + h2 * .14 : .15 + hsh(i * 5) * .3) * u, bw = (kind === "dry" ? .018 : .03) * u;
            for (let j = 0; j < n; j++) {
              const c = j - (n - 1) / 2, bx = px + c * .04 * u, bh = H0 * (.55 + .45 * hsh(i * 13 + j)) * (kind === "dry" ? 1.2 : 1);
              const ln = (c * (kind === "dry" ? .13 : .06) + (hsh(i * 17 + j) - .5) * .1 + sway * .025 * Math.sin(tNow * 2 + wx + j)) * u;
              g.moveTo(bx - bw, y); g.quadraticCurveTo(bx - bw * .3 + ln * .2, y - s * bh * .6, bx + ln, y - s * bh); g.quadraticCurveTo(bx + bw * .3 + ln * .2, y - s * bh * .55, bx + bw, y);
            }
          } else if (kind === "tuft" && h < .56) {
            /* fern: arched stem with leaflet pairs */
            const len = (.3 + h2 * .14) * u, dir = h2 < .5 ? -1 : 1, sx = dir * len * .45;
            g.moveTo(px - .015 * u, y); g.quadraticCurveTo(px + sx * .2, y - s * len * .7, px + sx, y - s * len); g.quadraticCurveTo(px + sx * .2 + .02 * u, y - s * len * .65, px + .015 * u, y);
            for (let k = 1; k <= 4; k++) {
              const t = k / 5, cx = px + sx * t * t, cy = y - s * len * t, lw = (.12 - k * .018) * u;
              for (const d of [-1, 1]) { g.moveTo(cx, cy); g.quadraticCurveTo(cx + d * lw * .5, cy - s * lw * .55, cx + d * lw, cy - s * lw * .2); g.quadraticCurveTo(cx + d * lw * .5, cy - s * lw * .05, cx, cy); }
            }
          } else if (kind === "tuft" && h < .6) {
            /* broad leaves */
            for (const d of [-1, 1]) { const l = (.24 + h2 * .14) * u; g.moveTo(px, y); g.quadraticCurveTo(px + d * l * .2, y - s * l * .9, px + d * l, y - s * l * .7); g.quadraticCurveTo(px + d * l * .5, y - s * l * .15, px, y); }
          } else if (kind !== "dry" && h < .66) {
            /* sprout */
            const l = (.16 + h2 * .08) * u; g.moveTo(px - .012 * u, y); g.lineTo(px - .012 * u, y - s * l); g.lineTo(px + .012 * u, y - s * l); g.lineTo(px + .012 * u, y);
            for (const d of [-1, 1]) { g.moveTo(px, y - s * l); g.quadraticCurveTo(px + d * .05 * u, y - s * (l + .09 * u), px + d * .11 * u, y - s * (l + .03 * u)); g.quadraticCurveTo(px + d * .05 * u, y - s * (l - .02 * u), px, y - s * l); }
          }
          break;
        }
        case "ind": {
          if (h < .1) { const r = .06 * u; g.moveTo(px - r, y); g.quadraticCurveTo(px, y - s * r * 2, px + r, y); }
          else if (h < .15) { g.rect(px - .15 * u, y, .3 * u, -s * .14 * u); g.rect(px - .1 * u, y - s * .14 * u, .2 * u, -s * .04 * u); }
          else if (h < .19) { g.rect(px - .08 * u, y, .16 * u, -s * .32 * u); g.rect(px - .11 * u, y - s * .32 * u, .22 * u, -s * .06 * u); }
          else if (h < .23) { const r = .14 * u; g.moveTo(px - r, y); g.quadraticCurveTo(px - r, y - s * r * .9, px, y - s * r * .9); g.quadraticCurveTo(px + r, y - s * r * .9, px + r, y); }
          break;
        }
        case "peb": {
          if (h < .26) { const r = (.06 + h2 * .1) * u; g.moveTo(px - r, y); g.quadraticCurveTo(px - r * .8, y - s * r * 1.2, px + r * .1, y - s * r * 1.1); g.quadraticCurveTo(px + r, y - s * r * .9, px + r, y); }
          else if (h < .3) { const r = .07 * u; g.moveTo(px - r, y); g.lineTo(px - r * .4, y - s * .2 * u); g.lineTo(px + r * .2, y - s * .13 * u); g.lineTo(px + r, y); }
          break;
        }
        case "cand": {
          if (h < .1) { g.rect(px - .035 * u, y, .07 * u, -s * .2 * u); g.moveTo(px, y - s * .22 * u); g.quadraticCurveTo(px + .04 * u, y - s * .27 * u, px, y - s * .34 * u); g.quadraticCurveTo(px - .04 * u, y - s * .27 * u, px, y - s * .22 * u); }
          else if (h < .2) { g.rect(px - .13 * u, y, .26 * u, -s * .035 * u); }
          break;
        }
      }
    }
  }
  /* props: silhouettes on quiet ground; origin on the surface, y up */
  function sign(v) {
    g.fillStyle = "#000"; g.fillRect(-.05, 0, .1, .95);
    g.save(); g.translate(0, .72); g.rotate(-.12 + v * .1); poly([-.26, -.09, .2, -.09, .3, 0, .2, .09, -.26, .09]); g.fill(); g.restore();
    if (v > .4) { g.save(); g.translate(0, .48); g.rotate(.16); poly([.24, -.08, -.18, -.08, -.27, 0, -.18, .08, .24, .08]); g.fill(); g.restore(); }
  }
  function bush(v, s) {
    g.beginPath(); const n = 4 + Math.floor(v * 3);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1) - .5) * .7 * s, r = (.16 + hsh(i * 9 + v * 99) * .12) * s, y = r * .6 + (1 - Math.abs(x) / (.5 * s)) * .1 * s; g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }
    g.rect(-.38 * s, 0, .76 * s, .12 * s); g.fillStyle = "#000"; g.fill();
  }
  function fern(v) {
    g.beginPath();
    for (let f = -2; f <= 2; f++) {
      const a = Math.PI / 2 + f * .38 + (v - .5) * .2, l = .55 - Math.abs(f) * .08, ex = Math.cos(a) * l, ey = Math.sin(a) * l;
      g.moveTo(-.02, 0); g.quadraticCurveTo(ex * .4 - .03, ey * .8, ex, ey); g.quadraticCurveTo(ex * .4 + .03, ey * .7, .02, 0);
      for (let k = 1; k <= 3; k++) { const t = k / 4, cx = ex * t, cy = ey * t * (1.1 - t * .2), lw = .09 - k * .015; for (const d of [-1, 1]) { g.moveTo(cx, cy); g.quadraticCurveTo(cx + d * lw * .6 - ex * .05, cy + lw * .6, cx + d * lw, cy + lw * .2); g.closePath(); } }
    }
    g.fillStyle = "#000"; g.fill();
  }
  function rock(v) { poly([-.5, 0, -.36, .24 + v * .2, -.05, .38 + v * .22, .3, .3 + v * .1, .5, 0]); g.fillStyle = "#000"; g.fill(); }
  function mush(v) {
    g.fillStyle = "#000"; g.fillRect(-.05, 0, .1, .26);
    g.beginPath(); g.moveTo(-.2, .24); g.quadraticCurveTo(-.18, .44, 0, .45); g.quadraticCurveTo(.18, .44, .2, .24); g.closePath(); g.fill();
    if (v > .5) { g.fillRect(.22, 0, .06, .14); g.beginPath(); g.moveTo(.15, .13); g.quadraticCurveTo(.25, .26, .35, .13); g.closePath(); g.fill(); }
  }
  function lantern() {
    g.fillStyle = "#000"; g.fillRect(-.035, 0, .07, 1.3); g.fillRect(-.035, 1.24, .32, .06);
    g.beginPath(); g.roundRect(.13, .86, .2, .3, .05); g.fill(); g.fillRect(.21, 1.16, .04, .1);
    g.fillStyle = FOG.rim; g.fillRect(.18, .92, .1, .17);
  }
  function crate(v) { g.fillStyle = "#000"; g.fillRect(-.3, 0, .6, .52); if (v > .5) g.fillRect(-.1, .52, .38, .3); wline([-.3, 0, .3, .52], .04); wline([-.3, .52, .3, 0], .04); }
  function barrel() { g.fillStyle = "#000"; g.beginPath(); g.roundRect(-.2, 0, .4, .55, .08); g.fill(); wline([-.2, .14, .2, .14], .035); wline([-.2, .41, .2, .41], .035); }
  function prop(style, v, id) {
    const k = Math.floor(v * 5);
    switch (style) {
      case "grass": return [sign, bush, fern, rock, mush][k](v, 1);
      case "snow": return [sign, rock, bush, rock, sign][k](v, .8);
      case "sand": return [sign, rock, bush, rock, rock][k](v, .7);
      case "rock": case "obsidian": return [rock, mush, rock, mush, rock][k](v);
      case "bricks": case "tiles": return [lantern, bush, fern, lantern, bush][k](v, .8);
      case "checker": case "books": return [lantern, crate, lantern, crate, lantern][k](v);
      case "planks": case "hull": return [barrel, crate, lantern, barrel, crate][k](v);
      case "roof": case "rivets": case "girder": case "train": return [crate, barrel, lantern, crate, barrel][k](v);
      default: return;
    }
  }

  /* ---------------- the stickman ---------------- */
  /* Character animation, view-only: it reads SIM state, the beat and the frame time, and never writes SIM state, so
     replays and the home demo stay bit-identical. Units are world units (the runner is 1.7 tall, PH), y up, x forward,
     origin on the ground under the runner; times are seconds unless they say beats. All the tunables are in ANIM. */
  const ANIM = {
    /* A state change leaves an offset between the drawn pose and the new target, which decays at a rate (1/s; settled
       after ~3/rate s). Steady states (the run, the spin) are drawn exactly, with no lag behind the beat. */
    blend: { run: 30, unroll: 24, unrollTurn: 1.5, ball: 34, air: 22, hang: 28, glide: 16, thermal: 12 },
    hands: { spring: 1.5, damp: .55 },    /* hand offsets settle as a spring instead (w = rate * spring), so arms overshoot a little */
    head: { kick: .1, hz: 5, damp: .5, max: .06 },  /* head lag per unit/beat of vertical speed change (take-off, landing) */
    run: {
      stance: .23,                        /* share of the cycle a foot is planted. One cycle = 1 beat = 2 steps, so feet strike on beats and half-beats */
      contact: .3, foot: .05, heel: .1,   /* foot strike ahead of the hip, ankle height, heel lift at toe-off */
      hip: .79, bob: .035,                /* hip height (a low, driving sprint) and half its bob (low at mid-stance, high in flight) */
      lean: .42, pitch: .05,              /* torso lean (rad, ~24 deg) and its pitch swing per step (~3 deg) */
      torso: .55, neck: .23, head: 1.1,   /* head tilt as a share of the lean: the head leads, pushed forward along the body line */
      armFwd: .75, armBack: -1.4,         /* upper arm swing from straight down (rad): forward and down in front, up behind at the back */
      flexFwd: 1, flexBack: 1,            /* elbow bend (rad): fist punching forward at chest height, forearm hanging behind */
      /* swing leg after toe-off, as cycle phase, thigh angle from straight down (deg, + forward) and knee bend (deg):
         heel kicks up to the seat, knee drives up to near horizontal, the shin reaches out, then paws back into the
         strike. Toe-off and strike angles are solved from the planted foot, so swing and stance join exactly. */
      swing: [.3, -30, 75, .4, -14, 125, .5, 15, 135, .62, 50, 118, .74, 72, 95, .85, 65, 50, .93, 50, 22],
      dust: [1.6, .3, .05]                /* push-off dust: speed, life, size */
    },
    land: { t: .14, drop: .2, lean: .18, heavyT: .22, heavyDrop: .3 },   /* land / land2: how long, how deep the hip drops, extra lean */
    jump: { crouch: .6, bounce: .75, ext: .16, coilStretch: .08 },        /* take-off: how far into the crouch, how long the extension lasts */
    flip: { t: .36 },                     /* air jump: one front flip, tucked */
    /* slide / dive ball: radius (fits the 0.8 slide hitbox), spin beyond rolling, extra spin at full Coil charge, most
       spin per frame (keeps the quills from strobing backwards), ceiling for the pose while it curls, spark intervals (s) */
    ball: { r: .39, flair: 1.35, coil: 2.6, step: .9, ceil: .9, spark: .05, coilSpark: .022 },
    /* rail hang: body pendulum (Hz, damping, swing-back kick on the grab, rest angle), legs on their own spring, tuck rate */
    hang: { hz: 1.1, damp: .18, kick: 2.4, trail: -.06, legHz: 2.2, legTrail: -.12, tuck: 30 },
    glide: { rot: -1.28, bob: .03, flutter: .06 },
    thermal: { p1: 1.7, p2: 2.3, p3: 2.9 },
    hit: { t: .03 }                       /* hit pose held for a frame or two as the death burst goes off */
  };

  /* pose channels: joint targets (hip, neck, head, feet, hands), rotation about mid-torso, knee/elbow bend side,
     ball morph (0 runner .. 1 ball) and vertical stretch */
  const NP = 19, HIP = 0, NECK = 2, HEAD = 4, F1 = 6, F2 = 8, H1 = 10, H2 = 12, ROT = 14, KD = 15, ED = 16, BALL = 17, STR = 18;
  function pose(a, ball) { const p = new Float64Array(NP); p.set(a); p[KD] = 1; p[ED] = -1; p[BALL] = ball || 0; return p; }
  /*                  hip         neck          head          foot 1        foot 2        hand 1        hand 2         rot */
  const POSE = {
    rise:    pose([0, .92,     .08, 1.46,    .12, 1.69,    .18, .44,     -.32, .12,    .46, 1.82,    -.44, 1.58,    -.05]),
    apex:    pose([0, .94,     .12, 1.47,    .2, 1.69,     .32, .4,      -.3, .3,      .52, 1.45,    -.46, 1.5,     -.1]),
    fall:    pose([0, .92,     .07, 1.47,    .11, 1.69,    .22, .08,     -.12, .24,    .52, 1.6,     -.44, 1.7,     .06]),
    crouch:  pose([-.02, .58,  .22, 1.06,    .34, 1.26,    .2, .05,      -.22, .05,    -.34, .72,    -.4, .78,      0]),
    ext:     pose([0, .96,     .05, 1.52,    .07, 1.75,    -.06, .09,    -.2, .12,     .54, 1.86,    -.34, 1.94,    0]),
    tuck:    pose([-.04, .98,  .14, 1.34,    .3, 1.45,     .26, .86,     .2, .82,      .34, .96,     .28, .92,      0]),
    ball:    pose([-.1, .3,    .1, .48,      .13, .5,      .17, .2,      .11, .16,     .2, .3,       .15, .26,      0], 1),
    /* glide is laid out as seen (body level, fists forward under the head, legs trailing) and turned into the
       upright frame below, so the runner rotates into it */
    glide:   pose([-.3, 1,     .24, 1.16,    .43, 1.29,    -1.15, .86,   -1.08, 1.02,  .86, 1.16,    .74, .98,      ANIM.glide.rot]),
    thermal: pose([0, .92,     .05, 1.47,    .08, 1.7,     -.14, .12,    .14, .2,      .58, 1.4,     -.52, 1.38,    0])
  };
  POSE.ext[STR] = .1;
  (function (p) {
    const cx = (p[HIP] + p[NECK]) / 2, cy = (p[HIP + 1] + p[NECK + 1]) / 2, c = Math.cos(-p[ROT]), s = Math.sin(-p[ROT]);
    for (let i = 0; i < 14; i += 2) { const x = p[i] - cx, y = p[i + 1] - cy; p[i] = cx + x * c - y * s; p[i + 1] = cy + x * s + y * c; }
  })(POSE.glide);
  /* hand channels settle as springs; every other channel decays exponentially */
  const SPR = new Uint8Array(NP); SPR[H1] = SPR[H1 + 1] = SPR[H2] = SPR[H2 + 1] = 1;
  /* hip height through the run cycle: lowest at each mid-stance, highest in each flight (two bumps per cycle) */
  const RUN_HX = -.02;
  function runHipY(u) { const R = ANIM.run; return R.hip - R.bob * Math.cos(4 * Math.PI * (u - R.stance / 2)); }
  /* run swing keys (phase, thigh, knee in rad) with Catmull-Rom tangents, built once */
  const SW = (function () {
    const R = ANIM.run, D = Math.PI / 180;
    /* thigh angle and knee bend that put the foot at (fx, fy) at phase v (two-bone IK, knee forward) */
    const solve = function (v, fx, fy) {
      const dx = fx - RUN_HX, dy = fy - runHipY(v), d = Math.min(.878, Math.hypot(dx, dy)), k = Math.acos(d / .88), a = Math.atan2(dy, dx) + k;
      return [Math.atan2(Math.cos(a), -Math.sin(a)), 2 * k];
    };
    const off = solve(R.stance, R.contact - SIM.UPB * R.stance, R.foot + R.heel), on = solve(1, R.contact, R.foot);
    const k = [R.stance, off[0], off[1]];
    for (let i = 0; i < R.swing.length; i += 3) k.push(R.swing[i], R.swing[i + 1] * D, R.swing[i + 2] * D);
    k.push(1, on[0], on[1]);
    const n = k.length / 3, t = new Float64Array(n), a = new Float64Array(n), b = new Float64Array(n), ma = new Float64Array(n), mb = new Float64Array(n);
    for (let i = 0; i < n; i++) { t[i] = k[i * 3]; a[i] = k[i * 3 + 1]; b[i] = k[i * 3 + 2]; }
    for (let i = 0; i < n; i++) { const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1), d = t[i1] - t[i0]; ma[i] = (a[i1] - a[i0]) / d; mb[i] = (b[i1] - b[i0]) / d; }
    return { n: n, t: t, a: a, b: b, ma: ma, mb: mb };
  })();

  /* persistent view state (module-level, reset on V.snap) */
  const vP = new Float64Array(NP), vT = new Float64Array(NP), vO = new Float64Array(NP), vV = new Float64Array(NP), dP = new Float64Array(NP);
  const K_RUN = 0, K_BALL = 1, K_AIR = 2, K_GLIDE = 3, K_THERM = 4, K_HANG = 5;
  const vw = { key: -1, rate: 18, rotRate: 18, ac: 0, x: 0, vy: 0, spin: 0, u: 0, dust: 0, landT: -9, heavy: false, toT: -9, coilUp: false, hy: 0, hv: 0 };
  const hg = { a: 0, v: 0, l: 0, lv: 0, tuck: 0 };   /* rail hang: body swing, leg swing, tuck */
  const EV = { jump: -9, air: -9, slide: -9, coil: -9, land: -9, land2: -9, bounce: -9, grab: -9, die: -9 }, FRESH = {}, pend = [];
  function cue(e) { if (EV[e] !== undefined) pend.push(e); }

  const clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  const smooth = function (v) { v = clamp01(v); return v * v * (3 - 2 * v); };
  function wrapPi(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
  function copyPose(d, a) { for (let i = 0; i < NP; i++) d[i] = a[i]; }
  function mixPose(d, a, b, t) { for (let i = 0; i < NP; i++) d[i] = a[i] + (b[i] - a[i]) * t; }
  /* point (x, y) rotated by (c, s) about (ox, oy), into channel i */
  function rpt(p, i, ox, oy, x, y, c, s) { p[i] = ox + x * c - y * s; p[i + 1] = oy + x * s + y * c; }

  /* run: one beat per cycle, foot 1 strikes on the beat, foot 2 on the half-beat. The planted foot moves back at exactly
     the scroll speed (UPB units per beat), so it never skates */
  function runFoot(p, i, v, hy) {
    const R = ANIM.run;
    if (v < R.stance) {
      const q = (v - .5 * R.stance) / (.5 * R.stance);
      p[i] = R.contact - SIM.UPB * v; p[i + 1] = R.foot + (q > 0 ? R.heel * q * q : 0);
      return;
    }
    /* swing: interpolate the joint angles, then forward kinematics from the hip */
    let j = 0; while (j < SW.n - 2 && v > SW.t[j + 1]) j++;
    const h = SW.t[j + 1] - SW.t[j], s = (v - SW.t[j]) / h, s2 = s * s, s3 = s2 * s;
    const a = 2 * s3 - 3 * s2 + 1, b = (s3 - 2 * s2 + s) * h, c = 3 * s2 - 2 * s3, d = (s3 - s2) * h;
    const th = a * SW.a[j] + b * SW.ma[j] + c * SW.a[j + 1] + d * SW.ma[j + 1], sh = th - (a * SW.b[j] + b * SW.mb[j] + c * SW.b[j + 1] + d * SW.mb[j + 1]);
    p[i] = RUN_HX + .44 * (Math.sin(th) + Math.sin(sh)); p[i + 1] = Math.max(R.foot, hy - .44 * (Math.cos(th) + Math.cos(sh)));
  }
  /* arm i swings forward while leg i is back (opposite to the legs); forward kinematics from the shoulder */
  function runArm(p, i, v, lean) {
    const R = ANIM.run, c = Math.cos(TAU * (v - R.stance - .03)), sx = p[NECK] + (p[HIP] - p[NECK]) * .1, sy = p[NECK + 1] + (p[HIP + 1] - p[NECK + 1]) * .1;
    const th = (R.armFwd + R.armBack) / 2 + (R.armFwd - R.armBack) / 2 * c + lean * .3, fl = th + (R.flexFwd + R.flexBack) / 2 + (R.flexFwd - R.flexBack) / 2 * c;
    p[i] = sx + .3 * Math.sin(th) + .3 * Math.sin(fl); p[i + 1] = sy - .3 * Math.cos(th) - .3 * Math.cos(fl);
  }
  /* w = landing weight (0 none .. 1 impact), heavy for land2 */
  function poseRun(p, beat, w, heavy) {
    const R = ANIM.run, Ld = ANIM.land, u = beat - Math.floor(beat), v2 = u < .5 ? u + .5 : u - .5, ph = 4 * Math.PI * (u - R.stance / 2);
    const hy = runHipY(u) - w * (heavy ? Ld.heavyDrop : Ld.drop), lean = R.lean + R.pitch * Math.sin(ph) + w * Ld.lean;
    p[HIP] = RUN_HX; p[HIP + 1] = hy;
    p[NECK] = RUN_HX + R.torso * Math.sin(lean); p[NECK + 1] = hy + R.torso * Math.cos(lean);
    p[HEAD] = p[NECK] + R.neck * Math.sin(lean * R.head); p[HEAD + 1] = p[NECK + 1] + R.neck * Math.cos(lean * R.head);
    runFoot(p, F1, u, hy); runFoot(p, F2, v2, hy);
    runArm(p, H1, u, lean); runArm(p, H2, v2, lean);
    if (w > 0) {
      /* landing: both feet pressed to the ground, arms swung down and forward */
      const sx = p[NECK] + (p[HIP] - p[NECK]) * .1, sy = p[NECK + 1] + (p[HIP + 1] - p[NECK + 1]) * .1;
      p[F1 + 1] += (R.foot - p[F1 + 1]) * w; p[F2 + 1] += (R.foot - p[F2 + 1]) * w;
      p[H1] += (sx + .34 - p[H1]) * w; p[H1 + 1] += (sy - .36 - p[H1 + 1]) * w;
      p[H2] += (sx + .16 - p[H2]) * w; p[H2 + 1] += (sy - .42 - p[H2 + 1]) * w;
    }
    p[ROT] = 0; p[KD] = 1; p[ED] = -1; p[BALL] = 0; p[STR] = 0;
  }
  /* air: rise / apex / fall blended continuously by vertical speed, plus the take-off extension and the air-jump flip */
  function poseAir(p, s) {
    const up = Math.max(-1, Math.min(1, s.vy / 10));
    if (up >= 0) mixPose(p, POSE.apex, POSE.rise, smooth(up)); else mixPose(p, POSE.apex, POSE.fall, smooth(-up));
    p[STR] = Math.min(.12, Math.abs(s.vy) * .007);
    const tj = vw.ac - vw.toT, J = ANIM.jump;
    if (tj < J.ext) { const w = (1 - tj / J.ext) * (1 - tj / J.ext); mixPose(p, p, POSE.ext, w); if (vw.coilUp) p[STR] += J.coilStretch * w; }
    const tf = (vw.ac - EV.air) / ANIM.flip.t;
    if (tf < 1) { const r = p[ROT]; mixPose(p, p, POSE.tuck, Math.sin(Math.PI * tf)); p[ROT] = r - TAU * smooth(tf); }
  }
  /* rail hang: a damped pendulum about the hands (swings back on the grab, then settles), legs trailing on their own
     spring, tuck eased in and out */
  function poseHang(p) {
    /* hands grip the top of the rail (py, just above its centre line at 1.75); the arms hang the body an arm's length
       below, so the head sits forward of them and clear under the rail. Knees a little bent, so the feet stay inside
       the 1.75-tall hang hitbox */
    const A = ANIM.hang, py = 1.78, c = Math.cos(hg.a), sn = Math.sin(hg.a), t = hg.tuck;
    rpt(p, NECK, 0, py, .05, -.56, c, sn); rpt(p, HEAD, 0, py, .28, -.46, c, sn); rpt(p, HIP, 0, py, -.02 * t, -1.06 + .17 * t, c, sn);
    const c2 = Math.cos(hg.l), s2 = Math.sin(hg.l);
    rpt(p, F1, p[HIP], p[HIP + 1], -.12 + .4 * t, -.72 + .8 * t, c2, s2);
    rpt(p, F2, p[HIP], p[HIP + 1], .14 + .06 * t, -.66 + .78 * t, c2, s2);
    p[H1] = -.06; p[H1 + 1] = py; p[H2] = .08; p[H2 + 1] = py;
    p[ROT] = 0; p[KD] = 1; p[ED] = 1; p[BALL] = 0; p[STR] = 0;   /* arms near straight; any bend goes back, away from the head */
  }
  function poseGlide(p) {
    copyPose(p, POSE.glide);
    if (RM) return;
    /* bob straight up and down in the world (the pose is drawn rotated), legs fluttering behind */
    const G = ANIM.glide, b = G.bob * Math.sin(vw.ac * 4.2), f = G.flutter * Math.sin(vw.ac * 15), bx = b * Math.sin(G.rot), by = b * Math.cos(G.rot);
    for (let i = 0; i < 14; i += 2) { p[i] += bx; p[i + 1] += by; }
    p[F1] += f; p[F2] -= f;
  }
  function poseThermal(p, s) {
    copyPose(p, POSE.thermal);
    const sink = Math.max(0, -s.vy / 7);
    p[H1 + 1] += .3 * Math.min(1, sink); p[H2 + 1] += .3 * Math.min(1, sink);
    if (RM) return;
    /* slow flowing limbs: out-of-phase sines with unrelated periods */
    const T = ANIM.thermal, t = vw.ac, a = Math.sin(TAU * t / T.p1), b = Math.sin(TAU * t / T.p2 + 1.3), c = Math.sin(TAU * t / T.p3 + 2.1);
    p[H1] += .05 * b; p[H1 + 1] += .12 * a; p[H2] -= .05 * a; p[H2 + 1] += .12 * b;
    p[F1] += .07 * c; p[F1 + 1] += .04 * a; p[F2] -= .07 * b; p[F2 + 1] += .04 * c;
    p[NECK] += .03 * c; p[HEAD] += .045 * c;
  }

  /* two-bone IK, added to the current path. dir is the bend side (1: the joint bulges forward, like a knee; -1: back,
     like an elbow); values in between swing the joint through, so a bend side can blend */
  function ik(ax, ay, bx, by, l1, l2, dir) {
    let dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy); const m = l1 + l2 - .002;
    if (d > m) { dx *= m / d; dy *= m / d; d = m; } if (d < .02) d = .02;
    const a = Math.atan2(dy, dx), co = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), k = Math.acos(Math.max(-1, Math.min(1, co))) * dir;
    g.moveTo(ax, ay); g.lineTo(ax + Math.cos(a + k) * l1, ay + Math.sin(a + k) * l1); g.lineTo(ax + dx, ay + dy);
  }
  /* the curled-up runner: solid black ball with the head's light rim, three quills that turn with the spin, a glint on
     the leading side that doesn't, and (full motion only) a fading trail behind it. ta = direction of travel (rad), < -2 none */
  function ballShape(cx, cy, R, m, rot, ta) {
    if (!RM && m > .5 && ta > -2) {
      g.strokeStyle = "#000"; g.lineCap = "round";
      const bx = Math.cos(ta), by = Math.sin(ta);
      for (let i = 1; i <= 3; i++) {
        g.beginPath(); g.arc(cx - i * .11 * bx, cy - i * .11 * by, R * (1 - i * .06), ta + Math.PI * .6, ta + Math.PI * 1.4);
        g.globalAlpha = (.34 - i * .09) * (m - .5) * 2; g.lineWidth = .075 - i * .015; g.stroke();
      }
      g.globalAlpha = 1;
    }
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fillStyle = "#000"; g.fill();
    g.globalAlpha = m; g.lineWidth = 1 / sc; g.strokeStyle = FOG.rim; g.stroke();
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = rot + i * TAU / 3;
      g.moveTo(cx + Math.cos(a) * R * .2, cy + Math.sin(a) * R * .2);
      g.quadraticCurveTo(cx + Math.cos(a + .45) * R * .62, cy + Math.sin(a + .45) * R * .62, cx + Math.cos(a + 1.15) * R * .8, cy + Math.sin(a + 1.15) * R * .8);
    }
    g.lineWidth = .05; g.lineCap = "round"; g.stroke();
    g.beginPath(); g.arc(cx, cy, R * .78, .3, .95); g.lineWidth = .045; g.stroke();
    g.globalAlpha = 1;
  }

  function stick(V, dt, fl, fb) {
    const s = V.s, A = ANIM;
    if (V.dead) {
      /* hit pose: thrown back, arms up, for the moment before the burst takes over */
      copyPose(dP, vP);
      dP[ROT] += .35;
      if (dP[BALL] < .5) {
        dP[HEAD] = dP[NECK] - .1; dP[HEAD + 1] = dP[NECK + 1] + .2;
        dP[H1] = dP[NECK] - .12; dP[H1 + 1] = dP[NECK + 1] + .5; dP[H2] = dP[NECK] - .4; dP[H2 + 1] = dP[NECK + 1] + .32;
      }
      drawPose(s, V, 0, 1, 0);
      return;
    }
    const snap = V.snap || vw.key < 0;
    if (snap) {
      for (const k in EV) EV[k] = -9;
      vw.landT = vw.toT = -9; vw.spin = 0; vw.hy = vw.hv = 0; vw.dust = 0; vw.u = V.beat - Math.floor(V.beat);
      hg.a = hg.v = hg.l = hg.lv = 0; hg.tuck = s.hang >= 0 && s.h < 1 ? 1 : 0;
    }
    let dx = V.x - vw.x; vw.x = V.x; if (snap || dx < 0 || dx > 2) dx = 0;
    const vyb = s.gr || s.hang >= 0 || s.gl > 0 ? 0 : s.vy, dvy = snap ? 0 : Math.max(-40, Math.min(40, vyb - vw.vy)); vw.vy = vyb;
    /* which state */
    let k;
    if (s.hang >= 0) k = K_HANG;
    else if (s.gr) k = s.sl ? K_BALL : K_RUN;
    else if (V.thermal) k = K_THERM;
    else if (s.gl > 0) k = K_GLIDE;
    else if (s.dive) k = K_BALL;   /* a dive curls into the same ball as the slide, so a dive into a slide stays one ball */
    else k = K_AIR;
    /* events */
    if (FRESH.land || FRESH.land2) { vw.landT = vw.ac; vw.heavy = !!FRESH.land2; }
    if (FRESH.jump || FRESH.bounce || FRESH.coil) { vw.toT = vw.ac; vw.coilUp = !!FRESH.coil; }
    if (FRESH.grab) { hg.a = 0; hg.v = -A.hang.kick; hg.l = 0; hg.lv = 0; }
    /* view-only motion that the poses read: spin, rail pendulum, tuck */
    const coilK = s.ch > 0 ? Math.min(1, s.ch) : 0;
    if (k === K_BALL) {
      if (vw.key !== K_BALL) vw.spin = wrapPi(vP[ROT]);
      vw.spin -= Math.min(A.ball.step, dx / A.ball.r * A.ball.flair * (1 + A.ball.coil * coilK));
      if (vw.spin < -Math.PI) vw.spin += TAU;
    }
    if (k === K_HANG) {
      const H = A.hang, w = TAU * H.hz, w2 = TAU * H.legHz, z = RM ? 1 : H.damp, z2 = RM ? 1 : .5;
      hg.v += (-w * w * (hg.a - H.trail) - 2 * z * w * hg.v) * dt; hg.a += hg.v * dt;
      hg.lv += (-w2 * w2 * (hg.l - hg.a - H.legTrail) - 2 * z2 * w2 * hg.lv) * dt; hg.l += hg.lv * dt;
      hg.tuck += ((s.h < 1 ? 1 : 0) - hg.tuck) * (1 - Math.exp(-dt * H.tuck));
    }
    /* target pose */
    switch (k) {
      case K_RUN: {
        const T = vw.heavy ? A.land.heavyT : A.land.t, tl = vw.ac - vw.landT, w = tl < T ? (1 - tl / T) * (1 - tl / T) : 0;
        poseRun(vT, V.beat, w, vw.heavy); break;
      }
      case K_BALL: copyPose(vT, POSE.ball); vT[ROT] = vw.spin; break;
      case K_HANG: poseHang(vT); break;
      case K_THERM: poseThermal(vT, s); break;
      case K_GLIDE: poseGlide(vT); break;
      default: poseAir(vT, s);
    }
    /* blend: on a state change the current offset to the new target is kept and decays */
    if (snap) { vO.fill(0); vV.fill(0); }
    else {
      if (k !== vw.key) {
        const B = A.blend;
        vw.rate = k === K_RUN ? (vw.key === K_BALL ? B.unroll : B.run) : k === K_BALL ? B.ball : k === K_HANG ? B.hang : k === K_GLIDE ? B.glide : k === K_THERM ? B.thermal : vw.key === K_BALL ? B.unroll : B.air;
        for (let i = 0; i < NP; i++) vO[i] = vP[i] - vT[i];
        /* rotation takes the short way round, except out of the ball, which keeps rolling forward until upright. Out of
           a full ball the limbs are hidden and the quills repeat every third of a turn, so it rolls at most a third */
        const dr = vP[ROT] - vT[ROT], turn = vP[BALL] > .97 ? TAU / 3 : TAU;
        vO[ROT] = vw.key === K_BALL ? dr - turn * Math.floor((dr + .3) / turn) : wrapPi(dr);
        vw.rotRate = vw.key === K_BALL ? vw.rate * A.blend.unrollTurn : vw.rate;
      }
      /* take-off: a crouch pushed into the drawn pose, which the extension then springs out of */
      if ((FRESH.jump || FRESH.bounce) && vP[BALL] < .3) {
        const c = FRESH.bounce ? A.jump.bounce : A.jump.crouch;
        for (let i = 0; i < 14; i++) vO[i] = vP[i] + (POSE.crouch[i] - vP[i]) * c - vT[i];
      }
      const kd = Math.exp(-dt * vw.rate), w = vw.rate * A.hands.spring, z = A.hands.damp, n = Math.ceil(w * dt / .3), h = dt / n;
      for (let i = 0; i < NP; i++) {
        if (SPR[i] && !RM) for (let j = 0; j < n; j++) { vV[i] += (-w * w * vO[i] - 2 * z * w * vV[i]) * h; vO[i] += vV[i] * h; }
        else vO[i] *= kd;
      }
      vO[ROT] *= Math.exp(-dt * (vw.rotRate - vw.rate));
    }
    for (let i = 0; i < NP; i++) vP[i] = vT[i] + vO[i];
    vw.key = k;
    /* head lag: the head trails the body's vertical speed changes */
    if (!RM && !snap) {
      const Hd = A.head, w = TAU * Hd.hz, n = Math.ceil(w * dt / .3), h = dt / n;
      vw.hv -= dvy * Hd.kick;
      for (let j = 0; j < n; j++) { vw.hv += (-w * w * vw.hy - 2 * Hd.damp * w * vw.hv) * h; vw.hy += vw.hv * h; }
      if (vw.hy > Hd.max) { vw.hy = Hd.max; vw.hv = 0; } else if (vw.hy < -Hd.max) { vw.hy = -Hd.max; vw.hv = 0; }
    }
    copyPose(dP, vP);
    dP[HEAD + 1] += vw.hy;
    /* curling under a ceiling: nothing pokes above the slide hitbox while the pose is still coming down */
    if (k === K_BALL && s.gr) { for (let i = 1; i < 14; i += 2) if (dP[i] > A.ball.ceil) dP[i] = A.ball.ceil; if (dP[HEAD + 1] > A.ball.ceil - .14) dP[HEAD + 1] = A.ball.ceil - .14; }
    /* dust: a kick from each push-off foot, sparks under the rolling ball, spat out faster while revving on a Coil */
    const u = V.beat - Math.floor(V.beat), st = A.run.stance;
    if (!RM && !snap && dt > 0) {
      if (k === K_RUN) {
        /* phase advanced this frame (the beat clock can step back a hair when it resyncs: no dust then) */
        const du = u - vw.u + (u < vw.u - .5 ? 1 : 0);
        for (let leg = 0; leg < 2 && du > 0 && du < .5; leg++) {
          const a = ((leg ? st + .5 : st) - vw.u + 1) % 1;
          if (a > 0 && a <= du) {
            const D = A.run.dust; emit(V.x + A.run.contact - SIM.UPB * st, V.y + .06, 2, { sp: D[0], life: D[1], sz: D[2], ang: Math.PI * .8, spread: .7, g: 4, r: .06, flip: fl, fb: fb });
          }
        }
      } else if (k === K_BALL && s.gr) {
        const iv = coilK > 0 ? A.ball.coilSpark : A.ball.spark;
        vw.dust += dt;
        while (vw.dust > iv) { vw.dust -= iv; emit(V.x - .2, V.y + .04, coilK > 0 ? 2 : 1, { sp: coilK > 0 ? 4 : 2.4, life: .26, sz: .045, ang: Math.PI * .88, spread: .6, g: 6, r: .08, flip: fl, fb: fb }); }
      }
    }
    vw.u = u;
    drawPose(s, V, k === K_BALL && s.gr ? coilK : 0, 0, Math.atan2(s.gr ? 0 : s.vy, SIM.UPB));
  }
  function drawPose(s, V, coilK, hit, ta) {
    const p = dP, sq = V.squash || 0, st = p[STR], m = p[BALL];
    let sx = 1 + sq * .2 - st * .5, sy = 1 - sq * .26 + st;
    if (coilK > 0) { sx *= 1 + .1 * coilK; sy *= 1 - .14 * coilK; if (!RM) g.translate(.022 * coilK * Math.sin(vw.ac * 97), 0); }
    g.scale(sx, sy);
    const hx = p[HIP], hy = p[HIP + 1], nx = p[NECK], ny = p[NECK + 1], cx = (hx + nx) / 2, cy = (hy + ny) / 2;
    /* Halo charge ring, around the body (or the ball) */
    if (s.air > 0 && !hit) { g.beginPath(); g.arc(hx + (cx - hx) * m, hy + .1 + (cy - hy - .1) * m, 1.05 + .05 * Math.sin(tNow * 12), 0, TAU); g.lineWidth = .07; g.strokeStyle = COL.ha; g.stroke(); }
    g.save();
    if (p[ROT]) { g.translate(cx, cy); g.rotate(p[ROT]); g.translate(-cx, -cy); }
    g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = g.fillStyle = "#000";
    if (m < .97) {
      /* solid black silhouette: limbs, a thicker torso, the head with a 1px light rim */
      const shx = nx + (hx - nx) * .1, shy = ny + (hy - ny) * .1;
      g.beginPath();
      ik(shx, shy, p[H2], p[H2 + 1], .3, .3, p[ED]); ik(hx, hy, p[F2], p[F2 + 1], .44, .44, p[KD]);
      ik(hx, hy, p[F1], p[F1 + 1], .44, .44, p[KD]); ik(shx, shy, p[H1], p[H1 + 1], .3, .3, p[ED]);
      g.lineWidth = .132; g.stroke();
      g.beginPath(); g.moveTo(hx, hy); g.lineTo(nx, ny); g.lineWidth = .172; g.stroke();
      g.beginPath(); g.arc(p[HEAD], p[HEAD + 1], .22, 0, TAU); g.fill();
      g.globalAlpha = 1 - m; g.lineWidth = 1 / sc; g.strokeStyle = FOG.rim; g.stroke(); g.globalAlpha = 1;
    }
    g.restore();
    if (m > .03) ballShape(cx, cy, ANIM.ball.r * smooth((m - .15) / .7), m, p[ROT], hit ? -9 : ta);
  }

  /* ---------------- particles ---------------- */
  function emit(x, y, n, o) {
    o = o || {};
    for (let i = 0; i < n; i++) {
      if (fx.length > 360) fx.shift();
      const a = o.ang !== undefined ? o.ang + (Math.random() - .5) * (o.spread || 1) : Math.random() * TAU, sp = (o.sp || 4) * (.35 + Math.random() * .9);
      fx.push({ x: x + (Math.random() - .5) * (o.r || .2), y: y + (Math.random() - .5) * (o.r || .2), vx: Math.cos(a) * sp + (o.vx || 0), vy: Math.sin(a) * sp, g: o.g === undefined ? 14 : o.g,
        life: 0, max: (o.life || .6) * (.6 + Math.random() * .7), sz: (o.sz || .12) * (.6 + Math.random() * .9), k: o.k || 0, col: o.col || "#000", rot: Math.random() * TAU, vr: (Math.random() - .5) * 14, flip: !!o.flip, fb: o.fb || 0 });
    }
  }
  function ring(x, y, col, max, flip, fb) { fx.push({ x: x, y: y, vx: 0, vy: 0, g: 0, life: 0, max: .45, sz: max || 1.6, k: 2, col: col || "#000", rot: 0, vr: 0, flip: !!flip, fb: fb || 0 }); }
  function burst(x, y, flip, fb) {
    emit(x, y + .85, 46, { sp: 7, life: .9, sz: .16, r: 1.1, k: 1, flip: flip, fb: fb }); emit(x, y + .85, 16, { sp: 3, life: .7, sz: .08, r: .8, flip: flip, fb: fb });
    ring(x, y + .85, "#000", 2.6, flip, fb); shake = 1;
  }
  function addShake(v) { shake = Math.max(shake, v); }

  /* ---------------- backdrops ---------------- */
  /* a world's sky, five fog layers far -> near with soft mist bands washing their bases, and its collision motif */
  function drawBack(w, dxp, dt, alpha) {
    w.used = msNow(); w.frame = frameNo;
    if (alpha <= 0) return;
    g.globalAlpha = alpha;
    const pal = w.pal, strips = w.strips;
    if (w.sky && w.sky.width) g.drawImage(w.sky, 0, 0, W, H); else { g.fillStyle = pal.sky[2]; g.fillRect(0, 0, W, H); }
    const bs = strips.bs || 1;
    for (let i = 0; i < 5; i++) {
      const c = strips[i]; if (!c || !c.width) continue;
      const l = LAY[i], k = bs * (c.res || 1), f = l.f, ww = c.width / k, t0 = c.top || 0, sh = c.height - t0, h = sh / k, off = ((camX * sc * f) % ww + ww) % ww;
      const yy = camY * sc * f * .6 + (i === 3 ? pulse * 1.5 : 0), yt = yy + t0 / k;
      if (sh > 0) {
        g.drawImage(c, 0, t0, c.width, sh, -off, yt, ww, h); if (ww - off < W) g.drawImage(c, 0, t0, c.width, sh, ww - off, yt, ww, h);
        if (ww * 2 - off < W) g.drawImage(c, 0, t0, c.width, sh, 2 * ww - off, yt, ww, h);
      }
      if (i === 0 && w.motif) drawMotif(w, w.motif);
      /* the far pair and the mid pair share one band each; every strip also has mist baked into its base */
      if ((i === 1 || i === 3) && w.mist && w.mist.width) { const bh = sc * 3; g.drawImage(w.mist, 0, yy + gy - l.up * sc - bh * .62, W, bh); }
    }
    g.globalAlpha = 1;
  }
  /* a third world bleeding into this one's sky (INF biomes' motif): one silhouette in the far layer's fog grey, at low
     contrast, sliding by very slowly; towers that hang from the top hang from the top of the screen */
  function drawMotif(w, b) {
    const m = b.motif;
    if (!w.motifCv || w.motifKey !== m.seed + "|" + sc) {
      const tone = w.pal.layers[0];
      w.motifCv = BACKDROPS.single({ gen: m.kind, seed: m.seed, u: sc * .55, tone: mixHex(tone, w.pal.sky[1], .25), dark: tone, light: mixHex(tone, w.pal.sky[2], .5) });
      w.motifKey = m.seed + "|" + sc;
    }
    const c = w.motifCv; if (!c || !c.width) return;
    const xm = (b.b0 + b.n / 2) * 16, x = W * .55 + (xm - camX) * sc * .05 - c.ox, top = c.oy === 0;
    if (x > W || x + c.width < 0) return;
    const ga = g.globalAlpha; g.globalAlpha = ga * .55;
    if (top) g.drawImage(c, x, -sc * .4); else g.drawImage(c, x, gy - LAY[0].up * sc - c.oy + camY * sc * .03);
    g.globalAlpha = ga;
  }
  /* the fracture: a jagged diagonal crack through the sky at the ground's x of the biome boundary, top leaning ahead */
  function crackLine(x) {
    const cx = X(x), pts = [], n = 14, sd = Math.round(x);
    for (let i = 0; i <= n; i++) {
      const y = -20 + (H + 40) * i / n, j = (hsh(sd * 13 + i) - .5) * sc * 1.1 * (i % 2 ? 1 : .45);
      pts.push(cx + (gy - y) * .28 + j, y);
    }
    return pts;
  }
  /* its faint white glow, and shards of the old world's far layer drifting off over the new one */
  function drawCrack(pts, x, wOld) {
    g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.lineJoin = "round"; g.lineWidth = 7; g.strokeStyle = "rgba(255,255,255,.16)"; g.stroke();
    g.lineWidth = 1.6; g.strokeStyle = "rgba(246,247,250,.72)"; g.stroke();
    const sd = Math.round(x), tone = wOld.pal.layers[1];
    for (let k = 0; k < 7; k++) {
      const p0 = k / 9, age = fmix - p0; if (age <= 0 || age > .7) continue;
      const a = 1 - age / .7, row = 1 + Math.floor(hsh(sd + k * 7) * 8), cy = pts[row * 2 + 1], cx = pts[row * 2] + age * W * (.18 + hsh(sd + k * 3) * .25);
      const r = sc * (.35 + hsh(sd + k * 5) * .6), rot = age * (hsh(sd + k) - .5) * 6, yy = cy - age * sc * (1 + hsh(sd + k * 11) * 2);
      g.save(); g.translate(cx, yy); g.rotate(rot); g.globalAlpha = a * .8;
      g.beginPath(); g.moveTo(-r, -r * .3); g.lineTo(r * .2, -r * .9); g.lineTo(r, r * .1); g.lineTo(-r * .1, r * .7); g.closePath();
      g.fillStyle = tone; g.fill(); g.lineWidth = 1; g.strokeStyle = "rgba(255,255,255,.6)"; g.stroke();
      g.restore();
    }
    g.globalAlpha = 1;
  }
  /* a world's ambient particles, tinted by the depth they belong to */
  function drawAmb(w, dxp, dt, alpha) {
    const pal = w.pal;
    for (const p of w.amb) {
      const a = p.a; p.x += (a[1] * dt * .06 - dxp * .5 / W) * p.z; p.y += a[2] * dt * .08 * p.z; p.p += dt * 3;
      if (p.x < -.1) p.x += 1.2; if (p.x > 1.1) p.x -= 1.2; if (p.y > 1.05) p.y -= 1.1; if (p.y < -.05) p.y += 1.1;
      if (alpha <= 0.01) continue;
      g.globalAlpha = alpha;
      const x = p.x * W + (a[0] === 0 ? Math.sin(p.p) * 8 : 0), y = p.y * H * .95, z = p.z * a[3] * sc * .06;
      g.fillStyle = g.strokeStyle = pal.layers[p.z < .7 ? 1 : p.z < 1 ? 2 : 3];
      if (a[0] === 0) { g.save(); g.translate(x, y); g.rotate(p.p); g.beginPath(); g.ellipse(0, 0, z * 1.6, z * .7 * Math.abs(Math.cos(p.p * .7)) + .4, 0, 0, TAU); g.fill(); g.restore(); }
      else if (a[0] === 1) { const tw = a[1] === 0 ? .5 + .5 * Math.sin(p.p) : 1; g.beginPath(); g.arc(x, y, z * tw + .4, 0, TAU); g.fill(); }
      else if (a[0] === 2) { g.beginPath(); g.moveTo(x, y); g.lineTo(x - z * 3, y + z * 9); g.lineWidth = 1; g.stroke(); }
      else if (a[0] === 3) { g.beginPath(); g.arc(x, y, z * 2.2 + 1, 0, TAU); g.lineWidth = 1; g.stroke(); }
      else { g.beginPath(); g.moveTo(x - z * 4, y - z * 1.5 * Math.sin(p.p)); g.lineTo(x, y); g.lineTo(x + z * 4, y - z * 1.5 * Math.sin(p.p)); g.lineWidth = 1.4; g.stroke(); }
    }
    g.globalAlpha = 1;
  }
  /* the look of the scenery at x: the world left of a fracture, or right of it */
  function thAt(x) { return xf !== null && x >= xf ? wB.th : wA.th; }

  /* ---------------- frame ---------------- */
  function frame(V, dt) {
    if (!g || !L) return;
    tNow = V.time; pulse = V.pulse; frameNo++;
    /* animation clock: real time that stops while paused; events cued since the last frame are stamped with it */
    vw.ac += dt;
    for (let i = 0; i < pend.length; i++) { EV[pend[i]] = vw.ac; FRESH[pend[i]] = true; }
    pend.length = 0;
    const s = V.s, fl = s.flip, fbase = fl && s.zz ? s.zz.base : 0;
    camX = V.x;
    /* camera height: rest on the ground the runner last stood on, keep them in frame */
    const act = fl ? 2 * fbase + CH - V.y - s.h : V.y;
    if (V.restY !== undefined) camY += (V.restY - camY) * Math.min(1, dt * 3.2);
    const top = (gy - (fit ? fit.top : 70)) / sc - 2.2; if (act - camY > top) camY = act - top; if (act - camY < -1.5) camY = act + 1.5;
    if (V.snap) camY = V.restY || 0;
    shake = Math.max(0, shake - dt * 4.5);
    const shx = V.noShake ? 0 : (Math.random() - .5) * shake * 14, shy = V.noShake ? 0 : (Math.random() - .5) * shake * 14;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dxp = (camX - lastCamX) * sc; lastCamX = camX;
    const left = camX - px0 / sc - 3, right = camX + (W - px0) / sc + 3;
    /* The Convergence: the worlds at the two edges of the screen, the fracture between them, and the next world built
       ahead a layer a frame while it is still at least 24 bars away */
    if (conv) {
      const bl = conv(Math.floor(left / 16)), br = conv(Math.floor(right / 16));
      wA = worldFor(bl.w, LEVELS[bl.w - 1].th, bl.w * 101, true); wA.motif = bl.motif ? bl : null;
      wB = br === bl ? wA : worldFor(br.w, LEVELS[br.w - 1].th, br.w * 101, true); if (wB !== wA) wB.motif = br.motif ? br : null;
      xf = br === bl ? null : br.b0 * 16;
      fmix = xf === null ? 0 : Math.max(0, Math.min(1, (camX - xf + 16) / 32));
      if (cw !== wA) useWorld(wA);
      buildWorld(wA, Infinity); if (wB !== wA) buildWorld(wB, Infinity);
      /* the next world, 1.5 ms a frame (a slower frame skips it), from 24 bars before its fracture */
      const nb = conv(Math.floor((right + 24 * 16) / 16));
      if (nb !== br && !V.still && dt < .03) buildWorld(worldFor(nb.w, LEVELS[nb.w - 1].th, nb.w * 101, true), 1.5);
    } else { wA = wB = cw; xf = null; fmix = 0; }
    drawBack(wA, dxp, dt, 1);
    if (wB !== wA) {
      if (RM) drawBack(wB, dxp, dt, fmix);   /* reduced motion: a short cross-fade instead of a tear */
      else {
        const crack = crackLine(xf);
        g.save(); g.beginPath(); g.moveTo(crack[0], crack[1]); for (let i = 2; i < crack.length; i += 2) g.lineTo(crack[i], crack[i + 1]);
        g.lineTo(W + 40, H + 40); g.lineTo(W + 40, -40); g.closePath(); g.clip();
        drawBack(wB, dxp, dt, 1); g.restore();
        drawCrack(crack, xf, wA);
      }
    }
    /* drifting fog wisps (skipped on the low-quality fallback) */
    if (quality >= 1 && wA.wisp && wA.wisp.width) for (const p of wA.wisps) {
      p.x -= (RM ? 0 : p.v * dt) + dxp * .3 / W; if (p.x < -.6) p.x += 1.9; if (p.x > 1.3) p.x -= 1.9;
      const ww = p.w * sc, hh = p.h * sc; g.globalAlpha = p.a; g.drawImage(wA.wisp, p.x * W - ww / 2, p.y * H - hh / 2, ww, hh);
    }
    g.globalAlpha = 1;
    /* ambient particles, tinted by the depth they belong to; around a fracture both worlds' mix for its two bars */
    drawAmb(wA, dxp, dt, 1 - (wB !== wA ? fmix : 0));
    if (wB !== wA) drawAmb(wB, dxp, dt, fmix);
    g.globalAlpha = 1;
    g.translate(shx, shy);
    /* x snapped to a device pixel (shake included): neighbouring ground segments are separate paths, and an edge they share
       off the pixel grid would let the sky show through its anti-aliasing as a hairline down the cliff */
    const devX = function (x) { return Math.round((x + shx) * dpr) / dpr - shx; };
    /* zone fields */
    for (const z of L.zones) {
      if (z.x1 < left || z.x0 > right) continue;
      const col = COL[z.k], xa = X(z.x0), xb = X(z.x1);
      g.fillStyle = rgba(col, .1 + .04 * pulse); g.fillRect(xa, 0, xb - xa, H);
      g.strokeStyle = rgba(col, .9); g.lineWidth = 2; g.setLineDash([6, 8]); g.beginPath(); g.moveTo(xa, 0); g.lineTo(xa, H); g.moveTo(xb, 0); g.lineTo(xb, H); g.stroke(); g.setLineDash([]);
      const dir = z.k === "A" ? 1 : -1, sp = z.k === "D" ? .5 : z.k === "A" ? 2.4 : 1.5;
      g.strokeStyle = rgba(col, .85); g.fillStyle = rgba(col, .85); g.lineWidth = 2;
      for (let x = Math.ceil(Math.max(z.x0, left)); x < Math.min(z.x1, right); x++) for (let k = 0; k < 2; k++) {
        const hh = hsh(x * 17 + k * 5), px = X(x + hh * .8), yy = (((hh * 7 + tNow * sp * .12 * dir * (.6 + hh)) % 1) + 1) % 1 * H, q = sc * .16;
        g.beginPath();
        if (z.k === "D") g.arc(px, yy, q * (.6 + hh), 0, TAU);
        else if (z.k === "A") { g.moveTo(px - q, yy - q); g.lineTo(px, yy); g.lineTo(px + q, yy - q); }
        else if (z.k === "T") { g.moveTo(px, yy); g.bezierCurveTo(px + q * 1.5, yy + q * 2, px - q * 1.5, yy + q * 4, px, yy + q * 6); }
        else { g.moveTo(px - q, yy + q); g.lineTo(px, yy - q * .6); g.lineTo(px + q, yy + q); }
        g.stroke();
      }
    }
    /* terrain */
    if (L.stream) { si = 0; oi = 0; }   /* a stream is trimmed from the front, and short */
    while (si < L.segs.length && L.segs[si].x1 < left - 30) si++;
    const gs = th[2], rims = [];
    /* the ground's style is its world's: around a fracture, the part left of it the old one's, the rest the new one's */
    const detail = function (q, a, b, fn) {
      if (xf === null || b <= xf) fn(thAt(a)[2], a, b);
      else if (a >= xf) fn(wB.th[2], a, b);
      else { fn(wA.th[2], a, xf); fn(wB.th[2], xf, b); }
    };
    zLines.length = 0;
    for (let i = si; i < L.segs.length; i++) {
      const q = L.segs[i]; if (q.x0 > right) break; if (q.x1 < left || q.kind) continue;
      const xa = devX(X(q.x0)), xb = devX(X(q.x1));
      g.fillStyle = FOG.ground;
      if (q.flip) {
        const ew = 2 * q.fb + CH - q.top, yy = Y(ew), yf = Y(q.fb);
        g.fillRect(xa, yf, xb - xa, H - yf + 40);
        rims.push(segPath(q, xa, xb, yy, -40, -1, ew)); g.fill();
        g.save(); g.clip(); g.translate(X(0), yy); g.scale(sc, -sc); detail(q, Math.max(q.x0, left), Math.min(q.x1, right), groundDetail); g.restore();
        zLines.push(xa, yy, xb - xa);
      } else {
        const yy = Y(q.top);
        rims.push(segPath(q, xa, xb, yy, H + 60, 1, q.top)); g.fill();
        g.save(); g.clip(); g.translate(X(0), yy); g.scale(sc, sc); detail(q, Math.max(q.x0, left), Math.min(q.x1, right), groundDetail); g.restore();
      }
    }
    /* light rim along top edges and exposed cliff faces, then foliage (roots and moss hang from Zenith ceilings) */
    g.beginPath();
    for (const r of rims) { g.moveTo(r[0], r[1]); for (let k = 2; k < r.length; k += 2) g.lineTo(r[k], r[k + 1]); }
    g.lineWidth = 1.25; g.lineJoin = "round"; g.strokeStyle = FOG.rim; g.stroke();
    g.beginPath();
    for (let i = si; i < L.segs.length; i++) {
      const q = L.segs[i]; if (q.x0 > right) break; if (q.x1 < left || q.kind) continue;
      const ye = q.flip ? Y(2 * q.fb + CH - q.top) : Y(q.top), dir = q.flip ? -1 : 1;
      detail(q, Math.max(q.x0, left), Math.min(q.x1, right), function (st, a, b) { foliage(FOL[st] || "tuft", q, a, b, ye, dir); });
    }
    g.fillStyle = FOG.ground; g.fill();
    for (let i = 0; i < zLines.length; i += 3) { g.fillStyle = COL.Z; g.fillRect(zLines[i], zLines[i + 1] - 3, zLines[i + 2], 3); }
    for (const p of L.props) { if (p.x < left || p.x > right) continue; at(p.x, p.y, false, 0); prop(thAt(p.x)[2], p.v, Math.round(p.x * 10)); g.restore(); }
    /* hazard tiles, coils, rails */
    for (let i = si; i < L.segs.length; i++) {
      const q = L.segs[i]; if (q.x0 > right) break; if (q.x1 < left || !q.kind) continue;
      const col = COL[q.kind], w = q.x1 - q.x0;
      at(q.x0, q.top, q.flip, q.fb);
      if (q.kind === "F") {
        const t0 = s.dyn[q.id], k = t0 === undefined ? 0 : (s.tick - t0) / SIM.FADE;
        if (k < 1) { g.globalAlpha = 1 - k * .85; glow(col, w / 2, -.2, w * .7); g.beginPath(); g.roundRect(.04, -.42 - k * .4, w - .08, .42, .12); g.fillStyle = col; g.fill(); g.fillStyle = "#fff"; g.fillRect(.25, -.14 - k * .4, w - .5, .05); g.globalAlpha = 1; }
      } else if (q.kind === "X") {
        if (!s.dyn[q.id]) { for (let x = 1; x < w; x += 2) glow(col, x, -.14, 1.3); g.fillStyle = rgba(col, .55); g.fillRect(0, -.28, w, .28); g.fillStyle = col; g.fillRect(0, -.07, w, .07); g.fillRect(0, -.28, w, .05); g.strokeStyle = "#fff"; g.lineWidth = .04; for (let x = .5; x < w - .3; x += 1.1) { g.beginPath(); g.moveTo(x, -.24); g.lineTo(x + .3, -.08); g.stroke(); } }
      } else {
        const on = s.par === (q.kind === "1" ? 0 : 1);
        g.beginPath(); g.roundRect(.05, -.42, w - .1, .42, .1);
        if (on) { glow(col, w / 2, -.2, w * .7); g.fillStyle = col; g.fill(); g.fillStyle = "#fff"; g.fillRect(.25, -.26, w - .5, .06); }
        else { g.setLineDash([.16, .14]); g.lineWidth = .06; g.strokeStyle = col; g.stroke(); g.setLineDash([]); }
      }
      g.restore();
    }
    for (const c of L.coils) {
      if (c.x1 < left || c.x0 > right) continue;
      const col = COL.S, w = c.x1 - c.x0, on = s.ch > 0 && V.x >= c.x0 - .5 && V.x <= c.x1 + .5, k = on ? Math.min(1, s.ch) : 0;
      at(c.x0, c.y, c.flip, c.fb); glow(col, w / 2, .1, w * (.45 + k * .3));
      g.beginPath(); const hgt = .34 * (1 - k * .6); for (let x = 0; x <= w + .001; x += .25) g.lineTo(x, (Math.round(x * 4) % 2 ? hgt : .06)); g.lineWidth = .09; g.strokeStyle = col; g.lineJoin = "round"; g.stroke();
      g.fillStyle = col; g.fillRect(0, -.04, w, .09); g.restore();
    }
    for (const r of L.rails) {
      if (!r || r.x1 < left || r.x0 > right) continue;
      const col = COL.L; at(r.x0, r.y, r.flip, r.fb); const w = r.x1 - r.x0;
      g.fillStyle = rgba(col, .25); g.fillRect(0, -.18, w, .36); g.fillStyle = col; g.fillRect(0, -.06, w, .12);
      for (let x = 0; x <= w + .01; x += 2) { g.fillRect(x - .04, 0, .08, 14); g.beginPath(); g.arc(x, 0, .14, 0, TAU); g.fill(); }
      g.restore();
    }
    /* obstacles and hazards */
    while (oi < L.objs.length && L.objs[oi].x1 < left - 30) oi++;
    for (let i = oi; i < L.objs.length; i++) {
      const o = L.objs[i]; if (o.x0 > right) break; if (o.x1 < left) continue;
      const pp = 1 + .1 * pulse;
      switch (o.k) {
        case "L": {
          if (o.v === "rb") break;   /* rolling blades move ahead of their place in this list: drawn in their own pass below */
          const w = o.x1 - o.x0, h = o.y1 - o.y0, lim = function (y) { return o.flip ? 16 : Math.min(40, camY + gy / sc + 1.5 - y); };
          if (o.v === "fb") { at(o.x, o.y0, o.flip, o.fb); floatBlock(w, h); }
          else if (o.v === "tn") { at(o.x, o.y0, o.flip, o.fb); tunnel(w, h, lim(o.y0)); }
          else if (o.v === "ss") { at(o.x0, o.y0, o.flip, o.fb); stepLip(w, h); }
          else if (o.v === "hs") { at(o.x, o.y0, o.flip, o.fb); hurdleSpike(w, h); }
          else if (o.v === "hb") { at(o.x, o.y0, o.flip, o.fb); hurdleBar(w, lim(o.y0)); }
          else if (o.v === "cr") { const y = o.y0 + SIM.crushY(V.x / SIM.DX); at(o.x, y, o.flip, o.fb); crusher(w, h, lim(y)); }
          else if (o.v === "sp" || o.v === "tw" || o.v === "bm") { at(o.x, o.y0, o.flip, o.fb); spike(o.v === "sp" ? thAt(o.x)[3] : o.v === "tw" ? "post" : "rock", o.x1 - o.x0, o.y1 - o.y0, o.id); }
          else if (o.v === "kn") { at(o.x, (o.y0 + o.y1) / 2 + .35, o.flip, o.fb); g.beginPath(); for (let k = 0; k < 16; k++) { const a = k / 16 * TAU + tNow, rd = k % 2 ? .52 : .3; g.lineTo(Math.cos(a) * rd, Math.sin(a) * rd); } g.closePath(); ink(); }
          else { at(o.x, o.y0, o.flip, o.fb); bar(o.v === "bar" ? thAt(o.x)[4] : "stal", o.x1 - o.x0, 16, o.id, o.y1 - o.y0, o.flip ? 16 : Math.min(40, camY + gy / sc + 1.5 - o.y0)); }
          g.restore(); break;
        }
        case "bl": {
          const since = (s.tick - s.bl) / SIM.TPB, sq = since < .35 && Math.abs(V.x - o.x) < 3 ? 1 - since / .35 : 0, w = (o.x1 - o.x0) / 2;
          at(o.x, o.y0, o.flip, o.fb); glow(COL.bl, 0, .3, 1.5 * pp); g.scale(1 + sq * .35, 1 - sq * .5);
          g.beginPath(); g.moveTo(-w, 0); g.bezierCurveTo(-w, .95 * pp, w, .95 * pp, w, 0); g.closePath(); g.fillStyle = COL.bl; g.fill();
          g.beginPath(); g.ellipse(-w * .3, .42, w * .22, .09, -.3, 0, TAU); g.fillStyle = "#fff"; g.fill(); g.fillStyle = COL.bl; g.fillRect(-w * 1.15, -.02, w * 2.3, .1); g.restore(); break;
        }
        case "ha": if (!s.dyn[o.id]) { at(o.cx, o.cy, o.flip, o.fb); glow(COL.ha, 0, 0, 1.5 * pp); g.beginPath(); g.arc(0, 0, .62 * pp, 0, TAU); g.lineWidth = .16; g.strokeStyle = COL.ha; g.stroke(); g.beginPath(); g.arc(0, 0, .3, tNow * 3, tNow * 3 + 4); g.lineWidth = .07; g.stroke(); g.restore(); } break;
        case "ke": if (!s.dyn[o.id]) { at(o.cx, o.cy + .08 * Math.sin(tNow * 4), o.flip, o.fb); glow(COL.ke, 0, 0, 1.3 * pp); const w = .34 * Math.abs(Math.cos(tNow * 2.4)) + .1; poly([0, .55, w, 0, 0, -.55, -w, 0]); g.fillStyle = COL.ke; g.fill(); poly([0, .55, w * .3, 0, 0, -.55]); g.fillStyle = "#fff"; g.globalAlpha = .6; g.fill(); g.globalAlpha = 1; g.restore(); } break;
        case "ga": {
          at(o.x, o.y0, o.flip, o.fb);
          if (!s.dyn[o.key]) { glow(COL.ke, 0, 1.6, 2.2); g.fillStyle = rgba(COL.ke, .3); g.fillRect(-.3, 0, .6, 16); g.fillStyle = COL.ke; g.fillRect(-.09, 0, .18, 16); for (let y = .4; y < 9; y += .9) { poly([0, y + .3, .26, y, 0, y - .3, -.26, y]); g.fill(); } }
          else { g.fillStyle = rgba(COL.ke, .5); g.fillRect(-.09, 0, .18, .3); g.fillRect(-.09, 5.5, .18, 12); }
          g.restore(); break;
        }
        case "ri": {
          at(o.cx, o.cy, o.flip, o.fb); const used = s.dyn[o.id], a = used ? .3 : 1; g.globalAlpha = a; glow(COL.ri, 0, 0, 1.6 * pp);
          g.strokeStyle = COL.ri; g.lineWidth = .14; g.beginPath(); g.ellipse(0, 0, .42, .72 * pp, 0, 0, TAU); g.stroke(); g.lineWidth = .05; g.beginPath(); g.ellipse(0, 0, .2, .4, tNow * 2, 0, TAU); g.stroke();
          const ey = o.ey - o.cy + .85; g.setLineDash([.1, .2]); g.beginPath(); g.moveTo(0, .8); g.lineTo(0, ey - .7); g.stroke(); g.setLineDash([]);
          glow(COL.ri, 0, ey, 1.1); g.lineWidth = .08; g.setLineDash([.2, .16]); g.beginPath(); g.ellipse(0, ey, .36, .62, 0, 0, TAU); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; g.restore(); break;
        }
        case "co": if (!s.dyn[o.id]) { at(o.cx, o.cy, o.flip, o.fb); glow(COL.co, 0, 0, 1.6 * pp); poly([0, .3, -1.7, .05, -1.7, -.05, 0, -.3]); g.fillStyle = rgba(COL.co, .55); g.fill(); g.beginPath(); g.arc(0, 0, .36 * pp, 0, TAU); g.fillStyle = COL.co; g.fill(); g.beginPath(); g.arc(.08, .08, .13, 0, TAU); g.fillStyle = "#fff"; g.fill(); g.restore(); } break;
        case "ey": {
          at(o.x, o.b, o.flip, o.fb); const rec = s.dyn[o.id]; g.strokeStyle = COL.ey; g.fillStyle = COL.ey; g.lineWidth = .05; g.setLineDash([.14, .2]); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 4.4); g.stroke(); g.setLineDash([]);
          glow(COL.ey, 0, 4.9, 1.2 * pp); g.beginPath(); g.moveTo(-.6, 4.9); g.quadraticCurveTo(0, 5.5, .6, 4.9); g.quadraticCurveTo(0, 4.3, -.6, 4.9); g.fill();
          g.beginPath(); g.arc(rec ? .12 : -.12 + .1 * Math.sin(tNow * 2), 4.9 + (rec === 2 ? .08 : rec === 1 ? -.08 : 0), .17, 0, TAU); g.fillStyle = "#fff"; g.fill(); g.restore(); break;
        }
        case "em": {
          at(o.x, o.b, o.flip, o.fb); const rec = s.dyn[o.eye]; g.fillStyle = COL.ey;
          g.beginPath(); g.roundRect(-.3, 5.6, .6, .5, .12); g.fill(); g.fillRect(-.05, 0, .1, .12);
          if (rec) { const lo = rec === 1 ? 0 : 1.9, hi = rec === 1 ? 1.1 : 5.6; glow(COL.ey, 0, (lo + hi) / 2, 1.6); g.fillStyle = rgba(COL.ey, .35); g.fillRect(-.3, lo, .6, hi - lo); g.fillStyle = COL.ey; g.fillRect(-.1 - .03 * pulse, lo, .2 + .06 * pulse, hi - lo); g.fillStyle = "#fff"; g.fillRect(-.03, lo, .06, hi - lo); }
          else { g.strokeStyle = rgba(COL.ey, .55); g.lineWidth = .05; g.setLineDash([.1, .22]); g.beginPath(); g.moveTo(0, .12); g.lineTo(0, 5.6); g.stroke(); g.setLineDash([]); }
          g.restore(); break;
        }
      }
    }
    /* rolling blades: placed exactly as the simulation places them, from the runner's drawn position */
    for (const o of L.blades) {
      const bx = o.x + (o.tm - V.x / SIM.DX) * o.vx, r = (o.y1 - o.y0) / 2;
      if (bx + r < left || bx - r > right) continue;
      at(bx, o.y0 + r, o.flip, o.fb); saw(r, -bx / r); g.restore();
    }
    /* finish gate */
    if (!V.demo && L.endX > left && L.endX < right + 4) {
      at(L.endX, L.baseAt(L.endX), false, 0); g.fillStyle = "#000"; g.fillRect(-.09, 0, .18, 5); g.fillRect(1.9, 0, .18, 5);
      g.beginPath(); g.arc(0, 5.06, .13, 0, TAU); g.arc(1.99, 5.06, .13, 0, TAU); g.fill();
      g.fillStyle = FOG.rim; g.fillRect(-.09, 0, .04, 5); g.fillRect(1.9, 0, .04, 5);
      for (let i = 0; i < 8; i++) for (let k = 0; k < 2; k++) { g.fillStyle = (i + k) % 2 ? "#000" : "#EDEDED"; g.fillRect(.09 + i * .226, 4.1 + k * .4, .226, .4); }
      g.strokeStyle = "#000"; g.lineWidth = .05; g.strokeRect(.09, 4.1, 1.81, .8); g.restore();
    }
    /* Infinite Shadow's best: a faint dashed line where the best run ended, with a small tag */
    if (V.best && V.best.x > left && V.best.x < right) {
      const bx = devX(X(V.best.x)), by = Y(L.baseAt(V.best.x));
      g.save(); g.setLineDash([5, 7]); g.lineWidth = 1.5; g.strokeStyle = "rgba(10,10,16,.38)";
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx, Math.max(8, by - sc * 7)); g.stroke(); g.setLineDash([]);
      g.font = "700 " + Math.max(9, Math.round(sc * .3)) + "px " + POPFONT; g.textAlign = "center"; g.textBaseline = "bottom";
      const tw = g.measureText(V.best.tag).width + 10, ty = Math.max(8, by - sc * 7) - 4;
      g.fillStyle = "rgba(255,255,255,.82)"; g.fillRect(bx - tw / 2, ty - Math.round(sc * .3) - 6, tw, Math.round(sc * .3) + 8);
      g.fillStyle = "rgba(10,10,16,.72)"; g.fillText(V.best.tag, bx, ty);
      g.restore();
    }
    /* player (after a death, only the brief hit pose) */
    if (!V.dead || vw.ac - EV.die < ANIM.hit.t) {
      if (fl) { g.save(); g.translate(X(V.x), Y(2 * fbase + CH - V.y)); g.scale(sc, sc); } else { g.save(); g.translate(X(V.x), Y(V.y)); g.scale(sc, -sc); }
      if (s.hang >= 0 && s.h < 1) g.translate(0, s.h - 1.75);
      stick(V, dt, fl, fbase); g.restore();
    }
    for (const e in EV) FRESH[e] = false;
    /* fx */
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i]; p.life += dt; if (p.life >= p.max) { fx.splice(i, 1); continue; }
      p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      const k = 1 - p.life / p.max;
      if (p.k === 3) {
        /* a score pop (Infinite Shadow): its number in the hazard's colour, rising a little and fading within a beat */
        const sx = X(p.x), sy = p.flip ? Y(2 * p.fb + CH - p.y) : Y(p.y);
        g.save(); g.globalAlpha = Math.min(1, k * 2.2); g.font = "700 " + Math.round(sc * .42) + "px " + POPFONT; g.textAlign = "center"; g.textBaseline = "middle";
        g.lineWidth = 3; g.strokeStyle = "rgba(255,255,255,.85)"; g.strokeText(p.text, sx, sy); g.fillStyle = p.col; g.fillText(p.text, sx, sy);
        g.restore(); continue;
      }
      at(p.x, p.y, p.flip, p.fb);
      if (p.k === 0 && p.col === "#000") { g.rotate(p.rot * .3); const z = (p.sz * k + .01) * 1.6; g.fillStyle = p.col; g.fillRect(-z / 2, -z / 2, z, z); }
      else if (p.k === 2) { g.beginPath(); g.arc(0, 0, p.sz * (1 - k * k), 0, TAU); g.lineWidth = .12 * k + .01; g.strokeStyle = p.col; g.globalAlpha = k; g.stroke(); g.globalAlpha = 1; }
      else if (p.k === 1) { g.rotate(p.rot); const z = p.sz * (.4 + k * .6); poly([-z, -z * .5, z * .9, -z * .2, -z * .1, z]); g.fillStyle = p.col; g.fill(); }
      else { g.beginPath(); g.arc(0, 0, p.sz * k + .01, 0, TAU); g.fillStyle = p.col; g.fill(); }
      g.restore();
    }
    /* a level tip's marker (game.js): a red ring around one object, x / y its centre and r its radius in world units,
       breathing slowly on the real clock (it is drawn while the game is frozen), still with reduced motion */
    if (V.mark) {
      const m = V.mark, r = m.r * (RM ? 1 : 1 + .07 * Math.sin(V.time * 5));
      at(m.x, m.y, m.flip, m.fb);
      g.beginPath(); g.arc(0, 0, r, 0, TAU); g.lineWidth = 7 / sc; g.strokeStyle = "rgba(255,255,255,.75)"; g.stroke();
      g.lineWidth = 4 / sc; g.strokeStyle = "#E8112D"; g.stroke();
      g.restore();
    }
    if (V.flash > 0) { g.fillStyle = "rgba(0,0,0," + (V.flash * .12) + ")"; g.fillRect(-20, -20, W + 40, H + 40); }
  }
  /* a number that pops near the runner (Infinite Shadow's score), in world units */
  function pop(x, y, text, col, flip, fb) { fx.push({ x: x, y: y, vx: 0, vy: 1.6, g: 0, life: 0, max: .55, sz: 1, k: 3, text: text, col: col || "#0A0A10", rot: 0, vr: 0, flip: !!flip, fb: fb || 0 }); }
  /* a stream grew or was trimmed: dress what it holds now (zone bases, blades, cliff faces, foliage mask, props) */
  function extend() { if (L && L.stream) dress(L); }
  /* build level n's world a piece at a time ahead of use (the home screen's Infinite Shadow demo); true once built */
  function prepare(n) { const w = worldFor(n, LEVELS[n - 1].th, n * 101, true); return buildWorld(w, 1.5); }
  return { resize: resize, setLevel: setLevel, frame: frame, emit: emit, ring: ring, burst: burst, shake: addShake, cue: cue, COL: COL, pop: pop, extend: extend, prepare: prepare,
    setFont: function (f) { POPFONT = f; },
    /* world point -> CSS pixels on the canvas, with the camera of the last frame (flip / fb as for at()) */
    point: function (x, y, flip, fb) { return { x: X(x), y: flip ? Y(2 * fb + CH - y) : Y(y) }; },
    setHome: function (v) { if (home !== v) { home = v; if (cv) resize(); } }, get W() { return W; }, get H() { return H; }, setQuality: function (q) { quality = q; },
    create: function (f) { return make(f); } };
})();

