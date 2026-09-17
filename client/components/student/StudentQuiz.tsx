'use client';

import { AnswerGrid } from '@/components/ui/AnswerGrid';
import { Countdown } from '@/components/ui/Countdown';
import { Leaderboard } from '@/components/ui/Leaderboard';
import { QuestionMedia } from '@/components/ui/QuestionMedia';
import { ShortAnswer } from '@/components/ui/ShortAnswer';
import { OrderAnswer } from '@/components/ui/OrderAnswer';
import { StreakMeter } from '@/components/ui/StreakMeter';
import { EmojiBar } from '@/components/ui/EmojiBar';
import { ResultMark, RESULT_TONE, type ResultStatus } from '@/components/ui/ResultMark';
import { useCountdown } from '@/lib/useCountdown';
import { useT } from '@/lib/i18n';
import type { LeaderboardRow, LiveQuestion, Phase, PlayerResult, Reaction } from '@/lib/types';

interface Props {
  phase: Phase;
  question: LiveQuestion | null;
  startAt: number | null;
  endAt: number | null;
  nickname: string;
  score: number;
  streak: number;
  selectedId: string | null;
  /** Multi-select: the tiles ticked so far (before submit) or submitted. */
  selectedIds: string[];
  submittedOrder: string[] | null;
  submittedText: string | null;
  hasAnswered: boolean;
  onSelect: (optionId: string) => void;
  /** Multi-select: toggle a tile, then submit the set. */
  onToggle: (optionId: string) => void;
  onSubmitMulti: () => void;
  onSubmitOrder: (order: string[]) => void;
  onSubmitText: (text: string) => void;
  onSkip: () => void;
  allowSkip: boolean;
  /** The room moves on by itself, so nobody is waiting on the teacher. */
  autoAdvancing?: boolean;
  result: PlayerResult | null;
  correctIds: string[] | null;
  acceptedAnswers: string[] | null;
  /** Numeric reveal. */
  answer: number | null;
  unit: string | null;
  /** Everyone's "why", from the teacher. */
  explanation: string | null;
  /** Poll reveal: what the room thought. */
  pollCounts: Record<string, number> | null;
  pollTotal: number;
  topThree: LeaderboardRow[];
  leaderboard: LeaderboardRow[];
  myRank: { rank: number; totalPlayers: number } | null;
  playerId: string | null;
  /** Live reactions. */
  allowReactions: boolean;
  onReact: (emoji: Reaction) => void;
  /** Anti-cheat surface. */
  strikes: number;
  strikeLimit: number;
  locked: boolean;
  mustReturnToFullscreen: boolean;
  onEnterFullscreen: () => void;
}

