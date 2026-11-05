import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Radha Krishna HMS',
    short_name: 'RK HMS',
    description: 'Radha Krishna Hospital Management System (OPD, IP, Pharmacy) · Made by opti-x.in',
    start_url: '/',
    display: 'standalone',
    background_color: '#EDEDEA',
    theme_color: '#12301A',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    shortcuts: [
      {
        name: 'OPD Reception Desk',
        short_name: 'Reception',
        url: '/reception',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Doctor Queue',
        short_name: 'Doctor',
        url: '/doctor',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Pharmacy Dispense',
        short_name: 'Pharmacy',
        url: '/pharmacy',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'In-Patient Department',
        short_name: 'IP Dept',
        url: '/ip',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}

