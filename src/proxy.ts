import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { canAccess, ROLE_HOME } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/types/database';

const PUBLIC_PATHS = ['/login', '/register', '/privacy-policy', '/terms-and-conditions'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Allow public authentication and information endpoints always
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 2. If Supabase credentials are provided, use Supabase SSR session
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== 'your-supabase-url'
  ) {
    const response = NextResponse.next({
      request: { headers: request.headers },
    });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      // Check cached verified role cookie first (0ms DB roundtrip)
      const cachedRole = request.cookies.get('hms_verified_role')?.value as UserRole | undefined;
      const cachedUid = request.cookies.get('hms_verified_uid')?.value;

      let role: UserRole | undefined;

      if (cachedUid === session.user.id && cachedRole) {
        role = cachedRole;
      } else {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role, is_active')
          .eq('id', session.user.id)
          .single();

        if (!profile || !profile.is_active) {
          return NextResponse.redirect(new URL('/login?error=account_inactive', request.url));
        }

        role = profile.role as UserRole;

        // Cache verified role for 5 minutes (300 seconds)
        response.cookies.set('hms_verified_role', role, {
          maxAge: 300,
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
        });
        response.cookies.set('hms_verified_uid', session.user.id, {
          maxAge: 300,
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
        });
      }

      if (pathname !== '/' && !canAccess(role, pathname)) {
        return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
      }

      return response;
    }
  }

  // 3. In Standalone / Local mode (using cookies set on login):
  const roleCookie = request.cookies.get('hms_role')?.value as UserRole | undefined;

  // If no session and no role cookie on protected path, redirect to login
  if (!roleCookie && !PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If role cookie exists, enforce role-based access control
  if (roleCookie && pathname !== '/' && !canAccess(roleCookie, pathname)) {
    return NextResponse.redirect(new URL(ROLE_HOME[roleCookie], request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icon-.*\\.png|.*\\.svg).*)',
  ],
};
