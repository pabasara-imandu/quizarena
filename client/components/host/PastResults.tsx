'use client';

import { useEffect, useRef, useState } from 'react';
import type { Analytics } from '@/lib/types';
import {
  listArchived,
  parseResultsFile,
  removeArchived,
  type ArchivedResults,
} from '@/lib/resultsArchive';

/**
 * Finished quizzes kept on this device, and a way back into a recovered file.
 *
 * The results of a real class were once lost because they existed in exactly
 * two places, both of them fragile: a server's memory and a live React tree.
 * Every quiz now lands here the moment it ends, so closing the tab, reloading,
 * or losing the server is no longer the same as losing the marks.
 */
export function PastResults({ onOpen }: { onOpen: (data: Analytics) => void }) {
  const [items, setItems] = useState<ArchivedResults[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // localStorage does not exist during the server render, so this has to wait
  // for the browser or hydration would tear the list off the page.
  useEffect(() => setItems(listArchived()), []);

  const openFile = async (file: File) => {
    setError(null);
    const data = parseResultsFile(await file.text());
    if (!data) {
      setError('That file is not a QuizArena results backup.');
      return;
    }
    onOpen(data);
  };

  if (items.length === 0 && !error) {
    return (
      <div className="surface p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-display font-bold">No saved results yet</p>
            <p className="mt-0.5 text-[13px] text-slate-500">
              Every quiz you finish is kept on this device automatically. You can also open a
              backup file from another computer.
            </p>
          </div>
          <OpenFileButton fileRef={fileRef} onFile={openFile} />
        </div>
      </div>
    );
  }

  return (
    <div className="surface p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <span className="eyebrow">Past results</span>
          <p className="mt-0.5 text-[13px] text-slate-500">
            Saved on this device. Open one to browse it, re-mark it or export it again.
          </p>
        </div>
        <OpenFileButton fileRef={fileRef} onFile={openFile} />
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-[13px] text-rose-200">{error}</p>
      )}

      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.id}
            className="group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white/[0.04] px-3 py-2.5 transition hover:bg-white/[0.07]"
          >
            <button
              type="button"
              onClick={() => onOpen(item.data)}
              className="flex min-w-0 flex-1 basis-48 flex-col items-start text-left"
            >
              <span className="truncate font-semibold">{item.quizTitle}</span>
              <span className="text-[12px] text-slate-500 nums">
                {new Date(item.finishedAt).toLocaleString()} · PIN {item.pin}
              </span>
            </button>

            <span className="shrink-0 text-xs text-slate-400 nums">
              {item.playerCount} {item.playerCount === 1 ? 'student' : 'students'}
            </span>
            <span className="shrink-0 text-xs text-slate-500 nums">
              {item.questionCount} Q
            </span>
            {item.regraded && (
              <span className="shrink-0 rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] text-brand-200">
                re-marked
              </span>
            )}

            <button
              type="button"
              className="shrink-0 rounded px-2 py-1 text-[11px] text-slate-600 transition hover:text-rose-300"
              onClick={() => {
                removeArchived(item.id);
                setItems(listArchived());
              }}
              aria-label={'Delete saved results for ' + item.quizTitle}
            >
              delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OpenFileButton({
  fileRef,
  onFile,
}: {
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
}) {
  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
      <button type="button" className="btn-secondary shrink-0" onClick={() => fileRef.current?.click()}>
        Open a results file
      </button>
    </>
  );
}
