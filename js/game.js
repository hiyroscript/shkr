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

  /* ---------------- saved state ---------------- */
  /* optional save-key override (README: Builds); without it, the real key */
  const REAL_KEY = "shadowskirr.v1";
  const KEY = (window.SHKR_DEV && window.SHKR_DEV.saveKey) || REAL_KEY, LEGACY_KEY = "lumbra.v1", DEFAULTS = { music: 0.8, sfx: true, shake: true, objective: true, sel: 1, unlocked: 1, rec: {} };
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
    if (id === "settings") paintSettings();
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
    if (o.body) html += "<p>" + o.body + "</p>";
    if (o.stats) { html += '<div class="stat-row">'; o.stats.forEach(function (s) { html += "<div><b>" + s[0] + "</b><span>" + s[1] + "</span></div>"; }); html += "</div>"; }
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
  function setLetters(el, text) {
    el.innerHTML = "";
    text.split(" ").forEach(function (word, wi, arr) {
      const w = document.createElement("span"); w.style.whiteSpace = "nowrap"; w.style.animation = "none";
      word.split("").forEach(function (ch, i) { const s = document.createElement("span"); s.textContent = ch; s.style.animationDelay = (wi * 0.12 + i * 0.03) + "s"; w.appendChild(s); });
      el.appendChild(w); if (wi < arr.length - 1) el.appendChild(document.createTextNode(" "));
    });
  }
  /* the title sits on a white box (css .title). A wrapped block is as wide as its max-width, not its longest line, so
     the box is narrowed to the words' extent; again on resize and once the fonts are in. Hidden home: left alone. */
  function fitTitle() {
    const el = $("#title"); el.style.width = "";
    let l = Infinity, r = -Infinity;
    for (const w of el.children) { const b = w.getBoundingClientRect(); l = Math.min(l, b.left); r = Math.max(r, b.right); }
    if (!(r > l)) return;
    const cs = getComputedStyle(el);
    el.style.width = Math.ceil(r - l + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 1) + "px";
  }
  function paintHome(retitle) {
    const n = S.sel, def = LEVELS[n - 1], locked = n > S.unlocked, r = S.rec[n] || { t: 0, s: 0, d: false };
    $("#lvTag").textContent = "level " + pad2(n) + (locked ? "  ·  locked" : "");
    if (retitle) { setLetters($("#title"), def.name); fitTitle(); }
    $("#title").classList.toggle("locked", locked);   /* greyed letters on a still solid box (css) */
    $("#homeStars").innerHTML = locked ? "" : starsHTML(r.d ? r.s : 0).replace(/^<div class="stars">|<\/div>$/g, "");
    $("#homeStars").style.visibility = locked ? "hidden" : "visible";
    $("#startOrb").classList.toggle("locked", locked);
    $("#startLbl").textContent = locked ? "locked" : r.d ? "replay" + "  ·  " + r.t + (r.t === 1 ? " try" : " tries") : r.t ? "play  ·  try " + (r.t + 1) : "play";
    $("#rebirthBtn").classList.toggle("hide", !r.d);
    $("#prevBtn").disabled = n <= 1; $("#nextBtn").disabled = n >= N;
    let done = 0; for (let i = 1; i <= N; i++) if (S.rec[i] && S.rec[i].d) done++;
    $("#railFill").style.width = (done / N * 100) + "%";
    $("#progTag").textContent = pad2(n) + " / " + N;
  }
  function browse(d) {
    const n = Math.max(1, Math.min(N, S.sel + d)); if (n === S.sel) return;
    S.sel = n; saveState(); paintHome(true);
    if (n <= S.unlocked && G.mode === "home") { const def = LEVELS[n - 1]; RENDER.setLevel(demoL, def.th, n * 101); G.snap = true; }
  }
  $("#prevBtn").addEventListener("click", function () { browse(-1); });
  $("#nextBtn").addEventListener("click", function () { browse(1); });
  function homeTheme() { const n = Math.min(S.sel, S.unlocked); return LEVELS[n - 1]; }
  function startHome() {
    G.mode = "home"; G.paused = false; stopTip(); G.hist = null; $("#hud").classList.remove("on"); hideObjective();
    const def = homeTheme();
    G.L = demoL; G.spb = 60 / HOME.mu[0]; G.st = SIM.newState(); G.st.ev = []; G.beat0 = 0; G.squash = 0; G.restY = 0; G.snap = true;
    RENDER.setHome(true); RENDER.setLevel(demoL, def.th, def.n * 101);
    if (MUSIC.ctx) { homeSong = MUSIC.makeSong(HOME, homeL, true); MUSIC.start(homeSong); }
    clock.start();
  }
  function launch() {
    if (S.sel > S.unlocked || G.mode !== "home") return;
    audioGesture();
    const r = $("#startOrb").getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, w = $("#wipe"), W = window.innerWidth, H = window.innerHeight;
    const far = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy));
    w.style.left = (cx - 5) + "px"; w.style.top = (cy - 5) + "px"; w.style.setProperty("--sc", Math.ceil(far / 5) + "");
    w.classList.remove("go", "fade"); void w.offsetWidth; w.classList.add("go");
    G.mode = "launch"; MUSIC.stop(0.4);
    setTimeout(function () {
      show(""); startLevel(S.sel);
      w.classList.add("fade"); setTimeout(function () { w.classList.remove("go", "fade"); }, 340);
    }, 500);
  }
  $("#startOrb").addEventListener("click", launch);
  $("#rebirthBtn").addEventListener("click", function () {
    const n = S.sel;
    showCard({ eyebrow: "level " + pad2(n), title: "Rebirth?", body: "This clears the stars and tries of " + LEVELS[n - 1].name + ", as if it had never been played. Every level you have unlocked stays unlocked.",
      acts: [{ t: "rebirth", rebirth: true, fn: function () { S.rec[n] = { t: 0, s: 0, d: false }; saveState(); hideCard(); paintHome(false); } }, { t: "cancel", fn: hideCard }] });
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
  osw.addEventListener("click", function () { S.objective = !S.objective; paintSettings(); saveState(); });
  $("#resetBtn").addEventListener("click", function () {
    showCard({ eyebrow: "settings", title: "Reset everything?", body: "All unlocks, stars and try counts will be cleared.",
      acts: [{ t: "reset", danger: true, fn: function () { S.rec = {}; S.unlocked = 1; S.sel = 1; saveState(); hideCard(); show("home"); startHome(); } }, { t: "cancel", fn: hideCard }] });
  });

  /* ---------------- objective box ----------------
     The goal and the controls, at the start of a level (S.objective). On its own it sits near the top and goes
     away by itself, later while the mouse is over it or the keyboard is on its checkbox. On a level that brings
     in a new hazard it docks in the overlay right above the hazard card and leaves with it. */
  const ob = $("#msBanner"), obChk = $("#obHide");
  let obT = 0, obMouse = false;
  $("#obJump").textContent = TOUCH ? "tap the right side" : "space · ↑ · w · click";
  $("#obRoll").textContent = TOUCH ? "hold the left side" : "↓ · s · right-click";
  function kbFocus(el) { try { return el.matches(":focus-visible"); } catch (e) { return document.activeElement === el; } }
  function showObjective(dock) {
    hideObjective();
    if (!S.objective) return;
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
    S.objective = !obChk.checked; saveState(); paintSettings();
    if (!kbFocus(obChk)) obChk.blur();   /* after a click the keys go back to the game */
  });

  /* ---------------- new hazard cards ----------------
     Before the first run of the level that brings in a hazard (HAZ[].lv) the game waits, frozen, behind a card
     that names the hazard, says what to do and shows it in a looping preview. The preview is a tiny chart
     (terrain/overlay, 8 cells a bar, README: How it works) played by the real simulation with a scripted input
     and drawn by a second renderer (RENDER.create) in the level's own theme, so it looks exactly like the game.
     in: inputs, used in turn on each loop, as [from beat, to beat, 1 jump | 2 roll]; to: the beat where the loop
     starts over; still: the beat shown, as one frame, with prefers-reduced-motion. */
  const INTRO = {
    bl: { body: "A bouncy pad. Run onto it and it throws you up really high. Use it to get over big gaps and tall steps.",
      c: "...H............/..B.............", in: [[]], to: 3.6, still: 1.6 },
    ha: { body: "A floating ring. Jump through it, then press jump again while you're in the air to jump a second time.",
      c: "...~~~........../....O...........", in: [[[1.25, 1.4, 1], [2.05, 2.2, 1]]], to: 4, still: 1.6 },
    D: { body: "Inside the purple area you're light as a bubble. Your jumps go higher and you fall slower.",
      c: "....._........../.D..........d...", in: [[[2.4, 2.55, 1]]], to: 4.6, still: 3 },
    F: { body: "Tiles that disappear soon after you step on them. Land on one and jump off right away.",
      c: "..~~~~~........./...F.F..........", in: [[[0.75, 0.9, 1], [1.8, 1.95, 1], [2.85, 3, 1]]], to: 4.6, still: 2 },
    ke: { body: "A spinning crystal opens the orange wall after it. Touch the crystal, then run through the wall. If you miss the crystal, the wall stays closed.",
      c: "................/...K..G.........", in: [[]], to: 4, still: 1.5 },
    A: { body: "Inside the blue area you're heavy. Your jumps are small and quick, so press fast.",
      c: "..^^^^........../.A........a.....", in: [[[1, 1.1, 1], [1.5, 1.6, 1], [2, 2.1, 1], [2.5, 2.6, 1]]], to: 4, still: 1.75 },
    L: { body: "A bar you can hang from. Jump and keep holding jump to grab it. Let go to drop down.",
      c: "...~~~~~......../...L.....l......", in: [[[1.2, 4.1, 1]]], to: 5.2, still: 2.8 },
    ri: { body: "A portal that shoots you straight up. Tap roll just before it, so you stand up inside it. It takes you to places too high to jump to.",
      c: "....H.........../....R...........", in: [[[1.9, 1.95, 2]]], to: 4.2, still: 2.3 },
    co: { body: "Grab it while you're in the air and you'll glide straight across. Great for long gaps.",
      c: "...~~~........../...C............", in: [[[1.25, 1.4, 1]]], to: 4.4, still: 2.3 },
    T: { body: "Warm air pushes you up by itself. Jump doesn't work here. Hold roll to go down.",
      c: "................/.T.m...n...t....", in: [[[3, 4.2, 2]]], to: 5.4, still: 2 },
    ey: { body: "The eye watches you, then shoots where you were. If you were on the ground, jump. If you were in the air, stay on the ground.",
      c: "................/...E...e........", in: [[[3.5, 3.65, 1]], [[1.5, 1.65, 1]]], to: 5, still: 3.9 },
    X: { body: "You can run on top of it. To break through, roll as you land on it.",
      c: "..Y............./...XXXX.........", in: [[[2, 2.15, 1], [2.5, 2.95, 2]]], to: 4.6, still: 2.65 },
    S: { body: "A spring. Roll onto it and hold roll to squeeze it, then let go to fly up. Hold longer to go higher.",
      c: "....H.........../..SS............", in: [[[0.9, 1.9, 2]]], to: 4, still: 1.75 },
    1: { body: "Some tiles are solid and some are see-through. Every time you jump, they swap. Count your jumps!",
      c: "...~~~~~~~....../....2.1.2.......", in: [[[1.3, 1.45, 1], [2.35, 2.5, 1], [3.35, 3.5, 1], [4.4, 4.55, 1]]], to: 5.8, still: 1.8 },
    Z: { body: "Gravity flips and you run on the ceiling. Jump still works the same way. You flip back when you leave the area.",
      c: ".....^........../..Z.....z.......", in: [[[2.65, 2.8, 1]]], to: 5.5, still: 2.9 }
  };
  const PV_FROM = -0.6, PV_BPM = 132;   /* the loop starts a little before beat 0; previews play at the level's tempo, at most PV_BPM */
  let pvR = null;
  function newHazard(n) { for (const h of HAZ) if (h.lv === n) return h; return null; }
  function hazardCard(h) {
    showCard({ cls: "wide", pv: "The " + h.name + " in the game", eyebrow: "new hazard", title: h.name, accent: h.col, body: INTRO[h.k].body,
      acts: [{ t: "understood", solid: true, fn: startRun }],
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
  const BASICS = "the basics", OBSTACLE = "obstacle";
  const HOWTO = [
    { kind: BASICS, name: "Jump", body: "Press jump to hop. You stay in the air for one beat, so jump with the music. Use it to clear spikes and gaps.",
      c: "....^.........../................", in: [[[2, 2.15, 1]]], to: 4, still: 2.5 },
    { kind: BASICS, name: "Roll", body: "Hold roll to curl into a ball and slide under things. You stay down as long as something is above you.",
      c: "....-.........../................", in: [[[1.85, 2.95, 2]]], to: 4, still: 2.4 },
    { kind: BASICS, name: "Dive", body: "Roll while you're in the air to drop down fast. It cuts a jump short.",
      c: "....^.-........./................", in: [[[2, 2.15, 1], [2.6, 3.7, 2]]], to: 4.6, still: 2.75 },
    { kind: OBSTACLE, name: "Spikes", body: "Spikes kill you if you touch them. Jump over them. Wide and tall spikes need a well-timed jump.",
      c: "..^...M...I...../................", in: [[[1, 1.15, 1], [3, 3.15, 1], [5, 5.15, 1]]], to: 6.6, still: 3.5 },
    { kind: OBSTACLE, name: "Pits", body: "A gap in the ground. Jump across. Falling in sends you back to the start.",
      c: "...._...U......./................", in: [[[2, 2.15, 1], [4.3, 4.45, 1]]], to: 6.4, still: 4.9 },
    { kind: OBSTACLE, name: "Bars", body: "A bar hanging just above the ground. Roll under it.",
      c: "...-....-......./................", in: [[[1.4, 2.35, 2], [3.9, 4.85, 2]]], to: 6, still: 2 },
    { kind: OBSTACLE, name: "Hanging walls", body: "A wall that hangs down to just above your head. Stay on the ground and don't jump.",
      c: "...'..'..'....../................", in: [[]], to: 6, still: 2 },
    { kind: OBSTACLE, name: "Steps", body: "The ground climbs and drops. Jump onto a step up. Running into its side will knock you out.",
      c: "...+...#..v.V.../................", in: [[[1.5, 1.65, 1], [3.4, 3.55, 1]]], to: 7, still: 3.8 },
    { kind: OBSTACLE, name: "Floating spike blocks", ob: "*", body: "Spikes floating at middle height. Roll under them, or jump early to clear them.",
      c: "...*.....*....../................", in: [[[1.6, 2.3, 2], [4.5, 4.65, 1]]], to: 6.6, still: 5 },
    { kind: OBSTACLE, name: "Spiked steps", ob: "%", body: "A step with spikes on top. Jump from further back so you land past the spikes.",
      c: "...%...v.%..v.../................", in: [[[1.55, 1.7, 1], [4.55, 4.7, 1]]], to: 7, still: 2.1 },
    { kind: OBSTACLE, name: "Low tunnels", ob: "=", body: "A long, low roof with spikes on it. Roll and keep rolling until you're out. You can't jump inside.",
      c: "...=====......../................", in: [[[1.5, 4.4, 2]]], to: 5.8, still: 3 },
    { kind: OBSTACLE, name: "Hurdles", ob: "&", body: "A spike, then a bar right after it. Jump the spike, then roll as soon as you land.",
      c: "....&.........../................", in: [[[1.95, 2.1, 1], [2.92, 3.7, 2]]], to: 4.8, still: 3.2 },
    { kind: OBSTACLE, name: "Crushers", ob: "|", body: "Heavy blocks that slam down and lift up with the beat. If it's down, jump over it. If it's up, stay on the ground and run under.",
      c: "....|..|......../................", in: [[[2, 2.15, 1]]], to: 5.6, still: 2.5 },
    { kind: OBSTACLE, name: "Rolling blades", ob: "@", body: "Saws rolling toward you along the ground. Jump them just as they reach you.",
      c: "....@....@....../................", in: [[[2, 2.15, 1], [4.5, 4.65, 1]]], to: 6.4, still: 2.4 }
  ];
  /* the newer obstacles say which level brings them in (OBST); every page plays in a level's colours: the basics and
     the first obstacles in level 1's, a newer obstacle or a hazard in its own level's */
  HOWTO.forEach(function (p) { if (p.ob) for (const o of OBST) if (o.ch === p.ob) p.lv = o.lv; p.def = LEVELS[(p.lv || 1) - 1]; });
  HAZ.forEach(function (h) { HOWTO.push({ kind: "hazard", name: h.name, body: INTRO[h.k].body, D: INTRO[h.k], h: h, lv: h.lv, def: LEVELS[h.lv - 1] }); });
  /* JUMP / ROLL over the bottom centre of a How to play canvas (on the dark ground band). A tap stays up for at least
     KEY_HOLD s so it can be read, but goes out KEY_GAP s before the next press, so every press shows on its own. */
  const KEY_HOLD = 0.3, KEY_GAP = 0.09, KEY_FADE = 0.08, KEY_FONT = getComputedStyle(document.documentElement).getPropertyValue("--mono").trim() || "monospace";
  function keyLabel(cvs, inp, beat, spb) {
    let v = 0, a = 0;
    for (const q of inp) {
      let end = q[0] + KEY_HOLD / spb;
      for (const r of inp) if (r[0] > q[0]) end = Math.min(end, r[0] - KEY_GAP / spb);
      end = Math.max(end, q[1]);
      if (beat >= q[0] && beat < end) { v |= q[2]; a = Math.max(a, Math.min(1, (end - beat) * spb / KEY_FADE)); }
    }
    if (!v || !cvs.clientWidth) return;
    const text = (v & 1 ? "jump" : "") + (v === 3 ? " + " : "") + (v & 2 ? "roll" : "");
    const g = cvs.getContext("2d"), k = cvs.width / cvs.clientWidth, ls = 11 * .18 * k;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = a;
    g.font = "700 " + (11 * k).toFixed(2) + "px " + KEY_FONT; g.textAlign = "center"; g.textBaseline = "middle";
    const spaced = "letterSpacing" in g;
    if (spaced) g.letterSpacing = ls.toFixed(2) + "px";
    const w = g.measureText(text.toUpperCase()).width + 18 * k, h = 21 * k, x = cvs.width / 2, y = cvs.height - 9 * k - h / 2;
    /* a dark pill, invisible on the black ground and enough to read the label over a pit, where the pale sky shows */
    g.fillStyle = "rgba(10,10,16,.5)"; g.beginPath();
    if (g.roundRect) g.roundRect(x - w / 2, y - h / 2, w, h, h / 2); else g.rect(x - w / 2, y - h / 2, w, h);
    g.fill();
    g.fillStyle = "rgba(237,239,242,.75)"; g.fillText(text.toUpperCase(), x + (spaced ? ls / 2 : 0), y);   /* spacing trails the last letter */
    g.restore();
  }
  const Demo = (function () {
    const cv = $("#demoCv"), prevB = $("#demoPrev"), nextB = $("#demoNext"), dots = $("#demoDots");
    /* the hazard cards' preview geometry, at a sharper resolution chosen for the canvas's size on screen */
    const fit = { w: 220, h: 140, dpr: 2, sc: 14, px: .3, gy: .84, top: 4 };
    let R = null, i = 0, halt = null, on = false;
    dots.innerHTML = HOWTO.map(function () { return "<i></i>"; }).join("");
    $("#legend").innerHTML = HAZ.map(function (h) { return '<div><s style="background:' + h.col + '"></s><span>' + h.name + "</span></div>"; }).join("");
    $("#howtoFoot").textContent = "Run to the end of the level. Everything moves to the music, so the beat tells you when to act. Touch anything deadly or fall into a pit and you start the level again. Jump: Space, ↑ or W, left click, or tap the right side of the screen. Roll: ↓ or S, right click, or hold the left side of the screen.";
    function paint() {
      const p = HOWTO[i];
      $("#demoKind").textContent = p.kind; $("#demoName").textContent = p.name; $("#demoDesc").textContent = p.body;
      $("#demoMeta").innerHTML = p.lv ? (p.h ? '<s style="background:' + p.h.col + '"></s>' : "") + '<span class="tag">from level ' + pad2(p.lv) + "</span>" : "";
      cv.setAttribute("aria-label", p.name + " in the game");
      if (i === 0 && document.activeElement === prevB) nextB.focus();
      prevB.style.display = i === 0 ? "none" : "";
      nextB.textContent = i === HOWTO.length - 1 ? "start over" : "next";
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
    paint();
    return {
      start: function () { on = true; paint(); play(); },
      stop: function () { on = false; halt0(); },
      prev: prev, next: next
    };
  })();

  /* ---------------- play ---------------- */
  function paintHud() {
    $("#hudLevel").innerHTML = "level <b>" + pad2(G.n) + "</b> &nbsp;·&nbsp; " + G.def.name;
    $("#hudTry").innerHTML = "try <b>" + G.tryN + "</b>";
  }
  function startLevel(n) {
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
    for (const e of ev) {
      R.cue(e);   /* view-only: the runner's animation keys its transitions off these */
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
      if (n < N) acts.push({ t: "next level", solid: true, fn: function () { hideCard(); MUSIC.stop(0.2); S.sel = n + 1; saveState(); startLevel(n + 1); } });
      acts.push({ t: "replay", solid: n >= N, fn: function () { hideCard(); MUSIC.stop(0.2); startLevel(n); } });
      acts.push({ t: "home", fn: function () { hideCard(); if (n < N) S.sel = n + 1; saveState(); show("home"); startHome(); } });
      showCard({ eyebrow: "level " + pad2(n) + " cleared", title: G.def.name, stars: shown,
        stats: first ? [[tries, tries === 1 ? "try" : "tries"]] : [[tries, "this run"], [r.t, "record tries"]], acts: acts });
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
  const TIP = { lv: 1, find: "sp", lead: 1, back: 4, secs: 5, rewind: 1.1, title: "Avoid the spikes",
    body: TOUCH ? "Tap the right side of the screen to jump over them" : "Jump over them: space, ↑, w or click" };
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
    $("#tipTitle").textContent = TIP.title; $("#tipBody").textContent = TIP.body;
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
    showCard({ eyebrow: "level " + pad2(G.n) + "  ·  try " + G.tryN, title: "Paused",
      acts: [{ t: "resume", solid: true, fn: resumeGame },
        { t: "restart", fn: function () { hideCard(); MUSIC.resume(); beginRun(false); } },
        { t: "quit", fn: function () { hideCard(); MUSIC.resume(); G.paused = false; show("home"); startHome(); } }] });
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
    if (c === "Escape") { if (G.mode === "play" && !G.paused) pauseGame(); else if (G.paused && !thawing) resumeGame(); else if (!G.cardUp && panelOn()) show("home"); return; }
    if (c === "Space" && e.target === obChk) return;   /* the keyboard is on "Don't show again": Space ticks it */
    if (G.cardUp) { if (c === "Enter" && cardActs[0]) { e.preventDefault(); cardActs[0].fn(); } return; }
    if (G.mode === "play") {
      if (c === "Space" || c === "ArrowUp" || c === "KeyW") { if (!e.repeat) { keys.j = true; keys.qj = true; } e.preventDefault(); }
      else if (c === "ArrowDown" || c === "KeyS") { if (!e.repeat) { keys.s = true; keys.qs = true; } e.preventDefault(); }
    } else if (G.mode === "home" && $("#home").classList.contains("on")) {
      if (c === "Enter" || c === "Space") { e.preventDefault(); launch(); }
      else if (c === "ArrowLeft") browse(-1); else if (c === "ArrowRight") browse(1);
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
        if (G.beat >= DEMO_BEATS) { G.beat0 += DEMO_BEATS; G.beat -= DEMO_BEATS; G.st = SIM.newState(); G.st.ev = []; RENDER.setLevel(demoL, homeTheme().th, homeTheme().n * 101); G.snap = true; return; }
        const target = Math.floor(G.beat * TPB); let n = 0;
        while (st.tick < target && !st.dead && !st.won && n++ < 4000) { const v = demoIn[Math.floor(st.tick / DEMO_SOL.DEC)] || 0; SIM.step(L, st, v & 1, v & 2, 0); onEvents(st, st.tick * DX); }
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
      } else if (G.mode === "dead" && now() - G.deadAt > 0.65) { beginRun(false); return; }
      if (st.gr) G.restY = st.flip && st.zz ? st.zz.base : st.y;
      else if (st.flip && st.zz) G.restY = st.zz.base;
      G.squash = Math.max(0, G.squash - dt * 5);
    }
    const dead = G.mode === "dead", fr = Math.max(0, Math.min(1.5, G.beat * TPB - st.tick));
    const x = dead || st.dead ? st.tick * DX : Math.max(G.beat * 4, -40);
    const y = st.gr || st.hang >= 0 || dead || st.won ? st.y : st.y + st.vy * SIM.DT * fr;
    let thermal = false; for (const z of L.zones) if (z.k === "T" && x >= z.x0 && x < z.x1) thermal = true;
    const bf = G.beat - Math.floor(G.beat), pulse = G.beat < 0 || dead ? 0 : Math.pow(Math.max(0, 1 - bf * 2.3), 2);
    RENDER.frame({ s: st, x: x, y: y, beat: G.beat, time: t, pulse: pulse, dead: dead, squash: G.squash, restY: G.restY, snap: G.snap, thermal: thermal,
      demo: G.mode === "home" || G.mode === "launch", noShake: !S.shake, mark: G.mark }, (G.paused && G.tip !== "rewind") || G.mode === "intro" ? 0 : dt);
    G.snap = false;
    if (G.tip === "note") { if (winFocus) tipLeft -= dt; if (tipLeft > 0) paintTip(); else leaveTip(); }
    if (G.mode === "play" || dead || G.mode === "won") hudFill.style.transform = "scaleX(" + Math.max(0, Math.min(1, x / L.endX)).toFixed(4) + ")";
    /* drop resolution once if the device cannot hold 60 fps */
    if (G.mode === "play" && !G.paused && !lowQ) { slow = dt > 0.024 ? slow + 1 : Math.max(0, slow - 0.25); if (slow > 70) { lowQ = true; RENDER.setQuality(0.72); RENDER.resize(); } }
  }

  /* ---------------- boot ---------------- */
  RENDER.resize(cv);
  let rz = 0;
  const onResize = function () { clearTimeout(rz); rz = setTimeout(function () { RENDER.resize(); G.snap = true; refreshScrollCue(); fitTitle(); }, 120); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { refreshScrollCue(); fitTitle(); });
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", function () { setTimeout(onResize, 160); });
  startHome(); show("home");
  requestAnimationFrame(loop);
  window.__SHADOWSKIRR = { G: G, S: function () { return S; }, startLevel: startLevel, keys: keys, getL: getL,
    saveState: saveState, paintHome: paintHome, paintLevels: paintLevels, startHome: startHome, show: show,
    showCard: showCard, hideCard: hideCard, N: N, setS: setS };
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

