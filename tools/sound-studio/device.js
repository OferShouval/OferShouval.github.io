// The open track's sound, along the bottom of the studio, as a row of panels, in the order the sound's made:
// what it plays (its notes), the synth or the sampler, its effects, and what changes it while the page plays (its
// links). The synth is laid out like a small analog one (a Korg minilogue): two oscillators, a mixer, a filter, two
// envelopes and an LFO. The sampler shows its sound, with handles to trim where it starts and ends.
//
// `studio` is the studio itself (see studio.js).

import { h, knob, choice, dropdown, toggle, menu, popover, closeMenu } from './controls.js';
import { params, valueAt, positionOf, valueOf, linkable } from '../../src/scripts/soundscape/params.js';
import { newId } from '../../src/scripts/soundscape/engine.js';
import { presets, loadPreset, presetOf } from './presets.js';
import { colourOf } from './tracks.js';

const shared = (path) => path.startsWith('room.') || path.startsWith('master.'); // (Settings of the whole soundscape, not of a track)
const relayout = ['notes.mode', 'sampler.follow', 'sampler.loop']; // Settings that change which controls are shown
const nameOf = (src) => decodeURIComponent(src.split('/').pop().replace(/\.[a-z0-9]+$/i, ''));
const groupNames = { mix: 'mix', notes: 'notes', synth: 'synth', sampler: 'sampler', fx: 'effects' };

