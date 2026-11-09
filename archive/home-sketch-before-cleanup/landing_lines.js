// Full-screen background sketch for the home page, another take on "Wake" (2019):
// the water is a series of wavy lines that get closer together into the distance, and
// the boat leaves a wake of lines behind it that pushes the water's lines aside.
// The boat stays near the middle; the water moves past it.

import p5 from 'p5';
import Boat from './boat.js';
import Portal from './portal.js';
import LineWake from './line_wake.js';
import WaterLines from './water_lines.js';

// The friendly-error checker slows every p5 call; it's for development, not the live site.
p5.disableFriendlyErrors = import.meta.env.PROD;

let boat;
let water;
let wake;
let portals = [];
let hintAlpha = 230; // The hint at the bottom of the screen, which fades away

function setup() {
  let canvas = createCanvas(windowWidth, windowHeight);
  canvas.position(0, 0);
  canvas.style('z-index', '-1');
  cursor(CROSS);

  boat = new Boat(width / 2, height / 1.5);
  water = new WaterLines();
  wake = new LineWake();

  // A portal for each page, all just out of sight to start with, spread in an even arc
  // around the top half of the screen (left to right). Tags at the edge of the screen
  // point the way. Sail into one to go to that page.
  let pages = [
    ['/music/', 'music'],
    ['/teaching/', 'teaching'],
    ['/bio/', 'bio'],
    ['/art/', 'art'],
  ];
  for (let i = 0; i < pages.length; i++) {
    // Head out from the middle of the screen at this angle (left = PI, straight up = PI * 1.5)
    let angle = map(i, 0, pages.length - 1, PI + 0.35, TWO_PI - 0.35);
    let direction = p5.Vector.fromAngle(angle);
    // ...to the edge of the screen, then a little further so it starts out of sight
    let toEdge = min(width / 2 / abs(direction.x), height / 2 / abs(direction.y));
    let position = p5.Vector.mult(direction, toEdge + 250).add(width / 2, height / 2);
    portals.push(new Portal(position.x, position.y, pages[i][0], pages[i][1]));
  }
}

function draw() {
  background(0);
  fill(0);

  // The water, with the wake pushing its lines aside, then the wake itself on top
  water.update(boat.scroll, boat.position.y);
  water.pull(boat);
  wake.update(boat.scroll);
  water.show(wake, boat.wakeWeight(), boat.squash);
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

  // Stir up the water at the back of the boat, for next frame's wake
  let sideways = createVector(-boat.sinAngle, boat.cosAngle * boat.sinTilt); // Across the boat, squashed like the water
  wake.emit(boat.stern, sideways, boat.velocity, boat.length * 0.08);

  // A pointing hand over the portals' names, since clicking one sails the boat there
  let overName = portals.some((portal) => portal.isLabelAt(mouseX, mouseY));
  cursor(overName ? HAND : CROSS);

  // A hint at the bottom of the screen, which fades once a name is clicked (or after ten seconds)
  if (boat.destination || frameCount > 600) hintAlpha = max(0, hintAlpha - 4);
  if (hintAlpha > 0) {
    push();
    noStroke();
    fill(255, hintAlpha);
    textAlign(CENTER, BOTTOM);
    textSize(14);
    text('click a name to sail there, or steer with the arrow keys', width / 2, height - 24);
    pop();
  }
}

function mousePressed() {
  // Clicking a portal's name sends the boat sailing there by itself;
  // clicking anywhere else takes back control
  boat.destination = null;
  for (let portal of portals) {
    if (portal.isLabelAt(mouseX, mouseY)) boat.sailTo(portal);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  // Keep the boat where it was on the screen, and move everything on the water along with it
  let shift = createVector(width / 2 - boat.home.x, height / 1.5 - boat.home.y);
  boat.home.add(shift);
  boat.position.add(shift);
  wake.shift(shift);
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
