'use client';

import { Fragment, useMemo, useState } from 'react';
import { TYPED_TYPES, type Analytics } from '@/lib/types';
import { ShortAnswerReview, type RegradeChange } from '@/components/host/ShortAnswerReview';
import {
  buildGradebookCsv,
  buildPerStudentCsv,
  buildSummaryCsv,
  downloadText,
  exportStem,
} from '@/lib/exportCsv';
import { useT } from '@/lib/i18n';

const pct = (n: number) => Math.round(n * 100) + '%';
const secs = (ms: number | null) => (ms == null ? '—' : (ms / 1000).toFixed(1) + 's');


export function HostAnalytics({
  data,
  pin,
  hostToken,
  onRestart,
  onRegrade,
  regrading = false,
}: {
  data: Analytics;
  pin: string | null;
  hostToken: string | null;
  onRestart: () => void;
  /** Absent when the room has closed and there is nothing left to re-mark. */
  onRegrade?: (changes: RegradeChange[]) => Promise<void>;
  regrading?: boolean;
}) {
  const t = useT();
  const [tab, setTab] = useState<
    'questions' | 'students' | 'matrix' | 'integrity' | 'remark'
  >('questions');

  const shortAnswerCount = data.perQuestion.filter((q) => TYPED_TYPES.includes(q.type)).length;

  /**
   * Both exports are built here, in the browser, from the payload already on
   * screen. The deep one used to be a server link gated on the room still
   * existing, and that cost a school its marks when the room was swept while
   * the teacher was reading this very screen.
   */
  const stem = useMemo(() => exportStem(data), [data]);

  const saveSummary = () => downloadText(stem + '-summary.csv', buildSummaryCsv(data));
  const saveGradebook = () => downloadText(stem + '-gradebook.csv', buildGradebookCsv(data));
  const savePerStudent = () => downloadText(stem + '-per-student.csv', buildPerStudentCsv(data));
  const saveBackup = () =>
    downloadText(stem + '.json', JSON.stringify(data, null, 2), 'application/json');

  return (
    <div className="space-y-6">
      <div className="surface p-7 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-400">{t('an.finalResults')}</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold">{data.quizTitle}</h1>

        <div className="mt-6 flex items-end justify-center gap-3">
          {[1, 0, 2].map((slot) => {
            const p = data.podium[slot];
            if (!p) return null;
            const height = slot === 0 ? 'h-32' : slot === 1 ? 'h-24' : 'h-20';
            return (
              <div key={p.rank} className="flex w-24 flex-col items-center sm:w-32">
                <span className="mb-1 truncate text-sm font-semibold">{p.nickname}</span>
                <span className="mb-1 text-xs nums text-brand-300">
                  {p.score.toLocaleString()}
                </span>
                <div
                  className={
                    'grid w-full place-items-center rounded-t-xl border border-mist/10 ' +
                    height +
                    (p.rank === 1
                      ? ' bg-gradient-to-t from-amber-500/30 to-amber-300/20'
                      : ' bg-mist/5')
                  }
                >
                  <span className="font-display text-3xl font-extrabold">{p.rank}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label={t('an.players')} value={String(data.playerCount)} />
          <Metric label={t('an.questions')} value={String(data.questionCount)} />
          <Metric
            label={t('an.classAccuracy')}
            value={pct(data.overallAccuracy)}
            tone={data.overallAccuracy < 0.5 ? 'bad' : data.overallAccuracy > 0.75 ? 'good' : 'mid'}
          />
          <Metric label={t('an.avgScore')} value={data.averageScore.toLocaleString()} />
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button className="btn-secondary" type="button" onClick={saveSummary}>
            {t('an.summaryCsv')}
          </button>
          <button className="btn-secondary" type="button" onClick={saveGradebook}>
            {t('an.gradebookCsv')}
          </button>
          <button className="btn-secondary" type="button" onClick={savePerStudent}>
            {t('an.perStudentCsv')}
          </button>
          <button className="btn-ghost" type="button" onClick={saveBackup} title={t('an.backupTitle')}>
            {t('an.backup')}
          </button>
          <button className="btn-primary btn-lg" type="button" onClick={onRestart}>
            {t('an.hostAnother')}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">{t('an.exportNote')}</p>
      </div>

      {/* The headline teaching insight: what the class did not understand. */}
      {data.hardestQuestions.length > 0 && (
        <div className="surface border-amber-400/20 bg-amber-500/[0.05] p-6">
          <h2 className="font-display text-xl font-bold text-amber-200">{t('an.reteach')}</h2>
          <p className="mb-3 mt-1 text-sm text-slate-400">{t('an.reteachDesc')}</p>
          <ul className="space-y-2">
            {data.hardestQuestions.map((q) => (
              <li
                key={q.questionId}
                className="flex items-center gap-3 rounded-xl border border-mist/10 bg-mist/5 px-3 py-2.5"
              >
                <span className="shrink-0 rounded-lg bg-amber-500/20 px-2 py-1 font-display text-sm font-bold nums text-amber-200">
                  {pct(q.accuracy)}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="text-slate-500">Q{q.position + 1}.</span> {q.text}
                </span>
                <span className="shrink-0 text-xs text-slate-500">{secs(q.averageResponseMs)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="segmented" role="tablist" aria-label={t('an.tabsAria')}>
        {(
          [
            'questions',
            'students',
            'matrix',
            'integrity',
            // Only offered when there is free text to judge; a quiz of
            // multiple choice has nothing a teacher could overrule.
            ...(onRegrade && shortAnswerCount > 0 ? (['remark'] as const) : []),
          ] as const
        ).map((tabId) => (
          <button
            key={tabId}
            type="button"
            role="tab"
            aria-selected={tab === tabId}
            onClick={() => setTab(tabId)}
            className="segmented-item"
          >
            {t(('an.tab.' + tabId) as 'an.tab.questions')}
            {tabId === 'integrity' && data.integrityLog.length > 0 && (
              <span className="ml-1.5 rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] nums">
                {data.integrityLog.length}
              </span>
            )}
            {tabId === 'remark' && (
              <span className="ml-1.5 rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] nums">
                {shortAnswerCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'remark' && onRegrade && (
        <ShortAnswerReview data={data} onApply={onRegrade} busy={regrading} />
      )}

      {tab === 'questions' && (
        <div className="space-y-4">
          {data.perQuestion.map((q) => (
            <div key={q.questionId} className="surface p-5">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="rounded-lg bg-brand-500/20 px-2 py-0.5 text-sm font-bold text-brand-300">
                  Q{q.position + 1}
                </span>
                <h3 className="min-w-0 flex-1 font-semibold">{q.text}</h3>
                <span
                  className={
                    'font-display text-lg font-bold nums ' +
                    (q.accuracy < 0.4
                      ? 'text-rose-300'
                      : q.accuracy > 0.75
                        ? 'text-emerald-300'
                        : 'text-amber-300')
                  }
                >
                  {pct(q.accuracy)}
                </span>
              </div>

              <p className="mt-1 text-xs text-slate-500">
                {t('an.qStats', { correct: q.correct, answered: q.answered, unanswered: q.unanswered })}
                {q.skipped > 0 ? ' · ' + t('an.skippedN', { n: q.skipped }) : ''} ·{' '}
                {t('an.avgOf', { avg: secs(q.averageResponseMs), limit: q.timeLimitSec })}
              </p>

              {q.type === 'short' && q.acceptedAnswers && (
                <p className="mt-2 text-xs text-emerald-300">
                  {t('an.accepted', { list: q.acceptedAnswers.join(' · ') })}
                </p>
              )}
              {q.type === 'numeric' && q.answer != null && (
                <p className="mt-2 text-xs text-emerald-300">
                  {t('an.answerKey', {
                    answer:
                      String(q.answer) + (q.tolerance ? ' ± ' + q.tolerance : '') + (q.unit ? ' ' + q.unit : ''),
                  })}
                </p>
              )}
              {q.type === 'ordering' && q.correctOrder && (
                <p className="mt-2 text-xs text-emerald-300">
                  {t('an.correctOrder', {
                    order: q.correctOrder.map((id) => q.options.find((o) => o.id === id)?.text ?? id).join(' → '),
                  })}
                </p>
              )}
              {q.explanation && (
                <p className="mt-2 rounded-lg bg-brand-500/[0.07] px-3 py-2 text-xs leading-relaxed text-slate-300">
                  <b className="text-brand-300">{t('an.why')} </b>
                  {q.explanation}
                </p>
              )}

              <ul className="mt-3 space-y-1.5">
                {/* Typed and ordered answers have no tiles - show what was given. */}
                {(q.textResponses
                  ? q.textResponses.map((t) => ({
                      id: t.key,
                      text: t.display,
                      correct: t.correct,
                      count: t.count,
                    }))
                  : q.options
                ).map((o) => {
                  const share = q.answered ? (o.count / q.answered) * 100 : 0;
                  return (
                    <li key={o.id} className="relative overflow-hidden rounded-lg bg-mist/5 px-3 py-2">
                      <span
                        className={
                          'absolute inset-y-0 left-0 ' +
                          (q.neutral ? 'bg-brand-500/25' : o.correct ? 'bg-emerald-500/25' : 'bg-rose-500/15')
                        }
                        style={{ width: share + '%' }}
                        aria-hidden
                      />
                      <span className="relative flex items-center gap-2 text-sm">
                        <span className="w-4 shrink-0">{o.correct ? '✓' : ''}</span>
                        <span className="min-w-0 flex-1 truncate">{o.text}</span>
                        <span className="shrink-0 nums text-slate-400">
                          {o.count} · {Math.round(share)}%
                        </span>
                      </span>
                    </li>
                  );
                })}
                {q.answered === 0 && (
                  <li className="rounded-lg bg-mist/5 px-3 py-2 text-sm text-slate-500">
                    {t('an.nobodyAnswered')}
                  </li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}

      {tab === 'matrix' && <MatrixTable data={data} />}

      {tab === 'students' && <StudentBreakdown data={data} />}

      {tab === 'integrity' && (
        <div className="surface p-5">
          {data.integrityLog.length === 0 ? (
            <p className="py-8 text-center text-slate-500">{t('an.noIntegrity')}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.integrityLog
                .slice()
                .reverse()
                .map((e) => (
                  <li key={e.id} className="flex gap-3 rounded px-2 py-1.5 odd:bg-mist/5">
                    <span className="shrink-0 nums text-xs text-slate-500">
                      {new Date(e.at).toLocaleTimeString()}
                    </span>
                    <span className="w-32 shrink-0 truncate font-medium">{e.nickname}</span>
                    <span className="min-w-0 flex-1 text-slate-300">
                      {t(('integ.' + e.type) as 'integ.tab_hidden')}
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">
                      Q{e.questionIndex + 1}
                    </span>
                  </li>
                ))}
            </ul>
          )}
          <p className="mt-4 text-xs leading-relaxed text-slate-500">{t('an.integrityNote')}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Student-by-question grid. Sticky first column so a name stays visible while
 * scrolling right through 20 questions - the whole point is being able to read
 * one child's row across, or one question's column down.
 */
function MatrixTable({ data }: { data: Analytics }) {
  const t = useT();
  const { matrix } = data;
  const [showResponses, setShowResponses] = useState(false);

  if (!matrix?.rows?.length) {
    return <div className="surface p-8 text-center text-sm text-slate-500">{t('mx.noResponses')}</div>;
  }

  const cellStyle: Record<string, string> = {
    correct: 'bg-emerald-500/20 text-emerald-200',
    incorrect: 'bg-rose-500/15 text-rose-200',
    skipped: 'bg-amber-500/15 text-amber-200',
    no_answer: 'bg-mist/5 text-slate-500',
  };
  const cellMark: Record<string, string> = {
    correct: '✓',
    incorrect: '✕',
    skipped: '⏭',
    no_answer: '·',
  };

  return (
    <div className="surface p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="font-display text-lg font-bold">{t('mx.title')}</h3>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-500"
            checked={showResponses}
            onChange={(e) => setShowResponses(e.target.checked)}
          />
          {t('mx.showResponses')}
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-ink-800 px-2 py-2 text-left text-xs uppercase tracking-wide text-slate-500">
                {t('mx.student')}
              </th>
              <th className="px-2 py-2 text-right text-xs uppercase tracking-wide text-slate-500">
                {t('mx.score')}
              </th>
              {matrix.questions.map((q) => (
                <th
                  key={q.questionId}
                  title={q.text}
                  className="px-2 py-2 text-center text-xs font-semibold text-slate-400"
                >
                  Q{q.position + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.playerId}>
                <td className="sticky left-0 z-10 max-w-[10rem] truncate bg-ink-800 px-2 py-1.5 font-medium">
                  <span className="text-slate-500">{row.rank}.</span> {row.nickname}
                </td>
                <td className="px-2 py-1.5 text-right nums font-semibold text-brand-300">
                  {row.score.toLocaleString()}
                </td>
                {row.cells.map((cell, i) => (
                  <td key={i} className="px-1 py-1">
                    <div
                      title={
                        (cell.response ? cell.response + ' — ' : '') +
                        t('mx.pts', { n: cell.points }) +
                        (cell.responseMs ? ' ' + t('mx.inTime', { s: (cell.responseMs / 1000).toFixed(1) }) : '')
                      }
                      className={
                        'min-w-[2.25rem] rounded px-1.5 py-1 text-center text-xs ' +
                        cellStyle[cell.status]
                      }
                    >
                      {showResponses ? (
                        <span className="block max-w-[8rem] truncate">
                          {cell.response ?? cellMark[cell.status]}
                        </span>
                      ) : (
                        cellMark[cell.status]
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
        <span>
          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-200">✓</span> {t('mx.correct')}
        </span>
        <span>
          <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-rose-200">✕</span> {t('mx.incorrect')}
        </span>
        <span>
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-200">⏭</span> {t('mx.skipped')}
        </span>
        <span>
          <span className="rounded bg-mist/5 px-1.5 py-0.5 text-slate-500">·</span> {t('mx.noAnswer')}
        </span>
      </div>
    </div>
  );
}

/**
 * The student-wise gradebook: every student, and under each one every question
 * they faced with what they answered, whether it was right, and what it earned.
 *
 * The summary row is what a teacher scans; the expansion is what they open when
 * a parent asks where the marks went. Both come from the matrix the server
 * already sends, so this needs no network and works on an archive.
 */
function StudentBreakdown({ data }: { data: Analytics }) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const { matrix } = data;

  return (
    <div className="surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 pr-3">#</th>
              <th className="py-3 pr-3">{t('st.student')}</th>
              <th className="py-3 pr-3 text-right">{t('st.marks')}</th>
              <th className="py-3 pr-3 text-right">{t('st.correct')}</th>
              <th className="py-3 pr-3 text-right">{t('st.accuracy')}</th>
              <th className="py-3 pr-3 text-right">{t('st.avgTime')}</th>
              <th className="py-3 pr-3 text-right">{t('st.streak')}</th>
              <th className="py-3 pr-4 text-right">{t('st.flags')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mist/5">
            {matrix.rows.map((row) => {
              const p = data.players.find((x) => x.id === row.playerId);
              const expanded = open === row.playerId;
              return (
                <Fragment key={row.playerId}>
                  <tr
                    className={
                      'cursor-pointer transition hover:bg-mist/[0.04] ' +
                      (expanded ? 'bg-mist/[0.04]' : '')
                    }
                    onClick={() => setOpen(expanded ? null : row.playerId)}
                    aria-expanded={expanded}
                  >
                    <td className="px-4 py-2.5 pr-3 nums text-slate-500">{row.rank}</td>
                    <td className="py-2.5 pr-3 font-medium">
                      <span className="mr-2 inline-block w-3 text-slate-600" aria-hidden>
                        {expanded ? '\u25BE' : '\u25B8'}
                      </span>
                      {row.nickname}
                    </td>
                    <td className="py-2.5 pr-3 text-right nums font-semibold text-brand-300">
                      {row.score.toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-3 text-right nums">
                      {p?.correctCount ?? 0}/{p?.answeredCount ?? 0}
                    </td>
                    <td className="py-2.5 pr-3 text-right nums">{pct(p?.accuracy ?? 0)}</td>
                    <td className="py-2.5 pr-3 text-right nums">{secs(p?.averageResponseMs ?? null)}</td>
                    <td className="py-2.5 pr-3 text-right nums">{p?.bestStreak ?? 0}</td>
                    <td className="py-2.5 pr-4 text-right">
                      {p && p.strikes + p.tabSwitches > 0 ? (
                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
                          {t('st.flagsValue', { tab: p.tabSwitches, fs: p.fullscreenExits })}
                        </span>
                      ) : (
                        <span className="text-slate-600">{t('st.clean')}</span>
                      )}
                    </td>
                  </tr>

                  {expanded && (
                    <tr>
                      <td colSpan={8} className="bg-black/20 px-4 py-3">
                        <table className="w-full text-[13px]">
                          <thead className="text-left text-[11px] uppercase tracking-wide text-slate-600">
                            <tr>
                              <th className="py-1.5 pr-3">{t('st.q')}</th>
                              <th className="py-1.5 pr-3">{t('st.question')}</th>
                              <th className="py-1.5 pr-3">{t('st.theirAnswer')}</th>
                              <th className="py-1.5 pr-3">{t('st.correctQ')}</th>
                              <th className="py-1.5 pr-3 text-right">{t('st.marks')}</th>
                              <th className="py-1.5 text-right">{t('st.time')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-mist/[0.04]">
                            {row.cells.map((cell, i) => {
                              const q = matrix.questions[i];
                              return (
                                <tr key={q.questionId}>
                                  <td className="py-1.5 pr-3 nums text-slate-500">{q.position + 1}</td>
                                  <td className="max-w-[22rem] truncate py-1.5 pr-3 text-slate-300">{q.text}</td>
                                  <td className="max-w-[16rem] truncate py-1.5 pr-3">
                                    {cell.status === 'no_answer' ? (
                                      <span className="italic text-slate-600">{t('st.noAnswer')}</span>
                                    ) : cell.status === 'skipped' ? (
                                      <span className="italic text-slate-500">{t('st.skipped')}</span>
                                    ) : (
                                      cell.response
                                    )}
                                  </td>
                                  <td className="py-1.5 pr-3">
                                    {cell.status === 'correct' ? (
                                      <span className="font-semibold text-emerald-300">{t('st.yes')}</span>
                                    ) : cell.status === 'incorrect' ? (
                                      <span className="font-semibold text-rose-300">{t('st.no')}</span>
                                    ) : cell.status === 'answered' ? (
                                      <span className="text-brand-300">{t('st.voted')}</span>
                                    ) : (
                                      <span className="text-slate-600">—</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 pr-3 text-right nums">{cell.points ?? 0}</td>
                                  <td className="py-1.5 text-right nums text-slate-500">
                                    {cell.responseMs == null ? '\u2014' : (cell.responseMs / 1000).toFixed(1) + 's'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-mist/[0.05] px-4 py-2.5 text-[12px] text-slate-600">
        {t('st.clickHint')}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = 'mid',
}: {
  label: string;
  value: string;
  tone?: 'good' | 'mid' | 'bad';
}) {
  const colour =
    tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-rose-300' : 'text-slate-100';
  return (
    <div className="surface px-4 py-3">
      <p className={'font-display text-2xl font-bold nums ' + colour}>{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}
