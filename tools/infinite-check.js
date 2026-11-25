#!/usr/bin/env node
/* =============================================================================
   tools/infinite-check.js [--seeds N] [--minutes M] [--seed S] [--ci] [--no-d] [--json]

   Checks Infinite Shadow (js/infinite.js) against the rules in README
   (Infinite Shadow, Difficulty). Loads sim.js, levels.js, fixes.js and
   infinite.js in a vm context, generates runs from many seeds the way the game
   does (INF.create(seed).fill(bars)) and fails on any hard rule. Built-in
   Node modules only.

     node tools/infinite-check.js                 300 seeds × 10 minutes
     node tools/infinite-check.js --ci            the CI size: 24 seeds × 6 minutes (about 2 minutes)
     node tools/infinite-check.js --seed 1234     one seed, with its chunk list
     node tools/infinite-check.js --seeds 50 --minutes 4

   Hard rules (each seed)
     fair      every chunk's path wins its chunk at margin 0.08 with DEC 12
               from its seam state, and the whole run replays from the start
               with the concatenated paths at margin 0, calm on every seam
               (so the seams are safe)
     view      no input needs something more than (view − 1 beat) ahead, and
               every rolling blade is on screen a beat before its input
     density   3.5-5.0 obstacle characters a bar (2.5-3.5 in the warm-up),
               longest gap 2 beats (3 in the warm-up), except breather bars
     intro     no hazard in the first 2 bars
     D         per 1-minute window (README › Difficulty, measured as
               tools/difficulty.js does: simplified path, actions with the
               releases that matter, slack, mech, combo, rest, gap10). Minute
               1 (warm-up and ramp) within D(3)..D(12), minute 2 within
               D(8)..D(14), from minute 3 inside the cruise band D(10)..D(14)
               and never above the ceiling D(16)
     obstacles every plain obstacle (spikes, pits, steps, bars, walls, blocks,
               spiked steps, tunnels, hurdles, crushers, blades, the spike tower
               under a Rail) within every 4 minutes from when it unlocks
     hazards   all 15 in every 3-minute window; none in more than 2 pieces
               in a row
     repeat    no template within 8 bars of itself, no signature twice within
               5 minutes
     ground    never flat for more than 3 bars; always inside the band
     combos    combo places per minute (D's combo term) in the cruise
               minutes, averaged per seed, 4 to 10 (levels 12-18 have 3-8)
     fallback  below 0.5 % of all chunks
     seeds     the same seed gives the same chart; the first 32 bars of no two
               seeds match
   Prints a table, the D per minute, hazard coverage, combo rate, fallback
   rate and generation timings (p50 / p95 / max per chunk). Exits 1 on failure.
   ========================================================================== */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
let seeds = 300, minutes = 10, one = null, json = false, withD = true;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--seeds") seeds = +args[++i];
  else if (args[i] === "--minutes") minutes = +args[++i];
  else if (args[i] === "--seed") one = +args[++i];
  else if (args[i] === "--ci") { seeds = 24; minutes = 6; }
  else if (args[i] === "--no-d") withD = false;
  else if (args[i] === "--json") json = true;
}
function load() {
  const ctx = vm.createContext({ console: { log: function () {}, warn: function () {}, error: function () {} } });
  ["js/sim.js", "js/levels.js", "js/fixes.js", "js/infinite.js"].forEach(function (f) { new vm.Script(fs.readFileSync(path.join(ROOT, f), "utf8"), { filename: f }).runInContext(ctx); });
  return vm.runInContext("({ SIM: SIM, INF: INF, HAZ: HAZ })", ctx);
}
const api = load(), SIM = api.SIM, INF = api.INF, RU = INF.rules, TPB = SIM.TPB, DX = SIM.DX, DEC = INF.DEC;
const BARS_MIN = INF.BPM / 4, SPB = 60 / INF.BPM;
/* D targets: the level curve anchored on level 1's D (tools/difficulty.js; README › Difficulty) */
const D1 = 0.403, Dn = function (n) { return D1 * Math.pow(1.10, n - 1); };
const errors = [], notes = [];
function err(seed, rule, msg) { errors.push("seed " + seed + " " + rule + ": " + msg); }

