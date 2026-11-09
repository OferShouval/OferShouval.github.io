// The moving background of the Luminin page. Coming from the link on the art landing page, it
// carries on from the moment in the video that page had got to (see fade_link.js).

let video = document.getElementById('luminin-background');

let saved = sessionStorage.getItem('lumininVideo');
if (saved) {
  sessionStorage.removeItem('lumininVideo');
  let { time, at } = JSON.parse(saved);
  video.addEventListener('loadedmetadata', () => {
    video.currentTime = (time + (Date.now() - at) / 1000) % video.duration;
  }, { once: true });
}

// Asking for less motion leaves it still
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) video.play();

// While the simulation's playing, the page is lit by its screens, in greyscale (their light and dark, not their colour): what they show, much more diffuse, washed over the whole page
// (over the video). When it stops (scrolled off, or no song with screens), the video shows again
const glow = document.createElement('canvas');
glow.className = 'luminin-glow';
glow.width = 64; // Tiny, stretched over the page, so it's soft anyway; blurred as well
glow.height = 36;
glow.setAttribute('aria-hidden', 'true');
video.after(glow);
const glowContext = glow.getContext('2d');
let quiet;
addEventListener('luminin:leds', ({ detail: leds }) => {
  // The screens' 32 x 32 covering the page's shape (cropping top and bottom), blurred well past an LED
  glow.width = 64;
  glow.height = Math.max(8, Math.round((64 * innerHeight) / innerWidth));
  const size = Math.max(glow.width, glow.height);
  glowContext.filter = 'blur(4px) grayscale(1)';
  glowContext.drawImage(leds, (glow.width - size) / 2, (glow.height - size) / 2, size, size);
  glow.classList.add('lit');
  clearTimeout(quiet);
  quiet = setTimeout(() => glow.classList.remove('lit'), 400);
});
