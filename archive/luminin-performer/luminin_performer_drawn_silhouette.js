// The performer for the Luminin simulation (see luminin_sim.js): a person in 3D, side-on, playing a guitar with the
// controller on its headstock, in front of the screens, which fill the background. The viewer sets off one of five
// moves, each taken from a sprite sheet of it, and what the controller would read comes from how its headstock actually
// moves, as the real one's accelerometer and gyroscope would see it: how far it's tipped (zTilt), sudden jerks down and
// up (downJolt, upJolt), swings toward the audience and back (forwardJolt, backJolt), how hard it's moving (totalAcc),
// how fast it's turning (gyroX, gyroY), and the little bit of noise that the guitar's own hum puts into all of them. A
// screen beside it graphs those numbers as they come in. (An older performer, with a mic stand, is kept in
// archive/luminin-performer.)
//
// To play it, the buttons under it, or the keys: up and down jolt, left or right swings it back and forth, and W and S
// tilt it up and down for as long as they're held. Clicking the controller presses its button for the next song.
//
// The performer and guitar are one clean black silhouette; the only light on them is the controller's, which leaves a
// fading trail.

const W = 800;
const H = 500;
const GRAVITY = 981; // cm/s², to turn accelerations into g

// The camera, looking at the performer a little from the side and above
const TURN = 0.9; // How far the performer's turned to face the right (radians; 0 = facing the camera)
const CAMERA = { yaw: -0.38, pitch: 0.08, distance: 400, focal: 780, look: [20, 100, -20], x: W * 0.36, y: H * 0.5 };

// The performer, in their own terms: x toward their left (where the neck points), y up, z forward, in cm
const HIP = 93; // How high their hips are, standing

// A pose: the guitar's neck angle up from level (pitch) and swing toward the audience (yaw), where its middle is (at,
// from where it's slung, as the torso carries it), and how the body holds it: turned (twist, + turns the left shoulder
// back), leaning forward (lean) and to the side (roll), hips shifted sideways (sway, cm, + to their left), sunk at the
// knees (drop, cm), where the feet are ([x, z]), and how far the strumming hand has let go of the strings (free).
// Standing, playing:
const IDLE = {
  pitch: 0.4, yaw: 0.45, at: [0, 0, 0], twist: -0.24, lean: 0, roll: 0, sway: 0, drop: 0,
  footL: [16, -8], footR: [-17, 10], free: 0,
};
// The guitar held overhead, its neck pointing back, as at the top of the swings up and down
const OVERHEAD = { pitch: 0.12, yaw: -1.25, at: [4, 70, -4], twist: 0.2, lean: -0.12, drop: 0, footL: [16, 8], footR: [-17, -6] };
const LOW = { pitch: 0.05, yaw: 0.9, at: [0, -6, 8], twist: -0.3, lean: 0.3, drop: 14, footL: [18, 26], footR: [-16, -22] };

