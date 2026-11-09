// "Refracture" (2018): a camera feed chopped up into lines, made to look like the photos of the installation.
//
// The picture is sampled on a grid of thin rows. Along each row, wherever the brightness changes sharply (an edge, like
// the outline of a face against the room), there's a bright white speck, and from each speck a streak runs to the right
// as far as the next one, in the picture's own colour where it starts, paled and varied a little. Until a row's first
// edge, it's black. So the outline of whoever's in front of it sparkles, and the picture smears off sideways from it.
// (The original Processing sketch worked from a fixed brightness instead, which needed a very bright, dark-backed scene.)
//
// To start with it shows a video of Ofer (see recording), and the viewer can turn on their own camera instead, which
// only starts when it's asked for, and what it sees never leaves the browser. Turning it off goes back to the video.
// The up and down arrow keys change the threshold (see MODES), and the left and right ones how much the colours vary.
// It only runs
// while it's on the screen.
//
// It's drawn as if it were projected onto the installation's paper screen: a pale panel in a thin wooden frame,
// hanging on strings in a dark room, with the picture soft and glowing on it and the paper's fibres showing through.

const VIDEO_SCALE = 4; // Size of each cell in the grid: the height of each row, and how finely it's looked along
const STREAK = 0.7; // How thick the streaks are, compared to their rows, leaving a thin gap between them
const SATURATE = 2.7; // How much more colourful than the picture the streaks are (1 = just as it is)
const LIFT = 10; // How much brighter they're made, out of 255
// How chaotic they are
const OVERSHOOT = [-3, 18]; // How many cells a streak stops short of the next edge, or carries on past it, at the least and the most
const STRAY = 0.12; // How often a streak carries on all the way to the edge
const SKIP = 0.16; // How often one's left out
const WOBBLE = 1.2; // How far up or down a streak can be out of its row, in pixels
const THICKNESS = [0.32, 1]; // How thick a streak is, compared to its row, at the least and the most
const BRIGHTNESS = [0.72, 1.12]; // How bright a streak is, compared to its colour, at the least and the most
const SPECK = 1.6; // How big the white specks are, in pixels, usually
// ...and how unevenly they're set: some left out, scattered off the edge, in clusters, or out along the streaks
const SPECK_SKIP = 0.17; // How often one's left out
const SPECK_SCATTER = [1.5, 1]; // How far one can be off its edge, across and up or down, in pixels
const SPECK_SIZES = [0.5, 1.8]; // Its size, compared to SPECK, at the least and the most (now and then bigger still)
const SPECK_CLUSTER = 0.07; // How often one comes with a couple of others close by
const SPECK_STRAY = 0.025; // How often a streak has a speck somewhere along it, too
const SMOOTH = 1; // How many cells either side are averaged to find the edges, so it's outlines, not grain
const recording = '/media/refracture-ofer.mp4'; // The video it shows until the camera's turned on
const THRESHOLD_STEP = 4;
// The paper screen: how far in from the canvas's edges it hangs, as shares of its width and height
const SCREEN = { side: 0.1, top: 0.15, bottom: 0.08 };
// The colours, in two schemes, after two photos of the installation. SCHEME picks which.
// warm: a dim, warm room, the screen dark where nothing's on it, the streaks in muted pastels (sage, cream, dusty pink,
//   beige, pale grey), and a pale wooden frame
// blue: the room lit blue, the paper catching it, the streaks mostly coral red with now and then green or cyan
const SCHEME = 'warm';
const SCHEMES = {
  warm: {
    room: [[40, 32, 25], [10, 8, 7]], // Lit: near the screen, and away from it
    darkRoom: [[9, 8, 7], [3, 3, 3]], // ...and before anything's projected
    unlit: [20, 20, 22], // The paper with nothing on it, lit...
    darkPaper: [11, 11, 12], // ...and before anything's projected
    paper: 'rgb(255, 249, 238)', // The paper's colour, which tints whatever's on it
    line: [215, 195, 160], // The frame and the strings
    palette: [[150, 182, 165], [236, 229, 212], [208, 166, 162], [202, 190, 168], [190, 195, 196], [176, 206, 186]],
    accents: [],
    variation: 14, // How much each streak's colour varies
  },
  blue: {
    room: [[28, 42, 110], [10, 16, 48]],
    darkRoom: [[9, 12, 26], [4, 5, 12]],
    unlit: [100, 113, 140],
    darkPaper: [26, 29, 38],
    paper: 'rgb(226, 236, 255)',
    line: [175, 195, 255],
    palette: [[180, 40, 55], [240, 115, 105]], // From the picture's dark parts to its bright ones
    accents: [[[60, 195, 120], 0.12], [[70, 170, 230], 0.06]], // [colour, how often]
    variation: 50,
  },
};
const COLOURS = SCHEMES[SCHEME];
// Before anything's projected it's all quite dark, and it comes up when the projection starts
const LIGHT_UP = 1.2; // How many seconds it takes to come up
const WARP = 2.6; // How far the paper ripples, in pixels
const WARP_SPEED = 0; // How quickly its ripples shift (0 = they stay still)
const GLOW = 0.45; // How strongly the picture glows on the paper
const SPILL = 0.3; // ...and how much of its light spills onto the wall around it
const BLOOM = [0.3, 0.25]; // How strongly the streaks themselves glow: close round them, and further out
const BOIL = 8; // How many times a second the pen lines are drawn again, a little differently

