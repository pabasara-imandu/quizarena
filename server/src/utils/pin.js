/**
 * 6-digit room PINs. We always generate in [100000, 999999] and return a
 * string so a leading digit is never lost to number coercion.
 */
export function generatePin(isTaken) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    if (!isTaken(pin)) return pin;
  }
  throw new Error('Unable to allocate a room PIN - too many active rooms.');
}
