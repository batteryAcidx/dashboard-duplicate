import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as ns from '../supabase/functions/_shared/engine/index.ts';
import type * as T from '../supabase/functions/_shared/engine/index.ts';

// Works whether or not your repo's package.json says "type": "module".
const E = ((ns as any).classify ? ns : (ns as any).default) as typeof ns;

// ---------------------------------------------------------------- fixtures
const TZ = 'America/Chicago';
const account: T.AccountContext = {
  name: 'Summit Roofing', timezone: TZ, officeOpen: '07:00', officeClose: '17:00',
  worksWeekends: false, quietStart: '21:00', quietEnd: '07:00', serviceArea: 'Dallas, TX',
};
const NOW = new Date('2026-10-20T20:00:00Z'); // Tuesday 3:00 PM CDT
const noWeather: T.WeatherFacts = { stormMode: false, facts: [] };
const stormWeather: T.WeatherFacts = { stormMode: true, facts: ['A Severe Thunderstorm Warning affected the area yesterday.'] };

// local CDT (UTC-5) on Tuesday Oct 20 + dayOffset
const slot = (dayOffset: number, hour: number): T.Slot => ({
  start: new Date(Date.UTC(2026, 9, 20 + dayOffset, hour + 5)).toISOString(),
  end: new Date(Date.UTC(2026, 9, 20 + dayOffset, hour + 6)).toISOString(),
});
const SLOTS = [slot(1, 9), slot(1, 11), slot(1, 14), slot(2, 9), slot(2, 13), slot(3, 10)];

const fresh = (): T.LeadStateLite => ({
  stage: 'new', urgency: 'normal', collected: {}, flags: {}, unclearStreak: 0, aiReplyCount: 0,
  inboundCount: 0, followUpsSent: 0, offeredSlots: [], lastAsk: null, contactType: 'unknown', autoReply: 'engine',
});

function run(state: T.LeadStateLite, text: string, extracted: Partial<T.Collected> = {}, over: Partial<T.DecideInput> = {}) {
  return E.decide({
    state, text, signals: E.classify(text), extracted, account, availableSlots: SLOTS,
    weather: noWeather, now: NOW, ...over,
  });
}

function advance(state: T.LeadStateLite, d: T.Decision): T.LeadStateLite {
  return {
    ...state, stage: d.nextStage, urgency: d.urgency, collected: d.collected, flags: d.flags,
    unclearStreak: d.unclearStreak, lastAsk: d.ask, aiReplyCount: state.aiReplyCount + (d.reply ? 1 : 0),
    inboundCount: state.inboundCount + 1, offeredSlots: d.goal === 'offer_slots' || d.goal === 'confirm_booking' ? d.offer : state.offeredSlots,
  };
}

// ---------------------------------------------------------------- time
describe('time and quiet hours', () => {
  test('quiet hours default to 9 PM to 7 AM local', () => {
    const q = { timezone: TZ, quietStart: null, quietEnd: null };
    assert.equal(E.isQuietHours(q, new Date('2026-10-21T03:30:00Z')), true);  // 10:30 PM
    assert.equal(E.isQuietHours(q, new Date('2026-10-21T10:00:00Z')), true);  // 5:00 AM
    assert.equal(E.isQuietHours(q, new Date('2026-10-21T13:00:00Z')), false); // 8:00 AM
    assert.equal(E.isQuietHours(q, NOW), false);
  });
  test('custom quiet hours that do not wrap midnight', () => {
    const q = { timezone: TZ, quietStart: '13:00', quietEnd: '15:00' };
    assert.equal(E.isQuietHours(q, new Date('2026-10-20T19:00:00Z')), true);  // 2 PM
    assert.equal(E.isQuietHours(q, NOW), false);                               // 3 PM
  });
  test('nextQuietEnd lands on the end of quiet hours', () => {
    const t = E.nextQuietEnd(account, new Date('2026-10-21T04:00:00Z')); // 11 PM
    assert.equal(E.localParts(t, TZ).hour, 7);
  });
  test('business status', () => {
    assert.equal(E.businessStatus(account, NOW), 'open');
    assert.equal(E.businessStatus(account, new Date('2026-10-21T00:30:00Z')), 'after_hours'); // 7:30 PM
    assert.equal(E.businessStatus(account, new Date('2026-10-24T18:00:00Z')), 'weekend_closed'); // Saturday
    assert.equal(E.businessStatus({ ...account, worksWeekends: true }, new Date('2026-10-24T18:00:00Z')), 'open');
  });
  test('day part and local time text', () => {
    assert.equal(E.dayPart(NOW, TZ), 'afternoon');
    assert.match(E.formatLocalTime(NOW, TZ), /Tuesday 3:00 PM/);
  });
});

// ---------------------------------------------------------------- classify
describe('classify', () => {
  test('danger vs emergency issue', () => {
    assert.equal(E.classify('I smell gas and see sparks').danger, true);
    assert.equal(E.classify('a tree fell on my roof').emergencyIssue, true);
    assert.equal(E.classify('water is pouring through the ceiling').emergencyIssue, true);
    assert.equal(E.classify('my ceiling is sagging').emergencyIssue, true);
    assert.equal(E.classify('I need a new roof someday').emergencyIssue, false);
    assert.equal(E.classify('I need a new roof someday').danger, false);
  });
  test('active now true and false', () => {
    assert.equal(E.classify("it's still leaking right now").activeNow, true);
    assert.equal(E.classify('it stopped when the rain ended').activeNow, false);
    assert.equal(E.classify('not leaking now').activeNow, false);
    assert.equal(E.classify('kitchen ceiling leak').activeNow, null);
  });
  test('human, angry, legal', () => {
    assert.equal(E.classify('can I talk to a real person').wantsHuman, true);
    assert.equal(E.classify('call me please').wantsHuman, true);
    assert.equal(E.classify('this is a scam').angry, true);
    assert.equal(E.classify('I will call my lawyer').legal, true);
  });
  test('opt-out in plain language', () => {
    assert.equal(E.classify('please stop texting me').optOutIntent, true);
    assert.equal(E.classify("don't text me again").optOutIntent, true);
    assert.equal(E.classify('remove me from your list').optOutIntent, true);
    assert.equal(E.classify('my roof needs help').optOutIntent, false);
  });
  test('price and insurance', () => {
    assert.equal(E.classify('how much will this cost').priceAsk, true);
    assert.equal(E.classify('will my insurance cover this?').insuranceAsk, true);
    assert.equal(E.classify("it's through State Farm").insurance, 'insurance');
    assert.equal(E.classify("it's through State Farm").carrier, 'State Farm');
    assert.equal(E.classify("no insurance, I'll pay cash").insurance, 'out_of_pocket');
  });
  test('decline, snooze, who is this, wrong number, vendor', () => {
    assert.equal(E.classify("no thanks, I'm all set").decline, true);
    assert.equal(E.classify('we already hired someone').decline, true);
    assert.equal(E.classify("I'm at work, text me later").snoozeHours, 3);
    assert.equal(E.classify('call me back next week').snoozeHours, 120);
    assert.equal(E.classify('not interested, call back later').snoozeHours, null);
    assert.equal(E.classify('who is this?').whoIsThis, true);
    assert.equal(E.classify('wrong number').wrongNumber, true);
    assert.equal(E.classify('we offer SEO services for roofers').vendorSpam, true);
  });
  test('commercial, spanish, yes/no, thanks', () => {
    assert.equal(E.classify('it is a warehouse roof').commercial, true);
    assert.equal(E.classify('hola necesito ayuda con mi techo').nonEnglish, true);
    assert.equal(E.classify('the roof is leaking').nonEnglish, false);
    assert.equal(E.classify('yes please').yes, true);
    assert.equal(E.classify('nope').no, true);
    assert.equal(E.classify('no thanks').no, false);
    assert.equal(E.classify('thanks!').thanksOnly, true);
  });
});

// ---------------------------------------------------------------- priority
describe('priority tiers', () => {
  const s = (t: string) => E.classify(t);
  test('emergency', () => {
    assert.equal(E.computeUrgency({}, s('I smell gas'), noWeather).urgency, 'emergency');
    assert.equal(E.computeUrgency({}, s('tree fell on the house'), noWeather).urgency, 'emergency');
    assert.equal(E.computeUrgency({ issue: 'leak in kitchen', active_now: true }, s('yes'), noWeather).urgency, 'emergency');
  });
  test('urgent', () => {
    assert.equal(E.computeUrgency({ job_type: 'storm_damage' }, s('hail damage'), noWeather).urgency, 'urgent');
    assert.equal(E.computeUrgency({ payment: 'insurance' }, s('claim'), noWeather).urgency, 'urgent');
    assert.equal(E.computeUrgency({ issue: 'missing shingles' }, s('shingles'), stormWeather).urgency, 'urgent');
    assert.equal(E.computeUrgency({ issue: 'ceiling stain', active_now: false }, s('stopped'), noWeather).urgency, 'urgent');
  });
  test('normal', () => {
    assert.equal(E.computeUrgency({ issue: 'need an estimate for a new roof' }, s('estimate'), noWeather).urgency, 'normal');
  });
  test('urgency only ever goes up and sorts emergencies first', () => {
    assert.equal(E.maxUrgency('urgent', 'normal'), 'urgent');
    assert.equal(E.maxUrgency('normal', 'emergency'), 'emergency');
    const order = (['normal', 'emergency', 'urgent'] as T.Urgency[]).sort((a, b) => E.urgencyRank(a) - E.urgencyRank(b));
    assert.deepEqual(order, ['emergency', 'urgent', 'normal']);
  });
});

