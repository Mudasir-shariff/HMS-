'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, ReactNode } from 'react';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 30, // 30 seconds fresh
        gcTime: 1000 * 60 * 60, // 1 hour retention in memory
        refetchOnWindowFocus: false, // Save bandwidth & prevent chokes in low network
        refetchOnReconnect: true,
        networkMode: 'offlineFirst', // Always execute immediately offline or in low network
        retry: 1, // Only 1 quick retry so failing requests don't queue up
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 3000),
      },
      mutations: {
        networkMode: 'offlineFirst',
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

