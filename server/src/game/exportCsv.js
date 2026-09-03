/**
 * CSV builders for the post-quiz exports.
 *
 * Everything routes through `csvCell`, which does two things that matter:
 *  - quotes and escapes properly, so a question containing a comma or a quote
 *    does not shear the file into the wrong columns;
 *  - neutralises formula injection. A nickname of `=cmd|'/c calc'!A0` is a
 *    live formula when the teacher opens the file in Excel, so any cell
 *    starting with = + - @ or a control char is prefixed with an apostrophe.
 */
export function csvCell(value) {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function toCsv(rows) {
  // A BOM makes Excel read the file as UTF-8 instead of mangling accents.
  return '﻿' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

const STATUS_LABEL = {
  correct: 'Correct',
  incorrect: 'Incorrect',
  skipped: 'Skipped',
  no_answer: 'No answer',
};

/**
 * The deep export: one row per student, one column group per question, plus a
 * per-question summary block underneath. A teacher can read a row to see one
 * child's pattern or a column to see where the class fell over.
 */
export function buildMatrixCsv(analytics) {
  const { matrix, perQuestion } = analytics;
  const rows = [];

  rows.push(['QuizArena results', analytics.quizTitle]);
  rows.push(['Room PIN', analytics.pin]);
  rows.push(['Finished', new Date(analytics.finishedAt).toISOString()]);
  rows.push(['Players', analytics.playerCount]);
  rows.push(['Questions', analytics.questionCount]);
  rows.push(['Class accuracy', pct(analytics.overallAccuracy)]);
  rows.push([]);

  // --- student x question matrix -------------------------------------------
  const header = ['Rank', 'Student', 'Total score', 'Correct', 'Answered', 'Skipped', 'Accuracy'];
  for (const q of matrix.questions) {
    const label = 'Q' + (q.position + 1);
    header.push(label + ' result', label + ' points', label + ' time (s)', label + ' response');
  }
  rows.push(header);

  for (const row of matrix.rows) {
    const player = analytics.players.find((p) => p.id === row.playerId);
    const line = [
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

  // --- per-question summary ------------------------------------------------
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

  // --- option-level breakdown ----------------------------------------------
  rows.push([]);
  rows.push(['Answer breakdown']);
  rows.push(['Question', 'Answer', 'Correct?', 'Times chosen', 'Share of responses']);
  for (const q of perQuestion) {
    const entries =
      q.type === 'short'
        ? (q.textResponses ?? []).map((t) => ({
            text: t.display,
            correct: t.correct,
            count: t.count,
          }))
        : q.options;
    for (const entry of entries) {
      rows.push([
        'Q' + (q.position + 1),
        entry.text,
        entry.correct ? 'Yes' : 'No',
        entry.count,
        q.answered ? pct(entry.count / q.answered) : '0%',
      ]);
    }
  }

  // --- integrity log -------------------------------------------------------
  if (analytics.integrityLog.length) {
    rows.push([]);
    rows.push(['Integrity events (signals, not proof - see the dashboard note)']);
    rows.push(['Time', 'Student', 'Event', 'Question', 'Warnings at the time']);
    for (const e of analytics.integrityLog) {
      rows.push([
        new Date(e.at).toISOString(),
        e.nickname,
        e.type.replace(/_/g, ' '),
        e.questionIndex >= 0 ? 'Q' + (e.questionIndex + 1) : '',
        e.strikes,
      ]);
    }
  }

  return toCsv(rows);
}

function pct(n) {
  return Math.round((Number(n) || 0) * 100) + '%';
}
