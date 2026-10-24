// What a setup step can ask a client for, the presets that fill it in, and the email that goes with it.
// Pure functions, tested in engine-tests/ui.test.ts. The rules mirror the database, which checks them again.

export type StepAction = 'connect_calendar' | 'registration_form';

/** The button a step can show the client. */
export const STEP_ACTIONS: [StepAction | '', string][] = [
  ['', 'No button'],
  ['registration_form', 'Open our business registration form'],
  ['connect_calendar', 'Connect Google Calendar'],
];

export const isHttpsLink = (s: string): boolean => /^https:\/\/\S+$/i.test(s.trim()) && s.trim().length <= 500;

export type FieldType = 'text' | 'textarea' | 'phone' | 'email' | 'url' | 'select';

export interface InfoField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
}

export interface InfoPreset {
  id: string;
  label: string;
  prompt: string;
  fields: InfoField[];
  action?: StepAction;
}

export const INFO_PRESETS: InfoPreset[] = [
  {
    id: 'registration',
    label: 'Business registration (EIN)',
    prompt: 'Before we can register your texting number with the carriers, we need your business details, including your EIN. It takes about 5 minutes, and your EIN is stored encrypted.',
    fields: [],
    action: 'registration_form',
  },
  {
    id: 'business',
    label: 'Business details',
    prompt: 'We need a few details about your business for the texting registration the carriers require.',
    fields: [
      { key: 'legal_name', label: 'Legal business name', type: 'text', required: true },
      { key: 'website', label: 'Website', type: 'url' },
      { key: 'address1', label: 'Business street address', type: 'text' },
      { key: 'city', label: 'City', type: 'text' },
      { key: 'region', label: 'State', type: 'text' },
      { key: 'postal_code', label: 'ZIP code', type: 'text' },
      { key: 'public_phone', label: 'The number customers call', type: 'phone' },
      { key: 'license_number', label: 'License number (if you have one)', type: 'text' },
    ],
  },
  {
    id: 'owner',
    label: 'Who we should text',
    prompt: 'Tell us who should get the text when a job is booked.',
    fields: [
      { key: 'contact_name', label: 'Your name', type: 'text', required: true },
      { key: 'contact_phone', label: 'Mobile number for booking alerts', type: 'phone', required: true },
    ],
  },
  {
    id: 'forwarding',
    label: 'Call forwarding',
    prompt: 'We will walk you through forwarding missed calls. Which phone service do you use?',
    fields: [
      { key: 'carrier', label: 'Phone service', type: 'select', required: true, options: ['AT&T', 'Verizon', 'T-Mobile', 'Google Voice', 'An office phone system', 'Something else'] },
      { key: 'business_line', label: 'The number that should forward', type: 'phone' },
    ],
  },
  {
    id: 'calendar',
    label: 'Connect calendar',
    prompt: 'Connect your calendar so we never book you when you are busy, and every inspection lands on it.',
    fields: [],
    action: 'connect_calendar',
  },
];

/** A reasonable starting point for a step, guessed from its name. The admin can always change it. */
export function suggestPreset(step: { step_key: string; title: string }): string | null {
  const t = `${step.step_key} ${step.title}`.toLowerCase();
  if (/calendar/.test(t)) return 'calendar';
  if (/forward|carrier/.test(t)) return 'forwarding';
  if (/registration|brand|\bein\b|a2p|10dlc/.test(t)) return 'registration';
  if (/business|profile|detail/.test(t)) return 'business';
  if (/owner|contact|alert|notif|who/.test(t)) return 'owner';
  return null;
}

export const FIELD_TYPES: [FieldType, string][] = [
  ['text', 'Short answer'],
  ['textarea', 'Long answer'],
  ['phone', 'Phone number'],
  ['email', 'Email'],
  ['url', 'Website'],
  ['select', 'Choose one'],
];

export function keyFromLabel(label: string): string {
  const k = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return /^[a-z]/.test(k) ? k : k ? `f_${k}`.slice(0, 40) : '';
}

/** The same rules the database enforces, so a mistake shows up before saving. */
export function validateFields(fields: InfoField[]): string | null {
  if (fields.length > 8) return 'Ask for at most 8 things per step.';
  const seen = new Set<string>();
  for (const f of fields) {
    if (!f.label.trim()) return 'Every question needs a label.';
    if (f.label.length > 120) return 'A label is too long.';
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(f.key)) return `"${f.label}" needs a simpler name.`;
    if (seen.has(f.key)) return `Two questions are called the same thing ("${f.label}"). Rename one.`;
    seen.add(f.key);
    if (f.type === 'select' && (!f.options || f.options.length < 1 || f.options.length > 12)) return `"${f.label}" needs between 1 and 12 choices.`;
  }
  return null;
}

