// The sound studio: where the site's soundscapes are composed, by hand and by ear, against the real pages.
// Open it at /tools/sound-studio/ while `npm run dev` runs.
//
// A soundscape belongs to a section of the site (the front page, music...), and is a list of tracks, each a synth or
// a sampler, played by what happens on the page: see src/scripts/soundscape/engine.js for what one is, and
// catalogue.js for the scenes and events. This file holds it all together: which section and scene are open, the
// soundscape being worked on, undo, saving (as it changes, into src/sounds/soundscapes), the meters, and playing the
// open track from the computer's keys. The parts of the screen are scene.js (the page), lanes.js (what's happening),
// tracks.js (the tracks) and device.js (the open track's sound).

import { createEngine, blankSoundscape, newTrack, newId } from '../../src/scripts/soundscape/engine.js';
import { params, valueAt, valueOf, positionOf, linkable } from '../../src/scripts/soundscape/params.js';
import { sections, visitor, opening, sectionOwning } from './catalogue.js';
import { starter, presetOf } from './presets.js';
import { h, knob, menu } from './controls.js';
import { makeScene } from './scene.js';
import { makeLanes } from './lanes.js';
import { makeTracks, colourOf } from './tracks.js';
import { makeDevice } from './device.js';

const $ = (id) => document.getElementById(id);
const storeKey = 'sound-studio';
function remembered() {
  try {
    return JSON.parse(localStorage.getItem(storeKey)) ?? {};
  } catch {
    return {};
  }
}
function remember(more) {
  try {
    localStorage.setItem(storeKey, JSON.stringify({ ...remembered(), ...more }));
  } catch {}
}

const audio = new AudioContext({ latencyHint: 'interactive' });
let library = { sounds: [], soundscapes: {}, presets: [], pages: {} };
let section = sections[0];
let scenePlaying = null;
let data = null; // The soundscape being worked on
let selected = null; // The open track's id
let past = []; // The soundscape as it was after each change (the last is how it is now)
let future = []; // ...and the changes undone, to redo
let found = new Map(); // Events and signals the page has said that the catalogue doesn't list: id -> { id, label, kind }
let octave = remembered().octave ?? 4;
let tracks, device, lanes, scene;

const engine = createEngine(audio, audio.destination, {
  meters: true,
  onPlay: (id) => flash(id),
  onLoaded: () => device?.soundArrived(),
});

// --- What can happen: the scene's events and signals, the rest of the page's, and the visitor's ---
const sceneList = () => section.scenes ?? (library.pages[section.id] ?? []).map((path) => ({ id: path, label: path, url: path, hint: 'The real page. Everything the visitor does in it can play a sound.' }));
function groups(kind) {
  const listed = (kind === 'event' ? section.events : section.signals) ?? [];
  const all = [...listed, ...[...found.values()].filter((item) => item.kind === kind && !listed.some((known) => known.id === item.id))];
  const here = kind === 'event' ? scenePlaying?.events : scenePlaying?.events ? scenePlaying.signals ?? [] : undefined;
  const inScene = here ? all.filter((item) => here.includes(item.id) || found.has(item.id)) : all;
  return {
    scene: kind === 'event' ? [opening, ...inScene] : inScene,
    page: all.filter((item) => !inScene.includes(item)),
    visitor: kind === 'event' ? visitor.events : visitor.signals,
  };
}
function labelOf(id) {
  for (const list of [[opening], section.events ?? [], section.signals ?? [], visitor.events, visitor.signals, [...found.values()]]) {
    const item = list.find((known) => known.id === id);
    if (item) return item.label;
  }
  return id;
}

