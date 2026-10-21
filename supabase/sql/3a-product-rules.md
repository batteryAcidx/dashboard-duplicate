# WedgeScale engine: product rules (Step 3a)

These rules are implemented in `engine/` and checked by 137 automated tests. Where a rule protects a
promise made on the website, the website line is quoted.

## 1. What the engine collects
Required before booking: **what is wrong, the property address, the homeowner's name**.
Asked when it matters: **is it happening right now** (only for leaks and water).
Asked after booking, never blocking it: **a photo** (once, optional) and **insurance or paying themselves** (once).
A booking never waits on the photo or the payment answer.

## 2. Priority tiers (the promise: "high-ticket storm damage fast-tracked")
| Tier | Triggers | Owner alert |
|---|---|---|
| **emergency** | A safety hazard, water coming in, structural damage (ceiling sagging, tree on the house, hole in the roof), or an active leak right now | At once, including quiet hours |
| **urgent** | Storm damage, an insurance claim, a leak that has stopped, any damage while storms are on record in the area, or a commercial job | At once, including quiet hours |
| **normal** | Everything else | Respects quiet hours |

- Decided by **rules**, not by the AI, so the same message always gets the same tier.
- Urgency only ever **goes up** during a conversation. The owner or support can lower it by hand.
- Stored on `leads.urgency` with `urgency_rank` (0, 1, 2). **The dashboard list sorts by `urgency_rank` ascending, then newest first.**
- The old `priority` flag stays in step with the tier.

## 2b. The conversation sorts the call (the website promise)
> "Not every missed call is a new roof. The conversation sorts it: a homeowner gets booked for an inspection, a vendor or
> existing customer gets flagged and you get the details by text. Your calendar stays full of real jobs."

**The first text is ONE easy question in the company's voice, never an open-ended one** (the website: "an open-ended question
makes a stressed caller stop and think"). It names the moment and, when a real alert backs it up, the storm:
- Daytime: "Hey, sorry we missed you. Summit Roofing here. The crew is up on a roof right now, but we got your call. Are you dealing with an active leak, or looking for a routine quote?"
- After hours: "...Our office is closed for the night, but we got your call. Are you dealing with an active leak, or do you just need a routine quote?"
- A storm on record, said correctly for the moment ("tonight's", "last night's", "yesterday's", never invented): "...Our office is closed for the night, but we got your call. Did tonight's storm hit your roof, or do you just need a routine inspection?"
- A known past or recurring customer: "Hey Dana, it's Summit Roofing. Sorry we missed you! Is this about your 2024 full reroof or something new?"
- Every first text ends with "Reply STOP to opt out." (carrier rule). Variants also cover early morning ("We're not open yet") and weekends.

A one-word answer is understood: "active leak" (emergency), "just a quote" (routine), "yes it did" (storm damage), "no, just an inspection"
(routine), "the first one". Anything that fits neither choice ("your order is ready", "about my invoice") is sorted by the conversation instead.

**The reply sorts the caller.** Every lead carries a type, so the dashboard can filter it: **Unsorted** (not yet known),
**Homeowner**, **Past client**, **Recurring client**, **Supplier**, **Crew**, **Other**. Sorting within any filter is urgency first, then newest.

| Caller | What the engine does | What the owner gets by text |
|---|---|---|
| **Homeowner** | Collects name, address and problem, offers real times, books | "BOOKED: Marcus Brooks, Wed 9:00 AM, 5624 Cedar Elm Ln. storm damage, Allstate. (214) 555-0101" |
| **Vendor** | One polite reply ("I'll let the owner know you called"). If the message is too vague, asks once who and what. Never booked. | "VENDOR CALL: ABC Supply, (214) 555-0101. They said: "Your order is ready for pickup". Flagged, not booked." |
| **Existing customer** | Collects what they need and their name from their own words, never offers an inspection. Greets known customers by name. | "EXISTING CUSTOMER: Dana Ruiz, (214) 555-0101. They need: my invoice looks wrong. Flagged for you, not booked." |
| **Can't tell** | Asks one sorting question: "is this about a roof at your home, an existing job with us, or something else?" Still unclear: handed to the owner with their words. | "NEEDS YOU: Caller, (214) 555-0101. It wasn't clear what they need. They said: "hello?"." |

- **Calendar stays full of real jobs:** only homeowners are offered inspection times. A setting, **book existing customers**,
  lets an owner opt in. It is off by default so the promise holds.
- **Emergencies from anyone** (a past customer with water coming through the ceiling) are marked EMERGENCY and texted at once.
- **A problem with a previous job** ("still leaking after your crew fixed it") goes to the owner at once. The word "warranty"
  on its own does not: a new homeowner asking about a warranty is still a homeowner.
- **The owner decides.** They can mark any number, edit notes, and **import a customer or supplier list** so people are recognised
  from the first call. The engine suggests a type from what someone says, flagged "needs review", and never overrides an owner
  or import classification.
- **Known suppliers** the owner has set to owner-only are not texted. The owner gets the missed-call text. Crew and "other" are silent.
- **Cold-call solicitors** (SEO, merchant services) are filed as not-a-lead, never texted and never alerted, so the owner's attention is protected.
- Every owner text has the caller's name, the number to call back, what happened and whether anything was booked. Plain text,
  no links, 320 characters at most.

## 2c. Calendar-ready (the sync itself is the next step)
- The owner's real calendar will be copied in as **busy times only** (never titles or attendees) and **blocks offered slots
  automatically**. Owner-blocked times in the dashboard work the same way.
