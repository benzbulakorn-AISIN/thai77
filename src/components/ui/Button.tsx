import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: ReactNode;
};

const styles = {
  primary: 'bg-primary text-on-primary hover:opacity-90',
  secondary: 'border border-primary text-primary bg-transparent',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

export function Button({ variant = 'primary', icon, className = '', children, type = 'button', ...rest }: Props) {
  return (
    <button type={type} {...rest}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 font-medium
        transition disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2
        focus-visible:outline-primary ${styles[variant]} ${className}`}>
      {icon}{children}
    </button>
  );
}