// --- The soundscape: changing it, undoing, saving ---
const studio = {
  get data() {
    return data;
  },
  get selected() {
    return selected;
  },
  get library() {
    return library;
  },
  get section() {
    return section;
  },
  engine,
  audio,
  labelOf,
  eventGroups: () => groups('event'),
  signalGroups: () => groups('signal'),

  select(id, draw = true) {
    selected = id;
    remember({ selected: { ...remembered().selected, [section.id]: id } });
    if (draw) {
      tracks.render();
      device.render();
    }
  },
  // Something's being changed (a knob's turning): heard at once, but not yet a step to undo
  touch() {
    engine.sync();
  },
  // A change is finished: a step for undo, saved, and shown. quiet: nothing needs drawing again but the knobs.
  commit({ quiet = false, device: redrawDevice = true } = {}) {
    if (data.starter) delete data.starter;
    const now = JSON.stringify(data);
    if (now !== past[past.length - 1]) {
      past.push(now);
      if (past.length > 300) past.shift();
      future = [];
      save();
    }
    engine.sync();
    if (quiet) refreshKnobs();
    else {
      tracks.render();
      showLanes();
      if (redrawDevice) device.render();
    }
    showUndo();
  },
  audition(id, options) {
    wake();
    engine.audition(id, options);
  },
  // A sound file, heard by itself (while choosing sounds for a sampler)
  preview(src) {
    wake();
    engine.loadSound(src).then((buffer) => {
      if (!buffer) return;
      studio.previewing?.stop();
      const source = audio.createBufferSource();
      source.buffer = buffer;
      const level = audio.createGain();
      level.gain.value = 0.7;
      source.connect(level).connect(audio.destination);
      source.start();
      studio.previewing = source;
    });
  },
  // Tying one of a track's settings to an event (it goes somewhere new) or a signal (it follows it). With no setting
  // given, it starts with a likely one, which can then be changed.
  linkMenu(track, path, anchor, kind) {
    const targets = linkable(track.kind);
    if (path && !targets.some((param) => param.id === path)) {
      menu(anchor, [{ heading: 'This setting stays as it’s set: it can’t be tied to an event.' }]);
      return;
    }
    const target = path ?? (track.kind === 'synth' ? 'synth.cutoff' : 'fx.highcut');
    const param = params[target];
    const value = valueAt(track, target);
    const make = (link) => {
      data.links.push({ id: newId('l'), track: track.id, param: target, ...link });
      selected = track.id;
      studio.commit();
      document.querySelector('.card.links')?.scrollIntoView({ behavior: 'smooth', inline: 'end', block: 'nearest' });
    };
    const items = [];
    const list = (heading, things, link) => {
      if (!things.length) return;
      items.push({ heading });
      for (const thing of things) items.push({ label: thing.label, hint: thing.id, action: () => make(link(thing.id)) });
    };
    if (kind !== 'follow') {
      const events = groups('event');
      const set = (on) => ({ kind: 'set', on, to: value, over: 2 });
      items.push({ heading: `“${param.label}” goes somewhere new when…` });
      list('in this scene', events.scene, set);
      list('elsewhere on the page', events.page, set);
      list('the visitor', events.visitor, set);
    }
    if (kind !== 'set') {
      const signals = groups('signal');
      const follow = (signal) => ({ kind: 'follow', signal, from: value, to: valueOf(param, Math.min(1, positionOf(param, value) + 0.35)), smooth: 0.15 });
      if (items.length) items.push('-');
      items.push({ heading: `“${param.label}” follows…` });
      list('in this scene', signals.scene, follow);
      list('elsewhere on the page', signals.page, follow);
      list('the visitor', signals.visitor, follow);
    }
    menu(anchor, items);
  },
  // Opens a track and brings what changes it (its links) into view
  showChanges(id) {
    studio.select(id);
    document.querySelector('.card.links')?.scrollIntoView({ behavior: 'smooth', inline: 'end', block: 'nearest' });
  },
  startEmpty() {
    data.tracks = [];
    data.links = [];
    selected = null;
    studio.commit();
  },
  pickSounds: () => device.pickSounds(),
  async savePreset(track) {
    const name = window.prompt('A name for this preset:', track.preset && !['plain', 'as it is'].includes(track.preset) ? track.preset : track.name)?.trim();
    if (!name) return;
    const preset = presetOf(track, name);
    const response = await fetch(`/__studio/preset?kind=${track.kind}&name=${encodeURIComponent(name)}`, { method: 'POST', body: JSON.stringify(preset) });
    if (!response.ok) return say('That preset couldn’t be saved.');
    library.presets = library.presets.filter((old) => !(old.kind === track.kind && old.name === name)).concat({ ...preset, yours: true });
    track.preset = name;
    studio.commit();
    say(`Saved the preset “${name}”.`);
  },
  connectMidi,
  showOctave: () => $('octave') && ($('octave').textContent = `octave ${octave}`),
};

