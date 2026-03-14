'use client';

import type { AssistantLocale, AssistantSuggestion } from '@/lib/assistant-store';

interface SuggestionChipsProps {
  suggestions: AssistantSuggestion[];
  onSelect: (message: string) => void;
  disabled?: boolean;
  locale?: AssistantLocale;
}

/** Quick-action suggestion buttons below the chat input */
export function SuggestionChips({ suggestions, onSelect, disabled, locale = 'en' }: SuggestionChipsProps) {
  if (suggestions.length === 0) return null;

  const isArabic = locale === 'ar';

  return (
    <div className="border-t border-primary/10 px-4 py-3" dir={isArabic ? 'rtl' : 'ltr'}>
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-muted-foreground/55">
        <span>{isArabic ? 'عمليات مقترحة' : 'Suggested Operations'}</span>
        <span>{suggestions.length}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((chip) => (
          <button
            key={chip.label}
            onClick={() => onSelect(chip.message)}
            disabled={disabled}
            className="min-w-[9rem] rounded-2xl border border-primary/10 bg-background/40 px-3 py-2 text-left transition-all duration-200 hover:border-primary/20 hover:bg-secondary/35 hover:shadow-[0_12px_30px_hsl(var(--primary)/0.06)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="block text-[9px] uppercase tracking-[0.18em] text-muted-foreground/50">
              {isArabic ? 'تشغيل' : 'Run'}
            </span>
            <span className="mt-1 block text-xs font-medium text-foreground/85">{chip.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
