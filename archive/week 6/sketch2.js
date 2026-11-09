let frames = [];

let xLoc = 0, yLoc = 0

let reverse = 1
let walkCycle
let guys = []

async function setup() {
  createCanvas(windowWidth, windowHeight);
  frameRate(12);

  imageMode(CENTER)

  for (let i = 1; i <= 12; i++) {
    frames.push(await loadImage('walk_cycle_png_sequence/' + i + '.png'));
  }

  for(let j = 0; j<50; j++){
    guys[j] = new Guy(random(width), random(100,height-200))

  }
 
  
}

function draw() {
  background(240);
  
for(let i = 0; i<guys.length; i++){
guys[i].move()
}
    
}


class Guy{

  constructor(x,y){


    this.xLoc = x
    this.yLoc = y
    this.sizeScalar = map(this.yLoc, 0,height, 0.2,1.2)
    this.direction = random([1, -1]);
    // print(this.direction)
    this.velocity = 7.5*this.sizeScalar
    this.counter = 0
    this.img = frames[this.counter % frames.length];
   

    // this.xLoc = x
    // this.yLoc = (this.sizeScalar)/2 * height/2
  }

  
  move(){
  
    this.img = frames[this.counter % frames.length];
    push();

    translate(this.xLoc,this.yLoc );
    scale(this.direction*this.sizeScalar, this.sizeScalar);
    image(this.img, 0, 0);
    pop();
    this.xLoc += this.velocity * this.direction;

    if(this.direction == 1 && this.xLoc  > width)
    {
      this.xLoc = 0 
      
    }
    else if(this.direction == -1 && this.xLoc < 0)
    {
      this.xLoc = width
    }


    this.counter++

    }


}

function mousePressed(){
  guys.push(new Guy(mouseX, mouseY))

  // print(guys)
}

