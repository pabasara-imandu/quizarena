import { config } from '../config.js';
import { PHASE } from './room.js';
import { rankPlayers } from './scoring.js';

/**
 * Room channel naming. Players and the host live in separate Socket.IO rooms
 * so a host-only frame (live answer counts, integrity alerts, correct answers)
 * is never serialised out to 100 student sockets.
 */
export const channels = {
  all: (pin) => 'room:' + pin,
  players: (pin) => 'room:' + pin + ':players',
  host: (pin) => 'room:' + pin + ':host',
};

/**
 * Emit to one player's socket.
 *
 * Deliberately NOT gated on `player.connected`. The server only learns about a
 * disconnect after a ping timeout, so there is a window - and on a
 * backgrounded phone it can be a long one - where the server believes a player
 * is gone while their browser is perfectly happy. Skipping those sockets used
 * to drop that student out of the game permanently: no further questions, no
 * reveals, a frozen screen with no error. Emitting to a genuinely dead socket
 * id is a cheap no-op, so we always emit and let the client's own reconnect
 * and resync handle the real disconnections.
 */
export function emitToPlayer(io, player, event, payload) {
  if (!player.socketId) return;
  io.to(player.socketId).emit(event, payload);
}

/* -------------------------------------------------------------------------- */
/* Throttled host updates                                                     */
/* -------------------------------------------------------------------------- */

const pendingFlush = new Map(); // pin -> timeout

/**
 * Coalesce host-facing updates. When 100 students answer within the same
 * second we want ~4 frames on the host socket, not 100. The throttle is
 * leading-edge (host sees the first answer instantly) with a trailing flush.
 */
export function scheduleHostSync(io, room, intervalMs = 250) {
  if (pendingFlush.has(room.pin)) return;
  const timeout = setTimeout(() => {
    pendingFlush.delete(room.pin);
    if (room.dirty) emitHostSync(io, room);
  }, intervalMs);
  timeout.unref?.();
  pendingFlush.set(room.pin, timeout);
  emitHostSync(io, room);
}

/**
 * Above this many players, the mid-game roster is trimmed. Below it, sending
 * everyone costs nothing and keeps the payload simple.
 */
const FULL_ROSTER_LIMIT = 60;
const LEADERBOARD_ROWS = 15;

export function emitHostSync(io, room) {
  room.dirty = false;
  const bucket = room.currentAnswers;
  const all = [...room.players.values()];

  const shape = (p) => ({
    id: p.id,
    nickname: p.nickname,
    score: p.score,
    streak: p.streak,
    connected: p.connected,
    strikes: p.strikes,
    tabSwitches: p.tabSwitches,
    fullscreenExits: p.fullscreenExits,
    answered: bucket ? bucket.has(p.id) : false,
  });

  /**
   * The lobby genuinely needs every name - that list is the whole screen. Once
   * the quiz is running the host only ever renders the leaderboard's top rows
   * and anyone flagged, so shipping all 300 player objects four times a second
   * was pure waste: at 300 players that is the single largest recurring cost in
   * the room, and it grows with class size while nothing on screen does.
   */
  let players;
  if (room.phase === PHASE.LOBBY || all.length <= FULL_ROSTER_LIMIT) {
    players = all.map(shape);
  } else {
    const keep = new Map();
    for (const p of rankPlayers(all).slice(0, LEADERBOARD_ROWS)) keep.set(p.id, p);
    // Anyone with an integrity flag is always included - the host acts on those.
    for (const p of all) if (p.strikes > 0 || p.tabSwitches > 0) keep.set(p.id, p);
    players = [...keep.values()].map(shape);
  }

  io.to(channels.host(room.pin)).emit('host:sync', {
    phase: room.phase,
    playerCount: room.players.size,
    connectedCount: room.connectedCount,
    answeredCount: bucket ? bucket.size : 0,
    players,
    // Tells the host UI that `players` is a summary, not the whole room.
    rosterTruncated: players.length < all.length,
  });
}

export function clearHostSync(pin) {
  const t = pendingFlush.get(pin);
  if (t) clearTimeout(t);
  pendingFlush.delete(pin);
}

/* -------------------------------------------------------------------------- */
/* Phase transitions                                                          */
/* -------------------------------------------------------------------------- */

function armTimer(room, fn, delayMs) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = setTimeout(fn, Math.max(0, delayMs));
  room.timer.unref?.();
}

/**
 * How long an unattended room holds each between-questions screen.
 *
 * Long enough to read the answer and find your name on the board, short enough
 * that a class of thirty is not left staring at a static screen. The host can
 * always cut ahead - auto-advance removes the obligation to click, not the
 * ability to.
 */
export const AUTO_REVEAL_MS = 5000;
export const AUTO_LEADERBOARD_MS = 5000;

