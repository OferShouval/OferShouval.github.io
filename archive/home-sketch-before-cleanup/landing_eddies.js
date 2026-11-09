// Full-screen background sketch for the home page, another take on "Wake" (2019):
// the water is a series of wavy lines that get closer together into the distance (see
// WaterLines), and the boat's wake is two lines tracing its outline (see LineWake) that push
// the water's lines aside, with bubbles pouring out between them. The boat stays near the
// middle; the water moves past it.

import p5 from 'p5';
import Boat from './boat.js';
import Portal from './portal.js';
import LineWake from './line_wake.js';
import WaterLines from './water_lines.js';
import rippleColor, { isWhite } from './ripple_color.js';
import { depth, flatness } from './perspective.js';

// The friendly-error checker slows every p5 call; it's for development, not the live site.
p5.disableFriendlyErrors = import.meta.env.PROD;

let boat;
let wake;
let water;
let portals = [];
let hintAlpha = 230; // The hint at the bottom of the screen, which fades away

// The bubbles behind the boat, filling the V between the two sides of the wake: little
// ripples that swell and shrink, a few new ones every frame while the boat is moving. Each is thrown outward
// at its own speed and slowed by drag, like the wake's lines, so they fan out. Oldest first.
let bubbleLife = 140; // How many frames a bubble lasts (as long as the wake's lines, so they fill the V all the way back)
let bubbleSize = 12; // How wide (in pixels) a bubble gets at its biggest, near the bottom of the screen
let bubblesPerFrame = 0; // 0 = no bubbles
let bubbleSpread = 1.6; // How hard the outermost bubbles are thrown sideways, compared to the boat's speed
let bubbleAlpha = 100; // How bright they are, like the boat's reflection (255 = solid)
let bubbles = []; // { position, velocity, born }

// The row of gates in the distance
let rowY = 110; // How far down the screen the row is, when it's furthest away (see fitToWindow())
let rowForward = 0; // How far the boat has sailed toward it (0 = at the start, can't go back further)
let rowSideways = 0; // How far the boat has sailed to the side of the middle of the row
let rowGateWidth = 26; // How wide (in pixels) a gate is in the row, when it's furthest away (see fitToWindow())
let sailTime = 3; // How many seconds clicking a name takes the boat to reach that gate (see fitToWindow(); going through it takes a moment more)
let sailStart = null; // When it set off, in milliseconds
let sailPeak = 1; // The fastest it's gone on this trip, compared to its usual speed
let easeDistance = 0.25; // How far from the gate it starts easing down, compared to the height of the screen
let easeTime = 1.5; // Roughly how long easing down takes, in seconds
let easeTo = 0.4; // How fast it's going when it reaches the gate, compared to its fastest
let cameraSpeed = 0.015; // How quickly the camera swings round behind (or in front of) the boat when it's heading diagonally
let cameraEase = 0.05; // How gradually it starts and stops swinging (smaller = gentler)
let cameraDeadZone = 0.2; // Heading closer to sideways than this (0 to 1), the camera doesn't move
let cameraTurn = 0; // How fast it's swinging right now, in radians per frame
let wakeLength = 0.38; // How long the wake is, compared to the height of the screen
let gateAtBoat = 1.4; // How wide a gate is when it reaches the boat, compared to the boat's length

