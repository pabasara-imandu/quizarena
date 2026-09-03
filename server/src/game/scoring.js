/**
 * Scoring model, tuned to reward speed and consistency without letting the
 * first two seconds decide the whole game:
 *
 *   correct answer -> base * (0.5 + 0.5 * remainingRatio) * streakMultiplier
 *   wrong / skipped / no answer -> 0, and the streak resets
 *
 * Everything is computed server-side from server timestamps. The client never
 * reports its own elapsed time, so a tampered clock cannot buy points.
 */

/** Streak 1..5+ maps to 1.0x, 1.25x, 1.5x, 1.75x, 2.0x - then caps. */
export const MAX_STREAK_STEPS = 4;
export const STREAK_STEP = 0.25;

export function streakMultiplier(streak) {
  const steps = Math.min(Math.max(streak - 1, 0), MAX_STREAK_STEPS);
  return 1 + steps * STREAK_STEP;
}

/** How many more correct answers until the multiplier goes up (null at cap). */
export function stepsToNextMultiplier(streak) {
  return streak - 1 >= MAX_STREAK_STEPS ? null : 1;
}

export function computeScore({
  base,
  correct,
  elapsedMs,
  timeLimitMs,
  streak,
  speedBonusEnabled = true,
}) {
  if (!correct) {
    return { points: 0, basePoints: 0, speedComponent: 0, multiplier: 1, multiplierBonus: 0 };
  }

  const clampedElapsed = Math.min(Math.max(elapsedMs, 0), timeLimitMs);
  const remainingRatio = timeLimitMs > 0 ? 1 - clampedElapsed / timeLimitMs : 1;

  const flat = speedBonusEnabled ? Math.round(base * 0.5) : base;
  const speedComponent = speedBonusEnabled ? Math.round(base * 0.5 * remainingRatio) : 0;
  const subtotal = flat + speedComponent;

  const multiplier = streakMultiplier(streak);
  const points = Math.round(subtotal * multiplier);

  return {
    points,
    basePoints: flat,
    speedComponent,
    multiplier,
    multiplierBonus: points - subtotal,
  };
}

/** Descending score, ties broken by who got there faster (lower totalTime wins). */
export function rankPlayers(players) {
  return [...players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.totalResponseMs !== b.totalResponseMs) return a.totalResponseMs - b.totalResponseMs;
    return a.nickname.localeCompare(b.nickname);
  });
}
