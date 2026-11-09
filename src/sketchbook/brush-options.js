// Every kind of mark p5.brush can make, side by side: a few of the wake's rings (flat ellipses, in its colours) drawn
// with each of the built-in brushes, the watercolour fill in a few ways, the flat wash and hatching. For choosing
// how the wake could be painted (see wake-watercolor.js). Click to paint them all again.
//
// p5.brush only draws in WebGL, so this uses its standalone build, with a hidden canvas of its own, and copies it in.

import * as brush from 'p5.brush/standalone';

const columns = 4;
const brushScale = 1.2; // How big the brushes are (see brush.scaleBrushes)
const wakeColours = ['#00e6ff', '#ff3c8c', '#ff2a1e']; // The wake's colours, from a ring's start to its middle

// Each option: its name, and how to set the brush up for one ring in this colour
const options = [
  ...['pen', 'rotring', '2B', 'HB', '2H', 'cpencil', 'pastel', 'crayon', 'charcoal', 'spray', 'marker'].map((name) => ({
    name,
    setUp: (colour) => {
      brush.noFill();
      brush.noHatch();
      brush.set(name, colour, 1);
    },
  })),
  {
    name: 'watercolour',
    setUp: (colour) => {
      brush.noStroke();
      brush.noHatch();
      brush.fill(colour, 90);
      brush.fillBleed(0.25);
      brush.fillTexture(0.4, 0.4);
    },
  },
  {
    name: 'watercolour, strong rim',
    setUp: (colour) => {
      brush.noStroke();
      brush.noHatch();
      brush.fill(colour, 60);
      brush.fillBleed(0.2);
      brush.fillTexture(0.6, 1);
    },
  },
  {
    name: 'watercolour, clean',
    setUp: (colour) => {
      brush.noStroke();
      brush.noHatch();
      brush.fill(colour, 90);
      brush.fillBleed(0.1);
      brush.fillTexture(0.1, 0.2, false);
    },
  },
  {
    name: 'wash (flat)',
    setUp: (colour) => {
      brush.noStroke();
      brush.noHatch();
      brush.noFill();
      brush.wash(colour, 120);
    },
  },
  {
    name: 'hatch',
    setUp: (colour) => {
      brush.noWash();
      brush.noFill();
      brush.set('HB', colour, 1);
      brush.hatchStyle('HB', colour, 0.8);
      brush.hatch(5, 45, { rand: 0.1 });
    },
  },
];

export default function brushOptions(p, container) {
  let painted = null;

  p.setup = () => {
    const canvas = p.createCanvas(container.clientWidth, container.clientHeight);
    canvas.mousePressed(() => (painted = null));
  };

  p.windowResized = () => (painted = null);

  function paintAll() {
    const rows = Math.ceil(options.length / columns);
    const cellW = p.width / columns;
    const cellH = p.height / rows;
    const sheet = brush.createCanvas(p.width, p.height, { pixelDensity: p.pixelDensity(), parent: null });
    const gl = sheet.getContext('webgl2');
    brush.clear();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    brush.scaleBrushes(brushScale);
    options.forEach((option, n) => {
      // Measured from the middle of the canvas, as the brush does
      const cx = (n % columns + 0.5) * cellW - p.width / 2;
      const cy = (Math.floor(n / columns) + 0.55) * cellH - p.height / 2;
      // Three rings, the way the wake's overlap: flat ellipses, 200 : 75 as at the bottom of the screen
      [[-0.18, -0.08, 0.55], [0.12, 0.05, 0.75], [-0.05, 0.12, 0.4]].forEach(([dx, dy, size], ring) => {
        option.setUp(wakeColours[ring]);
        const w = cellW * size;
        const h = w * (75 / 200);
        brush.beginShape(1);
        for (let a = 0; a < 24; a++) {
          const angle = (a / 24) * Math.PI * 2;
          brush.vertex(cx + dx * cellW + (Math.cos(angle) * w) / 2, cy + dy * cellH + (Math.sin(angle) * h) / 2);
        }
        brush.endShape(true);
      });
    });
    brush.noWash();
    brush.render();
    const picture = document.createElement('canvas');
    picture.width = sheet.width;
    picture.height = sheet.height;
    picture.getContext('2d').drawImage(sheet, 0, 0);
    gl.getExtension('WEBGL_lose_context')?.loseContext(); // Browsers only allow so many WebGL contexts at a time
    return { picture, cellW, cellH };
  }

  p.draw = () => {
    if (painted) return;
    painted = paintAll();
    const { picture, cellW, cellH } = painted;
    p.background(0);
    p.drawingContext.drawImage(picture, 0, 0, p.width, p.height);
    // The names, and lines between the cells
    p.stroke(255, 40);
    for (let i = 1; i < columns; i++) p.line(i * cellW, 0, i * cellW, p.height);
    for (let j = 1; j * cellH < p.height - 1; j++) p.line(0, j * cellH, p.width, j * cellH);
    p.noStroke();
    p.fill(255);
    p.textFont('Source Code Pro, monospace');
    p.textSize(13);
    options.forEach((option, n) => p.text(option.name, (n % columns) * cellW + 12, Math.floor(n / columns) * cellH + 22));
  };
}
