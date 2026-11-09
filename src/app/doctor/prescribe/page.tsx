'use client';

import { useState, useRef, useEffect, useMemo, Suspense } from 'react';
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
  Pill,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardHeader, Button, Textarea, Input, StatusPill } from '@/components/ui';
import { BrandLogo } from '@/components/ui/brand-logo';
import {
  useDoctors,
  useHospitalSettings,
  usePatients,
  useVisits,
  usePrescriptions,
} from '@/lib/query/hooks';
import { queryKeys } from '@/lib/query/keys';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/context';
import { calculateSmartQuantity, generateUUID } from '@/lib/utils/quantity';
import { createClient } from '@/lib/supabase/client';
import { broadcastChange } from '@/lib/realtime/realtime-provider';
import { pushPrescriptionToSupabase, pushVisitToSupabase, isSupabaseConfigured, withTimeout } from '@/lib/supabase/sync';
import { recordAuditLog } from '@/lib/audit/logger';
import { CLINICAL_MEDICINES, type ClinicalMedicine } from '@/lib/data/medicines';
import type { PrescriptionItem, LabTestOrder, Prescription, Visit } from '@/lib/types/database';
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
  drugId?: string;
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
      <PrescribeContentKeyed />
    </Suspense>
  );
}

/**
 * Wrapper that forces a full remount of PrescribeContent whenever
 * the URL search params change (visitId / patientId).
 * Without this, router.push to the same /doctor/prescribe route
 * preserves all React state — medicines, instructions, follow-up —
 * from the previous patient, causing prescription bleed-through.
 */
function PrescribeContentKeyed() {
  const searchParams = useSearchParams();
  const visitId = searchParams.get('visitId') || '';
  const patientId = searchParams.get('patientId') || '';
  // The key guarantees React unmounts old state and creates fresh state
  return <PrescribeContent key={`${visitId}-${patientId}`} />;
}

function PrescribeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const drugs = CLINICAL_MEDICINES;
  const { data: doctors = [] } = useDoctors();
  const { data: settings = { hospital_name: 'RADHAKRISHNA HOSPITAL' } as any } = useHospitalSettings();
  const { data: patients = [] } = usePatients();
  const { data: visits = [] } = useVisits();
  const { data: prescriptions = [] } = usePrescriptions();

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

  // Load existing prescription specifically for this visit or admission (prevent bleed-through of old visits)
  const existingRx = useMemo(() => {
    if (!prescriptions || prescriptions.length === 0) return null;
    if (visitId) {
      return prescriptions.find((p) => p.visit_id === visitId) || null;
    }
    if (uaid && stayDayNumber !== undefined) {
      return prescriptions.find((p) => p.uaid === uaid && p.stay_day_number === stayDayNumber) || null;
    }
    if (patientId) {
      const today = new Date().toISOString().split('T')[0];
      return prescriptions.find((p) => p.patient_id === patientId && p.created_at?.startsWith(today)) || null;
    }
    return null;
  }, [prescriptions, visitId, uaid, stayDayNumber, patientId]);

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
      }));
    }
    return [];
  });

  const loadedRxIdRef = useRef<string | null>(existingRx?.id || null);
  const loadedRxItemsLenRef = useRef<number>(existingRx?.items?.length || 0);

  // Keep prescription state in sync if loaded prescription updates
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
  const [printLayout, setPrintLayout] = useState<'A4' | 'A5' | 'thermal'>(
    settings?.prescription_paper_size === 'thermal_80mm' ? 'thermal' : (settings?.prescription_paper_size as any) || 'A4'
  );
  const [queuedPrinterSuccess, setQueuedPrinterSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Drug inventory search & catalog state
  const [drugSearch, setDrugSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'tablet' | 'injection' | 'syrup' | 'capsule' | 'other'>('all');
  const searchRef = useRef<HTMLDivElement>(null);

  // Custom Item Modal/Drawer State
  const [showCustomItemModal, setShowCustomItemModal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customType, setCustomType] = useState<'tablet' | 'capsule' | 'syrup' | 'injection' | 'other'>('injection');
  const [customUnit, setCustomUnit] = useState('vial');
  const [customQty, setCustomQty] = useState(1);
  const [customMorning, setCustomMorning] = useState(true);
  const [customAfternoon, setCustomAfternoon] = useState(false);
  const [customNight, setCustomNight] = useState(false);
  const [customDays, setCustomDays] = useState(1);
  const [customRelation, setCustomRelation] = useState<'before_food' | 'after_food'>('after_food');

  const filteredCatalog = useMemo(() => {
    return drugs.filter((d) => {
      if (selectedCategory === 'all') return true;
      if (selectedCategory === 'other') {
        return !['tablet', 'injection', 'syrup', 'capsule'].includes(d.drug_type);
      }
      return d.drug_type === selectedCategory;
    });
  }, [drugs, selectedCategory]);

  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const drugSuggestions = useMemo(() => {
    return drugs.filter((d) => {
      const matchesCategory =
        selectedCategory === 'all'
          ? true
          : selectedCategory === 'other'
          ? !['tablet', 'injection', 'syrup', 'capsule'].includes(d.drug_type)
          : d.drug_type === selectedCategory;
      if (!matchesCategory) return false;

      if (!drugSearch.trim()) return true;
      const q = drugSearch.toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        d.drug_type.toLowerCase().includes(q)
      );
    });
  }, [drugs, selectedCategory, drugSearch]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [drugSearch, selectedCategory]);

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
      const current = visits.find((v) => v.id === visitId);
      if (current && current.status === 'waiting') {
        queryClient.setQueriesData<Visit[]>({ queryKey: queryKeys.visits.all }, (old) =>
          old ? old.map((v) => (v.id === visitId ? { ...v, status: 'in_consultation' } : v)) : []
        );
        broadcastChange('visit_updated', { visit: { id: visitId, status: 'in_consultation' } });
        createClient()
          .from('visits')
          .update({ status: 'in_consultation', updated_at: new Date().toISOString() })
          .eq('id', visitId)
          .then(() => {});
      }
    }
  }, [visitId, visits, queryClient]);

  // Smart quantity helper
  function getSuggestedQty(type: string, m: boolean, a: boolean, n: boolean, days: number, customQ?: number) {
    return calculateSmartQuantity(type, m, a, n, days, customQ);
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

  async function executeSavePrescription(): Promise<string> {
    const rxId = savedRxId || existingRx?.id || generateUUID();
    const rxItems: PrescriptionItem[] = medicines.map((m) => ({
      id: m.id?.includes('-') && m.id.length === 36 ? m.id : generateUUID(),
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
      item_type: m.type as any,
      custom_unit: m.customUnit,
      created_at: new Date().toISOString(),
    }));

    const rxLabOrders: LabTestOrder[] = labTests.map((t) => ({
      id: generateUUID(),
      prescription_id: rxId,
      test_name: t,
      created_at: new Date().toISOString(),
    }));

    const validPatientId = patientId || activePatient?.id || activeVisit?.patient_id || generateUUID();
    const targetVisitId = visitId || activeVisit?.id || (validPatientId && visits.find((v) => v.patient_id === validPatientId && (v.status === 'waiting' || v.status === 'in_consultation'))?.id) || generateUUID();

    const rxPayload: Prescription = {
      id: rxId,
      visit_id: targetVisitId,
      doctor_id: doctorId || user?.doctorId || user?.id || generateUUID(),
      patient_id: validPatientId,
      notes: instructions,
      uaid: uaid || undefined,
      stay_day_number: stayDayNumber,
      items: rxItems,
      lab_tests: rxLabOrders,
      created_at: new Date().toISOString(),
    };

    // 1. Immediately save into query cache (zero latency)
    queryClient.setQueriesData<Prescription[]>({ queryKey: queryKeys.prescriptions.all }, (old) =>
      old ? [rxPayload, ...old.filter((p) => p.id !== rxId)] : [rxPayload]
    );

    // 2. Ensure visit record is strictly moved to 'prescribed' in query cache
    let finalVisitId = targetVisitId;
    const existing = visits.find((v) => v.id === targetVisitId);
    const updatedVisit: Visit = existing
      ? {
          ...existing,
          status: 'completed' as const,
          follow_up_date: followUp || existing.follow_up_date,
          instructions: instructions || existing.instructions,
          updated_at: new Date().toISOString(),
        }
      : {
          id: targetVisitId,
          visit_number: `V-${token}`,
          patient_id: validPatientId,
          doctor_id: doctorId || user?.doctorId || user?.id || generateUUID(),
          token_number: Number(token) || 1,
          status: 'completed' as const,
          follow_up_date: followUp || undefined,
          instructions: instructions,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
    finalVisitId = updatedVisit.id;

    // Optimistically update React Query cache for visits (<1ms)
    queryClient.setQueriesData<Visit[]>({ queryKey: queryKeys.visits.all }, (old) =>
      old
        ? old.map((v) =>
            v.id === updatedVisit.id || v.id === targetVisitId
              ? updatedVisit
              : v
          )
        : [updatedVisit]
    );
    queryClient.setQueriesData<Prescription[]>({ queryKey: queryKeys.prescriptions.all }, (old) =>
      old ? [rxPayload, ...old.filter((p) => p.id !== rxPayload.id)] : [rxPayload]
    );

    // Broadcast prescription creation to all terminals (<30ms)
    broadcastChange('prescription_created', { prescription: rxPayload, visit: updatedVisit });

    // 3. Update Supabase visit status to 'completed' immediately so queue reflects completion
    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const updatePayload = {
          status: 'completed' as const,
          follow_up_date: followUp || null,
          instructions: instructions || null,
          updated_at: new Date().toISOString(),
        };
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(finalVisitId)) {
          await supabase.from('visits').update(updatePayload).eq('id', finalVisitId);
        }
      } catch (uErr) {
        console.warn('Error updating visit status to completed:', uErr);
      }
    }

    // Push prescription & items in background
    pushPrescriptionToSupabase(rxPayload).catch((pErr) => {
      console.warn('Concurrent pushPrescriptionToSupabase warning:', pErr);
    });

    // Record audit log for prescription creation / update
    recordAuditLog({
      action: 'PRESCRIPTION_ISSUED',
      entity_type: 'prescription',
      entity_id: rxId,
      user_id: user?.id,
      user_name: user?.fullName || 'Consultant Doctor',
      user_role: 'doctor',
      details: `Prescription saved for ${activePatient?.name || patientName} (${rxItems.length} medicines, ${rxLabOrders.length} lab tests)`,
      new_data: {
        rx_id: rxId,
        patient_name: activePatient?.name || patientName,
        uhid: activePatient?.uhid || uhid,
        items_count: rxItems.length,
        lab_tests_count: rxLabOrders.length,
        diagnosis: diagnosis || null,
      },
    });

    queryClient.invalidateQueries({ queryKey: queryKeys.visits.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.prescriptions.all });

    setSavedRxId(rxId);
    return rxId;
  }

  async function handleSaveAndPrint() {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await executeSavePrescription();
      setShowPrintView(true);
      setTimeout(() => {
        window.print();
      }, 350);
    } catch (err) {
      console.error('Save and print error:', err);
      setShowPrintView(true);
      setTimeout(() => {
        window.print();
      }, 350);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveOnly() {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await executeSavePrescription();
      setShowPrintView(true);
    } catch (err) {
      console.error('Save only error:', err);
      setShowPrintView(true);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSendToHospitalPrinter() {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await executeSavePrescription();
      const printerName = settings?.default_printer || 'Hospital Network Printer';
      setQueuedPrinterSuccess(`Prescription sent to ${printerName}. Printing now at Hospital reception.`);
      setTimeout(() => setQueuedPrinterSuccess(null), 5000);
    } finally {
      setIsSaving(false);
    }
  }

  const [isNavigatingNext, setIsNavigatingNext] = useState(false);

  async function handleNextPatient() {
    setIsNavigatingNext(true);
    try {
      const activeDoctor = doctorId || user?.doctorId || user?.id;
      const targetPatientId = patientId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(patientId) ? patientId : (activePatient?.id || null);
      const targetId = visitId || activeVisit?.id || (targetPatientId && visits.find((v) => v.patient_id === targetPatientId)?.id);

      // 1. Force optimistic update in React Query cache so previous patient is immediately marked 'completed'
      queryClient.setQueriesData<Visit[]>({ queryKey: queryKeys.visits.all }, (old) => {
        if (!old) return [];
        return old.map((v) =>
          v.id === targetId || (targetPatientId && v.patient_id === targetPatientId)
            ? { ...v, status: 'completed' as const, updated_at: new Date().toISOString() }
            : v
        );
      });

      // Broadcast visit update to all terminals (<30ms)
      broadcastChange('visit_updated', { visit: { id: targetId, status: 'completed' } });

      // 2. Direct Supabase update
      if (isSupabaseConfigured()) {
        const supabase = createClient();
        const updatePayload = {
          status: 'completed' as const,
          follow_up_date: followUp || null,
          instructions: instructions || null,
          updated_at: new Date().toISOString(),
        };
        if (targetId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)) {
          await supabase.from('visits').update(updatePayload).eq('id', targetId);
        }
      }

      await queryClient.invalidateQueries({ queryKey: queryKeys.visits.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.prescriptions.all });

      // 3. Find next waiting patient in the queue for this doctor
      const nextVisit = visits.find((v) => {
        const belongsToDoctor = !v.doctor_id || (activeDoctor && v.doctor_id === activeDoctor);
        const isNotCurrent = v.id !== targetId && (!targetPatientId || v.patient_id !== targetPatientId);
        return belongsToDoctor && isNotCurrent && v.status === 'waiting';
      });

      setShowPrintView(false);

      if (nextVisit) {
        broadcastChange('visit_updated', { visit: { id: nextVisit.id, status: 'in_consultation' } });
        const nextPatient = patients.find((p) => p.id === nextVisit.patient_id);
        const nextUrl = `/doctor/prescribe?visitId=${nextVisit.id}&patientId=${nextVisit.patient_id}&token=${nextVisit.token_number}&name=${encodeURIComponent(
          nextPatient?.name || 'Patient'
        )}&uhid=${nextPatient?.uhid || ''}&age=${nextPatient?.age || ''}&doctorId=${nextVisit.doctor_id || activeDoctor}`;
        router.push(nextUrl);
      } else {
        router.push('/doctor');
      }
    } catch (err) {
      console.warn('Error navigating to next patient:', err);
      router.push('/doctor');
    } finally {
      setIsNavigatingNext(false);
    }
  }

  const [currentDateFormatted, setCurrentDateFormatted] = useState('');
  const [currentTimeFormatted, setCurrentTimeFormatted] = useState('');

  useEffect(() => {
    setCurrentDateFormatted(
      new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    );
    setCurrentTimeFormatted(
      new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    );
  }, []);

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
        <div className="no-print mb-5 p-4 sm:p-5 rounded-[var(--r-tile)] bg-[#ECFDF5] border-2 border-[#A7F3D0] text-xs text-[#065F46] flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[#059669] text-white flex items-center justify-center shadow-xs shrink-0">
              <CheckCircle size={22} />
            </div>
            <div>
              <p className="font-bold text-sm sm:text-base text-[#065F46] leading-tight">
                Consultation Complete: Prescription Issued
              </p>
              <p className="text-[#047857] text-xs mt-0.5 font-medium">
                Prescription issued for Patient Token #{String(token).padStart(2, '0')} ({patientName}). Consultation is marked complete.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleNextPatient}
            loading={isNavigatingNext}
            className="bg-[#0D5C52] hover:bg-[#0A4D44] text-white shrink-0 min-h-[42px] px-5 font-bold shadow-xs cursor-pointer"
          >
            Next Patient in Queue →
          </Button>
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
                  Prescription Finalized & Consultation Completed
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Patient Token #{String(token).padStart(2, '0')} · {patientName} · {doctor.full_name}
                  {uaid ? ` · In-Patient UAID: ${uaid} (Day ${stayDayNumber || 1})` : ''}
                </p>
              </div>
            </div>

            {/* Print Options & Format Toggles */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Paper Size Selector (All Printers Supported: A4 Laser, A5 Pad, 80mm Thermal POS) */}
              <div className="flex items-center bg-white rounded-[var(--r-pill)] border border-[var(--line-soft)] p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setPrintLayout('A4')}
                  className={`px-2.5 py-1 rounded-[var(--r-pill)] font-medium transition-colors cursor-pointer ${printLayout === 'A4' ? 'bg-[var(--green-900)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-strong)]'}`}
                  title="Standard A4 Paper (Laser / Inkjet desktop printers)"
                >
                  A4 Sheet
                </button>
                <button
                  type="button"
                  onClick={() => setPrintLayout('A5')}
                  className={`px-2.5 py-1 rounded-[var(--r-pill)] font-medium transition-colors cursor-pointer ${printLayout === 'A5' ? 'bg-[var(--green-900)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-strong)]'}`}
                  title="A5 Half Sheet (Doctor OPD Prescription Pad)"
                >
                  A5 Pad
                </button>
                <button
                  type="button"
                  onClick={() => setPrintLayout('thermal')}
                  className={`px-2.5 py-1 rounded-[var(--r-pill)] font-medium transition-colors cursor-pointer ${printLayout === 'thermal' ? 'bg-[var(--green-900)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-strong)]'}`}
                  title="80mm Thermal POS Receipt Roll (TVS, Epson, Star, Citizen POS printers)"
                >
                  80mm Thermal
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

              <button
                type="button"
                onClick={() => {
                  setShowPrintView(false);
                  router.push('/doctor');
                }}
                className="h-8 px-3 text-xs rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] text-[var(--text-strong)] hover:bg-[var(--bg-tile)] font-medium inline-flex items-center justify-center transition-all cursor-pointer shadow-xs"
              >
                Back to Doctor Queue
              </button>
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

          if (printLayout === 'thermal') {
            return (
              <div
                id="printable-prescription"
                className="paper-thermal max-w-[76mm] p-3 text-black font-mono text-xs leading-tight mx-auto bg-white shadow-md border border-gray-300"
              >
                {/* 1. Header: Hospital Brand & Info */}
                <div className="text-center pb-2 border-b border-dashed border-black space-y-0.5">
                  <h1 className="font-bold text-sm uppercase leading-tight tracking-wide">
                    {settings.hospital_name || 'RADHA KRISHNA HOSPITAL'}
                  </h1>
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-800">
                    {settings.prescription_header || 'MULTISPECIALITY CARE'}
                  </p>
                  <p className="text-[8.5px] text-gray-600">
                    {settings.address || 'Ward No. 10, Near Rama Mandir Road, NR Extension, Chintamani, Karnataka'}
                  </p>
                  {settings.phone && (
                    <p className="text-[8.5px] text-gray-600">Ph: {settings.phone}</p>
                  )}
                  <p className="text-[10px] font-bold uppercase tracking-widest pt-1 border-t border-dotted border-gray-400 mt-1">
                    OPD PRESCRIPTION
                  </p>
                </div>

                {/* 2. Patient Details */}
                <div className="py-1.5 border-b border-dashed border-black text-[10px] space-y-0.5">
                  <div className="flex justify-between items-baseline">
                    <span>Patient: <strong>{patientName}</strong></span>
                    <span>{age}Y / {patientGender}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span>UHID: <strong className="font-mono">{uhid}</strong></span>
                    <span>Mob: {patientPhone || activePatient?.phone || '—'}</span>
                  </div>
                  <div className="flex justify-between items-baseline text-gray-700 text-[9px]">
                    <span>Date: {currentDateFormatted}</span>
                    <span>Time: {currentTimeFormatted}</span>
                  </div>
                </div>

                {/* 3. Doctor Details */}
                <div className="py-1.5 border-b border-dashed border-black text-[10px]">
                  <div>Doctor: <strong>{doctor.full_name}</strong></div>
                  <div className="text-[9px] text-gray-700">
                    {doctor.qualification || doctor.specialization || 'MBBS, MD'} | Reg: {doctor.reg_number || 'KMC-48291'}
                  </div>
                </div>

                {/* 4. Diagnosis */}
                <div className="py-1.5 border-b border-dashed border-black text-[10px]">
                  <span className="font-bold uppercase">Diagnosis: </span>
                  <span className="text-gray-900">{diagnosis || 'Clinical evaluation & symptomatic management'}</span>
                </div>

                {/* 5. Medicines (Rx) */}
                <div className="py-1.5 border-b border-dashed border-black">
                  <div className="font-bold uppercase text-[10px] mb-1">DRUGS (Rx):</div>
                  <div className="divide-y divide-dotted divide-gray-300 space-y-1">
                    {medicines.map((m, idx) => {
                      const freq = `${m.morning ? '1' : '0'}-${m.afternoon ? '1' : '0'}-${m.night ? '1' : '0'}`;
                      const timing = m.relation === 'before_food' ? 'Before food' : 'After food';
                      const unit = m.type === 'syrup' ? '1 Bottle' : m.type === 'injection' ? '1 Vial' : '1 Tab';

                      return (
                        <div key={m.id || idx} className="pt-1 text-[10px]">
                          <div className="flex justify-between font-bold items-baseline">
                            <span>{idx + 1}. {m.name}</span>
                            <span>{m.days}d</span>
                          </div>
                          <div className="text-[9px] text-gray-700 pl-2">
                            {unit} • Dose: {freq} • {timing}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Diagnostic & Lab Test Orders (if any) */}
                {labTests.length > 0 && (
                  <div className="py-1.5 border-b border-dashed border-black text-[10px]">
                    <div className="font-bold uppercase text-[9.5px]">LAB TESTS ORDERED:</div>
                    <div className="text-[9px] text-gray-800 pl-2">
                      {labTests.map((t, idx) => `${idx + 1}. ${t}`).join(', ')}
                    </div>
                  </div>
                )}

                {/* 6. Instructions */}
                <div className="py-1.5 border-b border-dashed border-black text-[10px]">
                  <div className="font-bold uppercase text-[9.5px]">INSTRUCTIONS:</div>
                  <div className="text-[9px] text-gray-800 pl-2 space-y-0.5">
                    {instructionLines.map((line, idx) => (
                      <p key={idx}>{idx + 1}. {line}</p>
                    ))}
                  </div>
                </div>

                {/* 7. Follow Up */}
                <div className="py-1.5 border-b border-dashed border-black text-[10px]">
                  <div className="font-bold uppercase text-[9.5px]">FOLLOW UP:</div>
                  <p className="text-[9px] text-gray-800 pl-2">
                    {followUp ? `${followUpFormatted} / after ${followUpDaysDiff} days` : 'Review as needed / return SOS'}
                  </p>
                </div>

                {/* 8. Additional Note */}
                {additionalNote && (
                  <div className="py-1.5 border-b border-dashed border-black text-[9px] text-gray-700">
                    <span className="font-semibold">Note: </span>
                    <span>{additionalNote}</span>
                  </div>
                )}

                {/* 9. Doctor Signature Block */}
                <div className="pt-3 text-center text-[10px]">
                  <div className="h-6 border-b border-gray-400 w-28 mx-auto mb-1"></div>
                  <p className="font-bold">{doctor.full_name}</p>
                  <p className="text-[8.5px] text-gray-600">Doctor&apos;s Signature / Seal</p>
                  <p className="text-[8px] text-gray-500 mt-2">Please follow advice · Consult if symptoms worsen</p>
                  <p className="text-[7.5px] text-gray-400 font-sans mt-0.5">Radha Krishna HMS · opti-x.in</p>
                </div>
              </div>
            );
          }

          return (
            <div
              id="printable-prescription"
              className={`bg-white text-black font-sans mx-auto shadow-md border border-gray-300 ${
                printLayout === 'A5'
                  ? 'paper-a5 max-w-[148mm] min-h-[210mm] p-6 text-[11px]'
                  : 'paper-a4 max-w-[210mm] min-h-[297mm] p-8 sm:p-12 text-xs'
              }`}
              style={{ minHeight: printLayout === 'A5' ? '210mm' : '297mm' }}
            >
              {/* 1. Header: Hospital Brand & Info */}
              <div className="flex justify-between items-start pb-2 border-b-2 border-[#134e4a]">
                <div className="flex items-center gap-3">
                  <BrandLogo className="h-12 w-auto object-contain" />
                  <div>
                    <h1 className="font-serif text-2xl sm:text-[28px] font-bold tracking-wide text-[#134e4a] uppercase leading-tight">
                      {settings.hospital_name || 'RADHA KRISHNA HOSPITAL'}
                    </h1>
                    <p className="font-serif text-[11px] sm:text-xs font-semibold tracking-[0.2em] text-gray-800 uppercase mt-0.5">
                      {settings.prescription_header || 'MULTISPECIALITY CARE'}
                    </p>
                    <p className="text-[10px] sm:text-[11px] text-gray-600 mt-1">
                      {settings.address || 'Ward No. 10, Near Rama Mandir Road, NR Extension, Chintamani, Karnataka'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-serif text-sm sm:text-base font-bold text-[#b91c1c] uppercase tracking-wider">
                    PRESCRIPTION
                  </p>
                  <p className="italic text-[10px] sm:text-[11px] text-gray-500 mt-0.5">
                    Powered by opti-x.in
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
                          </span>
                          <span className="font-semibold text-black text-right">
                            {m.days} days
                          </span>
                        </div>
                        <div className="pl-4 text-[11px] sm:text-xs text-gray-700 mt-0.5">
                          {unit} &nbsp;•&nbsp; Dose: {freq} &nbsp;•&nbsp; {timing}
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
                <div className="text-[10px] sm:text-[11px] text-gray-600 max-w-sm space-y-0.5">
                  <p className="italic">Please follow the doctor&apos;s advice. Consult the hospital if symptoms worsen.</p>
                  <p className="text-[9px] text-gray-500 font-sans">Radha Krishna HMS · Engineered by opti-x.in</p>
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
    <div className="pb-36 lg:pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
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
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold font-[family-name:var(--font-heading)] text-[var(--text-strong)] tracking-tight leading-tight">
              Consultation · Token #{String(token).padStart(2, '0')}
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Patient: <strong>{patientName}</strong> ({age}y · UHID: {uhid}) · Consultant: <strong>{doctor.full_name}</strong>
              {uaid ? ` · In-Patient UAID: ${uaid} (Stay Day ${stayDayNumber || 1})` : ''}
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2.5 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            icon={<CheckCircle size={14} />}
            onClick={handleSaveOnly}
            loading={isSaving}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save & Complete'}
          </Button>

          <Button
            size="sm"
            icon={<Printer size={14} />}
            onClick={handleSaveAndPrint}
            loading={isSaving}
            disabled={isSaving}
            className="bg-[var(--green-900)] text-white"
          >
            {isSaving ? 'Saving...' : 'Save & Print Prescription'}
          </Button>
        </div>
      </div>

      {/* Clinical Template Shortcuts */}
      <div className="mb-5 bg-[var(--bg-card)] p-3 sm:p-3.5 rounded-[var(--r-tile)] border border-[var(--line-soft)]">
        <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-[var(--text-strong)]">
          <Sparkles size={14} className="text-[var(--gold-500)]" />
          <span>Quick Diagnosis Presets (1-Click Templates):</span>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 snap-x">
          {CLINICAL_TEMPLATES.map((tpl) => (
            <button
              key={tpl.name}
              type="button"
              onClick={() => applyTemplate(tpl)}
              className="text-xs px-3 py-1.5 rounded-[var(--r-pill)] bg-white border border-[var(--line-soft)] hover:border-[var(--green-600)] hover:bg-[var(--sage-100)] text-[var(--text-body)] transition-all font-medium shrink-0 min-h-[36px] snap-start"
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <CardHeader title="Rx: Prescribe Medications & Injections" count={medicines.length} />
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Select from standard clinical medicines formulary, or add custom injections and items.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus size={14} />}
                onClick={() => setShowCustomItemModal(true)}
              >
                + Add Injection / Item
              </Button>
            </div>
          </div>

          {/* Unified Type-and-Select Medicine Combobox */}
          <div ref={searchRef} className="bg-white p-4 sm:p-5 rounded-[var(--r-tile)] border-2 border-[var(--line-soft)] focus-within:border-[var(--green-600)] focus-within:ring-2 focus-within:ring-[rgba(13,148,136,0.2)] shadow-xs transition-all mb-5">
            <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
              <label className="text-xs sm:text-[13px] font-bold text-[var(--text-strong)] flex items-center gap-1.5">
                <Pill size={16} className="text-[var(--green-700)]" />
                <span>Search & Prescribe Clinical Medicines ({drugs.length} formulary):</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCustomName(drugSearch);
                    setShowCustomItemModal(true);
                  }}
                  className="text-xs text-[var(--green-700)] hover:text-[var(--green-900)] font-semibold inline-flex items-center gap-1 bg-[var(--sage-100)] px-2.5 py-1 rounded-[var(--r-control)] border border-[var(--sage-200)] shadow-2xs hover:bg-[var(--sage-200)] transition-colors cursor-pointer"
                >
                  <Syringe size={12} />
                  <span>+ Custom Item / Injection</span>
                </button>
              </div>
            </div>

            {/* Combobox Search & Select Input */}
            <div className="relative">
              <div className="relative flex items-center">
                <Search size={18} className="absolute left-3.5 text-[var(--text-faint)] pointer-events-none" />
                <input
                  type="text"
                  value={drugSearch}
                  onChange={(e) => {
                    setDrugSearch(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setShowSuggestions(true);
                      setHighlightedIndex((prev) => Math.min(prev + 1, Math.max(0, drugSuggestions.length - 1)));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      if (drugSuggestions.length > 0 && drugSuggestions[highlightedIndex]) {
                        addMedicine(drugSuggestions[highlightedIndex]);
                        setShowSuggestions(false);
                      } else if (drugSearch.trim()) {
                        setCustomName(drugSearch);
                        setShowCustomItemModal(true);
                        setShowSuggestions(false);
                      }
                    } else if (e.key === 'Escape') {
                      setShowSuggestions(false);
                    }
                  }}
                  placeholder="Type medicine name (e.g. Paracetamol, Augmentin, Pan 40)..."
                  className="h-12 w-full rounded-[var(--r-control)] bg-[var(--bg-canvas)] border border-[var(--line-soft)] pl-11 pr-20 text-sm font-medium text-[var(--text-strong)] placeholder:text-[var(--text-faint)] focus:bg-white focus:outline-none focus:border-[var(--green-600)] transition-all shadow-2xs"
                />
                <div className="absolute right-2 flex items-center gap-1">
                  {drugSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setDrugSearch('');
                        setShowSuggestions(true);
                      }}
                      className="p-1 text-[var(--text-muted)] hover:text-[var(--text-strong)]"
                      title="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowSuggestions((prev) => !prev)}
                    className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-strong)] hover:bg-[var(--bg-tile)]"
                    title="Toggle catalog list"
                  >
                    <ChevronDown size={16} className={clsx('transition-transform', showSuggestions && 'rotate-180')} />
                  </button>
                </div>
              </div>

              {/* Suggestions / Dropdown Menu */}
              {showSuggestions && (
                <div className="absolute top-full left-0 right-0 mt-1.5 z-40 bg-white rounded-[var(--r-tile)] shadow-[var(--shadow-float)] border border-[var(--line-soft)] overflow-hidden">
                  {/* Category Pills inside Dropdown for Fast One-Click Filtering */}
                  <div className="p-2 border-b border-[var(--line-soft)] bg-[var(--bg-card)] flex items-center gap-1.5 overflow-x-auto scrollbar-none text-xs">
                    {[
                      { id: 'all', label: 'All', count: drugs.length },
                      { id: 'tablet', label: 'Tablets', count: drugs.filter((d) => d.drug_type === 'tablet').length },
                      { id: 'injection', label: 'Injections', count: drugs.filter((d) => d.drug_type === 'injection').length },
                      { id: 'syrup', label: 'Syrups', count: drugs.filter((d) => d.drug_type === 'syrup').length },
                      { id: 'capsule', label: 'Capsules', count: drugs.filter((d) => d.drug_type === 'capsule').length },
                      { id: 'other', label: 'Other', count: drugs.filter((d) => !['tablet', 'injection', 'syrup', 'capsule'].includes(d.drug_type)).length },
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCategory(cat.id as any);
                        }}
                        className={clsx(
                          'px-2.5 py-1 rounded-full text-[11px] font-medium transition-all shrink-0 flex items-center gap-1',
                          selectedCategory === cat.id
                            ? 'bg-[var(--green-900)] text-white shadow-2xs'
                            : 'bg-white text-[var(--text-muted)] border border-[var(--line-soft)] hover:bg-gray-100'
                        )}
                      >
                        <span>{cat.label}</span>
                        <span className="opacity-75">({cat.count})</span>
                      </button>
                    ))}
                  </div>

                  {/* Dropdown Items List */}
                  <div className="max-h-64 overflow-y-auto divide-y divide-[var(--line-soft)]">
                    {drugSuggestions.length === 0 ? (
                      <div className="p-4 text-center">
                        <p className="text-xs text-[var(--text-muted)] mb-2">
                          {drugSearch
                            ? `No medicines matching "${drugSearch}" in clinical formulary.`
                            : 'No medicines in this category.'}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setCustomName(drugSearch);
                            setShowSuggestions(false);
                            setShowCustomItemModal(true);
                          }}
                          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-[var(--r-control)] bg-[var(--green-700)] text-white font-medium hover:bg-[var(--green-900)] shadow-xs"
                        >
                          <Plus size={12} />
                          <span>Add {drugSearch ? `"${drugSearch}"` : 'Medicine'} as Custom Item / Injection</span>
                        </button>
                      </div>
                    ) : (
                      drugSuggestions.map((drug: (typeof drugs)[0], index: number) => {
                        const isAdded = medicines.some((m) => m.drugId === drug.id);
                        const isHighlighted = index === highlightedIndex;

                        return (
                          <div
                            key={drug.id}
                            onClick={() => {
                              addMedicine(drug);
                              setShowSuggestions(false);
                            }}
                            onMouseEnter={() => setHighlightedIndex(index)}
                            className={clsx(
                              'px-3.5 py-2.5 flex items-center justify-between cursor-pointer transition-colors text-xs',
                              isHighlighted ? 'bg-[var(--sage-100)]' : 'hover:bg-[var(--bg-tile)]',
                              isAdded && 'opacity-70 bg-gray-50'
                            )}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="font-semibold text-[var(--text-strong)] truncate">
                                {drug.name}
                              </span>
                              <span
                                className={clsx(
                                   'text-[10px] uppercase px-1.5 py-0.5 rounded font-bold shrink-0',
                                   drug.drug_type === 'injection'
                                     ? 'bg-blue-100 text-blue-800'
                                     : drug.drug_type === 'syrup'
                                     ? 'bg-purple-100 text-purple-800'
                                     : drug.drug_type === 'capsule'
                                     ? 'bg-amber-100 text-amber-800'
                                     : 'bg-emerald-100 text-emerald-800'
                                 )}
                              >
                                {drug.drug_type}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 ml-2">
                              {isAdded ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  <Check size={12} />
                                  <span>Added</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--green-700)] hover:text-[var(--green-900)] bg-white px-2 py-0.5 rounded border border-[var(--line-soft)] shadow-2xs">
                                  <Plus size={12} />
                                  <span>Add</span>
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
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
                    onChange={(e) => setCustomType(e.target.value as any)}
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
                  className="bg-white rounded-[var(--r-tile)] p-4 sm:p-4.5 border border-[var(--line-soft)] shadow-2xs hover:border-[var(--line-strong)] transition-all"
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
                            Custom Item
                          </span>
                        )}
                      </div>
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
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[var(--line-soft)] p-3 sm:p-4 pb-safe shadow-[var(--shadow-float)]">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="hidden sm:block text-xs font-semibold text-[var(--text-strong)]">
            Token #{String(token).padStart(2, '0')} · <span className="font-normal text-[var(--text-muted)]">{medicines.length} medicines · {labTests.length} tests</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <Button
              variant="secondary"
              icon={<CheckCircle size={15} />}
              onClick={handleSaveOnly}
              loading={isSaving}
              disabled={isSaving}
              className="flex-1 sm:flex-initial justify-center min-h-[44px] font-medium"
            >
              {isSaving ? 'Saving...' : 'Save & Complete'}
            </Button>

            <Button
              icon={<Printer size={15} />}
              onClick={handleSaveAndPrint}
              loading={isSaving}
              disabled={isSaving}
              className="flex-1 sm:flex-initial bg-[var(--green-900)] text-white justify-center min-h-[44px] shadow-sm font-bold"
            >
              {isSaving ? 'Saving...' : 'Save & Print Prescription'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
