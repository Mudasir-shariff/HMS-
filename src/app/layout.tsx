import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/layout';
import { AuthProvider } from '@/lib/auth/context';

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
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
