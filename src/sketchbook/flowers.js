// A week 6 class demo: drag the mouse to plant spinning flowers, which drift off and wrap around the screen.
export default function flowers(p, container) {
  const planted = [];

  class Flower {
    constructor(x, y) {
      this.loc = p.createVector(x, y);
      this.vel = p.createVector(p.random(-5, 5), p.random(-5, 5));

      this.numPetals = p.random(3, 12);
      this.petalLength = p.random(30, 80);
      this.petalWidth = p.random(10, 30);
      this.centerDiameter = p.random(10, 40);
      this.centerCol = p.color(p.random(255), p.random(255), p.random(255));
      this.petalCol = p.color(p.random(255), p.random(255), p.random(255));
      this.rotationSpeed = p.random(1, 8);
      this.rotations = 0;
    }

    move() {
      if (this.loc.x > p.width) this.loc.x = 0;
      if (this.loc.x < 0) this.loc.x = p.width;
      if (this.loc.y > p.height) this.loc.y = 0;
      if (this.loc.y < 0) this.loc.y = p.height;

      this.loc.add(this.vel);
    }

    display() {
      p.push();
      p.translate(this.loc.x, this.loc.y);
      p.rotate(this.rotations);
      for (let i = 0; i < this.numPetals; i++) {
        p.fill(this.petalCol);
        p.rotate(360 / this.numPetals);
        p.ellipse(this.petalLength / 2, 0, this.petalLength, this.petalWidth);
      }
      p.fill(this.centerCol);
      p.ellipse(0, 0, this.centerDiameter, this.centerDiameter);
      p.pop();

      this.rotations += this.rotationSpeed;
    }
  }

  p.setup = () => {
    p.createCanvas(container.clientWidth, container.clientHeight);
    p.angleMode(p.DEGREES);
  };

  p.draw = () => {
    p.background(220);
    for (const flower of planted) {
      flower.move();
      flower.display();
    }
  };

  p.mouseDragged = () => {
    planted.push(new Flower(p.mouseX, p.mouseY));
  };
}
