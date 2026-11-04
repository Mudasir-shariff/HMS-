import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/layout';
import { AuthProvider } from '@/lib/auth/context';
import { QueryProvider } from '@/lib/query/provider';
import { RealtimeProvider } from '@/lib/realtime/realtime-provider';
import { PwaRegister } from '@/components/pwa-register';

export const metadata: Metadata = {
  title: 'Radha Krishna HMS - Hospital Management System',
  description: 'Radha Krishna Hospital Management System (OPD, IP, Pharmacy) · Made by opti-x.in',
  manifest: '/manifest.json',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
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
