import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /**
         * Surfaces run near-black to charcoal with a faint blue cast. Steps are
         * deliberately close together - depth comes from soft elevation, not
         * from hard borders around everything.
         */
        ink: {
          950: '#07070C',
          900: '#0B0B12',
          850: '#10101A',
          800: '#161622',
          700: '#1F1F2E',
          600: '#2B2B3D',
          500: '#3A3A50',
        },
        /** One accent. Everything interactive is this violet; nothing else is. */
        brand: {
          200: '#D3CCFF',
          300: '#B3A6FF',
          400: '#9484FF',
          500: '#7562F5',
          600: '#5C49DC',
          700: '#4736B4',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-rounded', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(0,0,0,0.3), 0 8px 24px -12px rgba(0,0,0,0.6)',
        lift: '0 2px 4px rgba(0,0,0,0.3), 0 20px 40px -16px rgba(0,0,0,0.7)',
        glow: '0 0 0 1px rgba(117,98,245,0.35), 0 12px 32px -12px rgba(117,98,245,0.5)',
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
