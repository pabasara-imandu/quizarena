'use client';

import { useEffect, useRef, useState } from 'react';
import { useSocket } from './socket';

/**
 * A countdown driven by the *server's* clock.
 *
 * The server never streams ticks - it sends `startAt`/`endAt` once, and every
 * client animates locally against corrected server time. That is what keeps a
 * 100-player room at one broadcast per question instead of 3,000.
 */
export function useCountdown(endAt: number | null, totalMs: number | null) {
  const { serverNow } = useSocket();
  const [remainingMs, setRemainingMs] = useState(() =>
    endAt ? Math.max(0, endAt - serverNow()) : 0
  );
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!endAt) {
      setRemainingMs(0);
      return;
    }

    let mounted = true;
    const tick = () => {
      if (!mounted) return;
      const left = Math.max(0, endAt - serverNow());
      setRemainingMs(left);
      if (left > 0) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);

    return () => {
      mounted = false;
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [endAt, serverNow]);

  const seconds = Math.ceil(remainingMs / 1000);
  const progress = totalMs && totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;

  return { remainingMs, seconds, progress, expired: !!endAt && remainingMs <= 0 };
}
