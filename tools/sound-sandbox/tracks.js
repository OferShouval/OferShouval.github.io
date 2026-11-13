// A scene's tracks, in the sound sandbox: each one is a synth or a sampler of its own, playing at its own moment in
// the scene: on every drop, only far or near ones, the ones clicked, or all the time, as a background. Selecting one
// opens its synth or sampler in the sandbox's controls (where a saved patch can be loaded into it, or it can be saved
// as one, but only when that's asked for). The tracks, with their sounds, are kept in src/sounds/scenes/<scene>.json
// (through dev-server.js) as they change, so nothing's lost between visits. Used by sandbox.js.
//
// A track: { kind: 'synth' | 'sampler', patch: (its sound, a whole patch), from: the saved patch it was loaded from or
//            saved as ('landing/raindrop.json'), or null, when: 'drop' | 'far' | 'near' | 'pressed' | 'always',
//            volume: 0 to 1.5, off: true (muted) or false }
// Each plays through its own volume, so muting one silences it at once (a background keeps going, unheard, and comes
// straight back as it's unmuted).

import { instrument, complete } from '../../src/scripts/patch.js';

export const moments = [
  ['drop', 'every drop'],
  ['far', 'far drops'],
  ['near', 'near drops'],
  ['pressed', 'drops you click'],
  ['always', 'all the time'],
];
const matches = (when, drop) =>
  when === 'drop' || (when === 'far' && drop.near < 0.5) || (when === 'near' && drop.near >= 0.5) || (when === 'pressed' && drop.pressed);
const lowestOf = (p) => Math.round(Math.min(p.range.low, p.range.high));
export const kindOf = (patch) => (patch.layers.some((layer) => layer.kind === 'sample') ? 'sampler' : 'synth');

