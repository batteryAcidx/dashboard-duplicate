// "Start here": the order to do things in. Kept as data so the in-app Wiki and the docs folder are made from the same words.
import type { IntegrationId } from '../domain';

export interface StartPhase {
  title: string;
  why: string;
  items: string[];
  /** a guide to open for more */
  guide?: IntegrationId;
}

export const START_HERE: StartPhase[] = [
  {
    title: 'Update the app',
    why: 'Everything new depends on this, and it needs no client.',
    items: [
      'Run the database scripts in order, each with a dry run first (docs/RUNNING-THE-SQL.md has a query that shows which you have already run).',
      'Run each script\'s checks one block at a time. Every line should say PASS. SKIP is fine.',
      'Run the tests and the build, push the branch, and open the preview.',
    ],
  },
  {
    title: 'Make a pretend client',
    why: 'So you can click through everything before a real client exists.',
    items: [
      'In the admin choose New client. Use a second email address you own.',
      'Open every tab. On the Setup tab, try asking for something, adding a link, and writing an email.',
    ],
  },
  {
    title: 'Plug in the services you want',
    why: 'Each is optional and independent. One you have not plugged in says "not plugged in yet" instead of breaking.',
    items: [
      'Stripe takes the payments. Test mode is free, so you can try it with fake cards.',
      'Google Calendar lets owners connect their calendar. Start it early: Google\'s review is slow.',
      'Email sending lets you email a client from the Setup tab. Until then, Open in my email app works.',
    ],
  },
  {
    title: 'Start the slow approvals early',
    why: 'These depend on other people, so the clock should start as soon as it can.',
    items: [
      'Press Publish app on the Google consent screen, then prepare the verification (a live privacy policy, a verified domain, a short recording).',
      'Start Stripe\'s business verification when you are close to a first client.',
      'See "What you are waiting for" for every item, how long it usually takes, and what to do meanwhile.',
    ],
  },
  {
    title: 'When your first client signs',
    why: 'This is the whole routine, once.',
    items: [
      'Create them in the admin. They get an invite email.',
      'On their Setup tab, ask for the business registration and email them the link.',
      'When their form arrives, review it on the Twilio tab and mark it ready.',
      'Register their brand and campaign in Twilio, and record the IDs on the same tab.',
      'Link their Stripe customer, and send them the calendar step.',
    ],
  },
];

export interface WikiTopic {
  id: string;
  label: string;
}

/** The pages of the Wiki, in order. Guides use the integration's own id. */
export const WIKI_TOPICS: WikiTopic[] = [
  { id: 'start', label: 'Start here' },
  { id: 'stripe', label: 'Stripe' },
  { id: 'google_calendar', label: 'Google Calendar' },
  { id: 'email', label: 'Email sending' },
  { id: 'twilio', label: 'Twilio' },
  { id: 'call_forwarding', label: 'Call forwarding' },
  { id: 'waiting', label: 'What you are waiting for' },
];

export const isWikiTopic = (id: string): boolean => WIKI_TOPICS.some((t) => t.id === id);
