import type { Metadata, Viewport } from 'next';
import {
  Caveat,
  Fredoka,
  Inter,
  JetBrains_Mono,
  Libre_Baskerville,
  Noto_Sans_Sinhala,
  Nunito,
  Outfit,
  Patrick_Hand,
  Press_Start_2P,
  VT323,
} from 'next/font/google';
import './globals.css';
import './themes.css';
import { SocketProvider } from '@/lib/socket';
import { LanguageProvider } from '@/lib/i18n';
import { APPEARANCE_BOOT_SCRIPT, ThemeProvider } from '@/lib/theme';

// Outfit for display (geometric, friendly, reads well huge on a projector),
// Inter for everything else. Both self-hosted by next/font - no render-blocking
// request to Google on a school network.
const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const display = Outfit({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['600', '700', '800'],
  display: 'swap',
});
// Neither of those has a Sinhala glyph. This sits last in both font stacks,
// so a browser reaches for it only for the characters the others lack - Latin
// text keeps its face, Sinhala text gets a proper one instead of whatever the
// phone has installed. Not preloaded: an English visitor never downloads it.
const sinhala = Noto_Sans_Sinhala({
  subsets: ['sinhala'],
  variable: '--font-sinhala',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  preload: false,
});

/**
 * The faces the other themes wear. Declared here so next/font self-hosts
 * them, but none is preloaded: a browser fetches a font file only when text
 * on the page actually uses that family, so a device on Aurora downloads
 * none of these. Each theme's CSS block points --font-display and
 * --font-sans at the pair it wants.
 */
// next/font reads these calls at build time, so every option is written out
// literally - no shared object, no spread.
const caveat = Caveat({ subsets: ['latin'], weight: ['500', '700'], variable: '--font-caveat', display: 'swap', preload: false });
const patrick = Patrick_Hand({ subsets: ['latin'], weight: '400', variable: '--font-patrick', display: 'swap', preload: false });
const pressStart = Press_Start_2P({ subsets: ['latin'], weight: '400', variable: '--font-press', display: 'swap', preload: false });
const vt323 = VT323({ subsets: ['latin'], weight: '400', variable: '--font-vt', display: 'swap', preload: false });
const baskerville = Libre_Baskerville({ subsets: ['latin'], weight: ['400', '700'], style: ['normal', 'italic'], variable: '--font-baskerville', display: 'swap', preload: false });
const fredoka = Fredoka({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-fredoka', display: 'swap', preload: false });
const nunito = Nunito({ subsets: ['latin'], weight: ['500', '700', '800'], variable: '--font-nunito', display: 'swap', preload: false });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-jetbrains', display: 'swap', preload: false });

const themeFontClasses = [caveat, patrick, pressStart, vt323, baskerville, fredoka, nunito, jetbrains]
  .map((f) => f.variable)
  .join(' ');

export const metadata: Metadata = {
  title: 'QuizArena — live classroom quizzing',
  description: 'Host real-time quizzes for a whole class, with live scoring and integrity checks.',
};

export const viewport: Viewport = {
  themeColor: '#07070C',
  width: 'device-width',
  initialScale: 1,
  // Students play on phones; a stray double-tap must not zoom the answer grid
  // out from under someone's thumb mid-question.
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the boot script below writes data-theme and
    // data-palette onto <html> before React arrives, so the attributes the
    // server rendered and the ones React finds differ on purpose.
    <html
      lang="en"
      className={sans.variable + ' ' + display.variable + ' ' + sinhala.variable + ' ' + themeFontClasses}
      suppressHydrationWarning
    >
      <head>
        {/* Reads the device's saved palette and applies it before the first
            paint. Without this a Daylight device would flash Midnight on
            every load, which is worse than no theme at all. */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans">
        <ThemeProvider>
          <LanguageProvider>
            <SocketProvider>{children}</SocketProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
