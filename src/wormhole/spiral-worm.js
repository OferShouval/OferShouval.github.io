// Trying out: a worm drawn by the line of the noisy spiral. One line coils round and round the worm's body from its
// tail to its head, like a spring bent along its path, and the path weaves away into the distance, toward a point up
// near the horizon, like the psychworm in space earlier in the wormhole. Its tail's nearest, at the spiral, and each turn of
// the coil is smaller the further away it is. Like the noisy spiral, each point on the line comes partly from the last
// one, by an amount that's different every time, which makes it noisy, and the noise changes a few times a second.
// Its tail stays where it comes off the spiral until the spiral's all unwound. Then it's free: its tail drifts about the
// screen, and once it's let go and jolts forward, stars streak past, out from the point it's heading toward, as they do round the psychworm (see
// drawStars() in wormhole.js), so it looks like it's set off, moving forward. Then its tail's let go, and the view comes
// round to the psychworm's, like a rubber band let go (see stretchTime): from just above and behind it, with its tail near, at the bottom of the screen, as it
// weaves through space (see seenFromBehind() in wormhole.js).
//
// It curves about wildly like the noisy spiral's roses, with noise that changes quickly from point to point, but it's
// held in close to the body, gently, so it never flies out into spikes.
//
// It comes out of the noisy spiral itself, in the middle of the screen: the spiral's line carries straight on into the
// worm's coil, which starts as wide as the spiral and round it, and narrows and drifts out onto the worm's path over
// the first part of the worm (see emerge). It unwinds like thread off a spool: the spiral's used up from the outside in,
// as the worm gets longer, its head leading the way out, until the spiral's gone (see unwindTime).
//
// It's the last stage of the wormhole on the front page (see wormhole.js). It opens, once the old TV's switched off, on
// the noisy spiral, big, as it is in the wormhole (see spiralTime), loose at first and winding tighter, with its lines
// closer and closer together and the line longer and longer, always as big, and round it three portals, to art, music
// and bio (see portals): each a point, with its name on top of it like a link, at the corners of a triangle that turns
// slowly round the middle of the screen (see drawChoosing()). The spiral waits, wound up, until one's chosen. Then the
// worm comes out of it. Once the worm's let go and jolted forward, it flies on for a moment, and the
// portal that was chosen opens ahead of it. (With chooseFirst: false in its options, it plays first instead, and all
// three portals appear for the choosing at the end.) The chosen one grows from its point into a thin ring, and drifts to the middle of the screen and grows faster and faster as the stars rush past, drawing
// the worm into it, and once it's as wide as the screen's smaller side, it fills: with white for art, black for music
// and static for bio, each like the page it goes on to. The noisy spiral's lightning flashes all through it, some of it in the colours of the
// Luminin, until the end (see strikeEvery), apart from while it's unwinding into the worm, when there's only what
// someone asks for: pressing the mouse brings a flash of lightning, and letting go of it sets the spiral bursting into a rose,
// and, once the worm's been let go, holding it down pulls the worm out again, longer and thinner the longer it's held,
// and letting go snaps it back, as it was let go the first time (see stretchTime), with a few flashes.
// Run it by itself at /art/sketchbook/test.html?sketch=spiral-worm.

// The worm
const turns = 18; // How many times the line coils round its body, from its tail to its head
const size = 1; // How fat it is, compared to the psychworm
const bodyTime = 4; // How many seconds back along its path its tail is
const headDistance = 4; // How far away its head is, compared to its tail, which is at the spiral
const bodyScale = 2; // How big it's drawn
const weaveSpeed = 0.2; // How quickly it weaves (smaller = slower)
const weaveWide = 1.3; // How far it weaves from side to side, as a share of the screen's width
const weaveTall = 0.6; // ...and up and down, as a share of the screen's height
const weaving = 0.5; // How much of its weave shows, as it goes away (0 = straight away from the spiral)
const horizon = 0.25; // How far down the screen the point it's heading away toward is

// The stars streaking past (as in wormhole.js)
const starCount = 120;
const starSpeed = 0.35; // How much of the way to the camera a star comes each second
const starStreak = 0.12; // How long a streak each star leaves, in seconds: from where it was this long ago to where it is, so the faster they go, the longer they get
const setOffTime = 1.5; // How many seconds after it's free its tail's let go, and its tail takes to start drifting
const driftWide = 0.25; // How far its tail drifts from the middle of the screen, once it's free, as a share of the width
const driftTall = 0.12; // ...and up and down, as a share of the height
const driftSpeed = 0.15; // How quickly it drifts (smaller = slower)

// The psychworm's view, which it comes round to once it's set off (as in wormhole.js)
const releaseTime = 2; // How many seconds that takes

// Like a rubber band: just before its tail's let go, it's pulled out longer and thinner, while the camera rises to look
// down on it, so the stretch shows. Once it's let go, it snaps back to its usual size, and spins round itself: its coil
// turns round the middle of its body, like a drill bit spinning, while its body stays on its path.
const stretchTime = 1.5; // How many seconds before it's let go it starts stretching
const stretchOut = 2; // How much longer it gets (1 = twice as long)
const stretchCalm = 0.85; // How much its noise calms down while it's stretched out, pulled taut (1 = a plain coil)
const snapTime = 0.07; // How quickly it snaps back once it's let go, in seconds (bigger = slower)
const lookDown = 0.6; // How far above the top of the screen the point it's heading for goes as the camera rises, as a share of the screen's height
const lookDownDepth = 1.5; // How far away its head looks then, compared to its tail (less than headDistance, so it lies out across the screen)
const formingSlide = 0.86; // How far down the screen the spiral and the worm's tail slide as it forms, as the camera moves up and forward (0.5 = staying in the middle)
const formingLift = 0.8; // How far the camera's risen, as the worm forms out of the spiral, by the time it's all unwound (1 = as far as for the stretch)
const formingZoom = 0.85; // How small everything's got, as the camera pulls back while it moves up and forward, by the time it's formed (1 = not at all)
// Snapping back from being pulled out by the mouse, it flashes the screen: a few full flashes, white and in the colours of the Luminin, with a faint flicker
// in between. Full flashes are kept at least boltFlashGap apart, and the flicker's too faint to count as flashing, so
// there can't be more than three flashes in a second, the limit for not being a danger to people with epilepsy.
const boltFlashes = ['colour']; // The full flashes each letting go brings, one after another (only in colour: no white flashes)
const boltFlashLength = 0.06; // How many seconds a white flash lasts (a colour one lasts strikeClipLength)
const boltFlashGap = 0.34; // The least time between full flashes, in seconds
const boltFlicker = 0.5; // How many seconds the faint flicker after it lasts
const boltFlickerMost = 0; // How bright the flicker gets, at most, out of 1 (0: none, since it's white)
const releasedThinner = 0.8; // How fat it is once it's let go, compared to before (it gets there as the view comes round)
const settleView = 0.35; // How quickly the camera comes back down once it's let go, in seconds (bigger = slower)
// As it's let go and snaps back, it jolts forward: the stars rush past much faster for a moment, and slow back down
const joltStars = 5; // How much faster the stars go at the height of it
const joltOut = 0.8; // How quickly they slow back down, in seconds (bigger = slower)
const tailSnap = 0.7; // How far in toward its body its tail snaps as it's let go (1 = all the way)
const tailSnapPart = 0.3; // How much of the worm, from its tail, snaps in
const tailSnapIn = 0.04; // How many seconds snapping in takes
const tailSnapOut = 0.45; // ...and how many it takes to go back out
const spinSpeed = 6; // How quickly it spins round itself once it's let go, in radians a second