/**
 * Drive the room forward without the host.
 *
 * Deliberately reuses `room.timer`: the question clock and the auto-advance
 * clock are never armed at the same time, and sharing the slot means a host
 * who does click Next cancels the pending hop for free rather than racing it.
 */
function scheduleAutoAdvance(io, room, delayMs) {
  if (!room.settings.autoAdvance) return;
  const from = room.phase;
  armTimer(
    room,
    () => {
      // The host may have moved on, or ended the quiz, while this was pending.
      if (room.phase !== from) return;
      if (room.phase === PHASE.REVEAL && room.settings.showLeaderboardBetweenQuestions) {
        showLeaderboard(io, room);
      } else if (room.phase === PHASE.REVEAL || room.phase === PHASE.LEADERBOARD) {
        if (room.currentIndex >= room.totalQuestions - 1) endGame(io, room);
        else startQuestion(io, room, room.currentIndex + 1);
      }
    },
    delayMs
  );
}

/**
 * Advance to question `index`. Emits a short lead-in ("Question 3 of 10 -
 * get ready") so late frames and slow phones have time to paint before the
 * clock actually starts.
 */
export function startQuestion(io, room, index) {
  if (index >= room.totalQuestions) return endGame(io, room);

  room.currentIndex = index;
  room.phase = PHASE.LEAD_IN;
  room.touch();

  const leadIn = config.questionLeadInMs;
  const now = Date.now();
  room.leadInEndsAt = now + leadIn;
  room.startAt = room.leadInEndsAt;
  room.endAt = room.startAt + room.currentQuestion.timeLimitSec * 1000;

  // Everyone gets the lead-in with absolute server timestamps; each client
  // subtracts its own measured clock offset and counts down locally.
  // The lead-in carries the upcoming question's identity so both views can
  // clear the *previous* question immediately. Without this the host sat on
  // the old question text and a stale "answers in" count for three seconds.
  io.to(channels.all(room.pin)).emit('game:leadIn', {
    index,
    total: room.totalQuestions,
    questionId: room.currentQuestion.id,
    startAt: room.startAt,
    serverNow: now,
  });

  armTimer(room, () => openQuestion(io, room), leadIn);
}

/**
 * Open the question the lead-in was counting into.
 *
 * Exported so a host who hits "next" during the countdown cuts it short and
 * starts the question, rather than closing one nobody has seen yet - which
 * used to score every player as "no answer" and break their streaks over a
 * question that was never on screen.
 */
export function openQuestion(io, room) {
  if (room.phase !== PHASE.LEAD_IN) return;
  if (room.timer) clearTimeout(room.timer);

  room.phase = PHASE.QUESTION;
  const openedAt = Date.now();

  // If the host skipped the countdown, the clock starts now - otherwise a
  // student would lose the seconds that were still on the lead-in.
  if (openedAt < room.startAt) {
    room.startAt = openedAt;
    room.endAt = openedAt + room.currentQuestion.timeLimitSec * 1000;
  }

  // Host frame carries the correct answers; player frames do not.
  io.to(channels.host(room.pin)).emit('game:question', {
    question: room.questionForHost(),
    startAt: room.startAt,
    endAt: room.endAt,
    serverNow: openedAt,
  });

  // Per-player emit: each student gets their own scrambled option order.
  for (const player of room.players.values()) {
    emitToPlayer(io, player, 'game:question', {
      question: room.questionForPlayer(player),
      startAt: room.startAt,
      endAt: room.endAt,
      serverNow: openedAt,
    });
  }

  emitHostSync(io, room);
  armTimer(room, () => endQuestion(io, room), room.endAt - Date.now() + config.answerGraceMs);
}

/** Close the current question, score it, and push per-player feedback. */
export function endQuestion(io, room) {
  if (room.phase !== PHASE.QUESTION) return;
  if (room.timer) clearTimeout(room.timer);

  room.phase = PHASE.REVEAL;
  room.touch();

  const finalized = room.finalizeQuestion();
  if (!finalized) return endGame(io, room);

  const { results, hostSummary } = finalized;
  const board = room.leaderboard(10);

  io.to(channels.host(room.pin)).emit('game:reveal', {
    ...hostSummary,
    leaderboard: board,
    isLastQuestion: room.currentIndex >= room.totalQuestions - 1,
    autoAdvanceAt: room.settings.autoAdvance ? Date.now() + AUTO_REVEAL_MS : null,
  });

  for (const player of room.players.values()) {
    emitToPlayer(io, player, 'game:reveal', {
      index: room.currentIndex,
      questionType: hostSummary.type,
      correctOptionIds: hostSummary.correctOptionIds,
      acceptedAnswers: hostSummary.acceptedAnswers,
      you: results.get(player.id) ?? null,
      topThree: board.top.slice(0, 3),
      autoAdvanceAt: room.settings.autoAdvance ? Date.now() + AUTO_REVEAL_MS : null,
    });
  }

  emitHostSync(io, room);
  scheduleAutoAdvance(io, room, AUTO_REVEAL_MS);
}

