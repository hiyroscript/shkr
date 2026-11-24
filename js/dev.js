/* ---- dev.js ---- */
/* ============================================================================
   DEV — developer build only. tools/build-release.sh deletes this file (and
   js/dev-config.js) from the release, and its guard fails the build if any of
   it is left behind. Loaded after game.js, which calls SHKR_DEV_INIT once with
   its debug handle when boot is done.
   - first load (no developer save yet): every level unlocked, three rainbow stars
   - Settings gets a developer section: unlock all, reset, put progress back, and
     Soundtracks, a screen to listen to every track (theme, bar map, mutes per part)
   - a DEV badge in the home header
   Saves go to shadowskirr.dev.v1 (set by dev-config.js), never shadowskirr.v1.
   ========================================================================== */
(function () {
  "use strict";
  const DEV_KEY = "shadowskirr.dev.v1", SNAP_KEY = "shadowskirr.dev.snapshot";
  const pad2 = function (n) { return (n < 10 ? "0" : "") + n; };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  const CSS =
    "#home .tag.shkr-dev-badge{background:var(--ink);color:#fff;padding:6px 11px;border-radius:100px;flex:0 0 auto;margin-right:auto;font-weight:700}" +
    ".shkr-dev{margin-top:28px}" +
    ".shkr-dev-head{display:flex;align-items:baseline;justify-content:space-between;gap:6px 14px;flex-wrap:wrap;" +
      "padding-bottom:10px;border-bottom:1px solid var(--line)}" +
    ".shkr-dev-head b{font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:var(--fg)}" +
    ".shkr-dev-head span{font-family:var(--mono);font-size:10px;letter-spacing:.08em;color:var(--faint)}" +
    ".shkr-dev .chip:disabled{opacity:.35;cursor:default;transform:none}" +
    ".shkr-dev .chip:disabled:hover{background:none}" +
    /* the soundtrack player */
    ".shkr-dev-snd-now{padding:4px 0 18px;border-bottom:1px solid var(--line)}" +
    ".shkr-dev-snd-name{font-size:clamp(19px,4.4vw,28px);font-weight:700;letter-spacing:-.02em;color:var(--fg);margin-top:6px}" +
    ".shkr-dev-snd-spec{font-family:var(--mono);font-size:11px;line-height:1.6;color:var(--dim);margin-top:6px}" +
    ".shkr-dev-snd-map{display:flex;align-items:flex-end;gap:2px;height:46px;margin:18px 0 8px;cursor:pointer}" +
    ".shkr-dev-snd-map i{flex:1;min-width:2px;background:var(--fg);opacity:.22;border-radius:2px 2px 0 0;position:relative}" +
    ".shkr-dev-snd-map i:hover{opacity:.45}.shkr-dev-snd-map i.on{opacity:1}" +
    ".shkr-dev-snd-map i.cb::after{content:\"\";position:absolute;left:50%;top:-7px;width:4px;height:4px;margin-left:-2px;border-radius:50%;background:var(--fg)}" +
    ".shkr-dev-snd-pos{font-family:var(--mono);font-size:11px;letter-spacing:.06em;color:var(--faint)}" +
    ".shkr-dev-snd-ctl{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px}" +
    ".shkr-dev-snd-ctl .tag{margin-right:4px}" +
    ".shkr-dev-snd-ctl .chip[aria-pressed=true]{background:var(--fg);color:var(--bg);border-color:var(--fg);text-decoration:line-through}" +
    ".shkr-dev-snd-list{display:flex;flex-direction:column;margin-top:6px}" +
    ".shkr-dev-snd-row{display:grid;grid-template-columns:52px 1fr auto;align-items:baseline;gap:10px;text-align:left;padding:11px 4px;border-bottom:1px solid var(--line-2);color:var(--fg)}" +
    ".shkr-dev-snd-row:hover{background:var(--hover)}" +
    ".shkr-dev-snd-row b{font-family:var(--mono);font-size:11px;font-weight:400;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}" +
    ".shkr-dev-snd-row span{font-size:15px}" +
    ".shkr-dev-snd-row i{font-style:normal;font-family:var(--mono);font-size:10px;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".shkr-dev-snd-row.on b{color:var(--fg);font-weight:700}.shkr-dev-snd-row.on span{font-weight:700}" +
    "@media (max-width:560px){.shkr-dev-snd-row{grid-template-columns:44px 1fr}.shkr-dev-snd-row i{grid-column:2}}";

  window.SHKR_DEV_INIT = function (api) {
    /* Without dev-config.js game.js is on the real save key: stay off so a player's progress is never touched. */
    if (!window.SHKR_DEV || window.SHKR_DEV.saveKey !== DEV_KEY) {
      console.warn("[shadow skirr dev] js/dev-config.js did not load before sim.js; developer tools are off.");
      return;
    }
    const N = api.N;

    /* ---------------- progress helpers ---------------- */
    function current() { const S = api.S(); return { unlocked: S.unlocked, sel: S.sel, rec: JSON.parse(JSON.stringify(S.rec)) }; }
    function rainbow() { const rec = {}; for (let n = 1; n <= N; n++) rec[n] = { t: 1, s: 4, d: true }; return { unlocked: N, sel: api.S().sel, rec: rec }; }
    function fresh() { return { unlocked: 1, sel: 1, rec: {} }; }
    function summary(p) {
      let done = 0, rb = 0;
      for (let n = 1; n <= N; n++) { const r = p.rec && p.rec[n]; if (r && r.d) { done++; if (r.s === 4) rb++; } }
      return pad2(p.unlocked) + " / " + N + " unlocked, " + done + " cleared, " + rb + " rainbow";
    }
    function readSnap() {
      const str = lsGet(SNAP_KEY);
      if (str === null) return null;
      try { const o = JSON.parse(str); return o && typeof o === "object" && o.rec && typeof o.rec === "object" ? o : null; } catch (e) { return null; }
    }
    function snapshot() { lsSet(SNAP_KEY, JSON.stringify(current())); }
    /* replace unlocked / sel / rec, keep the settings (music, sound effects, shake, objective tips), then repaint the way the normal reset does */
    function apply(p, goHome) {
      const S = api.S();
      api.setS({ music: S.music, sfx: S.sfx, shake: S.shake, objective: S.objective, sel: p.sel, unlocked: p.unlocked, rec: p.rec });
      api.saveState(); api.paintHome(false); api.paintLevels();
      if (goHome) { api.show("home"); api.startHome(); }
      paintPanel();
    }
    function confirmCard(title, body, verb, fn) {
      api.showCard({ eyebrow: "developer", title: title, body: body,
        acts: [{ t: verb, danger: true, fn: function () { api.hideCard(); fn(); } }, { t: "cancel", fn: api.hideCard }] });
    }

    /* ---------------- DOM ---------------- */
    const style = document.createElement("style");
    style.id = "shkr-dev-style"; style.textContent = CSS;
    document.head.appendChild(style);
    document.title = "DEV · " + document.title;

    const brand = document.querySelector("#home header .tag");
    if (brand) {
      const badge = document.createElement("span");
      badge.className = "tag shkr-dev-badge"; badge.id = "shkrDevBadge"; badge.textContent = "dev"; badge.title = "Developer build";
      brand.parentNode.insertBefore(badge, brand.nextSibling);
    }

    const row = function (label, desc, ctl, descId) {
      return '<div class="set-row"><div class="lbl"><b>' + label + "</b><span" + (descId ? ' id="' + descId + '"' : "") + ">" + desc + "</span></div>" +
        '<div class="set-ctl">' + ctl + "</div></div>";
    };
    const sec = document.createElement("div");
    sec.className = "shkr-dev"; sec.id = "shkrDev";
    sec.innerHTML =
      '<div class="shkr-dev-head"><b>developer</b><span id="shkrDevNow"></span></div>' +
      row("Unlock all (rainbow)", "Every level unlocked with three rainbow stars.", '<button class="chip" id="shkrDevUnlock">unlock all</button>') +
      row("Reset progress", "Back to a fresh game: level 01 only, no stars, no tries.", '<button class="chip danger" id="shkrDevReset">reset</button>') +
      row("Put progress back", "", '<button class="chip" id="shkrDevBack">put back</button>', "shkrDevSnap");
    const body = document.querySelector("#settings .panel-body");
    if (body) body.appendChild(sec);
    const backBtn = sec.querySelector("#shkrDevBack"), snapEl = sec.querySelector("#shkrDevSnap"), nowEl = sec.querySelector("#shkrDevNow");

    function paintPanel() {
      const s = readSnap();
      nowEl.textContent = "saves to " + DEV_KEY + " · now " + summary(api.S());
      backBtn.disabled = !s;
      snapEl.textContent = s ? "Back to how it was before the last reset or unlock all: " + summary(s) + "."
        : "No snapshot yet. Reset and unlock all take one first.";
    }

    /* ---------------- actions ---------------- */
    sec.querySelector("#shkrDevUnlock").addEventListener("click", function () {
      confirmCard("Unlock everything?", "Every level is unlocked with three rainbow stars. Current progress is snapshotted first, so it can be put back.",
        "unlock all", function () { snapshot(); apply(rainbow(), true); });
    });
    sec.querySelector("#shkrDevReset").addEventListener("click", function () {
      confirmCard("Reset to a fresh game?", "Only level 01 stays unlocked, with no stars and no tries. Current progress is snapshotted first, so it can be put back.",
        "reset", function () { snapshot(); apply(fresh(), true); });
    });
    backBtn.addEventListener("click", function () {
      const s = readSnap(); if (!s) return;
      confirmCard("Put progress back?", "Restores " + summary(s) + ", exactly as it was right before the last reset or unlock all. Current progress is replaced.",
        "put back", function () {
          const snap = readSnap(); if (!snap) return;
          lsDel(SNAP_KEY);
          apply({ unlocked: snap.unlocked, sel: snap.sel, rec: snap.rec }, true);
        });
    });
    /* progress changes while playing, so refresh the panel whenever Settings opens */
    Array.prototype.forEach.call(document.querySelectorAll('[data-go="settings"]'), function (b) { b.addEventListener("click", paintPanel); });

    /* ---------------- soundtrack player ----------------
       A screen of its own (from the developer section) to listen to every track outside a run: the home track and
       the 30 levels, each with its theme's key and instruments, a map of its bars (height = energy, a dot on the bar
       before each combo; click a bar to play from it), and mutes per part (a channel's role in js/themes.js), so one part
       can be judged with the rest out of the way. A mute plays the song again from the current beat without that part's
       notes. The game's own loop keeps calling MUSIC.schedule(); closing the screen goes back to Settings and restarts
       the home track. */
    const NOTE = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
    const TRACKS = [{ n: 0, def: HOME, L: SIM.compile(HOME), loop: true }].concat(LEVELS.map(function (d, i) { return { n: i + 1, def: d, L: api.getL(i + 1), loop: false }; }));
    const PARTS = ["lead", "answer", "harmony", "bass", "drums", "fx"];
    /* a note belongs to its channel's role */
    function partOf(e, S) { return (S.theme.channels[e.c] || {}).role || "fx"; }
    /* a theme's instruments by role: "flute" or "guitar (nylon)" */
    function roleList(T, r) { return Object.keys(T.channels).filter(function (k) { return T.channels[k].role === r; }).map(function (k) { const c = T.channels[k], ins = c.tone || c.synth || c.drum; return ins === k ? k : k + " (" + ins + ")"; }); }
    const P = { i: 1, playing: false, from: 0, muted: {}, end: "stop", raf: 0 };
    const ENDS = ["stop", "repeat", "next"];
    const snd = document.createElement("section");
    snd.id = "shkrDevSnd"; snd.className = "screen paper";
    snd.innerHTML =
      '<div class="col"><div class="panel-head"><h2 class="panel-title">Soundtracks</h2><button class="chip" id="shkrDevSndClose">close</button></div>' +
      '<div class="panel-body"><div class="shkr-dev-snd-now">' +
        '<span class="tag" id="shkrDevSndTag"></span><div class="shkr-dev-snd-name" id="shkrDevSndName"></div>' +
        '<div class="shkr-dev-snd-spec" id="shkrDevSndSpec"></div>' +
        '<div class="shkr-dev-snd-map" id="shkrDevSndMap" title="click a bar to play from it"></div>' +
        '<div class="shkr-dev-snd-pos" id="shkrDevSndPos"></div>' +
        '<div class="shkr-dev-snd-ctl"><button class="chip" id="shkrDevSndPrev">prev</button><button class="chip solid" id="shkrDevSndPlay">play</button>' +
          '<button class="chip" id="shkrDevSndNext">next</button><button class="chip" id="shkrDevSndEnd"></button></div>' +
        '<div class="shkr-dev-snd-ctl"><span class="tag">mute</span>' + PARTS.map(function (p) { return '<button class="chip" aria-pressed="false" data-part="' + p + '">' + p + "</button>"; }).join("") + "</div>" +
      '</div><div class="shkr-dev-snd-list" id="shkrDevSndList"></div></div></div>';
    document.body.insertBefore(snd, document.getElementById("hud"));
    const $s = function (id) { return snd.querySelector("#" + id); };
    const mapEl = $s("shkrDevSndMap"), posEl = $s("shkrDevSndPos"), playBtn = $s("shkrDevSndPlay"), endBtn = $s("shkrDevSndEnd"), listEl = $s("shkrDevSndList");
    listEl.innerHTML = TRACKS.map(function (t, i) {
      const T = MUSIC._t.themeOf(t.def);
      return '<button class="shkr-dev-snd-row" data-i="' + i + '"><b>' + (t.n ? pad2(t.n) : "home") + "</b><span>" + (t.n ? t.def.name : "Home screen") + "</span><i>" +
        t.def.mu[0] + " · " + NOTE[T.tonic % 12] + " " + T.scale + " · " + (roleList(T, "lead").join(", ") || "no lead") + "</i></button>";
    }).join("");

    function song(t) { return t.S || (t.S = MUSIC.makeSong(t.def, t.L, t.loop)); }
    /* the song without the muted parts' events */
    function mixed(S) {
      const any = PARTS.some(function (p) { return P.muted[p]; });
      if (!any) return S;
      return Object.assign({}, S, { ev: S.ev.filter(function (e) { return !P.muted[partOf(e, S)]; }) });
    }
    function audio() {
      if (!MUSIC.ctx) { if (!MUSIC.init()) return false; MUSIC.setVol(api.S().music); }
      MUSIC.resume(); return true;
    }
    function play(i, beat) {
      if (!audio()) return;
      P.i = (i + TRACKS.length) % TRACKS.length; P.playing = true; P.from = 0;
      MUSIC.start(mixed(song(TRACKS[P.i])), Math.max(0, beat || 0));
      paintTrack();
    }
    function stopPlay() { if (P.playing) MUSIC.stop(.25); P.playing = false; P.from = 0; paintPos(); playBtn.textContent = "play"; }
    function here() { const b = P.playing && MUSIC.song ? MUSIC.beat() : P.from; return Math.max(0, b || 0); }
    function paintTrack() {
      const t = TRACKS[P.i], S = song(t), T = S.theme, list = [];
      $s("shkrDevSndTag").textContent = t.n ? "level " + pad2(t.n) : "home screen · loops";
      $s("shkrDevSndName").textContent = t.n ? t.def.name : "Home";
      /* its key, scale and instruments by role */
      list.push(T.bpm + " bpm", NOTE[T.tonic % 12] + " " + T.scale);
      PARTS.forEach(function (r) { const l = roleList(T, r); if (l.length) list.push(r + " " + l.join(", ")); });
      list.push("reverb " + (T.reverb ? T.reverb.seconds : 2.4) + " s" + (T.swing ? " · swing " + T.swing : ""), "level " + T.level);
      $s("shkrDevSndSpec").textContent = list.join(" · ");
      let h = "";
      for (let b = 0; b < S.bars; b++) {
        let a = 0; for (let c = 0; c < 8; c++) if (S.chart[b * 8 + c]) a++;
        h += '<i data-bar="' + b + '" class="' + (S.combo[b + 1] ? "cb" : "") + '" style="height:' + (18 + S.energy[b] * 20) + '%" title="bar ' + (b + 1) + " · energy " + S.energy[b] + " · " + a + " action" + (a === 1 ? "" : "s") + (S.combo[b + 1] ? " · combo next" : "") + '"></i>';
      }
      mapEl.innerHTML = h;
      Array.prototype.forEach.call(listEl.children, function (el, k) { el.classList.toggle("on", k === P.i); });
      playBtn.textContent = P.playing ? "stop" : "play";
      paintPos();
    }
    function clock(sec) { const s = Math.max(0, Math.floor(sec)); return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60); }
    let lastBar = -1;
    function paintPos() {
      const t = TRACKS[P.i], S = song(t), b = here(), bar = Math.floor(b / 4), inBar = t.loop ? bar % S.bars : Math.min(bar, S.bars - 1);
      const pass = t.loop ? " · pass " + (Math.floor(bar / S.bars) % 4 + 1) + " / 4" : "";
      const sec = t.loop ? (b * S.spb) % (S.cycle * S.spb) : b * S.spb, total = (t.loop ? S.cycle : S.bars * 4) * S.spb;
      posEl.textContent = "bar " + pad2(inBar + 1) + " / " + S.bars + pass + " · " + clock(sec) + " / " + clock(total) + " · energy " + S.energy[inBar] + (P.playing ? "" : " · stopped");
      if (inBar !== lastBar || !P.playing) {
        lastBar = inBar;
        Array.prototype.forEach.call(mapEl.children, function (el, k) { el.classList.toggle("on", k === inBar && (P.playing || P.from > 0)); });
      }
    }
    function tick() {
      P.raf = requestAnimationFrame(tick);
      if (!P.playing) return;
      const t = TRACKS[P.i], S = song(t);
      if (!MUSIC.song) { stopPlay(); return; }   /* something else stopped the music (a hidden tab does not: it only suspends) */
      if (!t.loop && here() > S.bars * 4 + 4) {
        if (P.end === "repeat") play(P.i, 0); else if (P.end === "next") play(P.i + 1, 0); else stopPlay();
      }
      paintPos();
    }
    function paintEnd() { endBtn.textContent = "at end: " + P.end; }
    function openSnd() {
      if (P.raf) return;
      api.show(""); snd.classList.add("on");
      MUSIC.stop(.3); P.playing = false; P.i = Math.max(0, Math.min(TRACKS.length - 1, api.S().sel)); P.from = 0;
      paintEnd(); paintTrack(); tick();
    }
    function closeSnd() {
      if (!P.raf) return;
      cancelAnimationFrame(P.raf); P.raf = 0;
      if (P.playing) MUSIC.stop(.2); P.playing = false;
      snd.classList.remove("on"); api.show("settings"); api.startHome();
    }
    $s("shkrDevSndClose").addEventListener("click", closeSnd);
    playBtn.addEventListener("click", function () { if (P.playing) stopPlay(); else play(P.i, P.from); });
    $s("shkrDevSndPrev").addEventListener("click", function () { if (P.playing) play(P.i - 1, 0); else { P.i = (P.i + TRACKS.length - 1) % TRACKS.length; P.from = 0; paintTrack(); } });
    $s("shkrDevSndNext").addEventListener("click", function () { if (P.playing) play(P.i + 1, 0); else { P.i = (P.i + 1) % TRACKS.length; P.from = 0; paintTrack(); } });
    endBtn.addEventListener("click", function () { P.end = ENDS[(ENDS.indexOf(P.end) + 1) % ENDS.length]; paintEnd(); });
    listEl.addEventListener("click", function (e) { const r = e.target.closest("[data-i]"); if (r) play(+r.dataset.i, 0); });
    mapEl.addEventListener("click", function (e) {
      const el = e.target.closest("[data-bar]"); if (!el) return;
      const bar = +el.dataset.bar, t = TRACKS[P.i];
      /* on the home loop, the same bar in the pass that is playing now */
      const base = t.loop && P.playing ? Math.floor(here() / 4 / song(t).bars) * song(t).bars : 0;
      if (P.playing) play(P.i, (base + bar) * 4); else { P.from = bar * 4; paintPos(); }
    });
    Array.prototype.forEach.call(snd.querySelectorAll("[data-part]"), function (b) {
      b.addEventListener("click", function () {
        const p = b.dataset.part; P.muted[p] = !P.muted[p]; b.setAttribute("aria-pressed", P.muted[p] ? "true" : "false");
        if (P.playing) play(P.i, here());
      });
    });
    /* keys while the screen is up: space plays / stops, ← → change track, Esc closes */
    window.addEventListener("keydown", function (e) {
      if (!P.raf || api.G.cardUp) return;
      if (e.code === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); closeSnd(); }
      else if (e.code === "Space") { e.preventDefault(); e.stopImmediatePropagation(); playBtn.click(); }
      else if (e.code === "ArrowLeft") { e.preventDefault(); $s("shkrDevSndPrev").click(); }
      else if (e.code === "ArrowRight") { e.preventDefault(); $s("shkrDevSndNext").click(); }
    }, true);
    const sndRow = document.createElement("div");
    sndRow.innerHTML = row("Soundtracks", "Listen to every level's music outside a run: its theme, a map of its bars to jump around in, and mutes per part.",
      '<button class="chip" id="shkrDevSndOpen">open</button>');
    sec.appendChild(sndRow.firstChild);
    sec.querySelector("#shkrDevSndOpen").addEventListener("click", openSnd);

    /* ---------------- default developer state ---------------- */
    if (lsGet(DEV_KEY) === null) apply(rainbow(), false);
    else paintPanel();
  };
})();
