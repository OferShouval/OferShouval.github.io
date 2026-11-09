// Full-screen background sketch for the music page, another take on "Wake" (2019).
//
// The water is a series of wavy lines (see Water), and the boat, drawn as a mouse pointer (see
// Boat), trails two lines tracing out the V of its wake (see Wake), inside which the water
// flickers in white. The gates to the music pages stand in a row in the distance (see Gate).
// Click one to sail there, or steer with the arrow keys. The boat sails on from below the screen
// at the start, and from then on it stays in much the same place on the screen; the water moves past it.

import p5 from 'p5';
import Boat from './boat.js';
import Gate, { NAME_FONT, spreadTags } from './gate.js';
import Wake from './wake.js';
import Water from './water.js';
import { depth } from './perspective.js';

// The friendly-error checker slows every p5 call; it's for development, not the live site.
p5.disableFriendlyErrors = import.meta.env.PROD;

const PAGES = [
  ['/music/images.html', 'images'],
  ['/music/unfamiliar-state.html', 'recordings'],
  ['/music/videos.html', 'videos'],
  ['/music/contact.html', 'contact'],
];

let boat;
let wake;
let water;
let gates = [];
let hintAlpha = 0; // The hint in the middle of the screen, which fades in slowly once the page has opened, then away
let hintFadeIn = 1.5; // How much brighter it gets each frame, fading in (out of 255)
let hintMost = 210; // How bright it gets (255 = solid; 210 is the same as the gates' names)
let hintShown = 10; // How many seconds it stays, unless a gate's clicked first
let hintGone = false; // Has it started fading away?
// Once the boat's through a gate, the screen fades to black before going to its page (no names on the way)
const BAND_FONT = 'Pixeled 2';
let bandName = 'o. wake';
let gateDarkTime = 1; // How many seconds fading to black takes
// The page opens on black: the band's name fades in and stays, then fades out as
// the water fades in and the boat sails on
let introIn = 0.5; // How many seconds the name takes to fade in
let introHold = 0.6; // ...how many it stays
let introOut = 0.8; //...and how many it takes to fade out, while the water fades in
let introStart = 0; // When the page started, in milliseconds
let introNamed = true; // Is the band's name shown? Only the first time the page opens in a visit; coming back, it just fades up from black
const HINT_FONT = 'Source Code Pro'; // Thin, like the notes on the site's other pages
let hintHeight = 0.5; // How far down the screen it is (0 = the top, 1 = the bottom)
let overGate = false; // Is the mouse over a gate or its name?


// The way home: a tag at the bottom of the screen, like the ones pointing to gates that are off the screen, as
// if home's back the way the boat came. It fades in once the boat's sailed on, and stays. Clicking it turns the
// boat round to sail back off the bottom of the screen, and it all fades to the black of the home page's wormhole.
let homeAlpha = 0; // How much it's showing, from 0 to 1
let homeArea = null; // Where its name was last drawn, so it can be clicked
let homeWhiteLatest = 8; // How many seconds after setting off for home it fades to white anyway, if the boat never quite gets off the screen
let homeWhiteTime = 2.5; // How many seconds that takes
let homeHurry = 1.3; // How many times its usual speed the boat sails home

// The row of gates in the distance
let rowY = 90; // How far down the screen the row is, when it's furthest away (see fitToWindow())
let rowForward = 0; // How far the boat has sailed toward it (0 = at the start, can't go back further)
let rowSideways = 0; // How far the boat has sailed to the side of the middle of the row
let rowReach = 1.5; // How far the boat can sail to the side of the middle of the row, in widths of the screen: far enough that every gate has gone off it
let rowGateWidth = 26; // How wide (in pixels) a gate is in the row, when it's furthest away (see fitToWindow())
let gateAtBoat = 1.4; // How wide a gate is when it reaches the boat, compared to the boat's length

