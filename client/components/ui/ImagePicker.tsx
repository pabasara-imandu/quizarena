'use client';

import { useId, useRef, useState } from 'react';
import { ACCEPTED_TYPES, uploadImage } from '@/lib/imageUpload';

/**
 * Attach an image: upload from the device, or paste a URL.
 *
 * Both paths end in the same place - a URL stored on the question - so the
 * game engine has one code path and does not care where a picture came from.
 * Upload is offered first because it is what a teacher with a photo on their
 * phone actually wants; pasting a URL is the fallback for something already
 * online.
 */
export function ImagePicker({
  value,
  onChange,
  label = 'Image',
  compact = false,
}: {
  value?: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  compact?: boolean;
}) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showUrl, setShowUrl] = useState(false);
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const result = await uploadImage(file);
      onChange(result.url);
      setNote(
        Math.round(result.bytes / 1024) +
          ' KB' +
          (result.width ? ' · ' + result.width + '×' + result.height : '') +
          (file.size > result.bytes * 1.5
            ? ' (shrunk from ' + Math.round(file.size / 1024) + ' KB)'
            : '')
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      <input
        ref={fileRef}
        id={inputId}
        type="file"
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {value ? (
        <div className="flex items-start gap-3">
          <img
            src={value}
            alt=""
            referrerPolicy="no-referrer"
            className={
              'shrink-0 rounded-lg border border-white/10 bg-black/30 object-cover ' +
              (compact ? 'h-12 w-12' : 'h-20 w-20')
            }
            onError={(e) => {
              e.currentTarget.style.opacity = '0.25';
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-slate-400">{label} attached</p>
            {note && <p className="mt-0.5 text-[11px] text-slate-600">{note}</p>}
            <div className="mt-1.5 flex flex-wrap gap-2">
              <button
                type="button"
                className="text-[12px] font-medium text-slate-400 transition hover:text-brand-300"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                Replace
              </button>
              <button
                type="button"
                className="text-[12px] font-medium text-slate-500 transition hover:text-rose-300"
                onClick={() => {
                  onChange(null);
                  setNote(null);
                  setError(null);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap items-center gap-2">
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
                'rounded-xl border border-dashed px-3 py-2 text-[13px] font-semibold transition ' +
                (dragging
                  ? 'border-brand-400 bg-brand-500/10 text-brand-200'
                  : 'border-white/[0.14] text-slate-400 hover:border-brand-500/50 hover:bg-brand-500/[0.07] hover:text-brand-200')
              }
            >
              {busy ? 'Uploading…' : '⬆ Upload ' + label.toLowerCase()}
            </button>

            <button
              type="button"
              className="text-[12px] font-medium text-slate-600 transition hover:text-slate-300"
              onClick={() => setShowUrl((v) => !v)}
            >
              or paste a URL
            </button>
          </div>

          {showUrl && (
            <input
              className="field mt-2 animate-rise py-2 text-[13px]"
              placeholder="https://…"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = (e.target as HTMLInputElement).value.trim();
                  if (v) onChange(v);
                  setShowUrl(false);
                }
              }}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v) onChange(v);
              }}
            />
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-[12px] text-rose-200">
          {error}
        </p>
      )}
    </div>
  );
}