// `context`: audio and master (where they play), holder (the element they're shown in), library() (the sandbox's),
// blank(kind) (an empty synth or sampler), samplerOf(srcs) (a sampler of these sound files), select(track) (open it in
// the controls, or nothing, for null), selected() (the one that's open), onSave(tracks)
export function makeTracks(context) {
  const { audio, master, holder } = context;
  let tracks = [];
  const players = new WeakMap(); // track -> { player, gain }
  let held = []; // [{ player, note }] for the tracks playing all the time, while they are
  let holding = false;

  const loudness = (track) => (track.off ? 0 : track.volume);
  // What it's called: its sound's name, or (with none) its kind and number ("synth 2")
  const label = (track) => track.patch.name?.trim() || `${track.kind} ${tracks.filter((t) => t.kind === track.kind).indexOf(track) + 1}`;

  // What plays a track: its own instrument, into its own volume
  function playerOf(track) {
    let made = players.get(track);
    if (!made) {
      const gain = audio.createGain();
      gain.gain.value = loudness(track);
      gain.connect(master);
      made = { player: instrument(audio, track.patch, gain, { follow: false }), gain };
      players.set(track, made);
    }
    return made.player;
  }
  function forget(track) {
    const made = players.get(track);
    if (made) setTimeout(() => made.player.disconnect(), 8000); // Once it's died away
    players.delete(track);
  }
  // A track's volume, now: quickly, so a mute's at once
  function setLoudness(track) {
    players.get(track)?.gain.gain.setTargetAtTime(loudness(track), audio.currentTime, 0.015);
  }

  function save() {
    clearTimeout(save.timer);
    save.timer = setTimeout(() => context.onSave(tracks), 400);
  }

  function holdAll(on) {
    for (const { player, note } of held) player.noteOff(note);
    held = [];
    holding = on;
    if (!on) return;
    for (const track of tracks.filter((t) => t.when === 'always')) {
      const player = playerOf(track);
      held.push({ player, note: player.noteOn(lowestOf(player.patch), 0.8) });
    }
  }
  let reholding = 0;
  function holdAgain() {
    clearTimeout(reholding);
    reholding = setTimeout(() => holding && holdAll(true), 250);
  }

  function changed() {
    save();
    if (holding) holdAll(true);
    render();
  }

  // --- Showing them ---
  function render() {
    holder.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'tracks-head';
    head.innerHTML = '<h3>tracks</h3>';
    const adder = (kind, tip) => {
      const button = document.createElement('button');
      button.textContent = '+ ' + kind;
      button.title = tip;
      button.onclick = () => {
        const track = { kind, patch: context.blank(kind), from: null, when: 'drop', volume: 0.8, off: false };
        tracks.push(track);
        context.select(track);
        changed();
      };
      return button;
    };
    const buttons = document.createElement('span');
    buttons.className = 'tracks-buttons';
    buttons.append(adder('synth', 'A track with a synth of its own: waves, made from nothing'), adder('sampler', 'A track with a sampler of its own: your sound files'));
    head.append(buttons);
    holder.append(head);
    if (!tracks.length) {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = 'No tracks yet. Add a synth or a sampler, then choose when it plays.';
      holder.append(hint);
    }
    const open = context.selected();
    for (const track of tracks) {
      const row = document.createElement('div');
      row.className = 'track' + (track === open ? ' selected' : '');

      // Muting it: silent at once (but still going, so it comes straight back)
      const mute = document.createElement('button');
      mute.className = 'mute';
      const showMute = () => {
        mute.textContent = track.off ? 'muted' : 'mute';
        mute.setAttribute('aria-pressed', String(!!track.off));
        mute.title = track.off ? 'Muted: click to hear it again' : 'Silence this track';
        row.classList.toggle('off', !!track.off);
      };
      showMute();
      mute.onclick = () => {
        track.off = !track.off;
        showMute();
        setLoudness(track);
        save();
      };

      // Its name: pressing it opens its synth or sampler in the controls
      const name = document.createElement('button');
      name.className = 'track-name';
      const kind = document.createElement('span');
      kind.className = 'kind';
      kind.textContent = track.kind;
      name.append(kind, ' ' + (track.patch.name?.trim() || label(track).replace(track.kind + ' ', '')));
      name.title = track === open ? 'Its ' + track.kind + ' is open in the controls' : 'Open its ' + track.kind + ' in the controls';
      name.onclick = () => {
        context.select(track);
        render();
      };

      const when = document.createElement('select');
      for (const [value, text] of moments) when.append(new Option(text, value));
      when.value = track.when;
      when.title = 'When it plays';
      when.onchange = () => {
        track.when = when.value;
        when.blur(); // So the computer's keys play notes again
        changed();
      };

      const volume = document.createElement('input');
      volume.type = 'range';
      volume.min = 0;
      volume.max = 1.5;
      volume.step = 0.01;
      volume.value = track.volume;
      volume.title = 'Volume';
      volume.oninput = () => {
        track.volume = +volume.value;
        setLoudness(track);
        save();
      };

      const remove = document.createElement('button');
      remove.textContent = '×';
      remove.title = 'Take this track out';
      remove.onclick = () => {
        const at = tracks.indexOf(track);
        tracks.splice(at, 1);
        forget(track);
        if (track === context.selected()) context.select(tracks[Math.min(at, tracks.length - 1)] ?? null);
        changed();
      };

      row.append(mute, name, when, volume, remove);
      holder.append(row);
    }
  }

  return {
    // The tracks as they were saved. Older ones named a sound rather than having their own ('patch:art/ghost-harp.json'
    // or 'sample:/sounds/landing/drip01.m4a|...'): they're given a copy of it.
    load(saved) {
      tracks = [];
      for (const old of structuredClone(saved ?? [])) {
        let track = old;
        if (!old.patch) {
          const at = old.sound?.indexOf(':') ?? -1;
          const [kind, what] = at < 0 ? [null, null] : [old.sound.slice(0, at), old.sound.slice(at + 1)];
          const found = kind === 'patch' && context.library().patches.find((p) => p.file === what);
          const patch = found ? structuredClone(found.patch) : kind === 'sample' ? context.samplerOf(what.split('|')) : context.blank('synth');
          track = { kind: kindOf(complete(patch)), patch, from: found ? what : null, when: old.when ?? 'drop', volume: old.volume ?? 0.8, off: !!old.off };
        }
        track.patch = complete(track.patch);
        tracks.push(track);
      }
      render();
      return tracks;
    },
    render,
    label,
    get list() {
      return tracks;
    },
    // Whether there are tracks to play (if not, the sandbox plays the open patch on each drop)
    get active() {
      return tracks.length > 0;
    },
    // A drop landing in the scene: each track that plays on it plays
    drop(drop) {
      for (const track of tracks.filter((t) => !t.off && t.when !== 'always' && matches(t.when, drop))) {
        const player = playerOf(track);
        player.play(player.randomNote(), drop.loud, 2, undefined, { pan: drop.pan });
      }
    },
    hold: holdAll,
    // A track's sound has changed (its sliders, or a patch loaded into it): it plays the new sound from now on, a
    // background starting a new note of it so it's heard
    soundChanged(track) {
      track.kind = kindOf(track.patch);
      players.get(track)?.player.setPatch(track.patch);
      if (holding && track.when === 'always') holdAgain();
      save();
      render();
    },
  };
}
