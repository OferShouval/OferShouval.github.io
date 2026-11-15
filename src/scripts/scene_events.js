// What's happening on a page, said out loud, so that its sound can follow it. A sketch says when something happens:
//
//   sceneEvent('drop', { loud: 0.6, pan: -0.3 }); // A raindrop's landed: how loud (0 to 1) and how far to the side (-1 to 1)
//   sceneSignal('boost', 0.4); // Something that keeps moving, from 0 to 1, said as often as it changes
//
// ...and whatever plays the page's sound listens with onScene(). Saying something costs nothing if nobody's listening,
// so sketches can say as much as they like. The names a page says are listed, with what they mean, in
// tools/sound-studio/catalogue.js, which is where the sound studio gets its list of events from.
//
// While `npm run dev` runs, a page shown inside the sound studio (tools/sound-studio) tells the studio too, which
// plays the sounds being composed for it.

const listeners = new Set();
const levels = new Map(); // Each signal, as it was last said

let studio = null;
if (import.meta.env?.DEV) {
  try {
    if (window.parent !== window) studio = window.parent.soundStudio ?? null;
  } catch {} // (Inside someone else's frame)
}

function tell(message) {
  for (const listener of listeners) listener(message);
  try {
    studio?.heard(window, message);
  } catch {}
}

// Something's happened. `detail` can say how `loud` it was (0 to 1) and where, from left to right (`pan`, -1 to 1).
export function sceneEvent(name, detail = {}) {
  tell({ kind: 'event', name, detail });
}

// Something that keeps changing is now at `value` (0 to 1)
export function sceneSignal(name, value) {
  const level = Math.min(1, Math.max(0, value || 0));
  if (Math.abs((levels.get(name) ?? -1) - level) < 0.002) return; // (Not enough of a change to say)
  levels.set(name, level);
  tell({ kind: 'signal', name, value: level });
}

// Things that will happen at known times from now: sceneEventsIn({ 'worm-forms': 3.5, 'worm-springs': 5.1 }), in seconds
export function sceneEventsIn(times) {
  for (const [name, seconds] of Object.entries(times)) setTimeout(() => sceneEvent(name), seconds * 1000);
}

// A signal that climbs steadily from 0 to 1 over this many seconds, starting now
export function sceneRamp(name, seconds) {
  const start = performance.now();
  const step = () => {
    const t = Math.min(1, (performance.now() - start) / (seconds * 1000));
    sceneSignal(name, t);
    if (t < 1) requestAnimationFrame(step);
  };
  step();
}

// Listening: `listener` is given { kind: 'event', name, detail } or { kind: 'signal', name, value }. Gives back what stops it.
export function onScene(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
