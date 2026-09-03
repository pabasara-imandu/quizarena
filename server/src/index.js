import http from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';

import { config } from './config.js';
import { api } from './routes/api.js';
import { registerSocketHandlers } from './sockets/index.js';

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(compression());
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '256kb' }));
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));
app.use('/api', api);

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: config.clientOrigin, credentials: true },

  // WebSocket first. Long-polling stays available as a fallback for locked-down
  // school networks, but we do not want 100 clients starting on HTTP polling
  // and then upgrading - that is 100 wasted handshakes at the worst moment.
  transports: ['websocket', 'polling'],

  // A phone that locks its screen mid-question should come back to the same
  // game, so give reconnects a generous window before we call it a disconnect.
  pingInterval: 20_000,
  pingTimeout: 25_000,

  // Answer payloads are tiny; permessage-deflate costs more CPU than it saves
  // and adds latency to the one message that has to be fast.
  perMessageDeflate: false,
  maxHttpBufferSize: 1e5,
});

/**
 * Optional Redis adapter. With it, several Node processes can serve the same
 * room; without it a single process comfortably handles a few hundred players
 * per room. Rooms live in process memory either way, so put sticky sessions on
 * the PIN if you scale out.
 */
if (config.redisUrl) {
  try {
    const [{ createAdapter }, { createClient }] = await Promise.all([
      import('@socket.io/redis-adapter'),
      import('redis'),
    ]);
    const pubClient = createClient({ url: config.redisUrl });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('[quiz] Redis adapter attached');
  } catch (err) {
    console.warn('[quiz] Redis adapter unavailable, running single-node:', err.message);
  }
}

registerSocketHandlers(io);

// Bind all interfaces: inside a container, localhost is unreachable from
// outside it.
server.listen(config.port, '0.0.0.0', () => {
  console.log('[quiz] server listening on port ' + config.port);
  console.log(
    '[quiz] accepting browser origins: ' +
      (config.originIsWildcard ? 'ANY (*)' : config.clientOrigin.join(', '))
  );
  if (config.originIsWildcard && process.env.NODE_ENV === 'production') {
    console.warn(
      '[quiz] WARNING: CLIENT_ORIGIN=* in production. Any website can open ' +
        'sockets against your rooms. Set it to your real site origin.'
    );
  }
});

function shutdown(signal) {
  console.log('[quiz] ' + signal + ' received, closing down');
  io.close(() => server.close(() => process.exit(0)));
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
