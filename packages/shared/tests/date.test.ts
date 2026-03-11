import { describe, it, expect } from 'vitest';
import {
  toDateString,
  parseDate,
  startOfDay,
  endOfDay,
  subtractDays,
  addDays,
  daysBetween,
  isWithinRange,
  generateDateRange,
  formatTimeElapsed,
} from '../src/utils/date';

describe('toDateString', () => {
  it('formats date as YYYY-MM-DD', () => {
    expect(toDateString(new Date('2024-03-15T12:00:00Z'))).toBe('2024-03-15');
  });
});

describe('parseDate', () => {
  it('parses valid date strings', () => {
    const result = parseDate('2024-01-15');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2024);
  });

  it('returns null for invalid dates', () => {
    expect(parseDate('not-a-date')).toBeNull();
    expect(parseDate('')).toBeNull();
  });
});

describe('startOfDay / endOfDay', () => {
  it('sets time to 00:00:00', () => {
    const d = startOfDay(new Date('2024-06-15T14:30:00'));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
  });

  it('sets time to 23:59:59.999', () => {
    const d = endOfDay(new Date('2024-06-15T14:30:00'));
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
    expect(d.getSeconds()).toBe(59);
    expect(d.getMilliseconds()).toBe(999);
  });
});

describe('addDays / subtractDays', () => {
  it('adds days correctly', () => {
    const d = addDays(new Date('2024-01-01'), 10);
    expect(d.getDate()).toBe(11);
  });

  it('subtracts days correctly', () => {
    const d = subtractDays(new Date('2024-01-11'), 10);
    expect(d.getDate()).toBe(1);
  });

  it('does not mutate original date', () => {
    const original = new Date('2024-06-15');
    const originalTime = original.getTime();
    addDays(original, 5);
    expect(original.getTime()).toBe(originalTime);
  });
});

describe('daysBetween', () => {
  it('calculates days between dates', () => {
    const a = new Date('2024-01-01');
    const b = new Date('2024-01-31');
    expect(daysBetween(a, b)).toBe(30);
  });

  it('is order-independent', () => {
    const a = new Date('2024-01-01');
    const b = new Date('2024-01-31');
    expect(daysBetween(b, a)).toBe(30);
  });
});

describe('isWithinRange', () => {
  const start = new Date('2024-01-01');
  const end = new Date('2024-12-31');

  it('returns true for dates in range', () => {
    expect(isWithinRange(new Date('2024-06-15'), start, end)).toBe(true);
  });

  it('returns true for boundary dates', () => {
    expect(isWithinRange(start, start, end)).toBe(true);
    expect(isWithinRange(end, start, end)).toBe(true);
  });

  it('returns false for dates outside range', () => {
    expect(isWithinRange(new Date('2023-12-31'), start, end)).toBe(false);
  });
});

describe('generateDateRange', () => {
  it('generates array of date strings', () => {
    const range = generateDateRange(new Date('2024-01-01'), new Date('2024-01-03'));
    expect(range).toEqual(['2024-01-01', '2024-01-02', '2024-01-03']);
  });

  it('returns single date for same start and end', () => {
    const range = generateDateRange(new Date('2024-01-01'), new Date('2024-01-01'));
    expect(range).toEqual(['2024-01-01']);
  });
});

describe('formatTimeElapsed', () => {
  it('formats milliseconds', () => {
    expect(formatTimeElapsed(500)).toBe('500ms');
  });

  it('formats seconds', () => {
    expect(formatTimeElapsed(5000)).toBe('5.0s');
  });

  it('formats minutes', () => {
    expect(formatTimeElapsed(125000)).toBe('2m 5s');
  });

  it('formats hours', () => {
    expect(formatTimeElapsed(3700000)).toBe('1h 1m');
  });
});
