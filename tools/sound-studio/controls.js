// The sound studio's controls: knobs, switches, menus. Each is made for one setting (see
// src/scripts/soundscape/params.js) and given a `ctx` that says where the setting lives:
//
//   ctx.get(path)          its value now
//   ctx.set(path, value)   change it (while a knob's being turned: many times)
//   ctx.commit(path)       the change is finished: one step for undo, and it's saved
//   ctx.menu?.(path, event) a right-click on it (for tying it to an event)
//
// A knob: drag up and down (shift for fine), scroll over it, double-click to put it back where it starts, click its
// value to type one, or use the arrow keys.

import { params, positionOf, valueOf, format, parse } from '../../src/scripts/soundscape/params.js';

// h('div.card.open', { title: '...', onclick }, child, 'text', ...)
export function h(tag, props = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const element = document.createElement(name || 'div');
  if (classes.length) element.className = classes.join(' ');
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) element.addEventListener(key.slice(2), value);
    else if (key === 'style' && typeof value === 'object') Object.assign(element.style, value);
    else if (key in element && key !== 'list') element[key] = value;
    else element.setAttribute(key, value === true ? '' : value);
  }
  element.append(...children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false));
  return element;
}

const arc = 'M 8.69 31.31 A 16 16 0 1 1 31.31 31.31'; // Three quarters of a circle, open at the bottom
const svg = (inner, box = '0 0 40 40') => `<svg viewBox="${box}" aria-hidden="true">${inner}</svg>`;

export function knob(path, ctx, { label, small = false } = {}) {
  const param = params[path];
  const centre = param.min < 0 && param.max > 0 ? positionOf(param, 0) : 0; // Where its coloured arc grows from
  const element = h(`div.knob${small ? '.small' : ''}`, { tabIndex: 0, title: param.tip ?? '' });
  element.dataset.path = path;
  element.innerHTML =
    svg(
      `<path class="knob-track" d="${arc}" pathLength="100"/><path class="knob-fill" d="${arc}" pathLength="100"/>` +
        `<path class="knob-live" d="${arc}" pathLength="100"/><circle class="knob-cap" cx="20" cy="20" r="10.5"/>` +
        `<line class="knob-hand" x1="20" y1="13" x2="20" y2="9.5"/>`
    ) + `<span class="knob-label"></span><span class="knob-value"></span>`;
  const [fill, live, , hand] = ['.knob-fill', '.knob-live', '.knob-cap', '.knob-hand'].map((part) => element.querySelector(part));
  const text = element.querySelector('.knob-value');
  element.querySelector('.knob-label').textContent = label ?? param.label;

  const span = (path, from, to) => {
    path.setAttribute('stroke-dasharray', `${Math.abs(to - from) * 100} 100`);
    path.setAttribute('stroke-dashoffset', -Math.min(from, to) * 100);
  };
  function show() {
    const value = ctx.get(path);
    const at = positionOf(param, value);
    span(fill, centre, at);
    hand.setAttribute('transform', `rotate(${-135 + 270 * at} 20 20)`);
    if (!text.querySelector('input')) text.textContent = format(param, value);
  }
  // Where a link has it just now, if one's moved it: drawn over the knob, which stays where it's saved
  element.showLive = (value) => {
    const moved = value !== undefined && Math.abs(positionOf(param, value) - positionOf(param, ctx.get(path))) > 0.003;
    element.classList.toggle('moved', moved);
    if (moved) {
      span(live, positionOf(param, ctx.get(path)), positionOf(param, value));
      text.textContent = format(param, value);
    } else if (element.wasMoved) show();
    element.wasMoved = moved;
  };
  element.show = show;

  const put = (position) => {
    ctx.set(path, valueOf(param, position));
    show();
  };
  let drag = null;
  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('.knob-value')) return; // (Its value's for clicking, to type one)
    element.setPointerCapture(event.pointerId);
    drag = { y: event.clientY, at: positionOf(param, ctx.get(path)), moved: false };
    element.classList.add('turning');
  });
  element.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const step = (drag.y - event.clientY) / (event.shiftKey ? 1600 : 170);
    if (!step) return;
    drag.at = Math.min(1, Math.max(0, drag.at + step));
    drag.y = event.clientY;
    drag.moved = true;
    put(drag.at);
  });
  const let_go = () => {
    if (!drag) return;
    element.classList.remove('turning');
    if (drag.moved) ctx.commit(path);
    drag = null;
  };
  element.addEventListener('pointerup', let_go);
  element.addEventListener('pointercancel', let_go);
  element.addEventListener('dblclick', (event) => {
    if (event.target.closest('.knob-value')) return;
    ctx.set(path, param.def);
    show();
    ctx.commit(path);
  });
  let wheeling = 0;
  element.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      put(positionOf(param, ctx.get(path)) - event.deltaY * (event.shiftKey ? 0.0001 : 0.0008));
      clearTimeout(wheeling);
      wheeling = setTimeout(() => ctx.commit(path), 400);
    },
    { passive: false }
  );
  element.addEventListener('keydown', (event) => {
    const way = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[event.key];
    if (!way || event.target.closest('input')) return;
    event.preventDefault();
    if (param.step) ctx.set(path, Math.min(param.max, Math.max(param.min, ctx.get(path) + way * param.step)));
    else put(positionOf(param, ctx.get(path)) + way * (event.shiftKey ? 0.002 : 0.02));
    show();
    ctx.commit(path);
  });
  // Clicking the value: type one
  text.addEventListener('click', () => {
    if (text.querySelector('input')) return;
    const input = h('input', { type: 'text', value: format(param, ctx.get(path)), spellcheck: false });
    text.textContent = '';
    text.append(input);
    input.select();
    const done = (keep) => {
      if (!input.isConnected) return;
      const typed = keep ? parse(param, input.value) : null;
      input.remove();
      if (typed !== null && !Number.isNaN(typed)) {
        ctx.set(path, valueOf(param, positionOf(param, Math.min(param.max, Math.max(param.min, typed)))));
        ctx.commit(path);
      }
      show();
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') done(true);
      if (event.key === 'Escape') done(false);
    });
    input.addEventListener('blur', () => done(true));
  });
  element.addEventListener('contextmenu', (event) => {
    if (!ctx.menu) return;
    event.preventDefault();
    ctx.menu(path, event);
  });
  show();
  return element;
}