/* ---------------------------------------------------------------- per chunk */
/* a chunk on its own, at its place in the stream, and a replay of a path on it from its seam state */
function local(L, k) {
  const ch = L.chunks[k], S = SIM.stream({ c0: ch.c0, base: ch.b0, id: ch.id0, minY: L.minY });
  SIM.append(S, ch.T + "......../" + ch.H + "........", 1);   /* with the ground past the seam, in one compile (js/infinite.js compileOk) */
  return { S: S, ch: ch, T0: ch.x0 / DX, T1: ch.x1 / DX };
}
function play(loc, s0, p, m) {
  const s = SIM.clone(s0); s.ev = null;
  for (let i = 0; i < p.length; i++) for (let k = 0; k < DEC && !s.dead; k++) SIM.step(loc.S, s, p[i] & 1, p[i] & 2, m || 0);
  return s;
}
function wins(loc, s0, p, m) { const s = play(loc, s0, p, m); return !s.dead && s.tick === loc.T1 && INF.calm(s); }
/* tools/difficulty.js simplify(), on one chunk: drop every hold the path can do without, merge slides into the slide
   before when that still wins */
function simplify(loc, s0, p0, m) {
  const p = p0.slice();
  let changed = true;
  while (changed) {
    changed = false;
    for (const bit of [1, 2]) for (let i = 0; i < p.length; i++) {
      if (!(p[i] & bit) || (i && (p[i - 1] & bit))) continue;
      let j = i; while (j + 1 < p.length && (p[j + 1] & bit)) j++;
      const q = p.slice(); for (let k = i; k <= j; k++) q[k] &= ~bit;
      if (wins(loc, s0, q, m)) { for (let k = i; k <= j; k++) p[k] = q[k]; changed = true; continue; }
      let a = i - 1; while (a >= 0 && !(p[a] & bit)) a--;
      if (bit === 2 && a >= 0 && (i - a) * DEC <= TPB) {
        const r = p.slice(); for (let k = a + 1; k < i; k++) r[k] |= bit;
        if (wins(loc, s0, r, m)) { for (let k = a + 1; k < i; k++) p[k] = r[k]; changed = true; }
      }
    }
  }
  return p;
}
/* tools/difficulty.js actions(), on one chunk: presses, and releases of a hold of half a beat whose timing matters */
function actions(loc, s0, p, m) {
  const out = [];
  const matters = function (i, bit) {
    let j = i; const lim = i + Math.round(TPB / 2 / DEC);
    while (j < p.length && j < lim && !(p[j] & bit)) j++;
    if (j === i) return false;
    const q = p.slice(); for (let k = i; k < j && k < q.length; k++) q[k] |= bit;
    return !wins(loc, s0, q, m);
  };
  let prev = 0, tj = 0, ts = 0;
  for (let i = 0; i <= p.length; i++) {
    const v = i < p.length ? p[i] : 0, t = loc.T0 + i * DEC;
    if ((v & 1) && !(prev & 1)) { out.push({ t: t, k: "jump" }); tj = t; }
    else if (!(v & 1) && (prev & 1) && t - tj >= TPB / 2 && matters(i, 1)) out.push({ t: t, k: "drop" });
    if ((v & 2) && !(prev & 2)) { out.push({ t: t, k: "slide" }); ts = t; }
    else if (!(v & 2) && (prev & 2) && t - ts >= TPB / 2 && matters(i, 2)) out.push({ t: t, k: "release" });
    prev = v;
  }
  return out;
}
/* the largest margin (0.08 to 0.3, steps of 0.02) the chunk still solves with from its seam state */
function slackOf(loc, s0, steps) {
  /* like tools/difficulty.js: each probe gets several times what the chunk's own solve needed; a margin the solver cannot
     beat within it counts as too tight. At least the generator's own probe budget (15000 ticks, 3 times the steps), so a
     chunk it proved at 0.2 never measures less only because this probe stopped sooner */
  const budget = Math.max(20000, 4 * (steps || 0));
  const ok = function (m) { const T1 = loc.T1; const r = SIM.search(loc.S, m, DEC, s0, function (s) { return s.tick < T1 ? undefined : INF.calm(s); }).run(budget); return !!(r && r.ok); };
  if (ok(0.3)) return 0.3;
  let lo = 4, hi = 15;   /* 0.08 is known to solve */
  while (hi - lo > 1) { const md = (lo + hi) >> 1; if (ok(md * 0.02)) lo = md; else hi = md; }
  return +(lo * 0.02).toFixed(2);
}

