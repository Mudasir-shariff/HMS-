import { describe, it, expect } from 'vitest';
import { cleanIndianPhone, isValidIndianPhone, formatPhoneDisplay, isValidEmail } from '../src/lib/utils/validation';
import { recordAuditLog, getLocalAuditLogs } from '../src/lib/audit/logger';

describe('Indian Phone Validation & Sanitization', () => {
  it('accepts valid 10-digit Indian mobile numbers starting with 6, 7, 8, or 9', () => {
    expect(isValidIndianPhone('9876543210')).toBe(true);
    expect(isValidIndianPhone('8123456789')).toBe(true);
    expect(isValidIndianPhone('7000000000')).toBe(true);
    expect(isValidIndianPhone('6999999999')).toBe(true);
  });

  it('sanitizes phone numbers with country prefix (+91), spaces, and hyphens', () => {
    expect(cleanIndianPhone('+91 98765 43210')).toBe('9876543210');
    expect(cleanIndianPhone('+91-98765-43210')).toBe('9876543210');
    expect(cleanIndianPhone('09876543210')).toBe('9876543210');
    expect(cleanIndianPhone('98765 43210')).toBe('9876543210');
    expect(isValidIndianPhone('+91 98765-43210')).toBe(true);
  });

  it('rejects invalid inputs such as alphanumeric text, stray trailing digits, or wrong leading digit', () => {
    // Alphanumeric text reported by user
    expect(isValidIndianPhone('423422rwrwr')).toBe(false);
    expect(cleanIndianPhone('423422rwrwr')).toBe('423422');

    // Stray extra 0 or 11 digits
    expect(isValidIndianPhone('98765432100')).toBe(false);

    // Too short (under 10 digits)
    expect(isValidIndianPhone('98765')).toBe(false);
    expect(isValidIndianPhone('')).toBe(false);

    // Starts with 0, 1, 2, 3, 4, 5
    expect(isValidIndianPhone('5876543210')).toBe(false);
    expect(isValidIndianPhone('0876543210')).toBe(false);
    expect(isValidIndianPhone('1234567890')).toBe(false);
  });

  it('formats phone numbers nicely for UI display', () => {
    expect(formatPhoneDisplay('9876543210')).toBe('98765 43210');
    expect(formatPhoneDisplay('+919876543210')).toBe('98765 43210');
  });
});

describe('RFC-Compliant Email Validation', () => {
  it('accepts valid email addresses', () => {
    expect(isValidEmail('staff@hospital.com')).toBe(true);
    expect(isValidEmail('dr.smith@hms.org')).toBe(true);
    expect(isValidEmail('admin+opd@hospital.in')).toBe(true);
    expect(isValidEmail('hello@opti-x.in')).toBe(true);
  });

  it('rejects malformed email addresses', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('plainaddress')).toBe(false);
    expect(isValidEmail('missing@domain')).toBe(false);
    expect(isValidEmail('@nodomain.com')).toBe(false);
    expect(isValidEmail('spaces in@address.com')).toBe(false);
  });
});

describe('Audit Logging System', () => {
  it('records an audit log with action, actor, timestamp, and details', () => {
    const log = recordAuditLog({
      action: 'USER_LOGIN',
      entity_type: 'auth',
      user_name: 'Dr. Ramesh Gupta',
      user_role: 'doctor',
      details: 'Consultant signed into OPD terminal',
      new_data: { loginTime: '2026-11-08' },
    });

    expect(log).toBeDefined();
    expect(log.id).toBeDefined();
    expect(log.action).toBe('USER_LOGIN');
    expect(log.user_name).toBe('Dr. Ramesh Gupta');
    expect(log.user_role).toBe('doctor');
    expect(log.details).toBe('Consultant signed into OPD terminal');
    expect(log.created_at).toBeDefined();
  });
});
