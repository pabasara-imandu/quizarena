'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { buildStudentCsv, downloadText, studentStem } from '@/lib/exportCsv';
import { buildStudentReport, type ReportLine } from '@/lib/studentReport';
import { useT, type Translator } from '@/lib/i18n';
import { QuestionMedia } from '@/components/ui/QuestionMedia';
import type { Analytics, IntegrityEntry } from '@/lib/types';

/**
 * One participant's paper, opened over the results.
 *
 * The gradebook says who scored what. This says what the child actually wrote:
 * every question in the order they saw it, the answer they gave, the answer
 * that was wanted, what it earned and how long it took - the thing a teacher
 * needs when a parent asks, or when a mark is questioned.
 *
 * It prints. `Ctrl/Cmd+P` inside it, or the button, gives one clean sheet per
 * student with the app around it hidden and the colours forced to paper; the
 * same page is what "save as PDF" produces.
 */

const secs = (ms: number | null) => (ms == null ? '—' : (ms / 1000).toFixed(1));
const pct = (n: number) => Math.round((n ?? 0) * 100) + '%';

const STATUS_TONE: Record<string, string> = {
  correct: 'bg-emerald-500/15 text-emerald-300',
  incorrect: 'bg-rose-500/15 text-rose-300',
  skipped: 'bg-amber-500/15 text-amber-300',
  no_answer: 'bg-mist/[0.07] text-slate-400',
  answered: 'bg-brand-500/15 text-brand-300',
};

