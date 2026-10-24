// What is blocked on something outside this codebase, and what you can do in the meantime.
// Timings come from the services' own pages and from developer reports, and are honest ranges, not promises.

export type WaitKind = 'now' | 'waiting' | 'decide' | 'build';

export interface WaitItem {
  id: string;
  kind: WaitKind;
  title: string;
  who: string;
  /** how long it usually takes */
  typical: string;
  /** what cannot happen until it is done */
  blocks: string;
  /** what you can do while you wait */
  meanwhile: string;
}

export const KIND_LABEL: Record<WaitKind, string> = {
  now: 'Do now',
  waiting: 'Waiting on someone else',
  decide: 'To decide',
  build: 'Still to build',
};

export const WAITING: WaitItem[] = [
  {
    id: 'sql', kind: 'now', title: 'Run the new database scripts and their checks', who: 'You',
    typical: 'About 30 to 45 minutes',
    blocks: 'Every new screen. Without them the admin shows errors instead of data.',
    meanwhile: 'Nothing else is needed first.',
  },
  {
    id: 'google-publish', kind: 'now', title: 'Press "Publish app" on the Google consent screen', who: 'You',
    typical: 'Instant',
    blocks: 'Calendar connections lasting. While in Testing, every connection ends after 7 days.',
    meanwhile: 'Do it before connecting the first real client.',
  },
  {
    id: 'twilio-brand', kind: 'waiting', title: 'Twilio and the carriers approve a client\'s business registration', who: 'Twilio and the carriers',
    typical: 'The brand is often approved in a couple of business days. The campaign takes longer, commonly a few weeks.',
    blocks: 'Texting homeowners from that client\'s number.',
    meanwhile: 'Finish the rest of their setup, run test conversations in test mode (only the owner is texted), and collect the next client\'s registration form.',
  },
  {
    id: 'google-verify', kind: 'waiting', title: 'Google reviews the app for calendar access', who: 'Google',
    typical: 'Google says 3 to 5 business days. Developers in 2026 report 4 to 8 weeks or more, sometimes with long silences.',
    blocks: 'Removing the "unverified app" warning, and connecting more than about 100 people.',
    meanwhile: 'Clients can connect right away with the warning screen. To submit you need a live privacy policy with Google\'s "Limited Use" statement, your domain verified in Search Console, and a short demo recording.',
  },
  {
    id: 'stripe-live', kind: 'waiting', title: 'Stripe approves your business for live payments', who: 'Stripe',
    typical: 'Depends on Stripe\'s checks of your business and bank account. Start it early.',
    blocks: 'Charging a real card.',
    meanwhile: 'Everything works in test mode: products, customers, invoices, the webhook and the Billing tab.',
  },
  {
    id: 'email-domain', kind: 'waiting', title: 'Your domain verifies with the email service', who: 'Your DNS host',
    typical: 'A few minutes to a day',
    blocks: 'Sending email from the dashboard.',
    meanwhile: '"Open in my email app" works the whole time.',
  },
  {
    id: 'lawyer', kind: 'waiting', title: 'Legal review of texting consent', who: 'Your lawyer',
    typical: 'Depends on them',
    blocks: 'Texting real homeowners: consent for call-triggered texts, Canada\'s CASL rules, texts sent by an AI, how long records are kept, and the wording of the guarantee.',
    meanwhile: 'Everything else, including test conversations with owners only.',
  },
  {
    id: 'forwarding', kind: 'decide', title: 'How missed calls reach us (call forwarding)', who: 'You',
    typical: 'A decision, not a wait',
    blocks: 'Automatic checking that forwarding works. Nothing else.',
    meanwhile: 'It is set up and marked verified by hand on the Twilio tab. The three options are in the Wiki.',
  },
  {
    id: 'supabase-pro', kind: 'decide', title: 'Supabase paid plan before the first paying client', who: 'You',
    typical: 'Minutes to switch',
    blocks: 'Nothing technical, but you want backups and longer sessions before real client data is in.',
    meanwhile: 'Free plan is fine for building and testing.',
  },
  {
    id: 'engine', kind: 'build', title: 'The texting engine\'s live functions', who: 'Built together',
    typical: 'The next big piece',
    blocks: 'Any real texting: receiving a missed call, sending the first text, replies, follow-ups, owner alerts and the weather check.',
    meanwhile: 'Registration approvals above run in parallel, so start those first.',
  },
  {
    id: 'twilio-auto', kind: 'build', title: 'Automatic number setup in Twilio', who: 'Built together',
    typical: 'After the engine',
    blocks: 'Nothing. It saves about 30 minutes per client.',
    meanwhile: 'Done by hand, and the Twilio tab keeps track.',
  },
  {
    id: 'outlook', kind: 'build', title: 'Outlook / Microsoft calendars', who: 'Built together',
    typical: 'When a client needs it',
    blocks: 'Nothing today. The connection is shaped so it can be added beside Google.',
    meanwhile: 'Owners on Outlook use blocked times in their Settings.',
  },
];

export const waitingByKind = (kind: WaitKind): WaitItem[] => WAITING.filter((w) => w.kind === kind);
