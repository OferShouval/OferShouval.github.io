// The sound sandbox: makes patches for src/scripts/patch.js by ear. Every slider changes the patch as it's played,
// sounds dropped on the page become sample layers, and "save" writes the patch into src/sounds/patches/<section> (and
// any dropped sounds into the section's sound folder), through tools/sound-sandbox/dev-server.js. It shows the main
// controls, or all of them.
import { instrument, complete, blankPatch, layerDefaults, provideBuffer, loadBuffer } from '../../src/scripts/patch.js';
import { sections as siteSections, sectionOf, soundSection } from './sections.js';
import { makeScene } from './scene.js';
import { makeTracks } from './tracks.js';

const $ = (id) => document.getElementById(id);

// Browser storage, for remembering where things were left: only ever a nice-to-have
function remembered(key, otherwise) {
  try {
    return JSON.parse(localStorage.getItem('soundSandbox.' + key)) ?? otherwise;
  } catch {
    return otherwise;
  }
}
function remember(key, value) {
  try {
    localStorage.setItem('soundSandbox.' + key, JSON.stringify(value));
  } catch {}
}

// Sound: the instrument into a master volume, watched by the scope
const audio = new AudioContext();
const master = audio.createGain();
const analyser = audio.createAnalyser();
analyser.fftSize = 2048;
master.connect(analyser).connect(audio.destination);
const wake = () => audio.state !== 'running' && audio.resume();
document.addEventListener('pointerdown', wake, true);
// The master volume: everything the sandbox plays (remembered for next time)
function setMasterVolume(level) {
  master.gain.setTargetAtTime(level, audio.currentTime, 0.02);
  $('master-volume').value = level;
  $('master-volume-value').textContent = Math.round(level * 100) + '%';
}
setMasterVolume(remembered('masterVolume', 1));
$('master-volume').addEventListener('input', () => {
  setMasterVolume(+$('master-volume').value);
  remember('masterVolume', +$('master-volume').value);
});
$('master-volume').addEventListener('change', () => $('master-volume').blur()); // So the computer's keys play notes again
document.addEventListener('keydown', wake, true);

// Whether the sandbox's sound is on, and whether the keys are coming here (not to the page in the preview)
function showSoundState() {
  const button = $('sound-state');
  const inPage = document.activeElement === $('preview-frame');
  const on = audio.state === 'running' && !inPage;
  button.classList.toggle('on', on);
  button.textContent = inPage ? 'keys are going to the page: click here' : on ? 'sound on' : 'sound: click to start';
}
audio.addEventListener('statechange', showSoundState);
addEventListener('blur', () => setTimeout(showSoundState)); // (Clicking into the preview takes the keys there)
addEventListener('focus', showSoundState);
$('sound-state').addEventListener('click', () => {
  $('sound-state').focus();
  wake();
  synth.play(69, 0.8, 0.4); // A test note, to hear that it's working
  showSoundState();
});

let patch = complete(blankPatch);
const synth = instrument(audio, patch, master, { follow: false });
let library = { sounds: [], patches: [], pages: {} };
let section = sectionOf(remembered('section', 'landing')) ? remembered('section', 'landing') : 'landing'; // The section being worked on
let tracks = null; // The scene's tracks, once they're made (see tracks.js)
let selectedTrack = null; // The track whose synth or sampler is open in the controls, if one is
let currentFile = null; // The saved patch file it was loaded from, if any, like 'art/ghost-harp.json'
let savedJSON = ''; // What it was when it was last loaded or saved, to tell if it's changed since
let savedName = null; // Its name in its saved file: what pages playing it know it by (see `follow` in patch.js)
const localFiles = new Map(); // 'local:...' src -> the File dropped on the page, until it's saved into the project
const live = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('sound-sandbox') : null; // To pages playing the patch

// Each section's colour, so it's plain at a glance which one's open
const sectionColours = { landing: '#7fd1c7', music: '#f2b45c', art: '#ee93d2', bio: '#9fb7ff', teaching: '#b6e37a', shared: '#bdbdbd' };
// (A track's own sound that isn't saved as a patch is kept with the track, so there's nothing to say about it)
const unsaved = () => (selectedTrack && !currentFile ? false : JSON.stringify(patch) !== savedJSON && !(savedJSON === '' && JSON.stringify(patch) === JSON.stringify(complete(blankPatch))));

