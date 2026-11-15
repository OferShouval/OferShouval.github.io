// A scene for the sound studio: the front page's own pond (src/wormhole/pond.js), raining, with no welcome and no
// entering, for as long as it's wanted. Pressing drops a drop there. It's the pond's "sandbox" way of running, so it
// always looks like the front page; each drop says it's landed (see playDrip() there), which the studio hears.
import p5 from 'p5';
import pond from '../../src/wormhole/pond.js';

const holder = document.getElementById('scene');
const sketch = new p5((p) => pond(p, holder, { sandbox: {} }), holder);
// Kept matched to the window's size, as the site's pages keep theirs (see src/scripts/mount_sketches.js)
new ResizeObserver(() => {
  if (holder.clientWidth && (sketch.width !== holder.clientWidth || sketch.height !== holder.clientHeight)) sketch.resizeCanvas(holder.clientWidth, holder.clientHeight);
}).observe(holder);
