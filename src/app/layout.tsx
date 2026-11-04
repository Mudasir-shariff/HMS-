import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/layout';
import { AuthProvider } from '@/lib/auth/context';
import { QueryProvider } from '@/lib/query/provider';
import { RealtimeProvider } from '@/lib/realtime/realtime-provider';
import { PwaRegister } from '@/components/pwa-register';

export const metadata: Metadata = {
  title: 'Hospital Management System',
  description: 'OPD, In-Patient, and Pharmacy management for hospitals',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#12301A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        <QueryProvider>
          <AuthProvider>
            <RealtimeProvider>
              <AppShell>{children}</AppShell>
            </RealtimeProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
