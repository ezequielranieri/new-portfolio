import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const PORT = Number(process.env.PORT || 4324);
const ROOT = join(process.cwd(), '.vercel/output/static');

const mimeTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain' };

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

// Emulate the hosting layer: a matched file is 200, a directory-like URL
// resolves to that directory's index.html, and every unmatched URL is answered
// with the root 404 document and status 404.
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(req.url.split('?')[0]);
  const candidates = pathname.endsWith('/') ? [`${pathname}index.html`] : [pathname, `${pathname}/index.html`];
  for (const candidate of candidates) {
    try {
      const filePath = join(ROOT, candidate);
      const data = readFileSync(filePath);
      send(res, 200, data, mimeTypes[extname(filePath)] || 'application/octet-stream');
      return;
    } catch (e) {
      // Candidate does not exist, try the next one
    }
  }
  try {
    send(res, 404, readFileSync(join(ROOT, '404.html')), 'text/html');
  } catch (e) {
    send(res, 404, 'Not found', 'text/plain');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Preview server running on http://127.0.0.1:${PORT}`);
});
