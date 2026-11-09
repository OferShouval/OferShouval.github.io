// The colours. Everything flickers a little in shades of grey. The boat going through a gate
// turns everything white.

let whiteOut = false;

// Turn everything white (or back)
export function turnWhite(on) {
  whiteOut = on;
}

// The grey for `amount` (0 to 1) along a sequence, with a little random flicker
export function grey(amount, alpha) {
  if (whiteOut) return color(255, alpha);
  let s = abs(sin(amount * PI));
  let c = abs(cos(amount * PI));
  return color(Math.max(random(150, 255) * s, random(150, 255) * c, 255 - random(100, 255) * s), alpha);
}

// The boat's grey, with a little random flicker
export function boatGrey(alpha) {
  if (whiteOut) return color(255, alpha);
  return color(180 * Math.max(random(0.6, 1), random(0.6, 1), random(0.6, 1)), alpha);
}