/* ---------------------------------------------------------------- one seed */
function runSeed(seed, bars, opt) {
  const t0 = Date.now(), g = INF.create(seed);
  const tg = Date.now(); g.fill(bars); const genMs = Date.now() - tg;
  const L = g.L, C = g.chunks, res = { seed: seed, chunks: C.length, bars: g.bars, fallbacks: g.stats.fallbacks, gen: genMs, ms: C.map(function (c) { return c.ms; }), minutes: [] };
  /* fair: each chunk's path at 0.08 from its seam; the whole run at margin 0 */
  const whole = SIM.newState(); whole.ev = [];
  const seam = [], acts = [], used = {};
  let k = 0, pi = 0;
  for (; k < C.length; k++) {
    const c = C[k], loc = local(L, k), n = (loc.T1 - loc.T0) / DEC, p = g.path.slice(pi, pi + n);
    if (whole.tick !== loc.T0) { err(seed, "fair", "chunk " + k + " starts at tick " + whole.tick + ", expected " + loc.T0); break; }
    const s0 = SIM.clone(whole); s0.ev = null; s0.dyn = {};
    seam.push(s0);
    if (!wins(loc, s0, p, INF.MARGIN)) err(seed, "fair", "chunk " + k + " (bar " + c.bar + ", " + c.tpl + ") does not win at margin " + INF.MARGIN + " from its seam");
    for (let i = 0; i < n; i++) for (let q = 0; q < DEC; q++) {
      SIM.step(L, whole, p[i] & 1, p[i] & 2, 0);
      for (const e of whole.ev) used[e] = (used[e] || 0) + 1; whole.ev.length = 0;
    }
    if (whole.dead) { err(seed, "fair", "the whole run dies (" + whole.dead + ") in chunk " + k + " at x " + (whole.tick * DX).toFixed(1)); break; }
    if (!INF.calm(whole)) err(seed, "fair", "the whole run is not calm at the seam after chunk " + k);
    pi += n;
    /* actions on the simplified path (for D and the view rule) */
    const m = INF.MARGIN, sp = withD ? simplify(loc, s0, p, m) : p;
    acts.push(actions(loc, s0, sp, m));
  }
  res.events = used;
  const all = [].concat.apply([], acts);
  /* view */
  const vw = RU.view(L, all, true);
  if (vw.worst > vw.max) err(seed, "view", "an input at x " + vw.at.toFixed(1) + " comes " + vw.worst.toFixed(1) + " units before the next thing (max " + vw.max + ")");
  vw.late.forEach(function (b) { err(seed, "view", "rolling blade at x " + b.x.toFixed(0) + " on screen only " + b.beats.toFixed(2) + " beats before its jump"); });
  /* density (README › Density: obstacle characters a bar is an average, like a level's over its minute; here over each
     minute, breathers left out; a single chunk may stray by 0.8 a bar), intro, ground */
  let gapRun = 0, flat = 0, maxFlat = 0, prevRest = true;
  const dm = {};
  C.forEach(function (c, i) {
    const T = c.T, H = c.H, st = RU.chartStats(T, H, 0), per = st.obst / c.bars, rest = c.ph === "rest" || c.ph === "intro" || c.tpl === "last";
    const bd = RU.band(c.bar < INF.WARM ? 3 : 12);
    if (!rest && (per < bd.lo - 0.8 - 1e-9 || per > bd.hi + 0.8 + 1e-9)) err(seed, "density", "chunk " + i + " (bar " + c.bar + ") has " + per.toFixed(2) + " obstacle characters a bar");
    if (!rest && c.bar >= INF.WARM) { const mi = Math.floor(c.bar / BARS_MIN), d = dm[mi] || (dm[mi] = { c: 0, b: 0 }); d.c += st.obst; d.b += c.bars; }
    for (let q = 0; q < T.length; q++) {
      if (RU.busy(T, H, q)) { if ((gapRun + 1) / 2 > bd.gap && !rest && !prevRest && c.bar >= 2) err(seed, "density", "a gap of " + ((gapRun + 1) / 2) + " beats ends in chunk " + i + " (bar " + c.bar + ")"); gapRun = 0; } else gapRun++;
      if (RU.TERRAIN.indexOf(T[q]) >= 0 || RU.TILES.indexOf(H[q]) >= 0 || RU.EDGES.indexOf(H[q]) >= 0) flat = 0; else flat++;
      if (c.bar >= 2) maxFlat = Math.max(maxFlat, flat);
    }
    prevRest = rest;
  });
  if (maxFlat > 24) err(seed, "ground", "flat for " + (maxFlat / 8).toFixed(2) + " bars");
  res.density = [];
  for (const mi in dm) { const d = dm[mi], v = d.c / d.b; res.density[mi] = v; if (d.b >= 12 && (v < 3.5 - 1e-9 || v > 5.0 + 1e-9)) err(seed, "density", "minute " + (+mi + 1) + " averages " + v.toFixed(2) + " obstacle characters a bar (3.5-5.0)"); }
  L.chunks.forEach(function (ch, i) { if (ch.lo < INF.BAND[0] || ch.hi > INF.BAND[1]) err(seed, "ground", "chunk " + i + " leaves the band (" + ch.lo + " to " + ch.hi + ")"); });
  const hzAll = RU.hazards(L);
  hzAll.forEach(function (h) { if (h.x0 < 32) err(seed, "intro", "hazard " + h.k + " in the first 2 bars"); });
  /* hazards: coverage in every 3-minute window, at most 2 pieces in a row; templates and signatures */
  const W3 = BARS_MIN * 3, pieces = C.filter(function (c) { return c.haz.length; });
  for (let b = 0; b + W3 <= g.bars; b += 4) {
    const seen = {}; pieces.forEach(function (c) { if (c.bar >= b && c.bar < b + W3) c.haz.forEach(function (h) { seen[h] = 1; }); });
    const miss = INF.TPL.map(function (t) { return t.haz[0]; }).filter(function (h, i, a) { return a.indexOf(h) === i && !seen[h]; });
    if (miss.length) { err(seed, "hazards", "bars " + b + "-" + (b + W3) + " miss " + miss.join(" ")); break; }
  }
  for (let i = 2; i < pieces.length; i++) for (const h of pieces[i].haz) if (pieces[i - 1].haz.indexOf(h) >= 0 && pieces[i - 2].haz.indexOf(h) >= 0) err(seed, "hazards", h + " in 3 pieces in a row at bar " + pieces[i].bar);
  /* obstacles: every plain obstacle (INF.OBS: the motif table's and the spike tower) comes back within 4 minutes, from
     the bar it unlocks (aimed at about every two: README, Infinite Shadow) */
  const W4 = BARS_MIN * 4, obsAt = {};
  C.forEach(function (c) { for (let i = 0; i < c.T.length; i++) if (INF.OBS[c.T[i]] !== undefined) (obsAt[c.T[i]] || (obsAt[c.T[i]] = [])).push(Math.floor((c.x0 / 2 + i) / 8)); });
  Object.keys(INF.OBS).forEach(function (k) {
    const at = [INF.OBS_AT[INF.OBS[k]]].concat(obsAt[k] || [], [g.bars]);
    for (let i = 1; i < at.length; i++) if (at[i] - at[i - 1] > W4) { err(seed, "obstacles", "no " + k + " in bars " + at[i - 1] + "-" + at[i]); break; }
  });
  const lastT = {}, lastS = {};
  C.forEach(function (c) {
    if (c.tpl !== "rest" && c.tpl !== "intro" && c.tpl !== "safe" && c.tpl !== "last") {
      if (lastT[c.tpl] !== undefined && c.bar - lastT[c.tpl] < 8) err(seed, "repeat", c.tpl + " again after " + (c.bar - lastT[c.tpl]) + " bars (bar " + c.bar + ")");
      if (lastS[c.sig] !== undefined && c.bar - lastS[c.sig] < BARS_MIN * 5) err(seed, "repeat", "signature " + c.sig.slice(0, 40) + " again after " + (c.bar - lastS[c.sig]) + " bars");
    }
    lastT[c.tpl] = c.bar; lastS[c.sig] = c.bar;
  });
  /* D per minute */
  const slack = withD ? C.map(function (c, i) { return c.ph === "rest" ? 0.3 : slackOf(local(L, i), seam[i], c.steps); }) : null;
  for (let mi = 0; (mi + 1) * BARS_MIN <= g.bars; mi++) {
    const b0 = mi * BARS_MIN, b1 = b0 + BARS_MIN, t0w = b0 * 4 * TPB, t1w = b1 * 4 * TPB;
    const a = all.filter(function (q) { return q.t >= t0w && q.t < t1w; }), sec = 60;
    const gaps = []; for (let i = 1; i < a.length; i++) gaps.push((a[i].t - a[i - 1].t) / TPB * SPB);
    gaps.sort(function (x, y) { return x - y; });
    const pct = function (p) { return gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(p * (gaps.length - 1)))] : Infinity; };
    const hit = new Uint8Array(BARS_MIN); a.forEach(function (q) { hit[Math.floor((q.t - t0w) / (4 * TPB))] = 1; });
    let quiet = 0; for (let b = 0; b < BARS_MIN; b++) if (!hit[b]) quiet++;
    const hz = hzAll.filter(function (h) { return h.x1 > b0 * 16 && h.x0 < b1 * 16; }), places = RU.combos(hz).filter(function (x) { return x >= b0 * 16 && x < b1 * 16; });
    let sl = 0.3; if (slack) C.forEach(function (c, i) { if (c.bar < b1 && c.bar + c.bars > b0) sl = Math.min(sl, slack[i]); });
    const t = { aps: a.length / sec, gap10: pct(0.1), gapMed: pct(0.5), slack: sl, mech: RU.mech(hz, b0, b1), combo: places.length, rest: quiet / BARS_MIN };
    t.D = withD ? RU.scoreD(t) : null;
    t.comboPieces = C.filter(function (c) { return c.combo && c.bar >= b0 && c.bar < b1; }).length;
    t.fallbacks = C.filter(function (c) { return c.safe && c.bar >= b0 && c.bar < b1; }).length;
    t.dens = res.density[mi] || 0;
    res.minutes.push(t);
    if (withD) {
      const lo = mi === 0 ? Dn(3) : mi === 1 ? Dn(8) : Dn(10), hi = mi === 0 ? Dn(12) : mi === 1 ? Dn(14) : Dn(14);
      if (t.D > Dn(16)) err(seed, "D", "minute " + (mi + 1) + " D " + t.D.toFixed(3) + " is above the ceiling D(16) " + Dn(16).toFixed(3));
      else if (t.D < lo - 1e-9 || t.D > hi + 1e-9) err(seed, "D", "minute " + (mi + 1) + " D " + t.D.toFixed(3) + " outside " + lo.toFixed(3) + "-" + hi.toFixed(3));
    }
  }
  const cruise = res.minutes.slice(2);
  if (cruise.length) {
    const cpm = cruise.reduce(function (s, t) { return s + t.combo; }, 0) / cruise.length;
    res.comboRate = cpm;
    if (cpm < 4 || cpm > 10) err(seed, "combos", cpm.toFixed(1) + " combo places a minute while cruising (want 4-10)");
  }
  res.ms0 = Date.now() - t0;
  res.g = g;
  return res;
}

