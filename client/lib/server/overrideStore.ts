import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { getStore } from '@netlify/blobs';
import { OVERRIDE_LANGS, sanitizeOverrides, type OverrideLang, type Overrides } from '@/lib/i18n/overrides';

/**
 * Where translation edits live.
 *
 * On Netlify, in Netlify Blobs: a key-value store that comes with the site,
 * costs nothing, needs no account or setup, and survives deploys - which the
 * quiz servers' disks do not (a free Render instance forgets its files every
 * time it restarts). Locally, a JSON file under client/.data so the admin
 * page can be worked on without Netlify.
 *
 * Whatever is read back goes through `sanitizeOverrides`; the store is
 * trusted for durability, not for shape.
 */
export interface StoredOverrides {
  overrides: Overrides;
  updatedAt: number | null;
  updatedBy: string | null;
}

const EMPTY: StoredOverrides = { overrides: {}, updatedAt: null, updatedBy: null };

interface Backend {
  name: string;
  read(lang: OverrideLang): Promise<string | null>;
  write(lang: OverrideLang, json: string): Promise<void>;
}

function blobBackend(): Backend {
  // Throws synchronously when the Netlify environment is absent - that is how
  // we know to fall back locally.
  const store = getStore({ name: 'i18n', consistency: 'strong' });
  return {
    name: 'netlify-blobs',
    read: (lang) => store.get(lang, { type: 'text' }),
    write: (lang, json) => store.set(lang, json).then(() => undefined),
  };
}

function fileBackend(): Backend {
  const dir = join(process.cwd(), '.data');
  const file = (lang: string) => join(dir, 'i18n-' + lang + '.json');
  return {
    name: 'local-file',
    read: async (lang) => {
      try {
        return await readFile(file(lang), 'utf8');
      } catch {
        return null;
      }
    },
    write: async (lang, json) => {
      await mkdir(dirname(file(lang)), { recursive: true });
      await writeFile(file(lang), json);
    },
  };
}

let backend: Backend | null = null;

function pick(): Backend {
  if (backend) return backend;
  try {
    backend = blobBackend();
  } catch {
    backend = fileBackend();
  }
  return backend;
}

export function storeName(): string {
  return pick().name;
}

export async function readOverrides(lang: OverrideLang): Promise<StoredOverrides> {
  const raw = await pick().read(lang);
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
  await pick().write(lang, JSON.stringify(record));
  return record;
}
