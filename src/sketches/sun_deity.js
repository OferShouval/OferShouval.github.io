// The opening of the installations page: a port of "Sun Deity" (2019) from its TouchDesigner file.
//
// Particles are born all over the surface of a sphere and live for a few seconds. In the piece, the
// performer's controller drove the only two forces on them, and they make all of its looks:
//   tilting it blows a wind from side to side, which carries the sun off to one side
//   shaking it stirs up turbulence, which throws out wisps and sparks
// With neither, the particles stay put, and the sun is a solid disc.
//
// Each frame goes on top of a blurred, slightly faded copy of the last, which is what fills the disc in
// and gives everything its glow and its trails. In the piece that light was projected onto a sheet of
// fluorescent orange acrylic, which glows orange wherever it's lit, and turns yellow where it's bright.
// So here the amount of light on each spot picks a colour, from the bare sheet's red-orange up to yellow.
//
// Here, moving the pointer takes the place of the controller: how far it is to the side of the sun is
// the tilt, how fast it's moving is the shake, and pressing it is the hardest shake of all. When nobody's
// touching it, it plays by itself.

// From the file
const SPHERE_RADIUS = 4;
const BIRTHS_PER_SECOND = 5000;
const LIFE = 3; // How many seconds a particle lives, on average...
const LIFE_VARIES = 3; // ...give or take this many
const MOST_WIND = 5; // The furthest the tilt could push the wind, either way
const PRESSED_SHAKE = 50; // How much turbulence while the pointer's pressed: the hardest the controller could be shaken
const KEPT = 0.95; // How much of the last frame's light is kept

// Not stored in the file, as they were left at TouchDesigner's defaults, or matched to the video by eye
const DRAG = 0.6; // How quickly the wind gets a particle up to its speed
const SWIRL_SIZE = 0.13; // How small the swirls in the turbulence are (bigger = smaller)
const SWIRL_SPEED = 0.25; // How quickly the swirls change, per second
const JITTER = 0.5; // How much of the turbulence is random, for each particle, rather than swirls
const MOST_SHAKE = 26; // The most turbulence the pointer can stir up
const SHAKE_FROM_POINTER = 0.09; // How much turbulence for each pixel per second the pointer's moving
const POINTER_TAKES_OVER = 2.5; // How many seconds after the pointer last moved it goes back to playing by itself
const EASING = 2; // How quickly the forces change, per second (a hand can't jerk them instantly)
const LIGHT = 0.3; // How much light each particle gives

const FIELD_WIDTH = 720; // How many pixels wide the grid is, at most
const SUN_SIZE = 0.24; // How big around the sun is, compared to the shorter side of the grid

// What it does by itself: for each, how many seconds, the wind, and the turbulence
const PERFORMANCE = [
  [5, 0, 0], // Still: a solid disc
  [5, 0, 7], // A gentle shake: wisps
  [5, 3, 1], // A tilt one way: it dissolves off to that side
  [4, 0, 22], // A hard shake: sparks flying off
  [4, 0, 0],
  [5, -3, 3], // A tilt the other way
  [4, 0, 12],
];

// How much light on a spot -> its colour
const COLOURS = [
  [0, 232, 62, 8],
  [0.1, 224, 42, 6],
  [0.5, 250, 92, 0],
  [1.1, 255, 158, 0],
  [2, 255, 232, 8],
  [3.2, 255, 244, 60],
];
const MOST_LIGHT = COLOURS[COLOURS.length - 1][0];
const SHADES = 512;

let canvas = document.querySelector('.sun-field');
let section = canvas.parentElement;
let context = canvas.getContext('2d');
let shades = makeShades();

let width, height, image, grid, spare, sheet;
let centreX, centreY, scale; // Where the sun is on the grid, and how many of its pixels to one of the file's units
let birthsPerSecond, capacity, x, y, z, vx, vy, vz, age, life;
let next = 0; // Where the next particle to be born goes (the oldest gets written over)
let owed = 0; // How many particles are due to be born, including part of one left over from last frame

