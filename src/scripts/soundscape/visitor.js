// What the visitor does, as events and signals for a soundscape (see engine.js): the same on every page, with no help
// from the page. The sound studio lists them from tools/sound-studio/catalogue.js.
//
//   events:  'press' (a click or a tap), 'release' (letting go), 'key', 'hover' (pointing at a link or a button)
//   signals: 'mouse-x' and 'mouse-y' (where the pointer is, 0 to 1), 'mouse-speed' (how fast it's moving: 1 is about
//            a screen and a half a second), 'holding' (1 while pressed), 'scroll' (how far down the page, 0 to 1),
//            'scroll-speed'
//
//   const stop = watchVisitor(window, { event: engine.event, signal: engine.signal });

export function watchVisitor(win, { event, signal }) {
  const stops = [];
  const on = (target, type, handler) => {
    target.addEventListener(type, handler, { capture: true, passive: true });
    stops.push(() => target.removeEventListener(type, handler, { capture: true }));
  };
  const side = (x) => ((x / (win.innerWidth || 1)) * 2 - 1) * 0.7; // Where across the screen, as a pan

  let last = null; // Where the pointer last was, and when
  let speed = 0;
  let scrolled = win.scrollY;
  let scrollSpeed = 0;
  let over = null;
  let frame = 0;

  // The speeds fall away by themselves once the moving stops
  function settle() {
    speed *= 0.88;
    scrollSpeed *= 0.88;
    signal('mouse-speed', speed < 0.004 ? 0 : speed);
    signal('scroll-speed', scrollSpeed < 0.004 ? 0 : scrollSpeed);
    frame = speed >= 0.004 || scrollSpeed >= 0.004 ? win.requestAnimationFrame(settle) : 0;
  }
  const settling = () => (frame ||= win.requestAnimationFrame(settle));

  on(win, 'pointermove', (e) => {
    signal('mouse-x', e.clientX / (win.innerWidth || 1));
    signal('mouse-y', e.clientY / (win.innerHeight || 1));
    const now = performance.now();
    if (last && now > last.time) {
      const screens = Math.hypot(e.clientX - last.x, e.clientY - last.y) / Math.hypot(win.innerWidth, win.innerHeight);
      speed = Math.max(speed, Math.min(1, (screens / ((now - last.time) / 1000)) / 1.5));
      settling();
    }
    last = { x: e.clientX, y: e.clientY, time: now };
  });
  on(win, 'pointerdown', (e) => {
    signal('holding', 1);
    event('press', { pan: side(e.clientX) });
  });
  on(win, 'pointerup', (e) => {
    signal('holding', 0);
    event('release', { pan: side(e.clientX) });
  });
  on(win, 'pointercancel', () => signal('holding', 0));
  on(win, 'keydown', (e) => !e.repeat && !e.metaKey && !e.ctrlKey && event('key'));
  on(win, 'pointerover', (e) => {
    const link = e.target.closest?.('a, button') ?? null;
    if (link && link !== over) event('hover', { pan: side(e.clientX) });
    over = link;
  });
  on(win, 'scroll', () => {
    const room = win.document.documentElement.scrollHeight - win.innerHeight;
    signal('scroll', room > 0 ? win.scrollY / room : 0);
    scrollSpeed = Math.max(scrollSpeed, Math.min(1, Math.abs(win.scrollY - scrolled) / (win.innerHeight * 0.25)));
    scrolled = win.scrollY;
    settling();
  });

  return () => {
    for (const stop of stops) stop();
    if (frame) win.cancelAnimationFrame(frame);
  };
}