// --- What the controls are ---------------------------------------------------------------------------------------
// [path, label, min, max, scale, extra]: scale is 'lin', 'log', 'cube' (fine near the bottom, for short times) or
// 'int'. In extra: `basic` puts it among the main controls (the rest show with "all controls"); `when` shows it only
// when it matters (given the layer or patch); `options` makes it a menu, `check` a checkbox, `auto` lets 0 mean
// "automatic" (shown empty); `unit` is said when it's pointed at.
const noteNamesPlain = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const sections = [
  {
    title: 'note',
    controls: [
      ['level', 'volume', 0, 1, 'lin', { basic: true }],
      ['attack', 'fade in', 0.001, 4, 'log', { basic: true, unit: 'seconds to come in' }],
      ['release', 'fade out', 0.005, 4, 'log', { basic: true, unit: 'seconds to go, once a note is let go' }],
      ['spread', 'variation', 0, 3, 'lin', { basic: true, unit: 'each note a little higher or lower, at random (semitones)' }],
      ['ring.low', 'length (low)', 0.05, 10, 'log', { unit: 'seconds a low note rings, for layers that go by it' }],
      ['ring.high', 'length (high)', 0.05, 10, 'log', { unit: 'seconds a high note rings, for layers that go by it' }],
    ],
  },
  {
    title: 'notes',
    hint: 'The notes rain falls on, and the note "one long note" plays (the lowest).',
    controls: [
      ['range.low', 'lowest', 24, 108, 'int', { basic: true, note: true }],
      ['range.high', 'highest', 24, 108, 'int', { basic: true, note: true }],
      ['range.scale', 'notes on', 0, 0, 'lin', { basic: true, options: ['any', 'pentatonic', 'major', 'chromatic'], labels: ['any pitch at all', 'a pentatonic scale', 'a major scale', 'every semitone'] }],
      ['range.key', 'in the key of', 0, 0, 'lin', { options: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'], labels: noteNamesPlain, number: true, when: (p) => p.range.scale !== 'any' }],
    ],
  },
  {
    title: 'filter',
    controls: [
      ['filter.shift', 'brightness', -36, 36, 'lin', { basic: true, unit: 'darker or brighter (semitones)' }],
      ['filter.sway.depth', 'breathing', 0, 24, 'lin', { basic: true, unit: 'how far the brightness drifts up and down, slowly (semitones)' }],
      ['filter.sway.rate', 'breathing speed', 0.01, 4, 'log', { unit: 'breaths a second' }],
      ['filter.type', 'type', 0, 0, 'lin', { options: ['lowpass', 'highpass', 'bandpass', 'notch', 'peaking'] }],
      ['filter.q', 'resonance', 0.1, 20, 'log'],
      ['filter.start.ratio', 'opens at ×', 0, 40, 'lin', { unit: 'times the note, as it starts' }],
      ['filter.start.add', 'opens at +', 0, 8000, 'lin', { unit: 'Hz, as it starts' }],
      ['filter.start.velocity', 'harder = brighter', 0, 8000, 'lin', { unit: 'Hz more, at full velocity' }],
      ['filter.end.ratio', 'closes to ×', 0, 40, 'lin', { unit: 'times the note' }],
      ['filter.end.add', 'closes to +', 0, 8000, 'lin', { unit: 'Hz' }],
      ['filter.delay', 'waits', 0, 1, 'lin', { unit: 'seconds before it closes' }],
      ['filter.time', 'closes over', 0.01, 3, 'log', { unit: 'times the length' }],
    ],
  },
  {
    title: 'wobble',
    controls: [
      ['wobble.depth', 'wobble', 0, 60, 'lin', { unit: 'pitch wavering (cents)' }],
      ['wobble.rate', 'wobble speed', 0.1, 14, 'log', { unit: 'times a second' }],
    ],
  },
  {
    title: 'echo',
    controls: [
      ['echo.wet', 'echo', 0, 1, 'lin', { basic: true, unit: 'how much echo' }],
      ['echo.feedback', 'repeats', 0, 0.95, 'lin', { unit: 'how long the echo goes on' }],
      ['echo.time', 'gap', 0.01, 2, 'log', { unit: 'seconds between echoes' }],
      ['out', 'output', 0, 1, 'lin', { unit: 'after the echo' }],
    ],
  },
];
// The main controls gather into one card, in this order (with the notes in a card of their own)
const simpleOrder = ['level', 'filter.shift', 'echo.wet', 'attack', 'release', 'spread', 'filter.sway.depth'];

// Whether a wave layer keeps going while its note's held (rather than dying away), and the same for a whole patch: a
// patch with anything in it that keeps going is a background, played as one long note
function keepsGoing(layer) {
  if (layer.kind === 'noise') return !!layer.hold;
  if (layer.kind === 'sample') return !!layer.loop;
  return layer.sustain > 0 || (!(layer.fade > 0) && !(layer.decay > 0));
}
const isBackground = (p) => p.layers.some((layer) => !layer.off && layer.level > 0 && keepsGoing(layer));

const layerControls = {
  osc: [
    ['wave', 'wave', 0, 0, 'lin', { basic: true, options: ['sine', 'triangle', 'square', 'sawtooth'], labels: ['sine (pure)', 'triangle (soft)', 'square (hollow)', 'sawtooth (bright)'] }],
    ['ratio', 'pitch', 0.25, 12, 'log', { basic: true, unit: 'times the note (2 = an octave up)' }],
    ['level', 'volume', 0, 1, 'lin', { basic: true }],
    ['glide', 'slide', -36, 36, 'lin', { basic: true, unit: 'semitones up or down, as it starts' }],
    ['sustain', 'keeps going', 0, 0, 'lin', { basic: true, keepsGoing: true }],
    ['decay', 'length', 0, 3, 'cube', { basic: true, auto: true, unit: 'seconds it dies away over (empty: by the note, see "length (low)")', when: (l) => !keepsGoing(l) }],
    ['detune', 'detune', -100, 100, 'lin', { unit: 'cents' }],
    ['glideTime', 'slide time', 0.002, 2, 'log', { unit: 'seconds the slide takes' }],
    ['fade', 'fades sooner', 0, 10, 'lin', { unit: 'times sooner than the note\'s length (if it has no length of its own)', when: (l) => !keepsGoing(l) && !(l.decay > 0) }],
    ['sustain', 'holds at', 0, 1, 'lin', { unit: 'share of its volume it stays at, while held', when: keepsGoing }],
  ],
  noise: [
    ['hold', 'keeps going', 0, 0, 'lin', { basic: true, check: true }],
    ['color', 'colour', 0, 0, 'lin', { basic: true, options: ['white', 'pink', 'brown'], labels: ['white (hiss)', 'pink (rain, wind)', 'brown (water, rumble)'], when: (l) => l.hold }],
    ['ratio', 'pitch', 0.25, 100, 'log', { basic: true, unit: 'times the note' }],
    ['level', 'volume', 0, 1, 'lin', { basic: true }],
    ['length', 'length', 0.002, 1, 'log', { basic: true, unit: 'seconds', when: (l) => !l.hold }],
    ['q', 'focus', 0.1, 15, 'log', { unit: 'low: broad; high: a narrow, whistling band' }],
    ['curve', 'tail', 0.3, 10, 'log', { unit: 'how quickly it dies away', when: (l) => !l.hold }],
  ],
  sample: [
    ['src', 'sounds', 0, 0, 'lin', { basic: true, sound: true }],
    ['level', 'volume', 0, 2, 'lin', { basic: true }],
    ['tune', 'tune', -24, 24, 'lin', { basic: true, unit: 'semitones' }],
    ['follow', 'follows notes', 0, 0, 'lin', { basic: true, check: true, unit: 'played higher for higher notes' }],
    ['loop', 'loops', 0, 0, 'lin', { basic: true, check: true }],
    ['root', 'its own note', 24, 96, 'int', { note: true, unit: 'the note it sounds as it is', when: (l) => l.follow }],
    ['start', 'starts at', 0, 5, 'lin', { unit: 'seconds in' }],
    ['decay', 'length', 0, 3, 'cube', { auto: true, unit: 'seconds it dies away over (empty: plays out)' }],
    ['fade', 'fades sooner', 0, 10, 'lin', { unit: 'times sooner than the note\'s length', when: (l) => !(l.decay > 0) }],
    ['sustain', 'holds at', 0, 1, 'lin', { unit: 'share of its volume it stays at, while held' }],
    ['reverse', 'reverse', 0, 0, 'lin', { check: true }],
  ],
};

const kindNames = { osc: 'wave', noise: 'noise', sample: 'sample' };
const noteNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const noteName = (n) => noteNames[n % 12] + (Math.floor(n / 12) - 1);

const getPath = (object, path) => path.split('.').reduce((o, key) => o?.[key], object);
function setPath(object, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, key) => o[key], object)[last] = value;
}

