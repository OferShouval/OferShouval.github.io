// The webcam as a grid of white squares, mirrored, each as big as that part of the picture is bright.
// It asks for the camera when it starts, and what it sees never leaves the browser.
export default function linearBoil(p, container) {
  const vScale = 16;
  let video;

  p.setup = () => {
    p.createCanvas(container.clientWidth, container.clientHeight);
    p.pixelDensity(1);
    video = p.createCapture(p.VIDEO);
    video.size(p.width / vScale, p.height / vScale);
    video.hide();
  };

  p.draw = () => {
    p.background(51);
    p.rectMode(p.CENTER);
    p.noStroke();
    p.fill(255);

    video.loadPixels();
    if (!video.pixels.length) return; // camera still starting
    for (let y = 0; y < video.height; y++) {
      for (let x = 0; x < video.width; x++) {
        const index = (video.width - x + 1 + y * video.width) * 4;
        const bright = (video.pixels[index] + video.pixels[index + 1] + video.pixels[index + 2]) / 3;
        const w = p.map(bright, 0, 255, 0, vScale);
        p.rect(x * vScale, y * vScale, w, w);
      }
    }
  };
}
