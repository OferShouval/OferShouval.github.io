// The sampler: plays sound files. Each sound is first got ready (prepare()): trimmed to where it starts and ends,
// turned round if it's reversed, stretched if it's stretched, and, if it loops, its end blended into its start. A note
// (samplerVoice()) then just plays what's ready, at its pitch, fading in and out. Its settings are the 'sampler.*'
// ones in params.js. Used by engine.js.

import { holdAt } from './synth.js';

const clamp01 = (t) => Math.min(1, Math.max(0, t));

// Longer or shorter without changing pitch (factor 2 = twice as long). The sound's cut into short overlapping grains,
// which are laid out closer together or further apart. Each grain's taken from near where it should come from, at the
// spot that carries on best from the grain before it, so the grains join up without a flutter (the method's called
// WSOLA). `channels` are Float32Arrays, all the same length; gives new ones.
export function stretch(channels, rate, factor) {
  const length = channels[0].length;
  const grain = Math.min(Math.round(rate * 0.08), Math.floor(length / 4)) & ~1; // 80 ms, or less for a very short sound
  if (Math.abs(factor - 1) < 0.01 || grain < 64) return channels;
  const hop = grain / 2; // How far apart grains are laid, so each overlaps half of the next
  const reach = Math.round(rate * 0.012); // How far either side of where a grain should come from to look for the best spot
  const outLength = Math.round(length * factor);
  const out = channels.map(() => new Float32Array(outLength + grain));
  const window = new Float32Array(grain);
  for (let i = 0; i < grain; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / grain);
  let mono = channels[0];
  if (channels.length > 1) {
    mono = new Float32Array(length);
    for (const channel of channels) for (let i = 0; i < length; i++) mono[i] += channel[i];
  }
  const last = Math.max(0, length - grain);
  let taken = 0; // Where the grain before was taken from
  for (let k = 0; k * hop < outLength; k++) {
    const wanted = Math.round((k * hop) / factor);
    let from = wanted;
    if (k > 0) {
      const natural = taken + hop; // What would have come next, left alone
      let best = -Infinity;
      for (let d = -reach; d <= reach; d += 2) {
        const spot = wanted + d;
        if (spot < 0 || spot > last) continue;
        let alike = 0;
        for (let i = 0; i < hop; i += 4) alike += mono[spot + i] * (mono[natural + i] ?? 0);
        if (alike > best) {
          best = alike;
          from = spot;
        }
      }
    }
    from = Math.min(last, Math.max(0, from));
    taken = from;
    const at = k * hop;
    for (let c = 0; c < channels.length; c++) {
      const source = channels[c];
      const target = out[c];
      // (The very first grain keeps its start as it is, so the sound's attack isn't faded in)
      for (let i = 0; i < grain; i++) target[at + i] += source[from + i] * (k === 0 && i < hop ? 1 : window[i]);
    }
  }
  return out.map((channel) => channel.subarray(0, outLength));
}

// Which prepared sound a sample with these settings needs: the same name means the same sound
export const preparedName = (sample, s) => [sample.src, sample.start ?? 0, sample.end ?? 1, !!s.reverse, s.stretch, s.loop ? s.blend : 'once'].join('|');

// One of a sampler's sounds, ready to play. `sample` is { src, start, end } (start and end from 0 to 1 along the file),
// `s` the sampler's settings: { reverse, stretch, loop, blend }.
export function prepare(audio, buffer, sample, s) {
  const rate = buffer.sampleRate;
  const from = Math.floor(clamp01(sample.start ?? 0) * buffer.length);
  const to = Math.max(from + 32, Math.min(buffer.length, Math.ceil(clamp01(sample.end ?? 1) * buffer.length)));
  let channels = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c).slice(from, to));
  if (s.reverse) for (const channel of channels) channel.reverse();
  channels = stretch(channels, rate, s.stretch);
  let length = channels[0].length;
  const blend = s.loop ? Math.min(Math.floor(s.blend * rate), Math.floor(length / 2)) : 0;
  if (blend > 8) {
    // Looping: the start fades in over the end fading out, so going round, the end runs straight into the start
    length -= blend;
    channels = channels.map((channel) => {
      const joined = channel.slice(0, length);
      for (let i = 0; i < blend; i++) {
        const t = (i / blend) * (Math.PI / 2);
        joined[i] = channel[i] * Math.sin(t) + channel[length + i] * Math.cos(t);
      }
      return joined;
    });
  } else {
    // A cut in the middle of a sound clicks, so each end gets a very quick fade (unless it's the file's own end)
    const quick = Math.min(Math.floor(rate * 0.003), Math.floor(length / 2));
    const fadeStart = s.reverse ? to < buffer.length : from > 0;
    const fadeEnd = s.reverse ? from > 0 : to < buffer.length;
    for (const channel of channels) {
      for (let i = 0; i < quick; i++) {
        if (fadeStart) channel[i] *= i / quick;
        if (fadeEnd) channel[length - 1 - i] *= i / quick;
      }
    }
  }
  const ready = audio.createBuffer(channels.length, length, rate);
  channels.forEach((channel, c) => ready.copyToChannel(channel, c));
  return ready;
}

// One note: `buffer` is a prepared sound. Gives { release(when), stop(), apply(), onended }.
export function samplerVoice(audio, get, buffer, { note, velocity = 0.8, when, pan = 0, detune = 0 }, destination) {
  const t = Math.max(when ?? 0, audio.currentTime);
  const s = (name) => get('sampler.' + name);
  const speed = () => Math.pow(2, (get('notes.transpose') + (s('follow') ? note - 60 : 0) + detune / 100) / 12);

  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.loop = !!s('loop');
  source.playbackRate.value = speed();
  const level = audio.createGain();
  const side = audio.createStereoPanner();
  side.pan.value = Math.max(-1, Math.min(1, pan));
  source.connect(level).connect(side).connect(destination);

  const length = buffer.duration / speed();
  const fadeIn = Math.min(s('fadeIn'), source.loop ? Infinity : length / 2);
  if (fadeIn > 0.002) {
    level.gain.setValueAtTime(0, t);
    level.gain.linearRampToValueAtTime(velocity, t + fadeIn);
  } else level.gain.setValueAtTime(velocity, t);
  if (!source.loop) {
    // Played once through, it fades out as it reaches its end
    const fadeOut = Math.min(s('fadeOut'), length / 2);
    if (fadeOut > 0.002) {
      level.gain.setValueAtTime(velocity, t + length - fadeOut);
      level.gain.linearRampToValueAtTime(0, t + length);
    }
  }
  source.start(t);

  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    side.disconnect();
    voice.onended?.();
  };
  source.onended = done;

  let released = false;
  const voice = {
    onended: null,
    apply: () => !finished && source.playbackRate.setTargetAtTime(speed(), audio.currentTime, 0.025),
    // Lets it go: it fades out (over `over` seconds, if given) and stops. Played once through, it's left to finish
    // by itself, unless it's being stopped.
    release(at = audio.currentTime, over = null) {
      if (released && over === null) return;
      if (!source.loop && over === null) return;
      released = true;
      const from = Math.max(at, audio.currentTime);
      const time = Math.max(0.01, over ?? s('fadeOut'));
      holdAt(level.gain, from);
      level.gain.linearRampToValueAtTime(0, from + time);
      try {
        source.stop(from + time + 0.02);
      } catch {}
    },
    stop: () => voice.release(audio.currentTime, 0.04),
  };
  return voice;
}
