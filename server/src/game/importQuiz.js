import * as XLSX from 'xlsx';
import { normalizeQuiz, ValidationError } from './quizSchema.js';

/**
 * Spreadsheet import (.xlsx / .xls / .csv).
 *
 * Expected columns (header row required, matched case-insensitively and
 * ignoring spaces/underscores, so "Question Text", "question_text" and
 * "QUESTIONTEXT" are all the same column):
 *
 *   Question Text   - required
 *   Question Type   - multiple | multiselect | truefalse | short | numeric | ordering | poll
 *                     (default: inferred)
 *   Explanation     - optional, shown to everyone with the answer
 *   Option 1..5     - answer choices (multiple choice only)
 *   Correct Answer  - see resolveCorrect() below
 *   Time Limit      - seconds (default 20)
 *   Points          - default 1000
 *   Image Link      - absolute http(s) URL for the question
 *   Option 1 Image..- optional per-option image URLs
 *
 * The goal is that a teacher's existing spreadsheet imports without being
 * rewritten, so every column except the question text is optional and the
 * parser guesses sensibly rather than refusing.
 */

const OPTION_COUNT = 5;

/** "Question Text" / "question_text" / "QUESTIONTEXT" all collapse to the same key. */
function keyOf(header) {
  return String(header ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const ALIASES = {
  text: ['questiontext', 'question', 'prompt', 'q'],
  type: ['questiontype', 'type'],
  explanation: ['explanation', 'why', 'feedback'],
  correct: ['correctanswer', 'correct', 'answer', 'key'],
  time: ['timelimit', 'timelimitseconds', 'timelimitsec', 'time', 'seconds'],
  points: ['points', 'score', 'pointvalue'],
  image: ['imagelink', 'image', 'imageurl', 'questionimage', 'media'],
  caseSensitive: ['casesensitive'],
};

function pick(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== '') {
      return String(row[name]).trim();
    }
  }
  return '';
}

/**
 * The "Correct Answer" column is the messiest field in every real-world
 * spreadsheet, so accept every form teachers actually use:
 *   - a letter:   A / B / C / D / E
 *   - an index:   1 / 2 / 3 ...
 *   - TRUE/FALSE for true-false rows
 *   - the answer text itself, matched against the option columns
 * For short-answer rows the whole cell is the accepted answer (or several,
 * separated by | or ;).
 */
function resolveCorrect(raw, options) {
  const value = raw.trim();
  if (!value) return -1;

  const letter = value.toUpperCase();
  if (/^[A-E]$/.test(letter)) {
    const idx = letter.charCodeAt(0) - 65;
    return idx < options.length ? idx : -1;
  }

  if (/^\d+$/.test(value)) {
    const idx = Number(value) - 1;
    return idx >= 0 && idx < options.length ? idx : -1;
  }

  const match = options.findIndex((o) => o.toLowerCase() === value.toLowerCase());
  return match;
}

