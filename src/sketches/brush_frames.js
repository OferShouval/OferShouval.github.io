// Paints the walk cycle with a p5.brush brush, along the lines of the skeleton in figure.js.
//
// Brush strokes are far too slow to paint a whole crowd every frame, so they're painted once at
// the start, and the crowd stamps the pictures. p5.brush only draws in WebGL, so this uses its
// standalone build, with a hidden canvas of its own.
//
// All the pictures go on one big sheet, a row for each line weight and a column for each step of
// the walk cycle, since the browser draws lots of pictures from one sheet much faster than one
// picture each from lots of canvases.

import * as brush from 'p5.brush/standalone';
import Figure, { poses } from './figure.js';
import { mousePose, mouseWidth, mouseHeight, mouseFeetX, mouseFeetY, mouseSteps, mouseViews, mouseActions } from './mouse.js';

// How big each picture is, in the frames' own pixels, with room around the figure for the brush
// to wander (a very scattered brush, like spray, could still get cut off at the edges)
export let frameWidth = 96;
export let frameHeight = 174;
// Where the figure stands in the picture
export let feetX = 45;
export let feetY = 160;
export let steps = poses.length * 2; // How many steps there are in the walk cycle
export let holeMargin = 8; // Room around a hole's picture for its rim and the pen to wander, in pixels
export let signMargin = 8; // Room around a sign's pictures for the pen to wander, in pixels
let levels = 4; // How many sizes of the sheet to keep, each half the size of the last

let figure = new Figure();

// Paint the whole walk cycle at each line weight. Gives the sheet at each size, from the full size
// down, since shrinking a big picture a long way looks rough and is slow.
// name: the name of the brush
// weights: how thick its lines are (each brush has its own idea of what 1 is)
// resolution: how many pixels of sheet for each of the frames' own pixels
export function paintSheets(name, weights, resolution) {
  let canvas = brush.createCanvas(frameWidth, frameHeight, { pixelDensity: resolution, parent: null });
  let gl = canvas.getContext('webgl2');

  let sheet = document.createElement('canvas');
  sheet.width = canvas.width * steps;
  sheet.height = canvas.height * weights.length;
  let context = sheet.getContext('2d');

  weights.forEach((weight, row) => {
    for (let step = 0; step < steps; step++) {
      // brush.clear() leaves the canvas a see-through white, which stamps as a white box that
      // wipes out whatever's behind it, so clear it again to properly nothing
      brush.clear();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      brush.seed(row); // The same pen texture in every picture, so that the lines don't shimmer as they change
      paint(step, name, weight);
      brush.render();
      context.drawImage(canvas, step * canvas.width, row * canvas.height);
    }
  });

  makeBlack(sheet);

  // That's all the WebGL needed, and browsers only allow so many contexts at a time
  gl.getExtension('WEBGL_lose_context')?.loseContext();

  let sheets = [sheet];
  for (let i = 1; i < levels; i++) {
    let smaller = document.createElement('canvas');
    smaller.width = Math.ceil(sheet.width / 2 ** i);
    smaller.height = Math.ceil(sheet.height / 2 ** i);
    let smallerContext = smaller.getContext('2d');
    smallerContext.imageSmoothingQuality = 'high';
    smallerContext.drawImage(sheets[i - 1], 0, 0, smaller.width, smaller.height);
    sheets.push(smaller);
  }
  return sheets;
}

