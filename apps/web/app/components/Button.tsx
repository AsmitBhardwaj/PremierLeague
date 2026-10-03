import Link from 'next/link';
import type { ReactNode } from 'react';

interface ButtonProps {
  children: ReactNode;
  href: string;
  variant?: 'primary' | 'secondary';
  size?: 'default' | 'small';
  className?: string;
}

export function Button({
  children,
  href,
  variant = 'primary',
  size = 'default',
  className = '',
}: ButtonProps) {
  return (
    <Link className={`button button-${variant} button-${size} ${className}`.trim()} href={href}>
      {children}
      <span aria-hidden="true">↗</span>
    </Link>
  );
}
