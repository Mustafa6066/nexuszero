import { create } from 'zustand';
import { useSession } from 'next-auth/react';

/**
 * Auth state derived from NextAuth session.
 * Use this instead of managing tokens in localStorage —
 * NextAuth handles the session cookie and refresh automatically.
 */
export function useAuthStore() {
  const { data: session, status } = useSession();
  return {
    user: session?.user ?? null,
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'loading',
  };
}

interface DashboardState {
  sidebarOpen: boolean;
  activePage: string;
  toggleSidebar: () => void;
  setActivePage: (page: string) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  sidebarOpen: true,
  activePage: 'overview',
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setActivePage: (page) => set({ activePage: page }),
}));
