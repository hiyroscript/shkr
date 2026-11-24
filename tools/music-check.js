#!/usr/bin/env node
/* =============================================================================
   tools/music-check.js [--render] [--perf] [tracks]

   Checks the soundtracks (js/themes.js, played by js/music.js) against the
   rules in README (Music). The first part is plain Node with built-in
   modules only: it loads sim.js, levels.js, fixes.js, synth.js, themes.js
   and music.js in a vm context and writes every song the way the game does
   (MUSIC.makeSong), headless.

     node tools/music-check.js            every track: theme, grid, groove
     node tools/music-check.js 0 7 30     some tracks (0 is the home track)
     node tools/music-check.js --render   also render every track in Chromium
     node tools/music-check.js --perf     also time the live scheduler

   Headless (always)
     theme    the theme compiles, is at the level's bpm and fills its bars
              (makeSong throws otherwise); every bar of a melody or line is 16
              sixteenths; a line only uses chord tones (R 3 5 7 8 9 10 12);
              every channel names a known instrument and a role; no chord part
              on a synth that plays one note at a time
     grid     every event sits on an integer tick (48 a beat); the closing
              sting is at bars * 4 beats, i.e. bars * 4 * spb (< 1 ms), and
              nothing else is past the last bar
     groove   every offset is the theme's swing (odd sixteenths) or nothing,
              within 8 ms

   --render (needs the pre-installed Playwright + Chromium)
     MUSIC.renderStats at 22050 Hz, full volume: peak <= 0.98, whole-song RMS
     within ±2 dB of the median, no silent second outside energy-0 bars, the
     most voices at once (<= 60), and for the home track three passes of its
     loop with no gap or spike at the seams. Prints the trim (dB) that would
     put each track on the median.
   --perf
     plays level 30 live for 15 s at 4× CPU throttling and prints the slowest
     schedule() call and the most voices.

   Exits 1 if any check fails.
   ========================================================================== */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, ".."), FILES = ["js/sim.js", "js/levels.js", "js/fixes.js", "js/synth.js", "js/themes.js", "js/music.js"];
const args = process.argv.slice(2), RENDER = args.indexOf("--render") >= 0, PERF = args.indexOf("--perf") >= 0;
const only = args.filter(function (a) { return /^\d+$/.test(a); }).map(Number);

const ctx = vm.createContext({ console: console });
FILES.forEach(function (f) { new vm.Script(fs.readFileSync(path.join(ROOT, f), "utf8"), { filename: f }).runInContext(ctx); });
const api = vm.runInContext("({ MUSIC: MUSIC, LEVELS: LEVELS, HOME: HOME, SIM: SIM, FIX: typeof FIXES !== 'undefined' ? FIXES : {} })", ctx);
const TPQ = api.MUSIC._t.TPQ;
let fails = 0;
function track(n) { const def = n ? api.LEVELS[n - 1] : api.HOME; if (n) def.fix = api.FIX[n] || []; return { def: def, L: api.SIM.compile(def) }; }
const tracks = (only.length ? only : Array.from({ length: api.LEVELS.length + 1 }, function (_, i) { return i; }));

