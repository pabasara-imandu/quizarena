import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { seededShuffle } from '../utils/rng.js';
import { computeScore, rankPlayers, streakMultiplier } from './scoring.js';
import { groupShortAnswers, matchesShortAnswer, normalizeAnswer } from './answerMatch.js';
import { TYPED_TYPES } from './quizSchema.js';

export const PHASE = {
  LOBBY: 'lobby',
  LEAD_IN: 'leadIn',
  QUESTION: 'question',
  REVEAL: 'reveal',
  LEADERBOARD: 'leaderboard',
  ENDED: 'ended',
};

/**
 * A single live session.
 *
 * Design notes for scale (100+ concurrent players in one room):
 *  - The server is the only clock. It stamps `startAt`/`endAt` in server time
 *    and clients render the countdown locally, so there are NO per-second
 *    timer broadcasts. One question = one broadcast, not thirty.
 *  - Per-player state lives in a Map keyed by a stable `playerId`, so a phone
 *    that drops Wi-Fi reconnects into the same score and streak.
 *  - Host-facing aggregates (live answer counts, leaderboard) are recomputed
 *    lazily and flushed on a throttle by the socket layer, so 100 answers
 *    landing in the same second produce a handful of frames, not 100.
 */
export class Room {
  constructor({ pin, quiz, settings, hostSocketId, host = null, maxPlayers = null }) {
    this.pin = pin;
    /**
     * Who is hosting, if they signed in. Students never have one of these.
     * Only the verified claims are kept - never the token they came from.
     */
    this.host = host && host.verified
      ? { verified: true, sub: host.sub, name: host.name, email: host.email, picture: host.picture }
      : { verified: false };
    /** Fixed at creation: signing in mid-lesson does not enlarge a room. */
    this.maxPlayers = maxPlayers ?? config.maxPlayersPerRoom;
    this.id = randomUUID();
    this.hostToken = randomUUID();
    this.hostSocketId = hostSocketId;
    this.quiz = quiz;
    this.settings = {
      shuffleAnswers: true,
      shuffleQuestions: false,
      speedBonus: true,
      requireFullscreen: true,
      allowLateJoin: false,
      showLeaderboardBetweenQuestions: true,
      autoAdvance: false,
      allowSkip: true,
      allowReactions: true,
      strikeLimit: 3,
      ...settings,
    };

    this.phase = PHASE.LOBBY;
    this.currentIndex = -1;
    this.startAt = null;
    this.endAt = null;
    this.leadInEndsAt = null;

    /** @type {Map<string, object>} */
    this.players = new Map();
    /** answers[originalQuestionIndex] = Map<playerId, AnswerRecord> */
    this.answers = this.quiz.questions.map(() => new Map());
    /** Chronological integrity log surfaced on the host dashboard. */
    this.integrityLog = [];

    this.order = this.settings.shuffleQuestions
      ? seededShuffle(
          this.quiz.questions.map((_, i) => i),
          this.id + ':questions'
        )
      : this.quiz.questions.map((_, i) => i);

    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();
    this.timer = null;
    this.dirty = false; // set when host-facing aggregates need a flush
  }

  touch() {
    this.lastActivityAt = Date.now();
  }

  /**
   * Swap in a rewritten quiz while the room is still in the lobby.
   *
   * Lobby-only, and not out of caution: answers are indexed by question and
   * the running order is derived from the quiz, so changing either after the
   * first question would silently rewrite what has already been played.
   *
   * The PIN, the host token and everyone already in the room all survive -
   * the point of editing here is to fix a typo without sending thirty
   * students to a new PIN.
   */
  replaceQuiz({ quiz, settings }) {
    if (this.phase !== PHASE.LOBBY) return false;

    this.quiz = quiz;
    if (settings) this.settings = { ...this.settings, ...settings };

    // Both are shaped by the quiz, so both are rebuilt rather than patched.
    this.answers = this.quiz.questions.map(() => new Map());
    this.order = this.settings.shuffleQuestions
      ? seededShuffle(
          this.quiz.questions.map((_, i) => i),
          this.id + ':questions'
        )
      : this.quiz.questions.map((_, i) => i);

    this.touch();
    this.dirty = true;
    return true;
  }

