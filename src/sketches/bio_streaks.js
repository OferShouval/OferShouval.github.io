// The bio picture's look, after Ofer's Processing sketch Video_Processing_Sketch_RTR_2 (2022), in grey.
//
// The picture is sampled on a grid of thin rows, GRID pixels apart. Along each row, every run that's brighter than the
// threshold becomes a thin line, from where it starts to where it ends, its ends nudged a little at random (JITTER);
// the brighter the run, the thicker its line, so what's only just over the threshold is a hairline. Each line sits a random distance above or below its row (Y_SPREAD).
// What isn't bright enough stays black. Lines from the last few frames (trail) are drawn again, thinner the older they
// are, so they fade by getting thinner rather than see-through. It's drawn small and shown at twice the size, pixels
// kept sharp, like the bio picture.
//
// On its test page it uses the camera (which only starts when asked for; what it sees never leaves the browser).
// Given a picture instead (data-image on the holder, as on the bio page), it runs on that, by itself, the lines
// redrawn STILL_FPS times a second so they keep wandering, until the camera's turned on (if there's a button for it),
// and again once it's turned off. Or given a video (data-video), it plays that on a loop, silently, and draws each
// of its frames, mirrored like the camera if data-mirror is there (so a recording of the camera looks as it did).
// data-video can list several videos (spaces between). With data-cuts, it plays them in jump cuts: a short stretch
// (CUTS seconds long) of one, then a jump to somewhere else in any of them, and so on, never the same twice, each
// stretch fading in, and the ones before fading out, slowly (FADE), so several are always mixed in the picture the
// lines are drawn from, bleeding into each other. data-weights says how often
// each video comes up, compared with the others (say "1 1 1 1 4" for the last one half the time), or, with
// data-alternate, it goes from each video to the next in turn, back and forth between two.
// On the test page, the record button saves the camera's own picture, without the lines, as a video to give it.
//
// Keys: up and down change the threshold, left and right how far the line ends wander, b and n how many frames lines
// linger (as in the original), c goes through the colour modes (MODES, below), the number keys bring
// back a saved setting (PRESETS, below), and Enter clears it.
//
// In a mode, each row can be looked along more than once (a pass): for how bright the picture is, or just how red,
// green or blue, each pass giving its own lines in its own colour. Where passes' lines cross they're added together
// like light (so red, green and blue make white), or, on paper, multiplied like ink.

const GRID = 6; // How far apart the rows are, and how finely each is looked along, in the small picture's pixels
const ZOOM = 1; // How many screen pixels each of the small picture's pixels is shown as
let threshold = 140; // How bright (out of 255) is bright enough
let jitter = 4; // How far, in pixels, each end of a line can wander
let trail = 6; // How many frames a line lasts, getting thinner each one
// A new line's thickness, in pixels, from a run only just over the threshold to one that's white
const WEIGHTS = [0.1, 1.2];
const Y_SPREAD = 4; // How far, in pixels, a line can sit above or below its row
const GREY = 220; // How bright the lines are, out of 255
const GREY_JITTER = 15; // How much each line's grey varies at random

// A colour from a list of them, `over` of the way along it (0 to 1)
function blend(stops, over) {
  let spot = Math.min(stops.length - 1.001, over * (stops.length - 1));
  let i = Math.floor(spot);
  let t = spot - i;
  return stops[i].map((value, k) => value + (stops[i + 1][k] - value) * t);
}
const HEAT = [[40, 30, 170], [190, 40, 150], [255, 150, 50], [255, 245, 215]]; // Blue, magenta, amber, near white
const EMBER = [[90, 0, 10], [220, 30, 20], [255, 140, 40], [255, 230, 170]]; // Dark red to pale orange

