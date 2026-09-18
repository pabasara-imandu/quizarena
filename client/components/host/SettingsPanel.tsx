'use client';

import { SlideOver } from '@/components/ui/SlideOver';
import { Toggle } from '@/components/ui/Toggle';
import type { RoomSettings } from '@/lib/types';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { findTheme, THEMES } from '@/lib/themes';

/**
 * Every room setting, grouped and out of the way.
 *
 * Nothing was removed when these moved off the main editor - the nine toggles
 * that used to occupy a permanent grid above the questions are all here, now
 * sorted into the three questions a teacher actually asks: how does scoring
 * work, how does the room run, and how closely am I watching.
 */
export function SettingsPanel({
  open,
  onClose,
  settings,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  settings: RoomSettings;
  onChange: (patch: Partial<RoomSettings>) => void;
}) {
  const t = useT();
  const { appearance, setAppearance } = useTheme();
  const theme = findTheme(appearance.theme);
  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={t('settings.title')}
      description={t('settings.desc')}
      footer={
        <button type="button" className="btn-primary w-full" onClick={onClose}>
          {t('settings.done')}
        </button>
      }
    >
      <div className="space-y-7">
        {/* Not a room setting: this device's own look, kept beside the room
            settings because this is where a teacher goes to set things up.
            Applies at once, so the choice is made by looking, not guessing. */}
        <Group title={t('settings.appearance')}>
          <div className="px-3">
            <p className="field-hint mt-0 mb-3">{t('settings.appearanceHint')}</p>

            <span className="field-label">{t('settings.theme')}</span>
            {/* Each card is drawn in the theme's own colours and face, so
                the choice is made by looking, not by reading a name. */}
            <div className="mb-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('settings.theme')}>
              {THEMES.map((th) => {
                const active = th.id === appearance.theme;
                return (
                  <button
                    key={th.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={th.hint}
                    onClick={() => setAppearance({ theme: th.id })}
                    className={
                      'overflow-hidden rounded-xl border text-left transition ' +
                      (active ? 'border-brand-500 ring-2 ring-brand-500/40' : 'border-mist/[0.1] hover:border-mist/[0.25]')
                    }
                    style={{ background: th.preview.bg, color: th.preview.ink }}
                  >
                    <span className="block px-3 pt-2.5" style={{ fontFamily: th.preview.font, fontSize: 17, fontWeight: 700 }}>
                      {th.name}
                    </span>
                    <span className="mx-3 mb-2.5 mt-2 flex items-center gap-1.5">
                      <span className="h-3 flex-1 rounded-sm" style={{ background: th.preview.card, border: '1px solid rgba(0,0,0,0.25)' }} />
                      <span className="h-3 w-8 rounded-sm" style={{ background: th.preview.accent }} />
                    </span>
                  </button>
                );
              })}
            </div>

            {theme.palettes.length > 1 && <span className="field-label">{t('settings.palette')}</span>}
            <div
              className={'grid grid-cols-2 gap-2' + (theme.palettes.length > 1 ? '' : ' hidden')}
              role="radiogroup"
              aria-label={t('settings.palette')}
            >
              {theme.palettes.map((p) => {
                const active = p.id === appearance.palette;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={p.hint}
                    onClick={() => setAppearance({ palette: p.id })}
                    className={
                      'flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition ' +
                      (active
                        ? 'border-brand-500/60 bg-brand-500/10'
                        : 'border-mist/[0.08] bg-mist/[0.03] hover:border-mist/[0.16]')
                    }
                  >
                    {/* The swatch is the palette itself, not a picture of it:
                        page, card, accent, in a fixed-colour frame so it reads
                        the same whatever palette is on. */}
                    <span
                      className="flex h-8 w-8 shrink-0 overflow-hidden rounded-lg ring-1 ring-black/40"
                      aria-hidden
                      style={{ background: p.swatch[0] }}
                    >
                      <span className="mt-2 ml-1.5 h-4 w-3 rounded-sm" style={{ background: p.swatch[1] }} />
                      <span className="mt-3 ml-1 h-2 w-2 rounded-full" style={{ background: p.swatch[2] }} />
                    </span>
                    <span className="min-w-0">
                      <span className={'block text-[13px] font-semibold ' + (active ? 'text-brand-300' : 'text-slate-200')}>
                        {p.name}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </Group>

        <Group title={t('settings.scoring')}>
          <Toggle
            label={t('settings.speedBonus')}
            hint={t('settings.speedBonusHint')}
            checked={settings.speedBonus}
            onChange={(v) => onChange({ speedBonus: v })}
          />
          <Toggle
            label={t('settings.leaderboard')}
            hint={t('settings.leaderboardHint')}
            checked={settings.showLeaderboardBetweenQuestions}
            onChange={(v) => onChange({ showLeaderboardBetweenQuestions: v })}
          />
        </Group>

        <Group title={t('settings.howRuns')}>
          <Toggle
            label={t('settings.auto')}
            hint={t('settings.autoHint')}
            checked={settings.autoAdvance}
            onChange={(v) => onChange({ autoAdvance: v })}
          />
          <Toggle
            label={t('settings.skip')}
            hint={t('settings.skipHint')}
            checked={settings.allowSkip}
            onChange={(v) => onChange({ allowSkip: v })}
          />
          <Toggle
            label={t('settings.lateJoin')}
            hint={t('settings.lateJoinHint')}
            checked={settings.allowLateJoin}
            onChange={(v) => onChange({ allowLateJoin: v })}
          />
          <Toggle
            label={t('settings.reactions')}
            hint={t('settings.reactionsHint')}
            checked={settings.allowReactions}
            onChange={(v) => onChange({ allowReactions: v })}
          />
        </Group>

        <Group title={t('settings.integrity')}>
          <Toggle
            label={t('settings.shuffleAnswers')}
            hint={t('settings.shuffleAnswersHint')}
            checked={settings.shuffleAnswers}
            onChange={(v) => onChange({ shuffleAnswers: v })}
          />
          <Toggle
            label={t('settings.shuffleQuestions')}
            hint={t('settings.shuffleQuestionsHint')}
            checked={settings.shuffleQuestions}
            onChange={(v) => onChange({ shuffleQuestions: v })}
          />
          <Toggle
            label={t('settings.fullscreen')}
            hint={t('settings.fullscreenHint')}
            checked={settings.requireFullscreen}
            onChange={(v) => onChange({ requireFullscreen: v })}
          />

          <div className="px-3 pt-2">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="field-label mb-0">{t('settings.warningsLabel')}</span>
              <span className="font-display text-lg font-bold text-brand-300 nums">
                {settings.strikeLimit || t('settings.off')}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              value={settings.strikeLimit}
              onChange={(e) => onChange({ strikeLimit: Number(e.target.value) })}
              className="w-full accent-brand-500"
              aria-label={t('settings.warningsLabel')}
            />
            <p className="field-hint">
              {settings.strikeLimit === 0
                ? t('settings.nobodyPaused')
                : t('settings.afterWarnings', { n: settings.strikeLimit })}
            </p>
          </div>

          <p className="mx-3 rounded-xl bg-amber-500/[0.07] px-3 py-2.5 text-xs leading-relaxed text-amber-200/80">
            {t('settings.signalsNote')}
          </p>
        </Group>
      </div>
    </SlideOver>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="eyebrow mb-2 px-3">{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}
