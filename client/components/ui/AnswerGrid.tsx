'use client';

import type { Option } from '@/lib/types';

/**
 * Kahoot-style answer tiles.
 *
 * These stay vivid while the rest of the interface stays quiet — the tiles are
 * the one thing a room of thirty people looks at from across a hall, and the
 * colour is what makes the game feel like a game.
 *
 * Colour is paired with a distinct shape glyph on purpose: roughly 1 in 12 boys
 * is red-green colourblind, and "the red one" is not a usable instruction in a
 * classroom. Shape, colour and text always agree.
 */
const TILES = [
  { bg: 'bg-rose-500', hover: 'hover:bg-rose-400', ring: 'ring-rose-300/60', glyph: '▲' },
  { bg: 'bg-sky-500', hover: 'hover:bg-sky-400', ring: 'ring-sky-300/60', glyph: '◆' },
  { bg: 'bg-amber-500', hover: 'hover:bg-amber-400', ring: 'ring-amber-300/60', glyph: '●' },
  { bg: 'bg-emerald-500', hover: 'hover:bg-emerald-400', ring: 'ring-emerald-300/60', glyph: '■' },
  { bg: 'bg-violet-500', hover: 'hover:bg-violet-400', ring: 'ring-violet-300/60', glyph: '★' },
  { bg: 'bg-orange-500', hover: 'hover:bg-orange-400', ring: 'ring-orange-300/60', glyph: '⬟' },
];

interface Props {
  options: Option[];
  onSelect?: (optionId: string) => void;
  selectedId?: string | null;
  /** After the reveal: which ids were right, so we can dim the wrong ones. */
  correctIds?: string[] | null;
  disabled?: boolean;
  /** Host view: live answer counts under each tile. */
  counts?: Record<string, number> | null;
  totalAnswers?: number;
}

export function AnswerGrid({
  options,
  onSelect,
  selectedId,
  correctIds,
  disabled,
  counts,
  totalAnswers,
}: Props) {
  const revealed = !!correctIds;
  const interactive = !!onSelect && !disabled;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {options.map((option, i) => {
        const tile = TILES[i % TILES.length];
        const isCorrect = revealed && correctIds!.includes(option.id);
        const isChosen = selectedId === option.id;
        const dimmed = revealed && !isCorrect;
        const count = counts?.[option.id] ?? 0;
        const share = totalAnswers ? Math.round((count / totalAnswers) * 100) : 0;

        return (
          <button
            key={option.id}
            type="button"
            disabled={!interactive}
            onClick={() => onSelect?.(option.id)}
            aria-pressed={isChosen}
            className={[
              'group relative overflow-hidden rounded-2xl p-4 text-left font-semibold text-white',
              'shadow-soft transition-all duration-300 focus:outline-none focus-visible:ring-4',
              tile.bg,
              tile.ring,
              interactive ? tile.hover + ' hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.98]' : '',
              dimmed ? 'scale-[0.98] opacity-30 saturate-50' : '',
              isCorrect ? 'scale-[1.02] ring-4 ring-white/90' : '',
              isChosen && !revealed ? 'ring-4 ring-white/80' : '',
              !interactive && !revealed ? 'cursor-default' : '',
            ].join(' ')}
          >
            {/* Live distribution bar for the host view. */}
            {counts && (
              <span
                className="absolute inset-y-0 left-0 bg-black/25 transition-all duration-700 ease-out"
                style={{ width: share + '%' }}
                aria-hidden
              />
            )}

            <span className="relative flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-black/20 text-lg">
                {tile.glyph}
              </span>

              {option.image && (
                <img
                  src={option.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    // A dead image must not leave a broken-icon hole in the tile.
                    e.currentTarget.style.display = 'none';
                  }}
                  className="h-16 w-16 shrink-0 rounded-xl bg-black/20 object-cover sm:h-20 sm:w-20"
                />
              )}

              <span className="flex-1 text-[17px] leading-snug sm:text-lg">{option.text}</span>

              {isChosen && !revealed && (
                <span className="shrink-0 text-xs font-bold uppercase tracking-wide opacity-90">
                  yours
                </span>
              )}
              {isCorrect && <span className="shrink-0 text-2xl">✓</span>}
              {counts && (
                <span className="shrink-0 text-right text-sm leading-tight opacity-95 nums">
                  <b className="block text-base">{count}</b>
                  {share}%
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
