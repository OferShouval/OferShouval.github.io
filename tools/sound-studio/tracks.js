// The tracks, as rows like a mixer's: each one's name, what plays it (its triggers), mute and solo, its volume with a
// meter behind it, and its pan and space. Clicking a row opens its sound in the panel at the bottom (device.js).
//
// `studio` is the studio itself (see studio.js): its soundscape (studio.data), which track's open (studio.selected),
// and what to call when something's changed (studio.commit()).

import { h, knob, menu, popover, closeMenu } from './controls.js';
import { params, positionOf, valueOf, format, valueAt } from '../../src/scripts/soundscape/params.js';
import { newTrack, newId } from '../../src/scripts/soundscape/engine.js';
import { presets, loadPreset } from './presets.js';

export const colours = ['#5ad1e6', '#f06aa6', '#f2b84b', '#7be08a', '#9d8cff', '#ff7d5c', '#5c9dff', '#d9d36b'];
export const colourOf = (track) => colours[(track.colour ?? 0) % colours.length];

const doing = { play: 'plays a note', start: 'starts it, held', stop: 'stops it' };

export function makeTracks(holder, studio) {
  const meters = new Map(); // track id -> its meter's bar
  let renaming = null;

  // A setting of one track, for a knob
  const ctxFor = (track) => ({
    get: (path) => valueAt(track, path),
    set(path, value) {
      const [group, name] = path.split('.');
      (track[group] ??= {})[name] = value;
      studio.touch();
    },
    commit: () => studio.commit(),
    menu: (path, event) => studio.linkMenu(track, path, event),
  });

  function eventMenu(anchor, pick) {
    const { scene, page, visitor } = studio.eventGroups();
    const items = [];
    const list = (heading, events) => {
      if (!events.length) return;
      items.push({ heading });
      for (const event of events) items.push({ label: event.label, hint: event.id, action: () => pick(event.id) });
    };
    list('in this scene', scene);
    list('elsewhere on the page', page);
    list('the visitor', visitor);
    menu(anchor, items);
  }

  // A trigger's own little panel: which event, what it does, how often, how long after
  function editTrigger(anchor, track, trigger) {
    const all = studio.eventGroups();
    const select = h('select', {
      onchange: () => {
        trigger.on = select.value;
        studio.commit();
      },
    });
    for (const [heading, events] of [['in this scene', all.scene], ['elsewhere on the page', all.page], ['the visitor', all.visitor]]) {
      if (!events.length) continue;
      const group = h('optgroup', { label: heading });
      for (const event of events) group.append(new Option(event.label, event.id));
      select.append(group);
    }
    if (![...select.options].some((option) => option.value === trigger.on)) select.append(new Option(studio.labelOf(trigger.on), trigger.on));
    select.value = trigger.on;

    const does = h('div.choice-buttons.wide');
    for (const [value, label] of Object.entries(doing)) {
      does.append(
        h('button', { type: 'button', 'aria-pressed': String((trigger.does ?? 'play') === value), onclick: () => {
          trigger.does = value;
          studio.commit();
          closeMenu();
        } }, label)
      );
    }
    const chanceText = h('span.dim', {}, `${Math.round((trigger.chance ?? 1) * 100)}%`);
    const chance = h('input', { type: 'range', min: 0.05, max: 1, step: 0.05, value: trigger.chance ?? 1 });
    chance.addEventListener('input', () => {
      trigger.chance = Number(chance.value);
      if (trigger.chance >= 1) delete trigger.chance;
      chanceText.textContent = `${Math.round((trigger.chance ?? 1) * 100)}%`;
      studio.touch();
    });
    chance.addEventListener('change', () => studio.commit());
    const delay = h('input', { type: 'number', min: 0, max: 60, step: 0.05, value: trigger.delay ?? 0 });
    delay.addEventListener('change', () => {
      trigger.delay = Math.max(0, Number(delay.value) || 0);
      if (!trigger.delay) delete trigger.delay;
      studio.commit();
    });
    popover(
      anchor,
      h('label.field', {}, h('span', {}, 'when'), select),
      h('div.field', {}, h('span', {}, 'it'), does),
      h('label.field', { title: 'Not every time: only this share of the times it happens, at random' }, h('span', {}, 'how often'), chance, chanceText),
      h('label.field', { title: 'How long after it happens' }, h('span', {}, 'after'), delay, h('span.dim', {}, 'seconds')),
      h('hr'),
      h('button.menu-item.danger', { type: 'button', onclick: () => {
        track.triggers.splice(track.triggers.indexOf(trigger), 1);
        closeMenu();
        studio.commit();
      } }, 'remove it')
    );
  }

  function row(track) {
    const open = track.id === studio.selected;
    const element = h(`div.track${open ? '.selected' : ''}${track.mute ? '.muted' : ''}`);
    element.style.setProperty('--colour', colourOf(track));
    element.dataset.id = track.id;
    element.addEventListener('pointerdown', (event) => {
      if (!event.target.closest('button, input, select, .knob')) studio.select(track.id);
    });

    const play = h('button.track-play', { type: 'button', title: 'Play it once', onclick: () => {
      studio.select(track.id);
      studio.audition(track.id);
    } }, '▶');

    // Its name: double-click to change it
    const name = h('span.track-name', { title: 'Double-click to rename' }, track.name);
    name.addEventListener('dblclick', () => rename(track, name));
    if (renaming === track.id) queueMicrotask(() => rename(track, name));

    const mute = h('button.mute', { type: 'button', 'aria-pressed': String(!!track.mute), title: 'Mute: silence this track', onclick: () => {
      track.mute = !track.mute;
      studio.commit();
    } }, 'M');
    const solo = h('button.solo', { type: 'button', 'aria-pressed': String(!!track.solo), title: 'Solo: hear only this track (and any others soloed)', onclick: () => {
      track.solo = !track.solo;
      studio.commit();
    } }, 'S');

    // Its volume, with its meter behind
    const volume = params['mix.volume'];
    const level = h('i.track-level');
    meters.set(track.id, level);
    const reading = h('span.track-db', {}, format(volume, valueAt(track, 'mix.volume')));
    const fader = h('input', { type: 'range', min: 0, max: 1, step: 0.001, value: positionOf(volume, valueAt(track, 'mix.volume')), title: 'Volume (double-click to put it back)' });
    fader.addEventListener('input', () => {
      (track.mix ??= {}).volume = valueOf(volume, Number(fader.value));
      reading.textContent = format(volume, track.mix.volume);
      studio.touch();
    });
    fader.addEventListener('change', () => studio.commit());
    fader.addEventListener('dblclick', () => {
      (track.mix ??= {}).volume = volume.def;
      studio.commit();
    });

    const ctx = ctxFor(track);
    const more = h('button.track-more', { type: 'button', title: 'More', onclick: () => trackMenu(more, track) }, '⋯');
    const top = h(
      'div.track-top',
      {},
      name,
      h('span.track-kind', {}, track.kind),
      h('span.spacer'),
      mute,
      solo,
      h('div.track-fader', {}, level, fader),
      reading,
      knob('mix.pan', ctx, { small: true }),
      knob('mix.space', ctx, { small: true }),
      more
    );

    // What plays it
    const triggers = h('div.track-triggers', {}, h('span.dim', {}, track.triggers?.length ? 'on' : 'nothing plays it yet:'));
    for (const trigger of track.triggers ?? []) {
      const does = trigger.does ?? 'play';
      const chip = h(
        `button.chip.${does}`,
        { type: 'button', title: `${doing[does]} when: ${studio.labelOf(trigger.on)}. Click to change.`, onclick: () => editTrigger(chip, track, trigger) },
        does === 'start' ? h('b', {}, 'start · ') : does === 'stop' ? h('b', {}, 'stop · ') : null,
        studio.labelOf(trigger.on),
        trigger.chance ? h('span.dim', {}, ` ${Math.round(trigger.chance * 100)}%`) : null,
        trigger.delay ? h('span.dim', {}, ` +${trigger.delay}s`) : null
      );
      triggers.append(chip);
    }
    const add = h('button.chip.add', { type: 'button', title: 'Tie it to something that happens', onclick: () =>
      eventMenu(add, (id) => {
        const holds = id === 'open' && (track.kind === 'synth' || valueAt(track, 'sampler.loop'));
        (track.triggers ??= []).push({ on: id, does: holds ? 'start' : 'play' });
        studio.commit();
      }) }, '+ event');
    triggers.append(add);
    const changes = studio.data.links.filter((link) => link.track === track.id).length;
    if (changes) {
      triggers.append(
        h('button.chip.changes', { type: 'button', title: 'Events and movements that change this track’s settings while the page plays: click to see them', onclick: () => studio.showChanges(track.id) }, `↝ ${changes} change${changes > 1 ? 's' : ''}`)
      );
    }

    element.append(play, h('div.track-main', {}, top, triggers));
    return element;
  }

  function rename(track, name) {
    renaming = null;
    const input = h('input.track-rename', { type: 'text', value: track.name, spellcheck: false });
    name.replaceWith(input);
    input.select();
    const done = (keep) => {
      if (!input.isConnected) return;
      if (keep && input.value.trim()) track.name = input.value.trim();
      input.replaceWith(name);
      studio.commit();
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') done(true);
      if (event.key === 'Escape') done(false);
    });
    input.addEventListener('blur', () => done(true));
  }

  function trackMenu(anchor, track) {
    const tracks = studio.data.tracks;
    const at = tracks.indexOf(track);
    const move = (by) => {
      tracks.splice(at, 1);
      tracks.splice(at + by, 0, track);
      studio.commit();
    };
    menu(anchor, [
      { label: 'rename', action: () => {
        renaming = track.id;
        render();
      } },
      { label: 'duplicate', action: () => {
        const copy = structuredClone(track);
        copy.id = newId();
        copy.name = track.name + ' 2';
        copy.solo = false;
        tracks.splice(at + 1, 0, copy);
        // Whatever changes it changes its copy too
        for (const link of studio.data.links.filter((link) => link.track === track.id)) studio.data.links.push({ ...structuredClone(link), id: newId('l'), track: copy.id });
        studio.select(copy.id, false);
        studio.commit();
      } },
      { label: 'another colour', action: () => {
        track.colour = ((track.colour ?? 0) + 1) % colours.length;
        studio.commit();
      } },
      at > 0 && { label: 'move up', action: () => move(-1) },
      at < tracks.length - 1 && { label: 'move down', action: () => move(1) },
      '-',
      { label: 'delete', danger: true, action: () => {
        tracks.splice(at, 1);
        studio.data.links = studio.data.links.filter((link) => link.track !== track.id);
        if (studio.selected === track.id) studio.select(tracks[Math.min(at, tracks.length - 1)]?.id ?? null, false);
        studio.commit();
      } },
    ]);
  }

  function addTrack(kind, preset) {
    const tracks = studio.data.tracks;
    const taken = new Set(tracks.map((track) => track.name));
    let name = preset && preset.name !== 'plain' && preset.name !== 'as it is' ? preset.name : kind;
    for (let n = 2; taken.has(name); n++) name = `${name.replace(/ \d+$/, '')} ${n}`;
    const track = newTrack(kind, name);
    // The next colour that isn't in use, if there is one
    const used = new Set(tracks.map((t) => (t.colour ?? 0) % colours.length));
    track.colour = colours.findIndex((_, n) => !used.has(n));
    if (track.colour < 0) track.colour = tracks.length % colours.length;
    if (preset) loadPreset(track, preset);
    tracks.push(track);
    studio.select(track.id, false);
    studio.commit();
    return track;
  }

  function render() {
    meters.clear();
    holder.innerHTML = '';
    const data = studio.data;
    if (!data) return;
    if (data.starter) {
      holder.append(
        h(
          'p.starter',
          {},
          'A starter, to show how the pieces fit: rain from your drips, a plink on the near drops, a pad underneath, and your “worm suck” as you enter, which also changes the rain. Change anything, or ',
          h('button.as-link', { type: 'button', onclick: () => studio.startEmpty() }, 'start from nothing'),
          '.'
        )
      );
    }
    for (const track of data.tracks) holder.append(row(track));
    if (!data.tracks.length) holder.append(h('p.hint', {}, 'No tracks yet. Add a synth (a sound made from nothing) or a sampler (your own sound files), then tie it to something that happens in the scene.'));
    const synth = h('button', { type: 'button', title: 'A track with a synth: a sound made from nothing', onclick: () =>
      menu(synth, [{ heading: 'start from' }, ...presets.concat(studio.library.presets).filter((p) => p.kind === 'synth').map((preset) => ({ label: preset.name, hint: preset.about, action: () => addTrack('synth', preset) }))]) }, '+ synth');
    const sampler = h('button', { type: 'button', title: 'A track with a sampler: your own sound files', onclick: () => {
      addTrack('sampler');
      studio.pickSounds();
    } }, '+ sampler');
    holder.append(h('div.track-adders', {}, synth, sampler, h('span.hint', {}, 'or drop sound files anywhere')));
  }

  return {
    render,
    addTrack,
    // Each track's meter, moved to how loud it is just now (0 to 1 and a little over)
    meter(id, level) {
      const bar = meters.get(id);
      if (bar) bar.style.transform = `scaleX(${Math.min(1, Math.pow(level, 0.5))})`;
    },
  };
}