let wind = 0;
let shake = 0;
let pointerWind = 0;
let pointerShake = 0;
let pointerMovedAt = -Infinity;
let lastPointer = null;
let pressed = false;
let lastFrame = null;
let running = false;

function setup() {
  let box = section.getBoundingClientRect();
  width = Math.min(FIELD_WIDTH, Math.round(box.width));
  height = Math.max(1, Math.round((width * box.height) / box.width));
  canvas.width = width;
  canvas.height = height;
  image = context.createImageData(width, height);
  grid = new Float32Array(width * height);
  spare = new Float32Array(width * height);
  sheet = makeSheet();

  centreX = width / 2;
  centreY = height * 0.56; // A little below the middle, leaving room for the title
  let radius = Math.min(width, height) * SUN_SIZE;
  scale = radius / SPHERE_RADIUS;

  // The same number of particles to each pixel of the sun, whatever size it's drawn
  birthsPerSecond = (BIRTHS_PER_SECOND * (radius * radius)) / (80 * 80);
  capacity = Math.ceil(birthsPerSecond * (LIFE + LIFE_VARIES));
  x = new Float32Array(capacity);
  y = new Float32Array(capacity);
  z = new Float32Array(capacity);
  vx = new Float32Array(capacity);
  vy = new Float32Array(capacity);
  vz = new Float32Array(capacity);
  age = new Float32Array(capacity);
  life = new Float32Array(capacity); // (All 0 to begin with, which means not alive)
  next = 0;

  // Start it off as if it had already been running, so it opens on a whole sun
  for (let i = 0; i < birthsPerSecond * LIFE; i++) bear(Math.random() * LIFE);
}

// A particle is born somewhere on the sphere
function bear(startingAge) {
  let i = next;
  next = (next + 1) % capacity;
  let up = Math.random() * 2 - 1;
  let around = Math.random() * Math.PI * 2;
  let out = Math.sqrt(1 - up * up);
  x[i] = Math.cos(around) * out * SPHERE_RADIUS;
  y[i] = up * SPHERE_RADIUS;
  z[i] = Math.sin(around) * out * SPHERE_RADIUS;
  vx[i] = 0;
  vy[i] = 0;
  vz[i] = 0;
  age[i] = startingAge;
  life[i] = Math.max(0.1, LIFE + (Math.random() * 2 - 1) * LIFE_VARIES);
}

// What the forces should be now, from the pointer if it's been moving, and otherwise the performance
function moveForces(seconds, step) {
  let goalWind;
  let goalShake;
  pointerShake *= Math.exp(-step * 3);
  if (seconds - pointerMovedAt < POINTER_TAKES_OVER) {
    goalWind = pointerWind;
    goalShake = pointerShake;
  } else {
    let total = PERFORMANCE.reduce((sum, part) => sum + part[0], 0);
    let at = seconds % total;
    let part = PERFORMANCE.find((candidate) => {
      if (at < candidate[0]) return true;
      at -= candidate[0];
      return false;
    });
    goalWind = part[1];
    goalShake = part[2];
  }
  if (pressed) goalShake = PRESSED_SHAKE;
  let ease = 1 - Math.exp(-step * EASING);
  wind += (goalWind - wind) * ease;
  shake += (goalShake - shake) * ease;
}

