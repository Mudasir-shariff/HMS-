'use client';

import { ArrowLeft, Shield, Lock, FileText, Printer, CheckCircle, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-[var(--line-soft)]">
          <Link
            href="/login"
            className="flex items-center gap-2 text-xs font-semibold text-[var(--green-800)] hover:text-[var(--green-950)] transition-colors"
          >
            <ArrowLeft size={16} />
            <span>Back to Login</span>
          </Link>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--r-pill)] bg-white border border-[var(--line-soft)] text-[var(--text-strong)] hover:bg-[var(--bg-tile)] transition-all shadow-xs"
          >
            <Printer size={14} />
            <span>Print Policy</span>
          </button>
        </div>

        {/* Header */}
        <div className="bg-[var(--bg-card)] rounded-[var(--r-card)] p-6 sm:p-8 border border-[var(--line-soft)] shadow-sm mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-[var(--r-control)] bg-[var(--green-700)] text-white flex items-center justify-center shrink-0">
              <Shield size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-strong)] tracking-tight">Privacy Policy</h1>
              <p className="text-xs text-[var(--text-muted)]">
                Radhakrishna Hospital Management System · Effective Date: November 1, 2026
              </p>
            </div>
          </div>
          <p className="text-sm text-[var(--text-body)] leading-relaxed mt-4">
            Radhakrishna Hospital (&quot;we&quot;, &quot;our&quot;, &quot;Hospital&quot;) is committed to upholding the highest standards of confidentiality, integrity, and data protection for all Patient Health Information (PHI) and staff operational records processed through this digital Hospital Management System.
          </p>
        </div>

        {/* Policy Body */}
        <div className="bg-[var(--bg-card)] rounded-[var(--r-card)] p-6 sm:p-8 border border-[var(--line-soft)] shadow-sm space-y-8 text-sm text-[var(--text-body)] leading-relaxed">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-[var(--text-strong)] flex items-center gap-2 border-b border-[var(--line-soft)] pb-2">
              <FileText size={16} className="text-[var(--green-700)]" />
              1. Scope & Categories of Data Collected
            </h2>
            <p>
              In providing healthcare, clinical consultations, pharmacy dispensing, and hospital administration services, our system processes the following data categories:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-[var(--text-body)]">
              <li>
                <strong>Patient Demographic Information:</strong> Full name, age, gender, contact number, permanent residential address, emergency contact, and unique hospital identifier (UHID).
              </li>
              <li>
                <strong>Clinical & Medical History:</strong> Vital signs (blood pressure, blood glucose, temperature, pulse), comorbid conditions, past clinical histories, physician consultation notes, diagnostic assessments, and medical certificates.
              </li>
              <li>
                <strong>Pharmacological & Dispensing Records:</strong> Prescribed medications, dosage instructions, duration, dispensed batches, and statutory Schedule H and Schedule H1 antibiotic registries.
              </li>
              <li>
                <strong>Inpatient (IP) Admission Records:</strong> Bed allocations, daily nurse round records, admission and discharge summaries, and inpatient stay duration logs.
              </li>
              <li>
                <strong>Authorized Staff Credentials:</strong> Name, professional medical registration license number (e.g., KMC), clinical specialization, authorized role, and role-based activity audit logs.
              </li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-[var(--text-strong)] flex items-center gap-2 border-b border-[var(--line-soft)] pb-2">
              <Lock size={16} className="text-[var(--green-700)]" />
              2. Purpose of Data Processing
            </h2>
            <p>
              All personal and health information collected through this system is processed strictly for legitimate healthcare and hospital management purposes, including:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm text-[var(--text-body)]">
              <li>Facilitating continuous outpatient consultations and token sequencing.</li>
              <li>Ensuring accurate prescription dispensing and drug inventory safety.</li>
              <li>Coordinating inpatient bed occupancy and discharge management.</li>
              <li>Sending automated WhatsApp/SMS token status and follow-up appointment alerts.</li>
              <li>Complying with statutory drug control mandates and clinical documentation laws.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-[var(--text-strong)] flex items-center gap-2 border-b border-[var(--line-soft)] pb-2">
              <CheckCircle size={16} className="text-[var(--green-700)]" />
              3. Role-Based Access Controls (RBAC) & Confidentiality
            </h2>
            <p>
              Access to patient records is strictly governed by institutional role separation:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
              <div className="p-3 rounded-[var(--r-tile)] bg-[var(--bg-tile)] border border-[var(--line-soft)]">
                <p className="font-semibold text-[var(--text-strong)] mb-1">Consultant Doctors</p>
                <p className="text-[var(--text-muted)]">
                  Authorized to examine assigned patient vitals, review medical histories, record diagnoses, and issue clinical prescriptions.
                </p>
              </div>
              <div className="p-3 rounded-[var(--r-tile)] bg-[var(--bg-tile)] border border-[var(--line-soft)]">
                <p className="font-semibold text-[var(--text-strong)] mb-1">Pharmacists</p>
                <p className="text-[var(--text-muted)]">
                  Access restricted to prescribed drug names, quantities, and dosage instructions for dispensing and batch stock decrements.
                </p>
              </div>
              <div className="p-3 rounded-[var(--r-tile)] bg-[var(--bg-tile)] border border-[var(--line-soft)]">
                <p className="font-semibold text-[var(--text-strong)] mb-1">Reception Staff</p>
                <p className="text-[var(--text-muted)]">
                  Manage patient demographic registrations, assign OPD tokens, and monitor clinic waiting queues without clinical note editing rights.
                </p>
              </div>
              <div className="p-3 rounded-[var(--r-tile)] bg-[var(--bg-tile)] border border-[var(--line-soft)]">
                <p className="font-semibold text-[var(--text-strong)] mb-1">Hospital Administrators</p>
                <p className="text-[var(--text-muted)]">
                  Oversee system configuration, hospital pricing, formulary inventory, and authorized staff accounts.
                </p>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-[var(--text-strong)] flex items-center gap-2 border-b border-[var(--line-soft)] pb-2">
              <AlertCircle size={16} className="text-[var(--green-700)]" />
              4. Data Retention & Patient Rights
            </h2>
            <p>
              Medical records are preserved in accordance with applicable medical council regulations and statutory health records retention policies. Patients or their authorized legal representatives have the right to:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm text-[var(--text-body)]">
              <li>Inspect and receive physical or digital copies of their prescriptions and discharge summaries.</li>
              <li>Request corrections of inaccurate demographic contact details.</li>
              <li>Receive transparent communication regarding how their health data is stored and utilized.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-[var(--text-strong)] flex items-center gap-2 border-b border-[var(--line-soft)] pb-2">
              <Shield size={16} className="text-[var(--green-700)]" />
              5. Data Protection Officer & Grievance Contact
            </h2>
            <p>
              For inquiries, access requests, or privacy concerns regarding health information managed by Radhakrishna Hospital, please contact our administration desk:
            </p>
            <div className="p-4 rounded-[var(--r-tile)] bg-[var(--bg-tile)] border border-[var(--line-soft)] text-xs space-y-1">
              <p className="font-semibold text-[var(--text-strong)]">Radhakrishna Hospital Grievance & Compliance Desk</p>
              <p className="text-[var(--text-body)]">Ward No. 10, Near Rama Mandir Road, NR Extension, Chintamani, Karnataka - 563125</p>
              <p className="text-[var(--text-body)]">Phone: +91 8154 252222 · Email: privacy@radhakrishnahospital.com</p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-xs text-[var(--text-muted)]">
          <p>© 2026 Radhakrishna Hospital. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

