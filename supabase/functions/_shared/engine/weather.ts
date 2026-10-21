import type { WeatherFacts } from './types.ts';
import { localParts } from './timeutil.ts';

// Weather context from the National Weather Service (US, free open data).
// It is fetched for the client's SERVICE AREA coordinates on a schedule. A homeowner's address is never sent.

export interface RawAlert {
  id: string;
  event: string;
  severity?: string | null;
  headline?: string | null;
  ends?: string | null;      // ISO, when the alert ends or expires
}

export interface AlertHistoryItem {
  id: string;
  event: string;
  firstSeen: string;
  lastSeen: string;
  ends?: string | null;
}

const ROOF_EVENTS = [
  /severe thunderstorm/i, /tornado/i, /high wind/i, /extreme wind/i, /hurricane/i, /tropical storm/i,
  /flash flood/i, /flood warning/i, /winter storm/i, /ice storm/i, /blizzard/i, /hail/i, /derecho/i,
];

export function isRoofRelevant(event: string): boolean {
  return ROOF_EVENTS.some((re) => re.test(event));
}

export function normalizeNwsAlerts(json: unknown): RawAlert[] {
  const feats = (json as { features?: { properties?: Record<string, unknown> }[] })?.features;
  if (!Array.isArray(feats)) return [];
  const out: RawAlert[] = [];
  for (const f of feats) {
    const p = f?.properties;
    if (!p || typeof p.event !== 'string') continue;
    out.push({
      id: String(p.id ?? `${p.event}-${p.onset ?? p.sent ?? ''}`),
      event: p.event,
      severity: (p.severity as string) ?? null,
      headline: (p.headline as string) ?? null,
      ends: ((p.ends ?? p.expires) as string) ?? null,
    });
  }
  return out;
}

/** Fetch active alerts for a point. `fetchImpl` is injectable so tests never touch the network. */
export async function fetchNwsAlerts(
  lat: number, lon: number, userAgent: string, fetchImpl: typeof fetch = fetch,
): Promise<RawAlert[]> {
  const url = `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`;
  const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent, Accept: 'application/geo+json' } });
  if (!res.ok) throw new Error(`NWS ${res.status}`);
  return normalizeNwsAlerts(await res.json());
}

const HOURS_72 = 72 * 3600_000;

/** Keep the last 72 hours of alerts we have seen, so "storm yesterday" can be known after it ends. */
export function updateHistory(prev: AlertHistoryItem[], current: RawAlert[], now: Date): AlertHistoryItem[] {
  const map = new Map<string, AlertHistoryItem>();
  for (const h of prev) map.set(h.id, h);
  for (const a of current) {
    const old = map.get(a.id);
    map.set(a.id, {
      id: a.id, event: a.event, firstSeen: old?.firstSeen ?? now.toISOString(),
      lastSeen: now.toISOString(), ends: a.ends ?? old?.ends ?? null,
    });
  }
  return [...map.values()].filter((h) => now.getTime() - new Date(h.lastSeen).getTime() <= HOURS_72);
}

function localTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' })
    .format(new Date(iso)).replace(/[\u202f\u00a0]/g, ' ');
}

function ago(from: Date, now: Date): string {
  const h = Math.max(1, Math.round((now.getTime() - from.getTime()) / 3600_000));
  if (h < 24) return `about ${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

/** Plain facts the model may use. If it is not in this list, the model may not claim it. */
export function buildWeatherFacts(
  active: RawAlert[], history: AlertHistoryItem[], now: Date, tz: string,
): WeatherFacts {
  const facts: string[] = [];
  const activeIds = new Set(active.map((a) => a.id));

  for (const a of active.filter((x) => isRoofRelevant(x.event)).slice(0, 2)) {
    facts.push(a.ends
      ? `A ${a.event} is in effect for the area until ${localTime(a.ends, tz)}.`
      : `A ${a.event} is in effect for the area.`);
  }
  const recent = history
    .filter((h) => isRoofRelevant(h.event) && !activeIds.has(h.id))
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
    .slice(0, 2);
  for (const h of recent) {
    const endedAt = new Date(h.ends && new Date(h.ends) < now ? h.ends : h.lastSeen);
    facts.push(`A ${h.event} affected the area ${ago(endedAt, now)}.`);
  }
  if (facts.length === 0) return { stormMode: false, facts };

  let storm: WeatherFacts['storm'];
  if (active.some((a) => isRoofRelevant(a.event))) storm = 'now';
  else if (recent.length > 0) {
    const h = recent[0];
    const endedAt = new Date(h.ends && new Date(h.ends) < now ? h.ends : h.lastSeen);
    const hoursAgo = (now.getTime() - endedAt.getTime()) / 3600_000;
    const endedHour = localParts(endedAt, tz).hour;
    if (hoursAgo < 6) storm = 'earlier';
    else if (hoursAgo < 18 && (endedHour >= 17 || endedHour < 5)) storm = 'last_night';
    else if (hoursAgo < 48) storm = 'yesterday';
    else storm = 'days_ago';
  }
  return { stormMode: true, storm, facts };
}
