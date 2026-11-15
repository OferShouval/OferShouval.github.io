// Sounds to start from, in the sound studio. A preset is part of a track: its synth or sampler settings, its effects,
// and anything about its notes and its place in the room that makes the sound what it is. Loading one leaves the
// track's name, volume, pan and triggers alone (and a sampler's sound files). Presets Ofer saves himself go in
// src/sounds/presets (see dev-server.js) and are listed after these.
//
// starter(): a first soundscape for a section that has none yet, to show how the pieces fit, made of these and of
// Ofer's own sounds in public/sounds.

import { blankSoundscape, newTrack, newId } from '../../src/scripts/soundscape/engine.js';

export const presets = [
  // --- Synth ---
  { kind: 'synth', name: 'plain', about: 'One sawtooth, wide open: a blank page', synth: {}, fx: {}, notes: {}, mix: {} },
  {
    kind: 'synth',
    name: 'drip',
    about: 'A drop of water: a sine that chirps upward as it lands',
    synth: { wave1: 'sine', mix1: 1, mix2: 0, noise: 0.02, cutoff: 9000, reso: 0.05, egInt: 0, ampA: 0.002, ampD: 0.09, ampS: 0, ampR: 0.08, egA: 0.045, egD: 0.05, egS: 1, egR: 0.05, egPitch: 14 },
    notes: { mode: 'a scale', low: 72, high: 96, scale: 'pentatonic', key: 'D', spread: 0.6, length: 0.05 },
    fx: { echoMix: 0.12, echoTime: 0.19, echoFeedback: 0.3 },
    mix: { space: 0.35 },
  },
  {
    kind: 'synth',
    name: 'bubble',
    about: 'Lower and rounder than the drip, rising further',
    synth: { wave1: 'sine', mix1: 1, mix2: 0, cutoff: 6000, reso: 0, egInt: 0, ampA: 0.01, ampD: 0.2, ampS: 0, ampR: 0.12, egA: 0.13, egD: 0.05, egS: 1, egR: 0.05, egPitch: 24 },
    notes: { mode: 'a scale', low: 52, high: 70, scale: 'pentatonic', key: 'D', spread: 2, length: 0.12 },
    fx: {},
    mix: { space: 0.25 },
  },
  {
    kind: 'synth',
    name: 'glass bell',
    about: 'A struck bell, ringing a long time',
    synth: { wave1: 'triangle', wave2: 'sine', oct2: 1, pitch2: 7.02, mix1: 0.7, mix2: 0.45, cutoff: 5000, reso: 0, egInt: 0.25, keyTrack: 0.8, ampA: 0.002, ampD: 2.2, ampS: 0, ampR: 2, egA: 0.001, egD: 0.6, egS: 0, egR: 0.6 },
    notes: { mode: 'a scale', low: 67, high: 91, scale: 'pentatonic', key: 'D', length: 0.3 },
    fx: { echoMix: 0.2, echoTime: 0.38, echoFeedback: 0.4 },
    mix: { space: 0.45 },
  },
  {
    kind: 'synth',
    name: 'pluck',
    about: 'A plucked string: bright as it starts, closing quickly',
    synth: { wave1: 'sawtooth', wave2: 'sawtooth', pitch2: 0.06, mix1: 0.6, mix2: 0.5, cutoff: 500, reso: 0.2, egInt: 0.55, keyTrack: 0.7, ampA: 0.002, ampD: 0.7, ampS: 0, ampR: 0.5, egA: 0.001, egD: 0.22, egS: 0, egR: 0.3 },
    notes: { mode: 'a scale', low: 50, high: 74, scale: 'pentatonic', key: 'D', length: 0.2 },
    fx: { echoMix: 0.22, echoTime: 0.3, echoFeedback: 0.35 },
    mix: { space: 0.3 },
  },
  {
    kind: 'synth',
    name: 'soft pad',
    about: 'Two slow sawtooths, a little apart, breathing: a background to hold',
    synth: { wave1: 'sawtooth', wave2: 'sawtooth', pitch2: 0.08, mix1: 0.6, mix2: 0.6, cutoff: 700, reso: 0.12, egInt: 0.15, keyTrack: 0.6, ampA: 1.8, ampD: 2, ampS: 0.8, ampR: 3.5, egA: 2.5, egD: 3, egS: 0.5, egR: 3, lfoWave: 'triangle', lfoRate: 0.12, lfoInt: 0.22, lfoTo: 'cutoff' },
    notes: { mode: 'one note', note: 50, length: 4 },
    fx: {},
    mix: { space: 0.5 },
  },
  {
    kind: 'synth',
    name: 'shimmer',
    about: "A hollow pad whose pulse keeps changing width, so it's never still",
    synth: { wave1: 'square', shape1: 0.4, wave2: 'triangle', oct2: 1, mix1: 0.5, mix2: 0.4, cutoff: 3200, reso: 0.1, egInt: 0.1, ampA: 0.9, ampD: 1.5, ampS: 0.7, ampR: 2.5, lfoWave: 'triangle', lfoRate: 0.45, lfoInt: 0.45, lfoTo: 'shape' },
    notes: { mode: 'one note', note: 57, length: 3 },
    fx: {},
    mix: { space: 0.5 },
  },
  {
    kind: 'synth',
    name: 'dark drone',
    about: 'Low, slow and heavy, opening and closing over many seconds',
    synth: { wave1: 'sawtooth', oct1: -1, wave2: 'square', oct2: -2, shape2: 0.35, pitch2: -0.06, mix1: 0.5, mix2: 0.55, noise: 0.06, cutoff: 180, reso: 0.3, egInt: 0, keyTrack: 0, ampA: 3, ampD: 2, ampS: 1, ampR: 5, lfoWave: 'triangle', lfoRate: 0.06, lfoInt: 0.3, lfoTo: 'cutoff' },
    notes: { mode: 'one note', note: 50, length: 6 },
    fx: {},
    mix: { space: 0.4 },
  },
  {
    kind: 'synth',
    name: 'wind',
    about: 'Noise through a whistling filter that wanders',
    synth: { mix1: 0, mix2: 0, noise: 1, cutoff: 600, reso: 0.5, egInt: 0, keyTrack: 0, ampA: 2.5, ampD: 1, ampS: 1, ampR: 3, lfoWave: 'triangle', lfoRate: 0.13, lfoInt: 0.35, lfoTo: 'cutoff' },
    notes: { mode: 'one note', note: 60, length: 5 },
    fx: {},
    mix: { space: 0.3 },
  },
  {
    kind: 'synth',
    name: 'whoosh',
    about: 'A rush of noise that opens as it rises: for something setting off',
    synth: { mix1: 0, mix2: 0, noise: 1, cutoff: 250, reso: 0.55, egInt: 0.75, keyTrack: 0, ampA: 2.2, ampD: 1, ampS: 0.9, ampR: 1.6, egA: 3, egD: 1, egS: 0.8, egR: 1.5 },
    notes: { mode: 'one note', note: 60, length: 3 },
    fx: {},
    mix: { space: 0.4 },
  },
  {
    kind: 'synth',
    name: 'thump',
    about: 'A deep knock: a sine dropping fast',
    synth: { wave1: 'sine', oct1: -2, mix1: 1, mix2: 0, cutoff: 800, reso: 0, egInt: 0.1, ampA: 0.002, ampD: 0.4, ampS: 0, ampR: 0.3, egA: 0.001, egD: 0.07, egS: 0, egR: 0.1, egPitch: 24 },
    notes: { mode: 'one note', note: 60, length: 0.2 },
    fx: { drive: 0.15 },
    mix: { space: 0.1 },
  },
  {
    kind: 'synth',
    name: 'zap',
    about: 'A falling squeal, like a spark',
    synth: { wave1: 'sawtooth', wave2: 'square', oct2: 1, mix1: 0.6, mix2: 0.4, cutoff: 3000, reso: 0.5, egInt: 0.5, ampA: 0.002, ampD: 0.25, ampS: 0, ampR: 0.2, egA: 0.001, egD: 0.18, egS: 0, egR: 0.2, egPitch: 36 },
    notes: { mode: 'one note', note: 60, spread: 3, length: 0.15 },
    fx: { echoMix: 0.25, echoTime: 0.16, echoFeedback: 0.45 },
    mix: { space: 0.25 },
  },

  // --- Sampler (they change how the sound files in it are played, not which they are) ---
  { kind: 'sampler', name: 'as it is', about: 'The sound as recorded', sampler: {}, fx: {}, notes: {}, mix: {} },
  { kind: 'sampler', name: 'far away', about: 'Dulled and thinned, in a big room', sampler: {}, fx: { lowcut: 150, highcut: 1800 }, notes: {}, mix: { space: 0.7 } },
  { kind: 'sampler', name: 'underwater', about: 'Muffled, a little lower, with a close slapping echo', sampler: {}, fx: { highcut: 650, echoMix: 0.25, echoTime: 0.12, echoFeedback: 0.5 }, notes: { transpose: -3 }, mix: { space: 0.4 } },
  { kind: 'sampler', name: 'backwards swell', about: 'Reversed, so it swells up to where it began', sampler: { reverse: true, fadeIn: 0.4, fadeOut: 0.02 }, fx: {}, notes: {}, mix: { space: 0.4 } },
  { kind: 'sampler', name: 'slow and deep', about: 'Twice as long and an octave down', sampler: { stretch: 2 }, fx: { highcut: 5000 }, notes: { transpose: -12 }, mix: { space: 0.5 } },
  { kind: 'sampler', name: 'old tape', about: 'Worn: driven, narrow, each one a little off pitch', sampler: {}, fx: { drive: 0.3, lowcut: 180, highcut: 4500, downsample: 0.08 }, notes: { spread: 0.25 }, mix: {} },
  { kind: 'sampler', name: 'eight bits', about: 'Crushed, like an old game console', sampler: {}, fx: { crush: 0.75, downsample: 0.3 }, notes: {}, mix: {} },
  { kind: 'sampler', name: 'cavern', about: 'Long echoes in a big room', sampler: {}, fx: { echoMix: 0.5, echoTime: 0.45, echoFeedback: 0.6 }, notes: {}, mix: { space: 0.6 } },
  { kind: 'sampler', name: 'endless loop', about: 'Looped with a blended join, fading in and out slowly: a background to hold', sampler: { loop: true, blend: 0.5, fadeIn: 1.5, fadeOut: 3 }, fx: {}, notes: {}, mix: { space: 0.3 } },
];

