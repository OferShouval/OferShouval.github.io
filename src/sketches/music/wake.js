// Wake class
// The two lines trailing from the boat's wide corners, tracing out the V of its wake.
//
// Each line is a chain of particles, like bits of foam. Every frame the boat drops a new
// particle at the start of each line. The particles are then:
//   thrown sideways, which opens the wake into a V
//   slowed down by drag, so the V curves as it spreads
//   turned a little every frame, outward and then back, so each line curls round as it
//   slows (the two sides curl in mirror image)
//   stirred by a Perlin noise "flow field", so the lines wobble like moving water
// A line ends where it gets too far behind the boat, or a little way past the edge of the
// screen, fading out on the way, so the wake runs off the screen.
//
// The camera follows the boat, so every particle also scrolls back by however far the world
// moved this frame. The water's lines ask the wake how to look: pushAt() pushes them aside,
// and they change inside the V (see isInside()).

import p5 from 'p5';
import { grey } from './color.js';

export default class Wake {
  constructor() {
    this.lifespan = 300; // How many frames a particle lasts
    this.drag = 0.97; // How quickly the water calms down
    this.spread = 2.5; // How hard particles are thrown sideways, compared to the boat's speed
    this.curl = 0.022; // How sharply the lines curl round, in radians per frame
    this.flowScale = 0.0025; // Size of the swirls in the water (smaller = bigger, smoother swirls)
    this.flowStrength = 0.02; // How hard the swirls push
    this.pieceLength = 8; // Particles per drawn piece: smaller = smoother fade, but slower
    this.alpha = 100; // How bright the lines are (255 = solid)
    this.wobble = 5; // How far (in pixels) the lines wobble from side to side
    this.pushReach = 40; // How close (in pixels) the water's lines have to be to get pushed aside
    this.pushStrength = 7; // How far (in pixels) the wake pushes them
    this.maxLength = Infinity; // The longest the lines can get behind the boat, in pixels, however fast it's going
    this.edgeMargin = -100; // How far (in pixels) from the edge of the screen the lines end (under 0 = past the edge, offscreen)
    this.edgeFade = 0.05; // ...fading out over this much of the height of the screen before that
    this.sampleEvery = 3; // pushAt() and the V's outline only use every this-many particles, which is much faster and still smooth
    this.hullMargin = 0.012; // How far outside the boat's sides they run, in boat lengths
    this.hullPush = 0.25; // How much of the way out from under the boat they're pushed each frame, so they never jump

    this.dropped = 0; // How many times particles have been dropped, to number them
    this.travelled = createVector(0, 0); // How far the boat has sailed, so the flow field moves with the water
    this.lines = [[], []]; // One array of particles per side, newest first
    this.sampled = []; // Every few particles, for pushAt()
    this.vShape = []; // The V's outline, for isInside()
    this.bounds = null; // A box around the wake (plus how far it reaches), to skip anywhere nowhere near it
  }

  // Drop a new particle at the start of each line, from the boat's corners.
  // velocity: how fast the boat's going (at no more than its usual speed)
  emit(boat, velocity) {
    let speed = velocity.mag();
    if (speed < 0.5) return; // Not moving, no new wake
    let sideways = boat.sideways();
    // Which way round is "outward and back" on the screen depends on which way the boat
    // is facing, so check which side of the sideways vector its velocity is on
    let handedness = Math.sign(sideways.x * velocity.y - sideways.y * velocity.x) || 1;
    this.dropped++;

    for (let s = 0; s < 2; s++) {
      let side = s === 0 ? -1 : 1;
      let corner = boat.corners[s];
      let spin = -side * handedness * this.curl;
      this.lines[s].unshift({
        position: boat.onScreen(corner.x, corner.y),
        velocity: createVector(sideways.x * side * speed * this.spread + velocity.x * 0.2, sideways.y * side * speed * this.spread + velocity.y * 0.2),
        cosSpin: Math.cos(spin),
        sinSpin: Math.sin(spin),
        side,
        number: this.dropped, // Stays the same for life, so the same particles are always the ones sampled
        age: 0,
        behind: 0, // How far behind the boat it is
      });
    }
  }

