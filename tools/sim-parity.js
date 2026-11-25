#!/usr/bin/env node
/* =============================================================================
   tools/sim-parity.js [old sim.js | git ref] [--budget N]

   Proves that js/sim.js still plays every existing level exactly as the
   sim.js it is compared with: the one before Infinite Shadow (git commit
   108111b) by default, or a file / git ref given as the first argument.
   Built-in Node modules only.

     node tools/sim-parity.js                 against the sim.js before streams
     node tools/sim-parity.js old/sim.js      against a file
     node tools/sim-parity.js main            against a git ref

   compile() was split into the per-cell build() that SIM.append() shares, so
   for every level, HOME, the home demo and a few hundred random charts:
     compiled  the compiled level is identical field by field (stable JSON with
               sorted keys); its one function, baseAt, is compared by value at
               every quarter unit from -64 to endX + 64
     solve     SIM.solve finds the same path at margin 0 (DEC 6, the solver's
               defaults) and at the level's fairness margin with DEC 12
     replay    that path replays to the same final state
     lockstep  a seeded run (the path with random wrong inputs, so it dies part
               way) matches on every tick: the whole state, and its events once
               the new event names are left out (fade, flick, dodge, exitD,
               exitA, exitT, exitZ: emitted only, they change no state)
   The home demo replays DEMO_SOL tick by tick. Exits 1 on any difference.
   ========================================================================== */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm"), cp = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BASE_REF = "108111b";   /* the last commit before streams (README: Infinite Shadow) */
const NEW_EVENTS = { fade: 1, flick: 1, dodge: 1, exitD: 1, exitA: 1, exitT: 1, exitZ: 1 };
const args = process.argv.slice(2);
let ref = BASE_REF, budget = 6e6;
for (let i = 0; i < args.length; i++) { if (args[i] === "--budget") budget = +args[++i]; else ref = args[i]; }

