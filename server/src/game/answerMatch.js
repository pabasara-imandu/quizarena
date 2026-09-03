/**
 * Short-answer (free text) matching.
 *
 * Two modes, both deliberately simple and explainable to a teacher:
 *  - `caseSensitive: false` (default) - compare lowercased.
 *  - `caseSensitive: true`            - compare exactly.
 *
 * In both modes we normalise Unicode (NFKC) and collapse runs of whitespace,
 * because "  Paris " and "Paris" are the same answer to every human in the
 * room and a student should never lose a mark to a stray space.
 */
export function normalizeAnswer(raw, { caseSensitive = false } = {}) {
  let out = String(raw ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
  if (!caseSensitive) out = out.toLowerCase();
  return out;
}

/** True when `raw` matches any of the accepted answers under the given mode. */
export function matchesShortAnswer(raw, acceptedAnswers, { caseSensitive = false } = {}) {
  const candidate = normalizeAnswer(raw, { caseSensitive });
  if (!candidate) return false;
  return acceptedAnswers.some((a) => normalizeAnswer(a, { caseSensitive }) === candidate);
}

/**
 * Group free-text responses for the host's distribution view. Buckets are
 * keyed by the normalised form but display the first spelling that arrived,
 * so the teacher sees "Paris" rather than "paris".
 */
export function groupShortAnswers(records) {
  const buckets = new Map();
  for (const r of records) {
    if (r.skipped || r.text == null) continue;
    const key = normalizeAnswer(r.text);
    const existing = buckets.get(key);
    if (existing) existing.count++;
    else buckets.set(key, { key, display: String(r.text).trim(), count: 1, correct: !!r.correct });
  }
  return [...buckets.values()].sort((a, b) => b.count - a.count);
}
