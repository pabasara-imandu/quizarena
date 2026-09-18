import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * An admin pass: proof, issued by the site, that a signed-in Google account
 * is an admin and which kind.
 *
 * The site is the only place that knows the whole admin list - the super
 * admins in admins.json and the normal admins added from the admin page,
 * which live in the site's store. A quiz server knows neither the store nor
 * the page. So after the site has verified an account, it signs a short
 * statement about it with the ADMIN_TOKEN the servers already share, and
 * the browser shows that statement to each server. A server checks the
 * signature and the expiry, and nothing else - no network, no list.
 *
 * Format: base64url(JSON) "." base64url(HMAC-SHA256). The JSON is
 * { e: email, r: "super" | "normal", x: expiry ms }. A pass lives as long
 * as the Google sign-in it came from, an hour at most.
 */
const b64 = (buf) => Buffer.from(buf).toString('base64url');

export function signAdminPass(secret, { email, role, expiresAt }) {
  if (!secret) return null;
  const body = b64(JSON.stringify({ e: email, r: role === 'super' ? 'super' : 'normal', x: expiresAt }));
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return body + '.' + sig;
}

/** The claims inside a pass if it is genuine and current, else null. */
export function verifyAdminPass(secret, pass, now = Date.now()) {
  if (!secret || typeof pass !== 'string') return null;
  const dot = pass.indexOf('.');
  if (dot <= 0) return null;
  const body = pass.slice(0, dot);
  const sig = pass.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  if (expected.length !== sig.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof claims?.e !== 'string' || !claims.e.includes('@')) return null;
    if (typeof claims.x !== 'number' || claims.x <= now) return null;
    return { email: claims.e, role: claims.r === 'super' ? 'super' : 'normal', expiresAt: claims.x };
  } catch {
    return null;
  }
}
