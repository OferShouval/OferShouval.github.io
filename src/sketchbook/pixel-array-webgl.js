let counter = 0; 

let lerped_mouseX = 0;
let lerped_mouseY = 0;
function setup() {
  createCanvas(1000, 1000, WEBGL);
  pixelDensity(1);
 
  
}

function draw() {
  background(0);
  
  
  
  lerped_mouseX = lerp(lerped_mouseX, mouseX, 0.1);
  
  lerped_mouseY = lerp(lerped_mouseY, mouseY, 0.1);
  
  //translate(width/2,0)
  loadPixels();
 
  
  let index = 0;
  
  for(let y = 0; y<height; y++){
    for(let x = 0; x<width; x++){
      
      // pixels[index] =  100*(1+sin(y/10));
      pixels[index] = 100*(1+cos((y/x)/mouseY + mouseY/10))
      pixels[index+1] = 100*(1+sin((x*y)/(0.5*lerped_mouseX) + lerped_mouseX/10))
      pixels[index+2] = 100*(1+cos((x+y)/lerped_mouseX + lerped_mouseX/10))
      pixels[index+3] = 255;
      
      index+=4;
    }

  }
  
  
  updatePixels();
  // blendMode(SUBTRACT)
  // fill(100);
 // text('imagination ltd',width/2, height/2)
//   noFill()
//   ellipse(width/2, height/2, 100)
  
  counter+= 1;
}
// function mousePressed()
// {
//   saveCanvas('imaginationltd.png')
// }