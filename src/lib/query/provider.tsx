'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, ReactNode } from 'react';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 2, // 2 seconds fresh (ready to update within seconds)
        gcTime: 1000 * 60 * 60, // 1 hour retention in memory
        refetchOnWindowFocus: true, // Instantly refetch when user switches tabs or focuses window
        refetchOnReconnect: true,
        networkMode: 'always', // Always query immediately
        retry: 1, // Only 1 quick retry
        retryDelay: 1000,
      },
      mutations: {
        networkMode: 'always',
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

