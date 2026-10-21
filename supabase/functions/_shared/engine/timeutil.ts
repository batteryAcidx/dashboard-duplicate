import type { AccountContext } from './types.ts';

export interface LocalParts {
  year: number; month: number; day: number; hour: number; minute: number;
  weekday: number; // 0 = Sunday
}

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(d: Date, tz: string): LocalParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', weekday: 'short',
  });
  const o: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) o[p.type] = p.value;
  return { year: +o.year, month: +o.month, day: +o.day, hour: +o.hour, minute: +o.minute, weekday: WD[o.weekday] };
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return (+h) * 60 + (+m || 0);
}

export function minutesOfDay(d: Date, tz: string): number {
  const p = localParts(d, tz);
  return p.hour * 60 + p.minute;
}

type QuietCtx = Pick<AccountContext, 'timezone' | 'quietStart' | 'quietEnd'>;

/** Quiet hours default to 9 PM to 7 AM local time when the account has none set. */
export function isQuietHours(a: QuietCtx, now: Date): boolean {
  const start = toMinutes(a.quietStart ?? '21:00');
  const end = toMinutes(a.quietEnd ?? '07:00');
  const m = minutesOfDay(now, a.timezone);
  if (start === end) return false;
  return start < end ? m >= start && m < end : m >= start || m < end;
}

/** First moment (15-minute resolution) at or after `now` that is not quiet. */
export function nextQuietEnd(a: QuietCtx, now: Date): Date {
  let t = now.getTime();
  for (let i = 0; i < 100; i++) {
    if (!isQuietHours(a, new Date(t))) return new Date(t);
    t += 15 * 60_000;
  }
  return new Date(t);
}

export type BusinessStatus = 'open' | 'after_hours' | 'weekend_closed';

export function businessStatus(a: AccountContext, now: Date): BusinessStatus {
  const p = localParts(now, a.timezone);
  const weekend = p.weekday === 0 || p.weekday === 6;
  if (weekend && !a.worksWeekends) return 'weekend_closed';
  const m = p.hour * 60 + p.minute;
  return m >= toMinutes(a.officeOpen) && m < toMinutes(a.officeClose) ? 'open' : 'after_hours';
}

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

export function dayPart(d: Date, tz: string): DayPart {
  const h = localParts(d, tz).hour;
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

export function formatLocalTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', hour: 'numeric', minute: '2-digit' })
    .format(d).replace(',', '');
}
