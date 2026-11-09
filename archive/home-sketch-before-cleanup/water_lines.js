// WaterLines class
// The water, drawn as a series of wavy horizontal lines that get closer together toward
// the top of the screen, which gives a sense of perspective: the water stretches away
// into the distance.
//
// Each line is a fixed fraction (this.ratio) of the way up from the one below it, so the
// gaps shrink steadily as they go up, like a real surface seen at a low angle. The waves
// are Perlin noise, smaller and fainter in the distance. As the boat sails forward the
// lines roll toward the camera, and as it turns they slide sideways. The wake pushes them
// aside where it passes (see LineWake.pushAt()), and the boat drags them along with it as
// it sails across them; they slowly spring back afterwards (see pull()). Wherever the boat
// pulls a line, ripples run outward along it in both directions (see rippleAt()).
// Where the wake passes (a V behind the boat), the lines disappear, and fade back in soon
// after it's gone. Behind the boat, a stream of bubbles pours out: ripples like the ones
// that followed the mouse in the first version, which swell up and shrink away again.
//
// The points along each line are fixed to the water, not the screen (every `step` pixels
// of water), so a bit of line that's been dragged stays dragged as it scrolls past.

import p5 from 'p5';
import rippleColor, { fadingColor } from './ripple_color.js';
import { depth, flatness } from './perspective.js';

export default class WaterLines {
  constructor() {
    this.ratio = 0.95 ; // Each line is this much as far down the screen as the one below it (smaller = bunch up faster)
    this.waveScale = 0.01; // How long the waves are (smaller = longer waves)
    this.waveSpeed = 0.01; // How quickly the waves change
    this.waveHeight = 10; // How tall the waves are, in pixels, near the bottom of the screen
    this.drift = 0.003; // How fast the lines drift toward the bottom of the screen on their own, in gaps per frame
    this.alpha = 200; // How bright the lines are, near the bottom of the screen (255 = solid)
    this.step = 10; // Pixels between the points along each line
    this.top = 40; // No lines higher than this up the screen
    this.band = 0.45; // How far a line can move toward its neighbours (0.5 = halfway, so under that they never cross)
    this.pullStrength = 2.5 // How hard the boat drags the lines along with it
    this.maxPull = 500; // Furthest (in pixels) a bit of line can be dragged
    this.springBack = 0.99; // How quickly dragged lines settle back (smaller = faster)
    this.bowPush = 1.5; // How hard the front of the boat pushes the lines just ahead of it forward

    // Ripples that run along a line, outward both ways from where the boat pulled it
    this.rippleSpeed = 5; // Pixels per frame
    this.rippleWavelength = 50; // Pixels from one crest to the next
    this.rippleLength = 150; // How long each run of ripples is, in pixels
    this.rippleHeight = 12; // How tall, in pixels, near the bottom of the screen
    this.rippleLife = 120; // How many frames until they've died away, with the boat at its usual top speed (faster goes further)
    this.rippleEvery = 4; // While the boat keeps pulling a line, a new ripple this often (frames)
    this.ripples = []; // { line, x (on the water), born (frameCount), strength (0 to 1) }
    this.lastRipple = new Map(); // Line number -> when it last sent out a ripple

    // Where the wake covers the lines they disappear, then fade back in once it's gone
    this.coverThreshold = 0.35; // How much the wake has to cover a point to hide it (0 to 1)
    this.fadeBackTime = 20; // How many frames the line takes to fade back in afterwards

    // Or, while the wake's over it, it can be only black or colour: short segments of it flicker
    // on in colour, then it comes back as a plain line once the wake's gone
    this.flickerBack = false;
    this.segmentLengths = [1, 2, 4, 8]; // How many points are in a segment, from right behind the boat to the far end of the wake
    this.flickerEvery = 12; // How many frames a segment holds before it can change (bigger = calmer)
    this.colourNear = 0.04; // How likely a segment is to be in colour, right behind the boat
    this.colourFar = 0.8; // ...and at the far end of the wake

    // A stream of bubbles pouring out right behind the boat while it's moving, drawn exactly
    // like the ripples that followed the mouse in the first version (landing_page.js)
    this.bubbleLife = 100; // How many frames a bubble lasts (like the ripples' trailLength)
    this.bubbleWidth = 50; // Widest a bubble gets, near the bottom of the screen (like the ripples)
    this.sternBubbles = 1; // How many each frame
    this.sternSpread = createVector(50, 30); // How far around the back of the boat they land (like the first version's ripples)
    this.bubbles = []; // { x, y, born } on the screen; they slide with the water
    // When each hidden point was last covered by the wake, keyed by line and point like
    // this.dragged. Points that have fully faded back in aren't in it.
    this.hiddenSince = new Map();

    // How far each point of each line has been dragged, by the boat. Keyed by line and
    // point number (see key()), so it sticks to the water; points that haven't been
    // dragged (or have settled back) aren't in it at all.
    this.dragged = new Map();

    // How far the boat has sailed, so the lines and waves move with the water:
    // forward is counted in lines, sideways in pixels
    this.travelled = 0;
    this.travelledX = 0;
  }

