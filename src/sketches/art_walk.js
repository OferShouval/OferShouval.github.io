// Full-screen landing sketch for the home page and the art section, grown out of a week 6 homework (archive/week 6):
// a crowd of stick figures walks across the screen, laid out like the water on the music page
// (see music/water.js). They walk in rows that get closer together toward the horizon, so the crowd
// stretches away into the distance. It starts with very few of them, and more arrive as time goes on.
//
// A figure's feet are below the horizon by the camera's height at that figure's size. The view
// is warped so that the ground curls upward as it goes away from the camera, like a road rising
// up a wall: the further away, the more it lifts, and the more the figures tip back with it.
//
// There's a mouse to steer around, and the camera follows it, sliding sideways and moving along the
// ground. The rows are spaced so that moving along the ground just makes everything bigger or
// smaller by the same amount (see view).
//
// The figures are a walk cycle painted with a p5.brush brush when the page starts (see
// brush_frames.js). There can be thousands of them, so everything about each one that doesn't
// change is worked out once (see buildCrowd()), and each frame only works out where they've got to.

import p5 from 'p5';
import { paintSheets, paintHoles, paintSigns, paintMouse, paintMouseFace, holeMargin, signMargin, frameWidth, frameHeight, feetX, feetY, steps } from './brush_frames.js';
import { mouseWidth, mouseHeight, mouseFeetX, mouseFeetY, mouseSteps, mouseStride, mouseViews, mouseSitting, mouseLowering, mouseWalking, mouseActions } from './mouse.js';

// The friendly-error checker slows every p5 call; it's for development, not the live site.
p5.disableFriendlyErrors = import.meta.env.PROD;

let horizon = 0.45; // How far down the screen the horizon is (0 = the top, 1 = the bottom)
let cameraHeight = 375; // How high off the ground the camera is, in the frames' own pixels (a figure is about 150 tall). It dips lower while the mouse is still (see pushCamera())
let cameraHeightUsual = cameraHeight;
let curl = 0.1; // How much the ground curls upward with distance, as a fraction of the screen's height (0 = flat)
let curlTip = 0.12; // How much the figures tip back as the ground curls, so they look shorter in the distance (0 = not at all)
let ratio = 0.9; // Each row is this much the size of the one in front of it (smaller = bunch up faster)
let furthestSize = 0.005; // The rows carry on until they reach the top of the screen, or get this small, per 900 pixels of window height
let spacing = 260; // How far apart the figures in a row are on average, in the frames' own pixels
let rowJitter = 1.2; // How far forward or back of its row a figure can stray, in gaps between rows
let walkSpeed = [60, 180]; // The slowest and fastest a figure can walk, in the frames' own pixels per second
let stride = 7.5; // How far a planted foot slides back each frame of the walk cycle, in the frames' own pixels
let offScreen = 100; // How far past the side of the screen a figure goes before wrapping round, in the frames' own pixels
// Nobody starts inside this arc when the page opens: it rises from the bottom of the screen, over the mouse
let crowdGapWide = 0.21; // How far out to each side it meets the bottom of the screen, as a share of the screen's width
let crowdGapTall = 0.25; // How far up it goes in the middle, as a share of the screen's height
let crowdOpening = true; // Is the first frame still being drawn?
let crowdFade = 0.6; // How many seconds someone takes to fade in when they arrive
let crowdFirst = 0.03; // The share of the crowd that's there when the page opens (1 = everyone)
let crowdFillTime = 3; // How many seconds until everyone's arrived
let crowdHere = crowdFirst; // The share of the crowd that's allowed on now (see draw())
let crowdStarted = null; // When the first frame was drawn, in seconds, since painting the crowd takes a while
let alpha = 0.9; // How solid the figures are, near the bottom of the screen (1 = solid)
let distanceFade = 0.2; // How quickly they fade toward the horizon (smaller = slower)

// The brush the crowd is drawn in. p5.brush's brushes are pen, rotring, 2B, HB, 2H, cpencil,
// pastel, crayon, charcoal, spray and marker.
let brushName = 'pen';
let lineWeights = [3, 3.5, 4, 4.75, 5.5]; // How thick its lines can be, from the far distance to the front
let weightJitter = 0.35; // How far a figure's lines stray from what's usual at its distance, as a fraction of that whole range
let density; // How many pixels of canvas for each pixel of window
let resolution; // How many pixels of sheet for each of the frames' own pixels
let sheets; // The walk cycle painted at each line weight, at each size (see brush_frames.js)
let rows = new Map(); // The rows of the crowd that have been seen lately, by number (see rowAt())
let maxRows = 300; // How many of them to hold on to
let holes = []; // A hole for each link on the page, in the ground out in the distance (see setupHoles() and placeHoles())
let holeReach; // How far sideways the furthest hole is, in the frames' own pixels
// How far down the screen they're scattered with the camera where it starts (0 = the top, 1 = the bottom).
// A link can ask for the back or the front with data-row; any other can go anywhere. Or data-spot="across, down" puts it
// in a set place: across from -1 (as far left as its sign fits in the middle holeScatterWidth) to 1, and down as above
// (and data-spot-narrow, if it's there, on narrow screens). data-row="behind" puts it behind
// the mouse instead, off the bottom of the screen, with a tag at the bottom pointing to it, like home on the music page.
let holeBand = { back: [0.33, 0.42], front: [0.5, 0.64], any: [0.33, 0.64] };
let holeBandNarrow = { back: [0.26, 0.38], front: [0.48, 0.66], any: [0.26, 0.66] }; // ...and on narrow screens, where their signs need more room
let holeNameRoom = { perLetter: 12, padding: 24, perLine: 22, gap: 60 }; // How much room a name's sign takes up, in pixels, for keeping them apart
let holeScatterWidth = 640; // How wide an area in the middle of the screen they're scattered over, in pixels, when the screen's wider than that
let holeBehind = -0.35; // How far away a hole behind the mouse is, in the units of mouse.depth (below 0 is off the bottom of the screen)
let holeTries = 200; // How many places to try for each hole, keeping the one furthest from the others
let holeWidth = 50; // How wide they are, in the frames' own pixels, which is about what the mouse needs to fit
let holeLinkSize = [32, 20]; // The smallest their links can be, in pixels, so that they can still be clicked from far away
let holeShape = 0.42; // How tall they look, compared to how wide, seen from above
let holePen = { width: 90, weight: 3 }; // How they're drawn, before they're stretched to fit
let holeNameSize = [15, 24]; // The smallest and biggest their names can be, in pixels
let signPen = { width: 160, height: 44, post: 80, weight: 2.6 }; // How the signposts are drawn, before they're stretched to fit
let signPost = 110; // How tall a signpost's post is, in the frames' own pixels
let signPostPixels = [16, 70]; // ...but no shorter or taller than this, in pixels, so that the sign's still readable from far away
let signsAtSide = true; // Are the holes' signs in a column at the side of the screen, where clicking one sends the mouse to its hole, with the name of whichever hole, or sign, is pointed at shown at the top of the screen? Otherwise each has a signpost beside its hole.
let holeTripTime = 3; // How many seconds the mouse tries to take to run to a hole that's been clicked
let holeTripHurry = 3; // ...but it won't run more than this many times as fast as usual
let holeFallTime = 0.3; // How many seconds it takes to drop into the hole, before the next page
let tripStops = [1, 2]; // How many times it stops and changes direction on the way to a hole that's been clicked
let tripSwerve = [0.2, 0.4]; // How far off the straight line it goes to each stop, compared to how long the trip is
let tripPause = [0.2, 0.45]; // How many seconds it stops for
let tripShortest = 40; // A trip shorter than this, in pixels, doesn't stop on the way
let mouseSpot = { x: 0.5, y: 0.8 }; // Where the camera keeps the mouse, as a fraction of the screen's width and height
let mouseScale = 0.5; // How big it's drawn, compared to the people at the same distance
let mouseWeight = 6; // How thick its lines are, before it's shrunk to that size
let mouseSwings = 6; // How many pictures of its tail swinging it goes through per second, sitting
let mouseWalkSteps = 36; // ...and of its walk, walking. This sets how fast it goes, since it only moves as far as its feet push it.
let mouseBowTime = 0.12; // How many seconds it takes to get up and lower its head before it sets off, or to sit back up after it stops
let mouseViewStick = 1.2; // How far past halfway to the next way of facing it has to be heading before it changes to that
// When the mouse stands still, the camera slowly dips lower, down toward it, so everything looks bigger while the
// horizon stays where it is, and it rises back up as soon as the mouse moves (see pushCamera())
let pushZoom = 1.5; // How much bigger everything looks, dipped all the way down (the camera's this many times lower)
let pushInTime = 3.5; // About how many seconds it takes to dip all the way down
let pushOutTime = 2; // ...and to rise back up, once the mouse moves
let pushWait = 0.6; // How many seconds the mouse has to have been still before it starts
let pushed = 0; // How far down it's dipped now (0 = not at all, 1 = all the way)
let pushWalking = 0.45; // How far down it stays while the mouse is walking (0 = right back up, 1 = it doesn't rise)
let pushTurn = 0.9; // How gently it turns round when the mouse starts or stops, in seconds (bigger = gentler)
let pushStiffness = null; // How stiff its spring is now
let pushGoal = 0; // Where it's heading, eased itself, so even its pull changes gently (see pushTurn)
let pushSpeed = 0; // How quickly that's changing, each second (it moves like a weight on a spring, so it never jerks)
let stillFor = 0; // How long the mouse has been still
let mouseFollow = 5; // How quickly the camera catches up with it (bigger = quicker)
let mouseEntersFrom = -0.17; // Where it starts when the page opens, in the units of mouse.depth: just off the bottom of the screen
// Coming from the wormhole's art portal, the little worm comes out of its hole first (see hole_worm.js), and the mouse
// waits off the screen until it's out. hole_worm.js says so with a 'worm-out' event, and takes the note away.
let wormFirst = (() => {
  try {
    return sessionStorage.getItem('wormArrives') === '1';
  } catch {
    return false;
  }
})();
let wormWaitLongest = 10; // How many seconds the mouse waits for it at most, in case it never comes
let mouseSheet; // The mouse standing and walking (see brush_frames.js)
let mouse; // Where it is in the world and what it's doing (see placeMouse() and moveMouse())
let mouseHome; // How far away it is when it's where the camera keeps it (in the units of mouse.depth)
let mouseTarget = null; // The point in the world it's walking to, after a click or a tap
let mouseMoved = false; // Has the viewer moved it yet?
let mouseWentForward = false; // Has it gone further away than where the camera keeps it? Until then, nobody's cut off by the bottom of the screen
let keysHeld = new Set(); // Which of the keys that move it are down
// The camera. x is how far it's gone sideways, in the frames' own pixels. depth is how far it's gone
// along the ground, as the log of how much bigger that's made everything, so it's 0 where it starts.
let view = { x: 0, depth: 0 };

