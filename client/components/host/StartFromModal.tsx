'use client';

import { useRef, useState } from 'react';
import { Modal } from '@/components/ui/SlideOver';
import { Segmented } from '@/components/ui/Toggle';
import type { Quiz } from '@/lib/types';
import { serverUrl } from '@/lib/serverUrl';


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
        setMessage({ tone: 'error', text: data.error || 'That file could not be imported.' });
        return;
      }

      onQuizLoaded(data.quiz);
      setWarnings(data.warnings || []);
      if (data.warnings?.length) {
        setMessage({
          tone: 'warn',
          text: 'Imported ' + data.importedRows + ' of ' + data.totalRows + ' rows.',
        });
      } else {
        onClose();
      }
    } catch {
      setMessage({ tone: 'error', text: 'Could not reach the server to import that file.' });
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
        body: JSON.stringify({ topic: topic.trim(), count, gradeLevel: gradeLevel.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ tone: 'error', text: data.error || 'Generation failed.' });
        return;
      }

      onQuizLoaded(data.quiz);
      setMessage({
        tone: 'warn',
        text: data.notice || 'Draft loaded — review every question before you run it.',
      });
    } catch {
      setMessage({ tone: 'error', text: 'Could not reach the server.' });
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
      title="Start from something"
      description="Import a spreadsheet you already have, or draft from a topic."
      wide
    >
      <Segmented
        value={mode}
        onChange={setMode}
        ariaLabel="How to start"
        options={[
          { value: 'import', label: 'Import a file' },
          { value: 'generate', label: 'Generate from a topic' },
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
                  : 'border-white/[0.12] hover:border-brand-500/50 hover:bg-white/[0.03]')
              }
            >
              <span className="text-4xl">{busy ? '⏳' : '📄'}</span>
              <span className="mt-3 font-display text-lg font-bold">
                {busy ? 'Reading your file…' : 'Drop a spreadsheet here'}
              </span>
              <span className="mt-1 text-sm text-slate-500">
                or click to browse — .xlsx, .xls or .csv
              </span>
            </button>

            <div className="mt-4 flex items-center justify-between gap-3">
              <a
                className="text-[13px] font-medium text-brand-300 hover:underline"
                href={serverUrl() + '/api/import/template.csv'}
                download
              >
                Download a template ↓
              </a>
              <details className="text-right text-xs text-slate-500">
                <summary className="cursor-pointer hover:text-slate-300">Expected columns</summary>
              </details>
            </div>

            <div className="mt-3 rounded-xl bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-slate-500">
              <b className="text-slate-400">Question Text</b> (required) ·{' '}
              <b className="text-slate-400">Question Type</b> ·{' '}
              <b className="text-slate-400">Option 1–5</b> ·{' '}
              <b className="text-slate-400">Correct Answer</b> ·{' '}
              <b className="text-slate-400">Time Limit</b> · <b className="text-slate-400">Points</b>{' '}
              · <b className="text-slate-400">Image Link</b>
              <br />
              Correct Answer takes a letter (A–E), a number, TRUE/FALSE, or the answer text itself.
              Short answers separate alternatives with <code className="text-slate-400">|</code>.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="field-label" htmlFor="gen-topic">
                Topic
              </label>
              <input
                id="gen-topic"
                className="field text-base"
                placeholder="e.g. The water cycle"
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
                  How many questions
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
                  Year group <span className="text-slate-600">(optional)</span>
                </label>
                <input
                  id="gen-grade"
                  className="field"
                  placeholder="Year 8"
                  value={gradeLevel}
                  maxLength={40}
                  onChange={(e) => setGradeLevel(e.target.value)}
                />
              </div>
            </div>

            <button
              type="button"
              className="btn-primary w-full btn-lg"
              disabled={busy || !topic.trim()}
              onClick={generate}
            >
              {busy ? 'Drafting…' : '✨ Draft questions'}
            </button>

            <p className="field-hint">
              Questions land in the editor as a draft and replace what is there now. Read every
              answer before you run this with a class.
            </p>
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
              {warnings.length > 5 && <li>…and {warnings.length - 5} more</li>}
            </ul>
          )}
          {warnings.length > 0 && (
            <button type="button" className="btn-secondary btn-sm mt-3" onClick={onClose}>
              Got it — open the editor
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
