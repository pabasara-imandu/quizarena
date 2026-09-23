import type { Analytics, IntegrityEntry, MatrixCell, QuestionAnalytics, QuestionType } from '@/lib/types';

/**
 * One participant's whole paper, rebuilt from the results payload.
 *
 * The gradebook answers "how did the class do"; this answers "what did *this
 * child* write". A parent asking where the marks went, a student appealing a
 * mark, a teacher filling a report card - all of them need the questions in
 * order, the answer that was actually given, the answer that was wanted, and
 * what each one earned.
 *
 * Everything here comes out of the analytics object already on screen, so a
 * report opens with no network and works on an archive opened days later,
 * from a server that no longer exists.
 */

/** The wanted answer, written out the way a person reads it. Null for a poll. */
export function answerKeyOf(q: QuestionAnalytics): string | null {
  const label = (id: string) => q.options.find((o) => o.id === id)?.text ?? id;
  switch (q.type) {
    case 'poll':
      return null;
    case 'short':
      return (q.acceptedAnswers ?? []).join(' · ') || null;
    case 'numeric':
      return q.answer == null
        ? null
        : String(q.answer) + (q.tolerance ? ' ± ' + q.tolerance : '') + (q.unit ? ' ' + q.unit : '');
    case 'ordering':
      return (q.correctOrder ?? []).map(label).join(' → ') || null;
    default:
      return (
        q.options
          .filter((o) => o.correct)
          .map((o) => o.text)
          .join(' · ') || null
      );
  }
}

export interface ReportLine {
  /** Position in the order this room saw, not the order the quiz was written in. */
  position: number;
  questionId: string;
  text: string;
  type: QuestionType;
  /** The picture that came with the question, if there was one. */
  image: string | null;
  /** What the question was worth before speed and streak. */
  basePoints: number;
  timeLimitSec: number;
  status: MatrixCell['status'];
  /** What they gave, as text. Null when they skipped or never answered. */
  response: string | null;
  points: number;
  responseMs: number | null;
  correctAnswer: string | null;
  explanation: string | null;
  /** How the rest of the room did on this one, for context beside a wrong answer. */
  classAccuracy: number;
  classCorrect: number;
  classAnswered: number;
  /** Their own integrity events while this question was on screen. */
  flags: IntegrityEntry[];
}

export interface StudentReport {
  playerId: string;
  nickname: string;
  rank: number;
  /** Where they sit in `matrix.rows`, for paging to the next student. */
  index: number;
  total: number;
  score: number;
  correctCount: number;
  answeredCount: number;
  skippedCount: number;
  noAnswerCount: number;
  pollCount: number;
  accuracy: number;
  averageResponseMs: number | null;
  bestStreak: number;
  strikes: number;
  tabSwitches: number;
  fullscreenExits: number;
  lines: ReportLine[];
  /** Flags raised outside any question - in the lobby, or between them. */
  looseFlags: IntegrityEntry[];
  flagCount: number;
  /** The room, for the two comparison bars. */
  classAccuracy: number;
  classAverageScore: number;
  classTopScore: number;
}

export function buildStudentReport(analytics: Analytics, playerId: string): StudentReport | null {
  const rows = analytics.matrix?.rows ?? [];
  const index = rows.findIndex((r) => r.playerId === playerId);
  if (index === -1) return null;

  const row = rows[index];
  const player = analytics.players.find((p) => p.id === playerId) ?? null;
  const byId = new Map(analytics.perQuestion.map((q) => [q.questionId, q]));

  const mine = analytics.integrityLog.filter((e) => e.playerId === playerId);
  const flagsAt = new Map<number, IntegrityEntry[]>();
  for (const e of mine) {
    const list = flagsAt.get(e.questionIndex);
    if (list) list.push(e);
    else flagsAt.set(e.questionIndex, [e]);
  }

  const questions = analytics.matrix.questions;
  const lines: ReportLine[] = row.cells.map((cell, i) => {
    const mq = questions[i];
    const q = byId.get(mq.questionId);
    return {
      position: mq.position,
      questionId: mq.questionId,
      text: mq.text,
      type: mq.type,
      image: q?.image ?? null,
      basePoints: mq.points,
      timeLimitSec: q?.timeLimitSec ?? 0,
      status: cell.status,
      response: cell.response,
      points: cell.points ?? 0,
      responseMs: cell.responseMs,
      correctAnswer: q ? answerKeyOf(q) : null,
      explanation: q?.explanation ?? null,
      classAccuracy: q?.accuracy ?? 0,
      classCorrect: q?.correct ?? 0,
      classAnswered: q?.answered ?? 0,
      flags: flagsAt.get(mq.position) ?? [],
    };
  });

  const count = (status: MatrixCell['status']) => row.cells.filter((c) => c.status === status).length;
  const correctCount = player?.correctCount ?? count('correct');
  const answeredCount = player?.answeredCount ?? count('correct') + count('incorrect');

  return {
    playerId,
    nickname: row.nickname,
    rank: row.rank,
    index,
    total: rows.length,
    score: row.score,
    correctCount,
    answeredCount,
    skippedCount: player?.skippedCount ?? count('skipped'),
    noAnswerCount: count('no_answer'),
    pollCount: count('answered'),
    accuracy: player?.accuracy ?? (answeredCount ? correctCount / answeredCount : 0),
    averageResponseMs: player?.averageResponseMs ?? null,
    bestStreak: player?.bestStreak ?? 0,
    strikes: player?.strikes ?? 0,
    tabSwitches: player?.tabSwitches ?? 0,
    fullscreenExits: player?.fullscreenExits ?? 0,
    lines,
    // A questionIndex of -1 is the lobby; anything past the last question is
    // the results screen. Neither belongs against a question.
    looseFlags: mine.filter((e) => e.questionIndex < 0 || e.questionIndex >= questions.length),
    flagCount: mine.length,
    classAccuracy: analytics.overallAccuracy,
    classAverageScore: analytics.averageScore,
    classTopScore: rows.length ? Math.max(...rows.map((r) => r.score)) : 0,
  };
}
