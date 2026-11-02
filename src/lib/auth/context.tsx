'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { HMSStore, UserAccount } from '@/lib/store/hms-store';
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
  function syncLocalUser() {
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
  }

  useEffect(() => {
    const onStoreChange = () => syncLocalUser();
    window.addEventListener('hms-store-change', onStoreChange);

    if (!isSupabaseConfigured()) {
      syncLocalUser();
      return () => window.removeEventListener('hms-store-change', onStoreChange);
    }

    // Supabase mode
    const supabase = createClient();

    async function loadUser(uid: string, email: string) {
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('full_name, role, is_active, phone')
          .eq('id', uid)
          .single();

        if (!profile || !profile.is_active) {
          syncLocalUser();
          return;
        }

        let doctorId: string | undefined;
        let specialization: string | undefined;
        let consultationRoom: string | undefined;

        if (profile.role === 'doctor') {
          const { data: doc } = await supabase
            .from('doctors')
            .select('id, specialization, consultation_room')
            .eq('user_id', uid)
            .single();
          if (doc) {
            doctorId = doc.id;
            specialization = doc.specialization ?? undefined;
            consultationRoom = doc.consultation_room ?? undefined;
          }
        }

        setUser({
          id: uid,
          email,
          fullName: profile.full_name,
          role: profile.role as UserRole,
          phone: profile.phone ?? undefined,
          doctorId,
          specialization,
          consultationRoom,
        });
      } catch {
        syncLocalUser();
      }
    }

    (supabase.auth as any)
      .getSession()
      .then(({ data: { session } }: any) => {
        if (session?.user) {
          loadUser(session.user.id, session.user.email ?? '').finally(() => setLoading(false));
        } else {
          syncLocalUser();
        }
      })
      .catch(() => {
        syncLocalUser();
      });

    const { data: { subscription } } = (supabase.auth as any).onAuthStateChange((_event: any, session: any) => {
      if (session?.user) {
        loadUser(session.user.id, session.user.email ?? '');
      } else {
        syncLocalUser();
      }
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('hms-store-change', onStoreChange);
    };
  }, []);

  async function signIn(email: string, password?: string): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured()) {
      const res = HMSStore.login(email, password);
      if (res.success && res.user) {
        syncLocalUser();
        return { success: true };
      }
      return { success: false, error: res.error || 'Login failed.' };
    }

    try {
      const supabase = createClient();
      const { data, error } = await (supabase.auth as any).signInWithPassword({
        email,
        password: password || '',
      });
      if (!error && data?.session) {
        return { success: true };
      }
    } catch {
      // Continue to local fallback
    }

    // Fallback to local store
    const localRes = HMSStore.login(email, password);
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
