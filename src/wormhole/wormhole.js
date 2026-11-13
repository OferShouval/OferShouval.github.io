import p5 from 'p5';
import spiralWorm from './spiral-worm.js';
import { soundButton, startAudio, soundWanted, onSoundChange } from '../scripts/sound.js';

// The wormhole on the front page: old sketches from the sketchbook, as one continuous piece, that turn into each other on the same canvas.
//
// There are no cuts. Every stage is a list of settings, and the settings always drift toward the current
// stage's, and whatever's been painted is what the next sketch starts from. Among the flowers, the pixel array
// closes in as a circle from the corners, like a tunnel, more quickly if the worm's boosting. The flowers and the
// worm carry on as they were while shrinking away, into the array, with the worm's head pulled more and more to the
// middle and the array getting closer to static, the flowers still flying past. When the worm's a few pixels wide, or
// once it's been long enough (see arrayHold), the array absorbs it, and it cuts
// to the noisy spiral bursting out, white on black, with lightning, some of it in the colours of the Luminin. That last
// stage is a sketch of its own, spiral-worm.js, which this hands the screen over to: the spiral waits with three portals
// round it, to art, music and bio, and once one's chosen, it unwinds into a worm, which flies on into the chosen portal. The skip link at the bottom goes straight to the portals.
//
// Playing moves it along (see screensToNext), and it carries on slowly by itself if nobody's playing
// (see secondsToNext). Psychworm moves on when it's clicked, by flying through a flower: each of its segments turns into
// a flower as it passes through, and it carries on through a field of them. Each sketch also has its own file in
// src/sketchbook/ (wake.js, psychworm.js, flowers.js, pixel-array.js, noisy-spiral.js). This file has its own blended
// version of them, so changing one of those files doesn't change this piece. (Curves, finger aulos, boxyworm and linear
// boil were once stages here too: they're in save/36-stretch-portals, and in src/sketchbook/.)
//
// It opens on the first stage with a welcome: "welcome to my wormhole", and then "click anywhere to enter" with a
// "sound on?" button under it (see runIntro()), and waits there
// until someone presses, anywhere, which begins the journey into the next stage.
//
// The speaker at the bottom turns the sound on and off, for the whole site (see src/scripts/sound.js). Any stage
// can use it: `sound` is an AudioContext once it's been turned on, which stays silent while it's switched off.

const stages = [
  {
    name: 'wake',
    hint: 'hold to turn it white',
    settings: { length: 150, flat: 1, scatter: 1, wash: 255, washHeld: 255, low: 150, whiteHeld: 1, body: 1, bloom: 0, ground: 0, space: 0 },
  },
  {
    name: 'psychworm',
    hint: 'hold to leave trails',
    through: 'flowers', // The stage that going through the ring leads to
    settings: { length: 70, flat: 0, scatter: 0, wash: 50, washHeld: 0, low: 100, whiteHeld: 0, body: 1, bloom: 0, ground: 0, space: 1 },
  },
  {
    name: 'flowers',
    hint: 'hold for a boost, let go to burst, drag to plant more',
    settings: { length: 70, flat: 0, scatter: 0, wash: 255, washHeld: 255, low: 100, whiteHeld: 0, body: 1, bloom: 1, ground: 255, space: 1 },
  },
  // The pixel array used to be a stage of its own here. It's part of the flowers stage now (see arrayHold).
  {
    name: 'noisy spiral',
    hint: 'choose where to go', // (It waits with the portals round it, see spiral-worm.js)
    sketch: spiralWorm, // The stage is this sketch, which takes over the screen (see handOver())
    settings: {}, // It takes over the screen straight away, so this one never draws it
  },
];
const after = '/art/'; // Where it goes after the last stage

