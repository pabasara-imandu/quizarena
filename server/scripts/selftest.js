/**
 * Fast, dependency-free checks of the scoring/answer engine.
 * Run with: npm run selftest
 */
import assert from 'node:assert/strict';
import { Room, PHASE } from '../src/game/room.js';
import { normalizeQuiz, normalizeSettings } from '../src/game/quizSchema.js';
import { streakMultiplier } from '../src/game/scoring.js';
import { matchesShortAnswer } from '../src/game/answerMatch.js';
import { buildMatrixCsv } from '../src/game/exportCsv.js';
import { startQuestion, openQuestion, snapshotFor } from '../src/game/flow.js';
import { detectImageType, imageStore } from '../src/state/imageStore.js';
import { csvCell } from '../src/game/exportCsv.js';
import express from 'express';
import helmet from 'helmet';
import { api } from '../src/routes/api.js';

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (err) {
    console.error('  FAIL  ' + name + '\n        ' + err.message);
    process.exitCode = 1;
  }
};

/** Same, for the checks that have to go over the wire to mean anything. */
const asyncTest = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (err) {
    console.error('  FAIL  ' + name + '\n        ' + err.message);
    process.exitCode = 1;
  }
};

const quiz = normalizeQuiz({
  title: 'Engine test',
  questions: [
    {
      id: 'q1',
      type: 'multiple',
      text: 'Pick A',
      timeLimitSec: 20,
      points: 1000,
      image: 'https://example.com/a.png',
      options: [
        { id: 'a', text: 'A', correct: true, image: 'https://example.com/opt.png' },
        { id: 'b', text: 'B' },
      ],
    },
    { id: 'q2', type: 'multiple', text: 'Pick A again', timeLimitSec: 20, points: 1000,
      options: [{ id: 'a', text: 'A', correct: true }, { id: 'b', text: 'B' }] },
    { id: 'q3', type: 'multiple', text: 'And again', timeLimitSec: 20, points: 1000,
      options: [{ id: 'a', text: 'A', correct: true }, { id: 'b', text: 'B' }] },
    {
      id: 'q4',
      type: 'short',
      text: 'Capital of France?',
      timeLimitSec: 30,
      points: 1000,
      acceptedAnswers: ['Paris'],
    },
  ],
});

function freshRoom(settingsPatch = {}) {
  const room = new Room({
    pin: '123456',
    quiz,
    settings: normalizeSettings({ shuffleAnswers: false, ...settingsPatch }),
    hostSocketId: 'host',
  });
  room.phase = PHASE.QUESTION;
  room.currentIndex = 0;
  room.startAt = Date.now();
  room.endAt = room.startAt + 20000;
  return room;
}

console.log('\nquizSchema');

test('rejects a javascript: image URL but keeps https', () => {
  const q = normalizeQuiz({
    title: 't',
    questions: [
      {
        text: 'x',
        type: 'multiple',
        image: 'javascript:alert(1)',
        options: [{ id: 'a', text: 'A', correct: true }, { id: 'b', text: 'B' }],
      },
    ],
  });
  assert.equal(q.questions[0].image, null);
  assert.equal(quiz.questions[0].image, 'https://example.com/a.png');
});

test('short-answer question keeps accepted answers and no options', () => {
  const q = quiz.questions[3];
  assert.equal(q.type, 'short');
  assert.deepEqual(q.acceptedAnswers, ['Paris']);
  assert.deepEqual(q.options, []);
});

console.log('\nanswer matching');

test('lowercase mode ignores case and stray whitespace', () => {
  assert.equal(matchesShortAnswer('  paris ', ['Paris'], { caseSensitive: false }), true);
  assert.equal(matchesShortAnswer('PARIS', ['Paris'], { caseSensitive: false }), true);
  assert.equal(matchesShortAnswer('Lyon', ['Paris'], { caseSensitive: false }), false);
});

test('exact mode is case sensitive', () => {
  assert.equal(matchesShortAnswer('paris', ['Paris'], { caseSensitive: true }), false);
  assert.equal(matchesShortAnswer('Paris', ['Paris'], { caseSensitive: true }), true);
});

console.log('\nplayer view');

