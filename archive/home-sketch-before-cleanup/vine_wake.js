// VineWake class
// The water churned up behind the boat, drawn like art nouveau ironwork or the cloud
// scrolls of East Asian painting: chains of spirals trailing from the back of the boat,
// every one growing out of another.
//
// There's a chain from each of a few points across the stern. Every so often each chain
// sprouts a new spiral at its point on the stern. The spiral grows from a bit of foam on
// the water, which is thrown outward (more for the outer chains), slowed by drag and
// drifting a little on a Perlin noise flow, so the chains open into a fan behind the boat
// as the foam drifts away.
//
// Nothing ever comes loose: each spiral's tail springs from partway along the outside of
// the next newer spiral in its chain (or, for the newest, from the boat itself), and
// bends round to the foam it grows from. As the water carries them apart the tails
// stretch, but stay joined. Each new spiral waits a moment before it opens, so it drifts
// back from the boat as just a tail first. Most of them curl toward the outside of the
// wake, so the curls line its edges and trace out its shape.
//
// A spiral isn't simulated, it's drawn: walking along it, it turns more and more sharply
// the further it goes (its curvature grows with distance along it, like a clothoid), so it
// starts out nearly straight, with a slight bend the other way (the art nouveau
// "whiplash"), and ends in a tight curl, with a little hook at the very tip where it
// flicks back the other way. Because it turns according to how far along its full length
// a point is, it winds itself up as it grows.
// Some spirals also have a smaller one branching off them that curls the other way.
//
// Every line is drawn as a bundle of a few strands side by side, which curl up together
// into nested spirals. Late in its life a spiral unravels: it loosens, its strands break
// up into dashes that drift apart and drop out one by one, and it throws off little
// flecks, like sparks, before it's gone. Under each curl hangs a faint, wobbly reflection
// in the water, like the boat's and the gates'.
//
// The camera follows the boat, so all the foam also scrolls back by however far the world
// moved this frame, and the spirals move with it.

import p5 from 'p5';
import rippleColor from './ripple_color.js';
import { depth } from './perspective.js';

class WakeParticle {
  constructor(position, velocity) {
    this.position = position.copy();
    this.velocity = velocity.copy();
    this.age = 0; // In frames
  }
}

class Tendril {
  constructor(anchor, heading, curl, length, turns) {
    this.anchor = anchor; // The bit of foam it grows from
    this.heading = heading; // Which way it sets off from there
    this.curl = curl; // Which way it winds: 1 or -1
    this.length = length; // How long it gets, in pixels (at the bottom of the screen)
    this.turns = turns; // How far round it winds, in radians
    this.attachAt = random(0.3, 0.6); // How far along it the next older spiral's tail springs from
    this.branch = random() < 0.4 ? random(0.3, 0.45) : null; // How far along a smaller spiral sprouts, if it has one
    this.seed = random(1000); // So each spiral breaks up in its own pattern
    this.points = []; // Where it was drawn this frame, so the older spiral can find it
  }
}

