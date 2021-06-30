var xValue = new Array(70);
var yValue = new Array(70);
var coswave = new Array(70);
var sinwave = new Array(70);

var psychwormCanvas;
var containerSize, pContainerSize;

function resize() {
  resizeCanvas(containerSize.width-4, 700);
}

function setup() {
  //delay(1000);
  containerSize = select('#psychwormContainer').size();
  //  console.log();
  // var psychwormCanvas = createCanvas(500,500);
  psychwormCanvas = createCanvas(containerSize.width, 700);
  psychwormCanvas.parent('psychwormContainer');
  fill(0);
  background(0);
  cursor(CROSS);
  for (var i = 0; i < 70; i++) {
    var amount = map(i, 0, 70, 0, PI);
    coswave[i] = abs(cos(amount));
    sinwave[i] = abs(sin(amount));

  }


}

function draw() {

   if(mouseIsPressed==true){
     background(0,0)
   }
   else if (mouseIsPressed==false)
   {
     background(0,50);
    }

  if (containerSize.width != select('#psychwormContainer').size().width) {
    containerSize = select('#psychwormContainer').size();

    resize();
  }


  for (var i = 0; i < yValue.length - 1; i++) {
    yValue[i] = yValue[i + 1];
    xValue[i] = xValue[i + 1];
    stroke(random(100, 255) * sinwave[i], random(100, 255) * coswave[i], 255 - random(100, 255) * sinwave[i]);
    var diameter = sin(map(i, 0, yValue.length, 0, PI)) * width/8;
    ellipse(xValue[i], yValue[i], (diameter), (diameter));
  }
  strokeWeight(random(1, 2));

  yValue[yValue.length - 1] = mouseY;
  xValue[xValue.length - 1] = mouseX;
}
