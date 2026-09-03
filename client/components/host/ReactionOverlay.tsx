'use client';

import { useEffect, useRef, useState } from 'react';

interface Floater {
  id: number;
  emoji: string;
  left: number;
  duration: number;
  drift: number;
  scale: number;
}

/** Hard ceiling on simultaneous floaters. A room of 200 students all tapping
 *  at once must not turn the host's dashboard into a slideshow. */
const MAX_FLOATERS = 40;
const PER_BURST_CAP = 12;

/**
 * Floating emoji reactions on the host screen.
 *
 * Purely decorative and `pointer-events-none`, so it can never intercept a
 * click meant for the Next button underneath it. Animation is CSS-only - no
 * per-frame React state - so a steady stream of reactions costs the main
 * thread almost nothing while a question is live.
 */
export function ReactionOverlay({
  bursts,
}: {
  bursts: { reactions: { emoji: string; count: number }[]; at: number } | null;
}) {
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const nextId = useRef(0);
  const reduceMotion = useRef(false);

  useEffect(() => {
    reduceMotion.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (!bursts?.reactions?.length) return;

    const created: Floater[] = [];
    for (const { emoji, count } of bursts.reactions) {
      // Show a representative handful rather than one floater per tap.
      const n = Math.min(count, PER_BURST_CAP);
      for (let i = 0; i < n; i++) {
        created.push({
          id: nextId.current++,
          emoji,
          left: 4 + Math.random() * 88,
          duration: 2600 + Math.random() * 1400,
          drift: (Math.random() - 0.5) * 90,
          scale: 0.85 + Math.random() * 0.6,
        });
      }
    }
    if (created.length === 0) return;

    setFloaters((current) => [...current, ...created].slice(-MAX_FLOATERS));

    const longest = Math.max(...created.map((f) => f.duration));
    const ids = new Set(created.map((f) => f.id));
    const timer = setTimeout(() => {
      setFloaters((current) => current.filter((f) => !ids.has(f.id)));
    }, longest + 200);
    return () => clearTimeout(timer);
  }, [bursts]);

  if (floaters.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-30 overflow-hidden"
      aria-hidden
      data-testid="reaction-overlay"
    >
      {floaters.map((f) => (
        <span
          key={f.id}
          className="absolute bottom-0 select-none text-4xl will-change-transform"
          style={{
            left: f.left + '%',
            animation: `reaction-float ${f.duration}ms cubic-bezier(0.25, 0.6, 0.4, 1) forwards`,
            ['--drift' as string]: f.drift + 'px',
            ['--scale' as string]: String(f.scale),
          }}
        >
          {f.emoji}
        </span>
      ))}

      <style>{`
        @keyframes reaction-float {
          0%   { transform: translate3d(0, 0, 0) scale(var(--scale)); opacity: 0; }
          12%  { opacity: 1; }
          75%  { opacity: 1; }
          100% { transform: translate3d(var(--drift), -78vh, 0) scale(var(--scale)); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-testid="reaction-overlay"] span { animation-duration: 900ms !important; }
        }
      `}</style>
    </div>
  );
}
