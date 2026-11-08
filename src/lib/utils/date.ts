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

/**
 * Safely parses a date string into a local midnight Date object,
 * avoiding timezone offset shifts when parsing YYYY-MM-DD strings.
 */
export function parseLocalDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const y = parseInt(match[1], 10);
    const m = parseInt(match[2], 10) - 1;
    const d = parseInt(match[3], 10);
    return new Date(y, m, d);
  }
  const dt = new Date(dateStr);
  return isNaN(dt.getTime()) ? null : new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/**
 * Calculates calendar days difference between today and a target date (e.g. follow-up).
 * Positive means future, 0 is today, negative is past/overdue.
 */
export function getDaysDifference(targetDateStr?: string | null): number {
  if (!targetDateStr) return 999;
  const target = parseLocalDate(targetDateStr);
  if (!target) return 999;

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const targetMidnight = target.getTime();

  return Math.round((targetMidnight - todayMidnight) / (1000 * 60 * 60 * 24));
}

export type FollowUpCategory = 'tomorrow' | 'today' | 'upcoming' | 'overdue' | 'later';

/**
 * Categorizes a follow-up date into:
 * - 'tomorrow': target is exactly 1 day ahead (day before appointment: key reminder day)
 * - 'today': target is today
 * - 'upcoming': within 2 to 7 days
 * - 'overdue': in the past
 * - 'later': more than 7 days ahead
 */
export function categorizeFollowUpDate(dateStr?: string | null): FollowUpCategory {
  const diff = getDaysDifference(dateStr);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff <= 7) return 'upcoming';
  return 'later';
}

/**
 * Formats a follow up date string nicely, e.g. "Tomorrow, Mon, 09 Nov" or "Today" or "14 Nov 2026"
 */
export function formatFollowUpDisplay(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const diff = getDaysDifference(dateStr);
  const target = parseLocalDate(dateStr);
  if (!target) return dateStr;

  const formattedDate = target.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  if (diff === 0) return `Today (${formattedDate})`;
  if (diff === 1) return `Tomorrow (${formattedDate})`;
  if (diff === -1) return `Yesterday (${formattedDate})`;
  if (diff < -1) return `${Math.abs(diff)} days overdue (${formattedDate})`;
  return formattedDate;
}