function format(value) {
  const size = Math.abs(value);
  if (size >= 100) return value.toFixed(0);
  if (size >= 10) return value.toFixed(1);
  if (size >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

// A slider's 0-1000 position <-> its value
function toValue(position, min, max, scale) {
  const t = position / 1000;
  if (scale === 'log') return min * Math.pow(max / min, t);
  if (scale === 'cube') return min + (max - min) * t * t * t;
  const value = min + (max - min) * t;
  return scale === 'int' ? Math.round(value) : value;
}
function toPosition(value, min, max, scale) {
  const t =
    scale === 'log'
      ? Math.log(Math.max(min, value) / min) / Math.log(max / min)
      : scale === 'cube'
        ? Math.cbrt(Math.max(0, (value - min) / (max - min)))
        : (value - min) / (max - min);
  return Math.round(Math.min(1, Math.max(0, t)) * 1000);
}

// --- Building the controls ----------------------------------------------------------------------------------------
function soundOptions(select, current) {
  select.innerHTML = '';
  select.append(new Option('(choose a sound)', ''));
  // A group for each folder, this section's first
  const groups = new Map();
  const ours = (src) => soundSection(src) === section;
  const sounds = [...library.sounds].sort((a, b) => ours(b) - ours(a));
  for (const src of sounds) {
    const folder = src.split('/').slice(2, -1).join('/') || 'sounds';
    if (!groups.has(folder)) {
      const group = document.createElement('optgroup');
      group.label = ours(src) ? `${folder} (this section)` : folder;
      groups.set(folder, group);
    }
    groups.get(folder).append(new Option(src.split('/').pop(), src));
  }
  if (localFiles.size) {
    const dropped = document.createElement('optgroup');
    dropped.label = 'dropped (not saved yet)';
    for (const [src, file] of localFiles) dropped.append(new Option(file.name, src));
    select.append(dropped);
  }
  for (const group of groups.values()) select.append(group);
  if (current && ![...select.options].some((o) => o.value === current)) {
    select.append(new Option(current.split('/').pop() + ' (missing)', current)); // Somewhere it can't be found
    select.classList.add('missing');
  }
  select.value = current ?? '';
  if (select.value !== (current ?? '')) select.value = '';
}

function control(target, [path, label, min, max, scale, extra = {}]) {
  const row = document.createElement('div');
  row.className = 'row';
  const name = document.createElement('label');
  name.textContent = label;
  name.title = extra.unit ? `${label}: ${extra.unit}` : label;
  row.append(name);
  const value = getPath(target, path);

  if (extra.sound) return soundList(target, row);
  if (extra.keepsGoing) {
    // A wave keeping going for as long as its note's held, or dying away over its length
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = keepsGoing(target);
    box.title = 'On: it keeps going while the note is held. Off: it dies away over its length.';
    box.onchange = () => {
      if (box.checked) target.sustain = 1;
      else {
        target.sustain = 0;
        if (!(target.fade > 0) && !(target.decay > 0)) target.decay = 0.3; // So it does die away
      }
      changed();
      render(); // (Its length shows only when it doesn't keep going)
    };
    row.append(box, document.createElement('span'));
    return row;
  }
  if (extra.options) {
    const select = document.createElement('select');
    extra.options.forEach((option, i) => select.append(new Option(extra.labels?.[i] ?? option, option)));
    select.value = String(value);
    select.onchange = () => {
      setPath(target, path, extra.number ? +select.value : select.value);
      select.blur(); // So the computer's keys play notes again, rather than choose from it
      changed();
      render(); // (Other controls can show or hide with it)
    };
    row.classList.add('wide');
    row.append(select);
    return row;
  }
  if (extra.check) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!value;
    box.onchange = () => {
      setPath(target, path, box.checked);
      changed();
      render(); // (Other controls can show or hide with it)
    };
    row.append(box, document.createElement('span'));
    return row;
  }

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = 0;
  slider.max = 1000;
  slider.value = toPosition(value, min, max, scale);
  slider.title = name.title;
  const number = document.createElement('input');
  number.type = 'number';
  number.step = scale === 'int' ? 1 : 'any';
  const show = (v) => {
    if (extra.auto && !(v > 0)) {
      number.value = '';
      number.placeholder = 'auto';
    } else number.value = scale === 'int' ? v : format(v);
    if (extra.note) {
      number.title = noteName(v);
      name.textContent = `${label} (${noteName(v)})`;
    }
  };
  show(value);
  slider.oninput = () => {
    const v = toValue(+slider.value, min, max, scale);
    setPath(target, path, extra.auto && v < 0.001 ? 0 : v); // (The very bottom of an `auto` one is automatic)
    show(getPath(target, path));
    changed();
  };
  number.onchange = () => {
    const v = extra.auto && number.value.trim() === '' ? 0 : +number.value;
    if (!Number.isFinite(v)) return show(getPath(target, path));
    setPath(target, path, v); // Typed values can go past the slider's ends
    slider.value = toPosition(v, min, max, scale);
    changed();
  };
  slider.ondblclick = () => number.select();
  row.append(slider, number);
  return row;
}

// A sample layer's sounds: one, or several, each note picking one of them at random. `src` is kept a plain string
// when there's one, and a list when there are more.
const srcsOf = (layer) => [].concat(layer.src).filter(Boolean);
const nameOf = (src) => localFiles.get(src)?.name ?? src.split('/').pop();
function setSrcs(layer, srcs) {
  layer.src = srcs.length > 1 ? srcs : (srcs[0] ?? '');
  changed();
  render();
}
// The other sounds in the same folder named like it, but for the number (drip01 -> drip02, drip03...)
function siblingsOf(src) {
  const folder = src.slice(0, src.lastIndexOf('/') + 1);
  const stem = (file) => file.slice(folder.length).replace(/[-_ ]?\d*\.\w+$/, '');
  return library.sounds.filter((other) => other !== src && other.startsWith(folder) && !other.slice(folder.length).includes('/') && stem(other) === stem(src));
}
function soundList(layer, row) {
  row.classList.add('wide', 'sounds-row');
  const holder = document.createElement('div');
  holder.className = 'sound-list';
  const srcs = srcsOf(layer);
  for (const src of srcs) {
    const chip = document.createElement('span');
    chip.className = 'chip' + (src.startsWith('local:') || library.sounds.includes(src) ? '' : ' missing');
    chip.textContent = nameOf(src);
    chip.title = src.startsWith('local:') ? 'dropped here, saved into the project with the patch' : src;
    const remove = document.createElement('button');
    remove.textContent = '✕';
    remove.title = 'Take it out';
    remove.onclick = () => setSrcs(layer, srcs.filter((s) => s !== src));
    chip.append(remove);
    holder.append(chip);
  }
  const add = document.createElement('select');
  soundOptions(add, '');
  add.options[0].text = srcs.length ? '+ another sound…' : '(choose a sound)';
  add.onchange = () => {
    if (add.value && !srcs.includes(add.value)) setSrcs(layer, [...srcs, add.value]);
    add.blur(); // So the computer's keys play notes again, rather than choose from it
  };
  holder.append(add);
  const more = [...new Set(srcs.flatMap(siblingsOf))].filter((s) => !srcs.includes(s));
  if (more.length) {
    const all = document.createElement('button');
    all.textContent = `+ the ${more.length} like ${srcs.length === 1 ? 'it' : 'them'}`;
    all.title = more.map((s) => s.split('/').pop()).join(', ');
    all.onclick = () => setSrcs(layer, [...srcs, ...more].sort());
    holder.append(all);
  }
  if (srcs.length > 1) {
    const note = document.createElement('span');
    note.className = 'hint';
    note.textContent = 'each note picks one at random';
    holder.append(note);
  }
  row.append(holder);
  return row;
}

// Folding: each layer and section can fold down to its title, to see more at once. The sections stay folded
// next time; the layers only for as long as the page is open.
const foldedSections = remembered('foldedSections', {});
const foldedLayers = new WeakSet();
function folder(folded, toggle) {
  const button = document.createElement('button');
  button.className = 'fold';
  button.textContent = folded ? '▸' : '▾';
  button.title = folded ? 'Open it' : 'Fold it up';
  button.setAttribute('aria-expanded', String(!folded));
  button.onclick = (event) => {
    event.stopPropagation();
    toggle();
    render();
  };
  return button;
}
function foldAll(fold) {
  for (const layer of patch.layers) fold ? foldedLayers.add(layer) : foldedLayers.delete(layer);
  for (const title of cardTitles) foldedSections[title] = fold;
  remember('foldedSections', foldedSections);
  render();
}

// Main controls, or all of them
let controlsMode = remembered('controls', 'simple') === 'all' ? 'all' : 'simple';
const shown = (c, target) => (controlsMode === 'all' || c[5]?.basic) && (!c[5]?.when || c[5].when(target));
function setControlsMode(mode) {
  controlsMode = mode;
  remember('controls', mode);
  document.body.classList.toggle('simple', mode === 'simple');
  $('mode-simple').setAttribute('aria-pressed', String(mode === 'simple'));
  $('mode-all').setAttribute('aria-pressed', String(mode === 'all'));
  render();
}
$('mode-simple').onclick = () => setControlsMode('simple');
$('mode-all').onclick = () => setControlsMode('all');

// A card of the patch's own controls, folding down to its title
let cardTitles = []; // The cards as they're shown, for folding them all
function patchCard(title, controls, hint) {
  const card = document.createElement('div');
  const folded = !!foldedSections[title];
  card.className = 'card' + (folded ? ' folded' : '');
  const heading = document.createElement('h2');
  heading.className = 'foldable';
  const flip = () => {
    foldedSections[title] = !folded;
    remember('foldedSections', foldedSections);
  };
  heading.append(folder(folded, flip), title);
  heading.onclick = () => {
    flip();
    render();
  };
  const holder = document.createElement('div');
  holder.className = 'controls';
  for (const c of controls) holder.append(control(patch, c));
  card.append(heading, holder);
  if (hint) {
    const note = document.createElement('p');
    note.className = 'hint card-hint';
    note.textContent = hint;
    card.append(note);
  }
  cardTitles.push(title);
  return card;
}

function layerTitle(layer) {
  if (layer.kind === 'osc') return `${layer.wave} × ${format(layer.ratio)}`;
  if (layer.kind === 'noise') return layer.hold ? `${layer.color} noise, keeps going` : `${Math.round(layer.length * 1000)} ms thump`;
  const srcs = srcsOf(layer);
  if (!srcs.length) return 'no sound yet';
  if (srcs.length === 1) return nameOf(srcs[0]);
  return `${srcs.length} sounds, one at random (${nameOf(srcs[0])}…)`;
}

function render() {
  $('patch-name').value = patch.name;

  const layers = $('layers');
  layers.innerHTML = '';
  patch.layers.forEach((layer, index) => {
    const card = document.createElement('div');
    const folded = foldedLayers.has(layer);
    card.className = 'card' + (layer.off ? ' off' : '') + (folded ? ' folded' : '');
    const head = document.createElement('div');
    head.className = 'card-head';
    const kind = document.createElement('span');
    kind.className = 'kind';
    kind.textContent = kindNames[layer.kind];
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = layerTitle(layer);
    const spacer = document.createElement('span');
    spacer.className = 'spacer';
    const button = (text, tip, action) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.title = tip;
      b.onclick = () => {
        action();
        changed();
        render();
      };
      return b;
    };
    head.append(
      folder(folded, () => (folded ? foldedLayers.delete(layer) : foldedLayers.add(layer))),
      kind,
      title,
      spacer,
      button(layer.off ? 'off' : 'on', 'Switch this layer on or off', () => (layer.off = !layer.off)),
      button('solo', 'Switch every other layer off (press again to bring them all back)', () => {
        const alone = patch.layers.every((l) => (l === layer) === !l.off);
        for (const l of patch.layers) l.off = alone ? false : l !== layer;
      }),
      button('copy', 'Duplicate this layer', () => patch.layers.splice(index + 1, 0, structuredClone(layer))),
      button('✕', 'Remove this layer', () => patch.layers.splice(index, 1))
    );
    const controls = document.createElement('div');
    controls.className = 'controls';
    for (const c of layerControls[layer.kind]) if (shown(c, layer)) controls.append(control(layer, c));
    card.append(head, controls);
    layers.append(card);
  });
  if (!patch.layers.length) layers.innerHTML = '<p class="hint">No layers: add one above, or drop a sound.</p>';

  const holder = $('sections');
  holder.innerHTML = '';
  cardTitles = [];
  // A sampler's sounds, among the main controls too (its layers only show with all of them)
  if (controlsMode !== 'all') {
    for (const layer of patch.layers.filter((l) => l.kind === 'sample' && !l.off)) {
      const card = patchCard('sounds', [], 'Pick your sound files, or drop them anywhere on the page. With more than one, each drop picks one at random.');
      card.querySelector('.controls').append(control(layer, layerControls.sample.find((c) => c[0] === 'src')));
      holder.append(card);
    }
  }
  if (controlsMode === 'all') {
    for (const section of sections) holder.append(patchCard(section.title, section.controls.filter((c) => shown(c, patch)), section.hint));
  } else {
    const every = sections.flatMap((section) => section.controls);
    holder.append(patchCard('sound', simpleOrder.map((path) => every.find((c) => c[0] === path))));
    const notes = sections.find((section) => section.title === 'notes');
    holder.append(patchCard('notes', notes.controls.filter((c) => shown(c, patch)), notes.hint));
  }
  showJSON();
}

