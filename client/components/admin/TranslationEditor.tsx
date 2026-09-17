'use client';

import { useEffect, useMemo, useState } from 'react';
import { en, type MessageKey } from '@/lib/i18n/en';
import { builtInDictionary, LANGUAGES, useLanguage, type Lang } from '@/lib/i18n';
import {
  diffOverrides,
  isOverrideLang,
  overrideProblem,
  type OverrideLang,
  type Overrides,
} from '@/lib/i18n/overrides';
import { downloadText } from '@/lib/exportCsv';

/** Readable names for the key prefixes, in the order they appear in en.ts. */
const SECTIONS: [string, string][] = [
  ['lang.', 'Shared'],
  ['ui.', 'Shared'],
  ['format.', 'Shared'],
  ['home.', 'Home page'],
  ['join.', 'Student · joining'],
  ['lobby.', 'Student · waiting room'],
  ['quiz.', 'Student · in the quiz'],
  ['result.', 'Student · reveal'],
  ['reveal.', 'Student · reveal'],
  ['fs.', 'Student · overlays and notices'],
  ['locked.', 'Student · overlays and notices'],
  ['notice.', 'Student · overlays and notices'],
  ['final.', 'Student · the end'],
  ['order.', 'Answering controls'],
  ['short.', 'Answering controls'],
  ['grid.', 'Answering controls'],
  ['streak.', 'Answering controls'],
  ['leaderboard.', 'Answering controls'],
  ['emoji.', 'Answering controls'],
  ['countdown.', 'Answering controls'],
  ['err.', 'Messages from the server'],
  ['type.', 'Question types'],
  ['rail.type.', 'Question types'],
  ['host.', 'Host · header'],
  ['identity.', 'Host · header'],
  ['creator.', 'Host · quiz creator'],
  ['age.', 'Host · quiz creator'],
  ['rail.', 'Host · question rail'],
  ['editor.', 'Host · question editor'],
  ['img.', 'Host · image picker'],
  ['settings.', 'Host · room settings'],
  ['sf.', 'Host · import and generate'],
  ['hl.', 'Host · lobby'],
  ['live.', 'Host · live screen'],
  ['integ.', 'Host · live screen'],
  ['an.', 'Host · results'],
  ['mx.', 'Host · results'],
  ['st.', 'Host · results'],
  ['rm.', 'Host · re-mark'],
  ['past.', 'Host · past results'],
];

function sectionOf(key: string) {
  return SECTIONS.find(([prefix]) => key.startsWith(prefix))?.[1] ?? 'Other';
}

const ALL_KEYS = Object.keys(en) as MessageKey[];

/**
 * Every word in a language, editable.
 *
 * Three layers show through one box: the English, the shipped translation,
 * and any edit already saved. Typing stages a change; nothing leaves the page
 * until Save, and Save refuses while any box has a problem - a translation
 * missing its {placeholder} would show a student a hole where their score
 * goes, so it cannot be stored at all.
 */