function moveParticles(seconds, step) {
  owed += birthsPerSecond * step;
  while (owed >= 1) {
    bear(0);
    owed--;
  }

  let stirred = shake > 0.05;
  let swirlTime = seconds * SWIRL_SPEED;
  let swirling = shake * (1 - JITTER) * step;
  let jitter = shake * JITTER * step * 2;
  let gap = 0.05; // How far apart to measure the swirls' slope
  let pull = 1 - Math.exp(-step * DRAG);

  for (let i = 0; i < capacity; i++) {
    if (age[i] >= life[i]) continue;
    age[i] += step;
    vx[i] += (wind - vx[i]) * pull;
    vy[i] -= vy[i] * pull;
    vz[i] -= vz[i] * pull;
    if (stirred) {
      // Round the slopes of the noise, not down them, which moves them along without bunching them up
      let nx = x[i] * SWIRL_SIZE;
      let ny = y[i] * SWIRL_SIZE;
      let here = noise(nx, ny, swirlTime);
      vx[i] += ((noise(nx, ny + gap, swirlTime) - here) / gap) * swirling + (Math.random() - 0.5) * jitter;
      vy[i] -= ((noise(nx + gap, ny, swirlTime) - here) / gap) * swirling - (Math.random() - 0.5) * jitter;
      vz[i] += (Math.random() - 0.5) * jitter;
    }
    x[i] += vx[i] * step;
    y[i] += vy[i] * step;
    z[i] += vz[i] * step;
  }
}

// Blur the light a little and fade it, by a hair each way, in place
function fadeAndBlur() {
  let last = width * height;
  for (let row = 0; row < height; row++) {
    let start = row * width;
    for (let column = 0; column < width; column++) {
      let i = start + column;
      let before = column > 0 ? grid[i - 1] : grid[i];
      let after = column < width - 1 ? grid[i + 1] : grid[i];
      spare[i] = (before + grid[i] * 2 + after) * 0.25;
    }
  }
  for (let i = 0; i < last; i++) {
    let above = i >= width ? spare[i - width] : spare[i];
    let below = i < last - width ? spare[i + width] : spare[i];
    grid[i] = (above + spare[i] * 2 + below) * 0.25 * KEPT;
  }
}

