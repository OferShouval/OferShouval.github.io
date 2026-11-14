// The sound of the boat moving through the water: a soft gurgle of little bubbles in its wake (the same kind as the
// splashes', see bubble() in lapping.js, but many more, quieter, lower and softer, so they run together), over a hush
// of water sliding along the hull. The faster it goes, the more bubbles, the higher and the louder, and the louder the
// hush; turning, it churns up a few more; still, it's quiet. They're heard wherever the boat is across the screen,
// spread a little round it. It follows the boat's motion, which the sketch keeps up to date (see motion.js). It goes
// through the site's sound switch (see sound.js), and starts with the music: as the boat comes on, or on the first
// press.

import { audioOut, onSoundChange } from '../../scripts/sound.js';
import { bubble, makeReverb } from './lapping.js';
import { motion } from './motion.js';

// The gurgle
let rate = 60; // How many bubbles a second, at the boat's usual top speed
let turnRate = 40; // How many more a second, turning hard
let hardTurn = 1.5; // How fast a turn counts as turning hard, in radians a second
let loudness = [0.008, 0.02]; // How loud each bubble is (somewhere between these), at top speed
let pitch = [400, 1100]; // Where each bubble's pitch starts, in Hz, standing still...
let pitchFast = [600, 1800]; // ...and at top speed
let shape = { attack: 0.012, life: [0.05, 0.14], rise: [1.2, 1.6] }; // Softer and longer than the splashes' bubbles
let mellow = 2500; // The bubbles' sound is softened above this, in Hz, to take the edge off them
let spread = 0.3; // How far the bubbles spread either side of the boat (in the stereo, 0 to 1)

// The hush along the hull
let hushLevel = 0.05; // How loud it is, at top speed
let hushPitch = [500, 1200]; // The middle of its sound, in Hz, from slow to top speed
let swell = 0.35; // How much it swells and falls as it goes, slowly (0 = steady)

let wet = 0.4; // How much of it all is heard in the reverb
let react = 0.15; // How quickly the hush follows the boat, in seconds (smaller = more closely)

let started = false;

const between = ([low, high]) => low + Math.random() * (high - low);
const towards = (a, b, t) => a + (b - a) * t;

// Ten seconds of soft noise, looping, for the hush
function makeHush(context) {
  const buffer = context.createBuffer(1, 10 * context.sampleRate, context.sampleRate);
  const data = buffer.getChannelData(0);
  let low = 0;
  for (let i = 0; i < data.length; i++) {
    low = (low + 0.08 * (Math.random() * 2 - 1)) / 1.08;
    data[i] = low * 4;
  }
  const join = 4000; // Its ends faded into each other, so it loops without a click
  for (let i = 0; i < join; i++) {
    const t = i / join;
    data[i] = data[i] * t + data[data.length - join + i] * (1 - t);
  }
  return buffer;
}

function start() {
  const out = audioOut();
  if (started || !out) return;
  started = true;
  const context = out.context;

  // The reverb, for everything
  const wetLevel = context.createGain();
  wetLevel.gain.value = wet;
  const reverb = makeReverb(context, 2);
  reverb.connect(wetLevel).connect(out);

  // The hush goes to `side`, wherever the boat is
  const side = context.createStereoPanner();
  side.connect(out);
  side.connect(reverb);

  // The bubbles, softened (each one's placed round the boat on its own, so not through `side`)
  const soften = context.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = mellow;
  soften.connect(out);
  soften.connect(reverb);

  // The hush, swelling slowly with two slow waves that drift against each other
  const hiss = context.createBufferSource();
  hiss.buffer = makeHush(context);
  hiss.loop = true;
  hiss.loopEnd = hiss.buffer.duration - 4000 / context.sampleRate;
  const hull = context.createBiquadFilter();
  hull.type = 'bandpass';
  hull.Q.value = 0.7;
  const swelling = context.createGain();
  swelling.gain.value = 1;
  for (const speed of [0.23, 0.37]) {
    const wave = context.createOscillator();
    wave.frequency.value = speed;
    const depth = context.createGain();
    depth.gain.value = swell / 2;
    wave.connect(depth).connect(swelling.gain);
    wave.start();
  }
  const hushGain = context.createGain();
  hushGain.gain.value = 0;
  hiss.connect(hull).connect(swelling).connect(hushGain).connect(side);
  hiss.start();

  // Every frame: the hush follows the boat, and as many bubbles as its motion calls for, scattered through the frame
  let owed = 0; // Bubbles called for but not made yet (a fraction of one, mostly)
  let last = context.currentTime;
  (function follow() {
    const now = context.currentTime;
    const frame = Math.min(now - last, 0.1);
    last = now;
    const pace = motion.onScreen ? Math.min(motion.speed, 1.5) : 0; // Hurrying to a gate, a little more still
    const fast = Math.min(pace, 1);
    hushGain.gain.setTargetAtTime(hushLevel * pace ** 1.5, now, react);
    hull.frequency.setTargetAtTime(towards(hushPitch[0], hushPitch[1], fast), now, react);
    side.pan.setTargetAtTime(motion.x * 0.7, now, react);
    if (pace > 0) {
      const turning = Math.min(1, Math.abs(motion.turn) / hardTurn);
      owed += (rate * pace + turnRate * turning * pace) * frame;
      while (owed >= 1) {
        owed -= 1;
        const loud = between(loudness) * Math.max(0.3, pace);
        const from = towards(between(pitch), between(pitchFast), fast);
        const pan = Math.max(-1, Math.min(1, motion.x * 0.7 + between([-spread, spread])));
        bubble(context, soften, now + 0.03 + Math.random() * frame, loud, from, pan, shape);
      }
    }
    requestAnimationFrame(follow);
  })();
}

window.addEventListener('boatentered', start);
for (const type of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(type, () => setTimeout(start, 50));
onSoundChange((on) => on && setTimeout(start, 50));