export default class VineWake {
  constructor() {
    this.chainCount = 4; // How many chains, from points spread evenly across the stern
    this.lifespan = 220; // How many frames a spiral lasts
    this.drag = 0.95; // How quickly the water calms down
    this.spread = 1.2; // How hard the outer chains' foam is thrown sideways, compared to the boat's speed
    this.flowScale = 0.004; // Size of the gentle swirls in the water (smaller = bigger swirls)
    this.flowStrength = 0.15; // How far (in pixels per frame) they move the water
    this.pieceLength = 8; // Points per drawn piece (and per dash when it breaks up): smaller = smoother fade, but slower

    this.tendrilEvery = 18; // Roughly how many frames between new spirals, on each chain
    this.openDelay = 40; // How many frames a new spiral drifts back from the boat before it starts to open
    this.growTime = 55; // How many frames a spiral takes to grow to full length
    this.outwardShare = 0.85; // How many of the spirals curl toward the outside of the wake (0 to 1); the rest curl inward
    this.tendrilLength = [70, 150]; // Shortest and longest a spiral gets, in pixels
    this.tendrilTurns = [2, 3]; // Fewest and most times round it winds (1 = one full circle)
    this.whiplash = 0.25; // How much it first bends the other way before curling (0 = not at all)
    this.hookLength = 0.07; // How much of the very tip flicks back the other way (0 = no hook)
    this.hook = 0.6; // How sharply the hook flicks back, compared to how tightly the curl turns
    this.branchAngle = 0.7; // How sharply a spiral (or a tail) turns off the one it grows from, in radians
    this.flatten = 0.6; // How squashed spirals are top to bottom, as if lying on the water (1 = not at all)
    this.steps = 48; // Points along a full-length spiral: more = smoother curls
    this.tailStep = 6; // Roughly how many pixels between the points along a tail

    this.strands = 3; // How many strands each line is drawn with, side by side
    this.strandGap = 3.5; // How far apart the strands are, in pixels (they draw together toward the tip)

    this.unravelAt = 0.6; // How far through its life a spiral starts to unravel (0 to 1)
    this.loosen = 0.45; // How much it unwinds as it unravels (0 = not at all, 1 = straight out)
    this.breakup = 0.9; // How much of it has dropped out by the end (0 to 1)
    this.scatter = 0.25; // How far its dashes drift apart as it unravels
    this.fleckRate = 0.6; // How likely an unravelling spiral is to throw off a fleck each frame
    this.fleckLife = [25, 50]; // Shortest and longest a fleck lasts, in frames

    this.reflectionDepth = 0.5; // How far a curl's reflection hangs down, compared to the curl's height
    this.reflectionAlpha = 60; // How faint reflections are (the lines themselves are 220)

    this.travelled = createVector(0, 0); // How far the boat has sailed, so the flow field moves with the water
    this.back = createVector(0, 1); // Straight back from the boat, for the newest spirals' tails
    this.chains = []; // One array of spirals per chain, newest first
    this.roots = []; // Where each chain starts on the stern
    this.nextTendril = []; // Frames until each chain sprouts its next spiral
    this.sprouted = []; // How many spirals each chain has sprouted, so a middle chain can lean each way in turn
    for (let i = 0; i < this.chainCount; i++) {
      this.chains.push([]);
      this.roots.push(null);
      this.nextTendril.push(0);
      this.sprouted.push(0);
    }
    this.flecks = [];
  }

  // Keep each chain joined to the boat, and now and then sprout a new spiral on each one.
  // stern: where the back of the boat is; sideways: a unit vector across the boat
  emit(stern, sideways, boatVelocity, sternWidth) {
    let speed = boatVelocity.mag();
    if (speed > 0.01) this.back = p5.Vector.mult(boatVelocity, -1 / speed);
    let pulled = p5.Vector.mult(boatVelocity, 0.2); // Water gets dragged along behind the boat a little

    // Which way round is "outward" on the screen depends on which way the boat is facing,
    // so check which side of the sideways vector its velocity is on
    let handedness = Math.sign(sideways.x * boatVelocity.y - sideways.y * boatVelocity.x) || 1;

    for (let c = 0; c < this.chainCount; c++) {
      let side = map(c, 0, this.chainCount - 1, -1, 1); // -1 is one edge of the stern, 1 the other
      let start = p5.Vector.add(stern, p5.Vector.mult(sideways, side * sternWidth));
      this.roots[c] = start;

      if (speed < 0.5) continue; // Barely moving: no new spirals
      if (--this.nextTendril[c] > 0) continue;
      this.nextTendril[c] = this.tendrilEvery * random(0.7, 1.3); // Not quite regular, so it looks less mechanical

      let count = this.sprouted[c]++;
      let outwardSide = side !== 0 ? Math.sign(side) : count % 2 === 0 ? 1 : -1; // A middle chain leans each way in turn
      // Set off backward, turned outward a little
      let heading = p5.Vector.add(
        p5.Vector.mult(this.back, cos(this.branchAngle)),
        p5.Vector.mult(sideways, outwardSide * sin(this.branchAngle)),
      ).heading();
      let push = p5.Vector.mult(sideways, side * speed * this.spread);
      let anchor = new WakeParticle(start, p5.Vector.add(push, pulled));
      // Curling the same way it turned off (from straight back toward the outside) keeps the
      // curl on the outside of the wake
      let curl = outwardSide * handedness * (random() < this.outwardShare ? 1 : -1);
      let length = random(this.tendrilLength[0], this.tendrilLength[1]);
      let turns = random(this.tendrilTurns[0], this.tendrilTurns[1]) * TWO_PI;
      this.chains[c].unshift(new Tendril(anchor, heading, curl, length, turns));
    }
  }

