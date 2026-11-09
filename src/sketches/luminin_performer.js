// The performer for the Luminin simulation (see luminin_sim.js), playing a guitar with the controller on its headstock,
// in front of the screens, which fill the background. It's one of three (the stage's data-performer):
//
//   guitar   (the default) just the guitar: Ofer's Fender Mustang silhouette with the Luminin on its headstock (made by
//            tools/mustang/mustang.py, into public/sprites/mustang-luminin.png, with where its controller and middle
//            are in luminin_mustang.json), swung as a whole about its middle
//   sprites  Ofer's sprite sheets, played frame by frame (cut out by tools/performer-sprites/build.py,
//            into public/sprites/luminin-performer.png, with each frame's place, feet and headstock in
//            luminin_performer_frames.json)
//   puppet   the 3D puppet (luminin_puppet.js), drawn as a flat black silhouette, moving smoothly through its poses;
//            set aside for now, as it didn't look right
//
// For now there are the jolts down and up, and three held moves: the tilts down and up, and side to side (the guitar
// does them all; the sprites and the puppet only the jolt down). What the controller would
// read comes from how the headstock moves, as the real one's accelerometer and gyroscope would see it: how far it's
// tipped (zTilt), sudden jerks down and up (downJolt, upJolt), swings toward the audience and back (forwardJolt,
// backJolt), how hard it's moving (totalAcc), how fast it's turning (gyroX, gyroY), and the little bit of noise the
// guitar's own hum puts into all of them. A screen beside it graphs those numbers as they come in. (Earlier performers
// are kept in archive/luminin-performer.)
//
// To play it, the buttons under it, or the keys: the down and up arrows jolt it, and S and W tilt it down and up for
// as long as they're held, and A or D swings it side to side. Clicking the controller presses its button for the next pattern
// (as do the next pattern button, and N).

import SHEET from './luminin_performer_frames.json';
import MUSTANG from './luminin_mustang.json';

const W = 800;
const H = 540;
const GRAVITY = 981; // cm/s², to turn accelerations into g
const FEET = [260, 480]; // Where the performer stands on the stage
const STANDING = 330; // ...and how tall, in pixels

// The jolts each move is tied to: a move's motion only counts toward its own (the catch at the bottom of a jolt down
// would otherwise read as a jolt up, and the dip before a jolt up as a jolt down). With moves combined, any of those
// playing counts
const TIED = { down: ['downJolt'], up: ['upJolt'], tiltDown: [], tiltUp: [], sway: ['forwardJolt', 'backJolt'] };
const HELD_MOVES = new Set(['tiltDown', 'tiltUp', 'sway']); // Kept up for as long as they're held

const HUM = 0.04; // The guitar's vibration, in g
const NECK = 85; // How far the controller is from the guitar's middle, in cm (for how fast it's swinging)

// How the motion becomes the controller's numbers (roughly in the ranges the original sketches expect)
const JOLT_FADE = 0.98; // How much of a jolt is left each time round the controller's loop
const JOLT_LOOP = 0.05; // ...which comes round every 50 ms
const GYRO_LERP = 30; // How slowly the firmware's gyro readings follow (a 30th of the way each loop)
const GYRO_NOISE = 3; // The gyroscope's own jitter, in degrees a second

const SHOW_STAGE = false; // The stage (the screens behind the performer, and the room's haze and beams), off for now
// (the canvas is see-through)
const SHOW_GRAPH = false; // The graph of the controller's readings, off for now
const SHOW_LIGHT = false; // The controller's light blooming and leaving a trail, off for now
// The Luminin's screens: two panels of 16 x 32 LEDs, side by side (making the 32 x 32 the sketch is sampled at), each
// behind a sheet of paper
const PANEL = { across: 16, down: 32 };
const SKETCH_SIZE = 0.7; // The sketch's size, for each pixel of the space left of the screens
const GUITAR_SIZE = 1.0; // ...and the guitar's length
const LAYOUT = layoutFor(W, H);

