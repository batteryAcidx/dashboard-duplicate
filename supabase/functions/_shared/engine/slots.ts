import type { Slot } from './types.ts';
import { dayPart, localParts } from './timeutil.ts';

const clean = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ');

export function formatSlot(s: Slot, tz: string): string {
  const d = new Date(s.start);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(d);
  return clean(`${day} ${time}`);
}

export function formatSlotList(slots: Slot[], tz: string): string {
  return slots.map((s, i) => `${i + 1}) ${formatSlot(s, tz)}`).join(', ');
}

/** Offer a few real options that differ from each other (different day or part of day). */
export function pickSlots(all: Slot[], n: number, tz: string, exclude: Slot[] = []): Slot[] {
  const skip = new Set(exclude.map((s) => s.start));
  const pool = all.filter((s) => !skip.has(s.start)).sort((a, b) => a.start.localeCompare(b.start));
  const out: Slot[] = [];
  const seen = new Set<string>();
  for (const s of pool) {
    const d = new Date(s.start);
    const p = localParts(d, tz);
    const key = `${p.year}-${p.month}-${p.day}-${dayPart(d, tz)}`;
    if (!seen.has(key)) { seen.add(key); out.push(s); }
    if (out.length === n) return out;
  }
  for (const s of pool) {
    if (out.length === n) break;
    if (!out.includes(s)) out.push(s);
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

const DAYS: [RegExp, number][] = [
  [/\b(sun|sunday)\b/, 0], [/\b(mon|monday)\b/, 1], [/\b(tue|tues|tuesday)\b/, 2], [/\b(wed|weds|wednesday)\b/, 3],
  [/\b(thu|thur|thurs|thursday)\b/, 4], [/\b(fri|friday)\b/, 5], [/\b(sat|saturday)\b/, 6],
];
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b|\b(?:at|around|about)\s+(\d{1,2})(?::(\d{2}))?\b/;

function wantedMinutes(t: string): number | null {
  const m = t.match(TIME_RE);
  if (!m) return null;
  let h: number; let min: number; let ap: string | undefined;
  if (m[1] !== undefined) { h = +m[1]; min = +(m[2] ?? 0); ap = m[3]?.replace(/\./g, ''); }
  else { h = +m[4]; min = +(m[5] ?? 0); ap = undefined; }
  if (h > 12 || min > 59) return null;
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (!ap && h >= 1 && h <= 6) h += 12; // "at 2" in a roofing context means afternoon
  return h * 60 + min;
}

export interface SlotMatch { slot: Slot | null; ambiguous: boolean; cues: boolean }

export function hasTimeCues(raw: string): boolean {
  const t = raw.toLowerCase();
  return DAYS.some(([re]) => re.test(t)) || /\b(today|tomorrow|morning|afternoon|evening)\b/.test(t) || TIME_RE.test(t);
}

/** Work out which offered time a homeowner chose from their reply. */
export function matchSlotChoice(raw: string, offered: Slot[], tz: string, now: Date = new Date()): SlotMatch {
  const t = raw.toLowerCase().replace(/[’‘]/g, "'").trim();
  if (offered.length === 0) return { slot: null, ambiguous: false, cues: hasTimeCues(t) };

  // a bare number or an ordinal ("2", "option 2", "the second one")
  const bare = t.match(/^(?:option\s*|number\s*|#)?\s*([1-9])\s*(?:[).!]|please|thanks|works|is good)?\s*$/);
  if (bare && +bare[1] <= offered.length) return { slot: offered[+bare[1] - 1], ambiguous: false, cues: true };
  const ord = /\b(1st|first)\b/.test(t) ? 0 : /\b(2nd|second)\b/.test(t) ? 1 : /\b(3rd|third)\b/.test(t) ? 2 : -1;
  if (ord >= 0 && ord < offered.length) return { slot: offered[ord], ambiguous: false, cues: true };

  // a plain yes to a single offered time
  if (/^(yes|yeah|yep|sure|ok|okay|that works|sounds good|works for me|perfect|book it)[.! ]*$/.test(t)) {
    return offered.length === 1
      ? { slot: offered[0], ambiguous: false, cues: true }
      : { slot: null, ambiguous: true, cues: true };
  }

  // day, time or part of day
  const hits = filterSlotsByCues(t, offered, tz, now);
  if (hits === null) return { slot: null, ambiguous: false, cues: false };
  if (hits.length === 1) return { slot: hits[0], ambiguous: false, cues: true };
  return { slot: null, ambiguous: hits.length > 1, cues: true };
}

/** Slots that fit a day, time or part of day mentioned in the text. null means the text had no such cues. */
export function filterSlotsByCues(raw: string, slots: Slot[], tz: string, now: Date = new Date()): Slot[] | null {
  const t = raw.toLowerCase().replace(/[’‘]/g, "'").trim();
  const wantDays = DAYS.filter(([re]) => re.test(t)).map(([, n]) => n);
  const wantMin = wantedMinutes(t);
  const part = /\bmorning\b/.test(t) ? 'morning' : /\bafternoon\b/.test(t) ? 'afternoon' : /\bevening\b/.test(t) ? 'evening' : null;
  const today = /\btoday\b/.test(t);
  const tomorrow = /\btomorrow\b/.test(t);
  if (!wantDays.length && wantMin === null && !part && !today && !tomorrow) return null;

  const nowP = localParts(now, tz);
  const tomorrowDow = (nowP.weekday + 1) % 7;
  return slots.filter((s) => {
    const d = new Date(s.start);
    const p = localParts(d, tz);
    if (wantDays.length && !wantDays.includes(p.weekday)) return false;
    if (today && !(p.year === nowP.year && p.month === nowP.month && p.day === nowP.day)) return false;
    if (tomorrow && p.weekday !== tomorrowDow) return false;
    if (wantMin !== null && p.hour * 60 + p.minute !== wantMin) return false;
    if (part && dayPart(d, tz) !== part) return false;
    return true;
  });
}
