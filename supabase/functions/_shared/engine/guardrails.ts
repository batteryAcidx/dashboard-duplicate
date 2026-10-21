import type { Goal, Slot, WeatherFacts } from './types.ts';
import { formatSlot } from './slots.ts';

// The last line of defence. Whatever the model writes is checked here before it can reach a homeowner.
// A failed check never blocks the conversation: the caller falls back to a fixed template message.

export interface GuardInput {
  text: string;
  goal: Goal;
  business: string;
  tz: string;
  weather: WeatherFacts;
  userText?: string;
  isFirstMessage?: boolean;
  requireStop?: boolean;
  offered?: Slot[];
  allow911?: boolean;
  maxQuestions?: number;
}

export interface GuardResult { ok: boolean; reasons: string[]; text: string }

export function normalizeText(t: string): string {
  return t
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...')
    .replace(/[\u202f\u00a0]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function trimToLimit(t: string, max = 320): string {
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return end > 120 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '').replace(/[,;:]$/, '') + '.';
}

const PRICE = /\$|\bdollars?\b|\bbucks\b|\b\d[\d,]*\s?(k|grand)\b|\b(costs?|prices?|charge[sd]?)\b[^.?!]{0,30}\d/i;
const COVERAGE = /\b(will|would|should|can|could)\b[^.?!]{0,25}\b(be )?(covered|cover|paid for|approved)\b|\binsurance (will|should|would)\b|\bguarantee(d|s)?\b|\bpromise\b|\bfully covered\b/i;
const DIY = /\b(breaker|circuit|fuse box|turn off|shut off|unplug|ladder|climb|tarp|bucket|duct tape|patch it|sealant|caulk)\b/i;
const HUMAN = /\b(i am|i'm|this is) (a )?(human|real person|actual person)\b/i;
const WEATHER_WORDS = /\b(hail|tornado|storms?|thunderstorms?|winds?|flood(ing|ed)?|rain|snow|ice|hurricane|derecho|blizzard)\b/gi;
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b/gi;

function normTime(h: string, m: string | undefined, ap: string): string {
  return `${+h}:${m ?? '00'} ${ap.toLowerCase()}`;
}

export function guardOutput(inp: GuardInput): GuardResult {
  const text = normalizeText(inp.text ?? '');
  const reasons: string[] = [];
  const lower = text.toLowerCase();

  if (!text) reasons.push('empty');
  if (/\p{Extended_Pictographic}/u.test(text)) reasons.push('emoji');
  if (PRICE.test(text)) reasons.push('price');
  if (COVERAGE.test(text)) reasons.push('coverage_or_promise');
  if (DIY.test(text)) reasons.push('repair_advice');
  if (HUMAN.test(text)) reasons.push('claims_human');
  if (!inp.allow911 && /\b911\b/.test(text)) reasons.push('unneeded_911');
  if (text.length > 320) reasons.push('too_long');

  const questions = (text.match(/\?/g) ?? []).length;
  if (questions > (inp.maxQuestions ?? 1)) reasons.push('too_many_questions');

  // weather: only claims that appear in the weather facts or in what the homeowner wrote
  const stem = (w: string) => w.toLowerCase().replace(/(ing|ed|es|s)$/, '');
  const allowed = new Set(((`${inp.weather.facts.join(' ')} ${inp.userText ?? ''}`).toLowerCase().match(/[a-z]+/g) ?? []).map(stem));
  if (inp.weather.stormMode) { allowed.add('storm'); allowed.add('thunderstorm'); }
  for (const w of lower.match(WEATHER_WORDS) ?? []) {
    if (!allowed.has(stem(w))) { reasons.push('unsupported_weather'); break; }
  }

  // times: for booking goals, every time mentioned must be one that was really offered
  if ((inp.goal === 'offer_slots' || inp.goal === 'confirm_booking' || inp.goal === 'confirm_reschedule'
       || inp.goal === 'confirm_cancel' || inp.goal === 'keep_appointment') && inp.offered) {
    const ok = new Set<string>();
    for (const s of inp.offered) {
      const m = formatSlot(s, inp.tz).match(/(\d{1,2}):(\d{2})\s?(AM|PM)/i);
      if (m) ok.add(normTime(m[1], m[2], m[3]));
    }
    for (const m of text.matchAll(TIME_RE)) {
      if (!ok.has(normTime(m[1], m[2], m[3]))) { reasons.push('unoffered_time'); break; }
    }
  }

  if (inp.isFirstMessage && !lower.includes(inp.business.toLowerCase())) reasons.push('missing_business_name');
  if (inp.requireStop && !/\bstop\b/i.test(text)) reasons.push('missing_stop_language');

  return { ok: reasons.length === 0, reasons, text };
}
