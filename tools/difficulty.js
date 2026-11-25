#!/usr/bin/env node
/* =============================================================================
   tools/difficulty.js [levels] [--budget N] [--json]

   Scores every level with one number, D, built only from things that can be
   measured on the compiled level and on the solver's path. Prints one row per
   level with the target D(n) = D(1) · R^(n-1) next to it. Built-in Node
   modules only. Also used as a module by tools/check-levels.js.

     node tools/difficulty.js            all levels
     node tools/difficulty.js 7          one level
     node tools/difficulty.js 10-20      a range

   Terms (all per level, the level being exactly one minute long):
     aps    required actions per second: presses of jump or slide on the
            solver's path at the level's fairness margin (first reduced to a
            locally minimal path, see simplify), plus the releases whose
            timing matters (dropping off a Rail, launching off a Coil,
            floating back up in a Thermal), over the chart only
     gap    seconds between consecutive actions: median and 10th percentile
     slack  the largest margin m (0 to 0.3 in steps of 0.02) the level still
            solves with (each probe with a fixed budget, see SLACK_BUDGET). SIM.solve's margin widens every lethal shape and
            narrows every ledge, so less slack means tighter timing somewhere
     mech   mean number of distinct hazard mechanics present in each 2-bar
            window (a zone counts in every window it overlaps)
     combo  places per minute where two different hazards are within 2 beats
            of each other, or one hazard sits inside another's zone. Pairs are
            found from the compiled level, then grouped into places 2 beats
            wide, so a long run of combos counts once per 2 beats
     rest   fraction of bars with no action at all

   D = aps · (1 + a·mech) · (1 + b·combo/10) · (1 + c·(0.3 − slack)/0.3)
         · (1 − d·rest) · (0.25 / max(gap10, 0.12))^e

   Weights: a = 0.2, b = 0.15, c = 0.3, d = 0.5, e = 0.1. They are fixed: a level
   that misses its target is rebuilt, the weights are never re-tuned to make the
   numbers fit. Per term:
   - aps is the base: every other term is a multiplier around 1, so D stays in
     "actions per second" units and a level twice as dense is twice as hard.
   - a = 0.2: mixing is the largest of the multipliers. Going from one hazard
     in view (level 1) to three or four (level 30) is worth about +60 %.
   - b = 0.15 per 10 combos: combos are already partly counted by mech, so
     this only rewards stacking them back to back (10 a minute is +15 %).
   - c = 0.3: slack is a minimum over the whole level (one tight spot sets
     it), so it is a coarse signal. Most levels keep the full 0.3; the last
     ones, built around tight windows, get up to +30 %.
   - d = 0.5: a level that is half rest feels about a quarter easier, not
     half, because the dense half still has to be played.
   - e = 0.1: the 10th-percentile gap mostly re-measures density (a denser
     level has shorter gaps), so it only separates levels with half-beat
     bursts from even ones. The 0.12 s clamp stops one buffered double press
     from looking like a burst.

   The curve: R = 1.10 per level, exactly. This is the design rule of the game
   (the brief in max, section 4), not a fit to the measurements: every level is
   built to land within ±1.5 % of D(1) · 1.10^(n−1), and each level must also be
   1.08 to 1.12 times the one before it, so nothing is easier than the level
   before or only barely harder. Over 30 levels that is 1.10^29 ≈ 15.9: level 30
   is about 15.9 times level 1. Level 1 is anchored low on purpose (single,
   generously timed inputs at 112 bpm), so that the climb ends at "really hard
   but fair" and not at impossible. The bands: 1-9 easy (1× to 2.14×), 10-20
   medium (2.36× to 6.12×), 21-30 hard (6.73× to 15.86×). In the rebuilt
   levels the climb splits roughly into density (required presses per beat),
   tempo (112 to 200 bpm) and mixing, combos and timing.
   ========================================================================== */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

const R = 1.10, TOL = 0.015;
/* every level must also be RMIN to RMAX times the level before it */
const RMIN = 1.08, RMAX = 1.12;
/* the fairness margin each level must still solve with (README, Difficulty); D is measured on that path */
function fairMargin(n) { return n <= 1 ? 0.12 : n <= 10 ? 0.08 : n <= 20 ? 0.06 : 0.04; }
const SLACK_MAX = 0.3, SLACK_STEP = 0.02;
/* solver budget (ticks) for each probe of the slack search: at least SLACK_BUDGET, and at least 3× what the level's
   own solve at its fairness margin needed, so a long level is not called tight just because it is long. It depends
   only on the level, so D is reproducible; a margin the solver cannot beat within it counts as too tight */
