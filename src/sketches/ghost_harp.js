// A simulation of "Ghost Harp" (2019) for the installations page: 72 LED backlights, small white panels each with a
// black cap, hanging at different heights from a plate on the ceiling by copper wires, so that together they make a
// loose column. A note coming in as MIDI lights its panel for as long as it's held.
//
// Like the piece, it has two modes:
//   its own soundscape: a generative stream of notes, standing in for the Raspberry Pi running Sonic Pi (slow wandering
//     notes, a low drone, and every so often a quick, irregular flourish), which the visitor hears if the site's sound is on
//   a MIDI instrument: anything plugged in and sending MIDI (a keyboard, or a DAW), through the browser's Web MIDI
// Clicking or tapping a panel plays its note, in either. Dragging turns the column round. It turns slowly by itself.
//
// Each panel has a note: the lowest panel the lowest note, up to the highest (see noteOf()), so runs up the scale flow
// up the column.

import { startAudio, soundWanted, onSoundChange } from '../scripts/sound.js';

const count = 72;
const lowestNote = 24; // The lowest panel's note (C1). The 72 panels go up from there, a semitone each: six octaves.
const footprint = { wide: 0.34, deep: 0.24 }; // The plate on the ceiling the wires hang from, compared to the column's height
const panelSize = { wide: 0.03, tall: 0.07 }; // A panel, compared to the column's height
const capSize = { wide: 0.012, tall: 0.019 }; // ...and the black cap on top of it
const lowestPanel = 0.14; // How high the lowest panel hangs, as a share of the column's height
// The wooden box it hangs from, on the ceiling: half its width and depth, and its bottom and top, as shares of the
// column's height
const ceilingBox = { wide: 0.21, deep: 0.15, bottom: 1.05, top: 1.12 };
const turnSpeed = 0.06; // How quickly it turns by itself, in radians per second
const tilt = 0.18; // How far above it the view is, looking down a little
const fadeOn = 0.04; // How many seconds a panel takes to light...
const fadeOff = 0.18; // ...and to go out
const sway = 0.004; // How far the panels sway on their wires
const weightHeight = [0.03, 0.08]; // How high the fishing weights at the bottom of the strings hang, at the least and the most
const weightSize = 0.008; // How big they are, compared to the column's height
const length = 2; // How many times taller the column is than it is wide, compared to how it started out
// It's drawn by hand, as it were: wobbly pen lines, which boil (each one's drawn again a little differently, a few times
// a second, like a hand-drawn animation)
const boilRate = 8; // How many times a second the lines are drawn again
const wobble = 1.3; // How far a line strays, in pixels

// The soundscape (see compose())
const scale = [0, 2, 4, 7, 9]; // Major pentatonic, from the key note
const keys = [4, 9, 2, 7]; // The keys it moves through (E, A, D, G), one every keyLength seconds
const keyLength = 24;
const wanderEvery = [0.35, 1.4]; // How many seconds between its wandering notes, at the least and the most
const runEvery = [7, 16]; // ...and between its flourishes (see flourish())
const droneLength = 8; // How many seconds each low drone note lasts

const lerp = (a, b, t) => a + (b - a) * t;

// A fixed random number for each number, so the panels hang in the same places every time
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const figure = document.querySelector('.ghost-harp-sim');
if (figure) start(figure);

