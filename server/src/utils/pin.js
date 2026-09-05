import { config } from '../config.js';

/**
 * 6-digit room PINs, with the first digit naming the server that owns the room.
 *
 * The servers in the fleet share nothing - no database, no Redis, no directory
 * - so the PIN has to carry the routing itself. Server 0 mints 1xxxxx, server 1
 * mints 2xxxxx, and so on, which does two jobs at once: any client can jump
 * straight to the right server from a PIN a student typed off the projector,
 * and two servers can never mint the same PIN and send a class to two rooms.
 *
 * That leaves 100,000 PINs per server, which is five orders of magnitude more
 * than a school will ever have open at once.
 */
export function generatePin(isTaken, serverIndex = config.serverIndex) {
  const prefix = String(Math.min(8, Math.max(0, serverIndex)) + 1);
  for (let attempt = 0; attempt < 50; attempt++) {
    const pin = prefix + String(Math.floor(Math.random() * 100000)).padStart(5, '0');
    if (!isTaken(pin)) return pin;
  }
  throw new Error('Unable to allocate a room PIN - too many active rooms.');
}

/** Which server a PIN belongs to, or null if it is not one of ours. */
export function serverIndexForPin(pin) {
  const first = Number(String(pin ?? '').charAt(0));
  if (!Number.isInteger(first) || first < 1 || first > 9) return null;
  return first - 1;
}
