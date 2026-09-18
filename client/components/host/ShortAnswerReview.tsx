'use client';

import { useMemo, useState } from 'react';
import { TYPED_TYPES, type Analytics } from '@/lib/types';
import { useT } from '@/lib/i18n';

export interface RegradeChange {
  questionId: string;
  key: string;
  correct: boolean;
  points: number | null;
}

const idFor = (questionId: string, key: string) => JSON.stringify([questionId, key]);

/**
 * Marking free text by hand, after the fact.
 *
 * A short-answer question is graded against a list the teacher wrote before
 * the lesson, which is a guess at every spelling thirty students might use.
 * "H.T.T.P.", a right answer phrased sideways, a missing hyphen - all marked
 * wrong by a list that was never going to be complete. This is where that gets
 * put right.
 *
 * Corrections are staged rather than applied on each click: the host works
 * down the list, then commits once. Scores are rebuilt in a single pass, so
 * the leaderboard never flickers through half-marked states in front of a
 * class, and one mis-click is undone by clicking it back before committing.
 */
export function ShortAnswerReview({
  data,
  onApply,
  busy,
}: {
  data: Analytics;
  onApply: (changes: RegradeChange[]) => Promise<void>;
  busy: boolean;
}) {
  const t = useT();
  const questions = useMemo(
    () => data.perQuestion.filter((q) => TYPED_TYPES.includes(q.type) && (q.textResponses?.length ?? 0) > 0),
    [data]
  );

  const [draft, setDraft] = useState<Record<string, { correct: boolean; points: string }>>({});

  const changes: RegradeChange[] = [];
  for (const q of questions) {
    for (const r of q.textResponses ?? []) {
      const staged = draft[idFor(q.questionId, r.key)];
      if (!staged) continue;
      const marksTyped = staged.points.trim() !== '';
      if (staged.correct === r.correct && !marksTyped) continue;
      changes.push({
        questionId: q.questionId,
        key: r.key,
        correct: staged.correct,
        points: marksTyped ? Number(staged.points) : null,
      });
    }
  }

  const commit = async () => {
    if (changes.length === 0) return;
    await onApply(changes);
    setDraft({});
  };

  if (questions.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-slate-600">
        {t('rm.none')}
        <br />
        {t('rm.noneDetail')}
      </p>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <p className="rounded-xl bg-brand-500/[0.07] px-4 py-3 text-[13px] leading-relaxed text-slate-400">
        {t('rm.intro')}
      </p>

      {questions.map((q) => (
        <div key={q.questionId} className="surface p-4">
          <div className="flex items-baseline gap-2">
            <span className="chip-brand nums shrink-0">Q{q.position + 1}</span>
            <h3 className="min-w-0 flex-1 font-semibold">{q.text}</h3>
            <span className="shrink-0 text-xs text-slate-500 nums">{t('rm.pts', { n: q.points })}</span>
          </div>

          {q.acceptedAnswers && (
            <p className="mt-2 text-xs text-emerald-300/80">
              {t('rm.markedAgainst', { key: q.acceptedAnswers.join(' · ') })}
            </p>
          )}
          {q.type === 'numeric' && q.answer != null && (
            <p className="mt-2 text-xs text-emerald-300/80">
              {t('rm.markedAgainst', {
                key: String(q.answer) + (q.tolerance ? ' ± ' + q.tolerance : '') + (q.unit ? ' ' + q.unit : ''),
              })}
            </p>
          )}

          <ul className="mt-3 space-y-1.5">
            {(q.textResponses ?? []).map((r) => {
              const id = idFor(q.questionId, r.key);
              const staged = draft[id];
              const correct = staged ? staged.correct : r.correct;
              const marks = staged?.points ?? '';
              const dirty = staged && (staged.correct !== r.correct || staged.points.trim() !== '');

              const set = (patch: Partial<{ correct: boolean; points: string }>) =>
                setDraft((d) => ({
                  ...d,
                  [id]: { correct, points: marks, ...patch },
                }));

              return (
                <li
                  key={r.key}
                  className={
                    'flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 transition ' +
                    (dirty
                      ? 'border-brand-500/50 bg-brand-500/[0.09]'
                      : 'border-transparent bg-mist/[0.04]')
                  }
                >
                  <span className="min-w-0 flex-1 basis-40 truncate text-sm">
                    {r.display}
                    {r.regraded && !dirty && (
                      <span className="ml-2 text-[11px] text-slate-600">{t('rm.remarked')}</span>
                    )}
                  </span>

                  <span className="shrink-0 text-xs text-slate-500 nums">
                    ×{r.count}
                  </span>

                  {/* Two explicit buttons rather than a switch: "is this right?"
                      is the question being asked, and a half-lit toggle is a
                      poor way to ask it. */}
                  <span className="flex shrink-0 overflow-hidden rounded-lg border border-mist/10">
                    <button
                      type="button"
                      aria-pressed={correct}
                      onClick={() => set({ correct: true })}
                      className={
                        'px-2.5 py-1 text-[12px] font-semibold transition ' +
                        (correct
                          ? 'bg-emerald-500/25 text-emerald-200'
                          : 'text-slate-500 hover:bg-mist/[0.06]')
                      }
                    >
                      {t('rm.correct')}
                    </button>
                    <button
                      type="button"
                      aria-pressed={!correct}
                      onClick={() => set({ correct: false })}
                      className={
                        'px-2.5 py-1 text-[12px] font-semibold transition ' +
                        (!correct
                          ? 'bg-rose-500/25 text-rose-200'
                          : 'text-slate-500 hover:bg-mist/[0.06]')
                      }
                    >
                      {t('rm.wrong')}
                    </button>
                  </span>

                  <input
                    type="number"
                    min={0}
                    max={100000}
                    inputMode="numeric"
                    disabled={!correct}
                    value={marks}
                    onChange={(e) => set({ points: e.target.value })}
                    placeholder={t('rm.auto')}
                    aria-label={t('rm.marksFor', { answer: r.display })}
                    className="field w-20 shrink-0 px-2 py-1 text-[13px] nums disabled:opacity-30"
                  />
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {/* Fixed, because the list is long and the commit must never be a scroll
          hunt - the same reason the live controls are pinned. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-mist/[0.07] bg-ink-950/92 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-[13px] text-slate-500">
            {changes.length === 0 ? t('rm.noneStaged') : t.n('rm.ready', changes.length)}
          </span>
          {changes.length > 0 && (
            <button
              type="button"
              className="btn-ghost shrink-0"
              onClick={() => setDraft({})}
              disabled={busy}
            >
              {t('rm.discard')}
            </button>
          )}
          <button
            type="button"
            className="btn-primary btn-lg shrink-0"
            onClick={commit}
            disabled={busy || changes.length === 0}
          >
            {busy ? t('rm.updating') : t('rm.update')}
          </button>
        </div>
      </div>
    </div>
  );
}
