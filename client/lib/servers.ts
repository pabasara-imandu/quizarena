/**
 * The server fleet.
 *
 * A quiz room lives entirely in one server process's memory, so the thing that
 * gets spread across servers is a whole session - never the students inside
 * one. Splitting a single room's players across two instances would put half
 * the class in a room the other half cannot see, because the second server has
 * no such PIN and no way to learn about it.
 *
 * So: each session is placed on the least-loaded healthy server when it is
 * created, and everyone who types that PIN is sent to the same place. Four free
 * instances hold four times as many simultaneous classes, and every class stays
 * whole.
 *
 * There is no coordinator and nothing shared between the servers. Routing rides
 * on the PIN itself - server 0 mints 1xxxxx, server 1 mints 2xxxxx - with a
 * parallel probe as the fallback, so a mis-ordered server list or a server that
 * has been redeployed degrades to "ask everyone" instead of breaking.
 */

export interface ServerHealth {
  url: string;
  /** Position in the configured list, which is what the PIN prefix maps to. */
  index: number;
  online: boolean;
  label?: string;
  /** The index the server reports for itself - a mismatch means a bad list. */
  reportedIndex?: number;
  players?: number;
  rooms?: number;
  sockets?: number;
  softCapacity?: number;
  load?: number;
  rssMb?: number;
  uptimeSec?: number;
  /** Round-trip to /api/health, in ms. Free instances cold-start slowly. */
  pingMs?: number;
  error?: string;
}

const HEALTH_TIMEOUT_MS = 6000;
/** A sleeping free instance can take half a minute to answer its first request. */
const WAKE_TIMEOUT_MS = 45000;

/**
 * Every server this build knows about, in order.
 *
 * `NEXT_PUBLIC_SERVER_URLS` is the fleet (comma separated).
 * `NEXT_PUBLIC_SERVER_URL` stays supported as the single-server case, so an
 * existing one-instance deployment keeps working untouched.
 */
export function serverList(): string[] {
  const many = process.env.NEXT_PUBLIC_SERVER_URLS?.trim();
  if (many) {
    const urls = many
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean);
    if (urls.length) return urls;
  }
  const one = process.env.NEXT_PUBLIC_SERVER_URL?.trim();
  if (one) return [one.replace(/\/+$/, '')];
  if (typeof window !== 'undefined') return [window.location.origin];
  return ['http://localhost:4000'];
}

/** The first server, used before a room is known and for one-server setups. */
export function defaultServer(): string {
  return serverList()[0];
}

async function fetchJson(url: string, timeoutMs: number, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/** Health for one server. Never throws - an unreachable server is a datum. */
export async function probeServer(url: string, index: number, timeoutMs = HEALTH_TIMEOUT_MS): Promise<ServerHealth> {
  const startedAt = Date.now();
  try {
    const { ok, body } = await fetchJson(url + '/api/health', timeoutMs);
    if (!ok) return { url, index, online: false, error: 'HTTP error', pingMs: Date.now() - startedAt };
    return {
      url,
      index,
      online: true,
      label: body.label,
      reportedIndex: body.serverIndex,
      players: body.players,
      rooms: body.rooms,
      sockets: body.sockets,
      softCapacity: body.softCapacity,
      load: body.load,
      rssMb: body.rssMb,
      uptimeSec: body.uptimeSec,
      pingMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      url,
      index,
      online: false,
      pingMs: Date.now() - startedAt,
      error: (err as Error).name === 'AbortError' ? 'No answer in time' : 'Unreachable',
    };
  }
}

/** Health for the whole fleet, in parallel. */
export function probeFleet(timeoutMs = HEALTH_TIMEOUT_MS): Promise<ServerHealth[]> {
  return Promise.all(serverList().map((url, i) => probeServer(url, i, timeoutMs)));
}

/**
 * Where a new room should go: the healthy server carrying the fewest players.
 *
 * Ties break towards the lower index, so a quiet fleet keeps filling server 1
 * and leaves the rest asleep - which on a free tier means fewer cold starts,
 * not wasted capacity.
 */
export async function pickServerForNewRoom(): Promise<{ url: string; fleet: ServerHealth[] }> {
  const fleet = await probeFleet();
  const usable = fleet.filter((s) => s.online);

  if (usable.length === 0) {
    // Everything looks down, which on a free tier usually means asleep rather
    // than broken. Hand back the first server and let the socket wake it.
    return { url: defaultServer(), fleet };
  }

  usable.sort((a, b) => {
    const byLoad = (a.players ?? 0) - (b.players ?? 0);
    return byLoad !== 0 ? byLoad : a.index - b.index;
  });
  return { url: usable[0].url, fleet };
}

export interface PinLookup {
  url: string;
  found: boolean;
  quizTitle?: string;
  phase?: string;
  playerCount?: number;
  acceptingJoins?: boolean;
  requireFullscreen?: boolean;
}

async function askForPin(url: string, pin: string, timeoutMs: number): Promise<PinLookup | null> {
  try {
    const { ok, body } = await fetchJson(url + '/api/rooms/' + encodeURIComponent(pin), timeoutMs);
    if (!ok || !body?.found) return null;
    return { url, found: true, ...body };
  } catch {
    return null;
  }
}

/**
 * Find the server holding a PIN.
 *
 * The prefix says where it should be, so that one is asked first and on its own
 * - one request, no noise, and the answer arrives before the rest of the fleet
 * would have finished waking up. Only if that misses do we fan out, which
 * covers a server list in the wrong order, a PIN minted by an instance that has
 * since been renumbered, and a single-server deployment where prefixes mean
 * nothing.
 */
export async function findServerForPin(
  pin: string,
  { timeoutMs = WAKE_TIMEOUT_MS }: { timeoutMs?: number } = {}
): Promise<PinLookup | null> {
  const urls = serverList();
  if (urls.length === 1) return askForPin(urls[0], pin, timeoutMs);

  const hinted = Number(String(pin).charAt(0)) - 1;
  if (Number.isInteger(hinted) && hinted >= 0 && hinted < urls.length) {
    const direct = await askForPin(urls[hinted], pin, timeoutMs);
    if (direct) return direct;
  }

  const rest = urls.filter((_, i) => i !== hinted);
  const answers = await Promise.all(rest.map((url) => askForPin(url, pin, timeoutMs)));
  return answers.find(Boolean) ?? null;
}
