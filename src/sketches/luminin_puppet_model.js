// The performer from Ofer's sprite sheets as a rigged 3D model: a solidly built figure in a t-shirt, roomy jeans and
// chunky sneakers, with short messy hair, playing a guitar with the Luminin controller on its headstock, all one flat
// black as in the sheets. Its build is matched to the sheets' silhouettes (see silhouette.html). Built in cm in the
// performer's own frame (x to their left, y up, z forward), scaled to metres at the root for glTF.
//
// The rig is a node hierarchy (each body part a rigid mesh under its joint, joints covered by spheres), so it imports
// anywhere as a puppet: root > hips > (spine > neck > head, arms), (legs > shins > feet), and the guitar under the root.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------ Materials (all black, as in the sprite sheets; named so
// they're easy to recolour)
const mat = (name, extra = {}) => new THREE.MeshStandardMaterial({ name, color: 0x000000, roughness: 1, metalness: 0, ...extra });
export const MATERIALS = {
  skin: mat('skin'),
  hair: mat('hair'),
  shirt: mat('shirt'),
  jeans: mat('jeans'),
  shoes: mat('shoes'),
  soles: mat('soles'),
  guitar: mat('guitar'),
  neck: mat('guitar_neck'),
  hardware: mat('hardware'),
  controller: mat('controller'),
  leds: mat('controller_leds', { color: 0xffffff, emissive: 0x9fdcff, emissiveIntensity: 2 }),
};

// ------------------------------------------------------------ The skeleton's rest pose (cm, world, arms and legs straight down)
const HIP = 93;
export const REST = {
  hips: V(0, HIP, 0),
  spine: V(0, HIP, 0),
  neck: V(0, 146, 3),
  head: V(2, 156, 5),
  upperArm_L: V(18, 143, 3), foreArm_L: V(18, 112, 3), hand_L: V(18, 83, 3),
  upperArm_R: V(-18, 143, 3), foreArm_R: V(-18, 112, 3), hand_R: V(-18, 83, 3),
  thigh_L: V(9, HIP, 0), shin_L: V(9, 49, 0), foot_L: V(9, 7, 0),
  thigh_R: V(-9, HIP, 0), shin_R: V(-9, 49, 0), foot_R: V(-9, 7, 0),
  guitar: V(-8, 100, 14),
};
const PARENT = {
  hips: 'root', spine: 'hips', neck: 'spine', head: 'neck',
  upperArm_L: 'spine', foreArm_L: 'upperArm_L', hand_L: 'foreArm_L',
  upperArm_R: 'spine', foreArm_R: 'upperArm_R', hand_R: 'foreArm_R',
  thigh_L: 'hips', shin_L: 'thigh_L', foot_L: 'shin_L',
  thigh_R: 'hips', shin_R: 'thigh_R', foot_R: 'shin_R',
  guitar: 'root',
};
const ARM = [31, 29];
const LEG = [44, 42];

