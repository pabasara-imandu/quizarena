#!/usr/bin/env node
/**
 * Write the prompts that get the app translated into another language.
 *
 *   node scripts/translation-prompt.mjs Sinhala
 *   node scripts/translation-prompt.mjs Tamil
 *   node scripts/translation-prompt.mjs Sinhala --missing si
 *
 * With --missing <code> it asks only for the keys that lib/i18n/<code>.ts
 * does not have yet - what a new screen adds. One short prompt, one short
 * reply, and translation-import.mjs merges it into the dictionary that is
 * already there.
 *
 * Reads every key in lib/i18n/en.ts and writes two files next to this script,
 * translation-prompt-<lang>-part1.txt (the student's screens and shared text)
 * and part2 (the teacher's screens). Paste each into a capable model as one
 * message; it answers with the same JSON translated. Save each answer as a
 * file and run scripts/translation-import.mjs to turn them into lib/i18n/<code>.ts.
 *
 * Two parts rather than one because a single reply of nearly five hundred
 * strings is long enough for a model to trail off or skip keys, and a skipped
 * key is a screen that silently stays English.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const language = process.argv[2];
if (!language) {
  console.error('Usage: node scripts/translation-prompt.mjs <Language name, e.g. Sinhala>');
  process.exit(1);
}

const missingOf = process.argv.indexOf('--missing') >= 0 ? process.argv[process.argv.indexOf('--missing') + 1] : null;
if (process.argv.includes('--missing') && !missingOf) {
  console.error('Usage: node scripts/translation-prompt.mjs <Language> --missing <code, e.g. si>');
  process.exit(1);
}

const source = readFileSync(join(here, '..', 'lib', 'i18n', 'en.ts'), 'utf8');
const body = source.slice(source.indexOf('export const en = {'));

// key: 'value'  |  key:\n    'value'  |  key: "value"
const entry = /^\s+'([A-Za-z0-9_.]+)':\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*,/gm;
const pairs = [];
for (const m of body.matchAll(entry)) {
  const value = (m[2] ?? m[3]).replace(/\\'/g, "'").replace(/\\"/g, '"');
  pairs.push([m[1], value]);
}

/** Keys a dictionary already has words for. */
function translatedKeys(code) {
  const file = join(here, '..', 'lib', 'i18n', `${code}.ts`);
  if (!existsSync(file)) return new Set();
  const text = readFileSync(file, 'utf8');
  const start = text.indexOf(`export const ${code}`);
  if (start < 0) return new Set();
  const have = new Set();
  for (const m of text.slice(start).matchAll(entry)) {
    if ((m[2] ?? m[3]).trim()) have.add(m[1]);
  }
  return have;
}

const STUDENT = [
  'lang.', 'ui.', 'format.', 'home.', 'join.', 'lobby.', 'quiz.', 'result.', 'reveal.', 'fs.',
  'locked.', 'notice.', 'final.', 'order.', 'short.', 'grid.', 'streak.', 'leaderboard.', 'emoji.',
  'countdown.', 'err.', 'type.', 'rail.type.',
];
const isStudent = (k) => STUDENT.some((p) => k.startsWith(p));
const part1 = Object.fromEntries(pairs.filter(([k]) => isStudent(k)));
const part2 = Object.fromEntries(pairs.filter(([k]) => !isStudent(k)));