/* ---------------------------------------------------------------- headless */
const SYN = vm.runInContext("SYNTH", ctx), CHORD_TONES = ["R", "3", "5", "7", "8", "9", "10", "12"];
const MONO = ["lead", "bass", "drone", "chant", "riser", "siren", "pulse", "tension", "flute", "calliope", "harmonica"];
/* the notation and the instruments of a theme (what compileTheme leaves to the moment a bar is played) */
function themeErrors(T) {
  const errs = [], len = function (tok) { const m = /:(\d+)$/.exec(tok); return m ? +m[1] : 2; };
  Object.keys(T.parts).forEach(function (name) {
    const p = T.parts[name], text = p.melody || p.line;
    if (!text) return;
    text.split("|").forEach(function (bar, i) {
      const toks = bar.trim().split(/\s+/).filter(Boolean), sum = toks.reduce(function (s, t) { return s + len(t); }, 0);
      if (text.indexOf("|") >= 0 ? sum !== 16 : sum % 16 && 16 % sum) errs.push("part " + name + " bar " + (i + 1) + " is " + sum + " sixteenths");
      if (p.line) toks.forEach(function (t) { const v = t.replace(/^>/, "").split(":")[0].replace(/[',#b]/g, ""); if (v !== "." && CHORD_TONES.indexOf(v) < 0) errs.push("part " + name + ": " + v + " is not a chord tone"); });
    });
  });
  Object.keys(T.channels).forEach(function (ch) {
    const c = T.channels[ch];
    if (c.drum && !SYN.DRUMS[c.drum] || c.tone && !SYN.TONES[c.tone] || c.synth && !SYN.SYNTHS[c.synth] || !(c.drum || c.tone || c.synth)) errs.push("channel " + ch + ": unknown instrument");
    if (!c.role) errs.push("channel " + ch + " has no role");
  });
  Object.keys(T.sections).forEach(function (sec) {
    const play = T.sections[sec].play || {};
    Object.keys(play).forEach(function (ch) {
      [].concat(play[ch]).forEach(function (e) {
        const k = typeof e === "string" ? e : e && e.part, p = T.parts[k], c = T.channels[ch];
        /* "beat": a drum pattern, a rhythm for each of its drum channels */
        if (ch === "beat") { if (p && p.beat) Object.keys(p.beat).forEach(function (d) { if (!T.channels[d]) errs.push("beat " + k + " plays an unknown channel " + d); }); }
        else if (!c) errs.push("section " + sec + " plays an unknown channel " + ch);
        else if (p && p.chord && MONO.indexOf(c.synth) >= 0) errs.push("section " + sec + ": chord part " + k + " on " + ch + ", a " + c.synth + " (one note at a time)");
      });
    });
  });
  return errs;
}
console.log("music-check: " + tracks.length + " tracks\n");
const head = ["#", "name", "bpm", "events", "theme", "grid", "groove", "lead / answer / scale"];
const rows = [head];
tracks.forEach(function (n) {
  const t = track(n), errs = [];
  let S = null;
  try { S = api.MUSIC.makeSong(t.def, t.L, n === 0); } catch (e) { errs.push(e.message); }
  const T = api.MUSIC._t.themeOf(t.def);
  if (T) themeErrors(T).forEach(function (x) { errs.push(x); });
  if (!S) { fails++; rows.push([String(n), t.def.name, String(t.def.mu[0]), "-", "FAIL", "-", "-", "-"]); errs.slice(0, 5).forEach(function (x) { console.log("  " + t.def.name + ": " + x); }); return; }
  const E = S.ev, bars = S.bars;
  /* grid */
  const gridBad = E.filter(function (e) { return Math.abs(e.b * TPQ - Math.round(e.b * TPQ)) > 1e-6; }).length;
  if (gridBad) errs.push("grid: " + gridBad + " events off the integer grid");
  if (!S.loop) {
    const close = E.filter(function (e) { return e.b >= bars * 4; });
    if (!close.length || Math.abs(close[0].b * S.spb - bars * 4 * S.spb) > .001) errs.push("grid: closing sting not at bars * 4 * spb");
    if (close.some(function (e) { return e.b >= bars * 4 + 4; })) errs.push("grid: events past the closing bar");
  }
  /* groove */
  const sw = (T.swing || 0) * S.spb / 4;
  let worst = 0;
  E.forEach(function (e) { const tick = Math.round(e.b * TPQ), swing = tick % 12 === 0 && (tick / 12) % 2 ? sw : 0; worst = Math.max(worst, Math.abs(e.o - swing)); });
  if (worst > .0081) errs.push("groove: offset " + (worst * 1000).toFixed(1) + " ms beyond the swing");
  const ok = function (b) { return b ? "ok" : "FAIL"; }, has = function (k) { return errs.some(function (x) { return x.indexOf(k + ":") === 0; }); };
  const roles = function (r) { return Object.keys(T.channels).filter(function (k) { return T.channels[k].role === r; }).map(function (k) { return T.channels[k].tone || T.channels[k].synth; }).join("+") || "none"; };
  rows.push([String(n), t.def.name, String(S.bpm), String(E.length), ok(!errs.some(function (x) { return !/^(grid|groove):/.test(x); })), ok(!has("grid")), ok(!has("groove")) + " " + (worst * 1000).toFixed(1) + "ms",
    roles("lead") + " / " + roles("answer") + " / " + T.scale]);
  if (errs.length) { fails++; errs.slice(0, 5).forEach(function (x) { console.log("  " + t.def.name + ": " + x); }); }
});
table(rows);

function table(R) {
  const w = R[0].map(function (_, c) { return Math.max.apply(null, R.map(function (r) { return String(r[c]).length; })); });
  R.forEach(function (r, i) {
    console.log("  " + r.map(function (c, j) { return String(c) + " ".repeat(w[j] - String(c).length); }).join("  "));
    if (i === 0) console.log("  " + w.map(function (x) { return "-".repeat(x); }).join("  "));
  });
}

/* ---------------------------------------------------------------- browser */
async function browser() {
  let pw; try { pw = require("playwright"); } catch (e) { console.log("\n--render / --perf need Playwright (pre-installed in the dev container); skipped"); fails++; return; }
  const br = await pw.chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] }), page = await br.newPage();
  await page.setContent("<!doctype html><html><body></body></html>");
  for (const f of FILES) await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, f), "utf8") + "\n//# sourceURL=" + f });
  if (RENDER) {
    console.log("\nrender (22050 Hz, full volume)");
    const R = [["#", "name", "peak", "rms dB", "trim", "silent s", "voices", "events", "notes"]], all = [];
    for (const n of tracks) {
      const r = await page.evaluate(async function (n) {
        const def = n ? LEVELS[n - 1] : HOME; if (n) def.fix = (typeof FIXES !== "undefined" && FIXES[n]) || [];
        const L = SIM.compile(def), spb = 60 / def.mu[0], loop = n === 0, cyc = L.bars * 4 * 4 * spb, secs = loop ? Math.ceil(cyc * 3) + 1 : Math.ceil(L.bars * 4 * spb) + 2;
        const s = await MUSIC.renderStats(def, L, secs, { loop: loop, keep: loop });
        const out = { peak: s.peak, rms: s.rms, secs: s.secs, voices: s.voices, events: s.events, energy: L.energy, spb: spb, bars: L.bars };
        if (loop) {
          /* the seams of the loop: 50 ms windows either side, no gap (a drop of over 12 dB) and no spike (a peak over 2× the RMS around it + 0.3) */
          const d = s.buffer.getChannelData(0), sr = s.buffer.sampleRate, w = Math.floor(sr * .05), seam = [];
          for (let k = 1; k < 3; k++) {
            const i0 = Math.floor((.05 + k * cyc) * sr), rms = function (a) { let q = 0; for (let i = a; i < a + w; i++) q += d[i] * d[i]; return Math.sqrt(q / w); };
            let pk = 0; for (let i = i0 - w; i < i0 + w; i++) pk = Math.max(pk, Math.abs(d[i]));
            seam.push({ before: rms(i0 - 4 * w), at: rms(i0 - w / 2 | 0), after: rms(i0 + 2 * w), peak: pk });
          }
          out.seam = seam; out.cycle = cyc;
        }
        return out;
      }, n);
      r.n = n; r.name = n ? api.LEVELS[n - 1].name : "Home"; all.push(r);
      process.stderr.write("  rendered " + n + " " + r.name + ": peak " + r.peak + ", rms " + (20 * Math.log10(r.rms)).toFixed(1) + " dB, voices " + r.voices + "\n");
    }
    const db = function (x) { return 20 * Math.log10(Math.max(1e-9, x)); };
    const levels = all.map(function (r) { return db(r.rms); }).sort(function (a, b) { return a - b; }), med = levels[Math.floor(levels.length / 2)];
    all.forEach(function (r) {
      const notes = [];
      /* silent seconds: below -50 dBFS, where the bars of that second all have energy above 0 */
      const songSecs = r.n ? Math.floor(r.bars * 4 * r.spb) : r.secs.length - 1;
      let silent = 0;
      for (let k = 0; k < songSecs; k++) {
        const b0 = Math.floor((k % (r.bars * 4 * r.spb)) / (r.spb * 4)), b1 = Math.floor(((k + 1) % (r.bars * 4 * r.spb) - 1e-6) / (r.spb * 4));
        const e = Math.min(r.energy[b0 % r.bars], r.energy[b1 % r.bars]);
        if (db(r.secs[k]) < -50 && e > 0) silent++;
      }
      const lv = db(r.rms), trim = med - lv;
      if (r.peak > .98) notes.push("CLIP");
      if (Math.abs(trim) > 2) notes.push("LEVEL");
      if (silent) notes.push("SILENT");
      if (r.voices > 60) notes.push("VOICES");
      if (r.seam) r.seam.forEach(function (s, i) { if (db(s.at) < db((s.before + s.after) / 2) - 12) notes.push("GAP@seam" + (i + 1)); if (s.peak > 2 * Math.max(s.before, s.after) + .3) notes.push("SPIKE@seam" + (i + 1)); });
      if (notes.length) fails++;
      R.push([String(r.n), r.name, r.peak.toFixed(3), lv.toFixed(1), (trim >= 0 ? "+" : "") + trim.toFixed(1), String(silent), String(r.voices), String(r.events), notes.join(" ") || "ok" + (r.seam ? " (3 loops, seams clean)" : "")]);
    });
    table(R);
    console.log("  median " + med.toFixed(1) + " dBFS RMS, spread " + (levels[levels.length - 1] - levels[0]).toFixed(1) + " dB");
  }
  if (PERF) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const p = await page.evaluate(async function () {
      MUSIC.init(); await MUSIC.resume();
      const def = LEVELS[29], L = SIM.compile(def), S = MUSIC.makeSong(def, L, false);
      MUSIC.stats.worst = 0; MUSIC.stats.maxV = 0; MUSIC.stats.skipped = 0;
      const w0 = performance.now(); MUSIC.start(S); const startMs = performance.now() - w0;
      await new Promise(function (r) { setTimeout(r, 15000); });
      const st = { worst: MUSIC.stats.worst, voices: MUSIC.stats.maxV, skipped: MUSIC.stats.skipped, start: startMs, state: MUSIC.ctx.state };
      MUSIC.stop(.1); return st;
    });
    console.log("\nperf (level 30, 15 s live, 4× CPU throttling): slowest schedule() " + p.worst.toFixed(2) + " ms, start() " + p.start.toFixed(1) +
      " ms (renders its strings and drums), most voices " + p.voices + ", late events skipped " + p.skipped + " (context " + p.state + ")");
  }
  await br.close();
}

(RENDER || PERF ? browser() : Promise.resolve()).then(function () {
  console.log("\nmusic-check: " + (fails ? "FAIL (" + fails + ")" : "ok"));
  process.exit(fails ? 1 : 0);
});
