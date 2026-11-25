/* ---- music.js ---- */
/* ============================================================================
   MUSIC — the soundtrack engine. Every level, and the home screen, has a
   theme composed by hand in js/themes.js, in the notation of js/synth.js;
   this file plays it, live with Web Audio, in time with the run.

   makeSong() writes the whole song up front as a list of note events on an
   integer grid (a sixteenth is 12 of the 48 ticks a beat): the theme's form,
   section by section and bar by bar (SYNTH.renderBar), the closing sting
   after the last bar, and a soft riser before each combo in the chart.
   schedule() then only plays the events that fall inside a short look-ahead
   window, at t0 + beat * spb, and drops any that are already late. The
   tempo is the level's (mu[0] in js/levels.js): it is gameplay, so a theme
   is always written at it.

   Sections: engine (master chain) → songs (combo cues, makeSong, a theme's
   bus and notes) → scheduler and API → sound effects → offline render.

   No audio files: every sample is computed (js/synth.js renders the drums,
   plucked strings, bells and reverbs into buffers). Besides the music there
   are two sound effects on their own output: the death sound
   (MUSIC.sfx.die) and the level 1 spike tip's tape rewind
   (MUSIC.sfx.rewind).
   ========================================================================== */
const MUSIC = (function () {
  "use strict";
  const TPQ = 48;                  /* grid ticks per beat: 16ths (12), eighths (24) and triplets (16) are all whole numbers */
  const LOOK = 0.3, TICK = 25, LATE = 0.02, WARM = 3;
  function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  /* ---------------- engine ---------------- */
  let ctx = null, mix = null, volG = null, pz = null, song = null, bus = null, cache = null;
  let t0 = 0, ei = 0, cyc = 0, wi = 0, wcyc = 0, vol = 0.8, timer = 0, offline = false, susT = 0;
  const stats = { maxV: 0, skipped: 0, worst: 0, played: 0 };
  /* Chrome, Firefox and Safari delay a DynamicsCompressor's output by a 6 ms look-ahead; the master has two, so every
     event is sent that much early and beat b still reaches the speakers at t0 + b * spb (plus output latency, which
     the game's clock already allows for) */
  const PROC = 0.012, MIX = .42;

  function build(c) {
    ctx = c; cache = { bank: new SYNTH.SampleBank(c) };
    /* master: mix -> broad shelves -> glue compressor -> limiter -> safety curve -> volume -> pause fade -> out */
    mix = c.createGain(); mix.gain.value = MIX;
    const ls = c.createBiquadFilter(), hs = c.createBiquadFilter(), glue = c.createDynamicsCompressor(), lim = c.createDynamicsCompressor();
    ls.type = "lowshelf"; ls.frequency.value = 120; ls.gain.value = 1.5; hs.type = "highshelf"; hs.frequency.value = 8500; hs.gain.value = 1.5;
    glue.threshold.value = -18; glue.knee.value = 6; glue.ratio.value = 2.8; glue.attack.value = .01; glue.release.value = .15;
    lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = .001; lim.release.value = .08;
    volG = c.createGain(); volG.gain.value = vol; pz = c.createGain(); pz.gain.value = 1;
    /* the limiter can overshoot a sharp transient by a little; a safety curve, straight up to 0.8 and easing into a
       ceiling of 0.97, makes sure nothing ever clips (it only touches those few peaks) */
    const cap = c.createWaveShaper(), cv = new Float32Array(4097);
    for (let i = 0; i < cv.length; i++) { const x = i / 2048 - 1, a = Math.abs(x); cv[i] = Math.sign(x) * (a <= .8 ? a : .8 + .17 * Math.tanh((a - .8) / .17)); }
    /* (no oversampling on any shaper here: 2x delays its path by 128 samples, which would pull that part off the
       grid; every shaper's input is already low-passed, so the curves add little to alias) */
    cap.curve = cv; cap.oversample = "none";
    mix.connect(ls); ls.connect(hs); hs.connect(glue); glue.connect(lim); lim.connect(cap); cap.connect(volG); volG.connect(pz); pz.connect(c.destination);
  }

  /* ---------------- songs ---------------- */

  /* Bars that hold the start of a combo: two different hazards within 2 beats (8 units) of each other, or a hazard
     inside another's zone, found from the compiled level the same way tools/difficulty.js counts combos. The bar
     before each one gets a riser. Audio only: nothing here touches the simulation. */
  const HK = { bl: "bl", ha: "ha", ke: "ke", ga: "ke", ri: "ri", co: "co", ey: "ey", em: "ey", F: "F", X: "X", "1": "1", "2": "1" };
  function comboBars(L) {
    const hz = [], byId = {}, out = {};
    L.objs.forEach(function (o) { byId[o.id] = o; });
    L.objs.forEach(function (o) {
      const k = HK[o.k]; if (!k || o.k === "ke" || o.k === "ey") return;
      const src = o.k === "ga" ? byId[o.key] : o.k === "em" ? byId[o.eye] : null;
      hz.push({ k: k, x0: src ? (src.cx !== undefined ? src.cx : src.x) : o.x0, x1: o.x1 });
    });
    L.segs.forEach(function (q) { if (HK[q.kind]) hz.push({ k: HK[q.kind], x0: q.x0, x1: q.x1 }); });
    L.coils.forEach(function (c) { hz.push({ k: "S", x0: c.x0, x1: c.x1 }); });
    L.rails.forEach(function (r) { hz.push({ k: "L", x0: r.x0, x1: r.x1 }); });
    L.zones.forEach(function (z) { hz.push({ k: z.k, x0: z.x0, x1: z.x1 }); });
    let last = -99;
    const locs = [];
    for (let i = 0; i < hz.length; i++) for (let j = i + 1; j < hz.length; j++) {
      const a = hz[i], b = hz[j]; if (a.k === b.k) continue;
      const gap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
      if (gap <= 8) locs.push(gap <= 0 ? Math.max(a.x0, b.x0) : (Math.min(a.x1, b.x1) + Math.max(a.x0, b.x0)) / 2);
    }
    locs.sort(function (a, b) { return a - b; });
    locs.forEach(function (x) { if (x - last > 8) { last = x; out[Math.floor(x / 16)] = 1; } });
    return out;
  }
  /* ---------------- the course and the remix ----------------
     Two layers every level's song and Infinite Shadow's stream get on top of the theme, written from the level itself,
     in the theme's key, on its chords and through its bus (its reverb, delay and pump), so they belong to that world.
     A world unit is a sixteenth (4 units a beat), so whatever sits at x is met on sixteenth x. Audio only: nothing here
     touches the simulation.

     The course (role "course"): what the runner meets, on the sixteenth it meets it. Each hazard has its own signature,
     the same in every world so it can be learnt, on the bar's chord: Bloom a pluck that springs up an octave, Halo a
     bell on the fifth, Prism a music-box arpeggio at its crystal, Fade a pizzicato note on each tile, Rift a short sweep
     into it, Comet a gliding high note, Mimic two snaps as the eye looks and one where it shoots, Glass a glass chime,
     Coil a pluck winding up and leaping at the launch, Flicker a rim click left or right as the tiles swap, Rail a held
     string note while you hang. Inside a zone, Drift bubbles up in celesta eighths, Zenith's celesta runs down instead,
     Anchor thuds on every beat and Thermal breathes a warm swell. Every cell that asks for a jump gets a soft tick and a
     roll a low knock (not in Infinite Shadow, whose lead already plays each action), a crusher an anvil and a rolling
     blade a chain.

     The remix (role "remix"): production from the level's energy, the way a remix of a soundtrack builds and drops.
     The bar before each drop (the first bar of the peak and of the climax) opens a low-pass on the whole theme from dull
     to bright while a snare roll speeds up from eighths to thirty-seconds under a noise sweep, and its last sixteenth
     drops out; the drop lands on a sub boom. Peak bars add a four-on-the-floor kick (on the beats the theme's own kick
     leaves free), open hats on the off-beats, a sine sub on the chord's root and off-beat chord stabs that pump with the
     kick; the climax adds claps on 2 and 4. The breather sinks into a low-pass wash and climbs out of it with the roll.
     The roll, the sweep and the boom bypass the filter and the drop-out (post). */
  const LAYER = {
    "~tick": { drum: "tick", gain: 0.23, pan: 0.18, role: "course" },
    "~knock": { drum: "tom", opts: { tone: 0.7 }, gain: 0.06, pan: -0.18, role: "course" },
    "~anvil": { drum: "anvil", gain: 0.15, pan: 0.1, reverb: 0.2, role: "course" },
    "~chain": { drum: "chain", gain: 0.33, pan: -0.1, role: "course" },
    "~snap": { drum: "snap", gain: 0.25, pan: 0.25, reverb: 0.2, role: "course" },
    "~rimL": { drum: "rim", gain: 0.19, pan: -0.5, role: "course" },
    "~rimR": { drum: "rim", gain: 0.19, pan: 0.5, role: "course" },
    "~thud": { drum: "boom", gain: 0.061, role: "course" },
    "~spring": { tone: "pluck", gain: 0.63, pan: 0.12, reverb: 0.2, delay: 0.12, role: "course" },
    "~bell": { tone: "bell", gain: 0.26, pan: -0.15, reverb: 0.45, delay: 0.25, role: "course" },
    "~box": { tone: "musicbox", gain: 0.2, pan: 0.2, reverb: 0.4, delay: 0.2, role: "course" },
    "~pizz": { tone: "pizz", gain: 0.6, pan: -0.2, reverb: 0.25, role: "course" },
    "~glass": { tone: "glass", gain: 0.33, pan: 0.15, reverb: 0.45, role: "course" },
    "~bubble": { tone: "celesta", gain: 0.133, pan: 0.3, reverb: 0.45, delay: 0.2, role: "course" },
    "~glide": { synth: "lead", glide: true, gain: 0.63, pan: 0.1, reverb: 0.4, delay: 0.2, role: "course", params: { level: 0.12, wave: "triangle", wave2: "sine", cutoff: 2600, glide: 0.09, attack: 0.04, vibrato: 18 } },
    "~hold": { synth: "strings", gain: 0.46, pan: -0.1, reverb: 0.4, role: "course", params: { level: 0.12, cutoff: 2400, attack: 0.08, release: 0.3 } },
    "~whoosh": { synth: "riser", gain: 1.46, reverb: 0.3, role: "course", params: { level: 0.1, top: 6000 } },
    "~warm": { synth: "swell", gain: 1.14, pan: 0.1, reverb: 0.4, role: "course", params: { level: 0.08 } },
    "~kick": { drum: "kick", opts: { punch: 0.8 }, gain: 0.13, duck: 0.3, role: "remix" },
    "~hat": { drum: "hat", opts: { open: true }, gain: 0.27, pan: 0.22, role: "remix" },
    "~clap": { drum: "clap", gain: 0.22, pan: -0.05, reverb: 0.25, role: "remix" },
    "~sub": { synth: "bass", gain: 0.127, role: "remix", params: { wave: "sine", cutoff: 240, level: 0.34, decay: 0.3, sustain: 0.8, snap: 0.02 } },
    "~stab": { synth: "brass", gain: 0.62, pan: 0.05, pump: true, reverb: 0.2, delay: 0.12, role: "remix", params: { stab: true, level: 0.18, attack: 0.004, release: 0.06, bright: 0.75 } },
    "~roll": { drum: "snare", gain: 0.13, pan: 0.05, reverb: 0.2, post: true, role: "remix" },
    "~sweep": { synth: "riser", gain: 1.44, reverb: 0.3, post: true, role: "remix", params: { level: 0.1, top: 8000 } },
    "~boom": { drum: "boom", gain: 0.165, post: true, role: "remix" }
  };
  /* a theme with the layers' channels (the original stays as written) */
  const layered = new WeakMap();
  function withLayers(T) {
    let t = layered.get(T);
    if (!t) { t = Object.assign({}, T, { channels: Object.assign({}, T.channels, LAYER) }); layered.set(T, t); }
    return t;
  }
  const KICKS = { kick: 1, boom: 1, taiko: 1, doum: 1 };
  /* where the theme's own kick (or boom, taiko, doum) already plays in a bar's events: { step: 1 } */
  function kickSteps(T, events) {
    const out = {};
    for (const e of events) { const c = T.channels[e.channel]; if (c && KICKS[c.drum]) out[e.step] = 1; }
    return out;
  }
  /* chord tone n of a bar's harmony h ({ chord, scale, base }): 0 root, 1 third (a sus chord's 2 or 4), 2 fifth, 3 the
     octave and so on, with the root folded into the octave from `reg` (a MIDI note) */
  function toneOf(h, n, reg) {
    const c = h.chord, k = ((n % 3) + 3) % 3, o = Math.floor(n / 3);
    let step = [0, 2, 4][k];
    if (k === 1 && c.shape === "sus2") step = 1; else if (k === 1 && c.shape === "sus4") step = 3;
    let r = h.base + degSemis(h.scale, c.degree) + c.acc;
    while (r < reg) r += 12;
    while (r >= reg + 12) r -= 12;
    return r + degSemis(h.scale, c.degree + step) - degSemis(h.scale, c.degree) + 12 * o;
  }
  /* an event of a layer at sixteenth `s` of the song (a half for a thirty-second), swung like the theme */
  function at16(out, sw, c, s, m, n, v) {
    out.push({ y: "t", c: c, b: s / 4, o: s % 2 === 1 ? sw : 0, m: m, n: n, v: v });
  }
  /* the course layer of bar b, read from the level's buckets (L.ob, sb, zb, rb, cb; four units a bucket). Each thing is
     cued in the bar its sixteenth falls in, so a song's bars written one after another cue it once */
  function courseBar(S, L, b, h, out, ticks) {
    const s0 = b * 16, s1 = s0 + 16, sw = S.sw16, seen = {}, done = {};
    const put = function (c, x, m, n, v) {
      const s = Math.round(x);
      if (s < s0 || s >= s1 || done[c + "@" + s]) return;
      done[c + "@" + s] = 1; at16(out, sw, c, s, m, n, v);
    };
    const each = function (buckets, fn) {
      for (let k = Math.floor(s0 / 4) - 1; k <= Math.floor(s1 / 4); k++) for (const o of buckets[k] || []) {
        const key = (o.id !== undefined ? "i" + o.id : "x" + o.x0 + ":" + o.x1) + (o.k || o.kind || "");
        if (!seen[key]) { seen[key] = 1; fn(o); }
      }
    };
    each(L.ob, function (o) {
      switch (o.k) {
        case "bl": { const x = o.x0 - 0.3; put("~spring", x, toneOf(h, 0, 55), 2, 0.75); put("~spring", x + 1, toneOf(h, 3, 55), 2, 0.65); break; }
        case "ha": put("~bell", o.cx, toneOf(h, 2, 72), 4, 0.7); break;
        case "ke": for (let i = 0; i < 3; i++) put("~box", o.cx + i, toneOf(h, i, 72), 2, 0.6 + 0.08 * i); break;
        case "ri": put("~whoosh", o.cx - 4, toneOf(h, 0, 48), 4, 0.8); break;
        case "co": put("~glide", o.cx, toneOf(h, 2, 67), 6, 0.6); put("~glide", o.cx + 4, toneOf(h, 3, 67), 4, 0.5); break;
        case "ey": put("~snap", o.x, null, 1, 0.6); put("~snap", o.x + 1, null, 1, 0.45); break;
        case "em": put("~snap", o.x, null, 1, 0.75); break;
        case "L":
          if (o.v === "cr") put("~anvil", o.x0 - 0.3, null, 1, 0.6);
          else if (o.v === "rb") put("~chain", (o.x0 + o.x1) / 2, null, 1, 0.6);
          break;
        default: break;
      }
    });
    each(L.sb, function (q) {
      if (q.kind === "F") put("~pizz", q.x0, toneOf(h, Math.floor(q.x0 / 2) % 4, 60), 2, 0.6);
      else if (q.kind === "X") put("~glass", q.x0, toneOf(h, 3 + 2, 67), 4, 0.6);
      else if (q.kind === "1") put("~rimL", q.x0, null, 1, 0.6);
      else if (q.kind === "2") put("~rimR", q.x0, null, 1, 0.6);
    });
    each(L.cb, function (c) {
      for (let i = 0; i < 3; i++) put("~spring", c.x0 + i, toneOf(h, i, 55), 1, 0.45 + 0.1 * i);
      put("~spring", c.x1, toneOf(h, 3, 55), 3, 0.8);
    });
    each(L.rb, function (r) { put("~hold", r.x0, toneOf(h, 2, 64), Math.max(2, Math.round(r.x1 - r.x0)), 0.6); });
    each(L.zb, function (z) {
      if (z.k === "T") { put("~warm", z.x0, toneOf(h, 0, 48), Math.min(32, Math.max(4, Math.round(z.x1 - z.x0))), 0.8); return; }
      for (let s = Math.max(s0, Math.ceil(z.x0)); s < Math.min(s1, z.x1); s++) {
        if ((z.k === "D" || z.k === "Z") && s % 2 === 0) { const i = (s / 2) % 6; put("~bubble", s, toneOf(h, z.k === "D" ? i : 5 - i, 72), 2, 0.5); }
        else if (z.k === "A" && s % 4 === 0) put("~thud", s, null, 1, 0.7);
      }
    });
    /* the actions: a cell is two sixteenths */
    if (ticks) for (let c = 0; c < 8; c++) {
      const v = L.chart[b * 8 + c - (L.c00 || 0)];
      if (v === 1) put("~tick", s0 + 2 * c, null, 1, c % 2 ? 0.5 : 0.62);
      else if (v === 2) put("~knock", s0 + 2 * c, null, 1, 0.65);
    }
  }
  /* the remix layer of bar b. r: { peak, climax, drop, build, wash } (the bar is in a peak / the climax, starts one, is
     the bar before one, sinks into a breather); kicks: the theme's kick steps in it */
  function remixBar(S, b, r, h, kicks, out) {
    const s0 = b * 16, sw = S.sw16, put = function (c, s, m, n, v) { at16(out, sw, c, s0 + s, m, n, v); };
    const fx = function (s, e) { e.y = "f"; e.b = (s0 + s) / 4; e.o = s % 2 === 1 ? sw : 0; out.push(e); };
    if (r.drop) { put("~boom", 0, null, 1, 1); fx(0, { k: "lp", f0: 20000, f1: 20000, n: 0 }); }
    if (r.peak) {
      for (const s of [0, 4, 8, 12]) if (!kicks[s]) put("~kick", s, null, 1, s ? 0.82 : 0.95);
      const chord = [toneOf(h, 0, 57), toneOf(h, 1, 57), toneOf(h, 2, 57)];
      for (const s of [2, 6, 10, 14]) { put("~hat", s, null, 1, s % 8 === 6 ? 0.62 : 0.52); out.push({ y: "t", c: "~stab", b: (s0 + s) / 4, o: 0, ms: chord, n: 1, v: s % 8 === 2 ? 0.72 : 0.6 }); }
      const root = toneOf(h, 0, 28);
      put("~sub", 0, root, 7, 0.9); put("~sub", 8, root, 7, 0.85);
      if (r.climax) { put("~clap", 4, null, 1, 0.8); put("~clap", 12, null, 1, 0.85); }
    }
    if (r.wash) fx(0, { k: "lp", f0: 20000, f1: 520, n: 0.5 });
    if (r.build) {
      const from = r.wash ? 8 : 0;
      fx(from, { k: "lp", f0: r.wash ? 520 : 1000, f1: 18000, n: (16 - from) / 4 });
      put("~sweep", from, toneOf(h, 0, 48), 16 - from, r.wash ? 0.75 : 0.85);
      const hits = [];
      if (!r.wash) hits.push(0, 2, 4, 6);
      hits.push(8, 9, 10, 11, 12, 12.5, 13, 13.5, 14, 14.5);
      hits.forEach(function (s, i) { put("~roll", s, null, 1, 0.3 + 0.7 * Math.pow((i + 1) / hits.length, 1.3)); });
      fx(15, { k: "gap", lo: 0.06, n: 0.25 });
    }
  }
  /* the remix's shape of a level, bar by bar, from its energy digits: a drop where the energy climbs to 3 or more */
  function remixPlan(E) {
    const n = E.length, drop = function (b) { return b < n && E[b] >= 3 && E[b] > (b ? E[b - 1] : 0); };
    return E.map(function (e, b) {
      const build = drop(b + 1);
      return { peak: e >= 3, climax: e >= 4, drop: drop(b), build: build, wash: build && b > 0 && e < E[b - 1] };
    });
  }
  /* the theme of a level (or of the home screen, n 0) */
  function themeOf(def) { return typeof THEMES !== "undefined" && THEMES[def.n] || null; }
  /* A level's song, written out as events: its theme's form, section by section and bar by bar (a bar's notes from
     SYNTH.renderBar, so on the same integer grid), the closing sting after the last bar, and for the home loop its
     passes one after another (the scheduler then loops them). The form must fill the level exactly. */
  const ROLEG = { lead: "l", answer: "a", harmony: "h", bass: "b", drums: "d", fx: "x", course: "c", remix: "r" };
  function makeSong(def, L, loop) {
    const T = themeOf(def);
    if (!T) throw new Error("[music] " + def.name + " has no theme in js/themes.js");
    const bpm = def.mu[0], th = SYNTH.compileTheme(T), spb = 60 / bpm, st = spb / 4;
    if (T.bpm !== bpm) throw new Error("[music] the theme of " + def.name + " is at " + T.bpm + " bpm, the level at " + bpm);
    const ver = { scale: SYNTH.SCALES[T.scale], transpose: 0, swing: T.swing || 0, overtime: null };
    const S = { bpm: bpm, spb: spb, theme: loop ? T : withLayers(T), chart: L.chart, energy: L.energy, bars: L.bars, sw16: ver.swing * st,
      seed: hash(def.name), loop: !!loop, endBeat: L.endX / 4, T: L.T, combo: loop ? {} : comboBars(L) };
    const R = rng(S.seed ^ 0x51ED), ev = [], harm = [], kicks = [];
    let bar = 0;
    const write = function (name, pass) {
      const sec = th.sections[name];
      for (let b = 0; b < sec.bars; b++, bar++) {
        const bev = SYNTH.renderBar(th, ver, sec, b, pass, 0);
        harm[bar] = { chord: sec.chords[b % sec.chords.length], scale: ver.scale, base: T.tonic + (sec.transpose || 0) };
        kicks[bar] = kickSteps(T, bev);
        for (const e of bev) {
          /* a little life: never two notes exactly alike */
          ev.push({ y: "t", c: e.channel, b: (bar * 16 + e.step) / 4, o: e.step % 2 ? ver.swing * st : 0, m: e.midi, ms: e.midis, n: e.len, v: Math.min(1, e.vel * (0.95 + R() * 0.1)), cents: e.cents });
        }
      }
    };
    for (let p = 0; p < (loop ? T.passes || 1 : 1); p++) for (const name of loop ? T.loop : T.form) write(name, p);
    if (!loop && bar !== L.bars) throw new Error("[music] the theme of " + def.name + " is " + bar + " bars long, the level " + L.bars);
    S.cycle = bar * 4;
    if (!loop && T.end) write(T.end, 0);
    /* the course and the remix (not on the home loop) */
    if (!loop) {
      const plan = remixPlan(L.energy);
      for (let b = 0; b < L.bars; b++) { courseBar(S, L, b, harm[b], ev, true); remixBar(S, b, plan[b], harm[b], kicks[b], ev); }
    }
    /* the combo cue: a soft riser across the second half of the bar before a combo */
    const rc = T.channels.riser;
    if (rc) for (const k in S.combo) { const b = +k - 1; if (b >= 0 && b < L.bars) ev.push({ y: "t", c: "riser", b: b * 4 + 2, o: 0, m: T.tonic + 12 * (rc.octave || 0), n: 8, v: 0.5 }); }
    ev.forEach(function (e) { e.t = e.b + e.o / spb; });
    ev.sort(function (a, b) { return a.t - b.t; });
    S.ev = ev;
    return S;
  }
  /* ---------------- streams (Infinite Shadow) ----------------
     An endless song, written bar by bar as the world is (extend() after the generator appends chunks), on the same
     integer grid and with the same notes as makeSong. Each bar plays the section of its phase in the generator's wave
     (T.phases), in that phase's mode (T.modes), with a crash where a peak starts, a fill into one, and the breather's
     riser. The pair of instruments that leads follows the biome's world family (T.pairs): the sections' counter-lines,
     written for "ans", move to the pair's answer instrument. The lead is the action line: on every chart cell that asks
     for an action it plays the home hook's note at that moment (snapped to a chord tone on the beat), straight on the
     half-beat with no swing; a roll is an octave lower and accented. The course layer cues its hazards and zones and
     the remix builds into each peak (see above), from the wave's phases. A combo piece gets the soft riser in the bar
     before it. Bars are written one behind the generator, so a combo
     that starts a new chunk can still mark the bar before it. The scheduler drops what it has played (makeStream songs
     have stream: true), so the list stays short however long the run. */
  const degSemis = function (scale, d) { const k = d - 1, o = Math.floor(k / 7), i = ((k % 7) + 7) % 7; return scale[i] + 12 * o; };
  function makeStream(def, g) {
    const T = themeOf(def);
    if (!T || !T.phases) throw new Error("[music] " + def.name + " has no stream theme in js/themes.js");
    const bpm = def.mu[0], th = SYNTH.compileTheme(T), spb = 60 / bpm;
    if (T.bpm !== bpm) throw new Error("[music] the theme of " + def.name + " is at " + T.bpm + " bpm, the run at " + bpm);
    /* chart: the stream's own array, read each time (it is replaced when it grows) */
    const S = { bpm: bpm, spb: spb, theme: withLayers(T), th: th, stream: true, loop: false, cycle: 0, g: g, get chart() { return g.L.chart; }, energy: g.L.energy, bars: 0, sw16: (T.swing || 0) * spb / 4,
      combo: {}, ci: 0, written: 0, ev: [], seed: hash("inf:" + g.seed), endBeat: Infinity, T: null };
    S.R = rng(S.seed ^ 0x51ED);
    /* the count-in: four sticks in the bar before the first */
    const ver = { scale: SYNTH.SCALES[T.scale], transpose: 0, swing: 0, overtime: null };
    if (T.countIn) for (const e of SYNTH.renderBar(th, ver, th.sections[T.countIn], 0, 0, 0)) S.ev.push({ y: "t", c: e.channel, b: (e.step - 16) / 4, o: 0, t: (e.step - 16) / 4, m: e.midi, n: e.len, v: e.vel });
    extend(S);
    return S;
  }
  function writeBar(S, b, out) {
    const g = S.g, T = S.theme, th = S.th, L = g.L, st = S.spb / 4;
    const ph = g.phaseOf(b), nx = g.phaseOf(b + 1), sec = th.sections[T.phases[ph.ph]];
    const inPh = b - ph.b0, bi = inPh % sec.bars, pass = Math.floor(b / 16) % 4, last = b === ph.b0 + ph.n - 1;
    const scale = SYNTH.SCALES[(T.modes && T.modes[ph.ph]) || T.scale], ver = { scale: scale, transpose: 0, swing: T.swing || 0, overtime: null };
    const fill = last && T.fill && T.fill[nx.ph] && nx.ph !== ph.ph;
    const sc = Object.assign({}, sec, { crash: inPh === 0 && !!(T.crash && T.crash[ph.ph]), riser: ph.ph === "rest" ? 1 : 0, fill: fill ? "fill" : null, bars: fill ? bi + 1 : bi + 2 });
    const pair = T.pairs[INF.FAM[g.biomeAt(b).w]] || T.pairs.hall, lead = T.channels[pair[0]], ans = T.channels[pair[1]];
    const shift = 12 * ((ans.octave || 0) - (T.channels.ans.octave || 0)), bev = SYNTH.renderBar(th, ver, sc, bi, pass, 0);
    for (const e of bev) {
      let c = e.channel, m = e.midi, ms = e.midis;
      if (c === "ans") { c = pair[1]; if (m !== undefined) m += shift; if (ms) ms = ms.map(function (x) { return x + shift; }); }
      out.push({ y: "t", c: c, b: (b * 16 + e.step) / 4, o: e.step % 2 ? ver.swing * st : 0, m: m, ms: ms, n: e.len, v: Math.min(1, e.vel * (0.95 + S.R() * 0.1)), cents: e.cents });
    }
    /* the action line */
    const hook = th.parts[T.hook], hl = hook.steps, chord = sec.chords[bi % sec.chords.length], cells = [];
    for (let c = 0; c < 8; c++) { const v = L.chart[b * 8 + c - (L.c00 || 0)]; if (v) cells.push([c, v]); }
    const tones = [chord.degree, chord.degree + 2, chord.degree + 4];
    cells.forEach(function (cv, k) {
      const c = cv[0], v = cv[1], gs = ((b * 16 + c * 2) % hl + hl) % hl;
      let he = hook.events[0];
      for (const e of hook.events) { if (e.step <= gs) he = e; else break; }
      let d = he.value;
      if (c % 2 === 0) {
        /* on the beat, the nearest chord tone */
        let best = d, bd = 99;
        for (const t0 of tones) for (let o = -14; o <= 14; o += 7) { const t = t0 + o, dd = Math.abs(degSemis(scale, t) - degSemis(scale, d)); if (dd < bd) { bd = dd; best = t; } }
        d = best;
      }
      const next = k + 1 < cells.length ? cells[k + 1][0] : 8, len = Math.max(2, Math.min(4, (next - c) * 2));
      let m = T.tonic + degSemis(scale, d) + (c % 2 ? he.acc : 0) + 12 * (he.octave + (lead.octave || 0));
      if (v === 2) m -= 12;
      out.push({ y: "t", c: pair[0], b: (b * 16 + c * 2) / 4, o: 0, m: m, n: len, v: v === 2 ? 1 : 0.85 });
    });
    /* the course (hazards and zones; the lead already plays the actions) and the remix, from the wave's phases */
    const h = { chord: chord, scale: scale, base: T.tonic }, peak = ph.ph === "peak" || ph.ph === "peak2";
    const build = last && (nx.ph === "peak" || nx.ph === "peak2") && nx.ph !== ph.ph;
    courseBar(S, L, b, h, out, false);
    remixBar(S, b, { peak: peak, climax: ph.ph === "peak2", drop: peak && inPh === 0, build: build, wash: ph.ph === "rest" && inPh === 0 }, h, kickSteps(T, bev), out);
    /* where two worlds meet (the fracture): a sweep up into it and a boom on it, unless a build or a drop is there already */
    const w = g.biomeAt(b).w;
    if (b > 0 && w !== g.biomeAt(b - 1).w && !(peak && inPh === 0)) at16(out, S.sw16, "~boom", b * 16, null, 1, 0.8);
    if (w !== g.biomeAt(b + 1).w && !build) at16(out, S.sw16, "~sweep", b * 16 + 8, toneOf(h, 0, 48), 8, 0.6);
    /* the combo cue: a soft riser across the second half of the bar before a combo */
    const rc = T.channels.riser;
    if (rc && S.combo[b + 1]) out.push({ y: "t", c: "riser", b: b * 4 + 2, o: 0, m: T.tonic + 12 * (rc.octave || 0), n: 8, v: 0.5 });
  }
  /* write the bars the generator has added since the last call (all but its last bar, see above) */
  function extend(S) {
    if (!S || !S.stream) return 0;
    const g = S.g, out = [];
    for (; S.ci < g.chunks.length; S.ci++) { const c = g.chunks[S.ci]; if (c.combo && c.cx0 !== undefined) S.combo[Math.floor(c.cx0 / 16)] = 1; }
    const to = g.bars - 1, from = S.written;
    while (S.written < to) writeBar(S, S.written++, out);
    if (!out.length) return 0;
    out.forEach(function (e) { e.t = e.b + e.o / S.spb; });
    out.sort(function (a, b) { return a.t - b.t; });
    for (const e of out) S.ev.push(e);
    S.bars = S.written;
    return S.written - from;
  }
  /* a theme's bus: its channels (made on first use), the kick's pump, its own reverb and ping-pong delay */
  function newThemeBus(S, at) {
    const c = ctx, T = S.theme, b = { out: c.createGain(), lv: c.createGain(), mix: c.createGain(), pump: c.createGain(), src: [], act: [], at: at, strips: {}, last: {} };
    b.lv.gain.value = (T.level || 1) * Math.pow(10, (T.trim || 0) / 20);
    const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 30; hp.Q.value = .6;
    /* the remix's low-pass and drop-out gate on the whole theme (its reverb and delay included); post goes past them */
    b.lp = c.createBiquadFilter(); b.lp.type = "lowpass"; b.lp.frequency.value = 20000; b.lp.Q.value = 2;
    b.gate = c.createGain(); b.post = c.createGain();
    b.pump.connect(b.mix); b.mix.connect(b.lp); b.lp.connect(b.gate); b.gate.connect(b.lv); b.post.connect(b.lv); b.lv.connect(hp); hp.connect(b.out); b.out.connect(mix);
    const rv = c.createConvolver(), rvOut = c.createGain(), RV = T.reverb || {};
    rv.buffer = cache.bank.reverb(RV.seconds || 2.4, RV.damp === undefined ? .5 : RV.damp); rvOut.gain.value = RV.level === undefined ? 1 : RV.level;
    b.rv = c.createGain(); b.rv.connect(rv); rv.connect(rvOut); rvOut.connect(b.lp);
    const DL = T.delay || {}, dIn = c.createGain(), L = c.createDelay(2), Rt = c.createDelay(2), fb = c.createGain(), damp = c.createBiquadFilter(), mg = c.createChannelMerger(2), dOut = c.createGain();
    L.delayTime.value = Rt.delayTime.value = Math.min(1.9, (DL.beats || .75) * S.spb); fb.gain.value = DL.feedback === undefined ? .3 : DL.feedback;
    damp.type = "lowpass"; damp.frequency.value = 3200; dOut.gain.value = DL.level === undefined ? .8 : DL.level;
    dIn.connect(L); L.connect(mg, 0, 0); L.connect(Rt); Rt.connect(mg, 0, 1); Rt.connect(fb); fb.connect(damp); damp.connect(L); mg.connect(dOut); dOut.connect(b.lp);
    b.dl = dIn;
    return b;
  }
  function themeStrip(name, spec) {
    let s = bus.strips[name];
    if (s) return s;
    const c = ctx, pn = c.createStereoPanner(); s = c.createGain();
    s.gain.value = spec.gain === undefined ? 1 : spec.gain; pn.pan.value = spec.pan || 0;
    s.connect(pn); pn.connect(spec.post ? bus.post : spec.pump ? bus.pump : bus.mix);
    if (spec.reverb) { const g = c.createGain(); g.gain.value = spec.reverb; pn.connect(g); g.connect(bus.rv); }
    if (spec.delay) { const g = c.createGain(); g.gain.value = spec.delay; pn.connect(g); g.connect(bus.dl); }
    return (bus.strips[name] = s);
  }
  /* one note of a theme, on its channel's instrument (SYNTH.playNote); the kick's channel pumps the pads */
  function themeNote(e, t) {
    const T = song.theme, spec = T.channels[e.c];
    if (!spec) return;
    const note = { midi: e.m, midis: e.ms, freq: e.m === undefined ? undefined : SYNTH.midiToFreq(e.m), dur: e.n * song.spb / 4 * (spec.legato || 0.92), vel: e.v };
    if (e.ms) note.freqs = e.ms.map(SYNTH.midiToFreq);
    if (spec.glide && e.m !== undefined) { const prev = bus.last[e.c]; if (prev !== undefined && prev !== e.m) note.from = SYNTH.midiToFreq(prev); bus.last[e.c] = e.m; }
    const sp = e.cents === undefined ? spec : Object.assign({}, spec, { params: Object.assign({}, spec.params, { cents: e.cents }) });
    const end = SYNTH.playNote(ctx, themeStrip(e.c, spec), cache.bank, sp, t, note);
    if (spec.duck) { const g = bus.pump.gain; g.setTargetAtTime(1 - spec.duck, t, .004); g.setTargetAtTime(1, t + .03, song.spb * .16); }
    const A = bus.act;
    for (let i = A.length - 1; i >= 0; i--) if (A[i].e <= t) A.splice(i, 1);
    A.push({ e: end }); if (A.length > stats.maxV) stats.maxV = A.length;
  }

  /* ---------------- scheduler ----------------
     Every event sits at t0 + (cycle · loop length + b) · spb + its groove offset; b comes from an integer grid tick,
     so nothing accumulates. Events more than LATE behind the audio clock (a hiccup, a hidden tab) are skipped, never
     bunched up at the current time. What time a call has left (up to 3 ms) renders the tones of the notes in the next
     WARM seconds, one at a time, so a new section's notes are ready before it starts and no call renders several. */
  function schedule() {
    if (!song || !ctx || !bus) return;
    const w0 = offline ? 0 : performance.now(), now = ctx.currentTime, until = now + (offline ? 1e9 : LOOK), E = song.ev, spb = song.spb;
    if (song.stream && ei > 256) { E.splice(0, ei); wi = Math.max(0, wi - ei); ei = 0; }
    for (;;) {
      if (ei >= E.length) { if (!song.loop) break; ei = 0; cyc++; }
      const e = E[ei], t = t0 + (cyc * song.cycle + e.t) * spb - PROC;
      if (t >= until) break;
      /* a busy downbeat (a new chord on every part) is spread over a few calls: stop after ~4 ms of work while the
         next event is still well ahead, so no single call costs a frame */
      if (!offline && t > now + .08 && performance.now() - w0 > 4) break;
      ei++;
      /* a late note is dropped; a late filter move still happens, from where it would be by now */
      if (t < now - LATE) { if (e.y === "f") fxAt(e, t, now); else stats.skipped++; continue; }
      play(e, Math.max(t, now));
    }
    if (!offline) {
      /* a stream (Infinite Shadow) does its warming at the end of the game's frames (warm below); here only what is
         due within 2 seconds, in case those frames had no time to spare */
      if (song.stream) warmUntil(w0, 1.2, 2); else warmUntil(w0, 3, WARM);
      stats.worst = Math.max(stats.worst, performance.now() - w0);
    }
  }
  /* render the tones of the notes in the next `ahead` seconds, one at a time, while less than `cap` ms have passed
     since w0 (a tone can take several milliseconds, and one is never split) */
  function warmUntil(w0, cap, ahead) {
    if (!song || !ctx) return;
    const E = song.ev, spb = song.spb, now = ctx.currentTime;
    if (wcyc < cyc || (wcyc === cyc && wi < ei)) { wcyc = cyc; wi = ei; }
    while (performance.now() - w0 < cap) {
      if (wi >= E.length) { if (!song.loop) break; wi = 0; wcyc++; }
      const e = E[wi], sp = song.theme.channels[e.c];
      if (t0 + (wcyc * song.cycle + e.t) * spb > now + ahead) break;
      wi++;
      if (sp && sp.tone) for (const n of e.ms || [e.m]) cache.bank.tone(sp.tone, n);
      else if (sp && sp.drum) cache.bank.drum(sp.drum, sp.opts || {});
    }
  }
  /* a stream's warming, for the game to call once a frame is drawn with what is left of it: the tones of the next 8
     seconds (each world brings a new pair of instruments), as many as fit in `ms` */
  function warm(ms) { if (song && song.stream && ms > 0) warmUntil(performance.now(), ms, 8); }
  /* the layers' drums, made ahead with what the home screen's frames leave, one at a time (a drum is never split), so
     the first level of a session doesn't make them as it starts; they stay for every song after */
  let layerDrums = null;
  function warmLayers(ms) {
    if (!ctx || !cache || offline) return;
    if (!layerDrums) layerDrums = Object.keys(LAYER).filter(function (k) { return LAYER[k].drum; });
    const w0 = performance.now();
    while (layerDrums.length && performance.now() - w0 < ms) { const sp = LAYER[layerDrums.shift()]; cache.bank.drum(sp.drum, sp.opts || {}); }
  }
  function play(e, t) { stats.played++; if (e.y === "f") fxAt(e, t); else themeNote(e, t); }
  /* the bus's own automation (the remix's low-pass and drop-out). `at` is when the event is due; given `now` (a late
     event, or the state a song starts in), it is applied from then on, where it would be by that time */
  function fxAt(e, at, now) {
    if (!bus) return;
    if (now === undefined) now = at;
    const end = at + (e.n || 0) * song.spb;
    if (e.k === "lp") {
      const p = bus.lp.frequency;
      p.cancelScheduledValues(now);
      if (now >= end) { p.setValueAtTime(e.f1, now); return; }
      p.setValueAtTime(e.f0 * Math.pow(e.f1 / e.f0, Math.max(0, now - at) / (end - at)), now);
      p.exponentialRampToValueAtTime(e.f1, end);
    } else if (e.k === "gap") {
      const g = bus.gate.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(1, now);
      if (now >= end) return;
      g.linearRampToValueAtTime(e.lo, now + 0.008);
      g.setValueAtTime(e.lo, Math.max(now + 0.008, end - 0.006));
      g.linearRampToValueAtTime(1, end);
    }
  }
  /* a theme's drums, its reverb, the noise and the tones of its first bars, made before it starts so the first bars
     never stall on them (the rest render as the scheduler reaches them, a third of a second ahead); other songs'
     tones let go */
  function prepare(S, from) {
    const T = S.theme, bank = cache.bank, keep = {}, RV = T.reverb || {};
    const use = function (key) { keep[key] = 1; };
    bank.reverb(RV.seconds || 2.4, RV.damp === undefined ? .5 : RV.damp); use("reverb:" + (RV.seconds || 2.4) + ":" + (RV.damp === undefined ? .5 : RV.damp)); bank.noise(); use("noise");
    for (const e of S.ev) {
      const sp = T.channels[e.c]; if (!sp) continue;
      const lb = (S.loop ? e.b % S.cycle : e.b) - (S.loop ? (from || 0) % S.cycle : from || 0), soon = lb >= 0 && lb < 12;
      /* the theme's drums all now; a layer's (channels "~...") only for the first bars, the rest warm ahead (warmUntil) */
      if (sp.drum) { if (soon || e.c[0] !== "~") bank.drum(sp.drum, sp.opts || {}); use("drum:" + sp.drum + ":" + JSON.stringify(sp.opts || {})); }
      else if (sp.tone) for (const n of e.ms || [e.m]) { if (soon) bank.tone(sp.tone, n); use("tone:" + sp.tone + ":" + Math.round(n)); }
    }
    if (S.stream) for (const k in T.channels) { const sp = T.channels[k]; if (sp.drum && k[0] !== "~") { bank.drum(sp.drum, sp.opts || {}); use("drum:" + sp.drum + ":" + JSON.stringify(sp.opts || {})); } }
    for (const k of Array.from(bank.cache.keys())) if (!keep[k] && k.indexOf("drum:") !== 0) bank.cache.delete(k);
  }
  function start(S, fromBeat) {
    if (!ctx) return 0;
    stop(0.05);
    prepare(S, fromBeat || 0);
    /* the bus first (its reverb takes a moment to set up), then the clock, so the first notes are never late */
    song = S; bus = newThemeBus(S, ctx.currentTime);
    const fb = fromBeat || 0, now = ctx.currentTime;
    t0 = now + 0.1 - fb * S.spb;
    bus.out.gain.setValueAtTime(0, now); bus.out.gain.linearRampToValueAtTime(1, now + 0.05);
    /* the first event at or after fromBeat; held chords (a synth's harmony) that started earlier come back in softly */
    cyc = S.loop ? Math.floor(fb / S.cycle) : 0;
    const local = fb - cyc * S.cycle, E = S.ev;
    let lo = 0, hi = E.length; while (lo < hi) { const md = (lo + hi) >> 1; if (E[md].t < local - 1e-9) lo = md + 1; else hi = md; }
    ei = lo; wi = lo; wcyc = cyc;
    if (fb > 0) for (let i = 0; i < lo; i++) {
      const e = E[i], sp = S.theme.channels[e.c] || {}, left = e.b + e.n / 4 - local;
      if (sp.synth && sp.role === "harmony" && left > .25) play(Object.assign({}, e, { n: left * 4 }), t0 + fb * S.spb - PROC);
    }
    /* the remix's low-pass where it would be at fromBeat (inside a build or a breather's wash) */
    for (let i = lo - 1; i >= 0; i--) if (E[i].y === "f" && E[i].k === "lp") { fxAt(E[i], t0 + E[i].t * S.spb - PROC, t0 + local * S.spb - PROC); break; }
    schedule();
    if (!timer && !offline) timer = setInterval(schedule, TICK);
    return t0;
  }
  function stop(fade) {
    if (!ctx || !bus) { song = null; return; }
    const b = bus, f = fade === undefined ? 0.08 : fade, now = ctx.currentTime, g = b.out.gain;
    try { if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now); else { g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); } g.linearRampToValueAtTime(0, now + f); } catch (e) {}
    for (const s of b.src) try { s.stop(now + f + .05); } catch (e) {}
    if (!offline) setTimeout(function () { try { b.out.disconnect(); } catch (e) {} }, f * 1000 + 250);
    bus = null; song = null;
  }
  function beat() {
    if (!ctx || !song) return null;
    const lat = Math.min(0.3, ctx.outputLatency || ctx.baseLatency || 0);
    return (ctx.currentTime - lat - t0) / song.spb;
  }
  /* pause and resume fade the output over a few milliseconds around the context's suspend, so neither clicks */
  function suspend() {
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime; clearTimeout(susT);
    pz.gain.cancelScheduledValues(now); pz.gain.setValueAtTime(pz.gain.value, now); pz.gain.linearRampToValueAtTime(0, now + .012);
    return new Promise(function (res) { susT = setTimeout(function () { susT = 0; if (ctx.state === "running") ctx.suspend().then(res, res); else res(); }, 22); });
  }
  function resume() {
    if (!ctx) return;
    if (susT) { clearTimeout(susT); susT = 0; }
    const up = function () { const now = ctx.currentTime; pz.gain.cancelScheduledValues(now); pz.gain.setValueAtTime(pz.gain.value, now); pz.gain.linearRampToValueAtTime(1, now + .015); };
    if (ctx.state !== "running") return ctx.resume().then(up);
    up();
  }
  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { build(new AC({ latencyHint: "interactive" })); } catch (e) { try { build(new AC()); } catch (e2) { return false; } }
    /* the effects output exists from the start: a brand-new compressor is close to silent for its first moments
       (Chrome), which would swallow the first death sound */
    try { fxOut(); } catch (e) {}
    return true;
  }

  /* ---------------- sound effects ----------------
     The death sound, hiyroscript/vl's "miss": a sawtooth falling 150 -> 48 Hz through a lowpass, over white noise
     whose lowpass closes 900 -> 120 Hz, about 0.35 s in all. It goes through its own compressor and gain straight to
     the destination (vl: threshold -14, ratio 6, attack 3 ms, then 0.9), never through the music's `mix` or a song bus, so
     the music volume and the fade-out MUSIC.stop starts at the same moment don't touch it. Built by init() on the live
     context only; the offline render never builds or plays it. */
  let fx = null;
  function fxOut() {
    if (fx && fx.ctx === ctx) return fx;
    const c = ctx.createDynamicsCompressor(), g = ctx.createGain();
    c.threshold.value = -14; c.ratio.value = 6; c.attack.value = .003;
    g.gain.value = .9; c.connect(g); g.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * .7), nb = ctx.createBuffer(1, len, ctx.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    fx = { ctx: ctx, out: c, noise: nb };
    return fx;
  }
  /* vl's tone: frequency f -> f2 (exponential) over d, gain 0.0001 -> g in 6 ms -> 0.0001 at t + d, optional lowpass */
  function fxTone(t, o) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(o.f, t); osc.frequency.exponentialRampToValueAtTime(o.f2 || o.f, t + o.d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.g, t + .006); g.gain.exponentialRampToValueAtTime(0.0001, t + o.d);
    if (o.filter) { const fl = ctx.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = o.filter; osc.connect(fl); fl.connect(g); }
    else osc.connect(g);
    g.connect(fx.out); osc.start(t); osc.stop(t + o.d + .03);
  }
  /* vl's noise: white noise through a lowpass (Q 1) closing f -> f2 over d, gain 0.0001 -> g in 4 ms -> 0.0001 at t + d */
  function fxNoise(t, o) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = fx.noise; fl.type = "lowpass"; fl.Q.value = 1;
    fl.frequency.setValueAtTime(o.f, t); fl.frequency.exponentialRampToValueAtTime(o.f2, t + o.d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.g, t + .004); g.gain.exponentialRampToValueAtTime(0.0001, t + o.d);
    s.connect(fl); fl.connect(g); g.connect(fx.out); s.start(t); s.stop(t + o.d + .03);
  }
  const sfx = {
    /* the spike tip's rewind, d s long: a tape whirr (a sawtooth sweeping up, chopped faster and faster, over a rising
       hiss) and a soft clunk as the tape catches */
    rewind: function (d) {
      if (!ctx || offline || ctx.state !== "running") return;
      fxOut(); const t = ctx.currentTime;
      const osc = ctx.createOscillator(), fl = ctx.createBiquadFilter(), trem = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
      osc.type = "sawtooth"; osc.frequency.setValueAtTime(140, t); osc.frequency.exponentialRampToValueAtTime(900, t + d * .8); osc.frequency.exponentialRampToValueAtTime(320, t + d);
      fl.type = "lowpass"; fl.frequency.value = 1600;
      trem.gain.value = .5; lfo.frequency.setValueAtTime(12, t); lfo.frequency.linearRampToValueAtTime(30, t + d); lg.gain.value = .5;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(.08, t + .05); g.gain.setValueAtTime(.08, t + d * .85); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      lfo.connect(lg); lg.connect(trem.gain); osc.connect(fl); fl.connect(trem); trem.connect(g); g.connect(fx.out);
      osc.start(t); lfo.start(t); osc.stop(t + d + .05); lfo.stop(t + d + .05);
      fxNoise(t, { f: 500, f2: 4200, d: d, g: .05 });
      fxTone(t + d - .02, { f: 220, f2: 90, d: .09, type: "square", g: .1, filter: 900 });
    },
    die: function () {
      if (!ctx || offline || ctx.state !== "running") return;
      fxOut(); const t = ctx.currentTime;
      fxTone(t, { f: 150, f2: 48, d: .34, type: "sawtooth", g: .24, filter: 700 });
      fxNoise(t, { f: 900, f2: 120, d: .3, g: .18 });
    }
  };

  /* Offline render, used by the test harness (tools/music-check.js, in a browser) to check every track is audible,
     unclipped and level-matched: at full volume, with the voice count and the events skipped. */
  function renderStats(def, L, seconds, opt) {
    const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const sr = (opt && opt.sr) || 22050, oc = new OC(2, Math.ceil(sr * seconds), sr), keep = [ctx, mix, volG, pz, song, bus, cache, t0, ei, cyc, vol];
    offline = true; vol = 1; build(oc);
    const S = opt && opt.song ? opt.song : makeSong(def, L, !!(opt && opt.loop)); song = S;
    prepare(S); t0 = 0.05; ei = 0; cyc = 0; stats.maxV = 0; stats.skipped = 0; stats.played = 0;
    bus = newThemeBus(S, 0); bus.out.gain.value = 1;
    const span = seconds - .3; let n = 0;
    /* opt.only: render a stem, just these groups (l lead, a answers, h harmony, b bass, d drums, x effects) */
    const only = opt && opt.only, grp = function (e) { return ROLEG[(S.theme.channels[e.c] || {}).role] || "x"; };
    for (;;) { if (ei >= S.ev.length) { if (!S.loop) break; ei = 0; cyc++; } const e = S.ev[ei], t = t0 + (cyc * S.cycle + e.t) * S.spb - PROC; if (t >= span) break; ei++; if (only && e.y !== "f" && only.indexOf(grp(e)) < 0) continue; play(e, Math.max(0, t)); n++; }
    const st = { voices: stats.maxV, events: n };
    const p = oc.startRendering();
    offline = false; ctx = keep[0]; mix = keep[1]; volG = keep[2]; pz = keep[3]; song = keep[4]; bus = keep[5]; cache = keep[6]; t0 = keep[7]; ei = keep[8]; cyc = keep[9]; vol = keep[10];
    /* peak and RMS of the whole render, plus the RMS of each second (to see where the song stops) */
    return p.then(function (buf) {
      const d0 = buf.getChannelData(0), d1 = buf.getChannelData(1); let pk = 0, pi = 0, sum = 0; const secs = [];
      for (let i = 0; i < d0.length; i++) { const v = Math.max(Math.abs(d0[i]), Math.abs(d1[i])); if (v > pk) { pk = v; pi = i; } const q = (d0[i] * d0[i] + d1[i] * d1[i]) / 2; sum += q; const k = Math.floor(i / sr); secs[k] = (secs[k] || 0) + q; }
      return { peak: +pk.toFixed(3), peakAt: +(pi / sr).toFixed(3), rms: +Math.sqrt(sum / d0.length).toFixed(4), secs: secs.map(function (x) { return +Math.sqrt(x / sr).toFixed(4); }),
        voices: st.voices, events: st.events, buffer: opt && opt.keep ? buf : undefined };
    });
  }
  return {
    init: init, makeSong: makeSong, makeStream: makeStream, extend: extend, start: start, stop: stop, beat: beat, schedule: schedule, renderStats: renderStats, sfx: sfx,
    get ctx() { return ctx; }, get song() { return song; }, get t0() { return t0; }, get stats() { return stats; },
    setVol: function (v) { vol = v; if (volG) volG.gain.setTargetAtTime(v, ctx.currentTime, .03); },
    resume: resume, suspend: suspend, warm: warm, warmLayers: warmLayers,
    /* for tools/music-check.js and the developer screen only */
    _t: { themeOf: themeOf, TPQ: TPQ, PROC: PROC }
  };
})();