export function makeDevice(holder, studio) {
  let shown = 0; // Which of a sampler's sounds the waveform's showing
  let shownFor = null;
  let watchers = []; // Told as each setting changes: (path) => ...
  const peaks = new Map(); // src -> its outline, for drawing
  let redrawWave = null;

  // A setting of the open track (or of the whole soundscape), for a control
  const ctxFor = (track) => ({
    get(path) {
      const [group, name] = path.split('.');
      return shared(path) ? studio.data[group]?.[name] ?? params[path].def : valueAt(track, path);
    },
    set(path, value) {
      const [group, name] = path.split('.');
      ((shared(path) ? studio.data : track)[group] ??= {})[name] = value;
      for (const watcher of watchers) watcher(path);
      if (!params[path].lazy) studio.touch();
    },
    commit(path) {
      studio.commit({ quiet: !relayout.includes(path), device: relayout.includes(path) });
      // What only the next note would hear is heard at once, in a note that's being held
      if (path && (!params[path].live || path.startsWith('synth.shape'))) studio.engine.restrike(track.id);
    },
    menu: (path, event) => studio.linkMenu(track, path, event),
  });

  const group = (title, ...controls) => h('div.group', {}, h('h4', {}, title), h('div.group-controls', {}, ...controls));

  // An envelope, drawn: up over its attack, down over its decay to its sustain, and away over its release
  function envelopeGraph(track, prefix) {
    const element = h('div.env');
    const draw = () => {
      const v = (part) => valueAt(track, `synth.${prefix}${part}`);
      const wide = (time) => 4 + 26 * (time / (time + 0.35));
      const [W, top, bottom] = [100, 4, 40];
      const y = (level) => bottom - level * (bottom - top);
      const a = wide(v('A'));
      const d = a + wide(v('D'));
      const r = W - wide(v('R'));
      const s = y(v('S'));
      const line = `M0 ${bottom} L${a} ${top} Q${a + (d - a) * 0.25} ${s} ${d} ${s} L${r} ${s} Q${r + (W - r) * 0.25} ${bottom} ${W} ${bottom}`;
      element.innerHTML = `<svg viewBox="0 0 ${W} 44" preserveAspectRatio="none" aria-hidden="true"><path class="env-fill" d="${line} Z"/><path class="env-line" d="${line}"/></svg>`;
    };
    watchers.push((path) => path.startsWith(`synth.${prefix}`) && draw());
    draw();
    return element;
  }

  function synthCard(track, ctx) {
    const k = (path, label) => knob(path, ctx, { label });
    const oscillator = (n) => group(`oscillator ${n}`, choice(`synth.wave${n}`, ctx), k(`synth.oct${n}`), k(`synth.pitch${n}`), k(`synth.shape${n}`));
    const envelope = (prefix, title, ...more) =>
      group(title, envelopeGraph(track, prefix), k(`synth.${prefix}A`), k(`synth.${prefix}D`), k(`synth.${prefix}S`), k(`synth.${prefix}R`), ...more);
    return h(
      'div.card.synth',
      {},
      h('h3', {}, 'synth'),
      h('div.card-row', {}, oscillator(1), oscillator(2), group('mixer', k('synth.mix1'), k('synth.mix2'), k('synth.noise'))),
      h(
        'div.card-row',
        {},
        group('filter', k('synth.cutoff'), k('synth.reso'), k('synth.egInt'), k('synth.keyTrack'), choice('synth.slope', ctx)),
        group('LFO', choice('synth.lfoWave', ctx), k('synth.lfoRate'), k('synth.lfoInt'), dropdown('synth.lfoTo', ctx))
      ),
      h('div.card-row', {}, envelope('amp', 'volume envelope'), envelope('eg', 'envelope → filter and pitch', k('synth.egPitch')))
    );
  }

  // A sound's outline: the highest and lowest it gets in each of `columns` slices
  function outline(src, buffer, columns) {
    const key = `${src}|${columns}`;
    if (!peaks.has(key)) {
      const data = buffer.getChannelData(0);
      const high = new Float32Array(columns);
      const low = new Float32Array(columns);
      const slice = data.length / columns;
      const stride = Math.max(1, Math.floor(slice / 80));
      for (let x = 0; x < columns; x++) {
        let top = 0;
        let bottom = 0;
        for (let i = Math.floor(x * slice); i < Math.min(data.length, (x + 1) * slice); i += stride) {
          if (data[i] > top) top = data[i];
          if (data[i] < bottom) bottom = data[i];
        }
        high[x] = top;
        low[x] = bottom;
      }
      const most = Math.max(0.01, ...high, ...low.map((value) => -value));
      for (let x = 0; x < columns; x++) {
        high[x] /= most; // (As tall as it'll go, however quiet the recording)
        low[x] /= most;
      }
      peaks.set(key, { high, low });
    }
    return peaks.get(key);
  }

  function samplerCard(track, ctx) {
    const samples = (track.sampler.samples ??= []);
    if (shownFor !== track.id || shown >= samples.length) shown = 0;
    shownFor = track.id;
    const k = (path, label) => knob(path, ctx, { label });
    const canvas = h('canvas.wave', { width: 1040, height: 220, title: 'Drag its ends to trim it. Click it to hear it.' });
    const about = h('span.wave-about');
    const pen = canvas.getContext('2d');
    const colour = colourOf(track);

    function draw() {
      const { width: W, height: H } = canvas;
      pen.clearRect(0, 0, W, H);
      const sample = samples[shown];
      const buffer = sample && studio.engine.sound(sample.src);
      pen.font = '22px -apple-system, sans-serif';
      pen.fillStyle = '#8b8d93';
      pen.textAlign = 'center';
      if (!sample) {
        pen.fillText('No sound in it yet: add one, or drop a sound file here', W / 2, H / 2 + 8);
        about.textContent = '';
        return;
      }
      if (!buffer) {
        pen.fillText('loading…', W / 2, H / 2 + 8);
        studio.engine.loadSound(sample.src).then(() => canvas.isConnected && draw());
        return;
      }
      const { high, low } = outline(sample.src, buffer, W / 2);
      const [start, end] = [sample.start ?? 0, sample.end ?? 1];
      const mid = H / 2;
      for (let x = 0; x < high.length; x++) {
        const inside = x / high.length >= start && x / high.length <= end;
        pen.fillStyle = colour;
        pen.globalAlpha = inside ? 0.95 : 0.22;
        const top = mid - high[x] * (mid - 6);
        pen.fillRect(x * 2, top, 1.5, Math.max(1.5, mid - low[x] * (mid - 6) - top));
      }
      pen.globalAlpha = 1;
      // Its fades, as far as they reach into what's played
      const played = (end - start) * buffer.duration * valueAt(track, 'sampler.stretch');
      const [from, to] = [start * W, end * W];
      pen.strokeStyle = '#fff';
      pen.lineWidth = 2;
      pen.globalAlpha = 0.6;
      const fade = (seconds, at, way) => {
        const reach = Math.min(1, seconds / played) * (to - from);
        if (reach < 3) return;
        pen.beginPath();
        pen.moveTo(at, H - 4);
        pen.lineTo(at + way * reach, 4);
        pen.stroke();
      };
      fade(valueAt(track, 'sampler.fadeIn'), from, 1);
      if (!valueAt(track, 'sampler.loop')) fade(valueAt(track, 'sampler.fadeOut'), to, -1);
      pen.globalAlpha = 1;
      // The handles
      for (const [at, way] of [[from, 1], [to, -1]]) {
        pen.fillStyle = '#fff';
        pen.fillRect(at - 1.5, 0, 3, H);
        pen.beginPath();
        pen.moveTo(at, 0);
        pen.lineTo(at + way * 16, 0);
        pen.lineTo(at, 22);
        pen.fill();
      }
      const seconds = (end - start) * buffer.duration;
      about.textContent = `${nameOf(sample.src)} · ${seconds < 10 ? seconds.toFixed(2) : seconds.toFixed(1)} s${end - start < 0.999 ? ` of ${buffer.duration.toFixed(1)}` : ''}`;
    }
    redrawWave = () => canvas.isConnected && draw();
    watchers.push((path) => path.startsWith('sampler.') && draw());
    draw();

    let drag = null;
    const along = (event) => {
      const box = canvas.getBoundingClientRect();
      return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    };
    canvas.addEventListener('pointerdown', (event) => {
      const sample = samples[shown];
      if (!sample) return;
      const at = along(event);
      const near = 12 / canvas.getBoundingClientRect().width;
      const toStart = Math.abs(at - (sample.start ?? 0));
      const toEnd = Math.abs(at - (sample.end ?? 1));
      if (Math.min(toStart, toEnd) > near) return studio.audition(track.id, { sample: shown });
      drag = toStart < toEnd ? 'start' : 'end';
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      const sample = samples[shown];
      if (!sample) return;
      const at = along(event);
      if (!drag) {
        const near = 12 / canvas.getBoundingClientRect().width;
        canvas.style.cursor = Math.min(Math.abs(at - (sample.start ?? 0)), Math.abs(at - (sample.end ?? 1))) <= near ? 'ew-resize' : 'pointer';
        return;
      }
      if (drag === 'start') sample.start = Math.round(Math.min(at, (sample.end ?? 1) - 0.005) * 10000) / 10000;
      else sample.end = Math.round(Math.max(at, (sample.start ?? 0) + 0.005) * 10000) / 10000;
      draw();
    });
    canvas.addEventListener('pointerup', () => {
      if (!drag) return;
      drag = null;
      studio.commit({ quiet: true });
      studio.engine.restrike(track.id);
      studio.audition(track.id, { sample: shown });
    });

    const list = h('div.sample-list');
    samples.forEach((sample, n) => {
      list.append(
        h(
          `div.sample${n === shown ? '.shown' : ''}`,
          { title: sample.src, onclick: () => {
            shown = n;
            render();
            studio.audition(track.id, { sample: n });
          } },
          h('span', {}, nameOf(sample.src)),
          h('button', { type: 'button', title: 'Take it out of this sampler', onclick: (event) => {
            event.stopPropagation();
            samples.splice(n, 1);
            studio.commit({ device: true });
          } }, '×')
        )
      );
    });
    const add = h('button.add-sounds', { type: 'button', title: 'Add sounds from the site’s sound folders', onclick: () => soundPicker(add, track) }, '+ sounds');
    list.append(add);

    const loops = valueAt(track, 'sampler.loop');
    return h(
      'div.card.sampler',
      {},
      h('h3', {}, 'sampler', about),
      h('div.card-row', {}, h('div.wave-holder', {}, canvas), list),
      h(
        'div.card-row',
        {},
        group('shape', k('sampler.fadeIn'), k('sampler.fadeOut'), k('sampler.stretch')),
        group('how it plays', h('div.toggles', {}, toggle('sampler.reverse', ctx), toggle('sampler.loop', ctx), toggle('sampler.follow', ctx)), loops ? k('sampler.blend') : null, samples.length > 1 ? choice('sampler.pick', ctx) : null)
      )
    );
  }

  // Choosing sounds for a sampler, from public/sounds: click one to add it (or take it out), ▸ to hear it first
  function soundPicker(anchor, track) {
    const samples = (track.sampler.samples ??= []);
    const has = (src) => samples.some((sample) => sample.src === src);
    const folders = new Map();
    for (const src of studio.library.sounds) {
      const folder = src.split('/').slice(2, -1).join('/') || 'sounds';
      if (!folders.has(folder)) folders.set(folder, []);
      folders.get(folder).push(src);
    }
    const rows = h('div.picker-list');
    const flip = (src) => {
      if (has(src)) samples.splice(samples.findIndex((sample) => sample.src === src), 1);
      else samples.push({ src, start: 0, end: 1 });
    };
    const section = studio.section.sounds;
    const order = [...folders.keys()].sort((a, b) => (a === section ? -1 : b === section ? 1 : a.localeCompare(b)));
    for (const folder of order) {
      const sounds = folders.get(folder);
      rows.append(h('div.menu-heading', {}, folder));
      // Numbered sets (drip01, drip02...) can go in all at once
      const sets = new Map();
      for (const src of sounds) {
        const stem = nameOf(src).replace(/[-_ ]?\d+$/, '');
        if (stem !== nameOf(src)) sets.set(stem, [...(sets.get(stem) ?? []), src]);
      }
      for (const [stem, set] of sets) {
        if (set.length < 3) continue;
        rows.append(
          h('button.menu-item.set', { type: 'button', onclick: () => {
            for (const src of set) if (!has(src)) samples.push({ src, start: 0, end: 1 });
            closeMenu();
            studio.commit({ device: true });
          } }, `all ${set.length} “${stem}” sounds`)
        );
      }
      for (const src of sounds) {
        const row = h(
          `div.picker-row${has(src) ? '.in' : ''}`,
          {},
          h('button.picker-play', { type: 'button', title: 'Hear it', onclick: () => studio.preview(src) }, '▸'),
          h('button.picker-name', { type: 'button', title: has(src) ? 'In this sampler: click to take it out' : 'Click to add it', onclick: () => {
            flip(src);
            row.classList.toggle('in', has(src));
            studio.commit({ device: true, keepMenu: true });
          } }, nameOf(src))
        );
        rows.append(row);
      }
    }
    if (!studio.library.sounds.length) rows.append(h('p.hint', {}, 'No sounds in public/sounds yet.'));
    popover(anchor, h('div.picker', {}, h('p.hint', {}, 'Click a sound to put it in this sampler. Or drop sound files anywhere on the studio.'), rows));
  }

  function notesCard(track, ctx) {
    const k = (path, label) => knob(path, ctx, { label });
    const pitched = track.kind === 'synth' || valueAt(track, 'sampler.follow');
    const scale = valueAt(track, 'notes.mode') === 'a scale';
    const lasting = track.kind === 'synth' || valueAt(track, 'sampler.loop');
    return h(
      'div.card.notes',
      {},
      h('h3', {}, 'notes'),
      pitched
        ? [
            h('div.card-row', {}, choice('notes.mode', ctx)),
            scale
              ? [h('div.card-row', {}, k('notes.low'), k('notes.high')), h('div.card-row', {}, dropdown('notes.scale', ctx), dropdown('notes.key', ctx))]
              : h('div.card-row', {}, k('notes.note')),
          ]
        : h('p.hint', {}, 'It plays as recorded. (“follows notes”, in the sampler, plays it like an instrument.)'),
      h('div.card-row', {}, k('notes.transpose'), k('notes.spread'), lasting ? k('notes.length') : null)
    );
  }

  function effectsCard(track, ctx) {
    const k = (path, label) => knob(path, ctx, { label });
    return h(
      'div.card.effects',
      {},
      h('h3', {}, 'effects'),
      h('div.card-row', {}, group('tone', k('fx.lowcut'), k('fx.highcut')), group('dirt', k('fx.drive'), k('fx.crush'), k('fx.downsample'))),
      h('div.card-row', {}, group('echo', k('fx.echoMix'), k('fx.echoTime'), k('fx.echoFeedback'))),
      h('div.card-row', {}, group('room (one room, shared by every track)', k('mix.space', 'send'), k('room.size', 'size'), k('room.tone', 'tone')))
    );
  }

  // What changes this track while the page plays: its links (see engine.js)
  function linksCard(track) {
    const data = studio.data;
    const mine = data.links.filter((link) => link.track === track.id);
    const targets = linkable(track.kind);
    const card = h('div.card.links', {}, h('h3', {}, 'changes', h('span.wave-about', {}, 'what moves this track’s settings while the page plays')));

    const paramSelect = (link, changed) => {
      const select = h('select', { title: 'Which setting' });
      const groups = new Map();
      for (const param of targets) {
        const name = groupNames[param.id.split('.')[0]];
        if (!groups.has(name)) groups.set(name, h('optgroup', { label: name }));
        groups.get(name).append(new Option(param.label, param.id));
      }
      select.append(...groups.values());
      select.value = link.param;
      select.addEventListener('change', () => {
        link.param = select.value;
        changed();
        studio.commit({ device: true });
      });
      return select;
    };
    const sourceSelect = (link, field, groups) => {
      const select = h('select', {});
      for (const [heading, list] of groups) {
        if (!list.length) continue;
        const optgroup = h('optgroup', { label: heading });
        for (const item of list) optgroup.append(new Option(item.label, item.id));
        select.append(optgroup);
      }
      if (![...select.options].some((option) => option.value === link[field])) select.append(new Option(studio.labelOf(link[field]), link[field]));
      select.value = link[field];
      select.addEventListener('change', () => {
        link[field] = select.value;
        studio.commit({ device: true });
      });
      return select;
    };
    const valueKnob = (link, field, label) =>
      knob(link.param, {
        get: () => link[field] ?? valueAt(track, link.param),
        set(_, value) {
          link[field] = value;
          studio.touch();
        },
        commit: () => studio.commit({ quiet: true }),
      }, { small: true, label });
    const remove = (link) =>
      h('button.link-remove', { type: 'button', title: 'Take this change away', onclick: () => {
        data.links.splice(data.links.indexOf(link), 1);
        studio.commit({ device: true });
      } }, '×');

    for (const link of mine) {
      if (!params[link.param]) continue;
      if (link.kind === 'follow') {
        const groups = studio.signalGroups();
        card.append(
          h(
            'div.link',
            {},
            h('span.link-word', {}, 'as'),
            sourceSelect(link, 'signal', [['in this scene', groups.scene], ['elsewhere on the page', groups.page], ['the visitor', groups.visitor]]),
            h('span.link-word', {}, 'moves,'),
            paramSelect(link, () => {
              const param = params[link.param];
              link.from = valueAt(track, link.param);
              link.to = valueOf(param, Math.min(1, positionOf(param, link.from) + 0.35));
            }),
            h('span.link-word', {}, 'goes'),
            valueKnob(link, 'from', 'from'),
            valueKnob(link, 'to', 'to'),
            remove(link)
          )
        );
      } else {
        const groups = studio.eventGroups();
        const back = link.to === null || link.to === undefined;
        const over = h('input', { type: 'number', min: 0, max: 120, step: 0.1, value: link.over ?? 0, title: 'How many seconds it takes to get there' });
        over.addEventListener('change', () => {
          link.over = Math.max(0, Number(over.value) || 0);
          studio.commit({ quiet: true });
        });
        card.append(
          h(
            'div.link',
            {},
            h('button.link-try', { type: 'button', title: 'Try it: make this change now (starting the scene again puts everything back)', onclick: () => studio.engine.tryLink(link) }, '▸'),
            h('span.link-word', {}, 'when'),
            sourceSelect(link, 'on', [['in this scene', groups.scene], ['elsewhere on the page', groups.page], ['the visitor', groups.visitor]]),
            h('span.link-word', {}, '→'),
            paramSelect(link, () => (link.to = valueAt(track, link.param))),
            back ? h('span.link-word', {}, 'goes back to how it’s set') : [h('span.link-word', {}, 'goes to'), valueKnob(link, 'to', 'to')],
            h('span.link-word', {}, 'over'),
            over,
            h('span.link-word', {}, 's'),
            h('button.link-back', { type: 'button', 'aria-pressed': String(back), title: 'Instead of going somewhere new, go back to how the setting’s saved', onclick: () => {
              link.to = back ? valueAt(track, link.param) : null;
              studio.commit({ device: true });
            } }, '↺'),
            remove(link)
          )
        );
      }
    }
    if (!mine.length) card.append(h('p.hint', {}, 'Nothing yet. An event can move one of this track’s settings somewhere new (the rain gets darker as you enter), or a setting can follow something that keeps moving (brighter as the mouse speeds up). Right-clicking any knob does the same.'));

    const onEvent = h('button', { type: 'button', onclick: () => studio.linkMenu(track, null, onEvent, 'set') }, '+ when something happens');
    const onSignal = h('button', { type: 'button', onclick: () => studio.linkMenu(track, null, onSignal, 'follow') }, '+ following a movement');
    card.append(h('div.link-adders', {}, onEvent, onSignal));
    return card;
  }

  function presetMenu(anchor, track) {
    const all = presets.concat(studio.library.presets).filter((preset) => preset.kind === track.kind);
    const load = (preset) => {
      loadPreset(track, preset);
      studio.commit({ device: true });
      studio.engine.restrike(track.id);
      studio.audition(track.id);
    };
    menu(anchor, [
      { heading: track.kind === 'sampler' ? 'ways to play its sounds' : 'sounds to start from' },
      ...all.filter((preset) => !preset.yours).map((preset) => ({ label: preset.name, hint: preset.about, checked: track.preset === preset.name, action: () => load(preset) })),
      all.some((preset) => preset.yours) && { heading: 'yours' },
      ...all.filter((preset) => preset.yours).map((preset) => ({ label: preset.name, checked: track.preset === preset.name, action: () => load(preset) })),
      '-',
      { label: 'save this sound as a preset…', action: () => studio.savePreset(track) },
    ]);
  }

  function render() {
    watchers = [];
    redrawWave = null;
    holder.innerHTML = '';
    const track = studio.data?.tracks.find((t) => t.id === studio.selected);
    if (!track) {
      holder.append(h('p.hint.empty', {}, studio.data?.tracks.length ? 'Click a track to open its sound here.' : 'A track’s sound opens here.'));
      return;
    }
    holder.style.setProperty('--colour', colourOf(track));
    const ctx = ctxFor(track);
    const preset = h('button.preset', { type: 'button', title: 'Load a sound to start from, or save this one', onclick: () => presetMenu(preset, track) }, `preset: ${track.preset ?? '—'} ▾`);
    const head = h(
      'div.device-head',
      {},
      h('i.dot'),
      h('b', {}, track.name),
      h('span.track-kind', {}, track.kind),
      preset,
      h('span.spacer'),
      h('span.hint', {}, 'Play it with the keys  A W S E D F T G Y H U J K  ·  Z and X change octave'),
      h('span.octave', { id: 'octave' }, ''),
      h('button', { type: 'button', id: 'midi', title: 'Play the open track from a MIDI keyboard', onclick: () => studio.connectMidi() }, 'MIDI')
    );
    const cards = h('div.cards', {}, notesCard(track, ctx), track.kind === 'sampler' ? samplerCard(track, ctx) : synthCard(track, ctx), effectsCard(track, ctx), linksCard(track));
    holder.append(head, cards);
    studio.showOctave();
  }

  return {
    render,
    pickSounds() {
      const anchor = holder.querySelector('.add-sounds');
      const track = studio.data?.tracks.find((t) => t.id === studio.selected);
      if (anchor && track?.kind === 'sampler') soundPicker(anchor, track);
    },
    soundArrived: () => redrawWave?.(),
  };
}

export { presetOf };