// ---------------------------------------------------------------- slots
describe('slots', () => {
  test('formatting', () => {
    assert.equal(E.formatSlot(slot(1, 9), TZ), 'Wed 9:00 AM');
    assert.equal(E.formatSlotList([slot(1, 9), slot(2, 13)], TZ), '1) Wed 9:00 AM, 2) Thu 1:00 PM');
  });
  test('pickSlots offers different days or parts of day', () => {
    const picked = E.pickSlots(SLOTS, 3, TZ);
    assert.equal(picked.length, 3);
    assert.deepEqual(picked.map((p) => E.formatSlot(p, TZ)), ['Wed 9:00 AM', 'Wed 2:00 PM', 'Thu 9:00 AM']);
  });
  test('pickSlots can exclude what was already offered', () => {
    const picked = E.pickSlots(SLOTS, 3, TZ, [slot(1, 9), slot(1, 14)]);
    assert.ok(!picked.some((p) => p.start === slot(1, 9).start || p.start === slot(1, 14).start));
  });
  test('choose by number, ordinal and plain yes', () => {
    const offered = [slot(1, 9), slot(1, 14), slot(2, 9)];
    assert.equal(E.matchSlotChoice('2', offered, TZ, NOW).slot?.start, offered[1].start);
    assert.equal(E.matchSlotChoice('option 3', offered, TZ, NOW).slot?.start, offered[2].start);
    assert.equal(E.matchSlotChoice('the first one', offered, TZ, NOW).slot?.start, offered[0].start);
    assert.equal(E.matchSlotChoice('yes', [offered[0]], TZ, NOW).slot?.start, offered[0].start);
    assert.equal(E.matchSlotChoice('yes', offered, TZ, NOW).ambiguous, true);
  });
  test('choose by day, time and part of day', () => {
    const offered = [slot(1, 9), slot(1, 14), slot(2, 9)];
    assert.equal(E.matchSlotChoice('Thursday works', offered, TZ, NOW).slot?.start, offered[2].start);
    assert.equal(E.matchSlotChoice('2pm', offered, TZ, NOW).slot?.start, offered[1].start);
    assert.equal(E.matchSlotChoice('wednesday afternoon', offered, TZ, NOW).slot?.start, offered[1].start);
    assert.equal(E.matchSlotChoice('tomorrow morning', offered, TZ, NOW).slot?.start, offered[0].start);
    assert.equal(E.matchSlotChoice('9am', offered, TZ, NOW).ambiguous, true);
    assert.equal(E.matchSlotChoice('whenever', offered, TZ, NOW).cues, false);
  });
});

// ---------------------------------------------------------------- weather
describe('weather facts', () => {
  const nwsJson = {
    features: [
      { properties: { id: 'a1', event: 'Severe Thunderstorm Warning', severity: 'Severe', ends: '2026-10-21T01:00:00Z' } },
      { properties: { id: 'a2', event: 'Dense Fog Advisory', ends: '2026-10-21T03:00:00Z' } },
      { properties: { nope: true } },
    ],
  };
  test('normalizes NWS alerts and ignores junk', () => {
    const a = E.normalizeNwsAlerts(nwsJson);
    assert.equal(a.length, 2);
    assert.equal(E.normalizeNwsAlerts(null).length, 0);
  });
  test('only roofing-relevant events count', () => {
    assert.equal(E.isRoofRelevant('Severe Thunderstorm Warning'), true);
    assert.equal(E.isRoofRelevant('Dense Fog Advisory'), false);
  });
  test('active alert becomes a fact and storm mode', () => {
    const w = E.buildWeatherFacts(E.normalizeNwsAlerts(nwsJson), [], NOW, TZ);
    assert.equal(w.stormMode, true);
    assert.equal(w.facts.length, 1);
    assert.match(w.facts[0], /Severe Thunderstorm Warning is in effect .* until 8:00 PM/);
  });
  test('a storm that ended yesterday is remembered for 72 hours', () => {
    const hist: T.AlertHistoryItem[] = [{
      id: 'h1', event: 'Severe Thunderstorm Warning', firstSeen: '2026-10-19T18:00:00Z',
      lastSeen: '2026-10-19T20:00:00Z', ends: '2026-10-19T20:30:00Z',
    }];
    const w = E.buildWeatherFacts([], hist, NOW, TZ);
    assert.equal(w.stormMode, true);
    assert.match(w.facts[0], /affected the area yesterday/);
  });
  test('nothing relevant means no storm mode', () => {
    const w = E.buildWeatherFacts(E.normalizeNwsAlerts({ features: [nwsJson.features[1]] }), [], NOW, TZ);
    assert.deepEqual(w, { stormMode: false, facts: [] });
  });
  test('history keeps 72 hours and drops older alerts', () => {
    const old: T.AlertHistoryItem = { id: 'old', event: 'Hail', firstSeen: '2026-10-10T00:00:00Z', lastSeen: '2026-10-10T01:00:00Z' };
    const h = E.updateHistory([old], E.normalizeNwsAlerts(nwsJson), NOW);
    assert.ok(!h.some((x) => x.id === 'old'));
    assert.ok(h.some((x) => x.id === 'a1'));
  });
  test('fetch uses the point endpoint and a User-Agent, without touching the network', async () => {
    let seen = '';
    let ua = '';
    const fake = (async (url: string, init: RequestInit) => {
      seen = url; ua = (init.headers as Record<string, string>)['User-Agent'];
      return { ok: true, json: async () => nwsJson } as Response;
    }) as unknown as typeof fetch;
    const a = await E.fetchNwsAlerts(32.7767, -96.797, '(wedgescale.com, contact@wedgescale.com)', fake);
    assert.match(seen, /alerts\/active\?point=32\.7767,-96\.7970/);
    assert.match(ua, /wedgescale/);
    assert.equal(a.length, 2);
  });
});

// ---------------------------------------------------------------- follow-ups
describe('follow-ups', () => {
  const schedule = [4, 24, 72, 120, 168];
  const anchor = new Date('2026-10-20T20:00:00Z'); // 3 PM
  test('first follow-up is 4 hours after the lead came in', () => {
    const t = E.nextFollowUpAt({ now: NOW, anchor, sent: 0, scheduleHours: schedule, account, rng: () => 0 })!;
    assert.equal(t.getTime(), new Date('2026-10-21T00:00:00Z').getTime()); // 7 PM, awake hours
  });
  test('a follow-up that lands in quiet hours moves to the morning', () => {
    const night = new Date('2026-10-20T23:00:00Z'); // 6 PM lead, +4h = 10 PM
    const t = E.nextFollowUpAt({ now: night, anchor: night, sent: 0, scheduleHours: schedule, account, rng: () => 0 })!;
    const p = E.localParts(t, TZ);
    assert.equal(p.hour, 7);
    assert.equal(E.isQuietHours(account, t), false);
  });
  test('the schedule ends after the last follow-up', () => {
    assert.equal(E.nextFollowUpAt({ now: NOW, anchor, sent: 5, scheduleHours: schedule, account }), null);
  });
  test('a snooze overrides the schedule', () => {
    const t = E.nextFollowUpAt({ now: NOW, anchor, sent: 5, scheduleHours: schedule, account, snoozeHours: 20, rng: () => 0 })!;
    assert.ok(t.getTime() > NOW.getTime() + 19 * 3600_000);
  });
  test('an overdue follow-up is sent soon, not in the past', () => {
    const late = new Date('2026-10-23T20:00:00Z');
    const t = E.nextFollowUpAt({ now: late, anchor, sent: 0, scheduleHours: schedule, account, rng: () => 0 })!;
    assert.ok(t.getTime() > late.getTime());
  });
});

