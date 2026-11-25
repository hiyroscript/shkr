#!/usr/bin/env node
/* =============================================================================
   tools/parity-check.js <repo-root> <release-dir>

   Proves that a release build plays exactly like the source, minus the
   developer code. Runs on every release build (after tools/build-release.sh,
   before the zip is made) and locally. Built-in Node modules only.

   A. File parity (exact)
      - the release holds only index.html, css/ and js/; every release file
        exists in the source, and every source file under index.html, css/
        and js/ is in the release, except js/dev.js and js/dev-config.js,
        which must not be
      - every shared file is byte-identical (SHA-256), except index.html,
        which must equal the source after removing only the lines marked
        <!-- dev-only --> and restamping the shkr-build meta
   B. Gameplay parity (behaviour)
      - sim.js, levels.js, fixes.js and demo.js load as classic scripts in two
        separate vm contexts, one from each tree
      - every level and HOME compiles to the same thing in both (stable JSON,
        SHA-256); FIXES[n] is applied the way game.js's getL does
      - each level is solved once in the source context and that input path
        is replayed in both; final states must be identical. A level the
        solver cannot beat in budget is played with a seeded pseudo-random
        input instead, comparing both states every tick. Solved levels also
        get a seeded run (the solution with a few random wrong inputs) that
        is compared every tick, so dying paths are covered too
      - DEMO_SOL is replayed on the home demo level in both
      - Infinite Shadow (js/infinite.js): the first 64 bars of a fixed seed are
        generated in both; every chunk's chart and template, the action chart,
        the solver's path and the compiled stream must be identical, and the
        source's path is replayed on both streams, comparing every tick

   Prints a table and exits 1 on any mismatch, naming the first differing field.
   ========================================================================== */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm"), crypto = require("crypto");

const DEV_FILES = ["js/dev.js", "js/dev-config.js"];
const SIM_FILES = ["js/sim.js", "js/levels.js", "js/fixes.js", "js/infinite.js", "js/demo.js"];
const INF_SEED = 0x5EED0001, INF_BARS = 64;
const META_DEV = '<meta name="shkr-build" content="dev">';
const META_RELEASE = /<meta name="shkr-build" content="release · [0-9A-Za-z._-]+ · [^"]+">/g;
const SOLVE_MARGIN = 0, SOLVE_BUDGET = 6e6, SOLVE_DEC = 6;   /* SIM.solve's own defaults */
const RANDOM_TICKS = 20000;

const args = process.argv.slice(2);
if (args.length !== 2) { console.error("usage: node tools/parity-check.js <repo-root> <release-dir>"); process.exit(2); }
const SRC = path.resolve(args[0]), REL = path.resolve(args[1]);

const failures = [];
function fail(msg) { failures.push(msg); console.log("  MISMATCH  " + msg); }