// ------------------------------------------------------------ Geometry helpers
// A tapered capsule from a to b (world, rest), radius ra at a and rb at b
function capsule(a, b, ra, rb, segments = 20) {
  const len = a.distanceTo(b);
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = (i / 8) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.sin(t) * rb, len + Math.cos(t) * rb)); }
  for (let i = 8; i >= 0; i--) { const t = (i / 8) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.sin(t) * ra, -Math.cos(t) * ra)); }
  pts.reverse();
  const g = new THREE.LatheGeometry(pts, segments);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q).translate(a.x, a.y, a.z);
  return g;
}
function ellipsoid(c, sx, sy, sz, w = 24, h = 16) {
  return new THREE.SphereGeometry(1, w, h).scale(sx, sy, sz).translate(c.x, c.y, c.z);
}
// A loft through horizontal rounded (superellipse) sections: [y, width, depth, z]
function loft(sections, n = 40, power = 2.6) {
  const pos = [];
  const idx = [];
  for (const [y, w, d, z = 0, x = 0] of sections) {
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const c = Math.cos(t), s = Math.sin(t);
      pos.push(x + Math.sign(c) * Math.abs(c) ** (2 / power) * w / 2, y, z + Math.sign(s) * Math.abs(s) ** (2 / power) * d / 2);
    }
  }
  for (let r = 0; r < sections.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i, b = r * n + ((i + 1) % n), c = a + n, d = b + n;
      idx.push(a, c, b, b, c, d);
    }
  }
  // Caps
  for (const [r, flip] of [[0, true], [sections.length - 1, false]]) {
    const centre = pos.length / 3;
    const [y, , , z = 0, x = 0] = sections[r];
    pos.push(x, y, z);
    for (let i = 0; i < n; i++) {
      const a = r * n + i, b = r * n + ((i + 1) % n);
      flip ? idx.push(centre, b, a) : idx.push(centre, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// A closed outline smoothed through its points (Catmull-Rom), as in the sim
function smooth(points, steps = 6) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const [p0, p1, p2, p3] = [-1, 0, 1, 2].map((k) => points[(i + k + points.length) % points.length]);
    for (let j = 0; j < steps; j++) {
      const t = j / steps, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  return out;
}
function extrude(points, depth, z, bevel = 0.5) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: depth - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8 });
  return g.translate(0, 0, z + bevel);
}
// Messy hair: a lumpy shell of displaced spheres over the scalp
function hair(c) {
  const g = new THREE.IcosahedronGeometry(1, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = V(p.getX(i), p.getY(i), p.getZ(i));
    const lump = 1 + 0.09 * Math.sin(v.x * 9 + v.y * 4) * Math.cos(v.z * 8 - v.y * 3) + 0.06 * Math.sin(v.x * 17 + v.z * 13);
    // Only over the top and back of the head; tucked in below the ears and at the forehead
    const top = THREE.MathUtils.smoothstep(v.y, -0.25, 0.35);
    const front = v.z > 0.55 && v.y < 0.5 ? 0.85 : 1;
    const r = (0.86 + 0.24 * top * lump) * front;
    p.setXYZ(i, v.x * r * 9.8, v.y * r * 10.6 + 1.2, v.z * r * 10.4 - 0.8);
  }
  g.computeVertexNormals();
  return g.translate(c.x, c.y, c.z);
}

// ------------------------------------------------------------ The guitar's shape (along the neck a, across it b, cm)
const OFFSET_BODY = [
  [12, 3], [15, 7], [18, 11], [17, 14], [12, 14.5], [5, 12.5], [-2, 11.8], [-10, 14], [-18, 16], [-25, 14.5],
  [-29.5, 8], [-30.5, 0], [-29.5, -8], [-25, -14.5], [-17, -16.8], [-9, -15], [-3, -12.2], [3, -12.8], [10, -15],
  [16, -15], [19, -12], [16, -7.5], [12.5, -3.5],
];
const HEADSTOCK = [[62, -2.3], [70, -2.8], [79, -3.1], [81, -1], [80.5, 3.6], [76, 4.8], [69, 4.4], [65, 3.2], [62, 2.3]];

function buildGuitar() {
  const group = new THREE.Group();
  const add = (g, m) => { const mesh = new THREE.Mesh(g, m); group.add(mesh); return mesh; };
  add(extrude(smooth(OFFSET_BODY), 4.4, -2.2, 0.8), MATERIALS.guitar).name = 'guitar_body';
  // Neck (tapering toward the nut) and fretboard
  add(extrude([[10, -2.9], [63, -2.2], [63, 2.2], [10, 2.9]], 2.4, 0.8, 0.3), MATERIALS.neck).name = 'guitar_neck';
  add(extrude(smooth(HEADSTOCK), 1.5, 0.8, 0.3), MATERIALS.neck).name = 'guitar_headstock';
  for (let i = 0; i < 6; i++) {
    const at = 66 + i * 2.4;
    add(capsule(V(at, 3.4 + i * 0.25, 1.5), V(at, 6 + i * 0.25, 1.5), 0.6, 0.8, 10), MATERIALS.hardware);
    add(new THREE.CylinderGeometry(0.45, 0.45, 1.2, 10).rotateX(Math.PI / 2).translate(at, 2.2 + i * 0.22, 2.7), MATERIALS.hardware);
  }
  // Pickups, bridge, knobs on the front
  for (const a of [-4, 6]) add(new THREE.BoxGeometry(2.6, 8, 0.8).translate(a, 0, 2.6), MATERIALS.guitar).name = 'pickup';
  add(new THREE.BoxGeometry(2.2, 8.5, 0.9).translate(-15, 0, 2.6), MATERIALS.hardware).name = 'bridge';
  for (const [a, b] of [[-19, 10], [-13, 11.5]]) add(new THREE.CylinderGeometry(1.1, 1.2, 1.4, 16).rotateX(Math.PI / 2).translate(a, b, 2.8), MATERIALS.hardware);
  // Strings
  for (let i = 0; i < 6; i++) {
    const b = -1.9 + i * 0.76;
    add(new THREE.CylinderGeometry(0.06, 0.06, 80, 4).rotateZ(Math.PI / 2).translate(25, b * 0.95, 3.4), MATERIALS.hardware);
  }
  // The Luminin controller: a box on the headstock's tip, an 8 × 4 grid of LEDs on its face
  const controller = add(new THREE.BoxGeometry(8, 8, 4).translate(82, 0, 2.5), MATERIALS.controller);
  controller.name = 'luminin_controller';
  for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
    add(new THREE.SphereGeometry(0.32, 8, 6).translate(78.9 + i * 0.9, -1.35 + j * 0.9, 4.55), MATERIALS.leds);
  }
  return group;
}

