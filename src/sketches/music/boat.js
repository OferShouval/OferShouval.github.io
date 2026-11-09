// Boat class
// The boat, drawn as a computer's mouse pointer lying flat on the water. The arrow keys push it,
// holding the mouse down pulls it toward the mouse, and clicking a gate sends it there by itself.
//
// A "camera" follows it with a little ease: each frame the world scrolls back by part of the
// gap between the boat and its home on the screen (this.scroll). So when the boat speeds up it
// pulls ahead, and when it stops the world catches up and it drifts back home.
//
// Its shape is in "boat space", measured in boat lengths: x runs from the back (-0.5) to the
// front (+0.5), y across it. onScreen() turns those into positions on the screen.

import p5 from 'p5';
import { boatGrey } from './color.js';

const TILT = 0.4; // How far above the water we're looking from (radians)
const SIN_TILT = Math.sin(TILT);

export default class Boat {
  constructor(x, y) {
    this.position = createVector(x, y);
    this.home = createVector(x, y); // Where the camera wants to keep the boat
    this.scroll = createVector(0, 0); // How far the world slides back this frame
    this.followSpeed = 0.025; // How quickly the world catches up (0 to 1, smaller = boat gets further ahead)
    this.velocity = createVector(0, 0);
    this.acceleration = createVector(0, 0);
    this.keyTurn = 0; // How far the camera has swung since these keys were pressed, so they turn with it
    this.lastKeys = 0; // Which arrow keys were down last frame
    this.hurry = 1; // How many times its usual speed it's going (the sketch raises it to reach a gate in time)
    this.dt = 1; // How many 60ths of a second this frame took (smoothed), so it sails at the same speed at any frame rate
    this.maxspeed = 2; // Maximum speed
    this.maxforce = 0.08; // How hard the keys / mouse can push (smaller = it speeds up and changes course more slowly)
    this.drag = 0.96; // Water slows the boat down a little every frame
    this.sinking = false; // Set by a gate when the boat starts going through it
    this.gateCut = null; // Set by a gate while the boat goes through it: where to cut the boat off
    this.destination = null; // A gate to sail to by itself (see sailTo())
    this.arriving = false; // Sailing on from below the screen, while the camera waits (see sailOn())
    this.leaving = null; // Turning round and sailing off the bottom of the screen, for home (see goHome())
    this.uTurnTime = 1.5; // How many seconds turning round takes
    this.arcAmount = 0.15; // How wide the boat swings out on its way there (radians at the start)
    this.waveAmount = 0.6; // How far it curves from side to side on the way there (radians at the start)
    this.waveTime = 5; // How long each wave takes, roughly, in seconds

    this.angle = -PI / 2; // Which way the boat is facing
    this.turnSpeed = 0.04; // How quickly it turns toward where it's going
    this.depthShrink = 0.5; // How much the boat shrinks as it moves away (1 = exactly like the water's lines, 0 = never)
    this.alpha = 200; // How bright its line is (255 = solid)
    this.wobble = 0.0042; // How far its line wobbles, compared to its length
    this.length = 400; // Its length in pixels, updated to fit the window
    this.clearBehind = -0.8; // How far back the water behind it is kept clear (see clearAt()), along the boat in boat lengths
    this.cosAngle = cos(this.angle);
    this.sinAngle = sin(this.angle);

    this.stern = createVector(x, y); // Where the back of the boat is, on the screen
    this.bow = createVector(x, y); // ...and the front

    let grid = pointerGrid();
    this.outline = pointerOutline(grid);
    this.corners = [grid[1], grid[6]]; // Its two wide corners, for the wake to start from
  }

  // Start `below` the bottom of the screen, wait `wait` seconds, then head up and sail on to home by itself
  sailOn(below, wait = 0) {
    this.position.set(this.home.x, height + below);
    this.arriving = true;
    this.arriveAt = millis() + wait * 1000;
    this.setOff = false;
  }

