'use client';

import { AnswerGrid } from '@/components/ui/AnswerGrid';
import { Countdown } from '@/components/ui/Countdown';
import { Leaderboard } from '@/components/ui/Leaderboard';
import { QuestionMedia } from '@/components/ui/QuestionMedia';
import { ShortAnswer } from '@/components/ui/ShortAnswer';
import { StreakMeter } from '@/components/ui/StreakMeter';
import { EmojiBar } from '@/components/ui/EmojiBar';
import { ResultMark, RESULT_TONE, type ResultStatus } from '@/components/ui/ResultMark';
import { useCountdown } from '@/lib/useCountdown';
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
  submittedText: string | null;
  hasAnswered: boolean;
  onSelect: (optionId: string) => void;
  onSubmitText: (text: string) => void;
  onSkip: () => void;
  allowSkip: boolean;
  /** The room moves on by itself, so nobody is waiting on the teacher. */
  autoAdvancing?: boolean;
  result: PlayerResult | null;
  correctIds: string[] | null;
  acceptedAnswers: string[] | null;
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
    submittedText,
    hasAnswered,
    onSelect,
    onSubmitText,
    onSkip,
    allowSkip,
    autoAdvancing = false,
    result,
    correctIds,
    acceptedAnswers,
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

  const blocked = locked || mustReturnToFullscreen;
  const isShort = question?.type === 'short';

  return (
    <div className="relative mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-4 py-4">
      {/* ------------------------------------------------------------- header */}
      <header className="mb-3 flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{nickname}</span>
        {strikes > 0 && strikeLimit > 0 && (
          <span className="rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-300">
            {strikes}/{strikeLimit} warnings
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
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Question {question.index + 1} of {question.total} · {question.points} pts
                  {isShort && ' · type your answer'}
                </p>
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
            {isShort ? (
              <ShortAnswer
                onSubmit={onSubmitText}
                disabled={blocked}
                submitted={hasAnswered}
                submittedText={submittedText}
              />
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
              <WaitingStrip text="Answer locked in — waiting for the rest of the class…" />
            ) : (
              <>
                <p className="text-center text-sm text-slate-400">
                  Answer faster to score more points.
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
                    Skip this question →
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
            topThree={topThree}
          />
        ) : (
          // Late joiners and mid-reveal reconnects have no result of their own.
          // They get the answer and a holding message rather than a blank page.
          <Waiting
            title="Answers are up"
            detail={
              acceptedAnswers?.length
                ? 'The answer was ' + acceptedAnswers[0] + '.'
                : 'You joined partway through this one — you are in from the next question.'
            }
          />
        ))}

      {/* -------------------------------------------------------- leaderboard */}
      {phase === 'leaderboard' &&
        (leaderboard.length > 0 || myRank ? (
          <div className="flex flex-1 flex-col justify-center">
            <div className="surface p-5">
              <div className="mb-4 text-center">
                <p className="text-sm text-slate-400">You are in</p>
                <p className="font-display text-5xl font-extrabold">
                  {myRank ? ordinal(myRank.rank) : '—'}
                </p>
                {myRank && <p className="text-sm text-slate-500">of {myRank.totalPlayers} players</p>}
              </div>
              <Leaderboard rows={leaderboard} highlightId={playerId} />
            </div>
          </div>
        ) : (
          <Waiting title="Scores are going up" detail="Look at the board at the front." />
        ))}

      {/* Reactions between questions - never during a live question, where they
          would be one more thing competing with the clock. */}
      {allowReactions && (phase === 'reveal' || phase === 'leaderboard') && !blocked && (
        <div className="mt-5">
          <EmojiBar onSend={onReact} label="React" />
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
                ? 'Finishing up…'
                : 'Next question coming up…'
              : question && question.index + 1 >= question.total
                ? 'Waiting for your teacher to finish the quiz…'
                : 'Waiting for your teacher to start the next question…'
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
  const { seconds } = useCountdown(startAt, 3000);
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Question {index + 1}</p>
      <p key={seconds} className="animate-pop font-display text-8xl font-extrabold text-brand-300">
        {seconds > 0 ? seconds : 'Go!'}
      </p>
      <p className="mt-4 text-slate-400">Get ready…</p>
    </div>
  );
}

function Reveal({
  result,
  question,
  correctIds,
  acceptedAnswers,
  topThree,
}: {
  result: PlayerResult;
  question: LiveQuestion | null;
  correctIds: string[] | null;
  acceptedAnswers: string[] | null;
  topThree: LeaderboardRow[];
}) {
  const status: ResultStatus = result.skipped
    ? 'skipped'
    : !result.answered
      ? 'timeout'
      : result.correct
        ? 'correct'
        : 'incorrect';
  const tone = RESULT_TONE[status];

  const correctText =
    acceptedAnswers?.length
      ? acceptedAnswers[0]
      : question?.options.find((o) => correctIds?.includes(o.id))?.text;

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
          <h1 className={'mt-4 font-display text-3xl font-extrabold ' + tone.text}>{tone.title}</h1>

        {result.pointsEarned > 0 ? (
          <p className="mt-2 font-display text-2xl font-bold text-emerald-300">
            +{result.pointsEarned.toLocaleString()}
          </p>
        ) : (
          <p className="mt-2 text-slate-400">No points this round</p>
        )}

        {/* Show the maths so speed and streak feel earned, not arbitrary. */}
        {result.correct && (
          <p className="mt-1 text-xs text-slate-400">
            {result.basePoints ? result.basePoints + ' base' : ''}
            {result.speedComponent ? ' + ' + result.speedComponent + ' speed' : ''}
            {result.multiplier > 1 ? ' × ' + result.multiplier + ' streak' : ''}
          </p>
        )}

        {result.submittedText && (
          <p className="mt-3 text-sm text-slate-400">
            You wrote <b className="text-slate-200">{result.submittedText}</b>
          </p>
        )}

        {!result.correct && correctText && (
          <p className="mt-4 rounded-xl bg-white/5 px-4 py-3 text-sm">
            <span className="text-slate-400">The answer was </span>
            <b className="font-semibold">{correctText}</b>
          </p>
        )}

        <div className="mt-5">
          <StreakMeter streak={result.streak} broken={!!result.streakBroken} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/[0.05] px-3 py-3">
            <p className="font-display text-2xl font-bold nums">
              {result.rank ? ordinal(result.rank) : '—'}
            </p>
            <p className="text-xs text-slate-400">
              your rank{result.totalPlayers ? ' of ' + result.totalPlayers : ''}
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.05] px-3 py-3">
            <p className="font-display text-2xl font-bold nums text-brand-300">
              {result.score.toLocaleString()}
            </p>
            <p className="text-xs text-slate-400">total score</p>
          </div>
        </div>

          {topThree.length > 0 && (
            <p className="mt-5 text-xs text-slate-500">
              Leading: {topThree.map((p) => p.nickname).join(' · ')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function FullscreenOverlay({ onEnter, live }: { onEnter: () => void; live: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/95 px-6 backdrop-blur">
      <div className="surface-solid max-w-sm p-6 text-center">
        <p className="text-5xl">⛶</p>
        <h2 className="mt-3 font-display text-2xl font-bold">Full-screen required</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          {live
            ? 'Your quiz is paused because you left full-screen. The clock is still running - go back in to keep answering.'
            : 'Return to full-screen to carry on. Your teacher has been notified.'}
        </p>
        <button className="btn-primary mt-5 w-full py-3" type="button" onClick={onEnter}>
          Back to full-screen
        </button>
      </div>
    </div>
  );
}

function LockedOverlay({ strikes, strikeLimit }: { strikes: number; strikeLimit: number }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/95 px-6 backdrop-blur">
      <div className="surface-solid max-w-sm border-rose-400/30 p-6 text-center">
        <p className="text-5xl">✋</p>
        <h2 className="mt-3 font-display text-2xl font-bold text-rose-200">Paused</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          You have {strikes} of {strikeLimit} warnings for leaving the quiz screen. Your teacher can
          let you back in from their dashboard.
        </p>
        <p className="mt-4 text-xs text-slate-500">Speak to your teacher, then wait here.</p>
      </div>
    </div>
  );
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
