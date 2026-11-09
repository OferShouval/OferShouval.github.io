// Finger Aulos: play two triangle-wave pipes with your hands. The camera tracks them with ml5's handPose,
// and the distance between each thumb and index finger picks that hand's note. Click once to start the
// sound, which browsers require.
//
// ml5 and p5.sound load here rather than at the top of the file, since they need the global p5 set first,
// and so that nothing else on the site has to download them. The video stays on the visitor's device,
// though the hand-tracking model downloads from the web when the sketch starts.
import p5 from 'p5';

// just intonation
// const scale = [213.33, 240, 256, 288, 320, 341.33, 384, 426.67, 480, 512];
// const scale2 = [240, 256, 288, 320, 341.33, 384, 426.67, 480, 512, 576, 640];

const scale = [207, 220, 233.08, 261.63, 293.66, 329.63, 349.23, 392, 440];
const scale2 = [261.63, 293.66, 329.63, 349.23, 392, 440, 463.16, 523.25];

const options = {
  maxHands: 2,
  flipped: false,
  runtime: 'tfjs',
  modelType: 'full',
  detectorModelUrl: undefined, // default to use the tf.hub model
  landmarkModelUrl: undefined, // default to use the tf.hub model
};

export default function fingerAulos(p, container) {
  let amplitude = 0;
  let hands = [];
  let hand;
  let osc, osc2;
  let counter = 0;
  let finger1 = 0;
  let finger2 = 0;
  let thumb1 = 0;
  let thumb2 = 0;
  let video;

  p.setup = async () => {
    p.createCanvas(640, 480);

    window.p5 = p5;
    await import('p5.sound');
    const { default: ml5 } = await import('ml5');
    const handPose = await ml5.handPose(options); // p5 2 has no preload, so this waits here

    // Create the webcam video and hide it
    video = p.createCapture(p.VIDEO);
    video.size(640, 480);
    video.hide();
    // start detecting hands from the webcam video
    handPose.detectStart(video, (results) => (hands = results));

    osc = new p5.Oscillator(0, 'triangle');
    osc.freq(0);
    osc.start();

    osc2 = new p5.Oscillator(0, 'triangle');
    osc2.freq(0);
    osc2.start();
  };

  p.draw = () => {
    // Draw the webcam video
    p.background(0);
    p.image(video, 0, 0, p.width, p.height);

    // Draw all the tracked hand points
    for (let i = 0; i < hands.length; i++) {
      hand = hands[i];

      for (let j = 0; j < hand.keypoints.length; j++) {
        const keypoint = hand.keypoints[j];

        p.fill(0, 255, 0);
        if (j == counter) p.fill(255, 0, 0);

        if (j == 4 && i == 0) thumb1 = keypoint;
        if (j == 8 && i == 0) finger1 = keypoint;
        if (j == 4 && i == 1) thumb2 = keypoint;
        if (j == 8 && i == 1) finger2 = keypoint;

        p.noStroke();
        p.circle(keypoint.x, keypoint.y, 10);
      }
    }

    if (hands.length > 0 && thumb1 != 0 && finger1 != 0) {
      const distance = p.dist(thumb1.x, thumb1.y, finger1.x, finger1.y);

      p.stroke(255);
      p.strokeWeight(3);
      p.line(thumb1.x, thumb1.y, finger1.x, finger1.y);

      const note = p.constrain(p.floor(p.map(distance, 25, 280, 0, 8)), 0, 8);
      osc.freq(scale[note]);
    }

    if (hands.length > 1 && thumb2 != 0 && finger2 != 0) {
      const distance = p.dist(thumb2.x, thumb2.y, finger2.x, finger2.y);

      p.stroke(255);
      p.strokeWeight(3);
      p.line(thumb2.x, thumb2.y, finger2.x, finger2.y);

      // scale2 has one note fewer than scale, so this stops at its last one
      const note = p.constrain(p.floor(p.map(distance, 25, 280, 0, 8)), 0, 7);
      osc2.freq(scale2[note]);
    }

    // Fade out when the hands leave the screen, and back in when they return
    if (hands.length == 0) {
      if (amplitude > 0) amplitude *= 0.95;
    } else if (amplitude < 1) {
      amplitude += 0.03;
    }

    osc.amp(amplitude);
    osc2.amp(amplitude);
  };

  p.mousePressed = () => {
    p.userStartAudio();

    counter++;
    if (counter > 20) counter = 0;
  };
}
