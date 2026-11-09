// A little worm that comes up out of the home hole on the art page, when the page has been come to through the
// wormhole (see the end of src/wormhole/spiral-worm.js, which leaves a note in sessionStorage saying so). It's the
// spiral worm, small: a line coiling round and round its body, in black on the white page. It rises out of the hole,
// and then wafts smoothly about the screen, on and on. It's drawn on a canvas of its own over the page, which lets
// presses through.

const noteKey = 'wormArrives';
const wait = 0.8; // How many seconds the hole has to have been still, on the screen, before it comes out
const waitLongest = 6; // ...or how many seconds after the hole's first been put in place, as long as it's on the screen
const rise = 1.6; // How many seconds it takes to rise out of the hole
const riseHeight = 0.22; // How far up it rises, as a share of the screen's height
const settle = 3; // How many seconds it takes to ease into wafting about, once it's out
const wanderWide = 0.3; // How far it wafts from side to side, as a share of the screen's width
const wanderTall = 0.18; // ...and up and down, as a share of the screen's height
const wanderSpeed = 0.35; // How quickly it wafts about (smaller = slower)
const length = 0.9; // How long its body is, in seconds of where its head's been
const fat = 4; // How fat it is in the middle, in pixels
const turns = 9; // How many times its line coils round its body
const steps = 16; // How many points on its line for each turn
const ripple = 0.1; // How much its coil swells and shrinks along it, slowly (0 = an even coil)
// Its coil's noisy, like the spiral worm's in the wormhole (see the rose in src/wormhole/spiral-worm.js): each point
// comes partly from the last one, by a different amount every time, held in close so it never spikes
const ticks = 12; // How many times a second the noise changes
const roseRoughness = 0.8; // How much of the last point goes into the next is 1 / this, times the noise (under 1 = wilder)
const roseNoise = 0.05; // How quickly the noise changes from one point to the next
const roseReach = 2; // How far out it can go, compared to the body's width there
// It fades toward the horizon like the crowd (see distanceFade in art_walk.js)
const distanceFade = 0.4; // How quickly it fades the higher up the screen it goes (smaller = slower)
const segment = 8; // How many points of its line are drawn at one fade

// Smooth noise between 0 and 1, from a number and a row (each row is different)
const hash = (n) => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};
const noise = (x, row) => {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash(i + row * 157.3);
  const b = hash(i + 1 + row * 157.3);
  return a + (b - a) * u;
};

function noteWasLeft() {
  try {
    const left = sessionStorage.getItem(noteKey) === '1';
    sessionStorage.removeItem(noteKey);
    return left;
  } catch {
    return false;
  }
}

const ease = (amount) => amount * amount * (3 - 2 * amount);

