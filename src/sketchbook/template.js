// Starting point for a new sketch: copy this file to src/sketchbook/<name>.js.
//
// - Write it in instance mode: every p5 function and variable goes through `p` (p.ellipse, p.mouseX...).
// - `container` is the element the sketch lives in. Create the canvas at its size; it's resized
//   automatically when the container changes, so draw relative to p.width and p.height.
// - Mouse position is relative to this canvas, but p.mouseIsPressed and key events are page-wide.
//   To react only to clicks on this sketch, use canvas.mousePressed(...) as below.
export default function template(p, container) {
  let hue = 0;

  p.setup = () => {
    const canvas = p.createCanvas(container.clientWidth, container.clientHeight);
    canvas.mousePressed(() => (hue = p.random(360)));
    p.colorMode(p.HSB);
    p.noStroke();
  };

  p.draw = () => {
    p.background(0, 0, 0, 0.1);
    p.fill(hue, 80, 100);
    p.circle(p.mouseX, p.mouseY, p.width / 10);
  };
}
