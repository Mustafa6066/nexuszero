'use client';

import { useRef, useEffect, useState } from 'react';
import { Bot, ChevronRight, X, RotateCcw, Sun, Moon, Sunrise } from 'lucide-react';
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
    <div className="fixed inset-0 z-40 flex flex-col border border-border/30 bg-card/95 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-2xl shadow-black/20 backdrop-blur-2xl animate-in slide-in-from-right lg:inset-auto lg:bottom-6 lg:right-6 lg:top-24 lg:w-[420px] lg:rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/30 bg-secondary/10 px-3 py-3 sm:px-4 lg:rounded-t-2xl">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/18 to-primary/8
            border border-primary/15 flex items-center justify-center">
            <NexusIcon size={18} active className="text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-foreground">NexusAI</span>
              <Bot className="w-3 h-3 text-primary/70" />
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
          <div className="mx-3 mb-2 rounded-lg border border-red-500/15 bg-red-500/8 px-3 py-2 text-xs text-red-400/80 sm:mx-4">
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
  const [result, setResult] = useState<{ greeting: string; icon: typeof Sun | typeof Bot }>({ greeting: 'Hello', icon: Bot });
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
    <div className="flex h-full flex-col items-center justify-center px-4 py-10 text-center sm:px-6 sm:py-12">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/12 to-primary/5
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
      <p className="mb-6 max-w-[280px] text-sm leading-relaxed text-muted-foreground/60">
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
            <ChevronRight className="mr-2 inline-block h-4 w-4 text-primary/50 transition-colors group-hover:text-primary/70" />
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
