const LOGO = '/acicts-logo.webp';

/**
 * The society crest, lit.
 *
 * The artwork is white line art on transparency, which on a dark page is flat
 * and lifeless. It sits back at partial opacity over a soft pool of brand
 * light, so it reads as unlit metal, and a highlight sweeps across it clipped
 * to its own strokes by using the logo as a mask - the light lands on the
 * engraving, never on the empty space around it, which is what a real
 * specular glint does.
 *
 * Pure CSS over one cached image, so this stays a server component with no
 * JavaScript attached to it at all.
 */
export function SocietyLogo({ className = '' }: { className?: string }) {
  return (
    <div className={'relative ' + className}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 scale-90 opacity-70 blur-2xl"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(124,109,255,0.34) 0%, rgba(124,109,255,0.09) 45%, transparent 70%)',
        }}
      />

      <img
        src={LOGO}
        width={960}
        height={603}
        alt="Ananda College ICT Society"
        className="relative block h-auto w-full select-none opacity-[0.82]"
        style={{ filter: 'drop-shadow(0 8px 18px rgba(0,0,0,0.55))' }}
        draggable={false}
      />

      <span
        aria-hidden
        className="logo-glint pointer-events-none absolute inset-0"
        style={{ WebkitMaskImage: `url(${LOGO})`, maskImage: `url(${LOGO})` }}
      />
    </div>
  );
}