const SLACK_BUDGET = 1.5e6;
const FILES = ["js/sim.js", "js/levels.js", "js/fixes.js", "js/infinite.js"];

/* ---------------------------------------------------------------- loading */
/* the same way tools/parity-check.js does it: classic scripts in one vm context */
function load(root) {
  const ctx = vm.createContext({ console: { log: function () {}, warn: function () {}, error: function () {} } });
  FILES.forEach(function (f) { new vm.Script(fs.readFileSync(path.join(root, f), "utf8"), { filename: f }).runInContext(ctx); });
  return vm.runInContext("({ SIM: SIM, LEVELS: LEVELS, HAZ: HAZ, HOME: HOME, INF: INF," +
    "level: function (n) { var FIX = typeof FIXES !== 'undefined' ? FIXES : {}; var d = LEVELS[n - 1]; d.fix = FIX[n] || []; return SIM.compile(d); } })", ctx);
}

/* ---------------------------------------------------------------- measures */
/* actions on a solver path: every press, and every release that ends a hold of at least half a beat when letting
   go later (by half a beat, or just before the next press of that input) would lose the run: dropping off a Rail
   before a blade, launching off a Coil, floating back up in a Thermal */
function actions(api, L, pathArr, DEC, m) {
  const TPB = api.SIM.TPB, end = L.cells * TPB / 2, out = [];
  const matters = function (i, bit) {
    let j = i; const lim = i + Math.round(TPB / 2 / DEC);
    while (j < pathArr.length && j < lim && !(pathArr[j] & bit)) j++;
    if (j === i) return false;
    const q = pathArr.slice(); for (let k = i; k < j && k < q.length; k++) q[k] |= bit;
    if (j >= q.length) for (let k = q.length; k < j; k++) q.push(bit);
    return !api.SIM.replay(L, q, DEC, m || 0).won;
  };
  let prev = 0, tj = 0, ts = 0;
  for (let i = 0; i <= pathArr.length; i++) {
    const v = i < pathArr.length ? pathArr[i] : 0, t = i * DEC;
    if (t >= end) break;
    if ((v & 1) && !(prev & 1)) { out.push({ t: t, k: "jump" }); tj = t; }
    else if (!(v & 1) && (prev & 1) && t - tj >= TPB / 2 && matters(i, 1)) out.push({ t: t, k: "drop" });
    if ((v & 2) && !(prev & 2)) { out.push({ t: t, k: "slide" }); ts = t; }
    else if (!(v & 2) && (prev & 2) && t - ts >= TPB / 2 && matters(i, 2)) out.push({ t: t, k: "release" });
    prev = v;
  }
  return out;
}
/* The depth-first solver returns the first path it finds, which can hold an input, let go and press it again where
   one press would do. Before counting, drop every press the path can do without, and merge every slide into the slide
   before it when that still wins, until nothing changes. The result is a locally minimal path at the same margin.
   Jumps are never merged: holding jump re-jumps on every landing, so one long hold would hide the timed jumps. */
function simplify(api, L, pathArr, DEC, m) {
  const p = pathArr.slice(), wins = function (q) { return api.SIM.replay(L, q, DEC, m).won; };
  let changed = true;
  while (changed) {
    changed = false;
    for (const bit of [1, 2]) {
      for (let i = 0; i < p.length; i++) {
        if (!(p[i] & bit) || (i && (p[i - 1] & bit))) continue;
        let j = i; while (j + 1 < p.length && (p[j + 1] & bit)) j++;
        /* remove this hold */
        const q = p.slice(); for (let k = i; k <= j; k++) q[k] &= ~bit;
        if (wins(q)) { for (let k = i; k <= j; k++) p[k] = q[k]; changed = true; continue; }
        /* or join it to the previous hold of the same input, if that is close (within a beat) */
        let a = i - 1; while (a >= 0 && !(p[a] & bit)) a--;
        if (bit === 2 && a >= 0 && (i - a) * DEC <= api.SIM.TPB) {
          const r = p.slice(); for (let k = a + 1; k < i; k++) r[k] |= bit;
          if (wins(r)) { for (let k = a + 1; k < i; k++) p[k] = r[k]; changed = true; }
        }
      }
    }
  }
  return p;
}
function pct(sorted, p) { if (!sorted.length) return Infinity; return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))]; }

