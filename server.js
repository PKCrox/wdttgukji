// wdttgukji dev server — localhost:3001

import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = 3001;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const server = createServer(async (req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/public/index.html';
  else if (!url.includes('.')) url = '/public' + url + '.html';
  else if (url.startsWith('/js/') || url.startsWith('/css/')) url = '/public' + url;

  // 그대로 매핑: /engine/*, /data/*, /public/* → 루트에서 서빙
  const filePath = join(__dirname, url);

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error('not file');

    const ext = extname(filePath);
    const content = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found: ' + url);
  }
});

server.listen(PORT, () => {
  console.log(`\n  왜 다 턴 가지구 — http://localhost:${PORT}\n`);
});