// Two kinds of threshold (only brightness is used at the moment: see mode):
//   edges: wherever the brightness changes sharply, a speck, and a streak smearing off to the right from it
//   brightness: wherever it's brighter than the threshold, filled with short broken streaks, and black elsewhere, as in
//     the original sketch and its linear boil demo
const MODES = {
  edges: { threshold: 28, least: 4, most: 120 }, // How sharp a change in brightness (out of 255) counts as an edge
  brightness: { threshold: 120, least: 10, most: 245 }, // How bright (out of 255) is bright enough
};
const PIECES = [3, 14]; // In brightness, how many cells long each piece of a streak is, at the least and the most
let mode = 'brightness';
let threshold = MODES[mode].threshold;
let randomFactor = COLOURS.variation; // How much the streaks' colours vary

let holder = document.querySelector('.refracture');
let canvas = holder.querySelector('canvas');
let button = holder.querySelector('.refracture-camera');
let readout = holder.querySelector('.refracture-readout');
let view = canvas.getContext('2d'); // The room, with the screen in it
let projection = document.createElement('canvas'); // What's projected, drawn first by itself
let context = projection.getContext('2d');
let paper = document.createElement('canvas'); // The paper's texture, made once for each size
let sheet = document.createElement('canvas'); // The paper with the picture on it, flat, before it's warped
let sheetContext = sheet.getContext('2d');
let screen; // Where the screen hangs on the canvas, in its pixels
let video = document.createElement('video');
video.playsInline = true;
video.muted = true;
video.loop = true;
let source = null; // 'recording' or 'camera', once one's playing
let hasRecording = true; // Until it turns out not to load
let showing = false; // Is it on the screen?

// The picture, one pixel to each cell of the grid
let sampler = document.createElement('canvas');
let samplerContext = sampler.getContext('2d', { willReadFrequently: true });

let width, height, cols, rows, density;
let stream = null;
let lastTime = -1;

function fit() {
  let box = canvas.getBoundingClientRect();
  density = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(box.width * density);
  canvas.height = Math.round(box.height * density);
  screen = {
    x: Math.round(box.width * SCREEN.side),
    y: Math.round(box.height * SCREEN.top),
    wide: Math.round(box.width * (1 - SCREEN.side * 2)),
    tall: Math.round(box.height * (1 - SCREEN.top - SCREEN.bottom)),
    room: { wide: box.width, tall: box.height },
  };
  // What's projected is worked out at the screen's size
  width = screen.wide;
  height = screen.tall;
  projection.width = width * density;
  projection.height = height * density;
  sheet.width = width * density;
  sheet.height = height * density;
  cols = Math.floor(width / VIDEO_SCALE);
  rows = Math.floor(height / VIDEO_SCALE);
  sampler.width = cols;
  sampler.height = rows;
  makePaper();
  blank();
}

