'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { serverList } from '@/lib/servers';
import { TranslationEditor } from '@/components/admin/TranslationEditor';
import { Segmented } from '@/components/ui/Toggle';
import { mountSignInButton, signInConfigured, type HostIdentity } from '@/lib/googleAuth';

const IDENTITY_KEY = 'quizarena.adminIdentity.v1';
const REFRESH_MS = 8000;

/**
 * Local development only. NEXT_PUBLIC_ADMIN_DEV_EMAIL in .env.local lets this
 * page act as that admin without a Google popup; the servers honour it only
 * when their own ADMIN_DEV_BYPASS_EMAIL matches, which no deployment sets.
 */
const DEV_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_DEV_EMAIL ?? '').trim();

interface AdminIdentity {
  credential: string;
  expiresAt: number;
  name: string;
  email: string;
  picture: string | null;
}

function loadAdmin(): AdminIdentity | null {
  try {
    const raw = sessionStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminIdentity;
    if (!parsed?.credential || parsed.expiresAt <= Date.now() + 30_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** The headers every admin request carries: the Google token, or the dev bypass. */
function authHeadersFor(identity: AdminIdentity | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (identity?.credential && identity.credential !== 'dev') headers.Authorization = 'Bearer ' + identity.credential;
  if (DEV_EMAIL) headers['x-dev-admin-email'] = DEV_EMAIL;
  return headers;
}

interface Session {
  pin: string;
  quizTitle: string;
  phase: string;
  questionIndex: number;
  questionCount: number;
  players: number;
  connected: number;
  hostOnline: boolean;
  ageSec: number;
  idleSec: number;
  flagged: number;
}

interface ServerView {
  url: string;
  index: number;
  online: boolean;
  authorised: boolean;
  label?: string;
  reportedIndex?: number;
  pinPrefix?: string;
  softCapacity?: number;
  players?: number;
  rooms?: number;
  sockets?: number;
  rssMb?: number;
  uptimeSec?: number;
  imageMb?: number;
  pingMs?: number;
  sessions: Session[];
  error?: string;
}

const PHASE_TONE: Record<string, string> = {
  lobby: 'bg-slate-500/20 text-slate-300',
  leadIn: 'bg-brand-500/20 text-brand-200',
  question: 'bg-emerald-500/20 text-emerald-300',
  reveal: 'bg-amber-500/20 text-amber-200',
  leaderboard: 'bg-sky-500/20 text-sky-300',
  ended: 'bg-white/10 text-slate-500',
};

function duration(sec?: number) {
  if (sec == null) return '—';
  if (sec < 60) return sec + 's';
  const m = Math.floor(sec / 60);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  return h + 'h ' + (m % 60) + 'm';
}

/**
 * Fleet operations view.
 *
 * The servers share nothing, so there is no central place to ask what is
 * happening - this page is the aggregator. It fans out to every instance in
 * parallel and stitches the answers together, which means it also shows the
 * truth when one of them is down: a missing server is a visible row, not a
 * silently shorter list.
 */
export default function AdminPage() {
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  /** What the site said about this account: checking, admitted, or why not. */
  const [access, setAccess] = useState<{ state: 'idle' | 'checking' | 'ok' | 'denied'; message?: string }>({
    state: 'idle',
  });
  const [tab, setTab] = useState<'fleet' | 'words'>('fleet');
  const [servers, setServers] = useState<ServerView[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [auto, setAuto] = useState(true);
  const identityRef = useRef<AdminIdentity | null>(null);
  identityRef.current = identity;
  const slot = useRef<HTMLDivElement>(null);

  const entered = access.state === 'ok';

  useEffect(() => setIdentity(loadAdmin()), []);

  // Google renders its own button into the slot while nobody is signed in.
  useEffect(() => {
    if (identity || !slot.current || !signInConfigured()) return;
    const el = slot.current;
    el.innerHTML = '';
    mountSignInButton(el, (who: HostIdentity) => {
      const next: AdminIdentity = { ...who };
      try {
        sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(next));
      } catch {
        /* this tab only */
      }
      setIdentity(next);
    }).catch(() => {
      /* offline - the page says so below */
    });
  }, [identity]);

  // Ask the site whether this account is on the list, before showing anything.
  useEffect(() => {
    if (!identity) {
      setAccess({ state: 'idle' });
      return;
    }
    let cancelled = false;
    setAccess({ state: 'checking' });
    fetch('/api/admin/whoami', { headers: authHeadersFor(identity), cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && body.ok) setAccess({ state: 'ok' });
        else setAccess({ state: 'denied', message: body.error || 'Not allowed (HTTP ' + res.status + ').' });
      })
      .catch(() => {
        if (!cancelled) setAccess({ state: 'denied', message: 'Could not reach the site to check your account.' });
      });
    return () => {
      cancelled = true;
    };
  }, [identity]);

  const signOut = () => {
    try {
      sessionStorage.removeItem(IDENTITY_KEY);
    } catch {
      /* nothing to clear */
    }
    setIdentity(null);
    setServers([]);
  };

  const refresh = useCallback(async () => {
    const urls = serverList();
    setLoading(true);
    const views = await Promise.all(
      urls.map(async (url, index): Promise<ServerView> => {
        const startedAt = Date.now();
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 12000);
          const res = await fetch(url + '/api/admin/sessions', {
            headers: authHeadersFor(identityRef.current),
            signal: controller.signal,
            cache: 'no-store',
          });
          clearTimeout(timer);
          const body = await res.json().catch(() => ({}));

          if (!res.ok) {
            return {
              url,
              index,
              online: true,
              authorised: false,
              sessions: [],
              pingMs: Date.now() - startedAt,
              error: body.error || 'Rejected (HTTP ' + res.status + ')',
            };
          }
          return {
            url,
            index,
            online: true,
            authorised: true,
            label: body.label,
            reportedIndex: body.serverIndex,
            pinPrefix: body.pinPrefix,
            softCapacity: body.softCapacity,
            players: body.players,
            rooms: body.rooms,
            sockets: body.sockets,
            rssMb: body.rssMb,
            uptimeSec: body.uptimeSec,
            imageMb: body.imageMb,
            pingMs: Date.now() - startedAt,
            sessions: body.sessions ?? [],
          };
        } catch (err) {
          return {
            url,
            index,
            online: false,
            authorised: false,
            sessions: [],
            pingMs: Date.now() - startedAt,
            error:
              (err as Error).name === 'AbortError'
                ? 'No answer in 12s — asleep or down'
                : 'Unreachable',
          };
        }
      })
    );
    setServers(views);
    setLastAt(Date.now());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!entered || tab !== 'fleet') return;
    refresh();
    if (!auto) return;
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [entered, tab, auto, refresh]);

  if (!entered) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-16">
        <div className="surface p-6">
          <h1 className="font-display text-2xl font-bold">Admin</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            The fleet view and the translation editor. Sign in with a Google account that is on the
            admin list (<code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">admins.json</code>).
          </p>

          {!identity && (
            <div className="mt-5 flex flex-col items-center gap-3">
              {signInConfigured() ? (
                <div ref={slot} className="gsi-slot min-h-[40px]" aria-label="Sign in with Google" />
              ) : (
                <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-200">
                  This build has no Google client id, so nobody can sign in here.
                </p>
              )}
              {DEV_EMAIL && (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() =>
                    setIdentity({
                      credential: 'dev',
                      expiresAt: Date.now() + 12 * 3600_000,
                      name: 'Dev admin',
                      email: DEV_EMAIL,
                      picture: null,
                    })
                  }
                >
                  Continue as {DEV_EMAIL} (local dev)
                </button>
              )}
            </div>
          )}

          {identity && access.state === 'checking' && (
            <p className="mt-5 text-center text-sm text-slate-400">Checking {identity.email}…</p>
          )}

          {identity && access.state === 'denied' && (
            <div className="mt-5">
              <p
                role="alert"
                className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200"
              >
                {access.message}
              </p>
              <button type="button" className="btn-secondary mt-3 w-full" onClick={signOut}>
                Try another account
              </button>
            </div>
          )}

          <Link href="/" className="mt-4 block text-center text-xs text-slate-600 hover:text-slate-400">
            Back to QuizArena
          </Link>
        </div>
      </main>
    );
  }

  const online = servers.filter((s) => s.authorised);
  const totals = {
    players: online.reduce((n, s) => n + (s.players ?? 0), 0),
    rooms: online.reduce((n, s) => n + (s.rooms ?? 0), 0),
    capacity: online.reduce((n, s) => n + (s.softCapacity ?? 0), 0),
    live: online.reduce(
      (n, s) => n + s.sessions.filter((x) => x.phase !== 'lobby' && x.phase !== 'ended').length,
      0
    ),
  };
  const misordered = online.filter((s) => s.reportedIndex != null && s.reportedIndex !== s.index);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/" className="font-display text-lg font-extrabold tracking-tight">
          Quiz<span className="text-brand-400">Arena</span>
        </Link>
        <span className="chip-neutral text-[10px] uppercase tracking-[0.14em]">Admin</span>

        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {tab === 'fleet' && (
            <>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={auto}
                  onChange={(e) => setAuto(e.target.checked)}
                  className="accent-brand-500"
                />
                auto-refresh
              </label>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={refresh}
                disabled={loading}
              >
                {loading ? 'Checking…' : 'Refresh'}
              </button>
            </>
          )}
          <span className="hidden max-w-[12rem] truncate text-slate-400 sm:inline" title={identity?.email}>
            {identity?.name}
          </span>
          <button
            type="button"
            className="text-slate-600 transition hover:text-rose-300"
            onClick={signOut}
          >
            sign out
          </button>
        </div>
      </header>

      <div className="mb-5 max-w-sm">
        <Segmented
          value={tab}
          onChange={setTab}
          ariaLabel="Admin section"
          options={[
            { value: 'fleet', label: 'Fleet' },
            { value: 'words', label: 'Translations' },
          ]}
        />
      </div>

      {tab === 'words' && <TranslationEditor authHeaders={() => authHeadersFor(identityRef.current)} />}

      {tab === 'fleet' && (
      <>

      {misordered.length > 0 && (
        <div
          role="alert"
          className="surface mb-5 border-amber-400/25 bg-amber-500/[0.08] p-4 text-sm text-amber-200"
        >
          <b>Server list is out of order.</b>{' '}
          {misordered
            .map((s) => s.label + ' is position ' + (s.index + 1) + ' but calls itself ' + ((s.reportedIndex ?? 0) + 1))
            .join('; ')}
          . Joining still works — the fleet falls back to asking every server — but PINs will not
          route straight to the right one. Fix the order in{' '}
          <code className="rounded bg-black/30 px-1 py-0.5 text-xs">NEXT_PUBLIC_SERVER_URLS</code>{' '}
          or the <code className="rounded bg-black/30 px-1 py-0.5 text-xs">SERVER_INDEX</code> on
          each server.
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Servers up" value={online.length + ' / ' + servers.length} />
        <Stat label="Students online" value={String(totals.players)} />
        <Stat label="Quizzes running" value={String(totals.live)} />
        <Stat
          label="Fleet capacity"
          value={totals.capacity ? Math.round((totals.players / totals.capacity) * 100) + '%' : '—'}
          hint={totals.capacity ? totals.players + ' of ~' + totals.capacity : undefined}
        />
      </div>

      <div className="space-y-4">
        {servers.map((s) => (
          <ServerCard key={s.url} server={s} />
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-slate-600">
        {lastAt ? 'Updated ' + new Date(lastAt).toLocaleTimeString() : 'Never updated'} · a room
        lives entirely on one server, so every student of a session is on the same instance as
        their host.
      </p>
      </>
      )}
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="surface px-4 py-3 text-center">
      <p className="font-display text-2xl font-bold nums">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
      {hint && <p className="text-[11px] text-slate-600 nums">{hint}</p>}
    </div>
  );
}

function ServerCard({ server }: { server: ServerView }) {
  const load =
    server.softCapacity && server.players != null
      ? Math.min(1, server.players / server.softCapacity)
      : 0;

  return (
    <section className="surface overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-4 py-3">
        <span
          className={
            'h-2.5 w-2.5 shrink-0 rounded-full ' +
            (server.authorised ? 'bg-emerald-400' : server.online ? 'bg-amber-400' : 'bg-rose-400')
          }
          aria-hidden
        />
        <div className="min-w-0">
          <p className="font-display font-bold">
            {server.label || 'Server ' + (server.index + 1)}
            {server.pinPrefix && (
              <span className="ml-2 text-xs font-medium text-slate-500">
                PINs {server.pinPrefix}xxxxx
              </span>
            )}
          </p>
          <p className="truncate text-[11px] text-slate-600">{server.url}</p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 nums">
          {server.authorised ? (
            <>
              <span>
                <b className="text-slate-300">{server.players ?? 0}</b> students
              </span>
              <span>
                <b className="text-slate-300">{server.rooms ?? 0}</b> rooms
              </span>
              <span>{server.rssMb}MB</span>
              <span>up {duration(server.uptimeSec)}</span>
              <span>{server.pingMs}ms</span>
            </>
          ) : (
            <span className="text-amber-300">{server.error}</span>
          )}
        </div>
      </div>

      {server.authorised && (
        <>
          <div className="px-4 pt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className={
                  'h-full rounded-full transition-all duration-500 ' +
                  (load > 0.9
                    ? 'bg-rose-400'
                    : load > 0.65
                      ? 'bg-amber-400'
                      : 'bg-gradient-to-r from-brand-500 to-emerald-400')
                }
                style={{ width: Math.max(2, load * 100) + '%' }}
              />
            </div>
          </div>

          {server.sessions.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-600">No sessions on this server.</p>
          ) : (
            <ul className="divide-y divide-white/[0.05] px-2 py-1">
              {server.sessions.map((s) => (
                <li key={s.pin} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2.5">
                  <span className="font-display text-sm font-bold tracking-[0.12em] nums text-brand-300">
                    {s.pin}
                  </span>
                  <span className="min-w-0 flex-1 basis-40 truncate text-sm">{s.quizTitle}</span>

                  <span
                    className={
                      'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ' +
                      (PHASE_TONE[s.phase] ?? 'bg-white/10 text-slate-400')
                    }
                  >
                    {s.phase}
                  </span>

                  {s.questionCount > 0 && s.questionIndex >= 0 && (
                    <span className="shrink-0 text-xs text-slate-500 nums">
                      Q{s.questionIndex + 1}/{s.questionCount}
                    </span>
                  )}

                  <span className="shrink-0 text-xs text-slate-400 nums">
                    {s.connected}
                    <span className="text-slate-600">/{s.players}</span> in
                  </span>

                  {s.flagged > 0 && (
                    <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200 nums">
                      {s.flagged} flagged
                    </span>
                  )}
                  {!s.hostOnline && (
                    <span className="shrink-0 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-200">
                      host offline
                    </span>
                  )}

                  <span className="shrink-0 text-[11px] text-slate-600 nums">
                    {duration(s.ageSec)} old
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