// --- Keeping everything in step -----------------------------------------------------------------------------------
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function showJSON() {
  const box = $('json');
  if (document.activeElement !== box) {
    box.value = JSON.stringify(patch, null, 2);
    box.classList.remove('invalid');
  }
  const file = slug(patch.name) || 'untitled';
  $('usage').innerHTML =
    `On a page: <code>import ${camel(file)} from '/src/sounds/patches/${section}/${file}.json';</code> and ` +
    `<code>instrument(audio, ${camel(file)}, audioOut()).play(note, velocity, seconds)</code> (from src/scripts/patch.js).`;
  $('saves-to').innerHTML = `"save" saves it to <code>src/sounds/patches/${section}/${file}.json</code>`;
  $('save').title = `Saves it to src/sounds/patches/${section}/${file}.json`;
}
const camel = (s) => s.replace(/-(\w)/g, (_, c) => c.toUpperCase()).replace(/^\d/, '_$&');

let draftTimer = 0;
function changed() {
  synth.setPatch(patch);
  if (selectedTrack) {
    selectedTrack.patch = patch; // (The track has it, and keeps it)
    tracks.soundChanged(selectedTrack);
    showInstrument();
  }
  if (savedName) live?.postMessage({ name: savedName, patch }); // So the pages playing it change with it
  heldChanged();
  showJSON();
  showStatus();
  clearTimeout(draftTimer);
  if (!selectedTrack) draftTimer = setTimeout(keepDraft, 300); // (A track keeps its own)
}

function showStatus(text, error = false) {
  const status = $('status');
  status.classList.toggle('error', error);
  if (text) status.textContent = text;
  else status.textContent = unsaved() ? 'changed (not saved)' : '';
  $('revert').hidden = !unsaved();
}

// --- Sections: tabs along the top, each with its patches, its sounds, its pages, and where it saves to ---------------
function renderTabs() {
  const tabs = $('sections-tabs');
  tabs.innerHTML = '';
  for (const s of siteSections) {
    const tab = document.createElement('button');
    const count = library.patches.filter((p) => p.section === s.id).length;
    tab.innerHTML = `${s.label}<span class="count">${count || ''}</span>`;
    tab.title = `${count} patch${count === 1 ? '' : 'es'}`;
    tab.style.setProperty('--section', sectionColours[s.id]);
    tab.setAttribute('aria-current', String(s.id === section));
    tab.onclick = () => {
      if (s.id === section) return;
      keepDraft(); // (Its changes are kept for when it's opened again)
      enterSection(s.id);
      const first = library.patches.find((p) => p.section === s.id);
      if (first) openPatch(first.patch, first.file);
      else openPatch({ ...blankPatch }, null);
      renderPatchList();
      changed();
    };
    tabs.append(tab);
  }
}

function enterSection(id) {
  section = id;
  remember('section', id);
  document.body.style.setProperty('--section', sectionColours[id]);
  document.title = `${sectionOf(id).label} · Sound Sandbox`;
  renderTabs();
  renderPatchList();
  showPreview();
  showJSON();
}

function renderPatchList() {
  const list = $('patch-list');
  list.innerHTML = '';
  if (selectedTrack) {
    // A track's: a saved patch to load into it, from any section, or an empty one to start again from
    list.append(new Option(currentFile ? '' : '(its own, not saved as a patch)', ''));
    list.append(new Option('+ an empty synth', 'new:synth'));
    list.append(new Option('+ an empty sampler', 'new:sampler'));
    for (const s of siteSections) {
      const patches = library.patches.filter((p) => p.section === s.id);
      if (!patches.length) continue;
      const holder = document.createElement('optgroup');
      holder.label = s.label;
      for (const { file, patch: saved } of patches) holder.append(new Option(saved.name ?? file, file));
      list.append(holder);
    }
    list.options[0].hidden = !!currentFile;
    list.value = currentFile ?? '';
    if (list.value !== (currentFile ?? '')) list.value = '';
    return;
  }
  const group = (label, patches) => {
    if (!patches.length) return;
    const holder = document.createElement('optgroup');
    holder.label = label;
    for (const { file, patch: saved } of patches) holder.append(new Option(saved.name ?? file, file));
    list.append(holder);
  };
  group(sectionOf(section).label, library.patches.filter((p) => p.section === section));
  list.append(new Option(`+ new patch for ${sectionOf(section).label}`, ''));
  for (const s of siteSections) {
    if (s.id !== section) group(`${s.label} (switches section)`, library.patches.filter((p) => p.section === s.id));
  }
  list.value = currentFile ?? '';
  if (list.value !== (currentFile ?? '')) list.value = '';
}

