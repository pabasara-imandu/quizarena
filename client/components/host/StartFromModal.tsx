'use client';

import { useRef, useState } from 'react';
import { Modal } from '@/components/ui/SlideOver';
import { Segmented } from '@/components/ui/Toggle';
import type { Quiz } from '@/lib/types';
import { serverUrl } from '@/lib/serverUrl';
import { useT } from '@/lib/i18n';


type Mode = 'import' | 'generate';

/**
 * The two "get a quiz without typing it" paths, behind one button.
 *
 * Both hand the result into the editor rather than launching a room, because
 * both produce content a teacher must read before a class sees it.
 */
export function StartFromModal({
  open,
  onClose,
  onQuizLoaded,
}: {
  open: boolean;
  onClose: () => void;
  onQuizLoaded: (quiz: Quiz) => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<Mode>('import');
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(
    null
  );
  const [warnings, setWarnings] = useState<string[]>([]);

  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [gradeLevel, setGradeLevel] = useState('');
  const [language, setLanguage] = useState<'en' | 'si' | 'ta'>('en');
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file: File) => {
    setBusy(true);
    setMessage(null);
    setWarnings([]);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(serverUrl() + '/api/import', { method: 'POST', body });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ tone: 'error', text: data.error || t('sf.importFailed') });
        return;
      }

      onQuizLoaded(data.quiz);
      setWarnings(data.warnings || []);
      if (data.warnings?.length) {
        setMessage({
          tone: 'warn',
          text: t('sf.imported', { n: data.importedRows, total: data.totalRows }),
        });
      } else {
        onClose();
      }
    } catch {
      setMessage({ tone: 'error', text: t('sf.noServerImport') });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const generate = async () => {
    if (!topic.trim()) return;
    setBusy(true);
    setMessage(null);
    setWarnings([]);
    try {
      const res = await fetch(serverUrl() + '/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), count, gradeLevel: gradeLevel.trim(), language }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ tone: 'error', text: data.error || t('sf.genFailed') });
        return;
      }

      onQuizLoaded(data.quiz);
      setMessage({
        tone: 'warn',
        text: data.notice || t('sf.draftLoaded'),
      });
    } catch {
      setMessage({ tone: 'error', text: t('sf.noServer') });
    } finally {
      setBusy(false);
    }
  };

  const toneClass =
    message?.tone === 'error'
      ? 'border-rose-400/25 bg-rose-500/10 text-rose-200'
      : message?.tone === 'warn'
        ? 'border-amber-400/25 bg-amber-500/10 text-amber-200'
        : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('sf.title')}
      description={t('sf.desc')}
      wide
    >
      <Segmented
        value={mode}
        onChange={setMode}
        ariaLabel={t('sf.howAria')}
        options={[
          { value: 'import', label: t('sf.import') },
          { value: 'generate', label: t('sf.generate') },
        ]}
      />

      <div className="mt-5">
        {mode === 'import' ? (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,.tsv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />

            {/* Drop target: teachers drag a file far more often than they hunt
                for a button, and the click path is still there. */}
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
              className={
                'flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 transition ' +
                (dragging
                  ? 'border-brand-400 bg-brand-500/10'
                  : 'border-mist/[0.12] hover:border-brand-500/50 hover:bg-mist/[0.03]')
              }
            >
              <span className="text-4xl">{busy ? '⏳' : '📄'}</span>
              <span className="mt-3 font-display text-lg font-bold">
                {busy ? t('sf.reading') : t('sf.drop')}
              </span>
              <span className="mt-1 text-sm text-slate-500">{t('sf.browse')}</span>
            </button>

            <div className="mt-4 flex items-center justify-between gap-3">
              <a
                className="text-[13px] font-medium text-brand-300 hover:underline"
                href={serverUrl() + '/api/import/template.csv'}
                download
              >
                {t('sf.template')}
              </a>
              <details className="text-right text-xs text-slate-500">
                <summary className="cursor-pointer hover:text-slate-300">{t('sf.expectedCols')}</summary>
              </details>
            </div>

            <div className="mt-3 rounded-xl bg-mist/[0.03] px-4 py-3 text-xs leading-relaxed text-slate-500">
              <b className="text-slate-400">Question Text</b> {t('sf.required')} ·{' '}
              <b className="text-slate-400">Question Type</b> ·{' '}
              <b className="text-slate-400">Option 1–5</b> ·{' '}
              <b className="text-slate-400">Correct Answer</b> ·{' '}
              <b className="text-slate-400">Time Limit</b> · <b className="text-slate-400">Points</b>{' '}
              · <b className="text-slate-400">Image Link</b>
              <br />
              {t('sf.colsNote')}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="field-label" htmlFor="gen-topic">
                {t('sf.topic')}
              </label>
              <input
                id="gen-topic"
                className="field text-base"
                placeholder={t('sf.topicPlaceholder')}
                value={topic}
                maxLength={200}
                autoFocus
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') generate();
                }}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="gen-count">
                  {t('sf.howMany')}
                </label>
                <input
                  id="gen-count"
                  type="number"
                  min={1}
                  max={20}
                  className="field"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value) || 5)}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="gen-grade">
                  {t('sf.yearGroup')} <span className="text-slate-600">{t('sf.optional')}</span>
                </label>
                <input
                  id="gen-grade"
                  className="field"
                  placeholder={t('sf.yearPlaceholder')}
                  value={gradeLevel}
                  maxLength={40}
                  onChange={(e) => setGradeLevel(e.target.value)}
                />
              </div>
            </div>

            {/* The medium of instruction. The whole quiz - questions, options,
                accepted spellings, explanations - is written in this language,
                natively, not translated from English. */}
            <div>
              <span className="field-label">{t('sf.language')}</span>
              <div className="segmented" role="radiogroup" aria-label={t('sf.langAria')}>
                {(
                  [
                    ['en', 'English'],
                    ['si', 'සිංහල'],
                    ['ta', 'தமிழ்'],
                  ] as const
                ).map(([code, name]) => (
                  <button
                    key={code}
                    type="button"
                    role="radio"
                    aria-checked={language === code}
                    onClick={() => setLanguage(code)}
                    className="segmented-item"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="btn-primary w-full btn-lg"
              disabled={busy || !topic.trim()}
              onClick={generate}
            >
              {busy ? t('sf.drafting') : t('sf.draft')}
            </button>

            <p className="field-hint">{t('sf.draftNote')}</p>
          </div>
        )}
      </div>

      {message && (
        <div className={'mt-5 rounded-xl border px-4 py-3 text-sm ' + toneClass}>
          <p>{message.text}</p>
          {warnings.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs opacity-90">
              {warnings.slice(0, 5).map((w) => (
                <li key={w}>{w}</li>
              ))}
              {warnings.length > 5 && <li>{t('sf.andMore', { n: warnings.length - 5 })}</li>}
            </ul>
          )}
          {warnings.length > 0 && (
            <button type="button" className="btn-secondary btn-sm mt-3" onClick={onClose}>
              {t('sf.gotIt')}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
