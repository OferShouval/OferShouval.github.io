// What the sound studio knows about the site: its sections (each with a soundscape of its own, since sound can't
// carry on from one page to the next), the scenes in each that can be pulled up, and everything that happens in them
// that a sound can be tied to. Used by studio.js, and by dev-server.js (for where each section's files go).
//
// A scene is a place to start from: a page (url), and sometimes a press made for you a few seconds in, to set a
// transition off (press: { after: seconds, at: [x, y] as shares of the screen }).
//
// An event is something a page says has happened, with sceneEvent() (see src/scripts/scene_events.js), and a signal
// is something it says keeps changing, with sceneSignal(). To give the studio a new one, say it in the page's code,
// and list it here with a few words on what it is. (One that isn't listed still shows up, by its name, once it's
// been heard.) What the visitor does is the same on every page: see src/scripts/soundscape/visitor.js.

export const visitor = {
  events: [
    { id: 'press', label: 'a click or a tap' },
    { id: 'release', label: 'letting go' },
    { id: 'key', label: 'a key pressed' },
    { id: 'hover', label: 'pointing at a link' },
  ],
  signals: [
    { id: 'mouse-x', label: 'mouse: left ↔ right' },
    { id: 'mouse-y', label: 'mouse: top ↔ bottom' },
    { id: 'mouse-speed', label: 'mouse: how fast' },
    { id: 'holding', label: 'holding down' },
    { id: 'scroll', label: 'scroll: how far down' },
    { id: 'scroll-speed', label: 'scroll: how fast' },
  ],
};

// Every scene has this one: it's opened (or been started again)
export const opening = { id: 'open', label: 'the scene opens' };

export const sections = [
  {
    id: 'landing',
    label: 'front page',
    sounds: 'landing', // Its folder in public/sounds, where sounds dropped on the studio go
    owns: (path) => path === '/' || path === '/index.html' || path.startsWith('/tools/sound-studio/stage'),
    scenes: [
      {
        id: 'rain',
        label: 'the pond: just the rain',
        url: '/tools/sound-studio/stage.html',
        hint: 'Rain, for as long as you like. Click the water to drop a drop there.',
        events: ['drop', 'drop-near', 'drop-far'],
      },
      {
        id: 'enter',
        label: 'transition: entering (pond → wormhole)',
        url: '/',
        press: { after: 3, at: [0.5, 0.62] },
        hint: 'Three seconds of rain, then it enters by itself: the colour drop, the camera coming over, the worm.',
        events: ['drop', 'drop-near', 'drop-far', 'enter', 'colour-drop', 'camera-above', 'worm-springs', 'stage-psychworm'],
        signals: ['dive'],
      },
      {
        id: 'top',
        label: 'the front page, from the top',
        url: '/',
        hint: 'The real page, from the welcome: click to enter, and it carries on through the wormhole.',
      },
      {
        id: 'psychworm',
        label: 'wormhole: psychworm',
        url: '/#psychworm',
        hint: 'Click to bring the flower. Going through it leads to the flowers.',
        events: ['stage-psychworm', 'ring-comes', 'stage-flowers'],
      },
      {
        id: 'flowers',
        label: 'wormhole: flowers → pixel array',
        url: '/#flowers',
        hint: 'Hold for a boost, let go to burst. The pixel array closes in, and the TV switches off.',
        events: ['stage-flowers', 'burst', 'explode', 'array-covers', 'tv-off', 'stage-noisy-spiral'],
        signals: ['boost', 'array'],
      },
      {
        id: 'portals',
        label: 'the spiral and the portals',
        url: '/#noisy-spiral',
        hint: 'Choose a portal: the spiral unwinds into the worm, which flies into it. (Then the page it leads to opens.)',
        events: ['stage-noisy-spiral', 'portal-hover', 'portal-chosen', 'lightning', 'rose', 'worm-launch', 'portal-fills', 'leaving'],
        signals: ['portal'],
      },
    ],
    events: [
      { id: 'drop', label: 'a raindrop lands' },
      { id: 'drop-near', label: 'a raindrop lands, near' },
      { id: 'drop-far', label: 'a raindrop lands, far off' },
      { id: 'enter', label: 'entering: the colour drop falls' },
      { id: 'colour-drop', label: 'the colour drop lands' },
      { id: 'camera-above', label: 'the camera is right above it: the worm forms' },
      { id: 'worm-springs', label: 'the worm springs forward' },
      { id: 'stage-psychworm', label: 'out in space: psychworm' },
      { id: 'ring-comes', label: 'the flower comes for the worm' },
      { id: 'stage-flowers', label: 'through the flower: the flowers' },
      { id: 'burst', label: 'the worm bursts into flowers' },
      { id: 'explode', label: 'flowers thrown out (letting go)' },
      { id: 'array-covers', label: 'the pixel array covers the screen' },
      { id: 'tv-off', label: 'the TV switches off' },
      { id: 'stage-noisy-spiral', label: 'the spiral, and the portals' },
      { id: 'portal-hover', label: 'pointing at a portal' },
      { id: 'portal-chosen', label: 'a portal is chosen' },
      { id: 'lightning', label: 'lightning' },
      { id: 'rose', label: 'the spiral bursts into a rose' },
      { id: 'worm-launch', label: 'the worm is let go, and jolts forward' },
      { id: 'portal-fills', label: 'the portal fills the screen' },
      { id: 'leaving', label: 'going on to the next page' },
    ],
    signals: [
      { id: 'dive', label: 'entering: how far through' },
      { id: 'boost', label: 'flowers: the boost' },
      { id: 'array', label: 'the pixel array closing in' },
      { id: 'portal', label: 'the chosen portal growing' },
    ],
  },
  { id: 'music', label: 'music', sounds: 'music', folder: 'music' },
  { id: 'art', label: 'visuals', sounds: 'art', folder: 'art' },
  { id: 'bio', label: 'bio', sounds: 'bio', folder: 'bio' },
  { id: 'teaching', label: 'teaching', sounds: 'teaching', folder: 'teaching' },
];

export const sectionOf = (id) => sections.find((section) => section.id === id);

// Which section a page belongs to, from its address
export function sectionOwning(path) {
  return sections.find((section) => (section.owns ? section.owns(path) : path === `/${section.folder}` || path.startsWith(`/${section.folder}/`))) ?? null;
}
