'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, Eye, EyeOff, ShieldCheck, UserPlus, FileText, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import { HMSStore } from '@/lib/store/hms-store';
import { createClient } from '@/lib/supabase/client';
import { ROLE_HOME } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/types/database';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasExistingAccounts, setHasExistingAccounts] = useState(true);
  const [error, setError] = useState<string | null>(
    errorParam === 'account_inactive' ? 'This account has been deactivated. Please contact hospital administration.' : null
  );

  useEffect(() => {
    async function checkExistingAccounts() {
      try {
        const supabase = createClient();
        const { count } = await supabase
          .from('user_profiles')
          .select('*', { count: 'exact', head: true });
        if (count && count > 0) {
          setHasExistingAccounts(true);
          return;
        }
      } catch {}
      const existing = HMSStore.getUsers();
      setHasExistingAccounts(existing.length > 0);
    }
    checkExistingAccounts();
  }, []);

  async function handleLogin(targetEmail: string, targetPass: string) {
    setError(null);
    setLoading(true);

    const res = await signIn(targetEmail, targetPass);
    if (!res.success) {
      setError(res.error || 'Invalid credentials. Please verify your email and password.');
      setLoading(false);
      return;
    }

    // Redirect to user's assigned role dashboard
    const current = HMSStore.getCurrentUser();
    if (current?.role) {
      router.push(ROLE_HOME[current.role as UserRole] || '/');
    } else {
      router.push('/');
    }
  }

  function fillCredentials(e: string, p: string) {
    setEmail(e);
    setPassword(p);
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="h-14 w-14 rounded-[var(--r-control)] bg-[var(--green-700)] flex items-center justify-center mb-3 shadow-[var(--shadow-float)]">
            <Activity size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-strong)] tracking-[-0.02em]">RADHAKRISHNA HOSPITAL</h1>
          <p className="text-xs font-medium text-[var(--text-muted)] mt-1 tracking-wide uppercase">
            Healthcare Management System · Staff Portal
          </p>
        </div>

        {/* If no accounts registered yet, show setup guide */}
        {!hasExistingAccounts && (
          <div className="bg-[var(--sage-100)] border border-[var(--sage-200)] text-[var(--green-950)] rounded-[var(--r-card)] p-4 mb-5 text-xs">
            <p className="font-semibold flex items-center gap-1.5 mb-1 text-[var(--green-800)]">
              <ShieldCheck size={16} />
              Hospital Setup Required
            </p>
            <p className="text-[var(--text-body)] mb-2.5 leading-relaxed">
              No staff accounts exist yet. Please register your first Administrator or Doctor account to get started.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-[var(--green-800)] text-white font-medium rounded-[var(--r-control)] hover:bg-[var(--green-900)] transition-all shadow-xs"
            >
              <UserPlus size={13} />
              Register First Account
            </Link>
          </div>
        )}

        {/* Credentials Login Card */}
        <div className="bg-[var(--bg-card)] rounded-[var(--r-card)] p-6 sm:p-7 shadow-[var(--shadow-float)] border border-[var(--line-soft)]">
          <h2 className="text-base font-semibold text-[var(--text-strong)] mb-1">Sign In to Your Account</h2>
          <p className="text-xs text-[var(--text-muted)] mb-5">
            Enter your authorized hospital email address and password to access your department portal.
          </p>

          {error && (
            <div className="bg-[var(--danger-bg)] border border-[var(--danger)] text-xs text-[#C03028] rounded-[var(--r-tile)] px-3.5 py-2.5 mb-4 leading-relaxed font-medium">
              {error}
            </div>
          )}

          {/* Quick Staff Login Selector for Multi-Device Setup */}
          <div className="bg-[var(--bg-canvas)] rounded-[var(--r-control)] p-3 mb-4 border border-[var(--line-soft)] text-xs">
            <p className="font-medium text-[var(--text-strong)] mb-2 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] uppercase tracking-wider">
              <KeyRound size={12} />
              Quick Staff Logins (Multi-Device)
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => fillCredentials('doctor@hospital.local', 'doctor123')}
                className="text-left px-2.5 py-1.5 rounded-[var(--r-tile)] bg-white border border-[var(--line-soft)] hover:border-[var(--green-600)] transition-all text-xs"
              >
                <div className="font-semibold text-[var(--text-strong)] text-[11px]">Doctor Desk</div>
                <div className="text-[10px] text-[var(--text-muted)]">doctor@hospital.local</div>
              </button>
              <button
                type="button"
                onClick={() => fillCredentials('reception@hospital.local', 'reception123')}
                className="text-left px-2.5 py-1.5 rounded-[var(--r-tile)] bg-white border border-[var(--line-soft)] hover:border-[var(--green-600)] transition-all text-xs"
              >
                <div className="font-semibold text-[var(--text-strong)] text-[11px]">Reception OPD</div>
                <div className="text-[10px] text-[var(--text-muted)]">reception@hospital.local</div>
              </button>
              <button
                type="button"
                onClick={() => fillCredentials('pharmacy@hospital.local', 'pharmacy123')}
                className="text-left px-2.5 py-1.5 rounded-[var(--r-tile)] bg-white border border-[var(--line-soft)] hover:border-[var(--green-600)] transition-all text-xs"
              >
                <div className="font-semibold text-[var(--text-strong)] text-[11px]">Pharmacy Desk</div>
                <div className="text-[10px] text-[var(--text-muted)]">pharmacy@hospital.local</div>
              </button>
              <button
                type="button"
                onClick={() => fillCredentials('admin@hospital.local', 'admin123')}
                className="text-left px-2.5 py-1.5 rounded-[var(--r-tile)] bg-white border border-[var(--line-soft)] hover:border-[var(--green-600)] transition-all text-xs"
              >
                <div className="font-semibold text-[var(--text-strong)] text-[11px]">Super Admin</div>
                <div className="text-[10px] text-[var(--text-muted)]">admin@hospital.local</div>
              </button>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin(email, password);
            }}
            noValidate
            className="flex flex-col gap-4"
          >
            {/* Email */}
            <div className="flex flex-col gap-1">
              <label htmlFor="email" className="text-xs font-medium text-[var(--text-strong)]">
                Hospital Email Address *
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. doctor@hospital.com"
                required
                className="h-11 w-full rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] px-3 text-sm text-[var(--text-body)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--green-600)] focus:ring-[3px] focus:ring-[rgba(122,154,95,0.25)] transition-all"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1">
              <label htmlFor="password" className="text-xs font-medium text-[var(--text-strong)]">
                Password *
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="h-11 w-full rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] px-3 pr-10 text-sm text-[var(--text-body)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--green-600)] focus:ring-[3px] focus:ring-[rgba(122,154,95,0.25)] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)] hover:text-[var(--text-muted)]"
                  tabIndex={-1}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email}
              className="h-11 w-full rounded-[var(--r-control)] bg-[var(--green-900)] text-white text-sm font-medium transition-all hover:brightness-[0.94] active:brightness-[0.90] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2 shadow-xs"
            >
              {loading && <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />}
              Sign In to Portal
            </button>
          </form>

          {/* Registration link */}
          <div className="border-t border-[var(--line-soft)] mt-6 pt-4 text-center text-xs text-[var(--text-muted)]">
            Don&apos;t have an account yet?{' '}
            <Link href="/register" className="font-semibold text-[var(--green-700)] hover:underline">
              Register Staff / Doctor
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--bg-canvas)]" />}>
      <LoginForm />
    </Suspense>
  );
}
