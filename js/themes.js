/* ---- themes.js ---- */
/* ============================================================================
   THEMES — the composed music, written by hand in the notation of
   js/synth.js (hiyroscript/alva's): melodies in scale degrees, chord-relative
   lines, a chord a bar, drum rhythms a character a sixteenth.

   THEMES[n] is level n's theme (0 is the home screen). A theme has its tempo
   (always the level's own bpm: tempo is gameplay), tonic (the MIDI note of
   degree 1), scale, swing, reverb and delay, its channels (an instrument with
   its level, pan, octave and sends, and its role (what a mute in the track player takes out):
   lead, answer, harmony, bass, drums or fx), its parts and its sections.
   `form` is the level's sections in order: their bars add up to the level's,
   and they follow its energy (intro, groove, build, peak, breather, climax,
   outro). `end` is the closing sting after the last bar. The home theme has
   `loop` instead, played round and round, each pass (`passes` of them)
   taking the next entry of a channel's list. A level with no theme here
   still plays the generated music of js/music.js.
   ========================================================================== */
const THEMES = (function () {
  "use strict";

  /* ---------------- helpers for the longer forms ----------------
     fit(n, lines, last): a melody's bars taken in turn to fill n bars, its last bar(s) replaced by `last` (a cadence),
     so a section of any length ends on a phrase ending; prog(n, chords, last): the same for its chords. build(t)
     turns a theme written as `song`, a list of sections [name, bars, chords, play, options], into the usual form:
     a play entry mel(lines, last, { vel, octave, shift }) becomes a part of its own, fitted to its section; the
     section named "end" is the closing sting. */
  function bars(s) { return s.split("|").map(function (x) { return x.trim(); }).filter(Boolean); }
  function fit(n, lines, last) {
    const pool = [].concat.apply([], lines.map(bars)), out = [];
    for (let i = 0; i < n; i++) out.push(pool[i % pool.length]);
    if (last) { const l = bars(last); for (let i = 0; i < l.length && i < n; i++) out[n - l.length + i] = l[i]; }
    return out.join(" | ");
  }
  function prog(n, chords, last) {
    const p = chords.split(/\s+/), out = [];
    for (let i = 0; i < n; i++) out.push(p[i % p.length]);
    if (last) { const l = last.split(/\s+/); for (let i = 0; i < l.length && i < n; i++) out[n - l.length + i] = l[i]; }
    return out.join(" ");
  }
  function mel(lines, last, opt) { return Object.assign({ fit: [].concat(lines), last: last }, opt || {}); }
  function build(t) {
    const th = Object.assign({}, t, { parts: Object.assign({}, t.parts), sections: {} }), form = [];
    t.song.forEach(function (s) {
      const name = s[0], n = s[1], o = s[4] || {}, play = {};
      Object.keys(s[3]).forEach(function (ch) {
        const one = function (e, k) {
          if (!e || !e.fit) return e;
          const key = name + "_" + ch + (k ? "_" + k : "");
          th.parts[key] = { melody: fit(n, e.fit, e.last) };
          const out = { part: key };
          ["vel", "octave", "shift"].forEach(function (f) { if (e[f] !== undefined) out[f] = e[f]; });
          return out;
        };
        const v = s[3][ch];
        play[ch] = Array.isArray(v) ? v.map(one) : one(v, 0);
      });
      th.sections[name] = { bars: n, chords: prog(n, s[2], o.end), play: play, crash: !!o.crash, fill: o.fill || null, riser: o.riser || 0 };
      if (name !== "end") form.push(name);
    });
    th.form = form; th.end = "end"; delete th.song;
    return th;
  }

  /* ---------------- 0 · Home: a dreamy lull in E Lydian ----------------
     A felt piano carries the hook (the Lydian colour is the F# major chord),
     a celesta joins it later, a harp ripples under a soft string pad,
     brushes come in on the second pass and leave on the last. Calm enough
     to sit on for minutes: four passes, each a little different. */
  const homeHook = ">5:4 6:2 5:2 >3:6 2:2 | >2:4 4:2 5:2 >6:8 | >5:4 3:2 1:2 >3:6 5:2 | >4:4 2:4 >5,:8 | " +
    ">8:4 7:2 6:2 >5:6 3:2 | >4:4 5:2 6:2 >9:8 | >8:4 7:2 5:2 >7:6 5:2 | >6:4 5:4 >2:8";
  const home = {
    bpm: 100, tonic: 64, scale: "lydian", swing: 0.04, level: 0.9,
    reverb: { seconds: 3, damp: 0.5, level: 0.9 }, delay: { beats: 0.75, feedback: 0.3, level: 0.6 },
    channels: {
      piano: { tone: "piano", octave: 0, gain: .608, pan: 0.05, reverb: 0.35, delay: 0.12, role: "lead" },
      celesta: { tone: "celesta", octave: 1, gain: .184, pan: 0.3, reverb: 0.45, delay: 0.3, role: "answer" },
      harp: { tone: "harp", octave: -1, gain: .569, pan: -0.3, reverb: 0.45, ring: true, role: "harmony" },
      strings: { synth: "strings", octave: -1, gain: .978, pan: 0.1, reverb: 0.5, role: "harmony", params: { level: 0.1, cutoff: 2000, attack: 0.6, release: 0.9 } },
      bass: { synth: "bass", octave: -2, gain: 0.32, role: "bass", params: { wave: "triangle", cutoff: 380, level: 0.36, decay: 0.4, sustain: 0.6, sub: 1 } },
      kick: { drum: "kick", opts: { deep: true, punch: 0.4 }, gain: 0.16, role: "drums" },
      brush: { drum: "brush", gain: 0.2, pan: 0.1, reverb: 0.2, role: "drums" },
      shaker: { drum: "shaker", gain: 0.16, pan: 0.35, role: "drums" }
    },
    parts: {
      hook: { melody: homeHook },
      bMel: { melody: ">3:8 2:4 1:4 | >2:8 5,:8 | >3:4 5:4 8:8 | >9:16 | >8:8 6:4 5:4 | >5:8 4:8 | >3:4 2:4 5,:8 | >2:16" },
      harpArp: { line: "R:2 5:2 8:2 10:2 12:2 10:2 8:2 5:2" },
      harpSlow: { line: "R:4 5:4 8:4 10:4" },
      pads: { chord: 16 },
      bassA: { line: ">R:8 5,:8" },
      bassB: { line: ">R:6 R:2 5,:4 8,:4" },
      brushes: { beat: { kick: "X.......x.......", brush: "....x.......x...", shaker: "o.x.o.x.o.x.o.x." } },
      brushes2: { beat: { kick: "X.......X..x....", brush: "....x..o....x...", shaker: "xoxoxoxoxoxoxoxo" } },
      fill: { beat: { kick: "X.......X.......", brush: "........x.x.xxXx" } }
    },
    sections: {
      A: { bars: 8, chords: "1 2 6 5 1 2 3 5",
        play: { piano: "hook", strings: "pads", harp: ["harpSlow", "harpArp", "harpArp", "harpSlow"], bass: [null, "bassA", "bassB", "bassA"],
          celesta: [null, null, { part: "hook", vel: 0.7 }, null], beat: [null, "brushes", "brushes2", null] } },
      B: { bars: 8, chords: "6 5 1 2 6 5 3 2",
        play: { celesta: [{ part: "bMel", vel: 0.8 }, "bMel", "bMel", { part: "bMel", vel: 0.8 }], piano: [null, { part: "bMel", octave: -1, vel: 0.55 }, null, null],
          strings: "pads", harp: "harpArp", bass: [null, "bassB", "bassB", null], beat: [null, "brushes", "brushes2", null] } }
    },
    loop: ["A", "B"], passes: 4
  };

  /* ---------------- 1 · Whispering Pines: folk, in E major ----------------
     A wooden flute sings the hook over a nylon guitar picked in eighths and
     an upright bass; brushes, a soft kick and a shaker keep it walking; a
     whistle answers like a bird in the gaps; strings open up for the peak
     and the climax, where the whistle doubles the hook an octave up. Wind
     blows through the intro. 28 bars: 2 intro, 6 groove, 7 build, 4 peak,
     1 breather, 4 climax, 1 + 2 + 1 outro, then the harp's last chord. */
  const pinesHook = ">3:4 2:2 1:2 >5:6 3:2 | >2:4 1:2 7,:2 >5,:8 | >6,:2 1:2 3:4 >2:4 1:2 3:2 | >4:6 3:2 >1:8";
  const pines = {
    bpm: 112, tonic: 64, scale: "ionian", swing: 0.06, level: 0.87,
    reverb: { seconds: 2.2, damp: 0.55, level: 0.8 }, delay: { beats: 0.75, feedback: 0.28, level: 0.5 },
    channels: {
      flute: { synth: "flute", octave: 0, gain: .519, pan: 0.06, reverb: 0.3, delay: 0.14, role: "lead", params: { level: 0.2, cutoff: 2600, vibrato: 12, breath: 0.14 } },
      whistle: { synth: "flute", octave: 1, gain: .872, pan: -0.32, reverb: 0.4, delay: 0.25, role: "answer", params: { level: 0.15, cutoff: 4200, vibrato: 16, breath: 0.07, attack: 0.02 } },
      guitar: { tone: "nylon", octave: -1, gain: .819, pan: -0.22, reverb: 0.22, ring: true, role: "harmony" },
      strings: { synth: "strings", octave: -1, gain: .975, pan: 0.15, reverb: 0.45, role: "harmony", params: { level: 0.1, cutoff: 2200, attack: 0.5, release: 0.8 } },
      harp: { tone: "harp", octave: -1, gain: .78, pan: -0.15, reverb: 0.5, ring: true, role: "harmony" },
      bass: { tone: "upright", octave: -2, gain: 1.18, role: "bass" },
      kick: { drum: "kick", opts: { deep: true, punch: 0.4 }, gain: 0.17, role: "drums" },
      brush: { drum: "brush", gain: 0.24, pan: 0.1, reverb: 0.18, role: "drums" },
      shaker: { drum: "shaker", gain: 0.17, pan: 0.35, role: "drums" },
      rim: { drum: "rim", gain: 0.12, pan: -0.2, role: "drums" },
      riq: { drum: "riq", gain: 0.1, pan: -0.35, role: "drums" },
      crash: { drum: "crash", gain: 0.12, pan: 0.2, reverb: 0.3, role: "drums" },
      riser: { synth: "riser", octave: -1, gain: 0.5, reverb: 0.3, role: "fx", params: { level: 0.1, top: 4000 } },
      wind: { synth: "swell", gain: 0.7, pan: -0.2, reverb: 0.5, role: "fx", params: { level: 0.07 } }
    },
    parts: {
      hook6: { melody: pinesHook + " | >3:4 5:4 >6:4 5:4 | >5:16" },
      hook7: { melody: pinesHook + " | >6:4 5:2 4:2 >2:8 | >4:4 3:2 4:2 >6:8 | >5:16" },
      hook: { melody: pinesHook },
      bMel: { melody: ">6:8 5:4 3:4 | >4:8 3:4 1:4 | >3:4 5:4 8:6 7:2 | >5:16" },
      frag: { melody: ">4:6 3:2 >1:8" },
      tagMel: { melody: ">8:6 7:2 >6:8" },
      outroMel: { melody: ">4:6 3:2 >2:8 | >3:4 2:2 1:2 >1:8" },
      lastMel: { melody: ">2:8 7,:8" },
      endNote: { melody: ">1:16" },
      birds: { melody: ".:12 >5:1 6:1 5:2 | .:16 | .:12 >6:1 8:1 6:2 | .:16" },
      birdsIntro: { melody: ".:8 >5:1 6:1 5:2 .:4 | .:4 >8:1 6:1 .:10" },
      pick: { line: "R:2 5:2 8:2 10:2 12:2 10:2 8:2 5:2" },
      pickLite: { line: "R:4 8:4 10:4 8:4" },
      harpRoll: { line: "R:1 3:1 5:1 8:1 10:1 12:11" },
      pads: { chord: 16 },
      bassA: { line: ">R:6 R:2 5,:8" },
      bassWalk: { line: ">R:4 5,:4 R:4 3:4" },
      bassEnd: { line: ">R:16" },
      gust: { hold: 1, len: 32, every: 32 },
      light: { beat: { kick: "X.......x.......", shaker: "o.x.o.x.o.x.o.x." } },
      groove: { beat: { kick: "X.......X..x....", brush: "....X.......X...", shaker: "o.x.o.x.o.x.o.x.", rim: "..........x....." } },
      groove2: { beat: { kick: "X.....x.X..x....", brush: "....X..o....X..o", shaker: "xoxoxoxoxoxoxoxo" } },
      full: { beat: { kick: "X.....x.X.x.....", brush: "....X..o....X.oo", shaker: "xoxoxoxoxoxoxoxo", riq: "..x...x...x...x." } },
      fill: { beat: { kick: "X.......X.......", brush: "........x.x.XxXx" } },
      breath: { beat: { shaker: "o...o...o...o..." } },
      last: { beat: { kick: "X..............." } }
    },
    sections: {
      intro: { bars: 2, chords: "1 4", play: { guitar: "pickLite", wind: "gust", whistle: { part: "birdsIntro", vel: 0.7 } } },
      A: { bars: 6, chords: "1 5 6 4 1 5", fill: "fill", play: { flute: "hook6", guitar: "pick", bass: "bassA", beat: "light", wind: "gust" } },
      B: { bars: 7, chords: "1 5 6 4 2 4 5", crash: true, fill: "fill", play: { flute: "hook7", whistle: { part: "birds", vel: 0.8 }, guitar: "pick", bass: "bassA", beat: "groove" } },
      C: { bars: 4, chords: "6 4 1 5", play: { flute: "bMel", strings: "pads", guitar: "pick", bass: "bassWalk", beat: "groove2" } },
      brk: { bars: 1, chords: "4", riser: 1, play: { flute: "frag", guitar: "pickLite", beat: "breath" } },
      D: { bars: 4, chords: "1 5 6 4", crash: true, play: { flute: "hook", whistle: { part: "hook", vel: 0.5 }, strings: "pads", guitar: "pick", bass: "bassWalk", beat: "full" } },
      tag: { bars: 1, chords: "6", play: { flute: "tagMel", strings: "pads", guitar: "pick", bass: "bassA", beat: "groove2" } },
      outro: { bars: 2, chords: "4 1", play: { flute: "outroMel", guitar: "pick", bass: "bassA", beat: "groove", wind: "gust" } },
      lastBar: { bars: 1, chords: "5", play: { flute: "lastMel", guitar: "pickLite", beat: "light" } },
      end: { bars: 1, chords: "1", play: { harp: "harpRoll", strings: "pads", bass: "bassEnd", flute: "endNote", beat: "last" } }
    },
    form: ["intro", "A", "B", "C", "brk", "D", "tag", "outro", "lastBar"], end: "end"
  };

  /* ---------------- 2 · Midnight Rooftops: lo-fi night, in F minor ----------------
     A vibraphone plays the lazy hook between the beats, a Rhodes lays down
     ninth and seventh chords in syncopated stabs, a round bass walks under a
     swung boom-bap kit with rim and snaps; a warm pad and a low city hum
     come and go. 29 bars: 2 intro, 6 groove, 6 build, 4 peak, 1 breather,
     4 climax, 1 + 2 + 3 outro, then the last chord. */
  const roofHook = ".:2 >5:2 4:2 3:4 .:2 1:4 | .:2 >3:2 4:2 >5:6 3:4 | .:2 >4:2 3:2 1:4 .:2 3:4 | >2:4 3:2 2:2 >7,:8";
  const roof = {
    bpm: 116, tonic: 65, scale: "aeolian", swing: 0.22, level: 0.87,
    reverb: { seconds: 1.9, damp: 0.35, level: 0.8 }, delay: { beats: 0.75, feedback: 0.3, level: 0.55 },
    channels: {
      vibes: { tone: "vibes", octave: 0, gain: 0.42, pan: 0.12, reverb: 0.32, delay: 0.22, release: 0.35, role: "lead" },
      rhodes: { tone: "epiano", octave: -1, gain: .215, pan: -0.15, reverb: 0.28, strum: 0.012, release: 0.2, role: "harmony" },
      pad: { synth: "pad", octave: -1, gain: .358, reverb: 0.5, pump: true, role: "harmony", params: { level: 0.08, cutoff: 900, wave: "triangle", attack: 0.6, release: 1 } },
      bass: { synth: "bass", octave: -2, gain: .239, role: "bass", params: { wave: "triangle", cutoff: 420, level: 0.38, decay: 0.3, sustain: 0.6, sub: 1 } },
      kick: { drum: "kick", opts: { punch: 0.7 }, gain: .167, duck: 0.25, role: "drums" },
      snare: { drum: "snare", gain: .167, reverb: 0.22, role: "drums" },
      hat: { drum: "hat", gain: .0834, pan: 0.3, role: "drums" },
      rim: { drum: "rim", gain: .0986, pan: -0.25, role: "drums" },
      snap: { drum: "snap", gain: .114, pan: 0.2, reverb: 0.3, role: "drums" },
      crash: { drum: "crash", gain: .0683, pan: 0.2, reverb: 0.3, role: "drums" },
      riser: { synth: "riser", octave: -1, gain: 0.45, reverb: 0.3, role: "fx", params: { level: 0.1, top: 3500 } },
      hum: { synth: "drone", octave: -2, gain: 0.5, role: "fx", params: { cutoff: 240, level: 0.06, fifth: false, rate: 0.07 } }
    },
    parts: {
      hookTag: { melody: roofHook + " | >5:4 4:2 3:2 >1:8 | .:16" },
      hookB: { melody: roofHook + " | >4:4 3:2 4:2 >5:8 | >7:4 5:4 >2:8" },
      hook: { melody: roofHook },
      answer: { melody: ">8:4 7:2 5:2 >6:8 | >5:4 4:2 3:2 >4:8 | >3:4 4:2 5:2 >6:4 5:4 | >4:4 3:4 >2:8" },
      introLick: { melody: ".:8 >5:2 4:2 3:4 | .:4 >1:4 3:8" },
      frag: { melody: ".:2 >5:2 4:2 3:10" },
      tagMel: { melody: ">8:6 7:2 >5:8" },
      outroMel: { melody: ".:2 >4:2 3:2 1:10 | .:2 >2:2 3:2 >5:10" },
      lastMel: { melody: ">5:4 4:2 3:2 >1:8 | .:16 | .:8 >5:2 3:2 >1:4" },
      endNote: { melody: ">1:16" },
      stabs: { chord: 6, rhythm: "X.....x.....x..." },
      stabsLite: { chord: 8, rhythm: "x.......x......." },
      held: { chord: 16 },
      pads: { chord: 16 },
      bassA: { line: ">R:6 R:2 .:2 5,:2 R:4" },
      bassB: { line: ">R:4 .:2 R:2 8:2 5:2 3:4" },
      bassEnd: { line: ">R:16" },
      hum: { hold: 1, len: 32, every: 32 },
      lofiA: { beat: { kick: "X.........X.....", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." } },
      lofiB: { beat: { kick: "X.........X..x..", snare: "....X..o....X...", hat: "x.xox.x.x.xox.x.", rim: "..........x....." } },
      lofiC: { beat: { kick: "X..x......X..x..", snare: "....X..o.o..X..o", hat: "xoxoxoxoxoxoxoxo", snap: "....x.......x..." } },
      lofiD: { beat: { kick: "X..x..x...X..x..", snare: "....X..o.o..X.oo", hat: "xoxoxoxoxoxoxoxo", snap: "....X.......X..." } },
      fill: { beat: { kick: "X.........X.....", snare: "........X..oX.oo", hat: "x.x.x.x........." } },
      half: { beat: { kick: "X...............", rim: "........x......." } },
      last: { beat: { kick: "X..............." } }
    },
    sections: {
      intro: { bars: 2, chords: "1add9 67", play: { rhodes: "held", hum: "hum", vibes: { part: "introLick", vel: 0.8 } } },
      A: { bars: 6, chords: "1add9 67 47 57 1add9 67", fill: "fill", play: { vibes: "hookTag", rhodes: "stabsLite", bass: "bassA", beat: "lofiA", hum: "hum" } },
      B: { bars: 6, chords: "1add9 67 47 57 47 57", crash: true, fill: "fill", play: { vibes: "hookB", rhodes: "stabs", bass: "bassA", beat: "lofiB" } },
      C: { bars: 4, chords: "67 47 1add9 57", play: { vibes: "answer", rhodes: "stabs", pad: "pads", bass: "bassB", beat: "lofiC" } },
      brk: { bars: 1, chords: "47", riser: 1, play: { vibes: "frag", rhodes: "held", beat: "half" } },
      D: { bars: 4, chords: "1add9 67 47 57", crash: true, play: { vibes: "hook", rhodes: "stabs", pad: "pads", bass: "bassB", beat: "lofiD" } },
      tag: { bars: 1, chords: "67", play: { vibes: "tagMel", rhodes: "stabs", pad: "pads", bass: "bassA", beat: "lofiC" } },
      outro: { bars: 2, chords: "47 57", play: { vibes: "outroMel", rhodes: "stabs", bass: "bassA", beat: "lofiB" } },
      lastBars: { bars: 3, chords: "1add9 67 1add9", play: { vibes: "lastMel", rhodes: "stabsLite", bass: "bassA", beat: "lofiA", hum: "hum" } },
      end: { bars: 1, chords: "1add9", play: { rhodes: "held", pad: "pads", bass: "bassEnd", vibes: "endNote", beat: "last" } }
    },
    form: ["intro", "A", "B", "C", "brk", "D", "tag", "outro", "lastBars"], end: "end"
  };

  /* ---------------- 3 · Lantern Harbor: a sea shanty, in D Mixolydian ----------------
     An accordion sings the hook in the shanty's 3-3-2, a tin whistle answers
     it, a guitar strums the same lilt, a tuba keeps the oom-pah; stomps,
     a frame drum, claps and a tambourine come in section by section, the
     sea swells through the intro. 30 bars: 2 intro, 6 groove, 6 build,
     4 peak, 1 breather, 4 climax, 1 + 4 + 2 outro, then the last chord. */
  const harborHook = ">1:3 1:3 3:2 >5:4 3:4 | >7,:3 7,:3 2:2 >4:4 2:4 | >1:3 3:3 5:2 >8:4 7:2 5:2 | >6:3 5:3 4:2 >2:8";
  const harborB = ">4:3 5:3 6:2 >8:8 | >5:3 3:3 1:2 >5:8 | >7,:3 2:3 4:2 >7:8 | >5:4 3:4 >1:8";
  const harbor = {
    bpm: 120, tonic: 62, scale: "mixolydian", swing: 0, level: 0.87,
    reverb: { seconds: 1.6, damp: 0.6, level: 0.75 }, delay: { beats: 1, feedback: 0.25, level: 0.4 },
    channels: {
      accordion: { synth: "reed", octave: 0, gain: .973, pan: 0.08, reverb: 0.25, delay: 0.08, role: "lead", params: { level: 0.13, cutoff: 2600, detune: 8 } },
      whistle: { synth: "flute", octave: 1, gain: .889, pan: -0.3, reverb: 0.35, delay: 0.15, role: "answer", params: { level: 0.14, cutoff: 4500, vibrato: 18, breath: 0.07, attack: 0.015 } },
      guitar: { tone: "nylon", octave: -1, gain: .736, pan: -0.25, reverb: 0.2, strum: 0.018, release: 0.12, role: "harmony" },
      squeeze: { synth: "reed", octave: -1, gain: 1.23, pan: 0.25, reverb: 0.2, role: "harmony", params: { level: 0.08, cutoff: 1800, detune: 6 } },
      tuba: { synth: "brass", octave: -2, gain: .371, role: "bass", params: { level: 0.3, bright: 0.45, attack: 0.03 } },
      kick: { drum: "kick", opts: { deep: true, punch: 0.4 }, gain: .126, role: "drums" },
      frame: { drum: "frame", gain: .158, pan: -0.1, reverb: 0.2, role: "drums" },
      clap: { drum: "clap", gain: .107, pan: 0.15, reverb: 0.25, role: "drums" },
      riq: { drum: "riq", gain: .082, pan: 0.35, role: "drums" },
      crash: { drum: "crash", gain: .0631, pan: 0.2, reverb: 0.3, role: "drums" },
      riser: { synth: "riser", octave: -1, gain: 0.45, reverb: 0.3, role: "fx", params: { level: 0.1, top: 4000 } },
      sea: { synth: "swell", gain: 0.6, pan: 0.2, reverb: 0.5, role: "fx", params: { level: 0.07 } }
    },
    parts: {
      hookA6: { melody: harborHook + " | >3:3 2:3 1:2 >5,:8 | >1:16" },
      hookB6: { melody: harborHook + " | >4:3 5:3 6:2 >5:8 | >2:4 1:4 >2:8" },
      hook: { melody: harborHook },
      bMel: { melody: harborB },
      whistleFill: { melody: ".:8 >5:2 6:2 5:4 | .:16 | .:8 >8:2 7:2 5:4 | .:16" },
      introLine: { melody: ".:8 >5:3 6:3 5:2 | >3:8 2:8" },
      frag: { melody: ">7,:3 2:3 4:2 >5:8" },
      tagMel: { melody: ">8:8 6:8" },
      lastMel: { melody: ">2:8 1:8 | >1:16" },
      endNote: { melody: ">1:16" },
      strum: { chord: 3, rhythm: "X..x..x.X..x..x." },
      strumLite: { chord: 8, rhythm: "x.......x......." },
      oompah: { chord: 2, rhythm: "....x.......x..." },
      held: { chord: 16 },
      tubaA: { line: ">R:6 .:2 5,:6 .:2" },
      tubaEnd: { line: ">R:16" },
      sea: { hold: 1, len: 32, every: 32 },
      stomp: { beat: { kick: "X.....X.....X...", clap: "....x.......x..." } },
      shantyB: { beat: { kick: "X.....X.....X...", frame: "x..o..x..o..x.o.", clap: "....x.......x...", riq: "..x...x...x...x." } },
      shantyC: { beat: { kick: "X..x..X.....X...", frame: "x..o..x..o..x.o.", clap: "....X.......X...", riq: "x.x.x.x.x.x.x.x." } },
      shantyD: { beat: { kick: "X..x..X..x..X.x.", frame: "X..o..x..o..x.o.", clap: "....X..x....X..x", riq: "xoxoxoxoxoxoxoxo" } },
      fill: { beat: { kick: "X.....X.........", frame: "........x.x.XxXx" } },
      breath: { beat: { frame: "X.........x....." } },
      last: { beat: { kick: "X...............", frame: "X..............." } }
    },
    sections: {
      intro: { bars: 2, chords: "1 7", play: { squeeze: "held", sea: "sea", whistle: { part: "introLine", vel: 0.7 } } },
      A: { bars: 6, chords: "1 7 1 5 1 1", fill: "fill", play: { accordion: "hookA6", guitar: "strumLite", tuba: "tubaA", beat: "stomp", sea: "sea" } },
      B: { bars: 6, chords: "1 7 1 5 4 5", crash: true, fill: "fill", play: { accordion: "hookB6", whistle: { part: "whistleFill", vel: 0.8 }, guitar: "strum", squeeze: "oompah", tuba: "tubaA", beat: "shantyB" } },
      C: { bars: 4, chords: "4 1 7 1", play: { accordion: "bMel", guitar: "strum", squeeze: "oompah", tuba: "tubaA", beat: "shantyC" } },
      brk: { bars: 1, chords: "7", riser: 1, play: { accordion: "frag", squeeze: "held", beat: "breath" } },
      D: { bars: 4, chords: "1 7 1 5", crash: true, play: { accordion: "hook", whistle: { part: "hook", vel: 0.5 }, guitar: "strum", squeeze: "oompah", tuba: "tubaA", beat: "shantyD" } },
      tag: { bars: 1, chords: "4", play: { accordion: "tagMel", guitar: "strum", tuba: "tubaA", beat: "shantyC" } },
      outro: { bars: 4, chords: "4 1 7 1", play: { whistle: { part: "bMel", octave: -1, vel: 0.8 }, accordion: { part: "bMel", shift: -2, vel: 0.6 }, guitar: "strum", tuba: "tubaA", beat: "shantyB" } },
      lastBars: { bars: 2, chords: "5 1", play: { accordion: "lastMel", guitar: "strumLite", tuba: "tubaA", beat: "stomp", sea: "sea" } },
      end: { bars: 1, chords: "1", play: { squeeze: "held", guitar: { part: "held" }, tuba: "tubaEnd", accordion: "endNote", beat: "last" } }
    },
    form: ["intro", "A", "B", "C", "brk", "D", "tag", "outro", "lastBars"], end: "end"
  };


  /* drum lines most kits share: a crash, a riser, a fill's last kick */
  const CRASH = { drum: "crash", gain: 0.1, pan: 0.2, reverb: 0.3, role: "drums" };
  const RISER = { synth: "riser", octave: -1, gain: 0.45, reverb: 0.3, role: "fx", params: { level: 0.1, top: 4000 } };
  const ROLL = "R:1 3:1 5:1 8:1 10:1 12:11";

  /* ---------------- 4 · Clockwork Attic: a music box in Eb Dorian ----------------
     A music box plays a quirky, ticking hook; a harpsichord answers and doubles it; pizzicato strings pluck an
     ostinato; the percussion is a clock (tick and tock), a woodblock and a rim, a pendulum's light swing. 31 bars. */
  const atticHook = ">5:2 3:2 1:2 3:2 >5:2 6:2 5:4 | >6:2 4:2 3:2 4:2 >6:4 .:4 | >5:2 3:2 1:2 3:2 >5:2 8:2 7:2 5:2 | >4:2 3:2 2:2 3:2 >4:8";
  const atticHook2 = ">8:2 7:2 5:2 7:2 >8:4 6:4 | >6:2 4:2 6:2 8:2 >6:8 | >5:2 4:2 3:2 2:2 >1:4 3:4 | >2:4 7,:4 >1:8";
  const atticB = ">3:4 5:4 8:4 7:4 | >4:4 6:4 8:4 6:4 | >5:4 4:4 2:4 4:4 | >5:16";
  const attic = build({
    bpm: 124, tonic: 63, scale: "dorian", swing: 0.1, level: 0.812,
    reverb: { seconds: 1.3, damp: 0.6, level: 0.75 }, delay: { beats: 0.5, feedback: 0.25, level: 0.45 },
    channels: {
      box: { tone: "musicbox", octave: 1, gain: .548, pan: 0.1, reverb: 0.3, delay: 0.18, role: "lead" },
      harpsi: { tone: "harpsi", octave: 0, gain: 1.01, pan: -0.25, reverb: 0.22, role: "answer" },
      pizz: { tone: "pizz", octave: -1, gain: 1.38, pan: 0.25, reverb: 0.2, role: "harmony" },
      strings: { synth: "strings", octave: -1, gain: 1.22, pan: -0.1, reverb: 0.4, role: "harmony", params: { level: 0.08, cutoff: 1800, attack: 0.4, release: 0.6 } },
      bass: { tone: "pizz", octave: -2, gain: 1.66, role: "bass" },
      kick: { drum: "kick", opts: { deep: true, punch: 0.3 }, gain: .206, role: "drums" },
      rim: { drum: "rim", gain: .18, pan: -0.2, role: "drums" },
      tick: { drum: "tick", gain: .167, pan: 0.35, role: "drums" },
      tock: { drum: "tick", opts: { low: true }, gain: .167, pan: -0.35, role: "drums" },
      wood: { drum: "wood", gain: .18, pan: 0.2, reverb: 0.15, role: "drums" },
      chain: { drum: "chain", gain: .103, pan: -0.3, role: "drums" },
      crash: CRASH, riser: RISER
    },
    parts: {
      arp: { line: "R:2 5:2 8:2 5:2 10:2 8:2 5:2 8:2" },
      ostinato: { line: ">R:2 5:2 8:2 5:2 R:2 5:2 8:2 5:2" },
      roll: { line: ROLL },
      pads: { chord: 16 },
      bassA: { line: ">R:4 5,:4 R:4 5,:4" },
      bassEnd: { line: ">R:16" },
      tonic: { melody: ">1:16" },
      b0: { beat: { tick: "x...x...x...x...", tock: "..x...x...x...x." } },
      b1: { beat: { kick: "X.......x.......", tick: "X...x...X...x...", tock: "..x...x...x...x." } },
      b2: { beat: { kick: "X.......X.......", rim: "....x.......x...", tick: "X.x.X.x.X.x.X.x.", tock: "..x...x...x...x.", wood: "......x.......x." } },
      b3: { beat: { kick: "X.....x.X.......", rim: "....X.......X..o", tick: "XoxoXoxoXoxoXoxo", wood: "..x..x....x..x.." } },
      b4: { beat: { kick: "X...x...X...x...", rim: "....X..o....X..o", tick: "XoxoXoxoXoxoXoxo", tock: "..x...x...x...x.", wood: "..x..x....x..x..", chain: "..............x." } },
      fill: { beat: { kick: "X.......X.......", wood: "........x.x.xxXX" } },
      brk: { beat: { tick: "x...x...x...x..." } },
      last: { beat: { kick: "X..............." } }
    },
    song: [
      ["intro", 2, "1 7", { harpsi: { part: "arp", vel: 0.7 }, box: mel(".:8 >5:2 3:2 1:4 | .:8 >4:2 3:2 2:4"), beat: "b0" }],
      ["A", 6, "1 4 1 7", { box: mel([atticHook, atticHook2]), pizz: "ostinato", bass: "bassA", beat: "b1" }, { fill: "fill" }],
      ["B", 6, "1 4 1 7", { box: mel([atticHook2, atticHook]), harpsi: { part: "arp", vel: 0.8 }, pizz: "ostinato", bass: "bassA", beat: "b2" }, { crash: true, fill: "fill" }],
      ["C", 4, "3 4 5 1", { harpsi: mel(atticB), box: mel(".:8 >8:2 7:2 5:4", null, { vel: 0.7 }), pizz: "ostinato", strings: "pads", bass: "bassA", beat: "b3" }],
      ["brk", 1, "7", { box: mel(">4:2 3:2 2:2 3:2 >4:8"), pizz: "ostinato", beat: "brk" }, { riser: 1 }],
      ["D", 4, "1 4 1 7", { box: mel(atticHook), harpsi: mel(atticHook, null, { shift: -2, octave: 1, vel: 0.7 }), pizz: "ostinato", strings: "pads", bass: "bassA", beat: "b4" }, { crash: true }],
      ["E", 1, "3", { harpsi: mel(">3:4 5:4 >8:8"), box: mel(".:8 >7:2 5:2 3:4"), pizz: "ostinato", strings: "pads", bass: "bassA", beat: "b3" }],
      ["F", 5, "1 4 1 7", { box: mel([atticHook2, atticHook], ">3:4 2:4 >1:8"), harpsi: { part: "arp", vel: 0.7 }, pizz: "ostinato", bass: "bassA", beat: "b2" }, { end: "1" }],
      ["G", 2, "7 1", { box: mel(">4:4 2:4 >7,:8 | >1:16"), pizz: "ostinato", beat: "b1" }],
      ["end", 1, "1", { harpsi: "roll", box: "tonic", strings: "pads", bass: "bassEnd", beat: "last" }]
    ]
  });

  /* ---------------- 5 · Paper Kite Plains: bright pastoral pop, in G major ----------------
     A recorder's soaring hook over strummed guitar, a glockenspiel sparkling above, a light pop kit with tambourine,
     an airy pad and the wind. 32 bars. */
  const kiteHook = ">1:2 2:2 3:2 5:6 3:2 2:2 | >2:4 5,:4 >7,:6 2:2 | >3:2 5:2 6:2 8:6 6:2 5:2 | >4:4 3:2 2:2 >1:8";
  const kiteHook2 = ">5:2 6:2 8:2 9:6 8:2 6:2 | >7:4 6:2 5:2 >5:8 | >6:2 8:2 9:2 10:6 9:2 8:2 | >8:4 6:2 5:2 >3:8";
  const kiteB = ">6:4 5:4 3:4 5:4 | >4:4 6:4 8:8 | >8:4 7:2 6:2 5:4 3:4 | >2:16";
  const kite = build({
    bpm: 128, tonic: 67, scale: "ionian", swing: 0, level: 0.775,
    reverb: { seconds: 2, damp: 0.45, level: 0.8 }, delay: { beats: 0.75, feedback: 0.3, level: 0.5 },
    channels: {
      recorder: { synth: "flute", octave: 0, gain: .621, pan: 0.05, reverb: 0.3, delay: 0.16, role: "lead", params: { level: 0.2, cutoff: 3600, vibrato: 10, breath: 0.08, attack: 0.025 } },
      glock: { tone: "celesta", octave: 1, gain: .379, pan: 0.32, reverb: 0.4, delay: 0.25, role: "answer" },
      guitar: { tone: "nylon", octave: -1, gain: .916, pan: -0.25, reverb: 0.2, strum: 0.015, release: 0.12, role: "harmony" },
      pad: { synth: "pad", octave: -1, gain: .916, reverb: 0.5, role: "harmony", params: { level: 0.07, cutoff: 1600, wave: "triangle", attack: 0.6, release: 0.9 } },
      bass: { synth: "bass", octave: -2, gain: .267, role: "bass", params: { wave: "triangle", cutoff: 500, level: 0.38, decay: 0.25, sustain: 0.6, sub: 1 } },
      kick: { drum: "kick", opts: { punch: 0.6 }, gain: .18, role: "drums" },
      snare: { drum: "snare", gain: .18, reverb: 0.2, role: "drums" },
      clap: { drum: "clap", gain: .117, reverb: 0.25, role: "drums" },
      hat: { drum: "hat", gain: .0902, pan: 0.3, role: "drums" },
      riq: { drum: "riq", gain: .108, pan: -0.35, role: "drums" },
      shaker: { drum: "shaker", gain: .126, pan: 0.35, role: "drums" },
      crash: CRASH, riser: RISER,
      wind: { synth: "swell", gain: 0.6, pan: -0.2, reverb: 0.5, role: "fx", params: { level: 0.06 } }
    },
    parts: {
      strum: { chord: 2, rhythm: "X..x..x.X.x.x.x." },
      strumLite: { chord: 8, rhythm: "x.......x......." },
      sparkle: { line: "R:2 5:2 8:2 10:2 12:2 10:2 8:2 5:2" },
      roll: { line: ROLL },
      pads: { chord: 16 },
      bassA: { line: ">R:6 R:2 5:4 R:4" },
      bassEnd: { line: ">R:16" },
      tonic: { melody: ">1:16" },
      gust: { hold: 1, len: 32, every: 32 },
      b1: { beat: { kick: "X.......X.......", shaker: "x.x.x.x.x.x.x.x." } },
      b2: { beat: { kick: "X......xX.......", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x.", riq: "....x.......x..." } },
      b3: { beat: { kick: "X..x..x.X.......", snare: "....X.......X...", clap: "....X.......X...", hat: "xoxoxoxoxoxoxoxo", riq: "..x...x...x...x." } },
      b4: { beat: { kick: "X...x...X...x...", snare: "....X.......X...", clap: "....X.......X...", hat: "xoxoxoxoxoxoxoxo", riq: "x.x.x.x.x.x.x.x." } },
      fill: { beat: { kick: "X.......X.......", snare: "........x.x.XXXX" } },
      brk: { beat: { shaker: "x...x...x...x..." } },
      last: { beat: { kick: "X..............." } }
    },
    song: [
      ["intro", 2, "1 4", { guitar: "strumLite", glock: { part: "sparkle", vel: 0.6 }, wind: "gust" }],
      ["A", 5, "1 5 6 4", { recorder: mel(kiteHook, ">3:4 2:4 >1:8"), guitar: "strumLite", bass: "bassA", beat: "b1", wind: "gust" }, { end: "1", fill: "fill" }],
      ["B", 6, "1 5 6 4", { recorder: mel([kiteHook, kiteHook2]), guitar: "strum", bass: "bassA", beat: "b2" }, { crash: true, fill: "fill" }],
      ["C", 5, "6 4 1 5", { recorder: mel(kiteB), glock: { part: "sparkle", vel: 0.8 }, guitar: "strum", pad: "pads", bass: "bassA", beat: "b3" }],
      ["brk", 1, "4", { recorder: mel(">4:4 3:2 2:2 >1:8"), guitar: "strumLite", beat: "brk" }, { riser: 1 }],
      ["D", 4, "1 5 6 4", { recorder: mel(kiteHook2), glock: mel(kiteHook2, null, { octave: -1, vel: 0.6 }), guitar: "strum", pad: "pads", bass: "bassA", beat: "b4" }, { crash: true }],
      ["E", 1, "6", { recorder: mel(">6:2 8:2 9:2 10:6 9:2 8:2"), guitar: "strum", pad: "pads", bass: "bassA", beat: "b3" }],
      ["F", 4, "1 5 6 4", { recorder: mel(kiteHook), glock: { part: "sparkle", vel: 0.6 }, guitar: "strum", bass: "bassA", beat: "b2" }],
      ["G", 4, "4 5 1 1", { recorder: mel(">4:4 6:4 >5:8 | >2:4 5,:4 >7,:8 | >1:16 | .:16"), guitar: "strumLite", bass: "bassA", beat: "b1", wind: "gust" }],
      ["end", 1, "1", { guitar: "strumLite", glock: "roll", recorder: "tonic", pad: "pads", bass: "bassEnd", beat: "last" }]
    ]
  });

  /* ---------------- 6 · Mirage Dunes: the desert, in E double harmonic ----------------
     A breathy ney sings the hook over an oud's arpeggios and a drone on the root and fifth; darbuka (doum, tek and
     the ghosted ka) on a maqsum, a riq, a frame drum for the climax; a shimmering string haze. 32 bars. */
  const duneHook = ">1:2 2:2 >3:4 5:6 4:2 | >2:4 3:2 2:2 >6:8 | >4:2 6:2 5:2 4:2 >3:4 2:4 | >2:4 3:2 2:2 >1:8";
  const duneHook2 = ">5:4 6:2 5:2 >8:8 | >6:4 5:2 6:2 >9:8 | >8:2 6:2 5:2 4:2 >6:4 5:4 | >3:4 2:4 >1:8";
  const duneB = ">8:2 7:2 6:2 5:2 >4:8 | >6:2 5:2 4:2 3:2 >4:8 | >6:4 5:2 6:2 >2:8 | >3:16";
  const dune = build({
    bpm: 128, tonic: 64, scale: "doubleHarmonic", swing: 0.05, level: 0.74,
    reverb: { seconds: 2.6, damp: 0.55, level: 0.85 }, delay: { beats: 0.75, feedback: 0.32, level: 0.6 },
    channels: {
      ney: { synth: "flute", octave: 0, gain: .652, pan: 0.08, reverb: 0.35, delay: 0.18, role: "lead", params: { level: 0.2, cutoff: 2400, vibrato: 20, rate: 5, breath: 0.26, attack: 0.06 } },
      oud: { tone: "oud", octave: -1, gain: .857, pan: -0.25, reverb: 0.25, delay: 0.12, role: "answer" },
      haze: { synth: "strings", octave: -1, gain: .711, pan: 0.15, reverb: 0.5, role: "harmony", params: { level: 0.07, cutoff: 1800, attack: 0.8, release: 1 } },
      drone: { synth: "drone", octave: -2, gain: .622, reverb: 0.35, role: "harmony", params: { cutoff: 420, level: 0.14 } },
      bass: { synth: "bass", octave: -2, gain: .289, role: "bass", params: { wave: "triangle", cutoff: 420, level: 0.36, decay: 0.3, sustain: 0.6, sub: 1 } },
      doum: { drum: "doum", gain: .219, pan: -0.05, role: "drums" },
      tek: { drum: "tek", gain: .328, pan: 0.18, reverb: 0.12, role: "drums" },
      ka: { drum: "tek", opts: { soft: true }, gain: .201, pan: 0.26, role: "drums" },
      riq: { drum: "riq", gain: .182, pan: -0.32, reverb: 0.1, role: "drums" },
      frame: { drum: "frame", gain: .182, pan: 0.05, reverb: 0.22, role: "drums" },
      clap: { drum: "clap", gain: .128, reverb: 0.28, role: "drums" },
      crash: CRASH, riser: RISER,
      wind: { synth: "swell", gain: 0.6, pan: -0.2, reverb: 0.5, role: "fx", params: { level: 0.07 } }
    },
    parts: {
      arp: { line: "R:2 3:2 5:2 3:2 R:2 5:2 8:2 5:2" },
      roll: { line: ROLL },
      pads: { chord: 16 },
      droneHold: { hold: 1, len: 32, every: 32 },
      bassA: { line: ">R:6 R:2 5,:8" },
      bassEnd: { line: ">R:16" },
      tonic: { melody: ">1:16" },
      gust: { hold: 1, len: 32, every: 32 },
      b1: { beat: { doum: "X.......X.......", tek: "..x...x.....x..." } },
      b2: { beat: { doum: "X.......X.......", tek: "..x...x.....x...", ka: ".o.o.o..o.o.o.oo", riq: "x.o.x.o.x.o.x.o." } },
      b3: { beat: { doum: "X..x....X.......", tek: "..x.o.x...o.x.o.", ka: "o.o.o.o.o.o.o.o.", riq: "xoxoxoxoxoxoxoxo", frame: "X..............." } },
      b4: { beat: { doum: "X..x....X..x....", tek: "..X.o.X.o.o.X.oo", ka: "oooooooooooooooo", riq: "xoxoxoxoxoxoxoxo", frame: "X.......X.......", clap: "....x.......x..." } },
      fill: { beat: { doum: "X.......X.......", tek: "........XoXoXxXx" } },
      brk: { beat: { frame: "X.........x....." } },
      last: { beat: { frame: "X...............", doum: "X..............." } }
    },
    song: [
      ["intro", 2, "1 2", { drone: "droneHold", oud: { part: "arp", vel: 0.7 }, wind: "gust" }],
      ["A", 5, "1 2 4 1", { ney: mel(duneHook, ">3:4 2:4 >1:8"), oud: "arp", drone: "droneHold", bass: "bassA", beat: "b1" }, { end: "1", fill: "fill" }],
      ["B", 6, "1 2 4 1", { ney: mel([duneHook, duneHook2]), oud: "arp", drone: "droneHold", bass: "bassA", beat: "b2" }, { crash: true, fill: "fill" }],
      ["C", 5, "4 4 2 1", { oud: mel(duneB), ney: mel(".:8 >5:2 6:2 5:4", null, { vel: 0.7 }), haze: "pads", drone: "droneHold", bass: "bassA", beat: "b3" }],
      ["brk", 1, "2", { ney: mel(">2:4 3:2 2:2 >6:8"), drone: "droneHold", beat: "brk" }, { riser: 1 }],
      ["D", 4, "1 2 4 1", { ney: mel(duneHook2), oud: mel(duneHook2, null, { vel: 0.7 }), haze: "pads", drone: "droneHold", bass: "bassA", beat: "b4" }, { crash: true }],
      ["E", 1, "4", { oud: mel(">8:2 7:2 6:2 5:2 >4:8"), haze: "pads", drone: "droneHold", bass: "bassA", beat: "b3" }],
      ["F", 4, "1 2 4 1", { ney: mel(duneHook), oud: "arp", drone: "droneHold", bass: "bassA", beat: "b2" }],
      ["G", 4, "4 2 1 1", { ney: mel(">4:2 6:2 5:2 4:2 >3:8 | >2:4 3:2 2:2 >6:8 | >2:4 3:2 2:2 >1:8 | .:16"), oud: "arp", drone: "droneHold", beat: "b1", wind: "gust" }],
      ["end", 1, "1", { oud: "roll", ney: "tonic", drone: "droneHold", bass: "bassEnd", beat: "last" }]
    ]
  });

  /* ---------------- 7 · Frostbite Ridge: icy and cinematic, in C# minor ----------------
     Glass bells ring a slow hook, a celesta answers high, cold strings swell, a deep sub holds the floor; the drums
     are few and heavy (kick, taiko, a big snare, toms) in a large cold hall, and the wind howls in the gaps. 33 bars. */
  const iceHook = ">5:6 4:2 3:8 | >3:4 1:4 >6,:8 | >7,:4 1:4 3:4 5:4 | >4:6 2:2 >7,:8";
  const iceHook2 = ">8:6 7:2 5:8 | >6:4 5:4 >3:8 | >5:4 6:4 7:4 8:4 | >9:8 7:8";
  const iceB = ">3:8 1:8 | >2:8 7,:8 | >1:16 | >5,:16";
  const ice = build({
    bpm: 132, tonic: 61, scale: "aeolian", swing: 0, level: 0.699,
    reverb: { seconds: 3.6, damp: 0.45, level: 0.95 }, delay: { beats: 1, feedback: 0.32, level: 0.55 },
    channels: {
      bells: { tone: "glass", octave: 0, gain: .747, pan: 0.08, reverb: 0.45, delay: 0.22, role: "lead" },
      celesta: { tone: "celesta", octave: 1, gain: .259, pan: 0.32, reverb: 0.5, delay: 0.3, role: "answer" },
      strings: { synth: "strings", octave: -1, gain: 1.35, pan: -0.1, reverb: 0.55, role: "harmony", params: { level: 0.1, cutoff: 2600, attack: 0.7, release: 1 } },
      sub: { synth: "bass", octave: -2, gain: .177, role: "bass", params: { wave: "sine", cutoff: 300, level: 0.4, decay: 0.6, sustain: 0.8, sub: 1 } },
      kick: { drum: "kick", opts: { deep: true }, gain: .122, role: "drums" },
      snare: { drum: "snare", gain: .122, reverb: 0.45, role: "drums" },
      hat: { drum: "hat", gain: .0488, pan: 0.3, role: "drums" },
      taiko: { drum: "taiko", gain: .146, reverb: 0.45, role: "drums" },
      tomLo: { drum: "tom", opts: { tone: 0.7 }, gain: .158, pan: -0.25, reverb: 0.4, role: "drums" },
      tomHi: { drum: "tom", opts: { tone: 1.1 }, gain: .11, pan: 0.25, reverb: 0.4, role: "drums" },
      crash: CRASH, riser: RISER,
      wind: { synth: "swell", gain: 0.7, pan: 0.2, reverb: 0.6, role: "fx", params: { level: 0.08 } }
    },
    parts: {
      sparkle: { line: "8:2 12:2 10:2 12:2 8:2 12:2 10:2 5:2" },
      roll: { line: ROLL },
      pads: { chord: 16 },
      padsOpen: { chord: 16, open: true },
      subA: { line: ">R:16" },
      subB: { line: ">R:8 R:4 5,:4" },
      tonic: { melody: ">1:16" },
      gust: { hold: 1, len: 32, every: 32 },
      b1: { beat: { kick: "X...............", taiko: "........X......." } },
      b2: { beat: { kick: "X.........X.....", snare: "........X.......", hat: "x.x.x.x.x.x.x.x." } },
      b3: { beat: { kick: "X.....x...X.....", snare: "....X.......X...", hat: "xoxoxoxoxoxoxoxo", taiko: "X...............", tomLo: "..............x." } },
      b4: { beat: { kick: "X...x...X...x...", snare: "....X.......X...", hat: "xoxoxoxoxoxoxoxo", taiko: "X.......X.......", tomLo: "..x.......x...xx", tomHi: "......x.......x." } },
      fill: { beat: { taiko: "X...........X...", tomHi: "........x.x.....", tomLo: "..........x.x.xx" } },
      brk: { beat: { taiko: "X..............." } },
      last: { beat: { taiko: "X...............", kick: "X..............." } }
    },
    song: [
      ["intro", 2, "1 6", { strings: "padsOpen", celesta: { part: "sparkle", vel: 0.6 }, wind: "gust" }],
      ["A", 5, "1 6 3 7", { bells: mel(iceHook, ">3:4 2:4 >1:8"), strings: "padsOpen", sub: "subA", beat: "b1", wind: "gust" }, { end: "1", fill: "fill" }],
      ["B", 7, "1 6 3 7", { bells: mel([iceHook, iceHook2]), celesta: { part: "sparkle", vel: 0.6 }, strings: "pads", sub: "subB", beat: "b2" }, { crash: true, fill: "fill" }],
      ["C", 5, "6 7 1 1", { strings: mel(iceB, null, { octave: 1 }), bells: mel(".:8 >5:4 3:4", null, { vel: 0.7 }), celesta: "sparkle", sub: "subB", beat: "b3" }],
      ["brk", 1, "7", { bells: mel(">4:6 2:2 >7,:8"), strings: "padsOpen", beat: "brk" }, { riser: 1 }],
      ["D", 4, "1 6 3 7", { bells: mel(iceHook2), strings: "pads", celesta: mel(iceHook2, null, { octave: -1, vel: 0.6 }), sub: "subB", beat: "b4" }, { crash: true }],
      ["E", 2, "6 7", { bells: mel(">6:4 5:4 >3:8 | >9:8 7:8"), strings: "pads", sub: "subB", beat: "b3" }],
      ["F", 3, "1 6 7", { bells: mel(iceHook, ">4:6 2:2 >7,:8"), strings: "pads", sub: "subA", beat: "b2" }],
      ["G", 4, "1 6 7 1", { bells: mel(">5:6 4:2 3:8 | >3:4 1:4 >6,:8 | >7,:16 | .:16"), strings: "padsOpen", sub: "subA", beat: "b1", wind: "gust" }],
      ["end", 1, "1", { bells: "tonic", celesta: "roll", strings: "padsOpen", sub: "subA", beat: "last" }]
    ]
  });

  /* ---------------- 8 · Bamboo Monastery: zen and action, in D (hirajoshi) ----------------
     The koto's hook uses only the hirajoshi's five notes (D E F A Bb), a shakuhachi breathes the long answer,
     monks hum a low drone, taiko, shime and bamboo drive it, and a temple bell rings in each new section. 34 bars. */
  const zenHook = ">5:2 6:2 5:2 3:2 >2:4 1:4 | >3:2 5:2 6:4 >5:8 | >8:2 6:2 5:2 6:2 >8:4 9:4 | >6:4 5:4 >3:4 2:4";
  const zenHook2 = ">1:2 2:2 3:2 5:2 >6:8 | >5:2 3:2 2:2 1:2 >2:8 | >3:2 5:2 6:2 8:2 >9:8 | >8:4 6:4 >5:8";
  const zenB = ">5:8 6:8 | >5:12 3:4 | >2:8 3:8 | >1:16";
  const zen = build({
    bpm: 136, tonic: 62, scale: "aeolian", swing: 0, level: 0.767,
    reverb: { seconds: 1.9, damp: 0.5, level: 0.85 }, delay: { beats: 0.75, feedback: 0.28, level: 0.45 },
    channels: {
      koto: { tone: "koto", octave: 0, gain: 2.23, pan: 0.1, reverb: 0.3, delay: 0.12, role: "lead" },
      shaku: { synth: "flute", octave: -1, gain: .451, pan: -0.25, reverb: 0.45, delay: 0.15, role: "answer", params: { level: 0.2, cutoff: 1900, vibrato: 24, rate: 4.6, breath: 0.35, attack: 0.09 } },
      monks: { synth: "choir", octave: -2, gain: 3.57, reverb: 0.5, role: "harmony", params: { level: 0.12, f1: 320, f2: 860, attack: 1, release: 1.4 } },
      bass: { synth: "bass", octave: -2, gain: .214, role: "bass", params: { wave: "sine", cutoff: 300, level: 0.38, decay: 0.5, sustain: 0.7, sub: 1 } },
      bell: { tone: "bell", octave: -1, gain: 0.22, reverb: 0.55, role: "fx" },
      taiko: { drum: "taiko", gain: .11, reverb: 0.35, role: "drums" },
      shime: { drum: "tom", opts: { tone: 1.7 }, gain: .0708, pan: -0.2, reverb: 0.25, role: "drums" },
      kata: { drum: "wood", opts: { tone: 1.35 }, gain: .0551, pan: 0.25, role: "drums" },
      bamboo: { drum: "log", opts: { tone: 1.5 }, gain: .063, pan: 0.35, reverb: 0.2, role: "drums" },
      shaker: { drum: "shaker", gain: .0472, pan: -0.35, role: "drums" },
      riser: RISER
    },
    parts: {
      roll: { line: ROLL },
      hum: { chord: 16, open: true },
      bassA: { line: ">R:8 5,:8" },
      bassEnd: { line: ">R:16" },
      tonic: { melody: ">1:16" },
      ring: { melody: ">1:16" },
      b1: { beat: { taiko: "X.......X.......", kata: "..x...x...x...x." } },
      b2: { beat: { taiko: "X.....x.X.......", shime: "....x.......x.x.", bamboo: ".x.x.x.x.x.x.x.x" } },
      b3: { beat: { taiko: "X..x..x.X.......", shime: "....X..x....X.xx", bamboo: "x.xox.x.x.xox.x.", shaker: "xoxoxoxoxoxoxoxo" } },
      b4: { beat: { taiko: "X..x..X.X..x..X.", shime: "....X..x.x..X.xx", bamboo: "xoxoxoxoxoxoxoxo", kata: "..x...x...x...x." } },
      fill: { beat: { taiko: "X.......X.......", shime: "........XxXxXXXX" } },
      brk: { beat: { taiko: "X..............." } },
      last: { beat: { taiko: "X..............." } }
    },
    song: [
      ["intro", 2, "1 1", { monks: "hum", shaku: mel(">5:8 6:8 | >5:16", null, { vel: 0.8 }), bell: "ring" }],
      ["A", 5, "1 6 1 1", { koto: mel(zenHook, ">3:4 2:4 >1:8"), monks: "hum", bass: "bassA", beat: "b1" }, { end: "1", fill: "fill" }],
      ["B", 6, "1 6 1 1", { koto: mel([zenHook, zenHook2]), monks: "hum", bass: "bassA", beat: "b2", bell: "ring" }, { fill: "fill" }],
      ["C", 5, "6 6 1 1", { shaku: mel(zenB), koto: mel(".:8 >8:2 6:2 5:4", null, { vel: 0.7 }), monks: "hum", bass: "bassA", beat: "b3" }],
      ["brk", 1, "1", { koto: mel(">6:4 5:4 >3:4 2:4"), monks: "hum", beat: "brk" }, { riser: 1 }],
      ["D", 4, "1 6 1 1", { koto: mel(zenHook2), shaku: mel(zenHook2, null, { vel: 0.55 }), monks: "hum", bass: "bassA", beat: "b4", bell: "ring" }],
      ["E", 2, "6 1", { shaku: mel(">5:8 6:8 | >5:12 3:4"), koto: mel(".:8 >5:2 6:2 8:4 | .:8 >6:2 5:2 3:4"), monks: "hum", bass: "bassA", beat: "b3" }],
      ["F", 5, "1 6 1 1", { koto: mel(zenHook, ">3:4 2:4 >1:8"), monks: "hum", bass: "bassA", beat: "b2" }],
      ["G", 4, "1 6 1 1", { shaku: mel(">5:8 3:8 | >2:12 3:4 | >1:16 | .:16"), monks: "hum", beat: "b1" }],
      ["end", 1, "1", { koto: "roll", shaku: "tonic", monks: "hum", bass: "bassEnd", bell: "ring", beat: "last" }]
    ]
  });

  /* ---------------- 9 · Prism Caverns: a crystal cave, in F# Phrygian ----------------
     A kalimba plays the hook, glass bells answer, a marimba ripples in sixteenths at the peak, a glassy pad hangs
     in the cave's long echo; water drips on the beat (log drops), a rim and a soft kick; a deep sub. 35 bars. */
  const caveHook = ">1:2 3:2 5:2 8:2 >5:4 3:2 2:2 | >2:4 4:2 5:2 >6:8 | >5:2 3:2 1:2 3:2 >5:2 6:2 5:4 | >7:4 5:4 >2:8";
  const caveHook2 = ">8:2 7:2 5:2 7:2 >8:4 10:4 | >9:4 8:2 6:2 >9:8 | >8:2 6:2 5:2 3:2 >1:4 3:4 | >2:4 1:4 >2:8";
  const caveB = ">6:8 8:8 | >7:8 5:8 | >8:16 | >5:16";
  const cave = build({
    bpm: 140, tonic: 66, scale: "phrygian", swing: 0, level: 0.699,
    reverb: { seconds: 3.4, damp: 0.35, level: 0.95 }, delay: { beats: 0.75, feedback: 0.35, level: 0.6 },
    channels: {
      kalimba: { tone: "kalimba", octave: 0, gain: 0.5, pan: 0.08, reverb: 0.4, delay: 0.25, role: "lead" },
      glass: { tone: "glass", octave: 0, gain: .613, pan: -0.3, reverb: 0.5, delay: 0.3, role: "answer" },
      marimba: { tone: "marimba", octave: -1, gain: .414, pan: 0.3, reverb: 0.3, role: "harmony" },
      pad: { synth: "pad", octave: -1, gain: .621, reverb: 0.55, role: "harmony", params: { level: 0.07, cutoff: 1300, wave: "triangle", attack: 0.8, release: 1.2 } },
      sub: { synth: "bass", octave: -2, gain: .172, role: "bass", params: { wave: "sine", cutoff: 280, level: 0.4, decay: 0.5, sustain: 0.8, sub: 1 } },
      kick: { drum: "kick", opts: { deep: true, punch: 0.4 }, gain: 0.18, role: "drums" },
      snare: { drum: "snare", gain: 0.16, reverb: 0.4, role: "drums" },
      rim: { drum: "rim", gain: 0.12, pan: -0.2, reverb: 0.3, role: "drums" },
      drop: { drum: "log", opts: { tone: 2.4 }, gain: 0.14, pan: 0.4, reverb: 0.5, role: "drums" },
      shaker: { drum: "shaker", gain: 0.1, pan: -0.35, role: "drums" },
      crash: CRASH, riser: RISER
    },
    parts: {
      arp8: { line: "R:2 5:2 8:2 5:2 10:2 8:2 5:2 8:2" },
      arp16: { line: "R:1 5:1 8:1 10:1 12:1 10:1 8:1 5:1 R:1 5:1 8:1 10:1 12:1 10:1 8:1 5:1" },
      roll: { line: ROLL },
      pads: { chord: 16 },
      subA: { line: ">R:16" },
      subB: { line: ">R:8 R:4 5,:4" },
      tonic: { melody: ">1:16" },
      b1: { beat: { kick: "X.........x.....", drop: "..x.....x.....x." } },
      b2: { beat: { kick: "X.........X.....", rim: "....x.......x...", drop: "..x...x..x...x..", shaker: "x.x.x.x.x.x.x.x." } },
      b3: { beat: { kick: "X.....x...X.....", rim: "....x.......x...", drop: "..x...x..x...x..", shaker: "xoxoxoxoxoxoxoxo" } },
      b4: { beat: { kick: "X...x...X...x...", snare: "....X.......X...", drop: "..x.x..x..x.x..x", shaker: "xoxoxoxoxoxoxoxo" } },
      fill: { beat: { kick: "X.......X.......", drop: "........x.x.xxxx" } },
      brk: { beat: { drop: "..x.....x....x.." } },
      last: { beat: { kick: "X..............." } }
    },
    song: [
      ["intro", 2, "1 2", { pad: "pads", glass: mel(".:8 >5:4 8:4 | >7:8 5:8", null, { vel: 0.7 }), beat: "brk" }],
      ["A", 5, "1 2 1 7", { kalimba: mel(caveHook, ">3:4 2:4 >1:8"), pad: "pads", sub: "subA", beat: "b1" }, { end: "1", fill: "fill" }],
      ["B", 8, "1 2 1 7", { kalimba: mel([caveHook, caveHook2]), marimba: { part: "arp8", vel: 0.7 }, pad: "pads", sub: "subB", beat: "b2" }, { crash: true, fill: "fill" }],
      ["C", 5, "6 7 1 1", { glass: mel(caveB), kalimba: mel(".:8 >8:2 7:2 5:4", null, { vel: 0.7 }), marimba: "arp16", pad: "pads", sub: "subB", beat: "b3" }],
      ["brk", 1, "2", { kalimba: mel(">2:4 4:2 5:2 >6:8"), pad: "pads", beat: "brk" }, { riser: 1 }],
      ["D", 4, "1 2 1 7", { kalimba: mel(caveHook2), glass: mel(caveHook2, null, { vel: 0.6 }), marimba: "arp16", pad: "pads", sub: "subB", beat: "b4" }, { crash: true }],
      ["E", 3, "6 7 1", { glass: mel(">6:8 8:8 | >7:8 5:8 | >8:16"), marimba: "arp16", pad: "pads", sub: "subB", beat: "b3" }],
      ["F", 3, "1 2 7", { kalimba: mel(caveHook, ">7:4 5:4 >2:8"), marimba: { part: "arp8", vel: 0.7 }, sub: "subA", beat: "b2" }],
      ["G", 4, "1 2 7 1", { kalimba: mel(">5:2 3:2 1:2 3:2 >5:8 | >2:4 4:2 5:2 >6:8 | >7:4 5:4 >2:8 | >1:16"), pad: "pads", sub: "subA", beat: "b1" }],
      ["end", 1, "1", { kalimba: "tonic", glass: "roll", pad: "pads", sub: "subA", beat: "last" }]
    ]
  });

  /* ---------------- 10 · Iron Foundry: industrial, in A harmonic minor ----------------
     A driven analog lead hammers the hook, brass punches answer it, a gritty bass pumps eighths under a heavy kick,
     an anvil rings on the backbeat and steam hisses through the build. 35 bars. */
  const ironHook = ">1:2 1:2 3:2 1:2 >5:4 3:2 2:2 | >1:2 3:2 6:2 5:2 >6:8 | >4:2 4:2 6:2 4:2 >8:4 6:2 4:2 | >7,:4 2:4 >5:4 3:2 2:2";
  const ironHook2 = ">8:2 8:2 7:2 5:2 >8:4 10:4 | >8:2 6:2 5:2 3:2 >6:8 | >4:2 6:2 8:2 9:2 >11:4 9:4 | >7:4 5:4 >2:8";
  const ironB = ">3:8 1:8 | >4:8 6:8 | >7,:8 2:8 | >5:16";
  const iron = build({
    bpm: 140, tonic: 57, scale: "harmonicMinor", swing: 0, level: 0.749,
    reverb: { seconds: 1.6, damp: 0.4, level: 0.7 }, delay: { beats: 0.5, feedback: 0.3, level: 0.45 },
    channels: {
      lead: { synth: "lead", octave: 1, gain: 1.32, pan: 0.05, reverb: 0.22, delay: 0.15, role: "lead", params: { level: 0.2, wave: "sawtooth", wave2: "square", mix2: 0.35, cutoff: 2200, vibrato: 10, attack: 0.008 } },
      brass: { synth: "brass", octave: 0, gain: .56, pan: -0.2, reverb: 0.25, role: "answer", params: { stab: true, level: 0.28, bright: 0.9 } },
      pad: { synth: "pad", octave: -1, gain: 1.75, reverb: 0.4, pump: true, role: "harmony", params: { level: 0.07, cutoff: 1100, attack: 0.4, release: 0.6 } },
      bass: { synth: "bass", octave: -2, gain: .314, role: "bass", params: { cutoff: 520, level: 0.34, decay: 0.16, sustain: 0.55, drive: 2 } },
      kick: { drum: "kick", opts: { punch: 1.2 }, gain: .146, duck: 0.35, role: "drums" },
      snare: { drum: "snare", gain: .134, reverb: 0.2, role: "drums" },
      clap: { drum: "clap", gain: .0853, reverb: 0.2, role: "drums" },
      hat: { drum: "hat", gain: .061, pan: 0.3, role: "drums" },
      anvil: { drum: "anvil", gain: .0792, pan: -0.3, reverb: 0.25, role: "drums" },
      crash: CRASH, riser: RISER,
      steam: { synth: "swell", gain: 0.6, pan: 0.25, reverb: 0.3, role: "fx", params: { level: 0.06 } }
    },
    parts: {
      stabs: { chord: 2, rhythm: "X.....x.....x..." },
      pads: { chord: 16 },
      bassPump: { line: ">R:2 R:2 8:2 R:2 >R:2 R:2 5:2 R:2" },
      bassLite: { line: ">R:4 R:4 R:4 R:4" },
      bassEnd: { line: ">R:16" },
      tonic: { melody: ">1:16" },
      hiss: { hold: 1, len: 32, every: 32 },
      b1: { beat: { kick: "X.......X.......", anvil: "....x.......x..." } },
      b2: { beat: { kick: "X..x....X..x....", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x.", anvil: "..x.......x....." } },
      b3: { beat: { kick: "X..x..x.X..x....", snare: "....X..x....X...", hat: "xoxoxoxoxoxoxoxo", anvil: "..x...x...x...x." } },
      b4: { beat: { kick: "X.x.X.x.X.x.X.x.", snare: "....X.......X...", clap: "....X.......X..x", hat: "xoxoxoxoxoxoxoxo", anvil: "..X...X...X...X." } },
      fill: { beat: { kick: "X.......X.......", snare: "........XxXxXXXX" } },
      brk: { beat: { anvil: "X.......x......." } },
      last: { beat: { kick: "X...............", anvil: "X..............." } }
    },
    song: [
      ["intro", 2, "1 5", { pad: "pads", steam: "hiss", bass: "bassLite", beat: "brk" }],
      ["A", 5, "1 6 4 5", { lead: mel(ironHook, ">3:4 2:4 >1:8"), pad: "pads", bass: "bassLite", beat: "b1" }, { end: "1", fill: "fill" }],
      ["B", 7, "1 6 4 5", { lead: mel([ironHook, ironHook2]), brass: "stabs", bass: "bassPump", beat: "b2", steam: "hiss" }, { crash: true, fill: "fill" }],
      ["C", 7, "6 4 5 5", { brass: mel(ironB), lead: mel(".:8 >8:2 7:2 5:4", null, { vel: 0.7 }), pad: "pads", bass: "bassPump", beat: "b3", steam: "hiss" }],
      ["brk", 1, "5", { lead: mel(">7,:4 2:4 >5:4 3:2 2:2"), pad: "pads", beat: "brk" }, { riser: 1 }],
      ["D", 4, "1 6 4 5", { lead: mel(ironHook2), brass: mel(ironHook2, null, { octave: -1, vel: 0.6 }), pad: "pads", bass: "bassPump", beat: "b4" }, { crash: true }],
      ["E", 2, "6 5", { brass: mel(">3:8 1:8 | >7,:8 2:8"), lead: mel(".:8 >6:2 5:2 3:4 | .:8 >2:2 3:2 5:4"), bass: "bassPump", beat: "b3" }],
      ["F", 4, "1 6 4 5", { lead: mel(ironHook), brass: "stabs", bass: "bassPump", beat: "b2" }],
      ["G", 3, "1 5 1", { lead: mel(">1:2 1:2 3:2 1:2 >5:8 | >7,:4 2:4 >5:8 | >1:16"), pad: "pads", bass: "bassLite", beat: "b1" }],
      ["end", 1, "1", { lead: "tonic", pad: "pads", bass: "bassEnd", beat: "last", steam: "hiss" }]
    ]
  });

  /* ---------------- 11 · Sunken Reef: under water, in A Lydian ----------------
     A vibraphone floats the hook, a kalimba blows bubbles in answer, a soft pad and a round bass sway, the drums
     are a soft kick, a rim, a shaker and bubbling drops, all under a dark, damped space. 36 bars. */
  const reefHook = ">3:4 5:2 8:2 >7:4 5:4 | >4:4 6:2 9:2 >11:8 | >10:4 9:2 8:2 >6:4 5:4 | >5:6 4:2 >2:8";
  const reefHook2 = ">8:4 9:2 10:2 >12:4 10:4 | >11:4 9:2 8:2 >6:8 | >6:4 8:2 10:2 >9:4 8:4 | >7:4 6:4 >5:8";
  const reefB = ">6:2 8:2 10:2 8:2 >6:8 | >3:2 5:2 7:2 5:2 >3:8 | >2:2 4:2 6:2 4:2 >2:8 | >5:16";
  const reef = build({
    bpm: 144, tonic: 69, scale: "lydian", swing: 0.06, level: 0.614,
    reverb: { seconds: 2.8, damp: 0.8, level: 0.9 }, delay: { beats: 0.75, feedback: 0.35, level: 0.55 },
    channels: {
      vibes: { tone: "vibes", octave: 0, gain: .523, pan: 0.08, reverb: 0.4, delay: 0.25, release: 0.4, role: "lead" },
      kalimba: { tone: "kalimba", octave: 0, gain: .382, pan: -0.3, reverb: 0.45, delay: 0.3, role: "answer" },
      pad: { synth: "pad", octave: -2, gain: 1.88, reverb: 0.55, role: "harmony", params: { level: 0.08, cutoff: 900, wave: "triangle", attack: 0.9, release: 1.2, width: 0.8 } },
      bass: { synth: "bass", octave: -3, gain: .264, role: "bass", params: { wave: "triangle", cutoff: 380, level: 0.38, decay: 0.4, sustain: 0.7, sub: 1 } },
      kick: { drum: "kick", opts: { deep: true, punch: 0.3 }, gain: .209, role: "drums" },
      snare: { drum: "snare", gain: .172, reverb: 0.4, role: "drums" },
      rim: { drum: "rim", gain: .148, pan: -0.2, reverb: 0.3, role: "drums" },
      shaker: { drum: "shaker", gain: .135, pan: 0.35, role: "drums" },
      bubble: { drum: "log", opts: { tone: 2 }, gain: .16, pan: 0.4, reverb: 0.45, role: "drums" },
      crash: CRASH, riser: RISER,
      swell: { synth: "swell", gain: 0.55, pan: -0.15, reverb: 0.5, role: "fx", params: { level: 0.06 } }
    },
    parts: {
      roll: { line: ROLL },
      pads: { chord: 16 },
      bassA: { line: ">R:8 5,:8" },
      bassB: { line: ">R:6 R:2 5,:4 R:4" },
      bassEnd: { line: ">R:16" },
      tonic: { melody: ">1:16" },
      tide: { hold: 1, len: 32, every: 32 },
      b1: { beat: { kick: "X.........x.....", bubble: "..x.....x....x.." } },
      b2: { beat: { kick: "X.........X.....", rim: "....x.......x...", shaker: "x.x.x.x.x.x.x.x.", bubble: "..x...x..x...x.." } },
      b3: { beat: { kick: "X.....x...X.....", rim: "....x.......x...", shaker: "xoxoxoxoxoxoxoxo", bubble: "..x.x..x..x...x." } },
      b4: { beat: { kick: "X...x...X...x...", snare: "....X.......X...", shaker: "xoxoxoxoxoxoxoxo", bubble: "..x.x..x..x.x..x" } },
      fill: { beat: { kick: "X.......X.......", bubble: "........x.x.xxxx" } },
      brk: { beat: { bubble: "..x.....x....x.." } },
      last: { beat: { kick: "X..............." } }
    },
    song: [
      ["intro", 2, "1 2", { pad: "pads", kalimba: mel(".:8 >5:2 8:2 7:4 | .:8 >6:2 9:2 8:4", null, { vel: 0.7 }), swell: "tide", beat: "brk" }],
      ["A", 5, "1 2 6 5", { vibes: mel(reefHook, ">3:4 2:4 >1:8"), pad: "pads", bass: "bassA", beat: "b1", swell: "tide" }, { end: "1", fill: "fill" }],
      ["B", 7, "1 2 6 5", { vibes: mel([reefHook, reefHook2]), kalimba: mel(".:12 >8:2 9:2 | .:16", null, { vel: 0.7 }), pad: "pads", bass: "bassB", beat: "b2" }, { crash: true, fill: "fill" }],
      ["C", 7, "6 3 2 5", { kalimba: mel(reefB), vibes: mel(".:8 >5:4 3:4", null, { vel: 0.7 }), pad: "pads", bass: "bassB", beat: "b3", swell: "tide" }, { fill: "fill" }],
      ["brk", 1, "2", { vibes: mel(">4:4 6:2 9:2 >11:8"), pad: "pads", beat: "brk" }, { riser: 1 }],
      ["D", 3, "1 2 6", { vibes: mel(reefHook2), kalimba: mel(reefHook2, null, { vel: 0.6 }), pad: "pads", bass: "bassB", beat: "b4" }, { crash: true }],
      ["E", 4, "5 1 2 5", { kalimba: mel(">7:4 6:4 >5:8 | >8:4 9:2 10:2 >12:8 | >11:4 9:2 8:2 >6:8 | >5:16"), vibes: mel(".:8 >3:4 5:4"), pad: "pads", bass: "bassB", beat: "b3" }],
      ["F", 4, "1 2 6 5", { vibes: mel(reefHook), pad: "pads", bass: "bassA", beat: "b2" }],
      ["G", 3, "1 2 1", { vibes: mel(">3:4 5:2 8:2 >7:8 | >4:4 6:2 9:2 >8:8 | >8:16"), pad: "pads", bass: "bassA", beat: "b1", swell: "tide" }],
      ["end", 1, "1", { vibes: "tonic", kalimba: "roll", pad: "pads", bass: "bassEnd", beat: "last" }]
    ]
  });

  /* ---------------- 12 · Storm Lighthouse: a gothic storm, in D harmonic minor ----------------
     A church organ proclaims the hook, a tubular bell answers, strings shiver in tremolo, timpani and toms
     thunder under a big kick and snare; rain gusts sweep through, and the climax opens on a thunderclap. 37 bars. */
  const stormHook = ">1:4 3:4 5:4 8:4 | >8:4 6:2 5:2 >6:8 | >4:4 6:4 >8:8 | >7:4 6:2 7:2 >5:8";
  const stormHook2 = ">5:4 8:4 10:4 12:4 | >11:4 10:2 8:2 >6:8 | >6:4 8:4 11:4 10:4 | >9:8 7:8";
  const stormB = ">3:8 5:8 | >6:8 8:8 | >6:8 4:8 | >5:16";
  const storm = build({
    bpm: 148, tonic: 62, scale: "harmonicMinor", swing: 0, level: 0.665,
    reverb: { seconds: 3.4, damp: 0.6, level: 0.95 }, delay: { beats: 1, feedback: 0.25, level: 0.35 },
    channels: {
      organ: { synth: "organ", octave: 0, gain: 1.67, pan: 0.05, reverb: 0.45, role: "lead", params: { pipe: true, level: 0.12 } },
      bell: { tone: "bell", octave: 0, gain: .476, pan: -0.25, reverb: 0.55, role: "answer" },
      tremolo: { synth: "strings", octave: -1, gain: 1.94, pan: 0.2, reverb: 0.4, role: "harmony", params: { staccato: true, level: 0.12, cutoff: 1500 } },
      strings: { synth: "strings", octave: -1, gain: 1.94, pan: -0.15, reverb: 0.5, role: "harmony", params: { level: 0.09, cutoff: 2200, attack: 0.5, release: 0.8 } },
      bass: { synth: "bass", octave: -2, gain: .319, role: "bass", params: { wave: "sawtooth", cutoff: 360, level: 0.34, decay: 0.3, sustain: 0.7, sub: 1 } },
      timp: { tone: "timp", octave: -2, gain: .23, reverb: 0.4, role: "drums" },
      kick: { drum: "kick", opts: { deep: true }, gain: .115, role: "drums" },
      snare: { drum: "snare", gain: .104, reverb: 0.45, role: "drums" },
      tomLo: { drum: "tom", opts: { tone: 0.65 }, gain: .138, pan: -0.25, reverb: 0.4, role: "drums" },
      tomHi: { drum: "tom", opts: { tone: 1 }, gain: .104, pan: 0.25, reverb: 0.4, role: "drums" },
      thunder: { drum: "boom", gain: 0.3, reverb: 0.5, role: "fx" },
      crash: CRASH, riser: RISER,
      rain: { synth: "swell", gain: 0.7, pan: 0.2, reverb: 0.5, role: "fx", params: { level: 0.08 } }
    },
    parts: {
      trem: { line: "R:1 R:1 R:1 R:1 5:1 5:1 5:1 5:1 8:1 8:1 8:1 8:1 5:1 5:1 5:1 5:1" },
      pads: { chord: 16 },
      timpA: { line: ">R:4 .:4 5,:4 .:4" },
      timpRoll: { line: "R:1 R:1 R:1 R:1 R:1 R:1 R:1 R:1 >R:1 R:1 R:1 R:1 >R:4" },
      bassA: { line: ">R:8 R:4 5,:4" },
      bassEnd: { line: ">R:16" },
      tonic: { melody: ">1:16" },
      gust: { hold: 1, len: 32, every: 32 },
      clap: { hits: "X..............................................................." },
      b1: { beat: { kick: "X.......X......." } },
      b2: { beat: { kick: "X.......X.......", snare: "....X.......X..." } },
      b3: { beat: { kick: "X.....x.X.......", snare: "....X.......X...", tomLo: "..............x." } },
      b4: { beat: { kick: "X...x...X...x...", snare: "....X.......X...", tomLo: "..x.......x...xx", tomHi: "......x.......x." } },
      fill: { beat: { kick: "X.......X.......", tomHi: "........x.x.....", tomLo: "..........x.x.xx" } },
      brk: { beat: { tomLo: "X..............." } },
      last: { beat: { kick: "X..............." } }
    },
    song: [
      ["intro", 2, "1 5", { strings: "pads", timp: "timpA", rain: "gust", bell: mel(">1:16 | >5,:16", null, { vel: 0.7 }) }],
      ["A", 5, "1 6 4 5", { organ: mel(stormHook, ">3:4 2:4 >1:8"), strings: "pads", timp: "timpA", bass: "bassA", beat: "b1", rain: "gust" }, { end: "1", fill: "fill" }],
      ["B", 7, "1 6 4 5", { organ: mel([stormHook, stormHook2]), tremolo: "trem", timp: "timpA", bass: "bassA", beat: "b2", rain: "gust" }, { crash: true, fill: "fill" }],
      ["C", 7, "3 6 4 5", { bell: mel(stormB), organ: mel(".:8 >5:4 8:4", null, { vel: 0.7 }), tremolo: "trem", strings: "pads", timp: "timpA", bass: "bassA", beat: "b3", rain: "gust" }, { fill: "fill" }],
      ["brk", 1, "5", { organ: mel(">7:4 6:2 7:2 >5:8"), timp: "timpRoll", beat: "brk" }, { riser: 1 }],
      ["D", 3, "1 6 4", { organ: mel(stormHook2), bell: mel(stormHook2, null, { vel: 0.6 }), tremolo: "trem", strings: "pads", timp: "timpA", bass: "bassA", beat: "b4", thunder: "clap" }, { crash: true }],
      ["E", 5, "5 1 6 4 5", { organ: mel([">7:4 6:2 7:2 >5:8", stormHook]), tremolo: "trem", strings: "pads", timp: "timpA", bass: "bassA", beat: "b3", rain: "gust" }],
      ["F", 4, "1 6 4 5", { organ: mel(stormHook), strings: "pads", timp: "timpA", bass: "bassA", beat: "b2" }],
      ["G", 3, "1 5 1", { organ: mel(">1:4 3:4 5:4 8:4 | >7:4 6:2 7:2 >5:8 | >1:16"), strings: "pads", bass: "bassA", beat: "b1", rain: "gust" }],
      ["end", 1, "1", { organ: "tonic", bell: "tonic", strings: "pads", timp: "timpRoll", bass: "bassEnd", beat: "last" }]
    ]
  });

  /* ---------------- 13 · Cable Car Summit: an alpine adventure, in G Mixolydian ----------------
     A French horn calls the hook, an accordion answers, a zither ripples, a tuba walks oom-pah, a crisp march
     snare and a cowbell drive it up the mountain, with the wind at the top. 38 bars. */
  const alpHook = ">1:4 3:2 5:2 >8:6 5:2 | >4:4 6:2 8:2 >6:8 | >7:4 6:2 4:2 >2:4 4:4 | >3:4 2:2 1:2 >5,:8";
  const alpHook2 = ">5:4 6:2 8:2 >10:6 8:2 | >9:4 8:2 6:2 >4:8 | >7:4 9:2 11:2 >9:4 7:4 | >8:16";
  const alpB = ">4:3 5:3 6:2 >8:8 | >5:3 3:3 1:2 >5:8 | >2:3 4:3 6:2 >5:8 | >3:16";
  const alp = build({
    bpm: 152, tonic: 67, scale: "mixolydian", swing: 0, level: 0.73,
    reverb: { seconds: 2.2, damp: 0.45, level: 0.8 }, delay: { beats: 1.5, feedback: 0.3, level: 0.5 },
    channels: {
      horn: { synth: "brass", octave: -1, gain: .738, pan: 0.05, reverb: 0.35, delay: 0.12, role: "lead", params: { level: 0.28, bright: 0.6, attack: 0.05, swell: 0.1 } },
      accordion: { synth: "reed", octave: 0, gain: .978, pan: -0.25, reverb: 0.25, role: "answer", params: { level: 0.12, cutoff: 2400, detune: 8 } },
      zither: { tone: "santur", octave: 0, gain: .983, pan: 0.3, reverb: 0.3, role: "harmony" },
      squeeze: { synth: "reed", octave: -1, gain: 1.79, pan: 0.2, reverb: 0.2, role: "harmony", params: { level: 0.08, cutoff: 1800, detune: 6 } },
      tuba: { synth: "brass", octave: -2, gain: .42, role: "bass", params: { level: 0.3, bright: 0.45, attack: 0.03 } },
      kick: { drum: "kick", opts: { punch: 0.6 }, gain: .159, role: "drums" },
      snare: { drum: "snare", gain: .159, reverb: 0.2, role: "drums" },
      cowbell: { drum: "cowbell", gain: .0715, pan: 0.35, role: "drums" },
      tomLo: { drum: "tom", opts: { tone: 0.7 }, gain: .159, pan: -0.25, reverb: 0.3, role: "drums" },
      crash: CRASH, riser: RISER,
      wind: { synth: "swell", gain: 0.55, pan: -0.2, reverb: 0.5, role: "fx", params: { level: 0.06 } }
    },
    parts: {
      ripple: { line: "R:2 5:2 8:2 10:2 12:2 10:2 8:2 5:2" },
      oompah: { chord: 2, rhythm: "....x.......x..." },
      oompah2: { chord: 2, rhythm: "....x...x...x..." },
      roll: { line: ROLL },
      tubaA: { line: ">R:4 .:4 5,:4 .:4" },
      tubaB: { line: ">R:4 5,:4 R:4 5,:4" },
      tubaEnd: { line: ">R:16" },
      tonic: { melody: ">1:16" },
      gust: { hold: 1, len: 32, every: 32 },
      b1: { beat: { kick: "X.......X.......", snare: "....x.......x..." } },
      b2: { beat: { kick: "X.......X.......", snare: "X..oX.o.X..oX.o.", cowbell: "x...x...x...x..." } },
      b3: { beat: { kick: "X...x...X...x...", snare: "XooxXoxoXooxX.xx", cowbell: "x...x...x...x..." } },
      b4: { beat: { kick: "X...X...X...X...", snare: "X.oxX.oxX.oxXxxx", cowbell: "x.x.x.x.x.x.x.x.", tomLo: "..............xx" } },
      fill: { beat: { kick: "X.......X.......", snare: "........xxxxXXXX" } },
      brk: { beat: { snare: "x...x...x...x..." } },
      last: { beat: { kick: "X..............." } }
    },
    song: [
      ["intro", 2, "1 7", { zither: { part: "ripple", vel: 0.7 }, wind: "gust", accordion: mel(".:8 >5:4 8:4 | >7:8 5:8", null, { vel: 0.7 }) }],
      ["A", 6, "1 4 7 1", { horn: mel([alpHook, alpHook2]), zither: "ripple", tuba: "tubaA", beat: "b1", wind: "gust" }, { fill: "fill" }],
      ["B", 7, "1 4 7 1", { horn: mel([alpHook, alpHook2]), squeeze: "oompah", tuba: "tubaA", beat: "b2" }, { crash: true, fill: "fill" }],
      ["C", 6, "4 1 5 1", { accordion: mel(alpB), horn: mel(".:8 >5:4 8:4", null, { vel: 0.7 }), zither: "ripple", squeeze: "oompah2", tuba: "tubaB", beat: "b3" }, { fill: "fill" }],
      ["brk", 1, "7", { horn: mel(">7:4 6:2 4:2 >2:8"), zither: "ripple", beat: "brk" }, { riser: 1 }],
      ["D", 4, "1 4 7 1", { horn: mel(alpHook2), accordion: mel(alpHook2, null, { shift: -2, vel: 0.6 }), squeeze: "oompah2", zither: "ripple", tuba: "tubaB", beat: "b4" }, { crash: true }],
      ["E", 5, "4 1 5 1", { accordion: mel(alpB, ">3:16"), horn: mel(".:8 >3:4 5:4"), squeeze: "oompah2", tuba: "tubaB", beat: "b3" }],
      ["F", 4, "1 4 7 1", { horn: mel(alpHook), zither: "ripple", squeeze: "oompah", tuba: "tubaA", beat: "b2" }],
      ["G", 3, "4 7 1", { horn: mel(">4:4 6:2 8:2 >6:8 | >7:4 6:2 4:2 >2:8 | >1:16"), zither: "ripple", tuba: "tubaA", beat: "b1", wind: "gust" }],
      ["end", 1, "1", { horn: "tonic", zither: "roll", squeeze: { part: "oompah" }, tuba: "tubaEnd", beat: "last" }]
    ]
  });

  /* ---------------- 14 · Carnival After Dark: an eerie carnival, in F double harmonic ----------------
     A wobbly calliope leads a creepy waltz-like hook, a music box answers, an accordion pumps the oom-pah, a tuba
     the bass; toy percussion (woodblock, ticks) and a soft kick and snare keep the carousel turning. 38 bars. */
  const carnHook = ">1:3 3:3 5:2 >8:6 7:2 | >2:3 4:3 6:2 >9:8 | >8:3 7:3 5:2 >3:4 2:4 | >4:3 6:3 8:2 >7:8";
  const carnHook2 = ">5:3 6:3 5:2 >3:8 | >6:3 7:3 6:2 >4:8 | >5:3 3:3 1:2 >2:4 3:4 | >1:16";
  const carnB = ">8:2 9:2 8:2 6:2 >4:8 | >9:2 10:2 9:2 6:2 >4:8 | >5:4 3:4 >1:8 | >5,:16";
  const carn = build({
    bpm: 152, tonic: 65, scale: "doubleHarmonic", swing: 0.08, level: 0.665,
    reverb: { seconds: 1.8, damp: 0.55, level: 0.8 }, delay: { beats: 0.75, feedback: 0.3, level: 0.45 },
    channels: {
      calliope: { synth: "calliope", octave: 0, gain: .989, pan: 0.05, reverb: 0.3, delay: 0.12, role: "lead", params: { level: 0.15 } },
      box: { tone: "musicbox", octave: 1, gain: 0.35, pan: -0.3, reverb: 0.4, delay: 0.25, role: "answer" },
      squeeze: { synth: "reed", octave: -1, gain: 2.01, pan: 0.2, reverb: 0.2, role: "harmony", params: { level: 0.08, cutoff: 1700, detune: 10 } },
      tuba: { synth: "brass", octave: -2, gain: 0.45, role: "bass", params: { level: 0.3, bright: 0.4, attack: 0.03 } },
      kick: { drum: "kick", opts: { deep: true, punch: 0.4 }, gain: .195, role: "drums" },
      snare: { drum: "snare", gain: .152, reverb: 0.25, role: "drums" },
      wood: { drum: "wood", gain: .141, pan: 0.3, role: "drums" },
      tick: { drum: "tick", gain: .108, pan: -0.35, role: "drums" },
      crash: CRASH, riser: RISER
    },
    parts: {
      oompah: { chord: 2, rhythm: "....x.......x..." },
      waltz: { chord: 2, rhythm: "....x...x...x..." },
      roll: { line: ROLL },
      tubaA: { line: ">R:4 .:4 5,:4 .:4" },
      tubaEnd: { line: ">R:16" },
      tonic: { melody: ">1:16" },
      b1: { beat: { kick: "X.......X.......", tick: "..x...x...x...x." } },
      b2: { beat: { kick: "X.......X.......", snare: "....x.......x...", wood: "..x...x...x...x." } },
      b3: { beat: { kick: "X.......X.......", snare: "....X.......X...", wood: "x.....x.....x...", tick: "x.x.x.x.x.x.x.x." } },
      b4: { beat: { kick: "X...x...X...x...", snare: "....X..x....X..x", wood: "x.x.x.x.x.x.x.x.", tick: "xoxoxoxoxoxoxoxo" } },
      fill: { beat: { kick: "X.......X.......", wood: "........x.x.XxXx" } },
      brk: { beat: { tick: "x...x...x...x..." } },
      last: { beat: { kick: "X..............." } }
    },
    song: [
      ["intro", 2, "1 2", { box: mel(".:8 >5:2 6:2 5:4 | .:8 >3:2 2:2 1:4", null, { vel: 0.8 }), squeeze: "oompah", beat: "brk" }],
      ["A", 6, "1 2 1 4", { calliope: mel([carnHook, carnHook2]), squeeze: "oompah", tuba: "tubaA", beat: "b1" }, { fill: "fill" }],
      ["B", 7, "1 2 1 4", { calliope: mel([carnHook, carnHook2]), box: mel(".:12 >8:2 7:2 | .:16", null, { vel: 0.7 }), squeeze: "oompah", tuba: "tubaA", beat: "b2" }, { crash: true, fill: "fill" }],
      ["C", 6, "4 2 1 1", { box: mel(carnB), calliope: mel(".:8 >5:4 3:4", null, { vel: 0.7 }), squeeze: "waltz", tuba: "tubaA", beat: "b3" }, { fill: "fill" }],
      ["brk", 1, "2", { calliope: mel(">2:3 4:3 6:2 >9:8"), beat: "brk" }, { riser: 1 }],
      ["D", 4, "1 2 1 4", { calliope: mel(carnHook), box: mel(carnHook, null, { octave: -1, vel: 0.6 }), squeeze: "waltz", tuba: "tubaA", beat: "b4" }, { crash: true }],
      ["E", 5, "4 2 1 1", { box: mel(carnB, ">1:16"), calliope: mel(".:8 >8:4 7:4"), squeeze: "waltz", tuba: "tubaA", beat: "b3" }],
      ["F", 4, "1 2 1 4", { calliope: mel(carnHook2), squeeze: "oompah", tuba: "tubaA", beat: "b2" }],
      ["G", 3, "1 2 1", { calliope: mel(">1:3 3:3 5:2 >8:8 | >2:3 4:3 6:2 >2:8 | >1:16"), squeeze: "oompah", tuba: "tubaA", beat: "b1" }],
      ["end", 1, "1", { calliope: "tonic", box: "roll", squeeze: { part: "oompah" }, tuba: "tubaEnd", beat: "last" }]
    ]
  });

  /* ---------------- 15 · Rift Observatory: cosmic synthwave, in C Dorian ----------------
     An analog lead over a wide saw pad, a plucked sequencer running sixteenths, glass bells for the stars; a gated
     snare, a kick that pumps the pad, a deep space hall and a long ping-pong delay. 39 bars. */
  const riftHook = ">5:4 3:2 5:2 >8:6 7:2 | >7:4 5:2 3:2 >5:8 | >4:4 2:2 4:2 >7:8 | >6:4 4:2 3:2 >4:8";
  const riftHook2 = ">8:4 7:2 8:2 >10:6 8:2 | >9:4 7:2 5:2 >7:8 | >11:4 9:2 8:2 >7:8 | >6:4 8:4 >4:8";
  const riftB = ">3:8 5:8 | >4:8 6:8 | >7:8 4:8 | >5:16";
  const rift = build({
    bpm: 156, tonic: 60, scale: "dorian", swing: 0, level: 0.697,
    reverb: { seconds: 3.8, damp: 0.4, level: 0.95 }, delay: { beats: 0.75, feedback: 0.4, level: 0.7 },
    channels: {
      lead: { synth: "lead", octave: 1, gain: 1.3, pan: 0.05, reverb: 0.35, delay: 0.25, role: "lead", params: { level: 0.2, wave: "sawtooth", wave2: "triangle", mix2: 0.4, cutoff: 3000, vibrato: 14, attack: 0.015 } },
      bells: { tone: "glass", octave: 0, gain: .651, pan: -0.3, reverb: 0.5, delay: 0.3, role: "answer" },
      seq: { tone: "pluck", octave: -1, gain: .848, pan: 0.3, reverb: 0.3, delay: 0.25, role: "harmony" },
      pad: { synth: "pad", octave: -1, gain: 1.53, reverb: 0.5, pump: true, role: "harmony", params: { level: 0.08, cutoff: 1800, attack: 0.4, release: 0.8, width: 0.9 } },
      bass: { synth: "bass", octave: -2, gain: 0.38, role: "bass", params: { cutoff: 520, level: 0.34, decay: 0.18, sustain: 0.6, sub: 1 } },
      kick: { drum: "kick", opts: { punch: 0.9 }, gain: .165, duck: 0.4, role: "drums" },
      snare: { drum: "snare", opts: { gated: true }, gain: .135, reverb: 0.2, role: "drums" },
      clap: { drum: "clap", gain: .09, reverb: 0.3, role: "drums" },
      hat: { drum: "hat", gain: .0675, pan: 0.3, role: "drums" },
      open: { drum: "hat", opts: { open: true }, gain: .0525, pan: 0.3, role: "drums" },
      crash: CRASH, riser: RISER
    },
    parts: {
      seq16: { line: "R:1 5:1 8:1 5:1 10:1 8:1 5:1 8:1 R:1 5:1 8:1 5:1 10:1 8:1 12:1 10:1" },
      seq8: { line: "R:2 5:2 8:2 5:2 10:2 8:2 5:2 8:2" },
      stars: { line: ".:4 12:2 .:4 10:2 .:4" },
      roll: { line: ROLL },
      pads: { chord: 16 },
      bassPulse: { line: ">R:2 R:2 R:2 R:2 R:2 R:2 R:2 R:2" },
      bassLite: { line: ">R:8 R:8" },
      bassEnd: { line: ">R:16" },
      tonic: { melody: ">1:16" },
      b1: { beat: { kick: "X.......X.......", hat: "..x...x...x...x." } },
      b2: { beat: { kick: "X.......X.......", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x." } },
      b3: { beat: { kick: "X...X...X...X...", snare: "....X.......X...", hat: "xoxoxoxoxoxoxoxo" } },
      b4: { beat: { kick: "X...X...X...X...", snare: "....X.......X...", clap: "....X.......X...", hat: "xoxoxoxoxoxoxoxo", open: "..x...x...x...x." } },
      fill: { beat: { kick: "X.......X.......", snare: "........x.x.xxxx" } },
      brk: { beat: { hat: "x...x...x...x..." } },
      last: { beat: { kick: "X..............." } }
    },
    song: [
      ["intro", 2, "1 3", { pad: "pads", bells: { part: "stars", vel: 0.7 }, seq: { part: "seq8", vel: 0.6 } }],
      ["A", 6, "1 3 7 4", { lead: mel([riftHook, riftHook2]), pad: "pads", seq: "seq8", bass: "bassLite", beat: "b1" }, { fill: "fill" }],
      ["B", 7, "1 3 7 4", { lead: mel([riftHook, riftHook2]), seq: "seq16", pad: "pads", bass: "bassPulse", beat: "b2" }, { crash: true, fill: "fill" }],
      ["C", 7, "3 4 7 5", { bells: mel(riftB), lead: mel(".:8 >5:4 8:4", null, { vel: 0.7 }), seq: "seq16", pad: "pads", bass: "bassPulse", beat: "b3" }, { fill: "fill" }],
      ["brk", 1, "4", { lead: mel(">6:4 4:2 3:2 >4:8"), pad: "pads", beat: "brk" }, { riser: 1 }],
      ["D", 4, "1 3 7 4", { lead: mel(riftHook2), bells: mel(riftHook2, null, { vel: 0.6 }), seq: "seq16", pad: "pads", bass: "bassPulse", beat: "b4" }, { crash: true }],
      ["E", 5, "3 4 7 5 1", { bells: mel(riftB, ">1:16"), lead: mel(".:8 >3:4 5:4"), seq: "seq16", pad: "pads", bass: "bassPulse", beat: "b3" }],
      ["F", 4, "1 3 7 4", { lead: mel(riftHook), seq: "seq8", pad: "pads", bass: "bassPulse", beat: "b2" }],
      ["G", 3, "1 7 1", { lead: mel(">5:4 3:2 5:2 >8:8 | >4:4 2:2 4:2 >7,:8 | >1:16"), pad: "pads", seq: "seq8", bass: "bassLite", beat: "b1" }],
      ["end", 1, "1", { lead: "tonic", bells: "roll", pad: "pads", bass: "bassEnd", beat: "last" }]
    ]
  });

  /* ---------------- 16 · Hanging Gardens: lush fantasy, in F# Lydian ----------------
     A harp carries the hook in rippling arpeggios, a flute answers and birds whistle above, strings bloom
     underneath, a frame drum, a tambourine and a shaker keep a light step; water swells in the gaps. 40 bars. */
  const gardenHook = ">1:2 3:2 5:2 8:2 >10:4 8:4 | >2:2 4:2 6:2 9:2 >11:4 9:4 | >6:2 8:2 10:2 8:2 >6:4 5:4 | >5:2 7:2 9:2 7:2 >5:8";
  const gardenHook2 = ">8:4 10:2 12:2 >11:4 10:4 | >9:4 11:2 13:2 >12:8 | >10:4 8:2 6:2 >8:4 10:4 | >9:4 7:4 >5:8";
  const gardenB = ">10:8 9:4 8:4 | >10:8 12:8 | >11:8 9:8 | >9:16";
  const garden = build({
    bpm: 160, tonic: 66, scale: "lydian", swing: 0, level: 0.721,
    reverb: { seconds: 2.8, damp: 0.4, level: 0.9 }, delay: { beats: 0.75, feedback: 0.3, level: 0.5 },
    channels: {
      harp: { tone: "harp", octave: 0, gain: 2.23, pan: -0.08, reverb: 0.45, delay: 0.12, role: "lead" },
      flute: { synth: "flute", octave: 0, gain: .471, pan: 0.25, reverb: 0.4, delay: 0.2, role: "answer", params: { level: 0.18, cutoff: 3000, vibrato: 14, breath: 0.1 } },
      strings: { synth: "strings", octave: -1, gain: 1.75, pan: 0.1, reverb: 0.5, role: "harmony", params: { level: 0.09, cutoff: 2600, attack: 0.5, release: 0.9 } },
      bass: { tone: "upright", octave: -2, gain: 1.27, role: "bass" },
      frame: { drum: "frame", gain: 0.2, reverb: 0.25, role: "drums" },
      riq: { drum: "riq", gain: 0.14, pan: 0.3, role: "drums" },
      shaker: { drum: "shaker", gain: 0.12, pan: -0.35, role: "drums" },
      kick: { drum: "kick", opts: { deep: true, punch: 0.3 }, gain: 0.15, role: "drums" },
      crash: CRASH, riser: RISER,
      water: { synth: "swell", gain: 0.5, pan: -0.2, reverb: 0.5, role: "fx", params: { level: 0.05 } }
    },
    parts: {
      pads: { chord: 16 },
      roll: { line: ROLL },
      birds: { melody: ".:12 >12:1 13:1 12:2 | .:16 | .:12 >13:1 15:1 13:2 | .:16" },
      bassA: { line: ">R:6 R:2 5,:8" },
      bassB: { line: ">R:4 5,:4 R:4 3:4" },
      bassEnd: { line: ">R:16" },
      tonic: { melody: ">1:16" },
      tide: { hold: 1, len: 32, every: 32 },
      b1: { beat: { frame: "X.......x.......", shaker: "o.x.o.x.o.x.o.x." } },
      b2: { beat: { frame: "X.......X.......", riq: "....x.......x...", shaker: "o.x.o.x.o.x.o.x." } },
      b3: { beat: { kick: "X.......X.......", frame: "X..x....X.......", riq: "..x...x...x...x.", shaker: "xoxoxoxoxoxoxoxo" } },
      b4: { beat: { kick: "X...x...X...x...", frame: "X..x..x.X..x....", riq: "x.x.x.x.x.x.x.x.", shaker: "xoxoxoxoxoxoxoxo" } },
      fill: { beat: { frame: "X.......x.x.xxXx" } },
      brk: { beat: { shaker: "x...x...x...x..." } },
      last: { beat: { frame: "X..............." } }
    },
    song: [
      ["intro", 2, "1 2", { strings: "pads", flute: mel(".:8 >5:4 8:4 | >9:8 8:8", null, { vel: 0.7 }), water: "tide" }],
      ["A", 6, "1 2 6 5", { harp: mel([gardenHook, gardenHook2]), strings: "pads", bass: "bassA", beat: "b1", water: "tide" }, { fill: "fill" }],
      ["B", 8, "1 2 6 5", { harp: mel([gardenHook, gardenHook2]), flute: { part: "birds", vel: 0.6, octave: -1 }, strings: "pads", bass: "bassA", beat: "b2" }, { crash: true, fill: "fill" }],
      ["C", 7, "6 3 2 5", { flute: mel(gardenB), harp: mel(".:8 >5:2 8:2 10:4", null, { vel: 0.7 }), strings: "pads", bass: "bassB", beat: "b3" }, { fill: "fill" }],
      ["brk", 1, "5", { harp: mel(">5:2 7:2 9:2 7:2 >5:8"), strings: "pads", beat: "brk" }, { riser: 1 }],
      ["D", 3, "1 2 6", { harp: mel(gardenHook2), flute: mel(gardenHook2, null, { vel: 0.6 }), strings: "pads", bass: "bassB", beat: "b4" }, { crash: true }],
      ["E", 5, "5 6 3 2 5", { flute: mel([">9:4 7:4 >5:8", gardenB]), harp: mel(".:8 >8:2 10:2 12:4"), strings: "pads", bass: "bassB", beat: "b3" }],
      ["F", 4, "1 2 6 5", { harp: mel(gardenHook), flute: { part: "birds", vel: 0.5, octave: -1 }, strings: "pads", bass: "bassA", beat: "b2" }],
      ["G", 4, "1 2 5 1", { harp: mel(">1:2 3:2 5:2 8:2 >10:8 | >2:2 4:2 6:2 9:2 >11:8 | >5:2 7:2 9:2 7:2 >5:8 | >8:16"), strings: "pads", bass: "bassA", beat: "b1", water: "tide" }],
      ["end", 1, "1", { harp: "roll", flute: "tonic", strings: "pads", bass: "bassEnd", beat: "last" }]
    ]
  });

  /* ---------------- 17 · Comet Steppe: an epic ride, in D Phrygian ----------------
     A bright saw lead gallops the hook over a galloping bass and toms, a horn section answers, a throat chant hums
     the drone, a wide hall and a comet's whoosh into the climax. 41 bars. */
  const stepHook = ">1:2 1:1 1:1 >5:4 4:2 3:2 2:4 | >2:2 2:1 2:1 >6:4 5:2 4:2 >5:4 | >8:4 7:2 6:2 >5:4 3:4 | >7,:4 2:2 3:2 >1:8";
  const stepHook2 = ">5:2 5:1 5:1 >8:4 7:2 6:2 >5:4 | >6:2 6:1 6:1 >9:4 8:2 7:2 >6:4 | >8:4 10:2 9:2 >8:4 7:4 | >6:4 7:4 >5:8";
  const stepB = ">5:8 4:8 | >6:8 5:8 | >4:8 3:8 | >2:16";
  const steppe = build({
    bpm: 164, tonic: 62, scale: "phrygian", swing: 0, level: 0.665,
    reverb: { seconds: 2.8, damp: 0.5, level: 0.9 }, delay: { beats: 0.75, feedback: 0.3, level: 0.5 },
    channels: {
      lead: { synth: "lead", octave: 0, gain: 1.34, pan: 0.05, reverb: 0.3, delay: 0.2, role: "lead", params: { level: 0.2, wave: "sawtooth", wave2: "sawtooth", detune: 12, mix2: 0.6, cutoff: 3200, vibrato: 12 } },
      horns: { synth: "brass", octave: -1, gain: 0.5, pan: -0.2, reverb: 0.35, role: "answer", params: { level: 0.28, bright: 0.75, attack: 0.04 } },
      pad: { synth: "pad", octave: -1, gain: 1.46, reverb: 0.5, role: "harmony", params: { level: 0.07, cutoff: 1500, attack: 0.5, release: 0.8 } },
      chant: { synth: "chant", octave: -2, gain: 1.27, reverb: 0.4, role: "harmony", params: { level: 0.2 } },
      bass: { synth: "bass", octave: -2, gain: .417, role: "bass", params: { cutoff: 520, level: 0.34, decay: 0.14, sustain: 0.5 } },
      kick: { drum: "kick", opts: { deep: true, punch: 0.8 }, gain: .104, role: "drums" },
      snare: { drum: "snare", gain: .0852, reverb: 0.3, role: "drums" },
      hat: { drum: "hat", gain: .0379, pan: 0.3, role: "drums" },
      tomLo: { drum: "tom", opts: { tone: 0.7 }, gain: .104, pan: -0.25, reverb: 0.3, role: "drums" },
      tomHi: { drum: "tom", opts: { tone: 1.1 }, gain: .0757, pan: 0.25, reverb: 0.3, role: "drums" },
      crash: CRASH, riser: RISER
    },
    parts: {
      pads: { chord: 16 },
      throat: { hold: 1, len: 32, every: 32 },
      gallop: { line: ">R:2 R:1 R:1 R:2 R:1 R:1 R:2 R:1 R:1 5,:2 R:1 R:1" },
      bassLite: { line: ">R:8 5,:8" },
      bassEnd: { line: ">R:16" },
      tonic: { melody: ">1:16" },
      b1: { beat: { kick: "X.......X.......", tomLo: "X.xx....X.xx...." } },
      b2: { beat: { kick: "X.......X.......", snare: "....X.......X...", tomLo: "X.xoX.xoX.xoX.xo" } },
      b3: { beat: { kick: "X.......X.......", snare: "....X.......X...", tomLo: "X.xoX.xoX.xoX.xo", hat: "x.x.x.x.x.x.x.x." } },
      b4: { beat: { kick: "X.xxX.xxX.xxX.xx", snare: "....X.......X...", tomHi: "..x...x...x...x.", hat: "xoxoxoxoxoxoxoxo" } },
      fill: { beat: { kick: "X.......X.......", tomHi: "........x.x.x.x.", tomLo: "........XxXxXxXX" } },
      brk: { beat: { tomLo: "X.xx....X.xx...." } },
      last: { beat: { kick: "X..............." } }
    },
    song: [
      ["intro", 2, "1 2", { chant: "throat", pad: "pads", beat: "brk" }],
      ["A", 6, "1 2 1 7", { lead: mel([stepHook, stepHook2]), chant: "throat", bass: "bassLite", beat: "b1" }, { fill: "fill" }],
      ["B1", 5, "1 2 1 7", { lead: mel([stepHook, stepHook2]), chant: "throat", pad: "pads", bass: "gallop", beat: "b2" }, { crash: true }],
      ["B2", 4, "1 2 1 7", { lead: mel(stepHook2), horns: mel(stepHook2, null, { vel: 0.6 }), pad: "pads", bass: "gallop", beat: "b2" }, { fill: "fill" }],
      ["C", 8, "1 2 6 2", { horns: mel(stepB), lead: mel(".:8 >5:2 5:1 5:1 >8:4", null, { vel: 0.7 }), chant: "throat", pad: "pads", bass: "gallop", beat: "b3" }, { fill: "fill" }],
      ["brk", 1, "7", { lead: mel(">7,:4 2:2 3:2 >1:8"), chant: "throat", beat: "brk" }, { riser: 1 }],
      ["D", 3, "1 2 1", { lead: mel(stepHook2), horns: mel(stepHook2, null, { shift: -2, vel: 0.6 }), pad: "pads", bass: "gallop", beat: "b4" }, { crash: true }],
      ["E", 7, "7 1 2 6 2 1 7", { horns: mel([">6:4 7:4 >5:8", stepB]), lead: mel(".:8 >5:2 4:2 3:4"), chant: "throat", pad: "pads", bass: "gallop", beat: "b3" }, { fill: "fill" }],
      ["F", 4, "1 2 1 7", { lead: mel(stepHook), pad: "pads", bass: "gallop", beat: "b2" }],
      ["G", 1, "1", { lead: mel(">5:4 3:4 >1:8"), chant: "throat", bass: "bassLite", beat: "b1" }],
      ["end", 1, "1", { lead: "tonic", horns: "tonic", pad: "pads", chant: "throat", bass: "bassEnd", beat: "last" }]
    ]
  });

  return { 0: home, 1: pines, 2: roof, 3: harbor, 4: attic, 5: kite, 6: dune, 7: ice, 8: zen, 9: cave, 10: iron,
    11: reef, 12: storm, 13: alp, 14: carn, 15: rift, 16: garden, 17: steppe };
})();
