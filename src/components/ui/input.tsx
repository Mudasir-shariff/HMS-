import { clsx } from 'clsx';
import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';

/* ── Text Input ── */

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-[13px] font-medium text-[var(--text-strong)]"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            'h-11 w-full rounded-[var(--r-control)] bg-white px-3 text-base sm:text-sm text-[var(--text-strong)]',
            'border shadow-2xs transition-all duration-150',
            'placeholder:text-[var(--text-faint)]',
            'focus:outline-none focus:ring-2',
            error
              ? 'border-[var(--danger)] focus:border-[var(--danger)] focus:ring-[rgba(220,38,38,0.25)]'
              : 'border-[var(--line-soft)] focus:border-[var(--green-600)] focus:ring-[rgba(13,148,136,0.25)]',
            className
          )}
          {...props}
        />
        {error && (
          <p className="text-xs font-medium text-[var(--danger)] flex items-center gap-1">{error}</p>
        )}
        {hint && !error && (
          <p className="text-xs text-[var(--text-muted)]">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

/* ── Textarea ── */

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-[13px] font-medium text-[var(--text-strong)]"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={clsx(
            'w-full rounded-[var(--r-control)] bg-white p-3 text-base sm:text-sm text-[var(--text-strong)]',
            'border shadow-2xs transition-all duration-150 resize-y min-h-[88px]',
            'placeholder:text-[var(--text-faint)]',
            'focus:outline-none focus:ring-2',
            error
              ? 'border-[var(--danger)] focus:border-[var(--danger)] focus:ring-[rgba(220,38,38,0.25)]'
              : 'border-[var(--line-soft)] focus:border-[var(--green-600)] focus:ring-[rgba(13,148,136,0.25)]',
            className
          )}
          {...props}
        />
        {error && (
          <p className="text-xs font-medium text-[var(--danger)] flex items-center gap-1">{error}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

/* ── Select ── */

interface SelectProps extends InputHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-[13px] font-medium text-[var(--text-strong)]"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={inputId}
          className={clsx(
            'h-11 w-full rounded-[var(--r-control)] bg-white px-3 text-base sm:text-sm text-[var(--text-strong)]',
            'border shadow-2xs transition-all duration-150 appearance-none',
            'bg-[url("data:image/svg+xml,%3csvg%20xmlns%3d%27http%3a%2f%2fwww.w3.org%2f2000%2fsvg%27%20fill%3d%27none%27%20viewBox%3d%270%200%2020%2020%27%3e%3cpath%20stroke%3d%27%23475569%27%20stroke-linecap%3d%27round%27%20stroke-linejoin%3d%27round%27%20stroke-width%3d%271.5%27%20d%3d%27M6%208l4%204%204-4%27%2f%3e%3c%2fsvg%3e")]',
            'bg-[length:20px_20px] bg-[right_10px_center] bg-no-repeat pr-9 cursor-pointer',
            'focus:outline-none focus:ring-2',
            error
              ? 'border-[var(--danger)] focus:border-[var(--danger)] focus:ring-[rgba(220,38,38,0.25)]'
              : 'border-[var(--line-soft)] focus:border-[var(--green-600)] focus:ring-[rgba(13,148,136,0.25)]',
            className
          )}
          {...(props as React.SelectHTMLAttributes<HTMLSelectElement>)}
        >
          {placeholder && (
            <option value="" className="text-[var(--text-faint)]">
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="text-xs font-medium text-[var(--danger)] flex items-center gap-1">{error}</p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

/* ── Checkbox ── */

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

export function Checkbox({ label, className, id, ...props }: CheckboxProps) {
  const inputId = id || label.toLowerCase().replace(/\s+/g, '-');
  return (
    <label
      htmlFor={inputId}
      className={clsx(
        'inline-flex items-center gap-2.5 cursor-pointer select-none py-0.5',
        className
      )}
    >
      <input
        type="checkbox"
        id={inputId}
        className={clsx(
          'h-5 w-5 rounded-[6px] border border-[var(--line-strong)]',
          'checked:bg-[var(--green-900)] checked:border-[var(--green-900)]',
          'focus:ring-2 focus:ring-[var(--green-600)] focus:ring-offset-2',
          'transition-all duration-150 cursor-pointer accent-[var(--green-900)]'
        )}
        {...props}
      />
      <span className="text-sm font-medium text-[var(--text-strong)]">{label}</span>
    </label>
  );
}