// Each mode: the background, how crossing lines mix, and its passes. A pass looks at a channel of each pixel (-1 = the
// brightest of red, green and blue, 0 red, 1 green, 2 blue), turned upside down if `dark` (so what's dark counts as
// bright), its lines moved `dx` pixels sideways, and coloured `colour(over)`, where over is how far over the threshold
// the run is (0 to 1)
const MODES = {
  grey: { background: 'black', mix: 'source-over', passes: [{ channel: -1, colour: () => [255, 255, 255] }] },
  rgb: {
    background: 'black',
    mix: 'lighter',
    passes: [
      { channel: 0, colour: () => [255, 0, 0] },
      { channel: 1, colour: () => [0, 255, 0] },
      { channel: 2, colour: () => [0, 0, 255] },
    ],
  },
  red: { background: 'black', mix: 'source-over', passes: [{ channel: 0, colour: () => [255, 0, 0] }] },
  // Red, green and blue apart, and a little apart sideways too, like a misaligned print or old TV
  split: {
    background: 'black',
    mix: 'lighter',
    passes: [
      { channel: 0, dx: -6, colour: () => [255, 0, 0] },
      { channel: 1, colour: () => [0, 255, 0] },
      { channel: 2, dx: 6, colour: () => [0, 0, 255] },
    ],
  },
  // Brightness, coloured: just over the threshold is blue, then magenta, amber, and near white
  heat: { background: 'black', mix: 'source-over', passes: [{ channel: -1, colour: (over) => blend(HEAT, over) }] },
  // Red alone, coloured from dark red to pale orange
  ember: { background: 'black', mix: 'lighter', passes: [{ channel: 0, colour: (over) => blend(EMBER, over) }] },
  // Cyan, magenta and yellow ink on paper, where the picture is short of red, green and blue
  ink: {
    background: '#eee8da',
    mix: 'multiply',
    passes: [
      { channel: 0, dark: true, colour: () => [0, 175, 225] },
      { channel: 1, dark: true, colour: () => [230, 0, 140] },
      { channel: 2, dark: true, colour: () => [255, 225, 0] },
    ],
  },
};
const MODE_NAMES = Object.keys(MODES);
let mode = 'grey';

// Settings worth keeping, brought back with the number keys (1 for the first)
const PRESETS = [
  // Ofer's favourite so far (13 Nov 2026): the colours split and smeared wide
  { name: 'split smear', threshold: 135, jitter: 30, trail: 6, mode: 'split' },
];
let preset = null; // The name of the preset last brought back, until something's changed

