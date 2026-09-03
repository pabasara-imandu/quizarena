'use client';

import { useCountdown } from '@/lib/useCountdown';

/**
 * Ring countdown. Colour shifts green → amber → red as time runs out, and the
 * ring pulses in the last five seconds so the urgency reads from across a room
 * without needing anyone to parse the number.
 */
export function Countdown({
  endAt,
  totalMs,
  size = 96,
}: {
  endAt: number | null;
  totalMs: number | null;
  size?: number;
}) {
  const { seconds, progress } = useCountdown(endAt, totalMs);
  const stroke = size >= 100 ? 7 : 6;
  const radius = size / 2 - stroke - 1;
  const circumference = 2 * Math.PI * radius;

  const colour = progress > 0.5 ? '#34d399' : progress > 0.2 ? '#fbbf24' : '#fb7185';
  const urgent = seconds <= 5 && seconds > 0;

  return (
    <div
      className={'relative shrink-0 ' + (urgent ? 'animate-breathe' : '')}
      style={{ width: size, height: size }}
      role="timer"
      aria-live="off"
      aria-label={seconds + ' seconds remaining'}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          style={{ filter: 'drop-shadow(0 0 6px ' + colour + '55)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span
          className="font-display font-extrabold nums"
          style={{ color: colour, fontSize: size * 0.32 }}
        >
          {seconds}
        </span>
      </div>
    </div>
  );
}
