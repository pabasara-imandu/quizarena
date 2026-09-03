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

export const config = {
  port: Number(process.env.PORT || 4000),
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
