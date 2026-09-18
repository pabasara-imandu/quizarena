import { NextResponse } from 'next/server';
import { ROLE_LABEL } from '@/lib/adminRoles';
import { verifyAdmin } from '@/lib/server/admins';
import { signAdminPass } from '@/lib/server/adminPass';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Is this Google account an admin, and which kind?
 *
 * Answered here, without waking a quiz server. The reply carries a signed
 * pass the browser shows to each quiz server for the fleet view - the
 * servers cannot see the admin list, but they share ADMIN_TOKEN with this
 * site and can check a signature. Without ADMIN_TOKEN on this site there is
 * no pass, and the fleet view says what to set.
 */
export async function GET(request: Request) {
  const admin = await verifyAdmin(request);
  if (typeof admin === 'string') {
    return NextResponse.json({ ok: false, error: admin }, { status: 403, headers: NO_STORE });
  }
  const secret = (process.env.ADMIN_TOKEN ?? '').trim();
  const pass = signAdminPass(secret, { email: admin.email, role: admin.role, expiresAt: admin.expiresAt });
  return NextResponse.json(
    {
      ok: true,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      roleLabel: ROLE_LABEL[admin.role],
      via: admin.via,
      expiresAt: admin.expiresAt,
      pass,
      fleetHint: pass
        ? null
        : 'The fleet view needs ADMIN_TOKEN set on the site (Netlify), the same value as on every quiz server.',
    },
    { headers: NO_STORE }
  );
}
