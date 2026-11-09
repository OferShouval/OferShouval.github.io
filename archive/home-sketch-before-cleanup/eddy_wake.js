// EddyWake class
// The water churned up behind the boat, drawn as bundles of lines that curl around and
// wind up into eddies, a little like the water in a Japanese woodblock print.
//
// Each line is a chain of particles, like bits of foam. Every frame the boat drops
// a new particle at the start of each line, thrown sideways so the lines open into a V.
// As it goes, the boat also sheds eddies: little whirlpools, one off each side of the stern,
// that drift out along the arms of the V, start spinning once the wake has stretched out a
// little, then slow down, spread out and fade away.
// Every eddy spins the water around it, faster near its middle than further out, so a
// line caught by one gets wound up into a spiral. (Each eddy is a "Lamb-Oseen vortex":
// it spins like a solid wheel inside its core, and slower and slower outside it.)
// The eddies on the two sides spin opposite ways, both curling outward and back, like the
// water dragged along by the hull peeling off from the still water beside it.
//
// Winding a line up stretches it, so wherever two neighbouring particles get too far
// apart a new one is added between them, which keeps the spirals smooth.
//
// The camera follows the boat, so every particle and eddy also scrolls back by however far
// the world moved this frame.

import p5 from 'p5';
import rippleColor from './ripple_color.js';

class WakeParticle {
  constructor(position, velocity, age = 0) {
    this.position = position.copy();
    this.velocity = velocity.copy();
    this.age = age; // In frames
  }
}

class Eddy {
  constructor(position, velocity, spin) {
    this.position = position.copy();
    this.velocity = velocity.copy();
    this.spin = spin; // How hard it spins; the sign says which way
    this.age = 0;
  }
}

export default class EddyWake {
  constructor() {
    this.lineCount = 16; // How many lines, spread evenly across the V
    this.emptyMiddle = 0.2; // Leave out the lines nearer the middle than this (0 = middle, 1 = edges)
    this.lifespan = 170; // How many frames a particle lasts
    this.drag = 0.96; // How quickly the water calms down
    this.spread = 1.0; // How hard particles are thrown sideways, compared to the boat's speed
    this.flowScale = 0.004; // Size of the gentle swirls everywhere (smaller = bigger swirls)
    this.flowStrength = 0.25; // How far (in pixels per frame) they move the water
    this.pieceLength = 8; // Particles per drawn piece: smaller = smoother fade, but slower
    this.maxGap = 9; // Add a particle between any two neighbours further apart than this
    this.maxParticles = 250; // ...but never let a line get longer than this

    this.eddyEvery = 18; // Roughly how many frames between eddies, on each side
    this.eddyLife = 170; // How many frames an eddy lasts
    this.eddyDelay = 45; // How many frames it drifts along before it starts to spin, so the wake stretches out first
    this.eddySpin = 70; // How hard a new eddy spins, at full speed
    this.eddyCore = 18; // The radius (in pixels) of a new eddy's core, which grows as it spreads out
    this.eddyGrowth = 0.12; // How many pixels its core grows each frame
    this.eddyDrag = 0.95; // How quickly eddies stop drifting

    this.travelled = createVector(0, 0); // How far the boat has sailed, so the flow field moves with the water
    this.eddies = [];
    this.nextEddy = [0, 0]; // Frames until each side sheds its next eddy

    // One array of particles per line, newest first
    this.lines = [];
    for (let i = 0; i < this.lineCount; i++) {
      this.lines.push([]);
    }
  }

  // Drop a new particle at the start of every line, and now and then shed an eddy.
  // stern: where the back of the boat is; sideways: a unit vector across the boat
  emit(stern, sideways, boatVelocity, sternWidth, maxSpeed) {
    let speed = boatVelocity.mag();
    if (speed < 0.5) return; // Not moving, no new wake
    let pulled = p5.Vector.mult(boatVelocity, 0.2); // Water gets dragged along behind the boat a little

    for (let i = 0; i < this.lineCount; i++) {
      let side = map(i, 0, this.lineCount - 1, -1, 1); // -1 is one edge of the V, 1 the other
      if (abs(side) < this.emptyMiddle) continue; // Only the arms of the V
      let start = p5.Vector.add(stern, p5.Vector.mult(sideways, side * sternWidth));
      let push = p5.Vector.mult(sideways, side * speed * this.spread);
      this.lines[i].unshift(new WakeParticle(start, p5.Vector.add(push, pulled)));
    }

    // Which way round is "outward and back" on the screen depends on which way the boat
    // is facing, so check which side of the sideways vector its velocity is on
    let handedness = Math.sign(sideways.x * boatVelocity.y - sideways.y * boatVelocity.x) || 1;
    for (let s = 0; s < 2; s++) {
      if (--this.nextEddy[s] > 0) continue;
      this.nextEddy[s] = this.eddyEvery * random(0.6, 1.5); // Not quite regular, so it looks less mechanical
      let side = s === 0 ? -1 : 1;
      let start = p5.Vector.add(stern, p5.Vector.mult(sideways, side * sternWidth * random(0.6, 1.4)));
      let push = p5.Vector.mult(sideways, side * speed * this.spread * random(0.5, 1));
      let spin = -side * handedness * this.eddySpin * (speed / maxSpeed) * random(0.6, 1.3);
      this.eddies.push(new Eddy(start, p5.Vector.add(push, pulled), spin));
    }
  }