let holder = document.querySelector('.bio-streaks');
let canvas = holder.querySelector('canvas');
let button = holder.querySelector('.bio-streaks-camera') || document.querySelector('.bio-streaks-camera'); // (On the bio page it's outside)
let readout = holder.querySelector('.bio-streaks-readout');
let context = canvas.getContext('2d');
let sampler = document.createElement('canvas');
let samplerContext = sampler.getContext('2d', { willReadFrequently: true });
let video = document.createElement('video');
video.playsInline = true;
video.muted = true;
let stream = null;
let file = holder.dataset.video || null; // The videos it plays, if it's been given them
const SPEED = Number(holder.dataset.speed) || 1; // How fast the videos play (data-speed; 0.25 is four times slower)
// Players for each video: as many as there are stretches of it mixed in at once
let sources = [];
let pools = [];
let weights = [];
function makePlayer(src) {
  let clip = document.createElement('video');
  clip.src = src;
  clip.muted = true;
  clip.playsInline = true;
  clip.loop = true;
  clip.preload = 'auto';
  clip.defaultPlaybackRate = clip.playbackRate = SPEED;
  return clip;
}
if (file) {
  sources = file.split(/\s+/);
  pools = sources.map((src) => [makePlayer(src), makePlayer(src)]);
  let given = (holder.dataset.weights || '').split(/\s+/).map(Number);
  weights = sources.map((src, i) => (given[i] > 0 ? given[i] : 1));
  video = pools[0][0]; // The newest stretch's player
}
const BLEND = holder.dataset.blend || null; // How the stretches mix while they fade (see drawFrame)
const BLEND_STRENGTH = holder.dataset.blendStrength !== undefined ? Number(holder.dataset.blendStrength) : 1; // (0 to 1)
let blender = document.createElement('canvas'); // Where two stretches are blended, during a cut
let blenderContext = blender.getContext('2d');
const FADE = Number(holder.dataset.fade) || 8; // How long, in seconds, a stretch takes to fade in, and to fade out once the next has started
const MAX_LAYERS = 8; // The most stretches mixed at once (the oldest goes, if there'd be more)
let layers = []; // The stretches mixed in, oldest first: { clip, born, ended } (times from performance.now())
function freePlayer(i) {
  let free = pools[i].find((clip) => !layers.some((layer) => layer.clip === clip));
  if (!free) pools[i].push((free = makePlayer(sources[i])));
  return free;
}
// How much of a stretch is in the mix, 0 to 1: rising as it fades in, falling once it's been followed
function presence(layer, now) {
  let rising = Math.min(1, (now - layer.born) / (FADE * 1000));
  let falling = layer.ended ? Math.max(0, 1 - (now - layer.ended) / (FADE * 1000)) : 1;
  return rising * falling;
}
// How long each stretch between jump cuts is, in seconds of the video, from the shortest to the longest (data-cut-lengths)
const CUTS = (holder.dataset.cutLengths || '0.5 1.6').split(/\s+/).map(Number);
let cutEnd = Infinity; // When, in the video, the stretch it's playing ends
// The first stretch, if data-opening says one ("video, from, to", the video counted from 1, the times in seconds of
// it): shown from the start, already faded in
let opening = (holder.dataset.opening || '').split(',').map(Number);
let opened = !(opening.length === 3 && opening.every(isFinite));
let lastChosen = -1;
function jumpCut() {
  // A video, by its weight, out of those that have loaded (or the opening's)
  let ready = pools.map((pool, i) => (pool[0].readyState >= 2 ? i : -1)).filter((i) => i >= 0);
  if (!ready.length) return;
  let total = ready.reduce((sum, i) => sum + weights[i], 0);
  let pick = Math.random() * total;
  let chosen = ready.find((i) => (pick -= weights[i]) < 0) ?? ready[0];
  if ('alternate' in holder.dataset && lastChosen >= 0) {
    let order = ready.slice().sort((a, b) => ((a - lastChosen + pools.length - 1) % pools.length) - ((b - lastChosen + pools.length - 1) % pools.length));
    chosen = order[0]; // The next one after the last, of those that have loaded
  }
  let first = !opened;
  if (first) {
    chosen = opening[0] - 1;
    opened = true;
  }
  lastChosen = chosen;
  playing = chosen;
  let now = performance.now();
  for (let layer of layers) layer.ended ??= now; // The ones before start fading out
  video = freePlayer(chosen);
  layers.push({ clip: video, born: first ? now - FADE * 1000 : now, ended: null });
  while (layers.length > MAX_LAYERS) layers.shift().clip.pause();
  video.play().catch(() => {});
  let length = CUTS[0] + Math.random() * (CUTS[1] - CUTS[0]);
  let duration = file ? pools[chosen].find((clip) => isFinite(clip.duration))?.duration ?? 0 : video.duration; // (A new player may not know yet)
  let start = Math.random() * Math.max(0, duration - length);
  if (first) [start, length] = [opening[1], opening[2] - opening[1]];
  video.currentTime = start;
  cutEnd = start + length;
}
const ALIGN_Y = holder.dataset.alignY !== undefined ? Number(holder.dataset.alignY) : 0.5; // (data-align-y; see drawFrame)
// Or, with data-follow (an element on the page) and data-head-y (how far down the video the head is, 0 to 1), the
// picture moves up and down as the page scrolls, to keep the head in the middle of that element (the bio's window)
let follow = holder.dataset.follow ? document.querySelector(holder.dataset.follow) : null;
const HEAD_Y = Number(holder.dataset.headY) || 0.3;
// With data-heads, where the head is in each video ("x,y" for each, 0 to 1 across and down, spaces between), the
// picture slides to keep the head of whichever is playing in the middle across (and, following, in the middle of the
// window), gliding there after a cut rather than jumping. data-zoom enlarges the video, so there's room to slide it
// across without showing its edges.
const HEADS = (holder.dataset.heads || '').split(/\s+/).filter(Boolean).map((pair) => pair.split(',').map(Number));
const TRACK = HEADS.length > 0;
const VIDEO_ZOOM = Number(holder.dataset.zoom) || 1;
const SHIFT_Y = Number(holder.dataset.shiftY) || 0; // Screen pixels to move the whole picture down (or, below 0, up)
// With data-nudges, each video moved a little on the screen ("right,down" for each, as parts of the screen's width and
// height, so "0.05,-0.05" is a little right and up; spaces between)
const NUDGES = (holder.dataset.nudges || '').split(/\s+/).filter(Boolean).map((pair) => pair.split(',').map(Number));
// Where to draw a video's frame, nudged (as the picture's drawn, mirrored or not)
function placed(clip, left, top) {
  let nudge = NUDGES[pools.findIndex((pool) => pool.includes(clip))];
  if (!nudge) return [left, top];
  let mirrored = stream || (file && 'mirror' in holder.dataset);
  return [left + (mirrored ? -nudge[0] : nudge[0]) * cols, top + nudge[1] * rows];
}
let head = { x: 0.5, y: HEAD_Y }; // Where the head is, as it's been followed
let playing = 0; // Which video's playing (the newest stretch's)
function trackHead() {
  let [x, y] = HEADS[playing] || [0.5, HEAD_Y];
  head.x += (x - head.x) * 0.06;
  head.y += (y - head.y) * 0.06;
}
const STILL_FPS = 12; // How often the lines are redrawn over a picture
// How much brighter a picture's made before it's looked at (data-gain), for one that's mostly dark, like the bio
// portrait, whose thin lines go dim when it's shrunk to the grid
const STILL_GAIN = Number(holder.dataset.gain) || 1;
let still = null; // The picture it runs on, if it's been given one
if (holder.dataset.image) {
  still = new Image();
  still.src = holder.dataset.image;
}
let width, height, cols, rows;
let lastTime = -1;
let frames = []; // The lines of the last few frames, newest first: each line is [from, to, y, grey]