// The preview: the section's page, live, beside the controls
let previewBig = remembered('previewBig', false);
let previewHidden = remembered('previewHidden', false);
// Once only: the scene's new (2026-11-10), so a page folded away before then opens again to show it
if (!remembered('sceneShown', false)) {
  previewHidden = false;
  remember('previewHidden', false);
  remember('sceneShown', true);
}
const previewPages = remembered('previewPages', {}); // section -> the page last looked at in it
// Its first choice is the scene (see scene.js): the front page's pond, raining, there in every section
function showPreview() {
  const pages = ['scene', ...(library.pages[section] ?? [])];
  $('preview').classList.toggle('folded', previewHidden);
  $('preview-hide').textContent = previewHidden ? '▸ view' : '▾ view';
  $('preview-hide').title = previewHidden ? 'Show the scene or page' : 'Fold it away (a page stops while it is folded)';
  $('workspace').classList.toggle('big-preview', previewBig && !previewHidden);
  $('preview-size').textContent = previewBig ? 'smaller' : 'bigger';
  const select = $('preview-page');
  select.innerHTML = '';
  for (const page of pages) select.append(new Option(page === 'scene' ? 'the scene' : page, page));
  const page = pages.includes(previewPages[section]) ? previewPages[section] : pages[0];
  select.value = page;
  const inScene = page === 'scene';
  $('preview').classList.toggle('in-scene', inScene);
  $('preview-open').hidden = inScene;
  $('preview-open').href = inScene ? '' : page;
  $('preview-hint').textContent = inScene
    ? 'The front page\'s pond. Each drop plays your tracks as it lands; clicking the water drops one there.'
    : 'Click into the page to hear it. A page that plays a patch follows the sliders here.';
  const frame = $('preview-frame');
  const src = inScene ? 'about:blank' : page; // (The page doesn't keep running behind the scene)
  requestAnimationFrame(() => scene.run(inScene && !previewHidden)); // (Once it's the right size)
  $('tracks').hidden = !inScene;
  if (tracks) showPlayBar();
  if (!previewHidden && frame.getAttribute('src') !== src) frame.setAttribute('src', src);
  requestAnimationFrame(fitView);
}
// The scene (or page) is as tall as 16:9 makes it, at its width, but no taller than `mostShare` of the window (so the
// layers show under it) or the room there is down to the play bar, and no shorter than `leastHeight`
const leastHeight = 200;
const mostShare = 0.4;
function fitView() {
  const holder = $('preview-frame').parentElement;
  if (previewHidden) return;
  const bar = document.querySelector('.play').offsetHeight;
  const hint = $('preview-hint').offsetHeight + 8;
  const top = holder.getBoundingClientRect().top + scrollY;
  const room = innerHeight - bar - top - hint - 24;
  holder.style.height = `${Math.floor(Math.max(leastHeight, Math.min(room, holder.clientWidth * 0.5625, innerHeight * mostShare)))}px`;
  holder.style.aspectRatio = 'auto';
}
addEventListener('resize', fitView);
const viewWatcher = new ResizeObserver(() => requestAnimationFrame(fitView));
for (const selector of ['.shape-column', '.layers-column', '.play', '.bar', '.sections']) viewWatcher.observe(document.querySelector(selector));
// The handle between the columns: dragging it moves the line between them (remembered for next time), and
// double-clicking it puts it back where it was at first
const startingShare = 1.25 / 2.25; // How much of the width the left column has at first
let leftShare = remembered('leftShare', startingShare);
function setLeftShare(share) {
  leftShare = Math.min(0.75, Math.max(0.25, share));
  $('workspace').style.setProperty('--left', `${leftShare}fr`);
  $('workspace').style.setProperty('--right', `${1 - leftShare}fr`);
}
setLeftShare(leftShare);
$('column-handle').addEventListener('pointerdown', (event) => {
  const handle = $('column-handle');
  handle.setPointerCapture(event.pointerId);
  handle.classList.add('dragging');
  document.body.classList.add('dragging-columns');
  const box = $('workspace').getBoundingClientRect();
  const inside = box.width - 32 - 16; // Its width, but for its padding and the handle
  const move = (e) => setLeftShare((e.clientX - box.left - 16 - 8) / inside);
  const done = () => {
    handle.classList.remove('dragging');
    document.body.classList.remove('dragging-columns');
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', done);
    handle.removeEventListener('pointercancel', done);
    remember('leftShare', leftShare);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', done);
  handle.addEventListener('pointercancel', done);
});
$('column-handle').addEventListener('dblclick', () => {
  setLeftShare(startingShare);
  remember('leftShare', leftShare);
});
$('preview-page').onchange = () => {
  previewPages[section] = $('preview-page').value;
  remember('previewPages', previewPages);
  showPreview();
};
$('preview-size').onclick = () => {
  previewBig = !previewBig;
  remember('previewBig', previewBig);
  showPreview();
};
$('preview-hide').onclick = () => {
  previewHidden = !previewHidden;
  remember('previewHidden', previewHidden);
  if (previewHidden) $('preview-frame').setAttribute('src', 'about:blank'); // So a folded page isn't still making sound
  showPreview();
};
$('fold-all').onclick = () => foldAll(true);
$('open-all').onclick = () => foldAll(false);
// The ⋯ menu closes once something in it is chosen
for (const item of document.querySelectorAll('.more .menu button')) item.addEventListener('click', () => (document.querySelector('.more').open = false));
addEventListener('pointerdown', (event) => {
  if (!event.target.closest('.more')) document.querySelector('.more').open = false;
});

$('json').addEventListener('input', () => {
  const box = $('json');
  try {
    patch = complete(JSON.parse(box.value));
    box.classList.remove('invalid');
    synth.setPatch(patch);
    const focus = box.selectionStart;
    render();
    box.focus();
    box.selectionStart = box.selectionEnd = focus;
    showStatus();
  } catch {
    box.classList.add('invalid');
  }
});

$('patch-name').addEventListener('input', () => {
  patch.name = $('patch-name').value;
  changed();
});

for (const button of document.querySelectorAll('[data-add]')) {
  button.onclick = () => {
    patch.layers.push(structuredClone(layerDefaults[button.dataset.add]));
    changed();
    render();
  };
}

$('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(patch, null, 2));
    showStatus('copied');
  } catch {
    showStatus("couldn't copy", true);
  }
};

// --- Patches in the project ---------------------------------------------------------------------------------------
async function loadLibrary() {
  try {
    const response = await fetch('/__sandbox/library');
    library = await response.json();
  } catch {
    showStatus("can't reach the dev server: run npm run dev", true);
  }
  library.pages ??= {};
  renderTabs();
  renderPatchList();
  renderWithList();
}

// Unsaved changes are kept for each patch on its own (in this browser), so opening another patch doesn't lose them:
// coming back to it brings them back, until they're saved or reverted. A new patch's are kept for its section.
const drafts = remembered('drafts', {}); // 'landing/raindrop.json' (or 'new:landing') -> the patch as it was left
const draftKey = () => currentFile ?? 'new:' + section;
function withoutLostSounds(kept) {
  const copy = structuredClone(kept);
  for (const layer of copy.layers ?? []) {
    if (layer.kind !== 'sample') continue;
    const srcs = [].concat(layer.src).filter((src) => src && (!src.startsWith('local:') || localFiles.has(src))); // Dropped sounds don't outlast the page
    layer.src = srcs.length > 1 ? srcs : (srcs[0] ?? '');
  }
  return copy;
}
function keepDraft() {
  if (unsaved()) drafts[draftKey()] = patch;
  else delete drafts[draftKey()];
  remember('drafts', drafts);
  remember('draft', { file: currentFile, section }); // Which was open, for next time
}

function openPatch(next, file) {
  currentFile = file;
  const saved = complete(next);
  savedJSON = file ? JSON.stringify(saved) : '';
  savedName = file ? saved.name : null;
  const kept = drafts[draftKey()];
  patch = kept ? complete(withoutLostSounds(kept)) : saved;
  synth.setPatch(patch);
  render();
  showStatus(kept && unsaved() ? 'changed (not saved): your unsaved changes, brought back' : undefined);
  suitPlayMode();
}

$('revert').onclick = () => {
  const saved = library.patches.find((p) => p.file === currentFile);
  if (!confirm(saved ? `Go back to "${saved.patch.name}" as it was last saved?` : 'Start this new patch over?')) return;
  if (selectedTrack) {
    // A track's: back to the patch it was loaded from or saved as
    patch = complete(structuredClone(saved ? saved.patch : selectedTrack.kind === 'sampler' ? samplerOf([]) : { ...blankPatch, name: '' }));
    render();
    changed();
    return;
  }
  delete drafts[draftKey()];
  remember('drafts', drafts);
  openPatch(saved ? saved.patch : { ...blankPatch }, saved ? currentFile : null);
  changed();
};

