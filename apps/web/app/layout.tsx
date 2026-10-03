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
  title: '21st Club — Build your club',
  description:
    'Build a club from real Premier League players, predict its season, and play every match.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${oswald.variable}`}>
      <body>{children}</body>
    </html>
  );
}