  // How hard an eddy spins right now: nothing at first, while the wake stretches out, then
  // it winds up over a few frames (so the lines don't jump), then dies away
  strength(eddy) {
    let spinning = eddy.age - this.eddyDelay;
    if (spinning <= 0) return 0;
    let life = spinning / (this.eddyLife - this.eddyDelay);
    return eddy.spin * min(1, spinning / 30) * (1 - life) * (1 - life);
  }

  // How the eddies move the water at (x, y) this frame, in pixels: around each one,
  // fastest at the edge of its core. Skips `skip` (an eddy isn't moved by itself).
  // Plain Math, since it runs for every particle and every eddy.
  swirlAt(x, y, skip) {
    let vx = 0;
    let vy = 0;
    for (let eddy of this.eddies) {
      if (eddy === skip) continue;
      let dx = x - eddy.position.x;
      let dy = y - eddy.position.y;
      let r2 = dx * dx + dy * dy;
      if (r2 < 0.01) continue;
      let core = this.eddyCore + max(0, eddy.age - this.eddyDelay) * this.eddyGrowth;
      if (r2 > core * core * 40) continue; // Too far away to feel it
      let speedOverR = (eddy.strength * (1 - Math.exp(-r2 / (core * core)))) / r2;
      vx -= dy * speedOverR; // At right angles to the way out from the middle, so round and round
      vy += dx * speedOverR;
    }
    return [vx, vy];
  }

  // scroll: how far the world slides back this frame (see Boat)
  update(scroll) {
    this.travelled.add(scroll);
    for (let eddy of this.eddies) {
      eddy.strength = this.strength(eddy);
    }

    // The eddies drift, and nudge each other around a little
    for (let eddy of this.eddies) {
      let [sx, sy] = this.swirlAt(eddy.position.x, eddy.position.y, eddy);
      eddy.velocity.mult(this.eddyDrag);
      eddy.position.add(eddy.velocity);
      eddy.position.add(sx * 0.5, sy * 0.5);
      eddy.position.sub(scroll);
      eddy.age++;
    }
    this.eddies = this.eddies.filter((eddy) => eddy.age < this.eddyLife);

    for (let line of this.lines) {
      for (let particle of line) {
        let p = particle.position;
        // Carried around by the eddies...
        let [sx, sy] = this.swirlAt(p.x, p.y);
        // ...and by a gentle Perlin noise flow, which picks a direction at this spot in the water
        let n = noise((p.x + this.travelled.x) * this.flowScale, (p.y + this.travelled.y) * this.flowScale, frameCount * 0.004);
        let flow = n * TWO_PI * 2;
        particle.velocity.mult(this.drag);
        p.add(particle.velocity);
        p.add(sx + cos(flow) * this.flowStrength, sy + sin(flow) * this.flowStrength);
        // The camera follows the boat, so the water (and everything on it) slides backward
        p.sub(scroll);
        particle.age++;
      }
      // The oldest particles are at the end of the line
      while (line.length > 0 && line[line.length - 1].age > this.lifespan) {
        line.pop();
      }
      this.fillGaps(line);
    }
  }

  // Add a particle halfway between any two neighbours that have been stretched apart
  fillGaps(line) {
    for (let i = line.length - 1; i > 0 && line.length < this.maxParticles; i--) {
      let a = line[i - 1];
      let b = line[i];
      if (this.isBroken(a, b)) continue;
      if (p5.Vector.dist(a.position, b.position) > this.maxGap) {
        let middle = p5.Vector.lerp(a.position, b.position, 0.5);
        let velocity = p5.Vector.lerp(a.velocity, b.velocity, 0.5);
        line.splice(i, 0, new WakeParticle(middle, velocity, (a.age + b.age) / 2));
      }
    }
  }

  show(weight) {
    push();
    noFill();
    // The first and last vertex of each shape only steer the curve, like the old curve()
    splineProperty('ends', EXCLUDE);

    for (let line of this.lines) {
      for (let run of this.unbrokenRuns(line)) {
        // Draw the run in short pieces, each one curve with its own colour, so the wake
        // fades along its length. (One shape per piece is much faster than one per gap.)
        for (let start = 1; start < run.length - 2; start += this.pieceLength) {
          // Take one extra particle on each side to steer the curve, so the pieces join smoothly
          let piece = run.slice(start - 1, start + this.pieceLength + 2);
          let age = piece[1].age / this.lifespan; // 0 = just made, 1 = about to disappear
          stroke(rippleColor(age, 220 * (1 - age)));
          strokeWeight(weight * (1 - age * 0.6)); // Thinner as it fades, like the tail of a brushstroke
          beginShape();
          for (let particle of piece) {
            splineVertex(particle.position.x, particle.position.y);
          }
          endShape();
        }
      }
    }
    pop();
  }

  // Split a line wherever neighbouring particles shouldn't be joined
  unbrokenRuns(line) {
    let runs = [];
    let run = [];
    for (let i = 0; i < line.length; i++) {
      if (i > 0 && this.isBroken(line[i - 1], line[i])) {
        runs.push(run);
        run = [];
      }
      run.push(line[i]);
    }
    runs.push(run);
    return runs;
  }

  // Two neighbouring particles shouldn't be joined if the boat stopped between them
  // (a gap in their ages) or they've somehow ended up far apart
  isBroken(p1, p2) {
    return abs(p1.age - p2.age) > 2 || p5.Vector.dist(p1.position, p2.position) > 100;
  }

  // Slide the whole wake, e.g. when the window resizes and the boat moves to the new middle
  shift(offset) {
    for (let line of this.lines) {
      for (let particle of line) {
        particle.position.add(offset);
      }
    }
    for (let eddy of this.eddies) {
      eddy.position.add(offset);
    }
  }
}
