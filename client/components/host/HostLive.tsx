'use client';

import { useState } from 'react';
import { AnswerGrid } from '@/components/ui/AnswerGrid';
import { Countdown } from '@/components/ui/Countdown';
import { Leaderboard } from '@/components/ui/Leaderboard';
import { QuestionMedia } from '@/components/ui/QuestionMedia';
import { ReactionOverlay } from '@/components/host/ReactionOverlay';
import { Segmented } from '@/components/ui/Toggle';
import { useT, type Translator } from '@/lib/i18n';
import type {
  HostSync,
  IntegrityEntry,
  LeaderboardRow,
  LiveQuestion,
  Phase,
  TextResponse,
} from '@/lib/types';

export interface RevealState {
  index: number;
  type: string;
  neutral?: boolean;
  correctOptionIds: string[];
  acceptedAnswers: string[] | null;
  answer?: number | null;
  tolerance?: number | null;
  unit?: string | null;
  explanation?: string | null;
  distribution: Record<string, number>;
  textResponses: TextResponse[] | null;
  answeredTotal: number;
  correctTotal: number;
  skippedTotal: number;
  playerCount: number;
  accuracy: number;
  averageResponseMs: number | null;
  leaderboard: { top: LeaderboardRow[]; totalPlayers: number };
  isLastQuestion: boolean;
}

interface Props {
  phase: Phase;
  question: LiveQuestion | null;
  pendingIndex: number | null;
  totalQuestions: number;
  startAt: number | null;
  endAt: number | null;
  sync: HostSync | null;
  reveal: RevealState | null;
  leaderboard: LeaderboardRow[];
  integrity: IntegrityEntry[];
  reactionBurst: { reactions: { emoji: string; count: number }[]; at: number } | null;
  strikeLimit: number;
  autoAdvance?: boolean;
  /** Off means Next goes straight from the answers to the next question. */
  showLeaderboard?: boolean;
  onNext: () => void;
  onSkipTimer: () => void;
  onEnd: () => void;
  onClearStrikes: (playerId: string) => void;
  busy: boolean;
}

const integrityLabel = (t: Translator, type: IntegrityEntry['type']) =>
  t(('integ.' + type) as 'integ.tab_hidden');

const SERIOUS = new Set(['tab_hidden', 'fullscreen_exit', 'copy_attempt', 'devtools_suspected']);

