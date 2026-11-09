// "Wake" (2019) painted with p5.brush: the same rings on the water, following the mouse and coming up anywhere when it
// stops, each one painted with whichever of p5.brush's options is chosen in the corner (or with the left and right
// arrow keys): its line brushes, watercolour in a few ways, a flat wash, or hatching. Hold the mouse down to turn them white.
//
// Brushes are far too slow to paint 150 rings every frame, so a set of rings is painted once, in the wake's colours,
// and the wake stamps them, stretched to each ring's size (as brush_frames.js does for the crowd). Choosing another
// option paints the set again. p5.brush only draws in WebGL, so this uses its standalone build, with a hidden canvas
// of its own.

import * as brush from 'p5.brush/standalone';

const length = 150;
const shades = 12; // How many steps of the wake's colours there are washes for, from a ring's start to its end
const variants = 3; // How many different washes there are of each, so they don't all look the same
const washSize = 128; // How big each wash is painted, in pixels (bigger = finer, but slower to start)
const washMargin = 24; // Room around it for the paint to bleed into, in pixels
const bleed = 0.25; // How far the paint bleeds past the edge, from 0 to 1
const grain = 0.5; // How much the pigment settles into the paper's grain, from 0 to 1
const rim = 0.9; // How strong the ring of pigment at the edge is, from 0 to 1
const washOpacity = 10; // How strong the paint is, from 0 to 255
const paintWith = 'gel pen (plotter)'; // Which option it starts with (one of the names in options, below)
const lineWeight = 1; // How thick the line brushes are (each brush has its own idea of what 1 is)
const flatOpacity = 220; // How strong the flat wash is, from 0 to 255
const hatchBrush = 'HB'; // Which brush draws the hatching and its outline (see brush-options.js for the others)
const hatchGap = 7; // How far apart the hatching's lines are, in the wash's own pixels (it's washSize across)
const hatchAngle = 45;
const rimOnly = true; // Whether only the rims are watercolour, with the middle of each wash taken out
const rimWidth = 0.01; // ...and how wide the rim is, as a share of the wash's radius
const rimSoft = 0.04; // ...and how softly its inside edge fades out, as a share of the radius (0 = a sharp edge)
const fillInside = true; // Whether the watercolour rings are filled with a wash of dark blue inside
const fillColour = '#0b1d4d';
const fillOpacity = 200; // How strong it is, from 0 to 255
const fillBleed = 0.15; // How far it bleeds, from 0 to 1
const fillRim = 0.3; // How strong its own pigment edge is, from 0 to 1
const fillSize = 0.96; // How big it is, compared to the ring (a little smaller, so the rim shows round it)
// The background, painted once at the start: a dark wash over all of it, then blotches of other dark colours
const paper = true; // Whether there's a painted background (otherwise it's black)
const paperColour = '#070b1c'; // The wash over all of it
const paperOpacity = 200;
const paperTones = ['#0b1d4d', '#1a0f3a', '#04131f', '#14112e']; // The blotches' colours
const blotches = 14; // How many blotches there are
const blotchSize = [0.15, 0.45]; // How big they are, at the smallest and biggest, as a share of the screen's longer side
const blotchOpacity = 70; // How strong they are, from 0 to 255
const paperGrain = 0.8; // How much the pigment settles into the paper's grain, from 0 to 1
const paperBleed = 0.3; // How far the blotches bleed, from 0 to 1
const hides = true; // Whether each ring hides the ones behind it, as the wake's black-filled rings did (showing the background)
const hidden = 0.8; // ...and how much of it does, from the middle out

