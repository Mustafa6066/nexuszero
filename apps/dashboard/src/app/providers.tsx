'use client';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { SessionProvider, useSession } from 'next-auth/react';
import type { Session } from 'next-auth';
import { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react';
import { api } from '@/lib/api';
import { wsClient } from '@/lib/ws-client';
import { useWsSubscriptions } from '@/lib/ws-store';
import { en, ar, RTL_LOCALES } from '@/lib/i18n';
import type { Locale, Translations } from '@/lib/i18n';

// ─── Theme ───────────────────────────────────────────────────────────────────
type Theme = 'dark' | 'light';
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'dark', toggle: () => {} });
export function useTheme() { return useContext(ThemeContext); }

// ─── Language ────────────────────────────────────────────────────────────────
const dictionaries: Record<Locale, Translations> = { en, ar };
const LangContext = createContext<{ locale: Locale; t: Translations; setLocale: (l: Locale) => void }>({
  locale: 'en', t: en, setLocale: () => {},
});
export function useLang() { return useContext(LangContext); }

function resolveBrowserLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem('nz-locale') as Locale | null;
  if (stored === 'en' || stored === 'ar') return stored;
  return 'en';
}

function LangProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    setLocaleState(resolveBrowserLocale());
  }, []);

  useEffect(() => {
    const isRtl = RTL_LOCALES.includes(locale);
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('nz-locale', l);
  }, []);

  return (
    <LangContext.Provider value={{ locale, t: dictionaries[locale], setLocale }}>
      {children}
    </LangContext.Provider>
  );
}

function resolveBrowserTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem('nz-theme') as Theme | null;
  if (stored === 'light' || stored === 'dark') return stored;
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    setTheme(resolveBrowserTheme());
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

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
  const hadToken = useRef(api.hasToken());
  useEffect(() => {
    if (status === 'loading') return;
    const token = (session as any)?.accessToken as string | undefined;
    if (token) {
      api.setToken(token);
      // Re-trigger queries only when transitioning from no-token → token.
      // Use resetQueries so errored queries (retry:false hit before token arrived)
      // are put back to pending and immediately refetched with the now-valid token.
      if (!hadToken.current) {
        hadToken.current = true;
        queryClient.resetQueries();
      }
      // Connect WebSocket with the same token
      wsClient.connect(token);
    } else {
      api.clearToken();
      wsClient.disconnect();
      hadToken.current = false;
    }
  }, [session, status, queryClient]);
  return null;
}

/** Subscribe to WS channels and invalidate TanStack Query caches on real-time events */
function WsSubscriptionSync() {
  useWsSubscriptions();
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
          // Allow one retry on auth errors — the token may still be initialising on
          // the client when the first attempt fires. ApiAuthSync will call resetQueries()
          // once the token arrives, so this extra retry mainly covers the narrow gap
          // before that effect runs.
          if (error instanceof Error && error.message === 'Not authenticated') return failureCount < 1;
          return failureCount < 1;
        },
      },
    },
  }));

  return (
    <LangProvider>
      <ThemeProvider>
        <SessionProvider session={session}>
          <QueryClientProvider client={queryClient}>
            <ApiAuthSync />
            <WsSubscriptionSync />
            {children}
          </QueryClientProvider>
        </SessionProvider>
      </ThemeProvider>
    </LangProvider>
  );
}