function start(figure) {
  const canvas = figure.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const modeLabel = figure.querySelector('.ghost-harp-mode');
  const midiButton = figure.querySelector('.ghost-harp-midi');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The panels, each on a wire of its own from a jittered grid on the plate, and hanging at a height of its own.
  // Sorted by height, so the lowest is the first, which is also the lowest note.
  const panels = Array.from({ length: count }, (_, i) => {
    const column = i % 9;
    const row = Math.floor(i / 9);
    return {
      x: ((column + 0.2 + hash(i) * 0.6) / 9 - 0.5) * footprint.wide,
      z: ((row + 0.2 + hash(i + 100) * 0.6) / 8 - 0.5) * footprint.deep,
      y: lerp(lowestPanel, 0.95, hash(i + 200)),
      facing: hash(i + 300) * Math.PI * 2,
      swayAt: hash(i + 400) * 100,
      light: 0, // How lit it is, from 0 to 1
      held: 0, // How many notes are holding it on
    };
  }).sort((a, b) => a.y - b.y);
  const noteOf = (panel) => lowestNote + panels.indexOf(panel);
  const panelOf = (note) => {
    let i = note - lowestNote;
    while (i < 0) i += 12; // Notes past either end go to the nearest octave that has a panel
    while (i >= count) i -= 12;
    return panels[i];
  };

  let w = 0;
  let h = 0;
  let density = 1;
  // Sized to the canvas's own box on the page (set in main.css), never to what's around it, which it'd only make bigger
  // each time. It's kept no taller than twice the window, in case its height's ever missing there.
  const fit = () => {
    density = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth;
    h = Math.min(canvas.clientHeight, innerHeight * 2);
    canvas.width = Math.round(w * density);
    canvas.height = Math.round(h * density);
  };
  fit();
  new ResizeObserver(fit).observe(canvas);

  // Where something in the column shows on the screen: x and z across the plate, y up from the floor, all as shares of
  // the column's height. The view turns round it, and looks down on it a little.
  let turned = 0.4;
  function project(x, y, z) {
    const across = x * Math.cos(turned) - z * Math.sin(turned);
    const toward = x * Math.sin(turned) + z * Math.cos(turned);
    const distance = 2.6 - toward;
    const scale = ((h / length) * 2.25) / distance; // As if the canvas were only as tall as it'd be for a column `length` times shorter
    // It's stretched `length` times taller, but its perspective isn't, or it'd look tipped much further back than it is
    const middleScale = ((h / length) * 2.25) / 2.6;
    const up = y - 0.57 - tilt * toward * 0.3;
    return { x: w / 2 + across * scale, y: h * 0.5 - up * 0.95 * (middleScale * length + (scale - middleScale)), scale, distance };
  }

  // Sound: each note played (see sound()), through an echo
  let audio = null;
  let out = null;
  function wireUp() {
    audio = startAudio() ?? audio;
    if (!audio || out) return;
    out = audio.createGain();
    out.gain.value = 0.5;
    const echo = audio.createDelay(1);
    echo.delayTime.value = 0.37;
    const feedback = audio.createGain();
    feedback.gain.value = 0.35;
    const wet = audio.createGain();
    wet.gain.value = 0.25;
    out.connect(audio.destination);
    out.connect(echo);
    echo.connect(feedback).connect(echo);
    echo.connect(wet).connect(audio.destination);
  }
  onSoundChange((on) => {
    if (on) wireUp();
  });

  // A note somewhere between a steel drum and a piano: a short thump, like a hammer or a stick, and then overtones tuned
  // the way a steel drum's are (the octave and the twelfth above it strongest), each fading on its own, the higher ones
  // sooner, through a filter that closes as it rings, so it darkens like a piano. Low notes ring longer than high ones.
  // Letting go of the note damps it, quickly but not at once.
  function sound(note, velocity, seconds) {
    if (!soundWanted()) return;
    if (!out) wireUp(); // (The page's sound may have been started by a press somewhere else on it)
    if (!audio || !out || audio.state !== 'running') return;
    const now = audio.currentTime;
    const frequency = 440 * Math.pow(2, (note - 69) / 12);
    const level = 0.11 * velocity * (note < 40 ? 0.85 : 1);
    const ring = lerp(2.6, 0.7, Math.min(1, Math.max(0, (note - 36) / 60))); // How long it rings, in seconds (as a time constant)
    const ends = now + seconds + ring * 4;

    const voice = audio.createGain();
    voice.gain.setValueAtTime(level, now);
    voice.gain.setTargetAtTime(0, now + seconds, Math.min(0.35, ring / 3)); // Damped when it's let go
    const tone = audio.createBiquadFilter();
    tone.type = 'lowpass';
    tone.Q.value = 0.5;
    tone.frequency.setValueAtTime(Math.min(16000, frequency * 14 + 2000 * velocity), now);
    tone.frequency.setTargetAtTime(Math.min(8000, frequency * 4 + 400), now + 0.02, ring * 0.35);
    tone.connect(voice).connect(out);

    // [how many times the note's frequency, how loud, how much sooner it fades than the note as a whole]
    const overtones = [[1, 1, 1], [1.002, 0.35, 1], [2, 0.55, 1.6], [3, 0.3, 2.4], [4.02, 0.12, 3.5], [5.4, 0.06, 5]];
    for (const [ratio, amount, sooner] of overtones) {
      if (frequency * ratio > 15000) continue;
      const osc = audio.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency * ratio;
      const gain = audio.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(amount, now + 0.003);
      gain.gain.setTargetAtTime(0, now + 0.003, ring / sooner);
      osc.connect(gain).connect(tone);
      osc.start(now);
      osc.stop(ends);
    }

    // The thump of the strike: a few milliseconds of filtered noise
    const length = Math.floor(audio.sampleRate * 0.03);
    const noise = audio.createBuffer(1, length, audio.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 4);
    const thump = audio.createBufferSource();
    thump.buffer = noise;
    const thumpTone = audio.createBiquadFilter();
    thumpTone.type = 'bandpass';
    thumpTone.frequency.value = Math.min(4000, frequency * 3);
    thumpTone.Q.value = 0.8;
    const thumpLevel = audio.createGain();
    thumpLevel.gain.value = 0.5 * velocity;
    thump.connect(thumpTone).connect(thumpLevel).connect(tone);
    thump.start(now);
  }


  // A note on lights its panel, and a note off lets it go out
  function noteOn(note, velocity = 0.8) {
    const panel = panelOf(note);
    panel.held++;
    panel.velocity = Math.max(0.35, velocity);
  }
  function noteOff(note) {
    const panel = panelOf(note);
    panel.held = Math.max(0, panel.held - 1);
  }
  // A note of its own, or a click: on, sounded, and off again after `seconds`
  function play(note, velocity, seconds) {
    noteOn(note, velocity);
    sound(note, velocity, seconds);
    setTimeout(() => noteOff(note), seconds * 1000);
  }

  // The soundscape, made up as it goes: which notes are due next
  let mode = 'soundscape';
  let clock = 0;
  let nextWander = 0;
  let nextRun = 4;
  let nextDrone = 0;
  let step = 10; // Where the wandering is, in steps of the scale from its lowest note
  function noteOfStep(stepAt, key) {
    const octave = Math.floor(stepAt / scale.length);
    return lowestNote + 12 + key + octave * 12 + scale[((stepAt % scale.length) + scale.length) % scale.length];
  }
  function compose(dt) {
    clock += dt;
    const key = keys[Math.floor(clock / keyLength) % keys.length];
    if (clock >= nextDrone) {
      nextDrone = clock + droneLength;
      play(lowestNote + 12 + key, 0.6, droneLength * 0.95);
    }
    if (clock >= nextWander) {
      nextWander = clock + lerp(wanderEvery[0], wanderEvery[1], Math.random());
      step = Math.max(3, Math.min(22, step + Math.round((Math.random() - 0.5) * 6)));
      play(noteOfStep(step, key), lerp(0.4, 0.9, Math.random()), lerp(0.4, 2.2, Math.random()));
      if (Math.random() < 0.25) play(noteOfStep(step + 2, key), 0.5, 1.5); // Sometimes a second note with it
    }
    if (clock >= nextRun) {
      nextRun = clock + lerp(runEvery[0], runEvery[1], Math.random());
      flourish(key);
    }
  }

  // Every so often, a quick flourish of notes. It's never just a run up the scale: it takes a shape (up and back down, a
  // zigzag, leaps, or a swirl round one note), and its timing hurries, slows down, or stumbles, with notes left out,
  // doubled up, or sounded together, and each one its own loudness and length.
  const shapes = {
    arch: (i, n) => Math.round(Math.sin((i / (n - 1)) * Math.PI) * lerp(5, 9, Math.random())),
    zigzag: (i) => Math.floor(i / 2) * 2 - (i % 2) * 3,
    leaps: (i) => Math.round((Math.random() - 0.35) * 10 + i * 0.6),
    swirl: (i) => Math.round(Math.sin(i * 1.7) * 3 + Math.sin(i * 0.6) * 2),
    fall: (i, n) => Math.round((n - i) * 0.8 + (Math.random() - 0.5) * 3),
  };
  const timings = [
    (t) => t, // Even
    (t) => t * t, // Hurrying
    (t) => Math.sqrt(t), // Slowing down
    (t) => t + Math.sin(t * 9) * 0.04, // Stumbling
  ];
  function flourish(key) {
    const names = Object.keys(shapes);
    const shape = shapes[names[Math.floor(Math.random() * names.length)]];
    const timing = timings[Math.floor(Math.random() * timings.length)];
    const from = Math.floor(lerp(3, 12, Math.random()));
    const count = Math.floor(lerp(7, 15, Math.random()));
    const seconds = count * lerp(0.08, 0.16, Math.random()); // How long the whole of it takes
    for (let i = 0; i < count; i++) {
      if (Math.random() < 0.15) continue; // Left out
      const at = timing(i / (count - 1)) * seconds + (Math.random() - 0.5) * 0.03;
      const note = noteOfStep(Math.max(0, from + shape(i, count)), key);
      const loud = lerp(0.3, 0.85, Math.random());
      const length = lerp(0.2, 1.2, Math.random() ** 2);
      setTimeout(() => {
        play(note, loud, length);
        if (Math.random() < 0.18) play(note + (Math.random() < 0.5 ? 7 : 12), loud * 0.6, length); // Sounded with a fifth or an octave
        if (Math.random() < 0.1) setTimeout(() => play(note, loud * 0.5, length * 0.5), 60); // Doubled up
      }, Math.max(0, at) * 1000);
    }
  }

  // A MIDI instrument, or a DAW, through the browser
  let midi = null;
  async function connectMidi() {
    if (!navigator.requestMIDIAccess) {
      modeLabel.textContent = "this browser can't take MIDI: try Chrome or Edge";
      return;
    }
    try {
      midi ??= await navigator.requestMIDIAccess();
    } catch {
      modeLabel.textContent = 'MIDI was not allowed';
      return;
    }
    const listen = () => {
      const inputs = [...midi.inputs.values()];
      inputs.forEach((input) => {
        input.onmidimessage = ({ data }) => {
          if (mode !== 'midi') return;
          const [status, note, velocity] = data;
          const kind = status & 0xf0;
          if (kind === 0x90 && velocity > 0) {
            noteOn(note, velocity / 127);
            sound(note, velocity / 127, 0.8);
          } else if (kind === 0x80 || (kind === 0x90 && velocity === 0)) noteOff(note);
        };
      });
      modeLabel.textContent = inputs.length ? `playing from ${inputs.map((input) => input.name).join(', ')}` : 'waiting for a MIDI instrument to be plugged in';
    };
    midi.onstatechange = listen;
    mode = 'midi';
    panels.forEach((panel) => (panel.held = 0));
    midiButton.textContent = 'back to its own soundscape';
    listen();
  }
  midiButton.addEventListener('click', () => {
    wireUp();
    if (mode === 'midi') {
      mode = 'soundscape';
      panels.forEach((panel) => (panel.held = 0));
      modeLabel.textContent = 'playing its own soundscape';
      midiButton.textContent = 'play it from a MIDI instrument';
    } else connectMidi();
  });

  // Dragging turns it, and a click (rather than a drag) on a panel plays its note
  let drag = null;
  canvas.addEventListener('pointerdown', (event) => {
    wireUp();
    drag = { x: event.clientX, turned, moved: 0 };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (drag) {
      drag.moved = Math.max(drag.moved, Math.abs(event.clientX - drag.x));
      turned = drag.turned + ((event.clientX - drag.x) / w) * Math.PI;
      return;
    }
    canvas.style.cursor = panelAt(event) ? 'pointer' : 'grab';
  });
  canvas.addEventListener('pointerup', (event) => {
    if (drag && drag.moved < 5) {
      const panel = panelAt(event);
      if (panel) play(noteOf(panel), 0.8, 0.9);
    }
    drag = null;
  });
  canvas.addEventListener('pointercancel', () => (drag = null));
  function panelAt(event) {
    const box = canvas.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    let best = null;
    for (const panel of panels) {
      if (!panel.box) continue;
      const { left, top, right, bottom, distance } = panel.box;
      if (x >= left - 4 && x <= right + 4 && y >= top - 4 && y <= bottom + 4 && (!best || distance < best.box.distance)) best = panel;
    }
    return best;
  }

  // Only runs while it's on the screen
  let showing = false;
  new IntersectionObserver(([entry]) => {
    showing = entry.isIntersecting;
    if (showing) requestAnimationFrame(draw);
  }).observe(figure);

  // The pen: a random number that stays the same until the drawing boils again, for each line and point on it
  let boil = 0;
  const jitter = (n) => (hash(boil * 977 + n) - 0.5) * 2 * wobble;
  // A wobbly line, in short pieces, each bent a little, and going a little past its ends, the way a quick pen does
  function penLine(x1, y1, x2, y2, seed) {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const pieces = Math.max(1, Math.round(length / 24));
    const across = { x: -(y2 - y1) / (length || 1), y: (x2 - x1) / (length || 1) };
    const over = Math.min(3, length * 0.06);
    const along = { x: (x2 - x1) / (length || 1), y: (y2 - y1) / (length || 1) };
    ctx.moveTo(x1 - along.x * over + jitter(seed), y1 - along.y * over + jitter(seed + 1));
    for (let i = 1; i <= pieces; i++) {
      const t = i / pieces;
      const bend = i < pieces ? jitter(seed + i * 7) : 0;
      const px = lerp(x1, x2, t) + across.x * bend + (i === pieces ? along.x * over : 0);
      const py = lerp(y1, y2, t) + across.y * bend + (i === pieces ? along.y * over : 0);
      ctx.lineTo(px + jitter(seed + i * 13) * 0.3, py + jitter(seed + i * 17) * 0.3);
    }
  }
  // A rectangle, drawn as four separate strokes that don't quite meet
  function penRect(left, top, wide, tall, seed) {
    penLine(left, top, left + wide, top, seed);
    penLine(left + wide, top, left + wide, top + tall, seed + 50);
    penLine(left + wide, top + tall, left, top + tall, seed + 100);
    penLine(left, top + tall, left, top, seed + 150);
  }
  // The same, filled in roughly, its corners each a little off
  function penFill(left, top, wide, tall, seed) {
    ctx.beginPath();
    ctx.moveTo(left + jitter(seed), top + jitter(seed + 1));
    ctx.lineTo(left + wide + jitter(seed + 2), top + jitter(seed + 3));
    ctx.lineTo(left + wide + jitter(seed + 4), top + tall + jitter(seed + 5));
    ctx.lineTo(left + jitter(seed + 6), top + tall + jitter(seed + 7));
    ctx.closePath();
    ctx.fill();
  }

  // A wooden box, drawn by hand as a thin white outline: all twelve of its edges, the ones at the back too, so it's seen
  // through like a wireframe
  function drawBox({ wide, deep, bottom, top }, seed) {
    const corner = (sx, y, sz) => project(sx * wide, y, sz * deep);
    const edges = [];
    for (const y of [bottom, top]) {
      edges.push([[-1, y, -1], [1, y, -1]], [[1, y, -1], [1, y, 1]], [[1, y, 1], [-1, y, 1]], [[-1, y, 1], [-1, y, -1]]);
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) edges.push([[sx, bottom, sz], [sx, top, sz]]);
    ctx.lineWidth = 0.6;
    edges.forEach(([from, to], i) => {
      const a = corner(...from);
      const b = corner(...to);
      // The edges at the back, fainter, so it's clear which side is the front
      const back = (from[0] + to[0]) * Math.sin(turned) + (from[2] + to[2]) * Math.cos(turned) < -0.01;
      ctx.strokeStyle = `rgba(255,255,255,${back ? 0.35 : 0.8})`;
      ctx.beginPath();
      penLine(a.x, a.y, b.x, b.y, seed + i * 37);
      ctx.stroke();
    });
  }


  let last = null;
  let seconds = 0;
  function draw(now) {
    if (!showing) {
      last = null;
      return;
    }
    requestAnimationFrame(draw);
    const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000);
    last = now;
    seconds += dt;
    if (!drag && !calm) turned += turnSpeed * dt;
    boil = calm ? 0 : Math.floor(seconds * boilRate);
    if (mode === 'soundscape') compose(dt);

    // Each panel fades toward on or off
    let glow = 0;
    for (const panel of panels) {
      const target = panel.held > 0 ? panel.velocity ?? 0.8 : 0;
      panel.light += (target - panel.light) * (1 - Math.exp(-dt / (target > panel.light ? fadeOn : fadeOff)));
      glow += panel.light;
    }

    ctx.setTransform(density, 0, 0, density, 0, 0);
    ctx.fillStyle = '#060606';
    ctx.fillRect(0, 0, w, h);
    // The lit panels light up the room around them a little
    const room = ctx.createRadialGradient(w / 2, h * 0.5, 0, w / 2, h * 0.5, Math.max(w, h) * 0.6);
    room.addColorStop(0, `rgba(170,175,185,${Math.min(0.22, glow * 0.02)})`);
    room.addColorStop(1, 'rgba(170,175,185,0)');
    ctx.fillStyle = room;
    ctx.fillRect(0, 0, w, h);

    // Furthest first
    const placed = panels.map((panel) => {
      const swayX = calm ? 0 : Math.sin(seconds * 0.7 + panel.swayAt) * sway;
      const swayZ = calm ? 0 : Math.cos(seconds * 0.5 + panel.swayAt) * sway;
      return { panel, x: panel.x + swayX, z: panel.z + swayZ, depth: project(panel.x, panel.y, panel.z).distance };
    }).sort((a, b) => b.depth - a.depth);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    placed.forEach(({ panel, x, z }, n) => {
      const seed = panels.indexOf(panel) * 1000;
      const top = project(panel.x, ceilingBox.bottom, panel.z); // Where its wire comes out of the box on the ceiling
      const cap = project(x, panel.y + panelSize.tall / 2 + capSize.tall, z);
      const middle = project(x, panel.y, z);
      const light = panel.light;

      // Its wire, copper, a faint pen line in the dark
      ctx.strokeStyle = `rgba(165,120,90,${0.28 + light * 0.3})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      penLine(top.x, top.y, cap.x, cap.y, seed);
      ctx.stroke();
      // ...and a thin white string from its bottom down to a little fishing weight, which keeps it hanging straight
      const below = project(x, panel.y - panelSize.tall / 2, z);
      const weight = project(lerp(panel.x, x, 0.5), lerp(weightHeight[0], weightHeight[1], hash(panels.indexOf(panel) + 500)), lerp(panel.z, z, 0.5));
      const size = weightSize * weight.scale;
      ctx.strokeStyle = `rgba(255,255,255,${0.22 + light * 0.2})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      penLine(below.x, below.y, weight.x, weight.y, seed + 900);
      ctx.stroke();
      // The weight: a teardrop, its point at the top where the string's tied
      ctx.beginPath();
      ctx.moveTo(weight.x + jitter(seed + 950) * 0.3, weight.y);
      ctx.bezierCurveTo(weight.x + size * 0.9 + jitter(seed + 951) * 0.4, weight.y + size * 0.7, weight.x + size * 0.7, weight.y + size * 1.7 + jitter(seed + 952) * 0.4, weight.x, weight.y + size * 1.7);
      ctx.bezierCurveTo(weight.x - size * 0.7, weight.y + size * 1.7 + jitter(seed + 953) * 0.4, weight.x - size * 0.9 + jitter(seed + 954) * 0.4, weight.y + size * 0.7, weight.x, weight.y);
      ctx.fillStyle = '#3a3a3c';
      ctx.fill();
      ctx.strokeStyle = 'rgba(210,210,215,0.75)';
      ctx.lineWidth = 0.7;
      ctx.stroke();

      // The panel, narrower the more it's turned edge on
      const edgeOn = Math.max(0.12, Math.abs(Math.cos(panel.facing - turned)));
      const wide = panelSize.wide * middle.scale * edgeOn;
      const tall = panelSize.tall * middle.scale;
      const left = middle.x - wide / 2;
      const topEdge = middle.y - tall / 2;
      panel.box = { left, top: topEdge, right: left + wide, bottom: topEdge + tall, distance: middle.distance };

      // Lit, it's filled in white, glowing; unlit, it's just an outline, with a little hatching
      if (light > 0.02) {
        ctx.save();
        ctx.shadowColor = `rgba(235,240,255,${light})`;
        ctx.shadowBlur = 30 * light;
        ctx.fillStyle = `rgba(250,250,255,${light})`;
        penFill(left, topEdge, wide, tall, seed + 300);
        ctx.restore();
      }
      ctx.strokeStyle = `rgba(${lerp(150, 255, light)},${lerp(150, 255, light)},${lerp(155, 255, light)},${lerp(0.75, 1, light)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      penRect(left, topEdge, wide, tall, seed + 400);
      if (light < 0.5 && wide > 5) {
        // Two or three strokes of hatching, slanting across it
        for (let k = 1; k <= 2; k++) {
          const y = topEdge + (tall * k) / 3;
          penLine(left + wide * 0.2, y + wide * 0.3, left + wide * 0.8, y - wide * 0.3, seed + 500 + k * 20);
        }
      }
      ctx.stroke();

      // Its cap, scribbled in, a little narrower
      const capWide = capSize.wide * middle.scale * Math.max(0.5, edgeOn);
      const capTall = capSize.tall * middle.scale;
      const capLeft = middle.x - capWide / 2;
      const capTop = topEdge - capTall;
      ctx.fillStyle = '#000';
      penFill(capLeft, capTop, capWide, capTall, seed + 600);
      ctx.strokeStyle = 'rgba(150,150,155,0.8)';
      ctx.beginPath();
      penRect(capLeft, capTop, capWide, capTall, seed + 700);
      for (let k = 0; k < 3; k++) {
        const y = capTop + (capTall * (k + 0.5)) / 3;
        penLine(capLeft, y, capLeft + capWide, y + capTall * 0.15, seed + 800 + k * 20);
      }
      ctx.stroke();
    });
    drawBox(ceilingBox, 95000); // Over the tops of the wires that come out of it
  }
}
