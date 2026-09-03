'use client';

import { useCallback, useEffect, useState } from 'react';

const LOGO = '/acicts-logo.webp';
/** Intrinsic aspect of the artwork, so the box never reflows once it loads. */
const ASPECT = 960 / 603;
/** Degrees of tilt at the very corner. Past ~10 it stops reading as a lit
 *  object and starts reading as a distorted picture. */
const MAX_TILT = 9;

/**
 * The society crest, lit.
 *
 * The artwork is white line art on transparency, which on a dark page is flat
 * and lifeless. Three things give it substance:
 *
 *  - the base sits back at partial opacity, so it reads as unlit metal;
 *  - a highlight sweeps across it, clipped to the strokes by using the logo
 *    itself as a mask - the light lands on the crest, never on the empty space
 *    around it, which is what a real specular glint does;
 *  - it tilts toward the pointer in perspective, so the sweep and the shadow
 *    move against each other and the whole thing sits in space.
 *
 * All of it is CSS transforms and a mask on one cached image; nothing here
 * costs a repaint of anything else on the page.
 */
export function SocietyLogo({ className = '' }: { className?: string }) {
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
      // Coarse pointers fire this on tap, which would leave the crest frozen
      // mid-tilt with nothing to move it back.
      if (still || event.pointerType !== 'mouse') return;
      const box = event.currentTarget.getBoundingClientRect();
      const px = (event.clientX - box.left) / box.width - 0.5;
      const py = (event.clientY - box.top) / box.height - 0.5;
      setTilt({ x: -py * 2 * MAX_TILT, y: px * 2 * MAX_TILT });
    },
    [still]
  );

  const lit = tilt !== null;

  return (
    <div
      className={'group relative [perspective:900px] ' + className}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setTilt(null)}
    >
      <div
        className={
          'relative transition-transform duration-300 ease-out ' +
          (still ? '' : lit ? '' : 'animate-logoFloat')
        }
        style={{
          transformStyle: 'preserve-3d',
          transform: tilt
            ? `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.03)`
            : undefined,
        }}
      >
        {/* Depth: a soft pool of brand light behind the crest, pushed back in
            Z so the tilt parallaxes it against the artwork. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-70 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
          style={{
            transform: 'translateZ(-60px) scale(0.86)',
            background:
              'radial-gradient(ellipse at center, rgba(124,109,255,0.38) 0%, rgba(124,109,255,0.10) 45%, transparent 70%)',
          }}
        />

        <img
          src={LOGO}
          width={960}
          height={603}
          alt="Ananda College ICT Society"
          className="relative block h-auto w-full select-none opacity-[0.78] transition-opacity duration-500 group-hover:opacity-95"
          style={{ filter: 'drop-shadow(0 10px 22px rgba(0,0,0,0.55))' }}
          draggable={false}
        />

        {/* The glint. A bright band travelling across a rectangle, clipped to
            the crest's own strokes by the mask - so it looks like light
            catching the engraving rather than a stripe crossing a box. */}
        {!still && (
          <span
            aria-hidden
            className="logo-glint pointer-events-none absolute inset-0"
            style={{
              WebkitMaskImage: `url(${LOGO})`,
              maskImage: `url(${LOGO})`,
              aspectRatio: String(ASPECT),
            }}
          />
        )}
      </div>
    </div>
  );
}