// The five moves, from the sprite sheets: each a list of poses (changes from standing) and when they're reached, in
// seconds. A held move stays at its last pose while it's held, and goes back to standing when it's let go.
const MOVES = {
  // Swing up: down into a crouch, the neck forward at the hip (1-3), rising with it (4, 5), thrust up overhead (6, 7),
  // and back down to playing (8)
  up: [
    { t: 0.22, ...LOW },
    { t: 0.42, ...LOW, drop: 15, pitch: 0.1 },
    { t: 0.6, pitch: 0.8, yaw: 0.6, at: [0, 6, 8], lean: 0.05, drop: 5, footL: [17, 14], footR: [-16, -12] },
    { t: 0.78, ...OVERHEAD },
    { t: 1.0, ...OVERHEAD, at: [4, 72, -6], yaw: -1.3 },
    { t: 1.3, pitch: 0.95, yaw: 0.5, at: [2, 18, 10], lean: -0.05, footL: [16, 0], footR: [-17, 4] },
    { t: 1.7 },
  ],
  // Swing down: wound up overhead (1, 2), then bent over, the neck down (3), into a kneeling lunge (4), bent over again
  // (5), and staying low in the lunge, the neck coming up (6-8)
  down: [
    { t: 0.28, ...OVERHEAD },
    { t: 0.45, ...OVERHEAD, at: [4, 72, -6] },
    { t: 0.64, pitch: -0.6, yaw: 0.7, at: [0, -6, 12], twist: -0.3, lean: 0.55, drop: 10, footL: [18, 22], footR: [-16, -20] },
    { t: 0.84, pitch: 0, yaw: 0.9, at: [0, -12, 12], twist: -0.3, lean: 0.3, drop: 30, footL: [20, 30], footR: [-16, -30] },
    { t: 1.02, pitch: -0.4, yaw: 0.8, at: [0, -8, 12], twist: -0.3, lean: 0.5, drop: 18, footL: [20, 28], footR: [-16, -28] },
    { t: 1.25, pitch: 0.15, yaw: 0.8, at: [0, -8, 10], twist: -0.3, lean: 0.3, drop: 22, footL: [20, 28], footR: [-16, -28] },
    { t: 1.55, pitch: 0.2, yaw: 0.75, at: [0, -8, 10], twist: -0.3, lean: 0.28, drop: 21, footL: [20, 28], footR: [-16, -28] },
    { t: 2.0 },
  ],
  // Sway, front on: the weight rocking from foot to foot, the guitar swinging toward the audience and back with it
  sway: [
    { t: 0.3, sway: 5, roll: -0.07, yaw: 0.85, twist: -0.36 },
    { t: 0.9, sway: -5, roll: 0.07, yaw: 0.05, twist: -0.1 },
    { t: 1.5, sway: 5, roll: -0.07, yaw: 0.85, twist: -0.36 },
    { t: 2.1, sway: -5, roll: 0.07, yaw: 0.05, twist: -0.1 },
    { t: 2.5 },
  ],
  // Tilt up and hold: leaning back, the neck pointing up high, a step forward to brace
  tiltUp: [
    { t: 0.2, pitch: 0.6, lean: -0.08, drop: 3 },
    { t: 0.55, pitch: 1.2, yaw: 0.4, at: [2, 12, 6], twist: -0.15, lean: -0.35, drop: 6, footL: [18, 14], footR: [-16, -12] },
  ],
  // Tilt down and hold: sinking forward into a lunge, the neck pointing down
  tiltDown: [
    { t: 0.25, pitch: 0.1, lean: 0.15, drop: 5, footL: [17, 8], footR: [-16, -6] },
    { t: 0.6, pitch: -0.45, yaw: 0.6, at: [0, -6, 12], twist: -0.3, lean: 0.4, drop: 16, footL: [20, 26], footR: [-16, -24] },
  ],
};
const HELD = new Set(['tiltUp', 'tiltDown']);
// The jolts each move is tied to: a move's motion only counts toward its own (a jolt up's catch at the top would
// otherwise read as a jolt down too); the tilts read only as zTilt, from the neck's angle
const TIED = { up: ['upJolt'], down: ['downJolt'], sway: ['forwardJolt', 'backJolt'], tiltUp: [], tiltDown: [] };
const LET_GO = 0.45; // How long a held move takes to get back to standing

