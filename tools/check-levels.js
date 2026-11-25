#!/usr/bin/env node
/* =============================================================================
   tools/check-levels.js [levels] [--budget N]

   Checks every level against the rules in README (Difficulty). Exits 1 if any
   hard rule fails; soft rules (the "roughly" ones) only print warnings.
   Built-in Node modules only. Runs in CI before the release build.

     node tools/check-levels.js          all levels
     node tools/check-levels.js 7        one level (curve checks need level 1 too, which is always measured)
     node tools/check-levels.js 10-20    a range

   Hard rules
     length     every chart is exactly 60.0 s (±0.05): bpm a multiple of 4,
                bars = bpm / 4; tempo starts at 112, never drops, rises by 0
                or 4 per level
     solve      SIM.solve succeeds at margin 0 and at the level's fairness
                margin (0.12 on level 1, 0.08 on 2-10, 0.06 on 11-20, 0.04 on
                21-30), and the fair path replays to a win
     dec12      levels 1-20 still solve with an input change only every 12
                ticks (no window shorter than two solver decisions)
     view       no input needs something more than (view − 1 beat) ahead,
                and every rolling blade is on screen at least a beat before
                the input that clears it (view = 10.8 units, the narrowest
                landscape or portrait screen render.js allows)
     intro      the first 2 bars hold no hazard
     hazards    no hazard before its level; at least 3 hazards from level 4
                (both that exist, on level 4), 5 from level 12, 7 from level
                20, all 15 on level 30; once a hazard is 4 levels old it
                appears in every 3 levels in a row; no gap over 6 levels
     obstacles  no newer plain obstacle before its level (OBST); from level 3
                on at least 6 plain obstacle kinds, none over 35 % of them
     zones      zones of different gravity kinds (D, A, T, Z) never overlap
     repeat     no phrase is played more than 3 times in a row
     curve      D is within ±1.5 % of D(1) · 1.10^(n−1) (target), and
                D(n) / D(n−1) is between 1.08 and 1.12 (ratio). Both are
                printed for every level and either one fails the run
     density    obstacle chars per bar and the longest gap between busy cells
                stay in the level's band (tools/density.js): 2.5-3.5 and 3
                beats on 1-9, 3.5-5.0 and 2 beats on 10-20, 5.0-7.0 and 1.5
                beats on 21-30, where one breather of up to 4 beats is allowed;
                the ground never stays at one height for more than 3 bars
     structure  a level is built from set pieces (its phrases other than the
                empty bar): at least 6 different ones, 10 on levels 21-30, and
                the same one never twice in a row
   Soft rules (warnings)
     combos     per minute: 0 on levels 1-2 (one hazard exists), 2-4 on 3-9,
                5-8 on 10-20, 8-14 on 21-30
     ceiling    from level 10, something overhead (bar, hanging wall,
                floating spike block, tunnel, crusher, hurdle bar, Thermal
                block, Rail) in at least a quarter of the busy cells
     energy     intro bars at 0-1, a peak at 3-4, long runs of 4 only from
                level 24
     arc        the densest 4 bars sit 55-90 % of the way through
   ========================================================================== */
"use strict";
const path = require("path");
const DF = require("./difficulty.js"), DN = require("./density.js");

const args = process.argv.slice(2), root = path.resolve(__dirname, "..");
let budget = 6e6, sel = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--budget") budget = +args[++i];
  else { const m = /^(\d+)(?:-(\d+))?$/.exec(args[i]); if (m) sel = [+m[1], +(m[2] || m[1])]; }
}
const api = DF.load(root), SIM = api.SIM, LEVELS = api.LEVELS, N = LEVELS.length, HAZ = api.HAZ;
const OBST = require("vm").runInNewContext(require("fs").readFileSync(path.join(root, "js/levels.js"), "utf8") + ";OBST");
const lo = sel ? sel[0] : 1, hi = sel ? sel[1] : N;
const VIEW = 10.8, PLAIN = "^MI!-'_uU+#H" + OBST.map(function (o) { return o.ch; }).join("");
const GRAV = { D: 1, A: 1, T: 1, Z: 1 };
const errors = [], warns = [];
function err(n, rule, msg) { errors.push("L" + n + " " + rule + ": " + msg); }
function warn(n, rule, msg) { warns.push("L" + n + " " + rule + ": " + msg); }
const t0 = Date.now();