  // scroll: how far the world slides back this frame (see Boat)
  // boatY: how far down the screen the boat is
  update(scroll, boatY) {
    // Sailing forward (up the screen) brings the lines toward us (down the screen). They're
    // spaced in perspective, so move them by however many gaps the scroll is at the boat
    let gap = boatY * (1 - this.ratio);
    this.travelled -= scroll.y / gap;
    // ...and they drift slowly toward the camera on their own, as if the water's flowing
    this.travelled += this.drift;
    this.travelledX += scroll.x;

    // The stream of bubbles sits on the water, so it slides back with it, until they're gone
    for (let b of this.bubbles) {
      b.x -= scroll.x;
      b.y -= scroll.y;
    }
    this.bubbles = this.bubbles.filter((b) => frameCount - b.born < this.bubbleLife);
  }

  // Drag the bits of line near the boat along in the direction it's moving, and let
  // everything that's been dragged before spring back a little
  pull(boat) {
    this.boat = boat;
    for (let [key, offset] of this.dragged) {
      offset.mult(this.springBack);
      if (offset.mag() < 0.1) this.dragged.delete(key);
    }
    this.ripples = this.ripples.filter((r) => frameCount - r.born < r.life);
    // Forget hidden points that have long since faded back in (even ones that scrolled off screen)
    for (let [key, since] of this.hiddenSince) {
      if (frameCount - since > this.fadeBackTime) this.hiddenSince.delete(key);
    }
    if (boat.velocity.mag() < 0.1) {
      this.lastRipple.clear();
      return;
    }

    // Pour out a few new bubbles right behind the boat
    if (boat.velocity.mag() > 0.5) {
      for (let k = 0; k < this.sternBubbles; k++) {
        let x = boat.stern.x + random(-this.sternSpread.x, this.sternSpread.x);
        let y = boat.stern.y + random(-this.sternSpread.y, this.sternSpread.y);
        this.bubbles.push({ x, y, born: frameCount });
      }
    }

    // Where the boat sits on the water, and how far around it reaches: across the screen,
    // about half its length; up and down, much less, since the water's seen at a low angle
    let bx = boat.position.x;
    let by = boat.position.y + boat.length * 0.12;
    let reachX = boat.length * 0.5;
    let reachY = boat.length * 0.2;

    let pulledLines = new Set();
    for (let n = ceil(this.travelled); ; n++) {
      let y = this.lineY(n);
      if (y < this.top) break;
      if (abs(y - by) > reachY) continue;
      for (let i = this.firstPoint(); i <= this.lastPoint(); i++) {
        let x = this.pointX(i);
        if (abs(x - bx) > reachX) continue;
        // 1 right at the boat, fading to 0 at the edge of its reach
        let closeness = 1 - sqrt(sq((x - bx) / reachX) + sq((y - by) / reachY));
        if (closeness <= 0) continue;
        let key = this.key(n, i);
        let offset = this.dragged.get(key) || createVector(0, 0);
        offset.add(p5.Vector.mult(boat.velocity, this.pullStrength * closeness));
        offset.limit(this.maxPull * depth(y) / 0.8);
        this.dragged.set(key, offset);
        pulledLines.add(n);
      }
    }

    // A bow wave: the lines just in front of the boat get pushed forward, ahead of it
    this.pushAhead(boat, reachX, reachY);

    // Send ripples out along the lines being pulled: straight away when the boat first
    // reaches a line, then every few frames while it keeps pulling it. They start where the
    // boat's path crosses the line, so when it crosses at an angle, the starting point slides
    // along the line with it (see rippleAt() for why that looks natural).
    for (let n of pulledLines) {
      let last = this.lastRipple.get(n);
      if (last === undefined || frameCount - last >= this.rippleEvery) {
        let strength = min(1, boat.velocity.mag() / boat.maxspeed); // Bigger ripples from a faster boat
        let crossing = bx;
        if (abs(boat.velocity.y) > 0.1) {
          let alongPath = (this.lineY(n) - by) / boat.velocity.y; // How far along the boat's path the line is
          crossing = bx + constrain(alongPath * boat.velocity.x, -reachX, reachX);
        }
        // The faster the boat's going, the longer they last, so the further they run along the line
        let pace = boat.velocity.mag() / (boat.maxspeed * boat.fit());
        let life = this.rippleLife * constrain(pace, 0.3, 4);
        this.ripples.push({ line: n, x: crossing + this.travelledX, born: frameCount, strength, life });
        this.lastRipple.set(n, frameCount);
      }
    }
    // Lines the boat has moved off will send a new ripple as soon as it reaches them again
    for (let n of this.lastRipple.keys()) {
      if (!pulledLines.has(n)) this.lastRipple.delete(n);
    }
  }

