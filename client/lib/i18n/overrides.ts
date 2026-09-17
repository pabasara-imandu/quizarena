import { en, type MessageKey } from './en';

/**
 * Edits to a translation made from the admin page, on top of the built-in
 * dictionary. Stored as plain JSON, so everything that reads one runs it
 * through `sanitizeOverrides` first: only keys the app knows, only strings,
 * and only strings that keep every placeholder the English has. A bad entry
 * is dropped, never thrown - a typo in the admin page must not be able to
 * blank a student's screen.
 */
export type Overrides = Partial<Record<MessageKey, string>>;

export const OVERRIDE_LANGS = ['si', 'ta'] as const;
export type OverrideLang = (typeof OVERRIDE_LANGS)[number];

export function isOverrideLang(value: unknown): value is OverrideLang {
  return typeof value === 'string' && (OVERRIDE_LANGS as readonly string[]).includes(value);
}

/** The placeholder names in a string, sorted, e.g. "{n} of {max}" -> ["max", "n"]. */
export function placeholdersOf(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

/**
 * Why a proposed translation for `key` cannot be used, or null if it can.
 * The same check the admin page shows inline and the server applies on save.
 */
export function overrideProblem(key: string, value: unknown): string | null {
  if (!(key in en)) return 'unknown key';
  if (typeof value !== 'string') return 'not text';
  if (!value.trim()) return 'empty';
  if (value.length > 1000) return 'too long';
  const want = placeholdersOf(en[key as MessageKey]);
  const got = placeholdersOf(value);
  if (want.join(',') !== got.join(',')) {
    const missing = want.filter((p) => !got.includes(p));
    const extra = got.filter((p) => !want.includes(p));
    const parts = [];
    if (missing.length) parts.push('missing {' + missing.join('} {') + '}');
    if (extra.length) parts.push('unexpected {' + extra.join('} {') + '}');
    return parts.join(', ');
  }
  return null;
}

/** Keep only the entries that pass `overrideProblem`. Never throws. */
export function sanitizeOverrides(raw: unknown): Overrides {
  const out: Overrides = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (overrideProblem(key, value) === null) out[key as MessageKey] = (value as string).trim();
  }
  return out;
}

/** Only what differs from the built-in text - the part worth storing. */
export function diffOverrides(builtIn: Overrides, values: Overrides): Overrides {
  const out: Overrides = {};
  for (const [key, value] of Object.entries(values)) {
    if (value != null && value !== (builtIn[key as MessageKey] ?? en[key as MessageKey])) {
      out[key as MessageKey] = value;
    }
  }
  return out;
}
