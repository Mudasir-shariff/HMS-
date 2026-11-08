/**
 * Validation utilities for Radha Krishna HMS
 * Strictly enforces Indian mobile numbers (10 digits starting with 6-9) and valid emails.
 */

/**
 * Strips formatting, country code prefixes (+91, 91), and leading zeros from phone inputs.
 */
export function cleanIndianPhone(rawPhone?: string | null): string {
  if (!rawPhone) return '';
  let cleaned = String(rawPhone).replace(/\D/g, '');

  // Strip international Indian dialing prefix (91XXXXXXXXXX -> XXXXXXXXXX)
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    cleaned = cleaned.slice(2);
  }

  // Strip standard trunk prefix (0XXXXXXXXXX -> XXXXXXXXXX)
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1);
  }

  return cleaned;
}

/**
 * Validates that a phone number is an authentic 10-digit Indian mobile number.
 * Valid numbers are exactly 10 digits and begin with 6, 7, 8, or 9.
 */
export function isValidIndianPhone(phone?: string | null): boolean {
  if (!phone) return false;
  const cleaned = cleanIndianPhone(phone);
  return /^[6-9]\d{9}$/.test(cleaned);
}

/**
 * Formats a phone number for clean clinical display (e.g. "98765 43210").
 * Sanitizes stray characters or legacy bad entries.
 */
export function formatPhoneDisplay(phone?: string | null): string {
  if (!phone) return '—';
  const cleaned = cleanIndianPhone(phone);
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return `${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  // Return cleaned or trimmed original without spaces/letters if malformed
  return cleaned.slice(0, 10) || phone.trim();
}

/**
 * Validates email addresses against standard RFC-compliant patterns.
 */
export function isValidEmail(email?: string | null): boolean {
  if (!email) return false;
  const trimmed = email.trim().toLowerCase();
  // Standard RFC 5322 simplified regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(trimmed);
}
