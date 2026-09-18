import { openStore } from './store';

/**
 * The normal admins (පොඩි admin): added and removed from the admin page by
 * a super admin, kept in the "admins" store. Read on every check, so a
 * removal takes effect on the next request - except at the quiz servers,
 * which trust a signed pass for as long as it lives (an hour at most).
 */
export interface NormalAdmin {
  email: string;
  addedBy: string;
  addedAt: number;
}

const KEY = 'normal';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isEmail = (value: unknown): value is string =>
  typeof value === 'string' && EMAIL.test(value.trim());

export async function readNormalAdmins(): Promise<NormalAdmin[]> {
  const raw = await openStore('admins').read(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { admins?: unknown };
    if (!Array.isArray(parsed.admins)) return [];
    const seen = new Set<string>();
    const out: NormalAdmin[] = [];
    for (const entry of parsed.admins as Array<Partial<NormalAdmin>>) {
      if (!isEmail(entry?.email)) continue;
      const email = entry.email.trim().toLowerCase();
      if (seen.has(email)) continue;
      seen.add(email);
      out.push({
        email,
        addedBy: typeof entry.addedBy === 'string' ? entry.addedBy : '',
        addedAt: typeof entry.addedAt === 'number' ? entry.addedAt : 0,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function writeNormalAdmins(admins: NormalAdmin[]): Promise<void> {
  await openStore('admins').write(KEY, JSON.stringify({ admins, updatedAt: Date.now() }));
}
