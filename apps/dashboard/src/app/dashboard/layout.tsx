'use client';

import { usePathname } from 'next/navigation';
import { FloatingNav } from '@/components/sidebar';
import { AssistantPanel } from '@/components/assistant/assistant-panel';
import { CommandPalette } from '@/components/command-palette';
import { MissionRail } from '@/components/mission-rail';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isOnboarding = pathname.startsWith('/dashboard/onboarding');

  return (
    <div className="min-h-screen bg-background relative">
      <div className="fixed inset-0 bg-dots opacity-20 pointer-events-none" />
      <div className="fixed inset-0 aurora-bg opacity-60 pointer-events-none" />

      {isOnboarding ? (
        <main className="relative mx-auto max-w-7xl px-4 pb-14 pt-10 sm:px-6 sm:pb-16 sm:pt-12 lg:px-8 lg:pt-14">
          {children}
        </main>
      ) : (
        <>
          <FloatingNav />
          <main className="relative mx-auto max-w-6xl space-y-6 px-3 pb-16 pt-32 sm:space-y-7 sm:px-5 sm:pb-20 sm:pt-36 lg:px-8 lg:pb-12 lg:pt-24">
            <MissionRail />
            {children}
          </main>
          <CommandPalette />
          <AssistantPanel />
        </>
      )}
    </div>
  );
}
