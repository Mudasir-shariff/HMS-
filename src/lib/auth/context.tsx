'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { HMSStore, UserAccount } from '@/lib/store/hms-store';
import { syncFromSupabase } from '@/lib/supabase/sync';
import type { UserRole } from '@/lib/types/database';

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
  signIn: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
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

function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== 'your-supabase-url'
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Load from store or Supabase
  const syncLocalUser = useCallback(() => {
    const local = HMSStore.getCurrentUser();
    if (local && local.is_active) {
      setUser({
        id: local.id,
        email: local.email,
        fullName: local.full_name,
        role: local.role,
        phone: local.phone,
        doctorId: local.role === 'doctor' ? local.id : undefined,
        specialization: local.specialization,
        consultationRoom: local.consultation_room,
      });
    } else {
      setUser(null);
    }
    setLoading(false);
  }, []);

  const loadUser = useCallback(async (uid: string, email: string) => {
    try {
      const supabase = createClient();
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();

      if (!profile || !profile.is_active) {
        syncLocalUser();
        return;
      }

      let doctorId: string | undefined;
      let specialization: string | undefined = profile.specialization || undefined;
      let consultationRoom: string | undefined = profile.consultation_room || undefined;

      if (profile.role === 'doctor') {
        const { data: doc } = await supabase
          .from('doctors')
          .select('id, specialization, consultation_room')
          .or(`user_id.eq.${uid},id.eq.${uid}`)
          .maybeSingle();
        if (doc) {
          doctorId = doc.id;
          specialization = specialization || doc.specialization || undefined;
          consultationRoom = consultationRoom || doc.consultation_room || undefined;
        } else {
          doctorId = uid;
        }
      }

      const authUser: AuthUser = {
        id: uid,
        email: profile.email || email,
        fullName: profile.full_name,
        role: profile.role as UserRole,
        phone: profile.phone ?? undefined,
        doctorId,
        specialization,
        consultationRoom,
      };
      setUser(authUser);

      // Also persist current user into HMSStore so sync & routing find the account
      HMSStore.setCurrentUser({
        id: uid,
        email: profile.email || email,
        full_name: profile.full_name,
        role: profile.role as UserRole,
        phone: profile.phone ?? undefined,
        is_active: profile.is_active,
        specialization,
        consultation_room: consultationRoom,
        created_at: profile.created_at || new Date().toISOString(),
      });
      await syncFromSupabase();
    } catch {
      syncLocalUser();
    }
  }, [syncLocalUser]);

  useEffect(() => {
    const onStoreChange = () => syncLocalUser();
    window.addEventListener('hms-store-change', onStoreChange);

    if (!isSupabaseConfigured()) {
      syncLocalUser();
      return () => window.removeEventListener('hms-store-change', onStoreChange);
    }

    // Supabase mode
    const supabase = createClient();

    (supabase.auth as any)
      .getSession()
      .then(async ({ data: { session } }: any) => {
        if (session?.user) {
          await loadUser(session.user.id, session.user.email ?? '');
          setLoading(false);
        } else {
          syncLocalUser();
        }
      })
      .catch(() => {
        syncLocalUser();
      });

    const { data: { subscription } } = (supabase.auth as any).onAuthStateChange(async (_event: any, session: any) => {
      if (session?.user) {
        await loadUser(session.user.id, session.user.email ?? '');
      } else {
        syncLocalUser();
      }
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('hms-store-change', onStoreChange);
    };
  }, [loadUser, syncLocalUser]);

  async function signIn(email: string, password?: string): Promise<{ success: boolean; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();

    if (!isSupabaseConfigured()) {
      const res = HMSStore.login(cleanEmail, password);
      if (res.success && res.user) {
        syncLocalUser();
        return { success: true };
      }
      return { success: false, error: res.error || 'Login failed.' };
    }

    try {
      const supabase = createClient();
      // 1. Try standard Supabase Auth
      const { data, error } = await (supabase.auth as any).signInWithPassword({
        email: cleanEmail,
        password: password || '',
      });
      if (!error && data?.session) {
        await loadUser(data.session.user.id, data.session.user.email ?? cleanEmail);
        return { success: true };
      }

      // 2. Direct database profile lookup (for admin-created staff or unconfirmed emails)
      const { data: dbProfile } = await supabase
        .from('user_profiles')
        .select('*')
        .ilike('email', cleanEmail)
        .maybeSingle();

      if (dbProfile) {
        if (!dbProfile.is_active) {
          return { success: false, error: 'This account has been deactivated by the administrator.' };
        }
        if (dbProfile.password && password && dbProfile.password !== password) {
          return { success: false, error: 'Incorrect password. Please verify and try again.' };
        }
        await loadUser(dbProfile.id, dbProfile.email || cleanEmail);
        return { success: true };
      }
    } catch {
      // Continue to local fallback
    }

    // Fallback to local store
    const localRes = HMSStore.login(cleanEmail, password);
    if (localRes.success && localRes.user) {
      syncLocalUser();
      return { success: true };
    }
    return { success: false, error: 'Invalid credentials. Please verify your email and password.' };
  }

  async function signOut() {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await (supabase.auth as any).signOut();
    }
    HMSStore.setCurrentUser(null);
    setUser(null);
    window.location.href = '/login';
  }

  function switchUser(account: UserAccount) {
    HMSStore.setCurrentUser(account);
    syncLocalUser();
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
