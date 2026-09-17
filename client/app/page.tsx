'use client';

import Link from 'next/link';
import { SocietyLogo } from '@/components/ui/SocietyLogo';
import { Tilt3D } from '@/components/ui/Tilt3D';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useT } from '@/lib/i18n';

export default function HomePage() {
  const t = useT();
  return (
    <main className="relative mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-5 py-16">
      <LanguageSwitcher className="absolute right-4 top-4" />

      <div className="text-center">
        <span className="chip-brand">{t('home.chip')}</span>

        {/* One masthead: the crest and the product name share a rule, so the
            page reads as the society's rather than as a product that happens
            to credit them.

            The credit sits under the whole row, not inside it. Tucked beside
            the wordmark it was the widest thing in the lockup, so it pushed
            the crest out to one margin and itself to the other - centred by
            the box model, lopsided to the eye. */}
        <div className="mt-6 flex items-center justify-center gap-3 sm:gap-5">
          <SocietyLogo className="w-14 shrink-0 sm:w-[5.5rem]" />
          <span className="h-10 w-px shrink-0 bg-white/[0.13] sm:h-14" aria-hidden />
          <Tilt3D>
            <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-6xl">
              Quiz<span className="text-brand-400">Arena</span>
            </h1>
          </Tilt3D>
        </div>

        <p className="mt-3.5 text-[13px] font-medium text-slate-400 sm:mt-4 sm:text-[15px]">
          {t('home.hostedBy')} <span className="text-brand-300">{t('home.society')}</span>
        </p>
      </div>

      <div className="mt-12 grid w-full gap-4 sm:grid-cols-2">
        <Link
          href="/host"
          className="surface surface-hover group relative overflow-hidden p-6"
        >
          <span className="text-3xl">🎛️</span>
          <h2 className="mt-3 font-display text-2xl font-bold">{t('home.host.title')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{t('home.host.body')}</p>
          <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-300">
            {t('home.host.cta')}
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </span>
        </Link>

        <Link
          href="/join"
          className="surface surface-hover group relative overflow-hidden p-6"
        >
          <span className="text-3xl">✋</span>
          <h2 className="mt-3 font-display text-2xl font-bold">{t('home.join.title')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{t('home.join.body')}</p>
          <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-300">
            {t('home.join.cta')}
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
