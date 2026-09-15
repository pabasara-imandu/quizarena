/**
 * Optional Google sign-in for hosts.
 *
 * Uses Google Identity Services directly - no Firebase, no auth server, no
 * database. The browser gets a short-lived ID token from Google, shows the
 * teacher's name from it, and hands it to our server once when a room is
 * created. The server verifies it against Google's public keys and forgets it.
 *
 * Signing in is never required. Students never see any of this. It exists so a
 * host who does sign in can run a bigger room; that is the whole exchange.
 */

const KEY = 'quizarena.hostIdentity.v1';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

export interface HostIdentity {
  credential: string;
  /** Unix ms. Google ID tokens live about an hour. */
  expiresAt: number;
  name: string;
  email: string;
  picture: string | null;
}

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    ux_mode?: 'popup' | 'redirect';
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      width?: number;
      logo_alignment?: 'left' | 'center';
    }
  ): void;
  prompt(): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

export function googleClientId(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? '';
}

/** Sign-in is offered only when this build knows which Google app it is. */
export function signInConfigured(): boolean {
  return googleClientId().length > 0;
}

/**
 * Read the display claims out of an ID token without verifying it.
 *
 * Fine for showing a name in the corner of the page; never for deciding
 * anything. The server does the real verification when the token is used.
 */
function decodeClaims(credential: string): { name: string; email: string; picture: string | null; exp: number } | null {
  try {
    const payload = credential.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json);
    if (!claims?.exp) return null;
    return {
      name: claims.name || claims.email || 'Signed in',
      email: claims.email || '',
      picture: claims.picture || null,
      exp: claims.exp * 1000,
    };
  } catch {
    return null;
  }
}

export function loadIdentity(): HostIdentity | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HostIdentity;
    if (!parsed?.credential || !parsed.expiresAt) return null;
    // Expired tokens are dropped rather than shown: a name in the corner that
    // would silently fall back to an anonymous room is worse than no name.
    if (parsed.expiresAt <= Date.now() + 30_000) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearIdentity(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
  window.google?.accounts.id.disableAutoSelect();
}

function storeCredential(credential: string): HostIdentity | null {
  const claims = decodeClaims(credential);
  if (!claims) return null;
  const identity: HostIdentity = {
    credential,
    expiresAt: claims.exp,
    name: claims.name,
    email: claims.email,
    picture: claims.picture,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(identity));
  } catch {
    /* private mode - the sign-in still works for this page load */
  }
  return identity;
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('Google sign-in could not load. Check your connection.'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Render Google's own button into `parent` and resolve the identity when the
 * host completes the flow. Google's button, not a lookalike: the rendered
 * button is what makes the popup trusted, and lookalikes get blocked.
 */
export async function mountSignInButton(
  parent: HTMLElement,
  onSignedIn: (identity: HostIdentity) => void
): Promise<void> {
  const clientId = googleClientId();
  if (!clientId) return;
  await loadScript();
  const api = window.google?.accounts.id;
  if (!api) return;

  api.initialize({
    client_id: clientId,
    callback: (res) => {
      const identity = storeCredential(res.credential);
      if (identity) onSignedIn(identity);
    },
    auto_select: false,
    cancel_on_tap_outside: true,
    ux_mode: 'popup',
  });
  api.renderButton(parent, {
    theme: 'filled_black',
    size: 'medium',
    shape: 'pill',
    text: 'signin_with',
    logo_alignment: 'left',
  });
}
