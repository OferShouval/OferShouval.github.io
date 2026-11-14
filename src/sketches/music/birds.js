// Birds chirping, now and then, a little way off across the water, over the music and the lapping (see loop.js and
// lapping.js). They're made, not recorded: each chirp's a whistle that swoops in pitch, with a fast flutter in it.
// There are three kinds of bird (see songs), each somewhere different, left to right. It goes through the site's sound
// switch (see sound.js), and starts with the music: as the boat comes on, or on the first press.

import { audioOut, onSoundChange } from '../../scripts/sound.js';
import { makeReverb } from './lapping.js';

let level = 0.008; // How loud they are, altogether
let gap = [5, 14]; // How many seconds between one bird singing and the next (somewhere between these)
let again = 0.35; // How often a bird sings its song twice (0 = never, 1 = always)
let dry = 0.6; // How much of them is heard as they are...
let wet = 0.5; // ...and how much in the reverb, as they're a little way off

let master = null;
let started = false;

const between = ([low, high]) => low + Math.random() * (high - low);

// One chirp: a whistle sliding from one pitch to another over `length` seconds, with a flutter
function chirp(context, when, from, to, length, side) {
  const tone = context.createOscillator();
  tone.frequency.setValueAtTime(from, when);
  tone.frequency.exponentialRampToValueAtTime(to, when + length);
  const flutter = context.createOscillator();
  flutter.frequency.value = between([30, 60]);
  const flutterDepth = context.createGain();
  flutterDepth.gain.value = from * 0.03;
  flutter.connect(flutterDepth).connect(tone.frequency);
  const fade = context.createGain();
  fade.gain.setValueAtTime(0, when);
  fade.gain.linearRampToValueAtTime(1, when + Math.min(0.01, length / 4));
  fade.gain.setValueAtTime(1, when + length * 0.6);
  fade.gain.linearRampToValueAtTime(0, when + length);
  const pan = context.createStereoPanner();
  pan.pan.value = side;
  tone.connect(fade).connect(pan).connect(master);
  for (const oscillator of [tone, flutter]) {
    oscillator.start(when);
    oscillator.stop(when + length + 0.02);
  }
}

// The three birds' songs. Each sings from `when`, at `side` (-1 = left, 1 = right), and says how long it took.
const songs = [
  // Quick tweets, rising
  (context, when, side) => {
    const count = Math.round(between([2, 5]));
    const pitch = between([2800, 3600]);
    for (let i = 0; i < count; i++) chirp(context, when + i * 0.14, pitch, pitch * 1.6, 0.06, side);
    return count * 0.14;
  },
  // A two-note whistle: a long slide down, then a short one up
  (context, when, side) => {
    const pitch = between([3800, 4800]);
    chirp(context, when, pitch, pitch * 0.62, 0.28, side);
    chirp(context, when + 0.38, pitch * 0.7, pitch * 0.8, 0.16, side);
    return 0.6;
  },
  // A fast trill
  (context, when, side) => {
    const count = Math.round(between([8, 14]));
    const pitch = between([4000, 4600]);
    for (let i = 0; i < count; i++) chirp(context, when + i * 0.06, pitch, pitch * 1.12, 0.025, side);
    return count * 0.06;
  },
];
const sides = [between([-0.8, -0.3]), between([0.3, 0.8]), between([-0.3, 0.3])]; // Where each bird is

function next() {
  const out = audioOut();
  if (out) {
    const context = out.context;
    const which = Math.floor(Math.random() * songs.length);
    const when = context.currentTime + 0.05;
    const took = songs[which](context, when, sides[which]);
    if (Math.random() < again) songs[which](context, when + took + between([0.3, 0.8]), sides[which]);
  }
  setTimeout(next, between(gap) * 1000);
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
  setTimeout(next, between(gap) * 1000);
}

window.addEventListener('boatentered', start);
for (const type of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(type, () => setTimeout(start, 50));
onSoundChange((on) => on && setTimeout(start, 50));