  // scroll: how far the world slides back this frame (see Boat)
  update(scroll, boat) {
    this.travelled.add(scroll);
    let boatX = boat.position.x;
    let boatY = boat.waterY();
    let fc = frameCount;

    for (let line of this.lines) {
      for (let particle of line) {
        let p = particle.position;
        let v = particle.velocity;
        // Flow field: the noise value at this spot (in the water, not on the screen) picks a
        // direction to drift in
        let n = noise((p.x + this.travelled.x) * this.flowScale, (p.y + this.travelled.y) * this.flowScale, fc * 0.003);
        let vx = v.x + Math.cos(n * TWO_PI * 2) * this.flowStrength;
        let vy = v.y + Math.sin(n * TWO_PI * 2) * this.flowStrength;
        // Turn, and slow down
        v.x = (vx * particle.cosSpin - vy * particle.sinSpin) * this.drag;
        v.y = (vx * particle.sinSpin + vy * particle.cosSpin) * this.drag;
        // On with it, as the world slides backward with the camera
        p.x += v.x - scroll.x;
        p.y += v.y - scroll.y;
        particle.age++;

        this.keepOutside(particle, boat);
        particle.behind = Math.hypot(p.x - boatX, p.y - boatY);
      }
      // The oldest particles are at the end of the line, and so are the ones too far behind
      // the boat, or at the edge of the screen
      while (line.length > 0) {
        let last = line[line.length - 1];
        if (last.age <= this.lifespan && last.behind <= this.maxLength && this.fromEdge(last) > 0) break;
        line.pop();
      }
    }

    this.findShapes();
  }

  // If a particle has slipped under the boat, or into the clear water behind it, ease it back out
  // to the nearest edge. (On a turn the boat can sweep over its own wake from either side, so that's
  // not always the particle's own side.)
  keepOutside(particle, boat) {
    let p = particle.position;
    let { along, across } = boat.onHull(p.x, p.y);
    if (along >= 0.5 || along < boat.clearBehind) return; // In front of or behind the boat
    let edge = boat.clearAt(along, across) + this.hullMargin;
    if (Math.abs(across) >= edge) return; // Already outside
    let out = boat.onScreen(along, (Math.sign(across) || particle.side) * edge);
    p.x += (out.x - p.x) * this.hullPush;
    p.y += (out.y - p.y) * this.hullPush;
  }

  // How far a particle is from where the lines have to end, near the edge of the screen
  fromEdge(particle) {
    let p = particle.position;
    return Math.min(p.x, width - p.x, p.y, height - p.y) - this.edgeMargin;
  }

  // Work out once a frame what the water's lines will ask about many times: a box around the
  // wake, every few particles for pushAt(), and the V's outline for isInside(). That's down
  // the left line, across its far end, and back up the right line.
  findShapes() {
    let r = this.pushReach;
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    this.sampled.length = 0;
    this.vShape.length = 0;
    for (let s = 0; s < 2; s++) {
      let line = this.lines[s];
      for (let i = 0; i < line.length; i++) {
        let p = line[i].position;
        if (p.x < left) left = p.x;
        if (p.x > right) right = p.x;
        if (p.y < top) top = p.y;
        if (p.y > bottom) bottom = p.y;
      }
      for (let particle of line) {
        if (particle.number % this.sampleEvery === 0) this.sampled.push(particle);
      }
      // (In order along the left line; back along the right one)
      let outline = [];
      for (let i = 0; i < line.length; i++) {
        if (line[i].number % this.sampleEvery === 0 || i === 0 || i === line.length - 1) outline.push(line[i].position);
      }
      if (s === 1) outline.reverse();
      for (let p of outline) this.vShape.push(p);
    }
    this.bounds = { left: left - r, right: right + r, top: top - r, bottom: bottom + r };
  }

