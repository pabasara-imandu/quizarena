import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { getStore } from '@netlify/blobs';

/**
 * A small named key-value store for the site's own records - translation
 * edits, the normal-admin list.
 *
 * On Netlify it is Netlify Blobs: part of the site, free, no account or
 * setup, and it survives deploys - which the quiz servers' disks do not (a
 * free Render instance forgets its files every restart). Locally it is a
 * JSON file under client/.data so everything can be worked on without
 * Netlify. Callers treat what comes back as untrusted and validate it.
 */
export interface KeyValueStore {
  name: 'netlify-blobs' | 'local-file';
  read(key: string): Promise<string | null>;
  write(key: string, json: string): Promise<void>;
}

const opened = new Map<string, KeyValueStore>();

export function openStore(storeName: string): KeyValueStore {
  const existing = opened.get(storeName);
  if (existing) return existing;

  let store: KeyValueStore;
  try {
    // Throws synchronously when the Netlify environment is absent - that is
    // how we know to fall back locally.
    //
    // Eventual consistency, deliberately. A Next.js function on Netlify is
    // given an edge URL but not the uncached one that strong consistency
    // needs, so asking for "strong" throws on every read and write before
    // a single request is made - which is what "the translation store could
    // not be written" was. Callers that need to show what they just wrote
    // use the value they wrote, not a read-back.
    //
    // The fetch is the platform's own with caching off: Next.js patches the
    // global fetch for its data cache, and a store must never read a cached
    // copy of itself.
    const blobs = getStore({
      name: storeName,
      fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: 'no-store' }),
    });
    store = {
      name: 'netlify-blobs',
      read: (key) => blobs.get(key, { type: 'text' }),
      write: (key, json) => blobs.set(key, json).then(() => undefined),
    };
  } catch {
    const dir = join(process.cwd(), '.data');
    const file = (key: string) => join(dir, storeName + '-' + key + '.json');
    store = {
      name: 'local-file',
      read: async (key) => {
        try {
          return await readFile(file(key), 'utf8');
        } catch {
          return null;
        }
      },
      write: async (key, json) => {
        await mkdir(dirname(file(key)), { recursive: true });
        await writeFile(file(key), json);
      },
    };
  }
  opened.set(storeName, store);
  return store;
}