function showUndo() {
  $('undo').disabled = past.length < 2;
  $('redo').disabled = !future.length;
}
function restore(state) {
  data = JSON.parse(state);
  library.soundscapes[section.id] = data;
  if (!data.tracks.some((track) => track.id === selected)) selected = data.tracks[0]?.id ?? null;
  engine.load(data);
  save();
  drawAll();
}
function undo() {
  if (past.length < 2) return;
  future.push(past.pop());
  restore(past[past.length - 1]);
}
function redo() {
  if (!future.length) return;
  past.push(future.pop());
  restore(past[past.length - 1]);
}

let saving = 0;
function save() {
  const [id, state] = [section.id, JSON.stringify(data)];
  library.soundscapes[id] = data;
  $('saved').textContent = 'saving…';
  $('saved').classList.remove('failed');
  clearTimeout(saving);
  saving = setTimeout(async () => {
    try {
      const response = await fetch(`/__studio/soundscape?section=${id}`, { method: 'POST', body: state });
      if (!response.ok) throw new Error((await response.json()).error);
      const { file } = await response.json();
      $('saved').textContent = 'saved';
      $('saved').title = `Saved as it changes, in ${file}`;
    } catch (error) {
      $('saved').textContent = 'not saved';
      $('saved').title = String(error.message ?? error);
      $('saved').classList.add('failed');
    }
  }, 500);
}

// --- Drawing ---
function drawAll() {
  tracks.render();
  device.render();
  showLanes();
  showUndo();
  masterKnob.show();
}
function refreshKnobs() {
  for (const control of document.querySelectorAll('[data-path]')) control.show?.();
}
function showLanes() {
  const used = new Set();
  for (const track of data.tracks) for (const trigger of track.triggers ?? []) used.add(trigger.on);
  for (const link of data.links) used.add(link.kind === 'follow' ? link.signal : link.on);
  const everything = $('all-events').checked;
  const events = groups('event');
  const signals = groups('signal');
  const row = (kind) => (item) => ({ ...item, kind, quiet: !used.has(item.id) });
  const elsewhere = everything ? events.page : events.page.filter((item) => used.has(item.id));
  const moving = [...signals.scene, ...(everything ? signals.page : signals.page.filter((item) => used.has(item.id))), ...signals.visitor];
  lanes.set([
    { heading: 'in this scene' },
    ...events.scene.map(row('event')),
    ...(elsewhere.length ? [{ heading: 'elsewhere on the page' }, ...elsewhere.map(row('event'))] : []),
    { heading: 'the visitor' },
    ...events.visitor.map(row('event')),
    { heading: 'movements (settings can follow these)' },
    ...moving.map(row('signal')),
  ]);
}
// The colours of the tracks tied to an event or a signal
function coloursFor(row) {
  if (!data || !row.id) return [];
  const ids = new Set();
  for (const track of data.tracks) if (track.triggers?.some((trigger) => trigger.on === row.id)) ids.add(track.id);
  for (const link of data.links) if ((link.kind === 'follow' ? link.signal : link.on) === row.id) ids.add(link.track);
  return data.tracks.filter((track) => ids.has(track.id)).map(colourOf);
}
function flash(id) {
  const row = document.querySelector(`.track[data-id="${id}"]`);
  if (!row) return;
  row.classList.add('sounding');
  clearTimeout(row.flashing);
  row.flashing = setTimeout(() => row.classList.remove('sounding'), 140);
}
let saying = 0;
function say(words) {
  $('say').textContent = words;
  $('say').classList.add('showing');
  clearTimeout(saying);
  saying = setTimeout(() => $('say').classList.remove('showing'), 4500);
}

