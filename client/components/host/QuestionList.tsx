'use client';

import type { Question } from '@/lib/types';

const TYPE_LABEL: Record<Question['type'], string> = {
  multiple: 'MC',
  truefalse: 'T/F',
  short: 'Txt',
};

const TYPE_TONE: Record<Question['type'], string> = {
  multiple: 'bg-brand-500/15 text-brand-300',
  truefalse: 'bg-sky-500/15 text-sky-300',
  short: 'bg-emerald-500/15 text-emerald-300',
};

export function isIncomplete(q: Question) {
  if (!q.text.trim()) return true;
  if (q.type === 'short') return !(q.acceptedAnswers ?? []).some((a) => a.trim());
  return q.options.filter((o) => o.text.trim() || o.image).length < 2;
}

/**
 * The question rail.
 *
 * Previously every question was rendered as a fully expanded card, so a
 * six-question quiz was 127 form controls over six screens of scroll. Here a
 * question is one compact row and only the selected one opens an editor - the
 * whole quiz is visible at a glance and reorderable without hunting.
 */
export function QuestionList({
  questions,
  selectedIndex,
  onSelect,
  onMove,
  onDelete,
  onAdd,
}: {
  questions: Question[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onMove: (index: number, delta: number) => void;
  onDelete: (index: number) => void;
  onAdd: (type: Question['type']) => void;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="mb-3 flex items-baseline gap-2 px-1">
        <span className="eyebrow">Questions</span>
        <span className="ml-auto text-sm font-semibold text-slate-500 nums">{questions.length}</span>
      </div>

      <ol className="min-h-0 min-w-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {questions.map((q, i) => {
          const active = i === selectedIndex;
          const needsWork = isIncomplete(q);

          return (
            <li key={q.id}>
              <div
                className={
                  'group relative flex min-w-0 items-center gap-2.5 rounded-xl border px-2.5 py-2.5 transition ' +
                  (active
                    ? 'border-brand-500/50 bg-brand-500/10'
                    : 'border-transparent bg-white/[0.03] hover:border-white/10 hover:bg-white/[0.06]')
                }
              >
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline-none"
                  aria-current={active}
                >
                  <span
                    className={
                      'grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold nums ' +
                      (active ? 'bg-brand-500 text-white' : 'bg-white/[0.07] text-slate-400')
                    }
                  >
                    {i + 1}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span
                      className={
                        'block truncate text-[13.5px] leading-tight ' +
                        (q.text.trim() ? 'text-slate-200' : 'italic text-slate-600')
                      }
                    >
                      {q.text.trim() || 'Untitled question'}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5">
                      <span
                        className={
                          'rounded px-1.5 py-0.5 text-[10px] font-bold ' + TYPE_TONE[q.type]
                        }
                      >
                        {TYPE_LABEL[q.type]}
                      </span>
                      <span className="text-[11px] text-slate-500 nums">
                        {q.timeLimitSec}s · {q.points}
                      </span>
                      {needsWork && (
                        <span
                          className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                          title="Needs text and an answer"
                        />
                      )}
                    </span>
                  </span>
                </button>

                {/* Hidden until hover so the rail reads as a list, not a
                    toolbar - but ONLY on devices that can hover. A touchscreen
                    has no hover state, so on a phone these would simply never
                    appear and the questions could not be reordered at all. */}
                <div
                  className={
                    'flex shrink-0 flex-col gap-0.5 transition ' +
                    (active
                      ? 'opacity-100'
                      : 'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100')
                  }
                >
                  <button
                    type="button"
                    onClick={() => onMove(i, -1)}
                    disabled={i === 0}
                    aria-label={'Move question ' + (i + 1) + ' up'}
                    className="rounded px-2 py-0.5 text-[10px] leading-none text-slate-500 transition hover:text-slate-100 disabled:opacity-20"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(i, 1)}
                    disabled={i === questions.length - 1}
                    aria-label={'Move question ' + (i + 1) + ' down'}
                    className="rounded px-2 py-0.5 text-[10px] leading-none text-slate-500 transition hover:text-slate-100 disabled:opacity-20"
                  >
                    ▼
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onDelete(i)}
                  disabled={questions.length === 1}
                  aria-label={'Delete question ' + (i + 1)}
                  className={
                    'shrink-0 rounded px-2 py-1 text-xs text-slate-600 transition hover:text-rose-300 disabled:opacity-0 ' +
                    (active
                      ? 'opacity-100'
                      : 'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100')
                  }
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <AddButton label="Choice" onClick={() => onAdd('multiple')} />
        <AddButton label="True/False" onClick={() => onAdd('truefalse')} />
        <AddButton label="Text" onClick={() => onAdd('short')} />
      </div>
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-dashed border-white/[0.12] px-2 py-2.5 text-[12px] font-semibold text-slate-400 transition hover:border-brand-500/50 hover:bg-brand-500/10 hover:text-brand-200"
    >
      <span className="mr-1">+</span>
      {label}
    </button>
  );
}