// Sailing to a gate that's been clicked
let sailTime = 5; // How many seconds it takes the boat to reach it (see fitToWindow(); going through it takes a moment more)
let sailStart = null; // When it set off, in milliseconds
let sailPeak = 1; // The fastest it's gone on this trip, compared to its usual speed
let easeDistance = 0.25; // How far from the gate it starts easing down, compared to the height of the screen
let easeTime = 1.5; // Roughly how long easing down takes, in seconds
let easeTo = 0.4; // How fast it's going when it reaches the gate, compared to its fastest

// The camera swinging round behind the boat
let cameraSpeed = 0.015; // How quickly it swings round, when the boat's heading diagonally
let cameraEase = 0.05; // How gradually it starts and stops swinging (smaller = gentler)
let cameraDeadZone = 0.2; // Heading closer to sideways than this (0 to 1), the camera doesn't move
let cameraTurn = 0; // How fast it's swinging right now, in radians per frame

let wakeLength = 0.9; // How long the wake is, compared to the height of the screen
let arriveFrom = 0.3; // How far below the bottom of the screen the boat starts, sailing on, compared to the screen's height
let boatHome = 0.7; // How far down the screen the camera keeps the boat, which leaves the water behind it in view

// The sketch fills the window below the navbar
function navbarBottom() {
  let navbar = document.querySelector('.navbar');
  return navbar ? Math.ceil(navbar.getBoundingClientRect().bottom) : 0;
}

function setup() {
  let top = navbarBottom();
  let canvas = createCanvas(windowWidth, windowHeight - top);
  canvas.position(0, top);
  canvas.style('z-index', '-1');
  cursor(CROSS);
  document.fonts.load(`16px "${NAME_FONT}"`); // Nothing else on the page uses the gates' font, so ask for it
  document.fonts.load(`200 14px "${HINT_FONT}"`); // ...or the hint's
  new FontFace(BAND_FONT, 'url("/media/Pixeled%202.ttf")').load().then((font) => document.fonts.add(font)); // The band's name, in the gates (see showArrival())

  boat = new Boat(width / 2, height * boatHome);
  introStart = millis();
  try {
    if (sessionStorage.getItem('musicIntroShown')) {
      introNamed = false;
      introIn = introHold = 0;
    }
    sessionStorage.setItem('musicIntroShown', '1');
  } catch {}
  boat.sailOn(height * arriveFrom, introIn + introHold);
  wake = new Wake();
  water = new Water();

  PAGES.forEach(([url, label], i) => {
    let gate = new Gate(url, label, placeGate);
    gate.inRow = ((i + 0.5) / PAGES.length - 0.5) * 2; // Where in the row: -1 is the left of the screen, 1 the right
    gates.push(gate);
  });
  fitToWindow();
}

// Sizes that depend on the window
function fitToWindow() {
  // The water's lines are further apart on a tall screen (each is this much as far down the
  // screen as the one below it)
  water.ratio = 1 - 0.046 * Math.max(1, height / 900);
  // A little more time to sail there on a big screen, which keeps its speed closer to a small
  // screen's (it never takes more than about 7 seconds, going through the gate included)
  sailTime = constrain(map(height, 500, 1440, 4.8, 5.8), 4.8, 5.8);
  // The row's a shorter trip away on a tall screen, for the same reason
  rowY = Math.max(90, height * 0.1);
  // The wake is the same share of the screen on any window, at any speed
  wake.maxLength = height * wakeLength;
  // The gates in the distance are smaller on a small screen, down to a limit
  rowGateWidth = 26 * constrain(Math.min(width / 1440, height / 900), 0.5, 1);
}

// Where a gate is on the screen. The whole row grows and spreads out from the middle of the
// screen by the same amount (rowScale) as the boat sails toward it, so the gate it's heading
// for grows and centres, and the others slide off the sides.
function placeGate(gate) {
  let scale = rowScale();
  gate.position.set(width / 2 + (gate.inRow * (width / 2) - rowSideways) * scale, rowY * scale);

  // Its size: growing from rowGateWidth in the distance to gateAtBoat times the length of the
  // boat by the time it reaches the boat, at an even rate, whatever the size of the window
  let growth = Math.log((gateAtBoat * boat.length) / rowGateWidth) / Math.log(boat.waterY() / rowY);
  let wide = rowGateWidth * pow(gate.position.y / rowY, growth);
  gate.gateWidth = wide / depth(gate.position.y); // Gate scales this back down by depth()
}

