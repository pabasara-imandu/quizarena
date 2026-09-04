import type { Question, RoomSettings } from '@/lib/types';

/**
 * The quiz you are writing, kept on this device.
 *
 * Writing thirty questions is half an hour of work that until now lived only
 * in a React state tree - one accidental refresh, one closed tab, one crash
 * and it was gone. This mirrors it to localStorage on every edit and hands it
 * back on the next visit.
 *
 * localStorage rather than the server on purpose: a draft is not a room, it
 * has no PIN and no players, and it should not need an account or a network
 * to survive. Images are already stored as URLs rather than inline data, so
 * even a long quiz is a few KB here.
 */

const KEY = 'quizarena.draft.v1';

export interface QuizDraft {
  title: string;
  questions: Question[];
  settings: RoomSettings;
  savedAt: number;
}

/** A blank editor is not worth restoring, and must never overwrite real work. */
export function isWorthSaving(title: string, questions: Question[]): boolean {
  if (questions.length > 1) return true;
  if (questions.some((q) => q.text.trim())) return true;
  if (questions.some((q) => q.options?.some((o) => o.text.trim() || o.image))) return true;
  if (questions.some((q) => q.image)) return true;
  return false;
}

export function saveDraft(draft: Omit<QuizDraft, 'savedAt'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // Private mode, a full quota, or storage disabled entirely. Losing the
    // backup must never take the editor down with it.
  }
}

export function loadDraft(): QuizDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuizDraft;
    // Anything could be under this key - another tab, an older build, a user
    // with devtools open. Only trust it if it still looks like a quiz.
    if (!Array.isArray(parsed?.questions) || parsed.questions.length === 0) return null;
    if (typeof parsed.title !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do - the draft is a convenience, not state we depend on */
  }
}

/** "just now" / "8 minutes ago" / "yesterday", for the restored-draft notice. */
export function describeAge(savedAt: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes + (minutes === 1 ? ' minute ago' : ' minutes ago');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : days + ' days ago';
}
