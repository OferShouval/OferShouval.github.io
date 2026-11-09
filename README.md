# OferShouval.github.io

Personal site, built with [Vite](https://vite.dev).

```sh
npm install
npm run dev      # local dev server with live reload
npm run build    # production build into dist/
npm run preview  # serve the dist/ build locally
```

## Layout

- `index.html` — home: the wormhole (old sketches turning into each other, in `src/wormhole/wormhole.js`), ending in three portals to art, music and bio (`src/wormhole/spiral-worm.js`)
- `art/` — one page per piece; `art/index.html` is the walking landing page; `art/sketchbook/` has the sketch test page, and its index forwards to the front page
- `music/` — `index.html` is the full-screen "Wake" sketch, with gates to `live.html`, `recordings.html` (releases grid), `videos.html` and `info.html`; `archive/old-pages/release-template.html` to copy for each release
- `teaching/` — courses and student work (left out of the navbar and the build for now; still runs in `npm run dev`)
- `bio/` — bio
- `projects.html`, `bio.html` — redirects from the old URLs
- `src/partials/` — shared HTML pulled in with `<!-- @include file.html -->` at build time
- `src/sketches/music/` — the music page sketch: `sketch.js` runs it, with `boat.js`, `gate.js`, `wake.js`, `water.js`, `color.js` and `perspective.js`
- `src/sketches/art_walk.js` — the art landing sketch, with `brush_frames.js`, which paints its walk cycle with p5.brush along the skeleton in `figure.js`
- `src/wormhole/` — the front page's wormhole: `wormhole.js` runs the stages and hands over to `spiral-worm.js` for the last one
- `src/sketchbook/` — loose sketches (the wormhole has its own blended copies of them)
- `src/scripts/mount_sketches.js` — mounts sketches from `src/wormhole/` and `src/sketchbook/` into `data-sketch` containers
- `src/scripts/media.js` — lazy-loads videos on every page
- `src/styles/main.css` — site styles
- `public/media/` — images and videos, referenced as `/media/name.ext`
- `archive/` — old pages, sketches and images, not part of the build (`archive/art-list/all.html` was the art section's grid of everything; `archive/home-sketch-before-cleanup/` has the earlier versions of the home sketch)

Any `.html` file outside `src/`, `public/` and `archive/` is built as a page automatically.
Dashed "TODO" boxes (`class="placeholder"`) mark content still to be added.

## Adding a video

Convert GIFs or clips to MP4 and use a poster frame:

```html
<video data-src="/media/name.mp4" poster="/media/name_poster.jpg" autoplay muted loop playsinline></video>
```

## Adding a sketch to the sketchbook

Copy `src/sketchbook/template.js` to `src/sketchbook/<name>.js` and write the sketch in instance mode
(`export default function (p, container) { ... }`, size the canvas to `container`). To show it on a page, add
`<div class="sketch" data-sketch="<name>"></div>` and load `src/scripts/mount_sketches.js`. (The old
one-page-per-sketch pages are in `archive/sketch-pages/`.)

To try one by itself, full screen, run `npm run dev` and open `/art/sketchbook/test.html?sketch=<name>` (it finds
sketches in `src/wormhole/` too). This also runs plain p5 sketches (`function setup`, `function draw`) that haven't been converted yet.

To add a sketch to the wormhole on the front page, add a
stage to `stages` in `src/wormhole/wormhole.js`, with settings for how the one before turns into it. A stage can
use the camera and sound the visitor turned on (see the top of that file).

Images and sounds a sketch loads go in `public/media/sketchbook/`, and are loaded from `/media/sketchbook/...`.

Any page can show live sketches this way. Each one loads when it scrolls near view, pauses off screen,
and resizes with its container. p5's friendly errors are on in `npm run dev` and off in the build.
