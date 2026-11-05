'use client';

import React from 'react';
import { useRealtime } from '@/lib/realtime/realtime-provider';
import { useOfflineQueue } from '@/lib/offline/use-offline-queue';
import { clsx } from 'clsx';
import { Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';

export function ConnectionIndicator({ className }: { className?: string }) {
  const { status, lastSyncedAt, reconnect } = useRealtime();
  const { pendingCount, isOnline, lastError, triggerSync } = useOfflineQueue();

  // If there are pending offline mutations to sync
  if (pendingCount > 0) {
    if (!isOnline) {
      return (
        <div
          title={`${pendingCount} change(s) stored locally on this device. Will sync automatically when connection restores.`}
          className={clsx(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-amber-50 text-amber-900 border-amber-300 shadow-xs animate-pulse',
            className
          )}
        >
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          <WifiOff size={12} className="text-amber-700" />
          <span>Offline · {pendingCount} change{pendingCount > 1 ? 's' : ''} pending</span>
        </div>
      );
    }

    return (
      <button
        onClick={triggerSync}
        title="Syncing pending offline changes to server. Click to force push now."
        className={clsx(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-sky-50 text-sky-900 border-sky-300 shadow-xs cursor-pointer hover:bg-sky-100 transition-colors',
          className
        )}
      >
        <RefreshCw size={12} className="text-sky-600 animate-spin" />
        <span>Syncing {pendingCount} change{pendingCount > 1 ? 's' : ''}...</span>
      </button>
    );
  }

  const config = {
    connected: {
      dotColor: 'bg-emerald-500',
      pulseColor: 'bg-emerald-400',
      label: 'Live · All saved',
      bgColor: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      icon: Wifi,
    },
    reconnecting: {
      dotColor: 'bg-amber-500',
      pulseColor: 'bg-amber-400',
      label: 'Reconnecting...',
      bgColor: 'bg-amber-50 text-amber-800 border-amber-200',
      icon: RefreshCw,
    },
    offline: {
      dotColor: 'bg-rose-500',
      pulseColor: 'bg-rose-400',
      label: 'Offline',
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
            ? `Realtime connected. Last synced at ${lastSyncedAt?.toLocaleTimeString() || 'now'}. Click to refresh.`
            : status === 'reconnecting'
            ? 'Reconnecting to live server... Click to force refresh.'
            : 'Network offline. Using cached data. Click to retry connection.'
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

      {lastError && (
        <span
          title={lastError}
          className="inline-flex items-center gap-1 text-[11px] text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 max-w-[200px] truncate"
        >
          <AlertCircle size={11} className="shrink-0" />
          <span className="truncate">{lastError}</span>
        </span>
      )}
    </div>
  );
}
