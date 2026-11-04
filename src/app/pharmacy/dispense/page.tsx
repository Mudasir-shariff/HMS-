'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import {
  ArrowLeft,
  CheckCircle,
  Package,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  X,
  Check,
  Pencil,
  Trash2,
  Plus,
  Minus,
  Search,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardHeader, Button, StatusPill, Input } from '@/components/ui';
import { PageHeader } from '@/components/layout';
import {
  useVisits,
  usePatients,
  useDoctors,
  useDrugs,
  usePrescriptions,
  useHospitalSettings,
} from '@/lib/query/hooks';
import { queryKeys } from '@/lib/query/keys';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/context';
import { HMSStore, generateUUID } from '@/lib/store/hms-store';
import { dispensePrescriptionAtomic } from '@/lib/api/mutations';
import { createClient } from '@/lib/supabase/client';
import type { DrugType, Drug, Prescription, PrescriptionItem, Visit, Dispensing } from '@/lib/types/database';

interface DispenseItemState {
  id: string;
  drugId: string;
  name: string;
  drugType: DrugType;
  dosage: string;
  qty: number;
  unitPrice: number;
  included: boolean;
  isCustom: boolean;
  stockAvailable: number;
  isScheduleH?: boolean;
  isExpired: boolean;
  addedByPharmacist?: boolean;
  pharmacistNotes?: string;
}

export default function DispensePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 rounded-full border-2 border-[var(--green-600)] border-t-transparent animate-spin" />
        </div>
      }
    >
      <DispenseContent />
    </Suspense>
  );
}

function DispenseContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: visits = [] } = useVisits();
  const { data: patients = [] } = usePatients();
  const { data: doctors = [] } = useDoctors();
  const { data: drugs = [] } = useDrugs();
  const { data: prescriptions = [] } = usePrescriptions();
  const { data: settings = { hospital_name: 'RADHAKRISHNA HOSPITAL' } as any } = useHospitalSettings();

  const visitId = searchParams.get('visitId') || '';
  const token = searchParams.get('token') || '—';
  const rxIdParam = searchParams.get('rxId') || '';

  const visit = visits.find((v) => v.id === visitId);

  // Match rx by rxIdParam, visitId, or patient_id, with fallback to local store
  const cachedRx = prescriptions.find(
    (p) =>
      (rxIdParam && p.id === rxIdParam) ||
      (visitId && (p.visit_id === visitId || p.id === visitId)) ||
      (visit?.patient_id && p.patient_id === visit.patient_id)
  );

  const localRx = !cachedRx
    ? HMSStore.getPrescriptions().find(
        (p) =>
          (rxIdParam && p.id === rxIdParam) ||
          (visitId && (p.visit_id === visitId || p.id === visitId)) ||
          (visit?.patient_id && p.patient_id === visit.patient_id)
      )
    : null;

  const rx = cachedRx || localRx;
  const patient = patients.find((p) => p.id === rx?.patient_id || p.id === visit?.patient_id);
  const doctor = doctors.find(
    (d) => d.id === rx?.doctor_id || d.id === visit?.doctor_id || (d as any).user_id === rx?.doctor_id
  );

  // Initialize medicine checklist with PRD v1.1 Smart Quantity Rules
  const [items, setItems] = useState<DispenseItemState[]>(() => {
    if (rx && rx.items && rx.items.length > 0) {
      return rx.items.map((i) => {
        const drug = drugs.find((d) => d.id === i.drug_id);
        const drugType = (i.item_type || drug?.drug_type || 'tablet') as DrugType;

        const smartQty = HMSStore.calculateSmartQuantity(
          drugType,
          i.dose_morning,
          i.dose_afternoon,
          i.dose_night,
          i.num_days,
          i.quantity
        );

        const price = drug?.selling_price || 5.0;

        return {
          id: i.id,
          drugId: i.drug_id,
          name: i.drug_name,
          drugType,
          dosage: `${i.dose_morning ? 'M ' : ''}${i.dose_afternoon ? 'A ' : ''}${
            i.dose_night ? 'N' : ''
          } · ${i.dose_relation === 'before_food' ? 'Before food' : 'After food'} · ${i.num_days} days`,
          qty: smartQty,
          unitPrice: price,
          included: true,
          isCustom: i.is_custom || !drug,
          stockAvailable: drug?.stock_quantity ?? 999,
          isScheduleH: Boolean(drug?.schedule_h || drug?.schedule_h1),
          isExpired: drug ? new Date(drug.expiry_date) < new Date() : false,
          addedByPharmacist: Boolean(i.added_by_pharmacist),
          pharmacistNotes: i.pharmacist_notes,
        };
      });
    }

    return [];
  });

  const initializedRxRef = useRef<string | null>(null);

  useEffect(() => {
    if (rx && rx.items && rx.items.length > 0) {
      if (rx.id !== initializedRxRef.current || items.length === 0) {
        initializedRxRef.current = rx.id;
        setItems(
          rx.items.map((i) => {
            const drug = drugs.find((d) => d.id === i.drug_id);
            const drugType = (i.item_type || drug?.drug_type || 'tablet') as DrugType;
            const smartQty = HMSStore.calculateSmartQuantity(
              drugType,
              i.dose_morning,
              i.dose_afternoon,
              i.dose_night,
              i.num_days,
              i.quantity
            );
            const price = drug?.selling_price || 5.0;
            return {
              id: i.id,
              drugId: i.drug_id,
              name: i.drug_name,
              drugType,
              dosage: `${i.dose_morning ? 'M ' : ''}${i.dose_afternoon ? 'A ' : ''}${
                i.dose_night ? 'N' : ''
              } · ${i.dose_relation === 'before_food' ? 'Before food' : 'After food'} · ${i.num_days} days`,
              qty: smartQty,
              unitPrice: price,
              included: true,
              isCustom: i.is_custom || !drug,
              stockAvailable: drug?.stock_quantity ?? 999,
              isScheduleH: Boolean(drug?.schedule_h || drug?.schedule_h1),
              isExpired: drug ? new Date(drug.expiry_date) < new Date() : false,
              addedByPharmacist: Boolean(i.added_by_pharmacist),
              pharmacistNotes: i.pharmacist_notes,
            };
          })
        );
      }
    }
  }, [rx, drugs, items.length]);

  // Modals state for editing item and adding new item
  const [editingItem, setEditingItem] = useState<DispenseItemState | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Add Item form state
  const [newDrugSearch, setNewDrugSearch] = useState('');
  const [newSelectedDrug, setNewSelectedDrug] = useState<Drug | null>(null);
  const [newCustomName, setNewCustomName] = useState('');
  const [newDrugType, setNewDrugType] = useState<DrugType>('tablet');
  const [newQty, setNewQty] = useState(10);
  const [newUnitPrice, setNewUnitPrice] = useState(5.0);
  const [newDosage, setNewDosage] = useState('1 tablet daily');

  const [overrideReason, setOverrideReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dispensedDone, setDispensedDone] = useState(false);
  const [deliveryResult, setDeliveryResult] = useState<{
    time: string;
    pharmacistName: string;
    itemCount: number;
    items: DispenseItemState[];
  } | null>(null);

  function toggleItem(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, included: !i.included } : i)));
  }

  function updateQty(id: string, qty: number) {
    const validQty = Math.max(1, isNaN(qty) ? 1 : qty);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, qty: validQty } : i)));
  }

  function stepQty(id: string, delta: number) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i))
    );
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  // Save changes from Edit Item modal
  function handleSaveEdit(updated: DispenseItemState) {
    const withFlag = { ...updated, addedByPharmacist: updated.addedByPharmacist ?? true };
    setItems((prev) => prev.map((i) => (i.id === updated.id ? withFlag : i)));
    setEditingItem(null);

    const targetRx = rx || HMSStore.getPrescriptions().find((p) => p.visit_id === visitId || p.id === rxIdParam);
    if (targetRx && targetRx.items) {
      const updatedRxItems = targetRx.items.map((it) => {
        if (it.id === updated.id) {
          return {
            ...it,
            drug_id: updated.drugId,
            drug_name: updated.name,
            item_type: updated.drugType,
            quantity: updated.qty,
            is_custom: updated.isCustom,
            added_by_pharmacist: true,
            pharmacist_notes: 'Edited / substituted by Pharmacist',
          };
        }
        return it;
      });
      HMSStore.savePrescription({
        ...targetRx,
        items: updatedRxItems,
      });
    }
  }

  // Add new medicine to the dispensing checklist
  function handleAddMedicineToOrder() {
    const finalName = newSelectedDrug ? newSelectedDrug.name : newCustomName.trim();
    if (!finalName) {
      alert('Please select or enter a drug name.');
      return;
    }

    const newItem: DispenseItemState = {
      id: `disp-item-${Date.now()}`,
      drugId: newSelectedDrug?.id || '',
      name: finalName,
      drugType: newSelectedDrug?.drug_type || newDrugType,
      dosage: newDosage.trim() || '1 tablet daily',
      qty: Math.max(1, newQty),
      unitPrice: newUnitPrice,
      included: true,
      isCustom: !newSelectedDrug,
      stockAvailable: newSelectedDrug?.stock_quantity ?? 999,
      isScheduleH: Boolean(newSelectedDrug?.schedule_h || newSelectedDrug?.schedule_h1),
      isExpired: newSelectedDrug ? new Date(newSelectedDrug.expiry_date) < new Date() : false,
      addedByPharmacist: true,
      pharmacistNotes: 'Added by Pharmacist during dispensing',
    };

    setItems((prev) => [...prev, newItem]);

    // Instantly sync newly added medication to Prescription in HMSStore
    // so it shows up on the Doctor's prescription immediately!
    const targetRx = rx || HMSStore.getPrescriptions().find((p) => p.visit_id === visitId || p.id === rxIdParam);
    if (targetRx) {
      const rxItem: PrescriptionItem = {
        id: newItem.id,
        prescription_id: targetRx.id,
        drug_id: newItem.drugId,
        drug_name: newItem.name,
        item_type: newItem.drugType,
        dose_morning: true,
        dose_afternoon: false,
        dose_night: true,
        dose_relation: 'after_food',
        num_days: Math.ceil(newItem.qty / 2) || 5,
        quantity: newItem.qty,
        is_custom: newItem.isCustom,
        added_by_pharmacist: true,
        pharmacist_notes: 'Added by Pharmacist during dispensing',
        created_at: new Date().toISOString(),
      };
      HMSStore.savePrescription({
        ...targetRx,
        items: [...(targetRx.items || []), rxItem],
      });
    } else if (visit) {
      const newPrescription: Prescription = {
        id: rxIdParam || `rx-${Date.now()}`,
        visit_id: visit.id,
        doctor_id: visit.doctor_id,
        patient_id: visit.patient_id,
        notes: 'Prescription initiated/added by Pharmacy',
        created_at: new Date().toISOString(),
        items: [
          {
            id: newItem.id,
            prescription_id: rxIdParam || `rx-${Date.now()}`,
            drug_id: newItem.drugId,
            drug_name: newItem.name,
            item_type: newItem.drugType,
            dose_morning: true,
            dose_afternoon: false,
            dose_night: true,
            dose_relation: 'after_food',
            num_days: Math.ceil(newItem.qty / 2) || 5,
            quantity: newItem.qty,
            is_custom: newItem.isCustom,
            added_by_pharmacist: true,
            pharmacist_notes: 'Added by Pharmacist during dispensing',
            created_at: new Date().toISOString(),
          },
        ],
      };
      HMSStore.savePrescription(newPrescription);
    }

    setShowAddModal(false);
    setNewDrugSearch('');
    setNewSelectedDrug(null);
    setNewCustomName('');
    setNewQty(10);
    setNewUnitPrice(5.0);
    setNewDosage('1 tablet daily');
  }

  const includedItems = items.filter((i) => i.included);
  const totalAmount = includedItems.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);

  // Safety Checks (PRD v1.1)
  const hasInsufficientStock = includedItems.some((i) => !i.isCustom && i.qty > i.stockAvailable);
  const hasExpiredDrug = includedItems.some((i) => i.isExpired);
  const drugIds = includedItems.map((i) => i.drugId).filter(Boolean);
  const hasDuplicate = new Set(drugIds).size !== drugIds.length;
  const requiresOverride = hasInsufficientStock || hasExpiredDrug || hasDuplicate;

  // ────────────────────────────────────────────────────────────────────────────
  // DELIVERED BUTTON HANDLER (PRD v1.1 Rule: Only confirmation step. No bill needed)
  // ────────────────────────────────────────────────────────────────────────────
  async function handleMarkDelivered() {
    if (isSubmitting) return;

    if (includedItems.length === 0) {
      alert('Please include at least one medicine to dispense.');
      return;
    }

    if (requiresOverride && !overrideReason.trim()) {
      alert('Safety alert: Please provide a clinical reason or override justification to proceed with this delivery.');
      return;
    }

    setIsSubmitting(true);
    const pharmacistName = user?.fullName || 'Pharmacist on Duty';
    const pharmacistId = user?.id && user.id.length === 36 ? user.id : (HMSStore.getUsers().find(u => u.role === 'pharmacist' || u.role === 'admin')?.id || generateUUID());

    try {
      // 1. Transactional RPC (Phase 2): Locks visit, checks stock, decrements stock atomically
      await dispensePrescriptionAtomic({
        prescriptionId: rx?.id,
        pharmacistId,
        pharmacistName,
        items: includedItems.map((i) => ({
          drugId: i.drugId,
          drugName: i.name,
          quantity: i.qty,
          unitPrice: i.unitPrice,
          totalPrice: Number((i.qty * i.unitPrice).toFixed(2)),
          isCustom: i.isCustom,
        })),
        totalAmount,
        overrideReason: overrideReason.trim() || undefined,
        isWalkIn: false,
        patientId: patient?.id,
        patientName: patient?.name,
        patientPhone: patient?.phone,
        patientUhid: patient?.uhid,
        uaid: rx?.uaid,
        stayDayNumber: rx?.stay_day_number,
      });

      // Also mirror local store for immediate UI reactivity
      HMSStore.deliverPrescription({
        visitId: visit?.id,
        prescriptionId: rx?.id || generateUUID(),
        pharmacistId,
        pharmacistName,
        patientId: patient?.id,
        patientName: patient?.name,
        patientPhone: patient?.phone,
        patientUhid: patient?.uhid,
        uaid: rx?.uaid,
        stayDayNumber: rx?.stay_day_number,
        items: includedItems.map((i) => ({
          drugId: i.drugId,
          drugName: i.name,
          quantity: i.qty,
          unitPrice: i.unitPrice,
          totalPrice: Number((i.qty * i.unitPrice).toFixed(2)),
          isCustom: i.isCustom,
        })),
        totalAmount,
        overrideReason: overrideReason.trim() || undefined,
        hasScheduleHWarning: includedItems.some((i) => i.isScheduleH),
      });

      // Explicitly update visit status in Supabase so Reception and Doctor portals see completed status immediately
      if (visit?.id) {
        try {
          const supabase = createClient();
          await supabase
            .from('visits')
            .update({ status: 'dispensed', updated_at: new Date().toISOString() })
            .eq('id', visit.id);
        } catch (dbErr) {
          console.warn('Direct visit update error:', dbErr);
        }
      }
    } catch (err: any) {
      console.warn('dispensePrescriptionAtomic error:', err?.message);
      if (err?.message?.includes('already been dispensed') || err?.message?.includes('Insufficient stock')) {
        alert(err.message);
        setIsSubmitting(false);
        return;
      }
      // Fallback local store
      HMSStore.deliverPrescription({
        visitId: visit?.id,
        prescriptionId: rx?.id || generateUUID(),
        pharmacistId,
        pharmacistName,
        patientId: patient?.id,
        patientName: patient?.name,
        patientPhone: patient?.phone,
        patientUhid: patient?.uhid,
        uaid: rx?.uaid,
        stayDayNumber: rx?.stay_day_number,
        items: includedItems.map((i) => ({
          drugId: i.drugId,
          drugName: i.name,
          quantity: i.qty,
          unitPrice: i.unitPrice,
          totalPrice: Number((i.qty * i.unitPrice).toFixed(2)),
          isCustom: i.isCustom,
        })),
        totalAmount,
        overrideReason: overrideReason.trim() || undefined,
        hasScheduleHWarning: includedItems.some((i) => i.isScheduleH),
      });

      // Explicitly update visit status in Supabase so Reception and Doctor portals see completed status immediately
      if (visit?.id) {
        try {
          const supabase = createClient();
          await supabase
            .from('visits')
            .update({ status: 'dispensed', updated_at: new Date().toISOString() })
            .eq('id', visit.id);
        } catch (dbErr) {
          console.warn('Fallback visit update error:', dbErr);
        }
      }
    } finally {
      setIsSubmitting(false);
    }

    // Immediately patch React Query cache optimistically so the patient disappears from queue instantly (<10ms)
    if (visit?.id) {
      queryClient.setQueriesData<Visit[]>({ queryKey: queryKeys.visits.all }, (old) =>
        old ? old.map((v) => (v.id === visit.id ? { ...v, status: 'dispensed', updated_at: new Date().toISOString() } : v)) : []
      );
    }
    const newDispItem: Dispensing = {
      id: generateUUID(),
      prescription_id: rx?.id,
      patient_id: patient?.id,
      pharmacist_id: pharmacistId,
      pharmacist_name: pharmacistName,
      patient_name: patient?.name,
      patient_phone: patient?.phone,
      patient_uhid: patient?.uhid,
      is_walk_in: false,
      total_amount: totalAmount,
      status: 'delivered',
      delivered_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    queryClient.setQueriesData<Dispensing[]>({ queryKey: queryKeys.dispensings.all }, (old) =>
      old ? [newDispItem, ...old] : [newDispItem]
    );

    queryClient.invalidateQueries({ queryKey: queryKeys.visits.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.drugs.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.dispensings.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.prescriptions.all });

    setDeliveryResult({
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      pharmacistName,
      itemCount: includedItems.length,
      items: includedItems,
    });
    setDispensedDone(true);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // POST-DELIVERY CONFIRMATION (No bill or receipt needed in pharmacy)
  // ────────────────────────────────────────────────────────────────────────────
  if (dispensedDone && deliveryResult) {
    return (
      <div className="py-8 max-w-lg mx-auto text-center">
        <Card className="p-8 shadow-[var(--shadow-float)] border border-[var(--line-soft)]">
          <div className="h-16 w-16 rounded-full bg-[var(--success-bg)] text-[var(--success)] flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} />
          </div>
          <h2 className="text-2xl font-medium text-[var(--text-strong)] mb-1">Medicines Delivered!</h2>
          <p className="text-xs text-[var(--text-muted)] mb-5">
            Stock quantities automatically reduced from catalog · Recorded by <strong>{deliveryResult.pharmacistName}</strong> at <strong>{deliveryResult.time}</strong>
          </p>

          {/* Delivery Record Tile */}
          <div className="bg-[var(--bg-tile)] rounded-[var(--r-tile)] p-4 text-left text-xs mb-5 space-y-2 border border-[var(--line-soft)]">
            <div className="flex justify-between border-b border-[var(--line-soft)] pb-2">
              <span className="text-[var(--text-muted)]">Patient:</span>
              <span className="font-semibold text-[var(--text-strong)]">
                {patient?.name} ({patient?.age}y · UHID: {patient?.uhid})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Prescribing Doctor:</span>
              <span className="font-medium text-[var(--text-strong)]">{doctor?.full_name || 'Consultant'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Token:</span>
              <span className="font-mono font-bold text-[var(--green-700)]">#{String(token).padStart(2, '0')}</span>
            </div>

            <div className="border-t border-[var(--line-soft)] pt-2 my-2">
              <p className="font-semibold text-[var(--text-strong)] mb-1.5">Dispensed Items ({deliveryResult.itemCount}):</p>
              {deliveryResult.items.map((item) => (
                <div key={item.id} className="flex justify-between py-1 text-[11px]">
                  <span>
                    • {item.name} <span className="text-[var(--text-muted)]">({item.drugType})</span>
                  </span>
                  <span className="font-bold text-[var(--text-strong)]">{item.qty} units</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between font-bold text-sm text-[var(--green-900)] pt-2 border-t border-[var(--line-soft)]">
              <span>Total Billable Amount:</span>
              <span>₹{totalAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="bg-[#FAF8F2] border border-[#E8DCC4] rounded-[var(--r-control)] px-3 py-2 text-[11px] text-[#7A6020] text-left mb-6">
            ✓ <strong>PRD v1.1 Paperless Rule:</strong> No printed pharmacy bill needed. Record is logged in Today&apos;s Patient List where dispensed items can still be adjusted if the patient returns.
          </div>

          <div className="flex gap-2">
            <Link
              href="/pharmacy"
              className="flex-1 h-11 px-4 text-sm font-semibold rounded-[var(--r-control)] bg-[var(--green-900)] text-white hover:bg-[var(--green-800)] transition-all flex items-center justify-center text-center shadow-xs cursor-pointer"
            >
              Back to Dispensing Queue
            </Link>
            <Link
              href="/reception"
              className="flex-1 h-11 px-4 text-sm font-semibold rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] text-[var(--text-strong)] hover:bg-[var(--bg-tile)] transition-all flex items-center justify-center text-center shadow-xs cursor-pointer"
            >
              OPD Reception Desk
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/pharmacy"
          className="inline-flex items-center gap-2 h-10 px-3.5 rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] text-xs font-semibold text-[var(--text-strong)] hover:bg-[var(--bg-tile)] hover:border-[var(--green-600)] transition-all cursor-pointer shadow-xs shrink-0"
          title="Back to Dispensing Queue"
          aria-label="Back to Dispensing Queue"
        >
          <ArrowLeft size={16} />
          Back to Dispensing Queue
        </Link>
        <PageHeader
          title={`Dispense Prescription · Token #${String(token).padStart(2, '0')}`}
          subtitle="Smart suggested quantities · Review, edit items, adjust quantities and mark Delivered"
        />
      </div>

      {/* Safety Alerts Banner */}
      {requiresOverride && (
        <div className="mb-5 p-4 rounded-[var(--r-tile)] bg-[var(--warning-bg)] border border-[var(--warning)] text-xs text-[#8A6520] space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm">
            <AlertTriangle size={18} />
            <span>Pharmacy Safety Check Warnings:</span>
          </div>
          <ul className="list-disc pl-5 space-y-1">
            {hasInsufficientStock && <li>One or more items exceed current warehouse stock.</li>}
            {hasExpiredDrug && <li>One or more selected batches have passed their expiry date.</li>}
            {hasDuplicate && <li>Duplicate medicines detected in prescription.</li>}
          </ul>
          <div className="pt-2">
            <label className="font-semibold block mb-1">
              Safety Override Justification Note (Required to dispense):
            </label>
            <input
              type="text"
              placeholder="e.g. Stock replenished locally / doctor authorized alternative batch..."
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="w-full h-9 rounded-[var(--r-control)] bg-white border border-[#E8DCC4] px-3 text-xs text-[var(--text-strong)] focus:outline-none focus:border-[var(--green-600)]"
            />
          </div>
        </div>
      )}

      {/* Patient & Doctor Context Header */}
      <Card className="mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-[var(--text-strong)]">{patient?.name || 'Walk-in Patient'}</h2>
              <span className="text-xs text-[var(--text-muted)]">Age: {patient?.age || '—'} yrs</span>
              {patient?.has_bp && <StatusPill variant="warning" label="BP" />}
              {patient?.has_sugar && <StatusPill variant="info" label="Sugar" />}
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              UHID: <strong className="font-mono text-[var(--text-strong)]">{patient?.uhid}</strong> · Phone:{' '}
              {patient?.phone} · Prescribed by: <strong>{doctor?.full_name || 'Dr. Consultant'}</strong>
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-[var(--text-muted)]">Token Number</p>
              <p className="text-2xl font-bold text-[var(--green-900)]">#{String(token).padStart(2, '0')}</p>
            </div>
            <div className="text-right border-l border-[var(--line-soft)] pl-4">
              <p className="text-xs text-[var(--text-muted)]">Billable Total</p>
              <p className="text-2xl font-bold text-[var(--green-900)]">₹{totalAmount.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Main Dispensing Checklist */}
      <Card>
        <CardHeader
          title="Review Prescribed Items & Quantities"
          count={items.length}
          action={
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--text-muted)] hidden md:inline">
                Syrup: 1 bottle · Tablets: dose × days
              </span>
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus size={14} />}
                onClick={() => setShowAddModal(true)}
              >
                + Add Medication
              </Button>
            </div>
          }
        />

        <div className="flex flex-col gap-3">
          {items.map((item) => {
            const isLow = !item.isCustom && item.qty > item.stockAvailable;
            const lineTotal = Number((item.qty * item.unitPrice).toFixed(2));

            return (
              <div
                key={item.id}
                className={`p-4 rounded-[var(--r-tile)] border transition-all ${
                  item.included
                    ? 'bg-[var(--bg-tile)] border-[var(--line-soft)]'
                    : 'bg-white opacity-50 border-dashed border-[var(--line-soft)]'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Left: Item Checkbox & Details */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={item.included}
                      onChange={() => toggleItem(item.id)}
                      className="mt-1 h-4 w-4 accent-[var(--green-900)] rounded shrink-0 cursor-pointer"
                      title={item.included ? 'Click to exclude (patient declined)' : 'Click to include'}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-sm font-semibold ${
                            item.included ? 'text-[var(--text-strong)]' : 'line-through text-[var(--text-muted)]'
                          }`}
                        >
                          {item.name}
                        </span>
                        <span className="text-[10px] uppercase font-semibold bg-white px-2 py-0.5 rounded-[var(--r-pill)] border border-[var(--line-soft)] text-[var(--text-muted)]">
                          {item.drugType}
                        </span>
                        {item.isCustom && (
                          <span className="text-[9px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-bold">
                            Doctor Free-Text Line
                          </span>
                        )}
                        {item.isScheduleH && (
                          <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">
                            SCH H
                          </span>
                        )}
                        {item.addedByPharmacist && (
                          <span className="text-[9px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold border border-emerald-300">
                            💊 Added by Pharmacist
                          </span>
                        )}
                        {!item.included && (
                          <span className="text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Excluded by Patient
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-[var(--text-muted)] mt-0.5">{item.dosage}</p>

                      <div className="flex items-center gap-3 mt-1 text-xs">
                        {!item.isCustom && (
                          <span className={`font-medium ${isLow ? 'text-[var(--danger)] font-bold' : 'text-[var(--text-muted)]'}`}>
                            Stock: {item.stockAvailable} units {isLow ? '⚠️ Insufficient' : ''}
                          </span>
                        )}
                        <span className="text-[var(--text-muted)]">·</span>
                        <span className="font-semibold text-[var(--green-900)]">
                          ₹{item.unitPrice.toFixed(2)} / unit · Line Total: ₹{lineTotal.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Interactive Steppers & Actions */}
                  <div className="flex items-center gap-3 shrink-0 self-end lg:self-center">
                    {/* Quantity Stepper Control */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-[var(--text-muted)] mr-1">Dispense:</span>
                      <div className="flex items-center border border-[var(--line-soft)] rounded-[var(--r-control)] bg-white overflow-hidden shadow-xs">
                        <button
                          type="button"
                          onClick={() => stepQty(item.id, -1)}
                          disabled={!item.included || item.qty <= 1}
                          className="h-9 w-9 flex items-center justify-center text-base font-bold text-[var(--text-strong)] hover:bg-[var(--bg-tile)] active:bg-[var(--line-soft)] disabled:opacity-30 disabled:cursor-not-allowed border-r border-[var(--line-soft)] transition-colors cursor-pointer"
                          title="Decrease quantity by 1"
                        >
                          <Minus size={13} />
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={999}
                          value={item.qty}
                          disabled={!item.included}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            updateQty(item.id, isNaN(val) ? 1 : val);
                          }}
                          className="h-9 w-14 text-center text-xs font-bold text-[var(--text-strong)] focus:outline-none focus:bg-[var(--sage-100)]"
                        />
                        <button
                          type="button"
                          onClick={() => stepQty(item.id, 1)}
                          disabled={!item.included}
                          className="h-9 w-9 flex items-center justify-center text-base font-bold text-[var(--text-strong)] hover:bg-[var(--bg-tile)] active:bg-[var(--line-soft)] disabled:opacity-30 disabled:cursor-not-allowed border-l border-[var(--line-soft)] transition-colors cursor-pointer"
                          title="Increase quantity by 1"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                      <span className="text-xs text-[var(--text-muted)] w-12 text-left">
                        {item.drugType === 'syrup' ? 'bottle' : 'units'}
                      </span>
                    </div>

                    {/* Edit Details Button */}
                    <button
                      type="button"
                      onClick={() => setEditingItem(item)}
                      className="h-9 px-3 text-xs font-semibold rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] text-[var(--text-strong)] hover:border-[var(--green-600)] hover:bg-[var(--bg-tile)] transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                      title="Edit price, dosage, or substitute medicine"
                    >
                      <Pencil size={12} className="text-[var(--green-700)]" />
                      Edit
                    </button>

                    {/* Remove Item Button */}
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="h-9 w-9 flex items-center justify-center rounded-[var(--r-control)] text-[var(--text-muted)] hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                      title="Remove this item"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Confirmation & Action Bar */}
        <div className="mt-6 pt-5 border-t border-[var(--line-soft)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[var(--text-muted)]">
              Dispensing <strong className="text-[var(--text-strong)]">{includedItems.length} of {items.length} items</strong> ·
              Pharmacist on duty: <strong>{user?.fullName || 'Pharmacist'}</strong>
            </p>
            <p className="text-sm font-bold text-[var(--green-900)] mt-0.5">
              Grand Total: ₹{totalAmount.toFixed(2)}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/pharmacy"
              className="h-11 px-5 text-sm font-semibold rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] text-[var(--text-strong)] hover:bg-[var(--bg-tile)] transition-all flex items-center justify-center text-center shadow-xs cursor-pointer"
            >
              Back to Dispensing Queue
            </Link>

            {/* PRD v1.1 Core: Delivered Button */}
            <Button
              size="lg"
              icon={<Check size={18} />}
              onClick={handleMarkDelivered}
              disabled={isSubmitting}
              loading={isSubmitting}
              className="bg-[var(--green-900)] text-white hover:bg-[var(--green-800)] px-8 shadow-sm font-semibold"
            >
              {isSubmitting ? 'Delivering...' : `Delivered (₹${totalAmount.toFixed(2)})`}
            </Button>
          </div>
        </div>
      </Card>

      {/* ────────────────────────────────────────────────────────────────────────
          MODAL 1: EDIT ITEM DETAILS (Qty, Price, Dosage, Substitute Drug)
         ──────────────────────────────────────────────────────────────────────── */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-[var(--r-card)] max-w-lg w-full p-6 shadow-2xl border border-[var(--line-soft)] space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--line-soft)] pb-3">
              <div>
                <h3 className="text-lg font-bold text-[var(--text-strong)]">Edit Dispensing Item</h3>
                <p className="text-xs text-[var(--text-muted)]">Adjust quantity, price, dosage, or substitute medicine</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="h-8 w-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:bg-gray-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Medicine Name & Substitution */}
              <div>
                <label className="font-semibold text-[var(--text-strong)] block mb-1">
                  Medicine Name / Substitute from Catalog
                </label>
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={editingItem.name}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    className="w-full h-9 rounded-[var(--r-control)] border border-[var(--line-soft)] px-3 text-xs font-medium text-[var(--text-strong)] focus:outline-none focus:border-[var(--green-600)]"
                  />
                  {/* Quick Substitute Dropdown */}
                  <select
                    onChange={(e) => {
                      const selected = drugs.find((d) => d.id === e.target.value);
                      if (selected) {
                        setEditingItem({
                          ...editingItem,
                          drugId: selected.id,
                          name: selected.name,
                          drugType: selected.drug_type,
                          unitPrice: selected.selling_price || editingItem.unitPrice,
                          stockAvailable: selected.stock_quantity,
                          isScheduleH: Boolean(selected.schedule_h || selected.schedule_h1),
                          isCustom: false,
                        });
                      }
                    }}
                    className="w-full h-8 rounded-[var(--r-control)] border border-[var(--line-soft)] bg-gray-50 px-2 text-[11px] text-[var(--text-muted)]"
                  >
                    <option value="">-- Or substitute with an in-stock drug --</option>
                    {drugs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.drug_type}) · Stock: {d.stock_quantity} · ₹{d.selling_price}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quantity with Steppers */}
              <div>
                <label className="font-semibold text-[var(--text-strong)] block mb-1">
                  Dispense Quantity ({editingItem.drugType === 'syrup' ? 'Bottles' : 'Units'})
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center border border-[var(--line-soft)] rounded-[var(--r-control)] bg-white overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setEditingItem({ ...editingItem, qty: Math.max(1, editingItem.qty - 1) })}
                      className="h-9 w-9 flex items-center justify-center font-bold text-base hover:bg-gray-100 border-r border-[var(--line-soft)]"
                    >
                      <Minus size={13} />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={editingItem.qty}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setEditingItem({ ...editingItem, qty: isNaN(v) ? 1 : Math.max(1, v) });
                      }}
                      className="h-9 w-16 text-center text-sm font-bold text-[var(--text-strong)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setEditingItem({ ...editingItem, qty: editingItem.qty + 1 })}
                      className="h-9 w-9 flex items-center justify-center font-bold text-base hover:bg-gray-100 border-l border-[var(--line-soft)]"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                  {/* Quick Preset Buttons */}
                  <div className="flex items-center gap-1">
                    {[5, 10, 15, 30].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setEditingItem({ ...editingItem, qty: preset })}
                        className="h-8 px-2 rounded bg-gray-100 hover:bg-gray-200 text-[11px] font-semibold text-[var(--text-strong)]"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Unit Price (₹) & Total */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[var(--text-strong)] block mb-1">
                    Unit Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={editingItem.unitPrice}
                    onChange={(e) => {
                      const p = parseFloat(e.target.value);
                      setEditingItem({ ...editingItem, unitPrice: isNaN(p) ? 0 : Math.max(0, p) });
                    }}
                    className="w-full h-9 rounded-[var(--r-control)] border border-[var(--line-soft)] px-3 text-xs font-semibold text-[var(--text-strong)] focus:outline-none focus:border-[var(--green-600)]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[var(--text-muted)] block mb-1">
                    Item Total Amount
                  </label>
                  <div className="h-9 flex items-center px-3 bg-gray-50 rounded-[var(--r-control)] border border-[var(--line-soft)] font-bold text-sm text-[var(--green-900)]">
                    ₹{(editingItem.qty * editingItem.unitPrice).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Dosage / Notes */}
              <div>
                <label className="font-semibold text-[var(--text-strong)] block mb-1">
                  Dosage / Pharmacist Instruction
                </label>
                <input
                  type="text"
                  value={editingItem.dosage}
                  onChange={(e) => setEditingItem({ ...editingItem, dosage: e.target.value })}
                  placeholder="e.g. 1 tablet twice daily after food"
                  className="w-full h-9 rounded-[var(--r-control)] border border-[var(--line-soft)] px-3 text-xs text-[var(--text-strong)] focus:outline-none focus:border-[var(--green-600)]"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--line-soft)]">
              <Button variant="secondary" size="sm" onClick={() => setEditingItem(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => handleSaveEdit(editingItem)}>
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          MODAL 2: ADD MEDICATION TO PRESCRIPTION
         ──────────────────────────────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-[var(--r-card)] max-w-lg w-full p-6 shadow-2xl border border-[var(--line-soft)] space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--line-soft)] pb-3">
              <div>
                <h3 className="text-lg font-bold text-[var(--text-strong)]">Add Medication to Order</h3>
                <p className="text-xs text-[var(--text-muted)]">Select from inventory or enter an OTC item</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:bg-gray-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Catalog Selection */}
              <div>
                <label className="font-semibold text-[var(--text-strong)] block mb-1">
                  Choose from Pharmacy Inventory
                </label>
                <select
                  value={newSelectedDrug?.id || ''}
                  onChange={(e) => {
                    const sel = drugs.find((d) => d.id === e.target.value);
                    if (sel) {
                      setNewSelectedDrug(sel);
                      setNewUnitPrice(sel.selling_price || 5);
                      setNewDrugType(sel.drug_type);
                      setNewQty(sel.drug_type === 'syrup' ? 1 : 10);
                    } else {
                      setNewSelectedDrug(null);
                    }
                  }}
                  className="w-full h-9 rounded-[var(--r-control)] border border-[var(--line-soft)] px-3 text-xs text-[var(--text-strong)] focus:outline-none focus:border-[var(--green-600)]"
                >
                  <option value="">-- Or enter custom item name below --</option>
                  {drugs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.drug_type}) · Stock: {d.stock_quantity} · ₹{d.selling_price}
                    </option>
                  ))}
                </select>
              </div>

              {!newSelectedDrug && (
                <div>
                  <label className="font-semibold text-[var(--text-strong)] block mb-1">
                    Custom Medicine / OTC Product Name *
                  </label>
                  <input
                    type="text"
                    value={newCustomName}
                    onChange={(e) => setNewCustomName(e.target.value)}
                    placeholder="e.g. Gelusil MPS Syrup, ORS Sachet..."
                    className="w-full h-9 rounded-[var(--r-control)] border border-[var(--line-soft)] px-3 text-xs text-[var(--text-strong)] focus:outline-none focus:border-[var(--green-600)]"
                  />
                </div>
              )}

              {/* Quantity & Unit Price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[var(--text-strong)] block mb-1">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    value={newQty}
                    onChange={(e) => setNewQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full h-9 rounded-[var(--r-control)] border border-[var(--line-soft)] px-3 text-xs font-bold text-[var(--text-strong)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[var(--text-strong)] block mb-1">Unit Price (₹)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={newUnitPrice}
                    onChange={(e) => setNewUnitPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full h-9 rounded-[var(--r-control)] border border-[var(--line-soft)] px-3 text-xs font-bold text-[var(--text-strong)] focus:outline-none"
                  />
                </div>
              </div>

              {/* Dosage instruction */}
              <div>
                <label className="font-semibold text-[var(--text-strong)] block mb-1">Dosage / Instructions</label>
                <input
                  type="text"
                  value={newDosage}
                  onChange={(e) => setNewDosage(e.target.value)}
                  placeholder="e.g. 1 tablet twice daily after food"
                  className="w-full h-9 rounded-[var(--r-control)] border border-[var(--line-soft)] px-3 text-xs text-[var(--text-strong)] focus:outline-none"
                />
              </div>

              <div className="p-3 bg-gray-50 rounded-[var(--r-control)] border border-[var(--line-soft)] flex justify-between items-center font-bold text-sm text-[var(--green-900)]">
                <span>Calculated Line Total:</span>
                <span>₹{(newQty * newUnitPrice).toFixed(2)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--line-soft)]">
              <Button variant="secondary" size="sm" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleAddMedicineToOrder}>
                Add to Prescription Order
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
