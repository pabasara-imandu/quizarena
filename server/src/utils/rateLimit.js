/**
 * Tiny per-socket token bucket. A misbehaving client spamming `player:answer`
 * must not be able to hog the event loop for the other 99 people in the room.
 */
export function createBucket({ capacity = 20, refillPerSec = 10 } = {}) {
  let tokens = capacity;
  let last = Date.now();
  return function take(cost = 1) {
    const now = Date.now();
    tokens = Math.min(capacity, tokens + ((now - last) / 1000) * refillPerSec);
    last = now;
    if (tokens < cost) return false;
    tokens -= cost;
    return true;
  };
}

/**
 * Control chars, zero-width joiners and bidi overrides are invisible in a
 * leaderboard but perfect for impersonating another player's nickname, so
 * they get stripped before a name is ever stored or rendered.
 */
function isInvisible(cp) {
  return (
    cp < 0x20 ||
    cp === 0x7f ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    cp === 0x2060 ||
    cp === 0xfeff
  );
}

function stripInvisible(input) {
  let out = '';
  for (const ch of input) {
    if (!isInvisible(ch.codePointAt(0))) out += ch;
  }
  return out;
}

export function sanitizeNickname(raw, maxLength = 18) {
  if (typeof raw !== 'string') return null;
  const cleaned = stripInvisible(raw)
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
  return cleaned.length >= 2 ? cleaned : null;
}

export function sanitizeText(raw, maxLength = 300) {
  if (typeof raw !== 'string') return '';
  return stripInvisible(raw).trim().slice(0, maxLength);
}
