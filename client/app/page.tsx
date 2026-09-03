import Link from 'next/link';
import { SocietyLogo } from '@/components/ui/SocietyLogo';
import { Tilt3D } from '@/components/ui/Tilt3D';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-5 py-16">
      <div className="text-center">
        <span className="chip-brand">Live · real-time · one PIN</span>

        {/* One masthead. The crest and the product name share a rule, so the
            page reads as the society's rather than as a product that happens
            to credit them - and the crest earns its place at a fraction of
            the size it needed when it stood alone. */}
        <div className="mt-6 flex items-center justify-center gap-3 sm:gap-5">
          <SocietyLogo className="w-14 shrink-0 sm:w-[5.5rem]" />
          <span className="h-11 w-px shrink-0 bg-white/[0.13] sm:h-16" aria-hidden />

          <div className="text-left">
            <Tilt3D>
              <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-6xl">
                Quiz<span className="text-brand-400">Arena</span>
              </h1>
            </Tilt3D>
            <p className="mt-1 text-[12.5px] font-medium leading-snug text-slate-400 sm:mt-1.5 sm:text-[15px]">
              Hosted by <span className="text-brand-300">Ananda College ICT Society</span>
            </p>
          </div>
        </div>
      </div>

      <div className="mt-12 grid w-full gap-4 sm:grid-cols-2">
        <Link
          href="/host"
          className="surface surface-hover group relative overflow-hidden p-6"
        >
          <span className="text-3xl">🎛️</span>
          <h2 className="mt-3 font-display text-2xl font-bold">Host a quiz</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Build questions, open a room, and drive the session from a live dashboard with
            per-question analytics.
          </p>
          <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-300">
            Open the dashboard
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </span>
        </Link>

        <Link
          href="/join"
          className="surface surface-hover group relative overflow-hidden p-6"
        >
          <span className="text-3xl">✋</span>
          <h2 className="mt-3 font-display text-2xl font-bold">Join a quiz</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Enter the 6-digit PIN your teacher is showing, pick a nickname, and play.
          </p>
          <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-300">
            Enter a PIN
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </span>
        </Link>
      </div>

      <p className="mt-12 text-xs tracking-wide text-slate-600">
        ACICTS © 2026
      </p>
    </main>
  );
}