const header = `You are translating the user interface of QuizArena - a live classroom quiz app (like Kahoot) built by a school ICT society in Sri Lanka - from English into ${language}.

Below is a JSON object. Each key is an identifier and each value is an English string that appears on screen. Return the SAME JSON object with every value translated into ${language}. Keys stay exactly as they are, in the same order. Do not add, drop or merge any key.

RULES
1. Placeholders in curly braces - {n}, {name}, {max}, {title}, {answer} and so on - must be kept exactly as written, braces and all. Move them to wherever ${language} word order needs them, but never translate, rename or remove them.
2. A key ending in _one is used when the number is exactly 1; the matching _other key is used for any other number. If ${language} words it the same way, give the same text for both.
3. Keep every symbol that carries meaning: ✓ ✕ → ↓ ⬆ ✨ · — … × ± % + and the letters A–E, TRUE/FALSE and the pipe |. Keep these in Latin letters, unchanged: PIN, Google, CSV, JSON, URL, QuizArena, Wi-Fi, file extensions such as .xlsx .xls .csv, and units such as kg, m/s². Sri Lankan users read these as they are.
4. Register: clear, friendly, modern written ${language} that a Grade 6 student can read on a phone and a teacher is comfortable with. Prefer everyday words over literary ones. Where an established ${language} word exists, use it rather than a transliteration; where none is in daily use (for example emoji, tab, full-screen), use the form Sri Lankans actually say, and use the same form every time.
5. Button labels and short labels must stay SHORT - about the length of the English. Longer hints and notes may be rephrased naturally as long as the meaning is complete.
6. Use correct Unicode for the script, including zero-width joiners where conjunct letters need them. No legacy font encodings, no Roman transliteration.
7. The same concept must get the same ${language} word everywhere. Read the glossary and the notes first.
8. Output ONLY the JSON object - valid JSON, nothing before it, nothing after it, no code fences, no comments. Escape a double quote inside a value as \\".

GLOSSARY - use these consistently
- quiz: the whole game a class plays together
- question / answer / correct / wrong
- room: the online room a class joins with a 6-digit PIN
- host: the teacher who runs the quiz from their laptop. In text a student reads, "the host" and "your teacher" both mean the teacher.
- student / player: the same person; the students playing on their phones
- nickname: the name a student types to join (a first name or a fun name)
- points / score / marks: all the same thing
- leaderboard: the ranked list of scores shown on the projector
- streak: a run of correct answers in a row, which multiplies points. Choose one short term and keep it.
- multiplier: the ×1.25, ×1.5 ... factor a streak earns
- speed bonus: extra points for answering fast
- reveal / "answers are up": the moment after a question closes when the right answer is shown
- skip: a student giving up on a question so the room can move on
- poll: a question with no right answer; it only shows what the class thinks
- explanation: the teacher's short "why this is the answer", shown with the answer
- full-screen: the phone browser's full-screen mode, which the teacher can require
- tab: a browser tab; leaving it during a question is flagged
- warnings (strikes): counted when a student leaves the quiz screen; too many and they are paused
- paused (locked): a student who cannot answer until the teacher lets them back in
- integrity: the anti-cheating log of those events (translate as honesty / trustworthiness, not as "security")
- re-mark: the teacher accepting a typed answer as correct after the quiz
- gradebook: a table of every student's marks
- tolerance (for number questions): the allowed ± margin around the correct number
- draft: questions written for the teacher to check before use

`;

const notes1 = `NOTES ON PARTICULAR KEYS
- format.ordinal: the pattern for a place such as 3rd / 7th. Give the ${language} pattern with {n} in it.
- lobby.youAreIn and quiz.yourPlace: a short heading; the student's nickname (or their rank) appears on the next line under it.
- quiz.captionPts, quiz.captionPoll, quiz.captionTyped, quiz.captionMulti, quiz.captionOrder: short fragments joined with " · " after "Question 3 of 10", in a small caption.
- quiz.submitAnswers_one / _other: a button; {n} is how many tiles the student ticked.
- reveal.mathBase, reveal.mathSpeed, reveal.mathStreak: fragments shown together as one small line, e.g. "1000 base + 220 speed × 1.5 streak".
- reveal.youPut / youPicked / youWrote and reveal.answerWas: {answer} is shown in bold inside the sentence.
- reveal.leading: {names} is a list of the top three nicknames.
- ui.you: a tiny tag beside the student's own name in a list.
- ui.offline: a tiny tag beside a name whose phone has disconnected.
- type.true / type.false: the two answer tiles of a true-or-false question, shown to students.
- type.*: the names of the seven question types, shown in a menu to the teacher.
- rail.type.*: 2-5 character abbreviations of those types, shown in a tiny badge. Keep them very short; a Latin abbreviation such as "MC" may stay if there is no short form.
- err.*: messages the server sends when it refuses something; short and plain.
- streak.aria, countdown.aria, emoji.sendAria, order.removeAria: read aloud by screen readers only; plain sentences.
- home.society: the official name "Ananda College ICT Society" - give the society's name in ${language}.
- home.chip: a small decorative badge with three short fragments.

`;

