var wLength = 150;
var xValue = new Array(wLength);
var yValue = new Array(wLength);
var coswave = new Array(wLength);
var sinwave = new Array(wLength);
var canvas;
function windowResized(){
resizeCanvas(windowWidth,windowHeight);

}
function setup() {
  canvas = createCanvas(windowWidth, windowHeight);
	canvas.position(0,0);
  canvas.style("z-index","-1");
  cursor(CROSS);


  for (var i = 0; i < wLength; i++) {
    var amount = map(i, 0, wLength, 0, PI);
    coswave[i] = abs(cos(amount));
    sinwave[i] = abs(sin(amount));

  }
}

function draw() {

  background(0);
  fill(0);


  for (var i = 0; i < yValue.length - 1; i++) {

    yValue[i] = yValue[i + 1];
    xValue[i] = xValue[i + 1];

    var diameter = sin(map(i, 0, yValue.length, 0, PI));
    var fade = sin(map(i, 0, yValue.length, 0, HALF_PI));
    var scalar = map(yValue[i],0,windowHeight,0,1);


    if (mouseIsPressed == true) {
      strokeWeight(random(1.8, 2));
      stroke(255, 255 * fade);
      ellipse(xValue[i], yValue[i], (diameter* 200*scalar), (diameter*75*(scalar*scalar)));
    } 
    else {
    strokeWeight(1.8,2)
      stroke(random(150, 255) * sinwave[i], random(150, 255) * coswave[i], 255 - random(100, 255) * sinwave[i], 255 * fade);
      ellipse(xValue[i], yValue[i], (diameter* 200*scalar), (diameter*75*(scalar*scalar)));
    }
  }

  if (pmouseX != mouseX || pmouseY != mouseY) {
    yValue[yValue.length - 1] = mouseY + random(-30, 30);
    xValue[xValue.length - 1] = mouseX + random(-70, 70);
  } else {
    yValue[yValue.length - 1] = random(height);
    xValue[xValue.length - 1] = random(width);
  }

}