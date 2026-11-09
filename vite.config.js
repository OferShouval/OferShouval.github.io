import { defineConfig } from 'vite';
import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = import.meta.dirname;
const partialsDir = resolve(root, 'src/partials');
const includePattern = /<!--\s*@include\s+(\S+)\s*-->/g;
// tools/ holds build-only helpers (like the performer model's builder). teaching/ is left out of the site for now: it still runs in `npm run dev`, but isn't built or published.
const ignoredDirs = ['node_modules', 'dist', 'archive', 'src', 'public', '.git', 'teaching', 'tools'];

// Replaces <!-- @include name.html --> with the contents of src/partials/name.html (recursively).
function includePartials(html) {
  return html.replace(includePattern, (_, file) =>
    includePartials(readFileSync(resolve(partialsDir, file), 'utf-8'))
  );
}

// Marks the navbar link for the page's top-level section (e.g. /art/ for art/luminin.html), which each link names.
function markCurrentSection(html, filename) {
  const [first, ...rest] = relative(root, filename).split('/');
  const section = rest.length ? `/${first}/` : '/';
  return html.replace(`data-section="${section}"`, `data-section="${section}" aria-current="page"`);
}

function htmlPartials() {
  return {
    name: 'html-partials',
    transformIndexHtml: {
      order: 'pre',
      handler: (html, ctx) => markCurrentSection(includePartials(html), ctx.filename),
    },
    handleHotUpdate({ file, server }) {
      if (file.startsWith(partialsDir)) {
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
}

// Every .html file outside the ignored folders is a page, so new pages need no config changes.
function findPages() {
  return readdirSync(root, { recursive: true })
    .filter((file) => file.endsWith('.html') && !ignoredDirs.includes(file.split('/')[0]))
    .map((file) => resolve(root, file));
}

export default defineConfig({
  plugins: [htmlPartials()],
  // Pre-bundle p5 at startup from the real pages only (not dist/ or archive/), so the dev server
  // never discovers it mid-session and serves pages a stale copy ("504 Outdated Optimize Dep").
  optimizeDeps: {
    entries: findPages(),
    include: ['p5'],
  },
  build: {
    // p5 alone is ~1 MB minified and can't be split further.
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      input: findPages(),
    },
  },
});