// The options: each one's name, how to set the brush up for a ring in this colour, and whether its middle is rubbed out
// (rimOnly) and whether it hides the rings behind it (hides)
const lineBrushes = ['pen', 'rotring', '2B', 'HB', '2H', 'cpencil', 'pastel', 'crayon', 'charcoal', 'spray', 'marker'];
const options = [
  ...lineBrushes.map((name) => ({
    name,
    setUp: (colour) => {
      brush.noFill();
      brush.noWash();
      brush.noHatch();
      brush.set(name, colour, lineWeight);
    },
  })),
  {
    name: 'watercolour',
    rimCut: true,
    setUp: (colour) => watercolour(colour, washOpacity, bleed, grain, rim),
  },
  {
    name: 'watercolour, strong rim',
    rimCut: true,
    setUp: (colour) => watercolour(colour, 60, 0.2, 0.6, 1),
  },
  {
    name: 'watercolour, clean',
    rimCut: true,
    setUp: (colour) => watercolour(colour, 90, 0.1, 0.1, 0.2, false),
  },
  {
    name: 'wash',
    setUp: (colour) => {
      brush.noStroke();
      brush.noFill();
      brush.noHatch();
      brush.wash(colour, flatOpacity);
    },
  },
  {
    name: 'hatch',
    showsThrough: true, // The black would cover most of the hatching
    setUp: (colour) => {
      brush.noFill();
      brush.noWash();
      brush.set(hatchBrush, colour, lineWeight);
      brush.hatchStyle(hatchBrush, colour, lineWeight);
      brush.hatch(hatchGap, hatchAngle, { rand: 0.1 });
    },
  },
  {
    name: 'gel pen (plotter)',
    live: true, // Drawn as it goes, not stamped (see drawGelRing())
  },
];

// The gel pen: a white gel pen in a pen plotter, on black drawing paper. A plotter's line is the same width all the
// way round, which stretched stamps can't do, so these rings are drawn as they go, in an ink that skips a little where
// the paper's tooth is (the skips stay put on the paper as the rings move over it). Each ring starts with a small
// blob where the pen comes down and goes a little past where it started, and covers what's behind it with paper, as
// a plotter's hidden lines are left out.
const gelColour = [246, 243, 234]; // A slightly creamy white
const gelWidth = 1.4; // How thick the line is, in pixels
const gelSkips = 0.25; // How much the ink skips, from 0 (solid) to 1
const gelBlob = 1.8; // How big the blob where the pen comes down is, compared to the line
const gelOverlap = 0.12; // How far past where it started each ring goes, in radians
const blackPaper = [14, 14, 15]; // The paper's colour
const paperTooth = 6; // How grainy the paper is (0 = smooth)
const paperFibres = 400; // How many faint fibres there are in each tile of paper
// Smudges: now and then a bit of a ring's wet ink gets dragged, the way the mouse is going (or anywhere, if it's
// still), and the smear stays on the paper, fading slowly
const smudgesPerSecond = 1.5;
const smudgeLength = [12, 45]; // How far the ink's dragged, in pixels, at the least and most
const smudgeArc = [0.4, 1.6]; // How much of the ring's dragged, in radians, at the least and most
const smudgeStrength = 0.06; // How strong the smear is, from 0 to 1 (it's built up of a few strokes this strong)
const smudgeBlur = 1.5; // How soft it is, in pixels
const smudgeLife = 30; // Roughly how many seconds a smudge takes to fade away
const boilFrames = 1; // How many drawings of the paper there are, which it goes round, like a boil in hand-drawn animation
const boilRate = 12; // How many of them a second it goes through
const gelInColour = true; // Whether the rings are in the wake's colours (otherwise gelColour). Holding the mouse down still turns them white.

function watercolour(colour, opacity, bleeding, settling, edge, scatter = true) {
  brush.noStroke();
  brush.noWash();
  brush.noHatch();
  brush.fill(colour, opacity);
  brush.fillBleed(bleeding);
  brush.fillTexture(settling, edge, scatter);
}

