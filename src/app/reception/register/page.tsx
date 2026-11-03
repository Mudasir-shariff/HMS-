'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, MessageSquare, Plus, Search, UserCheck, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { Card, Button, Input, Select, Checkbox, Textarea, StatusPill } from '@/components/ui';
import { PageHeader } from '@/components/layout';
import { useHMSStore } from '@/lib/store/use-store';
import { HMSStore } from '@/lib/store/hms-store';
import { pushPatientToSupabase, pushVisitToSupabase } from '@/lib/supabase/sync';
import type { Patient, Visit } from '@/lib/types/database';

const BLOOD_GROUPS = [
  { value: 'A+', label: 'A+' },
  { value: 'A-', label: 'A-' },
  { value: 'B+', label: 'B+' },
  { value: 'B-', label: 'B-' },
  { value: 'O+', label: 'O+' },
  { value: 'O-', label: 'O-' },
  { value: 'AB+', label: 'AB+' },
  { value: 'AB-', label: 'AB-' },
];

interface FormState {
  name: string;
  age: string;
  phone: string;
  uhidLookup: string;
  bloodGroup: string;
  hasBP: boolean;
  hasSugar: boolean;
  hasOther: boolean;
  otherCondition: string;
  doctorId: string;
}

export default function RegisterPatientPage() {
  const router = useRouter();
  const { doctors, patients, settings } = useHMSStore();

  const doctorOptions = doctors.map((d) => ({
    value: d.id,
    label: `${d.full_name} (${d.specialization || 'Consultant'}) - ${d.consultation_room || 'OPD'}`,
  }));

  const [form, setForm] = useState<FormState>({
    name: '',
    age: '',
    phone: '',
    uhidLookup: '',
    bloodGroup: '',
    hasBP: false,
    hasSugar: false,
    hasOther: false,
    otherCondition: '',
    doctorId: doctors[0]?.id || '',
  });

  const [matchedPatient, setMatchedPatient] = useState<Patient | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createdResult, setCreatedResult] = useState<{ patient: Patient; visit: Visit } | null>(null);

  // Auto-search existing patient when typing phone (10 digits) or UHID
  useEffect(() => {
    const cleanedPhone = form.phone.trim();
    const cleanedUhid = form.uhidLookup.trim().toUpperCase();

    let found: Patient | undefined;
    if (cleanedPhone.length >= 10) {
      found = patients.find((p) => p.phone === cleanedPhone);
    }
    if (!found && cleanedUhid.length >= 3) {
      found = patients.find((p) => p.uhid.toUpperCase() === cleanedUhid);
    }

    if (found) {
      setMatchedPatient(found);
      setForm((prev) => ({
        ...prev,
        name: found!.name,
        age: String(found!.age),
        phone: found!.phone,
        bloodGroup: found!.blood_group || '',
        hasBP: found!.has_bp,
        hasSugar: found!.has_sugar,
        hasOther: Boolean(found!.other_conditions),
        otherCondition: found!.other_conditions || '',
      }));
    } else {
      setMatchedPatient(null);
    }
  }, [form.phone, form.uhidLookup, patients]);

  // Auto-select first available doctor when doctors list loads from Supabase
  useEffect(() => {
    if (!form.doctorId && doctors.length > 0) {
      setForm((f) => ({ ...f, doctorId: doctors[0].id }));
    }
  }, [doctors, form.doctorId]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) {
      setErrors((e) => {
        const next = { ...e };
        delete next[key];
        return next;
      });
    }
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Patient name is required.';
    if (!form.age || isNaN(Number(form.age)) || Number(form.age) < 0 || Number(form.age) > 120) {
      errs.age = 'Enter a valid age (0-120).';
    }
    if (!form.phone.trim() || form.phone.length < 10) {
      errs.phone = 'Enter a valid 10-digit mobile number.';
    }
    if (!form.doctorId) {
      errs.doctorId = 'Please select a consultant doctor.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const res = HMSStore.registerPatientAndVisit({
      name: form.name.trim(),
      age: Number(form.age),
      phone: form.phone.trim(),
      blood_group: form.bloodGroup || undefined,
      has_bp: form.hasBP,
      has_sugar: form.hasSugar,
      other_conditions: form.hasOther ? form.otherCondition.trim() : undefined,
      doctorId: form.doctorId,
    });

    // Push directly to Supabase
    pushPatientToSupabase(res.patient);
    pushVisitToSupabase(res.visit);

    setCreatedResult(res);
  }

  const assignedDoctor = doctors.find((d) => d.id === (createdResult?.visit.doctor_id || form.doctorId));

  // ────────────────────────────────────────────────────────────────────────────
  // POST-REGISTRATION DISPLAY (PRD v1.1 Rule: No token slip printed at reception)
  // Shows large token number on screen for verbal communication + WhatsApp option
  // ────────────────────────────────────────────────────────────────────────────
  if (createdResult) {
    const doctorName = assignedDoctor?.full_name || 'Consultant Doctor';
    const room = assignedDoctor?.consultation_room || 'OPD Consultation Room';
    const tokenDisplay = String(createdResult.visit.token_number).padStart(2, '0');

    // WhatsApp message URL
    const waText = encodeURIComponent(
      `Namaste ${createdResult.patient.name}, your OPD token at ${settings.hospital_name} is #${tokenDisplay}.\n` +
      `Doctor: ${doctorName}\n` +
      `Room / Cabin: ${room}\n` +
      `Visit ID: ${createdResult.visit.visit_number} · UHID: ${createdResult.patient.uhid}\n` +
      `Please be seated in the waiting lobby. Thank you.`
    );
    const waUrl = `https://wa.me/91${createdResult.patient.phone}?text=${waText}`;

    return (
      <div className="py-6 max-w-xl mx-auto">
        <PageHeader title="Patient Registered & Token Issued" />

        <Card className="text-center shadow-[var(--shadow-float)] border border-[var(--line-soft)]">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="h-14 w-14 rounded-full bg-[var(--success-bg)] flex items-center justify-center">
              <CheckCircle size={30} className="text-[var(--success)]" />
            </div>

            {/* Large Token Number on Screen */}
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-semibold">
                Daily Token Number
              </p>
              <div className="my-2 py-3 px-8 bg-[var(--sage-100)] border-2 border-[var(--green-600)] rounded-[var(--r-tile)] inline-block">
                <span className="text-[72px] leading-none font-light text-[var(--green-900)] tracking-tight">
                  {tokenDisplay}
                </span>
              </div>
              <p className="text-base font-medium text-[var(--text-strong)] mt-1">
                Tell Patient: <strong className="text-[var(--green-700)]">Token #{tokenDisplay}</strong>
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Assigned to <strong>{doctorName}</strong> in <strong>{room}</strong>
              </p>
            </div>

            {/* Patient & Visit Details Tile */}
            <div className="bg-[var(--bg-tile)] rounded-[var(--r-tile)] p-4 w-full text-left space-y-2 border border-[var(--line-soft)] text-xs">
              <div className="flex justify-between items-center border-b border-[var(--line-soft)] pb-2">
                <span className="font-semibold text-sm text-[var(--text-strong)]">{createdResult.patient.name}</span>
                <span className="text-[11px] font-mono font-medium text-[var(--green-700)] bg-white px-2 py-0.5 rounded border border-[var(--line-soft)]">
                  UHID: {createdResult.patient.uhid}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[var(--text-body)]">
                <div>
                  <span className="text-[var(--text-muted)]">Age / Phone: </span>
                  <span className="font-medium">{createdResult.patient.age}y · {createdResult.patient.phone}</span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">Blood Group: </span>
                  <span className="font-medium">{createdResult.patient.blood_group || 'Not recorded'}</span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">Visit Number: </span>
                  <span className="font-medium font-mono">{createdResult.visit.visit_number}</span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">Doctor Queue: </span>
                  <span className="font-semibold text-[var(--green-700)]">Waiting (# {tokenDisplay})</span>
                </div>
              </div>
            </div>

            {/* Note: No Paper Slip Reminder */}
            <div className="bg-[#FAF8F2] border border-[#E8DCC4] rounded-[var(--r-control)] px-3 py-2 text-[11px] text-[#7A6020] text-left w-full">
              ℹ️ <strong>Paperless Reception (PRD v1.1):</strong> No token slip is printed at reception. Inform the patient verbally or send the token via WhatsApp below.
            </div>

            {/* WhatsApp Send Button */}
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 h-11 px-5 rounded-[var(--r-pill)] bg-[#25D366] hover:bg-[#20BD5A] text-white text-xs font-semibold shadow-sm transition-colors"
            >
              <MessageSquare size={16} />
              Send Token to Patient on WhatsApp
            </a>

            {/* Actions */}
            <div className="flex gap-3 w-full">
              <Button
                variant="secondary"
                icon={<Plus size={16} />}
                className="flex-1"
                onClick={() => {
                  setCreatedResult(null);
                  setMatchedPatient(null);
                  setForm({
                    name: '',
                    age: '',
                    phone: '',
                    uhidLookup: '',
                    bloodGroup: '',
                    hasBP: false,
                    hasSugar: false,
                    hasOther: false,
                    otherCondition: '',
                    doctorId: doctors[0]?.id || '',
                  });
                }}
              >
                Register Next Patient
              </Button>
              <a
                href="/reception"
                onClick={(e) => {
                  e.preventDefault();
                  window.location.href = '/reception';
                }}
                className="flex-1 h-10 px-4 text-sm font-medium rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] text-[var(--text-strong)] hover:bg-[var(--bg-tile)] active:bg-[var(--bg-canvas)] transition-all flex items-center justify-center text-center shadow-xs cursor-pointer"
              >
                Back to Reception Desk
              </a>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <a
          href="/reception"
          onClick={(e) => {
            e.preventDefault();
            window.location.href = '/reception';
          }}
          className="h-10 w-10 flex items-center justify-center rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] text-[var(--text-strong)] hover:bg-[var(--bg-tile)] hover:border-[var(--green-600)] transition-all cursor-pointer shadow-xs shrink-0"
          title="Back to Reception Desk"
          aria-label="Back to Reception Desk"
        >
          <ArrowLeft size={18} />
        </a>
        <PageHeader title="New OPD Registration" subtitle="Register patient, issue daily token & assign doctor queue" />
      </div>

      {/* Returning Patient Banner */}
      {matchedPatient && (
        <div className="flex items-center gap-3 bg-[var(--success-bg)] border border-[var(--success)] rounded-[var(--r-tile)] p-4 mb-5 text-xs text-[#2A6E24]">
          <UserCheck size={20} className="shrink-0" />
          <div className="flex-1">
            <strong>Returning Patient Recognized:</strong> {matchedPatient.name} (UHID: {matchedPatient.uhid}).
            Demographics and medical flags have been pre-filled. A new visit and token will be generated.
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left Column: Patient Details */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[20px] font-medium text-[var(--text-strong)]">Patient Identification</h3>
                <span className="text-xs text-[var(--text-muted)]">Type phone or UHID to find existing</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Input
                    label="Mobile Phone Number *"
                    type="tel"
                    placeholder="10-digit mobile number (e.g. 9876543210)"
                    value={form.phone}
                    onChange={(e) => update('phone', e.target.value)}
                    error={errors.phone}
                    maxLength={10}
                    hint="Lookup runs automatically as you enter 10 digits"
                  />
                </div>

                <div className="sm:col-span-2">
                  <Input
                    label="Full Name *"
                    placeholder="Enter patient's full name"
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                    error={errors.name}
                    autoComplete="off"
                  />
                </div>

                <Input
                  label="Age (Years) *"
                  type="number"
                  placeholder="e.g. 35"
                  min={0}
                  max={120}
                  value={form.age}
                  onChange={(e) => update('age', e.target.value)}
                  error={errors.age}
                />

                <Select
                  label="Blood Group (Optional)"
                  placeholder="Select blood group"
                  options={BLOOD_GROUPS}
                  value={form.bloodGroup}
                  onChange={(e) => update('bloodGroup', (e.target as HTMLSelectElement).value)}
                />
              </div>
            </Card>

            <Card>
              <h3 className="text-[20px] font-medium text-[var(--text-strong)] mb-4">Medical Flags & Comorbidities</h3>
              <div className="flex flex-col gap-3">
                <Checkbox
                  label="Blood Pressure (Hypertension)"
                  checked={form.hasBP}
                  onChange={(e) => update('hasBP', e.target.checked)}
                />
                <Checkbox
                  label="Diabetes / Blood Sugar"
                  checked={form.hasSugar}
                  onChange={(e) => update('hasSugar', e.target.checked)}
                />
                <Checkbox
                  label="Other existing medical conditions or allergies"
                  checked={form.hasOther}
                  onChange={(e) => update('hasOther', e.target.checked)}
                />
                {form.hasOther && (
                  <div className="ml-7">
                    <Textarea
                      placeholder="Specify conditions, known drug allergies or medical notes..."
                      value={form.otherCondition}
                      onChange={(e) => update('otherCondition', e.target.value)}
                      rows={2}
                    />
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Right Column: Doctor Assignment & Token Generation */}
          <div className="flex flex-col gap-4">
            <Card>
              <h3 className="text-[18px] font-medium text-[var(--text-strong)] mb-3">Consultant Doctor</h3>
              <p className="text-xs text-[var(--text-muted)] mb-4">
                Select the doctor to assign this patient to. Patient will appear in their live queue immediately.
              </p>

              <div className="flex flex-col gap-3">
                {doctorOptions.length === 0 ? (
                  <div className="bg-[var(--warning-bg)] border border-[var(--warning)] p-3.5 rounded-[var(--r-control)] text-xs space-y-2">
                    <p className="font-semibold flex items-center gap-1.5 text-[var(--text-strong)]">
                      <AlertCircle size={14} className="text-[var(--warning)]" />
                      No Doctors Registered Yet
                    </p>
                    <p className="text-[var(--text-muted)]">
                      There are no registered consultant doctors in the system. Please register a doctor account first to assign patient OPD queues.
                    </p>
                    <Link href="/register" className="block pt-1">
                      <Button size="sm" variant="secondary" className="w-full">
                        + Register Doctor Account
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <Select
                    label="Select Consultant *"
                    options={doctorOptions}
                    value={form.doctorId}
                    onChange={(e) => update('doctorId', (e.target as HTMLSelectElement).value)}
                    error={errors.doctorId}
                  />
                )}

                {assignedDoctor && (
                  <div className="bg-[var(--bg-tile)] rounded-[var(--r-control)] p-3 text-xs space-y-1 border border-[var(--line-soft)]">
                    <p className="font-semibold text-[var(--text-strong)]">{assignedDoctor.full_name}</p>
                    <p className="text-[var(--text-muted)]">Specialization: {assignedDoctor.specialization || 'Consultant'}</p>
                    <p className="text-[var(--text-muted)]">Room: {assignedDoctor.consultation_room || 'OPD Room'}</p>
                    <p className="text-[var(--green-700)] font-medium">Timings: {assignedDoctor.opd_timings || '09:00 AM - 01:00 PM'}</p>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-[var(--line-soft)] flex flex-col gap-2">
                <Button type="submit" size="lg" className="w-full">
                  Save & Generate Token
                </Button>
                <a
                  href="/reception"
                  onClick={(e) => {
                    e.preventDefault();
                    window.location.href = '/reception';
                  }}
                  className="w-full h-10 px-4 text-sm font-medium rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] text-[var(--text-strong)] hover:bg-[var(--bg-tile)] active:bg-[var(--bg-canvas)] transition-all flex items-center justify-center text-center shadow-xs cursor-pointer"
                >
                  Cancel & Return to Reception
                </a>
                <p className="text-[11px] text-[var(--text-muted)] text-center mt-1">
                  Token displays immediately on screen (no slip printed).
                </p>
              </div>
            </Card>
          </div>
        </div>
      </form>
    </>
  );
}