// --- Sections and scenes ---
function openSection(id, { start = true } = {}) {
  section = sections.find((s) => s.id === id) ?? sections[0];
  remember({ section: section.id });
  found = new Map();
  const saved = library.soundscapes[section.id];
  data = saved ? structuredClone(saved) : starter(section.id, library.sounds);
  data.tracks ??= [];
  data.links ??= [];
  data.master ??= {};
  data.room ??= {};
  past = [JSON.stringify(data)];
  future = [];
  const last = remembered().selected?.[section.id];
  selected = data.tracks.some((track) => track.id === last) ? last : data.tracks[0]?.id ?? null;
  engine.reset();
  engine.load(data);
  $('saved').textContent = saved ? 'saved' : '';
  for (const tab of $('sections').children) tab.setAttribute('aria-pressed', String(tab.dataset.id === section.id));
  const select = $('scene-select');
  select.innerHTML = '';
  for (const item of sceneList()) select.append(new Option(item.label, item.id));
  if (start) {
    const scenes = sceneList();
    const wanted = remembered().scenes?.[section.id];
    startScene(scenes.find((item) => item.id === wanted) ?? scenes[0]);
  }
  drawAll();
}

function startScene(next = scenePlaying) {
  if (!next) {
    $('scene-hint').textContent = 'This section has no pages yet.';
    return;
  }
  scenePlaying = next;
  remember({ scenes: { ...remembered().scenes, [section.id]: next.id } });
  $('scene-select').value = next.id;
  $('scene-hint').textContent = next.hint ?? '';
  engine.reset();
  lanes.clear();
  scene.start(next, { repeat: $('repeat').checked ? Math.max(2, Number($('repeat-seconds').value) || 16) : 0 });
  if (data) showLanes();
}

// What the scene says
function heard(name, detail) {
  wake();
  if (!lanes.has(name)) discover(name, 'event');
  engine.event(name, detail);
  lanes.hit(name);
}
function moved(name, value) {
  if (!lanes.has(name)) discover(name, 'signal');
  engine.signal(name, value);
  lanes.level(name, value);
}
let discovering = 0;
function discover(id, kind) {
  const listed = [opening, ...(section.events ?? []), ...(section.signals ?? []), ...visitor.events, ...visitor.signals];
  if (found.has(id)) return;
  found.set(id, listed.find((item) => item.id === id) ? { ...listed.find((item) => item.id === id), kind } : { id, label: id, kind });
  clearTimeout(discovering);
  discovering = setTimeout(showLanes, 50);
}
// The page in the scene has changed. One in another section has its own soundscape (sound can't carry on from one
// page to the next), so the studio goes there with it.
function pageChanged(path, fresh) {
  const owner = sectionOwning(path);
  if (owner && owner.id !== section.id) {
    openSection(owner.id, { start: false });
    const scenes = sceneList();
    scenePlaying = scenes.find((item) => item.url === path) ?? { id: path, label: path, url: path };
    if (!scenes.includes(scenePlaying)) $('scene-select').append(new Option(scenePlaying.label, scenePlaying.id));
    $('scene-select').value = scenePlaying.id;
    $('scene-hint').textContent = scenePlaying.hint ?? '';
    lanes.clear();
    showLanes();
    say(`The page went on to ${owner.label}, which has a soundscape of its own: that's what's open now.`);
  } else if (!fresh) engine.reset(); // (A new page starts in silence)
}

// --- Sound: it can only start once something's been pressed ---
function wake() {
  if (audio.state === 'suspended' && !muted) audio.resume();
}
let muted = false;
function showSound() {
  $('sound-state').textContent = muted ? 'sound: off' : audio.state === 'running' ? 'sound: on' : 'sound: click anywhere to start';
  $('sound-state').classList.toggle('waiting', audio.state !== 'running');
}
audio.addEventListener('statechange', showSound);

