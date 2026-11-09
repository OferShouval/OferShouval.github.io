let frames = [];

let xLoc = 0, yLoc = 0

let reverse = 1
let walkCycle
let guys = []

async function setup() {


  createCanvas(windowWidth, windowHeight);

  
  // frameRate(12);
  imageMode(CENTER)

  for (let i = 1; i <= 12; i++) {
    frames.push(await loadImage('walk_cycle_png_sequence/' + i + '.png'));
  }

  for(let j = 0; j<500; j++){
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
    this.sizeScalar = map(this.yLoc, 0,height, 0.2,1)
    this.direction = random([1, -1]);
    // print(this.direction)
    this.cycleSpeed = floor(random(1,5))
    this.velocity = 7.5*this.sizeScalar
    this.counter = 0
    this.framesElapsed = 0
    this.img = frames[this.counter % frames.length];
   

  }

  
  move(){
  
    this.img = frames[this.framesElapsed % frames.length];
    push();

    translate(this.xLoc,this.yLoc );
    scale(this.direction*this.sizeScalar, this.sizeScalar);
    // tint(255, 127);
    image(this.img, 0, 0);
    pop();


    

    if(this.direction == 1 && this.xLoc  > width)
    {
      this.xLoc = 0 
      
    }
    else if(this.direction == -1 && this.xLoc < 0)
    {
      this.xLoc = width
    }


    if(this.counter % this.cycleSpeed == 0){
      this.framesElapsed ++
      this.xLoc += this.velocity * this.direction;
      // print(this.framesElapsed)
    }
    this.counter++


    }


}

function mousePressed(){
  // guys.push(new Guy(mouseX, mouseY))

  // print(guys)
}