// The guitar: where it's slung (its body's middle)
const SLUNG = [-8, 100, 14];
const NECK = 85; // How far the controller is from the guitar's middle, in cm
const HUM = 0.04; // Its vibration, in g

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

  const guitar = { pitch: IDLE.pitch, pitchV: 0, yaw: IDLE.yaw, yawV: 0 };
  const vibration = HUM;
  let time = 0;
  let last = null; // The controller's last position and velocity
  let smoothAcc = [0, 0, 0];
  let controllerOnScreen = [0, 0];
  let readings = {};
  let pose = { ...IDLE };
  let move = null; // The move playing: its name, when it began, its poses, and whether it's still held

  // ------------------------------------------------------------ Setting off the moves
  // Each starts from wherever the performer is, so one can cut into another
  function play(name, keys = MOVES[name]) {
    move = { name, start: time, held: HELD.has(name), keys: [{ ...pose, t: 0 }, ...keys.map((k) => ({ ...IDLE, ...k }))] };
  }
  function letGo(name) {
    if (move && move.name === name && move.held) play(null, [{ t: LET_GO }]);
  }

  canvas.addEventListener('pointerdown', (event) => {
    const [x, y] = toCanvas(event);
    if (Math.hypot(x - controllerOnScreen[0], y - controllerOnScreen[1]) < 18) onButton();
  });
  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'sway', ArrowRight: 'sway', w: 'tiltUp', s: 'tiltDown' };
  canvas.addEventListener('keydown', (event) => {
    const name = KEYS[event.key];
    if (!name) return;
    event.preventDefault();
    if (!event.repeat) play(name);
  });
  canvas.addEventListener('keyup', (event) => letGo(KEYS[event.key]));
  for (const button of holder.querySelectorAll('[data-move]')) {
    const name = button.dataset.move;
    if (HELD.has(name)) {
      button.addEventListener('pointerdown', () => play(name));
      for (const end of ['pointerup', 'pointerleave', 'pointercancel']) button.addEventListener(end, () => letGo(name));
      button.addEventListener('keydown', (event) => (event.key === ' ' || event.key === 'Enter') && !event.repeat && play(name));
      button.addEventListener('keyup', (event) => (event.key === ' ' || event.key === 'Enter') && letGo(name));
    } else button.addEventListener('click', () => play(name));
  }

  function toCanvas(event) {
    const box = canvas.getBoundingClientRect();
    return [((event.clientX - box.left) / box.width) * W, ((event.clientY - box.top) / box.height) * H];
  }

  // ------------------------------------------------------------ The pose, and the guitar it moves
  function step(dt) {
    if (move) {
      const t = time - move.start;
      const end = move.keys[move.keys.length - 1].t;
      if (t < end) pose = between(move.keys, t);
      else if (move.held) {
        // Holding: the last pose, breathing a little
        const k = move.keys[move.keys.length - 1];
        pose = { ...k, pitch: k.pitch + Math.sin(t * 2.6) * 0.03, lean: k.lean + Math.sin(t * 1.7) * 0.02 };
      } else {
        move = null;
        pose = { ...IDLE };
      }
    }
    guitar.pitchV = (pose.pitch - guitar.pitch) / dt;
    guitar.yawV = (pose.yaw - guitar.yaw) / dt;
    guitar.pitch = pose.pitch;
    guitar.yaw = pose.yaw;
  }

  // A point on the torso (given standing straight) as it's posed: leant forward and to the side from the hips, turned,
  // sunk, shifted, and carried over the feet. Hips turn less than the shoulders and don't lean (some = 0.4)
  function torso(p, some = 1) {
    const { lean, roll, twist, drop, sway, footL, footR } = pose;
    const l = some === 1 ? lean : 0;
    const r = some === 1 ? roll : 0;
    const w = twist * some;
    let [x, y, z] = [p[0], p[1] - HIP, p[2]];
    [y, z] = [y * Math.cos(l) - z * Math.sin(l), z * Math.cos(l) + y * Math.sin(l)];
    [x, y] = [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
    [x, z] = [x * Math.cos(w) + z * Math.sin(w), -x * Math.sin(w) + z * Math.cos(w)];
    return [x + sway, y + HIP - drop, z + (footL[1] + footR[1]) / 2];
  }
  const turned = (v) => sub(torso(v), torso([0, 0, 0]));

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
    const tied = (move && TIED[move.name]) || [];
    const jolt = (key, amount) => {
      const now = (controller[key] || 0) * JOLT_HOLD;
      controller[key] = tied.includes(key) ? Math.min(2000, Math.max(Math.max(0, amount - JOLT_FROM) * JOLT_GAIN, now)) : now;
    };
    jolt('downJolt', -g[1]);
    jolt('upJolt', g[1]);
    // Toward the audience is toward the camera, +z
    jolt('forwardJolt', g[2]);
    jolt('backJolt', -g[2]);
    controller.totalAcc += (Math.min(3, Math.hypot(...g)) - controller.totalAcc) * 0.3;
    controller.zTilt = Math.sin(guitar.pitch) + gaussian() * vibration * 0.3;
    const degrees = 180 / Math.PI;
    controller.gyroX = clamp(guitar.pitchV * degrees * GYRO_SCALE + gaussian() * vibration * 4, -30, 30);
    controller.gyroY = clamp(guitar.yawV * degrees * GYRO_SCALE + gaussian() * vibration * 4, -30, 30);
    for (const key of ['downJolt', 'upJolt', 'forwardJolt', 'backJolt']) if (controller[key] < 1) controller[key] = 0;
    readings = { ...controller, vibration };
  }

  // ------------------------------------------------------------ 3D
  const slung = () => torso(add(SLUNG, pose.at));
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
    const points = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      points.push([x + Math.cos(a) * radius * s, y + Math.sin(a) * radius * s]);
    }
    pen(points, { ...options, close: true });
  }
  // A two-bone limb from a joint toward a target, bending toward the pole: where its middle joint and end are
  function limb(start, target, a, b, pole) {
    const toTarget = sub(target, start);
    const d = Math.min(a + b - 0.01, Math.hypot(...toTarget));
    const along = scale(toTarget, 1 / (Math.hypot(...toTarget) || 1));
    const x = (a * a - b * b + d * d) / (2 * d);
    const y = Math.sqrt(Math.max(0, a * a - x * x));
    let side = sub(pole, scale(along, dot(pole, along)));
    side = scale(side, 1 / (Math.hypot(...side) || 1));
    return [add(add(start, scale(along, x)), scale(side, y)), add(start, scale(along, d))];
  }

  // The performer, one black silhouette with the guitar: legs in jeans down to shoes, a t-shirt over a torso with some
  // depth to it (so it still reads turned side-on), a head with short messy hair, and arms reaching to the guitar
  function performer(fill) {
    const { footL, footR, free } = pose;
    for (const [side, foot] of [[1, footL], [-1, footR]]) {
      const hip = torso([side * 9, HIP, 0], 0.4);
      const ankle = [foot[0], 4, foot[1]];
      const [knee, end] = limb(hip, ankle, 46, 46, add(turned([side * 0.2, 0, 1]), [0, 0, 0.3]));
      capsule(hip, knee, 7.6, 6.2, fill);
      capsule(knee, end, 6.2, 5.2, fill);
      capsule(add(end, [0, -2, -4]), add(end, [side * 1.2, -2.5, 11]), 4.4, 3.9, fill);
    }
    const shoulderR = torso([-18, 143, 3]);
    const shoulderL = torso([18, 143, 3]);
    capsule(torso([0, HIP + 2, 1]), torso([0, 136, 3]), 12, 13, fill); // The body under the shirt
    capsule(shoulderR, shoulderL, 6.5, 6.5, fill);
    pen3([
      [-13, 97, 1], [-12, 89, 1], [12, 89, -1], [13, 97, -1], [18, 127, 2], [20, 141, 3], [15, 146, 3], [6, 149, 3],
      [-4, 149, 3], [-15, 146, 3], [-20, 141, 3], [-18, 127, 4],
    ].map((p) => torso(p)), { ...fill, close: true });
    // The head looks a little less far round than the shoulders turn
    const facing = pose.twist * 0.55 - 0.1;
    const headAt = torso([2, 164, 6]);
    capsule(add(scale(add(shoulderR, shoulderL), 0.5), [0, 3, 0]), add(headAt, [0, -6, -1]), 5.5, 5, fill); // Neck
    const chin = add(headAt, [Math.sin(facing) * 5, -8, Math.cos(facing) * 4]);
    capsule(add(headAt, [-Math.sin(facing) * 1.5, 2, -Math.cos(facing) * 2]), chin, 9.2, 6.3, fill);
    capsule(add(headAt, [Math.sin(facing) * 7.5, -2, Math.cos(facing) * 6]), add(headAt, [Math.sin(facing) * 10, -4.5, Math.cos(facing) * 8]), 1.7, 1.1, fill); // Nose
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tuft = add(headAt, [Math.cos(a) * 5.5 - Math.sin(facing) * 2, 3.5 + 1.5 * Math.sin(i * 2.3), Math.sin(a) * 5.5 - Math.cos(facing) * 3]);
      circle3(tuft, 3.8 + (i % 3) * 0.3, fill);
    }
    for (const [x, z] of [[-2, -3], [2, -1], [0, -5]]) circle3(add(headAt, [x, 7, z]), 3.4, fill);
    // The arms: the left hand on the neck, the right over the strings (strumming), or thrown back off them
    const handL = onGuitar(44, -3.5, -1.5);
    const handR = mix(onGuitar(-3, 3, 5), torso([-26, 84, -22]), free);
    for (const [shoulder, hand, pole] of [[shoulderR, handR, [-1, -0.8, -0.6]], [shoulderL, handL, [1, -1, -0.4]]]) {
      const [elbow, end] = limb(shoulder, hand, 31, 29, turned(pole));
      capsule(shoulder, elbow, 4.3, 3.6, fill);
      capsule(shoulder, add(shoulder, scale(sub(elbow, shoulder), 0.4)), 6.4, 5.8, fill); // A t-shirt sleeve
      capsule(elbow, end, 3.6, 2.7, fill);
      capsule(end, add(end, scale(sub(end, elbow), 0.25)), 3.3, 2.8, fill); // A hand
    }
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

    context = maskContext;
    context.clearRect(0, 0, W, H);
    // The performer and guitar, a black silhouette against the screens: an offset body, its neck, and a headstock with
    // six tuners along its top edge, the controller on its tip
    const fill = { fill: SILHOUETTE };
    performer(fill);
    pen3(smooth(OFFSET_BODY).map(([a, b]) => onGuitar(a, b)), { ...fill, close: true });
    pen3([onGuitar(12, -2.7, 0.5), onGuitar(63, -2.2, 0.5), onGuitar(63, 2.2, 0.5), onGuitar(12, 2.7, 0.5)], { ...fill, close: true });
    pen3(smooth(HEADSTOCK).map(([a, b]) => onGuitar(a, b, 0.5)), { ...fill, close: true });
    for (let i = 0; i < 6; i++) {
      const at = 66 + i * 2.4;
      capsule(onGuitar(at, 3.2 + i * 0.25, 0.5), onGuitar(at, 5.6 + i * 0.25, 0.5), 0.7, 0.9, fill);
    }
    const box = [];
    for (const a of [78, 86]) for (const b of [-4, 4]) for (const c of [0.5, 4.5]) box.push(onGuitar(a, b, c));
    for (const face of [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]]) {
      pen3(face.map((i) => box[i]), { ...fill, close: true });
    }
    const light = project(onGuitar(82, 0, 4.6));
    controllerOnScreen = light;

    context = stageContext;
    haze(glowColour);
    trail(glowColour, light);
    figure(holder.dataset.style || 'solid', glowColour);
    bloom(glowColour, light);
    graph();
  }

  // The controller's light leaves a fading trail as it moves, like a brush on the screens
  const TRAIL = 40; // How many frames it lasts
  const trailPoints = [];
  function trail(colour, light) {
    trailPoints.push(light.slice(0, 2));
    if (trailPoints.length > TRAIL) trailPoints.shift();
    const c = stageContext;
    c.save();
    c.globalCompositeOperation = 'screen';
    c.lineCap = 'round';
    for (let i = 1; i < trailPoints.length; i++) {
      const age = i / trailPoints.length; // 1 = newest
      c.strokeStyle = withAlpha(colour, age * 0.7);
      c.lineWidth = 2 + age * 7;
      c.beginPath();
      c.moveTo(...trailPoints[i - 1]);
      c.lineTo(...trailPoints[i]);
      c.stroke();
    }
    c.restore();
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
      step(dt);
      read(dt, controller);
      draw(screenImage, glowColour);
    },
  };
}

