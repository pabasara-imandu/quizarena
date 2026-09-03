/**
 * Where the quiz server lives.
 *
 * Three deployment shapes, one rule:
 *
 *  1. `NEXT_PUBLIC_SERVER_URL` set  -> use it. This is local dev
 *     (http://localhost:4000) and split hosting (client on one host, server on
 *     another).
 *  2. Unset, in a browser          -> same origin. This is the reverse-proxy
 *     deployment, where one domain serves the app and forwards `/api` and
 *     `/socket.io` to the server. No CORS, no rebuild to change hosts.
 *  3. Unset, during SSR/build      -> localhost, purely so a build never
 *     crashes. Nothing on the server side actually calls the quiz API.
 *
 * The value is read at call time rather than module load, so it is correct in
 * both the server render pass and the browser.
 */
export function serverUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SERVER_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:4000';
}
