import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/layout';
import { AuthProvider } from '@/lib/auth/context';
import { QueryProvider } from '@/lib/query/provider';
import { RealtimeProvider } from '@/lib/realtime/realtime-provider';
import { PwaRegister } from '@/components/pwa-register';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-heading',
  weight: ['500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'Radha Krishna HMS - Hospital Management System',
  description: 'Radha Krishna Hospital Management System (OPD, IP, Pharmacy) · Made by opti-x.in',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'RK HMS',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#12301A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plusJakartaSans.variable}`}>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body className="antialiased min-h-dvh flex flex-col">
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
