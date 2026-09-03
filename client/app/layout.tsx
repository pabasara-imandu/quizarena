import type { Metadata, Viewport } from 'next';
import { Inter, Outfit } from 'next/font/google';
import './globals.css';
import { SocketProvider } from '@/lib/socket';

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
    <html lang="en" className={sans.variable + ' ' + display.variable}>
      <body className="min-h-screen font-sans">
        <SocketProvider>{children}</SocketProvider>
      </body>
    </html>
  );
}