test('players never receive acceptedAnswers or correct flags', () => {
  const room = freshRoom();
  const p = room.addPlayer({ nickname: 'A', socketId: 's1' });
  const view = room.questionForPlayer(p);
  assert.equal(view.acceptedAnswers, undefined);
  assert.ok(view.options.every((o) => o.correct === undefined));
  assert.equal(view.image, 'https://example.com/a.png');
  assert.equal(view.options[0].image, 'https://example.com/opt.png');

  room.currentIndex = 3; // short-answer question
  const shortView = room.questionForPlayer(p);
  assert.deepEqual(shortView.options, []);
  assert.equal(shortView.acceptedAnswers, undefined);
});

console.log('\nskip');

test('a skip records an answer, scores zero, and breaks the streak', () => {
  const room = freshRoom();
  const p = room.addPlayer({ nickname: 'A', socketId: 's1' });
  p.streak = 3;

  const res = room.submitAnswer({ player: p, skipped: true });
  assert.equal(res.ok, true);
  assert.equal(res.answeredCount, 1, 'a skip counts toward "everyone is done"');

  const { results, hostSummary } = room.finalizeQuestion();
  const mine = results.get(p.id);
  assert.equal(mine.answered, true);
  assert.equal(mine.skipped, true);
  assert.equal(mine.correct, false);
  assert.equal(mine.pointsEarned, 0);
  assert.equal(p.streak, 0);
  assert.equal(p.score, 0);
  assert.equal(hostSummary.skippedTotal, 1);
});

test('skip is refused when the host turned it off', () => {
  const room = freshRoom({ allowSkip: false });
  const p = room.addPlayer({ nickname: 'A', socketId: 's1' });
  assert.deepEqual(room.submitAnswer({ player: p, skipped: true }), {
    ok: false,
    reason: 'skip_disabled',
  });
});

console.log('\nstreak multiplier');

test('multiplier steps 1x -> 2x and caps', () => {
  assert.equal(streakMultiplier(1), 1);
  assert.equal(streakMultiplier(2), 1.25);
  assert.equal(streakMultiplier(5), 2);
  assert.equal(streakMultiplier(50), 2, 'caps at 2x');
});

test('three correct answers in a row apply a growing multiplier', () => {
  const room = freshRoom({ speedBonus: false });
  const p = room.addPlayer({ nickname: 'A', socketId: 's1' });
  const gained = [];

  for (let i = 0; i < 3; i++) {
    room.currentIndex = i;
    room.phase = PHASE.QUESTION;
    room.startAt = Date.now();
    room.endAt = room.startAt + 20000;
    room.submitAnswer({ player: p, optionId: 'a' });
    const { results } = room.finalizeQuestion();
    gained.push(results.get(p.id));
  }

  assert.deepEqual(gained.map((g) => g.multiplier), [1, 1.25, 1.5]);
  assert.deepEqual(gained.map((g) => g.pointsEarned), [1000, 1250, 1500]);
  assert.equal(p.score, 3750);
  assert.equal(gained[2].nextMultiplier, 1.75);
});

test('a wrong answer resets the multiplier and flags the break', () => {
  const room = freshRoom({ speedBonus: false });
  const p = room.addPlayer({ nickname: 'A', socketId: 's1' });
  p.streak = 4;
  room.submitAnswer({ player: p, optionId: 'b' });
  const { results } = room.finalizeQuestion();
  assert.equal(results.get(p.id).streakBroken, true);
  assert.equal(p.streak, 0);
});

console.log('\nshort answers');

test('free text is graded and grouped for the host', () => {
  const room = freshRoom();
  room.currentIndex = 3;
  room.startAt = Date.now();
  room.endAt = room.startAt + 30000;

  const a = room.addPlayer({ nickname: 'A', socketId: 's1' });
  const b = room.addPlayer({ nickname: 'B', socketId: 's2' });
  const c = room.addPlayer({ nickname: 'C', socketId: 's3' });

  assert.equal(room.submitAnswer({ player: a, text: '  paris ' }).ok, true);
  assert.equal(room.submitAnswer({ player: b, text: 'Paris' }).ok, true);
  assert.equal(room.submitAnswer({ player: c, text: 'Lyon' }).ok, true);
  assert.deepEqual(room.submitAnswer({ player: a, text: 'x' }), {
    ok: false,
    reason: 'already_answered',
  });

  const { results, hostSummary } = room.finalizeQuestion();
  assert.equal(results.get(a.id).correct, true, 'case and spacing forgiven');
  assert.equal(results.get(b.id).correct, true);
  assert.equal(results.get(c.id).correct, false);
  assert.equal(hostSummary.correctTotal, 2);

  const top = hostSummary.textResponses[0];
  assert.equal(top.count, 2, 'paris and Paris group together');
  assert.equal(top.correct, true);
});

