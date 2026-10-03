import type { Metadata } from 'next';
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
