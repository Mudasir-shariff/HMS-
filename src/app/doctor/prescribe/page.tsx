'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import {
  ArrowLeft,
  Plus,
  X,
  Printer,
  Save,
  Search,
  CheckCircle,
  Stethoscope,
  Share2,
  FileText,
  Clock,
  Phone,
  Calendar,
  ShieldCheck,
  Check,
  Sparkles,
  Send,
  MessageSquare,
  AlertCircle,
  Syringe,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardHeader, Button, Textarea, Input, StatusPill } from '@/components/ui';
import { useHMSStore } from '@/lib/store/use-store';
import { useAuth } from '@/lib/auth/context';
import { HMSStore } from '@/lib/store/hms-store';
import type { PrescriptionItem, LabTestOrder, DrugType } from '@/lib/types/database';
import { clsx } from 'clsx';

const LAB_TEST_SUGGESTIONS = [
  'Complete Blood Count (CBC)',
  'Fasting Blood Sugar (FBS)',
  'Postprandial Blood Sugar (PPBS)',
  'HbA1c (Glycated Hemoglobin)',
  'Lipid Profile',
  'Kidney Function Test (KFT / RFT)',
  'Liver Function Test (LFT)',
  'Thyroid Stimulating Hormone (TSH)',
  'Urine Routine & Microscopy',
  '12-Lead ECG',
  'Chest X-Ray PA View',
  'Ultrasound Whole Abdomen',
  'Serum Creatinine & Electrolytes',
];

// Rapid Clinical Templates (Favourites)
const CLINICAL_TEMPLATES = [
  {
    name: 'Viral Fever & Body Ache',
    instructions: 'Drink warm fluids. Rest for 3 days. Light home-cooked meals.',
    followUpDays: 3,
    medicines: [
      { name: 'Paracetamol 500mg', type: 'tablet', morning: true, afternoon: false, night: true, relation: 'after_food' as const, days: 5 },
      { name: 'Ambroxol Cough Syrup 100ml', type: 'syrup', morning: true, afternoon: true, night: true, relation: 'after_food' as const, days: 5 },
      { name: 'Cetirizine 10mg', type: 'tablet', morning: false, afternoon: false, night: true, relation: 'after_food' as const, days: 5 },
    ],
  },
  {
    name: 'Hypertension Check',
    instructions: 'Strict low-salt diet. Daily morning BP monitoring log. Avoid stress.',
    followUpDays: 14,
    medicines: [
      { name: 'Amlodipine 5mg', type: 'tablet', morning: true, afternoon: false, night: false, relation: 'before_food' as const, days: 15 },
    ],
  },
  {
    name: 'Acid Peptic & Gastritis',
    instructions: 'Avoid oily and spicy foods. Eat on regular timings. Do not sleep immediately after meals.',
    followUpDays: 7,
    medicines: [
      { name: 'Omeprazole 20mg', type: 'capsule', morning: true, afternoon: false, night: false, relation: 'before_food' as const, days: 7 },
    ],
  },
];

interface MedicineRow {
  id: string;
  drugId: string;
  name: string;
  type: string;
  morning: boolean;
  afternoon: boolean;
  night: boolean;
  relation: 'before_food' | 'after_food';
  days: number;
  qty: number;
  isCustom?: boolean;
  customUnit?: string;
  addedByPharmacist?: boolean;
  pharmacistNotes?: string;
}

export default function PrescribePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 rounded-full border-2 border-[var(--green-600)] border-t-transparent animate-spin" />
        </div>
      }
    >
      <PrescribeContent />
    </Suspense>
  );
}

function PrescribeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { drugs, doctors, settings, patients, visits, prescriptions } = useHMSStore();

  const visitId = searchParams.get('visitId') || '';
  const patientId = searchParams.get('patientId') || '';
  const token = searchParams.get('token') || '01';
  const patientName = searchParams.get('name') || 'Patient';
  const uhid = searchParams.get('uhid') || 'H-0001';
  const age = searchParams.get('age') || '30';
  const doctorId = searchParams.get('doctorId') || user?.doctorId || user?.id || '';
  const uaid = searchParams.get('uaid') || ''; // if in-patient
  const stayDayNumber = searchParams.get('day') ? Number(searchParams.get('day')) : undefined;

  const activePatient = patients.find((p) => p.id === patientId || p.uhid === uhid);
  const activeVisit = visits.find((v) => v.id === visitId);

  // Load existing prescription for this visit or patient (includes any tablet added by pharmacist)
  const existingRx = prescriptions.find(
    (p) => (visitId && p.visit_id === visitId) || (patientId && p.patient_id === patientId)
  );

  const doctor = doctors.find((d) => d.id === doctorId) || {
    id: doctorId,
    full_name: user?.fullName || 'Dr. Meera Nair',
    specialization: user?.specialization || 'Cardiology',
    qualification: user && 'qualification' in user ? String(user.qualification) : 'MBBS, MD (Cardiology)',
    reg_number: user && 'reg_number' in user ? String(user.reg_number) : 'KMC-48291',
    consultation_room: user?.consultationRoom || 'OPD Room 102',
    phone: user?.phone || '+91 98765 00001',
    opd_timings: '09:00 AM - 01:00 PM',
  };

  const [medicines, setMedicines] = useState<MedicineRow[]>(() => {
    if (existingRx?.items && existingRx.items.length > 0) {
      return existingRx.items.map((it) => ({
        id: it.id,
        drugId: it.drug_id,
        name: it.drug_name,
        type: it.item_type || 'tablet',
        morning: Boolean(it.dose_morning),
        afternoon: Boolean(it.dose_afternoon),
        night: Boolean(it.dose_night),
        relation: it.dose_relation === 'before_food' ? ('before_food' as const) : ('after_food' as const),
        days: it.num_days || 5,
        qty: it.quantity || 10,
        isCustom: it.is_custom,
        customUnit: it.custom_unit,
        addedByPharmacist: Boolean(it.added_by_pharmacist),
        pharmacistNotes: it.pharmacist_notes,
      }));
    }
    return [];
  });

  const loadedRxIdRef = useRef<string | null>(existingRx?.id || null);
  const loadedRxItemsLenRef = useRef<number>(existingRx?.items?.length || 0);

  // Keep prescription updated if pharmacist adds a tablet during dispensing/review
  useEffect(() => {
    if (existingRx && existingRx.items && existingRx.items.length > 0) {
      if (existingRx.id !== loadedRxIdRef.current || existingRx.items.length !== loadedRxItemsLenRef.current) {
        loadedRxIdRef.current = existingRx.id;
        loadedRxItemsLenRef.current = existingRx.items.length;
        setMedicines(
          existingRx.items.map((it) => ({
            id: it.id,
            drugId: it.drug_id,
            name: it.drug_name,
            type: it.item_type || 'tablet',
            morning: Boolean(it.dose_morning),
            afternoon: Boolean(it.dose_afternoon),
            night: Boolean(it.dose_night),
            relation: it.dose_relation === 'before_food' ? ('before_food' as const) : ('after_food' as const),
            days: it.num_days || 5,
            qty: it.quantity || 10,
            isCustom: it.is_custom,
            customUnit: it.custom_unit,
            addedByPharmacist: Boolean(it.added_by_pharmacist),
            pharmacistNotes: it.pharmacist_notes,
          }))
        );
      }
    }
  }, [existingRx?.id, existingRx?.items]);

  const [labTests, setLabTests] = useState<string[]>([]);
  const [diagnosis, setDiagnosis] = useState('');
  const [additionalNote, setAdditionalNote] = useState(
    settings.prescription_footer || "Please follow the doctor's advice. Consult the hospital if symptoms worsen."
  );
  const [patientGender, setPatientGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [instructions, setInstructions] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [showPrintView, setShowPrintView] = useState(false);
  const [savedRxId, setSavedRxId] = useState<string>('');
  const [printLayout, setPrintLayout] = useState<'A4' | 'A5'>(settings.prescription_paper_size || 'A4');
  const [queuedPrinterSuccess, setQueuedPrinterSuccess] = useState<string | null>(null);

  // Drug inventory search state
  const [drugSearch, setDrugSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Custom Item Modal/Drawer State (PRD v1.1 Injections & Other Free-Text)
  const [showCustomItemModal, setShowCustomItemModal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customType, setCustomType] = useState<DrugType>('injection');
  const [customUnit, setCustomUnit] = useState('vial');
  const [customQty, setCustomQty] = useState(1);
  const [customMorning, setCustomMorning] = useState(true);
  const [customAfternoon, setCustomAfternoon] = useState(false);
  const [customNight, setCustomNight] = useState(false);
  const [customDays, setCustomDays] = useState(1);
  const [customRelation, setCustomRelation] = useState<'before_food' | 'after_food'>('after_food');

  const drugSuggestions = drugs.filter(
    (d) =>
      (!drugSearch.trim() || d.name.toLowerCase().includes(drugSearch.toLowerCase())) &&
      !medicines.some((m) => m.drugId === d.id)
  );

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // When doctor opens consultation, update visit status to 'in_consultation' if it was 'waiting'
  useEffect(() => {
    if (visitId) {
      const allVisits = HMSStore.getVisits();
      const current = allVisits.find((v) => v.id === visitId);
      if (current && current.status === 'waiting') {
        current.status = 'in_consultation';
        current.updated_at = new Date().toISOString();
        HMSStore.saveVisit(current);
      }
    }
  }, [visitId]);

  // Smart quantity helper
  function getSuggestedQty(type: string, m: boolean, a: boolean, n: boolean, days: number, customQ?: number) {
    return HMSStore.calculateSmartQuantity(type, m, a, n, days, customQ);
  }

  function addMedicine(drug: (typeof drugs)[0]) {
    const days = 5;
    const morning = true;
    const afternoon = false;
    const night = true;
    const qty = getSuggestedQty(drug.drug_type, morning, afternoon, night, days);

    setMedicines((prev) => [
      ...prev,
      {
        id: `med-${Date.now()}-${Math.random()}`,
        drugId: drug.id,
        name: drug.name,
        type: drug.drug_type,
        morning,
        afternoon,
        night,
        relation: 'after_food',
        days,
        qty,
      },
    ]);
    setDrugSearch('');
    setShowSuggestions(false);
  }

  function handleAddCustomItem() {
    if (!customName.trim()) return;
    const qty = customType === 'syrup' ? 1 : customQty || 1;
    setMedicines((prev) => [
      ...prev,
      {
        id: `med-custom-${Date.now()}`,
        drugId: '',
        name: customName.trim(),
        type: customType,
        morning: customMorning,
        afternoon: customAfternoon,
        night: customNight,
        relation: customRelation,
        days: customDays,
        qty,
        isCustom: true,
        customUnit,
      },
    ]);
    setCustomName('');
    setShowCustomItemModal(false);
  }

  function applyTemplate(tpl: (typeof CLINICAL_TEMPLATES)[0]) {
    setDiagnosis(tpl.name);
    setInstructions(tpl.instructions);
    // Calculate follow-up date
    const d = new Date();
    d.setDate(d.getDate() + tpl.followUpDays);
    setFollowUp(d.toISOString().split('T')[0]);

    // Map template medicines
    const newMeds: MedicineRow[] = tpl.medicines.map((tm, idx) => {
      const match = drugs.find((d) => d.name.toLowerCase().includes(tm.name.toLowerCase()));
      const qty = getSuggestedQty(tm.type, tm.morning, tm.afternoon, tm.night, tm.days);
      return {
        id: `med-tpl-${idx}-${Date.now()}`,
        drugId: match?.id || '',
        name: match?.name || tm.name,
        type: match?.drug_type || tm.type,
        morning: tm.morning,
        afternoon: tm.afternoon,
        night: tm.night,
        relation: tm.relation,
        days: tm.days,
        qty,
        isCustom: !match,
      };
    });
    setMedicines(newMeds);
  }

  function removeMedicine(id: string) {
    setMedicines((prev) => prev.filter((m) => m.id !== id));
  }

  function updateMedicine<K extends keyof MedicineRow>(id: string, key: K, value: MedicineRow[K]) {
    setMedicines((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const updated = { ...m, [key]: value };
        if (updated.type === 'syrup') {
          updated.qty = 1; // Syrup is always 1 bottle by default (PRD v1.1)
        } else if (updated.type === 'tablet' || updated.type === 'capsule') {
          const doseCount = (updated.morning ? 1 : 0) + (updated.afternoon ? 1 : 0) + (updated.night ? 1 : 0);
          updated.qty = Math.max(1, (doseCount || 1) * updated.days);
        }
        return updated;
      })
    );
  }

  // Quick follow-up chip selector
  function setFollowUpInDays(days: number) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setFollowUp(d.toISOString().split('T')[0]);
  }

  // Lab test search
  const [labSearch, setLabSearch] = useState('');
  const labSuggestions = LAB_TEST_SUGGESTIONS.filter(
    (t) => t.toLowerCase().includes(labSearch.toLowerCase()) && !labTests.includes(t)
  );

  function executeSavePrescription(): string {
    const rxId = savedRxId || existingRx?.id || `rx-${Date.now()}`;
    const rxItems: PrescriptionItem[] = medicines.map((m, idx) => ({
      id: m.id || `rxi-${idx}-${Date.now()}`,
      prescription_id: rxId,
      drug_id: m.drugId,
      drug_name: m.name,
      dose_morning: m.morning,
      dose_afternoon: m.afternoon,
      dose_night: m.night,
      dose_relation: m.relation,
      num_days: m.days,
      quantity: m.qty,
      is_custom: m.isCustom,
      item_type: m.type as DrugType,
      custom_unit: m.customUnit,
      added_by_pharmacist: m.addedByPharmacist,
      pharmacist_notes: m.pharmacistNotes,
      created_at: new Date().toISOString(),
    }));

    const rxLabOrders: LabTestOrder[] = labTests.map((t, idx) => ({
      id: `labo-${idx}-${Date.now()}`,
      prescription_id: rxId,
      test_name: t,
      created_at: new Date().toISOString(),
    }));

    HMSStore.savePrescription({
      id: rxId,
      visit_id: visitId || `vis-${Date.now()}`,
      doctor_id: doctorId,
      patient_id: patientId || activePatient?.id || 'pat-1',
      notes: instructions,
      uaid: uaid || undefined,
      stay_day_number: stayDayNumber,
      items: rxItems,
      lab_tests: rxLabOrders,
      created_at: new Date().toISOString(),
    });

    // Ensure the visit record is strictly moved to 'prescribed' so it appears in the Pharmacy Dispensing Queue immediately
    if (visitId) {
      const allVisits = HMSStore.getVisits();
      const currentVisit = allVisits.find((v) => v.id === visitId);
      if (currentVisit) {
        currentVisit.status = 'prescribed';
        currentVisit.follow_up_date = followUp || undefined;
        currentVisit.instructions = instructions;
        currentVisit.updated_at = new Date().toISOString();
        HMSStore.saveVisit(currentVisit);
      }
    }

    setSavedRxId(rxId);
    return rxId;
  }

  function handleSaveAndPrint() {
    executeSavePrescription();
    setShowPrintView(true);
    setTimeout(() => {
      window.print();
    }, 400);
  }

  function handleSaveOnly() {
    executeSavePrescription();
    setShowPrintView(true);
  }

  function handleSendToHospitalPrinter() {
    const rxId = executeSavePrescription();
    const job = HMSStore.sendToPrintQueue({
      rxId,
      patientName,
      token,
      doctorName: doctor.full_name,
      printerName: settings.default_printer,
    });
    setQueuedPrinterSuccess(`Prescription sent to ${job.printerName}. Printing now at Hospital reception.`);
    setTimeout(() => setQueuedPrinterSuccess(null), 5000);
  }

  const currentDateFormatted = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const currentTimeFormatted = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 1. PRINT PREVIEW VIEW (Supports Native Phone Print, Hospital Relay & WhatsApp)
  // ────────────────────────────────────────────────────────────────────────────
  if (showPrintView) {
    const patientPhone = activePatient?.phone || '';
    const shareMessage = encodeURIComponent(
      `Prescription from ${settings.hospital_name}\n` +
      `Patient: ${patientName} (Token #${token})\n` +
      `Doctor: ${doctor.full_name} (${doctor.specialization})\n\n` +
      `Medicines:\n` +
      medicines.map((m) => `• ${m.name} - ${m.morning ? '1' : '0'}-${m.afternoon ? '1' : '0'}-${m.night ? '1' : '0'} (${m.relation === 'before_food' ? 'Before food' : 'After food'}) x ${m.days} days`).join('\n') +
      `\n\nAdvice: ${instructions}\n` +
      (followUp ? `Follow-up on: ${new Date(followUp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}\n` : '') +
      `Get well soon!`
    );
    const waShareUrl = `https://wa.me/91${patientPhone}?text=${shareMessage}`;

    return (
      <div className="py-4 max-w-4xl mx-auto">
        {/* Toast Notification for Hospital Print Relay */}
        {queuedPrinterSuccess && (
          <div className="no-print mb-4 p-4 rounded-[var(--r-tile)] bg-[var(--success-bg)] border border-[var(--success)] text-xs text-[#2A6E24] flex items-center gap-2">
            <CheckCircle size={18} className="shrink-0" />
            <span>{queuedPrinterSuccess}</span>
          </div>
        )}

        {/* Hand-off Confirmation Banner */}
        <div className="no-print mb-4 p-4 rounded-[var(--r-tile)] bg-[var(--sage-100)] border border-[var(--green-600)] text-xs text-[var(--green-900)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-[var(--green-900)] text-white flex items-center justify-center shrink-0">
              <CheckCircle size={18} />
            </div>
            <div>
              <p className="font-bold text-sm text-[var(--green-900)]">
                Hand-off Complete: Transferred to Pharmacy Queue
              </p>
              <p className="text-[var(--text-muted)] text-xs">
                Patient Token #{String(token).padStart(2, '0')} ({patientName}) is now in the Pharmacy Dispensing Queue.
              </p>
            </div>
          </div>
          <Link href="/doctor">
            <Button size="sm" className="bg-[var(--green-900)] text-white shrink-0">
              Next Patient in Queue →
            </Button>
          </Link>
        </div>

        {/* Screen Action Bar (Hidden during actual print) */}
        <div className="no-print bg-[var(--bg-card)] rounded-[var(--r-card)] p-4 sm:p-5 border border-[var(--line-soft)] shadow-[var(--shadow-float)] mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-full bg-[var(--success-bg)] text-[var(--success)] flex items-center justify-center shrink-0">
                <CheckCircle size={20} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-strong)]">
                  Prescription Finalized & Sent to Pharmacy
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Patient Token #{String(token).padStart(2, '0')} · {patientName} · {doctor.full_name}
                  {uaid ? ` · In-Patient UAID: ${uaid} (Day ${stayDayNumber || 1})` : ''}
                </p>
              </div>
            </div>

            {/* Print Options & Format Toggles */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Paper Size Selector */}
              <div className="flex items-center bg-white rounded-[var(--r-pill)] border border-[var(--line-soft)] p-0.5 text-xs">
                <button
                  onClick={() => setPrintLayout('A4')}
                  className={`px-2.5 py-1 rounded-[var(--r-pill)] font-medium ${printLayout === 'A4' ? 'bg-[var(--green-900)] text-white' : 'text-[var(--text-muted)]'}`}
                >
                  A4 Sheet
                </button>
                <button
                  onClick={() => setPrintLayout('A5')}
                  className={`px-2.5 py-1 rounded-[var(--r-pill)] font-medium ${printLayout === 'A5' ? 'bg-[var(--green-900)] text-white' : 'text-[var(--text-muted)]'}`}
                >
                  A5 Pad
                </button>
              </div>

              {/* Path 1: Native Phone / Browser Print */}
              <Button
                size="sm"
                icon={<Printer size={15} />}
                onClick={() => window.print()}
                className="bg-[var(--green-900)] text-white"
              >
                Native Print
              </Button>

              {/* Path 2: Hospital Print Queue Relay (Recommended Default in PRD 3.4) */}
              <Button
                variant="secondary"
                size="sm"
                icon={<Send size={14} />}
                onClick={handleSendToHospitalPrinter}
              >
                Send to Printer
              </Button>

              {/* Path 3: WhatsApp Share to Patient */}
              {patientPhone && (
                <a
                  href={waShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--r-pill)] bg-[#25D366] hover:bg-[#20BD5A] text-white text-xs font-semibold shadow-sm transition-colors"
                >
                  <MessageSquare size={14} />
                  WhatsApp
                </a>
              )}

              <Button
                variant="secondary"
                size="sm"
                icon={<ArrowLeft size={14} />}
                onClick={() => setShowPrintView(false)}
              >
                Edit
              </Button>

              <Link
                href="/doctor"
                className="h-8 px-3 text-xs rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] text-[var(--text-strong)] hover:bg-[var(--bg-tile)] font-medium inline-flex items-center justify-center transition-all cursor-pointer shadow-xs"
              >
                Back to Doctor Queue
              </Link>
            </div>
          </div>
        </div>

        {/* ────────────────────────────────────────────────────────────────────────────
            2. THE OFFICIAL A4 / A5 PRESCRIPTION DOCUMENT (Matching Radhakrishna Hospital Typed Prescription)
           ──────────────────────────────────────────────────────────────────────────── */}
        {(() => {
          const instructionLines = instructions
            .split(/\r?\n/)
            .map((s) => s.replace(/^\d+[\.\)]\s*/, '').trim())
            .filter(Boolean);
          if (instructionLines.length === 0) {
            instructionLines.push('General advice / physiotherapy / diet / precautions');
            instructionLines.push('Take prescribed medications on time with warm water.');
            instructionLines.push('Adequate rest and light, easily digestible diet.');
          }

          let followUpDaysDiff = 5;
          let followUpFormatted = '';
          if (followUp) {
            const fDate = new Date(followUp);
            const now = new Date();
            const diffTime = fDate.getTime() - now.getTime();
            followUpDaysDiff = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)));
            followUpFormatted = fDate.toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            });
          }

          return (
            <div
              id="printable-prescription"
              className={`bg-white text-black font-sans mx-auto shadow-md border border-gray-300 ${
                printLayout === 'A5'
                  ? 'max-w-[148mm] min-h-[210mm] p-6 text-[11px]'
                  : 'max-w-[210mm] min-h-[297mm] p-8 sm:p-12 text-xs'
              }`}
              style={{ minHeight: printLayout === 'A5' ? '210mm' : '297mm' }}
            >
              {/* 1. Header: Hospital Brand & Info */}
              <div className="flex justify-between items-start pb-2 border-b-2 border-[#134e4a]">
                <div>
                  <h1 className="font-serif text-2xl sm:text-[28px] font-bold tracking-wide text-[#134e4a] uppercase leading-tight">
                    {settings.hospital_name || 'RADHAKRISHNA HOSPITAL'}
                  </h1>
                  <p className="font-serif text-[11px] sm:text-xs font-semibold tracking-[0.2em] text-gray-800 uppercase mt-0.5">
                    {settings.prescription_header || 'MULTISPECIALITY CARE'}
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-gray-600 mt-1">
                    {settings.address || 'Ward No. 10, Near Rama Mandir Road, NR Extension, Chintamani, Karnataka'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-serif text-sm sm:text-base font-bold text-[#b91c1c] uppercase tracking-wider">
                    PRESCRIPTION
                  </p>
                  <p className="italic text-[10px] sm:text-[11px] text-gray-500 mt-0.5">
                    Software-generated copy
                  </p>
                </div>
              </div>

              {/* 2. Patient Details Row 1 & 2 */}
              <div className="font-mono text-xs sm:text-[13px] text-gray-900 py-2.5 border-b border-gray-400 space-y-1.5">
                <div className="flex justify-between items-center">
                  <div className="w-1/3">
                    Patient: <strong className="font-bold">{patientName}</strong>
                  </div>
                  <div className="w-1/3 text-center">
                    {age} Y / {patientGender}
                  </div>
                  <div className="w-1/3 text-right">
                    Patient ID: <strong className="font-bold font-mono">{uhid}</strong>
                  </div>
                </div>
                <div className="flex justify-between items-center text-gray-700 text-[11px] sm:text-xs">
                  <div>MOB: {patientPhone || activePatient?.phone || '—'}</div>
                  <div className="text-right">
                    {currentDateFormatted} &nbsp;&nbsp;&nbsp; {currentTimeFormatted}
                  </div>
                </div>
              </div>

              {/* 3. Doctor Row */}
              <div className="font-mono text-xs sm:text-[13px] text-gray-900 py-2.5 flex justify-between items-center border-b border-gray-400">
                <div>
                  Doctor: <strong className="font-bold">{doctor.full_name}, {doctor.qualification || doctor.specialization || 'MBBS, MD'}</strong>
                </div>
                <div className="text-right">
                  Reg. No.: <span className="font-semibold">{doctor.reg_number || 'KMC-48291'}</span>
                </div>
              </div>

              {/* 4. Diagnosis Block */}
              <div className="font-mono text-xs sm:text-[13px] text-gray-900 py-2.5 border-b border-gray-400">
                <p className="font-bold uppercase tracking-wider mb-1">DIAGNOSIS:</p>
                <p className="pl-4 text-gray-800">
                  {diagnosis || 'Clinical evaluation & symptomatic management'}
                </p>
              </div>

              {/* 5. Drugs (Rx) Block */}
              <div className="font-mono text-xs sm:text-[13px] py-2.5">
                <p className="font-bold text-gray-900 uppercase tracking-wider mb-2">DRUGS (Rx):</p>

                {/* Hairline column headers */}
                <div className="border-y border-gray-400 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-gray-700 flex justify-between items-center">
                  <span className="w-1/2">MEDICINE / STRENGTH</span>
                  <span className="w-1/4 text-center">DOSAGE / TIMING</span>
                  <span className="w-1/4 text-right">DURATION</span>
                </div>

                {/* Drugs numbered list */}
                <div className="divide-y divide-gray-200 mt-1">
                  {medicines.map((m, idx) => {
                    const freq = `${m.morning ? '1' : '0'}-${m.afternoon ? '1' : '0'}-${m.night ? '1' : '0'}`;
                    const timing = m.relation === 'before_food' ? 'Before food' : 'After food';
                    const unit = m.type === 'syrup' ? '1 Bottle' : m.type === 'injection' ? '1 Vial' : '1 Tab';

                    return (
                      <div key={m.id || idx} className="py-2.5">
                        <div className="flex justify-between items-baseline">
                          <span className="font-bold text-black text-sm">
                            {idx + 1}. {m.name}
                            {m.addedByPharmacist && (
                              <span className="ml-2 text-[10px] uppercase font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-300">
                                [Added by Pharmacy]
                              </span>
                            )}
                          </span>
                          <span className="font-semibold text-black text-right">
                            {m.days} days
                          </span>
                        </div>
                        <div className="pl-4 text-[11px] sm:text-xs text-gray-700 mt-0.5">
                          {unit} &nbsp;•&nbsp; Dose: {freq} &nbsp;•&nbsp; {timing}
                          {m.addedByPharmacist && <span> &nbsp;•&nbsp; Dispensed & verified by Pharmacy</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Diagnostic & Lab Test Orders (if any) */}
              {labTests.length > 0 && (
                <div className="my-2.5 p-3 rounded border border-gray-300 font-mono text-xs">
                  <p className="font-bold text-gray-900 uppercase mb-1 text-[11px]">LAB TESTS ORDERED:</p>
                  <p className="text-gray-800 text-[11px] pl-2">
                    {labTests.map((t, idx) => `${idx + 1}. ${t}`).join('   ·   ')}
                  </p>
                </div>
              )}

              {/* 6. Instructions Box */}
              <div className="border border-gray-800 rounded-lg p-3.5 my-3 font-mono text-xs sm:text-[13px]">
                <p className="font-bold text-black uppercase mb-1.5">INSTRUCTIONS:</p>
                <div className="space-y-1 text-gray-800 pl-1 text-[11px] sm:text-xs">
                  {instructionLines.map((line, idx) => (
                    <p key={idx}>{idx + 1}. {line}</p>
                  ))}
                </div>
              </div>

              {/* 7. Follow Up Box */}
              <div className="border border-gray-800 rounded-lg p-3.5 my-3 font-mono text-xs sm:text-[13px]">
                <p className="font-bold text-black uppercase mb-1">FOLLOW UP:</p>
                <p className="text-gray-800 pl-1 text-[11px] sm:text-xs">
                  {followUp ? `${followUpFormatted} / return after ${followUpDaysDiff} days` : 'Review as needed / return SOS'}
                </p>
              </div>

              {/* 8. Additional Note */}
              {additionalNote && (
                <div className="font-mono text-xs sm:text-[13px] text-gray-700 my-2.5 pl-1">
                  <span className="font-semibold">Additional note: </span>
                  <span>{additionalNote}</span>
                </div>
              )}

              {/* 9. Footer & Doctor Signature Block */}
              <div className="mt-8 pt-3 border-t border-gray-400 flex flex-col sm:flex-row justify-between items-end gap-4 text-xs font-mono">
                <div className="text-[10px] sm:text-[11px] italic text-gray-600 max-w-sm">
                  Please follow the doctor&apos;s advice. Consult the hospital if symptoms worsen.
                </div>
                <div className="text-right min-w-[220px]">
                  <p className="text-[11px] text-gray-700 mb-8 font-semibold">Doctor&apos;s Signature / Seal</p>
                  <p className="font-bold text-sm text-black">{doctor.full_name}</p>
                  <p className="text-[10px] sm:text-[11px] text-gray-700 mt-0.5">
                    {doctor.qualification || doctor.specialization || 'MBBS, MD'} | Reg. {doctor.reg_number || 'KMC-48291'}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 3. EDIT / PRESCRIBE FORM VIEW (Mobile-Optimized PWA Interface)
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="pb-28 lg:pb-8">
      {/* Top Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          type="button"
          onClick={() => router.push('/doctor')}
          className="h-10 w-10 flex items-center justify-center rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] text-[var(--text-strong)] hover:bg-[var(--bg-tile)] hover:border-[var(--green-600)] transition-all cursor-pointer shadow-xs shrink-0"
          title="Back to Doctor Queue"
          aria-label="Back to Doctor Queue"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl lg:text-[36px] font-medium text-[var(--text-strong)] tracking-[-0.02em] leading-tight">
            Consultation · Token #{String(token).padStart(2, '0')}
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Patient: <strong>{patientName}</strong> ({age}y · UHID: {uhid}) · Consultant: <strong>{doctor.full_name}</strong>
            {uaid ? ` · In-Patient UAID: ${uaid} (Stay Day ${stayDayNumber || 1})` : ''}
          </p>
        </div>
      </div>

      {/* Clinical Template Shortcuts */}
      <div className="mb-5 bg-[var(--bg-card)] p-3.5 rounded-[var(--r-tile)] border border-[var(--line-soft)]">
        <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-[var(--text-strong)]">
          <Sparkles size={14} className="text-[var(--gold-500)]" />
          <span>Quick Diagnosis Presets (1-Click Templates):</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {CLINICAL_TEMPLATES.map((tpl) => (
            <button
              key={tpl.name}
              type="button"
              onClick={() => applyTemplate(tpl)}
              className="text-xs px-3 py-1.5 rounded-[var(--r-pill)] bg-white border border-[var(--line-soft)] hover:border-[var(--green-600)] hover:bg-[var(--sage-100)] text-[var(--text-body)] transition-all font-medium"
            >
              + {tpl.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* Card: Diagnosis & Patient Demographics */}
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <h3 className="text-base font-semibold text-[var(--text-strong)] flex items-center gap-1.5">
              <FileText size={16} className="text-[var(--green-700)]" />
              Clinical Diagnosis & Assessment
            </h3>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[var(--text-muted)] font-medium">Patient Gender:</span>
              {(['Male', 'Female', 'Other'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setPatientGender(g)}
                  className={clsx(
                    'px-2.5 py-1 rounded-[var(--r-pill)] text-xs font-semibold transition-all',
                    patientGender === g
                      ? 'bg-[var(--green-900)] text-white'
                      : 'bg-[var(--bg-tile)] text-[var(--text-muted)] hover:text-[var(--text-strong)]'
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <Input
            label="Diagnosis / Clinical Impression *"
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            placeholder="e.g. Acute Upper Respiratory Tract Infection (URTI) with mild fever"
          />
        </Card>

        {/* Card 1: Medicines & Dosage */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <CardHeader title="Rx: Prescribe Medications & Injections" count={medicines.length} />
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus size={14} />}
              onClick={() => setShowCustomItemModal(true)}
            >
              Add Injection / Other Item
            </Button>
          </div>

          {/* Search Inventory */}
          <div ref={searchRef} className="relative mb-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
              <input
                type="text"
                value={drugSearch}
                onChange={(e) => {
                  setDrugSearch(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Search and add drug from pharmacy inventory..."
                className="h-11 w-full rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] pl-9 pr-3 text-sm text-[var(--text-body)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--green-600)]"
              />
            </div>

            {/* Quick chips for available pharmacy stock */}
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              <span className="text-[11px] text-[var(--text-muted)] font-medium">Pharmacy Stock (Click to add):</span>
              {drugs.slice(0, 8).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => addMedicine(d)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-full bg-[var(--bg-tile)] hover:bg-[var(--green-50)] border border-[var(--line-soft)] hover:border-[var(--green-600)] text-[var(--text-strong)] font-medium transition-all"
                >
                  <span>+ {d.name}</span>
                  <span className="text-[9px] text-[var(--green-700)]">({d.stock_quantity})</span>
                </button>
              ))}
            </div>

            {showSuggestions && (
              <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white rounded-[var(--r-tile)] shadow-[var(--shadow-float)] border border-[var(--line-soft)] max-h-60 overflow-y-auto">
                {drugSuggestions.length === 0 ? (
                  <div className="p-3 text-xs text-[var(--text-muted)] flex justify-between items-center">
                    <span>No catalog match. Add as custom injection or other item?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomName(drugSearch);
                        setShowSuggestions(false);
                        setShowCustomItemModal(true);
                      }}
                      className="text-xs text-[var(--green-700)] font-semibold underline"
                    >
                      + Add &ldquo;{drugSearch}&rdquo;
                    </button>
                  </div>
                ) : (
                  drugSuggestions.map((drug) => (
                    <button
                      key={drug.id}
                      type="button"
                      onClick={() => {
                        addMedicine(drug);
                        setShowSuggestions(false);
                      }}
                      className="flex items-center justify-between w-full px-4 py-2.5 text-xs text-left hover:bg-[var(--bg-tile)] transition-colors border-b last:border-0 border-[var(--line-soft)]"
                    >
                      <div>
                        <span className="font-medium text-[var(--text-strong)]">{drug.name}</span>
                        <span className="text-[var(--text-faint)] ml-2 capitalize">({drug.drug_type})</span>
                        {drug.schedule_h && (
                          <span className="ml-2 text-[9px] bg-red-100 text-red-700 px-1 py-0.5 rounded font-bold">SCH H</span>
                        )}
                      </div>
                      <span className="text-[11px] text-[var(--green-700)] font-medium">
                        Stock: {drug.stock_quantity}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Modal / Panel for Free-Text Injections or Custom Items (PRD v1.1 Rule) */}
          {showCustomItemModal && (
            <div className="mb-4 p-4 rounded-[var(--r-tile)] bg-[var(--sage-100)] border border-[var(--green-600)] text-xs">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 font-semibold text-[var(--green-900)]">
                  <Syringe size={16} />
                  <span>Add Injection or Other Clinical Item (Free-Text Line)</span>
                </div>
                <button type="button" onClick={() => setShowCustomItemModal(false)} className="text-[var(--text-muted)]">
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-[var(--text-strong)] mb-1">Item Name *</label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. Inj. Tetanus Toxoid 0.5ml IM / IV Fluid NS 500ml"
                    className="h-9 w-full rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] px-3 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-strong)] mb-1">Item Type</label>
                  <select
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value as DrugType)}
                    className="h-9 w-full rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] px-2 text-xs"
                  >
                    <option value="injection">Injection (Vial / Ampoule)</option>
                    <option value="syrup">Syrup (Bottle)</option>
                    <option value="tablet">Tablet</option>
                    <option value="capsule">Capsule</option>
                    <option value="other">Other (Drops, Ointment, Dressing)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-[var(--green-300)]">
                <div className="flex items-center gap-3">
                  <span className="text-[var(--text-muted)]">Quantity:</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={customQty}
                    onChange={(e) => setCustomQty(Number(e.target.value) || 1)}
                    className="h-8 w-16 rounded-[var(--r-control)] bg-white text-center border border-[var(--line-soft)] text-xs font-semibold"
                  />
                  <span className="text-[var(--text-faint)] capitalize">({customType === 'syrup' ? '1 bottle default' : customUnit})</span>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setShowCustomItemModal(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleAddCustomItem}>
                    Add to Prescription
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Medicine List */}
          {medicines.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] text-center py-6">
              No medicines prescribed yet. Search above or pick a quick diagnosis template.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {medicines.map((m) => (
                <div
                  key={m.id}
                  className="bg-[var(--bg-tile)] rounded-[var(--r-tile)] p-4 border border-[var(--line-soft)]"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-[var(--text-strong)]">{m.name}</p>
                        <span className="text-[10px] uppercase text-[var(--text-muted)] font-medium px-2 py-0.5 bg-white rounded-full border border-[var(--line-soft)]">
                          {m.type}
                        </span>
                        {m.isCustom && (
                          <span className="text-[9px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-bold">
                            Other Item
                          </span>
                        )}
                        {m.addedByPharmacist && (
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1 shadow-2xs">
                            💊 Added by Pharmacist
                          </span>
                        )}
                      </div>
                      {m.pharmacistNotes && (
                        <p className="text-[11px] text-emerald-700 font-medium mt-1">
                          Pharmacy Note: {m.pharmacistNotes}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMedicine(m.id)}
                      className="h-7 w-7 flex items-center justify-center rounded-full bg-[var(--danger-bg)] text-[var(--danger)] hover:brightness-95 transition-all"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Timing Checkboxes */}
                  <div className="flex flex-wrap gap-4 mb-3 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={m.morning}
                        onChange={(e) => updateMedicine(m.id, 'morning', e.target.checked)}
                        className="accent-[var(--green-900)] h-4 w-4 rounded"
                      />
                      <span>Morning</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={m.afternoon}
                        onChange={(e) => updateMedicine(m.id, 'afternoon', e.target.checked)}
                        className="accent-[var(--green-900)] h-4 w-4 rounded"
                      />
                      <span>Afternoon</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={m.night}
                        onChange={(e) => updateMedicine(m.id, 'night', e.target.checked)}
                        className="accent-[var(--green-900)] h-4 w-4 rounded"
                      />
                      <span>Night</span>
                    </label>
                  </div>

                  {/* Food Relation & Days */}
                  <div className="flex items-center justify-between gap-4 flex-wrap text-xs pt-2 border-t border-[var(--line-soft)]">
                    <div className="flex gap-4">
                      {(['before_food', 'after_food'] as const).map((r) => (
                        <label key={r} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name={`rel-${m.id}`}
                            checked={m.relation === r}
                            onChange={() => updateMedicine(m.id, 'relation', r)}
                            className="accent-[var(--green-900)]"
                          />
                          <span>{r === 'before_food' ? 'Before Food' : 'After Food'}</span>
                        </label>
                      ))}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[var(--text-muted)]">Days:</span>
                        <input
                          type="number"
                          min={1}
                          max={90}
                          value={m.days}
                          onChange={(e) => updateMedicine(m.id, 'days', Number(e.target.value) || 1)}
                          className="h-8 w-14 rounded-[var(--r-control)] bg-white text-center border border-[var(--line-soft)] text-xs font-medium"
                        />
                      </div>
                      <div className="text-[var(--text-muted)]">
                        Suggested Qty: <strong className="text-[var(--text-strong)]">{m.qty}</strong> {m.type === 'syrup' ? 'bottle' : 'units'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Card 2: Lab Tests */}
        <Card>
          <CardHeader title="Diagnostic & Lab Tests" count={labTests.length} />
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
            <input
              type="text"
              value={labSearch}
              onChange={(e) => setLabSearch(e.target.value)}
              placeholder="Search & order tests (e.g. CBC, Blood Glucose, Lipid, ECG, X-Ray)..."
              className="h-10 w-full rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] pl-9 pr-3 text-xs"
            />
          </div>

          {labSearch && labSuggestions.length > 0 && (
            <div className="flex flex-col gap-1 mb-3 bg-white p-2 rounded-[var(--r-tile)] border border-[var(--line-soft)] max-h-48 overflow-y-auto">
              {labSuggestions.slice(0, 6).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setLabTests((prev) => [...prev, t]);
                    setLabSearch('');
                  }}
                  className="flex items-center gap-2 text-xs text-left px-3 py-2 rounded-[var(--r-control)] hover:bg-[var(--bg-tile)] transition-colors text-[var(--text-body)]"
                >
                  <Plus size={14} className="text-[var(--green-600)]" />
                  {t}
                </button>
              ))}
            </div>
          )}

          {labTests.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {labTests.map((t) => (
                <div
                  key={t}
                  className="flex items-center gap-1.5 bg-[var(--sage-100)] text-[var(--green-900)] px-3 py-1.5 rounded-[var(--r-pill)] text-xs font-medium"
                >
                  <span>{t}</span>
                  <button
                    type="button"
                    onClick={() => setLabTests((prev) => prev.filter((x) => x !== t))}
                    className="hover:text-red-700"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Card 3: Instructions & Follow-up */}
        <Card>
          <h3 className="text-[18px] font-medium text-[var(--text-strong)] mb-3">Advice & Follow-Up</h3>
          <div className="flex flex-col gap-4">
            <Textarea
              label="Clinical Advice / Free-Text Instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Advice on diet, lifestyle, hydration or rest..."
              rows={3}
            />

            <Input
              label="Additional Note (Printed doctor's advice note)"
              value={additionalNote}
              onChange={(e) => setAdditionalNote(e.target.value)}
              placeholder="e.g. Please follow the doctor's advice. Consult the hospital if symptoms worsen."
            />

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[var(--text-strong)]">Follow-Up Date</label>
                <span className="text-[11px] text-[var(--text-muted)]">Sends automated WhatsApp reminder</span>
              </div>

              {/* Quick Date Chips */}
              <div className="flex flex-wrap gap-2 mb-2">
                {[
                  { label: '+3 Days', days: 3 },
                  { label: '+5 Days', days: 5 },
                  { label: '+7 Days (1 Wk)', days: 7 },
                  { label: '+10 Days', days: 10 },
                  { label: '+14 Days (2 Wks)', days: 14 },
                ].map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => setFollowUpInDays(c.days)}
                    className="text-xs px-2.5 py-1 rounded-[var(--r-pill)] bg-[var(--bg-tile)] hover:bg-[var(--sage-100)] text-[var(--text-body)] font-medium transition-colors"
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <input
                type="date"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                className="h-10 rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] px-3 text-xs text-[var(--text-body)]"
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Mobile Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[var(--line-soft)] p-4 shadow-[var(--shadow-float)]">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="hidden sm:block text-xs text-[var(--text-muted)]">
            Token #{String(token).padStart(2, '0')} · {medicines.length} medicines · {labTests.length} tests
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              variant="secondary"
              icon={<Send size={16} />}
              onClick={handleSaveOnly}
              className="flex-1 sm:flex-initial"
            >
              Send to Pharmacy
            </Button>

            <Button
              icon={<Printer size={16} />}
              onClick={handleSaveAndPrint}
              className="flex-1 sm:flex-initial bg-[var(--green-900)] text-white"
            >
              Send to Pharmacy & Print
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
