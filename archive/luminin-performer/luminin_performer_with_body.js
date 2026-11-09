// The performer for the Luminin simulation (see luminin_sim.js): a little hand-drawn person in 3D, standing in front of
// the screens, which fill the background, holding a guitar with the controller on its headstock. The viewer moves the guitar, and what the
// controller would read comes from how its headstock actually moves, as the real one's accelerometer and gyroscope
// would see it: how far it's tipped (zTilt), sudden jerks down and up (downJolt, upJolt), swings toward the audience
// and back (forwardJolt, backJolt), how hard it's moving (totalAcc), how fast it's turning (gyroX, gyroY), and the
// little bit of noise that the guitar's own vibration puts into all of them, more while it's strummed. A screen beside
// them graphs those numbers as they come in.
//
// To play it: drag on the stage to move the guitar (up and down tips the neck, side to side swings it toward the
// audience and back), and flick to jolt it. Or the arrow keys: down and up jolt, left and right swing; space strums;
// enter, or clicking the controller, presses its button for the next song. The buttons under it do the same.
//
// The performer and guitar are one clean black silhouette; the only light on them is the controller's.

const W = 800;
const H = 500;
const GRAVITY = 981; // cm/s², to turn accelerations into g

// The camera, looking at the performer a little from the side and above
const TURN = -0.55; // How far the performer's turned to face the right (radians; 0 = facing the camera)
const CAMERA = { yaw: -0.38, pitch: 0.08, distance: 400, focal: 780, look: [20, 105, -20], x: W * 0.33, y: H * 0.47 };

// The guitar: where it's slung (its body's middle), and how it moves
const SLUNG = [-8, 100, 14];
const REST = { pitch: 0.35, yaw: 0 }; // The neck's usual angle up from level, and swing toward the audience (radians)
const LIMITS = { pitch: [-0.7, 1.3], yaw: [-0.9, 0.9] };
const DRAG = { pitch: 0.011, yaw: 0.009 }; // Radians for each pixel dragged, up and down and side to side
const SPRING = 90; // How stiffly it follows where it's moved to
const DAMPING = 0.55; // ...and how quickly it settles (1 = no bounce)
const NECK = 85; // How far the controller is from the guitar's middle, in cm
// The gestures, as a push lasting a moment (how strong, in cm/s² or radians/s², and for how long, in seconds)
const PUSH_TIME = 0.08;
const GESTURES = {
  down: { h: -3200, pitch: -14 },
  up: { h: 3200, pitch: 14 },
  forward: { yaw: 70 },
  back: { yaw: -70 },
};
// Its vibration: always a little, much more just after a strum, dying away
const HUM = 0.04; // In g
const STRUM = 0.9;
const STRUM_FADE = 2.5; // How quickly a strum dies away (per second)

// How the motion becomes the controller's numbers (roughly in the ranges the original sketches expect)
const JOLT_FROM = 0.4; // How many g it takes to count as a jolt
const JOLT_GAIN = 700; // ...and how much each g past that adds
const JOLT_HOLD = 0.85; // How much of a jolt is left each frame
const GYRO_SCALE = 0.1; // For each degree a second

const STAGE = '#121212'; // Behind everything, until the screens draw
const SILHOUETTE = '#000'; // The performer and guitar, black against the screens

