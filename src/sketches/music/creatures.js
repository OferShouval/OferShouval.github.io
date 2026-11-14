// A summer night by the water, over the music and the lapping (see loop.js and lapping.js): a few crickets, each
// chirping in its own rhythm for a while and then resting, and now and then a frog. There are three kinds of frog (see
// frogs): a low throaty croak, a plucked "gunk" like a loose banjo string, and a little rising peep. They're made, not
// recorded, each in its own place, left to right. It goes through the site's sound switch (see sound.js), and starts
// with the music: as the boat comes on, or on the first press.

import { audioOut, onSoundChange } from '../../scripts/sound.js';
import { makeReverb } from './lapping.js';

let level = 0.01; // How loud they are, altogether
let dry = 0.5; // How much of them is heard as they are...
let wet = 0.6; // ...and how much in the reverb, as they're a little way off

// The crickets
let crickets = 3; // How many
let cricketLoud = 0.25; // How loud each one is (before `level`)
let cricketPitch = [4200, 5200]; // Each one's pitch, in Hz (somewhere between these)
let pulses = [2, 4]; // How many quick pulses make up a chirp
let chirpEvery = [0.5, 1.1]; // How many seconds between one cricket's chirps (each keeps its own, steadily)
let bout = [6, 25]; // How many chirps it sings before resting...
let rest = [4, 20]; // ...and for how many seconds it rests

// The frogs
let frogGap = [4, 12]; // How many seconds between one frog calling and the next (somewhere between these)
let croakLoud = 3; // How loud the low croak is (before `level`; it's low and muffled, so it needs more)
let gunkLoud = 1.2; // How loud the "gunk" is
let peepLoud = 0.3; // How loud the peep is

let master = null;
let started = false;

const between = ([low, high]) => low + Math.random() * (high - low);
const whole = (range) => Math.round(between(range));

// A sound into the master, placed at `side` (-1 = left, 1 = right)
function placed(context, side) {
  const pan = context.createStereoPanner();
  pan.pan.value = side;
  pan.connect(master);
  return pan;
}

// One cricket's chirp: a few quick pulses of a high, pure note
function chirp(context, when, cricket) {
  const tone = context.createOscillator();
  tone.frequency.value = cricket.pitch;
  const pulse = context.createGain();
  pulse.gain.value = 0;
  const count = whole(pulses);
  for (let i = 0; i < count; i++) {
    const t = when + i * 0.032;
    pulse.gain.setValueAtTime(0, t);
    pulse.gain.linearRampToValueAtTime(cricketLoud, t + 0.004);
    pulse.gain.linearRampToValueAtTime(0, t + 0.018);
  }
  tone.connect(pulse).connect(cricket.out);
  tone.start(when);
  tone.stop(when + count * 0.032 + 0.02);
}

// A cricket sings a bout of chirps, steadily, then rests, then sings again
function sing(cricket) {
  let left = whole(bout);
  (function next() {
    const out = audioOut();
    if (out) chirp(out.context, out.context.currentTime + 0.05, cricket);
    left -= 1;
    if (left > 0) setTimeout(next, cricket.every * (1 + between([-0.04, 0.04])) * 1000);
    else setTimeout(() => sing(cricket), between(rest) * 1000);
  })();
}