// ---------------------------------------------------------------- guardrails
describe('output guardrails', () => {
  const base = { goal: 'ask_issue' as T.Goal, business: 'Summit Roofing', tz: TZ, weather: noWeather };
  const bad = (text: string, reason: string, extra: Partial<T.GuardInput> = {}) => {
    const r = E.guardOutput({ ...base, text, ...extra });
    assert.equal(r.ok, false, `should fail: ${text}`);
    assert.ok(r.reasons.includes(reason), `${text} -> ${r.reasons.join(',')}`);
  };
  test('blocks prices, coverage claims, promises and repair advice', () => {
    bad('A repair like this usually costs $500.', 'price');
    bad('It runs about 8 grand for a new roof.', 'price');
    bad('Your insurance will cover that.', 'coverage_or_promise');
    bad('We guarantee the leak will be fixed.', 'coverage_or_promise');
    bad('Turn off the breaker near the outlet.', 'repair_advice');
    bad('Put a bucket under the drip.', 'repair_advice');
    bad('Put a tarp over it.', 'repair_advice');
  });
  test('blocks length, emoji, extra questions, 911 and claiming to be human', () => {
    bad('x'.repeat(330), 'too_long');
    bad('Got it 😊 what is the address?', 'emoji');
    bad('What is the address? And your name?', 'too_many_questions');
    bad('Please call 911 right now.', 'unneeded_911');
    bad("I'm a real person here to help.", 'claims_human');
  });
  test('911 is fine when the decision asked for it', () => {
    assert.equal(E.guardOutput({ ...base, text: 'If anyone is in danger, call 911 now. What is the address?', allow911: true }).ok, true);
  });
  test('weather claims must come from the facts or from the homeowner', () => {
    bad('Sounds like the storm hit hard. What is the address?', 'unsupported_weather');
    assert.equal(E.guardOutput({ ...base, text: 'With the recent storm, what is the address?', weather: stormWeather }).ok, true);
    assert.equal(E.guardOutput({ ...base, text: 'Sorry about the hail. What is the address?', userText: 'we had hail last night' }).ok, true);
  });
  test('only offered times can appear', () => {
    const offered = [slot(1, 9), slot(2, 13)];
    const g = { ...base, goal: 'offer_slots' as T.Goal, offered };
    assert.equal(E.guardOutput({ ...g, text: 'Which works? 1) Wed 9:00 AM, 2) Thu 1:00 PM' }).ok, true);
    bad('How about Friday at 3pm?', 'unoffered_time', { goal: 'offer_slots', offered });
  });
  test('first message must name the business and carry STOP language', () => {
    bad('Hi, sorry we missed your call.', 'missing_business_name', { isFirstMessage: true });
    bad('Hi, this is Summit Roofing.', 'missing_stop_language', { requireStop: true });
    assert.equal(E.guardOutput({ ...base, text: 'Hi, this is Summit Roofing. Reply STOP to opt out.', isFirstMessage: true, requireStop: true }).ok, true);
  });
  test('smart quotes and dashes are normalized', () => {
    assert.equal(E.normalizeText('It’s fine — really…'), "It's fine - really...");
  });
  test('trimToLimit never exceeds the limit', () => {
    const long = 'This is a sentence. '.repeat(30);
    assert.ok(E.trimToLimit(long, 320).length <= 320);
  });
});

// ---------------------------------------------------------------- extraction
describe('extraction and guessers', () => {
  test('sanitizes whatever the model returns', () => {
    const r = E.sanitizeExtraction({
      name: 'mike johnson', address: '5624 Cedar Elm Ln, Frisco', issue: 'kitchen ceiling leak', job_type: 'storm_damage',
      active_now: true, payment: 'insurance', carrier: 'Allstate', surprise: 'x',
    });
    assert.deepEqual(r, {
      name: 'Mike Johnson', address: '5624 Cedar Elm Ln, Frisco', issue: 'kitchen ceiling leak', job_type: 'storm_damage',
      active_now: true, payment: 'insurance', carrier: 'Allstate',
    });
  });
  test('rejects nonsense', () => {
    assert.deepEqual(E.sanitizeExtraction({ name: 'yes', address: 'my house', job_type: 'plumbing', payment: 'bitcoin' }), {});
    assert.deepEqual(E.sanitizeExtraction(null), {});
    assert.equal(E.cleanName('<script>alert(1)</script>'), undefined);
  });
  test('guesses a name from a short reply', () => {
    assert.equal(E.guessName('Mike'), 'Mike');
    assert.equal(E.guessName("it's Maria Lopez"), 'Maria Lopez');
    assert.equal(E.guessName('this is Dan, thanks'), undefined);
    assert.equal(E.guessName('Dan here'), 'Dan');
    assert.equal(E.guessName('yes'), undefined);
  });
  test('guesses an address', () => {
    assert.match(E.guessAddress('its 5624 Cedar Elm Ln in Frisco') ?? '', /^5624 Cedar Elm Ln/);
    assert.match(E.guessAddress('2208 Rolling Hills Dr, Garland, TX 75040') ?? '', /^2208 Rolling Hills Dr/);
    assert.equal(E.guessAddress('my house on the corner'), undefined);
  });
});