export function createPerformer(holder, { onButton }) {
  const canvas = holder.querySelector('canvas');
  canvas.width = W;
  canvas.height = H;
  const stageContext = canvas.getContext('2d');
  let context = stageContext; // Where shapes are drawn: the stage, or the figure's mask while the performer's drawn
  // The performer and guitar are drawn first as a black mask, then laid on the stage in the chosen style (see figure())
  const mask = document.createElement('canvas');
  mask.width = W;
  mask.height = H;
  const maskContext = mask.getContext('2d', { willReadFrequently: true });

  const guitar = {
    pitch: REST.pitch, pitchV: 0, pitchTarget: REST.pitch,
    yaw: REST.yaw, yawV: 0, yawTarget: REST.yaw,
    h: 0, hV: 0, // How far it's moved up or down from where it's slung
  };
  let pushes = [];
  let vibration = 0;
  let strumTime = -10;
  let time = 0;
  let last = null; // The controller's last position and velocity
  let smoothAcc = [0, 0, 0];
  let controllerOnScreen = [0, 0];
  let readings = {};

  // ------------------------------------------------------------ Moving it
  const gesture = (name) => {
    if (name === 'strum') {
      vibration = STRUM;
      strumTime = time;
    } else if (name === 'button') onButton();
    else pushes.push({ ...GESTURES[name], until: time + PUSH_TIME });
  };

  let dragging = null;
  canvas.addEventListener('pointerdown', (event) => {
    const [x, y] = toCanvas(event);
    if (Math.hypot(x - controllerOnScreen[0], y - controllerOnScreen[1]) < 18) {
      gesture('button');
      return;
    }
    dragging = { x, y };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const [x, y] = toCanvas(event);
    guitar.pitchTarget = clamp(guitar.pitchTarget - (y - dragging.y) * DRAG.pitch, ...LIMITS.pitch);
    guitar.yawTarget = clamp(guitar.yawTarget + (x - dragging.x) * DRAG.yaw, ...LIMITS.yaw);
    dragging = { x, y };
  });
  const stop = () => (dragging = null);
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  const KEYS = { ArrowDown: 'down', ArrowUp: 'up', ArrowRight: 'forward', ArrowLeft: 'back', ' ': 'strum', Enter: 'button' };
  canvas.addEventListener('keydown', (event) => {
    if (!KEYS[event.key]) return;
    event.preventDefault();
    gesture(KEYS[event.key]);
  });
  for (const button of holder.querySelectorAll('[data-gesture]')) {
    button.addEventListener('click', () => gesture(button.dataset.gesture));
  }

  function toCanvas(event) {
    const box = canvas.getBoundingClientRect();
    return [((event.clientX - box.left) / box.width) * W, ((event.clientY - box.top) / box.height) * H];
  }

  // ------------------------------------------------------------ The physics, and what the controller reads
  function move(dt) {
    let force = { h: 0, pitch: 0, yaw: 0 };
    pushes = pushes.filter((push) => push.until > time);
    for (const push of pushes) for (const key in force) force[key] += push[key] || 0;
    const damping = 2 * Math.sqrt(SPRING) * DAMPING;
    const spring = (value, velocity, target, push) => velocity + (SPRING * (target - value) - damping * velocity + push) * dt;
    guitar.pitchV = spring(guitar.pitch, guitar.pitchV, guitar.pitchTarget, force.pitch);
    guitar.yawV = spring(guitar.yaw, guitar.yawV, guitar.yawTarget, force.yaw);
    guitar.hV = spring(guitar.h, guitar.hV, 0, force.h);
    guitar.pitch += guitar.pitchV * dt;
    guitar.yaw += guitar.yawV * dt;
    guitar.h += guitar.hV * dt;
    vibration = HUM + (vibration - HUM) * Math.exp(-STRUM_FADE * dt);
  }

  function read(dt, controller) {
    const { u } = frame();
    const position = add(slung(), scale(u, NECK));
    if (!last) last = { position, velocity: [0, 0, 0] };
    const velocity = scale(sub(position, last.position), 1 / dt);
    const acceleration = scale(sub(velocity, last.velocity), 1 / dt);
    last = { position, velocity };
    smoothAcc = smoothAcc.map((a, i) => a + (acceleration[i] - a) * 0.5);
    // In g, with the vibration's noise in it
    const g = smoothAcc.map((a) => a / GRAVITY + gaussian() * vibration);
    const jolt = (amount, now) => Math.min(2000, Math.max(Math.max(0, amount - JOLT_FROM) * JOLT_GAIN, now * JOLT_HOLD));
    controller.downJolt = jolt(-g[1], controller.downJolt || 0);
    controller.upJolt = jolt(g[1], controller.upJolt || 0);
    // Toward the audience is toward the camera, +z
    controller.forwardJolt = jolt(g[2], controller.forwardJolt || 0);
    controller.backJolt = jolt(-g[2], controller.backJolt || 0);
    controller.totalAcc += (Math.min(3, Math.hypot(...g)) - controller.totalAcc) * 0.3;
    controller.zTilt = Math.sin(guitar.pitch) + gaussian() * vibration * 0.3;
    const degrees = 180 / Math.PI;
    controller.gyroX = clamp(guitar.pitchV * degrees * GYRO_SCALE + gaussian() * vibration * 4, -30, 30);
    controller.gyroY = clamp(guitar.yawV * degrees * GYRO_SCALE + gaussian() * vibration * 4, -30, 30);
    for (const key of ['downJolt', 'upJolt', 'forwardJolt', 'backJolt']) if (controller[key] < 1) controller[key] = 0;
    readings = { ...controller, vibration };
  }

  // ------------------------------------------------------------ 3D
  const slung = () => add(SLUNG, [0, guitar.h, 0]);
  // The guitar's own directions: u along the neck, v across it (toward its top edge), n out of its front
  function frame() {
    const shake = vibration * 0.012;
    const p = guitar.pitch + gaussian() * shake;
    const w = guitar.yaw + gaussian() * shake;
    const u = [Math.cos(p) * Math.cos(w), Math.sin(p), Math.cos(p) * Math.sin(w)];
    const n = [-Math.sin(w), 0, Math.cos(w)];
    return { u, n, v: cross(n, u) };
  }
  const onGuitar = (a, b, c = 0) => {
    const { u, v, n } = frame();
    return add(add(add(slung(), scale(u, a)), scale(v, b)), scale(n, c));
  };

  function project([x, y, z]) {
    // The performer turns side-on to face the right, as in the clips, with the guitar's neck pointing right and away
    [x, z] = [x * Math.cos(TURN) + z * Math.sin(TURN), -x * Math.sin(TURN) + z * Math.cos(TURN)];
    const { yaw, pitch, distance, focal, look } = CAMERA;
    x -= look[0];
    y -= look[1];
    z -= look[2];
    const x1 = x * Math.cos(yaw) - z * Math.sin(yaw);
    const z1 = x * Math.sin(yaw) + z * Math.cos(yaw);
    const y2 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
    const z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch);
    const s = focal / (distance - z2);
    return [CAMERA.x + x1 * s, CAMERA.y - y2 * s, s];
  }

  // A two-bone limb from a joint to a target, bending toward the pole
  function limb(start, target, a, b, pole) {
    const toTarget = sub(target, start);
    const d = Math.min(a + b - 0.01, Math.hypot(...toTarget));
    const along = scale(toTarget, 1 / Math.hypot(...toTarget));
    const x = (a * a - b * b + d * d) / (2 * d);
    const y = Math.sqrt(Math.max(0, a * a - x * x));
    let side = sub(pole, scale(along, dot(pole, along)));
    side = scale(side, 1 / (Math.hypot(...side) || 1));
    return [add(add(start, scale(along, x)), scale(side, y)), add(start, scale(along, d))];
  }

  // ------------------------------------------------------------ Drawing shapes
  // A path through some points (on the canvas), filled and/or stroked
  function pen(points, { width = 1.5, close = false, fill = null, ink = null } = {}) {
    context.beginPath();
    context.moveTo(...points[0]);
    for (const point of points.slice(1)) context.lineTo(...point);
    if (close) context.closePath();
    if (fill) {
      context.fillStyle = fill;
      context.fill();
    }
    if (ink) {
      context.lineWidth = width;
      context.strokeStyle = ink;
      context.lineJoin = context.lineCap = 'round';
      context.stroke();
    }
  }
  // A rounded, tapering limb from a to b (in 3D), thick ra at a and rb at b, as one closed outline on the canvas
  function capsule(a, b, ra, rb, options) {
    const [ax, ay, as] = project(a);
    const [bx, by, bs] = project(b);
    const r1 = ra * as;
    const r2 = rb * bs;
    const angle = Math.atan2(by - ay, bx - ax);
    const points = [];
    for (let i = 0; i <= 12; i++) {
      const t = angle + Math.PI / 2 + (i / 12) * Math.PI; // Round the back of a
      points.push([ax + Math.cos(t) * r1, ay + Math.sin(t) * r1]);
    }
    for (let i = 0; i <= 12; i++) {
      const t = angle - Math.PI / 2 + (i / 12) * Math.PI; // ...and the front of b
      points.push([bx + Math.cos(t) * r2, by + Math.sin(t) * r2]);
    }
    pen(points, { close: true, ...options });
  }
  const pen3 = (points, options) => pen(points.map(project), options);
  function circle3(centre, radius, options) {
    const [x, y, s] = project(centre);
    const r = radius * s;
    const points = [];
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      points.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    pen(points, { ...options, close: true });
  }

  // ------------------------------------------------------------ Drawing
  function draw(screenImage, glowColour) {
    context.fillStyle = STAGE;
    context.fillRect(0, 0, W, H);

    // The screens fill the whole background, showing what the sketch is drawing (scaled to cover, cropping its sides)
    if (screenImage) {
      const fit = Math.max(W / screenImage.width, H / screenImage.height);
      const width = screenImage.width * fit;
      const height = screenImage.height * fit;
      context.drawImage(screenImage, (W - width) / 2, (H - height) / 2, width, height);
    }
    // The floor in front of them, falling into shadow, with the screens' light pooled on it
    const floorY = project([0, 0, 0])[1];
    const shade = context.createLinearGradient(0, floorY - 30, 0, H);
    shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
    context.fillStyle = shade;
    context.fillRect(0, floorY - 30, W, H - floorY + 30);
    context.save();
    context.globalAlpha = 0.25;
    context.filter = 'blur(14px)';
    context.fillStyle = glowColour;
    context.beginPath();
    context.ellipse(project([0, 0, 0])[0], floorY + 4, 90, 12, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context = maskContext;
    context.clearRect(0, 0, W, H);
    // The performer and their guitar, one black silhouette against the screens, dipping at the knees as the guitar goes
    // down and leaning into its swings
    const body = { fill: SILHOUETTE };
    const dip = Math.min(0, guitar.h) * 0.45 + Math.max(0, guitar.h) * 0.15;
    const lean = guitar.yaw * 10;
    // Ofer as at Baby's All Right (February 2024): standing fairly upright at a mic on a boom stand, singing, the
    // guitar's neck off to the right, in a t-shirt and dark jeans, with short messy hair
    const hipR = [-9, 93 + dip, 0];
    const hipL = [9, 93 + dip, 0];
    const shoulderR = [-18, 143 + dip, lean + 3];
    const shoulderL = [18, 143 + dip, lean + 3];
    const facing = -0.25 + guitar.yaw * 0.3; // Toward the mic
    const headAt = [2 + Math.sin(facing) * 3, 164 + dip, lean * 1.3 + 6];
    const footR = [-17, 4, 10];
    const footL = [16, 4, -8];
    const mouth = add(headAt, [Math.sin(facing) * 10, -5, Math.cos(facing) * 9]);
    // The mic stand: a heavy base, a pole, and a boom reaching in to the mouth
    const standAt = add(mouth, [Math.sin(facing) * 30, 0, Math.cos(facing) * 34]);
    const poleTop = [standAt[0], 128, standAt[2]];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      capsule([standAt[0], 1, standAt[2]], [standAt[0] + Math.cos(a) * 24, 0, standAt[2] + Math.sin(a) * 24], 1.4, 1.2, body);
    }
    capsule([standAt[0], 1, standAt[2]], poleTop, 1.3, 1.1, body);
    const micEnd = add(mouth, [Math.sin(facing) * 4, -1, Math.cos(facing) * 4]);
    capsule(poleTop, micEnd, 1.1, 0.9, body);
    capsule(micEnd, add(micEnd, scale(sub(micEnd, poleTop), 0.18)), 2.6, 2.2, body); // The mic
    // The far leg first, then the near one, in dark jeans, down to a shoe
    for (const [hip, foot, out, knees] of [[hipL, footL, 3, [0.2, 0, 1]], [hipR, footR, -3, [-0.1, 0, 1]]]) {
      const [knee, ankle] = limb(hip, foot, 46, 46, knees);
      capsule(hip, knee, 7.6, 6.2, body);
      capsule(knee, ankle, 6.2, 5.2, body);
      capsule(add(ankle, [0, -2, -4]), add(ankle, [out * 0.4, -2.5, 11]), 4.4, 3.9, body);
    }
    // The t-shirt
    pen3([
      add(hipR, [-4, 4, 1]), add(hipR, [-3, -3, 1]), add(hipL, [3, -3, -1]), add(hipL, [4, 4, -1]),
      add(shoulderL, [0, -16, -1]), add(shoulderL, [2, -2, 0]), add(shoulderL, [-3, 3, 0]), [6, 149 + dip, lean + 3], [-4, 149 + dip, lean + 3],
      add(shoulderR, [3, 3, 0]), add(shoulderR, [-2, -2, 0]), add(shoulderR, [0, -16, 1]),
    ], { ...body, close: true });
    capsule(add(scale(add(shoulderR, shoulderL), 0.5), [0, 3, 0]), add(headAt, [0, -6, -1]), 5.5, 5, body); // Neck
    const chin = add(headAt, [Math.sin(facing) * 5, -8, Math.cos(facing) * 4]);
    capsule(add(headAt, [-Math.sin(facing) * 1.5, 2, -2]), chin, 9.2, 6.3, body);
    capsule(add(headAt, [Math.sin(facing) * 7.5, -2, Math.cos(facing) * 6]), add(headAt, [Math.sin(facing) * 10, -4.5, Math.cos(facing) * 8]), 1.7, 1.1, body); // Nose
    // Short, messy hair: tufts hugging the top and back of the head
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tuft = add(headAt, [Math.cos(a) * 5.5 - Math.sin(facing) * 2, 3.5 + 1.5 * Math.sin(i * 2.3), Math.sin(a) * 5.5 - 3]);
      circle3(tuft, 3.8 + (i % 3) * 0.3, body);
    }
    for (const [x, z] of [[-2, -3], [2, -1], [0, -5]]) circle3(add(headAt, [x, 7, z]), 3.4, body);

    // The guitar
    const outline = [];
    for (let i = 0; i < 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      const pinch = 1 - 0.16 * Math.exp(-(Math.cos(t) ** 2) / 0.04);
      outline.push(onGuitar(-5 + 19 * Math.cos(t), Math.sin(t) * (15 - 2 * Math.cos(t)) * pinch));
    }
    pen3(outline, { close: true, fill: SILHOUETTE });
    pen3([onGuitar(13, -2.3, 0.5), onGuitar(62, -2, 0.5), onGuitar(62, 2, 0.5), onGuitar(13, 2.3, 0.5)], { close: true, fill: SILHOUETTE });
    pen3([onGuitar(62, -2.3, 0.5), onGuitar(77, -3.2, 0.5), onGuitar(79, 3.8, 0.5), onGuitar(62, 2.6, 0.5)], { close: true, fill: SILHOUETTE });
    const since = time - strumTime;

    // The controller on the headstock: a small box with a light in its front, glowing the colour of the screen
    const box = [];
    for (const a of [77, 85]) for (const b of [-4, 4]) for (const c of [0.5, 4.5]) box.push(onGuitar(a, b, c));
    for (const face of [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]]) {
      pen3(face.map((i) => box[i]), { close: true, fill: SILHOUETTE });
    }
    const light = project(onGuitar(81, 0, 4.6));
    controllerOnScreen = light;

    // The arms: the left hand on the neck, the right one over the strings, strumming
    const strumming = since < 0.25 ? Math.sin((since / 0.25) * Math.PI) * 6 : 0;
    const handL = onGuitar(44, -3.5, -1.5);
    const handR = onGuitar(-3, 3 - strumming, 5);
    for (const [shoulder, hand, pole] of [[shoulderR, handR, [-1, -0.8, -0.6]], [shoulderL, handL, [1, -1, -0.4]]]) {
      const [elbow, end] = limb(shoulder, hand, 31, 29, pole);
      capsule(shoulder, elbow, 4.3, 3.6, body);
      capsule(shoulder, add(shoulder, scale(sub(elbow, shoulder), 0.4)), 6.4, 5.8, body); // A t-shirt sleeve
      capsule(elbow, end, 3.6, 2.7, body);
      capsule(end, add(end, scale(sub(end, elbow), 0.25)), 3.3, 2.8, body); // A hand
    }
    context = stageContext;
    haze(glowColour);
    figure(holder.dataset.style || 'solid', glowColour);
    bloom(glowColour, light);
    graph();
  }

  // The controller's light, blooming hot white through the haze, brighter the harder it's moving
  function bloom(colour, light) {
    const c = stageContext;
    c.save();
    c.globalCompositeOperation = 'screen';
    const size = 18 + Math.min(3, readings.totalAcc || 0) * 8;
    const glow = c.createRadialGradient(light[0], light[1], 0, light[0], light[1], size * 2.5);
    glow.addColorStop(0, 'rgba(255, 255, 255, 1)');
    glow.addColorStop(0.12, 'rgba(255, 255, 255, 0.9)');
    glow.addColorStop(0.35, withAlpha(colour, 0.5));
    glow.addColorStop(1, withAlpha(colour, 0));
    c.fillStyle = glow;
    c.fillRect(light[0] - size * 2.5, light[1] - size * 2.5, size * 5, size * 5);
    c.restore();
  }

  // The figure's mask laid on the stage in a style (holder's data-style; trying them out):
  // solid, soft, neon, led, halftone, cutout, brush, hatch
  const scratch = document.createElement('canvas');
  scratch.width = W;
  scratch.height = H;
  const scratchContext = scratch.getContext('2d');
  function figure(style, colour) {
    const c = stageContext;
    c.save();
    if (style === 'soft') {
      // As through stage haze: blurred edges
      c.filter = 'blur(5px)';
      c.drawImage(mask, 0, 0);
    } else if (style === 'neon') {
      // Only its outline, glowing like a neon tube in the screens' colour
      scratchContext.clearRect(0, 0, W, H);
      scratchContext.save();
      for (let a = 0; a < 12; a++) scratchContext.drawImage(mask, Math.cos((a / 12) * Math.PI * 2) * 2.5, Math.sin((a / 12) * Math.PI * 2) * 2.5);
      scratchContext.globalCompositeOperation = 'destination-out';
      scratchContext.drawImage(mask, 0, 0);
      scratchContext.globalCompositeOperation = 'source-in';
      scratchContext.fillStyle = 'white';
      scratchContext.fillRect(0, 0, W, H);
      scratchContext.restore();
      c.fillStyle = 'rgba(0, 0, 0, 0.55)';
      c.globalCompositeOperation = 'source-over';
      c.drawImage(mask, 0, 0); // A dark body behind the tube
      c.globalAlpha = 0.6;
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      c.shadowColor = colour;
      c.shadowBlur = 16;
      c.drawImage(scratch, 0, 0);
      c.drawImage(scratch, 0, 0);
    } else if (style === 'led' || style === 'halftone') {
      // Made of lights on a grid, like the Luminin's own screens (led), or of printed dots sized by how much of each
      // cell it covers (halftone)
      const cell = style === 'led' ? 9 : 6;
      const pixels = maskContext.getImageData(0, 0, W, H).data;
      for (let y = cell / 2; y < H; y += cell) {
        for (let x = cell / 2; x < W; x += cell) {
          let cover = 0;
          for (const [dx, dy] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3], [0, 0]]) {
            cover += pixels[4 * (Math.floor(y + dy * cell) * W + Math.floor(x + dx * cell)) + 3] / 255 / 5;
          }
          if (cover < 0.05) continue;
          c.beginPath();
          if (style === 'led') {
            c.fillStyle = 'black';
            c.fillRect(x - cell / 2, y - cell / 2, cell, cell);
            c.fillStyle = 'rgba(255, 255, 255, 0.92)';
            c.arc(x, y, cell * 0.3 * Math.min(1, cover * 1.4), 0, Math.PI * 2);
          } else {
            c.fillStyle = 'black';
            c.arc(x, y, cell * 0.62 * Math.sqrt(cover), 0, Math.PI * 2);
          }
          c.fill();
        }
      }
    } else if (style === 'cutout') {
      // Cut from black paper: a shadow behind it, as if it stands a little off the screens
      c.globalAlpha = 0.45;
      c.filter = 'blur(3px)';
      c.drawImage(mask, 10, 8);
      c.filter = 'none';
      c.globalAlpha = 1;
      c.drawImage(mask, 0, 0);
      c.drawImage(mask, 0.6, 0.6);
    } else if (style === 'brush') {
      // Ink brushed on: ragged, dry-brush edges and a few spatters
      for (let i = 0; i < 6; i++) {
        c.globalAlpha = 0.35;
        c.drawImage(mask, Math.sin(time * 3 + i * 2.1) * 2.5, Math.cos(time * 2 + i * 1.3) * 2.5);
      }
      c.globalAlpha = 1;
      c.drawImage(mask, 0, 0);
      c.fillStyle = 'black';
      const pixels = maskContext.getImageData(0, 0, W, H).data;
      for (let i = 0; i < 260; i++) {
        const x = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * W;
        const y = (Math.sin(i * 78.233) * 12543.5453 % 1 + 1) % 1 * H;
        const near = pixels[4 * (Math.floor(y) * W + Math.floor(x)) + 3];
        if (!near) continue;
        c.beginPath();
        c.arc(x + ((i % 7) - 3) * 3, y + ((i % 5) - 2) * 3, 0.6 + (i % 4) * 0.5, 0, Math.PI * 2);
        c.fill();
      }
    } else if (style === 'hatch') {
      // Pen hatching, crossed, inside a drawn outline
      scratchContext.clearRect(0, 0, W, H);
      scratchContext.save();
      scratchContext.strokeStyle = 'black';
      scratchContext.lineWidth = 1.1;
      scratchContext.beginPath();
      for (let k = -H; k < W; k += 5) {
        scratchContext.moveTo(k, 0);
        scratchContext.lineTo(k + H, H);
        scratchContext.moveTo(k + H, 0);
        scratchContext.lineTo(k, H);
      }
      scratchContext.stroke();
      scratchContext.globalCompositeOperation = 'destination-in';
      scratchContext.drawImage(mask, 0, 0);
      // ...plus the outline: the mask spread a little, minus the mask
      scratchContext.globalCompositeOperation = 'source-over';
      const ring = document.createElement('canvas');
      ring.width = W;
      ring.height = H;
      const r = ring.getContext('2d');
      for (let k = 0; k < 8; k++) r.drawImage(mask, Math.cos((k / 8) * Math.PI * 2) * 1.6, Math.sin((k / 8) * Math.PI * 2) * 1.6);
      r.globalCompositeOperation = 'destination-out';
      r.drawImage(mask, 0, 0);
      scratchContext.drawImage(ring, 0, 0);
      scratchContext.restore();
      c.drawImage(scratch, 0, 0);
    } else {
      c.drawImage(mask, 0, 0);
    }
    c.restore();
  }

  // The room's haze, lit by the screens: a bloom of their light behind the performer, a couple of slow beams cutting
  // through it, and a wash of it over everything, as on stage at Baby's
  function haze(colour) {
    context.save();
    context.globalCompositeOperation = 'screen';
    const back = project([-30, 170, -60]);
    const bloom = context.createRadialGradient(back[0], back[1], 0, back[0], back[1], H * 0.7);
    bloom.addColorStop(0, withAlpha(colour, 0.55));
    bloom.addColorStop(1, withAlpha(colour, 0));
    context.fillStyle = bloom;
    context.fillRect(0, 0, W, H);
    // Beams from lights above, sweeping slowly
    context.filter = 'blur(10px)';
    for (const [from, sweep, speed] of [[0.18, 0.5, 0.21], [0.62, -0.4, 0.13]]) {
      const x = W * from;
      const swing = Math.sin(time * speed * Math.PI * 2) * 0.25 + sweep;
      context.fillStyle = withAlpha(colour, 0.22);
      context.beginPath();
      context.moveTo(x - 6, -10);
      context.lineTo(x + 6, -10);
      context.lineTo(x + Math.tan(swing + 0.12) * H, H);
      context.lineTo(x + Math.tan(swing - 0.12) * H, H);
      context.closePath();
      context.fill();
    }
    context.filter = 'none';
    context.fillStyle = withAlpha(colour, 0.12);
    context.fillRect(0, 0, W, H);
    context.restore();
  }

  // A screen on the right graphing the controller's numbers over the last few seconds, as the sketch receives them,
  // one trace each, newest on the right
  const TRACES = [
    ['zTilt', -1.3, 1.3],
    ['downJolt', 0, 2000],
    ['upJolt', 0, 2000],
    ['forwardJolt', 0, 2000],
    ['backJolt', 0, 2000],
    ['totalAcc', 0, 3],
    ['gyroX', -30, 30],
    ['gyroY', -30, 30],
    ['vibration', 0, 1],
  ];
  const HISTORY = 240; // Readings kept (four seconds at 60 a second)
  const history = TRACES.map(() => []);
  const GRAPH = { x: W - 214, y: 40, width: 200, lane: (H - 54) / 9 }; // Below the song's name
  function graph() {
    TRACES.forEach(([name], i) => {
      history[i].push(readings[name] || 0);
      if (history[i].length > HISTORY) history[i].shift();
    });
    const { x, y, width, lane } = GRAPH;
    const height = lane * TRACES.length;
    context.fillStyle = '#060807';
    context.fillRect(x, y, width, height);
    context.font = '11px Inconsolata, monospace';
    context.textBaseline = 'top';
    TRACES.forEach(([name, low, high], i) => {
      const top = y + i * lane;
      const toY = (value) => top + lane - 4 - ((clamp(value, low, high) - low) / (high - low)) * (lane - 8);
      // The lane, its zero line, and its name
      context.fillStyle = 'rgba(255, 255, 255, 0.05)';
      if (i % 2) context.fillRect(x, top, width, lane);
      context.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x, toY(0));
      context.lineTo(x + width, toY(0));
      context.stroke();
      context.fillStyle = 'rgba(255, 255, 255, 0.45)';
      context.fillText(name, x + 4, top + 3);
      // The trace
      const values = history[i];
      context.strokeStyle = 'rgba(150, 255, 190, 0.85)';
      context.lineWidth = 1.2;
      context.beginPath();
      values.forEach((value, j) => {
        const px = x + width - (values.length - 1 - j) * (width / (HISTORY - 1));
        j ? context.lineTo(px, toY(value)) : context.moveTo(px, toY(value));
      });
      context.stroke();
    });
    pen([[x, y], [x + width, y], [x + width, y + height], [x, y + height]], { close: true, width: 1, ink: 'rgba(255, 255, 255, 0.5)' });
  }

  return {
    // Moves the guitar on by dt seconds, fills in the controller's readings, and draws the stage with the screen showing
    // screenImage (a canvas)
    update(dt, controller, screenImage, glowColour) {
      dt = Math.min(dt, 1 / 30);
      time += dt;
      move(dt);
      read(dt, controller);
      draw(screenImage, glowColour);
    },
  };
}

// ------------------------------------------------------------ Little helpers
// An 'rgb(r g b)' colour (or any CSS colour with three numbers in it) with an alpha
function withAlpha(colour, alpha) {
  const [r = 255, g = 255, b = 255] = (colour.match(/[\d.]+/g) || []).map(Number);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, s) => a.map((x) => x * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp = (x, low, high) => Math.min(high, Math.max(low, x));
function gaussian() {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 1.4;
}
