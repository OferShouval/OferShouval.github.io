// LineWake class
// The water churned up behind the boat, drawn as lines that spread out and drift.
//
// Each line is a chain of particles, like bits of foam. Every frame the boat drops
// a new particle at the start of each line. The particles are then:
//   thrown sideways, the outer lines harder, which opens the wake into a V
//   slowed down by drag, so the V curves as it spreads
//   turned a little every frame, outward and then back, so each line curls round as it
//   slows (the two sides of the V curl in mirror image)
//   stirred by a Perlin noise "flow field", so the lines wobble like moving water
// If emit() is given the boat, the lines start instead from points evenly spaced down both
// of its sides, from the bow to near the stern, just outside the hull, leaving the middle
// behind it clear. The ones further forward are thrown out harder, so they stay outside
// the ones behind them and the lines fan out evenly spaced. Any particle that would slip
// under the hull as the boat slides past is pushed back out to its edge, so the front
// lines run flush along the boat's sides until they clear it.
// The lines are drawn through their particles with splineVertex(), p5 2.x's version of
// curveVertex(), and wobble from side to side on the same moving wave as the reflections
// of the boat and the gates.
//
// The camera follows the boat, so every particle also scrolls back by however far the
// world moved this frame. pushAt() lets the water's lines get pushed aside by the wake.

import p5 from 'p5';
import rippleColor from './ripple_color.js';

class WakeParticle {
  constructor(position, velocity, spin) {
    this.position = position.copy();
    this.velocity = velocity.copy();
    this.spin = spin; // How far it turns each frame, in radians; the sign says which way
    this.acceleration = createVector(0, 0);
    this.age = 0; // In frames
  }

  applyForce(force) {
    this.acceleration.add(force);
  }

  update(drag) {
    this.velocity.add(this.acceleration);
    this.velocity.rotate(this.spin);
    this.velocity.mult(drag);
    this.position.add(this.velocity);
    this.acceleration.mult(0);
    this.age++;
  }
}

export default class LineWake {
  constructor() {
    this.lineCount = 16; // How many lines, spread evenly across the V
    this.lifespan = 140; // How many frames a particle lasts
    this.drag = 0.97; // How quickly the water calms down
    this.spread = 1.2; // How hard particles are thrown sideways, compared to the boat's speed
    this.emptyMiddle = 0.4; // Leave out the lines nearer the middle than this (0 = middle, 1 = edges), so it's an open V
    this.curl = 0.022; // How sharply the lines curl round, in radians per frame
    this.flowScale = 0.0025; // Size of the swirls in the water (smaller = bigger, smoother swirls)
    this.flowStrength = 0.02; // How hard the swirls push
    this.pieceLength = 8; // Particles per drawn piece: smaller = smoother fade, but slower
    this.alpha = 100; // How bright the lines are, like the boat's reflection (255 = solid)
    this.wobble = 5; // How far (in pixels) the lines wobble from side to side, the same all along them
    this.pushReach = 40; // How close (in pixels) the water's lines have to be to get pushed aside
    this.pushStrength = 7; // How far (in pixels) the wake pushes them
    this.maxLength = Infinity; // The longest the lines can get behind the boat, in pixels, however fast it's going
    this.stayOnScreen = false; // Should the lines fade out and end before they reach the edge of the screen?
    this.edgeMargin = 24; // ...this far (in pixels) from the edge
    this.edgeFade = 0.2; // ...fading out over this much of the height of the screen before that
    this.sampleEvery = 3; // pushAt() and the V's outline only use every this-many particles, which is much faster and still smooth
    this.hullLinesPerSide = 1; // With the boat: how many lines start down each side of it (1 = just the outline of the wake)
    this.hullFrom = -0.2; // ...from this far along the boat (0.5 = the bow, -0.5 = the stern)
    this.hullTo = -0.4; // ...to this far (-0.5 = the stern)
    this.hullSpread = [0.25, 1.5]; // How hard the backmost and frontmost lines are thrown outward, compared to the boat's speed
    this.hullMargin = 0.012; // How far outside the hull they run, in hull lengths

    // How far the boat has sailed in total, so the flow field moves with the water
    this.travelled = createVector(0, 0);

    // One array of particles per line, newest first
    this.lines = [];
    for (let i = 0; i < this.lineCount; i++) {
      this.lines.push([]);
    }
    this.hullLines = []; // With the boat: the lines down its sides, one array of particles each
    for (let i = 0; i < this.hullLinesPerSide * 2; i++) {
      this.hullLines.push([]);
    }
  }

