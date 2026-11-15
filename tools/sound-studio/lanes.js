// What's happening in the scene, as it happens: a lane for each event, with a mark each time it does, moving off to
// the left over the last twenty seconds, and a lane for each signal, drawn as a line. Clicking an event's name makes
// it happen by hand (its sounds play, and anything tied to it changes), so a sound can be tried without waiting.
//
//   const lanes = makeLanes(holder, { fire(id), coloursFor(id) -> [css colours of the tracks tied to it] });
//   lanes.set([{ heading }, { id, label, kind: 'event' | 'signal', quiet }, ...]);
//   lanes.hit(id); lanes.level(id, value); lanes.clear();

import { h } from './controls.js';

const rowHeight = 20;
const seconds = 20; // How far back the lanes go

export function makeLanes(holder, { fire, coloursFor }) {
  const names = h('div.lane-names');
  const canvas = h('canvas.lane-marks');
  const inner = h('div.lanes-inner', {}, names, canvas);
  holder.append(inner);
  const context = canvas.getContext('2d');
  let rows = [];
  const hits = new Map(); // event id -> [times]
  const traces = new Map(); // signal id -> [[time, value]]
  const flashes = new Map(); // id -> its name's element

  function set(next) {
    rows = next;
    names.innerHTML = '';
    flashes.clear();
    for (const row of rows) {
      if (row.heading) {
        names.append(h('div.lane-heading', {}, row.heading));
        continue;
      }
      const dots = h('span.lane-dots');
      for (const colour of coloursFor(row) ?? []) dots.append(h('i', { style: { background: colour } }));
      const name =
        row.kind === 'event'
          ? h('button.lane-name', { type: 'button', title: `Make it happen now: “${row.label}” (${row.id})`, onclick: () => fire(row.id) }, h('span.lane-go', {}, '▸'), h('span.lane-label', {}, row.label), dots)
          : h('div.lane-name.signal', { title: `${row.label} (${row.id}): something that keeps moving, which a setting can follow` }, h('span.lane-go', {}, '∿'), h('span.lane-label', {}, row.label), dots);
      if (row.quiet) name.classList.add('quiet');
      flashes.set(row.id, name);
      names.append(name);
    }
    size();
  }

  function size() {
    const width = Math.max(50, inner.clientWidth - names.offsetWidth);
    const height = rows.length * rowHeight;
    const sharp = window.devicePixelRatio || 1;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.width = Math.round(width * sharp);
    canvas.height = Math.round(height * sharp);
    context.setTransform(sharp, 0, 0, sharp, 0, 0);
  }
  new ResizeObserver(size).observe(holder);

  function draw() {
    requestAnimationFrame(draw);
    if (!holder.offsetParent) return; // (Folded away)
    const now = performance.now() / 1000;
    const width = canvas.clientWidth;
    const x = (time) => width - ((now - time) / seconds) * width;
    context.clearRect(0, 0, width, rows.length * rowHeight);
    rows.forEach((row, n) => {
      if (row.heading) return;
      const top = n * rowHeight;
      context.fillStyle = 'rgba(255,255,255,0.035)';
      context.fillRect(0, top + 2, width, rowHeight - 4);
      const colour = (coloursFor(row) ?? [])[0] ?? '#8b8d93';
      if (row.kind === 'event') {
        const times = hits.get(row.id);
        if (!times) return;
        while (times.length && now - times[0] > seconds) times.shift();
        for (const time of times) {
          const age = now - time;
          context.fillStyle = colour;
          context.globalAlpha = Math.max(0.25, 1 - age / seconds);
          const wide = age < 0.25 ? 2 + (1 - age / 0.25) * 4 : 2; // Fat as it lands, then thin
          context.fillRect(x(time) - wide, top + 3, wide, rowHeight - 6);
        }
        context.globalAlpha = 1;
      } else {
        const trace = traces.get(row.id);
        if (!trace?.length) return;
        while (trace.length > 2 && now - trace[1][0] > seconds) trace.shift();
        context.beginPath();
        const y = (value) => top + rowHeight - 3 - value * (rowHeight - 6);
        context.moveTo(Math.max(0, x(trace[0][0])), y(trace[0][1]));
        for (const [time, value] of trace) context.lineTo(x(time), y(value));
        const [, latest] = trace[trace.length - 1];
        context.lineTo(width, y(latest));
        context.strokeStyle = colour;
        context.lineWidth = 1.5;
        context.stroke();
      }
    });
  }
  requestAnimationFrame(draw);

  return {
    set,
    hit(id) {
      if (!hits.has(id)) hits.set(id, []);
      hits.get(id).push(performance.now() / 1000);
      const name = flashes.get(id);
      if (name) {
        name.classList.remove('hit');
        void name.offsetWidth; // (So the flash starts again)
        name.classList.add('hit');
      }
    },
    level(id, value) {
      if (!traces.has(id)) traces.set(id, []);
      const trace = traces.get(id);
      const now = performance.now() / 1000;
      if (trace.length) trace.push([now, trace[trace.length - 1][1]]); // (It stayed where it was until now)
      trace.push([now, value]);
      if (trace.length > 4000) trace.splice(0, 2000);
    },
    clear() {
      hits.clear();
      traces.clear();
    },
    has: (id) => flashes.has(id),
  };
}
