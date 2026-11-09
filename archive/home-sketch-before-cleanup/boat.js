// Boat class
// A line-drawn boat you can steer. The arrow keys push it,
// holding the mouse down pulls it toward the mouse.
//
// The boat sails forward on the screen, and a "camera" follows it with a little ease:
// each frame the world scrolls back by part of the gap between the boat and its home
// in the middle of the screen (this.scroll). So when the boat speeds up it pulls ahead,
// and when it stops the background catches up and it drifts back to the middle.
// The sketch scrolls the ripples by -scroll. The boat's wake is part of those ripples:
// while the boat is moving, the sketch puts new ripples at its stern (this.stern).
//
// The boat is a small 3D model made of outlines (hull slices and cabin).
// Every point is a vector in "boat space", measured in hull lengths:
//   x runs from the back of the boat (-0.5) to the front (+0.5)
//   y runs across the boat, from side to side
//   z is the height above the water
// toScreen() turns those 3D points into 2D points on the canvas.

import p5 from 'p5';
import { flicker } from './ripple_color.js';

export default class Boat {
  constructor(x, y) {
    this.position = createVector(x, y);
    this.home = createVector(x, y); // Where the camera wants to keep the boat
    this.scroll = createVector(0, 0); // How far the world slides back this frame
    this.followSpeed = 0.025; // How quickly the background catches up (0 to 1, smaller = boat gets further ahead)
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
    this.destination = null; // A portal to sail to by itself (see sailTo())
    this.arcAmount = 0.15; // How wide the boat swings out on its way there (radians at the start)
    this.waveAmount = 0.6; // How far it curves from side to side on the way there (radians at the start)
    this.waveTime = 5; // How long each wave takes, roughly, in seconds

    this.angle = -PI/2; // Which way the boat is facing
    this.turnSpeed = 0.04; // How quickly it turns toward where it's going
    this.baseTilt = 0.35; // How far above the water we're looking from (radians)
    this.cameraSwing = 0.0006; // How much the view angle shifts per pixel the boat is ahead of the camera
    this.depthShrink = 0.5; // How much the boat shrinks as it moves away (1 = exactly like the ripples, 0 = never)
    this.shape = 'arrow'; // 'arrow' (like a computer's mouse pointer) or 'boat'
    this.showHull = 'wavy'; // How to draw the boat itself: 'solid', 'wavy' (faint and wobbly, like its reflection) or 'none' (just its reflection)
    this.wavyAlpha = 200; // How bright the boat is when it's drawn 'wavy' (see reflectionAlpha for its reflection)
    this.reflectionAlpha = 100; // How bright its reflection is
    this.wavyAmount = 0.35; // How wavy the boat is then, compared to its reflection (1 = just as wavy)
    this.surfaceWobble = 0.6; // How much even the parts right on the water wobble (0 = not at all, 1 = as much as the top of the cabin)
    this.reflectionDepth = 1; // How far its reflection hangs down into the water, compared to its height (1 = a true mirror image)
    this.length = 400; // Hull length in pixels, updated to fit the window
    this.aimCamera();

    // Stroke colours for each part of the boat. Change these any time,
    // or press "c" to open the colour pickers.
    this.colors = {
      hull: ['#b4b4b4', '#7aa6dc', '#9b2d8f'], // deck to waterline (add more for more outlines)
      cabin: ['#d9b36a', '#7fe0a8'], // top to bottom
      ripple: ['#7aa6dc', '#e8a4b8', '#c8c8d0', '#e0d0e0'], // inside to outside
    };

    this.stern = createVector(x, y); // Where the back of the boat meets the water, on the screen
    this.bow = createVector(x, y); // ...and the front

    this.outlines = []; // Every shape to draw: { points, part, index, alpha }
    this.buildModel();
    this.panel = null;
    this.mouseOverPanel = false;
  }

  run() {
    this.steer();
    this.update();
    this.show();
  }

  // Stroke weight for the ripples, which grows and shrinks with the boat
  wakeWeight() {
    return max(1.6, this.length * 0.0065);
  }

  // Sail to a portal by itself (when its name is clicked)
  sailTo(portal) {
    this.destination = portal;
    this.sailedAt = millis();
    this.waveStart = random(TWO_PI); // So it's a different route every time
    let toTarget = p5.Vector.sub(portal.position, this.position);
    this.arcStart = toTarget.mag(); // How far it was when we set off
    // Swing out on the side the boat is already facing, so it turns smoothly: if the
    // portal is clockwise of where it's facing, aim anticlockwise of it, and vice versa
    let facing = p5.Vector.fromAngle(this.angle);
    let clockwise = facing.x * toTarget.y - facing.y * toTarget.x > 0;
    this.arcSide = clockwise ? -1 : 1;
  }