function fit() {
  width = Math.max(1, Math.round(canvas.clientWidth / ZOOM));
  height = Math.max(1, Math.round(canvas.clientHeight / ZOOM));
  canvas.width = width;
  canvas.height = height;
  cols = Math.floor(width / GRID);
  rows = Math.floor(height / GRID);
  sampler.width = cols;
  sampler.height = rows;
  clear();
}

function clear() {
  frames = [];
  context.fillStyle = MODES[mode].background;
  context.fillRect(0, 0, width, height);
}

// Brightness as Processing measures it (in HSB, the brightest of red, green and blue)
// or, with a channel, just how red, green or blue it is
// (upside down if dark)
function brightness(pixels, spot, channel, dark) {
  let value = channel >= 0 ? pixels[spot + channel] : Math.max(pixels[spot], pixels[spot + 1], pixels[spot + 2]);
  return dark ? 255 - value : value;
}

function drawFrame() {
  // The picture, one pixel to each cell of the grid, cropped to fit, and the camera mirrored like a mirror
  let camera = !!stream || !!file; // (Or a video: either way, the video element)
  let source = camera ? video : still;
  let sourceWidth = camera ? video.videoWidth : still.naturalWidth;
  let sourceHeight = camera ? video.videoHeight : still.naturalHeight;
  // (Sized to the holder, which on the bio page is the part that's seen: the canvas reaches further up, out of sight)
  let seenRows = Math.min(rows, holder.clientHeight / ZOOM / GRID);
  let scale = Math.max(cols / sourceWidth, seenRows / sourceHeight) * (file ? VIDEO_ZOOM : 1);
  let drawnWidth = sourceWidth * scale;
  let drawnHeight = sourceHeight * scale;
  // Where it sits: centred across, and up or down by ALIGN_Y (as CSS's object-position: 0.5 the middle, 1 its bottom
  // edge at the bottom, so it's as high as it goes)
  let left = (cols - drawnWidth) / 2;
  let top = (rows - drawnHeight) * ALIGN_Y;
  if (follow) {
    let box = follow.getBoundingClientRect();
    let middle = (box.top + heldUp() + box.height / 2 - canvas.getBoundingClientRect().top) / ZOOM / GRID; // In the grid's rows
    top = middle - (TRACK ? head.y : HEAD_Y) * drawnHeight;
  }
  top += SHIFT_Y / ZOOM / GRID;
  if (TRACK && file) {
    trackHead();
    // The head in the middle across (mirrored or not, it works out the same), as far as the video's edges allow
    left = Math.min(0, Math.max(cols - drawnWidth, cols / 2 - head.x * drawnWidth));
  }
  samplerContext.save();
  if (stream || (file && 'mirror' in holder.dataset)) {
    samplerContext.translate(cols, 0);
    samplerContext.scale(-1, 1);
  }
  samplerContext.drawImage(source, ...(file ? placed(source, left, top) : [left, top]), drawnWidth, drawnHeight);
  // With several stretches mixed: each in proportion to how much it's there, added together. Or, with data-blend (a
  // canvas blend mode, like exclusion), each cut is a smooth crossing through that mode: over the first half of FADE
  // the new stretch comes in over the old one, from nothing to full; at the middle they swap places (exclusion looks
  // the same either way round, so the swap can't be seen); and over the second half the old one goes, full to nothing
  if (file && layers.length) {
    let now = performance.now();
    layers = layers.filter((layer) => {
      if (layer.ended && presence(layer, now) <= 0) {
        layer.clip.pause();
        return false;
      }
      return true;
    });
    let mixed = layers.filter((layer) => layer.clip.readyState >= 2);
    let total = mixed.reduce((sum, layer) => sum + presence(layer, now), 0);
    if (total > 0) {
      samplerContext.fillStyle = 'black';
      samplerContext.fillRect(-cols, -rows, cols * 3, rows * 3);
      if (BLEND) {
        let newest = mixed[mixed.length - 1];
        let previous = mixed[mixed.length - 2];
        let through = previous ? Math.min(1, (now - newest.born) / (FADE * 1000)) : 1; // How far through the cut
        if (!previous || through >= 1) {
          samplerContext.drawImage(newest.clip, ...placed(newest.clip, left, top), drawnWidth, drawnHeight);
        } else {
          // A crossfade from the old stretch to the new that never dims: over the first half, the new one comes in
          // where it's the brighter (lighten), until at the middle each spot is the brighter of the two; then the new
          // one's underneath, and the old one goes the same way (an ordinary crossfade averages the two, so the bright
          // wall in one and the dark sweater in the other meet under the threshold, and the lines go)...
          let [under, over] = through < 0.5 ? [previous, newest] : [newest, previous];
          samplerContext.drawImage(under.clip, ...placed(under.clip, left, top), drawnWidth, drawnHeight);
          samplerContext.globalCompositeOperation = 'lighten';
          samplerContext.globalAlpha = 1 - Math.abs(1 - through * 2);
          samplerContext.drawImage(over.clip, ...placed(over.clip, left, top), drawnWidth, drawnHeight);
          samplerContext.globalCompositeOperation = 'source-over';
          // ...with the two blended (in exclusion, say) laid over it, most at the middle, never more than
          // BLEND_STRENGTH, so where they cancel out it darkens only so far
          blender.width = cols;
          blender.height = rows;
          blenderContext.setTransform(samplerContext.getTransform());
          blenderContext.drawImage(previous.clip, ...placed(previous.clip, left, top), drawnWidth, drawnHeight);
          blenderContext.globalCompositeOperation = BLEND;
          blenderContext.drawImage(newest.clip, ...placed(newest.clip, left, top), drawnWidth, drawnHeight);
          blenderContext.globalCompositeOperation = 'source-over';
          samplerContext.save();
          samplerContext.setTransform(1, 0, 0, 1, 0, 0);
          samplerContext.globalAlpha = BLEND_STRENGTH * Math.sin(Math.PI * through);
          samplerContext.drawImage(blender, 0, 0);
          samplerContext.restore();
        }
      } else {
        samplerContext.globalCompositeOperation = 'lighter';
        for (let layer of mixed) {
          samplerContext.globalAlpha = presence(layer, now) / total;
          samplerContext.drawImage(layer.clip, ...placed(layer.clip, left, top), drawnWidth, drawnHeight);
        }
      }
      samplerContext.globalAlpha = 1;
      samplerContext.globalCompositeOperation = 'source-over';
    }
  }
  samplerContext.restore();
  let pixels = samplerContext.getImageData(0, 0, cols, rows).data;
  if (!camera && STILL_GAIN !== 1) for (let i = 0; i < pixels.length; i++) if (i % 4 !== 3) pixels[i] *= STILL_GAIN; // (They stop at 255)

  let lines = [];
  for (let { channel, dark, dx = 0, colour } of MODES[mode].passes)
  for (let row = 1; row < rows - 1; row++) {
    let start = -1;
    let total = 0; // The run's brightness, added up
    for (let col = 1; col < cols; col++) {
      let bright = brightness(pixels, (row * cols + col) * 4, channel, dark);
      let lit = col < cols - 1 && bright > threshold;
      if (lit && start < 0) {
        start = col;
        total = 0;
      }
      if (lit) total += bright;
      if (!lit && start >= 0) {
        let from = start * GRID + dx + (Math.random() * 2 - 1) * jitter;
        let to = col * GRID + dx + (Math.random() * 2 - 1) * jitter;
        let over = (total / (col - start) - threshold) / (255 - threshold); // 0 just over the threshold, 1 white
        let weight = WEIGHTS[0] + over * (WEIGHTS[1] - WEIGHTS[0]);
        let grey = Math.round(Math.max(0, Math.min(255, GREY + (Math.random() * 2 - 1) * GREY_JITTER)));
        let y = row * GRID + (Math.random() * 2 - 1) * Y_SPREAD;
        let style = `rgb(${colour(over).map((value) => Math.round((value * grey) / 255)).join(', ')})`;
        lines.push([from, Math.max(to, from + 1), y, style, weight]);
        start = -1;
      }
    }
  }
  frames.unshift(lines);
  frames.length = Math.min(frames.length, trail);

  // Oldest first, so the newest, thickest lines are on top
  context.fillStyle = MODES[mode].background;
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = MODES[mode].mix;
  for (let age = frames.length - 1; age >= 0; age--) {
    let thinning = 1 - age / trail;
    for (let [from, to, y, style, weight] of frames[age]) {
      context.lineWidth = weight * thinning;
      context.strokeStyle = style;
      context.beginPath();
      context.moveTo(from, y);
      context.lineTo(to, y);
      context.stroke();
    }
  }
  context.globalCompositeOperation = 'source-over';
  if (reflectAt) reflect();
}

