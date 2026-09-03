'use client';

import { EmojiBar } from '@/components/ui/EmojiBar';
import type { Reaction } from '@/lib/types';

export function WaitingRoom({
  nickname,
  quizTitle,
  playerCount,
  requireFullscreen,
  fullscreenSupported,
  isFullscreen,
  onEnterFullscreen,
  allowReactions,
  onReact,
}: {
  nickname: string;
  quizTitle?: string;
  playerCount?: number;
  requireFullscreen: boolean;
  fullscreenSupported: boolean;
  isFullscreen: boolean;
  onEnterFullscreen: () => void;
  allowReactions?: boolean;
  onReact?: (emoji: Reaction) => void;
}) {
  const needsFullscreen = requireFullscreen && fullscreenSupported && !isFullscreen;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-5 py-10 text-center">
      <div className="surface w-full p-7">
        <p className="eyebrow">You are in</p>
        <p className="mt-2 font-display text-4xl font-extrabold">{nickname}</p>
        {quizTitle && <p className="mt-2 text-sm text-slate-500">{quizTitle}</p>}

        {needsFullscreen ? (
          <div className="mt-8 rounded-2xl border border-amber-400/25 bg-amber-500/[0.08] p-5">
            <p className="text-3xl">⛶</p>
            <p className="mt-2 font-display text-lg font-bold text-amber-200">
              One more step: go full-screen
            </p>
            <p className="mt-2 text-sm leading-relaxed text-amber-100/70">
              Your teacher has asked everyone to play in full-screen. Your browser will only let us
              do that when you tap the button yourself.
            </p>
            <button
              className="btn-primary mt-4 w-full py-3"
              type="button"
              onClick={onEnterFullscreen}
            >
              Enter full-screen
            </button>
          </div>
        ) : (
          <div className="mt-9">
            <div className="flex items-center justify-center gap-2">
              <Dot />
              <Dot delay="150ms" />
              <Dot delay="300ms" />
            </div>
            <p className="mt-4 font-display text-lg font-semibold">Waiting for the host to start…</p>
            {typeof playerCount === 'number' && playerCount > 0 && (
              <p className="mt-1 text-sm text-slate-500 nums">
                {playerCount} {playerCount === 1 ? 'player' : 'players'} in the room
              </p>
            )}
            {requireFullscreen && fullscreenSupported && (
              <p className="mt-4 text-xs text-emerald-300">Full-screen active ✓</p>
            )}
          </div>
        )}
      </div>

      {/* Reactions in the lobby give a class something to do with the dead time
          while everyone joins — and give the teacher a read on the room. */}
      {allowReactions && onReact && !needsFullscreen && (
        <div className="mt-7 w-full">
          <EmojiBar onSend={onReact} label="Say hello on the big screen" />
        </div>
      )}

      <p className="mt-7 px-4 text-xs leading-relaxed text-slate-600">
        Keep this tab open. Leaving it while a question is live will be flagged to your teacher.
      </p>
    </div>
  );
}

function Dot({ delay = '0ms' }: { delay?: string }) {
  return (
    <span
      className="h-2.5 w-2.5 animate-breathe rounded-full bg-brand-400"
      style={{ animationDelay: delay }}
    />
  );
}
