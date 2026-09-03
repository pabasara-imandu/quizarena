'use client';

import type { LeaderboardRow } from '@/lib/types';

const MEDALS = ['🥇', '🥈', '🥉'];

export function Leaderboard({
  rows,
  highlightId,
  compact,
}: {
  rows: LeaderboardRow[];
  highlightId?: string | null;
  compact?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-600">No scores yet.</p>;
  }

  const leader = rows[0]?.score || 1;

  return (
    <ol className="space-y-1.5">
      {rows.map((row) => {
        const mine = row.id === highlightId;
        // A share-of-leader bar turns a column of numbers into something
        // readable at a glance from the back of a classroom.
        const share = Math.max(6, Math.round((row.score / leader) * 100));

        return (
          <li
            key={row.id}
            className={
              'relative animate-rise overflow-hidden rounded-xl transition ' +
              (mine ? 'ring-1 ring-brand-400/60' : '')
            }
          >
            <span
              className={
                'absolute inset-y-0 left-0 transition-all duration-700 ease-out ' +
                (mine ? 'bg-brand-500/25' : 'bg-white/[0.06]')
              }
              style={{ width: share + '%' }}
              aria-hidden
            />

            <div className="relative flex items-center gap-2.5 px-3 py-2.5">
              <span className="w-6 shrink-0 text-center font-display text-base font-bold nums">
                {MEDALS[row.rank - 1] ?? <span className="text-slate-500">{row.rank}</span>}
              </span>

              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {row.nickname}
                {mine && <span className="ml-1.5 text-[11px] text-brand-300">you</span>}
                {!row.connected && (
                  <span className="ml-1.5 text-[11px] text-slate-600" title="Disconnected">
                    offline
                  </span>
                )}
              </span>

              {!compact && row.streak > 1 && (
                <span className="shrink-0 text-[11px] text-orange-300">🔥{row.streak}</span>
              )}

              <span className="shrink-0 font-display text-base font-bold nums">
                {row.score.toLocaleString()}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
