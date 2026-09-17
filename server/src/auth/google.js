import { OAuth2Client } from 'google-auth-library';
import { config } from '../config.js';

/**
 * Who is hosting this room, if they chose to say.
 *
 * Signing in is optional and it is the *host's* choice only - students never
 * sign in to anything. A signed-in host gets the full room size; an anonymous
 * one gets a smaller room. That is the whole of what identity buys here.
 *
 * There is no session, no cookie and no user table. The browser hands over a
 * Google ID token at the moment it creates a room; the token is verified once
 * against Google's public keys, the room remembers the outcome, and the token
 * is never stored. The verified claims are the only thing kept, and only for
 * as long as the room lives.
 */

let client = null;

/** Sign-in can only mean anything if this server knows which app it is. */
export function signInEnabled() {
  return !!config.googleClientId;
}

/**
 * Verify a Google ID token and return the host's identity, or null.
 *
 * Null for every failure - missing, expired, wrong audience, forged, or an
 * email outside the allowed domains. The caller treats null as "anonymous",
 * never as an error: a stale token should degrade to the smaller room, not
 * stop a teacher from running a lesson.
 */
export async function verifyHostIdToken(idToken) {
  const claims = await verifyIdToken(idToken);
  if (!claims) return null;

  if (config.googleAllowedDomains.length) {
    const domain = String(claims.email || '').split('@')[1]?.toLowerCase();
    if (!domain || !config.googleAllowedDomains.includes(domain)) return null;
  }

  return {
    verified: true,
    sub: claims.sub,
    email: claims.email,
    name: claims.name || claims.email,
    picture: claims.picture || null,
  };
}

/**
 * The verification itself: Google's signature, our audience, a verified
 * email. Returns the claims or null - the same null for every failure, so a
 * caller cannot tell a forged token from an expired one and neither can
 * anyone probing the endpoint.
 */
export async function verifyIdToken(idToken) {
  if (!signInEnabled() || typeof idToken !== 'string' || !idToken) return null;
  try {
    client ??= new OAuth2Client(config.googleClientId);
    const ticket = await client.verifyIdToken({ idToken, audience: config.googleClientId });
    const claims = ticket.getPayload();
    if (!claims?.sub || !claims.email_verified || !claims.email) return null;
    return claims;
  } catch {
    return null;
  }
}
