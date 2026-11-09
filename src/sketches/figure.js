// Figure class
// A stick figure walking, made of shapes: a ring for a head, and lines for the rest. It's the
// 12-frame walk cycle in public/media/walk_cycle, redrawn as a skeleton so it can be adjusted:
// change the proportions, line weights, colours or how far the limbs swing (see the constructor).
//
// There are really only 6 poses: for the second half of the cycle, the near limbs (black, on
// top) do what the far limbs (grey) just did, and the other way round.
//
// The figure is measured in the old frames' pixels (about 150 tall) and scaled up or down when
// it's drawn. Each pose is a list of angles, in degrees: 0 points straight down, and bigger
// angles swing forward, the way it's walking. So a foot flat on the ground is 90.

export let poses = [
  { neck: -3.1, torso: -5.1, near: { arm: [-20.8, -10], leg: [31, 13, 121.9] }, far: { arm: [10.5, 45.7], leg: [13.3, -42.4, 60] } },
  { neck: 0.7, torso: -7.6, near: { arm: [-17.4, -4.1], leg: [33, 2, 90] }, far: { arm: [12.2, 57.1], leg: [8.1, -44.1, 49.5] } },
  { neck: -2.3, torso: -4.8, near: { arm: [-10.5, 3.1], leg: [22.7, -2.6, 90] }, far: { arm: [12.6, 52.5], leg: [12.5, -51.7, 56.2] } },
  { neck: -4.1, torso: -5.1, near: { arm: [-2.3, 7.7], leg: [17.6, -8, 90] }, far: { arm: [4.9, 28.1], leg: [34.1, -47.3, 56.9] } },
  { neck: -4.2, torso: -2.5, near: { arm: [0.6, 19.6], leg: [12.1, -17.1, 90] }, far: { arm: [-6.4, 2.2], leg: [42.2, -28.8, 79] } },
  { neck: -3.8, torso: -4.5, near: { arm: [6.1, 32.6], leg: [11.4, -25.7, 90] }, far: { arm: [-16.2, -4.8], leg: [39.1, -1.5, 97.9] } },
];

export default class Figure {
  // Change any of these by passing them in: new Figure({ thigh: 50, nearColour: 'red' })
  constructor(settings) {
    this.headRadius = 10.5; // To the middle of the ring's line
    this.headWeight = 4.75; // How thick the ring is
    this.weight = 4.5; // How thick the body and limbs are
    this.neck = 15.65; // From the middle of the head to the shoulders
    this.torso = 46.25; // From the shoulders to the hips
    this.upperArm = 30.33;
    this.lowerArm = 22.16;
    this.thigh = 35.98;
    this.shin = 39.91;
    this.foot = 11.91;
    this.lean = 0; // How far the body tips forward, in degrees
    this.armSwing = 1; // How far the arms swing (1 = as drawn, 0 = hanging straight down)
    this.legSwing = 1; // How far the legs swing (1 = as drawn). Bigger strides move faster: see stride().
    this.hair = null; // null (none), 'long', 'bob', 'ponytail' or 'bun'
    this.skirt = 0; // How far down the legs a skirt reaches (0 = no skirt, 1 = to the knees)
    this.skirtFlare = 9; // How far a skirt's hem always sticks out either side of the hips
    this.nearColour = 'rgb(0, 0, 0)';
    this.farColour = 'rgb(130, 130, 130)';
    Object.assign(this, settings);
  }

  // How far the figure has to move each step of its walk cycle for its planted foot to stay put
  // on the ground. It follows from the proportions, so walking stays right however they change.
  stride() {
    let start = this.joints(poses[1]).near.leg[2];
    let end = this.joints(poses[5]).near.leg[2];
    return (start.x - end.x) / 4;
  }

  // Where every joint is in a pose, working down from the head (x = 0), then lifted or lowered
  // so that the lowest foot is on the ground (y = 0)
  joints(pose) {
    let head = { x: 0, y: 0 };
    let shoulders = this.along(head, pose.neck, this.neck);
    let hips = this.along(shoulders, pose.torso + this.lean, this.torso);
    let side = (limbs) => {
      let elbow = this.along(shoulders, limbs.arm[0] * this.armSwing, this.upperArm);
      let hand = this.along(elbow, limbs.arm[1] * this.armSwing, this.lowerArm);
      let knee = this.along(hips, limbs.leg[0] * this.legSwing, this.thigh);
      let ankle = this.along(knee, limbs.leg[1] * this.legSwing, this.shin);
      let toe = this.along(ankle, limbs.leg[2], this.foot);
      return { arm: [shoulders, elbow, hand], leg: [hips, knee, ankle, toe] };
    };
    let near = side(pose.near);
    let far = side(pose.far);
    let ground = Math.max(near.leg[2].y, near.leg[3].y, far.leg[2].y, far.leg[3].y);
    return { head, shoulders, hips, near, far, ground };
  }

