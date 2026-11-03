import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rawKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const url = rawUrl?.trim();
  const key = rawKey?.trim();

  if (!url || !key || url === 'your-supabase-url') {
    // Return a stub that doesn't throw during SSR/build
    // In offline mode without Supabase, AuthProvider uses local storage
    return createBrowserClient(
      'https://placeholder.supabase.co',
      'placeholder-key'
    );
  }

  return createBrowserClient(url, key);
}
