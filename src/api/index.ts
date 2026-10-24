// The data layer. Screens call these functions and never talk to Supabase themselves.
// (An automated test, engine-tests/architecture.test.ts, fails if a screen tries.)
//
//   authApi          signing in and out, passwords, two-factor
//   accessApi        who is this person to us (admin? a client?)
//   adminApi         everything the admin screens need
//   ownerApi         everything the client's own screens need
//   integrations*    the pluggable services: Stripe, Google Calendar, email, and the status check
import { authApi } from './auth';
import { accessApi } from './access';
import { clientsApi, callAdmin } from './admin/clients';
import { controlsApi } from './admin/controls';
import { billingApi } from './admin/billing';
import { healthApi } from './admin/health';
import { activityApi } from './admin/activity';
import { setupApi } from './admin/setup';
import { businessApi } from './admin/business';
import { twilioApi } from './admin/twilio';
import { registrationAdminApi } from './admin/registration';
import { registrationOwnerApi } from './owner/registration';
import { accountApi } from './owner/account';
import { leadsApi } from './owner/leads';
import { contactsApi } from './owner/contacts';
import { settingsApi } from './owner/settings';
import { setupOwnerApi } from './owner/setup';
import { googleCalendarApi } from './integrations/googleCalendar';
import { stripeApi } from './integrations/stripe';
import { emailApi } from './integrations/email';
import { integrationStatusApi } from './integrations/status';

export { isConfigured } from './http';
export type { Result } from './http';
export { authApi, accessApi, callAdmin };
export type { AuthError, AuthUser, AuthSession, Factor, Enrollment } from './auth';

export const adminApi = {
  clients: clientsApi,
  controls: controlsApi,
  billing: billingApi,
  health: healthApi,
  activity: activityApi,
  setup: setupApi,
  business: businessApi,
  twilio: twilioApi,
  registration: registrationAdminApi,
};

export const ownerApi = {
  account: accountApi,
  leads: leadsApi,
  contacts: contactsApi,
  settings: settingsApi,
  setup: setupOwnerApi,
  registration: registrationOwnerApi,
};

export const integrationsApi = {
  googleCalendar: googleCalendarApi,
  stripe: stripeApi,
  email: emailApi,
  status: integrationStatusApi,
};
