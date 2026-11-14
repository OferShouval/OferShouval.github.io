// The music page's sound: a stretch of "Unfamiliar State", looped with no gap. An <audio> element with loop
// leaves a little gap each time round, so it's decoded and played with Web Audio, which loops to the sample.
// The loop is copied out of the track with a short crossfade at its seam (see makeLoop()).
// It goes through the site's sound switch (see sound.js), and fades in and out with it. With sound on, it starts as
// the boat comes onto the screen (the sketch says when, with a 'boatentered' event), its first chord with the boat,
// if the browser lets the page make sound by then; if not, it starts on the first press.
//
// Add ?trim to the address to get the trimming panel (see trimPanel()): it moves where the loop starts and ends
// while it plays, and shows the seam, the end of the loop running into its start.

import { audioOut, onSoundChange, startAudio } from '../../scripts/sound.js';

const TRACK = '/sounds/unfamiliar-state/01-unfamiliar-state.m4a';
let loopStart = 12.218; // Where the loop starts, in seconds into the track
let loopEnd = 26.999; // ...and where it ends, going back to its start
// The lowpass filter everything goes through. The frequency it starts cutting above sweeps up and down, smoothly (as
// a sine wave), between these two, starting at the bottom. It's spread by octaves, as we hear pitch, so it takes as
// long from 200 to 450 as from 450 to 1000.
let sweepLow = 200; // In Hz
let sweepHigh = 600;
let sweepTime = 30; // How many seconds it takes to go up and back down again
let resonance = 0.7; // ...and how much it rings at that frequency (0.7 = not at all)
let startFade = 0.01; // How many seconds it takes to fade in each time it starts playing, so it doesn't click
let backwards = true; // Is the loop played backwards? (From firstFrom back to its start, then round from its end)
let firstFrom = 26.999; // Where it starts playing as the page opens, partway into the loop, on the chord for the boat
let crossfade = 0.04; // How many seconds the end of the loop takes to blend into its start

let buffer = null; // The decoded track
let loopBuffer = null; // The loop, copied out of it with the crossfade (see makeLoop())
let source = null; // What's playing it
let playingSince = 0; // The context's time when the source started...
let playingFrom = 0; // ...and where in the track it started from
let fetched = fetch(TRACK).then((response) => response.arrayBuffer()); // Fetched straight away, decoded once there's a context
let decoding = null;
let paused = false; // Paused in the trimming panel...
let pausedAt = 0; // ...and where
let snippet = null; // A moment played while scrubbing, paused
let lowpass = null; // The filter (see sweepLow)
let sweepSince = 0; // The context's time when the sweep started

// The filter, made the first time it's needed, going to the switch's output
function lowpassInto(out) {
  if (!lowpass) {
    lowpass = out.context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.Q.value = resonance;
    lowpass.connect(out);
    // The sweep: the filter's set to the middle of it (in octaves), and a slow wave tunes it up and down from there,
    // in cents (hundredths of a semitone). The wave's a cosine turned upside down, so it starts at the bottom.
    const context = out.context;
    lowpass.frequency.value = Math.sqrt(sweepLow * sweepHigh);
    const wave = context.createOscillator();
    wave.setPeriodicWave(context.createPeriodicWave([0, -1], [0, 0], { disableNormalization: true }));
    wave.frequency.value = 1 / sweepTime;
    const depth = context.createGain();
    depth.gain.value = 1200 * Math.log2(Math.sqrt(sweepHigh / sweepLow)); // Half the sweep's range, in cents
    wave.connect(depth).connect(lowpass.detune);
    wave.start();
    sweepSince = context.currentTime;
  }
  return lowpass;
}

// Decoded straight away too (an OfflineAudioContext can decode without a press), so it's ready for the boat
async function decode() {
  decoding ??= fetched.then((data) => new OfflineAudioContext(2, 1, 44100).decodeAudioData(data));
  buffer = await decoding;
  return buffer;
}
decode();

