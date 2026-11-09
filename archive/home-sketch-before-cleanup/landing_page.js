// Full-screen background sketch for the home page ("Wake" - 2019),
// with a boat you can steer. The boat stays in the middle; the ripples move past it.

import p5 from 'p5';
import Boat from './boat.js';
import rippleColor, { isWhite } from './ripple_color.js';
import Portal from './portal.js';
import { depth, flatness } from './perspective.js';

// The friendly-error checker slows every p5 call; it's for development, not the live site.
p5.disableFriendlyErrors = import.meta.env.PROD;

let boat;
let portals = [];
let hintAlpha = 230; // The hint at the bottom of the screen, which fades away

// The wake: a trail of ellipses following the mouse, and the boat when it's moving
let trailLength = 150;
let trailX = [];
let trailY = [];
let trailSize = []; // How big each ripple gets (1 = full size)
let scatteredSize = 0.5; // How big the scattered ripples are while the boat is sailing

function setup() {
  let canvas = createCanvas(windowWidth, windowHeight);
  canvas.position(0, 0);
  canvas.style('z-index', '-1');
  cursor(CROSS);

  boat = new Boat(width / 2, height / 1.5);
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

  // Shift the trail along by one and draw it
  for (let i = 0; i < trailLength - 1; i++) {
    trailX[i] = trailX[i + 1];
    trailY[i] = trailY[i + 1];
    trailSize[i] = trailSize[i + 1];
    if (trailX[i] === undefined) continue; // Trail still filling up

    // The camera follows the boat, so the water slides backward past it
    trailX[i] -= boat.scroll.x;
    trailY[i] -= boat.scroll.y;

    // Ripples the boat sails over disappear
    if (boat.isOver(trailX[i], trailY[i])) {
      trailX[i] = undefined;
      trailY[i] = undefined;
      continue;
    }

    let diameter = sin(map(i, 0, trailLength, 0, PI));
    let fade = sin(map(i, 0, trailLength, 0, HALF_PI));
    let scalar = depth(trailY[i]); // Bigger further down the screen (see perspective.js)

    // Grows and shrinks with the boat, with a little wobble while everything's white
    let weight = boat.wakeWeight();
    strokeWeight(isWhite() ? weight * random(1, 1.1) : weight);
    stroke(rippleColor(i / trailLength, 255 * fade));
    // In perspective, like the boat and portals: squashed more further up the screen,
    // and boat.squash tips the whole view a little as the camera follows the boat
    let rippleWidth = diameter * 200 * scalar * trailSize[i];
    ellipse(trailX[i], trailY[i], rippleWidth, rippleWidth * flatness(trailY[i]) * boat.squash);
  }

  // Add a new point to the end of the trail. While the boat is sailing, every other one goes
  // behind it, and the rest go near the mouse if it's moving, or anywhere (smaller) if not.
  // When the boat's still: near the mouse if it's moving, and anywhere if not.
  let last = trailLength - 1;
  let boatMoving = boat.velocity.mag() > 0.5;
  let mouseMoving = pmouseX != mouseX || pmouseY != mouseY;
  trailSize[last] = 1;
  if (boatMoving && frameCount % 2 === 0) {
    trailX[last] = boat.stern.x + random(-70, 70);
    trailY[last] = boat.stern.y + random(-30, 30);
  } else if (mouseMoving) {
    trailX[last] = mouseX + random(-70, 70);
    trailY[last] = mouseY + random(-30, 30);
  } else {
    trailX[last] = random(width);
    trailY[last] = random(height);
    if (boatMoving) trailSize[last] = scatteredSize;
  }

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
  // Keep the boat in the middle, and move the water along with it so nothing jumps
  let shift = createVector(width / 2 - boat.home.x, height/1.2 - boat.home.y);
  boat.home.add(shift);
  boat.position.add(shift);
  for (let portal of portals) {
    portal.position.add(shift);
  }
  for (let i = 0; i < trailLength; i++) {
    if (trailX[i] === undefined) continue;
    trailX[i] += shift.x;
    trailY[i] += shift.y;
  }
}

function keyPressed() {
  // "c" opens the boat's colour pickers
  if (key === 'c') boat.toggleColorPanel();
  // Stop the arrow keys from scrolling the page while steering
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return false;
}

// This file is a module, so its functions aren't global by default.
// Putting them on window lets p5 find them and run in "global mode".
// Coming back with the browser's Back button can restore the page exactly as it was left,
// with the boat already sucked under, so start it fresh instead
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload();
});

window.setup = setup;
window.draw = draw;
window.windowResized = windowResized;
window.keyPressed = keyPressed;
window.mousePressed = mousePressed;
