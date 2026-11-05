interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-[var(--text-strong)] leading-tight break-words font-[family-name:var(--font-heading)]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-0.5 sm:mt-1 leading-relaxed line-clamp-2 sm:line-clamp-none">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2 flex-wrap sm:flex-nowrap w-full sm:w-auto">{action}</div>}
    </div>
  );
}

