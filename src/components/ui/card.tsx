import { clsx } from 'clsx';
import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
}

export function Card({ children, className, padding = 'md' }: CardProps) {
  const paddingStyles = {
    sm: 'p-4',
    md: 'p-5 sm:p-6',
    lg: 'p-6 sm:p-8',
  };

  return (
    <div
      className={clsx(
        'bg-[var(--bg-card)] border border-[var(--line-soft)] rounded-[var(--r-card)] shadow-[var(--shadow-card)] transition-shadow duration-150',
        paddingStyles[padding],
        className
      )}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  count?: number;
  action?: ReactNode;
  className?: string;
}

export function CardHeader({ title, count, action, className }: CardHeaderProps) {
  return (
    <div className={clsx('flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4', className)}>
      <div className="flex items-center gap-2">
        <h3 className="text-base sm:text-lg font-semibold text-[var(--text-strong)] tracking-tight font-[family-name:var(--font-heading)]">
          {title}
        </h3>
        {count !== undefined && (
          <span className="inline-flex items-center justify-center h-5 sm:h-6 min-w-[22px] px-2 rounded-full bg-[var(--sage-100)] border border-[var(--sage-200)] text-xs font-bold text-[var(--green-900)] tabular-nums">
            {count}
          </span>
        )}
      </div>
      {action && <div className="w-full sm:w-auto">{action}</div>}
    </div>
  );
}

