import { config } from '../config.js';
import { roomStore } from '../state/roomStore.js';
import { PHASE } from '../game/room.js';
import { normalizeQuiz, normalizeSettings, ValidationError } from '../game/quizSchema.js';
import { createBucket, sanitizeNickname } from '../utils/rateLimit.js';
import {
  channels,
  scheduleHostSync,
  emitHostSync,
  clearHostSync,
  clearReactions,
  queueReaction,
  startQuestion,
  openQuestion,
  endQuestion,
  showLeaderboard,
  endGame,
  snapshotFor,
} from '../game/flow.js';

/** The only emoji a student can send. An open string field here would be a
 *  broadcast channel for abuse on a screen pointed at a whole classroom. */
export const ALLOWED_REACTIONS = ['👍', '🔥', '😂', '😮', '🎉', '❤️', '🤔', '😭'];

const ok = (data = {}) => ({ ok: true, ...data });
const fail = (message, code = 'error') => ({ ok: false, code, message });

/** Callback-safety: a client can omit the ack, and we must not throw on it. */
const respond = (cb, payload) => {
  if (typeof cb === 'function') cb(payload);
};

/** Turn an engine rejection reason into something a student can act on. */
function answerError(reason) {
  switch (reason) {
    case 'too_late':
      return 'Time was up before that reached us.';
    case 'already_answered':
      return 'You have already answered this one.';
    case 'empty_answer':
      return 'Type an answer first.';
    case 'skip_disabled':
      return 'Skipping is turned off for this quiz.';
    case 'not_accepting':
      return 'No question is open right now.';
    default:
      return 'Answer not accepted.';
  }
}