  // Turn round and sail off the bottom of the screen by itself, toward x, while the camera waits.
  // It turns whichever way is shorter, or toward the middle of the screen if it's facing straight up.
  goHome(x) {
    let span = (((HALF_PI - this.angle) % TWO_PI) + TWO_PI) % TWO_PI; // How far round to face down, turning clockwise
    let side = span < PI - 0.2 ? 1 : span > PI + 0.2 ? -1 : this.position.x < width / 2 ? 1 : -1;
    this.leaving = { x, at: millis(), from: this.angle, turn: side === 1 ? span : span - TWO_PI };
    this.destination = null;
    this.arriving = false;
  }

  run() {
    this.steer();
    this.update();
    this.show();
  }

  // Stroke weight for the wake and the water's lines, which grows and shrinks with the boat
  wakeWeight() {
    return Math.max(1.6, this.length * 0.0065);
  }

  // How much faster it sails than in a window 900 pixels tall. The distances it sails grow with
  // the window, so its speed does too, but not quite as much, or it looks too fast on a big screen.
  fit() {
    return pow(height / 900, 0.75);
  }

  // Where the boat sits on the water, down the screen
  waterY() {
    return this.position.y + this.length * 0.12;
  }

  // Sail to a gate by itself (when it's clicked)
  sailTo(gate) {
    this.destination = gate;
    this.sailedAt = millis();
    this.waveStart = random(TWO_PI); // So it's a different route every time
    let toTarget = p5.Vector.sub(gate.position, this.position);
    this.arcStart = toTarget.mag(); // How far it was when it set off
    // Swing out on the side the boat is already facing, so it turns smoothly: if the
    // gate is clockwise of where it's facing, aim anticlockwise of it, and vice versa
    let clockwise = this.cosAngle * toTarget.y - this.sinAngle * toTarget.x > 0;
    this.arcSide = clockwise ? -1 : 1;
  }

  applyForce(force) {
    this.acceleration.add(force);
  }

  // Turn keyboard / mouse input into a force
  steer() {
    // Waiting to sail on: still, whatever's pressed
    if (this.arriving && millis() < this.arriveAt) {
      this.velocity.set(0, 0);
      return;
    }
    if (this.arriving && !this.setOff) {
      this.setOff = true;
      this.velocity.set(0, -this.maxspeed * this.fit());
    }
    // Going home: round, then down and off the screen, whatever's pressed
    if (this.leaving) {
      let { x, at, from, turn } = this.leaving;
      let t = Math.min(1, (millis() - at) / 1000 / this.uTurnTime);
      let force = t < 1 ? p5.Vector.fromAngle(from + turn * t) : createVector(x - this.position.x, height + this.length * 10 - this.position.y);
      force.setMag(this.maxforce);
      this.applyForce(force);
      return;
    }

    if (this.sinking) return; // Going through a gate: no more steering
    let force = createVector(0, 0);
    if (keyIsDown(LEFT_ARROW)) force.x -= 1;
    if (keyIsDown(RIGHT_ARROW)) force.x += 1;
    if (keyIsDown(UP_ARROW)) force.y -= 1;
    if (keyIsDown(DOWN_ARROW)) force.y += 1;

    // Steering with the keys takes back control from sailing by itself
    if (force.mag() > 0) this.destination = null;

    // Sailing on: straight up the screen until it's home, unless someone takes over
    if (this.arriving && (force.mag() > 0 || this.destination || mouseIsPressed || this.position.y <= this.home.y)) this.arriving = false;
    if (this.arriving) force.set(0, -1);

    // The keys steer relative to the camera, so once it's swung round behind the boat they
    // carry straight on, rather than pushing it back off to the side. Pressing a different
    // key starts afresh.
    let keys = force.x * 3 + force.y;
    if (keys !== this.lastKeys) this.keyTurn = 0;
    this.lastKeys = keys;
    force.rotate(this.keyTurn);

    if (force.mag() === 0 && this.destination) {
      // Sailing by itself: head for the middle of the gate. The boat is drawn a little
      // above where it touches the water, so aim that much higher.
      let target = createVector(this.destination.position.x, this.destination.position.y - this.length * 0.12);
      force = p5.Vector.sub(target, this.position);
      // Arc there rather than going straight: aim off to one side at first, less and less
      // the closer it gets, so the boat curves in and arrives head on
      let stillToGo = constrain(force.mag() / this.arcStart, 0, 1);
      force.rotate(this.arcSide * this.arcAmount * stillToGo);
      // ...and curve from side to side in long, uneven waves (two, out of step with each
      // other), less and less the closer it gets, so it arrives straight on
      let phase = (TWO_PI * (millis() - this.sailedAt)) / 1000 / this.waveTime + this.waveStart;
      let weave = (sin(phase) + 0.4 * sin(phase * 1.4 + 1)) / 1.4;
      force.rotate(this.waveAmount * weave * stillToGo * stillToGo);
    } else if (force.mag() === 0 && mouseIsPressed) {
      // No keys? Then holding the mouse down pulls the boat toward it
      force = createVector(mouseX - this.position.x, mouseY - this.position.y);
      if (force.mag() < 20) force.mult(0); // Close enough, stop pulling
    }

    force.setMag(this.maxforce);
    this.applyForce(force);
  }