export function createPerformer(holder, { onButton }) {
  const canvas = holder.querySelector('canvas');
  canvas.width = W;
  canvas.height = H;
  const context = canvas.getContext('2d');
  // The performer is drawn first on its own, then laid on the stage in the chosen style (see figure())
  const mask = document.createElement('canvas');
  mask.width = W;
  mask.height = H;
  const maskContext = mask.getContext('2d', { willReadFrequently: true });

  const vibration = HUM;
  let time = 0;
  let last = null; // The controller's last position and velocity
  let smoothAcc = [0, 0, 0];
  let lastTurn = null;
  let lerpedGyro = [0, 0];
  const jolts = {}; // The jolts as the controller keeps them, before they're rounded to send
  let controllerOnScreen = [0, 0];
  let readings = {};

  // The body: each can set off a move, move on in time, draw itself, and say where the controller is
  let body = null;
  const which = holder.dataset.performer || 'guitar';
  if (which === 'puppet') import('./luminin_puppet.js').then(({ createPuppet }) => (body = puppetBody(createPuppet)));
  else if (which === 'sprites') body = spriteBody(() => time);
  else body = guitarBody(() => time);

  function play(name) {
    if (body) body.play(name);
  }
  canvas.addEventListener('pointerdown', (event) => {
    const [x, y] = toCanvas(event);
    if (Math.hypot(x - controllerOnScreen[0], y - controllerOnScreen[1]) < 22) onButton();
  });
  function letGo(name) {
    if (body && body.letGo) body.letGo(name);
  }
  const KEYS = { ArrowDown: 'down', ArrowUp: 'up', s: 'tiltDown', w: 'tiltUp', a: 'sway', d: 'sway' };
  // The keys work whenever the stage is on screen (not while typing, or with a modifier held), and light up their
  // button while they're down
  let onScreen = false;
  new IntersectionObserver((entries) => (onScreen = entries.some((entry) => entry.isIntersecting))).observe(canvas);
  const buttonFor = (name) => holder.querySelector(`[data-move="${name}"]`);
  const ours = (event) =>
    onScreen && !event.metaKey && !event.ctrlKey && !event.altKey && !event.target.closest?.('input, textarea, select, [contenteditable]');
  addEventListener('keydown', (event) => {
    const name = KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (!name || !ours(event)) return;
    event.preventDefault();
    buttonFor(name)?.classList.add('pressed');
    if (!event.repeat) play(name);
  });
  addEventListener('keyup', (event) => {
    const name = KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (!name) return;
    buttonFor(name)?.classList.remove('pressed');
    letGo(name);
  });
  // The next pattern: the button, or N (as clicking the controller does)
  holder.querySelector('[data-action="next"]')?.addEventListener('click', () => onButton());
  addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() !== 'n' || event.repeat || !ours(event)) return;
    event.preventDefault();
    const button = holder.querySelector('[data-action="next"]');
    button?.classList.add('pressed');
    setTimeout(() => button?.classList.remove('pressed'), 150);
    onButton();
  });
  for (const button of holder.querySelectorAll('[data-move]')) {
    const name = button.dataset.move;
    if (HELD_MOVES.has(name)) {
      // Held for as long as the button's pressed
      button.addEventListener('pointerdown', () => play(name));
      for (const end of ['pointerup', 'pointerleave', 'pointercancel']) button.addEventListener(end, () => letGo(name));
      button.addEventListener('keydown', (event) => (event.key === ' ' || event.key === 'Enter') && !event.repeat && play(name));
      button.addEventListener('keyup', (event) => (event.key === ' ' || event.key === 'Enter') && letGo(name));
    } else button.addEventListener('click', () => play(name));
  }

  // Where the pointer is over the stage (null when it's off it), for the labels
  let hover = null;
  canvas.addEventListener('pointermove', (event) => (hover = toCanvas(event)));
  // A tap points at a part too, and stays pointing until the next one (a touch leaves as soon as it lifts)
  canvas.addEventListener('pointerdown', (event) => (hover = toCanvas(event)));
  canvas.addEventListener('pointerleave', (event) => event.pointerType === 'mouse' && (hover = null));

  function toCanvas(event) {
    const box = canvas.getBoundingClientRect();
    return [((event.clientX - box.left) / box.width) * W, ((event.clientY - box.top) / box.height) * H];
  }

  // ------------------------------------------------------------ Just the guitar
  function guitarBody(now) {
    const LENGTH = LAYOUT.guitar.length; // How long the guitar is on the stage, in pixels
    const HELD = LAYOUT.guitar.middle; // Where its middle is on the stage
    const s = LENGTH / MUSTANG.width;
    const perCm = MUSTANG.perCm * s;
    // Poses: how far its neck is tipped up (radians), how far it's lifted (px), and how far it's twisted round toward
    // the audience (radians, about its bridge, as the player turns)
    const REST = { angle: 0.25, lift: 0, twist: 0 };
    // Moves combine: each adds its own motion to the resting pose, and any number can play at once
    // Jolts: poses (as changes from resting) and when they're reached (s), played once
    const JOLTS = {
      // Wound up, the neck lifting, then brought down hard, past level, and back up to where it was held
      down: [
        { t: 0.14, angle: 0.3, lift: 14 },
        { t: 0.32, angle: -0.7, lift: -20 },
        { t: 0.44, angle: -0.57, lift: -14 },
        { t: 0.78, angle: -0.15, lift: -4 },
        { t: 1.15, angle: 0, lift: 0 },
      ],
      // Dipped, the neck dropping, then thrust up hard, well past where it was held, and settling back
      up: [
        { t: 0.14, angle: -0.25, lift: -10 },
        { t: 0.32, angle: 0.75, lift: 18 },
        { t: 0.44, angle: 0.63, lift: 14 },
        { t: 0.78, angle: 0.15, lift: 4 },
        { t: 1.15, angle: 0, lift: 0 },
      ],
    };
    // Held moves: eased in (slowly, well under the firmware's jolt speed) for as long as they're held, and eased out
    // when they're let go. The tilts lower or raise the neck and sway a little there; the twist turns the guitar
    // toward the audience and away in a slow rhythm
    const HOLDS = {
      tiltDown: { angle: -0.8, lift: -8, easeIn: 0.7, easeOut: 0.6 },
      tiltUp: { angle: 0.65, lift: 6, easeIn: 0.7, easeOut: 0.6 },
      sway: { twist: 1.0, period: 3.2, easeIn: 0.8, easeOut: 0.6 },
    };
    // How far the neck can go, combined, so the headstock stays on the stage (it eases into these)
    const ANGLE_LIMITS = [-0.6, 1.25];
    // The twist in 3D: the guitar's a flat board turned about an upright line through its bridge, seen in perspective
    // from the audience
    const EYE = 200 * perCm; // How far away it's seen from (px)
    // The controller's glow: how bright its LEDs look at their dimmest (0-1), how far their light reaches (for each
    // pixel of the guitar's length), and how strong it is at the middle
    const GLOW = { floor: 0.6, reach: 0.3, strength: 0.75 };
    // Drawn once at its size on the stage, so it isn't shrunk from the full image every frame
    const image = document.createElement('canvas');
    const source = new Image();
    source.onload = () => {
      image.width = Math.round(MUSTANG.width * s);
      image.height = Math.round(MUSTANG.height * s);
      const c = image.getContext('2d');
      c.imageSmoothingQuality = 'high';
      c.drawImage(source, 0, 0, image.width, image.height);
    };
    source.src = `${import.meta.env.BASE_URL}sprites/mustang-luminin-dark.png`; // Its LEDs unlit, to light them here

    let pose = { ...REST };
    let jolts = []; // Those playing: their name and when they began
    const holds = {}; // Each held move's: whether it's held, how far in it is (0-1), and when it began
    // Where a point on the guitar (in the image as drawn at its size on the stage) is on the stage: tipped up in its own
    // plane about its middle, twisted about the bridge, then seen in perspective
    const tipped = (u, v) => {
      const dx = u - MUSTANG.pivot[0] * s;
      const dy = v - MUSTANG.pivot[1] * s;
      const [c, n] = [Math.cos(-pose.angle), Math.sin(-pose.angle)];
      return [dx * c - dy * n, dx * n + dy * c];
    };
    const project = (u, v) => {
      const [px, py] = tipped(u, v);
      const bridge = tipped(MUSTANG.bridge[0] * s, MUSTANG.bridge[1] * s)[0];
      const x = bridge + (px - bridge) * Math.cos(pose.twist);
      const z = (px - bridge) * Math.sin(pose.twist); // Toward the audience
      const f = EYE / (EYE - z);
      return [HELD[0] + x * f, HELD[1] - pose.lift + py * f];
    };
    const onStage = ([x, y]) => project(x * s, y * s);
    // A jolt's change from resting at time t into it, on a smooth curve through its poses
    function joltAt(keys, t) {
      keys = [{ t: 0, angle: 0, lift: 0 }, ...keys];
      let i = 0;
      while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
      const k = [i - 1, i, i + 1, i + 2].map((j) => keys[clamp(j, 0, keys.length - 1)]);
      const u = clamp((t - k[1].t) / (k[2].t - k[1].t), 0, 1);
      return { angle: curve(k.map((p) => p.angle), u), lift: curve(k.map((p) => p.lift), u) };
    }
    const ease = (x) => x * x * (3 - 2 * x);
    return {
      play(name) {
        if (JOLTS[name]) jolts.push({ name, start: now() });
        else if (HOLDS[name]) {
          const hold = (holds[name] ||= { amount: 0, start: now() });
          if (!hold.amount) hold.start = now();
          hold.held = true;
        }
      },
      letGo(name) {
        if (holds[name]) holds[name].held = false;
      },
      update(dt) {
        const t = now();
        const change = { angle: 0, lift: 0, twist: 0 };
        jolts = jolts.filter((j) => t - j.start < JOLTS[j.name].at(-1).t);
        for (const j of jolts) {
          const c = joltAt(JOLTS[j.name], t - j.start);
          change.angle += c.angle;
          change.lift += c.lift;
        }
        for (const [name, hold] of Object.entries(holds)) {
          const spec = HOLDS[name];
          hold.amount = clamp(hold.amount + (hold.held ? dt / spec.easeIn : -dt / spec.easeOut), 0, 1);
          const e = ease(hold.amount);
          const since = t - hold.start;
          if (name === 'sway') change.twist += Math.sin((since / spec.period) * Math.PI * 2) * spec.twist * e;
          else {
            change.angle += (spec.angle + Math.sin(since * 2.4) * 0.025) * e;
            change.lift += (spec.lift + Math.sin(since * 1.7) * 1.5) * e;
          }
        }
        pose = {
          angle: softClamp(REST.angle + change.angle, ...ANGLE_LIMITS),
          lift: REST.lift + change.lift,
          twist: REST.twist + change.twist,
        };
      },
      // The moves playing (a held one until it's eased all the way out)
      moves: () => [...jolts.map((j) => j.name), ...Object.keys(holds).filter((name) => holds[name].amount > 0)],
      // Where the guitar's body and its controller are when it's at rest (for their names)
      spots() {
        const now = pose;
        pose = { ...REST };
        const controller = onStage(MUSTANG.controller);
        const top = onStage([MUSTANG.pivot[0] - MUSTANG.width * 0.05, MUSTANG.pivot[1] - MUSTANG.height * 0.42]);
        pose = now;
        return { guitar: top, controller };
      },
      // The controller's own LEDs, lit as its firmware lights them, and the glow they cast
      lights(c) {
        if (!image.width) return;
        const colours = controllerLeds(time, jolts.downJolt || 0, readings.zTilt || 0);
        const centre = onStage(MUSTANG.controller);
        const near = (onStage([MUSTANG.controller[0] + 10, MUSTANG.controller[1]])[0] - centre[0]) / (10 * s) || 1;
        const radius = MUSTANG.ledRadius * s * Math.max(0.4, Math.abs(near));
        // As they look: an LED's colour stays vivid even when it's driven dimly (as the firmware drives them at rest),
        // getting brighter with its drive
        const looks = colours.map((rgb) => {
          const level = Math.max(...rgb) / 255;
          const full = rgb.map((v) => (level ? v / level : 0));
          return full.map((v) => Math.round(v * (GLOW.floor + (1 - GLOW.floor) * level)));
        });
        const level = looks.reduce((sum, rgb) => sum + Math.max(...rgb), 0) / looks.length / 255;
        c.save();
        c.globalCompositeOperation = 'lighter';
        // The glow they cast: as coloured as the LEDs together, reaching further and brighter the brighter they are
        const mean = [0, 1, 2].map((k) => Math.round(looks.reduce((sum, rgb) => sum + rgb[k], 0) / looks.length));
        const reach = LENGTH * GLOW.reach * (0.7 + 0.6 * level);
        const glow = c.createRadialGradient(...centre, 0, ...centre, reach);
        glow.addColorStop(0, `rgba(${mean.join(', ')}, ${GLOW.strength})`);
        glow.addColorStop(0.25, `rgba(${mean.join(', ')}, ${GLOW.strength * 0.45})`);
        glow.addColorStop(1, `rgba(${mean.join(', ')}, 0)`);
        c.fillStyle = glow;
        c.fillRect(centre[0] - reach, centre[1] - reach, reach * 2, reach * 2);
        // The LEDs, each with a little bloom
        c.shadowBlur = radius * 4;
        MUSTANG.leds.forEach((at, i) => {
          const [x, y] = onStage(at);
          c.fillStyle = c.shadowColor = `rgb(${looks[i].join(', ')})`;
          c.beginPath();
          c.arc(x, y, radius, 0, Math.PI * 2);
          c.fill();
        });
        c.restore();
      },
      // In thin upright strips, each placed where it's projected, so the near end grows and the far end shrinks
      draw(c) {
        if (!image.width) return;
        const strips = 60;
        const w = image.width / strips;
        c.save();
        for (let i = 0; i < strips; i++) {
          const u0 = i * w;
          const u1 = Math.min(image.width, u0 + w + 0.75); // A little overlap, so no seams show
          const [p00, p10, p01] = [project(u0, 0), project(u1, 0), project(u0, image.height)];
          const a = (p10[0] - p00[0]) / (u1 - u0);
          const b = (p10[1] - p00[1]) / (u1 - u0);
          const cc = (p01[0] - p00[0]) / image.height;
          const d = (p01[1] - p00[1]) / image.height;
          c.setTransform(a, b, cc, d, p00[0] - a * u0, p00[1] - b * u0);
          c.drawImage(image, u0, 0, u1 - u0, image.height, u0, 0, u1 - u0, image.height);
        }
        c.restore();
      },
      controller() {
        const at = onStage(MUSTANG.controller);
        // In cm: y up, z forward (toward the headstock, as it's held level)
        return { position: [0, (H - at[1]) / perCm, at[0] / perCm], onCanvas: at, pitch: pose.angle, yaw: pose.twist };
      },
    };
  }

  // ------------------------------------------------------------ The 3D puppet
  function puppetBody(createPuppet) {
    const puppet = createPuppet({ width: W, height: H, feet: FEET, standing: STANDING });
    return {
      play: (name) => puppet.play(name),
      update: (dt) => puppet.update(dt),
      moves: () => (puppet.move ? [puppet.move] : []),
      draw: (c) => c.drawImage(puppet.canvas, 0, 0),
      controller() {
        const { room, onCanvas, pitch, yaw } = puppet.controller();
        return { position: room, onCanvas, pitch, yaw };
      },
    };
  }

  // ------------------------------------------------------------ The sprite sheets
  function spriteBody(now) {
    const CM = 178 / SHEET.standing; // cm per pixel, the performer standing 178 cm tall
    // The moves: which of the sheet's frames play, in order, and how long each is shown (s)
    const IDLE = { name: 'down', index: 7 }; // Low in the lunge the jolt down ends in, playing
    const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
    const MOVES = { down: { frames: range(0, 7), each: 0.14 } };
    const atlas = new Image();
    atlas.src = `${import.meta.env.BASE_URL}sprites/luminin-performer.png`;

    // What's shown: a list of frames, each with the move that put it there, when it starts and how long it lasts
    let steps = [{ ...IDLE, move: null, t: 0, d: Infinity }];
    const frameOf = (step) => SHEET.moves[step.name][step.index];
    const current = () => {
      let i = 0;
      while (i < steps.length - 1 && steps[i + 1].t <= now()) i++;
      return i;
    };
    // Drops what hasn't been shown yet, keeping a few frames back for the readings to run smoothly on from
    function cut() {
      const i = current();
      steps = steps.slice(Math.max(0, i - 2), i + 1);
      const shown = steps[steps.length - 1];
      shown.d = Math.max(0, now() - shown.t);
    }
    function queue(move, indices, each) {
      const end = steps[steps.length - 1];
      let t = Math.max(now(), end.t + end.d);
      for (const index of indices) {
        steps.push({ move, name: move, index, t, d: each });
        t += each;
      }
    }
    function rest() {
      const end = steps[steps.length - 1];
      steps.push({ ...IDLE, move: null, t: end.t + end.d, d: Infinity });
    }

    const place = (frame) => [FEET[0] - frame.anchor[0], FEET[1] - frame.anchor[1]];
    const tipOnStage = (frame) => {
      const [x, y] = place(frame);
      return [x + frame.tip[0], y + frame.tip[1]];
    };
    // The neck's angle, up from pointing forward (to the right)
    const angleOf = (frame) => Math.atan2(-frame.neck[1], frame.neck[0]);

    // The frames only say where the headstock is now and then; the controller itself moves smoothly between them, on
    // a curve through each frame's headstock, reached halfway through the time that frame's shown
    function headstockAt(t) {
      const knots = steps.map((s) => ({ t: s.t + Math.min(s.d, 0.2) / 2, frame: frameOf(s) }));
      let i = 0;
      while (i < knots.length - 1 && knots[i + 1].t <= t) i++;
      const k = [i - 1, i, i + 1, i + 2].map((j) => knots[clamp(j, 0, knots.length - 1)]);
      if (k[2] === k[1] || t <= k[1].t) return { position: tipOnStage(k[1].frame), angle: angleOf(k[1].frame) };
      const u = clamp((t - k[1].t) / (k[2].t - k[1].t), 0, 1);
      const tips = k.map((knot) => tipOnStage(knot.frame));
      // Angles unwrapped, so a swing over the head goes the short way round
      const angles = [angleOf(k[0].frame)];
      for (let j = 1; j < 4; j++) {
        let a = angleOf(k[j].frame);
        while (a - angles[j - 1] > Math.PI) a -= Math.PI * 2;
        while (a - angles[j - 1] < -Math.PI) a += Math.PI * 2;
        angles.push(a);
      }
      return { position: [0, 1].map((d) => curve(tips.map((p) => p[d]), u)), angle: curve(angles, u) };
    }

    return {
      // Each starts at once, cutting into whatever's playing
      play(name) {
        if (!MOVES[name]) return;
        cut();
        queue(name, MOVES[name].frames, MOVES[name].each);
        rest();
      },
      update() {
        // Frames long past aren't needed any more
        const i = current();
        if (i > 3) steps = steps.slice(i - 3);
      },
      moves: () => (steps[current()].move ? [steps[current()].move] : []),
      draw(c) {
        const frame = frameOf(steps[current()]);
        if (atlas.complete && atlas.naturalWidth) c.drawImage(atlas, frame.x, frame.y, frame.w, frame.h, ...place(frame), frame.w, frame.h);
      },
      controller() {
        const { position: onStage, angle } = headstockAt(now());
        // In cm, from the feet: y up, z forward (the way the performer faces, toward the audience); swinging forward
        // and back counted round the guitar's middle
        const forward = (onStage[0] - FEET[0]) * CM;
        return {
          position: [0, (FEET[1] - onStage[1]) * CM, forward],
          onCanvas: tipOnStage(frameOf(steps[current()])),
          pitch: angle,
          yaw: forward / NECK,
        };
      },
    };
  }

  // ------------------------------------------------------------ The controller's readings
  function read(dt, controller) {
    const { position, pitch, yaw } = body.controller();
    if (!last) last = { position, velocity: [0, 0, 0] };
    const velocity = scale(sub(position, last.position), 1 / dt);
    const acceleration = scale(sub(velocity, last.velocity), 1 / dt);
    last = { position, velocity };
    smoothAcc = smoothAcc.map((a, i) => a + (acceleration[i] - a) * 0.5);
    // In g, with the vibration's noise in it
    const g = smoothAcc.map((a) => a / GRAVITY + gaussian() * vibration);
    controller.totalAcc += (Math.min(3, Math.hypot(...g)) - controller.totalAcc) * 0.3;
    controller.zTilt = Math.sin(pitch) + gaussian() * vibration * 0.3;
    // Turning, in degrees a second, as the gyroscope reads it: tipping the neck up and down (x), and swinging it
    // toward the audience and back (y)
    const turn = [pitch, yaw];
    const degrees = 180 / Math.PI;
    const gyro = lastTurn ? turn.map((a, i) => ((a - lastTurn[i]) / dt) * degrees + gaussian() * GYRO_NOISE) : [0, 0];
    lastTurn = turn;
    // ...and sent smoothed, as the firmware does (lerped a 30th of the way to each new reading every 50 ms)
    const follow = 1 - Math.pow(1 - 1 / GYRO_LERP, dt / JOLT_LOOP);
    lerpedGyro = lerpedGyro.map((g, i) => g + (gyro[i] - g) * follow);
    [controller.gyroX, controller.gyroY] = lerpedGyro;
    // The jolts, as the controller's firmware works them out (20250602_Luminin_Controller.ino): turning faster than
    // a threshold sets the jolt to how fast, which then fades by 2% each time round its loop (every 50 ms), so a jolt
    // lasts a good while after the motion's over (half gone in 1.7 s). Its value's sent rounded
    const tied = body.moves().flatMap((move) => TIED[move] || []);
    const fade = Math.pow(JOLT_FADE, dt / JOLT_LOOP);
    const latch = (key, speed, over) => {
      jolts[key] = (jolts[key] || 0) * fade;
      if (tied.includes(key) && speed > over) jolts[key] = speed;
      controller[key] = Math.round(jolts[key]);
    };
    latch('downJolt', -gyro[0], 350);
    latch('upJolt', gyro[0], 350);
    latch('forwardJolt', gyro[1], 400);
    latch('backJolt', -gyro[1], 400);
    readings = { ...controller, vibration };
  }

  // ------------------------------------------------------------ The Luminin's screens
  // Each LED takes the one pixel of the sketch at its spot (as the Fadecandy server does), and shines through paper:
  // a hot spot where it sits, its light spreading into its neighbours', and the paper's own grain and fibres over it
  const panel = LAYOUT.screens;
  const pw = Math.round(panel.width);
  const ph = Math.round(panel.height);
  const ledSize = pw / PANEL.across;
  const make = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return [c, c.getContext('2d')];
  };
  const [leds, ledContext] = make(PANEL.across * 2, PANEL.down);
  const [lit, litContext] = make(pw, ph);
  const [hot, hotContext] = make(pw, ph);
  // Where the hot spots are: a soft white spot on each LED
  const [spots, spotContext] = make(pw, ph);
  spotContext.fillStyle = 'black';
  spotContext.fillRect(0, 0, pw, ph);
  for (let i = 0; i < PANEL.across; i++) {
    for (let j = 0; j < PANEL.down; j++) {
      const [x, y] = [(i + 0.5) * ledSize, (j + 0.5) * ledSize];
      const glow = spotContext.createRadialGradient(x, y, 0, x, y, ledSize * 0.75);
      glow.addColorStop(0, 'white');
      glow.addColorStop(0.35, 'rgba(255, 255, 255, 0.55)');
      glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
      spotContext.fillStyle = glow;
      spotContext.fillRect(x - ledSize, y - ledSize, ledSize * 2, ledSize * 2);
    }
  }
  // The paper: warm white, with a cloudy unevenness, grain, and fibres
  const [paper, paperContext] = make(pw, ph);
  {
    paperContext.fillStyle = 'rgb(238, 230, 214)';
    paperContext.fillRect(0, 0, pw, ph);
    const [cloud, cloudContext] = make(8, 16);
    const cloudy = cloudContext.createImageData(8, 16);
    for (let i = 0; i < cloudy.data.length; i += 4) {
      const v = 200 + Math.random() * 55;
      cloudy.data.set([v, v, v, 255], i);
    }
    cloudContext.putImageData(cloudy, 0, 0);
    paperContext.globalCompositeOperation = 'multiply';
    paperContext.imageSmoothingEnabled = true;
    paperContext.filter = `blur(${ledSize * 0.8}px)`;
    paperContext.drawImage(cloud, -ledSize, -ledSize, pw + ledSize * 2, ph + ledSize * 2);
    paperContext.filter = 'none';
    paperContext.globalCompositeOperation = 'source-over';
    const grain = paperContext.getImageData(0, 0, pw, ph);
    for (let i = 0; i < grain.data.length; i += 4) {
      const g = (Math.random() - 0.5) * 18;
      for (let k = 0; k < 3; k++) grain.data[i + k] += g;
    }
    paperContext.putImageData(grain, 0, 0);
    for (let i = 0; i < (pw * ph) / 90; i++) {
      const [x, y] = [Math.random() * pw, Math.random() * ph];
      const a = Math.random() * Math.PI * 2;
      const length = 3 + Math.random() * 12;
      paperContext.strokeStyle = Math.random() < 0.5 ? 'rgba(255, 255, 255, 0.35)' : 'rgba(120, 100, 70, 0.12)';
      paperContext.lineWidth = 0.4 + Math.random() * 0.6;
      paperContext.beginPath();
      paperContext.moveTo(x, y);
      paperContext.quadraticCurveTo(x + Math.cos(a + 0.6) * length * 0.5, y + Math.sin(a + 0.6) * length * 0.5, x + Math.cos(a) * length, y + Math.sin(a) * length);
      paperContext.stroke();
    }
  }
  const UNLIT = 0.07; // How much the paper shows with its LEDs off (lit faintly by the room)
  const SPREAD = 0.7; // How far each LED's light spreads through the paper, for each LED's width
  const HOT = 0.6; // How bright the hot spots are

  function screens(sketch) {
    // The LEDs' colours
    if (sketch) {
      const { width, height } = sketch.image;
      const pixels = sketch.image.getContext('2d').getImageData(0, 0, width, height).data;
      const image = ledContext.createImageData(PANEL.across * 2, PANEL.down);
      const [stepX, stepY] = [width / (PANEL.across * 2), height / PANEL.down];
      for (let y = 0; y < PANEL.down; y++) {
        for (let x = 0; x < PANEL.across * 2; x++) {
          const from = 4 * (Math.floor((y + 0.5) * stepY) * width + Math.floor((x + 0.5) * stepX));
          image.data.set([pixels[from], pixels[from + 1], pixels[from + 2], 255], 4 * (y * PANEL.across * 2 + x));
        }
      }
      ledContext.putImageData(image, 0, 0);
    } else ledContext.clearRect(0, 0, leds.width, leds.height);
    // What the screens show, for the page's background to light up with (see luminin_background.js)
    window.dispatchEvent(new CustomEvent('luminin:leds', { detail: leds }));

    for (let side = 0; side < 2; side++) {
      const c = litContext;
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      c.filter = 'none';
      c.fillStyle = 'black';
      c.fillRect(0, 0, pw, ph);
      c.globalAlpha = UNLIT;
      c.drawImage(paper, 0, 0);
      c.globalAlpha = 1;
      // The light spreading through the paper
      c.globalCompositeOperation = 'lighter';
      c.imageSmoothingEnabled = true;
      c.filter = `blur(${ledSize * SPREAD}px)`;
      c.drawImage(leds, side * PANEL.across, 0, PANEL.across, PANEL.down, 0, 0, pw, ph);
      // ...and each LED's hot spot
      hotContext.globalCompositeOperation = 'source-over';
      hotContext.imageSmoothingEnabled = false;
      hotContext.drawImage(leds, side * PANEL.across, 0, PANEL.across, PANEL.down, 0, 0, pw, ph);
      hotContext.globalCompositeOperation = 'multiply';
      hotContext.drawImage(spots, 0, 0);
      c.filter = `blur(${ledSize * 0.15}px)`;
      c.globalAlpha = HOT;
      c.drawImage(hot, 0, 0);
      // The paper's texture over it all
      c.filter = 'none';
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'multiply';
      c.drawImage(paper, 0, 0);
      const x = panel.xs[side];
      context.drawImage(lit, x, panel.y, panel.width, panel.height);
      context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      context.lineWidth = 1.5;
      context.strokeRect(x - 0.75, panel.y - 0.75, panel.width + 1.5, panel.height + 1.5);
    }
  }

  // ------------------------------------------------------------ The Raspberry Pi, and labels on hover
  // The Pi that runs the sketch, drawn small to the left of it, as a line drawing like the page's
  // system diagram. Pointing at a part shows the data's way to or from it on the stage (as the diagram has it): from
  // the controller over the air to the receiver and on to the Pi, from the Pi to the sketch it runs, and from the Pi to
  // the screens. What it is, and what's flowing, are written over the stage, so they don't cover any of it
  const PI_BOARD = (() => {
    const { x, y, size } = LAYOUT.sketch;
    const gap = x; // Left of the sketch
    const w = Math.round(gap * 0.6);
    const h = Math.round(w * (56 / 85)); // A Raspberry Pi's 85 x 56 mm
    return { x: Math.round((gap - w) / 2), y: Math.round(y + (size - h) / 2), w, h };
  })();
  function raspberryPi() {
    const { x, y, w, h } = PI_BOARD;
    const u = w / 85; // A mm
    const c = context;
    c.save();
    c.fillStyle = 'rgba(8, 8, 10, 0.9)';
    c.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    c.lineWidth = 1;
    // The board, its corners rounded, and its four mounting holes
    c.beginPath();
    c.roundRect(x, y, w, h, 3 * u);
    c.fill();
    c.stroke();
    for (const [hx, hy] of [[3.5, 3.5], [61.5, 3.5], [3.5, 52.5], [61.5, 52.5]]) {
      c.beginPath();
      c.arc(x + hx * u, y + hy * u, 1.4 * u, 0, Math.PI * 2);
      c.stroke();
    }
    // The GPIO header along the top edge: two rows of twenty pins
    for (let i = 0; i < 20; i++) {
      for (let j = 0; j < 2; j++) c.strokeRect(x + (7 + i * 2.54) * u, y + (1 + j * 2.54) * u, 1.6 * u, 1.6 * u);
    }
    // The processor, and the USB and Ethernet ports hanging off the right edge
    c.strokeRect(x + 22 * u, y + 20 * u, 15 * u, 15 * u);
    for (const [py, ph] of [[2, 15], [21, 15], [39, 16]]) c.strokeRect(x + 70 * u, y + py * u, 17 * u, ph * u);
    c.restore();
  }
  const NAMES = {
    controller: ['controller', 'motion sensor and 8 x 4 LEDs on the headstock'],
    pi: ['raspberry pi', 'runs the sketch, drives the screens'],
    guitar: ['guitar', 'Fender Mustang'],
    sketch: ['sketch', 'Processing; dots = the LEDs\' pixels'],
    left: ['left screen', '16 x 32 LEDs behind paper: the left half'],
    right: ['right screen', '16 x 32 LEDs behind paper: the right half'],
  };
  function under([x, y], sketch) {
    const inside = (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    if (Math.hypot(x - controllerOnScreen[0], y - controllerOnScreen[1]) < 16) return 'controller';
    if (inside(PI_BOARD)) return 'pi';
    if (x >= 0 && y >= 0 && x < W && y < H && maskContext.getImageData(Math.floor(x), Math.floor(y), 1, 1).data[3] > 60) return 'guitar';
    const { x: sx, y: sy, size } = LAYOUT.sketch;
    if (sketch && inside({ x: sx, y: sy, w: size, h: size })) return 'sketch';
    const { xs, y: py, width, height } = LAYOUT.screens;
    for (const [i, name] of [[0, 'left'], [1, 'right']]) if (inside({ x: xs[i], y: py, w: width, h: height })) return name;
    return null;
  }
  // A dashed line flowing from a to b, bowed to one side, with an arrowhead at b; where its middle is
  function flow(a, b, bow) {
    const mid = [(a[0] + b[0]) / 2 - (b[1] - a[1]) * bow, (a[1] + b[1]) / 2 + (b[0] - a[0]) * bow];
    context.save();
    context.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    context.lineWidth = 1.2;
    context.setLineDash([5, 5]);
    context.lineDashOffset = -time * 30;
    context.beginPath();
    context.moveTo(...a);
    context.quadraticCurveTo(...mid, ...b);
    context.stroke();
    const angle = Math.atan2(b[1] - mid[1], b[0] - mid[0]);
    context.setLineDash([]);
    context.fillStyle = 'rgba(255, 255, 255, 0.85)';
    context.beginPath();
    context.moveTo(...b);
    context.lineTo(b[0] - Math.cos(angle - 0.4) * 8, b[1] - Math.sin(angle - 0.4) * 8);
    context.lineTo(b[0] - Math.cos(angle + 0.4) * 8, b[1] - Math.sin(angle + 0.4) * 8);
    context.fill();
    context.restore();
    return [(a[0] + 2 * mid[0] + b[0]) / 4, (a[1] + 2 * mid[1] + b[1]) / 4];
  }
  // Each part's name, just above it, staying put
  function names(sketch) {
    if (canvas.clientWidth < 500) return; // Too small on the page to read; the lines over the stage say what's what
    const c = context;
    c.save();
    c.font = '10px Inconsolata, monospace';
    c.fillStyle = 'rgba(255, 255, 255, 0.7)';
    c.textAlign = 'center';
    c.textBaseline = 'bottom';
    const lift = 5;
    const { x: sx, y: sy, size } = LAYOUT.sketch;
    const { xs, y: py, width } = LAYOUT.screens;
    if (sketch) c.fillText('sketch', sx + size / 2, sy - lift);
    c.fillText('raspberry pi', PI_BOARD.x + PI_BOARD.w / 2, PI_BOARD.y - lift);
    c.fillText('left screen', xs[0] + width / 2, py - lift);
    c.fillText('right screen', xs[1] + width / 2, py - lift);
    const spots = body.spots && body.spots();
    if (spots) {
      c.fillText('guitar', spots.guitar[0], spots.guitar[1] - lift);
      c.fillText('controller', spots.controller[0], spots.controller[1] - 16);
    }
    c.restore();
  }

  // The words go in the gap between the sketch and the guitar; when nothing's pointed at, they say how to play it
  const touch = matchMedia('(hover: none)');
  const plain = (text) => text.replace(/&rarr;/g, '→').replace(/&middot;/g, '·').replace(/&uarr;/g, '↑').replace(/&darr;/g, '↓').replace(/&gt;/g, '>');
  function say(lines) {
    const { x, y, w, h } = LAYOUT.notes;
    const c = context;
    const size = 13;
    const height = size * 1.35;
    c.save();
    c.font = `${size}px Inconsolata, monospace`;
    const hint = touch.matches ? 'tap a part · tap the controller for the next pattern' : 'point at a part · click the controller for the next pattern';
    // Each paragraph wrapped to the gap's width
    const rows = [];
    (lines || [hint]).forEach((text, i) => {
      const colour = !lines ? 'rgba(255, 255, 255, 0.55)' : i ? 'rgba(255, 255, 255, 0.75)' : 'white';
      let line = '';
      for (const word of plain(text).split(' ')) {
        const longer = line ? `${line} ${word}` : word;
        if (c.measureText(longer).width > w && line) {
          rows.push({ text: line, colour });
          line = word;
        } else line = longer;
      }
      if (line) rows.push({ text: line, colour, gap: i === 0 && lines ? height * 0.4 : 0 });
    });
    // ...as many as fit, centred across and down the gap
    let total = 0;
    const shown = rows.filter((row) => (total + height <= h ? ((total += height + (row.gap || 0)), true) : false));
    let top = y + (h - total) / 2;
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (const row of shown) {
      c.fillStyle = row.colour;
      c.fillText(row.text, x + w / 2, top);
      top += height + (row.gap || 0);
    }
    c.restore();
  }
  function labels(sketch) {
    const name = hover && under(hover, sketch);
    if (!name) return say(null);
    const { x: sx, y: sy, size } = LAYOUT.sketch;
    const { xs, y: py, width } = LAYOUT.screens;
    const P = PI_BOARD;
    const r = readings;
    const n = (v) => (Math.round(v * 100) / 100).toString();
    const lines = [...NAMES[name]];
    const readout = `zTilt ${n(r.zTilt)} &middot; gyro ${Math.round(r.gyroX)}, ${Math.round(r.gyroY)} &middot; jolts &uarr;${r.upJolt} &darr;${r.downJolt}`;
    const air = 'controller &rarr; ESP-NOW &rarr; Wemos &rarr; serial &rarr; Pi';
    const leds = 'Fadecandy &rarr; USB &rarr; screens';
    // The data's way: in from the controller, to the sketch, and out to each screen
    const fromController = () => flow(controllerOnScreen, [P.x + P.w / 2, P.y + P.h + 2], -0.2);
    const toSketch = () => flow([P.x + P.w + 2, P.y + P.h / 2], [sx - 3, sy + size / 2], 0);
    // ...from under the Pi, round under the sketch, into each screen
    const toScreens = (which) => {
      const below = sy + size + (LAYOUT.guitar.middle[1] - sy - size) * 0.25;
      for (const i of which) flow([P.x + P.w / 2, P.y + P.h + 2], [xs[i] + 8, below + i * 18], 0.18);
    };
    if (name === 'controller') {
      fromController();
      lines.push(air, readout);
    } else if (name === 'pi') {
      fromController();
      toSketch();
      toScreens([0, 1]);
      lines.push(`${air} &rarr; ${leds}`, readout);
    } else if (name === 'sketch') {
      toSketch();
      lines.push('Pi &rarr; Processing');
    } else if (name === 'left' || name === 'right') {
      toScreens([name === 'left' ? 0 : 1]);
      lines.push(`Pi &rarr; ${leds}`);
    }
    say(lines);
  }

  // ------------------------------------------------------------ Drawing
  function draw(screenImage, glowColour, sketch) {
    context.clearRect(0, 0, W, H);
    // The sketch's frame, scaled to cover the stage (cropping its sides)
    if (screenImage && SHOW_STAGE) {
      const fit = Math.max(W / screenImage.width, H / screenImage.height);
      const width = screenImage.width * fit;
      const height = screenImage.height * fit;
      context.drawImage(screenImage, (W - width) / 2, (H - height) / 2, width, height);
    }
    // A song's sketch as it is on the laptop running it ({image, samples}), with a dot on each spot its LEDs take
    // their colour from
    if (sketch) {
      const { x, y, size } = LAYOUT.sketch;
      context.drawImage(sketch.image, x, y, size, size);
      const cell = size / sketch.samples;
      context.fillStyle = 'rgba(255, 255, 255, 0.8)';
      for (let i = 0; i < sketch.samples; i++) {
        for (let j = 0; j < sketch.samples; j++) {
          context.beginPath();
          context.arc(x + (i + 0.5) * cell, y + (j + 0.5) * cell, 1, 0, Math.PI * 2);
          context.fill();
        }
      }
    }
    screens(sketch);
    raspberryPi();

    // The performer, feet on the stage
    maskContext.clearRect(0, 0, W, H);
    body.draw(maskContext);
    const light = body.controller().onCanvas;
    controllerOnScreen = light;

    if (SHOW_STAGE) haze(glowColour);
    if (SHOW_LIGHT) trail(glowColour, light);
    const style = holder.dataset.style || 'solid';
    figure(style, glowColour);
    // The solid one gets a very thin white line round its edge, so its black stays clear against the dark stage
    if (style === 'solid') figure('outline', glowColour);
    if (body.lights) body.lights(context);
    if (SHOW_LIGHT) bloom(glowColour, light);
    if (SHOW_GRAPH) graph();
    names(sketch);
    labels(sketch);
  }

  // The controller's light leaves a fading trail as it moves, like a brush on the screens
  const TRAIL = 40; // How many frames it lasts
  const trailPoints = [];
  function trail(colour, light) {
    trailPoints.push(light.slice(0, 2));
    if (trailPoints.length > TRAIL) trailPoints.shift();
    context.save();
    context.globalCompositeOperation = 'screen';
    context.lineCap = 'round';
    for (let i = 1; i < trailPoints.length; i++) {
      const age = i / trailPoints.length; // 1 = newest
      context.strokeStyle = withAlpha(colour, age * 0.7);
      context.lineWidth = 2 + age * 7;
      context.beginPath();
      context.moveTo(...trailPoints[i - 1]);
      context.lineTo(...trailPoints[i]);
      context.stroke();
    }
    context.restore();
  }

  // The controller's light, blooming hot white through the haze, brighter the harder it's moving
  function bloom(colour, light) {
    context.save();
    context.globalCompositeOperation = 'screen';
    const size = 18 + Math.min(3, readings.totalAcc || 0) * 8;
    const glow = context.createRadialGradient(light[0], light[1], 0, light[0], light[1], size * 2.5);
    glow.addColorStop(0, 'rgba(255, 255, 255, 1)');
    glow.addColorStop(0.12, 'rgba(255, 255, 255, 0.9)');
    glow.addColorStop(0.35, withAlpha(colour, 0.5));
    glow.addColorStop(1, withAlpha(colour, 0));
    context.fillStyle = glow;
    context.fillRect(light[0] - size * 2.5, light[1] - size * 2.5, size * 5, size * 5);
    context.restore();
  }

  // The performer laid on the stage in a style (holder's data-style; trying them out):
  // solid (the default, black with a thin white edge), outline, soft, neon, led, halftone, cutout, brush, hatch
  const OUTLINE = 0.5; // How thick the outline is (px)
  const scratch = document.createElement('canvas');
  scratch.width = W;
  scratch.height = H;
  const scratchContext = scratch.getContext('2d');

  function figure(style, colour) {
    const c = context;
    c.save();
    if (style === 'outline') {
      // A thin white line round its edge, the inside left dark: the shape spread a little, less the shape itself
      scratchContext.save();
      scratchContext.clearRect(0, 0, W, H);
      for (let a = 0; a < 12; a++) {
        const turn = (a / 12) * Math.PI * 2;
        scratchContext.drawImage(mask, Math.cos(turn) * OUTLINE, Math.sin(turn) * OUTLINE);
      }
      scratchContext.globalCompositeOperation = 'destination-out';
      scratchContext.drawImage(mask, 0, 0);
      scratchContext.globalCompositeOperation = 'source-in';
      scratchContext.fillStyle = 'white';
      scratchContext.fillRect(0, 0, W, H);
      scratchContext.restore();
      c.drawImage(scratch, 0, 0);
    } else if (style === 'soft') {
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
      c.drawImage(mask, 0, 0); // A dark body behind the tube
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
    } else if (style === 'brush') {
      // Ink brushed on: ragged, dry-brush edges
      for (let i = 0; i < 6; i++) {
        c.globalAlpha = 0.35;
        c.drawImage(mask, Math.sin(time * 3 + i * 2.1) * 2.5, Math.cos(time * 2 + i * 1.3) * 2.5);
      }
      c.globalAlpha = 1;
      c.drawImage(mask, 0, 0);
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
    const back = [FEET[0] + 20, FEET[1] - SHEET.standing * 0.8];
    const glow = context.createRadialGradient(back[0], back[1], 0, back[0], back[1], H * 0.7);
    glow.addColorStop(0, withAlpha(colour, 0.55));
    glow.addColorStop(1, withAlpha(colour, 0));
    context.fillStyle = glow;
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
    ['gyroX', -150, 150],
    ['gyroY', -150, 150],
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
    context.lineWidth = 1;
    context.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    context.strokeRect(x, y, width, height);
  }

  return {
    // Moves the performer on by dt seconds, fills in the controller's readings, and draws the stage with the screen
    // showing screenImage (a canvas)
    update(dt, controller, screenImage, glowColour, sketch) {
      dt = Math.min(dt, 1 / 30);
      if (!(dt > 0)) return; // Two frames at once: nothing's moved, and the readings would divide by nothing
      time += dt;
      if (!body) return; // The puppet's still loading
      body.update(dt);
      read(dt, controller);
      draw(screenImage, glowColour, sketch);
    },
  };
}

// ------------------------------------------------------------ Little helpers
// An 'rgb(r g b)' colour (or any CSS colour with three numbers in it) with an alpha
function withAlpha(colour, alpha) {
  const [r = 255, g = 255, b = 255] = (colour.match(/[\d.]+/g) || []).map(Number);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, s) => a.map((x) => x * s);
// A smooth curve (Catmull-Rom) through four values, at u between the middle two
function curve([a, b, c, d], u) {
  return 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
}
const clamp = (x, low, high) => Math.min(high, Math.max(low, x));

// Where everything goes on the stage, worked out from its size, on an even grid (one spacing between everything and
// round the edge): the Luminin's two screens on the right, full height, as big as that makes them at their 1 x 2
// shape; on the left, a song's sketch at the top (as on the laptop running it), small, its top level with theirs,
// against the screens' side, with room to its left for the Raspberry Pi; under it, the words saying what's pointed at;
// and the guitar under them, low in the lower left
function layoutFor(width, height) {
  const space = Math.round(height * 0.04);
  const tall = height - space * 2;
  const wide = (tall * PANEL.across) / PANEL.down;
  const left = Math.max(0, width - space * 4 - wide * 2);
  const size = Math.round(left * SKETCH_SIZE);
  const sketch = { x: space + left - size, y: space, size };
  const below = { top: sketch.y + size + space, bottom: height - space };
  const length = left * GUITAR_SIZE;
  const guitar = {
    length,
    // Its middle, so it starts at the left edge and sits a little low in the space (its neck rises from its middle)
    middle: [space + length * (MUSTANG.pivot[0] / MUSTANG.width), below.top + (below.bottom - below.top) * 0.82],
  };
  // The words saying what's pointed at, in the gap between the sketch and the guitar (clear of the controller's name)
  const top = sketch.y + size + space * 0.6;
  const notes = { x: space, y: top, w: left, h: guitar.middle[1] - length * 0.18 - 30 - top };
  return { sketch, guitar, notes, screens: { xs: [space * 2 + left, space * 3 + left + wide], y: space, width: wide, height: tall } };
}
// The controller's 8 x 4 LEDs, coloured as its firmware colours them (20250602_Luminin_Controller.ino), at `time` (s):
// each one's hue from the tilt, stepping along the grid, and, while it's jolted down, rippling across its columns;
// all as bright as 20 plus half the jolt (which, kept in a byte, rolls over past 255). Each comes back as the colour
// it looks: the firmware's drive, through the matrix's brightness of 100, brightened as an LED looks to the eye
function controllerLeds(time, downJolt, zTilt) {
  const millis = time * 1000;
  const value = Math.trunc(20 + downJolt / 2) & 255;
  const colours = [];
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 8; x++) {
      const baseGradient = Math.trunc(Math.cos(x * x + millis * 0.005) * 50);
      const hue = 20 * (1 + baseGradient * (downJolt / 100)) + (x + y) * 500 + 1.6 * ((zTilt + 1) / 2) * 65536;
      const drive = colorHSV(((Math.trunc(hue) % 65536) + 65536) % 65536, 255, value).map((v) => (v * 101) >> 8);
      colours.push(drive.map((v) => Math.round(255 * Math.pow(v / 255, 1 / 2.4))));
    }
  }
  return colours;
}
// Adafruit_NeoPixel's ColorHSV: hue 0-65535, saturation and value 0-255, to red, green and blue
function colorHSV(hue, sat, val) {
  let r;
  let g;
  let b;
  hue = Math.floor((hue * 1530 + 32768) / 65536);
  if (hue < 510) {
    b = 0;
    if (hue < 255) [r, g] = [255, hue];
    else [r, g] = [510 - hue, 255];
  } else if (hue < 1020) {
    r = 0;
    if (hue < 765) [g, b] = [255, hue - 510];
    else [g, b] = [1020 - hue, 255];
  } else if (hue < 1530) {
    g = 0;
    if (hue < 1275) [r, b] = [hue - 1020, 255];
    else [r, b] = [255, 1530 - hue];
  } else [r, g, b] = [255, 0, 0];
  const [v1, s1, s2] = [1 + val, 1 + sat, 255 - sat];
  return [r, g, b].map((c) => ((((c * s1) >> 8) + s2) * v1) >> 8);
}

// x kept between low and high, easing into them over the last `soft` of the way instead of stopping dead
function softClamp(x, low, high, soft = 0.25) {
  if (x > high - soft) return high - soft * Math.exp(-(x - (high - soft)) / soft);
  if (x < low + soft) return low + soft * Math.exp((x - (low + soft)) / soft);
  return x;
}
function gaussian() {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 1.4;
}
