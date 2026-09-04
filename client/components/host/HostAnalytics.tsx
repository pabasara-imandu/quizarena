'use client';

import { useMemo, useState } from 'react';
import type { Analytics } from '@/lib/types';
import { ShortAnswerReview, type RegradeChange } from '@/components/host/ShortAnswerReview';
import { serverUrl } from '@/lib/serverUrl';

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
  const [tab, setTab] = useState<
    'questions' | 'students' | 'matrix' | 'integrity' | 'remark'
  >('questions');

  const shortAnswerCount = data.perQuestion.filter((q) => q.type === 'short').length;

  /** Quick summary CSV, built client-side so it works even if the room is gone. */
  const csvHref = useMemo(() => {
    const rows = [
      ['Rank', 'Nickname', 'Score', 'Answered', 'Correct', 'Skipped', 'Accuracy', 'Avg time (s)', 'Best streak', 'Warnings', 'Tab switches'],
      ...data.players.map((p) => [
        p.rank,
        p.nickname,
        p.score,
        p.answeredCount,
        p.correctCount,
        p.skippedCount ?? 0,
        (p.accuracy * 100).toFixed(1),
        p.averageResponseMs == null ? '' : (p.averageResponseMs / 1000).toFixed(2),
        p.bestStreak,
        p.strikes,
        p.tabSwitches,
      ]),
    ];
    const csv = rows
      .map((r) =>
        r
          // Same formula-injection guard as the server-side export.
          .map((cell) => {
            const text = /^[=+\-@]/.test(String(cell)) ? "'" + cell : String(cell);
            return '"' + text.replace(/"/g, '""') + '"';
          })
          .join(',')
      )
      .join('\r\n');
    return 'data:text/csv;charset=utf-8,' + encodeURIComponent('﻿' + csv);
  }, [data.players]);

  /** The deep export is built server-side and gated on the host token. */
  const matrixHref =
    pin && hostToken
      ? serverUrl() + '/api/rooms/' + pin + '/export.csv?hostToken=' + encodeURIComponent(hostToken)
      : null;

  return (
    <div className="space-y-6">
      <div className="surface p-7 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Final results</p>
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
                    'grid w-full place-items-center rounded-t-xl border border-white/10 ' +
                    height +
                    (p.rank === 1
                      ? ' bg-gradient-to-t from-amber-500/30 to-amber-300/20'
                      : ' bg-white/5')
                  }
                >
                  <span className="font-display text-3xl font-extrabold">{p.rank}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Players" value={String(data.playerCount)} />
          <Metric label="Questions" value={String(data.questionCount)} />
          <Metric
            label="Class accuracy"
            value={pct(data.overallAccuracy)}
            tone={data.overallAccuracy < 0.5 ? 'bad' : data.overallAccuracy > 0.75 ? 'good' : 'mid'}
          />
          <Metric label="Average score" value={data.averageScore.toLocaleString()} />
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <a className="btn-secondary" href={csvHref} download={'quiz-results-' + data.pin + '.csv'}>
            Summary (CSV)
          </a>
          {matrixHref && (
            <a className="btn-secondary" href={matrixHref}>
              Full gradebook (CSV)
            </a>
          )}
          <button className="btn-primary btn-lg" type="button" onClick={onRestart}>
            Host another quiz
          </button>
        </div>
        {matrixHref && (
          <p className="mt-2 text-xs text-slate-500">
            The gradebook has every student against every question, plus per-question and
            answer-level breakdowns.
          </p>
        )}
      </div>

      {/* The headline teaching insight: what the class did not understand. */}
      {data.hardestQuestions.length > 0 && (
        <div className="surface border-amber-400/20 bg-amber-500/[0.05] p-6">
          <h2 className="font-display text-xl font-bold text-amber-200">Worth re-teaching</h2>
          <p className="mb-3 mt-1 text-sm text-slate-400">
            Lowest accuracy across the class - these are the concepts that did not land.
          </p>
          <ul className="space-y-2">
            {data.hardestQuestions.map((q) => (
              <li
                key={q.questionId}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
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

      <div className="segmented" role="tablist" aria-label="Results view">
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
        ).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className="segmented-item capitalize"
          >
            {t === 'remark' ? 'Re-mark' : t}
            {t === 'integrity' && data.integrityLog.length > 0 && (
              <span className="ml-1.5 rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] nums">
                {data.integrityLog.length}
              </span>
            )}
            {t === 'remark' && (
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
                {q.correct}/{q.answered} correct · {q.unanswered} did not answer
                {q.skipped > 0 ? ' · ' + q.skipped + ' skipped' : ''} · avg{' '}
                {secs(q.averageResponseMs)} of {q.timeLimitSec}s
              </p>

              {q.type === 'short' && q.acceptedAnswers && (
                <p className="mt-2 text-xs text-emerald-300">
                  Accepted: {q.acceptedAnswers.join(' · ')}
                </p>
              )}

              <ul className="mt-3 space-y-1.5">
                {/* Free-text questions have no options - show what was typed. */}
                {(q.type === 'short'
                  ? (q.textResponses ?? []).map((t) => ({
                      id: t.key,
                      text: t.display,
                      correct: t.correct,
                      count: t.count,
                    }))
                  : q.options
                ).map((o) => {
                  const share = q.answered ? (o.count / q.answered) * 100 : 0;
                  return (
                    <li key={o.id} className="relative overflow-hidden rounded-lg bg-white/5 px-3 py-2">
                      <span
                        className={
                          'absolute inset-y-0 left-0 ' +
                          (o.correct ? 'bg-emerald-500/25' : 'bg-rose-500/15')
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
                  <li className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-500">
                    Nobody answered this one.
                  </li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}

      {tab === 'matrix' && <MatrixTable data={data} />}

      {tab === 'students' && (
        <div className="surface overflow-x-auto p-5">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Student</th>
                <th className="py-2 pr-3 text-right">Score</th>
                <th className="py-2 pr-3 text-right">Correct</th>
                <th className="py-2 pr-3 text-right">Accuracy</th>
                <th className="py-2 pr-3 text-right">Avg time</th>
                <th className="py-2 pr-3 text-right">Streak</th>
                <th className="py-2 text-right">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data.players.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 pr-3 nums text-slate-500">{p.rank}</td>
                  <td className="py-2 pr-3 font-medium">{p.nickname}</td>
                  <td className="py-2 pr-3 text-right nums font-semibold text-brand-300">
                    {p.score.toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 text-right nums">
                    {p.correctCount}/{p.answeredCount}
                  </td>
                  <td className="py-2 pr-3 text-right nums">{pct(p.accuracy)}</td>
                  <td className="py-2 pr-3 text-right nums">
                    {secs(p.averageResponseMs)}
                  </td>
                  <td className="py-2 pr-3 text-right nums">{p.bestStreak}</td>
                  <td className="py-2 text-right">
                    {p.strikes + p.tabSwitches > 0 ? (
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
                        {p.tabSwitches} tab · {p.fullscreenExits} fs
                      </span>
                    ) : (
                      <span className="text-slate-600">clean</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'integrity' && (
        <div className="surface p-5">
          {data.integrityLog.length === 0 ? (
            <p className="py-8 text-center text-slate-500">
              No integrity events were recorded during this session.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.integrityLog
                .slice()
                .reverse()
                .map((e) => (
                  <li key={e.id} className="flex gap-3 rounded px-2 py-1.5 odd:bg-white/5">
                    <span className="shrink-0 nums text-xs text-slate-500">
                      {new Date(e.at).toLocaleTimeString()}
                    </span>
                    <span className="w-32 shrink-0 truncate font-medium">{e.nickname}</span>
                    <span className="min-w-0 flex-1 text-slate-300">{e.type.replace(/_/g, ' ')}</span>
                    <span className="shrink-0 text-xs text-slate-500">
                      Q{e.questionIndex + 1}
                    </span>
                  </li>
                ))}
            </ul>
          )}
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            These signals show that a student&apos;s browser lost focus or left full-screen. They are
            not proof of cheating - a notification, a dropped call or a screen-reader can all trigger
            them. Treat the log as a prompt to ask, not as a verdict.
          </p>
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
  const { matrix } = data;
  const [showResponses, setShowResponses] = useState(false);

  if (!matrix?.rows?.length) {
    return <div className="surface p-8 text-center text-sm text-slate-500">No responses to show.</div>;
  }

  const cellStyle: Record<string, string> = {
    correct: 'bg-emerald-500/20 text-emerald-200',
    incorrect: 'bg-rose-500/15 text-rose-200',
    skipped: 'bg-amber-500/15 text-amber-200',
    no_answer: 'bg-white/5 text-slate-500',
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
        <h3 className="font-display text-lg font-bold">Every student, every question</h3>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-500"
            checked={showResponses}
            onChange={(e) => setShowResponses(e.target.checked)}
          />
          Show what they answered
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-ink-800 px-2 py-2 text-left text-xs uppercase tracking-wide text-slate-500">
                Student
              </th>
              <th className="px-2 py-2 text-right text-xs uppercase tracking-wide text-slate-500">
                Score
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
                        cell.points +
                        ' pts' +
                        (cell.responseMs ? ' in ' + (cell.responseMs / 1000).toFixed(1) + 's' : '')
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
          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-200">✓</span> correct
        </span>
        <span>
          <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-rose-200">✕</span> incorrect
        </span>
        <span>
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-200">⏭</span> skipped
        </span>
        <span>
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-slate-500">·</span> no answer
        </span>
      </div>
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
