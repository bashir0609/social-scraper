import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { handler as scrapeHandler } from '../lib/scrape-core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const port = Number(process.env.PORT || 8888);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function serveStatic(req, res) {
  const requestPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.normalize(path.join(publicDir, requestPath));

  if (!filePath.startsWith(publicDir)) {
    send(res, 403, 'Forbidden', { 'content-type': 'text/plain; charset=utf-8' });
    return;
  }

  try {
    const data = await readFile(filePath);
    send(res, 200, data, { 'content-type': getMimeType(filePath) });
  } catch {
    const indexPath = path.join(publicDir, 'index.html');
    const data = await readFile(indexPath);
    send(res, 200, data, { 'content-type': 'text/html; charset=utf-8' });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/api/scrape') {
      const body = await readRequestBody(req);
      const result = await scrapeHandler({
        httpMethod: req.method || 'GET',
        body,
      });

      const headers = result?.headers || {};
      send(res, Number(result?.statusCode || 200), result?.body || '', headers);
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    send(
      res,
      500,
      JSON.stringify({ error: error.message || 'Unexpected error' }),
      { 'content-type': 'application/json; charset=utf-8' },
    );
  }
});

server.listen(port, () => {
  console.log(`Local dev server running at http://localhost:${port}`);
});
