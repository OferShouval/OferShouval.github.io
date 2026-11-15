// Every setting a soundscape's tracks have: what it's called, how far it goes, what it starts at, and a line on what
// it does. The engine (engine.js) reads them for what's left out of a saved track, and the sound studio
// (tools/sound-studio) makes its knobs from them.
//
// A setting's name says where it lives in a track: 'synth.cutoff' is track.synth.cutoff. The ones marked `live` change
// a note that's already sounding; the rest are heard from the next note on.
//
// A knob's `curve` says how its travel maps to its value: 'exp' doubles every so often (right for pitch, time and
// frequency), a number bends it (2 = finer at the bottom), and nothing is a straight line.

const knob = (label, min, max, def, more = {}) => ({ kind: 'knob', label, min, max, def, ...more });
const choice = (label, options, def, more = {}) => ({ kind: 'choice', label, options, def, ...more });
const toggle = (label, def, more = {}) => ({ kind: 'toggle', label, def, ...more });

export const waves = ['sine', 'triangle', 'sawtooth', 'square'];
export const keys = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const scales = {
  pentatonic: [0, 2, 4, 7, 9],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

const envelope = (prefix, what, a, d, s, r) => ({
  [`synth.${prefix}A`]: knob('attack', 0.001, 8, a, { curve: 'exp', unit: 's', tip: `How long ${what} takes to come in` }),
  [`synth.${prefix}D`]: knob('decay', 0.005, 8, d, { curve: 'exp', unit: 's', tip: `How long ${what} takes to fall from its peak to its sustain` }),
  [`synth.${prefix}S`]: knob('sustain', 0, 1, s, { unit: '%', tip: `Where ${what} stays while the note's held (0 = it dies away by itself)` }),
  [`synth.${prefix}R`]: knob('release', 0.005, 12, r, { curve: 'exp', unit: 's', tip: `How long ${what} takes to die away once the note's let go` }),
});

const oscillator = (n) => ({
  [`synth.wave${n}`]: choice('wave', waves, 'sawtooth', { tip: 'Its wave: sine is pure, triangle soft, saw bright, square hollow' }),
  [`synth.oct${n}`]: knob('octave', -3, 3, 0, { step: 1, unit: 'oct', tip: 'Up or down by octaves' }),
  [`synth.pitch${n}`]: knob('pitch', -12, 12, 0, { unit: 'st', live: true, tip: 'Up or down by semitones (hold shift for fine tuning)' }),
  [`synth.shape${n}`]: knob('shape', 0, 1, 0, { unit: '%', live: true, tip: "Bends the wave: folds a sine, triangle or saw over on itself (brighter, buzzier), and narrows a square's pulse" }),
});

export const params = {
  // The track's place in the mix
  'mix.volume': knob('volume', 0, 1.5, 0.8, { curve: 2, unit: 'dB', live: true, tip: 'How loud the track is' }),
  'mix.pan': knob('pan', -1, 1, 0, { unit: 'pan', live: true, tip: 'Left or right. Sounds that come with a place of their own (like raindrops) move round this.' }),
  'mix.space': knob('space', 0, 1, 0.15, { unit: '%', live: true, tip: 'How much of it is sent into the room (the reverb all the tracks share)' }),

  // Which notes it plays
  'notes.mode': choice('plays', ['one note', 'a scale'], 'one note', { tip: 'The same note every time, or a note at random from a scale' }),
  'notes.note': knob('note', 24, 108, 60, { step: 1, unit: 'note', tip: 'The note it plays (60 is middle C)' }),
  'notes.low': knob('lowest', 24, 108, 62, { step: 1, unit: 'note', tip: 'The lowest note it picks' }),
  'notes.high': knob('highest', 24, 108, 86, { step: 1, unit: 'note', tip: 'The highest note it picks' }),
  'notes.scale': choice('scale', Object.keys(scales), 'pentatonic', { tip: 'The scale its notes are picked from' }),
  'notes.key': choice('key', keys, 'D', { tip: "The scale's key" }),
  'notes.transpose': knob('pitch', -24, 24, 0, { unit: 'st', live: true, tip: 'The whole sound, higher or lower, in semitones (hold shift for fine tuning)' }),
  'notes.spread': knob('stray', 0, 12, 0, { curve: 2, unit: 'st', tip: 'How far each note strays in pitch, at random, so no two are quite alike' }),
  'notes.length': knob('length', 0.02, 10, 0.25, { curve: 'exp', unit: 's', tip: "How long a note is held when an event plays it (after that it's let go, and its release takes over)" }),

  // The synth: two oscillators and noise, mixed, through a filter, shaped by two envelopes and an LFO
  ...oscillator(1),
  ...oscillator(2),
  'synth.mix1': knob('osc 1', 0, 1, 0.8, { unit: '%', live: true, tip: 'How much of oscillator 1' }),
  'synth.mix2': knob('osc 2', 0, 1, 0, { unit: '%', live: true, tip: 'How much of oscillator 2' }),
  'synth.noise': knob('noise', 0, 1, 0, { unit: '%', curve: 2, live: true, tip: 'How much noise: hiss, breath, wind, rain' }),
  'synth.cutoff': knob('cutoff', 20, 20000, 4000, { curve: 'exp', unit: 'Hz', live: true, tip: "The filter: everything above this is taken away. Lower is darker and softer." }),
  'synth.reso': knob('resonance', 0, 1, 0.1, { unit: '%', live: true, tip: 'A ringing peak right at the cutoff: more makes it whistle and sing' }),
  'synth.egInt': knob('env amount', -1, 1, 0.3, { unit: '±%', tip: 'How far the filter envelope opens the filter as each note starts (below zero, it closes it instead)' }),
  'synth.keyTrack': knob('key track', 0, 1, 0.5, { unit: '%', tip: 'How much the filter opens for higher notes, so they stay as bright as the low ones' }),
  'synth.slope': choice('slope', ['gentle', 'steep'], 'steep', { tip: 'How sharply the filter cuts: gentle (12 dB an octave) or steep (24 dB)' }),
  ...envelope('amp', 'the volume', 0.005, 0.4, 0.6, 0.5),
  ...envelope('eg', 'the envelope', 0.005, 0.3, 0, 0.3),
  'synth.egPitch': knob('to pitch', -48, 48, 0, { unit: 'st', tip: 'How far the envelope bends the pitch: up for a drip or a chirp, down (below zero) for a thump or a zap' }),
  'synth.lfoWave': choice('wave', ['triangle', 'sawtooth', 'square', 'random'], 'triangle', { tip: 'How the LFO moves: smoothly up and down, ramping, jumping between two places, or at random' }),
  'synth.lfoRate': knob('rate', 0.02, 40, 2, { curve: 'exp', unit: 'Hz', live: true, tip: 'How fast the LFO moves' }),
  'synth.lfoInt': knob('amount', 0, 1, 0, { unit: '%', curve: 1.5, live: true, tip: 'How far the LFO moves what it moves' }),
  'synth.lfoTo': choice('moves', ['pitch', 'shape', 'cutoff', 'volume'], 'cutoff', { tip: 'What the LFO moves' }),

  // The sampler
  'sampler.pick': choice('picks', ['at random', 'in turn'], 'at random', { tip: 'With more than one sound in it, how it picks which to play' }),
  'sampler.follow': toggle('follows notes', false, { tip: 'Whether its pitch follows the notes it plays (for playing it like an instrument). Off, it plays as recorded.' }),
  'sampler.reverse': toggle('reverse', false, { tip: 'Played backwards' }),
  'sampler.loop': toggle('loop', false, { tip: "Goes round and round until it's let go" }),
  'sampler.stretch': knob('stretch', 0.25, 4, 1, { curve: 'exp', unit: '×', lazy: true, tip: 'Longer or shorter without changing its pitch (2× is twice as long)' }),
  'sampler.blend': knob('loop blend', 0, 3, 0.05, { curve: 2, unit: 's', lazy: true, tip: 'Looped, how long its end blends into its start, so the join can’t be heard' }),
  'sampler.fadeIn': knob('fade in', 0, 6, 0, { curve: 2.5, unit: 's', tip: 'How long it takes to come in' }),
  'sampler.fadeOut': knob('fade out', 0, 10, 0.05, { curve: 2.5, unit: 's', tip: "How long it takes to die away, at its end or once it's let go" }),

  // The effects each track has of its own, in the order the sound goes through them
  'fx.lowcut': knob('low cut', 20, 8000, 20, { curve: 'exp', unit: 'Hz', live: true, tip: 'Takes away everything below this: rumble, weight, body' }),
  'fx.highcut': knob('high cut', 200, 20000, 20000, { curve: 'exp', unit: 'Hz', live: true, tip: 'Takes away everything above this: duller, further off, underwater' }),
  'fx.drive': knob('drive', 0, 1, 0, { unit: '%', live: true, tip: 'Distortion: warm at first, then gritty, then torn' }),
  'fx.crush': knob('crush', 0, 1, 0, { unit: 'bits', live: true, tip: 'Bit-crush: fewer and fewer bits, like an old sampler or a game console' }),
  'fx.downsample': knob('downsample', 0, 1, 0, { unit: '÷', curve: 2, live: true, tip: 'A lower and lower sample rate: metallic, ringing, broken' }),
  'fx.echoTime': knob('echo time', 0.02, 2, 0.3, { curve: 'exp', unit: 's', live: true, tip: 'How long between echoes' }),
  'fx.echoFeedback': knob('repeats', 0, 0.92, 0.35, { unit: '%', live: true, tip: 'How many times it echoes before it dies away' }),
  'fx.echoMix': knob('echo', 0, 1, 0, { unit: '%', live: true, tip: 'How loud the echoes are' }),

  // What all the tracks share
  'room.size': knob('room size', 0.3, 8, 2.2, { curve: 'exp', unit: 's', lazy: true, tip: 'How long the room rings: a small room, a hall, a cave' }),
  'room.tone': knob('room tone', 500, 16000, 6000, { curve: 'exp', unit: 'Hz', live: true, tip: 'How bright the room is' }),
  'master.volume': knob('master', 0, 1.5, 0.9, { curve: 2, unit: 'dB', live: true, tip: 'Everything, louder or quieter' }),
};
for (const [id, param] of Object.entries(params)) param.id = id;

const clamp01 = (t) => Math.min(1, Math.max(0, t));

// Where a knob is in its travel (0 to 1) for a value, and back
export function positionOf(param, value) {
  const { min, max, curve } = param;
  if (curve === 'exp') return clamp01(Math.log(Math.max(value, min) / min) / Math.log(max / min));
  const t = clamp01((value - min) / (max - min));
  return typeof curve === 'number' ? Math.pow(t, 1 / curve) : t;
}
export function valueOf(param, position) {
  const { min, max, curve, step } = param;
  const t = clamp01(position);
  let value = curve === 'exp' ? min * Math.pow(max / min, t) : min + (max - min) * (typeof curve === 'number' ? Math.pow(t, curve) : t);
  if (step) value = Math.round(value / step) * step;
  return Math.min(max, Math.max(min, value));
}
// Part of the way from one value to another, along the knob's own curve (so a glide in pitch or brightness sounds even)
export function between(param, from, to, t) {
  if (param.curve === 'exp' && from > 0 && to > 0) return from * Math.pow(to / from, t);
  return from + (to - from) * t;
}

export const noteName = (note) => keys[((Math.round(note) % 12) + 12) % 12] + (Math.floor(Math.round(note) / 12) - 1);
export const frequencyOf = (note) => 440 * Math.pow(2, (note - 69) / 12);
// How many bits the crusher leaves, and how many samples it holds each one for
export const crushBits = (crush) => 16 - 14.5 * Math.pow(clamp01(crush), 0.6);
export const crushHold = (downsample) => 1 + 59 * clamp01(downsample);

// A value as it's shown beside its knob
export function format(param, value) {
  switch (param.unit) {
    case 'dB':
      return value < 0.002 ? '−∞ dB' : `${(20 * Math.log10(value)).toFixed(1).replace('-', '−')} dB`;
    case 'Hz':
      return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} kHz` : value >= 100 ? `${Math.round(value)} Hz` : `${value.toFixed(value >= 10 ? 1 : 2)} Hz`;
    case 's':
      return value < 1 ? `${Math.round(value * 1000)} ms` : `${value.toFixed(value < 10 ? 2 : 1)} s`;
    case 'st': {
      const fixed = Math.abs(value) < 10 ? value.toFixed(2) : value.toFixed(1);
      return `${value > 0 ? '+' : ''}${fixed.replace('-', '−').replace(/\.?0+$/, '')} st`;
    }
    case 'oct':
      return value === 0 ? '0' : `${value > 0 ? '+' : '−'}${Math.abs(value)}`;
    case '%':
      return `${Math.round(value * 100)}%`;
    case '±%':
      return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value * 100))}%`;
    case '×':
      return `${value.toFixed(2)}×`;
    case 'pan':
      return Math.abs(value) < 0.01 ? 'centre' : `${Math.round(Math.abs(value) * 100)}% ${value < 0 ? 'left' : 'right'}`;
    case 'note':
      return noteName(value);
    case 'bits':
      return value < 0.005 ? 'off' : `${crushBits(value).toFixed(1)} bits`;
    case '÷':
      return value < 0.005 ? 'off' : `÷${crushHold(value).toFixed(1)}`;
    default:
      return String(Math.round(value * 100) / 100);
  }
}

