// Turn a date and time typed in the account's own time zone into a real moment in time.

function offsetMinutes(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(utcMs));
  const o: Record<string, number> = {};
  for (const p of parts) if (p.type !== 'literal') o[p.type] = parseInt(p.value, 10);
  const asUtc = Date.UTC(o.year, o.month - 1, o.day, o.hour % 24, o.minute, o.second);
  return Math.round((asUtc - utcMs) / 60000);
}

/** '2026-10-21' and '09:30' in 'America/Chicago' become the matching UTC moment. */
export function zonedToUtc(date: string, time: string, tz: string): Date | null {
  const d = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = time.match(/^(\d{2}):(\d{2})$/);
  if (!d || !t) return null;
  const guess = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  const off1 = offsetMinutes(guess, tz);
  let result = guess - off1 * 60000;
  const off2 = offsetMinutes(result, tz);
  if (off2 !== off1) result = guess - off2 * 60000;
  return new Date(result);
}

export function formatBlock(startIso: string, endIso: string, tz: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const day = (x: Date) => x.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });
  const time = (x: Date) => x.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
  const sameDay = s.toLocaleDateString('en-CA', { timeZone: tz }) === e.toLocaleDateString('en-CA', { timeZone: tz });
  return sameDay ? `${day(s)}, ${time(s)} to ${time(e)}` : `${day(s)} ${time(s)} to ${day(e)} ${time(e)}`;
}
