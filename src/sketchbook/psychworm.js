// A rainbow worm flying forward through space by itself, weaving slowly along a path of Perlin noise, seen
// from a camera just above and behind it, with stars streaming past. Every so often it goes through a ring.
// Hold the mouse down to leave trails.
export default function psychworm(p, container) {
  const length = 70;
  const coswave = new Array(length);
  const sinwave = new Array(length);

  const weaveSpeed = 0.2; // How quickly it weaves (smaller = slower)
  const weaveWide = 1.3; // How far it weaves from side to side, as a share of the screen's width
  const weaveTall = 0.6; // ...and up and down, as a share of the screen's height
  const bodyTime = 4; // How many seconds back along its path its tail is, which sets how much of the weave shows
  const tailWander = 0.15; // How quickly its tail drifts around the screen (smaller = slower)
  const tailWide = 0.4; // How far it can drift from the middle of the screen, as a share of the width: small enough that it can't leave it
  const tailTall = 0.1; // ...and up and down, as a share of the height
  const tailDistance = 0.9; // How far its tail is from the camera (1 = at its full size, and less is nearer). Too near and it's off the bottom of the screen.
  const headDistance = 4; // How far its head is
  const horizon = 0.25; // How far down the screen the point straight ahead of the camera is
  const cameraAbove = 0.5; // How far the camera is above it, as a share of the screen's height (bigger = looking down more)
  const bodyScale = 2; // How big it's drawn
  const ringAfter = 10; // How many seconds pass before a ring appears
  const ringFrom = 8; // How far away it starts, in the same units as headDistance
  const ringThrough = 0.3; // How near it gets, by which time it's gone past the edges of the screen
  const ringBehind = 0.1; // How far the camera is above the worm once it's right behind it, as a share of the screen's height
  const ringWash = 160; // How quickly the paint fades while the ring's there, so that the ring doesn't leave a smear behind it
  const ringSize = 1.7; // How wide the circle in its middle is, compared to the widest the worm can be
  const ringPetals = 8; // It's the outline of a flower, with this many petals
  const ringPetalLength = 1; // How long they are, compared to the size of the circle in its middle
  const ringPetalWidth = 0.6; // ...and how wide
  const ringSpin = 0.25; // How quickly it turns
  const focusFollow = 0.06; // How quickly the point the stars stream from catches up with where it's heading
  const starCount = 120;
  const starSpeed = 0.35; // How much of the way to the camera a star comes each second
  const stars = [];
  let focus;
  let waited = 0; // How long it's been since the last ring
  let ringDistance = null; // How far away the ring is, while there is one
  let ringMeets = 0; // When the worm's head gets to it, which says where on the worm's path it is
  let ringPull = 0; // How far the view has shifted to put the worm through the ring (0 = not at all)

  p.setup = () => {
    p.createCanvas(container.clientWidth, container.clientHeight);
    p.fill(0);
    p.background(0);
    p.cursor(p.CROSS);
    for (let i = 0; i < length; i++) {
      const amount = p.map(i, 0, length, 0, p.PI);
      coswave[i] = p.abs(p.cos(amount));
      sinwave[i] = p.abs(p.sin(amount));
    }
    focus = { x: p.width / 2, y: p.height * horizon };
    for (let i = 0; i < starCount; i++) stars.push({ x: p.random(-1, 1), y: p.random(-1, 1), z: p.random(0.05, 1) });
  };

  // Where its path is at a given time
  function weaveAt(time) {
    return {
      x: (p.noise(time * weaveSpeed) - 0.5) * 2 * weaveWide * p.width,
      y: (p.noise(time * weaveSpeed, 100) - 0.5) * 2 * weaveTall * p.height,
    };
  }

  // Where the camera is at a given time: wherever puts the tail where it's drifted to on the screen
  function cameraAt(time) {
    const tail = weaveAt(time - bodyTime);
    const x = tail.x - (p.noise(time * tailWander, 200) - 0.5) * 2 * tailWide * p.width;
    const y = tail.y - (p.noise(time * tailWander, 300) - 0.5) * 2 * tailTall * p.height;
    if (ringPull < 0.001) return { x, y };
    // As the worm nears the ring, the camera moves into line with it, so that it's in the middle of the screen
    const ring = weaveAt(ringMeets);
    return { x: p.lerp(x, ring.x, ringPull), y: p.lerp(y, ring.y, ringPull) };
  }

  // How high the camera's looking from: as the worm nears the ring it comes down right behind it, looking
  // along it into the middle of the screen
  function screenLevel() {
    return p.height * p.lerp(horizon, 0.5, ringPull);
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

  // Where a place along the worm shows on the screen (along: 0 at the tail, 1 at the head)
  function seenFromBehind(along, camera, time) {
    const closer = 1 / p.lerp(tailDistance, headDistance, along);
    const place = weaveAt(time - (1 - along) * bodyTime);
    return {
      x: p.width / 2 + (place.x - camera.x) * closer,
      y: screenLevel() + (cameraHeight() - (place.y - camera.y)) * closer,
      closer,
    };
  }

  // Where the ring shows on the screen. It's at a place on the worm's path, so the worm's going to go
  // right through its middle, and it moves with everything else as the camera does.
  function ringPlace(timeNow) {
    const camera = cameraAt(timeNow);
    const place = weaveAt(ringMeets);
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
    const hole = (p.width / 8) * bodyScale * ringSize * ring.closer / 2;
    const room = Math.max(hole - size / 2, hole * 0.1);
    const gap = Math.hypot(x - ring.x, y - ring.y);
    const keep = gap > 0 ? p.lerp(1, (room * Math.tanh(gap / room)) / gap, ringPull) : 1;
    return { x: ring.x + (x - ring.x) * keep, y: ring.y + (y - ring.y) * keep };
  }

  // The outline of a flower, drawn like the flowers are (see drawFlower()) but in white so that it shows on
  // the dark, slowly turning, with a circle in its middle for the worm to go through
  function drawRing(timeNow) {
    const ring = ringPlace(timeNow);
    const hole = ((p.width / 8) * bodyScale * ringSize * ring.closer) / 2;
    p.push();
    p.noFill();
    p.stroke(255, 255 * Math.min(1, (ringFrom - ringDistance) / 2));
    p.strokeWeight(1);
    p.circle(ring.x, ring.y, hole * 2);
    p.translate(ring.x, ring.y);
    p.rotate(p.millis() / 1000 * ringSpin);
    for (let i = 0; i < ringPetals; i++) {
      p.rotate(p.TWO_PI / ringPetals);
      p.ellipse(hole * (1 + ringPetalLength / 2), 0, hole * ringPetalLength, hole * ringPetalWidth);
    }
    p.pop();
  }

  function moveRing() {
    const seconds = Math.min(p.deltaTime / 1000, 0.1);
    waited += seconds;
    const time = p.millis() / 1000;
    if (ringDistance === null && waited > ringAfter) {
      ringMeets = time + ((ringFrom - tailDistance) / (headDistance - tailDistance) - 1) * bodyTime;
      ringDistance = ringFrom;
    }
    if (ringDistance !== null) {
      // As the worm goes along its path, the ring comes along it at just the same speed
      ringDistance = p.lerp(tailDistance, headDistance, 1 - (time - ringMeets) / bodyTime);
      if (ringDistance < ringThrough) {
        ringDistance = null;
        waited = 0;
      }
    }
    // The camera comes into line with it slowly as it nears the worm's head, and goes back once it's over
    const coming = ringDistance === null ? 0 : p.constrain((ringFrom - ringDistance) / (ringFrom - headDistance), 0, 1);
    ringPull += (coming * coming * (3 - 2 * coming) - ringPull) * (1 - Math.exp(-seconds / (ringDistance === null ? 1.5 : 0.5)));
  }

  function drawStars(time) {
    const heading = p.width / 2 + (weaveAt(time).x - cameraAt(time).x) / headDistance;
    focus.x += (heading - focus.x) * focusFollow;
    focus.y += (screenLevel() - focus.y) * focusFollow;
    const seconds = Math.min(p.deltaTime / 1000, 0.1);
    const reach = Math.max(p.width, p.height) * 0.5;
    for (const star of stars) {
      const fromX = focus.x + (star.x * reach) / star.z;
      const fromY = focus.y + (star.y * reach) / star.z;
      star.z -= starSpeed * seconds;
      if (star.z < 0.05) {
        star.x = p.random(-1, 1);
        star.y = p.random(-1, 1);
        star.z = 1;
        continue;
      }
      p.stroke(255, 255 * (1 - star.z));
      p.strokeWeight(1 + (1 - star.z));
      p.line(fromX, fromY, focus.x + (star.x * reach) / star.z, focus.y + (star.y * reach) / star.z);
    }
  }

  p.draw = () => {
    const time = p.millis() / 1000;
    p.background(0, p.mouseIsPressed ? 0 : p.lerp(50, ringWash, ringPull));
    moveRing();
    drawStars(time);
    p.strokeWeight(p.random(1, 2));

    const camera = cameraAt(time);

    let ringShown = ringDistance === null;

    // From behind, the nearest has to go on top, which means the head first and the tail last
    for (let i = length - 2; i >= 0; i--) {
      const along = i / length; // 0 at the tail, 1 at the head
      // Everything further away than the ring goes behind it, and everything nearer goes in front
      if (!ringShown && p.lerp(tailDistance, headDistance, along) < ringDistance) {
        drawRing(time);
        ringShown = true;
      }
      const seen = seenFromBehind(along, camera, time);
      p.stroke(p.random(100, 255) * sinwave[i], p.random(100, 255) * coswave[i], 255 - p.random(100, 255) * sinwave[i]);
      const diameter = p.sin(along * p.PI) * (p.width / 8) * bodyScale * seen.closer;
      let inView = keepOnScreen(seen.x, seen.y);
      if (ringDistance !== null && p.lerp(tailDistance, headDistance, along) > ringDistance) inView = insideRing(seen.x, seen.y, diameter, ringPlace(time));
      p.ellipse(inView.x, inView.y, diameter, diameter);
    }
    if (!ringShown) drawRing(time);
  };
}