$('patch-list').onchange = () => {
  const file = $('patch-list').value;
  const found = library.patches.find((p) => p.file === file);
  $('patch-list').blur(); // So the computer's keys play notes again
  if (selectedTrack) {
    // Into the track: a copy of a saved patch (saving it again updates that one), or an empty synth or sampler
    const empty = file.startsWith('new:');
    if (!found && !empty) return;
    patch = empty ? (file === 'new:sampler' ? samplerOf([]) : complete({ ...blankPatch, name: '' })) : complete(structuredClone(found.patch));
    currentFile = empty ? null : file;
    savedJSON = empty ? '' : JSON.stringify(patch);
    savedName = empty ? null : patch.name;
    selectedTrack.from = currentFile;
    render();
    changed();
    renderPatchList();
    return;
  }
  keepDraft(); // The one being left: its changes are kept for when it's opened again
  if (found && found.section !== section) enterSection(found.section); // A patch from another section takes you there
  openPatch(found ? found.patch : { ...blankPatch, name: 'untitled' }, found ? file : null);
  renderPatchList();
  changed();
};

// Saving, into the section's folder: any sounds dropped on the page go into its sound folder first, so the patch names
// them by URL
let replacing = null; // A patch it'd save over (another of the same name), once save's been pressed for it once
$('patch-name').addEventListener('input', () => (replacing = null));
$('save').onclick = async () => {
  const name = slug(patch.name ?? '');
  if (!name) {
    $('patch-name').focus();
    return showStatus('give it a name first, to save it as a patch', true);
  }
  // Saving over another patch (not the one it's from) only on a second press
  const id = `${section}/${name}.json`;
  if (id !== currentFile && library.patches.some((p) => p.file === id) && replacing !== id) {
    replacing = id;
    return showStatus(`there's already a patch called "${name}" in ${section}: press save again to replace it`, true);
  }
  replacing = null;
  try {
    const uploaded = new Map();
    for (const layer of patch.layers) {
      if (layer.kind !== 'sample') continue;
      const srcs = srcsOf(layer);
      for (const src of srcs) {
        if (!localFiles.has(src) || uploaded.has(src)) continue;
        const file = localFiles.get(src);
        showStatus(`saving ${file.name}…`);
        const response = await fetch(`/__sandbox/sample?section=${section}&name=` + encodeURIComponent(file.name), { method: 'POST', body: file });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        provideBuffer(audio, result.src, await loadBuffer(audio, src));
        uploaded.set(src, result.src);
      }
      const saved = srcs.map((src) => uploaded.get(src) ?? src);
      layer.src = saved.length > 1 ? saved : (saved[0] ?? '');
    }
    for (const src of uploaded.keys()) localFiles.delete(src);
    const response = await fetch(`/__sandbox/patch?section=${section}&name=${name}`, { method: 'POST', body: JSON.stringify(patch) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    delete drafts[draftKey()];
    currentFile = result.id;
    delete drafts[currentFile];
    remember('drafts', drafts);
    savedJSON = JSON.stringify(patch);
    savedName = patch.name;
    await loadLibrary();
    synth.setPatch(patch);
    if (selectedTrack) {
      selectedTrack.from = currentFile; // (Saving again updates this one)
      tracks.soundChanged(selectedTrack);
    }
    render();
    renderPatchList();
    showStatus('saved ' + result.file);
  } catch (error) {
    showStatus('not saved: ' + error.message, true);
  }
};

// --- Dropping sounds on the page ----------------------------------------------------------------------------------
let dragDepth = 0;
addEventListener('dragenter', (event) => {
  event.preventDefault();
  dragDepth++;
  $('drop').classList.add('on');
});
addEventListener('dragleave', () => {
  if (--dragDepth <= 0) $('drop').classList.remove('on');
});
addEventListener('dragover', (event) => event.preventDefault());
addEventListener('drop', async (event) => {
  event.preventDefault();
  dragDepth = 0;
  $('drop').classList.remove('on');
  for (const file of event.dataTransfer.files) {
    try {
      const buffer = await audio.decodeAudioData(await file.arrayBuffer());
      let src = `local:${Date.now().toString(36)}-${file.name}`;
      if (selectedTrack) {
        // A track's sampler: the sound goes into the section's sound folder now (the track keeps it, saved or not)
        const response = await fetch(`/__sandbox/sample?section=${section}&name=` + encodeURIComponent(file.name), { method: 'POST', body: file });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        src = result.src;
        await loadLibrary();
      } else localFiles.set(src, file);
      provideBuffer(audio, src, buffer);
      // Into a sampler with no sounds yet, if that's what's open; otherwise as a sample layer of its own
      const empty = patch.layers.find((layer) => layer.kind === 'sample' && !srcsOf(layer).length);
      if (empty) empty.src = src;
      else patch.layers.push({ ...structuredClone(layerDefaults.sample), src });
      showStatus(`added ${file.name} (${buffer.duration.toFixed(2)} s)`);
    } catch {
      showStatus(`${file.name} isn't a sound this browser can read`, true);
    }
  }
  changed(); // (A track's sampler keeps its new sounds)
  render();
});

// --- Playing ------------------------------------------------------------------------------------------------------
let base = 48; // The keyboard's lowest C
const span = 29; // How many keys it shows
const isBlack = (n) => [1, 3, 6, 8, 10].includes(n % 12);
const down = new Map(); // note -> how many things are holding it
const keyOf = new Map(); // note -> its element

function light(note, by) {
  down.set(note, Math.max(0, (down.get(note) ?? 0) + by));
  keyOf.get(note)?.classList.toggle('down', down.get(note) > 0);
}
function start(note, velocity) {
  light(note, 1);
  const held = synth.noteOn(note, velocity);
  return { note, held };
}
function stop(playing) {
  if (!playing) return;
  light(playing.note, -1);
  synth.noteOff(playing.held);
}

function buildKeyboard() {
  const keyboard = $('keyboard');
  keyboard.innerHTML = '';
  keyOf.clear();
  const whites = [];
  for (let n = base; n < base + span; n++) if (!isBlack(n)) whites.push(n);
  const width = 100 / whites.length;
  for (let n = base; n < base + span; n++) {
    const key = document.createElement('div');
    key.className = 'key' + (isBlack(n) ? ' black' : '');
    key.dataset.note = n;
    if (n % 12 === 0) key.textContent = noteName(n);
    if (isBlack(n)) {
      const left = whites.indexOf(n - 1) + 1;
      key.style.left = `calc(${left * width}% - ${width * 0.3}%)`;
      key.style.width = `${width * 0.6}%`;
    }
    if (down.get(n) > 0) key.classList.add('down');
    keyOf.set(n, key);
    keyboard.append(key);
  }
  $('octave-label').textContent = `${noteName(base)}–${noteName(base + span - 1)}`;
}

// The mouse or a finger: lower on a key plays it louder, and sliding across the keys plays each one
const pointers = new Map();
function keyAt(event) {
  const key = document.elementFromPoint(event.clientX, event.clientY)?.closest('.key');
  if (!key) return null;
  const box = key.getBoundingClientRect();
  return { note: +key.dataset.note, velocity: 0.25 + 0.75 * Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)) };
}
$('keyboard').addEventListener('pointerdown', (event) => {
  const hit = keyAt(event);
  if (!hit) return;
  $('keyboard').setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, start(hit.note, hit.velocity));
});
$('keyboard').addEventListener('pointermove', (event) => {
  if (!pointers.has(event.pointerId)) return;
  const hit = keyAt(event);
  const playing = pointers.get(event.pointerId);
  if (!hit || hit.note === playing.note) return;
  stop(playing);
  pointers.set(event.pointerId, start(hit.note, hit.velocity));
});
for (const type of ['pointerup', 'pointercancel']) {
  $('keyboard').addEventListener(type, (event) => {
    stop(pointers.get(event.pointerId));
    pointers.delete(event.pointerId);
  });
}

