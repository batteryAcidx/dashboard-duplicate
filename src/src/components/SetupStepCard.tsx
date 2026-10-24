import React, { useState } from 'react';
import { AlertCircle, Check, ChevronDown, Circle, Clock } from 'lucide-react';
import { Button, Chip, Notice, inputCls } from './ui';
import { answersToRows } from '../domain/setup';
import { REGISTRATION_STATUS } from '../domain/registration';
import type { InfoField } from '../domain/setup';
import type { ClientStep, StepStatus } from '../domain/index';

const TAG: Record<StepStatus, { label: string; tone: 'ok' | 'gold' | 'plain' }> = {
  done: { label: 'Done', tone: 'ok' },
  in_progress: { label: 'In progress', tone: 'plain' },
  waiting_on_you: { label: 'Waiting on you', tone: 'gold' },
  pending: { label: 'Up next', tone: 'plain' },
};

const Icon: React.FC<{ status: StepStatus }> = ({ status }) => {
  const base = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border';
  if (status === 'done')
    return (
      <div className={`${base} border-emerald-400/30 bg-emerald-400/10`}>
        <Check className="h-5 w-5 text-emerald-300" />
      </div>
    );
  if (status === 'waiting_on_you')
    return (
      <div className={`${base} border-[#f59e0b]/40 bg-[#f59e0b]/10`}>
        <AlertCircle className="h-5 w-5 text-[#ffc174]" />
      </div>
    );
  if (status === 'in_progress')
    return (
      <div className={`${base} border-white/[0.1] bg-white/[0.04]`}>
        <Clock className="h-5 w-5 text-slate-300" />
      </div>
    );
  return (
    <div className={`${base} border-white/[0.07] bg-white/[0.02]`}>
      <Circle className="h-5 w-5 text-slate-600" />
    </div>
  );
};

const dateLabel = (iso: string | null | undefined, tz: string) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: tz }) : '';

const INPUT_TYPE: Record<string, string> = { text: 'text', phone: 'tel', email: 'email', url: 'url' };

interface Props {
  step: ClientStep;
  tz: string;
  calendar?: { status: string; label: string | null } | null;
  onSubmit?: (stepKey: string, values: Record<string, string>) => Promise<string | null>;
  onConnectCalendar?: () => Promise<string | null>;
  /** where the owner's business registration stands, and how to open the form */
  registration?: { status: string; submitted_at: string | null } | null;
  onOpenRegistration?: () => void;
  defaultOpen?: boolean;
}

