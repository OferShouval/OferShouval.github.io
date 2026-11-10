// Instruments made from patches: a patch is plain data (JSON, so it can be saved, copied and loaded), and
// instrument() turns it into something that plays notes. The sound sandbox (tools/sound-sandbox) makes and saves
// them, into src/sounds/patches; a page plays one like this:
//
//   import harp from '../sounds/patches/ghost-harp.json';
//   import { instrument } from '../scripts/patch.js';
//   const harpSound = instrument(audio, harp, audioOut());
//   harpSound.play(60, 0.8, 0.3); // MIDI note, velocity 0-1, seconds held
//   harpSound.play(60, 0.8, 0.3, undefined, { pan: -0.5 }); // ...and from a little to the left (-1 to 1)
//
// A note is made of layers, all added together, through one filter and one volume:
//   osc    - a wave (sine, triangle, square, sawtooth) at some multiple of the note's frequency, which can glide
//            up or down from there as it starts (like a bubble's, rising as it shrinks)
//   noise  - a short burst of filtered noise, like a hammer's or a stick's thump, or (with `hold`) noise that keeps
//            going until the note's let go, for a background: water, wind, distant rain
//   sample - a sound file, played at the note's pitch (or as it is), from its root note; give it a list of files
//            and each note picks one of them at random (like a handful of recorded drips)
// ...and then through the instrument's echo. How long a note rings depends on how high it is (`ring`), and each layer
// fades `fade` times sooner than that (or over its own `decay`, in seconds, if it has one), down to its `sustain`
// share, until the note's let go.

export const blankPatch = {
  name: 'untitled',
  level: 0.15,
  ring: { low: 2, high: 0.8 }, // How long a note rings, in seconds (as a time constant), at note 36 and at note 96
  attack: 0.003, // Seconds every layer takes to come in, unless it has its own
  release: 0.3, // How quickly it's damped once it's let go (a time constant, in seconds)
  spread: 0, // How far each note's pitch strays, at random, either way, in semitones (so no two sound quite alike)
  wobble: { depth: 0, rate: 5 }, // Vibrato: cents, and times a second
  // The notes a page should play it on when it isn't given one (see randomNote()): from `low` to `high` (MIDI notes),
  // on `scale` - 'any' (any pitch in between, tuned to nothing, like real drops), 'chromatic', 'major' or
  // 'pentatonic' - in the key of `key` (0 = C, 2 = D...)
  range: { low: 62, high: 81, scale: 'pentatonic', key: 2 },
  filter: {
    type: 'lowpass',
    q: 0.5,
    start: { ratio: 12, add: 0, velocity: 2000 }, // Its cutoff as the note starts: the note's frequency times `ratio`, plus `add` Hz, plus `velocity` Hz at full velocity
    end: { ratio: 4, add: 400 }, // ...and where it closes to
    delay: 0.02, // Seconds before it starts closing
    time: 0.35, // How long it takes to close, as a share of the ring
    sway: { depth: 0, rate: 0.1 }, // Its cutoff drifting slowly up and down by `depth` semitones, `rate` times a second
    shift: 0, // The whole filter moved up or down, in semitones: brighter or darker, without changing how it moves
  },
  layers: [{ kind: 'osc', wave: 'sine', ratio: 1, detune: 0, level: 1, fade: 1, sustain: 0 }],
  echo: { time: 0.37, feedback: 0.35, wet: 0.25 },
  out: 0.5,
};

export const layerDefaults = {
  osc: { kind: 'osc', wave: 'sine', ratio: 1, detune: 0, glide: 0, glideTime: 0.05, level: 0.5, fade: 1, decay: 0, sustain: 0 },
  noise: { kind: 'noise', hold: false, color: 'white', length: 0.03, curve: 4, ratio: 3, q: 0.8, level: 0.5 },
  sample: { kind: 'sample', src: '', root: 60, follow: true, tune: 0, start: 0, level: 1, fade: 0, decay: 0, sustain: 1, loop: false, reverse: false },
};

