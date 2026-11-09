// The colour scheme shared by the ripple circles and the boat's wake lines.
// amount goes from 0 to 1 along a trail; colours shift through blues, greens and pinks,
// with a little random flicker. The boat going through a gate turns everything white (see
// turnWhite()). With greyscale on, every colour is
// turned into a grey instead, as light as its brightest part, so it still flickers.

let whiteOut = false;
export let greyscale = true; // Everything in shades of grey (false = in colour)

// The colour (r, g, b), or the grey as light as its brightest part when greyscale is on
function shade(r, g, b, alpha) {
  if (greyscale) return color(max(r, g, b), alpha);
  return color(r, g, b, alpha);
}

// Turn everything white (or back)
export function turnWhite(on) {
  whiteOut = on;
}

// Should everything be white right now?
export function isWhite() {
  return whiteOut;
}

export default function rippleColor(amount, alpha) {
  if (isWhite()) return color(255, alpha);
  let s = abs(sin(amount * PI));
  let c = abs(cos(amount * PI));
  return shade(random(150, 255) * s, random(150, 255) * c, 255 - random(100, 255) * s, alpha);
}

// The same colours as rippleColor(), even when greyscale is on: colourful goes from 1 (in full
// colour) to 0 (the grey it would otherwise be), for colours that fade away
export function fadingColor(amount, alpha, colourful) {
  if (isWhite()) return color(255, alpha);
  let s = abs(sin(amount * PI));
  let c = abs(cos(amount * PI));
  let r = random(150, 255) * s;
  let g = random(150, 255) * c;
  let b = 255 - random(100, 255) * s;
  let grey = max(r, g, b);
  // Some of these mix to nearly grey, so stretch them to as colourful as they can be
  let least = min(r, g, b);
  let stretch = (v) => (grey > least ? ((v - least) / (grey - least)) * grey : v);
  return color(lerp(grey, stretch(r), colourful), lerp(grey, stretch(g), colourful), lerp(grey, stretch(b), colourful), alpha);
}

// Any colour, with the same flicker as the ripples: every frame each of its red, green and
// blue is dimmed by a random amount (like random(150, 255) above). White when isWhite().
export function flicker(hex, alpha) {
  if (isWhite()) return color(255, alpha);
  let c = color(hex);
  return shade(red(c) * random(0.6, 1), green(c) * random(0.6, 1), blue(c) * random(0.6, 1), alpha);
}
