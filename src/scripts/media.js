// Videos only download once they scroll near view.
const videoObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach(({ isIntersecting, target }) => {
      if (!isIntersecting) return;
      target.src = target.dataset.src;
      videoObserver.unobserve(target);
    });
  },
  { rootMargin: '500px 0px' }
);

// Vimeo videos with data-vimeo only load once half of one is on the screen, and then play (muted, or the
// browser won't allow it), pausing whenever it's scrolled away. Asking for less motion, they just load.
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const vimeoObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach(({ isIntersecting, target }) => {
      if (!target.getAttribute('src')) {
        if (isIntersecting) target.src = `https://player.vimeo.com/video/${target.dataset.vimeo}${calm ? '' : '?autoplay=1&muted=1&loop=1'}`;
        return;
      }
      if (calm) return;
      target.contentWindow.postMessage(JSON.stringify({ method: isIntersecting ? 'play' : 'pause' }), 'https://player.vimeo.com');
    });
  },
  { threshold: 0.5 }
);
document.querySelectorAll('iframe[data-vimeo]').forEach((iframe) => vimeoObserver.observe(iframe));

document.querySelectorAll('video[data-src]').forEach((video) => {
  videoObserver.observe(video);
  // Fallback for when autoplay is blocked (e.g. iOS Low Power Mode): tap to play.
  video.addEventListener('click', () => video.play());
});

// On touch screens, holding a finger on a sketch, or anywhere on a full-screen sketch page, doesn't open the
// browser's menu (see .sketch-page in main.css), since holding is part of playing them
if (matchMedia('(hover: none)').matches) {
  document.addEventListener('contextmenu', (event) => {
    if (document.body.classList.contains('sketch-page') || event.target.closest?.('canvas')) event.preventDefault();
  });
}