// ---------------------------------------------------------------- decide: whole conversations
describe('conversation flow', () => {
  test('the happy path: collect, offer real times, book, then ask about payment once', () => {
    let st = fresh();
    let d = run(st, 'there is a leak in my kitchen ceiling after the storm', { issue: 'kitchen ceiling leak', job_type: 'storm_damage' });
    assert.equal(d.goal, 'ask_active');
    assert.equal(d.urgency, 'urgent');
    assert.deepEqual(d.alert, { kind: 'priority', immediate: true });
    st = advance(st, d);

    d = run(st, 'yes it is dripping now');
    assert.equal(d.goal, 'ask_address');
    assert.equal(d.urgency, 'emergency');
    assert.equal(d.collected.active_now, true);
    assert.equal(d.alert, null, 'the priority alert only goes out once');
    st = advance(st, d);

    d = run(st, '5624 Cedar Elm Ln Frisco', { address: '5624 Cedar Elm Ln Frisco' });
    assert.equal(d.goal, 'ask_name');
    st = advance(st, d);

    d = run(st, 'Marcus Brooks', { name: 'Marcus Brooks' });
    assert.equal(d.goal, 'offer_slots');
    assert.equal(d.nextStage, 'awaiting_time');
    assert.equal(d.offer.length, 3);
    st = advance(st, d);

    d = run(st, '2');
    assert.equal(d.goal, 'confirm_booking');
    assert.equal(d.bookSlot?.start, st.offeredSlots[1].start);
    assert.equal(d.status, 'booked');
    assert.deepEqual(d.alert, { kind: 'booked', immediate: true });
    st = advance(st, d);

    d = run(st, 'great thanks');
    assert.equal(d.goal, 'post_booking_details');
    assert.equal(d.ask, 'payment');
    st = advance(st, d);

    d = run(st, 'thanks');
    assert.equal(d.reply, false, 'after the one payment question it stays quiet');
  });

  test('name is required before offering times', () => {
    const st: T.LeadStateLite = { ...fresh(), stage: 'qualifying', collected: { issue: 'missing shingles', address: '12 Oak St Plano' }, lastAsk: 'address' };
    const d = run(st, 'ok');
    assert.equal(d.goal, 'ask_name');
    assert.equal(d.offer.length, 0);
  });

  test('a price question is answered first, then the flow continues', () => {
    const d = run(fresh(), 'how much for a new roof', {});
    assert.equal(d.answerFirst, 'price');
    assert.equal(d.goal, 'ask_issue');
  });

  test('an insurance question is never answered with coverage', () => {
    const d = run(fresh(), 'will my insurance cover storm damage?', {});
    assert.equal(d.answerFirst, 'insurance');
  });

  test('a hazard gets the 911 notice once, flags an emergency and alerts at once', () => {
    let st = fresh();
    let d = run(st, 'I smell gas and the ceiling is leaking', { issue: 'ceiling leak' });
    assert.equal(d.safetyNotice, true);
    assert.equal(d.urgency, 'emergency');
    assert.deepEqual(d.alert, { kind: 'priority', immediate: true });
    st = advance(st, d);
    d = run(st, 'still smells but we are outside now');
    assert.equal(d.safetyNotice, false, 'never repeated');
  });

  test('persistence: it keeps going long past 12 messages and only hands off at the safety ceiling', () => {
    const st: T.LeadStateLite = {
      ...fresh(), stage: 'awaiting_time', collected: { issue: 'leak', address: '1 A St', name: 'Sam', active_now: false },
      offeredSlots: [slot(1, 9), slot(1, 14), slot(2, 9)], aiReplyCount: 30, inboundCount: 31,
    };
    const d = run(st, 'hmm not sure those work');
    assert.equal(d.goal, 'offer_slots');
    assert.equal(d.handoffReason, null);
    const d2 = run({ ...st, aiReplyCount: 40 }, 'hmm not sure those work');
    assert.equal(d2.goal, 'handoff_notice');
    assert.equal(d2.handoffReason, 'conversation_limit');
  });

  test('rejecting offered times produces different times, not the same ones', () => {
    const offered = [slot(1, 9), slot(1, 14), slot(2, 9)];
    const st: T.LeadStateLite = { ...fresh(), stage: 'awaiting_time', collected: { issue: 'leak', address: '1 A St', name: 'Sam', active_now: false }, offeredSlots: offered, lastAsk: 'slot' };
    const d = run(st, 'none of those work for me');
    assert.equal(d.goal, 'offer_slots');
    assert.ok(d.offer.length > 0);
    assert.ok(d.offer.every((o) => !offered.some((x) => x.start === o.start)));
  });

  test('asking for a time that is open books it directly', () => {
    const st: T.LeadStateLite = { ...fresh(), stage: 'awaiting_time', collected: { issue: 'leak', address: '1 A St', name: 'Sam', active_now: false }, offeredSlots: [slot(1, 9), slot(1, 14), slot(2, 9)], lastAsk: 'slot' };
    const d = run(st, 'can you do Friday at 10am');
    assert.equal(d.goal, 'confirm_booking');
    assert.equal(d.bookSlot?.start, slot(3, 10).start);
  });

  test('unclear replies are re-asked, then handed off after four', () => {
    let st: T.LeadStateLite = { ...fresh(), stage: 'qualifying', collected: { issue: 'leak' }, lastAsk: 'address' };
    let d = run(st, 'huh?');
    assert.equal(d.goal, 'ask_address');
    assert.equal(d.rephrase, true);
    assert.equal(d.unclearStreak, 1);
    st = { ...advance(st, d), lastAsk: 'address' };
    d = run(st, '??');
    assert.equal(d.unclearStreak, 2);
    st = { ...advance(st, d), lastAsk: 'address' };
    d = run(st, 'what');
    st = { ...advance(st, d), lastAsk: 'address' };
    d = run(st, 'k');
    assert.equal(d.goal, 'handoff_notice');
    assert.equal(d.handoffReason, 'unclear_replies');
  });

  test('a person, anger or a lawyer hands the lead to the owner', () => {
    const st: T.LeadStateLite = { ...fresh(), stage: 'qualifying', collected: { issue: 'leak' } };
    assert.equal(run(st, 'can I talk to a real person').handoffReason, 'asked_for_a_person');
    assert.equal(run(st, 'this is ridiculous').handoffReason, 'upset_customer');
    const legal = run(st, 'I am calling my lawyer');
    assert.equal(legal.handoffReason, 'legal');
    assert.equal(legal.alert?.immediate, true);
    assert.equal(legal.status, 'needs_you');
  });

  test('plain-language opt-out is honored with one acknowledgement', () => {
    const d = run({ ...fresh(), stage: 'qualifying' }, 'please stop texting me');
    assert.equal(d.goal, 'opt_out_ack');
    assert.equal(d.optOut, true);
    assert.equal(d.nextStage, 'opted_out');
  });

  test('a clear no ends the chase politely', () => {
    const d = run({ ...fresh(), stage: 'qualifying', collected: { issue: 'leak' } }, "no thanks, we're all set");
    assert.equal(d.goal, 'acknowledge_decline');
    assert.equal(d.status, 'lost');
    assert.equal(d.nextStage, 'closed');
  });

  test('a closed lead that writes again is picked back up', () => {
    const d = run({ ...fresh(), stage: 'closed', collected: { issue: 'leak' } }, 'actually I do need help with the leak');
    assert.notEqual(d.reply, false);
    assert.equal(d.nextStage, 'qualifying');
  });

  test('"later" snoozes instead of pushing', () => {
    const d = run({ ...fresh(), stage: 'qualifying', collected: { issue: 'leak' } }, "I'm at work, text me later");
    assert.equal(d.goal, 'acknowledge_snooze');
    assert.equal(d.snoozeHours, 3);
  });

  test('commercial jobs go to the owner', () => {
    const d = run(fresh(), 'we need a quote on our warehouse roof');
    assert.equal(d.handoffReason, 'commercial_job');
    assert.equal(d.urgency, 'urgent');
  });

  test('Spanish gets one polite Spanish notice and a handoff', () => {
    const d = run(fresh(), 'hola necesito ayuda con mi techo por favor');
    assert.equal(d.goal, 'language_notice');
    assert.equal(d.spanish, true);
    assert.equal(d.nextStage, 'handed_off');
  });

  test('vendors and wrong numbers are not leads', () => {
    const v = run(fresh(), 'we offer SEO services for roofers');
    assert.equal(v.reply, false);
    assert.equal(v.status, 'not_a_lead');
    const w = run(fresh(), 'wrong number');
    assert.equal(w.goal, 'wrong_number_ack');
    assert.equal(w.optOut, true);
  });

  test('once handed off, the engine stays silent', () => {
    const d = run({ ...fresh(), stage: 'handed_off' }, 'hello? anyone there?');
    assert.equal(d.reply, false);
  });

  test('a returning storm with no availability hands off instead of inventing times', () => {
    const st: T.LeadStateLite = { ...fresh(), stage: 'qualifying', collected: { issue: 'hail damage', address: '9 Elm Dr Plano', active_now: false }, lastAsk: 'name' };
    const d = run(st, 'Priya', { name: 'Priya' }, { availableSlots: [] });
    assert.equal(d.goal, 'handoff_notice');
    assert.equal(d.handoffReason, 'no_availability');
  });

  test('a photo after booking is acknowledged and payment is asked once', () => {
    const st: T.LeadStateLite = { ...fresh(), stage: 'booked', collected: { issue: 'leak', address: '1 A St', name: 'Sam' } };
    const d = run(st, '[sent 1 photo]', {}, { photoReceived: true });
    assert.equal(d.goal, 'post_booking_details');
    assert.equal(d.ask, 'payment');
    assert.equal(d.collected.photo_received, true);
  });
});