  // The point a limb of this length reaches from `from`, at this angle
  along(from, angle, length) {
    let radians = (angle * Math.PI) / 180;
    return { x: from.x + Math.sin(radians) * length, y: from.y + Math.cos(radians) * length };
  }

  // Draw the figure at step number `step` of its walk cycle, standing on the point (x, y).
  // size: 1 = the size of the old frames
  // direction: 1 = walking to the right, -1 = to the left
  show(step, x, y, size = 1, direction = 1) {
    let j = this.joints(poses[step % poses.length]);
    let swapped = Math.floor(step / poses.length) % 2 === 1;

    // Drawn straight on the canvas, rather than with p5's line(), since there can be a lot of figures
    let ctx = drawingContext;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(direction * size, size);
    ctx.translate(0, -j.ground);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = this.weight;

    this.showLimbs(swapped ? j.near : j.far, this.farColour);
    this.showLimbs(swapped ? j.far : j.near, this.nearColour);
    if (this.skirt > 0) this.showSkirt(j);

    ctx.strokeStyle = this.nearColour;
    ctx.fillStyle = this.nearColour;
    ctx.beginPath();
    ctx.moveTo(j.shoulders.x, j.shoulders.y);
    ctx.lineTo(j.hips.x, j.hips.y);
    ctx.stroke();

    ctx.lineWidth = this.headWeight;
    ctx.beginPath();
    ctx.arc(j.head.x, j.head.y, this.headRadius, 0, Math.PI * 2);
    ctx.stroke();
    if (this.hair) this.showHair(step);
    ctx.restore();
  }

  // A filled skirt from just above the hips, with its hem following the legs as they swing
  showSkirt(j) {
    let ctx = drawingContext;
    let reach = (leg) => j.hips.x + (leg[1].x - j.hips.x) * this.skirt;
    let drop = (leg) => j.hips.y + (leg[1].y - j.hips.y) * this.skirt;
    let hemFront = Math.max(reach(j.near.leg), reach(j.far.leg), j.hips.x + this.skirtFlare);
    let hemBack = Math.min(reach(j.near.leg), reach(j.far.leg), j.hips.x - this.skirtFlare);
    let hemY = (drop(j.near.leg) + drop(j.far.leg)) / 2;
    let waistY = j.hips.y - this.torso * 0.2;
    ctx.fillStyle = this.nearColour;
    ctx.beginPath();
    ctx.moveTo(j.hips.x + (j.shoulders.x - j.hips.x) * 0.2, waistY);
    ctx.lineTo(hemFront, hemY);
    ctx.lineTo(hemBack, hemY);
    ctx.closePath();
    ctx.fill();
  }

  // Hair, on the back of the head (which is the head's -x side, whichever way it's walking)
  showHair(step) {
    let ctx = drawingContext;
    let r = this.headRadius;
    ctx.beginPath();
    if (this.hair === 'long' || this.hair === 'bob') {
      // From the top of the head, round the back and down, then back up to follow the ring
      let length = this.hair === 'long' ? 2.2 : 1.1;
      ctx.moveTo(0.31 * r, -0.95 * r);
      ctx.quadraticCurveTo(-1.6 * r, -1.3 * r, -1.4 * r, length * r);
      ctx.lineTo(-0.7 * r, length * r);
      ctx.quadraticCurveTo(-0.8 * r, 0.8 * r, -r, 0);
      ctx.arc(0, 0, r, Math.PI, 1.6 * Math.PI);
      ctx.fill();
    } else if (this.hair === 'ponytail') {
      // It bounces with every step
      ctx.moveTo(-0.9 * r, -0.3 * r);
      ctx.quadraticCurveTo(-2 * r, -0.6 * r, -1.9 * r, (1.1 + (step % 2) * 0.15) * r);
      ctx.stroke();
    } else if (this.hair === 'bun') {
      ctx.arc(-0.75 * r, -0.85 * r, 0.42 * r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // One arm and one leg, as a single shape
  showLimbs(limbs, colour) {
    let ctx = drawingContext;
    ctx.strokeStyle = colour;
    ctx.beginPath();
    for (let limb of [limbs.arm, limbs.leg]) {
      ctx.moveTo(limb[0].x, limb[0].y);
      for (let i = 1; i < limb.length; i++) ctx.lineTo(limb[i].x, limb[i].y);
    }
    ctx.stroke();
  }
}
