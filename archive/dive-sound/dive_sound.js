// A sound for the dive from the pond into the wormhole (see enter() in pond.js), made here in Web Audio rather than
// recorded, and scored to what's on the screen, from the moment the pond's pressed:
//
//   the colour drop falls               a faint whistle, gliding down as it falls
//   ...and lands                        a soft low bloom, under the drip the splash makes (see playDrip())
//   the rings spin faster and faster    the suck: a drone in open fifths sliding up, with a rush of air sweeping up
//                                       through it, and both swirling from side to side faster and faster as they spin
//   the worm grows out of the middle    the suck at its height...
//   ...and springs forward              ...cut off for a moment, then a deep thump and a burst, and a tone that bends
//                                       as the worm stretches and springs back, settling when it does
//   out into space, the stars coming    a chord opening up, far off, with high pings coming in like the stars, all
//                                       fading away once the wormhole's taken over
//
// The times all come from the pond's own (passed in as `times`), so it keeps up with the dive if that's retuned.
// It's in D: D, A and E, open fifths, with no third until the space chord's F sharp.

// The notes, in hertz
const D1 = 36.71;
const D2 = 73.42;
const A2 = 110;
const D3 = 146.83;
const E3 = 164.81;
const A3 = 220;
const FS4 = 369.99;
const E5 = 659.26;
const STARS = [587.33, 659.26, 739.99, 880, 987.77, 1174.66, 1318.51]; // D major pentatonic, high up

const volume = 0.8; // How loud it all is
const rise = 1.5; // How far the suck slides up, as it spins up (1.5 = a fifth)
const gapBefore = 0.08; // How many seconds before the spring the suck's cut off, so the spring hits out of a moment's silence
const bend = 300; // How far the tone bends as the worm stretches, in cents (100 = a semitone)
const starCount = 16; // How many pings, for the stars

