'use client';

import { useState } from 'react';
import { QuestionMedia } from '@/components/ui/QuestionMedia';
import { ImagePicker } from '@/components/ui/ImagePicker';
import { QUESTION_TYPE_LABEL, type Option, type Question, type QuestionType } from '@/lib/types';
import { useT, type Translator } from '@/lib/i18n';

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

const TIME_CHOICES = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300];
const POINT_CHOICES = [0, 500, 800, 1000, 1200, 1500, 2000, 3000, 5000];

/** The choices, plus the current value if it is not one of them (imports can carry any). */
const including = (choices: number[], value: number) =>
  choices.includes(value) ? choices : [...choices, value].sort((a, b) => a - b);

const blankOption = (): Option => ({ id: uid(), text: '', correct: false });

/**
 * Change a question's type in place.
 *
 * Keeps everything that survives the change - the text, image, explanation,
 * time and points - and gives the type-specific part a sensible shape, so a
 * teacher who picked the wrong type does not lose the question they wrote.
 */
export function convertQuestion(q: Question, type: QuestionType, t: Translator): Question {
  const base = {
    id: q.id,
    text: q.text,
    image: q.image ?? null,
    explanation: q.explanation ?? null,
    timeLimitSec: q.timeLimitSec,
    points: q.points,
  };
  const tiles = q.options.length >= 2 ? q.options : [blankOption(), blankOption(), blankOption(), blankOption()];

  switch (type) {
    case 'truefalse':
      return {
        ...base,
        type,
        options: [
          { id: 'true', text: t('type.true'), correct: true },
          { id: 'false', text: t('type.false'), correct: false },
        ],
      };
    case 'short':
      return { ...base, type, options: [], acceptedAnswers: q.acceptedAnswers?.length ? q.acceptedAnswers : [''], caseSensitive: !!q.caseSensitive };
    case 'numeric':
      return { ...base, type, options: [], answer: q.answer ?? 0, tolerance: q.tolerance ?? 0, unit: q.unit ?? null };
    case 'multiple': {
      const firstCorrect = tiles.findIndex((o) => o.correct);
      return {
        ...base,
        type,
        options: tiles.map((o, i) => ({ ...o, correct: i === (firstCorrect < 0 ? 0 : firstCorrect) })),
      };
    }
    case 'multiselect':
      return { ...base, type, options: tiles.map((o) => ({ ...o, correct: !!o.correct })) };
    case 'ordering':
    case 'poll':
      return { ...base, type, options: tiles.map((o) => ({ ...o, correct: false })) };
  }
}

/**
 * Editor for a single question.
 *
 * One thing on screen by default: the prompt and its answers. Type is a select
 * in the header so a question can be re-shaped without re-typing it; time and
 * points are two small pickers rather than twelve pills; images and the
 * explanation live behind quiet links until wanted.
 */
