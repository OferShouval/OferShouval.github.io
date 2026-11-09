// "Wake" (2019), which the home page grew out of: rings on the water that follow the mouse, and come up
// anywhere when it stops. Hold the mouse down to turn them white.
export default function wake(p, container) {
  const length = 150;
  const xValue = new Array(length);
  const yValue = new Array(length);
  const coswave = new Array(length);
  const sinwave = new Array(length);

  p.setup = () => {
    p.createCanvas(container.clientWidth, container.clientHeight);
    p.cursor(p.CROSS);
    for (let i = 0; i < length; i++) {
      const amount = p.map(i, 0, length, 0, p.PI);
      coswave[i] = p.abs(p.cos(amount));
      sinwave[i] = p.abs(p.sin(amount));
    }
  };

  p.draw = () => {
    p.background(0);
    p.fill(0);

    for (let i = 0; i < yValue.length - 1; i++) {
      yValue[i] = yValue[i + 1];
      xValue[i] = xValue[i + 1];
      if (xValue[i] === undefined) continue; // trail still filling up

      const diameter = p.sin(p.map(i, 0, yValue.length, 0, p.PI));
      const fade = p.sin(p.map(i, 0, yValue.length, 0, p.HALF_PI));
      const scalar = p.map(yValue[i], 0, p.height, 0, 1);

      if (p.mouseIsPressed) {
        p.strokeWeight(p.random(1.8, 2));
        p.stroke(255, 255 * fade);
      } else {
        p.strokeWeight(1.8);
        p.stroke(p.random(150, 255) * sinwave[i], p.random(150, 255) * coswave[i], 255 - p.random(100, 255) * sinwave[i], 255 * fade);
      }
      p.ellipse(xValue[i], yValue[i], diameter * 200 * scalar, diameter * 75 * (scalar * scalar));
    }

    if (p.pmouseX != p.mouseX || p.pmouseY != p.mouseY) {
      yValue[yValue.length - 1] = p.mouseY + p.random(-30, 30);
      xValue[xValue.length - 1] = p.mouseX + p.random(-70, 70);
    } else {
      yValue[yValue.length - 1] = p.random(p.height);
      xValue[xValue.length - 1] = p.random(p.width);
    }
  };
}