// The frogs' calls. Each calls from `when`, at `side`, and says how long it took.
const frogs = [
  // A low, throaty croak: a buzzy low note, pulsing fast, muffled, falling a little; two or three of them
  (context, when, side) => {
    const count = whole([1, 3]);
    const pitch = between([90, 140]);
    for (let i = 0; i < count; i++) {
      const start = when + i * 0.7;
      const length = between([0.3, 0.5]);
      const tone = context.createOscillator();
      tone.type = 'sawtooth';
      tone.frequency.setValueAtTime(pitch, start);
      tone.frequency.linearRampToValueAtTime(pitch * 0.85, start + length);
      const throat = context.createBiquadFilter(); // Muffled, like it comes from a throat
      throat.type = 'bandpass';
      throat.frequency.value = between([350, 550]);
      throat.Q.value = 3;
      const buzz = context.createGain(); // Pulsing fast, so it rattles
      buzz.gain.value = 0.5;
      const rattle = context.createOscillator();
      rattle.frequency.value = between([18, 28]);
      const rattleDepth = context.createGain();
      rattleDepth.gain.value = 0.5;
      rattle.connect(rattleDepth).connect(buzz.gain);
      const fade = context.createGain();
      fade.gain.setValueAtTime(0, start);
      fade.gain.linearRampToValueAtTime(croakLoud, start + 0.04);
      fade.gain.setValueAtTime(croakLoud, start + length - 0.1);
      fade.gain.linearRampToValueAtTime(0, start + length);
      tone.connect(throat).connect(buzz).connect(fade).connect(placed(context, side));
      for (const oscillator of [tone, rattle]) {
        oscillator.start(start);
        oscillator.stop(start + length + 0.02);
      }
    }
    return count * 0.7;
  },
  // "Gunk": a low note plucked like a loose banjo string, once or twice
  (context, when, side) => {
    const count = whole([1, 2]);
    const pitch = between([180, 260]);
    for (let i = 0; i < count; i++) {
      const start = when + i * between([0.25, 0.4]);
      const tone = context.createOscillator();
      tone.type = 'triangle';
      tone.frequency.setValueAtTime(pitch * 1.08, start);
      tone.frequency.exponentialRampToValueAtTime(pitch, start + 0.05);
      const fade = context.createGain();
      fade.gain.setValueAtTime(0, start);
      fade.gain.linearRampToValueAtTime(gunkLoud, start + 0.005);
      fade.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      tone.connect(fade).connect(placed(context, side));
      tone.start(start);
      tone.stop(start + 0.27);
    }
    return count * 0.4;
  },
  // A little rising peep, a few times about a second apart
  (context, when, side) => {
    const count = whole([3, 7]);
    const pitch = between([2500, 2900]);
    for (let i = 0; i < count; i++) {
      const start = when + i * between([0.9, 1.2]);
      const tone = context.createOscillator();
      tone.frequency.setValueAtTime(pitch, start);
      tone.frequency.exponentialRampToValueAtTime(pitch * 1.15, start + 0.12);
      const fade = context.createGain();
      fade.gain.setValueAtTime(0, start);
      fade.gain.linearRampToValueAtTime(peepLoud, start + 0.02);
      fade.gain.setValueAtTime(peepLoud, start + 0.09);
      fade.gain.linearRampToValueAtTime(0, start + 0.12);
      tone.connect(fade).connect(placed(context, side));
      tone.start(start);
      tone.stop(start + 0.14);
    }
    return count * 1.2;
  },
];
const frogSides = [between([-0.8, -0.3]), between([0.3, 0.8]), between([-0.3, 0.3])]; // Where each frog is

function nextFrog() {
  const out = audioOut();
  if (out) {
    const which = Math.floor(Math.random() * frogs.length);
    frogs[which](out.context, out.context.currentTime + 0.05, frogSides[which]);
  }
  setTimeout(nextFrog, between(frogGap) * 1000);
}

function start() {
  const out = audioOut();
  if (started || !out) return;
  started = true;
  const context = out.context;
  master = context.createGain();
  master.gain.value = level;
  const dryLevel = context.createGain();
  dryLevel.gain.value = dry;
  const wetLevel = context.createGain();
  wetLevel.gain.value = wet;
  master.connect(dryLevel).connect(out);
  master.connect(makeReverb(context, 2.5)).connect(wetLevel).connect(out);
  for (let i = 0; i < crickets; i++) {
    // Each in its own place across the screen, with its own pitch and pace, starting at its own time
    const side = crickets > 1 ? -0.8 + (1.6 * i) / (crickets - 1) + between([-0.15, 0.15]) : 0;
    const cricket = { pitch: between(cricketPitch), every: between(chirpEvery), out: placed(context, side) };
    setTimeout(() => sing(cricket), between([0, 6]) * 1000);
  }
  setTimeout(nextFrog, between(frogGap) * 1000);
}

window.addEventListener('boatentered', start);
for (const type of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(type, () => setTimeout(start, 50));
onSoundChange((on) => on && setTimeout(start, 50));
