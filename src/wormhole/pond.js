// The pond: the front page opens on it, and it's the way into the wormhole. Grey rain falls on dark water, each drop
// starting a wormhole of rings, with "welcome to my wormhole" and then "click anywhere to enter" over it, and a sound
// switch at the bottom that turns the rain's sound on (see the welcome). Entering drops a drop in colour where it's pressed: the camera comes round to look straight down into
// its wormhole, which spins up and grows a worm out of its middle, and the worm springs forward. Once it's settled, the
// wormhole (wormhole.js) takes over the screen, with the worm just where it is, and carries it on into its psychworm
// stage, out in space, and on through the rest (see fromPond there).
//
// It was tuned as src/sketchbook/wake-play.js (save/46-single-spring), in plain p5, and turned into this. This is the
// one on the front page now.
//
// A link to one of the wormhole's stages (/#psychworm, /#flowers, /#noisy-spiral) skips the pond and goes straight there.
//
// The sound sandbox (tools/sound-sandbox) runs it too, as its scene, with `{ sandbox: { onDrop } }`: just the rain,
// with no welcome, no sound switch and no entering. Pressing drops a drop there, and as each drop lands, instead of
// playing a drip, it calls onDrop({ loud, pan, near, inColour, pressed }) with how loud (0 to 1) and how far to the
// side (-1 to 1) the drip would have been, how near it landed (0 = as far off as the rain lands, 1 = as near), and
// whether it was dropped by pressing, for the sandbox to play its sounds.

import p5 from 'p5';
import wormhole from './wormhole.js';
import { soundButton, startAudio, soundWanted, setSound, soundChosen, onSoundChange, audioOut } from '../scripts/sound.js';
import { diveScore } from './dive_score.js';