export function TranslationEditor({
  authHeaders,
}: {
  authHeaders: () => Record<string, string>;
}) {
  const { reloadOverrides } = useLanguage();
  const editable = LANGUAGES.filter((l) => l.code !== 'en' && isOverrideLang(l.code));
  const [lang, setLang] = useState<OverrideLang>(
    (editable[0]?.code as OverrideLang | undefined) ?? 'si'
  );
  const builtIn = builtInDictionary(lang as Lang);

  const [saved, setSaved] = useState<Overrides>({});
  const [meta, setMeta] = useState<{ updatedAt: number | null; updatedBy: string | null; store: string } | null>(null);
  const [draft, setDraft] = useState<Partial<Record<MessageKey, string>>>({});
  const [query, setQuery] = useState('');
  const [onlyEdited, setOnlyEdited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  // Load what is saved for this language.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDraft({});
    setNotice(null);
    fetch('/api/i18n/' + lang, { cache: 'no-store' })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        setSaved(body.overrides ?? {});
        setMeta({ updatedAt: body.updatedAt ?? null, updatedBy: body.updatedBy ?? null, store: body.store ?? '?' });
      })
      .catch(() => {
        if (!cancelled) setNotice({ tone: 'error', text: 'Could not load the saved edits. The built-in text is shown.' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  /** What a key currently says, after every layer. */
  const valueOf = (key: MessageKey) => draft[key] ?? saved[key] ?? builtIn[key] ?? '';

  const problems = useMemo(() => {
    const out: Partial<Record<MessageKey, string>> = {};
    for (const key of Object.keys(draft) as MessageKey[]) {
      const value = draft[key] ?? '';
      // An emptied box means "back to the shipped text", which is never a problem.
      if (!value.trim()) continue;
      const problem = overrideProblem(key, value);
      if (problem) out[key] = problem;
    }
    return out;
  }, [draft]);

  const dirty = (Object.keys(draft) as MessageKey[]).filter((k) => (draft[k] ?? '') !== (saved[k] ?? builtIn[k] ?? ''));
  const problemCount = Object.keys(problems).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALL_KEYS.filter((key) => {
      if (onlyEdited && !(key in saved) && !(key in draft)) return false;
      if (!q) return true;
      return (
        key.toLowerCase().includes(q) ||
        en[key].toLowerCase().includes(q) ||
        valueOf(key).toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, onlyEdited, saved, draft, builtIn]);

  const save = async () => {
    if (problemCount > 0 || busy) return;
    setBusy(true);
    setNotice(null);
    // Everything that differs from the shipped text, edits and earlier saves alike.
    const merged: Overrides = { ...saved };
    for (const key of Object.keys(draft) as MessageKey[]) {
      const value = (draft[key] ?? '').trim();
      if (value) merged[key] = value;
      else delete merged[key];
    }
    const overrides = diffOverrides(builtIn, merged);
    try {
      const res = await fetch('/api/i18n/' + lang, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ overrides }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = body.problems
          ? ' ' + Object.entries(body.problems).map(([k, v]) => k + ': ' + v).join('; ')
          : '';
        setNotice({ tone: 'error', text: (body.error || 'Save failed (HTTP ' + res.status + ').') + detail });
        return;
      }
      setSaved(body.overrides ?? overrides);
      setMeta({ updatedAt: body.updatedAt ?? Date.now(), updatedBy: body.updatedBy ?? null, store: body.store ?? '?' });
      setDraft({});
      setNotice({
        tone: 'ok',
        text: 'Saved. This page uses it now; every other phone and laptop within a minute.',
      });
      void reloadOverrides();
    } catch {
      setNotice({ tone: 'error', text: 'Could not reach the site to save. Check the connection and try again.' });
    } finally {
      setBusy(false);
    }
  };

  const exportJson = () => {
    const merged: Overrides = { ...saved };
    for (const key of Object.keys(draft) as MessageKey[]) {
      const value = (draft[key] ?? '').trim();
      if (value) merged[key] = value;
      else delete merged[key];
    }
    downloadText(
      'quizarena-' + lang + '-edits.json',
      JSON.stringify(diffOverrides(builtIn, merged), null, 2),
      'application/json'
    );
  };

  let lastSection = '';

  return (
    <div className="space-y-4 pb-24">
      <div className="surface flex flex-wrap items-center gap-3 p-4">
        <label className="flex items-center gap-2 text-sm text-slate-400">
          Language
          <select
            className="select-pill"
            value={lang}
            onChange={(e) => setLang(e.target.value as OverrideLang)}
            aria-label="Language to edit"
          >
            {editable.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <input
          className="field min-w-0 flex-1 basis-56 py-2 text-sm"
          placeholder="Search a word, in English or the translation…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-500"
            checked={onlyEdited}
            onChange={(e) => setOnlyEdited(e.target.checked)}
          />
          edited only
        </label>
        <button type="button" className="btn-ghost btn-sm" onClick={exportJson} title="Download the edits as a file to keep or to fold into the code">
          Export edits
        </button>
      </div>

      <p className="px-1 text-xs text-slate-500">
        {ALL_KEYS.length} strings · {Object.keys(saved).length} saved edits
        {meta?.updatedAt ? ' · last saved ' + new Date(meta.updatedAt).toLocaleString() + (meta.updatedBy ? ' by ' + meta.updatedBy : '') : ''}
        {meta?.store && meta.store !== 'netlify-blobs' ? ' · stored in ' + meta.store + ' (local)' : ''}
        . Curly-brace placeholders such as <code className="rounded bg-white/10 px-1">{'{n}'}</code> must stay in
        the translation exactly as in the English; they are filled in with numbers and names.
      </p>

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">Loading saved edits…</p>
      ) : (
        <div className="surface divide-y divide-white/[0.05]">
          {visible.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-600">Nothing matches.</p>
          )}
          {visible.map((key) => {
            const section = sectionOf(key);
            const header = section !== lastSection ? section : null;
            lastSection = section;
            const value = valueOf(key);
            const edited = key in draft && (draft[key] ?? '') !== (saved[key] ?? builtIn[key] ?? '');
            const problem = problems[key];
            const isSaved = key in saved && !(key in draft);
            const missing = !builtIn[key] && !saved[key] && !draft[key];
            const rows = Math.min(4, Math.max(1, Math.ceil(value.length / 60)));
            return (
              <div key={key}>
                {header && (
                  <h3 className="bg-white/[0.03] px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {header}
                  </h3>
                )}
                <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] text-slate-600">{key}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-300">{en[key]}</p>
                  </div>
                  <div className="min-w-0">
                    <textarea
                      className={
                        'field resize-y py-2 text-[14px] leading-relaxed ' +
                        (problem ? 'border-rose-400/60 focus:border-rose-400' : edited ? 'border-brand-500/60' : '')
                      }
                      rows={rows}
                      value={value}
                      spellCheck={false}
                      aria-label={'Translation of ' + key}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                    />
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                      {problem && <span className="font-semibold text-rose-300">{problem}</span>}
                      {!problem && edited && <span className="text-brand-300">changed, not saved</span>}
                      {!problem && !edited && isSaved && <span className="text-emerald-300">edited earlier</span>}
                      {!problem && !edited && missing && <span className="text-amber-300">no translation yet - English shows</span>}
                      {(isSaved || edited) && builtIn[key] && value !== builtIn[key] && (
                        <button
                          type="button"
                          className="text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
                          onClick={() => setDraft((d) => ({ ...d, [key]: builtIn[key] ?? '' }))}
                          title={'Back to: ' + builtIn[key]}
                        >
                          use original
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pinned, like every commit bar in the app: the list is long and the
          save must never be a scroll hunt. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-ink-950/92 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <span className="min-w-0 flex-1 basis-48 truncate text-[13px] text-slate-500">
            {notice ? (
              <span className={notice.tone === 'ok' ? 'text-emerald-300' : 'text-rose-300'}>{notice.text}</span>
            ) : problemCount > 0 ? (
              <span className="text-rose-300">
                {problemCount} {problemCount === 1 ? 'box has' : 'boxes have'} a problem - fix {problemCount === 1 ? 'it' : 'them'} to save
              </span>
            ) : dirty.length === 0 ? (
              'No unsaved changes.'
            ) : (
              dirty.length + (dirty.length === 1 ? ' change' : ' changes') + ' ready to save'
            )}
          </span>
          {dirty.length > 0 && (
            <button type="button" className="btn-ghost shrink-0" onClick={() => setDraft({})} disabled={busy}>
              Discard
            </button>
          )}
          <button
            type="button"
            className="btn-primary btn-lg shrink-0"
            onClick={save}
            disabled={busy || dirty.length === 0 || problemCount > 0}
          >
            {busy ? 'Saving…' : 'Save for everyone'}
          </button>
        </div>
      </div>
    </div>
  );
}
