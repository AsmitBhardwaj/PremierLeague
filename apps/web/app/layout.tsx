import type { ReactNode } from 'react';

export const metadata = {
  title: 'Premier League Club Builder',
  description: 'Found a 21st Premier League club and build a squad on a budget.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
