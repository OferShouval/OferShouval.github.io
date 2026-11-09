// The performer as the 3D puppet (luminin_puppet_model.js), for the Luminin simulation's stage (luminin_performer.js):
// posed through a move over time, and drawn as a flat black silhouette from the side the sprite sheets show him from,
// with his feet on the stage at `feet` and standing `standing` pixels tall. The moves are the ones made for the earlier,
// drawn 3D performer (archive/luminin-performer/luminin_performer_drawn_silhouette.js), in the same terms the puppet's
// poses take.

import * as THREE from 'three';
import { buildModel, setPose, NEUTRAL } from './luminin_puppet_model.js';

const HEIGHT = 1.78; // m
const VIEW = -1.0; // Where it's seen from: radians round from straight in front, as the sprite sheets see him
const CONTROLLER = [82, 0, 4.6]; // The controller's lights, on the guitar (cm, along the neck, across it, out of its face)

// The moves: poses (changes from standing) and when they're reached, in seconds
const OVERHEAD = { pitch: 0.12, yaw: -1.25, at: [4, 70, -4], twist: 0.2, lean: -0.12, drop: 0, footL: [16, 8], footR: [-17, -6] };
const MOVES = {
  // Wound up overhead (the neck pointing back), then bent over, the neck down, into a kneeling lunge, bent over again,
  // and staying low in the lunge, the neck coming up, before standing again
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
};

export function createPuppet({ width, height, feet, standing }) {
  const model = buildModel();
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  model.root.traverse((o) => o.isMesh && (o.material = black));
  const scene = new THREE.Scene();
  scene.add(model.root);

  // Seen flat on (no perspective), like the drawings, with the ground at feet[1] and the feet centred on feet[0]
  const perMetre = standing / HEIGHT;
  const camera = new THREE.OrthographicCamera(-feet[0] / perMetre, (width - feet[0]) / perMetre, feet[1] / perMetre, -(height - feet[1]) / perMetre, 0.1, 40);
  camera.position.set(Math.sin(VIEW) * 10, 0, Math.cos(VIEW) * 10);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);

  let time = 0;
  let pose = { ...NEUTRAL };
  let move = null; // The move playing: its name, when it began, and its poses

  const controller = new THREE.Vector3();
  return {
    canvas: renderer.domElement,
    // Starts a move from wherever the puppet is, so one can cut into another
    play(name) {
      if (!MOVES[name]) return;
      const keys = MOVES[name].map((k) => pick({ ...NEUTRAL, ...k }));
      move = { name, start: time, keys: [{ ...pick(pose), t: 0 }, ...keys] };
    },
    // The move playing (null when standing)
    get move() {
      return move && move.name;
    },
    update(dt) {
      time += dt;
      if (move) {
        const t = time - move.start;
        if (t < move.keys[move.keys.length - 1].t) pose = between(move.keys, t);
        else {
          move = null;
          pose = { ...NEUTRAL };
        }
      }
      setPose(model, pose);
      model.root.updateMatrixWorld(true);
      renderer.render(scene, camera);
    },
    // Where the controller is: in the room (cm; x to the performer's left, y up, z toward the audience), on the canvas,
    // and how the guitar's neck is pointing (pitch, up from level; yaw, round toward the audience)
    controller() {
      model.bones.guitar.localToWorld(controller.set(...CONTROLLER));
      const room = controller.toArray().map((v) => v * 100);
      const onCanvas = controller.clone().project(camera);
      return {
        room,
        onCanvas: [((onCanvas.x + 1) / 2) * width, ((1 - onCanvas.y) / 2) * height],
        pitch: pose.pitch,
        yaw: pose.yaw,
      };
    },
  };
}

// Only what a pose is made of
const pick = (p) => Object.fromEntries(Object.keys(NEUTRAL).map((k) => [k, p[k]]).concat(p.t === undefined ? [] : [['t', p.t]]));

// Where a series of poses is at time t: each number (and each number in a list) on a smooth curve through them
function between(keys, t) {
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const [p0, p1, p2, p3] = [i - 1, i, i + 1, i + 2].map((k) => keys[Math.min(keys.length - 1, Math.max(0, k))]);
  const u = Math.min(1, Math.max(0, (t - p1.t) / (p2.t - p1.t)));
  const curve = (a, b, c, d) => 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
  const out = {};
  for (const key of Object.keys(NEUTRAL)) {
    out[key] = Array.isArray(p1[key]) ? p1[key].map((_, j) => curve(p0[key][j], p1[key][j], p2[key][j], p3[key][j])) : curve(p0[key], p1[key], p2[key], p3[key]);
  }
  return out;
}
