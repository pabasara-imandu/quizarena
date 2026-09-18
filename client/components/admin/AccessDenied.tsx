'use client';

/**
 * What someone who is not an admin sees: a lock that draws itself, shakes
 * once, and stays shut. No explanation and no instructions - a page that
 * tells a stranger which file to edit is telling them too much.
 */
export function AccessDenied({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <svg
        viewBox="0 0 64 64"
        width={104}
        height={104}
        role="img"
        aria-label="Access denied"
        className="access-lock"
        style={{ filter: 'drop-shadow(0 0 16px rgba(244,63,94,0.35))' }}
      >
        {/* The ring draws first, then the lock closes over it. */}
        <circle
          cx="32"
          cy="32"
          r="29"
          fill="none"
          stroke="#fb7185"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="183"
          strokeDashoffset="183"
          className="mark-stroke"
          style={{ ['--dur' as string]: '520ms', ['--delay' as string]: '60ms' }}
          transform="rotate(-90 32 32)"
        />
        <g className="access-lock-body">
          <rect x="20" y="29" width="24" height="18" rx="4" fill="#fb7185" />
          <circle cx="32" cy="38" r="2.4" fill="#0b0b12" />
        </g>
        <path
          className="access-lock-shackle"
          d="M24 29 V23 a8 8 0 0 1 16 0 V29"
          fill="none"
          stroke="#fb7185"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
      </svg>

      <p className="access-denied-text mt-5 font-display text-2xl font-extrabold text-rose-200">
        Access denied
      </p>

      <button
        type="button"
        onClick={onRetry}
        className="access-denied-text mt-8 text-xs text-slate-600 transition hover:text-slate-400"
        style={{ animationDelay: '1.6s' }}
      >
        sign out
      </button>
    </div>
  );
}
