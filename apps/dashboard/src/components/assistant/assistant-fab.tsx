'use client';

import { useAssistantVisibility } from '@/hooks/use-assistant';
import { X } from 'lucide-react';
import { NexusIcon } from './nexus-icon';

/** Floating action button that opens the NexusAI assistant panel */
export function AssistantFab() {
  const { isOpen, toggle } = useAssistantVisibility();

  return (
    <button
      onClick={toggle}
      aria-label={isOpen ? 'Close NexusAI' : 'Open NexusAI'}
      className="fixed bottom-6 right-6 z-50 group flex items-center justify-center w-14 h-14 rounded-full
        bg-gradient-to-br from-primary to-green-600 text-white shadow-lg
        hover:shadow-xl hover:shadow-primary/15 transition-all duration-300
        hover:scale-105 active:scale-95"
    >
      {isOpen ? (
        <X className="w-6 h-6" />
      ) : (
        <NexusIcon size={24} active className="text-white" />
      )}
    </button>
  );
}
