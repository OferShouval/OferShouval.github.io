// An album player that plays the songs back to back with no gaps between them, as the record does. Each song is
// its own file (an .album-track button's data-src), with its true length in samples (data-frames, from the WAV
// it was made from). Ordinary audio elements always leave a little gap between files, so each song is decoded
// and played through Web Audio instead, the next one scheduled to start on the very sample the last one ends.
// The AAC encoder adds a little silence before each song (and pads the end), which is trimmed off by its length.
// The space bar plays and pauses, and the left and right arrows skip back and forward 10 seconds, while the
// player's on screen.

const RATE = 44100; // The songs' sample rate
const PRIMING = 2112; // The silence the AAC encoder puts before each song, in samples, when the browser leaves it in

const time = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

document.querySelectorAll('.album-player').forEach((player) => {
  const tracks = [...player.querySelectorAll('.album-track')];
  const lengths = tracks.map((track) => Number(track.dataset.frames) / RATE);
  const playButton = player.querySelector('.album-play');
  const previousButton = player.querySelector('.album-previous');
  const nextButton = player.querySelector('.album-next');
  const scrub = player.querySelector('.album-scrub');
  const elapsed = player.querySelector('.album-elapsed');
  const total = player.querySelector('.album-total');
  const nowTitle = player.querySelector('.album-now');

  let context = null;
  const loading = new Map(); // Each song being fetched and decoded, or done, by number (only this one and the next are kept)
  let scheduled = []; // The songs set to play: { i, source, startsAt (in the context's time) }
  let current = -1;
  let playing = false;
  let scrubbing = false;
  let session = 0; // Bumped each time playback's restarted, so that songs still loading for an old start are dropped

  function audioContext() {
    if (!context) {
      try {
        context = new AudioContext({ sampleRate: RATE, latencyHint: 'playback' });
      } catch {
        context = new AudioContext();
      }
      if (navigator.audioSession) navigator.audioSession.type = 'playback'; // So iPhones play it with the ringer off
    }
    return context;
  }

  function load(i) {
    if (!loading.has(i)) {
      loading.set(i, fetch(tracks[i].dataset.src)
        .then((response) => response.arrayBuffer())
        .then((data) => audioContext().decodeAudioData(data))
        .then((buffer) => {
          // Where the song really starts in what was decoded: after the encoder's silence, if it's still there
          const extra = buffer.duration - lengths[i];
          return { buffer, offset: extra > 0.001 ? Math.min(PRIMING / RATE, extra) : 0 };
        }));
    }
    // Let go of the songs that aren't needed now, they're big once decoded
    for (const n of loading.keys()) if (n < i - 1 || n > i + 1) loading.delete(n);
    return loading.get(i);
  }

  function stopAll() {
    scheduled.forEach(({ source }) => {
      source.onended = null;
      try { source.stop(); } catch {}
    });
    scheduled = [];
  }

  // Set song i to start at `when`, from `from` seconds into it, and the one after it to follow on
  async function schedule(i, when, from, mine) {
    const { buffer, offset } = await load(i);
    if (mine !== session) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const startsAt = Math.max(when, context.currentTime);
    source.start(startsAt, offset + from + (startsAt - when), lengths[i] - from - (startsAt - when));
    const song = { i, source, startsAt: startsAt - from - (startsAt - when) };
    scheduled.push(song);
    source.onended = () => {
      scheduled = scheduled.filter((s) => s !== song);
      if (i === tracks.length - 1 && mine === session) finish();
    };
  }

  // Once the last song set to play has begun, set the one after it to follow on, so that only two are ever
  // decoded at once. (A timer rather than animation frames, so it carries on when the page is in the background.)
  let following = false;
  setInterval(() => {
    if (!context || !playing || following) return;
    const last = scheduled[scheduled.length - 1];
    if (!last || last.i + 1 >= tracks.length || last.startsAt > context.currentTime + 1) return;
    following = true;
    const mine = session;
    schedule(last.i + 1, last.startsAt + lengths[last.i], 0, mine).finally(() => (following = false));
  }, 1000);

  // Play from `from` seconds into song i
  async function playFrom(i, from = 0) {
    audioContext();
    const mine = ++session;
    stopAll();
    show(i);
    playing = true;
    player.classList.add('playing');
    player.classList.toggle('loading', true);
    if (context.state === 'suspended') await context.resume();
    await schedule(i, context.currentTime + 0.05, from, mine);
    if (mine === session) player.classList.remove('loading');
    tick();
  }

  function finish() {
    playing = false;
    player.classList.remove('playing');
    show(0);
    update(0);
    started = false;
  }

  let started = false;
  function toggle() {
    if (!started) {
      started = true;
      playFrom(current < 0 ? 0 : current, 0);
    } else if (playing) {
      playing = false;
      player.classList.remove('playing');
      context.suspend();
    } else {
      playing = true;
      player.classList.add('playing');
      context.resume();
      tick();
    }
  }

  // Where it is now: the song playing, and how far into it
  function position() {
    if (!context) return { i: Math.max(current, 0), into: 0 };
    const now = context.currentTime;
    const song = [...scheduled].reverse().find((s) => s.startsAt <= now) ?? scheduled[0];
    if (!song) return { i: Math.max(current, 0), into: 0 };
    return { i: song.i, into: Math.max(0, now - song.startsAt) };
  }

  function go(i, from = 0) {
    if (i < 0 || i >= tracks.length) return;
    started = true;
    playFrom(i, from);
  }

  // Back to the start of this song, unless it's only just started, then the one before
  const previous = () => {
    const { i, into } = position();
    go(into > 3 || i === 0 ? i : i - 1);
  };
  const next = () => go(position().i + 1);

  // Show which song is playing, and tell the phone's lock screen
  function show(i) {
    if (i === current) return;
    current = i;
    tracks.forEach((track, n) => track.toggleAttribute('aria-current', n === i));
    nowTitle.textContent = tracks[i].dataset.title;
    total.textContent = time(lengths[i]);
    load(i);
    if (i + 1 < tracks.length && started) load(i + 1);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: tracks[i].dataset.title,
        artist: player.dataset.artist ?? '',
        album: player.dataset.album ?? '',
        artwork: player.dataset.cover ? [{ src: player.dataset.cover, sizes: '1000x1000', type: 'image/jpeg' }] : [],
      });
    }
  }

  function update(into) {
    if (scrubbing) return;
    scrub.value = Math.min(1000, (into / lengths[current]) * 1000);
    elapsed.textContent = time(into);
  }

  function tick() {
    if (!playing) return;
    const { i, into } = position();
    show(i);
    update(into);
    requestAnimationFrame(tick);
  }

  tracks.forEach((track, i) => track.addEventListener('click', () => (i === current && started ? toggle() : go(i))));
  playButton.addEventListener('click', toggle);
  previousButton.addEventListener('click', previous);
  nextButton.addEventListener('click', next);

  scrub.addEventListener('input', () => {
    if (current < 0) show(0);
    scrubbing = true;
    elapsed.textContent = time((scrub.value / 1000) * lengths[current]);
  });
  scrub.addEventListener('change', () => {
    scrubbing = false;
    go(current, Math.min((scrub.value / 1000) * lengths[current], lengths[current] - 0.1));
  });

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => !playing && toggle());
    navigator.mediaSession.setActionHandler('pause', () => playing && toggle());
    navigator.mediaSession.setActionHandler('previoustrack', previous);
    navigator.mediaSession.setActionHandler('nexttrack', next);
  }

  // Keys work while the player's on screen, unless something else that takes typing has the focus
  let onScreen = false;
  new IntersectionObserver(([entry]) => (onScreen = entry.isIntersecting)).observe(player);
  document.addEventListener('keydown', (event) => {
    if (!onScreen || event.metaKey || event.ctrlKey || event.altKey) return;
    const focus = document.activeElement;
    if (focus && (focus.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(focus.tagName)) && focus !== scrub) return;
    if (event.key === ' ') {
      event.preventDefault();
      toggle();
    } else if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && started) {
      event.preventDefault();
      const { i, into } = position();
      const to = into + (event.key === 'ArrowRight' ? 10 : -10);
      if (to >= lengths[i]) go(i + 1);
      else go(i, Math.max(0, to));
    }
  });
});