// ------------------------------------------------------------ The body, part by part, in rest world coordinates
function buildParts() {
  const R = REST;
  const parts = { hips: [], spine: [], neck: [], head: [], guitar: [] };
  const put = (bone, geometry, material, name) => (parts[bone] ||= []).push({ geometry, material, name });
  // Jeans: the seat and the legs, straight and roomy, as in the sprite sheets
  put('hips', loft([[80, 34, 25, -0.5], [86, 36, 26, 0], [93, 36, 25, 0], [98, 34, 24, 0]]), MATERIALS.jeans, 'jeans_seat');
  for (const s of ['L', 'R']) {
    const x = s === 'L' ? 1 : -1;
    put(`thigh_${s}`, capsule(R[`thigh_${s}`].clone().add(V(x * 0.5, -2, 0)), R[`shin_${s}`], 10.4, 7.8), MATERIALS.jeans, `jeans_thigh_${s}`);
    put(`shin_${s}`, capsule(R[`shin_${s}`], R[`foot_${s}`].clone().add(V(0, 2, 0)), 7.6, 7.0), MATERIALS.jeans, `jeans_shin_${s}`);
    // A chunky sneaker: a rounded upper on a sole, toe forward
    const a = R[`foot_${s}`];
    put(`foot_${s}`, ellipsoid(a.clone().add(V(0, -0.5, 8)), 6.0, 5.6, 15.5), MATERIALS.shoes, `shoe_${s}`);
    put(`foot_${s}`, loft([[-6.6, 10.6, 28.5, 8, 0], [-4, 11, 29, 8, 0]].map(([y, w, d, z]) => [a.y + y, w, d, a.z + z, a.x]), 32, 3), MATERIALS.soles, `sole_${s}`);
  }
  // The t-shirt over a solid torso (a deep chest and a rounded back), hem over the jeans, with short sleeves and
  // the arms below
  put('spine', loft([
    [83, 38, 30, -0.5], [90, 37, 29, -0.5], [104, 35, 28, 0], [118, 37, 29, 0.5], [130, 41, 30, 0.5], [138, 43, 28, 0.5],
    [143, 42, 24, 0.5], [146.5, 32, 18, 1.5], [148, 17, 13, 2.5],
  ]), MATERIALS.shirt, 'tshirt');
  for (const s of ['L', 'R']) {
    const x = s === 'L' ? 1 : -1;
    const sh = R[`upperArm_${s}`], el = R[`foreArm_${s}`], wr = R[`hand_${s}`];
    put('spine', ellipsoid(sh.clone().add(V(-x * 2.5, -4, 0)), 7.6, 6.4, 8.6), MATERIALS.shirt, `tshirt_shoulder_${s}`);
    put(`upperArm_${s}`, capsule(sh, sh.clone().lerp(el, 0.5), 8.2, 7.2), MATERIALS.shirt, `tshirt_sleeve_${s}`);
    put(`upperArm_${s}`, capsule(sh, el, 5.8, 4.8), MATERIALS.skin, `upperArm_${s}`);
    put(`foreArm_${s}`, capsule(el, wr, 4.8, 3.4), MATERIALS.skin, `foreArm_${s}`);
    put(`hand_${s}`, ellipsoid(wr.clone().add(V(0, -5, 0.5)), 2.6, 5.6, 4.8), MATERIALS.skin, `hand_${s}`);
    put(`hand_${s}`, capsule(wr.clone().add(V(0, -1.5, 3)), wr.clone().add(V(-x * 0.4, -5, 4.8)), 1.4, 1.2, 10), MATERIALS.skin, `thumb_${s}`);
  }
  // Neck (short and thick), head, ears, nose, jaw, hair
  put('neck', capsule(R.neck.clone().add(V(0, -2, 0)), V(2, 156, 4.5), 6.8, 6.2), MATERIALS.skin, 'neck');
  const head = V(2, 161.5, 6);
  put('head', ellipsoid(head, 8, 10.2, 9.3), MATERIALS.skin, 'head');
  put('head', ellipsoid(head.clone().add(V(0, -5.5, 2)), 6.6, 5, 7), MATERIALS.skin, 'jaw');
  put('head', capsule(head.clone().add(V(0, 0.5, 9.4)), head.clone().add(V(0, -2.8, 11.4)), 1.0, 1.5, 12), MATERIALS.skin, 'nose');
  for (const x of [1, -1]) put('head', ellipsoid(head.clone().add(V(x * 8.4, -0.5, -0.5)), 1.4, 3.2, 2.2), MATERIALS.skin, 'ear');
  put('head', hair(head), MATERIALS.hair, 'hair');
  return parts;
}

