'use client';

export type ResultStatus = 'correct' | 'incorrect' | 'skipped' | 'timeout';

/** Everything the reveal needs to dress itself, keyed off one status. */
export const RESULT_TONE: Record<
  ResultStatus,
  { stroke: string; wash: string; tint: string; ring: string; title: string; text: string }
> = {
  correct: {
    stroke: '#34d399',
    wash: 'rgba(16,185,129,0.55)',
    tint: 'bg-emerald-500/[0.10]',
    ring: 'border-emerald-400/40',
    title: 'Correct!',
    text: 'text-emerald-200',
  },
  incorrect: {
    stroke: '#fb7185',
    wash: 'rgba(244,63,94,0.40)',
    tint: 'bg-rose-500/[0.08]',
    ring: 'border-rose-400/30',
    title: 'Not this time',
    text: 'text-rose-200',
  },
  skipped: {
    stroke: '#fbbf24',
    wash: 'rgba(245,158,11,0.32)',
    tint: 'bg-amber-500/[0.07]',
    ring: 'border-amber-400/30',
    title: 'Skipped',
    text: 'text-amber-200',
  },
  timeout: {
    stroke: '#94a3b8',
    wash: 'rgba(148,163,184,0.26)',
    tint: 'bg-white/[0.04]',
    ring: 'border-white/10',
    title: 'Time ran out',
    text: 'text-slate-300',
  },
};

// Circumference of the r=24 ring, so the dash animation covers it exactly.
const RING = 151;

/**
 * The result mark: a ring that draws itself, then a tick (or cross, or bar)
 * drawn inside it.
 *
 * This replaced a scale-in "pop" with a big emoji. A drawn stroke reads as the
 * app *responding* to what the student did, and the tick lands a beat after the
 * ring — which is the moment that actually feels like a verdict. It also scales
 * to a projector far better than an emoji glyph, whose rendering varies by
 * platform.
 */
export function ResultMark({ status, size = 92 }: { status: ResultStatus; size?: number }) {
  const { stroke } = RESULT_TONE[status];

  return (
    <svg
      viewBox="0 0 52 52"
      width={size}
      height={size}
      className="mx-auto block"
      role="img"
      aria-label={RESULT_TONE[status].title}
      style={{ filter: 'drop-shadow(0 0 14px ' + stroke + '55)' }}
    >
      <circle
        cx="26"
        cy="26"
        r="24"
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={RING}
        strokeDashoffset={RING}
        className="mark-stroke"
        style={{ ['--dur' as string]: '520ms', ['--delay' as string]: '60ms' }}
        transform="rotate(-90 26 26)"
      />

      {status === 'correct' && (
        <path
          d="M14.5 26.5 L22.5 34.5 L37.5 18.5"
          fill="none"
          stroke={stroke}
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="42"
          strokeDashoffset="42"
          className="mark-stroke"
          style={{ ['--dur' as string]: '340ms', ['--delay' as string]: '460ms' }}
        />
      )}

      {status === 'incorrect' && (
        <>
          <path
            d="M18 18 L34 34"
            fill="none"
            stroke={stroke}
            strokeWidth="3.6"
            strokeLinecap="round"
            strokeDasharray="23"
            strokeDashoffset="23"
            className="mark-stroke"
            style={{ ['--dur' as string]: '220ms', ['--delay' as string]: '440ms' }}
          />
          <path
            d="M34 18 L18 34"
            fill="none"
            stroke={stroke}
            strokeWidth="3.6"
            strokeLinecap="round"
            strokeDasharray="23"
            strokeDashoffset="23"
            className="mark-stroke"
            style={{ ['--dur' as string]: '220ms', ['--delay' as string]: '620ms' }}
          />
        </>
      )}

      {status === 'skipped' && (
        <path
          d="M19 19 L28 26 L19 33 M33 19 L33 33"
          fill="none"
          stroke={stroke}
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="46"
          strokeDashoffset="46"
          className="mark-stroke"
          style={{ ['--dur' as string]: '320ms', ['--delay' as string]: '460ms' }}
        />
      )}

      {status === 'timeout' && (
        <path
          d="M26 15 L26 26 L34 30"
          fill="none"
          stroke={stroke}
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="22"
          strokeDashoffset="22"
          className="mark-stroke"
          style={{ ['--dur' as string]: '340ms', ['--delay' as string]: '460ms' }}
        />
      )}
    </svg>
  );
}
