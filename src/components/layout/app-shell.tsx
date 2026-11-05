'use client';

import { clsx } from 'clsx';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ClipboardList,
  Stethoscope,
  Pill,
  BedDouble,
  BarChart3,
  Settings,
  Menu,
  X,
  Bell,
  Activity,
  Shield,
  LogOut,
  User,
  ShieldAlert,
  ArrowRight,
  PhoneCall,
  Mail,
  HelpCircle,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/lib/auth/context';
import { canAccess, ROLE_HOME } from '@/lib/auth/roles';
import { ConnectionIndicator } from './connection-indicator';
import { BrandLogo } from '@/components/ui/brand-logo';
import type { UserRole } from '@/lib/types/database';

const ICON_MAP: Record<string, React.ElementType> = {
  ClipboardList,
  Stethoscope,
  Pill,
  BedDouble,
  BarChart3,
  Settings,
  Shield,
  Activity,
};

// Role-based navigation items
const ROLE_NAV: Record<string, { name: string; href: string; iconName: string }[]> = {
  admin: [
    { name: 'Admin Panel', href: '/admin', iconName: 'Shield' },
    { name: 'Reception', href: '/reception', iconName: 'ClipboardList' },
    { name: 'Doctor Queue', href: '/doctor', iconName: 'Stethoscope' },
    { name: 'Pharmacy', href: '/pharmacy', iconName: 'Pill' },
    { name: 'In-Patient', href: '/ip', iconName: 'BedDouble' },
    { name: 'Analytics', href: '/analytics', iconName: 'BarChart3' },
    { name: 'Settings', href: '/settings', iconName: 'Settings' },
  ],
  receptionist: [
    { name: 'Reception Desk', href: '/reception', iconName: 'ClipboardList' },
    { name: 'In-Patient (IP)', href: '/ip', iconName: 'BedDouble' },
  ],
  doctor: [
    { name: 'My Patient Queue', href: '/doctor', iconName: 'Stethoscope' },
    { name: 'Prescription Pad', href: '/doctor/prescribe', iconName: 'Activity' },
  ],
  pharmacist: [
    { name: 'Pharmacy Queue', href: '/pharmacy', iconName: 'Pill' },
    { name: 'Add Drug', href: '/pharmacy/inventory/add', iconName: 'Activity' },
  ],
};

