// Portal class
// A gate standing in the sea, like a simple torii: a frame (two posts and a beam across
// the top, with rounded corners) that the boat sails through. It draws the boat toward it, and when
// the boat reaches it, the boat passes through, fading away as the opening fills with
// light, and the page goes to `url`.
//
// It's drawn like the boat, as a few nested outlines in the ripples' colours, with a faint
// reflection in the water. It's smaller the higher up the screen it is, and it drifts past
// with the water as the boat sails.
// When it's off the screen, a tag at the edge of the screen points the way to it.

import p5 from 'p5';
import rippleColor, { turnWhite } from './ripple_color.js';
import { depth, flatness } from './perspective.js';

export default class Portal {
  constructor(x, y, url, label) {
    this.position = createVector(x, y);
    this.url = url; // Where to go when the boat sails through
    this.label = label; // The page's name, shown under the gate

    this.gateWidth = 300; // Width in pixels (if it were at the bottom of the screen)
    this.gateHeight = 1.1; // Height, compared to its width
    this.outlines = 4; // How many nested outlines it's drawn with
    this.slowest = 0.35; // How slowly it slides past when it's furthest away, compared to at the boat
    this.cornerRound = 0; // How rounded its top corners are, compared to its width (0 = square, 0.5 = a semicircle)
    this.pull = 0.5; // How hard it draws the boat toward the middle
    this.reach = 1.6; // How far out it starts pulling the boat in (1 = the posts, 2 = twice as far)
    this.catchDistance = 0.5; // How close to the middle the boat has to get to go through (1 = the posts)
    this.worldScreens = 3; // How many screens across the gates can drift to (see borders())

    this.labelArea = null; // Where the name was last drawn, so it can be clicked
    this.passTime = 0; // Frames since the boat started going through (0 = not yet)
    this.boatSide = 0; // Which side of the gate the boat was on last frame (-1 = beyond it, 1 = in front)
    this.brightness = 230; // How bright its lines are (255 = solid)
    this.thinInDistance = false; // Should its lines get thinner up the screen, like the water's lines?
    this.place = null; // A function that sets where it is each frame, if the sketch wants to (rather than it drifting with the water)
    this.measure(1);
  }

  // (No run(): the sketch updates every gate first, then draws the ones behind the boat
  // before it and the ones in front of it after it, so the boat can sail behind a gate.)

  update(boat) {
    // It sits on the water, so it slides back as the camera follows the boat: slower the
    // further away it is, like the water's lines, so it grows at an even rate as it nears
    if (this.place) {
      this.place(this);
    } else {
      let distance = constrain(this.position.y / (boat.position.y + boat.length * 0.12), this.slowest, 1.5);
      // (Both ways equally, so a gate the boat is aiming at stays straight ahead of it)
      this.position.sub(p5.Vector.mult(boat.scroll, distance));
      this.borders();
    }
    this.measure(boat.squash);

    // Where the boat touches the water
    let bx = boat.position.x;
    let by = boat.position.y + boat.length * 0.12;

    if (this.passTime > 0) {
      this.passThrough(boat);
      return;
    }
    if (boat.sinking) return; // Already going through another gate

    // Did the boat cross the line between the posts since last frame? The patch of water
    // between the posts is only a few pixels deep in perspective, and the boat can move
    // further than that in one frame, so check for crossing it, not just for being on it.
    let side = by < this.position.y ? -1 : 1;
    let betweenPosts = abs(bx - this.position.x) < this.rx;
    let nearby = abs(by - this.position.y) < this.rx;
    let crossed = this.boatSide !== 0 && side !== this.boatSide && betweenPosts && nearby;
    let cameFrom = crossed ? this.boatSide : side; // Which side it's coming through from
    this.boatSide = side;

    let d = this.distanceFromCenter(bx, by);
    if (crossed || d < this.catchDistance) {
      this.passTime = 1;
      this.cameFrom = cameFrom;
      boat.sinking = true;
      turnWhite(true); // Everything turns white, like holding the mouse down
    } else if (d < this.reach && boat.destination !== this) { // (One it's already sailing to doesn't need to)
      // Close enough: draw the boat toward the middle, harder the closer it gets
      let strength = 1 - d / this.reach;
      let inward = createVector(this.position.x - bx, this.position.y - by).normalize();
      inward.mult(this.pull * strength + 0.03);
      boat.applyForce(inward);
    }
  }

