let counter = 0; 

let lerped_mouseX = 0;
let lerped_mouseY = 0;
let scanDirection = 1; // Which way the scanlines are heading: 1 is down, -1 is up
let scanPosition = 0; // How far along they've moved
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
  const my = lerped_mouseY;
  scanDirection = lerp(scanDirection, mouseY < height/2 ? 1 : -1, 0.05); // Eases around rather than jumping
  const edge = sq(constrain(lerped_mouseY/(height/2), 0, 1)); // How close the mouse is to the top or bottom, from 0 to 1, mostly right near them
  const scan = width/2; // Always wide, gradual waves, the same as with the mouse out at the far left or right
  scanPosition += 0.05*lerp(1, 2, edge)*scanDirection; // Faster near the top and bottom
  // Near the middle, a tiny random nudge every frame keeps the static going at full speed, even if the mouse is still
  const nearMiddle = max(0, 1 - abs(mouseX - width/2)/40); // How far in, from 40 pixels away (0) to the middle (1)
  const crackle = lerped_mouseX + nearMiddle*random(1);
  const drift = counter*0.02; // The pattern always moves a little, even when the mouse is still
 
  
  let index = 0;
  
  for(let y = 0; y<h; y++){
    for(let x = 0; x<w ; x++){
      
      // pixels[index] =  100*(1+sin(y/10));
      px[index] = 100*(1+cos((y/w)/my + my/10))
      px[index+1] = 100*(1+(sin((x*y)/(0.5*crackle) + crackle/10 - drift) + sin(((w-x)*(h-y))/(0.5*crackle) + crackle/10 - drift))/2)
      px[index+2] = 100*(1+cos(1.414*y/scan + scan/10 - scanPosition))
      px[index+3] = 255;
      
      index+=4;
    }

  }
  
  
  updatePixels();
  
  
//   noFill()
//   ellipse(width/2, height/2, 100)
  
  counter+= 1;
}