export function showLeaderboard(io, room) {
  room.phase = PHASE.LEADERBOARD;
  room.touch();
  const board = room.leaderboard(10);

  io.to(channels.host(room.pin)).emit('game:leaderboard', {
    ...board,
    index: room.currentIndex,
    isLastQuestion: room.currentIndex >= room.totalQuestions - 1,
    autoAdvanceAt: room.settings.autoAdvance ? Date.now() + AUTO_LEADERBOARD_MS : null,
  });

  for (const player of room.players.values()) {
    const me = room.rankOf(player.id);
    emitToPlayer(io, player, 'game:leaderboard', {
      top: board.top,
      you: me ? { ...me, score: player.score, nickname: player.nickname } : null,
      autoAdvanceAt: room.settings.autoAdvance ? Date.now() + AUTO_LEADERBOARD_MS : null,
    });
  }

  scheduleAutoAdvance(io, room, AUTO_LEADERBOARD_MS);
}

export function endGame(io, room) {
  if (room.timer) clearTimeout(room.timer);
  room.phase = PHASE.ENDED;
  room.touch();

  const analytics = room.buildAnalytics();
  io.to(channels.host(room.pin)).emit('game:over', analytics);

  for (const player of room.players.values()) {
    emitToPlayer(io, player, 'game:over', {
      podium: analytics.podium,
      you: analytics.players.find((p) => p.id === player.id) || null,
      questionCount: analytics.questionCount,
    });
  }
  clearHostSync(room.pin);
  clearReactions(room.pin);
}

/* -------------------------------------------------------------------------- */
/* Live reactions                                                             */
/* -------------------------------------------------------------------------- */

const reactionBuffers = new Map(); // pin -> { counts: Map<emoji, n>, timer }

/**
 * Emoji reactions are pure spectacle, so they get the cheapest possible
 * transport: buffer for 400ms and send the host one frame with counts. Thirty
 * students hammering the same emoji costs one small message, not thirty - and
 * the host renders `n` floaters from a single count.
 */
export function queueReaction(io, room, emoji) {
  let buffer = reactionBuffers.get(room.pin);
  if (!buffer) {
    buffer = { counts: new Map(), timer: null };
    reactionBuffers.set(room.pin, buffer);
  }
  buffer.counts.set(emoji, (buffer.counts.get(emoji) || 0) + 1);

  if (buffer.timer) return;
  buffer.timer = setTimeout(() => {
    const payload = [...buffer.counts.entries()].map(([e, count]) => ({ emoji: e, count }));
    buffer.counts.clear();
    buffer.timer = null;
    if (payload.length) io.to(channels.host(room.pin)).emit('reaction:burst', { reactions: payload });
  }, 400);
  buffer.timer.unref?.();
}

export function clearReactions(pin) {
  const buffer = reactionBuffers.get(pin);
  if (buffer?.timer) clearTimeout(buffer.timer);
  reactionBuffers.delete(pin);
}

/**
 * Everything a client needs to render the right screen after a reconnect,
 * without replaying the events it missed.
 */
export function snapshotFor(room, player = null) {
  const base = {
    pin: room.pin,
    phase: room.phase,
    quizTitle: room.quiz.title,
    index: room.currentIndex,
    total: room.totalQuestions,
    startAt: room.startAt,
    endAt: room.endAt,
    serverNow: Date.now(),
    settings: room.settings,
  };

  if (!player) return { ...base, question: room.questionForHost() };

  // A student rejoining (or arriving late) during a reveal or leaderboard used
  // to get phase-without-payload and render a blank screen that looked frozen.
  // The snapshot now carries whatever that phase needs to paint something.
  const record = room.currentAnswers?.get(player.id) ?? null;
  const showQuestion = room.phase === PHASE.QUESTION || room.phase === PHASE.REVEAL;
  const q = room.currentQuestion;

  return {
    ...base,
    question: showQuestion ? room.questionForPlayer(player) : null,
    reveal:
      room.phase === PHASE.REVEAL && q
        ? {
            correctOptionIds: q.options.filter((o) => o.correct).map((o) => o.id),
            acceptedAnswers: q.type === 'short' ? q.acceptedAnswers : null,
          }
        : null,
    leaderboard: room.phase === PHASE.LEADERBOARD ? room.leaderboard(10) : null,
    you: {
      id: player.id,
      nickname: player.nickname,
      score: player.score,
      streak: player.streak,
      strikes: player.strikes,
      answered: !!record,
      answeredOptionId: record?.optionId ?? null,
      submittedText: record?.text ?? null,
      skipped: !!record?.skipped,
      rank: room.rankOf(player.id),
    },
  };
}
