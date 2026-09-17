import { NextResponse } from 'next/server';
import { readAllOverrides } from '@/lib/server/overrideStore';

export const dynamic = 'force-dynamic';

/**
 * Every language's edits in one call, for the app to lay over its built-in
 * dictionaries when it starts. Cached at the CDN for a minute: a class of
 * forty phones loading the join page is one function call, not forty, and
 * an edit from the admin page reaches everyone within the minute.
 */
export async function GET() {
  try {
    const all = await readAllOverrides();
    const body = Object.fromEntries(
      Object.entries(all).map(([lang, stored]) => [lang, stored.overrides])
    );
    return NextResponse.json(body, {
      headers: {
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Netlify-CDN-Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      },
    });
  } catch (err) {
    // A store that cannot be read is not the student's problem: the app has
    // its built-in translation and carries on without edits.
    console.error('[i18n] read failed', err);
    return NextResponse.json({}, { headers: { 'Cache-Control': 'no-store' } });
  }
}
