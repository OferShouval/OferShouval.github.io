// The site's sound switch: a speaker that turns sound on and off on every page at once, and remembers the
// choice (in this browser) for the next page and the next visit. Until someone's tried it, it nudges them:
// it pulses gently, with "sound?" beside it.
//
// It's on until someone turns it off. Browsers only let a page make sound after it's been clicked or pressed, so
// being on only says it's wanted. Its sound starts on the page's first press after that: startAudio() gives the page's AudioContext,
// running, whenever sound's wanted, and onSoundChange() says when it's turned on or off.
//
// Any element with a data-sound attribute gets a speaker put in it. The wormhole puts its own in with
// soundButton({ track: true }).
//
// Sound that goes through audioOut() fades in as it's turned on, rather than cutting in, and fades out as it's turned
// off.

const choiceKey = 'sound'; // 'on' or 'off'
const triedKey = 'soundTried'; // Set once someone's pressed a speaker, so it stops nudging

// Browser storage can be missing or blocked, so it's only ever a nice-to-have
function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

let wanted = read(choiceKey) !== 'off'; // On until someone chooses otherwise
let tried = read(triedKey) !== null;
let context = null;
let out = null; // What audioOut() gives: everything going through it fades in and out with the switch
const fadeIn = 2; // How many seconds the sound takes to come up as it's turned on
const fadeOut = 0.3; // ...and to go as it's turned off
const listeners = new Set();
const buttons = new Set();

export function soundWanted() {
  return wanted;
}

// What's been chosen in this browser: 'on', 'off', or null if nobody's chosen yet
export function soundChosen() {
  return read(choiceKey);
}

export function onSoundChange(listener) {
  listeners.add(listener);
}

// Where to connect sound that should fade in and out with the switch, while the sound's running (and null if it isn't)
export function audioOut() {
  return out && context.state === 'running' ? out : null;
}

function fadeTo(level, seconds) {
  if (!out) return;
  const now = context.currentTime;
  out.gain.cancelScheduledValues(now);
  out.gain.setValueAtTime(out.gain.value, now);
  out.gain.linearRampToValueAtTime(level, now + seconds);
}

// The page's AudioContext, running, if sound's wanted (and null if it isn't). Only call it from a click or press.
export function startAudio() {
  if (!wanted) return null;
  if (!context) {
    context = new AudioContext();
    // So iPhones play it even with the ringer switched to silent, as they do videos and music
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {}
    out = context.createGain();
    out.gain.value = 0;
    out.connect(context.destination);
  }
  context.resume().catch(() => {});
  fadeTo(1, fadeIn);
  return context;
}

// Turns it on or off, as the switch does. Only call it from a click or press. With remember false it's only for now,
// on this page: nothing's saved, and the switches still nudge, as nobody's chosen.
export function setSound(on, { remember = true } = {}) {
  wanted = on;
  if (remember) {
    tried = true;
    write(choiceKey, on ? 'on' : 'off');
    write(triedKey, 'yes');
  }
  if (on) startAudio();
  else if (context) {
    fadeTo(0, fadeOut);
    setTimeout(() => !wanted && context.suspend(), fadeOut * 1000 + 50); // Once it's faded, unless it's back on
  }
  buttons.forEach(show);
  listeners.forEach((listener) => listener(on));
}

function show(button) {
  button.setAttribute('aria-pressed', String(wanted));
  button.classList.toggle('nudging', !tried);
}

// A speaker, with sound waves coming out of it while it's on, and a cross while it's off (see .sound-button in main.css).
// With { track: true } it's a switch too: the speaker beside a track with a knob, left for off and right for on, all in
// thin lines (see .sound-switch), as the wormhole has it.
export function soundButton({ track = false } = {}) {
  const button = document.createElement('button');
  button.className = track ? 'sound-button sound-switch' : 'sound-button';
  button.setAttribute('aria-label', 'sound');
  const speaker =
    '<path d="M2 6h3l4-3.5v11L5 10H2z"/>' +
    '<path class="sound-waves" d="M11.5 5.5a3.5 3.5 0 0 1 0 5M13.5 3.5a6.5 6.5 0 0 1 0 9"/>' +
    '<path class="sound-off" d="M11.5 6l4 4M15.5 6l-4 4"/>';
  button.innerHTML = track
    ? `<svg viewBox="0 0 40 16" aria-hidden="true">${speaker}` +
      '<rect class="sound-track" x="21" y="3.5" width="18" height="9" rx="4.5"/>' +
      '<circle class="sound-knob" cx="25.5" cy="8" r="2.6"/></svg>'
    : `<svg viewBox="0 0 16 16" aria-hidden="true">${speaker}</svg><span class="sound-ask">sound?</span>`;
  // The sketches behind it listen for presses anywhere on the page, so keep this one to itself
  for (const type of ['pointerdown', 'mousedown', 'touchstart']) button.addEventListener(type, (event) => event.stopPropagation());
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    setSound(!wanted);
    if (event.detail > 0) button.blur(); // Clicked, not pressed from the keyboard: so the arrow keys go back to steering
  });
  buttons.add(button);
  show(button);
  return button;
}

// A press starts the page's sound, if it's wanted and hasn't started yet. iPhones only let it start as a finger
// lifts (touchend, click), not as it touches down, so it tries on each of those.
for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
  window.addEventListener(type, () => context?.state !== 'running' && startAudio(), { capture: true });
}

document.querySelectorAll('[data-sound]').forEach((spot) => spot.append(soundButton()));
