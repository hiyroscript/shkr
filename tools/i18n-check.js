#!/usr/bin/env node
/* =============================================================================
   tools/i18n-check.js [repo-root]

   Checks the game's translations (js/i18n.js). Built-in Node modules only.
   Runs in CI before the release build, and locally:

     node tools/i18n-check.js

   Fails (exit 1) if
     - I18N.LANGS is not the ten languages, in menu order, each with a native
       name, a flag and an <html lang> code
     - any language is missing a key English has, or has a key English doesn't
     - a string's {placeholders} differ from the English string's
     - a string is empty, or contains a double quote (strings go into
       aria-label attributes)
     - a plural family (*.one / *.few / *.many / *.other) is incomplete
     - the English level, hazard or How to play names drift from js/levels.js
       (LEVELS[].name, HAZ[].name), or a level or hazard has no keys
     - index.html uses a data-i18n / data-i18n-aria id that English lacks, or
       js/game.js calls t("...") / tn("...") with a literal id English lacks
     - flagSVG() fails for a language, or two flags on one page share an id
   ========================================================================== */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const read = function (f) { return fs.readFileSync(path.join(ROOT, f), "utf8"); };
const errors = [];
const fail = function (m) { errors.push(m); };

const ctx = vm.createContext({ console: console, Intl: Intl });
ctx.window = ctx;
["js/sim.js", "js/levels.js", "js/i18n.js"].forEach(function (f) { new vm.Script(read(f), { filename: f }).runInContext(ctx); });
const I = ctx.I18N;
const data = vm.runInContext("({ levels: LEVELS.map(function (d) { return d.name; }), haz: HAZ.map(function (h) { return { k: h.k, name: h.name }; }) })", ctx);
if (!I) { console.log("i18n-check: FAIL: js/i18n.js does not define window.I18N"); process.exit(1); }

/* ---- languages */
const WANT = ["en", "zh", "es", "ru", "ja", "pt", "de", "fr", "ko", "pl"];
const codes = I.LANGS.map(function (l) { return l.code; });
if (codes.join() !== WANT.join()) fail("LANGS must be " + WANT.join(", ") + " in that order, found " + codes.join(", "));
I.LANGS.forEach(function (l) {
  if (!l.name || !l.flag || !l.html) fail(l.code + ": LANGS entry needs name, flag and html");
  if (!I.STR[l.code]) fail(l.code + ": no STR table");
});
Object.keys(I.STR).forEach(function (c) { if (codes.indexOf(c) < 0) fail("STR has a table for " + c + ", which is not in LANGS"); });

/* ---- keys and placeholders */
const EN = I.STR.en, enKeys = Object.keys(EN);
const ph = function (s) { return (s.match(/\{\w+\}/g) || []).slice().sort().join(" "); };
codes.forEach(function (c) {
  const T = I.STR[c]; if (!T) return;
  enKeys.forEach(function (k) {
    if (!Object.prototype.hasOwnProperty.call(T, k)) { fail(c + ': missing "' + k + '"'); return; }
    if (typeof T[k] !== "string" || !T[k].trim()) { fail(c + ': "' + k + '" is empty'); return; }
    if (ph(T[k]) !== ph(EN[k])) fail(c + ': "' + k + '" has placeholders [' + ph(T[k]) + "], English has [" + ph(EN[k]) + "]");
    if (T[k].indexOf('"') >= 0) fail(c + ': "' + k + '" contains a double quote');
  });
  Object.keys(T).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(EN, k)) fail(c + ': "' + k + '" is not an English key'); });
});
/* plural families */
const FORMS = ["one", "few", "many", "other"];
enKeys.forEach(function (k) {
  const m = k.match(/^(.*)\.(one|few|many|other)$/); if (!m) return;
  FORMS.forEach(function (f) { if (!Object.prototype.hasOwnProperty.call(EN, m[1] + "." + f)) fail('en: plural "' + m[1] + '" has no .' + f); });
});