// Puts a preset into a track (the track's own name, mix and triggers stay, and a sampler's sound files)
export function loadPreset(track, preset) {
  const copy = structuredClone(preset);
  if (track.kind === 'sampler') track.sampler = { ...copy.sampler, samples: track.sampler?.samples ?? [] };
  else track.synth = copy.synth ?? {};
  track.fx = copy.fx ?? {};
  track.notes = { ...copy.notes };
  track.mix = { ...track.mix, space: copy.mix?.space ?? track.mix?.space };
  if (track.mix.space === undefined) delete track.mix.space;
  track.preset = preset.name;
  return track;
}

// A track's sound, as a preset of that name
export function presetOf(track, name) {
  const { samples, ...sampler } = track.sampler ?? {};
  return structuredClone({
    kind: track.kind,
    name,
    ...(track.kind === 'sampler' ? { sampler } : { synth: track.synth ?? {} }),
    fx: track.fx ?? {},
    notes: track.notes ?? {},
    mix: { space: track.mix?.space },
  });
}

const named = (kind, name) => presets.find((preset) => preset.kind === kind && preset.name === name);

// A first soundscape for a section, from what's in public/sounds (`sounds`: their addresses)
export function starter(section, sounds) {
  const soundscape = blankSoundscape(section);
  if (section !== 'landing') return soundscape;
  const have = (src) => sounds.includes(src);
  const drips = sounds.filter((src) => /\/sounds\/landing\/drip\d+\./.test(src));

  const track = (kind, name, colour, more) => {
    const made = Object.assign(newTrack(kind, name), { colour });
    more(made);
    soundscape.tracks.push(made);
    return made;
  };
  let rain = null;
  if (drips.length) {
    rain = track('sampler', 'rain', 0, (t) => {
      t.sampler.samples = drips.map((src) => ({ src, start: 0, end: 1 }));
      t.triggers = [{ on: 'drop', does: 'play' }];
      t.notes = { spread: 0.8 };
      t.mix = { volume: 0.8, space: 0.3 };
    });
  }
  track('synth', 'plink', 1, (t) => {
    loadPreset(t, named('synth', 'drip'));
    t.triggers = [{ on: 'drop-near', does: 'play', chance: 0.6 }];
    t.mix = { ...t.mix, volume: 0.4 };
  });
  const pad = track('synth', 'water pad', 4, (t) => {
    loadPreset(t, named('synth', 'soft pad'));
    t.triggers = [{ on: 'open', does: 'start' }];
    t.mix = { ...t.mix, volume: 0.35 };
  });
  if (have('/sounds/landing/worm-suck.m4a')) {
    track('sampler', 'going in', 5, (t) => {
      t.sampler = { samples: [{ src: '/sounds/landing/worm-suck.m4a', start: 0, end: 1 }], fadeOut: 2 };
      t.triggers = [{ on: 'enter', does: 'play' }];
      t.mix = { volume: 0.7, space: 0.25 };
    });
  }
  // Entering changes the sounds that are already playing: the rain echoes more and sinks, and the pad opens up
  const link = (more) => soundscape.links.push({ id: newId('l'), kind: 'set', on: 'enter', ...more });
  if (rain) {
    link({ track: rain.id, param: 'fx.echoMix', to: 0.55, over: 3 });
    link({ track: rain.id, param: 'notes.transpose', to: -7, over: 4 });
  }
  link({ track: pad.id, param: 'synth.cutoff', to: 3500, over: 5 });
  soundscape.starter = true; // (Until it's changed: see studio.js)
  return soundscape;
}
