'use client';

import { Bell, Search, User } from 'lucide-react';
import { useAuthStore, useDashboardStore } from '@/lib/store';

export function Header() {
  const { user } = useAuthStore();
  const { sidebarOpen } = useDashboardStore();

  return (
    <header className={`fixed top-0 right-0 z-30 h-16 border-b border-border bg-card/80 backdrop-blur-sm transition-all duration-300 ${sidebarOpen ? 'left-64' : 'left-16'}`}>
      <div className="flex h-full items-center justify-between px-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            type="text"
            placeholder="Search campaigns, agents, analytics..."
            className="w-full rounded-lg border border-border bg-secondary/50 py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="flex items-center gap-4">
          <button className="relative rounded-lg p-2 text-muted-foreground hover:bg-secondary">
            <Bell size={20} />
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" />
          </button>

          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
              <User size={16} className="text-primary" />
            </div>
            {user && (
              <div className="hidden sm:block">
                <p className="text-sm font-medium">{user.name || 'User'}</p>
                <p className="text-xs text-muted-foreground">{(user as any).role || 'Admin'}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
