// The mouse: a few rounded solids and curving lines, worked out in 3D so that it looks the same from
// every side, and turned into a list of pen strokes for each picture of it (see mousePose()).
// brush_frames.js does the painting.
//
// It's measured from the middle of its body on the ground, in the same pixels as its pictures:
// a point is [forward, right, up]. Each line is its own stroke, running a little past its ends, like
// a quick drawing. How far, how it strays, and which parts get gone over twice all belong to each
// line, so they stay the same from one picture to the next and the drawing doesn't shimmer.

// How big each picture is, with room around it for the tail and the feet
export let mouseWidth = 230;
export let mouseHeight = 190;
// Where it stands in the picture
export let mouseFeetX = 115;
export let mouseFeetY = 130;
export let mouseSteps = 8; // How many pictures there are of each thing it does
export let mouseStride = 12; // How far a planted foot slides back each picture of its walk
// Which ways it can be facing, in eighths of a turn from facing away from us (0) round to facing us
// (4). Those turn it to the right, and get flipped to turn it to the left.
export let mouseViews = 5;
// What it can be doing, in each of those views
export let mouseSitting = 0;
export let mouseLowering = 1; // Going from sitting to walking, with its head coming down
export let mouseWalking = 2;
export let mouseActions = 3;

let groundTilt = 0.5; // How squashed the distance across the ground looks, seen from the camera (1 = from straight above)
let sitPitch = 0.6; // How far its body tips up when it sits, in radians
let walkPitch = 0.05; // ...and when it walks
let walkFlatten = 0.65; // How much of its height its body keeps when it walks, stretched out low
let headDown = 0.5; // How far its nose points down when it walks, in radians
let tailSwing = [0, 5, 13, 24, 36]; // How far each joint of its tail swings from side to side
let curveDetail = 6; // How many short pieces each bend of a curve is made of
let overshoot = [1, 5]; // How far a line runs past its ends
let wander = 1.2; // How far the points a line curves through can be from where they should be
let goneOver = 0.3; // What fraction of its outline gets a second, thinner line
let thin = 0.15; // How thick its whiskers are, compared to its other lines

// The body: its rump, its middle and its shoulders, along its length, then out from its middle and up
let bodyPoints = [
  [-8, 7, -4], [-8, 10, 19],
  [18, 16, -3], [18, 14, 26],
  [48, 9, 2], [48, 7, 19],
];
// The head, from its middle, ending in a point at its nose
let headPoints = [[-11, 5, -9], [-11, 12, 10], [4, 11, 11], [6, 5, -9]];
let nose = [24, 1.5, -11];

function mix(a, b, amount) {
  return a + (b - a) * amount;
}

// A number from 0 to 1 that's always the same for the same input, but looks random
function hash(x) {
  let h = Math.sin(x * 12.9898) * 43758.5453;
  return h - Math.floor(h);
}

// A smooth curve that bends toward each of these points in turn, as a list of points close together.
// An open one starts and ends on its first and last point.
function curveThrough(corners, closed = false) {
  let middle = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let curve = [];
  let count = corners.length;
  corners.forEach((corner, i) => {
    if (!closed && (i === 0 || i === count - 1)) return;
    let before = corners[(i - 1 + count) % count];
    let after = corners[(i + 1) % count];
    let from = !closed && i === 1 ? before : middle(before, corner);
    let to = !closed && i === count - 2 ? after : middle(corner, after);
    for (let n = 0; n < curveDetail; n++) {
      let t = n / curveDetail;
      curve.push([
        (1 - t) * (1 - t) * from[0] + 2 * t * (1 - t) * corner[0] + t * t * to[0],
        (1 - t) * (1 - t) * from[1] + 2 * t * (1 - t) * corner[1] + t * t * to[1],
      ]);
    }
  });
  if (closed) return curve;
  if (count === 2) curve.push(corners[0]);
  curve.push(corners[count - 1]);
  return curve;
}

