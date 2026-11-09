let xOff = 0,
  pxOff = 0,
  yOff = 0,
  pyOff = 0;
let counter = 0;
let interval = 0.05;
let tightness = 10.0;
let rotation = 0;
let roughness = 1;
let rotationSpeed = 1;
let stats;

let bkg = 255,
  opc = 255,
  dOpc = 0.5,
  strk = 0,
  strkwt = 3,
  resolution = 30;

function setup() {
  createCanvas(windowWidth, windowHeight);

  stats = createGraphics(windowWidth, 100);
  strokeWeight(strkwt);

  frameRate(12);
  noCursor();
}

function draw() {
  stroke(strk);
  background(bkg, opc);

  stats.fill(strk);
  //stats.background(bkg)
  stats.text(
    "try pressing the following buttons: numbers, arrows, spacebar. click for fullscreen",
    20,
    20
  );
  //stats.text("dOpc -" + dOpc,20,40);

  // stats.ellipse(0,0,100)

  image(stats, 10, 10);
  translate(width / 2, height / 2);

  // rotate(map(mouseX, 0, width, 0, 10 * TWO_PI));/3
  rotate(rotation);

  while (xOff < width / 2.8 && yOff < height / 2.8) {
    pxOff = xOff;
    pyOff = yOff;
    xOff =
      counter * (counter / tightness) * cos(counter) +
      (xOff / roughness) * noise(counter);
    
    // xOff = sin(counter);
    
    
    yOff =
      counter * (counter / tightness) * sin(counter) +
      (yOff / roughness) * noise(counter);

    strkwt = map(counter, 0, resolution, 2, 3);
    strokeWeight(strkwt);

    line(xOff, yOff, pxOff, pyOff);

    counter += interval;
  }

  resolution = counter;
  xOff = 0;
  pxOff = 0;
  yOff = 0;
  pyOff = 0;
  counter = 0;

  noiseSeed(random(100));
  rotation += rotationSpeed;

  if (roughness < 9) {
    roughness += 0.05;
  }

  if (tightness > 5) {
    tightness -= 5;
  }

  if (opc < 255) {
    opc += dOpc;
  }
  fill(0);
}

function keyPressed() {
  // if (key === 's') {
  //   saveFrames('spiral', 'png', 5, 12);
  // }
  if (keyCode == "49") {
    roughness = 0.7;
    tightness = random(20, 100);
  }
  if (keyCode == "50") {
    tightness = random(180, 200);
    roughness = 3;
  }
  
   if (keyCode == "51") {
    tightness = random(100);
    roughness = 4;
  }
    if (keyCode == "52") {
    roughness = 0.5;

    tightness = random(1000, 2000);
  }
  if (keyCode == "53") {
    roughness = 0.5;
    tightness = random(1, 4);
  }


 
  if (keyCode == "32") {
    opc = 0;
  }
  if (keyCode == 38) {
    strk = 255;
    bkg = 0;
  }
  if (keyCode == 40) {
    strk = 0;
    bkg = 255;
  }

  if (keyCode == 39) {
    if (dOpc >= 0) {
      dOpc -= 0.1;
    }
  }
  if (keyCode == 37) {
    dOpc += 0.1;
  }

  // print(opc);
}

function mousePressed() {
  if (mouseX > 0 && mouseX < width && mouseY > 0 && mouseY < height) {
    let fs = fullscreen();
    fullscreen(!fs);

    sleep(300).then(function () {
      resizeCanvas(windowWidth, windowHeight);
    });
  }
}

function sleep(millisecondsDuration) {
  return new Promise((resolve) => {
    setTimeout(resolve, millisecondsDuration);
  });
}