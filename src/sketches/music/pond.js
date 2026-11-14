// A small pond on a still evening, very quiet, under the music, in place of the made-up waves (lapping.js, switched
// off). It's a recording, looped: "Small Pond", an evening near a small pond in Queeny Park, Town and Country,
// Missouri, recorded by Pierrot Desperes on 29 September 2022 for radio aporee
// (https://archive.org/details/aporee_58417_67032), public domain, so no credit's needed. public/sounds/music/pond.m4a
// is the whole of it (two minutes), with its rumble taken out below 120 Hz, as AAC. Its end's blended into its start
// (see makeLoop()), so it goes round with no seam. It goes through the site's sound switch (see sound.js), and starts
// with the music: as the boat comes on, or on the first press, fading in.

import { audioOut, onSoundChange } from '../../scripts/sound.js';

const RECORDING = '/sounds/music/pond.m4a';
let level = 0.0015; // How loud it is, on average (the recording's evened out first, so this holds whatever its own level)
let seam = 3; // How many seconds the end of the recording takes to blend into its start
let fadeIn = 3; // How many seconds it takes to fade in at first

let fetched = fetch(RECORDING).then((response) => (response.ok ? response.arrayBuffer() : null)).catch(() => null);
let started = false;

// The recording as a loop: its last `seam` seconds fade out as its first fade in, laid over each other, so going round
// from the end to the start is seamless. The fades are equal-power (a quarter of a sine and cosine), so it doesn't dip.
// It's evened out too, so `level` sets how loud it is whatever the recording's own level.
function makeLoop(context, recording) {
  const rate = recording.sampleRate;
  const fade = Math.min(Math.round(seam * rate), Math.floor(recording.length / 3));
  const frames = recording.length - fade;
  const loop = context.createBuffer(recording.numberOfChannels, frames, rate);
  let power = 0;
  for (let c = 0; c < recording.numberOfChannels; c++) {
    const from = recording.getChannelData(c);
    const to = loop.getChannelData(c);
    to.set(from.subarray(0, frames));
    for (let i = 0; i < fade; i++) {
      const through = (i + 0.5) / fade;
      to[i] = from[i] * Math.sin((through * Math.PI) / 2) + from[frames + i] * Math.cos((through * Math.PI) / 2);
    }
    for (let i = 0; i < frames; i++) power += to[i] * to[i];
  }
  const loudness = Math.sqrt(power / (frames * recording.numberOfChannels)) || 1;
  for (let c = 0; c < loop.numberOfChannels; c++) {
    const data = loop.getChannelData(c);
    for (let i = 0; i < frames; i++) data[i] /= loudness; // Evened out to 1 on average, for `level` to set
  }
  return loop;
}

async function start() {
  const out = audioOut();
  if (started || !out) return;
  started = true;
  const data = await fetched;
  if (!data) return; // Not there (yet): quiet
  const context = out.context;
  const recording = await context.decodeAudioData(data);
  const source = context.createBufferSource();
  source.buffer = makeLoop(context, recording);
  source.loop = true;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, context.currentTime);
  gain.gain.linearRampToValueAtTime(level, context.currentTime + fadeIn);
  source.connect(gain).connect(out);
  source.start(0, Math.random() * source.buffer.duration); // From somewhere different each visit
}

window.addEventListener('boatentered', start);
for (const type of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(type, () => setTimeout(start, 50));
onSoundChange((on) => on && setTimeout(start, 50));