/* ---------------------------------------------------------------- helpers */
function sha(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }
function isFile(p) { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }
function walk(root, rel, out) {
  const abs = path.join(root, rel);
  let st; try { st = fs.statSync(abs); } catch (e) { return out; }
  if (st.isDirectory()) fs.readdirSync(abs).sort().forEach(function (n) { walk(root, rel ? rel + "/" + n : n, out); });
  else if (st.isFile()) out.push(rel);
  return out;
}
/* same rule as build-release.sh: drop every line containing <!-- dev-only --> */
function stripDevOnly(text) { return text.split("\n").filter(function (ln) { return ln.indexOf("<!-- dev-only -->") < 0; }).join("\n"); }
function firstLineDiff(a, b) {
  const A = a.split("\n"), B = b.split("\n");
  for (let i = 0; i < Math.max(A.length, B.length); i++)
    if (A[i] !== B[i]) return "line " + (i + 1) + ": expected " + JSON.stringify(A[i]) + ", release has " + JSON.stringify(B[i]);
  return "same lines, different bytes";
}
/* stable serialisation: sorted keys, typed arrays as arrays, -0 and non-finite numbers kept distinct */
function kind(v) { return Object.prototype.toString.call(v).slice(8, -1); }
function stable(v, seen) {
  seen = seen || [];
  if (v === null || v === undefined) return String(v);
  const t = typeof v;
  if (t === "number") return Object.is(v, -0) ? "-0" : String(v);
  if (t === "boolean") return String(v);
  if (t === "string") return JSON.stringify(v);
  if (t === "function") return "fn:" + sha(String(v)).slice(0, 16);
  if (seen.indexOf(v) >= 0) return "[cycle]";
  seen.push(v);
  let s;
  if (Array.isArray(v) || /Array$/.test(kind(v))) s = "[" + Array.prototype.map.call(v, function (x) { return stable(x, seen); }).join(",") + "]";
  else s = "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + stable(v[k], seen); }).join(",") + "}";
  seen.pop();
  return s;
}
/* first differing field between two values, as a path */
function diff(a, b, p, depth) {
  p = p || ""; depth = depth || 0;
  if (stable(a) === stable(b)) return null;
  const ta = typeof a, tb = typeof b;
  const container = function (v) { return v !== null && typeof v === "object"; };
  if (depth > 40 || !container(a) || !container(b) || ta !== tb) return (p || "(value)") + ": source " + short(a) + ", release " + short(b);
  const arr = Array.isArray(a) || /Array$/.test(kind(a));
  const keys = arr ? Array.from({ length: Math.max(a.length, b.length) }, function (_, i) { return i; })
    : Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).sort();
  for (const k of keys) {
    const d = diff(a[k], b[k], arr ? p + "[" + k + "]" : (p ? p + "." : "") + k, depth + 1);
    if (d) return d;
  }
  return (p || "(value)") + ": differs";
}
function short(v) { const s = stable(v); return s.length > 80 ? s.slice(0, 77) + "..." : s; }
function mulberry32(seed) {
  return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/* ---------------------------------------------------------------- A. file parity */
function fileParity() {
  console.log("A. file parity: " + SRC + "  vs  " + REL);
  const before = failures.length;
  if (!isFile(path.join(REL, "index.html"))) { fail("release has no index.html"); return; }
  const relFiles = walk(REL, "", []);
  const srcFiles = ["index.html"].concat(walk(SRC, "css", []), walk(SRC, "js", []));
  relFiles.forEach(function (f) {
    if (f !== "index.html" && !/^(css|js)\//.test(f)) fail(f + ": in the release but not part of the game (only index.html, css/ and js/ belong there)");
    else if (!isFile(path.join(SRC, f))) fail(f + ": in the release but not in the source");
  });
  DEV_FILES.forEach(function (f) { if (isFile(path.join(REL, f))) fail(f + ": developer file is in the release"); });
  let same = 0;
  srcFiles.forEach(function (f) {
    if (DEV_FILES.indexOf(f) >= 0) return;
    const rp = path.join(REL, f);
    if (!isFile(rp)) { fail(f + ": missing from the release"); return; }
    const sb = fs.readFileSync(path.join(SRC, f)), rb = fs.readFileSync(rp);
    if (f === "index.html") {
      const got = rb.toString("utf8"), stamps = got.match(META_RELEASE) || [];
      let want = stripDevOnly(sb.toString("utf8"));
      if (want.split(META_DEV).length !== 2) { fail("index.html: the source must contain exactly one " + META_DEV); return; }
      if (stamps.length !== 1) { fail('index.html: the release must contain exactly one <meta name="shkr-build" content="release · <sha> · <date>">'); return; }
      want = want.replace(META_DEV, stamps[0]);
      if (want !== got) { fail("index.html: differs from the source beyond the allowed changes (" + firstLineDiff(want, got) + ")"); return; }
    } else if (sha(sb) !== sha(rb)) { fail(f + ": not byte-identical (sha256 " + sha(sb).slice(0, 12) + " vs " + sha(rb).slice(0, 12) + ")"); return; }
    same++;
  });
  if (failures.length === before) console.log("  ok: " + relFiles.length + " release files, all match the source (" + (same - 1) + " byte-identical, index.html equal after removing the dev-only lines and the stamp)");
}

/* ---------------------------------------------------------------- B. gameplay parity */
function context(root, label) {
  const ctx = vm.createContext({ console: { log: function () {}, warn: function () {}, error: function () {} } });
  SIM_FILES.forEach(function (f) { new vm.Script(fs.readFileSync(path.join(root, f), "utf8"), { filename: label + "/" + f }).runInContext(ctx); });
  return vm.runInContext("({" +
    "SIM: SIM, N: LEVELS.length," +
    "names: LEVELS.map(function (d) { return d.name; })," +
    /* exactly what game.js's getL / homeL / demoL / demoIn do */
    "level: function (n) { var FIX = typeof FIXES !== 'undefined' ? FIXES : {}; var d = LEVELS[n - 1]; d.fix = FIX[n] || []; return SIM.compile(d); }," +
    "home: function () { return SIM.compile(HOME); }," +
    "demo: function () { return SIM.compile(Object.assign({}, HOME, { form: new Array(HOME.loops + 1).join(HOME.form + ' ') })); }," +
    "demoPath: function () { var r = DEMO_SOL.rle, p = []; for (var i = 0; i < r.length; i += 2) for (var k = 0; k < r[i + 1]; k++) p.push(r[i]); return { path: p, DEC: DEMO_SOL.DEC }; }," +
    /* Infinite Shadow: a seed's first bars, as the game makes them */
    "inf: function (seed, bars) { var g = INF.create(seed); g.fill(bars); return g; }, infDEC: INF.DEC" +
    "})", ctx, { filename: label + "/parity-api" });
}
/* step both contexts in lockstep, comparing the whole state (and its events) after every tick */
function lockstep(A, LA, B, LB, inputAt, maxTicks) {
  const sa = A.SIM.newState(), sb = B.SIM.newState();
  sa.ev = []; sb.ev = [];
  for (let t = 0; t < maxTicks && !sa.dead && !sa.won && !sb.dead && !sb.won; t++) {
    const v = inputAt(t);
    A.SIM.step(LA, sa, v & 1, v & 2, 0); B.SIM.step(LB, sb, v & 1, v & 2, 0);
    if (stable(sa) !== stable(sb)) return { ok: false, tick: sa.tick, field: diff(sa, sb, "state") };
    sa.ev.length = 0; sb.ev.length = 0;
  }
  return { ok: true, s: sa };
}
function endName(s) { return s.won ? "won" : s.dead ? "dead:" + s.dead : "running"; }

function gameplayParity() {
  console.log("\nB. gameplay parity (vm contexts: " + SIM_FILES.join(" → ") + ")");
  let S, R;
  try { S = context(SRC, "source"); } catch (e) { fail("source scripts failed to load: " + e.message); return; }
  try { R = context(REL, "release"); } catch (e) { fail("release scripts failed to load: " + e.message); return; }
  if (S.N !== R.N) { fail("level count: source " + S.N + ", release " + R.N); return; }

  const rows = [["level", "name", "compiled", "replay", "seeded run (every tick)", "ticks", "input"]];
  const check = function (id, name, LS, LR, path, DEC, source) {
    const row = [id, name, "", "", "", "", source];
    const hs = sha(stable(LS)), hr = sha(stable(LR));
    row[2] = hs === hr ? "ok " + hs.slice(0, 8) : "MISMATCH";
    if (hs !== hr) fail(id + " compiled level differs: " + diff(LS, LR, "L"));
    if (path) {
      const a = S.SIM.replay(LS, path, DEC, 0), b = R.SIM.replay(LR, path, DEC, 0);
      if (stable(a) === stable(b)) { row[3] = "ok " + endName(a); row[5] = String(a.tick); }
      else {
        row[3] = "MISMATCH"; row[5] = a.tick + "/" + b.tick;
        const ls = lockstep(S, LS, R, LR, function (t) { return path[Math.floor(t / DEC)] || 0; }, a.tick + 1);
        fail(id + " replay differs: " + (ls.ok ? diff(a, b, "state") : "first at tick " + ls.tick + ", " + ls.field));
      }
    }
    /* Seeded pseudo-random input, compared every tick. Without a solution it is plain random input (mostly
       running, some jumps and slides, each held for DEC ticks). With one, it is the solution with a few seeded
       wrong inputs, so the run gets deep into the level before it dies there. */
    const rnd = mulberry32(0x5EED + (+id || 0) * 7919), inputs = [];
    const pick = function () { const r = rnd(); return r < 0.72 ? 0 : r < 0.9 ? 1 : r < 0.97 ? 2 : 3; };
    const rDEC = path ? DEC : SOLVE_DEC, rTicks = path ? path.length * DEC + 1 : RANDOM_TICKS;
    for (let i = 0; i * rDEC < rTicks; i++) inputs.push(path ? (rnd() < 0.004 ? pick() : path[i] || 0) : pick());
    const ls = lockstep(S, LS, R, LR, function (t) { return inputs[Math.floor(t / rDEC)] || 0; }, rTicks);
    if (ls.ok) { row[4] = "ok " + endName(ls.s) + " @" + ls.s.tick; if (!path) row[5] = String(ls.s.tick); }
    else { row[4] = "MISMATCH"; fail(id + " seeded run differs at tick " + ls.tick + ": " + ls.field); }
    rows.push(row);
  };

  for (let n = 1; n <= S.N; n++) {
    const id = (n < 10 ? "0" : "") + n;
    let LS, LR;
    try { LS = S.level(n); } catch (e) { fail(id + " source compile threw: " + e.message); continue; }
    try { LR = R.level(n); } catch (e) { fail(id + " release compile threw: " + e.message); continue; }
    const sol = S.SIM.solve(LS, SOLVE_MARGIN, SOLVE_BUDGET, SOLVE_DEC);
    check(id, S.names[n - 1], LS, LR, sol.ok ? sol.path : null, sol.ok ? sol.DEC : 0, sol.ok ? "solved, " + sol.path.length + " inputs" : "unsolved in budget: seeded random");
  }
  try {
    check("home", "HOME chart", S.home(), R.home(), null, 0, "compile only");
    const dp = S.demoPath(), dr = R.demoPath();
    if (stable(dp) !== stable(dr)) fail("DEMO_SOL differs: " + diff(dp, dr, "DEMO_SOL"));
    check("demo", "home demo run", S.demo(), R.demo(), dp.path, dp.DEC, "DEMO_SOL, " + dp.path.length + " inputs");
  } catch (e) { fail("home/demo threw: " + e.message); }
  try { infParity(S, R, rows); } catch (e) { fail("Infinite Shadow threw: " + e.message); }

  const w = rows[0].map(function (_, c) { return Math.max.apply(null, rows.map(function (r) { return r[c].length; })); });
  rows.forEach(function (r, i) {
    console.log("  " + r.map(function (c, j) { return c + " ".repeat(w[j] - c.length); }).join("  "));
    if (i === 0) console.log("  " + w.map(function (x) { return "-".repeat(x); }).join("  "));
  });
}

/* the first INF_BARS bars of one seed in both trees */
function infParity(S, R, rows) {
  const gs = S.inf(INF_SEED, INF_BARS), gr = R.inf(INF_SEED, INF_BARS), row = ["inf", "seed 0x" + INF_SEED.toString(16) + ", " + INF_BARS + " bars", "", "", "", "", ""];
  const ticks = INF_BARS * 4 * S.SIM.TPB, DEC = S.infDEC;
  const pick = function (g) {
    const ch = g.chunks.filter(function (c) { return c.bar < INF_BARS; });
    return { chunks: ch.map(function (c) { return { bar: c.bar, bars: c.bars, T: c.T, H: c.H, tpl: c.tpl, haz: c.haz, combo: c.combo, ph: c.ph, acts: c.acts }; }),
      chart: Array.from(g.L.chart.slice(0, INF_BARS * 8)), path: g.path.slice(0, Math.ceil(ticks / S.infDEC)), biomes: g.biomes.slice(0, 4) };
  };
  const a = pick(gs), b = pick(gr);
  if (stable(a) !== stable(b)) { row[2] = "MISMATCH"; fail("inf generated bars differ: " + diff(a, b, "inf")); }
  else {
    /* the streams themselves: what the sim plays (functions compared by their source, like the levels) */
    const ls = { segs: gs.L.segs, objs: gs.L.objs, zones: gs.L.zones, rails: gs.L.rails, coils: gs.L.coils }, lr = { segs: gr.L.segs, objs: gr.L.objs, zones: gr.L.zones, rails: gr.L.rails, coils: gr.L.coils };
    const hs = sha(stable(ls)), hr = sha(stable(lr));
    row[2] = hs === hr ? "ok " + hs.slice(0, 8) : "MISMATCH";
    if (hs !== hr) fail("inf compiled stream differs: " + diff(ls, lr, "L"));
  }
  /* the source's path, replayed on both streams up to the end of bar INF_BARS, compared every tick */
  const ls2 = lockstep(S, gs.L, R, gr.L, function (t) { return gs.path[Math.floor(t / DEC)] || 0; }, ticks);
  if (ls2.ok) { row[3] = "ok " + endName(ls2.s); row[4] = "ok @" + ls2.s.tick; row[5] = String(ls2.s.tick); }
  else { row[3] = row[4] = "MISMATCH"; fail("inf replay differs at tick " + ls2.tick + ": " + ls2.field); }
  if (ls2.ok && ls2.s.dead) fail("inf: the solver's path dies at tick " + ls2.s.tick + " (" + ls2.s.dead + ")");
  row[6] = "solver path, " + Math.ceil(ticks / DEC) + " inputs";
  rows.push(row);
}

const t0 = Date.now();
fileParity();
gameplayParity();
console.log("");
if (failures.length) {
  console.log("parity-check: FAIL (" + failures.length + " mismatch" + (failures.length > 1 ? "es" : "") + "), first: " + failures[0]);
  process.exit(1);
}
console.log("parity-check: ok, the release plays exactly like the source (" + ((Date.now() - t0) / 1000).toFixed(1) + "s)");
