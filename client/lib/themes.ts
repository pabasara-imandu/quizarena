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
  /** For the picker: the page, a card and the accent, plus the display face. */
  preview: { bg: string; card: string; accent: string; ink: string; font: string };
}

export const THEMES: Theme[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    hint: 'The original: soft surfaces, one accent, a glow in the corner.',
    preview: { bg: '#07070C', card: '#16162A', accent: '#7562F5', ink: '#F1F5F9', font: 'var(--font-display)' },
    palettes: [
      { id: 'midnight', name: 'Midnight', hint: 'Violet on near-black. The default.', swatch: ['#07070C', '#16162A', '#7562F5'], scheme: 'dark' },
      { id: 'daylight', name: 'Daylight', hint: 'The same violet on paper, for bright rooms and weak projectors.', swatch: ['#F4F3FA', '#FFFFFF', '#5C49DC'], scheme: 'light' },
      { id: 'chalkboard', name: 'Chalkboard', hint: 'Deep green board, chalk-white text, chalk-yellow accent.', swatch: ['#0B1712', '#1A2D22', '#F5B93B'], scheme: 'dark' },
      { id: 'lagoon', name: 'Lagoon', hint: 'Deep navy with a teal accent. Easy on the eyes for a long session.', swatch: ['#05121E', '#112637', '#22C7C3'], scheme: 'dark' },
      { id: 'lanka', name: 'Lanka', hint: 'Maroon under saffron - the flag, for national events.', swatch: ['#160810', '#301723', '#F2A324'], scheme: 'dark' },
      { id: 'contrast', name: 'High contrast', hint: 'Pure black, white text, yellow accent, firm borders. For low vision and washed-out screens.', swatch: ['#000000', '#141414', '#FFE600'], scheme: 'dark' },
    ],
  },
  {
    id: 'oldschool',
    name: 'Old School',
    hint: 'A green board in a wooden frame, chalk handwriting, paper notes pinned on.',
    preview: { bg: '#1E3A2B', card: '#2A4D39', accent: '#FFE28A', ink: '#F7F3E8', font: 'var(--font-caveat)' },
    palettes: [{ id: 'default', name: 'Chalk', hint: '', swatch: ['#1E3A2B', '#2A4D39', '#FFE28A'], scheme: 'dark' }],
  },
  {
    id: 'arcade',
    name: 'Arcade',
    hint: 'An 80s cabinet: pixel type, scanlines, square blocks with neon shadows.',
    preview: { bg: '#0B0620', card: '#1A1048', accent: '#FF3EA5', ink: '#22E3FF', font: 'var(--font-press)' },
    palettes: [{ id: 'default', name: 'Neon', hint: '', swatch: ['#0B0620', '#1A1048', '#FF3EA5'], scheme: 'dark' }],
  },
  {
    id: 'exam',
    name: 'Exam Paper',
    hint: 'Ruled paper, serif type, ink and a red margin. Calm and formal.',
    preview: { bg: '#E9E3D6', card: '#FBF8F1', accent: '#1A1A1A', ink: '#1A1A1A', font: 'var(--font-baskerville)' },
    palettes: [{ id: 'default', name: 'Paper', hint: '', swatch: ['#E9E3D6', '#FBF8F1', '#1A1A1A'], scheme: 'light' }],
  },
  {
    id: 'playground',
    name: 'Playground',
    hint: 'Candy colours, thick outlines, hard shadows, big rounded type. For primary.',
    preview: { bg: '#FFE066', card: '#FFFFFF', accent: '#FF6B9D', ink: '#111111', font: 'var(--font-fredoka)' },
    palettes: [{ id: 'default', name: 'Candy', hint: '', swatch: ['#FFE066', '#FFFFFF', '#FF6B9D'], scheme: 'light' }],
  },
  {
    id: 'terminal',
    name: 'Terminal',
    hint: 'Green on black, monospace, brackets and a prompt.',
    preview: { bg: '#020403', card: '#0B1A10', accent: '#7CFF9B', ink: '#E8FFE8', font: 'var(--font-jetbrains)' },
    palettes: [{ id: 'default', name: 'Green', hint: '', swatch: ['#020403', '#0B1A10', '#7CFF9B'], scheme: 'dark' }],
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

export function schemeOf(a: Appearance): 'dark' | 'light' {
  const theme = findTheme(a.theme);
  return theme.palettes.find((p) => p.id === a.palette)?.scheme ?? 'dark';
}
