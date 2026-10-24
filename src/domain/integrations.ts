// What the app knows about each pluggable service, and how ready it is. Pure: no network.
export type IntegrationId = 'stripe' | 'google_calendar' | 'email' | 'twilio' | 'call_forwarding';

/**
 * ready           everything needed is set
 * not_configured  switched off: the secrets are missing, so the screens say "not plugged in yet" instead of failing
 * manual          works, but is done by hand for now (Twilio)
 * undecided       we have not chosen how to do this yet (call forwarding)
 * unknown         the check itself could not run (the status function is not deployed yet)
 */
export type IntegrationState = 'ready' | 'not_configured' | 'manual' | 'undecided' | 'unknown';

export interface IntegrationStatus {
  state: IntegrationState;
  /** the names of the settings that are missing. Never their values. */
  missing: string[];
  /** recommended settings that are missing: it works, but something is weaker */
  warnings?: string[];
}

export type IntegrationStatusMap = Record<IntegrationId, IntegrationStatus>;

/** Should the screens for this integration be shown? Only a clearly unplugged one is hidden: a failed check never locks anyone out. */
export const isPluggedIn = (s: IntegrationStatus | undefined): boolean => !s || s.state !== 'not_configured';
