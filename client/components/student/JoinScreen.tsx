'use client';

import { useEffect, useRef, useState } from 'react';
import { serverUrl } from '@/lib/serverUrl';


interface RoomPreview {
  found: boolean;
  quizTitle?: string;
  playerCount?: number;
  acceptingJoins?: boolean;
}

export function JoinScreen({
  initialPin,
  onJoin,
  busy,
  error,
}: {
  initialPin?: string;
  onJoin: (pin: string, nickname: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const [pin, setPin] = useState(initialPin ?? '');
  const [nickname, setNickname] = useState('');
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  const nicknameRef = useRef<HTMLInputElement>(null);

  /**
   * Check the PIN over plain HTTP before opening a socket. It costs one cheap
   * request and saves a student from typing a nickname into a room that does
   * not exist — the single most common join failure in a classroom.
   */
  useEffect(() => {
    if (pin.length !== 6) {
      setPreview(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(serverUrl() + '/api/rooms/' + pin, { signal: controller.signal });
        const data: RoomPreview = res.ok ? await res.json() : { found: false };
        setPreview(data);
        if (data.found) nicknameRef.current?.focus();
      } catch {
        /* aborted or offline - the socket join will report the real error */
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [pin]);

  const ready = pin.length === 6 && nickname.trim().length >= 2 && !busy;
  const found = preview?.found && preview.acceptingJoins;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">
          Quiz<span className="text-brand-400">Arena</span>
        </h1>
      </div>

      <form
        className="surface space-y-5 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onJoin(pin, nickname.trim());
        }}
      >
        <div>
          <label className="field-label text-center" htmlFor="pin">
            Game PIN
          </label>
          <input
            id="pin"
            className={
              'field py-4 text-center font-display text-[2.25rem] font-extrabold tracking-[0.35em] nums ' +
              (found ? 'border-emerald-500/50 focus:border-emerald-500/70' : '')
            }
            // inputMode + pattern gets phones to open the number pad instead of
            // a full keyboard, which matters when 30 people type at once.
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={6}
            placeholder="000000"
            value={pin}
            autoFocus={!initialPin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <div className="mt-2 min-h-[1.25rem] text-center text-sm">
            {preview?.found === false && (
              <span className="text-rose-300">No room with that PIN.</span>
            )}
            {found && (
              <span className="text-emerald-300">
                ✓ {preview!.quizTitle} · {preview!.playerCount} waiting
              </span>
            )}
            {preview?.found && !preview.acceptingJoins && (
              <span className="text-amber-300">That quiz has already started.</span>
            )}
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="nickname">
            Your nickname
          </label>
          <input
            id="nickname"
            ref={nicknameRef}
            className="field py-3.5 text-center text-lg"
            maxLength={18}
            autoComplete="off"
            placeholder="Pick a name"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2.5 text-center text-sm text-rose-200"
          >
            {error}
          </p>
        )}

        <button className="btn-primary w-full py-4 text-lg" type="submit" disabled={!ready}>
          {busy ? 'Joining…' : 'Enter'}
        </button>
      </form>

      <p className="mt-6 px-4 text-center text-xs leading-relaxed text-slate-600">
        Your teacher may ask this quiz to run in full-screen, and will be told if you leave the tab
        while a question is live.
      </p>
    </div>
  );
}