function setup() {
  density = Math.min(2, window.devicePixelRatio); // Sharp enough, and any more is slow on phones
  let canvas = createCanvas(windowWidth, windowHeight);
  pixelDensity(density); // (After making the canvas, which sets it back to the screen's own, 3 on iPhones; the drawing assumes `density`)
  canvas.position(0, 0);
  canvas.style('z-index', '-1');
  // Sharp enough for the biggest figures on this screen, and no bigger
  resolution = constrain(bottomSize() * 1.1 * density * pushZoom, 1, 3); // (Sharp enough pushed in, too)
  setupHoles(); // (Before the sheets, since painting those finishes with the brush)
  mouseSheet = paintMouse(brushName, mouseWeight, resolution * mouseScale);
  mouseFace = paintMouseFace(mouseSheet, { line: 0.55 }); // Its eyes, nose and whiskers in thin lines, for over its colours
  setupMouseControls();
  sheets = paintSheets(brushName, lineWeights, resolution);
  buildCrowd();
  if (trailOn) setupTrail(); // (After the holes are placed, since the trail's map reaches as far as they do)
}

// The mouse walks on once the worm's out of its hole
function waitForWorm() {
  let walkOn = () => {
    if (!wormFirst) return;
    wormFirst = false;
    if (mouse.depth < 0 && !mouseTarget) mouseTarget = { x: 0, depth: mouseHome, walkingOn: true };
  };
  window.addEventListener('worm-out', walkOn, { once: true });
  setTimeout(walkOn, wormWaitLongest * 1000);
}

// The size that puts a figure's feet at the bottom of the screen
function bottomSize() {
  return (height * (1 - horizon)) / cameraHeight;
}

// Get ready for the size of the screen. The rows themselves get built when they first come into view.
function buildCrowd() {
  rows = new Map();
  standHoles();
  mouseHome = Math.log(bottomSize() / sizeAt(mouseSpot.y * height));
  mouseTarget = null;
  // Start the mouse off, walking on from the bottom of the screen. If the screen has changed, leave it
  // where it is in the world, or where it would have got to if it hadn't finished walking on.
  if (!mouse) {
    let calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    mouse = { x: 0, depth: calm ? mouseHome : mouseEntersFrom, view: 0, facing: 1, bow: 0, walked: 0, walking: false, falling: null };
    if (calm) showInstructions();
    else if (wormFirst) waitForWorm();
    else mouseTarget = { x: 0, depth: mouseHome, walkingOn: true };
  } else if (mouse.depth < 0) {
    mouse.depth = mouseHome;
    showInstructions();
  }
}

// The line at the top of the screen saying how to walk the mouse, from when it's walked on until the
// viewer first moves it
function showInstructions() {
  if (!mouseMoved) document.querySelector('.art-instructions').classList.add('showing');
}

function hideInstructions() {
  mouseMoved = true;
  document.querySelector('.art-instructions').classList.remove('showing');
}

// Row number n, built the first time it's needed. They come out the same if they're built again, so
// the ones that have been walked away from can go, however far the mouse walks.
function rowAt(n) {
  if (rows.size > maxRows) rows.clear();
  if (!rows.has(n)) rows.set(n, buildRow(n));
  return rows.get(n);
}

// How big something at this depth in the world looks, from where the camera is
function sizeOf(depth) {
  return bottomSize() * Math.exp(view.depth - depth);
}

// Where something in the world is on the screen, given how big it looks from here
function screenX(x, size) {
  return width / 2 + (x - view.x) * size;
}

// How big something looks if its feet are this far down the screen. The ground only ever gets lower
// down the screen as things get bigger, so this homes in on it.
function sizeAt(y) {
  let bottom = bottomSize();
  let smallest = -14;
  let biggest = 3;
  for (let i = 0; i < 30; i++) {
    let middle = (smallest + biggest) / 2;
    if (groundAt(bottom * Math.exp(middle), bottom) < y) smallest = middle;
    else biggest = middle;
  }
  return bottom * Math.exp(smallest);
}

// Where a point on the screen is on the ground, in the world
function groundPoint(screenLeft, screenTop) {
  let size = sizeAt(screenTop);
  return {
    x: constrain(view.x + (screenLeft - width / 2) / size, -cameraReach(), cameraReach()),
    depth: Math.max(0, view.depth + Math.log(bottomSize() / size)),
  };
}