test('an empty short answer is refused rather than scored', () => {
  const room = freshRoom();
  room.currentIndex = 3;
  room.startAt = Date.now();
  room.endAt = room.startAt + 30000;
  const p = room.addPlayer({ nickname: 'A', socketId: 's1' });
  assert.deepEqual(room.submitAnswer({ player: p, text: '   ' }), {
    ok: false,
    reason: 'empty_answer',
  });
});

console.log('\nregressions');

test('a player the server thinks is disconnected still receives the question', () => {
  // Regression: startQuestion used to `continue` past any player whose
  // `connected` flag was false. The server only learns about a disconnect
  // after a ping timeout, so a backgrounded phone whose browser was still
  // perfectly alive got skipped - permanently, with no error.
  const room = freshRoom();
  room.phase = PHASE.LOBBY;
  const live = room.addPlayer({ nickname: 'Live', socketId: 'sock-live' });
  const ghost = room.addPlayer({ nickname: 'Ghost', socketId: 'sock-ghost' });
  ghost.connected = false; // server believes they are gone; their browser does not

  const sent = [];
  const fakeIo = {
    to(target) {
      return {
        emit(event, payload) {
          sent.push({ target, event, payload });
        },
      };
    },
  };

  // Capture the lead-in callback instead of waiting three real seconds.
  const realSetTimeout = globalThis.setTimeout;
  const scheduled = [];
  globalThis.setTimeout = (fn, ms) => {
    scheduled.push(fn);
    return { unref() {} };
  };
  try {
    startQuestion(fakeIo, room, 0);
    scheduled[0](); // fire the lead-in -> opens the question
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }

  const questionTargets = sent
    .filter((s) => s.event === 'game:question')
    .map((s) => s.target);

  assert.ok(questionTargets.includes('sock-live'), 'connected player got the question');
  assert.ok(
    questionTargets.includes('sock-ghost'),
    'a player marked disconnected must still be sent the question'
  );

  if (room.timer) clearTimeout(room.timer);
});

test('advancing during the lead-in opens the question instead of scoring it', () => {
  // Regression: "next" during the 3s countdown used to call endQuestion, which
  // scored a question nobody had seen - every player recorded as "no answer",
  // every streak broken.
  const room = freshRoom();
  room.phase = PHASE.LOBBY;
  const p = room.addPlayer({ nickname: 'A', socketId: 's1' });
  p.streak = 3;

  const sent = [];
  const fakeIo = {
    to: (target) => ({ emit: (event, payload) => sent.push({ target, event, payload }) }),
  };

  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = () => ({ unref() {} });
  try {
    startQuestion(fakeIo, room, 0);
    assert.equal(room.phase, PHASE.LEAD_IN);
    openQuestion(fakeIo, room); // what host:next now does during the lead-in
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }

  assert.equal(room.phase, PHASE.QUESTION, 'the question opens rather than closing');
  assert.equal(p.streak, 3, 'a streak survives a host skipping the countdown');
  assert.ok(
    sent.some((s) => s.event === 'game:question' && s.target === 's1'),
    'the player is sent the question'
  );
  // The clock restarts on open, so nobody loses the skipped countdown seconds.
  assert.ok(room.endAt - room.startAt === 20000, 'full time limit is preserved');

  if (room.timer) clearTimeout(room.timer);
});

test('a snapshot during reveal carries the answer, so no phase renders blank', () => {
  // Regression: a student who joined late or reconnected mid-reveal got a
  // phase with no payload and the student view rendered nothing at all.
  const room = freshRoom();
  const p = room.addPlayer({ nickname: 'Late', socketId: 's1' });
  room.phase = PHASE.REVEAL;

  const snap = snapshotFor(room, p);
  assert.equal(snap.phase, 'reveal');
  assert.ok(snap.question, 'the question itself is included at reveal time');
  assert.deepEqual(snap.reveal.correctOptionIds, ['a']);
  assert.equal(snap.you.answered, false);

  room.currentIndex = 3; // short answer
  const shortSnap = snapshotFor(room, p);
  assert.deepEqual(shortSnap.reveal.acceptedAnswers, ['Paris']);
});

console.log('\nimage store');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DAwMDAxMDAwAAADRQBBwUBCwAAAABJRU5ErkJggg==',
  'base64'
);

