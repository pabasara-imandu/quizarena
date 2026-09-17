'use client';

import { SlideOver } from '@/components/ui/SlideOver';
import { Toggle } from '@/components/ui/Toggle';
import type { RoomSettings } from '@/lib/types';
import { useT } from '@/lib/i18n';

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
