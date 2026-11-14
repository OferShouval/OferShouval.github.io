// How the boat's moving, kept up to date by the sketch every frame (see draw() in sketch.js), for the sound of the
// water against it to follow (see wash.js)
export const motion = {
  speed: 0, // How fast it's going, compared to its usual top speed (more than 1 when it's hurrying to a gate)
  turn: 0, // How fast it's turning, in radians a second (positive = clockwise, to the right)
  x: 0, // Where it is across the screen, from -1 (the left edge) to 1 (the right)
  onScreen: false, // Is it on the screen yet?
};