  // Push the bits of line just in front of the boat forward, in the direction it's going,
  // so they bulge out ahead of the bow like a bow wave
  pushAhead(boat, reachX, reachY) {
    let forward = boat.velocity.copy().normalize();
    // A zone just in front of the bow, a bit smaller than the area the boat drags
    let cx = boat.bow.x + forward.x * reachX * 0.3;
    let cy = boat.bow.y + forward.y * reachY * 0.3;
    let rx = reachX * 0.6;
    let ry = reachY * 0.6;
    let strength = this.bowPush * min(1, boat.velocity.mag() / boat.maxspeed);

    for (let n = ceil(this.travelled); ; n++) {
      let y = this.lineY(n);
      if (y < this.top) break;
      if (abs(y - cy) > ry) continue;
      for (let i = this.firstPoint(); i <= this.lastPoint(); i++) {
        let x = this.pointX(i);
        if (abs(x - cx) > rx) continue;
        let closeness = 1 - sqrt(sq((x - cx) / rx) + sq((y - cy) / ry));
        if (closeness <= 0) continue;
        let key = this.key(n, i);
        let offset = this.dragged.get(key) || createVector(0, 0);
        offset.add(p5.Vector.mult(forward, strength * closeness));
        offset.limit(this.maxPull * depth(y) / 0.8);
        this.dragged.set(key, offset);
      }
    }
  }

  // How far the ripples running along a line lift it at water position wx.
  //
  // The boat sends out a ripple every few frames while it's on a line. Each one spreads out
  // both ways from where it started (it only depends on the distance from there), swelling
  // up and fading over its length, and dying away as it gets older. Together they add up to
  // one steady train of waves, because they all share the same rhythm: the waves are timed
  // by frameCount, not by when each ripple started.
  //
  // That's what makes an angled crossing look natural. The starting point slides along the
  // line with the boat, so the waves ahead of it (the way it's heading) get bunched up, and
  // the ones behind get stretched out, like the sound of a passing car (the Doppler effect).
  rippleAt(lineRipples, wx) {
    // Ripples overlap a lot, so each one only adds a share, sized so that together they make
    // waves about rippleHeight tall
    let share = (PI * this.rippleEvery * this.rippleSpeed) / (2 * this.rippleLength);
    let lift = 0;
    for (let r of lineRipples) {
      let age = frameCount - r.born;
      let distance = abs(wx - r.x);
      let behindFront = age * this.rippleSpeed - distance; // How far behind the leading edge
      if (behindFront <= 0 || behindFront > this.rippleLength) continue;
      let swell = sin((PI * behindFront) / this.rippleLength);
      let fade = 1 - age / r.life;
      let wave = sin((TWO_PI * (frameCount * this.rippleSpeed - distance)) / this.rippleWavelength);
      lift += wave * swell * fade * r.strength * share;
    }
    return lift * this.rippleHeight;
  }

