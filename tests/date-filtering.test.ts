import { describe, it, expect } from 'vitest';
import { isTodayOrWithin24Hours, isToday, isOlderThanDays, getYearMonth, formatMonthName } from '../src/lib/utils/date';

describe('Date utility and 24-hour cycle filtering', () => {
  it('identifies events within the last 24 hours as true', () => {
    const justNow = new Date().toISOString();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();

    expect(isTodayOrWithin24Hours(justNow)).toBe(true);
    expect(isTodayOrWithin24Hours(twoHoursAgo)).toBe(true);
    expect(isTodayOrWithin24Hours(twentyThreeHoursAgo)).toBe(true);
  });

  it('identifies events older than 25 hours on a previous day as false', () => {
    const twentySixHoursAgo = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    expect(isTodayOrWithin24Hours(twentySixHoursAgo)).toBe(false);
    expect(isTodayOrWithin24Hours(sevenDaysAgo)).toBe(false);
    expect(isTodayOrWithin24Hours(oneMonthAgo)).toBe(false);
  });

  it('handles null, undefined, and empty string safely', () => {
    expect(isTodayOrWithin24Hours(null)).toBe(false);
    expect(isTodayOrWithin24Hours(undefined)).toBe(false);
    expect(isTodayOrWithin24Hours('')).toBe(false);
    expect(isTodayOrWithin24Hours('invalid-date')).toBe(false);
  });

  it('correctly detects dates older than N days', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();

    expect(isOlderThanDays(tenDaysAgo, 30)).toBe(false);
    expect(isOlderThanDays(fortyDaysAgo, 30)).toBe(true);
  });

  it('extracts year-month format YYYY-MM correctly', () => {
    expect(getYearMonth('2026-11-05T10:00:00Z')).toBe('2026-11');
    expect(formatMonthName('2026-11')).toContain('November 2026');
  });
});

