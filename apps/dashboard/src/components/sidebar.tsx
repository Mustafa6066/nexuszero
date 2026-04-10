'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useTheme, useLang } from '@/app/providers';
import { signOut } from 'next-auth/react';
import { useAssistantVisibility } from '@/hooks/use-assistant';
import {
  LayoutDashboard, BarChart3, Bot, Megaphone, Palette,
  Globe, Webhook, Settings, Plug, Sun, Moon, LogOut, ScanSearch, ShieldCheck, Newspaper,
  MessageCircle, Rss, PenTool, MapPin, AlertTriangle, Bell, Target,
} from 'lucide-react';
import { NexusIconInline } from './assistant/nexus-icon';
import { NotificationTray } from './notification-tray';
import { LanguageToggle } from './language-toggle';

function useNavItems() {
  const { t } = useLang();
  return useMemo(() => [
    { href: '/dashboard', icon: LayoutDashboard, label: t.sidebar.overview },
    { href: '/dashboard/campaigns', icon: Megaphone, label: t.sidebar.campaigns },
    { href: '/dashboard/agents', icon: Bot, label: t.sidebar.agents },
    { href: '/dashboard/analytics', icon: BarChart3, label: t.sidebar.analytics },
    { href: '/dashboard/creatives', icon: Palette, label: t.sidebar.creatives },
    { href: '/dashboard/scanner', icon: ScanSearch, label: t.sidebar.scanner },
    { href: '/dashboard/aeo', icon: Globe, label: t.sidebar.aeo },
    { href: '/dashboard/integrations', icon: Plug, label: t.sidebar.integrations },
    { href: '/dashboard/approvals', icon: ShieldCheck, label: t.sidebar.approvals },
    { href: '/dashboard/digest', icon: Newspaper, label: t.sidebar.digest || 'Digest' },
    { href: '/dashboard/reddit', icon: MessageCircle, label: 'Reddit' },
    { href: '/dashboard/social', icon: Rss, label: 'Social' },
    { href: '/dashboard/content', icon: PenTool, label: 'Content' },
    { href: '/dashboard/geo', icon: MapPin, label: 'GEO' },
    { href: '/dashboard/webhooks', icon: Webhook, label: t.sidebar.webhooks },
    { href: '/dashboard/notifications', icon: Bell, label: 'Notifications' },
    { href: '/dashboard/strategy', icon: Target, label: 'Strategy' },
    { href: '/dashboard/dlq', icon: AlertTriangle, label: 'DLQ' },
    { href: '/dashboard/settings', icon: Settings, label: t.sidebar.settings },
  ], [t]);
}

export function Sidebar() {
  // Legacy export kept to avoid breaking imports — renders nothing.
  return null;
}

export function FloatingNav() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { t } = useLang();
  const { isOpen, toggle: toggleAssistant } = useAssistantVisibility();
  const [mounted, setMounted] = useState(false);
  const navItems = useNavItems();
  const primaryNav = navItems.slice(0, 7);
  const secondaryNav = navItems.slice(7);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <header
        className={cn(
          'fixed inset-x-3 top-3 z-50 transition-all duration-200 lg:hidden',
          isOpen && 'pointer-events-none -translate-y-3 opacity-0',
        )}
      >
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
                <span>{t.sidebar.nexusAI}</span>
              </button>
              <NotificationTray />
              <LanguageToggle className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors inline-flex items-center justify-center" />
              <button
                onClick={toggle}
                title={t.sidebar.toggleTheme}
                className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
              >
                {mounted ? (theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />) : <span className="block h-[14px] w-[14px]" />}
              </button>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                title={t.common.signOut}
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
            <span className="hidden xl:inline">{t.sidebar.nexusAI}</span>
          </button>
          <NotificationTray />
          <LanguageToggle className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors inline-flex items-center justify-center" />
          <button
            onClick={toggle}
            title={t.sidebar.toggleTheme}
            className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
          >
            {mounted ? (theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />) : <span className="block h-[14px] w-[14px]" />}
          </button>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            title={t.common.signOut}
            className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>
    </>
  );
}