const waveShapes = {
  sine: 'M1 6 C 5 -2, 8 -2, 12 6 S 19 14, 23 6',
  triangle: 'M1 6 L6.5 1.5 L17.5 10.5 L23 6',
  sawtooth: 'M1 10.5 L12 1.5 L12 10.5 L23 1.5',
  square: 'M1 10.5 L1 1.5 L12 1.5 L12 10.5 L23 10.5 L23 1.5',
  random: 'M1 8 H5 V3 H9 V10 H13 V5 H17 V9 H21 V2 H23',
};

// A few choices, side by side (waves are drawn rather than named)
export function choice(path, ctx, { label } = {}) {
  const param = params[path];
  const element = h('div.choice', { title: param.tip ?? '' });
  element.dataset.path = path;
  const buttons = h('div.choice-buttons', { role: 'group' });
  for (const option of param.options) {
    const button = h('button', { type: 'button', title: option });
    if (waveShapes[option]) button.innerHTML = svg(`<path d="${waveShapes[option]}"/>`, '0 0 24 12');
    else button.textContent = option;
    button.addEventListener('click', () => {
      ctx.set(path, option);
      show();
      ctx.commit(path);
    });
    buttons.append(button);
  }
  const show = () => [...buttons.children].forEach((button, n) => button.setAttribute('aria-pressed', String(param.options[n] === ctx.get(path))));
  element.show = show;
  element.append(buttons, h('span.knob-label', {}, label ?? param.label));
  show();
  return element;
}

// A choice from a longer list
export function dropdown(path, ctx, { label } = {}) {
  const param = params[path];
  const select = h('select', { title: param.tip ?? '' });
  for (const option of param.options) select.append(new Option(option, option));
  select.value = ctx.get(path);
  select.addEventListener('change', () => {
    ctx.set(path, select.value);
    ctx.commit(path);
    select.blur(); // So the computer's keys play notes again
  });
  const element = h('label.dropdown', {}, select, h('span.knob-label', {}, label ?? param.label));
  element.show = () => (select.value = ctx.get(path));
  return element;
}

export function toggle(path, ctx, { label } = {}) {
  const param = params[path];
  const button = h('button.toggle', { type: 'button', title: param.tip ?? '' }, label ?? param.label);
  const show = () => button.setAttribute('aria-pressed', String(!!ctx.get(path)));
  button.addEventListener('click', () => {
    ctx.set(path, !ctx.get(path));
    show();
    ctx.commit(path);
  });
  button.show = show;
  show();
  return button;
}

// A menu that opens beside `anchor` (an element, or a mouse event) and closes when something's picked or it's clicked
// away from. Items: { label, action, hint, checked, danger } or { heading } or '-' for a line.
let openMenu = null;
export function closeMenu() {
  openMenu?.remove();
  openMenu = null;
}
export function menu(anchor, items) {
  closeMenu();
  const list = h('div.menu', { role: 'menu' });
  for (const item of items) {
    if (!item) continue;
    if (item === '-') list.append(h('hr'));
    else if (item.heading) list.append(h('div.menu-heading', {}, item.heading));
    else {
      list.append(
        h(
          `button.menu-item${item.danger ? '.danger' : ''}${item.checked ? '.checked' : ''}`,
          {
            type: 'button',
            role: 'menuitem',
            title: item.hint ?? '',
            disabled: !!item.disabled,
            onclick: () => {
              closeMenu();
              item.action?.();
            },
          },
          item.label
        )
      );
    }
  }
  place(list, anchor);
  openMenu = list;
  return list;
}

// A small panel that opens beside `anchor`, for a few settings
export function popover(anchor, ...content) {
  closeMenu();
  const panel = h('div.menu.popover', {}, ...content);
  place(panel, anchor);
  openMenu = panel;
  return panel;
}

function place(panel, anchor) {
  document.body.append(panel);
  const box = anchor instanceof Element ? anchor.getBoundingClientRect() : { left: anchor.clientX, right: anchor.clientX, top: anchor.clientY, bottom: anchor.clientY };
  const { width, height } = panel.getBoundingClientRect();
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, box.left));
  const below = box.bottom + 4;
  const top = below + height > window.innerHeight - 8 ? Math.max(8, box.top - height - 4) : below;
  Object.assign(panel.style, { left: left + 'px', top: top + 'px' });
}

window.addEventListener('pointerdown', (event) => openMenu && !openMenu.contains(event.target) && closeMenu(), true);
window.addEventListener('keydown', (event) => event.key === 'Escape' && closeMenu());
// (Clicking into the scene takes the window's attention away, which closes it too)
window.addEventListener('blur', () => openMenu && !openMenu.contains(document.activeElement) && closeMenu());