// Its tail stays at the middle of the spiral until it's let go, and then it's pushed out, going round and round it
const circling = 0.35; // How far out from the middle of the spiral its tail goes round, compared to how far the spiral reaches
const circlingSpeed = 2.5; // How quickly it goes round, in radians a second
const circlingPush = 3; // How many seconds after it's let go it takes to be pushed all the way out
const circlingTail = 0.4; // Once it's let go, how much of the worm, from its tail, goes round with it
const tailDistance = 0.9; // How far its tail is from the camera (1 = at its full size, and less is nearer)
const tailWander = 0.15; // How quickly its tail drifts around the screen (smaller = slower)
const tailWide = 0.4; // How far it can drift from the middle of the screen, as a share of the width
const tailTall = 0.1; // ...and up and down, as a share of the height
const cameraAbove = 0.5; // How far the camera is above it, as a share of the screen's height

// The noise
const ticks = 12; // How many times a second it changes
const spin = 1; // How far the coil turns each time it changes, in radians
// The rose
const roseRoughness = 0.8; // How much of the last point goes into the next is 1 / this, times the noise (under 1 = wilder)
const roseSteps = 70; // How many points on the line for each turn
const roseNoise = 0.05; // How quickly the noise changes from one point to the next (as the noisy spiral's step)
const roseReach = 2; // How far out it can go, compared to the body's width there: it's held in more and more toward that
// The noisy spiral it opens on, before the worm comes out of it
const spiralTime = 6; // How many seconds it's there before it starts unwinding
// Opening on the portals (see choosing), it grows slowly out of its middle, from a point, and stays smaller, so the
// portals can turn round it closer in
const choosingSpiral = 0.55; // How big it gets, compared to its usual size
// How the chosen portal grows once the worm launches, eased out and then in: shooting out of its point, steadier in the
// middle, then racing to cover the screen
const choiceGrowEase = 3; // How sharp the shooting out and the racing are (1 = none, higher = sharper)
const choiceGrowSteady = 0.3; // How much steadier it gets in the middle (0 = not at all, steady growth; 1 = it all but stops)
const panArc = 0.22; // How far the chosen portal's arc to the middle bows out to one side, as a share of how far it goes (0 = straight)
const panEase = 4; // How strongly the pan eases in and out (2 = gently, higher = slower to start and to settle)
const gateSpread = 1.4; // How far the others spread out away from it as the camera moves toward it (0 = not at all)
const gateFade = 1.6; // How many seconds the others take to fade away, spreading out, once one's chosen
const choosingTurn = true; // While they wait to be chosen, are they on their triangle turning round the spiral (see portalTriangle, portalSpin)? Otherwise they're in a still row (see rowTop). Either way, they stop the moment one's chosen.
const rowTop = [110, 0.15]; // How far down the screen the row of portals is: this many pixels, or this share of its height if that's further (below the navbar, with room for their names)
const choiceRoseHold = 0.1; // How many seconds after a portal's chosen the rose starts stretching out into the worm (soon: it's still blooming, never quite formed)
const choiceGrowTime = 4; // How many seconds it takes, once the worm's there, to grow until it covers the screen (portalTime otherwise)
const choosingGrow = 8; // How many seconds it takes to grow, easing in and out (it doesn't unwind before it's grown)
const choosingTurns = 3.5; // How many times it goes round, once it's grown
const spiralBig = 2.8; // How far out it goes: the smaller side of the screen divided by this
const roseSettling = 0.05; // How quickly it gets back to how it was wound, after bursting into a rose, each time it changes
const roseTightness = 250; // Lightning, and letting go of the mouse, set it bursting into a rose, wound at least this tightly
// Lightning: the colours swap for a moment every so often, and each flash sets the spiral
// bursting into a rose. Flashes are kept at least strikeGap apart, so there can't be more than three in a second, which is
// the limit for not being a danger to people with epilepsy.
const strikeEvery = [7, 16]; // How many seconds there are between strikes, at the least and the most
const strikesFirst = 1; // How many strikes it opens with
const strikesFirstEvery = [0.5, 1.1]; // How many seconds there are between those
const strikeLength = 0.06; // How many seconds a flash stays at its brightest
const strikeFade = 0; // ...and how many it takes to fade out after that (0 = it cuts out)
const strikeGap = 0.4; // How many seconds there are from the start of one flash to the start of the next, in a double strike
const strikeDouble = 0.15; // How often a strike flashes twice (1 = always)
// Colourful lightning: some strikes flash a fragment of the stabilized close-up of the Luminin, rather than white
const strikeClip = '/media/lumininCloseupStabilized.mp4';
const strikeInColour = 1; // How often a strike's in colour (1 = always). The rest would be white, so there are none: if the video isn't ready, there's no flash.
const strikeClipLength = 0.1; // How many seconds a strike in colour lasts. It cuts in and out, without fading.
const strikeClipCrop = [0.35, 0.8]; // How much of the width and height of the video a fragment shows, at the least and the most
// The end: once it's flown on a while, three portals open ahead of it, in a triangle, and wait for one to be chosen,
// which grows until it covers the screen. Each fills, at the end, like the page it goes to: `fill` is 'white', 'black'
// or 'static', and `inside` is how it looks inside while it's waiting. `towards` is which corner of the triangle it's at.
const portals = [
  { name: 'visual art', page: '/art/', inside: 'black', fill: 'white', fillTime: 1.5, note: 'wormArrives', towards: [0, -1] }, // The note's so a little worm comes out of the home hole (see src/sketches/hole_worm.js)
  { name: 'music', page: '/music/', inside: 'black', fill: 'black', fillTime: 0.4, towards: [-0.87, 0.5] },
  { name: 'bio', page: '/bio/', inside: 'static', fill: 'static', fillTime: 0.6, towards: [0.87, 0.5] },
];
const portalAfter = 1.25; // How many seconds after it's let go they appear
const portalOpen = 1.5; // How many seconds they take to fade in
const portalPoint = 6; // How big each point is across, while they're waiting, in pixels
const portalTriangle = 0.22; // How far each is from the middle of the screen, as a share of the screen's smaller side
const portalSpin = 0.25; // How quickly their triangle turns round the middle of the screen, in radians a second
const portalRing = 1.5; // How thick the chosen one's ring is, in pixels, however big it grows
const portalTime = 7; // How many seconds the chosen one takes to grow until it covers the screen
const portalGone = 0.6; // How many seconds the others take to fade away, once one's chosen
const portalFollow = 0.6; // How slowly the chosen one drifts to the middle of the screen, in seconds (bigger = slower)
const portalPull = 0.9; // How far into the chosen one's middle the worm's drawn by the end (1 = all the way, to a point)
const portalStatic = 96; // How many dots across the bio portal's static is
const exitRush = 12; // How much faster the stars go by the time it's covered the screen
// The spiral it comes out of
const unwindTime = 2; // How many seconds the spiral takes to unwind into the worm
// How the spiral becomes the worm. 'stretch': it doesn't unwind at all; its middle's pulled forward, away into the
// distance toward where it's heading, and the rest follows, middle first, so the flat spiral stretches out into the
// worm's tube, its middle becoming the worm's head and its outer edge the tail (see stretchLag). 'spool': it unwinds
// like thread off a spool, used up from the outside in, the worm's coil starting as wide as the spiral round its middle
// and narrowing as it comes out (the way it was before).
const unravel = 'stretch';
const tailShrink = 0.4; // How far through the stretch what's still flat has shrunk to a point, so its tail end narrows quickly (0 to 1)
const stretchLag = 0.6; // How far behind the middle the outer edge starts stretching out, as a share of the time it takes
const emerge = 0.25; // How much of the worm, from its tail, it takes to come out of the spiral and onto its own path
const spiralReach = 5; // Sets how far out its tail goes round, once it's let go (see circling): the smaller side of the screen divided by this
const spiralStep = 0.05; // How far around it goes between one point and the next, in radians
const spiralMostPoints = 20000; // It has to stop somewhere if the noise runs away
const spiralRoughest = 0.5; // How much of the last point goes into the next is 1 / this, times the noise...
const spiralSmoothest = 3; // ...smoothing out to this
const spiralSmoothing = 0.05; // ...by this much each time it changes
const loosest = 1; // How tightly it's wound at first (bigger = more turns, closer together)
const tightest = 1; // ...tightening up to this over tightenTime
const tightenTime = spiralTime; // In seconds: so it's loose when it opens, and as tight as it gets just as it starts to unwind
const thinnest = 1; // How thick the line is, in pixels, at the head
const thickest = 3; // ...and at the tail

