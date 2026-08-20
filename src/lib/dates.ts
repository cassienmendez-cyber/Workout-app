import type { Weekday } from '../domain/types';

/** All dates in the app are handled as local-time ISO `YYYY-MM-DD` strings. */

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromISODate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, days: number): string {
  const date = fromISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function daysBetween(fromISO: string, toISOStr: string): number {
  const a = fromISODate(fromISO).getTime();
  const b = fromISODate(toISOStr).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function weekdayOf(iso: string): Weekday {
  return fromISODate(iso).getDay() as Weekday;
}

export function isBefore(a: string, b: string): boolean {
  return a < b;
}

export function isSameOrAfter(a: string, b: string): boolean {
  return a >= b;
}

/** Monday-based start of the week containing `iso`. */
export function startOfWeek(iso: string): string {
  const day = weekdayOf(iso);
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(iso, offset);
}

export function endOfWeek(iso: string): string {
  return addDays(startOfWeek(iso), 6);
}

/** Dates in [start, end] inclusive. */
export function dateRange(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  let cursor = startISO;
  while (cursor <= endISO) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

export function formatShortDate(iso: string): string {
  return fromISODate(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatLongDate(iso: string): string {
  return fromISODate(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins} min`;
  return `${mins} min ${secs}s`;
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.abs(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