export function parseQuizWorkbook(buffer, { title } = {}) {
  let workbook;
  try {
    // Without a BOM, SheetJS guesses a CSV's encoding and lands on Windows-1252,
    // which turns every Sinhala or Tamil character into three bytes of junk.
    // Every editor a teacher uses saves UTF-8, so say so.
    workbook = XLSX.read(buffer, { type: 'buffer', codepage: 65001 });
  } catch {
    throw new ValidationError('That file could not be read as a spreadsheet or CSV.');
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new ValidationError('The workbook has no sheets.');

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false });
  if (rows.length === 0) throw new ValidationError('The first sheet has no rows.');

  const warnings = [];
  const questions = [];

  rows.forEach((rawRow, i) => {
    const rowNumber = i + 2; // +1 for zero-index, +1 for the header row
    const row = {};
    for (const [header, value] of Object.entries(rawRow)) row[keyOf(header)] = value;

    const text = pick(row, ALIASES.text);
    if (!text) return; // blank spacer rows are common and harmless

    const options = [];
    const optionImages = [];
    for (let n = 1; n <= OPTION_COUNT; n++) {
      options.push(pick(row, ['option' + n, 'answer' + n, 'choice' + n, String.fromCharCode(96 + n)]));
      optionImages.push(pick(row, ['option' + n + 'image', 'answer' + n + 'image']));
    }
    const filled = options.map((o, idx) => ({ text: o, image: optionImages[idx] })).filter((o) => o.text);

    const correctRaw = pick(row, ALIASES.correct);
    const declaredType = pick(row, ALIASES.type).toLowerCase().replace(/[^a-z]/g, '');

    let type;
    if (['short', 'shortanswer', 'text', 'freetext', 'open'].includes(declaredType)) type = 'short';
    else if (['truefalse', 'tf', 'boolean', 'bool'].includes(declaredType)) type = 'truefalse';
    else if (['multiple', 'multiplechoice', 'mc', 'choice'].includes(declaredType)) type = 'multiple';
    else if (['multiselect', 'multi', 'selectall', 'checkbox', 'checkboxes'].includes(declaredType)) type = 'multiselect';
    else if (['numeric', 'number', 'num'].includes(declaredType)) type = 'numeric';
    else if (['ordering', 'order', 'sequence', 'sort'].includes(declaredType)) type = 'ordering';
    else if (['poll', 'survey', 'opinion'].includes(declaredType)) type = 'poll';
    // No usable type column: infer from the shape of the row.
    else if (filled.length >= 2) type = 'multiple';
    else if (/^(true|false)$/i.test(correctRaw)) type = 'truefalse';
    else type = 'short';

    const base = {
      text,
      type,
      image: pick(row, ALIASES.image),
      timeLimitSec: Number(pick(row, ALIASES.time)) || 20,
      points: Number(pick(row, ALIASES.points)) || 1000,
      explanation: pick(row, ALIASES.explanation) || null,
    };

    // "8 ± 0.5 bits", "8+-0.5", "8" - the answer, an optional tolerance, an
    // optional unit, in whatever spacing a teacher typed.
    if (type === 'numeric') {
      const m = correctRaw.match(/^\s*(-?[\d.,]+)\s*(?:(?:±|\+\/?-)\s*([\d.,]+))?\s*(.*)$/);
      const answer = m ? Number(m[1].replace(',', '.')) : NaN;
      if (!Number.isFinite(answer)) {
        warnings.push('Row ' + rowNumber + ' skipped: numeric row needs a number in the answer column.');
        return;
      }
      questions.push({
        ...base,
        answer,
        tolerance: m?.[2] ? Number(m[2].replace(',', '.')) : 0,
        unit: m?.[3]?.trim() || null,
      });
      return;
    }

    // Options in the columns ARE the answer, in order. No answer column needed.
    if (type === 'ordering' || type === 'poll') {
      if (filled.length < 2) {
        warnings.push('Row ' + rowNumber + ' skipped: needs at least two options.');
        return;
      }
      questions.push({
        ...base,
        options: filled.map((o, idx) => ({ id: 'r' + rowNumber + 'o' + idx, text: o.text, image: o.image })),
      });
      return;
    }

    // "A,C" / "1;3" / "Keyboard|Mouse" - every listed option is correct.
    if (type === 'multiselect') {
      if (filled.length < 2) {
        warnings.push('Row ' + rowNumber + ' skipped: needs at least two options.');
        return;
      }
      const texts = filled.map((o) => o.text);
      const picked = new Set(
        correctRaw.split(/[,;|]/).map((part) => resolveCorrect(part, texts)).filter((i) => i >= 0)
      );
      if (picked.size === 0) {
        warnings.push('Row ' + rowNumber + ' skipped: could not match "' + correctRaw + '" to any option.');
        return;
      }
      questions.push({
        ...base,
        options: filled.map((o, idx) => ({
          id: 'r' + rowNumber + 'o' + idx,
          text: o.text,
          image: o.image,
          correct: picked.has(idx),
        })),
      });
      return;
    }

    if (type === 'short') {
      const accepted = correctRaw
        .split(/[|;]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (accepted.length === 0) {
        warnings.push('Row ' + rowNumber + ' skipped: short-answer row has no correct answer.');
        return;
      }
      questions.push({
        ...base,
        acceptedAnswers: accepted,
        caseSensitive: /^(true|yes|y|1)$/i.test(pick(row, ALIASES.caseSensitive)),
      });
      return;
    }

    if (type === 'truefalse') {
      if (!/^(true|false|t|f|yes|no)$/i.test(correctRaw)) {
        warnings.push('Row ' + rowNumber + ' skipped: true/false row needs TRUE or FALSE.');
        return;
      }
      questions.push({ ...base, correctBoolean: /^(true|t|yes)$/i.test(correctRaw) });
      return;
    }

    if (filled.length < 2) {
      warnings.push('Row ' + rowNumber + ' skipped: needs at least two options.');
      return;
    }

    const correctIndex = resolveCorrect(
      correctRaw,
      filled.map((o) => o.text)
    );
    if (correctIndex < 0) {
      warnings.push(
        'Row ' + rowNumber + ' skipped: could not match "' + correctRaw + '" to an option.'
      );
      return;
    }

    questions.push({
      ...base,
      options: filled.map((o, idx) => ({
        id: 'r' + rowNumber + 'o' + idx,
        text: o.text,
        image: o.image,
        correct: idx === correctIndex,
      })),
    });
  });

  if (questions.length === 0) {
    throw new ValidationError(
      'No usable questions were found. ' +
        (warnings[0] ?? 'Check that the first row contains column headers.')
    );
  }

  // Run the result through the same validator the live editor uses, so an
  // imported quiz can never be less well-formed than a hand-built one.
  const quiz = normalizeQuiz({ title: title || sheetName || 'Imported quiz', questions });
  return { quiz, warnings, importedRows: questions.length, totalRows: rows.length };
}
