'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useTheme } from '@/app/providers';
import { signOut } from 'next-auth/react';
import { useAssistant } from '@/hooks/use-assistant';
import {
  LayoutDashboard, BarChart3, Bot, Megaphone, Palette,
  Globe, Webhook, Settings, Plug, Sun, Moon, LogOut, ScanSearch,
} from 'lucide-react';
import { NexusIconInline } from './assistant/nexus-icon';
import { NotificationTray } from './notification-tray';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
  { href: '/dashboard/campaigns', icon: Megaphone, label: 'Campaigns' },
  { href: '/dashboard/agents', icon: Bot, label: 'Agents' },
  { href: '/dashboard/analytics', icon: BarChart3, label: 'Analytics' },
  { href: '/dashboard/creatives', icon: Palette, label: 'Creatives' },
  { href: '/dashboard/scanner', icon: ScanSearch, label: 'Scanner' },
  { href: '/dashboard/aeo', icon: Globe, label: 'AEO' },
  { href: '/dashboard/integrations', icon: Plug, label: 'Integrations' },
  { href: '/dashboard/webhooks', icon: Webhook, label: 'Webhooks' },
  { href: '/dashboard/settings', icon: Settings, label: 'Settings' },
];

const primaryNav = navItems.slice(0, 6);
const secondaryNav = navItems.slice(6);

export function Sidebar() {
  // Legacy export kept to avoid breaking imports — renders nothing.
  return null;
}

export function FloatingNav() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { isOpen, toggle: toggleAssistant } = useAssistant();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <header className="fixed inset-x-3 top-3 z-50 lg:hidden">
        <div className="glass-nav rounded-[1.35rem] px-3 py-3 shadow-xl shadow-black/20">
          <div className="flex items-center justify-between gap-2">
            <Link href="/dashboard" className="shrink-0 px-1 text-sm font-bold gradient-text whitespace-nowrap">
              NxZ
            </Link>

            <div className="flex items-center gap-1">
              <button
                onClick={toggleAssistant}
                title={isOpen ? 'Close NexusAI' : 'Open NexusAI'}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all duration-200',
                  isOpen
                    ? 'bg-primary/90 text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80',
                )}
              >
                <NexusIconInline size={13} />
                <span>NexusAI</span>
              </button>
              <NotificationTray />
              <button
                onClick={toggle}
                title="Toggle theme"
                className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
              >
                {mounted ? (theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />) : <span className="block h-[14px] w-[14px]" />}
              </button>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                title="Sign out"
                className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>

          <nav className="mt-3 flex items-center gap-1 overflow-x-auto no-scrollbar">
            {navItems.map(({ href, icon: Icon, label }) => {
              const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80',
                  )}
                >
                  <Icon size={14} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <header className="fixed top-5 left-1/2 z-50 hidden -translate-x-1/2 items-center gap-1 rounded-full px-3 py-2 glass-nav shadow-xl shadow-black/20 lg:flex">
        <Link href="/dashboard" className="shrink-0 mr-1 px-2 text-sm font-bold gradient-text whitespace-nowrap">
          NxZ
        </Link>

        <nav className="flex items-center gap-0.5">
          {primaryNav.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80',
                )}
              >
                <Icon size={14} />
                <span className="hidden xl:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mx-1 h-4 w-px bg-border" />

        <nav className="flex items-center gap-0.5">
          {secondaryNav.map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className={cn(
                  'rounded-full p-1.5 text-xs transition-all',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80',
                )}
              >
                <Icon size={14} />
              </Link>
            );
          })}
        </nav>

        <div className="ml-1 flex items-center gap-0.5 border-l border-border pl-2">
          <button
            onClick={toggleAssistant}
            title={isOpen ? 'Close NexusAI' : 'Open NexusAI'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all duration-200',
              isOpen
                ? 'bg-primary/90 text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80',
            )}
          >
            <NexusIconInline size={13} />
            <span className="hidden xl:inline">NexusAI</span>
          </button>
          <NotificationTray />
          <button
            onClick={toggle}
            title="Toggle theme"
            className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
          >
            {mounted ? (theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />) : <span className="block h-[14px] w-[14px]" />}
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
    </>
  );
}
