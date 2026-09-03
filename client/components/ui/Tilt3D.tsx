'use client';

import { useCallback, useEffect, useState } from 'react';

/** Degrees of tilt at the very corner. Past ~10 it stops reading as a lit
 *  object and starts reading as a distorted picture. */
const MAX_TILT = 9;

/**
 * Tilts its children toward the pointer, in perspective.
 *
 * Wraps tightly (inline-block) so the effect only answers to a pointer that is
 * actually over the thing, not anywhere in the row it happens to sit in.
 */
export function Tilt3D({
  children,
  className = '',
  max = MAX_TILT,
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
}) {
  const [tilt, setTilt] = useState<{ x: number; y: number } | null>(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setStill(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Coarse pointers fire this on tap, which would leave the element frozen
      // mid-tilt with nothing to move it back.
      if (still || event.pointerType !== 'mouse') return;
      const box = event.currentTarget.getBoundingClientRect();
      const px = (event.clientX - box.left) / box.width - 0.5;
      const py = (event.clientY - box.top) / box.height - 0.5;
      setTilt({ x: -py * 2 * max, y: px * 2 * max });
    },
    [still, max]
  );

  return (
    <div
      className={'inline-block [perspective:900px] ' + className}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setTilt(null)}
    >
      <div
        className="transition-transform duration-300 ease-out"
        style={{
          transformStyle: 'preserve-3d',
          transform: tilt ? `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.03)` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
