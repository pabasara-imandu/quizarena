'use client';

import { SlideOver } from '@/components/ui/SlideOver';
import { Toggle } from '@/components/ui/Toggle';
import type { RoomSettings } from '@/lib/types';

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
  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Room settings"
      description="These apply to the whole quiz. Defaults suit most classes."
      footer={
        <button type="button" className="btn-primary w-full" onClick={onClose}>
          Done
        </button>
      }
    >
      <div className="space-y-7">
        <Group title="Scoring">
          <Toggle
            label="Speed bonus"
            hint="Faster correct answers score more. Turn off for a fairness-first run."
            checked={settings.speedBonus}
            onChange={(v) => onChange({ speedBonus: v })}
          />
          <Toggle
            label="Leaderboard between questions"
            hint="Show the standings after each reveal."
            checked={settings.showLeaderboardBetweenQuestions}
            onChange={(v) => onChange({ showLeaderboardBetweenQuestions: v })}
          />
        </Group>

        <Group title="How the room runs">
          <Toggle
            label="Run the quiz on its own"
            hint="Each question moves to the answers and on to the next by itself, so you never have to reach for Next. You can still press it to jump ahead."
            checked={settings.autoAdvance}
            onChange={(v) => onChange({ autoAdvance: v })}
          />
          <Toggle
            label="Let students skip"
            hint="A Skip button ends their turn early, so one table cannot hold up the room."
            checked={settings.allowSkip}
            onChange={(v) => onChange({ allowSkip: v })}
          />
          <Toggle
            label="Allow late joins"
            hint="Latecomers can join mid-quiz, starting from zero."
            checked={settings.allowLateJoin}
            onChange={(v) => onChange({ allowLateJoin: v })}
          />
          <Toggle
            label="Live emoji reactions"
            hint="Students can send emoji that float across your screen between questions."
            checked={settings.allowReactions}
            onChange={(v) => onChange({ allowReactions: v })}
          />
        </Group>

        <Group title="Integrity">
          <Toggle
            label="Scramble answer order"
            hint="Each student sees the options in a different order, so glancing at a neighbour's screen does not help."
            checked={settings.shuffleAnswers}
            onChange={(v) => onChange({ shuffleAnswers: v })}
          />
          <Toggle
            label="Shuffle question order"
            hint="Randomises the running order once, for the whole room."
            checked={settings.shuffleQuestions}
            onChange={(v) => onChange({ shuffleQuestions: v })}
          />
          <Toggle
            label="Require full-screen"
            hint="Students must enter full-screen to play; leaving it pauses their quiz."
            checked={settings.requireFullscreen}
            onChange={(v) => onChange({ requireFullscreen: v })}
          />

          <div className="px-3 pt-2">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="field-label mb-0">Warnings before a student is paused</span>
              <span className="font-display text-lg font-bold text-brand-300 nums">
                {settings.strikeLimit || 'Off'}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              value={settings.strikeLimit}
              onChange={(e) => onChange({ strikeLimit: Number(e.target.value) })}
              className="w-full accent-brand-500"
              aria-label="Warnings before a student is paused"
            />
            <p className="field-hint">
              {settings.strikeLimit === 0
                ? 'Nobody is paused — events are still logged for you to review.'
                : 'After ' +
                  settings.strikeLimit +
                  ' warnings the student is paused until you let them back in.'}
            </p>
          </div>

          <p className="mx-3 rounded-xl bg-amber-500/[0.07] px-3 py-2.5 text-xs leading-relaxed text-amber-200/80">
            These signals show a browser lost focus — not that someone cheated. A notification, a
            dropped call or a screen reader can all trip them. Treat the log as a prompt to ask.
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