  // scroll: how far the world slides back this frame (see Boat)
  update(scroll) {
    this.travelled.add(scroll);

    for (let chain of this.chains) {
      for (let tendril of chain) {
        let particle = tendril.anchor;
        let p = particle.position;
        // A gentle Perlin noise flow, which picks a direction at this spot in the water
        let n = noise((p.x + this.travelled.x) * this.flowScale, (p.y + this.travelled.y) * this.flowScale, frameCount * 0.004);
        let flow = n * TWO_PI * 2;
        particle.velocity.mult(this.drag);
        p.add(particle.velocity);
        p.add(cos(flow) * this.flowStrength, sin(flow) * this.flowStrength);
        // The camera follows the boat, so the water (and everything on it) slides backward
        p.sub(scroll);
        particle.age++;
      }
      // The oldest spirals are at the end of the chain
      while (chain.length > 0 && chain[chain.length - 1].anchor.age > this.lifespan) {
        chain.pop();
      }
    }

    for (let fleck of this.flecks) {
      fleck.velocity.mult(0.94);
      fleck.position.add(fleck.velocity);
      fleck.position.sub(scroll);
      fleck.age++;
    }
    this.flecks = this.flecks.filter((fleck) => fleck.age < fleck.life);
  }

  show(weight) {
    push();
    noFill();
    // The first and last vertex of each shape only steer the curve, like the old curve()
    splineProperty('ends', EXCLUDE);

    // Newest first, so each spiral is worked out before the older one hanging off it
    for (let c = 0; c < this.chainCount; c++) {
      let chain = this.chains[c];
      for (let k = 0; k < chain.length; k++) {
        let from;
        let direction;
        if (k === 0) {
          // The newest spiral's tail comes straight back off the boat
          from = this.roots[c];
          direction = this.back;
        } else {
          // Older ones spring off the outside of the next newer spiral, turned away from its curl
          let newer = chain[k - 1];
          let points = newer.points;
          let at = min(floor(newer.attachAt * this.steps), points.length - 2);
          from = points[at];
          direction = p5.Vector.sub(points[at + 1], from).normalize().rotate(-newer.curl * this.branchAngle);
        }
        this.showTendril(chain[k], from, direction, weight);
      }
    }

    // Flecks: little dashes flying off the unravelling spirals
    for (let fleck of this.flecks) {
      let age = fleck.age / fleck.life;
      stroke(rippleColor(age, 220 * (1 - age)));
      strokeWeight(weight * 0.8);
      let dash = fleck.velocity.copy().setMag(fleck.size);
      line(fleck.position.x, fleck.position.y, fleck.position.x + dash.x, fleck.position.y + dash.y);
    }
    pop();
  }