// The outline around some points, which goes through only the outermost of them.
// Each point on the screen is [x, y, a number that says which point it is].
function outlineAround(points) {
  let sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let side = (list) => {
    let kept = [];
    for (let p of list) {
      while (kept.length > 1) {
        let [a, b] = [kept.at(-2), kept.at(-1)];
        if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) > 0) break;
        kept.pop();
      }
      kept.push(p);
    }
    return kept.slice(0, -1);
  };
  return [...side(sorted), ...side(sorted.reverse())];
}

// The parts of a line that aren't inside any of these outlines, as fractions of the way along it
function partsShowing(a, b, outlines) {
  let showing = [[0, 1]];
  for (let outline of outlines) {
    // How much of the line is inside this outline: it's inside all of the outline's edges at once
    let inside = [0, 1];
    outline.forEach((p, i) => {
      let q = outline[(i + 1) % outline.length];
      let edge = [q[0] - p[0], q[1] - p[1]];
      let start = edge[0] * (a[1] - p[1]) - edge[1] * (a[0] - p[0]);
      let change = edge[0] * (b[1] - a[1]) - edge[1] * (b[0] - a[0]);
      if (change === 0) {
        if (start < 0) inside = [1, 0];
      } else if (change > 0) {
        inside[0] = Math.max(inside[0], -start / change);
      } else {
        inside[1] = Math.min(inside[1], -start / change);
      }
    });
    if (inside[0] >= inside[1]) continue;
    showing = showing.flatMap(([from, to]) => [[from, Math.min(to, inside[0])], [Math.max(from, inside[1]), to]]).filter(([from, to]) => to - from > 0.01);
  }
  return showing;
}