export default function spiralWorm(p, container, options = {}) {
  let spiralRoughness = spiralRoughest;
  let unwindStart = 0; // When it started unwinding, in seconds
  let openedAt = 0; // When the noisy spiral opened, in seconds
  let roseFloor = 0; // How tightly the spiral's wound at least, once it's burst into a rose

  // Start again, from the noisy spiral
  function restart() {
    openedAt = seconds;
    unwindStart = seconds + spiralTime;
    roseFloor = 0;
    snapAt = null;
    snapFrom = 1;
    stars.length = 0;
    chosen = null;
    fillsAt = null;
    wormIn = false;
    for (const portal of portals) portal.at = null;
    nextStrike = seconds; // It opens with lightning
    firstStrikes = strikesFirst;
    spiralRoughness = spiralRoughest;
  }
  const stars = [];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches; // No lightning for anyone who's asked for less motion
  let nextStrike = 0; // When the next flash of lightning is
  let strikeEnds = 0; // When the one that's happening ends
  let strikeStarted = -Infinity; // When it started
  let asked = false; // Was the next one asked for, by pressing the mouse?
  let strikeFades = true; // Does the flash that's happening fade out? The ones in colour just stop.
  let firstStrikes = 0; // How many of the strikes it opens with are still to come
  let secondFlash = false; // Is the flash that's happening the second of a double strike?
  let clipCrop = null; // The part of the video the strike that's happening shows, if it's in colour
  let clipMoved = true; // Has the video been moved on to somewhere new since it was last shown?
  const clip = document.createElement('video');
  clip.muted = true;
  clip.loop = true;
  clip.playsInline = true;
  clip.preload = 'auto';
  let stretch = 1; // How long the worm is, compared to usual (see stretchTime)
  let lift = 0; // How far the camera's risen to look down on it, from 0 to 1
  let spun = 0; // How far it's spun round itself, in radians
  let rushing = 0; // How hard the stars are rushing past, as it jolts forward, from 0 to 1
  let letGo = false; // Has the worm been let go, and snapped back?
  let boltFlashAt = null; // When it last started flashing the screen, snapping back
  let flashQueue = []; // The full flashes still to come with it snapping back: when each starts, and what it is
  let lastFullFlash = -Infinity; // When the last full flash of any kind started, to keep them apart
  let snapAt = null; // When it last snapped back, from being let go or pulled out by the mouse
  let snapFrom = 1; // ...and how stretched it was then
  let pressedAt = null; // When the mouse was pressed down, pulling it out
  let chosen = null; // The portal that's been chosen, and when (chosen.at)
  // It opens on the portals, waiting for one to be chosen, and only then plays: the spiral, the worm, and the worm
  // flying on into the one that was chosen (see drawChoosing())
  let choosing = options.chooseFirst !== false;
  let choice = null; // The portal chosen before it played, which opens for the worm once it's flown on
  let choosingFrom = 0; // When the portals came up to be chosen from
  let choiceAt = null; // When one was chosen: it stays where it is, waiting, while the others fade away
  let ignoreRelease = false; // Is the mouse being let go after choosing a portal?
  let cameraDrop = 0; // How far down the screen the spiral's slid from the middle, which the portals follow
  let cameraMove = 0; // How far the camera's moved up and forward, from 0 to 1, once a portal's chosen
  let cameraPan = 0; // How far the camera's panned round behind the worm, bringing the chosen portal to the middle, from 0 to 1
  let calmStrike = false; // Is the next flash the one as a portal's chosen, which doesn't burst the spiral?
  const waiting = () => choosing || (choice && !chosen); // Are the portals still on their triangle round the spiral?
  let fillsAt = null; // When the chosen one got as wide as the screen's smaller side
  let leaving = false; // Has it gone on to the next page?
  let wormIn = false; // Has all of the worm gone into the chosen one?
  let portalsUp = false; // Have the portals started to open?
  let portalsOpen = 0; // How far they've faded in, from 0 to 1
  let portalsFrom = 0; // When they appeared, which their triangle turns from
  const snow = document.createElement('canvas'); // TV static, drawn afresh each frame, for the bio portal
  snow.width = snow.height = portalStatic;
  const snowContext = snow.getContext('2d');
  const snowImage = snowContext.createImageData(portalStatic, portalStatic);
  let turned = 0;
  let row = 0; // The row of noise it's using now
  let due = 0;
  let seconds = 0;

  // Where the worm's path is at a given time
  function weaveAt(time) {
    return {
      x: (p.noise(time * weaveSpeed) - 0.5) * 2 * weaveWide * p.width,
      y: (p.noise(time * weaveSpeed, 100) - 0.5) * 2 * weaveTall * p.height,
    };
  }

  // Where a place along the worm shows on the screen (along: 0 at the tail, 1 at the head). The tail's at the spiral,
  // in the middle of the screen, and the rest goes away from there, smaller and smaller toward the horizon, weaving
  // along its path as it goes.
  function awayFrom(along, centre) {
    const closer = 1 / p.lerp(1, p.lerp(headDistance, lookDownDepth, lift), along * stretch);
    const place = weaveAt(seconds - (1 - along) * bodyTime);
    const tail = weaveAt(seconds - bodyTime);
    // Heading away toward a point up near the horizon, further up as the camera rises, or, once a portal's been chosen,
    // toward it, so it reaches out and stretches toward the portal it's going through
    const aim = choice?.at;
    const farX = aim ? aim.x : p.width / 2;
    const farY = aim ? aim.y : p.lerp(p.height * horizon, -p.height * lookDown, lift);
    const sway = 1 - pinned(along);
    return {
      x: farX + (centre.x - farX) * closer + (place.x - tail.x) * weaving * closer * sway,
      y: farY + (centre.y - farY) * closer - (place.y - tail.y) * weaving * closer * sway,
      closer,
    };
  }

  // How firmly a place along the worm points at the chosen portal, from 0 (swaying freely) to 1 (right on it): its head
  // points straight into it, and its weave sways it less and less toward its head, so it's clearly going through
  function pinned(along) {
    return choice ? Math.min(1, along) ** 1.5 : 0;
  }

  // Where it's all heading: a point up near the horizon, or, once a portal's been chosen, that portal, so the worm, the
  // view behind it and the stars all go toward it
  function headingFor() {
    return choice?.at ?? { x: p.width / 2, y: p.height * horizon };
  }

  // Stars streaking out from where it's heading, each a line from where it was last frame to where it is now
  function drawStars(dt, shown, faster, ink) {
    if (shown <= 0) return;
    if (!stars.length) {
      for (let i = 0; i < starCount; i++) stars.push({ x: p.random(-1, 1), y: p.random(-1, 1), z: p.random(0.05, 1) });
    }
    const { x: farX, y: farY } = headingFor();
    const reach = Math.max(p.width, p.height) * 0.5;
    const speed = starSpeed * (1 + joltStars * rushing + faster);
    for (const star of stars) {
      star.z -= speed * dt;
      // Its streak, back to where it was starStreak ago (no further back than where it appeared)
      const wasZ = Math.min(1, star.z + speed * Math.max(dt, starStreak));
      const fromX = farX + (star.x * reach) / wasZ;
      const fromY = farY + (star.y * reach) / wasZ;
      if (star.z < 0.05) {
        star.x = p.random(-1, 1);
        star.y = p.random(-1, 1);
        star.z = 1;
        continue;
      }
      p.stroke(ink, 255 * (1 - star.z) * shown);
      p.strokeWeight(1 + (1 - star.z));
      p.line(fromX, fromY, farX + (star.x * reach) / star.z, farY + (star.y * reach) / star.z);
    }
  }

  // The spiral bursts into a rose, while there's still some of it. Lightning sets it off, and so does letting go of the mouse.
  function roseBurst() {
    if (choosing || seconds >= unwindStart + unwindTime) return; // (None while it waits for a portal to be chosen)
    spiralRoughness = spiralRoughest;
    roseFloor = roseTightness;
  }

  // How bright the flash of lightning is, from 0 to 1. Moves on to the next one when it's time.
  function strikeLight(ending) {
    if (calm || ending) return 0;
    if (choosing) {
      // None while it waits for a portal to be chosen
      nextStrike = Infinity;
      return 0;
    }
    // None comes by itself while it's unwinding: it waits until that's over
    const unwinding = seconds >= unwindStart && seconds < unwindStart + unwindTime;
    if (seconds >= nextStrike && unwinding && !asked) nextStrike = unwindStart + unwindTime + p.random(...strikeEvery);
    // ...and none too soon after one of the flashes that come with the worm snapping back
    if (seconds >= nextStrike && seconds - lastFullFlash < strikeGap) nextStrike = lastFullFlash + strikeGap;
    if (seconds >= nextStrike) {
      asked = false;
      strikeStarted = seconds;
      pickFragment();
      // Only in colour: without a fragment of the video to show, it doesn't flash at all
      strikeFades = false;
      strikeEnds = seconds + (clipCrop ? strikeClipLength : 0);
      const wasCalm = calmStrike;
      if (calmStrike) calmStrike = false; // (The flash as a portal's chosen: its rose is already set off)
      else roseBurst();
      if (firstStrikes > 0) {
        firstStrikes--;
        secondFlash = false;
        nextStrike = seconds + (firstStrikes > 0 ? p.random(...strikesFirstEvery) : p.random(...strikeEvery));
      } else {
        secondFlash = !secondFlash && p.random() < strikeDouble;
        nextStrike = seconds + (secondFlash ? strikeGap : p.random(...strikeEvery));
      }
      // The flash as a portal's chosen is on its own: no double, and nothing more until the worm's formed
      if (wasCalm) {
        secondFlash = false;
        nextStrike = unwindStart + unwindTime + p.random(...strikeEvery);
      }
    }
    if (seconds < strikeEnds) return 1;
    return strikeFades && strikeFade > 0 ? Math.max(0, 1 - (seconds - strikeEnds) / strikeFade) : 0;
  }

  // Whether the strike starting now is in colour, and which part of the video it shows
  function pickFragment() {
    clipCrop = null;
    if (clip.readyState < 2 || clip.seeking || p.random() >= strikeInColour) return;
    const share = p.random(...strikeClipCrop);
    const wide = clip.videoWidth * share;
    const tall = clip.videoHeight * share;
    clipCrop = { x: p.random(clip.videoWidth - wide), y: p.random(clip.videoHeight - tall), wide, tall };
    clipMoved = false;
  }

  // The ground, with any lightning in it: white for a moment, or a fragment of the video. Gives the colour to draw in,
  // whichever the ground isn't.
  function drawGround(light) {
    const context = p.drawingContext;
    if (clipCrop && light > 0) {
      p.background(0);
      context.save();
      context.globalAlpha = light;
      context.drawImage(clip, clipCrop.x, clipCrop.y, clipCrop.wide, clipCrop.tall, 0, 0, p.width, p.height);
      context.restore();
      return 255;
    }
    if (light === 0) {
      clipCrop = null;
      // Once it's over, the video moves on to somewhere new
      if (!clipMoved && clip.readyState >= 1) {
        clip.currentTime = p.random(clip.duration);
        clipMoved = true;
      }
    }
    const ground = 255 * light;
    p.background(ground);
    return ground > 127 ? 0 : 255;
  }

  // Where the camera is, in the psychworm's view: wherever puts the tail where it's drifted to on the screen
  function cameraAt(time) {
    const tail = weaveAt(time - bodyTime);
    return {
      x: tail.x - (p.noise(time * tailWander, 200) - 0.5) * 2 * tailWide * p.width,
      y: tail.y - (p.noise(time * tailWander, 300) - 0.5) * 2 * tailTall * p.height,
    };
  }

  // Where a place along the worm shows on the screen in the psychworm's view (along: 0 at the tail, 1 at the head)
  function seenFromBehind(along, camera) {
    const closer = 1 / p.lerp(tailDistance, headDistance, along * stretch);
    const place = weaveAt(seconds - (1 - along) * bodyTime);
    const sway = 1 - pinned(along);
    return {
      x: headingFor().x + (place.x - camera.x) * closer * sway,
      y: headingFor().y + (p.height * cameraAbove - (place.y - camera.y)) * closer * sway,
      closer,
    };
  }

  p.setup = () => {
    const canvas = p.createCanvas(container.clientWidth, container.clientHeight);
    clip.src = strikeClip;
    clip.addEventListener('loadedmetadata', () => (clip.currentTime = p.random(clip.duration)), { once: true });
    if (!calm) clip.play().catch(() => {});
    restart();
    // Pressing the mouse brings a flash of lightning, as long as it's not too soon after the last (see strikeGap), and
    // letting go sets the spiral bursting into a rose
    canvas.mousePressed(() => {
      // Choosing where to go: then the spiral unwinds into the worm (once it's been open long enough, see spiralTime)
      if (choosing) {
        const picked = portalAtMouse();
        if (picked) {
          choosing = false;
          choice = picked;
          choiceAt = seconds;
          p.canvas.style.cursor = '';
          // At once a flash in colour, and the spiral bursts into a rose, as lightning sets it off, which a moment later
          // (see choiceRoseHold, under 2 seconds, however soon it's chosen) stretches out into the worm
          unwindStart = seconds + choiceRoseHold;
          nextStrike = seconds;
          firstStrikes = 0;
          calmStrike = true;
          roseBurst(); // The rose lightning sets off: a straight line for a moment, then blooming out, chaotic and big (see roseFull)
          ignoreRelease = true; // (Letting go of this click doesn't burst it again)
          return;
        }
      }
      // Choosing a portal, while they're waiting
      const picked = portalsUp && !chosen ? portalAtMouse() : null;
      if (picked) {
        chosen = { portal: picked, at: seconds };
        p.canvas.style.cursor = '';
        return;
      }
      if (choosing) return; // No lightning until a portal's chosen
      pressedAt = seconds;
      if (seconds - strikeStarted >= strikeGap) {
        nextStrike = seconds;
        asked = true;
      }
    });
    canvas.mouseReleased(() => {
      if (ignoreRelease) {
        ignoreRelease = false; // Letting go of the click that chose a portal doesn't burst the spiral into a rose
        return;
      }
      roseBurst();
      pressedAt = null;
      // Once the worm's been let go, pulled out again by holding the mouse down, it snaps back, with a few flashes
      if (letGo && stretch > 1.02) {
        snapAt = seconds;
        snapFrom = stretch;
        boltFlashAt = seconds;
        // Its full flashes, one after another, the first as soon as it's not too soon after the last
        const first = Math.max(seconds, lastFullFlash + boltFlashGap, strikeStarted + boltFlashGap);
        flashQueue = boltFlashes.map((kind, n) => ({ at: first + n * boltFlashGap, kind }));
      }
    });
    // Skipping goes straight to the end, where the portals are, which is where it starts if it's been skipped to (see
    // skipToPortals() in wormhole.js)
    container.skipToPortals = () => {
      if (choosing || portalsUp) return;
      unwindStart = seconds - unwindTime - setOffTime - portalAfter;
    };
    if (options.atPortals && !choosing) container.skipToPortals();
  };

  p.windowResized = () => p.resizeCanvas(container.clientWidth, container.clientHeight);

  // Where each portal is, while they're waiting
  function openingAt(portal) {
    // Opening on the portals, they stand still in a row across the top of the screen, over the spiral, and the chosen
    // one stays where it is (see rowTop)
    if (options.chooseFirst !== false) {
      const place = portals.indexOf(portal);
      const row = (n) =>
        choosingTurn
          ? onTriangle(portals[n], (choiceAt ?? seconds) - (choosingFrom ?? seconds)) // (Turned as far as it had when one was chosen)
          : { x: (p.width * (n + 1)) / (portals.length + 1), y: Math.max(rowTop[0], p.height * rowTop[1]) };
      const here = row(place);
      if (choiceAt === null) return here;
      // Once one's chosen, the camera moves up and forward toward it, so they move as things do in depth: the spiral,
      // near, slides a long way down the screen, but the chosen one, far off where it's all heading, hardly moves,
      // on its own smooth arc (below), and the others, beside it, spread out away from it as it's neared
      // ...and the camera swings round behind the worm in one smooth arc, the whole way from when the spiral starts
      // stretching to when the worm goes through, so the chosen one eases into the middle of the screen, centred just as
      // the worm goes through it, with the others moving along with it (see panArc, panEase)
      const chosenAt = row(portals.indexOf(choice));
      const from = chosenAt;
      const to = { x: p.width / 2, y: p.height / 2 };
      const heading = onArc(from, to, panArc, cameraPan);
      // (The others spread out as they fade, from the moment it's chosen)
      const spreading = Math.min(1, (seconds - choiceAt) / gateFade);
      const spread = 1 + gateSpread * (1 - (1 - spreading) ** 2);
      return { x: heading.x + (here.x - chosenAt.x) * spread, y: heading.y + (here.y - chosenAt.y) * spread };
    }
    // Otherwise, at the corners of a triangle turning slowly round the middle of the screen
    return onTriangle(portal, seconds - portalsFrom);
  }
  // Where a portal is on their triangle round the middle of the screen, once it's been turning for `time` seconds
  function onTriangle(portal, time) {
    const out = portalTriangle * Math.min(p.width, p.height);
    const turned = time * portalSpin;
    const [x, y] = portal.towards;
    return {
      x: p.width / 2 + (x * Math.cos(turned) - y * Math.sin(turned)) * out,
      y: p.height / 2 + (x * Math.sin(turned) + y * Math.cos(turned)) * out,
    };
  }
  // A point along an arc of a circle from one point to another, bowed out to one side by `bow` (how far its middle is
  // from the straight line, as a share of the line's length), `t` of the way along: so it bends evenly all the way
  function onArc(from, to, bow, t) {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length < 1 || bow <= 0) return { x: p.lerp(from.x, to.x, t), y: p.lerp(from.y, to.y, t) };
    const side = { x: -(to.y - from.y) / length, y: (to.x - from.x) / length }; // Which way it bows
    const sag = bow * length;
    const radius = (length * length) / 4 / (2 * sag) + sag / 2;
    const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const centre = { x: middle.x - side.x * (radius - sag), y: middle.y - side.y * (radius - sag) };
    const start = Math.atan2(from.y - centre.y, from.x - centre.x);
    let sweep = Math.atan2(to.y - centre.y, to.x - centre.x) - start;
    if (sweep > Math.PI) sweep -= Math.PI * 2;
    if (sweep < -Math.PI) sweep += Math.PI * 2;
    return { x: centre.x + radius * Math.cos(start + sweep * t), y: centre.y + radius * Math.sin(start + sweep * t) };
  }

  // How big a waiting portal is across
  function waitingSize() {
    return portalPoint;
  }

  // How big the chosen one is across its radius, at `at`: a point, as it was waiting, until the worm launches forward, and
  // then shooting out of it, steadier in the middle, then racing to cover the screen (see choiceGrowEase) (when it's done, see
  // choiceGrownAt()), so the worm seems to shoot through it at speed
  function choiceRadius(at) {
    const point = waitingSize() / 2;
    const eased = choiceGrowth();
    const covers = Math.hypot(Math.max(at.x, p.width - at.x), Math.max(at.y, p.height - at.y));
    return point * Math.pow(Math.max(1, covers / point), eased); // (By shares, so it grows faster as it gets bigger, like something coming nearer)
  }
  // How far through its growth the chosen one is, from the worm's launch until it covers the screen, eased out and then
  // in: fast at both ends and steadier in the middle (see choiceGrowEase, choiceGrowSteady). The worm's drawn into it
  // the same way, from when it starts drawing it in (`from`).
  function choiceGrowth(from = unwindStart + unwindTime + setOffTime) {
    const grown = Math.min(1, Math.max(0, (seconds - from) / Math.max(0.1, choiceGrownAt() - from)));
    const outIn = grown < 0.5 ? 0.5 * (1 - (1 - 2 * grown) ** choiceGrowEase) : 0.5 + 0.5 * (2 * grown - 1) ** choiceGrowEase;
    return p.lerp(grown, outIn, choiceGrowSteady);
  }
  // When the chosen one's covered the screen: choiceGrowTime after it's opened round the worm, after it's let go
  function choiceGrownAt() {
    return unwindStart + unwindTime + setOffTime + portalAfter + choiceGrowTime;
  }

  // The portal the mouse is over, while they're waiting: on its point, or its name on top of it
  function portalAtMouse() {
    return portals.find(({ at }) => at && Math.abs(p.mouseX - at.x) < 40 && p.mouseY > at.y - 40 && p.mouseY < at.y + 14);
  }

  // Fills the circle at (x, y) with the given radius: black, white, a shade of grey between, or static
  function fillPortal(context, x, y, radius, inside) {
    context.save();
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    if (inside === 'static') {
      context.clip();
      const data = snowImage.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = data[i + 1] = data[i + 2] = Math.random() * 255;
        data[i + 3] = 255;
      }
      snowContext.putImageData(snowImage, 0, 0);
      context.imageSmoothingEnabled = false;
      context.drawImage(snow, x - radius, y - radius, radius * 2, radius * 2);
    } else {
      context.fillStyle = inside;
      context.fill();
    }
    context.restore();
  }

  // The portals, round the noisy spiral while it waits, at the corners of their triangle turning round the middle of the
  // screen, each a point with its name on top of it, fading in, waiting for one to be chosen
  function drawChoosing() {
    const context = p.drawingContext;
    if (!choosingFrom) choosingFrom = seconds;
    portalsFrom = choosingFrom;
    const opened = Math.min(1, (seconds - choosingFrom) / portalOpen);
    const fadedIn = opened * opened * (3 - 2 * opened);
    const over = choosing ? portalAtMouse() : null;
    if (choosing) p.canvas.style.cursor = over ? 'pointer' : '';
    for (const portal of portals) {
      // Once one's chosen, it stays, and the others fade away
      const shown = fadedIn * (choice && portal !== choice ? Math.max(0, 1 - (seconds - choiceAt) / gateFade) : 1);
      portal.at = openingAt(portal);
      if (shown <= 0) continue;
      const { x, y } = portal.at;
      let radius = waitingSize() / 2;
      context.save();
      context.globalAlpha = shown;
      if (portal === choice) {
        // Chosen: it stops, and opens at once from its point into a ring, a hole for the worm to go through
        radius = choiceRadius(portal.at);
        fillPortal(context, x, y, radius, portal.inside); // (Dark inside, or static for bio, as it is once it opens)
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.strokeStyle = 'white';
        context.lineWidth = portalRing;
        context.stroke();
      } else {
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = 'white';
        context.fill();
      }
      context.globalAlpha = shown * (portal === over || portal === choice ? 1 : 0.8);
      context.font = '16px "Major Mono Display", monospace';
      context.textAlign = 'center';
      context.textBaseline = 'bottom';
      const nameY = y - radius - 10;
      context.fillText(portal.name, x, nameY);
      if (portal === over) {
        const wide = context.measureText(portal.name).width;
        context.fillRect(x - wide / 2, nameY + 3, wide, 1);
      }
      context.restore();
    }
  }

  p.draw = () => {
    const dt = Math.min(p.deltaTime / 1000, 0.1);
    seconds += dt;
    due += dt;
    if (due >= 1 / ticks) {
      due %= 1 / ticks;
      row = p.random(1000);
      turned += spin;
      if (spiralRoughness < spiralSmoothest) spiralRoughness += spiralSmoothing;
      roseFloor *= 1 - roseSettling; // The rose wears off
    }

    const context = p.drawingContext;
    if (choosing) unwindStart = Math.max(unwindStart, seconds + 0.05); // The spiral waits, wound up, until a portal's chosen
    const unwound = Math.min(1, Math.max(0, (seconds - unwindStart) / unwindTime)); // How much of it's unwound, from 0 to 1
    // Once it's all unwound, it's free, and sets off
    const freeFor = seconds - unwindStart - unwindTime;
    const setOff = freeFor > 0 ? Math.min(1, freeFor / setOffTime) : 0;
    const settingOff = setOff * setOff * (3 - 2 * setOff);
    // ...and then the view comes round to the psychworm's
    const release = Math.min(1, Math.max(0, (freeFor - setOffTime) / releaseTime));
    const released = 1 - (1 - release) ** 3; // Setting off straight away, the moment it's let go, and slowing as it settles
    const camera = cameraAt(seconds);
    // The rubber band: pulled out just before it's let go, as the camera rises, then snapping back
    const sinceLetGo = freeFor - setOffTime;
    letGo = sinceLetGo > 0;
    // ...and once it's flown on a while, rushing faster and faster until the screen's white
    // The portals opening, growing from a point, easing in and out, and once one's chosen, it growing until it covers the screen
    portalsUp = sinceLetGo > portalAfter;
    // Chosen before it played: only that one opens, from where it's been waiting, and it starts growing at once,
    // drawing the worm in (it's already showing, so it doesn't fade in again)
    if (portalsUp && choice && !chosen) chosen = { portal: choice, at: seconds };
    const opened = Math.min(1, Math.max(0, (sinceLetGo - portalAfter) / portalOpen));
    portalsOpen = choice ? 1 : opened * opened * (3 - 2 * opened); // (Chosen first, it's already showing: it mustn't fade out and in again as the worm flies at it)
    if (!portalsUp) portalsFrom = seconds;
    const exiting = chosen ? Math.min(1, (seconds - chosen.at) / (choice ? choiceGrowTime : portalTime)) : 0; // How far the chosen one's grown
    // The ground, with any lightning: the spiral's, or the flashes that come with the worm snapping back
    const sinceBoltFlash = boltFlashAt === null ? Infinity : seconds - boltFlashAt;
    let fullBoltFlash = 0;
    if (!calm && flashQueue.length && seconds >= flashQueue[0].at) {
      const flash = flashQueue[0];
      if (!flash.started) {
        flash.started = true;
        lastFullFlash = seconds;
        clipCrop = null;
        if (flash.kind === 'colour') pickFragment(); // In the colours of the Luminin, if the video's ready, and none if not
        flash.length = clipCrop ? strikeClipLength : flash.kind === 'white' ? boltFlashLength : 0;
      }
      if (seconds < flash.at + flash.length) fullBoltFlash = 1;
      else {
        flashQueue.shift();
        clipCrop = null;
      }
    }
    const ink = drawGround(Math.max(strikeLight(portalsUp), fullBoltFlash));
    // ...and the faint flicker after it, between them, different every frame
    if (!calm && sinceBoltFlash < boltFlicker + boltFlashGap * (boltFlashes.length - 1) && !fullBoltFlash) {
      const flickerFor = boltFlicker + boltFlashGap * (boltFlashes.length - 1);
      context.fillStyle = `rgba(255,255,255,${Math.random() * boltFlickerMost * (1 - sinceBoltFlash / flickerFor)})`;
      context.fillRect(0, 0, p.width, p.height);
    }
    drawStars(dt, sinceLetGo > 0 ? 1 : 0, exitRush * exiting * exiting, ink); // No stars until it jolts forward, then all at once
    // How far it's formed, eased gently in and out, so the camera starts and stops moving softly
    const forming = unwound ** 3 * (unwound * (unwound * 6 - 15) + 10);
    if (sinceLetGo < 0) {
      const pulled = Math.min(1, Math.max(0, (sinceLetGo + stretchTime) / stretchTime));
      const stretching = pulled * pulled; // Faster and faster, so it's let go right at its farthest, not after it's eased to a stop
      stretch = 1 + stretchOut * stretching;
      // Rising as the worm forms, and held there through the stretch: rising more would flatten it out, and pull it
      // back in just before it's let go
      lift = (unravel === 'stretch' ? 0 : formingLift) * forming; // (Stretching, the camera stays put, so it draws straight out into the distance)
    } else {
      // Let go, and snapping back, the first time from its stretch, and after that from being pulled out by the mouse
      if (snapAt === null) {
        snapAt = seconds - sinceLetGo;
        snapFrom = 1 + stretchOut;
      }
      const holding = pressedAt !== null && p.mouseIsPressed && !chosen && seconds - pressedAt > 0;
      if (holding) {
        // Pulled out by the mouse, faster and faster, the longer it's held, from however stretched it is now
        const pulled = Math.min(1, (seconds - pressedAt) / stretchTime);
        stretch = Math.max(stretch, 1 + stretchOut * pulled * pulled);
      } else {
        stretch = 1 + (snapFrom - 1) * Math.exp(-(seconds - snapAt) / snapTime);
      }
      lift = (unravel === 'stretch' ? 0 : formingLift) * Math.exp(-sinceLetGo / settleView);
    }
    const sinceSnap = snapAt === null ? -1 : seconds - snapAt;
    const snapStrength = (snapFrom - 1) / stretchOut; // How hard it snapped, from 0 to 1
    // ...jolting forward as it snaps back, with the stars rushing past
    rushing = sinceSnap > 0 ? Math.exp(-sinceSnap / joltOut) * snapStrength : 0; // At its height the moment it lets go
    // ...and spinning round itself once it's let go
    if (sinceLetGo > 0) spun += spinSpeed * (1 - Math.exp(-sinceLetGo / snapTime)) * dt;
    else spun = 0;
    const perTurn = roseSteps;
    const stretching = unravel === 'stretch'; // (See unravel)
    // The worm's only as long as the thread that's come off, or, stretching, all of it, worked out as it will be
    const shape = stretching ? 1 : unwound;
    const total = Math.max(1, Math.round(turns * perTurn * shape));
    // The spiral's in the middle of the screen, and slides down it as the camera moves up and forward over it
    // Stretching, the camera starts moving the moment a portal's chosen, as the rose begins, and eases down from then
    // until the worm's let go, getting there just as it launches (see cameraFrom, launchAt)
    const cameraFrom = choiceAt ?? unwindStart;
    const launchAt = unwindStart + unwindTime + setOffTime;
    const slid = unravel === 'stretch' ? Math.min(1, Math.max(0, (seconds - cameraFrom) / Math.max(0.1, launchAt - cameraFrom))) : 0;
    const sliding = unravel === 'stretch' ? slid * slid * (3 - 2 * slid) : forming;
    const centre = { x: p.width / 2, y: p.height * p.lerp(0.5, formingSlide, sliding) };
    cameraDrop = centre.y - p.height / 2; // (So the portals move with it, see openingAt())
    cameraMove = sliding;
    if (unravel === 'stretch') {
      // The camera's arc takes the whole movement, from the moment the portal's chosen to when it's opened round the
      // worm, easing in and out strongly (see panEase)
      const panned = Math.min(1, Math.max(0, (seconds - cameraFrom) / Math.max(0.1, launchAt + portalAfter + choiceGrowTime - cameraFrom)));
      cameraPan = panned < 0.5 ? 0.5 * (2 * panned) ** panEase : 1 - 0.5 * (2 - 2 * panned) ** panEase;
    }
    // Where its tail is: where it comes off the spiral, until it's free, and then drifting about
    // ...going round and round, a little way out from the middle of the spiral
    const pushed = sinceLetGo > 0 ? Math.min(1, sinceLetGo / circlingPush) : 0;
    const round = circling * (Math.min(p.width, p.height) / spiralReach) * pushed * pushed * (3 - 2 * pushed);
    const circle = { x: Math.cos(seconds * circlingSpeed) * round, y: Math.sin(seconds * circlingSpeed) * round };
    const tailAt = {
      x: centre.x + circle.x + (p.noise(seconds * driftSpeed, 200) - 0.5) * 2 * driftWide * p.width * settingOff,
      y: centre.y + circle.y + (p.noise(seconds * driftSpeed, 300) - 0.5) * 2 * driftTall * p.height * settingOff,
    };

    // The spiral, out from the middle of the screen. Each point comes partly from the last one, by a different
    // amount every time.
    const spiral = [];
    // As big as ever, however tightly it's wound: tighter, it just goes round more times before it gets there
    let limit = Math.min(p.width, p.height) / spiralBig;
    if (options.chooseFirst !== false) {
      const grown = Math.min(1, (seconds - openedAt) / choosingGrow);
      // ...though while it's a rose it opens out to its usual size, as big as roses get, shrinking back as it wears off
      const rose = Math.min(1, roseFloor / roseTightness);
      limit *= p.lerp(choosingSpiral * grown * grown * (3 - 2 * grown), 1, rose);
    }
    const winding = loosest * Math.pow(tightest / loosest, Math.min(1, (seconds - openedAt) / tightenTime));
    // Opening on the portals, it's wound to have choosingTurns turns once it's grown (it's as far out as (turned angle)²
    // / tightness, so that's how tight it has to be), and growing, they come out from the middle one after another
    const grownLimit = (Math.min(p.width, p.height) / spiralBig) * choosingSpiral;
    const tightness = options.chooseFirst !== false ? Math.max((2 * Math.PI * choosingTurns) ** 2 / grownLimit, roseFloor) : Math.max(winding, roseFloor);
    let x = 0;
    let y = 0;
    let around = 0;
    // Opening on the portals, it ends where its smooth path (radius = angle² / tightness) would reach its size, at the
    // same angle whatever the noise does, so its outer end comes steadily round as it grows instead of jumping back and
    // forth as the noise changes. (Otherwise it ends wherever the noisy line first gets that far out.)
    const byAngle = options.chooseFirst !== false && roseFloor <= tightness * 0.5 + 1; // (Not while it's a rose: that ends where its line gets far enough out)
    const endAngle = Math.sqrt(limit * tightness);
    for (let i = 0; i < spiralMostPoints && (byAngle ? around < endAngle && Math.hypot(x, y) < limit * 1.6 : Math.hypot(x, y) < limit); i++) {
      const wobble = p.noise(around, row);
      const radius = (around * around) / tightness;
      x = radius * Math.cos(around) + (x / spiralRoughness) * wobble;
      y = radius * Math.sin(around) + (y / spiralRoughness) * wobble;
      // Turned with the coil
      spiral.push({ x: centre.x + x * Math.cos(turned) - y * Math.sin(turned), y: centre.y + x * Math.sin(turned) + y * Math.cos(turned) });
      around += spiralStep;
    }
    if (!stretching) spiral.length = Math.round(spiral.length * (1 - unwound)); // What's left on the spool: it comes off from the outside in
    const last = spiral[spiral.length - 1] ?? centre;
    const startAngle = Math.atan2(last.y - tailAt.y, last.x - tailAt.x); // Where the coil carries on from, round its tail
    const startRadius = spiral.length ? Math.hypot(last.x - tailAt.x, last.y - tailAt.y) : 0; // Nothing to come from once it's all unwound

    // Where the worm's line goes, worked out from the tail, since each point comes from the one before
    const points = [];
    let offX = 0; // Where the line is, round the middle of its body
    let offY = 0;
    for (let i = 0; i <= total; i++) {
      const along = (i / total) * shape; // 0 at the tail, 1 at the head, once it's all come off
      const coming = Math.min(1, along / emerge);
      // How far it's come out of the spiral, from 0 to 1, all of it once its tail's let go
      const leaving = stretching ? 1 : p.lerp(coming * coming * (3 - 2 * coming), 1, released);
      const away = awayFrom(along, tailAt);
      let behind = away;
      // (Stretching, it stays in the view it formed in, the camera's own movements doing the rest, rather than going
      // over to the psychworm's view from behind, which would morph it mid-flight)
      const turning = stretching ? 0 : released;
      if (turning > 0) {
        // In the psychworm's view, the tail end still goes round, less and less further along it
        const seen = seenFromBehind(along, camera);
        const going = Math.max(0, 1 - along / circlingTail) ** 2;
        behind = { x: seen.x + circle.x * going, y: seen.y + circle.y * going, closer: seen.closer };
      }
      const onPath = {
        x: p.lerp(away.x, behind.x, turning),
        y: p.lerp(away.y, behind.y, turning),
        closer: p.lerp(away.closer, behind.closer, turning),
      };
      const middle = { x: p.lerp(tailAt.x, onPath.x, leaving), y: p.lerp(tailAt.y, onPath.y, leaving) };
      const body = ((Math.sin(along * Math.PI) * (p.width / 8) * bodyScale * onPath.closer * size) / 2 / Math.sqrt(stretch)) * p.lerp(1, releasedThinner, released); // Thinner as it stretches, and once it's let go
      const radius = p.lerp(startRadius, body, leaving);
      const angle = startAngle + (i / perTurn) * Math.PI * 2;
      // Each point partly from the last one, by a different amount every time
      const wobble = p.noise(i * roseNoise, row);
      offX = radius * Math.cos(angle) + (offX / roseRoughness) * wobble;
      offY = radius * Math.sin(angle) + (offY / roseRoughness) * wobble;
      // Held in, more and more the further out it is, so it curves back round before it can spike
      const out = Math.hypot(offX, offY);
      const most = roseReach * radius * 2;
      if (out > 0 && most > 0) {
        const held = (most * Math.tanh(out / most)) / out;
        offX *= held;
        offY *= held;
      }
      // Coming out of the spiral, it starts as a plain circle round it, from where the spiral ended, and the noise comes in
      const plainX = radius * Math.cos(angle);
      const plainY = radius * Math.sin(angle);
      // Turned round the middle of its body by how far it's spun
      // ...and calming down while it's stretched taut
      const noisy = leaving * (1 - stretchCalm * ((stretch - 1) / stretchOut));
      const roundX = p.lerp(plainX, offX, noisy);
      const roundY = p.lerp(plainY, offY, noisy);
      const c = Math.cos(spun);
      const sn = Math.sin(spun);
      points.push({ x: middle.x + roundX * c - roundY * sn, y: middle.y + roundX * sn + roundY * c, along });
    }


    // As it's let go, its tail snaps in toward its body, like the end of a rubber band, and goes back out
    const snapping = sinceSnap > 0 ? tailSnap * snapStrength * (1 - Math.exp(-sinceSnap / tailSnapIn)) * Math.exp(-sinceSnap / tailSnapOut) : 0;
    if (snapping > 0.001) {
      const body = points[Math.min(total, Math.round(total * (tailSnapPart / Math.max(unwound, 0.001))))];
      for (const point of points) {
        if (point.along >= tailSnapPart) break;
        const pulled = snapping * (1 - point.along / tailSnapPart);
        point.x += (body.x - point.x) * pulled;
        point.y += (body.y - point.y) * pulled;
      }
    }

    // The portals, at the corners of a triangle turning round the middle of the screen, each a point with its name on
    // top of it, waiting. Once one's chosen, it grows from its point into a thin ring, the others fade away, and it drifts
    // to the middle of the screen, growing faster and faster until it covers the screen, drawing the worm in. They go
    // behind the worm, so it goes in head first.
    // (While they're waiting, they're behind the spiral and the worm too, so the chosen one doesn't cover the worm as it grows)
    if (waiting()) drawChoosing();
    if (portalsUp) {
      const over = chosen ? null : portalAtMouse();
      p.canvas.style.cursor = over ? 'pointer' : '';
      for (const portal of portals) {
        const isChosen = chosen?.portal === portal;
        const shown = portalsOpen * (chosen && !isChosen ? Math.max(0, 1 - (seconds - chosen.at) / portalGone) : 1);
        if (shown <= 0) continue;
        const opening = openingAt(portal);
        portal.at ??= { ...opening };
        if (!chosen) Object.assign(portal.at, opening);
        let radius = waitingSize() / 2;
        if (isChosen) {
          const nearer = exiting * exiting * (3 - 2 * exiting);
          // (Chosen first, it opens where it's been waiting, with the worm already heading into it)
          // ...keeping to it exactly, on the camera's arc, as it did while waiting, so it doesn't lag and catch up as it's handed over
          const wanted = choice ? opening : { x: p.lerp(opening.x, p.width / 2, nearer), y: p.lerp(opening.y, p.height / 2, nearer) };
          const keep = choice ? 1 : 1 - Math.exp(-dt / portalFollow);
          portal.at.x += (wanted.x - portal.at.x) * keep;
          portal.at.y += (wanted.y - portal.at.y) * keep;
          if (choice) radius = choiceRadius(portal.at); // (Chosen first, it's been growing since it was chosen, and grows on the same way)
          else {
            const covers = Math.hypot(Math.max(portal.at.x, p.width - portal.at.x), Math.max(portal.at.y, p.height - portal.at.y));
            const from = Math.max(radius, 1);
            // Growing by the same share each moment, so it's slow while it's small and races at the end, like something
            // coming nearer
            radius = from * Math.pow(covers / from, exiting);
          }
          if (fillsAt === null && radius * 2 >= Math.min(p.width, p.height)) fillsAt = seconds;
        }
        const { x, y } = portal.at;
        context.save();
        context.globalAlpha = shown;
        if (!isChosen) {
          // A point, while it waits
          context.beginPath();
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.fillStyle = 'white';
          context.fill();
        } else if (radius > 0.5) {
          // Inside, filling and filling like the page it goes to, once it's as wide as the screen's smaller side
          const filling = isChosen && fillsAt !== null ? Math.min(1, (seconds - fillsAt) / portal.fillTime) : 0;
          if (portal.fill === 'white') {
            const shade = Math.round(255 * filling * filling * (3 - 2 * filling));
            fillPortal(context, x, y, radius, `rgb(${shade},${shade},${shade})`);
          } else {
            fillPortal(context, x, y, radius, filling > 0 ? portal.fill : portal.inside);
          }
        }
        // Its ring, thin, once it's chosen
        if (isChosen) {
          context.beginPath();
          context.arc(x, y, Math.max(radius, 0.5), 0, Math.PI * 2);
          context.strokeStyle = 'white';
          context.lineWidth = portalRing;
          context.stroke();
        }
        // Its name, on top of it, while they're waiting, like a link
        if (!isChosen || exiting < 0.1) {
          context.globalAlpha = shown * (isChosen ? 1 - exiting / 0.1 : 1) * (portal === over ? 1 : 0.8);
          context.fillStyle = 'white';
          context.font = '16px "Major Mono Display", monospace';
          context.textAlign = 'center';
          context.textBaseline = 'bottom';
          const nameY = y - radius - 10;
          context.fillText(portal.name, x, nameY);
          if (portal === over) {
            const wide = context.measureText(portal.name).width;
            context.fillRect(x - wide / 2, nameY + 3, wide, 1);
          }
        }
        context.restore();

        // The worm's drawn in toward the chosen one's middle as it grows: head first, aiming straight at it, and the
        // rest following, until all of it's going in
        if (isChosen) {
          const drawn = choice ? choiceGrowth(chosen.at) : exiting * exiting * (3 - 2 * exiting); // (Chosen first, in step with its growth)
          for (const point of points) {
            const pulled = drawn * p.lerp(point.along, 1, drawn * drawn) * portalPull;
            point.x += (x - point.x) * pulled;
            point.y += (y - point.y) * pulled;
          }
          wormIn = points.every((point) => Math.hypot(point.x - x, point.y - y) < radius);
        }
      }
    }

    // The camera pulls back as it moves up and forward, so the worm doesn't grow as it forms: everything's smaller,
    // round the spiral, until the view comes round to the psychworm's
    const zoom = unravel === 'stretch' ? 1 : p.lerp(p.lerp(1, formingZoom, forming), 1, released); // (Stretching, no zoom: the camera moves instead)
    context.save();
    context.translate(centre.x, centre.y);
    context.scale(zoom, zoom);
    context.translate(-centre.x, -centre.y);

    // The spiral, then the worm, drawn a little at a time, each bit as thick as it is near
    context.strokeStyle = `rgb(${ink},${ink},${ink})`;
    context.lineJoin = 'round';
    context.lineWidth = thickest / zoom;
    if (stretching && unwound < 1) {
      // Stretching: each point of the spiral, from its middle out, goes to its place along the worm, from its head back
      // to its tail, the middle first and the outer edge last, so the middle's pulled away into the distance and the
      // flat spiral draws out into the worm's tube
      const count = spiral.length;
      const shrinking = Math.min(1, unwound / tailShrink);
      const flatLeft = 1 - shrinking * shrinking * (3 - 2 * shrinking); // How big what's still flat is, from 1 down to a point
      const at = (n) => {
        const out = n / Math.max(1, count - 1); // 0 in the middle, 1 at the outer edge
        const pull = Math.min(1, Math.max(0, (unwound - out * stretchLag) / (1 - stretchLag)));
        const pulled = pull * pull * (3 - 2 * pull);
        const along = 1 - out;
        const worm = points[Math.min(total, Math.round(along * total))];
        // What's still flat is drawn in toward the spiral's middle as soon as it starts stretching, so the end that's
        // becoming its tail narrows to a point quickly (see tailShrink)
        const flat = { x: centre.x + (spiral[n].x - centre.x) * flatLeft, y: centre.y + (spiral[n].y - centre.y) * flatLeft };
        return { x: p.lerp(flat.x, worm.x, pulled), y: p.lerp(flat.y, worm.y, pulled), width: p.lerp(thickest, p.lerp(thickest, thinnest, along), pulled) };
      };
      const step = Math.max(2, Math.round(count / 240));
      for (let start = 0; start < count - 1; start += step) {
        const end = Math.min(count - 1, start + step);
        const first = at(start);
        context.beginPath();
        context.moveTo(first.x, first.y);
        for (let n = start + 1; n <= end; n++) {
          const point = at(n);
          context.lineTo(point.x, point.y);
        }
        context.lineWidth = at(Math.round((start + end) / 2)).width / zoom;
        context.stroke();
      }
      context.restore();
    } else {
    // (Stretching, the spiral's all become the worm by now, so there's none left to draw)
    if (!stretching) {
      context.beginPath();
      spiral.forEach(({ x, y }, i) => (i ? context.lineTo(x, y) : context.moveTo(x, y)));
      context.stroke();
    }
    const chunk = Math.max(2, Math.round(perTurn / 8));
    for (let end = total; end > 0; end -= chunk) {
      const start = Math.max(0, end - chunk);
      const { along } = points[Math.round((start + end) / 2)];
      context.beginPath();
      context.moveTo(points[start].x, points[start].y);
      for (let i = start + 1; i <= end; i++) context.lineTo(points[i].x, points[i].y);
      context.lineWidth = p.lerp(thickest, thinnest, along) / zoom; // Thicker nearer the camera, at the tail, whatever the zoom
      context.stroke();
    }
    context.restore();
    }

    // The end: once the worm's gone into the chosen portal and it's filled, it's on to its page (or once it's covered
    // the screen, whatever happens)
    const filled = chosen && fillsAt !== null && seconds - fillsAt >= chosen.portal.fillTime;
    if (chosen && ((wormIn && filled) || (exiting >= 1 && (fillsAt === null || filled))) && !leaving) {
      leaving = true;
      if (chosen.portal.note) {
        try {
          sessionStorage.setItem(chosen.portal.note, '1');
        } catch {}
      }
      window.location.href = chosen.portal.page;
    }
  };
}
