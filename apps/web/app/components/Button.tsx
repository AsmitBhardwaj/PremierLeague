import Link from 'next/link';
import type { ReactNode } from 'react';

interface ButtonProps {
  children: ReactNode;
  href: string;
  variant?: 'primary' | 'secondary';
  size?: 'default' | 'small';
}

export function Button({ children, href, variant = 'primary', size = 'default' }: ButtonProps) {
  return (
    <Link className={`button button-${variant} button-${size}`} href={href}>
      {children}
      <span aria-hidden="true">↗</span>
    </Link>
  );
}
