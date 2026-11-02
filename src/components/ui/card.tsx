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
    md: 'p-5 lg:p-6',
    lg: 'p-6 lg:p-8',
  };

  return (
    <div
      className={clsx(
        'bg-[var(--bg-card)] rounded-[var(--r-card)]',
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
    <div className={clsx('flex items-center justify-between mb-4', className)}>
      <div className="flex items-center gap-2">
        <h3 className="text-[20px] leading-[26px] font-medium text-[var(--text-strong)] tracking-[-0.02em]">
          {title}
        </h3>
        {count !== undefined && (
          <span className="inline-flex items-center justify-center h-6 min-w-[24px] px-1.5 rounded-full bg-[var(--bg-tile)] text-xs font-medium text-[var(--text-muted)]">
            {count}
          </span>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

