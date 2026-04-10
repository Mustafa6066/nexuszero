'use client';

import { Button, Badge } from '@/components/ui';
import { Filter, X } from 'lucide-react';

interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

interface FilterGroup {
  key: string;
  label: string;
  options: FilterOption[];
}

interface FilterBarProps {
  groups: FilterGroup[];
  filters: Record<string, string | undefined>;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClear: () => void;
  activeCount: number;
}

export function FilterBar({ groups, filters, onFilterChange, onClear, activeCount }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Filter className="h-4 w-4" />
        Filters
      </div>
      {groups.map((group) => (
        <div key={group.key} className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">{group.label}:</span>
          <div className="flex gap-1">
            {group.options.map((option) => {
              const isActive = filters[group.key] === option.value || (!filters[group.key] && option.value === 'all');
              return (
                <button
                  key={option.value}
                  onClick={() => onFilterChange(group.key, option.value === 'all' ? undefined : option.value)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }`}
                >
                  {option.label}
                  {option.count !== undefined && (
                    <span className="ml-1 opacity-70">({option.count})</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {activeCount > 0 && (
        <button
          onClick={onClear}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3 w-3" /> Clear all
        </button>
      )}
    </div>
  );
}

interface BulkActionsBarProps {
  selectedCount: number;
  onClear: () => void;
  children: React.ReactNode;
}

export function BulkActionsBar({ selectedCount, onClear, children }: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 animate-in slide-in-from-top-2">
      <Badge variant="default">{selectedCount} selected</Badge>
      <div className="flex items-center gap-2">{children}</div>
      <button
        onClick={onClear}
        className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-3 w-3" /> Deselect
      </button>
    </div>
  );
}
