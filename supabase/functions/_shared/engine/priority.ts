import type { Collected, Signals, Urgency, WeatherFacts } from './types.ts';

const RANK: Record<Urgency, number> = { emergency: 0, urgent: 1, normal: 2 };

export function urgencyRank(u: Urgency): number { return RANK[u]; }
export function maxUrgency(a: Urgency, b: Urgency): Urgency { return RANK[a] <= RANK[b] ? a : b; }

export function leakish(issue?: string): boolean {
  return !!issue && /\b(leak\w*|drip\w*|water|wet|stain\w*)\b/i.test(issue);
}

/**
 * The tier that sorts the owner's list. Rules, not AI, so the promise is predictable:
 *   emergency: danger, water coming in, structural damage, or an active leak
 *   urgent:    storm damage, an insurance claim, a leak that has stopped, or any damage during a storm
 *   normal:    everything else
 */
export function computeUrgency(
  c: Collected, s: Signals, weather: WeatherFacts,
): { urgency: Urgency; reason: string } {
  if (s.danger) return { urgency: 'emergency', reason: 'Safety hazard mentioned' };
  if (s.emergencyIssue) return { urgency: 'emergency', reason: 'Damage or water entering the home' };
  if (c.active_now === true && leakish(c.issue)) return { urgency: 'emergency', reason: 'Active leak right now' };

  if (c.job_type === 'storm_damage') return { urgency: 'urgent', reason: 'Storm damage' };
  if (c.payment === 'insurance') return { urgency: 'urgent', reason: 'Insurance claim' };
  if (weather.stormMode && c.issue) return { urgency: 'urgent', reason: 'Damage reported during recent storms' };
  if (leakish(c.issue)) return { urgency: 'urgent', reason: 'Leak reported' };
  if (c.commercial) return { urgency: 'urgent', reason: 'Commercial job' };
  return { urgency: 'normal', reason: 'Routine request' };
}
