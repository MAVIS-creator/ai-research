/**
 * Local test target for end-to-end incident lifecycle validation.
 * Modes (controlled via simple HTTP control endpoint):
 *   GET /control?mode=ok     -> always 200
 *   GET /control?mode=fail   -> always 500
 *   GET /target              -> the monitored endpoint
 */
import http from 'node:http';

let mode = 'ok';
const state = { requestsServed: 0 };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/control') {
    mode = url.searchParams.get('mode') ?? 'ok';
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ mode }));
  }
  if (url.pathname === '/state') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ mode, requestsServed: state.requestsServed }));
  }
  state.requestsServed += 1;
  if (mode === 'fail') {
    res.writeHead(500, { 'content-type': 'text/plain' });
    return res.end('simulated internal server error');
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', ts: new Date().toISOString() }));
});

server.listen(4599, '127.0.0.1', () => {
  console.log('E2E test target on http://127.0.0.1:4599/target (control via /control?mode=ok|fail)');
});
