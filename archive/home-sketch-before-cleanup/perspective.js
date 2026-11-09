// Perspective: how the camera sees the water.
// The ripples, the whirlpools and the boat all use these, so they look like they're
// sitting on the same surface.
//
// The horizon is at the top of the screen. The further down the screen something is,
// the closer it is to the camera, so:
//   it's drawn bigger (depth), and
//   it's seen from higher up, so a flat circle on the water looks less squashed (flatness).
// That's how a real camera sees a flat surface: width grows with distance below the
// horizon, and height grows twice as fast.

// How close to the camera something at height y on the screen is:
// 0 at the horizon (top of the screen), 0.8 at the bottom
export function depth(y) {
  return constrain(map(y, 0, height, 0, 0.8), 0.05, 1);
}

// How tall a flat circle on the water at height y looks, compared to how wide
// (1 = perfectly round, 0 = a flat line). Raise the 0.375 to look down at the water
// from higher up (rounder ripples, a more top-down boat), lower it for a lower view.
export function flatness(y) {
  return 0.375 * depth(y);
}