// The loop as its own sound, from its start to its end, so it can go round and round whole. Over its last moment
// (crossfade seconds) it fades out as what comes just before its start in the track fades in, so by the time it
// goes back round it's already sounding like its start: the seam's blended rather than cut. The fades are
// equal-power (a quarter of a sine and cosine), so it doesn't dip in the middle.
function makeLoop() {
  const rate = buffer.sampleRate;
  const first = Math.round(loopStart * rate);
  const frames = Math.round(loopEnd * rate) - first;
  const fade = Math.min(Math.round(crossfade * rate), first, frames);
  loopBuffer = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: frames, sampleRate: rate });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const track = buffer.getChannelData(c);
    const part = track.slice(first, first + frames);
    for (let i = 0; i < fade; i++) {
      const at = frames - fade + i; // Where in the loop
      const through = (i + 0.5) / fade; // How far through the fade, 0 to 1
      const before = track[first - fade + i]; // What's just before the loop's start in the track
      part[at] = part[at] * Math.cos((through * Math.PI) / 2) + before * Math.sin((through * Math.PI) / 2);
    }
    if (backwards) part.reverse(); // Its seam still joins up, as the crossfaded end now comes first
    loopBuffer.copyToChannel(part, c);
  }
}

// Plays the loop from a point in the track (its start, unless said otherwise, or if that's outside the loop)
async function play(from = loopStart) {
  const context = startAudio();
  if (!context) return;
  await decode();
  await context.resume().catch(() => {});
  const out = audioOut();
  if (!out) return;
  if (source) source.stop();
  if (!loopBuffer) makeLoop();
  // Outside the loop, it starts at the loop's start (its end, going backwards, as that's where it starts that way)
  const inside = backwards ? from > loopStart && from <= loopEnd : from >= loopStart && from < loopEnd;
  if (!inside) from = backwards ? loopEnd : loopStart;
  paused = false;
  source = context.createBufferSource();
  source.buffer = loopBuffer;
  source.loop = true;
  const fade = context.createGain(); // A tiny fade in, so it doesn't click as it starts
  fade.gain.setValueAtTime(0, context.currentTime);
  fade.gain.linearRampToValueAtTime(1, context.currentTime + startFade);
  source.connect(fade).connect(lowpassInto(out));
  playingSince = context.currentTime;
  playingFrom = from;
  source.start(0, backwards ? loopEnd - from : from - loopStart);
}

// Where in the track it's playing now, in seconds
function position() {
  if (paused) return pausedAt;
  if (!source) return null;
  const elapsed = source.context.currentTime - playingSince;
  const loopLength = loopEnd - loopStart;
  const into = ((backwards ? loopEnd - playingFrom : playingFrom - loopStart) + elapsed) % loopLength; // How far into the loop as it plays
  return backwards ? loopEnd - into : loopStart + into;
}

function setLoop(start, end) {
  loopStart = Math.max(0, start);
  loopEnd = Math.max(loopStart + 0.1, end);
  loopBuffer = null; // Made again, with the new points, when it next plays
  if (source) {
    // Moving the points while it plays shifts where it is, so start again from the same spot, or from the start if
    // that's now outside the loop
    const now = position();
    play(now >= loopStart && now < loopEnd ? now : loopStart);
  }
}

function pause() {
  if (!source) return;
  pausedAt = position();
  source.stop();
  source = null;
  paused = true;
}

// Moves to a point in the track: playing on from there if it's playing, or, if it's paused, staying paused there
// and playing a moment of it, to hear where it is
function seek(t) {
  t = Math.max(0, Math.min(t, buffer ? buffer.duration : t));
  if (!paused) return play(t);
  pausedAt = t;
  const out = audioOut();
  if (!buffer || !out) return;
  snippet?.stop();
  snippet = out.context.createBufferSource();
  snippet.buffer = buffer;
  snippet.connect(lowpassInto(out));
  snippet.start(0, t, 0.15);
}

// It starts on the first press with sound on (sound.js starts the context then, and this listens just after)
for (const type of ['pointerup', 'touchend', 'click', 'keydown']) {
  window.addEventListener(type, () => !source && !paused && play(firstFrom));
}
onSoundChange((on) => on && !source && !paused && play(firstFrom));

// As the boat comes on: straight in, on its first chord, if the browser lets the page make sound without a press;
// otherwise it's left for the first press. The sound's woken as the page opens, as it takes a moment to start, so it's
// ready by the time the boat comes on.
startAudio({ fade: 0.02 });
window.addEventListener('boatentered', () => {
  if (!source && !paused && audioOut()) play(firstFrom);
});

if (new URLSearchParams(location.search).has('trim')) trimPanel();