test('an SVG is never accepted as an image', () => {
  // SVG is a document format that can carry <script> and remote references.
  // Serving one from our own origin would hand an uploader a stored-XSS
  // primitive, so it is rejected outright rather than sanitised.
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal(detectImageType(svg), null);
  assert.deepEqual(imageStore.put(svg), { ok: false, reason: 'not_an_image' });
});

test('the type comes from the bytes, not the filename', () => {
  const lying = Buffer.from('this is plain text that was renamed to .png');
  assert.equal(detectImageType(lying), null);
  assert.equal(detectImageType(PNG)?.mime, 'image/png');
});

test('identical bytes are stored once and share a URL', () => {
  const first = imageStore.put(PNG);
  const second = imageStore.put(PNG);
  assert.equal(first.ok, true);
  assert.equal(second.id, first.id, 'content-addressed, so the id is the same');
  assert.equal(second.deduped, true);
  assert.ok(imageStore.get(first.id), 'readable back out');
});

test('an oversized image is refused, with its limit', () => {
  const huge = Buffer.concat([PNG, Buffer.alloc(imageStore.maxEntryBytes + 1)]);
  const res = imageStore.put(huge);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'too_large');
  assert.equal(res.limit, imageStore.maxEntryBytes);
});

test('the store evicts rather than growing past its ceiling', () => {
  // A tiny clone proves the eviction path without allocating 64MB.
  const tiny = Object.create(Object.getPrototypeOf(imageStore));
  Object.assign(tiny, {
    maxTotalBytes: 400,
    maxEntryBytes: 300,
    ttlMs: 60_000,
    entries: new Map(),
    totalBytes: 0,
  });

  const make = (n) => Buffer.concat([PNG, Buffer.alloc(n)]);
  tiny.put(make(50));
  tiny.put(make(60));
  tiny.put(make(70));
  tiny.put(make(200));

  assert.ok(tiny.totalBytes <= tiny.maxTotalBytes, 'ceiling respected');
  assert.ok(tiny.entries.size >= 1, 'the newest entry survived');
});

console.log('\nexport');

test('CSV cells neutralise spreadsheet formula injection', () => {
  assert.equal(csvCell('=cmd|calc'), '"\'=cmd|calc"');
  assert.equal(csvCell('Say "hi"'), '"Say ""hi"""');
  assert.equal(csvCell('normal'), '"normal"');
});

test('matrix export has one column group per question and one row per student', () => {
  const room = freshRoom({ speedBonus: false });
  const a = room.addPlayer({ nickname: 'Ada', socketId: 's1' });
  const b = room.addPlayer({ nickname: 'Ben', socketId: 's2' });

  room.submitAnswer({ player: a, optionId: 'a' }); // correct
  room.submitAnswer({ player: b, skipped: true }); // skipped
  room.finalizeQuestion();

  const analytics = room.buildAnalytics();
  assert.equal(analytics.matrix.questions.length, 4);
  assert.equal(analytics.matrix.rows.length, 2);

  const adaRow = analytics.matrix.rows.find((r) => r.nickname === 'Ada');
  const benRow = analytics.matrix.rows.find((r) => r.nickname === 'Ben');
  assert.equal(adaRow.cells[0].status, 'correct');
  assert.equal(adaRow.cells[0].response, 'A');
  assert.equal(benRow.cells[0].status, 'skipped');
  assert.equal(adaRow.cells[1].status, 'no_answer', 'unplayed questions are marked, not blank');

  const csv = buildMatrixCsv(analytics);
  assert.ok(csv.includes('Q1 result'), 'per-question column group present');
  assert.ok(csv.includes('Per-question summary'));
  assert.ok(csv.includes('Answer breakdown'));
  assert.ok(csv.includes('Ada'));
});

console.log('\nre-marking short answers');

