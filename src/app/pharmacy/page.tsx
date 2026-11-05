'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  ChevronRight,
  AlertTriangle,
  Clock,
  Pill,
  PackageCheck,
  AlertCircle,
  Search,
  ShoppingCart,
  CheckCircle,
  FileText,
  User,
  X,
  Edit2,
  Trash2,
  Check,
  ShieldAlert,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardHeader, Button, StatusPill, SearchInput, Avatar, EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/layout';
import {
  useVisits,
  usePatients,
  useDoctors,
  useDrugs,
  usePrescriptions,
  useDispensings,
  useHospitalSettings,
} from '@/lib/query/hooks';
import { queryKeys } from '@/lib/query/keys';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/context';
import { HMSStore } from '@/lib/store/hms-store';
import { dispensePrescriptionAtomic } from '@/lib/api/mutations';
import { pushDrugToSupabase, deleteDrugFromSupabase } from '@/lib/supabase/sync';
import type { Dispensing, Drug } from '@/lib/types/database';
import { clsx } from 'clsx';

type Tab = 'queue' | 'dispensed' | 'inventory' | 'reorder';

export default function PharmacyPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: visits = [] } = useVisits();
  const { data: patients = [] } = usePatients();
  const { data: doctors = [] } = useDoctors();
  const { data: drugs = [] } = useDrugs();
  const { data: prescriptions = [] } = usePrescriptions();
  const { data: dispensings = [] } = useDispensings();
  const { data: settings = { hospital_name: 'RADHAKRISHNA HOSPITAL' } as any } = useHospitalSettings();

  const [tab, setTab] = useState<Tab>('queue');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('tab');
      if (p && (['queue', 'dispensed', 'inventory', 'reorder'] as Tab[]).includes(p as Tab)) {
        setTab(p as Tab);
      }
    }
  }, []);
  const [invSearch, setInvSearch] = useState('');
  const [dispensedSearch, setDispensedSearch] = useState('');

  // Walk-in (No Prescription) Sale Modal State
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [walkInPatientName, setWalkInPatientName] = useState('');
  const [walkInPatientPhone, setWalkInPatientPhone] = useState('');
  const [walkInPatientUhid, setWalkInPatientUhid] = useState('');
  const [matchedPatientInfo, setMatchedPatientInfo] = useState<string | null>(null);

  // Active item selector (Which Drug, Quantity, Pricing)
  const [walkInSearch, setWalkInSearch] = useState('');
  const [selectedDrug, setSelectedDrug] = useState<Drug | null>(null);
  const [isCustomItem, setIsCustomItem] = useState(false);
  const [customDrugName, setCustomDrugName] = useState('');
  const [customDrugType, setCustomDrugType] = useState('tablet');
  const [itemQuantity, setItemQuantity] = useState<number>(10);
  const [itemUnitPrice, setItemUnitPrice] = useState<number>(0);

  // Added items in current sale bill
  interface WalkInSaleItem {
    id: string;
    drugId?: string;
    name: string;
    drugType: string;
    batchNumber?: string;
    stockAvailable: number;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    isScheduleH: boolean;
  }
  const [walkInItems, setWalkInItems] = useState<WalkInSaleItem[]>([]);
  const [walkInOverrideReason, setWalkInOverrideReason] = useState('');

  // Edit Dispensed Record State
  const [editingDispensing, setEditingDispensing] = useState<Dispensing | null>(null);

  // Edit / Delete Drug Inventory State
  const [editingDrug, setEditingDrug] = useState<Drug | null>(null);
  const [isSavingDrug, setIsSavingDrug] = useState(false);
  const [isDeletingDrugId, setIsDeletingDrugId] = useState<string | null>(null);

  async function handleDeleteDrug(drug: Drug) {
    if (!confirm(`Are you sure you want to delete "${drug.name}" from inventory? This cannot be undone.`)) {
      return;
    }
    setIsDeletingDrugId(drug.id);
    try {
      HMSStore.deleteDrug(drug.id);
      queryClient.setQueriesData<Drug[]>({ queryKey: queryKeys.drugs.all }, (old) =>
        old ? old.filter((d) => d.id !== drug.id) : []
      );
      await deleteDrugFromSupabase(drug.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.drugs.all });
    } catch (err) {
      console.error('Failed to delete drug:', err);
      alert('Failed to delete drug from inventory.');
    } finally {
      setIsDeletingDrugId(null);
    }
  }

  async function handleSaveEditedDrug(e: React.FormEvent) {
    e.preventDefault();
    if (!editingDrug || !editingDrug.name.trim()) return;
    setIsSavingDrug(true);
    try {
      const updated: Drug = {
        ...editingDrug,
        name: editingDrug.name.trim(),
        stock_quantity: Math.max(0, Number(editingDrug.stock_quantity) || 0),
        selling_price: Math.max(0, Number(editingDrug.selling_price) || 0),
        selling_price_per_sheet: editingDrug.selling_price_per_sheet ? Number(editingDrug.selling_price_per_sheet) : undefined,
        purchase_price: Math.max(0, Number(editingDrug.purchase_price) || 0),
        low_stock_limit: Math.max(0, Number(editingDrug.low_stock_limit) || 10),
        updated_at: new Date().toISOString(),
      };
      HMSStore.saveDrug(updated);
      await pushDrugToSupabase(updated);
      await queryClient.invalidateQueries({ queryKey: queryKeys.drugs.all });
      setEditingDrug(null);
    } catch (err) {
      console.error('Failed to save edited drug:', err);
      alert('Failed to save changes to medicine.');
    } finally {
      setIsSavingDrug(false);
    }
  }

  interface PharmacyQueueItem {
    id: string;
    visitId?: string;
    token_number: number;
    patientName: string;
    patientUhid: string;
    patientAge: number;
    doctorName: string;
    medicineCount: number;
    prescriptionId?: string;
    uaid?: string;
    stayDayNumber?: number;
    created_at?: string;
  }

  // Deduplicated merged dispensings (local store + React Query server cache)
  const allDispensingsMerged = useMemo(() => {
    const local = HMSStore.getDispensings();
    const map = new Map<string, Dispensing>();
    // First local
    local.forEach((d) => map.set(d.id, d));
    // Then server
    dispensings.forEach((d) => map.set(d.id, d));
    // Return sorted newest delivered/created first
    return Array.from(map.values()).sort((a, b) => {
      const timeA = new Date(a.delivered_at || a.created_at || 0).getTime();
      const timeB = new Date(b.delivered_at || b.created_at || 0).getTime();
      return timeB - timeA;
    });
  }, [dispensings]);

  // 1. Pending Prescriptions Queue (OPD & IP) - comprehensive cross-matching with zero data loss (memoized O(1) lookups)
  const pendingQueue = useMemo<PharmacyQueueItem[]>(() => {
    const dispensedRxIds = new Set(allDispensingsMerged.map((d) => d.prescription_id).filter(Boolean));
    const dispensedPatientIds = new Set(allDispensingsMerged.map((d) => d.patient_id).filter(Boolean));
    const dispensedVisitIds = new Set([
      ...visits.filter((v) => v.status === 'dispensed' || v.status === 'completed').map((v) => v.id),
      ...allDispensingsMerged.map((d: any) => d.visit_id || d.visitId).filter(Boolean),
      ...HMSStore.getVisits().filter((v) => v.status === 'dispensed' || v.status === 'completed').map((v) => v.id),
    ]);

    const matchedRxIds = new Set<string>();
    const matchedVisitIds = new Set<string>();

    const patientMap = new Map<string, (typeof patients)[0]>();
    patients.forEach((p) => patientMap.set(p.id, p));

    const doctorMap = new Map<string, (typeof doctors)[0]>();
    doctors.forEach((d) => {
      doctorMap.set(d.id, d);
      if ((d as any).user_id) doctorMap.set((d as any).user_id, d);
    });

    const queue: PharmacyQueueItem[] = [];

    // Pass 1: Scan all visits
    visits.forEach((v) => {
      if (
        v.status === 'dispensed' ||
        v.status === 'completed' ||
        dispensedVisitIds.has(v.id) ||
        (v.patient_id && dispensedPatientIds.has(v.patient_id))
      ) {
        return;
      }

      // Match prescription by visit_id or patient_id
      const rx = prescriptions.find(
        (p) =>
          (p.visit_id && p.visit_id === v.id) ||
          (v.patient_id && p.patient_id === v.patient_id && !dispensedRxIds.has(p.id))
      );

      // If prescription was already dispensed, NEVER include in pending queue
      if (rx && (dispensedRxIds.has(rx.id) || (rx.patient_id && dispensedPatientIds.has(rx.patient_id)))) {
        return;
      }

      const hasPrescription = Boolean(rx && !dispensedRxIds.has(rx.id) && rx.items && rx.items.length > 0);

      if ((v.status === 'prescribed' || hasPrescription) && !dispensedVisitIds.has(v.id)) {
        if (rx) matchedRxIds.add(rx.id);
        matchedVisitIds.add(v.id);

        const patient = (v.patient_id ? patientMap.get(v.patient_id) : undefined) || (rx ? patientMap.get(rx.patient_id) : undefined);
        const doctor = (v.doctor_id ? doctorMap.get(v.doctor_id) : undefined) || (rx ? doctorMap.get(rx.doctor_id) : undefined);

        queue.push({
          id: v.id,
          visitId: v.id,
          token_number: Number(v.token_number) || 1,
          patientName: patient?.name || 'Patient',
          patientUhid: patient?.uhid || '—',
          patientAge: patient?.age || 0,
          doctorName: doctor?.full_name || 'Dr. Consultant',
          medicineCount: rx?.items?.length || 0,
          prescriptionId: rx?.id,
          uaid: rx?.uaid,
          stayDayNumber: rx?.stay_day_number,
          created_at: v.created_at,
        });
      }
    });

    // Pass 2: Include any un-dispensed prescriptions (e.g. IP prescriptions or direct consultations)
    prescriptions.forEach((rx) => {
      if (matchedRxIds.has(rx.id) || dispensedRxIds.has(rx.id)) return;
      if (rx.patient_id && dispensedPatientIds.has(rx.patient_id)) return;
      if (rx.visit_id && (matchedVisitIds.has(rx.visit_id) || dispensedVisitIds.has(rx.visit_id))) return;
      if (!rx.items || rx.items.length === 0) return;

      matchedRxIds.add(rx.id);
      const patient = patientMap.get(rx.patient_id);
      const doctor = doctorMap.get(rx.doctor_id);

      queue.push({
        id: rx.visit_id || rx.id,
        visitId: rx.visit_id,
        token_number: rx.uaid ? 0 : 99,
        patientName: patient?.name || 'Patient',
        patientUhid: patient?.uhid || '—',
        patientAge: patient?.age || 0,
        doctorName: doctor?.full_name || 'Dr. Consultant',
        medicineCount: rx.items?.length || 0,
        prescriptionId: rx.id,
        uaid: rx.uaid,
        stayDayNumber: rx.stay_day_number,
        created_at: rx.created_at,
      });
    });

    queue.sort((a, b) => {
      if (a.token_number !== b.token_number) {
        return a.token_number - b.token_number;
      }
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

    return queue;
  }, [visits, prescriptions, allDispensingsMerged, patients, doctors]);

  // 2. Today's Dispensed Patients (PRD v1.1: Remains in today's patient list, editable with auto stock correction)
  const todayDispensed = useMemo(() => {
    return allDispensingsMerged.filter((d) => {
      const matchesSearch =
        (d.patient_name || '').toLowerCase().includes(dispensedSearch.toLowerCase()) ||
        (d.patient_uhid || '').toLowerCase().includes(dispensedSearch.toLowerCase()) ||
        (d.patient_phone || '').includes(dispensedSearch);
      return matchesSearch;
    });
  }, [allDispensingsMerged, dispensedSearch]);

  // 3. Drug Inventory Filters & Alerts
  const filteredInventory = drugs.filter(
    (d) =>
      d.name.toLowerCase().includes(invSearch.toLowerCase()) ||
      d.drug_type.toLowerCase().includes(invSearch.toLowerCase()) ||
      (d.batch_number && d.batch_number.toLowerCase().includes(invSearch.toLowerCase()))
  );

  const lowStockDrugs = drugs.filter((d) => d.stock_quantity <= d.low_stock_limit);
  const [ninetyDaysFromNow, setNinetyDaysFromNow] = useState<number>(0);

  useEffect(() => {
    setNinetyDaysFromNow(Date.now() + 90 * 24 * 60 * 60 * 1000);
  }, []);

  const expiringDrugs = ninetyDaysFromNow > 0
    ? drugs.filter((d) => new Date(d.expiry_date).getTime() <= ninetyDaysFromNow)
    : [];

  // Walk-in handlers
  const walkInDrugSuggestions = drugs.filter(
    (d) =>
      d.name.toLowerCase().includes(walkInSearch.toLowerCase()) ||
      d.drug_type.toLowerCase().includes(walkInSearch.toLowerCase())
  );

  const walkInHasScheduleH = walkInItems.some((wi) => wi.isScheduleH);
  const walkInTotal = walkInItems.reduce((sum, wi) => sum + wi.totalPrice, 0);
  const walkInTotalUnits = walkInItems.reduce((sum, wi) => sum + wi.quantity, 0);

  function handlePhoneChange(phone: string) {
    setWalkInPatientPhone(phone);
    const trimmed = phone.trim();
    if (trimmed.length >= 4) {
      const p = patients.find(
        (pat) => pat.phone === trimmed || pat.uhid.toLowerCase() === trimmed.toLowerCase()
      );
      if (p) {
        setWalkInPatientName(p.name);
        setWalkInPatientUhid(p.uhid);
        setMatchedPatientInfo(`${p.name} (UHID: ${p.uhid})`);
        return;
      }
    }
    setMatchedPatientInfo(null);
  }

  function handleSelectDrug(drug: Drug) {
    setSelectedDrug(drug);
    setIsCustomItem(false);
    setWalkInSearch(drug.name);
    const defaultQty = drug.drug_type === 'syrup' ? 1 : (drug.drug_type === 'injection' ? 1 : 10);
    setItemQuantity(defaultQty);
    setItemUnitPrice(drug.selling_price || 0);
  }

  function handleSelectCustom() {
    setIsCustomItem(true);
    setSelectedDrug(null);
    setWalkInSearch('');
    setCustomDrugName('');
    setItemQuantity(1);
    setItemUnitPrice(10);
  }

  function handleAddDrugToSale() {
    const drugName = isCustomItem ? customDrugName.trim() : (selectedDrug?.name || walkInSearch.trim());
    if (!drugName) {
      alert('Please select a drug or type a product name.');
      return;
    }
    if (itemQuantity <= 0) {
      alert('Please enter a quantity of 1 or more.');
      return;
    }
    if (itemUnitPrice < 0) {
      alert('Unit price cannot be negative.');
      return;
    }

    const isSchH = selectedDrug ? (selectedDrug.schedule_h || selectedDrug.schedule_h1) : false;
    const stock = selectedDrug ? selectedDrug.stock_quantity : 999;
    const unitPriceRounded = Number(itemUnitPrice.toFixed(2));
    const totalPriceRounded = Number((itemQuantity * unitPriceRounded).toFixed(2));

    const newItem: WalkInSaleItem = {
      id: `witem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      drugId: selectedDrug?.id,
      name: drugName,
      drugType: isCustomItem ? customDrugType : (selectedDrug?.drug_type || 'tablet'),
      batchNumber: selectedDrug?.batch_number,
      stockAvailable: stock,
      quantity: itemQuantity,
      unitPrice: unitPriceRounded,
      totalPrice: totalPriceRounded,
      isScheduleH: isSchH,
    };

    setWalkInItems((prev) => [...prev, newItem]);

    // Reset selection ready for next drug
    setSelectedDrug(null);
    setIsCustomItem(false);
    setWalkInSearch('');
    setCustomDrugName('');
    setItemQuantity(10);
    setItemUnitPrice(0);
  }

  function handleUpdateItemQty(idx: number, newQty: number) {
    if (newQty < 1) return;
    setWalkInItems((prev) =>
      prev.map((item, i) =>
        i === idx
          ? {
              ...item,
              quantity: newQty,
              totalPrice: Number((newQty * item.unitPrice).toFixed(2)),
            }
          : item
      )
    );
  }

  function handleUpdateItemPrice(idx: number, newPrice: number) {
    if (newPrice < 0) return;
    setWalkInItems((prev) =>
      prev.map((item, i) =>
        i === idx
          ? {
              ...item,
              unitPrice: newPrice,
              totalPrice: Number((item.quantity * newPrice).toFixed(2)),
            }
          : item
      )
    );
  }

  function handleRemoveItem(idx: number) {
    setWalkInItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleCompleteWalkInSale() {
    if (walkInItems.length === 0) {
      alert('Please add at least one drug to the sale.');
      return;
    }

    if (walkInHasScheduleH && settings.schedule_h_action === 'block') {
      alert('Policy block: Schedule H/H1 drugs cannot be sold without a verified doctor prescription.');
      return;
    }

    if (walkInHasScheduleH && !walkInOverrideReason.trim()) {
      alert('Please provide a pharmacist justification note for dispensing Schedule H/H1 medicines without prescription.');
      return;
    }

    try {
      await dispensePrescriptionAtomic({
        pharmacistId: user?.id || undefined,
        pharmacistName: user?.fullName || 'Pharmacist on Duty',
        patientName: walkInPatientName.trim() || undefined,
        patientPhone: walkInPatientPhone.trim() || undefined,
        patientUhid: walkInPatientUhid.trim() || undefined,
        items: walkInItems.map((wi) => ({
          drugId: wi.drugId || undefined,
          drugName: wi.name,
          quantity: wi.quantity,
          unitPrice: wi.unitPrice,
          totalPrice: wi.totalPrice,
        })),
        totalAmount: Number(walkInTotal.toFixed(2)),
        overrideReason: walkInOverrideReason.trim() || undefined,
        isWalkIn: true,
      });

      // Mirror local store
      HMSStore.recordWalkInSale({
        pharmacistId: user?.id || 'pharm-1',
        pharmacistName: user?.fullName || 'Pharmacist on Duty',
        patientName: walkInPatientName.trim() || undefined,
        patientPhone: walkInPatientPhone.trim() || undefined,
        patientUhid: walkInPatientUhid.trim() || undefined,
        items: walkInItems.map((wi) => ({
          drugId: wi.drugId || '',
          drugName: wi.name,
          quantity: wi.quantity,
          unitPrice: wi.unitPrice,
          totalPrice: wi.totalPrice,
        })),
        totalAmount: Number(walkInTotal.toFixed(2)),
        hasScheduleHWarning: walkInHasScheduleH,
        overrideReason: walkInOverrideReason.trim() || undefined,
      });
    } catch (err: any) {
      console.warn('Walk-in atomic RPC failed, using local store:', err?.message);
      HMSStore.recordWalkInSale({
        pharmacistId: user?.id || 'pharm-1',
        pharmacistName: user?.fullName || 'Pharmacist on Duty',
        patientName: walkInPatientName.trim() || undefined,
        patientPhone: walkInPatientPhone.trim() || undefined,
        patientUhid: walkInPatientUhid.trim() || undefined,
        items: walkInItems.map((wi) => ({
          drugId: wi.drugId || '',
          drugName: wi.name,
          quantity: wi.quantity,
          unitPrice: wi.unitPrice,
          totalPrice: wi.totalPrice,
        })),
        totalAmount: Number(walkInTotal.toFixed(2)),
        hasScheduleHWarning: walkInHasScheduleH,
        overrideReason: walkInOverrideReason.trim() || undefined,
      });
    }

    queryClient.invalidateQueries({ queryKey: queryKeys.dispensings.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.drugs.all });

    setShowWalkInModal(false);
    setWalkInItems([]);
    setSelectedDrug(null);
    setIsCustomItem(false);
    setWalkInSearch('');
    setCustomDrugName('');
    setWalkInPatientName('');
    setWalkInPatientPhone('');
    setWalkInPatientUhid('');
    setMatchedPatientInfo(null);
    setWalkInOverrideReason('');
    setTab('dispensed');
  }

  return (
    <>
      <PageHeader
        title="Pharmacy Portal"
        subtitle="Live prescription queue, walk-in sales, stock auto-deduction & inventory control"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="secondary"
              size="sm"
              icon={<ShoppingCart size={15} />}
              onClick={() => setShowWalkInModal(true)}
              className="min-h-[40px] sm:min-h-0"
            >
              + Walk-in Sale (No Rx)
            </Button>
            <Link href="/pharmacy/inventory/add">
              <Button size="sm" icon={<Plus size={15} />} className="min-h-[40px] sm:min-h-0">Add New Drug</Button>
            </Link>
          </div>
        }
      />

      {/* Stock Alerts Banner */}
      {(lowStockDrugs.length > 0 || expiringDrugs.length > 0) && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 bg-[var(--warning-bg)] border border-[var(--warning)] rounded-[var(--r-tile)] p-3 sm:px-4 sm:py-3 mb-5">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-[var(--warning)] shrink-0" />
            <div className="flex-1 text-xs text-[#8A6520]">
              <strong>Inventory Alerts:</strong> {lowStockDrugs.length} drug(s) below reorder threshold ·{' '}
              {expiringDrugs.length} drug(s) expiring within 90 days.
            </div>
          </div>
          <button
            className="text-xs font-semibold text-[#8A6520] underline hover:no-underline text-left sm:text-right shrink-0"
            onClick={() => setTab('reorder')}
          >
            View Reorder List ({lowStockDrugs.length})
          </button>
        </div>
      )}

      {/* Pill Tab Switcher */}
      <div className="flex gap-1.5 bg-white rounded-[var(--r-pill)] p-1.5 w-full sm:w-fit shadow-[var(--shadow-float)] mb-5 overflow-x-auto no-scrollbar snap-x border border-[var(--line-soft)]">
        {[
          { id: 'queue' as Tab, label: 'Dispensing Queue', count: pendingQueue.length },
          { id: 'dispensed' as Tab, label: "Today's Patient List", count: todayDispensed.length },
          { id: 'inventory' as Tab, label: 'Drug Inventory', count: drugs.length },
          { id: 'reorder' as Tab, label: 'Reorder List', count: lowStockDrugs.length },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-[var(--r-pill)] text-xs sm:text-sm font-semibold transition-all duration-150 shrink-0 min-h-[40px] snap-start touch-manipulation cursor-pointer',
              tab === t.id
                ? 'bg-[var(--green-600)] text-white shadow-xs'
                : 'text-[var(--text-body)] hover:bg-[var(--bg-tile)]'
            )}
          >
            {t.label}
            <span
              className={clsx(
                'inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-xs font-bold tabular-nums',
                tab === t.id ? 'bg-white/20 text-white' : 'bg-[var(--bg-tile)] text-[var(--text-muted)]'
              )}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 1: DISPENSING QUEUE (OPD & IP Prescriptions)
         ──────────────────────────────────────────────────────────────────────── */}
      {tab === 'queue' && (
        <Card>
          <CardHeader title="Prescriptions Ready for Dispensing" count={pendingQueue.length} />

          {pendingQueue.length === 0 ? (
            <EmptyState
              icon={<PackageCheck size={28} />}
              title="No pending prescriptions"
              description="Prescriptions finalized by doctors will automatically appear in this queue."
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              {pendingQueue.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-tile)] rounded-[var(--r-tile)] p-3 sm:p-4 border border-[var(--line-soft)]/60 hover:border-[var(--green-600)]/40 hover:bg-white transition-all shadow-xs"
                >
                  {/* Left: Token + Avatar + Info */}
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    {/* Token */}
                    <div className="shrink-0 w-12 text-center bg-white rounded-[var(--r-control)] py-1.5 px-1 border border-[var(--line-soft)] shadow-2xs">
                      <p className="text-[20px] leading-none font-bold text-[var(--green-900)] tabular-nums">
                        {String(item.token_number).padStart(2, '0')}
                      </p>
                      <p className="text-[9px] text-[var(--text-faint)] mt-1 font-bold">TOKEN</p>
                    </div>

                    <Avatar name={item.patientName} size="md" className="shrink-0 hidden xs:flex" />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[var(--text-strong)] leading-tight">{item.patientName}</span>
                        <span className="text-xs text-[var(--text-muted)] tabular-nums">{item.patientAge}y</span>
                        {item.uaid ? (
                          <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded">
                            In-Patient ({item.uaid})
                          </span>
                        ) : (
                          <StatusPill variant="warning" label="Ready to Dispense" />
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-x-2 gap-y-0.5 flex-wrap">
                        <span className="font-mono text-[var(--text-strong)]">UHID: {item.patientUhid}</span>
                        <span>·</span>
                        <span>Dr: {item.doctorName}</span>
                        <span>·</span>
                        <strong className="text-[var(--text-strong)]">{item.medicineCount} medicines</strong>
                      </p>
                    </div>
                  </div>

                  {/* Right: Dispense Action */}
                  <div className="w-full sm:w-auto pt-2.5 sm:pt-0 border-t sm:border-t-0 border-[var(--line-soft)]/60 flex justify-end">
                    <Link
                      href={`/pharmacy/dispense?visitId=${item.visitId || item.id}&rxId=${item.prescriptionId || ''}&token=${item.token_number}`}
                      className="w-full sm:w-auto"
                    >
                      <Button size="sm" className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-[36px]" icon={<ChevronRight size={14} />} iconPosition="right">
                        Dispense Medicines
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 2: TODAY'S PATIENT LIST (Dispensed Records with Stock Auto-Correct)
         ──────────────────────────────────────────────────────────────────────── */}
      {tab === 'dispensed' && (
        <Card>
          <CardHeader
            title="Today's Dispensed Deliveries"
            count={todayDispensed.length}
            action={
              <SearchInput
                value={dispensedSearch}
                onChange={setDispensedSearch}
                placeholder="Search patient, UHID or phone..."
                className="w-52 sm:w-64"
              />
            }
          />

          {todayDispensed.length === 0 ? (
            <EmptyState
              icon={<CheckCircle size={28} />}
              title="No dispensed records yet"
              description="Prescriptions and walk-in sales marked Delivered will be recorded here."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {todayDispensed.map((disp) => {
                const isWalkIn = disp.is_walk_in;
                const timeStr = disp.delivered_at
                  ? new Date(disp.delivered_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                  : 'Delivered';

                return (
                  <div
                    key={disp.id}
                    className="p-4 rounded-[var(--r-tile)] bg-[var(--bg-tile)] border border-[var(--line-soft)] space-y-2.5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-[var(--text-strong)]">
                          {disp.patient_name || 'Walk-in Customer'}
                        </span>
                        {disp.patient_uhid && (
                          <span className="text-xs text-[var(--text-muted)] font-mono">
                            UHID: {disp.patient_uhid}
                          </span>
                        )}
                        {isWalkIn ? (
                          <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full border border-amber-300">
                            No Prescription (Walk-in)
                          </span>
                        ) : (
                          <StatusPill variant="success" label="Prescription Delivered" />
                        )}
                        {disp.has_schedule_h_warning && (
                          <span className="text-[9px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded">
                            SCH H Dispensed
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 text-xs text-[var(--text-muted)] w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--line-soft)]/60">
                        <span className="font-bold text-xs text-[var(--green-900)] bg-[var(--sage-100)] px-2.5 py-1 rounded border border-[var(--green-600)]/30">
                          Total: ₹{disp.total_amount ? disp.total_amount.toFixed(2) : '0.00'}
                        </span>
                        <span>Dispensed at {timeStr} by <strong>{disp.pharmacist_name || 'Pharmacist'}</strong></span>
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Edit2 size={13} />}
                          onClick={() => setEditingDispensing(disp)}
                        >
                          Edit Items
                        </Button>
                      </div>
                    </div>

                    {/* Dispensed Items List */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs pt-1 border-t border-[var(--line-soft)]/60">
                      {disp.items?.map((item) => (
                        <div key={item.id} className="bg-white p-2 rounded border border-[var(--line-soft)] flex justify-between items-center">
                          <div>
                            <span className="font-medium text-[var(--text-strong)] block">{item.drug_name}</span>
                            <span className="text-[10px] text-[var(--text-muted)]">₹{item.unit_price?.toFixed(2)} / unit</span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-[var(--green-700)] block">{item.quantity} units</span>
                            <span className="text-[10px] text-[var(--text-strong)] font-semibold">₹{item.total_price ? item.total_price.toFixed(2) : (item.quantity * item.unit_price).toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 3: DRUG INVENTORY
         ──────────────────────────────────────────────────────────────────────── */}
      {tab === 'inventory' && (
        <Card>
          <CardHeader
            title="Pharmacy Drug Inventory"
            count={filteredInventory.length}
            action={
              <SearchInput
                value={invSearch}
                onChange={setInvSearch}
                placeholder="Search drug name or type..."
                className="w-52 sm:w-64"
              />
            }
          />

          {filteredInventory.length === 0 ? (
            <EmptyState
              icon={<Pill size={28} />}
              title="No medicines found"
              description={
                invSearch
                  ? "No medicines match your search criteria."
                  : "Pharmacy inventory is currently empty. Add your medicines to start stocking."
              }
              action={
                <Link href="/pharmacy/inventory/add">
                  <Button size="sm" icon={<Plus size={14} />}>
                    + Add New Medicine
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              {filteredInventory.map((drug) => {
                const isLowStock = drug.stock_quantity <= drug.low_stock_limit;
                const isExpiring =
                  ninetyDaysFromNow > 0 && new Date(drug.expiry_date).getTime() <= ninetyDaysFromNow;

                return (
                  <div
                    key={drug.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-tile)] rounded-[var(--r-tile)] p-3.5 sm:p-4 min-h-[60px] border border-[var(--line-soft)]/60 hover:border-[var(--green-600)]/40 hover:bg-white transition-all shadow-xs"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[var(--text-strong)]">{drug.name}</span>
                        <span className="text-[10px] uppercase font-semibold bg-white px-2 py-0.5 rounded-[var(--r-pill)] border border-[var(--line-soft)] text-[var(--text-muted)]">
                          {drug.drug_type}
                        </span>
                        {drug.schedule_h && (
                          <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">
                            SCH H
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-muted)] flex-wrap">
                        <span>
                          Stock:{' '}
                          <strong className={isLowStock ? 'text-[var(--danger)] font-bold' : 'text-[var(--text-strong)]'}>
                            {drug.stock_quantity} {drug.drug_type === 'syrup' ? 'bottles' : drug.drug_type === 'injection' ? 'vials' : 'tablets/units'}
                          </strong>
                        </span>
                        <span>·</span>
                        <span>
                          Expiry: {new Date(drug.expiry_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                        </span>
                        <span>·</span>
                        <span>
                          MRP: ₹{drug.selling_price.toFixed(2)}/unit
                          {drug.selling_price_per_sheet ? ` (₹${drug.selling_price_per_sheet.toFixed(2)}/sheet)` : ''}
                        </span>
                        {drug.batch_number && <span>· Batch: {drug.batch_number}</span>}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto pt-2.5 sm:pt-0 border-t sm:border-t-0 border-[var(--line-soft)]/60">
                      {isLowStock ? (
                        <StatusPill variant="danger" label="Low Stock" />
                      ) : isExpiring ? (
                        <StatusPill variant="warning" label="Near Expiry" />
                      ) : (
                        <StatusPill variant="success" label="In Stock" />
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingDrug({ ...drug })}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:px-2.5 sm:py-1.5 rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] text-xs font-semibold text-[var(--text-body)] hover:bg-[var(--bg-tile)] hover:border-[var(--green-600)] transition-colors shadow-2xs cursor-pointer min-h-[44px] sm:min-h-[34px]"
                          title="Edit medicine details & stock"
                        >
                          <Edit2 size={14} className="text-[var(--green-700)]" />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          disabled={isDeletingDrugId === drug.id}
                          onClick={() => handleDeleteDrug(drug)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:px-2.5 sm:py-1.5 rounded-[var(--r-control)] bg-white border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 hover:border-red-400 transition-colors shadow-2xs disabled:opacity-50 cursor-pointer min-h-[44px] sm:min-h-[34px]"
                          title="Delete medicine from inventory"
                        >
                          <Trash2 size={14} />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 4: REORDER LIST (Low Stock Threshold Alerts)
         ──────────────────────────────────────────────────────────────────────── */}
      {tab === 'reorder' && (
        <Card>
          <CardHeader title="Automated Pharmacy Reorder List" count={lowStockDrugs.length} />
          <p className="text-xs text-[var(--text-muted)] mb-4">
            Drugs currently at or below their minimum reorder limits. Place orders with suppliers before stockout occurs:
          </p>

          {lowStockDrugs.length === 0 ? (
            <EmptyState
              icon={<CheckCircle size={28} />}
              title="All stock levels optimal"
              description="No drugs are currently below their minimum inventory thresholds."
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              {lowStockDrugs.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between p-3.5 rounded-[var(--r-tile)] bg-[var(--bg-tile)] border border-[var(--line-soft)] text-xs"
                >
                  <div>
                    <p className="font-semibold text-sm text-[var(--text-strong)]">{d.name}</p>
                    <p className="text-[var(--text-muted)] capitalize">
                      {d.drug_type} · Supplier: {d.supplier || 'Standard Distributor'} · MRP: ₹{d.selling_price}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-bold text-[var(--danger)] text-sm">{d.stock_quantity} left</p>
                    <p className="text-[11px] text-[var(--text-faint)]">Reorder Limit: {d.low_stock_limit}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          WALK-IN SALE MODAL (PRD v1.1 Rule: No Prescription Flow)
          Direct OTC sale · Which Drug, Quantity & Pricing Flow
         ──────────────────────────────────────────────────────────────────────── */}
      {showWalkInModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[var(--r-card)] p-5 sm:p-6 max-w-2xl w-full shadow-[var(--shadow-float)] border border-[var(--line-soft)] max-h-[92vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-[var(--line-soft)] mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-[var(--text-strong)]">
                    Walk-in Sale (No Prescription)
                  </h3>
                  <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full border border-amber-300">
                    Direct OTC Sale
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Direct OTC sale · Marked as &ldquo;No Prescription&rdquo; in audit logs
                </p>
              </div>
              <button
                onClick={() => setShowWalkInModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-strong)] p-1 rounded-full hover:bg-[var(--bg-tile)] transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Step 1: Optional Customer / Patient Info */}
            <div className="bg-[var(--bg-tile)] rounded-[var(--r-tile)] p-3 mb-4 border border-[var(--line-soft)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[var(--text-strong)] flex items-center gap-1.5">
                  <User size={13} className="text-[var(--text-muted)]" />
                  Customer Information (Optional)
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  Leave blank for instant OTC checkout
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <input
                    type="tel"
                    value={walkInPatientPhone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="Phone or UHID (auto-lookup returning patient)"
                    className="w-full h-8.5 rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] px-3 text-xs focus:outline-none focus:border-[var(--green-600)]"
                  />
                  {matchedPatientInfo && (
                    <p className="text-[11px] text-[var(--green-700)] font-medium mt-1 flex items-center gap-1">
                      <CheckCircle size={12} /> Found: {matchedPatientInfo}
                    </p>
                  )}
                </div>
                <div>
                  <input
                    type="text"
                    value={walkInPatientName}
                    onChange={(e) => setWalkInPatientName(e.target.value)}
                    placeholder="Customer / Patient Name (Optional)"
                    className="w-full h-8.5 rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] px-3 text-xs focus:outline-none focus:border-[var(--green-600)]"
                  />
                </div>
              </div>
            </div>

            {/* Step 2: Which Drug, Quantity & Pricing Configurator */}
            <div className="bg-white rounded-[var(--r-tile)] p-4 mb-4 border-2 border-[var(--green-600)]/30 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--green-900)] uppercase tracking-wider flex items-center gap-1.5">
                  <Pill size={15} className="text-[var(--green-700)]" />
                  1. Which Drug, Quantity & Pricing?
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomItem(false);
                      setSelectedDrug(null);
                      setWalkInSearch('');
                    }}
                    className={clsx(
                      'px-2.5 py-1 text-xs rounded-full font-medium transition-all',
                      !isCustomItem
                        ? 'bg-[var(--green-900)] text-white'
                        : 'bg-[var(--bg-tile)] text-[var(--text-muted)] hover:text-[var(--text-strong)]'
                    )}
                  >
                    From Stock Catalog
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectCustom}
                    className={clsx(
                      'px-2.5 py-1 text-xs rounded-full font-medium transition-all',
                      isCustomItem
                        ? 'bg-[var(--green-900)] text-white'
                        : 'bg-[var(--bg-tile)] text-[var(--text-muted)] hover:text-[var(--text-strong)]'
                    )}
                  >
                    + Custom OTC Product
                  </button>
                </div>
              </div>

              {/* WHICH DRUG SELECTION */}
              {!isCustomItem ? (
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-strong)] mb-1">
                    Which Drug? <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
                    <input
                      type="text"
                      value={walkInSearch}
                      onChange={(e) => {
                        setWalkInSearch(e.target.value);
                        if (selectedDrug && e.target.value !== selectedDrug.name) {
                          setSelectedDrug(null);
                        }
                      }}
                      placeholder="Type medicine name to search inventory..."
                      className="w-full h-9 rounded-[var(--r-control)] bg-[var(--bg-tile)] border border-[var(--line-soft)] pl-9 pr-3 text-xs focus:bg-white focus:outline-none focus:border-[var(--green-600)]"
                    />

                    {/* Suggestions dropdown */}
                    {walkInSearch && !selectedDrug && walkInDrugSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-40 bg-white rounded-[var(--r-tile)] border border-[var(--line-soft)] shadow-lg max-h-52 overflow-y-auto mt-1 divide-y divide-[var(--line-soft)]">
                        {walkInDrugSuggestions.slice(0, 8).map((drug) => {
                          const isLow = drug.stock_quantity <= drug.low_stock_limit;
                          return (
                            <button
                              key={drug.id}
                              type="button"
                              onClick={() => handleSelectDrug(drug)}
                              className="w-full text-left p-2.5 hover:bg-[var(--sage-100)] text-xs flex items-center justify-between transition-colors"
                            >
                              <div>
                                <span className="font-bold text-[var(--text-strong)]">{drug.name}</span>
                                <span className="text-[11px] text-[var(--text-muted)] ml-2 text-capitalize">
                                  ({drug.drug_type}) · Batch: {drug.batch_number || 'B-01'}
                                </span>
                                {(drug.schedule_h || drug.schedule_h1) && (
                                  <span className="ml-2 text-[9px] bg-red-100 text-red-700 font-bold px-1 rounded">
                                    SCH H
                                  </span>
                                )}
                              </div>
                              <div className="text-right">
                                <span className={clsx('font-bold', isLow ? 'text-amber-600' : 'text-[var(--green-700)]')}>
                                  Stock: {drug.stock_quantity}
                                </span>
                                <span className="text-[11px] text-[var(--text-muted)] block">
                                  MRP ₹{drug.selling_price?.toFixed(2)}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Selected Drug Banner */}
                  {selectedDrug && (
                    <div className="mt-2 p-2.5 rounded-[var(--r-control)] bg-[var(--sage-100)] border border-[var(--green-600)]/40 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-[var(--green-900)]">{selectedDrug.name}</span>
                        <span className="text-[var(--text-muted)] ml-2 capitalize">
                          Type: <strong>{selectedDrug.drug_type}</strong> · Batch: <strong>{selectedDrug.batch_number || 'B-01'}</strong>
                        </span>
                        {(selectedDrug.schedule_h || selectedDrug.schedule_h1) && (
                          <span className="ml-2 text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded border border-red-200">
                            Schedule H Drug
                          </span>
                        )}
                      </div>
                      <span className="font-bold text-[var(--green-700)]">
                        Available Stock: {selectedDrug.stock_quantity}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-strong)] mb-1">
                      Item / Product Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={customDrugName}
                      onChange={(e) => setCustomDrugName(e.target.value)}
                      placeholder="e.g. Crepe Bandage, Sterile Gauze, ORS"
                      className="w-full h-9 rounded-[var(--r-control)] bg-[var(--bg-tile)] border border-[var(--line-soft)] px-3 text-xs focus:bg-white focus:outline-none focus:border-[var(--green-600)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-strong)] mb-1">
                      Item Category / Type
                    </label>
                    <select
                      value={customDrugType}
                      onChange={(e) => setCustomDrugType(e.target.value)}
                      className="w-full h-9 rounded-[var(--r-control)] bg-[var(--bg-tile)] border border-[var(--line-soft)] px-3 text-xs focus:bg-white focus:outline-none focus:border-[var(--green-600)]"
                    >
                      <option value="tablet">Tablet / Strip</option>
                      <option value="syrup">Syrup / Bottle</option>
                      <option value="injection">Injection / Vial</option>
                      <option value="other">Other / Consumable</option>
                    </select>
                  </div>
                </div>
              )}

              {/* QUANTITY & PRICING INPUTS (Side-by-side) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* 1. Quantity to dispense */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-semibold text-[var(--text-strong)]">
                      Quantity to Dispense <span className="text-red-500">*</span>
                    </label>
                    {selectedDrug && (
                      <span className="text-[11px] text-[var(--text-muted)]">
                        In stock: {selectedDrug.stock_quantity}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setItemQuantity((q) => Math.max(1, q - 1))}
                      className="h-9 w-9 flex items-center justify-center rounded-[var(--r-control)] bg-[var(--bg-tile)] border border-[var(--line-soft)] hover:bg-gray-100 font-bold text-sm text-[var(--text-strong)]"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={itemQuantity}
                      onChange={(e) => setItemQuantity(Math.max(1, Number(e.target.value) || 1))}
                      className="h-9 flex-1 text-center rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] font-bold text-xs focus:outline-none focus:border-[var(--green-600)]"
                    />
                    <button
                      type="button"
                      onClick={() => setItemQuantity((q) => q + 1)}
                      className="h-9 w-9 flex items-center justify-center rounded-[var(--r-control)] bg-[var(--bg-tile)] border border-[var(--line-soft)] hover:bg-gray-100 font-bold text-sm text-[var(--text-strong)]"
                    >
                      +
                    </button>
                  </div>
                  {selectedDrug && itemQuantity > selectedDrug.stock_quantity && (
                    <p className="text-[11px] text-amber-600 font-medium mt-1">
                      ⚠️ Note: Requested quantity exceeds available stock ({selectedDrug.stock_quantity})
                    </p>
                  )}
                </div>

                {/* 2. Pricing per unit */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-semibold text-[var(--text-strong)]">
                      Selling Price per Unit (₹) <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {selectedDrug ? `MRP: ₹${selectedDrug.selling_price}` : 'Set selling price'}
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-xs text-[var(--text-muted)]">
                      ₹
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={itemUnitPrice}
                      onChange={(e) => setItemUnitPrice(Number(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-full h-9 rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] pl-7 pr-3 font-bold text-xs focus:outline-none focus:border-[var(--green-600)]"
                    />
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1">
                    Editable: customize rate for discounts or batch differences.
                  </p>
                </div>
              </div>

              {/* Line subtotal calculation and Add button */}
              <div className="flex items-center justify-between pt-2.5 border-t border-[var(--line-soft)]">
                <div className="text-xs">
                  <span className="text-[var(--text-muted)]">Line Subtotal: </span>
                  <span className="font-bold text-[var(--green-900)] text-sm">
                    {itemQuantity} units × ₹{itemUnitPrice.toFixed(2)} = ₹{(itemQuantity * itemUnitPrice).toFixed(2)}
                  </span>
                </div>
                <Button
                  type="button"
                  onClick={handleAddDrugToSale}
                  icon={<Plus size={14} />}
                  className="bg-[var(--green-900)] text-white text-xs h-8.5 px-4"
                >
                  Add Medicine to Bill
                </Button>
              </div>
            </div>

            {/* Step 3: Current Bill Table (Review, Edit & Remove) */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[var(--text-strong)]">
                  2. Medicines Added to Current Sale ({walkInItems.length})
                </span>
                {walkInItems.length > 0 && (
                  <span className="text-xs font-semibold text-[var(--green-900)]">
                    Current Total: ₹{walkInTotal.toFixed(2)} ({walkInTotalUnits} total units)
                  </span>
                )}
              </div>

              {walkInItems.length === 0 ? (
                <div className="p-5 text-center rounded-[var(--r-tile)] border border-dashed border-[var(--line-soft)] bg-[var(--bg-tile)] text-xs text-[var(--text-muted)]">
                  No medicines added to sale bill yet. Search a drug above, verify quantity and pricing, and click &ldquo;Add Medicine to Bill&rdquo;.
                </div>
              ) : (
                <div className="divide-y divide-[var(--line-soft)] rounded-[var(--r-tile)] border border-[var(--line-soft)] overflow-hidden">
                  {walkInItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className="p-3 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-[var(--bg-tile)]/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-[var(--text-strong)]">{item.name}</span>
                          <span className="text-[11px] text-[var(--text-muted)] capitalize">
                            ({item.drugType})
                          </span>
                          {item.batchNumber && (
                            <span className="text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-mono">
                              Batch: {item.batchNumber}
                            </span>
                          )}
                          {item.isScheduleH && (
                            <span className="text-[9px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded">
                              Schedule H
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Qty edit */}
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-[var(--text-muted)]">Qty:</span>
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => handleUpdateItemQty(idx, Number(e.target.value) || 1)}
                            className="h-7.5 w-14 text-center rounded bg-white border border-[var(--line-soft)] font-bold text-xs"
                          />
                        </div>

                        {/* Price edit */}
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-[var(--text-muted)]">Rate: ₹</span>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={item.unitPrice}
                            onChange={(e) => handleUpdateItemPrice(idx, Number(e.target.value) || 0)}
                            className="h-7.5 w-16 text-center rounded bg-white border border-[var(--line-soft)] font-bold text-xs"
                          />
                        </div>

                        {/* Total */}
                        <span className="font-bold text-[var(--green-900)] min-w-[70px] text-right">
                          ₹{item.totalPrice.toFixed(2)}
                        </span>

                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                          title="Remove item"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Step 4: Schedule H Regulatory Compliance Warning */}
            {walkInHasScheduleH && (
              <div className="mb-4 p-3 rounded-[var(--r-tile)] bg-amber-50 border border-amber-300 text-xs text-amber-900 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldAlert size={16} className="text-amber-700" />
                  <span>Regulatory Warning: Schedule H/H1 Drug Included</span>
                </div>
                <p>
                  Selling Schedule H/H1 drugs without prescription requires a documented pharmacist justification note.
                </p>
                <input
                  type="text"
                  value={walkInOverrideReason}
                  onChange={(e) => setWalkInOverrideReason(e.target.value)}
                  placeholder="Justification note (e.g. Emergency repeat refilling for chronic patient)"
                  className="w-full h-8 rounded-[var(--r-control)] bg-white border border-amber-400 px-2.5 text-xs focus:outline-none"
                />
                {settings.schedule_h_action === 'block' && (
                  <p className="text-[11px] font-bold text-red-700">
                    Hospital policy is currently set to BLOCK no-prescription sales of Schedule H medicines.
                  </p>
                )}
              </div>
            )}

            {/* Step 5: Modal Footer with Grand Total & Delivered confirmation */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-3 border-t border-[var(--line-soft)]">
              <div>
                <span className="text-xs text-[var(--text-muted)] block">
                  Total Billable ({walkInItems.length} items · {walkInTotalUnits} units)
                </span>
                <span className="text-xl font-bold text-[var(--green-900)]">
                  ₹{walkInTotal.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Button variant="secondary" onClick={() => setShowWalkInModal(false)}>
                  Cancel
                </Button>
                {/* PRD v1.1 Rule: Delivered button confirms sale and reduces stock without paper bill */}
                <Button
                  onClick={handleCompleteWalkInSale}
                  disabled={walkInItems.length === 0 || (walkInHasScheduleH && settings.schedule_h_action === 'block')}
                  className="bg-[var(--green-900)] text-white px-5"
                >
                  Delivered (₹{walkInTotal.toFixed(2)})
                </Button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          EDIT DISPENSED ITEMS MODAL (Stock Corrects Itself Automatically)
         ──────────────────────────────────────────────────────────────────────── */}
      {editingDispensing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-[var(--r-card)] p-6 max-w-lg w-full shadow-[var(--shadow-float)] border border-[var(--line-soft)]">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--line-soft)] mb-4">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-strong)]">
                  Edit Dispensed Items
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Patient: {editingDispensing.patient_name || 'Walk-in'} · Stock will adjust automatically
                </p>
              </div>
              <button onClick={() => setEditingDispensing(null)} className="text-[var(--text-muted)]">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 mb-6">
              {editingDispensing.items?.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 rounded-[var(--r-tile)] bg-[var(--bg-tile)] text-xs">
                  <div>
                    <p className="font-semibold text-[var(--text-strong)]">{item.drug_name}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">Rate: ₹{item.unit_price}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-muted)]">Qty:</span>
                    <input
                      type="number"
                      min={0}
                      defaultValue={item.quantity}
                      id={`edit-qty-${item.id}`}
                      className="h-8 w-16 text-center rounded bg-white border border-[var(--line-soft)] font-bold text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById(`edit-qty-${item.id}`) as HTMLInputElement;
                        const newQ = Number(input?.value) || 0;
                        if (newQ === 0) {
                          HMSStore.removeDispensedItem(editingDispensing.id, item.id);
                        } else {
                          HMSStore.editDispensedItem(editingDispensing.id, item.id, newQ);
                        }
                        setEditingDispensing(null);
                      }}
                      className="px-2.5 py-1 rounded bg-[var(--green-900)] text-white text-[11px] font-medium"
                    >
                      Update
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <Button variant="secondary" className="w-full" onClick={() => setEditingDispensing(null)}>
              Done
            </Button>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          EDIT DRUG INVENTORY MODAL
         ──────────────────────────────────────────────────────────────────────── */}
      {editingDrug && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[var(--r-card)] shadow-2xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto border border-[var(--line-soft)]">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--line-soft)] mb-5">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-full bg-[var(--green-50)] text-[var(--green-800)] flex items-center justify-center font-bold">
                  <Pill size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-[var(--text-strong)]">Edit Medicine in Inventory</h3>
                  <p className="text-xs text-[var(--text-muted)]">Update stock quantity, batch, expiry, or pricing</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingDrug(null)}
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-strong)] hover:bg-[var(--bg-tile)]"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEditedDrug} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[var(--text-strong)] mb-1">Medicine Name *</label>
                <input
                  type="text"
                  required
                  value={editingDrug.name}
                  onChange={(e) => setEditingDrug({ ...editingDrug, name: e.target.value })}
                  className="w-full h-10 px-3 rounded-[var(--r-control)] border border-[var(--line-soft)] text-sm focus:outline-none focus:border-[var(--green-600)] font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[var(--text-strong)] mb-1">Drug Type</label>
                  <select
                    value={editingDrug.drug_type}
                    onChange={(e) => setEditingDrug({ ...editingDrug, drug_type: e.target.value as any })}
                    className="w-full h-10 px-3 rounded-[var(--r-control)] border border-[var(--line-soft)] text-sm focus:outline-none focus:border-[var(--green-600)] bg-white"
                  >
                    <option value="tablet">Tablet</option>
                    <option value="capsule">Capsule</option>
                    <option value="syrup">Syrup</option>
                    <option value="injection">Injection</option>
                    <option value="ointment">Ointment</option>
                    <option value="drops">Drops</option>
                    <option value="inhaler">Inhaler</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-[var(--text-strong)] mb-1">Batch Number</label>
                  <input
                    type="text"
                    value={editingDrug.batch_number || ''}
                    onChange={(e) => setEditingDrug({ ...editingDrug, batch_number: e.target.value })}
                    className="w-full h-10 px-3 rounded-[var(--r-control)] border border-[var(--line-soft)] text-sm focus:outline-none focus:border-[var(--green-600)] font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-[var(--text-strong)] mb-1">Stock Quantity *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editingDrug.stock_quantity}
                    onChange={(e) => setEditingDrug({ ...editingDrug, stock_quantity: Number(e.target.value) })}
                    className="w-full h-10 px-3 rounded-[var(--r-control)] border border-[var(--line-soft)] text-sm focus:outline-none focus:border-[var(--green-600)] font-mono font-bold text-[var(--text-strong)]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[var(--text-strong)] mb-1">Low Stock Limit</label>
                  <input
                    type="number"
                    min="0"
                    value={editingDrug.low_stock_limit}
                    onChange={(e) => setEditingDrug({ ...editingDrug, low_stock_limit: Number(e.target.value) })}
                    className="w-full h-10 px-3 rounded-[var(--r-control)] border border-[var(--line-soft)] text-sm focus:outline-none focus:border-[var(--green-600)] font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[var(--text-strong)] mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={editingDrug.expiry_date ? editingDrug.expiry_date.slice(0, 10) : ''}
                    onChange={(e) => setEditingDrug({ ...editingDrug, expiry_date: e.target.value })}
                    className="w-full h-10 px-3 rounded-[var(--r-control)] border border-[var(--line-soft)] text-sm focus:outline-none focus:border-[var(--green-600)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-[var(--text-strong)] mb-1">MRP / Unit (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editingDrug.selling_price}
                    onChange={(e) => setEditingDrug({ ...editingDrug, selling_price: Number(e.target.value) })}
                    className="w-full h-10 px-3 rounded-[var(--r-control)] border border-[var(--line-soft)] text-sm focus:outline-none focus:border-[var(--green-600)] font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[var(--text-strong)] mb-1">MRP / Sheet (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingDrug.selling_price_per_sheet ?? ''}
                    onChange={(e) => setEditingDrug({ ...editingDrug, selling_price_per_sheet: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full h-10 px-3 rounded-[var(--r-control)] border border-[var(--line-soft)] text-sm focus:outline-none focus:border-[var(--green-600)] font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[var(--text-strong)] mb-1">Purchase Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingDrug.purchase_price}
                    onChange={(e) => setEditingDrug({ ...editingDrug, purchase_price: Number(e.target.value) })}
                    className="w-full h-10 px-3 rounded-[var(--r-control)] border border-[var(--line-soft)] text-sm focus:outline-none focus:border-[var(--green-600)] font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingDrug.schedule_h)}
                    onChange={(e) => setEditingDrug({ ...editingDrug, schedule_h: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-[var(--green-700)] focus:ring-[var(--green-600)]"
                  />
                  <span className="font-medium text-[var(--text-strong)]">Schedule H Drug</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingDrug.schedule_h1)}
                    onChange={(e) => setEditingDrug({ ...editingDrug, schedule_h1: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-[var(--green-700)] focus:ring-[var(--green-600)]"
                  />
                  <span className="font-medium text-[var(--text-strong)]">Schedule H1 Drug</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[var(--line-soft)] mt-4">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditingDrug(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSavingDrug}
                  icon={<Check size={14} />}
                >
                  {isSavingDrug ? 'Saving Changes...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