/* ---- English names match the data the rest of the game (and the tools) read */
data.levels.forEach(function (name, i) {
  const k = "level." + (i + 1) + ".name";
  if (EN[k] !== name) fail('en: "' + k + '" is ' + JSON.stringify(EN[k]) + ", js/levels.js says " + JSON.stringify(name));
});
data.haz.forEach(function (h) {
  if (EN["hazard." + h.k + ".name"] !== h.name) fail('en: "hazard.' + h.k + '.name" is ' + JSON.stringify(EN["hazard." + h.k + ".name"]) + ", HAZ says " + JSON.stringify(h.name));
  if (!EN["hazard." + h.k + ".body"]) fail('en: no "hazard.' + h.k + '.body"');
});

/* ---- ids used by the page and the game */
const html = read("index.html"), used = {};
html.replace(/data-i18n(?:-aria)?="([^"]+)"/g, function (m, id) { used[id] = "index.html"; return m; });
const game = read("js/game.js");
game.replace(/\btn?\(\s*"([^"]+)"\s*[,)]/g, function (m, id) { used[id] = "js/game.js"; return m; });
/* How to play pages: id: "jump" -> howto.jump.name / .body */
const HT = (game.match(/const HOWTO = \[([\s\S]*?)\n  \];/) || [])[1] || "";
HT.replace(/\bid:\s*"([^"]+)"/g, function (m, id) { used["howto." + id + ".name"] = used["howto." + id + ".body"] = "js/game.js HOWTO"; return m; });
let nUsed = 0;
Object.keys(used).forEach(function (id) {
  nUsed++;
  const fam = FORMS.every(function (f) { return Object.prototype.hasOwnProperty.call(EN, id + "." + f); });
  if (!Object.prototype.hasOwnProperty.call(EN, id) && !fam) fail(used[id] + ' uses "' + id + '", which English does not have');
});
if (!/data-i18n="/.test(html)) fail("index.html has no data-i18n attributes");

/* ---- flags */
const ids = {};
codes.forEach(function (c) {
  let svg = "";
  try { svg = I.flagSVG(c); } catch (e) { fail(c + ": flagSVG threw " + e.message); return; }
  if (!/^<svg[^>]*viewBox="0 0 100 100"/.test(svg) || svg.indexOf("<clipPath") < 0 || !/stroke="currentColor"/.test(svg)) fail(c + ": flagSVG is not a clipped, outlined SVG");
  (svg.match(/\bid="([^"]+)"/g) || []).forEach(function (m) { if (ids[m]) fail(c + ": flag id " + m + " repeats"); ids[m] = 1; });
  const again = I.flagSVG(c);
  (again.match(/\bid="([^"]+)"/g) || []).forEach(function (m) { if (ids[m]) fail(c + ": a second flag reuses " + m); ids[m] = 1; });
});

/* ---- plurals pick the right forms */
const pick = function (c, n) { I.setLang(c); const s = I.tn("game.tries", n); I.setLang("en"); return s; };
[["ru", 1, "1 попытка"], ["ru", 3, "3 попытки"], ["ru", 5, "5 попыток"], ["pl", 2, "2 próby"], ["pl", 12, "12 prób"], ["en", 1, "1 attempt"], ["en", 4, "4 attempts"]]
  .forEach(function (x) { const got = pick(x[0], x[1]); if (got !== x[2]) fail(x[0] + ": tn(game.tries, " + x[1] + ") is " + JSON.stringify(got) + ", expected " + JSON.stringify(x[2])); });

if (errors.length) {
  errors.forEach(function (e) { console.log("  FAIL  " + e); });
  console.log("i18n-check: FAIL (" + errors.length + " problem" + (errors.length > 1 ? "s" : "") + ")");
  process.exit(1);
}
console.log("i18n-check: ok, " + codes.length + " languages × " + enKeys.length + " keys, " + nUsed + " ids used by index.html and game.js, " + codes.length + " flags");
