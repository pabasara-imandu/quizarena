'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { QuizCreator } from '@/components/host/QuizCreator';
import { HostLobby } from '@/components/host/HostLobby';
import { HostLive, type RevealState } from '@/components/host/HostLive';
import { HostAnalytics } from '@/components/host/HostAnalytics';
import { useSocket, useSocketEvent } from '@/lib/socket';
import type {
  Analytics,
  HostSync,
  IntegrityEntry,
  LeaderboardRow,
  LiveQuestion,
  Phase,
  Quiz,
  RoomSettings,
} from '@/lib/types';

const STORE_KEY = 'quizarena.host';

export default function HostPage() {
  const { status, emit, rtt } = useSocket();

  const [pin, setPin] = useState<string | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [quizTitle, setQuizTitle] = useState('');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [settings, setSettings] = useState<RoomSettings | null>(null);
  const [editing, setEditing] = useState(false);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [phase, setPhase] = useState<Phase>('lobby');
  const [question, setQuestion] = useState<LiveQuestion | null>(null);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [startAt, setStartAt] = useState<number | null>(null);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [sync, setSync] = useState<HostSync | null>(null);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [integrity, setIntegrity] = useState<IntegrityEntry[]>([]);
  const [reactionBurst, setReactionBurst] = useState<{
    reactions: { emoji: string; count: number }[];
    at: number;
  } | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyState = useCallback((state: any) => {
    setPhase(state.phase);
    setQuestion(state.question ?? null);
    setStartAt(state.startAt ?? null);
    setEndAt(state.endAt ?? null);
    setTotalQuestions(state.total ?? 0);
    setPendingIndex(state.index ?? null);
  }, []);

  /* ------------------------------------------------------------ reconnect */

  /**
   * The host's laptop losing Wi-Fi must not end the lesson for 30 students.
   * The PIN and host token live in sessionStorage, and we re-claim the room on
   * every (re)connect - Socket.IO gives us a brand new socket id each time.
   */
  useEffect(() => {
    if (status !== 'connected') return;
    const saved = sessionStorage.getItem(STORE_KEY);
    if (!saved) return;

    const parsed = JSON.parse(saved) as { pin: string; hostToken: string };

    emit<any>('host:rejoin', parsed)
      .then((res) => {
        if (!res?.ok) {
          sessionStorage.removeItem(STORE_KEY);
          return;
        }
        setPin(res.pin);
        setHostToken(parsed.hostToken);
        setQuizTitle(res.quiz.title);
        setQuiz(res.quiz);
        setSettings(res.settings);
        applyState(res.state);
        if (res.analytics) setAnalytics(res.analytics);
      })
      .catch(() => sessionStorage.removeItem(STORE_KEY));
  }, [status, emit, applyState]);

  /* --------------------------------------------------------- socket events */

  useSocketEvent<HostSync>('host:sync', (payload) => {
    setSync(payload);
    setLeaderboard(
      [...payload.players]
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)
        .map((p, i) => ({
          rank: i + 1,
          id: p.id,
          nickname: p.nickname,
          score: p.score,
          streak: p.streak,
          connected: p.connected,
        }))
    );
  });

  useSocketEvent<any>('game:leadIn', (p) => {
    setPhase('leadIn');
    setReveal(null);
    // Drop the previous question outright. Leaving it on screen behind a "get
    // ready" badge showed the class the wrong question for three seconds.
    setQuestion(null);
    setPendingIndex(p.index);
    setTotalQuestions(p.total);
    setStartAt(p.startAt);
    setEndAt(null);
  });

  useSocketEvent<any>('game:question', (p) => {
    setPhase('question');
    setQuestion(p.question);
    setPendingIndex(p.question?.index ?? null);
    setStartAt(p.startAt);
    setEndAt(p.endAt);
    setReveal(null);
  });

  useSocketEvent<RevealState>('game:reveal', (p) => {
    setPhase('reveal');
    setReveal(p);
    setLeaderboard(p.leaderboard.top);
  });

  useSocketEvent<any>('game:leaderboard', (p) => {
    setPhase('leaderboard');
    setLeaderboard(p.top);
  });

  useSocketEvent<Analytics>('game:over', (p) => {
    setPhase('ended');
    setAnalytics(p);
  });

  useSocketEvent<IntegrityEntry>('integrity:alert', (entry) => {
    setIntegrity((log) => [...log.slice(-199), entry]);
  });

  useSocketEvent<{ reactions: { emoji: string; count: number }[] }>('reaction:burst', (p) => {
    // `at` gives the overlay a fresh object identity even when the same emoji
    // arrives twice in a row, so its effect re-fires.
    setReactionBurst({ reactions: p.reactions, at: Date.now() });
  });

  /* -------------------------------------------------------------- actions */

  const run = useCallback(
    async (event: string, payload?: unknown) => {
      setBusy(true);
      setError(null);
      try {
        const res = await emit<any>(event, payload);
        if (!res?.ok) setError(res?.message || 'That did not work.');
        return res;
      } catch (err) {
        setError((err as Error).message);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [emit]
  );

  const launch = async (quiz: Quiz, roomSettings: RoomSettings) => {
    const res = await run('host:create', { quiz, settings: roomSettings });
    if (!res?.ok) return;
    sessionStorage.setItem(STORE_KEY, JSON.stringify({ pin: res.pin, hostToken: res.hostToken }));
    setPin(res.pin);
    setHostToken(res.hostToken);
    setQuizTitle(res.quiz.title);
    setQuiz(res.quiz);
    setSettings(res.settings);
    setTotalQuestions(res.quiz.questions.length);
    applyState(res.state);
  };

  /**
   * Save an edit made after the room was already open.
   *
   * Same room, same PIN, same people: nobody who has already joined has to do
   * anything. The server refuses this once the first question has started.
   */
  const saveEdits = async (nextQuiz: Quiz, nextSettings: RoomSettings) => {
    const res = await run('host:updateQuiz', { quiz: nextQuiz, settings: nextSettings });
    if (!res?.ok) return;
    setQuizTitle(res.quiz.title);
    setQuiz(res.quiz);
    setSettings(res.settings);
    setTotalQuestions(res.quiz.questions.length);
    applyState(res.state);
    setEditing(false);
  };

  const restart = () => {
    sessionStorage.removeItem(STORE_KEY);
    setPin(null);
    setHostToken(null);
    setQuiz(null);
    setEditing(false);
    setAnalytics(null);
    setPhase('lobby');
    setQuestion(null);
    setReveal(null);
    setSync(null);
    setLeaderboard([]);
    setIntegrity([]);
    setReactionBurst(null);
  };

  /* ------------------------------------------------------------------ view */

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/" className="font-display text-lg font-extrabold tracking-tight">
          Quiz<span className="text-brand-400">Arena</span>
        </Link>
        <span className="chip-neutral text-[10px] uppercase tracking-[0.14em]">Host</span>

        {pin && (
          <span className="chip-brand font-display text-sm font-bold tracking-[0.2em] nums">
            {pin}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          <span
            className={
              'h-2 w-2 rounded-full ' +
              (status === 'connected'
                ? 'bg-emerald-400'
                : status === 'reconnecting'
                  ? 'animate-breathe bg-amber-400'
                  : 'bg-rose-400')
            }
          />
          {status === 'connected' ? rtt + 'ms' : status}
        </div>
      </header>

      {status !== 'connected' && !pin && (
        <div className="surface mb-5 border-amber-400/25 bg-amber-500/[0.08] p-4 text-sm text-amber-200">
          {status === 'connecting'
            ? 'Connecting to the quiz server…'
            : 'Lost the connection to the quiz server. Reconnecting automatically…'}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="surface mb-5 border-rose-400/25 bg-rose-500/[0.08] p-4 text-sm text-rose-200"
        >
          {error}
        </div>
      )}

      {!pin && <QuizCreator onLaunch={launch} busy={busy} error={null} />}

      {pin && phase === 'lobby' && editing && quiz && settings && (
        <QuizCreator
          onLaunch={saveEdits}
          busy={busy}
          error={null}
          editing={{ quiz, settings }}
          onCancelEdit={() => setEditing(false)}
        />
      )}

      {pin && phase === 'lobby' && !editing && (
        <HostLobby
          pin={pin}
          quizTitle={quizTitle}
          players={sync?.players ?? []}
          starting={busy}
          onStart={() => run('host:start')}
          onKick={(playerId) => run('host:kick', { playerId })}
          onEdit={quiz && settings ? () => setEditing(true) : undefined}
          questionCount={totalQuestions}
          reactionBurst={reactionBurst}
        />
      )}

      {pin && ['leadIn', 'question', 'reveal', 'leaderboard'].includes(phase) && (
        <HostLive
          phase={phase}
          question={question}
          pendingIndex={pendingIndex}
          totalQuestions={totalQuestions}
          startAt={startAt}
          endAt={endAt}
          sync={sync}
          reveal={reveal}
          leaderboard={leaderboard}
          integrity={integrity}
          reactionBurst={reactionBurst}
          strikeLimit={settings?.strikeLimit ?? 0}
          busy={busy}
          onNext={() => run('host:next')}
          onSkipTimer={() => run('host:skipTimer')}
          onEnd={() => run('host:end')}
          onClearStrikes={(playerId) => run('host:clearStrikes', { playerId })}
        />
      )}

      {analytics && phase === 'ended' && (
        <HostAnalytics
          data={analytics}
          pin={pin}
          hostToken={hostToken}
          onRestart={restart}
        />
      )}
    </main>
  );
}
