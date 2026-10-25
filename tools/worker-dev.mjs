/* tools/worker-dev.mjs — the site as Cloudflare serves it on one of Session
 * Buddies' own addresses, on this computer: worker/index.js runs for the
 * paths wrangler.jsonc gives it (run_worker_first), every other request is
 * a file, with Cloudflare's handling of folders (/x → /x/, /x/index.html →
 * /x/) and a 404 for anything missing. serve.py is still the server for
 * everyday work; this is for checking the Worker before it goes live.
 *
 *   node tools/worker-dev.mjs 8779                     as sessionbuddies.shedworks.app
 *   node tools/worker-dev.mjs 8779 bodhran.russellmagnuson.workers.dev
 *   node tools/worker-dev.mjs 8779 --no-worker         files only, as before 1.26.0
 *
 * Nothing is cached (no-store, as serve.py), except what the Worker itself
 * says. Its forwards to https://<address>/... come back as this server's.
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const port = Number(args.find(a => /^\d+$/.test(a))) || 8779;
const noWorker = args.includes('--no-worker');
const host = args.find(a => /[a-z]\.[a-z]/.test(a)) || 'sessionbuddies.shedworks.app';
const worker = noWorker ? null : (await import(path.join(root, 'worker/index.js'))).default;
const conf = JSON.parse((await readFile(path.join(root, 'wrangler.jsonc'), 'utf8')).replace(/^\s*\/\/.*$/gm, ''));
const workerFirst = noWorker ? [] : conf.assets.run_worker_first;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.m4a': 'audio/mp4',
  '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8'
};

/* A file, as Cloudflare's assets serve it (html_handling: auto-trailing-slash). */
async function asset(request) {
  const url = new URL(request.url);
  const p = decodeURIComponent(url.pathname);
  // Every file is served, as serve.py does (so the checks can read worker/
  // and .assetsignore); what .assetsignore keeps off the live site is not.
  if (p.split('/').includes('..')) return new Response('Not found', { status: 404 });
  const moved = to => { const u = new URL(url); u.pathname = to; return new Response(null, { status: 307, headers: { Location: u.href } }); };
  if (p.endsWith('/index.html')) return moved(p.slice(0, -'index.html'.length));
  let file = path.join(root, p);
  try {
    let st = await stat(file);
    if (st.isDirectory()) {
      if (!p.endsWith('/')) return moved(p + '/');
      file = path.join(file, 'index.html');
      st = await stat(file);
    }
    const body = request.method === 'HEAD' ? null : await readFile(file);
    return new Response(body, { headers: { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' } });
  } catch (e) {
    return new Response('Not found', { status: 404 });
  }
}

const env = { ASSETS: { fetch: req => asset(req) } };

http.createServer(async (req, res) => {
  try {
    const here = `http://${req.headers.host}`;
    const request = new Request(`https://${host}${req.url}`, { method: req.method, headers: { accept: req.headers.accept || '*/*' } });
    const p = new URL(request.url).pathname;
    const response = workerFirst.includes(p) ? await worker.fetch(request, env) : await asset(request);
    const headers = Object.fromEntries(response.headers);
    if (headers.location) headers.location = headers.location.replace(`https://${host}`, here);
    res.writeHead(response.status, headers);
    res.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Dev server error: ' + e.message);
  }
}).listen(port, () => {
  console.log(`Serving on http://localhost:${port} as ${host}${noWorker ? ' (files only)' : ''}  (Ctrl+C to stop)`);
});