/** One step on the client's Setup page. If we need something from them, they can send it right here, or just reply to our email. */
export const SetupStepCard: React.FC<Props> = ({ step, tz, calendar, onSubmit, onConnectCalendar, registration, onOpenRegistration, defaultOpen }) => {
  const fields = step.info_fields ?? [];
  const asks = fields.length > 0;
  const wantsCalendar = step.action === 'connect_calendar';
  const wantsRegistration = step.action === 'registration_form';
  const hasLink = Boolean(step.info_link);
  const hasRequest = asks || wantsCalendar || wantsRegistration || hasLink;
  const submitted = Boolean(step.info_submitted_at);
  const tag = TAG[step.status];

  const [open, setOpen] = useState(defaultOpen ?? (step.status !== 'done' && (step.status === 'waiting_on_you' || (hasRequest && !submitted))));
  const [editing, setEditing] = useState(!submitted);
  const [values, setValues] = useState<Record<string, string>>(step.info_response ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!onSubmit) return;
    setBusy(true);
    setError(null);
    const err = await onSubmit(step.step_key, values);
    setBusy(false);
    if (err) return setError(err);
    setSent(true);
    setEditing(false);
  };

  const connect = async () => {
    if (!onConnectCalendar) return;
    setBusy(true);
    setError(null);
    const err = await onConnectCalendar();
    if (err) {
      setBusy(false);
      setError(err);
    }
  };

  const rows = answersToRows(fields, step.info_response);
  const expandable = Boolean(step.description || step.note || hasRequest);
  const regInfo = registration ? REGISTRATION_STATUS[registration.status] ?? REGISTRATION_STATUS.draft : null;
  const regSent = Boolean(registration?.submitted_at);
  const calendarConnected = calendar?.status === 'active';

  return (
    <li className={`rounded-2xl border bg-[#0f1424] ${step.status === 'waiting_on_you' ? 'border-[#f59e0b]/35' : 'border-white/[0.07]'}`}>
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        aria-expanded={expandable ? open : undefined}
        className={`flex w-full items-center gap-4 p-5 text-left sm:p-6 ${expandable ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <Icon status={step.status} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[17px] font-bold tracking-tight text-slate-100">{step.title}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Chip tone={tag.tone}>
              {tag.label}
              {step.status === 'done' && step.completed_at ? ` · ${dateLabel(step.completed_at, tz)}` : ''}
            </Chip>
            {hasRequest && submitted && step.status !== 'done' && <Chip tone="ok">Info sent</Chip>}
          </div>
        </div>
        {expandable && <ChevronDown className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>

      {open && expandable && (
        <div className="space-y-5 border-t border-white/[0.06] px-5 pb-6 pt-5 sm:px-6">
          {step.description && <p className="text-[15px] leading-relaxed text-slate-300">{step.description}</p>}
          {step.note && step.status !== 'done' && (
            <p className="rounded-xl border border-white/[0.06] bg-[#0a0f1d] p-4 text-[15px] leading-relaxed text-slate-200">{step.note}</p>
          )}

          {hasRequest && step.status !== 'done' && (
            <div className="space-y-5 rounded-xl border border-white/[0.06] bg-[#0a0f1d] p-5">
              <div>
                <div className="text-sm font-semibold text-slate-100">What we need</div>
                <p className="mt-1.5 text-[15px] leading-relaxed text-slate-400">{step.info_prompt || 'A few details to finish this step.'}</p>
              </div>

              {wantsRegistration && (
                <div className="space-y-3">
                  {regSent && regInfo && (
                    <div className="flex flex-wrap items-center gap-3">
                      <Chip tone={regInfo.tone}>{regInfo.label}</Chip>
                      <span className="text-sm text-slate-300">{regInfo.clientLine}</span>
                    </div>
                  )}
                  <Button onClick={onOpenRegistration} disabled={!onOpenRegistration}>
                    {regSent ? 'Review or update your details' : 'Open the registration form'}
                  </Button>
                  <p className="text-[13px] leading-relaxed text-slate-500">Takes about 5 minutes. Your EIN is stored encrypted.</p>
                </div>
              )}

              {hasLink && (
                <div>
                  <a
                    href={step.info_link ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-[#f59e0b] px-5 font-display text-sm font-bold text-[#150f05] transition-colors hover:bg-[#fbbf24]"
                  >
                    {step.info_link_label || 'Open the form'}
                  </a>
                </div>
              )}

              {wantsCalendar && (
                <div className="space-y-3">
                  {calendarConnected ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <Chip tone="ok">Connected</Chip>
                      <span className="text-sm text-slate-300">{calendar?.label || 'Google Calendar'}</span>
                    </div>
                  ) : (
                    <>
                      {calendar?.status === 'needs_reauth' && <Notice tone="error">The connection stopped working. Please connect it again.</Notice>}
                      <Button onClick={connect} disabled={busy || !onConnectCalendar}>
                        {busy ? 'Opening Google…' : calendar?.status === 'needs_reauth' ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}
                      </Button>
                      <p className="text-[13px] leading-relaxed text-slate-500">
                        You sign in with Google and tick one box. We only add and read events, and you can disconnect any time.
                      </p>
                    </>
                  )}
                </div>
              )}

              {asks && submitted && !editing ? (
                <div className="space-y-3">
                  {sent && <Notice tone="ok">Thanks, we got it.</Notice>}
                  <dl className="space-y-2">
                    {rows.map((r) => (
                      <div key={r.label} className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-6">
                        <dt className="text-sm text-slate-500">{r.label}</dt>
                        <dd className="break-words text-sm font-medium text-slate-200 sm:text-right">{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <Button tone="quiet" onClick={() => setEditing(true)}>
                    Change my answers
                  </Button>
                </div>
              ) : (
                asks && (
                  <div className="space-y-5">
                    {fields.map((f) => (
                      <div key={f.key}>
                        <label htmlFor={`${step.id}-${f.key}`} className="mb-2 block text-sm font-medium text-slate-300">
                          {f.label}
                          {f.required ? '' : <span className="font-normal text-slate-500"> (optional)</span>}
                        </label>
                        {f.type === 'textarea' ? (
                          <textarea
                            id={`${step.id}-${f.key}`}
                            rows={4}
                            maxLength={2000}
                            value={values[f.key] ?? ''}
                            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                            className={`${inputCls} h-auto py-3`}
                          />
                        ) : f.type === 'select' ? (
                          <select
                            id={`${step.id}-${f.key}`}
                            value={values[f.key] ?? ''}
                            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                            style={{ colorScheme: 'dark' }}
                            className={inputCls}
                          >
                            <option value="">Choose one</option>
                            {(f.options ?? []).map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id={`${step.id}-${f.key}`}
                            type={INPUT_TYPE[f.type] ?? 'text'}
                            maxLength={300}
                            value={values[f.key] ?? ''}
                            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                            className={inputCls}
                          />
                        )}
                      </div>
                    ))}
                    {error && <Notice tone="error">{error}</Notice>}
                    <div className="flex flex-wrap items-center gap-4">
                      <Button onClick={submit} disabled={busy || !onSubmit}>
                        {busy ? 'Sending…' : submitted ? 'Send the update' : 'Send to WedgeScale'}
                      </Button>
                      {submitted && (
                        <Button tone="quiet" onClick={() => { setEditing(false); setError(null); }}>
                          Cancel
                        </Button>
                      )}
                    </div>
                    <p className="text-[13px] leading-relaxed text-slate-500">
                      This is optional. If it is easier, just reply to our email with it and we will take care of the rest.
                    </p>
                  </div>
                )
              )}
              {!asks && error && <Notice tone="error">{error}</Notice>}
            </div>
          )}
        </div>
      )}
    </li>
  );
};
