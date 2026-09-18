'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { JoinScreen } from '@/components/student/JoinScreen';
import { WaitingRoom } from '@/components/student/WaitingRoom';
import { StudentQuiz } from '@/components/student/StudentQuiz';
import { useSocket, useSocketEvent } from '@/lib/socket';
import { useProctoring, type IntegrityType } from '@/lib/useProctoring';
import type {
  LeaderboardRow,
  LiveQuestion,
  Phase,
  PlayerResult,
  Reaction,
  RoomSettings,
} from '@/lib/types';

import { findServerForPin } from '@/lib/servers';
import { describeError, useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

const STORE_KEY = 'quizarena.player';

interface Session {
  pin: string;
  playerId: string;
  token: string;
  nickname: string;
  /** Which instance of the fleet holds this room. */
  server?: string;
}

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <StudentSession />
    </Suspense>
  );
}

function StudentSession() {
  const params = useSearchParams();
  const { status, emit, connectTo, serverUrl } = useSocket();
  const t = useT();
  // Read through a ref inside the callbacks below, so switching language does
  // not hand them a new identity and re-trigger the auto-rejoin effect.
  const tRef = useRef(t);
  tRef.current = t;
  const { setRoomAppearance } = useTheme();

  const [session, setSession] = useState<Session | null>(null);
  const [phase, setPhase] = useState<Phase>('lobby');
  const [settings, setSettings] = useState<Partial<RoomSettings>>({ requireFullscreen: true });
  const [quizTitle, setQuizTitle] = useState<string>();
  const [question, setQuestion] = useState<LiveQuestion | null>(null);
  const [startAt, setStartAt] = useState<number | null>(null);
  const [endAt, setEndAt] = useState<number | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submittedOrder, setSubmittedOrder] = useState<string[] | null>(null);
  const [submittedText, setSubmittedText] = useState<string | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);

  const [result, setResult] = useState<PlayerResult | null>(null);
  const [correctIds, setCorrectIds] = useState<string[] | null>(null);
  const [acceptedAnswers, setAcceptedAnswers] = useState<string[] | null>(null);
  const [revealExtra, setRevealExtra] = useState<{
    answer: number | null;
    unit: string | null;
    explanation: string | null;
    pollCounts: Record<string, number> | null;
    pollTotal: number;
  }>({ answer: null, unit: null, explanation: null, pollCounts: null, pollTotal: 0 });
  const [topThree, setTopThree] = useState<LeaderboardRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [myRank, setMyRank] = useState<{ rank: number; totalPlayers: number } | null>(null);
  /** Set when the room advances itself, so the wait can be described honestly. */
  const [autoAdvancing, setAutoAdvancing] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [locked, setLocked] = useState(false);
  const [finalStanding, setFinalStanding] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  // In a room, the phone wears the room's look; out of one, its own. The
  // settings arrive with the join state and again on every room:updated.
  useEffect(() => {
    setRoomAppearance(session ? (settings.appearance ?? null) : null);
  }, [session, settings.appearance, setRoomAppearance]);

  const flashNotice = useCallback((message: string, ms = 4000) => {
    setNotice(message);
    setTimeout(() => setNotice((n) => (n === message ? null : n)), ms);
  }, []);

  /* ----------------------------------------------------------- integrity */

  const reportIntegrity = useCallback(
    (type: IntegrityType, meta?: { hiddenMs?: number }) => {
      if (!sessionRef.current) return;
      emit<any>('player:integrity', { type, ...meta })
        .then((res) => {
          if (!res?.ok) return;
          setStrikes(res.strikes);
          setLocked(!!res.locked);
        })
        .catch(() => {
          /* a dropped integrity ping must never break gameplay */
        });
    },
    [emit]
  );

  const proctor = useProctoring({
    // Only watch once the student is actually in a room. Nobody is cheating on
    // the join screen.
    enabled: !!session && phase !== 'ended',
    requireFullscreen: settings.requireFullscreen !== false,
    onEvent: reportIntegrity,
  });

  /* --------------------------------------------------------- state apply */

  const applyState = useCallback((state: any) => {
    setPhase(state.phase);
    setQuizTitle(state.quizTitle);
    setSettings(state.settings ?? {});
    setStartAt(state.startAt ?? null);
    setEndAt(state.endAt ?? null);
    setQuestion(state.question ?? null);
    setCorrectIds(state.reveal?.correctOptionIds ?? null);
    setAcceptedAnswers(state.reveal?.acceptedAnswers ?? null);
    setRevealExtra({
      answer: state.reveal?.answer ?? null,
      unit: state.reveal?.unit ?? null,
      explanation: state.reveal?.explanation ?? null,
      pollCounts: state.reveal?.neutral ? (state.reveal?.distribution ?? null) : null,
      pollTotal: state.reveal?.answeredTotal ?? 0,
    });
    if (state.leaderboard) setLeaderboard(state.leaderboard.top ?? []);

    if (state.you) {
      setScore(state.you.score);
      setStreak(state.you.streak ?? 0);
      setStrikes(state.you.strikes);
      setHasAnswered(!!state.you.answered);
      setSelectedId(state.you.answeredOptionId ?? null);
      setSelectedIds(state.you.answeredOptionIds ?? []);
      setSubmittedOrder(state.you.submittedOrder ?? null);
      setSubmittedText(state.you.submittedText ?? null);
      if (state.you.rank) setMyRank(state.you.rank);
    }
  }, []);

  /**
   * Ask the server what is actually going on.
   *
   * This is the safety net behind the whole client: any missed broadcast - a
   * backgrounded phone, a flaky hotspot, a server that briefly thought we were
   * gone - is recoverable, instead of leaving a student staring at a screen
   * that never changes.
   */
  const resync = useCallback(() => {
    if (!sessionRef.current) return;
    emit<any>('player:sync')
      .then((res) => {
        if (res?.ok) applyState(res.state);
      })
      .catch(() => {
        /* the reconnect effect will retry */
      });
  }, [emit, applyState]);

  const doJoin = useCallback(
    async (pin: string, nickname: string, existing?: Session) => {
      setBusy(true);
      setError(null);
      try {
        // A PIN names one room on one server. Find which, and move there,
        // before trying to join - otherwise a student whose browser happened
        // to connect to a different instance is told the room does not exist.
        const home = existing?.server
          ? { url: existing.server }
          : await findServerForPin(pin);

        if (!home) {
          setError(tRef.current('join.noRoomCheck'));
          return;
        }
        if (home.url !== serverUrl) await connectTo(home.url);

        const res = await emit<any>('player:join', {
          pin,
          nickname,
          playerId: existing?.playerId,
          token: existing?.token,
        });

        if (!res?.ok) {
          setError(describeError(tRef.current, res, 'join.couldNotJoin', { max: res?.maxPlayers ?? '' }));
          if (['no_room', 'forbidden', 'ended'].includes(res?.code)) {
            localStorage.removeItem(STORE_KEY);
            setSession(null);
          }
          return;
        }

        const next: Session = {
          pin,
          playerId: res.playerId,
          token: res.token,
          nickname: res.nickname,
          server: home.url,
        };
        localStorage.setItem(STORE_KEY, JSON.stringify(next));
        setSession(next);
        applyState(res.state);
      } catch (err) {
        setError(describeError(tRef.current, err as Error, 'join.couldNotJoin'));
      } finally {
        setBusy(false);
      }
    },
    [emit, applyState, connectTo, serverUrl]
  );

  /**
   * Auto-rejoin after a refresh or a dropped connection. The playerId + token
   * pair is what stops someone reclaiming a classmate's score by typing their
   * nickname.
   */
  useEffect(() => {
    if (status !== 'connected') return;
    const saved = localStorage.getItem(STORE_KEY);
    if (!saved) return;
    try {
      const parsed: Session = JSON.parse(saved);
      doJoin(parsed.pin, parsed.nickname, parsed);
    } catch {
      localStorage.removeItem(STORE_KEY);
    }
  }, [status, doJoin]);

  /**
   * Resync whenever the tab comes back to the foreground.
   *
   * A backgrounded phone gets its timers throttled, which can make the server
   * give up on the socket while the browser still believes it is connected.
   * Coming back into view is the cheapest, most reliable moment to ask the
   * server what we missed.
   */
  useEffect(() => {
    if (!session) return;
    const onVisible = () => {
      if (!document.hidden) resync();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [session, resync]);

  /**
   * Slow safety poll. If a student sits in a non-terminal phase for 20s with
   * no server traffic, something was missed - ask rather than sit there.
   */
  const lastEventAt = useRef(Date.now());
  useEffect(() => {
    if (!session || phase === 'ended') return;
    const timer = setInterval(() => {
      if (Date.now() - lastEventAt.current > 20_000) {
        lastEventAt.current = Date.now();
        resync();
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [session, phase, resync]);

  /* -------------------------------------------------------- socket events */

  const markEvent = () => {
    lastEventAt.current = Date.now();
  };

  useSocketEvent<any>('game:leadIn', (p) => {
    markEvent();
    setPhase('leadIn');
    setStartAt(p.startAt);
    setEndAt(null);
    // Clear the previous question completely so nothing from it can bleed
    // into the next one.
    setSelectedId(null);
    setSelectedIds([]);
    setSubmittedOrder(null);
    setSubmittedText(null);
    setHasAnswered(false);
    setResult(null);
    setCorrectIds(null);
    setAcceptedAnswers(null);
    setRevealExtra({ answer: null, unit: null, explanation: null, pollCounts: null, pollTotal: 0 });
  });

  useSocketEvent<any>('game:question', (p) => {
    markEvent();
    setPhase('question');
    setQuestion(p.question);
    setStartAt(p.startAt);
    setEndAt(p.endAt);
    setSelectedId(null);
    setSelectedIds([]);
    setSubmittedOrder(null);
    setSubmittedText(null);
    setHasAnswered(false);
    setResult(null);
    setCorrectIds(null);
    setAcceptedAnswers(null);
    setRevealExtra({ answer: null, unit: null, explanation: null, pollCounts: null, pollTotal: 0 });
  });

  useSocketEvent<any>('game:reveal', (p) => {
    markEvent();
    setPhase('reveal');
    setAutoAdvancing(!!p.autoAdvanceAt);
    setCorrectIds(p.correctOptionIds ?? null);
    setAcceptedAnswers(p.acceptedAnswers ?? null);
    setRevealExtra({
      answer: p.answer ?? null,
      unit: p.unit ?? null,
      explanation: p.explanation ?? null,
      pollCounts: p.neutral ? (p.distribution ?? null) : null,
      pollTotal: p.answeredTotal ?? 0,
    });
    setTopThree(p.topThree ?? []);
    if (p.you) {
      setResult(p.you);
      setScore(p.you.score);
      setStreak(p.you.streak ?? 0);
      if (p.you.chosenOptionId) setSelectedId(p.you.chosenOptionId);
      if (p.you.chosenOptionIds) setSelectedIds(p.you.chosenOptionIds);
      if (p.you.submittedOrder) setSubmittedOrder(p.you.submittedOrder);
      if (p.you.submittedText) setSubmittedText(p.you.submittedText);
    }
  });

  useSocketEvent<any>('game:leaderboard', (p) => {
    markEvent();
    setPhase('leaderboard');
    setAutoAdvancing(!!p.autoAdvanceAt);
    setLeaderboard(p.top ?? []);
    if (p.you) {
      setMyRank({ rank: p.you.rank, totalPlayers: p.you.totalPlayers });
      setScore(p.you.score);
    }
  });

  useSocketEvent<any>('game:over', (p) => {
    markEvent();
    setPhase('ended');
    setFinalStanding(p);
    proctor.exitFullscreen();
  });

  /** The host edited the quiz while we were sitting in the waiting room. */
  useSocketEvent<{ quizTitle: string; settings?: Partial<RoomSettings> }>('room:updated', (p) => {
    if (p?.quizTitle) setQuizTitle(p.quizTitle);
    if (p?.settings) setSettings(p.settings);
  });

  useSocketEvent<void>('player:strikesCleared', () => {
    setStrikes(0);
    setLocked(false);
    flashNotice(t('notice.warningsCleared'));
  });

  useSocketEvent<any>('player:kicked', () => {
    localStorage.removeItem(STORE_KEY);
    setSession(null);
    setError(t('join.kicked'));
  });

  useSocketEvent<void>('host:disconnected', () => {
    flashNotice(t('notice.hostLost'), 5000);
  });

  useSocketEvent<void>('host:reconnected', () => {
    flashNotice(t('notice.hostBack'), 2500);
    resync();
  });

  /* -------------------------------------------------------------- answering */

  /** One path for every kind of submission: choice, free text, and skip. */
  const submit = useCallback(
    async (payload: {
      optionId?: string | null;
      optionIds?: string[];
      order?: string[];
      text?: string;
      skipped?: boolean;
    }) => {
      if (hasAnswered || locked) return;

      // Optimistic lock: the tile or input freezes instantly, and we only roll
      // back if the server actually rejects it.
      setHasAnswered(true);
      if (payload.optionId) setSelectedId(payload.optionId);
      if (payload.optionIds) setSelectedIds(payload.optionIds);
      if (payload.order) setSubmittedOrder(payload.order);
      if (payload.text) setSubmittedText(payload.text);

      try {
        const res = await emit<any>('player:answer', payload);
        if (!res?.ok) {
          if (res?.code === 'already_answered') return; // it did land
          setHasAnswered(false);
          setSelectedId(null);
          setSubmittedOrder(null);
          setSubmittedText(null);
          if (res?.code === 'locked') setLocked(true);
          else if (res?.message) flashNotice(describeError(tRef.current, res, 'notice.notReached'), 2500);
        }
      } catch {
        setHasAnswered(false);
        setSelectedId(null);
        setSubmittedOrder(null);
        setSubmittedText(null);
        flashNotice(tRef.current('notice.notReached'), 2500);
      }
    },
    [emit, hasAnswered, locked, flashNotice]
  );

  const react = useCallback(
    (emoji: Reaction) => {
      // Fire and forget - a dropped reaction is not worth a retry or an error.
      emit('player:reaction', { emoji }).catch(() => {});
    },
    [emit]
  );

  /* ------------------------------------------------------------------ view */

  if (!session) {
    return (
      <JoinScreen
        initialPin={params.get('pin') ?? undefined}
        onJoin={(pin, nickname) => doJoin(pin, nickname)}
        busy={busy || status !== 'connected'}
        error={error ?? (status === 'connecting' ? t('join.connecting') : null)}
      />
    );
  }

  return (
    <>
      {notice && (
        <div className="fixed inset-x-0 top-0 z-40 bg-brand-500 px-4 py-2 text-center text-sm font-semibold text-onbrand">
          {notice}
        </div>
      )}
      {status !== 'connected' && (
        <div className="fixed inset-x-0 top-0 z-40 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-black">
          {t('notice.reconnecting')}
        </div>
      )}

      {phase === 'lobby' && (
        <WaitingRoom
          nickname={session.nickname}
          quizTitle={quizTitle}
          requireFullscreen={settings.requireFullscreen !== false}
          fullscreenSupported={proctor.fullscreenSupported}
          isFullscreen={proctor.isFullscreen}
          onEnterFullscreen={proctor.enterFullscreen}
          allowReactions={settings.allowReactions !== false}
          onReact={react}
        />
      )}

      {['leadIn', 'question', 'reveal', 'leaderboard'].includes(phase) && (
        <StudentQuiz
          phase={phase}
          question={question}
          startAt={startAt}
          endAt={endAt}
          nickname={session.nickname}
          score={score}
          streak={streak}
          selectedId={selectedId}
          submittedText={submittedText}
          hasAnswered={hasAnswered}
          onSelect={(optionId) => submit({ optionId })}
          selectedIds={selectedIds}
          submittedOrder={submittedOrder}
          onToggle={(id) =>
            setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
          }
          onSubmitMulti={() => submit({ optionIds: selectedIds })}
          onSubmitOrder={(order) => submit({ order })}
          onSubmitText={(text) => submit({ text })}
          onSkip={() => submit({ skipped: true, optionId: null })}
          allowSkip={settings.allowSkip !== false}
          autoAdvancing={autoAdvancing}
          result={result}
          correctIds={correctIds}
          acceptedAnswers={acceptedAnswers}
          answer={revealExtra.answer}
          unit={revealExtra.unit}
          explanation={revealExtra.explanation}
          pollCounts={revealExtra.pollCounts}
          pollTotal={revealExtra.pollTotal}
          topThree={topThree}
          leaderboard={leaderboard}
          myRank={myRank}
          playerId={session.playerId}
          allowReactions={settings.allowReactions !== false}
          onReact={react}
          strikes={strikes}
          strikeLimit={settings.strikeLimit ?? 0}
          locked={locked}
          mustReturnToFullscreen={proctor.mustReturnToFullscreen}
          onEnterFullscreen={proctor.enterFullscreen}
        />
      )}

      {phase === 'ended' && finalStanding && (
        <FinalScreen
          nickname={session.nickname}
          data={finalStanding}
          onLeave={() => {
            localStorage.removeItem(STORE_KEY);
            setSession(null);
            setFinalStanding(null);
            setPhase('lobby');
          }}
        />
      )}
    </>
  );
}

function FinalScreen({
  nickname,
  data,
  onLeave,
}: {
  nickname: string;
  data: any;
  onLeave: () => void;
}) {
  const t = useT();
  const you = data.you;
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-5 py-10 text-center">
      <div className="surface w-full animate-pop p-7">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-400">{t('final.title')}</p>
        <p className="mt-3 text-6xl">
          {you?.rank === 1 ? '🏆' : you?.rank && you.rank <= 3 ? '🥳' : '👏'}
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold">{nickname}</h1>

        {you && (
          <>
            <p className="mt-4 font-display text-6xl font-extrabold text-brand-300">
              {you.score.toLocaleString()}
            </p>
            <p className="text-sm text-slate-400">
              {t('final.rankCorrect', { rank: you.rank, correct: you.correctCount, answered: you.answeredCount })}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-mist/[0.05] px-3 py-3">
                <p className="font-display text-xl font-bold">{Math.round(you.accuracy * 100)}%</p>
                <p className="text-xs text-slate-400">{t('final.accuracy')}</p>
              </div>
              <div className="rounded-xl bg-mist/[0.05] px-3 py-3">
                <p className="font-display text-xl font-bold">{you.bestStreak}</p>
                <p className="text-xs text-slate-400">{t('final.bestStreak')}</p>
              </div>
            </div>
          </>
        )}

        {data.podium?.length > 0 && (
          <div className="mt-6 text-sm text-slate-400">
            <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">{t('final.topOfClass')}</p>
            {data.podium.map((p: any) => (
              <p key={p.rank}>
                {p.rank}. {p.nickname} — {p.score.toLocaleString()}
              </p>
            ))}
          </div>
        )}

        <button className="btn-ghost mt-6 w-full" type="button" onClick={onLeave}>
          {t('final.leave')}
        </button>
      </div>
    </div>
  );
}
