/* ---- game.js ---- */
/* ============================================================================
   GAME — state, clock, input, HUD, home screen, How to play, results, rebirth.
   UI behaviour follows hiyroscript/vl (screens, cards, wipe, pause rules).
   ========================================================================== */
(function () {
  "use strict";
  const $ = function (s, r) { return (r || document).querySelector(s); };
  const $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  const pad2 = function (n) { return (n < 10 ? "0" : "") + n; };
  const now = function () { return performance.now() / 1000; };
  const TPB = SIM.TPB, DX = SIM.DX, CH = SIM.CH, N = LEVELS.length;
  const TOUCH = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const RM = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const FIX = typeof FIXES !== "undefined" ? FIXES : {};
  /* every player-visible string comes from js/i18n.js (README: Languages); levels.js keeps its English names as data */
  const I = window.I18N, t = I.t, tn = I.tn;
  const esc = function (v) { return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
  const lvName = function (n) { return t("level." + n + ".name"); };
  const hzName = function (h) { return t("hazard." + h.k + ".name"); };

  /* ---------------- saved state ---------------- */
  /* optional save-key override (README: Builds); without it, the real key */
  const REAL_KEY = "shadowskirr.v1";
  const KEY = (window.SHKR_DEV && window.SHKR_DEV.saveKey) || REAL_KEY, LEGACY_KEY = "lumbra.v1";
  /* inf: Infinite Shadow's best score, the distance (units) its best run ended at, runs, seconds played, and its own
     "Don't show again" for the objective box; homeCard: the home card shown last ("levels" or "inf") */
  const INF0 = { best: 0, bestDist: 0, runs: 0, totalTime: 0, objHide: false };
  const DEFAULTS = { music: 0.8, sfx: true, shake: true, objective: true, lang: null, sel: 1, unlocked: 1, rec: {}, homeCard: "levels", inf: INF0 };
  let S = loadState();
  function loadState() {
    let raw = {}, str = null;
    try { str = localStorage.getItem(KEY); } catch (e) { str = null; }
    /* one-time migration from the old save key; the new key wins if both exist. Only for the real key. */
    if (KEY === REAL_KEY) {
      let legacy = null;
      try { legacy = localStorage.getItem(LEGACY_KEY); } catch (e) { legacy = null; }
      if (legacy !== null) {
        if (str === null) { str = legacy; try { localStorage.setItem(KEY, legacy); } catch (e) {} }
        try { if (localStorage.getItem(KEY) !== null) localStorage.removeItem(LEGACY_KEY); } catch (e) {}
      }
    }
    try { raw = JSON.parse(str || "{}") || {}; } catch (e) { raw = {}; }
    return checkState(raw);
  }
  /* the validation every state goes through, whether loaded or set through the debug handle */
  function checkState(raw) {
    const o = {};
    for (const k in DEFAULTS) o[k] = raw[k] !== undefined && raw[k] !== null ? raw[k] : JSON.parse(JSON.stringify(DEFAULTS[k]));
    o.unlocked = Math.max(1, Math.min(N, o.unlocked | 0 || 1)); o.sel = Math.max(1, Math.min(N, o.sel | 0 || 1));
    if (typeof o.rec !== "object" || !o.rec) o.rec = {};
    o.objective = o.objective !== false;   /* saves from before the setting existed still show the objective box */
    o.sfx = o.sfx !== false;               /* ... and still get the death sound */
    if (!I.has(o.lang)) o.lang = null;     /* not chosen yet (or a code we don't have): the browser's language is used */
    if (o.homeCard !== "inf") o.homeCard = "levels";
    const fi = o.inf && typeof o.inf === "object" ? o.inf : {}, num = function (v) { v = Math.floor(+v); return isFinite(v) && v > 0 ? v : 0; };
    o.inf = { best: num(fi.best), bestDist: num(fi.bestDist), runs: num(fi.runs), totalTime: num(fi.totalTime), objHide: fi.objHide === true };
    return o;
  }
  function setS(obj) { S = checkState(obj || {}); return S; }
  function saveState() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function rec(n) { return S.rec[n] || (S.rec[n] = { t: 0, s: 0, d: false }); }
  function starsFor(t) { return t <= 1 ? 4 : t <= 3 ? 3 : t <= 7 ? 2 : 1; }   /* 4 = three rainbow stars */
  function starsHTML(v, cls) {
    let h = '<div class="stars' + (cls ? " " + cls : "") + '">';
    for (let i = 0; i < 3; i++) h += '<i class="star' + (v === 4 ? " rb" : i < v ? " on" : "") + '"></i>';
    return h + "</div>";
  }

  /* ---------------- levels ---------------- */
  const cache = {};
  function getL(n) { if (!cache[n]) { const d = LEVELS[n - 1]; d.fix = FIX[n] || []; cache[n] = SIM.compile(d); } return cache[n]; }
  const homeL = SIM.compile(HOME);
  const demoL = SIM.compile(Object.assign({}, HOME, { form: new Array(HOME.loops + 1).join(HOME.form + " ") }));
  const demoIn = []; (function () { const r = DEMO_SOL.rle; for (let i = 0; i < r.length; i += 2) for (let k = 0; k < r[i + 1]; k++) demoIn.push(r[i]); })();
  const DEMO_BEATS = homeL.bars * 4 * HOME.loops;
  let homeSong = null;

  /* ---------------- clock: audio time, smoothed against the frame clock ---------------- */
  const clock = {
    off: null, t0p: 0,
    start: function () { this.off = null; this.t0p = now() + 0.1; },
    beat: function (spb) {
      const c = MUSIC.ctx;
      if (c && c.state === "running" && MUSIC.song) {
        const lat = Math.min(0.3, c.outputLatency || c.baseLatency || 0), d = c.currentTime - lat - now();
        if (this.off === null || Math.abs(d - this.off) > 0.06) this.off = d; else this.off += (d - this.off) * 0.04;
        return (now() + this.off - MUSIC.t0) / spb;
      }
      return (now() - this.t0p) / spb;
    }
  };

  const G = { mode: "home", paused: false, n: 1, def: null, L: null, song: null, st: null, tryN: 1, session: 0, beat: 0, beat0: 0, spb: 0.5,
    deadAt: 0, wonAt: 0, squash: 0, restY: 0, snap: true, cardUp: false, pauseT: 0, tip: false, tipDone: false, mark: null, hist: null, rw: null };
  const keys = { j: false, s: false, qj: false, qs: false };

  /* ---------------- screens ---------------- */
  const SCREENS = ["home", "howto", "settings", "levels"], PANELS = ["howto", "settings", "levels"];
  function show(id) {
    SCREENS.forEach(function (s) { const el = document.getElementById(s); el.classList.toggle("on", s === id); el.classList.remove("enter"); });
    const el = document.getElementById(id);
    if (el) { void el.offsetWidth; el.classList.add("enter"); }
    if (id === "levels") paintLevels();
    if (id === "home") paintHome(true);
    if (id === "settings") paintSettings(); else closeLang(false);
    if (id === "howto") Demo.start(); else Demo.stop();
    refreshScrollCue();
  }
  function panelOn() { for (const id of PANELS) if (document.getElementById(id).classList.contains("on")) return id; return ""; }
  $$("[data-go]").forEach(function (b) { b.addEventListener("click", function () { show(b.dataset.go); }); });
  /* scroll cue (vl): a panel whose body has more below gets .more, which shows a fade and a bobbing ▾ (How to play) */
  function refreshScrollCue() {
    $$(".screen .col").forEach(function (col) {
      const body = col.querySelector(".panel-body");
      if (!body) return;
      col.classList.toggle("more", body.scrollHeight - body.scrollTop - body.clientHeight > 6);
    });
  }
  $$(".panel-body").forEach(function (el) { el.addEventListener("scroll", refreshScrollCue, { passive: true }); });

  /* ---------------- cards ---------------- */
  const overlay = $("#overlay"), cardEl = $("#card");
  let cardActs = [], cardStop = null, cardFade = 0;
  /* o: cls (extra card class), eyebrow, title, accent (a colour under the title), body, stars, stats, acts [{ t, solid, danger, rebirth, fn }],
     pv (adds a preview canvas above the eyebrow; the text is its label), open (called with the card element once
     it is in the page; it may return a function, which runs when the card goes away) */
  function showCard(o) {
    stopCard(); clearTimeout(cardFade);
    if (overlay.classList.contains("out")) clearCard();
    let html = "";
    if (o.pv) html += '<div class="pv"><canvas role="img" aria-label="' + o.pv + '"></canvas></div>';
    if (o.eyebrow) html += '<div class="eyebrow">' + o.eyebrow + "</div>";
    if (o.title) html += "<h2" + (o.accent ? ' class="accent" style="--hz:' + o.accent + '"' : "") + ">" + o.title + "</h2>";
    if (o.stars !== undefined) html += starsHTML(o.stars, "big");
    if (o.html) html += o.html;
    if (o.body) html += "<p>" + o.body + "</p>";
    if (o.stats) { html += '<div class="stat-row">'; o.stats.forEach(function (s) { html += "<div><b>" + s[0] + "</b><span>" + s[1] + "</span></div>"; }); html += "</div>"; }
    if (o.after) html += o.after;
    html += '<div class="acts">';
    (o.acts || []).forEach(function (a, i) { html += '<button class="chip' + (a.solid ? " solid" : "") + (a.danger ? " danger" : "") + (a.rebirth ? " rebirth" : "") + '" data-act="' + i + '">' + a.t + "</button>"; });
    html += "</div>";
    cardEl.innerHTML = html; cardEl.className = "card" + (o.cls ? " " + o.cls : ""); cardActs = o.acts || []; overlay.classList.add("on"); G.cardUp = true;
    cardEl.style.animation = "none"; void cardEl.offsetWidth; cardEl.style.animation = "";
    if (o.stars !== undefined) $$(".stars.big .star", cardEl).forEach(function (el, i) { setTimeout(function () { el.classList.add("pop"); }, 260 + i * 280); });
    if (o.open) cardStop = o.open(cardEl) || null;
  }
  /* fade === true: a short fade out, which takes a docked objective box with it */
  function hideCard(fade) {
    stopCard(); cardActs = []; G.cardUp = false; clearTimeout(cardFade);
    if (fade === true && overlay.classList.contains("on")) { overlay.classList.add("out"); cardFade = setTimeout(clearCard, 200); }
    else clearCard();
  }
  function stopCard() { if (cardStop) { const f = cardStop; cardStop = null; f(); } }
  function clearCard() { overlay.classList.remove("on", "out"); cardEl.innerHTML = ""; undockObjective(); }
  overlay.addEventListener("click", function (e) {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = cardActs[+b.dataset.act]; if (a && a.fn) a.fn();
  });

  /* ---------------- home ---------------- */
  /* one span per letter, in a no-wrap span per word. A word may also break after a hyphen, and Chinese or Japanese
     (no spaces) may break between any two characters */
  const HAN = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;
  function setLetters(el, text) {
    el.innerHTML = "";
    text.split(" ").forEach(function (word, wi, arr) {
      const cjk = HAN.test(word);
      let i = 0;
      word.replace(/-/g, "-\u0000").split("\u0000").forEach(function (part) {
        const w = document.createElement("span"); w.style.whiteSpace = cjk ? "normal" : "nowrap"; w.style.animation = "none";
        Array.from(part).forEach(function (ch) { const s = document.createElement("span"); s.textContent = ch; s.style.animationDelay = (wi * 0.12 + i++ * 0.03) + "s"; w.appendChild(s); });
        el.appendChild(w);
      });
      if (wi < arr.length - 1) el.appendChild(document.createTextNode(" "));
    });
    fitTitle(el);
  }
  /* a word longer than the title's 13ch (a long German compound) may use the whole column, and if it is longer than
     that too, the title shrinks until it fits. (13ch scales with the font, so shrinking alone would never help.)
     Chinese and Japanese parts can break anywhere, so only no-wrap words count. English titles never get here. */
  function fitTitle(el) {
    if (!el) { fitTitle($("#title")); fitTitle($("#infTitle")); return; }
    el.style.fontSize = ""; el.style.maxWidth = "";
    const col = el.parentElement.clientWidth; if (!el.clientWidth || !col) return;
    let max = 0;
    for (const c of el.children) if (c.style.whiteSpace === "nowrap") max = Math.max(max, c.getBoundingClientRect().width);
    if (max <= el.clientWidth + 0.5) return;
    el.style.maxWidth = "100%";
    if (max > col) el.style.fontSize = Math.floor(parseFloat(getComputedStyle(el).fontSize) * col / max * 0.97) + "px";
  }
  function paintHome(retitle) {
    /* the Infinite Shadow card */
    if (retitle) setLetters($("#infTitle"), t("inf.title"));
    $("#infBest").innerHTML = S.inf.best > 0 ? t("inf.best", { n: "<b>" + fmt(S.inf.best) + "</b>" }) : esc(t("inf.none"));
    /* the levels card */
    const n = S.sel, locked = n > S.unlocked, r = S.rec[n] || { t: 0, s: 0, d: false };
    $("#lvTag").textContent = t("game.level", { n: pad2(n) }) + (locked ? "  ·  " + t("home.locked") : "");
    if (retitle) setLetters($("#title"), lvName(n));
    $("#title").style.opacity = locked ? 0.28 : 1;
    $("#homeStars").innerHTML = locked ? "" : starsHTML(r.d ? r.s : 0).replace(/^<div class="stars">|<\/div>$/g, "");
    $("#homeStars").style.visibility = locked ? "hidden" : "visible";
    $("#startOrb").classList.toggle("locked", locked);
    $("#startLbl").textContent = locked ? t("home.locked") : r.d ? t("common.replay") + "  ·  " + tn("game.tries", r.t) : r.t ? t("home.play") + "  ·  " + t("game.try", { n: r.t + 1 }) : t("home.play");
    $("#rebirthBtn").classList.toggle("hide", !r.d);
    $("#prevBtn").disabled = n <= 1; $("#nextBtn").disabled = n >= N;
    let done = 0; for (let i = 1; i <= N; i++) if (S.rec[i] && S.rec[i].d) done++;
    $("#railFill").style.width = (done / N * 100) + "%";
    $("#progTag").textContent = t("home.progress", { n: pad2(n), total: N });
  }
  function browse(d) {
    const n = Math.max(1, Math.min(N, S.sel + d)); if (n === S.sel) return;
    S.sel = n; saveState(); paintHome(true);
    if (n <= S.unlocked && G.mode === "home" && homeCard === "levels") { const def = LEVELS[n - 1]; RENDER.setLevel(demoL, def.th, n * 101); G.snap = true; }
  }
  $("#prevBtn").addEventListener("click", function () { browse(-1); });
  $("#nextBtn").addEventListener("click", function () { browse(1); });

  /* ---------------- home cards ----------------
     Infinite Shadow's card above the levels' in a vertical snap scroller (CSS scroll-snap does the snapping; the wheel,
     a trackpad and touch scroll it natively). Whichever is active, a slice of the other peeks in at the edge under a
     chevron label; a click on it, the peek label, a mouse drag, or the up / down / PageUp / PageDown keys move between
     them. The inactive card is aria-hidden and out of the tab order, and the focus moves with the active one.
     S.homeCard remembers the last one (the levels, for a first-time player). */
  const cards = $("#homeCards"), cardInf = $("#cardInf"), cardLv = $("#cardLv"), peekUp = $("#peekUp"), peekDown = $("#peekDown");
  let homeCard = S.homeCard, demoT = 0, peekPx = 72;
  function cardTop(which) { return which === "inf" ? 0 : cards.scrollHeight - cards.clientHeight; }
  function setCard(which) {
    if (which !== "inf") which = "levels";
    const inf = which === "inf", was = homeCard;
    homeCard = which;
    cardInf.classList.toggle("on", inf); cardLv.classList.toggle("on", !inf); $("#home").classList.toggle("inf", inf);
    [[cardInf, inf], [cardLv, !inf]].forEach(function (p) {
      p[0].setAttribute("aria-hidden", p[1] ? "false" : "true");
      $$("button", p[0]).forEach(function (b) { if (p[1]) b.removeAttribute("tabindex"); else b.setAttribute("tabindex", "-1"); });
    });
    peekUp.classList.toggle("on", !inf); peekDown.classList.toggle("on", inf);
    const off = inf ? cardLv : cardInf;
    if (off.contains(document.activeElement)) (inf ? $("#infOrb") : $("#startOrb")).focus({ preventScroll: true });
    if (was !== which) { S.homeCard = which; saveState(); }
    /* the demo behind follows once the scroller has settled, so a quick flick through never swaps worlds midway */
    clearTimeout(demoT);
    demoT = setTimeout(function () { if (G.mode === "home") demoTo(homeCard === "inf" ? "inf" : "levels"); }, 220);
  }
  function goCard(which, instant) {
    if (!cards.clientHeight) { setCard(which); return; }
    try { cards.scrollTo({ top: cardTop(which), behavior: instant || RM ? "auto" : "smooth" }); } catch (e) { cards.scrollTop = cardTop(which); }
    setCard(which);
  }
  /* --peek: a slice of the other card, 16 % of the scroller's height (at least 40 px), never over the play orb */
  function sizeCards() {
    const h = cards.parentElement.clientHeight; if (!h) return;
    peekPx = Math.max(40, Math.round(h * 0.16));
    cards.parentElement.style.setProperty("--peek", peekPx + "px");
    cards.style.scrollBehavior = "auto"; cards.scrollTop = cardTop(homeCard); cards.style.scrollBehavior = "";
  }
  cards.addEventListener("scroll", function () {
    if (cards.classList.contains("drag")) return;
    const w = cards.scrollTop < (cards.scrollHeight - cards.clientHeight) / 2 ? "inf" : "levels";
    if (w !== homeCard) setCard(w);
  }, { passive: true });
  [cardInf, cardLv].forEach(function (el) {
    el.addEventListener("click", function (e) { const w = el === cardInf ? "inf" : "levels"; if (w !== homeCard) { e.preventDefault(); e.stopPropagation(); goCard(w); } }, true);
  });
  peekUp.addEventListener("click", function () { goCard("inf"); });
  peekDown.addEventListener("click", function () { goCard("levels"); });
  /* a mouse drag scrolls it too (touch and the wheel do natively); a flick or half the way picks the next card */
  let drag = null;
  cards.addEventListener("pointerdown", function (e) {
    if (e.pointerType !== "mouse" || e.button !== 0 || e.target.closest("button")) return;
    drag = { y: e.clientY, top: cards.scrollTop, t: performance.now(), moved: false };
  });
  window.addEventListener("pointermove", function (e) {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dy) < 6) return;
    if (!drag.moved) { drag.moved = true; cards.classList.add("drag"); }
    cards.scrollTop = drag.top - dy;
  });
  window.addEventListener("pointerup", function (e) {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.moved) return;
    cards.classList.toggle("drag", false);
    const dy = e.clientY - d.y, v = dy / Math.max(1, performance.now() - d.t), half = (cards.scrollHeight - cards.clientHeight) / 2;
    goCard(Math.abs(v) > 0.4 ? (dy > 0 ? "inf" : "levels") : cards.scrollTop < half ? "inf" : "levels");
  });
  function homeTheme() { const n = Math.min(S.sel, S.unlocked); return LEVELS[n - 1]; }
  function startHome() {
    G.mode = "home"; G.paused = false; stopTip(); G.hist = null; $("#hud").classList.remove("on", "inf", "beat"); hideObjective();
    G.inf = null; G.n = S.sel; G.def = null;
    G.spb = 60 / HOME.mu[0]; G.beat0 = 0;
    RENDER.setHome(true);
    demoTo(homeCard === "inf" && infDemoReady() ? "inf" : "levels", true);
    if (MUSIC.ctx) { homeSong = MUSIC.makeSong(HOME, homeL, true); MUSIC.start(homeSong); }
    clock.start();
  }
  /* The attract demo behind the menu: the home chart for the levels card, an Infinite Shadow run for the other. That run
     is generated from a seed while the home screen idles (a couple of milliseconds a frame, so switching cards never
     waits on it) and played by the solver's own validated paths, through its world fractures. It can start once 20 bars
     and its first world are ready (a few seconds), and goes on being made while it plays, far faster than the home tempo
     uses it up, to 96 bars; then it loops like the levels' demo. Both run on the home theme's clock: everything is in beats, so the run is the same at the
     home tempo, and the home music keeps playing across a card switch (two tempos crossfading on every flick between
     cards would jar). */
  const DEMO_INF_BARS = 96;
  let infDemo = null;
  const DEMO_INF_START = 20;
  function infDemoTick(ms) {
    if (!infDemo) infDemo = { g: INF.create(newSeed()), world: false, bars: 0 };
    const d = infDemo;
    if (d.g.bars < DEMO_INF_START) d.g.work(ms, DEMO_INF_START);
    else if (!d.world) { const b = d.g.biomeAt(0); d.world = RENDER.prepare(b.w); }
    else if (d.g.bars < DEMO_INF_BARS + 4) d.g.work(ms, DEMO_INF_BARS + 4);
    /* new bars reach the renderer (only while the demo is on screen; setLevel dresses the rest when it comes on) */
    if (d.g.bars !== d.bars) { d.bars = d.g.bars; if (demoKind === "inf") RENDER.extend(); }
    /* ready while its card is already up: on it comes */
    if (homeCard === "inf" && demoKind !== "inf" && G.mode === "home" && infDemoReady()) demoTo("inf");
  }
  function infDemoReady() { return !!(infDemo && infDemo.g.bars >= DEMO_INF_START && infDemo.world); }
  let demoKind = "levels";
  function demoTo(kind, force) {
    if (kind === demoKind && !force) return;
    if (kind === "inf" && !infDemoReady()) return;
    demoKind = kind;
    G.st = SIM.newState(); G.st.ev = []; G.squash = 0; G.restY = 0; G.snap = true;
    G.beat0 = G.mode === "home" && !force ? clock.beat(G.spb) : 0;
    if (kind === "inf") { G.L = infDemo.g.L; RENDER.setLevel(infDemo.g.L, null, infDemo.g.seed, infDemo.g.biomeAt); }
    else { const def = homeTheme(); G.L = demoL; RENDER.setLevel(demoL, def.th, def.n * 101); }
  }
  /* the wipe: a black disc grows from (cx, cy) over the screen; fn runs under it, then it fades */
  function wipe(cx, cy, fn) {
    const w = $("#wipe"), W = window.innerWidth, H = window.innerHeight;
    const far = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy));
    w.style.left = (cx - 5) + "px"; w.style.top = (cy - 5) + "px"; w.style.setProperty("--sc", Math.ceil(far / 5) + "");
    w.classList.remove("go", "fade"); void w.offsetWidth; w.classList.add("go");
    setTimeout(function () {
      fn();
      w.classList.add("fade"); setTimeout(function () { w.classList.remove("go", "fade"); }, 340);
    }, 500);
  }
  function orbCentre(el) { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
  function launch() {
    if (G.mode !== "home") return;
    if (homeCard === "inf") { launchInf($("#infOrb")); return; }
    if (S.sel > S.unlocked) return;
    audioGesture();
    const c = orbCentre($("#startOrb"));
    G.mode = "launch"; MUSIC.stop(0.4);
    wipe(c[0], c[1], function () { show(""); startLevel(S.sel); });
  }
  $("#startOrb").addEventListener("click", launch);
  $("#infOrb").addEventListener("click", function () { if (homeCard === "inf") launch(); });
  $("#rebirthBtn").addEventListener("click", function () {
    const n = S.sel;
    showCard({ eyebrow: t("game.level", { n: pad2(n) }), title: t("card.rebirth.title"), body: t("card.rebirth.body", { name: esc(lvName(n)) }),
      acts: [{ t: t("card.rebirth.btn"), rebirth: true, fn: function () { S.rec[n] = { t: 0, s: 0, d: false }; saveState(); hideCard(); paintHome(false); } }, { t: t("common.cancel"), fn: hideCard }] });
  });

  /* ---------------- levels panel + settings ---------------- */
  function paintLevels() {
    let html = "";
    for (let i = 1; i <= N; i++) {
      const r = S.rec[i], st = i > S.unlocked ? "locked" : i === S.sel ? "next" : r && r.d ? "done" : "";
      html += '<button class="cell ' + st + '"' + (st === "locked" ? " disabled" : "") + ' data-lv="' + i + '">' + pad2(i) + (i <= S.unlocked ? starsHTML(r && r.d ? r.s : 0) : "") + "</button>";
    }
    $("#lvGrid").innerHTML = html;
  }
  $("#lvGrid").addEventListener("click", function (e) {
    const b = e.target.closest("[data-lv]"); if (!b || b.disabled) return;
    const d = +b.dataset.lv - S.sel; show("home"); if (d) browse(d);
  });
  const vol = $("#volRange");
  vol.value = Math.round(S.music * 100); $("#volOut").textContent = vol.value;
  vol.addEventListener("input", function () { S.music = vol.value / 100; $("#volOut").textContent = vol.value; MUSIC.setVol(S.music); saveState(); });
  const fsw = $("#sfxSw"), sw = $("#shakeSw"), osw = $("#objSw");
  /* switch states follow S, which can change while playing ("Don't show again"), so they are synced whenever Settings opens */
  function paintSettings() {
    fsw.setAttribute("aria-pressed", S.sfx ? "true" : "false"); sw.setAttribute("aria-pressed", S.shake ? "true" : "false");
    osw.setAttribute("aria-pressed", S.objective ? "true" : "false");
  }
  paintSettings();
  fsw.addEventListener("click", function () { S.sfx = !S.sfx; paintSettings(); saveState(); });
  sw.addEventListener("click", function () { S.shake = !S.shake; paintSettings(); saveState(); });
  osw.addEventListener("click", function () { S.objective = !S.objective; if (S.objective) S.inf.objHide = false; paintSettings(); saveState(); });
  $("#resetBtn").addEventListener("click", function () {
    /* only progress: the settings, the language among them, stay */
    showCard({ eyebrow: t("home.settings"), title: t("card.reset.title"), body: t("card.reset.body"),
      acts: [{ t: t("settings.reset.btn"), danger: true, fn: function () {
        S.rec = {}; S.unlocked = 1; S.sel = 1; S.inf = { best: 0, bestDist: 0, runs: 0, totalTime: 0, objHide: S.inf.objHide };
        saveState(); hideCard(); show("home"); startHome();
      } }, { t: t("common.cancel"), fn: hideCard }] });
  });

  /* ---------------- language ----------------
     S.lang is the player's choice (null until they make one: then the browser's language, else English). Settings has
     it as its first row: a chip with the current flag and name that opens the list of all of them; the home screen has
     the round flag under the settings chip, which opens Settings with the list open. Choosing applies at once. */
  const AUTO_LANG = I.detect(navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""]);
  const langBtn = $("#langBtn"), langList = $("#langList"), homeFlag = $("#homeFlag");
  langList.innerHTML = I.LANGS.map(function (l) {
    return '<button class="chip lang-opt" data-lang="' + l.code + '" lang="' + l.html + '" aria-pressed="false"><span class="flag-i" aria-hidden="true">' + I.flagSVG(l.code) + "</span><span>" + esc(l.name) + "</span></button>";
  }).join("");
  const langOpts = $$(".lang-opt", langList);
  function langOpen() { return !langList.classList.contains("hide"); }
  function openLang(focus) {
    langList.classList.remove("hide"); langBtn.setAttribute("aria-expanded", "true");
    if (focus) (langList.querySelector('[aria-pressed="true"]') || langOpts[0]).focus();
    refreshScrollCue();
  }
  function closeLang(focus) {
    if (!langOpen()) return;
    langList.classList.add("hide"); langBtn.setAttribute("aria-expanded", "false");
    if (focus) langBtn.focus();
    refreshScrollCue();
  }
  /* a keyboard press on the chip (a click with detail 0) also moves the focus into the list */
  langBtn.addEventListener("click", function (e) { if (langOpen()) closeLang(false); else openLang(e.detail === 0); });
  langList.addEventListener("click", function (e) {
    const b = e.target.closest("[data-lang]"); if (!b) return;
    S.lang = b.dataset.lang; saveState(); applyLang(); closeLang(true);
  });
  /* arrows move between the languages (wrapping), Home / End jump to the ends; Enter or Space picks (native button) */
  langList.addEventListener("keydown", function (e) {
    const i = langOpts.indexOf(document.activeElement); if (i < 0) return;
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    let j = -1;
    if (d) j = (i + d + langOpts.length) % langOpts.length; else if (e.key === "Home") j = 0; else if (e.key === "End") j = langOpts.length - 1;
    if (j >= 0) { e.preventDefault(); langOpts[j].focus(); }
  });
  homeFlag.addEventListener("click", function () {
    show("settings"); $("#settings .panel-body").scrollTop = 0; openLang(true);
  });
  /* the flags and the current language's name, wherever they show */
  function paintLang() {
    const L = I.info(), label = t("home.flag", { name: L.name });
    homeFlag.innerHTML = I.flagSVG(L.code); homeFlag.setAttribute("aria-label", label);
    $("#langBtnFlag").innerHTML = I.flagSVG(L.code);
    const nm = $("#langBtnName"); nm.textContent = L.name; nm.setAttribute("lang", L.html);
    langBtn.setAttribute("aria-label", label);
    langOpts.forEach(function (b) {
      const on = b.dataset.lang === L.code;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
    });
  }
  /* switch every string on the page to S.lang (or the browser's language): the marked-up text and labels in
     index.html, then everything the game writes itself */
  function applyLang() {
    I.setLang(S.lang || AUTO_LANG);
    const L = I.info();
    document.documentElement.lang = L.html;
    $$("[data-i18n]").forEach(function (el) { el.textContent = t(el.dataset.i18n); });
    $$("[data-i18n-aria]").forEach(function (el) { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
    $("#obJump").textContent = t(TOUCH ? "ob.jumpTouch" : "ob.jumpKeys");
    $("#obRoll").textContent = t(TOUCH ? "ob.rollTouch" : "ob.rollKeys");
    KEY_FONT = getComputedStyle(document.documentElement).getPropertyValue("--mono").trim() || "monospace";
    RENDER.setFont(KEY_FONT);
    KEY_CJK = /^(zh|ja|ko)/.test(L.html);
    paintLang();
    Demo.relabel();
    paintHome(true);
    if ((G.def || G.inf) && $("#hud").classList.contains("on")) paintHud();
    if (G.tip === "note") { $("#tipTitle").textContent = t(TIP.title); $("#tipBody").textContent = t(TIP.body); }
    refreshScrollCue();
  }

  /* ---------------- objective box ----------------
     The goal and the controls, at the start of a level (S.objective). On its own it sits near the top and goes
     away by itself, later while the mouse is over it or the keyboard is on its checkbox. On a level that brings
     in a new hazard it docks in the overlay right above the hazard card and leaves with it. */
  const ob = $("#msBanner"), obChk = $("#obHide");
  let obT = 0, obMouse = false;
  function kbFocus(el) { try { return el.matches(":focus-visible"); } catch (e) { return document.activeElement === el; } }
  function showObjective(dock) {
    hideObjective();
    if (!S.objective || G.inf && S.inf.objHide) return;
    $("#obTitle").textContent = t(G.inf ? "inf.obj" : "ob.title");
    obChk.checked = false;
    if (dock) { overlay.classList.add("stack"); overlay.insertBefore(ob, cardEl); ob.classList.add("dock"); }
    void ob.offsetWidth; ob.classList.add("show");
    if (!dock) obT = setTimeout(fadeObjective, 6000);
  }
  function fadeObjective() { if (obMouse || kbFocus(obChk)) obT = setTimeout(fadeObjective, 400); else hideObjective(); }
  function hideObjective() {
    clearTimeout(obT);
    if (ob.contains(document.activeElement)) document.activeElement.blur();
    ob.classList.remove("show"); undockObjective();
  }
  /* back to its own place, at once (no fade from the docked spot to the top of the screen) */
  function undockObjective() {
    if (!ob.classList.contains("dock")) return;
    ob.style.transition = "none"; ob.classList.remove("dock", "show"); overlay.classList.remove("stack");
    document.body.insertBefore(ob, overlay); void ob.offsetWidth; ob.style.transition = "";
  }
  /* taps and clicks on the box are never jump or roll input */
  ob.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
  ob.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") obMouse = true; });
  ob.addEventListener("pointerleave", function () { obMouse = false; });
  obChk.addEventListener("change", function () {
    /* Infinite Shadow's box has its own "Don't show again", so hiding one never hides the other */
    if (G.inf) S.inf.objHide = obChk.checked; else S.objective = !obChk.checked;
    saveState(); paintSettings();
    if (!kbFocus(obChk)) obChk.blur();   /* after a click the keys go back to the game */
  });

  /* ---------------- new hazard cards ----------------
     Before the first run of the level that brings in a hazard (HAZ[].lv) the game waits, frozen, behind a card
     that names the hazard, says what to do and shows it in a looping preview. The preview is a tiny chart
     (terrain/overlay, 8 cells a bar, README: How it works) played by the real simulation with a scripted input
     and drawn by a second renderer (RENDER.create) in the level's own theme, so it looks exactly like the game.
     in: inputs, used in turn on each loop, as [from beat, to beat, 1 jump | 2 roll]; to: the beat where the loop
     starts over; still: the beat shown, as one frame, with prefers-reduced-motion. The card's text is
     hazard.<k>.body in js/i18n.js. */
  const INTRO = {
    bl: { c: "...H............/..B.............", in: [[]], to: 3.6, still: 1.6 },
    ha: { c: "...~~~........../....O...........", in: [[[1.25, 1.4, 1], [2.05, 2.2, 1]]], to: 4, still: 1.6 },
    D: { c: "....._........../.D..........d...", in: [[[2.4, 2.55, 1]]], to: 4.6, still: 3 },
    F: { c: "..~~~~~........./...F.F..........", in: [[[0.75, 0.9, 1], [1.8, 1.95, 1], [2.85, 3, 1]]], to: 4.6, still: 2 },
    ke: { c: "................/...K..G.........", in: [[]], to: 4, still: 1.5 },
    A: { c: "..^^^^........../.A........a.....", in: [[[1, 1.1, 1], [1.5, 1.6, 1], [2, 2.1, 1], [2.5, 2.6, 1]]], to: 4, still: 1.75 },
    L: { c: "...~~~~~......../...L.....l......", in: [[[1.2, 4.1, 1]]], to: 5.2, still: 2.8 },
    ri: { c: "....H.........../....R...........", in: [[[1.9, 1.95, 2]]], to: 4.2, still: 2.3 },
    co: { c: "...~~~........../...C............", in: [[[1.25, 1.4, 1]]], to: 4.4, still: 2.3 },
    T: { c: "................/.T.m...n...t....", in: [[[3, 4.2, 2]]], to: 5.4, still: 2 },
    ey: { c: "................/...E...e........", in: [[[3.5, 3.65, 1]], [[1.5, 1.65, 1]]], to: 5, still: 3.9 },
    X: { c: "..Y............./...XXXX.........", in: [[[2, 2.15, 1], [2.5, 2.95, 2]]], to: 4.6, still: 2.65 },
    S: { c: "....H.........../..SS............", in: [[[0.9, 1.9, 2]]], to: 4, still: 1.75 },
    1: { c: "...~~~~~~~....../....2.1.2.......", in: [[[1.3, 1.45, 1], [2.35, 2.5, 1], [3.35, 3.5, 1], [4.4, 4.55, 1]]], to: 5.8, still: 1.8 },
    Z: { c: ".....^........../..Z.....z.......", in: [[[2.65, 2.8, 1]]], to: 5.5, still: 2.9 }
  };
  const PV_FROM = -0.6, PV_BPM = 132;   /* the loop starts a little before beat 0; previews play at the level's tempo, at most PV_BPM */
  let pvR = null;
  function newHazard(n) { for (const h of HAZ) if (h.lv === n) return h; return null; }
  function hazardCard(h) {
    showCard({ cls: "wide", pv: esc(t("card.hazard.pv", { name: hzName(h) })), eyebrow: t("card.hazard.eyebrow"), title: hzName(h), accent: h.col, body: t("hazard." + h.k + ".body"),
      acts: [{ t: t("common.understood"), solid: true, fn: startRun }],
      open: function (el) { return preview($("canvas", el), INTRO[h.k], G.def); } });
    showObjective(true);
  }
  /* the looping preview; returns the function that stops it. Its own sim state, clock and renderer: nothing here
     touches the frozen game. opt (How to play only; a hazard card passes none): R, a renderer of its own instead of
     the card's; keys, draw JUMP / ROLL over the canvas while the scripted input is held. */
  function preview(cvs, D, def, opt) {
    opt = opt || {};
    const R = opt.R || pvR || (pvR = RENDER.create({ w: 220, h: 140, dpr: 2, sc: 14, px: .3, gy: .84, top: 4 }));
    const L = D.L || (D.L = SIM.compile({ n: 0, phr: { a: D.c }, form: "a", fix: [] }));
    const spb = 60 / Math.min(PV_BPM, def.mu[0]), o = { squash: 0 };
    let st = null, inp = null, loops = 0, t0 = 0, last = 0, restY = 0, snap = true, raf = 0;
    R.resize(cvs);
    function reset(t) { st = SIM.newState(); st.ev = []; inp = D.in[loops++ % D.in.length]; R.setLevel(L, def.th, def.n * 101); t0 = t; o.squash = 0; restY = 0; snap = true; }
    function draw(beat, t, dt) {
      const target = Math.floor(beat * TPB);
      while (st.tick < target && !st.dead && !st.won) {
        const b = st.tick / TPB; let v = 0;
        for (const q of inp) if (b >= q[0] && b < q[1]) v |= q[2];
        SIM.step(L, st, v & 1, v & 2, 0); onEvents(st, st.tick * DX, R, o);
      }
      if (st.gr) restY = st.flip && st.zz ? st.zz.base : st.y; else if (st.flip && st.zz) restY = st.zz.base;
      o.squash = Math.max(0, o.squash - dt * 5);
      const x = Math.max(beat * 4, -40), fr = Math.max(0, Math.min(1.5, beat * TPB - st.tick));
      const y = st.gr || st.hang >= 0 || st.won ? st.y : st.y + st.vy * SIM.DT * fr;
      let thermal = false; for (const z of L.zones) if (z.k === "T" && x >= z.x0 && x < z.x1) thermal = true;
      const bf = beat - Math.floor(beat), pulse = beat < 0 ? 0 : Math.pow(Math.max(0, 1 - bf * 2.3), 2);
      R.frame({ s: st, x: x, y: y, beat: beat, time: t, pulse: pulse, dead: false, squash: o.squash, restY: restY, snap: snap, thermal: thermal,
        demo: true, noShake: true }, dt);
      snap = false;
      if (opt.keys) keyLabel(cvs, inp, beat, spb);
    }
    if (RM) { reset(0); draw(D.still, 0, 0); return null; }
    function tick(ts) {
      raf = requestAnimationFrame(tick);
      const t = ts / 1000, dt = last ? Math.min(0.05, Math.max(0.001, t - last)) : 0; last = t;
      let beat = PV_FROM + (t - t0) / spb;
      if (!st || beat >= D.to) { reset(t); beat = PV_FROM; }
      draw(beat, t, dt);
    }
    raf = requestAnimationFrame(tick);
    return function () { cancelAnimationFrame(raf); };
  }

  /* ---------------- how to play ----------------
     hiyroscript/vl's How to play screen: a carousel of pages, each with a live loop on #demoCv, a name and a line or
     two of text. Every loop is a preview() like a new hazard card's: a tiny chart (same format as INTRO) played by the
     real simulation with a scripted input, drawn by its own renderer in a level's theme. The basics and the plain
     obstacles have their charts here; each hazard page reuses its INTRO entry (text and chart), so the screen and the
     hazard cards always say the same thing. While a scripted input is held, JUMP or ROLL shows at the bottom of the
     canvas. If you change how something works, check its page still plays out like INTRO (README: Development notes). */
  const BASICS = "basics", OBSTACLE = "obstacle";   /* howto.kind.<kind>; a page's name and text are howto.<id>.name / .body */
  const HOWTO = [
    { kind: BASICS, id: "jump",
      c: "....^.........../................", in: [[[2, 2.15, 1]]], to: 4, still: 2.5 },
    { kind: BASICS, id: "roll",
      c: "....-.........../................", in: [[[1.85, 2.95, 2]]], to: 4, still: 2.4 },
    { kind: BASICS, id: "dive",
      c: "....^.-........./................", in: [[[2, 2.15, 1], [2.6, 3.7, 2]]], to: 4.6, still: 2.75 },
    { kind: OBSTACLE, id: "spikes",
      c: "..^...M...I...../................", in: [[[1, 1.15, 1], [3, 3.15, 1], [5, 5.15, 1]]], to: 6.6, still: 3.5 },
    { kind: OBSTACLE, id: "pits",
      c: "...._...U......./................", in: [[[2, 2.15, 1], [4.3, 4.45, 1]]], to: 6.4, still: 4.9 },
    { kind: OBSTACLE, id: "bars",
      c: "...-....-......./................", in: [[[1.4, 2.35, 2], [3.9, 4.85, 2]]], to: 6, still: 2 },
    { kind: OBSTACLE, id: "walls",
      c: "...'..'..'....../................", in: [[]], to: 6, still: 2 },
    { kind: OBSTACLE, id: "steps",
      c: "...+...#..v.V.../................", in: [[[1.5, 1.65, 1], [3.4, 3.55, 1]]], to: 7, still: 3.8 },
    { kind: OBSTACLE, id: "floating", ob: "*",
      c: "...*.....*....../................", in: [[[1.6, 2.3, 2], [4.5, 4.65, 1]]], to: 6.6, still: 5 },
    { kind: OBSTACLE, id: "spiked", ob: "%",
      c: "...%...v.%..v.../................", in: [[[1.55, 1.7, 1], [4.55, 4.7, 1]]], to: 7, still: 2.1 },
    { kind: OBSTACLE, id: "tunnels", ob: "=",
      c: "...=====......../................", in: [[[1.5, 4.4, 2]]], to: 5.8, still: 3 },
    { kind: OBSTACLE, id: "hurdles", ob: "&",
      c: "....&.........../................", in: [[[1.95, 2.1, 1], [2.92, 3.7, 2]]], to: 4.8, still: 3.2 },
    { kind: OBSTACLE, id: "crushers", ob: "|",
      c: "....|..|......../................", in: [[[2, 2.15, 1]]], to: 5.6, still: 2.5 },
    { kind: OBSTACLE, id: "blades", ob: "@",
      c: "....@....@....../................", in: [[[2, 2.15, 1], [4.5, 4.65, 1]]], to: 6.4, still: 2.4 }
  ];
  /* the newer obstacles say which level brings them in (OBST); every page plays in a level's colours: the basics and
     the first obstacles in level 1's, a newer obstacle or a hazard in its own level's */
  HOWTO.forEach(function (p) { if (p.ob) for (const o of OBST) if (o.ch === p.ob) p.lv = o.lv; p.def = LEVELS[(p.lv || 1) - 1]; });
  HAZ.forEach(function (h) { HOWTO.push({ kind: "hazard", D: INTRO[h.k], h: h, lv: h.lv, def: LEVELS[h.lv - 1] }); });
  function pageName(p) { return p.h ? hzName(p.h) : t("howto." + p.id + ".name"); }
  function pageBody(p) { return p.h ? t("hazard." + p.h.k + ".body") : t("howto." + p.id + ".body"); }
  /* JUMP / ROLL over the bottom centre of a How to play canvas (on the dark ground band). A tap stays up for at least
     KEY_HOLD s so it can be read, but goes out KEY_GAP s before the next press, so every press shows on its own. */
  const KEY_HOLD = 0.3, KEY_GAP = 0.09, KEY_FADE = 0.08;
  let KEY_FONT = "monospace", KEY_CJK = false;   /* set by applyLang: --mono for the language (CJK fallbacks), no tracking for CJK */
  function keyLabel(cvs, inp, beat, spb) {
    let v = 0, a = 0;
    for (const q of inp) {
      let end = q[0] + KEY_HOLD / spb;
      for (const r of inp) if (r[0] > q[0]) end = Math.min(end, r[0] - KEY_GAP / spb);
      end = Math.max(end, q[1]);
      if (beat >= q[0] && beat < end) { v |= q[2]; a = Math.max(a, Math.min(1, (end - beat) * spb / KEY_FADE)); }
    }
    if (!v || !cvs.clientWidth) return;
    let text = (v & 1 ? t("common.jump") : "") + (v === 3 ? " + " : "") + (v & 2 ? t("common.roll") : "");
    try { text = text.toLocaleUpperCase(I.info().html); } catch (e) { text = text.toUpperCase(); }
    const g = cvs.getContext("2d"), k = cvs.width / cvs.clientWidth, ls = KEY_CJK ? 0 : 11 * .18 * k;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = a;
    g.font = "700 " + (11 * k).toFixed(2) + "px " + KEY_FONT; g.textAlign = "center"; g.textBaseline = "middle";
    const spaced = "letterSpacing" in g;
    if (spaced) g.letterSpacing = ls.toFixed(2) + "px";
    const w = g.measureText(text).width + 18 * k, h = 21 * k, x = cvs.width / 2, y = cvs.height - 9 * k - h / 2;
    /* a dark pill, invisible on the black ground and enough to read the label over a pit, where the pale sky shows */
    g.fillStyle = "rgba(10,10,16,.5)"; g.beginPath();
    if (g.roundRect) g.roundRect(x - w / 2, y - h / 2, w, h, h / 2); else g.rect(x - w / 2, y - h / 2, w, h);
    g.fill();
    g.fillStyle = "rgba(237,239,242,.75)"; g.fillText(text, x + (spaced ? ls / 2 : 0), y);   /* spacing trails the last letter */
    g.restore();
  }
  const Demo = (function () {
    const cv = $("#demoCv"), prevB = $("#demoPrev"), nextB = $("#demoNext"), dots = $("#demoDots");
    /* the hazard cards' preview geometry, at a sharper resolution chosen for the canvas's size on screen */
    const fit = { w: 220, h: 140, dpr: 2, sc: 14, px: .3, gy: .84, top: 4 };
    let R = null, i = 0, halt = null, on = false;
    dots.innerHTML = HOWTO.map(function () { return "<i></i>"; }).join("");
    /* the legend and the summary under the carousel, in the current language (applyLang calls this again) */
    function paintStatic() {
      $("#legend").innerHTML = HAZ.map(function (h) { return '<div><s style="background:' + h.col + '"></s><span>' + esc(hzName(h)) + "</span></div>"; }).join("");
      $("#howtoFoot").textContent = t("howto.foot");
    }
    function paint() {
      const p = HOWTO[i];
      $("#demoKind").textContent = t("howto.kind." + p.kind); $("#demoName").textContent = pageName(p); $("#demoDesc").textContent = pageBody(p);
      $("#demoMeta").innerHTML = p.lv ? (p.h ? '<s style="background:' + p.h.col + '"></s>' : "") + '<span class="tag">' + esc(t("howto.from", { n: pad2(p.lv) })) + "</span>" : "";
      cv.setAttribute("aria-label", t("howto.inGame", { name: pageName(p) }));
      if (i === 0 && document.activeElement === prevB) nextB.focus();
      prevB.style.display = i === 0 ? "none" : "";
      nextB.textContent = i === HOWTO.length - 1 ? t("howto.startOver") : t("howto.next");
      $$("i", dots).forEach(function (d, k) { d.classList.toggle("on", k === i); });
    }
    /* one loop at a time: the page's loop starts over on every start and every page change */
    function halt0() { if (halt) { const f = halt; halt = null; f(); } }
    function play() {
      halt0();
      if (!R) R = RENDER.create(fit);
      fit.dpr = Math.max(2, Math.min(4, Math.ceil((cv.clientWidth || fit.w) * (window.devicePixelRatio || 1) / fit.w)));
      const p = HOWTO[i];
      halt = preview(cv, p.D || p, p.def, { R: R, keys: true });
    }
    function go(n) { i = (n + HOWTO.length) % HOWTO.length; paint(); if (on) play(); refreshScrollCue(); }
    /* back stops at the first page (it is hidden there); next on the last page is "start over" */
    function prev() { if (i > 0) go(i - 1); }
    function next() { go(i + 1); }
    prevB.addEventListener("click", prev);
    nextB.addEventListener("click", next);
    /* taps on the demo are never game input (the game canvas sits under the panel anyway) */
    cv.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
    paintStatic(); paint();
    return {
      start: function () { on = true; paint(); play(); },
      stop: function () { on = false; halt0(); },
      prev: prev, next: next,
      relabel: function () { paintStatic(); paint(); }
    };
  })();

  /* ---------------- Infinite Shadow ----------------
     An endless run at INF.BPM through The Convergence, generated as it goes (js/infinite.js) from a fresh 32-bit seed.
     The generator works a few milliseconds a frame and keeps at least 12 bars validated ahead of the runner (16 are made
     under the wipe and the count-in bar before the run starts); new chunks reach the music (MUSIC.extend) and the
     renderer (RENDER.extend), and what is two screens behind is trimmed (SIM.trim), so memory stays flat. The score is
     a pure function of the seed and the inputs: a point a half-beat cell passed, 25 for every hazard used (an event of
     the simulation: USE), 50 more for a combo piece cleared from start to end. One crash ends the run: a results card,
     the best saved. No hazard cards, no spike tip, no stars, no tries. */
  const INF_DEF = { n: "inf", name: "Infinite Shadow", mu: [INF.BPM], th: null };
  /* simulation events that use a hazard, and the hazard (HAZ[].k) each belongs to */
  const USE = { bounce: "bl", air: "ha", fade: "F", gate: "ke", grab: "L", rift: "ri", comet: "co", dodge: "ey", "break": "X", coil: "S", flick: "1",
    exitZ: "Z", exitD: "D", exitA: "A", exitT: "T" };
  const AHEAD = 12, FILL = 20, KEEP = 64, GEN_MS = 3;
  function newSeed() {
    try { const a = new Uint32Array(1); (window.crypto || window.msCrypto).getRandomValues(a); return a[0] >>> 0; } catch (e) { return Math.floor(Math.random() * 4294967296) >>> 0; }
  }
  let nfmt = null, nfmtLang = "";
  function fmt(n) {
    const lang = I.info().html;
    if (lang !== nfmtLang) { nfmtLang = lang; try { nfmt = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }); } catch (e) { nfmt = null; } }
    return nfmt ? nfmt.format(n) : String(n);
  }
  function clockText(sec) { const v = Math.max(0, Math.floor(sec)); return Math.floor(v / 60) + ":" + pad2(v % 60); }
  /* from the home card (or "run again"): under the wipe, the generator makes its first bars */
  function launchInf(from, seed) {
    if (G.mode === "launch") return;
    audioGesture();
    const c = from ? orbCentre(from) : [window.innerWidth / 2, window.innerHeight / 2];
    G.mode = "launch"; MUSIC.stop(0.4); hideCard();
    G.pending = INF.create(seed === undefined ? newSeed() : seed >>> 0);
    wipe(c[0], c[1], function () { show(""); startInf(G.pending); G.pending = null; });
  }
  function startInf(g) {
    g.fill(16);
    G.n = "inf"; G.def = INF_DEF; G.L = g.L; G.spb = 60 / INF.BPM; G.session = 0; G.tryN = 1;
    G.inf = { g: g, seed: g.seed, score: 0, cells: 0, uses: 0, used: {}, combos: 0, cc: 0, bars: g.bars, cost: 20, acc: 0, ts: 0, best0: S.inf.best, beat: false, lastPop: null, ended: false };
    G.lastSeed = g.seed;   /* the developer section shows it */
    G.song = MUSIC.ctx ? MUSIC.makeStream(INF_DEF, g) : null;
    RENDER.setHome(false); RENDER.setLevel(g.L, null, g.seed, g.biomeAt);
    $("#hud").classList.add("on", "inf"); $("#hud").classList.remove("beat");
    G.st = SIM.newState(); G.st.ev = []; G.paused = false; stopTip(); G.squash = 0; G.restY = 0; G.snap = true; G.beat0 = 0;
    G.hist = null; G.tipDone = true; keys.qj = keys.qs = false;
    paintHud(); hudFill.style.transform = "scaleX(0)";
    /* a one-bar count-in: the clock starts four beats before the first */
    G.mode = "play";
    if (G.song) MUSIC.start(G.song, -4);
    clock.start(); clock.t0p += 4 * G.spb;
    showObjective(false);
  }
  /* every frame of a run, after it is drawn: generate (16 bars are made before the start, and it stays 12 to 20 ahead),
     stream the new bars to the music and the renderer, trim what is two screens behind */
  function feedInf(x, spent, ts0) {
    const I0 = G.inf, g = I0.g, ahead = g.bars * 16 - x;
    if (ahead < 3 * 16) g.emergency();   /* never in practice (the buffer is 12 bars), but a stall must not run the runner off the world */
    /* a steady share each frame rather than bursts: the measured cost of a bar times the bars the runner eats per
       frame, with headroom; more while the buffer is short, nothing once it is full */
    const dt = Math.min(0.1, Math.max(0.004, (ts0 - (I0.ts || ts0)) / 1000)); I0.ts = ts0;
    const need = I0.cost * dt * INF.BPM / 240 * 1.6;
    /* under 12 bars it always takes its 3 ms however long the frame was, and under 6 bars 8 ms: a dropped frame on a
       busy device is better than the runner reaching the safe generator's emergency chunks */
    const budget = ahead < 6 * 16 ? 8 : ahead < AHEAD * 16 ? Math.max(need * 2, GEN_MS) : ahead < FILL * 16 ? Math.max(need, 0.3) : 0;
    if (budget) { const t = performance.now(); g.work(budget); I0.acc += performance.now() - t; }
    if (g.bars !== I0.bars) {
      /* cost per bar, smoothed over a few chunks */
      if (g.bars > I0.bars) I0.cost += (I0.acc / (g.bars - I0.bars) - I0.cost) * 0.25;
      I0.acc = 0;
      I0.bars = g.bars;
      if (G.song) MUSIC.extend(G.song);
      RENDER.extend();
    }
    if (x - (I0.trimX || 0) > 32) {
      I0.trimX = x;
      if (SIM.trim(g.L, x, G.st, KEEP)) RENDER.extend();
      g.prune(Math.floor((x - KEEP) / 16) - 8);
    }
  }
  /* a hazard used: 25 points and a little number in its colour */
  function award(k) {
    const I0 = G.inf; if (!I0 || I0.ended) return;
    I0.score += 25; I0.uses++; I0.used[k] = (I0.used[k] || 0) + 1;
    const st = G.st;
    if (!RM) { RENDER.pop(st.tick * DX + 0.6, st.y + 2.6, "+25", RENDER.COL[k] || "#0A0A10", st.flip, st.flip && st.zz ? st.zz.base : 0); I0.lastPop = { t: now(), k: k }; }
  }
  /* points: the cells passed, and a combo piece cleared once the runner is past its last hazard */
  function scoreInf(x) {
    const I0 = G.inf, C = I0.g.chunks;
    const cells = Math.max(0, Math.floor(x / 2));
    if (cells > I0.cells) { I0.score += cells - I0.cells; I0.cells = cells; }
    while (I0.cc < C.length && C[I0.cc].x0 <= x) {
      const c = C[I0.cc];
      if (!c.combo || c.cx1 === undefined || c.paid) { I0.cc++; continue; }
      if (x < c.cx1 + 0.5) break;
      c.paid = true; I0.cc++; I0.combos++; I0.score += 50;
      if (!RM) {
        const st = G.st, col = RENDER.COL[c.haz[0]] || "#0A0A10", recent = I0.lastPop && now() - I0.lastPop.t < G.spb;
        RENDER.pop(st.tick * DX + 0.6, st.y + 3.3, recent ? t("inf.pop.combo", { n: 75 }) : t("inf.pop.combo", { n: 50 }), col, st.flip, st.flip && st.zz ? st.zz.base : 0);
      }
    }
  }
  function paintInfHud() {
    const I0 = G.inf; if (!I0) return;
    const sc = I0.score, best = Math.max(S.inf.best, 0);
    if (sc !== I0.shown) { I0.shown = sc; $("#hudScore").textContent = fmt(sc); }
    const beat = best > 0 && sc > best;
    if (beat !== I0.beat) { I0.beat = beat; $("#hud").classList.toggle("beat", beat); }
    hudFill.style.transform = "scaleX(" + (best > 0 ? Math.min(1, sc / best) : Math.min(1, sc / 1000)).toFixed(4) + ")";
  }
  /* a run given up from the pause card (restart, quit): it counts as a run and as time played, never as a best */
  function leaveInf() {
    const I0 = G.inf; if (!I0 || I0.ended) return;
    I0.ended = true;
    if (G.st.tick > 0) { S.inf.runs++; S.inf.totalTime += Math.round(G.st.tick / TPB * G.spb); saveState(); }
  }
  /* the crash: about 0.6 s later, the results card */
  function endInf() {
    const I0 = G.inf; if (!I0 || I0.ended) return;
    I0.ended = true;
    const st = G.st, sec = st.tick / TPB * G.spb, x = st.tick * DX, sc = I0.score, old = S.inf.best, nb = sc > old;
    S.inf.runs++; S.inf.totalTime += Math.round(sec);
    if (nb) { S.inf.best = sc; S.inf.bestDist = Math.round(x); }
    saveState();
    let top = null; for (const k in I0.used) if (!top || I0.used[k] > I0.used[top]) top = k;
    const hz = top ? HAZ.filter(function (h) { return h.k === top; })[0] : null;
    let html = '<div class="score-big">' + fmt(sc) + "</div>";
    if (nb && old > 0) html += '<div class="old-best">' + t("inf.results.oldBest", { n: "<s>" + fmt(old) + "</s>" }) + "</div>";
    else if (!nb) html += '<div class="old-best">' + t("hud.best", { n: fmt(old) }) + "</div>";
    if (nb && !RM) {
      html += '<div class="burst" aria-hidden="true">';
      for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2, r = 60 + (i % 3) * 22; html += '<i style="--dx:' + Math.round(Math.cos(a) * r) + "px;--dy:" + Math.round(Math.sin(a) * r) + "px;background:" + HAZ[i % HAZ.length].col + '"></i>'; }
      html += "</div>";
    }
    const stats = [[clockText(sec), t("inf.results.time")], [t("inf.results.meters", { n: fmt(Math.round(x)) }), t("inf.results.distance")], [fmt(I0.uses), tn("inf.results.uses", I0.uses)]];
    let chip = "";
    if (hz) chip = '<div class="haz-chip"><s style="background:' + hz.col + '"></s><span>' + esc(t("inf.results.most", { name: hzName(hz) })) + "</span></div>";
    showCard({ cls: nb ? "newbest" : "", eyebrow: esc(t("inf.title")) + "  ·  " + esc(t("inf.place")), title: nb ? esc(t("inf.newbest")) : esc(t("inf.results.title")), html: html, stats: stats, after: chip,
      acts: [{ t: t("card.inf.again"), solid: true, fn: function () { launchInf(null); } },
        { t: t("card.win.home"), fn: function () { hideCard(); show("home"); startHome(); } }] });
  }

  /* ---------------- play ---------------- */
  function paintHud() {
    if (G.inf) {
      $("#hudBest").innerHTML = t("hud.best", { n: "<b>" + fmt(S.inf.best) + "</b>" });
      G.inf.shown = -1; paintInfHud();
      return;
    }
    $("#hudLevel").innerHTML = t("game.level", { n: "<b>" + pad2(G.n) + "</b>" }) + " &nbsp;·&nbsp; " + esc(lvName(G.n));
    $("#hudTry").innerHTML = t("game.try", { n: "<b>" + G.tryN + "</b>" });
  }
  function startLevel(n) {
    G.inf = null; $("#hud").classList.remove("inf", "beat");
    G.n = n; G.def = LEVELS[n - 1]; G.L = getL(n); G.spb = 60 / G.def.mu[0]; G.session = 0;
    G.song = MUSIC.ctx ? MUSIC.makeSong(G.def, G.L, false) : null;
    RENDER.setHome(false); RENDER.setLevel(G.L, G.def.th, n * 101);
    $("#hud").classList.add("on");
    beginRun(true);
  }
  function beginRun(first) {
    const r = rec(G.n);
    if (!r.d) { r.t++; saveState(); G.tryN = r.t; } else { G.session++; G.tryN = G.session; }
    G.st = SIM.newState(); G.st.ev = []; G.paused = false; stopTip(); G.squash = 0; G.restY = 0; G.snap = true; G.beat0 = 0;
    keys.qj = keys.qs = false;
    G.tipDone = false; G.hist = tipPending() ? [SIM.clone(G.st)] : null;   /* every tick's state up to the tip, for its rewind */
    RENDER.setLevel(G.L, G.def.th, G.n * 101);
    paintHud(); hudFill.style.transform = "scaleX(0)";
    const h = first ? newHazard(G.n) : null;
    if (h) {
      /* frozen at the start, where the run's first frame would be, with no music and no clock, until "understood" */
      G.mode = "intro"; G.beat = -0.1 / G.spb; MUSIC.stop(0.1);
      hazardCard(h);
    } else {
      G.mode = "play"; go();
      if (first) showObjective(false);
    }
  }
  function go() { if (G.song) MUSIC.start(G.song); clock.start(); }
  /* "understood" on a new hazard card: the run starts from beat 0, exactly as an ordinary first run does */
  function startRun() {
    if (G.mode !== "intro") return;
    hideCard(true); keys.qj = keys.qs = false;
    G.mode = "play"; G.paused = false; go();
  }
  /* sim events -> effects. R: the renderer (the game's, or a hazard preview's), o: what holds the squash */
  function onEvents(st, x, R, o) {
    const ev = st.ev; if (!ev.length) return;
    R = R || RENDER; o = o || G;
    const main = R === RENDER, fl = st.flip, fb = fl && st.zz ? st.zz.base : 0, C = R.COL, y = st.y;
    const puff = function (n, sp) { R.emit(x, y + .05, n, { sp: sp, life: .4, sz: .08, ang: Math.PI * .5, spread: 2.6, g: 5, flip: fl, fb: fb }); };
    const pop = function (col, n) { R.ring(x, y + .9, col, 1.8, fl, fb); R.emit(x, y + .9, n || 10, { sp: 5, life: .5, sz: .1, col: col, g: 4, flip: fl, fb: fb }); };
    const scoring = main && G.inf && G.mode === "play" && !st.dead;
    for (const e of ev) {
      R.cue(e);   /* view-only: the runner's animation keys its transitions off these */
      if (scoring && USE[e]) award(USE[e]);
      switch (e) {
        case "jump": puff(4, 2); break;
        case "air": pop(C.ha, 8); break;
        case "land": o.squash = .55; puff(5, 2.4); break;
        case "land2": o.squash = 1; puff(12, 4); if (S.shake) R.shake(.4); break;
        case "bounce": o.squash = .8; pop(C.bl, 12); if (S.shake) R.shake(.3); break;
        case "halo": pop(C.ha, 10); break;
        case "key": pop(C.ke, 12); break;
        case "gate": R.emit(x + 3, y + 2.5, 14, { sp: 4, life: .6, sz: .1, col: C.ke, r: 4, g: 2, flip: fl, fb: fb }); break;
        case "rift": pop(C.ri, 14); if (S.shake) R.shake(.2); break;
        case "comet": pop(C.co, 10); break;
        case "eye": R.ring(x, y + 4.9, C.ey, 1.4, fl, fb); break;
        case "coil": pop(C.S, 12); if (S.shake) R.shake(.3); break;
        case "break": R.emit(x, y, 26, { sp: 6, life: .8, sz: .16, k: 1, col: C.X, r: 2.4, flip: fl, fb: fb }); if (S.shake) R.shake(.5); break;
        case "flip": pop(C.Z, 12); break;
        case "grab": R.ring(x, y + 1.75, C.L, 1, fl, fb); break;
        case "slide": puff(3, 1.6); break;
        case "die":
          if (main && G.mode === "play") {
            R.burst(x, y, fl, fb); if (!S.shake) R.shake(0);
            G.mode = "dead"; G.deadAt = now(); MUSIC.stop(0.14);
            if (S.sfx) MUSIC.sfx.die();   /* its own output: the music's fade above doesn't cut it */
          }
          break;
      }
    }
    ev.length = 0;
  }
  function win() {
    G.mode = "won"; G.wonAt = now();
    const r = rec(G.n), first = !r.d;
    if (first) { r.d = true; r.s = starsFor(r.t); }
    if (G.n < N && S.unlocked < G.n + 1) S.unlocked = G.n + 1;
    saveState();
    const n = G.n, shown = first ? r.s : r.s, tries = G.tryN;
    RENDER.emit(G.L.endX + 1, G.L.baseAt(G.L.endX) + 4.5, 40, { sp: 7, life: 1.1, sz: .13, k: 1, r: 1.8, g: 9 });
    setTimeout(function () {
      if (G.mode !== "won" || G.n !== n) return;
      const acts = [];
      if (n < N) acts.push({ t: t("card.win.next"), solid: true, fn: function () { hideCard(); MUSIC.stop(0.2); S.sel = n + 1; saveState(); startLevel(n + 1); } });
      acts.push({ t: t("common.replay"), solid: n >= N, fn: function () { hideCard(); MUSIC.stop(0.2); startLevel(n); } });
      acts.push({ t: t("card.win.home"), fn: function () { hideCard(); if (n < N) S.sel = n + 1; saveState(); show("home"); startHome(); } });
      showCard({ eyebrow: t("card.win.eyebrow", { n: pad2(n) }), title: esc(lvName(n)), stars: shown,
        stats: first ? [[tries, tn("stat.tries", tries)]] : [[tries, t("stat.thisRun")], [r.t, t("stat.record")]], acts: acts });
    }, 1150);
  }

  /* ---------------- level 1 spike tip ----------------
     Once, on level 1 only, for its first spike only: just before the runner reaches that spike the game freezes like
     a pause. There is no card: the spike gets a red ring on the canvas (RENDER.frame's V.mark) and a note next to it
     says what to do, with an "understood" button and a countdown (TIP.secs). Either one ends it. Then the run plays
     backwards, like a tape rewinding, to the start of a bar at least TIP.back beats before the spike, and goes on from
     there with the music started again at that beat, so the player gets a run-up to the spike they were just shown.
     It shows on every run of level 1 (a start, a replay, a restart, a retry after a crash), once per run: after its
     rewind the run goes past the spike without it (G.tipDone). Nothing is saved. The countdown and the rewind only
     run while the window has focus (and the loop doesn't run at all in a
     hidden tab). The Objective tips setting turns it off. Only real play: the home demo, previews and bot runs never
     stop for it, and the sim doesn't know about it: the rewind puts back states recorded during the run (G.hist).
     G.tip: false, "note" (frozen, note up) or "rewind". */
  const TIP = { lv: 1, find: "sp", lead: 1, back: 4, secs: 5, rewind: 1.1, title: "tip.title", body: TOUCH ? "tip.bodyTouch" : "tip.body" };   /* i18n ids */
  /* the spike (the first "sp" object by x0; objs are sorted), the tick where the game freezes (lead beats before its
     left edge) and the tick the rewind goes back to; found in the compiled level, so a chart change can't break it */
  let tipAt;
  function tipSpot() {
    if (tipAt !== undefined) return tipAt;
    tipAt = null;
    for (const o of getL(TIP.lv).objs) if (o.v === TIP.find) {
      const beat = o.x0 / SIM.UPB;
      tipAt = { o: o, tick: Math.max(0, Math.floor((beat - TIP.lead) * TPB)), back: Math.max(0, Math.floor((beat - TIP.back) / 4) * 4) * TPB };
      break;
    }
    return tipAt;
  }
  /* would this run stop for the tip? (beginRun records the run's states only then) */
  function tipPending() { return G.n === TIP.lv && !G.tipDone && S.objective && !G.bot && !!tipSpot(); }
  function tipDue(st) { return !G.tip && G.mode === "play" && !st.dead && tipPending() && !!G.hist && st.tick >= tipAt.tick; }
  const tipEl = $("#tipNote"), tipNum = $("#tipNum"), tipArc = $("#tipArc"), rwEl = $("#rewindFx");
  let tipLeft = 0, rwT = 0, winFocus = true;
  window.addEventListener("focus", function () { winFocus = true; });
  window.addEventListener("blur", function () { winFocus = false; });
  function dropInput() { keys.j = keys.s = keys.qj = keys.qs = false; for (const id in ptr) delete ptr[id]; }
  function showTip() {
    const o = tipAt.o;
    G.tip = "note"; G.paused = true; G.pauseT = now(); MUSIC.suspend(); dropInput();
    hideObjective();
    /* the ring: round the spike's box, with some air */
    G.mark = { x: o.x, y: (o.y0 + o.y1) / 2, r: Math.max(o.x1 - o.x0, o.y1 - o.y0) / 2 + .55, flip: o.flip, fb: o.fb || 0 };
    $("#tipTitle").textContent = t(TIP.title); $("#tipBody").textContent = t(TIP.body);
    tipLeft = TIP.secs; paintTip();
    tipEl.classList.add("show");
  }
  /* the note sits above the ring (below it if there is no room), kept on screen; the countdown number and its draining ring */
  function paintTip() {
    tipNum.textContent = Math.max(1, Math.ceil(tipLeft));
    tipArc.style.strokeDashoffset = (100 * (1 - tipLeft / TIP.secs)).toFixed(2);
    const m = G.mark, c = RENDER.point(m.x, m.y, m.flip, m.fb), rp = RENDER.point(m.x + m.r, m.y, false, 0).x - c.x;
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight, W = window.innerWidth, gap = 14, edge = 12;
    let top = c.y - rp - gap - h; if (top < 70) top = c.y + rp + gap;
    tipEl.style.left = Math.round(Math.max(edge, Math.min(W - w - edge, c.x - w / 2))) + "px";
    tipEl.style.top = Math.round(top) + "px";
  }
  $("#tipOk").addEventListener("click", function () { leaveTip(); });
  tipEl.addEventListener("pointerdown", function (e) { e.stopPropagation(); });   /* never game input */
  /* "understood", Enter, or the countdown running out: the note goes, the rewind starts */
  function leaveTip() {
    if (G.tip !== "note") return;
    if (document.activeElement && tipEl.contains(document.activeElement)) document.activeElement.blur();
    tipEl.classList.remove("show"); G.mark = null; dropInput();
    G.tipDone = true;   /* this run only: the next run shows it again */
    G.tip = "rewind"; rwT = 0; G.rw = { from: G.st.tick, to: tipAt.back };
    document.body.classList.add("rewinding"); rwEl.classList.add("on");
    /* the song stops; a tape whirr plays over the rewind (the audio has to run for it) */
    const p = MUSIC.resume(), whirr = function () { MUSIC.stop(0.08); if (S.sfx && G.tip === "rewind") MUSIC.sfx.rewind(RM ? .35 : TIP.rewind); };
    if (p && p.then) p.then(whirr, whirr); else whirr();
  }
  /* the recorded states, played backwards, fast at first and easing into the bar it goes back to; with reduced motion
     it just holds the old frame for a moment and jumps */
  function rewindStep(dt) {
    if (winFocus) rwT += dt;
    const d = RM ? .35 : TIP.rewind, p = Math.min(1, rwT / d), e = RM ? (p < 1 ? 0 : 1) : 1 - Math.pow(1 - p, 3);
    const k = Math.round(G.rw.from + (G.rw.to - G.rw.from) * e), s = G.hist[k] || G.hist[G.rw.to];
    G.st = s; G.beat = k / TPB;
    if (s.gr) G.restY = s.flip && s.zz ? s.zz.base : s.y; else if (s.flip && s.zz) G.restY = s.zz.base;
    if (p >= 1) endRewind();
  }
  /* back in the run at the bar it rewound to: that tick's state, the song from that beat, both clocks on it */
  function endRewind() {
    const b = G.rw.to / TPB;
    G.st = SIM.clone(G.hist[G.rw.to]); G.st.ev = []; G.hist = null; G.rw = null;
    document.body.classList.remove("rewinding"); rwEl.classList.remove("on");
    dropInput(); G.tip = false; G.beat = b;
    if (G.song) MUSIC.start(G.song, b);
    clock.off = null; clock.t0p = now() + 0.1 - b * G.spb; G.paused = false;
    if (!winFocus || document.hidden) pauseGame();
  }
  function stopTip() {
    G.tip = false; G.mark = null; G.rw = null; tipEl.classList.remove("show");
    document.body.classList.remove("rewinding"); rwEl.classList.remove("on");
  }

  /* ---------------- pause ---------------- */
  function pauseGame() {
    if (G.mode !== "play" || G.paused) return;
    G.paused = true; G.pauseT = now(); MUSIC.suspend(); keys.j = keys.s = false;
    if (G.inf) {
      /* restart is a new run: a new seed, under the wipe */
      showCard({ eyebrow: esc(t("inf.title")) + "  ·  " + esc(t("inf.place")), title: t("card.pause.title"),
        acts: [{ t: t("card.pause.resume"), solid: true, fn: resumeGame },
          { t: t("card.pause.restart"), fn: function () { leaveInf(); hideCard(); MUSIC.resume(); G.paused = false; G.mode = "home"; launchInf(null); } },
          { t: t("card.pause.quit"), fn: function () { leaveInf(); hideCard(); MUSIC.resume(); G.paused = false; show("home"); startHome(); } }] });
      return;
    }
    showCard({ eyebrow: t("game.level", { n: pad2(G.n) }) + "  ·  " + t("game.try", { n: G.tryN }), title: t("card.pause.title"),
      acts: [{ t: t("card.pause.resume"), solid: true, fn: resumeGame },
        { t: t("card.pause.restart"), fn: function () { hideCard(); MUSIC.resume(); beginRun(false); } },
        { t: t("card.pause.quit"), fn: function () { hideCard(); MUSIC.resume(); G.paused = false; show("home"); startHome(); } }] });
  }
  function resumeGame() { hideCard(); unfreeze(); }
  /* back into the run after a freeze (pause or level tip): the music picks up where it stopped, and the frame clock is
     moved on by the time spent frozen, so the loop's catch-up guard doesn't see the gap as a stall and pause again */
  let thawing = false;
  function unfreeze() {
    if (thawing) return; thawing = true;   /* once: Esc can land again while MUSIC.resume() is still pending */
    const p = MUSIC.resume();
    const go = function () { thawing = false; clock.t0p += now() - G.pauseT; clock.off = null; G.paused = false; };
    if (p && p.then) p.then(go, go); else go();
  }
  $("#pauseBtn").addEventListener("click", function (e) { e.stopPropagation(); pauseGame(); });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { if (G.mode === "play") pauseGame(); else MUSIC.suspend(); }
    else if (!G.paused) { MUSIC.resume(); clock.off = null; }
  });
  window.addEventListener("blur", function () { pauseGame(); });

  /* ---------------- input ---------------- */
  let audioOn = false;
  function audioGesture() {
    if (!MUSIC.ctx) { if (!MUSIC.init()) return; MUSIC.setVol(S.music); }
    if (!G.paused) MUSIC.resume();
    if (!audioOn) { audioOn = true; if (G.mode === "home") Promise.resolve(MUSIC.resume()).then(homeMusic); }
  }
  /* the first gesture on home: once audio runs, start the home song at the attract demo's current beat (plus the
     song's 0.1 s lead and the output latency), so the demo carries on where it is instead of jumping back to the start.
     If that gesture launched a level (or anything else left home) first, nothing starts. */
  function homeMusic() {
    const c = MUSIC.ctx;
    if (G.mode !== "home" || !c || MUSIC.song) return;
    const lat = Math.min(0.3, c.outputLatency || c.baseLatency || 0);
    homeSong = MUSIC.makeSong(HOME, homeL, true); MUSIC.start(homeSong, Math.max(0, clock.beat(G.spb)) + (0.1 + lat) / G.spb);
  }
  document.addEventListener("pointerdown", audioGesture, { capture: true });
  document.addEventListener("keydown", audioGesture, { capture: true });
  window.addEventListener("keydown", function (e) {
    const c = e.code;
    /* Esc: pause / resume in a run (nothing while a level tip counts down); on a panel (How to play, Settings, Levels) with no card open, back home */
    /* the spike tip: Enter is "understood"; no other key does anything, so nothing is queued for the run */
    if (G.tip) { if (c === "Enter" && G.tip === "note") { e.preventDefault(); leaveTip(); } else if (c === "Space" || c.indexOf("Arrow") === 0) e.preventDefault(); return; }
    if (c === "Escape") { if (langOpen() && !G.cardUp) { closeLang(true); return; } if (G.mode === "play" && !G.paused) pauseGame(); else if (G.paused && !thawing) resumeGame(); else if (!G.cardUp && panelOn()) show("home"); return; }
    if (c === "Space" && e.target === obChk) return;   /* the keyboard is on "Don't show again": Space ticks it */
    if (G.cardUp) { if (c === "Enter" && cardActs[0]) { e.preventDefault(); cardActs[0].fn(); } return; }
    if (G.mode === "play") {
      if (c === "Space" || c === "ArrowUp" || c === "KeyW") { if (!e.repeat) { keys.j = true; keys.qj = true; } e.preventDefault(); }
      else if (c === "ArrowDown" || c === "KeyS") { if (!e.repeat) { keys.s = true; keys.qs = true; } e.preventDefault(); }
    } else if (G.mode === "home" && $("#home").classList.contains("on")) {
      if (c === "Enter" || c === "Space") { e.preventDefault(); launch(); }
      else if (c === "ArrowUp" || c === "PageUp") { e.preventDefault(); goCard("inf"); }
      else if (c === "ArrowDown" || c === "PageDown") { e.preventDefault(); goCard("levels"); }
      else if (homeCard === "levels" && c === "ArrowLeft") browse(-1); else if (homeCard === "levels" && c === "ArrowRight") browse(1);
    } else if (panelOn() === "howto") {
      if (c === "ArrowLeft") Demo.prev(); else if (c === "ArrowRight") Demo.next();
    }
  });
  window.addEventListener("keyup", function (e) {
    const c = e.code;
    if (c === "Space" || c === "ArrowUp" || c === "KeyW") keys.j = false;
    else if (c === "ArrowDown" || c === "KeyS") keys.s = false;
  });
  const cv = $("#cv"), ptr = {};
  cv.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    if (G.mode !== "play" || G.paused) return;
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    const a = e.pointerType === "mouse" ? (e.button === 2 ? "s" : "j") : (e.clientX < window.innerWidth / 2 ? "s" : "j");
    ptr[e.pointerId] = a; keys[a] = true; keys["q" + a] = true;
  }, { passive: false });
  const up = function (e) { const a = ptr[e.pointerId]; if (!a) return; delete ptr[e.pointerId]; let still = false; for (const k in ptr) if (ptr[k] === a) still = true; if (!still) keys[a] = false; };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  document.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  document.addEventListener("gesturestart", function (e) { e.preventDefault(); });

  /* ---------------- main loop ---------------- */
  let last = 0, slow = 0, lowQ = false;
  const hudFill = $("#hudFill");
  function loop(ts) {
    requestAnimationFrame(loop);
    const t = ts / 1000, dt = Math.min(0.05, Math.max(0.001, t - last)); last = t;
    if (!G.st || !G.L) return;
    if (G.mode === "intro" && !G.snap) return;   /* frozen behind a new hazard card: drawn once, and again after a resize */
    if (G.tip === "rewind") rewindStep(dt);
    const st = G.st, L = G.L;
    if (!G.paused) {
      MUSIC.schedule();
      if (G.mode !== "dead" && G.mode !== "launch" && G.mode !== "intro") G.beat = clock.beat(G.spb) - G.beat0;
      if (G.mode === "home" || G.mode === "launch") {
        /* while home idles, the Infinite Shadow demo is made; while a launch wipes, the run's first bars */
        if (G.mode === "launch" && G.pending) G.pending.work(8, 16);
        else if (G.mode === "home") infDemoTick(dt > 0.024 ? 1 : 2);
        if (demoKind === "inf") {
          /* one loop is DEMO_INF_BARS bars, or what is made so far less 4 bars if that is ever shorter */
          const DB = Math.min(DEMO_INF_BARS, infDemo.g.bars - 4) * 4;
          if (G.beat >= DB) { G.beat0 += DB; G.beat -= DB; G.st = SIM.newState(); G.st.ev = []; RENDER.setLevel(infDemo.g.L, null, infDemo.g.seed, infDemo.g.biomeAt); G.snap = true; return; }
          const target = Math.floor(G.beat * TPB), path = infDemo.g.path; let n = 0;
          while (st.tick < target && !st.dead && n++ < 4000) { const v = path[Math.floor(st.tick / INF.DEC)] || 0; SIM.step(L, st, v & 1, v & 2, 0); onEvents(st, st.tick * DX); }
        } else {
          if (G.beat >= DEMO_BEATS) { G.beat0 += DEMO_BEATS; G.beat -= DEMO_BEATS; G.st = SIM.newState(); G.st.ev = []; RENDER.setLevel(demoL, homeTheme().th, homeTheme().n * 101); G.snap = true; return; }
          const target = Math.floor(G.beat * TPB); let n = 0;
          while (st.tick < target && !st.dead && !st.won && n++ < 4000) { const v = demoIn[Math.floor(st.tick / DEMO_SOL.DEC)] || 0; SIM.step(L, st, v & 1, v & 2, 0); onEvents(st, st.tick * DX); }
        }
      } else if (G.mode === "play" && G.inf) {
        /* Infinite Shadow: the score counts up (the world is made ahead at the end of the frame) */
        const target = Math.floor(G.beat * TPB);
        if (target - st.tick > TPB * 1.5) { pauseGame(); }
        else {
          while (st.tick < target && !st.dead) {
            if (G.bot) { const v = G.bot.path[Math.floor(st.tick / G.bot.DEC)] || 0; keys.j = !!(v & 1); keys.s = !!(v & 2); }
            SIM.step(L, st, keys.j || keys.qj, keys.s || keys.qs, 0); keys.qj = keys.qs = false;
            onEvents(st, st.tick * DX);
          }
          if (!st.dead) scoreInf(st.tick * DX);
          paintInfHud();
        }
      } else if (G.mode === "play") {
        const target = Math.floor(G.beat * TPB);
        if (target - st.tick > TPB * 1.5) { pauseGame(); }
        else {
          while (st.tick < target && !st.dead && !st.won) {
            if (tipDue(st)) { showTip(); break; }
            if (G.bot) { const v = G.bot.path[Math.floor(st.tick / G.bot.DEC)] || 0; keys.j = !!(v & 1); keys.s = !!(v & 2); }
            SIM.step(L, st, keys.j || keys.qj, keys.s || keys.qs, 0); keys.qj = keys.qs = false;
            if (G.hist) { const c = SIM.clone(st); c.ev = []; G.hist[st.tick] = c; }
            onEvents(st, st.tick * DX);
          }
          if (st.won && G.mode === "play") win();
        }
      } else if (G.mode === "dead" && G.inf) { if (now() - G.deadAt > 0.6) { G.mode = "over"; endInf(); } }
      else if (G.mode === "dead" && now() - G.deadAt > 0.65) { beginRun(false); return; }
      if (st.gr) G.restY = st.flip && st.zz ? st.zz.base : st.y;
      else if (st.flip && st.zz) G.restY = st.zz.base;
      G.squash = Math.max(0, G.squash - dt * 5);
    }
    const dead = G.mode === "dead" || G.mode === "over", fr = Math.max(0, Math.min(1.5, G.beat * TPB - st.tick));
    const x = dead || st.dead ? st.tick * DX : Math.max(G.beat * 4, -40);
    const y = st.gr || st.hang >= 0 || dead || st.won ? st.y : st.y + st.vy * SIM.DT * fr;
    let thermal = false; for (const z of L.zones) if (z.k === "T" && x >= z.x0 && x < z.x1) thermal = true;
    const bf = G.beat - Math.floor(G.beat), pulse = G.beat < 0 || dead ? 0 : Math.pow(Math.max(0, 1 - bf * 2.3), 2);
    const best = G.inf && S.inf.bestDist > 0 ? { x: S.inf.bestDist, tag: I.t("inf.marker") } : null;   /* (t is the frame time here) */
    RENDER.frame({ s: st, x: x, y: y, beat: G.beat, time: t, pulse: pulse, dead: dead || G.mode === "over", squash: G.squash, restY: G.restY, snap: G.snap, thermal: thermal,
      demo: G.mode === "home" || G.mode === "launch", noShake: !S.shake, mark: G.mark, best: best }, (G.paused && G.tip !== "rewind") || G.mode === "intro" ? 0 : dt);
    G.snap = false;
    if (G.mode === "play" && G.inf && !G.paused) feedInf(Math.max(0, st.tick * DX), performance.now() - ts, ts);
    if (G.tip === "note") { if (winFocus) tipLeft -= dt; if (tipLeft > 0) paintTip(); else leaveTip(); }
    if (!G.inf && (G.mode === "play" || dead || G.mode === "won")) hudFill.style.transform = "scaleX(" + Math.max(0, Math.min(1, x / L.endX)).toFixed(4) + ")";
    /* drop resolution once if the device cannot hold 60 fps */
    if (G.mode === "play" && !G.paused && !lowQ) { slow = dt > 0.024 ? slow + 1 : Math.max(0, slow - 0.25); if (slow > 70) { lowQ = true; RENDER.setQuality(0.72); RENDER.resize(); } }
  }

  /* ---------------- boot ---------------- */
  RENDER.resize(cv);
  let rz = 0;
  const onResize = function () { clearTimeout(rz); rz = setTimeout(function () { RENDER.resize(); G.snap = true; refreshScrollCue(); fitTitle(); sizeCards(); }, 120); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { refreshScrollCue(); fitTitle(); });
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", function () { setTimeout(onResize, 160); });
  applyLang();
  setCard(S.homeCard);
  startHome(); show("home");
  sizeCards();
  requestAnimationFrame(loop);
  window.__SHADOWSKIRR = { G: G, S: function () { return S; }, startLevel: startLevel, keys: keys, getL: getL,
    saveState: saveState, paintHome: paintHome, paintLevels: paintLevels, startHome: startHome, show: show,
    showCard: showCard, hideCard: hideCard, N: N, setS: setS,
    /* Infinite Shadow: start a run from a seed (the developer section), its definition */
    launchInf: function (seed) { if (G.mode !== "home") { hideCard(); show("home"); startHome(); } launchInf(null, seed); }, INF_DEF: INF_DEF };
  window.__LUMBRA = window.__SHADOWSKIRR;   /* legacy alias for old test scripts / console snippets */

  /* optional init hook (README: Builds): called once after every script has run, if one was defined; otherwise nothing */
  let devHooked = false;
  function devHook() {
    const init = window.SHKR_DEV_INIT;
    if (devHooked || typeof init !== "function") return;
    devHooked = true; init(window.__SHADOWSKIRR);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", devHook); else devHook();
})();

