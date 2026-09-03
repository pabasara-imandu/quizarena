/**
 * Single-port production preview — the same shape as the Docker/Caddy deploy,
 * without needing Docker.
 *
 * It fronts the already-running client (:3000) and server (:4000) on one
 * origin, routing `/api` and `/socket.io` to the server and everything else to
 * the client — exactly what the Caddyfile does in production. Use it to check a
 * production build before you deploy, or to demo over a tunnel.
 *
 *   node scripts/preview-prod.mjs            # listens on :8080
 *   PORT=9000 node scripts/preview-prod.mjs
 *
 * This is a verification tool, not a production proxy. Put Caddy (or nginx, or
 * your platform's router) in front of a real deployment — they do TLS,
 * compression, timeouts and buffering properly.
 */
import http from 'node:http';
import net from 'node:net';

const PORT = Number(process.env.PORT || 8080);
const CLIENT = { host: '127.0.0.1', port: Number(process.env.CLIENT_PORT || 3000) };
const SERVER = { host: '127.0.0.1', port: Number(process.env.SERVER_PORT || 4000) };

/** Anything the quiz server owns; everything else is the Next.js app. */
const isServerPath = (url) => url.startsWith('/api') || url.startsWith('/socket.io');

const proxy = http.createServer((req, res) => {
  const target = isServerPath(req.url) ? SERVER : CLIENT;

  const upstream = http.request(
    {
      host: target.host,
      port: target.port,
      method: req.method,
      path: req.url,
      headers: {
        ...req.headers,
        host: target.host + ':' + target.port,
        // Tell the upstream what the browser actually asked for, the way a real
        // reverse proxy does.
        'x-forwarded-host': req.headers.host ?? '',
        'x-forwarded-proto': 'http',
      },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstream.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Upstream ' + target.port + ' unavailable: ' + err.message);
  });

  req.pipe(upstream);
});

/**
 * WebSocket upgrades. This is the half that most naive proxies get wrong, and
 * the half this app lives on — if it is broken, every client silently falls
 * back to long-polling and the room feels laggy for no visible reason.
 */
proxy.on('upgrade', (req, clientSocket, head) => {
  const target = isServerPath(req.url) ? SERVER : CLIENT;
  const upstream = net.connect(target.port, target.host, () => {
    const headers = Object.entries(req.headers)
      .map(([k, v]) => k + ': ' + (Array.isArray(v) ? v.join(', ') : v))
      .join('\r\n');

    upstream.write('GET ' + req.url + ' HTTP/1.1\r\n' + headers + '\r\n\r\n');
    if (head?.length) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });

  const bail = () => clientSocket.destroy();
  upstream.on('error', bail);
  clientSocket.on('error', () => upstream.destroy());
});

proxy.listen(PORT, '0.0.0.0', () => {
  console.log('QuizArena production preview on http://localhost:' + PORT);
  console.log('  /api, /socket.io  ->  :' + SERVER.port + '  (quiz server)');
  console.log('  everything else   ->  :' + CLIENT.port + '  (next.js)');
  console.log('\nStart both upstreams first:');
  console.log('  cd server && npm start');
  console.log('  cd client && npm run build && npm start');
});
