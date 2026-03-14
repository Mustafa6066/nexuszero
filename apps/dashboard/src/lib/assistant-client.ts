import { api } from './api';
import { useAssistantStore, type ToolCallData } from './assistant-store';

export interface UIContext {
  currentPage: string;
  selectedDateRange?: { start: string; end: string };
  activeFilters?: Record<string, string>;
  visibleDataSummary?: string;
}

/**
 * Streaming SSE client for the NexusAI assistant.
 * Sends a message and processes the event stream.
 */
export async function sendAssistantMessage(
  message: string,
  uiContext: UIContext,
  onToolCall?: (toolCall: ToolCallData) => void,
): Promise<void> {
  const store = useAssistantStore.getState();
  const token = api.getToken();

  if (!token) {
    store.setError('Not authenticated');
    return;
  }

  const rawBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
  const base = rawBase.endsWith('/api/v1') ? rawBase : `${rawBase}/api/v1`;

  // Add user message
  store.addMessage({
    id: `user-${Date.now()}`,
    role: 'user',
    content: message,
    toolCalls: [],
    timestamp: Date.now(),
  });

  // Add empty assistant message that will be streamed into
  store.addMessage({
    id: `assistant-${Date.now()}`,
    role: 'assistant',
    content: '',
    toolCalls: [],
    timestamp: Date.now(),
  });

  store.setLoading(true);
  store.setError(null);

  try {
    const response = await fetch(`${base}/assistant/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message,
        sessionId: store.sessionId ?? undefined,
        uiContext,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'Request failed' }));
      store.setError(err?.error?.message ?? err?.message ?? `Error ${response.status}`);
      store.setLoading(false);
      return;
    }

    if (!response.body) {
      store.setError('No response stream');
      store.setLoading(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let receivedText = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            switch (event.type) {
              case 'text': {
                let text = event.content as string;
                // Extract session ID from hidden comment
                const sessionMatch = text.match(/<!-- session:([a-f0-9-]+) -->/);
                if (sessionMatch) {
                  store.setSessionId(sessionMatch[1]);
                  text = text.replace(/\n?<!-- session:[a-f0-9-]+ -->/, '');
                  // Session comment arriving means server round-trip worked
                  receivedText = true;
                }
                if (text) {
                  store.appendToLastAssistant(text);
                  receivedText = true;
                }
                break;
              }
              case 'tool_call': {
                const toolCall = event.toolCall as ToolCallData;
                store.addToolCallToLast(toolCall);
                onToolCall?.(toolCall);
                receivedText = true; // tool calls count as valid response
                break;
              }
              case 'error': {
                store.setError(event.message || 'An unexpected error occurred');
                break;
              }
              case 'done': {
                // Stream complete
                break;
              }
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    }
    // If stream ended without any assistant content, show a fallback error
    if (!receivedText && !store.error) {
      store.setError('No response received. Please check your connection and try again.');
    }
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Connection failed');
  } finally {
    store.setLoading(false);
  }
}
