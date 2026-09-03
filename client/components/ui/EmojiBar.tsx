'use client';

import { useRef, useState } from 'react';
import { REACTIONS, type Reaction } from '@/lib/types';

/**
 * Student reaction bar.
 *
 * Two deliberate constraints:
 *  - a fixed allowlist (the server enforces the same one), because this feeds
 *    a projector in front of a whole class;
 *  - a local cooldown, so a student mashing a button gets instant, quiet
 *    feedback instead of a queue of rejected sends.
 */
export function EmojiBar({
  onSend,
  disabled,
  label = 'Send a reaction',
}: {
  onSend: (emoji: Reaction) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [flash, setFlash] = useState<string | null>(null);
  const lastSentAt = useRef(0);

  const send = (emoji: Reaction) => {
    const now = Date.now();
    if (disabled || now - lastSentAt.current < 450) return;
    lastSentAt.current = now;
    onSend(emoji);
    setFlash(emoji);
    setTimeout(() => setFlash((f) => (f === emoji ? null : f)), 500);
    // A short buzz makes the tap feel like it landed on a phone where the
    // reaction itself only shows up on the teacher's screen.
    navigator.vibrate?.(12);
  };

  return (
    <div>
      <p className="mb-2 text-center text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            disabled={disabled}
            onClick={() => send(emoji as Reaction)}
            aria-label={'Send ' + emoji}
            className={[
              'grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-white/5 text-2xl',
              'transition hover:bg-white/10 active:scale-90 disabled:opacity-30',
              flash === emoji ? 'scale-110 border-brand-400/60 bg-brand-500/20' : '',
            ].join(' ')}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
