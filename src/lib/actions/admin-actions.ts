'use server';

import { z } from 'zod';
import { createClient as createServerClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/security/rate-limit';

const CreateStaffSchema = z.object({
  email: z.string().email('Valid email address is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Full name is required'),
  role: z.enum(['admin', 'doctor', 'receptionist']),
  phone: z
    .string()
    .refine((val) => !val || /^[6-9]\d{9}$/.test(val.replace(/\D/g, '')), {
      message: 'Phone must be a valid 10-digit Indian mobile number starting with 6-9',
    })
    .optional(),
  specialization: z.string().optional(),
  consultationRoom: z.string().optional(),
  consultationFee: z.number().nonnegative().optional(),
  opdTimings: z.string().optional(),
});

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error('Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY is missing');
  }

  return createServerClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export interface ServerActionResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Server action to securely provision a new staff user via Supabase Auth Admin.
 * Validates role and input via Zod, keeping the service role key strictly server-side.
 */
export async function createStaffAccountAction(
  rawInput: unknown
): Promise<ServerActionResult<{ id: string }>> {
  // 1. Rate limiting check (max 5 creations per minute)
  const rate = checkRateLimit('admin:create_staff', { windowMs: 60000, maxRequests: 5 });
  if (!rate.allowed) {
    return {
      success: false,
      error: `Too many requests. Please wait ${Math.ceil(rate.resetMs / 1000)} seconds.`,
    };
  }

  // 2. Server-side Zod validation
  const parseResult = CreateStaffSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.issues.map((e: { message: string }) => e.message).join(', '),
    };
  }

  const {
    email,
    password,
    fullName,
    role,
    phone,
    specialization,
    consultationRoom,
    consultationFee,
    opdTimings,
  } = parseResult.data;

  try {
    const supabase = getServiceSupabase();

    // Create user in Supabase Auth
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role,
        phone: phone || null,
        ...(role === 'doctor'
          ? {
              specialization: specialization || null,
              consultation_room: consultationRoom || null,
              consultation_fee: consultationFee ?? 500,
              opd_timings: opdTimings || null,
            }
          : {}),
      },
    });

    if (authErr || !authData.user) {
      return {
        success: false,
        error: authErr?.message || 'Failed to create user in Auth system',
      };
    }

    const userId = authData.user.id;

    // Upsert into public.user_profiles (role-specific fields only set for doctors)
    const { error: profileErr } = await supabase.from('user_profiles').upsert({
      id: userId,
      email: email.toLowerCase(),
      full_name: fullName,
      role,
      phone: phone || null,
      specialization: role === 'doctor' ? (specialization || null) : null,
      consultation_room: role === 'doctor' ? (consultationRoom || null) : null,
      consultation_fee: role === 'doctor' ? (consultationFee ?? 500) : 0,
      opd_timings: role === 'doctor' ? (opdTimings || null) : null,
      is_active: true,
    });

    if (profileErr) {
      return {
        success: false,
        error: profileErr.message,
      };
    }

    // If doctor, auto-create doctor record with canonical id = user_id
    if (role === 'doctor') {
      await supabase.from('doctors').upsert({
        id: userId,
        user_id: userId,
        specialization: specialization || 'General Medicine',
        consultation_room: consultationRoom || 'OPD Room 1',
        is_available: true,
      });
    }

    return {
      success: true,
      data: { id: userId },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Internal server error while creating staff account',
    };
  }
}

/**
 * Server action to toggle staff active status.
 */
export async function updateStaffStatusAction(
  userId: string,
  isActive: boolean
): Promise<ServerActionResult> {
  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase
      .from('user_profiles')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update user status' };
  }
}

/**
 * Server action to soft-delete staff member.
 */
export async function softDeleteStaffAction(userId: string): Promise<ServerActionResult> {
  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase
      .from('user_profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to soft delete user' };
  }
}

/**
 * Force password reset email.
 */
export async function forceStaffPasswordResetAction(
  email: string
): Promise<ServerActionResult> {
  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
    });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to send password reset' };
  }
}