/** A one-question short-answer room with three students already scored. */
function gradedShortRoom(extraSettings = {}) {
  const shortQuiz = normalizeQuiz({
    title: 'Marking',
    questions: [
      { id: 's1', type: 'short', text: 'What does HTTP stand for?', timeLimitSec: 30,
        points: 1000, acceptedAnswers: ['HyperText Transfer Protocol'] },
    ],
  });
  const room = new Room({
    pin: '333333',
    quiz: shortQuiz,
    settings: { speedBonus: false, ...extraSettings },
    hostSocketId: 'h',
  });
  const ada = room.addPlayer({ nickname: 'Ada', socketId: 's1' });
  const ben = room.addPlayer({ nickname: 'Ben', socketId: 's2' });
  const cy = room.addPlayer({ nickname: 'Cy', socketId: 's3' });

  room.phase = PHASE.QUESTION;
  room.currentIndex = 0;
  room.startAt = Date.now();
  room.endAt = room.startAt + 30000;

  room.submitAnswer({ player: ada, text: 'HyperText Transfer Protocol' });
  room.submitAnswer({ player: ben, text: 'hyper text transfer protocol' });
  room.submitAnswer({ player: cy, text: 'Hypertext Transport Protocol' });
  room.finalizeQuestion();
  room.phase = PHASE.ENDED;
  return { room, ada, ben, cy };
}

test('a spelling the teacher did not think of can be accepted afterwards', () => {
  const { room, ada, ben } = gradedShortRoom();
  assert.equal(ada.score > 0, true, 'the exact spelling scored during the game');
  assert.equal(ben.score, 0, 'the spaced-out spelling did not');

  const changed = room.applyRegrades([
    { questionId: 's1', key: 'hyper text transfer protocol', correct: true },
  ]);

  assert.equal(changed, 1, 'one answer re-marked');
  assert.equal(ben.score, ada.score, 'and it now scores exactly what the accepted one did');
  assert.equal(ben.correctCount, 1);
});

test('custom marks override the calculated score', () => {
  const { room, cy } = gradedShortRoom();
  room.applyRegrades([
    { questionId: 's1', key: 'hypertext transport protocol', correct: true, points: 250 },
  ]);
  assert.equal(cy.score, 250, 'half marks, exactly as typed');
});

test('an answer accepted in error can be taken back', () => {
  const { room, ada } = gradedShortRoom();
  room.applyRegrades([
    { questionId: 's1', key: 'hypertext transfer protocol', correct: false },
  ]);
  assert.equal(ada.score, 0);
  assert.equal(ada.correctCount, 0);
});

test('re-marking rebuilds streaks, not just the one score', () => {
  // The reason scores are replayed rather than patched: accepting question 1
  // changes the multiplier that question 2 was scored under.
  const twoShort = normalizeQuiz({
    title: 'Streaks',
    questions: [
      { id: 'a', type: 'short', text: 'One', timeLimitSec: 30, points: 1000, acceptedAnswers: ['one'] },
      { id: 'b', type: 'short', text: 'Two', timeLimitSec: 30, points: 1000, acceptedAnswers: ['two'] },
    ],
  });
  const room = new Room({ pin: '444444', quiz: twoShort, settings: { speedBonus: false }, hostSocketId: 'h' });
  const ada = room.addPlayer({ nickname: 'Ada', socketId: 's1' });

  for (const [i, text] of [[0, 'wun'], [1, 'two']]) {
    room.phase = PHASE.QUESTION;
    room.currentIndex = i;
    room.startAt = Date.now();
    room.endAt = room.startAt + 30000;
    room.submitAnswer({ player: ada, text });
    room.finalizeQuestion();
  }
  room.phase = PHASE.ENDED;

  const withoutStreak = ada.score;
  assert.equal(withoutStreak, 1000, 'only Q2 counted, at 1x');

  room.applyRegrades([{ questionId: 'a', key: 'wun', correct: true }]);

  // Q1 at 1x plus Q2 at 1.25x, because Q1 is now the start of a streak.
  assert.equal(ada.score, 2250);
  assert.equal(ada.bestStreak, 2, 'the streak history is rebuilt too');
});

test('re-marking one answer does not disturb anyone else', () => {
  // The replay recomputes every score from scratch, so it has to land on
  // exactly the numbers the live game produced for everyone it did not touch.
  // Speed bonus on, because that is where a drifting recomputation would show.
  const { room, ada, ben } = gradedShortRoom({ speedBonus: true });
  const adaBefore = ada.score;

  room.applyRegrades([
    { questionId: 's1', key: 'hyper text transfer protocol', correct: true },
  ]);

  assert.equal(ada.score, adaBefore, 'her answer was not part of the correction');
  assert.ok(ben.score > 0, 'and the one that was is now scored');
});

test('re-marking leaves participation counts alone', () => {
  const { room, ben } = gradedShortRoom();
  const answered = ben.answeredCount;
  const time = ben.totalResponseMs;
  room.applyRegrades([{ questionId: 's1', key: 'hyper text transfer protocol', correct: true }]);
  assert.equal(ben.answeredCount, answered, 'they answered it either way');
  assert.equal(ben.totalResponseMs, time, 'and took exactly as long');
});