- Every booking, change and cancellation is **queued for the calendar** the moment a calendar is connected, with retries
  and per-appointment sync status.
- Providers planned: Google first, then Microsoft. An "add to calendar" link is the fallback for owners who prefer not to connect one.
- Until then, availability comes from office hours, notice rules and the appointments table.

## 3. Persistence: keep going until booked
- There is **no message cap tied to booking**. The engine keeps steering to a booking: it offers new times when
  the first ones are refused, books a time the homeowner suggests if it is open, answers price and insurance
  questions safely and returns to the goal, and follows up for 7 days.
- **Follow-ups** at 4, 24, 72, 120 and 168 hours after the lead came in. Five different messages, each ending with
  STOP language. They stop on any reply, a booking, a STOP, or the end of the schedule. They never go out in quiet hours.
- **"Later" snoozes.** "I'm at work, text me later" gets one acknowledgement and a follow-up at the time they hinted.
- **It stops chasing only for:** a booking, a clear "no" ("not interested", "we hired someone", "all set"),
  STOP in any form, a request for a person, or the owner taking over.
- A closed lead that writes again is picked back up.
- **Safety ceiling:** after 40 AI replies on one lead, the lead goes to the owner with a summary. This stops runaway
  loops and abuse. It is never silent: the owner is told.

## 4. Handing a lead to the owner
Triggers: asked for a person, upset or abusive, legal language, a commercial job, a cancel or reschedule request,
four unclear replies in a row, no open times, a question after booking the engine cannot answer, non-English,
the safety ceiling. The lead is paused (`needs_you`), the homeowner gets one short, kind message, and the owner is alerted.
Once handed off, the engine stays silent until the owner hands it back.

## 4b. Rescheduling and cancelling by text
- **Reschedule:** "can we move it" offers three other open times (never the current one). A specific open time ("Thursday
  at 9am") is booked directly. It **updates the same appointment**, so it can never count as a second booked inspection
  toward your guarantee. Changing their mind keeps the original time.
- **Cancel:** the engine asks first and offers another time while asking: "Do you want me to cancel your inspection on
  Wed 9:00 AM, or would another time work better?" **Only an explicit yes cancels.** "OK" or "sure" is asked again once and
  then goes to the owner. "No thanks" keeps it. "I don't need the appointment anymore" also asks first.
- A cancelled inspection frees the time, closes the lead (not deleted: it can be picked up again if they write back),
  and is removed from the owner's calendar once one is connected.
- **The owner is alerted** to every change, at once when the appointment is within 24 hours or the lead is urgent.
- With no appointment, "cancel" or "reschedule" still goes to the owner.
- Guarantee note: a booked inspection counts even if it is later cancelled or moved, per the Terms. Because a reschedule is an
  update to one row, counting appointments never double-counts.

## 5. Safety and compliance rules (hard-coded, then checked again on every outgoing message)
- **Emergencies:** if someone describes a hazard (fire, gas, sparks, electrical, injury), the engine says
  "call 911" **once**, flags an emergency, alerts the owner, and continues the booking. It gives no other safety
  instructions: no breakers, buckets, tarps, ladders.
- **Price:** never quoted. "The roofer gives an exact estimate after seeing the roof."
- **Insurance:** never promised or denied. The roofer goes over it at the inspection.
- **Opt-outs in plain language** ("stop texting me", "remove me") are honored like STOP. One acknowledgement goes
  out first, then the number is recorded and the gate closes.
- **Wrong numbers and vendors** are marked not-a-lead. Vendors get no reply.
- **Identity:** the first message names the business. If asked, it says it is automated and never claims to be a person.
- **Language:** English only for now. A Spanish message gets one polite Spanish reply and goes to the owner.
- **Times:** the AI can only mention times the database says are open. Anything else is blocked.

## 6. Context the AI is given
- **Local time:** the account's own time zone, the part of day, and whether the office is open, closed or closed for the weekend.
  The first text is different after hours.
- **Weather:** facts from the National Weather Service for the client's **service area** (never the homeowner's address),
  refreshed every 30 minutes, with the last 72 hours remembered. Storm mode turns on when a roofing-relevant alert
  (severe thunderstorm, tornado, high wind, hurricane, flash flood, winter or ice storm) is active or ended within
  72 hours. The AI may mention **one** fact, naturally, and may never say the weather caused their damage.
  Weather words that are not in the facts or in what the homeowner wrote are blocked.
  US only for now. Canada needs its own source before the first Canadian client.
- **Memory inside a conversation:** the full thread, plus a rolling summary every 8 messages once a conversation
  passes 12, so a long chase keeps its context.
- **Memory across time:** a returning number is recognized, **within that client's account only**, with the last name,
  address and issue. The AI confirms ("is this still about the house on Cedar Elm?") and never assumes.
- **What the AI already knows:** it is told what has been collected and never re-asks.

## 6b. Owner alert timing
Emergency and urgent leads alert immediately, any hour. Everything else waits for the end of quiet hours
(default 9 PM to 7 AM, set per client in Settings).

## 7. What is deliberately not built yet
- The calendar sync itself (tables, rules and queue are ready, see 2c).
- The dashboard screens: contact-type filter, review badge, contact list and import (the data is ready).
- Spanish conversations, and Canadian weather.
- Reading photos. Step 3d adds cautious photo triage.