// --- Playing the open track by hand: the computer's keys, and MIDI ---
const keyNotes = 'awsedftgyhujkolp;';
const held = new Map(); // key or MIDI note -> the note that's sounding
function noteOn(key, note, velocity = 0.8) {
  if (!selected || held.has(key)) return;
  wake();
  held.set(key, engine.noteOn(selected, note, velocity));
  flash(selected);
}
function noteOff(key) {
  engine.noteOff(held.get(key));
  held.delete(key);
}
window.addEventListener('keydown', (event) => {
  if (event.target.closest('input, select, textarea')) return;
  const key = event.key.toLowerCase();
  if ((event.metaKey || event.ctrlKey) && key === 'z') {
    event.preventDefault();
    return event.shiftKey ? redo() : undo();
  }
  if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
  if (key === ' ') {
    event.preventDefault();
    return startScene();
  }
  if (key === 'z' || key === 'x') {
    octave = Math.min(7, Math.max(0, octave + (key === 'x' ? 1 : -1)));
    remember({ octave });
    return studio.showOctave();
  }
  const step = keyNotes.indexOf(key);
  if (step >= 0 && key.length === 1) noteOn(key, 12 * (octave + 1) + step);
});
window.addEventListener('keyup', (event) => noteOff(event.key.toLowerCase()));
window.addEventListener('blur', () => [...held.keys()].forEach(noteOff));

let midi = null;
async function connectMidi() {
  if (!navigator.requestMIDIAccess) return say('This browser has no MIDI.');
  try {
    midi ??= await navigator.requestMIDIAccess();
  } catch {
    return say('MIDI wasn’t allowed.');
  }
  const inputs = [...midi.inputs.values()];
  for (const input of inputs) {
    input.onmidimessage = ({ data: [status, note, velocity] }) => {
      const kind = status & 0xf0;
      if (kind === 0x90 && velocity > 0) noteOn('midi' + note, note, velocity / 127);
      else if (kind === 0x80 || kind === 0x90) noteOff('midi' + note);
    };
  }
  say(inputs.length ? `Listening to ${inputs.map((input) => input.name).join(', ')}: it plays the open track.` : 'No MIDI keyboard found. Plug one in and press MIDI again.');
}

// --- Sound files dropped on the studio: saved into the section's sounds, and put in a sampler ---
async function dropped(files) {
  const added = [];
  for (const file of files) {
    try {
      const bytes = await file.arrayBuffer();
      const buffer = await audio.decodeAudioData(bytes.slice(0));
      const response = await fetch(`/__studio/sound?section=${section.id}&name=${encodeURIComponent(file.name)}`, { method: 'POST', body: bytes });
      if (!response.ok) throw new Error((await response.json()).error);
      const { src } = await response.json();
      engine.provide(src, buffer);
      library.sounds.push(src);
      added.push(src);
    } catch (error) {
      say(`${file.name} couldn’t be added: ${error.message ?? error}`);
    }
  }
  if (!added.length) return;
  let track = data.tracks.find((t) => t.id === selected && t.kind === 'sampler');
  if (!track) {
    track = newTrack('sampler', added[0].split('/').pop().replace(/\.[a-z0-9]+$/i, '').replace(/[-_]?\d+$/, '') || 'sampler');
    track.colour = data.tracks.length % 8;
    data.tracks.push(track);
    selected = track.id;
  }
  track.sampler.samples.push(...added.map((src) => ({ src, start: 0, end: 1 })));
  studio.commit();
  say(`Added ${added.length === 1 ? 'it' : `${added.length} sounds`} to “${track.name}” (saved in public/sounds/${section.sounds}).`);
}