// A typed value, read back the way it's shown: '-6 dB', '1.2k', '350ms', 'C4', '40%'
export function parse(param, text) {
  const cleaned = text.trim().toLowerCase().replace('−', '-');
  if (param.unit === 'note') {
    const named = cleaned.match(/^([a-g])([#♯b♭]?)(-?\d)$/);
    if (named) {
      const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[named[1]];
      const bend = named[2] === '#' || named[2] === '♯' ? 1 : named[2] ? -1 : 0;
      return base + bend + (Number(named[3]) + 1) * 12;
    }
  }
  let number = parseFloat(cleaned);
  if (Number.isNaN(number)) return null;
  if (param.unit === 'dB') return cleaned.includes('inf') ? 0 : Math.pow(10, number / 20);
  if (param.unit === 'Hz' && /k/.test(cleaned)) number *= 1000;
  if (param.unit === 's' && /ms/.test(cleaned)) number /= 1000;
  if (param.unit === '%' || param.unit === '±%') number /= 100;
  if (param.unit === 'pan') number = (number / 100) * (/l/.test(cleaned) ? -1 : 1);
  if (param.unit === 'bits' || param.unit === '÷') number = cleaned === 'off' ? 0 : number / 100;
  return number;
}

// A track's setting: what's saved in it, or what the setting starts at if it's left out
export function valueAt(track, path) {
  const dot = path.indexOf('.');
  const value = track?.[path.slice(0, dot)]?.[path.slice(dot + 1)];
  return value !== undefined ? value : params[path]?.def;
}

// The settings something else can change while the page plays (see links in engine.js): the knobs, but not the ones
// that take a moment to work out
export const linkable = (kind) =>
  Object.values(params).filter((param) => {
    const group = param.id.split('.')[0];
    return param.kind === 'knob' && !param.lazy && !param.step && (group === kind || ['mix', 'notes', 'fx'].includes(group));
  });
