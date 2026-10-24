import type { Guide, GuideContext } from '../guide';

export const callForwardingGuide = (_ctx: GuideContext): Guide => ({
  id: 'call_forwarding',
  intro: 'A missed call has to reach us for the first text to go out. How a call gets to us is the one design choice we have deliberately not made yet. The dashboard already tracks the result (not set, waiting for the owner, verified) by hand, so nothing is blocked while we decide.',
  time: 'No setup yet. This is a decision, not a task.',
  cost: 'Depends on the option.',
  steps: [
    {
      title: 'Option A: the owner forwards missed calls to their texting number',
      body: [
        'On their own phone the owner turns on "forward when unanswered or busy" to the Twilio number. We confirm with a test call.',
        'Cheapest, nothing to buy, two minutes for the owner. The codes differ by carrier (AT&T, Verizon, T-Mobile and so on), so we would write a one-page how-to for each.',
      ],
    },
    {
      title: 'Option B: forward from the office phone system',
      body: ['If the business uses a VoIP or office phone system, the same "no answer" rule is set there instead. Easy for them, but each system looks different.'],
    },
    {
      title: 'Option C: move their business number to Twilio',
      body: ['We would own the call routing, so we could always ring the owner first and text only when they miss it. Most control and the best data, but it is the biggest ask of a client and takes time to transfer.'],
    },
    {
      title: 'What we would build once we choose',
      body: [
        'A small "forwarding" module, in the same shape as the other integrations: start (give the owner their instructions), and verify (place a test call and mark it Verified automatically).',
        'Verifying automatically needs the engine\'s call-handling function, which is not built yet. Until then it is set by hand on the Twilio tab.',
      ],
    },
  ],
  checks: ['Nothing to check yet. When you decide, tell me which option and I will build the module.'],
});