// Paper: nearly white, a little uneven, with faint fibres
function makePaper() {
  paper.width = width;
  paper.height = height;
  let ink = paper.getContext('2d');
  let grain = ink.createImageData(width, height);
  for (let i = 0; i < grain.data.length; i += 4) {
    let shade = 255 - Math.random() * 16;
    grain.data[i] = shade;
    grain.data[i + 1] = shade - 2;
    grain.data[i + 2] = shade - 6;
    grain.data[i + 3] = 255;
  }
  ink.putImageData(grain, 0, 0);
  ink.lineWidth = 0.6;
  for (let i = 0; i < (width * height) / 900; i++) {
    let x = Math.random() * width;
    let y = Math.random() * height;
    let angle = Math.random() * Math.PI * 2;
    let length = 8 + Math.random() * 30;
    ink.strokeStyle = `rgba(110, 100, 85, ${0.06 + Math.random() * 0.1})`;
    ink.beginPath();
    ink.moveTo(x, y);
    ink.quadraticCurveTo(x + Math.cos(angle + 0.6) * length * 0.5, y + Math.sin(angle + 0.6) * length * 0.5, x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ink.stroke();
  }
}

// Nothing on it, and see-through, so the streaks can be laid onto the paper as they are (see show())
function clearProjection() {
  context.setTransform(density, 0, 0, density, 0, 0);
  context.clearRect(0, 0, width, height);
}

// Nothing projected
function blank() {
  clearProjection();
  show(false);
}

// A wobbly pen line, which boils: drawn a little differently BOIL times a second
function hash(n) {
  let x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
function penLine(x1, y1, x2, y2, seed) {
  let tick = Math.floor(performance.now() / (1000 / BOIL));
  let jitter = (n) => (hash(tick * 977 + seed + n) - 0.5) * 2.2;
  let length = Math.hypot(x2 - x1, y2 - y1);
  let pieces = Math.max(1, Math.round(length / 26));
  let across = { x: -(y2 - y1) / length, y: (x2 - x1) / length };
  let along = { x: (x2 - x1) / length, y: (y2 - y1) / length };
  view.moveTo(x1 - along.x * 3 + jitter(0), y1 - along.y * 3 + jitter(1));
  for (let i = 1; i <= pieces; i++) {
    let t = i / pieces;
    let bend = i < pieces ? jitter(i * 7) : 0;
    let end = i === pieces ? 3 : 0;
    view.lineTo(x1 + (x2 - x1) * t + across.x * bend + along.x * end, y1 + (y2 - y1) * t + across.y * bend + along.y * end);
  }
}

// How far the paper's pushed up or down at a point across it (from 0 to 1), as it ripples
function ripple(across, time) {
  return WARP * (Math.sin((across * 1.3 + time * WARP_SPEED) * Math.PI * 2) * 0.6 + Math.sin((across * 3.1 - time * WARP_SPEED * 0.7) * Math.PI * 2 + 1.3) * 0.4);
}

// The room, and the screen hanging in it, with whatever's projected on it
let lightUp = 0; // How far it's come up, from dark (0) to lit (1)
// A blurred copy of a picture drawn onto a context, for the glows. With the canvas's own blur filter where the
// browser has one; iPhones before iOS 18 don't (they ignore ctx.filter), so there it's shrunk down a step at a time
// and stretched back up, smoothly, which blurs it nearly as well.
const canvasBlurs = (() => {
  const context = document.createElement('canvas').getContext('2d');
  if (!('filter' in context)) return false;
  context.filter = 'blur(2px)';
  return context.filter === 'blur(2px)';
})();
const shrunk = new Map(); // The small copies, made again each frame, kept for each blur size
function drawBlurred(context, image, radius, x, y, w, h) {
  if (canvasBlurs) {
    context.filter = `blur(${radius}px)`;
    context.drawImage(image, x, y, w, h);
    context.filter = 'none';
    return;
  }
  // About how small it has to be for one of its pixels to spread as far as the blur would
  const smallWide = Math.max(2, Math.round(w / (radius * 0.8)));
  const smallTall = Math.max(2, Math.round((smallWide * h) / w));
  let from = image;
  let fromWide = image.width;
  let fromTall = image.height;
  let step = 0;
  while (fromWide > smallWide) {
    const toWide = Math.max(smallWide, Math.round(fromWide / 2));
    const toTall = Math.max(smallTall, Math.round(fromTall / 2));
    const key = `${radius}:${step}`;
    let to = shrunk.get(key);
    if (!to) shrunk.set(key, (to = document.createElement('canvas')));
    if (to.width !== toWide || to.height !== toTall) {
      to.width = toWide;
      to.height = toTall;
    }
    const toContext = to.getContext('2d');
    toContext.imageSmoothingEnabled = true;
    toContext.imageSmoothingQuality = 'high';
    toContext.clearRect(0, 0, toWide, toTall);
    toContext.drawImage(from, 0, 0, fromWide, fromTall, 0, 0, toWide, toTall);
    from = to;
    fromWide = toWide;
    fromTall = toTall;
    step++;
  }
  const smoothing = context.imageSmoothingEnabled;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(from, 0, 0, fromWide, fromTall, x, y, w, h);
  context.imageSmoothingEnabled = smoothing;
}

let lastShown = null;
function show(lit = true) {
  let { x, y, wide, tall, room } = screen;
  let time = performance.now() / 1000;
  lightUp = lit ? Math.min(1, lightUp + (lastShown === null ? 0 : Math.min(0.1, time - lastShown)) / LIGHT_UP) : 0;
  lastShown = lit ? time : null;
  let up = lightUp * lightUp * (3 - 2 * lightUp);
  let mix = (dark, light) => `rgb(${dark.map((d, c) => Math.round(d + (light[c] - d) * up)).join(',')})`;

  // The paper with the picture on it, flat, on a sheet of its own
  let s = sheetContext;
  s.setTransform(density, 0, 0, density, 0, 0);
  s.globalCompositeOperation = 'source-over';
  s.globalAlpha = 1;
  s.filter = 'none';
  s.fillStyle = mix(COLOURS.darkPaper, COLOURS.unlit);
  s.fillRect(0, 0, wide, tall);
  if (lit) {
    // The picture, soft, glowing, and bleeding a little into the paper around it
    s.globalCompositeOperation = 'screen';
    s.globalAlpha = GLOW * up;
    drawBlurred(s, projection, 14, 0, 0, wide, tall);
    s.globalAlpha = 0.3 * up;
    drawBlurred(s, projection, 4, 0, 0, wide, tall);
    // ...and the streaks themselves, laid on in their own deep colours (added as light, they'd go pale on the paper)
    s.globalCompositeOperation = 'source-over';
    s.filter = 'none'; // Sharp
    s.globalAlpha = 0.95 * up;
    s.drawImage(projection, 0, 0, wide, tall);
    // ...glowing: a tight bloom and a wide one over them, added as light
    s.globalCompositeOperation = 'screen';
    s.globalAlpha = BLOOM[0] * up;
    drawBlurred(s, projection, 3, 0, 0, wide, tall);
    s.globalAlpha = BLOOM[1] * up;
    drawBlurred(s, projection, 10, 0, 0, wide, tall);
    s.globalAlpha = 1;
    s.globalCompositeOperation = 'source-over';
    // ...brighter in the middle, where the projector's aimed
    let hotspot = s.createRadialGradient(wide / 2, tall * 0.45, 0, wide / 2, tall * 0.45, Math.max(wide, tall) * 0.7);
    hotspot.addColorStop(0, `rgba(255, 250, 240, ${0.1 * up})`);
    hotspot.addColorStop(1, 'rgba(255, 250, 240, 0)');
    s.fillStyle = hotspot;
    s.fillRect(0, 0, wide, tall);
  }
  // The paper's colour and fibres, over all of it
  s.globalCompositeOperation = 'multiply';
  s.fillStyle = COLOURS.paper;
  s.fillRect(0, 0, wide, tall);
  s.drawImage(paper, 0, 0, wide, tall);
  s.globalCompositeOperation = 'source-over';

  view.setTransform(density, 0, 0, density, 0, 0);
  view.globalCompositeOperation = 'source-over';
  view.globalAlpha = 1;
  view.filter = 'none';
  // The room, dark, with the picture's light spilling onto the wall around the screen
  let wall = view.createRadialGradient(x + wide / 2, y + tall / 2, Math.min(wide, tall) * 0.3, x + wide / 2, y + tall / 2, Math.hypot(room.wide, room.tall) * 0.6);
  wall.addColorStop(0, mix(COLOURS.darkRoom[0], COLOURS.room[0]));
  wall.addColorStop(1, mix(COLOURS.darkRoom[1], COLOURS.room[1]));
  view.fillStyle = wall;
  view.fillRect(0, 0, room.wide, room.tall);
  if (lit) {
    view.globalCompositeOperation = 'screen';
    view.globalAlpha = SPILL * up;
    drawBlurred(view, projection, 40, x - wide * 0.08, y - tall * 0.08, wide * 1.16, tall * 1.16);
    view.globalAlpha = 1;
    view.globalCompositeOperation = 'source-over';
  }

  // The sheet, warped: in narrow upright strips, each pushed up or down a little, and shaded by which way it's tilted
  let strip = 3;
  for (let left = 0; left < wide; left += strip) {
    let across = left / wide;
    let shift = ripple(across, time);
    let slope = (ripple(across + 0.01, time) - shift) / 0.01 / WARP;
    let along = Math.min(strip + 1, wide - left);
    view.drawImage(sheet, left * density, 0, along * density, tall * density, x + left, y + shift * (0.4 + 0.6 * Math.sin(across * Math.PI)), along, tall);
    view.fillStyle = slope > 0 ? `rgba(255, 250, 240, ${Math.min(0.08, slope * 0.012) * (0.3 + 0.7 * up)})` : `rgba(0, 0, 0, ${Math.min(0.14, -slope * 0.02)})`;
    view.fillRect(x + left, y, along, tall);
  }

  // The strings it hangs from, and its thin frame, drawn as pen lines
  view.strokeStyle = `rgba(${COLOURS.line.join(',')}, 0.85)`;
  view.globalAlpha = 0.3 + 0.7 * up;
  view.lineWidth = 1;
  view.lineCap = 'round';
  view.beginPath();
  penLine(x + wide * 0.12, 0, x + wide * 0.12, y - 2, 10);
  penLine(x + wide * 0.88, 0, x + wide * 0.88, y - 2, 20);
  view.stroke();
  view.lineWidth = 1.3;
  view.beginPath();
  penLine(x - 2, y - 2, x + wide + 2, y - 2, 100);
  penLine(x + wide + 2, y - 2, x + wide + 2, y + tall + 2, 200);
  penLine(x + wide + 2, y + tall + 2, x - 2, y + tall + 2, 300);
  penLine(x - 2, y + tall + 2, x - 2, y - 2, 400);
  view.stroke();
  // ...with a second, fainter pass, as if gone over again
  view.strokeStyle = `rgba(${COLOURS.line.join(',')}, 0.35)`;
  view.lineWidth = 0.8;
  view.beginPath();
  penLine(x + 1, y + 1, x + wide - 1, y + 1, 500);
  penLine(x + 1, y + tall - 1, x + wide - 1, y + tall - 1, 600);
  view.stroke();

  drawWebcam(x + wide * 0.5, y - 2, x + wide, room.tall);
  view.globalAlpha = 1;
}

// A wobbly pen curve, through the points of a cubic Bézier curve from a to d
function penCurve(a, b, c, d, seed) {
  let tick = Math.floor(performance.now() / (1000 / BOIL));
  let jitter = (n) => (hash(tick * 977 + seed + n) - 0.5) * 2;
  let steps = 24;
  for (let i = 0; i <= steps; i++) {
    let t = i / steps;
    let u = 1 - t;
    let px = u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x;
    let py = u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y;
    if (i === 0) view.moveTo(px, py);
    else view.lineTo(px + jitter(i * 3) * 0.8, py + jitter(i * 3 + 1) * 0.8);
  }
}

// The little webcam, clipped onto the top of the frame in the middle, looking out at whoever's in front of it, with its
// cable running off over the side and hanging down to the floor. (top is the top of the frame, right its right side, and
// floor the bottom of the canvas.) Its lines have black edges, so they stand out against the screen and the room.
function drawWebcam(middle, top, right, floor) {
  let wide = 26;
  let tall = 15;
  let left = middle - wide / 2;
  let body = top - tall - 6; // It sits on its clip, a little above the frame
  // Each of its lines drawn with a black edge round it
  let outlined = () => {
    let colour = view.strokeStyle;
    let width = view.lineWidth;
    view.strokeStyle = 'black';
    view.lineWidth = width + 2.4;
    view.stroke();
    view.strokeStyle = colour;
    view.lineWidth = width;
    view.stroke();
  };
  view.lineWidth = 1.1;
  view.strokeStyle = `rgba(${COLOURS.line.join(',')}, 0.9)`;
  view.fillStyle = 'rgba(8, 8, 9, 0.9)';
  view.fillRect(left, body, wide, tall);
  view.beginPath();
  // Its body, with rounded-off corners
  penLine(left + 3, body, left + wide - 3, body, 1000);
  penLine(left + wide, body + 3, left + wide, body + tall - 3, 1010);
  penLine(left + wide - 3, body + tall, left + 3, body + tall, 1020);
  penLine(left, body + tall - 3, left, body + 3, 1030);
  outlined();
  // Its lens, and a little light beside it
  view.beginPath();
  view.arc(middle, body + tall / 2, 4.2, 0, Math.PI * 2);
  view.moveTo(middle + 2.2, body + tall / 2);
  view.arc(middle, body + tall / 2, 2.2, 0, Math.PI * 2);
  outlined();
  view.fillStyle = `rgba(${COLOURS.line.join(',')}, 0.8)`;
  view.fillRect(left + wide - 6, body + 3.5, 2, 2);
  // The clip: down from its base, over the frame, and a short way down behind it
  view.beginPath();
  penLine(middle - 4, body + tall, middle - 4, top + 1, 1040);
  penLine(middle + 4, body + tall, middle + 4, top + 1, 1050);
  penLine(middle - 6, top + 1, middle + 6, top + 1, 1060);
  penLine(middle + 6, top + 1, middle + 6, top + 9, 1070);
  outlined();
  // Its cable, out of its side, drooping over the frame's corner and hanging down to the floor
  view.lineWidth = 1.6;
  view.strokeStyle = `rgba(${COLOURS.line.join(',')}, 0.75)`;
  view.beginPath();
  penCurve(
    { x: left + wide, y: body + tall / 2 },
    { x: middle + (right - middle) * 0.5, y: body - 14 },
    { x: right + 26, y: top - 10 },
    { x: right + 20, y: top + (floor - top) * 0.35 },
    1100,
  );
  penCurve(
    { x: right + 20, y: top + (floor - top) * 0.35 },
    { x: right + 16, y: top + (floor - top) * 0.6 },
    { x: right + 28, y: top + (floor - top) * 0.8 },
    { x: right + 24, y: floor + 4 },
    1200,
  );
  outlined();
}

// (Processing limits colours to this range by itself)
function channel(value) {
  return Math.max(0, Math.min(255, value));
}

// A streak's colour, starting at `from` along `row`: from the colour scheme, as bright as the picture is there, now and
// then an accent, and each a little different
function streakColour(pixels, row, from) {
  let spot = (row * cols + Math.min(cols - 1, from + 1)) * 4;
  let light = Math.min(1, ((pixels[spot] + pixels[spot + 1] + pixels[spot + 2]) / 3 + LIFT) / 255);
  let base;
  if (COLOURS.palette.length === 2) {
    // From one colour to the other, as bright as the picture is there
    base = COLOURS.palette[0].map((dark, c) => dark + (COLOURS.palette[1][c] - dark) * light);
  } else {
    // One of the colours, the same along a row for a while, and darker where the picture's dark
    let pick = COLOURS.palette[Math.floor(hash(Math.floor(row / 3) * 13 + Math.floor(from / 40)) * COLOURS.palette.length)];
    base = pick.map((value) => value * (0.55 + 0.5 * light));
  }
  let chance = Math.random();
  for (let [accent, often] of COLOURS.accents) {
    if (chance < often) {
      base = accent;
      break;
    }
    chance -= often;
  }
  let shine = BRIGHTNESS[0] + Math.random() * (BRIGHTNESS[1] - BRIGHTNESS[0]);
  base = base.map((value) => value * shine);
  let vary = () => (Math.random() - 0.5) * 2 * randomFactor;
  let mean = (base[0] + base[1] + base[2]) / 3;
  let colour = (value) => channel(mean + (value - mean) * (SATURATE / 2) + vary()) | 0;
  return `rgb(${colour(base[0])},${colour(base[1])},${colour(base[2])})`;
}

// A speck where an edge is, now and then left out, a little off, or with a couple of others
function addSpeck(specks, col, y) {
  if (Math.random() < SPECK_SKIP) return;
  let count = Math.random() < SPECK_CLUSTER ? 3 : 1;
  for (let n = 0; n < count; n++) {
    let spread = n ? 2.5 : 1;
    specks.push(col * VIDEO_SCALE + (Math.random() - 0.5) * 2 * SPECK_SCATTER[0] * spread, y + (Math.random() - 0.5) * 2 * SPECK_SCATTER[1] * spread);
  }
}

// In brightness: each stretch of the row that's brighter than the threshold, broken into short streaks with small gaps,
// with a speck where it starts
function drawBrightRow(pixels, row, y, thick, specks) {
  let start = -1;
  for (let col = 0; col <= cols; col++) {
    let spot = (row * cols + Math.min(cols - 1, col)) * 4;
    let lit = col < cols && (pixels[spot] + pixels[spot + 1] + pixels[spot + 2]) / 3 > threshold;
    if (lit && start < 0) start = col;
    if (!lit && start >= 0) {
      addSpeck(specks, start, y + thick / 2);
      for (let at = start; at < col; ) {
        let length = PIECES[0] + Math.floor(Math.random() * (PIECES[1] - PIECES[0]));
        let end = Math.min(col, at + length);
        if (Math.random() >= SKIP) {
          context.fillStyle = streakColour(pixels, row, at);
          let size = VIDEO_SCALE * (THICKNESS[0] + Math.random() * (THICKNESS[1] - THICKNESS[0]));
          context.fillRect(at * VIDEO_SCALE, y + (Math.random() - 0.5) * 2 * WOBBLE, (end - at) * VIDEO_SCALE, size);
        }
        at = end + (Math.random() < 0.35 ? 1 : 0);
      }
      start = -1;
    }
  }
}

function drawFrame() {
  // Fill the grid with the picture, cropped to fit. The camera's mirrored, like a mirror; the recording isn't.
  let scale = Math.max(cols / video.videoWidth, rows / video.videoHeight);
  let drawnWidth = video.videoWidth * scale;
  let drawnHeight = video.videoHeight * scale;
  samplerContext.save();
  if (source === 'camera') {
    samplerContext.translate(cols, 0);
    samplerContext.scale(-1, 1);
  }
  samplerContext.drawImage(video, (cols - drawnWidth) / 2, (rows - drawnHeight) / 2, drawnWidth, drawnHeight);
  samplerContext.restore();
  let pixels = samplerContext.getImageData(0, 0, cols, rows).data;

  clearProjection();
  let bright = new Float32Array(cols);
  let thick = Math.max(1, VIDEO_SCALE * STREAK);
  let specks = [];

  for (let row = 0; row < rows; row++) {
    let y = row * VIDEO_SCALE;
    for (let col = 0; col < cols; col++) {
      let spot = (row * cols + col) * 4;
      bright[col] = (pixels[spot] + pixels[spot + 1] + pixels[spot + 2]) / 3;
    }
    if (mode === 'brightness') {
      drawBrightRow(pixels, row, y, thick, specks);
      continue;
    }
    // The edges along this row: where the brightness either side, averaged a little, differs by more than the threshold
    let edges = [];
    for (let col = SMOOTH + 1; col < cols - SMOOTH; col++) {
      let before = 0;
      let after = 0;
      for (let k = 0; k <= SMOOTH; k++) {
        before += bright[col - 1 - k];
        after += bright[col + k];
      }
      let change = Math.abs(after - before) / (SMOOTH + 1);
      if (change > threshold && (!edges.length || col - edges[edges.length - 1] > 1)) edges.push(col);
    }
    // A streak from each edge to about the next (the last to the right-hand side), in the colour where it starts, made
    // more colourful. Each one's a little off: starting early or late, stopping short or overshooting, some flying off
    // to the edge, thicker or thinner, a little above or below its row, and now and then left out.
    for (let k = 0; k < edges.length; k++) {
      let from = edges[k];
      addSpeck(specks, from, y + thick / 2);
      if (Math.random() < SPECK_STRAY) {
        let next = k + 1 < edges.length ? edges[k + 1] : cols;
        specks.push((from + Math.random() * (next - from)) * VIDEO_SCALE, y + thick / 2);
      }
      if (Math.random() < SKIP) continue;
      let next = k + 1 < edges.length ? edges[k + 1] : cols;
      let to = Math.random() < STRAY ? cols : next + OVERSHOOT[0] + Math.random() * (OVERSHOOT[1] - OVERSHOOT[0]);
      let start = from + (Math.random() - 0.5) * 3;
      if (to <= start) continue;
      context.fillStyle = streakColour(pixels, row, from);
      let size = VIDEO_SCALE * (THICKNESS[0] + Math.random() * (THICKNESS[1] - THICKNESS[0]));
      context.fillRect(start * VIDEO_SCALE, y + (Math.random() - 0.5) * 2 * WOBBLE, (to - start) * VIDEO_SCALE, size);
    }
  }
  // The specks, over the streaks, each its own size and brightness
  context.fillStyle = 'white';
  for (let k = 0; k < specks.length; k += 2) {
    let size = SPECK * (SPECK_SIZES[0] + Math.random() ** 2 * (SPECK_SIZES[1] - SPECK_SIZES[0]));
    if (Math.random() < 0.02) size *= 1.8; // Now and then a bigger one
    context.globalAlpha = 0.45 + Math.random() * 0.55;
    context.fillRect(specks[k] - size / 2, specks[k + 1] - size / 2, size, size);
  }
  context.globalAlpha = 1;
  show();
}

function loop() {
  if (!source || !showing) return;
  // Only when the camera has a new picture, like video.available()
  if (video.readyState >= 2 && video.currentTime !== lastTime) {
    lastTime = video.currentTime;
    drawFrame();
  }
  requestAnimationFrame(loop);
}

function showReadout() {
  readout.textContent = `threshold ${threshold} · color variation ${randomFactor} · arrow keys change these`;
}

function run() {
  lastTime = -1;
  if (source && showing) requestAnimationFrame(loop);
}

// The video of Ofer, playing through it. If it isn't there, it's just the camera's button.
async function playRecording() {
  if (!hasRecording) {
    source = null;
    blank();
    return;
  }
  video.srcObject = null;
  if (!video.src) video.src = recording;
  try {
    await video.play();
    source = 'recording';
    run();
  } catch {
    // Either it isn't there, or the browser wouldn't play it yet; it's tried again when it's scrolled to
    source = null;
  }
}

async function startCamera() {
  button.disabled = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.removeAttribute('src');
    video.srcObject = stream;
    await video.play();
    source = 'camera';
    button.textContent = 'turn off your camera';
    holder.classList.add('running');
    showReadout();
    canvas.focus({ preventScroll: true });
    run();
  } catch {
    stopCamera();
    // Browsers only offer the camera to secure (https) pages, so on a plain http address it isn't there at all
    readout.textContent = window.isSecureContext
      ? 'the camera could not start. check that this page is allowed to use it'
      : 'the camera only works on a secure (https) page';
  }
  button.disabled = false;
}

function stopCamera() {
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
  source = null;
  button.textContent = 'turn on your camera';
  holder.classList.remove('running');
  readout.textContent = hasRecording ? 'or see yourself in it: uses your camera, and the video stays on your device' : 'uses your camera. the video stays on your device';
  blank();
  if (showing) playRecording();
}

button.addEventListener('click', () => (stream ? stopCamera() : startCamera()));

video.addEventListener('error', () => {
  if (source === 'camera' || !video.getAttribute('src')) return;
  hasRecording = false;
  source = null;
  readout.textContent = 'uses your camera. the video stays on your device';
  blank();
});

new IntersectionObserver(([entry]) => {
  showing = entry.isIntersecting;
  if (!showing) {
    if (source === 'recording') video.pause();
    return;
  }
  if (source === 'camera') run();
  else playRecording();
}).observe(holder);

canvas.addEventListener('keydown', (event) => {
  if (!source) return;
  let { least, most } = MODES[mode];
  if (event.key === 'ArrowUp') {
    threshold = Math.max(least, threshold - THRESHOLD_STEP); // More of it
  } else if (event.key === 'ArrowDown') {
    threshold = Math.min(most, threshold + THRESHOLD_STEP); // Less
  } else if (event.key === 'ArrowRight') {
    randomFactor = Math.min(120, randomFactor + 5);
  } else if (event.key === 'ArrowLeft') {
    randomFactor = Math.max(0, randomFactor - 5);
  } else {
    return;
  }
  event.preventDefault(); // Rather than scrolling the page
  showReadout();
});

let resizing;
new ResizeObserver(() => {
  clearTimeout(resizing);
  resizing = setTimeout(fit, 150);
}).observe(canvas);

fit();
stopCamera();
