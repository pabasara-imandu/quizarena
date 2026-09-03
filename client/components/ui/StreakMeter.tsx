'use client';

import { useEffect, useRef, useState } from 'react';

/** Mirrors the server's scoring model exactly - see server/src/game/scoring.js. */
const MAX_STEPS = 4;
const STEP = 0.25;

export function multiplierFor(streak: number) {
  return 1 + Math.min(Math.max(streak - 1, 0), MAX_STEPS) * STEP;
}

const formatMultiplier = (m: number) => (Number.isInteger(m) ? m + '×' : m.toFixed(2).replace(/0$/, '') + '×');

/**
 * Streak multiplier meter.
 *
 * Four pips, one per multiplier step. The point is that a student can see at a
 * glance both what their next correct answer is worth *and* what they stand to
 * lose - which is what makes a streak feel like something worth protecting.
 */
export function StreakMeter({
  streak,
  compact = false,
  broken = false,
}: {
  streak: number;
  compact?: boolean;
  broken?: boolean;
}) {
  const multiplier = multiplierFor(streak);
  const filled = Math.min(Math.max(streak - 1, 0), MAX_STEPS);
  const atCap = filled >= MAX_STEPS;

  // Flash when the multiplier actually changes, so the number is not something
  // the student has to notice on their own.
  const [pulse, setPulse] = useState(false);
  const previous = useRef(multiplier);
  useEffect(() => {
    if (previous.current !== multiplier) {
      previous.current = multiplier;
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 600);
      return () => clearTimeout(t);
    }
  }, [multiplier]);

  if (broken && streak === 0) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
        <span aria-hidden>💔</span>
        <span>Streak lost — back to 1×</span>
      </div>
    );
  }

  if (streak < 2) {
    return compact ? null : (
      <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
        <span aria-hidden>🔥</span>
        <span>Get two right in a row to start a multiplier</span>
      </div>
    );
  }

  return (
    <div
      className={[
        'flex items-center gap-3 rounded-xl border px-3 py-2 transition',
        atCap
          ? 'border-amber-400/40 bg-amber-500/15'
          : 'border-orange-400/30 bg-orange-500/10',
        pulse ? 'scale-[1.03]' : '',
      ].join(' ')}
      role="status"
      aria-label={'Streak ' + streak + ', scoring at ' + formatMultiplier(multiplier)}
    >
      <span className={'text-xl ' + (pulse ? 'animate-pop' : '')} aria-hidden>
        🔥
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={
              'font-display text-lg font-extrabold tabular-nums ' +
              (atCap ? 'text-amber-200' : 'text-orange-200')
            }
          >
            {formatMultiplier(multiplier)}
          </span>
          <span className="truncate text-xs text-slate-400">
            {streak} in a row{atCap ? ' — max multiplier' : ''}
          </span>
        </div>

        <div className="mt-1.5 flex gap-1" aria-hidden>
          {Array.from({ length: MAX_STEPS }, (_, i) => (
            <span
              key={i}
              className={
                'h-1.5 flex-1 rounded-full transition-colors duration-300 ' +
                (i < filled ? (atCap ? 'bg-amber-300' : 'bg-orange-400') : 'bg-white/15')
              }
            />
          ))}
        </div>
      </div>

      {!atCap && !compact && (
        <span className="shrink-0 text-right text-xs leading-tight text-slate-400">
          next
          <br />
          <b className="text-slate-200">{formatMultiplier(multiplierFor(streak + 1))}</b>
        </span>
      )}
    </div>
  );
}
