'use client';

import { useEffect } from 'react';
import { useWsStore } from '@/lib/ws-store';
import { AlertTriangle, X } from 'lucide-react';

/** Amber banner shown when the platform is in degraded mode (503s detected). */
export function DegradationBanner() {
  const isDegraded = useWsStore((s) => s.isDegraded);
  const setDegraded = useWsStore((s) => s.setDegraded);

  // Auto-dismiss after 60 seconds — re-triggers on next 503
  useEffect(() => {
    if (!isDegraded) return;
    const timer = setTimeout(() => setDegraded(false), 60_000);
    return () => clearTimeout(timer);
  }, [isDegraded, setDegraded]);

  if (!isDegraded) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-3 rounded-xl bg-amber-500/90 px-4 py-2.5 text-sm font-medium text-white shadow-lg backdrop-blur-sm">
        <AlertTriangle size={16} className="shrink-0" />
        <span>Some features are temporarily limited. We&#39;re working on it.</span>
        <button
          onClick={() => setDegraded(false)}
          className="ml-1 rounded-full p-0.5 hover:bg-white/20 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