// The arrow keys or WASD steer the mouse, and a click or a tap anywhere but a link sends it there
function setupMouseControls() {
  let moveKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
  window.addEventListener('keydown', (event) => {
    if (!moveKeys.includes(event.code) || event.metaKey || event.ctrlKey || event.altKey) return;
    keysHeld.add(event.code);
    if (!mouseTarget?.walkingOn) mouseTarget = null; // (Here, since a quick tap can be over before the next frame)
    hideInstructions();
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keysHeld.delete(event.code));
  window.addEventListener('blur', () => keysHeld.clear());
  // A click or tap walks it there, and holding and dragging keeps it walking toward wherever the pointer is,
  // which on a phone is the only way to steer it as it goes
  let steering = null; // The pointer that's steering it, while it's held down
  window.addEventListener('pointerdown', (event) => {
    hideInstructions();
    if (event.target.closest('a') || mouseTarget?.walkingOn) return;
    mouseTarget = groundPoint(event.clientX, event.clientY);
    steering = event.pointerId;
  });
  window.addEventListener('pointermove', (event) => {
    if (event.pointerId !== steering || mouseTarget?.walkingOn || mouse.falling !== null) return;
    if (mouseTarget && mouseTarget.hurry) return; // On its way to a hole that's been picked
    mouseTarget = groundPoint(event.clientX, event.clientY);
  });
  for (const type of ['pointerup', 'pointercancel']) {
    window.addEventListener(type, (event) => event.pointerId === steering && (steering = null));
  }
}

// How far sideways the camera can go, which is as far as the furthest hole
function cameraReach() {
  return holeReach;
}

// Walk the mouse however it's being told to, and bring the camera along after it. The camera stops at
// the end of its reach, or where it started when going back, so the holes never go out of reach.
// The mouse can carry on across the screen from there, as far as its edge.
function moveMouse() {
  let seconds = Math.min(deltaTime / 1000, 0.1); // (The frames can be far apart if the page has been in the background)
  let bottom = bottomSize();
  let size = sizeOf(mouse.depth);
  let hurry = mouseTarget?.hurry ?? 1;
  let follow = 1 - Math.exp(-seconds * mouseFollow * hurry);
  let followMouse = () => {
    view.x += (constrain(mouse.x, -cameraReach(), cameraReach()) - view.x) * follow;
    view.depth += (Math.max(0, mouse.depth - mouseHome) - view.depth) * follow;
  };

  // Dropping into a hole, and then on to its page
  if (mouse.falling !== null) {
    mouse.falling += seconds / holeFallTime;
    if (mouse.falling >= 1) {
      let { href } = mouse.fallingInto.link;
      mouse.falling = null; // (So that it's back if the browser's back button returns to this page as it was)
      window.location.href = href;
    }
    followMouse();
    return;
  }

  let held = (...codes) => (codes.some((code) => keysHeld.has(code)) ? 1 : 0);
  let right = held('ArrowRight', 'KeyD') - held('ArrowLeft', 'KeyA');
  let down = held('ArrowDown', 'KeyS') - held('ArrowUp', 'KeyW');
  if (mouseTarget?.walkingOn) right = down = 0; // It always finishes walking on before it can be steered
  let stopped = false;
  if (right || down) {
    mouseTarget = null;
  } else if (mouseTarget?.pause > 0) {
    // Stopped on the way to a hole
    mouseTarget.pause -= seconds;
    stopped = true;
  } else if (mouseTarget) {
    // Heading for the next stop on the way, if there is one
    let aim = mouseTarget.stops?.[0] ?? mouseTarget;
    let aimSize = sizeOf(aim.depth);
    let gapX = screenX(aim.x, aimSize) - screenX(mouse.x, size);
    let gapY = groundAt(aimSize, bottom) - groundAt(size, bottom);
    let gap = Math.hypot(gapX, gapY);
    // Running to a hole, it could be going far enough each frame to run straight past
    let oneFrame = mouseWalkSteps * hurry * seconds * mouseStride * mouseScale * size;
    if (gap < Math.max(6, oneFrame)) {
      if (mouseTarget.stops?.length) {
        mouseTarget.stops.shift();
        mouseTarget.pause = random(tripPause[0], tripPause[1]);
        stopped = true;
      } else {
        if (mouseTarget.hole) dropIntoHole(mouseTarget.hole);
        if (mouseTarget.walkingOn) showInstructions();
        mouseTarget = null;
      }
    } else {
      right = gapX / gap;
      down = gapY / gap;
    }
  }

  let edge = cameraReach() + (width / 2 - 8) / size;
  if ((right < 0 && mouse.x <= -edge) || (right > 0 && mouse.x >= edge)) right = 0;
  let goingBehind = mouseTarget?.hole?.behind; // Only a hole behind it can take it back off the bottom of the screen
  if (down > 0 && mouse.depth <= 0 && !goingBehind) down = 0;
  if (right === 0 && down === 0 && !stopped) mouseTarget = null;

  // It faces the nearest of the ways it can, and carries on facing that way when it stops
  let going = right !== 0 || down !== 0;
  if (going) {
    let eighth = Math.PI / 4;
    let angle = Math.atan2(Math.abs(right), -down);
    if (Math.abs(angle - mouse.view * eighth) > (eighth / 2) * mouseViewStick) mouse.view = Math.round(angle / eighth);
    if (right !== 0) mouse.facing = Math.sign(right);
  }

  // It sets off once its head's down
  mouse.bow = constrain(mouse.bow + ((going ? 1 : -1) * seconds) / mouseBowTime, 0, 1);
  mouse.walking = going && mouse.bow === 1;
  if (mouse.walking) {
    // It only moves when its walk cycle moves on, by exactly as far as its planted foot slides back
    // on the screen, the same as the crowd (see draw()), so that foot stays put on the ground
    let before = Math.floor(mouse.walked);
    mouse.walked += mouseWalkSteps * hurry * seconds;
    let pushed = (Math.floor(mouse.walked) - before) * mouseStride * mouseScale * size;
    let along = Math.hypot(right, down);
    mouse.x = constrain(mouse.x + ((right / along) * pushed) / size, -edge, edge);
    // Across the ground, the screen's pixels are worth less the further away they are. It can't come any
    // nearer than the bottom of the screen, unless it's still walking on from past there.
    let nearest = goingBehind ? mouseTarget.hole.depth : Math.min(0, mouse.depth);
    mouse.depth = Math.max(nearest, mouse.depth - ((down / along) * pushed) / (cameraHeight * size + curl * height));
  } else {
    mouse.walked = 0;
  }

  // Walking onto a hole takes it down the hole too, unless it's running to a different one. It has to
  // walk onto it, so that coming back to this page doesn't drop it straight back in.
  let over = holeUnderMouse();
  if (over && over !== mouse.overHole && mouse.walking && !mouseTarget?.hole) {
    dropIntoHole(over);
    mouseTarget = null;
  }
  mouse.overHole = over;
  if (mouse.depth > mouseHome + 0.02) mouseWentForward = true;

  followMouse();
}

// Start the mouse dropping into a hole
function dropIntoHole(hole) {
  mouse.x = hole.x;
  mouse.depth = hole.depth;
  mouse.falling = 0;
  mouse.fallingInto = hole;
  mouse.overHole = hole;
}

// The hole the mouse is standing on, if it's on one
function holeUnderMouse() {
  let bottom = bottomSize();
  let size = sizeOf(mouse.depth);
  for (let hole of holes) {
    let holeSize = sizeOf(hole.depth);
    let halfWide = (holeWidth * holeSize) / 2;
    let gapX = (screenX(hole.x, holeSize) - screenX(mouse.x, size)) / halfWide;
    let gapY = (groundAt(holeSize, bottom) - groundAt(size, bottom)) / (halfWide * holeShape);
    if (gapX * gapX + gapY * gapY < 1) return hole;
  }
  return null;
}

// Find the holes' links on the page, and draw the holes
function setupHoles() {
  let links = [...document.querySelectorAll('.art-hole')];
  let pictures = paintHoles(links.length, brushName, holePen.weight, holePen.width, holePen.width * holeShape, density * 3);
  let signs = paintSigns(links.length, brushName, signPen.weight, signPen.width, signPen.height, signPen.post, density * 2);
  holes = links.map((link, i) => ({
    link,
    behind: link.dataset.row === 'behind',
    mouth: link.querySelector('.art-hole-mouth'),
    name: link.querySelector('.art-hole-name'),
    picture: pictures[i],
    sign: signs[i],
    fontSize: null,
    postLength: null,
  }));
  // How big their signs need to be depends on their font, so measure again once that's loaded
  document.fonts.ready.then(() => holes.forEach((hole) => { hole.fontSize = null; }));
  let column = null;
  if (signsAtSide) {
    document.body.classList.add('art-signs-at-side');
    column = document.createElement('nav');
    column.className = 'art-signs';
    column.setAttribute('aria-label', 'Holes');
    document.body.append(column);
    holeTitle = document.createElement('p');
    holeTitle.className = 'art-hole-title';
    holeTitle.setAttribute('aria-hidden', 'true'); // (The signs already say it)
    document.body.append(holeTitle);
  }
  holes.forEach((hole) => {
    if (column) {
      // Its sign, in the column at the side; pointing at it shows the hole's name above the hole
      hole.sideSign = document.createElement('a');
      hole.sideSign.className = 'art-sign';
      hole.sideSign.href = hole.link.href;
      hole.sideSign.textContent = hole.name.textContent;
      column.append(hole.sideSign);
    }
    // Pointing at its sign, or at the hole, shows its name at the top of the screen
    for (const link of column ? [hole.sideSign, hole.link] : []) {
      for (const [type, named] of [['pointerenter', true], ['pointerleave', false], ['focus', true], ['blur', false]]) {
        link.addEventListener(type, () => nameHole(hole, named));
      }
    }
    // A pointer to it, at the edge of the screen, for when it's off the screen (see pointTo())
    if (!hole.behind && !column) {
      hole.pointer = document.createElement('a');
      hole.pointer.className = 'art-pointer';
      hole.pointer.href = hole.link.href;
      hole.pointer.hidden = true;
      hole.link.after(hole.pointer);
    }
    for (const link of [hole.link, hole.pointer, hole.sideSign].filter(Boolean)) {
      link.addEventListener('click', (event) => {
        // Opening it in a new tab, or asking for less motion, just follows the link
        if (event.metaKey || event.ctrlKey || event.shiftKey || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        event.preventDefault();
        sendMouseToHole(hole);
      });
    }
  });
}

// The name of the hole being pointed at, at the top of the screen (see signsAtSide)
let holeTitle = null;
let holeTitled = null;
function nameHole(hole, named) {
  if (named) holeTitled = hole;
  else if (holeTitled === hole) holeTitled = null;
  if (holeTitled) holeTitle.textContent = holeTitled.name.textContent;
  holeTitle.classList.toggle('shown', !!holeTitled);
}

// When a hole's sign is off the screen, a pointer to it at that edge: its name, with an arrow the way it is
const pointerRoom = { top: 64, side: 8, bottom: 40 }; // How far in from the edges they sit, in pixels (the top clears the navbar)
function pointTo(hole) {
  if (!hole.pointer) return;
  const middle = hole.left + hole.width / 2 + (hole.beside ?? 0);
  const signTop = hole.signBottom - (hole.signHeight ?? 0);
  let way = null;
  // (Once its middle's past the edge, so it's at least half gone)
  if (middle < 0) way = 'left';
  else if (middle > width) way = 'right';
  else if (hole.ground > height) way = 'down';
  else if (signTop < pointerRoom.top - 20) way = 'up';
  const pointer = hole.pointer;
  if (!way) {
    if (!pointer.hidden) pointer.hidden = true;
    return;
  }
  const name = hole.name.textContent;
  const text = { left: `← ${name}`, right: `${name} →`, up: `↑ ${name}`, down: `↓ ${name}` }[way];
  if (pointer.textContent !== text) pointer.textContent = text;
  pointer.hidden = false;
  pointer.dataset.way = way;
  const y = constrain(hole.signBottom - (hole.signHeight ?? 0) / 2, pointerRoom.top + 10, height - pointerRoom.bottom - 10);
  const x = constrain(middle, 60, width - 60);
  pointer.style.left = way === 'left' ? `${pointerRoom.side}px` : way === 'right' ? 'auto' : `${x}px`;
  pointer.style.right = way === 'right' ? `${pointerRoom.side}px` : 'auto';
  pointer.style.top = way === 'up' ? `${pointerRoom.top}px` : way === 'down' ? 'auto' : `${y}px`;
  pointer.style.bottom = way === 'down' ? `${pointerRoom.bottom}px` : 'auto';
}

// Scatter the holes for the size of the screen, keeping their signs apart and on the screen. It's a new
// scattering each visit, kept the same while the page is open (see holeSeed). For each hole, it tries a number of places and keeps
// the one with the most room around it.
const holeSeed = Math.floor(Math.random() * 1e6);
function standHoles() {
  let bands = width < 600 ? holeBandNarrow : holeBand;
  let widest = Math.max(width * 0.3, 190); // Past this, the names wrap (see .art-hole-name)
  let spots = [];
  holes.forEach((hole, i) => {
    if (hole.behind) {
      hole.link.classList.add('art-hole-behind');
      hole.depth = holeBehind;
      hole.size = bottomSize() * Math.exp(-hole.depth);
      hole.inRow = 0;
      hole.x = 0;
      return;
    }
    let band = bands[hole.link.dataset.row] ?? bands.any;
    let letters = hole.name.textContent.length;
    let wide = Math.min(widest, letters * holeNameRoom.perLetter + holeNameRoom.padding);
    // (On narrow screens they can't spread sideways, so they need more room one above the other, to clear each other's posts)
    let tall = Math.ceil((letters * holeNameRoom.perLetter) / widest) * holeNameRoom.perLine + holeNameRoom.gap * (width < 600 ? 1.6 : 1);
    let best = null;
    let bestRoom = -1;
    let spot = (width < 600 && hole.link.dataset.spotNarrow) || hole.link.dataset.spot;
    if (spot) {
      let [across, down] = spot.split(',').map(Number);
      best = { x: width / 2 + (across * (Math.min(width, holeScatterWidth) - wide)) / 2, y: height * down, wide, tall };
      bestRoom = Infinity;
    }
    for (let attempt = 0; bestRoom < Infinity && attempt < holeTries; attempt++) {
      // Its sign kept on the screen even once the camera's dipped all the way, which spreads everything out
      // from the middle by up to pushZoom (see pushCamera() and placeHoles())
      // (Their names grow a little as it dips, so a bit more room than they take now, and a margin)
      let across = Math.min(Math.min(width, holeScatterWidth) - wide, (width - wide * 1.25 - 24) / pushZoom);
      let x = width / 2 + (hash(holeSeed + i * 1000 + attempt + 0.1) - 0.5) * across;
      let y = height * lerp(band[0], band[1], hash(holeSeed + i * 1000 + attempt + 0.2));
      let roomHere = Math.min(Infinity, ...spots.map((spot) => Math.max(Math.abs(x - spot.x) / ((wide + spot.wide) / 2), Math.abs(y - spot.y) / ((tall + spot.tall) / 2))));
      if (roomHere > bestRoom) {
        best = { x, y, wide, tall };
        bestRoom = roomHere;
      }
    }
    spots.push(best);
    hole.size = sizeAt(best.y);
    hole.inRow = (best.x - width / 2) / (width / 2); // Where it is across the screen: -1 is the left, 1 the right
    hole.x = (hole.inRow * (width / 2)) / hole.size;
    hole.depth = Math.log(bottomSize() / hole.size);
  });
  holeReach = Math.max(...holes.map((hole) => Math.abs(hole.x)));
  holes.sort((a, b) => b.depth - a.depth); // The furthest first, for drawing their signs among the crowd
}

// Send the mouse running to a hole, faster if it's a long way, the way the boat hurries to a gate on the
// home page. It stops and changes direction once or twice on the way, and goes into the hole when it
// gets there (see moveMouse()).
function sendMouseToHole(hole) {
  if (mouse.falling !== null) return;
  let stops = tripStopsTo(hole);
  // How many steps it is, stop by stop
  let perStep = mouseStride * mouseScale;
  let size = sizeOf(mouse.depth);
  let totalSteps = 0;
  let from = mouse;
  for (let to of [...stops, hole]) {
    totalSteps += Math.abs(to.x - from.x) / perStep;
    totalSteps += (Math.abs(to.depth - from.depth) * (cameraHeight * size + curl * height)) / (perStep * size);
    from = to;
  }
  mouseTarget = {
    x: hole.x,
    depth: hole.depth,
    hole,
    stops,
    pause: 0,
    hurry: constrain(totalSteps / (mouseWalkSteps * holeTripTime), 1, holeTripHurry),
  };
}

// The places on the ground it stops on the way to a hole: spaced along the line from the mouse to the
// hole, and off to alternate sides of it, so that it changes direction at each.
function tripStopsTo(hole) {
  if (hole.behind) return []; // Straight back
  let bottom = bottomSize();
  let mouseSize = sizeOf(mouse.depth);
  let holeSize = sizeOf(hole.depth);
  let fromX = screenX(mouse.x, mouseSize);
  let fromY = groundAt(mouseSize, bottom);
  let toX = screenX(hole.x, holeSize);
  let toY = groundAt(holeSize, bottom);
  let length = Math.hypot(toX - fromX, toY - fromY);
  if (length < tripShortest) return [];

  let count = Math.round(random(tripStops[0], tripStops[1]));
  let side = random() < 0.5 ? -1 : 1;
  let stops = [];
  for (let i = 1; i <= count; i++) {
    let along = (i + random(-0.15, 0.15)) / (count + 1);
    let swerve = side * length * random(tripSwerve[0], tripSwerve[1]);
    side = -side;
    // Square to the line, and kept on the screen, and on the ground between the two ends
    let x = lerp(fromX, toX, along) + (-(toY - fromY) / length) * swerve;
    let y = lerp(fromY, toY, along) + ((toX - fromX) / length) * swerve;
    stops.push(groundPoint(constrain(x, 20, width - 20), constrain(y, Math.min(fromY, toY), Math.max(fromY, toY))));
  }
  return stops;
}

// The same as the row of gates on the music page (see placeGate() in music/sketch.js): everything spreads
// out from the middle of the screen as the camera goes forward, and slides as it goes sideways, by how
// far away each hole is. How far down the screen comes from this page's ground, so they stay put on it
// among the crowd.
function placeHoles() {
  let scale = Math.exp(view.depth) * (cameraHeightUsual / cameraHeight); // (Bigger as the camera dips, see pushCamera())
  let bottom = bottomSize();
  for (let hole of holes) {
    let rowSideways = view.x * hole.size;
    let size = hole.size * scale;
    hole.width = holeWidth * size;
    hole.height = hole.width * holeShape;
    hole.left = width / 2 + (hole.inRow * (width / 2) - rowSideways) * scale - hole.width / 2;
    hole.ground = groundAt(size, bottom);
    if (hole.behind) {
      // Its link's a tag at the bottom of the screen, below where it is (see .art-hole-behind)
      hole.link.style.left = `${constrain(hole.left + hole.width / 2, 40, width - 40)}px`;
      hole.link.style.top = `${height - 6}px`;
      continue;
    }

    let linkHeight = Math.max(hole.height, holeLinkSize[1]);
    hole.link.style.left = `${hole.left + hole.width / 2}px`;
    hole.link.style.top = `${hole.ground + linkHeight / 2}px`;
    hole.mouth.style.width = `${Math.max(hole.width, holeLinkSize[0])}px`;
    hole.mouth.style.height = `${linkHeight}px`;

    // Its name's on a sign, on a post coming up from the back of the hole. Only measuring when the
    // name changes size, since that's slow.
    let postLength = signsAtSide ? 0 : Math.round(constrain(signPost * size, signPostPixels[0], signPostPixels[1]));
    if (postLength !== hole.postLength) {
      hole.postLength = postLength;
      hole.name.style.marginBottom = `${postLength}px`;
    }
    let fontSize = Math.round(constrain(hole.width * 0.4, holeNameSize[0], holeNameSize[1]) * 2) / 2;
    if (fontSize !== hole.fontSize) {
      hole.fontSize = fontSize;
      hole.name.style.fontSize = `${fontSize}px`;
      hole.signWidth = hole.name.offsetWidth;
      hole.signHeight = hole.name.offsetHeight;
    }
    hole.signBottom = hole.ground - linkHeight / 2 - postLength;
    pointTo(hole);
    // Its post stands on the ground beside the hole, on the side toward the middle of the screen, so its sign
    // stays on the screen; the name on the page moves over with it
    let side = hole.inRow > 0 ? -1 : 1;
    let beside = signsAtSide ? 0 : Math.round(side * (hole.width / 2 + Math.max(6, hole.width * 0.2))); // (With the signs at the side, its name's right above it)
    if (beside !== hole.beside) {
      hole.beside = beside;
      hole.name.style.transform = `translateX(${beside}px)`;
    }
  }
}

// A hole's signpost, standing on the ground beside the hole (see placeHoles()). Its name goes on top, as the link on the page.
function showSign(ctx, hole) {
  if (hole.behind || signsAtSide) return; // It has its tag instead, or its sign's at the side
  let middle = hole.left + hole.width / 2 + (hole.beside ?? 0);
  let holeBack = hole.ground; // (Where its post meets the ground, level with the middle of the hole)
  let scale = hole.signWidth / signPen.width;
  ctx.setTransform(density, 0, 0, density, 0, 0);
  ctx.globalAlpha = 1;
  let postHeight = holeBack - hole.signBottom;
  let postMargin = (signMargin * postHeight) / signPen.post;
  ctx.drawImage(duskBoard(hole.sign.post, (hole.signBottom + holeBack) / 2), middle - signMargin * scale, hole.signBottom - postMargin, signMargin * 2 * scale, postHeight + postMargin * 2);
  let marginX = signMargin * scale;
  let marginY = (signMargin * hole.signHeight) / signPen.height;
  ctx.drawImage(
    duskBoard(hole.sign.board, hole.signBottom - hole.signHeight / 2),
    middle - hole.signWidth / 2 - marginX, hole.signBottom - hole.signHeight - marginY,
    hole.signWidth + marginX * 2, hole.signHeight + marginY * 2,
  );
}

// A hole, with its middle on the ground where it is. Its picture's white, and a "difference" blend makes
// it black on the white ground, while anyone walking over it comes out white.
function showHole(ctx, hole) {
  if (hole.behind) return; // Off the screen
  let margin = (holeMargin * hole.width) / holePen.width;
  ctx.setTransform(density, 0, 0, density, 0, 0);
  ctx.globalAlpha = alpha * Math.min(1, pow(hole.width / holeWidth / bottomSize(), distanceFade)); // The same fade as the crowd's
  ctx.globalCompositeOperation = 'difference';
  ctx.drawImage(duskHole(hole.picture, hole.ground), hole.left - margin, hole.ground - hole.height / 2 - margin, hole.width + margin * 2, hole.height + margin * 2);
  ctx.globalCompositeOperation = 'source-over';
}

// Row number n: the figures that are this many rows further away than the bottom of the screen, with
// the camera where it starts. What depends on where the camera is gets worked out when they're drawn.
function buildRow(n) {
  let size = bottomSize() * pow(ratio, n);

  // The row is a strip wider than the screen, which the figures wrap round. It's worked out from the
  // smallest a figure can look with its row in view, so they always wrap off screen.
  let smallest = furthestInView() * (1 - (rowJitter * (1 - ratio)) / 2);
  let span = width / smallest + offScreen * 2;
  let count = Math.round(span / spacing);

  let people = [];
  for (let i = 0; i < count; i++) {
    let person = n * 10000 + i;
    // Stepping out of the row toward the camera makes a figure bigger, as well as lower down
    let stray = 1 + (hash(person + 0.25) - 0.5) * rowJitter * (1 - ratio);
    people.push({
      depth: Math.log(bottomSize() / (size * stray)),
      weightStray: (hash(person + 0.35) - 0.5) * weightJitter,
      stepsPerSecond: lerp(walkSpeed[0], walkSpeed[1], hash(person + 0.75)) / stride,
      start: hash(person) * span,
      firstStep: Math.floor(hash(person + 0.5) * steps),
      arrives: hash(person + 0.85), // Its place in the queue: it can come on once crowdHere gets past this
      joined: crowdOpening ? null : hash(person + 0.85) < crowdHere, // Is it showing? Those in the first frame find out when it's drawn (null)
      seenFrom: null,
      fadingFrom: null, // When it started fading in, if it has
    });
  }

  return {
    people,
    span,
    depth: Math.log(bottomSize() / size),
    direction: n % 2 === 0 ? 1 : -1, // Every other row walks the other way
  };
}

// Work out how a figure looks from where the camera is now
function lookAt(p, near, bottom) {
  p.size = bottom * Math.exp(view.depth - p.depth);

  // The further away the ground has curled, the more the figures tip back with it
  let distance = Math.max(0, Math.log(bottom / p.size));
  p.tipped = Math.cos(Math.min(distance * curlTip, 1.2));
  p.ground = groundAt(p.size, bottom);

  // Thicker lines toward the front, and a little different for each figure
  let thickness = Math.sqrt(Math.min(1, near)) + p.weightStray;
  let weight = constrain(Math.round(thickness * (lineWeights.length - 1)), 0, lineWeights.length - 1);

  // The smallest size of the sheet that's still sharp for this figure
  let level = constrain(Math.floor(Math.log2(resolution / (p.size * density))), 0, sheets.length - 1);
  p.sheet = sheets[level];
  p.sheetScale = resolution / 2 ** level;
  p.sheetY = weight * Math.round(frameHeight * resolution) / 2 ** level;
  p.seenFrom = view.depth;
}

// How big the figures in the furthest row in view look: it's either off the top of the screen or too
// small to see
function furthestInView() {
  return Math.max(sizeAt(0), (furthestSize * height) / 900);
}

// Dip the camera lower while the mouse is still, and back up while it moves (see pushZoom). Everything on the ground
// stays where it is down the screen, since that only depends on the camera's height times how big things look, so it
// all just looks bigger, spreading out from the middle of the screen, with the horizon where it was.
function pushCamera() {
  let seconds = Math.min(deltaTime / 1000, 0.1);
  let still = !mouse.walking && mouse.falling === null && !mouseTarget && mouse.depth >= 0;
  stillFor = still ? stillFor + seconds : 0;
  let wanted = stillFor > pushWait ? 1 : pushWalking;
  pushGoal += (wanted - pushGoal) * (1 - Math.exp(-seconds / pushTurn));
  let goal = pushGoal;
  // A spring that's just stiff enough not to overshoot: it speeds up gently, and slows gently into place, and when the
  // mouse starts or stops it turns round smoothly, from however it was moving, instead of jumping to a new speed
  pushStiffness ??= 4.7 / pushInTime;
  pushStiffness += (4.7 / (wanted === 1 ? pushInTime : pushOutTime) - pushStiffness) * (1 - Math.exp(-seconds / pushTurn)); // (Eased too, so nothing changes all at once)
  let stiffness = pushStiffness; // (Settles about this many seconds after it sets off)
  for (let step = 0, steps = 4; step < steps; step++) {
    let dt = seconds / steps;
    pushSpeed += (stiffness * stiffness * (goal - pushed) - 2 * stiffness * pushSpeed) * dt;
    pushed += pushSpeed * dt;
  }
  pushed = constrain(pushed, -0.1, 1.1); // (Only a safety net: clamping it tightly would make a kink)
  // Lower by an even share each time, so it looks like it's moving at an even pace
  cameraHeight = cameraHeightUsual / Math.pow(pushZoom, pushed);
}

function draw() {
  pushCamera();
  moveMouse();
  placeHoles();
  background(255);
  if (duskOn) showGround(drawingContext);
  if (trailOn) showTrail(drawingContext); // Painted on the ground, so under everyone
  let seconds = millis() / 1000;
  crowdStarted ??= seconds;
  // It grows by the same share of itself all the way, so that they keep arriving at a pace that shows
  crowdHere = crowdFirst * pow(1 / crowdFirst, Math.min(1, (seconds - crowdStarted) / crowdFillTime));
  let ctx = drawingContext;
  let cellWidth = Math.round(frameWidth * resolution); // How wide a picture is on the full-size sheet
  let cellHeight = Math.round(frameHeight * resolution);
  let bottom = bottomSize();
  let mouseSize = sizeOf(mouse.depth);
  let mouseGround = groundAt(mouseSize, bottom);
  let mouseLeft = screenX(mouse.x, mouseSize);

  // The rows in view, out to the furthest, and in to the last with anything still showing above the
  // bottom of the screen
  let sizeOfRow = (n) => bottom * Math.exp(view.depth + n * Math.log(ratio));
  let middleRow = Math.ceil(view.depth / -Math.log(ratio));
  let furthest = middleRow;
  while (sizeOfRow(furthest) > furthestInView()) furthest++;
  let nearest = middleRow;
  while (groundAt(sizeOfRow(nearest), bottom) - feetY * sizeOfRow(nearest) < height) nearest--;

  let mouseShown = false;
  let nextSign = 0;
  // The furthest row first, so the nearer ones walk in front of it
  for (let n = furthest; n >= nearest; n--) {
    let row = rowAt(n);
    let rowSize = sizeOf(row.depth);
    let rowGround = groundAt(rowSize, bottom);
    let near = rowSize / bottom; // 1 at the bottom of the screen, smaller in the distance
    // Everyone drawn so far is further away than the next signpost, so behind it
    while (nextSign < holes.length && rowGround > holes[nextSign].ground) {
      showSign(ctx, holes[nextSign]);
      nextSign++;
    }
    // Likewise for the mouse
    if (!mouseShown && rowGround > mouseGround) {
      showMouse(ctx, seconds);
      mouseShown = true;
    }
    let rowAlpha = alpha * Math.min(1, pow(near, distanceFade));
    let span = row.span;
    for (let p of row.people) {
      // Each figure walks at its own speed, and only moves when its walk cycle moves on, by
      // exactly as far as its planted foot slides back, so that foot stays put on the ground
      let walked = Math.floor(p.stepsPerSecond * seconds);
      let along = p.start + walked * stride * row.direction - view.x;
      let size = bottom * Math.exp(view.depth - p.depth);
      let x = width / 2 + (((((along % span) + span) % span) - span / 2)) * size;
      let offTheScreen = x < -frameWidth * size || x > width + frameWidth * size;
      // Anyone whose feet would be off the bottom of the screen stays away until the mouse goes forward.
      // Then they fade in like everyone else who's arriving, so that nobody pops into view.
      if (!mouseWentForward && groundAt(size, bottom) > height) {
        p.joined = false;
        continue;
      }
      if (!p.joined) {
        let across = (x - mouseLeft) / (width * crowdGapWide);
        let clear = offTheScreen || groundAt(size, bottom) < height * (1 - crowdGapTall * (1 - across * across));
        let arrived = p.arrives < crowdHere;
        let firstFrame = p.joined === null;
        p.joined = arrived && clear;
        if (p.joined && !firstFrame && !offTheScreen) p.fadingFrom = seconds; // Anyone off the screen just walks on
      }
      if (offTheScreen || !p.joined) continue;

      if (p.seenFrom !== view.depth) lookAt(p, near, bottom);
      let scaleDown = p.sheetScale / resolution;
      let faded = 1;
      if (p.fadingFrom !== null) {
        faded = (seconds - p.fadingFrom) / crowdFade;
        if (faded >= 1) {
          faded = 1;
          p.fadingFrom = null;
        }
      }
      ctx.globalAlpha = rowAlpha * faded;
      ctx.setTransform(row.direction * size * density, 0, 0, size * p.tipped * density, x * density, p.ground * density);
      ctx.drawImage(
        p.sheet,
        ((walked + p.firstStep) % steps) * cellWidth * scaleDown, p.sheetY, cellWidth * scaleDown, cellHeight * scaleDown,
        -feetX, -feetY, frameWidth, frameHeight,
      );
    }
  }
  while (nextSign < holes.length) {
    showSign(ctx, holes[nextSign]);
    nextSign++;
  }
  if (!mouseShown) showMouse(ctx, seconds);
  crowdOpening = false;
  // The holes go over everyone, in a way that shows them walking across, in white (see showHole())
  for (let hole of holes) showHole(ctx, hole);
  ctx.setTransform(density, 0, 0, density, 0, 0);
  ctx.globalAlpha = 1;
  showDusk(ctx);
  if (inverted) {
    // White on black: everything turned inside out at the end (the mouse's inside was turned first, so it comes back as itself)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.globalCompositeOperation = 'source-over';
  }
}

// White on black instead of black on white, when the page asks for it (see .art-inverted in main.css)
const inverted = document.body.classList.contains('art-inverted');

// Dusk: the ground's a light grey, a little darker and bluer further back, with the black lines on it. Only the ground's dark, so the
// mouse and its inside stay as bright as ever. The holes are turned to match (see duskHole()), and
// the corners are a little darker still.
let duskOn = false; // Off: the ground's plain white
const duskNear = [255, 255, 255]; // The ground nearest the camera, at the bottom of the screen: white
const duskFar = [214, 219, 230]; // ...and furthest away, at the top: a little darker and bluer
let duskGradient = null; // The ground's colours, made once for the height of the screen

// The ground's colour this far down the screen
function groundColourAt(y) {
  const t = Math.min(1, Math.max(0, y / height));
  return duskFar.map((far, i) => Math.round(far + (duskNear[i] - far) * t));
}

function showGround(ctx) {
  if (!duskGradient || duskGradient.height !== height) {
    duskGradient = ctx.createLinearGradient(0, 0, 0, height);
    duskGradient.addColorStop(0, `rgb(${duskFar.join(',')})`);
    duskGradient.addColorStop(1, `rgb(${duskNear.join(',')})`);
    duskGradient.height = height;
  }
  ctx.setTransform(density, 0, 0, density, 0, 0);
  ctx.fillStyle = duskGradient;
  ctx.fillRect(0, 0, width, height);
}
const duskEdges = 0; // How much darker it gets out at the corners (0 = not at all)
let duskCorners = null; // The darkening at the corners, painted once for the size of the screen
const duskHoles = new Map(); // Each hole's picture in the ground's colour, made once

// A hole's picture is white, drawn so it turns whatever's under it inside out, which on white ground makes it black
// with the crowd walking across it in white. In the ground's own colour instead, on this ground it does the same:
// black, with the crowd across it in that dark blue grey.
// A sign's board, its white turned the ground's colour round it, so it fits in, made once for each shade
const duskBoards = new Map();
function duskBoard(board, y) {
  if (!duskOn) return board;
  const key = groundColourAt(Math.round((y / height) * 16) / 16 * height).join(',');
  let tints = duskBoards.get(board);
  if (!tints) duskBoards.set(board, (tints = new Map()));
  let tinted = tints.get(key);
  if (!tinted) {
    tinted = document.createElement('canvas');
    tinted.width = board.width;
    tinted.height = board.height;
    const context = tinted.getContext('2d');
    context.drawImage(board, 0, 0);
    context.globalCompositeOperation = 'multiply'; // White takes the colour, black stays black
    context.fillStyle = `rgb(${key})`;
    context.fillRect(0, 0, tinted.width, tinted.height);
    context.globalCompositeOperation = 'destination-in'; // ...and only where the board is
    context.drawImage(board, 0, 0);
    tints.set(key, tinted);
  }
  return tinted;
}

function duskHole(picture, y) {
  if (!duskOn) return picture;
  const colour = groundColourAt(Math.round((y / height) * 16) / 16 * height); // (In a few steps, so it's only made a few times)
  const key = `${colour.join(',')}`;
  let tints = duskHoles.get(picture);
  if (!tints) duskHoles.set(picture, (tints = new Map()));
  let tinted = tints.get(key);
  if (!tinted) {
    tinted = document.createElement('canvas');
    tinted.width = picture.width;
    tinted.height = picture.height;
    const context = tinted.getContext('2d');
    context.drawImage(picture, 0, 0);
    context.globalCompositeOperation = 'source-in';
    context.fillStyle = `rgb(${key})`;
    context.fillRect(0, 0, tinted.width, tinted.height);
    tints.set(key, tinted);
  }
  return tinted;
}

function paintCorners() {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  const context = canvas.getContext('2d');
  const corners = context.createRadialGradient(canvas.width / 2, canvas.height * 0.55, Math.min(canvas.width, canvas.height) * 0.35, canvas.width / 2, canvas.height * 0.55, Math.hypot(canvas.width, canvas.height) * 0.6);
  corners.addColorStop(0, 'rgba(0,0,0,0)');
  corners.addColorStop(1, `rgba(0,0,8,${duskEdges})`);
  context.fillStyle = corners;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function showDusk(ctx) {
  if (!duskOn) return;
  if (!duskCorners || duskCorners.width !== Math.ceil(width) || duskCorners.height !== Math.ceil(height)) duskCorners = paintCorners();
  ctx.drawImage(duskCorners, 0, 0, width, height);
}

// The colours of the Luminin, for the mouse's inside: the stabilized close-up of it plays, hidden
let lumininVideo = null;
const lumininClip = '/media/lumininCloseupStabilized.mp4';

const lumininPlays = [2, 7.7]; // The part of it that plays, over and over, in seconds: not its start, where it looks close to white, or its paler end

function startLumininVideo() {
  const video = document.createElement('video');
  video.src = lumininClip;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.addEventListener('loadedmetadata', () => (video.currentTime = lumininPlays[0]));
  video.play().catch(() => {});
  return video;
}

// Kept to the part that plays (see lumininPlays): checked every frame, since the video's own time updates come too
// seldom to catch it in time
function keepLumininPlaying(video) {
  if (video.readyState < 1 || video.seeking) return;
  if (video.currentTime < lumininPlays[0] || video.currentTime > lumininPlays[1]) video.currentTime = lumininPlays[0];
}

// Inside the mouse, where it's white, a psychedelic pattern from the Luminin: the hidden close-up video (see lumininVideo),
// with its colours pushed up and its hues turning slowly round, showing through its white parts, under its
// black lines. Where it's white is found once, from its pictures (see insideSheet()).
let mouseInside = null; // Its pictures, with only the white parts kept, see-through everywhere else
let mouseInsideCut = null; // Where this frame's picture of its inside is made
const mouseInsideZoom = 0.25; // How much of the video's width shows inside it (smaller = closer in, bigger colours)
const mouseInsideBright = 1.6; // How much brighter than the video it is, glowing against the dusk
const mouseInsideSaturate = 2.2; // How much its colours are pushed up
const mouseInsideHueTurn = 40; // How many degrees its hues turn round each second
const mouseOutline = false; // Is it drawn with its black outline? Without, it's all colour (until the video's ready, when it's drawn as usual)
const mouseEdge = 0.5; // ...and without it, how thick a hairline goes round it instead, in screen pixels (0 = none)
// Its trail: a noisy line stretching behind it, about as wide as it is, its width swelling and thinning and its middle
// wandering a little from side to side, with rough edges. It's a mask: the moving colours of the Luminin (the same
// video as its inside, see lumininVideo) show through it. The line's painted on a map of the ground seen from above,
// which is never cleared, and every frame the map is laid on the ground in perspective, a strip at a time, so the trail
// stays where it was left, getting smaller in the distance, with everyone walking over it.
const trailOn = true;
const trailWidth = 0.14; // How wide the line is, as a share of the width of its picture: about as wide as its body
const trailSwell = 0.35; // How much its width swells and thins along it (0 = not at all, 1 = from nothing to twice as wide)
const trailWander = 0.03; // How far its middle wanders from side to side of where it walked, as a share of its own width
const trailNoise = 0.012; // How quickly the swelling and wandering change along it (bigger = more often), per pixel of the map
const trailRough = 0.12; // How rough its edges are, as a share of its width
const trailFlat = 0.42; // How squashed the paint looks lying on the ground, seen at an angle (sets the map's proportions)
const trailHueOffset = 120; // How far round the colour wheel its colours are from the mouse's, in degrees (120 = a third of the way)
const trailEdge = false; // Is there a hairline round its edges, as round the mouse (see mouseEdge)?
const trailVideoZoom = 0.5; // How much of the video's width shows across the screen through it (smaller = closer in, bigger colours)
const trailMapMost = [4096, 2048]; // The biggest the map gets, in pixels, across and from near to far

function insideSheet() {
  const canvas = document.createElement('canvas');
  canvas.width = mouseSheet.width;
  canvas.height = mouseSheet.height;
  const context = canvas.getContext('2d');
  context.drawImage(mouseSheet, 0, 0);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const light = (data[i] + data[i + 1] + data[i + 2]) / (3 * 255);
    // Only what's white: the black lines, and their soft edges, go see-through
    data[i + 3] = Math.round(data[i + 3] * Math.max(0, (light - 0.5) / 0.5));
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function showMouseInside(ctx, seconds, cellX, cellY, cellWidth, cellHeight) {
  const video = lumininVideo;
  if (!video || video.readyState < 2 || !video.videoWidth) return; // Plain white until the video's ready
  mouseInside ??= insideSheet();
  mouseInsideCut ??= document.createElement('canvas');
  const cut = mouseInsideCut;
  if (cut.width !== Math.ceil(cellWidth) || cut.height !== Math.ceil(cellHeight)) {
    cut.width = Math.ceil(cellWidth);
    cut.height = Math.ceil(cellHeight);
  }
  const context = cut.getContext('2d');
  // The video first, then cut to the mouse's white parts. (The other way round, the video drawn 'source-in' over
  // the mouse's shape, Safari, and so every browser on an iPhone, ignores the shape and fills the whole picture.)
  context.globalCompositeOperation = 'copy';
  keepLumininPlaying(video);
  context.filter = `brightness(${mouseInsideBright}) saturate(${mouseInsideSaturate}) hue-rotate(${(seconds * mouseInsideHueTurn) % 360}deg)`;
  const sourceWide = video.videoWidth * mouseInsideZoom;
  const sourceTall = (sourceWide * cut.height) / cut.width;
  context.drawImage(video, (video.videoWidth - sourceWide) / 2, (video.videoHeight - sourceTall) / 2, sourceWide, sourceTall, 0, 0, cut.width, cut.height);
  context.filter = 'none';
  if (inverted) {
    // Turned inside out now, so that turning the whole picture inside out at the end brings its colours back
    context.globalCompositeOperation = 'difference';
    context.fillStyle = 'white';
    context.fillRect(0, 0, cut.width, cut.height);
  }
  context.globalCompositeOperation = 'destination-in';
  // (Without its outline, its whole shape takes the colours, lines and all; with it, only its white parts do)
  context.drawImage(mouseOutline ? mouseInside : mouseSheet, cellX, cellY, cellWidth, cellHeight, 0, 0, cut.width, cut.height);
  context.globalCompositeOperation = 'source-over';
  if (!mouseOutline && mouseEdge > 0) {
    // A hairline round it: its shape in black, nudged a fraction of a pixel every way, under its colours
    mouseEdgeCut ??= document.createElement('canvas');
    const edge = mouseEdgeCut;
    if (edge.width !== cut.width || edge.height !== cut.height) {
      edge.width = cut.width;
      edge.height = cut.height;
    }
    const edgeContext = edge.getContext('2d');
    edgeContext.globalCompositeOperation = 'copy';
    edgeContext.drawImage(cut, 0, 0);
    edgeContext.globalCompositeOperation = 'source-in';
    edgeContext.fillStyle = 'black';
    edgeContext.fillRect(0, 0, edge.width, edge.height);
    edgeContext.globalCompositeOperation = 'source-over';
    const unit = Math.abs(ctx.getTransform().a) / density; // Screen pixels in one of the mouse's own
    const nudge = mouseEdge / unit;
    for (let turn = 0; turn < 8; turn++) {
      const angle = (turn / 8) * Math.PI * 2;
      ctx.drawImage(edge, -mouseFeetX + Math.cos(angle) * nudge, -mouseFeetY + Math.sin(angle) * nudge, mouseWidth, mouseHeight);
    }
  }
  ctx.drawImage(cut, -mouseFeetX, -mouseFeetY, mouseWidth, mouseHeight);
  if (trailOn) leaveTrail();
}

let mouseEdgeCut = null; // Its shape in black, for the hairline
let mouseFace = null; // Its face in thin lines (see paintMouseFace())

// The map of the ground the trail's painted on (see trailOn): x across, as in the world, and its depth from far (the
// top) to near (the bottom), each scaled so a round dab of paint looks the way a flat round thing on the ground would
let trailMap = null;
let trailLast = null; // Where the line was last painted to, on the map
let trailAlong = 0; // How far along the line it's painted, on the map (where the noise is read from)
let trailMask = null; // A canvas the size of the screen: the map laid on the ground, this frame
let trailColour = null; // ...and the video, cut to it
let trailOutline = null; // ...and the hairline round it

function setupTrail() {
  // How far the map reaches: as far sideways as the mouse can go, and from just behind where it starts to past the furthest hole
  const nearest = mouseEntersFrom - 0.2;
  const furthest = Math.max(mouseHome, ...holes.map((hole) => hole.depth ?? 0)) + 0.6;
  const reach = (holeReach ?? 0) + width / 2 / sizeOf(furthest) + 100;
  // How many of the map's pixels for each of the world's: across, about one, and from near to far, enough that a round
  // dab of paint looks squashed by trailFlat just in front of where the camera keeps the mouse
  let across = 1;
  const big = sizeOf(mouseHome);
  const downScreen = (groundAt(sizeOf(mouseHome - 0.01), bottomSize()) - groundAt(sizeOf(mouseHome + 0.01), bottomSize())) / 0.02;
  let along = (downScreen * across) / (trailFlat * big);
  across = Math.min(across, trailMapMost[0] / (reach * 2));
  along = Math.min(along, trailMapMost[1] / (furthest - nearest));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(reach * 2 * across);
  canvas.height = Math.ceil((furthest - nearest) * along);
  trailMap = { canvas, context: canvas.getContext('2d'), reach, furthest, nearest, across, along, painted: null };
}

const onMap = (x, depth) => [(x + trailMap.reach) * trailMap.across, (trailMap.furthest - depth) * trailMap.along];

// Each frame: the line painted on from where it was last painted to where it is now
function leaveTrail() {
  if (!trailMap || mouse.falling !== null) return;
  const point = onMap(mouse.x, mouse.depth);
  if (point[1] < 0 || point[1] > trailMap.canvas.height || point[0] < 0 || point[0] > trailMap.canvas.width) return;
  if (!trailLast) {
    trailLast = point;
    return;
  }
  const [dx, dy] = [point[0] - trailLast[0], point[1] - trailLast[1]];
  const far = Math.hypot(dx, dy);
  if (far < 1) return;
  const own = mouseWidth * mouseScale * trailMap.across; // Its own width, on the map
  const side = [-dy / far, dx / far]; // Square to the way it's going
  const context = trailMap.context;
  context.fillStyle = 'white';
  // Dabs a pixel apart along the way, each as wide as the line is there, set off to the side as far as it's wandered
  for (let step = 1; step <= far; step++) {
    const along = trailAlong + step;
    const swell = 1 + trailSwell * (noise(along * trailNoise, 0) * 2 - 1) * 2;
    const wander = trailWander * own * (noise(along * trailNoise, 10) * 2 - 1) * 2;
    const radius = Math.max(0.5, (own * trailWidth * Math.max(0, swell) * (1 + trailRough * (Math.random() * 2 - 1))) / 2);
    const x = trailLast[0] + (dx * step) / far + side[0] * wander;
    const y = trailLast[1] + (dy * step) / far + side[1] * wander;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    const p = trailMap.painted;
    const [left, top, right, bottom] = [Math.floor(x - radius), Math.floor(y - radius), Math.ceil(x + radius), Math.ceil(y + radius)];
    trailMap.painted = p
      ? { left: Math.min(p.left, left), top: Math.min(p.top, top), right: Math.max(p.right, right), bottom: Math.max(p.bottom, bottom) }
      : { left, top, right, bottom };
  }
  trailAlong += far;
  trailLast = point;
}

// The map laid on the ground in perspective: for each thin strip of the screen across the painted part of the ground,
// the row of the map at that distance, stretched to how big things are there
function showTrail(screen) {
  const map = trailMap;
  if (!map?.painted) return;
  const video = lumininVideo;
  if (!video || video.readyState < 2 || !video.videoWidth) return;
  const [wide, tall] = [Math.ceil(width * density), Math.ceil(height * density)];
  trailMask ??= document.createElement('canvas');
  trailColour ??= document.createElement('canvas');
  for (const canvas of [trailMask, trailColour]) {
    if (canvas.width !== wide || canvas.height !== tall) {
      canvas.width = wide;
      canvas.height = tall;
    }
  }
  const ctx = trailMask.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, wide, tall);
  const bottom = bottomSize();
  const depthAt = (y) => view.depth - Math.log(sizeAt(y) / bottom); // The depth of the ground this far down the screen
  const toY = (depth) => groundAt(sizeOf(depth), bottom);
  const top = Math.max(0, toY(map.furthest - map.painted.top / map.along));
  const end = Math.min(height, toY(map.furthest - map.painted.bottom / map.along));
  ctx.setTransform(density, 0, 0, density, 0, 0);
  ctx.globalAlpha = 1;
  const strip = 1;
  for (let y = Math.floor(top); y < end; y += strip) {
    const size = sizeAt(y + strip / 2);
    const rowTop = (map.furthest - depthAt(y)) * map.along;
    const rowBottom = (map.furthest - depthAt(y + strip)) * map.along;
    // Only the part of the map that's painted, and on the screen
    let from = Math.max(map.painted.left, (view.x - width / 2 / size + map.reach) * map.across);
    let to = Math.min(map.painted.right, (view.x + width / 2 / size + map.reach) * map.across);
    const sourceTop = Math.max(0, rowTop);
    const sourceBottom = Math.min(map.canvas.height, rowBottom);
    from = Math.max(0, from);
    to = Math.min(map.canvas.width, to);
    if (to <= from || sourceBottom <= sourceTop) continue;
    const screenFrom = width / 2 + (from / map.across - map.reach - view.x) * size;
    const screenTo = width / 2 + (to / map.across - map.reach - view.x) * size;
    // (At least a whole row of the map, centred on the strip. The strips meet exactly, a whole pixel each: the paint's
    // see-through, so any overlap would show as a darker line.)
    const rows = Math.max(1, sourceBottom - sourceTop);
    const rowsTop = Math.max(0, Math.min(map.canvas.height - rows, (sourceTop + sourceBottom) / 2 - rows / 2));
    ctx.drawImage(map.canvas, from, rowsTop, to - from, rows, screenFrom, y, screenTo - screenFrom, strip);
  }
  // The video, over the whole screen, cut to the mask. (The video first and then the mask 'destination-in', not the
  // other way round, which Safari gets wrong: see showMouseInside())
  const colour = trailColour.getContext('2d');
  colour.setTransform(1, 0, 0, 1, 0, 0);
  colour.globalCompositeOperation = 'copy';
  colour.filter = `brightness(${mouseInsideBright}) saturate(${mouseInsideSaturate}) hue-rotate(${((millis() / 1000) * mouseInsideHueTurn + trailHueOffset) % 360}deg)`;
  const sourceWide = video.videoWidth * trailVideoZoom;
  const sourceTall = Math.min(video.videoHeight, (sourceWide * tall) / wide);
  const shownWide = (sourceTall * wide) / tall;
  colour.drawImage(video, (video.videoWidth - shownWide) / 2, (video.videoHeight - sourceTall) / 2, shownWide, sourceTall, 0, 0, wide, tall);
  colour.filter = 'none';
  if (inverted) {
    // Turned inside out now, so that turning the whole picture inside out at the end brings its colours back
    colour.globalCompositeOperation = 'difference';
    colour.fillStyle = 'white';
    colour.fillRect(0, 0, wide, tall);
  }
  colour.globalCompositeOperation = 'destination-in';
  colour.drawImage(trailMask, 0, 0);
  colour.globalCompositeOperation = 'source-over';
  screen.setTransform(1, 0, 0, 1, 0, 0);
  screen.globalAlpha = 1;
  if (trailEdge && mouseEdge > 0) {
    // A hairline round it, as round the mouse: its shape nudged a fraction of a pixel every way, with its shape itself
    // cut out of the middle, so it's only an outline (where the video's cut out, the ground shows, not black), in black
    trailOutline ??= document.createElement('canvas');
    const outline = trailOutline;
    if (outline.width !== wide || outline.height !== tall) {
      outline.width = wide;
      outline.height = tall;
    }
    const edge = outline.getContext('2d');
    edge.globalCompositeOperation = 'copy';
    edge.drawImage(trailMask, 0, 0);
    edge.globalCompositeOperation = 'source-over';
    const nudge = mouseEdge * density;
    for (let turn = 0; turn < 8; turn++) {
      const angle = (turn / 8) * Math.PI * 2;
      edge.drawImage(trailMask, Math.cos(angle) * nudge, Math.sin(angle) * nudge);
    }
    edge.globalCompositeOperation = 'destination-out';
    edge.drawImage(trailMask, 0, 0);
    edge.globalCompositeOperation = 'source-in';
    edge.fillStyle = 'black'; // (As the mouse's: turning the whole picture inside out at the end turns both)
    edge.fillRect(0, 0, wide, tall);
    edge.globalCompositeOperation = 'source-over';
    screen.drawImage(outline, 0, 0);
  }
  screen.drawImage(trailColour, 0, 0);
}

// The mouse, drawn facing whichever way it's going (see moveMouse())
function showMouse(ctx, seconds) {
  let bigger = sizeOf(mouse.depth);
  let action = mouse.walking ? mouseWalking : mouse.bow > 0 ? mouseLowering : mouseSitting;
  let step = mouse.walking ? mouse.walked : action === mouseLowering ? mouse.bow * (mouseSteps - 1) : seconds * mouseSwings;
  let cellWidth = mouseSheet.width / mouseSteps;
  let cellHeight = mouseSheet.height / (mouseViews * mouseActions);
  let size = bigger * mouseScale * (1 - (mouse.falling ?? 0)); // Dropping into a hole, it gets smaller
  ctx.globalAlpha = 1;
  ctx.setTransform(mouse.facing * size * density, 0, 0, size * density, screenX(mouse.x, bigger) * density, groundAt(bigger, bottomSize()) * density);
  let cellX = (Math.floor(step) % mouseSteps) * cellWidth;
  let cellY = (mouse.view * mouseActions + action) * cellHeight;
  lumininVideo ??= startLumininVideo();
  const videoReady = lumininVideo && lumininVideo.readyState >= 2 && lumininVideo.videoWidth;
  if (mouseOutline || !videoReady) ctx.drawImage(mouseSheet, cellX, cellY, cellWidth, cellHeight, -mouseFeetX, -mouseFeetY, mouseWidth, mouseHeight);
  showMouseInside(ctx, seconds, cellX, cellY, cellWidth, cellHeight);
  // Filled with colour, its face goes over the top in thin lines
  if (!mouseOutline && videoReady && mouseFace) ctx.drawImage(mouseFace, cellX, cellY, cellWidth, cellHeight, -mouseFeetX, -mouseFeetY, mouseWidth, mouseHeight);
}

// How far down the screen the ground is under a figure of this size.
//
// The ground lifts steadily with distance, counted in how many times smaller the figures have
// got (a log, so it keeps on rising instead of stopping at the horizon). That gives the rows a
// smallest gap they settle toward. The figures keep shrinking, so against them the ground looks
// steeper and steeper. Lifting any faster than this would make the gaps shrink and then grow
// again, which looks like a dip in the ground.
function groundAt(size, bottomSize) {
  let distance = Math.max(0, Math.log(bottomSize / size));
  return horizon * height + cameraHeight * size - curl * height * distance;
}

// A number from 0 to 1 that's always the same for the same input, but looks random
function hash(x) {
  let h = Math.sin(x * 12.9898) * 43758.5453;
  return h - Math.floor(h);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (pixelDensity() !== density) pixelDensity(density);
  buildCrowd();
}

// This file is a module, so its functions aren't global by default.
// Putting them on window lets p5 find them and run in "global mode".
window.setup = setup;
window.draw = draw;
window.windowResized = windowResized;
