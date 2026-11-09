// "Riper Than Ripe" on the Luminin 1.0, simulated beside the close-up of it being played (lumininGif3_riper.mp4), so
// the screens in the video and the simulated ones show the same thing at the same moment.
//
// It runs the 1.0 sketch (~/Documents/Projects/Luminin/Processing/Sketches Pulled From Luminin 1.0/RiperThanRipe), which
// draws at 320 x 320 for the two 16 x 32 LED screens side by side. In the clip the jolt's held on nearly the whole time,
// so the screens are a full colour with one letter of RIPERTHANRIPE in each quarter, cycling, and the colour comes from
// how far the guitar's tipped (zTilt). There's no controller recording, so the tilt is read back out of the video:
// TRACK is the screens' colour in the clip, as a hue in degrees, fifteen times a second (measured once, by sampling the
// left screen in each frame and taking its most common saturated hue). It follows the video as it plays, pauses and loops.

const TRACK = [308,308,299,299,299,244,243,243,241,235,235,201,197,197,191,186,186,184,162,162,161,158,158,10,357,357,354,352,352,352,352,352,354,353,353,352,1,1,1,1,1,7,155,155,159,164,164,165,173,173,171,21,21,360,357,357,353,351,351,352,351,351,347,353,353,353,353,353,354,356,356,357,358,358,360,2,2,6,13,13,13,28,28,170,174,174,174,176,176,178,179,179,182,185,185,188,188,188,195,201,201,207,216,216,211,212,212,230,232,232,233,233,250,265,297,297,298,298,298,302,305,305,288,288,300,243,240,240,230,225,225,185,178,178,8,354,354,354,354,354,353,352,352,351,350,350,350,348,348,351,352,352,353,0,0,163,172,172,172,190,190,198,200,200,215,238,238,299,265,265,248,301,301,300,304,304,302,299,299,261,244,244,237,238,238,239,217,217,201,181,181,182,183,183,181,177,177,176,174,174,170,7,7,356,356,356,357,357,357,360,26,26,27,28,28,26,29,29,29,31,31,32,32,32,0,359,359,357,355,355,355,355,355,355,0,0,167,167,171,170,171,171,173];
const TRACK_RATE = 15; // Readings a second
const SKETCH_FPS = 10; // How many frames a second the Pi drew, roughly, judging by the clip; the sketch's own steps run at this
const SIZE = 320; // The sketch's canvas
const phrase1 = 'RIPERTHANRIPE';
const speed = 0.5;
const LETTER = { size: 102, top: 0.42, bottom: 0.83 }; // Letter size in pixels, and where the bottoms of the top and bottom rows sit, as shares of the height
// The screens as drawn: each LED a dot, glowing through the diffuser
const LEDS = { across: 16, down: 32, pitch: 10, gap: 22, margin: 12 };
const DOT = 3.6; // Each LED's radius, in pixels
const GLOW = 6; // How far the light spreads through the diffuser, in pixels
const GLOW_AMOUNT = 0.7;