// The welcome: "welcome to my wormhole", and then, in the same place, "click anywhere to enter", which stays until
// someone enters. Entering turns the sound on. The sound switch is hidden until then, and then it's at the bottom.
const welcomeTime = 6; // How many seconds "welcome to my wormhole" is up for
const introGap = 1.3; // How many seconds from it starting to fade out to the rest starting to fade in
// The wake's rings: they keep spreading all their lives, fading as they go, so the ones further out are the faintest,
// and they're drawn as if by hand (see drawWakeRing), with little ripples within them now and then (see drawWithin)
const wakeGrow = 1.8; // How big they get, compared to how big the wake's rings used to get at their biggest
const wakeSpreadCurve = 1; // How they spread over their lives (1 = steadily, less = quickly at first, then slowing)
const wakeFadeCurve = 1.5; // How much more they fade as they spread (1 = as they used to, more = fainter further out)
const wakeWeightAtTop = 0.4; // How thick their lines are at the top of the screen, compared to at the bottom
const wakeWobble = 0.03; // How much their edges wobble, as a share of how big they've got past wakeWobbleFrom
const wakeWobbleFrom = 60; // How wide they get before they start to wobble, in pixels (the small ones in the middle stay round)
const wakeWobbleMost = 14; // The most they wobble, in pixels
const wakeHandPress = 0.45; // How much their lines swell and thin as they go round, as if pressed and lifted (0 = even)
const wakeHandTaper = 0.12; // How much of the way round their lines' start and end taper over
const wakeHandTaperLeast = 0.15; // How thin their lines start and end, compared to the rest
const wakeHandGap = 0.04; // How far short of meeting itself a line can stop, or past it go, as a share of the way round
const withinPerSecond = 3; // How many little ripples a second come up within the rings
const withinFrom = 0.2; // Which rings they come up in, by how far through their lives they are, from...
const withinTo = 0.75; // ...to (0 is the oldest, 1 the newest)
const withinSize = [20, 60]; // How wide they get, in pixels across, at the bottom of the screen
const withinRings = [2, 3]; // How many rings each has
const withinTime = [0.8, 1.5]; // How many seconds they take to spread and fade
const withinStrength = 0.7; // How strong they are, from 0 to 1
const morphTime = 2.5; // How quickly the settings drift to the next stage's, in seconds (bigger = slower)
// Pressing to begin forms the worm where it was pressed: the wake's scattered all over the screen, so first it gathers
// into a circle around there, then into the worm, which then drifts off from there on its own way
const formRound = 0.3; // How far into turning into the worm the wake's become a circle, from 0 to 1
const formRadius = 0.45; // How big the circle is, as a share of the smaller side of the screen
const formTime = 7; // How many seconds the worm takes to drift from where it formed onto its own way
const screensToNext = 25; // How far the pointer travels to reach the next stage, in lengths of the screen's diagonal
const stageSeconds = 15; // Roughly how long each stage lasts if nobody plays with it (the first waits to be pressed). The
// stages that end in their own ways are timed to it: see ringLongest. (The flowers stage has its own timing: see arrayDelay, arrayTime and arrayHold.)
const secondsToNext = stageSeconds; // How long a stage lasts if nobody plays with it, unless it has its own `seconds`
const idleTime = 5; // How many seconds after the pointer stops before the sketch starts moving by itself
// In space, the worm weaves along by itself and the camera follows just above and behind it
const weaveSpeed = 0.2; // How quickly it weaves (smaller = slower)
const weaveWide = 1.3; // How far it weaves from side to side, as a share of the screen's width
const weaveTall = 0.6; // ...and up and down, as a share of the screen's height
const bodyTime = 4; // How many seconds back along its path its tail is, which sets how much of the weave shows
const tailWander = 0.15; // How quickly its tail drifts around the screen (smaller = slower)
const tailWide = 0.4; // How far it can drift from the middle of the screen, as a share of the width: small enough that it can't leave it
const tailTall = 0.1; // ...and up and down, as a share of the height
const tailDistance = 0.9; // How far its tail is from the camera (1 = at its full size, and less is nearer). Too near and it's off the bottom of the screen.
const headDistance = 4; // How far its head is
const spaceHorizon = 0.25; // How far down the screen the point straight ahead of the camera is
const cameraAbove = 0.5; // How far the camera is above it, as a share of the screen's height (bigger = looking down more)
const bodyScale = 2; // How big it's drawn, compared to its size when it isn't in space
// In space a flower waits up ahead, labelled, with the next stage to be seen through its middle. A click, or
// enough time going by, brings it toward the camera, the worm goes through its middle, and that leads to the next stage.
const ringLead = 5; // How many seconds after it sets off the worm's head gets to it
const ringWait = tailDistance + (headDistance - tailDistance) * (1 + ringLead / bodyTime); // How far away it waits, in the same units as headDistance
const ringSmall = 0.2; // How big it is while it waits, compared to what it would be at the worm's head
const ringCovers = 9.7; // How many seconds after it sets off it's covered the screen
const psychwormSeconds = 22; // Roughly how long the psychworm stage lasts if nobody clicks, a little longer than the others
const ringLongest = Math.max(0, psychwormSeconds - ringCovers); // How many seconds into the stage it comes by itself, if nobody's clicked, so it's gone through after psychwormSeconds
const ringRush = 0.2; // How much its growth keeps speeding up on the way, so it never seems to slow (0 = steady, 1 = most of it at the end)
const ringFade = 3; // How slowly the next stage's ground fades from the colour of the flower's middle, in seconds (bigger = slower)
const ringSpin = 0.25; // How quickly it turns, in radians per second
const ringNearest = 0.05; // How near it can get, if the circle in its middle hasn't covered the screen by then
const ringBehind = 0; // How far the camera is above the worm once it's right behind it, as a share of the screen's height
const ringLinedUp = 5.2; // How far away the flower is when the camera's lined up with it, which is before the worm's head gets to it
const ringWash = 160; // How quickly the paint fades while the ring's there, so that the ring doesn't leave a smear behind it
const portalSeeThrough = 0.5; // How see-through the flower is while the mouse isn't over it (1 = solid)
const portalHoverEase = 0.15; // How quickly it turns solid or see-through, in seconds
const ringSize = 1.7; // How wide the circle in its middle is, compared to the widest the worm can be
const trailFade = 2.5; // How many seconds the trails left while holding take to fade once it's let go
const wormFollow = 0.7; // How closely the worm follows the mouse, at most (1 = exactly, 0 = not at all)
const steerFollow = 0.05; // How quickly the place it's following catches up with the mouse
const focusFollow = 0.06; // How quickly the point the stars stream from catches up with where it's heading
const starCount = 120;
const pondSettle = 5; // Coming from the pond (see fromPond), how many seconds the camera takes to start drifting as it
// usually does, and the worm to start following the mouse, and the stars to come in (they're eased in over that)
const starSpeed = 0.35; // How much of the way to the camera a star comes each second
const fieldCount = 1100; // How many flowers fly by at once, the way the stars do
const fieldSpeed = 0.28; // How much of the distance to the camera they come each second, so they slow down as they get near
const fieldStream = 2.5; // Sets how many appear each second: fieldCount * fieldSpeed / this
const fieldLane = 0.15; // They start at least this far from straight ahead, so they all leave the screen rather than coming right at the camera
const fieldPace = 0.5; // How fast the worm weaves among them, compared to its speed in space
const fieldDelay = 2; // How many seconds after the worm gets there they start to appear
const fieldDrift = 1; // The fastest they drift across the screen as well, in pixels per frame
const fieldSize = 0.25; // How big they are when they first appear, on a screen whose shorter side is 800 pixels
const fieldBiggest = 0.2; // The longest their petals can grow, as a share of the screen's shorter side
const fieldGrow = 1.05; // How quickly they get bigger as they get nearer (1 = in true perspective, and more is quicker)
const fieldFade = 0.3; // How far they come before they've faded in, as a share of the way from where they appear
const fieldClosing = 0.5; // How much smaller they've got by the time the pixel array has covered the screen, from 0 to 1
const mostFlowers = 1400;
const plantedDrift = 2; // How fast planted flowers drift away from the middle of the stream, in pixels per frame. Near it they'd hardly move otherwise.
const burstReach = 1.6; // Going through the ring, how far the worm's flowers are thrown, at most, as a share of the screen's width
const burstExtra = 400; // How many more flowers it throws out, from all along it, which carry on off the screen rather than going back into the worm
const burstExtraSpeed = [0.3, 1]; // How fast they carry on, in shares of the screen's width per second
const burstExtraSize = [0.4, 2.2]; // How big they are, compared to usual, at the least and the most
const burstStay = 0.25; // How many of them (from 0 to 1) stay on the screen instead, each flying out to a spot of its own
// anywhere on it, so they're evenly spread. Once they've landed they join the flowers flying by, toward the edges.
const burstLand = 0.8; // How many seconds after the burst they've landed and join them
const burstLandPace = 3; // ...and how many times faster than the others they then fly toward the edges
// Coming through the ring, as the worm's turned into flowers, the field's colour fades in, then the flower worm
// wobbles, more and more, and bursts
const bloomFade = 0.6; // How many seconds it waits, as the field's colour fades in
const bloomWobbleTime = 0.9; // ...and then how many seconds it wobbles before it bursts
const bloomWobble = 0.35; // How far its flowers wobble about, at the most, compared to how big they are
const bloomWobbleSpeed = 9; // How quickly they wobble, in radians a second
const bloomFaint = 0.35; // How see-through the flower worm is, from turning into flowers until it bursts (1 = solid)
const bloomSolid = 1.5; // How many seconds it takes to come back to solid, once it's burst
const burstOut = 5; // How quickly they fly out (bigger = quicker)
const burstApart = 2; // How far the worm's own flowers are thrown, compared to burstReach
const burstReturn = 1.5; // How slowly they settle back into the shape of the worm (bigger = slower)
const boostRise = 2; // How quickly holding the mouse down adds speed, in multiples of the usual speed each second
const boostMost = 6; // The most speed it can add
const boostFade = 1.5; // How slowly it wears off when let go, in seconds (bigger = slower)
const boostSpin = 4; // How many times faster than usual the worm's flowers spin at the top speed, on top of their usual spin
// Letting go of the mouse makes the worm explode, more the longer it was held
const explodeCharge = 3; // How many seconds of holding it takes to reach the biggest explosion
const explodeLeast = 0.05; // How far its flowers are thrown by a quick click, as a share of the screen's shorter side
const explodeMost = 0.8; // ...and by the longest hold
const explodeJets = [2, 6]; // Every explosion throws its flowers out in a few jets, in random directions: this many, at the least and the most
const explodeJetWidth = [0.15, 0.9]; // How wide a jet is, in radians, at the least and the most
const explodeStray = 0.2; // How many of the flowers ignore the jets and go anywhere
const explodeUneven = 2.5; // How uneven the distances are: most flowers stay near, and a few go a long way (1 = evenly spread)
const explodeSpeed = [2, 9]; // How quickly a flower flies out, at the least and the most (bigger = quicker)
const explodeReturn = [0.7, 2.6]; // How slowly a flower comes back, in seconds, at the least and the most
const explodeGrow = 0.5; // How much of its lost size a flower gets back while it's exploding (1 = all of it)
const wormStays = 0.6; // How far the tunnel's closed in (from 0 to 1) before the worm starts to move off into the distance, staying close until then
const wormShrink = 6; // How slowly the worm shrinks away once it's started, in seconds (bigger = slower). Boosting speeds it up.
const wormAbsorbedAt = 5; // How wide the worm is, in pixels, when the pixel array absorbs it and the noisy spiral bursts out
const wormStretch = 4; // How many times longer the worm's stretched by the end of the pixel array, as it nears the noisy spiral
const wormThin = 0.25; // ...and how much thinner it is by then (1 = not at all)
const wormAbsorbTime = 0.35; // How many seconds it takes to go from there
// In the flowers, the pixel array closes in as a circle from the corners, like a tunnel, until it's taken over
const arrayDelay = 10; // How many seconds into the stage it starts, so the flower worm has a while to itself
// Once the array's absorbed the worm, all static, it switches off like an old TV: the picture squashes to a bright line
// across the middle, the line shrinks to a bright dot, and the dot fades, before the noisy spiral bursts out of the dark
const tvSquash = 0.28; // How many seconds squashing to a line takes
const tvShrink = 0.22; // ...shrinking the line to a dot
const tvFade = 0.4; // ...and the dot fading away
const arrayHold = 10; // How many seconds the flowers go on once the pixel array's covered the screen, while the worm stretches and shrinks away, before it's absorbed anyway
const arrayTime = 10.5; // How many seconds it takes to cover the screen, at the worm's usual speed. Boosting speeds it up by as much.
// Once it's covered the screen, it slowly looks more and more like it's on an old TV: its edges pull in to a rounded
// screen, darker toward its edges, with black around it. Then it cracks: seams break through it, more and more, from
// working the pattern out as if the screen were the wrong width, so each row slips out of step with the one above
const crtTime = 7; // How many seconds taking on the old TV's shape takes, easing in and out
const crtInset = 0.25; // How far its edges pull in, as a share of the screen's smaller side
const crtCorner = 0.16; // How round its corners get, as a share of the screen's smaller side
const crtShade = 0.75; // How dark it gets at its edges (1 = black)
const crackAfter = 4; // How many seconds after it's covered the screen it starts to crack
const crackTime = 4.5; // How many seconds the cracks take to spread
const crackMost = 0.3; // How wrong the width gets, as a share of the real one, by the end
// It moves by itself, as if a mouse were spiralling out from the middle and then going around the edges of the screen
const pathTurns = 1.5; // How many times it goes around on the way out. Any faster and every pixel changes every frame, which flashes.
const pathOut = 35; // How many seconds it takes to get out to the edges. Boosting doesn't speed it up.
const pathEdge = 0.96; // How far out it goes, as a share of the way to the edge of the screen
// It gets closer and closer to pure static as the worm gets near to being absorbed
const noiseFrom = 60; // How wide the worm is when that starts, in pixels
const noiseFinest = 1.5; // The value of the mouse the pattern ends up using, which is where it's all static
const noiseFollow = 0.03; // How quickly it follows how wide the worm is, each frame
const pixelFollow = 0.1; // How quickly the pixel array catches up with the pointer, each frame
const pixelDriftSpeed = 0.02; // How quickly its curves always flow out of the corners, each frame
const staticReach = 40; // How far from the middle, across the half-size picture, its static starts
const scanSpeed = 0.05; // How quickly its slow waves of colour roll, each frame
const scanEdgeSpeed = 2; // How many times faster they roll with the pointer at the top or bottom
const scanTurn = 0.05; // How quickly they reverse, when the pointer crosses the middle: down when it's above, up when it's below
// spiral-worm.js flashes fragments of this video as lightning. It starts loading in the flowers, so it's ready by then.
const strikeClip = '/media/lumininCloseupStabilized.mp4';

const slug = (name) => name.replace(' ', '-');

