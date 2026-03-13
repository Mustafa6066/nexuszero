'use client';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { SessionProvider, useSession } from 'next-auth/react';
import type { Session } from 'next-auth';
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
      // Force all active queries to refetch now that we have the auth token
      queryClient.refetchQueries();
    } else {
      api.clearToken();
    }
  }, [session, status, queryClient]);
  return null;
}

export function Providers({ children, session }: { children: React.ReactNode; session: Session | null }) {
  // Synchronously prime the api singleton token before child components mount and
  // fire their queries — eliminates the race condition between useEffect and useQuery.
  const initialToken = (session as any)?.accessToken as string | undefined;
  if (initialToken) {
    api.setToken(initialToken);
  }

  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }));

  return (
    <SessionProvider session={session}>
      <QueryClientProvider client={queryClient}>
        <ApiAuthSync />
        {children}
      </QueryClientProvider>
    </SessionProvider>
  );
}
