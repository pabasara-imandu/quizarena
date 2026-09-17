'use client';

import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { en, type MessageKey } from './en';
import { si } from './si';
import { isOverrideLang, sanitizeOverrides, type OverrideLang, type Overrides } from './overrides';

/**
 * The app's languages.
 *
 * One dictionary per language, all sharing the English key set; a key a
 * translation lacks falls back to English rather than to a blank. The choice
 * is per device - a teacher's laptop and each student's phone pick their own,
 * and nothing about it crosses the wire.
 */
export type Lang = 'en' | 'si' | 'ta';

type Dict = Partial<Record<MessageKey, string>>;

const DICTS: Record<Lang, Dict> = { en, si, ta: {} };

/** The shipped dictionary for a language, before any edits. */
export function builtInDictionary(lang: Lang): Dict {
  return DICTS[lang];
}

/**
 * Edits made from the admin page, laid over the built-in dictionaries.
 *
 * Fetched once per visit from this site's own /api/i18n and kept in
 * localStorage, so the second visit paints with them immediately and a visit
 * with no network still has the last ones. Everything passes through
 * `sanitizeOverrides` on the way in - what is stored can never break a page.
 */
export type AllOverrides = Partial<Record<OverrideLang, Overrides>>;

const OVERRIDES_KEY = 'quizarena.i18n.v1';
const OVERRIDES_TIMEOUT_MS = 6000;

function readCachedOverrides(): AllOverrides {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return {};
    return sanitizeAll(JSON.parse(raw));
  } catch {
    return {};
  }
}

function sanitizeAll(raw: unknown): AllOverrides {
  const out: AllOverrides = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [lang, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isOverrideLang(lang)) out[lang] = sanitizeOverrides(value);
  }
  return out;
}

export async function fetchOverrides(): Promise<AllOverrides | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OVERRIDES_TIMEOUT_MS);
  try {
    const res = await fetch('/api/i18n', { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    return sanitizeAll(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Languages that actually have words in them, in menu order. Native names only. */
export const LANGUAGES: { code: Lang; name: string }[] = (
  [
    { code: 'en', name: 'English' },
    { code: 'si', name: 'සිංහල' },
    { code: 'ta', name: 'தமிழ்' },
  ] as const
).filter((l) => Object.keys(DICTS[l.code]).length > 0);

const STORE_KEY = 'quizarena.lang';

type Vars = Record<string, string | number>;

/** Keys that come as a `_one` / `_other` pair. */
type PluralKey = {
  [K in MessageKey]: K extends `${infer Base}_other` ? Base : never;
}[MessageKey];

export interface Translator {
  (key: MessageKey, vars?: Vars): string;
  /** Pick the singular or plural form by count; `{n}` is filled in for you. */
  n: (key: PluralKey, count: number, vars?: Vars) => string;
  /** Same as `t`, but a placeholder can be an element - for a bold answer inside a sentence. */
  rich: (key: MessageKey, vars: Record<string, ReactNode>) => ReactNode;
  /** 1st, 2nd, 3rd - or the language's own way of saying it. */
  ordinal: (n: number) => string;
  lang: Lang;
}

const PLACEHOLDER = /\{(\w+)\}/g;

function fill(template: string, vars?: Vars) {
  if (!vars) return template;
  return template.replace(PLACEHOLDER, (m, name) =>
    name in vars ? String(vars[name]) : m
  );
}

function englishOrdinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function makeTranslator(lang: Lang, overrides?: Overrides): Translator {
  const dict: Dict = overrides && Object.keys(overrides).length ? { ...DICTS[lang], ...overrides } : DICTS[lang];
  const lookup = (key: string): string =>
    (dict as Record<string, string>)[key] ?? (en as Record<string, string>)[key] ?? key;

  const t = ((key: MessageKey, vars?: Vars) => fill(lookup(key), vars)) as Translator;

  t.n = (key, count, vars) => {
    const form = count === 1 ? '_one' : '_other';
    // A language may only give one form - fall through to whichever exists.
    const template =
      (dict as Record<string, string>)[key + form] ??
      (dict as Record<string, string>)[key + '_other'] ??
      (en as Record<string, string>)[key + form] ??
      (en as Record<string, string>)[key + '_other'] ??
      key;
    return fill(template, { n: count, ...vars });
  };

  t.rich = (key, vars) => {
    const parts = lookup(key).split(/(\{\w+\})/);
    return parts.map((part, i) => {
      const m = /^\{(\w+)\}$/.exec(part);
      if (!m) return part;
      return <Fragment key={i}>{m[1] in vars ? vars[m[1]] : part}</Fragment>;
    });
  };

  t.ordinal = (n) => (lang === 'en' ? englishOrdinal(n) : fill(lookup('format.ordinal'), { n }));
  t.lang = lang;
  return t;
}

/* -------------------------------------------------------------------------- */

interface LanguageContext {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translator;
  /** Edits from the admin page, by language, as currently applied. */
  overrides: AllOverrides;
  /** Re-read the edits from the server - the admin page calls this after saving. */
  reloadOverrides: () => Promise<void>;
}

const Ctx = createContext<LanguageContext>({
  lang: 'en',
  setLang: () => {},
  t: makeTranslator('en'),
  overrides: {},
  reloadOverrides: async () => {},
});

function isAvailable(code: string | null | undefined): code is Lang {
  return !!code && LANGUAGES.some((l) => l.code === code);
}

/** The saved choice, else the phone's own language if we speak it, else English. */
function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (isAvailable(saved)) return saved;
  } catch {
    /* storage blocked - fall through to the browser's language */
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const code = tag?.slice(0, 2).toLowerCase();
    if (isAvailable(code)) return code;
  }
  return 'en';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // English for the server render and the first client paint, then the real
  // choice - reading storage during render would make the two disagree and
  // React would throw the page away on hydration.
  const [lang, setLangState] = useState<Lang>('en');
  const [overrides, setOverrides] = useState<AllOverrides>({});

  const reloadOverrides = useCallback(async () => {
    const fresh = await fetchOverrides();
    if (!fresh) return;
    setOverrides(fresh);
    try {
      localStorage.setItem(OVERRIDES_KEY, JSON.stringify(fresh));
    } catch {
      /* no cache - next visit fetches again */
    }
  }, []);

  useEffect(() => {
    setLangState(detect());
    // Last visit's edits first, so nothing waits on the network; then the
    // current ones. A failed fetch changes nothing.
    setOverrides(readCachedOverrides());
    void reloadOverrides();
  }, [reloadOverrides]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<LanguageContext>(
    () => ({
      lang,
      t: makeTranslator(lang, isOverrideLang(lang) ? overrides[lang] : undefined),
      overrides,
      reloadOverrides,
      setLang: (next) => {
        setLangState(next);
        try {
          localStorage.setItem(STORE_KEY, next);
        } catch {
          /* a choice that does not persist is still a choice for this visit */
        }
      },
    }),
    [lang, overrides, reloadOverrides]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT(): Translator {
  return useContext(Ctx).t;
}

export function useLanguage() {
  return useContext(Ctx);
}

/**
 * A server reply or thrown error carries a `code`; if we have words for it in
 * this language, use ours, otherwise show whatever the server said.
 */
export function describeError(
  t: Translator,
  err: { code?: string; message?: string } | null | undefined,
  fallback: MessageKey,
  vars?: Vars
): string {
  const key = err?.code ? 'err.' + err.code : '';
  if (key && key in en) return t(key as MessageKey, vars);
  return err?.message || t(fallback, vars);
}
