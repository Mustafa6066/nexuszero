'use client';

interface SuggestionChipsProps {
  suggestions: Array<{ label: string; message: string }>;
  onSelect: (message: string) => void;
  disabled?: boolean;
}

/** Quick-action suggestion buttons below the chat input */
export function SuggestionChips({ suggestions, onSelect, disabled }: SuggestionChipsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-4 pb-2">
      {suggestions.map((chip) => (
        <button
          key={chip.label}
          onClick={() => onSelect(chip.message)}
          disabled={disabled}
          className="text-xs px-3 py-1.5 rounded-full border border-border/60 bg-secondary/50
            text-muted-foreground hover:text-foreground hover:bg-secondary hover:border-indigo-500/30
            transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
