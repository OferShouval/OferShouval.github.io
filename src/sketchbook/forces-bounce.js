// The Nature of Code
// Daniel Shiffman
// http://natureofcode.com

class Mover {
  constructor(i) {
    this.mass = random(0.3, 3);
    this.position = createVector(random(width), 30);
    this.velocity = createVector(random(-1, 1), 0);
    this.acceleration = createVector(0, 0);
    this.col = color(220);
    this.diameter = 50 * this.mass;
    this.index = i;
  
  }

  applyForce(force) {
    this.acceleration = createVector(0, 0);

    let f = p5.Vector.div(force, 1);

    this.acceleration.add(f);
  }

  update() {
    this.velocity.add(this.acceleration);
    
    //friction
    this.velocity.mult(0.9995);
    
    //speed limit
    this.velocity.limit(10);
    
    
    this.position.add(this.velocity);
    this.acceleration.mult(0);
  }

  show() {
    stroke(255);
    strokeWeight(2);
    fill(this.col);
    ellipse(this.position.x, this.position.y, this.diameter);

    fill(0);
    // text(this.index, this.position.x, this.position.y);
  }

  checkEdges() {
    if (this.position.x > width) {
      this.position.x = width;
      this.velocity.x *= -1;
    } else if (this.position.x < 0) {
      this.velocity.x *= -1;
      this.position.x = 0;
    }
    if (this.position.y > height) {
      this.velocity.y *= -1;
      this.position.y = height;
    }
  }

  checkCollision() {
    let d = width;

    this.col = color(220);
    for (let j = 0; j < movers.length; j++) {
      if (j != this.index) {
        //print(j)

        // line(
        //   this.position.x,
        //   this.position.y,
        //   movers[j].position.x,
        //   movers[j].position.y
        // );

        d = dist(
          this.position.x,
          this.position.y,
          movers[j].position.x,
          movers[j].position.y
        );

        let minDistance = (this.diameter + movers[j].diameter) / 2;

        if (d < minDistance) {
          this.col = color(255, 0, 0);

          let overlap = minDistance - d;
          let n = p5.Vector.sub(this.position, movers[j].position).normalize();

          let correction = n.copy().mult(overlap / 2);

          this.position.add(correction);

          let speedIntoCollision = this.velocity.dot(n);
          let velocityComponent = n
            .mult(speedIntoCollision)
            .mult(movers[j].mass / this.mass);

          this.velocity.sub(velocityComponent.mult(2));
        }
      }
    }
  }
}

// The Nature of Code
// Daniel Shiffman
// http://natureofcode.com

//press c to add movers

let movers = [];

function setup() {
  createCanvas(windowWidth, windowHeight);
  
  createP("Click mouse to apply wind force.");
}

function draw() {
  background(255,10);

  let gravity = createVector(0, 0.1);
  
  
  for(let i = 0; i<movers.length; i++){
    
    
     movers[i].applyForce(gravity);

  if (mouseIsPressed) {
    
    let dir = map(mouseX, 0,width, 0.5, -0.5)
    let wind = createVector(dir, 0);
    movers[i].applyForce(wind);
  }

  movers[i].update();
  movers[i].show();
  movers[i].checkEdges(); 
    
movers[i].checkCollision(); 
      
        
  
    
  }
 
}

let count = 0
function keyPressed(){
  
   if (key === 'c') {
     
     movers[count] = new Mover(count);
     count++;
  }
  print(count)
  
  
  
}
