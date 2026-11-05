import { clsx } from 'clsx';
import { ReactNode } from 'react';

/* ── Stat tile (nested inside a card) ── */

interface StatTileProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  className?: string;
}

export function StatTile({ icon, label, value, className }: StatTileProps) {
  return (
    <div
      className={clsx(
        'bg-[var(--bg-tile)] rounded-[var(--r-tile)] p-4 flex flex-col items-center gap-2',
        className
      )}
    >
      <div className="flex items-center justify-center h-10 w-10 rounded-full border-[1.5px] border-[var(--green-600)] bg-white">
        <span className="text-[var(--green-700)]">{icon}</span>
      </div>
      <p className="text-sm font-medium text-[var(--text-strong)]">{label}</p>
      <p className="text-sm text-[var(--text-muted)]">{value}</p>
    </div>
  );
}

/* ── Avatar ── */

interface AvatarProps {
  name: string;
  imageUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Avatar({ name, imageUrl, size = 'md', className }: AvatarProps) {
  const sizeMap = { sm: 'h-8 w-8 text-xs', md: 'h-9 w-9 text-sm', lg: 'h-10 w-10 text-sm' };
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return imageUrl ? (
    <img
      src={imageUrl}
      alt={name}
      className={clsx('rounded-full object-cover', sizeMap[size], className)}
    />
  ) : (
    <div
      className={clsx(
        'rounded-full flex items-center justify-center',
        'bg-[var(--sage-100)] text-[var(--green-900)] font-medium',
        sizeMap[size],
        className
      )}
    >
      {initials}
    </div>
  );
}

/* ── Empty state ── */

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="flex items-center justify-center h-12 w-12 rounded-full bg-[var(--bg-tile)] text-[var(--text-muted)] mb-3">
        {icon}
      </div>
      <h3 className="text-sm font-medium text-[var(--text-strong)] mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-[var(--text-muted)] max-w-[280px] mb-4">{description}</p>
      )}
      {action}
    </div>
  );
}

/* ── Search input ── */

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Search...', className }: SearchInputProps) {
  return (
    <div className={clsx('relative', className)}>
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-faint)]"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={clsx(
          'h-11 w-full rounded-[var(--r-pill)] bg-white pl-9 pr-3 text-base sm:text-sm',
          'border border-[var(--line-soft)] text-[var(--text-body)]',
          'placeholder:text-[var(--text-faint)]',
          'focus:outline-none focus:border-[var(--green-600)] focus:ring-[3px] focus:ring-[rgba(122,154,95,0.25)]',
          'transition-all duration-150'
        )}
      />
    </div>
  );
}