// A patch with anything it leaves out filled in from the blank one, so older or hand-written patches still play
export function complete(patch) {
  const filled = { ...structuredClone(blankPatch), ...structuredClone(patch) };
  for (const key of ['ring', 'wobble', 'range', 'echo']) filled[key] = { ...blankPatch[key], ...patch[key] };
  filled.filter = {
    ...blankPatch.filter,
    ...patch.filter,
    start: { ...blankPatch.filter.start, ...patch.filter?.start },
    end: { ...blankPatch.filter.end, ...patch.filter?.end },
    sway: { ...blankPatch.filter.sway, ...patch.filter?.sway },
  };
  filled.layers = (patch.layers ?? blankPatch.layers).map((layer) => ({ ...layerDefaults[layer.kind], ...layer }));
  return filled;
}

// Every sound file a patch's sample layers play (each layer's `src` is one, or a list)
export const sampleSources = (patch) => [
  ...new Set(patch.layers.filter((layer) => layer.kind === 'sample').flatMap((layer) => [].concat(layer.src).filter(Boolean))),
];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
export const frequencyOf = (note) => 440 * Math.pow(2, (note - 69) / 12);

const scales = { chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], major: [0, 2, 4, 5, 7, 9, 11], pentatonic: [0, 2, 4, 7, 9] };
// A note at random from a patch's range (it can be between notes, if its scale is 'any')
export function randomNote(patch) {
  const { low, high, scale, key } = complete(patch).range;
  const [from, to] = [Math.min(low, high), Math.max(low, high)];
  if (!scales[scale]) return from + Math.random() * (to - from);
  const notes = [];
  for (let n = Math.ceil(from); n <= to; n++) if (scales[scale].includes((((n - key) % 12) + 12) % 12)) notes.push(n);
  return notes.length ? notes[Math.floor(Math.random() * notes.length)] : from;
}