// The computer's keys, laid out like a piano's from A
const keyNotes = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyO', 'KeyL', 'KeyP', 'Semicolon', 'Quote'];
const typing = () => document.activeElement?.matches('input[type="text"], input[type="number"], textarea');
const keysDown = new Map();
function shift(by) {
  base = Math.min(84, Math.max(12, base + by));
  buildKeyboard();
}
addEventListener('keydown', (event) => {
  if (event.repeat || typing() || event.metaKey || event.ctrlKey) return;
  if (event.code === 'KeyZ') return shift(-12);
  if (event.code === 'KeyX') return shift(12);
  const index = keyNotes.indexOf(event.code);
  if (index < 0 || keysDown.has(event.code)) return;
  event.preventDefault();
  keysDown.set(event.code, start(base + index, +$('velocity').value));
});
addEventListener('keyup', (event) => {
  stop(keysDown.get(event.code));
  keysDown.delete(event.code);
});
addEventListener('blur', () => {
  for (const playing of keysDown.values()) stop(playing);
  keysDown.clear();
});
// Folding the keyboard away, for more room (remembered for next time)
function showKeys(shown) {
  document.body.classList.toggle('keys-hidden', !shown);
  $('keys-toggle').setAttribute('aria-expanded', String(shown));
  $('keys-toggle').textContent = shown ? '▾ keys' : '▴ keys';
  $('keys-toggle').title = shown ? 'Fold the keyboard away (the computer\'s keys still play)' : 'Show the keyboard';
  remember('keysShown', shown);
}
showKeys(remembered('keysShown', true));
$('keys-toggle').onclick = () => showKeys(document.body.classList.contains('keys-hidden'));
$('octave-down').onclick = () => shift(-12);
$('octave-up').onclick = () => shift(12);

// A MIDI keyboard (in browsers that have Web MIDI, like Chrome), sustain pedal and all
$('midi').onclick = async () => {
  if (!navigator.requestMIDIAccess) return showStatus('this browser has no MIDI (try Chrome)', true);
  try {
    const access = await navigator.requestMIDIAccess();
    const held = new Map();
    const pedalled = [];
    let pedal = false;
    const listen = (input) => {
      input.onmidimessage = ({ data: [status, a, b] }) => {
        const type = status & 0xf0;
        if (type === 0x90 && b > 0) {
          wake();
          stop(held.get(a));
          held.set(a, start(a, b / 127));
        } else if (type === 0x80 || (type === 0x90 && b === 0)) {
          if (pedal) pedalled.push(held.get(a));
          else stop(held.get(a));
          held.delete(a);
        } else if (type === 0xb0 && a === 64) {
          pedal = b >= 64;
          if (!pedal) pedalled.splice(0).forEach(stop);
        }
      };
    };
    const names = [];
    for (const input of access.inputs.values()) {
      listen(input);
      names.push(input.name);
    }
    access.onstatechange = () => {
      for (const input of access.inputs.values()) listen(input);
    };
    $('midi').textContent = names.length ? 'MIDI: ' + names.join(', ') : 'MIDI: nothing plugged in';
  } catch {
    showStatus('MIDI not allowed', true);
  }
};

// --- Playing it hands-free: one button, playing the patch as rain, as one long note (for backgrounds), or as a
// phrase over and over; and maybe another patch along with it. The space bar starts and stops it too.
const phrases = {
  note: [[0, 60, 0.4]],
  arp: [[0, 60, 0.2], [0.25, 64, 0.2], [0.5, 67, 0.2], [0.75, 72, 0.2], [1, 67, 0.2], [1.25, 64, 0.2]],
  chord: [[0, 60, 1.2], [0, 64, 1.2], [0, 67, 1.2], [0, 71, 1.2]],
  low: [[0, 36, 0.4], [1, 84, 0.4]],
};
// Rain, like the pond's (see pond.js): a drop every 0.8 to 1.2 seconds, quieter the further off it lands (velocity
// 0.25 to 0.7), off to one side or the other (up to 0.6), and now and then the drop in colour (velocity 1, in the
// middle), on notes from the patch's pitch range
function rain(at, player = synth) {
  const colour = Math.random() < 0.08;
  const velocity = colour ? 1 : 0.25 + Math.random() * 0.45;
  const pan = colour ? 0 : (Math.random() * 2 - 1) * 0.6;
  player.play(player.randomNote(), velocity, 2, at, { pan }); // From the patch's pitch range
  return 0.8 + Math.random() * 0.4;
}
// The scene (see scene.js): while it's showing, it's the pond's own rain that plays, each drop as it lands, as loud and
// as far to the side as the page would play its drip; and a drop dropped by pressing it plays whether ▶ play's on or
// not. (The patch playing along, "with", rains on its own, unseen.)
$('scene').addEventListener('pointerdown', wake); // (The sound can only start on a press)
const sceneShowing = () => !previewHidden && $('preview-page').value === 'scene';
const scene = makeScene($('scene'), {
  onDrop(drop) {
    if (audio.state !== 'running') return;
    if (tracks.active) {
      if (drop.pressed || playing) tracks.drop(drop);
    } else if (drop.pressed || (playing && playMode() === 'rain')) synth.play(synth.randomNote(), drop.loud, 2, undefined, { pan: drop.pan });
  },
});

// The scene's tracks (see tracks.js): what plays when, in the scene, each a patch or sound files. While there are
// some and the scene's showing, ▶ play plays them (and not the open patch on its own, as rain or a long note)
const sceneName = 'pond';
tracks = makeTracks({
  audio,
  master,
  holder: $('tracks'),
  library: () => library,
  blank: (kind) => (kind === 'sampler' ? samplerOf([]) : { ...structuredClone(blankPatch), name: '' }),
  samplerOf,
  select: selectTrack,
  selected: () => selectedTrack,
  async onSave(list) {
    try {
      const response = await fetch(`/__sandbox/scene?name=${sceneName}`, { method: 'POST', body: JSON.stringify({ tracks: list }) });
      if (!response.ok) throw new Error((await response.json()).error);
      library.scenes ??= {};
      library.scenes[sceneName] = { tracks: structuredClone(list) };
    } catch (error) {
      showStatus('tracks not kept: ' + error.message, true);
    }
    showPlayBar();
  },
});

// A sampler: sound files played as they are (one at random each time, if there are several), with nothing done to
// them, until its sliders say otherwise
function samplerOf(srcs) {
  return complete({
    ...structuredClone(blankPatch),
    name: '',
    level: 1,
    out: 1,
    filter: { ...structuredClone(blankPatch.filter), start: { ratio: 0, add: 20000, velocity: 0 }, end: { ratio: 0, add: 20000 } },
    echo: { time: 0.37, feedback: 0.35, wet: 0 },
    layers: [{ ...layerDefaults.sample, src: srcs.length > 1 ? srcs : (srcs[0] ?? ''), follow: false, sustain: 1 }],
  });
}

// Opening a track's synth or sampler in the controls (or, with null, going back to a patch on its own)
function selectTrack(track) {
  if (track === selectedTrack) return;
  if (!selectedTrack) keepDraft(); // Leaving a patch on its own: its changes are kept for when it's opened again
  selectedTrack = track;
  remember('selectedTrack', track ? tracks.list.indexOf(track) : -1);
  if (!track) {
    openPatch({ ...blankPatch }, null);
  } else {
    const saved = library.patches.find((p) => p.file === track.from);
    currentFile = saved ? track.from : null;
    savedJSON = saved ? JSON.stringify(complete(saved.patch)) : '';
    savedName = saved ? complete(saved.patch).name : null;
    patch = track.patch;
    synth.setPatch(patch);
    render();
  }
  renderPatchList();
  showInstrument();
  showStatus();
  tracks.render();
}
// The card at the top of the controls: what's being worked on, and where it's from
function showInstrument() {
  $('instrument-kind').textContent = selectedTrack ? selectedTrack.kind : 'patch';
  $('instrument-of').textContent = selectedTrack ? `of the track "${tracks.label(selectedTrack)}"` : 'on its own';
}

