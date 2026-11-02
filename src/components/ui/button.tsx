import { clsx } from 'clsx';
import { ButtonHTMLAttributes, forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--green-900)] text-white hover:brightness-[0.94] active:brightness-[0.90]',
  secondary:
    'bg-white border border-[var(--line-soft)] text-[var(--text-strong)] hover:bg-[var(--bg-tile)] active:bg-[var(--bg-canvas)]',
  tertiary:
    'bg-transparent text-[var(--text-strong)] hover:bg-[var(--bg-tile)] active:bg-[var(--bg-canvas)]',
  danger:
    'bg-[var(--danger)] text-white hover:brightness-[0.94] active:brightness-[0.90]',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-[var(--r-control)]',
  md: 'h-10 px-4 text-sm rounded-[var(--r-control)]',
  lg: 'h-11 px-5 text-sm rounded-[var(--r-control)]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      icon,
      iconPosition = 'left',
      loading,
      disabled,
      children,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(
          'inline-flex items-center justify-center gap-2 font-medium transition-all duration-150',
          'focus-visible:outline-2 focus-visible:outline-[var(--green-600)] focus-visible:outline-offset-2',
          'disabled:bg-[var(--bg-tile)] disabled:text-[var(--text-faint)] disabled:cursor-not-allowed disabled:border-transparent',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          icon && iconPosition === 'left' && <span className="shrink-0">{icon}</span>
        )}
        {children}
        {!loading && icon && iconPosition === 'right' && (
          <span className="shrink-0">{icon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