  // Drop a new particle at the start of every line.
  // stern: where the back of the boat is; sideways: a unit vector across the boat;
  // boat: give it the boat to start the lines down its sides instead (see above)
  emit(stern, sideways, boatVelocity, sternWidth, boat = null) {
    let speed = boatVelocity.mag();
    if (speed < 0.5) return; // Not moving, no new wake
    // Which way round is "outward and back" on the screen depends on which way the boat
    // is facing, so check which side of the sideways vector its velocity is on
    let handedness = Math.sign(sideways.x * boatVelocity.y - sideways.y * boatVelocity.x) || 1;

    let pulled = p5.Vector.mult(boatVelocity, 0.2); // Water gets dragged along behind the boat a little

    if (boat) {
      for (let i = 0; i < this.hullLinesPerSide; i++) {
        // 0 for the frontmost line (the outline of the wake), 1 for the backmost
        let back = this.hullLinesPerSide > 1 ? i / (this.hullLinesPerSide - 1) : 0;
        let along = lerp(this.hullFrom, this.hullTo, back);
        let throwOut = lerp(this.hullSpread[1], this.hullSpread[0], back);
        for (let s = 0; s < 2; s++) {
          let side = s === 0 ? -1 : 1;
          // From the arrow's wide corners, if the boat's an arrow (its frontmost lines, at least)
          let start = boat.shape === 'arrow' && i === 0 ? boat.cornerPoint(side) : boat.edgePoint(along, side, this.hullMargin);
          let push = p5.Vector.mult(sideways, side * speed * throwOut);
          let particle = new WakeParticle(start, p5.Vector.add(push, pulled), -side * handedness * this.curl);
          particle.side = side; // Which side of the boat it's on, for keeping it out from under the hull
          this.hullLines[i * 2 + s].unshift(particle);
        }
      }
      return;
    }

    for (let i = 0; i < this.lineCount; i++) {
      let side = map(i, 0, this.lineCount - 1, -1, 1); // -1 is one edge of the V, 1 the other
      if (abs(side) < this.emptyMiddle) continue; // Only the arms of the V
      let start = p5.Vector.add(stern, p5.Vector.mult(sideways, side * sternWidth));
      let push = p5.Vector.mult(sideways, side * speed * this.spread);
      let spin = -Math.sign(side) * handedness * this.curl;
      this.lines[i].unshift(new WakeParticle(start, p5.Vector.add(push, pulled), spin));
    }

  }

  // scroll: how far the world slides back this frame (see Boat);
  // boat: the boat, for keeping the lines down its sides out from under the hull
  update(scroll, boat = null) {
    this.travelled.add(scroll);

    for (let line of this.lines.concat(this.hullLines)) {
      for (let particle of line) {
        // Flow field: the noise value at this spot (in the water, not on the screen)
        // picks a direction to drift in
        let x = particle.position.x + this.travelled.x;
        let y = particle.position.y + this.travelled.y;
        let n = noise(x * this.flowScale, y * this.flowScale, frameCount * 0.003);
        let flow = p5.Vector.fromAngle(n * TWO_PI * 2);
        flow.mult(this.flowStrength);
        particle.applyForce(flow);
        particle.update(this.drag);

        // The camera follows the boat, so the water (and everything on it) slides backward
        particle.position.sub(scroll);

        if (particle.side && boat) this.keepOutside(particle, boat);
        if (boat) particle.behind = dist(particle.position.x, particle.position.y, boat.position.x, boat.position.y + boat.length * 0.12);
      }
      // The oldest particles are at the end of the line
      while (line.length > 0 && line[line.length - 1].age > this.lifespan) {
        line.pop();
      }
      // ...and so are the ones that are too far behind the boat
      while (line.length > 0 && line[line.length - 1].behind > this.maxLength) {
        line.pop();
      }
      // ...or have reached the edge of the screen
      while (this.stayOnScreen && line.length > 0 && this.fromEdge(line[line.length - 1]) <= 0) {
        line.pop();
      }
    }

    this.findBounds();
    this.findV();
    // Every few particles, for pushAt() (which runs for every point of every water line)
    this.sampled = [];
    for (let line of this.lines.concat(this.hullLines)) {
      for (let i = 0; i < line.length; i += this.sampleEvery) {
        this.sampled.push(line[i]);
      }
    }
  }

