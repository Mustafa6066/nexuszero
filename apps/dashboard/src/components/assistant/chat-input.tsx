'use client';

import { useState, useRef, useEffect, type ChangeEvent, type KeyboardEvent } from 'react';
import { Send, Loader2 } from 'lucide-react';
import type { AssistantLocale } from '@/lib/assistant-store';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  locale?: AssistantLocale;
}

/** Chat input with send button */
export function ChatInput({ onSend, disabled, locale = 'en' }: ChatInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isArabic = locale === 'ar';

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

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
    <div className="border-t border-border/30 p-3">
      <div className="flex items-end gap-2 rounded-xl border border-border/40 bg-secondary/20 px-3 py-2
        focus-within:border-primary/30 focus-within:bg-secondary/30 transition-all duration-200">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => { setValue(e.target.value); handleInput(); }}
          onKeyDown={handleKeyDown}
          dir="auto"
          placeholder={isArabic ? 'اسأل NexusAI أي شيء...' : 'Ask NexusAI anything...'}
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50
            resize-none outline-none max-h-[120px] leading-relaxed disabled:opacity-50"
          style={{ unicodeBidi: 'plaintext' }}
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg
            bg-primary/90 text-primary-foreground hover:bg-primary transition-all duration-200
            disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {disabled ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
      <p className="mt-1.5 text-center text-[10px] text-muted-foreground/40" dir={isArabic ? 'rtl' : 'ltr'}>
        {isArabic ? 'قد يخطئ NexusAI أحيانًا. تحقّق من البيانات المهمة.' : 'NexusAI can make mistakes. Verify important data.'}
      </p>
    </div>
  );
}