  get totalQuestions() {
    return this.order.length;
  }

  get currentQuestion() {
    if (this.currentIndex < 0 || this.currentIndex >= this.order.length) return null;
    return this.quiz.questions[this.order[this.currentIndex]];
  }

  get currentAnswers() {
    if (this.currentIndex < 0) return null;
    return this.answers[this.order[this.currentIndex]];
  }

  // ---------------------------------------------------------------- players

  addPlayer({ playerId, nickname, socketId }) {
    const existing = playerId && this.players.get(playerId);
    if (existing) {
      existing.socketId = socketId;
      existing.connected = true;
      existing.lastSeenAt = Date.now();
      this.dirty = true;
      return existing;
    }

    const id = randomUUID();
    const player = {
      id,
      nickname,
      socketId,
      connected: true,
      score: 0,
      streak: 0,
      bestStreak: 0,
      correctCount: 0,
      totalResponseMs: 0,
      answeredCount: 0,
      skippedCount: 0,
      strikes: 0,
      tabSwitches: 0,
      fullscreenExits: 0,
      joinedAt: Date.now(),
      lastSeenAt: Date.now(),
      token: randomUUID(),
    };
    this.players.set(id, player);
    this.dirty = true;
    return player;
  }

  markDisconnected(socketId) {
    for (const player of this.players.values()) {
      if (player.socketId === socketId) {
        player.connected = false;
        player.lastSeenAt = Date.now();
        this.dirty = true;
        return player;
      }
    }
    return null;
  }

  removePlayer(playerId) {
    const removed = this.players.delete(playerId);
    if (removed) this.dirty = true;
    return removed;
  }

