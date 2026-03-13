'use client';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { SessionProvider, useSession } from 'next-auth/react';
import type { Session } from 'next-auth';
import { useState, useEffect, createContext, useContext } from 'react';
import { api } from '@/lib/api';

// ─── Theme ───────────────────────────────────────────────────────────────────
type Theme = 'dark' | 'light';
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'dark', toggle: () => {} });
export function useTheme() { return useContext(ThemeContext); }

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const stored = localStorage.getItem('nz-theme') as Theme | null;
    const initial = stored ?? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    setTheme(initial);
    document.documentElement.classList.toggle('light', initial === 'light');
  }, []);

  const toggle = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('nz-theme', next);
      document.documentElement.classList.toggle('light', next === 'light');
      return next;
    });
  };

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

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
        retry(failureCount, error) {
          // Don't retry auth errors — the token is simply missing or expired
          if (error instanceof Error && error.message === 'Not authenticated') return false;
          return failureCount < 1;
        },
      },
    },
  }));

  return (
    <ThemeProvider>
      <SessionProvider session={session}>
        <QueryClientProvider client={queryClient}>
          <ApiAuthSync />
          {children}
        </QueryClientProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
