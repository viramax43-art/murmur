// Minimal zero-dependency static server for MURMUR.
// Usage: npm start   ->  http://localhost:5173
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(process.cwd());
const PORT = Number(process.env.PORT || 5173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const clean = normalize(decoded).replace(/^([/\\])+/, '');
  const full = join(ROOT, clean);
  if (!full.startsWith(ROOT + sep) && full !== ROOT) return null;
  return full;
}

const server = http.createServer(async (req, res) => {
  try {
    let target = safePath(req.url || '/');
    if (!target) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(target).catch(() => null);
    if (info?.isDirectory()) target = join(target, 'index.html');
    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 - not found');
  }
});

server.listen(PORT, () => {
  console.log(`\n  MURMUR dev server running:  http://localhost:${PORT}\n`);
});