  update() {
    // Smoothed, so an odd slow frame doesn't make it lurch; and limited, so coming back to the
    // tab after a long time away doesn't make it jump
    this.dt = lerp(this.dt, constrain(deltaTime / (1000 / 60), 0.5, 3), 0.1);

    let fit = this.fit();
    this.velocity.add(p5.Vector.mult(this.acceleration, this.dt * fit * this.hurry));
    this.velocity.mult(pow(this.drag, this.dt));
    this.velocity.limit(this.maxspeed * fit * this.hurry);
    this.position.add(this.velocity.x * this.dt, this.velocity.y * this.dt);
    this.acceleration.set(0, 0);

    // The camera eases toward the boat: slide the world (and the boat) back by a small part
    // of how far the boat is from home (keeping up when it's in a hurry, so it doesn't run
    // away up the screen)
    let follow = this.arriving || this.leaving ? 0 : 1 - pow(1 - Math.min(0.5, this.followSpeed * this.hurry), this.dt);
    this.scroll.set((this.position.x - this.home.x) * follow, (this.position.y - this.home.y) * follow);
    this.position.sub(this.scroll);

    // Turn smoothly to face the direction it's moving
    if (this.velocity.mag() > 0.5) {
      let target = this.velocity.heading();
      let difference = atan2(sin(target - this.angle), cos(target - this.angle)); // The shortest way round
      this.angle += difference * (1 - pow(1 - Math.min(0.5, this.turnSpeed * this.hurry), this.dt));
    }
    this.cosAngle = cos(this.angle);
    this.sinAngle = sin(this.angle);

    // Keep the boat a sensible size for the window, and shrink it as it moves away up the screen
    let further = this.position.y / this.home.y; // Under 1 = further away than home, over 1 = closer
    let shrink = constrain(1 + (further - 1) * this.depthShrink, 0.5, 1.5);
    this.length = Math.min(width, height / 2, 1100) * 0.5 * shrink;

    this.stern = this.onScreen(-0.45, 0);
    this.bow = this.onScreen(0.45, 0);
  }

  // Where a point in boat space is on the screen
  onScreen(x, y) {
    return createVector(
      this.position.x + (x * this.cosAngle - y * this.sinAngle) * this.length,
      this.waterY() + (x * this.sinAngle + y * this.cosAngle) * SIN_TILT * this.length,
    );
  }

  // Where the point (x, y) on the screen is compared to the boat, in boat lengths: `along` it
  // (-0.5 at the back, 0.5 at the front) and `across` it (positive on the side the sketch's
  // sideways vector points to). Undoes onScreen().
  onHull(x, y) {
    let dx = (x - this.position.x) / this.length;
    let dy = (y - this.waterY()) / this.length / SIN_TILT;
    return { along: dx * this.cosAngle + dy * this.sinAngle, across: -dx * this.sinAngle + dy * this.cosAngle };
  }

  // How far the water's kept clear either side of the boat, `along` it (in boat lengths)
  widthAt(along) {
    return hullWidth(constrain(along + 0.5, 0, 1), 0.18);
  }

  // How far the water behind and beside the boat is kept clear on one side, `along` it (in boat
  // lengths). Behind its wide corner it stays as wide as the corner, rather than narrowing with the
  // hull, so nothing gets caught in the notches around its tail. across: which side, by its sign.
  clearAt(along, across) {
    let corner = this.corners[0].y * across > 0 ? this.corners[0] : this.corners[1];
    return along < corner.x ? Math.abs(corner.y) : this.widthAt(along);
  }

