import { NextResponse } from 'next/server';
import { ROLE_LABEL } from '@/lib/adminRoles';
import { isSuperAdmin, superAdminEmails, verifyAdmin, verifySuperAdmin } from '@/lib/server/admins';
import { isEmail, readNormalAdmins, writeNormalAdmins, type NormalAdmin } from '@/lib/server/adminStore';
import { openStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

async function listing(normalAdmins?: NormalAdmin[]) {
  return {
    superAdmins: superAdminEmails(),
    // After a write the caller passes what it wrote: the store is eventually
    // consistent, and a read straight after a write may not see it yet.
    normalAdmins: normalAdmins ?? (await readNormalAdmins()),
    labels: ROLE_LABEL,
    store: openStore('admins').name,
  };
}

const explain = (what: string, err: unknown) =>
  what + ' (' + openStore('admins').name + '): ' + (err instanceof Error ? err.name + ' - ' + err.message : String(err));

/** Both lists. Any admin may look; only a super admin may change them. */
export async function GET(request: Request) {
  const admin = await verifyAdmin(request);
  if (typeof admin === 'string') return NextResponse.json({ error: admin }, { status: 403, headers: NO_STORE });
  try {
    return NextResponse.json(await listing(), { headers: NO_STORE });
  } catch (err) {
    console.error('[admins] read failed', err);
    return NextResponse.json({ error: explain('The admin list could not be read', err) }, { status: 500, headers: NO_STORE });
  }
}

async function emailFrom(request: Request): Promise<string | null> {
  try {
    const body = (await request.json()) as { email?: unknown };
    return isEmail(body?.email) ? body.email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Add a normal admin. Super admins only. */
export async function POST(request: Request) {
  const admin = await verifySuperAdmin(request);
  if (typeof admin === 'string') return NextResponse.json({ error: admin }, { status: 403, headers: NO_STORE });

  const email = await emailFrom(request);
  if (!email) return NextResponse.json({ error: 'That is not an email address.' }, { status: 400, headers: NO_STORE });
  if (isSuperAdmin(email)) {
    return NextResponse.json({ error: email + ' is already a ' + ROLE_LABEL.super + '.' }, { status: 409, headers: NO_STORE });
  }

  try {
    const current = await readNormalAdmins();
    if (current.some((a) => a.email === email)) {
      return NextResponse.json({ error: email + ' is already a ' + ROLE_LABEL.normal + '.' }, { status: 409, headers: NO_STORE });
    }
    const next = [...current, { email, addedBy: admin.email, addedAt: Date.now() }];
    await writeNormalAdmins(next);
    return NextResponse.json({ ok: true, ...(await listing(next)) }, { headers: NO_STORE });
  } catch (err) {
    console.error('[admins] write failed', err);
    return NextResponse.json({ error: explain('The admin list could not be saved', err) }, { status: 500, headers: NO_STORE });
  }
}

/** Remove a normal admin. Super admins only; super admins cannot be removed here. */
export async function DELETE(request: Request) {
  const admin = await verifySuperAdmin(request);
  if (typeof admin === 'string') return NextResponse.json({ error: admin }, { status: 403, headers: NO_STORE });

  const email = await emailFrom(request);
  if (!email) return NextResponse.json({ error: 'That is not an email address.' }, { status: 400, headers: NO_STORE });
  if (isSuperAdmin(email)) {
    return NextResponse.json(
      { error: 'A ' + ROLE_LABEL.super + ' can only be changed in admins.json.' },
      { status: 409, headers: NO_STORE }
    );
  }

  try {
    const current = await readNormalAdmins();
    if (!current.some((a) => a.email === email)) {
      return NextResponse.json({ error: email + ' is not on the list.' }, { status: 404, headers: NO_STORE });
    }
    const next = current.filter((a) => a.email !== email);
    await writeNormalAdmins(next);
    return NextResponse.json({ ok: true, ...(await listing(next)) }, { headers: NO_STORE });
  } catch (err) {
    console.error('[admins] write failed', err);
    return NextResponse.json({ error: explain('The admin list could not be saved', err) }, { status: 500, headers: NO_STORE });
  }
}
