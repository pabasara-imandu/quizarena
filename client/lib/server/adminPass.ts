import { createHmac } from 'node:crypto';
import type { AdminRole } from '@/lib/adminRoles';

/**
 * A signed statement that an account is an admin and which kind, for the
 * quiz servers to check without a network call or a list. The same format
 * the servers verify in server/src/auth/adminPass.js; the key is the shared
 * ADMIN_TOKEN. Payload { e: email, r: role, x: expiry ms }, base64url,
 * HMAC-SHA256.
 */
export function signAdminPass(
  secret: string,
  claims: { email: string; role: AdminRole; expiresAt: number }
): string | null {
  if (!secret) return null;
  const body = Buffer.from(
    JSON.stringify({ e: claims.email, r: claims.role, x: claims.expiresAt })
  ).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return body + '.' + sig;
}