// options.fromPond: when the pond (pond.js, the way in on the front page) hands over to it, with its worm (see handOver
// there): then it begins straight at the psychworm stage, past the welcome, with its worm carrying on just as the pond's
// was, at the same place on the same path (the pond's worm weaves along the same Perlin noise, which it's given), drawn
// by hand as the pond's was (see drawHandRing()), with the camera drifting and the worm following the mouse only bit by
// bit (see pondSettle). Without it, it begins with the welcome.
export default function wormhole(p, container, options = {}) {
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const now = { ...stages[0].settings };
  let current = 0;
  let progress = 0;
  let trail = [];
  let focus = { x: 0, y: 0 }; // The point the worm's heading for, which the stars stream from
  let stageStart = 0;
  let burstStart = null; // When the worm burst into flowers, having gone through the ring
  let bloomStart = null; // When it came through the ring, as the flower worm
  let heldFrom = 0; // When the mouse was pressed
  let portalSeen = portalSeeThrough; // How solid the flower is now (see portalSeeThrough)
  let releasedAt = -Infinity; // When the mouse was last let go, so the trails held fade out (see trailFade)
  let boost = 0; // How much extra speed there is from holding the mouse down
  let thrownOut = []; // The extra flowers it threw out
  let pathTime = 0; // How far along its path the worm's got, in seconds at its speed in space
  let ringDistance = null; // How far away the ring is, while there is one
  let ringMeets = 0; // When the worm's head gets to it, which says where on the worm's path it is
  let ringWaiting = false; // Is it still waiting for a click?
  let portal = null; // The flower itself
  let groundColour = [0, 0, 0]; // The colour of the middle of the flower that was last gone through
  let groundTint = 0; // How much of that colour is still in the ground (0 = none)
  let steer = { x: 0, y: 0 }; // The place the worm's following, which is the mouse, a little behind
  const steerTrail = []; // Where that's been, so that the rest of the worm can follow it later
  let ringPull = 0; // How far the view has shifted to put the worm through the ring (0 = not at all)
  const stars = [];
  let field = []; // The flowers flying by, furthest first
  let fieldDue = 0; // How many more are due to appear
  const segments = []; // The flowers that the worm is made of, once it's been through the ring
  let frameTime = 0;
  // While the flowers are faint, they're drawn solid here first (see drawWorm())
  const faintLayer = document.createElement('canvas');
  const faintContext = faintLayer.getContext('2d');
  const pixelCanvas = document.createElement('canvas');
  const pixelContext = pixelCanvas.getContext('2d');
  let pixelImage = null;
  let arrayOpening = 0; // How far it's closed in from the corners (1 = it covers the screen)
  let pixelX = 0; // How far from the middle the pointer is, once it's caught up
  let pixelY = 0;
  let arrayPath = 0; // How long it's been moving by itself, while it's been showing
  let pixelDrift = 0;
  let scanDirection = 1; // Which way its waves of colour are heading: 1 is down, -1 is up
  let scanPosition = 0;
  let fieldLeft = 1; // How much of their size the flowers flying by have left
  const clip = document.createElement('video'); // Only for loading the lightning video early (see strikeClip)
  clip.muted = true;
  clip.preload = 'auto';
  let arrayNoise = 0; // How close the pixel array is to pure static (1 = all the way)
  let arrayFullAt = null; // When it covered the screen, in the flowers stage
  let tvOffAt = null; // When it started switching off like an old TV (see tvSquash)
  let tvScreen = null; // Where the old TV's screen was then, in the canvas's own pixels, so it switches off inside it
  const tvPicture = document.createElement('canvas'); // What was on the screen as it switched off
  let wormSize = 1; // How big the worm is, compared to its usual size
  let wormWide = Infinity; // How wide it was on the screen, last frame, in pixels
  let wormAbsorbed = 0; // How far it's gone into the pixel array (1 = gone)
  let wormFront = { x: 0, y: 0 }; // Where its head is, once it's been pulled toward the middle
  let tunnel = 0; // How far the worm and the flowers have shrunk away into the tunnel (1 = all the way)

  let canvas;
  let at = { x: 0, y: 0 }; // Where the worm is heading
  let pointer = { x: 0, y: 0, down: false, lastMoved: -Infinity, travelled: 0 };
  let lastPointer = { x: 0, y: 0 };
  let seconds = 0;
  let leaving = false; // Has it gone on to the art page?
  let begun = false; // Has someone pressed to begin, past the welcome?
  let handedOver = false; // Has a stage that's a sketch of its own taken over the screen? (see handOver())
  let formAt = null; // Where it was pressed, while the worm's forming there (see formRound)
  let formStart = 0;
  let headSeen = null; // Where the worm's head was going to be last frame, before being moved to where it's forming
  const fromPond = options.fromPond ?? null; // The pond's worm, if it came from the pond (see options.fromPond)
  let pondStart = null; // When it began, from the pond
  let pondDrift = { x: 0, y: 0 }; // The camera's drift then, taken off at first, so it's just where the pond's was
  const settled = () => (pondStart === null ? 1 : ease(Math.min(1, (seconds - pondStart) / pondSettle))); // (1 = as usual)
  // Coming back from there with the browser's Back button can restore it just as it was left, all white, so start
  // it fresh instead
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) location.reload();
  });

  let sound = null;
  let soundSwitch;

  const marks = document.createElement('nav');
  marks.className = 'wormhole-marks';
  marks.setAttribute('aria-label', 'skip');
  const soundSpot = document.createElement('div');
  soundSpot.className = 'wormhole-sound-spot waiting'; // Hidden until it begins
  const welcome = document.createElement('div');
  welcome.className = 'wormhole-intro';
  const welcomeWords = document.createElement('span');
  welcomeWords.innerHTML = 'welcome to my<br>wormhole';
  const pressWords = document.createElement('span');
  pressWords.innerHTML = 'click anywhere<br>to enter';
  const lines = document.createElement('div'); // The two lines, one after the other in the same place
  lines.className = 'wormhole-intro-lines';
  lines.append(welcomeWords, pressWords);
  welcome.append(lines);
  let introTimers = []; // What's still to come in the welcome (see runIntro())
  const caption = document.createElement('p');
  caption.className = 'wormhole-caption';
  caption.setAttribute('aria-live', 'polite');

  // The start of a random range of brightness, without the flicker for anyone who's asked for less motion
  const shimmer = (low) => (calm ? (low + 255) / 2 : p.random(low, 255));

  function startSound() {
    sound = startAudio() ?? sound;
  }

  function stopSound() {
    sound?.suspend();
  }

  // A fully saturated colour of the given hue (in degrees round the colour wheel), as [red, green, blue]
  function vivid(hue) {
    const h = (((hue % 360) + 360) % 360) / 60;
    const x = 255 * (1 - Math.abs((h % 2) - 1));
    return [[255, x, 0], [x, 255, 0], [0, 255, x], [0, x, 255], [x, 0, 255], [255, 0, x]][Math.floor(h)];
  }

  function newFlower() {
    return {
      petals: p.random(3, 12),
      petalLength: p.random(30, 80),
      petalWidth: p.random(10, 30),
      middle: p.random(10, 40),
      middleColour: `rgb(${p.random(255)},${p.random(255)},${p.random(255)})`,
      petalColour: `rgb(${p.random(255)},${p.random(255)},${p.random(255)})`,
      spin: p.radians(p.random(1, 8)),
      turned: 0,
      xSpeed: p.random(-fieldDrift, fieldDrift),
      ySpeed: p.random(-fieldDrift, fieldDrift),
      driftX: 0,
      driftY: 0,
    };
  }

  // Goes straight to the canvas, since there can be thousands of petals
  function drawFlower(flower, x, y, scale, alpha = 1, context = p.drawingContext, spinFaster = 1) {
    flower.turned += flower.spin * spinFaster * frameTime * 60;
    const across = flower.petalLength * scale;
    if (scale < 0.005 || x < -across || x > p.width + across || y < -across || y > p.height + across) return;
    context.save();
    context.globalAlpha = alpha;
    context.translate(x, y);
    context.scale(scale, scale);
    context.rotate(flower.turned);
    // The flower the worm goes through has strokes of their own colour
    context.strokeStyle = flower.strokeColour ?? 'black';
    context.lineWidth = (flower.strokeColour ? 1.5 : 1) / scale;
    context.fillStyle = flower.petalColour;
    const turn = p.TWO_PI / flower.petals;
    for (let i = 0; i < flower.petals; i++) {
      context.rotate(turn);
      context.beginPath();
      context.ellipse(flower.petalLength / 2, 0, flower.petalLength / 2, flower.petalWidth / 2, 0, 0, p.TWO_PI);
      context.fill();
      context.stroke();
    }
    context.fillStyle = flower.middleColour;
    context.beginPath();
    context.arc(0, 0, flower.middle / 2, 0, p.TWO_PI);
    context.fill();
    context.stroke();
    context.restore();
  }

  // The patterns come from running x and y through sines, so most of them are in how the pixels happen to land
  // on the waves. It's drawn at half the size and stretched, which is a part of how it looks. See src/testbed/iteration-1.js.
  function drawPixelArray(dt) {
    const opening = moveArrayCircle(dt);
    if (!stages[current].settings.bloom) arrayNoise = 0;
    if (opening <= 0) {
      arrayPath = 0;
      return;
    }
    const w = Math.floor(p.width / 2);
    const h = Math.floor(p.height / 2);
    if (pixelCanvas.width !== w || pixelCanvas.height !== h) {
      pixelCanvas.width = w;
      pixelCanvas.height = h;
      pixelImage = pixelContext.createImageData(w, h);
    }
    // Anyone who's asked for less motion moves it themselves
    arrayPath += dt;
    // At a steady pace along the spiral, so it goes around quickly in the middle, and slowly further out, where
    // the same movement shows as curves flowing rather than as static
    const out = Math.sqrt(Math.min(1, arrayPath / pathOut));
    const turned = pathTurns * p.TWO_PI;
    const angle = turned * (out + Math.max(0, arrayPath - pathOut) / (2 * pathOut));
    const toEdge = p.lerp(1, 1 / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle))), out); // Rounder in the middle, and square to the screen at the edges
    const mouseX = calm ? pointer.x / 2 : (w / 2) * (1 + Math.cos(angle) * toEdge * out * pathEdge);
    const mouseY = calm ? pointer.y / 2 : (h / 2) * (1 + Math.sin(angle) * toEdge * out * pathEdge);
    pixelX = p.lerp(pixelX, Math.max(1, Math.abs(mouseX - w / 2)), pixelFollow);
    pixelY = p.lerp(pixelY, Math.max(1, Math.abs(mouseY - h / 2)), pixelFollow);
    if (!calm) {
      scanDirection = p.lerp(scanDirection, mouseY < h / 2 ? 1 : -1, scanTurn);
      const edge = Math.min(1, pixelY / (h / 2)) ** 2; // How close the mouse is to the top or bottom, from 0 to 1
      scanPosition += scanSpeed * p.lerp(1, scanEdgeSpeed, edge) * scanDirection;
      pixelDrift += pixelDriftSpeed;
    }
    // Near the middle, a tiny random nudge every frame keeps the static going, even if the mouse is still
    const nearMiddle = Math.max(0, 1 - Math.abs(mouseX - w / 2) / staticReach);
    arrayNoise += (p.constrain(Math.log(noiseFrom / wormWide) / Math.log(noiseFrom / wormAbsorbedAt), 0, 1) - arrayNoise) * noiseFollow;
    const crackle = Math.pow(pixelX, 1 - arrayNoise) * Math.pow(noiseFinest, arrayNoise) + (calm ? 0 : Math.max(nearMiddle, arrayNoise) * p.random(1));
    const scan = w / 2; // Always wide, gradual waves
    // Fading in evenly, all over
    const shown = ease(opening) * 255;
    // Cracking, once it's covered the screen for a while: worked out as if each row were this wide
    const cracked = arrayFullAt === null ? 0 : ease(Math.min(1, Math.max(0, (seconds - arrayFullAt - crackAfter) / crackTime)));
    const wrongWidth = Math.max(1, Math.round(w * (1 - crackMost * cracked)));
    const { data } = pixelImage;
    let i = 0;
    for (let row = 0; row < h; row++) {
      for (let column = 0; column < w; column++) {
        // Where on the pattern this pixel comes from: where it is, until it cracks
        const along = row * w + column;
        const x = cracked > 0 ? along % wrongWidth : column;
        const y = cracked > 0 ? Math.floor(along / wrongWidth) : row;
        data[i + 3] = shown;
        data[i] = 100 * (1 + Math.cos(y / w / pixelY + pixelY / 10));
        data[i + 1] = 100 * (1 + (Math.sin((x * y) / (0.5 * crackle) + crackle / 10 - pixelDrift) + Math.sin(((w - x) * (h - y)) / (0.5 * crackle) + crackle / 10 - pixelDrift)) / 2);
        data[i + 2] = 100 * (1 + Math.cos((1.414 * y) / scan + scan / 10 - scanPosition));
        i += 4;
      }
    }
    pixelContext.putImageData(pixelImage, 0, 0);
    const context = p.drawingContext;
    context.save();
    context.imageSmoothingEnabled = false;
    // Taking on the shape of an old TV's screen, once it's covered the screen
    const crt = tvShaped();
    if (crt > 0) {
      context.fillStyle = 'black';
      context.fillRect(0, 0, p.width, p.height);
      clipToTv(context, crt);
    }
    context.drawImage(pixelCanvas, 0, 0, p.width, p.height);
    if (crt > 0) {
      // ...darker toward its edges
      const shade = context.createRadialGradient(p.width / 2, p.height / 2, Math.min(p.width, p.height) * 0.3, p.width / 2, p.height / 2, Math.hypot(p.width, p.height) / 2);
      shade.addColorStop(0, 'rgba(0,0,0,0)');
      shade.addColorStop(1, `rgba(0,0,0,${crtShade * crt})`);
      context.fillStyle = shade;
      context.fillRect(0, 0, p.width, p.height);
    }
    context.restore();
  }

  // Where a place along the worm shows on the screen, while it's in space (along: 0 at the tail, 1 at the head)
  function wormPlace(along) {
    const seen = seenFromBehind(along, cameraAt(pathTime));
    const followed = steerAt(seconds - (1 - along) * bodyTime);
    if (!followed) return seen;
    return { x: p.lerp(seen.x, followed.x, wormFollow * settled()), y: p.lerp(seen.y, followed.y, wormFollow * settled()) };
  }

  // How far it's closed in from the corners, opening again if the flowers stage is left before it's done
  function moveArrayCircle(dt) {
    if (stages[current].settings.bloom) {
      if (seconds - stageStart > arrayDelay) arrayOpening = Math.min(1, arrayOpening + (dt * (1 + boost)) / arrayTime);
      tunnel = arrayOpening;
    } else {
      arrayOpening = arrayOpening < 0.01 ? 0 : arrayOpening * Math.exp(-dt / morphTime);
      tunnel *= Math.exp(-dt / morphTime);
    }
    if (stages[current].settings.bloom && arrayOpening > wormStays) wormSize *= Math.exp((-dt * (1 + boost)) / wormShrink);
    else wormSize = 1;
    if (wormSize === 1) wormAbsorbed = 0;
    // ...when it's small enough, or once the array's covered the screen for long enough anyway
    else if (wormWide < wormAbsorbedAt || wormAbsorbed > 0 || (arrayFullAt !== null && seconds - arrayFullAt > arrayHold)) wormAbsorbed = Math.min(1, wormAbsorbed + dt / wormAbsorbTime);
    return arrayOpening;
  }

  // The flowers fly by in the same way as the stars (see drawStars()), from the same point. They start
  // far away, a steady stream of them, which comes to fieldCount by the time the first have passed.
  function burst() {
    burstStart = seconds;
    for (const flower of segments) {
      if (flower) flower.burstAngle = p.random(p.TWO_PI);
    }
    throwFlowers();
  }

  function throwFlowers() {
    const camera = cameraAt(pathTime);
    for (let i = 0; i < burstExtra; i++) {
      const from = seenFromBehind(p.random(0.1, 0.9), camera); // From all along it
      const stays = p.random() < burstStay;
      const spot = { x: p.random(p.width), y: p.random(p.height) }; // Where it lands, if it stays
      thrownOut.push({
        ...newFlower(),
        fromX: from.x,
        fromY: from.y,
        thrownAt: seconds,
        angle: stays ? Math.atan2(spot.y - from.y, spot.x - from.x) : p.random(p.TWO_PI),
        reach: stays ? Math.hypot(spot.x - from.x, spot.y - from.y) : p.random(0.15, 1) * burstReach * p.width,
        speed: stays ? 0 : p.random(burstExtraSpeed[0], burstExtraSpeed[1]) * p.width,
        stays,
        size: (p.random(burstExtraSize[0], burstExtraSize[1]) * p.width) / 1200,
      });
    }
  }

  // They fly out with the burst and carry on until they're off the screen, and only then do they go
  // Throws the worm's flowers out, up to this far, in pixels. It's different every time: a few jets in random
  // directions, a few flowers going a long way while most stay near, and each with its own speed.
  function explode(reach) {
    const jets = Array.from({ length: Math.round(p.random(explodeJets[0], explodeJets[1])) }, () => ({
      angle: p.random(p.TWO_PI),
      wide: p.random(explodeJetWidth[0], explodeJetWidth[1]),
      far: p.random(0.4, 1),
    }));
    const most = explodeMost * Math.min(p.width, p.height);
    for (const flower of segments) {
      if (!flower) continue;
      const jet = p.random(jets);
      const stray = p.random() < explodeStray;
      const angle = stray ? p.random(p.TWO_PI) : jet.angle + p.randomGaussian(0, jet.wide / 2);
      const distance = reach * (stray ? 0.5 : jet.far) * Math.pow(p.random(), explodeUneven);
      const toX = (flower.blastToX ?? 0) + Math.cos(angle) * distance;
      const toY = (flower.blastToY ?? 0) + Math.sin(angle) * distance;
      const limit = Math.min(1, most / (Math.hypot(toX, toY) || 1));
      flower.blastToX = toX * limit;
      flower.blastToY = toY * limit;
      flower.blastSpeed = p.random(explodeSpeed[0], explodeSpeed[1]);
      flower.blastReturn = p.random(explodeReturn[0], explodeReturn[1]);
    }
  }

  function drawThrownOut(context) {
    if (burstStart === null) thrownOut = [];
    thrownOut = thrownOut.filter((flower) => {
      const since = seconds - flower.thrownAt;
      const distance = flower.reach * (1 - Math.exp(-since * burstOut)) + flower.speed * since;
      const x = flower.fromX + Math.cos(flower.angle) * distance;
      const y = flower.fromY + Math.sin(flower.angle) * distance;
      const across = flower.petalLength * flower.size;
      if (x < -across || x > p.width + across || y < -across || y > p.height + across) return false;
      drawFlower(flower, x, y, flower.size * (1 - tunnel), 1, context);
      if (flower.stays && since > burstLand) {
        joinField(flower, x, y, flower.size * (1 - tunnel));
        return false;
      }
      return true;
    });
  }

  // A flower thrown out by the burst becomes one of the flowers flying by, just where it is and just as big, as if it
  // had been that far away all along: so it carries on toward the edges as they do (see fieldPlace())
  function joinField(flower, x, y, size) {
    const shorter = Math.min(p.width, p.height);
    const reach = Math.max(p.width, p.height) * 0.5;
    const shown = Math.max(0.01, now.bloom * fieldLeft);
    const z = p.constrain(Math.pow((fieldSize * shorter) / 800 / (size / shown), 1 / fieldGrow), 0.05, 1 - fieldFade); // Near enough to have faded in
    field.push({ ...flower, x: ((x - focus.x) * z) / reach, y: ((y - focus.y) * z) / reach, z, driftX: 0, driftY: 0, pace: burstLandPace });
  }

  // How far the worm's flowers have come back since the burst (from 0 to 1), slowing as they settle
  function burstBack() {
    return 1 - Math.exp((burstStart - seconds) / burstReturn);
  }

  function forwardMotion() {
    return (burstStart === null ? 1 : burstBack()) * (1 + boost);
  }

  function newFieldFlower() {
    let x = p.random(-1, 1);
    let y = p.random(-1, 1);
    while (Math.abs(x) < fieldLane && Math.abs(y) < fieldLane) {
      x = p.random(-1, 1);
      y = p.random(-1, 1);
    }
    return { ...newFlower(), x, y, z: calm ? p.random(0.1, 1) : 1 };
  }

  function moveField() {
    const { bloom } = stages[current].settings;
    // They get smaller as the pixel array closes in
    fieldLeft = bloom ? 1 - fieldClosing * arrayOpening : 1;
    if (bloom === 0 && now.bloom < 0.01) {
      field = [];
      return;
    }
    if (bloom === 1 && seconds - stageStart > fieldDelay) {
      fieldDue += (fieldCount * fieldSpeed * frameTime * forwardMotion()) / fieldStream;
      for (; fieldDue >= 1; fieldDue--) {
        if (field.length < fieldCount) field.push(newFieldFlower());
      }
    }
    if (!calm) {
      for (const flower of field) {
        flower.z -= flower.z * fieldSpeed * (flower.pace ?? 1) * frameTime * forwardMotion();
        flower.driftX += flower.xSpeed * frameTime * 60;
        flower.driftY += flower.ySpeed * frameTime * 60;
      }
      // They keep growing until they're off the screen, and only then do they go
      field = field.filter((flower) => {
        const { x, y, size } = fieldPlace(flower);
        const across = flower.petalLength * size;
        return x > -across && x < p.width + across && y > -across && y < p.height + across;
      });
    }
    field.sort((a, b) => b.z - a.z);
  }

  // Dragging plants them where the pointer is, partway along, to fly by with the rest. They always leave.
  function plantInField(screenX, screenY) {
    if (field.length >= mostFlowers) return;
    const z = p.random(0.5, 1);
    const reach = Math.max(p.width, p.height) * 0.5;
    const away = Math.atan2(screenY - focus.y, screenX - focus.x);
    field.push({
      ...newFlower(),
      x: ((screenX - focus.x) * z) / reach,
      y: ((screenY - focus.y) * z) / reach,
      z,
      xSpeed: Math.cos(away) * plantedDrift,
      ySpeed: Math.sin(away) * plantedDrift,
    });
  }

  // Where a flower flying by shows on the screen, and how big
  function fieldPlace(flower) {
    const reach = Math.max(p.width, p.height) * 0.5;
    const shorter = Math.min(p.width, p.height);
    return {
      x: focus.x + (flower.x * reach) / flower.z + flower.driftX,
      y: focus.y + (flower.y * reach) / flower.z + flower.driftY,
      size: now.bloom * fieldLeft * Math.min(((fieldSize * shorter) / 800) / Math.pow(flower.z, fieldGrow), (fieldBiggest * shorter) / flower.petalLength),
    };
  }

  function drawField(context) {
    for (const flower of field) {
      const { x, y, size } = fieldPlace(flower);
      drawFlower(flower, x, y, size, Math.min(1, (1 - flower.z) / fieldFade), context); // They fade in in the distance
    }
  }

  function showCaption(name, hint) {
    caption.innerHTML = '';
    const title = document.createElement('span');
    title.className = 'wormhole-caption-name';
    title.textContent = name;
    caption.append(title, ` ${hint}`);
    // Restarts the fade
    caption.classList.remove('showing');
    void caption.offsetWidth;
    caption.classList.add('showing');
  }

  function goTo(index) {
    if (handedOver) return; // Another sketch has the screen now
    if (index >= stages.length) {
      if (!leaving) location.href = after;
      leaving = true;
      return;
    }
    current = (index + stages.length) % stages.length;
    progress = 0;
    stageStart = seconds;
    arrayFullAt = null;
    ringDistance = null;
    ringWaiting = false;
    burstStart = null;
    boost = 0;
    // The flowers stage always starts with the worm bursting
    if (stages[current].settings.bloom) bloomStart = seconds; // It waits, wobbles and bursts (see bloomFade)
    else bloomStart = null;
    const { name, hint, settings } = stages[current];
    if (settings.bloom && !clip.src) clip.src = strikeClip;
    if (begun) showCaption(name, hint);
    history.replaceState(null, '', `#${slug(name)}`);
    if (stages[current].sketch) handOver(stages[current].sketch);
  }

  // Keeps what's drawn after this inside the old TV's screen, at however far it's taken on its shape
  function clipToTv(context, crt) {
    const smaller = Math.min(p.width, p.height);
    const inset = crtInset * smaller * crt;
    context.beginPath();
    context.roundRect(inset, inset, p.width - inset * 2, p.height - inset * 2, crtCorner * smaller * crt);
    context.clip();
  }

  // How far the pixel array's taken on the old TV's shape, from 0 to 1, easing gently in and out
  function tvShaped() {
    if (arrayFullAt === null) return 0;
    const t = Math.min(1, (seconds - arrayFullAt) / crtTime);
    return t ** 3 * (t * (t * 6 - 15) + 10);
  }

  // Switching off like an old TV: the picture squashed to a bright line across the middle, the line shrunk to a bright
  // dot, and the dot fading, and then it's on to the next stage
  function drawTvOff() {
    const t = seconds - tvOffAt;
    const context = p.drawingContext;
    const { width, height } = context.canvas;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = 'black';
    context.fillRect(0, 0, width, height);
    const squashing = ease(Math.min(1, t / tvSquash));
    const shrinking = ease(Math.min(1, Math.max(0, (t - tvSquash) / tvShrink)));
    const fading = Math.min(1, Math.max(0, (t - tvSquash - tvShrink) / tvFade));
    // All of it inside the old TV's screen
    const screen = tvScreen ?? { x: 0, y: 0, wide: width, tall: height, round: 0 };
    context.beginPath();
    context.roundRect(screen.x, screen.y, screen.wide, screen.tall, screen.round);
    context.clip();
    const line = Math.max(2, height * 0.004); // How thick the line is, in the canvas's own pixels
    const tall = p.lerp(screen.tall, line, squashing);
    const wide = p.lerp(screen.wide, line, shrinking);
    context.translate(screen.x + screen.wide / 2, screen.y + screen.tall / 2);
    if (shrinking < 1) {
      // The picture on the screen, squashed and brightening to white as it goes
      context.drawImage(tvPicture, screen.x, screen.y, screen.wide, screen.tall, -wide / 2, -tall / 2, wide, tall);
      context.fillStyle = `rgba(255,255,255,${squashing})`;
      context.fillRect(-wide / 2, -tall / 2, wide, tall);
    }
    // The dot, glowing, and fading
    if (shrinking > 0.8) {
      const glow = line * 4;
      const dot = context.createRadialGradient(0, 0, 0, 0, 0, glow);
      dot.addColorStop(0, `rgba(255,255,255,${1 - fading})`);
      dot.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = dot;
      context.fillRect(-glow, -glow, glow * 2, glow * 2);
    }
    context.restore();
    if (fading >= 1) {
      tvOffAt = null;
      goTo(current + 1);
    }
  }

  // A stage that's a sketch of its own takes over the screen: this one stops, and that one starts in its place, with
  // the captions, the sound switch and the skip link staying as they are. `options` go to the next sketch.
  function handOver(sketch, options = {}) {
    handedOver = true;
    // Once this frame's done. The page keeps resizing this one (see src/scripts/mount_sketches.js), so that's turned off,
    // and the next one keeps itself the size of the screen.
    requestAnimationFrame(() => {
      p.resizeCanvas = () => {};
      p.remove();
      new p5((next) => sketch(next, container, options), container);
    });
  }

  // The welcome, and then the way in (see welcomeTime)
  function runIntro() {
    const later = (time, then) => introTimers.push(setTimeout(then, time * 1000));
    later(0.05, () => {
      welcomeWords.classList.add('showing');
    });
    later(welcomeTime, () => welcomeWords.classList.remove('showing'));
    later(welcomeTime + introGap, () => pressWords.classList.add('showing'));
  }

  function stopIntro() {
    introTimers.forEach(clearTimeout);
    welcome.classList.add('gone');
    soundSpot.classList.remove('waiting');
  }

  // Skipping goes on to the next stage: past the welcome, from one stage to the next, and in the noisy spiral, to
  // the portals (see spiral-worm.js)
  function skipAhead() {
    if (handedOver) container.skipToPortals?.();
    else if (!begun) begin();
    else goTo(current + 1);
  }


  // A ring of the wake, as if drawn by hand: filled black, so it hides what's behind it, with its edge wobbling more
  // the bigger it's got (the small ones in the middle stay round), and its line pressing and lifting as it goes round,
  // starting thin and tapering off where it comes back round, a little short of itself or a little past. Each ring's
  // its own, from its seed, for all its life. amount: how much of all that (it goes as the wake turns into the worm).
  function drawWakeRing(x, y, w, h, colour, weight, seed, amount) {
    if (w <= 0 || h <= 0) return;
    const g = p.drawingContext;
    const hash = (k) => {
      const v = Math.sin(seed * 9187.31 + k * 47.853) * 43758.5453;
      return v - Math.floor(v);
    };
    const count = Math.max(16, Math.min(72, Math.round((w + h) / 6)));
    const wobble = Math.min(wakeWobble * Math.max(0, w - wakeWobbleFrom), wakeWobbleMost) * amount; // In pixels across
    const waves = [0, 1, 2].map((k) => ({ bumps: 3 + Math.floor(hash(k) * 6), size: (0.5 + hash(k + 3)) / 3, phase: hash(k + 6) * Math.PI * 2 }));
    const xs = new Float32Array(count);
    const ys = new Float32Array(count);
    for (let n = 0; n < count; n++) {
      const angle = (n / count) * Math.PI * 2;
      let out = 0;
      for (const wave of waves) out += wave.size * Math.sin(wave.bumps * angle + wave.phase);
      const r = 1 + (out * wobble) / w; // As a share of its size
      xs[n] = x + (Math.cos(angle) * w * r) / 2;
      ys[n] = y + (Math.sin(angle) * h * r) / 2;
    }
    g.beginPath();
    for (let n = 0; n < count; n++) g.lineTo(xs[n], ys[n]);
    g.closePath();
    g.fillStyle = 'black';
    g.fill();
    if (colour[3] <= 0.5) return;
    g.strokeStyle = `rgba(${colour[0]},${colour[1]},${colour[2]},${colour[3] / 255})`;
    // The line, in short pieces of their own thickness, round at the ends so they join up
    const start = Math.floor(hash(9) * count);
    const ending = p.lerp(-wakeHandGap, wakeHandGap, hash(10)) * amount;
    const press = [hash(11), hash(12)].map((v) => v * Math.PI * 2);
    const bumps = [2 + Math.floor(hash(13) * 3), 5 + Math.floor(hash(14) * 4)];
    const pieces = new Map();
    const steps = Math.round(count * (1 + Math.max(0, ending)));
    for (let k = 0; k < steps; k++) {
      const along = k / count;
      if (ending < 0 && along > 1 + ending) break;
      const n = (start + k) % count;
      const m = (n + 1) % count;
      const angle = (n / count) * Math.PI * 2;
      const pressing = 1 + wakeHandPress * amount * (0.6 * Math.sin(bumps[0] * angle + press[0]) + 0.4 * Math.sin(bumps[1] * angle + press[1]));
      const end = 1 + Math.max(0, ending) - along;
      const taper = Math.min(1, along / wakeHandTaper, Math.max(0, end) / wakeHandTaper);
      const thick = weight * pressing * p.lerp(1, p.lerp(wakeHandTaperLeast, 1, taper), amount);
      const bin = Math.max(1, Math.round(thick * 4)) / 4;
      let path = pieces.get(bin);
      if (!path) pieces.set(bin, (path = new Path2D()));
      path.moveTo(xs[n], ys[n]);
      path.lineTo(xs[m], ys[m]);
    }
    g.lineCap = 'round';
    for (const [thick, path] of pieces) {
      g.lineWidth = thick;
      g.stroke(path);
    }
    g.lineCap = 'butt';
  }

  // Little ripples within the wake's rings: now and then, somewhere inside one of the bigger ones, a little ripple of
  // a few rings spreads and fades, in that ring's colour, flattened by distance as the wake is
  const withinCandidates = []; // The rings it could be in, this frame
  let wakeRipples = [];
  function drawWithin() {
    const amount = now.flat * (1 - now.space);
    if (amount > 0.01 && withinCandidates.length && !calm && p.random() < (withinPerSecond * Math.min(0.1, p.deltaTime / 1000)) * amount) {
      const ring = p.random(withinCandidates);
      const angle = p.random(Math.PI * 2);
      const reach = p.random(0.1, 0.7);
      wakeRipples.push({
        x: ring.x + (Math.cos(angle) * ring.w * reach) / 2,
        y: ring.y + (Math.sin(angle) * ring.h * reach) / 2,
        size: p.random(...withinSize) * ring.depth,
        flat: 0.375 * ring.depth,
        rings: Math.round(p.random(...withinRings)),
        time: p.random(...withinTime),
        start: seconds,
        colour: ring.colour,
      });
    }
    withinCandidates.length = 0;
    wakeRipples = wakeRipples.filter((r) => seconds - r.start < r.time);
    const g = p.drawingContext;
    for (const r of wakeRipples) {
      const t = (seconds - r.start) / r.time;
      for (let k = 0; k < r.rings; k++) {
        const w = r.size * Math.sqrt(t) * (1 - k / (r.rings + 1)); // Each inside the last
        if (w <= 0) continue;
        g.beginPath();
        g.ellipse(r.x, r.y, w / 2, (w / 2) * r.flat, 0, 0, Math.PI * 2);
        g.strokeStyle = `rgba(${r.colour[0]},${r.colour[1]},${r.colour[2]},${(1 - t) * withinStrength * amount})`;
        g.lineWidth = 1.2;
        g.stroke();
      }
    }
  }

  function moveWorm(dt) {
    const idle = seconds - pointer.lastMoved > idleTime;
    const before = { ...at };
    if (!idle) {
      at.x = pointer.x;
      at.y = pointer.y;
    } else if (!calm) {
      const wander = seconds * 0.15;
      at.x += (p.noise(wander) * p.width - at.x) * Math.min(1, dt);
      at.y += (p.noise(wander, 40) * p.height - at.y) * Math.min(1, dt);
    }

    // Any frame the pointer hasn't moved, the wake comes up anywhere on the water
    const still = pointer.x === lastPointer.x && pointer.y === lastPointer.y;
    lastPointer = { x: pointer.x, y: pointer.y };
    let next;
    if (still && !calm && now.scatter > 0.5) next = { x: p.random(p.width), y: p.random(p.height) };
    else next = { x: at.x + p.random(-70, 70) * now.scatter, y: at.y + p.random(-30, 30) * now.scatter };
    next.seed = Math.random(); // Its own wobble and line, for all its life (see drawWakeRing)
    trail.push(next);
    if (trail.length > stages[0].settings.length) trail.shift();
    return p.dist(before.x, before.y, at.x, at.y);
  }

  // Where the worm's path is, this many seconds ago
  function weaveAt(time) {
    return {
      x: (p.noise(time * weaveSpeed) - 0.5) * 2 * weaveWide * p.width,
      y: (p.noise(time * weaveSpeed, 100) - 0.5) * 2 * weaveTall * p.height,
    };
  }

  // Where the camera is at a given time: wherever puts the tail where it's drifted to on the screen
  function cameraAt(time) {
    const tail = weaveAt(time - bodyTime);
    const x = tail.x - (p.noise(time * tailWander, 200) - 0.5) * 2 * tailWide * p.width + pondDrift.x * (1 - settled());
    const y = tail.y - (p.noise(time * tailWander, 300) - 0.5) * 2 * tailTall * p.height + pondDrift.y * (1 - settled());
    if (ringPull < 0.001) return { x, y };
    // As the worm nears the ring, the camera moves into line with it, so that it's in the middle of the screen
    const ring = weaveAt(ringMeets);
    return { x: p.lerp(x, ring.x, ringPull), y: p.lerp(y, ring.y, ringPull) };
  }

  // How high the camera's looking from: as the worm nears the ring it comes down right behind it, looking
  // along it into the middle of the screen
  function screenLevel() {
    return p.height * p.lerp(spaceHorizon, 0.5, ringPull);
  }

  function cameraHeight() {
    return p.height * p.lerp(cameraAbove, ringBehind, ringPull);
  }

  // Keeps what's near the camera on the screen while it's lined up with the ring
  function keepOnScreen(x, y) {
    const wide = p.width * 0.45;
    const tall = p.height * 0.42;
    return {
      x: p.lerp(x, p.width / 2 + wide * Math.tanh((x - p.width / 2) / wide), ringPull),
      y: p.lerp(y, p.height / 2 + tall * Math.tanh((y - p.height / 2) / tall), ringPull),
    };
  }

  // Where a place along the worm shows on the screen, from just above and behind it (along: 0 at the tail, 1 at the head)
  function seenFromBehind(along, camera) {
    const closer = 1 / p.lerp(tailDistance, headDistance, along);
    const place = weaveAt(pathTime - (1 - along) * bodyTime);
    return {
      x: p.width / 2 + (place.x - camera.x) * closer,
      y: screenLevel() + (cameraHeight() - (place.y - camera.y)) * closer,
      closer,
    };
  }

  // Where the ring shows on the screen. It's at a place on the worm's path, so the worm's going to go
  // right through its middle, and it moves with everything else as the camera does.
  function ringPlace(pathTime) {
    const camera = cameraAt(pathTime);
    const place = weaveAt(ringWaiting ? pathTime + ringLead : ringMeets);
    const closer = 1 / ringDistance;
    return {
      x: p.width / 2 + (place.x - camera.x) * closer,
      y: screenLevel() + (cameraHeight() - (place.y - camera.y)) * closer,
      closer,
    };
  }

  // The part of the worm beyond the ring is seen through its middle. It keeps its wobble, but is drawn in
  // as far as it takes to stay inside, which matters most on narrow screens.
  function insideRing(x, y, size, ring) {
    const hole = ringHole();
    const room = Math.max(hole - size / 2, hole * 0.1);
    const gap = Math.hypot(x - ring.x, y - ring.y);
    const keep = gap > 0 ? p.lerp(1, (room * Math.tanh(gap / room)) / gap, ringPull) : 1;
    return { x: ring.x + (x - ring.x) * keep, y: ring.y + (y - ring.y) * keep };
  }

  // The size of the circle in its middle
  function ringHole() {
    const start = ((p.width / 8) * bodyScale * ringSize * ringSmall) / (2 * ringWait);
    if (ringWaiting) return start;
    const going = (pathTime - (ringMeets - ringLead)) / ringCovers;
    const covered = Math.hypot(p.width, p.height) * 0.55;
    return start * Math.pow(covered / start, (1 - ringRush) * going + ringRush * going * going);
  }

  function bringRing() {
    ringWaiting = false;
    ringMeets = pathTime + ringLead;
  }

  function ringCoversScreen() {
    const ring = ringPlace(pathTime);
    return ringHole() > Math.hypot(Math.max(ring.x, p.width - ring.x), Math.max(ring.y, p.height - ring.y));
  }

  // The flower the worm goes through. Its middle grows to cover the screen, and its colour becomes the next
  // stage's ground, which then fades away
  function drawRing() {
    const ring = ringPlace(pathTime);
    const scale = (ringHole() * 2) / portal.middle;
    // Semi-transparent, until the mouse is over it (easing between the two)
    const over = Math.hypot(pointer.x - ring.x, pointer.y - ring.y) < portal.petalLength * scale;
    portalSeen += ((over ? 1 : portalSeeThrough) - portalSeen) * (1 - Math.exp(-frameTime / portalHoverEase));
    // (Coming from the pond, it fades in with the stars: see pondSettle)
    drawFlower(portal, ring.x, ring.y, scale, settled() * portalSeen);
  }

  // Where the place the worm's following was at a given time, in between the frames either side of it
  function steerAt(time) {
    if (!steerTrail.length) return null;
    let low = 0;
    let high = steerTrail.length - 1;
    if (time <= steerTrail[low].time) return steerTrail[low];
    if (time >= steerTrail[high].time) return steerTrail[high];
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (steerTrail[middle].time <= time) low = middle;
      else high = middle;
    }
    const before = steerTrail[low];
    const after = steerTrail[high];
    const between = (time - before.time) / (after.time - before.time);
    return { x: p.lerp(before.x, after.x, between), y: p.lerp(before.y, after.y, between) };
  }

  // A ring of the worm drawn by hand, as the pond draws its worm's (see ringShape in pond.js): pushed in and out by three
  // waves of its own, which drift round and spin, filled black, so it hides what's behind it. seed: which ring it is.
  function drawHandRing(x, y, d, colour, weight, seed) {
    if (d <= 0.5) return;
    const { noise, spin, spinRate, spinMix, glow } = fromPond;
    const hash = (k) => {
      const v = Math.sin((seed * 0.37 + 11) * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    let churn = Math.min(noise.amount * d, noise.most);
    if (churn < 0.3) churn = 0;
    const counter = fromPond.counter + 0.01 * (p.frameCount - 1); // It goes up by that each frame, in the pond
    const waves = churn > 0 ? [0, 1, 2].map((k) => ({
      bumps: Math.round(p.lerp(noise.bumps[0], noise.bumps[1], hash(k))),
      size: (0.5 + hash(k + 3)) / 3,
      phase: hash(k + 6) * Math.PI * 2 + counter * noise.drift * (hash(k + 9) - 0.5) * 2,
    })) : [];
    const own = Math.sin((seed * 0.37 + 11) * 12.9898) * 43758.5453;
    const turned = (spin + spinRate * (seconds - pondStart)) * p.lerp(1 - spinMix, 1 + spinMix, own - Math.floor(own));
    const points = Math.max(churn > 0.5 ? 32 : 12, Math.min(noise.points, Math.round(d / noise.spacing)));
    const g = p.drawingContext;
    g.beginPath();
    for (let k = 0; k < points; k++) {
      const angle = (k / points) * Math.PI * 2;
      let r = d / 2;
      for (const wave of waves) r += churn * wave.size * Math.sin(wave.bumps * (angle - turned) + wave.phase);
      g.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
    }
    g.closePath();
    g.fillStyle = 'black';
    g.fill();
    // As bright as the pond's, which was brighter for where its drop landed
    const [r, gr, b, a] = colour.map((v, k) => (k < 3 ? Math.round(v + (255 - v) * glow) : v));
    g.strokeStyle = `rgba(${r},${gr},${b},${a / 255})`;
    g.lineWidth = weight;
    g.stroke();
  }

  function drawWorm() {
    moveField();

    // All the flowers are faint from the worm turning into flowers until it's burst, and then come back slowly. While
    // they're faint, they're drawn solid on a layer of their own first, and then put on the canvas faint all at once, so
    // each flower fades as a whole, without its petals showing through each other.
    const flowerShown = burstStart === null ? bloomFaint : Math.min(1, bloomFaint + ((1 - bloomFaint) * (seconds - burstStart)) / bloomSolid);
    // ...and as the pixel array takes on the shape of an old TV, they turn into black silhouettes against it
    const silhouette = tvShaped();
    const layered = (flowerShown < 1 && (ringDistance !== null || bloomStart !== null)) || silhouette > 0; // Only while there are flowers to fade or darken
    const flowerContext = layered ? faintContext : p.drawingContext;
    if (layered) {
      const main = p.drawingContext;
      if (faintLayer.width !== main.canvas.width || faintLayer.height !== main.canvas.height) {
        faintLayer.width = main.canvas.width;
        faintLayer.height = main.canvas.height;
      }
      faintContext.setTransform(main.getTransform());
      faintContext.clearRect(0, 0, p.width, p.height);
    }
    const showFaint = () => {
      if (!layered) return;
      const main = p.drawingContext;
      main.save();
      main.setTransform(1, 0, 0, 1, 0, 0);
      main.globalAlpha = flowerShown;
      main.drawImage(faintLayer, 0, 0);
      if (silhouette > 0) {
        // The same again, in black, over them
        faintContext.save();
        faintContext.setTransform(1, 0, 0, 1, 0, 0);
        faintContext.globalCompositeOperation = 'source-in';
        faintContext.fillStyle = 'black';
        faintContext.fillRect(0, 0, faintLayer.width, faintLayer.height);
        faintContext.restore();
        main.globalAlpha = flowerShown * silhouette;
        main.drawImage(faintLayer, 0, 0);
      }
      main.restore();
    };
    drawField(flowerContext);
    drawThrownOut(flowerContext);
    if (ringDistance !== null) drawRing();
    if (now.body < 0.01) {
      showFaint();
      return;
    }
    const length = Math.round(now.length);
    const start = Math.max(0, trail.length - length);
    const round = p.width / 8;
    p.fill(0);
    const wormWeight = p.random(1, 2); // The worms flicker a whole frame at a time, and the wake holds steady
    // Having come through the ring as the flower worm, waiting as the field's colour fades in, wobbling more and more,
    // and bursting
    const wobbling = bloomStart === null ? 0 : Math.min(1, Math.max(0, (seconds - bloomStart - bloomFade) / bloomWobbleTime));
    if (bloomStart !== null && burstStart === null && wobbling >= 1) burst();
    const white = pointer.down && now.whiteHeld > 0.5;
    const camera = cameraAt(pathTime);

    // Through the pixel array it stretches out, longer and thinner, as it nears the noisy spiral
    const stretching = arrayFullAt !== null ? ease(Math.min(1, (seconds - arrayFullAt) / arrayHold)) : 0;
    const longer = p.lerp(1, wormStretch, stretching);
    const thinner = p.lerp(1, wormThin, stretching);

    // From behind, the nearest has to go on top, which means the tail last
    const inSpace = now.space > 0.5;
    // As the tunnel closes, its head's pulled more and more toward the middle, and the rest of it shrinks toward its head
    const head = wormPlace(1);
    if (now.space < 0.5) Object.assign(head, trail[trail.length - 1]);
    const pull = tunnel * tunnel * (3 - 2 * tunnel);
    wormFront = { x: p.lerp(head.x, p.width / 2, pull), y: p.lerp(head.y, p.height / 2, pull) };
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (let n = start; n < trail.length; n++) {
      const i = inSpace ? trail.length - 1 - (n - start) : n;
      const along = (i - start + length - (trail.length - start)) / length; // 0 at the tail, 1 at the head
      const distance = p.lerp(tailDistance, headDistance, along);
      const { x, y } = trail[i];
      // Having been through the ring, this part of the worm is a flower
      const isFlower = ringDistance !== null ? distance > ringDistance : stages[current].settings.bloom === 1 || now.bloom > 0.01 || tunnel > 0.01;
      // The wake's rings fade as they spread, so the ones furthest out are the faintest
      const fade = p.lerp(1, Math.pow(p.sin(along * p.HALF_PI), wakeFadeCurve), now.flat);
      // ...and they're thinner toward the top of the screen
      const weight = p.lerp(wormWeight, (white ? p.random(1.8, 2) : 1.8) * p.lerp(wakeWeightAtTop, 1, Math.max(0, y / p.height)), now.flat);
      p.strokeWeight(weight);
      let colour;
      if (white) {
        colour = [255, 255, 255, 255 * fade];
      } else {
        const sine = p.abs(p.sin(along * p.PI));
        const cosine = p.abs(p.cos(along * p.PI));
        colour = [shimmer(now.low) * sine, shimmer(now.low) * cosine, 255 - shimmer(100) * sine, 255 * fade];
      }
      p.stroke(...colour);
      const size = p.sin(along * p.PI) * now.body;
      // The wake's rings keep spreading all their lives, rather than growing and shrinking back (the worm's are still
      // fullest in the middle)
      const spread = Math.pow(1 - along, wakeSpreadCurve) * wakeGrow * now.body;
      const depth = y / p.height; // The wake gets bigger toward the bottom of the screen
      let w = p.lerp(size * round, spread * 200 * depth, now.flat);
      let h = p.lerp(size * round, spread * 75 * depth * depth, now.flat);
      if (now.flat > 0.01 && now.space < 0.01 && !white && along > withinFrom && along < withinTo) withinCandidates.push({ x, y, w, h, depth, colour });
      let seenX = x;
      let seenY = y;
      if (now.space > 0.01) {
        const seen = seenFromBehind(along, camera);
        // It roughly follows the mouse, each part of it getting to where the head has been, until it's
        // lined up with the ring
        const followed = steerAt(seconds - (1 - along) * bodyTime);
        if (followed) {
          seen.x = p.lerp(seen.x, followed.x, wormFollow * (1 - ringPull) * settled());
          seen.y = p.lerp(seen.y, followed.y, wormFollow * (1 - ringPull) * settled());
        }
        const sizeInSpace = size * round * bodyScale * seen.closer;
        let inView = keepOnScreen(seen.x, seen.y);
        if (ringDistance !== null && distance > ringDistance) inView = insideRing(seen.x, seen.y, sizeInSpace, ringPlace(pathTime));
        let fromX = x;
        let fromY = y;
        if (formAt) {
          if (i === trail.length - 1) headSeen = { ...inView };
          // The wake gathers into a circle around where it was pressed...
          const rounding = ease(Math.min(1, now.space / formRound));
          const across = (x / p.width) * 2 - 1;
          const down = (y / p.height) * 2 - 1;
          const radius = formRadius * Math.min(p.width, p.height);
          fromX = p.lerp(x, formAt.x + across * Math.sqrt(Math.max(0, 1 - (down * down) / 2)) * radius, rounding);
          fromY = p.lerp(y, formAt.y + down * Math.sqrt(Math.max(0, 1 - (across * across) / 2)) * radius, rounding);
          // ...and the worm forms there, then drifts off on its own way
          const away = 1 - ease(Math.min(1, (seconds - formStart) / formTime));
          if (headSeen) inView = { x: inView.x + (formAt.x - headSeen.x) * away, y: inView.y + (formAt.y - headSeen.y) * away };
        }
        seenX = p.lerp(fromX, inView.x, now.space);
        seenY = p.lerp(fromY, inView.y, now.space);
        w = p.lerp(w, sizeInSpace, now.space);
        h = p.lerp(h, sizeInSpace, now.space);
      }
      // It carries on as it was while the whole of it gets smaller
      if (tunnel > 0.001 || wormSize < 1) {
        seenX = wormFront.x + (seenX - head.x) * wormSize * longer;
        seenY = wormFront.y + (seenY - head.y) * wormSize * longer;
        w *= wormSize * thinner * (1 - wormAbsorbed);
        h *= wormSize * thinner * (1 - wormAbsorbed);
        left = Math.min(left, seenX - w / 2);
        right = Math.max(right, seenX + w / 2);
        top = Math.min(top, seenY - h / 2);
        bottom = Math.max(bottom, seenY + h / 2);
      }
      if (isFlower) {
        const segment = i - start;
        segments[segment] ??= { ...newFlower(), burstAngle: p.random(p.TWO_PI), burstSize: p.random(0.5, 1) };
        const flower = segments[segment];
        // Thrown out quickly, and settling back
        const thrown = burstStart === null ? 0 : (1 - Math.exp((burstStart - seconds) * burstOut)) * (1 - burstBack()) * burstReach * burstApart * p.width * flower.burstSize;
        // Exploding when the mouse is let go, each flower in its own way
        flower.blastX = (flower.blastX ?? 0) + ((flower.blastToX ?? 0) - (flower.blastX ?? 0)) * (1 - Math.exp(-frameTime * (flower.blastSpeed ?? 1)));
        flower.blastY = (flower.blastY ?? 0) + ((flower.blastToY ?? 0) - (flower.blastY ?? 0)) * (1 - Math.exp(-frameTime * (flower.blastSpeed ?? 1)));
        const settling = Math.exp(-frameTime / (flower.blastReturn ?? 1));
        flower.blastToX = (flower.blastToX ?? 0) * settling;
        flower.blastToY = (flower.blastToY ?? 0) * settling;
        const grown = p.lerp(1, Math.pow(wormSize, -explodeGrow), Math.min(1, Math.hypot(flower.blastX, flower.blastY) / (explodeLeast * Math.min(p.width, p.height)))); // It'd be too small to see otherwise
        // Wobbling more and more, until it bursts
        const wobble = burstStart === null ? bloomWobble * w * wobbling * wobbling : 0;
        const wobbleX = Math.sin(seconds * bloomWobbleSpeed + segment * 0.7) * wobble;
        const wobbleY = Math.cos(seconds * bloomWobbleSpeed * 1.3 + segment * 0.5) * wobble;
        drawFlower(flower, seenX + Math.cos(flower.burstAngle) * thrown + flower.blastX + wobbleX, seenY + Math.sin(flower.burstAngle) * thrown + flower.blastY + wobbleY, (w * grown) / (flower.petalLength * 2), 1 - wormAbsorbed, flowerContext, 1 + (boost / boostMost) * boostSpin); // Spinning faster as it speeds up
      } else if (now.flat > 0.01) drawWakeRing(seenX, seenY, w, h, colour, weight, trail[i].seed ?? 0.5, now.flat);
      else if (fromPond && now.space > 0.5) drawHandRing(seenX, seenY, w, colour, p.lerp(fromPond.weights[1], fromPond.weights[0], along), n - start);
      else p.ellipse(seenX, seenY, w, h);
    }
    drawWithin();
    showFaint();
    if (formAt && seconds - formStart > formTime && now.space > 0.999) formAt = null;
    // (Its trail's still short when the page has only just opened, which would make it look tiny)
    wormWide = wormSize < 1 && trail.length >= length ? Math.max(right - left, bottom - top) : Infinity;
  }

  // Smooth at both ends
  function ease(amount) {
    return amount * amount * (3 - 2 * amount);
  }

  // Stars streaking past behind the worm, so that it looks like it's flying forward through space. They
  // stream from the point it's heading for.
  function drawStars(dt) {
    if (now.space < 0.02) return;
    if (!stars.length) {
      for (let i = 0; i < starCount; i++) stars.push({ x: p.random(-1, 1), y: p.random(-1, 1), z: p.random(0.05, 1) });
    }
    const reach = Math.max(p.width, p.height) * 0.5;
    for (const star of stars) {
      const fromX = focus.x + (star.x * reach) / star.z;
      const fromY = focus.y + (star.y * reach) / star.z;
      star.z -= starSpeed * dt;
      if (star.z < 0.05) {
        star.x = p.random(-1, 1);
        star.y = p.random(-1, 1);
        star.z = 1;
        continue;
      }
      p.stroke(255, 255 * (1 - star.z) * now.space * (1 - now.bloom) * (1 - tunnel)); // (From the pond, they're its stars)
      p.strokeWeight(1 + (1 - star.z));
      p.line(fromX, fromY, focus.x + (star.x * reach) / star.z, focus.y + (star.y * reach) / star.z);
    }
  }

  p.setup = () => {
    canvas = p.createCanvas(container.clientWidth, container.clientHeight);
    p.background(0);
    at = { x: p.width / 2, y: p.height / 2 };
    focus = { ...at };
    steer = { ...at };

    soundSwitch = soundButton({ track: true });
    onSoundChange((on) => (on ? startSound() : stopSound()));
    const skip = document.createElement('a');
    skip.className = 'wormhole-skip';
    skip.href = after;
    skip.textContent = 'skip';
    skip.addEventListener('click', (event) => {
      event.preventDefault();
      skipAhead();
    });
    marks.append(skip);
    soundSpot.append(soundSwitch);
    container.append(welcome, caption, marks, soundSpot);

    // Pressing anywhere, or a key, gets past the welcome and on to the next stage, with the worm forming at (x, y).
    // Its sound starts too, unless it's been turned off (the switch at the bottom can change that).
    function begin(x = p.width / 2, y = p.height / 2) {
      if (begun) return;
      begun = true;
      formAt = { x, y };
      formStart = seconds;
      if (soundWanted()) startSound();
      stopIntro();
      goTo(current + 1);
    }

    let pressedAt = null;
    canvas.elt.addEventListener('pointerdown', (event) => {
      const box = container.getBoundingClientRect();
      const beginning = !begun;
      begin(event.clientX - box.left, event.clientY - box.top);
      pointer.down = true;
      pressedAt = beginning ? null : { x: event.clientX, y: event.clientY }; // The press that begins isn't a click on the next stage
      heldFrom = seconds;
    });
    // A click, rather than a drag, brings the flower that's waiting
    canvas.elt.addEventListener('click', (event) => {
      if (!pressedAt || Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) >= 6) return;
      if (ringWaiting) bringRing();
    });
    window.addEventListener('pointerup', () => {
      if (pointer.down && stages[current].settings.bloom) {
        const charge = Math.min(1, (seconds - heldFrom) / explodeCharge);
        explode(p.lerp(explodeLeast, explodeMost, charge) * Math.min(p.width, p.height));
      }
      pointer.down = false;
      releasedAt = seconds;
    });
    window.addEventListener('pointercancel', () => (pointer.down = false));
    window.addEventListener('pointermove', (event) => {
      const box = container.getBoundingClientRect();
      const x = event.clientX - box.left;
      const y = event.clientY - box.top;
      if (seconds - pointer.lastMoved < 1) pointer.travelled += Math.hypot(x - pointer.x, y - pointer.y);
      pointer.x = x;
      pointer.y = y;
      pointer.lastMoved = seconds;
    });
    window.addEventListener('keydown', (event) => {
      if (event.target === soundSwitch || event.target === skip) return; // Pressing those from the keyboard is their own click
      // A key gets past the welcome, and that's all: only the skip button skips ahead
      if (!begun && !event.metaKey && !event.ctrlKey && event.key !== 'Tab') begin();
    });

    if (options.fromPond) {
      // From the pond: straight into the psychworm stage, out in space, with the worm following the middle of the screen
      // to begin with, and starting just where the pond's worm was (see drawWorm())
      const psychworm = stages.findIndex(({ name }) => name === 'psychworm');
      p.noiseSeed(fromPond.noiseSeed);
      pathTime = fromPond.path / weaveSpeed; // Where the pond's worm's head was along the same noise
      pondStart = 0;
      pondDrift = {
        x: (p.noise(pathTime * tailWander, 200) - 0.5) * 2 * tailWide * p.width,
        y: (p.noise(pathTime * tailWander, 300) - 0.5) * 2 * tailTall * p.height,
      };
      // Its colours are the pond's, and the screen's cleared each frame, as it was, so the worm's just as it was
      // (holding still leaves trails)
      Object.assign(stages[psychworm].settings, { low: fromPond.low, wash: 255 });
      // The pond's stars, carrying on just as they were
      stars.push(...fromPond.stars.map((star) => ({ ...star })));
      pondLeave = fromPond.leave;
      const middle = { x: p.width / 2, y: p.height / 2 };
      trail = Array.from({ length: stages[psychworm].settings.length }, () => ({ ...middle, seed: p.random() }));
      at = { ...middle };
      focus = fromPond.focus ? { ...fromPond.focus } : { x: p.width / 2, y: p.height * spaceHorizon }; // Where its stars streamed from
      steer = { ...middle };
      Object.assign(pointer, { ...middle, lastMoved: 0 });
      lastPointer = { ...middle };
      Object.assign(now, stages[psychworm].settings);
      begun = true;
      welcome.remove();
      soundSpot.classList.remove('waiting');
      if (soundWanted()) startSound();
      goTo(psychworm);
      return;
    }

    const named = stages.findIndex(({ name }) => `#${slug(name)}` === location.hash);
    if (named > 0) {
      Object.assign(now, stages[named].settings);
      begun = true; // Straight to a stage, past the welcome
      welcome.remove();
      soundSpot.classList.remove('waiting');
    } else runIntro();
    goTo(Math.max(0, named));
  };

  let pondLeave = null; // Coming from the pond, what takes it away, once this has drawn its first frame
  p.draw = () => {
    if (handedOver) return;
    if (pondLeave && p.frameCount > 1) {
      pondLeave();
      pondLeave = null;
    }
    const dt = Math.min(p.deltaTime / 1000, 0.1); // So coming back to the tab doesn't jump ahead
    seconds += dt;
    if (tvOffAt !== null) {
      drawTvOff();
      return;
    }
    pathTime += dt * p.lerp(1, fieldPace, Math.max(now.bloom, tunnel)) * forwardMotion();

    // Everything drifts toward the current stage
    const drift = 1 - Math.exp(-dt / morphTime);
    for (const key in now) now[key] += (stages[current].settings[key] - now[key]) * drift;
    if (calm) now.space = 0; // The stars are too much motion for anyone who's asked for less

    let wash = pointer.down ? now.washHeld : p.lerp(now.wash, Math.max(now.wash, ringWash), ringPull * now.space);
    // Let go, the screen's wiped faintly at first and then more and more, so the trails fade out rather than vanish
    const sinceLetGo = (seconds - releasedAt) / trailFade;
    if (!pointer.down && sinceLetGo < 1) wash = p.lerp(Math.min(now.washHeld, wash), wash, sinceLetGo ** 2);
    groundTint *= Math.exp(-dt / ringFade);
    if (pointer.down && stages[current].settings.bloom) boost = Math.min(boostMost, boost + boostRise * dt);
    else boost *= Math.exp(-dt / boostFade);
    if (wash >= 1) p.background(...groundColour.map((colour) => p.lerp(now.ground, colour, groundTint)), wash);

    const moved = moveWorm(dt);
    steer.x += (at.x - steer.x) * steerFollow;
    steer.y += (at.y - steer.y) * steerFollow;
    steerTrail.push({ x: steer.x, y: steer.y, time: seconds });
    while (steerTrail.length > 2 && seconds - steerTrail[1].time > bodyTime + 1) steerTrail.shift();
    // In space that's where its head is going, and otherwise where the pointer is
    const heading = p.width / 2 + (weaveAt(pathTime).x - cameraAt(pathTime).x) / headDistance;
    const level = screenLevel();
    focus.x += (p.lerp(at.x, heading, now.space) - focus.x) * focusFollow;
    focus.y += (p.lerp(at.y, level, now.space) - focus.y) * focusFollow;
    drawPixelArray(dt);
    frameTime = dt;
    if (pointer.down && moved > 0 && stages[current].settings.bloom) plantInField(at.x, at.y);
    // The stars, the flowers and the worm stay inside the old TV's screen, once the pixel array's taking on its shape
    const crt = tvShaped();
    if (crt > 0) {
      p.drawingContext.save();
      clipToTv(p.drawingContext, crt);
    }
    drawStars(dt);
    drawWorm();
    if (crt > 0) p.drawingContext.restore();

    // Playing moves things along. Left alone, it carries on by itself, unless motion's been turned down
    progress += pointer.travelled / Math.hypot(p.width, p.height) / screensToNext;
    pointer.travelled = 0;
    if (!calm) progress += dt / (stages[current].seconds ?? secondsToNext);
    if (!begun) progress = 0; // The welcome waits for a press
    const { through } = stages[current];
    const usesRing = through && !calm;
    // The flowers go on as the pixel array closes in, and once it's covered the screen, until it's absorbed the worm,
    // when the noisy spiral bursts out
    const { bloom } = stages[current].settings;
    if (bloom && wormAbsorbed >= 1) {
      // Switching off like an old TV, from what's on the screen now, and then on to the noisy spiral (see drawTvOff())
      const screen = p.drawingContext.canvas;
      tvPicture.width = screen.width;
      tvPicture.height = screen.height;
      tvPicture.getContext('2d').drawImage(screen, 0, 0);
      tvOffAt = seconds;
      const density = screen.width / p.width;
      const crt = tvShaped();
      const inset = crtInset * Math.min(p.width, p.height) * crt * density;
      tvScreen = { x: inset, y: inset, wide: screen.width - inset * 2, tall: screen.height - inset * 2, round: crtCorner * Math.min(p.width, p.height) * crt * density };
    } else if (bloom && arrayOpening >= 1) {
      arrayFullAt ??= seconds;
    } else if (!bloom && progress >= 1 && !usesRing) {
      goTo(current + 1);
    }

    // The flower waits for a click, and going through it leads to the next stage
    if (usesRing && ringDistance === null) {
      ringDistance = ringWait;
      ringWaiting = true;
      portal = newFlower();
      portal.middle = portal.petalLength * 0.6; // Big enough for the worm to go through
      // Always vivid: its petals in one hue, its middle (and the field beyond) in the opposite one, and its outline in a
      // third, between them
      const hue = p.random(360);
      portal.petalColour = `rgb(${vivid(hue)})`;
      groundColour = vivid(hue + 180);
      portal.middleColour = `rgb(${groundColour})`;
      portal.strokeColour = `rgb(${vivid(hue + 90)})`;
      portal.spin = ringSpin / 60;
    }
    if (ringWaiting && seconds - stageStart > ringLongest) bringRing();
    if (ringDistance !== null && !ringWaiting) {
      // As the worm goes along its path, the ring comes along it at just the same speed
      ringDistance = p.lerp(tailDistance, headDistance, 1 - (pathTime - ringMeets) / bodyTime);
      if (ringDistance < ringNearest || ringCoversScreen()) {
        goTo(stages.findIndex(({ name }) => name === through));
        // The next stage has already wiped across, so there's nothing to fade to
        Object.assign(now, { ground: stages[current].settings.ground, wash: stages[current].settings.wash, bloom: stages[current].settings.bloom });
        groundTint = 1;
      }
    }
    // The camera comes into line with it slowly as it nears the worm's head, and goes back once it's over
    const coming = ringDistance === null || ringWaiting ? 0 : p.constrain((ringWait - ringDistance) / (ringWait - ringLinedUp), 0, 1);
    ringPull += (coming * coming * (3 - 2 * coming) - ringPull) * (1 - Math.exp((-dt * forwardMotion()) / (ringDistance === null ? 1.5 : 0.5)));
  };
}
