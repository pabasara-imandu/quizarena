'use client';

import type { Question } from '@/lib/types';
import { useT } from '@/lib/i18n';

const TYPE_TONE: Record<Question['type'], string> = {
  multiple: 'bg-brand-500/15 text-brand-300',
  multiselect: 'bg-brand-500/15 text-brand-300',
  truefalse: 'bg-sky-500/15 text-sky-300',
  short: 'bg-emerald-500/15 text-emerald-300',
  numeric: 'bg-emerald-500/15 text-emerald-300',
  ordering: 'bg-amber-500/15 text-amber-300',
  poll: 'bg-slate-500/20 text-slate-300',
};

/** What "not finished" means for each type - the launch button is gated on this. */
export function isIncomplete(q: Question) {
  if (!q.text.trim()) return true;
  if (q.type === 'short') return !(q.acceptedAnswers ?? []).some((a) => a.trim());
  if (q.type === 'numeric') return !Number.isFinite(q.answer);
  const filled = q.options.filter((o) => o.text.trim() || o.image);
  if (filled.length < 2) return true;
  if (q.type === 'multiple' || q.type === 'truefalse' || q.type === 'multiselect') {
    return !q.options.some((o) => o.correct);
  }
  return false; // ordering and polls need only their tiles
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
  onAdd: () => void;
}) {
  const t = useT();
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="mb-3 flex items-baseline gap-2 px-1">
        <span className="eyebrow">{t('rail.questions')}</span>
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
                      {q.text.trim() || t('rail.untitled')}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5">
                      <span
                        className={
                          'rounded px-1.5 py-0.5 text-[10px] font-bold ' + TYPE_TONE[q.type]
                        }
                      >
                        {t(('rail.type.' + q.type) as 'rail.type.multiple')}
                      </span>
                      <span className="text-[11px] text-slate-500 nums">
                        {q.timeLimitSec}s · {q.points}
                      </span>
                      {needsWork && (
                        <span
                          className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                          title={t('rail.needsWork')}
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
                    aria-label={t('rail.moveUp', { n: i + 1 })}
                    className="rounded px-2 py-0.5 text-[10px] leading-none text-slate-500 transition hover:text-slate-100 disabled:opacity-20"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(i, 1)}
                    disabled={i === questions.length - 1}
                    aria-label={t('rail.moveDown', { n: i + 1 })}
                    className="rounded px-2 py-0.5 text-[10px] leading-none text-slate-500 transition hover:text-slate-100 disabled:opacity-20"
                  >
                    ▼
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onDelete(i)}
                  disabled={questions.length === 1}
                  aria-label={t('rail.delete', { n: i + 1 })}
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

      {/* One button. The question's type is chosen in the editor, where the
          choice can be changed later - three type buttons here stopped
          scaling the moment there were seven types. */}
      <button
        type="button"
        onClick={onAdd}
        className="mt-3 w-full rounded-xl border border-dashed border-white/[0.12] px-3 py-2.5 text-[13px] font-semibold text-slate-400 transition hover:border-brand-500/50 hover:bg-brand-500/10 hover:text-brand-200"
      >
        {t('rail.add')}
      </button>
    </div>
  );
}