// ------------------------------------------------------------ The model
export function buildModel() {
  const root = new THREE.Group();
  root.name = 'performer';
  const bones = { root };
  for (const name of Object.keys(PARENT)) {
    const node = new THREE.Group();
    node.name = name;
    bones[name] = node;
  }
  for (const [name, parent] of Object.entries(PARENT)) {
    bones[parent].add(bones[name]);
    const parentRest = parent === 'root' ? V(0, 0, 0) : REST[parent];
    bones[name].position.copy(REST[name]).sub(parentRest);
  }
  const parts = buildParts();
  for (const [bone, list] of Object.entries(parts)) {
    for (const { geometry, material, name } of list) {
      geometry.translate(-REST[bone].x, -REST[bone].y, -REST[bone].z);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      bones[bone].add(mesh);
    }
  }
  // Spheres covering the elbows and knees
  for (const [bone, r, m] of [['foreArm_L', 4.9, MATERIALS.skin], ['foreArm_R', 4.9, MATERIALS.skin], ['shin_L', 7.8, MATERIALS.jeans], ['shin_R', 7.8, MATERIALS.jeans]]) {
    const joint = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m);
    joint.name = `${bone}_joint`;
    bones[bone].add(joint);
  }
  bones.guitar.add(buildGuitar()); // In the guitar's own frame (x along the neck, y across, z out of its face)
  root.scale.setScalar(0.01); // cm → m
  return { root, bones };
}

// ------------------------------------------------------------ Posing (the same poses as the sim's luminin_performer.js)
const SWING = [
  { t: 0.32, pitch: 0.9, yaw: 0.6, at: [2, 20, 10], twist: -0.3, lean: -0.08, drop: 0, footL: [16, -6], footR: [-17, 10], free: 0 },
  { t: 0.58, pitch: 0.65, yaw: 0.7, at: [0, 8, 8], twist: -0.3, lean: 0.04, drop: 3, footL: [17, 2], footR: [-17, 4], free: 0 },
  { t: 0.8, pitch: 0.12, yaw: 1.0, at: [0, 4, 12], twist: -0.35, lean: 0.25, drop: 8, footL: [18, 24], footR: [-16, -20], free: 1 },
  { t: 0.98, pitch: 0.02, yaw: 1.3, at: [-2, 2, 18], twist: -0.5, lean: 0.35, drop: 12, footL: [20, 32], footR: [-16, -26], free: 0.2 },
  { t: 1.3, pitch: 0, yaw: -1.25, at: [4, -8, 4], twist: 0.55, lean: 0.12, drop: 6, footL: [18, 16], footR: [-16, -16], free: 0 },
  { t: 1.48, pitch: 0.25, yaw: -1.55, at: [0, -8, -2], twist: 1.0, lean: 0.05, drop: 4, footL: [14, 10], footR: [-18, -12], free: 0 },
  { t: 1.85, pitch: 0.95, yaw: 0.5, at: [2, 20, 10], twist: -0.2, lean: 0, drop: 2, footL: [16, 0], footR: [-17, 4], free: 0 },
  { t: 2.05, pitch: 0.9, yaw: 0.6, at: [2, 20, 10], twist: -0.3, lean: -0.08, drop: 0, footL: [16, -6], footR: [-17, 10], free: 0 },
];
export const SWING_END = 2.45;
export const SWING_TIMES = SWING.map((k) => k.t);
const IDLE = { pitch: 0.4, yaw: 0.45, at: [0, 0, 0], twist: -0.1 - 0.45 * 0.3, lean: 0, drop: 0, footL: [16, -8], footR: [-17, 10], free: 0 };
const KEYS = [{ ...IDLE, t: 0 }, ...SWING, { ...IDLE, t: SWING_END }];
// Standing relaxed, upright, feet about shoulder-width apart and the weight even, the guitar at the hip, its neck
// pointing forward and a little up, the left hand on it and the right over the strings
export const NEUTRAL = { pitch: 0.35, yaw: 0.5, at: [0, 0, 0], twist: -0.3, lean: 0.03, drop: 2, footL: [13, 18], footR: [-13, -16], free: 0 };

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export function poseAt(t) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
  const [p0, p1, p2, p3] = [i - 1, i, i + 1, i + 2].map((k) => KEYS[clamp(k, 0, KEYS.length - 1)]);
  const u = clamp((t - p1.t) / (p2.t - p1.t), 0, 1);
  const curve = (a, b, c, d) => 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
  const out = {};
  for (const key in p1) out[key] = Array.isArray(p1[key]) ? p1[key].map((_, j) => curve(p0[key][j], p1[key][j], p2[key][j], p3[key][j])) : curve(p0[key], p1[key], p2[key], p3[key]);
  return out;
}

