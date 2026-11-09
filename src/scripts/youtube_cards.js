// A YouTube video shown as its thumbnail (a .video-thumb button with data-youtube, the video's id), swapped for
// YouTube's player, playing, when it's clicked, so the page doesn't load a player for every video up front
document.querySelectorAll('.video-thumb[data-youtube]').forEach((thumb) => {
  thumb.addEventListener('click', () => {
    const frame = document.createElement('iframe');
    frame.className = 'video-frame';
    frame.src = `https://www.youtube-nocookie.com/embed/${thumb.dataset.youtube}?autoplay=1`;
    frame.title = thumb.getAttribute('aria-label').replace(/^play /, '');
    frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    frame.allowFullscreen = true;
    thumb.replaceWith(frame);
  });
});
