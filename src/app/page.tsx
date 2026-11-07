'use client';

import { ClipboardList, Stethoscope, Pill, BedDouble, BarChart3, Settings, Shield, Plus, ArrowRight } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { PageHeader } from '@/components/layout';
import { useAuth } from '@/lib/auth/context';
import {
  useVisits,
  usePatients,
  useDoctors,
  useDrugs,
  useAdmissions,
  useDispensings,
  useBeds,
} from '@/lib/query/hooks';
import { isTodayOrWithin24Hours } from '@/lib/utils/date';
import Link from 'next/link';

export default function HomePage() {
  const { user } = useAuth();
  const { data: visits = [] } = useVisits();
  const { data: patients = [] } = usePatients();
  const { data: doctors = [] } = useDoctors();
  const { data: drugs = [] } = useDrugs();
  const { data: admissions = [] } = useAdmissions();
  const { data: dispensings = [] } = useDispensings();
  const { data: beds = [] } = useBeds();

  if (!user) return null;

  // Role-specific customized view
  const isDoctor = user.role === 'doctor';
  const isReception = user.role === 'receptionist';
  const isPharmacist = user.role === 'pharmacist';
  const isAdmin = user.role === 'admin';

  // Doctor specific metrics
  const myVisits = visits.filter((v) => v.doctor_id === (user.doctorId || user.id));
  const myWaiting = myVisits.filter((v) => (v.status === 'waiting' || v.status === 'in_consultation') && isTodayOrWithin24Hours(v.created_at));
  const myCompleted = myVisits.filter((v) => (v.status === 'prescribed' || v.status === 'dispensed' || v.status === 'completed') && isTodayOrWithin24Hours(v.updated_at || v.created_at));

  // Today hospital metrics
  const todayVisitsCount = visits.filter((v) => isTodayOrWithin24Hours(v.created_at)).length;
  const todayDispensedCount = dispensings.filter((d) => isTodayOrWithin24Hours(d.delivered_at || d.created_at)).length;

  // Pharmacy metrics
  const pendingRx = visits.filter((v) => v.status === 'prescribed' && isTodayOrWithin24Hours(v.updated_at || v.created_at));
  const lowStock = drugs.filter((d) => d.stock_quantity <= d.low_stock_limit);

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.fullName}`}
        subtitle={`${user.role.toUpperCase()} PORTAL · ${
          user.specialization ? `${user.specialization} · ` : ''
        }Radha Krishna HMS · by opti-x.in`}
        action={
          isAdmin ? (
            <Link href="/register">
              <Button icon={<Plus size={16} />}>Create Staff Login</Button>
            </Link>
          ) : isReception ? (
            <Link href="/reception/register">
              <Button icon={<Plus size={16} />}>Register New Patient</Button>
            </Link>
          ) : isDoctor ? (
            <Link href="/doctor">
              <Button icon={<ArrowRight size={16} />}>Open My Patient Queue</Button>
            </Link>
          ) : (
            <Link href="/pharmacy">
              <Button icon={<ArrowRight size={16} />}>Open Dispensing Queue</Button>
            </Link>
          )
        }
      />

      {/* KPI Stats customized by role */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {isAdmin && (
          <>
            <StatCard label="Total Staff Logins" value={doctors.length + 3} sub="Doctors, Reception, Pharmacy" />
            <StatCard label="OPD Patients Today" value={todayVisitsCount} sub="Active registrations today" />
            <StatCard label="In-Patients (IP)" value={admissions.filter((a) => a.status === 'admitted').length} sub="Occupied beds" />
            <StatCard label="Pharmacy Items" value={drugs.length} sub={`${lowStock.length} low stock`} />
          </>
        )}

        {isDoctor && (
          <>
            <StatCard label="Waiting in Your Queue" value={myWaiting.length} sub="Assigned to you today" highlight />
            <StatCard label="Consulted Today" value={myCompleted.length} sub="Completed in last 24h" />
            <StatCard label="Total Hospital Queue" value={todayVisitsCount} sub="All doctors today" />
            <StatCard label="Your Specialization" value={user.specialization || 'Consultant'} sub={user.consultationRoom || 'OPD'} />
          </>
        )}

        {isReception && (
          <>
            <StatCard label="Registered Today" value={todayVisitsCount} sub="Tokens issued today" />
            <StatCard label="Waiting for Doctors" value={visits.filter((v) => v.status === 'waiting' && isTodayOrWithin24Hours(v.created_at)).length} sub="In waiting area" highlight />
            <StatCard label="Active In-Patients (IP)" value={admissions.filter((a) => a.status === 'admitted').length} sub="Occupied beds" highlight />
            <StatCard label="Available Free Beds" value={beds.filter((b) => !b.is_occupied).length} sub={`${beds.length} total hospital beds`} />
          </>
        )}

        {isPharmacist && (
          <>
            <StatCard label="Prescriptions to Dispense" value={pendingRx.length} sub="Pending queue" highlight />
            <StatCard label="Dispensed Today" value={todayDispensedCount} sub="Completed in last 24h" />
            <StatCard label="Total Drugs in Catalog" value={drugs.length} sub="Pharmacy inventory" />
            <StatCard label="Low Stock Alerts" value={lowStock.length} sub="Below reorder threshold" />
          </>
        )}
      </div>

      {/* Authorized Modules Grid */}
      <h3 className="text-base font-medium text-[var(--text-strong)] mb-3">Your Authorized Departments</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isAdmin && (
          <ModuleLink
            title="Super Admin Master Control"
            desc="View, edit, and delete all staff logins, patients, visits, and pharmacy data"
            href="/admin"
            icon={Shield}
            color="bg-red-100 text-red-700"
          />
        )}

        {(isAdmin || isReception) && (
          <ModuleLink
            title="OPD Reception Desk"
            desc="Register incoming patients, issue daily tokens, and assign consultant doctors"
            href="/reception"
            icon={ClipboardList}
            color="bg-[var(--info-bg)] text-[var(--info)]"
          />
        )}

        {(isAdmin || isDoctor) && (
          <ModuleLink
            title="Doctor Consultation Queue"
            desc={
              isDoctor
                ? `Exclusively for ${user.fullName} (${user.specialization || 'Doctor'})`
                : 'Doctor queues, vitals, and prescription builders'
            }
            href="/doctor"
            icon={Stethoscope}
            color="bg-[var(--success-bg)] text-[var(--success)]"
          />
        )}

        {(isAdmin || isPharmacist) && (
          <ModuleLink
            title="Pharmacy & Inventory"
            desc="Dispense prescribed medications, print receipts, and manage drug stock"
            href="/pharmacy"
            icon={Pill}
            color="bg-[var(--warning-bg)] text-[var(--warning)]"
          />
        )}

        {(isAdmin || isReception) && (
          <ModuleLink
            title="In-Patient (IP) Department"
            desc="Ward and bed occupancy, 18-hour daily billing timer & discharge"
            href="/ip"
            icon={BedDouble}
            color="bg-purple-100 text-purple-700"
          />
        )}

        {isAdmin && (
          <>
            <ModuleLink
              title="Analytics & Reports"
              desc="Patient volumes, rush hours heatmap, doctor load, and pharmacy revenue"
              href="/analytics"
              icon={BarChart3}
              color="bg-[var(--sage-100)] text-[var(--green-700)]"
            />
            <ModuleLink
              title="Hospital Settings"
              desc="Hospital branding, prescription print layouts, and operational reset rules"
              href="/settings"
              icon={Settings}
              color="bg-[var(--bg-tile)] text-[var(--text-muted)]"
            />
          </>
        )}
      </div>
    </>
  );
}

function StatCard({ label, value, sub, highlight }: { label: string; value: string | number; sub: string; highlight?: boolean }) {
  return (
    <Card padding="sm" className={highlight ? 'border border-[var(--green-600)] bg-[var(--sage-100)]' : 'border border-[var(--line-soft)]'}>
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="text-[28px] font-light text-[var(--text-strong)] leading-tight mt-1">{value}</p>
      <p className="text-[11px] text-[var(--text-faint)] mt-1">{sub}</p>
    </Card>
  );
}

function ModuleLink({
  title,
  desc,
  href,
  icon: Icon,
  color,
}: {
  title: string;
  desc: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
}) {
  return (
    <Link href={href}>
      <Card className="group hover:shadow-[var(--shadow-float)] transition-all duration-150 cursor-pointer h-full border border-[var(--line-soft)] hover:border-[var(--green-600)]">
        <div className="flex items-start gap-3.5">
          <div className={`h-10 w-10 rounded-[var(--r-control)] flex items-center justify-center shrink-0 ${color}`}>
            <Icon size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-[var(--text-strong)] group-hover:text-[var(--green-700)] transition-colors">
              {title}
            </h4>
            <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">{desc}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
