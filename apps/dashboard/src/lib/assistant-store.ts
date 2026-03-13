import { create } from 'zustand';

export type MessageRole = 'user' | 'assistant';

export interface ToolCallData {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls: ToolCallData[];
  timestamp: number;
}

interface AssistantState {
  isOpen: boolean;
  isLoading: boolean;
  messages: ChatMessage[];
  sessionId: string | null;
  error: string | null;
  suggestions: Array<{ label: string; message: string }>;

  open: () => void;
  close: () => void;
  toggle: () => void;
  addMessage: (msg: ChatMessage) => void;
  appendToLastAssistant: (text: string) => void;
  addToolCallToLast: (toolCall: ToolCallData) => void;
  setLoading: (loading: boolean) => void;
  setSessionId: (id: string) => void;
  setError: (error: string | null) => void;
  setSuggestions: (suggestions: Array<{ label: string; message: string }>) => void;
  clearMessages: () => void;
}

export const useAssistantStore = create<AssistantState>((set) => ({
  isOpen: false,
  isLoading: false,
  messages: [],
  sessionId: null,
  error: null,
  suggestions: [
    { label: 'Campaign performance', message: 'How are my campaigns performing this month?' },
    { label: 'Agent status', message: "What's the status of all my agents?" },
    { label: 'SEO overview', message: 'Give me an overview of my SEO performance' },
    { label: 'Quick audit', message: 'Run a quick audit of my marketing setup' },
  ],

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg], error: null })),

  appendToLastAssistant: (text) => set((s) => {
    const msgs = [...s.messages];
    const last = msgs[msgs.length - 1];
    if (last?.role === 'assistant') {
      msgs[msgs.length - 1] = { ...last, content: last.content + text };
    }
    return { messages: msgs };
  }),

  addToolCallToLast: (toolCall) => set((s) => {
    const msgs = [...s.messages];
    const last = msgs[msgs.length - 1];
    if (last?.role === 'assistant') {
      msgs[msgs.length - 1] = { ...last, toolCalls: [...last.toolCalls, toolCall] };
    }
    return { messages: msgs };
  }),

  setLoading: (loading) => set({ isLoading: loading }),
  setSessionId: (id) => set({ sessionId: id }),
  setError: (error) => set({ error }),
  setSuggestions: (suggestions) => set({ suggestions }),
  clearMessages: () => set({ messages: [], sessionId: null }),
}));
