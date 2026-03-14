'use client';

import { FloatingNav } from '@/components/sidebar';
import { AssistantPanel } from '@/components/assistant/assistant-panel';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background relative">
      <div className="fixed inset-0 bg-dots opacity-20 pointer-events-none" />
      <div className="fixed inset-0 aurora-bg opacity-60 pointer-events-none" />
      <FloatingNav />
      <main className="relative mx-auto max-w-6xl px-3 pb-16 pt-32 sm:px-5 sm:pb-20 sm:pt-36 lg:px-8 lg:pb-12 lg:pt-24">
        {children}
      </main>
      <AssistantPanel />
    </div>
  );
}
