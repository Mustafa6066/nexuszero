'use client';

import { useRef, useEffect, useState } from 'react';
import { ChevronRight, X, RotateCcw, Sun, Moon, Sunrise, Radar, Workflow, ShieldCheck } from 'lucide-react';
import { useAssistant } from '@/hooks/use-assistant';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AssistantLocale, AssistantSuggestion } from '@/lib/assistant-store';
import { NexusIcon } from './nexus-icon';
import { ChatMessageBubble } from './chat-message';
import { ChatInput } from './chat-input';
import { ThinkingIndicator } from './thinking-indicator';
import { SuggestionChips } from './suggestion-chips';

/** Slide-out panel for the NexusAI assistant */
export function AssistantPanel() {
  const {
    isOpen, isLoading, messages, error, preferredLanguage, suggestions,
    close, sendMessage, clearMessages,
  } = useAssistant();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasRendered, setHasRendered] = useState(isOpen);
  const isArabic = preferredLanguage === 'ar';
  const capabilityCards = isArabic
    ? [
        { icon: Radar, title: 'سياق مباشر', detail: 'يقرأ حالة العميل والواجهة قبل الرد' },
        { icon: Workflow, title: 'تنفيذ منسق', detail: 'يجمع الأدوات والبيانات في مسار واحد' },
        { icon: ShieldCheck, title: 'تحليل موثوق', detail: 'يقترح الخطوة التالية بوضوح' },
      ]
    : [
        { icon: Radar, title: 'Live Context', detail: 'Reads tenant and UI state before answering' },
        { icon: Workflow, title: 'Orchestrated Tools', detail: 'Combines actions, data, and navigation' },
        { icon: ShieldCheck, title: 'Strategic Output', detail: 'Frames the next best move clearly' },
      ];

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (hasRendered || isOpen) {
      if (isOpen && !hasRendered) {
        setHasRendered(true);
      }
      return;
    }

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(() => {
        setHasRendered(true);
      }, { timeout: 1500 });

      return () => {
        idleWindow.cancelIdleCallback?.(handle);
      };
    }

    const timeoutId = window.setTimeout(() => {
      setHasRendered(true);
    }, 1200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [hasRendered, isOpen]);

  if (!hasRendered) return null;

  return (
    <div
      hidden={!isOpen}
      aria-hidden={!isOpen}
      className={`fixed inset-0 z-[60] flex h-[100dvh] flex-col overflow-hidden border border-primary/10 bg-[linear-gradient(180deg,hsl(var(--background)/0.98),hsl(var(--card)/0.96))] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-2xl shadow-black/30 backdrop-blur-2xl lg:inset-auto lg:bottom-6 lg:right-6 lg:top-24 lg:h-auto lg:max-h-[calc(100vh-7.5rem)] lg:w-[460px] lg:rounded-[1.75rem] ${isOpen ? 'animate-in slide-in-from-right' : ''}`}
    >
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 opacity-90">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.14),transparent_38%)]" />
        <div className="absolute inset-0 bg-dots opacity-[0.08]" />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/8 to-transparent" />
      </div>

      {/* Header */}
      <div className="relative border-b border-primary/10 px-3 py-3 sm:px-4 lg:rounded-t-[1.75rem]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 inline-flex items-center rounded-full border border-primary/15 bg-primary/8 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-primary/80">
              {isArabic ? 'طبقة التشغيل الذكية' : 'Intelligence Layer'}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/15 bg-[linear-gradient(145deg,hsl(var(--primary)/0.18),transparent)] shadow-[0_0_0_1px_hsl(var(--primary)/0.06),0_18px_40px_hsl(var(--primary)/0.08)]">
                <NexusIcon size={22} active className="text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold tracking-[0.01em] text-foreground">NexusAI</div>
                <p className="text-xs leading-relaxed text-muted-foreground/80">
                  {isArabic
                    ? 'وكيل تشغيلي يقرأ السياق ويحلل المنصة ويقترح القرار التالي.'
                    : 'An operating agent that reads context, analyzes the platform, and recommends the next move.'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={clearMessages}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/20 bg-background/40 text-muted-foreground transition-colors hover:border-primary/20 hover:bg-secondary/60 hover:text-foreground"
              title={isArabic ? 'جلسة جديدة' : 'New session'}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={close}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/20 bg-background/40 text-muted-foreground transition-colors hover:border-primary/20 hover:bg-secondary/60 hover:text-foreground"
              title={isArabic ? 'إغلاق' : 'Close'}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2" dir={isArabic ? 'rtl' : 'ltr'}>
          {capabilityCards.map(({ icon: Icon, title, detail }) => (
            <div
              key={title}
              className="rounded-2xl border border-primary/10 bg-background/45 px-3 py-2 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.03)]"
            >
              <Icon className="mb-2 h-3.5 w-3.5 text-primary/80" />
              <div className="text-[11px] font-semibold text-foreground/90">{title}</div>
              <div className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70">{detail}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="relative flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyState onSuggestionClick={sendMessage} suggestions={suggestions} locale={preferredLanguage} />
        ) : (
          <div className="relative py-3">
            {messages.map((msg) => (
              <ChatMessageBubble key={msg.id} message={msg} />
            ))}
            {isLoading && <ThinkingIndicator />}
          </div>
        )}
        {error && (
          <div className="mx-3 mb-3 rounded-2xl border border-red-500/20 bg-red-500/8 px-3 py-3 text-xs leading-relaxed text-red-400/85 sm:mx-4">
            {error}
          </div>
        )}
      </div>

      {/* Suggestion chips (when there are messages) */}
      {messages.length > 0 && (
        <SuggestionChips suggestions={suggestions} onSelect={sendMessage} disabled={isLoading} locale={preferredLanguage} />
      )}

      <ChatInput onSend={sendMessage} disabled={isLoading} locale={preferredLanguage} />
    </div>
  );
}

function useTimeGreeting(locale: AssistantLocale) {
  const [result, setResult] = useState<{ greeting: string; icon: typeof Sun }>({ greeting: locale === 'ar' ? 'مرحبًا' : 'Hello', icon: Sun });
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setResult({ greeting: locale === 'ar' ? 'صباح الخير' : 'Good morning', icon: Sunrise });
    else setResult({ greeting: locale === 'ar' ? 'مساء الخير' : 'Good evening', icon: Moon });
  }, [locale]);
  return result;
}

