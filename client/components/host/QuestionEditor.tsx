'use client';

import { useState } from 'react';
import { QuestionMedia } from '@/components/ui/QuestionMedia';
import type { Option, Question } from '@/lib/types';

const uid = () => Math.random().toString(36).slice(2, 10);

const TILE_TONE = [
  'bg-rose-500',
  'bg-sky-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-orange-500',
];
const TILE_GLYPH = ['▲', '◆', '●', '■', '★', '⬟'];

const POINT_STEPS = [500, 800, 1000, 1200, 1500, 2000];
const TIME_STEPS = [10, 20, 30, 45, 60, 120];

/**
 * Presets, plus the current value if it is not one of them.
 *
 * An imported spreadsheet can carry any time limit the server allows, and a
 * value with no matching pill would leave the whole row looking unselected.
 * Splicing it in keeps the control honest about what is actually set.
 */
function stepsIncluding(steps: number[], value: number) {
  return steps.includes(value) ? steps : [...steps, value].sort((a, b) => a - b);
}

/**
 * Editor for a single question.
 *
 * Everything the old inline card had is still here, but the rarely-used parts
 * (images, case sensitivity) are folded behind a disclosure so the common path
 * - write a question, write four answers, mark one correct - is the only thing
 * on screen by default.
 */
export function QuestionEditor({
  question,
  index,
  total,
  onPatch,
}: {
  question: Question;
  index: number;
  total: number;
  onPatch: (patch: Partial<Question>) => void;
}) {
  const [showMedia, setShowMedia] = useState(!!question.image);

  const patchOption = (oi: number, patch: Partial<Option>) =>
    onPatch({ options: question.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) });

  // Exactly one correct answer keeps scoring unambiguous, so marking one
  // clears the others rather than toggling freely.
  const setCorrect = (oi: number) =>
    onPatch({ options: question.options.map((o, j) => ({ ...o, correct: j === oi })) });

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <span className="chip-brand nums">
          Question {index + 1} of {total}
        </span>
        <span className="text-sm text-slate-500">
          {question.type === 'multiple'
            ? 'Multiple choice'
            : question.type === 'truefalse'
              ? 'True or false'
              : 'Short answer'}
        </span>
      </header>

      {/* ------------------------------------------------------------ prompt */}
      <div>
        <textarea
          className="field min-h-[96px] resize-y font-display text-xl leading-snug"
          placeholder="What do you want to ask?"
          maxLength={500}
          value={question.text}
          onChange={(e) => onPatch({ text: e.target.value })}
        />

        {showMedia ? (
          <div className="mt-3 animate-rise">
            <label className="field-label" htmlFor={'img-' + question.id}>
              Image URL
            </label>
            <div className="flex gap-2">
              <input
                id={'img-' + question.id}
                className="field"
                placeholder="https://…"
                value={question.image ?? ''}
                onChange={(e) => onPatch({ image: e.target.value || null })}
              />
              <button
                type="button"
                className="btn-ghost shrink-0"
                onClick={() => {
                  onPatch({ image: null });
                  setShowMedia(false);
                }}
              >
                Remove
              </button>
            </div>
            <QuestionMedia src={question.image} className="mt-3" maxHeight="11rem" />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowMedia(true)}
            className="mt-2 text-[13px] font-medium text-slate-500 transition hover:text-brand-300"
          >
            + Add an image
          </button>
        )}
      </div>

      {/* ------------------------------------------------------- time/points */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="field-label mb-0">Time limit</span>
            <span className="font-display text-lg font-bold text-brand-300 nums">
              {question.timeLimitSec}s
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stepsIncluding(TIME_STEPS, question.timeLimitSec).map((t) => (
              <PillChoice
                key={t}
                active={question.timeLimitSec === t}
                onClick={() => onPatch({ timeLimitSec: t })}
              >
                {t}s
              </PillChoice>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="field-label mb-0">Points</span>
            <span className="font-display text-lg font-bold text-brand-300 nums">
              {question.points}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stepsIncluding(POINT_STEPS, question.points).map((p) => (
              <PillChoice
                key={p}
                active={question.points === p}
                onClick={() => onPatch({ points: p })}
              >
                {p}
              </PillChoice>
            ))}
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* ----------------------------------------------------------- answers */}
      {question.type === 'short' ? (
        <ShortAnswerFields question={question} onPatch={onPatch} />
      ) : (
        <ChoiceFields
          question={question}
          onPatchOption={patchOption}
          onSetCorrect={setCorrect}
          onPatch={onPatch}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ChoiceFields({
  question,
  onPatchOption,
  onSetCorrect,
  onPatch,
}: {
  question: Question;
  onPatchOption: (oi: number, patch: Partial<Option>) => void;
  onSetCorrect: (oi: number) => void;
  onPatch: (patch: Partial<Question>) => void;
}) {
  const [imageFor, setImageFor] = useState<string | null>(null);
  const locked = question.type === 'truefalse';

  // `min-w-0` on the fieldset defeats the UA stylesheet's
  // `min-width: min-content`, which otherwise stops the answer list shrinking
  // on a phone and pushes the whole row off the right edge of the screen.
  return (
    <fieldset className="min-w-0">
      <legend className="field-label mb-3">
        Answers
        <span className="ml-2 font-normal text-slate-600">tap the circle to mark the right one</span>
      </legend>

      <div className="space-y-2">
        {question.options.map((option, oi) => {
          const showImageField = imageFor === option.id || !!option.image;

          return (
            <div key={option.id}>
              <div
                className={
                  'flex min-w-0 items-center gap-2.5 rounded-xl border p-2 transition ' +
                  (option.correct
                    ? 'border-emerald-500/40 bg-emerald-500/[0.07]'
                    : 'border-white/[0.06] bg-white/[0.02]')
                }
              >
                <span
                  className={
                    'grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm text-white ' +
                    TILE_TONE[oi % TILE_TONE.length]
                  }
                  aria-hidden
                >
                  {TILE_GLYPH[oi % TILE_GLYPH.length]}
                </span>

                <button
                  type="button"
                  onClick={() => onSetCorrect(oi)}
                  aria-label={'Mark answer ' + (oi + 1) + ' as correct'}
                  aria-pressed={!!option.correct}
                  className={
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-xs transition ' +
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ' +
                    (option.correct
                      ? 'border-emerald-400 bg-emerald-500 text-white'
                      : 'border-white/20 text-transparent hover:border-emerald-400/60')
                  }
                >
                  ✓
                </button>

                <input
                  className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-[15px] text-slate-100 placeholder:text-slate-600 focus:outline-none"
                  placeholder={'Answer ' + (oi + 1)}
                  maxLength={200}
                  readOnly={locked}
                  value={option.text}
                  onChange={(e) => onPatchOption(oi, { text: e.target.value })}
                />

                {!locked && (
                  <>
                    <button
                      type="button"
                      onClick={() => setImageFor(showImageField ? null : option.id)}
                      aria-label={'Toggle image for answer ' + (oi + 1)}
                      className={
                        'shrink-0 rounded-lg px-2 py-1 text-xs transition ' +
                        (option.image
                          ? 'text-brand-300'
                          : 'text-slate-600 hover:bg-white/5 hover:text-slate-300')
                      }
                    >
                      ▤
                    </button>
                    {question.options.length > 2 && (
                      <button
                        type="button"
                        onClick={() =>
                          onPatch({ options: question.options.filter((_, j) => j !== oi) })
                        }
                        aria-label={'Remove answer ' + (oi + 1)}
                        className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-600 transition hover:bg-rose-500/10 hover:text-rose-300"
                      >
                        ✕
                      </button>
                    )}
                  </>
                )}
              </div>

              {showImageField && !locked && (
                <div className="mt-1.5 flex animate-rise items-center gap-2 pl-12">
                  <input
                    className="field py-1.5 text-[13px]"
                    placeholder="Answer image URL"
                    value={option.image ?? ''}
                    onChange={(e) => onPatchOption(oi, { image: e.target.value || null })}
                  />
                  {option.image && (
                    <img
                      src={option.image}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="h-9 w-9 shrink-0 rounded-lg object-cover"
                      onError={(e) => {
                        e.currentTarget.style.visibility = 'hidden';
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {question.type === 'multiple' && question.options.length < 6 && (
        <button
          type="button"
          className="mt-2.5 text-[13px] font-medium text-slate-500 transition hover:text-brand-300"
          onClick={() =>
            onPatch({ options: [...question.options, { id: uid(), text: '', correct: false }] })
          }
        >
          + Add another answer
        </button>
      )}
    </fieldset>
  );
}

function ShortAnswerFields({
  question,
  onPatch,
}: {
  question: Question;
  onPatch: (patch: Partial<Question>) => void;
}) {
  const accepted = question.acceptedAnswers ?? [''];

  return (
    <fieldset className="min-w-0">
      <legend className="field-label mb-3">
        Accepted answers
        <span className="ml-2 font-normal text-slate-600">any one of these counts as correct</span>
      </legend>

      <div className="space-y-2">
        {accepted.map((answer, i) => (
          <div
            key={i}
            className="flex min-w-0 items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-xs font-bold text-emerald-300 nums">
              {i + 1}
            </span>
            <input
              className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-[15px] text-slate-100 placeholder:text-slate-600 focus:outline-none"
              placeholder={i === 0 ? 'The answer' : 'Another accepted spelling'}
              maxLength={120}
              value={answer}
              onChange={(e) =>
                onPatch({ acceptedAnswers: accepted.map((a, j) => (j === i ? e.target.value : a)) })
              }
            />
            {accepted.length > 1 && (
              <button
                type="button"
                onClick={() => onPatch({ acceptedAnswers: accepted.filter((_, j) => j !== i) })}
                aria-label={'Remove accepted answer ' + (i + 1)}
                className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-600 transition hover:bg-rose-500/10 hover:text-rose-300"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        {accepted.length < 12 && (
          <button
            type="button"
            className="text-[13px] font-medium text-slate-500 transition hover:text-brand-300"
            onClick={() => onPatch({ acceptedAnswers: [...accepted, ''] })}
          >
            + Add an alternative
          </button>
        )}
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-slate-400">
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-brand-500"
            checked={!!question.caseSensitive}
            onChange={(e) => onPatch({ caseSensitive: e.target.checked })}
          />
          Match capitals exactly
        </label>
      </div>

      <p className="field-hint">
        Extra spaces are always forgiven. Add the spellings you would accept in a book — students
        lose marks to typos you did not think of, not the ones you did.
      </p>
    </fieldset>
  );
}

function PillChoice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition nums ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ' +
        (active
          ? 'bg-brand-500 text-white'
          : 'bg-white/[0.05] text-slate-400 hover:bg-white/[0.1] hover:text-slate-100')
      }
    >
      {children}
    </button>
  );
}
