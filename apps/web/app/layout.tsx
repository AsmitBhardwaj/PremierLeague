import type { Metadata, Viewport } from 'next';
import { Archivo, Oswald } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-archivo',
  display: 'swap',
});

const oswald = Oswald({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-oswald',
  display: 'swap',
});

/** `cover` lets the phone CTA bar respect safe-area insets via env(). */
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export const metadata: Metadata = {
  title: '21st Club — A football career mode in your browser',
  description:
    'A football career mode you play in your browser. Found a club, sign real Premier League players, play the season. Free, no download.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${oswald.variable}`}>
      <body>{children}</body>
    </html>
  );
}
