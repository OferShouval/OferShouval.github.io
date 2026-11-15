// One note of the synth: a simple analog-style voice, laid out like a Korg minilogue. Two oscillators and noise are
// mixed, go through a low-pass filter, and then a volume envelope. A second envelope opens the filter and can bend the
// pitch, and an LFO moves the pitch, the wave's shape, the filter or the volume. Its settings are the 'synth.*' ones
// in params.js. Used by engine.js.
//
//   oscillator 1 ─ shape ─┐
//   oscillator 2 ─ shape ─┼─ filter ─ volume envelope ─ (LFO tremolo) ─ pan ─ out
//   noise ────────────────┘     ↑ envelope, LFO, key tracking

import { frequencyOf } from './params.js';

// Folding: a wave pushed past the top comes back down, and past the bottom back up, so the harder it's pushed, the more
// times it folds, and the brighter it gets. Straight through between -1 and 1, so a wave that isn't pushed is unchanged.
let folding = null;
function foldCurve() {
  if (!folding) {
    const points = 4801; // (So each turn of the fold lands exactly on a point)
    folding = new Float32Array(points);
    for (let i = 0; i < points; i++) {
      const x = ((i / (points - 1)) * 2 - 1) * 6;
      const y = (((x + 1) % 4) + 4) % 4;
      folding[i] = y < 2 ? y - 1 : 3 - y;
    }
  }
  return folding;
}
// Squaring off: below the middle is -1, above is 1. A sawtooth through this is a pulse, and moving the sawtooth up or
// down changes how wide the pulse is.
let squaring = null;
function squareCurve() {
  if (!squaring) {
    squaring = new Float32Array(2048);
    for (let i = 0; i < squaring.length; i++) squaring[i] = i < squaring.length / 2 ? -1 : 1;
  }
  return squaring;
}
// The random LFO: steps, each held a while, played at whatever speed gives one step per cycle
const stepLength = 256;
const randomSteps = new WeakMap();
function stepsOf(audio) {
  if (!randomSteps.has(audio)) {
    const steps = 32;
    const buffer = audio.createBuffer(1, steps * stepLength, 8000);
    const out = buffer.getChannelData(0);
    for (let s = 0; s < steps; s++) out.fill(Math.random() * 2 - 1, s * stepLength, (s + 1) * stepLength);
    randomSteps.set(audio, buffer);
  }
  return randomSteps.get(audio);
}

// Holds a setting where it is at `time`, forgetting what was planned for it after
export function holdAt(param, time) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(time);
  else param.cancelScheduledValues(time);
}

const glide = 0.025; // How quickly a note that's sounding takes on a setting that's changed, in seconds

