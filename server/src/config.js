import 'dotenv/config';

/**
 * Which browser origins may talk to this server.
 *
 * `*` disables the check entirely - handy for a throwaway demo, dangerous for a
 * real class, so it is opt-in and warned about at boot rather than a default.
 */
function parseOrigins(raw) {
  const value = (raw || 'http://localhost:3000').trim();
  if (value === '*') return true; // Socket.IO/cors accept `true` as "reflect any origin"
  return value
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * Which shard this process is.
 *
 * The fleet is several independent free instances, not a cluster: a room lives
 * entirely in one process's memory, so the unit that gets spread across servers
 * is a whole quiz session, never the students inside one. The index makes each
 * server mint PINs in its own range, which is what lets any client work out
 * where a room lives from the PIN alone, with nothing shared between them.
 */
const serverIndex = Math.min(8, Math.max(0, Math.round(Number(process.env.SERVER_INDEX || 0)) || 0));

export const config = {
  port: Number(process.env.PORT || 4000),
  serverIndex,
  serverLabel: (process.env.SERVER_LABEL || 'server-' + (serverIndex + 1)).trim(),
  /**
   * What this instance will admit to carrying before the fleet routes new rooms
   * elsewhere. Not a hard limit - an in-progress quiz is never turned away -
   * just the number the load balancer aims to stay under.
   */
  softCapacity: Number(process.env.SOFT_CAPACITY || 120),
  adminToken: (process.env.ADMIN_TOKEN || '').trim(),
  clientOrigin: parseOrigins(process.env.CLIENT_ORIGIN),
  originIsWildcard: (process.env.CLIENT_ORIGIN || '').trim() === '*',
  redisUrl: process.env.REDIS_URL || null,
  answerGraceMs: Number(process.env.ANSWER_GRACE_MS || 1200),
  roomTtlMs: Number(process.env.ROOM_TTL_MS || 2 * 60 * 60 * 1000),
  // Countdown shown before the first question / between questions
  questionLeadInMs: 3000,
  maxPlayersPerRoom: Number(process.env.MAX_PLAYERS || 500),
  maxNicknameLength: 18,
};