const rotY = (w) => new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), w);
const rotX = (l) => new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), l);
// A world rotation that turns a limb lying along restAlong (bending in restNormal's plane) to lie along `along`, bent in `normal`'s
function limbRotation(along, normal, restAlong, restNormal) {
  const basis = (x, y) => {
    x = x.clone().normalize();
    y = y.clone().sub(x.clone().multiplyScalar(y.dot(x))).normalize();
    return new THREE.Matrix4().makeBasis(x, y, x.clone().cross(y));
  };
  const m = basis(along, normal).multiply(basis(restAlong, restNormal).invert());
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
function ik(start, target, a, b, pole) {
  const to = target.clone().sub(start);
  const d = Math.min(a + b - 0.01, to.length());
  const along = to.normalize();
  const x = (a * a - b * b + d * d) / (2 * d);
  const y = Math.sqrt(Math.max(0, a * a - x * x));
  const side = pole.clone().sub(along.clone().multiplyScalar(pole.dot(along))).normalize();
  return { mid: start.clone().add(along.clone().multiplyScalar(x)).add(side.multiplyScalar(y)), end: start.clone().add(along.clone().multiplyScalar(d)) };
}

// Sets every joint for the swing at time t
export const applyPose = (model, t) => setPose(model, poseAt(t));

// Sets every joint for a pose (world rotations worked out, then made local to each parent)
export function setPose({ bones }, p) {
  const shiftZ = (p.footL[1] + p.footR[1]) / 2;
  const pivot = V(0, HIP - p.drop, shiftZ);
  const torsoQ = rotY(p.twist).multiply(rotX(p.lean));
  const hipsQ = rotY(p.twist * 0.4);
  const torso = (v) => v.clone().sub(V(0, HIP, 0)).applyQuaternion(torsoQ).add(pivot);
  const hipPoint = (v) => v.clone().sub(V(0, HIP, 0)).applyQuaternion(hipsQ).add(pivot);
  const turned = (v) => v.clone().applyQuaternion(torsoQ);

  // The guitar's frame: u along the neck, n out of its face, v across
  const u = V(Math.cos(p.pitch) * Math.cos(p.yaw), Math.sin(p.pitch), Math.cos(p.pitch) * Math.sin(p.yaw));
  const n = V(-Math.sin(p.yaw), 0, Math.cos(p.yaw));
  const v = n.clone().cross(u);
  const slung = torso(REST.guitar.clone().add(V(...p.at)));
  const onGuitar = (a, b, c = 0) => slung.clone().add(u.clone().multiplyScalar(a)).add(v.clone().multiplyScalar(b)).add(n.clone().multiplyScalar(c));
  const guitarQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, n.clone().normalize()));

  const world = { root: new THREE.Quaternion() };
  world.hips = hipsQ;
  world.spine = torsoQ;
  world.neck = rotY(p.twist * 0.8).multiply(rotX(p.lean * 0.6));
  world.head = rotY(p.twist * 0.55 - 0.1).multiply(rotX(p.lean * 0.3));
  world.guitar = guitarQ;
  const positions = { hips: pivot, guitar: slung };

  // Arms: left hand on the neck, right over the strings or thrown back
  const handTargets = {
    L: onGuitar(44, -3.5, -1.5),
    R: onGuitar(-3, 3, 5).lerp(torso(V(-26, 84, -22)), p.free),
  };
  const poles = { L: V(1, -1, -0.4), R: V(-1, -0.8, -0.6) };
  for (const s of ['L', 'R']) {
    const shoulder = torso(REST[`upperArm_${s}`]);
    const { mid, end } = ik(shoulder, handTargets[s], ...ARM, turned(poles[s]));
    const normal = mid.clone().sub(shoulder).cross(end.clone().sub(mid));
    const fallback = turned(V(-1, 0, 0));
    const nrm = normal.length() > 1e-3 ? normal : fallback;
    // At rest the arm hangs down, the forearm bending forward from the elbow: its bend's normal is -x
    world[`upperArm_${s}`] = limbRotation(mid.clone().sub(shoulder), nrm, V(0, -1, 0), V(-1, 0, 0));
    world[`foreArm_${s}`] = limbRotation(end.clone().sub(mid), nrm, V(0, -1, 0), V(-1, 0, 0));
    world[`hand_${s}`] = world[`foreArm_${s}`];
  }
  // Legs: knees forward, feet flat, pointing where the hips do
  for (const s of ['L', 'R']) {
    const side = s === 'L' ? 1 : -1;
    const hip = hipPoint(REST[`thigh_${s}`]);
    const foot = p[`foot${s}`];
    const { mid, end } = ik(hip, V(foot[0], 7, foot[1]), ...LEG, V(side * 0.2, 0, 1).applyQuaternion(hipsQ).add(V(0, 0, 0.3)));
    const normal = mid.clone().sub(hip).cross(end.clone().sub(mid));
    const nrm = normal.length() > 1e-3 ? normal : V(1, 0, 0).applyQuaternion(hipsQ);
    // At rest the leg hangs down, the shin bending back from the knee: its bend's normal is +x
    world[`thigh_${s}`] = limbRotation(mid.clone().sub(hip), nrm, V(0, -1, 0), V(1, 0, 0));
    world[`shin_${s}`] = limbRotation(end.clone().sub(mid), nrm, V(0, -1, 0), V(1, 0, 0));
    world[`foot_${s}`] = rotY(p.twist * 0.4 + side * 0.12);
  }

  for (const [name, parent] of Object.entries(PARENT)) {
    const local = world[parent].clone().invert().multiply(world[name]);
    bones[name].quaternion.copy(local);
  }
  bones.hips.position.copy(positions.hips);
  // The guitar hangs from the root, so its place is in the root's (cm) space directly
  bones.guitar.position.copy(positions.guitar);
}

// The swing baked as an animation clip, sampled at fps
export function bakeSwing(model, fps = 30) {
  const frames = Math.round(SWING_END * fps) + 1;
  const times = [];
  const tracks = {};
  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    times.push(t);
    applyPose(model, t);
    for (const name of Object.keys(PARENT)) {
      const q = model.bones[name].quaternion;
      const list = (tracks[`${name}.quaternion`] ||= []);
      // Keep each quaternion on the same side as the last, so it interpolates the short way
      if (list.length >= 4) {
        const last = list.slice(-4);
        if (last[0] * q.x + last[1] * q.y + last[2] * q.z + last[3] * q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      }
      list.push(q.x, q.y, q.z, q.w);
    }
    for (const name of ['hips', 'guitar']) (tracks[`${name}.position`] ||= []).push(...model.bones[name].position.toArray());
  }
  const keyframes = Object.entries(tracks).map(([path, values]) =>
    path.endsWith('quaternion') ? new THREE.QuaternionKeyframeTrack(path, times, values) : new THREE.VectorKeyframeTrack(path, times, values));
  applyPose(model, 0); // Leave it standing, playing
  return new THREE.AnimationClip('FullSwing', SWING_END, keyframes);
}