// `get(name)` gives a setting as it is right now ('synth.cutoff'...). `noise` is a buffer of white noise.
// Gives { release(when), stop(), apply(), onended }.
export function synthVoice(audio, get, noise, { note, velocity = 0.8, when, pan = 0, detune = 0 }, destination) {
  const t = Math.max(when ?? 0, audio.currentTime);
  const s = (name) => get('synth.' + name);
  const frequency = frequencyOf(note);
  const lfoTo = s('lfoTo');
  const started = []; // Everything that has to be stopped at the end
  const start = (node, ...rest) => {
    node.start(t, ...rest);
    started.push(node);
    return node;
  };

  // An oscillator with its shape. Gives its output, and how to set its pitch and shape.
  function oscillator(n) {
    const wave = s('wave' + n);
    const osc = audio.createOscillator();
    osc.frequency.value = frequency * Math.pow(2, s('oct' + n));
    let out = osc;
    let shape = null; // The setting that bends it, and how far a full turn of the knob takes it
    let reach = 0;
    let rest = 0;
    if (wave === 'square') {
      const amount = s('shape' + n);
      if (amount > 0.001 || lfoTo === 'shape') {
        osc.type = 'sawtooth';
        const width = audio.createConstantSource();
        width.offset.value = amount * 0.95;
        const squarer = audio.createWaveShaper();
        squarer.curve = squareCurve();
        squarer.oversample = '4x';
        osc.connect(squarer);
        width.connect(squarer);
        start(width);
        out = squarer;
        shape = width.offset;
        reach = 0.95;
      } else osc.type = 'square';
    } else {
      osc.type = wave;
      const push = audio.createGain();
      push.gain.value = (1 + s('shape' + n) * 5) / 6;
      const folder = audio.createWaveShaper();
      folder.curve = foldCurve();
      folder.oversample = '2x';
      osc.connect(push).connect(folder);
      out = folder;
      shape = push.gain;
      reach = 5 / 6;
      rest = 1 / 6;
    }
    const level = audio.createGain();
    out.connect(level);
    start(osc);
    return { osc, level, shape, reach, rest, n };
  }

  const oscillators = [oscillator(1), oscillator(2)];
  const hiss = audio.createBufferSource();
  hiss.buffer = noise;
  hiss.loop = true;
  const hissLevel = audio.createGain();
  hiss.connect(hissLevel);
  start(hiss, Math.random() * noise.duration);

  // The filter: one stage for a gentle slope, two for a steep one. (A pulse isn't centred, so anything that doesn't
  // move is taken off first, or the volume envelope would thump.)
  const steady = audio.createBiquadFilter();
  steady.type = 'highpass';
  steady.frequency.value = 18;
  const filters = [audio.createBiquadFilter()];
  if (s('slope') === 'steep') filters.push(audio.createBiquadFilter());
  for (const filter of filters) filter.type = 'lowpass';
  for (const { level } of oscillators) level.connect(steady);
  hissLevel.connect(steady);
  filters.reduce((from, filter) => from.connect(filter), steady);

  const amp = audio.createGain();
  const tremolo = audio.createGain();
  const side = audio.createStereoPanner();
  side.pan.value = Math.max(-1, Math.min(1, pan));
  filters[filters.length - 1].connect(amp).connect(tremolo).connect(side).connect(destination);

  // The envelope: a signal that goes from 0 up to 1 and back down to its sustain, sent to the filter and the pitch
  const envelope = audio.createConstantSource();
  envelope.offset.setValueAtTime(0, t);
  envelope.offset.linearRampToValueAtTime(1, t + s('egA'));
  envelope.offset.setTargetAtTime(s('egS'), t + s('egA'), Math.max(0.001, s('egD') / 4));
  const toFilter = audio.createGain();
  toFilter.gain.value = s('egInt') * 7200; // Up to six octaves either way, in cents
  const toPitch = audio.createGain();
  toPitch.gain.value = s('egPitch') * 100;
  envelope.connect(toFilter);
  envelope.connect(toPitch);
  for (const filter of filters) toFilter.connect(filter.detune);
  for (const { osc } of oscillators) toPitch.connect(osc.detune);
  start(envelope);

  // The volume envelope
  const peak = velocity * 0.5;
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + s('ampA'));
  amp.gain.setTargetAtTime(peak * s('ampS'), t + s('ampA'), Math.max(0.001, s('ampD') / 4));

  // The LFO, and how far it moves what it moves
  const randomly = s('lfoWave') === 'random';
  let lfo;
  if (randomly) {
    lfo = audio.createBufferSource();
    lfo.buffer = stepsOf(audio);
    lfo.loop = true;
  } else {
    lfo = audio.createOscillator();
    lfo.type = s('lfoWave');
  }
  const depths = []; // [gain node, how far a full amount moves it]
  const moves = (target, reach) => {
    const depth = audio.createGain();
    lfo.connect(depth).connect(target);
    depths.push([depth, reach]);
  };
  if (lfoTo === 'pitch') for (const { osc } of oscillators) moves(osc.detune, 1200);
  else if (lfoTo === 'cutoff') for (const filter of filters) moves(filter.detune, 4800);
  else if (lfoTo === 'shape') for (const { shape, reach } of oscillators) shape && moves(shape, reach);
  else if (lfoTo === 'volume') moves(tremolo.gain, 0.5);
  start(lfo, ...(randomly ? [Math.random() * lfo.buffer.duration] : []));

  // Every setting that can change while the note sounds, as it is now
  function apply(first = false) {
    const now = first ? t : audio.currentTime;
    const set = (param, value) => (first ? param.setValueAtTime(value, t) : param.setTargetAtTime(value, now, glide));
    const transpose = get('notes.transpose') * 100 + detune;
    for (const { osc, level, shape, reach, rest, n } of oscillators) {
      set(osc.detune, s('pitch' + n) * 100 + transpose);
      set(level.gain, s('mix' + n));
      if (shape) set(shape, rest + s('shape' + n) * reach);
    }
    set(hissLevel.gain, s('noise'));
    const cutoff = Math.min(20000, Math.max(20, s('cutoff') * Math.pow(frequency / 261.63, s('keyTrack'))));
    for (const filter of filters) {
      set(filter.frequency, cutoff);
      set(filter.Q, (s('reso') * 26) / filters.length); // (A low-pass filter's Q is in decibels of peak)
    }
    const amount = s('lfoInt');
    const rate = s('lfoRate');
    if (randomly) set(lfo.playbackRate, (rate * stepLength) / 8000);
    else set(lfo.frequency, rate);
    for (const [depth, reach] of depths) set(depth.gain, (lfoTo === 'pitch' ? amount * amount : amount) * reach);
    if (lfoTo === 'volume') set(tremolo.gain, 1 - amount * 0.5);
  }
  apply(true);

  let released = false;
  let finished = false;
  const voice = {
    onended: null,
    apply: () => !finished && apply(),
    // Lets the note go: it dies away over its release (or over `over` seconds, if given), and then it's gone
    release(at = audio.currentTime, over = null) {
      if (released && over === null) return;
      released = true;
      const from = Math.max(at, audio.currentTime);
      const time = over ?? s('ampR');
      holdAt(amp.gain, from);
      amp.gain.setTargetAtTime(0, from, Math.max(0.002, time / 4));
      holdAt(envelope.offset, from);
      envelope.offset.setTargetAtTime(0, from, Math.max(0.002, (over ?? s('egR')) / 4));
      const ends = from + time * 2 + 0.05;
      for (const node of started) {
        try {
          node.stop(ends);
        } catch {}
      }
      setTimeout(() => {
        if (finished) return;
        finished = true;
        side.disconnect();
        voice.onended?.();
      }, (ends - audio.currentTime) * 1000 + 100);
    },
    stop: () => voice.release(audio.currentTime, 0.04),
  };
  return voice;
}
