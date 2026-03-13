'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useTheme } from '@/app/providers';
import { signOut, useSession } from 'next-auth/react';
import {
  LayoutDashboard, BarChart3, Bot, Megaphone, Palette,
  Globe, Webhook, Settings, Plug, Sun, Moon, LogOut,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
  { href: '/dashboard/campaigns', icon: Megaphone, label: 'Campaigns' },
  { href: '/dashboard/agents', icon: Bot, label: 'Agents' },
  { href: '/dashboard/analytics', icon: BarChart3, label: 'Analytics' },
  { href: '/dashboard/creatives', icon: Palette, label: 'Creatives' },
  { href: '/dashboard/aeo', icon: Globe, label: 'AEO' },
  { href: '/dashboard/integrations', icon: Plug, label: 'Integrations' },
  { href: '/dashboard/webhooks', icon: Webhook, label: 'Webhooks' },
  { href: '/dashboard/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  // Legacy export kept to avoid breaking imports — renders nothing.
  return null;
}

export function FloatingNav() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { data: session } = useSession();

  return (
    <header className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-3 py-2 glass-nav rounded-full shadow-xl shadow-black/20 max-w-[calc(100vw-2rem)]">
      {/* Brand */}
      <Link href="/dashboard" className="shrink-0 mr-2 px-2 text-sm font-bold gradient-text whitespace-nowrap">
        NxZ
      </Link>

      {/* Nav links */}
      <nav className="flex items-center gap-0.5">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80',
              )}
            >
              <Icon size={14} />
              <span className="hidden lg:inline">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Right actions */}
      <div className="flex items-center gap-1 ml-2 pl-2 border-l border-border">
        <button
          onClick={toggle}
          title="Toggle theme"
          className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          title="Sign out"
          className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
        >
          <LogOut size={14} />
        </button>
      </div>
    </header>
  );
}