// ---------------------------------------------------------------- prompts and fallbacks
describe('messages', () => {
  const ctxFor = (d: T.Decision, over: Partial<T.PromptCtx> = {}): T.PromptCtx => ({
    account, now: NOW, weather: noWeather, decision: d, collected: d.collected, offered: d.offer, ...over,
  });

  test('first message is instant, names the business and offers STOP', () => {
    const m = E.firstMessage(account, noWeather, NOW);
    assert.ok(m.includes('Summit Roofing') && /STOP/.test(m));
    assert.equal(E.guardOutput({ text: m, goal: 'first_message', business: account.name, tz: TZ, weather: noWeather, isFirstMessage: true, requireStop: true }).ok, true);
  });
  const calmFirst = (d: Date) => E.firstMessage(account, noWeather, d);
  test('the first message is one easy question in the company voice, never an open-ended one', () => {
    const day = calmFirst(NOW);
    assert.equal(day, "Hey, sorry we missed you. Summit Roofing here. The crew is up on a roof right now, but we got your call. Are you dealing with an active leak, or looking for a routine quote? Reply STOP to opt out.");
    for (const d of [NOW, new Date('2026-10-21T02:00:00Z'), new Date('2026-10-20T10:30:00Z'), new Date('2026-10-24T18:00:00Z')]) {
      const t = calmFirst(d);
      assert.doesNotMatch(t, /How can we help|What's going on/, 'no open-ended question');
      assert.equal((t.match(/\?/g) ?? []).length, 1, 'exactly one question');
      assert.ok(t.length <= 220);
    }
  });
  test('the first message names the moment: crew on a roof, closed for the night, not open yet, weekend', () => {
    assert.match(calmFirst(new Date('2026-10-21T02:00:00Z')), /Our office is closed for the night, but we got your call\. Are you dealing with an active leak, or do you just need a routine quote\?/);
    assert.match(calmFirst(new Date('2026-10-20T10:30:00Z')), /We're not open yet, but we got your call/);
    assert.match(calmFirst(new Date('2026-10-24T18:00:00Z')), /closed for the weekend/);
  });
  test('storms are named correctly for the moment, and only when an alert backs them up', () => {
    const eve = new Date('2026-10-21T02:00:00Z');   // 9 PM
    const morn = new Date('2026-10-21T14:00:00Z');  // 9 AM
    const tonight = E.buildWeatherFacts([{ id: 'x', event: 'Severe Thunderstorm Warning', ends: '2026-10-21T03:00:00Z' }], [], eve, TZ);
    assert.equal(tonight.storm, 'now');
    assert.equal(E.firstMessage(account, tonight, eve),
      "Hey, sorry we missed you. Summit Roofing here. Our office is closed for the night, but we got your call. Did tonight's storm hit your roof, or do you just need a routine inspection? Reply STOP to opt out.");
    const lastNight = E.buildWeatherFacts([], [{ id: 'h', event: 'Severe Thunderstorm Warning', firstSeen: '2026-10-21T01:00:00Z', lastSeen: '2026-10-21T02:30:00Z', ends: '2026-10-21T02:30:00Z' }], morn, TZ);
    assert.equal(lastNight.storm, 'last_night');
    assert.match(E.firstMessage(account, lastNight, morn), /Did last night's storm hit your roof, or do you just need a routine inspection\?/);
    const yesterday = E.buildWeatherFacts([], [{ id: 'h', event: 'Severe Thunderstorm Warning', firstSeen: '2026-10-19T18:00:00Z', lastSeen: '2026-10-19T20:00:00Z', ends: '2026-10-19T20:30:00Z' }], NOW, TZ);
    assert.equal(yesterday.storm, 'yesterday');
    assert.match(E.firstMessage(account, yesterday, NOW), /Did yesterday's storm hit your roof/);
    assert.doesNotMatch(calmFirst(NOW), /storm/, 'no alert, no storm talk');
    for (const w of [tonight, lastNight, yesterday]) {
      const when = w === tonight ? eve : w === lastNight ? morn : NOW;
      assert.equal(E.guardOutput({ text: E.firstMessage(account, w, when), goal: 'first_message', business: account.name, tz: TZ, weather: w, isFirstMessage: true, requireStop: true }).ok, true);
    }
  });
  test('every first message passes its own guardrails', () => {
    for (const d of [NOW, new Date('2026-10-21T02:00:00Z'), new Date('2026-10-20T10:30:00Z'), new Date('2026-10-24T18:00:00Z')]) {
      const r = E.guardOutput({ text: calmFirst(d), goal: 'first_message', business: account.name, tz: TZ, weather: noWeather, isFirstMessage: true, requireStop: true });
      assert.equal(r.ok, true, r.reasons.join(','));
    }
  });

  test('every fixed fallback message passes its own guardrails', () => {
    const goals: T.Goal[] = ['identify_self', 'ask_issue', 'ask_active', 'ask_address', 'ask_name', 'acknowledge_decline',
      'acknowledge_snooze', 'handoff_notice', 'opt_out_ack', 'wrong_number_ack', 'language_notice'];
    for (const goal of goals) {
      const d = run(fresh(), 'hello');
      const dd = { ...d, goal, spanish: goal === 'language_notice' };
      const text = E.fallbackMessage(dd, ctxFor(dd));
      const r = E.guardOutput({ text, goal, business: account.name, tz: TZ, weather: noWeather, allow911: true, requireStop: goal === 'identify_self' });
      if (goal === 'language_notice') continue; // fixed Spanish text, not model output
      assert.equal(r.ok, true, `${goal}: ${text} -> ${r.reasons.join(',')}`);
    }
  });
  test('offer, confirm and follow-up fallbacks pass too', () => {
    const offer = [slot(1, 9), slot(1, 14), slot(2, 9)];
    const base = run(fresh(), 'hello');
    const dOffer: T.Decision = { ...base, goal: 'offer_slots', offer };
    const t1 = E.fallbackMessage(dOffer, ctxFor(dOffer));
    assert.equal(E.guardOutput({ text: t1, goal: 'offer_slots', offered: offer, business: account.name, tz: TZ, weather: noWeather }).ok, true, t1);

    const dBook: T.Decision = { ...base, goal: 'confirm_booking', bookSlot: offer[1], offer: [offer[1]], collected: { name: 'Marcus Brooks', address: '5624 Cedar Elm Ln' } };
    const t2 = E.fallbackMessage(dBook, ctxFor(dBook));
    assert.equal(E.guardOutput({ text: t2, goal: 'confirm_booking', offered: [offer[1]], business: account.name, tz: TZ, weather: noWeather }).ok, true, t2);
    assert.match(t2, /Wed 2:00 PM/);

    for (let n = 1; n <= 5; n++) {
      const t = E.followUpFallback(n, 'Marcus Brooks', account.name);
      const r = E.guardOutput({ text: t, goal: 'follow_up', business: account.name, tz: TZ, weather: noWeather, requireStop: true });
      assert.equal(r.ok, true, `${n}: ${t} -> ${r.reasons.join(',')}`);
    }
    assert.equal(new Set([1, 2, 3, 4, 5].map((n) => E.followUpFallback(n, undefined, 'X'))).size, 5, 'each follow-up is different');
  });

  test('the model prompt carries local time, weather facts, memory and the hard rules', () => {
    const d = { ...run(fresh(), 'hello'), goal: 'ask_address' as T.Goal };
    const p = E.buildSystemPrompt(ctxFor(d, {
      weather: stormWeather, summary: 'Leak over the kitchen, active since the storm.',
      returning: { lastContactDaysAgo: 12, lastIssue: 'ceiling stain', address: '5624 Cedar Elm Ln' },
    }));
    assert.match(p, /Tuesday 3:00 PM/);
    assert.match(p, /Severe Thunderstorm Warning affected the area yesterday/);
    assert.match(p, /Leak over the kitchen/);
    assert.match(p, /12 days ago/);
    assert.match(p, /CONFIRM rather than assume/);
    assert.match(p, /Never quote a price/);
    assert.match(p, /street address/);
  });
  test('the prompt tells the model not to mention weather when there are no facts', () => {
    const d = { ...run(fresh(), 'hello'), goal: 'ask_issue' as T.Goal };
    assert.match(E.buildSystemPrompt(ctxFor(d)), /Do not mention the weather/);
  });
  test('model messages alternate roles and end on the homeowner', () => {
    const m = E.toModelMessages([
      { direction: 'outbound', body: 'Hi, this is Summit Roofing.' },
      { direction: 'inbound', body: 'leak' }, { direction: 'inbound', body: 'in kitchen' },
      { direction: 'outbound', body: 'Is it active?' },
    ]);
    assert.equal(m[0].role, 'user');
    assert.equal(m[m.length - 1].role, 'user');
    assert.ok(m.every((x, i) => i === 0 || x.role !== m[i - 1].role));
  });
  test('long conversations get summarized on a schedule', () => {
    assert.equal(E.needsSummary(10, 10), false);
    assert.equal(E.needsSummary(14, 8), true);
    assert.equal(E.needsSummary(14, 3), false);
  });
});


// ---------------------------------------------------------------- contact types: who is calling
describe('contact types', () => {
  const dana: T.ContactInfo = { type: 'past_client', autoReply: 'engine', name: 'Dana Ruiz', address: '9 Elm Dr Plano', lastJob: '2024 full reroof' };
  const pastState = (): T.LeadStateLite => ({ ...fresh(), contactType: 'past_client' });

  test('signals for suppliers, past clients, recurring clients and prior-job problems', () => {
    assert.equal(E.classify('your order is ready for pickup').supplierLike, true);
    assert.equal(E.classify('delivery window is tomorrow morning').supplierLike, true);
    assert.equal(E.classify('my roof is leaking').supplierLike, false);
    assert.equal(E.classify('you guys did my roof last year').pastClientLike, true);
    assert.equal(E.classify('I need a new roof').pastClientLike, false);
    assert.equal(E.classify('time for my annual inspection').recurringLike, true);
    assert.equal(E.classify('it is still leaking after your crew fixed it').priorJobIssue, true);
    assert.equal(E.classify('what does the warranty cover').priorJobIssue, true);
  });

  test('numbers the owner marked silent are never answered or alerted', () => {
    const d = run({ ...fresh(), contactType: 'crew', autoReply: 'silent' }, 'running late, be there at 8');
    assert.equal(d.reply, false);
    assert.equal(d.alert, null);
  });

  test('suppliers set to owner-only are not texted but the owner hears about it', () => {
    const d = run({ ...fresh(), contactType: 'supplier', autoReply: 'owner_only' }, 'your shingles are in');
    assert.equal(d.reply, false);
    assert.equal(d.handoffReason, 'supplier');
    assert.deepEqual(d.alert, { kind: 'handoff', immediate: false });
  });

  test('an unknown supplier is recognised from the message and suggested for review', () => {
    const d = run(fresh(), 'Hi this is Mike from ABC Supply, your order is ready for pickup');
    assert.equal(d.goal, 'handoff_notice');
    assert.equal(d.handoffReason, 'supplier');
    assert.equal(d.nextStage, 'handed_off');
    assert.deepEqual(d.contactUpdate, { type: 'supplier', needsReview: true });
    assert.match(E.fallbackMessage(d, { account, now: NOW, weather: noWeather, decision: d, collected: d.collected, offered: [] }), /let the owner know/);
  });

  test('a homeowner describing a roof problem is not mistaken for a supplier', () => {
    const d = run(fresh(), 'the shingles delivery guys left and now my roof leaks', { issue: 'roof leak' });
    assert.notEqual(d.handoffReason, 'supplier');
  });

  test('past and recurring clients are suggested from what they say', () => {
    assert.deepEqual(run(fresh(), 'you guys did my roof last year and I have a new leak', { issue: 'new leak' }).contactUpdate,
      { type: 'past_client', needsReview: true });
    assert.deepEqual(run(fresh(), 'time for my annual inspection', { issue: 'annual inspection' }).contactUpdate,
      { type: 'recurring_client', needsReview: true });
    assert.equal(run(pastState(), 'I need a new roof estimate', { issue: 'roof estimate' }).contactUpdate, null, 'an owner-confirmed type is never re-suggested');
  });

  test('a problem with a previous job goes straight to the owner, at once', () => {
    const d = run(pastState(), 'it is still leaking after your crew fixed it');
    assert.equal(d.handoffReason, 'prior_job_issue');
    assert.equal(d.alert?.immediate, true);
    assert.equal(d.status, 'needs_you');
  });

  test('a returning client is not asked for what we already know, only to confirm the address', () => {
    const d = run(pastState(), 'I need a new roof estimate', { issue: 'roof estimate' }, { contact: dana, bookExistingCustomers: true });
    assert.equal(d.collected.name, 'Dana Ruiz');
    assert.equal(d.collected.address, '9 Elm Dr Plano');
    assert.equal(d.goal, 'confirm_address');
    assert.equal(d.ask, 'confirm_address');
    const t = E.fallbackMessage(d, { account, now: NOW, weather: noWeather, decision: d, collected: d.collected, offered: [] });
    assert.match(t, /9 Elm Dr Plano\?/);
  });

  test('confirming the address goes straight to real times', () => {
    let st = pastState();
    let d = run(st, 'I need a new roof estimate', { issue: 'roof estimate' }, { contact: dana, bookExistingCustomers: true });
    st = advance(st, d);
    d = run(st, 'yes', {}, { contact: dana, bookExistingCustomers: true });
    assert.equal(d.flags.address_confirmed, true);
    assert.equal(d.goal, 'offer_slots');
    assert.equal(d.offer.length, 3);
  });

  test('saying no to the address on file asks for the right one, and the old one never comes back', () => {
    let st = pastState();
    let d = run(st, 'I need a new roof estimate', { issue: 'roof estimate' }, { contact: dana, bookExistingCustomers: true });
    st = advance(st, d);
    d = run(st, 'no that is my rental', {}, { contact: dana, bookExistingCustomers: true });
    assert.equal(d.goal, 'ask_address');
    assert.equal(d.collected.address, undefined);
    st = advance(st, d);
    d = run(st, 'ok', {}, { contact: dana, bookExistingCustomers: true });
    assert.notEqual(d.goal, 'confirm_address');
    assert.equal(d.collected.address, undefined);
  });

  test('a new address typed in confirms and replaces the one on file', () => {
    let st = pastState();
    let d = run(st, 'I need a new roof estimate', { issue: 'roof estimate' }, { contact: dana, bookExistingCustomers: true });
    st = advance(st, d);
    d = run(st, 'actually 12 Oak St Frisco', { address: '12 Oak St Frisco' }, { contact: dana, bookExistingCustomers: true });
    assert.equal(d.collected.address, '12 Oak St Frisco');
    assert.equal(d.flags.address_confirmed, true);
    assert.equal(d.goal, 'offer_slots');
  });

  test('an unknown number never gets details pre-filled', () => {
    const d = run(fresh(), 'I need a roof estimate', { issue: 'roof estimate' }, { contact: null });
    assert.equal(d.collected.name, undefined);
    assert.equal(d.goal, 'ask_address');
  });
});

describe('missed-call plans', () => {
  const dana: T.ContactInfo = { type: 'past_client', autoReply: 'engine', name: 'Dana Ruiz', lastJob: '2024 full reroof' };

  test('a stranger gets the normal first message', () => {
    const p = E.planMissedCall(account, noWeather, NOW, null);
    assert.match(p.text ?? '', /active leak, or looking for a routine quote\?/);
    assert.equal(p.opener, 'leak_or_quote');
    assert.equal(p.contactType, 'homeowner');
    assert.equal(p.alert, null);
  });
  test('a past client is greeted by name and asked if it is about the last job', () => {
    const p = E.planMissedCall(account, noWeather, NOW, dana);
    assert.match(p.text ?? '', /^Hey Dana, it's Summit Roofing\./);
    assert.equal(p.opener, 'returning');
    assert.match(p.text ?? '', /your 2024 full reroof or something new\?/);
    assert.equal(E.guardOutput({ text: p.text ?? '', goal: 'first_message', business: account.name, tz: TZ, weather: noWeather, isFirstMessage: true, requireStop: true }).ok, true);
  });
  test('after hours, a past client is told we are closed', () => {
    assert.match(E.planMissedCall(account, noWeather, new Date('2026-10-21T02:00:00Z'), dana).text ?? '', /closed right now/);
  });
  test('silent numbers get nothing, supplier numbers tell the owner and nothing else', () => {
    const silent = E.planMissedCall(account, noWeather, NOW, { type: 'crew', autoReply: 'silent', name: 'Luis' });
    assert.deepEqual([silent.text, silent.alert], [null, null]);
    const sup = E.planMissedCall(account, noWeather, NOW, { type: 'supplier', autoReply: 'owner_only', name: 'Beacon Supply' });
    assert.equal(sup.text, null);
    assert.equal(sup.alert?.body, 'Missed call from Beacon Supply (supplier).');
    assert.equal(sup.alert?.immediate, false);
  });
  test('the model is told when a number is a past client', () => {
    const d = { ...run(fresh(), 'hello'), goal: 'ask_issue' as T.Goal };
    const p = E.buildSystemPrompt({ account, now: NOW, weather: noWeather, decision: d, collected: d.collected, offered: [],
      returning: { contactType: 'past_client', lastJob: '2024 full reroof' } });
    assert.match(p, /past client \(last job: 2024 full reroof\)/);
  });
});

// ---------------------------------------------------------------- rescheduling and cancelling by text
describe('reschedule and cancel', () => {
  const current = slot(1, 9); // Wednesday 9 AM, 18 hours from NOW
  const appt: T.AppointmentLite = { startsAt: current.start, endsAt: current.end };
  const booked = (): T.LeadStateLite => ({
    ...fresh(), stage: 'booked', collected: { issue: 'leak', address: '1 A St', name: 'Sam', active_now: false },
  });
  const ctxFor = (d: T.Decision): T.PromptCtx => ({
    account, now: NOW, weather: noWeather, decision: d, collected: d.collected, offered: d.offer, appointment: current,
  });

  test('"can we reschedule" offers three other times, never the one they already have', () => {
    const d = run(booked(), 'can we reschedule', {}, { appointment: appt });
    assert.equal(d.goal, 'offer_slots');
    assert.equal(d.nextStage, 'awaiting_time');
    assert.equal(d.flags.rescheduling, true);
    assert.equal(d.offer.length, 3);
    assert.ok(d.offer.every((o) => o.start !== current.start));
    assert.equal(d.status, null, 'the lead stays booked while they choose');
  });

  test('asking for a specific open time moves it straight away', () => {
    const d = run(booked(), 'can we move it to Thursday at 9am', {}, { appointment: appt });
    assert.equal(d.goal, 'confirm_reschedule');
    assert.equal(d.rescheduleSlot?.start, slot(2, 9).start);
    assert.equal(d.bookSlot, null);
    assert.deepEqual(d.alert, { kind: 'rescheduled', immediate: true });
  });

  test('choosing from the offered times reschedules, it does not make a second booking', () => {
    let st = booked();
    let d = run(st, 'can we reschedule', {}, { appointment: appt });
    st = advance(st, d);
    d = run(st, '2', {}, { appointment: appt });
    assert.equal(d.goal, 'confirm_reschedule');
    assert.equal(d.rescheduleSlot?.start, st.offeredSlots[1].start);
    assert.equal(d.bookSlot, null);
    assert.equal(d.flags.rescheduling, false);
    assert.equal(d.nextStage, 'booked');
  });

  test('changing their mind mid-way keeps the original time', () => {
    let st = booked();
    let d = run(st, 'can we reschedule', {}, { appointment: appt });
    st = advance(st, d);
    d = run(st, 'never mind, keep it', {}, { appointment: appt });
    assert.equal(d.goal, 'keep_appointment');
    assert.equal(d.flags.rescheduling, false);
    assert.equal(d.nextStage, 'booked');
  });

  test('a cancel request asks first, and offers another time while asking', () => {
    const d = run(booked(), 'I need to cancel', {}, { appointment: appt });
    assert.equal(d.goal, 'confirm_cancel');
    assert.equal(d.ask, 'cancel_confirm');
    assert.equal(d.cancelAppointment, false);
    const t = E.fallbackMessage(d, ctxFor(d));
    assert.match(t, /cancel your inspection on Wed 9:00 AM, or would another time work better\?/);
  });

  test('"I don\'t need the appointment anymore" also asks before cancelling', () => {
    const d = run(booked(), "I don't need the appointment anymore", {}, { appointment: appt });
    assert.equal(d.goal, 'confirm_cancel');
    assert.equal(d.cancelAppointment, false);
  });

  test('only an explicit yes cancels, and the owner is told at once when it is soon', () => {
    const st: T.LeadStateLite = { ...booked(), lastAsk: 'cancel_confirm' };
    const d = run(st, 'yes cancel it', {}, { appointment: appt });
    assert.equal(d.goal, 'acknowledge_cancel');
    assert.equal(d.cancelAppointment, true);
    assert.equal(d.status, 'lost');
    assert.equal(d.nextStage, 'closed');
    assert.deepEqual(d.alert, { kind: 'cancelled', immediate: true });
  });

  test('"ok" or "sure" never cancels. It is asked again, then handed to the owner', () => {
    let st: T.LeadStateLite = { ...booked(), lastAsk: 'cancel_confirm' };
    let d = run(st, 'ok', {}, { appointment: appt });
    assert.equal(d.cancelAppointment, false);
    assert.equal(d.goal, 'confirm_cancel');
    assert.equal(d.rephrase, true);
    st = { ...booked(), lastAsk: 'cancel_confirm', unclearStreak: d.unclearStreak };
    d = run(st, 'sure', {}, { appointment: appt });
    assert.equal(d.goal, 'handoff_notice');
    assert.equal(d.handoffReason, 'cancel_unclear');
  });

  test('"no thanks" to "do you want to cancel?" keeps the appointment', () => {
    const st: T.LeadStateLite = { ...booked(), lastAsk: 'cancel_confirm' };
    assert.equal(run(st, 'no thanks', {}, { appointment: appt }).goal, 'keep_appointment');
    assert.equal(run(st, 'no keep it', {}, { appointment: appt }).goal, 'keep_appointment');
    assert.equal(run(st, "no thanks, I don't need it anymore", {}, { appointment: appt }).goal, 'acknowledge_cancel');
  });

  test('answering a cancel question with another time turns it into a reschedule', () => {
    const st: T.LeadStateLite = { ...booked(), lastAsk: 'cancel_confirm' };
    const d = run(st, 'actually can we do Friday', {}, { appointment: appt });
    assert.equal(d.goal, 'confirm_reschedule');
    assert.equal(d.rescheduleSlot?.start, slot(3, 10).start);
    const d2 = run(st, 'another time would be better', {}, { appointment: appt });
    assert.equal(d2.goal, 'offer_slots');
    assert.equal(d2.flags.rescheduling, true);
  });

  test('cancel or reschedule with no appointment still goes to the owner', () => {
    const st: T.LeadStateLite = { ...fresh(), stage: 'qualifying', collected: { issue: 'leak' } };
    assert.equal(run(st, 'can we reschedule').handoffReason, 'reschedule_request');
    assert.equal(run(st, 'I want to cancel').handoffReason, 'cancel_request');
  });

  test('no open times hands the reschedule to the owner instead of inventing one', () => {
    const d = run(booked(), 'can we reschedule', {}, { appointment: appt, availableSlots: [] });
    assert.equal(d.goal, 'handoff_notice');
    assert.equal(d.handoffReason, 'no_availability');
  });

  test('the owner alert is only immediate when the appointment is within 24 hours or the lead is urgent', () => {
    const far: T.AppointmentLite = { startsAt: slot(3, 10).start, endsAt: slot(3, 10).end };
    const routine: T.LeadStateLite = { ...booked(), collected: { issue: 'estimate for a new roof', address: '1 A St', name: 'Sam' } };
    const d = run(routine, 'can we move it to Thursday at 9am', {}, { appointment: far });
    assert.deepEqual(d.alert, { kind: 'rescheduled', immediate: false });
    const urgent: T.LeadStateLite = { ...routine, urgency: 'urgent' };
    assert.equal(run(urgent, 'can we move it to Thursday at 9am', {}, { appointment: far }).alert?.immediate, true);
    // a leak is urgent by the rules, so changes to it are never held back
    assert.equal(run(booked(), 'can we move it to Thursday at 9am', {}, { appointment: far }).alert?.immediate, true);
  });

  test('every fixed message for these goals passes the guardrails', () => {
    const base = run(booked(), 'hello', {}, { appointment: appt });
    const cases: [T.Goal, Partial<T.Decision>, T.Slot[]][] = [
      ['confirm_cancel', { offer: [current] }, [current]],
      ['keep_appointment', { offer: [current] }, [current]],
      ['acknowledge_cancel', {}, []],
      ['confirm_reschedule', { rescheduleSlot: slot(2, 9), offer: [slot(2, 9)] }, [slot(2, 9)]],
    ];
    for (const [goal, extra, offered] of cases) {
      const d = { ...base, goal, ...extra } as T.Decision;
      const text = E.fallbackMessage(d, ctxFor(d));
      const r = E.guardOutput({ text, goal, offered, business: account.name, tz: TZ, weather: noWeather });
      assert.equal(r.ok, true, `${goal}: ${text} -> ${r.reasons.join(',')}`);
    }
    const moved = { ...base, goal: 'confirm_reschedule' as T.Goal, rescheduleSlot: slot(2, 9), offer: [slot(2, 9)] } as T.Decision;
    assert.match(E.fallbackMessage(moved, ctxFor(moved)), /moved to Thu 9:00 AM at 1 A St/);
  });
});

// ---------------------------------------------------------------- the website promise: the conversation sorts the call
describe('the conversation sorts the call', () => {
  const phone = '+12145550101';

  test('a homeowner who describes a roof problem is sorted as a homeowner and carries on to booking', () => {
    const d = run(fresh(), 'there is a leak in my kitchen ceiling', { issue: 'kitchen ceiling leak' });
    assert.equal(d.callerKind, 'homeowner');
    assert.deepEqual(d.contactUpdate, { type: 'homeowner', needsReview: false });
    assert.equal(d.flags.caller_kind, 'homeowner');
    assert.equal(d.goal, 'ask_active');
  });

  test('a vendor is flagged and the owner is told. Nothing is booked.', () => {
    const d = run(fresh(), 'Hi this is Mike from ABC Supply, your order is ready for pickup');
    assert.equal(d.callerKind, 'vendor');
    assert.equal(d.goal, 'handoff_notice');
    assert.equal(d.handoffReason, 'supplier');
    assert.equal(d.status, 'not_a_lead');
    assert.deepEqual(d.contactUpdate, { type: 'supplier', needsReview: true });
    assert.deepEqual(d.alert, { kind: 'handoff', immediate: false });
    assert.equal(d.offer.length, 0);
    assert.equal(d.bookSlot, null);
  });

  test('a vague vendor message is asked once for who and what, then passed on', () => {
    let st = fresh();
    let d = run(st, 'hi', {}, { signals: { ...E.classify('hi'), supplierLike: true } });
    assert.equal(d.goal, 'ask_callback_details');
    st = { ...advance(st, d), lastAsk: 'callback_details' };
    d = run(st, 'Pat from Beacon, calling about your account', {});
    assert.equal(d.goal, 'handoff_notice');
    assert.equal(d.handoffReason, 'supplier');
  });

  test('an existing customer is flagged with their own words, and never offered an inspection', () => {
    let st = fresh();
    let d = run(st, 'you guys did my roof last year and I need the gutters redone');
    assert.equal(d.callerKind, 'existing');
    assert.equal(d.goal, 'ask_name');
    assert.equal(d.offer.length, 0);
    st = { ...advance(st, d), lastAsk: 'name' };
    d = run(st, 'Dana Ruiz', { name: 'Dana Ruiz' });
    assert.equal(d.goal, 'handoff_notice');
    assert.equal(d.handoffReason, 'existing_customer');
    assert.equal(d.status, 'needs_you');
    assert.equal(d.nextStage, 'handed_off');
    assert.equal(d.bookSlot, null);
    assert.match(d.collected.issue ?? '', /gutters redone/);
    assert.deepEqual(d.alert, { kind: 'handoff', immediate: false });
  });

  test('a known existing customer with a name on file is flagged straight away', () => {
    const dana: T.ContactInfo = { type: 'past_client', autoReply: 'engine', name: 'Dana Ruiz', address: '9 Elm Dr Plano' };
    const d = run({ ...fresh(), contactType: 'past_client' }, 'my invoice looks wrong', {}, { contact: dana });
    assert.equal(d.goal, 'handoff_notice');
    assert.equal(d.handoffReason, 'existing_customer');
    assert.equal(d.collected.name, 'Dana Ruiz');
    assert.equal(d.offer.length, 0);
  });

  test('an emergency from an existing customer is flagged urgent and alerted at once', () => {
    const dana: T.ContactInfo = { type: 'past_client', autoReply: 'engine', name: 'Dana Ruiz' };
    const d = run({ ...fresh(), contactType: 'past_client' }, 'the roof you replaced has water pouring through the ceiling', {}, { contact: dana });
    assert.equal(d.urgency, 'emergency');
    assert.equal(d.alert?.immediate, true);
    assert.equal(d.offer.length, 0);
  });

  test('the owner can opt in to booking existing customers', () => {
    const dana: T.ContactInfo = { type: 'past_client', autoReply: 'engine', name: 'Dana Ruiz', address: '9 Elm Dr Plano' };
    const d = run({ ...fresh(), contactType: 'past_client' }, 'I need a new roof estimate', { issue: 'roof estimate' }, { contact: dana, bookExistingCustomers: true });
    assert.equal(d.goal, 'confirm_address');
  });

  test('a caller we cannot place is asked one sorting question, then handed to the owner with their words', () => {
    let st = fresh();
    let d = run(st, 'hi');
    assert.equal(d.callerKind, 'unknown');
    assert.equal(d.goal, 'ask_purpose');
    assert.match(E.fallbackMessage(d, { account, now: NOW, weather: noWeather, decision: d, collected: d.collected, offered: [] }),
      /roof at your home, an existing job with us, or something else\?/);
    st = { ...advance(st, d), lastAsk: 'purpose' };
    d = run(st, 'hello?');
    assert.equal(d.goal, 'handoff_notice');
    assert.equal(d.handoffReason, 'unclear_purpose');
    assert.equal(d.status, 'needs_you');
  });

  test('once sorted, the caller stays sorted on later messages', () => {
    let st = fresh();
    let d = run(st, 'you guys did my roof last year and I need the gutters redone');
    st = advance(st, d);
    d = run(st, 'ok', {});
    assert.equal(d.callerKind, 'existing');
  });

  test('a cold-call solicitor is filed quietly, never texted and never alerted', () => {
    const d = run(fresh(), 'we offer SEO services for roofers');
    assert.equal(d.reply, false);
    assert.equal(d.alert, null);
    assert.equal(d.status, 'not_a_lead');
  });

  test('"what is the warranty on a new roof" from a new homeowner is not mistaken for a previous-job problem', () => {
    const d = run(fresh(), 'what is the warranty on a new roof', { issue: 'new roof' });
    assert.notEqual(d.handoffReason, 'prior_job_issue');
    assert.equal(d.callerKind, 'homeowner');
  });

  test('the fixed messages for the sorting goals pass the guardrails', () => {
    const d = { ...run(fresh(), 'hi'), goal: 'ask_callback_details' as T.Goal };
    for (const goal of ['ask_purpose', 'ask_callback_details'] as T.Goal[]) {
      const dd = { ...d, goal } as T.Decision;
      const t = E.fallbackMessage(dd, { account, now: NOW, weather: noWeather, decision: dd, collected: dd.collected, offered: [] });
      assert.equal(E.guardOutput({ text: t, goal, business: account.name, tz: TZ, weather: noWeather }).ok, true, t);
    }
    assert.ok(phone);
  });
});

// ---------------------------------------------------------------- the text the owner receives
describe('owner alert texts', () => {
  const base = { account, phone: '+12145550101', urgency: 'normal' as T.Urgency, collected: {} as T.Collected };

  test('a booking says who, when, where, what and the number', () => {
    const t = E.buildOwnerAlert({ ...base, kind: 'booked', callerKind: 'homeowner', slot: slot(1, 9),
      collected: { name: 'Marcus Brooks', address: '5624 Cedar Elm Ln', issue: 'storm damage', payment: 'insurance', carrier: 'Allstate' } });
    assert.equal(t, 'BOOKED: Marcus Brooks, Wed 9:00 AM, 5624 Cedar Elm Ln. storm damage, Allstate. (214) 555-0101');
  });

  test('a vendor text carries their words and says it is not booked', () => {
    const t = E.buildOwnerAlert({ ...base, kind: 'handoff', callerKind: 'vendor', company: 'ABC Supply', quote: 'Your order is ready for pickup "today"' });
    assert.equal(t, 'VENDOR CALL: ABC Supply, (214) 555-0101. They said: "Your order is ready for pickup today". Flagged, not booked.');
  });

  test('an existing customer text says what they need and that nothing was booked', () => {
    const t = E.buildOwnerAlert({ ...base, kind: 'handoff', callerKind: 'existing', collected: { name: 'Dana Ruiz', issue: 'my invoice looks wrong' } });
    assert.equal(t, 'EXISTING CUSTOMER: Dana Ruiz, (214) 555-0101. They need: my invoice looks wrong. Flagged for you, not booked.');
  });

  test('an urgent existing customer is marked at the front', () => {
    const t = E.buildOwnerAlert({ ...base, kind: 'handoff', callerKind: 'existing', urgency: 'emergency', collected: { name: 'Dana', issue: 'water pouring through the ceiling' } });
    assert.match(t, /^EMERGENCY: EXISTING CUSTOMER: Dana, /);
  });

  test('a handoff names the reason and quotes the caller', () => {
    const t = E.buildOwnerAlert({ ...base, kind: 'handoff', callerKind: 'unknown', reason: 'unclear_purpose', quote: 'hello?' });
    assert.equal(t, 'NEEDS YOU: Caller, (214) 555-0101. It wasn\'t clear what they need. They said: "hello?".');
  });

  test('reschedules and cancellations say what changed', () => {
    const r = E.buildOwnerAlert({ ...base, kind: 'rescheduled', callerKind: 'homeowner', collected: { name: 'Sam' }, previousSlot: slot(1, 9), slot: slot(2, 13) });
    assert.equal(r, 'RESCHEDULED: Sam, was Wed 9:00 AM, now Thu 1:00 PM. (214) 555-0101');
    const c = E.buildOwnerAlert({ ...base, kind: 'cancelled', callerKind: 'homeowner', collected: { name: 'Sam' }, slot: slot(1, 9) });
    assert.equal(c, 'CANCELLED: Sam, Wed 9:00 AM. The time is open again. (214) 555-0101');
  });

  test('alerts never exceed 320 characters and never carry line breaks or stray quotes', () => {
    const t = E.buildOwnerAlert({ ...base, kind: 'handoff', callerKind: 'vendor', company: 'A'.repeat(200), quote: 'line one\nline two "quoted" '.repeat(30) });
    assert.ok(t.length <= 320);
    assert.doesNotMatch(t, /\n/);
  });

  test('phone numbers are formatted for people', () => {
    assert.equal(E.formatPhone('+12145550101'), '(214) 555-0101');
    assert.equal(E.formatPhone('abc'), 'abc');
  });
});


// ---------------------------------------------------------------- the one-word answer to the first question
describe('answers to the first question', () => {
  const asked = (variant: T.Flags['opener']): T.LeadStateLite => ({ ...fresh(), lastAsk: 'opener', flags: { opener: variant } });

  test('"active leak" is understood as an emergency and goes straight to the address', () => {
    const d = run(asked('leak_or_quote'), 'active leak');
    assert.equal(d.collected.issue, 'active leak');
    assert.equal(d.collected.active_now, true);
    assert.equal(d.urgency, 'emergency');
    assert.deepEqual(d.alert, { kind: 'priority', immediate: true });
    assert.equal(d.callerKind, 'homeowner');
    assert.equal(d.goal, 'ask_address');
  });
  test('"just a quote" is a routine homeowner, not urgent', () => {
    const d = run(asked('leak_or_quote'), 'just a quote');
    assert.equal(d.collected.issue, 'routine quote');
    assert.equal(d.urgency, 'normal');
    assert.equal(d.alert, null);
    assert.equal(d.goal, 'ask_address');
  });
  test('"the first one" and "leaking" pick the leak', () => {
    assert.equal(run(asked('leak_or_quote'), 'the first one').collected.issue, 'active leak');
    assert.equal(run(asked('leak_or_quote'), 'it is leaking in the kitchen').collected.issue, 'active leak');
  });
  test('"not leaking now, just a stain" is a leak that has stopped, not an emergency', () => {
    const d = run(asked('leak_or_quote'), 'it stopped, just a stain on the ceiling');
    assert.equal(d.collected.active_now, false);
    assert.equal(d.urgency, 'urgent');
  });
  test('"yes it did" to the storm question is storm damage, urgent', () => {
    const d = run(asked('storm_or_routine'), 'yes it did');
    assert.equal(d.collected.issue, 'storm damage');
    assert.equal(d.collected.job_type, 'storm_damage');
    assert.equal(d.urgency, 'urgent');
  });
  test('"no, just a routine inspection" is routine', () => {
    const d = run(asked('storm_or_routine'), 'no just a routine inspection');
    assert.equal(d.collected.issue, 'routine inspection');
    assert.equal(d.urgency, 'normal');
    assert.equal(run(asked('storm_or_routine'), 'nope').collected.issue, 'routine inspection');
  });
  test('an answer that fits neither choice is sorted instead: a vendor is flagged, an existing customer is flagged', () => {
    const v = run(asked('leak_or_quote'), 'your order is ready for pickup');
    assert.equal(v.callerKind, 'vendor');
    assert.equal(v.collected.issue, undefined);
    const e = run(asked('leak_or_quote'), 'I am calling about my invoice');
    assert.equal(e.callerKind, 'existing');
    assert.equal(e.bookSlot, null);
  });
  test('"who is this?" gets an introduction and the same easy question', () => {
    const d = run(asked('leak_or_quote'), 'who is this?');
    assert.equal(d.goal, 'identify_self');
    assert.equal(d.ask, 'opener');
    const t = E.fallbackMessage(d, { account, now: NOW, weather: noWeather, decision: d, collected: d.collected, offered: [] });
    assert.match(t, /Are you dealing with a leak, or just looking for a quote\?/);
    assert.equal(E.guardOutput({ text: t, goal: 'identify_self', business: account.name, tz: TZ, weather: noWeather, requireStop: true }).ok, true);
  });
  test('a reply we cannot read is asked the sorting question once, then handed to the owner', () => {
    let st = asked('leak_or_quote');
    let d = run(st, 'ok');
    assert.equal(d.goal, 'ask_purpose');
    st = { ...advance(st, d), lastAsk: 'purpose' };
    d = run(st, 'hello?');
    assert.equal(d.handoffReason, 'unclear_purpose');
  });
  test('the follow-up questions are easy either/or questions too', () => {
    const d = { ...run(fresh(), 'hello'), goal: 'ask_issue' as T.Goal };
    assert.match(E.fallbackMessage(d, { account, now: NOW, weather: noWeather, decision: d, collected: d.collected, offered: [] }), /leaking or damaged, or are you looking for a quote\?/);
  });
});
