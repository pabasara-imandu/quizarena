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
  numeric = false,
  unit,
}: {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  submitted?: boolean;
  submittedText?: string | null;
  /** Number entry: a decimal keypad, and the unit shown so it is not typed. */
  numeric?: boolean;
  unit?: string | null;
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
          {numeric && unit ? <span className="ml-1.5 text-lg text-slate-400">{unit}</span> : null}
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
      <div className="relative">
        <input
          ref={inputRef}
          className={'input py-4 text-center font-display text-xl' + (numeric && unit ? ' pr-16' : '')}
          placeholder={numeric ? 'Type a number' : 'Type your answer'}
          maxLength={numeric ? 40 : 120}
          inputMode={numeric ? 'decimal' : 'text'}
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="send"
        />
        {numeric && unit && (
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-500">
            {unit}
          </span>
        )}
      </div>
      <button
        type="submit"
        className="btn-primary w-full py-3.5 text-lg"
        disabled={disabled || value.trim().length === 0}
      >
        Submit answer
      </button>
      <p className="text-center text-xs text-slate-500">
        {numeric
          ? 'Just the number. A decimal comma is fine.'
          : 'Spelling counts, but capital letters and extra spaces do not.'}
      </p>
    </form>
  );
}