if (noteWasLeft() && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const canvas = document.createElement('canvas');
  // As big as the window, whatever its pixels (it has more of them on a sharp screen, so it'd be shown bigger otherwise)
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:2;pointer-events:none';
  document.body.append(canvas);
  const context = canvas.getContext('2d');
  const density = window.devicePixelRatio || 1;
  const fit = () => {
    canvas.width = innerWidth * density;
    canvas.height = innerHeight * density;
  };
  fit();
  addEventListener('resize', fit);

  const link = document.querySelector('.art-hole[href="/"]'); // The home hole, which goes back to the wormhole on the front page
  const mouth = link?.querySelector('.art-hole-mouth');
  let stillSince = null; // Since when the hole's been still, on the screen
  let lastSeen = null; // Where the hole was last frame
  let placedAt = null; // When the hole was first put in its place
  let outAt = null; // When it started coming out
  let saidOut = false; // Has it told the art page it's out, so the mouse can walk on? (see waitForWorm() in art_walk.js)
  let from = null; // Where the hole is now. Everything's measured from there, so it stays with the hole as the view moves.

  // Where its head is, this many seconds after it started coming out: rising out of the hole, then wafting about,
  // smoothly, on a path that loops without quite repeating
  const headAt = (t) => {
    if (t <= 0) return { ...from };
    const up = from.y - ease(Math.min(1, t / rise)) * riseHeight * innerHeight;
    if (t <= rise) return { x: from.x, y: up };
    const w = (t - rise) * wanderSpeed;
    const into = ease(Math.min(1, (t - rise) / settle));
    return {
      x: from.x + (Math.sin(w * 0.9) + 0.5 * Math.sin(w * 2.1 + 1)) * wanderWide * innerWidth * into,
      y: up + (Math.sin(w * 1.3 + 2) * 0.8 + 0.4 * Math.sin(w * 2.7)) * wanderTall * innerHeight * into,
    };
  };

  const frame = (now) => {
    const seconds = now / 1000;
    // Where the hole is, from where the art page puts its link: its middle, and half its height above the link's top,
    // which is where its ground is (see placeHoles() in art_walk.js). The link's somewhere else until the art page has
    // painted its crowd, which takes a while.
    if (!link || !link.style.left) return requestAnimationFrame(frame);
    // Home's behind the mouse, off the bottom of the screen, so it comes up from below the bottom (see .art-hole-behind)
    const behind = link.classList.contains('art-hole-behind');
    from = behind ? { x: parseFloat(link.style.left), y: innerHeight + 12 } : { x: parseFloat(link.style.left), y: parseFloat(link.style.top) - parseFloat(mouth.style.height) / 2 };
    // Wait until it's on the screen and has stopped moving, since the view moves as the mouse walks on
    if (outAt === null) {
      placedAt ??= seconds;
      const onScreen = from.y > 0 && (behind || from.y < innerHeight) && from.x > 0 && from.x < innerWidth;
      const moved = lastSeen ? Math.hypot(from.x - lastSeen.x, from.y - lastSeen.y) : Infinity;
      lastSeen = from;
      stillSince = onScreen && moved < 0.5 ? (stillSince ?? seconds) : null;
      const ready = (stillSince !== null && seconds - stillSince >= wait) || (onScreen && seconds - placedAt >= waitLongest);
      if (!ready) return requestAnimationFrame(frame);
      outAt = seconds;
    }
    const t = seconds - outAt;
    if (!saidOut && t >= rise) {
      saidOut = true;
      dispatchEvent(new Event('worm-out'));
    }

    context.setTransform(density, 0, 0, density, 0, 0);
    context.clearRect(0, 0, innerWidth, innerHeight);
    context.save();
    // While it's coming out, none of it's drawn below the hole
    if (t < rise + length) {
      context.beginPath();
      context.rect(0, 0, innerWidth, from.y);
      context.clip();
    }
    context.strokeStyle = 'black';
    context.lineWidth = 1.3;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    const total = turns * steps * 4; // More points than a plain coil, for the noise
    const row = Math.floor(t * ticks); // The row of noise it's using now
    let offX = 0;
    let offY = 0;
    const points = [];
    for (let i = 0; i <= total; i++) {
      const along = i / total; // 0 at the tail, 1 at the head
      const middle = headAt(t - (1 - along) * length);
      const radius = Math.sin(along * Math.PI) * fat * (1 + ripple * Math.sin(i * 0.09 - t * 2));
      const angle = (i / (steps * 4)) * Math.PI * 2 + t * 1.5; // Turning slowly round itself
      // Each point partly from the last one, by a different amount every time
      const wobble = noise(i * roseNoise, row);
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
      points.push({ x: middle.x + offX, y: middle.y + offY });
    }
    // Drawn a bit at a time, each bit fainter the higher up the screen it is, toward the horizon
    for (let i = 0; i < points.length - 1; i += segment) {
      const end = Math.min(points.length - 1, i + segment);
      const near = Math.max(0.001, Math.min(1, points[i].y / innerHeight));
      context.globalAlpha = Math.min(1, Math.pow(near, distanceFade));
      context.beginPath();
      context.moveTo(points[i].x, points[i].y);
      for (let j = i + 1; j <= end; j++) context.lineTo(points[j].x, points[j].y);
      context.stroke();
    }
    context.restore();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