export function QuestionEditor({
  question,
  index,
  total,
  onPatch,
  onReplace,
}: {
  question: Question;
  index: number;
  total: number;
  onPatch: (patch: Partial<Question>) => void;
  /** Whole-question replacement, for a type change. */
  onReplace: (next: Question) => void;
}) {
  const t = useT();
  const [showMedia, setShowMedia] = useState(!!question.image);
  const [showExplanation, setShowExplanation] = useState(!!question.explanation);

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------ header */}
      <header className="flex flex-wrap items-center gap-3">
        <span className="chip-brand nums">{t('editor.questionOf', { n: index + 1, total })}</span>
        <label className="ml-auto flex items-center gap-2 text-[13px] text-slate-500">
          <span className="hidden sm:inline">{t('editor.type')}</span>
          <select
            className="select-pill"
            value={question.type}
            aria-label={t('editor.typeAria')}
            onChange={(e) => onReplace(convertQuestion(question, e.target.value as QuestionType, t))}
          >
            {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((type) => (
              <option key={type} value={type}>
                {t(('type.' + type) as 'type.multiple')}
              </option>
            ))}
          </select>
        </label>
      </header>

      {/* ------------------------------------------------------------ prompt */}
      <div>
        <textarea
          className="field min-h-[92px] resize-y font-display text-xl leading-snug"
          placeholder={question.type === 'poll' ? t('editor.promptPlaceholderPoll') : t('editor.promptPlaceholder')}
          maxLength={500}
          value={question.text}
          onChange={(e) => onPatch({ text: e.target.value })}
        />

        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
          {!showMedia && !question.image && (
            <QuietLink onClick={() => setShowMedia(true)}>{t('editor.addImage')}</QuietLink>
          )}
          {!showExplanation && !question.explanation && (
            <QuietLink onClick={() => setShowExplanation(true)}>{t('editor.addExplanation')}</QuietLink>
          )}
        </div>

        {(showMedia || question.image) && (
          <div className="mt-3 animate-rise">
            <ImagePicker
              label={t('editor.image')}
              value={question.image}
              onChange={(url) => {
                onPatch({ image: url });
                if (!url) setShowMedia(false);
              }}
            />
            <QuestionMedia src={question.image} className="mt-3" maxHeight="11rem" />
          </div>
        )}

        {(showExplanation || question.explanation) && (
          <div className="mt-3 animate-rise">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="field-label mb-0">{t('editor.explanation')}</span>
              <span className="text-[12px] text-slate-600">{t('editor.explanationShown')}</span>
            </div>
            <textarea
              className="field min-h-[64px] resize-y text-[15px]"
              placeholder={t('editor.explanationPlaceholder')}
              maxLength={600}
              value={question.explanation ?? ''}
              onChange={(e) => onPatch({ explanation: e.target.value || null })}
              onBlur={(e) => {
                if (!e.target.value.trim()) {
                  onPatch({ explanation: null });
                  setShowExplanation(false);
                }
              }}
            />
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------- answers */}
      <section>
        <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="field-label mb-0">
            {question.type === 'short'
              ? t('editor.acceptedAnswers')
              : question.type === 'numeric'
                ? t('editor.answer')
                : question.type === 'ordering'
                  ? t('editor.correctOrder')
                  : question.type === 'poll'
                    ? t('editor.choices')
                    : t('editor.answers')}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[12px] text-slate-500">
              {t('editor.time')}
              <select
                className="select-pill"
                aria-label={t('editor.timeAria')}
                value={question.timeLimitSec}
                onChange={(e) => onPatch({ timeLimitSec: Number(e.target.value) })}
              >
                {including(TIME_CHOICES, question.timeLimitSec).map((t) => (
                  <option key={t} value={t}>
                    {t}s
                  </option>
                ))}
              </select>
            </label>
            {question.type !== 'poll' && (
              <label className="flex items-center gap-1.5 text-[12px] text-slate-500">
                {t('editor.points')}
                <select
                  className="select-pill"
                  aria-label={t('editor.points')}
                  value={question.points}
                  onChange={(e) => onPatch({ points: Number(e.target.value) })}
                >
                  {including(POINT_CHOICES, question.points).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
        <p className="mb-3 text-[12.5px] text-slate-600">
          {t(('editor.hint.' + question.type) as 'editor.hint.multiple')}
        </p>

        {question.type === 'short' && <ShortAnswerFields question={question} onPatch={onPatch} />}
        {question.type === 'numeric' && <NumericFields question={question} onPatch={onPatch} />}
        {(question.type === 'multiple' ||
          question.type === 'multiselect' ||
          question.type === 'truefalse' ||
          question.type === 'ordering' ||
          question.type === 'poll') && <TileFields question={question} onPatch={onPatch} />}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function TileFields({
  question,
  onPatch,
}: {
  question: Question;
  onPatch: (patch: Partial<Question>) => void;
}) {
  const t = useT();
  const [imageFor, setImageFor] = useState<string | null>(null);
  const { type, options } = question;
  const locked = type === 'truefalse';
  const markerKind =
    type === 'multiple' || type === 'truefalse'
      ? 'radio'
      : type === 'multiselect'
        ? 'check'
        : type === 'ordering'
          ? 'order'
          : 'none';

  const patchOption = (oi: number, patch: Partial<Option>) =>
    onPatch({ options: options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) });

  const mark = (oi: number) => {
    if (markerKind === 'radio') {
      onPatch({ options: options.map((o, j) => ({ ...o, correct: j === oi })) });
    } else if (markerKind === 'check') {
      patchOption(oi, { correct: !options[oi].correct });
    }
  };

  const move = (oi: number, delta: number) => {
    const target = oi + delta;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    [next[oi], next[target]] = [next[target], next[oi]];
    onPatch({ options: next });
  };

  // `min-w-0` on the fieldset defeats the UA stylesheet's
  // `min-width: min-content`, which otherwise stops the answer list shrinking
  // on a phone and pushes the whole row off the right edge of the screen.
  return (
    <fieldset className="min-w-0">
      <ul className="divide-y divide-mist/[0.05] rounded-xl border border-mist/[0.06]">
        {options.map((option, oi) => {
          const showImageField = imageFor === option.id || !!option.image;
          return (
            <li key={option.id} className="group">
              <div
                className={
                  'flex min-w-0 items-center gap-2.5 px-2.5 py-1.5 transition ' +
                  (option.correct && markerKind !== 'none' ? 'bg-emerald-500/[0.06]' : '')
                }
              >
                <span
                  className={
                    'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[13px] text-white ' +
                    TILE_TONE[oi % TILE_TONE.length]
                  }
                  aria-hidden
                >
                  {markerKind === 'order' ? oi + 1 : TILE_GLYPH[oi % TILE_GLYPH.length]}
                </span>

                {markerKind !== 'none' && markerKind !== 'order' && (
                  <button
                    type="button"
                    onClick={() => mark(oi)}
                    aria-label={t('editor.markCorrect', { n: oi + 1 })}
                    aria-pressed={!!option.correct}
                    className={
                      'grid h-5 w-5 shrink-0 place-items-center border-2 text-[10px] transition ' +
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ' +
                      (markerKind === 'check' ? 'rounded-md ' : 'rounded-full ') +
                      (option.correct
                        ? 'border-emerald-400 bg-emerald-500 text-white'
                        : 'border-mist/20 text-transparent hover:border-emerald-400/60')
                    }
                  >
                    ✓
                  </button>
                )}

                <input
                  className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-[15px] text-slate-100 placeholder:text-slate-600 focus:outline-none"
                  placeholder={
                    markerKind === 'order'
                      ? t('editor.stepN', { n: oi + 1 })
                      : type === 'poll'
                        ? t('editor.choiceN', { n: oi + 1 })
                        : t('editor.answerN', { n: oi + 1 })
                  }
                  maxLength={200}
                  readOnly={locked}
                  value={option.text}
                  onChange={(e) => patchOption(oi, { text: e.target.value })}
                />

                {/* Quiet until the row is hovered or focused - but only on
                    devices that can hover. A touchscreen has no hover state,
                    so there they are simply always visible. */}
                {!locked && (
                  <span className="flex shrink-0 items-center gap-0.5 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
                    {markerKind === 'order' && (
                      <>
                        <IconButton label={t('editor.moveStepUp', { n: oi + 1 })} onClick={() => move(oi, -1)} disabled={oi === 0}>
                          ▲
                        </IconButton>
                        <IconButton label={t('editor.moveStepDown', { n: oi + 1 })} onClick={() => move(oi, 1)} disabled={oi === options.length - 1}>
                          ▼
                        </IconButton>
                      </>
                    )}
                    <IconButton
                      label={t('editor.toggleImage', { n: oi + 1 })}
                      onClick={() => setImageFor(showImageField ? null : option.id)}
                      active={!!option.image}
                    >
                      ▤
                    </IconButton>
                    {options.length > 2 && (
                      <IconButton
                        label={t('editor.removeAnswer', { n: oi + 1 })}
                        onClick={() => onPatch({ options: options.filter((_, j) => j !== oi) })}
                        danger
                      >
                        ✕
                      </IconButton>
                    )}
                  </span>
                )}
              </div>

              {showImageField && !locked && (
                <div className="animate-rise px-2.5 pb-2.5 pl-[3.25rem]">
                  <ImagePicker
                    label={t('editor.answerImage')}
                    compact
                    value={option.image}
                    onChange={(url) => {
                      patchOption(oi, { image: url });
                      if (!url) setImageFor(null);
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {!locked && options.length < 6 && (
        <QuietLink className="mt-2.5" onClick={() => onPatch({ options: [...options, blankOption()] })}>
          {markerKind === 'order'
            ? t('editor.addStep')
            : type === 'poll'
              ? t('editor.addChoice')
              : t('editor.addAnswer')}
        </QuietLink>
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
  const t = useT();
  const accepted = question.acceptedAnswers ?? [''];

  return (
    <fieldset className="min-w-0">
      <ul className="divide-y divide-mist/[0.05] rounded-xl border border-mist/[0.06]">
        {accepted.map((answer, i) => (
          <li key={i} className="group flex min-w-0 items-center gap-2.5 px-2.5 py-1.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-xs font-bold text-emerald-300 nums">
              {i + 1}
            </span>
            <input
              className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-[15px] text-slate-100 placeholder:text-slate-600 focus:outline-none"
              placeholder={i === 0 ? t('editor.theAnswer') : t('editor.anotherSpelling')}
              maxLength={120}
              value={answer}
              onChange={(e) =>
                onPatch({ acceptedAnswers: accepted.map((a, j) => (j === i ? e.target.value : a)) })
              }
            />
            {accepted.length > 1 && (
              <span className="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
                <IconButton
                  label={t('editor.removeAccepted', { n: i + 1 })}
                  onClick={() => onPatch({ acceptedAnswers: accepted.filter((_, j) => j !== i) })}
                  danger
                >
                  ✕
                </IconButton>
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2">
        {accepted.length < 12 && (
          <QuietLink onClick={() => onPatch({ acceptedAnswers: [...accepted, ''] })}>
            {t('editor.addSpelling')}
          </QuietLink>
        )}
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-slate-400">
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-brand-500"
            checked={!!question.caseSensitive}
            onChange={(e) => onPatch({ caseSensitive: e.target.checked })}
          />
          {t('editor.matchCase')}
        </label>
      </div>
    </fieldset>
  );
}

function NumericFields({
  question,
  onPatch,
}: {
  question: Question;
  onPatch: (patch: Partial<Question>) => void;
}) {
  const t = useT();
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem]">
      <label className="block">
        <span className="field-label">{t('editor.correctValue')}</span>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          className="field nums"
          placeholder="e.g. 9.81"
          value={question.answer ?? ''}
          onChange={(e) => onPatch({ answer: e.target.value === '' ? undefined : Number(e.target.value) })}
        />
      </label>
      <label className="block">
        <span className="field-label">{t('editor.tolerance')}</span>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          min={0}
          className="field nums"
          placeholder="0"
          value={question.tolerance ?? 0}
          onChange={(e) => onPatch({ tolerance: Math.max(0, Number(e.target.value) || 0) })}
        />
      </label>
      <label className="block">
        <span className="field-label">{t('editor.unit')}</span>
        <input
          className="field"
          placeholder={t('editor.unitPlaceholder')}
          maxLength={20}
          value={question.unit ?? ''}
          onChange={(e) => onPatch({ unit: e.target.value || null })}
        />
      </label>
      <p className="field-hint sm:col-span-3">{t('editor.numericHint')}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function QuietLink({
  onClick,
  children,
  className = '',
}: {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={'block text-[13px] font-medium text-slate-500 transition hover:text-brand-300 ' + className}
    >
      {children}
    </button>
  );
}

function IconButton({
  label,
  onClick,
  children,
  disabled,
  active,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={
        'grid h-7 w-7 place-items-center rounded-lg text-xs transition disabled:opacity-20 ' +
        (active
          ? 'text-brand-300'
          : danger
            ? 'text-slate-600 hover:bg-rose-500/10 hover:text-rose-300'
            : 'text-slate-600 hover:bg-mist/5 hover:text-slate-300')
      }
    >
      {children}
    </button>
  );
}