export function StudentQuiz(props: Props) {
  const {
    phase,
    question,
    startAt,
    endAt,
    nickname,
    score,
    streak,
    selectedId,
    selectedIds,
    submittedOrder,
    submittedText,
    hasAnswered,
    onSelect,
    onToggle,
    onSubmitMulti,
    onSubmitOrder,
    onSubmitText,
    onSkip,
    allowSkip,
    autoAdvancing = false,
    result,
    correctIds,
    acceptedAnswers,
    answer,
    unit,
    explanation,
    pollCounts,
    pollTotal,
    topThree,
    leaderboard,
    myRank,
    playerId,
    allowReactions,
    onReact,
    strikes,
    strikeLimit,
    locked,
    mustReturnToFullscreen,
    onEnterFullscreen,
  } = props;

  const t = useT();
  const blocked = locked || mustReturnToFullscreen;
  const kind = question?.type;
  const typed = kind === 'short' || kind === 'numeric';

  // The small caption over the question: number, points, and what to do.
  const caption = question
    ? [
        t('quiz.questionOf', { n: question.index + 1, total: question.total }),
        kind === 'poll' ? t('quiz.captionPoll') : t('quiz.captionPts', { pts: question.points }),
        typed ? t('quiz.captionTyped') : null,
        kind === 'multiselect' ? t('quiz.captionMulti') : null,
        kind === 'ordering' ? t('quiz.captionOrder') : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <div className="relative mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-4 py-4">
      {/* ------------------------------------------------------------- header */}
      <header className="mb-3 flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{nickname}</span>
        {strikes > 0 && strikeLimit > 0 && (
          <span className="rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-300">
            {t('quiz.warnings', { strikes, limit: strikeLimit })}
          </span>
        )}
        <span className="rounded-full bg-brand-500/20 px-3 py-1 font-display text-sm font-bold nums text-brand-300">
          {score.toLocaleString()}
        </span>
      </header>

      {/* Streak meter rides above every in-play phase so the multiplier is
          always visible while it is worth something. */}
      {streak >= 2 && phase !== 'reveal' && (
        <div className="mb-3">
          <StreakMeter streak={streak} compact />
        </div>
      )}

      {/* ------------------------------------------------------------ lead-in */}
      {phase === 'leadIn' && <LeadIn startAt={startAt} index={question?.index ?? 0} />}

      {/* ----------------------------------------------------------- question */}
      {phase === 'question' && question && (
        <div className="flex flex-1 flex-col">
          <div className="surface p-5">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wide text-slate-500">{caption}</p>
                <h1 className="mt-1.5 font-display text-xl font-bold leading-snug sm:text-2xl">
                  {question.text}
                </h1>
              </div>
              <Countdown endAt={endAt} totalMs={question.timeLimitMs} size={72} />
            </div>

            <QuestionMedia src={question.image} className="mt-4" maxHeight="14rem" />
          </div>

          {/* Centred in whatever space is left, so a two-option true/false does
              not leave a dead band down the middle of a phone screen. */}
          <div className="mt-4 flex flex-1 flex-col justify-center">
            {typed ? (
              <ShortAnswer
                onSubmit={onSubmitText}
                disabled={blocked}
                submitted={hasAnswered}
                submittedText={submittedText}
                numeric={kind === 'numeric'}
                unit={question.unit}
              />
            ) : kind === 'ordering' ? (
              <OrderAnswer
                options={question.options}
                onSubmit={onSubmitOrder}
                disabled={blocked}
                submitted={hasAnswered}
                submittedOrder={submittedOrder}
              />
            ) : kind === 'multiselect' ? (
              <div className="space-y-3">
                <AnswerGrid
                  options={question.options}
                  selectedIds={selectedIds}
                  onSelect={onToggle}
                  disabled={hasAnswered || blocked}
                />
                {!hasAnswered && (
                  <button
                    type="button"
                    className="btn-primary w-full py-3.5 text-lg"
                    disabled={blocked || selectedIds.length === 0}
                    onClick={onSubmitMulti}
                  >
                    {selectedIds.length === 0
                      ? t('quiz.pickEveryRight')
                      : t.n('quiz.submitAnswers', selectedIds.length)}
                  </button>
                )}
              </div>
            ) : (
              <AnswerGrid
                options={question.options}
                selectedId={selectedId}
                onSelect={onSelect}
                disabled={hasAnswered || blocked}
              />
            )}
          </div>

          <div className="mt-4 space-y-3">
            {hasAnswered ? (
              /* The wait between answering and the reveal is the longest a
                 student sits still, and it used to be one grey line under a
                 dead grid. Say plainly that the answer is in and that the
                 hold-up is other people, not them. */
              <WaitingStrip text={t('quiz.lockedWaiting')} />
            ) : (
              <>
                <p className="text-center text-sm text-slate-400">
                  {kind === 'poll' ? t('quiz.noWrongAnswer') : t('quiz.answerFaster')}
                </p>

                {/* Skip tells the server "I'm done thinking" so the room can
                    move on without waiting out the clock. Given a border and
                    full thumb-width: as bare ghost text at the very bottom
                    edge of a phone it read as a caption and got missed. */}
                {allowSkip && !blocked && (
                  <button
                    type="button"
                    onClick={onSkip}
                    className="btn-secondary mx-auto flex w-full max-w-xs justify-center"
                  >
                    {t('quiz.skip')}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- reveal */}
      {phase === 'reveal' &&
        (result ? (
          <Reveal
            result={result}
            question={question}
            correctIds={correctIds}
            acceptedAnswers={acceptedAnswers}
            answer={answer}
            unit={unit}
            explanation={explanation}
            pollCounts={pollCounts}
            pollTotal={pollTotal}
            topThree={topThree}
          />
        ) : (
          // Late joiners and mid-reveal reconnects have no result of their own.
          // They get the answer and a holding message rather than a blank page.
          <Waiting
            title={t('quiz.answersUp')}
            detail={
              acceptedAnswers?.length
                ? t('quiz.answerWasDot', { answer: acceptedAnswers[0] })
                : t('quiz.joinedPartway')
            }
          />
        ))}

      {/* -------------------------------------------------------- leaderboard */}
      {phase === 'leaderboard' &&
        (leaderboard.length > 0 || myRank ? (
          <div className="flex flex-1 flex-col justify-center">
            <div className="surface p-5">
              <div className="mb-4 text-center">
                <p className="text-sm text-slate-400">{t('quiz.yourPlace')}</p>
                <p className="font-display text-5xl font-extrabold">
                  {myRank ? t.ordinal(myRank.rank) : '—'}
                </p>
                {myRank && (
                  <p className="text-sm text-slate-500">{t('quiz.ofPlayers', { n: myRank.totalPlayers })}</p>
                )}
              </div>
              <Leaderboard rows={leaderboard} highlightId={playerId} />
            </div>
          </div>
        ) : (
          <Waiting title={t('quiz.scoresGoingUp')} detail={t('quiz.lookAtBoard')} />
        ))}

      {/* Reactions between questions - never during a live question, where they
          would be one more thing competing with the clock. */}
      {allowReactions && (phase === 'reveal' || phase === 'leaderboard') && !blocked && (
        <div className="mt-5">
          <EmojiBar onSend={onReact} label={t('quiz.react')} />
        </div>
      )}

      {/* The reveal and the scores are dead ends until the teacher clicks.
          Without this the student stares at a frozen screen with no way to
          tell whether the quiz has broken or everyone is simply waiting. */}
      {(phase === 'reveal' || phase === 'leaderboard') && !blocked && (
        <WaitingStrip
          text={
            autoAdvancing
              ? question && question.index + 1 >= question.total
                ? t('quiz.finishingUp')
                : t('quiz.nextComing')
              : question && question.index + 1 >= question.total
                ? t('quiz.waitingFinish')
                : t('quiz.waitingNext')
          }
        />
      )}

      {/* --------------------------------------------------------- overlays */}
      {locked && <LockedOverlay strikes={strikes} strikeLimit={strikeLimit} />}
      {!locked && mustReturnToFullscreen && phase !== 'ended' && (
        <FullscreenOverlay onEnter={onEnterFullscreen} live={phase === 'question'} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Three breathing dots. The one signal that something is still running. */
function Dots({ size = 'h-2.5 w-2.5' }: { size?: string }) {
  return (
    <span className="flex shrink-0 items-center gap-2" aria-hidden>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className={'animate-breathe rounded-full bg-brand-400 ' + size}
          style={{ animationDelay: delay + 'ms' }}
        />
      ))}
    </span>
  );
}

/**
 * A one-line "you are waiting on someone else" bar.
 *
 * Used wherever the student has finished their part and the room is waiting
 * on the teacher or the clock, so a stalled screen never looks like a crash.
 */
function WaitingStrip({ text }: { text: string }) {
  return (
    <div
      role="status"
      className="mt-4 flex items-center justify-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.04] px-4 py-3.5"
    >
      <Dots size="h-2 w-2" />
      <p className="text-sm font-medium text-slate-300">{text}</p>
    </div>
  );
}

/** Generic holding screen. Nothing in this app should ever render blank. */
function Waiting({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="flex h-14 items-center">
        <Dots />
      </div>
      <p className="mt-2 font-display text-xl font-bold">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-slate-400">{detail}</p>
    </div>
  );
}

function LeadIn({ startAt, index }: { startAt: number | null; index: number }) {
  const t = useT();
  const { seconds } = useCountdown(startAt, 3000);
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
        {t('quiz.questionN', { n: index + 1 })}
      </p>
      <p key={seconds} className="animate-pop font-display text-8xl font-extrabold text-brand-300">
        {seconds > 0 ? seconds : t('quiz.go')}
      </p>
      <p className="mt-4 text-slate-400">{t('quiz.getReady')}</p>
    </div>
  );
}

function Reveal({
  result,
  question,
  correctIds,
  acceptedAnswers,
  answer,
  unit,
  explanation,
  pollCounts,
  pollTotal,
  topThree,
}: {
  result: PlayerResult;
  question: LiveQuestion | null;
  correctIds: string[] | null;
  acceptedAnswers: string[] | null;
  answer: number | null;
  unit: string | null;
  explanation: string | null;
  pollCounts: Record<string, number> | null;
  pollTotal: number;
  topThree: LeaderboardRow[];
}) {
  const t = useT();
  const status: ResultStatus = result.neutral && result.answered
    ? 'voted'
    : result.skipped
      ? 'skipped'
      : !result.answered
        ? 'timeout'
        : result.correct
          ? 'correct'
          : 'incorrect';
  const tone = RESULT_TONE[status];
  const label = (id: string) => question?.options.find((o) => o.id === id)?.text ?? id;

  // What "the answer" is depends on the kind of question.
  const correctText =
    question?.type === 'ordering' && correctIds
      ? correctIds.map(label).join(' \u2192 ')
      : question?.type === 'numeric' && answer != null
        ? String(answer) + (unit ? ' ' + unit : '')
        : acceptedAnswers?.length
          ? acceptedAnswers[0]
          : question?.type === 'multiselect' && correctIds
            ? correctIds.map(label).join(', ')
            : question?.options.find((o) => correctIds?.includes(o.id))?.text;

  const yourText =
    result.submittedText ??
    (result.submittedOrder ? result.submittedOrder.map(label).join(' \u2192 ') : null) ??
    (result.chosenOptionIds ? result.chosenOptionIds.map(label).join(', ') : null);

  return (
    <div className="flex flex-1 flex-col justify-center">
      <div
        className={
          'surface relative overflow-hidden p-6 text-center ' + tone.ring + ' ' + tone.tint
        }
      >
        {/* The colour blooms out from behind the mark and floods the card, so
            the verdict is the background - you know the answer from across the
            room before you have read a word of it. */}
        <span
          aria-hidden
          className="result-wash pointer-events-none absolute left-1/2 top-[22%] -z-0 aspect-square w-[170%] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: 'radial-gradient(circle, ' + tone.wash + ' 0%, transparent 62%)',
          }}
        />

        <div className="relative">
          <ResultMark status={status} />
          <h1 className={'mt-4 font-display text-3xl font-extrabold ' + tone.text}>
            {t(('result.' + status) as 'result.correct')}
          </h1>

        {result.neutral ? (
          <p className="mt-2 text-slate-400">{t('reveal.pollNoScore')}</p>
        ) : result.pointsEarned > 0 ? (
          <p className="mt-2 font-display text-2xl font-bold text-emerald-300">
            +{result.pointsEarned.toLocaleString()}
          </p>
        ) : (
          <p className="mt-2 text-slate-400">{t('reveal.noPoints')}</p>
        )}

        {/* Show the maths so speed and streak feel earned, not arbitrary. */}
        {result.correct && (
          <p className="mt-1 text-xs text-slate-400">
            {result.basePoints ? t('reveal.mathBase', { n: result.basePoints }) : ''}
            {result.speedComponent ? ' ' + t('reveal.mathSpeed', { n: result.speedComponent }) : ''}
            {result.multiplier > 1 ? ' ' + t('reveal.mathStreak', { m: result.multiplier }) : ''}
          </p>
        )}

        {yourText && !result.neutral && (
          <p className="mt-3 text-sm text-slate-400">
            {t.rich(
              result.submittedOrder
                ? 'reveal.youPut'
                : result.chosenOptionIds
                  ? 'reveal.youPicked'
                  : 'reveal.youWrote',
              { answer: <b className="text-slate-200">{yourText}</b> }
            )}
          </p>
        )}

        {!result.correct && !result.neutral && correctText && (
          <p className="mt-4 rounded-xl bg-white/5 px-4 py-3 text-sm text-slate-400">
            {t.rich('reveal.answerWas', {
              answer: <b className="font-semibold text-slate-100">{correctText}</b>,
            })}
          </p>
        )}

        {/* The teacher's "why". Shown to everyone, right or wrong - the moment
            after a reveal is when a student is most receptive. */}
        {explanation && (
          <p className="mt-4 rounded-xl border border-brand-400/20 bg-brand-500/[0.08] px-4 py-3 text-left text-sm leading-relaxed text-slate-200">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-brand-300">
              {t('reveal.why')}
            </span>
            {explanation}
          </p>
        )}

        {/* A poll's whole point is seeing what the room thought. */}
        {result.neutral && pollCounts && question && (
          <ul className="mt-4 space-y-1.5 text-left">
            {question.options.map((o) => {
              const n = pollCounts[o.id] ?? 0;
              const pct = pollTotal ? Math.round((n / pollTotal) * 100) : 0;
              const mine = result.chosenOptionId === o.id;
              return (
                <li key={o.id} className="relative overflow-hidden rounded-xl bg-white/[0.05] px-3 py-2 text-sm">
                  <span
                    className="absolute inset-y-0 left-0 bg-brand-500/25 transition-all duration-700"
                    style={{ width: pct + '%' }}
                    aria-hidden
                  />
                  <span className="relative flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {o.text}
                      {mine && <span className="ml-2 text-[11px] uppercase text-brand-300">{t('ui.you')}</span>}
                    </span>
                    <span className="shrink-0 text-slate-400 nums">{pct}%</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {!result.neutral && (
          <div className="mt-5">
            <StreakMeter streak={result.streak} broken={!!result.streakBroken} />
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/[0.05] px-3 py-3">
            <p className="font-display text-2xl font-bold nums">
              {result.rank ? t.ordinal(result.rank) : '—'}
            </p>
            <p className="text-xs text-slate-400">
              {result.totalPlayers ? t('reveal.yourRankOf', { n: result.totalPlayers }) : t('reveal.yourRank')}
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.05] px-3 py-3">
            <p className="font-display text-2xl font-bold nums text-brand-300">
              {result.score.toLocaleString()}
            </p>
            <p className="text-xs text-slate-400">{t('reveal.totalScore')}</p>
          </div>
        </div>

          {topThree.length > 0 && (
            <p className="mt-5 text-xs text-slate-500">
              {t('reveal.leading', { names: topThree.map((p) => p.nickname).join(' · ') })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function FullscreenOverlay({ onEnter, live }: { onEnter: () => void; live: boolean }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/95 px-6 backdrop-blur">
      <div className="surface-solid max-w-sm p-6 text-center">
        <p className="text-5xl">⛶</p>
        <h2 className="mt-3 font-display text-2xl font-bold">{t('fs.required')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          {live ? t('fs.pausedLive') : t('fs.return')}
        </p>
        <button className="btn-primary mt-5 w-full py-3" type="button" onClick={onEnter}>
          {t('fs.back')}
        </button>
      </div>
    </div>
  );
}

function LockedOverlay({ strikes, strikeLimit }: { strikes: number; strikeLimit: number }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/95 px-6 backdrop-blur">
      <div className="surface-solid max-w-sm border-rose-400/30 p-6 text-center">
        <p className="text-5xl">✋</p>
        <h2 className="mt-3 font-display text-2xl font-bold text-rose-200">{t('locked.title')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          {t('locked.body', { strikes, limit: strikeLimit })}
        </p>
        <p className="mt-4 text-xs text-slate-500">{t('locked.wait')}</p>
      </div>
    </div>
  );
}

