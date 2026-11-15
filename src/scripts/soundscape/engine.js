// Plays a soundscape: a page's tracks, each a synth or a sampler with its own effects, played by what happens on the
// page. A soundscape is plain data (JSON), made in the sound studio (tools/sound-studio) and saved in
// src/sounds/soundscapes:
//
//   { master: { volume }, room: { size, tone },
//     tracks: [{ id, name, kind: 'synth' | 'sampler', mute, solo,
//                triggers: [{ on: 'drop', does: 'play' | 'start' | 'stop', chance, delay }],
//                notes: {...}, synth: {...} or sampler: { samples: [{ src, start, end }], ... }, fx: {...}, mix: {...} }],
//     links: [{ id, kind: 'set', on: 'enter', track, param: 'fx.echoMix', to: 0.5, over: 3 },
//             { id, kind: 'follow', signal: 'mouse-x', track, param: 'synth.cutoff', from: 300, to: 8000, smooth: 0.1 }] }
//
// Whatever a track leaves out is as params.js has it. A trigger ties an event (see src/scripts/scene_events.js) to a
// track: 'play' plays one note, 'start' starts a note that's held (a background, a drone, a loop) and 'stop' lets it
// go. A link ties an event or a signal to one of a track's settings: an event sets it somewhere new, gliding there
// over some seconds ('set'), and a signal carries it between two values as it moves ('follow'). Links never change
// what's saved: they sit on top of it until reset().
//
//   const engine = createEngine(audio, audioOut());
//   engine.load(soundscape);
//   engine.event('open');
//   engine.event('drop', { loud: 0.6, pan: -0.3 });
//   engine.signal('mouse-x', 0.2);

import { params, valueAt, between, scales, keys } from './params.js';
import { synthVoice } from './synth.js';
import { samplerVoice, prepare, preparedName } from './sampler.js';
import { makeChain, makeRoom } from './fx.js';

const mostVoices = 24; // The most notes a track sounds at once (the oldest goes, if there'd be more)

let made = 0;
export const newId = (prefix = 't') => prefix + Date.now().toString(36) + (made++).toString(36);

export function blankSoundscape(name) {
  return { version: 1, name, master: { volume: params['master.volume'].def }, room: { size: params['room.size'].def, tone: params['room.tone'].def }, tracks: [], links: [] };
}

export function newTrack(kind, name) {
  const track = { id: newId(), name, kind, colour: 0, mute: false, solo: false, triggers: [], notes: {}, fx: {}, mix: {} };
  track[kind] = kind === 'sampler' ? { samples: [] } : {};
  return track;
}

