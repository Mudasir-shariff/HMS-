'use client';

import { useState } from 'react';
import { ArrowLeft, CheckCircle, Calculator, Package } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Button, Input, Checkbox } from '@/components/ui';
import { PageHeader } from '@/components/layout';
import { HMSStore } from '@/lib/store/hms-store';
import type { DrugType, Drug } from '@/lib/types/database';

const DEFAULT_SUPPLIERS = [
  'Cipla Healthcare',
  'Sun Pharma Ltd',
  'Dr. Reddy Laboratories',
  'Alkem Laboratories',
  'Mankind Pharma',
  'Novartis India',
  'Torrent Pharmaceuticals',
  'Abbott India',
];

const DEFAULT_UNITS = [
  'tablet',
  'capsule',
  'bottle',
  'vial',
  'ampoule',
  'tube',
  'sachet',
];

interface AddDrugFormState {
  name: string;
  drugType: string;
  customTypeName: string;
  supplier: string;
  unit: string;
  expiryDate: string;
  batchNumber: string;

  // Number fields — ALL START AT 0 (PRD v1.1 Rule)
  boxes: number;
  sheetsPerBox: number;
  tabletsPerSheet: number;
  costPerSheet: number;
  purchasePrice: number;        // cost per tablet / unit
  sellingPricePerSheet: number; // MRP per sheet (strip)
  sellingPrice: number;         // MRP per tablet / unit
  stockQuantity: number;        // smallest sellable units
  lowStockLimit: number;

  scheduleH: boolean;
  scheduleH1: boolean;
}