export function playDiveSound(audio, times) {
  const start = audio.currentTime + 0.02;
  const at = (seconds) => start + seconds; // From the press
  const land = times.fall;
  const spinFrom = times.above + times.spinUpAt;
  const spring = times.above + times.wormAt + times.springAt;
  const end = times.above + times.handOverAt; // When the wormhole takes over
  const cut = spring - gapBefore;
  // The spin-up's curves start just after it does (a curve can't start at the very moment something else is set), and
  // last until the cut
  const curveFrom = spinFrom + 0.005;
  const curveFor = Math.max(0.05, cut - curveFrom);

  // Everything goes through a compressor, so nothing gets harsh, with an echo (a made-up hall) for some of it
  const compressor = audio.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.ratio.value = 4;
  compressor.connect(audio.destination);
  const master = audio.createGain();
  master.gain.value = volume;
  master.connect(compressor);
  const hall = audio.createConvolver();
  hall.buffer = hallEcho(audio, 3.5);
  const hallLevel = audio.createGain();
  hallLevel.gain.value = 0.55;
  hall.connect(hallLevel).connect(compressor);
  const noise = noiseBuffer(audio);

  // A gain, starting silent, connected on to wherever it goes (and, by `echo`, into the hall too)
  const voice = (to, echo = 0) => {
    const gain = audio.createGain();
    gain.gain.value = 0;
    gain.connect(to);
    if (echo) {
      const send = audio.createGain();
      send.gain.value = echo;
      gain.connect(send).connect(hall);
    }
    return gain;
  };
  // An oscillator, started and stopped
  const tone = (type, frequency, from, until) => {
    const osc = audio.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.start(at(from));
    osc.stop(at(until));
    return osc;
  };
  // A curve that speeds up as the rings do (their speed goes up with the square of the time), from a to b
  const speedingUp = (a, b, steps = 128) => Float32Array.from({ length: steps }, (_, i) => a * Math.pow(b / a, (i / (steps - 1)) ** 2));

  // The fall: a faint whistle gliding down
  {
    const gain = voice(master, 0.5);
    gain.gain.setValueAtTime(0, at(0));
    gain.gain.linearRampToValueAtTime(0.03, at(0.15));
    gain.gain.setValueAtTime(0.03, at(land - 0.2));
    gain.gain.linearRampToValueAtTime(0, at(land));
    const osc = tone('sine', 1500, 0, land + 0.05);
    osc.frequency.setValueAtTime(1500, at(0));
    osc.frequency.exponentialRampToValueAtTime(700, at(land));
    const wobble = tone('sine', 5, 0, land + 0.05);
    const depth = audio.createGain();
    depth.gain.value = 15; // Cents
    wobble.connect(depth).connect(osc.detune);
    osc.connect(gain);
  }

  // The landing: a soft low bloom
  {
    const gain = voice(master, 0.2);
    gain.gain.setValueAtTime(0.28, at(land));
    gain.gain.exponentialRampToValueAtTime(0.001, at(land + 1.6));
    const osc = tone('sine', 110, land, land + 1.7);
    osc.frequency.setValueAtTime(110, at(land));
    osc.frequency.exponentialRampToValueAtTime(55, at(land + 0.5));
    osc.connect(gain);
  }

  // The suck: swirling from side to side, faster and faster as the rings spin up
  let swirl = master;
  if (audio.createStereoPanner) {
    const pan = audio.createStereoPanner();
    pan.connect(master);
    const lfo = tone('sine', 0.25, spinFrom, spring);
    lfo.frequency.setValueAtTime(0.25, at(spinFrom));
    lfo.frequency.setValueCurveAtTime(speedingUp(0.25, 7), at(curveFrom), curveFor);
    const depth = audio.createGain();
    depth.gain.value = 0.7;
    lfo.connect(depth).connect(pan.pan);
    swirl = pan;
  }
  // ...the drone, in open fifths, opening up and sliding up a fifth
  {
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(180, at(land));
    filter.frequency.exponentialRampToValueAtTime(500, at(spinFrom));
    filter.frequency.setValueCurveAtTime(speedingUp(500, 4500), at(curveFrom), curveFor);
    const gain = voice(swirl, 0.15);
    gain.gain.setValueAtTime(0, at(land));
    gain.gain.linearRampToValueAtTime(0.025, at(times.above)); // (Quiet at first, so it swells right up into the spring)
    gain.gain.linearRampToValueAtTime(0.17, at(cut));
    gain.gain.linearRampToValueAtTime(0, at(spring - 0.02));
    filter.connect(gain);
    for (const note of [D2, A2, E3]) {
      for (const detune of [-8, 8]) {
        const osc = tone('sawtooth', note, land, spring);
        osc.detune.value = detune;
        osc.frequency.setValueAtTime(note, at(spinFrom));
        osc.frequency.setValueCurveAtTime(speedingUp(note, note * rise), at(curveFrom), curveFor);
        osc.connect(filter);
      }
    }
  }
  // ...and the rush of air, sweeping up through it
  {
    const air = audio.createBufferSource();
    air.buffer = noise;
    air.loop = true;
    air.start(at(spinFrom));
    air.stop(at(spring));
    const band = audio.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 4;
    band.frequency.setValueAtTime(300, at(spinFrom));
    band.frequency.setValueCurveAtTime(speedingUp(300, 6000), at(curveFrom), curveFor);
    const gain = voice(swirl, 0.2);
    gain.gain.setValueAtTime(0, at(spinFrom));
    gain.gain.setValueCurveAtTime(Float32Array.from({ length: 64 }, (_, i) => 0.25 * (i / 63) ** 2), at(curveFrom), curveFor);
    gain.gain.linearRampToValueAtTime(0, at(spring - 0.02));
    air.connect(band).connect(gain);
  }

  // The spring: a deep thump...
  {
    const gain = voice(master);
    gain.gain.setValueAtTime(0.6, at(spring));
    gain.gain.exponentialRampToValueAtTime(0.001, at(spring + 1));
    const osc = tone('sine', 170, spring, spring + 1.1);
    osc.frequency.setValueAtTime(170, at(spring));
    osc.frequency.exponentialRampToValueAtTime(D1, at(spring + 0.35));
    osc.connect(gain);
  }
  // ...a burst, darkening as it goes...
  {
    const burst = audio.createBufferSource();
    burst.buffer = noise;
    burst.start(at(spring));
    burst.stop(at(spring + 1.3));
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(9000, at(spring));
    filter.frequency.exponentialRampToValueAtTime(250, at(spring + 0.9));
    const gain = voice(master, 0.7);
    gain.gain.setValueAtTime(0.3, at(spring));
    gain.gain.exponentialRampToValueAtTime(0.001, at(spring + 1.2));
    burst.connect(filter).connect(gain);
  }
  // ...and a tone that bends as the worm stretches and springs back, as its stretch settles (see wormStretch() in
  // pond.js, which this follows: the same swing, and the same settling)
  {
    const length = times.stretchSettle + 0.5;
    const swing = Float32Array.from({ length: 256 }, (_, i) => {
      const t = (i / 255) * length;
      const settling = Math.min(1, t / times.stretchSettle);
      const left = 1 - settling * settling * (3 - 2 * settling);
      return -bend * left * Math.sin((2 * Math.PI * t) / times.stretchTime); // (Lower as it stretches out)
    });
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    const gain = voice(master, 0.4);
    gain.gain.setValueAtTime(0, at(spring));
    gain.gain.linearRampToValueAtTime(0.14, at(spring + 0.02));
    gain.gain.exponentialRampToValueAtTime(0.001, at(spring + length));
    filter.connect(gain);
    for (const note of [D3, A3]) {
      const osc = tone('triangle', note, spring, spring + length + 0.1);
      osc.detune.setValueCurveAtTime(swing, at(spring), length);
      osc.connect(filter);
    }
  }

  // Space: a chord opening up, far off, much quieter than the suck, like breathing out...
  {
    const gain = voice(master, 0.8);
    gain.gain.setValueAtTime(0, at(spring));
    gain.gain.linearRampToValueAtTime(0.018, at(spring + 1.8));
    gain.gain.setValueAtTime(0.018, at(end));
    gain.gain.exponentialRampToValueAtTime(0.0005, at(end + 4));
    for (const note of [D3, A3, FS4, E5]) {
      for (const detune of [-4, 4]) { // (Two of each, a little apart, so they beat slowly)
        const osc = tone('sine', note, spring, end + 4.1);
        osc.detune.value = detune;
        osc.connect(gain);
      }
    }
  }
  // ...and pings coming in like the stars, more and more of them
  for (let i = 0; i < starCount; i++) {
    const when = spring + 0.3 + 4.5 * Math.sqrt((i + Math.random() * 0.8) / starCount);
    const gain = voice(master, 1);
    gain.gain.setValueAtTime(0, at(when));
    gain.gain.linearRampToValueAtTime(0.035, at(when + 0.005));
    gain.gain.exponentialRampToValueAtTime(0.0005, at(when + 0.9));
    let to = gain;
    if (audio.createStereoPanner) {
      const pan = audio.createStereoPanner();
      pan.pan.value = Math.random() * 1.6 - 0.8;
      pan.connect(gain);
      to = pan;
    }
    tone('sine', STARS[Math.floor(Math.random() * STARS.length)], when, when + 1).connect(to);
  }
}

// Two seconds of white noise, for the air and the burst
function noiseBuffer(audio) {
  const buffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

// A hall's echo, made up: noise dying away over this many seconds, a little different on each side
function hallEcho(audio, seconds) {
  const length = Math.round(audio.sampleRate * seconds);
  const buffer = audio.createBuffer(2, length, audio.sampleRate);
  for (let side = 0; side < 2; side++) {
    const data = buffer.getChannelData(side);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
  }
  return buffer;
}
