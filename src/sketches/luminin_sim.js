// The Luminin, simulated: the 2025 album-release Processing sketch
// (~/Documents/Projects/Luminin/sketch_20250602_Album_Release_Sketches), ported to p5 scene by scene, as close to the
// original as it'll go. On stage the controller on the guitar's headstock sends its motion over serial; here a little
// performer plays a guitar with it on (see luminin_performer.js), moved by the viewer, and its button, or a click on the
// screen's output, moves on to the next song. What it draws is shown as the stage's background (the canvas it draws on
// stays hidden).
//
// Like the original it draws at 800 x 300, with one shared offscreen layer (pg) that scenes leave their trails on.
// It only runs while it's on the screen.
//
// The original's strobe(), laid over some songs, flashes about twelve times a second; here it's held to three a second
// (photosensitive epilepsy), so far only on the songs ported since (see strobe). The songs not ported yet are left out.

import p5 from 'p5';
import { createPerformer } from './luminin_performer.js';

p5.disableFriendlyErrors = import.meta.env.PROD;

const WIDTH = 800;
const HEIGHT = 300;

// The controller's readings, as the original names them (see serialEvent in the original), filled in by the performer
const controller = { zTilt: 0, totalAcc: 0, gyroX: 0, gyroY: 0, upJolt: 0, downJolt: 0, forwardJolt: 0, backJolt: 0 };

const holder = document.querySelector('.luminin-sim');
const label = document.querySelector('.luminin-stage .sim-label');

