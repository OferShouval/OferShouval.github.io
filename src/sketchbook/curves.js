let cam

let scale = 10

function setup() {
  
  
  createCanvas(windowWidth, windowHeight);
  cam = createCapture(VIDEO,{ flipped:true });
   rectMode(CENTER)
  
  cam.size(640/scale, 480/scale);
  cam.hide();
  noFill()
  
}

function draw() {
  background(255
            );
  
  cam.loadPixels()
  
  translate((width-cam.width*scale)/2,(height-cam.height*scale)/2)
  
  let index = 0;
  
  for(let y = 0; y<cam.height; y++){
    
    beginShape()
    for(let x = 0; x< cam.width; x++){
      
    let r = cam.pixels[index]
    let g = cam.pixels[index +1]
    let b = cam.pixels[index +2]
    
    let brightness = (r+g+b)/3
    let s = map(brightness,0,255,-10,10)
    
      
    // line(x*scale, y*scale, (x+1)*scale +s, y*scale +s )
        splineVertex(x*scale + s , y*scale +s)

 
    index+=4  
    }
    endShape()
  }
  
  cam.updatePixels()
  
}

function mousePressed(){
  
  print(cam)
  
}