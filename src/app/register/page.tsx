'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Eye, EyeOff, CheckCircle, Stethoscope, ArrowLeft, ShieldCheck, FileText } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { HMSStore, generateUUID } from '@/lib/store/hms-store';
import { syncFromSupabase, pushUserToSupabase } from '@/lib/supabase/sync';
import { useAuth } from '@/lib/auth/context';
import { ROLE_HOME } from '@/lib/auth/roles';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import type { UserRole } from '@/lib/types/database';

const ROLES = [
  { value: 'admin', label: 'Super Admin', desc: 'Hospital administration, staff accounts, system settings' },
  { value: 'doctor', label: 'Consultant Doctor', desc: 'Patient consultation queue, clinical notes, prescriptions' },
  { value: 'receptionist', label: 'Receptionist', desc: 'Patient OPD registration, token queue, bed admissions' },
  { value: 'pharmacist', label: 'Pharmacist', desc: 'Prescription dispensing, batch inventory, drug pricing' },
];

const SPECIALIZATIONS = [
  'General Medicine',
  'Cardiology',
  'Pediatrics & Child Care',
  'Orthopedics & Joint Care',
  'Gynecology & Obstetrics',
  'Dermatology',
  'ENT (Ear, Nose, Throat)',
  'Ophthalmology',
  'Neurology',
  'Psychiatry',
  'General Surgery',
  'Pulmonology',
  'Dentistry',
];

interface FormState {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: UserRole;
  phone: string;
  specialization: string;
  consultationRoom: string;
  consultationFee: string;
  opdTimings: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { switchUser } = useAuth();

  const [form, setForm] = useState<FormState>({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'doctor',
    phone: '',
    specialization: 'General Medicine',
    consultationRoom: 'OPD Room 101',
    consultationFee: '500',
    opdTimings: '09:00 AM - 01:00 PM',
  });

  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [registeredAccount, setRegisteredAccount] = useState<any | null>(null);

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
    if (!form.fullName.trim()) errs.fullName = 'Full name is required.';
    if (!form.email.trim() || !form.email.includes('@')) errs.email = 'Valid email is required.';
    
    // Check if email already registered
    const existingUsers = HMSStore.getUsers();
    if (existingUsers.some((u) => u.email.toLowerCase() === form.email.trim().toLowerCase())) {
      errs.email = 'An account with this email address already exists. Please sign in instead.';
    }

    if (form.password.length < 4) errs.password = 'Password must be at least 4 characters.';
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match.';
    if (!form.role) errs.role = 'Please select a role.';

    if (form.role === 'doctor') {
      if (!form.specialization.trim()) errs.specialization = 'Doctor specialization is required.';
      if (!form.consultationRoom.trim()) errs.consultationRoom = 'Consultation room / cabin is required.';
    }

    if (!agreedToTerms) {
      errs.terms = 'You must agree to the Terms and Conditions and Privacy Policy to proceed.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);

    const supabase = createClient();
    const cleanEmail = form.email.trim().toLowerCase();

    // 1. Verify email uniqueness directly in Supabase
    try {
      const { data: existingUser, error: checkError } = await supabase
        .from('user_profiles')
        .select('id')
        .ilike('email', cleanEmail)
        .maybeSingle();

      if (!checkError && existingUser) {
        setErrors({ email: 'An account with this email address already exists. Please sign in instead.' });
        setLoading(false);
        return;
      }
    } catch (err) {
      console.warn('Email uniqueness check failed:', err);
    }

    let assignedId = generateUUID();

    // 2. Try Supabase Auth sign up (best effort, ignore internal domain restrictions)
    try {
      const { data: authData } = await (supabase.auth as any).signUp({
        email: cleanEmail,
        password: form.password,
      });
      if (authData?.user?.id) {
        assignedId = authData.user.id;
      }
    } catch {
      // Non-blocking for hospital intranet emails
    }

    // 3. Upsert directly into Supabase public.user_profiles table
    const userPayload: any = {
      id: assignedId,
      email: cleanEmail,
      password: form.password,
      full_name: form.fullName.trim(),
      role: form.role,
      phone: form.phone.trim() || null,
      specialization: form.role === 'doctor' ? (form.specialization || 'General Medicine') : null,
      consultation_room: form.role === 'doctor' ? (form.consultationRoom || 'Room 1') : null,
      consultation_fee: form.role === 'doctor' ? (Number(form.consultationFee) || 500) : 0,
      opd_timings: form.role === 'doctor' ? (form.opdTimings || null) : null,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const { error: profileError } = await supabase.from('user_profiles').upsert(userPayload);

    if (profileError) {
      console.error('Failed to save to user_profiles:', profileError);
      setErrors({ form: `Supabase database error: ${profileError.message || 'Could not save profile'}` });
      setLoading(false);
      return;
    }

    // 4. If registering a Doctor, also upsert into public.doctors table
    if (form.role === 'doctor') {
      const { error: docError } = await supabase.from('doctors').upsert({
        id: assignedId,
        user_id: assignedId,
        full_name: form.fullName.trim(),
        specialization: form.specialization || 'General Medicine',
        consultation_room: form.consultationRoom || 'Room 1',
        consultation_fee: Number(form.consultationFee) || 500,
        opd_timings: form.opdTimings || null,
        is_available: true,
        updated_at: new Date().toISOString(),
      });
      if (docError) {
        console.warn('Doctor table sync warning:', docError);
      }
    }

    const newAccount = {
      id: assignedId,
      email: cleanEmail,
      password: form.password,
      full_name: form.fullName.trim(),
      role: form.role,
      phone: form.phone.trim() || undefined,
      is_active: true,
      created_at: new Date().toISOString(),
      ...(form.role === 'doctor'
        ? {
            specialization: form.specialization,
            consultation_room: form.consultationRoom,
            consultation_fee: Number(form.consultationFee) || 500,
            opd_timings: form.opdTimings,
          }
        : {}),
    };

    // Save into HMSStore cache and trigger global sync
    HMSStore.saveUser(newAccount);
    await syncFromSupabase().catch(() => {});
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.doctors.all });

