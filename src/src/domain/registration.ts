// The business registration form: what is asked, what counts as valid, and which carrier path applies.
// The database checks all of this again, so a bad value can never be saved even if a screen forgets to check.

export const BUSINESS_TYPES: [string, string][] = [
  ['llc', 'LLC'],
  ['corporation', 'Corporation'],
  ['partnership', 'Partnership'],
  ['sole_proprietor', 'Sole proprietor'],
  ['nonprofit', 'Nonprofit'],
  ['other', 'Something else'],
];

export interface RegistrationForm {
  business_type: string;
  legal_name: string;
  dba: string;
  has_ein: boolean;
  ein: string;
  address1: string;
  address2: string;
  city: string;
  region: string;
  postal_code: string;
  country: 'US' | 'CA';
  website: string;
  contact_name: string;
  contact_title: string;
  contact_email: string;
  contact_phone: string;
  authorized: boolean;
}

export const EMPTY_REGISTRATION: RegistrationForm = {
  business_type: '', legal_name: '', dba: '', has_ein: true, ein: '', address1: '', address2: '', city: '', region: '', postal_code: '',
  country: 'US', website: '', contact_name: '', contact_title: '', contact_email: '', contact_phone: '', authorized: false,
};

export type RegistrationErrors = Partial<Record<keyof RegistrationForm, string>>;

export const einDigits = (s: string): string => s.replace(/\D/g, '').slice(0, 9);

/** 123456789 becomes 12-3456789 while typing. */
export function formatEin(s: string): string {
  const d = einDigits(s);
  return d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d;
}

export const maskEin = (last4: string | null | undefined): string => (last4 ? `••-•••${last4}` : 'Not given');

/**
 * A business that has an EIN is registered as a standard business. One without is registered as a sole proprietor.
 * (Carriers reject a business that has an EIN but registers as a sole proprietor.)
 */
export const registrationPath = (hasEin: boolean): 'standard' | 'sole_proprietor' => (hasEin ? 'standard' : 'sole_proprietor');

export const PATH_LABEL: Record<'standard' | 'sole_proprietor', string> = {
  standard: 'Standard business (has an EIN)',
  sole_proprietor: 'Sole proprietor (no EIN)',
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function validateRegistration(f: RegistrationForm, opts: { hasSavedEin?: boolean } = {}): RegistrationErrors {
  const e: RegistrationErrors = {};
  if (!BUSINESS_TYPES.some(([v]) => v === f.business_type)) e.business_type = 'Choose the kind of business.';
  if (!f.legal_name.trim()) e.legal_name = 'Enter the legal name exactly as it appears on your IRS letter.';
  if (f.has_ein) {
    if (einDigits(f.ein).length !== 9 && !(opts.hasSavedEin && einDigits(f.ein).length === 0)) e.ein = 'An EIN has 9 digits, like 12-3456789.';
  } else if (f.business_type && f.business_type !== 'sole_proprietor') {
    e.has_ein = 'Only a sole proprietor can register without an EIN. If your business has one, enter it.';
  }
  if (!f.address1.trim()) e.address1 = 'Enter the street address.';
  if (!f.city.trim()) e.city = 'Enter the city.';
  if (!f.region.trim()) e.region = 'Enter the state.';
  if (!f.postal_code.trim()) e.postal_code = 'Enter the ZIP code.';
  if (f.website.trim() && !/^https?:\/\/\S+$/i.test(f.website.trim())) e.website = 'The website should start with http:// or https://';
  if (!f.contact_name.trim()) e.contact_name = 'Enter the name of the person we can contact.';
  if (!EMAIL.test(f.contact_email.trim())) e.contact_email = 'Enter a valid email address.';
  const phone = f.contact_phone.replace(/\D/g, '');
  if (phone.length < 10 || phone.length > 11) e.contact_phone = 'Enter a full phone number, like (214) 555-0100.';
  if (!f.authorized) e.authorized = 'Please confirm you are allowed to register this business.';
  return e;
}

export const errorCount = (e: RegistrationErrors): number => Object.keys(e).length;

/** What is sent to the database. The EIN goes separately so it is never part of a stored form. */
export function registrationPayload(f: RegistrationForm): { data: Record<string, unknown>; ein: string | null } {
  const { ein, ...rest } = f;
  return { data: rest, ein: f.has_ein && einDigits(ein).length === 9 ? formatEin(ein) : null };
}

/** What we saved earlier, back into the form. The EIN is never sent back, only its last 4 digits. */
export function formFromSaved(s: Partial<Record<keyof RegistrationForm | 'ein_last4', unknown>> | null | undefined): RegistrationForm {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  if (!s || !s.business_type) return { ...EMPTY_REGISTRATION };
  return {
    business_type: str(s.business_type), legal_name: str(s.legal_name), dba: str(s.dba), has_ein: s.has_ein !== false, ein: '',
    address1: str(s.address1), address2: str(s.address2), city: str(s.city), region: str(s.region), postal_code: str(s.postal_code),
    country: s.country === 'CA' ? 'CA' : 'US', website: str(s.website), contact_name: str(s.contact_name), contact_title: str(s.contact_title),
    contact_email: str(s.contact_email), contact_phone: str(s.contact_phone), authorized: s.authorized === true,
  };
}

export const REGISTRATION_STATUS: Record<string, { label: string; tone: 'ok' | 'gold' | 'danger' | 'plain'; clientLine: string }> = {
  not_started: { label: 'Not started', tone: 'plain', clientLine: 'Not sent yet.' },
  draft: { label: 'Not sent', tone: 'plain', clientLine: 'Not sent yet.' },
  submitted: { label: 'Received', tone: 'gold', clientLine: 'We have it and will review it shortly.' },
  needs_changes: { label: 'Needs changes', tone: 'danger', clientLine: 'We need you to fix one thing.' },
  ready: { label: 'Ready to file', tone: 'ok', clientLine: 'Approved by us. We are filing it with the carriers.' },
  sent_to_twilio: { label: 'Filed with the carriers', tone: 'ok', clientLine: 'Filed with the carriers. Their review usually takes a few weeks.' },
};

/** Can the client still change what will be filed? */
export const registrationLocked = (status: string | null | undefined): boolean => status === 'ready' || status === 'sent_to_twilio';

export function registrationErrorText(message: string): string {
  const m = message || '';
  if (m.includes('locked')) return 'This has been approved and is being filed, so it can no longer be changed here. Email us if something is wrong.';
  if (m.includes('bad_ein')) return 'An EIN has 9 digits, like 12-3456789.';
  if (m.includes('ein_required')) return 'Only a sole proprietor can register without an EIN.';
  if (m.includes('not_authorized')) return 'Please confirm you are allowed to register this business.';
  if (m.includes('bad_email')) return 'Enter a valid email address.';
  if (m.includes('bad_phone')) return 'Enter a full phone number, like (214) 555-0100.';
  if (m.includes('bad_url')) return 'The website should start with http:// or https://';
  if (m.includes('missing_') || m.includes('bad_business_type') || m.includes('bad_country')) return 'Something is missing. Please check the form.';
  if (m.includes('vault') || m.includes('schema') || m.includes('undefined')) return 'We could not store this securely right now. Please email us and we will take it from here.';
  return 'We could not send that. Check your connection and try again, or email us.';
}