function oldSource() {
  if (fs.existsSync(ref) && fs.statSync(ref).isFile()) return fs.readFileSync(ref, "utf8");
  try { return cp.execSync("git show " + ref + ":js/sim.js", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) { console.log("sim-parity: cannot read sim.js at '" + ref + "' (a shallow clone? fetch more history, or pass a file)"); process.exit(2); }
}
function context(simSrc, label) {
  const ctx = vm.createContext({});
  new vm.Script(simSrc, { filename: label + "/sim.js" }).runInContext(ctx);
  ["js/levels.js", "js/fixes.js", "js/demo.js"].forEach(function (f) { new vm.Script(fs.readFileSync(path.join(ROOT, f), "utf8"), { filename: label + "/" + f }).runInContext(ctx); });
  return vm.runInContext("({ SIM: SIM, LEVELS: LEVELS, HOME: HOME, FIX: typeof FIXES !== 'undefined' ? FIXES : {}, DEMO: DEMO_SOL })", ctx);
}
const A = context(oldSource(), "old"), B = context(fs.readFileSync(path.join(ROOT, "js/sim.js"), "utf8"), "new");

/* stable serialisation: sorted keys, typed arrays as arrays, functions left out (compared by value) */
function stable(v) {
  if (v === null || v === undefined) return String(v);
  const t = typeof v;
  if (t === "number") return Object.is(v, -0) ? "-0" : String(v);
  if (t === "boolean") return String(v);
  if (t === "string") return JSON.stringify(v);
  if (t === "function") return "fn";
  if (Array.isArray(v) || ArrayBuffer.isView(v)) return "[" + Array.prototype.map.call(v, stable).join(",") + "]";
  return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + stable(v[k]); }).join(",") + "}";
}
function firstDiff(a, b, p) {
  if (stable(a) === stable(b)) return null;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return p + ": " + stable(a).slice(0, 60) + " vs " + stable(b).slice(0, 60);
  const keys = Array.from(new Set(Object.keys(a).concat(Object.keys(b))));
  for (const k of keys) { const d = firstDiff(a[k], b[k], p + "." + k); if (d) return d; }
  return p + ": differs";
}
function sameLevel(LA, LB) {
  const d = firstDiff(LA, LB, "L"); if (d) return d;
  for (let x = -64; x <= LA.endX + 64; x += 0.25) if (LA.baseAt(x) !== LB.baseAt(x)) return "baseAt(" + x + "): " + LA.baseAt(x) + " vs " + LB.baseAt(x);
  return null;
}
function mulberry(seed) { return function () { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function lockstep(LA, LB, inputAt, maxTicks) {
  const sa = A.SIM.newState(), sb = B.SIM.newState(); sa.ev = []; sb.ev = [];
  for (let t = 0; t < maxTicks && !sa.dead && !sa.won; t++) {
    const v = inputAt(t);
    A.SIM.step(LA, sa, v & 1, v & 2, 0); B.SIM.step(LB, sb, v & 1, v & 2, 0);
    const evb = sb.ev.filter(function (e) { return !NEW_EVENTS[e]; });
    if (stable(evb) !== stable(sa.ev)) return "tick " + sa.tick + ": events " + stable(sa.ev) + " vs " + stable(sb.ev);
    const ea = sa.ev, eb = sb.ev; sa.ev = sb.ev = null;
    const d = firstDiff(sa, sb, "state"); sa.ev = ea; sb.ev = eb;
    if (d) return "tick " + sa.tick + ": " + d;
    sa.ev.length = 0; sb.ev.length = 0;
  }
  return sa.dead !== sb.dead || sa.won !== sb.won ? "end differs" : null;
}
function fair(n) { return n <= 1 ? 0.12 : n <= 10 ? 0.08 : n <= 20 ? 0.06 : 0.04; }

const rows = [["level", "compiled", "solve m0", "solve fair/12", "replay", "lockstep"]], bad = [];
function check(id, LA, LB, m) {
  const row = [id], fail = function (msg) { bad.push(id + " " + msg); return "DIFF"; };
  const d = sameLevel(LA, LB); row.push(d ? fail("compiled: " + d) : "ok");
  const sa = A.SIM.solve(LA, 0, budget, 6), sb = B.SIM.solve(LB, 0, budget, 6);
  row.push(stable(sa) === stable(sb) ? "ok" + (sa.ok ? " " + sa.path.length : " unsolved") : fail("solve m0 differs"));
  if (m !== null) {
    const fa = A.SIM.solve(LA, m, budget, 12), fb = B.SIM.solve(LB, m, budget, 12);
    row.push(stable(fa) === stable(fb) ? "ok" + (fa.ok ? " " + fa.path.length : " unsolved") : fail("solve fair/12 differs"));
  } else row.push("-");
  if (sa.ok) {
    const ra = A.SIM.replay(LA, sa.path, 6, 0), rb = B.SIM.replay(LB, sa.path, 6, 0);
    row.push(stable(ra) === stable(rb) ? "ok " + (ra.won ? "won" : ra.dead) : fail("replay: " + firstDiff(ra, rb, "s")));
  } else row.push("-");
  const rnd = mulberry(0x51ED + rows.length * 7919), p = sa.ok ? sa.path : [], inputs = [];
  for (let i = 0; i < Math.max(p.length, 3000); i++) inputs.push(rnd() < 0.006 ? Math.floor(rnd() * 4) : p[i] || (sa.ok ? 0 : rnd() < 0.2 ? 1 : 0));
  const ls = lockstep(LA, LB, function (t) { return inputs[Math.floor(t / 6)] || 0; }, inputs.length * 6);
  row.push(ls ? fail("lockstep: " + ls) : "ok");
  rows.push(row);
}
const t0 = Date.now();
for (let n = 1; n <= A.LEVELS.length; n++) {
  const dA = A.LEVELS[n - 1], dB = B.LEVELS[n - 1];
  dA.fix = A.FIX[n] || []; dB.fix = B.FIX[n] || [];
  check((n < 10 ? "0" : "") + n, A.SIM.compile(dA), B.SIM.compile(dB), fair(n));
}
check("home", A.SIM.compile(A.HOME), B.SIM.compile(B.HOME), null);
/* the attract demo: DEMO_SOL replayed on the looped home chart, every tick */
const demo = function (C) { return C.SIM.compile(Object.assign({}, C.HOME, { form: new Array(C.HOME.loops + 1).join(C.HOME.form + " ") })); };
const dA = demo(A), dB = demo(B), dIn = []; for (let i = 0; i < A.DEMO.rle.length; i += 2) for (let k = 0; k < A.DEMO.rle[i + 1]; k++) dIn.push(A.DEMO.rle[i]);
const dd = sameLevel(dA, dB) || lockstep(dA, dB, function (t) { return dIn[Math.floor(t / A.DEMO.DEC)] || 0; }, dIn.length * A.DEMO.DEC);
rows.push(["demo", dd ? "DIFF" : "ok", "-", "-", "-", dd ? "DIFF" : "ok " + dIn.length + " inputs"]); if (dd) bad.push("demo " + dd);
/* random charts: every terrain and overlay character, zones opened and closed, compiled in both */
const TER = "....^MI!_uU~+%#HvVY-'*=&|@", OV = "BOKGRCEenmxXS12F";
let fuzzBad = 0;
for (let k = 0; k < 300; k++) {
  const r = mulberry(k * 977 + 13), bars = 2 + Math.floor(r() * 6), n = bars * 8;
  let T = "", H = "";
  for (let i = 0; i < n; i++) { T += TER[Math.floor(r() * TER.length)]; H += r() < 0.15 ? OV[Math.floor(r() * OV.length)] : "."; }
  const z = "DATZL"[Math.floor(r() * 5)], a = 1 + Math.floor(r() * (n / 2)), b = a + 2 + Math.floor(r() * (n / 2 - 2));
  if (b < n) { H = H.slice(0, a) + z + H.slice(a + 1, b) + z.toLowerCase() + H.slice(b + 1); H = H.replace(/[DdAaTtZzLl]/g, function (c, i) { return i === a || i === b ? c : "."; }); }
  const def = { n: 900 + k, phr: { a: T + "/" + H }, form: "2a", fix: [] };
  let LA, LB; try { LA = A.SIM.compile(def); } catch (e) { LA = e.message; } try { LB = B.SIM.compile(def); } catch (e) { LB = e.message; }
  const d = typeof LA === "string" || typeof LB === "string" ? (LA === LB ? null : "threw differently") : sameLevel(LA, LB);
  if (d) { fuzzBad++; if (fuzzBad < 4) bad.push("random chart " + k + ": " + d); }
}
rows.push(["random", fuzzBad ? "DIFF " + fuzzBad : "ok 300 charts", "-", "-", "-", "-"]);

const w = rows[0].map(function (_, c) { return Math.max.apply(null, rows.map(function (r) { return String(r[c]).length; })); });
rows.forEach(function (r, i) { console.log("  " + r.map(function (c, j) { return String(c) + " ".repeat(w[j] - String(c).length); }).join("  ")); if (!i) console.log("  " + w.map(function (x) { return "-".repeat(x); }).join("  ")); });
bad.forEach(function (b) { console.log("  DIFF  " + b); });
console.log("\nsim-parity: " + (bad.length ? "FAIL (" + bad.length + ")" : "ok, every level, HOME and the demo play exactly as with sim.js at " + ref) + " (" + ((Date.now() - t0) / 1000).toFixed(1) + " s)");
process.exit(bad.length ? 1 : 0);