new p5((p) => {
  let pg;
  let scene = 0;
  let performer;
  let lastFrame = performance.now();
  // The screen's colour, roughly, for the light on the controller and the floor
  const average = document.createElement('canvas');
  average.width = average.height = 1;
  const averageContext = average.getContext('2d', { willReadFrequently: true });
  let glow = 'white';

  // ------------------------------------------------------------------ Intermission: the worm (Worm.pde)
  const worm = {
    numSegments: 80,
    xyLoc: [],
    noiseCounter: 0,
    speed: 0.002,
    setup() {
      for (let i = 0; i < this.numSegments; i++) this.xyLoc[i] = p.createVector(0, 0);
    },
    update(circSize) {
      const { zTilt, downJolt } = controller;
      const head = this.xyLoc[this.numSegments - 1];
      head.x = p.map(p.noise(this.noiseCounter), 0, 1, -WIDTH / 2, (3 * WIDTH) / 2);
      head.y = p.map(p.noise(this.noiseCounter + 50), 0, 1, -HEIGHT / 2, (3 * HEIGHT) / 2);
      this.speed = p.map(downJolt, 0, 2000, 0.005, 0.5);

      pg.colorMode(p.RGB);
      pg.strokeWeight(3);
      const n = this.noiseCounter;
      pg.fill(p.noise(n) * 50, 150 * p.noise(n + 5), 150 * p.noise(n + 10), Math.max(0, p.map(downJolt, 0, 100, 50, 10)));
      pg.rect(0, 0, WIDTH, HEIGHT);

      for (let i = 0; i < this.numSegments - 1; i++) {
        this.xyLoc[i].x = this.xyLoc[i + 1].x;
        this.xyLoc[i].y = this.xyLoc[i + 1].y;
        const scalar = Math.sin(p.map(i, 0, this.numSegments - 1, 0, Math.PI));
        const tilt = Math.abs(zTilt);
        pg.stroke(255 - scalar * 255 * tilt + p.random(-20, 20), p.random(downJolt), scalar * 250 * tilt + p.random(-20, 20));
        pg.fill(scalar * 250 * tilt + p.random(-20, 20), p.random(downJolt), 255 - scalar * 255 * tilt + p.random(-20, 20));
        pg.ellipse(this.xyLoc[i].x, this.xyLoc[i].y, circSize * scalar, circSize * scalar);
      }
      p.image(pg, 0, 0);
      this.noiseCounter += this.speed;
    },
  };

  // ------------------------------------------------------------------ Odysseus: the pink cloud (Pink_Cloud.pde)
  // The original works out every pixel; this does every fourth one each way and scales it up, which the LED screens'
  // own coarseness hides anyway
  const CLOUD_STEP = 4;
  const cloud = {
    image: null,
    setup() {
      this.image = p.createImage(WIDTH / CLOUD_STEP, HEIGHT / CLOUD_STEP);
    },
    update() {
      const { zTilt, totalAcc, downJolt } = controller;
      const z = p.millis() * 0.0001 + totalAcc / 2;
      const dx = p.millis() * 0.0001;
      const scale = 0.02 * (1 + totalAcc / 3) * CLOUD_STEP;
      const img = this.image;
      img.loadPixels();
      for (let x = 0; x < img.width; x++) {
        for (let y = 0; y < img.height; y++) {
          const n = p.noise(x * scale, dx + y * scale, z) - 0.2;
          // Processing's HSB clamps the hue to 0-255, which is what turns most of it pink
          const hue = p.map(zTilt, -1, 1, 0, -80) + 240 + 100 * n - p.random(20 + downJolt);
          const [r, g, b] = hsb(hue, 255, 255);
          const at = 4 * (x + img.width * y);
          img.pixels[at] = r;
          img.pixels[at + 1] = g;
          img.pixels[at + 2] = b;
          img.pixels[at + 3] = 255;
        }
      }
      img.updatePixels();
      p.image(img, 0, 0, WIDTH, HEIGHT);
    },
  };

  // ------------------------------------------------------------------ Little Drone + Head in the Cloud: golden circles (Golden_Circles.pde)
  const golden = {
    slow: 3,
    num: 40,
    xLoc: [],
    yLoc: [],
    cosWave: [],
    speedCounter: 0,
    setup() {
      for (let i = 0; i < this.num; i++) {
        this.xLoc[i] = 0;
        this.yLoc[i] = 0;
        this.cosWave[i] = Math.abs(Math.cos(p.map(i, 0, this.num, 0, Math.PI)));
      }
    },
    update() {
      const { zTilt, totalAcc, gyroY, downJolt } = controller;
      if (this.speedCounter % this.slow === 0) {
        p.strokeWeight(10);
        p.background(0);
        for (let i = 0; i < this.yLoc.length - 1; i++) {
          this.yLoc[i] = this.yLoc[i + 1];
          this.xLoc[i] = this.xLoc[i + 1];
          p.fill(...hsb(10 * this.cosWave[i] + p.map(zTilt, -2, 1, 100, 260) - p.random(downJolt), 255, 100 + downJolt / 2));
          p.stroke(...hsb(20 * this.cosWave[i] + p.map(zTilt, -1, 1, 0, 40), 255, 255));
          const diameter = Math.sin(p.map(i, 0, this.yLoc.length, 0, Math.PI)) * ((HEIGHT / 2) * (1 + totalAcc / 3));
          p.ellipse(this.xLoc[i], this.yLoc[i], diameter, diameter);
        }
      }
      this.yLoc[this.yLoc.length - 1] = p.random(HEIGHT);
      this.xLoc[this.xLoc.length - 1] = p.random(WIDTH) + gyroY * 5;
      this.speedCounter++;
    },
  };

  // ------------------------------------------------------------------ Crush: scanlines (Scanlines.pde)
  const scanlines = {
    y: -60,
    ySpeed: 9, // The original works this out once, at the start, when there's no jolt yet
    update() {
      const { zTilt, totalAcc } = controller;
      p.background(0);
      pg.colorMode(p.RGB);
      pg.noStroke();
      pg.fill(0, 50);
      pg.rect(0, 0, WIDTH, HEIGHT);
      pg.strokeWeight(5 + totalAcc * 5);
      pg.stroke(...hsb(255 - (zTilt - 0.2) * 100 - p.random(totalAcc * 50), 255 - p.random(totalAcc * 50), 255));
      pg.push();
      pg.translate(0, this.y);
      for (let i = -HEIGHT * 5; i < HEIGHT * 5; i += 120) {
        pg.line(0, i, WIDTH / 2, i + zTilt * 600);
        pg.line(WIDTH, i, WIDTH / 2, i + zTilt * 600);
      }
      pg.pop();
      p.image(pg, 0, 0);
      this.y += this.ySpeed;
      if (this.y > HEIGHT) this.y = -HEIGHT;
    },
  };

  // ------------------------------------------------------------------ Just Keep On Living In The Moment, as on the Luminin 1.0 (2021)
  // The version in the close-up on this page: the 1.0 folder's Imagination_Ltd.pde, the same waves as the 2025 one but
  // drawn at the 1.0 screens' 320 x 320, never cleared (so its trails pile up), with all 33 columns on the screen and its
  // fill as strong as the jolts up and down added together. It's then shown as the two 16 x 32 LED screens show it: each
  // LED takes the one pixel at its spot (as the Fadecandy server does), and the diffusers in front blur them together,
  // which is what turns its rectangles into soft blobs of colour.
  const SIZE_1 = 320;
  const LED = { across: 16, down: 32, blur: 7, gap: 18 }; // Per screen; the blur is the diffusers', in pixels
  const waves1 = {
    spacing: 10,
    theta: 0,
    period: 12,
    yValues: [],
    yValues2: [],
    xValues: [],
    setup() {
      this.pg = p.createGraphics(SIZE_1, SIZE_1);
      this.pg.pixelDensity(1);
      this.pg.background(0);
      const count = Math.floor((SIZE_1 + 16) / this.spacing);
      this.dx = (Math.PI * 2) / this.period;
      this.yValues = new Array(count).fill(0);
      this.yValues2 = new Array(count).fill(0);
      this.xValues = new Array(count).fill(0);
      this.leds = document.createElement('canvas');
      this.leds.width = LED.across * 2;
      this.leds.height = LED.down;
      this.ledContext = this.leds.getContext('2d');
    },
    update() {
      const { gyroY, downJolt, upJolt, zTilt } = controller;
      const pg1 = this.pg;
      const radius = 15 + gyroY;
      const amplitude = 50 + downJolt / 10;
      this.theta += 0.1 + p.map(gyroY, -50, 50, -0.4, 0.4);
      let x = this.theta;
      const angle = (Math.PI * 2) / this.yValues.length;
      for (let i = 0; i < this.yValues.length; i++) {
        this.yValues[i] = radius * Math.sin(angle * i) + Math.sin(x) * amplitude;
        this.yValues2[i] = radius * Math.cos(angle * i) - Math.sin(x) * amplitude;
        this.xValues[i] = i * this.spacing;
        x += this.dx;
      }
      const joltFactor = upJolt + downJolt;
      const w = SIZE_1;
      pg1.rectMode(p.CENTER);
      pg1.strokeWeight(1);
      for (let i = 0; i < this.yValues.length; i++) {
        const xv = this.xValues[i];
        pg1.fill(...hsb(xv / 10 + 255 * Math.abs(zTilt), 255 - (joltFactor / 10) * p.random(1), 255), Math.min(255, joltFactor));
        pg1.stroke(...hsb(40 + xv / 6, 255 * p.random(1), 255)); // Top wave
        pg1.rect(w - xv - 5, p.random(1) * ((upJolt + downJolt) / 5), 20 + w / this.xValues.length, this.yValues2[i] * 5);
        pg1.stroke(...hsb(230 - xv / 6, 255 * p.random(1), 255)); // Bottom wave
        pg1.rect(w - xv - 5, w - p.random(1) * ((upJolt + downJolt) / 5), 20 + w / this.xValues.length, this.yValues[i] * 5);
        pg1.stroke(...hsb(xv / 2 + 255 * Math.abs(zTilt), 255 - (joltFactor / 2) * p.random(1), 255)); // Middle wave
        pg1.rect(w - (xv - 5), w / 2 + p.random(1) * (upJolt + downJolt / 5), Math.abs(gyroY) + w / this.xValues.length, this.yValues[i] * 4);
      }
      pg1.fill(0, 10);
      pg1.noStroke();
      pg1.rect(w / 2, w / 2, w, w);
      this.show();
    },
    // The two screens, side by side in the middle of the frame
    show() {
      const pg1 = this.pg;
      pg1.loadPixels();
      const cell = SIZE_1 / (LED.across * 2);
      const image = this.ledContext.createImageData(LED.across * 2, LED.down);
      for (let y = 0; y < LED.down; y++) {
        for (let x = 0; x < LED.across * 2; x++) {
          const from = 4 * (Math.floor(y * cell + cell / 2) * SIZE_1 + Math.floor(x * cell + cell / 2));
          const to = 4 * (y * LED.across * 2 + x);
          for (let k = 0; k < 3; k++) image.data[to + k] = pg1.pixels[from + k];
          image.data[to + 3] = 255;
        }
      }
      this.ledContext.putImageData(image, 0, 0);
      p.background(0);
      const height = HEIGHT - 16;
      const width = height / 2;
      const left = WIDTH / 2 - width - LED.gap / 2;
      const context = p.drawingContext;
      context.save();
      context.imageSmoothingEnabled = true;
      context.filter = `blur(${LED.blur}px)`;
      for (let screen = 0; screen < 2; screen++) {
        const x = left + screen * (width + LED.gap);
        context.save();
        context.beginPath();
        context.rect(x, 8, width, height); // The blur stays inside each screen's frame
        context.clip();
        context.drawImage(this.leds, screen * LED.across, 0, LED.across, LED.down, x, 8, width, height);
        context.restore();
      }
      context.restore();
    },
  };

  // ------------------------------------------------------------------ Just Keep On Living In The Moment: intense waves (Intense_Waves.pde)
  // Three rows of rectangles heaving in waves (top, bottom and middle). As in the original, only the first ten or so
  // columns land on the screen (each is 80 pixels further along, from the right), and its period is set once, so the
  // upJolt it's later given does nothing
  const waves = {
    spacing: 10,
    theta: 0,
    amplitude: 15,
    period: 12,
    radius: 0,
    yValues: [],
    yValues2: [],
    xValues: [],
    setup() {
      const count = Math.floor((WIDTH + 16) / this.spacing);
      this.dx = (Math.PI * 2) / this.period;
      this.yValues = new Array(count).fill(0);
      this.yValues2 = new Array(count).fill(0);
      this.xValues = new Array(count).fill(0);
    },
    update() {
      const { gyroY, downJolt, upJolt } = controller;
      this.radius = 15 + gyroY;
      this.amplitude = 50 + downJolt / 10;
      p.background(0);
      this.calcWave();
      pg.background(0);
      pg.rectMode(p.CENTER);
      this.renderWave();
      pg.fill(0, 10);
      pg.noStroke();
      pg.rectMode(p.CORNER);
      pg.rect(0, 0, WIDTH, HEIGHT);
      p.image(pg, 0, 0);
      strobe();
    },
    calcWave() {
      this.theta += 0.1 + p.map(controller.gyroY, -50, 50, -0.4, 0.4);
      let x = this.theta;
      const angle = (Math.PI * 2) / this.yValues.length;
      for (let i = 0; i < this.yValues.length; i++) {
        this.yValues[i] = this.radius * Math.sin(angle * i) + Math.sin(x) * this.amplitude;
        this.yValues2[i] = this.radius * Math.cos(angle * i) - Math.sin(x) * this.amplitude;
        this.xValues[i] = Math.floor((i * WIDTH) / this.spacing);
        x += this.dx;
      }
    },
    renderWave() {
      const { zTilt, gyroY, downJolt, upJolt } = controller;
      const joltFactor = Math.floor((upJolt + downJolt) / 2);
      const across = 50 + WIDTH / this.xValues.length;
      for (let i = 0; i < this.yValues.length; i++) {
        const x = this.xValues[i];
        pg.fill(...hsb(x / 10 + 255 * Math.abs(zTilt), 255 - (joltFactor / 10) * p.random(1), 255), Math.min(255, upJolt));
        pg.strokeWeight(Math.max(0.1, p.map(downJolt, 0, 1000, 1, 10)));
        // Top wave
        pg.stroke(...hsb(40 + x / 6, 255 * p.random(1), 255));
        pg.rect(WIDTH - x - 5, p.random(1) * ((upJolt + downJolt) / 5), across, this.yValues2[i] * 5);
        // Bottom wave
        pg.stroke(...hsb(230 - x / 6, 255 * p.random(1), 255));
        pg.rect(WIDTH - x - 5, HEIGHT - p.random(1) * ((upJolt + downJolt) / 5), across, this.yValues[i] * 5);
        // Middle wave
        pg.stroke(...hsb(x / 2 + 255 * Math.abs(zTilt), 255 - (joltFactor / 2) * p.random(1), 255));
        pg.rect(WIDTH - (x - 5), HEIGHT / 2 + p.random(1) * (upJolt + downJolt / 5), Math.abs(gyroY) + WIDTH / this.xValues.length, this.yValues[i] * 4);
      }
    },
  };

  // The original's strobe(): a wash over everything, alternately black and white, as strong as the latest down jolt
  // (none below 500). The original swaps every few frames, about twelve times a second; this is held to three flashes
  // a second (photosensitive epilepsy), each white for a third of its cycle
  const STROBE_RATE = 3;
  function strobe() {
    const amount = p.map(controller.downJolt, 500, 2000, 0, 150, true);
    if (amount <= 0) return;
    const white = ((p.millis() / 1000) * STROBE_RATE) % 1 > 2 / 3;
    p.noStroke();
    p.fill(white ? 255 : 0, amount);
    p.rect(0, 0, WIDTH, HEIGHT);
  }

  // ------------------------------------------------------------------ Unfamiliar State, from the Luminin 1.0 (2021)
  // The 1.0 folder's Unfamiliar_State.pde (with FlowField.pde and Vehicle.pde): twenty circles ride a flow field of
  // noise, coloured by the tilt; jolts speed them up, thicken them, and bend the field, a jolt up turns the flow round
  // (a jolt down turns it back), and a frame round the edge flares with the jolts. The original is drawn at the 1.0
  // screens' 320 x 320; here it's 300 x 300, on its own layer, which the stage shows as it is on the laptop running
  // it, with a dot on each spot the LEDs take their colour from (the 1.0's two 16 x 32 screens, side by side, make one
  // 32 x 32 display). What the display itself shows isn't drawn yet
  const UNFAMILIAR = 300; // The sketch's size
  const SAMPLES = 32; // LEDs each way
  const unfamiliar = {
    resolution: 20,
    zoff: 0,
    field: [],
    vehicles: [],
    rotate: 0,
    dirSwitch: 0,
    joltFactor: 0,
    setup() {
      this.pg = p.createGraphics(UNFAMILIAR, UNFAMILIAR);
      this.pg.pixelDensity(1);
      this.cols = Math.floor(UNFAMILIAR / this.resolution);
      this.rows = Math.floor(UNFAMILIAR / this.resolution);
      p.noiseSeed(Math.floor(p.random(10000))); // As the field's init() does, for a new field each time
      for (let i = 0; i < 20; i++) {
        this.vehicles.push({
          position: p.createVector(p.random(UNFAMILIAR), p.random(UNFAMILIAR)),
          velocity: p.createVector(0, 0),
          acceleration: p.createVector(0, 0),
          r: p.random(5, 40),
          maxspeed: p.random(3, 8),
          maxforce: p.random(0.1, 0.5),
        });
      }
    },
    updateField() {
      const { joltFactor, rotate, dirSwitch } = this;
      let xoff = 0;
      for (let i = 0; i < this.cols; i++) {
        this.field[i] ||= [];
        let yoff = 0;
        for (let j = 0; j < this.rows; j++) {
          const theta = p.map(p.noise(xoff, yoff, this.zoff), 0, 1, Math.PI / 2 - 0.3 + joltFactor, Math.PI / 2 + 0.3 + joltFactor) + rotate + Math.PI * dirSwitch;
          this.field[i][j] = p5.Vector.fromAngle(theta);
          yoff += 0.05 + joltFactor;
        }
        xoff += 0.05 + joltFactor;
      }
      this.zoff += 0.01 + joltFactor;
    },
    lookup(position) {
      const column = Math.floor(p.constrain(position.x / this.resolution, 0, this.cols - 1));
      const row = Math.floor(p.constrain(position.y / this.resolution, 0, this.rows - 1));
      return this.field[column][row].copy();
    },
    update() {
      const { zTilt, gyroY, upJolt, downJolt } = controller;
      this.rotate = p.map(gyroY, -100, 100, -1, 1);
      this.joltFactor = p.map(upJolt + downJolt, 0, 700, 0, 1);
      const { joltFactor, rotate } = this;
      const pg = this.pg;
      p.background(0);
      this.updateField();
      pg.colorMode(p.RGB);
      pg.rectMode(p.CENTER);
      if (upJolt > 340) this.dirSwitch = 1;
      if (downJolt > 340) this.dirSwitch = 0;
      pg.noFill();
      for (const v of this.vehicles) {
        // Following the field: steering toward its flow at that spot
        const desired = this.lookup(v.position).mult(v.maxspeed + joltFactor * 100);
        v.acceleration.add(p5.Vector.sub(desired, v.velocity).limit(v.maxforce));
        v.velocity.add(v.acceleration);
        v.velocity.limit(v.maxspeed + (upJolt + downJolt / 30)); // As the original has it
        v.position.add(v.velocity);
        v.acceleration.mult(0);
        // Wrapping round the edges
        const l = v.position;
        if (l.x < -v.r) l.x = UNFAMILIAR + v.r;
        if (l.y < -v.r) l.y = UNFAMILIAR + v.r;
        if (l.x > UNFAMILIAR + v.r) l.x = -v.r;
        if (l.y > UNFAMILIAR + v.r) {
          l.y = -v.r;
          l.x = p.random(UNFAMILIAR);
        }
        const vel = p.map(v.velocity.mag(), 3, 8, 50, 100);
        // Not in the original: tilted up past where it's held, the hue's turned toward blue and purple (the original's
        // own colour stops at cyan)
        const toPurple = Math.max(0, zTilt - 0.3) * 120;
        const hue = rgbHue(255 - (zTilt + 0.25) * 500, 255 - (vel - zTilt * 50), (zTilt + 0.1) * 500) + toPurple;
        const spread = 5 + 10 * joltFactor;
        pg.stroke(...hsb(hue + p.random(-spread, spread) - l.y / (16 - 10 * joltFactor), 255 - (downJolt / 1.5 - upJolt / 1.5), 255));
        pg.strokeWeight(2 + joltFactor * 20);
        pg.ellipse(l.x, l.y, v.r * 2, v.r * 2);
      }
      // The fade, and the frame round the edge
      pg.fill(0, 15 - joltFactor * 20 - Math.abs(rotate * 10));
      pg.strokeWeight(3 + upJolt / 3);
      pg.stroke(...hsb(255 - gyroY * 2, 255 - upJolt, 255));
      pg.rect(UNFAMILIAR / 2, UNFAMILIAR / 2, UNFAMILIAR, UNFAMILIAR);
      pg.stroke(...hsb(downJolt, 255 - downJolt / 3, 255), 255 - downJolt / 4);
      // With no jolt the original's line is as thin as it goes; a canvas ignores a width of 0, so it's held to 1
      pg.strokeWeight(Math.max(1, downJolt / 2));
      pg.rect(UNFAMILIAR / 2, UNFAMILIAR / 2, UNFAMILIAR, UNFAMILIAR);
      pg.rectMode(p.CORNER);
    },
  };
  // A colour's hue, out of 255, as Processing's hue() gives it (its numbers clamped to 0-255 first)
  function rgbHue(r, g, b) {
    [r, g, b] = [r, g, b].map((c) => Math.min(255, Math.max(0, c)));
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    if (!d) return 0;
    const h = max === r ? (g - b) / d : max === g ? 2 + (b - r) / d : 4 + (r - g) / d;
    return (((h / 6) % 1) + 1) % 1 * 255;
  }

  // The songs, in the original's order (its switch in draw()), with the ones not ported yet left out
  // ------------------------------------------------------------------ Riper Than Ripe, from the Luminin 1.0 (2021)
  // The 1.0 folder's RiperThanRipe.pde, at the 1.0 screens' 320 x 320: four stripes of colour fall at their own speeds
  // (shifted by the gyro, widened by the acceleration) onto a layer that's never cleared, so they paint over each
  // other; a jolt down floods it with one colour and puts four big letters of RIPERTHANRIPE in its quarters, cycling,
  // their colours turned by the tilt. (The original draws its layer flipped twice over, which leaves it as it is.)
  const RIPER = 320;
  const riper = {
    phrase: 'RIPERTHANRIPE',
    speed: 0.5,
    intervals: [0, 0, 0, 0],
    counters: [0, 0, 0, 0],
    setup() {
      this.pg = p.createGraphics(RIPER, RIPER);
      this.pg.pixelDensity(1);
      this.pg.background(0);
    },
    update() {
      const { zTilt, totalAcc, gyroX, downJolt } = controller;
      const pg = this.pg;
      const millis = p.millis();
      const tiltColor = p.map(zTilt, -0.8, 0.8, 0, 360);
      const n = this.phrase.length;
      const [c1, c2, c3, c4] = this.counters;
      const letters = [c1, (c2 + 1) % n, (c3 + 2) % n, (c4 + 3) % n];
      p.background(0);
      pg.noStroke();
      pg.rectMode(p.CORNER);
      const shift = gyroX * 2;
      const wide = RIPER / 4 + totalAcc / 4;
      for (const [x, hueRate, fall] of [[0, 0.05, 0.7], [RIPER / 4, 0.1, 0.45], [RIPER / 2, 0.2, 0.55], [RIPER - RIPER / 4, 0.3, 0.8]]) {
        pg.fill(...hsb((hueRate * millis) % 255, 255, 255));
        pg.rect(x + shift, ((fall * millis) % (RIPER + 300)) - 50, wide, 100);
      }
      if (downJolt > 50) {
        pg.textSize(180);
        pg.fill(...hsb(250 - tiltColor / 2 + p.random(-20, 20), 255, 255));
        pg.rect(0, 0, RIPER, RIPER);
        pg.fill(...hsb(150 - tiltColor / 2 + p.random(-20, 20), 255, 255));
        pg.textAlign(p.CENTER, p.BOTTOM);
        pg.text(this.phrase[letters[0]], RIPER / 4, RIPER / 2 + 20);
        pg.text(this.phrase[letters[1]], (3 * RIPER) / 4, RIPER / 2 + 20);
        pg.textAlign(p.CENTER, p.TOP);
        pg.text(this.phrase[letters[2]], RIPER / 4, RIPER / 2 - 20);
        pg.text(this.phrase[letters[3]], (3 * RIPER) / 4, RIPER / 2 - 20);
      }
      // The letters move on, each at its own uneven pace (as in the original, the third and fourth follow the second's)
      for (let i = 0; i < 4; i++) this.intervals[i] += this.speed + p.random(this.speed / 2);
      this.counters = [0, 1, 1, 1].map((from) => Math.floor(this.intervals[from]));
      for (let i = 0; i < 4; i++) {
        if (this.counters[i] >= n) {
          this.counters[i] = 0;
          this.intervals[i] = 0;
        }
      }
      p.image(pg, 0, 0);
    },
  };

  // ------------------------------------------------------------------ Odysseus, from the Luminin 1.0 (2021)
  // The 1.0 folder's Odysseus.pde, at its 160 x 160: an 80 x 80 cloud of noise, scaled up, each pixel's hue from the
  // tilt and the noise (Processing's HSB holding hues to 0-255 is what turns most of it pink), drifting and stretching
  // with the acceleration, jolts down scattering its colours
  const ODYSSEUS = 160;
  const odysseus = {
    setup() {
      this.clouds = p.createImage(80, 80);
      this.pg = p.createGraphics(ODYSSEUS, ODYSSEUS);
      this.pg.pixelDensity(1);
    },
    update() {
      const { zTilt, totalAcc, downJolt } = controller;
      const img = this.clouds;
      const z = p.millis() * 0.0001 + totalAcc / 2;
      const dx = p.millis() * 0.0001;
      const scale = 0.02 * (1 + totalAcc / 3);
      img.loadPixels();
      for (let x = 0; x < img.width; x++) {
        for (let y = 0; y < img.height; y++) {
          const n = p.noise(x * scale, dx + y * scale, z) - 0.2;
          const [r, g, b] = hsb(p.map(zTilt, -1, 1, 0, -80) + 240 + 100 * n - p.random(downJolt), 255, 255);
          const at = 4 * (x + img.width * y);
          img.pixels[at] = r;
          img.pixels[at + 1] = g;
          img.pixels[at + 2] = b;
          img.pixels[at + 3] = 255;
        }
      }
      img.updatePixels();
      this.pg.image(img, 0, 0, ODYSSEUS, ODYSSEUS);
      p.background(0);
      p.image(this.pg, 0, 0);
    },
  };

  // The songs in the rotation, each with the square sketch it plays (what the stage shows, and its screens sample,
  // 32 x 32): the 1.0's. The 2025 set's ports above (the worm, the cloud, the golden circles, the intense waves, the
  // scanlines) are out of the rotation for now
  const sampled = (layer) => () => ({ image: layer().elt, samples: SAMPLES });
  const songs = [
    { name: 'unfamiliar state', draw: () => unfamiliar.update(), sketch: sampled(() => unfamiliar.pg) },
    { name: 'just keep on living in the moment', draw: () => waves1.update(), sketch: sampled(() => waves1.pg) },
    { name: 'riper than ripe', draw: () => riper.update(), sketch: sampled(() => riper.pg) },
    { name: 'odysseus', draw: () => odysseus.update(), sketch: sampled(() => odysseus.pg) },
  ];

  const FIRST_SONG = 'unfamiliar state'; // The one it starts on

  // Processing's HSB, out of 255 each, clamped as Processing clamps it, to RGB
  function hsb(h, s, v) {
    h = (Math.min(255, Math.max(0, h)) / 255) * 6;
    s = Math.min(255, Math.max(0, s)) / 255;
    v = Math.min(255, Math.max(0, v));
    const i = Math.floor(h) % 6;
    const f = h - Math.floor(h);
    const a = v * (1 - s);
    const b = v * (1 - s * f);
    const c = v * (1 - s * (1 - f));
    return [[v, c, a], [b, v, a], [a, v, c], [a, b, v], [c, a, v], [v, a, b]][i];
  }

  function nextSong(step = 1) {
    scene = (scene + step + songs.length) % songs.length;
    label.textContent = `pattern: ${songs[scene].name}`;
  }

  p.setup = () => {
    p.pixelDensity(1);
    const canvas = p.createCanvas(WIDTH, HEIGHT);
    canvas.parent(holder);
    canvas.elt.tabIndex = 0;
    canvas.elt.setAttribute('aria-label', 'What the Luminin sketch draws on the screens; click for the next song.');
    pg = p.createGraphics(WIDTH, HEIGHT);
    pg.pixelDensity(1);
    p.noiseDetail(5, 0.4); // As the original's cloud sets it, for every scene
    worm.setup();
    cloud.setup();
    golden.setup();
    waves.setup();
    waves1.setup();
    unfamiliar.setup();
    riper.setup();
    odysseus.setup();
    scene = songs.findIndex((song) => song.name === FIRST_SONG);
    nextSong(0);

    performer = createPerformer(document.querySelector('.luminin-stage'), { onButton: () => nextSong(1) });
    canvas.elt.addEventListener('click', () => nextSong(1));

    p.noLoop();
    const watch = new IntersectionObserver((entries) => {
      const seen = entries.some((entry) => entry.isIntersecting);
      seen ? (lastFrame = performance.now(), p.loop()) : p.noLoop();
    });
    watch.observe(document.querySelector('.luminin-stage'));
  };

  p.draw = () => {
    const now = performance.now();
    const dt = (now - lastFrame) / 1000;
    lastFrame = now;
    songs[scene].draw();
    if (p.frameCount % 6 === 0) {
      averageContext.drawImage(p.canvas, 0, 0, 1, 1);
      const [r, g, b] = averageContext.getImageData(0, 0, 1, 1).data;
      const most = Math.max(r, g, b, 1);
      glow = `rgb(${(r / most) * 255} ${(g / most) * 255} ${(b / most) * 255})`; // As bright as it'll go
    }
    // The stage shows the song's sketch as it is on the laptop running it, and its screens sample it
    const sketch = songs[scene].sketch ? songs[scene].sketch() : null;
    performer.update(dt, controller, p.canvas, glow, sketch);
  };
}, holder);
