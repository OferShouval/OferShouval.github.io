// The site's sound switch: a speaker that turns sound on and off on every page at once, and remembers the
// choice (in this browser) for the next page and the next visit. Until someone's tried it, it nudges them:
// it pulses gently, with "sound?" beside it.
//
// It's on until someone turns it off. Browsers only let a page make sound after it's been clicked or pressed, so
// being on only says it's wanted. Its sound starts on the page's first press after that: startAudio() gives the page's AudioContext,
// running, whenever sound's wanted, and onSoundChange() says when it's turned on or off.
//
// Any element with a data-sound attribute gets a speaker put in it. The wormhole puts its own in with
// soundButton().

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
const listeners = new Set();
const buttons = new Set();

export function soundWanted() {
  return wanted;
}

export function onSoundChange(listener) {
  listeners.add(listener);
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
  }
  context.resume().catch(() => {});
  return context;
}

// Turns it on or off, as the switch does. Only call it from a click or press.
export function setSound(on) {
  wanted = on;
  tried = true;
  write(choiceKey, on ? 'on' : 'off');
  write(triedKey, 'yes');
  if (on) startAudio();
  else context?.suspend();
  buttons.forEach(show);
  listeners.forEach((listener) => listener(on));
}

function show(button) {
  button.setAttribute('aria-pressed', String(wanted));
  button.classList.toggle('nudging', !tried);
}

// A speaker, with sound waves coming out of it while it's on, and a cross while it's off (see .sound-button in main.css)
export function soundButton() {
  const button = document.createElement('button');
  button.className = 'sound-button';
  button.setAttribute('aria-label', 'sound');
  button.innerHTML =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3.5v11L5 10H2z"/>' +
    '<path class="sound-waves" d="M11.5 5.5a3.5 3.5 0 0 1 0 5M13.5 3.5a6.5 6.5 0 0 1 0 9"/>' +
    '<path class="sound-off" d="M11.5 6l4 4M15.5 6l-4 4"/></svg>' +
    '<span class="sound-ask">sound?</span>';
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