/* hazards, mech, combos and D itself are INF.rules (js/infinite.js), shared with Infinite Shadow, whose generator
   aims each minute of a run at D of a level: one definition, so the two can never disagree */
const RULES = load(path.resolve(__dirname, "..")).INF.rules, W = RULES.W;
/* every hazard instance as an interval [x0, x1] in world units, with its kind */
function hazards(L) { return RULES.hazards(L); }
function kindsUsed(L) { const s = {}; hazards(L).forEach(function (h) { s[h.k] = 1; }); return Object.keys(s); }
/* mean number of distinct hazards in each 2-bar window */
function mech(L, hz) { return RULES.mech(hz, 0, L.bars); }
/* combo places: pairs of different hazards within 2 beats (8 units), grouped into 2-beat places */
function combos(L, hz) { return RULES.combos(hz); }

/* largest margin on the 0..0.3 grid that still solves (bisection; solvability is monotone in m in practice) */
function slackOf(api, L, budget, known) {
  const n = Math.round(SLACK_MAX / SLACK_STEP), cache = Object.assign({}, known || {});
  const ok = function (i) {
    if (cache[i] === undefined) cache[i] = api.SIM.solve(L, +(i * SLACK_STEP).toFixed(2), budget, 6).ok;
    return cache[i];
  };
  /* a margin already known to solve (the fairness margin) stands in for 0: solvability only gets harder with m */
  let lo = -1, hi = n + 1;
  for (const k in cache) { const i = +k; if (cache[k] && i > lo) lo = i; if (!cache[k] && i < hi) hi = i; }
  if (lo < 0) { if (!ok(0)) return { slack: -1, tried: cache }; lo = 0; }
  if (hi > n) { if (ok(n)) return { slack: SLACK_MAX, tried: cache }; hi = n; }
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ok(mid)) lo = mid; else hi = mid; }
  return { slack: +(lo * SLACK_STEP).toFixed(2), tried: cache };
}

function scoreD(t) { return RULES.scoreD(t); }

/* everything about one level. opts: { budget, margin (path to measure on), sol (a solve result to reuse) } */
function measure(api, n, opts) {
  opts = opts || {};
  const def = api.LEVELS[n - 1], L = api.level(n), bpm = def.mu[0], TPB = api.SIM.TPB;
  const sec = (L.cells / 2) * 60 / bpm, budget = opts.budget || 6e6, m = opts.margin !== undefined ? opts.margin : fairMargin(n);
  const sol = opts.sol || api.SIM.solve(L, m, budget, 6);
  const out = { n: n, name: def.name, bpm: bpm, sec: sec, bars: L.bars, L: L, sol: sol, ok: sol.ok };
  if (!sol.ok) return out;
  const minPath = simplify(api, L, sol.path, sol.DEC, m);
  const acts = actions(api, L, minPath, sol.DEC, m), toSec = 60 / bpm / TPB;
  out.path = minPath;
  const gaps = []; for (let i = 1; i < acts.length; i++) gaps.push((acts[i].t - acts[i - 1].t) * toSec);
  gaps.sort(function (a, b) { return a - b; });
  const barsHit = new Uint8Array(L.bars); acts.forEach(function (a) { const b = Math.floor(a.t / (4 * TPB)); if (b < L.bars) barsHit[b] = 1; });
  let quiet = 0; for (let b = 0; b < L.bars; b++) if (!barsHit[b]) quiet++;
  const known = {}; known[Math.round(m / SLACK_STEP)] = true;
  const sl = opts.slack !== undefined ? { slack: opts.slack } : slackOf(api, L, opts.slackBudget || Math.max(SLACK_BUDGET, 3 * (sol.steps || 0)), known);
  const hz = hazards(L), places = combos(L, hz);
  Object.assign(out, { acts: acts, aps: acts.length / sec, gapMed: pct(gaps, 0.5), gap10: pct(gaps, 0.1), slack: sl.slack,
    mech: mech(L, hz), combo: places.length * 60 / sec, comboAt: places, rest: quiet / L.bars, kinds: kindsUsed(L) });
  out.D = scoreD(out);
  return out;
}
function target(D1, n) { return D1 * Math.pow(R, n - 1); }
function band(n) { return n <= 9 ? "easy" : n <= 20 ? "medium" : "hard"; }

