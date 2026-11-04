'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, Eye, EyeOff, ShieldCheck, UserPlus, FileText, PhoneCall, Mail } from 'lucide-react';
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

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="h-20 w-auto mb-3 flex items-center justify-center p-2 rounded-[var(--r-card)] bg-white border border-[var(--line-soft)] shadow-[var(--shadow-float)]">
            <img src="/logo.png" alt="Radha Krishna HMS by opti-x.in" className="h-16 w-auto object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-strong)] tracking-[-0.02em]">RADHA KRISHNA HMS</h1>
          <p className="text-xs font-medium text-[var(--text-muted)] mt-1 tracking-wide uppercase">
            Healthcare Management System · Staff Portal
          </p>
          <a
            href="https://opti-x.in"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-semibold text-[var(--green-700)] hover:underline mt-1 inline-flex items-center gap-1"
          >
            Crafted by opti-x.in
          </a>
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

        {/* Support Helpdesk Box */}
        <div className="bg-white rounded-[var(--r-card)] p-4 mt-5 border border-[var(--line-soft)] shadow-xs text-xs">
          <p className="font-semibold text-[var(--green-900)] flex items-center gap-1.5 mb-1.5 text-xs">
            <PhoneCall size={14} className="text-[var(--green-700)]" />
            Support & Technical Helpdesk
          </p>
          <div className="space-y-1.5 text-[11px] text-[var(--text-muted)]">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[var(--text-strong)]">Helpline:</span>
              <a href="tel:8123649448" className="font-bold text-[var(--green-800)] hover:underline">
                8123649448
              </a>
            </div>
            <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
              <span>Calling Hours:</span>
              <span className="font-medium">9:00 PM – 10:00 PM (Night)</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-[var(--line-soft)] pt-1.5 gap-1">
              <span className="font-medium text-[var(--text-strong)]">Email:</span>
              <a href="mailto:shariffmudasirshariff@gmail.com" className="font-medium text-[var(--green-800)] hover:underline break-all text-right sm:text-left">
                shariffmudasirshariff@gmail.com
              </a>
            </div>
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

        {/* Creator Attribution */}
        <div className="text-center mt-5 text-[11px] text-[var(--text-muted)]">
          Developed & Engineered by{' '}
          <a
            href="https://opti-x.in"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-[var(--green-800)] hover:underline"
          >
            opti-x.in
          </a>
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