  // Line number n's height on the screen: the bottom of the screen when n equals
  // travelled, and further up as n gets bigger
  lineY(n) {
    return height * pow(this.ratio, n - this.travelled);
  }

  // Points along a line are every `step` pixels of water. These number the ones on screen
  // (with one spare at each end), and give a point's position on the screen.
  // A number for point i of line n, for looking it up in this.dragged and this.hiddenSince
  // (numbers are much faster to look up than "n:i" strings, and this runs for every point)
  key(n, i) {
    return n * 1000000 + i;
  }

  firstPoint() {
    return floor(this.travelledX / this.step) - 1;
  }
  lastPoint() {
    return ceil((this.travelledX + width) / this.step) + 1;
  }
  pointX(i) {
    return i * this.step - this.travelledX;
  }

  // cameraSquash: the boat's camera squash, so the bubbles tip with the view like the ripples did
  show(wake, weight, cameraSquash) {
    this.wakeLength = wake.maxLength;
    push();
    noFill();
    for (let n = ceil(this.travelled); ; n++) {
      let y = this.lineY(n);
      if (y < this.top) break;
      let near = depth(y) / 0.8; // 1 at the bottom of the screen, smaller in the distance

      strokeWeight(weight * near);
      let shade = (((n * 0.137) % 1) + 1) % 1; // Each line its own colour from the ripples' scheme

      let lineRipples = this.ripples.filter((r) => r.line === n);

      // This line's band: it can move up or down a little under halfway to the lines either
      // side of it. Every line keeps to its own band, so they never cross, however hard the
      // boat drags them or the waves and ripples lift them.
      let bandTop = y - (y - this.lineY(n + 1)) * this.band;
      let bandBottom = y + (this.lineY(n - 1) - y) * this.band;

      // The line is drawn in pieces, one for each stretch that's equally faded (hidden under
      // the wake, fading back in, or fully there), so each piece can have its own opacity
      let pieceLevel = -1; // Opacity of the piece being drawn, from 0 to 1 (-1 = none yet)
      let pieceColour = -1; // Which segment and how much colour the piece being drawn has (-1 = none)
      let previous = null;
      for (let i = this.firstPoint(); i <= this.lastPoint(); i++) {
        let x = this.pointX(i);
        let wave = (noise(i * this.step * this.waveScale, n * 0.3, frameCount * this.waveSpeed) - 0.5) * 2;
        let wy = y + wave * this.waveHeight * near;
        if (lineRipples.length > 0) wy -= this.rippleAt(lineRipples, i * this.step) * near;
        // Dragged along by the boat, and pushed aside by the wake
        let key = this.key(n, i);
        let offset = this.dragged.get(key);
        if (offset) {
          x += offset.x;
          wy += offset.y;
        }
        wy += wake.pushAt(x, wy);
        // Ease into the edge of the band rather than stopping dead there, so the line stays
        // curvy: small moves are left as they are, big ones slow down as they near the edge
        let moved = wy - y;
        let room = moved < 0 ? y - bandTop : bandBottom - y;
        wy = y + room * Math.tanh(moved / room);

        // Hidden under the wake, or fading back in?
        let cover = wake.coverAt(x, wy);
        let back = this.flickerBack ? this.flickerState(cover, n, i, x, wy) : null;
        let level = back ? back.level : this.visibility(key, cover);
        let colourful = back ? back.colourful : 0;
        let segmentKey = back ? back.segmentKey : -1;
        let colourPiece = colourful > 0 ? segmentKey : -1;

        // Start a new piece of line whenever the opacity changes, joined to the last point.
        // Where the line goes into or comes out of the wake's V, end or start it exactly on
        // the V's arm, so the line runs right into the arm.
        level = round(level * 4) / 4; // A few steps of opacity is plenty, and keeps the pieces long
        if (level !== pieceLevel || colourPiece !== pieceColour) {
          let onArm = previous && (level === 0 || pieceLevel === 0) ? wake.crossV(previous.x, previous.y, x, wy) : null;
          if (pieceLevel > 0) {
            if (onArm) vertex(onArm.x, onArm.y);
            else vertex(x, wy);
            endShape();
          }
          pieceLevel = level;
          pieceColour = colourPiece;
          if (level > 0) {
            let alpha = this.alpha * near * level;
            if (colourful > 0) stroke(fadingColor(this.hash(segmentKey), alpha, colourful));
            else stroke(rippleColor(shade, alpha));
            beginShape();
            if (onArm) vertex(onArm.x, onArm.y);
            else if (previous) vertex(previous.x, previous.y);
          }
        }
        if (level > 0) vertex(x, wy);
        previous = { x, y: wy };
      }
      if (pieceLevel > 0) endShape();
    }

    // Then the stream of bubbles from behind the boat on top, filled in black so they cover
    // up the lines underneath. They're added newest last, so newer ones sit on top.
    for (let b of this.bubbles) {
      this.drawBubble(b.x, b.y, frameCount - b.born, weight, cameraSquash);
    }
    pop();
  }

