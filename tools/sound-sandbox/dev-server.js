// The sound sandbox's way into the project, while `npm run dev` runs (never in the build): it lists the site's
// sections (see sections.js) with their pages, the sounds in public/sounds and the patches in src/sounds/patches/<section>,
// saves patches there, and saves sounds dropped on it into the section's sound folder, so a saved patch's samples are
// at URLs the site can play. It also keeps each scene's tracks (which sound plays when, in the sandbox's scene), in
// src/sounds/scenes/<scene>.json.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { sections, sectionOf } from './sections.js';

const audioTypes = ['.wav', '.mp3', '.m4a', '.aif', '.aiff', '.ogg', '.flac', '.webm'];

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

const unix = (path) => path.split('\\').join('/');

export function soundSandbox(root) {
  const soundsDir = resolve(root, 'public/sounds');
  const patchesDir = resolve(root, 'src/sounds/patches');
  const scenesDir = resolve(root, 'src/sounds/scenes');

  // A section's pages: what it lists, or every page in its folder (leaving out the ones that only send you elsewhere)
  function pagesOf(section) {
    if (section.pages) return section.pages;
    const folder = resolve(root, section.folder);
    if (!existsSync(folder)) return [];
    return readdirSync(folder, { recursive: true })
      .filter((file) => file.endsWith('.html'))
      .filter((file) => !readFileSync(join(folder, file), 'utf-8').includes('http-equiv="refresh"'))
      .map((file) => `/${section.folder}/${unix(file)}`.replace(/index\.html$/, ''))
      .sort((a, b) => (a.endsWith('/') ? -1 : b.endsWith('/') ? 1 : a.localeCompare(b)));
  }

  function patchesIn(folder, section) {
    if (!existsSync(folder)) return [];
    return readdirSync(folder)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .flatMap((file) => {
        try {
          const patch = JSON.parse(readFileSync(join(folder, file), 'utf-8'));
          return [{ section, file: unix(relative(patchesDir, join(folder, file))), patch }];
        } catch {
          return [];
        }
      });
  }

  return {
    name: 'sound-sandbox',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__sandbox', async (request, response) => {
        try {
          const url = new URL(request.url, 'http://localhost');
          if (request.method === 'GET' && url.pathname === '/library') {
            const sounds = existsSync(soundsDir)
              ? readdirSync(soundsDir, { recursive: true })
                  .filter((file) => audioTypes.includes(extname(file).toLowerCase()))
                  .map((file) => '/sounds/' + unix(file))
                  .sort()
              : [];
            const patches = [
              ...sections.flatMap((section) => patchesIn(join(patchesDir, section.id), section.id)),
              ...patchesIn(patchesDir, 'shared'), // Any left loose in the patches folder
            ];
            const pages = Object.fromEntries(sections.map((section) => [section.id, pagesOf(section)]));
            const scenes = {};
            if (existsSync(scenesDir)) {
              for (const file of readdirSync(scenesDir).filter((f) => f.endsWith('.json'))) {
                try {
                  scenes[file.slice(0, -5)] = JSON.parse(readFileSync(join(scenesDir, file), 'utf-8'));
                } catch {}
              }
            }
            return reply(response, 200, { sounds, patches, pages, scenes });
          }
          if (request.method === 'POST' && url.pathname === '/scene') {
            const name = slug(url.searchParams.get('name'));
            if (!name) return reply(response, 400, { error: 'The scene needs a name' });
            const scene = JSON.parse((await readBody(request)).toString('utf-8'));
            mkdirSync(scenesDir, { recursive: true });
            const file = join(scenesDir, name + '.json');
            writeFileSync(file, JSON.stringify(scene, null, 2) + '\n');
            return reply(response, 200, { file: unix(relative(root, file)) });
          }
          if (request.method === 'POST' && url.pathname === '/patch') {
            const name = slug(url.searchParams.get('name'));
            const section = sectionOf(url.searchParams.get('section'));
            if (!name) return reply(response, 400, { error: 'The patch needs a name' });
            if (!section) return reply(response, 400, { error: 'No such section' });
            const patch = JSON.parse((await readBody(request)).toString('utf-8'));
            const folder = join(patchesDir, section.id);
            mkdirSync(folder, { recursive: true });
            const file = join(folder, name + '.json');
            writeFileSync(file, JSON.stringify(patch, null, 2) + '\n');
            return reply(response, 200, { file: unix(relative(root, file)), id: `${section.id}/${name}.json` });
          }
          if (request.method === 'POST' && url.pathname === '/sample') {
            const given = url.searchParams.get('name') ?? '';
            const section = sectionOf(url.searchParams.get('section'));
            const type = extname(given).toLowerCase();
            const name = slug(given.slice(0, given.length - type.length));
            if (!name || !audioTypes.includes(type)) return reply(response, 400, { error: 'Not a sound file: ' + given });
            if (!section) return reply(response, 400, { error: 'No such section' });
            const folder = join(soundsDir, section.soundFolders[0]);
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
