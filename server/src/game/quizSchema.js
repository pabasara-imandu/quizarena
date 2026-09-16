import { randomUUID } from 'node:crypto';
import { sanitizeText } from '../utils/rateLimit.js';

const MAX_QUESTIONS = 200;
const MAX_OPTIONS = 6;
const MAX_ACCEPTED_ANSWERS = 12;
const MAX_URL_LENGTH = 2048;

/**
 * Every kind of question the engine can grade.
 *
 *  multiple    one right answer among tiles
 *  multiselect every right answer must be picked, nothing else - all or nothing
 *  truefalse   two fixed tiles
 *  short       typed text, matched against a list of accepted spellings
 *  numeric     typed number, right if within a tolerance of the answer
 *  ordering    tiles put into the correct sequence
 *  poll        tiles with no right answer - nobody scores, nobody's streak moves
 */
export const QUESTION_TYPES = [
  'multiple',
  'multiselect',
  'truefalse',
  'short',
  'numeric',
  'ordering',
  'poll',
];

/** Types whose answer is typed rather than tapped - the ones a host can re-mark. */
export const TYPED_TYPES = ['short', 'numeric'];

export class ValidationError extends Error {}

/**
 * Only absolute http(s) URLs are allowed through.
 *
 * These strings end up in a `src` attribute on 100 student devices, so
 * `javascript:`, `data:` and protocol-relative URLs are rejected outright
 * rather than sanitised - there is no legitimate reason for a quiz image to
 * use one, and a permissive parser here is a stored-XSS vector.
 */
export function sanitizeImageUrl(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Normalises whatever the teacher's browser (or a spreadsheet import) sent
 * into a trusted quiz object. Every field the game loop depends on - points,
 * time limits, exactly-one correct answer, accepted short answers - is clamped
 * here so the engine can assume it is well-formed.
 */
export function normalizeQuiz(input) {
  if (!input || typeof input !== 'object') throw new ValidationError('Quiz payload is missing.');

  const title = sanitizeText(input.title, 120) || 'Untitled quiz';
  const rawQuestions = Array.isArray(input.questions) ? input.questions : [];

  if (rawQuestions.length === 0) throw new ValidationError('A quiz needs at least one question.');
  if (rawQuestions.length > MAX_QUESTIONS) {
    throw new ValidationError('A quiz can hold at most ' + MAX_QUESTIONS + ' questions.');
  }

  const questions = rawQuestions.map((q, i) => normalizeQuestion(q, i));
  return { id: randomUUID(), title, questions };
}

export function normalizeQuestion(q, i = 0) {
  const label = 'Question ' + (i + 1);
  const text = sanitizeText(q?.text, 500);
  if (!text) throw new ValidationError(label + ' has no text.');

  const type = QUESTION_TYPES.includes(q?.type) ? q.type : 'multiple';

  const base = {
    id: sanitizeText(q?.id, 40) || randomUUID(),
    text,
    type,
    image: sanitizeImageUrl(q?.image),
    timeLimitSec: clamp(Number(q?.timeLimitSec) || 20, 5, 300),
    points: clamp(Math.round(Number(q?.points) || 1000), 0, 10000),
    // Shown to everyone with the answer. The moment after a reveal is when a
    // student is most receptive, so this is where a quiz becomes teaching.
    explanation: sanitizeText(q?.explanation, 600) || null,
  };

  if (type === 'numeric') {
    const answer = Number(q?.answer);
    if (!Number.isFinite(answer)) {
      throw new ValidationError(label + ' needs a numeric answer.');
    }
    const tolerance = Math.abs(Number(q?.tolerance) || 0);
    return {
      ...base,
      options: [],
      answer,
      tolerance: Number.isFinite(tolerance) ? tolerance : 0,
      unit: sanitizeText(q?.unit, 20) || null,
    };
  }

  if (type === 'short') {
    const accepted = (Array.isArray(q?.acceptedAnswers) ? q.acceptedAnswers : [q?.correctAnswer])
      .map((a) => sanitizeText(a, 120))
      .filter(Boolean)
      .slice(0, MAX_ACCEPTED_ANSWERS);

    if (accepted.length === 0) {
      throw new ValidationError(label + ' needs at least one accepted answer.');
    }
    return {
      ...base,
      options: [], // free text has no options; the client renders an input
      acceptedAnswers: accepted,
      caseSensitive: !!q?.caseSensitive,
    };
  }

  if (type === 'truefalse') {
    // Accept either an options array (from the editor) or a plain boolean
    // (from a spreadsheet import that just wrote TRUE in the answer column).
    const trueIsCorrect = Array.isArray(q?.options)
      ? !!q.options.find((o) => /^true$/i.test(String(o?.text ?? '')))?.correct
      : !!q?.correctBoolean;
    return {
      ...base,
      options: [
        { id: 'true', text: 'True', correct: trueIsCorrect, image: null },
        { id: 'false', text: 'False', correct: !trueIsCorrect, image: null },
      ],
    };
  }

  const raw = Array.isArray(q?.options) ? q.options.slice(0, MAX_OPTIONS) : [];
  const options = raw
    .map((o, j) => ({
      id: sanitizeText(o?.id, 40) || 'o' + j,
      text: sanitizeText(o?.text, 200),
      correct: !!o?.correct,
      image: sanitizeImageUrl(o?.image),
    }))
    // An option with an image but no caption is legitimate ("pick the diagram").
    .filter((o) => o.text.length > 0 || o.image);

  if (options.length < 2) {
    throw new ValidationError(label + ' needs at least two answer options.');
  }
  if (new Set(options.map((o) => o.id)).size !== options.length) {
    throw new ValidationError(label + ' has duplicate option ids.');
  }

  if (type === 'poll') {
    // A poll has opinions, not answers. Strip any stray flag so nothing
    // downstream can mistake it for a gradable question.
    return { ...base, options: options.map((o) => ({ ...o, correct: false })) };
  }

  if (type === 'ordering') {
    // The array order IS the answer. Flags are meaningless here.
    return { ...base, options: options.map((o) => ({ ...o, correct: false })) };
  }

  if (type === 'multiselect') {
    if (!options.some((o) => o.correct)) {
      throw new ValidationError(label + ' needs at least one correct answer marked.');
    }
    return { ...base, options };
  }

  if (!options.some((o) => o.correct)) {
    throw new ValidationError(label + ' has no correct answer marked.');
  }

  return { ...base, options };
}

export function normalizeSettings(input) {
  const s = input && typeof input === 'object' ? input : {};
  return {
    shuffleAnswers: s.shuffleAnswers !== false,
    shuffleQuestions: !!s.shuffleQuestions,
    speedBonus: s.speedBonus !== false,
    requireFullscreen: s.requireFullscreen !== false,
    allowLateJoin: !!s.allowLateJoin,
    showLeaderboardBetweenQuestions: s.showLeaderboardBetweenQuestions !== false,
    autoAdvance: !!s.autoAdvance,
    allowSkip: s.allowSkip !== false,
    allowReactions: s.allowReactions !== false,
    strikeLimit: clamp(Math.round(Number(s.strikeLimit) || 3), 0, 20),
  };
}

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
