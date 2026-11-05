'use client';

import React from 'react';
import { useRealtime } from '@/lib/realtime/realtime-provider';
import { clsx } from 'clsx';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

export function ConnectionIndicator({ className }: { className?: string }) {
  const { status, lastSyncedAt, reconnect } = useRealtime();

  const config = {
    connected: {
      dotColor: 'bg-emerald-500',
      pulseColor: 'bg-emerald-400',
      label: 'Live · Connected',
      bgColor: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      icon: Wifi,
    },
    reconnecting: {
      dotColor: 'bg-amber-500',
      pulseColor: 'bg-amber-400',
      label: 'Connecting...',
      bgColor: 'bg-amber-50 text-amber-800 border-amber-200',
      icon: RefreshCw,
    },
    offline: {
      dotColor: 'bg-rose-500',
      pulseColor: 'bg-rose-400',
      label: 'Disconnected',
      bgColor: 'bg-rose-50 text-rose-800 border-rose-200',
      icon: WifiOff,
    },
  }[status];

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={reconnect}
        title={
          status === 'connected'
            ? `Live connected. Last synced at ${lastSyncedAt?.toLocaleTimeString() || 'now'}. Click to refresh.`
            : status === 'reconnecting'
            ? 'Connecting to live server... Click to force refresh.'
            : 'Disconnected from server. Click to retry connection.'
        }
        className={clsx(
          'inline-flex items-center gap-1.5 px-1.5 sm:px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all duration-200 select-none shadow-xs cursor-pointer hover:opacity-90',
          config.bgColor,
          className
        )}
      >
        <span className="relative flex h-2 w-2">
          {status === 'connected' && (
            <span
              className={clsx(
                'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                config.pulseColor
              )}
            />
          )}
          <span className={clsx('relative inline-flex rounded-full h-2 w-2', config.dotColor)} />
        </span>
        <config.icon
          size={12}
          className={clsx(
            status === 'reconnecting' && 'animate-spin',
            'hidden sm:inline shrink-0'
          )}
        />
        <span className="hidden sm:inline">{config.label}</span>
      </button>
    </div>
  );
}
