'use client';

import { useState } from 'react';

/**
 * Question artwork.
 *
 * Deliberately a plain `<img>` rather than `next/image`: the URL is teacher-
 * supplied at runtime and can point anywhere, so there is no build-time host
 * allowlist to configure and no optimiser to route it through.
 *
 * A broken link must never eat the question - if the image fails we drop it
 * silently and the text stands on its own.
 */
export function QuestionMedia({
  src,
  alt = '',
  className = '',
  maxHeight = '18rem',
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  maxHeight?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;

  return (
    <div className={'overflow-hidden rounded-xl border border-white/10 bg-black/30 ' + className}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="mx-auto block w-auto max-w-full object-contain"
        style={{ maxHeight }}
        // Do not leak the classroom's referrer to arbitrary image hosts.
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