// ------------------------------------------------------------ The guitar's shape
// In the guitar's own terms: along the neck (toward the headstock) and across it (toward its top edge), in cm, measured
// from the middle of the body. An offset body, like Ofer's: the waist set off-centre, the lower horn reaching further
const OFFSET_BODY = [
  [12, 3], [15, 7], [18, 11], [17, 14], [12, 14.5], [5, 12.5], [-2, 11.8], [-10, 14], [-18, 16], [-25, 14.5],
  [-29.5, 8], [-30.5, 0], [-29.5, -8], [-25, -14.5], [-17, -16.8], [-9, -15], [-3, -12.2], [3, -12.8], [10, -15],
  [16, -15], [19, -12], [16, -7.5], [12.5, -3.5],
];
const HEADSTOCK = [[62, -2.3], [70, -2.8], [79, -3.1], [81, -1], [80.5, 3.6], [76, 4.8], [69, 4.4], [65, 3.2], [62, 2.3]];
// A closed outline smoothed through its points (Catmull-Rom)
function smooth(points, steps = 5) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const [p0, p1, p2, p3] = [-1, 0, 1, 2].map((k) => points[(i + k + points.length) % points.length]);
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  return out;
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
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
// Where a series of poses is at time t: each number (and each number in a list) on a smooth curve through them
function between(keys, t) {
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const [p0, p1, p2, p3] = [i - 1, i, i + 1, i + 2].map((k) => keys[clamp(k, 0, keys.length - 1)]);
  const u = clamp((t - p1.t) / (p2.t - p1.t), 0, 1);
  const curve = (a, b, c, d) => 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
  const out = {};
  for (const key in p1) {
    out[key] = Array.isArray(p1[key]) ? p1[key].map((_, j) => curve(p0[key][j], p1[key][j], p2[key][j], p3[key][j])) : curve(p0[key], p1[key], p2[key], p3[key]);
  }
  return out;
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp = (x, low, high) => Math.min(high, Math.max(low, x));
function gaussian() {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 1.4;
}
