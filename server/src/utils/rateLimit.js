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
  // U+200C (zero-width non-joiner) and U+200D (zero-width joiner) are NOT
  // stripped: they are letters in all but name for Sinhala, Tamil and other
  // Indic scripts - ශ්‍රී (as in Sri Lanka) cannot be
  // written without the joiner. Only the true spoofing characters go: the
  // zero-width space and the bidi marks.
  return (
    cp < 0x20 ||
    cp === 0x7f ||
    cp === 0x200b ||
    cp === 0x200e ||
    cp === 0x200f ||
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

/**
 * Split into what a reader sees as letters.
 *
 * A Sinhala or Tamil letter is often several code units - a consonant, a
 * vowel sign, a joiner - and cutting between them leaves a broken glyph on
 * the leaderboard. Lengths here are counted and cut in graphemes, so "18
 * letters" means eighteen things a person would count.
 */
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

export function graphemes(text) {
  if (segmenter) return [...segmenter.segment(text)].map((s) => s.segment);
  return [...text];
}

export function sanitizeNickname(raw, maxLength = 24) {
  if (typeof raw !== 'string') return null;
  const cleaned = stripInvisible(raw)
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const letters = graphemes(cleaned);
  const cut = letters.slice(0, maxLength).join('').trim();
  return graphemes(cut).length >= 2 ? cut : null;
}

export function sanitizeText(raw, maxLength = 300) {
  if (typeof raw !== 'string') return '';
  return stripInvisible(raw).trim().slice(0, maxLength);
}
