// Psychworm in squares, and its paint stays on the canvas. Hold the mouse down to wash it away.
export default function boxyworm(p, container) {
  const length = 70;
  const xValue = new Array(length);
  const yValue = new Array(length);
  const coswave = new Array(length);
  const sinwave = new Array(length);

  p.setup = () => {
    p.createCanvas(container.clientWidth, container.clientHeight);
    p.background(0);
    p.cursor(p.CROSS);
    for (let i = 0; i < length; i++) {
      const amount = p.map(i, 0, length, 0, p.PI);
      coswave[i] = p.abs(p.cos(amount));
      sinwave[i] = p.abs(p.sin(amount));
    }
  };

  p.draw = () => {
    if (p.mouseIsPressed) p.background(0, 50);
    p.rectMode(p.CENTER);
    p.fill(0);

    for (let i = 0; i < yValue.length - 1; i++) {
      yValue[i] = yValue[i + 1];
      xValue[i] = xValue[i + 1];
      if (xValue[i] === undefined) continue; // trail still filling up
      p.stroke(p.random(100, 255) * sinwave[i], p.random(100, 255) * coswave[i], 255 - p.random(100, 255) * sinwave[i]);
      const diameter = p.sin(p.map(i, 0, yValue.length, 0, p.PI)) * p.width / 8;
      p.rect(xValue[i], yValue[i], diameter, diameter);
    }
    p.strokeWeight(p.random(1, 2));

    yValue[yValue.length - 1] = p.mouseY;
    xValue[xValue.length - 1] = p.mouseX;
  };
}