test('only short-answer questions can be re-marked', () => {
  // Multiple choice has an unambiguous right answer; there is nothing to judge,
  // and a silent override would be a way to fake a leaderboard.
  const room = new Room({ pin: '555555', quiz, settings: {}, hostSocketId: 'h' });
  const ada = room.addPlayer({ nickname: 'Ada', socketId: 's1' });
  room.phase = PHASE.QUESTION;
  room.currentIndex = 0;
  room.startAt = Date.now();
  room.endAt = room.startAt + 20000;
  room.submitAnswer({ player: ada, optionId: 'b' });
  room.finalizeQuestion();
  room.phase = PHASE.ENDED;

  assert.equal(room.applyRegrades([{ questionId: 'q1', key: 'b', correct: true }]), 0);
  assert.equal(ada.score, 0);
});

console.log('\nauto-advance');

test('auto-advance is off unless it is asked for', () => {
  assert.equal(normalizeSettings({}).autoAdvance, false, 'the host still drives by default');
  assert.equal(normalizeSettings({ autoAdvance: true }).autoAdvance, true);
});


console.log('\nediting an open room');

test('a quiz can be rewritten while the room is still in the lobby', () => {
  const room = new Room({ pin: '111111', quiz, settings: {}, hostSocketId: 'h' });
  room.addPlayer({ nickname: 'Ada', socketId: 's1' });

  const replacement = normalizeQuiz({
    title: 'Rewritten',
    questions: [
      { id: 'n1', type: 'truefalse', text: 'Fixed the typo', timeLimitSec: 15, points: 800,
        options: [{ id: 'true', text: 'True', correct: true }, { id: 'false', text: 'False' }] },
    ],
  });

  assert.equal(room.replaceQuiz({ quiz: replacement }), true);
  assert.equal(room.quiz.title, 'Rewritten');
  assert.equal(room.totalQuestions, 1, 'running order follows the new quiz');
  assert.equal(room.answers.length, 1, 'answer slots follow the new quiz');
  assert.equal(room.pin, '111111', 'the PIN survives, so nobody has to rejoin');
  assert.equal(room.players.size, 1, 'and neither does the roster');
});

test('the quiz is frozen once the first question has started', () => {
  // Answers are indexed by question and the order is derived from the quiz, so
  // a swap mid-game would silently rewrite what the class has already played.
  const room = new Room({ pin: '222222', quiz, settings: {}, hostSocketId: 'h' });
  room.addPlayer({ nickname: 'Ada', socketId: 's1' });
  startQuestion({ to: () => ({ emit() {} }), emit() {} }, room, 0);

  const before = room.quiz.title;
  assert.equal(room.replaceQuiz({ quiz: normalizeQuiz({ title: 'Nope', questions: quiz.questions }) }), false);
  assert.equal(room.quiz.title, before, 'the live quiz is untouched');
});


console.log('\nimage headers');

/**
 * Goes over a real socket, because the bug this guards against is invisible to
 * every unit test: the bytes were served perfectly and the store was correct,
 * but helmet's default Cross-Origin-Resource-Policy: same-origin made the
 * browser refuse to paint the image in an <img> on the app's own origin. It
 * still opened fine in a tab - a top-level navigation is not subject to CORP -
 * so it looked like a front-end fault rather than a header.
 */
await asyncTest('an uploaded image may be embedded from the app on another origin', async () => {
  const app = express();
  app.use(helmet()); // exactly as src/index.js does, so the override is proven
  app.use('/api', api);
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;

  try {
    const body = new FormData();
    body.append('file', new Blob([PNG], { type: 'image/png' }), 'a.png');
    const up = await (await fetch(base + '/api/images', { method: 'POST', body })).json();
    assert.ok(up.id, 'upload returned an id');

    const res = await fetch(base + '/api/images/' + up.id);
    assert.equal(res.status, 200);
    assert.equal(
      res.headers.get('cross-origin-resource-policy'),
      'cross-origin',
      'without this the browser refuses to render the image in an <img>'
    );
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('content-type'), 'image/png');
  } finally {
    await new Promise((r) => server.close(r));
  }
});

console.log('\n' + passed + ' checks passed' + (process.exitCode ? ' (with failures above)' : ''));