function paint() {
  fadeAndBlur();

  // Each particle lands on the four nearest spots, shared out by how near it is, so it moves smoothly
  for (let i = 0; i < capacity; i++) {
    if (age[i] >= life[i]) continue;
    let px = centreX + x[i] * scale;
    let py = centreY - y[i] * scale;
    let left = Math.floor(px);
    let top = Math.floor(py);
    if (left < 0 || top < 0 || left >= width - 1 || top >= height - 1) continue;
    let fx = px - left;
    let fy = py - top;
    let spot = top * width + left;
    grid[spot] += (1 - fx) * (1 - fy) * LIGHT;
    grid[spot + 1] += fx * (1 - fy) * LIGHT;
    grid[spot + width] += (1 - fx) * fy * LIGHT;
    grid[spot + width + 1] += fx * fy * LIGHT;
  }

  let pixels = image.data;
  let toShade = (SHADES - 1) / MOST_LIGHT;
  for (let i = 0, p = 0; i < grid.length; i++, p += 4) {
    let shade = Math.min(SHADES - 1, (grid[i] * toShade) | 0) * 3;
    // The acrylic's own marks show on the bare sheet, and the light drowns them out
    let marks = 1 + (sheet[i] - 1) * (1 - Math.min(1, grid[i]) * 0.8);
    pixels[p] = shades[shade] * marks;
    pixels[p + 1] = shades[shade + 1] * marks;
    pixels[p + 2] = shades[shade + 2] * marks;
    pixels[p + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function frame(now) {
  if (!running) return;
  let seconds = now / 1000;
  // (Limited, so coming back to the tab after a long time away doesn't throw everything off)
  let step = lastFrame === null ? 1 / 60 : Math.min(seconds - lastFrame, 1 / 20);
  lastFrame = seconds;
  moveForces(seconds, step);
  moveParticles(seconds, step);
  paint();
  requestAnimationFrame(frame);
}

// The colours, worked out ahead of time, as red, green, blue, red, green, blue...
function makeShades() {
  let table = new Uint8ClampedArray(SHADES * 3);
  for (let i = 0; i < SHADES; i++) {
    let value = (i / (SHADES - 1)) * MOST_LIGHT;
    let upper = COLOURS.findIndex((stop) => stop[0] >= value);
    let b = COLOURS[Math.max(upper, 0)];
    let a = COLOURS[Math.max(upper - 1, 0)];
    let along = b[0] === a[0] ? 0 : (value - a[0]) / (b[0] - a[0]);
    for (let channel = 0; channel < 3; channel++) table[i * 3 + channel] = a[channel + 1] + (b[channel + 1] - a[channel + 1]) * along;
  }
  return table;
}

// The sheet of acrylic, as how much lighter or darker each spot is: uneven all over, with faint
// up-and-down lines from how it was made, and a little grain
function makeSheet() {
  let marks = new Float32Array(width * height);
  let lines = new Float32Array(width);
  for (let column = 0; column < width; column++) lines[column] = (Math.random() - 0.5) * 0.035;
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      let uneven = (noise(column * 0.006, row * 0.006, 4.2) - 0.5) * 0.14;
      marks[row * width + column] = 1 + uneven + lines[column] + (Math.random() - 0.5) * 0.025;
    }
  }
  return marks;
}

// Smooth noise from 0 to 1, in three dimensions
const lattice = new Float32Array(256).map(() => Math.random());
const mix = new Uint8Array(512);
{
  let order = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (let i = 0; i < 512; i++) mix[i] = order[i & 255];
}

function noise(px, py, pz) {
  let ix = Math.floor(px);
  let iy = Math.floor(py);
  let iz = Math.floor(pz);
  let fx = px - ix;
  let fy = py - iy;
  let fz = pz - iz;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  ix &= 255;
  iy &= 255;
  iz &= 255;
  let at = (a, b, c) => lattice[mix[mix[(ix + a) & 255] + ((iy + b) & 255)] ^ ((iz + c) & 255)];
  let near = lerp(lerp(at(0, 0, 0), at(1, 0, 0), fx), lerp(at(0, 1, 0), at(1, 1, 0), fx), fy);
  let far = lerp(lerp(at(0, 0, 1), at(1, 0, 1), fx), lerp(at(0, 1, 1), at(1, 1, 1), fx), fy);
  return lerp(near, far, fz);
}

function lerp(a, b, along) {
  return a + (b - a) * along;
}

function start() {
  if (running) return;
  running = true;
  lastFrame = null;
  requestAnimationFrame(frame);
}

function stop() {
  running = false;
}

section.addEventListener('pointermove', (event) => {
  let box = section.getBoundingClientRect();
  let now = performance.now() / 1000;
  // How far to the side of the sun it is is the tilt
  pointerWind = constrain((event.clientX - box.left) / box.width - 0.5, -0.5, 0.5) * 2 * MOST_WIND;
  // How fast it's moving is the shake
  if (lastPointer && now > lastPointer.at) {
    let speed = Math.hypot(event.clientX - lastPointer.x, event.clientY - lastPointer.y) / (now - lastPointer.at);
    pointerShake = Math.max(pointerShake, Math.min(MOST_SHAKE, speed * SHAKE_FROM_POINTER));
  }
  lastPointer = { x: event.clientX, y: event.clientY, at: now };
  pointerMovedAt = now;
});

section.addEventListener('pointerdown', () => {
  pressed = true;
});
// (On the window, so that letting go anywhere counts)
window.addEventListener('pointerup', () => {
  pressed = false;
});
window.addEventListener('pointercancel', () => {
  pressed = false;
});

function constrain(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

setup();

if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
  // Asking for less motion: just the sun, still
  for (let i = 0; i < 60; i++) paint();
} else {
  // Only while it's in view
  new IntersectionObserver(([entry]) => (entry.isIntersecting && !document.hidden ? start() : stop())).observe(section);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (section.getBoundingClientRect().bottom > 0) start();
  });
  let resizing;
  new ResizeObserver(() => {
    clearTimeout(resizing);
    resizing = setTimeout(setup, 150);
  }).observe(section);
}
