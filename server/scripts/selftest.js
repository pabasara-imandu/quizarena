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
import { csvCell } from '../src/game/exportCsv.js';

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

console.log('\n' + passed + ' checks passed' + (process.exitCode ? ' (with failures above)' : ''));
