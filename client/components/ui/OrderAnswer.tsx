'use client';

import { useState } from 'react';
import type { Option } from '@/lib/types';
import { useT } from '@/lib/i18n';

const TONE = ['bg-rose-500', 'bg-sky-500', 'bg-amber-500', 'bg-emerald-500', 'bg-violet-500', 'bg-orange-500'];

/**
 * Put-in-order answering, built for thumbs.
 *
 * No drag and drop: on a phone, dragging fights the page scroll and a nervous
 * student under a timer drops items in the wrong place. Instead you tap items
 * in the order you think is right - each tap moves the item from the pool to
 * the end of your sequence, and tapping it in the sequence sends it back.
 * Two lists, one gesture, nothing to hold.
 */
export function OrderAnswer({
  options,
  onSubmit,
  disabled,
  submitted,
  submittedOrder,
}: {
  options: Option[];
  onSubmit: (order: string[]) => void;
  disabled?: boolean;
  submitted?: boolean;
  submittedOrder?: string[] | null;
}) {
  const t = useT();
  const [order, setOrder] = useState<string[]>([]);
  const byId = new Map(options.map((o) => [o.id, o]));
  const tone = (id: string) => TONE[options.findIndex((o) => o.id === id) % TONE.length];

  if (submitted) {
    const shown = submittedOrder ?? order;
    return (
      <div className="rounded-2xl border border-mist/10 bg-mist/5 p-4">
        <p className="mb-2 text-center text-sm text-slate-400">{t('order.yourOrder')}</p>
        <ol className="space-y-1.5">
          {shown.map((id, i) => (
            <li key={id} className="flex items-center gap-3 rounded-xl bg-mist/[0.04] px-3 py-2">
              <span className={'grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm font-bold text-white ' + tone(id)}>
                {i + 1}
              </span>
              <span className="font-medium">{byId.get(id)?.text}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const pool = options.filter((o) => !order.includes(o.id));
  const complete = order.length === options.length;

  return (
    <div className="space-y-3">
      {/* The sequence being built. Empty slots show how many remain. */}
      <ol className="space-y-1.5">
        {options.map((_, i) => {
          const id = order[i];
          const option = id ? byId.get(id) : null;
          return (
            <li key={i}>
              {option ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setOrder((o) => o.filter((x) => x !== id))}
                  className={
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-semibold text-white shadow-soft transition active:scale-[0.98] ' +
                    tone(id)
                  }
                  aria-label={t('order.removeAria', { item: option.text, n: i + 1 })}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-black/25 text-sm nums">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-[16px]">{option.text}</span>
                  <span className="text-xs opacity-80">{t('order.tapToUndo')}</span>
                </button>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-dashed border-mist/15 px-3 py-2.5 text-slate-600">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-mist/[0.04] text-sm nums">
                    {i + 1}
                  </span>
                  <span className="text-sm">{i === order.length ? t('order.tapNext') : ''}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* The pool of what is left to place. */}
      {pool.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {pool.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={disabled}
              onClick={() => setOrder((prev) => [...prev, o.id])}
              className={
                'rounded-xl px-3 py-3 text-left text-[16px] font-semibold text-white shadow-soft transition hover:-translate-y-0.5 active:scale-[0.98] ' +
                tone(o.id)
              }
            >
              {o.text}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className="btn-primary w-full py-3.5 text-lg"
        disabled={disabled || !complete}
        onClick={() => onSubmit(order)}
      >
        {complete ? t('order.submit') : t.n('order.left', options.length - order.length)}
      </button>
    </div>
  );
}