// The trimming panel: the loop's start and end, with buttons to nudge them, the seam drawn as a waveform, a timeline
// to pause and scrub along (and set the start or end where it's got to), and a button that jumps to just before the
// end, to hear the seam
function trimPanel() {
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;right:12px;bottom:12px;z-index:1000;background:rgba(0,0,0,.85);color:#ddd;' +
    'font:12px "Source Code Pro",monospace;padding:10px;border:1px solid #555;max-width:calc(100vw - 24px)';
  const steps = [1, 0.1, 0.01, 0.001];
  const row = (name) =>
    `<div style="margin:4px 0">${name} <b data-show="${name}"></b> s<br>` +
    steps.map((s) => `<button data-nudge="${name}" data-by="${-s}">-${s}</button>`).join('') +
    ' ' +
    steps.map((s) => `<button data-nudge="${name}" data-by="${s}">+${s}</button>`).join('') +
    '</div>';
  panel.innerHTML =
    row('start') +
    row('end') +
    '<canvas width="600" height="110" style="display:block;width:100%;max-width:600px;background:#111;margin:6px 0"></canvas>' +
    '<canvas data-timeline width="600" height="50" style="display:block;width:100%;max-width:600px;background:#111;' +
    'margin:6px 0;cursor:ew-resize;touch-action:none"></canvas>' +
    '<button data-toggle>pause</button> <span data-at></span> ' +
    '<button data-set="start">set start here</button><button data-set="end">set end here</button><br>' +
    '<button data-seam>hear the seam</button> <button data-restart>from the start</button><br>' +
    'lowpass at <span data-cutoff-show></span> Hz <label><input data-backwards type="checkbox"> backwards</label>' +
    '<div style="color:#888;margin-top:4px">space: pause/play · ←/→: step 0.01 s (shift: 0.1 s, alt: 0.001 s)</div>';
  panel.querySelectorAll('button').forEach((b) => (b.style.cssText = 'font:inherit;margin:1px;padding:2px 5px'));
  // Keep presses and keys here from steering the boat or opening a gate
  for (const type of ['pointerdown', 'mousedown', 'touchstart', 'click', 'keydown']) {
    panel.addEventListener(type, (event) => event.stopPropagation());
  }
  document.body.append(panel);

  const canvas = panel.querySelector('canvas');
  const timeline = panel.querySelector('[data-timeline]');
  const toggle = panel.querySelector('[data-toggle]');
  const shown = () => Math.max(60, loopEnd + 5); // How many seconds of the track the timeline covers
  const seamSide = 1; // Seconds of each side of the seam drawn

  function show() {
    panel.querySelector('[data-show="start"]').textContent = loopStart.toFixed(3);
    panel.querySelector('[data-show="end"]').textContent = loopEnd.toFixed(3);
    drawSeam();
  }

  // The last second of the loop on the left, running into its first second on the right, with the seam in red
  function drawSeam() {
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (!buffer) return;
    if (!loopBuffer) makeLoop();
    const rate = buffer.sampleRate;
    const data = loopBuffer.getChannelData(0); // The loop as it plays, crossfade and all
    const half = canvas.width / 2;
    const perPixel = (seamSide * rate) / half;
    const mid = canvas.height / 2;
    // Scaled up to fill the height, as the quiet parts would hardly show otherwise
    let peak = 0;
    const columns = [];
    for (let x = 0; x < canvas.width; x++) {
      const from = x < half ? data.length - seamSide * rate + x * perPixel : (x - half) * perPixel;
      let low = 0;
      let high = 0;
      for (let i = Math.floor(from); i < from + perPixel; i++) {
        const v = data[i] ?? 0;
        if (v < low) low = v;
        if (v > high) high = v;
      }
      columns.push([low, high]);
      peak = Math.max(peak, high, -low);
    }
    const fit = peak > 0 ? 0.95 / peak : 1;
    g.fillStyle = '#9cf';
    columns.forEach(([low, high], x) => g.fillRect(x, mid - high * fit * mid, 1, Math.max(1, (high - low) * fit * mid)));
    g.fillStyle = '#f44';
    g.fillRect(half, 0, 1, canvas.height);
  }

  panel.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.nudge === 'start') setLoop(loopStart + Number(button.dataset.by), loopEnd);
    if (button.dataset.nudge === 'end') setLoop(loopStart, loopEnd + Number(button.dataset.by));
    if ('seam' in button.dataset) play(Math.max(loopStart, loopEnd - 3));
    if ('restart' in button.dataset) play(loopStart);
    if ('toggle' in button.dataset) paused ? play(pausedAt) : pause();
    if (button.dataset.set === 'start' && position() !== null) setLoop(position(), loopEnd);
    if (button.dataset.set === 'end' && position() !== null) setLoop(loopStart, position());
    if (event.detail > 0) button.blur(); // So space and the arrows work straight after
    show();
  });

  // The keys work anywhere on the page while the panel's there (instead of steering the boat)
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.code === 'Space') paused ? play(pausedAt) : pause();
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const by = event.shiftKey ? 0.1 : event.altKey ? 0.001 : 0.01;
        if (!paused) pause();
        seek(position() + (event.key === 'ArrowLeft' ? -by : by));
      } else return;
      event.preventDefault();
      event.stopPropagation();
    },
    { capture: true },
  );

  // Clicking or dragging along the timeline goes to that point
  const timeAt = (event) => {
    const bounds = timeline.getBoundingClientRect();
    return ((event.clientX - bounds.left) / bounds.width) * shown();
  };
  let dragging = false;
  timeline.addEventListener('pointerdown', (event) => {
    dragging = true;
    timeline.setPointerCapture(event.pointerId);
    seek(timeAt(event));
  });
  timeline.addEventListener('pointermove', (event) => dragging && seek(timeAt(event)));
  timeline.addEventListener('pointerup', () => (dragging = false));

  // The track's first minute or so, with the loop shaded and where it's playing as a white line
  let overview = null;
  function drawTimeline() {
    const g = timeline.getContext('2d');
    const w = timeline.width;
    const h = timeline.height;
    g.clearRect(0, 0, w, h);
    if (buffer && (!overview || overview.seconds !== shown())) {
      const data = buffer.getChannelData(0);
      const perPixel = (shown() * buffer.sampleRate) / w;
      const peaks = [];
      for (let x = 0; x < w; x++) {
        let most = 0;
        for (let i = Math.floor(x * perPixel); i < (x + 1) * perPixel; i += 8) most = Math.max(most, Math.abs(data[i] ?? 0));
        peaks.push(most);
      }
      const top = Math.max(...peaks) || 1;
      overview = { seconds: shown(), peaks: peaks.map((p) => p / top) };
    }
    const toX = (t) => (t / shown()) * w;
    g.fillStyle = 'rgba(255,255,255,.08)';
    g.fillRect(toX(loopStart), 0, toX(loopEnd) - toX(loopStart), h);
    if (overview) {
      g.fillStyle = '#9cf';
      overview.peaks.forEach((p, x) => g.fillRect(x, h / 2 - (p * h) / 2, 1, Math.max(1, p * h)));
    }
    g.fillStyle = '#f44';
    g.fillRect(toX(loopStart), 0, 1, h);
    g.fillRect(toX(loopEnd), 0, 1, h);
    g.fillStyle = '#666';
    g.font = '10px monospace';
    for (let s = 10; s < shown(); s += 10) g.fillText(s, toX(s) + 2, 10);
    const now = position();
    if (now !== null) {
      g.fillStyle = '#fff';
      g.fillRect(toX(now), 0, 2, h);
    }
  }

  // Where the filter's sweep has got to, worked out the same way it's made
  const cutoffShow = panel.querySelector('[data-cutoff-show]');
  const cutoffNow = () => {
    if (!lowpass) return sweepLow;
    const through = (1 - Math.cos((2 * Math.PI * (lowpass.context.currentTime - sweepSince)) / sweepTime)) / 2;
    return Math.round(sweepLow * (sweepHigh / sweepLow) ** through);
  };

  const backwardsBox = panel.querySelector('[data-backwards]');
  backwardsBox.checked = backwards;
  backwardsBox.addEventListener('change', () => {
    const now = position(); // Where it is, worked out while it's still going the old way
    backwards = backwardsBox.checked;
    loopBuffer = null; // Made again, the other way round
    if (source) play(now); // ...carrying on from where it is
    else if (paused) pausedAt = now;
    backwardsBox.blur();
    show();
  });

  const at = panel.querySelector('[data-at]');
  (function tick() {
    const now = position();
    at.textContent = now === null ? 'press anywhere to start' : `at ${now.toFixed(3)} s`;
    toggle.textContent = paused ? 'play' : 'pause';
    cutoffShow.textContent = cutoffNow();
    drawTimeline();
    requestAnimationFrame(tick);
  })();

  // Draw the seam once the track's decoded
  const wait = setInterval(() => buffer && (clearInterval(wait), show()), 200);
  show();
}
