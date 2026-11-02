import { clsx } from 'clsx';

type StatusVariant = 'info' | 'success' | 'danger' | 'warning';

interface StatusPillProps {
  variant: StatusVariant;
  label: string;
  className?: string;
}

const variants: Record<StatusVariant, { dot: string; bg: string; text: string }> = {
  info: {
    dot: 'bg-[var(--info)]',
    bg: 'bg-[var(--info-bg)]',
    text: 'text-[#2A7BA8]',
  },
  success: {
    dot: 'bg-[var(--success)]',
    bg: 'bg-[var(--success-bg)]',
    text: 'text-[#3A7A2E]',
  },
  danger: {
    dot: 'bg-[var(--danger)]',
    bg: 'bg-[var(--danger-bg)]',
    text: 'text-[#C03028]',
  },
  warning: {
    dot: 'bg-[var(--warning)]',
    bg: 'bg-[var(--warning-bg)]',
    text: 'text-[#8A6520]',
  },
};

export function StatusPill({ variant, label, className }: StatusPillProps) {
  const v = variants[variant];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 h-6 px-2.5 rounded-[var(--r-pill)]',
        'text-xs font-medium whitespace-nowrap',
        v.bg,
        v.text,
        className
      )}
    >
      <span className={clsx('h-1.5 w-1.5 rounded-full', v.dot)} />
      {label}
    </span>
  );
}

