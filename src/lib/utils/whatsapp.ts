/**
 * WhatsApp message generation & link utilities for Radha Krishna HMS
 * Powers the Reception Follow-up Management System
 */

import { parseLocalDate, getDaysDifference } from './date';

export interface FollowUpReminderParams {
  patientName: string;
  patientPhone: string;
  uhid: string;
  doctorName: string;
  doctorSpec?: string;
  doctorRoom?: string;
  followUpDate: string;
  hospitalName: string;
  hospitalPhone?: string;
  instructions?: string;
}

/**
 * Builds a professional, personalized WhatsApp reminder for a patient's scheduled follow-up
 */
export function buildFollowUpWhatsAppMessage(params: FollowUpReminderParams): string {
  let formattedDate = params.followUpDate;
  const d = parseLocalDate(params.followUpDate);
  if (d) {
    formattedDate = d.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  const diff = getDaysDifference(params.followUpDate);
  let timingPrefix = `for *${formattedDate}*`;
  if (diff === 1) timingPrefix = `for *tomorrow, ${formattedDate}*`;
  else if (diff === 0) timingPrefix = `for *today, ${formattedDate}*`;
  else if (diff < 0) timingPrefix = `for *${formattedDate}* (missed / overdue)`;

  const hospitalName = params.hospitalName || 'RADHA KRISHNA HOSPITAL';

  return (
    `Namaste *${params.patientName}* ji,\n\n` +
    `This is a gentle reminder from *${hospitalName}*.\n` +
    `Your follow-up consultation with *${params.doctorName}*${params.doctorSpec ? ` (${params.doctorSpec})` : ''} is scheduled ${timingPrefix}.\n\n` +
    `📋 *Consultation Details:*\n` +
    `• Patient: ${params.patientName} (UHID: ${params.uhid})\n` +
    `• Doctor: ${params.doctorName}\n` +
    (params.doctorRoom ? `• Cabin / Room: ${params.doctorRoom}\n` : '') +
    (params.instructions ? `• Doctor Advice: "${params.instructions}"\n` : '') +
    `\n` +
    `🩺 *Patient Guidelines:*\n` +
    `• Please carry your previous prescription and investigation/lab reports.\n` +
    `• For fasting lab tests, please arrive between 08:30 AM – 10:00 AM.\n\n` +
    (params.hospitalPhone ? `For rescheduling or emergency assistance, call ${params.hospitalPhone}.\n\n` : '') +
    `Wishing you good health!\n` +
    `*${hospitalName}*`
  );
}

/**
 * Generates an authentic wa.me link with the pre-filled encoded text
 */
export function generateWhatsAppUrl(phone: string, text: string): string {
  const cleaned = phone.replace(/\D/g, '');
  // Format to 12-digit Indian number 91XXXXXXXXXX
  const finalPhone = cleaned.length === 10 ? `91${cleaned}` : cleaned;
  return `https://wa.me/${finalPhone}?text=${encodeURIComponent(text)}`;
}