// Paint some holes in the ground, like hand drawings: a slightly uneven solid shape, gone round in pen.
// Gives a canvas for each, holeMargin bigger than the hole on every side, to be stretched to whatever
// size it's needed. They're white, to go over the crowd with a "difference" blend: on the white ground
// they come out black, and anyone walking over them comes out white (see showHole() in art_walk.js).
export function paintHoles(count, name, weight, width, height, density) {
  let canvas = brush.createCanvas(width + holeMargin * 2, height + holeMargin * 2, { pixelDensity: density, parent: null });
  let gl = canvas.getContext('webgl2');
  let scale = canvas.width / (width + holeMargin * 2);

  let pictures = [];
  for (let i = 0; i < count; i++) {
    brush.clear();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Everything's measured from the middle of the hole, as the brush does
    let corners = [];
    for (let n = 0; n < 11; n++) {
      let angle = (n / 11) * Math.PI * 2;
      let uneven = 1 + (Math.random() - 0.5) * 0.1;
      corners.push([(Math.cos(angle) * uneven * width) / 2, (Math.sin(angle) * uneven * height) / 2]);
    }
    brush.set(name, '#000000', weight);
    brush.spline([...corners, corners[0], corners[1]], 1);
    brush.render();

    let picture = document.createElement('canvas');
    picture.width = canvas.width;
    picture.height = canvas.height;
    let context = picture.getContext('2d');
    context.drawImage(canvas, 0, 0);
    context.globalCompositeOperation = 'source-in';
    context.fillStyle = 'white';
    context.fillRect(0, 0, picture.width, picture.height);

    // The inside, under the line
    let middle = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    context.setTransform(scale, 0, 0, scale, picture.width / 2, picture.height / 2);
    context.globalCompositeOperation = 'destination-over';
    context.beginPath();
    context.moveTo(...middle(corners.at(-1), corners[0]));
    corners.forEach((corner, n) => context.quadraticCurveTo(...corner, ...middle(corner, corners[(n + 1) % corners.length])));
    context.fill();
    pictures.push(picture);
  }
  return pictures;
}

// A line that isn't quite straight, as if drawn quickly by hand, running a little past both its ends
function handLine(x1, y1, x2, y2) {
  let past = () => 1 + Math.random() * 3;
  let length = Math.hypot(x2 - x1, y2 - y1);
  let [alongX, alongY] = [(x2 - x1) / length, (y2 - y1) / length];
  let bend = (Math.random() - 0.5) * 3;
  brush.spline([
    [x1 - alongX * past(), y1 - alongY * past()],
    [(x1 + x2) / 2 - alongY * bend, (y1 + y2) / 2 + alongX * bend],
    [x2 + alongX * past(), y2 + alongY * past()],
  ], 1);
}

// Paint some signposts, like hand drawings: a board of four lines, with white behind them, and a crooked
// post. Gives a { board, post } of canvases for each, signMargin bigger than the board or post on every
// side, to be stretched to whatever size they're needed.
export function paintSigns(count, name, weight, width, height, postLength, density) {
  let paintAll = (w, h, paintOne) => {
    let canvas = brush.createCanvas(w + signMargin * 2, h + signMargin * 2, { pixelDensity: density, parent: null });
    let gl = canvas.getContext('webgl2');
    let pictures = [];
    for (let i = 0; i < count; i++) {
      brush.clear();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      brush.set(name, '#000000', weight);
      paintOne(w / 2, h / 2);
      brush.render();
      let picture = document.createElement('canvas');
      picture.width = canvas.width;
      picture.height = canvas.height;
      picture.getContext('2d').drawImage(canvas, 0, 0);
      makeBlack(picture);
      pictures.push(picture);
    }
    return pictures;
  };

  let boards = paintAll(width, height, (x, y) => {
    handLine(-x, -y, x, -y);
    handLine(x, -y, x, y);
    handLine(x, y, -x, y);
    handLine(-x, y, -x, -y);
  });
  // White behind the lines, so that a board hides whoever's behind it
  for (let board of boards) {
    let context = board.getContext('2d');
    let scale = board.width / (width + signMargin * 2);
    context.globalCompositeOperation = 'destination-over';
    context.fillStyle = 'white';
    context.fillRect(signMargin * scale, signMargin * scale, width * scale, height * scale);
    context.globalCompositeOperation = 'source-over';
  }

  let posts = paintAll(0, postLength, (x, y) => {
    let lean = (Math.random() - 0.5) * 4;
    brush.spline([[lean / 2, -y], [lean, -y / 3], [-lean, y / 3], [lean / 2, y]], 1);
  });
  return boards.map((board, i) => ({ board, post: posts[i] }));
}

