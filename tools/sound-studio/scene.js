// The scene: the real page, running in a frame, as wide as a laptop's screen and scaled down to fit. The studio
// hears what happens in it two ways: what the page says (through window.soundStudio, see
// src/scripts/scene_events.js), and what the visitor does in it (src/scripts/soundscape/visitor.js, watching the
// frame). If the page inside goes on to another (a portal's chosen, a link's clicked), it keeps up.
//
//   const scene = makeScene(holder, { onEvent(name, detail), onSignal(name, value), onPage(path), onPress() });
//   scene.start({ url, press: { after, at: [x, y] } }, { repeat: seconds or 0 });

import { watchVisitor } from '../../src/scripts/soundscape/visitor.js';

const wide = 1200; // How wide the page thinks it is (its height follows the shape of the space it's shown in)

export function makeScene(holder, hooks) {
  let frame = null;
  let seen = null; // The document that's being watched
  let stopVisitor = null;
  let timers = [];
  let fresh = false; // Is the page in the frame the one the scene started on (and not one it's gone on to)?
  let playing = null; // { scene, repeat }

  window.soundStudio = {
    heard(win, message) {
      if (!frame || win !== frame.contentWindow) return;
      if (message.kind === 'event') hooks.onEvent(message.name, message.detail ?? {});
      else hooks.onSignal(message.name, message.value);
    },
  };

  function fit() {
    if (!frame) return;
    const scale = holder.clientWidth / wide || 1;
    Object.assign(frame.style, {
      width: wide + 'px',
      height: Math.round(holder.clientHeight / scale) + 'px',
      transform: `translate(-50%, -50%) scale(${scale})`,
    });
  }
  new ResizeObserver(fit).observe(holder);

  const later = (seconds, then) => timers.push(setTimeout(then, seconds * 1000));

  // A press made for you, to set a transition off: once the page's canvas is there, and then after its wait
  function pressFor(win, { after, at }) {
    const canvas = win.document.querySelector('canvas');
    if (!canvas) return later(0.1, () => frame?.contentWindow === win && pressFor(win, { after, at }));
    later(after, () => {
      if (frame?.contentWindow !== win) return;
      const box = canvas.getBoundingClientRect();
      const where = { bubbles: true, clientX: box.left + box.width * at[0], clientY: box.top + box.height * at[1], pointerId: 1, isPrimary: true };
      canvas.dispatchEvent(new win.PointerEvent('pointerdown', where));
      canvas.dispatchEvent(new win.PointerEvent('pointerup', where));
    });
  }

  // Each frame: is there a new page in there? Then watch that one.
  function watch() {
    requestAnimationFrame(watch);
    let win = null;
    let doc = null;
    try {
      win = frame?.contentWindow;
      doc = win?.document;
      if (!doc || doc === seen || win.location.href === 'about:blank') return;
    } catch {
      return; // (Somewhere that isn't the site)
    }
    seen = doc;
    stopVisitor?.();
    stopVisitor = watchVisitor(win, { event: hooks.onEvent, signal: hooks.onSignal });
    for (const type of ['pointerdown', 'keydown']) win.addEventListener(type, () => hooks.onPress?.(), true);
    hooks.onPage(win.location.pathname, fresh);
    hooks.onEvent('open', {});
    if (fresh && playing?.scene.press) pressFor(win, playing.scene.press);
    fresh = false;
  }
  requestAnimationFrame(watch);

  return {
    // Starts a scene from its beginning (again, if it's the one that's showing)
    start(scene, { repeat = 0 } = {}) {
      timers.forEach(clearTimeout);
      timers = [];
      stopVisitor?.();
      stopVisitor = null;
      frame?.remove();
      seen = null;
      fresh = true;
      playing = { scene, repeat };
      frame = document.createElement('iframe');
      frame.title = 'The scene';
      frame.src = scene.url;
      holder.append(frame);
      fit();
      if (repeat > 0) later(repeat, () => hooks.onRepeat?.());
    },
    get scene() {
      return playing?.scene ?? null;
    },
  };
}