/** What the client typed, in the order it was asked, ready to show. Empty answers are left out. */
export function answersToRows(fields: InfoField[], response: Record<string, string> | null | undefined): { label: string; value: string }[] {
  if (!response) return [];
  return fields.filter((f) => response[f.key]).map((f) => ({ label: f.label, value: response[f.key] }));
}

const BUSINESS_KEYS = ['legal_name', 'website', 'address1', 'city', 'region', 'postal_code', 'public_phone', 'contact_name', 'contact_email', 'contact_phone', 'license_number'];

/** Answers that can be copied straight into the business details. */
export function businessKeysIn(response: Record<string, string> | null | undefined): string[] {
  return response ? BUSINESS_KEYS.filter((k) => response[k]) : [];
}

export function firstName(full: string | null | undefined, email?: string | null): string {
  const n = (full || '').trim().split(/\s+/)[0];
  if (n) return n;
  const local = (email || '').split('@')[0].split(/[._-]/)[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'there';
}

/** dashboard: send them to their Setup page. secure_form: our registration form (never ask for the EIN by email). external: a link we added. */
export type EmailKind = 'dashboard' | 'secure_form' | 'external';

export interface StepEmailInput {
  kind?: EmailKind;
  ownerName?: string | null;
  ownerEmail?: string | null;
  stepTitle: string;
  prompt?: string | null;
  note?: string | null;
  fields: InfoField[];
  action?: string | null;
  link: string;
  signer?: string;
}

/** A friendly first draft the admin can edit before it goes out. */
export function buildStepEmail(i: StepEmailInput): { subject: string; body: string } {
  const kind = i.kind ?? 'dashboard';
  const lines: string[] = [`Hi ${firstName(i.ownerName, i.ownerEmail)},`, ''];
  lines.push((i.prompt || i.note || `One quick thing to finish "${i.stepTitle}".`).trim());
  if (i.fields.length > 0) {
    lines.push('', 'What we need:');
    for (const f of i.fields) lines.push(`- ${f.label}${f.required ? '' : ' (optional)'}`);
  }
  if (i.action === 'connect_calendar') lines.push('', 'It takes about 30 seconds: you sign in with Google and tick one box.');
  if (kind === 'secure_form') {
    lines.push(
      '',
      'It takes about 5 minutes. Your EIN is stored encrypted, and our team normally only sees the last 4 digits.',
      '',
      `Please use this secure form rather than replying by email, so your EIN is never sent in a message: ${i.link}`,
    );
  } else if (kind === 'external') {
    lines.push('', `Here is the link: ${i.link}`, 'If it is easier, you can also reply to this email and we will take care of the rest.');
  } else {
    lines.push('', `You can reply right here with it, or add it in your dashboard whenever suits you: ${i.link}`, 'Either way works, there is no rush on your side.');
  }
  lines.push('', 'Thanks,', i.signer || 'The WedgeScale team');
  return { subject: `Quick question about ${i.stepTitle}`, body: lines.join('\n') };
}

/** Opens the person's own email app with the message filled in. Used when sending from here is not set up, or they prefer it. */
export function mailtoHref(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Some email apps cut very long links. Past this length the message is shortened with a note. */
export const MAILTO_SAFE_LENGTH = 1800;
export const mailtoTooLong = (href: string) => href.length > MAILTO_SAFE_LENGTH;

/** What the database says when an answer is not accepted, in words a roofer would understand. */
export function submitErrorText(message: string): string {
  const m = message || '';
  if (m.includes('missing_field')) return 'Please fill in the questions marked as required.';
  if (m.includes('bad_email')) return 'That email address does not look right.';
  if (m.includes('bad_phone')) return 'Please enter a full phone number, like (214) 555-0100.';
  if (m.includes('bad_url')) return 'The website should start with http:// or https://.';
  if (m.includes('bad_choice')) return 'Please pick one of the choices.';
  if (m.includes('too_long')) return 'One of your answers is too long. Please shorten it.';
  if (m.includes('nothing_requested') || m.includes('step_not_found')) return 'This step is not asking for anything right now. Refresh and try again.';
  return 'We could not send that. Check your connection and try again, or just reply to our email.';
}

/* ---------------------------------------------------------------- one form, one Save button */

/** Everything the admin decides about what a step asks the client for. */
export interface RequestDraft {
  prompt: string;
  fields: InfoField[];
  action: string | null;
  link: string;
  linkLabel: string;
}

export const EMPTY_DRAFT: RequestDraft = { prompt: '', fields: [], action: null, link: '', linkLabel: '' };

export function draftFromStep(s: {
  info_prompt?: string | null; info_fields?: InfoField[] | null; action?: string | null; info_link?: string | null; info_link_label?: string | null;
}): RequestDraft {
  return {
    prompt: s.info_prompt ?? '',
    fields: (s.info_fields ?? []).map((f) => ({ ...f })),
    action: s.action ?? null,
    link: s.info_link ?? '',
    linkLabel: s.info_link_label ?? '',
  };
}

/** The same draft written one way, so "required: false" and "no required" do not look like a change. */
export function cleanDraft(d: RequestDraft): RequestDraft {
  return {
    prompt: d.prompt.trim(),
    fields: d.fields.map((f) => ({
      key: f.key,
      label: f.label.trim(),
      type: f.type,
      ...(f.required ? { required: true } : {}),
      ...(f.type === 'select' ? { options: (f.options ?? []).map((o) => o.trim()).filter(Boolean) } : {}),
    })),
    action: d.action || null,
    link: d.link.trim(),
    linkLabel: d.link.trim() ? d.linkLabel.trim() : '',
  };
}

export const sameDraft = (a: RequestDraft, b: RequestDraft): boolean => JSON.stringify(cleanDraft(a)) === JSON.stringify(cleanDraft(b));

/** Does the draft ask for anything at all? */
export const draftAsks = (d: RequestDraft): boolean => d.fields.length > 0 || d.action !== null || d.link.trim() !== '';

/** The first problem with a draft, in plain words, or null when it can be saved. */
export function validateDraft(d: RequestDraft): string | null {
  const c = cleanDraft(d);
  const problem = validateFields(c.fields);
  if (problem) return problem;
  if (c.link && !isHttpsLink(c.link)) return 'The link must start with https:// (a secure address).';
  return null;
}

/** What actually changed on a step. The one Save button saves only these, in this order. */
export function stepChanges(
  step: { status: string; note: string | null } & Parameters<typeof draftFromStep>[0],
  status: string,
  note: string,
  draft: RequestDraft,
): { statusOrNote: boolean; request: boolean; any: boolean } {
  const statusOrNote = status !== step.status || note.trim() !== (step.note ?? '');
  const request = !sameDraft(draft, draftFromStep(step));
  return { statusOrNote, request, any: statusOrNote || request };
}

/* ---------------------------------------------------------------- what we tell the client we need */

const OUTCOME = /^(.*?)\s+(submitted|connected|verified|approved|registered|completed|activated|confirmed|received|finished)$/i;

/** "Carrier registration submitted" becomes "have your carrier registration submitted". Null when the title is not that shape. */
export function outcomePhrase(title: string): string | null {
  const m = title.trim().match(OUTCOME);
  if (!m) return null;
  const noun = m[1].trim().replace(/^(your|the)\s+/i, '');
  if (!noun) return null;
  // lower-case the first letter of a normal word, but leave acronyms such as "A2P" alone
  const word = /^[A-Z][a-z]/.test(noun) ? noun.charAt(0).toLowerCase() + noun.slice(1) : noun;
  return `have your ${word} ${m[2].toLowerCase()}`;
}

const endSentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/**
 * One short sentence saying what we need from the client, in their words. It describes the ask, not the step's name,
 * and adds the admin's own note when there is one ("The legal name must match your IRS letter.").
 */
export function needLine(s: { title: string; note?: string | null; action?: string | null; info_link?: string | null; info_fields?: unknown[] | null }): string {
  const to = outcomePhrase(s.title);
  const purpose = to ? ` to ${to}` : '';
  let base: string;
  if (s.action === 'registration_form') base = `We need your business details${purpose || ' so we can file your carrier registration'}.`;
  else if (s.action === 'connect_calendar') base = 'We need you to connect your Google Calendar.';
  else if (s.info_link) base = `We need you to fill in a short form${purpose}.`;
  else if ((s.info_fields ?? []).length > 0) base = `We need a few details from you${purpose || ` to finish "${s.title}"`}.`;
  else base = `We need a quick reply from you${purpose || ` to finish "${s.title}"`}.`;
  const note = (s.note ?? '').trim();
  return note ? `${base} ${endSentence(note)}` : base;
}
