// The dive from the pond into the wormhole as a score, for writing music to it in a DAW: a standard MIDI file, from
// the press that enters (its start) to when the wormhole takes over, worked out from the very formulas the dive's
// drawn with (see pond.js, which passes in its settings as `times`), so it lines up with the picture exactly.
//
// At 120 beats a minute, so a beat's half a second (Logic's grid, at that tempo, is in seconds you can count), with:
//
//   markers     for each thing that happens (what Logic shows in its marker lane)
//   notes       a note for each of them too, on the "dive events" track, so they can trigger sounds
//   controllers its motion, as curves on the "dive motion" track, each 0 to 127, on controllers Logic doesn't use for
//               anything else (20 and up), ready to be assigned to whatever's wanted:
//
//                 20 drop      the colour drop falling, faster and faster, until it lands
//                 21 camera    the camera coming round, until it's right above
//                 22 spin      how fast the rings are spinning (they spin up with the square of the time)
//                 23 worm      the tunnel turning into the worm
//                 24 rush      how fast new rings are rushing out (up as the worm grows, up again as it springs)
//                 25 stretch   the worm stretching (above 64) and springing back (below), settling at 64
//                 26 stars     the stars coming in

const TEMPO = 120;
const TICKS = 480; // Per beat
const perSecond = (TICKS * TEMPO) / 60;
const sampleRate = 50; // How many times a second the curves are read

export function diveScore(times) {
  const t = times;
  const end = t.above + t.handOverAt; // When the wormhole takes over, in seconds from the press
  const ready = t.above - t.fall; // When the camera's right above, in seconds from the landing
  const smooth = (x) => {
    const c = Math.min(1, Math.max(0, x));
    return c * c * (3 - 2 * c);
  };

  // The events, in seconds from the press
  const worm = t.above + t.wormAt;
  const spring = worm + t.springAt;
  const events = [
    [0, 'press: the colour drop falls', 48],
    [t.fall, 'drop lands', 50],
    [t.above + t.spinUpAt, 'rings spin up', 52],
    [t.above, 'camera right above', 53],
    [worm, 'worm grows out of the middle', 55],
    [worm + t.wormTime, 'worm formed', 57],
    [spring, 'worm springs forward', 60],
    [spring + t.starsIn, 'stars in', 62],
    [end, 'wormhole takes over', 64],
  ]
    .sort((a, b) => a[0] - b[0])
    // Any at the same moment as one before become one, so their markers don't sit on top of each other
    .reduce((kept, event) => {
      const last = kept[kept.length - 1];
      if (last && Math.abs(last[0] - event[0]) < 0.01) last[1] += `, ${event[1]}`;
      else kept.push([...event]);
      return kept;
    }, []);

  // The curves, as they are this many seconds after the press
  const life = (s) => s - t.fall; // Since the drop landed
  const spinSpeed = (s) => {
    if (life(s) < 0) return 0;
    const past = Math.max(0, life(s) - ready - t.spinUpAt);
    return t.colourSpin * (1 + t.spinUp * past * past);
  };
  const rush = (s) => {
    const l = life(s);
    if (l < 0) return 1;
    const up = Math.min(1, Math.max(0, (l - ready - t.wormAt) / t.rushUp));
    const down = Math.min(1, Math.max(0, (l - ready - t.tunnelGoneAt - t.tunnelGoneTime) / t.rushDown));
    const springing = l - ready - t.wormAt - t.springAt;
    const calming = Math.min(1, Math.max(0, (springing - t.springUp - t.springFor) / t.springDown));
    const surge = smooth(springing / t.springUp) * (1 - calming) * (1 - calming);
    return (1 + (t.wormRush - 1) * smooth(up * (1 - down))) * (1 + (t.springRush - 1) * surge);
  };
  const stretch = (s) => {
    const since = life(s) - ready - t.wormAt - t.springAt;
    if (since <= 0 || !t.stretch) return 0;
    const settling = Math.min(1, since / t.stretchSettle);
    const left = 1 - settling * settling * (3 - 2 * settling);
    return left * Math.sin((2 * Math.PI * since) / t.stretchTime); // -1 to 1
  };
  const mostSpin = spinSpeed(end);
  const mostRush = t.wormRush * t.springRush;
  const curves = [
    [20, (s) => Math.min(1, Math.max(0, s / t.fall)) ** 2],
    [21, (s) => smooth(s / t.above)],
    [22, (s) => spinSpeed(s) / mostSpin],
    [23, (s) => smooth((life(s) - ready - t.wormAt) / t.wormTime)],
    [24, (s) => (rush(s) - 1) / (mostRush - 1)],
    [25, (s) => 0.5 + stretch(s) / 2],
    [26, (s) => smooth((s - spring) / t.starsIn)],
  ];

  // The tracks, as [tick, bytes] events
  const tick = (s) => Math.round(s * perSecond);
  const text = (type, words) => [0xff, type, ...vlq(words.length), ...[...words].map((c) => c.charCodeAt(0) & 0x7f)];
  const conductor = [
    [0, text(0x03, 'dive')],
    [0, [0xff, 0x51, 0x03, ...[16, 8, 0].map((shift) => (Math.round(60e6 / TEMPO) >> shift) & 0xff)]], // Tempo
    [0, [0xff, 0x58, 0x04, 4, 2, 24, 8]], // 4/4
    ...events.map(([s, name]) => [tick(s), text(0x06, name)]), // Markers
  ];
  const notes = [[0, text(0x03, 'dive events')]];
  for (const [s, name, note] of events) {
    notes.push([tick(s), text(0x01, name)]);
    notes.push([tick(s), [0x90, note, 100]]);
    notes.push([tick(s + 0.25), [0x80, note, 0]]);
  }
  const motion = [[0, text(0x03, 'dive motion')]];
  for (const [controller, curve] of curves) {
    let last = -1;
    for (let i = 0; i <= Math.ceil(end * sampleRate); i++) {
      const s = Math.min(end, i / sampleRate);
      const value = Math.max(0, Math.min(127, Math.round(curve(s) * 127)));
      if (value === last) continue;
      motion.push([tick(s), [0xb0, controller, value]]);
      last = value;
    }
  }
  return midiFile([conductor, notes, motion]);
}

// A standard MIDI file (type 1: tracks played together) from tracks of [tick, bytes]
function midiFile(tracks) {
  const chunk = (type, bytes) => [...[...type].map((c) => c.charCodeAt(0)), ...u32(bytes.length), ...bytes];
  const header = chunk('MThd', [0, 1, ...u16(tracks.length), ...u16(TICKS)]);
  const body = tracks.flatMap((events) => {
    const sorted = events.map((e, i) => [...e, i]).sort((a, b) => a[0] - b[0] || a[2] - b[2]);
    let now = 0;
    const bytes = [];
    for (const [at, data] of sorted) {
      bytes.push(...vlq(at - now), ...data);
      now = at;
    }
    bytes.push(0, 0xff, 0x2f, 0); // End of track
    return chunk('MTrk', bytes);
  });
  return new Uint8Array([...header, ...body]);
}

function vlq(n) {
  const bytes = [n & 0x7f];
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}
const u16 = (n) => [(n >> 8) & 0xff, n & 0xff];
const u32 = (n) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
