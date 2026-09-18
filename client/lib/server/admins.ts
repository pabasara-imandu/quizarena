import { OAuth2Client } from 'google-auth-library';
import adminsFile from '../../../admins.json';
import { isAdminRole, type AdminRole } from '@/lib/adminRoles';
import { readNormalAdmins } from './adminStore';

/**
 * Who may use the admin page, and as what.
 *
 * Super admins come from ADMIN_EMAILS if set, otherwise admins.json at the
 * repository root, bundled into this code at build time; they can only be
 * changed there. Normal admins are whoever a super admin has added from the
 * page, kept in the site's store. An empty super list means closed.
 *
 * Server-side only. Nothing here reaches the browser except the verdict.
 */
function parseList(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes('@'))
    ),
  ];
}

export function superAdminEmails(): string[] {
  const env = parseList(process.env.ADMIN_EMAILS ?? '');
  if (env.length) return env;
  const file = adminsFile as { superAdmins?: string[]; admins?: string[] } | string[];
  const list = Array.isArray(file) ? file : (file.superAdmins ?? file.admins);
  return parseList((list ?? []).join(','));
}

export function isSuperAdmin(email: string | null | undefined): boolean {
  return !!email && superAdminEmails().includes(email.trim().toLowerCase());
}

/** The role of an email, checking the file first and the store second. */
export async function roleOf(email: string): Promise<AdminRole | null> {
  const lower = email.trim().toLowerCase();
  if (isSuperAdmin(lower)) return 'super';
  const normals = await readNormalAdmins();
  return normals.some((a) => a.email === lower) ? 'normal' : null;
}

export interface Admin {
  email: string;
  name: string;
  role: AdminRole;
  via: 'google' | 'dev';
  /** When the sign-in behind this verdict runs out, unix ms. */
  expiresAt: number;
}

let client: OAuth2Client | null = null;

/**
 * Verify a Google ID token against this app's client id and the admin lists.
 * Resolves to the admin, or to a sentence saying why not.
 */
export async function verifyAdmin(request: Request): Promise<Admin | string> {
  // Local development only: with ADMIN_DEV_BYPASS_EMAIL in .env.local, a
  // request naming that email in x-dev-admin-email is that admin (a super
  // admin unless x-dev-admin-role says "normal"). It is never set on a
  // deployment, so the headers do nothing there.
  const bypass = (process.env.ADMIN_DEV_BYPASS_EMAIL ?? '').trim().toLowerCase();
  const devEmail = (request.headers.get('x-dev-admin-email') ?? '').trim().toLowerCase();
  if (bypass && devEmail && devEmail === bypass) {
    const wanted = request.headers.get('x-dev-admin-role');
    return {
      email: bypass,
      name: 'Dev admin',
      role: isAdminRole(wanted) ? wanted : 'super',
      via: 'dev',
      expiresAt: Date.now() + 3600_000,
    };
  }

  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '');
  const idToken = m?.[1]?.trim();
  if (!idToken) {
    return superAdminEmails().length
      ? 'Sign in with Google.'
      : 'No admin list is configured (admins.json or ADMIN_EMAILS), so the admin page is closed.';
  }

  const clientId = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '').trim();
  if (!clientId) return 'This site has no NEXT_PUBLIC_GOOGLE_CLIENT_ID, so Google sign-in cannot be checked.';

  try {
    client ??= new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    const claims = ticket.getPayload();
    if (!claims?.email || !claims.email_verified) return 'That Google sign-in could not be verified. Sign in again.';
    const role = await roleOf(claims.email);
    if (!role) return claims.email + ' is not an admin.';
    return {
      email: claims.email.toLowerCase(),
      name: claims.name ?? claims.email,
      role,
      via: 'google',
      expiresAt: claims.exp ? claims.exp * 1000 : Date.now() + 3600_000,
    };
  } catch {
    return 'That Google sign-in could not be verified. Sign in again.';
  }
}

/** Like verifyAdmin, but only a super admin passes. */
export async function verifySuperAdmin(request: Request): Promise<Admin | string> {
  const admin = await verifyAdmin(request);
  if (typeof admin === 'string') return admin;
  return admin.role === 'super' ? admin : 'Only a ලොකු Admin can do that.';
}
