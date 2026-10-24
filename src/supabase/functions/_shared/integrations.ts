// What each pluggable service needs before it can work. This is the ONE place that knows the secret names,
// so the status check, the guides and the docs can never disagree. Pure: it is handed a way to read settings.

export type IntegrationId = 'stripe' | 'google_calendar' | 'email' | 'twilio' | 'call_forwarding';
export type IntegrationState = 'ready' | 'not_configured' | 'manual' | 'undecided';

export interface IntegrationSpec {
  id: IntegrationId;
  /** without all of these the integration is switched off */
  required: string[];
  /** nice to have: the integration works without them, but something is weaker */
  recommended?: string[];
  /** works by hand for now */
  manual?: boolean;
  /** we have not decided how to do this yet */
  undecided?: boolean;
}

export const SPECS: IntegrationSpec[] = [
  { id: 'stripe', required: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] },
  { id: 'google_calendar', required: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'OAUTH_STATE_SECRET', 'APP_URL'], recommended: ['CRON_SECRET'] },
  { id: 'email', required: ['RESEND_API_KEY', 'EMAIL_FROM'] },
  { id: 'twilio', required: [], manual: true },
  { id: 'call_forwarding', required: [], undecided: true },
];

export interface IntegrationStatus {
  state: IntegrationState;
  /** names of the required settings that are missing. Never values. */
  missing: string[];
  /** names of recommended settings that are missing */
  warnings: string[];
}

const has = (v: string | undefined | null) => typeof v === 'string' && v.trim() !== '';

export function computeStatus(read: (name: string) => string | undefined | null): Record<IntegrationId, IntegrationStatus> {
  const out = {} as Record<IntegrationId, IntegrationStatus>;
  for (const s of SPECS) {
    const missing = s.required.filter((n) => !has(read(n)));
    const warnings = (s.recommended ?? []).filter((n) => !has(read(n)));
    const state: IntegrationState = s.undecided ? 'undecided' : s.manual ? 'manual' : missing.length === 0 ? 'ready' : 'not_configured';
    out[s.id] = { state, missing, warnings };
  }
  return out;
}
