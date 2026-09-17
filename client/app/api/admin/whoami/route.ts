import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/server/admins';

export const dynamic = 'force-dynamic';

/** Is this Google account an admin? Answered here, without waking a quiz server. */
export async function GET(request: Request) {
  const admin = await verifyAdmin(request);
  if (typeof admin === 'string') {
    return NextResponse.json({ ok: false, error: admin }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ ok: true, ...admin }, { headers: { 'Cache-Control': 'no-store' } });
}
