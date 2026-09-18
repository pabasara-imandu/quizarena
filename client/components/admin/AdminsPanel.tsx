'use client';

import { useCallback, useEffect, useState } from 'react';
import { ROLE_LABEL } from '@/lib/adminRoles';

interface NormalAdmin {
  email: string;
  addedBy: string;
  addedAt: number;
}

interface Listing {
  superAdmins: string[];
  normalAdmins: NormalAdmin[];
  store?: string;
}

/**
 * Who the admins are - the super admins as fixed facts from admins.json, the
 * normal admins as a list a super admin can grow and prune. Removing takes
 * effect on the next request the removed account makes to the site; a quiz
 * server keeps honouring a pass it already saw until that pass expires.
 */
export function AdminsPanel({
  authHeaders,
  canEdit,
  self,
}: {
  authHeaders: () => Record<string, string>;
  canEdit: boolean;
  self: string;
}) {
  const [data, setData] = useState<Listing | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/admins', { headers: authHeaders(), cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ tone: 'error', text: body.error || 'Could not load the admin list.' });
        return;
      }
      setData(body);
    } catch {
      setNotice({ tone: 'error', text: 'Could not reach the site.' });
    }
  }, [authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const change = async (method: 'POST' | 'DELETE', target: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/admins', {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ email: target }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ tone: 'error', text: body.error || 'That did not work (HTTP ' + res.status + ').' });
        return;
      }
      setData(body);
      setEmail('');
      setNotice({
        tone: 'ok',
        text: method === 'POST' ? target + ' is now a ' + ROLE_LABEL.normal + '.' : target + ' is no longer an admin.',
      });
    } catch {
      setNotice({ tone: 'error', text: 'Could not reach the site.' });
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const target = email.trim().toLowerCase();
    if (!target || busy) return;
    void change('POST', target);
  };

  const remove = (target: string) => {
    if (busy) return;
    if (!window.confirm('Remove ' + target + ' as ' + ROLE_LABEL.normal + '?')) return;
    void change('DELETE', target);
  };

  return (
    <div className="space-y-4">
      <section className="surface p-5">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-lg font-bold">{ROLE_LABEL.super}</h2>
          <span className="text-xs text-slate-500">from admins.json - changed only there</span>
        </div>
        <ul className="mt-3 divide-y divide-white/[0.05]">
          {(data?.superAdmins ?? []).map((e) => (
            <li key={e} className="flex items-center gap-3 py-2 text-sm">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-500/25 text-[11px] font-bold text-brand-200">
                {e.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate">{e}</span>
              {e === self && <span className="text-[11px] text-brand-300">you</span>}
            </li>
          ))}
          {data && data.superAdmins.length === 0 && (
            <li className="py-2 text-sm text-slate-500">None configured.</li>
          )}
        </ul>
      </section>

      <section className="surface p-5">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-lg font-bold">{ROLE_LABEL.normal}</h2>
          <span className="text-xs text-slate-500">
            can watch the fleet and edit translations
            {data?.store && data.store !== 'netlify-blobs' ? ' · stored in ' + data.store + ' (local)' : ''}
          </span>
        </div>

        {!data ? (
          <p className="py-6 text-center text-sm text-slate-500">Loading…</p>
        ) : data.normalAdmins.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-600">Nobody yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/[0.05]">
            {data.normalAdmins.map((a) => (
              <li key={a.email} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/[0.07] text-[11px] font-bold text-slate-300">
                  {a.email.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 basis-40 truncate">
                  {a.email}
                  {a.email === self && <span className="ml-2 text-[11px] text-brand-300">you</span>}
                </span>
                <span className="shrink-0 text-[11px] text-slate-600">
                  {a.addedAt ? 'added ' + new Date(a.addedAt).toLocaleDateString() : ''}
                  {a.addedBy ? ' by ' + a.addedBy : ''}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    className="shrink-0 rounded px-2 py-1 text-[11px] text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-300"
                    onClick={() => remove(a.email)}
                    disabled={busy}
                  >
                    remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <form
            className="mt-4 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <input
              type="email"
              className="field min-w-0 flex-1 basis-56 py-2 text-sm"
              placeholder="name@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
            <button type="submit" className="btn-primary shrink-0" disabled={busy || !email.trim()}>
              {busy ? 'Saving…' : 'Add ' + ROLE_LABEL.normal}
            </button>
          </form>
        )}

        {notice && (
          <p className={'mt-3 text-sm ' + (notice.tone === 'ok' ? 'text-emerald-300' : 'text-rose-300')}>
            {notice.text}
          </p>
        )}
      </section>
    </div>
  );
}
