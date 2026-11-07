/**
 * Date utility helpers for Hospital Management System (HMS)
 * Supports 24-hour daily cycle filtering and monthly admin reporting / cleanup
 */

/**
 * Checks if a timestamp is from today (calendar date in local time)
 * OR occurred within the last 24 hours (86,400,000 ms).
 * After 24 hours, consulted/dispensed visits disappear from doctor & pharmacy daily queues.
 */
export function isTodayOrWithin24Hours(dateString?: string | null): boolean {
  if (!dateString) return false;
  const d = new Date(dateString);
  const time = d.getTime();
  if (isNaN(time)) return false;

  const now = Date.now();
  const diff = now - time;

  // Within the last 24 hours (with 60-second forward clock skew tolerance)
  if (diff >= -60000 && diff <= 24 * 60 * 60 * 1000) {
    return true;
  }

  // Same calendar date in local timezone
  const nowDate = new Date();
  return (
    d.getFullYear() === nowDate.getFullYear() &&
    d.getMonth() === nowDate.getMonth() &&
    d.getDate() === nowDate.getDate()
  );
}

/**
 * Checks if a timestamp occurred strictly today in local calendar date
 */
export function isToday(dateString?: string | null): boolean {
  if (!dateString) return false;
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return false;
  const nowDate = new Date();
  return (
    d.getFullYear() === nowDate.getFullYear() &&
    d.getMonth() === nowDate.getMonth() &&
    d.getDate() === nowDate.getDate()
  );
}

/**
 * Checks if a timestamp is older than N days (default 30 days)
 */
export function isOlderThanDays(dateString?: string | null, days: number = 30): boolean {
  if (!dateString) return false;
  const d = new Date(dateString);
  const time = d.getTime();
  if (isNaN(time)) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return time < cutoff;
}

/**
 * Returns YYYY-MM formatted string for a date (defaults to now)
 */
export function getYearMonth(date?: Date | string | null): string {
  const d = date ? new Date(date) : new Date();
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Formats a YYYY-MM into readable month e.g. "November 2026"
 */
export function formatMonthName(yearMonth: string): string {
  if (!yearMonth) return '';
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m) return yearMonth;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

