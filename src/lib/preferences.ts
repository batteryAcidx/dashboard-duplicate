// Small settings kept in this browser (not in the database).

export const REFRESH_CHOICES: [number, string][] = [
  [0, 'Off'],
  [30, 'Every 30 seconds'],
  [60, 'Every minute'],
  [300, 'Every 5 minutes'],
];

const REFRESH_KEY = 'ws_admin_refresh';

export function getRefreshSeconds(storage?: Pick<Storage, 'getItem'>): number {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    const raw = s?.getItem(REFRESH_KEY);
    const n = raw === null || raw === undefined ? 60 : Number(raw);
    return REFRESH_CHOICES.some(([v]) => v === n) ? n : 60;
  } catch {
    return 60;
  }
}

export function setRefreshSeconds(n: number, storage?: Pick<Storage, 'setItem'>): void {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    s?.setItem(REFRESH_KEY, String(n));
  } catch {
    /* a browser that blocks storage simply keeps the default */
  }
}


/* ---- which steps of a set-up guide you have ticked off (kept in this browser only) ---- */

const guideKey = (id: string) => `ws_guide_${id}`;

export function getGuideProgress(id: string, storage?: Pick<Storage, 'getItem'>): number[] {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    const raw = s?.getItem(guideKey(id));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isInteger(n) && n >= 0) : [];
  } catch {
    return [];
  }
}

export function setGuideProgress(id: string, done: number[], storage?: Pick<Storage, 'setItem'>): void {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    s?.setItem(guideKey(id), JSON.stringify([...new Set(done)].sort((a, b) => a - b)));
  } catch {
    /* a browser that blocks storage simply forgets the ticks */
  }
}
