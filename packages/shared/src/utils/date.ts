/** Format a Date to YYYY-MM-DD string */
export function toDateString(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

/** Parse a date string. Returns null if invalid */
export function parseDate(input: string): Date | null {
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

/** Get start of day (00:00:00.000) */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Get end of day (23:59:59.999) */
export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Subtract days from a date, returns new Date */
export function subtractDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

/** Add days to a date, returns new Date */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Calculate number of days between two dates */
export function daysBetween(a: Date, b: Date): number {
  const MS_PER_DAY = 86400000;
  return Math.round(Math.abs(a.getTime() - b.getTime()) / MS_PER_DAY);
}

/** Check if a date is within a range (inclusive) */
export function isWithinRange(date: Date, start: Date, end: Date): boolean {
  const t = date.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

/** Generate an array of date strings between start and end */
export function generateDateRange(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(toDateString(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/** Format elapsed time in human-readable form */
export function formatTimeElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

/** Get ISO week number (1-53) */
export function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
