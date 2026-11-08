'use client';

import { useState, useEffect } from 'react';
import { Settings, Save, CheckCircle, Hospital, ShieldCheck, Printer, MessageSquare, AlertTriangle, PhoneCall, Mail } from 'lucide-react';
import { Card, CardHeader, Button, Input, Select, Textarea, Checkbox } from '@/components/ui';
import { PageHeader } from '@/components/layout';
import { useHospitalSettings } from '@/lib/query/hooks';
import { queryKeys } from '@/lib/query/keys';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { HospitalSettings } from '@/lib/types/database';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: dbSettings } = useHospitalSettings();

  const [form, setForm] = useState<HospitalSettings>({
    id: 'default',
    hospital_name: 'RADHA KRISHNA HOSPITAL',
    address: 'Main Road, Hospital Circle',
    phone: '+91 98765 43210',
    token_reset_hour: 0,
    ip_hours_per_day: 18,
    prescription_paper_size: 'A4',
    prescription_header: 'RADHA KRISHNA MULTISPECIALITY CARE',
    prescription_footer: "Please follow the doctor's instructions carefully.",
    default_printer: 'Hospital Reception LaserJet Pro',
    schedule_h_action: 'warn',
    whatsapp_enabled: true,
    whatsapp_template:
      'Namaste {patient_name}, this is a reminder from {hospital_name}. Your follow-up appointment with {doctor_name} is scheduled on {follow_up_date}. Please contact {phone} if you need to reschedule.',
    low_stock_days_warning: 7,
    expiry_days_warning: [90, 60, 30],
    updated_at: new Date().toISOString(),
  });

  useEffect(() => {
    if (dbSettings) {
      setForm((prev) => ({
        ...prev,
        ...dbSettings,
      }));
    }
  }, [dbSettings]);

  const [savedSuccess, setSavedSuccess] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    const supabase = createClient();
    const validId = (form.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(form.id))
      ? form.id
      : '00000000-0000-0000-0000-000000000001';

    await supabase.from('hospital_settings').upsert({
      id: validId,
      hospital_name: form.hospital_name,
      address: form.address,
      phone: form.phone,
      token_reset_hour: form.token_reset_hour,
      ip_hours_per_day: form.ip_hours_per_day,
      prescription_paper_size: form.prescription_paper_size,
      prescription_header: form.prescription_header,
      prescription_footer: form.prescription_footer,
      low_stock_days_warning: form.low_stock_days_warning,
      updated_at: new Date().toISOString(),
    });

    queryClient.invalidateQueries({ queryKey: queryKeys.settings.all });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  }

  return (
    <>
      <PageHeader
        title="Hospital System Configuration"
        subtitle="Manage hospital branding, operational timers, printer routing, WhatsApp templates & regulatory rules"
      />

      {savedSuccess && (
        <div className="flex items-center gap-2.5 bg-[var(--success-bg)] text-[#3A7A2E] p-4 rounded-[var(--r-tile)] border border-[var(--success)] mb-5 text-xs font-medium">
          <CheckCircle size={18} />
          Settings saved successfully and applied across all hospital modules.
        </div>
      )}

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 flex flex-col gap-5">
          {/* Hospital Profile */}
          <Card>
            <h3 className="text-lg font-medium text-[var(--text-strong)] mb-4">Hospital Profile & Header</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Input
                  label="Hospital / Clinic Name *"
                  value={form.hospital_name}
                  onChange={(e) => setForm({ ...form, hospital_name: e.target.value })}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <Input
                  label="Hospital Physical Address"
                  value={form.address || ''}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <Input
                label="Hospital Emergency Phone"
                value={form.phone || ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <Input
                label="Hospital Logo URL (Optional)"
                value={form.hospital_logo_url || ''}
                onChange={(e) => setForm({ ...form, hospital_logo_url: e.target.value })}
                placeholder="https://..."
              />
            </div>
          </Card>

          {/* Operational Timers & Regulatory Policy */}
          <Card>
            <h3 className="text-lg font-medium text-[var(--text-strong)] mb-4">Operational Timers & Rules (PRD v1.1)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Daily Token Reset Hour (0-23) *"
                type="number"
                min={0}
                max={23}
                value={form.token_reset_hour}
                onChange={(e) => setForm({ ...form, token_reset_hour: Number(e.target.value) })}
                hint="0 = Midnight reset (00:00). Daily tokens restart from 01."
              />
              <Input
                label="In-Patient (IP) Day Length (Hours) *"
                type="number"
                min={1}
                max={24}
                value={form.ip_hours_per_day}
                onChange={(e) => setForm({ ...form, ip_hours_per_day: Number(e.target.value) })}
                hint="Default: 18 hours per billing day cycle."
              />
              <Input
                label="Low-Stock Drug Warning Limit (Days)"
                type="number"
                value={form.low_stock_days_warning}
                onChange={(e) => setForm({ ...form, low_stock_days_warning: Number(e.target.value) })}
              />

              {/* Schedule H Walk-in Rule (PRD 3.5 & 3.10) */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-strong)] mb-1">
                  Schedule H / H1 Walk-in Policy
                </label>
                <select
                  value={form.schedule_h_action}
                  onChange={(e) => setForm({ ...form, schedule_h_action: e.target.value as 'warn' | 'block' })}
                  className="h-10 w-full rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] px-3 text-xs"
                >
                  <option value="warn">Warn Pharmacist (Requires override reason)</option>
                  <option value="block">Hard Block (Strictly forbid sale without prescription)</option>
                </select>
                <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                  Enforces drug compliance during OTC walk-in sales
                </span>
              </div>
            </div>
          </Card>

          {/* Prescription Format & Printer Mapping */}
          <Card>
            <h3 className="text-lg font-medium text-[var(--text-strong)] mb-4">Prescription Format & Hospital Printer Mapping</h3>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Prescription Print Paper Size"
                  options={[
                    { value: 'A4', label: 'A4 Full Sheet (Desktop Laser / Inkjet)' },
                    { value: 'A5', label: 'A5 Half Sheet (Doctor OPD Prescription Pad)' },
                    { value: 'thermal_80mm', label: '80mm Thermal POS Receipt Printer (3-inch roll)' },
                  ]}
                  value={form.prescription_paper_size}
                  onChange={(e) =>
                    setForm({ ...form, prescription_paper_size: (e.target as HTMLSelectElement).value as any })
                  }
                />

                <Input
                  label="Default Hospital Printer (Phone Print Relay) *"
                  value={form.default_printer || ''}
                  onChange={(e) => setForm({ ...form, default_printer: e.target.value })}
                  placeholder="e.g. Reception LaserJet 1020 / Pharmacy Desk HP"
                  hint="Where prescriptions print when doctor taps 'Send to printer' on phone"
                />
              </div>

              <Input
                label="Header Slogan / Banner Text"
                value={form.prescription_header || ''}
                onChange={(e) => setForm({ ...form, prescription_header: e.target.value })}
              />
              <Input
                label="Footer Note / Disclaimer"
                value={form.prescription_footer || ''}
                onChange={(e) => setForm({ ...form, prescription_footer: e.target.value })}
              />
            </div>
          </Card>

          {/* WhatsApp Follow-Up Reminders */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare size={18} className="text-[#25D366]" />
              <h3 className="text-lg font-medium text-[var(--text-strong)]">Automated WhatsApp Follow-Up (PRD Section 3.8)</h3>
            </div>
            <div className="space-y-4 text-xs">
              <Checkbox
                label="Enable Automated WhatsApp Follow-up Reminders"
                checked={form.whatsapp_enabled ?? true}
                onChange={(e) => setForm({ ...form, whatsapp_enabled: e.target.checked })}
              />

              <div>
                <Textarea
                  label="WhatsApp Follow-Up Template"
                  value={form.whatsapp_template || ''}
                  onChange={(e) => setForm({ ...form, whatsapp_template: e.target.value })}
                  rows={3}
                />
                <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                  Supported tags: &#123;patient_name&#125;, &#123;hospital_name&#125;, &#123;doctor_name&#125;, &#123;follow_up_date&#125;, &#123;phone&#125;
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* Action Sidebar */}
        <div className="flex flex-col gap-4">
          <Card>
            <Button type="submit" size="lg" icon={<Save size={16} />} className="w-full">
              Save Configuration
            </Button>
            <p className="text-xs text-[var(--text-muted)] text-center mt-3">
              Only Super Admin can modify system-wide hospital parameters.
            </p>
          </Card>

          <Card className="bg-[var(--sage-100)] border border-[var(--green-300)]">
            <div className="flex items-start gap-2.5">
              <ShieldCheck size={20} className="text-[var(--green-700)] shrink-0 mt-0.5" />
              <div className="text-xs text-[var(--text-body)]">
                <p className="font-semibold mb-1">Compliance & Integrity</p>
                <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                  Parameters comply with India Digital Personal Data Protection Act, ABDM standards, and Pharmacy Schedule H safety policies.
                </p>
              </div>
            </div>
          </Card>

          <Card className="border border-[var(--line-soft)] shadow-xs">
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[var(--line-soft)]">
              <PhoneCall size={16} className="text-[var(--green-700)]" />
              <p className="font-semibold text-xs text-[var(--text-strong)]">Technical Support (opti-x.in)</p>
            </div>
            <div className="space-y-2 text-[11px] text-[var(--text-muted)]">
              <div>
                <span className="font-medium text-[var(--text-strong)] block">Helpline / Call Support:</span>
                <a href="tel:8123649448" className="text-sm font-bold text-[var(--green-800)] hover:underline">
                  8123649448
                </a>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Calling Hours: 9:00 PM – 10:00 PM (Night)</p>
              </div>
              <div className="pt-1.5 border-t border-[var(--line-soft)]">
                <span className="font-medium text-[var(--text-strong)] block">Support Email:</span>
                <a href="mailto:hello@opti-x.in" className="text-[var(--green-800)] hover:underline font-medium break-all">
                  hello@opti-x.in
                </a>
              </div>
              <div className="pt-1.5 border-t border-[var(--line-soft)] text-[10px]">
                <span>Engineered by </span>
                <a href="https://opti-x.in" target="_blank" rel="noopener noreferrer" className="font-bold text-[var(--green-800)] hover:underline">
                  opti-x.in
                </a>
              </div>
            </div>
          </Card>
        </div>
      </form>
    </>
  );
}
