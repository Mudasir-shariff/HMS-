'use client';

import { ArrowLeft, FileCheck, Shield, AlertTriangle, Printer, CheckCircle, Scale } from 'lucide-react';
import Link from 'next/link';

export default function TermsAndConditionsPage() {
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
            <span>Print Terms</span>
          </button>
        </div>

        {/* Header */}
        <div className="bg-[var(--bg-card)] rounded-[var(--r-card)] p-6 sm:p-8 border border-[var(--line-soft)] shadow-sm mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-[var(--r-control)] bg-[var(--green-700)] text-white flex items-center justify-center shrink-0">
              <Scale size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-strong)] tracking-tight">Terms and Conditions</h1>
              <p className="text-xs text-[var(--text-muted)]">
                Radhakrishna Hospital Management System · Effective Date: November 1, 2026
              </p>
            </div>
          </div>
          <p className="text-sm text-[var(--text-body)] leading-relaxed mt-4">
            These Terms and Conditions govern authorized access to and clinical/operational usage of the Radhakrishna Hospital Management System (&quot;System&quot;). By creating a staff account, signing in, or entering patient data, you agree to comply with and be bound by these institutional terms.
          </p>
        </div>

        {/* Terms Body */}
        <div className="bg-[var(--bg-card)] rounded-[var(--r-card)] p-6 sm:p-8 border border-[var(--line-soft)] shadow-sm space-y-8 text-sm text-[var(--text-body)] leading-relaxed">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-[var(--text-strong)] flex items-center gap-2 border-b border-[var(--line-soft)] pb-2">
              <FileCheck size={16} className="text-[var(--green-700)]" />
              1. Authorized User Eligibility & Credential Security
            </h2>
            <p>
              Access to this platform is restricted exclusively to authenticated medical practitioners, registered nurses, licensed pharmacists, reception coordinators, and designated hospital administrators affiliated with Radhakrishna Hospital.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-[var(--text-body)]">
              <li>
                <strong>Individual Accountability:</strong> Every user is solely responsible for all clinical entries, prescriptions, dispensing validations, and status changes executed under their credentials.
              </li>
              <li>
                <strong>Credential Confidentiality:</strong> Account passwords and access tokens must never be shared, posted, or transferred to unauthorized personnel.
              </li>
              <li>
                <strong>Immediate Notification:</strong> Any suspicion of compromised credentials or unauthorized system entry must be reported immediately to hospital administration.
              </li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-[var(--text-strong)] flex items-center gap-2 border-b border-[var(--line-soft)] pb-2">
              <AlertTriangle size={16} className="text-[var(--green-700)]" />
              2. Clinical Disclaimers & Professional Medical Judgment
            </h2>
            <p>
              The System functions as an assistive administrative, diagnostic recording, and dispensing coordination platform.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-[var(--text-body)]">
              <li>
                <strong>Primary Medical Responsibility:</strong> The attending licensed medical doctor maintains ultimate clinical autonomy and responsibility for diagnoses, drug choices, therapeutic dosages, and emergency interventions.
              </li>
              <li>
                <strong>Prescription Accuracy:</strong> Doctors must carefully review all prescribed items, routes, frequencies, and durations prior to signing and completing consultations.
              </li>
              <li>
                <strong>Patient Verification:</strong> Pharmacists and nursing staff must physically verify patient identity, allergy flags, and prescription labels prior to medicine administration.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-[var(--text-strong)] flex items-center gap-2 border-b border-[var(--line-soft)] pb-2">
              <Shield size={16} className="text-[var(--green-700)]" />
              3. Pharmacy, Formulary & Scheduled Drug Regulations
            </h2>
            <p>
              Dispensing of pharmaceuticals through the pharmacy module must strictly adhere to the Drugs and Cosmetics Act and statutory pharmacy board rules:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-[var(--text-body)]">
              <li>
                <strong>Schedule H &amp; H1 Compliance:</strong> Prescription-only antibiotics and restricted pharmaceuticals must only be dispensed against verified doctor orders, logging patient UHID, doctor registration number, and batch details.
              </li>
              <li>
                <strong>Inventory Integrity:</strong> Stock additions, sheet/unit conversions, batch expirations, and price revisions must reflect genuine physical manufacturer supplies received.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-[var(--text-strong)] flex items-center gap-2 border-b border-[var(--line-soft)] pb-2">
              <CheckCircle size={16} className="text-[var(--green-700)]" />
              4. Inpatient & Billing Protocol
            </h2>
            <p>
              Inpatient admissions and bed management follow institutional policies:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm text-[var(--text-body)]">
              <li>Bed occupancy is billed based on institutional rules (18-hour daily cutoff standard).</li>
              <li>Discharge summaries must be reviewed and authorized by the primary consultant before bed release.</li>
              <li>All billing totals, including consultations, bed charges, and pharmacy supplies, must accurately reflect documented services.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-[var(--text-strong)] flex items-center gap-2 border-b border-[var(--line-soft)] pb-2">
              <Scale size={16} className="text-[var(--green-700)]" />
              5. Governing Law & Jurisdiction
            </h2>
            <p>
              These Terms and Conditions are governed by and construed in accordance with the laws of India. Any disputes arising out of the use of this System shall be subject to the exclusive jurisdiction of the courts of Chintamani / Chikkaballapur District, Karnataka.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-xs text-[var(--text-muted)]">
          <p>© {new Date().getFullYear()} Radhakrishna Hospital. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