const notes2 = `NOTES ON PARTICULAR KEYS
- host.badge: a tiny badge that says this is the teacher's screen.
- identity.signOut: a small text link.
- creator.timeOf: {m} minutes and {s} seconds of total question time, e.g. "3m 20s of question time".
- creator.restored: {age} is filled from the age.* keys, e.g. "saved 8 minutes ago on this device".
- rail.*: the list of questions down the side of the editor.
- editor.hint.*: one-line guidance under the answers area for each question type.
- editor.stepN / choiceN / answerN: placeholder text inside an empty answer box.
- editor.tolerance: the allowed ± margin for a number question.
- img.upload: a button; {label} is "image" or "answer image" in lower case.
- img.attached: {label} is "Image" or "Answer image".
- settings.*: switches in a settings panel; each has a short label and a longer hint underneath.
- settings.off: shown instead of a number when warnings are turned off.
- sf.*: the dialog for importing a spreadsheet or generating questions from a topic.
- sf.colsNote: "Correct Answer" and "TRUE/FALSE" are spreadsheet column names and values that must stay in English.
- sf.yearPlaceholder: an example grade; use the Sri Lankan form (Grade 8).
- hl.*: the lobby on the projector before the quiz starts. hl.readyOf: "{n} of {max} players are ready".
- hl.inRoom: heading of the list of students who have joined.
- live.*: the teacher's screen during the quiz. live.answersIn: label over a counter such as "12 / 30".
- live.correct / answered / skipped / avgTime / votes: labels under big numbers.
- live.scores / live.activity: two tabs in a side panel.
- live.letBackIn: a small button that un-pauses a student.
- live.auto: a tiny badge meaning the room advances by itself.
- integ.*: fragments that follow a student's name in an activity log, e.g. "Nimal left the tab".
- an.*: the results screen after a quiz. an.tab.matrix is a tab showing a grid of every student against every question.
- an.qStats: e.g. "18/25 correct · 3 did not answer". an.avgOf: e.g. "avg 6.2s of 20s".
- mx.*: that grid. mx.pts and mx.inTime are joined into a tooltip, e.g. "1200 pts in 4.5s".
- st.*: column headings of the student table. st.flagsValue: a compact count, e.g. "2 tab · 1 fs" (tab switches and full-screen exits) - keep it compact.
- st.q: a one-letter column heading for the question number.
- st.report: a small button at the end of a student's row, and st.reportAria is what a screen reader says for it.
- rep.*: one student's whole report, opened over the results and made to be printed. rep.rankOf: their place, e.g. "3rd of 28". rep.theirAnswer and rep.correctAnswer are small labels in front of an answer. rep.timeOf, rep.worth and rep.classGot are fragments joined with " · " in one small line under each question, e.g. "4.3s of 20s · worth 1000 · class 62% correct (18/29)". rep.status.*: a small pill on each question - keep the ✓ ✕ ⏭ marks. rep.flagLoose: shown instead of a question number when the flag was raised in the lobby or between questions. rep.keysHint: the keyboard keys that page between students.
- rm.*: the re-marking screen. rm.auto: placeholder in a marks box meaning "worked out automatically".
- past.*: the list of finished quizzes saved on the device. past.q: e.g. "12 Q" meaning 12 questions - keep it short.

`;

const dump = (o) => JSON.stringify(o, null, 2);
const slug = language.toLowerCase();

if (missingOf) {
  const have = translatedKeys(missingOf);
  const missing = Object.fromEntries(pairs.filter(([k]) => !have.has(k)));
  const count = Object.keys(missing).length;
  const out = join(here, `translation-prompt-${slug}-missing.txt`);
  if (count === 0) {
    console.log(`Nothing missing - lib/i18n/${missingOf}.ts already has all ${pairs.length} keys.`);
    process.exit(0);
  }
  writeFileSync(
    out,
    header +
      notes1 +
      notes2 +
      `JSON TO TRANSLATE (the ${count} strings lib/i18n/${missingOf}.ts does not have yet):\n\n` +
      dump(missing) +
      '\n'
  );
  console.log(`${count} missing strings -> ${out}`);
  process.exit(0);
}

const out1 = join(here, `translation-prompt-${slug}-part1.txt`);
const out2 = join(here, `translation-prompt-${slug}-part2.txt`);
writeFileSync(
  out1,
  header + notes1 + "JSON TO TRANSLATE (part 1 of 2 - the student's screens and shared text):\n\n" + dump(part1) + '\n'
);
writeFileSync(
  out2,
  header + notes2 + "JSON TO TRANSLATE (part 2 of 2 - the teacher's screens):\n\n" + dump(part2) + '\n'
);
console.log(`${pairs.length} strings -> ${out1} (${Object.keys(part1).length}) and ${out2} (${Object.keys(part2).length})`);