// Sound files, fetched and decoded once each (per AudioContext), and kept. Pages can put their own decoded sounds in
// with provideBuffer(), for files that aren't anywhere at a URL yet (like ones dropped on the sandbox).
const buffers = new WeakMap();
function cacheOf(audio) {
  if (!buffers.has(audio)) buffers.set(audio, new Map());
  return buffers.get(audio);
}
export function provideBuffer(audio, src, buffer) {
  cacheOf(audio).set(src, Promise.resolve(buffer));
}
export function loadBuffer(audio, src) {
  const cache = cacheOf(audio);
  if (!cache.has(src)) {
    const loading = fetch(src)
      .then((response) => {
        if (!response.ok) throw new Error(`${src}: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => audio.decodeAudioData(data));
    loading.catch(() => cache.delete(src)); // So it's tried again next time
    cache.set(src, loading);
  }
  return cache.get(src);
}
// Ten seconds of noise, made once per colour (per AudioContext), for noise that holds: white is even all the way up,
// pink is softer up high (like rain or wind), brown softer still (like water, or far-off rumble)
const noises = new WeakMap();
function noiseOf(audio, color) {
  if (!noises.has(audio)) noises.set(audio, new Map());
  const made = noises.get(audio);
  if (!made.has(color)) {
    const length = audio.sampleRate * 10;
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const out = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0, peak = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (color === 'pink') {
        // Paul Kellet's filter
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;
      } else if (color === 'brown') {
        last = (last + 0.02 * white) / 1.02;
        out[i] = last;
      } else out[i] = white;
      peak = Math.max(peak, Math.abs(out[i]));
    }
    for (let i = 0; i < length; i++) out[i] /= peak; // All the same height, whatever the colour
    made.set(color, buffer);
  }
  return made.get(color);
}

const reversed = new WeakMap();
function reverseOf(audio, buffer) {
  if (!reversed.has(buffer)) {
    const copy = audio.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let c = 0; c < buffer.numberOfChannels; c++) copy.getChannelData(c).set(buffer.getChannelData(c).slice().reverse());
    reversed.set(buffer, copy);
  }
  return reversed.get(buffer);
}

// An instrument playing `patch` into `destination` (the speakers if it's left out). Its echo is shared by all its
// notes. setPatch() changes the sound for the notes that start after it.
//
// While `npm run dev` runs, it also listens to the sound sandbox: as a patch with its name is changed there, it
// changes with it, so a page in the sandbox's preview (or any other tab) can be heard changing as the sliders move,
// before it's saved. `{ follow: false }` stops that (the sandbox's own instrument uses it). Built pages leave it out.
export function instrument(audio, patch, destination = audio.destination, { follow = true } = {}) {
  let p = complete(patch);
  const loaded = new Map(); // src -> AudioBuffer, for the samples that have arrived
  if (import.meta.env?.DEV && follow && typeof BroadcastChannel !== 'undefined') {
    const name = p.name;
    new BroadcastChannel('sound-sandbox').onmessage = ({ data }) => {
      if (data?.name !== name) return;
      p = complete(data.patch);
      apply();
    };
  }

  const out = audio.createGain();
  const echo = audio.createDelay(2);
  const feedback = audio.createGain();
  const wet = audio.createGain();
  out.connect(destination);
  out.connect(echo);
  echo.connect(feedback).connect(echo);
  echo.connect(wet).connect(destination);

  function apply() {
    const now = audio.currentTime;
    out.gain.setTargetAtTime(p.out, now, 0.02);
    echo.delayTime.setTargetAtTime(p.echo.time, now, 0.05);
    feedback.gain.setTargetAtTime(Math.min(0.95, p.echo.feedback), now, 0.02);
    wet.gain.setTargetAtTime(p.echo.wet, now, 0.02);
    for (const src of sampleSources(p)) {
      if (loaded.has(src)) continue;
      loadBuffer(audio, src).then(
        (buffer) => loaded.set(src, buffer),
        (error) => console.warn('patch: sample not loaded', error)
      );
    }
  }
  apply();

  // Starts a note, and gives what noteOff() needs to let it go
  function noteOn(note, velocity = 0.8, when = audio.currentTime, { pan = 0 } = {}) {
    const now = Math.max(when, audio.currentTime);
    const stray = p.spread ? (Math.random() * 2 - 1) * p.spread : 0; // In semitones
    const frequency = frequencyOf(note + stray);
    const ring = lerp(p.ring.low, p.ring.high, clamp01((note - 36) / 60));
    const sources = [];

    const voice = audio.createGain();
    voice.gain.setValueAtTime(p.level * velocity, now);
    const tone = audio.createBiquadFilter();
    tone.type = p.filter.type;
    tone.Q.value = p.filter.q;
    const f = p.filter;
    const opened = Math.min(18000, frequency * f.start.ratio + f.start.add + f.start.velocity * velocity);
    const closed = Math.min(18000, Math.max(20, frequency * f.end.ratio + f.end.add));
    tone.frequency.setValueAtTime(Math.max(20, opened), now);
    tone.frequency.setTargetAtTime(closed, now + f.delay, Math.max(0.001, ring * f.time));
    tone.detune.value = f.shift * 100; // (The sway, if any, moves it from there)
    if (f.sway.depth > 0) {
      const swayLfo = audio.createOscillator();
      swayLfo.frequency.value = f.sway.rate;
      const swayDepth = audio.createGain();
      swayDepth.gain.value = f.sway.depth * 100; // Semitones, in cents
      swayLfo.connect(swayDepth).connect(tone.detune);
      swayLfo.start(now);
      sources.push(swayLfo);
    }
    const side = audio.createStereoPanner();
    side.pan.value = Math.max(-1, Math.min(1, pan));
    tone.connect(voice).connect(side).connect(out);

    let wobble = null;
    if (p.wobble.depth > 0) {
      wobble = audio.createGain();
      wobble.gain.value = p.wobble.depth;
      const lfo = audio.createOscillator();
      lfo.frequency.value = p.wobble.rate;
      lfo.connect(wobble);
      lfo.start(now);
      sources.push(lfo);
    }

    // A layer's own volume: in over `attack`, then fading `fade` times sooner than the ring, to its sustain
    function envelope(layer) {
      const gain = audio.createGain();
      const attack = Math.max(0.001, layer.attack ?? p.attack);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(layer.level, now + attack);
      if (layer.decay > 0) gain.gain.setTargetAtTime(layer.level * layer.sustain, now + attack, layer.decay);
      else if (layer.fade > 0) gain.gain.setTargetAtTime(layer.level * layer.sustain, now + attack, ring / layer.fade);
      gain.connect(tone);
      return gain;
    }

    for (const layer of p.layers) {
      if (layer.off || layer.level <= 0) continue; // (`off` mutes a layer but keeps its settings)
      if (layer.kind === 'osc') {
        if (frequency * layer.ratio > 16000) continue;
        const osc = audio.createOscillator();
        osc.type = layer.wave;
        osc.frequency.value = frequency * layer.ratio;
        if (layer.glide) {
          const to = Math.min(20000, frequency * layer.ratio * Math.pow(2, layer.glide / 12));
          osc.frequency.setValueAtTime(frequency * layer.ratio, now);
          osc.frequency.exponentialRampToValueAtTime(to, now + Math.max(0.001, layer.glideTime));
        }
        osc.detune.value = layer.detune;
        if (wobble) wobble.connect(osc.detune);
        osc.connect(envelope(layer));
        osc.start(now);
        sources.push(osc);
      } else if (layer.kind === 'noise' && layer.hold) {
        const hiss = audio.createBufferSource();
        hiss.buffer = noiseOf(audio, layer.color);
        hiss.loop = true;
        const hissTone = audio.createBiquadFilter();
        hissTone.type = 'bandpass';
        hissTone.frequency.value = Math.min(12000, frequency * layer.ratio);
        hissTone.Q.value = layer.q;
        hiss.connect(hissTone).connect(envelope(layer));
        hiss.start(now, Math.random() * 10); // From anywhere in it, so two don't line up
        sources.push(hiss);
      } else if (layer.kind === 'noise') {
        const length = Math.max(1, Math.floor(audio.sampleRate * layer.length));
        const noise = audio.createBuffer(1, length, audio.sampleRate);
        const samples = noise.getChannelData(0);
        for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, layer.curve);
        const thump = audio.createBufferSource();
        thump.buffer = noise;
        const thumpTone = audio.createBiquadFilter();
        thumpTone.type = 'bandpass';
        thumpTone.frequency.value = Math.min(4000, frequency * layer.ratio);
        thumpTone.Q.value = layer.q;
        const thumpLevel = audio.createGain();
        thumpLevel.gain.value = layer.level * velocity;
        thump.connect(thumpTone).connect(thumpLevel).connect(tone);
        thump.start(now);
      } else if (layer.kind === 'sample') {
        const arrived = [].concat(layer.src).filter((src) => loaded.has(src)); // One at random, of the ones that have arrived
        if (!arrived.length) continue; // Still on their way (or missing)
        let buffer = loaded.get(arrived[Math.floor(Math.random() * arrived.length)]);
        if (layer.reverse) buffer = reverseOf(audio, buffer);
        const player = audio.createBufferSource();
        player.buffer = buffer;
        player.playbackRate.value = Math.pow(2, ((layer.follow ? note - layer.root : 0) + layer.tune + stray) / 12);
        if (wobble) wobble.connect(player.detune);
        player.loop = layer.loop;
        player.connect(envelope(layer));
        player.start(now, Math.min(buffer.duration, layer.start));
        sources.push(player);
      }
    }
    return { voice, sources, note, released: false };
  }

  function noteOff(held, when = audio.currentTime) {
    if (!held || held.released) return;
    held.released = true;
    const now = Math.max(when, audio.currentTime);
    held.voice.gain.cancelScheduledValues(now);
    held.voice.gain.setTargetAtTime(0, now, Math.max(0.005, p.release));
    const ends = now + Math.max(0.005, p.release) * 8;
    for (const source of held.sources) {
      try {
        source.stop(ends);
      } catch {} // (A sample that's already finished)
    }
  }

  // A whole note: on now (or at `when`), let go `seconds` later
  function play(note, velocity = 0.8, seconds = 0.3, when = audio.currentTime, options = {}) {
    const held = noteOn(note, velocity, when, options);
    noteOff(held, Math.max(when, audio.currentTime) + seconds);
    return held;
  }

  return {
    play,
    noteOn,
    noteOff,
    setPatch(next) {
      p = complete(next);
      apply();
    },
    // A note at random from the patch's pitch range, to play it on (as the pond's raindrops do)
    randomNote() {
      return randomNote(p);
    },
    get patch() {
      return p;
    },
    // Resolves once every sample in the patch has arrived (or failed)
    ready() {
      return Promise.allSettled(sampleSources(p).map((src) => loadBuffer(audio, src)));
    },
    disconnect() {
      out.disconnect();
      wet.disconnect();
    },
  };
}
