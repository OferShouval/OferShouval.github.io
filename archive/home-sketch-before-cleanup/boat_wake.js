// Wake class
// The water churned up behind the boat, drawn as bubbles that spread out, drift and pop.
//
// Every frame the boat lets out a few bubbles at its stern (more the faster it goes),
// each at a random spot across the stern. The bubbles are then:
//   thrown sideways by a random amount, which spreads the wake out into a V
//   slowed down by drag, as the water calms
//   stirred by a Perlin noise "flow field", so they drift like moving water
// Each bubble is drawn exactly like the ripples that follow the mouse: it swells up and
// shrinks away again over its life, fading and changing colour as it goes.
//
// The camera follows the boat, so every bubble also scrolls back by however far
// the world moved this frame, and flowAt() lets other things (the ripples) get carried by
// the wake's moving water.

import p5 from 'p5';
import rippleColor from './ripple_color.js';
import { depth, flatness } from './perspective.js';

class Bubble {
  constructor(position, velocity, size, lifespan) {
    this.position = position.copy();
    this.velocity = velocity.copy();
    this.acceleration = createVector(0, 0);
    this.size = size; // Widest it gets, in pixels (if it were at the bottom of the screen)
    this.lifespan = lifespan; // How many frames until it pops
    this.age = 0; // In frames
  }

  applyForce(force) {
    this.acceleration.add(force);
  }

  update(drag) {
    this.velocity.add(this.acceleration);
    this.velocity.mult(drag);
    this.position.add(this.velocity);
    this.acceleration.mult(0);
    this.age++;
  }

  isPopped() {
    return this.age > this.lifespan;
  }

  // Drawn the same way as the ripples that follow the mouse (see the trail in the sketch)
  show(weight, cameraSquash) {
    let life = this.age / this.lifespan; // 0 = just made, 1 = about to pop
    let newness = 1 - life; // Like the ripples' i / trailLength: 1 = newest
    let diameter = sin(life * PI); // Swells up, then shrinks away
    let fade = sin(newness * HALF_PI); // Bright when new, fading out
    strokeWeight(mouseIsPressed ? weight * random(1, 1.1) : weight);
    stroke(rippleColor(newness, 255 * fade));
    // In perspective, like the ripples: bigger and rounder lower on the screen
    let w = diameter * this.size * depth(this.position.y);
    ellipse(this.position.x, this.position.y, w, w * flatness(this.position.y) * cameraSquash);
  }
}

export default class Wake {
  constructor() {
    this.bubblesPerSpeed = 0.2; // How many bubbles each frame, per pixel per frame of the boat's speed
    this.minSize = 20; // Smallest and biggest bubbles, in pixels
    this.maxSize = 50;
    this.lifespan = 90; // Roughly how many frames a bubble lasts
    this.drag = 0.97; // How quickly the water calms down
    this.spread = 0.8; // How hard bubbles are thrown sideways, compared to the boat's speed
    this.flowScale = 0.004; // Size of the swirls in the water (smaller = bigger swirls)
    this.flowStrength = 0.03; // How hard the swirls push
    this.reach = 70; // How close (in pixels) something has to be for the wake to carry it

    // How far the boat has sailed in total, so the flow field moves with the water
    this.travelled = createVector(0, 0);

    this.bubbles = [];
  }

  // Let out a few new bubbles at the back of the boat.
  // stern: where the back of the boat is; sideways: a unit vector across the boat
  emit(stern, sideways, boatVelocity, sternWidth) {
    let speed = boatVelocity.mag();
    if (speed < 0.5) return; // Not moving, no new wake

    let count = round(speed * this.bubblesPerSpeed + random(-0.5, 0.5));
    for (let i = 0; i < count; i++) {
      let side = random(-1, 1); // -1 is one edge of the V, 1 the other
      let start = p5.Vector.add(stern, p5.Vector.mult(sideways, side * sternWidth));
      let push = p5.Vector.mult(sideways, side * speed * this.spread);
      let pulled = p5.Vector.mult(boatVelocity, 0.2); // Water gets dragged along behind the boat a little
      let velocity = p5.Vector.add(push, pulled).add(random(-0.3, 0.3), random(-0.3, 0.3));
      let size = random(this.minSize, this.maxSize);
      let lifespan = this.lifespan * random(0.6, 1.2);
      this.bubbles.push(new Bubble(start, velocity, size, lifespan));
    }
  }

  // scroll: how far the world slides back this frame (see Boat)
  update(scroll) {
    this.travelled.add(scroll);

    for (let bubble of this.bubbles) {
      // Flow field: the noise value at this spot (in the water, not on the screen)
      // picks a direction to drift in
      let x = bubble.position.x + this.travelled.x;
      let y = bubble.position.y + this.travelled.y;
      let n = noise(x * this.flowScale, y * this.flowScale, frameCount * 0.005);
      let flow = p5.Vector.fromAngle(n * TWO_PI * 2);
      flow.mult(this.flowStrength);
      bubble.applyForce(flow);
      bubble.update(this.drag);

      // The camera follows the boat, so the water (and everything on it) slides backward
      bubble.position.sub(scroll);
    }

    // Pop the old ones (going backwards, so removing one doesn't skip the next)
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      if (this.bubbles[i].isPopped()) this.bubbles.splice(i, 1);
    }
  }

  // cameraSquash: the boat's camera squash, so the bubbles tip with the view like the ripples
  show(weight, cameraSquash) {
    push();
    noFill();
    for (let bubble of this.bubbles) {
      bubble.show(weight, cameraSquash);
    }
    pop();
  }

  // How the wake is moving the water at (x, y): a mix of the velocities of nearby
  // bubbles, the closer ones counting more. Far from the wake this is zero.
  // This runs for every ripple against every bubble (tens of thousands of times a frame),
  // so it uses plain Math instead of p5's dist(), which is much slower while developing.
  flowAt(x, y) {
    let total = createVector(0, 0);
    let weights = 0;
    for (let i = 0; i < this.bubbles.length; i += 2) { // Every other bubble is plenty
      let bubble = this.bubbles[i];
      let dx = bubble.position.x - x;
      let dy = bubble.position.y - y;
      if (Math.abs(dx) > this.reach || Math.abs(dy) > this.reach) continue; // Quick check: too far
      let d = Math.sqrt(dx * dx + dy * dy);
      if (d < this.reach) {
        let weight = 1 - d / this.reach;
        total.add(p5.Vector.mult(bubble.velocity, weight));
        weights += weight;
      }
    }
    // Divide by at least 1, so a lone bubble only nudges things a little
    return total.div(max(weights, 1));
  }

  // Slide the whole wake, e.g. when the window resizes and the boat moves to the new middle
  shift(offset) {
    for (let bubble of this.bubbles) {
      bubble.position.add(offset);
    }
  }
}
