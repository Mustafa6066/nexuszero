'use client';

import { useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAssistantStore } from '@/lib/assistant-store';
import { sendAssistantMessage } from '@/lib/assistant-client';
import { UIActionExecutor } from '@/lib/ui-action-executor';
import type { UIContext } from '@/lib/assistant-client';

/** Captures the current UI context (page, filters, etc.) for NexusAI */
function useUIContext(): UIContext {
  const pathname = usePathname();
  return {
    currentPage: pathname,
  };
}

/** Main hook for interacting with the NexusAI assistant */
export function useAssistant() {
  const store = useAssistantStore();
  const router = useRouter();
  const uiContext = useUIContext();
  const executorRef = useRef<UIActionExecutor | null>(null);

  if (!executorRef.current) {
    executorRef.current = new UIActionExecutor(router);
  }

  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim() || store.isLoading) return;

    await sendAssistantMessage(message, uiContext, (toolCall) => {
      executorRef.current?.execute(toolCall);
    });
  }, [uiContext, store.isLoading]);

  return {
    isOpen: store.isOpen,
    isLoading: store.isLoading,
    messages: store.messages,
    error: store.error,
    preferredLanguage: store.preferredLanguage,
    suggestions: store.suggestions,
    sessionId: store.sessionId,
    open: store.open,
    close: store.close,
    toggle: store.toggle,
    sendMessage,
    clearMessages: store.clearMessages,
  };
}