  // A spiral, with its tail running from `from` (setting off in `direction`) round to the
  // foam it grows from
  showTendril(tendril, from, direction, weight) {
    let anchor = tendril.anchor;
    let life = anchor.age / this.lifespan;
    let unravel = constrain(map(life, this.unravelAt, 1, 0, 1), 0, 1); // 0 until it starts unravelling, 1 when it's gone

    // Once it's drifted back a little, it grows quickly at first, then slows as it reaches
    // full length (ease out). As it unravels, it unwinds a little.
    let growing = max(0, anchor.age - this.openDelay);
    let grown = 1 - pow(1 - min(1, growing / this.growTime), 3);
    let scale = depth(anchor.position.y) / 0.6; // Smaller further up the screen, like everything else
    let turns = tendril.turns * (1 - this.loosen * unravel);
    let spiral = this.tendrilPoints(anchor.position, tendril.heading, tendril.length * scale, turns, tendril.curl, grown);
    tendril.points = spiral;

    let tail = this.tail(from, direction, anchor.position, p5.Vector.fromAngle(tendril.heading));
    this.drawBundle(tail.concat(spiral), tail.length, tendril, unravel, weight, scale);

    // A smaller spiral branching off partway along, curling the other way
    let small = null;
    if (tendril.branch !== null) {
      let at = floor(tendril.branch * this.steps);
      if (at < spiral.length - 1) {
        let start = spiral[at];
        let along = p5.Vector.sub(spiral[at + 1], start).heading();
        let branchHeading = along - tendril.curl * this.branchAngle;
        let branchGrown = constrain((grown * this.steps - at) / (this.steps * 0.6), 0, 1);
        small = this.tendrilPoints(start, branchHeading, tendril.length * scale * 0.4, turns * 0.8, -tendril.curl, branchGrown);
        this.drawBundle(small, 0, tendril, unravel, weight * 0.7, scale * 0.6);
      }
    }

    // While it unravels, it throws off flecks from its curl
    if (unravel > 0 && random() < this.fleckRate * unravel) {
      let source = small && random() < 0.3 ? small : spiral;
      let at = source[floor(random(source.length))];
      let away = p5.Vector.sub(at, anchor.position).setMag(random(0.5, 1.5)).rotate(random(-0.6, 0.6));
      this.flecks.push({
        position: at.copy(),
        velocity: away,
        size: random(3, 7) * scale,
        age: 0,
        life: random(this.fleckLife[0], this.fleckLife[1]),
      });
    }
  }

  // Draw a line through `points` as a bundle of strands side by side, in short pieces, each
  // with its own colour so it can fade along its length. The part from `curlFrom` on is the
  // curl itself, which gets a reflection hanging below it. As the spiral unravels (unravel
  // goes from 0 to 1), the pieces shrink into dashes, drift apart and drop out.
  drawBundle(points, curlFrom, tendril, unravel, weight, scale) {
    let n = points.length;
    if (n < 4) return;
    let anchor = tendril.anchor;
    let life = anchor.age / this.lifespan;

    // Which way is "across" the line at each point, for spacing out the strands
    let across = points.map((_, i) => {
      let d = p5.Vector.sub(points[min(i + 1, n - 1)], points[max(i - 1, 0)]);
      return createVector(-d.y, d.x).normalize();
    });

    // The reflection flips the curl over its lowest point, like the water's surface under it
    let surface = -Infinity;
    let top = Infinity;
    for (let i = curlFrom; i < n; i++) {
      surface = max(surface, points[i].y);
      top = min(top, points[i].y);
    }
    let curlHeight = max(1, surface - top);

    let middle = (this.strands - 1) / 2;
    for (let s = 0; s < this.strands; s++) {
      // The strands draw together toward the tip, and the outer ones stop a little short,
      // so they nest inside each other like the rings of a scroll
      let offset = (s - middle) * this.strandGap * scale;
      let end = n - floor(abs(s - middle) * 3);
      let strand = [];
      for (let i = 0; i < end; i++) {
        let together = 1 - 0.7 * (i / n);
        strand.push(p5.Vector.add(points[i], p5.Vector.mult(across[i], offset * together)));
      }

      let pieceIndex = 0;
      for (let start = 1; start < strand.length - 2; start += this.pieceLength, pieceIndex++) {
        // Unravelling: each piece drops out at its own moment, so it breaks up bit by bit
        if (unravel > 0 && this.hash(tendril.seed, pieceIndex, s) < unravel * this.breakup) continue;
        let piece = strand.slice(start - 1, start + this.pieceLength + 2);
        if (unravel > 0) {
          // ...and the rest shrink into dashes that drift outward, away from the curl's root
          let trim = floor(piece.length * unravel * 0.25);
          piece = piece.slice(trim, piece.length - trim);
          if (piece.length < 4) continue;
          let mid = piece[floor(piece.length / 2)];
          let drift = p5.Vector.sub(mid, anchor.position).mult(unravel * this.scatter);
          piece = piece.map((p) => p5.Vector.add(p, drift));
        }

        let age = constrain(life + (start / n) * 0.15, 0, 1); // A little fainter toward the tip
        let thickness = weight * (1 - age * 0.6) * (1 - 0.6 * (start / n)); // Thinner as it fades, and toward the tip

        // Its reflection, faint and wobbly (see Portal.wobblyVertex()), drawn first so the
        // line sits on top
        if (start >= curlFrom) {
          stroke(rippleColor(age, this.reflectionAlpha * (1 - age)));
          strokeWeight(thickness);
          beginShape();
          for (let p of piece) {
            let down = (surface - p.y) * this.reflectionDepth; // How far below the surface its reflection is
            let y = surface + down;
            let wave = sin(y * 0.25 + frameCount * 0.12) + 0.5 * sin(y * 0.6 - frameCount * 0.08);
            splineVertex(p.x + wave * 3 * scale * (down / curlHeight), y);
          }
          endShape();
        }

        stroke(rippleColor(age, 220 * (1 - age)));
        strokeWeight(thickness);
        beginShape();
        for (let p of piece) {
          splineVertex(p.x, p.y);
        }
        endShape();
      }
    }
  }

