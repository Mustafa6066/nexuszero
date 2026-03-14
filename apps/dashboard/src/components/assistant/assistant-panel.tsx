'use client';

import { useRef, useEffect, useState } from 'react';
import { Sparkles, X, RotateCcw, Sun, Moon, Sunrise } from 'lucide-react';
import { useAssistant } from '@/hooks/use-assistant';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { NexusIcon } from './nexus-icon';
import { ChatMessageBubble } from './chat-message';
import { ChatInput } from './chat-input';
import { ThinkingIndicator } from './thinking-indicator';
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
    <div className="fixed inset-0 z-40 md:inset-auto md:right-6 md:top-24 md:bottom-6 md:w-[420px] flex flex-col
      bg-card/95 backdrop-blur-2xl border border-border/30 shadow-2xl shadow-black/20 md:rounded-2xl animate-in slide-in-from-right">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 md:rounded-t-2xl bg-secondary/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500/15 to-blue-500/15
            border border-primary/15 flex items-center justify-center">
            <NexusIcon size={18} active className="text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-foreground">NexusAI</span>
              <Sparkles className="w-3 h-3 text-violet-400/60" />
            </div>
            <span className="text-[10px] text-muted-foreground/70">Strategy Assistant</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={clearMessages}
            className="w-7 h-7 flex items-center justify-center rounded-lg
              hover:bg-secondary/60 transition-colors text-muted-foreground hover:text-foreground"
            title="New conversation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={close}
            className="w-7 h-7 flex items-center justify-center rounded-lg
              hover:bg-secondary/60 transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
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
            {isLoading && <ThinkingIndicator />}
          </div>
        )}

        {error && (
          <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-red-500/8 border border-red-500/15 text-xs text-red-400/80">
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

function useTimeGreeting() {
  const [result, setResult] = useState<{ greeting: string; icon: typeof Sun }>({ greeting: 'Hello', icon: Sparkles });
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setResult({ greeting: 'Good morning', icon: Sunrise });
    else if (hour < 18) setResult({ greeting: 'Good afternoon', icon: Sun });
    else setResult({ greeting: 'Good evening', icon: Moon });
  }, []);
  return result;
}

function EmptyState({ onSuggestionClick, suggestions }: {
  onSuggestionClick: (msg: string) => void;
  suggestions: Array<{ label: string; message: string }>;
}) {
  const { greeting, icon: TimeIcon } = useTimeGreeting();

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
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/10 to-blue-500/10
        border border-primary/10 flex items-center justify-center mb-5">
        <NexusIcon size={28} active className="text-primary" />
      </div>
      <div className="flex items-center gap-1.5 mb-1">
        <TimeIcon className="w-4 h-4 text-muted-foreground/60" />
        <h3 className="text-lg font-semibold text-foreground">{greeting}</h3>
      </div>
      {insightLine && (
        <p className="text-xs text-muted-foreground/80 mb-1 font-medium">{insightLine}</p>
      )}
      <p className="text-sm text-muted-foreground/60 mb-6 max-w-[280px] leading-relaxed">
        Ask me to analyze performance, diagnose issues, or suggest next steps.
      </p>
      <div className="w-full space-y-2">
        {suggestions.map((chip) => (
          <button
            key={chip.label}
            onClick={() => onSuggestionClick(chip.message)}
            className="w-full text-left px-4 py-3 rounded-xl border border-border/30 bg-background/30
              hover:bg-secondary/40 hover:border-border/50 transition-all duration-200 text-sm text-foreground/80
              hover:text-foreground group"
          >
            <span className="text-primary/40 group-hover:text-primary/60 transition-colors mr-2">→</span>
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