module.exports = { load: load, fairMargin: fairMargin, measure: measure, actions: actions, simplify: simplify, hazards: hazards, kindsUsed: kindsUsed, mech: mech, combos: combos,
  slackOf: slackOf, scoreD: scoreD, target: target, band: band, W: W, R: R, TOL: TOL, RMIN: RMIN, RMAX: RMAX };

/* ---------------------------------------------------------------- CLI */
if (require.main === module) {
  const args = process.argv.slice(2), root = path.resolve(__dirname, "..");
  let budget = 6e6, json = false, sel = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--budget") budget = +args[++i];
    else if (args[i] === "--json") json = true;
    else { const m = /^(\d+)(?:-(\d+))?$/.exec(args[i]); if (m) sel = [+m[1], +(m[2] || m[1])]; }
  }
  const api = load(root), N = api.LEVELS.length;
  const lo = sel ? sel[0] : 1, hi = sel ? sel[1] : N;
  /* D(1) anchors every target, so it is always measured, and so is the level before the range (for its ratio) */
  const first = measure(api, 1, { budget: budget }), rows = [], byN = { 1: first };
  for (let n = Math.max(1, lo - 1); n <= hi; n++) if (!byN[n]) byN[n] = measure(api, n, { budget: budget });
  for (let n = lo; n <= hi; n++) rows.push(byN[n]);
  const ratio = function (r) { const p = byN[r.n - 1]; return r.n > 1 && p && p.ok && r.ok ? r.D / p.D : null; };
  const pass = function (r) {
    if (!r.ok || !first.D) return false;
    const dev = r.D / target(first.D, r.n) - 1, q = ratio(r);
    return Math.abs(dev) <= TOL + 1e-12 && (q === null || (q >= RMIN - 1e-12 && q <= RMAX + 1e-12));
  };
  if (json) {
    console.log(JSON.stringify(rows.map(function (r) {
      return { n: r.n, ok: r.ok, bpm: r.bpm, sec: +r.sec.toFixed(2), aps: r.aps, gapMed: r.gapMed, gap10: r.gap10, slack: r.slack, mech: r.mech,
        combo: r.combo, rest: r.rest, D: r.D, target: first.D ? target(first.D, r.n) : null, ratio: ratio(r), pass: pass(r), kinds: r.kinds };
    }), null, 1));
    process.exit(0);
  }
  const f = function (v, d) { return v === undefined || v === null || !isFinite(v) ? "-" : v.toFixed(d); };
  const head = ["lv", "name", "bpm", "sec", "aps", "gapMed", "gap10", "slack", "mech", "combo", "rest", "D", "target", "±%", "×prev", "band", "ok"];
  const tab = [head];
  let bad = 0;
  rows.forEach(function (r) {
    if (!r.ok) { bad++; tab.push([String(r.n), r.name, String(r.bpm), f(r.sec, 1), "UNSOLVED"]); return; }
    const t = first.D ? target(first.D, r.n) : NaN, dev = (r.D / t - 1) * 100, ok = pass(r);
    if (!ok) bad++;
    tab.push([String(r.n), r.name, String(r.bpm), f(r.sec, 1), f(r.aps, 2), f(r.gapMed, 2), f(r.gap10, 2), f(r.slack, 2), f(r.mech, 2),
      f(r.combo, 0), f(r.rest, 2), f(r.D, 3), f(t, 3), (dev >= 0 ? "+" : "") + f(dev, 1), f(ratio(r), 3), band(r.n), ok ? "ok" : "NO"]);
  });
  const w = head.map(function (_, c) { return Math.max.apply(null, tab.map(function (r) { return (r[c] || "").length; })); });
  tab.forEach(function (r, i) {
    console.log(r.map(function (c, j) { c = c || ""; return j === 1 ? c + " ".repeat(w[j] - c.length) : " ".repeat(w[j] - c.length) + c; }).join("  "));
    if (i === 0) console.log(w.map(function (x) { return "-".repeat(x); }).join("  "));
  });
  console.log("\nD = aps·(1+" + W.a + "·mech)·(1+" + W.b + "·combo/10)·(1+" + W.c + "·(0.3−slack)/0.3)·(1−" + W.d + "·rest)·(0.25/max(gap10,0.12))^" + W.e +
    "\ntarget D(n) = D(1)·" + R + "^(n−1), within ±" + (TOL * 100) + " %, and D(n)/D(n−1) between " + RMIN + " and " + RMAX +
    (bad ? "\n" + bad + " level" + (bad > 1 ? "s" : "") + " off the curve" : ""));
}
