import type { Analytics } from '@/lib/types';

/**
 * The full gradebook, built in the browser.
 *
 * This used to be a link to the server, gated on the room still existing. It
 * cost a school its results: the room was swept while the teacher was reading
 * the screen, and the download came back "That room is no longer active" - even
 * though every number in it was already sitting in the page.
 *
 * The analytics payload the host receives is complete, so the file can be built
 * from it with no network at all. A finished quiz is now downloadable from a
 * dead server, a closed room, or an archived copy opened days later.
 */

/**
 * Quote and escape properly, and neutralise formula injection: a nickname of
 * `=cmd|'/c calc'!A0` is a live formula the moment the teacher opens the file
 * in Excel, so anything starting with = + - @ or a control char is prefixed.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function toCsv(rows: unknown[][]): string {
  // A BOM makes Excel read the file as UTF-8 rather than mangling accents.
  return '﻿' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

const STATUS_LABEL: Record<string, string> = {
  correct: 'Correct',
  incorrect: 'Incorrect',
  skipped: 'Skipped',
  no_answer: 'No answer',
};

const pct = (n: number) => Math.round((n ?? 0) * 100) + '%';

/**
 * One row per student, one column group per question, then a per-question
 * summary and an answer breakdown. A teacher can read across a row to see one
 * child's pattern, or down a column to see where the class fell over.
 */
export function buildGradebookCsv(analytics: Analytics): string {
  const { matrix, perQuestion } = analytics;
  const rows: unknown[][] = [];

  rows.push(['QuizArena results', analytics.quizTitle]);
  rows.push(['Room PIN', analytics.pin]);
  rows.push(['Finished', new Date(analytics.finishedAt).toISOString()]);
  rows.push(['Players', analytics.playerCount]);
  rows.push(['Questions', analytics.questionCount]);
  rows.push(['Class accuracy', pct(analytics.overallAccuracy)]);
  rows.push([]);

  const header: unknown[] = [
    'Rank',
    'Student',
    'Total score',
    'Correct',
    'Answered',
    'Skipped',
    'Accuracy',
  ];
  for (const q of matrix.questions) {
    const label = 'Q' + (q.position + 1);
    header.push(label + ' result', label + ' points', label + ' time (s)', label + ' response');
  }
  rows.push(header);

  for (const row of matrix.rows) {
    const player = analytics.players.find((p) => p.id === row.playerId);
    const line: unknown[] = [
      row.rank,
      row.nickname,
      row.score,
      player?.correctCount ?? 0,
      player?.answeredCount ?? 0,
      player?.skippedCount ?? 0,
      pct(player?.accuracy ?? 0),
    ];
    for (const cell of row.cells) {
      line.push(
        STATUS_LABEL[cell.status] ?? cell.status,
        cell.points,
        cell.responseMs == null ? '' : (cell.responseMs / 1000).toFixed(2),
        cell.response ?? ''
      );
    }
    rows.push(line);
  }

  rows.push([]);
  rows.push(['Per-question summary']);
  rows.push([
    'Question',
    'Type',
    'Text',
    'Correct answer(s)',
    'Answered',
    'Correct',
    'Skipped',
    'No answer',
    'Accuracy',
    'Avg time (s)',
    'Points',
  ]);

  for (const q of perQuestion) {
    const answerKey =
      q.type === 'short'
        ? (q.acceptedAnswers ?? []).join(' | ')
        : q.options
            .filter((o) => o.correct)
            .map((o) => o.text)
            .join(' | ');
    rows.push([
      'Q' + (q.position + 1),
      q.type,
      q.text,
      answerKey,
      q.answered,
      q.correct,
      q.skipped ?? 0,
      q.unanswered,
      pct(q.accuracy),
      q.averageResponseMs == null ? '' : (q.averageResponseMs / 1000).toFixed(2),
      q.points,
    ]);
  }

  rows.push([]);
  rows.push(['Answer breakdown']);
  rows.push(['Question', 'Answer', 'Correct?', 'Times chosen', 'Share of responses']);
  for (const q of perQuestion) {
    const entries =
      q.type === 'short'
        ? (q.textResponses ?? []).map((t) => ({ text: t.display, correct: t.correct, count: t.count }))
        : q.options;
    for (const entry of entries) {
      rows.push([
        'Q' + (q.position + 1),
        entry.text,
        entry.correct ? 'Yes' : 'No',
        entry.count,
        q.answered ? Math.round((entry.count / q.answered) * 100) + '%' : '0%',
      ]);
    }
  }

  return toCsv(rows);
}

/** Rank, score and integrity flags: the quick one a teacher pastes into a mark book. */
export function buildSummaryCsv(analytics: Analytics): string {
  return toCsv([
    [
      'Rank',
      'Nickname',
      'Score',
      'Answered',
      'Correct',
      'Skipped',
      'Accuracy',
      'Avg time (s)',
      'Best streak',
      'Warnings',
      'Tab switches',
    ],
    ...analytics.players.map((p) => [
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
  ]);
}

/** Hand a built string to the browser as a file. */
export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** A stable, human-sortable stem for downloaded files. */
export function exportStem(analytics: Analytics): string {
  const when = new Date(analytics.finishedAt || Date.now())
    .toISOString()
    .slice(0, 16)
    .replace(/[:T]/g, '-');
  const title = (analytics.quizTitle || 'quiz')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
  return 'quizarena-' + (title || 'quiz') + '-' + when;
}