// How much bigger the row is than when it's furthest away (1)
function rowScale() {
  return Math.exp(rowForward);
}

// Follow the boat: forward at the same rate as the water's lines (which move in proportion to
// how far down the screen they are), and sideways, on past the ends of the row
function moveRow() {
  rowForward = Math.max(0, rowForward - boat.scroll.y / boat.waterY());
  rowSideways = constrain(rowSideways + boat.scroll.x, -width * rowReach, width * rowReach);
}

function draw() {
  background(0);
  moveRow();
  swingCamera();
  hurryToGate();

  // The water, with the wake pushing its lines aside, then the edges of the dark water on top
  water.update(boat.scroll, boat.position.y);
  water.pull(boat);
  wake.update(boat.scroll, boat);
  water.show(wake, boat);
  water.showEdges(wake, boat);

  // Update the gates, then draw the ones further away than the boat (higher up the screen)
  // behind it, and the nearer ones in front of it, so the boat can sail behind a gate
  for (let gate of gates) gate.update(boat);
  let boatOnWater = boat.waterY();
  for (let gate of gates) {
    if (gate.position.y <= boatOnWater) gate.show(boat);
  }
  boat.run();
  for (let gate of gates) {
    if (gate.position.y > boatOnWater) gate.show(boat);
  }
  for (let gate of gates) gate.findTag();
  spreadTags(gates);
  for (let gate of gates) gate.showTag();

  // Stir up the water for next frame's wake (at no more than the boat's usual speed, so the
  // wake doesn't fan out wildly when it's in a hurry)
  wake.emit(boat, boat.velocity.copy().limit(boat.maxspeed * boat.fit()));

  showHome();
  fadeHome();
  showArrival();
  showIntro();

  // A pointing hand over the gates and their names, since clicking one sails the boat there
  let over = gates.some((gate) => gate.isLabelAt(mouseX, mouseY) || gate.isGateAt(mouseX, mouseY)) || isHomeAt(mouseX, mouseY);
  if (over !== overGate) {
    overGate = over;
    cursor(over ? HAND : CROSS);
  }

  // A hint in the middle of the screen, which fades once a gate is clicked (or after ten seconds)
  // ...once the page has opened
  let sinceOpened = (millis() - introStart) / 1000 - introIn - introHold - introOut;
  if (boat.destination || sinceOpened > hintShown) hintGone = true;
  if (hintGone) hintAlpha = Math.max(0, hintAlpha - 4);
  else if (sinceOpened > 0) hintAlpha = Math.min(hintMost, hintAlpha + hintFadeIn);
  if (hintAlpha > 0) showHint(width / 2, height * hintHeight);
}

// The hint, in the thin monospace font the site uses for small notes, on two lines, in a box that
// keeps it readable over the water (like the sketchbook's captions)
function showHint(x, y) {
  let lines = ['click to sail', 'arrow keys to steer'];
  let leading = 20;
  push();
  textFont(HINT_FONT);
  textSize(14);
  textWeight(200);
  textAlign(CENTER, CENTER);
  let w = Math.max(...lines.map((line) => textWidth(line))) + 24;
  let h = leading * lines.length + 12;
  stroke(204, hintAlpha); // The same light grey as the navbar's border
  strokeWeight(1);
  fill(23, (hintAlpha / hintMost) * 110);
  rect(x - w / 2, y - h / 2, w, h);
  noStroke();
  fill(255, hintAlpha);
  lines.forEach((line, i) => text(line, x, y + (i - (lines.length - 1) / 2) * leading));
  pop();
}

