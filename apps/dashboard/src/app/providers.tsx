'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider, useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

function ApiAuthSync() {
  const { data: session } = useSession();
  useEffect(() => {
    const token = (session as any)?.accessToken as string | undefined;
    if (token) {
      api.setToken(token);
    } else {
      api.clearToken();
    }
  }, [session]);
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
