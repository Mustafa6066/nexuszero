'use client';

import { useAssistant } from '@/hooks/use-assistant';
import { Bot, X, Sparkles } from 'lucide-react';

/** Floating action button that opens the NexusAI assistant panel */
export function AssistantFab() {
  const { isOpen, toggle } = useAssistant();

  return (
    <button
      onClick={toggle}
      aria-label={isOpen ? 'Close NexusAI' : 'Open NexusAI'}
      className="fixed bottom-6 right-6 z-50 group flex items-center justify-center w-14 h-14 rounded-full
        bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg
        hover:shadow-xl hover:shadow-indigo-500/25 transition-all duration-200
        hover:scale-105 active:scale-95"
    >
      {isOpen ? (
        <X className="w-6 h-6" />
      ) : (
        <div className="relative">
          <Bot className="w-6 h-6" />
          <Sparkles className="absolute -top-1 -right-1 w-3 h-3 text-yellow-300 animate-pulse" />
        </div>
      )}
    </button>
  );
}