// --- The meters, and where links have moved the open track's settings ---
const shownLevels = new Map();
let frames = 0;
function everyFrame() {
  requestAnimationFrame(everyFrame);
  if (!data) return;
  const fall = (id, level) => {
    const shown = Math.max(level, (shownLevels.get(id) ?? 0) * 0.88);
    shownLevels.set(id, shown);
    return shown;
  };
  for (const track of data.tracks) tracks.meter(track.id, fall(track.id, engine.level(track.id)));
  $('master-level').style.transform = `scaleX(${Math.min(1, Math.sqrt(fall('master', engine.level())))})`;
  $('limit').classList.toggle('on', engine.squashing() < -1);
  if (frames++ % 4 === 0 && selected) {
    for (const control of $('device').querySelectorAll('.card:not(.links) .knob[data-path]')) control.showLive(engine.liveValue(selected, control.dataset.path));
  }
}

// --- Setting up ---
let masterKnob;
async function begin() {
  window.studio = studio; // (For poking at from the console)
  tracks = makeTracks($('tracks'), studio);
  device = makeDevice($('device'), studio);
  lanes = makeLanes($('lanes'), { fire: (id) => heard(id, {}), coloursFor });
  scene = makeScene($('scene'), { onEvent: heard, onSignal: moved, onPage: pageChanged, onPress: wake, onRepeat: () => startScene() });

  for (const item of sections) {
    $('sections').append(h('button', { type: 'button', 'data-id': item.id, onclick: () => item.id !== section.id && openSection(item.id) }, item.label));
  }
  masterKnob = knob('master.volume', {
    get: () => data?.master?.volume ?? params['master.volume'].def,
    set(_, value) {
      data.master.volume = value;
      studio.touch();
    },
    commit: () => studio.commit({ quiet: true }),
  }, { small: true, label: 'master' });
  $('master-knob').append(masterKnob);

  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);
  $('restart').addEventListener('click', () => startScene());
  $('scene-select').addEventListener('change', () => {
    startScene(sceneList().find((item) => item.id === $('scene-select').value));
    $('scene-select').blur();
  });
  $('repeat').addEventListener('change', () => startScene());
  $('repeat-seconds').addEventListener('change', () => $('repeat').checked && startScene());
  $('all-events').addEventListener('change', showLanes);
  $('sound-state').addEventListener('click', () => {
    if (audio.state === 'running') {
      muted = true;
      audio.suspend();
    } else {
      muted = false;
      audio.resume();
    }
    showSound();
  });
  for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, wake, true);
  showSound();

  // The line between the scene and the tracks can be dragged
  const workspace = $('workspace');
  if (remembered().left) workspace.style.setProperty('--left', remembered().left + 'px');
  $('split').addEventListener('pointerdown', (event) => {
    $('split').setPointerCapture(event.pointerId);
    document.body.classList.add('splitting'); // (So the scene doesn't swallow the mouse on its way past)
    const move = (e) => workspace.style.setProperty('--left', Math.min(window.innerWidth - 380, Math.max(280, e.clientX)) + 'px');
    const stop = () => {
      $('split').removeEventListener('pointermove', move);
      document.body.classList.remove('splitting');
      remember({ left: parseFloat(workspace.style.getPropertyValue('--left')) });
    };
    $('split').addEventListener('pointermove', move);
    $('split').addEventListener('pointerup', stop, { once: true });
  });

  // Sound files dragged in
  let over = 0;
  const carrying = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');
  window.addEventListener('dragenter', (event) => carrying(event) && ++over && document.body.classList.add('dropping'));
  window.addEventListener('dragleave', (event) => carrying(event) && --over <= 0 && document.body.classList.remove('dropping'));
  window.addEventListener('dragover', (event) => carrying(event) && event.preventDefault());
  window.addEventListener('drop', (event) => {
    if (!carrying(event)) return;
    event.preventDefault();
    over = 0;
    document.body.classList.remove('dropping');
    dropped([...event.dataTransfer.files]);
  });

  try {
    library = await (await fetch('/__studio/library')).json();
  } catch {
    say('The studio only works while `npm run dev` is running.');
  }
  const wanted = remembered().section;
  openSection(sections.some((item) => item.id === wanted) ? wanted : 'landing');
  requestAnimationFrame(everyFrame);
}
begin();
