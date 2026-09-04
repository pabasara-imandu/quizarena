export type QuestionType = 'multiple' | 'truefalse' | 'short';

export interface Option {
  id: string;
  text: string;
  image?: string | null;
  correct?: boolean;
}

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  image?: string | null;
  options: Option[];
  /** Short-answer only. Never sent to students. */
  acceptedAnswers?: string[];
  caseSensitive?: boolean;
  timeLimitSec: number;
  points: number;
}

export interface Quiz {
  id?: string;
  title: string;
  questions: Question[];
}

export interface RoomSettings {
  shuffleAnswers: boolean;
  shuffleQuestions: boolean;
  speedBonus: boolean;
  requireFullscreen: boolean;
  allowLateJoin: boolean;
  showLeaderboardBetweenQuestions: boolean;
  autoAdvance: boolean;
  allowSkip: boolean;
  allowReactions: boolean;
  strikeLimit: number;
}

export type Phase = 'lobby' | 'leadIn' | 'question' | 'reveal' | 'leaderboard' | 'ended';

/** Question as delivered over the wire (server-side timing, no correct flags for players). */
export interface LiveQuestion {
  id: string;
  index: number;
  total: number;
  text: string;
  type: QuestionType;
  image?: string | null;
  points: number;
  timeLimitMs: number;
  options: Option[];
  acceptedAnswers?: string[];
  caseSensitive?: boolean;
}

export interface LeaderboardRow {
  rank: number;
  id: string;
  nickname: string;
  score: number;
  streak: number;
  connected: boolean;
}

export interface HostPlayer {
  id: string;
  nickname: string;
  score: number;
  streak: number;
  connected: boolean;
  strikes: number;
  tabSwitches: number;
  fullscreenExits: number;
  answered: boolean;
}

export interface HostSync {
  phase: Phase;
  playerCount: number;
  connectedCount: number;
  answeredCount: number;
  /** Full roster in the lobby; top scorers + flagged players once playing. */
  players: HostPlayer[];
  /** True when `players` is a summary rather than the whole room. */
  rosterTruncated?: boolean;
}

export interface IntegrityEntry {
  id: string;
  playerId: string;
  nickname: string;
  type:
    | 'tab_hidden'
    | 'tab_visible'
    | 'fullscreen_exit'
    | 'fullscreen_enter'
    | 'window_blur'
    | 'copy_attempt'
    | 'devtools_suspected';
  meta: { hiddenMs?: number };
  questionIndex: number;
  strikes: number;
  at: number;
}

/** Grouped free-text responses shown to the host. */
export interface TextResponse {
  key: string;
  display: string;
  count: number;
  correct: boolean;
  /** Set once a host has marked this spelling by hand. */
  regraded?: boolean;
}

export interface PlayerResult {
  answered: boolean;
  skipped: boolean;
  correct: boolean;
  chosenOptionId?: string | null;
  submittedText?: string | null;
  pointsEarned: number;
  basePoints?: number;
  speedComponent?: number;
  /** Streak multiplier applied to this answer (1, 1.25, 1.5, 1.75, 2). */
  multiplier: number;
  multiplierBonus?: number;
  streak: number;
  streakBroken?: boolean;
  nextMultiplier?: number;
  score: number;
  elapsedMs?: number;
  rank?: number;
  totalPlayers?: number;
}

export interface QuestionAnalytics {
  position: number;
  questionId: string;
  text: string;
  type: QuestionType;
  image?: string | null;
  points: number;
  timeLimitSec: number;
  options: (Option & { count: number })[];
  acceptedAnswers: string[] | null;
  textResponses: TextResponse[] | null;
  answered: number;
  skipped: number;
  unanswered: number;
  correct: number;
  accuracy: number;
  averageResponseMs: number | null;
}

export interface MatrixCell {
  status: 'correct' | 'incorrect' | 'skipped' | 'no_answer';
  points: number;
  responseMs: number | null;
  response: string | null;
}

export interface Matrix {
  questions: { position: number; questionId: string; text: string; type: QuestionType; points: number }[];
  rows: { rank: number; playerId: string; nickname: string; score: number; cells: MatrixCell[] }[];
}

export interface Analytics {
  quizTitle: string;
  pin: string;
  finishedAt: number;
  playerCount: number;
  questionCount: number;
  overallAccuracy: number;
  averageScore: number;
  hardestQuestions: QuestionAnalytics[];
  easiestQuestions: QuestionAnalytics[];
  perQuestion: QuestionAnalytics[];
  podium: { rank: number; nickname: string; score: number }[];
  players: {
    rank: number;
    id: string;
    nickname: string;
    score: number;
    correctCount: number;
    answeredCount: number;
    skippedCount: number;
    accuracy: number;
    bestStreak: number;
    averageResponseMs: number | null;
    strikes: number;
    tabSwitches: number;
    fullscreenExits: number;
  }[];
  matrix: Matrix;
  integrityLog: IntegrityEntry[];
}

/** The only reactions a student can send - must match the server allowlist. */
export const REACTIONS = ['👍', '🔥', '😂', '😮', '🎉', '❤️', '🤔', '😭'] as const;
export type Reaction = (typeof REACTIONS)[number];

export interface Ack {
  ok: boolean;
  code?: string;
  message?: string;
}
