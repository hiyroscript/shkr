/* ---- synth.js ---- */
/* ============================================================================
   SYNTH — the instruments and the notation of the composed themes.
   Ported from hiyroscript/alva's audio engine (js/core/audio: theory, dsp,
   instruments and the sequencer's compile / renderBar), as one classic
   script: same notation, same instruments, same rendering, so a theme
   written for Alva reads the same here.

   - theory: scales, the notation (melodies in scale degrees, chord-relative
     lines, chords a bar, drum rhythms a character a sixteenth);
   - dsp: drums, plucked strings, bells, mallets and reverbs rendered once in
     JavaScript into buffers;
   - instruments: SampleBank (those buffers, per audio context), the live
     synths (brass, lead, pad, choir, strings, bass, drone, riser...) and
     playNote;
   - compileTheme / renderBar: a theme's parts and sections checked once,
     and one bar of a section turned into notes.
   Shadow Skirr adds a few instruments of its own at the end (felt piano,
   Rhodes, nylon guitar, upright bass, vibraphone, kalimba, flute, accordion,
   brushes, rim, snap, woodblock). js/music.js plays the result; js/themes.js
   holds the themes. Nothing here touches the game or the simulation.
   ========================================================================== */
const SYNTH = (function () {
  "use strict";
  /* ---- theory ---- */
  // Music theory for the stage themes (js/core/audio/themes/): scales, the
  // notation the themes are written in, and pitches. Pure functions, no Web
  // Audio: the sequencer (js/core/audio/sequencer.js) reads what these parse.
  //
  // A theme is written in scale degrees, never in note names, so the same
  // hook can be heard in another mode: Victory restates it in a major mode,
  // Defeat in a minor one, Overtime a step up and darker, all from the same
  // line (see docs/systems/audio.md).
  //
  // Melodies (parseMelody): tokens separated by spaces, `|` a bar line for
  // the reader only.
  //
  //   5        degree 5 of the scale (1 the tonic; 8 is the tonic an octave
  //            up, 9 the second an octave up, and so on)
  //   5'  5,   an octave up / down (repeatable: 5'' two octaves up)
  //   4#  6b   a semitone above / below the scale's degree
  //   :4       its length in sixteenths (2, an eighth, when left out)
  //   >5  _5   accented (velocity 1) / a ghost note (0.5); 0.8 otherwise
  //   .:4      a rest of four sixteenths
  //
  // Chord-relative lines (parseLine: bass, arpeggios, stabs) use the same
  // grammar with chord tones in place of degrees: R the root, 3 the third,
  // 5 the fifth, 7 the seventh, 8 the root an octave up, 10 the third and 12
  // the fifth an octave up, 9 the ninth; `,` and `'` move them by octaves.
  //
  // Chords (parseChords): one a bar, a scale degree (its triad built from
  // the scale itself, so 1 in a minor mode is a minor chord) with an optional
  // shape: sus2, sus4, 7, add9 or 5 (a power chord), and an optional `b` or
  // `#` on the degree (a borrowed root, e.g. 7b).
  //
  // Rhythms (parseRhythm): one character a sixteenth, any length: X an
  // accent, x a hit, o a ghost, - or . nothing.

  // Semitones of each mode's seven degrees above its tonic.
  const SCALES = Object.freeze({
    ionian: Object.freeze([0, 2, 4, 5, 7, 9, 11]),
    dorian: Object.freeze([0, 2, 3, 5, 7, 9, 10]),
    phrygian: Object.freeze([0, 1, 3, 5, 7, 8, 10]),
    lydian: Object.freeze([0, 2, 4, 6, 7, 9, 11]),
    mixolydian: Object.freeze([0, 2, 4, 5, 7, 9, 10]),
    aeolian: Object.freeze([0, 2, 3, 5, 7, 8, 10]),
    locrian: Object.freeze([0, 1, 3, 5, 6, 8, 10]),
    harmonicMinor: Object.freeze([0, 2, 3, 5, 7, 8, 11]),
    phrygianDominant: Object.freeze([0, 1, 4, 5, 7, 8, 10]),
    doubleHarmonic: Object.freeze([0, 1, 4, 5, 7, 8, 11]),
  });

  const STEPS_PER_BAR = 16;

  // Frequency of MIDI note `m` (A4 = 69 = 440 Hz), fractional notes too.
  const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);

  // Semitones above the tonic of 1-based `degree` in `scale` (any degree:
  // 8 is the tonic an octave up, 0 the seventh an octave down).
  function degreeSemis(scale, degree) {
    const d = degree - 1;
    const octave = Math.floor(d / 7);
    const index = ((d % 7) + 7) % 7;
    return scale[index] + 12 * octave;
  }

  const VELOCITY = Object.freeze({ '>': 1, _: 0.5, '': 0.8 });
  const NOTE = /^([>_]?)(R|\d+)([#b]?)([',]*)(?::(\d+))?$/;
  const REST = /^\.(?::(\d+))?$/;

  function octaveShift(marks) {
    let shift = 0;
    for (const m of marks) shift += m === "'" ? 1 : -1;
    return shift;
  }

  // Parses a line of tokens into events { step, len, value, acc, octave, vel }
  // (value: a degree number, or 'R' / a chord-tone number for parseLine),
  // and its whole length in sixteenths. A malformed token throws: a theme
  // with a typo never plays wrong notes quietly.
  function parseTokens(text, what) {
    const events = [];
    let step = 0;
    for (const token of String(text).split(/\s+/)) {
      if (!token || token === '|') continue;
      const rest = REST.exec(token);
      if (rest) {
        step += Number(rest[1] ?? 2);
        continue;
      }
      const m = NOTE.exec(token);
      if (!m) throw new Error(`[music] Bad ${what} token "${token}"`);
      const len = Number(m[5] ?? 2);
      if (!(len > 0)) throw new Error(`[music] Bad ${what} length in "${token}"`);
      events.push({
        step, len,
        value: m[2] === 'R' ? 'R' : Number(m[2]),
        acc: m[3] === '#' ? 1 : m[3] === 'b' ? -1 : 0,
        octave: octaveShift(m[4]),
        vel: VELOCITY[m[1]],
      });
      step += len;
    }
    return { events, steps: step };
  }

  // A melody in scale degrees (see the top).
  function parseMelody(text) {
    const parsed = parseTokens(text, 'melody');
    for (const e of parsed.events) if (e.value === 'R') throw new Error('[music] A melody uses degrees, not R');
    return Object.freeze(parsed);
  }

  // A chord-relative line (see the top).
  function parseLine(text) {
    return Object.freeze(parseTokens(text, 'line'));
  }

  const CHORD = /^(\d)([#b]?)(sus2|sus4|7|add9|5)?$/;

  // One chord: its root degree, borrowed accidental and shape.
  function parseChord(token) {
    const m = CHORD.exec(token);
    if (!m) throw new Error(`[music] Bad chord "${token}"`);
    return Object.freeze({ degree: Number(m[1]), acc: m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0, shape: m[3] ?? '' });
  }

  // Chords, one a bar.
  function parseChords(text) {
    return Object.freeze(String(text).split(/\s+/).filter((t) => t && t !== '|').map(parseChord));
  }

  // The chord's tones in semitones above the tonic, keyed as parseLine
  // names them: R, 3, 5, 7, 9 (third / fifth / seventh / ninth of the
  // stacked thirds from the scale, a sus chord's 2 or 4 standing in for
  // its third).
  function chordTones(scale, chord) {
    const root = degreeSemis(scale, chord.degree) + chord.acc;
    const above = (n) => degreeSemis(scale, chord.degree + n) + chord.acc;
    let third = above(2);
    if (chord.shape === 'sus2') third = above(1);
    if (chord.shape === 'sus4') third = above(3);
    if (chord.shape === '5') third = above(4);
    return { R: root, 3: third, 5: above(4), 7: above(6), 9: above(8) };
  }

  // The pitches a chord sounds (semitones above the tonic), low to high:
  // its triad (with its seventh or ninth for those shapes).
  function chordVoicing(scale, chord) {
    const t = chordTones(scale, chord);
    const notes = [t.R, t[3], t[5]];
    if (chord.shape === '7') notes.push(t[7]);
    if (chord.shape === 'add9') notes.push(t[9]);
    if (chord.shape === '5') notes.splice(1, 1, t.R + 12);
    return notes;
  }

  // Chord tone `value` of a parseLine event (R, 3, 5, 7, 8, 9, 10, 12) in
  // semitones above the tonic.
  function lineSemis(scale, chord, value) {
    const t = chordTones(scale, chord);
    switch (value) {
      case 'R': return t.R;
      case 3: return t[3];
      case 5: return t[5];
      case 7: return t[7];
      case 8: return t.R + 12;
      case 9: return t[9];
      case 10: return t[3] + 12;
      case 12: return t[5] + 12;
      default: throw new Error(`[music] Unknown chord tone ${value}`);
    }
  }

  const HITS = Object.freeze({ X: 1, x: 0.78, o: 0.42 });

  // A drum line: [{ step, vel }] and its length in sixteenths.
  function parseRhythm(text) {
    const clean = String(text).replace(/\s+/g, '');
    const hits = [];
    for (let i = 0; i < clean.length; i += 1) {
      const c = clean[i];
      if (c === '-' || c === '.') continue;
      if (!Object.hasOwn(HITS, c)) throw new Error(`[music] Bad rhythm character "${c}"`);
      hits.push({ step: i, vel: HITS[c] });
    }
    return Object.freeze({ hits: Object.freeze(hits), steps: clean.length });
  }

  /* ---- dsp ---- */
  // Sample rendering in plain JavaScript: the drums, plucked strings, bells,
  // steel pans and marimbas the stage themes play, and the reverb's impulse
  // response, each computed once into a Float32Array (then an AudioBuffer,
  // see js/core/audio/instruments.js) and replayed by a single buffer source a
  // note. Cheap to play (one node a note), exact in pitch, and no file is
  // downloaded: Alva ships no audio.
  //
  // Every renderer takes the sample rate and a random source (rng, 0-1) of
  // the audio's own, never the simulation's, and returns mono samples in
  // -1..1 (the reverb's two channels).

  const TAU = Math.PI * 2;

  // A standard RBJ biquad, run over a whole buffer in place.
  function biquad(data, sr, type, freq, q = 0.707, gainDb = 0) {
    const w0 = (TAU * Math.min(freq, sr * 0.45)) / sr;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const A = 10 ** (gainDb / 40);
    let b0;
    let b1;
    let b2;
    let a0;
    let a1;
    let a2;
    switch (type) {
      case 'lowpass':
        b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
        break;
      case 'highpass':
        b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
        break;
      case 'bandpass':
        b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
        break;
      case 'peaking':
        b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A;
        break;
      default:
        throw new Error(`[music] Unknown filter ${type}`);
    }
    b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < data.length; i += 1) {
      const x = data[i];
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      data[i] = y;
    }
    return data;
  }

  const samples = (sr, seconds) => new Float32Array(Math.max(1, Math.ceil(sr * seconds)));

  // White noise, `seconds` long.
  function noise(sr, seconds, rng) {
    const out = samples(sr, seconds);
    for (let i = 0; i < out.length; i += 1) out[i] = rng() * 2 - 1;
    return out;
  }

  // Scales `data` so its loudest sample is `peak`.
  function normalize(data, peak = 0.95) {
    let max = 0;
    for (let i = 0; i < data.length; i += 1) max = Math.max(max, Math.abs(data[i]));
    if (max > 0) {
      const k = peak / max;
      for (let i = 0; i < data.length; i += 1) data[i] *= k;
    }
    return data;
  }

  // A short linear fade at both ends, so no sample starts or stops on a click.
  function declick(data, sr, inMs = 1, outMs = 6) {
    const a = Math.min(data.length, Math.ceil((sr * inMs) / 1000));
    const b = Math.min(data.length, Math.ceil((sr * outMs) / 1000));
    for (let i = 0; i < a; i += 1) data[i] *= i / a;
    for (let i = 0; i < b; i += 1) data[data.length - 1 - i] *= i / b;
    return data;
  }

  // Soft saturation: warmth and weight without hard clipping.
  function saturate(data, drive = 1.5) {
    const norm = Math.tanh(drive);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.tanh(data[i] * drive) / norm;
    return data;
  }

  function mixInto(target, source, gain = 1, offset = 0) {
    for (let i = 0; i < source.length && i + offset < target.length; i += 1) target[i + offset] += source[i] * gain;
    return target;
  }

  function expEnv(data, sr, decay, attack = 0) {
    const a = Math.max(1, sr * attack), d = Math.exp(-1 / (sr * decay));
    let e = 1;
    for (let i = 0; i < data.length; i += 1) {
      data[i] *= (i < a ? i / a : 1) * e;
      e *= d;
    }
    return data;
  }

  // A sine whose pitch falls from `from` to `to` Hz (time constant `bend`),
  // decaying with time constant `decay`: the body of a kick, tom or taiko.
  function droppingSine(sr, seconds, from, to, bend, decay, attack = 0.001) {
    const out = samples(sr, seconds);
    let phase = 0;
    for (let i = 0; i < out.length; i += 1) {
      const t = i / sr;
      const f = to + (from - to) * Math.exp(-t / bend);
      phase += (TAU * f) / sr;
      const a = Math.min(1, t / attack);
      out[i] = Math.sin(phase) * a * Math.exp(-t / decay);
    }
    return out;
  }

  // Sum of decaying partials: [{ ratio, amp, decay, detune? }] over `freq`,
  // with an optional pitch glide at the start (`glide` semitones falling to
  // none over `glideTime`): bells, celesta, steel pan, marimba.
  function partials(sr, seconds, freq, list, { glide = 0, glideTime = 0.03, attack = 0.002 } = {}) {
    const out = samples(sr, seconds);
    const na = Math.max(1, sr * attack);
    for (const p of list) {
      let phase = p.phase ?? 0;
      const f0 = freq * p.ratio * (1 + (p.detune ?? 0));
      if (f0 >= sr * 0.45) continue;
      if (!glide) {
        // (Shadow Skirr) the same samples by rotation and a running decay: a few multiplies a sample instead of a
        // sine and an exponential, so a level's notes render quickly enough not to stall its start
        const w = (TAU * f0) / sr, c = Math.cos(w), s = Math.sin(w), d = Math.exp(-1 / (sr * p.decay));
        let x = Math.cos(phase) * p.amp, y = Math.sin(phase) * p.amp, e = 1;
        for (let i = 0; i < out.length; i += 1) {
          const nx = x * c - y * s; y = x * s + y * c; x = nx;
          out[i] += y * e * (i < na ? i / na : 1);
          e *= d;
        }
        continue;
      }
      for (let i = 0; i < out.length; i += 1) {
        const t = i / sr;
        const bend = glide ? 2 ** ((glide * Math.exp(-t / glideTime)) / 12) : 1;
        phase += (TAU * f0 * bend) / sr;
        out[i] += Math.sin(phase) * p.amp * Math.exp(-t / p.decay) * Math.min(1, t / attack);
      }
    }
    return out;
  }

  // A plucked string (Karplus-Strong), exactly in tune: the loop's
  // fractional delay is an all-pass. `bright` (0-1) is the pluck's
  // brightness, `decay` how long the string rings (seconds to -60 dB, about),
  // `body` an optional list of resonances [{ freq, q, gain }] (an oud's or
  // a guitar's body).
  function pluck(sr, seconds, freq, rng, { bright = 0.6, decay = 1.6, body = [], position = 0.18 } = {}) {
    const out = samples(sr, seconds);
    const period = sr / freq;
    let n = Math.floor(period - 0.5);
    let frac = period - 0.5 - n;
    if (frac < 0.15) {
      n -= 1;
      frac += 1;
    }
    const c = (1 - frac) / (1 + frac);
    const line = new Float32Array(n);
    // The excitation: noise, darkened as `bright` falls, combed by where the
    // string is plucked.
    const exc = new Float32Array(n);
    let lp = 0;
    const k = 0.15 + 0.8 * bright;
    for (let i = 0; i < n; i += 1) {
      lp += k * (rng() * 2 - 1 - lp);
      exc[i] = lp;
    }
    const comb = Math.max(1, Math.round(n * position));
    for (let i = 0; i < n; i += 1) line[i] = exc[i] - (i >= comb ? exc[i - comb] : 0);
    // Per-loop gain for the ring time asked.
    const loops = (decay * sr) / period;
    const g = Math.min(0.9995, 10 ** (-3 / Math.max(1, loops)));
    let idx = 0;
    let prev = 0;
    let apIn = 0;
    let apOut = 0;
    for (let i = 0; i < out.length; i += 1) {
      const x = line[idx];
      const avg = 0.5 * (x + prev);
      prev = x;
      const ap = c * avg + apIn - c * apOut;
      apIn = avg;
      apOut = ap;
      const y = ap * g;
      line[idx] = y;
      out[i] = x;
      idx = idx + 1 === n ? 0 : idx + 1;
    }
    for (const r of body) biquad(out, sr, 'peaking', r.freq, r.q, r.gain);
    return declick(normalize(out, 0.9), sr, 0.5, 30);
  }

  // Six detuned square waves, the classic metallic source of hats and
  // cymbals.
  function metal(sr, seconds, base = 1) {
    const out = samples(sr, seconds);
    const freqs = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => f * base);
    const phases = freqs.map(() => 0);
    for (let i = 0; i < out.length; i += 1) {
      let s = 0;
      for (let j = 0; j < freqs.length; j += 1) {
        phases[j] += freqs[j] / sr;
        s += phases[j] % 1 < 0.5 ? 1 : -1;
      }
      out[i] = s / freqs.length;
    }
    return out;
  }

  // ---- Drums ---------------------------------------------------------------------

  // Each drum: (sr, rng, opts) => samples. `opts.tone` shifts a pitched
  // drum's tuning (a ratio).
  const DRUMS = ({
    kick(sr, rng, { deep = false, punch = 1 } = {}) {
      const body = droppingSine(sr, deep ? 0.9 : 0.6, deep ? 140 : 165, deep ? 42 : 50, deep ? 0.05 : 0.035, deep ? 0.42 : 0.3);
      const click = noise(sr, 0.012, rng);
      biquad(click, sr, 'highpass', 2500, 0.8);
      expEnv(click, sr, 0.003);
      mixInto(body, click, 0.35 * punch);
      return declick(normalize(saturate(body, 1.6 + punch * 0.4), 0.98), sr, 0.2, 8);
    },
    snare(sr, rng, { gated = false } = {}) {
      const len = gated ? 0.42 : 0.3;
      const tone = partials(sr, len, 185, [{ ratio: 1, amp: 0.6, decay: 0.07 }, { ratio: 1.78, amp: 0.35, decay: 0.05 }]);
      const nz = noise(sr, len, rng);
      biquad(nz, sr, 'highpass', 1400, 0.7);
      biquad(nz, sr, 'peaking', 5200, 1, 4);
      if (gated) {
        // A big room cut off hard: full body, then the gate.
        for (let i = 0; i < nz.length; i += 1) {
          const t = i / sr;
          nz[i] *= Math.exp(-t / 0.5) * (t < 0.3 ? 1 : Math.max(0, 1 - (t - 0.3) / 0.03));
        }
      } else expEnv(nz, sr, 0.11);
      mixInto(tone, nz, 0.8);
      return declick(normalize(saturate(tone, 1.3), 0.95), sr, 0.2, 6);
    },
    clap(sr, rng) {
      const out = samples(sr, 0.35);
      for (const [at, amp] of [[0, 0.7], [0.011, 0.8], [0.022, 1]]) {
        const burst = noise(sr, at === 0.022 ? 0.3 : 0.01, rng);
        expEnv(burst, sr, at === 0.022 ? 0.09 : 0.004);
        mixInto(out, burst, amp, Math.round(at * sr));
      }
      biquad(out, sr, 'bandpass', 1300, 0.9);
      biquad(out, sr, 'peaking', 2600, 1.2, 5);
      return declick(normalize(out, 0.92), sr, 0.2, 6);
    },
    hat(sr, rng, { open = false } = {}) {
      const len = open ? 0.45 : 0.08;
      const out = metal(sr, len, 1.6);
      mixInto(out, noise(sr, len, rng), 0.35);
      biquad(out, sr, 'bandpass', 10000, 0.6);
      biquad(out, sr, 'highpass', 7000, 0.7);
      expEnv(out, sr, open ? 0.16 : 0.025);
      return declick(normalize(out, 0.8), sr, 0.1, 4);
    },
    crash(sr, rng) {
      const out = metal(sr, 2.4, 1.2);
      mixInto(out, noise(sr, 2.4, rng), 0.9);
      biquad(out, sr, 'highpass', 3800, 0.6);
      biquad(out, sr, 'peaking', 7500, 0.8, 3);
      expEnv(out, sr, 0.75, 0.002);
      return declick(normalize(out, 0.75), sr, 0.2, 40);
    },
    // A clock's tick (tock with `low`), dry and exact: overtime's clock.
    tick(sr, rng, { low = false } = {}) {
      const f = low ? 1650 : 2900;
      const out = partials(sr, 0.05, f, [{ ratio: 1, amp: 1, decay: 0.008 }, { ratio: 2.4, amp: 0.4, decay: 0.004 }]);
      const click = noise(sr, 0.004, rng);
      biquad(click, sr, 'highpass', 4000);
      mixInto(out, click, 0.5);
      return declick(normalize(out, 0.9), sr, 0.05, 3);
    },
    // The darbuka's open low stroke.
    doum(sr, rng) {
      const out = droppingSine(sr, 0.5, 160, 92, 0.03, 0.22);
      const slap = noise(sr, 0.03, rng);
      biquad(slap, sr, 'bandpass', 900, 1.2);
      expEnv(slap, sr, 0.008);
      mixInto(out, slap, 0.25);
      return declick(normalize(saturate(out, 1.4), 0.95), sr, 0.2, 6);
    },
    // Its sharp rim stroke (`soft`: the ghosted "ka").
    tek(sr, rng, { soft = false } = {}) {
      const out = noise(sr, 0.08, rng);
      biquad(out, sr, 'bandpass', soft ? 3200 : 4200, 1.6);
      expEnv(out, sr, soft ? 0.014 : 0.02);
      const ring = partials(sr, 0.08, soft ? 520 : 640, [{ ratio: 1, amp: 0.6, decay: 0.02 }, { ratio: 2.3, amp: 0.3, decay: 0.012 }]);
      mixInto(out, ring, 0.6);
      return declick(normalize(out, 0.85), sr, 0.05, 4);
    },
    // Jingles of a frame drum (the riq).
    riq(sr, rng) {
      const out = noise(sr, 0.18, rng);
      const jingles = partials(sr, 0.18, 4100, [
        { ratio: 1, amp: 0.4, decay: 0.06 }, { ratio: 1.37, amp: 0.35, decay: 0.05 }, { ratio: 1.81, amp: 0.3, decay: 0.04 },
      ]);
      biquad(out, sr, 'highpass', 6000, 0.7);
      expEnv(out, sr, 0.045, 0.004);
      mixInto(out, jingles, 0.5);
      return declick(normalize(out, 0.7), sr, 0.1, 6);
    },
    // A great frame drum's low boom, with its skin's buzz.
    frame(sr, rng) {
      const out = droppingSine(sr, 0.7, 110, 66, 0.04, 0.3);
      const buzz = noise(sr, 0.25, rng);
      biquad(buzz, sr, 'bandpass', 320, 2);
      expEnv(buzz, sr, 0.07);
      mixInto(out, buzz, 0.3);
      return declick(normalize(saturate(out, 1.5), 0.95), sr, 0.2, 8);
    },
    // Taiko: a huge low drum, its strike and boom.
    taiko(sr, rng) {
      const out = droppingSine(sr, 1.4, 118, 54, 0.06, 0.55);
      mixInto(out, droppingSine(sr, 1.4, 236, 108, 0.04, 0.2), 0.25);
      const hit = noise(sr, 0.12, rng);
      biquad(hit, sr, 'lowpass', 700, 0.8);
      expEnv(hit, sr, 0.03);
      mixInto(out, hit, 0.6);
      return declick(normalize(saturate(out, 2), 0.98), sr, 0.2, 20);
    },
    tom(sr, rng, { tone = 1 } = {}) {
      const out = droppingSine(sr, 0.7, 190 * tone, 105 * tone, 0.05, 0.3);
      const hit = noise(sr, 0.05, rng);
      biquad(hit, sr, 'bandpass', 1500, 0.8);
      expEnv(hit, sr, 0.012);
      mixInto(out, hit, 0.3);
      return declick(normalize(saturate(out, 1.5), 0.95), sr, 0.2, 10);
    },
    // A shaker or brushed hiss on the off-beats.
    shaker(sr, rng) {
      const out = noise(sr, 0.1, rng);
      biquad(out, sr, 'bandpass', 6500, 1.1);
      for (let i = 0; i < out.length; i += 1) {
        const t = i / sr;
        out[i] *= Math.min(1, t / 0.012) * Math.exp(-t / 0.035);
      }
      return declick(normalize(out, 0.6), sr, 0.1, 4);
    },
    // A hollow log drum (Adamaris).
    log(sr, rng, { tone = 1 } = {}) {
      const out = partials(sr, 0.3, 420 * tone, [
        { ratio: 1, amp: 1, decay: 0.08 }, { ratio: 2.62, amp: 0.4, decay: 0.03 }, { ratio: 4.1, amp: 0.15, decay: 0.015 },
      ]);
      const tap = noise(sr, 0.01, rng);
      biquad(tap, sr, 'bandpass', 2400, 1);
      mixInto(out, tap, 0.3);
      return declick(normalize(out, 0.85), sr, 0.05, 6);
    },
    // Ice cracking (Jökull's overtime): a burst of sharp ticks and a cold
    // ring.
    ice(sr, rng) {
      const out = samples(sr, 0.6);
      let t = 0;
      while (t < 0.22) {
        const at = Math.round(t * sr);
        const amp = (1 - t / 0.25) * (0.4 + rng() * 0.6);
        for (let i = 0; i < 40 && at + i < out.length; i += 1) out[at + i] += (rng() * 2 - 1) * amp * Math.exp(-i / 8);
        t += 0.004 + rng() * 0.02;
      }
      biquad(out, sr, 'highpass', 1800, 0.7);
      mixInto(out, partials(sr, 0.6, 2350, [{ ratio: 1, amp: 0.25, decay: 0.12 }, { ratio: 1.47, amp: 0.18, decay: 0.09 }]), 1);
      mixInto(out, droppingSine(sr, 0.4, 90, 50, 0.05, 0.12), 0.5);
      return declick(normalize(out, 0.9), sr, 0.05, 20);
    },
    // The last hit of a sting: taiko, sub and a cymbal at once.
    boom(sr, rng) {
      const out = droppingSine(sr, 3, 120, 38, 0.08, 0.9);
      mixInto(out, DRUMS.taiko(sr, rng), 0.6);
      const air = DRUMS.crash(sr, rng);
      mixInto(out, air, 0.35);
      return declick(normalize(saturate(out, 1.6), 0.98), sr, 0.2, 60);
    },
  });

  // ---- Pitched instruments rendered a note at a time --------------------------------

  // Each: (sr, freq, rng) => samples, exactly at `freq`.
  const TONES = ({
    // An oud: a bright pluck with a nasal, woody body.
    oud: (sr, f, rng) => pluck(sr, 1.4, f, rng, {
      bright: 0.78, decay: 1.1, position: 0.13,
      body: [{ freq: 290, q: 1.4, gain: 5 }, { freq: 1150, q: 2, gain: 4 }, { freq: 3200, q: 1.5, gain: 2 }],
    }),
    // A clean electric guitar pluck (Adamaris's surf answer).
    guitar: (sr, f, rng) => pluck(sr, 1.6, f, rng, {
      bright: 0.62, decay: 1.4, position: 0.22, body: [{ freq: 180, q: 1, gain: 3 }, { freq: 2500, q: 1.2, gain: 3 }],
    }),
    // A harp (Asperitas's sky).
    harp: (sr, f, rng) => pluck(sr, 2.2, f, rng, { bright: 0.45, decay: 2.2, position: 0.3, body: [{ freq: 400, q: 0.8, gain: 2 }] }),
    // A synth pluck for arpeggios: tight and glassy.
    pluck: (sr, f, rng) => pluck(sr, 0.5, f, rng, { bright: 0.9, decay: 0.32, position: 0.5 }),
    celesta: (sr, f) => declick(normalize(partials(sr, 1.6, f, [
      { ratio: 1, amp: 1, decay: 0.9 }, { ratio: 2, amp: 0.25, decay: 0.35 }, { ratio: 3, amp: 0.1, decay: 0.2 },
      { ratio: 4.16, amp: 0.08, decay: 0.12 }, { ratio: 1, amp: 0.3, decay: 0.9, detune: 0.0016 },
    ], { attack: 0.0015 }), 0.85), sr, 0.1, 30),
    // Icy glass bells: inharmonic partials, beating pairs, a long ring.
    glass: (sr, f) => declick(normalize(partials(sr, 3, f, [
      { ratio: 1, amp: 1, decay: 1.6 }, { ratio: 1, amp: 0.5, decay: 1.6, detune: 0.0022 },
      { ratio: 2.76, amp: 0.45, decay: 0.9 }, { ratio: 2.76, amp: 0.2, decay: 0.9, detune: -0.0018 },
      { ratio: 5.4, amp: 0.22, decay: 0.45 }, { ratio: 8.93, amp: 0.1, decay: 0.22 },
    ], { attack: 0.001 }), 0.85), sr, 0.05, 60),
    // A steel pan: bright, its "boing" a slight fall into pitch.
    steel: (sr, f) => declick(normalize(saturate(partials(sr, 1.3, f, [
      { ratio: 1, amp: 1, decay: 0.75 }, { ratio: 2, amp: 0.55, decay: 0.45 }, { ratio: 3, amp: 0.22, decay: 0.3 },
      { ratio: 4.02, amp: 0.25, decay: 0.2 }, { ratio: 1, amp: 0.3, decay: 0.75, detune: 0.003 },
    ], { glide: 0.35, glideTime: 0.025, attack: 0.003 }), 1.3), 0.85), sr, 0.1, 30),
    marimba: (sr, f, rng) => {
      const out = partials(sr, 0.9, f, [
        { ratio: 1, amp: 1, decay: 0.38 }, { ratio: 3.93, amp: 0.3, decay: 0.08 }, { ratio: 9.2, amp: 0.08, decay: 0.025 },
      ], { attack: 0.002 });
      const mallet = noise(sr, 0.01, rng);
      biquad(mallet, sr, 'lowpass', 1800);
      mixInto(out, mallet, 0.15);
      return declick(normalize(out, 0.85), sr, 0.1, 20);
    },
  });

  // ---- Reverb ------------------------------------------------------------------------

  // A stereo impulse response: decorrelated noise in each channel, decaying
  // over `seconds` and darkening as it goes (`damp`: 0 bright, 1 dark), after
  // `preDelay` seconds of silence.
  function impulseResponse(sr, seconds, rng, { damp = 0.5, preDelay = 0.015 } = {}) {
    const channels = [0, 1].map(() => {
      const out = samples(sr, seconds + preDelay);
      const start = Math.round(preDelay * sr);
      let lp = 0;
      for (let i = start; i < out.length; i += 1) {
        const t = (i - start) / sr;
        const progress = t / seconds;
        // The one-pole's coefficient falls as the tail goes on: high
        // frequencies die first.
        const k = Math.max(0.04, 1 - damp * (0.35 + 0.6 * progress));
        lp += k * (rng() * 2 - 1 - lp);
        out[i] = lp * Math.exp((-6.9 * t) / seconds) * Math.min(1, t / 0.006);
      }
      return out;
    });
    const peak = Math.max(...channels.map((c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
    for (const c of channels) for (let i = 0; i < c.length; i += 1) c[i] *= 0.6 / (peak || 1);
    return channels;
  }

  // The audio's own random stream (a seed, mulberry32): never the
  // simulation's, so sound never touches what a match does.
  function audioRng(seed = 0x9e3779b9) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---- instruments ---- */
  // The instruments the themes, the ambience and the effects play, on Web
  // Audio (the Sound update).
  //
  // Two kinds:
  //
  //   - Rendered once, replayed cheaply: every drum (DRUMS) and every
  //     plucked or struck tone (TONES: oud, guitar, harp, pluck, celesta,
  //     glass bells, steel pan, marimba) is computed in JavaScript
  //     (js/core/audio/dsp.js) into an AudioBuffer the first time it is
  //     needed, then played by one buffer source a note. A tone is rendered
  //     at its exact pitch, once per MIDI note.
  //   - Synthesized live (SYNTHS): brass, leads, pads, choir, strings, bass,
  //     drones, chants, risers, sirens, swells and pulses, each a small graph
  //     of oscillators, filters and envelopes started and stopped on the
  //     audio clock, gone once it has sounded.
  //
  // Every note is scheduled ahead on AudioContext.currentTime; nothing here
  // reads the game's clock or its randomness.


  // A sample buffer from mono (or [left, right]) samples.
  function toBuffer(ctx, data) {
    const channels = Array.isArray(data) ? data : [data];
    const buffer = ctx.createBuffer(channels.length, channels[0].length, ctx.sampleRate);
    channels.forEach((c, i) => {
      if (buffer.copyToChannel) buffer.copyToChannel(c, i);
      else buffer.getChannelData(i).set(c);
    });
    return buffer;
  }

  // The samples of one AudioContext: drums, tones, noise and reverbs,
  // rendered on first use and kept.
  class SampleBank {
    constructor(ctx, seed = 0x5a17) {
      this.ctx = ctx;
      this.rng = audioRng(seed);
      this.cache = new Map();
    }

    get(key, render) {
      let buffer = this.cache.get(key);
      if (!buffer) {
        buffer = toBuffer(this.ctx, render(this.ctx.sampleRate, this.rng));
        this.cache.set(key, buffer);
      }
      return buffer;
    }

    drum(name, opts = {}) {
      const render = DRUMS[name];
      if (!render) throw new Error(`[music] Unknown drum "${name}"`);
      return this.get(`drum:${name}:${JSON.stringify(opts)}`, (sr, rng) => render(sr, rng, opts));
    }

    tone(name, midi) {
      const render = TONES[name];
      if (!render) throw new Error(`[music] Unknown tone "${name}"`);
      const note = Math.round(midi);
      return this.get(`tone:${name}:${note}`, (sr, rng) => render(sr, midiToFreq(note), rng));
    }

    // Two seconds of white noise, looped by whatever needs a noise source.
    noise() {
      return this.get('noise', (sr, rng) => [noise(sr, 2, rng), noise(sr, 2, rng)]);
    }

    reverb(seconds, damp) {
      return this.get(`reverb:${seconds}:${damp}`, (sr, rng) => impulseResponse(sr, seconds, rng, { damp }));
    }
  }

  // ---- Helpers ---------------------------------------------------------------------

  const clampFreq = (ctx, f) => Math.max(10, Math.min(f, ctx.sampleRate * 0.45));

  function osc(ctx, type, freq, t, detune = 0) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(clampFreq(ctx, freq), t);
    if (detune) o.detune.setValueAtTime(detune, t);
    return o;
  }

  function gain(ctx, value = 1) {
    const g = ctx.createGain();
    g.gain.value = value;
    return g;
  }

  function filter(ctx, type, freq, q = 0.707, t = 0) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(clampFreq(ctx, freq), t);
    f.Q.setValueAtTime(q, t);
    return f;
  }

  // An ADSR on `param` from `t`, held `dur` seconds then released. Returns
  // when it is silent.
  function adsr(param, t, dur, { a = 0.01, d = 0.1, s = 0.7, r = 0.1, peak = 1 }) {
    const attackEnd = t + a;
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, attackEnd);
    param.setTargetAtTime(peak * s, attackEnd, Math.max(0.005, d / 3));
    const release = Math.max(attackEnd, t + dur);
    param.setTargetAtTime(0, release, Math.max(0.005, r / 4));
    return release + r * 1.6;
  }

  function stopAll(nodes, at) {
    for (const n of nodes) n.stop(at);
  }

  // ---- Buffer playback -------------------------------------------------------------

  // Plays `buffer` into `out` at `t` (`rate` for pitch), at gain `level`,
  // faded out over `release` seconds from `t + dur` when given (a held
  // tone shorter than its ring).
  function playBuffer(ctx, out, buffer, t, { level = 1, rate = 1, dur = null, release = 0.08 } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    if (rate !== 1) src.playbackRate.setValueAtTime(rate, t);
    const g = gain(ctx, 0);
    g.gain.setValueAtTime(level, t);
    let end = t + buffer.duration / rate;
    if (dur !== null && t + dur + release < end) {
      g.gain.setValueAtTime(level, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + release);
      end = t + dur + release;
    }
    src.connect(g).connect(out);
    src.start(t);
    src.stop(end + 0.01);
    return end;
  }

  // ---- Live synths -------------------------------------------------------------------

  // Each: (ctx, out, t, note, bank) => end time. `note`: { freq | freqs, dur,
  // vel, params } (params: the channel's own tuning of the instrument).
  const SYNTHS = ({
    // A brass section: three detuned saws through a filter that blooms open
    // with the note's strength. `stab: true` for short punches.
    brass(ctx, out, t, { freq, freqs, dur, vel, params = {} }) {
      const notes = freqs ?? [freq];
      const peak = (params.level ?? 0.32) * vel ** 1.2 / Math.sqrt(notes.length);
      const lp = filter(ctx, 'lowpass', 300, params.q ?? 1.4, t);
      const open = (params.bright ?? 1) * (900 + 3600 * vel);
      lp.frequency.setValueAtTime(260, t);
      lp.frequency.linearRampToValueAtTime(open, t + (params.swell ?? 0.05));
      lp.frequency.setTargetAtTime(open * 0.55, t + (params.swell ?? 0.05), 0.12);
      const amp = gain(ctx, 0);
      const end = adsr(amp.gain, t, dur, { a: params.attack ?? 0.022, d: 0.2, s: params.stab ? 0.4 : 0.78, r: params.release ?? 0.14, peak });
      const oscs = [];
      for (const f of notes) {
        for (const cents of [-9, 0, 9]) oscs.push(osc(ctx, 'sawtooth', f, t, cents));
      }
      for (const o of oscs) o.connect(lp);
      lp.connect(amp).connect(out);
      for (const o of oscs) o.start(t);
      stopAll(oscs, end);
      return end;
    },

    // A lead line: two oscillators, delayed vibrato, a filter. `wave`,
    // `wave2`, `cutoff`, `vibrato` (cents), `glide` (seconds from the
    // previous pitch, when given `from`).
    lead(ctx, out, t, { freq, dur, vel, params = {}, from = null }) {
      const peak = (params.level ?? 0.25) * vel ** 1.1;
      const lp = filter(ctx, 'lowpass', params.cutoff ?? 3200, params.q ?? 1.2, t);
      lp.frequency.setValueAtTime((params.cutoff ?? 3200) * 1.6, t);
      lp.frequency.setTargetAtTime(params.cutoff ?? 3200, t + 0.02, 0.09);
      const amp = gain(ctx, 0);
      const end = adsr(amp.gain, t, dur, { a: params.attack ?? 0.012, d: 0.16, s: params.sustain ?? 0.82, r: params.release ?? 0.12, peak });
      const a = osc(ctx, params.wave ?? 'sawtooth', from ?? freq, t, params.detune ?? 0);
      const b = osc(ctx, params.wave2 ?? 'square', from ?? freq, t, -(params.detune ?? 7));
      if (from) {
        for (const o of [a, b]) o.frequency.setTargetAtTime(freq, t, params.glide ?? 0.03);
      }
      const mix2 = gain(ctx, params.mix2 ?? 0.5);
      const vib = osc(ctx, 'sine', params.rate ?? 5.4, t);
      const depth = gain(ctx, 0);
      const cents = params.vibrato ?? 14;
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(cents, t + Math.min(dur, 0.12) + 0.18);
      vib.connect(depth);
      depth.connect(a.detune);
      depth.connect(b.detune);
      a.connect(lp);
      b.connect(mix2).connect(lp);
      lp.connect(amp).connect(out);
      for (const o of [a, b, vib]) o.start(t);
      stopAll([a, b, vib], end);
      return end;
    },

    // A pad chord, each note two detuned saws spread left and right.
    // `cutoff`, `attack`, `release`, `wave`.
    pad(ctx, out, t, { freqs, freq, dur, vel, params = {} }) {
      const notes = freqs ?? [freq];
      const peak = (params.level ?? 0.16) * vel / Math.sqrt(notes.length);
      const lp = filter(ctx, 'lowpass', params.cutoff ?? 1400, 0.6, t);
      const amp = gain(ctx, 0);
      const end = adsr(amp.gain, t, dur, { a: params.attack ?? 0.35, d: 0.4, s: 0.85, r: params.release ?? 0.6, peak });
      const nodes = [];
      for (const f of notes) {
        for (const side of [-1, 1]) {
          const o = osc(ctx, params.wave ?? 'sawtooth', f, t, side * (params.detune ?? 11));
          const p = ctx.createStereoPanner();
          p.pan.setValueAtTime(side * (params.width ?? 0.55), t);
          o.connect(p).connect(lp);
          nodes.push(o);
        }
      }
      lp.connect(amp).connect(out);
      for (const o of nodes) o.start(t);
      stopAll(nodes, end);
      return end;
    },

    // A choir: soft voices through two vowel formants (an open "ah"), wide.
    choir(ctx, out, t, { freqs, freq, dur, vel, params = {} }) {
      const notes = freqs ?? [freq];
      const peak = (params.level ?? 0.22) * vel / Math.sqrt(notes.length);
      const amp = gain(ctx, 0);
      const end = adsr(amp.gain, t, dur, { a: params.attack ?? 0.5, d: 0.5, s: 0.9, r: params.release ?? 0.9, peak });
      const f1 = filter(ctx, 'bandpass', params.f1 ?? 700, 3.5, t);
      const f2 = filter(ctx, 'bandpass', params.f2 ?? 1150, 4, t);
      const f3 = filter(ctx, 'bandpass', params.f3 ?? 2600, 5, t);
      const sum = gain(ctx, 1);
      const f3g = gain(ctx, 0.35);
      const nodes = [];
      for (const f of notes) {
        for (const side of [-1, 0, 1]) {
          const o = osc(ctx, 'sawtooth', f, t, side * 8);
          const p = ctx.createStereoPanner();
          p.pan.setValueAtTime(side * 0.7, t);
          o.connect(p);
          p.connect(f1);
          p.connect(f2);
          p.connect(f3);
          nodes.push(o);
        }
      }
      f1.connect(sum);
      f2.connect(sum);
      f3.connect(f3g).connect(sum);
      sum.connect(amp).connect(out);
      for (const o of nodes) o.start(t);
      stopAll(nodes, end);
      return end;
    },

    // Strings: bowed saws, a slow bow and a little vibrato; `staccato` for a
    // short, biting ostinato.
    strings(ctx, out, t, { freqs, freq, dur, vel, params = {} }) {
      const notes = freqs ?? [freq];
      const staccato = !!params.staccato;
      const peak = (params.level ?? (staccato ? 0.2 : 0.15)) * vel / Math.sqrt(notes.length);
      const bp = filter(ctx, staccato ? 'bandpass' : 'lowpass', params.cutoff ?? (staccato ? 1300 : 2600), staccato ? 0.9 : 0.7, t);
      const amp = gain(ctx, 0);
      const end = staccato
        ? adsr(amp.gain, t, Math.min(dur, 0.09), { a: 0.006, d: 0.08, s: 0.3, r: 0.07, peak })
        : adsr(amp.gain, t, dur, { a: params.attack ?? 0.18, d: 0.3, s: 0.9, r: params.release ?? 0.4, peak });
      const nodes = [];
      // A short ostinato note needs no vibrato and no spread of its own (the
      // channel places it): half the nodes, for overtime's busiest layer.
      const vib = staccato ? null : osc(ctx, 'sine', 5.2, t);
      const depth = vib ? gain(ctx, 9) : null;
      if (vib) vib.connect(depth);
      for (const f of notes) {
        for (const side of [-1, 1]) {
          const o = osc(ctx, 'sawtooth', f, t, side * 6 + (params.cents ?? 0));
          if (depth) {
            depth.connect(o.detune);
            const p = ctx.createStereoPanner();
            p.pan.setValueAtTime(side * 0.45, t);
            o.connect(p).connect(bp);
          } else o.connect(bp);
          nodes.push(o);
        }
      }
      bp.connect(amp).connect(out);
      const sources = vib ? [...nodes, vib] : nodes;
      for (const o of sources) o.start(t);
      stopAll(sources, end);
      return end;
    },

    // A bass: saw (or square) and a sine sub, its filter snapping shut.
    // `cutoff`, `drive` (a waveshaper's warmth), `wave`.
    bass(ctx, out, t, { freq, dur, vel, params = {} }) {
      const peak = (params.level ?? 0.38) * vel;
      const cutoff = params.cutoff ?? 600;
      const lp = filter(ctx, 'lowpass', cutoff * 4, params.q ?? 3, t);
      lp.frequency.setTargetAtTime(cutoff, t + 0.005, params.snap ?? 0.06);
      const amp = gain(ctx, 0);
      const end = adsr(amp.gain, t, dur, { a: 0.004, d: params.decay ?? 0.18, s: params.sustain ?? 0.6, r: 0.06, peak });
      const a = osc(ctx, params.wave ?? 'sawtooth', freq, t);
      const sub = osc(ctx, 'sine', freq, t);
      const subLevel = gain(ctx, params.sub ?? 0.9);
      let head = lp;
      if (params.drive) {
        const shaper = ctx.createWaveShaper();
        shaper.curve = driveCurve(params.drive);
        lp.connect(shaper);
        head = shaper;
      }
      a.connect(lp);
      sub.connect(subLevel).connect(amp);
      head.connect(amp).connect(out);
      for (const o of [a, sub]) o.start(t);
      stopAll([a, sub], end);
      return end;
    },

    // A deep drone: root and fifth, slowly breathing through a filter.
    drone(ctx, out, t, { freq, dur, vel, params = {} }) {
      const peak = (params.level ?? 0.2) * vel;
      const lp = filter(ctx, 'lowpass', params.cutoff ?? 500, 1.5, t);
      const lfo = osc(ctx, 'sine', params.rate ?? 0.11, t);
      const lfoDepth = gain(ctx, (params.cutoff ?? 500) * 0.45);
      lfo.connect(lfoDepth).connect(lp.frequency);
      const amp = gain(ctx, 0);
      const end = adsr(amp.gain, t, dur, { a: params.attack ?? 1.2, d: 1, s: 1, r: params.release ?? 1.5, peak });
      const nodes = [osc(ctx, params.wave ?? 'sawtooth', freq, t, -6), osc(ctx, params.wave ?? 'sawtooth', freq, t, 6)];
      if (params.fifth !== false) nodes.push(osc(ctx, 'sawtooth', freq * 1.5, t, 3));
      nodes.push(osc(ctx, 'sine', freq, t));
      for (const o of nodes) o.connect(lp);
      lp.connect(amp).connect(out);
      for (const o of [...nodes, lfo]) o.start(t);
      stopAll([...nodes, lfo], end);
      return end;
    },

    // A throat chant: a low buzzing voice whose vowel opens from "oo" to
    // "ah" over the note.
    chant(ctx, out, t, { freq, dur, vel, params = {} }) {
      const peak = (params.level ?? 0.3) * vel;
      const src = osc(ctx, 'sawtooth', freq, t);
      const src2 = osc(ctx, 'sawtooth', freq, t, 7);
      const formants = [[320, 720, 6], [800, 1100, 7], [2300, 2600, 9]].map(([from, to, q]) => {
        const f = filter(ctx, 'bandpass', from, q, t);
        f.frequency.linearRampToValueAtTime(to, t + Math.max(0.2, dur * 0.7));
        return f;
      });
      const sum = gain(ctx, 1);
      for (const f of formants) {
        src.connect(f);
        src2.connect(f);
        f.connect(sum);
      }
      const amp = gain(ctx, 0);
      const end = adsr(amp.gain, t, dur, { a: params.attack ?? 0.12, d: 0.3, s: 0.85, r: params.release ?? 0.35, peak: peak * 3 });
      sum.connect(amp).connect(out);
      for (const o of [src, src2]) o.start(t);
      stopAll([src, src2], end);
      return end;
    },

    // A riser: filtered noise sweeping up, and a saw climbing an octave,
    // swelling to its end (`dur`).
    riser(ctx, out, t, { freq, dur, vel, params = {} }, bank) {
      const level = (params.level ?? 0.22) * vel;
      const src = ctx.createBufferSource();
      src.buffer = bank.noise();
      src.loop = true;
      const bp = filter(ctx, 'bandpass', 300, 2.2, t);
      bp.frequency.exponentialRampToValueAtTime(params.top ?? 7000, t + dur);
      const amp = gain(ctx, 0);
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(level, t + dur);
      amp.gain.linearRampToValueAtTime(0, t + dur + 0.05);
      const saw = osc(ctx, 'sawtooth', freq, t);
      saw.frequency.exponentialRampToValueAtTime(freq * 2, t + dur);
      const sawLp = filter(ctx, 'lowpass', 900, 1, t);
      sawLp.frequency.exponentialRampToValueAtTime(5000, t + dur);
      const sawLevel = gain(ctx, 0.25);
      src.connect(bp).connect(amp);
      saw.connect(sawLp).connect(sawLevel).connect(amp);
      amp.connect(out);
      src.start(t);
      saw.start(t);
      const end = t + dur + 0.06;
      stopAll([src, saw], end);
      return end;
    },

    // A siren: a voice sliding up and down (Sol-Noir's overtime).
    siren(ctx, out, t, { freq, dur, vel, params = {} }) {
      const level = (params.level ?? 0.09) * vel;
      const o = osc(ctx, 'triangle', freq, t);
      const o2 = osc(ctx, 'sawtooth', freq, t, 5);
      const curve = new Float32Array(64);
      const cycles = params.cycles ?? 2;
      for (let i = 0; i < curve.length; i += 1) {
        curve[i] = freq * (1 + 0.5 * (0.5 - 0.5 * Math.cos((i / (curve.length - 1)) * cycles * Math.PI * 2)));
      }
      o.frequency.setValueCurveAtTime(curve, t, dur);
      o2.frequency.setValueCurveAtTime(curve, t, dur);
      const lp = filter(ctx, 'lowpass', 2400, 1, t);
      const o2g = gain(ctx, 0.25);
      const amp = gain(ctx, 0);
      const end = adsr(amp.gain, t, dur, { a: dur * 0.3, d: 0.2, s: 1, r: 0.3, peak: level });
      o.connect(lp);
      o2.connect(o2g).connect(lp);
      lp.connect(amp).connect(out);
      o.start(t);
      o2.start(t);
      stopAll([o, o2], end);
      return end;
    },

    // A swell of filtered noise: a blizzard's gust (`band`: high and airy) or
    // a volcano's rumble (low and heavy).
    swell(ctx, out, t, { dur, vel, params = {} }, bank) {
      const level = (params.level ?? 0.2) * vel;
      const src = ctx.createBufferSource();
      src.buffer = bank.noise();
      src.loop = true;
      const low = params.kind === 'rumble';
      const f = filter(ctx, low ? 'lowpass' : 'bandpass', low ? 90 : 700, low ? 2 : 1.2, t);
      f.frequency.linearRampToValueAtTime(low ? 260 : 3200, t + dur * 0.55);
      f.frequency.linearRampToValueAtTime(low ? 80 : 900, t + dur);
      const amp = gain(ctx, 0);
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(level, t + dur * 0.55);
      amp.gain.linearRampToValueAtTime(0, t + dur);
      let head = f;
      if (low) {
        const shaper = ctx.createWaveShaper();
        shaper.curve = driveCurve(3);
        f.connect(shaper);
        head = shaper;
      }
      src.connect(f);
      head.connect(amp).connect(out);
      src.start(t);
      src.stop(t + dur + 0.02);
      return t + dur + 0.02;
    },

    // A pulsing sub: one short sine thump (overtime's heartbeat).
    pulse(ctx, out, t, { freq, dur, vel, params = {} }) {
      const amp = gain(ctx, 0);
      const end = adsr(amp.gain, t, Math.min(dur, 0.12), { a: 0.006, d: 0.1, s: 0.5, r: 0.08, peak: (params.level ?? 0.45) * vel });
      const o = osc(ctx, 'sine', freq, t);
      o.connect(amp).connect(out);
      o.start(t);
      o.stop(end);
      return end;
    },

    // Tension: a high cluster of strings a semitone apart, bent sharp by
    // `params.cents` (overtime's rising pitch).
    tension(ctx, out, t, { freq, dur, vel, params = {} }) {
      const amp = gain(ctx, 0);
      const end = adsr(amp.gain, t, dur, { a: 0.4, d: 0.2, s: 1, r: 0.3, peak: (params.level ?? 0.06) * vel });
      const bp = filter(ctx, 'bandpass', freq * 2, 0.8, t);
      const nodes = [0, 1, 6].map((semi, i) => {
        const o = osc(ctx, 'sawtooth', freq * 2 ** (semi / 12), t, (i - 1) * 5);
        o.detune.linearRampToValueAtTime((params.cents ?? 0) + (i - 1) * 5, t + dur);
        o.connect(bp);
        return o;
      });
      bp.connect(amp).connect(out);
      for (const o of nodes) o.start(t);
      stopAll(nodes, end);
      return end;
    },
  });

  // A soft-clipping curve for a waveshaper: `amount` 1 is gentle, 4 heavy.
  function driveCurve(amount) {
    const n = 1024;
    const curve = new Float32Array(n);
    const k = Math.tanh(amount);
    for (let i = 0; i < n; i += 1) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * amount) / k;
    }
    return curve;
  }

  // Plays one note of channel `spec` into `out` at `t`: a drum's sample, a
  // tone's sample at its pitch, or a synth. Returns its end time.
  function playNote(ctx, out, bank, spec, t, note) {
    if (spec.drum) {
      const buffer = bank.drum(spec.drum, spec.opts);
      return playBuffer(ctx, out, buffer, t, { level: (spec.level ?? 1) * note.vel ** 1.4, rate: spec.rate ?? 1 });
    }
    if (spec.tone) {
      const notes = note.midis ?? [note.midi];
      let end = t;
      const each = (spec.level ?? 0.6) * note.vel ** 1.2 / Math.sqrt(notes.length);
      notes.forEach((m, i) => {
        const at = t + i * (spec.strum ?? 0);
        end = Math.max(end, playBuffer(ctx, out, bank.tone(spec.tone, m), at, { level: each, dur: spec.ring ? null : note.dur + 0.02, release: spec.release ?? 0.25 }));
      });
      return end;
    }
    const synth = SYNTHS[spec.synth];
    if (!synth) throw new Error(`[music] Unknown synth "${spec.synth}"`);
    return synth(ctx, out, t, { ...note, params: spec.params ?? {} }, bank);
  }

  /* ---- sequencer (compile and render a bar) ---- */
  const asList = (value) => (Array.isArray(value) ? value : [value]);

  // ---- Compiling a theme ------------------------------------------------------------

  // A line's length must fit the bar: a whole number of bars, or a part of
  // one that divides it (a beat, half a bar).
  function checkLength(name, steps) {
    if (steps % STEPS_PER_BAR === 0 || STEPS_PER_BAR % steps === 0) return;
    throw new Error(`[music] Part "${name}" is ${steps} sixteenths long: not a whole number of bars`);
  }

  function compilePart(name, spec) {
    const checked = (part) => {
      checkLength(name, part.steps);
      return part;
    };
    if (spec.melody !== undefined) return checked({ kind: 'melody', ...parseMelody(spec.melody) });
    if (spec.line !== undefined) return checked({ kind: 'line', ...parseLine(spec.line) });
    if (spec.beat !== undefined) {
      const lines = Object.fromEntries(Object.entries(spec.beat).map(([channel, text]) => [channel, parseRhythm(text)]));
      for (const rhythm of Object.values(lines)) checkLength(name, rhythm.steps);
      return { kind: 'beat', lines };
    }
    if (spec.chord !== undefined) {
      const rhythm = spec.rhythm ? parseRhythm(spec.rhythm) : null;
      return { kind: 'chord', len: spec.chord, rhythm, open: !!spec.open, top: spec.top ?? null };
    }
    if (spec.hold !== undefined) return { kind: 'hold', degree: spec.hold, len: spec.len ?? STEPS_PER_BAR, every: spec.every ?? STEPS_PER_BAR };
    if (spec.hits !== undefined) return checked({ kind: 'rhythm', ...parseRhythm(spec.hits) });
    throw new Error(`[music] Part "${name}" has no content`);
  }

  function compileEntry(entry) {
    if (entry === null) return null;
    if (typeof entry === 'string') return { part: entry };
    return { ...entry };
  }

  function compileSection(theme, name, spec) {
    const play = {};
    for (const [channel, value] of Object.entries(spec.play ?? {})) {
      const entries = asList(value).map(compileEntry);
      for (const e of entries) {
        if (!e) continue;
        if (!theme.parts[e.part]) throw new Error(`[music] Section "${name}" plays unknown part "${e.part}"`);
        if (channel !== 'beat' && !theme.channels[channel]) throw new Error(`[music] Section "${name}" plays on unknown channel "${channel}"`);
      }
      play[channel] = entries;
    }
    if (spec.fill && !theme.parts[spec.fill]) throw new Error(`[music] Section "${name}" fills with unknown part "${spec.fill}"`);
    return {
      name,
      bars: spec.bars,
      chords: parseChords(spec.chords ?? '1'),
      play,
      transpose: spec.transpose ?? 0,
      fill: spec.fill ?? null,
      crash: spec.crash ?? false,
      riser: spec.riser ?? 0,
      hit: spec.hit ?? null,
    };
  }

  const compiled = new WeakMap();

  // A theme parsed once: every part, section and version checked, so a typo
  // fails loudly at load, never quietly in play.
  function compileTheme(theme) {
    if (compiled.has(theme)) return compiled.get(theme);
    const parts = Object.fromEntries(Object.entries(theme.parts).map(([name, spec]) => [name, compilePart(name, spec)]));
    const withParts = { ...theme, parts };
    for (const [name, part] of Object.entries(parts)) {
      if (part.kind !== 'beat') continue;
      for (const channel of Object.keys(part.lines)) {
        if (!theme.channels[channel]) throw new Error(`[music] Beat "${name}" plays on unknown channel "${channel}"`);
      }
    }
    const sections = Object.fromEntries(Object.entries(theme.sections).map(([name, spec]) => [name, compileSection(withParts, name, spec)]));
    const versions = {};
    for (const [id, v] of Object.entries(theme.versions || {})) {
      for (const s of [...v.once, ...v.loop]) if (!sections[s]) throw new Error(`[music] Version "${id}" plays unknown section "${s}"`);
      const scale = SCALES[v.scale ?? theme.scale];
      if (!scale) throw new Error(`[music] Version "${id}" has unknown scale "${v.scale ?? theme.scale}"`);
      versions[id] = Object.freeze({
        id,
        bpm: v.bpm ?? theme.bpm,
        scale,
        transpose: v.transpose ?? 0,
        swing: v.swing ?? theme.swing ?? 0,
        once: v.once,
        loop: v.loop,
        overtime: v.overtime ?? null,
        level: v.level ?? 1,
        lowpass: v.lowpass ?? null,
      });
    }
    const result = Object.freeze({ ...withParts, sections, versions });
    compiled.set(theme, result);
    return result;
  }

  // ---- Writing a bar -----------------------------------------------------------------

  // The events of bar `bar` of `section`, on pass `pass` of the loop, at
  // overtime intensity `intensity`: [{ step, channel, midi | midis, len, vel }].
  function renderBar(theme, version, section, bar, pass, intensity = 0) {
    const events = [];
    const chord = section.chords[bar % section.chords.length];
    const scale = version.scale;
    const base = theme.tonic + version.transpose + section.transpose;
    const from = bar * STEPS_PER_BAR;
    const to = from + STEPS_PER_BAR;
    const last = bar === section.bars - 1;
    const octaveOf = (channel, entry) => (theme.channels[channel]?.octave ?? 0) + (entry?.octave ?? 0);

    // Each event of a part that loops every `steps` sixteenths, inside this
    // bar.
    const within = (steps, list, fn) => {
      if (!(steps > 0)) return;
      for (const e of list) {
        for (let k = Math.floor((from - e.step) / steps); k * steps + e.step < to; k += 1) {
          const s = k * steps + e.step;
          if (s >= from && s < to) fn(e, s - from);
        }
      }
    };

    const playEntry = (channel, entry) => {
      const part = theme.parts[entry.part];
      const vel = entry.vel ?? 1;
      const oct = octaveOf(channel, entry);
      switch (part.kind) {
        case 'melody':
          within(part.steps, part.events, (e, step) => {
            // `shift`: the same line a number of scale degrees higher (2: a
            // third above, in harmony).
            const midi = base + degreeSemis(scale, e.value + (entry.shift ?? 0)) + e.acc + 12 * (e.octave + oct);
            // `repeat`: each note picked again every that many sixteenths
            // (a surf guitar's tremolo picking), within this bar.
            if (entry.repeat) {
              for (let r = 0; r < e.len && step + r < STEPS_PER_BAR; r += entry.repeat) {
                events.push({ step: step + r, channel, midi, len: entry.repeat, vel: e.vel * vel * (r === 0 ? 1 : 0.8) });
              }
            } else events.push({ step, channel, midi, len: e.len, vel: e.vel * vel });
          });
          break;
        case 'line':
          within(part.steps, part.events, (e, step) => {
            const midi = base + lineSemis(scale, chord, e.value) + e.acc + 12 * (e.octave + oct);
            events.push({ step, channel, midi, len: e.len, vel: e.vel * vel });
          });
          break;
        case 'chord': {
          const voicing = chordVoicing(scale, chord).map((s) => base + s + 12 * oct);
          if (part.open) voicing[0] -= 12;
          if (part.top !== null) voicing.push(base + degreeSemis(scale, part.top) + 12 * oct);
          if (part.rhythm) {
            within(part.rhythm.steps, part.rhythm.hits, (e, step) => events.push({ step, channel, midis: voicing, len: part.len, vel: e.vel * vel }));
          } else {
            for (let s = 0; s < STEPS_PER_BAR; s += part.len) events.push({ step: s, channel, midis: voicing, len: part.len, vel: 0.8 * vel });
          }
          break;
        }
        case 'hold': {
          if ((from % part.every) !== 0 && part.every > STEPS_PER_BAR) break;
          const root = part.degree === 'R' ? lineSemis(scale, chord, 'R') : degreeSemis(scale, part.degree);
          for (let s = 0; s < STEPS_PER_BAR; s += Math.min(part.every, STEPS_PER_BAR)) {
            events.push({ step: s, channel, midi: base + root + 12 * oct, len: part.len, vel: 0.8 * vel });
          }
          break;
        }
        case 'rhythm':
          within(part.steps, part.hits, (e, step) => events.push({ step, channel, midi: base + 12 * oct, len: 1, vel: e.vel * vel }));
          break;
        case 'beat':
          for (const [line, rhythm] of Object.entries(part.lines)) {
            within(rhythm.steps, rhythm.hits, (e, step) => events.push({ step, channel: line, midi: base, len: 1, vel: e.vel * vel }));
          }
          break;
        default:
          break;
      }
    };

    const allowed = (entry) => entry && intensity >= (entry.min ?? 0) && intensity <= (entry.max ?? 1);
    for (const [channel, entries] of Object.entries(section.play)) {
      let entry = entries[pass % entries.length];
      if (channel === 'beat' && last && section.fill) entry = { part: section.fill };
      if (!allowed(entry)) continue;
      playEntry(channel, entry);
    }
    if (bar === 0 && section.crash && theme.channels.crash) events.push({ step: 0, channel: 'crash', midi: base, len: 1, vel: 1 });
    if (section.hit && bar === section.hit.bar && theme.channels[section.hit.channel ?? 'boom']) {
      events.push({ step: section.hit.step ?? 0, channel: section.hit.channel ?? 'boom', midi: base, len: 1, vel: 1 });
    }
    if (section.riser && bar === section.bars - section.riser && theme.channels.riser) {
      events.push({ step: 0, channel: 'riser', midi: base + 12 * octaveOf('riser'), len: section.riser * STEPS_PER_BAR, vel: 1 });
    }
    if (version.overtime) overtimeLayers(theme, version, chord, base, bar, intensity, events);
    return events;
  }

  // Overtime's own layers, written from its intensity (0-1) as each bar
  // comes: the clock (quarters, then eighths, then sixteenths), the sub's
  // pulse (from 0.2: eighths, sixteenths from 0.7), risers (every four bars
  // from 0.45, every two from 0.75, every bar from 0.92) and the strings'
  // cluster (from 0.35, bending up to a semitone sharp).
  function overtimeLayers(theme, version, chord, base, bar, intensity, events) {
    const ot = version.overtime;
    const ch = theme.channels;
    const scale = version.scale;
    if (ot.tick && ch[ot.tick]) {
      const every = intensity >= 0.65 ? 1 : intensity >= 0.3 ? 2 : 4;
      for (let s = 0; s < STEPS_PER_BAR; s += every) {
        const accent = s % 4 === 0;
        events.push({ step: s, channel: s % 8 === 4 ? ot.tock ?? ot.tick : ot.tick, midi: base, len: 1, vel: accent ? 0.9 : 0.55 + 0.3 * intensity });
      }
    }
    if (ot.pulse && ch[ot.pulse] && intensity >= 0.2) {
      const every = intensity >= 0.7 ? 1 : 2;
      const root = base + lineSemis(scale, chord, 'R') + 12 * (ch[ot.pulse].octave ?? -2);
      for (let s = 0; s < STEPS_PER_BAR; s += every) events.push({ step: s, channel: ot.pulse, midi: root, len: every, vel: s % 4 === 0 ? 1 : 0.7 });
    }
    if (ot.riser && ch[ot.riser] && intensity >= 0.45) {
      const period = intensity >= 0.92 ? 1 : intensity >= 0.75 ? 2 : 4;
      if (bar % period === 0) {
        events.push({ step: 0, channel: ot.riser, midi: base + 12 * (ch[ot.riser].octave ?? 0), len: period * STEPS_PER_BAR, vel: 0.6 + 0.4 * intensity });
      }
    }
    if (ot.tension && ch[ot.tension] && intensity >= 0.35) {
      events.push({
        step: 0, channel: ot.tension, midi: base + lineSemis(scale, chord, 'R') + 12 * (ch[ot.tension].octave ?? 1),
        len: STEPS_PER_BAR, vel: 0.5 + 0.5 * intensity, cents: 100 * intensity,
      });
    }
  }


  /* ---- Shadow Skirr's own instruments ---- */
  Object.assign(TONES, {
    /* a felt piano: slightly stretched partials, the felt rounding the top, a soft hammer */
    piano: function (sr, f, rng) {
      const list = [];
      for (let n = 1; n <= 8; n++) list.push({ ratio: n * Math.sqrt(1 + 0.0004 * n * n), amp: 1 / Math.pow(n, 1.35), decay: 2.2 / Math.pow(n, 0.7) });
      list.push({ ratio: 1, amp: 0.35, decay: 2.2, detune: 0.0011 });
      const out = partials(sr, 2.6, f, list, { attack: 0.003 });
      biquad(out, sr, "lowpass", Math.min(f * 7, 4200), 0.6);
      const hammer = noise(sr, 0.03, rng);
      biquad(hammer, sr, "lowpass", 900, 0.8);
      expEnv(hammer, sr, 0.008);
      mixInto(out, hammer, 0.12);
      return declick(normalize(out, 0.85), sr, 0.2, 40);
    },
    /* a Rhodes-style electric piano: a warm tine, its bell-like ping, a touch of bark */
    epiano: function (sr, f) {
      const out = partials(sr, 2.4, f, [
        { ratio: 1, amp: 1, decay: 1.5 }, { ratio: 1, amp: 0.35, decay: 1.5, detune: 0.0013 }, { ratio: 2, amp: 0.3, decay: 0.45 },
        { ratio: 3, amp: 0.1, decay: 0.22 }, { ratio: 7.1, amp: 0.1, decay: 0.025 }], { attack: 0.002 });
      return declick(normalize(saturate(out, 1.4), 0.85), sr, 0.1, 40);
    },
    /* a nylon-string guitar and an upright bass: plucked strings with their bodies */
    nylon: function (sr, f, rng) {
      return pluck(sr, 2.2, f, rng, { bright: 0.45, decay: 1.9, position: 0.2, body: [{ freq: 110, q: 1.4, gain: 4 }, { freq: 230, q: 1.3, gain: 3 }, { freq: 2600, q: 1, gain: -3 }] });
    },
    upright: function (sr, f, rng) {
      return pluck(sr, 1.6, f, rng, { bright: 0.28, decay: 1.1, position: 0.25, body: [{ freq: 95, q: 1.2, gain: 5 }, { freq: 260, q: 1.5, gain: 3 }] });
    },
    /* a vibraphone: a pure bar with its motor's slow tremolo */
    vibes: function (sr, f) {
      const out = partials(sr, 2.6, f, [{ ratio: 1, amp: 1, decay: 1.8 }, { ratio: 4, amp: 0.16, decay: 0.3 }, { ratio: 10, amp: 0.04, decay: 0.05 }], { attack: 0.002 });
      for (let i = 0; i < out.length; i++) out[i] *= 0.82 + 0.18 * Math.cos(2 * Math.PI * 5.2 * i / sr);
      return declick(normalize(out, 0.85), sr, 0.1, 40);
    },
    kalimba: function (sr, f, rng) {
      const out = partials(sr, 1.4, f, [{ ratio: 1, amp: 1, decay: 0.8 }, { ratio: 5.4, amp: 0.22, decay: 0.08 }, { ratio: 9.7, amp: 0.06, decay: 0.03 }], { attack: 0.001 });
      const click = noise(sr, 0.004, rng);
      biquad(click, sr, "bandpass", 3000, 1);
      mixInto(out, click, 0.15);
      return declick(normalize(out, 0.85), sr, 0.05, 30);
    }
  });
  Object.assign(SYNTHS, {
    /* a wooden flute or a tin whistle: a soft, nearly pure tone, a breath under it, vibrato only on held notes.
       `breath`, `cutoff`, `vibrato` (cents), `attack` */
    flute: function (ctx, out, t, note, bank) {
      const freq = note.freq, dur = note.dur, vel = note.vel, params = note.params || {};
      const peak = (params.level ?? 0.22) * Math.pow(vel, 1.1);
      const lp = filter(ctx, "lowpass", params.cutoff ?? 2600, 0.7, t);
      const amp = gain(ctx, 0);
      const end = adsr(amp.gain, t, dur, { a: params.attack ?? 0.045, d: 0.2, s: params.sustain ?? 0.85, r: params.release ?? 0.12, peak: peak });
      const a = osc(ctx, "sine", note.from ?? freq, t), b = osc(ctx, "triangle", note.from ?? freq, t, 4);
      if (note.from) for (const o of [a, b]) o.frequency.setTargetAtTime(freq, t, params.glide ?? 0.04);
      const bg = gain(ctx, params.body ?? 0.35);
      const vib = osc(ctx, "sine", params.rate ?? 5.2, t), depth = gain(ctx, 0);
      depth.gain.setValueAtTime(0, t); depth.gain.setValueAtTime(0, t + 0.18); depth.gain.linearRampToValueAtTime(params.vibrato ?? 12, t + 0.18 + Math.min(0.4, dur));
      vib.connect(depth); depth.connect(a.detune); depth.connect(b.detune);
      const src = ctx.createBufferSource(); src.buffer = bank.noise(); src.loop = true;
      const bp = filter(ctx, "bandpass", Math.min(freq * 2.5, 6000), 1.1, t), bgain = gain(ctx, 0);
      const br = (params.breath ?? 0.12) * peak;
      bgain.gain.setValueAtTime(0, t); bgain.gain.linearRampToValueAtTime(br * 2, t + 0.03); bgain.gain.setTargetAtTime(br, t + 0.03, 0.08);
      bgain.gain.setTargetAtTime(0, Math.max(t + 0.04, t + dur), 0.03);
      src.connect(bp).connect(bgain).connect(amp);
      a.connect(lp); b.connect(bg).connect(lp); lp.connect(amp).connect(out);
      for (const o of [a, b, vib]) o.start(t);
      src.start(t, rnd01(t) * 1.5);
      stopAll([a, b, vib, src], end);
      return end;
    },
    /* an accordion: three reeds (two a little apart, the musette), a reedy body, no vibrato. `level`, `cutoff`, `detune` */
    reed: function (ctx, out, t, note) {
      const notes = note.freqs ?? [note.freq], dur = note.dur, vel = note.vel, params = note.params || {};
      const peak = (params.level ?? 0.16) * Math.pow(vel, 1.1) / Math.sqrt(notes.length);
      const lp = filter(ctx, "lowpass", params.cutoff ?? 2600, 0.8, t), body = filter(ctx, "peaking", 1350, 1.2, t);
      body.gain.setValueAtTime(4, t);
      const amp = gain(ctx, 0);
      const end = adsr(amp.gain, t, dur, { a: params.attack ?? 0.03, d: 0.15, s: 0.9, r: params.release ?? 0.08, peak: peak });
      const oscs = [];
      for (const f of notes) {
        oscs.push(osc(ctx, "sawtooth", f, t, -(params.detune ?? 8)), osc(ctx, "sawtooth", f, t, params.detune ?? 8));
        const sq = osc(ctx, "square", f, t); const sg = gain(ctx, 0.35); sq.connect(sg).connect(body); oscs.push(sq);
      }
      for (const o of oscs) if (o.type === "sawtooth") o.connect(body);
      body.connect(lp).connect(amp).connect(out);
      for (const o of oscs) o.start(t);
      stopAll(oscs, end);
      return end;
    }
  });
  Object.assign(DRUMS, {
    /* brushes on a snare: a soft slap and its swish */
    brush: function (sr, rng) {
      const out = noise(sr, 0.3, rng);
      biquad(out, sr, "lowpass", 5200, 0.7); biquad(out, sr, "highpass", 700, 0.7);
      for (let i = 0; i < out.length; i++) { const t = i / sr; out[i] *= Math.min(1, t / 0.004) * Math.exp(-t / 0.08); }
      const swish = noise(sr, 0.3, rng);
      biquad(swish, sr, "bandpass", 2600, 0.6);
      for (let i = 0; i < swish.length; i++) { const t = i / sr; swish[i] *= Math.min(1, t / 0.03) * Math.exp(-t / 0.1); }
      mixInto(out, swish, 0.4);
      return declick(normalize(out, 0.8), sr, 0.2, 10);
    },
    rim: function (sr, rng) {
      const out = partials(sr, 0.12, 1720, [{ ratio: 1, amp: 0.6, decay: 0.022 }, { ratio: 0.331, amp: 0.5, decay: 0.028 }]);
      const click = noise(sr, 0.004, rng); biquad(click, sr, "highpass", 3000); mixInto(out, click, 0.5);
      return declick(normalize(out, 0.85), sr, 0.05, 4);
    },
    snap: function (sr, rng) {
      const out = noise(sr, 0.12, rng);
      biquad(out, sr, "bandpass", 2200, 2.2); biquad(out, sr, "highpass", 900, 0.7); expEnv(out, sr, 0.018);
      return declick(normalize(out, 0.85), sr, 0.05, 4);
    },
    wood: function (sr, rng, opts) {
      const tone = (opts && opts.tone) || 1, out = partials(sr, 0.16, 900 * tone, [{ ratio: 1, amp: 0.8, decay: 0.045 }, { ratio: 2.64, amp: 0.25, decay: 0.018 }]);
      const click = noise(sr, 0.003, rng); biquad(click, sr, "bandpass", 2500, 1); mixInto(out, click, 0.3);
      return declick(normalize(out, 0.85), sr, 0.05, 4);
    }
  });
  Object.freeze(DRUMS); Object.freeze(TONES); Object.freeze(SYNTHS);
  /* a breath's start in its noise loop, the same for the same time (no Math.random in the music) */
  function rnd01(t) { const x = Math.sin(t * 12.9898) * 43758.5453; return x - Math.floor(x); }

  return { SCALES: SCALES, STEPS_PER_BAR: STEPS_PER_BAR, midiToFreq: midiToFreq, compileTheme: compileTheme, renderBar: renderBar,
    SampleBank: SampleBank, playNote: playNote, impulseResponse: impulseResponse, audioRng: audioRng, DRUMS: DRUMS, TONES: TONES, SYNTHS: SYNTHS };
})();