// meters: also measure how loud each track and the whole thing is (for the studio). onPlay(trackId): told as each
// note starts.
export function createEngine(audio, destination = audio.destination, { meters = false, onPlay = null, onLoaded = null } = {}) {
  const master = audio.createGain();
  // A limiter, so that a pile-up of sounds is squashed rather than crackling
  const limiter = audio.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  const room = makeRoom(audio);
  room.out.connect(master);
  master.connect(limiter).connect(destination);
  const meterOf = (node) => {
    if (!meters) return null;
    const meter = audio.createAnalyser();
    meter.fftSize = 512;
    node.connect(meter);
    return meter;
  };
  const masterMeter = meterOf(limiter);
  const heardSamples = new Float32Array(512);
  const peakOf = (meter) => {
    if (!meter) return 0;
    meter.getFloatTimeDomainData(heardSamples);
    let peak = 0;
    for (let i = 0; i < heardSamples.length; i++) peak = Math.max(peak, Math.abs(heardSamples[i]));
    return peak;
  };

  const noise = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
  const noiseData = noise.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;

  let data = null;
  let opened = false; // Has the scene opened (the 'open' event), since the last reset?
  let anySolo = false;
  const tracks = new Map(); // id -> what's running for that track
  const signals = new Map(); // Each signal, as it was last heard
  const buffers = new Map(); // src -> the sound file, decoded (or a promise of it, or null if it couldn't be loaded)
  const ready = new Map(); // preparedName -> a sound ready to play (see sampler.js)
  let ticking = 0;

  const get = (rt, path) => (rt.live.has(path) ? rt.live.get(path) : valueAt(rt.data, path));
  const heard = (track) => !track.mute && (!anySolo || track.solo);

  function fetchSound(src) {
    const loading = fetch(src)
      .then((response) => {
        if (!response.ok) throw new Error(`${src}: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((bytes) => audio.decodeAudioData(bytes))
      .then(
        (buffer) => {
          buffers.set(src, buffer);
          sync();
          onLoaded?.(src);
          return buffer;
        },
        (error) => {
          console.warn('soundscape: sound not loaded', error);
          buffers.set(src, null);
          return null;
        }
      );
    buffers.set(src, loading);
    return loading;
  }

  function makeTrack(track) {
    const chain = makeChain(audio);
    chain.out.connect(master);
    chain.send.connect(room.input);
    return {
      data: track,
      chain,
      meter: meterOf(chain.out),
      voices: new Set(),
      held: null, // The note that's being held, if one is
      started: false, // Has its background been started, since the last reset?
      stopped: false, // ...and been stopped by an event?
      live: new Map(), // path -> where a link has put that setting, for now
      tweens: new Map(), // path -> { from, to, start, time, back }: settings on their way somewhere
      by: new Map(), // path -> the id of the link that moved it
      turn: 0,
      lastPick: -1,
    };
  }

  function applyTrack(rt) {
    const g = (path) => get(rt, path);
    rt.chain.set({
      volume: g('mix.volume'),
      pan: g('mix.pan'),
      space: g('mix.space'),
      lowcut: g('fx.lowcut'),
      highcut: g('fx.highcut'),
      drive: g('fx.drive'),
      crush: g('fx.crush'),
      downsample: g('fx.downsample'),
      echoTime: g('fx.echoTime'),
      echoFeedback: g('fx.echoFeedback'),
      echoMix: g('fx.echoMix'),
      heard: heard(rt.data),
    });
    for (const voice of rt.voices) voice.apply();
  }

  const samplerSettings = (track) => ({
    reverse: valueAt(track, 'sampler.reverse'),
    stretch: valueAt(track, 'sampler.stretch'),
    loop: valueAt(track, 'sampler.loop'),
    blend: valueAt(track, 'sampler.blend'),
  });

  // Gets a sampler's sounds ready to play, as they arrive and as its settings change
  function readySamples(rt, wanted) {
    const s = samplerSettings(rt.data);
    for (const sample of rt.data.sampler?.samples ?? []) {
      const name = preparedName(sample, s);
      wanted.add(name);
      if (ready.has(name)) continue;
      const raw = buffers.get(sample.src);
      if (raw === undefined) fetchSound(sample.src);
      else if (raw instanceof AudioBuffer) ready.set(name, prepare(audio, raw, sample, s));
    }
  }

  // One of a sampler's sounds: the one asked for (by its place in the list), or one picked as the sampler picks
  function pickBuffer(rt, asked) {
    const s = samplerSettings(rt.data);
    const all = (rt.data.sampler?.samples ?? []).map((sample) => ready.get(preparedName(sample, s)));
    if (asked !== undefined) return all[asked] ?? null;
    const have = all.filter(Boolean);
    if (!have.length) return null;
    if (valueAt(rt.data, 'sampler.pick') === 'in turn') return have[rt.turn++ % have.length];
    let n = Math.floor(Math.random() * have.length);
    if (have.length > 1 && n === rt.lastPick) n = (n + 1) % have.length; // Not the same one twice running
    rt.lastPick = n;
    return have[n];
  }

  function pickNote(rt) {
    const n = (name) => valueAt(rt.data, 'notes.' + name);
    if (n('mode') !== 'a scale') return n('note');
    const low = Math.min(n('low'), n('high'));
    const high = Math.max(n('low'), n('high'));
    const steps = scales[n('scale')] ?? scales.chromatic;
    const key = Math.max(0, keys.indexOf(n('key')));
    const notes = [];
    for (let note = low; note <= high; note++) if (steps.includes((((note - key) % 12) + 12) % 12)) notes.push(note);
    return notes.length ? notes[Math.floor(Math.random() * notes.length)] : low;
  }

  function startVoice(rt, { note, velocity = 0.8, pan = 0, when, sample } = {}) {
    const stray = get(rt, 'notes.spread');
    const options = { note: note ?? pickNote(rt), velocity, pan, when, detune: stray ? (Math.random() * 2 - 1) * stray * 100 : 0 };
    const getter = (path) => get(rt, path);
    let voice;
    if (rt.data.kind === 'sampler') {
      const buffer = pickBuffer(rt, sample);
      if (!buffer) return null; // (Nothing in it, or still on its way)
      voice = samplerVoice(audio, getter, buffer, options, rt.chain.input);
    } else voice = synthVoice(audio, getter, noise, options, rt.chain.input);
    rt.voices.add(voice);
    voice.onended = () => {
      rt.voices.delete(voice);
      if (rt.held === voice) rt.held = null;
    };
    if (rt.voices.size > mostVoices) rt.voices.values().next().value.stop();
    onPlay?.(rt.data.id);
    return voice;
  }

  // One note, let go after the track's note length (a sound file plays through to its end, unless it loops)
  function play(rt, options = {}) {
    const voice = startVoice(rt, options);
    if (voice && (rt.data.kind !== 'sampler' || valueAt(rt.data, 'sampler.loop'))) {
      voice.release(Math.max(options.when ?? 0, audio.currentTime) + get(rt, 'notes.length'));
    }
    return voice;
  }

  // A note that's held until it's let go: a background, a drone, a loop
  function hold(rt, when) {
    if (rt.held) return;
    rt.stopped = false;
    rt.held = startVoice(rt, { when });
    rt.started = !!rt.held; // (If its sound's still on its way, sync() starts it once it's arrived)
  }
  function letGo(rt, when = audio.currentTime) {
    rt.stopped = true;
    if (!rt.held) return;
    rt.held.release(when, rt.data.kind === 'sampler' ? Math.max(0.01, get(rt, 'sampler.fadeOut')) : null);
    rt.held = null;
  }

  // A link moves one of a track's settings to `to` (or, with null, back to how it's set), over `seconds`
  function glideTo(rt, path, to, seconds, id) {
    const param = params[path];
    const back = to === null || to === undefined;
    const target = back ? valueAt(rt.data, path) : Math.min(param.max, Math.max(param.min, to));
    rt.by.set(path, id);
    if (!(seconds >= 0.03)) {
      rt.tweens.delete(path);
      if (back) {
        rt.live.delete(path);
        rt.by.delete(path);
      } else rt.live.set(path, target);
      applyTrack(rt);
      return;
    }
    rt.tweens.set(path, { from: get(rt, path), to: target, start: audio.currentTime, time: seconds, back });
    if (!ticking) ticking = setInterval(tick, 30);
  }
  function tick() {
    const now = audio.currentTime;
    let busy = false;
    for (const rt of tracks.values()) {
      if (!rt.tweens.size) continue;
      for (const [path, tween] of rt.tweens) {
        const t = Math.min(1, (now - tween.start) / tween.time);
        rt.live.set(path, between(params[path], tween.from, tween.to, t));
        if (t < 1) busy = true;
        else {
          rt.tweens.delete(path);
          if (tween.back) {
            rt.live.delete(path);
            rt.by.delete(path);
          }
        }
      }
      applyTrack(rt);
    }
    if (!busy) {
      clearInterval(ticking);
      ticking = 0;
    }
  }

  // Keeps what links have done in step with the links as they are now: one that's gone, or points somewhere else,
  // lets go of what it moved; one whose value's been changed moves it there; and one following a signal follows it
  function relink() {
    const links = new Map((data.links ?? []).map((link) => [link.id, link]));
    for (const rt of tracks.values()) {
      for (const [path, id] of rt.by) {
        const link = links.get(id);
        if (!link || link.track !== rt.data.id || link.param !== path) {
          rt.live.delete(path);
          rt.tweens.delete(path);
          rt.by.delete(path);
        } else if (link.kind === 'set' && !rt.tweens.has(path)) {
          if (link.to === null || link.to === undefined) {
            rt.live.delete(path);
            rt.by.delete(path);
          } else rt.live.set(path, link.to);
        }
      }
    }
    for (const link of links.values()) {
      const rt = tracks.get(link.track);
      const param = params[link.param];
      if (link.kind !== 'follow' || !rt || !param || !signals.has(link.signal)) continue;
      rt.tweens.delete(link.param);
      rt.live.set(link.param, between(param, link.from, link.to, signals.get(link.signal)));
      rt.by.set(link.param, link.id);
    }
  }

  // Takes on the soundscape as it is now: call it whenever anything in it's been changed
  function sync() {
    if (!data) return;
    master.gain.setTargetAtTime(data.master?.volume ?? params['master.volume'].def, audio.currentTime, 0.02);
    room.set({ size: data.room?.size ?? params['room.size'].def, tone: data.room?.tone ?? params['room.tone'].def });
    const ids = new Set(data.tracks.map((track) => track.id));
    for (const [id, rt] of tracks) {
      if (ids.has(id)) continue;
      for (const voice of rt.voices) voice.stop();
      setTimeout(() => rt.chain.disconnect(), 500);
      tracks.delete(id);
    }
    anySolo = data.tracks.some((track) => track.solo);
    for (const track of data.tracks) {
      if (!tracks.has(track.id)) tracks.set(track.id, makeTrack(track));
      tracks.get(track.id).data = track;
    }
    relink();
    const wanted = new Set();
    for (const rt of tracks.values()) {
      applyTrack(rt);
      if (rt.data.kind === 'sampler') readySamples(rt, wanted);
      const triggers = rt.data.triggers ?? [];
      // A background added, or still on its way, once the scene's already open starts as soon as it can
      if (opened && !rt.started && !rt.stopped && triggers.some((trigger) => trigger.on === 'open' && trigger.does === 'start')) {
        rt.held = startVoice(rt);
        rt.started = !!rt.held;
      }
      if (rt.held && !triggers.some((trigger) => trigger.does === 'start')) {
        letGo(rt);
        rt.stopped = false;
        rt.started = false;
      }
    }
    for (const name of ready.keys()) if (!wanted.has(name)) ready.delete(name);
  }

  function event(name, detail = {}) {
    if (!data) return;
    if (name === 'open') opened = true;
    const now = audio.currentTime;
    for (const rt of tracks.values()) {
      for (const trigger of rt.data.triggers ?? []) {
        if (trigger.on !== name) continue;
        if ((trigger.chance ?? 1) < 1 && Math.random() >= trigger.chance) continue;
        const when = now + (trigger.delay ?? 0);
        if (trigger.does === 'start') hold(rt, when);
        else if (trigger.does === 'stop') letGo(rt, when);
        else play(rt, { velocity: Math.min(1, Math.max(0.02, detail.loud ?? 0.8)), pan: detail.pan ?? 0, when });
      }
    }
    for (const link of data.links ?? []) {
      const rt = tracks.get(link.track);
      if (link.kind === 'set' && link.on === name && rt && params[link.param]) glideTo(rt, link.param, link.to, link.over ?? 0, link.id);
    }
  }

  function signal(name, value) {
    signals.set(name, value);
    for (const link of data?.links ?? []) {
      const rt = tracks.get(link.track);
      const param = params[link.param];
      if (link.kind !== 'follow' || link.signal !== name || !rt || !param) continue;
      glideTo(rt, link.param, between(param, link.from, link.to, value), link.smooth ?? 0.1, link.id);
    }
  }

  return {
    load(soundscape) {
      data = soundscape;
      sync();
    },
    sync,
    event,
    signal,
    // Back to the start: everything silent, and every setting a link moved back where it's saved
    reset() {
      opened = false;
      signals.clear();
      for (const rt of tracks.values()) {
        for (const voice of rt.voices) voice.stop();
        Object.assign(rt, { held: null, started: false, stopped: false });
        rt.live.clear();
        rt.tweens.clear();
        rt.by.clear();
        applyTrack(rt);
      }
    },
    // Playing a track by hand: a note held until noteOff(), or one note as an event would play it
    noteOn(id, note, velocity = 0.8) {
      const rt = tracks.get(id);
      return rt ? startVoice(rt, { note, velocity }) : null;
    },
    noteOff(voice) {
      voice?.release(audio.currentTime, null);
    },
    audition(id, options = {}) {
      const rt = tracks.get(id);
      return rt ? play(rt, options) : null;
    },
    // A held note started again, so a setting that only the next note hears is heard now
    restrike(id) {
      const rt = tracks.get(id);
      if (!rt?.held) return;
      rt.held.release(audio.currentTime, 0.25);
      rt.held = startVoice(rt);
    },
    // A link, tried by hand: what it changes goes where it says, as if its event had happened
    tryLink(link) {
      const rt = tracks.get(link.track);
      if (rt && params[link.param]) glideTo(rt, link.param, link.to, link.over ?? 0, link.id);
    },
    // Where a link has a setting just now (undefined if none has moved it)
    liveValue: (id, path) => tracks.get(id)?.live.get(path),
    holding: (id) => !!tracks.get(id)?.held,
    sounding: (id) => tracks.get(id)?.voices.size ?? 0,
    level: (id) => peakOf(id ? tracks.get(id)?.meter : masterMeter),
    squashing: () => limiter.reduction, // How hard the limiter's working, in decibels (0 = not at all)
    signals,
    // A sound file, decoded, once it's arrived (for drawing it), and a way to hand one over that isn't at its URL yet
    sound: (src) => (buffers.get(src) instanceof AudioBuffer ? buffers.get(src) : null),
    loadSound: (src) => (buffers.has(src) ? Promise.resolve(buffers.get(src)) : fetchSound(src)),
    provide(src, buffer) {
      buffers.set(src, buffer);
      sync();
    },
    dispose() {
      clearInterval(ticking);
      for (const rt of tracks.values()) {
        for (const voice of rt.voices) voice.stop();
        rt.chain.disconnect();
      }
      tracks.clear();
      setTimeout(() => limiter.disconnect(), 300);
    },
  };
}