export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    // One bucket per socket. Answering is cheap; creating rooms is not.
    const generalBucket = createBucket({ capacity: 30, refillPerSec: 15 });
    const heavyBucket = createBucket({ capacity: 5, refillPerSec: 0.5 });

    /* ------------------------------------------------------------ clock sync */

    /**
     * Round-trip clock sync. The client calls this a few times, keeps the
     * sample with the lowest RTT, and derives `offset = serverTime - clientTime`.
     * Every countdown then runs off corrected server time, so a student who
     * changes their system clock gains nothing.
     */
    socket.on('sync:time', (clientSentAt, cb) => {
      respond(cb, { clientSentAt, serverTime: Date.now() });
    });

    /* ---------------------------------------------------------------- host */

    socket.on('host:create', (payload, cb) => {
      if (!heavyBucket()) return respond(cb, fail('Slow down a moment.', 'rate_limited'));
      try {
        const quiz = normalizeQuiz(payload?.quiz);
        const settings = normalizeSettings(payload?.settings);
        const room = roomStore.create({ quiz, settings, hostSocketId: socket.id });

        socket.join([channels.all(room.pin), channels.host(room.pin)]);
        roomStore.bindSocket(socket.id, { pin: room.pin, role: 'host', playerId: null });

        respond(
          cb,
          ok({
            pin: room.pin,
            hostToken: room.hostToken,
            quiz: room.quiz,
            settings: room.settings,
            state: snapshotFor(room),
          })
        );
      } catch (err) {
        respond(
          cb,
          fail(
            err instanceof ValidationError ? err.message : 'Could not create the room.',
            'invalid_quiz'
          )
        );
      }
    });

    /** Host reconnect: a dropped laptop must not end the lesson. */
    socket.on('host:rejoin', (payload, cb) => {
      const room = roomStore.get(payload?.pin);
      if (!room) return respond(cb, fail('That room is no longer active.', 'no_room'));
      if (room.hostToken !== payload?.hostToken) {
        return respond(cb, fail('Host credentials rejected.', 'forbidden'));
      }

      room.hostSocketId = socket.id;
      socket.join([channels.all(room.pin), channels.host(room.pin)]);
      roomStore.bindSocket(socket.id, { pin: room.pin, role: 'host', playerId: null });

      respond(
        cb,
        ok({
          pin: room.pin,
          quiz: room.quiz,
          settings: room.settings,
          state: snapshotFor(room),
          analytics: room.phase === PHASE.ENDED ? room.buildAnalytics() : null,
        })
      );
      emitHostSync(io, room);
      io.to(channels.players(room.pin)).emit('host:reconnected');
    });

    const withHostRoom = (cb) => {
      const binding = roomStore.bindingFor(socket.id);
      if (!binding || binding.role !== 'host') {
        respond(cb, fail('You are not hosting a room.', 'forbidden'));
        return null;
      }
      const room = roomStore.get(binding.pin);
      if (!room) {
        respond(cb, fail('That room has closed.', 'no_room'));
        return null;
      }
      return room;
    };

    socket.on('host:start', (_payload, cb) => {
      const room = withHostRoom(cb);
      if (!room) return;
      if (room.phase !== PHASE.LOBBY) return respond(cb, fail('The quiz already started.'));
      if (room.players.size === 0) return respond(cb, fail('No one has joined yet.'));
      startQuestion(io, room, 0);
      respond(cb, ok());
    });

    socket.on('host:next', (_payload, cb) => {
      const room = withHostRoom(cb);
      if (!room) return;

      // "Next" means different things depending on where we are, so the host
      // can drive the whole session with a single button.
      if (room.phase === PHASE.LEAD_IN) {
        // Impatient host during the countdown: start the question now rather
        // than closing one nobody has seen.
        openQuestion(io, room);
      } else if (room.phase === PHASE.QUESTION) {
        endQuestion(io, room);
      } else if (room.phase === PHASE.REVEAL && room.settings.showLeaderboardBetweenQuestions) {
        showLeaderboard(io, room);
      } else if (room.phase === PHASE.REVEAL || room.phase === PHASE.LEADERBOARD) {
        if (room.currentIndex >= room.totalQuestions - 1) endGame(io, room);
        else startQuestion(io, room, room.currentIndex + 1);
      } else {
        return respond(cb, fail('Nothing to advance to.'));
      }
      respond(cb, ok({ phase: room.phase }));
    });

    /** Cut the timer short once everyone has answered. */
    socket.on('host:skipTimer', (_payload, cb) => {
      const room = withHostRoom(cb);
      if (!room) return;
      if (room.phase !== PHASE.QUESTION) return respond(cb, fail('No question is running.'));
      endQuestion(io, room);
      respond(cb, ok());
    });

    socket.on('host:end', (_payload, cb) => {
      const room = withHostRoom(cb);
      if (!room) return;
      endGame(io, room);
      respond(cb, ok());
    });

    socket.on('host:kick', (payload, cb) => {
      const room = withHostRoom(cb);
      if (!room) return;
      const player = room.players.get(payload?.playerId);
      if (!player) return respond(cb, fail('No such player.'));
      if (player.socketId) {
        io.to(player.socketId).emit('player:kicked', { reason: payload?.reason || null });
        io.sockets.sockets.get(player.socketId)?.leave(channels.all(room.pin));
        io.sockets.sockets.get(player.socketId)?.leave(channels.players(room.pin));
      }
      room.removePlayer(player.id);
      emitHostSync(io, room);
      respond(cb, ok());
    });

    /** Lift a student out of a "paused - you left fullscreen" state. */
    socket.on('host:clearStrikes', (payload, cb) => {
      const room = withHostRoom(cb);
      if (!room) return;
      const player = room.players.get(payload?.playerId);
      if (!player) return respond(cb, fail('No such player.'));
      player.strikes = 0;
      if (player.socketId) io.to(player.socketId).emit('player:strikesCleared');
      emitHostSync(io, room);
      respond(cb, ok());
    });

    socket.on('host:analytics', (_payload, cb) => {
      const room = withHostRoom(cb);
      if (!room) return;
      respond(cb, ok({ analytics: room.buildAnalytics() }));
    });

    /* ------------------------------------------------------------- students */

    socket.on('player:join', (payload, cb) => {
      if (!generalBucket()) return respond(cb, fail('Slow down a moment.', 'rate_limited'));

      const room = roomStore.get(payload?.pin);
      if (!room) return respond(cb, fail('No room with that PIN.', 'no_room'));
      if (room.phase === PHASE.ENDED) return respond(cb, fail('That quiz has finished.', 'ended'));

      const returning = payload?.playerId && room.players.get(payload.playerId);

      // Reconnecting players are always let back in - only *new* joins are
      // gated by the late-join setting.
      if (!returning) {
        if (room.phase !== PHASE.LOBBY && !room.settings.allowLateJoin) {
          return respond(cb, fail('This quiz is already in progress.', 'in_progress'));
        }
        if (room.players.size >= config.maxPlayersPerRoom) {
          return respond(cb, fail('This room is full.', 'full'));
        }
      }

      // A returning player keeps their name; a new one must pass validation.
      let nickname = returning?.nickname;
      if (!returning) {
        nickname = sanitizeNickname(payload?.nickname, config.maxNicknameLength);
        if (!nickname) return respond(cb, fail('Pick a nickname with at least 2 characters.'));
        const taken = [...room.players.values()].some(
          (p) => p.nickname.toLowerCase() === nickname.toLowerCase()
        );
        if (taken) return respond(cb, fail('That nickname is taken.', 'nickname_taken'));
      } else if (returning.token !== payload?.token) {
        return respond(cb, fail('Session credentials rejected.', 'forbidden'));
      }

      const player = room.addPlayer({
        playerId: returning ? payload.playerId : null,
        nickname,
        socketId: socket.id,
      });

      socket.join([channels.all(room.pin), channels.players(room.pin)]);
      roomStore.bindSocket(socket.id, { pin: room.pin, role: 'player', playerId: player.id });
      room.touch();

      respond(
        cb,
        ok({
          playerId: player.id,
          token: player.token,
          nickname: player.nickname,
          state: snapshotFor(room, player),
        })
      );

      if (!returning) {
        io.to(channels.host(room.pin)).emit('player:joined', {
          id: player.id,
          nickname: player.nickname,
        });
      }
      scheduleHostSync(io, room);
    });

    const withPlayer = (cb) => {
      const binding = roomStore.bindingFor(socket.id);
      if (!binding || binding.role !== 'player') {
        respond(cb, fail('You are not in a room.', 'forbidden'));
        return null;
      }
      const room = roomStore.get(binding.pin);
      const player = room?.players.get(binding.playerId);
      if (!room || !player) {
        respond(cb, fail('Your session expired.', 'no_room'));
        return null;
      }
      return { room, player };
    };

    /**
     * Authoritative state resync. The client calls this on reconnect, and
     * whenever it finds itself in a phase it cannot paint. It is the safety
     * net that makes a missed broadcast recoverable instead of terminal.
     */
    socket.on('player:sync', (_payload, cb) => {
      const ctx = withPlayer(cb);
      if (!ctx) return;
      const { room, player } = ctx;
      player.connected = true;
      player.lastSeenAt = Date.now();
      respond(cb, ok({ state: snapshotFor(room, player) }));
    });

    socket.on('player:answer', (payload, cb) => {
      if (!generalBucket()) return respond(cb, fail('Too many requests.', 'rate_limited'));
      const ctx = withPlayer(cb);
      if (!ctx) return;
      const { room, player } = ctx;

      // A student parked over the strike limit is frozen out until the host
      // clears them. Their answer is refused, not silently dropped.
      if (room.settings.strikeLimit > 0 && player.strikes >= room.settings.strikeLimit) {
        return respond(cb, fail('Paused - ask your teacher to clear your warnings.', 'locked'));
      }

      const result = room.submitAnswer({
        player,
        optionId: payload?.optionId ?? null,
        text: payload?.text,
        // A skip is explicit: either the flag, or a deliberate null optionId
        // with no text alongside it (the "I'm done thinking" button). The
        // text check matters because a short-answer submission legitimately
        // carries a null optionId.
        skipped:
          payload?.skipped === true ||
          (payload?.optionId === null && typeof payload?.text !== 'string'),
      });
      if (!result.ok) return respond(cb, fail(answerError(result.reason), result.reason));

      respond(cb, ok({ receivedAt: Date.now(), skipped: payload?.skipped === true }));
      scheduleHostSync(io, room);

      // Everyone is in: close the question early rather than watching a dead
      // timer tick down in front of the class.
      if (result.answeredCount >= room.connectedCount && room.phase === PHASE.QUESTION) {
        setTimeout(() => {
          if (room.phase === PHASE.QUESTION) endQuestion(io, room);
        }, 400);
      }
    });

    /* ------------------------------------------------------------ reactions */

    // Tighter than the general bucket: reactions are a tap-spam surface, and
    // nobody needs to send more than a couple per second.
    const reactionBucket = createBucket({ capacity: 5, refillPerSec: 2 });

    socket.on('player:reaction', (payload, cb) => {
      const ctx = withPlayer(cb);
      if (!ctx) return;
      const { room } = ctx;

      if (!room.settings.allowReactions) return respond(cb, fail('Reactions are off.', 'disabled'));
      if (!ALLOWED_REACTIONS.includes(payload?.emoji)) {
        return respond(cb, fail('Unknown reaction.', 'bad_emoji'));
      }
      // Silently swallow over-limit taps: a student mashing an emoji should
      // see nothing happen, not an error toast.
      if (!reactionBucket()) return respond(cb, ok({ throttled: true }));

      queueReaction(io, room, payload.emoji);
      respond(cb, ok());
    });

    /* ------------------------------------------------------------ integrity */

    const INTEGRITY_TYPES = new Set([
      'tab_hidden',
      'tab_visible',
      'fullscreen_exit',
      'fullscreen_enter',
      'window_blur',
      'copy_attempt',
      'devtools_suspected',
    ]);

    socket.on('player:integrity', (payload, cb) => {
      if (!generalBucket()) return respond(cb, fail('Too many requests.', 'rate_limited'));
      const ctx = withPlayer(cb);
      if (!ctx) return;
      const { room, player } = ctx;

      const type = payload?.type;
      if (!INTEGRITY_TYPES.has(type)) return respond(cb, fail('Unknown event type.'));

      const entry = room.logIntegrity({ player, type, meta: { hiddenMs: payload?.hiddenMs } });
      io.to(channels.host(room.pin)).emit('integrity:alert', entry);
      scheduleHostSync(io, room);

      respond(
        cb,
        ok({
          strikes: player.strikes,
          strikeLimit: room.settings.strikeLimit,
          locked: room.settings.strikeLimit > 0 && player.strikes >= room.settings.strikeLimit,
        })
      );
    });

    /* --------------------------------------------------------- disconnects */

    socket.on('disconnect', () => {
      const binding = roomStore.unbindSocket(socket.id);
      if (!binding) return;
      const room = roomStore.get(binding.pin);
      if (!room) return;

      if (binding.role === 'host') {
        // Keep the room alive; the host has a token and can rejoin.
        room.hostSocketId = null;
        io.to(channels.players(room.pin)).emit('host:disconnected');
        clearHostSync(room.pin);
        clearReactions(room.pin);
        return;
      }

      const player = room.markDisconnected(socket.id);
      if (player) {
        io.to(channels.host(room.pin)).emit('player:left', {
          id: player.id,
          nickname: player.nickname,
        });
        scheduleHostSync(io, room);
      }
    });
  });
}
