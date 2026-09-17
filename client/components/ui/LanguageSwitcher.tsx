'use client';

import { LANGUAGES, useLanguage, type Lang } from '@/lib/i18n';

/**
 * The language menu. A plain select: it has to work on a school phone with a
 * cracked screen, and every browser already knows how to draw one.
 *
 * Renders nothing while English is the only language there is.
 */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useLanguage();
  if (LANGUAGES.length < 2) return null;

  return (
    <label className={'inline-flex items-center gap-1.5 text-xs text-slate-500 ' + className}>
      <span aria-hidden>🌐</span>
      <select
        className="select-pill"
        value={lang}
        aria-label={t('lang.label')}
        onChange={(e) => setLang(e.target.value as Lang)}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
