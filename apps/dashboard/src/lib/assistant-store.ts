import { create } from 'zustand';

export type MessageRole = 'user' | 'assistant';
export type AssistantLocale = 'en' | 'ar';

export interface AssistantSuggestion {
  label: string;
  message: string;
}

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/u;

const EN_SUGGESTIONS: AssistantSuggestion[] = [
  { label: 'Campaign performance', message: 'How are my campaigns performing this month?' },
  { label: 'Agent status', message: "What's the status of all my agents?" },
  { label: 'SEO overview', message: 'Give me an overview of my SEO performance' },
  { label: 'Quick audit', message: 'Run a quick audit of my marketing setup' },
];

const AR_SUGGESTIONS: AssistantSuggestion[] = [
  { label: 'أداء الحملات', message: 'كيف كان أداء حملاتي هذا الشهر؟' },
  { label: 'حالة الوكلاء', message: 'ما حالة جميع الوكلاء لدي الآن؟' },
  { label: 'ملخص SEO', message: 'أعطني ملخصًا عن أداء تحسين محركات البحث لدي.' },
  { label: 'تدقيق سريع', message: 'نفّذ تدقيقًا سريعًا لإعدادات التسويق لدي.' },
];

export function detectAssistantLocale(text: string): AssistantLocale {
  return ARABIC_SCRIPT_RE.test(text) ? 'ar' : 'en';
}

export function getSuggestionsForLocale(locale: AssistantLocale): AssistantSuggestion[] {
  return locale === 'ar' ? AR_SUGGESTIONS : EN_SUGGESTIONS;
}

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
  preferredLanguage: AssistantLocale;
  suggestions: AssistantSuggestion[];

  open: () => void;
  close: () => void;
  toggle: () => void;
  addMessage: (msg: ChatMessage) => void;
  appendToLastAssistant: (text: string) => void;
  addToolCallToLast: (toolCall: ToolCallData) => void;
  setLoading: (loading: boolean) => void;
  setSessionId: (id: string) => void;
  setError: (error: string | null) => void;
  setPreferredLanguage: (language: AssistantLocale) => void;
  setSuggestions: (suggestions: AssistantSuggestion[]) => void;
  clearMessages: () => void;
}

export const useAssistantStore = create<AssistantState>((set) => ({
  isOpen: false,
  isLoading: false,
  messages: [],
  sessionId: null,
  error: null,
  preferredLanguage: 'en',
  suggestions: EN_SUGGESTIONS,

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s: AssistantState) => ({ isOpen: !s.isOpen })),

  addMessage: (msg: ChatMessage) => set((s: AssistantState) => ({ messages: [...s.messages, msg], error: null })),

  appendToLastAssistant: (text: string) => set((s: AssistantState) => {
    const msgs = [...s.messages];
    const last = msgs[msgs.length - 1];
    if (last?.role === 'assistant') {
      msgs[msgs.length - 1] = { ...last, content: last.content + text };
    }
    return { messages: msgs };
  }),

  addToolCallToLast: (toolCall: ToolCallData) => set((s: AssistantState) => {
    const msgs = [...s.messages];
    const last = msgs[msgs.length - 1];
    if (last?.role === 'assistant') {
      msgs[msgs.length - 1] = { ...last, toolCalls: [...last.toolCalls, toolCall] };
    }
    return { messages: msgs };
  }),

  setLoading: (loading: boolean) => set({ isLoading: loading }),
  setSessionId: (id: string) => set({ sessionId: id }),
  setError: (error: string | null) => set({ error }),
  setPreferredLanguage: (preferredLanguage: AssistantLocale) => set({
    preferredLanguage,
    suggestions: getSuggestionsForLocale(preferredLanguage),
  }),
  setSuggestions: (suggestions: AssistantSuggestion[]) => set({ suggestions }),
  clearMessages: () => set((s: AssistantState) => ({
    messages: [],
    sessionId: null,
    suggestions: getSuggestionsForLocale(s.preferredLanguage),
  })),
}));
