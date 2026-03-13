'use client';

import { FloatingNav } from '@/components/sidebar';
import { AssistantPanel } from '@/components/assistant/assistant-panel';
import { AssistantFab } from '@/components/assistant/assistant-fab';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background relative">
      <div className="fixed inset-0 bg-grid opacity-20 pointer-events-none" />
      <FloatingNav />
      <main className="relative pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {children}
      </main>
      <AssistantPanel />
      <AssistantFab />
    </div>
  );
}