// Paint a mouse: a row of pictures of each thing it does, for each way it can be facing, one after
// another (see mouse.js)
export function paintMouse(name, weight, resolution) {
  let canvas = brush.createCanvas(mouseWidth, mouseHeight, { pixelDensity: resolution, parent: null });
  let gl = canvas.getContext('webgl2');
  let rows = mouseViews * mouseActions;

  let sheet = document.createElement('canvas');
  sheet.width = canvas.width * mouseSteps;
  sheet.height = canvas.height * rows;
  let context = sheet.getContext('2d');
  let eachPicture = (paintIt) => {
    for (let row = 0; row < rows; row++) {
      for (let step = 0; step < mouseSteps; step++) {
        paintIt(mousePose(step, Math.floor(row / mouseActions), row % mouseActions), row, step);
      }
    }
  };
  // The brush measures from the middle of its canvas
  let offsetX = mouseFeetX - mouseWidth / 2;
  let offsetY = mouseFeetY - mouseHeight / 2;
  eachPicture(({ lines }, row, step) => {
    brush.clear();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    brush.seed(1); // The same pen texture in every picture, so that its lines don't shimmer as they change
    for (let { points, weight: lineWeight } of lines) {
      brush.set(name, '#000000', weight * lineWeight);
      brush.spline(points.map(([x, y]) => [x + offsetX, y + offsetY]), 0);
    }
    brush.render();
    context.drawImage(canvas, step * canvas.width, row * canvas.height);
  });
  makeBlack(sheet);

  let scale = canvas.width / mouseWidth;
  // White inside its solid parts, under the lines, so they hide whoever's behind them
  context.globalCompositeOperation = 'destination-over';
  context.fillStyle = 'white';
  eachPicture(({ fills }, row, step) => {
    context.setTransform(scale, 0, 0, scale, (step * mouseWidth + mouseFeetX) * scale, (row * mouseHeight + mouseFeetY) * scale);
    for (let outline of fills) {
      context.beginPath();
      outline.forEach(([x, y]) => context.lineTo(x, y));
      context.fill();
    }
  });
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = 'source-over';
  return sheet;
}

// The mouse's face on its own, in thin lines laid out like its pictures (see paintMouse()): its eyes and nose as
// dots, and its whiskers, for drawing over it when it's filled with colour instead of drawn in outline
export function paintMouseFace(sheet, { line = 1.1, eye = 2.6, nose = 1.8 } = {}) {
  let face = document.createElement('canvas');
  face.width = sheet.width;
  face.height = sheet.height;
  let context = face.getContext('2d');
  let rows = mouseViews * mouseActions;
  let scale = sheet.width / mouseSteps / mouseWidth;
  context.strokeStyle = 'black';
  context.fillStyle = 'black';
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (let row = 0; row < rows; row++) {
    for (let step = 0; step < mouseSteps; step++) {
      let { lines, face: features } = mousePose(step, Math.floor(row / mouseActions), row % mouseActions);
      context.setTransform(scale, 0, 0, scale, (step * mouseWidth + mouseFeetX) * scale, (row * mouseHeight + mouseFeetY) * scale);
      // Its whiskers (see mousePose())
      context.lineWidth = line;
      for (let { points, key } of lines) {
        if (key < 7990 || key > 8030) continue;
        context.beginPath();
        points.forEach(([x, y]) => context.lineTo(x, y));
        context.stroke();
      }
      for (let [x, y] of features.eyes) {
        context.beginPath();
        context.ellipse(x, y, eye, eye * 1.15, 0, 0, Math.PI * 2);
        context.fill();
      }
      if (features.nose) {
        context.beginPath();
        context.arc(features.nose[0], features.nose[1], nose, 0, Math.PI * 2);
        context.fill();
      }
    }
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  return face;
}

// The brush leaves pale edges on its lines, which show on anything darker than white. Turn every
// bit of it pure black, keeping how see-through it is.
function makeBlack(canvas) {
  let context = canvas.getContext('2d');
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = 'black';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = 'source-over';
}

function paint(step, name, weight) {
  let j = figure.joints(poses[step % poses.length]);
  // The brush measures from the middle of its canvas
  let toImage = (point) => [point.x + feetX - frameWidth / 2, point.y - j.ground + feetY - frameHeight / 2];

  brush.set(name, '#000000', weight);
  for (let side of [j.far, j.near]) {
    brush.spline(side.arm.map(toImage), 0);
    brush.spline(side.leg.map(toImage), 0);
  }
  brush.spline([j.shoulders, j.hips].map(toImage), 0);
  let [headX, headY] = toImage(j.head);
  brush.circle(headX, headY, figure.headRadius);
}