function setup() {
  let canvas = createCanvas(windowWidth, windowHeight);
  canvas.position(0, 0);
  canvas.style('z-index', '-1');
  cursor(CROSS);

  boat = new Boat(width / 2, height / 1.5);
  wake = new LineWake();
  wake.stayOnScreen = true; // The whole of the wake is always in view
  water = new WaterLines();
  water.sternBubbles = 0; // The sketch pours out its own bubbles (see showBubbles())
  // Under the wake, the water's lines are only black or flickers of colour
  water.flickerBack = true;
  water.springBack = 0.97; // How quickly lines the boat has dragged settle back (smaller = faster)

  boat.cameraSwing = 0; // The view stays put: everything's worked out from the row of gates (see placeGate())

  // A portal for each page, in a row in the distance, evenly across the screen. As the boat
  // nears them they grow and spread out (see placeGate()). Sail into one to go to that page.
  let pages = [
    ['/music/', 'music'],
    ['/art/', 'art'],
    ['/teaching/', 'teaching'],
    ['/bio/', 'bio'],
  ];
  pages.forEach(([url, label], i) => {
    let portal = new Portal(width / 2, rowY, url, label);
    portal.inRow = ((i + 0.5) / pages.length - 0.5) * 2; // Where in the row: -1 is the left of the screen, 1 the right
    portal.place = placeGate;
    portal.outlines = 1; // A single line
    portal.brightness = 255;
    portal.thinInDistance = true; // As thin as the water's lines at its height
    portals.push(portal);
  });
  fitToWindow();
}

// Sizes that depend on the window
function fitToWindow() {
  // The water's lines are further apart on a tall screen (each is this much as far down the
  // screen as the one below it)
  water.ratio = 1 - 0.05 * max(1, height / 900);
  // A little more time to sail there on a big screen, which keeps its speed closer to a small
  // screen's (it never takes more than about 7 seconds, going through the gate included)
  sailTime = constrain(map(height, 500, 1440, 4.8, 5.8), 4.8, 5.8);
  // The row's a shorter trip away on a tall screen, for the same reason
  rowY = max(110, height * 0.122);
  // The wake is the same share of the screen on any window, at any speed
  wake.maxLength = height * wakeLength;
  // The gates in the distance are smaller on a small screen, down to a limit
  rowGateWidth = 26 * constrain(min(width / 1440, height / 900), 0.5, 1);
}

// Where a gate is on the screen. The whole row grows and spreads out from the middle of the
// screen by the same amount (rowScale) as the boat sails toward it, so the gate it's heading
// for grows and centres, and the others slide off the sides.
function placeGate(portal) {
  let x = portal.inRow * (width / 2) - rowSideways;
  portal.position.set(width / 2 + x * rowScale(), rowY * rowScale());

  // Its size: growing from rowGateWidth in the distance to gateAtBoat times the length of the
  // boat by the time it reaches the boat, at an even rate, whatever the size of the window
  let boatY = boat.position.y + boat.length * 0.12;
  let growth = Math.log((gateAtBoat * boat.length) / rowGateWidth) / Math.log(boatY / rowY);
  let wide = rowGateWidth * pow(portal.position.y / rowY, growth);
  portal.gateWidth = wide / depth(portal.position.y); // Portal scales this back down by depth()
}

// How much bigger the row is than when it's furthest away (1)
function rowScale() {
  return exp(rowForward);
}

// Follow the boat: forward at the same rate as the water's lines (which move in proportion to
// how far down the screen they are), and sideways, keeping to the width of the row
function moveRow() {
  rowForward = max(0, rowForward - boat.scroll.y / (boat.position.y + boat.length * 0.12));
  rowSideways = constrain(rowSideways + boat.scroll.x, -width / 2, width / 2);
}

