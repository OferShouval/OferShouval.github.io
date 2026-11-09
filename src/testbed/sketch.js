let counter = 0; 

let lerped_mouseX = 0;
let lerped_mouseY = 0;
function setup() {
createCanvas(floor(windowWidth / 2), floor(windowHeight / 2));
  pixelDensity(1);
}

function draw() {
  background(0);
  
  
  
  // How far the mouse is from the middle of the window, at least 1 so that dividing by it stays safe
  const distanceX = max(1, abs(mouseX - width/2));
  const distanceY = max(1, abs(mouseY - height/2));

  lerped_mouseX = lerp(lerped_mouseX, distanceX, 0.1);

  lerped_mouseY = lerp(lerped_mouseY, distanceY, 0.1);
  
  //translate(width/2,0)
  loadPixels();
  // Local copies, because looking these up from p5 for every pixel is what's slow
  const px = pixels;
  const w = width;
  const h = height;
  const my = distanceY;

  // The direction the diagonal waves travel in, which turns a little every frame
  const angle = PI/4 + counter*0.01;
  const ax = cos(angle);
  const ay = sin(angle);
 
  
  let index = 0;
  
  for(let y = 0; y<h; y++){
    for(let x = 0; x<w ; x++){
      
      // pixels[index] =  100*(1+sin(y/10));
      px[index] = 100*(1+sin((y/w)/my + my/10))
      px[index+1] = 100*(1+(sin((x*y)/(0.5*lerped_mouseX) + lerped_mouseX/10) + sin(((w-x)*(h-y))/(0.5*lerped_mouseX) + lerped_mouseX/10))/2)
      px[index+2] = 100*(1+cos(1.414*((x-w/2)*ax + (y-h/2)*ay)/lerped_mouseX + lerped_mouseX/10))
      px[index+3] = 255;
      
      index+=4;
    }

  }
  
  
  updatePixels();
  
  
//   noFill()
//   ellipse(width/2, height/2, 100)
  
  counter+= 1;
}