import { useState, useCallback, useMemo } from 'react';

interface UseFiltersOptions<T extends Record<string, string>> {
  defaults?: Partial<T>;
}

export function useFilters<T extends Record<string, string>>(options?: UseFiltersOptions<T>) {
  const [filters, setFilters] = useState<Partial<T>>(options?.defaults ?? {});

  const setFilter = useCallback(<K extends keyof T>(key: K, value: T[K] | undefined) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (!value || value === 'all') {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => setFilters({}), []);

  const activeCount = useMemo(() => Object.keys(filters).length, [filters]);

  const toParams = useCallback((): Record<string, string> => {
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v) params[k] = v;
    }
    return params;
  }, [filters]);

  return { filters, setFilter, clearFilters, activeCount, toParams };
}

export function useBulkSelection<T extends string = string>() {
  const [selected, setSelected] = useState<Set<T>>(new Set());

  const toggle = useCallback((id: T) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: T[]) => {
    setSelected(new Set(ids));
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const isSelected = useCallback((id: T) => selected.has(id), [selected]);

  return {
    selected,
    selectedCount: selected.size,
    toggle,
    selectAll,
    clearSelection,
    isSelected,
    selectedArray: Array.from(selected),
  };
}
