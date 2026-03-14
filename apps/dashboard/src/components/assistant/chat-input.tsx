'use client';

import { useState, useRef, useEffect, type ChangeEvent, type KeyboardEvent } from 'react';
import { Loader2, SendHorizontal, CornerDownLeft } from 'lucide-react';
import type { AssistantLocale } from '@/lib/assistant-store';
import { NexusIconInline } from './nexus-icon';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  locale?: AssistantLocale;
  autoFocus?: boolean;
}

/** Chat input with send button */
export function ChatInput({ onSend, disabled, locale = 'en', autoFocus = false }: ChatInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isArabic = locale === 'ar';

  useEffect(() => {
    if (autoFocus && !disabled) inputRef.current?.focus();
  }, [autoFocus, disabled]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    // Reset height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    const el = inputRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  };

  return (
    <div className="border-t border-primary/10 px-3 pb-3 pt-3">
      <div className="mb-2 flex items-center justify-between px-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/55" dir={isArabic ? 'rtl' : 'ltr'}>
        <span>{isArabic ? 'لوحة التوجيه' : 'Mission Composer'}</span>
        <span className="inline-flex items-center gap-1">
          <CornerDownLeft className="h-3 w-3" />
          {isArabic ? 'Shift + Enter لسطر جديد' : 'Shift + Enter for a new line'}
        </span>
      </div>

      <div className="overflow-hidden rounded-[1.5rem] border border-primary/12 bg-[linear-gradient(180deg,hsl(var(--background)/0.82),hsl(var(--card)/0.9))] shadow-[0_20px_60px_hsl(var(--background)/0.35)] transition-all duration-200 focus-within:border-primary/22">
        <div className="flex items-end gap-3 px-3 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-[linear-gradient(145deg,hsl(var(--primary)/0.16),transparent)] text-primary">
            <NexusIconInline size={16} />
          </div>
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => { setValue(e.target.value); handleInput(); }}
            onKeyDown={handleKeyDown}
            dir="auto"
            placeholder={isArabic ? 'صف الهدف، المشكلة، أو القرار الذي تريد من NexusAI تحليله...' : 'Describe the goal, issue, or decision you want NexusAI to analyze...'}
            disabled={disabled}
            rows={1}
            className="flex-1 bg-transparent pt-1 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/48 resize-none outline-none max-h-[132px] disabled:opacity-50"
            style={{ unicodeBidi: 'plaintext' }}
          />
          <button
            onClick={handleSubmit}
            disabled={disabled || !value.trim()}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl border border-primary/18 bg-primary/92 px-3 text-sm font-medium text-primary-foreground transition-all duration-200 hover:bg-primary disabled:cursor-not-allowed disabled:opacity-35"
          >
            {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
            <span>{isArabic ? 'نفّذ' : 'Run'}</span>
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-border/20 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground/60" dir={isArabic ? 'rtl' : 'ltr'}>
          <span>{isArabic ? 'NexusAI يقرأ حالة المنصة المباشرة قبل الرد.' : 'NexusAI reads live platform context before responding.'}</span>
          <span>{isArabic ? 'تحقق من القرارات الحساسة' : 'Verify critical decisions'}</span>
        </div>
      </div>
    </div>
  );
}
