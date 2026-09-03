'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Free-text answer entry.
 *
 * Autocomplete, autocorrect, spellcheck and capitalisation are all off: a
 * phone keyboard "helpfully" capitalising or autocorrecting a one-word answer
 * is a real source of wrong marks, and the grader is a string comparison.
 */
export function ShortAnswer({
  onSubmit,
  disabled,
  submitted,
  submittedText,
}: {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  submitted?: boolean;
  submittedText?: string | null;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled && !submitted) inputRef.current?.focus();
  }, [disabled, submitted]);

  if (submitted) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
        <p className="text-sm text-slate-400">Your answer</p>
        <p className="mt-1 break-words font-display text-2xl font-bold">
          {submittedText || value || '—'}
        </p>
        <p className="mt-2 text-sm text-slate-500">Locked in. Sit tight…</p>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (trimmed && !disabled) onSubmit(trimmed);
      }}
    >
      <input
        ref={inputRef}
        className="input py-4 text-center font-display text-xl"
        placeholder="Type your answer"
        maxLength={120}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="send"
      />
      <button
        type="submit"
        className="btn-primary w-full py-3.5 text-lg"
        disabled={disabled || value.trim().length === 0}
      >
        Submit answer
      </button>
      <p className="text-center text-xs text-slate-500">
        Spelling counts, but capital letters and extra spaces do not.
      </p>
    </form>
  );
}