const AUTH_PATHS = ['/login', '/register', '/privacy-policy', '/terms-and-conditions'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);

  // On auth pages, render children with no chrome
  if (AUTH_PATHS.some((p) => pathname.startsWith(p))) {
    return <>{children}</>;
  }

  // Loading spinner
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-2 border-[var(--green-600)] border-t-transparent animate-spin" />
      </div>
    );
  }

  // Not logged in -> redirect to login
  if (!user) {
    if (typeof window !== 'undefined') {
      router.push('/login');
    }
    return null;
  }

  // Role permissions guard
  const hasAccess = canAccess(user.role, pathname) || pathname === '/';
  const roleLabels: Record<string, string> = {
    admin: 'Super Admin',
    receptionist: 'Receptionist',
    doctor: 'Consultant Doctor',
    pharmacist: 'Pharmacist',
  };

  const navItems = ROLE_NAV[user.role] || [];
  const pillNavItems = navItems.slice(0, 5);

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)]">
      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-40 h-16 bg-[var(--bg-card)] border-b border-[var(--line-soft)]">
        <div className="flex items-center justify-between h-full px-4 lg:px-8">
          {/* Left: Brand + Mobile Toggle */}
          <div className="flex items-center gap-3">
            {navItems.length > 1 && (
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden h-10 w-10 flex items-center justify-center rounded-[var(--r-control)] bg-white text-[var(--text-strong)]"
                aria-label="Toggle menu"
              >
                {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            )}

            <Link href={ROLE_HOME[user.role] || '/'} className="flex items-center gap-2 sm:gap-2.5">
              <div className="h-10 px-2 rounded-[var(--r-control)] bg-white border border-[var(--line-soft)] flex items-center justify-center shadow-xs shrink-0">
                <BrandLogo className="h-7 w-auto object-contain" />
              </div>
              <div>
                <span className="text-xs sm:text-sm font-bold text-[var(--text-strong)] leading-tight block">
                  Radha Krishna HMS
                </span>
                <span className="text-[9px] sm:text-[10px] text-[var(--text-muted)] font-medium leading-tight block mt-0.5">
                  {roleLabels[user.role]} · <a href="https://opti-x.in" target="_blank" rel="noopener noreferrer" className="text-[var(--green-700)] hover:underline font-semibold">opti-x.in</a>
                </span>
              </div>
            </Link>
          </div>

          {/* Center: Role-filtered Pill Navigation (Desktop) */}
          {pillNavItems.length > 1 && (
            <nav className="hidden lg:flex items-center bg-white rounded-[var(--r-pill)] p-1 shadow-[var(--shadow-float)] border border-[var(--line-soft)]">
              {pillNavItems.map((item) => {
                const Icon = ICON_MAP[item.iconName] ?? Activity;
                const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={clsx(
                      'flex items-center gap-1.5 px-3.5 py-1.5 rounded-[var(--r-pill)] text-xs font-medium transition-all duration-150',
                      isActive
                        ? 'bg-[var(--green-600)] text-white shadow-sm'
                        : 'text-[var(--text-body)] hover:bg-[var(--bg-tile)]'
                    )}
                  >
                    <Icon size={14} />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          )}

          {/* Right: Realtime status + User Profile Chip */}
          <div className="flex items-center gap-2.5">
            <ConnectionIndicator />

            {/* User Chip */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-2 h-10 px-3.5 rounded-[var(--r-pill)] bg-[var(--green-900)] text-white text-xs font-medium hover:brightness-95 transition-all shadow-sm"
              >
                <div className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center font-bold text-[10px]">
                  {user.fullName.charAt(0)}
                </div>
                <div className="text-left hidden sm:block">
                  <p className="leading-tight truncate max-w-[120px] font-medium">{user.fullName}</p>
                  <p className="text-[9px] text-white/75 leading-tight">{roleLabels[user.role]}</p>
                </div>
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-12 z-20 bg-white rounded-[var(--r-tile)] shadow-[var(--shadow-float)] border border-[var(--line-soft)] w-60 py-2">
                    <div className="px-4 py-2 border-b border-[var(--line-soft)] mb-1">
                      <p className="text-xs font-semibold text-[var(--text-strong)] truncate">{user.fullName}</p>
                      <p className="text-[11px] text-[var(--green-700)] font-medium">{roleLabels[user.role]}</p>
                      {user.specialization && (
                        <p className="text-[10px] text-[var(--text-muted)]">
                          {user.specialization} · {user.consultationRoom}
                        </p>
                      )}
                      <p className="text-[10px] text-[var(--text-faint)] truncate mt-0.5">{user.email}</p>
                    </div>

                    <Link
                      href={ROLE_HOME[user.role] || '/'}
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 w-full px-4 py-2 text-xs text-[var(--text-strong)] hover:bg-[var(--bg-tile)] transition-colors"
                    >
                      <Activity size={14} className="text-[var(--green-700)]" />
                      My Dashboard
                    </Link>

                    <Link
                      href="/privacy-policy"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 w-full px-4 py-2 text-xs text-[var(--text-strong)] hover:bg-[var(--bg-tile)] transition-colors"
                    >
                      <Shield size={14} className="text-[var(--text-muted)]" />
                      Privacy Policy
                    </Link>

                    <Link
                      href="/terms-and-conditions"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 w-full px-4 py-2 text-xs text-[var(--text-strong)] hover:bg-[var(--bg-tile)] transition-colors"
                    >
                      <ClipboardList size={14} className="text-[var(--text-muted)]" />
                      Terms & Conditions
                    </Link>

                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        setSupportModalOpen(true);
                      }}
                      className="flex items-center gap-2 w-full px-4 py-2 text-xs text-[var(--text-strong)] hover:bg-[var(--bg-tile)] transition-colors text-left"
                    >
                      <HelpCircle size={14} className="text-[var(--green-700)]" />
                      Help & Support
                    </button>

                    <div className="border-t border-[var(--line-soft)] mt-1 pt-1">
                      <button
                        onClick={signOut}
                        className="flex items-center gap-2 w-full px-4 py-2 text-xs text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-colors font-medium"
                      >
                        <LogOut size={14} />
                        Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Mobile Sidebar ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={clsx(
          'fixed top-16 left-0 z-30 h-[calc(100vh-64px)] w-64 bg-[var(--bg-card)] border-r border-[var(--line-soft)] flex flex-col',
          'transform transition-transform duration-200 ease-in-out lg:hidden',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="p-4 border-b border-[var(--line-soft)] mb-2">
          <p className="text-sm font-semibold text-[var(--text-strong)]">{user.fullName}</p>
          <p className="text-xs text-[var(--green-700)]">{roleLabels[user.role]}</p>
          {user.specialization && (
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{user.specialization}</p>
          )}
        </div>
        <nav className="p-3 flex flex-col gap-1 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = ICON_MAP[item.iconName] ?? Activity;
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-[var(--r-tile)] text-xs font-medium transition-colors',
                  isActive ? 'bg-[var(--green-600)] text-white' : 'text-[var(--text-body)] hover:bg-[var(--bg-tile)]'
                )}
              >
                <Icon size={16} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Mobile Quick Support & Actions Footer */}
        <div className="p-3 border-t border-[var(--line-soft)] bg-[var(--bg-canvas)]/60 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setSidebarOpen(false);
              setSupportModalOpen(true);
            }}
            className="flex items-center justify-between w-full px-3 py-2 rounded-[var(--r-tile)] bg-white border border-[var(--line-soft)] text-xs font-medium text-[var(--text-strong)] hover:border-[var(--green-600)] transition-colors shadow-2xs"
          >
            <span className="flex items-center gap-2">
              <HelpCircle size={14} className="text-[var(--green-700)]" />
              Help & Support
            </span>
            <span className="text-[10px] text-[var(--green-700)] font-bold">24/7 Desk</span>
          </button>

          <div className="bg-white p-2.5 rounded-[var(--r-tile)] border border-[var(--line-soft)] text-[11px] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)] flex items-center gap-1">
                <PhoneCall size={11} className="text-[var(--green-700)]" /> Helpline:
              </span>
              <a href="tel:8123649448" className="font-bold text-[var(--green-800)] hover:underline">
                8123649448
              </a>
            </div>
            <p className="text-[9px] text-[var(--text-faint)]">Calling Hours: 9:00 PM – 10:00 PM Night</p>
          </div>

          <button
            onClick={signOut}
            className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-[var(--r-tile)] text-xs text-[var(--danger)] bg-red-50 hover:bg-red-100 font-semibold transition-colors mt-1"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main Content with Role Access Guard ── */}
      <main className="px-4 lg:px-8 py-6 max-w-[1400px] mx-auto flex flex-col min-h-[calc(100vh-64px)] justify-between">
        <div>
          {!hasAccess ? (
            <div className="py-16 text-center max-w-md mx-auto">
              <div className="h-16 w-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
                <ShieldAlert size={32} />
              </div>
              <h2 className="text-xl font-semibold text-[var(--text-strong)] mb-1">Access Restricted</h2>
              <p className="text-xs text-[var(--text-muted)] mb-5 leading-relaxed">
                Your account role (<strong>{roleLabels[user.role]}</strong>) does not have permission to view this department.
                Each department is strictly isolated in the Hospital Management System.
              </p>
              <Link href={ROLE_HOME[user.role]}>
                <button className="h-10 px-5 rounded-[var(--r-control)] bg-[var(--green-900)] text-white text-xs font-medium hover:brightness-95 transition-all inline-flex items-center gap-2">
                  Return to {roleLabels[user.role]} Portal
                  <ArrowRight size={14} />
                </button>
              </Link>
            </div>
          ) : (
            children
          )}
        </div>

        {/* Global Footer Branding & Support Information */}
        <footer className="mt-16 pt-6 pb-4 border-t border-[var(--line-soft)] text-xs text-[var(--text-muted)] flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <BrandLogo className="h-5 w-auto object-contain" />
            <span className="font-semibold text-[var(--text-strong)]">Radha Krishna HMS</span>
            <span>· All Rights Reserved</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] bg-[var(--bg-card)] p-2.5 sm:px-3.5 sm:py-1.5 rounded-[var(--r-tile)] sm:rounded-[var(--r-pill)] border border-[var(--line-soft)] shadow-xs text-center">
            <span className="font-semibold text-[var(--text-strong)] flex items-center justify-center gap-1">
              <PhoneCall size={12} className="text-[var(--green-700)]" /> Support:
            </span>
            <a href="tel:8123649448" className="font-bold text-[var(--green-800)] hover:underline">
              8123649448
            </a>
            <span className="text-[10px] text-[var(--text-muted)]">(Calling: 9:00 PM – 10:00 PM Night)</span>
            <span className="hidden sm:inline">·</span>
            <a href="mailto:shariffmudasirshariff@gmail.com" className="font-medium text-[var(--green-800)] hover:underline flex items-center justify-center gap-1 break-all">
              <Mail size={12} className="shrink-0" /> shariffmudasirshariff@gmail.com
            </a>
          </div>

          <div className="flex items-center gap-1.5">
            <span>Engineered & Powered by</span>
            <a
              href="https://opti-x.in"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-[var(--green-800)] hover:underline"
            >
              opti-x.in
            </a>
          </div>
        </footer>
      </main>

      {/* ── Help & Support Modal ── */}
      {supportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-[var(--r-card)] max-w-md w-full p-6 shadow-2xl border border-[var(--line-soft)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--line-soft)]">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-full bg-[var(--green-100)] text-[var(--green-800)] flex items-center justify-center">
                  <PhoneCall size={18} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-[var(--text-strong)]">Radha Krishna HMS Support</h3>
                  <p className="text-[11px] text-[var(--text-muted)]">opti-x.in Technical Helpdesk</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSupportModalOpen(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--bg-tile)]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-[var(--r-tile)] bg-[var(--bg-tile)] border border-[var(--line-soft)] flex items-start gap-3">
                <div className="h-7 w-7 rounded-full bg-[var(--green-800)] text-white flex items-center justify-center shrink-0 mt-0.5">
                  <PhoneCall size={14} />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-[var(--text-strong)]">Direct Helpline</p>
                  <a href="tel:8123649448" className="text-base font-bold text-[var(--green-800)] hover:underline block mt-0.5">
                    8123649448
                  </a>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">
                    Calling Timings: <strong>9:00 PM – 10:00 PM (Night)</strong>
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-[var(--r-tile)] bg-[var(--bg-tile)] border border-[var(--line-soft)] flex items-start gap-3">
                <div className="h-7 w-7 rounded-full bg-[var(--green-800)] text-white flex items-center justify-center shrink-0 mt-0.5">
                  <Mail size={14} />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-[var(--text-strong)]">Email Support</p>
                  <a href="mailto:shariffmudasirshariff@gmail.com" className="text-xs font-semibold text-[var(--green-800)] hover:underline break-all block mt-0.5">
                    shariffmudasirshariff@gmail.com
                  </a>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">
                    Available 24/7 for ticket queries, bug reports & feature requests
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-[var(--r-tile)] bg-white border border-[var(--line-soft)] text-center text-[11px] text-[var(--text-muted)]">
                Engineered with precision by{' '}
                <a href="https://opti-x.in" target="_blank" rel="noopener noreferrer" className="font-bold text-[var(--green-800)] hover:underline">
                  opti-x.in
                </a>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setSupportModalOpen(false)}
                className="w-full h-9 rounded-[var(--r-control)] bg-[var(--green-900)] text-white text-xs font-medium hover:brightness-95 transition-all"
              >
                Close Support
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
