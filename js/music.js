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
  const LOOK = 0.3, TICK = 25, LATE = 0.02;
  function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  /* ---------------- engine ---------------- */
  let ctx = null, mix = null, volG = null, pz = null, song = null, bus = null, cache = null;
  let t0 = 0, ei = 0, cyc = 0, vol = 0.8, timer = 0, offline = false, susT = 0;
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
  /* the theme of a level (or of the home screen, n 0) */
  function themeOf(def) { return typeof THEMES !== "undefined" && THEMES[def.n] || null; }
  /* A level's song, written out as events: its theme's form, section by section and bar by bar (a bar's notes from
     SYNTH.renderBar, so on the same integer grid), the closing sting after the last bar, and for the home loop its
     passes one after another (the scheduler then loops them). The form must fill the level exactly. */
  const ROLEG = { lead: "l", answer: "a", harmony: "h", bass: "b", drums: "d", fx: "x" };
  function makeSong(def, L, loop) {
    const T = themeOf(def);
    if (!T) throw new Error("[music] " + def.name + " has no theme in js/themes.js");
    const bpm = def.mu[0], th = SYNTH.compileTheme(T), spb = 60 / bpm, st = spb / 4;
    if (T.bpm !== bpm) throw new Error("[music] the theme of " + def.name + " is at " + T.bpm + " bpm, the level at " + bpm);
    const ver = { scale: SYNTH.SCALES[T.scale], transpose: 0, swing: T.swing || 0, overtime: null };
    const S = { bpm: bpm, spb: spb, theme: T, chart: L.chart, energy: L.energy, bars: L.bars,
      seed: hash(def.name), loop: !!loop, endBeat: L.endX / 4, T: L.T, combo: loop ? {} : comboBars(L) };
    const R = rng(S.seed ^ 0x51ED), ev = [];
    let bar = 0;
    const write = function (name, pass) {
      const sec = th.sections[name];
      for (let b = 0; b < sec.bars; b++, bar++) for (const e of SYNTH.renderBar(th, ver, sec, b, pass, 0)) {
        /* a little life: never two notes exactly alike */
        ev.push({ y: "t", c: e.channel, b: (bar * 16 + e.step) / 4, o: e.step % 2 ? ver.swing * st : 0, m: e.midi, ms: e.midis, n: e.len, v: Math.min(1, e.vel * (0.95 + R() * 0.1)), cents: e.cents });
      }
    };
    for (let p = 0; p < (loop ? T.passes || 1 : 1); p++) for (const name of loop ? T.loop : T.form) write(name, p);
    if (!loop && bar !== L.bars) throw new Error("[music] the theme of " + def.name + " is " + bar + " bars long, the level " + L.bars);
    S.cycle = bar * 4;
    if (!loop && T.end) write(T.end, 0);
    /* the combo cue: a soft riser across the second half of the bar before a combo */
    const rc = T.channels.riser;
    if (rc) for (const k in S.combo) { const b = +k - 1; if (b >= 0 && b < L.bars) ev.push({ y: "t", c: "riser", b: b * 4 + 2, o: 0, m: T.tonic + 12 * (rc.octave || 0), n: 8, v: 0.5 }); }
    ev.forEach(function (e) { e.t = e.b + e.o / spb; });
    ev.sort(function (a, b) { return a.t - b.t; });
    S.ev = ev;
    return S;
  }
  /* a theme's bus: its channels (made on first use), the kick's pump, its own reverb and ping-pong delay */
  function newThemeBus(S, at) {
    const c = ctx, T = S.theme, b = { out: c.createGain(), lv: c.createGain(), mix: c.createGain(), pump: c.createGain(), src: [], act: [], at: at, strips: {}, last: {} };
    b.lv.gain.value = (T.level || 1) * Math.pow(10, (T.trim || 0) / 20);
    const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 30; hp.Q.value = .6;
    b.pump.connect(b.mix); b.mix.connect(b.lv); b.lv.connect(hp); hp.connect(b.out); b.out.connect(mix);
    const rv = c.createConvolver(), rvOut = c.createGain(), RV = T.reverb || {};
    rv.buffer = cache.bank.reverb(RV.seconds || 2.4, RV.damp === undefined ? .5 : RV.damp); rvOut.gain.value = RV.level === undefined ? 1 : RV.level;
    b.rv = c.createGain(); b.rv.connect(rv); rv.connect(rvOut); rvOut.connect(b.lv);
    const DL = T.delay || {}, dIn = c.createGain(), L = c.createDelay(2), Rt = c.createDelay(2), fb = c.createGain(), damp = c.createBiquadFilter(), mg = c.createChannelMerger(2), dOut = c.createGain();
    L.delayTime.value = Rt.delayTime.value = Math.min(1.9, (DL.beats || .75) * S.spb); fb.gain.value = DL.feedback === undefined ? .3 : DL.feedback;
    damp.type = "lowpass"; damp.frequency.value = 3200; dOut.gain.value = DL.level === undefined ? .8 : DL.level;
    dIn.connect(L); L.connect(mg, 0, 0); L.connect(Rt); Rt.connect(mg, 0, 1); Rt.connect(fb); fb.connect(damp); damp.connect(L); mg.connect(dOut); dOut.connect(b.lv);
    b.dl = dIn;
    return b;
  }
  function themeStrip(name, spec) {
    let s = bus.strips[name];
    if (s) return s;
    const c = ctx, pn = c.createStereoPanner(); s = c.createGain();
    s.gain.value = spec.gain === undefined ? 1 : spec.gain; pn.pan.value = spec.pan || 0;
    s.connect(pn); pn.connect(spec.pump ? bus.pump : bus.mix);
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
     bunched up at the current time. */
  function schedule() {
    if (!song || !ctx || !bus) return;
    const w0 = offline ? 0 : performance.now(), now = ctx.currentTime, until = now + (offline ? 1e9 : LOOK), E = song.ev, spb = song.spb;
    for (;;) {
      if (ei >= E.length) { if (!song.loop) break; ei = 0; cyc++; }
      const e = E[ei], t = t0 + (cyc * song.cycle + e.t) * spb - PROC;
      if (t >= until) break;
      /* a busy downbeat (a new chord on every part) is spread over a few calls: stop after ~4 ms of work while the
         next event is still well ahead, so no single call costs a frame */
      if (!offline && t > now + .08 && performance.now() - w0 > 4) break;
      ei++;
      if (t < now - LATE) { stats.skipped++; continue; }
      play(e, Math.max(t, now));
    }
    if (!offline) stats.worst = Math.max(stats.worst, performance.now() - w0);
  }
  function play(e, t) { stats.played++; themeNote(e, t); }
  /* a theme's drums, its reverb, the noise and the tones of its first bars, made before it starts so the first bars
     never stall on them (the rest render as the scheduler reaches them, a third of a second ahead); other songs'
     tones let go */
  function prepare(S, from) {
    const T = S.theme, bank = cache.bank, keep = {}, RV = T.reverb || {};
    const use = function (key) { keep[key] = 1; };
    bank.reverb(RV.seconds || 2.4, RV.damp === undefined ? .5 : RV.damp); use("reverb:" + (RV.seconds || 2.4) + ":" + (RV.damp === undefined ? .5 : RV.damp)); bank.noise(); use("noise");
    for (const e of S.ev) {
      const sp = T.channels[e.c]; if (!sp) continue;
      if (sp.drum) { bank.drum(sp.drum, sp.opts || {}); use("drum:" + sp.drum + ":" + JSON.stringify(sp.opts || {})); }
      else if (sp.tone) for (const n of e.ms || [e.m]) { const lb = (S.loop ? e.b % S.cycle : e.b) - (S.loop ? (from || 0) % S.cycle : from || 0); if (lb >= 0 && lb < 12) bank.tone(sp.tone, n); use("tone:" + sp.tone + ":" + Math.round(n)); }
    }
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
    ei = lo;
    if (fb > 0) for (let i = 0; i < lo; i++) {
      const e = E[i], sp = S.theme.channels[e.c] || {}, left = e.b + e.n / 4 - local;
      if (sp.synth && sp.role === "harmony" && left > .25) play(Object.assign({}, e, { n: left * 4 }), t0 + fb * S.spb - PROC);
    }
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
    const S = makeSong(def, L, !!(opt && opt.loop)); song = S;
    prepare(S); t0 = 0.05; ei = 0; cyc = 0; stats.maxV = 0; stats.skipped = 0; stats.played = 0;
    bus = newThemeBus(S, 0); bus.out.gain.value = 1;
    const span = seconds - .3; let n = 0;
    /* opt.only: render a stem, just these groups (l lead, a answers, h harmony, b bass, d drums, x effects) */
    const only = opt && opt.only, grp = function (e) { return ROLEG[(S.theme.channels[e.c] || {}).role] || "x"; };
    for (;;) { if (ei >= S.ev.length) { if (!S.loop) break; ei = 0; cyc++; } const e = S.ev[ei], t = t0 + (cyc * S.cycle + e.t) * S.spb - PROC; if (t >= span) break; ei++; if (only && only.indexOf(grp(e)) < 0) continue; play(e, Math.max(0, t)); n++; }
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
    init: init, makeSong: makeSong, start: start, stop: stop, beat: beat, schedule: schedule, renderStats: renderStats, sfx: sfx,
    get ctx() { return ctx; }, get song() { return song; }, get t0() { return t0; }, get stats() { return stats; },
    setVol: function (v) { vol = v; if (volG) volG.gain.setTargetAtTime(v, ctx.currentTime, .03); },
    resume: resume, suspend: suspend,
    /* for tools/music-check.js and the developer screen only */
    _t: { themeOf: themeOf, TPQ: TPQ, PROC: PROC }
  };
})();
