import { clsx } from 'clsx';
import { ButtonHTMLAttributes, forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger';
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
    'bg-[var(--green-900)] text-white shadow-xs hover:bg-[var(--green-700)] active:bg-[var(--green-900)] active:scale-[0.99] cursor-pointer',
  secondary:
    'bg-white border border-[var(--line-soft)] text-[var(--text-strong)] shadow-xs hover:bg-[var(--bg-tile)] hover:border-[var(--line-strong)] active:bg-[var(--bg-canvas)] active:scale-[0.99] cursor-pointer',
  tertiary:
    'bg-transparent text-[var(--text-strong)] hover:bg-[var(--bg-tile)] active:bg-[var(--bg-canvas)] cursor-pointer',
  ghost:
    'bg-transparent text-[var(--text-strong)] hover:bg-[var(--bg-tile)] active:bg-[var(--bg-canvas)] cursor-pointer',
  danger:
    'bg-[var(--danger)] text-white shadow-xs hover:bg-[#B91C1C] active:bg-[#991B1B] active:scale-[0.99] cursor-pointer',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'min-h-[36px] h-9 px-3 text-xs rounded-[var(--r-control)]',
  md: 'min-h-[42px] h-10 px-4 text-sm rounded-[var(--r-control)]',
  lg: 'min-h-[46px] h-11 px-5 text-sm rounded-[var(--r-control)] font-semibold',
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
          'inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 select-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--green-600)] focus-visible:ring-offset-2',
          'disabled:bg-[var(--bg-tile)] disabled:text-[var(--text-faint)] disabled:cursor-not-allowed disabled:border-transparent disabled:shadow-none disabled:active:scale-100',
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