    setLoading(false);
    setRegisteredAccount(newAccount);
  }

  if (registeredAccount) {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-[var(--bg-card)] rounded-[var(--r-card)] p-8 text-center shadow-[var(--shadow-float)] border border-[var(--line-soft)]">
          <div className="h-16 w-16 rounded-full bg-[var(--success-bg)] text-[var(--success)] flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-[var(--text-strong)] mb-1">Registration Complete!</h2>
          <p className="text-sm text-[var(--text-muted)] mb-5">
            <strong>{registeredAccount.full_name}</strong> is now registered as{' '}
            <strong className="capitalize">{registeredAccount.role}</strong>.
          </p>

          {registeredAccount.role === 'doctor' && (
            <div className="bg-[var(--bg-tile)] rounded-[var(--r-tile)] p-4 text-left text-xs mb-6 space-y-1.5 border border-[var(--line-soft)]">
              <p className="text-[var(--text-muted)]">
                Specialization: <strong className="text-[var(--text-strong)]">{registeredAccount.specialization}</strong>
              </p>
              <p className="text-[var(--text-muted)]">
                Cabin / Room: <strong className="text-[var(--text-strong)]">{registeredAccount.consultation_room}</strong>
              </p>
              <p className="text-[var(--text-muted)]">
                OPD Hours: <strong className="text-[var(--text-strong)]">{registeredAccount.opd_timings}</strong>
              </p>
              <p className="text-[var(--text-muted)]">
                Consultation Fee: <strong className="text-[var(--text-strong)]">₹{registeredAccount.consultation_fee}</strong>
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => {
                switchUser(registeredAccount);
                router.push(ROLE_HOME[registeredAccount.role as UserRole]);
              }}
              className="h-11 w-full rounded-[var(--r-control)] bg-[var(--green-900)] text-white text-sm font-medium hover:brightness-95 transition-all shadow-xs"
            >
              Enter {registeredAccount.role === 'doctor' ? 'Doctor Desk' : 'Dashboard'}
            </button>
            <button
              onClick={() => router.push('/login')}
              className="h-11 w-full rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] text-[var(--text-body)] text-sm hover:bg-[var(--bg-tile)] transition-all"
            >
              Go to Login Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/login"
            className="h-10 w-10 flex items-center justify-center rounded-[var(--r-control)] bg-[var(--bg-card)] border border-[var(--line-soft)] text-[var(--text-strong)] hover:bg-[var(--bg-tile)] transition-colors shadow-xs"
            title="Back to login"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="h-10 px-2 rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] flex items-center justify-center shadow-xs shrink-0">
            <img src="/logo.png" alt="Radha Krishna HMS" className="h-7 w-auto object-contain" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-strong)]">Register Staff / Doctor</h1>
            <p className="text-xs text-[var(--text-muted)]">
              Create an official login for Radha Krishna HMS · Powered by <a href="https://opti-x.in" target="_blank" rel="noopener noreferrer" className="text-[var(--green-700)] hover:underline font-semibold">opti-x.in</a>
            </p>
          </div>
        </div>

        <div className="bg-[var(--bg-card)] rounded-[var(--r-card)] p-6 sm:p-8 shadow-[var(--shadow-float)] border border-[var(--line-soft)]">
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
            {errors.form && (
              <div className="bg-[var(--danger-bg)] border border-[var(--danger)] text-xs text-[#C03028] rounded-[var(--r-tile)] px-3.5 py-2.5 font-medium leading-relaxed">
                {errors.form}
              </div>
            )}

            {/* Role Picker */}
            <div>
              <label className="text-xs font-semibold text-[var(--text-strong)] mb-2 block">
                Select Your Hospital Role *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => update('role', r.value as UserRole)}
                    className={`text-left p-3 rounded-[var(--r-tile)] border transition-all ${
                      form.role === r.value
                        ? 'border-[var(--green-600)] bg-[var(--sage-100)] ring-1 ring-[var(--green-600)]'
                        : 'border-[var(--line-soft)] bg-white hover:bg-[var(--bg-tile)]'
                    }`}
                  >
                    <p className="text-sm font-semibold text-[var(--text-strong)]">{r.label}</p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-snug">{r.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Doctor Differentiation Section */}
            {form.role === 'doctor' && (
              <div className="bg-[var(--bg-tile)] rounded-[var(--r-tile)] p-4 sm:p-5 border border-[var(--line-soft)]">
                <div className="flex items-center gap-2 mb-2 text-[var(--green-800)]">
                  <Stethoscope size={18} />
                  <h3 className="text-sm font-semibold text-[var(--text-strong)]">
                    Doctor Clinical Profile
                  </h3>
                </div>
                <p className="text-xs text-[var(--text-muted)] mb-4">
                  This information configures your consultation cabin, token allocation, and prescription headers.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-xs font-medium text-[var(--text-strong)] block mb-1">
                      Doctor Specialization *
                    </label>
                    <select
                      value={form.specialization}
                      onChange={(e) => update('specialization', e.target.value)}
                      className="h-10 w-full rounded-[var(--r-control)] bg-white px-3 text-xs text-[var(--text-body)] border border-[var(--line-soft)] focus:outline-none focus:border-[var(--green-600)]"
                    >
                      {SPECIALIZATIONS.map((spec) => (
                        <option key={spec} value={spec}>
                          {spec}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-[var(--text-strong)] block mb-1">
                      Consultation Room / Cabin *
                    </label>
                    <input
                      type="text"
                      value={form.consultationRoom}
                      onChange={(e) => update('consultationRoom', e.target.value)}
                      placeholder="e.g. OPD Room 102"
                      className="h-10 w-full rounded-[var(--r-control)] bg-white px-3 text-xs text-[var(--text-body)] border border-[var(--line-soft)] focus:outline-none focus:border-[var(--green-600)]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-[var(--text-strong)] block mb-1">
                      Consultation Fee (₹)
                    </label>
                    <input
                      type="number"
                      value={form.consultationFee}
                      onChange={(e) => update('consultationFee', e.target.value)}
                      placeholder="500"
                      className="h-10 w-full rounded-[var(--r-control)] bg-white px-3 text-xs text-[var(--text-body)] border border-[var(--line-soft)] focus:outline-none focus:border-[var(--green-600)]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-[var(--text-strong)] block mb-1">
                      OPD Timings
                    </label>
                    <input
                      type="text"
                      value={form.opdTimings}
                      onChange={(e) => update('opdTimings', e.target.value)}
                      placeholder="e.g. 09:00 AM - 01:00 PM"
                      className="h-10 w-full rounded-[var(--r-control)] bg-white px-3 text-xs text-[var(--text-body)] border border-[var(--line-soft)] focus:outline-none focus:border-[var(--green-600)]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* General Staff Information */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-[var(--text-strong)] block mb-1">Full Name *</label>
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(e) => update('fullName', e.target.value)}
                  placeholder={form.role === 'doctor' ? 'e.g. Dr. Ramesh Gupta' : 'e.g. Anjali Sharma'}
                  className="h-11 w-full rounded-[var(--r-control)] bg-white px-3 text-sm text-[var(--text-body)] border border-[var(--line-soft)] focus:outline-none focus:border-[var(--green-600)]"
                />
                {errors.fullName && <p className="text-xs text-[var(--danger)] mt-1 font-medium">{errors.fullName}</p>}
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--text-strong)] block mb-1">Mobile Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                  placeholder="10-digit mobile number"
                  className="h-11 w-full rounded-[var(--r-control)] bg-white px-3 text-sm text-[var(--text-body)] border border-[var(--line-soft)] focus:outline-none focus:border-[var(--green-600)]"
                />
              </div>
            </div>

            {/* Login Email */}
            <div>
              <label className="text-xs font-medium text-[var(--text-strong)] block mb-1">Hospital Email Address *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="e.g. name@hospital.com"
                className="h-11 w-full rounded-[var(--r-control)] bg-white px-3 text-sm text-[var(--text-body)] border border-[var(--line-soft)] focus:outline-none focus:border-[var(--green-600)]"
              />
              {errors.email && <p className="text-xs text-[var(--danger)] mt-1 font-medium">{errors.email}</p>}
            </div>

            {/* Password and Confirm Password */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-[var(--text-strong)] block mb-1">Password *</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => update('password', e.target.value)}
                    placeholder="Min. 4 characters"
                    className="h-11 w-full rounded-[var(--r-control)] bg-white px-3 pr-10 text-sm text-[var(--text-body)] border border-[var(--line-soft)] focus:outline-none focus:border-[var(--green-600)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)] hover:text-[var(--text-muted)]"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-[var(--danger)] mt-1 font-medium">{errors.password}</p>}
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--text-strong)] block mb-1">Confirm Password *</label>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.confirmPassword}
                  onChange={(e) => update('confirmPassword', e.target.value)}
                  placeholder="Re-enter password"
                  className="h-11 w-full rounded-[var(--r-control)] bg-white px-3 text-sm text-[var(--text-body)] border border-[var(--line-soft)] focus:outline-none focus:border-[var(--green-600)]"
                />
                {errors.confirmPassword && (
                  <p className="text-xs text-[var(--danger)] mt-1 font-medium">{errors.confirmPassword}</p>
                )}
              </div>
            </div>

            {/* Terms and Privacy Checkbox */}
            <div className="pt-2">
              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="terms"
                  checked={agreedToTerms}
                  onChange={(e) => {
                    setAgreedToTerms(e.target.checked);
                    if (errors.terms) {
                      setErrors((err) => {
                        const next = { ...err };
                        delete next.terms;
                        return next;
                      });
                    }
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-[var(--line-soft)] text-[var(--green-700)] focus:ring-[var(--green-600)] cursor-pointer"
                />
                <label htmlFor="terms" className="text-xs text-[var(--text-body)] leading-relaxed cursor-pointer">
                  I agree to the{' '}
                  <Link href="/terms-and-conditions" target="_blank" className="font-semibold text-[var(--green-800)] hover:underline">
                    Terms and Conditions
                  </Link>{' '}
                  and have read the{' '}
                  <Link href="/privacy-policy" target="_blank" className="font-semibold text-[var(--green-800)] hover:underline">
                    Privacy Policy
                  </Link>
                  .
                </label>
              </div>
              {errors.terms && <p className="text-xs text-[var(--danger)] mt-1 font-medium">{errors.terms}</p>}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="h-11 w-full rounded-[var(--r-control)] bg-[var(--green-900)] text-white text-sm font-medium hover:brightness-95 transition-all flex items-center justify-center gap-2 mt-2 shadow-xs"
            >
              {loading && <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />}
              Complete Registration & Create Account
            </button>
          </form>

          {/* Login Link */}
          <div className="border-t border-[var(--line-soft)] mt-6 pt-4 text-center text-xs text-[var(--text-muted)]">
            Already have an authorized account?{' '}
            <Link href="/login" className="font-semibold text-[var(--green-700)] hover:underline">
              Sign In to Your Portal
            </Link>
          </div>
        </div>

        {/* Footer links */}
        <div className="flex items-center justify-center gap-4 mt-6 text-xs text-[var(--text-muted)]">
          <Link href="/privacy-policy" className="hover:text-[var(--text-strong)] hover:underline flex items-center gap-1">
            <FileText size={12} />
            Privacy Policy
          </Link>
          <span>·</span>
          <Link href="/terms-and-conditions" className="hover:text-[var(--text-strong)] hover:underline flex items-center gap-1">
            <ShieldCheck size={12} />
            Terms & Conditions
          </Link>
        </div>
      </div>
    </div>
  );
}
