

let flowers = [];

function setup() {
  createCanvas(windowWidth, windowHeight);
  angleMode(DEGREES);
}

function draw() {
  background(220);

  for (const flower of flowers) {
    flower.move();
    flower.display();
  }
}

function mouseDragged() {
  flowers.push(new Flower(mouseX, mouseY));
}

class Flower {
  constructor(x, y) {
    this.loc = createVector(x, y);
    this.vel = createVector(random(-5, 5), random(-5, 5));

    this.numPetals = random(3, 12);
    this.petalLength = random(30, 80);
    this.petalWidth = random(10, 30);
    this.centerDiameter = random(10, 40);
    this.centerCol = color(random(255), random(255), random(255));
    this.petalCol = color(random(255), random(255), random(255));
    this.rotationSpeed = (random(1, 8));
    this.rotations = 0;
    
  }

  move() {
    
    
    if(this.loc.x > width){
      this.loc.x = 0;
     
    }
     if(this.loc.x < 0){
      this.loc.x = width;
    }

    if(this.loc.y > height){
      this.loc.y = 0;
    }
     if(this.loc.y < 0){
      this.loc.y = height;
    }
    
    this.loc.add(this.vel);
    
  }

  display() {
    push();

    translate(this.loc.x, this.loc.y);

    rotate(this.rotations);
    for (let i = 0; i < this.numPetals; i++) {
      fill(this.petalCol);
      rotate(360 / this.numPetals);
      ellipse(this.petalLength / 2, 0, this.petalLength, this.petalWidth);
    }

    fill(this.centerCol);
    ellipse(0, 0, this.centerDiameter, this.centerDiameter);

    pop();
    
     this.rotations+= this.rotationSpeed
  }
  
  
}