export default function wakeWatercolor(p, container) {
  const xValue = new Array(length);
  const yValue = new Array(length);
  let washes = []; // washes[shade][variant], and the white ones
  let whites = [];
  let chosen = Math.max(0, options.findIndex((option) => option.name === paintWith));
  let menu;

  p.setup = () => {
    p.createCanvas(container.clientWidth, container.clientHeight);
    p.cursor(p.CROSS);
    makeMenu();
    if (paper) paintPaper();
    makeGelPen();
    paintWashes();
  };

  // The black paper (a drawing of it for each frame of the boil) and the gel pen's skips, as tiles that repeat across
  // the screen, fixed to it
  let blackPaperPattern;
  let paperBoil = [];
  let inkPattern;
  let skipPattern;
  function makeGelPen() {
    const density = p.pixelDensity();
    const tile = 256;
    const makeTile = (draw) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = tile * density;
      const context = canvas.getContext('2d');
      const pixels = context.createImageData(canvas.width, canvas.height);
      draw(pixels.data, canvas.width);
      context.putImageData(pixels, 0, 0);
      return { canvas, context };
    };
    const tileNoise = (x, y, size, scale, from = 10) => {
      // Noise that wraps round, so the tiles join without a seam. Each `from` is a different part of the noise, not
      // the same part moved along (which, from one drawing of the boil to the next, looked like the paper sliding).
      const a = (x / size) * Math.PI * 2;
      const b = (y / size) * Math.PI * 2;
      return p.noise(from + Math.cos(a) * scale, from + Math.sin(a) * scale, from + Math.cos(b) * scale + Math.sin(b) * scale * 0.5);
    };
    const unscale = new DOMMatrix().scale(1 / density, 1 / density);
    const pattern = (canvas) => {
      const made = p.drawingContext.createPattern(canvas, 'repeat');
      made.setTransform(unscale);
      return made;
    };
    // The paper: its colour, with grain and faint fibres, drawn again for each frame of the boil
    paperBoil = [];
    for (let frame = 0; frame < boilFrames; frame++) {
      const paperTile = makeTile((data, size) => {
        for (let k = 0; k < size * size; k++) {
          const x = k % size;
          const y = Math.floor(k / size);
          const tooth = (p.random() - 0.5) * paperTooth + (tileNoise(x, y, size, 3, 10 + frame * 50) - 0.5) * paperTooth;
          data[k * 4] = blackPaper[0] + tooth;
          data[k * 4 + 1] = blackPaper[1] + tooth;
          data[k * 4 + 2] = blackPaper[2] + tooth;
          data[k * 4 + 3] = 255;
        }
      });
      const fibres = paperTile.context;
      fibres.scale(density, density);
      fibres.lineWidth = 0.5;
      for (let n = 0; n < paperFibres; n++) {
        const x = p.random(tile);
        const y = p.random(tile);
        const angle = p.random(Math.PI * 2);
        const length = p.random(2, 9);
        fibres.strokeStyle = `rgba(255,255,255,${p.random(0.02, 0.06)})`;
        fibres.beginPath();
        fibres.moveTo(x, y);
        fibres.quadraticCurveTo(x + p.random(-2, 2), y + p.random(-2, 2), x + Math.cos(angle) * length, y + Math.sin(angle) * length);
        fibres.stroke();
      }
      paperBoil.push(pattern(paperTile.canvas));
    }
    blackPaperPattern = paperBoil[0];
    // Where the pen skips over the paper's tooth: how much it does at each spot
    const skipAt = (x, y, size) => Math.min(0.85, Math.max(0, tileNoise(x, y, size, 8) - 0.55) * 4 * gelSkips + p.random() * 0.15 * gelSkips);
    // The ink in white, a little see-through where it skips...
    const inkTile = makeTile((data, size) => {
      for (let k = 0; k < size * size; k++) {
        data[k * 4] = gelColour[0];
        data[k * 4 + 1] = gelColour[1];
        data[k * 4 + 2] = gelColour[2];
        data[k * 4 + 3] = 255 * (1 - skipAt(k % size, Math.floor(k / size), size));
      }
    });
    inkPattern = pattern(inkTile.canvas);
    // ...and the skips on their own, in the paper's colour, to go over a coloured line
    p.randomSeed(3);
    const skipTile = makeTile((data, size) => {
      for (let k = 0; k < size * size; k++) {
        data[k * 4] = blackPaper[0];
        data[k * 4 + 1] = blackPaper[1];
        data[k * 4 + 2] = blackPaper[2];
        data[k * 4 + 3] = 255 * skipAt(k % size, Math.floor(k / size), size);
      }
    });
    skipPattern = pattern(skipTile.canvas);
  }

  // A ring in gel pen, from where the pen comes down (which is the same all its life, since it's where the ring is)
  // The smudges, on a layer of their own, and the paper with them on it (the ground), which is what's drawn behind
  // the rings and inside them
  let smudges = null;
  let ground = null;
  let groundPattern = null;
  let groundChanged = true;
  let lastFade = 0;
  function makeGround() {
    const density = p.pixelDensity();
    const make = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(p.width * density);
      canvas.height = Math.round(p.height * density);
      const context = canvas.getContext('2d');
      context.scale(density, density);
      return { canvas, context };
    };
    smudges = make();
    ground = make();
  }

  function updateGround() {
    const seconds = p.millis() / 1000;
    if (seconds - lastFade > 0.5) {
      // Fading a little every half second, so they're gone after about smudgeLife
      const c = smudges.context;
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = `rgba(0,0,0,${Math.min(1, 3 / (smudgeLife * 2))})`;
      c.fillRect(0, 0, p.width, p.height);
      c.globalCompositeOperation = 'source-over';
      lastFade = seconds;
      groundChanged = true;
    }
    if (!groundChanged) return;
    const c = ground.context;
    c.fillStyle = blackPaperPattern;
    c.fillRect(0, 0, p.width, p.height);
    c.drawImage(smudges.canvas, 0, 0, p.width, p.height);
    groundPattern = p.drawingContext.createPattern(ground.canvas, 'no-repeat');
    groundPattern.setTransform(new DOMMatrix().scale(1 / p.pixelDensity(), 1 / p.pixelDensity()));
    groundChanged = false;
  }

  // Drag a bit of this ring's ink across the paper
  function smudge(ring, drag) {
    const c = smudges.context;
    const start = p.random(Math.PI * 2);
    const arc = p.random(...smudgeArc);
    const length = p.random(...smudgeLength);
    const angle = drag ?? p.random(Math.PI * 2);
    const dx = Math.cos(angle) * length;
    const dy = Math.sin(angle) * length;
    c.save();
    c.filter = `blur(${smudgeBlur}px)`;
    c.strokeStyle = ring.colour;
    c.lineCap = 'round';
    const strokes = 8;
    for (let k = 0; k < strokes; k++) {
      const t = k / (strokes - 1);
      // Thickest and strongest where it started, thinning and fading as it's dragged
      c.globalAlpha = smudgeStrength * (1 - t * 0.8);
      c.lineWidth = gelWidth * (1.5 + t * 3);
      c.beginPath();
      c.ellipse(ring.x + dx * t, ring.y + dy * t, ring.w / 2, ring.h / 2, 0, start, start + arc * (1 - t * 0.5));
      c.stroke();
    }
    c.restore();
    groundChanged = true;
  }

  // along: how far through its life the ring is (0 to 1), for its colour, as in the wake
  function drawGelRing(g, x, y, w, h, fade, along, white) {
    const start = ((x * 12.9898 + y * 78.233) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    g.beginPath();
    g.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
    if (hides) {
      g.globalAlpha = 1;
      g.fillStyle = groundPattern ?? blackPaperPattern;
      g.fill();
    }
    const line = new Path2D();
    line.ellipse(x, y, w / 2, h / 2, 0, start, start + Math.PI * 2 + gelOverlap);
    const blob = new Path2D();
    blob.arc(x + (Math.cos(start) * w) / 2, y + (Math.sin(start) * h) / 2, (gelWidth * gelBlob) / 2, 0, Math.PI * 2);
    g.globalAlpha = fade;
    g.lineWidth = gelWidth;
    g.lineCap = 'round';
    if (gelInColour && !white) {
      // In colour, with the skips gone over it in the paper's colour
      g.strokeStyle = g.fillStyle = wakeColour(along);
      g.stroke(line);
      g.fill(blob);
      g.strokeStyle = g.fillStyle = skipPattern;
      g.stroke(line);
      g.fill(blob);
    } else {
      g.strokeStyle = g.fillStyle = inkPattern;
      g.stroke(line);
      g.fill(blob);
    }
  }

  // The painted background, and the same as a pattern, for filling in the middles of the rings
  let paperPicture = null;
  let paperPattern = null;
  function paintPaper() {
    const canvas = brush.createCanvas(p.width, p.height, { pixelDensity: 1, parent: null });
    const gl = canvas.getContext('webgl2');
    brush.clear();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    brush.seed(7);
    brush.noStroke();
    brush.noWash();
    brush.noHatch();
    // Measured from the middle, as the brush does. The wash over all of it goes past the edges, so they don't show.
    brush.fill(paperColour, paperOpacity);
    brush.fillBleed(0.1);
    brush.fillTexture(paperGrain, 0.2);
    brush.rect(0, 0, p.width * 1.3, p.height * 1.3, 'center');
    const longer = Math.max(p.width, p.height);
    for (let n = 0; n < blotches; n++) {
      brush.fill(paperTones[n % paperTones.length], blotchOpacity);
      brush.fillBleed(paperBleed);
      brush.fillTexture(paperGrain, 0.5);
      const x = p.random(-0.55, 0.55) * p.width;
      const y = p.random(-0.55, 0.55) * p.height;
      brush.circle(x, y, (p.random(...blotchSize) * longer) / 2, 0.6);
    }
    brush.render();
    paperPicture = document.createElement('canvas');
    paperPicture.width = canvas.width;
    paperPicture.height = canvas.height;
    const context = paperPicture.getContext('2d');
    context.fillStyle = 'black';
    context.fillRect(0, 0, paperPicture.width, paperPicture.height);
    context.drawImage(canvas, 0, 0);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    paperPattern = p.drawingContext.createPattern(paperPicture, 'no-repeat');
    // The pattern's measured in the canvas's own pixels, which p5 has scaled for the screen
    paperPattern.setTransform(new DOMMatrix().scale(p.width / paperPicture.width, p.height / paperPicture.height));
  }

  // The menu in the corner, for choosing an option
  function makeMenu() {
    menu = document.createElement('select');
    menu.style.cssText = 'position: absolute; top: 12px; left: 12px; z-index: 1; font: 13px "Source Code Pro", monospace; background: black; color: white; border: 1px solid #555; padding: 4px;';
    options.forEach((option, n) => menu.add(new Option(option.name, n)));
    menu.value = chosen;
    menu.addEventListener('change', () => choose(Number(menu.value)));
    menu.addEventListener('mousedown', (event) => event.stopPropagation());
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.append(menu);
    // How many frames a second it's drawing (60 is smooth)
    speedo = document.createElement('span');
    speedo.style.cssText = 'position: absolute; top: 18px; left: 230px; z-index: 1; font: 13px "Source Code Pro", monospace; color: #888;';
    container.append(speedo);
  }
  let speedo;

  function choose(n) {
    chosen = (n + options.length) % options.length;
    menu.value = chosen;
    paintWashes();
  }

  p.keyPressed = () => {
    if (document.activeElement === menu) return; // The menu does its own arrow keys
    if (p.keyCode === p.RIGHT_ARROW) choose(chosen + 1);
    if (p.keyCode === p.LEFT_ARROW) choose(chosen - 1);
  };

  // The wake's colour at this far through a ring's life (0 to 1), with the shimmer it had
  function wakeColour(along) {
    const sine = Math.abs(Math.sin(along * Math.PI));
    const cosine = Math.abs(Math.cos(along * Math.PI));
    const r = p.random(150, 255) * sine;
    const g = p.random(150, 255) * cosine;
    const b = 255 - p.random(100, 255) * sine;
    return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  }

  function paintWashes() {
    const option = options[chosen];
    washes = [];
    whites = [];
    if (option.live) return; // Nothing to paint ahead
    const size = washSize + washMargin * 2;
    const canvas = brush.createCanvas(size, size, { pixelDensity: 1, parent: null });
    const gl = canvas.getContext('webgl2');
    // The dark blue inside of the watercolour rings, painted on its own and put under each ring (see below)
    const fills = [];
    const paintFill = (seed) => {
      brush.clear();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      brush.seed(seed);
      watercolour(fillColour, fillOpacity, fillBleed, grain, fillRim);
      brush.circle(0, 0, (washSize / 2) * fillSize, 0.3);
      brush.render();
      const picture = document.createElement('canvas');
      picture.width = canvas.width;
      picture.height = canvas.height;
      picture.getContext('2d').drawImage(canvas, 0, 0);
      return picture;
    };
    if (fillInside && option.rimCut) for (let v = 0; v < variants; v++) fills.push(paintFill(v + 101));

    const paint = (colour, seed) => {
      // brush.clear() leaves the canvas a see-through white, so clear it again to properly nothing
      brush.clear();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      brush.seed(seed);
      option.setUp(colour);
      brush.circle(0, 0, washSize / 2, 0.3); // Measured from the middle, as the brush does, and a little uneven
      brush.render();
      const picture = document.createElement('canvas');
      picture.width = canvas.width;
      picture.height = canvas.height;
      const context = picture.getContext('2d');
      context.drawImage(canvas, 0, 0);
      if (rimOnly && option.rimCut) {
        // Rub out the middle, fading out toward the rim
        const middle = picture.width / 2;
        const radius = (washSize / 2) * (picture.width / size);
        const inside = Math.max(0, 1 - rimWidth - rimSoft);
        const gradient = context.createRadialGradient(middle, middle, 0, middle, middle, radius);
        gradient.addColorStop(0, 'black');
        gradient.addColorStop(inside, 'black');
        gradient.addColorStop(Math.min(1, inside + rimSoft), 'transparent');
        gradient.addColorStop(1, 'transparent');
        context.globalCompositeOperation = 'destination-out';
        context.fillStyle = gradient;
        context.fillRect(0, 0, picture.width, picture.height);
      }
      if (fills.length) {
        // The dark blue goes under the rim
        context.globalCompositeOperation = 'destination-over';
        context.drawImage(fills[seed - 1], 0, 0);
      }
      return picture;
    };
    // Each variant has the same brush marks in every shade, so that a ring keeps its texture as its colour changes
    // and only the colour moves on (with different marks, they all jumped every few frames)
    for (let s = 0; s < shades; s++) {
      washes.push([]);
      for (let v = 0; v < variants; v++) washes[s].push(paint(wakeColour((s + 0.5) / shades), v + 1));
    }
    for (let v = 0; v < variants; v++) whites.push(paint('#ffffff', v + 1));
    // That's all the WebGL needed, and browsers only allow so many contexts at a time
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    brush.noWash(); // So the next option starts from nothing
    brush.noHatch();
  }

  p.draw = () => {
    if (p.frameCount % 30 === 0) speedo.textContent = `${Math.round(p.frameRate())} fps`;
    p.background(0);
    const g = p.drawingContext;
    const live = options[chosen].live;
    if (live) {
      const boil = paperBoil[Math.floor((p.millis() / 1000) * boilRate) % boilFrames];
      if (boil !== blackPaperPattern) groundChanged = true;
      blackPaperPattern = boil;
      if (!ground) makeGround();
      updateGround();
      g.drawImage(ground.canvas, 0, 0, p.width, p.height);
    } else if (paperPicture) g.drawImage(paperPicture, 0, 0, p.width, p.height);
    const white = p.mouseIsPressed;
    const stretch = (washSize + washMargin * 2) / washSize; // The wash is painted with room around it

    for (let i = 0; i < yValue.length - 1; i++) {
      yValue[i] = yValue[i + 1];
      xValue[i] = xValue[i + 1];
      if (xValue[i] === undefined) continue; // trail still filling up

      const along = i / yValue.length;
      const diameter = p.sin(along * p.PI);
      const fade = p.sin(along * p.HALF_PI);
      const scalar = p.map(yValue[i], 0, p.height, 0, 1);
      const w = diameter * 200 * scalar;
      const h = diameter * 75 * (scalar * scalar);
      if (w < 1 || h < 0.5) continue;

      if (live) {
        drawGelRing(g, xValue[i], yValue[i], w, h, fade, along, white);
        if (along > 0.3 && along < 0.9) smudgeable.push({ x: xValue[i], y: yValue[i], w, h, along });
        continue;
      }
      if (hides && !options[chosen].showsThrough) {
        g.globalAlpha = 1;
        g.fillStyle = paperPattern ?? 'black';
        g.beginPath();
        g.ellipse(xValue[i], yValue[i], (w * hidden) / 2, (h * hidden) / 2, 0, 0, Math.PI * 2);
        g.fill();
      }
      // Each ring keeps the same wash all its life (which one goes with where it is in the trail, as the trail moves)
      const variant = (i + frameShift) % variants;
      const shade = Math.min(shades - 1, Math.floor(along * shades));
      const wash = white ? whites[variant] : washes[shade][variant];
      g.globalAlpha = fade;
      g.drawImage(wash, xValue[i] - (w * stretch) / 2, yValue[i] - (h * stretch) / 2, w * stretch, h * stretch);
    }
    g.globalAlpha = 1;
    frameShift = (frameShift + 1) % variants; // Every ring moves one place down the trail each frame

    if (p.pmouseX != p.mouseX || p.pmouseY != p.mouseY) {
      yValue[yValue.length - 1] = p.mouseY + p.random(-30, 30);
      xValue[xValue.length - 1] = p.mouseX + p.random(-70, 70);
    } else {
      yValue[yValue.length - 1] = p.random(p.height);
      xValue[xValue.length - 1] = p.random(p.width);
    }
  };

  let frameShift = 0;
}