// With data-reflect (an element on the page, the bio's frame), the picture is reflected under that element's bottom
// edge, as if in water: upside down, and fading out over data-reflect-fade (a part of the element's height) below it.
// Or, with data-reflect-fade="none", not fading, but reflected again and again, upside down and back, each as tall as the
// element, to the bottom of the screen
let reflectAt = holder.dataset.reflect ? document.querySelector(holder.dataset.reflect) : null;
const REFLECT_FADE = Number(holder.dataset.reflectFade) || 0.6;
const REFLECT_SOLID = !!reflectAt && holder.dataset.reflectFade === 'none';
let mirror = document.createElement('canvas'); // The reflection
let mirrorContext = mirror.getContext('2d');
let plain = document.createElement('canvas'); // (Repeating: the picture in the element, the right way up)
let plainContext = plain.getContext('2d');
// Repeating, once the element's gone off the top of the canvas (which on the bio page reaches a window's height above
// the screen), the picture stops there, held just inside it, so there's always a picture to reflect: how far down it's
// held (in screen pixels) from where the element is
function heldUp() {
  if (!REFLECT_SOLID) return 0;
  return Math.max(0, canvas.getBoundingClientRect().top - reflectAt.getBoundingClientRect().top);
}
function reflect() {
  let box = reflectAt.getBoundingClientRect();
  let canvasTop = canvas.getBoundingClientRect().top;
  let edge = Math.round((box.bottom - canvasTop) / ZOOM); // Where the element's bottom is, in the canvas's pixels
  if (REFLECT_SOLID) return repeat(box, canvasTop, edge);
  // How far down it takes to fade out: no further than there's picture above the edge to reflect
  let length = Math.min(edge, Math.round((box.height * REFLECT_FADE) / ZOOM));
  let depth = Math.min(height - edge, length); // How much of that there's room for (the rest, off the screen)
  if (depth <= 0) return;
  // What's just above the edge, flipped, faded from full at the edge to nothing at the bottom
  mirror.width = width;
  mirror.height = depth;
  mirrorContext.save();
  mirrorContext.translate(0, depth);
  mirrorContext.scale(1, -1);
  mirrorContext.drawImage(canvas, 0, edge - depth, width, depth, 0, 0, width, depth);
  mirrorContext.restore();
  let fade = mirrorContext.createLinearGradient(0, 0, 0, length);
  for (let step = 0; step <= 8; step++) fade.addColorStop(step / 8, `rgba(0, 0, 0, ${0.7 * (1 - step / 8) ** 0.6})`); // (Slowly at first)
  mirrorContext.globalCompositeOperation = 'destination-in';
  mirrorContext.fillStyle = fade;
  mirrorContext.fillRect(0, 0, width, depth);
  // Under the edge, in place of the picture: the background, then the reflection over it
  context.fillStyle = MODES[mode].background;
  context.fillRect(0, edge, width, height - edge);
  context.drawImage(mirror, 0, edge);
}
function repeat(box, canvasTop, edge) {
  let length = Math.round(box.height / ZOOM);
  if (length <= 0) return;
  // The picture in the element (where it is, or where it's held), the right way up and upside down
  let bottom = Math.round((box.bottom + heldUp() - canvasTop) / ZOOM);
  plain.width = mirror.width = width;
  plain.height = mirror.height = length;
  plainContext.drawImage(canvas, 0, bottom - length, width, length, 0, 0, width, length);
  mirrorContext.save();
  mirrorContext.translate(0, length);
  mirrorContext.scale(1, -1);
  mirrorContext.drawImage(plain, 0, 0);
  mirrorContext.restore();
  // Under the element's bottom (as far as it is on the canvas): the background, then the reflections, upside down first,
  // laid out on a strip of their own to fade them
  let from = Math.max(0, edge);
  context.fillStyle = MODES[mode].background;
  context.fillRect(0, from, width, height - from);
  if (from >= height) return;
  strip.width = width;
  strip.height = height - from;
  let first = edge < 0 ? Math.floor(-edge / length) : 0; // (The first one that's on the canvas)
  for (let k = first, y = edge + first * length; y < height; k++, y += length) stripContext.drawImage(k % 2 ? plain : mirror, 0, y - from);
  // With data-reflect-until (an element further down the page), fading out evenly from the element's bottom edge to
  // the top of that one, and gone below it
  if (reflectUntil) {
    let end = (reflectUntil.getBoundingClientRect().top - canvasTop) / ZOOM;
    if (end <= from) return;
    let fade = stripContext.createLinearGradient(0, edge - from, 0, end - from);
    fade.addColorStop(0, 'black');
    fade.addColorStop(1, 'transparent');
    stripContext.globalCompositeOperation = 'destination-in';
    stripContext.fillStyle = fade;
    stripContext.fillRect(0, 0, width, strip.height);
  }
  context.drawImage(strip, 0, from);
}
let strip = document.createElement('canvas');
let stripContext = strip.getContext('2d');
let reflectUntil = holder.dataset.reflectUntil ? document.querySelector(holder.dataset.reflectUntil) : null;

