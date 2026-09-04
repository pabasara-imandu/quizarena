'use client';

import { useEffect, useState } from 'react';
import { ReactionOverlay } from '@/components/host/ReactionOverlay';
import type { HostPlayer } from '@/lib/types';

/**
 * The lobby is a projector screen first and a dashboard second: for a few
 * minutes it is the only thing thirty people are looking at, so the PIN gets
 * the whole stage and everything else stays quiet at the edges.
 */
export function HostLobby({
  pin,
  quizTitle,
  players,
  onStart,
  onKick,
  onEdit,
  questionCount,
  starting,
  reactionBurst,
}: {
  pin: string;
  quizTitle: string;
  players: HostPlayer[];
  onStart: () => void;
  onKick: (playerId: string) => void;
  /** Absent until the room's quiz is known (e.g. straight after a reconnect). */
  onEdit?: () => void;
  questionCount?: number;
  starting: boolean;
  reactionBurst?: { reactions: { emoji: string; count: number }[]; at: number } | null;
}) {
  const [joinUrl, setJoinUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setJoinUrl(window.location.origin + '/join?pin=' + pin);
  }, [pin]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked - the PIN on screen is the real fallback */
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px] lg:items-start">
      <ReactionOverlay bursts={reactionBurst ?? null} />

      <div className="surface relative overflow-hidden px-6 py-14 text-center sm:py-20">
        {/* Soft spotlight behind the PIN. */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/10 blur-3xl"
          aria-hidden
        />

        <div className="relative">
          <p className="eyebrow">Join at</p>
          <p className="mt-1.5 break-all text-[15px] font-medium text-brand-300">{joinUrl || '…'}</p>

          <p className="eyebrow mt-10">Game PIN</p>
          <p className="mt-1 font-display text-[clamp(3.5rem,13vw,7.5rem)] font-extrabold leading-none tracking-[0.08em] nums">
            {pin}
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-2.5">
            <button className="btn-secondary" type="button" onClick={copy}>
              {copied ? '✓ Link copied' : 'Copy join link'}
            </button>
            {/* Launching used to be a one-way door: spotting a typo on the
                projector meant abandoning the room and re-gathering everyone
                on a new PIN. The room survives the edit. */}
            {onEdit && (
              <button className="btn-secondary" type="button" onClick={onEdit} disabled={starting}>
                <span aria-hidden>✎</span> Edit quiz
              </button>
            )}
            <button
              className="btn-primary btn-lg"
              type="button"
              onClick={onStart}
              disabled={players.length === 0 || starting}
            >
              {starting ? 'Starting…' : 'Start quiz →'}
            </button>
          </div>

          <p className="mt-8 text-sm text-slate-500">
            {players.length === 0 ? (
              <span className="animate-breathe">Waiting for the first player…</span>
            ) : (
              <>
                <b className="text-slate-300 nums">{players.length}</b>{' '}
                {players.length === 1 ? 'player is' : 'players are'} ready
              </>
            )}
          </p>
          <p className="mt-1.5 text-xs text-slate-600">
            {quizTitle}
            {questionCount ? ' · ' + questionCount + (questionCount === 1 ? ' question' : ' questions') : ''}
          </p>
        </div>
      </div>

      <div className="surface flex max-h-[70vh] flex-col p-4">
        <div className="mb-3 flex items-center gap-2 px-1">
          <span className="eyebrow">In the room</span>
          <span className="ml-auto font-display text-lg font-bold text-emerald-300 nums">
            {players.length}
          </span>
        </div>

        {players.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-600">Nobody yet.</p>
        ) : (
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {players.map((p) => (
              <li
                key={p.id}
                className="group flex animate-pop items-center gap-2 rounded-xl px-2.5 py-2 transition hover:bg-white/[0.05]"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-500/20 text-[11px] font-bold text-brand-200">
                  {p.nickname.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{p.nickname}</span>
                {!p.connected && <span className="text-[11px] text-slate-600">offline</span>}
                <button
                  type="button"
                  className="shrink-0 rounded px-2 py-1 text-[11px] text-slate-600 transition hover:text-rose-300 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                  onClick={() => onKick(p.id)}
                  aria-label={'Remove ' + p.nickname}
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
