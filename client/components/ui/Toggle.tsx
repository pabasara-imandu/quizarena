'use client';

/**
 * A real switch rather than a checkbox in a bordered box.
 *
 * The old settings grid used nine bordered checkbox cards side by side, which
 * read as nine competing panels. A switch list reads as one list.
 */
export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={
        'flex cursor-pointer items-start gap-3 rounded-xl px-3 py-3 transition hover:bg-white/[0.04] ' +
        (disabled ? 'pointer-events-none opacity-40' : '')
      }
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ' +
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ' +
          'focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900 ' +
          (checked ? 'bg-brand-500' : 'bg-ink-600')
        }
      >
        {/* `left` is set explicitly: an absolutely-positioned child with `left:auto`
            falls back to its static position, which a button's centred text-align
            puts in the middle of the track - so the knob escaped past the edge. */}
        <span
          className={
            'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ' +
            (checked ? 'translate-x-5' : 'translate-x-0')
          }
        />
      </button>

      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-tight text-slate-100">{label}</span>
        {hint && <span className="mt-1 block text-[13px] leading-snug text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

/** Horizontal segmented control. One visible choice, no radio-button clutter. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; badge?: number }[];
  ariaLabel: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className="segmented-item"
        >
          {option.label}
          {option.badge !== undefined && option.badge > 0 && (
            <span className="ml-1.5 rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] nums">
              {option.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
