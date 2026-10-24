// Turning numbers and times into the words people read. Pure: no network, no browser.

/** 69700 becomes "$697". 69750 becomes "$697.50". Credits show as "-$697". */
export function centsToDollars(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const body = `$${whole.toLocaleString('en-US')}${frac ? '.' + String(frac).padStart(2, '0') : ''}`;
  return neg ? `-${body}` : body;
}

/** "697", "$697.50" or "-697" become cents. Returns null for anything else. */
export function dollarsToCents(text: string): number | null {
  const t = text.replace(/[$,\s]/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Math.round(Number(t) * 100);
  return Math.abs(n) <= 10_000_000 ? n : null;
}

export function percent(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : '—';
}

export function formatDuration(seconds: number): string {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : s ? `${m}m ${s}s` : `${m}m`;
}

/* ---------------------------------------------------------------- staying in sync */

export function relativeTime(at: number | string | null | undefined, now: number = Date.now()): string {
  if (at === null || at === undefined) return 'Never';
  const t = typeof at === 'number' ? at : new Date(at).getTime();
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/* ---------------------------------------------------------------- Stripe */


/** "Marcus Brooks" becomes "MB", one name gives one letter, and a number with no name gives "#". */
export function initialsOf(name: string | null | undefined): string {
  const letters = (name ?? '')
    .trim()
    .split(/\s+/)
    .map((p) => p.match(/[A-Za-z]/)?.[0] ?? '')
    .filter(Boolean);
  if (letters.length === 0) return '#';
  return (letters.length === 1 ? letters[0] : letters[0] + letters[letters.length - 1]).toUpperCase();
}