let lastScroll = 0;
function loop() {
  if (!stream && !file) return;
  if (file && 'cuts' in holder.dataset && video.currentTime >= cutEnd) jumpCut();
  // A new frame of the video, or (if it follows the page) the page scrolled
  if (video.readyState >= 2 && (video.currentTime !== lastTime || (follow && scrollY !== lastScroll))) {
    lastTime = video.currentTime;
    lastScroll = scrollY;
    drawFrame();
  }
  requestAnimationFrame(loop);
}

// Over a picture: redrawn STILL_FPS times a second (or once, for those who'd rather things didn't move)
let lastDrawn = 0;
function stillLoop(now) {
  if (!stream && now - lastDrawn >= 1000 / STILL_FPS) {
    lastDrawn = now;
    drawFrame();
  }
  requestAnimationFrame(stillLoop);
}
function startStill() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    drawFrame();
    new ResizeObserver(() => setTimeout(drawFrame, 200)).observe(canvas);
  } else requestAnimationFrame(stillLoop);
}

function showReadout() {
  if (!readout) return;
  readout.textContent = `${preset ? preset + ' · ' : ''}threshold ${threshold} · wander ${jitter} · trail ${trail} · ${mode} · keys: up/down, left/right, b/n, c, 1, enter`;
}

async function startCamera() {
  button.disabled = true;
  try {
    // As many frames a second as the camera can give (up to 120), so a recording can be slowed down smoothly
    stream = await navigator.mediaDevices.getUserMedia({ video: { frameRate: { ideal: 120 } }, audio: false });
    video.srcObject = stream;
    await video.play();
    button.textContent = 'turn off your camera';
    if (recordButton) recordButton.title = `the camera gives ${Math.round(stream.getVideoTracks()[0].getSettings().frameRate || 0)} frames a second`;
    if (recordButton) recordButton.disabled = false;
    showReadout();
    canvas.focus({ preventScroll: true });
    lastTime = -1;
    requestAnimationFrame(loop);
  } catch {
    stopCamera();
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
  if (recorder) stopRecording(); // Saves what's been recorded
  if (recordButton) recordButton.disabled = true;
  if (button) button.textContent = 'turn on your camera';
  if (readout) readout.textContent = 'uses your camera. the video stays on your device';
  clear();
  if (still && matchMedia('(prefers-reduced-motion: reduce)').matches) drawFrame(); // Back to the picture
}

button?.addEventListener('click', () => (stream ? stopCamera() : startCamera()));

// Where the canvas can't be clicked (behind the bio's text), c and the number keys work from anywhere on the page
if (holder.dataset.keys === 'page') {
  window.addEventListener('keydown', (event) => {
    if (event.target === canvas || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'c' || event.key === 'C') mode = MODE_NAMES[(MODE_NAMES.indexOf(mode) + 1) % MODE_NAMES.length];
    else if (PRESETS[Number(event.key) - 1]) ({ threshold, jitter, trail, mode } = PRESETS[Number(event.key) - 1]);
    else return;
    clear();
  });
}

canvas.addEventListener('keydown', (event) => {
  let key = event.key;
  if (key === 'ArrowUp') threshold = Math.max(5, threshold - 5); // More of it
  else if (key === 'ArrowDown') threshold = Math.min(250, threshold + 5); // Less
  else if (key === 'ArrowRight') jitter = Math.min(30, jitter + 1);
  else if (key === 'ArrowLeft') jitter = Math.max(0, jitter - 1);
  else if (key === 'b' || key === 'B') trail = Math.min(40, trail + 1); // Linger longer
  else if (key === 'n' || key === 'N') trail = Math.max(1, trail - 1); // Less
  else if (key === 'c' || key === 'C') mode = MODE_NAMES[(MODE_NAMES.indexOf(mode) + 1) % MODE_NAMES.length];
  else if (key === 'Enter') clear();
  else if (PRESETS[Number(key) - 1]) {
    ({ threshold, jitter, trail, mode } = PRESETS[Number(key) - 1]);
    preset = PRESETS[Number(key) - 1].name;
    clear();
    event.preventDefault();
    showReadout();
    return;
  } else return;
  preset = null;
  event.preventDefault();
  showReadout();
});

let resizing;
new ResizeObserver(() => {
  clearTimeout(resizing);
  resizing = setTimeout(fit, 150);
}).observe(canvas);

// Recording (where there's a record button, on the test page): what's drawn, as a video file, saved when it stops
let recordButton = holder.querySelector('.bio-streaks-record');
let recorder = null;
function startRecording() {
  let type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
  let chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 12_000_000 }); // The camera's own picture
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
  recorder.onstop = () => {
    let blob = new Blob(chunks, { type: recorder.mimeType });
    let link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    let stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    link.download = `camera-${stamp}.${recorder.mimeType.includes('mp4') ? 'mp4' : 'webm'}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    recorder = null;
  };
  recorder.start(1000);
  recordButton.textContent = `stop and save (${Math.round(stream.getVideoTracks()[0].getSettings().frameRate || 0)} fps)`;
  recordButton.classList.add('recording');
}
function stopRecording() {
  if (recorder) recorder.stop();
  recordButton.textContent = 'record the camera';
  recordButton.classList.remove('recording');
}
recordButton?.addEventListener('click', () => (recorder ? stopRecording() : startRecording()));

// A preset to start on (data-preset, 1 for the first)
if (PRESETS[Number(holder.dataset.preset) - 1]) ({ threshold, jitter, trail, mode } = PRESETS[Number(holder.dataset.preset) - 1]);

fit();
if (file) {
  // Plays by itself (it's silent), or, for those who'd rather things didn't move, shows its first frame
  let calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  video.addEventListener('loadeddata', () => (calm ? drawFrame() : ('cuts' in holder.dataset && jumpCut(), video.play()).then(() => requestAnimationFrame(loop), () => drawFrame())), { once: true });
  video.load();
} else if (still) still.decode().then(startStill, () => {});
else stopCamera();
