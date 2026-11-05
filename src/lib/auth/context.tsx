'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { UserRole, UserAccount } from '@/lib/types/database';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone?: string;
  doctorId?: string;
  specialization?: string;
  consultationRoom?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password?: string) => Promise<{ success: boolean; role?: UserRole; error?: string }>;
  signOut: () => Promise<void>;
  switchUser: (account: UserAccount) => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signIn: async () => ({ success: false }),
  signOut: async () => {},
  switchUser: () => {},
});

function isValidUUID(id?: string | null): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== 'your-supabase-url'
  );
}

// ── Cookie Session Persistence (Survives browser reloads and navigation) ──

function setSessionCookie(u: { id: string; email: string; role: string; fullName: string }) {
  if (typeof document === 'undefined') return;
  const val = encodeURIComponent(JSON.stringify(u));
  document.cookie = `hms_session_user=${val}; path=/; max-age=2592000; SameSite=Lax`;
  document.cookie = `hms_role=${u.role}; path=/; max-age=2592000; SameSite=Lax`;
}

function getSessionCookie(): { id: string; email: string; role: string; fullName: string } | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )hms_session_user=([^;]*)/);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

function clearSessionCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = 'hms_session_user=; path=/; max-age=0; SameSite=Lax';
  document.cookie = 'hms_role=; path=/; max-age=0; SameSite=Lax';
  document.cookie = 'hms_verified_role=; path=/; max-age=0; SameSite=Lax';
  document.cookie = 'hms_verified_uid=; path=/; max-age=0; SameSite=Lax';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const loadUser = useCallback(async (uid?: string, email?: string) => {
    try {
      const supabase = createClient();
      let query = supabase.from('user_profiles').select('*');
      if (uid) {
        query = query.eq('id', uid);
      } else if (email) {
        query = query.ilike('email', email);
      }
      const { data: profile } = await query.maybeSingle();

      if (!profile || !profile.is_active) {
        clearSessionCookie();
        setUser(null);
        setLoading(false);
        return null;
      }

      let doctorId: string | undefined;
      let specialization: string | undefined = profile.specialization || undefined;
      let consultationRoom: string | undefined = profile.consultation_room || undefined;

      if (profile.role === 'doctor' && isValidUUID(profile.id)) {
        const { data: doc } = await supabase
          .from('doctors')
          .select('id, specialization, consultation_room')
          .or(`user_id.eq.${profile.id},id.eq.${profile.id}`)
          .maybeSingle();
        if (doc) {
          doctorId = doc.id;
          specialization = specialization || doc.specialization || undefined;
          consultationRoom = consultationRoom || doc.consultation_room || undefined;
        } else {
          doctorId = profile.id;
        }
      }

      const authUser: AuthUser = {
        id: profile.id,
        email: profile.email || email || '',
        fullName: profile.full_name,
        role: profile.role as UserRole,
        phone: profile.phone ?? undefined,
        doctorId,
        specialization,
        consultationRoom,
      };

      setUser(authUser);
      setSessionCookie({
        id: profile.id,
        email: profile.email || email || '',
        role: profile.role,
        fullName: profile.full_name,
      });
      setLoading(false);
      return profile;
    } catch {
      clearSessionCookie();
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 0. Immediate optimistic session recovery from cookie on client mount (<1ms)
    const initialCookie = getSessionCookie();
    if (initialCookie?.id) {
      setUser({
        id: initialCookie.id,
        email: initialCookie.email,
        fullName: initialCookie.fullName,
        role: initialCookie.role as UserRole,
      });
      setLoading(false);
    }

    if (!isSupabaseConfigured()) {
      if (!initialCookie?.id) {
        setUser(null);
        setLoading(false);
      }
      return;
    }

    const supabase = createClient();

    // 1. Check Supabase Auth Session
    (supabase.auth as any)
      .getSession()
      .then(async ({ data: { session } }: any) => {
        if (session?.user) {
          await loadUser(session.user.id, session.user.email ?? '');
        } else {
          // 2. Check Cookie Session
          const cookieUser = getSessionCookie();
          if (cookieUser?.id || cookieUser?.email) {
            await loadUser(cookieUser.id, cookieUser.email);
          } else {
            setUser(null);
            setLoading(false);
          }
        }
      })
      .catch(() => {
        const cookieUser = getSessionCookie();
        if (cookieUser?.id || cookieUser?.email) {
          loadUser(cookieUser.id, cookieUser.email);
        } else {
          setUser(null);
          setLoading(false);
        }
      });

    const { data: { subscription } } = (supabase.auth as any).onAuthStateChange(async (_event: any, session: any) => {
      if (session?.user) {
        await loadUser(session.user.id, session.user.email ?? '');
      } else {
        const cookieUser = getSessionCookie();
        if (!cookieUser) {
          setUser(null);
        }
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [loadUser]);

  async function signIn(email: string, password?: string): Promise<{ success: boolean; role?: UserRole; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();

    try {
      const supabase = createClient();

      // 1. Direct database profile verification (for hospital staff logins)
      const { data: dbProfile, error: pErr } = await supabase
        .from('user_profiles')
        .select('*')
        .ilike('email', cleanEmail)
        .maybeSingle();

      if (dbProfile && !pErr) {
        if (!dbProfile.is_active) {
          return { success: false, error: 'This account has been deactivated by the administrator.' };
        }
        if (dbProfile.password && password && dbProfile.password !== password) {
          return { success: false, error: 'Incorrect password. Please verify and try again.' };
        }
        if (dbProfile.password && password && dbProfile.password === password) {
          (supabase.auth as any).signInWithPassword({ email: cleanEmail, password }).catch(() => {});
          await loadUser(dbProfile.id, dbProfile.email || cleanEmail);
          return { success: true, role: dbProfile.role as UserRole };
        }
      }

      // 2. Standard Supabase Auth session fallback
      const { data, error } = await (supabase.auth as any).signInWithPassword({
        email: cleanEmail,
        password: password || '',
      });
      if (!error && data?.session?.user) {
        const profile = await loadUser(data.session.user.id, data.session.user.email ?? cleanEmail);
        return { success: true, role: profile?.role as UserRole };
      }
    } catch (err: any) {
      console.error('Sign in error:', err);
      return { success: false, error: err?.message || 'Login failed. Please check network connection.' };
    }

    return { success: false, error: 'Invalid credentials. Please verify your email and password.' };
  }

  async function signOut() {
    clearSessionCookie();
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await (supabase.auth as any).signOut().catch(() => {});
    }
    setUser(null);
    window.location.href = '/login';
  }

  function switchUser(account: UserAccount) {
    setSessionCookie({
      id: account.id,
      email: account.email,
      role: account.role,
      fullName: account.full_name,
    });
    setUser({
      id: account.id,
      email: account.email,
      fullName: account.full_name,
      role: account.role,
      phone: account.phone,
      doctorId: account.role === 'doctor' ? account.id : undefined,
      specialization: account.specialization,
      consultationRoom: account.consultation_room,
    });
    setLoading(false);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, switchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
