// Dev helper: serves dist/ on loopback with Cloudflare-like clean URLs, for captures and measurements.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain', '.ico': 'image/x-icon',
};

export function serveDist(port = 4322, root = resolve('dist')) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
    let file = join(root, path);
    if (file !== root && !file.startsWith(root + sep)) return res.writeHead(403).end();
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    } catch {
      /* falls through to the read */
    }
    try {
      let body = await readFile(file);
      const headers = { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' };
      // Text goes out compressed, as Cloudflare would send it (it uses Brotli, slightly smaller).
      if (/\.(html|js|css|svg|json|xml|txt)$/.test(file) && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
        body = gzipSync(body, { level: 9 });
        headers['Content-Encoding'] = 'gzip';
      }
      res.writeHead(200, headers);
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  // Closing also drops idle keep-alive sockets, so scripts exit as soon as they finish.
  const close = server.close.bind(server);
  server.close = (cb) => {
    server.closeAllConnections();
    return close(cb);
  };
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}
