// A track's own effects, in the order its sound goes through them, and the room all the tracks share. Their settings
// are the 'fx.*', 'mix.*' and 'room.*' ones in params.js. Used by engine.js.
//
//   in ─ low cut ─ high cut ─ drive ─ crush ─ echo ─ volume ─ pan ─┬─ out
//                                                                  └─ send ─ (the room)

import { crushBits, crushHold } from './params.js';

const quick = 0.02; // How quickly a setting that's changed is taken on, in seconds

// The crusher works a sample at a time, which needs a little processor of its own, loaded once per AudioContext.
// It holds each sample for `hold` samples (a lower sample rate) and rounds it to `bits` bits.
const crusherCode = `
registerProcessor('soundscape-crush', class extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bits', defaultValue: 16, minValue: 1, maxValue: 16, automationRate: 'k-rate' },
      { name: 'hold', defaultValue: 1, minValue: 1, maxValue: 64, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.left = 0;
    this.held = [0, 0];
  }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input.length) return true;
    const steps = Math.pow(2, parameters.bits[0] - 1);
    const hold = parameters.hold[0];
    for (let i = 0; i < output[0].length; i++) {
      if (this.left <= 0) {
        for (let c = 0; c < output.length; c++) this.held[c] = Math.round((input[c] ?? input[0])[i] * steps) / steps;
        this.left += hold;
      }
      this.left -= 1;
      for (let c = 0; c < output.length; c++) output[c][i] = this.held[c];
    }
    return true;
  }
});`;
const crushers = new WeakMap(); // AudioContext -> a promise of whether it's loaded
function crusherReady(audio) {
  if (!crushers.has(audio)) {
    const url = URL.createObjectURL(new Blob([crusherCode], { type: 'application/javascript' }));
    crushers.set(
      audio,
      audio.audioWorklet
        ? audio.audioWorklet.addModule(url).then(
            () => true,
            () => false
          )
        : Promise.resolve(false)
    );
  }
  return crushers.get(audio);
}

// Distortion: the harder it's driven, the more its peaks are squashed flat. One curve for each hundredth of the knob.
const driveCurves = new Map();
function driveCurve(amount) {
  const step = Math.round(amount * 100);
  if (!driveCurves.has(step)) {
    const push = 1 + Math.pow(step / 100, 2) * 50;
    const curve = new Float32Array(2049);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / 1024) - 1) * push) / Math.tanh(push);
    driveCurves.set(step, curve);
  }
  return driveCurves.get(step);
}

// A track's effects. set(v) takes every setting at once: { volume, pan, space, lowcut, highcut, drive, crush,
// downsample, echoTime, echoFeedback, echoMix }, and `heard` (false while it's muted).
export function makeChain(audio) {
  const input = audio.createGain();
  const lowcut = audio.createBiquadFilter();
  lowcut.type = 'highpass';
  lowcut.Q.value = 0.5;
  const highcut = audio.createBiquadFilter();
  highcut.type = 'lowpass';
  highcut.Q.value = 0.5;
  const shaper = audio.createWaveShaper();
  shaper.oversample = '2x';
  const driven = audio.createGain(); // Turned down as the drive's turned up, so it gets dirtier, not just louder
  const crushIn = audio.createGain();
  const crushOut = audio.createGain();
  const delay = audio.createDelay(2.5);
  const feedback = audio.createGain();
  const damp = audio.createBiquadFilter(); // Each echo a little duller than the last, like tape
  damp.type = 'lowpass';
  damp.frequency.value = 4200;
  const echoes = audio.createGain();
  const volume = audio.createGain();
  const pan = audio.createStereoPanner();
  const send = audio.createGain();

  input.connect(lowcut).connect(highcut).connect(shaper).connect(driven).connect(crushIn);
  crushIn.connect(crushOut);
  crushOut.connect(volume);
  crushOut.connect(delay);
  delay.connect(damp).connect(feedback).connect(delay);
  delay.connect(echoes).connect(volume);
  volume.connect(pan);
  pan.connect(send);

  let crusher = null;
  let crushing = false;
  let wanted = { bits: 16, hold: 1 };
  function crush(on) {
    if (on && !crusher) {
      crusherReady(audio).then((loaded) => {
        if (!loaded || crusher) return;
        crusher = new AudioWorkletNode(audio, 'soundscape-crush', { outputChannelCount: [2] });
        crush(crushing);
      });
    }
    if (!crusher) return;
    crusher.parameters.get('bits').value = wanted.bits;
    crusher.parameters.get('hold').value = wanted.hold;
    try {
      crushIn.disconnect();
      crusher.disconnect();
    } catch {}
    if (on) crushIn.connect(crusher).connect(crushOut);
    else crushIn.connect(crushOut);
  }

  let driveNow = -1;
  return {
    input,
    out: pan,
    send,
    set(v) {
      const now = audio.currentTime;
      const to = (param, value) => param.setTargetAtTime(value, now, quick);
      to(lowcut.frequency, v.lowcut);
      to(highcut.frequency, v.highcut);
      const drive = Math.round(v.drive * 100) / 100;
      if (drive !== driveNow) {
        driveNow = drive;
        shaper.curve = drive > 0 ? driveCurve(drive) : null;
        to(driven.gain, 1 / (1 + drive * 1.2));
      }
      const on = v.crush > 0.005 || v.downsample > 0.005;
      wanted = { bits: crushBits(v.crush), hold: crushHold(v.downsample) };
      if (on !== crushing) {
        crushing = on;
        crush(on);
      } else if (crusher && on) {
        crusher.parameters.get('bits').value = wanted.bits;
        crusher.parameters.get('hold').value = wanted.hold;
      }
      delay.delayTime.setTargetAtTime(v.echoTime, now, 0.08);
      to(feedback.gain, Math.min(0.95, v.echoFeedback));
      to(echoes.gain, v.echoMix);
      to(volume.gain, v.heard ? v.volume : 0);
      to(pan.pan, Math.max(-1, Math.min(1, v.pan)));
      to(send.gain, v.space);
    },
    disconnect() {
      pan.disconnect();
      send.disconnect();
    },
  };
}

// The room: a reverb all the tracks send into. Its ring is made up, not recorded: noise dying away, darker as it goes.
export function makeRoom(audio) {
  const input = audio.createGain();
  const reverb = audio.createConvolver();
  const tone = audio.createBiquadFilter();
  tone.type = 'lowpass';
  const out = audio.createGain();
  out.gain.value = 0.9;
  input.connect(reverb).connect(tone).connect(out);

  let sizeNow = 0;
  function ring(seconds) {
    const length = Math.max(64, Math.floor(audio.sampleRate * seconds));
    const buffer = audio.createBuffer(2, length, audio.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      let low = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        low += (Math.random() * 2 - 1 - low) * (0.12 + 0.88 * Math.pow(1 - t, 4)); // Its highs go first
        data[i] = low * Math.exp(-6.9 * t) * Math.min(1, i / (audio.sampleRate * 0.004));
      }
    }
    return buffer;
  }

  return {
    input,
    out,
    set({ size, tone: brightness }) {
      const rounded = Math.round(size * 20) / 20;
      if (rounded !== sizeNow) {
        sizeNow = rounded;
        reverb.buffer = ring(rounded);
      }
      tone.frequency.setTargetAtTime(brightness, audio.currentTime, quick);
    },
  };
}