export function HostLive({
  phase,
  question,
  pendingIndex,
  totalQuestions,
  endAt,
  sync,
  reveal,
  leaderboard,
  integrity,
  reactionBurst,
  strikeLimit,
  autoAdvance = false,
  showLeaderboard = true,
  onNext,
  onSkipTimer,
  onEnd,
  onClearStrikes,
  busy,
}: Props) {
  const t = useT();
  const [panel, setPanel] = useState<'scores' | 'activity'>('scores');

  const isLeadIn = phase === 'leadIn';
  const showingReveal = phase === 'reveal' || phase === 'leaderboard';

  // During the lead-in the previous question's numbers are meaningless, so the
  // counter is blanked rather than left showing a stale "12 / 12".
  const answered = isLeadIn ? 0 : (sync?.answeredCount ?? 0);
  const total = sync?.connectedCount ?? sync?.playerCount ?? 0;
  const flagged = (sync?.players ?? []).filter((p) => p.strikes > 0 || p.tabSwitches > 0);
  const paused = flagged.filter((p) => strikeLimit > 0 && p.strikes >= strikeLimit);
  const kind = question?.type;
  // Typed and ordered answers have no tiles to light up; the host sees the
  // answer key and a grouped list of what the class actually gave.
  const keyed = kind === 'short' || kind === 'numeric' || kind === 'ordering';
  const isPoll = kind === 'poll';
  const label = (id: string) => question?.options.find((o) => o.id === id)?.text ?? id;
  const answerKey =
    kind === 'short'
      ? (question?.acceptedAnswers ?? reveal?.acceptedAnswers ?? []).join('  ·  ')
      : kind === 'numeric'
        ? String(question?.answer ?? reveal?.answer ?? '') +
          (question?.tolerance || reveal?.tolerance ? ' ± ' + (question?.tolerance ?? reveal?.tolerance) : '') +
          (question?.unit || reveal?.unit ? ' ' + (question?.unit ?? reveal?.unit) : '')
        : kind === 'ordering'
          ? question?.options.map((o) => o.text).join('  →  ')
          : '';

  const nextLabel = isLeadIn
    ? t('live.startNow')
    : phase === 'question'
      ? t('live.closeQuestion')
      : phase === 'reveal' && showLeaderboard
        ? t('live.showLeaderboard')
        : reveal?.isLastQuestion
          ? t('live.finish')
          : t('live.next');

  return (
    <>
      {/* Clears the fixed control bar so the last row of the leaderboard and
          the End quiz button are never stuck underneath each other. */}
      <div className="grid gap-5 pb-24 lg:grid-cols-[1fr_320px] lg:items-start">
      <ReactionOverlay bursts={reactionBurst} />

      {/* -------------------------------------------------------- main stage */}
      <div className="space-y-4">
        <div className="surface overflow-hidden">
          {isLeadIn ? (
            /* The lead-in used to keep showing the previous question for three
               seconds. It now shows only what is true: what is coming next. */
            <div className="flex flex-col items-center px-6 py-20 text-center">
              <p className="eyebrow">{t('live.comingUp')}</p>
              <p className="mt-3 font-display text-5xl font-extrabold sm:text-6xl">
                {t('live.questionN', { n: (pendingIndex ?? 0) + 1 })}
                <span className="text-slate-700"> / {totalQuestions}</span>
              </p>
              <p className="mt-5 animate-breathe font-display text-lg font-semibold text-brand-300">
                {t('live.getReady')}
              </p>
            </div>
          ) : (
            <div className="px-5 py-5 sm:px-7 sm:py-6">
              <div className="flex items-start gap-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="chip-brand nums">
                      {(question?.index ?? 0) + 1} / {question?.total ?? totalQuestions}
                    </span>
                    {question && !isPoll && (
                      <span className="chip-neutral nums">{t('live.pts', { n: question.points })}</span>
                    )}
                    {kind === 'short' && <span className="chip-good">{t('live.shortAnswer')}</span>}
                    {kind === 'numeric' && <span className="chip-good">{t('live.number')}</span>}
                    {kind === 'ordering' && <span className="chip-warn">{t('live.putInOrder')}</span>}
                    {kind === 'multiselect' && <span className="chip-brand">{t('live.selectAll')}</span>}
                    {isPoll && <span className="chip-neutral">{t('live.poll')}</span>}
                  </div>
                  <h2 className="mt-3 font-display text-2xl font-bold leading-tight sm:text-4xl">
                    {question?.text ?? t('live.gettingReady')}
                  </h2>
                </div>

                {phase === 'question' && (
                  <Countdown endAt={endAt} totalMs={question?.timeLimitMs ?? null} size={104} />
                )}
              </div>

              <QuestionMedia src={question?.image} className="mt-5" />
            </div>
          )}

          {/* Answer progress: the single most useful number while hosting. */}
          <div className="border-t border-white/[0.06] px-5 py-4 sm:px-7">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm text-slate-400">{t('live.answersIn')}</span>
              <span className="font-display text-xl font-bold nums">
                {answered}
                <span className="text-slate-600"> / {total}</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-400 transition-all duration-500"
                style={{ width: (total ? (answered / total) * 100 : 0) + '%' }}
              />
            </div>
          </div>
        </div>

        {/* Tile questions: the tiles, with live counts once revealed. A poll
            reveal shows counts and dims nothing - there is no wrong answer. */}
        {!isLeadIn && question && !keyed && (
          <AnswerGrid
            options={question.options}
            correctIds={showingReveal ? (reveal?.correctOptionIds ?? null) : null}
            neutral={isPoll}
            counts={showingReveal ? (reveal?.distribution ?? null) : null}
            totalAnswers={showingReveal ? reveal?.answeredTotal : undefined}
            disabled
          />
        )}

        {/* Keyed questions: the answer key, plus what the class actually gave. */}
        {!isLeadIn && keyed && (
          <div className="surface space-y-4 p-5">
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.08] px-4 py-3">
              <p className="eyebrow text-emerald-400/70">
                {kind === 'short'
                  ? t('live.acceptedAnswers')
                  : kind === 'numeric'
                    ? t('live.answer')
                    : t('live.correctOrder')}
              </p>
              <p className="mt-1 font-display text-lg font-semibold text-emerald-100">
                {answerKey || '—'}
              </p>
            </div>
            {showingReveal && (
              <TextDistribution
                responses={reveal?.textResponses ?? null}
                answered={reveal?.answeredTotal ?? 0}
              />
            )}
          </div>
        )}

        {/* The teacher's "why", surfaced with the answer so it can be read
            aloud while the class is still looking at the reveal. */}
        {showingReveal && (reveal?.explanation || question?.explanation) && (
          <div className="rounded-2xl border border-brand-400/20 bg-brand-500/[0.07] px-5 py-4">
            <p className="eyebrow text-brand-300/80">{t('live.why')}</p>
            <p className="mt-1 text-[15px] leading-relaxed text-slate-200">
              {reveal?.explanation ?? question?.explanation}
            </p>
          </div>
        )}

        {showingReveal && reveal && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {isPoll ? (
              <Stat label={t('live.votes')} value={String(reveal.answeredTotal)} />
            ) : (
              <Stat
                label={t('live.correct')}
                value={Math.round(reveal.accuracy * 100) + '%'}
                tone={reveal.accuracy < 0.4 ? 'bad' : reveal.accuracy > 0.75 ? 'good' : 'mid'}
              />
            )}
            <Stat label={t('live.answered')} value={reveal.answeredTotal + '/' + reveal.playerCount} />
            <Stat label={t('live.skipped')} value={String(reveal.skippedTotal ?? 0)} />
            <Stat
              label={t('live.avgTime')}
              value={
                reveal.averageResponseMs == null
                  ? '—'
                  : (reveal.averageResponseMs / 1000).toFixed(1) + 's'
              }
            />
          </div>
        )}

      </div>

      {/* ----------------------------------------------------------- sidebar */}
      {/* Capped and scrollable so a long roster cannot run down past the
          fixed control bar and hide its own last rows behind it. */}
      <aside className="surface p-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto">
        {/* One panel at a time. The old layout stacked the leaderboard and the
            integrity feed, so both were half-visible and neither was readable. */}
        <Segmented
          value={panel}
          onChange={setPanel}
          ariaLabel={t('live.sidebarAria')}
          options={[
            { value: 'scores', label: t('live.scores') },
            { value: 'activity', label: t('live.activity'), badge: integrity.length },
          ]}
        />

        <div className="mt-4">
          {panel === 'scores' ? (
            <Leaderboard rows={leaderboard.slice(0, 10)} compact />
          ) : (
            <div className="space-y-3">
              {paused.length > 0 && (
                <div className="rounded-xl border border-rose-400/25 bg-rose-500/[0.08] p-2.5">
                  <p className="eyebrow mb-1.5 text-rose-300/80">{t('live.pausedNeedsYou')}</p>
                  <ul className="space-y-1">
                    {paused.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">{p.nickname}</span>
                        <button
                          type="button"
                          className="shrink-0 rounded-lg bg-emerald-500/20 px-2 py-1 text-[11px] font-semibold text-emerald-300 transition hover:bg-emerald-500/30"
                          onClick={() => onClearStrikes(p.id)}
                        >
                          {t('live.letBackIn')}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {flagged.length > 0 && (
                <ul className="space-y-1">
                  {flagged
                    .filter((p) => !paused.includes(p))
                    .map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center gap-2 rounded-lg bg-amber-500/[0.08] px-2.5 py-1.5 text-sm"
                      >
                        <span className="min-w-0 flex-1 truncate text-amber-100">{p.nickname}</span>
                        <span className="shrink-0 text-[11px] text-amber-400/80 nums">
                          {p.strikes}/{strikeLimit || '∞'}
                        </span>
                      </li>
                    ))}
                </ul>
              )}

              <ul className="max-h-[52vh] space-y-0.5 overflow-y-auto pr-1 text-[13px]">
                {integrity
                  .slice()
                  .reverse()
                  .slice(0, 50)
                  .map((e) => (
                    <li
                      key={e.id}
                      className={
                        'flex gap-2 rounded px-1.5 py-1 ' +
                        (SERIOUS.has(e.type) ? 'text-amber-200/90' : 'text-slate-600')
                      }
                    >
                      <span className="shrink-0 text-[11px] opacity-60 nums">
                        {new Date(e.at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="min-w-0 flex-1 leading-snug">
                        <b className="font-semibold">{e.nickname}</b> {integrityLabel(t, e.type)}
                        {e.meta?.hiddenMs ? ' (' + Math.round(e.meta.hiddenMs / 1000) + 's)' : ''}
                      </span>
                    </li>
                  ))}
                {integrity.length === 0 && (
                  <li className="py-10 text-center text-slate-600">
                    {t('live.nothingFlagged')}
                    <br />
                    {t('live.onTask')}
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      </aside>
      </div>

      {/* Fixed to the viewport, not sticky inside the column.
          `sticky bottom-4` only holds while its own column is on screen, and
          the scores panel stacks below that column on a phone and outgrows it
          on a laptop - so the button to advance the quiz scrolled off the top
          at exactly the moment the host was reading the leaderboard and
          reaching for it. Fixed, it is always under the thumb. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-ink-950/92 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center gap-2">
          {/* Auto-advance does not take the button away - a host who wants to
              move on now should not have to wait out a timer they set for the
              class's benefit. */}
          {autoAdvance && showingReveal && (
            <span className="chip-good shrink-0 animate-breathe" title={t('live.autoTitle')}>
              {t('live.auto')}
            </span>
          )}
          {phase === 'question' && (
            <button
              className="btn-secondary shrink-0"
              type="button"
              onClick={onSkipTimer}
              disabled={busy}
            >
              <span className="sm:hidden">{t('live.skipTimer')}</span>
              <span className="hidden sm:inline">{t('live.skipTheTimer')}</span>
            </button>
          )}
          {/* Grows to fill a phone's width: the one control the host reaches
              for under time pressure should be the easiest thing to hit. */}
          <button
            className="btn-primary btn-lg min-w-0 flex-1 sm:flex-none"
            type="button"
            onClick={onNext}
            disabled={busy}
          >
            <span className="truncate">{nextLabel}</span>
          </button>
          <button className="btn-danger ml-auto shrink-0" type="button" onClick={onEnd} disabled={busy}>
            <span className="sm:hidden">{t('live.end')}</span>
            <span className="hidden sm:inline">{t('live.endQuiz')}</span>
          </button>
        </div>
      </div>
    </>
  );
}

/** What the class actually typed, most common first. */
function TextDistribution({
  responses,
  answered,
}: {
  responses: TextResponse[] | null;
  answered: number;
}) {
  const t = useT();
  if (!responses || responses.length === 0) {
    return <p className="py-4 text-center text-sm text-slate-600">{t('live.noWritten')}</p>;
  }

  return (
    <ul className="space-y-1.5">
      {responses.map((r) => {
        const share = answered ? (r.count / answered) * 100 : 0;
        return (
          <li key={r.key} className="relative overflow-hidden rounded-xl bg-white/[0.04] px-3 py-2.5">
            <span
              className={
                'absolute inset-y-0 left-0 transition-all duration-700 ' +
                (r.correct ? 'bg-emerald-500/25' : 'bg-rose-500/15')
              }
              style={{ width: share + '%' }}
              aria-hidden
            />
            <span className="relative flex items-center gap-2.5 text-sm">
              <span className="w-4 shrink-0 text-emerald-300">{r.correct ? '✓' : ''}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{r.display}</span>
              <span className="shrink-0 text-slate-400 nums">
                {r.count} · {Math.round(share)}%
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Stat({
  label,
  value,
  tone = 'mid',
}: {
  label: string;
  value: string;
  tone?: 'good' | 'mid' | 'bad';
}) {
  const colour =
    tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-rose-300' : 'text-slate-100';
  return (
    <div className="surface px-4 py-3 text-center">
      <p className={'font-display text-2xl font-bold nums ' + colour}>{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </div>
  );
}
