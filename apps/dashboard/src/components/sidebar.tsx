'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, BarChart3, Bot, Megaphone, Palette,
  Globe, Webhook, Settings, ChevronLeft, ChevronRight, Plug,
} from 'lucide-react';
import { useDashboardStore } from '@/lib/store';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
  { href: '/dashboard/campaigns', icon: Megaphone, label: 'Campaigns' },
  { href: '/dashboard/agents', icon: Bot, label: 'AI Agents' },
  { href: '/dashboard/analytics', icon: BarChart3, label: 'Analytics' },
  { href: '/dashboard/creatives', icon: Palette, label: 'Creatives' },
  { href: '/dashboard/aeo', icon: Globe, label: 'AEO' },
  { href: '/dashboard/integrations', icon: Plug, label: 'Integrations' },
  { href: '/dashboard/webhooks', icon: Webhook, label: 'Webhooks' },
  { href: '/dashboard/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar } = useDashboardStore();

  return (
    <aside className={cn(
      'fixed left-0 top-0 z-40 h-screen border-r border-border bg-card transition-all duration-300',
      sidebarOpen ? 'w-64' : 'w-16',
    )}>
      <div className="flex h-16 items-center justify-between border-b border-border px-4">
        {sidebarOpen && (
          <Link href="/dashboard" className="text-lg font-bold text-primary">
            NexusZero
          </Link>
        )}
        <button onClick={toggleSidebar} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary">
          {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      <nav className="mt-4 space-y-1 px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              <item.icon size={20} />
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