// After going through a gate: the screen fades to black, and then it's that gate's page
function showArrival() {
  let gate = gates.find((gate) => gate.doneAt);
  if (!gate) return;
  let t = (millis() - gate.doneAt) / 1000;
  showNames(ease(constrain(t / gateDarkTime, 0, 1)), 0);
  if (t > gateDarkTime && !gate.left) {
    gate.left = true;
    window.location.href = gate.url;
  }
}

// The page opening: the name on black, then the name and the black fading out together (see introIn)
function showIntro() {
  let t = (millis() - introStart) / 1000;
  if (t > introIn + introHold + introOut) return;
  let out = ease(constrain((t - introIn - introHold) / introOut, 0, 1));
  showNames(1 - out, !introNamed ? 0 : t < introIn ? ease(t / introIn) : 1 - out);
}

// Is the page still opening, before the black's begun to lift?
function opening() {
  return (millis() - introStart) / 1000 < introIn + introHold;
}

// Smooth at both ends, for fading
function ease(amount) {
  return amount * amount * (3 - 2 * amount);
}

// Black over everything, by `dark` (0 to 1), and the band's name in outline, with `label` under it if
// there is one, by `names`
function showNames(dark, names, label) {
  push();
  noStroke();
  fill(0, dark * 255);
  rect(0, 0, width, height);
  textAlign(CENTER, CENTER);
  let size = constrain(width * 0.07, 32, 80);
  if (document.fonts.check(`16px "${BAND_FONT}"`)) {
    textFont(BAND_FONT);
    textSize(size);
    noFill();
    stroke(255, names * 255);
    strokeWeight(1);
    text(bandName, width / 2, label ? height / 2 - size * 0.3 : height / 2);
  }
  if (label) {
    textFont(NAME_FONT);
    textSize(constrain(size * 0.35, 16, 26));
    noStroke();
    fill(255, names * 255);
    text(label, width / 2, height / 2 + size * 0.75);
  }
  pop();
}

// The way home, drawn like a gate's tag (see Gate.showTag()): an arrow pointing down off the screen,
// with its name above it
function showHome() {
  if (!boat.arriving) homeAlpha = Math.min(1, homeAlpha + 0.02);
  if (homeAlpha < 0.01) {
    homeArea = null;
    return;
  }
  let x = width / 2;
  let y = height - 30;
  let hovered = isHomeAt(mouseX, mouseY) || boat.leaving;
  push();
  noStroke();
  fill(255, 220 * homeAlpha);
  triangle(x, y + 16, x - 4, y, x + 4, y);

  textFont(NAME_FONT);
  textSize(16);
  textAlign(CENTER, CENTER);
  let w = textWidth('home');
  let nameY = y - 18;
  fill(255, (hovered ? 255 : 210) * homeAlpha);
  text('home', x, nameY);
  stroke(255, (hovered ? 255 : 130) * homeAlpha);
  strokeWeight(1);
  line(x - w / 2, nameY + 11, x + w / 2, nameY + 11);
  pop();
  homeArea = { left: x - w / 2 - 12, right: x + w / 2 + 12, top: nameY - 20, bottom: height };
}

// Is (x, y) on the way home, while it's showing?
function isHomeAt(x, y) {
  let a = homeArea;
  return a !== null && homeAlpha > 0.5 && x > a.left && x < a.right && y > a.top && y < a.bottom;
}

// Once the boat's all the way off the bottom of the screen on its way home, everything fades to black, and then
// it's the home page
function fadeHome() {
  if (!boat.leaving) return;
  let off = boat.stern.y > height + boat.length * 0.05 || millis() - boat.leaving.at > homeWhiteLatest * 1000;
  if (off && !boat.leaving.whiteFrom) boat.leaving.whiteFrom = millis();
  if (!boat.leaving.whiteFrom) return;
  let white = constrain((millis() - boat.leaving.whiteFrom) / 1000 / homeWhiteTime, 0, 1);
  push();
  noStroke();
  fill(0, white * white * (3 - 2 * white) * 255);
  rect(0, 0, width, height);
  pop();
  if (white >= 1 && !boat.leaving.gone) {
    boat.leaving.gone = true;
    window.location.href = '/';
  }
}