/* ---------------------------------------------------------------- tempo (all levels: it is a curve) */
LEVELS.forEach(function (d, i) {
  const bpm = d.mu[0];
  if (bpm % 4) err(d.n, "length", "bpm " + bpm + " is not a multiple of 4");
  if (i === 0 && bpm !== 112) err(d.n, "length", "level 1 must stay at 112 bpm");
  if (i > 0) { const dv = bpm - LEVELS[i - 1].mu[0]; if (dv !== 0 && dv !== 4) err(d.n, "length", "tempo changes by " + dv + " from level " + i); }
});

/* ---------------------------------------------------------------- hazards over the whole game */
const used = {};
LEVELS.forEach(function (d) { used[d.n] = DF.kindsUsed(api.level(d.n)); });
const hazLv = {}; HAZ.forEach(function (h) { hazLv[h.k] = h.lv; });
LEVELS.forEach(function (d) {
  const n = d.n, k = used[n], avail = HAZ.filter(function (h) { return h.lv <= n; }).length;
  k.forEach(function (h) { if (hazLv[h] > n) err(n, "hazards", HAZ.find(function (x) { return x.k === h; }).name + " appears before level " + hazLv[h]); });
  const need = n === N ? HAZ.length : n >= 20 ? 7 : n >= 12 ? 5 : n >= 4 ? Math.min(3, avail) : 1;
  if (k.length < need) err(n, "hazards", "uses " + k.length + " hazards (" + k.join(" ") + "), needs " + need);
});
HAZ.forEach(function (h) {
  for (let n = h.lv + 4; n + 2 <= N; n++)
    if (used[n].indexOf(h.k) < 0 && used[n + 1].indexOf(h.k) < 0 && used[n + 2].indexOf(h.k) < 0) err(n, "hazards", h.name + " is missing from levels " + n + "-" + (n + 2));
  let gap = 0;
  for (let n = h.lv + 1; n <= N; n++) { if (used[n].indexOf(h.k) < 0) gap++; else gap = 0; if (gap > 6) { err(n, "hazards", h.name + " has a gap longer than 6 levels"); break; } }
});

