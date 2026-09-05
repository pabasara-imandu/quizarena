import type { Analytics } from '@/lib/types';

/**
 * Every finished quiz, kept on the teacher's own device.
 *
 * This exists because a real class's marks were lost. The results lived only in
 * the server's memory and in a React state tree: the room was swept minutes
 * after the students closed their tabs, the server-side export 404'd, and half
 * an hour of a school's work went with it.
 *
 * Results are now written here the moment a quiz ends and again after every
 * re-mark, so they survive a reload, a closed tab, a sleeping laptop and a dead
 * server. Nothing about downloading a gradebook should depend on a room still
 * being alive.
 */

const KEY = 'quizarena.results.v1';
/** Enough to cover a day of teaching without crowding a 5MB storage quota. */
const KEEP = 8;

export interface ArchivedResults {
  id: string;
  pin: string;
  quizTitle: string;
  finishedAt: number;
  playerCount: number;
  questionCount: number;
  /** Set once the host has hand-marked any short answers. */
  regraded?: boolean;
  data: Analytics;
}

function readAll(): ArchivedResults[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => r?.data?.matrix && typeof r.id === 'string');
  } catch {
    return [];
  }
}

function writeAll(entries: ArchivedResults[]): boolean {
  // Quota is the real failure mode here - a 30-question quiz for a big class is
  // a few hundred KB. Drop the oldest and try again rather than losing the one
  // that just finished, which is the one the teacher actually needs.
  let candidates = entries.slice(0, KEEP);
  while (candidates.length > 0) {
    try {
      localStorage.setItem(KEY, JSON.stringify(candidates));
      return true;
    } catch {
      candidates = candidates.slice(0, candidates.length - 1);
    }
  }
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage is unavailable entirely - private mode, or blocked */
  }
  return false;
}

/**
 * Store a finished quiz. Re-archiving the same room replaces its entry, so
 * re-marking updates the saved copy instead of piling up near-duplicates.
 */
export function archiveResults(data: Analytics, { regraded = false } = {}): ArchivedResults | null {
  if (!data?.matrix || !Array.isArray(data.players)) return null;

  const entry: ArchivedResults = {
    // The room PIN alone is not unique - PINs are recycled - so pair it with
    // the moment the room was created, which the analytics carries as its pin
    // plus finish time.
    id: data.pin + '-' + data.finishedAt,
    pin: data.pin,
    quizTitle: data.quizTitle,
    finishedAt: data.finishedAt,
    playerCount: data.playerCount,
    questionCount: data.questionCount,
    regraded,
    data,
  };

  const existing = readAll();
  const sameRoom = existing.findIndex((r) => r.pin === entry.pin && r.data.pin === entry.pin);
  const next = sameRoom >= 0 ? existing.filter((_, i) => i !== sameRoom) : existing;

  writeAll([entry, ...next].sort((a, b) => b.finishedAt - a.finishedAt));
  return entry;
}

/** Newest first. The heavy `data` is included - these are read locally. */
export function listArchived(): ArchivedResults[] {
  return readAll().sort((a, b) => b.finishedAt - a.finishedAt);
}

export function removeArchived(id: string): void {
  writeAll(readAll().filter((r) => r.id !== id));
}

/**
 * Validate something that claims to be a results payload.
 *
 * Used for the recovered-file route, where the JSON came off disk and could be
 * anything at all. Better a clear refusal than a half-rendered results screen.
 */
export function parseResultsFile(text: string): Analytics | null {
  try {
    const parsed = JSON.parse(text);
    const data = (parsed?.data ?? parsed) as Analytics;
    if (!data || typeof data !== 'object') return null;
    if (!Array.isArray(data.players) || !Array.isArray(data.perQuestion)) return null;
    if (!data.matrix || !Array.isArray(data.matrix.rows)) return null;
    return data;
  } catch {
    return null;
  }
}