// The mouse at this step of this action, facing this way. Gives the lines to draw, as
// { points, weight }, and the outlines of its solid parts, which are filled with white.
export function mousePose(step, view, action) {
  let walking = action === mouseWalking;
  let turn = (view * Math.PI) / 4;
  let [sinTurn, cosTurn] = [Math.sin(turn), Math.cos(turn)];
  let cycle = (step / mouseSteps) * Math.PI * 2;
  let swing = action === mouseLowering ? 0 : Math.sin(cycle);
  let bow = walking ? 1 : action === mouseLowering ? step / (mouseSteps - 1) : 0; // 0 = sitting up, 1 = head down
  let hop = walking ? Math.abs(Math.cos(cycle)) * 3 : 0;
  let quarter = mouseSteps / 4;
  let foot = walking ? (quarter - Math.abs(((step + quarter) % mouseSteps) - quarter * 2)) * mouseStride : 0;
  let lift = walking ? Math.cos(cycle) * 8 : 0;

  let onScreen = ([forward, right, up]) => [forward * sinTurn + right * cosTurn, -(forward * cosTurn - right * sinTurn) * groundTilt - up];
  let nearness = ([forward, right]) => right * sinTurn - forward * cosTurn; // How close to the camera a point is

  // Its body tips up around its rump
  let pitch = mix(sitPitch, walkPitch, bow);
  let rump = [-26, 0, mix(5, 24, bow) + hop];
  let flatten = mix(1, walkFlatten, bow);
  let onBody = ([along, right, up]) => [
    rump[0] + along * Math.cos(pitch) - up * flatten * Math.sin(pitch),
    right,
    rump[2] + along * Math.sin(pitch) + up * flatten * Math.cos(pitch),
  ];
  // Its head sits on its shoulders, and comes down in front of them
  let neck = onBody([56, 0, 7]);
  let headMiddle = [neck[0] + mix(6, 12, bow), 0, neck[2] + mix(4, -20, bow)];
  let headPitch = -headDown * bow;
  let onHead = ([along, right, up]) => [
    headMiddle[0] + along * Math.cos(headPitch) - up * Math.sin(headPitch),
    right,
    headMiddle[2] + along * Math.sin(headPitch) + up * Math.cos(headPitch),
  ];

  // Both sides of each of those points, numbered to tell them apart. That's what keeps a line's quirks the same.
  let bothSides = (points) => points.flatMap(([a, b, c]) => [[a, b, c], [a, -b, c]]);
  let numbered = (points, place, first) => points.map((p, i) => [...onScreen(place(p)), first + i]);
  // The outline's points stray a little, and it curves through them
  let outlineOf = (points, first) => outlineAround(points).map(([x, y, id]) => [
    x + (hash(first + id + 0.2) - 0.5) * 2 * wander,
    y + (hash(first + id + 0.3) - 0.5) * 2 * wander,
    id,
  ]);
  let bodyCorners = outlineOf(numbered(bothSides(bodyPoints), onBody, 0), 1000);
  let headCorners = outlineOf(numbered([...bothSides(headPoints), nose], onHead, 20), 3000);
  let bodyOutline = curveThrough(bodyCorners, true);
  let headOutline = curveThrough(headCorners, true);
  let solids = [
    { outline: bodyOutline, depth: nearness(onBody([20, 0, 10])) },
    { outline: headOutline, depth: nearness(headMiddle) + 0.5 },
  ];

  // Its neck, filling in between its shoulders and the back of its head, so there's no gap there when its head comes
  // down in front of its body (it's only filled in, with no line of its own)
  let neckCorners = outlineAround([
    ...numbered(bothSides([[44, 8, 2], [44, 7, 18]]), onBody, 100),
    ...numbered(bothSides([[-9, 6, -8], [-9, 10, 9]]), onHead, 110),
  ]);
  let neckOutline = curveThrough(neckCorners, true);

  let lines = [];
  let fills = [bodyOutline, neckOutline, headOutline];
  let face = { eyes: [], nose: null }; // Where its eyes and nose are, when they're toward us
  // Add a line along a curve, which is at this depth, so it's hidden by any solid in front of that.
  // key: says which line this is, from one picture to the next
  // reach: how far it runs past its ends, as a fraction of how far it usually would
  let addCurve = (curve, key, depth, weight = 1, reach = 1) => {
    let past = (salt) => mix(overshoot[0], overshoot[1], hash(key + salt)) * reach;
    let beyond = (end, inner, salt) => {
      let length = Math.hypot(end[0] - inner[0], end[1] - inner[1]) || 1;
      return [end[0] + ((end[0] - inner[0]) / length) * past(salt), end[1] + ((end[1] - inner[1]) / length) * past(salt)];
    };
    let whole = [beyond(curve[0], curve[1], 0.1), ...curve, beyond(curve.at(-1), curve.at(-2), 0.4)];
    let inFront = solids.filter((solid) => solid.depth > depth).map((solid) => solid.outline);
    // The pieces that aren't hidden join up into strokes, wherever they meet
    let stroke = null;
    whole.slice(1).forEach((b, i) => {
      let a = whole[i];
      for (let [start, end] of partsShowing(a, b, inFront)) {
        let at = (t) => [mix(a[0], b[0], t), mix(a[1], b[1], t)];
        let from = at(start);
        let last = stroke?.points.at(-1);
        if (!last || Math.hypot(last[0] - from[0], last[1] - from[1]) > 0.01) {
          stroke = { points: [from], weight, key };
          lines.push(stroke);
        }
        stroke.points.push(at(end));
      }
    });
  };
  // A closed outline, whose stroke carries on a little past where it started, with some of its bends
  // gone over again
  let addOutline = (corners, outline, first, depth) => {
    let around = [...outline, ...outline.slice(0, curveDetail + 1)];
    addCurve(around, first, depth);
    corners.forEach(([, , id], i) => {
      let key = first + id;
      if (hash(key + 0.7) >= goneOver) return;
      let [shiftX, shiftY] = [(hash(key + 0.8) - 0.5) * 3, (hash(key + 0.9) - 0.5) * 3];
      let bend = around.slice(i * curveDetail, (i + 1) * curveDetail + 1).map(([x, y]) => [x + shiftX, y + shiftY]);
      addCurve(bend, key + 0.5, depth, 0.6);
    });
  };

  addOutline(bodyCorners, bodyOutline, 1000, solids[0].depth);
  addOutline(headCorners, headOutline, 3000, solids[1].depth);

  // Its ears: a rounded shape on each side of the top of its head
  for (let side of [-1, 1]) {
    let ear = [[-2, 3 * side, 10], [-10, 17 * side, 3], [-8, 18 * side, 23]].map(onHead);
    let outline = curveThrough(ear.map(onScreen), true);
    addCurve([...outline, ...outline.slice(0, 2)], 5000 + side * 10, nearness(ear[2]) + solids[1].depth * 0.2);
    fills.push(outline);
  }

  // Its eyes, on whichever sides of its head are toward us (and, for drawing its face on its own, where they and
  // its nose are: see face)
  for (let side of [-1, 1]) {
    let eye = onHead([9, 6 * side, 3]);
    if (nearness(eye) > solids[1].depth + 2) {
      let [x, y] = onScreen(eye);
      addCurve(curveThrough([[x - 1, y], [x + 1, y]]), 5100 + side, 99, 1.1, 0);
      face.eyes.push([x, y]);
    }
  }
  if (face.eyes.length) face.nose = onScreen(onHead(nose));

  // Its legs. Sitting, its chest rests on its straight front legs, with its back legs folded up beside
  // its haunches. Walking, opposite corners go together, and the sliding is straight along the ground
  // in the screen's pixels, so that it matches how far the mouse moves on the screen.
  let leg = (front, side, slide, up, first) => {
    let hip = onBody(front ? [mix(40, 44, bow), 8 * side, 2] : [4, 12 * side, 6]);
    let ground = front ? [mix(8, 30, bow), mix(7, 13, bow) * side, Math.max(0, up)] : [mix(-4, -24, bow), mix(17, 12, bow) * side, Math.max(0, up)];
    let bend = front ? [ground[0] - 2, ground[1], (hip[2] + ground[2]) / 2] : [mix(hip[0] + 20, hip[0] + 10, bow), hip[1], mix(hip[2] + 6, ground[2] + 12, bow)];
    let slid = (point) => {
      let [x, y] = onScreen(point);
      return [x + slide * sinTurn, y - slide * cosTurn];
    };
    let ankle = slid(ground);
    let toe = slid([ground[0] + 9, ground[1], ground[2]]);
    let knee = onScreen(bend);
    if (bow > 0 && walking) {
      knee[0] += (slide / 2) * sinTurn;
      knee[1] -= (slide / 2) * cosTurn;
    }
    addCurve(curveThrough([onScreen(hip), knee, ankle, toe]), first, nearness(hip));
  };
  leg(true, -1, -foot, -lift, 6000);
  leg(false, 1, -foot, -lift, 6010);
  leg(true, 1, foot, lift, 6020);
  leg(false, -1, foot, lift, 6030);

  // Its tail lies along the ground behind it, swinging from side to side, more toward the tip
  let tailRoot = onBody([-8, 0, 3]);
  let tail = tailSwing.map((sideways, i) => onScreen([tailRoot[0] - i * 18, sideways * swing, i === 0 ? tailRoot[2] : 0]));
  addCurve(curveThrough(tail), 7000, nearness(tailRoot));

  // Its whiskers, drooping a little in the middle
  for (let side of [-1, 1]) {
    let root = onHead([19, 3 * side, -9]);
    [[30, 24, 6], [34, 27, -4], [28, 22, -14]].forEach(([along, out, up], i) => {
      let tip = onHead([along, out * side, up]);
      let [from, to] = [onScreen(root), onScreen(tip)];
      let droop = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + 4];
      addCurve(curveThrough([from, droop, to]), 8000 + side * 10 + i, nearness(root), thin);
    });
  }

  return { lines, fills, face };
}