  // If a particle has slipped under the hull, push it back out to the hull's edge on its
  // side, so the lines run along the boat rather than under it
  keepOutside(particle, boat) {
    let { along, across } = boat.onHull(particle.position.x, particle.position.y);
    if (abs(along) >= 0.5) return; // In front of or behind the boat
    if (across * particle.side >= boat.widthAt(along) + this.hullMargin) return; // Already outside
    particle.position.set(boat.edgePoint(along, particle.side, this.hullMargin));
  }

  // A box around the whole wake (plus how far it reaches), so pushAt() can quickly
  // skip anything nowhere near it
  findBounds() {
    let r = this.pushReach;
    this.bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    for (let line of this.lines.concat(this.hullLines)) {
      for (let particle of line) {
        this.bounds.left = min(this.bounds.left, particle.position.x - r);
        this.bounds.right = max(this.bounds.right, particle.position.x + r);
        this.bounds.top = min(this.bounds.top, particle.position.y - r);
        this.bounds.bottom = max(this.bounds.bottom, particle.position.y + r);
      }
    }
  }

  show(weight) {
    push();
    noFill();
    strokeWeight(weight);
    // The first and last vertex of each shape only steer the curve, like the old curve()
    splineProperty('ends', EXCLUDE);

    for (let line of this.lines.concat(this.hullLines)) {
      for (let run of this.unbrokenRuns(line)) {
        // Draw the run in short pieces, each one curve with its own colour, so the wake
        // fades along its length. (One shape per piece is much faster than one per gap.)
        for (let start = 1; start < run.length - 2; start += this.pieceLength) {
          // Take one extra particle on each side to steer the curve, so the pieces join smoothly
          let piece = run.slice(start - 1, start + this.pieceLength + 2);
          let age = piece[1].age / this.lifespan; // 0 = just made, 1 = about to disappear
          let edge = this.stayOnScreen ? constrain(this.fromEdge(piece[1]) / (height * this.edgeFade), 0, 1) : 1; // 0 = at the edge
          let length = this.maxLength < Infinity ? constrain(1 - piece[1].behind / this.maxLength, 0, 1) : 1; // 0 = as far behind as it goes
          stroke(rippleColor(age, this.alpha * (1 - age) * edge * length));
          beginShape();
          for (let particle of piece) {
            // The same wave as the reflections (see Portal.wobblyVertex())
            let y = particle.position.y;
            let wave = sin(y * 0.25 + frameCount * 0.12) + 0.5 * sin(y * 0.6 - frameCount * 0.08);
            splineVertex(particle.position.x + wave * this.wobble, y);
          }
          endShape();
        }
      }
    }
    pop();
  }

