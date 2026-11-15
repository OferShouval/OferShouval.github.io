// The sound studio's way into the project, while `npm run dev` runs (never in the build). It lists the sounds in
// public/sounds, the saved soundscapes (src/sounds/soundscapes/<section>.json), the presets Ofer's saved
// (src/sounds/presets/<kind>/<name>.json) and each section's pages; saves soundscapes and presets as they change;
// and saves sounds dropped on the studio into the section's folder in public/sounds, so they're at an address the
// site can play.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { sections, sectionOf } from './catalogue.js';

const audioTypes = ['.wav', '.mp3', '.m4a', '.aif', '.aiff', '.ogg', '.flac', '.webm'];
const unix = (path) => path.split('\\').join('/');

function readBody(request) {
  return new Promise((done, failed) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => done(Buffer.concat(chunks)));
    request.on('error', failed);
  });
}

function reply(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(body));
}

// Lowercase letters, digits and dashes only, so a name can't reach outside its folder
const slug = (name) =>
  String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

export function soundStudio(root) {
  const soundsDir = resolve(root, 'public/sounds');
  const scapesDir = resolve(root, 'src/sounds/soundscapes');
  const presetsDir = resolve(root, 'src/sounds/presets');

  // A section's pages: every page in its folder (leaving out the ones that only send you elsewhere), its front page first
  function pagesOf(section) {
    if (!section.folder) return [];
    const folder = resolve(root, section.folder);
    if (!existsSync(folder)) return [];
    return readdirSync(folder, { recursive: true })
      .map(unix)
      .filter((file) => file.endsWith('.html'))
      .filter((file) => !readFileSync(join(folder, file), 'utf-8').includes('http-equiv="refresh"'))
      .map((file) => `/${section.folder}/${file}`.replace(/index\.html$/, ''))
      .sort((a, b) => (a.endsWith('/') ? -1 : b.endsWith('/') ? 1 : a.localeCompare(b)));
  }

  function library() {
    const sounds = existsSync(soundsDir)
      ? readdirSync(soundsDir, { recursive: true })
          .map(unix)
          .filter((file) => audioTypes.includes(extname(file).toLowerCase()))
          .map((file) => '/sounds/' + file)
          .sort()
      : [];
    const soundscapes = {};
    for (const section of sections) {
      const saved = readJson(join(scapesDir, section.id + '.json'));
      if (saved) soundscapes[section.id] = saved;
    }
    const presets = [];
    for (const kind of ['synth', 'sampler']) {
      const folder = join(presetsDir, kind);
      if (!existsSync(folder)) continue;
      for (const file of readdirSync(folder).filter((name) => name.endsWith('.json')).sort()) {
        const preset = readJson(join(folder, file));
        if (preset) presets.push({ ...preset, kind, yours: true });
      }
    }
    const pages = Object.fromEntries(sections.map((section) => [section.id, pagesOf(section)]));
    return { sounds, soundscapes, presets, pages };
  }

  return {
    name: 'sound-studio',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__studio', async (request, response) => {
        try {
          const url = new URL(request.url, 'http://localhost');
          const asked = `${request.method} ${url.pathname}`;
          if (asked === 'GET /library') return reply(response, 200, library());
          if (asked === 'POST /soundscape') {
            const section = sectionOf(url.searchParams.get('section'));
            if (!section) return reply(response, 400, { error: 'No such section' });
            const soundscape = JSON.parse((await readBody(request)).toString('utf-8'));
            mkdirSync(scapesDir, { recursive: true });
            const file = join(scapesDir, section.id + '.json');
            writeFileSync(file, JSON.stringify(soundscape, null, 2) + '\n');
            return reply(response, 200, { file: unix(relative(root, file)) });
          }
          if (asked === 'POST /preset') {
            const kind = url.searchParams.get('kind');
            const name = slug(url.searchParams.get('name'));
            if (!['synth', 'sampler'].includes(kind) || !name) return reply(response, 400, { error: 'The preset needs a name' });
            const preset = JSON.parse((await readBody(request)).toString('utf-8'));
            mkdirSync(join(presetsDir, kind), { recursive: true });
            const file = join(presetsDir, kind, name + '.json');
            writeFileSync(file, JSON.stringify(preset, null, 2) + '\n');
            return reply(response, 200, { file: unix(relative(root, file)) });
          }
          if (asked === 'POST /sound') {
            const given = url.searchParams.get('name') ?? '';
            const section = sectionOf(url.searchParams.get('section'));
            const type = extname(given).toLowerCase();
            const name = slug(given.slice(0, given.length - type.length));
            if (!name || !audioTypes.includes(type)) return reply(response, 400, { error: 'Not a sound file: ' + given });
            if (!section) return reply(response, 400, { error: 'No such section' });
            const folder = join(soundsDir, section.sounds);
            mkdirSync(folder, { recursive: true });
            let file = join(folder, name + type);
            for (let n = 2; existsSync(file); n++) file = join(folder, `${name}-${n}${type}`); // Never over another sound
            writeFileSync(file, await readBody(request));
            return reply(response, 200, { src: '/sounds/' + unix(relative(soundsDir, file)) });
          }
          reply(response, 404, { error: 'No such thing' });
        } catch (error) {
          reply(response, 500, { error: String(error.message ?? error) });
        }
      });
    },
  };
}
