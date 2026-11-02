import type { UserRole } from '@/lib/types/database';

/** Pages each role is allowed to access (prefix match) */
export const ROLE_ALLOWED_PATHS: Record<UserRole, string[]> = {
  admin:       ['/admin', '/reception', '/doctor', '/pharmacy', '/ip', '/analytics', '/settings'],
  receptionist:['/reception', '/ip'],
  doctor:      ['/doctor'],
  pharmacist:  ['/pharmacy'],
};

/** Default landing page after login per role */
export const ROLE_HOME: Record<UserRole, string> = {
  admin:       '/admin',
  receptionist:'/reception',
  doctor:      '/doctor',
  pharmacist:  '/pharmacy',
};

/** Nav items shown per role in the app shell */
export const ROLE_NAV: Record<UserRole, { name: string; href: string; icon: string }[]> = {
  admin: [
    { name: 'Admin panel', href: '/admin',     icon: 'Shield' },
    { name: 'Reception',   href: '/reception', icon: 'ClipboardList' },
    { name: 'Doctor',      href: '/doctor',    icon: 'Stethoscope' },
    { name: 'Pharmacy',    href: '/pharmacy',  icon: 'Pill' },
    { name: 'In-patient',  href: '/ip',        icon: 'BedDouble' },
    { name: 'Analytics',   href: '/analytics', icon: 'BarChart3' },
    { name: 'Settings',    href: '/settings',  icon: 'Settings' },
  ],
  receptionist: [
    { name: 'Reception', href: '/reception', icon: 'ClipboardList' },
    { name: 'In-Patient (IP)', href: '/ip', icon: 'BedDouble' },
  ],
  doctor: [
    { name: 'My queue',     href: '/doctor',           icon: 'Stethoscope' },
    { name: 'Prescribe',    href: '/doctor/prescribe', icon: 'FileText' },
  ],
  pharmacist: [
    { name: 'Pharmacy',   href: '/pharmacy',              icon: 'Pill' },
    { name: 'Add drug',   href: '/pharmacy/inventory/add', icon: 'Plus' },
  ],
};

export function canAccess(role: UserRole, pathname: string): boolean {
  // Admin can access everything
  if (role === 'admin') return true;
  return ROLE_ALLOWED_PATHS[role].some((allowed) => pathname.startsWith(allowed));
}