  // The boat has reached the gate: it sails steadily on through, and the part of it that's
  // already through is cut off at the gate, as if it's gone somewhere else. Once all of it
  // is through, change page.
  passThrough(boat) {
    this.passTime++;
    // Straight on through, away from the side it came from, and into the middle of the opening
    boat.velocity.set((this.position.x - boat.position.x) * 0.05 * boat.hurry, -this.cameFrom * 3 * boat.hurry);

    // Cut the boat off between the posts, on the far side of the gate (see Boat.cutAtGate())
    boat.gateCut = { left: this.position.x - this.rx, width: this.rx * 2, y: this.position.y, cameFrom: this.cameFrom };

    // Is the back of the boat through yet? Then it's all gone: change page a moment later
    // (or after a few seconds, just in case)
    let sternThrough = this.cameFrom === 1 ? boat.stern.y < this.position.y : boat.stern.y > this.position.y;
    if (sternThrough && !this.allThroughAt) this.allThroughAt = this.passTime;
    let done = (this.allThroughAt && this.passTime > this.allThroughAt + 10) || this.passTime > 150;
    if (done && !this.leaving) {
      this.leaving = true;
      window.location.href = this.url;
    }
  }

  // How far the gate has filled with light since the boat reached it: 0 to 1
  through() {
    return min(1, this.passTime / 60);
  }

  // The water is a big loop, a few screens wide and tall, centred on the screen:
  // sail far enough one way and the portals come back around from the other side.
  // They jump while they're well off the screen, so you never see it happen.
  borders() {
    let worldWidth = width * this.worldScreens;
    let worldHeight = height * this.worldScreens;
    // Stop at the edge and wait there, so it's never too far to sail back to, rather than
    // jumping to the other side
    this.position.x = constrain(this.position.x, width / 2 - worldWidth / 2, width / 2 + worldWidth / 2);
    this.position.y = constrain(this.position.y, height / 2 - worldHeight / 2, height / 2 + worldHeight / 2);
  }

  // While the portal is off the screen, show its label at the edge of the screen
  // with an arrow pointing toward it
  showTag() {
    if (this.isOnScreen() || !this.label) return;

    // Head from the middle of the screen toward the portal, stopping just inside the edge
    // (with extra room at the top for the navbar)
    let center = createVector(width / 2, height / 2);
    let direction = p5.Vector.sub(this.position, center);
    let room = createVector(width / 2 - 40, direction.y < 0 ? height / 2 - 80 : height / 2 - 40);
    let fit = min(room.x / abs(direction.x), room.y / abs(direction.y));
    let tag = p5.Vector.add(center, p5.Vector.mult(direction, fit));
    let pointing = direction.copy().normalize();

    push();
    translate(tag.x, tag.y);
    noStroke();
    fill(255, 220);

    // Arrow, pointing toward the portal: a tip out along `pointing`, and two back
    // corners either side of it
    // (long and narrow, so it can't be mistaken for pointing another way)
    let side = createVector(-pointing.y, pointing.x).mult(4);
    triangle(pointing.x * 16, pointing.y * 16, side.x, side.y, -side.x, -side.y);

    pop();

    // Name, just on the inside of the arrow
    textSize(14);
    let gap = abs(pointing.x) * (textWidth(this.label) / 2 + 12) + abs(pointing.y) * 18;
    this.drawName(tag.x - pointing.x * gap, tag.y - pointing.y * gap, 14, 18);
  }

  // Draw the name like a link, centred on (x, y): underlined, and brighter with a
  // "click to sail here" hint when the mouse is over it, so it's clear it can be clicked
  drawName(x, y, size, padding) {
    let hovered = this.isLabelAt(mouseX, mouseY);
    push();
    textSize(size);
    textAlign(CENTER, CENTER);
    let w = textWidth(this.label);
    noStroke();
    fill(255, hovered ? 255 : 210);
    text(this.label, x, y);
    // Underline
    stroke(255, hovered ? 255 : 130);
    strokeWeight(1);
    line(x - w / 2, y + size * 0.7, x + w / 2, y + size * 0.7);
    if (hovered) {
      noStroke();
      fill(255, 180);
      textSize(11);
      text('click to sail here', x, y + size + 10);
    }
    pop();
    // Remember where it is (with room to spare) for clicking
    this.setLabelArea(x, y, w, size, padding);
  }

  // Is any of the gate on the screen?
  isOnScreen() {
    return (
      this.position.x + this.rx > 0 && this.position.x - this.rx < width &&
      this.position.y + this.ry > 0 && this.position.y - this.h < height
    );
  }

  // Remember a box around the name, centred on (x, y), so clicks on it can be found
  setLabelArea(x, y, w, h, padding) {
    this.labelArea = { left: x - w / 2 - padding, right: x + w / 2 + padding, top: y - h / 2 - padding, bottom: y + h / 2 + padding };
  }

  // Is (x, y) on the portal's name?
  isLabelAt(x, y) {
    let a = this.labelArea;
    return a !== null && x > a.left && x < a.right && y > a.top && y < a.bottom;
  }

  // Is (x, y) on the gate itself, or its reflection? (With a little room to spare, so a
  // small one in the distance is still easy to click)
  isGateAt(x, y) {
    let room = 10;
    let inside = abs(x - this.position.x) < this.rx + room;
    return inside && y > this.position.y - this.h - room && y < this.position.y + this.h * 0.4 + room;
  }

