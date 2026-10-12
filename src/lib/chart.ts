export type WindowKey = '24h' | '7d' | '30d';

export interface ChartBucket {
  key: string;
  label: string;
  title: string;
  captured: number;
  booked: number;
  showLabel: boolean;
}

export interface ChartData {
  buckets: ChartBucket[];
  top: number;
  unit: 'hour' | 'day';
  totalCaptured: number;
  totalBooked: number;
}

interface ChartRow {
  status: string;
  missed_call_at: string | null;
  created_at: string;
  appointments: { status: string }[];
}

const pad = (n: number) => String(n).padStart(2, '0');

const dayKeyOf = (d: Date, tz: string) => d.toLocaleDateString('en-CA', { timeZone: tz });

const hourOf = (d: Date, tz: string): number => {
  const part = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: tz })
    .formatToParts(d)
    .find((p) => p.type === 'hour');
  return part ? parseInt(part.value, 10) % 24 : 0;
};

const hour12 = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? 'PM' : 'AM'}`;

// n calendar days back from a YYYY-MM-DD key, with no time zone arithmetic
const shiftKey = (key: string, backDays: number): string => {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - backDays));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

const dateOfKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
};

export function buildChart(rows: ChartRow[], windowKey: WindowKey, tz: string): ChartData {
  const now = Date.now();
  const unit: 'hour' | 'day' = windowKey === '24h' ? 'hour' : 'day';
  const buckets: ChartBucket[] = [];
  const index = new Map<string, ChartBucket>();
  const add = (b: ChartBucket) => {
    buckets.push(b);
    index.set(b.key, b);
  };

  if (unit === 'hour') {
    const seen = new Set<string>();
    const found: { key: string; hour: number; dayKey: string }[] = [];
    for (let i = 0; found.length < 24 && i < 30; i++) {
      const d = new Date(now - i * 3600000);
      const dayKey = dayKeyOf(d, tz);
      const hour = hourOf(d, tz);
      const key = `${dayKey}-${pad(hour)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ key, hour, dayKey });
    }
    found.reverse().forEach(({ key, hour, dayKey }) => {
      const weekday = dateOfKey(dayKey).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
      add({
        key,
        label: hour12(hour),
        title: `${weekday} ${hour12(hour)}`,
        captured: 0,
        booked: 0,
        showLabel: hour % 6 === 0,
      });
    });
  } else {
    const n = windowKey === '7d' ? 7 : 30;
    const today = dayKeyOf(new Date(now), tz);
    for (let i = n - 1; i >= 0; i--) {
      const key = shiftKey(today, i);
      const date = dateOfKey(key);
      const weekday = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
      const md = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      add({
        key,
        label: n === 7 ? weekday : md,
        title: `${weekday}, ${md}`,
        captured: 0,
        booked: 0,
        showLabel: n === 7 ? true : i % 6 === 0,
      });
    }
  }

  for (const r of rows) {
    if (r.status === 'not_a_lead') continue;
    const at = new Date(r.missed_call_at || r.created_at);
    const key = unit === 'hour' ? `${dayKeyOf(at, tz)}-${pad(hourOf(at, tz))}` : dayKeyOf(at, tz);
    const b = index.get(key);
    if (!b) continue;
    b.captured += 1;
    if (r.status !== 'lost' && r.appointments.some((a) => a.status !== 'cancelled')) b.booked += 1;
  }

  const max = buckets.reduce((m, b) => Math.max(m, b.captured), 0);
  let top = Math.max(2, max);
  if (top % 2) top += 1;

  return {
    buckets,
    top,
    unit,
    totalCaptured: buckets.reduce((s, b) => s + b.captured, 0),
    totalBooked: buckets.reduce((s, b) => s + b.booked, 0),
  };
}