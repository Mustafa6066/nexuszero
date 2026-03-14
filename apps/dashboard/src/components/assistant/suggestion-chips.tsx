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
    <div className="flex flex-wrap gap-1.5 px-4 pb-2" dir={isArabic ? 'rtl' : 'ltr'}>
      {suggestions.map((chip) => (
        <button
          key={chip.label}
          onClick={() => onSelect(chip.message)}
          disabled={disabled}
          className="text-xs px-3 py-1.5 rounded-full border border-border/30 bg-secondary/30
            text-muted-foreground/70 hover:text-foreground/80 hover:bg-secondary/50 hover:border-primary/20
            transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
