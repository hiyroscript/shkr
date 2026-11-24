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

  return { 0: home, 1: pines, 2: roof, 3: harbor };
})();
