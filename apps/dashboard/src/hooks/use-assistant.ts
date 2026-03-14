'use client';

import { startTransition, useCallback, useRef } from 'react';
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
export function useAssistantActions() {
  const router = useRouter();
  const uiContext = useUIContext();
  const executorRef = useRef<UIActionExecutor | null>(null);
  const openStore = useAssistantStore((state) => state.open);
  const closeStore = useAssistantStore((state) => state.close);
  const toggleStore = useAssistantStore((state) => state.toggle);
  const clearMessagesStore = useAssistantStore((state) => state.clearMessages);

  if (!executorRef.current) {
    executorRef.current = new UIActionExecutor(router);
  }

  const open = useCallback(() => {
    startTransition(() => {
      openStore();
    });
  }, [openStore]);

  const close = useCallback(() => {
    startTransition(() => {
      closeStore();
    });
  }, [closeStore]);

  const toggle = useCallback(() => {
    startTransition(() => {
      toggleStore();
    });
  }, [toggleStore]);

  const clearMessages = useCallback(() => {
    clearMessagesStore();
  }, [clearMessagesStore]);

  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim() || useAssistantStore.getState().isLoading) return;

    await sendAssistantMessage(message, uiContext, (toolCall) => {
      executorRef.current?.execute(toolCall);
    });
  }, [uiContext]);

  return {
    open,
    close,
    toggle,
    sendMessage,
    clearMessages,
  };
}

export function useAssistantVisibility() {
  const isOpen = useAssistantStore((state) => state.isOpen);
  const actions = useAssistantActions();

  return {
    isOpen,
    open: actions.open,
    close: actions.close,
    toggle: actions.toggle,
  };
}

/** Main hook for assistant panel state and actions */
export function useAssistant() {
  const isOpen = useAssistantStore((state) => state.isOpen);
  const isLoading = useAssistantStore((state) => state.isLoading);
  const messages = useAssistantStore((state) => state.messages);
  const error = useAssistantStore((state) => state.error);
  const preferredLanguage = useAssistantStore((state) => state.preferredLanguage);
  const suggestions = useAssistantStore((state) => state.suggestions);
  const sessionId = useAssistantStore((state) => state.sessionId);
  const actions = useAssistantActions();

  return {
    isOpen,
    isLoading,
    messages,
    error,
    preferredLanguage,
    suggestions,
    sessionId,
    ...actions,
  };
}
