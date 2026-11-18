#!/usr/bin/env node
/* =============================================================================
   tools/music-check.js [--render] [--perf] [tracks]

   Checks the soundtracks (js/music.js) against the rules in README (Music).
   The first part is plain Node with built-in modules only: it loads sim.js,
   levels.js, fixes.js and music.js in a vm context and runs the same arranger
   the game runs (MUSIC.makeSong), headless.

     node tools/music-check.js            every track: alignment, grid, groove
     node tools/music-check.js 0 7 30     some tracks (0 is the home track)
     node tools/music-check.js --render   also render every track in Chromium
     node tools/music-check.js --perf     also time the live scheduler

   Headless (always)
     align    every chart cell > 0 has exactly one lead onset, of its kind
              (1 jump, 2 roll, 3 special), at exactly cell / 2 beats with no
              groove offset; no lead, doubling or cue onset anywhere else in
              a bar that has actions
     grid     every event sits on an integer tick (48 a beat); the closing
              chord is at bars * 4 beats, i.e. bars * 4 * spb (< 1 ms)
     groove   every other offset is the groove's swing plus at most 8 ms

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
const ROOT = path.resolve(__dirname, ".."), FILES = ["js/sim.js", "js/levels.js", "js/fixes.js", "js/music.js"];
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
console.log("music-check: " + tracks.length + " tracks\n");
const head = ["#", "name", "bpm", "events", "actions", "align", "grid", "groove", "lead / answer / kit / space"];
const rows = [head];
tracks.forEach(function (n) {
  const t = track(n), S = api.MUSIC.makeSong(t.def, t.L, n === 0), sp = S.spec, E = S.ev, bars = S.bars, passes = S.loop ? S.cycle / 4 / bars : 1;
  const errs = [];
  /* align */
  const leadAt = {}, LEADG = { l: 1, l2: 1, c: 1 };
  E.forEach(function (e) {
    if (e.y !== "n" || !LEADG[e.g]) return;
    const cell = e.b * 2;
    if (e.b >= bars * 4 * passes) return;   /* the closing chord, after the chart */
    if (Math.abs(cell - Math.round(cell)) > 1e-9) { errs.push("lead-group onset off the half-beat grid at beat " + e.b); return; }
    (leadAt[Math.round(cell)] || (leadAt[Math.round(cell)] = [])).push(e);
  });
  let actions = 0;
  for (let p = 0; p < passes; p++) for (let c = 0; c < bars * 8; c++) {
    const a = S.chart[c], cell = p * bars * 8 + c, list = leadAt[cell] || [], main = list.filter(function (e) { return e.g === "l"; });
    if (a) {
      actions++;
      if (main.length !== 1) errs.push("cell " + cell + ": " + main.length + " lead onsets for action " + a);
      else if (main[0].act !== a) errs.push("cell " + cell + ": lead kind " + main[0].act + ", chart " + a);
      else if (main[0].o !== 0 || main[0].t !== cell / 2) errs.push("cell " + cell + ": lead onset moved (" + main[0].t + " vs " + cell / 2 + ")");
    } else {
      let barHas = false; for (let i = 0; i < 8; i++) if (S.chart[Math.floor(c / 8) * 8 + i]) barHas = true;
      if (barHas && list.length) errs.push("cell " + cell + ": " + list.map(function (e) { return e.g; }).join("+") + " onset on a cell with no action");
    }
  }
  /* grid */
  const gridBad = E.filter(function (e) { return Math.abs(e.b * TPQ - Math.round(e.b * TPQ)) > 1e-6; }).length;
  if (gridBad) errs.push(gridBad + " events off the integer grid");
  if (!S.loop) {
    const close = E.filter(function (e) { return e.g === "l" && e.b >= bars * 4; });
    if (close.length !== 1 || Math.abs(close[0].b * S.spb - bars * 4 * S.spb) > .001) errs.push("closing chord not at bars * 4 * spb");
    const lastIn = Math.max.apply(null, E.filter(function (e) { return e.b < bars * 4; }).map(function (e) { return e.b; }));
    if (lastIn >= bars * 4) errs.push("events past the last bar");
  }
  /* groove */
  const G = api.MUSIC._t.GROOVE[sp.groove], sw = (G[0] - .5) * 2 * S.spb / 4;
  /* the strum spread and the rolled closing chord are part of the playing, not timing */
  let worst = 0;
  E.forEach(function (e) {
    if (e.act || (e.g === "h" && (sp.harm === "strum" || e.b >= bars * 4))) return;
    const tick = Math.round(e.b * TPQ), swing = tick % 12 === 0 && (tick / 12) % 2 ? sw : 0;
    worst = Math.max(worst, Math.abs(e.o - swing));
  });
  if (worst > .0081) errs.push("groove offset " + (worst * 1000).toFixed(1) + " ms beyond the swing");
  const ok = function (b) { return b ? "ok" : "FAIL"; };
  const alignOk = !errs.some(function (x) { return /cell|lead/.test(x); }), gridOk = !errs.some(function (x) { return /grid|closing|past/.test(x); }), grooveOk = !errs.some(function (x) { return /groove/.test(x); });
  rows.push([String(n), t.def.name, String(S.bpm), String(E.length), String(actions), ok(alignOk), ok(gridOk), ok(grooveOk) + " " + (worst * 1000).toFixed(1) + "ms", sp.lead + " / " + sp.answer + " / " + sp.kit + " / " + sp.space]);
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