export function StudentReport({
  data,
  playerId,
  onSelect,
  onClose,
}: {
  data: Analytics;
  playerId: string;
  /** Page to another student without closing - the header arrows and ← →. */
  onSelect: (playerId: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const report = useMemo(() => buildStudentReport(data, playerId), [data, playerId]);
  const rows = data.matrix?.rows ?? [];

  const step = useCallback(
    (delta: number) => {
      if (!report) return;
      const next = rows[report.index + delta];
      if (next) onSelect(next.playerId);
    },
    [report, rows, onSelect]
  );

  // Escape closes, arrows walk the class list. The report has no inputs of its
  // own, so the arrows are never stealing someone's typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, step]);

  // `report-open` is what the print stylesheet keys off to hide the rest of
  // the page; the overflow lock stops the results scrolling underneath.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('report-open');
    return () => {
      document.body.style.overflow = previous;
      document.body.classList.remove('report-open');
    };
  }, []);

  if (!report) return null;

  const saveCsv = () =>
    downloadText(studentStem(data, report.nickname) + '.csv', buildStudentCsv(data, playerId));

  // Hung off <body> rather than left inside the results tree: on paper the
  // printed sheet then starts at the top of page one, with the whole app a
  // single `display: none` away, instead of after a screen's worth of blank
  // results. It also keeps the overlay out of any transformed ancestor.
  const overlay = (
    <div className="report-overlay fixed inset-0 z-50 overflow-y-auto bg-black/70 px-3 py-4 backdrop-blur-sm sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="print-hide mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => step(-1)}
            disabled={report.index === 0}
            aria-label={t('rep.prev')}
            title={t('rep.prev')}
          >
            {'←'}
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => step(1)}
            disabled={report.index >= rows.length - 1}
            aria-label={t('rep.next')}
            title={t('rep.next')}
          >
            {'→'}
          </button>
          <span className="ml-1 hidden text-xs text-slate-500 sm:inline">{t('rep.keysHint')}</span>

          <span className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={() => window.print()}>
              {t('rep.print')}
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={saveCsv}>
              {t('rep.csv')}
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={onClose}
              aria-label={t('rep.close')}
              title={t('rep.close')}
            >
              {'✕'}
            </button>
          </span>
        </div>

        <article
          className="report-sheet surface p-5 sm:p-7"
          role="dialog"
          aria-modal="true"
          aria-label={t('rep.title') + ' — ' + report.nickname}
        >
          <header className="flex flex-wrap items-start gap-3 border-b border-mist/[0.08] pb-4">
            <div className="min-w-0 flex-1">
              <p className="eyebrow">{t('rep.title')}</p>
              <h2 className="mt-0.5 font-display text-2xl font-extrabold">{report.nickname}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {data.quizTitle} · {t('rep.pin', { pin: data.pin })} ·{' '}
                {new Date(data.finishedAt).toLocaleString()}
              </p>
            </div>
            <span className="chip-brand shrink-0 nums">
              {t('rep.rankOf', { rank: t.ordinal(report.rank), total: report.total })}
            </span>
          </header>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={t('rep.marks')} value={report.score.toLocaleString()} strong />
            <Stat label={t('rep.correct')} value={report.correctCount + '/' + report.answeredCount} />
            <Stat label={t('rep.accuracy')} value={pct(report.accuracy)} />
            <Stat label={t('rep.avgTime')} value={secs(report.averageResponseMs) + 's'} />
            <Stat label={t('rep.streak')} value={String(report.bestStreak)} />
            <Stat label={t('rep.skipped')} value={String(report.skippedCount)} />
            <Stat label={t('rep.unanswered')} value={String(report.noAnswerCount)} />
            <Stat
              label={t('rep.flags')}
              value={report.flagCount > 0 ? String(report.flagCount) : t('rep.clean')}
              tone={report.flagCount > 0 ? 'warn' : undefined}
            />
          </div>

          <section className="mt-5">
            <p className="eyebrow">{t('rep.vsClass')}</p>
            <div className="mt-2 space-y-2">
              <Bar
                label={t('rep.vsScore', {
                  score: report.score.toLocaleString(),
                  avg: report.classAverageScore.toLocaleString(),
                })}
                value={report.classTopScore ? report.score / report.classTopScore : 0}
                marker={report.classTopScore ? report.classAverageScore / report.classTopScore : 0}
              />
              <Bar
                label={t('rep.vsAccuracy', {
                  acc: pct(report.accuracy),
                  classAcc: pct(report.classAccuracy),
                })}
                value={report.accuracy}
                marker={report.classAccuracy}
              />
            </div>
          </section>

          <section className="mt-6">
            <p className="eyebrow">{t('rep.byQuestion')}</p>
            <ol className="mt-2 space-y-3">
              {report.lines.map((line) => (
                <li key={line.questionId} className="report-q rounded-xl border border-mist/[0.07] bg-mist/[0.03] p-4">
                  <QuestionBlock line={line} t={t} />
                </li>
              ))}
            </ol>
          </section>

          {report.flagCount > 0 && (
            <section className="mt-6">
              <p className="eyebrow">{t('rep.flagsTitle')}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {data.integrityLog
                  .filter((e) => e.playerId === playerId)
                  .map((e) => (
                    <li key={e.id} className="flex flex-wrap gap-2 rounded px-2 py-1 odd:bg-mist/[0.04]">
                      <span className="nums text-xs text-slate-500">
                        {new Date(e.at).toLocaleTimeString()}
                      </span>
                      <span className="min-w-0 flex-1 text-slate-300">
                        {t(('integ.' + e.type) as 'integ.tab_hidden')}
                      </span>
                      <span className="text-xs text-slate-500">{flagWhere(e, report.lines.length, t)}</span>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          <footer className="mt-6 border-t border-mist/[0.08] pt-3 text-[11px] text-slate-600">
            {t('rep.footer', { title: data.quizTitle, date: new Date().toLocaleString() })}
          </footer>
        </article>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? overlay : createPortal(overlay, document.body);
}

function flagWhere(e: IntegrityEntry, questionCount: number, t: Translator) {
  return e.questionIndex >= 0 && e.questionIndex < questionCount
    ? t('rep.flagAtQ', { n: e.questionIndex + 1 })
    : t('rep.flagLoose');
}

/** One question: what was asked, what they gave, what was wanted, what it earned. */
function QuestionBlock({ line, t }: { line: ReportLine; t: Translator }) {
  const answered = line.status === 'correct' || line.status === 'incorrect' || line.status === 'answered';

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-brand-500/15 px-2 py-0.5 text-xs font-bold nums text-brand-300">
          Q{line.position + 1}
        </span>
        <span className="text-[11px] uppercase tracking-wide text-slate-500">
          {t(('type.' + line.type) as 'type.multiple')}
        </span>
        <span className={'chip ml-auto ' + (STATUS_TONE[line.status] ?? STATUS_TONE.no_answer)}>
          {t(('rep.status.' + line.status) as 'rep.status.correct')}
        </span>
        <span className="nums text-sm font-semibold text-slate-200">
          {t('rep.marksEarned', { n: line.points.toLocaleString() })}
        </span>
      </div>

      <p className="mt-2 font-medium leading-snug">{line.text}</p>
      {line.image && <QuestionMedia src={line.image} className="mt-2" maxHeight="8rem" />}

      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex flex-wrap gap-x-2">
          <dt className="w-32 shrink-0 text-xs uppercase tracking-wide text-slate-500">
            {t('rep.theirAnswer')}
          </dt>
          <dd className="min-w-0 flex-1 font-semibold">
            {answered ? (
              <span className={line.status === 'incorrect' ? 'text-rose-200' : 'text-slate-100'}>
                {line.response}
              </span>
            ) : (
              <span className="italic font-normal text-slate-500">
                {line.status === 'skipped' ? t('rep.skippedIt') : t('rep.noAnswerGiven')}
              </span>
            )}
          </dd>
        </div>

        {line.type === 'poll' ? (
          <p className="text-xs italic text-slate-500">{t('rep.pollNote')}</p>
        ) : (
          line.status !== 'correct' &&
          line.correctAnswer && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="w-32 shrink-0 text-xs uppercase tracking-wide text-slate-500">
                {t('rep.correctAnswer')}
              </dt>
              <dd className="min-w-0 flex-1 font-semibold text-emerald-300">{line.correctAnswer}</dd>
            </div>
          )
        )}
      </dl>

      <p className="mt-2 text-xs text-slate-500">
        {/* A time they never spent, and a class score on a question with no
            right answer, are both noise - leave them out rather than print a
            dash and a 0%. */}
        {line.responseMs != null &&
          t('rep.timeOf', { s: secs(line.responseMs), limit: line.timeLimitSec }) + ' · '}
        {t('rep.worth', { n: line.basePoints })}
        {line.type !== 'poll' &&
          line.classAnswered > 0 &&
          ' · ' +
            t('rep.classGot', {
              pct: pct(line.classAccuracy),
              correct: line.classCorrect,
              answered: line.classAnswered,
            })}
      </p>

      {line.explanation && (
        <p className="mt-2 rounded-lg bg-brand-500/[0.07] px-3 py-2 text-xs leading-relaxed text-slate-300">
          <b className="text-brand-300">{t('rep.why')} </b>
          {line.explanation}
        </p>
      )}

      {line.flags.length > 0 && (
        <p className="mt-2 text-xs text-amber-300">
          {line.flags.map((f) => t(('integ.' + f.type) as 'integ.tab_hidden')).join(' · ')}
        </p>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'warn';
}) {
  return (
    <div className="rounded-xl border border-mist/[0.07] bg-mist/[0.03] px-3 py-2">
      <p
        className={
          'font-display font-bold nums ' +
          (strong ? 'text-xl text-brand-300 ' : 'text-lg ') +
          (tone === 'warn' ? 'text-amber-300' : '')
        }
      >
        {value}
      </p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

/** Their bar, with a tick where the class sits. */
function Bar({ label, value, marker }: { label: string; value: number; marker: number }) {
  const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
  return (
    <div>
      <p className="mb-1 text-xs text-slate-400">{label}</p>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-mist/[0.08]">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-brand-500/70"
          style={{ width: clamp(value) * 100 + '%' }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-mist/60"
          style={{ left: clamp(marker) * 100 + '%' }}
          aria-hidden
        />
      </div>
    </div>
  );
}
