// Quiet water lapping at the boat, under the music (see loop.js). It's made, not recorded: soft noise, filtered to the
// low splashy middle of the range, swelling up and away every couple of seconds, like a small wave against the hull,
// each one a little different and a little to one side. It goes through the site's sound switch (see sound.js), and
// starts with the music: as the boat comes on, or on the first press.

import { audioOut, onSoundChange } from '../../scripts/sound.js';

let level = 0.12; // How loud it is, altogether (1 = as loud as the noise it's made from)
let gapLeast = 1.2; // The shortest time between laps, in seconds...
let gapMost = 3.2; // ...and the longest
let swellTime = [0.25, 0.6]; // How many seconds a lap takes to swell up (somewhere between these)...
let fallTime = [0.8, 1.8]; // ...and to fall away
let pitch = [300, 900]; // The middle of each lap's sound, in Hz (lower = deeper water)
let echo = 0.4; // How often a lap's followed by a smaller one, just after (0 = never, 1 = always)

let master = null; // Everything goes through this, at `level`
let waterNoise = null; // A few seconds of soft noise each lap plays a piece of
let started = false;

const between = ([low, high]) => low + Math.random() * (high - low);

// Brown noise: random steps, each from the last, so it's mostly low rumble rather than hiss
function makeNoise(context) {
  const seconds = 4;
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
function lap(context, when, loudness = between([0.5, 1])) {
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
  swell.gain.linearRampToValueAtTime(loudness, when + up);
  swell.gain.setTargetAtTime(0, when + up, down / 4); // Falls away quickly at first, then trails off
  const side = context.createStereoPanner();
  side.pan.value = between([-0.6, 0.6]);
  piece.connect(band).connect(swell).connect(side).connect(master);
  // The filter dips a little as it falls, as the wave draws back
  band.frequency.setTargetAtTime(band.frequency.value * 0.7, when + up, down / 2);
  piece.start(when, Math.random() * (waterNoise.duration - 3));
  piece.stop(when + up + down * 1.5);
}

function next() {
  const out = audioOut();
  if (out) {
    const context = out.context;
    const now = context.currentTime + 0.05;
    lap(context, now);
    if (Math.random() < echo) lap(context, now + between([0.3, 0.6]), between([0.2, 0.45]));
  }
  setTimeout(next, between([gapLeast, gapMost]) * 1000);
}

function start() {
  const out = audioOut();
  if (started || !out) return;
  started = true;
  master = out.context.createGain();
  master.gain.value = level;
  master.connect(out);
  waterNoise = makeNoise(out.context);
  next();
}

window.addEventListener('boatentered', start);
for (const type of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(type, () => setTimeout(start, 50));
onSoundChange((on) => on && setTimeout(start, 50));
