import { OAuth2Client } from 'google-auth-library';
import adminsFile from '../../../admins.json';

/**
 * Who may save translations - the same list the quiz servers use for the
 * fleet view: ADMIN_EMAILS if set, otherwise admins.json at the repository
 * root, bundled into this code at build time so the function needs no file
 * on disk. An empty list means closed.
 *
 * Server-side only. Nothing here reaches the browser.
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

export function adminEmails(): string[] {
  const env = parseList(process.env.ADMIN_EMAILS ?? '');
  if (env.length) return env;
  const list = Array.isArray(adminsFile) ? adminsFile : (adminsFile as { admins?: string[] }).admins;
  return parseList((list ?? []).join(','));
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmails().includes(email.trim().toLowerCase());
}

export interface Admin {
  email: string;
  name: string;
  via: 'google' | 'dev';
}

let client: OAuth2Client | null = null;

/**
 * Verify a Google ID token against this app's client id and the admin list.
 * Resolves to the admin, or to a sentence saying why not - the same sentence
 * the page shows, so a refused teacher knows which file to edit.
 */
export async function verifyAdmin(request: Request): Promise<Admin | string> {
  // Local development only: with ADMIN_DEV_BYPASS_EMAIL in .env.local, a
  // request naming that email in x-dev-admin-email is that admin. It is
  // never set on a deployment, so the header does nothing there.
  const bypass = (process.env.ADMIN_DEV_BYPASS_EMAIL ?? '').trim().toLowerCase();
  const devEmail = (request.headers.get('x-dev-admin-email') ?? '').trim().toLowerCase();
  if (bypass && devEmail && devEmail === bypass) return { email: bypass, name: 'Dev admin', via: 'dev' };

  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '');
  const idToken = m?.[1]?.trim();
  if (!idToken) {
    return adminEmails().length
      ? 'Sign in with Google to edit translations.'
      : 'No admin list is configured (admins.json or ADMIN_EMAILS), so editing is closed.';
  }

  const clientId = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '').trim();
  if (!clientId) return 'This site has no NEXT_PUBLIC_GOOGLE_CLIENT_ID, so Google sign-in cannot be checked.';

  try {
    client ??= new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    const claims = ticket.getPayload();
    if (!claims?.email || !claims.email_verified) return 'That Google sign-in could not be verified. Sign in again.';
    if (!isAdminEmail(claims.email)) {
      return claims.email + ' is not on the admin list. Add it to admins.json (or ADMIN_EMAILS) and redeploy.';
    }
    return { email: claims.email, name: claims.name ?? claims.email, via: 'google' };
  } catch {
    return 'That Google sign-in could not be verified. Sign in again.';
  }
}