/* ---------------------------------------------------------------- run */
const bars = Math.round(minutes * BARS_MIN), list = one !== null ? [one] : Array.from({ length: seeds }, function (_, i) { return ((Math.imul(i + 1, 2654435761) >>> 0) ^ 0x5EED) >>> 0; });
const t0 = Date.now(), R = [];
let charts = {};
list.forEach(function (seed, i) {
  const r = runSeed(seed, bars);
  /* determinism: the same seed again (every 10th seed, and a single --seed), made the way the game makes it (a chunk at
     a time, the stream trimmed and the generator's memory pruned as the runner moves on, 16 bars behind the end):
     identical chunks and path, so what the game plays is what this tool checked */
  if (i % 10 === 0 || one !== null) {
    const h = INF.create(seed), seen = [], dummy = { dyn: {} }, upto = Math.min(bars, 4 * BARS_MIN);
    let trimX = 0;
    while (h.bars < upto) {
      const n0 = h.chunks.length; h.fill(h.bars + 1);
      for (let k = n0; k < h.chunks.length; k++) seen.push(h.chunks[k].T + "/" + h.chunks[k].H);
      const x = (h.bars - 16) * 16;
      if (x - trimX > 32) { trimX = x; SIM.trim(h.L, x, dummy, 64); h.prune(Math.floor((x - 64) / 16) - 8); }
    }
    const a = r.g.chunks.slice(0, seen.length).map(function (c) { return c.T + "/" + c.H; }).join("|"), b = seen.join("|");
    if (a !== b || r.g.path.slice(0, h.path.length).join("") !== h.path.join("")) err(seed, "seeds", "the same seed gave a different chart (made a chunk at a time, trimmed and pruned like the game)");
  }
  /* the first 32 bars, for the different-seeds check */
  let head = "", hb = 0; for (const c of r.g.chunks) { if (hb >= 32) break; head += c.T + "/" + c.H + "|"; hb += c.bars; }
  if (charts[head] !== undefined) err(seed, "seeds", "its first 32 bars are the same as seed " + charts[head] + "'s");
  charts[head] = seed;
  r.g = null; R.push(r);
  if (!json && one === null && (i + 1) % 10 === 0) process.stderr.write("  " + (i + 1) + " / " + list.length + " seeds, " + ((Date.now() - t0) / 1000).toFixed(0) + " s\n");
});

