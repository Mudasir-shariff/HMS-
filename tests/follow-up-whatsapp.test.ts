import { describe, it, expect } from 'vitest';
import {
  getDaysDifference,
  categorizeFollowUpDate,
  formatFollowUpDisplay,
  parseLocalDate,
} from '../src/lib/utils/date';
import {
  buildFollowUpWhatsAppMessage,
  generateWhatsAppUrl,
} from '../src/lib/utils/whatsapp';

describe('Follow-up Date Helpers', () => {
  function getOffsetDateStr(offsetDays: number): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  it('correctly calculates days difference for today, tomorrow, yesterday, and future', () => {
    const todayStr = getOffsetDateStr(0);
    const tomorrowStr = getOffsetDateStr(1);
    const yesterdayStr = getOffsetDateStr(-1);
    const nextWeekStr = getOffsetDateStr(7);

    expect(getDaysDifference(todayStr)).toBe(0);
    expect(getDaysDifference(tomorrowStr)).toBe(1);
    expect(getDaysDifference(yesterdayStr)).toBe(-1);
    expect(getDaysDifference(nextWeekStr)).toBe(7);
    expect(getDaysDifference(null)).toBe(999);
    expect(getDaysDifference('')).toBe(999);
  });

  it('correctly categorizes follow-up appointments', () => {
    expect(categorizeFollowUpDate(getOffsetDateStr(1))).toBe('tomorrow');
    expect(categorizeFollowUpDate(getOffsetDateStr(0))).toBe('today');
    expect(categorizeFollowUpDate(getOffsetDateStr(4))).toBe('upcoming');
    expect(categorizeFollowUpDate(getOffsetDateStr(10))).toBe('later');
    expect(categorizeFollowUpDate(getOffsetDateStr(-2))).toBe('overdue');
  });

  it('formats follow-up display labels with context', () => {
    const tomorrow = getOffsetDateStr(1);
    const today = getOffsetDateStr(0);
    const overdue = getOffsetDateStr(-3);

    expect(formatFollowUpDisplay(tomorrow)).toContain('Tomorrow');
    expect(formatFollowUpDisplay(today)).toContain('Today');
    expect(formatFollowUpDisplay(overdue)).toContain('3 days overdue');
    expect(formatFollowUpDisplay(null)).toBe('—');
  });

  it('parses YYYY-MM-DD cleanly without timezone jitter', () => {
    const parsed = parseLocalDate('2026-11-09');
    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(10); // 0-indexed November
    expect(parsed?.getDate()).toBe(9);
  });
});

describe('WhatsApp Follow-up Message Generator', () => {
  it('builds a personalized WhatsApp reminder message', () => {
    const tomorrowStr = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();

    const message = buildFollowUpWhatsAppMessage({
      patientName: 'Ramesh Patel',
      patientPhone: '9876543210',
      uhid: 'UHID-2026-0042',
      doctorName: 'Dr. Priya Sharma',
      doctorSpec: 'Cardiologist',
      doctorRoom: 'Cabin 3',
      followUpDate: tomorrowStr,
      hospitalName: 'Radha Krishna Multispeciality Hospital',
      hospitalPhone: '+91 80 2345 6789',
      instructions: 'Fast for 10 hours before lipid profile test',
    });

    expect(message).toContain('Namaste *Ramesh Patel* ji');
    expect(message).toContain('Radha Krishna Multispeciality Hospital');
    expect(message).toContain('*Dr. Priya Sharma* (Cardiologist)');
    expect(message).toContain('tomorrow');
    expect(message).toContain('Cabin 3');
    expect(message).toContain('Fast for 10 hours before lipid profile test');
    expect(message).toContain('UHID-2026-0042');
    expect(message).toContain('+91 80 2345 6789');
  });

  it('generates a valid wa.me URL with 12-digit Indian country code and encoded text', () => {
    const url = generateWhatsAppUrl('9876543210', 'Namaste Ramesh ji');
    expect(url).toBe('https://wa.me/919876543210?text=Namaste%20Ramesh%20ji');

    // Strips spaces, dashes, +91 prefix
    const url2 = generateWhatsAppUrl('+91 98765-43210', 'Hello Test');
    expect(url2).toBe('https://wa.me/919876543210?text=Hello%20Test');
  });
});
