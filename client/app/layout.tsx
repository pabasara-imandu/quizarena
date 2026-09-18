import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Sans_Sinhala, Outfit } from 'next/font/google';
import './globals.css';
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
      className={sans.variable + ' ' + display.variable + ' ' + sinhala.variable}
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