  // A number from 0 to 1 that's always the same for the same inputs, but looks random,
  // so a piece of a spiral drops out at the same moment every frame rather than flickering
  hash(seed, a, b) {
    let h = Math.sin(seed * 12.9898 + a * 78.233 + b * 37.719) * 43758.5453;
    return h - Math.floor(h);
  }

  // A smooth curve (a cubic Bézier) from a, setting off in direction aDir, to b, arriving in
  // direction bDir. Leaves out b itself, since the spiral starts there.
  tail(a, aDir, b, bDir) {
    let d = p5.Vector.dist(a, b);
    let c1 = p5.Vector.add(a, p5.Vector.mult(aDir, d / 3));
    let c2 = p5.Vector.sub(b, p5.Vector.mult(bDir, d / 3));
    let count = max(2, ceil(d / this.tailStep));
    let points = [];
    for (let i = 0; i < count; i++) {
      let t = i / count;
      points.push(createVector(bezierPoint(a.x, c1.x, c2.x, b.x, t), bezierPoint(a.y, c1.y, c2.y, b.y, t)));
    }
    return points;
  }

  // The points along a spiral starting at `start`, setting off in direction `heading`.
  // Walking along it, it turns by more and more each step, so it winds up into a curl:
  // how sharply it turns at a point depends on how far along its *full* length that is (u),
  // so as it grows (grown goes from 0 to 1), the new part at the tip curls up the tightest.
  // Right at the tip it flicks back the other way, into a little hook.
  tendrilPoints(start, heading, length, turns, curl, grown) {
    let points = [];
    let step = length / this.steps;
    let angle = heading;
    let x = 0;
    let y = 0;
    let count = max(4, ceil(this.steps * grown));
    // Curvature is curl * k * (u^2 - whiplash * (1 - u)^2), scaled so it winds `turns` in all
    let k = turns / ((1 - this.whiplash) / 3);
    for (let i = 0; i <= count; i++) {
      points.push(createVector(start.x + x, start.y + y * this.flatten));
      let u = i / this.steps;
      let bend = u > 1 - this.hookLength ? -this.hook : u * u - this.whiplash * (1 - u) * (1 - u);
      angle += (curl * k * bend) / this.steps;
      x += cos(angle) * step;
      y += sin(angle) * step;
    }
    return points;
  }

  // Slide the whole wake, e.g. when the window resizes and the boat moves to the new middle
  shift(offset) {
    for (let chain of this.chains) {
      for (let tendril of chain) {
        tendril.anchor.position.add(offset);
      }
    }
    for (let fleck of this.flecks) {
      fleck.position.add(offset);
    }
  }
}
