// Quiet water lapping at the boat, under the music (see loop.js). It's made, not recorded: soft noise, filtered to the
// low splashy middle of the range, swelling up and away every few seconds, like a small wave against the hull,
// each one a little different and a little to one side, and washed out in a long, dark reverb (see makeReverb()).
// Above them, now and then, a little babbling splash: a handful of tiny bubbles (see splash()). It goes through the
// site's sound switch (see sound.js), and starts with the music: as the boat comes on, or on the first press.

import { audioOut, onSoundChange } from '../../scripts/sound.js';

let on = false; // Are the waves playing? (Off: a recording of a pond at dusk plays instead, see pond.js. Its bubbles and reverb are still used.)
let level = 0.28; // How loud it is, altogether (1 = as loud as the noise it's made from; matched to the music through its radio, see loop.js)
let gapLeast = 3; // The shortest time between laps, in seconds...
let gapMost = 7; // ...and the longest
let swellTime = [0.6, 1.3]; // How many seconds a lap takes to swell up (somewhere between these)...
let fallTime = [1.5, 3]; // ...and to fall away
let loudness = [0.35, 0.75]; // How loud each lap is (somewhere between these, before `level`)
let pitch = [250, 700]; // The middle of each lap's sound, in Hz (lower = deeper water)
let echo = 0.2; // How often a lap's followed by a smaller one, just after (0 = never, 1 = always)
let reverbTime = 4; // How many seconds the reverb takes to die away
let dry = 0.3; // How much of the laps is heard as they are...
let wet = 1; // ...and how much in the reverb

// The babbling splashes
let splashGap = [2, 6]; // How many seconds between them (somewhere between these)
let bubbles = [3, 9]; // How many bubbles in each...
let splashTime = [0.3, 1.2]; // ...over how many seconds
let bubbleLoud = [0.005, 0.01]; // How loud each bubble is (before `level`)
let bubblePitch = [1200, 3500]; // Where each bubble's pitch starts, in Hz, before it rises

let master = null; // Everything goes through this, at `level`
let waterNoise = null; // A few seconds of soft noise each lap plays a piece of
let started = false;

const between = ([low, high]) => low + Math.random() * (high - low);

// Brown noise: random steps, each from the last, so it's mostly low rumble rather than hiss
function makeNoise(context) {
  const seconds = 10;
  const buffer = context.createBuffer(1, seconds * context.sampleRate, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  let most = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last;
    most = Math.max(most, Math.abs(last));
  }
  for (let i = 0; i < data.length; i++) data[i] /= most;
  return buffer;
}

// One lap: a piece of the noise, filtered, swelling up and falling away, off to one side
function lap(context, when, loud = between(loudness)) {
  const piece = context.createBufferSource();
  piece.buffer = waterNoise;
  const band = context.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = between(pitch);
  band.Q.value = 1.2;
  const swell = context.createGain();
  const up = between(swellTime);
  const down = between(fallTime);
  swell.gain.setValueAtTime(0, when);
  swell.gain.linearRampToValueAtTime(loud, when + up);
  swell.gain.setTargetAtTime(0, when + up, down / 4); // Falls away quickly at first, then trails off
  const side = context.createStereoPanner();
  side.pan.value = between([-0.6, 0.6]);
  piece.connect(band).connect(swell).connect(side).connect(master);
  // The filter dips a little as it falls, as the wave draws back
  band.frequency.setTargetAtTime(band.frequency.value * 0.7, when + up, down / 2);
  piece.start(when, Math.random() * (waterNoise.duration - 6));
  piece.stop(when + up + down * 1.5);
}