  show(weight) {
    push();
    noFill();
    strokeWeight(weight);
    // The first and last vertex of each shape only steer the curve, like the old curve()
    splineProperty('ends', EXCLUDE);
    let fc = frameCount;

    for (let line of this.lines) {
      for (let run of this.unbrokenRuns(line)) {
        // Draw the run in short pieces, each one curve with its own colour, so the wake
        // fades along its length
        for (let start = 1; start < run.length - 2; start += this.pieceLength) {
          let end = Math.min(run.length, start + this.pieceLength + 2); // One extra particle on each side steers the curve, so the pieces join smoothly
          let first = run[start];
          let age = first.age / this.lifespan; // 0 = just made, 1 = about to disappear
          let edge = constrain(this.fromEdge(first) / (height * this.edgeFade), 0, 1); // 0 = at the edge of the screen
          let length = this.maxLength < Infinity ? constrain(1 - first.behind / this.maxLength, 0, 1) : 1; // 0 = as far behind as it goes
          stroke(grey(age, this.alpha * (1 - age) * edge * length));
          beginShape();
          for (let i = start - 1; i < end; i++) {
            let p = run[i].position;
            // The same wave as the gates' reflections
            let wave = Math.sin(p.y * 0.25 + fc * 0.12) + 0.5 * Math.sin(p.y * 0.6 - fc * 0.08);
            splineVertex(p.x + wave * this.wobble, p.y);
          }
          endShape();
        }
      }
    }
    pop();
  }

  // Split a line wherever neighbouring particles shouldn't be joined: if the boat stopped
  // between them (a gap in their ages), or they've somehow ended up far apart
  unbrokenRuns(line) {
    let runs = [];
    let run = [];
    for (let i = 0; i < line.length; i++) {
      if (i > 0) {
        let a = line[i - 1];
        let b = line[i];
        if (Math.abs(a.age - b.age) > 2 || Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) > 100) {
          runs.push(run);
          run = [];
        }
      }
      run.push(line[i]);
    }
    runs.push(run);
    return runs;
  }

  // Is (x, y) inside the box around the wake?
  isNear(x, y) {
    let b = this.bounds;
    return b !== null && x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
  }

  // How far the wake pushes the water up or down at (x, y), in pixels. Water near the wake
  // gets pushed away from it (up if the wake is below, down if it's above), most by the
  // newest parts of the wake, so the water's lines bend and break up around it.
  pushAt(x, y) {
    if (!this.isNear(x, y)) return 0;
    let reach = this.pushReach;
    let push = 0;
    for (let particle of this.sampled) {
      let dx = particle.position.x - x;
      let dy = particle.position.y - y;
      if (dx > reach || dx < -reach || dy > reach || dy < -reach) continue; // Quick check: too far
      let d = Math.sqrt(dx * dx + dy * dy);
      if (d < reach) {
        push += (dy > 0 ? -1 : 1) * (1 - d / reach) * (1 - particle.age / this.lifespan);
      }
    }
    push *= this.sampleEvery / 2;
    return Math.max(-1, Math.min(1, push)) * this.pushStrength;
  }

  // Is (x, y) inside the V's outline? Count how many of the outline's edges a line from the
  // point straight across to the right crosses: an odd number means it's inside.
  isInside(x, y) {
    if (!this.isNear(x, y)) return false;
    let shape = this.vShape;
    if (shape.length < 3) return false;
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

  // The positions along the wake between two points on it, every `spacing` particles, in order
  // from the first point to the second. Empty if they're not both near the same line.
  pathBetween(from, to, reach, spacing) {
    let best = null;
    for (let line of this.lines) {
      let i = this.nearestParticle(line, from);
      let j = this.nearestParticle(line, to);
      if (i < 0 || j < 0) continue;
      let off = this.distanceTo(line[i], from) + this.distanceTo(line[j], to);
      if (off < reach * 2 && (!best || off < best.off)) best = { line, i, j, off };
    }
    if (!best) return [];
    let path = [];
    let way = best.j > best.i ? 1 : -1;
    for (let k = best.i + way * spacing; (best.j - k) * way > spacing / 2; k += way * spacing) path.push(best.line[k].position);
    return path;
  }

  nearestParticle(line, point) {
    let nearest = -1;
    let nearestDistance = Infinity;
    for (let i = 0; i < line.length; i++) {
      let d = this.distanceTo(line[i], point);
      if (d < nearestDistance) {
        nearestDistance = d;
        nearest = i;
      }
    }
    return nearest;
  }

  distanceTo(particle, point) {
    return Math.hypot(particle.position.x - point.x, particle.position.y - point.y);
  }

  // Slide the whole wake, e.g. when the window resizes and the boat moves to the new middle
  shift(offset) {
    for (let line of this.lines) {
      for (let particle of line) {
        particle.position.add(offset);
      }
    }
  }
}
