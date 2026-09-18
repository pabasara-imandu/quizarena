/**
 * Themes and their palettes.
 *
 * A theme is a whole look - layout, type, spacing, motion. A palette is one
 * coat of paint on it: the page and card colours, the text scale, the one
 * accent, and the glow in the corner. The four answer tiles never change;
 * they are the game, and the shapes on them are what colour-blind students
 * read.
 *
 * "Aurora" is the look the app shipped with, named for the glow behind every
 * page. Its palettes are the six prototypes. A second theme, when there is
 * one, is a second entry here and a second `[data-theme]` block in the CSS.
 *
 * The choice is per device, like the language. The tokens themselves live in
 * globals.css under `[data-palette]`; this file is the menu.
 */
export interface Palette {
  id: string;
  name: string;
  /** One line for the picker. */
  hint: string;
  /** Page, card and accent, for the swatch. */
  swatch: [string, string, string];
  /** Light palettes tell the browser so form controls and scrollbars follow. */
  scheme: 'dark' | 'light';
}

export interface Theme {
  id: string;
  name: string;
  hint: string;
  palettes: Palette[];
}

export const THEMES: Theme[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    hint: 'The original: soft surfaces, one accent, a glow in the corner.',
    palettes: [
      { id: 'midnight', name: 'Midnight', hint: 'Violet on near-black. The default.', swatch: ['#07070C', '#16162A', '#7562F5'], scheme: 'dark' },
      { id: 'daylight', name: 'Daylight', hint: 'The same violet on paper, for bright rooms and weak projectors.', swatch: ['#F4F3FA', '#FFFFFF', '#5C49DC'], scheme: 'light' },
      { id: 'chalkboard', name: 'Chalkboard', hint: 'Deep green board, chalk-white text, chalk-yellow accent.', swatch: ['#0B1712', '#1A2D22', '#F5B93B'], scheme: 'dark' },
      { id: 'lagoon', name: 'Lagoon', hint: 'Deep navy with a teal accent. Easy on the eyes for a long session.', swatch: ['#05121E', '#112637', '#22C7C3'], scheme: 'dark' },
      { id: 'lanka', name: 'Lanka', hint: 'Maroon under saffron - the flag, for national events.', swatch: ['#160810', '#301723', '#F2A324'], scheme: 'dark' },
      { id: 'contrast', name: 'High contrast', hint: 'Pure black, white text, yellow accent, firm borders. For low vision and washed-out screens.', swatch: ['#000000', '#141414', '#FFE600'], scheme: 'dark' },
    ],
  },
];

export const DEFAULT_THEME = THEMES[0].id;
export const DEFAULT_PALETTE = THEMES[0].palettes[0].id;

export interface Appearance {
  theme: string;
  palette: string;
}

export function findTheme(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** A valid pair, whatever was stored: unknown ids fall back to the defaults. */
export function normalizeAppearance(raw: unknown): Appearance {
  const theme = findTheme((raw as Appearance)?.theme);
  const wanted = (raw as Appearance)?.palette;
  const palette = theme.palettes.find((p) => p.id === wanted) ?? theme.palettes[0];
  return { theme: theme.id, palette: palette.id };
}