// The reverb's echo of a room, or open water: a burst of noise that dies away over reverbTime, different in each ear,
// and getting darker as it goes (its highs die away faster than its lows, as they do in the air)
export function makeReverb(context, reverbTime = 4) {
  const rate = context.sampleRate;
  const impulse = context.createBuffer(2, Math.round(reverbTime * rate), rate);
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c);
    let soft = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length; // How far through, 0 to 1
      const dark = 0.6 + 0.38 * t; // How much each sample's smoothed into the last: more as it goes, so darker
      soft = soft * dark + (Math.random() * 2 - 1) * (1 - dark);
      data[i] = soft * Math.pow(1 - t, 3) * (1 + 3 * t); // Dies away, the darker part lifted so it's still heard
    }
  }
  const reverb = context.createConvolver();
  reverb.buffer = impulse;
  return reverb;
}

// One bubble: a tiny tone that swoops up in pitch as it fades, very quickly, as a bubble does as it bursts. It starts
// at `pitch` (in Hz), at `pan` (-1 = left, 1 = right), and goes `into` wherever it's heard (the splashes, or the boat's
// wake: see wash.js). Its shape can be changed: how many seconds it takes to come in (`attack`), how long it lasts
// (`life`, somewhere between two lengths in seconds) and how far its pitch rises (`rise`, somewhere between two).
export function bubble(context, into, when, loud, pitch, pan, { attack = 0.003, life = [0.02, 0.07], rise = [1.5, 2.5] } = {}) {
  const tone = context.createOscillator();
  const lasts = between(life);
  tone.frequency.setValueAtTime(pitch, when);
  tone.frequency.exponentialRampToValueAtTime(pitch * between(rise), when + lasts);
  const fade = context.createGain();
  fade.gain.setValueAtTime(0, when);
  fade.gain.linearRampToValueAtTime(loud, when + attack);
  fade.gain.exponentialRampToValueAtTime(0.0001, when + lasts);
  const side = context.createStereoPanner();
  side.pan.value = pan;
  tone.connect(fade).connect(side).connect(into);
  tone.start(when);
  tone.stop(when + lasts + 0.01);
}

// A babbling splash: a few bubbles tumbling out together, over a faint high hiss
function splash(context, when) {
  const length = between(splashTime);
  const count = Math.round(between(bubbles));
  for (let i = 0; i < count; i++) {
    bubble(context, master, when + Math.random() * length, between(bubbleLoud), between(bubblePitch), between([-0.8, 0.8]));
  }
  const hiss = context.createBufferSource();
  hiss.buffer = waterNoise;
  const high = context.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 4000;
  const fade = context.createGain();
  fade.gain.setValueAtTime(0, when);
  fade.gain.linearRampToValueAtTime(between(bubbleLoud) * 1.5, when + 0.05);
  fade.gain.setTargetAtTime(0, when + 0.05, length / 3);
  hiss.connect(high).connect(fade).connect(master);
  hiss.start(when, Math.random() * (waterNoise.duration - 3));
  hiss.stop(when + length + 1);
}

function nextSplash() {
  const out = audioOut();
  if (out) splash(out.context, out.context.currentTime + 0.05);
  setTimeout(nextSplash, between(splashGap) * 1000);
}

function next() {
  const out = audioOut();
  if (out) {
    const context = out.context;
    const now = context.currentTime + 0.05;
    lap(context, now);
    if (Math.random() < echo) lap(context, now + between([0.5, 1]), between([0.15, 0.3]));
  }
  setTimeout(next, between([gapLeast, gapMost]) * 1000);
}

function start() {
  const out = audioOut();
  if (!on || started || !out) return;
  started = true;
  master = out.context.createGain();
  master.gain.value = level;
  const dryLevel = out.context.createGain();
  dryLevel.gain.value = dry;
  const wetLevel = out.context.createGain();
  wetLevel.gain.value = wet;
  master.connect(dryLevel).connect(out);
  master.connect(makeReverb(out.context, reverbTime)).connect(wetLevel).connect(out);
  waterNoise = makeNoise(out.context);
  next();
  setTimeout(nextSplash, between(splashGap) * 1000);
}

window.addEventListener('boatentered', start);
for (const type of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(type, () => setTimeout(start, 50));
onSoundChange((on) => on && setTimeout(start, 50));
