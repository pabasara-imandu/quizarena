import { OVERRIDE_LANGS, sanitizeOverrides, type OverrideLang, type Overrides } from '@/lib/i18n/overrides';
import { openStore } from './store';

/**
 * Where translation edits live: the "i18n" store, one record per language.
 * Whatever is read back goes through `sanitizeOverrides`; the store is
 * trusted for durability, not for shape.
 */
export interface StoredOverrides {
  overrides: Overrides;
  updatedAt: number | null;
  updatedBy: string | null;
}

const EMPTY: StoredOverrides = { overrides: {}, updatedAt: null, updatedBy: null };

const store = () => openStore('i18n');

export function storeName(): string {
  return store().name;
}

export async function readOverrides(lang: OverrideLang): Promise<StoredOverrides> {
  const raw = await store().read(lang);
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredOverrides>;
    return {
      overrides: sanitizeOverrides(parsed.overrides),
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : null,
      updatedBy: typeof parsed.updatedBy === 'string' ? parsed.updatedBy : null,
    };
  } catch {
    return EMPTY;
  }
}

export async function readAllOverrides(): Promise<Record<OverrideLang, StoredOverrides>> {
  const entries = await Promise.all(OVERRIDE_LANGS.map(async (lang) => [lang, await readOverrides(lang)] as const));
  return Object.fromEntries(entries) as Record<OverrideLang, StoredOverrides>;
}

export async function writeOverrides(lang: OverrideLang, overrides: Overrides, by: string): Promise<StoredOverrides> {
  const record: StoredOverrides = {
    overrides: sanitizeOverrides(overrides),
    updatedAt: Date.now(),
    updatedBy: by,
  };
  await store().write(lang, JSON.stringify(record));
  return record;
}