  // How far a particle is from where the lines have to end, near the edge of the screen
  fromEdge(particle) {
    let p = particle.position;
    return min(p.x, width - p.x, p.y, height - p.y) - this.edgeMargin;
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

  // How far the wake pushes the water up or down at (x, y), in pixels. Water near the wake
  // gets pushed away from it (up if the wake is below, down if it's above), most by the
  // newest parts of the wake, so the water's lines bend and break up around it.
  // This runs for every point of every water line, so it uses plain Math (much faster
  // than p5's dist() while developing) and skips anywhere outside the wake's bounds.
  pushAt(x, y) {
    let b = this.bounds;
    if (!b || x < b.left || x > b.right || y < b.top || y > b.bottom) return 0;

    let push = 0;
    for (let particle of this.sampled) {
      let dx = particle.position.x - x;
      let dy = particle.position.y - y;
      if (Math.abs(dx) > this.pushReach || Math.abs(dy) > this.pushReach) continue; // Quick check: too far
      let d = Math.sqrt(dx * dx + dy * dy);
      if (d < this.pushReach) {
        let closeness = 1 - d / this.pushReach;
        let freshness = 1 - particle.age / this.lifespan;
        push += (dy > 0 ? -1 : 1) * closeness * freshness;
      }
    }
    // It used to add up every other particle, so scale up to push just as hard
    push *= this.sampleEvery / 2;
    return constrain(push, -1, 1) * this.pushStrength;
  }

  // The outline of the V: down the outermost left arm, across its far end, and back up the
  // outermost right arm (the two arms' particles were dropped together, so they line up)
  // (or, for the lines down the boat's sides, the frontmost line on each side, which are
  // the outermost)
  findV() {
    let fromHull = this.hullLines[0].length > 0;
    let left = fromHull ? this.hullLines[0] : this.lines[0];
    let right = fromHull ? this.hullLines[1] : this.lines[this.lines.length - 1];
    // Every few particles is plenty for the outline (insideV() and crossV() go round all of it)
    let thin = (line) => line.filter((p, i) => i % this.sampleEvery === 0 || i === line.length - 1).map((p) => p.position);
    this.vShape = thin(left).concat(thin(right).reverse());
  }

  // How much the wake covers the water at (x, y): 1 inside the V between its outer arms,
  // 0 outside it, so whatever the wake covers stops right at the arms
  coverAt(x, y) {
    let b = this.bounds;
    if (!b || x < b.left || x > b.right || y < b.top || y > b.bottom) return 0; // Quick check
    return this.insideV(x, y) ? 1 : 0;
  }

  // Where the line from (ax, ay) to (bx, by) crosses the V's outline (the crossing nearest
  // to the first point), or null if it doesn't
  crossV(ax, ay, bx, by) {
    let shape = this.vShape;
    if (!shape || shape.length < 2) return null;
    let best = null;
    let bestT = Infinity;
    for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
      let p = shape[j];
      let q = shape[i];
      // Solve for where the two lines meet: t along a->b, u along p->q (both 0 to 1 if on both)
      let denom = (bx - ax) * (q.y - p.y) - (by - ay) * (q.x - p.x);
      if (denom === 0) continue; // Parallel
      let t = ((p.x - ax) * (q.y - p.y) - (p.y - ay) * (q.x - p.x)) / denom;
      let u = ((p.x - ax) * (by - ay) - (p.y - ay) * (bx - ax)) / denom;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t < bestT) {
        bestT = t;
        best = { x: ax + t * (bx - ax), y: ay + t * (by - ay) };
      }
    }
    return best;
  }

  // Is (x, y) inside the V's outline? Count how many of the outline's edges a line from the
  // point straight across to the right crosses: an odd number means it's inside.
  // (Plain Math, since it runs for lots of points.)
  insideV(x, y) {
    let shape = this.vShape;
    if (!shape || shape.length < 3) return false;
    let inside = false;
    for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
      let a = shape[i];
      let c = shape[j];
      if (a.y > y !== c.y > y) {
        let crossX = a.x + ((y - a.y) / (c.y - a.y)) * (c.x - a.x);
        if (x < crossX) inside = !inside;
      }
    }
    return inside;
  }

  // Slide the whole wake, e.g. when the window resizes and the boat moves to the new middle
  shift(offset) {
    for (let line of this.lines.concat(this.hullLines)) {
      for (let particle of line) {
        particle.position.add(offset);
      }
    }
  }
}