function draw() {
  background(0);
  moveRow();
  swingCamera();
  hurryToGate();
  fill(0);

  // The water, with the wake pushing its lines aside, then the bubbles and the wake on top
  water.update(boat.scroll, boat.position.y);
  water.pull(boat);
  wake.update(boat.scroll, boat);
  water.show(wake, boat.wakeWeight(), boat.squash);
  showBubbles();
  wake.show(boat.wakeWeight());

  // Update the gates, then draw the ones further away than the boat (higher up the screen)
  // behind it, and the nearer ones in front of it, so the boat can sail behind a gate
  for (let portal of portals) {
    portal.update(boat);
  }
  let boatOnWater = boat.position.y + boat.length * 0.12;
  for (let portal of portals) {
    if (portal.position.y <= boatOnWater) portal.show(boat);
  }
  boat.run();
  for (let portal of portals) {
    if (portal.position.y > boatOnWater) portal.show(boat);
  }
  for (let portal of portals) {
    portal.showTag();
  }

  // Stir up the water down the sides of the boat, for next frame's wake, and pour out
  // bubbles behind it
  let sideways = createVector(-boat.sinAngle, boat.cosAngle * boat.sinTilt); // Across the boat, squashed like the water
  // (At no more than its usual speed, so the wake doesn't fan out wildly when it's in a hurry)
  wake.emit(boat.stern, sideways, boat.velocity.copy().limit(boat.maxspeed * boat.fit()), boat.length * 0.08, boat);
  if (boat.velocity.mag() > 0.5) {
    // Anywhere across the gap between the two sides of the wake, just behind the stern
    let gap = boat.widthAt(wake.hullTo) * boat.length * 0.8;
    let speed = boat.velocity.mag();
    for (let k = 0; k < bubblesPerFrame; k++) {
      let across = random(-1, 1);
      let position = p5.Vector.add(boat.stern, p5.Vector.mult(sideways, across * gap));
      let velocity = p5.Vector.mult(sideways, across * speed * bubbleSpread).add(p5.Vector.mult(boat.velocity, 0.2));
      bubbles.push({ position, velocity, born: frameCount });
    }
  }

  // A pointing hand over the portals and their names, since clicking one sails the boat there
  let overName = portals.some((portal) => portal.isLabelAt(mouseX, mouseY) || portal.isGateAt(mouseX, mouseY));
  cursor(overName ? HAND : CROSS);

  // A hint at the bottom of the screen, which fades once a name is clicked (or after ten seconds)
  if (boat.destination || frameCount > 600) hintAlpha = max(0, hintAlpha - 4);
  if (hintAlpha > 0) {
    push();
    noStroke();
    fill(255, hintAlpha);
    textAlign(CENTER, BOTTOM);
    textSize(14);
    text('click a gate to sail there, or steer with the arrow keys', width / 2, height - 24);
    pop();
  }
}

function showBubbles() {
  bubbles = bubbles.filter((b) => frameCount - b.born < bubbleLife);
  let weight = boat.wakeWeight();
  for (let b of bubbles) {
    // Fanning out and slowing down, like the wake's lines, and sliding back with the water
    b.velocity.mult(wake.drag);
    b.position.add(b.velocity);
    b.position.sub(boat.scroll);
    if (boat.isOver(b.position.x, b.position.y)) continue; // Hidden under the boat

    let age = (frameCount - b.born) / bubbleLife; // 0 = just made, 1 = about to disappear
    let diameter = sin(age * PI); // Swells up, then shrinks away
    let fade = sin((1 - age) * HALF_PI);
    strokeWeight(isWhite() ? weight * random(1, 1.1) : weight);
    stroke(rippleColor(age, bubbleAlpha * fade));
    let w = diameter * bubbleSize * depth(b.position.y);
    ellipse(b.position.x, b.position.y, w, w * flatness(b.position.y) * boat.squash); // Too small to need a wavy edge
  }
}

// Set the boat's speed to reach the gate it's been sent to in time: however far is left to
// sail (forward, and to the side), over however long is left, easing down as it nears the gate
function hurryToGate() {
  if (!boat.destination) {
    boat.hurry = 1;
    sailStart = null;
    sailPeak = 1;
    return;
  }
  if (boat.sinking) return; // Going through: keep the same speed
  if (sailStart === null) sailStart = millis();
  let gate = boat.destination.position;
  let boatY = boat.position.y + boat.length * 0.12;
  let forward = max(0, Math.log(boatY / gate.y)) * boatY;
  let sideways = abs(gate.x - boat.position.x) / rowScale();
  let left = Math.hypot(forward, sideways);
  let easeFrom = height * easeDistance;

  if (left > easeFrom) {
    // Getting there: fast enough to reach where it starts easing down in time
    let timeLeft = max(0.3, sailTime - easeTime - (millis() - sailStart) / 1000);
    let needed = (left - easeFrom) / (timeLeft * 60); // Pixels every 60th of a second
    // (Never slowing down on the way, or it would lurch)
    sailPeak = max(sailPeak, needed / (boat.maxspeed * boat.fit()));
    boat.hurry = sailPeak;
  } else {
    // Nearly there: easing down, gently at first
    let eased = constrain(left / easeFrom, 0, 1);
    boat.hurry = sailPeak * lerp(easeTo, 1, eased * eased * (3 - 2 * eased));
  }
}

