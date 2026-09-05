import { config } from '../config.js';
import { generatePin } from '../utils/pin.js';
import { Room, PHASE } from '../game/room.js';

/**
 * In-memory room registry.
 *
 * Live quiz state is intentionally ephemeral: a session lasts minutes, and
 * keeping it in process memory is what makes sub-millisecond answer handling
 * possible. Persist *results* (see buildAnalytics) if you need history - do
 * not put the hot loop behind a database.
 *
 * To run more than one server process, pin a room to a node (sticky sessions
 * on the PIN) and use the Redis adapter for cross-node fan-out.
 */
class RoomStore {
  constructor() {
    /** @type {Map<string, Room>} pin -> Room */
    this.rooms = new Map();
    /** @type {Map<string, {pin: string, playerId: string|null, role: string}>} */
    this.sockets = new Map();

    this.gcTimer = setInterval(() => this.collectGarbage(), 60_000);
    this.gcTimer.unref?.();
  }

  create({ quiz, settings, hostSocketId }) {
    const pin = generatePin((p) => this.rooms.has(p));
    const room = new Room({ pin, quiz, settings, hostSocketId });
    this.rooms.set(pin, room);
    return room;
  }

  get(pin) {
    return this.rooms.get(String(pin));
  }

  destroy(pin) {
    const room = this.rooms.get(pin);
    if (room?.timer) clearTimeout(room.timer);
    return this.rooms.delete(pin);
  }

  bindSocket(socketId, binding) {
    this.sockets.set(socketId, binding);
  }

  bindingFor(socketId) {
    return this.sockets.get(socketId);
  }

  unbindSocket(socketId) {
    const binding = this.sockets.get(socketId);
    this.sockets.delete(socketId);
    return binding;
  }

  get stats() {
    let players = 0;
    for (const room of this.rooms.values()) players += room.players.size;
    return { rooms: this.rooms.size, players, sockets: this.sockets.size };
  }

  collectGarbage() {
    const cutoff = Date.now() - config.roomTtlMs;
    for (const [pin, room] of this.rooms) {
      const idle = room.lastActivityAt < cutoff;

      /**
       * A finished room is a class's results, not litter.
       *
       * The abandoned sweep exists for rooms nobody ever used - a PIN opened by
       * mistake, a lobby closed before anyone joined. It used to catch ended
       * rooms too, and that lost a real school's marks: once the students shut
       * their tabs and the teacher's socket dropped for a moment - a sleeping
       * laptop, a backgrounded tab, one flaky minute of Wi-Fi - the room was
       * "abandoned", and five minutes later the results were deleted while the
       * teacher was still reading them on screen.
       *
       * Finished rooms now keep the full room lifetime, connected or not.
       */
      const holdsResults = room.phase === PHASE.ENDED;
      const abandoned = !holdsResults && !room.hostSocketId && room.connectedCount === 0;

      if (idle || (abandoned && room.lastActivityAt < Date.now() - 5 * 60_000)) {
        if (room.timer) clearTimeout(room.timer);
        this.rooms.delete(pin);
      }
    }
  }
}

export const roomStore = new RoomStore();
