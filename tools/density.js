#!/usr/bin/env node
/* =============================================================================
   tools/density.js [levels] [--check]

   How busy each chart is, read straight from the chart (no solver, instant).
   Built-in Node modules only. Also used as a module by tools/check-levels.js.

     node tools/density.js            all levels
     node tools/density.js 7          one level
     node tools/density.js 10-20      a range
     node tools/density.js --check    exit 1 if a level is outside its band

   Columns (each chart char is half a beat):
     obst/bar  obstacle chars per bar: non-"." chars in the terrain row, over
               every bar of the level (intro and outro included)
     median    median gap in beats between consecutive busy cells after the
               2-bar intro. A cell is busy when its terrain char is not "." or
               its overlay holds a hazard object (Bloom, Halo, Prism key or
               gate, Rift, Comet, Mimic eye or beam, Thermal rock or block,
               Rail blade, Glass, Coil, Fade or Flicker tile); zone edges do
               not count
     longest   the longest such gap, in beats
     2nd       the second longest (levels 21-30 may spend the longest on one
               breather bar before the climax)
     empty     share of bars after the intro with no busy cell
     flat      the longest run, in bars, after the intro where the ground
               stays at one height: no step up or down, pit, tile, Glass pane
               or zone edge (a set piece needs a height profile, not flat
               filler)
     over      share of busy cells with something overhead: a bar, a hanging
               wall, a floating spike block, a tunnel, a crusher, a hurdle
               bar, a Thermal block, or a Rail (any cell under one)

   Bands (README, Difficulty):
     levels  1-9   2.5-3.5 obstacle chars per bar, longest gap <= 3 beats
     levels 10-20  3.5-5.0,                         longest gap <= 2 beats
     levels 21-30  5.0-7.0,                         longest gap <= 1.5 beats,
                   except one breather (at most 4 beats) before the climax
     every level   flat at most 3 bars (aim for about 2)
   ========================================================================== */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

/* the band, the busy cells and the measures themselves live in js/infinite.js (INF.rules), shared with Infinite
   Shadow's generator, which keeps its runs inside the same band */
const RULES = load(path.resolve(__dirname, "..")).INF.rules, FLAT_MAX = 3;
const band = RULES.band;

function measure(SIM, def) {
  const ex = SIM.expand(def), T = ex.T, H = ex.H, n = T.length, bars = n / 8;
  const st = RULES.chartStats(T, H, 16), obst = st.obst, gaps = st.gaps, at = st.at;
  const sorted = gaps.slice().sort(function (a, b) { return a - b; });
  const desc = gaps.slice().sort(function (a, b) { return b - a; });
  let empty = 0;
  for (let b = 2; b < bars; b++) {
    let any = false;
    for (let i = b * 8; i < b * 8 + 8; i++) if (RULES.busy(T, H, i)) { any = true; break; }
    if (!any) empty++;
  }
  const where = function (g) { const i = gaps.indexOf(g); return i < 0 ? "" : " (from bar " + Math.floor(at[i] / 8) + " char " + at[i] % 8 + ")"; };
  const r = { n: def.n, name: def.name, bars: bars, perBar: obst / bars, median: sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0,
    longest: desc[0] || 0, second: desc[1] || 0, empty: empty / (bars - 2), flat: st.flat / 8, overhead: st.over };
  const b = band(def.n), fails = [];
  if (r.perBar < b.lo - 1e-9 || r.perBar > b.hi + 1e-9) fails.push("obstacle chars per bar " + r.perBar.toFixed(2) + " outside " + b.lo + "-" + b.hi);
  if (b.breather) {
    if (r.longest > b.breather) fails.push("longest gap " + r.longest + " beats" + where(r.longest) + " (one breather may be up to " + b.breather + ")");
    if (r.second > b.gap) fails.push("second longest gap " + r.second + " beats (max " + b.gap + ")");
  } else if (r.longest > b.gap) fails.push("longest gap " + r.longest + " beats" + where(r.longest) + " (max " + b.gap + ")");
  if (r.flat > FLAT_MAX) fails.push("the ground stays flat for " + r.flat.toFixed(2) + " bars (max " + FLAT_MAX + ")");
  r.fails = fails;
  return r;
}

function load(root) {
  const ctx = vm.createContext({});
  ["js/sim.js", "js/levels.js", "js/infinite.js"].forEach(function (f) { new vm.Script(fs.readFileSync(path.join(root, f), "utf8"), { filename: f }).runInContext(ctx); });
  return vm.runInContext("({ SIM: SIM, LEVELS: LEVELS, INF: INF })", ctx);
}

module.exports = { measure: measure, band: band, load: load, FLAT_MAX: FLAT_MAX };

if (require.main === module) {
  const args = process.argv.slice(2), root = path.resolve(__dirname, "..");
  let sel = null, check = false;
  args.forEach(function (a) { if (a === "--check") check = true; else { const m = /^(\d+)(?:-(\d+))?$/.exec(a); if (m) sel = [+m[1], +(m[2] || m[1])]; } });
  const api = load(root), N = api.LEVELS.length, lo = sel ? sel[0] : 1, hi = sel ? sel[1] : N;
  const head = ["lv", "name", "bars", "obst/bar", "band", "median", "longest", "2nd", "max", "empty", "flat", "over", "ok"], tab = [head];
  let bad = 0;
  for (let n = lo; n <= hi; n++) {
    const r = measure(api.SIM, api.LEVELS[n - 1]), b = band(n);
    if (r.fails.length) bad++;
    tab.push([String(n), r.name, String(r.bars), r.perBar.toFixed(2), b.lo.toFixed(1) + "-" + b.hi.toFixed(1), r.median.toFixed(1), r.longest.toFixed(1),
      r.second.toFixed(1), b.breather ? b.gap + " (+" + b.breather + ")" : String(b.gap), Math.round(r.empty * 100) + " %", r.flat.toFixed(1),
      Math.round(r.overhead * 100) + " %", r.fails.length ? "NO" : "ok"]);
  }
  const w = head.map(function (_, c) { return Math.max.apply(null, tab.map(function (r) { return r[c].length; })); });
  tab.forEach(function (r, i) {
    console.log(r.map(function (c, j) { return j === 1 ? c + " ".repeat(w[j] - c.length) : " ".repeat(w[j] - c.length) + c; }).join("  "));
    if (i === 0) console.log(w.map(function (x) { return "-".repeat(x); }).join("  "));
  });
  for (let n = lo; n <= hi; n++) measure(api.SIM, api.LEVELS[n - 1]).fails.forEach(function (f) { console.log("  L" + n + " " + f); });
  if (check && bad) { console.log("\ndensity: " + bad + " level" + (bad > 1 ? "s" : "") + " outside the band"); process.exit(1); }
}
