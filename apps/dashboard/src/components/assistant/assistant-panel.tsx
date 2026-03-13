'use client';

import { useRef, useEffect, useMemo } from 'react';
import { Bot, Sparkles, X, RotateCcw, Sun, Moon, Sunrise } from 'lucide-react';
import { useAssistant } from '@/hooks/use-assistant';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ChatMessageBubble } from './chat-message';
import { ChatInput } from './chat-input';
import { TypingIndicator } from './typing-indicator';
import { SuggestionChips } from './suggestion-chips';

/** Slide-out chat panel for the NexusAI assistant */
export function AssistantPanel() {
  const {
    isOpen, isLoading, messages, error, suggestions,
    close, sendMessage, clearMessages,
  } = useAssistant();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 bottom-0 z-40 w-full sm:w-[420px] flex flex-col
      bg-card border-l border-border/40 shadow-2xl shadow-black/20 animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600
            flex items-center justify-center">
            <Bot className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-foreground">NexusAI</span>
              <Sparkles className="w-3 h-3 text-yellow-400" />
            </div>
            <span className="text-[10px] text-muted-foreground">Your AI marketing copilot</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearMessages}
            className="w-8 h-8 flex items-center justify-center rounded-lg
              hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            title="New conversation"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={close}
            className="w-8 h-8 flex items-center justify-center rounded-lg
              hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyState onSuggestionClick={sendMessage} suggestions={suggestions} />
        ) : (
          <div className="py-2">
            {messages.map((msg) => (
              <ChatMessageBubble key={msg.id} message={msg} />
            ))}
            {isLoading && <TypingIndicator />}
          </div>
        )}

        {error && (
          <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* Suggestion chips (when there are messages) */}
      {messages.length > 0 && (
        <SuggestionChips suggestions={suggestions} onSelect={sendMessage} disabled={isLoading} />
      )}

      {/* Input */}
      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </div>
  );
}

function getTimeGreeting(): { greeting: string; icon: typeof Sun } {
  const hour = new Date().getHours();
  if (hour < 12) return { greeting: 'Good morning', icon: Sunrise };
  if (hour < 18) return { greeting: 'Good afternoon', icon: Sun };
  return { greeting: 'Good evening', icon: Moon };
}

function EmptyState({ onSuggestionClick, suggestions }: {
  onSuggestionClick: (msg: string) => void;
  suggestions: Array<{ label: string; message: string }>;
}) {
  const { greeting, icon: TimeIcon } = useMemo(getTimeGreeting, []);

  // Fetch agent stats for proactive insight
  const { data: stats } = useQuery({
    queryKey: ['agents', 'stats'],
    queryFn: () => api.getAgentStats(),
    staleTime: 60000,
  });

  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.getAgents(),
    staleTime: 60000,
  });

  const activeCount = agents?.filter((a: any) => a.status === 'processing').length ?? 0;
  const totalTasks = stats?.tasksToday ?? 0;

  // Build the proactive insight line
  const insightLine = activeCount > 0
    ? `${activeCount} agent${activeCount > 1 ? 's are' : ' is'} running right now with ${totalTasks} task${totalTasks !== 1 ? 's' : ''} processed today.`
    : totalTasks > 0
    ? `Your agents processed ${totalTasks} task${totalTasks !== 1 ? 's' : ''} today.`
    : null;

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20
        border border-indigo-500/20 flex items-center justify-center mb-4">
        <Bot className="w-8 h-8 text-indigo-400" />
      </div>
      <div className="flex items-center gap-1.5 mb-1">
        <TimeIcon className="w-4 h-4 text-amber-400" />
        <h3 className="text-lg font-semibold text-foreground">{greeting}, Commander</h3>
      </div>
      {insightLine && (
        <p className="text-xs text-indigo-400/80 mb-1 font-medium">{insightLine}</p>
      )}
      <p className="text-sm text-muted-foreground mb-6 max-w-[280px]">
        I&apos;m your AI marketing copilot. Ask me anything about your campaigns, agents, or analytics.
      </p>
      <div className="w-full space-y-2">
        {suggestions.map((chip) => (
          <button
            key={chip.label}
            onClick={() => onSuggestionClick(chip.message)}
            className="w-full text-left px-4 py-3 rounded-xl border border-border/40 bg-secondary/30
              hover:bg-secondary/60 hover:border-indigo-500/20 transition-all text-sm text-foreground group"
          >
            <span className="text-muted-foreground group-hover:text-indigo-400 transition-colors mr-2">→</span>
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
