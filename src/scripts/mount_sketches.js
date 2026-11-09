import p5 from 'p5';

// The friendly-error checker slows every p5 call; it stays on in `npm run dev` to help while writing sketches.
p5.disableFriendlyErrors = import.meta.env.PROD;

// Mounts sketches from src/wormhole/ (the front page's wormhole) and src/sketchbook/ (loose sketches) into
// <div class="sketch" data-sketch="name"> containers, by the file's name without .js.
// Each sketch's code loads only when its container nears the viewport, and sketches pause while
// off screen, so a page can hold many of them.

const sketches = import.meta.glob(['../wormhole/*.js', '../sketchbook/*.js']);
const running = new Map(); // container -> { p, wasLooping }

async function start(container) {
  const name = container.dataset.sketch;
  const load = sketches[`../wormhole/${name}.js`] ?? sketches[`../sketchbook/${name}.js`];
  if (!load) {
    console.error(`No sketch named "${name}" in src/wormhole/ or src/sketchbook/`);
    return;
  }
  running.set(container, { p: null, wasLooping: true });
  const { default: sketch } = await load();
  running.get(container).p = new p5((p) => sketch(p, container), container);
}

function pause(container) {
  const entry = running.get(container);
  if (!entry?.p) return;
  entry.wasLooping = entry.p.isLooping();
  entry.p.noLoop();
}

function resume(container) {
  const entry = running.get(container);
  if (entry?.p && entry.wasLooping) entry.p.loop();
}

const visibility = new IntersectionObserver(
  (entries) => {
    entries.forEach(({ isIntersecting, target }) => {
      if (!isIntersecting) pause(target);
      else if (running.has(target)) resume(target);
      else start(target);
    });
  },
  { rootMargin: '200px 0px' }
);

// Keep each canvas matched to its container's size.
const sizes = new ResizeObserver((entries) => {
  entries.forEach(({ target }) => {
    const p = running.get(target)?.p;
    if (p && (p.width != target.clientWidth || p.height != target.clientHeight)) {
      p.resizeCanvas(target.clientWidth, target.clientHeight);
    }
  });
});

document.querySelectorAll('.sketch[data-sketch]').forEach((container) => {
  visibility.observe(container);
  sizes.observe(container);
});