  // How big the gate looks at its spot on the screen: bigger the further down the screen,
  // like the ripples. rx and ry are the patch of water between its posts, squashed in
  // perspective like a ripple (squash is the boat's camera squash); h is how tall it stands.
  measure(squash) {
    this.rx = (this.gateWidth / 2) * depth(this.position.y);
    this.ry = this.rx * flatness(this.position.y) * squash;
    this.h = this.rx * 2 * this.gateHeight;
  }

  // How far (x, y) on the water is from the middle of the gate: 0 in the middle,
  // 1 out at the posts, more than 1 outside
  distanceFromCenter(x, y) {
    let dx = (x - this.position.x) / this.rx;
    let dy = (y - this.position.y) / this.ry;
    return sqrt(dx * dx + dy * dy);
  }

  show(boat) {
    let x = this.position.x;
    let y = this.position.y; // Where the posts meet the water
    let w = this.rx * 2;
    push();

    // As the boat passes through, the opening fills with light, and so does its
    // reflection in the water (more faintly)
    if (this.passTime > 0) {
      noStroke();
      fill(255, 220 * this.through());
      let r = w * this.cornerRound;
      rect(x - w / 2, y - this.h, w, this.h, r, r, 0, 0);
      fill(255, 90 * this.through());
      this.reflection(x, y, w, this.h, true);
    }

    // The gate: two posts and a beam across the top (no bottom, so you can sail through),
    // drawn as a few nested outlines, each a little inside the last
    noFill();
    // (Never so thin it can't be seen)
    strokeWeight(this.thinInDistance ? max(0.75, boat.wakeWeight() * constrain(y / height, 0, 1)) : boat.wakeWeight());
    for (let i = 0; i < this.outlines; i++) {
      let inset = i * w * 0.03;
      stroke(rippleColor((i + 0.5) / this.outlines, this.brightness));
      this.frame(x, y, w - inset * 2, this.h - inset);
      // Its reflection in the water: upside down, squashed, faint and wobbly
      stroke(rippleColor((i + 0.5) / this.outlines, this.brightness * 0.43));
      this.reflection(x, y, w - inset * 2, this.h - inset, false);
    }

    pop();

    // Name underneath (when it's off the screen, showTag() shows the name instead)
    if (this.label && this.isOnScreen()) {
      let size = constrain(this.rx * 0.2, 13, 18);
      this.drawName(this.position.x, this.position.y + this.ry + 10 + size / 2, size, 10);
    }
  }

  // The gate's reflection in the water at (x, y), for a frame w wide and h tall: the frame
  // upside down and squashed, but wobbling sideways like a reflection on moving water.
  // close fills it in as one shape (for the light).
  reflection(x, y, w, h, close) {
    let down = 0.4; // How far down it hangs, compared to the frame's height
    beginShape();
    for (let p of this.outline(x, y, w, h)) {
      let deep = (y - p.y) / h; // 0 at the surface, 1 for the top of the frame
      this.wobblyVertex(p.x, y + deep * h * down, deep, w);
    }
    if (close) endShape(CLOSE);
    else endShape();
  }

  // One point of the reflection, pushed sideways by the moving water. `deep` is how far
  // down it is (0 at the surface, 1 at the bottom): the deeper, the more it wobbles.
  wobblyVertex(px, py, deep, w) {
    let wave = sin(py * 0.25 + frameCount * 0.12) + 0.5 * sin(py * 0.6 - frameCount * 0.08);
    vertex(px + wave * min(w * 0.03, 5) * deep, py);
  }

  // A gate frame standing on the water at (x, y): a post either side and a beam across
  // the top, h tall
  frame(x, y, w, h) {
    beginShape();
    for (let p of this.outline(x, y, w, h)) vertex(p.x, p.y);
    endShape();
  }

  // The points along a frame standing on the water at (x, y), w wide and h tall: up the
  // left post, round the corner, along the beam, round the other corner and down the right
  // post. Lots of them, so its reflection can bend.
  outline(x, y, w, h) {
    let r = min(w * this.cornerRound, w / 2, h);
    let left = x - w / 2;
    let right = x + w / 2;
    let top = y - h;
    let steps = 16;
    let points = [];
    for (let i = 0; i <= steps; i++) points.push(createVector(left, lerp(y, top + r, i / steps))); // Up the left post
    for (let i = 1; i <= steps; i++) {
      let a = PI + HALF_PI * (i / steps); // Round the top left corner
      points.push(createVector(left + r + cos(a) * r, top + r + sin(a) * r));
    }
    for (let i = 1; i <= steps; i++) points.push(createVector(lerp(left + r, right - r, i / steps), top)); // Along the beam
    for (let i = 1; i <= steps; i++) {
      let a = PI + HALF_PI + HALF_PI * (i / steps); // Round the top right corner
      points.push(createVector(right - r + cos(a) * r, top + r + sin(a) * r));
    }
    for (let i = 1; i <= steps; i++) points.push(createVector(right, lerp(top + r, y, i / steps))); // Down the right post
    return points;
  }
}