function EmptyState({ onSuggestionClick, suggestions, locale = 'en' }: {
  onSuggestionClick: (msg: string) => void;
  suggestions: AssistantSuggestion[];
  locale?: AssistantLocale;
}) {
  const isArabic = locale === 'ar';
  const { greeting, icon: TimeIcon } = useTimeGreeting(locale);

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
  const readiness = activeCount > 0 || totalTasks > 0;

  const insightLine = activeCount > 0
    ? (isArabic
      ? `يوجد الآن ${activeCount} ${activeCount > 1 ? 'وكلاء يعملون' : 'وكيل يعمل'}، وتمت معالجة ${totalTasks} ${totalTasks !== 1 ? 'مهام' : 'مهمة'} اليوم.`
      : `${activeCount} agent${activeCount > 1 ? 's are' : ' is'} running right now with ${totalTasks} task${totalTasks !== 1 ? 's' : ''} processed today.`)
    : totalTasks > 0
    ? (isArabic
      ? `عالج وكلاؤك ${totalTasks} ${totalTasks !== 1 ? 'مهام' : 'مهمة'} اليوم.`
      : `Your agents processed ${totalTasks} task${totalTasks !== 1 ? 's' : ''} today.`)
    : null;

  return (
    <div className="flex h-full flex-col justify-center px-4 py-10 sm:px-6 sm:py-12" dir={isArabic ? 'rtl' : 'ltr'}>
      <div className="rounded-[1.75rem] border border-primary/10 bg-[linear-gradient(180deg,hsl(var(--background)/0.7),hsl(var(--card)/0.86))] p-5 shadow-[0_24px_80px_hsl(var(--background)/0.35)]">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.35rem] border border-primary/15 bg-[linear-gradient(145deg,hsl(var(--primary)/0.16),transparent)]">
            <NexusIcon size={28} active className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/8 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-primary/75">
              <TimeIcon className="h-3 w-3" />
              {isArabic ? 'وضع المساعد الذكي' : 'Agent Console Ready'}
            </div>
            <h3 className="text-xl font-semibold tracking-[0.01em] text-foreground">{greeting}</h3>
            <p className="mt-2 max-w-[30rem] text-sm leading-7 text-muted-foreground/75">
              {isArabic
                ? 'صف الهدف، المشكلة، أو القرار الذي تريد حسمه. NexusAI سيقرأ السياق المباشر ويعطيك تحليلًا عمليًا بدل محادثة عامة.'
                : 'Describe the goal, issue, or decision you want resolved. NexusAI will read live context and respond with operational analysis, not generic chat.'}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border/20 bg-background/45 px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/65">
              {isArabic ? 'جاهزية النظام' : 'System Readiness'}
            </div>
            <div className="mt-2 text-lg font-semibold text-foreground/90">
              {readiness ? (isArabic ? 'نشط' : 'Active') : (isArabic ? 'في الانتظار' : 'Standby')}
            </div>
            <div className="mt-1 text-xs leading-relaxed text-muted-foreground/70">
              {insightLine ?? (isArabic ? 'جاهز لقراءة الأداء والوكلاء والسياق الحالي.' : 'Ready to read performance, agents, and current platform context.')}
            </div>
          </div>
          <div className="rounded-2xl border border-border/20 bg-background/45 px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/65">
              {isArabic ? 'أسلوب العمل' : 'Response Mode'}
            </div>
            <div className="mt-2 text-lg font-semibold text-foreground/90">
              {isArabic ? 'تحليل + تنفيذ' : 'Analysis + Action'}
            </div>
            <div className="mt-1 text-xs leading-relaxed text-muted-foreground/70">
              {isArabic ? 'يركز على التشخيص، القرارات، والأوامر التالية.' : 'Focused on diagnosis, decisions, and the next operational move.'}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-2.5">
          {suggestions.map((chip) => (
            <button
              key={chip.label}
              onClick={() => onSuggestionClick(chip.message)}
              className={`group flex w-full items-center justify-between rounded-2xl border border-primary/10 bg-background/35 px-4 py-3 text-sm transition-all duration-200 hover:border-primary/20 hover:bg-secondary/30 hover:shadow-[0_10px_30px_hsl(var(--primary)/0.08)] ${isArabic ? 'text-right' : 'text-left'}`}
            >
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55">
                  {isArabic ? 'تشغيل سريع' : 'Quick Operation'}
                </div>
                <div className="mt-1 font-medium text-foreground/88">{chip.label}</div>
              </div>
              <ChevronRight className={`h-4 w-4 shrink-0 text-primary/55 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary/80 ${isArabic ? 'rotate-180 group-hover:-translate-x-0.5' : ''}`} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