const sceneLeads = () => sceneShowing() && tracks.active;
// There's no play button: the scene plays whenever it's showing (its tracks, or with none, the open patch on each drop,
// or as one long note if it's a background), and the master volume turns it up or down
// (Only when that changes, so a background isn't started again each time a track's turned up, or muted)
let ledBy = null;
function showPlayBar() {
  if (sceneShowing() !== playing || sceneLeads() !== ledBy) setPlaying(sceneShowing());
}
const lowestOf = (p) => Math.round(Math.min(p.range.low, p.range.high)); // The note "one long note" plays

let playing = false;
let nextPhrase = 0;
const playMode = () => $('play-mode').value;

// One long note of this patch, kept going. As the sliders move, a new note takes over from the old one (each coming
// in and going over the patch's own fade in and fade out).
let holding = null;
let rehold = 0;
function hold(on) {
  if (holding) synth.noteOff(holding);
  holding = on ? synth.noteOn(lowestOf(patch), +$('velocity').value) : null;
}
function heldChanged() {
  if (!holding) return;
  clearTimeout(rehold);
  rehold = setTimeout(() => holding && hold(true), 250);
}

function setPlaying(on) {
  playing = on;
  const leads = sceneLeads();
  ledBy = leads;
  hold(on && playMode() === 'hold' && !leads);
  tracks.hold(on && leads);
  nextPhrase = audio.currentTime + 0.05;
  stopWith(); // (Nothing plays along: there's no choosing it any more)
}
$('play-mode').onchange = () => {
  $('play-mode').blur(); // So the computer's keys play notes again
  remember('playMode', playMode());
  if (playing) {
    hold(false);
    setPlaying(true);
  }
};
setInterval(() => {
  if (!playing || playMode() === 'hold' || audio.state !== 'running') return;
  while (nextPhrase < audio.currentTime + 0.2) {
    if (playMode() === 'rain') nextPhrase += sceneShowing() ? 0.1 : rain(nextPhrase); // (With the scene showing, it rains there)
    else {
      for (const [at, note, seconds] of phrases[playMode()]) synth.play(note, +$('velocity').value, seconds, nextPhrase + at);
      nextPhrase += 2;
    }
  }
}, 50);

// As a patch is opened: a background plays as one long note, anything else as rain (or however it was playing)
function suitPlayMode() {
  const was = playMode();
  if (isBackground(patch)) $('play-mode').value = 'hold';
  else if (was === 'hold') $('play-mode').value = 'rain';
  if (playing && playMode() !== was) {
    hold(false);
    setPlaying(true);
  }
}

// With: another saved patch playing along while it plays (with its unsaved changes, if it has any), to hear the
// two together: a background as one long note, anything else as rain. It follows its own sliders, if it's opened and
// changed (see `follow` in patch.js).
let withPlayer = null;
let withHeld = null;
let nextWith = 0;
function stopWith() {
  if (withHeld) withPlayer.noteOff(withHeld);
  withHeld = null;
  const old = withPlayer;
  withPlayer = null;
  if (old) setTimeout(() => old.disconnect(), 8000); // Once it's faded out
}
async function startWith() {
  stopWith();
  const found = library.patches.find((p) => p.file === $('with-patch').value);
  if (!found || !playing) return;
  const kept = found.file !== currentFile && drafts[found.file];
  const player = instrument(audio, kept ? complete(withoutLostSounds(kept)) : found.patch, master);
  withPlayer = player;
  await player.ready();
  if (withPlayer !== player) return; // (Changed again meanwhile)
  if (isBackground(player.patch)) withHeld = player.noteOn(lowestOf(player.patch), 0.8);
  else nextWith = audio.currentTime + 0.05;
}
$('with-patch').onchange = () => {
  $('with-patch').blur();
  remember('withPatch', $('with-patch').value);
  startWith();
};
$('with-patch').addEventListener('focus', renderWithList); // So it shows which have unsaved changes, as they are now
setInterval(() => {
  if (!withPlayer || withHeld || audio.state !== 'running') return;
  while (nextWith < audio.currentTime + 0.2) nextWith += rain(nextWith, withPlayer);
}, 50);
function renderWithList() {
  const list = $('with-patch');
  const chosen = list.value || remembered('withPatch', '');
  list.innerHTML = '';
  list.append(new Option('nothing else', ''));
  for (const s of siteSections) {
    const patches = library.patches.filter((p) => p.section === s.id);
    if (!patches.length) continue;
    const group = document.createElement('optgroup');
    group.label = s.label;
    for (const { file, patch: saved } of patches) group.append(new Option((saved.name ?? file) + (drafts[file] ? ' (with unsaved changes)' : ''), file));
    list.append(group);
  }
  list.value = chosen;
  if (list.value !== chosen) list.value = '';
}


// The scope, and a warning when it's too loud
const scope = $('scope');
const pen = scope.getContext('2d');
const wave = new Float32Array(analyser.fftSize);
let clipUntil = 0;
function draw() {
  analyser.getFloatTimeDomainData(wave);
  pen.clearRect(0, 0, scope.width, scope.height);
  pen.strokeStyle = sectionColours[section];
  pen.lineWidth = 2;
  pen.beginPath();
  let peak = 0;
  for (let i = 0; i < wave.length; i++) {
    peak = Math.max(peak, Math.abs(wave[i]));
    const x = (i / wave.length) * scope.width;
    const y = (0.5 - wave[i] * 0.5) * scope.height;
    i ? pen.lineTo(x, y) : pen.moveTo(x, y);
  }
  pen.stroke();
  if (peak >= 0.99) clipUntil = performance.now() + 600;
  $('clip').classList.toggle('on', performance.now() < clipUntil);
  requestAnimationFrame(draw);
}
draw();

// --- Starting up: the section and patch left open last time (with its unsaved changes), or the section's first ---
document.body.classList.toggle('simple', controlsMode === 'simple');
if (phrases[remembered('playMode', 'rain')] || ['rain', 'hold'].includes(remembered('playMode', 'rain'))) $('play-mode').value = remembered('playMode', 'rain');
// Room at the bottom for the play bar, however tall it is (with the keyboard, or without)
const playBar = document.querySelector('.play');
new ResizeObserver(() => (document.body.style.paddingBottom = `${playBar.offsetHeight + 16}px`)).observe(playBar);
await loadLibrary();
tracks.load(library.scenes?.[sceneName]?.tracks);
const last = remembered('draft', null);
if (last?.patch) drafts[last.file ?? 'new:' + last.section] ??= last.patch; // (Kept the old way, before there was one each)
// Unsaved changes to patches that are gone from the project go with them
for (const key of Object.keys(drafts)) if (!key.startsWith('new:') && !library.patches.some((p) => p.file === key)) delete drafts[key];
// Once only: the landing section started over (2026-11-10), so the new patch left half-made there goes too
if (!remembered('landingCleared', false)) {
  delete drafts['new:landing'];
  remember('landingCleared', true);
}
remember('drafts', drafts);
const lastSaved = library.patches.find((p) => p.file === last?.file);
if (last && sectionOf(last.section)) {
  enterSection(last.section);
  if (lastSaved) openPatch(lastSaved.patch, lastSaved.file);
  else openPatch({ ...blankPatch }, null);
} else {
  enterSection(section);
  const first = library.patches.find((p) => p.section === section);
  if (first) openPatch(first.patch, first.file);
}
// The track that was open last time, if there are tracks
const keptTrack = tracks.list[remembered('selectedTrack', 0)] ?? tracks.list[0];
if (keptTrack) selectTrack(keptTrack);
showInstrument();
renderPatchList();
showStatus();
buildKeyboard();
setControlsMode(controlsMode);
