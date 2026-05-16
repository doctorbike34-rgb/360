import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const port = Number(process.env.PORT || 8080);
const distDir = resolve('dist');

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function getFilePath(url = '/') {
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const requestedPath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(distDir, requestedPath);

  if (!filePath.startsWith(distDir)) {
    return join(distDir, 'index.html');
  }

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    return filePath;
  }

  return join(distDir, 'index.html');
}

createServer((req, res) => {
  const filePath = getFilePath(req.url);
  const contentType = contentTypes[extname(filePath)] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
  });

  createReadStream(filePath).pipe(res);
}).listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
});
