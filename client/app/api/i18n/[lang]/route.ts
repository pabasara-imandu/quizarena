import { NextResponse } from 'next/server';
import { isOverrideLang, overrideProblem } from '@/lib/i18n/overrides';
import { verifyAdmin } from '@/lib/server/admins';
import { readOverrides, storeName, writeOverrides } from '@/lib/server/overrideStore';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ lang: string }> };

/** One language's edits, uncached, with who saved them and when - for the editor. */
export async function GET(_request: Request, { params }: Params) {
  const { lang } = await params;
  if (!isOverrideLang(lang)) return NextResponse.json({ error: 'Unknown language.' }, { status: 404 });
  try {
    const stored = await readOverrides(lang);
    return NextResponse.json({ lang, ...stored, store: storeName() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[i18n] read failed', err);
    return NextResponse.json(
      {
        error:
          'The translation store could not be read (' +
          storeName() +
          '): ' +
          (err instanceof Error ? err.name + ' - ' + err.message : String(err)),
      },
      { status: 500 }
    );
  }
}

/**
 * Replace a language's edits. Admins only, and every entry is checked here
 * again, whatever the page already checked: a key the app does not know or
 * a string missing a placeholder is refused by name rather than stored.
 */
export async function PUT(request: Request, { params }: Params) {
  const { lang } = await params;
  if (!isOverrideLang(lang)) return NextResponse.json({ error: 'Unknown language.' }, { status: 404 });

  const admin = await verifyAdmin(request);
  if (typeof admin === 'string') return NextResponse.json({ error: admin }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'The request was not JSON.' }, { status: 400 });
  }
  const proposed = (body as { overrides?: unknown })?.overrides;
  if (!proposed || typeof proposed !== 'object' || Array.isArray(proposed)) {
    return NextResponse.json({ error: 'Expected { overrides: { key: text } }.' }, { status: 400 });
  }

  const problems: Record<string, string> = {};
  for (const [key, value] of Object.entries(proposed as Record<string, unknown>)) {
    const problem = overrideProblem(key, value);
    if (problem) problems[key] = problem;
  }
  if (Object.keys(problems).length) {
    return NextResponse.json({ error: 'Some entries cannot be saved.', problems }, { status: 422 });
  }

  try {
    const saved = await writeOverrides(lang, proposed as Record<string, string>, admin.email);
    return NextResponse.json({ ok: true, lang, ...saved, store: storeName() });
  } catch (err) {
    console.error('[i18n] write failed', err);
    return NextResponse.json(
      {
        error:
          'The translation store could not be written (' +
          storeName() +
          '): ' +
          (err instanceof Error ? err.name + ' - ' + err.message : String(err)),
      },
      { status: 500 }
    );
  }
}
