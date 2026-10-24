import React from 'react';
import { BUSINESS_TYPES, errorCount, formatEin, maskEin } from '../../domain';
import type { RegistrationErrors, RegistrationForm } from '../../domain';
import { Button, Card, Field, Notice, inputCls } from '../../components/ui';

interface Props {
  value: RegistrationForm;
  errors: RegistrationErrors;
  onChange: (patch: Partial<RegistrationForm>) => void;
  onSubmit: () => void;
  busy: boolean;
  /** an EIN is already saved: leaving the box empty keeps it */
  savedEinLast4?: string | null;
  submitError?: string | null;
  submitLabel?: string;
}

const Err: React.FC<{ text?: string }> = ({ text }) => (text ? <p role="alert" className="mt-2 text-[13px] leading-relaxed text-red-300">{text}</p> : null);

/** The form itself. It only shows fields and reports changes: loading and saving are the page's job. */
export const RegistrationFormView: React.FC<Props> = ({ value, errors, onChange, onSubmit, busy, savedEinLast4, submitError, submitLabel = 'Send registration details' }) => {
  const f = value;
  const bad = (k: keyof RegistrationForm) => (errors[k] ? { 'aria-invalid': true } : {});

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-8"
    >
      <Card title="Your business" hint="Carriers check these against official records, so use the same spelling as your IRS letter.">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field id="r-type" label="Type of business">
              <select id="r-type" value={f.business_type} onChange={(e) => onChange({ business_type: e.target.value })} style={{ colorScheme: 'dark' }} className={inputCls} {...bad('business_type')}>
                <option value="">Choose one</option>
                {BUSINESS_TYPES.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </Field>
            <Err text={errors.business_type} />
          </div>
          <div className="sm:col-span-2">
            <Field id="r-legal" label="Legal business name" hint="Exactly as it appears on your IRS EIN letter (the CP 575 or 147C).">
              <input id="r-legal" value={f.legal_name} maxLength={150} onChange={(e) => onChange({ legal_name: e.target.value })} className={inputCls} {...bad('legal_name')} />
            </Field>
            <Err text={errors.legal_name} />
          </div>
          <div className="sm:col-span-2">
            <Field id="r-dba" label={'Name customers know you by (if different)'}>
              <input id="r-dba" value={f.dba} maxLength={150} onChange={(e) => onChange({ dba: e.target.value })} className={inputCls} />
            </Field>
          </div>

          <div className="sm:col-span-2">
            {f.has_ein && (
              <>
                <Field id="r-ein" label="EIN (employer identification number)" hint="9 digits. Stored encrypted and used only for the carrier registration.">
                  <input
                    id="r-ein"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={savedEinLast4 ? `Saved: ${maskEin(savedEinLast4)}. Leave blank to keep it.` : '12-3456789'}
                    value={f.ein}
                    onChange={(e) => onChange({ ein: formatEin(e.target.value) })}
                    className={`${inputCls} font-data`}
                    {...bad('ein')}
                  />
                </Field>
                <Err text={errors.ein} />
              </>
            )}
            <label className="mt-4 flex cursor-pointer items-start gap-3 text-[15px] leading-relaxed text-slate-300">
              <input type="checkbox" checked={!f.has_ein} onChange={(e) => onChange({ has_ein: !e.target.checked, ein: e.target.checked ? '' : f.ein })} className="mt-1 h-4 w-4 accent-[#f59e0b]" />
              <span>
                My business does not have an EIN
                <span className="block text-[13px] text-slate-500">Only for sole proprietors. If you have an EIN of any kind, enter it above.</span>
              </span>
            </label>
            <Err text={errors.has_ein} />
          </div>

          <div className="sm:col-span-2">
            <Field id="r-web" label="Website (if you have one)">
              <input id="r-web" type="url" value={f.website} maxLength={200} placeholder="https://" onChange={(e) => onChange({ website: e.target.value })} className={inputCls} {...bad('website')} />
            </Field>
            <Err text={errors.website} />
          </div>
        </div>
      </Card>

      <Card title="Business address">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field id="r-a1" label="Street address">
              <input id="r-a1" value={f.address1} maxLength={150} onChange={(e) => onChange({ address1: e.target.value })} className={inputCls} {...bad('address1')} />
            </Field>
            <Err text={errors.address1} />
          </div>
          <div className="sm:col-span-2">
            <Field id="r-a2" label="Suite or unit (optional)">
              <input id="r-a2" value={f.address2} maxLength={150} onChange={(e) => onChange({ address2: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <div>
            <Field id="r-city" label="City">
              <input id="r-city" value={f.city} maxLength={80} onChange={(e) => onChange({ city: e.target.value })} className={inputCls} {...bad('city')} />
            </Field>
            <Err text={errors.city} />
          </div>
          <div>
            <Field id="r-region" label="State or province">
              <input id="r-region" value={f.region} maxLength={40} onChange={(e) => onChange({ region: e.target.value })} className={inputCls} {...bad('region')} />
            </Field>
            <Err text={errors.region} />
          </div>
          <div>
            <Field id="r-zip" label="ZIP or postal code">
              <input id="r-zip" value={f.postal_code} maxLength={20} onChange={(e) => onChange({ postal_code: e.target.value })} className={inputCls} {...bad('postal_code')} />
            </Field>
            <Err text={errors.postal_code} />
          </div>
          <div>
            <Field id="r-country" label="Country">
              <select id="r-country" value={f.country} onChange={(e) => onChange({ country: e.target.value as 'US' | 'CA' })} style={{ colorScheme: 'dark' }} className={inputCls}>
                <option value="US">United States</option>
                <option value="CA">Canada</option>
              </select>
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Who we should list as the contact" hint="Usually the owner. For a sole proprietor, the carriers confirm by texting a code to this phone.">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <Field id="r-cname" label="Full name">
              <input id="r-cname" value={f.contact_name} maxLength={100} onChange={(e) => onChange({ contact_name: e.target.value })} className={inputCls} {...bad('contact_name')} />
            </Field>
            <Err text={errors.contact_name} />
          </div>
          <div>
            <Field id="r-ctitle" label="Job title (optional)">
              <input id="r-ctitle" value={f.contact_title} maxLength={80} placeholder="Owner" onChange={(e) => onChange({ contact_title: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <div>
            <Field id="r-cemail" label="Email">
              <input id="r-cemail" type="email" autoCapitalize="none" value={f.contact_email} maxLength={200} onChange={(e) => onChange({ contact_email: e.target.value })} className={inputCls} {...bad('contact_email')} />
            </Field>
            <Err text={errors.contact_email} />
          </div>
          <div>
            <Field id="r-cphone" label="Mobile phone">
              <input id="r-cphone" type="tel" value={f.contact_phone} maxLength={30} onChange={(e) => onChange({ contact_phone: e.target.value })} className={inputCls} {...bad('contact_phone')} />
            </Field>
            <Err text={errors.contact_phone} />
          </div>
        </div>
      </Card>

      <Card>
        <div className="rounded-xl border border-white/[0.06] bg-[#0a0f1d] p-5 text-[14px] leading-relaxed text-slate-400">
          <div className="mb-1.5 text-sm font-semibold text-slate-200">How we handle your EIN</div>
          It is encrypted the moment you send it. Our team normally sees only the last 4 digits. We open the full number only when we file your registration with the carriers, and each time is recorded.
        </div>
        <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-relaxed text-slate-200">
          <input type="checkbox" checked={f.authorized} onChange={(e) => onChange({ authorized: e.target.checked })} className="mt-1 h-4 w-4 accent-[#f59e0b]" {...bad('authorized')} />
          <span>I am the owner, or I am allowed to register this business for text messaging.</span>
        </label>
        <Err text={errors.authorized} />
        {submitError && <Notice tone="error">{submitError}</Notice>}
        {errorCount(errors) > 0 && <Notice tone="error">Please fix the highlighted questions and send it again.</Notice>}
        <Button type="submit" disabled={busy}>{busy ? 'Sending…' : submitLabel}</Button>
      </Card>
    </form>
  );
};