  applyForce(force) {
    this.acceleration.add(force);
  }

  // Turn keyboard / mouse input into a force
  steer() {
    if (this.sinking) return; // Caught in a portal: no more steering
    let force = createVector(0, 0);
    if (keyIsDown(LEFT_ARROW)) force.x -= 1;
    if (keyIsDown(RIGHT_ARROW)) force.x += 1;
    if (keyIsDown(UP_ARROW)) force.y -= 1;
    if (keyIsDown(DOWN_ARROW)) force.y += 1;

    // Steering with the keys takes back control from sailing by itself
    if (force.mag() > 0) this.destination = null;

    // The keys steer relative to the camera, so once it's swung round behind the boat they
    // carry straight on, rather than pushing it back off to the side. Pressing a different
    // key starts afresh.
    let keys = force.x * 3 + force.y;
    if (keys !== this.lastKeys) this.keyTurn = 0;
    this.lastKeys = keys;
    force.rotate(this.keyTurn);

    if (force.mag() === 0 && this.destination) {
      // Sailing by itself: head for the middle of the portal. The boat is drawn a little
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
    } else if (force.mag() === 0 && mouseIsPressed && !this.mouseOverPanel) {
      // No keys? Then holding the mouse down pulls the boat toward it
      let mouse = createVector(mouseX, mouseY);
      force = p5.Vector.sub(mouse, this.position);
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
    this.position.add(p5.Vector.mult(this.velocity, this.dt));
    this.acceleration.mult(0);

    // The camera eases toward the boat: slide the world (and the boat) back
    // by a small part of how far the boat is from home
    // (Keeping up when it's in a hurry, so it doesn't run away up the screen)
    this.scroll = p5.Vector.sub(this.position, this.home).mult(1 - pow(1 - min(0.5, this.followSpeed * this.hurry), this.dt));
    this.position.sub(this.scroll);

    // Turn smoothly to face the direction we're moving
    if (this.velocity.mag() > 0.5) {
      let target = this.velocity.heading();
      let difference = atan2(sin(target - this.angle), cos(target - this.angle)); // The shortest way round
      this.angle += difference * (1 - pow(1 - min(0.5, this.turnSpeed * this.hurry), this.dt));
    }

    this.aimCamera();

    // Keep the boat a sensible size for the window, and shrink it as it moves away up the screen.
    // The ripples are sized by how far down the screen they are, so the boat follows the same rule.
    let depth = this.position.y / this.home.y; // Under 1 = further away than home, over 1 = closer
    let shrink = constrain(1 + (depth - 1) * this.depthShrink, 0.5, 1.5);
    this.length = min(width, height /2, 1100) * 0.59 * shrink;

    // Where the back of the boat meets the water, for the sketch to put its wake ripples
    this.stern = this.toScreen(createVector(-0.45, 0, 0));
    this.stern.add(this.position.x, this.position.y + this.length * 0.12);
    this.bow = this.toScreen(createVector(0.45, 0, 0));
    this.bow.add(this.position.x, this.position.y + this.length * 0.12);
  }

  // How much faster it sails than in a window 900 pixels tall. The distances it sails grow with
  // the window, so its speed does too, but not quite as much, or it looks too fast on a big screen.
  fit() {
    return pow(height / 900, 0.75);
  }

  // The camera stays back at home while the boat eases ahead of it, so it sees the boat
  // from a slightly different angle: further ahead (up the screen) it looks flatter,
  // closer it's seen more from above, and off to one side it's seen slightly turned.
  aimCamera() {
    let offset = p5.Vector.sub(this.position, this.home);
    this.tilt = constrain(this.baseTilt + offset.y * this.cameraSwing, this.baseTilt - 0.18, this.baseTilt + 0.18);
    let turn = constrain(-offset.x * this.cameraSwing, -0.18, 0.18);

    // toScreen() needs these for every point of the boat, so work them out once a frame
    this.cosAngle = cos(this.angle + turn);
    this.sinAngle = sin(this.angle + turn);
    this.cosTilt = cos(this.tilt);
    this.sinTilt = sin(this.tilt);

    // How squashed the water looks compared to when the boat is at rest:
    // under 1 = flatter (camera lower), over 1 = rounder (camera higher).
    // The sketch uses this to squash the ripples the same way as the boat.
    this.squash = this.sinTilt / sin(this.baseTilt);
  }

  // Is the point (x, y) on the water underneath the boat?
  isOver(x, y) {
    // Undo toScreen(): measure from the boat's centre, unsquash the water, unspin
    let dx = (x - this.position.x) / this.length;
    let dy = (y - this.position.y - this.length * 0.12) / this.length / this.sinTilt;
    let along = dx * this.cosAngle + dy * this.sinAngle;
    let across = -dx * this.sinAngle + dy * this.cosAngle;
    // Inside an ellipse about the size of the hull
    return sq(along / 0.5) + sq(across / 0.18) < 1;
  }

  // Where the point (x, y) on the water is compared to the boat, in hull lengths: `along` the
  // boat (-0.5 at the back, 0.5 at the front) and `across` it (positive on the side the
  // sketch's sideways vector points to). Undoes toScreen(), like isOver().
  onHull(x, y) {
    let dx = (x - this.position.x) / this.length;
    let dy = (y - this.position.y - this.length * 0.12) / this.length / this.sinTilt;
    return { along: dx * this.cosAngle + dy * this.sinAngle, across: -dx * this.sinAngle + dy * this.cosAngle };
  }

  // How far the hull reaches out to either side, `along` the boat (in hull lengths)
  widthAt(along) {
    return hullWidth(constrain(along + 0.5, 0, 1), 0.18);
  }

  // The point on the water just outside the hull's edge, `along` the boat: side is 1 or -1
  // for which side (as in the sketch's sideways vector), margin is how far outside the edge
  // (in hull lengths)
  edgePoint(along, side, margin) {
    let point = this.toScreen(createVector(along, side * (this.widthAt(along) + margin), 0));
    return point.add(this.position.x, this.position.y + this.length * 0.12);
  }

  // Where one of the arrow's two wide corners is on the screen (side 1 or -1, as in the
  // sketch's sideways vector), for the wake to start from
  cornerPoint(side) {
    let corner = arrowCorners()[side > 0 ? 1 : 0];
    let point = this.toScreen(createVector(corner.x, corner.y, 0));
    return point.add(this.position.x, this.position.y + this.length * 0.12);
  }

  // Turn a 3D point on the boat into a 2D point on the screen
  toScreen(point) {
    // Spin the point around the boat's centre so it faces this.angle
    let x = point.x * this.cosAngle - point.y * this.sinAngle;
    let y = point.x * this.sinAngle + point.y * this.cosAngle;
    // Look at it from above: the water gets squashed, height goes up the screen
    let screenX = x;
    let screenY = y * this.sinTilt - point.z * this.cosTilt;
    return createVector(screenX * this.length, screenY * this.length);
  }

  show() {
    push();
    translate(this.position.x, this.position.y + this.length * 0.12);
    let weight = max(1.6, this.length * 0.0075);

    // Its reflection in the water, like the gates': upside down, squashed, faint and wobbly.
    // (The arrow lies flat on the water, so its reflection would sit right underneath it.)
    noFill();
    strokeWeight(weight);
    for (let outline of this.shape === 'arrow' ? [] : this.outlines) {
      if (outline.part === 'ripple') continue;
      stroke(flicker(this.colors[outline.part][outline.index], this.reflectionAlpha));
      this.drawWavy(outline, true);
    }

    // The boat itself, drawn the same way as its reflection, the right way up. The arrow is
    // filled in black, so it hides the water's lines underneath it.
    if (this.showHull === 'wavy') {
      if (this.shape === 'arrow') fill(0);
      for (let outline of this.outlines) {
        if (outline.part === 'ripple') continue;
        stroke(flicker(this.colors[outline.part][outline.index], this.wavyAlpha));
        this.drawWavy(outline, false);
      }
      noFill();
    }
    if (this.showHull !== 'solid') {
      pop();
      return;
    }

    // Black silhouette, so anything behind the boat is hidden
    noStroke();
    fill(0);
    for (let outline of this.outlines) {
      if (outline.part === 'ripple') continue; // Keep the water see-through
      this.drawOutline(outline);
    }

    // Then the coloured lines on top
    noFill();
    strokeWeight(weight);
    for (let outline of this.outlines) {
      let c = color(this.colors[outline.part][outline.index]);
      c.setAlpha(outline.alpha);
      stroke(c);
      this.drawOutline(outline);
    }
    pop();
  }

  drawOutline(outline) {
    push();
    if (this.gateCut) this.cutAtGate(outline.points[0].z);
    beginShape();
    for (let point of outline.points) {
      let s = this.toScreen(point);
      vertex(s.x, s.y);
    }
    endShape(CLOSE);
    pop();
  }

  // An outline pushed about by the moving water: sideways by a wave running up and down the
  // screen (like Portal.wobblyVertex()), and up and down by one running across it, so it
  // looks wavy whichever way the boat is facing (from the side, its outlines run across the
  // screen). The further from the waterline, the more it moves. If reflected, it's flipped
  // upside down below the water, as the boat's reflection.
  drawWavy(outline, reflected) {
    push();
    if (this.gateCut) this.cutAtGate(reflected ? 0 : outline.points[0].z); // The reflection is on the water
    beginShape();
    for (let point of outline.points) {
      let z = reflected ? -point.z * this.reflectionDepth : point.z;
      let s = this.toScreen(createVector(point.x, point.y, z));
      let x = s.x + this.position.x; // Where it is on the screen, so the ripples line up with the gates'
      let y = s.y + this.position.y;
      let sideways = sin(y * 0.25 + frameCount * 0.12) + 0.5 * sin(y * 0.6 - frameCount * 0.08);
      let upAndDown = sin(x * 0.25 + frameCount * 0.1) + 0.5 * sin(x * 0.6 - frameCount * 0.07);
      let deep = max(this.surfaceWobble, min(1, point.z / 0.15)); // Least at the waterline, 1 at the top of the cabin (or the bottom of its reflection)
      let amount = this.length * 0.02 * deep * (reflected ? 1 : this.wavyAmount); // The boat itself is steadier than its reflection
      vertex(s.x + sideways * amount, s.y + upAndDown * amount * 0.5); // Less up and down, since the water's seen at a low angle
    }
    endShape(CLOSE);
    pop();
  }

  // While going through a gate, hide the part of an outline that's already through, so the
  // boat looks sliced off by the gate. The gate's line is on the water, so for an outline at
  // height z it shows up that much higher on the screen. (Called with the boat translated
  // to its own position, so everything here is measured from there.)
  cutAtGate(z) {
    let g = this.gateCut;
    let line = g.y - (this.position.y + this.length * 0.12) - z * this.cosTilt * this.length;
    let left = g.left - this.position.x;
    beginClip({ invert: true }); // Draw everywhere except inside this rectangle
    if (g.cameFrom === 1) rect(left, line - height * 2, g.width, height * 2); // Through = up the screen
    else rect(left, line, g.width, height * 2); // Through = down the screen
    endClip();
  }

  // Build every outline once. show() just draws them from the current angle.
  buildModel() {
    let deck = 0.084; // Height of the deck above the water (smaller = flatter boat)

    // A mouse pointer instead: a single outline, flat on the surface of the water
    if (this.shape === 'arrow') {
      this.addOutline(arrowShape().map((p) => createVector(p.x, p.y, 0)), 'hull', 0, 230);
      return;
    }

    let deckShape = hullShape(0.18, 40);

    // Hull: a stack of slices from the deck down to the waterline, each a bit smaller than
    // the one above. However many colours there are, the stack is the same shape.
    let slices = this.colors.hull.length;
    for (let i = 0; i < slices; i++) {
      let down = slices > 1 ? i / (slices - 1) : 0; // 0 at the deck, 1 at the waterline
      this.addOutline(hullSlice(deckShape, down, deck * (1 - down)), 'hull', i, 230);
    }

    // Ripples on the water, getting bigger and fainter
    // for (let i = 0; i < this.colors.ripple.length; i++) {
    //   let grow = 1.12 + i * 0.12;
    //   let points = deckShape.map((p) => createVector(p.x * grow, p.y * (grow + 0.15 * i), -0.01));
    //   this.addOutline(points, 'ripple', i, 110 - i * 22);
    // }

    // Cabin: rounded rectangles, widest at the bottom
    let rings = this.colors.cabin.length;
    for (let i = 0; i < rings; i++) {
      let down = rings > 1 ? i / (rings - 1) : 0; // 0 at the top, 1 at the bottom
      let grow = 0.88 + down * 0.15;
      let z = deck + 0.05 - down * 0.051;
      let points = roundedRect(0.15 * grow, 0.09 * grow, 40).map((p) => createVector(p.x - 0.13, p.y, z));
      this.addOutline(points, 'cabin', i, 230);
    }
  }

  addOutline(points, part, index, alpha) {
    this.outlines.push({ points, part, index, alpha });
  }

  // Show or hide a panel of colour pickers, one for every entry in this.colors
  toggleColorPanel() {
    if (this.panel === null) this.makeColorPanel();
    if (this.panelVisible) {
      this.panel.hide();
      this.mouseOverPanel = false;
    } else {
      this.panel.show();
    }
    this.panelVisible = !this.panelVisible;
  }

  makeColorPanel() {
    this.panel = createDiv();
    this.panel.style('position', 'fixed');
    this.panel.style('top', '70px');
    this.panel.style('right', '16px');
    this.panel.style('z-index', '1000');
    this.panel.style('padding', '10px 12px');
    this.panel.style('background', 'rgba(20, 20, 20, 0.85)');
    this.panel.style('color', '#ddd');
    this.panel.style('font', '12px monospace');
    this.panel.style('border-radius', '6px');
    this.panel.mouseOver(() => (this.mouseOverPanel = true));
    this.panel.mouseOut(() => (this.mouseOverPanel = false));

    for (let part in this.colors) {
      let row = createDiv(part);
      row.parent(this.panel);
      for (let i = 0; i < this.colors[part].length; i++) {
        let picker = createColorPicker(this.colors[part][i]);
        picker.parent(row);
        picker.style('width', '24px');
        picker.input(() => (this.colors[part][i] = picker.value()));
      }
    }

    // Copy the colours, ready to paste back into the constructor
    let copyButton = createButton('Copy colours');
    copyButton.parent(this.panel);
    copyButton.mousePressed(() => navigator.clipboard.writeText(JSON.stringify(this.colors, null, 2)));

    this.panel.hide();
    this.panelVisible = false;
  }
}

// How wide the deck is (from the middle to one side) at t, which goes from the back (0) to
// the front (1): round at the back, pointed at the front, halfWidth at its widest
function hullWidth(t, halfWidth) {
  let widthAt = (t) => pow(t, 0.5) * pow(1 - t, 0.75);
  return (halfWidth * widthAt(t)) / widthAt(0.4);
}

// The outline of the deck, seen from above: round at the back, pointed at the front
function hullShape(halfWidth, steps) {
  let side = [];
  for (let i = 0; i <= steps; i++) {
    let t = (1 - cos((PI * i) / steps)) / 2; // More points near the ends, where it curves most
    side.push(createVector(t - 0.5, hullWidth(t, halfWidth)));
  }
  // Mirror one side to make the other
  let otherSide = side.slice(1, -1).reverse().map((p) => createVector(p.x, -p.y));
  return side.concat(otherSide);
}

// A slice of the hull at height z, `down` of the way from the deck (0) to the waterline (1).
// Lower slices are shorter and narrower, and every slice curves up at the front.
function hullSlice(deckShape, down, z) {
  let lengthScale = 1 - 0.13 * down;
  let widthScale = 1 - 0.3 * down;
  return deckShape.map((p) => {
    let front = max(0, (p.x - 0.1) / 0.4); // 0 until the front part of the boat, then up to 1
    return createVector(-0.2 + (p.x + 0.2) * lengthScale, p.y * widthScale, z + 0.03 * front * front);
  });
}

// The corners of a mouse pointer, in hull lengths, seen from above, pointing forward
// (x = 0.5 at the tip): a straight edge down one side, a slanted edge down the other, and a tail
function arrowGrid() {
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
    return createVector(0.5 - gy / length, (gx / length) * narrow);
  });
}

// The pointer's two wide corners, either side of where the tail starts: [one side, the other]
function arrowCorners() {
  let grid = arrowGrid();
  return [grid[1], grid[6]];
}

// The outline of a mouse pointer (see arrowGrid()), with every edge in small steps
function arrowShape() {
  let grid = arrowGrid();
  // Every edge in small steps, so it can wobble like the rest of the boat
  let points = [];
  for (let i = 0; i < grid.length; i++) {
    let a = grid[i];
    let b = grid[(i + 1) % grid.length];
    let steps = max(2, ceil(p5.Vector.dist(a, b) * 20)); // About one per grid square
    for (let k = 0; k < steps; k++) {
      points.push(p5.Vector.lerp(a, b, k / steps));
    }
  }
  return points;
}

// A rectangle with very rounded corners (a "superellipse")
function roundedRect(halfLength, halfWidth, steps) {
  let points = [];
  for (let i = 0; i < steps; i++) {
    let a = (TWO_PI * i) / steps;
    let x = halfLength * Math.sign(cos(a)) * sqrt(abs(cos(a)));
    let y = halfWidth * Math.sign(sin(a)) * sqrt(abs(sin(a)));
    points.push(createVector(x, y));
  }
  return points;
}