// Swing the camera round toward being behind the boat (or in front of it, if it's heading
// toward us) when it's heading diagonally, so it ends up sailing straight away or straight
// toward us. Everything else turns the other way around it: the boat's heading and its wake,
// and the row of gates, which all share a height, so turning just slides them sideways.
function swingCamera() {
  // Hold still while the boat's going through a gate, so the gate stays put around it
  if (boat.sinking) {
    cameraTurn = 0;
    return;
  }
  let wanted = 0;
  if (boat.velocity.mag() > 0.5) {
    let heading = boat.velocity.heading();
    let upOrDown = sin(heading); // -1 = straight up the screen (away), 1 = straight down (toward us)
    let steepness = constrain((abs(upOrDown) - cameraDeadZone) / 0.3, 0, 1);
    let target = upOrDown < 0 ? -HALF_PI : HALF_PI;
    wanted = atan2(sin(target - heading), cos(target - heading)) * cameraSpeed * steepness;
  }
  // Ease into it and out of it, rather than starting and stopping all at once
  cameraTurn = lerp(cameraTurn, wanted, cameraEase);
  let turn = cameraTurn * boat.dt;
  if (abs(turn) < 0.00001) return;

  // Slide the row (unless it's as far as it goes: then there's nothing more to swing round to)
  let boatY = boat.position.y + boat.length * 0.12;
  let slid = rowSideways - ((boatY - rowY * rowScale()) * turn) / rowScale();
  if (abs(slid) > width / 2) {
    cameraTurn = 0;
    return;
  }
  rowSideways = slid;

  boat.velocity.rotate(turn);
  boat.angle += turn;
  boat.keyTurn += turn;
  for (let line of wake.lines.concat(wake.hullLines)) {
    for (let particle of line) {
      particle.position.sub(boat.position.x, boatY).rotate(turn).add(boat.position.x, boatY);
      particle.velocity.rotate(turn);
    }
  }
}

function mousePressed() {
  // Clicking a portal or its name sends the boat sailing there by itself;
  // clicking anywhere else takes back control
  boat.destination = null;
  for (let portal of portals) {
    if (portal.isLabelAt(mouseX, mouseY) || portal.isGateAt(mouseX, mouseY)) boat.sailTo(portal);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  fitToWindow();
  // Keep the boat where it was on the screen, and move everything on the water along with it
  let shift = createVector(width / 2 - boat.home.x, height / 1.5 - boat.home.y);
  boat.home.add(shift);
  boat.position.add(shift);
  wake.shift(shift);
  for (let b of bubbles) {
    b.position.add(shift);
  }
  for (let portal of portals) {
    portal.position.add(shift);
  }
}

function keyPressed() {
  // "c" opens the boat's colour pickers
  if (key === 'c') boat.toggleColorPanel();
  // Stop the arrow keys from scrolling the page while steering
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return false;
}

// Coming back with the browser's Back button can restore the page exactly as it was left,
// with the boat already gone through a gate, so start it fresh instead
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload();
});

// This file is a module, so its functions aren't global by default.
// Putting them on window lets p5 find them and run in "global mode".
window.setup = setup;
window.draw = draw;
window.windowResized = windowResized;
window.keyPressed = keyPressed;
window.mousePressed = mousePressed;
