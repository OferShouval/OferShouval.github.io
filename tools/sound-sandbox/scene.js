// The sandbox's scene: the front page's own pond (src/wormhole/pond.js), raining, run in its sandbox mode: no welcome,
// no sound switch, no entering. Pressing it drops a drop there. As each drop lands, `onDrop` is told how loud and how
// far to the side its sound should be (see pond.js), for the sandbox to play its patch. Used by sandbox.js.
//
//   const scene = makeScene(holder, { onDrop: ({ loud, pan, inColour }) => ... });
//   scene.run(true); // Raining (false: stopped, while it isn't seen)

import p5 from 'p5';
import pond from '../../src/wormhole/pond.js';

export function makeScene(holder, { onDrop } = {}) {
  let sketch = null;
  let running = false;

  function start() {
    sketch = new p5((p) => pond(p, holder, { sandbox: { onDrop: (drop) => running && onDrop?.(drop) } }), holder);
  }

  // Kept matched to its holder's size, as the site's pages keep theirs (see src/scripts/mount_sketches.js)
  new ResizeObserver(() => {
    if (sketch && holder.clientWidth && (sketch.width !== holder.clientWidth || sketch.height !== holder.clientHeight)) {
      sketch.resizeCanvas(holder.clientWidth, holder.clientHeight);
    }
  }).observe(holder);

  return {
    run(on) {
      running = on;
      if (on && !sketch && holder.clientWidth) start();
      else if (sketch) on ? sketch.loop() : sketch.noLoop();
    },
  };
}
