/* ---- music.js ---- */
/* ============================================================================
   MUSIC — the soundtrack engine. One original track per level, synthesised
   live with Web Audio from the level's spec (mu in js/levels.js) and from its
   chart: the lead line plays on exactly the half-beats where the level asks
   for an action, so the song and the level are one thing.

   makeSong() writes the whole song up front as a list of note events on an
   integer grid (48 ticks a beat): an arranger turns the spec, the chord
   progressions, the energy curve and the chart into drums, bass, harmony,
   a motif-based lead, answers, risers and the closing cadence. schedule()
   then only plays the events that fall inside a short look-ahead window, at
   t0 + beat * spb, and drops any that are already late.

   Sections: tables (scales, waves, patches, kits, grooves, spaces) → offline
   DSP (drum one-shots, plucked strings, reverb IRs) → voices → arranger →
   scheduler and API → sound effects → offline render.

   No audio files: every sample is computed here. Besides the music there are
   two sound effects on their own output: the death sound (MUSIC.sfx.die) and
   the level 1 spike tip's tape rewind (MUSIC.sfx.rewind).
   ========================================================================== */
const MUSIC = (function () {
  "use strict";
  const SC = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phryg: [0, 1, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11], mixo: [0, 2, 4, 5, 7, 9, 10], harm: [0, 2, 3, 5, 7, 8, 11], phrydom: [0, 1, 4, 5, 7, 8, 10],
    hira: [0, 2, 3, 7, 8], dblharm: [0, 1, 4, 5, 7, 8, 11] };
  const TPQ = 48;                  /* grid ticks per beat: 16ths (12), eighths (24) and triplets (16) are all whole numbers */
  const LOOK = 0.3, TICK = 25, LATE = 0.02, MAXV = 60;

  /* ---------------- wave tables ----------------
     Harmonic recipes for createPeriodicWave: the browser band-limits them, so none of these alias the way a raw
     "square" does at high notes. a(n) is the amplitude of harmonic n. */
  const WAVES = {
    warm: function (n) { return Math.exp(-n / 26) / n; },                         /* soft saw for strings and pads */
    bright: function (n) { return 1 / n; },                                      /* full saw, for filtered synths */
    hollow: function (n) { return n % 2 ? 1 / n : .12 / n; },                    /* rounded square */
    tri: function (n) { return n % 2 ? (n % 4 === 1 ? 1 : -1) / (n * n) : 0; },
    reed: function (n) { return (n % 2 ? 1 : .55) / Math.pow(n, .75) * Math.exp(-n / 30); },
    clar: function (n) { return n % 2 ? 1 / Math.pow(n, .9) : .04 / n; },
    harm: function (n) { return (n % 2 ? .9 : .6) / Math.pow(n, .8) * Math.exp(-n / 24); },
    flute: function (n) { return [1, .16, .07, .035, .015, .008][n - 1] || 0; },
    calli: function (n) { return [1, .42, .22, .12, .06, .03][n - 1] || 0; },
    organ: function (n) { return { 1: 1, 2: .75, 3: .55, 4: .45, 6: .3, 8: .22, 10: .08, 12: .1, 16: .06 }[n] || 0; },
    pipe: function (n) { return [1, .5, .32, .22, .14, .1, .07, .06, .04, .03][n - 1] || 0; },
    brass: function (n) { return Math.exp(-n / 38) / Math.pow(n, .8); },
    piano: function (n) { return n > 28 ? 0 : 1 / Math.pow(n, 1.55); },
    vox: function (n) { return 1 / Math.pow(n, 1.05); },
    buzz: function (n) { return 1 / Math.pow(n, .55) * Math.exp(-n / 60); }
  };

  /* ---------------- patches ----------------
     o: oscillators [wave, cents, gain, frequency ratio]; uni: [count, spread cents, stereo width] (unison of o[0])
     fm: modulators [ratio, index, decay s, sustain fraction] on every carrier, index scaled by velocity and pitch
     ks: plucked string [T60 s at 220 Hz, excitation brightness 0-1, pick position, loop damping 0-1]; tk: a second
       course [semitones, cents, gain]; dmp: damper time when the note is let go
     a d s r: envelope (s 0 = struck, rings for d); f: filter [cutoff Hz at middle C, key tracking, velocity amount,
       envelope peak multiple, envelope decay s, Q]; ft: filter type
     nz: noise layer [band Hz, Q, level, attack, decay, sustain] (breath, bow, key click)
     gl glide s, vib [cents, Hz, delay s], trem [depth, Hz], pb onset bend [semitones, s], drift slow wobble cents
     g gain, rv / dl reverb and delay sends, rng [lowest, highest] midi, fmt a formant or body filter on the part */
  const PATCH = {
    /* winds */
    flute: { o: [["flute", 0, 1], ["flute", 5, .3]], a: .05, d: .25, s: .85, r: .16, f: [2800, .6, .5, 1.5, .15, .7], nz: [2400, .8, .06, .03, .2, .45], vib: [14, 5.2, .22], gl: .05, g: .393, rv: .34, dl: .14, rng: [67, 96] },
    recorder: { o: [["flute", 0, 1]], a: .025, d: .1, s: .9, r: .1, f: [3400, .5, .4, 1.4, .06, .7], nz: [3000, 1, .09, .004, .05, .25], vib: [8, 5.6, .26], gl: .03, g: .393, rv: .3, dl: .12, rng: [72, 98] },
    whistle: { o: [["flute", 0, 1]], a: .02, d: .1, s: .9, r: .09, f: [4200, .4, .4, 1.3, .05, .7], nz: [3600, 1.2, .05, .003, .04, .2], pb: [-.5, .06], vib: [16, 6, .16], gl: .03, g: .392, rv: .32, dl: .16, rng: [74, 100] },
    shaku: { o: [["flute", 0, 1], ["tri", 4, .3]], a: .09, d: .3, s: .8, r: .2, f: [2200, .6, .5, 1.3, .2, .7], nz: [1700, .7, .2, .05, .3, .7], pb: [-1, .14], vib: [22, 4.8, .3], gl: .07, g: .416, rv: .4, dl: .12, rng: [62, 88] },
    ney: { o: [["flute", 0, 1], ["reed", 0, .3]], a: .07, d: .3, s: .85, r: .18, f: [2600, .5, .5, 1.4, .15, .8], nz: [2000, .8, .14, .05, .25, .6], pb: [-.7, .1], vib: [20, 5.2, .25], gl: .06, g: .34, rv: .36, dl: .14, rng: [62, 91] },
    clar: { o: [["clar", 0, 1]], a: .035, d: .2, s: .9, r: .1, f: [1900, .6, .6, 1.3, .1, .8], nz: [1800, .9, .03, .02, .1, .3], vib: [7, 5, .35], gl: .04, g: .466, rv: .28, dl: .1, rng: [55, 89] },
    reed: { o: [["reed", 0, 1], ["reed", 6, .4]], a: .03, d: .15, s: .88, r: .1, f: [2300, .5, .6, 1.5, .08, 1.4], nz: [2200, .9, .04, .02, .1, .3], pb: [-.6, .07], vib: [18, 5.6, .2], gl: .05, g: .434, rv: .3, dl: .14, rng: [62, 91], fmt: "reed" },
    accordion: { o: [["reed", -7, 1], ["reed", 7, .9], ["reed", 0, .45, .5]], a: .03, d: .15, s: .95, r: .09, f: [2900, .4, .5, 1.25, .1, .7], g: .316, rv: .24, dl: .08, rng: [57, 88], fmt: "reed" },
    harmonica: { o: [["harm", 0, 1], ["harm", 9, .35]], a: .03, d: .15, s: .9, r: .1, f: [1800, .5, .7, 1.9, .12, 1.8], nz: [1600, .9, .05, .02, .12, .35], pb: [-1.4, .12], vib: [24, 5.8, .3], gl: .04, g: .398, rv: .26, dl: .1, rng: [60, 91], fmt: "reed" },
    calliope: { o: [["calli", 0, 1], ["calli", 9, .3]], a: .025, d: .1, s: .92, r: .09, f: [3600, .4, .4, 1.2, .05, .7], nz: [2600, .8, .08, .01, .1, .5], vib: [24, 6.8, .1], drift: 22, g: .429, rv: .26, dl: .1, rng: [64, 96] },
    /* keyboards and organs */
    organ: { o: [["organ", 0, 1], ["organ", 4, .4]], a: .006, d: .1, s: 1, r: .06, nz: [3200, .7, .18, .001, .012, 0], vib: [6, 6.4, 0], g: .454, rv: .3, dl: .06, rng: [48, 90] },
    pipe: { o: [["pipe", 0, 1], ["pipe", 2, .45, 2], ["pipe", -2, .22, 4]], a: .045, d: .2, s: 1, r: .25, nz: [2800, .6, .1, .006, .06, .02], g: .414, rv: .45, dl: .04, rng: [43, 88] },
    epiano: { o: [["sine", 0, 1]], fm: [[1, 1.7, .55, .15], [14, .3, .03, 0]], a: .002, d: 1.4, s: .22, r: .35, trem: [.1, 4.6], g: .723, rv: .28, dl: .16, rng: [48, 86] },
    fpiano: { o: [["piano", 0, 1], ["piano", 3, .7]], a: .003, d: 1.8, s: 0, r: .4, f: [1400, .7, .7, 2.4, .35, .5], nz: [420, .7, .2, .001, .03, 0], g: .426, rv: .34, dl: .1, rng: [45, 91] },
    celesta: { o: [["sine", 0, 1]], fm: [[4, 1, .12, 0], [1, .35, .4, 0]], a: .002, d: 1.1, s: 0, r: .5, nz: [5200, 1, .08, .0005, .006, 0], g: .737, rv: .38, dl: .16, rng: [67, 100] },
    musicbox: { o: [["sine", 0, 1]], fm: [[5.4, 1.2, .09, 0]], a: .001, d: 1, s: 0, r: .5, nz: [6000, 1.2, .25, .0005, .004, 0], g: .291, rv: .4, dl: .2, rng: [72, 100] },
    /* mallets and bells */
    glock: { o: [["sine", 0, 1], ["sine", 0, .25, 2.76]], fm: [[3.5, .7, .05, 0]], a: .001, d: 1.2, s: 0, r: .6, g: .283, rv: .38, dl: .2, rng: [77, 105] },
    vibes: { o: [["sine", 0, 1], ["sine", 0, .12, 4]], fm: [[4, .45, .2, 0]], a: .002, d: 2.4, s: 0, r: .8, trem: [.42, 5.4], g: .698, rv: .34, dl: .18, rng: [53, 89] },
    marimba: { o: [["sine", 0, 1], ["sine", 0, .2, 4]], fm: [[1, .9, .02, 0]], a: .001, d: .5, s: 0, r: .25, g: .294, rv: .26, dl: .12, rng: [45, 96] },
    kalimba: { o: [["sine", 0, 1], ["sine", 0, .28, 5.4]], fm: [[1, .6, .03, 0]], a: .001, d: .8, s: 0, r: .35, nz: [3000, 1, .06, .0005, .008, 0], g: .28, rv: .34, dl: .2, rng: [60, 96] },
    bell: { o: [["sine", 0, 1], ["sine", 0, .35, 2]], fm: [[3.5, 2, 1.1, .08]], a: .002, d: 3.2, s: 0, r: 1.8, g: .453, rv: .5, dl: .2, rng: [55, 88] },
    tbell: { o: [["sine", 0, 1], ["sine", 0, .3, 2.76], ["sine", 0, .14, 5.4]], fm: [[1.41, 1.3, 2, .2]], a: .004, d: 5, s: 0, r: 2.5, g: .401, rv: .55, dl: .1, rng: [36, 64] },
    fmbell: { o: [["sine", 0, 1]], fm: [[3.01, 2, .32, .05]], a: .002, d: 1.3, s: 0, r: .6, g: .681, rv: .44, dl: .24, rng: [60, 96] },
    glass: { o: [["sine", 0, 1]], fm: [[2.76, 1.4, .35, .05], [7.1, .25, .05, 0]], a: .001, d: 1.5, s: 0, r: .6, g: .293, rv: .46, dl: .24, rng: [67, 100] },
    chime: { o: [["sine", 0, 1]], fm: [[4.2, 1.1, .15, 0]], a: .001, d: 1, s: 0, r: .5, g: .292, rv: .5, dl: .26, rng: [72, 104] },
    steel: { o: [["sine", 0, 1], ["sine", 0, .38, 2], ["sine", 0, .2, 3]], fm: [[2, .8, .12, .1]], a: .003, d: 1, s: 0, r: .4, g: .714, rv: .3, dl: .16, rng: [55, 91] },
    /* the special-hazard cue: glassy, in key, an octave over the lead, falling a little into pitch */
    cue: { o: [["sine", 0, 1], ["sine", 0, .25, 3]], fm: [[5.01, 1.3, .07, 0]], a: .001, d: .6, s: 0, r: .4, pb: [1, .05], g: .252, rv: .5, dl: .3, rng: [72, 108] },
    bubble: { o: [["sine", 0, 1]], fm: [[2, .7, .08, 0]], a: .002, d: .4, s: 0, r: .2, pb: [-5, .06], g: 1.21, rv: .4, dl: .3, rng: [60, 96] },
    /* plucked strings (Karplus-Strong) */
    koto: { ks: [2.2, .85, .1, .28], dmp: .25, g: 2.77, rv: .34, dl: .1, rng: [55, 91] },
    guzheng: { ks: [3, .8, .14, .22], tk: [0, 5, .5], dmp: .3, g: 2.42, rv: .36, dl: .14, rng: [55, 93] },
    harp: { ks: [3.4, .45, .3, .42], dmp: .6, g: 1.72, rv: .42, dl: .12, rng: [43, 96] },
    nylon: { ks: [2.1, .48, .22, .45], dmp: .12, g: 1.29, rv: .26, dl: .08, rng: [40, 84], fmt: "gtr" },
    acoustic: { ks: [2.3, .72, .14, .3], dmp: .1, g: 1.29, rv: .24, dl: .06, rng: [40, 84], fmt: "gtr" },
    harpsi: { ks: [1.5, .95, .07, .14], tk: [12, 0, .32], dmp: .05, g: 2.13, rv: .3, dl: .08, rng: [41, 89] },
    pizz: { ks: [.5, .45, .25, .5], dmp: .08, g: 2.85, rv: .34, dl: .06, rng: [36, 84], fmt: "body" },
    oud: { ks: [1.3, .62, .18, .38], tk: [0, 4, .6], dmp: .12, g: 1.73, rv: .28, dl: .1, rng: [40, 79] },
    santur: { ks: [2.6, .9, .12, .2], tk: [0, 7, .8], dmp: .4, g: 2.31, rv: .32, dl: .14, rng: [55, 91] },
    sitar: { ks: [2.2, .95, .08, .1], tk: [12, 3, .25], dmp: .2, g: 1.75, rv: .3, dl: .12, rng: [48, 84], fmt: "buzz" },
    shamisen: { ks: [.9, .92, .06, .2], dmp: .06, g: 2.9, rv: .3, dl: .1, rng: [52, 88] },
    upright: { ks: [1.2, .3, .25, .55], dmp: .1, g: 2.13, rv: .12, rng: [28, 55], fmt: "body" },
    /* bowed strings, brass, voices */
    strings: { o: [["warm", 0, 1]], uni: [3, 14, .8], a: .22, d: .4, s: .9, r: .4, f: [2400, .5, .5, 1.1, .3, .5], nz: [3200, .6, .025, .1, .3, .6], vib: [10, 5.4, .35], g: .238, rv: .4, dl: .06, rng: [43, 88] },
    strShort: { o: [["warm", 0, 1]], uni: [3, 12, .7], a: .012, d: .2, s: 0, r: .12, f: [2600, .5, .7, 1.6, .1, .5], nz: [3000, .6, .05, .004, .05, 0], g: 1.25, rv: .34, rng: [36, 84] },
    tremolo: { o: [["warm", 0, 1]], uni: [3, 14, .8], a: .08, d: .3, s: .9, r: .3, f: [2400, .5, .5, 1.1, .3, .5], trem: [.55, 13], g: .299, rv: .4, rng: [43, 84] },
    brass: { o: [["brass", -6, 1], ["brass", 6, 1], ["brass", 0, .5, .5]], a: .04, d: .35, s: .8, r: .14, f: [700, .7, .8, 3.6, .17, 1.2], pb: [-.35, .05], vib: [9, 5.4, .3], gl: .04, g: .422, rv: .32, dl: .06, rng: [53, 84] },
    horn: { o: [["brass", 0, 1], ["tri", 4, .5]], a: .07, d: .4, s: .85, r: .2, f: [520, .6, .6, 2.4, .25, .8], vib: [8, 5, .35], gl: .05, g: .573, rv: .4, dl: .06, rng: [48, 79] },
    tuba: { o: [["brass", 0, 1]], a: .03, d: .3, s: .8, r: .1, f: [280, .5, .6, 2.8, .12, 1], g: .684, rv: .14, rng: [28, 55] },
    choir: { o: [["vox", 0, 1]], uni: [3, 12, .75], a: .35, d: .3, s: .9, r: .5, f: [3200, .3, .4, 1.1, .3, .5], nz: [2600, .7, .02, .2, .3, .5], vib: [12, 5, .4], g: .39, rv: .5, dl: .04, rng: [52, 79], fmt: "ah" },
    choirOo: { o: [["vox", 0, 1]], uni: [3, 10, .7], a: .4, d: .3, s: .9, r: .6, f: [2200, .3, .4, 1.1, .3, .5], vib: [10, 4.8, .45], g: .264, rv: .55, dl: .04, rng: [48, 76], fmt: "oo" },
    throat: { o: [["vox", 0, 1], ["vox", 3, .6]], a: .4, d: .4, s: .95, r: .6, f: [2600, 0, .3, 1, .3, .5], vib: [5, 4.4, .6], g: .453, rv: .4, rng: [36, 55], fmt: "throat" },
    /* synths */
    analog: { o: [["bright", -5, 1], ["hollow", 5, .6]], a: .006, d: .3, s: .7, r: .12, f: [1300, .6, .7, 3, .15, 2], gl: .06, vib: [12, 5.5, .3], g: .515, rv: .26, dl: .2, rng: [55, 91] },
    saw: { o: [["bright", -8, 1], ["bright", 8, 1]], a: .005, d: .3, s: .75, r: .1, f: [1700, .6, .7, 2.6, .16, 3], gl: .03, vib: [10, 5.5, .35], g: .454, rv: .22, dl: .16, rng: [55, 88] },
    supersaw: { o: [["bright", 0, 1]], uni: [5, 26, 1], a: .01, d: .3, s: .8, r: .2, f: [3400, .4, .6, 1.5, .2, .6], g: .653, rv: .3, dl: .2, rng: [55, 91] },
    acid: { o: [["bright", 0, 1]], a: .003, d: .25, s: .5, r: .05, f: [420, .4, 1, 8, .1, 11], gl: .07, g: .619, rv: .14, dl: .22, rng: [45, 79] },
    zap: { o: [["hollow", 0, 1]], a: .002, d: .2, s: .25, r: .08, f: [2800, .5, .6, 1.5, .1, 1.5], pb: [14, .04], g: 1.04, rv: .2, dl: .26, rng: [60, 88] },
    pluck: { o: [["warm", 0, 1], ["hollow", 7, .5]], a: .002, d: .4, s: 0, r: .2, f: [700, .6, .8, 7, .09, 1.5], g: .92, rv: .26, dl: .3, rng: [48, 91] },
    seq: { o: [["bright", -4, 1], ["hollow", 4, .5]], a: .002, d: .22, s: 0, r: .12, f: [600, .6, .8, 6, .07, 4], g: 1.36, rv: .24, dl: .32, rng: [48, 84] },
    /* basses */
    sub: { o: [["sine", 0, 1], ["tri", 0, .18]], a: .006, d: .3, s: .85, r: .08, gl: .04, g: .376, rng: [24, 50] },
    finger: { o: [["tri", 0, 1], ["warm", 0, .45]], a: .004, d: .55, s: .45, r: .07, f: [620, .4, .6, 2.2, .08, 1], g: .562, rng: [26, 52] },
    synthbass: { o: [["bright", -4, 1], ["hollow", 4, .7]], a: .003, d: .22, s: .5, r: .05, f: [320, .4, .7, 4, .1, 3], g: .543, rng: [24, 52] },
    bacid: { o: [["bright", 0, 1]], a: .003, d: .16, s: .45, r: .04, f: [230, .3, 1, 9, .08, 13], gl: .06, g: .827, rng: [26, 52] },
    bassoon: { o: [["reed", 0, 1]], a: .03, d: .2, s: .88, r: .08, f: [800, .5, .6, 1.5, .1, 1], g: .565, rv: .14, rng: [34, 60] },
    pedalPipe: { o: [["pipe", 0, 1], ["pipe", 0, .45, 2]], a: .05, d: .2, s: 1, r: .3, g: .374, rv: .3, rng: [24, 50] },
    grit: { o: [["bright", -6, 1], ["bright", 6, .8]], a: .003, d: .25, s: .6, r: .05, f: [420, .4, .7, 3.5, .1, 4], g: .267, rng: [24, 52], fmt: "grit" },
    /* pads and drones */
    padWarm: { o: [["warm", 0, 1]], uni: [3, 12, .9], a: .7, d: .6, s: .85, r: 1, f: [1300, .4, .3, 1, .5, .5], g: .292, rv: .5, dl: .04, rng: [45, 81] },
    padAir: { o: [["warm", 0, 1]], uni: [3, 16, 1], a: .9, d: .6, s: .85, r: 1.2, f: [1800, .3, .3, 1, .5, .5], nz: [4200, .6, .05, .8, .5, .8], g: .313, rv: .55, dl: .04, rng: [48, 84] },
    padGlass: { o: [["sine", 0, 1]], uni: [2, 9, .9], fm: [[2, .7, 1.6, .45]], a: .8, d: .8, s: .8, r: 1.2, g: .285, rv: .55, dl: .06, rng: [52, 88] },
    padHeat: { o: [["vox", 0, 1]], uni: [3, 18, 1], a: .9, d: .5, s: .85, r: 1, f: [1500, .3, .3, 1, .5, .6], vib: [14, .45, .5], g: .631, rv: .5, rng: [48, 79], fmt: "ah" },
    padSaw: { o: [["bright", 0, 1]], uni: [5, 22, 1], a: .5, d: .6, s: .85, r: .9, f: [2200, .3, .3, 1, .5, .6], g: .321, rv: .45, dl: .06, rng: [48, 84] },
    swell: { o: [["warm", 0, 1], ["sine", 0, .4, 2]], uni: [2, 10, .9], a: 1, d: .1, s: 1, r: .06, f: [1700, .3, .3, 1, .5, .5], g: .279, rv: .45, rng: [45, 81] },
    tanpura: { o: [["buzz", 0, 1]], a: .5, d: .5, s: .9, r: .8, f: [900, .2, .2, 2.5, 1.2, 2], drift: 4, g: .553, rv: .4, rng: [36, 60], fmt: "buzz" }
  };
  /* formant and body filters, built once per part: "par" bands are summed in parallel (voices), the rest in series */
  const FMT = {
    ah: { par: [[730, 6, 1], [1090, 7, .5], [2440, 8, .25]], dry: .12 },
    oo: { par: [[310, 6, 1], [870, 7, .32], [2240, 9, .1]], dry: .1 },
    throat: { par: [[300, 5, 1], [1600, 22, .8]], dry: .15 },
    reed: { ser: [["peaking", 1400, 1.2, 3], ["highshelf", 5200, .7, -5]] },
    gtr: { ser: [["peaking", 105, 1.6, 4], ["peaking", 230, 1.4, 2], ["highshelf", 4200, .7, -4]] },
    body: { ser: [["peaking", 290, 1.6, 4], ["peaking", 2900, 1.4, 2.5]] },
    buzz: { ser: [["peaking", 2400, 2.5, 6], ["peaking", 700, 1.2, 2]] },
    grit: { shape: 2.4, ser: [["lowpass", 2600, .7, 0]] }
  };

  /* ---------------- drums ----------------
     A kit names its pieces by lane: k kick, s snare, c clap, h closed hat, O open hat, r ride / cymbal, t low tom,
     m high tom, p and q percussion. A piece is [one-shot, pan, gain]. fam picks the pattern family, duck turns on
     the kick's sidechain dip of bass and harmony from energy 3 (electronic kits only), roll is the lane that plays
     builds, combo rolls and fills, rise the riser's colour, hit the sound that marks a new section. */
  const KITS = {
    brush: { fam: "folk", pc: { k: ["kickSoft", 0, .9], s: ["brush", .05, .8], h: ["shaker", .32, .55], O: ["tamb", -.3, .5], p: ["rim", -.15, .4], t: ["tomLo", -.25, .6], m: ["tomHi", .25, .5] }, roll: "s", rise: "air" },
    boombap: { fam: "boombap", pc: { k: ["kick", 0, .95], s: ["snare", .04, .85], c: ["snap", -.2, .5], h: ["hh", .3, .5], O: ["oh", .3, .4], p: ["rim", -.2, .5], t: ["tomLo", -.25, .6], m: ["tomHi", .25, .5] }, roll: "s", rise: "noise" },
    shanty: { fam: "shanty", pc: { k: ["stomp", 0, 1], s: ["frame", -.1, .8], c: ["clap", .15, .6], h: ["tamb", .35, .45], p: ["frameHi", -.3, .55], q: ["tamb", .35, .55], t: ["frame", -.2, .7], m: ["frameHi", .2, .6] }, roll: "p", rise: "air" },
    clock: { fam: "tick", pc: { k: ["kickSoft", 0, .85], s: ["rim", .1, .6], h: ["shaker", .3, .4], p: ["tick", .4, .45], q: ["gear", -.4, .5], m: ["wood", -.25, .55], t: ["woodLo", .2, .55] }, roll: "m", rise: "air" },
    pop: { fam: "pop", pc: { k: ["kick", 0, .9], s: ["snareTight", .04, .75], c: ["clap", -.1, .55], h: ["shaker", .3, .5], O: ["oh", .3, .35], q: ["tamb", -.35, .5], t: ["tomLo", -.25, .6], m: ["tomHi", .25, .55] }, roll: "s", rise: "air" },
    darbuka: { fam: "maqsum", pc: { k: ["doum", 0, 1], s: ["tek", .12, .75], c: ["clap", -.2, .5], h: ["riq", .35, .45], p: ["zill", -.4, .4], q: ["riq", .35, .5], t: ["doum", -.15, .7], m: ["tek", .15, .7] }, roll: "s", rise: "air" },
    cine: { fam: "cine", pc: { k: ["kickBig", 0, 1], s: ["snare", .03, .75], h: ["hhSoft", .3, .4], p: ["glassHit", -.35, .45], t: ["tomLo", -.3, .75], m: ["tomHi", .3, .65], r: ["crash", .2, .5] }, roll: "t", rise: "cym" },
    taiko: { fam: "taiko", pc: { k: ["taiko", 0, 1], s: ["kata", .2, .6], m: ["taikoHi", -.2, .7], p: ["bamboo", .35, .5], h: ["shaker", -.35, .4], t: ["taiko", -.15, .8] }, roll: "m", rise: "air", hit: "tbell" },
    cave: { fam: "drip", pc: { k: ["kickSub", 0, .95], s: ["rim", .1, .55], h: ["shaker", .3, .4], p: ["drop", -.4, .5], q: ["glassHit", .45, .4], t: ["tomLo", -.25, .55], m: ["drop", .4, .5] }, roll: "p", rise: "cym" },
    foundry: { fam: "industrial", pc: { k: ["kickHeavy", 0, 1], s: ["snare", .03, .8], c: ["anvil", -.2, .55], h: ["hh", .3, .45], p: ["metal", .35, .5], q: ["steam", -.3, .45], t: ["tomLo", -.25, .7], m: ["tomHi", .25, .6] }, roll: "s", rise: "steam" },
    reef: { fam: "drip", pc: { k: ["kickSoft", 0, .9], s: ["rim", .1, .5], h: ["shaker", .3, .4], p: ["bubbleHit", -.4, .5], q: ["drop", .4, .45], t: ["tomLo", -.2, .5], m: ["bubbleHit", .3, .5] }, roll: "p", rise: "air" },
    storm: { fam: "orch", pc: { k: ["timp", 0, .9], s: ["snareOrch", .05, .7], t: ["tomLo", -.3, .8], m: ["tomHi", .3, .7], q: ["triangle", .45, .35], r: ["crash", .2, .5] }, roll: "t", rise: "cym", boom: "thunder" },
    alpine: { fam: "march", pc: { k: ["kick", 0, .9], s: ["snareMarch", .05, .7], p: ["cowbell", .35, .4], r: ["crash", -.2, .45], t: ["tomLo", -.25, .65], m: ["tomHi", .25, .6] }, roll: "s", rise: "air" },
    carnival: { fam: "oompah", pc: { k: ["kickSoft", 0, .95], s: ["handCym", .15, .45], p: ["wood", -.35, .5], q: ["triangle", .4, .35], t: ["tomLo", -.2, .6], m: ["tomHi", .2, .55] }, roll: "p", rise: "noise" },
    synth: { fam: "synth", pc: { k: ["kick808", 0, 1], s: ["snareGated", .02, .7], c: ["clap", -.1, .55], h: ["hh", .3, .45], O: ["oh", .3, .4], q: ["tamb", -.35, .45], t: ["tomSyn", -.3, .6], m: ["tomSynHi", .3, .55] }, roll: "t", rise: "noise", duck: 1 },
    garden: { fam: "folk", pc: { k: ["frame", 0, .85], s: ["tamb", .2, .55], h: ["shaker", .35, .5], O: ["tamb", -.3, .5], p: ["zill", -.4, .35], t: ["frame", -.2, .6], m: ["frameHi", .2, .55] }, roll: "m", rise: "air" },
    gallop: { fam: "gallop", pc: { k: ["kickBig", 0, 1], s: ["snare", .03, .75], h: ["hh", .3, .4], t: ["tomLo", -.25, .7], m: ["tomHi", .25, .6], r: ["crash", .2, .45] }, roll: "t", rise: "noise" },
    ghost: { fam: "orch", pc: { k: ["timp", 0, .95], s: ["snareOrch", .05, .65], t: ["kickBig", 0, .7], m: ["tomLo", -.3, .6], q: ["chain", .45, .45], r: ["gong", 0, .45] }, roll: "k", rise: "cym" },
    funk: { fam: "funk", pc: { k: ["kick", 0, .95], s: ["snareTight", .04, .8], c: ["clap", -.15, .5], h: ["hh", .3, .5], O: ["oh", .3, .4], p: ["cowbell", -.35, .35], q: ["steam", .4, .4], t: ["tomLo", -.25, .6], m: ["tomHi", .25, .55] }, roll: "s", rise: "steam", duck: 1 },
    metal: { fam: "metal", pc: { k: ["kickHeavy", 0, .95], s: ["snare", .03, .8], h: ["hh", .3, .4], r: ["china", .25, .4], t: ["tomLo", -.3, .75], m: ["tomHi", .3, .65] }, roll: "t", rise: "noise" },
    chamber: { fam: "orch", pc: { k: ["timp", 0, .85], s: ["snareOrch", .05, .6], q: ["triangle", .45, .35], t: ["timp5", -.15, .7], m: ["tomHi", .3, .5], r: ["crash", .2, .4] }, roll: "k", rise: "cym" },
    library: { fam: "folk", pc: { k: ["kickSoft", 0, .8], s: ["brush", .05, .7], h: ["page", .35, .5], O: ["shaker", -.3, .45], p: ["wood", -.35, .45], t: ["woodLo", -.2, .5], m: ["wood", .2, .5] }, roll: "s", rise: "air" },
    cathedral: { fam: "orch", pc: { k: ["timp", 0, .9], s: ["snareOrch", .05, .6], t: ["taiko", -.1, .85], m: ["tomHi", .25, .55], q: ["triangle", .45, .3], r: ["gong", 0, .5] }, roll: "k", rise: "cym", hit: "bell" },
    jazz: { fam: "jazz", pc: { k: ["kick", 0, .85], s: ["snare", .05, .75], r: ["ride", .3, .45], h: ["ph", .25, .4], p: ["cowbell", -.35, .35], q: ["anvil", -.4, .4], t: ["tomLo", -.25, .6], m: ["tomHi", .25, .55] }, roll: "s", rise: "noise" },
    electro: { fam: "electro", pc: { k: ["kick808", 0, 1], c: ["clap", -.05, .6], h: ["hh", .3, .45], O: ["oh", .3, .4], p: ["arc", .4, .4], s: ["snareTight", .05, .6], t: ["tomSyn", -.3, .6], m: ["tomSynHi", .3, .55] }, roll: "c", rise: "noise", duck: 1 },
    train: { fam: "train", pc: { k: ["kickSoft", 0, .9], s: ["brush", .1, .75], c: ["snare", -.05, .7], h: ["hhSoft", .3, .4], O: ["oh", .3, .35], p: ["cowbell", -.35, .3], t: ["tomLo", -.25, .6], m: ["tomHi", .25, .55] }, roll: "c", rise: "whistle" },
    bazaar: { fam: "maqsum", pc: { k: ["doum", 0, 1], s: ["tek", .12, .75], c: ["clap", -.25, .55], h: ["riq", .35, .45], p: ["zill", -.4, .4], q: ["riq", .35, .5], t: ["doum", -.15, .7], m: ["tek", .15, .7] }, roll: "s", rise: "air" },
    armada: { fam: "march", pc: { k: ["kickBig", 0, .95], s: ["snareMarch", .05, .75], p: ["timp", -.2, .6], r: ["crash", .2, .45], t: ["tomLo", -.3, .7], m: ["tomHi", .3, .6] }, roll: "s", rise: "cym", boom: "thunder" },
    castle: { fam: "taiko", pc: { k: ["taiko", 0, .95], s: ["snareOrch", .1, .6], m: ["tomHi", -.2, .6], p: ["chain", .4, .4], h: ["hhSoft", .3, .35], t: ["timp", -.1, .8] }, roll: "t", rise: "cym", hit: "bell" },
    finale: { fam: "epic", pc: { k: ["kickBig", 0, 1], s: ["snare", .03, .8], c: ["clap", -.1, .5], h: ["hh", .3, .4], O: ["oh", .3, .35], t: ["taiko", -.15, .85], r: ["timp", .15, .7], m: ["tomHi", .25, .6] }, roll: "t", rise: "cym" }
  };
  /* Pattern families: per energy 1-4, one or more bar variations, lanes of 16 sixteenths. X accent, x normal,
     o ghost. A section plays its variations in turn, the last one on every fourth bar. fill: the last two beats of
     the bar before a change of section (only the lanes it names, the rest keep playing). */
  const FAM = {
    folk: { 1: ["k:X.......x.......|s:....x.......x...|h:x.o.x.o.x.o.x.o."], 2: ["k:X......xX.......|s:....X..o....X...|h:xoxoxoxoxoxoxoxo", "k:X......xX..x....|s:....X..o....X..o|h:xoxoxoxoxoxoxoxo"],
      3: ["k:X......xX..x....|s:....X..o.o..X..o|h:xoxoxoxoxoxoxoxo|O:....x.......x..."], 4: ["k:X...x...X...x...|s:....X..o.o..X..o|h:xoxoxoxoxoxoxoxo|O:..x...x...x...x.|p:x..x..x...x..x.."], fill: "s:........x.x.XxXx|t:..........x...x.|m:........x...x..." },
    boombap: { 1: ["k:X.........x.....|s:....X.......X...|h:x.x.x.x.x.x.x.x."], 2: ["k:X.........X..x..|s:....X..o....X...|h:x.xox.x.x.xox.x.|p:..........x....."],
      3: ["k:X..x......X..x..|s:....X..o.o..X..o|h:xoxoxoxoxoxoxoxo|c:....x.......x..."], 4: ["k:X..x..x...X..x..|s:....X..o.o..X.oo|h:xoxoxoxoxoxoxoxo|c:....X.......X...|O:..............x."], fill: "s:........X..oX.oo|t:..........x...x." },
    shanty: { 1: ["k:X.....X.....X...|c:....x.......x...|p:x..o..x..o..x.o."], 2: ["k:X.....X.....X...|c:....x.......x...|p:x..o..x..o..x.o.|q:..x...x...x...x."],
      3: ["k:X..x..X.....X...|c:....X.......X...|p:x..o..x..o..x.o.|q:x.x.x.x.x.x.x.x."], 4: ["k:X..x..X..x..X.x.|c:....X..x....X..x|p:x..o..x..o..x.o.|q:xoxoxoxoxoxoxoxo|s:......x.....x..."], fill: "p:........x.x.XxXx|t:..........X...X." },
    tick: { 1: ["k:X.......x.......|p:X.o.X.o.X.o.X.o."], 2: ["k:X.......X.......|s:....x.......x...|p:X.o.X.o.X.o.X.o.|q:......x.......x."],
      3: ["k:X.......X..x....|s:....x.......x...|p:XoxoXoxoXoxoXoxo|q:......x.......x.|m:..x..x....x..x.."], 4: ["k:X...x...X...x...|s:....X..o....X..o|p:XoxoXoxoXoxoXoxo|q:..x...x...x...x.|h:xoxoxoxoxoxoxoxo"], fill: "m:........x.x.xxXX|t:............x.x." },
    pop: { 1: ["k:X.......X.......|s:....x.......x...|h:x.x.x.x.x.x.x.x."], 2: ["k:X......xX.......|s:....X.......X...|h:x.xox.x.x.xox.x.|q:....x.......x..."],
      3: ["k:X..x..x.X.......|s:....X.......X...|c:....X.......X...|h:xoxoxoxoxoxoxoxo|q:..x...x...x...x."], 4: ["k:X...x...X...x...|s:....X.......X...|c:....X.......X...|O:..x...x...x...x.|q:xoxoxoxoxoxoxoxo"], fill: "s:........x.x.XXXX|t:............x.x." },
    maqsum: { 1: ["k:X.......X.......|s:..x...x.....x..."], 2: ["k:X.......X.......|s:..x.o.x...o.x.o.|q:x.o.x.o.x.o.x.o."],
      3: ["k:X..x....X.......|s:..x.o.x...o.x.o.|q:xoxoxoxoxoxoxoxo|p:x.......x.......|c:....x.......x..."], 4: ["k:X..x....X..x....|s:..X.o.X.o.o.X.oo|q:xoxoxoxoxoxoxoxo|p:x...x...x...x...|c:....X.......X..."], fill: "s:........XoXoXxXx|k:........X......." },
    cine: { 1: ["k:X...............|s:........x......."], 2: ["k:X.........X.....|s:........X.......|p:..x.......x....."],
      3: ["k:X.....x...X.....|s:....X.......X...|h:x.x.x.x.x.x.x.x.|t:..............x."], 4: ["k:X...x...X...x...|s:....X.......X...|h:xoxoxoxoxoxoxoxo|t:..x.......x...xx|m:......x.......x."], fill: "t:........X.x.XxXx|m:..........x.x..." },
    taiko: { 1: ["k:X.......X.......|s:..x...x...x...x."], 2: ["k:X.....x.X.......|m:....x.......x.x.|p:x.x.x.x.x.x.x.x."],
      3: ["k:X..x..x.X.......|m:....X..x....X.xx|p:x.xox.x.x.xox.x.|h:xoxoxoxoxoxoxoxo"], 4: ["k:X..x..X.X..x..X.|m:....X..x.x..X.xx|p:xoxoxoxoxoxoxoxo|s:..x...x...x...x.|t:X.......X......."], fill: "m:........XxXxXXXX|k:X.......X......." },
    drip: { 1: ["k:X.........x.....|p:..x.....x.....x."], 2: ["k:X.........X.....|s:....x.......x...|p:..x...x..x...x..|h:x.x.x.x.x.x.x.x."],
      3: ["k:X.....x...X.....|s:....x.......x...|p:..x...x..x...x..|q:......x.......x.|h:xoxoxoxoxoxoxoxo"], 4: ["k:X...x...X...x...|s:....X.......X...|p:..x.x..x..x.x..x|q:..x.......x.....|h:xoxoxoxoxoxoxoxo|m:.......x.......x"], fill: "p:........x.x.xxxx|t:............X..." },
    industrial: { 1: ["k:X.......X.......|s:....X.......X..."], 2: ["k:X..x....X..x....|s:....X.......X...|h:x.x.x.x.x.x.x.x.|p:..x.......x....."],
      3: ["k:X..x..x.X..x....|s:....X..x....X...|h:xoxoxoxoxoxoxoxo|p:..x...x...x...x.|q:x..............."], 4: ["k:X.x.X.x.X.x.X.x.|s:....X.......X...|c:....X.......X..x|h:xoxoxoxoxoxoxoxo|p:..X...X...X...X."], fill: "s:........XxXxXXXX|t:..........X.X..." },
    march: { 1: ["k:X.......X.......|s:....x.......x..."], 2: ["k:X.......X.......|s:X..oX.o.X..oX.o.|p:x...x...x...x..."],
      3: ["k:X...x...X...x...|s:XooxXoxoXooxX.xx|p:x...x...x...x..."], 4: ["k:X...X...X...X...|s:X.oxX.oxX.oxXxxx|p:x.x.x.x.x.x.x.x.|t:..............xx"], fill: "s:........xxxxXXXX|t:............X.X." },
    oompah: { 1: ["k:X.......X.......|s:....x.......x..."], 2: ["k:X.......X.......|s:....x.......x...|p:..x...x...x...x."],
      3: ["k:X.......X.......|s:....X.......X...|p:x.....x.....x...|q:x..............."], 4: ["k:X...x...X...x...|s:....X..x....X..x|p:x.x.x.x.x.x.x.x.|q:x.......x......."], fill: "p:........x.x.XxXx|t:............x.x." },
    synth: { 1: ["k:X.......X.......|h:..x...x...x...x."], 2: ["k:X.......X.......|s:....X.......X...|h:x.x.x.x.x.x.x.x."],
      3: ["k:X...X...X...X...|s:....X.......X...|h:xoxoxoxoxoxoxoxo|q:....x.......x..."], 4: ["k:X...X...X...X...|s:....X.......X...|c:....X.......X...|O:..x...x...x...x.|h:xoxoxoxoxoxoxoxo"], fill: "t:........X.x.XxXx|m:..........x.x..." },
    gallop: { 1: ["k:X.......X.......|t:X.xx....X.xx...."], 2: ["k:X.......X.......|s:....X.......X...|t:X.xoX.xoX.xoX.xo"],
      3: ["k:X.......X.......|s:....X.......X...|t:X.xoX.xoX.xoX.xo|h:x.x.x.x.x.x.x.x."], 4: ["k:X.xxX.xxX.xxX.xx|s:....X.......X...|m:..x...x...x...x.|h:xoxoxoxoxoxoxoxo"], fill: "t:........XxXxXxXX|m:........x.x.x.x." },
    funk: { 1: ["k:X.........X.....|s:....X.......X...|h:x.x.x.x.x.x.x.x."], 2: ["k:X..x......X..x..|s:....X..o.o..X..o|h:xoxoxoxoxoxoxoxo"],
      3: ["k:X..x..x...X.x...|s:....X..o.o..X.o.|h:xxoxxxoxxxoxxxox|O:..............x.|p:..x.......x....."], 4: ["k:X..x..x.X..x..x.|s:....X..o.o..X..o|c:....X.......X...|h:xoxoxoxoxoxoxoxo|O:..x.......x.....|q:x..............."], fill: "s:........XoXoXXXX|t:............x.x." },
    metal: { 1: ["k:X.......X.......|s:....X.......X..."], 2: ["k:X.x.....X.x.....|s:....X.......X...|h:x.x.x.x.x.x.x.x."],
      3: ["k:X.xxX.xxX.xxX.xx|s:....X.......X...|r:x...x...x...x..."], 4: ["k:XxxxXxxxXxxxXxxx|s:....X.......X...|t:..x...x...x...x.|r:X.x.X.x.X.x.X.x."], fill: "t:........XxXxXXXX|m:........x.x.x.x." },
    orch: { 1: ["k:X.......x......."], 2: ["k:X.......X.......|s:....x.......x...|q:x..............."],
      3: ["k:X...x...X...x...|s:....X..x....X..x|t:..x.......x.....|q:x.......x......."], 4: ["k:X..xX...X..xX...|s:X.xxX.x.X.xxX.xx|t:..x...x...x...x.|q:x...x...x...x..."], fill: "k:........xxxxXXXX|s:..........x.x.xx" },
    jazz: { 1: ["k:X.......X.......|r:x.x.x.x.x.x.x.x.|h:....x.......x..."], 2: ["k:X......xX.......|s:....X.......X...|r:X.x.X.x.X.x.X.x.|h:....x.......x..."],
      3: ["k:X..x...xX..x....|s:....X..o.o..X..o|r:X.xxX.x.X.xxX.x.|p:x...x...x...x...|q:..........x....."], 4: ["k:X..x..x.X..x..x.|s:....X..o.o..X.oo|r:XxxxXxxxXxxxXxxx|p:x.x.x.x.x.x.x.x.|q:..x.......x....."], fill: "s:........XoXoXXXX|t:..........x...x.|m:........x...x..." },
    electro: { 1: ["k:X.......X.......|h:..x...x...x...x."], 2: ["k:X...X...X...X...|c:....X.......X...|h:..x...x...x...x."],
      3: ["k:X...X...X...X...|c:....X.......X...|h:xxXxxxXxxxXxxxXx|p:...x......x....."], 4: ["k:X...X...X...X...|c:....X.......X...|s:....x.......x...|O:..x...x...x...x.|h:xoxoxoxoxoxoxoxo|p:...x..x....x..x."], fill: "c:........x.x.xxxx|t:............X.X." },
    train: { 1: ["k:X.......X.......|s:x.o.x.o.x.o.x.o."], 2: ["k:X.......X.......|s:XoxoXoxoXoxoXoxo"],
      3: ["k:X...x...X...x...|s:XoxoXoxoXoxoXoxo|c:....X.......X..."], 4: ["k:X...x...X...x...|s:XoxoXoxoXoxoXoxo|c:....X.......X...|O:..x...x...x...x.|p:x...x...x...x..."], fill: "c:........XoXoXXXX|t:............x.x." },
    epic: { 1: ["k:X.......X.......|t:X..............."], 2: ["k:X.......X.......|s:....X.......X...|t:X.....x.X.......|h:x.x.x.x.x.x.x.x."],
      3: ["k:X...x...X...x...|s:....X.......X...|t:X..x..x.X.......|h:xoxoxoxoxoxoxoxo"], 4: ["k:X...X...X...X...|s:....X.......X...|c:....X.......X...|t:X..x..X.X..x..X.|O:..x...x...x...x.|r:X.......X......."], fill: "t:........XxXxXXXX|m:..........x.x.x." }
  };
  /* Grooves: [swing (0.5 straight; the off sixteenths move later), sixteenth velocity shape (digits 0-9),
     micro-timing (digit - 5) × 1.5 ms]. They apply to drums, bass, harmony and answers, never to the lead
     notes that mark actions, which stay exactly on their half-beat. */
  const GROOVE = {
    straight: [.5, "9576857695768576", "5555555555555555"],
    folk: [.54, "9475847594758475", "5545565455455654"],
    lofi: [.6, "9364736494647364", "5545575454455754"],
    mpc: [.57, "9465746594657465", "5545565454455654"],
    six8: [.52, "9446648446649464", "5555555555555555"],
    march: [.5, "9576857695768576", "5555555555555555"],
    pendulum: [.55, "9385738593857385", "5555555555555555"],
    hemi: [.5, "9455548455548455", "5555555555555555"],
    drive: [.5, "9677867796778677", "5454545454545454"],
    funk: [.56, "9576857695768577", "5545565454455654"],
    gallop: [.5, "9688968896889688", "5555555555555555"],
    train: [.58, "9476847694768476", "5555555555555555"],
    float: [.53, "8465746584657465", "5565565556555655"]
  };
  /* Reverb spaces, generated once per context: [T60 s, pre-delay s, early reflections, their spread s, damping
     (how much faster the highs die), width, return gain, flutter period s (cave), distant tail (outdoor)] */
  const SPACE = {
    room: [.8, .006, 8, .03, .55, .7, .9], wood: [1, .008, 9, .035, .6, .7, .9], courtyard: [1.5, .012, 10, .06, .45, .9, .85],
    hall: [2.4, .022, 10, .07, .45, .95, .8], palace: [4.4, .03, 12, .09, .4, 1, .8], cathedral: [4.6, .045, 14, .12, .7, 1, .82],
    cave: [3, .014, 10, .05, .35, .9, .8, .047], plate: [1.9, .002, 0, 0, .15, .9, .75], outdoor: [.5, .004, 4, .05, .5, .8, .7, 0, 1.4],
    underwater: [2, .01, 8, .05, .92, .9, .9]
  };
  /* Ambience beds: a quiet filtered noise loop under the music, never rhythmic: [noise, filter, Hz, Q, LFO Hz, LFO
     depth Hz, level at energy 0..4] */
  const AMB = {
    wind: ["pink", "bandpass", 650, 1.1, .09, 420, [.5, .32, .24, .2, .2]],
    rain: ["white", "bandpass", 5200, .5, .05, 900, [.12, .16, .2, .26, .32]],
    city: ["brown", "lowpass", 320, .7, .04, 90, [.4, .3, .22, .18, .16]],
    sea: ["pink", "lowpass", 700, .8, .11, 500, [.4, .3, .22, .18, .16]],
    water: ["brown", "lowpass", 380, .9, .07, 160, [.45, .35, .28, .24, .22]],
    steam: ["white", "highpass", 3200, .7, .06, 800, [.12, .1, .1, .12, .14]],
    crackle: ["crackle", "bandpass", 2600, .8, .08, 600, [.3, .26, .24, .24, .26]],
    hum: ["pink", "lowpass", 260, .8, .05, 60, [.32, .24, .2, .16, .14]]
  };

  /* ---------------- offline DSP ----------------
     Everything percussive or plucked is computed once into an AudioBuffer (per context, cached by name), so a hit
     at play time is one buffer source and one gain. */
  function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  /* RBJ biquad, run in place over x[i0..i1) */
  function bq(x, sr, type, f, q, db, i0, i1) {
    const w = 2 * Math.PI * Math.min(f, sr * .45) / sr, cw = Math.cos(w), al = Math.sin(w) / (2 * q), A = Math.pow(10, (db || 0) / 40);
    let b0, b1, b2, a0, a1, a2;
    if (type === "lp") { b1 = 1 - cw; b0 = b2 = b1 / 2; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else if (type === "hp") { b1 = -(1 + cw); b0 = b2 = (1 + cw) / 2; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else if (type === "bp") { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else { b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; }
    b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = i0 || 0, n = i1 === undefined ? x.length : i1; i < n; i++) { const v = x[i], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; }
    return x;
  }
  /* building blocks; t and durations in seconds, a pitch sweep falls exponentially from f0 to f1 with time constant ft */
  function sweep(o, sr, t, f0, f1, ft, amp, dec, len) {
    let ph = 0, pe = 1, ae = amp; const i0 = Math.floor(t * sr), n = Math.min(o.length, i0 + Math.floor((len || dec * 7) * sr)), dp = Math.exp(-1 / (sr * ft)), da = Math.exp(-1 / (sr * dec)), k2 = 2 * Math.PI / sr;
    for (let i = i0, k = 0; i < n; i++, k++) { ph += k2 * (f1 + (f0 - f1) * pe); o[i] += Math.sin(ph) * ae * (k < 12 ? k / 12 : 1); pe *= dp; ae *= da; }
  }
  /* a decaying sine added by rotation (two multiply-adds a sample instead of a sin and an exp) */
  function ring(o, i0, n, w, ph, amp, tau, sr) {
    const c = Math.cos(w), s = Math.sin(w), d = Math.exp(-1 / (sr * tau));
    let x = Math.cos(ph) * amp, y = Math.sin(ph) * amp;
    for (let i = i0, k = 0; i < n; i++, k++) { o[i] += k < 8 ? y * k / 8 : y; const nx = (x * c - y * s) * d; y = (x * s + y * c) * d; x = nx; }
  }
  function parts(o, sr, t, list) {
    const i0 = Math.floor(t * sr);
    for (const p of list) {
      const w = 2 * Math.PI * p[0] / sr, n = Math.min(o.length, i0 + Math.floor(p[2] * 8 * sr)), ph0 = p[3] || 0;
      if (p[0] < sr * .48) ring(o, i0, n, w, ph0, p[1], p[2], sr);
    }
  }
  function burst(o, sr, t, amp, att, dec, filt, seed, len) {
    const r = rng(seed || 1), i0 = Math.floor(t * sr), n = Math.min(o.length, i0 + Math.floor((len || dec * 7 + att) * sr)), tmp = new Float32Array(n - i0);
    for (let i = 0; i < tmp.length; i++) tmp[i] = r() * 2 - 1;
    for (const f of filt || []) bq(tmp, sr, f[0], f[1], f[2], f[3]);
    const na = Math.floor(att * sr), dd = Math.exp(-1 / (sr * dec)); let e = 1;
    for (let i = 0; i < tmp.length; i++) { o[i0 + i] += tmp[i] * amp * (i < na ? i / na : e); if (i >= na) e *= dd; }
  }
  /* band-limited 808 metal: the odd harmonics of six detuned squares that fall inside [lo, hi] Hz */
  function metal(o, sr, amp, dec, lo, hi, sc) {
    const fs = [205.3, 304.4, 369.6, 522.7, 540, 800], ws = [], top = Math.min(hi, sr * .46);
    for (const f0 of fs) for (let k = 1; f0 * sc * k < top; k += 2) if (f0 * sc * k > lo) ws.push([2 * Math.PI * f0 * sc * k / sr, 1 / k, (k * 7.1 + f0) % 6.28]);
    const n = Math.min(o.length, Math.floor(dec * 7 * sr));
    for (const w of ws) ring(o, 0, n, w[0], w[2], w[1] * amp, dec, sr);
  }
  function shape(o, drive) { const k = Math.tanh(drive); for (let i = 0; i < o.length; i++) o[i] = Math.tanh(o[i] * drive) / k; return o; }
  /* the drum one-shots: name -> [length s, render(o, sr, soft, f)]; f is a pitch for tuned drums */
  const DRUM = {
    kick: [.5, function (o, sr) { sweep(o, sr, 0, 165, 52, .032, 1, .13); sweep(o, sr, 0, 52, 50, 1, .28, .2); burst(o, sr, 0, .5, .0005, .004, [["hp", 1800, .7]]); shape(o, 1.6); }],
    kickSoft: [.42, function (o, sr) { sweep(o, sr, 0, 110, 50, .03, 1, .11); burst(o, sr, 0, .15, .001, .004, [["lp", 2500, .7]]); }],
    kickBig: [.9, function (o, sr) { sweep(o, sr, 0, 140, 44, .05, 1, .22); burst(o, sr, 0, .35, .001, .05, [["lp", 320, .8]]); burst(o, sr, 0, .25, .0005, .005, [["hp", 1500, .7]]); shape(o, 1.3); }],
    kick808: [1.2, function (o, sr) { sweep(o, sr, 0, 125, 46, .03, 1, .42); burst(o, sr, 0, .25, .0005, .004, [["hp", 2000, .7]]); shape(o, 1.7); }],
    kickSub: [.65, function (o, sr) { sweep(o, sr, 0, 82, 42, .04, 1, .2); }],
    kickHeavy: [.45, function (o, sr) { sweep(o, sr, 0, 190, 50, .025, 1, .14); parts(o, sr, 0, [[1830, .3, .01], [3100, .2, .008]]); burst(o, sr, 0, .4, .0005, .006, [["bp", 3000, 1]]); shape(o, 3); }],
    stomp: [.4, function (o, sr) { sweep(o, sr, 0, 92, 55, .05, 1, .08); burst(o, sr, 0, .6, .002, .05, [["bp", 260, 1.1]], 3); burst(o, sr, .004, .2, .001, .02, [["bp", 1200, 1]], 4); }],
    snare: [.42, function (o, sr, s) { sweep(o, sr, 0, 205, 185, .02, .7, .09); sweep(o, sr, 0, 340, 330, .02, .35, .05); burst(o, sr, 0, s ? .45 : .85, .001, s ? .08 : .12, s ? [["lp", 3200, .7], ["hp", 900, .7]] : [["bp", 4200, .6], ["hp", 1200, .7]], 5); }],
    snareTight: [.3, function (o, sr, s) { sweep(o, sr, 0, 260, 240, .02, .6, .06); sweep(o, sr, 0, 420, 410, .02, .3, .04); burst(o, sr, 0, s ? .4 : .8, .001, s ? .05 : .075, [["hp", s ? 1500 : 2200, .7]], 6); }],
    snareMarch: [.5, function (o, sr, s) { sweep(o, sr, 0, 265, 250, .02, .55, .07); sweep(o, sr, 0, 430, 420, .02, .3, .05); burst(o, sr, 0, s ? .5 : .9, .001, s ? .1 : .16, [["bp", 5200, .5], ["hp", 1600, .7]], 7); }],
    snareOrch: [.55, function (o, sr, s) { sweep(o, sr, 0, 220, 210, .02, .5, .08); sweep(o, sr, 0, 365, 360, .02, .25, .05); burst(o, sr, 0, s ? .45 : .8, .001, s ? .12 : .2, [["bp", 6200, .5], ["hp", 1800, .7]], 8); }],
    snareGated: [.34, function (o, sr) { sweep(o, sr, 0, 200, 180, .02, .7, .1); burst(o, sr, 0, .8, .001, .5, [["bp", 3000, .5], ["hp", 900, .7]], 9, .34); for (let i = 0; i < o.length; i++) { const t = i / sr; if (t > .22) o[i] *= Math.exp(-(t - .22) / .012); } }],
    brush: [.32, function (o, sr, s) { burst(o, sr, 0, s ? .4 : .7, .004, .08, [["lp", 5200, .7], ["hp", 700, .7]], 10); burst(o, sr, .01, .3, .025, .1, [["bp", 2600, .6]], 11); }],
    rim: [.12, function (o, sr) { parts(o, sr, 0, [[1720, .6, .022], [570, .5, .028]]); burst(o, sr, 0, .5, .0003, .002, [["hp", 3000, .7]], 12); }],
    snap: [.15, function (o, sr) { burst(o, sr, 0, 1, .0005, .018, [["bp", 2200, 2.2], ["hp", 900, .7]], 13); }],
    clap: [.4, function (o, sr) { for (let k = 0; k < 4; k++) burst(o, sr, k * .0095, .8, .0005, .0055, [["bp", 1150, 1.6]], 14 + k, .012); burst(o, sr, .028, .7, .001, .11, [["bp", 1100, 1.3]], 18); }],
    hh: [.25, function (o, sr, s) { metal(o, sr, .5, s ? .022 : .034, 5500, 14000, 1); bq(o, sr, "bp", s ? 8000 : 10000, 1); bq(o, sr, "hp", 6500, .7); }],
    hhSoft: [.2, function (o, sr) { metal(o, sr, .5, .026, 4500, 11000, 1); bq(o, sr, "bp", 7500, .9); bq(o, sr, "hp", 5000, .7); }],
    oh: [.75, function (o, sr) { metal(o, sr, .5, .26, 5500, 14000, 1); bq(o, sr, "bp", 9500, .9); bq(o, sr, "hp", 6500, .7); }],
    ph: [.12, function (o, sr) { metal(o, sr, .4, .016, 5000, 12000, 1); bq(o, sr, "bp", 8000, 1); bq(o, sr, "hp", 5000, .7); burst(o, sr, 0, .15, .001, .01, [["bp", 1600, 1]], 19); }],
    shaker: [.16, function (o, sr, s) { burst(o, sr, 0, s ? .5 : .8, .008, .035, [["bp", 7200, 1.3]], 20, .16); burst(o, sr, .018, .4, .004, .025, [["bp", 6500, 1.2]], 21, .1); }],
    tamb: [.4, function (o, sr) { const r = rng(22), L = []; for (let k = 0; k < 9; k++) L.push([4800 + r() * 5200, .25, .1 + r() * .1, r() * 6]); parts(o, sr, 0, L); burst(o, sr, 0, .5, .001, .08, [["bp", 8200, 1]], 23); }],
    riq: [.3, function (o, sr) { const r = rng(24), L = [[680, .4, .03]]; for (let k = 0; k < 7; k++) L.push([5200 + r() * 4500, .2, .07 + r() * .06, r() * 6]); parts(o, sr, 0, L); burst(o, sr, 0, .4, .001, .05, [["bp", 7600, 1]], 25); }],
    ride: [1.6, function (o, sr) { parts(o, sr, 0, [[3115, .2, 1], [4400, .16, .9], [5620, .14, .8], [6230, .1, .7], [7180, .1, .6], [8010, .08, .5]]); burst(o, sr, 0, .25, .001, .9, [["hp", 5000, .7]], 26); burst(o, sr, 0, .3, .0005, .01, [["hp", 3000, .7]], 27); }],
    crash: [2.2, function (o, sr) { burst(o, sr, 0, .9, .002, .75, [["hp", 2800, .6]], 28); metal(o, sr, .12, .9, 3000, 12000, 1.31); }],
    china: [1.4, function (o, sr) { burst(o, sr, 0, .8, .001, .45, [["bp", 4200, .8]], 29); metal(o, sr, .2, .5, 1800, 9000, .87); }],
    handCym: [.8, function (o, sr) { burst(o, sr, 0, .7, .002, .28, [["hp", 4200, .7]], 30); metal(o, sr, .1, .3, 4000, 12000, 1.6); }],
    gong: [4.6, function (o, sr) { const f = 92; parts(o, sr, 0, [[f, .5, 3.8], [f * 1.47, .4, 3.2], [f * 2.09, .45, 2.8], [f * 2.56, .3, 2.4], [f * 3.3, .25, 1.9], [f * 4.11, .2, 1.4], [f * 5.3, .15, 1.1]]);
      for (let i = 0; i < o.length; i++) { const t = i / sr; o[i] *= Math.min(1, t / .05) * (1 + .25 * Math.sin(t * 2 * Math.PI * 2.3)); } burst(o, sr, 0, .2, .002, .05, [["lp", 600, .7]], 31); }],
    tomLo: [.5, function (o, sr) { sweep(o, sr, 0, 125, 88, .05, 1, .18); burst(o, sr, 0, .3, .001, .012, [["bp", 1100, 1]], 32); }],
    tomHi: [.4, function (o, sr) { sweep(o, sr, 0, 195, 145, .04, 1, .14); burst(o, sr, 0, .3, .001, .01, [["bp", 1600, 1]], 33); }],
    tomSyn: [.5, function (o, sr) { sweep(o, sr, 0, 165, 70, .08, 1, .18); }],
    tomSynHi: [.4, function (o, sr) { sweep(o, sr, 0, 250, 110, .07, 1, .14); }],
    taiko: [1.2, function (o, sr) { sweep(o, sr, 0, 78, 52, .06, 1, .33); sweep(o, sr, 0, 150, 140, .05, .3, .09); burst(o, sr, 0, .55, .001, .03, [["lp", 1400, .7]], 34); }],
    taikoHi: [.4, function (o, sr) { sweep(o, sr, 0, 270, 205, .03, .8, .07); burst(o, sr, 0, .5, .0005, .02, [["bp", 2100, 1]], 35); }],
    kata: [.1, function (o, sr) { parts(o, sr, 0, [[1210, .7, .025], [2720, .3, .012]]); burst(o, sr, 0, .3, .0003, .003, [["hp", 2500, .7]], 36); }],
    bamboo: [.2, function (o, sr) { parts(o, sr, 0, [[630, .8, .06], [1890, .3, .025], [3300, .1, .01]]); burst(o, sr, 0, .2, .0003, .003, [["bp", 1800, 1]], 37); }],
    wood: [.14, function (o, sr) { parts(o, sr, 0, [[900, .8, .045], [2380, .25, .018]]); burst(o, sr, 0, .25, .0003, .002, [["bp", 2500, 1]], 38); }],
    woodLo: [.18, function (o, sr) { parts(o, sr, 0, [[565, .8, .06], [1520, .25, .025]]); burst(o, sr, 0, .2, .0003, .002, [["bp", 1600, 1]], 39); }],
    tick: [.06, function (o, sr) { parts(o, sr, 0, [[3150, .5, .01], [5230, .3, .006]]); burst(o, sr, 0, .3, .0002, .001, [["hp", 4000, .7]], 40); }],
    gear: [.12, function (o, sr) { for (let k = 0; k < 3; k++) { parts(o, sr, k * .014, [[2620 + k * 90, .4, .009], [4130, .25, .006]]); burst(o, sr, k * .014, .2, .0002, .002, [["hp", 3500, .7]], 41 + k); } }],
    cowbell: [.5, function (o, sr) { parts(o, sr, 0, [[540, .5, .12], [800, .5, .1], [1620, .2, .05], [2400, .12, .04]]); for (let i = 0; i < o.length; i++) o[i] *= .7 + .3 * Math.exp(-i / sr / .02); bq(o, sr, "bp", 820, 1.2); }],
    triangle: [1.6, function (o, sr) { parts(o, sr, 0, [[1250, .25, 1.3], [3760, .4, 1.1], [5120, .35, .9], [6610, .3, .7], [8350, .2, .5]]); burst(o, sr, 0, .15, .0003, .003, [["hp", 5000, .7]], 44); }],
    zill: [1.2, function (o, sr) { parts(o, sr, 0, [[2900, .5, .9], [3075, .5, .9], [6420, .2, .45], [8200, .1, .3]]); }],
    anvil: [.8, function (o, sr) { parts(o, sr, 0, [[1180, .5, .5], [2650, .45, .4], [3870, .4, .32], [5120, .3, .25], [6900, .2, .18]]); burst(o, sr, 0, .5, .0003, .008, [["hp", 2000, .7]], 45); }],
    metal: [.4, function (o, sr) { burst(o, sr, 0, .8, .0005, .07, [["bp", 3500, 2]], 46); parts(o, sr, 0, [[1430, .4, .14], [2210, .3, .11], [3470, .3, .09]]); }],
    chain: [.3, function (o, sr) { const r = rng(47); for (let k = 0; k < 9; k++) parts(o, sr, r() * .16, [[3000 + r() * 4000, .25, .012], [5500 + r() * 3000, .15, .008]]); }],
    steam: [.6, function (o, sr) { burst(o, sr, 0, .9, .02, .16, [["hp", 2400, .7], ["bp", 5200, .5]], 48); }],
    arc: [.3, function (o, sr) { burst(o, sr, 0, .9, .001, .09, [["hp", 1500, .7]], 49); for (let i = 0; i < o.length; i++) o[i] *= Math.sin(2 * Math.PI * 110 * i / sr) > 0 ? 1 : .15; bq(o, sr, "bp", 3200, .8); }],
    glassHit: [.8, function (o, sr) { parts(o, sr, 0, [[2530, .5, .3], [4130, .4, .22], [6320, .3, .16], [8700, .15, .1]]); }],
    drop: [.25, function (o, sr) { let ph = 0; for (let i = 0; i < o.length; i++) { const t = i / sr; ph += 2 * Math.PI * (1500 - 1000 * Math.exp(-t / .012)) / sr; o[i] += Math.sin(ph) * Math.min(1, t * sr / 24) * Math.exp(-t / .035); } }],
    bubbleHit: [.25, function (o, sr) { let ph = 0; for (let i = 0; i < o.length; i++) { const t = i / sr; ph += 2 * Math.PI * (1100 - 800 * Math.exp(-t / .02)) / sr; o[i] += Math.sin(ph) * Math.min(1, t * sr / 30) * Math.exp(-t / .05); } }],
    frame: [.6, function (o, sr) { sweep(o, sr, 0, 112, 86, .05, 1, .2); burst(o, sr, 0, .4, .001, .04, [["lp", 900, .7]], 50); }],
    frameHi: [.2, function (o, sr) { burst(o, sr, 0, .9, .0005, .03, [["bp", 2200, 1]], 51); sweep(o, sr, 0, 430, 410, .02, .35, .04); }],
    doum: [.55, function (o, sr) { sweep(o, sr, 0, 108, 78, .03, 1, .25); burst(o, sr, 0, .2, .001, .01, [["lp", 700, .7]], 52); }],
    tek: [.18, function (o, sr) { burst(o, sr, 0, .9, .0005, .03, [["bp", 3000, 1.2], ["hp", 1200, .7]], 53); parts(o, sr, 0, [[760, .4, .03]]); }],
    page: [.24, function (o, sr) { burst(o, sr, 0, .9, .01, .07, [["bp", 3200, .8]], 54); const r = rng(55); let j = 1; for (let i = 0; i < o.length; i++) { if (i % 64 === 0) j = .4 + r() * .6; o[i] *= j; } }],
    timp: [1.8, function (o, sr, s, f) { f = f || 98; sweep(o, sr, 0, f * 1.03, f, .03, .9, 1.1); parts(o, sr, 0, [[f * 1.504, .5, .8], [f * 1.992, .3, .6], [f * 2.44, .15, .4]]); burst(o, sr, 0, .35, .001, .035, [["lp", 450, .7]], 56); }],
    boom: [1.3, function (o, sr) { sweep(o, sr, 0, 90, 32, .25, 1, .45); }],
    thunder: [3.6, function (o, sr) { const r = rng(57); let b = 0; for (let i = 0; i < o.length; i++) { b = b * .995 + (r() * 2 - 1) * .05; o[i] = b; } bq(o, sr, "lp", 180, .7);
      const sw = [[0, .02, .5], [.35, .3, .7], [.9, .5, 1.1], [1.7, .6, .9]]; const env = new Float32Array(o.length);
      for (const w of sw) for (let i = Math.floor(w[0] * sr); i < o.length; i++) { const t = i / sr - w[0]; env[i] += w[2] * Math.min(1, t / w[1]) * Math.exp(-Math.max(0, t - w[1]) / .55); }
      for (let i = 0; i < o.length; i++) o[i] *= env[i]; burst(o, sr, 0, .25, .002, .06, [["hp", 900, .7]], 58); }]
  };
  /* drums that shade with velocity get a soft layer under this velocity */
  const SOFT = { snare: 1, snareTight: 1, snareMarch: 1, snareOrch: 1, brush: 1, hh: 1, shaker: 1 }, SOFTV = .55;
  function drumBuf(c, name, soft, f) {
    const key = name + (soft ? "~" : "") + (f ? "@" + f.toFixed(1) : "");
    if (cache.drum[key]) return cache.drum[key];
    const D = DRUM[name === "timp5" ? "timp" : name], sr = c.sampleRate, n = Math.ceil(D[0] * sr), o = new Float32Array(n);   /* timp5: the same drum a fifth up */
    D[1](o, sr, soft, f);
    let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(o[i]));
    const g = pk > 0 ? .9 / pk : 0, fade = Math.min(n, Math.floor(sr * .01));
    for (let i = 0; i < n; i++) o[i] *= g * (i > n - fade ? (n - i) / fade : 1);
    const b = c.createBuffer(1, n, sr); b.getChannelData(0).set(o);
    return (cache.drum[key] = b);
  }
  /* Plucked string (Karplus-Strong, Jaffe-Smith): a filtered noise burst, comb-shaped by the pick position, into a
     tuned delay loop with a two-tap damping filter and an all-pass for the fractional part of the period. The loop
     gain makes the note fall 60 dB in T60, longer for low strings. */
  function ksString(o, sr, f, P, gain, seed) {
    const T = P[0] * Math.pow(220 / f, .45), per = sr / f, S = .05 + .45 * P[3];
    let N = Math.floor(per - S - .1), d = per - N - S; if (d < .1) { N--; d += 1; }
    const C = (1 - d) / (1 + d), g = Math.pow(.001, 1 / (f * T)), r = rng(seed), exc = new Float32Array(N), pick = Math.max(1, Math.round(P[2] * N));
    let lp = 0; const a = .08 + .9 * P[1] * P[1];
    for (let i = 0; i < N; i++) { lp += a * (r() * 2 - 1 - lp); exc[i] = lp; }
    for (let i = N - 1; i >= pick; i--) exc[i] -= exc[i - pick];
    const buf = new Float32Array(N); let idx = 0, prev = 0, ax = 0, ay = 0;
    for (let n = 0; n < o.length; n++) {
      const x = buf[idx], l = (1 - S) * x + S * prev; prev = x;
      const ap = C * l + ax - C * ay; ax = l; ay = ap;
      const v = ap * g + (n < N ? exc[n] : 0); buf[idx] = v; if (++idx === N) idx = 0;
      o[n] += v * gain;
    }
  }
  function ksBuf(c, name, midi) {
    const key = name + midi;
    if (cache.ks[key]) return cache.ks[key];
    const P = PATCH[name], sr = Math.min(c.sampleRate, 32000), f = mtof(midi), T = P.ks[0] * Math.pow(220 / f, .45);
    const n = Math.ceil(Math.min(4.5, T * .85 + .05) * sr), o = new Float32Array(n);
    ksString(o, sr, f, P.ks, 1, hash(key));
    if (P.tk) ksString(o, sr, f * Math.pow(2, (P.tk[0] + P.tk[1] / 100) / 12), P.ks, P.tk[2], hash(key) + 1);
    let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(o[i]));
    const fade = Math.floor(sr * .03), g = .9 / (pk || 1);
    for (let i = 0; i < n; i++) o[i] *= g * (i > n - fade ? (n - i) / fade : 1);
    const b = c.createBuffer(1, n, sr); b.getChannelData(0).set(o);
    return (cache.ks[key] = b);
  }
  /* Reverb impulse: pre-delay, sparse early reflections, then a noise tail whose highs die faster than its lows
     (damping); a cave adds flutter echoes, the outdoors a faint far-away tail. Normalised by the convolver. */
  function spaceBuf(c, name) {
    if (cache.ir[name]) return cache.ir[name];
    const P = SPACE[name], sr = c.sampleRate, T = P[0], pre = P[1], hiT = T * (1 - .75 * P[4]), far = P[8] || 0;
    /* cut at about -40 dB (0.7 T60) with a taper: the rest is far below the mix, and a shorter impulse sets up faster */
    const n = Math.ceil((pre + Math.max(T * .7, far * .8) + .05) * sr), b = c.createBuffer(2, n, sr), L = [];
    for (let ch = 0; ch < 2; ch++) {
      const d = new Float32Array(n), r = rng(hash(name) + ch * 77), t0 = pre + P[3] * .35, fi = Math.max(.008, P[3] * .6);
      const i0 = Math.floor(t0 * sr), dL = Math.exp(-6.91 / (sr * T)), dH = Math.exp(-6.91 / (sr * hiT)), dF = far ? Math.exp(-6.91 / (sr * far)) : 1, iF = Math.floor((pre + .06) * sr);
      let lo = 0, b1 = 0, eL = Math.exp(-6.91 * (i0 / sr - pre) / T), eH = Math.exp(-6.91 * (i0 / sr - pre) / hiT), eF = 1;
      for (let i = i0; i < n; i++) {
        const x = r() * 2 - 1, fade = Math.min(1, (i / sr - t0) / fi);
        lo += .06 * (x - lo); b1 = x - lo;
        d[i] = (lo * 3.2 * eL + b1 * eH) * fade; eL *= dL; eH *= dH;
        if (far && i >= iF) { d[i] = d[i] * .85 + (r() * 2 - 1) * .14 * eF * Math.min(1, (i - iF) / (sr * .1)); eF *= dF; }
      }
      for (let k = 0; k < P[2]; k++) { const i = Math.floor((pre + P[3] * (k + r()) / P[2]) * sr); if (i < n) { const g = (.9 - .6 * k / P[2]) * (r() < .5 ? -1 : 1); d[i] += g; if (i + 1 < n) d[i + 1] += g * .5; } }
      if (P[7]) for (let k = 1; k < 16; k++) { const i = Math.floor((pre + k * P[7] + ch * .003) * sr); if (i < n) { d[i] += .7 * Math.pow(.8, k); if (i + 2 < n) d[i + 2] -= .4 * Math.pow(.8, k); } }
      if (P[4] > .85) bq(d, sr, "lp", 1400, .7);
      L.push(d);
    }
    const w = P[5], tp = Math.floor(n * .8);
    for (let i = 0; i < n; i++) { const l = L[0][i], r2 = L[1][i], k = i > tp ? .5 + .5 * Math.cos(Math.PI * (i - tp) / (n - tp)) : 1; L[0][i] = l * k; L[1][i] = (r2 * w + l * (1 - w)) * k; }
    b.getChannelData(0).set(L[0]); b.getChannelData(1).set(L[1]);
    return (cache.ir[name] = b);
  }
  /* noise beds: white, pink (Kellet), brown, and a sparse crackle */
  function noiseBuf(c, kind) {
    if (cache.nz[kind]) return cache.nz[kind];
    const sr = c.sampleRate, n = sr * (kind === "white" ? 1 : 4), o = new Float32Array(n), r = rng(hash(kind));
    let b0 = 0, b1 = 0, b2 = 0, br = 0, pk = 0;
    for (let i = 0; i < n; i++) {
      const w = r() * 2 - 1;
      if (kind === "pink") { b0 = .99765 * b0 + w * .099; b1 = .963 * b1 + w * .2965; b2 = .57 * b2 + w * 1.0527; o[i] = b0 + b1 + b2 + w * .1848; }
      else if (kind === "brown") { br = (br + .02 * w) / 1.02; o[i] = br; }
      else if (kind === "crackle") { o[i] = r() < 60 / sr ? (r() * 2 - 1) * (.3 + r() * .7) : 0; }
      else o[i] = w;
      pk = Math.max(pk, Math.abs(o[i]));
    }
    if (kind === "crackle") bq(o, sr, "bp", 3000, .7);
    const fade = Math.floor(sr * .05);
    for (let i = 0; i < fade; i++) { const k = i / fade; o[n - fade + i] = o[n - fade + i] * (1 - k) + o[i] * k; }
    for (let i = 0; i < n; i++) o[i] /= pk || 1;
    const b = c.createBuffer(1, n, sr); b.getChannelData(0).set(o);
    return (cache.nz[kind] = b);
  }

  /* ---------------- engine ---------------- */
  let ctx = null, mix = null, volG = null, pz = null, song = null, bus = null, cache = null;
  let t0 = 0, ei = 0, cyc = 0, vol = 0.8, timer = 0, offline = false, susT = 0;
  const stats = { maxV: 0, skipped: 0, worst: 0, played: 0 };
  /* Chrome, Firefox and Safari delay a DynamicsCompressor's output by a 6 ms look-ahead; the master has two, so every
     event is sent that much early and beat b still reaches the speakers at t0 + b * spb (plus output latency, which
     the game's clock already allows for) */
  const PROC = 0.012, MIX = .42;
  /* group levels (the lead sits inside the mix, a light accent on the actions, not a line over the music), role -> group, role pans */
  const GRP = { k: .68, d: .48, b: .72, h: .42, l: .5, a: .55, x: .5 };
  const ROLE = { l: "l", l2: "l", c: "l", a: "a", m: "a", p: "h", h: "h", r: "h", z: "h", b: "b", x: "x" };
  const RPAN = { l: 0, l2: .06, c: .12, a: -.32, m: .3, p: 0, h: -.28, r: .34, z: 0, b: 0, x: 0 };

  function build(c) {
    ctx = c; cache = { drum: {}, ks: {}, ir: {}, nz: {}, wave: {} };
    /* master: mix -> broad shelves -> glue compressor -> limiter -> safety curve -> volume -> pause fade -> out */
    mix = c.createGain(); mix.gain.value = MIX;
    const ls = c.createBiquadFilter(), hs = c.createBiquadFilter(), glue = c.createDynamicsCompressor(), lim = c.createDynamicsCompressor();
    ls.type = "lowshelf"; ls.frequency.value = 120; ls.gain.value = 1.5; hs.type = "highshelf"; hs.frequency.value = 8500; hs.gain.value = 1.5;
    glue.threshold.value = -18; glue.knee.value = 6; glue.ratio.value = 2.8; glue.attack.value = .01; glue.release.value = .15;
    lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = .001; lim.release.value = .08;
    volG = c.createGain(); volG.gain.value = vol; pz = c.createGain(); pz.gain.value = 1;
    /* the limiter can overshoot a sharp transient by a little; a safety curve, straight up to 0.8 and easing into a
       ceiling of 0.97, makes sure nothing ever clips (it only touches those few peaks) */
    const cap = c.createWaveShaper(), cv = new Float32Array(4097);
    for (let i = 0; i < cv.length; i++) { const x = i / 2048 - 1, a = Math.abs(x); cv[i] = Math.sign(x) * (a <= .8 ? a : .8 + .17 * Math.tanh((a - .8) / .17)); }
    /* (no oversampling on any shaper here: 2x delays its path by 128 samples, which would pull that part off the
       grid; every shaper's input is already low-passed, so the curves add little to alias) */
    cap.curve = cv; cap.oversample = "none";
    mix.connect(ls); ls.connect(hs); hs.connect(glue); glue.connect(lim); lim.connect(cap); cap.connect(volG); volG.connect(pz); pz.connect(c.destination);
  }
  function wave(name) {
    if (cache.wave[name]) return cache.wave[name];
    const fn = WAVES[name], n = 96, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = fn(k);
    return (cache.wave[name] = ctx.createPeriodicWave(re, im));
  }
  function curve(drive) { const n = 2048, cv = new Float32Array(n), k = Math.tanh(drive); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; cv[i] = Math.tanh(x * drive) / k; } return cv; }
  function lfo(b, hz) {
    const k = hz.toFixed(2);
    if (b.lfo[k]) return b.lfo[k];
    const o = ctx.createOscillator(); o.frequency.value = hz; o.start(b.at); b.src.push(o);
    return (b.lfo[k] = o);
  }
  function hasFx(S, tok) { return S.spec.fx.indexOf(tok) >= 0; }
  /* A song's bus: groups, sends, reverb, delay, colour and ambience. start() makes a new one every time, and stop()
     fades it out, so a retry or a rewind never carries a tail from the run before. */
  function newBus(S, at) {
    const c = ctx, sp = S.spec, b = { out: c.createGain(), lv: c.createGain(), grp: {}, part: {}, lfo: {}, src: [], act: [], choke: {}, at: at };
    b.lv.gain.value = Math.pow(10, (sp.trim || 0) / 20);
    let tail = b.lv;
    if (hasFx(S, "tape")) { const w = c.createWaveShaper(); w.curve = curve(1.25); w.oversample = "none"; tail.connect(w); tail = w; }
    if (hasFx(S, "muff")) {
      const m = c.createBiquadFilter(), g = c.createGain(); m.type = "lowpass"; m.frequency.value = 2400; m.Q.value = .8; g.gain.value = 700;
      lfo(b, .07).connect(g); g.connect(m.frequency); tail.connect(m); tail = m;
    }
    tail.connect(b.out); b.out.connect(mix);
    /* reverb and delay returns */
    const rv = c.createConvolver(), rr = c.createGain(), rh = c.createBiquadFilter(), SP = SPACE[sp.space];
    rv.buffer = spaceBuf(c, sp.space); rr.gain.value = SP[6] * (sp.wet || 1); rh.type = "highpass"; rh.frequency.value = 140;
    b.rv = c.createGain(); b.rv.connect(rh); rh.connect(rv); rv.connect(rr); rr.connect(b.lv);
    b.dl = c.createGain();
    const dt = { dot8: .75, q: 1, e: .5, trip: 2 / 3, long: 1.5 }, dk = Object.keys(dt).filter(function (k) { return hasFx(S, k); })[0];
    if (dk || hasFx(S, "slap")) {
      const T = Math.min(1.9, dk ? dt[dk] * S.spb : .09), fb = dk === "long" ? .4 : .34;
      const dL = c.createDelay(2), dR = c.createDelay(2), f1 = c.createGain(), f2 = c.createGain(), lp = c.createBiquadFilter(), hp = c.createBiquadFilter(), mg = c.createChannelMerger(2), ret = c.createGain();
      dL.delayTime.value = T; dR.delayTime.value = T; f1.gain.value = fb; f2.gain.value = fb; lp.type = "lowpass"; lp.frequency.value = 3400; hp.type = "highpass"; hp.frequency.value = 260;
      ret.gain.value = .55;
      b.dl.connect(hp); hp.connect(lp); lp.connect(dL); dL.connect(f1); f1.connect(dR); dR.connect(f2); f2.connect(dL);
      dL.connect(mg, 0, 0); dR.connect(mg, 0, 1); mg.connect(ret); ret.connect(b.lv);
    }
    /* groups: a high-pass at 30 Hz on everything but kick and bass; bass and harmony through the sidechain dip */
    b.duck = c.createGain(); b.duck.connect(b.lv);
    for (const gname in GRP) {
      const g = c.createGain(); g.gain.value = GRP[gname];
      let to = gname === "b" || gname === "h" ? b.duck : b.lv;
      if (gname === "h" && hasFx(S, "cho")) {
        const d1 = c.createDelay(.05), d2 = c.createDelay(.05), m1 = c.createGain(), m2 = c.createGain(), p1 = c.createStereoPanner(), p2 = c.createStereoPanner(), w = c.createGain();
        d1.delayTime.value = .013; d2.delayTime.value = .019; m1.gain.value = .0025; m2.gain.value = .003; p1.pan.value = -.8; p2.pan.value = .8; w.gain.value = .45;
        lfo(b, .31).connect(m1); m1.connect(d1.delayTime); lfo(b, .43).connect(m2); m2.connect(d2.delayTime);
        g.connect(d1); g.connect(d2); d1.connect(p1); d2.connect(p2); p1.connect(w); p2.connect(w); w.connect(to);
      }
      if (gname === "l" && hasFx(S, "sat")) { const w = c.createWaveShaper(), pre = c.createGain(); w.curve = curve(2.2); w.oversample = "none"; pre.gain.value = 1; pre.connect(w); w.connect(g); b.grp[gname + "in"] = pre; }
      if (gname !== "k" && gname !== "b") { const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 30; hp.Q.value = .6; g.connect(hp); hp.connect(to); }
      else g.connect(to);
      b.grp[gname] = g;
    }
    /* ambience bed */
    const A = sp.ambience && AMB[sp.ambience];
    if (A) {
      const s = c.createBufferSource(), f = c.createBiquadFilter(), d = c.createGain(), g = c.createGain(), gm = c.createGain(), gd = c.createGain();
      s.buffer = noiseBuf(c, A[0]); s.loop = true; f.type = A[1]; f.frequency.value = A[2]; f.Q.value = A[3]; d.gain.value = A[5];
      lfo(b, A[4]).connect(d); d.connect(f.frequency);
      gm.gain.value = .75; gd.gain.value = .25; lfo(b, A[4] * .61).connect(gd); gd.connect(gm.gain);
      g.gain.value = 0; s.connect(f); f.connect(gm); gm.connect(g); g.connect(b.grp.x);
      const sg = c.createGain(); sg.gain.value = .3; g.connect(sg); sg.connect(b.rv);
      s.start(at, (S.seed % 97) / 97 * 2); b.src.push(s); b.amb = g;
    }
    return b;
  }
  /* a part: one patch in one role, with its formant / body filter, pan and sends, built on first use */
  function partIn(role, name, pan) {
    const key = role + ":" + name + (pan === undefined ? "" : ":" + pan);
    let p = bus.part[key];
    if (p) return p;
    const c = ctx, P = PATCH[name] || {}, g = c.createGain(), pn = c.createStereoPanner(), F = P.fmt && FMT[P.fmt], grp = ROLE[role] || "x";
    pn.pan.value = pan === undefined ? RPAN[role] || 0 : pan;
    let o = g;
    if (F) {
      if (F.shape) { const w = c.createWaveShaper(); w.curve = curve(F.shape); w.oversample = "none"; o.connect(w); o = w; }
      if (F.par) {
        const sum = c.createGain(), dry = c.createGain(); dry.gain.value = F.dry; o.connect(dry); dry.connect(sum);
        for (const q of F.par) { const f = c.createBiquadFilter(), fg = c.createGain(); f.type = "bandpass"; f.frequency.value = q[0]; f.Q.value = q[1]; fg.gain.value = q[2] * Math.sqrt(q[1]) * .9; o.connect(f); f.connect(fg); fg.connect(sum); }
        o = sum;
      }
      if (F.ser) for (const q of F.ser) { const f = c.createBiquadFilter(); f.type = q[0]; f.frequency.value = q[1]; f.Q.value = q[2]; f.gain.value = q[3]; o.connect(f); o = f; }
    }
    o.connect(pn); pn.connect(grp === "l" && bus.grp.lin ? bus.grp.lin : bus.grp[grp]);
    const sp = song.spec;
    if (P.rv || role === "x") { const s = c.createGain(); s.gain.value = (P.rv || .4) * (sp.rv || 1); pn.connect(s); s.connect(bus.rv); }
    if (P.dl && (role === "l" || role === "a" || role === "m" || role === "r" || role === "c")) { const s = c.createGain(); s.gain.value = P.dl * (sp.dl || 1); pn.connect(s); s.connect(bus.dl); }
    return (bus.part[key] = g);
  }
  function drumIn(lane, pc) {
    const key = "dr:" + lane;
    let p = bus.part[key];
    if (p) return p;
    const c = ctx, pn = c.createStereoPanner(); p = c.createGain();
    pn.pan.value = pc[1]; p.connect(pn); pn.connect(bus.grp[lane === "k" || lane === "t" || lane === "x" || pc[0] === "timp" ? "k" : "d"]);
    const s = c.createGain(); s.gain.value = song.spec.drv === undefined ? (lane === "k" ? .12 : .32) : song.spec.drv * (lane === "k" ? .4 : 1); pn.connect(s); s.connect(bus.rv);
    return (bus.part[key] = p);
  }
  /* voice limiter: past MAXV sounding voices, the lowest priority (drums, then harmony, ...) and oldest is faded out */
  function track(rec) {
    const A = bus.act, t = rec.s;
    for (let i = A.length - 1; i >= 0; i--) if (A[i].e <= t) A.splice(i, 1);
    while (A.length >= MAXV) {
      let k = 0; for (let i = 1; i < A.length; i++) if (A[i].pr < A[k].pr || (A[i].pr === A[k].pr && A[i].s < A[k].s)) k = i;
      kill(A[k], t); A.splice(k, 1);
    }
    A.push(rec); if (A.length > stats.maxV) stats.maxV = A.length;
  }
  function kill(r, t, tau) {
    tau = tau || .006;
    try { r.g.gain.cancelScheduledValues(t); r.g.gain.setTargetAtTime(0, t, tau); } catch (e) {}
    for (const s of r.srcs) try { s.stop(t + tau * 9); } catch (e) {}
    r.e = t;
  }
  const PRIO = { d: 0, x: 0, r: 1, h: 1, p: 1, z: 1, m: 2, a: 2, b: 3, l2: 3, c: 4, l: 5 };
  /* a pitched voice: oscillators / FM / noise through a filter and a click-free envelope */
  function oscVoice(e, t, P, dst) {
    const c = ctx, f = mtof(e.m), v = e.v, dur = Math.max(.02, e.d * song.spb), A = e.at || P.a, R = e.rl || P.r;
    const amp = c.createGain(), pk = P.g * Math.pow(v, 1.4), srcs = [];
    let head = amp, end, stopAt;
    amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(pk, t + Math.max(.002, A));
    if (P.s > 0) { end = t + Math.max(dur, A + .01); amp.gain.setTargetAtTime(pk * P.s, t + A, P.d / 3); amp.gain.setTargetAtTime(0, end, R / 5); stopAt = end + R * 1.6; }
    else { const ring = Math.min(P.d, e.cut ? dur + R : 99); end = t + A + ring; amp.gain.setTargetAtTime(0, t + A, ring / 3.5); stopAt = end * 1 + ring * .9; if (e.cut) { amp.gain.setTargetAtTime(0, t + dur, R / 5); stopAt = Math.min(stopAt, t + dur + R * 1.6); } }
    if (P.f) {
      const fl = c.createBiquadFilter(), F = P.f, base = Math.min(16000, F[0] * Math.pow(2, (e.m - 60) / 12 * F[1]) * (1 - F[2] + F[2] * v * 1.3));
      fl.type = P.ft || "lowpass"; fl.Q.value = F[5];
      fl.frequency.setValueAtTime(Math.min(17000, base * F[3]), t); fl.frequency.setTargetAtTime(base, t + .002, F[4] / 2.5);
      if (P.s > 0) fl.frequency.setTargetAtTime(base * .7, end, R / 3);
      fl.connect(amp); head = fl;
    }
    let out = amp;
    if (P.trem) { const tg = c.createGain(), dg = c.createGain(); tg.gain.value = 1 - P.trem[0] / 2; dg.gain.value = P.trem[0] / 2; lfo(bus, P.trem[1]).connect(dg); dg.connect(tg.gain); amp.connect(tg); out = tg; }
    if (e.pan !== undefined) { const pn = c.createStereoPanner(); pn.pan.value = e.pan; out.connect(pn); pn.connect(dst); } else out.connect(dst);
    const pb = e.bd || P.pb, oscs = [];
    P.o.forEach(function (O, i) {
      const n = i === 0 && P.uni ? P.uni[0] : 1, ratio = O[3] || 1;
      for (let u = 0; u < n; u++) {
        const o = c.createOscillator(), det = (O[1] || 0) + (n > 1 ? (u / (n - 1) - .5) * P.uni[1] * 2 : 0);
        if (O[0] === "sine") o.type = "sine"; else o.setPeriodicWave(wave(O[0]));
        if (e.gl && P.gl) { o.frequency.setValueAtTime(mtof(e.gl) * ratio, t); o.frequency.exponentialRampToValueAtTime(f * ratio, t + P.gl); } else o.frequency.value = f * ratio;
        if (pb) { o.detune.setValueAtTime(det + pb[0] * 100, t); o.detune.linearRampToValueAtTime(det, t + pb[1]); } else o.detune.value = det;
        /* unison voices are spread across the stereo field; other layers just get their level */
        const og = (O[2] === undefined ? 1 : O[2]) / (n > 1 ? Math.sqrt(n) : 1);
        let to = head;
        if (n > 1) { const pn = c.createStereoPanner(); pn.pan.value = (u / (n - 1) - .5) * 2 * P.uni[2]; pn.connect(to); to = pn; }
        if (og !== 1) { const gg = c.createGain(); gg.gain.value = og; gg.connect(to); to = gg; }
        o.connect(to);
        o.start(t); o.stop(stopAt); oscs.push(o); srcs.push(o);
      }
    });
    if (P.fm) for (const M of P.fm) {
      const m = c.createOscillator(), mg = c.createGain(), dev = M[1] * f * M[0] * (.45 + .75 * v) * Math.pow(2, -(e.m - 60) / 24);
      m.frequency.value = Math.min(18000, f * M[0]); mg.gain.setValueAtTime(dev, t); mg.gain.setTargetAtTime(dev * M[3], t, M[2] / 2.5);
      m.connect(mg); for (const o of oscs) mg.connect(o.frequency);
      m.start(t); m.stop(stopAt); srcs.push(m);
    }
    if (P.nz) {
      const N = P.nz, s = c.createBufferSource(), bp = c.createBiquadFilter(), ng = c.createGain(), lv = N[2] * pk / P.g * P.g;
      s.buffer = noiseBuf(c, "white"); s.loop = true; bp.type = "bandpass"; bp.frequency.value = N[0]; bp.Q.value = N[1];
      ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(lv, t + Math.max(.0005, N[3])); ng.gain.setTargetAtTime(lv * N[5], t + N[3], N[4] / 3);
      if (N[5] > 0) ng.gain.setTargetAtTime(0, end, R / 5);
      s.connect(bp); bp.connect(ng); ng.connect(head);
      const ns = N[5] > 0 ? stopAt : t + N[3] + N[4] * 5; s.start(t, (t * 7.31) % .9); s.stop(Math.min(stopAt, ns)); srcs.push(s);
    }
    if (P.vib && dur > P.vib[2] * .8) {
      const vg = c.createGain(), d0 = t + P.vib[2];
      vg.gain.setValueAtTime(0, t); vg.gain.setValueAtTime(0, d0); vg.gain.linearRampToValueAtTime(P.vib[0], d0 + .35);
      lfo(bus, P.vib[1]).connect(vg); for (const o of oscs) vg.connect(o.detune);
    }
    if (P.drift) { const dg = c.createGain(); dg.gain.value = P.drift; lfo(bus, .53).connect(dg); for (const o of oscs) dg.connect(o.detune); }
    return { s: t, e: stopAt, g: amp, srcs: srcs };
  }
  /* a plucked voice: the cached string, its pitch scoop on the playback rate, velocity on a lowpass */
  function ksVoice(e, t, P, dst) {
    const c = ctx, src = c.createBufferSource(), lp = c.createBiquadFilter(), g = c.createGain(), v = e.v, f = mtof(e.m);
    src.buffer = ksBuf(c, e.p, e.m);
    const pb = e.bd || P.pb;
    if (pb) { src.playbackRate.setValueAtTime(Math.pow(2, pb[0] / 12), t); src.playbackRate.linearRampToValueAtTime(1, t + pb[1]); }
    lp.type = "lowpass"; lp.frequency.value = Math.min(15000, Math.max(f * 2.5, 1200 + 11000 * v * v)); lp.Q.value = .5;
    const pk = P.g * Math.pow(v, 1.4); let stopAt = t + src.buffer.duration + .05;
    g.gain.setValueAtTime(pk, t);
    if (e.cut) { const off = t + Math.max(.04, e.d * song.spb); g.gain.setTargetAtTime(0, off, P.dmp / 4); stopAt = Math.min(stopAt, off + P.dmp * 1.6); }
    src.connect(lp); lp.connect(g);
    if (e.pan !== undefined) { const pn = c.createStereoPanner(); pn.pan.value = e.pan; g.connect(pn); pn.connect(dst); } else g.connect(dst);
    src.start(t); src.stop(stopAt);
    return { s: t, e: stopAt, g: g, srcs: [src] };
  }
  function note(e, t) {
    const P = PATCH[e.p]; if (!P) return;
    const dst = partIn(e.g, e.p);
    /* a choke group (a string struck again, a ringing lead under its next note) damps the old voice first */
    if (e.ch) { const old = bus.choke[e.ch]; if (old && old.e > t) kill(old, t, e.ch === "lead" ? .04 : .012); }
    const r = P.ks ? ksVoice(e, t, P, dst) : oscVoice(e, t, P, dst);
    r.pr = PRIO[e.g] || 0; r.v = e.v; track(r);
    if (e.ch) bus.choke[e.ch] = r;
  }
  function hit(e, t) {
    const pc = e.pc, src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = drumBuf(ctx, pc[0], SOFT[pc[0]] && e.v < SOFTV, pc[0] === "timp" ? song.timp : pc[0] === "timp5" ? song.timp * 1.4983 : 0);
    g.gain.value = pc[2] * Math.pow(e.v, 1.2);
    src.connect(g); g.connect(drumIn(e.l, pc)); src.start(t);
    const r = { s: t, e: t + src.buffer.duration, g: g, srcs: [src], pr: e.l === "k" ? 2 : 0, v: e.v };
    if (e.ch) { const old = bus.choke[e.ch]; if (old && old.e > t) kill(old, t); bus.choke[e.ch] = r; }
    track(r);
  }
  /* risers: filtered noise (or a breathy whistle) sweeping up into the downbeat that follows */
  function riser(e, t) {
    const c = ctx, dur = e.d * song.spb, v = e.v, g = c.createGain(), k = e.p;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * .25, t + dur * .6); g.gain.linearRampToValueAtTime(v, t + dur * .96); g.gain.linearRampToValueAtTime(0, t + dur + .03);
    const dst = partIn("x", "riser"), srcs = [];
    if (k === "whistle") {
      for (const iv of [0, 4, 9]) {
        const o = c.createOscillator(); o.setPeriodicWave(wave("calli")); o.frequency.setValueAtTime(mtof(song.root + 12 + iv), t); o.frequency.exponentialRampToValueAtTime(mtof(song.root + 17 + iv), t + dur);
        const og = c.createGain(); og.gain.value = .22; o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + .06); srcs.push(o);
      }
    }
    const s = c.createBufferSource(), f = c.createBiquadFilter();
    s.buffer = noiseBuf(c, "white"); s.loop = true;
    if (k === "cym") { f.type = "highpass"; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(2500, t + dur); f.Q.value = .7; }
    else if (k === "air") { f.type = "bandpass"; f.Q.value = 1.2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3800, t + dur); }
    else if (k === "down") { f.type = "bandpass"; f.Q.value = 1.6; f.frequency.setValueAtTime(6000, t); f.frequency.exponentialRampToValueAtTime(300, t + dur); g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .03); g.gain.setTargetAtTime(0, t + .05, dur / 3); }
    else { f.type = "bandpass"; f.Q.value = k === "steam" ? .9 : 2.2; f.frequency.setValueAtTime(k === "steam" ? 1500 : 500, t); f.frequency.exponentialRampToValueAtTime(k === "steam" ? 9000 : 7000, t + dur); }
    s.connect(f); f.connect(g); g.connect(dst); s.start(t, (t * 3.17) % .9); s.stop(t + dur + .3); srcs.push(s);
    track({ s: t, e: t + dur + .3, g: g, srcs: srcs, pr: 1, v: v });
  }
  function play(e, t) {
    stats.played++;
    switch (e.y) {
      case "n": note(e, t); break;
      case "d": hit(e, t); break;
      case "r": riser(e, t); break;
      case "a": if (bus.amb) bus.amb.gain.setTargetAtTime(e.v, t, song.spb * 1.2); break;
      case "k": bus.duck.gain.setTargetAtTime(.5, t, .004); bus.duck.gain.setTargetAtTime(1, t + .035, song.spb * .13); break;
    }
  }

  /* ---------------- arranger ----------------
     The first twelve mu fields keep their old meaning and act as defaults (kit, bass and arp patterns, lead and
     second voice, pad, swing); mu[12], when a level has one, names everything else (js/levels.js header). */
  const LEG = {
    kit: ["pop", "funk", "synth", "pop", "boombap", "taiko", "cine", "alpine", "brush", "cave", "synth", "boombap", "taiko"],
    bass: ["root", "pump", "walk", "sub", "acid", "rootfifth", "pedal", "sync", "pump", "acid", "sync"],
    arp: [null, "up", "updown", "broken", "rand", "updown", "seq"], pad: [null, "padWarm", "padAir", "organ", "strings"], lead: { square: "analog", arp: "pluck" }
  };
  const BPATCH = { acid: "bacid", sub: "sub", walk: "upright", oompah: "tuba", drone: "sub", pedal: "synthbass", piston: "grit", gallop: "synthbass" };
  function spec(def) {
    /* with a named spec, a layer it leaves out (pad, arp, drone, comping) is simply not there */
    const m = def.mu, named = !!m[12], x = m[12] || {}, ap = named ? null : LEG.arp[m[8]];
    const s = { kit: x.kit || LEG.kit[m[5]] || "pop", groove: x.groove || (m[10] >= .1 ? "mpc" : m[10] > 0 ? "folk" : "straight"),
      bassStyle: x.bassStyle || LEG.bass[m[6]] || "root", harm: x.harm || "none", comp: x.comp || null,
      pad: x.pad !== undefined || named ? x.pad || null : LEG.pad[m[9]], lead: x.lead || LEG.lead[m[7]] || m[7], answer: x.answer || LEG.lead[m[11]] || m[11] || "chime",
      arp: x.arp !== undefined ? x.arp : ap ? "pluck:" + ap : null, drone: x.drone || null, perc: x.perc || null, space: x.space || "hall",
      fx: (x.fx || "dot8").split(" "), ambience: x.ambience || null, col: x.col || "", drop: x.drop || "", motif: x.motif || def.name };
    ["wet", "trim", "rv", "dl", "drv", "rise", "rev"].forEach(function (k) { if (x[k] !== undefined) s[k] = x[k]; });
    s.bass = x.bass || BPATCH[s.bassStyle] || "finger";
    /* lead / answer "none": that voice is left out (its line is still written, so the answers can echo it) */
    s.noLead = x.lead === "none"; s.noAnswer = x.answer === "none";
    if (!PATCH[s.lead]) s.lead = "pluck"; if (!PATCH[s.answer]) s.answer = "chime";
    return s;
  }
  function semi(S, d) { const n = S.sc.length; return S.sc[((d % n) + n) % n] + 12 * Math.floor(d / n); }
  function mod(a, n) { return ((a % n) + n) % n; }
  function chordAt(S, bar) { const p = (bar >> 3) & 1 ? S.pB : S.pA; return +p[bar % p.length] - 1; }
  /* chord tones as scale degrees; colour: 7 adds the seventh, 9 the ninth, 5 is a bare power chord */
  function tones(S, d) { const c = S.spec.col; return c === "5" ? [d, d + 4] : c === "7" ? [d, d + 2, d + 4, d + 6] : c === "9" ? [d, d + 2, d + 4, d + 8] : [d, d + 2, d + 4]; }
  /* the next chord's voicing moves as little as possible from the last one (close position, any inversion) */
  function voice(S, d, prev, lo, hi, n) {
    const pcs = tones(S, d).map(function (t) { return mod(semi(S, t), 12); }), r0 = S.root % 12;
    if (pcs.length < n) pcs.push(pcs[0]);
    let best = null, bc = 1e9;
    for (let inv = 0; inv < pcs.length; inv++) for (let base = lo; base <= hi; base++) {
      if (mod(base - r0, 12) !== pcs[inv]) continue;
      const v = [base];
      for (let k = 1; k < n; k++) { let m = v[k - 1] + 1; while (mod(m - r0, 12) !== pcs[(inv + k) % pcs.length]) m++; v.push(m); }
      if (v[n - 1] > hi) continue;
      let cost = 0;
      if (prev) for (let k = 0; k < n; k++) cost += Math.abs(v[k] - prev[k]); else cost = Math.abs(v[0] + v[n - 1] - lo - hi);
      if (cost < bc) { bc = cost; best = v; }
    }
    return best || prev || [lo + mod(S.root - lo, 12)];
  }
  /* a 2-bar motif, one degree per half-beat cell: a contour shape, varied by the seed, with passing notes between */
  const SHAPES = [[0, 1, 2, 4, 3, 2, 1, 0], [4, 3, 2, 3, 1, 0, -1, 0], [0, -1, 0, 2, 1, 3, 4, 2], [0, 2, 1, 3, 2, 4, 3, 1], [0, 0, 2, 1, 0, -1, -3, -1], [0, 4, 3, 2, 1, 2, 0, 1]];
  function motif(seed) {
    const r = rng(seed), sh = SHAPES[Math.floor(r() * SHAPES.length)], s0 = [0, 2, 4, 2][Math.floor(r() * 4)], sk = sh.map(function (v, k) { return s0 + v + (k > 1 && k < 7 && r() < .35 ? (r() < .5 ? -1 : 1) : 0); });
    const M = [];
    for (let k = 0; k < 8; k++) { const a = sk[k], b = sk[(k + 1) % 8], d = b - a; M.push(a, Math.abs(d) >= 2 ? a + Math.sign(d) : r() < .5 ? a : a + (r() < .5 ? 1 : -1)); }
    return M;
  }
  /* development per phrase: o original, u / d a step up / down, t a third up, h a fifth up, i inverted, r backwards */
  const VAR = { o: 0, u: 1, d: -1, t: 2, h: 4 };
  function devel(M, v, p) { return v === "i" ? 2 * M[0] - M[p] : v === "r" ? M[15 - p] : M[p] + VAR[v]; }
  const ROLEV = { intro: "o", calm: "or", groove: "ou", build: "ouid", peak: "tort", climax: "thoh", breath: "r", outro: "od" };
  function nearest(S, r, cands) { let best = r, bd = 1e9; for (let k = r - 7; k <= r + 7; k++) if (cands.indexOf(mod(k, S.sc.length)) >= 0 && Math.abs(k - r) < bd) { bd = Math.abs(k - r); best = k; } return best; }
  /* the lead degree d as midi inside the patch's range */
  function inRange(S, base, d, lo, hi) { let m = base + semi(S, d); while (m > hi) m -= 12; while (m < lo) m += 12; return m; }
  /* a melody's tonic: near middle C to the E above it, but at least a third over the patch's lowest note, so the
     line sings in the middle of the instrument and a fifth or sixth above it still fits */
  function baseFor(S, P) { const lo = P.rng[0], hi = P.rng[1], c = Math.max(lo + 4, Math.min(hi - 16, 62)); let b = S.root % 12; while (b + 6 < c) b += 12; return b; }

  /* the pattern families, parsed once */
  const LANES = {};
  function lanes(str) { if (LANES[str]) return LANES[str]; const o = {}; str.split("|").forEach(function (s) { o[s[0]] = s.slice(2); }); return (LANES[str] = o); }
  const VEL = { X: 1, x: .8, o: .42 };

  function arrange(S) {
    const sp = S.spec, ev = [], bars = S.bars, loop = S.loop, passes = loop ? 4 : 1, NB = bars * passes, n = S.sc.length, spb = S.spb, st = spb / 4;
    const G = GROOVE[sp.groove] || GROOVE.straight, K = KITS[sp.kit] || KITS.pop, F = FAM[K.fam], R = rng(S.seed ^ 0x9E3779B9);
    const LP = PATCH[sp.lead], AP = PATCH[sp.answer], sus = function (P) { return !P.ks && P.s > 0; };
    S.cycle = NB * 4;
    /* per-bar energy (the home loop varies by pass), chords per half bar with a cadence into the closing chord */
    const E = [], CH = [];
    for (let b = 0; b < NB; b++) {
      const bb = b % bars, pass = Math.floor(b / bars);
      E.push(loop ? Math.max(0, Math.min(4, S.energy[bb] + [-1, 0, 0, -1][pass])) : S.energy[bb]);
      const c = chordAt(S, bb); CH.push(c, c);
    }
    const dom = S.sc.indexOf(7) >= 0 && ["phryg", "phrydom", "dblharm"].indexOf(S.mode) < 0 ? S.sc.indexOf(7) : 1;
    if (!loop) CH[NB * 2 - 1] = dom;
    const chordOf = function (b, cell) { return CH[mod(b, NB) * 2 + (cell >= 4 ? 1 : 0)]; };
    /* sections: runs of one energy (the home loop: four-bar phrases) */
    const sec = [], secOf = [];
    for (let b = 0; b < NB; b++) {
      const last = sec[sec.length - 1];
      if (!last || E[b] !== E[b - 1] || (loop && b % 4 === 0)) sec.push({ from: b, to: b + 1, e: E[b] }); else last.to = b + 1;
      secOf.push(sec.length - 1);
    }
    sec.forEach(function (s, i) {
      const p = sec[i - 1];
      s.role = loop ? ["groove", "build", "peak", "build"][i % 4] : s.e === 0 ? (i === 0 ? "intro" : "calm") : s.e === 1 && p && p.e >= 3 && s.to - s.from <= 2 ? "breath" :
        i === sec.length - 1 ? "outro" : ["intro", "groove", "build", "peak", "climax"][s.e];
    });
    const act = function (b) { const bb = mod(b, NB) % bars; for (let i = 0; i < 8; i++) if (S.chart[bb * 8 + i]) return true; return false; };
    const add = function (e) { ev.push(e); return e; };
    /* groove: swing and micro-timing (never later on the downbeat), velocity shape, a little seeded variation */
    const gro = function (pos, kick) {
      let o = pos % 2 ? (G[0] - .5) * 2 * st : 0, mt = (G[2].charCodeAt(pos) - 53) * .0015 + (R() - .5) * .004;
      mt = Math.max(-.008, Math.min(.008, mt)); if (pos === 0 && kick) mt = Math.min(0, mt);
      return { o: o + mt, v: (.5 + (G[1].charCodeAt(pos) - 48) / 18) * (1 + (R() - .5) * .12) };
    };

    /* ---- harmony: voice-led pads, comping, arps, drones ---- */
    const PP = sp.pad && PATCH[sp.pad], CP = sp.comp && PATCH[sp.comp];
    let pv = null, cv = null, padEv = null;
    for (let pass = 0; pass < (loop ? 2 : 1); pass++) for (let b = 0; b < NB; b++) {
      /* (the loop runs twice so bar 0 is voiced from the last bar: the seam connects) */
      const e = E[b], s = sec[secOf[b]], c0 = CH[b * 2], c1 = CH[b * 2 + 1], bt = b * 4 * TPQ;
      if (PP) {
        const lo = Math.max(PP.rng[0], 50), hi = Math.min(PP.rng[1], 77);
        for (let h = 0; h < 2; h++) {
          const c = h ? c1 : c0; if (h && c1 === c0) continue;
          pv = voice(S, c, pv, lo, hi, 4);
          if (loop && pass === 0) continue;
          const len = h || c1 !== c0 ? 2 : 4, at = bt + h * 2 * TPQ;
          if (padEv && padEv.c === c && padEv.sec === s && !h && padEv.end === at) { padEv.list.forEach(function (x) { x.d += len; }); padEv.end += len * TPQ; continue; }
          const list = pv.map(function (m, k) { return add({ y: "n", g: "p", p: sp.pad, b: at / TPQ, o: 0, m: m, d: len, v: (e === 0 ? .55 : .62 + e * .05) * (k === 3 ? .8 : 1) }); });
          if (e >= 4) list.push(add({ y: "n", g: "p", p: sp.pad, b: at / TPQ, o: 0, m: pv[pv.length - 1] + 12 <= 88 ? pv[pv.length - 1] + 12 : pv[1] + 12, d: len, v: .42 }));
          padEv = { c: c, sec: s, end: at + len * TPQ, list: list };
        }
      }
      if (loop && pass === 0) continue;
      /* comping */
      if (CP && e >= 1 && s.role !== "breath") {
        const lo = Math.max(CP.rng[0], CP.ks ? 45 : 50), hi = Math.min(CP.rng[1], CP.ks ? 74 : 79);
        const pat = COMP[sp.harm] && COMP[sp.harm][Math.min(e, 4)];
        for (let pos = 0; pat && pos < 16; pos++) {
          const ch = pat[pos]; if (ch === "." || ch === "-") continue;
          const c = pos < 8 ? c0 : c1; cv = voice(S, c, cv, lo, hi, CP.ks ? 4 : 3);
          let L = 1; while (pos + L < 16 && pat[pos + L] === "-") L++;
          const g = gro(pos), at = bt + pos * 12, dur = CP.ks ? L * .25 + .2 : Math.max(.2, L * .25 * .85);
          if (sp.harm === "strum") {
            const strings = [cv[0] - 12].concat(cv), up = ch === "u", seq = up ? strings.slice(1).reverse() : strings, vv = ch === "D" ? .9 : ch === "d" ? .62 : .5;
            seq.forEach(function (m, k) { add({ y: "n", g: "h", p: sp.comp, b: at / TPQ, o: g.o + k * .011, m: m, d: dur, v: vv * g.v * (1 - k * .04), cut: 1, ch: "st" + k }); });
          } else if (sp.harm === "pick") {
            const m = ch === "T" ? cv[0] - 12 : cv[Math.min(cv.length - 1, +ch)];
            add({ y: "n", g: "h", p: sp.comp, b: at / TPQ, o: g.o, m: m, d: dur + .5, v: (ch === "T" ? .8 : .58) * g.v, ch: "pk" + ch });
          } else if (sp.harm === "ostinato") {
            const m = ch === "r" ? cv[0] : ch === "f" ? cv[0] + 7 : cv[0] + 12;
            add({ y: "n", g: "h", p: sp.comp, b: at / TPQ, o: g.o, m: m, d: dur, v: (pos % 4 ? .62 : .82) * g.v, cut: 1 });
          } else cv.forEach(function (m) { add({ y: "n", g: "h", p: sp.comp, b: at / TPQ, o: g.o, m: m, d: dur, v: (ch === "X" ? .85 : .66) * g.v, cut: 1 }); });
        }
      }
      /* the reverse swell before a downbeat (envelopes only): the next bar's chord, rising into it */
      if (sp.rev && e >= 2 && b < NB - 1) {
        const nv = voice(S, CH[b * 2 + 2], null, 60, 79, 3), at = bt + 2 * TPQ;
        nv.slice(1).forEach(function (m) { add({ y: "n", g: "p", p: "swell", b: at / TPQ, o: 0, m: m, d: 2, v: .55, at: spb * 2 * .97, rl: .05 }); });
      }
      /* arpeggio */
      /* (on the home loop the arp only joins the middle two passes, so the four passes differ) */
      if (sp.arp && (e >= 2 || sp.arp.indexOf("rand") > 0) && !(loop && Math.floor(b / bars) % 3 === 0)) {
        const q = sp.arp.split(":"), AR = PATCH[q[0]], kind = q[1] || "up", vo = voice(S, c0, null, Math.max(AR.rng[0], 60), Math.min(AR.rng[1], 88), 3), vo2 = voice(S, c1, null, Math.max(AR.rng[0], 60), Math.min(AR.rng[1], 88), 3);
        const steps = kind === "rand" ? 2 : e >= 3 ? 1 : 2, IDX = ARPS[kind] || ARPS.up;
        for (let pos = 0; pos < 16; pos += steps) {
          const tl = (pos < 8 ? vo : vo2).concat((pos < 8 ? vo : vo2).map(function (m) { return m + 12; }));
          let k = IDX[(pos / steps) % IDX.length];
          if (kind === "rand") { if (R() > (e >= 3 ? .45 : .28)) continue; k = Math.floor(R() * tl.length); }
          const m = tl[k % tl.length]; if (m > AR.rng[1]) continue;
          const g = gro(pos);
          add({ y: "n", g: "r", p: q[0], b: (bt + pos * 12) / TPQ, o: g.o, m: m, d: steps * .25 * 1.6, v: (kind === "rand" ? .5 : .45) * g.v * (pos % 4 ? .85 : 1), pan: kind === "rand" || q[0] === "glass" ? (R() - .5) * 1.4 : undefined, cut: AR.ks ? 0 : 1 });
        }
      }
      /* drone: root and fifth, re-struck every four bars and at each section */
      if (sp.drone && (b === s.from || (b - s.from) % 4 === 0)) {
        const DP = PATCH[sp.drone], root = DP.rng[0] + mod(S.root - DP.rng[0], 12), L = Math.min(4, s.to - b) * 4;
        add({ y: "n", g: "z", p: sp.drone, b: bt / TPQ, o: 0, m: root, d: L, v: e === 0 ? .6 : .7 });
        if (root + 7 <= DP.rng[1]) add({ y: "n", g: "z", p: sp.drone, b: bt / TPQ, o: 0, m: root + 7, d: L, v: .5 });
      }
    }

    /* ---- bass ---- */
    const BP = PATCH[sp.bass], br = BP.rng[0] + mod(S.root - BP.rng[0], 12) + (BP.rng[0] + mod(S.root - BP.rng[0], 12) < 33 ? 12 : 0);
    S.timp = mtof(38 + mod(S.root - 38, 12));
    const acid = acidPat(S.seed);
    let prevBass = 0;
    for (let b = 0; b < NB; b++) {
      const e = E[b], s = sec[secOf[b]], bt = b * 4 * TPQ;
      if (e === 0 && sp.bassStyle !== "drone") continue;
      const pat = sp.bassStyle === "acid" ? acid[b % 2] : sp.bassStyle === "walk" ? "R---w---W---a---" : BSTY[sp.bassStyle] || BSTY.root;
      const simple = e <= 1 || s.role === "breath";
      for (let pos = 0; pos < 16; pos++) {
        const ch = pat[pos]; if (ch === "." || ch === "-") continue;
        if (simple && pos % 8 !== 0) continue;
        let L = 1; while (pos + L < 16 && (pat[pos + L] === "-" || (simple && pos + L < 16 && (pos + L) % 8 !== 0))) L++;
        const c = pos < 8 ? CH[b * 2] : CH[b * 2 + 1], nx = loop ? CH[mod(b + 1, NB) * 2] : b + 1 < NB ? CH[(b + 1) * 2] : 0, tl = tones(S, c);
        const rootM = br + semi(S, c) - semi(S, 0) - (semi(S, c) >= 7 ? 12 : 0);
        let m = rootM;
        if (ch === "f" || ch === "W") m = rootM + mod(semi(S, tl[2 % tl.length]) - semi(S, c), 12);
        else if (ch === "t") m = rootM + mod(semi(S, tl[1]) - semi(S, c), 12);
        else if (ch === "o") m = rootM + 12;
        else if (ch === "w") m = rootM + mod(semi(S, c + 1) - semi(S, c), 12);
        else if (ch === "a") { const nr = br + semi(S, nx) - semi(S, 0) - (semi(S, nx) >= 7 ? 12 : 0); m = nr + (rootM > nr ? 1 : -1) * (sp.bassStyle === "walk" ? 1 : mod(semi(S, nx) - semi(S, nx - 1), 12)); }
        while (m < BP.rng[0]) m += 12; while (m > BP.rng[1]) m -= 12;
        const g = gro(pos), stac = { pump: .5, piston: .45, gallop: .55, funk: .55, acid: .7, sync: .7, pedal: .5 }[sp.bassStyle] || .92;
        const slide = sp.bassStyle === "acid" && acid.sl[pos] && pos > 0;
        add({ y: "n", g: "b", p: sp.bass, b: (bt + pos * 12) / TPQ, o: g.o, m: m, d: L * .25 * (slide ? 1.05 : stac), v: (ch === "R" ? .95 : ch === "o" ? .72 : .8) * g.v * (e === 0 ? .7 : 1), gl: slide ? prevBass : 0, cut: 1 });
        prevBass = m;
      }
      if (e >= 4 && b === s.from) add({ y: "n", g: "b", p: "sub", b: bt / TPQ, o: 0, m: Math.max(24, br - 12 + semi(S, CH[b * 2]) - semi(S, 0)), d: 4, v: .55 });
    }

    /* ---- the lead: a note on every action, motif-based ----
       A light accent inside the mix, not a line over it: short notes (held patches stop well before the next
       action), no slides, no doubling. On a level with lead "none" the line is only written, for the answers. */
    const addL = sp.noLead ? function () {} : add;
    const M = motif(hash(sp.motif)), lb = baseFor(S, LP), lo = LP.rng[0], hi = LP.rng[1];
    const cells = [];
    for (let b = 0; b < NB; b++) for (let c = 0; c < 8; c++) { const a = S.chart[(b % bars) * 8 + c]; if (a) cells.push({ b: b, c: c, a: a }); }
    let prev = null, lastSec = -1, phr = -1;
    const seedRot = S.seed % 4;
    cells.forEach(function (x, i) {
      const s = sec[secOf[x.b]], si = secOf[x.b], dens = S.dens[x.b % bars], rel = x.b - s.from;
      const vs = ROLEV[s.role] || "o", ph = Math.floor(rel / 2), v = vs[(ph + seedRot + (loop ? Math.floor(x.b / bars) : 0)) % vs.length], p = (rel % 2) * 8 + x.c;
      const newPhrase = si !== lastSec || ph !== phr; lastSec = si; phr = ph;
      let r = devel(M, v, p);
      const tl = tones(S, chordOf(x.b, x.c)).map(function (t) { return mod(t, n); });
      if (dens >= 5 && prev !== null) { r = prev + Math.max(-2, Math.min(2, r - prev)); if (r === prev && R() < .6) r += M[p] >= M[(p + 15) % 16] ? 1 : -1; }
      if (x.c % 4 === 0 || (x.c % 2 === 0 && R() < .6)) r = nearest(S, r, tl);
      if (prev !== null && !newPhrase && Math.abs(r - prev) > 5) { const alt = r - 7 * Math.sign(r - prev); r = Math.abs(alt - prev) < Math.abs(r - prev) ? alt : prev + 4 * Math.sign(r - prev); if (x.c % 4 === 0) r = nearest(S, r, tl); }
      const nxt = cells[i + 1], endSec = !nxt || secOf[nxt.b] !== si;
      if (endSec) r = nearest(S, prev === null ? r : prev, [0, 2]);
      let m = inRange(S, lb, r, lo, hi);
      while (m - lb > 14 && m - 12 >= lo) m -= 12;
      prev = r;
      const at = (x.b * 8 + x.c) * 24, gap = nxt ? ((nxt.b * 8 + nxt.c) - (x.b * 8 + x.c)) * .5 : 4;
      const dense = dens >= 5, eb = E[x.b], ring = !sus(LP) && (LP.ks ? LP.ks[0] : LP.d) > 1.6;
      const dur = dense ? Math.min(gap, .5) * .6 : sus(LP) ? Math.min(gap, 1) * .7 : Math.min(gap, 4);
      const vel = (eb >= 2 ? .74 : eb === 1 ? .68 : .62) + (x.c % 4 === 0 ? .05 : 0) - (dense && x.c % 2 ? .05 : 0);
      if (x.a === 2) {
        const m2 = m - 12 >= lo ? m - 12 : m;
        addL({ y: "n", g: "l", p: sp.lead, b: at / TPQ, o: 0, m: m2, d: Math.max(.25, dur * .8), v: vel, bd: [3, .07], act: 2, cut: 1, ch: ring ? "lead" : 0 });
      } else {
        addL({ y: "n", g: "l", p: sp.lead, b: at / TPQ, o: 0, m: m, d: dur, v: vel, act: x.a, cut: dense || sus(LP) ? 1 : 0, ch: ring ? "lead" : 0 });
        if (x.a === 3) { let cm = m + 12; while (cm > 104) cm -= 12; addL({ y: "n", g: "c", p: "cue", b: at / TPQ, o: 0, m: cm, d: Math.max(.5, dur), v: .5 }); }
      }
      x.r = r;
    });

    /* ---- answers: in empty bars and breathers, a second voice echoes the last phrase in another register ---- */
    const ab = baseFor(S, AP), lead0 = inRange(S, lb, 0, lo, hi), ans = Math.abs(ab - lead0) < 7 ? (ab + 12 <= AP.rng[1] - 5 ? ab + 12 : ab - 12) : ab;
    let echo = [M[0], M[2], M[4]];
    for (let b = 0; b < NB && !sp.noAnswer; b++) {
      const s = sec[secOf[b]], bt = b * 4 * TPQ, has = act(b);
      cells.forEach(function (x) { if (x.b === b - 1 || (x.b === b - 2 && !act(b - 1))) { echo.push(x.r); if (echo.length > 4) echo.shift(); } });
      let room = has ? 0 : 8;
      if (has && s.role === "breath") { for (let c = 0; c < 8; c++) if (S.chart[(b % bars) * 8 + c]) { room = Math.max(0, c - 1); break; } }
      if (room < 2) continue;
      const tl = tones(S, CH[b * 2]).map(function (t) { return mod(t, n); });
      const seq = b === 0 || E[b] === 0 && !has ? [M[0], M[2], M[4]] : echo.slice().reverse();
      const rhythm = room >= 8 ? [0, 2, 3, 4, 6] : [0, 2].filter(function (c) { return c < room; });
      rhythm.slice(0, seq.length + (room >= 8 ? 1 : 0)).forEach(function (c, i) {
        let d = seq[i % seq.length] + (i === seq.length ? -1 : 0); if (c % 4 === 0) d = nearest(S, d, tl);
        const g = gro(c * 2), bird = sp.answer === "whistle" && E[b] <= 1;
        add({ y: "n", g: b === 0 || E[b] === 0 ? "m" : "a", p: sp.answer, b: (bt + c * 24) / TPQ, o: g.o, m: inRange(S, ans, d, AP.rng[0], AP.rng[1]), d: c === rhythm[rhythm.length - 1] ? 1.5 : .9, v: (E[b] === 0 ? .4 : .48) * g.v, cut: sus(AP) ? 1 : 0 });
        if (bird && i % 2 === 0) add({ y: "n", g: "a", p: sp.answer, b: (bt + c * 24 + 12) / TPQ, o: gro(c * 2 + 1).o, m: inRange(S, ans, d + 1, AP.rng[0], AP.rng[1]), d: .2, v: .32 * g.v, cut: 1 });
      });
    }

    /* ---- drums, fills, risers and the cues that mark the form ---- */
    const PC = K.pc, crash = PC.r && PC.r[0] !== "timp" ? PC.r : ["crash", .2, .45], perc = sp.perc ? sp.perc.split(":") : null;
    for (let b = 0; b < NB; b++) {
      const e = E[b], s = sec[secOf[b]], bt = b * 4 * TPQ, nxt = mod(b + 1, NB), nE = loop ? E[nxt] : b + 1 < NB ? E[b + 1] : -1;
      const combo = !loop && S.combo[b + 1], build = !loop && nE >= 4 && e < 4 && !combo;
      if (e >= 1) {
        const vars = F[Math.min(4, e)];
        let L = lanes(vars.length > 1 && (b - s.from) % 4 === 3 ? vars[vars.length - 1] : vars[0]);
        if (s.role === "breath") { const h = {}; h.k = "X..............."; h.s = "........x......."; if (L.h) h.h = "x...x...x...x..."; if (L.c && !L.s) h.c = h.s; L = h; }
        const fill = !loop && nE !== e && nE >= 1 && b < NB - 1 && !build && !combo && s.role !== "breath" ? lanes(F.fill) : loop && b % 16 === 15 ? lanes(F.fill) : null;
        const used = Object.keys(L).concat(fill ? Object.keys(fill).filter(function (k) { return !L[k]; }) : []);
        used.forEach(function (ln) {
          if (!PC[ln]) return;
          for (let pos = 0; pos < 16; pos++) {
            const ch = fill && fill[ln] && pos >= 8 ? fill[ln][pos] : L[ln] ? L[ln][pos] : ".";
            if (!VEL[ch]) continue;
            const g = gro(pos, ln === "k");
            add({ y: "d", l: ln, pc: PC[ln], b: (bt + pos * 12) / TPQ, o: g.o, v: Math.min(1, VEL[ch] * g.v), ch: ln === "h" || ln === "O" ? "hat" : 0 });
            if (ln === "k" && K.duck && e >= 3) add({ y: "k", b: (bt + pos * 12) / TPQ, o: g.o });
          }
        });
        if (perc && e >= 3) for (let pos = 0; pos < 16; pos++) if (VEL[perc[1][pos]]) { const g = gro(pos); add({ y: "d", l: "P", pc: [perc[0], .45, .4], b: (bt + pos * 12) / TPQ, o: g.o, v: VEL[perc[1][pos]] * g.v }); }
        /* a crash on a new section and every eight bars; a bell for kits that mark sections that way */
        if (b > 0 && e >= 2 && (b === s.from || (b - s.from) % 8 === 0) && !(e >= 4 && E[b - 1] < 4)) add({ y: "d", l: "r", pc: crash, b: bt / TPQ, o: 0, v: .85 });
      }
      if (K.hit && b === s.from && e >= 1 && b > 0) add({ y: "n", g: "x", p: K.hit, b: bt / TPQ, o: 0, m: inRange(S, 0, 0, PATCH[K.hit].rng[0] + 7, PATCH[K.hit].rng[1]), d: 4, v: .6 });
      /* the drop: the first bar of a run of energy 4 lands with a crash and a sub boom (and thunder, a whoosh, a whistle chord) */
      if (e >= 4 && (b === 0 || E[b - 1] < 4)) {
        add({ y: "d", l: "r", pc: crash, b: bt / TPQ, o: 0, v: 1 });
        add({ y: "d", l: "x", pc: ["boom", 0, .8], b: bt / TPQ, o: 0, v: 1 });
        if (K.boom) add({ y: "d", l: "x", pc: [K.boom, 0, .7], b: bt / TPQ, o: 0, v: 1 });
        if (sp.drop.indexOf("whoosh") >= 0) add({ y: "r", p: "down", b: bt / TPQ, o: 0, d: 2, v: .22 });
        if (sp.drop.indexOf("chord") >= 0) [0, 4, 7, 10].forEach(function (iv) { add({ y: "n", g: "x", p: "calliope", b: bt / TPQ, o: 0, m: S.root % 12 + 72 + iv - (iv >= 7 ? 12 : 0), d: 2, v: .5, cut: 1 }); });
      }
      const roll = PC[K.roll] ? K.roll : "s", rp = PC[roll];
      /* the build: the bar before a drop rises and rolls, unless a combo cue already does */
      if (build) {
        add({ y: "r", p: sp.rise || K.rise, b: bt / TPQ, o: 0, d: 4, v: .1 + .03 * e });
        if (rp) for (let pos = 8; pos < 16; pos++) add({ y: "d", l: roll, pc: rp, b: (bt + pos * 12) / TPQ, o: gro(pos).o, v: .3 + (pos - 8) * .085 });
      }
      /* combo cue: a riser across the second half of the bar before a combo and a quick roll on its last beat */
      if (combo) {
        add({ y: "r", p: sp.rise || K.rise, b: (bt + 2 * TPQ) / TPQ, o: 0, d: 2, v: .13 + .03 * e });
        if (rp) for (let pos = 12; pos < 16; pos++) add({ y: "d", l: roll, pc: rp, b: (bt + pos * 12) / TPQ, o: gro(pos).o, v: .4 + (pos - 12) * .14 });
      }
      if (sp.ambience && (b === 0 || E[b] !== E[b - 1])) add({ y: "a", b: bt / TPQ, o: 0, v: AMB[sp.ambience][6][e] });
    }

    /* ---- the end: a cadence onto the tonic, left to ring ---- */
    if (!loop) {
      const bt = NB * 4 * TPQ, B = bt / TPQ, fin = voice(S, 0, pv, Math.max(50, PP ? PP.rng[0] : 50), 77, 4);
      if (PP) fin.forEach(function (m) { add({ y: "n", g: "p", p: sp.pad, b: B, o: 0, m: m, d: 4, v: .75, rl: 2.5 }); });
      if (CP) { const cf = voice(S, 0, cv, Math.max(CP.rng[0], 48), Math.min(CP.rng[1], 76), 4); cf.forEach(function (m, k) { add({ y: "n", g: "h", p: sp.comp, b: B, o: k * .028, m: m, d: 3, v: .7, rl: 1.8 }); }); }
      add({ y: "n", g: "b", p: sp.bass, b: B, o: 0, m: br, d: 3, v: .9, rl: 1.2 });
      add({ y: "n", g: "b", p: "sub", b: B, o: 0, m: br - 12 >= 24 ? br - 12 : br, d: 3, v: .7, rl: 1.5 });
      /* the last note on the tonic: the lead's, or without one the answer's */
      addL({ y: "n", g: "l", p: sp.lead, b: B, o: 0, m: inRange(S, lb, nearest(S, prev || 0, [0]), lo, hi), d: 2, v: .62, rl: 2 });
      if (sp.noLead && !sp.noAnswer) add({ y: "n", g: "a", p: sp.answer, b: B, o: 0, m: inRange(S, ans, 0, AP.rng[0], AP.rng[1]), d: 2, v: .5, rl: 2 });
      add({ y: "d", l: "r", pc: crash, b: B, o: 0, v: .9 });
      add({ y: "d", l: "k", pc: PC.k, b: B, o: 0, v: 1 });
      if (sp.ambience) add({ y: "a", b: B + 2, o: 0, v: 0 });
    }
    ev.forEach(function (e) { e.t = e.b + e.o / spb; });
    ev.sort(function (a, b) { return a.t - b.t; });
    return ev;
  }
  /* comping patterns per energy: x / X chord stab, - holds, D d u strums, T thumb + 0-3 picked strings, r f o ostinato */
  const COMP = {
    strum: { 1: "D-------D-------", 2: "D---D-uD--uD-u--", 3: "D-uDD-uD-uD-D-uD", 4: "D-uDd-uDD-uDd-uD" },
    pick: { 1: "T---2---T---3---", 2: "T-1-2-3-T-2-1-3-", 3: "T-123-21T-123-21", 4: "T-123-21T-123-21" },
    stab: { 1: "....x.......x...", 2: "..x...x...x...x.", 3: "..x..xx...x..x.x", 4: "x.x.x.x.x.x.x.x." },
    skank: { 1: "....x.......x...", 2: "..x...x...x...x.", 3: "..x...x...x...xx", 4: "..x.x.x...x.x.xx" },
    oompah: { 1: "....x.......x...", 2: "....x.......x...", 3: "....x...x...x...", 4: "....x.x.x...x.x." },
    hemi: { 1: "x.....x.....x...", 2: "x.....x.....x...", 3: "x.....x.....x.x.", 4: "x.....x.....x.x." },
    chorale: { 1: "X-------x-------", 2: "X-------x-------", 3: "X-------x-------", 4: "X---x---X---x---" },
    organ: { 1: "X---------------", 2: "X-------x-------", 3: "X-------x-------", 4: "X---x---X---x---" },
    ostinato: { 1: "r.f.r.f.r.f.r.f.", 2: "r.f.r.f.r.f.r.f.", 3: "rrffrrffrrffrrff", 4: "rrffrroorrffrroo" },
    swell: { 1: "X---------------", 2: "X---------------", 3: "X-------x-------", 4: "X-------x-------" }
  };
  const ARPS = { up: [0, 1, 2, 3, 4, 5], updown: [0, 1, 2, 3, 4, 3, 2, 1], broken: [0, 2, 1, 3, 2, 4, 3, 5], alberti: [0, 2, 1, 2], seq: [0, 2, 1, 3, 0, 4, 2, 5], rand: [0] };
  const BSTY = {
    root: "R-------r-----a-", rootfifth: "R-----r-f-----a-", pump: "R.o.r.o.r.o.r.o.", sync: "R..r..r...R..a..", six8: "R-----f-----R-a-",
    oompah: "R---.---f---.---", march: "R---f---R---f---", pedal: "r.r.r.r.r.r.r.r.", sub: "R-------R-----a-", gallop: "R.rrR.rrR.rrR.ra",
    piston: "R.r.R.r.R.r.R.ra", funk: "R..r.o.R..rR.a.o", drone: "R---------------", train: "R---f---R---f-a-", hemi: "R.....f.....r-a-", acid: "x"
  };
  /* a seeded 303 line: two bars of sixteenths with accents (R), octave jumps (o), fifths (f) and slides */
  function acidPat(seed) {
    const r = rng(seed ^ 0xAC1D), out = [], sl = [];
    for (let v = 0; v < 2; v++) {
      let s = "";
      for (let p = 0; p < 16; p++) { const x = r(); s += p === 0 ? "R" : x < .3 ? "." : x < .45 ? "o" : x < .55 ? "f" : x < .72 ? "R" : "r"; if (v === 0) sl.push(p % 4 === 3 || r() < .2); }
      out.push(s);
    }
    out.sl = sl; return out;
  }

  /* Bars that hold the start of a combo: two different hazards within 2 beats (8 units) of each other, or a hazard
     inside another's zone, found from the compiled level the same way tools/difficulty.js counts combos. The bar
     before each one gets a riser. Audio only: nothing here touches the simulation. */
  const HK = { bl: "bl", ha: "ha", ke: "ke", ga: "ke", ri: "ri", co: "co", ey: "ey", em: "ey", F: "F", X: "X", "1": "1", "2": "1" };
  function comboBars(L) {
    const hz = [], byId = {}, out = {};
    L.objs.forEach(function (o) { byId[o.id] = o; });
    L.objs.forEach(function (o) {
      const k = HK[o.k]; if (!k || o.k === "ke" || o.k === "ey") return;
      const src = o.k === "ga" ? byId[o.key] : o.k === "em" ? byId[o.eye] : null;
      hz.push({ k: k, x0: src ? (src.cx !== undefined ? src.cx : src.x) : o.x0, x1: o.x1 });
    });
    L.segs.forEach(function (q) { if (HK[q.kind]) hz.push({ k: HK[q.kind], x0: q.x0, x1: q.x1 }); });
    L.coils.forEach(function (c) { hz.push({ k: "S", x0: c.x0, x1: c.x1 }); });
    L.rails.forEach(function (r) { hz.push({ k: "L", x0: r.x0, x1: r.x1 }); });
    L.zones.forEach(function (z) { hz.push({ k: z.k, x0: z.x0, x1: z.x1 }); });
    let last = -99;
    const locs = [];
    for (let i = 0; i < hz.length; i++) for (let j = i + 1; j < hz.length; j++) {
      const a = hz[i], b = hz[j]; if (a.k === b.k) continue;
      const gap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
      if (gap <= 8) locs.push(gap <= 0 ? Math.max(a.x0, b.x0) : (Math.min(a.x1, b.x1) + Math.max(a.x0, b.x0)) / 2);
    }
    locs.sort(function (a, b) { return a - b; });
    locs.forEach(function (x) { if (x - last > 8) { last = x; out[Math.floor(x / 16)] = 1; } });
    return out;
  }
  function makeSong(def, L, loop) {
    const m = def.mu;
    const dens = []; for (let b = 0; b < L.bars; b++) { let c = 0; for (let i = 0; i < 8; i++) if (L.chart[b * 8 + i]) c++; dens.push(c); }
    const S = { bpm: m[0], spb: 60 / m[0], root: m[1], sc: SC[m[2]], mode: m[2], pA: m[3], pB: m[4], spec: spec(def), chart: L.chart, energy: L.energy, bars: L.bars,
      seed: hash(def.name), loop: !!loop, endBeat: L.endX / 4, T: L.T, combo: loop ? {} : comboBars(L), dens: dens };
    S.ev = arrange(S);
    return S;
  }

  /* ---------------- scheduler ----------------
     Every event sits at t0 + (cycle · loop length + b) · spb + its groove offset; b comes from an integer grid tick,
     so nothing accumulates. Events more than LATE behind the audio clock (a hiccup, a hidden tab) are skipped, never
     bunched up at the current time. */
  function schedule() {
    if (!song || !ctx || !bus) return;
    const w0 = offline ? 0 : performance.now(), now = ctx.currentTime, until = now + (offline ? 1e9 : LOOK), E = song.ev, spb = song.spb;
    for (;;) {
      if (ei >= E.length) { if (!song.loop) break; ei = 0; cyc++; }
      const e = E[ei], t = t0 + (cyc * song.cycle + e.t) * spb - PROC;
      if (t >= until) break;
      /* a busy downbeat (a new chord on every part) is spread over a few calls: stop after ~4 ms of work while the
         next event is still well ahead, so no single call costs a frame */
      if (!offline && t > now + .08 && performance.now() - w0 > 4) break;
      ei++;
      if (t < now - LATE) { stats.skipped++; continue; }
      play(e, Math.max(t, now));
    }
    if (!offline) stats.worst = Math.max(stats.worst, performance.now() - w0);
  }
  /* the strings, drums and spaces a song needs, made before it starts so the first bars never stall on them */
  function prepare(S) {
    for (const k in cache.ir) if (k !== S.spec.space) delete cache.ir[k];
    spaceBuf(ctx, S.spec.space);
    const keep = {};
    for (const e of S.ev) {
      if (e.y === "d") drumBuf(ctx, e.pc[0], SOFT[e.pc[0]] && e.v < SOFTV, e.pc[0] === "timp" ? S.timp : e.pc[0] === "timp5" ? S.timp * 1.4983 : 0);
      else if (e.y === "n" && PATCH[e.p] && PATCH[e.p].ks) { ksBuf(ctx, e.p, e.m); keep[e.p + e.m] = 1; }
    }
    for (const k in cache.ks) if (!keep[k]) delete cache.ks[k];
  }
  function start(S, fromBeat) {
    if (!ctx) return 0;
    stop(0.05);
    prepare(S);
    /* the bus first (its reverb takes a moment to set up), then the clock, so the first notes are never late */
    song = S; bus = newBus(S, ctx.currentTime);
    const fb = fromBeat || 0, now = ctx.currentTime;
    t0 = now + 0.1 - fb * S.spb;
    bus.out.gain.setValueAtTime(0, now); bus.out.gain.linearRampToValueAtTime(1, now + 0.05);
    /* the first event at or after fromBeat; held harmony that started earlier comes back in softly */
    cyc = S.loop ? Math.floor(fb / S.cycle) : 0;
    const local = fb - cyc * S.cycle, E = S.ev;
    let lo = 0, hi = E.length; while (lo < hi) { const md = (lo + hi) >> 1; if (E[md].t < local - 1e-9) lo = md + 1; else hi = md; }
    ei = lo;
    if (fb > 0) for (let i = 0; i < lo; i++) {
      const e = E[i];
      if (e.y === "n" && (e.g === "p" || e.g === "z") && e.b + e.d > local + .25) play(Object.assign({}, e, { d: e.b + e.d - local, at: .25 }), t0 + fb * S.spb - PROC);
      if (e.y === "a") play(e, now + .01);
    }
    schedule();
    if (!timer && !offline) timer = setInterval(schedule, TICK);
    return t0;
  }
  function stop(fade) {
    if (!ctx || !bus) { song = null; return; }
    const b = bus, f = fade === undefined ? 0.08 : fade, now = ctx.currentTime, g = b.out.gain;
    try { if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now); else { g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); } g.linearRampToValueAtTime(0, now + f); } catch (e) {}
    for (const s of b.src) try { s.stop(now + f + .05); } catch (e) {}
    if (!offline) setTimeout(function () { try { b.out.disconnect(); } catch (e) {} }, f * 1000 + 250);
    bus = null; song = null;
  }
  function beat() {
    if (!ctx || !song) return null;
    const lat = Math.min(0.3, ctx.outputLatency || ctx.baseLatency || 0);
    return (ctx.currentTime - lat - t0) / song.spb;
  }
  /* pause and resume fade the output over a few milliseconds around the context's suspend, so neither clicks */
  function suspend() {
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime; clearTimeout(susT);
    pz.gain.cancelScheduledValues(now); pz.gain.setValueAtTime(pz.gain.value, now); pz.gain.linearRampToValueAtTime(0, now + .012);
    return new Promise(function (res) { susT = setTimeout(function () { susT = 0; if (ctx.state === "running") ctx.suspend().then(res, res); else res(); }, 22); });
  }
  function resume() {
    if (!ctx) return;
    if (susT) { clearTimeout(susT); susT = 0; }
    const up = function () { const now = ctx.currentTime; pz.gain.cancelScheduledValues(now); pz.gain.setValueAtTime(pz.gain.value, now); pz.gain.linearRampToValueAtTime(1, now + .015); };
    if (ctx.state !== "running") return ctx.resume().then(up);
    up();
  }
  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { build(new AC({ latencyHint: "interactive" })); } catch (e) { try { build(new AC()); } catch (e2) { return false; } }
    /* the effects output exists from the start: a brand-new compressor is close to silent for its first moments
       (Chrome), which would swallow the first death sound */
    try { fxOut(); } catch (e) {}
    return true;
  }

  /* ---------------- sound effects ----------------
     The death sound, hiyroscript/vl's "miss": a sawtooth falling 150 -> 48 Hz through a lowpass, over white noise
     whose lowpass closes 900 -> 120 Hz, about 0.35 s in all. It goes through its own compressor and gain straight to
     the destination (vl: threshold -14, ratio 6, attack 3 ms, then 0.9), never through the music's `mix` or a song bus, so
     the music volume and the fade-out MUSIC.stop starts at the same moment don't touch it. Built by init() on the live
     context only; the offline render never builds or plays it. */
  let fx = null;
  function fxOut() {
    if (fx && fx.ctx === ctx) return fx;
    const c = ctx.createDynamicsCompressor(), g = ctx.createGain();
    c.threshold.value = -14; c.ratio.value = 6; c.attack.value = .003;
    g.gain.value = .9; c.connect(g); g.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * .7), nb = ctx.createBuffer(1, len, ctx.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    fx = { ctx: ctx, out: c, noise: nb };
    return fx;
  }
  /* vl's tone: frequency f -> f2 (exponential) over d, gain 0.0001 -> g in 6 ms -> 0.0001 at t + d, optional lowpass */
  function fxTone(t, o) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(o.f, t); osc.frequency.exponentialRampToValueAtTime(o.f2 || o.f, t + o.d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.g, t + .006); g.gain.exponentialRampToValueAtTime(0.0001, t + o.d);
    if (o.filter) { const fl = ctx.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = o.filter; osc.connect(fl); fl.connect(g); }
    else osc.connect(g);
    g.connect(fx.out); osc.start(t); osc.stop(t + o.d + .03);
  }
  /* vl's noise: white noise through a lowpass (Q 1) closing f -> f2 over d, gain 0.0001 -> g in 4 ms -> 0.0001 at t + d */
  function fxNoise(t, o) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = fx.noise; fl.type = "lowpass"; fl.Q.value = 1;
    fl.frequency.setValueAtTime(o.f, t); fl.frequency.exponentialRampToValueAtTime(o.f2, t + o.d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.g, t + .004); g.gain.exponentialRampToValueAtTime(0.0001, t + o.d);
    s.connect(fl); fl.connect(g); g.connect(fx.out); s.start(t); s.stop(t + o.d + .03);
  }
  const sfx = {
    /* the spike tip's rewind, d s long: a tape whirr (a sawtooth sweeping up, chopped faster and faster, over a rising
       hiss) and a soft clunk as the tape catches */
    rewind: function (d) {
      if (!ctx || offline || ctx.state !== "running") return;
      fxOut(); const t = ctx.currentTime;
      const osc = ctx.createOscillator(), fl = ctx.createBiquadFilter(), trem = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
      osc.type = "sawtooth"; osc.frequency.setValueAtTime(140, t); osc.frequency.exponentialRampToValueAtTime(900, t + d * .8); osc.frequency.exponentialRampToValueAtTime(320, t + d);
      fl.type = "lowpass"; fl.frequency.value = 1600;
      trem.gain.value = .5; lfo.frequency.setValueAtTime(12, t); lfo.frequency.linearRampToValueAtTime(30, t + d); lg.gain.value = .5;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(.08, t + .05); g.gain.setValueAtTime(.08, t + d * .85); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      lfo.connect(lg); lg.connect(trem.gain); osc.connect(fl); fl.connect(trem); trem.connect(g); g.connect(fx.out);
      osc.start(t); lfo.start(t); osc.stop(t + d + .05); lfo.stop(t + d + .05);
      fxNoise(t, { f: 500, f2: 4200, d: d, g: .05 });
      fxTone(t + d - .02, { f: 220, f2: 90, d: .09, type: "square", g: .1, filter: 900 });
    },
    die: function () {
      if (!ctx || offline || ctx.state !== "running") return;
      fxOut(); const t = ctx.currentTime;
      fxTone(t, { f: 150, f2: 48, d: .34, type: "sawtooth", g: .24, filter: 700 });
      fxNoise(t, { f: 900, f2: 120, d: .3, g: .18 });
    }
  };

  /* Offline render, used by the test harness (tools/music-check.js, in a browser) to check every track is audible,
     unclipped and level-matched: at full volume, with the voice count and the events skipped. */
  function renderStats(def, L, seconds, opt) {
    const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const sr = (opt && opt.sr) || 22050, oc = new OC(2, Math.ceil(sr * seconds), sr), keep = [ctx, mix, volG, pz, song, bus, cache, t0, ei, cyc, vol];
    offline = true; vol = 1; build(oc);
    const S = makeSong(def, L, !!(opt && opt.loop)); song = S;
    prepare(S); t0 = 0.05; ei = 0; cyc = 0; stats.maxV = 0; stats.skipped = 0; stats.played = 0;
    bus = newBus(S, 0); bus.out.gain.value = 1;
    const span = seconds - .3; let n = 0;
    /* opt.only: render a stem, just these groups (l lead, a answers, h harmony, b bass, d drums, x effects) */
    const only = opt && opt.only, grp = function (e) { return e.y === "n" ? ROLE[e.g] : e.y === "d" ? "d" : e.y === "k" ? "b" : "x"; };
    for (;;) { if (ei >= S.ev.length) { if (!S.loop) break; ei = 0; cyc++; } const e = S.ev[ei], t = t0 + (cyc * S.cycle + e.t) * S.spb - PROC; if (t >= span) break; ei++; if (only && only.indexOf(grp(e)) < 0) continue; play(e, Math.max(0, t)); n++; }
    const st = { voices: stats.maxV, events: n };
    const p = oc.startRendering();
    offline = false; ctx = keep[0]; mix = keep[1]; volG = keep[2]; pz = keep[3]; song = keep[4]; bus = keep[5]; cache = keep[6]; t0 = keep[7]; ei = keep[8]; cyc = keep[9]; vol = keep[10];
    /* peak and RMS of the whole render, plus the RMS of each second (to see where the song stops) */
    return p.then(function (buf) {
      const d0 = buf.getChannelData(0), d1 = buf.getChannelData(1); let pk = 0, pi = 0, sum = 0; const secs = [];
      for (let i = 0; i < d0.length; i++) { const v = Math.max(Math.abs(d0[i]), Math.abs(d1[i])); if (v > pk) { pk = v; pi = i; } const q = (d0[i] * d0[i] + d1[i] * d1[i]) / 2; sum += q; const k = Math.floor(i / sr); secs[k] = (secs[k] || 0) + q; }
      return { peak: +pk.toFixed(3), peakAt: +(pi / sr).toFixed(3), rms: +Math.sqrt(sum / d0.length).toFixed(4), secs: secs.map(function (x) { return +Math.sqrt(x / sr).toFixed(4); }),
        voices: st.voices, events: st.events, buffer: opt && opt.keep ? buf : undefined };
    });
  }
  /* one dry note of one patch (or one drum hit), no master: the patch levels are calibrated with it */
  function renderNote(name, midi, beats, vel) {
    const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext, sr = 22050, secs = beats * .5 + 2.5, oc = new OC(2, Math.ceil(sr * secs), sr);
    const keep = [ctx, mix, volG, pz, song, bus, cache];
    offline = true; build(oc);
    song = { spb: .5, root: 48, timp: 98, seed: 1, spec: { space: "room", fx: [] } }; bus = newBus(song, 0);
    bus.out.disconnect(); bus.out.connect(oc.destination); bus.rv.gain.value = 0; bus.dl.gain.value = 0;
    for (const g in bus.grp) bus.grp[g].gain.value = 1;
    if (DRUM[name]) hit({ pc: [name, 0, 1], l: "s", v: vel || .9 }, .02); else note({ y: "n", g: "l", p: name, m: midi, d: beats, v: vel || .9, cut: 1 }, .02);
    const p = oc.startRendering();
    offline = false; ctx = keep[0]; mix = keep[1]; volG = keep[2]; pz = keep[3]; song = keep[4]; bus = keep[5]; cache = keep[6];
    return p.then(function (buf) {
      const d = buf.getChannelData(0), e = buf.getChannelData(1), n = Math.min(d.length, Math.floor(sr * (DRUM[name] ? .25 : Math.max(.3, beats * .5))) + 441);
      let q = 0, pk = 0; for (let i = 441; i < n; i++) { q += (d[i] * d[i] + e[i] * e[i]) / 2; pk = Math.max(pk, Math.abs(d[i]), Math.abs(e[i])); }
      return { rms: Math.sqrt(q / (n - 441)), peak: pk };
    });
  }
  return {
    init: init, makeSong: makeSong, start: start, stop: stop, beat: beat, schedule: schedule, renderStats: renderStats, sfx: sfx,
    get ctx() { return ctx; }, get song() { return song; }, get t0() { return t0; }, get stats() { return stats; },
    setVol: function (v) { vol = v; if (volG) volG.gain.setTargetAtTime(v, ctx.currentTime, .03); },
    resume: resume, suspend: suspend,
    /* for tools/music-check.js and the browser checks only */
    _t: { PATCH: PATCH, KITS: KITS, SPACE: SPACE, GROOVE: GROOVE, spec: spec, TPQ: TPQ, PROC: PROC, note: renderNote }
  };
})();