// Set the boat's speed to reach the gate it's been sent to in time: however far is left to
// sail (forward, and to the side), over however long is left, easing down as it nears the gate
function hurryToGate() {
  if (!boat.destination) {
    boat.hurry = boat.leaving ? homeHurry : 1;
    sailStart = null;
    sailPeak = 1;
    return;
  }
  if (boat.sinking) return; // Going through: keep the same speed
  if (sailStart === null) sailStart = millis();
  let gate = boat.destination.position;
  let boatY = boat.waterY();
  let forward = Math.max(0, Math.log(boatY / gate.y)) * boatY;
  let sideways = Math.abs(gate.x - boat.position.x) / rowScale();
  let left = Math.hypot(forward, sideways);
  let easeFrom = height * easeDistance;

  if (left > easeFrom) {
    // Getting there: fast enough to reach where it starts easing down in time
    let timeLeft = Math.max(0.3, sailTime - easeTime - (millis() - sailStart) / 1000);
    let needed = (left - easeFrom) / (timeLeft * 60); // Pixels every 60th of a second
    // (Never slowing down on the way, or it would lurch)
    sailPeak = Math.max(sailPeak, needed / (boat.maxspeed * boat.fit()));
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
  if (boat.sinking || boat.leaving) {
    cameraTurn = 0;
    return;
  }
  let wanted = 0;
  if (boat.velocity.mag() > 0.5) {
    let heading = boat.velocity.heading();
    let upOrDown = sin(heading); // -1 = straight up the screen (away), 1 = straight down (toward us)
    let steepness = constrain((Math.abs(upOrDown) - cameraDeadZone) / 0.3, 0, 1);
    let target = upOrDown < 0 ? -HALF_PI : HALF_PI;
    wanted = atan2(sin(target - heading), cos(target - heading)) * cameraSpeed * steepness;
  }
  // Ease into it and out of it, rather than starting and stopping all at once
  cameraTurn = lerp(cameraTurn, wanted, cameraEase);
  let turn = cameraTurn * boat.dt;
  if (Math.abs(turn) < 0.00001) return;

  // Slide the row (unless it's as far as it goes: then there's nothing more to swing round to)
  let boatX = boat.position.x;
  let boatY = boat.waterY();
  let slid = rowSideways - ((boatY - rowY * rowScale()) * turn) / rowScale();
  if (Math.abs(slid) > width * rowReach) {
    cameraTurn = 0;
    return;
  }
  rowSideways = slid;

  boat.velocity.rotate(turn);
  boat.angle += turn;
  boat.keyTurn += turn;
  let c = Math.cos(turn);
  let s = Math.sin(turn);
  for (let line of wake.lines) {
    for (let particle of line) {
      let p = particle.position;
      let v = particle.velocity;
      let dx = p.x - boatX;
      let dy = p.y - boatY;
      p.x = boatX + dx * c - dy * s;
      p.y = boatY + dx * s + dy * c;
      let vx = v.x;
      v.x = vx * c - v.y * s;
      v.y = vx * s + v.y * c;
    }
  }
}

function mousePressed() {
  if (boat.leaving || opening()) return; // On its way home already, or the page hasn't opened yet
  if (isHomeAt(mouseX, mouseY)) {
    boat.goHome(width / 2);
    return;
  }
  // Clicking a gate or its name sends the boat sailing there by itself;
  // clicking anywhere else takes back control
  boat.destination = null;
  for (let gate of gates) {
    if (gate.isLabelAt(mouseX, mouseY) || gate.isGateAt(mouseX, mouseY)) boat.sailTo(gate);
  }
}

function windowResized() {
  let top = navbarBottom();
  resizeCanvas(windowWidth, windowHeight - top);
  select('canvas').position(0, top);
  fitToWindow();
  // Keep the boat where it was on the screen, and move everything on the water along with it
  let shift = createVector(width / 2 - boat.home.x, height * boatHome - boat.home.y);
  boat.home.add(shift);
  boat.position.add(shift);
  wake.shift(shift);
}

function keyPressed() {
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
