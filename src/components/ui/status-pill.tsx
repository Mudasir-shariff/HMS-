import { clsx } from 'clsx';

type StatusVariant = 'info' | 'success' | 'danger' | 'warning';

interface StatusPillProps {
  variant: StatusVariant;
  label: string;
  className?: string;
}

const variants: Record<StatusVariant, { dot: string; bg: string; text: string }> = {
  info: {
    dot: 'bg-[#0284C7]',
    bg: 'bg-[#F0F9FF] border border-[#BAE6FD]',
    text: 'text-[#075985]',
  },
  success: {
    dot: 'bg-[#059669]',
    bg: 'bg-[#ECFDF5] border border-[#A7F3D0]',
    text: 'text-[#065F46]',
  },
  danger: {
    dot: 'bg-[#DC2626]',
    bg: 'bg-[#FEF2F2] border border-[#FECACA]',
    text: 'text-[#991B1B]',
  },
  warning: {
    dot: 'bg-[#D97706]',
    bg: 'bg-[#FFFBEB] border border-[#FDE68A]',
    text: 'text-[#92400E]',
  },
};

export function StatusPill({ variant, label, className }: StatusPillProps) {
  const v = variants[variant];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 h-6 px-2.5 rounded-[var(--r-pill)]',
        'text-xs font-semibold whitespace-nowrap shadow-2xs',
        v.bg,
        v.text,
        className
      )}
    >
      <span className={clsx('h-1.5 w-1.5 rounded-full shrink-0', v.dot)} />
      {label}
    </span>
  );
}