  // How visible the point `key` should be (0 = hidden, 1 = fully there), given how much
  // the wake covers it right now. While it's covered it stays hidden; once the wake moves
  // on, it fades straight back in.
  // How point i of line n, at (x, y), looks if flickerBack is on: { level } is how much of it
  // shows, { colourful } how much colour it has. While the wake's over it, it's black or in
  // colour, and much more likely to be in colour the further behind the boat it is; after that
  // it's a plain line. It flickers as one with the rest of its segment (segmentKey): segments
  // are short right behind the boat, and longer further back.
  flickerState(cover, n, i, x, y) {
    if (cover <= this.coverThreshold) return { level: 1, colourful: 0, segmentKey: -1 };
    let far = constrain(dist(x, y, this.boat.position.x, this.boat.position.y + this.boat.length * 0.12) / this.wakeLength, 0, 1);
    let sizes = this.segmentLengths;
    let size = min(floor(far * sizes.length), sizes.length - 1);
    let segmentKey = this.key(n, floor(i / sizes[size]) * sizes.length + size);
    // Each segment holds for a moment before it can change, at its own time, so it doesn't strobe
    let beat = floor((frameCount + this.hash(segmentKey) * this.flickerEvery) / this.flickerEvery);
    let flash = this.hash(segmentKey + beat * 0.61) < lerp(this.colourNear, this.colourFar, far * far) ? 1 : 0;
    return { level: flash, colourful: flash, segmentKey };
  }

  // A number from 0 to 1 that's always the same for the same input, but looks random
  hash(x) {
    let h = Math.sin(x * 12.9898) * 43758.5453;
    return h - Math.floor(h);
  }

  visibility(key, cover) {
    if (cover > this.coverThreshold) this.hiddenSince.set(key, frameCount);
    let since = this.hiddenSince.get(key);
    if (since === undefined) return 1;

    let fadingFor = frameCount - since;
    if (fadingFor <= 0) return 0;
    if (fadingFor >= this.fadeBackTime) {
      this.hiddenSince.delete(key);
      return 1;
    }
    return fadingFor / this.fadeBackTime;
  }

  // One bubble from the stream behind the boat, at (x, y) and `age` frames old. Drawn like the ripples that followed the mouse in the first version:
  // it swells up and shrinks away again over its life, bright when new and fading, changing
  // colour as it goes, in full perspective, and filled in black to cover the lines behind it
  drawBubble(x, y, age, weight, cameraSquash) {
    if (age >= this.bubbleLife) return;
    let life = age / this.bubbleLife; // 0 = just made, 1 = gone
    let newness = 1 - life; // Like the ripples' i / trailLength: 1 = newest
    let diameter = sin(life * PI); // Swells up, then shrinks away
    let fade = sin(newness * HALF_PI); // Bright when new, fading out

    push();
    fill(0); // Covers up the water's lines behind it
    strokeWeight(weight);
    stroke(rippleColor(newness, 255 * fade));
    let w = diameter * this.bubbleWidth * depth(y);
    ellipse(x, y, w, w * flatness(y) * cameraSquash);
    pop();
  }
}
