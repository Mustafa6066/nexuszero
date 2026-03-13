'use client';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { SessionProvider, useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

function ApiAuthSync() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (status === 'loading') return;
    const token = (session as any)?.accessToken as string | undefined;
    if (token) {
      api.setToken(token);
      // Re-fetch all queries now that we have the auth token
      queryClient.invalidateQueries();
    } else {
      api.clearToken();
    }
  }, [session, status, queryClient]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <SessionProvider>
      <ApiAuthSync />
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </SessionProvider>
  );
}