export default function pond(p, container, { sandbox = null } = {}) {
  // Raindrops fall, one into the middle of the screen at the start and then more, anywhere, now and then, and wherever
  // one lands a new wormhole grows: rings spreading out from there, over the ones before.
  let worms = []; // The wormholes, oldest first (each has its own xLoc and yLoc, and colours)
  let drops = []; // The raindrops still falling

  let numSegments = 188;
  // let wormWidth = 150;
  let gap = 40; // How far apart the rings are, in pixels (the biggest is numSegments * gap across)
  let centreFade = 4; // How many seconds into a wormhole's life the rings it makes have faded away completely, so that
  // its middle goes calm as its rings spread out (0 = no fading)
  let centreFadeCurve = 10; // How they fade over that time (1 = evenly, more = fading sooner)
  let colourGrowSpeed = 0.6; // How quickly the colour wormhole's rings spread, compared to the others'
  let colourSize = 1.1; // How wide the colour wormhole gets, as a share of what it takes to reach the screen's furthest
  // corner from its middle (its rings stop there), so that more than 1 covers the whole screen, corners and all
  let colourBurst = Infinity; // How many seconds its rings come out of its middle for, before it goes dark there
  // (Infinity = they keep coming)
  let colourStart = 0; // How big its rings are when they first appear, in pixels across (0 = a point, like the others)
  let colourOpen = 2; // How many seconds that takes to open up to, from rings starting at a point (0 = straight away)
  let colourFadeIn = 0; // How many seconds each new ring takes to fade in, from nothing, as it comes out of the middle
  // (0 = it's there straight away)
  let colourFlicker = 0.7; // How much they flicker while they fade in, steadying as they get there (0 = not at all, 1 =
  // right down to nothing now and then)
  let colourBunch = 3; // How much its rings slow and bunch up as they near its edge (bigger = sooner, and closer
  // together; 0 = they don't, and keep spreading evenly out past it, off the screen)
  let colourReach = 2.5; // How long they take to get most of the way to its edge, compared to spreading there at their speed
  let colourPop = 0.96; // How near its edge its rings get, bunched up there, before they pop out of existence, as a
  // share of its size (colourSize), so that round the screen's edges the white rings can still be seen
  // How big the colour wormhole gets, across: big enough to reach from its middle to the screen's furthest corner
  function colourEdge(at) {
    let far = Math.hypot(Math.max(at.x, p.width - at.x), Math.max(at.y, p.height - at.y));
    return colourSize * 2 * far;
  }
  function colourPopSize(at) {
    return colourPop * colourEdge(at);
  }
  let colourGradient = 0.9; // How far out its colours go, from cyan in its middle round through red and back to blue, as
  // a share of the way to the screen's furthest corner (less = the blues come sooner)
  let colourSpin = 0.3; // How quickly its rings spin, in turns of their wobbly shapes, in radians a second (0 = not at
  // all; less than 0 = the other way)
  let colourSpinMix = 0.6; // How much their speeds differ from ring to ring (0 = all the same; 1 = from still to twice
  // as fast)
  // Then it turns into a worm: its rings spin faster and faster, its middle closes up, and its rings shrink and slide
  // into a worm, seen from just above and behind, as in the wormhole's psychworm stage (its numbers are psychworm's)
  // (These are all in seconds from when the camera's right above it: see ready)
  let spinUpAt = -1; // When its rings start spinning faster (less than 0 = before the camera's there)
  let spinUp = 3; // How quickly they speed up (their speed goes up with the square of the time since)
  let closeAt = 0; // When the void in its middle, if it has one (see colourStart), starts closing up...
  let closeTime = 0.7; // ...and how many seconds that takes
  let wormAt = 0; // When the rings it makes start coming out as the worm...
  let wormTime = 1.2; // ...and over how many seconds they go from tunnel to worm
  let wormRush = 1.8; // How many times faster its rings come out while the worm's growing, so that it grows quickly...
  let rushUp = 0.5; // ...speeding up over this many seconds, from wormAt...
  let rushDown = 3; // ...and back down over this many, once the tunnel's gone
  let springAt = 1.6; // How many seconds after the worm starts it springs forward, its rings coming out faster still...
  let springRush = 4; // ...this many times faster...
  let springUp = 0.4; // ...easing into it over this many seconds...
  let springFor = 0; // ...staying that fast for this many...
  let springDown = 4; // ...and easing out of it over this many (quickly at first, then more and more gently)
  let stretch = 0.55; // How much longer it stretches as it springs forward, as a share of its length, before springing
  // back past it a little, and settling (0 = it doesn't)
  let stretchTime = 2.5; // How many seconds each stretch and spring back takes...
  let stretchSettle = 3; // ...and how many seconds it takes to settle, its stretching ramping down to nothing

  // How much longer the worm is just now, as it stretches and springs back, this many seconds after landing (1 = as it
  // usually is)
  function wormStretch(life) {
    let t = life - ready() - wormAt - springAt;
    if (t <= 0 || !stretch) return 1;
    let settling = p.constrain(t / stretchSettle, 0, 1);
    let left = 1 - settling * settling * (3 - 2 * settling); // How much of its stretch is left, ramping down, eased
    return 1 + stretch * left * Math.sin((2 * Math.PI * t) / stretchTime);
  }
  let wormLength = 70; // How many of its rings make the worm (the newest are its head; the rest go)
  let wormWeaveWide = 1.3; // How far its path weaves from side to side, as a share of the screen's width...
  let wormWeaveTall = 0.6; // ...and up and down, as a share of its height
  let wormBend = 0.8; // How much of the weave its body takes up, head to tail (in Perlin noise, as psychworm's 4 seconds)
  let wormHeadDistance = 4; // How far its head is from the camera...
  let wormTailDistance = 0.9; // ...and its tail (1 = at its full size, less = nearer)
  let wormHorizon = 0.25; // How far down the screen the point straight ahead of the camera is
  let wormCameraAbove = 0.5; // How far the camera is above it, as a share of the screen's height
  let tunnelGoneAt = 3.3; // When the rings made before the worm start fading away...
  let tunnelGoneTime = 3; // ...and how many seconds that takes
  let wormBody = 2; // How big it's drawn (its widest is this many eighths of the screen's width, at full size)

  // How far it's got turning into the worm, 0 to 1, this many seconds after landing (eased in and out)
  // How many seconds after landing the camera's right above it, where it eases round to as the drop falls (see the
  // dive), which is when it starts turning into the worm
  function ready() {
    return aboveTime - dropTime;
  }
  function wormMorph(life) {
    let t = p.constrain((life - ready() - wormAt) / wormTime, 0, 1);
    return t * t * (3 - 2 * t);
  }
  // How far its rings have turned, this many seconds after landing, for rings at their usual speed
  function spinAngle(life) {
    let past = Math.max(0, life - ready() - spinUpAt);
    return colourSpin * (life + (spinUp * past * past * past) / 3);
  }
  // Where a ring of the worm is, and how big, seen from behind: along is 0 at its head and 1 at its tail; born is which
  // ring it is, so it stays at its own place on the path; tail is the tail's (fractional), which the camera follows
  function wormRing(worm, along, born, tail) {
    let weave = (b) => ({
      x: (p.noise(worm.offset + b * (wormBend / wormLength)) - 0.5) * 2 * wormWeaveWide * p.width,
      y: (p.noise(worm.offset + b * (wormBend / wormLength), 100) - 0.5) * 2 * wormWeaveTall * p.height,
    });
    let place = weave(born);
    let camera = weave(tail);
    // Stretched, its tail comes nearer the camera, and squashed, it goes further off (see wormStretch)
    let stretched = along * wormStretch(p.millis() / 1000 - worm.born);
    let closer = 1 / Math.max(0.2, p.lerp(wormHeadDistance, wormTailDistance, stretched));
    // On the screen, and then where that is before the camera's turned to look down on it (it's centred on its home)
    let x = p.width / 2 + (place.x - camera.x) * closer;
    let y = wormHorizon * p.height + (wormCameraAbove * p.height - (place.y - camera.y)) * closer;
    return {
      x: worm.home.x + x - p.width / 2,
      y: worm.home.y + y - p.height / 2,
      d: Math.sin(along * Math.PI) * (p.width / 8) * wormBody * closer,
    };
  }
  let colourClear = 40; // How far outside it the rain keeps from landing, in pixels
  let growSpeed = 0.3; // How quickly the rings spread out (1 = a ring's width every frame, as it was; less = slower,
  // still smoothly, and just as far apart)
  let blendWidth = 1; // How wide a ring has to be to be all the outer colour, as a share of the screen's width (the
  // colours blend from the inner one in the middle out to that)

  let counter = 0;

  let wander = 50; // How far each worm's head wanders from where its drop landed, in pixels

  // Colour options: press C to go through them, R to roll the random ones again
  let palettes = [
    { name: 'ember and sea', outer: () => p.color(255, p.random(50), 0), inner: () => p.color(0, p.random(200), p.random(200, 255)) },
    { name: 'wake', outer: () => p.color(255, 40, 90), inner: () => p.color(0, 230, 255) },
    { name: 'moonlight', outer: () => p.color(20, 40, 120), inner: () => p.color(255) },
    { name: 'gold leaf', outer: () => p.color(110, 35, 0), inner: () => p.color(255, 215, 100) },
    { name: 'acid', outer: () => p.color(255, 0, 200), inner: () => p.color(140, 255, 0) },
    { name: 'violet dusk', outer: () => p.color(40, 0, 90), inner: () => p.color(255, 140, 60) },
    { name: 'grey', outer: () => p.color(50), inner: () => p.color(255) },
    { name: 'deep sea', outer: () => p.color(0, 20, 60), inner: () => p.color(0, 255, 190) },
    { name: 'rose', outer: () => p.color(90, 0, 40), inner: () => p.color(255, 190, 210) },
    { name: 'forest', outer: () => p.color(10, 50, 20), inner: () => p.color(210, 255, 120) },
    { name: 'fire', outer: () => p.color(120, 0, 0), inner: () => p.color(255, 240, 80) },
    { name: 'ice', outer: () => p.color(200, 240, 255), inner: () => p.color(0, 90, 255) },
    { name: 'neon', outer: () => p.color(0, 80, 255), inner: () => p.color(255, 0, 90) },
    { name: 'copper', outer: () => p.color(0, 110, 100), inner: () => p.color(230, 120, 50) },
    { name: 'lavender', outer: () => p.color(70, 50, 140), inner: () => p.color(220, 200, 255) },
    { name: 'sunset', outer: () => p.color(60, 0, 120), inner: () => p.color(255, 180, 0) },
    { name: 'cream on black', outer: () => p.color(20), inner: () => p.color(246, 236, 210) },
    { name: 'random warm', outer: () => p.color(p.random(150, 255), p.random(60), p.random(40)), inner: () => p.color(255, p.random(150, 255), p.random(100)) },
    { name: 'random cool', outer: () => p.color(p.random(40), p.random(60, 160), p.random(150, 255)), inner: () => p.color(p.random(150, 255), p.random(200, 255), 255) },
    { name: 'random', outer: () => p.color(p.random(255), p.random(255), p.random(255)), inner: () => p.color(p.random(255), p.random(255), p.random(255)) },
  ];
  let palette = 0; // Which one it starts with
  let mix = 0.5; // How often a new wormhole picks a palette of its own, at random, instead of the one chosen (0 = never,
  // 1 = always). Press M to go through none, half and all.
  let flipChance = 0.25; // ...and how often it has the palette the other way round, inside out (0 = never, 1 = always)

  let colourRandomness = 40; // How far each worm's colours can be nudged from the palette's (0 = exactly), so no two are quite alike
  let shimmer = 0.01; // How much each ring's colour flickers from frame to frame, along the blend (0 = steady)

  // A worm's colours: the biggest rings' (outer) and the smallest's (inner)
  function pickColours(worm) {
    // Some of the time its own palette, at random, otherwise the one chosen, and now and then the other way round
    let chosen = p.random() < mix ? p.random(palettes) : palettes[palette];
    let flip = mix > 0 && p.random() < flipChance;
    let outer = nudge(chosen.outer());
    let inner = nudge(chosen.inner());
    worm.outer = flip ? inner : outer;
    worm.inner = flip ? outer : inner;
    // In black and white, now and then a tinted wormhole (see tints)
    worm.tint = p.random() < tintChance ? p.random(tints) : null;
    // ...and its greys in black and white: dark in the middle, lighter out to the edge
    worm.middleGrey = p.random(...middleGreys);
    worm.edgeGrey = p.random(...edgeGreys);
  }

  // A colour moved a little, at random, in red, green and blue
  function nudge(c) {
    let n = () => p.random(-colourRandomness, colourRandomness);
    return p.color(p.constrain(p.red(c) + n(), 0, 255), p.constrain(p.green(c) + n(), 0, 255), p.constrain(p.blue(c) + n(), 0, 255));
  }

  // The raindrops: little circles, falling from the top of the screen, faster and faster. Where each lands, a new
  // wormhole starts. Press D to drop one now.
  let dropTime = 1.2; // How many seconds one takes to fall
  let dropSize = 7; // How wide it is, in pixels
  let dropLine = 1.2; // How thick its outline is, in pixels
  let dropLength = 1.6; // How long the teardrop is, compared to how wide
  let dropStretch = 0.5; // How much longer it gets as it speeds up, from 0 to 1
  let dropEvery = [0.8, 1.2]; // How many seconds between drops, at the least and most
  let dropMargin = 0.15; // How far in from the edges of the screen they land, as a share of it
  let dropTop = 1 / 3; // The highest they land, as a share of the way down the screen...
  let dropBottom = 2 / 3; // ...and the lowest (a third to two thirds = the middle third)
  let mostWorms = 10; // The most wormholes there are at once (the oldest goes, if there'd be more)
  let leaveTime = 1.5; // How many seconds the oldest takes to fade away when it goes
  let nextDrop = 0; // When the next one falls, in seconds

  function draw() {
    if (handedOver) return;
    let seconds = p.millis() / 1000;
    p.background(0);

    let diving = startDive(seconds); // How far into the dive it is, from 0 to 1, or null if it isn't diving
    if (seconds > nextDrop && (!dive || !diveFalls)) dropRain();

    // The wormholes, oldest first, so that each new one opens over the ones before
    worms = worms.filter((w) => w.leaving === undefined || seconds - w.leaving < leaveTime); // Gone, once faded away
    for (let worm of worms) moveWorm(worm);
    diveCamera(diving, true);
    drawWorms();
    // Once one's grown all the way out, its biggest rings cover the screen, so the ones under it can go (but not the
    // colour one, which stays, on top)
    for (let n = worms.length - 1; n > 0; n--) {
      if (!worms[n].landing && worms[n].xLoc[0] !== undefined) {
        worms = worms.filter((w, k) => k >= n || w.landing);
        break;
      }
    }

    drawSplashes(seconds);

    // The drops, falling, and starting a wormhole where they land
    for (let drop of [...drops]) {
      let t = (seconds - drop.start) / dropTime;
      if (t >= 1) {
        drops.splice(drops.indexOf(drop), 1);
        splash(drop, seconds);
        playDrip(drop);
        // With the drop's colours, which were picked when it fell, so its middle is the drop's colour
        let worm = { home: drop.at, offset: p.random(1000), xLoc: [], yLoc: [], inner: drop.inner, outer: drop.outer, tint: drop.tint, middleGrey: drop.middleGrey, edgeGrey: drop.edgeGrey, inColour: drop.inColour, landing: drop.landing, born: seconds };
        if (worm.landing) worms.push(worm);
        else {
          // Under the colour one, if there is one, so that it stays on top
          let colourOne = worms.findIndex((w) => w.landing);
          worms.splice(colourOne < 0 ? worms.length : colourOne, 0, worm);
        }
        // A colour drop: a moment later the camera dives into it (see the dive)
        if (worm.landing && dive && diveFalls && dive.fallStart === undefined) dive.fallStart = seconds + diveAfter;
        // If there are too many, the oldest that isn't already going fades away (see leaveTime)
        let staying = worms.filter((w) => w.leaving === undefined && !w.landing);
        if (staying.length > mostWorms) staying[0].leaving = seconds;
        continue;
      }
      drawDrop(drop, t);
    }
    diveCamera(diving, false);
    if (diving !== null) diveEnd(diving);

    counter += 0.01;
    if (!handedOver) prepareHandOver(seconds);

  }

  // A raindrop, to land at (x, y), or anywhere if that's not given
  // inColour: whether it's in colour even when the rest is black and white (as the ones dropped by clicking are)
  function dropRain(x, y, inColour = false) {
    let at = {
      x: x ?? p.random(dropMargin, 1 - dropMargin) * p.width,
      y: y ?? p.random(dropTop, dropBottom) * p.height,
    };
    // Not inside the colour wormhole: the rain falls around it
    let colourOne = worms.find((w) => w.landing) ?? (dive ? { home: dive.at } : null);
    let clear = (spot) => Math.hypot(spot.x - colourOne.home.x, spot.y - colourOne.home.y) > colourPopSize(colourOne.home) * 0.5 + colourClear;
    for (let tries = 0; x === undefined && colourOne && !clear(at) && tries < 60; tries++) {
      // Anywhere that can be seen, now that the camera's looking down on the colour one
      let middle = dive ? dive.at : { x: p.width / 2, y: p.height / 2 };
      at = { x: middle.x + p.random(-0.5, 0.5) * p.width, y: middle.y + p.random(-0.5, 0.5) * p.height };
    }
    if (x === undefined && colourOne && !clear(at)) {
      nextDrop = p.millis() / 1000 + p.random(...dropEvery); // Nowhere clear to land this time: no drop
      return;
    }
    let drop = { at, start: p.millis() / 1000, inColour };
    pickColours(drop); // Its wormhole's colours: the drop's the inner one, the colour of the wormhole's middle
    if (inColour) {
      // In the landing page's colours (see landingColour), so its middle, and the drop, are the wake's cyan
      drop.landing = true;
      drop.inner = p.color(0, (landingLow + 255) / 2, 255);
      drop.outer = drop.inner;
    }
    drops.push(drop);
    if (!inColour) nextDrop = p.millis() / 1000 + p.random(...dropEvery); // Clicking doesn't hold up the rain
  }

  // The landing page's colours, as the wake on the front page has them over a ring's life: cyan when it's new, through
  // red and magenta in the middle of its life, and back to cyan, shimmering. Here from the middle of a wormhole (s = 0)
  // to its edge (s = 1).
  let landingLow = 150; // The least each colour shimmers down to (the wake's `low`)
  function landingColour(s) {
    let along = 1 - s; // The middle's newest, as the wake's newest rings are
    let sine = Math.abs(Math.sin(along * Math.PI));
    let cosine = Math.abs(Math.cos(along * Math.PI));
    return p.color(p.random(landingLow, 255) * sine, p.random(landingLow, 255) * cosine, 255 - p.random(100, 255) * sine);
  }

  // The dive: as a colour drop's dropped, the rain stops, and the camera eases round until it's right above where it'll
  // land, looking straight down at it, in the middle of the screen. A moment after it's landed, the grey wormholes fade
  // and the camera falls into the colour wormhole, faster and faster, so that its rings, round from right above, rush
  // out past like a tunnel. At the bottom it all goes black, and it goes on into the wormhole, out in space, at its
  // psychworm stage.
  let diveFalls = false; // Whether it goes on to fall in and into the wormhole (off for now: the camera just comes over the top)
  let aboveTime = 3.5; // How many seconds from dropping it the camera takes to get right above it
  let diveAfter = 0.3; // How many seconds after the colour drop lands the camera starts to fall
  let diveTime = 3; // How many seconds the fall takes
  let diveHorizon = -40; // Where the horizon ends up, looking straight down (see horizon: further below 0 is looking down more,
  // and this far there's no perspective left)
  let diveZoom = 40; // How many times nearer the water it ends up
  let diveDark = 0.25; // How much of the end of it goes to black (as a share of it)
  let diveTo = '/#psychworm'; // Where it goes on to: the wormhole, at its psychworm stage
  let dive = null; // Once a colour drop's dropped: { start, at (where it'll land), from and fromFlat (the camera before), fallStart }
  let lineScale = 1; // How much the lines are drawn thinner, so they stay as they were while the camera's zoomed in
  let glowScale = 1; // How much of the front glow there is (none once the camera's right above)...
  let heldGlow = 0; // ...and how much glow there is everywhere instead, so it stays as bright as it was

  // How much the front glow brightens a line this far down the screen, as the camera is now (see fadeFor)
  function glowAt(y) {
    let top = horizon * p.height;
    let below = p.height - top;
    let gone = top + below * fadeGone;
    let full = Math.min(1, (below * (fadeFull - fadeGone)) / (p.height - gone));
    let t = p.constrain((y - gone) / (p.height - gone), 0, 1);
    return t < full ? 0 : frontGlow * ((t - full) / (1 - full || 1));
  }

  // How far into the fall it is (0 to 1), or null if there's no dive. Starting to fall, it sends the others away.
  function startDive(seconds) {
    if (!dive) return null;
    if (dive.fallStart === undefined || seconds < dive.fallStart) return 0;
    if (!dive.falling) {
      dive.falling = true;
      for (let w of worms) if (!w.landing && w.leaving === undefined) w.leaving = seconds;
      drops = drops.filter((d) => d.inColour);
    }
    return p.constrain((seconds - dive.fallStart) / diveTime, 0, 1);
  }

  // The camera, during the dive: easing round to right above where the drop's landing, then falling in toward it.
  // Called before drawing (begin) and after (to put the canvas back).
  function diveCamera(t, begin) {
    let g = p.drawingContext;
    if (t === null) return;
    if (!begin) {
      g.restore();
      lineScale = 1;
      return;
    }
    let above = p.constrain((p.millis() / 1000 - dive.start) / aboveTime, 0, 1);
    above = above * above * (3 - 2 * above);
    horizon = p.lerp(dive.from, diveHorizon, above);
    // ...and from right above, a ring on the water is round, not flattened
    flatness = p.lerp(dive.fromFlat, 1, above);
    // ...and nothing's nearer than anything else, so nothing glows for being near
    glowScale = 1 - above;
    heldGlow = dive.glow * above; // ...but everything as bright as where the drop landed was
    let zoom = Math.exp(Math.log(diveZoom) * t * t); // Faster and faster
    g.save();
    g.translate(p.lerp(dive.at.x, p.width / 2, above), p.lerp(dive.at.y, p.height / 2, above));
    g.scale(zoom, zoom);
    g.translate(-dive.at.x, -dive.at.y);
    lineScale = 1 / zoom;
  }

  // The end of the dive: going to black, and on into the wormhole
  function diveEnd(t) {
    let dark = p.constrain((t - (1 - diveDark)) / diveDark, 0, 1);
    if (dark > 0) {
      let g = p.drawingContext;
      g.fillStyle = `rgba(0,0,0,${dark})`;
      g.fillRect(0, 0, p.width, p.height);
    }
    if (t >= 1 && !dive.gone) {
      dive.gone = true;
      handOver();
    }
  }

  // Each worm's trail moves on one place: its head goes where it's wandered to, and every ring moves one place down
  // (It moves on a place only every so often, at its speed, and in between the rings grow smoothly: see ringSize.)
  // How quickly a wormhole's rings spread: the colour one's more slowly than the rest, so it has time to be looked at
  function speedOf(worm) {
    if (!worm.landing) return growSpeed;
    // The colour one's rush, while its worm grows (see wormRush)
    let life = p.millis() / 1000 - worm.born;
    let up = p.constrain((life - ready() - wormAt) / rushUp, 0, 1);
    let down = p.constrain((life - ready() - tunnelGoneAt - tunnelGoneTime) / rushDown, 0, 1);
    let rush = up * (1 - down);
    // ...and on top of that its spring, once the worm's head is out: a surge that eases in, holds while the worm shoots
    // out to its full length, and eases off again
    let ease = (t) => t * t * (3 - 2 * t);
    let springing = life - ready() - wormAt - springAt;
    let calming = p.constrain((springing - springUp - springFor) / springDown, 0, 1);
    let spring = ease(p.constrain(springing / springUp, 0, 1)) * (1 - calming) * (1 - calming); // Easing out
    return growSpeed * colourGrowSpeed * p.lerp(1, wormRush, ease(rush)) * p.lerp(1, springRush, spring);
  }
  function moveWorm(worm){
    let { xLoc, yLoc } = worm;
     let head = headAt(worm)
     xLoc[numSegments-1] = head.x
     yLoc[numSegments-1] = head.y
    worm.phase = (worm.phase ?? 0) + speedOf(worm);
    while (worm.phase >= 1) {
      worm.phase -= 1;
      worm.made = (worm.made ?? 0) + 1; // How many rings it has made
      for(let i = 0; i < numSegments-1; i++){
        xLoc[i] = xLoc[i+1];
        yLoc[i] = yLoc[i+1];
      }
      // ...and when each ring came out, in seconds into its life, since the colour one's don't all come at one speed
      worm.madeAt ??= [];
      for (let i = 0; i < numSegments - 2; i++) worm.madeAt[i] = worm.madeAt[i + 1];
      worm.madeAt[numSegments - 2] = p.millis() / 1000 - worm.born;
    }
  }

  // How big ring i of a worm is (i = 0 is the oldest and biggest)
  // phase: how far the worm is toward moving on its next place (0 to 1), so the rings grow smoothly in between
  function ringSize(i, phase = 0) {
      // let s = cos(map(i,0,numSegments-1, 0,HALF_PI))
      // let d = wormWidth*s

      // Evenly spaced, gap apart
      let d = (numSegments - 1 - i + phase) * gap
      // For the colour: from 0 (the inner colour) at the middle to 1 (the outer colour) at blendWidth across, and the
      // outer colour from there out. Over all the rings, most of the blend was on ones too big to be seen.
      let s = Math.min(1, d / (blendWidth * p.width))
      return { d, s };
  }

  // All the wormholes' rings, drawn from the oldest worm's biggest ring to the newest's smallest, each filled black, so
  // that each hides what's behind it. Only what can be seen is drawn: going the other way, from the newest's smallest
  // ring outward, it stops at the first ring that covers the whole screen, since everything before that is hidden behind
  // it (and it's black itself, like the background), and it leaves out any ring that's off the screen altogether.
  function drawWorms() {
    let seen = [];
    let seconds = p.millis() / 1000;
    findSeen: for (let w = worms.length - 1; w >= 0; w--) {
      let worm = worms[w];
      let leaving = worm.leaving !== undefined ? p.constrain(1 - (seconds - worm.leaving) / leaveTime, 0, 1) : 1;
      let calmDrawn = false; // Has its calm middle been filled in?
      for (let i = numSegments - 2; i >= 0; i--) {
        if (worm.xLoc[i] === undefined) continue; // The worm's still growing
        // Fainter the later in its life it was made, so the middle goes calm as the rings spread, and fading away
        // altogether if the worm's going
        let madeAt = worm.landing
          ? worm.madeAt?.[i] ?? 0
          : ((worm.made ?? 0) - (numSegments - 1 - i)) / (speedOf(worm) * 60); // Seconds into the worm's life
        let strength = centreFade > 0 && !worm.landing ? Math.pow(p.constrain(1 - madeAt / centreFade, 0, 1), centreFadeCurve) : 1;
        strength *= leaving;
        // The faded rings in the calm middle can't be seen, so only the biggest of them is drawn, as just a black fill,
        // which hides what's behind the middle (going out from the smallest, it's the last before they show)
        let calm = strength <= 0.003;
        if (calm && i > 0 && worm.xLoc[i - 1] !== undefined && !calmDrawn) {
          let madeNext = ((worm.made ?? 0) - (numSegments - i)) / (speedOf(worm) * 60);
          if (centreFade > 0 && madeNext >= centreFade && leaving > 0) continue; // A bigger one's still calm too
        }
        if (calm && calmDrawn) continue;
        let { d, s } = ringSize(i, worm.phase);
        let x = worm.xLoc[i], y = worm.yLoc[i];
        let morph = 0;
        if (worm.landing) {
          // The colour one: a burst of rings from its middle, for its first few seconds, all bright, spreading out and
          // slowing as they go, closer and closer to its edge without ever getting there, so that they all bunch up
          // round its rim, and its middle's left dark once the last of them has gone out
          // (With colourBunch 0 they don't slow: they keep spreading, evenly spaced, on past its edge.)
          let edge = colourEdge(worm.home);
          d = Math.max(0, d - gap); // Its newest ring starts as a point, not a ring's width across
          // Each ring starts as big as the void in the middle was when it was made, so the void opens up over time
          let opened = colourOpen > 0 ? p.constrain(madeAt / colourOpen, 0, 1) : 1;
          let life = seconds - worm.born;
          let closing = p.constrain((life - ready() - closeAt) / closeTime, 0, 1);
          closing = closing * closing * (3 - 2 * closing);
          d += colourStart * opened * opened * (3 - 2 * opened) * (1 - closing); // Easing in and out, then closing up
          if (colourBunch > 0) d = edge * (1 - Math.exp((-colourBunch * d) / (edge * colourReach)));
          if (d >= colourPopSize(worm.home)) continue; // Popped, once bunched up at its rim, so white rings show round it
          // Cyan in the middle, through red and magenta, and back to blue by the time they've reached the screen's
          // furthest corner (and blue from there out), so the whole of it can be seen
          s = Math.min(1, d / (colourGradient * (colourEdge(worm.home) / colourSize)));
          strength = p.constrain((colourBurst - madeAt) / 0.4, 0, 1) * leaving; // The rings it made after the burst are dark
          // Turning into the worm: the rings it makes from wormAt on come out as the worm, which grows out of the
          // tunnel's middle, its head the newest ring, far off, and its tail coming back toward the camera as they
          // age. The rings made before stay as they are, centred and full size, spreading out past the screen's edges,
          // and fade away once the worm's all there. (Those made over wormTime are partly each.)
          morph = wormMorph(madeAt);
          let age = numSegments - 1 - i + (worm.phase ?? 0); // How many rings out it is, smoothly
          if (morph < 1) {
            let gone = p.constrain((life - ready() - tunnelGoneAt) / tunnelGoneTime, 0, 1);
            if (gone >= 1) continue;
            strength *= 1 - gone * (1 - morph);
            // Those partly the worm fade away as they near its tail, and go past it, so they don't gather at its tip, or
            // get pulled off after it
            if (morph > 0) {
              if (age >= wormLength) continue;
              strength *= p.constrain((wormLength - age) / (0.15 * wormLength), 0, 1);
            }
          }
          // Each new ring of the tunnel fades in as it comes out of the middle, flickering (the worm's don't)
          let ringAge = life - madeAt; // Seconds since it came out
          let fadedIn = colourFadeIn > 0 ? p.constrain(ringAge / colourFadeIn, 0, 1) : 1;
          let flicker = 1 - colourFlicker * (1 - fadedIn) * p.random();
          strength *= p.lerp(fadedIn * fadedIn * flicker, 1, morph);
          if (morph > 0) {
            let along = age / wormLength; // 0 at its head, 1 at its tail
            if (along >= 1 && morph >= 1) continue; // Past its tail
            let born = (worm.made ?? 0) - (numSegments - 1 - i);
            let tail = (worm.made ?? 0) + (worm.phase ?? 0) - wormLength;
            let target = wormRing(worm, Math.min(along, 1), born, tail);
            x = p.lerp(x, target.x, morph);
            y = p.lerp(y, target.y, morph);
            d = p.lerp(d, target.d, morph);
            s = p.lerp(s, Math.min(along, 1), morph); // Its colours along it, from its head to its tail, as psychworm's
          }
        }
        let ringSeed = worm.offset + ((worm.made ?? 0) - (numSegments - 1 - i)) * 0.37; // The same all its life
        // The colour one's rings each spin a little, at their own speeds
        let spin = 0;
        if (worm.landing && colourSpin) {
          let own = Math.sin(ringSeed * 12.9898) * 43758.5453;
          own -= Math.floor(own); // From 0 to 1, the same all the ring's life
          spin = spinAngle(seconds - worm.born) * p.lerp(1 - colourSpinMix, 1 + colourSpinMix, own);
        }
        if (d <= 0.5) continue; // The worm's thin head and tail
        let shape = ringShape(x, y, d, splashLift(worm, d, y), ringSeed, spin, worm.landing && morph >= 1 ? wormSmooth : 0);
        if (!shape) continue;
        // The colour one's rings that are partly tunnel and partly worm are just outlines, not filled: they're out of
        // step with the tunnel's, and filled they'd hide its bigger rings
        let filled = !(worm.landing && morph > 0 && morph < 1);
        if (shape.covers && filled) break findSeen;
        if (calm) calmDrawn = true;
        if (shape.offScreen) continue;
        // Only the rings that are all worm are drawn head first, in front: those partly the tunnel are still big, and go
        // behind it, with the tunnel
        seen.push({ shape, worm, i, s, strength, calm, filled, headFirst: morph >= 1, along: (numSegments - 1 - i + (worm.phase ?? 0)) / wormLength });
      }
    }
    // Drawn from the back: the oldest ring first, except the worm's, which is drawn head first, since from behind its
    // tail's nearest
    let headFirst = seen.filter((ring) => ring.headFirst);
    let order = seen.filter((ring) => !ring.headFirst).reverse().concat(headFirst);
    wormNow = [];
    let starsDrawn = false;
    for (let { shape, worm, i, s, strength, calm, filled, headFirst, along } of order) {
      // The stars go over the tunnel and behind the worm
      if (headFirst && !starsDrawn) {
        drawStars(worm);
        starsDrawn = true;
      }
      let c1 = worm.inner; // As it was: the blend goes from c2 for the biggest rings to c1 for the smallest
      let c2 = worm.outer;
     let c = calm ? null : worm.landing ? landingColour(s) : p.lerpColor(c1, c2, p.constrain(s + p.random(-shimmer, shimmer), 0, 1))
      let weight = p.map(i, 0, numSegments,3,0.2)
      if (headFirst) {
        weight = p.lerp(weight, handOverWeight, wormSmooth); // As thick as the wormhole's worm, by the hand-over
        if (along <= 1) wormNow.push({ along, ...placeOnScreen(shape) });
      }
      drawRing(shape, c, weight, worm, s, strength, filled);
    }
    ringsDrawn = seen.length;
  }
  let ringsDrawn = 0;
  let speed = '';


  // Where a worm's head is now, wandering round where its drop landed (noise is 0.5 on average, so this is there on
  // average). Each worm has its own offset, so they wander their own ways.
  function headAt(worm) {
    return {
      x: worm.home.x + (p.noise(counter + worm.offset) - 0.5) * 2 * wander,
      y: worm.home.y + (p.noise(counter + worm.offset + 50) - 0.5) * 2 * wander,
    }
  }

  // A raindrop, this far through falling (t, from 0 to 1): a circle, speeding up, as things fall
  function drawDrop(drop, t) {
    let fall = t * t;
    // From above the top of the screen (a colour drop from a whole screen above where it lands, since the camera moves
    // to look down on it as it falls)
    let y = p.lerp(drop.inColour ? drop.at.y - p.height : -dropSize, drop.at.y, fall);
    let g = p.drawingContext; // Straight onto the canvas, like the rings
    // Filled black, like the rings, so it hides what it passes over, with its outline in just the colour the middle of
    // its wormhole will be, where it lands: made brighter, faded toward the horizon and glowing toward the front, as the
    // rings' lines are there (see drawRing)
    // A teardrop: pointed at the top and round at the bottom, stretching a little as it speeds up. Its bottom is at y.
    let x = drop.at.x;
    let r = dropSize / 2;
    let h = dropSize * dropLength * (1 + dropStretch * t);
    y += r; // So its round bottom lands where the circle's middle did
    g.beginPath();
    g.moveTo(x, y - h);
    g.bezierCurveTo(x + r * 0.2, y - h * 0.6, x + r, y - r * 1.4, x + r, y - r);
    g.bezierCurveTo(x + r, y - r * 0.45, x + r * 0.55, y, x, y);
    g.bezierCurveTo(x - r * 0.55, y, x - r, y - r * 0.45, x - r, y - r);
    g.bezierCurveTo(x - r, y - r * 1.4, x - r * 0.2, y - h * 0.6, x, y - h);
    g.closePath();
    g.lineJoin = 'round';
    g.fillStyle = 'black';
    g.fill();
    g.strokeStyle = seenColour(drop.inner, drop.at.y, drop, 0); // As the middle, where s is 0
    g.lineWidth = dropLine * lineScale;
    g.stroke();
  }

  // The colour a ring's line of this colour is seen as, this far down the screen: the same as the gradient in drawRing
  function seenColour(colour, y, who, s) {
    let top = horizon * p.height;
    let below = p.height - top;
    let [r, gr, b] = shown(colour, who, s);
    let gone = top + below * fadeGone;
    let full = Math.min(1, (below * (fadeFull - fadeGone)) / (p.height - gone));
    let t = p.constrain((y - gone) / (p.height - gone), 0, 1); // How far along the gradient it is
    if (t < full) return `rgba(${Math.round(r)},${Math.round(gr)},${Math.round(b)},${Math.pow(t / full, fadeCurve)})`;
    let glow = frontGlow * glowScale * ((t - full) / (1 - full || 1)) + heldGlow;
    let mix = (v) => Math.round(v + (255 - v) * glow);
    return `rgb(${mix(r)},${mix(gr)},${mix(b)})`;
  }

  // The pond's perspective: the rings lie flat on the water, which goes off to a horizon at the top of the screen.
  // Further up is further away, so things there look smaller and flatter, and a big ring's near side is lower and
  // wider than its far side, which bunches up toward the horizon.
  let flatness = 0.375; // How much flatter than round a small ring is at the bottom of the screen (the pond's is 0.375)
  let horizon = -0.5; // Where the horizon is, as a share of the screen's height down from its top. 0 is the top edge, as
  // in the pond, which leaves the top of the screen empty, as the rings bunch up toward it without ever getting there.
  // Less than 0 is above the screen, as if looking down at the water more, so that the rings can reach the top edge.
  let ripplePoints = 72; // How many points the biggest rings are drawn with (more = smoother). Smaller ones get fewer.
  let pointSpacing = 8; // Roughly how far apart a ring's points are, in pixels across (smaller = smoother, but slower)
  let sharp = true; // Whether it's drawn at the screen's full resolution (sharper on a Retina screen, but much slower)
  // The lines fade as they go off toward the horizon. How near something is goes from 0 at the horizon to 1 at the
  // bottom of the screen (with the horizon at -0.5, the top of the screen is a third).
  let fadeGone = 0.05; // How near the lines are when they've faded away completely
  let fadeFull = 0.55; // ...and when they're at their full colour
  let fadeCurve = 1; // How it fades in between (1 = evenly, more = staying faint longer before coming up)
  let brightness = 1.4; // How much brighter every ring's colour is made, before it fades (1 = as the palette has it)
  let blackAndWhite = true; // Whether it's all in greys: each colour as the grey of how bright it is (press B to switch)
  let tintChance = 0; // In black and white, how many wormholes are tinted, from 0 to 1
  let tints = [[1, 0.35, 0.3]]; // The tints: red (how much of each of red, green and blue is kept). Blue was [0.45, 0.65, 1].
  let tintStrength = 0.8; // How strongly they're tinted in the middle, from 0 (grey) to 1
  let tintFade = 1; // How quickly the tint fades going out from the middle (1 = evenly, more = only right in the middle)
  let middleGreys = [30, 70]; // How light the middle of a wormhole is in black and white, at the least and most (0 to 255)
  let edgeGreys = [160, 230]; // ...and its edge (they're made brighter by brightness too)

  // A ring's colour as it's shown, before it fades: made brighter, and grey if it's in black and white. Gives [r, g, b].
  // who: the wormhole (or its drop), for its greys and tint. s: how far out the ring is, from 0 in the middle to 1 at
  // the edge (blendWidth across).
  function shown(colour, who, s) {
    let rgb = [p.red(colour), p.green(colour), p.blue(colour)];
    if (blackAndWhite && !who.inColour) {
      // Its own greys, dark in the middle and lighter going out, and if it's tinted, the tint strongest in the middle,
      // fading out to grey toward the edge
      let grey = p.lerp(who.middleGrey, who.edgeGrey, s);
      let strength = who.tint ? tintStrength * Math.pow(1 - s, tintFade) : 0;
      let tint = who.tint ?? [1, 1, 1];
      rgb = tint.map((t) => grey * (1 - strength + strength * t));
    }
    return rgb.map((v) => Math.min(255, v * brightness));
  }
  let frontGlow = 0.5; // How much brighter they get from there to the front, at the bottom of the screen, mixing toward
  // white (0 = no brighter, 1 = white at the very front)

  // A ring on the water, centred where (x, y) is on the screen, as wide across as diameter would be at that depth,
  // filled black, with a line of this colour and weight. It's drawn straight onto the canvas (drawingContext) rather
  // than with beginShape() and vertex(), which are far too slow for this many points every frame.
  //
  // It's worked out in two steps: where the ring's outline goes on the screen (ringShape), then drawing it (drawRing).
  // The splash: as a drop lands, the water in the middle rises a little and falls back, the smallest rings lifting the
  // most and the bigger ones less and less, as a little dome. How far up a ring of this size is lifted, in pixels.
  // Little splashes: as a drop lands, a crown of droplets is thrown out, each arcing up and falling back onto the water
  // a little way off, where it makes a tiny ripple of its own. All of it's in the pond's perspective, so it's bigger
  // and goes further nearer the front.
  let droplets = []; // The droplets in the air
  let littleRipples = []; // ...and the ripples they've made
  let splashCount = [0, 0]; // How many droplets each drop throws out, at the least and most (0 = none; it was [6, 11])
  let splashReach = [25, 70]; // How far out they land, in pixels across, at the bottom of the screen
  let splashUp = [15, 45]; // How high they go, in pixels, at the bottom of the screen
  let splashFlight = [0.35, 0.7]; // How many seconds they're in the air
  let splashDropletSize = [1.5, 3.5]; // How big they are, in pixels, at the bottom of the screen
  let littleRippleSize = [12, 30]; // How wide their ripples get, in pixels across, at the bottom of the screen
  let littleRippleTime = 0.9; // How many seconds their ripples take to spread and fade

  // How near (x, y) on the screen is, from 0 at the horizon to 1 at the bottom, and how much flatter than round a small
  // ring there is (the same as ringShape works out)
  function nearness(y) {
    let top = horizon * p.height;
    let near = Math.max(0.01, (y - top) / (p.height - top));
    return { near, flat: flatness * near };
  }

  function splash(drop, seconds) {
    let { near, flat } = nearness(drop.at.y);
    let colour = seenColour(drop.inner, drop.at.y, drop, 0);
    let count = Math.round(p.random(...splashCount));
    for (let k = 0; k < count; k++) {
      let angle = (k / count) * Math.PI * 2 + p.random(-0.3, 0.3); // All the way round, a little uneven
      let reach = p.random(...splashReach) * near;
      droplets.push({
        from: { x: drop.at.x, y: drop.at.y },
        to: { x: drop.at.x + Math.cos(angle) * reach, y: drop.at.y + Math.sin(angle) * reach * flat },
        up: p.random(...splashUp) * near,
        size: p.random(...splashDropletSize) * near,
        start: seconds,
        flight: p.random(...splashFlight),
        colour,
      });
    }
  }

  function drawSplashes(seconds) {
    let g = p.drawingContext;
    // The ripples where droplets came down, spreading and fading
    littleRipples = littleRipples.filter((r) => seconds - r.start < littleRippleTime);
    for (let r of littleRipples) {
      let t = (seconds - r.start) / littleRippleTime;
      let { flat } = nearness(r.y);
      let w = r.size * Math.sqrt(t);
      g.globalAlpha = 1 - t;
      g.beginPath();
      g.ellipse(r.x, r.y, w / 2, (w / 2) * flat, 0, 0, Math.PI * 2);
      g.strokeStyle = r.colour;
      g.lineWidth = 1;
      g.stroke();
    }
    // The droplets, flying up and out and back down, and making a ripple where they land
    for (let d of [...droplets]) {
      let t = (seconds - d.start) / d.flight;
      if (t >= 1) {
        droplets.splice(droplets.indexOf(d), 1);
        littleRipples.push({ x: d.to.x, y: d.to.y, size: p.random(...littleRippleSize) * nearness(d.to.y).near, start: seconds, colour: d.colour });
        continue;
      }
      let x = p.lerp(d.from.x, d.to.x, t);
      let y = p.lerp(d.from.y, d.to.y, t) - d.up * 4 * t * (1 - t); // Up and back down, as things thrown do
      g.globalAlpha = 1;
      g.beginPath();
      g.arc(x, y, d.size, 0, Math.PI * 2);
      g.fillStyle = d.colour;
      g.fill();
    }
    g.globalAlpha = 1;
  }

  let splashTime = 0.5; // How many seconds it rises and falls back in
  let splashHeight = 40; // How high the middle rises, in pixels, at the bottom of the screen (less further away)
  let splashWidth = 60; // How wide the rise is, in pixels across (bigger = more of the rings lift)
  function splashLift(worm, diameter, y) {
    let age = p.millis() / 1000 - (worm.born ?? -Infinity);
    if (age > splashTime) return 0;
    let top = horizon * p.height;
    let near = Math.max(0, (y - top) / (p.height - top)); // Smaller further away
    let rise = Math.sin((Math.PI * age) / splashTime); // Up and back down
    return splashHeight * near * rise * Math.exp(-diameter / splashWidth);
  }

  // Noise on the rings: each is pushed in and out round its edge, its own way, more and more as it spreads, so the new
  // rings in the middle are nearly round and they get wavier going out. (It's a few waves round each ring rather than
  // Perlin noise, which is too slow for this many rings.)
  let ringNoise = 0.012; // How much a ring's pushed in and out, as a share of how big it is
  let ringNoiseMost = 80; // ...but never more than this, in pixels across
  let ringNoiseBumps = [3, 9]; // How many bumps round a ring, at the least and most
  let ringNoiseDrift = 0.4; // How quickly the bumps move round (0 = each ring keeps its shape)

  // spin: how far its shape is turned round, in radians
  // smooth: how much of its wobble's gone (1 = it's round)
  function ringShape(x, y, diameter, lift = 0, seed = 0, spin = 0, smooth = 0) {
    if (diameter <= 0) return null;
    // Where (x, y) is on the water: how far away (z), and how far to the side
    let top = horizon * p.height; // Where the horizon is on the screen
    let below = p.height - top; // How far the bottom of the screen is below it
    let depth = Math.max(0.01, (y - top) / below); // 0 at the horizon, 1 at the bottom of the screen
    let z = 1 / depth;
    let across = below / flatness; // How wide 1 on the water is on the screen, at the bottom
    let side = (x - p.width / 2) / (across * depth);
    let radius = diameter / 2 / (across * depth); // How big the ring is on the water
    // The noise: how far its points are pushed in and out, in pixels across, more the bigger it is
    let churn = Math.min(ringNoise * diameter, ringNoiseMost);
    churn *= 1 - smooth;
    if (churn < 0.3) churn = 0; // Too little to see
    let churnOnWater = churn / (across * depth); // ...on the water
    // Its own waves round it, from its seed: three of them, with their own numbers of bumps, sizes and starting places
    let waves = [];
    if (churn > 0) {
      let hash = (k) => { let v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
      for (let k = 0; k < 3; k++) {
        waves.push({
          bumps: Math.round(p.lerp(ringNoiseBumps[0], ringNoiseBumps[1], hash(k))),
          size: (0.5 + hash(k + 3)) / 3,
          phase: hash(k + 6) * Math.PI * 2 + counter * ringNoiseDrift * (hash(k + 9) - 0.5) * 2,
        });
      }
    }
    let points = Math.max(churn > 0.5 ? 32 : 12, Math.min(ripplePoints, Math.round(diameter / pointSpacing)));

    let xs = new Float32Array(points);
    let ys = new Float32Array(points);
    let left = Infinity, right = -Infinity, high = Infinity, low = -Infinity;
    for (let n = 0; n < points; n++) {
      let angle = (n / points) * Math.PI * 2;
      // Pushed in and out by its waves
      let r = radius;
      for (let wave of waves) r += churnOnWater * wave.size * Math.sin(wave.bumps * (angle - spin) + wave.phase);
      let pz = Math.max(0.05, z + Math.sin(angle) * r); // Not behind the camera
      let px = side + Math.cos(angle) * r;
      xs[n] = p.width / 2 + (px * across) / pz;
      ys[n] = top + below / pz - lift; // Raised by the splash, if it's there
      left = Math.min(left, xs[n]);
      right = Math.max(right, xs[n]);
      high = Math.min(high, ys[n]);
      low = Math.max(low, ys[n]);
    }
    let offScreen = right < 0 || left > p.width || low < 0 || high > p.height;
    // It covers the screen if all four corners are inside it (it's a rounded shape with no dents, so then all of it is)
    let inside = (cx, cy) => {
      let yes = false;
      for (let n = 0, m = points - 1; n < points; m = n++) {
        if (ys[n] > cy !== ys[m] > cy && cx < ((xs[m] - xs[n]) * (cy - ys[n])) / (ys[m] - ys[n]) + xs[n]) yes = !yes;
      }
      return yes;
    };
    let covers = !offScreen && inside(0, 0) && inside(p.width, 0) && inside(0, p.height) && inside(p.width, p.height);
    return { xs, ys, top, below, offScreen, covers };
  }

  // filled: whether it's filled black, hiding what's behind it
  function drawRing(shape, colour, weight, who, s, strength = 1, filled = true) {
    let { xs, ys, top, below } = shape;
    let g = p.drawingContext;
    g.beginPath();
    for (let n = 0; n < xs.length; n++) g.lineTo(xs[n], ys[n]);
    g.closePath();
    if (filled) {
      g.fillStyle = 'black';
      g.fill();
    }
    if (!colour || strength <= 0.003) return; // A calm middle: just the fill
    let [r, gr, b] = shown(colour, who, s).map(Math.round);
    g.strokeStyle = fadeFor(r, gr, b, strength, top, below);
    g.lineWidth = weight * lineScale;
    g.stroke();
  }

  // The gradient a line of this colour and strength is drawn with: fading toward the horizon (up and down the screen
  // is nearer and further, so a gradient from top to bottom does it), from gone, far off, to its colour, and on to
  // brighter at the front. They're kept and used again, since making one for every ring every frame is slow; colours
  // and strengths are rounded a little so that rings can share them.
  let fades = new Map();
  function fadeFor(r, gr, b, strength, top, below) {
    r = Math.round(r / 4) * 4;
    gr = Math.round(gr / 4) * 4;
    b = Math.round(b / 4) * 4;
    strength = Math.round(strength * 32) / 32;
    let key = `${r},${gr},${b},${strength},${p.height},${Math.round(horizon * 10) / 10},${Math.round(glowScale * 20) / 20},${Math.round(heldGlow * 50) / 50}`;
    let fade = fades.get(key);
    if (fade) return fade;
    if (fades.size > 4000) fades.clear(); // Not keeping them for ever
    let g = p.drawingContext;
    let gone = top + below * fadeGone;
    let full = Math.min(1, (below * (fadeFull - fadeGone)) / (p.height - gone)); // Where it's at its colour, along the gradient
    fade = g.createLinearGradient(0, gone, 0, p.height);
    for (let k = 0; k <= 4; k++) {
      fade.addColorStop((k / 4) * full, `rgba(${r},${gr},${b},${strength * Math.pow(k / 4, fadeCurve)})`);
    }
    for (let k = 1; k <= 3; k++) {
      let glow = frontGlow * glowScale * (k / 3) + heldGlow;
      let mix = (v) => Math.min(255, Math.round(v + (255 - v) * glow));
      fade.addColorStop(full + (1 - full) * (k / 3), `rgba(${mix(r)},${mix(gr)},${mix(b)},${strength})`);
    }
    fades.set(key, fade);
    return fade;
  }

  // The welcome, as the wormhole has it: "welcome to my wormhole", and then, in the same place, "click anywhere to
  // enter", which stays until someone enters, with the sound switch at the bottom, which comes with the first words and
  // stays. The sound's off unless they turned it on last time; not choosing isn't saved as a choice.
  const welcomeTime = 6; // How many seconds "welcome to my wormhole" is up for
  const introGap = 1.3; // How many seconds from it starting to fade out to the rest starting to fade in
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

  onSoundChange((on) => on && loadDrips());
  let introTimers = [];

  // The rain's sound: one of Ofer's drips (public/sounds/landing) as each drop lands, louder and further to the side
  // the nearer and further to the side it lands, and loudest for the drop in colour
  const dripCount = 10;
  const dripLoud = [0.25, 0.7]; // How loud a drip is, from one landing at the horizon to one at the bottom of the screen
  const dripColourLoud = 1; // How loud the drop in colour's is
  const dripPan = 0.6; // How far to the side a drip at the edge of the screen sounds, from 0 (the middle) to 1
  const dripPitch = [0.92, 1.08]; // How much faster or slower one plays, to make each a little different
  let drips = null; // The drips' sound, once it's loaded

  function loadDrips() {
    const out = audioOut();
    if (drips || !out) return;
    drips = [];
    for (let n = 1; n <= dripCount; n++) {
      fetch(`/sounds/landing/drip${String(n).padStart(2, '0')}.m4a`)
        .then((response) => response.arrayBuffer())
        .then((data) => out.context.decodeAudioData(data))
        .then((buffer) => drips.push(buffer))
        .catch(() => {}); // Without it, that drip's just silent
    }
  }

  function playDrip(drop) {
    if (sandbox) {
      sandbox.onDrop?.({
        loud: drop.inColour ? dripColourLoud : p.lerp(...dripLoud, Math.min(1, nearness(drop.at.y).near)),
        pan: p.constrain((drop.at.x / p.width) * 2 - 1, -1, 1) * dripPan,
        near: p.constrain((drop.at.y / p.height - dropTop) / (dropBottom - dropTop), 0, 1),
        inColour: drop.inColour,
        pressed: !!drop.pressed,
      });
      return;
    }
    const out = audioOut();
    if (!out || !soundWanted()) return;
    loadDrips();
    if (!drips.length) return;
    const context = out.context;
    const source = context.createBufferSource();
    source.buffer = drips[Math.floor(Math.random() * drips.length)];
    source.playbackRate.value = p.random(...dripPitch);
    const loud = context.createGain();
    loud.gain.value = drop.inColour ? dripColourLoud : p.lerp(...dripLoud, Math.min(1, nearness(drop.at.y).near));
    const side = context.createStereoPanner();
    side.pan.value = p.constrain((drop.at.x / p.width) * 2 - 1, -1, 1) * dripPan;
    source.connect(loud).connect(side).connect(out);
    source.start();
  }

  function runIntro() {
    const later = (time, then) => introTimers.push(setTimeout(then, time * 1000));
    later(0.05, () => welcomeWords.classList.add('showing'));
    later(0.05, () => soundSpot.classList.remove('waiting')); // And it stays
    later(welcomeTime, () => welcomeWords.classList.remove('showing'));
    later(welcomeTime + introGap, () => pressWords.classList.add('showing'));
  }

  // Entering: the sound starts (if it's chosen), the words go, and the drop in colour falls where it was pressed, with the camera
  // coming round to look down on it (see the dive)
  // Composer mode (?compose at the end of the address): entering saves the dive's score, a MIDI file to write music
  // to it in a DAW, starting at the press that enters (see dive_score.js)
  const composing = new URLSearchParams(location.search).has('compose');
  function saveScore() {
    if (!composing) return;
    const settings = {
      fall: dropTime, above: aboveTime, handOverAt, colourSpin, spinUpAt, spinUp, wormAt, wormTime, rushUp, rushDown,
      tunnelGoneAt, tunnelGoneTime, wormRush, springAt, springUp, springFor, springDown, springRush, stretch,
      stretchTime, stretchSettle, starsIn,
    };
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([diveScore(settings)], { type: 'audio/midi' }));
    link.download = 'dive-score.mid';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  }

  function enter(x, y) {
    if (dive) return; // Only once
    saveScore();
    startAudio(); // With sound, if that's what's chosen (see the switch at the bottom); nothing, if not
    introTimers.forEach(clearTimeout);
    welcome.classList.add('gone');
    soundSpot.classList.remove('waiting'); // In case it's not shown yet
    dropRain(x, y, true);
    dive = { start: p.millis() / 1000, at: { x, y }, from: horizon, fromFlat: flatness, glow: glowAt(y) };
  }

  p.setup = () => {
    const canvas = p.createCanvas(container.clientWidth, container.clientHeight);
    p.pixelDensity(sharp ? p.displayDensity() : 1); // Standard resolution is a quarter of the pixels on a Retina screen
    p.noiseSeed(noiseSeed); // So the wormhole can be given the same (see handOver)
    if (sandbox) {
      // The sound sandbox's scene: just the rain, and a press drops a drop where it's pressed
      dropRain(p.width / 2, p.lerp(dropTop, dropBottom, 0.5) * p.height);
      canvas.elt.addEventListener('pointerdown', (event) => {
        const box = container.getBoundingClientRect();
        dropRain(event.clientX - box.left, event.clientY - box.top);
        drops[drops.length - 1].pressed = true;
      });
      return;
    }
    // A link straight to one of the wormhole's stages skips the pond
    if (location.hash) {
      handOver(true);
      return;
    }
    dropRain(p.width / 2, p.lerp(dropTop, dropBottom, 0.5) * p.height); // The first one, into the middle of where they land
    soundSpot.append(soundButton({ track: true }));
    // Off unless they turned it on last time, but only for now: not choosing isn't saved as a choice
    if (soundChosen() !== 'on') setSound(false, { remember: false });
    container.append(welcome, soundSpot);
    runIntro();
    // Pressing anywhere, or a key, enters (a key drops it in the middle of where the rain lands)
    canvas.elt.addEventListener('pointerdown', (event) => {
      const box = container.getBoundingClientRect();
      enter(event.clientX - box.left, event.clientY - box.top);
    });
    window.addEventListener('keydown', (event) => {
      if (handedOver || event.target.closest?.('.wormhole-sound-spot')) return; // Their keys are their own
      if (!event.metaKey && !event.ctrlKey && event.key !== 'Tab') enter(p.width / 2, p.lerp(dropTop, dropBottom, 0.5) * p.height);
    });
  };
  p.draw = draw;

  // Going on into the wormhole. Once the worm's sprung forward and settled, the wormhole takes over, with the worm just
  // as it is: at the same place on the same path (the wormhole's worm weaves along Perlin noise just as this one does,
  // so it's given the same noise, and how far along it the head is), drawn the same way, by hand, spinning as it was.
  // The pond's last frame stays up until the wormhole's drawn its first (see fromPond in wormhole.js).
  let handOverAt = 6.4; // How many seconds after the camera's right above it the wormhole takes over (the spring's settled
  // by about 6: see springAt and springDown)
  let noiseSeed = 7; // The Perlin noise the worm's path is made of, which the wormhole's given too, so its path's the same
  let wormSmooth = 0; // How much of its rings' wobble's gone (it never is: the wormhole draws them by hand too)
  let handOverWeight = 1;
  let wormNow = []; // Where each of the worm's rings is on the screen, this frame: { along (0 at its head), x, y, d }
  let handedOver = false;

  function prepareHandOver(seconds) {
    let worm = worms.find((w) => w.landing);
    if (!worm || !dive) return;
    let since = seconds - dive.start - aboveTime; // From when the camera's right above it
    if (since >= handOverAt && wormNow.length) handOver(false, worm, seconds);
  }

  // Where a ring is on the screen: its middle and how wide it is, from the canvas as it's turned just now (the camera)
  function placeOnScreen(shape) {
    let { xs, ys } = shape;
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (let n = 0; n < xs.length; n++) {
      left = Math.min(left, xs[n]);
      right = Math.max(right, xs[n]);
      top = Math.min(top, ys[n]);
      bottom = Math.max(bottom, ys[n]);
    }
    let turned = p.drawingContext.getTransform();
    let density = p.pixelDensity();
    let middle = turned.transformPoint(new DOMPoint((left + right) / 2, (top + bottom) / 2));
    let scale = Math.hypot(turned.a, turned.b) / density;
    return { x: middle.x / density, y: middle.y / density, d: (right - left) * scale };
  }

  // The stars, streaking past as the worm flies forward through space, as the wormhole has them in its psychworm stage
  // (see drawStars there): they come in from the moment the worm springs out of the wormhole, streaming from the point
  // it's heading for, and the wormhole carries them on just as they are
  let starsIn = 1.5; // How many seconds they take to come in, from when it springs out (see springAt)
  let starCount = 120; // (These are the wormhole's)
  let starSpeed = 0.35; // How much of the way to the camera a star comes each second
  let focusFollow = 0.06; // How quickly the point they stream from catches up with where the worm's heading
  let stars = [];
  let starFocus = null;
  let starTime = 0;

  function drawStars(worm) {
    let seconds = p.millis() / 1000;
    let dt = Math.min(0.1, seconds - starTime);
    starTime = seconds;
    let since = seconds - dive.start - aboveTime - wormAt - springAt; // From when the worm springs out
    if (since <= 0) return;
    let shown = p.constrain(since / starsIn, 0, 1);
    shown = shown * shown * (3 - 2 * shown);
    if (!stars.length) for (let k = 0; k < starCount; k++) stars.push({ x: p.random(-1, 1), y: p.random(-1, 1), z: p.random(0.05, 1) });
    // Where the worm's heading: its head, out where it'd be at its full distance (see wormRing)
    let path = (b) => ({
      x: (p.noise(worm.offset + b * (wormBend / wormLength)) - 0.5) * 2 * wormWeaveWide * p.width,
      y: (p.noise(worm.offset + b * (wormBend / wormLength), 100) - 0.5) * 2 * wormWeaveTall * p.height,
    });
    let made = (worm.made ?? 0) + (worm.phase ?? 0);
    let head = path(made);
    let camera = path(made - wormLength);
    let heading = {
      x: p.width / 2 + (head.x - camera.x) / wormHeadDistance,
      y: wormHorizon * p.height + (wormCameraAbove * p.height - (head.y - camera.y)) / wormHeadDistance,
    };
    starFocus ??= { ...heading };
    starFocus.x += (heading.x - starFocus.x) * focusFollow;
    starFocus.y += (heading.y - starFocus.y) * focusFollow;
    let reach = Math.max(p.width, p.height) * 0.5;
    let g = p.drawingContext;
    g.save();
    let density = p.pixelDensity();
    g.setTransform(density, 0, 0, density, 0, 0); // On the screen, not the water
    for (let star of stars) {
      let fromX = starFocus.x + (star.x * reach) / star.z;
      let fromY = starFocus.y + (star.y * reach) / star.z;
      star.z -= starSpeed * dt;
      if (star.z < 0.05) {
        star.x = p.random(-1, 1);
        star.y = p.random(-1, 1);
        star.z = 1;
        continue;
      }
      g.strokeStyle = `rgba(255,255,255,${(1 - star.z) * shown})`;
      g.lineWidth = 1 + (1 - star.z);
      g.beginPath();
      g.moveTo(fromX, fromY);
      g.lineTo(starFocus.x + (star.x * reach) / star.z, starFocus.y + (star.y * reach) / star.z);
      g.stroke();
    }
    g.restore();
  }

  // straight: going straight to a stage of the wormhole, from a link, without the pond's worm
  function handOver(straight = false, worm = null, seconds = 0) {
    if (handedOver) return;
    handedOver = true;
    p.resizeCanvas = () => {}; // The page keeps resizing this one (see src/scripts/mount_sketches.js)
    let leave = () => {
      p.remove();
      welcome.remove();
      soundSpot.remove();
    };
    if (straight) {
      leave();
      new p5((next) => wormhole(next, container), container);
      return;
    }
    p.noLoop(); // Its last frame stays up until the wormhole's drawn its first, and then it goes (leave)
    let life = seconds - worm.born;
    let fromPond = {
      rings: [...wormNow].sort((a, b) => a.along - b.along),
      noiseSeed,
      // How far along its path the head is, in the noise (see wormRing): the wormhole's path is the same noise
      path: worm.offset + ((worm.made ?? 0) + (worm.phase ?? 0)) * (wormBend / wormLength),
      spin: spinAngle(life), // How far its rings have spun (each at its own speed: see colourSpinMix)...
      spinRate: (spinAngle(life + 0.05) - spinAngle(life)) / 0.05, // ...and how quickly they're spinning
      spinMix: colourSpinMix,
      stars, // The stars, as they are, so they carry on (see drawStars)
      focus: starFocus,
      counter, // How far its rings' bumps have drifted round (see ringNoiseDrift)
      noise: { amount: ringNoise, most: ringNoiseMost, bumps: ringNoiseBumps, drift: ringNoiseDrift, points: ripplePoints, spacing: pointSpacing },
      low: landingLow, // Its colours
      glow: heldGlow, // ...and how much brighter they are, from where the drop landed (see glowAt)
      weights: [p.map(numSegments - 1, 0, numSegments, 3, 0.2), p.map(numSegments - 1 - wormLength, 0, numSegments, 3, 0.2)], // Its lines, head to tail
      leave,
    };
    new p5((next) => wormhole(next, container, { fromPond }), container);
  }
}