for (const holder of document.querySelectorAll('.riper-sim')) {
  const video = holder.closest('.luminin-pair').querySelector('video');
  const canvas = holder.querySelector('canvas');
  const context = canvas.getContext('2d');
  const panelWidth = LEDS.across * LEDS.pitch;
  canvas.width = LEDS.margin * 2 + panelWidth * 2 + LEDS.gap;
  canvas.height = LEDS.margin * 2 + LEDS.down * LEDS.pitch;

  // The sketch's own canvas, pg in the original
  const pg = document.createElement('canvas');
  pg.width = pg.height = SIZE;
  const pgContext = pg.getContext('2d', { willReadFrequently: true });
  const glow = document.createElement('canvas');
  glow.width = canvas.width;
  glow.height = canvas.height;
  const glowContext = glow.getContext('2d');

  let interval1 = 0;
  let interval2 = 0;
  let lastStep = 0;
  let lastTime = 0;

  // Processing's HSB, out of 255 each and clamped as Processing clamps it, as a CSS colour
  const hsb = (h) => `hsl(${(Math.min(255, Math.max(0, h)) / 255) * 360} 100% 50%)`;
  const random = (a, b) => a + Math.random() * (b - a);

  // The screens' hue at this point in the video, eased between readings the short way round the colour wheel
  function hueAt(time) {
    const at = (time * TRACK_RATE) % TRACK.length;
    const i = Math.floor(at);
    const a = TRACK[i];
    const b = TRACK[(i + 1) % TRACK.length];
    const turn = ((b - a + 540) % 360) - 180;
    return (a + turn * (at - i) + 360) % 360;
  }

  // One frame of the original's riperThanRipeDraw(), with the jolt on. Its background hue is 250 - tiltColor / 2, which
  // is turned round here from the hue seen in the video; reds wrap to the top of Processing's hue range, where it clamps
  function step(time) {
    let seen = hueAt(time);
    if (seen < 15) seen += 360;
    const background = Math.min(255, (seen / 360) * 255);
    const letters = background - 100; // 150 - tiltColor / 2

    const counter1 = Math.floor(interval1);
    const counter2 = Math.floor(interval2);
    const letter1 = counter1;
    const letter2 = (counter2 + 1) % phrase1.length;
    const letter3 = (counter2 + 2) % phrase1.length;
    const letter4 = (counter2 + 3) % phrase1.length;

    pgContext.fillStyle = hsb(background + random(-20, 20));
    pgContext.fillRect(0, 0, SIZE, SIZE);
    pgContext.fillStyle = hsb(letters + random(-20, 20));
    // The original asks for size 180, but on the screens in the clip each letter is about a quarter of their height and
    // thin, sitting at about 19-42% and 60-83% of the way down, so they're sized and placed to match that
    pgContext.font = `${LETTER.size}px sans-serif`;
    pgContext.textAlign = 'center';
    pgContext.textBaseline = 'alphabetic';
    pgContext.fillText(phrase1[letter1], SIZE / 4, LETTER.top * SIZE);
    pgContext.fillText(phrase1[letter2], (3 * SIZE) / 4, LETTER.top * SIZE);
    pgContext.fillText(phrase1[letter3], SIZE / 4, LETTER.bottom * SIZE);
    pgContext.fillText(phrase1[letter4], (3 * SIZE) / 4, LETTER.bottom * SIZE);

    interval1 += speed + random(0, speed / 2);
    interval2 += speed + random(0, speed / 2);
    if (interval1 >= phrase1.length) interval1 = 0;
    if (interval2 >= phrase1.length) interval2 = 0;
  }

  // pg as the two screens: each LED takes the colour of the middle of its 10 x 10 square
  function show() {
    const pixels = pgContext.getImageData(0, 0, SIZE, SIZE).data;
    context.fillStyle = 'black';
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (let screen = 0; screen < 2; screen++) {
      const left = LEDS.margin + screen * (panelWidth + LEDS.gap);
      context.fillStyle = '#0b0b0b';
      context.fillRect(left, LEDS.margin, panelWidth, LEDS.down * LEDS.pitch);
      for (let x = 0; x < LEDS.across; x++) {
        for (let y = 0; y < LEDS.down; y++) {
          const sx = (screen * LEDS.across + x) * (SIZE / (LEDS.across * 2)) + 5;
          const sy = y * (SIZE / LEDS.down) + 5;
          const at = 4 * (Math.floor(sy) * SIZE + Math.floor(sx));
          context.fillStyle = `rgb(${pixels[at]} ${pixels[at + 1]} ${pixels[at + 2]})`;
          context.beginPath();
          context.arc(left + (x + 0.5) * LEDS.pitch, LEDS.margin + (y + 0.5) * LEDS.pitch, DOT, 0, Math.PI * 2);
          context.fill();
        }
      }
    }
    glowContext.clearRect(0, 0, glow.width, glow.height);
    glowContext.filter = `blur(${GLOW}px)`;
    glowContext.drawImage(canvas, 0, 0);
    context.globalCompositeOperation = 'lighter';
    context.globalAlpha = GLOW_AMOUNT;
    context.drawImage(glow, 0, 0);
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
  }

  let running = false;
  function loop() {
    if (!running) return;
    const time = video.currentTime;
    if (time < lastTime) interval1 = interval2 = 0; // The video's looped
    lastTime = time;
    // Steps at the sketch's frame rate while the video plays
    if (video.readyState >= 2 && !video.paused && performance.now() - lastStep >= 1000 / SKETCH_FPS) {
      lastStep = performance.now();
      step(time);
      show();
    }
    requestAnimationFrame(loop);
  }

  step(0);
  show();
  new IntersectionObserver(([entry]) => {
    const was = running;
    running = entry.isIntersecting;
    if (running && !was) requestAnimationFrame(loop);
  }).observe(canvas);
}
