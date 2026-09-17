import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Who may open the admin page.
 *
 * A list of Google account emails, from ADMIN_EMAILS if set, otherwise from
 * admins.json at the repository root (or beside this server, for a deploy
 * that copies only server/). Read once at boot: the list changes with a
 * deploy, not at runtime, and a file read on every request is a file that
 * can go missing mid-lesson.
 *
 * Empty means closed. There is no "no list, so everyone" mode: an operations
 * view over every live classroom is not something to leave open because a
 * file was forgotten.
 */
function parseList(raw) {
  return [...new Set(
    String(raw || '')
      .split(/[,\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@'))
  )];
}

function readFile() {
  for (const candidate of [resolve(process.cwd(), '..', 'admins.json'), resolve(process.cwd(), 'admins.json')]) {
    if (!existsSync(candidate)) continue;
    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8'));
      const list = Array.isArray(parsed) ? parsed : parsed?.admins;
      return { emails: parseList((list || []).join(',')), source: candidate };
    } catch (err) {
      console.warn('[admin] could not read ' + candidate + ': ' + err.message);
      return { emails: [], source: candidate };
    }
  }
  return { emails: [], source: null };
}

function load() {
  const env = parseList(process.env.ADMIN_EMAILS);
  if (env.length) return { emails: env, source: 'ADMIN_EMAILS' };
  return readFile();
}

const loaded = load();

export const adminEmails = loaded.emails;
export const adminListSource = loaded.source;

export function isAdminEmail(email) {
  return typeof email === 'string' && adminEmails.includes(email.trim().toLowerCase());
}

/** For tests and diagnostics: the same parsing, on any input. */
export const _parseAdminList = parseList;