  // Is (x, y) under the boat, or in the clear water just behind it?
  isClear(x, y) {
    let { along, across } = this.onHull(x, y);
    return along < 0.5 && along >= this.clearBehind && Math.abs(across) < this.clearAt(along, across);
  }

  // Across the boat, on the screen, squashed like the water
  sideways() {
    return createVector(-this.sinAngle, this.cosAngle * SIN_TILT);
  }

  show() {
    push();
    translate(this.position.x, this.waterY());
    if (this.gateCut) this.cutAtGate();
    fill(0); // Hides the water's lines underneath it
    strokeWeight(Math.max(1.6, this.length * 0.0075));
    stroke(boatGrey(this.alpha));

    // Its line wobbles on the moving water: sideways by a wave running up and down the
    // screen, and up and down by one running across it, so it looks wavy whichever way it's facing
    let amount = this.length * this.wobble;
    let fc = frameCount;
    beginShape();
    for (let p of this.outline) {
      let sx = (p.x * this.cosAngle - p.y * this.sinAngle) * this.length;
      let sy = (p.x * this.sinAngle + p.y * this.cosAngle) * SIN_TILT * this.length;
      let x = sx + this.position.x;
      let y = sy + this.position.y;
      let across = Math.sin(y * 0.25 + fc * 0.12) + 0.5 * Math.sin(y * 0.6 - fc * 0.08);
      let upDown = Math.sin(x * 0.25 + fc * 0.1) + 0.5 * Math.sin(x * 0.6 - fc * 0.07);
      vertex(sx + across * amount, sy + upDown * amount * 0.5);
    }
    endShape(CLOSE);
    pop();
  }

  // While going through a gate, hide the part that's already through, so the boat looks sliced
  // off by the gate. (Called with the boat translated to its own position, so everything here
  // is measured from there.)
  cutAtGate() {
    let g = this.gateCut;
    let line = g.y - this.waterY();
    let left = g.left - this.position.x;
    beginClip({ invert: true }); // Draw everywhere except inside this rectangle
    if (g.cameFrom === 1) rect(left, line - height * 2, g.width, height * 2); // Through = up the screen
    else rect(left, line, g.width, height * 2); // Through = down the screen
    endClip();
  }
}

// How far the water's kept clear of the boat (from the middle to one side) at t, which goes
// from the back (0) to the front (1), halfWidth at its widest
function hullWidth(t, halfWidth) {
  let widthAt = (t) => pow(t, 0.5) * pow(1 - t, 0.75);
  return (halfWidth * widthAt(t)) / widthAt(0.4);
}

// The corners of a mouse pointer, in boat lengths, pointing forward (x = 0.5 at the tip):
// a straight edge down one side, a slanted edge down the other, and a tail
function pointerGrid() {
  // The classic pointer, drawn on a grid 12 wide and 20 tall with the tip at the top
  let grid = [
    [0, 0], [0, 17], [4, 13], [7, 20], [9, 19], [6, 12], [12, 12],
  ];
  // A pointer leans to one side, so it looks like it points from the middle of its tail
  // to its tip, not along its straight edge. Tilt it so that line points straight ahead.
  let tilt = atan2(8, 19.5); // From the tip to the middle of the tail, (8, 19.5)
  let length = Math.hypot(8, 19.5);
  let narrow = 0.8; // How wide it is, compared to the classic pointer (1 = the same)
  return grid.map(([x, y]) => {
    let gx = x * cos(tilt) - y * sin(tilt);
    let gy = x * sin(tilt) + y * cos(tilt);
    // Down the grid is backward along the boat; across the grid is across it
    return { x: 0.5 - gy / length, y: (gx / length) * narrow };
  });
}

// The pointer's outline, with every edge in small steps, so it can wobble
function pointerOutline(grid) {
  let points = [];
  for (let i = 0; i < grid.length; i++) {
    let a = grid[i];
    let b = grid[(i + 1) % grid.length];
    let steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 20)); // About one per grid square
    for (let k = 0; k < steps; k++) {
      points.push({ x: lerp(a.x, b.x, k / steps), y: lerp(a.y, b.y, k / steps) });
    }
  }
  return points;
}
