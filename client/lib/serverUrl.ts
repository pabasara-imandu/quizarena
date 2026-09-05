import { defaultServer } from '@/lib/servers';

/**
 * Any server in the fleet will do.
 *
 * Use this only for stateless work - the sample quiz, spreadsheet import, AI
 * generation, the CSV template, image uploads. Every instance answers those
 * identically, so there is nothing to route.
 *
 * Anything tied to a *room* must not come through here. A room lives in one
 * server's memory, so joining it, hosting it or exporting its results has to
 * go to that instance: see `findServerForPin` and `useSocket().serverUrl`.
 */
export function serverUrl(): string {
  return defaultServer();
}