/* ---------------------------------------------------------------- per level */
let D1 = null, prevD = 0;
const rows = [["lv", "bpm", "sec", "hazards", "plain kinds", "pieces", "combo", "D", "target", "±%", "×prev", "band", "slack", "fair m", "steps", "dec12"]];
for (let n = (lo > 1 ? 1 : lo); n <= hi; n++) {
  if (n > 1 && n < lo - 1) continue;   /* outside the range only level 1 (the anchor) and level lo − 1 (the ratio) are measured */
  const d = LEVELS[n - 1], L = api.level(n), bpm = d.mu[0], sec = (L.cells / 2) * 60 / bpm, fm = DF.fairMargin(n);
  const inRange = n >= lo;
  /* length */
  if (inRange && Math.abs(sec - 60) > 0.05) err(n, "length", sec.toFixed(2) + " s (" + L.cells / 2 + " beats at " + bpm + " bpm), must be 60.0");
  /* solve at 0 and at the fairness margin, replay */
  const s0 = SIM.solve(L, 0, budget, 6), sf = s0.ok ? SIM.solve(L, fm, budget, 6) : s0;
  if (!s0.ok) { err(n, "solve", "unsolved at margin 0 (best x " + s0.best.toFixed(1) + ", " + s0.cause + ")"); continue; }
  if (!sf.ok) { err(n, "solve", "unsolved at fairness margin " + fm + " (best x " + sf.best.toFixed(1) + ", " + sf.cause + ")"); continue; }
  const rp = SIM.replay(L, sf.path, sf.DEC, fm);
  if (!rp.won) err(n, "solve", "fair path replays to " + (rp.dead || "no win"));
  const M = DF.measure(api, n, { budget: budget, sol: sf, margin: fm });
  if (n === 1) D1 = M.D;
  if (!inRange) { prevD = M.D; continue; }
  let dec12 = "-";
  if (n <= 20 || sel) {
    const s12 = SIM.solve(L, 0, budget, 12);
    dec12 = s12.ok ? "ok" : "FAIL";
    if (!s12.ok && n <= 20) err(n, "dec12", "unsolved with DEC 12 (best x " + s12.best.toFixed(1) + ", " + s12.cause + ")");
  }
  /* view: inputs only for things on screen a beat ahead. Each thing is an interval; an input is for something
     not yet passed (it can be for a key the runner is above right now), so the distance is to the nearest such one.
     INF.rules.view (js/infinite.js), the same rule Infinite Shadow checks every chunk against */
  const vw = api.INF.rules.view(L, M.acts, false);
  if (vw.worst > VIEW - 4) err(n, "view", "an input comes " + vw.worst.toFixed(1) + " units before the next thing it could be for (max " + (VIEW - 4) + ")");
  vw.late.forEach(function (b) { err(n, "view", "rolling blade at x " + b.x.toFixed(0) + " is on screen only " + b.beats.toFixed(2) + " beats before its jump"); });
  /* intro bars */
  const hz = DF.hazards(L);
  hz.forEach(function (h) { if (h.x0 < 32) err(n, "intro", "hazard " + h.k + " in the first 2 bars (x " + h.x0.toFixed(1) + ")"); });
  /* plain obstacles */
  const cnt = {}; let tot = 0;
  for (let i = 0; i < L.cells; i++) {
    const c = L.T[i]; if (PLAIN.indexOf(c) < 0) continue;
    if (c === "=" && L.T[i - 1] === "=") continue;
    cnt[c] = (cnt[c] || 0) + 1; tot++;
  }
  OBST.forEach(function (o) { if (cnt[o.ch] && n < o.lv) err(n, "obstacles", o.name + " (" + o.ch + ") appears before level " + o.lv); });
  const kinds = Object.keys(cnt), top = kinds.reduce(function (a, k) { return cnt[k] > (cnt[a] || 0) ? k : a; }, "");
  if (n >= 3 && kinds.length < 6) err(n, "obstacles", "only " + kinds.length + " plain obstacle kinds (" + kinds.join(" ") + "), needs 6");
  if (n >= 3 && tot && cnt[top] / tot > 0.35) err(n, "obstacles", "'" + top + "' is " + Math.round(cnt[top] / tot * 100) + " % of the plain obstacles (max 35 %)");
  /* density */
  DN.measure(SIM, d).fails.forEach(function (f) { err(n, "density", f); });
  /* zones */
  const gz = L.zones.filter(function (z) { return GRAV[z.k]; });
  for (let i = 0; i < gz.length; i++) for (let j = i + 1; j < gz.length; j++)
    if (gz[i].k !== gz[j].k && gz[i].x0 < gz[j].x1 && gz[j].x0 < gz[i].x1) err(n, "zones", gz[i].k + " and " + gz[j].k + " overlap at x " + Math.max(gz[i].x0, gz[j].x0));
  /* phrase repeats */
  const keys = d.form.replace(/[\s0-9]/g, "");
  for (let i = 0, run = 1; i < keys.length; i++) { run = i && keys[i] === keys[i - 1] ? run + 1 : 1; if (run > 3) { err(n, "repeat", "phrase " + keys[i] + " plays " + run + " times in a row"); break; } }
  /* set pieces: every phrase that is not the empty bar is one structure */
  const pieces = {}; keys.split("").forEach(function (k) { if (/[^.]/.test(d.phr[k].split("/")[0].replace(/\s+/g, "")) || (d.phr[k].split("/")[1] || "").replace(/[.\s]/g, "")) pieces[k] = 1; });
  const needP = n >= 21 ? 10 : 6, nP = Object.keys(pieces).length;
  if (nP < needP) err(n, "structure", "only " + nP + " different set pieces, needs " + needP);
  for (let i = 1; i < keys.length; i++) if (keys[i] === keys[i - 1] && pieces[keys[i]]) { err(n, "structure", "set piece " + keys[i] + " twice in a row"); break; }
  /* curve: on target, and 1.08-1.12 times the level before */
  const tg = DF.target(D1, n), dev = M.D / tg - 1, q = n > 1 && prevD ? M.D / prevD : null;
  if (Math.abs(dev) > DF.TOL + 1e-12) err(n, "curve", "D " + M.D.toFixed(3) + " is " + (dev * 100).toFixed(1) + " % from its target " + tg.toFixed(3) + " (max ±" + DF.TOL * 100 + " %)");
  if (q !== null && (q < DF.RMIN - 1e-12 || q > DF.RMAX + 1e-12)) err(n, "curve", "D " + M.D.toFixed(3) + " is " + q.toFixed(3) + "× level " + (n - 1) + "'s " + prevD.toFixed(3) + " (must be " + DF.RMIN + "-" + DF.RMAX + "×)");
  prevD = M.D;
  /* soft rules */
  const cb = M.combo, cr = n <= 2 ? [0, 0] : n <= 9 ? [2, 4] : n <= 20 ? [5, 8] : [8, 14];
  if (cb < cr[0] || cb > cr[1]) warn(n, "combos", cb.toFixed(0) + " per minute, expected " + cr[0] + "-" + cr[1]);
  const en = L.energy;
  if (en[0] > 1 || en[1] > 1) warn(n, "energy", "intro bars should be at energy 0-1");
  if (Math.max.apply(null, en) < 3) warn(n, "energy", "no bar reaches energy 3");
  let run4 = 0, max4 = 0; en.forEach(function (e) { run4 = e === 4 ? run4 + 1 : 0; max4 = Math.max(max4, run4); });
  if (n < 24 && max4 > 4) warn(n, "energy", max4 + " bars in a row at energy 4 (long stretches only from level 24)");
  const per = new Array(L.bars).fill(0); M.acts.forEach(function (a) { const b = Math.floor(a.t / (4 * SIM.TPB)); if (b < L.bars) per[b]++; });
  let bw = 0, bi = 0; for (let b = 0; b + 4 <= L.bars; b++) { const v = per[b] + per[b + 1] + per[b + 2] + per[b + 3]; if (v > bw) { bw = v; bi = b; } }
  const where = (bi + 2) / L.bars; if (where < 0.55 || where > 0.9) warn(n, "arc", "densest 4 bars centre at " + Math.round(where * 100) + " % of the level");
  const dn = DN.measure(SIM, d);
  if (n >= 10 && dn.overhead < 0.25) warn(n, "ceiling", "something overhead in only " + Math.round(dn.overhead * 100) + " % of busy cells (aim for a third)");
  rows.push([String(n), String(bpm), sec.toFixed(1), String(M.kinds.length), String(kinds.length), String(nP), cb.toFixed(0), M.D.toFixed(3), tg.toFixed(3),
    (dev >= 0 ? "+" : "") + (dev * 100).toFixed(1), q === null ? "-" : q.toFixed(3), DF.band(n), M.slack.toFixed(2), String(fm), String(sf.steps), dec12]);
}

/* ---------------------------------------------------------------- report */
const w = rows[0].map(function (_, c) { return Math.max.apply(null, rows.map(function (r) { return r[c].length; })); });
rows.forEach(function (r, i) {
  console.log(r.map(function (c, j) { return " ".repeat(w[j] - c.length) + c; }).join("  "));
  if (i === 0) console.log(w.map(function (x) { return "-".repeat(x); }).join("  "));
});
console.log("");
warns.forEach(function (m) { console.log("  warn  " + m); });
errors.forEach(function (m) { console.log("  FAIL  " + m); });
const secs = ((Date.now() - t0) / 1000).toFixed(1);
if (errors.length) { console.log("\ncheck-levels: FAIL (" + errors.length + " problem" + (errors.length > 1 ? "s" : "") + ", " + warns.length + " warnings, " + secs + " s)"); process.exit(1); }
console.log("check-levels: ok (" + (hi - lo + 1) + " levels, " + warns.length + " warnings, " + secs + " s)");