/* ---------------------------------------------------------------- report */
const chunks = R.reduce(function (s, r) { return s + r.chunks; }, 0), fb = R.reduce(function (s, r) { return s + r.fallbacks; }, 0);
if (fb / chunks > 0.005) errors.push("fallback: " + fb + " of " + chunks + " chunks (" + (fb / chunks * 100).toFixed(2) + " %) used the safe generator (max 0.5 %)");
const ms = [].concat.apply([], R.map(function (r) { return r.ms; })).sort(function (a, b) { return a - b; });
const q = function (p) { return ms.length ? ms[Math.min(ms.length - 1, Math.floor(p * (ms.length - 1)))] : 0; };
const per = [];
for (let mi = 0; mi < Math.floor(bars / BARS_MIN); mi++) {
  const v = R.map(function (r) { return r.minutes[mi]; }).filter(Boolean);
  const avg = function (k) { return v.reduce(function (s, t) { return s + t[k]; }, 0) / v.length; };
  const Ds = v.map(function (t) { return t.D; }).sort(function (a, b) { return a - b; });
  per.push({ minute: mi + 1, D: withD ? avg("D") : null, Dmin: withD ? Ds[0] : null, Dmax: withD ? Ds[Ds.length - 1] : null, aps: avg("aps"), mech: avg("mech"), combo: avg("combo"),
    pieces: avg("comboPieces"), slack: avg("slack"), rest: avg("rest"), gap10: avg("gap10"), dens: avg("dens") });
}
const ev = {}; R.forEach(function (r) { for (const k in r.events) ev[k] = (ev[k] || 0) + r.events[k]; });
if (json) { console.log(JSON.stringify({ errors: errors, minutes: per, chunks: chunks, fallbacks: fb, ms: { p50: q(0.5), p95: q(0.95), max: q(1) } }, null, 1)); process.exit(errors.length ? 1 : 0); }
console.log("infinite-check: " + list.length + " seed" + (list.length > 1 ? "s" : "") + " × " + minutes + " min (" + bars + " bars at " + INF.BPM + " bpm), " + chunks + " chunks\n");
const f = function (v, d) { return v === null || v === undefined || !isFinite(v) ? "-" : v.toFixed(d); };
const tab = [["min", "D avg", "D min", "D max", "target", "aps", "mech", "combo/min", "combo pieces", "slack", "rest", "gap10", "obst/bar"]];
per.forEach(function (p) {
  const tgt = p.minute === 1 ? Dn(3).toFixed(2) + "-" + Dn(12).toFixed(2) : p.minute === 2 ? Dn(8).toFixed(2) + "-" + Dn(14).toFixed(2) : Dn(10).toFixed(2) + "-" + Dn(14).toFixed(2);
  tab.push([String(p.minute), f(p.D, 3), f(p.Dmin, 3), f(p.Dmax, 3), tgt, f(p.aps, 2), f(p.mech, 2), f(p.combo, 1), f(p.pieces, 1), f(p.slack, 2), f(p.rest, 2), f(p.gap10, 2), f(p.dens, 2)]);
});
const w = tab[0].map(function (_, c) { return Math.max.apply(null, tab.map(function (r) { return r[c].length; })); });
tab.forEach(function (r, i) { console.log("  " + r.map(function (c, j) { return " ".repeat(w[j] - c.length) + c; }).join("  ")); if (!i) console.log("  " + w.map(function (x) { return "-".repeat(x); }).join("  ")); });
console.log("\n  ceiling D(16) " + Dn(16).toFixed(3) + "; cruise band D(10)-D(14) " + Dn(10).toFixed(3) + "-" + Dn(14).toFixed(3));
const uses = ["bounce", "air", "fade", "gate", "grab", "rift", "comet", "dodge", "break", "coil", "flick", "exitZ", "exitD", "exitA", "exitT"];
console.log("  hazard uses (all seeds): " + uses.map(function (k) { return k + " " + (ev[k] || 0); }).join(", "));
const tpl = {}; R.forEach(function () {});
console.log("  fallback " + fb + " / " + chunks + " chunks (" + (fb / chunks * 100).toFixed(2) + " %), generation per chunk p50 " + q(0.5).toFixed(1) + " ms, p95 " + q(0.95).toFixed(1) + " ms, max " + q(1).toFixed(1) + " ms");
const cr = R.filter(function (r) { return r.comboRate !== undefined; });
if (cr.length) console.log("  combo places a minute while cruising: " + (cr.reduce(function (s, r) { return s + r.comboRate; }, 0) / cr.length).toFixed(1) + " (seed range " + Math.min.apply(null, cr.map(function (r) { return r.comboRate; })).toFixed(1) + "-" + Math.max.apply(null, cr.map(function (r) { return r.comboRate; })).toFixed(1) + ")");
console.log("");
if (one !== null) R[0].minutes.forEach(function (t, i) { console.log("  minute " + (i + 1) + ": D " + f(t.D, 3) + "  aps " + f(t.aps, 2) + "  mech " + f(t.mech, 2) + "  combo " + t.combo + "  slack " + f(t.slack, 2) + "  rest " + f(t.rest, 2) + "  gap10 " + f(t.gap10, 2) + "  gapMed " + f(t.gapMed, 2)); });
const show = errors.slice(0, 40);
show.forEach(function (e) { console.log("  FAIL  " + e); });
if (errors.length > show.length) console.log("  ... and " + (errors.length - show.length) + " more");
console.log("\ninfinite-check: " + (errors.length ? "FAIL (" + errors.length + " problem" + (errors.length > 1 ? "s" : "") + ")" : "ok") + " (" + ((Date.now() - t0) / 1000).toFixed(1) + " s)");
process.exit(errors.length ? 1 : 0);
