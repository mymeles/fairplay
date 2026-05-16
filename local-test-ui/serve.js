// Tiny static server for the FairPlay test UI. Runs on :3001 because that's
// the URL registered with Spotify's OAuth flow via the Edge Function's
// WEB_AUTH_COMPLETE_URL secret.
//
//   node local-test-ui/serve.js
//
// Routes:
//   /              → host.html (the most useful starting point)
//   /host          → host.html
//   /guest         → guest.html
//   /guest?code=…  → guest.html with the join code prefilled
//   /auth/complete → 302 to /host preserving ?token=&user_id=

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT ?? 3001);
const ROOT = __dirname;

const serveFile = (res, file, type = 'text/html; charset=utf-8') => {
  res.writeHead(200, { 'content-type': type });
  fs.createReadStream(path.join(ROOT, file)).pipe(res);
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  if (p === '/auth/complete') {
    res.writeHead(302, { Location: '/host' + url.search });
    return res.end();
  }
  if (p === '/' || p === '/host') return serveFile(res, 'host.html');
  if (p === '/guest') return serveFile(res, 'guest.html');
  if (p === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`FairPlay test UI ready:`);
  console.log(`  Host  → http://localhost:${PORT}/host`);
  console.log(`  Guest → http://localhost:${PORT}/guest`);
});
