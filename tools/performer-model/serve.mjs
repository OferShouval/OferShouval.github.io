import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
// Serves the whole site (for its node_modules and src/), saving what's posted to this folder's out/
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST') {
    const name = path.basename(url.searchParams.get('name'));
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => { fs.writeFileSync(path.join(here, 'out', name), Buffer.concat(chunks)); res.end('ok'); });
    return;
  }
  const file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(5288);