  get connectedCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.connected) n++;
    return n;
  }

  // -------------------------------------------------------------- questions

  /**
   * The question as one specific player should see it: answer order scrambled
   * with a seed derived from their id, and the `correct` flags stripped.
   */
  questionForPlayer(player) {
    const q = this.currentQuestion;
    if (!q) return null;

    // Typed answers have no options to scramble, and no options to leak.
    let options = q.options.map((o) => ({ id: o.id, text: o.text, image: o.image }));

    // Ordering is ALWAYS scrambled, whatever the room setting says - the
    // displayed order would otherwise be the answer. Polls keep their order,
    // because "strongly agree ... strongly disagree" only makes sense in
    // sequence. Everything else follows the setting.
    const scramble =
      q.type === 'ordering' ||
      (options.length > 0 && this.settings.shuffleAnswers && q.type !== 'truefalse' && q.type !== 'poll');
    if (scramble) options = seededShuffle(options, player.id + ':' + q.id);

    return {
      id: q.id,
      index: this.currentIndex,
      total: this.totalQuestions,
      text: q.text,
      type: q.type,
      image: q.image,
      points: q.points,
      timeLimitMs: q.timeLimitSec * 1000,
      options,
      unit: q.type === 'numeric' ? q.unit : undefined,
      // Never the accepted answers, the numeric answer, the tolerance, the
      // canonical order or the explanation - each would be one devtools
      // panel away from every student.
    };
  }

  /** The host sees the canonical order plus the correct answers. */
  questionForHost() {
    const q = this.currentQuestion;
    if (!q) return null;
    return {
      id: q.id,
      index: this.currentIndex,
      total: this.totalQuestions,
      text: q.text,
      type: q.type,
      image: q.image,
      points: q.points,
      timeLimitMs: q.timeLimitSec * 1000,
      options: q.options.map((o) => ({
        id: o.id,
        text: o.text,
        image: o.image,
        correct: !!o.correct,
      })),
      acceptedAnswers: q.type === 'short' ? q.acceptedAnswers : undefined,
      caseSensitive: q.type === 'short' ? q.caseSensitive : undefined,
      answer: q.type === 'numeric' ? q.answer : undefined,
      tolerance: q.type === 'numeric' ? q.tolerance : undefined,
      unit: q.type === 'numeric' ? q.unit : undefined,
      explanation: q.explanation,
    };
  }

  // ---------------------------------------------------------------- answers

  /**
   * Record an answer. The *outcome* is deliberately not returned to the
   * player here - they learn it at reveal time, so the ack cannot be used to
   * brute-force the right option.
   */
  submitAnswer({ player, optionId, optionIds, order, text, skipped = false, now = Date.now() }) {
    const q = this.currentQuestion;
    if (!q || this.phase !== PHASE.QUESTION) return { ok: false, reason: 'not_accepting' };
    if (now > this.endAt + config.answerGraceMs) return { ok: false, reason: 'too_late' };

    const bucket = this.currentAnswers;
    if (bucket.has(player.id)) return { ok: false, reason: 'already_answered' };

    const elapsedMs = Math.max(0, Math.min(now - this.startAt, q.timeLimitSec * 1000));
    const record = {
      elapsedMs,
      at: now,
      skipped: false,
      correct: false,
      optionId: null,
      optionIds: null,
      order: null,
      text: null,
      // A poll answer is neither right nor wrong. Scoring and streaks leave
      // it alone; it only counts as "answered".
      neutral: q.type === 'poll',
    };

    if (skipped) {
      // A skip is a real, recorded decision: it never scores, but it counts as
      // "done thinking" so the room can move on without waiting out the clock.
      if (!this.settings.allowSkip) return { ok: false, reason: 'skip_disabled' };
      record.skipped = true;
    } else if (q.type === 'short') {
      const cleaned = typeof text === 'string' ? text.trim().slice(0, 120) : '';
      if (!cleaned) return { ok: false, reason: 'empty_answer' };
      record.text = cleaned;
      record.correct = matchesShortAnswer(cleaned, q.acceptedAnswers, {
        caseSensitive: q.caseSensitive,
      });
    } else if (q.type === 'numeric') {
      const cleaned = typeof text === 'string' ? text.trim().slice(0, 40) : '';
      // Accept "1,5" and "1 500" the way a student who learned decimals with a
      // comma, or thousands with a space, would type them.
      const value = Number(cleaned.replace(/\s+/g, '').replace(',', '.'));
      if (!cleaned || !Number.isFinite(value)) return { ok: false, reason: 'empty_answer' };
      record.text = cleaned;
      record.value = value;
      record.correct = Math.abs(value - q.answer) <= q.tolerance + 1e-9;
    } else if (q.type === 'multiselect') {
      const chosen = Array.isArray(optionIds) ? [...new Set(optionIds.map(String))] : [];
      const valid = chosen.filter((id) => q.options.some((o) => o.id === id));
      if (valid.length === 0) return { ok: false, reason: 'bad_option' };
      record.optionIds = valid;
      // All or nothing: exactly the right set, no extras, nothing missing.
      const want = new Set(q.options.filter((o) => o.correct).map((o) => o.id));
      record.correct = valid.length === want.size && valid.every((id) => want.has(id));
    } else if (q.type === 'ordering') {
      const given = Array.isArray(order) ? order.map(String) : [];
      const ids = q.options.map((o) => o.id);
      const complete = given.length === ids.length && ids.every((id) => given.includes(id));
      if (!complete) return { ok: false, reason: 'bad_option' };
      record.order = given;
      record.correct = given.every((id, i) => id === ids[i]);
    } else if (q.type === 'poll') {
      const chosen = q.options.find((o) => o.id === optionId);
      if (!chosen) return { ok: false, reason: 'bad_option' };
      record.optionId = optionId;
      record.correct = false;
    } else {
      const chosen = q.options.find((o) => o.id === optionId);
      if (!chosen) return { ok: false, reason: 'bad_option' };
      record.optionId = optionId;
      record.correct = !!chosen.correct;
    }

    bucket.set(player.id, record);
    this.dirty = true;
    this.touch();

    return { ok: true, answeredCount: bucket.size };
  }

  /** Called once when a question closes: turns raw answers into score deltas. */
  finalizeQuestion() {
    const q = this.currentQuestion;
    if (!q) return null;
    const bucket = this.currentAnswers;
    const timeLimitMs = q.timeLimitSec * 1000;

    /** @type {Map<string, object>} playerId -> per-player result payload */
    const results = new Map();
    const distribution = Object.fromEntries(q.options.map((o) => [o.id, 0]));

    for (const player of this.players.values()) {
      const record = bucket.get(player.id);

      if (!record) {
        const hadStreak = player.streak;
        player.streak = 0;
        results.set(player.id, {
          answered: false,
          skipped: false,
          correct: false,
          pointsEarned: 0,
          streak: 0,
          multiplier: 1,
          streakBroken: hadStreak > 1,
          score: player.score,
        });
        continue;
      }

      if (record.optionId) distribution[record.optionId] = (distribution[record.optionId] || 0) + 1;
      // Multi-select counts every tile picked, so the host sees how often each
      // one was chosen rather than how often each exact combination was.
      for (const id of record.optionIds ?? []) distribution[id] = (distribution[id] || 0) + 1;
      player.answeredCount++;
      player.totalResponseMs += record.elapsedMs;
      if (record.skipped) player.skippedCount++;

      const hadStreak = player.streak;
      if (record.neutral) {
        // A poll: nothing moves. Not the streak, not the score.
      } else if (record.correct) {
        player.streak++;
        player.bestStreak = Math.max(player.bestStreak, player.streak);
        player.correctCount++;
      } else {
        player.streak = 0;
      }

      const { points, basePoints, speedComponent, multiplier, multiplierBonus } = record.neutral
        ? { points: 0, basePoints: 0, speedComponent: 0, multiplier: 1, multiplierBonus: 0 }
        : computeScore({
            base: q.points,
            correct: record.correct,
            elapsedMs: record.elapsedMs,
            timeLimitMs,
            streak: player.streak,
            speedBonusEnabled: this.settings.speedBonus,
          });

      player.score += points;
      record.points = points;

      results.set(player.id, {
        answered: true,
        skipped: record.skipped,
        correct: record.correct,
        neutral: !!record.neutral,
        chosenOptionId: record.optionId,
        chosenOptionIds: record.optionIds,
        submittedOrder: record.order,
        submittedText: record.text,
        pointsEarned: points,
        basePoints,
        speedComponent,
        multiplier,
        multiplierBonus,
        streak: player.streak,
        streakBroken: !record.neutral && hadStreak > 1 && player.streak === 0,
        nextMultiplier: streakMultiplier(player.streak + 1),
        score: player.score,
        elapsedMs: record.elapsedMs,
      });
    }

    const ranked = rankPlayers([...this.players.values()]);
    ranked.forEach((p, i) => {
      const r = results.get(p.id);
      if (r) {
        r.rank = i + 1;
        r.totalPlayers = ranked.length;
      }
    });

    const answeredTotal = bucket.size;
    const answerRecords = [...bucket.values()];
    const correctTotal = answerRecords.filter((a) => a.correct).length;
    const skippedTotal = answerRecords.filter((a) => a.skipped).length;

    return {
      results,
      hostSummary: {
        questionId: q.id,
        index: this.currentIndex,
        type: q.type,
        neutral: q.type === 'poll',
        // For ordering this is the canonical sequence, in order.
        correctOptionIds:
          q.type === 'ordering'
            ? q.options.map((o) => o.id)
            : q.options.filter((o) => o.correct).map((o) => o.id),
        acceptedAnswers: q.type === 'short' ? q.acceptedAnswers : null,
        answer: q.type === 'numeric' ? q.answer : null,
        tolerance: q.type === 'numeric' ? q.tolerance : null,
        unit: q.type === 'numeric' ? q.unit : null,
        explanation: q.explanation,
        distribution,
        textResponses: groupTyped(q, answerRecords)?.slice(0, 12) ?? null,
        answeredTotal,
        correctTotal,
        skippedTotal,
        playerCount: this.players.size,
        accuracy: answeredTotal ? correctTotal / answeredTotal : 0,
        averageResponseMs: answeredTotal
          ? Math.round(answerRecords.reduce((s, a) => s + a.elapsedMs, 0) / answeredTotal)
          : null,
      },
    };
  }

  // -------------------------------------------------------------- regrading

  /**
   * Re-mark free-text answers after the quiz, and rebuild every score.
   *
   * A short-answer question is graded against the list the teacher wrote
   * beforehand, which is a guess at every spelling thirty students might use.
   * "H.T.T.P.", "hyper text transfer protocol", a right answer in the wrong
   * language - all marked wrong by a list that was never going to be complete.
   * This is the teacher's override.
   *
   * Changes are keyed by the same normalised bucket the host is looking at, so
   * accepting a spelling accepts it for everyone who wrote it, in one action.
   */
  applyRegrades(changes) {
    let touched = 0;

    for (const change of Array.isArray(changes) ? changes : []) {
      const originalIndex = this.quiz.questions.findIndex((q) => q.id === change?.questionId);
      const q = this.quiz.questions[originalIndex];
      // Only typed answers can be re-marked. A tile is unambiguous; there is
      // nothing to judge, and an override would just be a way to fake a board.
      if (!q || !TYPED_TYPES.includes(q.type)) continue;

      const bucket = this.answers[originalIndex];
      const correct = !!change.correct;
      // A blank marks field means "score it the way the game would have":
      // full speed and streak maths, as if it had been accepted at the time.
      const custom =
        change.points === null || change.points === undefined || change.points === ''
          ? null
          : clampPoints(change.points);

      for (const record of bucket.values()) {
        if (record.skipped || typeof record.text !== 'string') continue;
        if (normalizeAnswer(record.text, { caseSensitive: q.caseSensitive }) !== change.key) {
          continue;
        }
        record.correct = correct;
        record.overridePoints = correct ? custom : null;
        record.regraded = true;
        touched++;
      }
    }

    if (touched) this.recomputeScores();
    return touched;
  }

  /**
   * Replay every question in running order and rebuild scores from the answer
   * records.
   *
   * A full replay rather than a delta, because streaks are sequential: accepting
   * question 3 for a student can change the multiplier on questions 4 and 5.
   * Patching one score in isolation would leave a leaderboard that does not add
   * up. Participation counts (how many they answered, how long they took) are
   * left alone - regrading changes marks, not what happened.
   */
  recomputeScores() {
    for (const player of this.players.values()) {
      player.score = 0;
      player.streak = 0;
      player.bestStreak = 0;
      player.correctCount = 0;
    }

    for (const originalIndex of this.order) {
      const q = this.quiz.questions[originalIndex];
      const bucket = this.answers[originalIndex];
      const timeLimitMs = q.timeLimitSec * 1000;

      for (const player of this.players.values()) {
        const record = bucket.get(player.id);
        if (!record) {
          player.streak = 0;
          continue;
        }

        if (record.correct) {
          player.streak++;
          player.bestStreak = Math.max(player.bestStreak, player.streak);
          player.correctCount++;
        } else {
          player.streak = 0;
        }

        const scored = computeScore({
          base: q.points,
          correct: record.correct,
          elapsedMs: record.elapsedMs,
          timeLimitMs,
          streak: player.streak,
          speedBonusEnabled: this.settings.speedBonus,
        });

        const awarded =
          record.correct && record.overridePoints != null ? record.overridePoints : scored.points;
        record.points = awarded;
        player.score += awarded;
      }
    }

    this.dirty = true;
    this.touch();
  }

  // ------------------------------------------------------------ leaderboard

  leaderboard(limit = 10) {
    const ranked = rankPlayers([...this.players.values()]);
    return {
      top: ranked.slice(0, limit).map((p, i) => ({
        rank: i + 1,
        id: p.id,
        nickname: p.nickname,
        score: p.score,
        streak: p.streak,
        connected: p.connected,
      })),
      totalPlayers: ranked.length,
    };
  }

  rankOf(playerId) {
    const ranked = rankPlayers([...this.players.values()]);
    const i = ranked.findIndex((p) => p.id === playerId);
    return i === -1 ? null : { rank: i + 1, totalPlayers: ranked.length };
  }

  // -------------------------------------------------------------- integrity

  logIntegrity({ player, type, meta = {} }) {
    const entry = {
      id: randomUUID(),
      playerId: player.id,
      nickname: player.nickname,
      type,
      meta,
      questionIndex: this.currentIndex,
      at: Date.now(),
    };

    if (type === 'tab_hidden') player.tabSwitches++;
    if (type === 'fullscreen_exit') player.fullscreenExits++;
    if (type === 'tab_hidden' || type === 'fullscreen_exit') {
      // Only penalise during a live question. Leaving the tab while sitting in
      // the lobby or reading the leaderboard is not cheating, it is being human.
      if (this.phase === PHASE.QUESTION) player.strikes++;
    }
    entry.strikes = player.strikes;

    this.integrityLog.push(entry);
    if (this.integrityLog.length > 1000) this.integrityLog.shift();
    this.dirty = true;
    return entry;
  }

  // -------------------------------------------------------------- analytics

  buildAnalytics() {
    const perQuestion = this.order.map((originalIndex, position) => {
      const q = this.quiz.questions[originalIndex];
      const bucket = this.answers[originalIndex];
      const records = [...bucket.values()];
      const answered = records.length;
      const correct = records.filter((r) => r.correct).length;
      const distribution = Object.fromEntries(q.options.map((o) => [o.id, 0]));
      for (const r of records) {
        if (r.optionId) distribution[r.optionId] = (distribution[r.optionId] || 0) + 1;
        for (const id of r.optionIds ?? []) distribution[id] = (distribution[id] || 0) + 1;
      }

      return {
        position,
        questionId: q.id,
        text: q.text,
        type: q.type,
        image: q.image,
        points: q.points,
        timeLimitSec: q.timeLimitSec,
        options: q.options.map((o) => ({
          id: o.id,
          text: o.text,
          image: o.image,
          correct: !!o.correct,
          count: distribution[o.id] || 0,
        })),
        acceptedAnswers: q.type === 'short' ? q.acceptedAnswers : null,
        answer: q.type === 'numeric' ? q.answer : null,
        tolerance: q.type === 'numeric' ? q.tolerance : null,
        unit: q.type === 'numeric' ? q.unit : null,
        explanation: q.explanation,
        neutral: q.type === 'poll',
        correctOrder: q.type === 'ordering' ? q.options.map((o) => o.id) : null,
        textResponses: groupTyped(q, records)?.map((g) => ({
          ...g,
          regraded: records.some(
            (r) =>
              r.regraded &&
              r.text != null &&
              normalizeAnswer(r.text, { caseSensitive: q.caseSensitive }) === g.key
          ),
        })) ?? null,
        answered,
        skipped: records.filter((r) => r.skipped).length,
        unanswered: Math.max(0, this.players.size - answered),
        correct,
        accuracy: answered ? correct / answered : 0,
        averageResponseMs: answered
          ? Math.round(records.reduce((s, r) => s + r.elapsedMs, 0) / answered)
          : null,
      };
    });

    const ranked = rankPlayers([...this.players.values()]);
    const attempted = perQuestion.filter((q) => q.answered > 0 && !q.neutral);

    return {
      quizTitle: this.quiz.title,
      pin: this.pin,
      finishedAt: Date.now(),
      playerCount: this.players.size,
      questionCount: perQuestion.length,
      overallAccuracy: attempted.length
        ? attempted.reduce((s, q) => s + q.accuracy, 0) / attempted.length
        : 0,
      averageScore: ranked.length
        ? Math.round(ranked.reduce((s, p) => s + p.score, 0) / ranked.length)
        : 0,
      hardestQuestions: [...attempted].sort((a, b) => a.accuracy - b.accuracy).slice(0, 3),
      easiestQuestions: [...attempted].sort((a, b) => b.accuracy - a.accuracy).slice(0, 3),
      perQuestion,
      podium: ranked.slice(0, 3).map((p, i) => ({
        rank: i + 1,
        nickname: p.nickname,
        score: p.score,
      })),
      players: ranked.map((p, i) => ({
        rank: i + 1,
        id: p.id,
        nickname: p.nickname,
        score: p.score,
        correctCount: p.correctCount,
        answeredCount: p.answeredCount,
        skippedCount: p.skippedCount,
        accuracy: p.answeredCount ? p.correctCount / p.answeredCount : 0,
        bestStreak: p.bestStreak,
        averageResponseMs: p.answeredCount ? Math.round(p.totalResponseMs / p.answeredCount) : null,
        strikes: p.strikes,
        tabSwitches: p.tabSwitches,
        fullscreenExits: p.fullscreenExits,
      })),
      matrix: this.buildMatrix(ranked),
      integrityLog: this.integrityLog.slice(-200),
    };
  }

  /**
   * Student-by-question grid backing the deep CSV export. One cell per
   * (student, question) so a teacher can scan a row to see one child's
   * pattern, or a column to see where the class fell over.
   */
  buildMatrix(ranked = rankPlayers([...this.players.values()])) {
    const questions = this.order.map((originalIndex, position) => {
      const q = this.quiz.questions[originalIndex];
      return {
        position,
        originalIndex,
        questionId: q.id,
        text: q.text,
        type: q.type,
        points: q.points,
      };
    });

    const rows = ranked.map((player, i) => ({
      rank: i + 1,
      playerId: player.id,
      nickname: player.nickname,
      score: player.score,
      cells: questions.map(({ originalIndex }) => {
        const record = this.answers[originalIndex].get(player.id);
        if (!record) {
          return { status: 'no_answer', points: 0, responseMs: null, response: null };
        }
        const q = this.quiz.questions[originalIndex];
        const label = (id) => q.options.find((o) => o.id === id)?.text ?? id;
        const response = record.skipped
          ? null
          : record.text != null
            ? record.text
            : record.order
              ? record.order.map(label).join(' \u2192 ')
              : record.optionIds
                ? record.optionIds.map(label).join(', ')
                : record.optionId
                  ? label(record.optionId)
                  : null;
        if (record.neutral) {
          return { status: 'answered', points: 0, responseMs: record.elapsedMs, response };
        }
        return {
          status: record.skipped ? 'skipped' : record.correct ? 'correct' : 'incorrect',
          points: record.points ?? 0,
          responseMs: record.elapsedMs,
          response,
        };
      }),
    }));

    return { questions, rows };
  }
}

/**
 * Group the answers to a question that has no tiles to count.
 *
 * Short and numeric answers group by their normalised text, so "Paris" and
 * "paris" are one row; ordering answers group by the exact sequence given, so
 * the host can see that eleven students swapped the same two steps. Tile
 * questions return null - their distribution lives on the tiles.
 */
function groupTyped(q, records) {
  if (q.type === 'short' || q.type === 'numeric') {
    return groupShortAnswers(records, { caseSensitive: !!q.caseSensitive });
  }
  if (q.type !== 'ordering') return null;

  const label = (id) => q.options.find((o) => o.id === id)?.text ?? id;
  const buckets = new Map();
  for (const r of records) {
    if (r.skipped || !r.order) continue;
    const key = r.order.join('|');
    const existing = buckets.get(key);
    if (existing) existing.count++;
    else buckets.set(key, { key, display: r.order.map(label).join(' → '), count: 1, correct: !!r.correct });
  }
  return [...buckets.values()].sort((a, b) => b.count - a.count);
}

/** Marks a teacher can type by hand. Wide, but not a score-injection vector. */
function clampPoints(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(100000, Math.max(0, n));
}
