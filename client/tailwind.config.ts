import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /**
         * Every colour a palette can change is a CSS variable, set per
         * `[data-palette]` in globals.css. Tailwind only needs the names;
         * `<alpha-value>` keeps `bg-ink-950/95` and friends working.
         *
         * Surfaces run near-black to charcoal in the dark palettes and paper
         * to grey in the light one - steps deliberately close together, so
         * depth comes from soft elevation, not hard borders.
         */
        ink: {
          950: 'rgb(var(--ink-950) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          850: 'rgb(var(--ink-850) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
        },
        /** One accent. Everything interactive is this colour; nothing else is. */
        brand: {
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
        },
        /** Text on a brand-coloured fill: white on violet, near-black on yellow. */
        onbrand: 'rgb(var(--on-brand) / <alpha-value>)',
        /**
         * The text scale. Named `slate` so the hundred-odd `text-slate-400`s
         * in the components keep meaning "secondary text" - in a light
         * palette the scale simply runs the other way.
         */
        slate: {
          100: 'rgb(var(--fg-100) / <alpha-value>)',
          200: 'rgb(var(--fg-200) / <alpha-value>)',
          300: 'rgb(var(--fg-300) / <alpha-value>)',
          400: 'rgb(var(--fg-400) / <alpha-value>)',
          500: 'rgb(var(--fg-500) / <alpha-value>)',
          600: 'rgb(var(--fg-600) / <alpha-value>)',
          700: 'rgb(var(--fg-700) / <alpha-value>)',
        },
        /**
         * The tint that surfaces, borders, dividers and hover states are
         * made of: a few percent of white on a dark page, of ink on a light
         * one. `bg-mist/[0.05]` reads the same in every palette.
         */
        mist: 'rgb(var(--mist) / <alpha-value>)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'var(--font-sinhala)', 'ui-rounded', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'var(--font-sinhala)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(0,0,0,0.3), 0 8px 24px -12px rgba(0,0,0,0.6)',
        lift: '0 2px 4px rgba(0,0,0,0.3), 0 20px 40px -16px rgba(0,0,0,0.7)',
        glow: '0 0 0 1px rgb(var(--brand-500) / 0.35), 0 12px 32px -12px rgb(var(--brand-500) / 0.5)',
      },
      keyframes: {
        pop: {
          '0%': { transform: 'scale(0.94)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        rise: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        breathe: { '0%,100%': { opacity: '0.45' }, '50%': { opacity: '1' } },
        slideIn: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        sweep: { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(200%)' } },
      },
      animation: {
        pop: 'pop 240ms cubic-bezier(0.2, 0.9, 0.3, 1.15) both',
        rise: 'rise 280ms cubic-bezier(0.2, 0.8, 0.3, 1) both',
        breathe: 'breathe 1.6s ease-in-out infinite',
        slideIn: 'slideIn 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        fadeIn: 'fadeIn 180ms ease-out both',
        sweep: 'sweep 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
export default config;