export default function AddDrugPage() {
  const router = useRouter();

  // PRD v1.1 Rule: All number fields start at 0 instead of blank
  const [form, setForm] = useState<AddDrugFormState>({
    name: '',
    drugType: 'tablet',
    customTypeName: '',
    supplier: 'Cipla Healthcare',
    unit: 'tablet',
    expiryDate: '',
    batchNumber: '',

    boxes: 0,
    sheetsPerBox: 0,
    tabletsPerSheet: 0,
    costPerSheet: 0,
    purchasePrice: 0,
    sellingPricePerSheet: 0,
    sellingPrice: 0,
    stockQuantity: 0,
    lowStockLimit: 0,

    scheduleH: false,
    scheduleH1: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedDrug, setSavedDrug] = useState<Drug | null>(null);

  function update<K extends keyof AddDrugFormState>(key: K, value: AddDrugFormState[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };

      // PRD v1.1 Rule: Cost per sheet converts to cost per tablet automatically
      if (key === 'costPerSheet' || key === 'tabletsPerSheet') {
        const costSheet = key === 'costPerSheet' ? (value as number) : prev.costPerSheet;
        const tabsSheet = key === 'tabletsPerSheet' ? (value as number) : prev.tabletsPerSheet;
        if (costSheet > 0 && tabsSheet > 0) {
          next.purchasePrice = Number((costSheet / tabsSheet).toFixed(2));
          // If selling price & sheet price are 0, suggest a 25% margin default
          if (next.sellingPrice === 0 && next.sellingPricePerSheet === 0) {
            next.sellingPricePerSheet = Number((costSheet * 1.25).toFixed(2));
            next.sellingPrice = Number(((costSheet / tabsSheet) * 1.25).toFixed(2));
          }
        }
      }

      // Selling Price / MRP per Sheet -> Auto calculate Selling Price per tablet / unit
      if (key === 'sellingPricePerSheet') {
        const sheetPrice = value as number;
        const tabsSheet = prev.tabletsPerSheet;
        if (sheetPrice > 0 && tabsSheet > 0) {
          next.sellingPrice = Number((sheetPrice / tabsSheet).toFixed(2));
        }
      }

      // If user directly edits selling price per tablet, sync back to sheet price
      if (key === 'sellingPrice') {
        const tabPrice = value as number;
        const tabsSheet = prev.tabletsPerSheet;
        if (tabPrice > 0 && tabsSheet > 0) {
          next.sellingPricePerSheet = Number((tabPrice * tabsSheet).toFixed(2));
        }
      }

      // When tabletsPerSheet changes, recalculate sellingPrice if sellingPricePerSheet > 0
      if (key === 'tabletsPerSheet') {
        const tabs = value as number;
        if (next.sellingPricePerSheet > 0 && tabs > 0) {
          next.sellingPrice = Number((next.sellingPricePerSheet / tabs).toFixed(2));
        }
      }

      // Auto-calculate stock in smallest units if packaging is provided
      if (key === 'boxes' || key === 'sheetsPerBox' || key === 'tabletsPerSheet') {
        const b = key === 'boxes' ? (value as number) : prev.boxes;
        const s = key === 'sheetsPerBox' ? (value as number) : prev.sheetsPerBox;
        const t = key === 'tabletsPerSheet' ? (value as number) : prev.tabletsPerSheet;
        if (b > 0 && (s > 0 || t > 0)) {
          const multiplier = (s > 0 ? s : 1) * (t > 0 ? t : 1);
          next.stockQuantity = b * multiplier;
        }
      }

      // Update unit default based on drugType
      if (key === 'drugType') {
        const dt = value as string;
        if (dt === 'syrup') next.unit = 'bottle';
        else if (dt === 'injection') next.unit = 'vial';
        else if (dt === 'capsule') next.unit = 'capsule';
        else if (dt === 'tablet') next.unit = 'tablet';
      }

      return next;
    });

    if (errors[key as string]) {
      setErrors((e) => {
        const n = { ...e };
        delete n[key as string];
        return n;
      });
    }
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Drug name is required.';
    if (!form.expiryDate) errs.expiryDate = 'Expiry date is required.';
    if (form.sellingPrice < 0) errs.sellingPrice = 'Selling price cannot be negative.';
    if (form.stockQuantity < 0) errs.stockQuantity = 'Stock cannot be negative.';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const normalizedType: DrugType = ['tablet', 'capsule', 'syrup', 'injection'].includes(form.drugType.toLowerCase())
      ? (form.drugType.toLowerCase() as DrugType)
      : 'other';

    const newDrug: Drug = {
      id: `drug-${Date.now()}`,
      name: form.name.trim(),
      drug_type: normalizedType,
      custom_type_name: normalizedType === 'other' ? form.drugType : undefined,
      expiry_date: form.expiryDate,
      purchase_price: form.purchasePrice,
      selling_price: form.sellingPrice,
      selling_price_per_sheet: form.sellingPricePerSheet > 0 ? form.sellingPricePerSheet : undefined,
      stock_quantity: form.stockQuantity,
      low_stock_limit: form.lowStockLimit,
      boxes: form.boxes,
      tablets_per_sheet: form.tabletsPerSheet,
      price_per_sheet: form.costPerSheet,
      supplier: form.supplier,
      unit: form.unit,
      batch_number: form.batchNumber.trim() || undefined,
      schedule_h: form.scheduleH,
      schedule_h1: form.scheduleH1,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    HMSStore.saveDrug(newDrug);
    setSavedDrug(newDrug);
  }

  const isOralSolid = form.drugType === 'tablet' || form.drugType === 'capsule';
  const isSyrup = form.drugType === 'syrup';
  const isInjection = form.drugType === 'injection';

  if (savedDrug) {
    return (
      <div className="py-8 max-w-md mx-auto text-center">
        <Card className="p-8 shadow-[var(--shadow-float)] border border-[var(--line-soft)]">
          <div className="h-16 w-16 rounded-full bg-[var(--success-bg)] text-[var(--success)] flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} />
          </div>
          <h2 className="text-2xl font-medium text-[var(--text-strong)] mb-1">Drug Added to Inventory!</h2>
          <p className="text-xs text-[var(--text-muted)] mb-5">
            <strong>{savedDrug.name}</strong> is now live in the hospital pharmacy catalog.
          </p>

          <div className="bg-[var(--bg-tile)] rounded-[var(--r-tile)] p-4 text-left text-xs mb-6 space-y-1.5 border border-[var(--line-soft)]">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Type:</span>
              <span className="font-semibold text-[var(--text-strong)] capitalize">{savedDrug.drug_type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Live Stock:</span>
              <span className="font-bold text-[var(--green-700)]">
                {savedDrug.stock_quantity} {savedDrug.unit || 'units'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Cost / Unit:</span>
              <span>₹{savedDrug.purchase_price.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Selling MRP:</span>
              <span className="font-bold text-[var(--text-strong)]">
                ₹{savedDrug.selling_price.toFixed(2)} / unit
                {savedDrug.selling_price_per_sheet ? ` (₹${savedDrug.selling_price_per_sheet}/sheet)` : ''}
              </span>
            </div>
            {savedDrug.selling_price_per_sheet && (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">MRP per Sheet:</span>
                <span className="font-semibold text-[var(--green-700)]">₹{savedDrug.selling_price_per_sheet.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Expiry Date:</span>
              <span className="font-medium text-[var(--text-strong)]">{savedDrug.expiry_date}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <Button onClick={() => router.push('/pharmacy')}>Back to Pharmacy Catalog</Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSavedDrug(null);
                setForm({
                  name: '',
                  drugType: 'tablet',
                  customTypeName: '',
                  supplier: 'Cipla Healthcare',
                  unit: 'tablet',
                  expiryDate: '',
                  batchNumber: '',
                  boxes: 0,
                  sheetsPerBox: 0,
                  tabletsPerSheet: 0,
                  costPerSheet: 0,
                  purchasePrice: 0,
                  sellingPricePerSheet: 0,
                  sellingPrice: 0,
                  stockQuantity: 0,
                  lowStockLimit: 0,
                  scheduleH: false,
                  scheduleH1: false,
                });
              }}
            >
              Add Another Medicine
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.push('/pharmacy')}
          className="h-10 w-10 flex items-center justify-center rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] text-[var(--text-strong)] hover:bg-[var(--bg-tile)] hover:border-[var(--green-600)] transition-all cursor-pointer shadow-xs shrink-0"
          title="Back to Pharmacy"
          aria-label="Back to Pharmacy"
        >
          <ArrowLeft size={18} />
        </button>
        <PageHeader
          title="Add New Drug to Inventory"
          subtitle="Auto unit-price conversion · Select-and-type fields · 0-initialized number fields"
        />
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Main Form (Left 2 cols) */}
          <div className="lg:col-span-2 flex flex-col gap-5">
            {/* 1. Identification & Type */}
            <Card>
              <h3 className="text-[18px] font-medium text-[var(--text-strong)] mb-4">
                Drug Identification & Classification
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Input
                    label="Drug / Medicine Name *"
                    placeholder="e.g. Paracetamol 500mg, Ceftriaxone 1g, Ambroxol 100ml"
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                    error={errors.name}
                  />
                </div>

                {/* PRD v1.1 Rule: Select-and-type box for Drug Type */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-strong)] mb-1">
                    Drug Type * (Pick or Type)
                  </label>
                  <input
                    type="text"
                    list="drug-types-list"
                    value={form.drugType}
                    onChange={(e) => update('drugType', e.target.value)}
                    placeholder="Tablet, Capsule, Syrup, Injection..."
                    className="h-10 w-full rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] px-3 text-xs text-[var(--text-body)] focus:outline-none focus:border-[var(--green-600)]"
                  />
                  <datalist id="drug-types-list">
                    <option value="tablet">Tablet</option>
                    <option value="capsule">Capsule</option>
                    <option value="syrup">Syrup (Bottle)</option>
                    <option value="injection">Injection (Vial / Ampoule)</option>
                    <option value="ointment">Ointment / Gel</option>
                    <option value="drops">Eye / Ear Drops</option>
                    <option value="inhaler">Inhaler / Respule</option>
                  </datalist>
                  <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                    Choose from list or type custom
                  </span>
                </div>

                {/* PRD v1.1 Rule: Select-and-type box for Supplier */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-strong)] mb-1">
                    Supplier / Manufacturer
                  </label>
                  <input
                    type="text"
                    list="suppliers-list"
                    value={form.supplier}
                    onChange={(e) => update('supplier', e.target.value)}
                    placeholder="Pick or type company..."
                    className="h-10 w-full rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] px-3 text-xs text-[var(--text-body)] focus:outline-none focus:border-[var(--green-600)]"
                  />
                  <datalist id="suppliers-list">
                    {DEFAULT_SUPPLIERS.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>

                <Input
                  label="Batch Number"
                  placeholder="e.g. BAT-2026-08A"
                  value={form.batchNumber}
                  onChange={(e) => update('batchNumber', e.target.value)}
                />

                <Input
                  label="Expiry Date *"
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => update('expiryDate', e.target.value)}
                  error={errors.expiryDate}
                />
              </div>
            </Card>

            {/* 2. Packaging & Auto-Calculated Unit Cost */}
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[18px] font-medium text-[var(--text-strong)]">
                  Packaging & Unit Conversion
                </h3>
                <span className="text-xs text-[var(--green-700)] font-medium flex items-center gap-1">
                  <Calculator size={14} /> Auto-converts to smallest unit
                </span>
              </div>

              {isOralSolid && (
                <div className="bg-[var(--bg-tile)] p-4 rounded-[var(--r-tile)] border border-[var(--line-soft)] mb-4 text-xs space-y-3">
                  <p className="font-semibold text-[var(--text-strong)]">
                    Strip / Sheet Packaging & Pricing Auto-Conversion (PRD v1.1):
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div>
                      <label className="block text-[11px] text-[var(--text-muted)] mb-1">Number of Boxes</label>
                      <input
                        type="number"
                        min={0}
                        value={form.boxes}
                        onChange={(e) => update('boxes', Number(e.target.value) || 0)}
                        className="h-9 w-full rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] px-2.5 text-xs text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-muted)] mb-1">Sheets per Box</label>
                      <input
                        type="number"
                        min={0}
                        value={form.sheetsPerBox}
                        onChange={(e) => update('sheetsPerBox', Number(e.target.value) || 0)}
                        className="h-9 w-full rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] px-2.5 text-xs text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-muted)] mb-1">Tablets per Sheet</label>
                      <input
                        type="number"
                        min={0}
                        value={form.tabletsPerSheet}
                        onChange={(e) => update('tabletsPerSheet', Number(e.target.value) || 0)}
                        className="h-9 w-full rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] px-2.5 text-xs text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-muted)] mb-1">Cost per Sheet (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={form.costPerSheet}
                        onChange={(e) => update('costPerSheet', Number(e.target.value) || 0)}
                        className="h-9 w-full rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] px-2.5 text-xs text-center font-bold text-[var(--green-700)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-muted)] mb-1">MRP per Sheet (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={form.sellingPricePerSheet}
                        onChange={(e) => update('sellingPricePerSheet', Number(e.target.value) || 0)}
                        className="h-9 w-full rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] px-2.5 text-xs text-center font-bold text-[var(--green-900)]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {isSyrup && (
                <div className="bg-[var(--bg-tile)] p-3 rounded-[var(--r-tile)] border border-[var(--line-soft)] mb-4 text-xs">
                  ℹ️ <strong>Syrup Packaging Rule (PRD v1.1):</strong> Syrups are counted and tracked per bottle. Selling and purchase prices apply per individual bottle.
                </div>
              )}

              {isInjection && (
                <div className="bg-[var(--bg-tile)] p-3 rounded-[var(--r-tile)] border border-[var(--line-soft)] mb-4 text-xs">
                  ℹ️ <strong>Injection Packaging Rule (PRD v1.1):</strong> Injections are tracked per vial or ampoule. Enter unit cost and stock quantity directly.
                </div>
              )}

              {/* Pricing & Stock Fields (All numbers start at 0) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-strong)] mb-1">
                    Cost Price per Unit (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={form.purchasePrice}
                    onChange={(e) => update('purchasePrice', Number(e.target.value) || 0)}
                    className="h-10 w-full rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] px-3 text-xs font-bold"
                  />
                  <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                    {isOralSolid && form.costPerSheet > 0
                      ? `Auto: ₹${form.costPerSheet} / ${form.tabletsPerSheet || 1} = ₹${form.purchasePrice} / tablet`
                      : 'Hospital acquisition cost'}
                  </span>
                </div>

                {isOralSolid ? (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-strong)] mb-1">
                        Selling / MRP per Sheet (₹) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={form.sellingPricePerSheet}
                        onChange={(e) => update('sellingPricePerSheet', Number(e.target.value) || 0)}
                        className="h-10 w-full rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] px-3 text-xs font-bold text-[var(--green-900)] focus:border-[var(--green-600)]"
                      />
                      <span className="text-[10px] text-[var(--green-700)] font-medium mt-1 block">
                        Enter strip MRP to auto-calculate per tablet
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-strong)] mb-1">
                        Selling Price / MRP per Unit (₹) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={form.sellingPrice}
                        onChange={(e) => update('sellingPrice', Number(e.target.value) || 0)}
                        className="h-10 w-full rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] px-3 text-xs font-bold text-[var(--green-900)]"
                      />
                      <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                        {form.sellingPricePerSheet > 0 && form.tabletsPerSheet > 0
                          ? `✨ Auto: ₹${form.sellingPricePerSheet} / ${form.tabletsPerSheet} tabs = ₹${form.sellingPrice} / ${form.unit} (editable)`
                          : `Per ${form.unit} billed to patients`}
                      </span>
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-strong)] mb-1">
                      Selling Price / MRP per Unit (₹) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={form.sellingPrice}
                      onChange={(e) => update('sellingPrice', Number(e.target.value) || 0)}
                      className="h-10 w-full rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] px-3 text-xs font-bold text-[var(--green-900)]"
                    />
                    <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                      Billed to patients per {form.unit}
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-strong)] mb-1">
                    Total Starting Stock Quantity *
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.stockQuantity}
                    onChange={(e) => update('stockQuantity', Number(e.target.value) || 0)}
                    className="h-10 w-full rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] px-3 text-xs font-bold"
                  />
                  <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                    Smallest sellable unit ({form.unit || 'units'})
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-strong)] mb-1">
                    Low Stock Reorder Limit
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.lowStockLimit}
                    onChange={(e) => update('lowStockLimit', Number(e.target.value) || 0)}
                    className="h-10 w-full rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] px-3 text-xs font-bold"
                  />
                  <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                    Triggers reorder warning when stock hits this
                  </span>
                </div>
              </div>
            </Card>

            {/* 3. Regulatory Flags */}
            <Card>
              <h3 className="text-[18px] font-medium text-[var(--text-strong)] mb-3">
                Regulatory Classifications
              </h3>
              <div className="flex flex-col gap-3">
                <Checkbox
                  label="Schedule H Drug (Prescription Required Warning)"
                  checked={form.scheduleH}
                  onChange={(e) => update('scheduleH', e.target.checked)}
                />
                <Checkbox
                  label="Schedule H1 Drug (Strict Narcotics / High-Potency Audit)"
                  checked={form.scheduleH1}
                  onChange={(e) => update('scheduleH1', e.target.checked)}
                />
              </div>
            </Card>
          </div>

          {/* Right Action Sidebar */}
          <div className="flex flex-col gap-4">
            <Card>
              <h4 className="text-sm font-semibold text-[var(--text-strong)] mb-2">Inventory Summary</h4>
              <p className="text-xs text-[var(--text-muted)] mb-4">
                Verify values before saving to the central drug master.
              </p>

              <div className="bg-[var(--bg-tile)] p-3 rounded-[var(--r-control)] text-xs space-y-2 mb-4 border border-[var(--line-soft)]">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Category:</span>
                  <span className="font-semibold capitalize">{form.drugType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Selling Rate:</span>
                  <span className="font-bold text-[var(--green-700)]">₹{form.sellingPrice.toFixed(2)} / unit</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Total Units:</span>
                  <span className="font-bold text-[var(--text-strong)]">{form.stockQuantity} units</span>
                </div>
              </div>

              <Button type="submit" size="lg" className="w-full">
                Save Drug to Catalog
              </Button>
            </Card>
          </div>
        </div>
      </form>
    </>
  );
}
