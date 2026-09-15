'use client';

import { useEffect, useRef } from 'react';
import {
  clearIdentity,
  mountSignInButton,
  signInConfigured,
  type HostIdentity as Identity,
} from '@/lib/googleAuth';

/**
 * The corner of the host page that says who you are, if you chose to say.
 *
 * Renders nothing at all when the build has no Google client id, so a
 * self-hosted copy without Google looks exactly as it did before.
 */
export function HostIdentity({
  identity,
  onChange,
}: {
  identity: Identity | null;
  onChange: (identity: Identity | null) => void;
}) {
  const slot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (identity || !slot.current || !signInConfigured()) return;
    const el = slot.current;
    el.innerHTML = '';
    mountSignInButton(el, onChange).catch(() => {
      /* offline - the page works without it */
    });
  }, [identity, onChange]);

  if (!signInConfigured()) return null;

  if (!identity) {
    // Google renders its own button into this slot. Sized so the header does
    // not jump when it appears a moment after the page.
    return <div ref={slot} className="min-h-[32px] min-w-[120px]" aria-label="Sign in with Google" />;
  }

  return (
    <div className="flex items-center gap-2">
      {identity.picture ? (
        <img
          src={identity.picture}
          alt=""
          referrerPolicy="no-referrer"
          className="h-7 w-7 rounded-full border border-white/10"
        />
      ) : (
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-500/25 text-[11px] font-bold text-brand-200">
          {identity.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:inline">{identity.name}</span>
      <button
        type="button"
        className="text-xs text-slate-500 transition hover:text-rose-300"
        onClick={() => {
          clearIdentity();
          onChange(null);
        }}
      >
        sign out
      </button>
    </div>
  );
}
