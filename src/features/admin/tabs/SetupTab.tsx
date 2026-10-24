import React, { useCallback, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { adminApi } from '../../../api';
import { Button, Chip, Field, Notice, inputCls } from '../../../components/ui';
import { APP_URL } from '../../../lib/config';
import { useIntegration } from '../../../integrations';
import { useSynced, useSync } from '../../../lib/sync';
import { adminErrorText, relativeTime } from '../../../domain/index';
import {
  FIELD_TYPES, INFO_PRESETS, STEP_ACTIONS, answersToRows, buildStepEmail, businessKeysIn, isHttpsLink, keyFromLabel, mailtoHref, mailtoTooLong, suggestPreset, validateFields,
} from '../../../domain/setup';
import type { FieldType, InfoField } from '../../../domain/setup';
import type { SetupEmail, SetupOverview, SetupStep, StepStatus } from '../../../domain/index';

const STATUS: [StepStatus, string][] = [['pending', 'Up next'], ['in_progress', 'In progress'], ['waiting_on_you', 'Waiting on client'], ['done', 'Done']];
const TONE: Record<StepStatus, 'ok' | 'gold' | 'plain'> = { done: 'ok', waiting_on_you: 'gold', in_progress: 'plain', pending: 'plain' };

const uniqueKey = (label: string, taken: string[]): string => {
  const base = keyFromLabel(label) || 'question';
  let k = base;
  for (let n = 2; taken.includes(k); n++) k = `${base.slice(0, 36)}_${n}`;
  return k;
};

/* ---------------------------------------------------------------- what we ask the client for */

const RequestEditor: React.FC<{ accountId: string; step: SetupStep; onSaved: () => void; onDenied: () => void }> = ({ accountId, step, onSaved, onDenied }) => {
  const [prompt, setPrompt] = useState(step.info_prompt ?? '');
  const [fields, setFields] = useState<InfoField[]>(step.info_fields ?? []);
  const [action, setAction] = useState<string | null>(step.action);
  const [link, setLink] = useState(step.info_link ?? '');
  const [linkLabel, setLinkLabel] = useState(step.info_link_label ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const suggestion = suggestPreset(step);
  const google = useIntegration('google_calendar');

  const touched = () => setSaved(false);
  const asks = fields.length > 0 || action !== null || link.trim() !== '';

  const applyPreset = (id: string) => {
    touched();
    if (!id) {
      setPrompt('');
      setFields([]);
      setAction(null);
      return;
    }
    const p = INFO_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setPrompt(p.prompt);
    setFields(p.fields.map((f) => ({ ...f })));
    setAction(p.action ?? null);
  };

  const setField = (i: number, patch: Partial<InfoField>) => {
    touched();
    setFields((fs) => fs.map((f, n) => (n === i ? { ...f, ...patch } : f)));
  };

  const save = async (clear = false) => {
    const clean = clear ? [] : fields.map((f) => ({ ...f, label: f.label.trim(), options: f.type === 'select' ? (f.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined }));
    const problem = clear ? null : validateFields(clean);
    if (problem) return setError(problem);
    if (!clear && link.trim() && !isHttpsLink(link)) return setError('The link must start with https:// (a secure address).');
    setBusy(true);
    setError(null);
    const r = await adminApi.setup.setRequest(accountId, step.step_key, { prompt: clear ? '' : prompt, fields: clean, action: clear ? null : action, link: clear ? null : link.trim() || null, linkLabel: clear ? null : linkLabel.trim() || null });
    setBusy(false);
    if (r.error) {
      if (r.status === 403) return onDenied();
      return setError(r.error.includes('bad_fields') ? 'Check the questions: each needs a label and a different name.' : adminErrorText(r.error));
    }
    if (clear) {
      setPrompt('');
      setFields([]);
      setAction(null);
      setLink('');
      setLinkLabel('');
    }
    setSaved(true);
    onSaved();
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="text-sm font-semibold text-slate-100">What we ask the client for</div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
          The client sees this on their Setup page and can send it right there. It is always optional: they can also just reply to your email.
        </p>
      </div>

      <Field id={`pre-${step.id}`} label="Start from">
        <select id={`pre-${step.id}`} value="" onChange={(e) => applyPreset(e.target.value)} style={{ colorScheme: 'dark' }} className={inputCls}>
          <option value="">{asks ? 'Replace with a preset…' : 'Pick a preset…'}</option>
          {INFO_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}{p.id === suggestion ? ' (suggested)' : ''}</option>
          ))}
        </select>
      </Field>

      <Field id={`prompt-${step.id}`} label="What you tell the client">
        <textarea id={`prompt-${step.id}`} rows={2} maxLength={600} value={prompt} onChange={(e) => { setPrompt(e.target.value); touched(); }} className={`${inputCls} h-auto py-3`} placeholder="One or two sentences" />
      </Field>

      <div className="space-y-3">
        {fields.map((f, i) => (
          <div key={f.key} className="space-y-3 rounded-xl border border-white/[0.06] bg-[#0a0f1d] p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
              <input
                aria-label={`Question ${i + 1}`}
                value={f.label}
                maxLength={120}
                placeholder="The question"
                onChange={(e) => setField(i, { label: e.target.value })}
                onBlur={() => {
                  if (/^field_/.test(f.key) && f.label.trim()) setField(i, { key: uniqueKey(f.label, fields.filter((_, n) => n !== i).map((x) => x.key)) });
                }}
                className={inputCls}
              />
              <select
                aria-label={`Type of question ${i + 1}`}
                value={f.type}
                onChange={(e) => setField(i, { type: e.target.value as FieldType, options: e.target.value === 'select' ? f.options ?? [] : undefined })}
                style={{ colorScheme: 'dark' }}
                className={inputCls}
              >
                {FIELD_TYPES.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            {f.type === 'select' && (
              <input
                aria-label={`Choices for question ${i + 1}`}
                value={(f.options ?? []).join(', ')}
                placeholder="Choices, separated by commas"
                onChange={(e) => setField(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
                className={inputCls}
              />
            )}
            <div className="flex items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-400">
                <input type="checkbox" checked={Boolean(f.required)} onChange={(e) => setField(i, { required: e.target.checked })} className="h-4 w-4 accent-[#f59e0b]" />
                Required to send this form
              </label>
              <button type="button" onClick={() => { touched(); setFields((fs) => fs.filter((_, n) => n !== i)); }} className="cursor-pointer text-sm text-slate-500 transition-colors hover:text-red-400">
                Remove
              </button>
            </div>
          </div>
        ))}
        {fields.length < 8 && (
          <Button tone="quiet" onClick={() => { touched(); setFields((fs) => [...fs, { key: `field_${fs.length + 1}_${Math.random().toString(36).slice(2, 5)}`, label: '', type: 'text' }]); }}>
            Add a question
          </Button>
        )}
      </div>

      <div className="space-y-5 rounded-xl border border-white/[0.06] bg-[#0a0f1d] p-5">
        <div>
          <div className="text-sm font-semibold text-slate-100">A button on the client's step</div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">Optional. Sends them to our own forms, or to a link of yours.</p>
        </div>
        <Field id={`act-${step.id}`} label="Our built-in button">
          <select id={`act-${step.id}`} value={action ?? ''} onChange={(e) => { touched(); setAction(e.target.value || null); }} style={{ colorScheme: 'dark' }} className={inputCls}>
            {STEP_ACTIONS.map(([v, l]) => (
              <option key={v} value={v}>{l}{v === 'connect_calendar' && !google.plugged ? ' (not plugged in yet)' : ''}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
          <Field id={`lnk-${step.id}`} label="Or a link of your own" hint="Must start with https://">
            <input id={`lnk-${step.id}`} type="url" value={link} maxLength={500} placeholder="https://" onChange={(e) => { touched(); setLink(e.target.value); }} className={inputCls} />
          </Field>
          <Field id={`lbl-${step.id}`} label="Button text">
            <input id={`lbl-${step.id}`} value={linkLabel} maxLength={60} placeholder="Open the form" onChange={(e) => { touched(); setLinkLabel(e.target.value); }} className={inputCls} />
          </Field>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => save(false)} disabled={busy}>{busy ? 'Saving…' : 'Save request'}</Button>
        {step.info_prompt || step.info_fields.length > 0 || step.action || step.info_link ? (
          <Button tone="quiet" onClick={() => save(true)} disabled={busy}>Stop asking</Button>
        ) : null}
        {saved && <Notice tone="ok">Saved</Notice>}
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------- the email about this step */

const EmailComposer: React.FC<{
  accountId: string; step: SetupStep; owner: SetupOverview['owner']; emails: SetupEmail[]; signer: string; onSent: () => void;
}> = ({ accountId, step, owner, emails, signer, onSent }) => {
  const draft = buildStepEmail({
    ownerName: owner.name, ownerEmail: owner.email, stepTitle: step.title, prompt: step.info_prompt, note: step.note,
    fields: step.info_fields, action: step.action, signer,
    kind: step.action === 'registration_form' ? 'secure_form' : step.info_link ? 'external' : 'dashboard',
    link: step.info_link ?? (step.action === 'registration_form' ? `${APP_URL}/registration` : `${APP_URL}/setup`),
  });
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const email = useIntegration('email');
  const mine = emails.filter((e) => e.step_key === step.step_key);
  const to = owner.email;
  const href = to ? mailtoHref(to, subject, body) : '';

  const send = async () => {
    setBusy(true);
    setMsg(null);
    const r = await adminApi.setup.sendEmail(accountId, step.step_key, subject, body);
    setBusy(false);
    if (r.error) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: `Sent to ${to}.` });
    onSent();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      setMsg({ ok: true, text: 'Copied.' });
    } catch {
      setMsg({ ok: false, text: 'Could not copy. Select the text and copy it by hand.' });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="text-sm font-semibold text-slate-100">Email the client about this</div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
          {to ? `Goes to ${to}. Edit it first if you like. Replies come to your own inbox.` : 'This client has no owner email yet, so there is nobody to send it to.'}
        </p>
      </div>

      <Field id={`sub-${step.id}`} label="Subject">
        <input id={`sub-${step.id}`} value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
      </Field>
      <Field id={`body-${step.id}`} label="Message">
        <textarea id={`body-${step.id}`} rows={11} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} className={`${inputCls} h-auto py-3 leading-relaxed`} />
      </Field>

      {!email.plugged && <Notice tone="info">Sending from here is not plugged in yet, so use Open in my email app or Copy. The set-up guide is on the Integrations page.</Notice>}
      {msg && <Notice tone={msg.ok ? 'ok' : 'error'}>{msg.text}</Notice>}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={send} disabled={busy || !email.plugged || !to || !subject.trim() || !body.trim()}>{busy ? 'Sending…' : 'Send email'}</Button>
        {to ? (
          <a href={href} className="inline-flex h-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 font-display text-sm font-bold text-slate-200 transition-colors hover:bg-white/[0.07]">
            Open in my email app
          </a>
        ) : null}
        <Button tone="quiet" onClick={copy}>Copy</Button>
      </div>
      {to && mailtoTooLong(href) && <p className="text-[13px] text-slate-500">The message is long, so some email apps may cut it short when opened. Use Send email or Copy instead.</p>}

      {mine.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-medium text-slate-300">Already sent about this</div>
          <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
            {mine.slice(0, 5).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span className="min-w-0 truncate text-slate-300">{e.subject}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <Chip tone={e.status === 'sent' ? 'ok' : 'danger'}>{e.status === 'sent' ? 'Sent' : 'Failed'}</Chip>
                  <span className="text-xs text-slate-500">{relativeTime(e.created_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

/* ---------------------------------------------------------------- one step */

const StepCard: React.FC<{
  accountId: string; step: SetupStep; overview: SetupOverview; signer: string; open: boolean; onToggle: () => void;
  onSaveStep: (key: string, status: StepStatus, note: string) => Promise<string | null>; onChanged: () => void; onDenied: () => void;
}> = ({ accountId, step, overview, signer, open, onToggle, onSaveStep, onChanged, onDenied }) => {
  const [status, setStatus] = useState<StepStatus>(step.status);
  const [note, setNote] = useState(step.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [panel, setPanel] = useState<'request' | 'email'>('request');
  const dirty = status !== step.status || note.trim() !== (step.note ?? '');
  const asks = step.info_fields.length > 0 || step.action !== null || Boolean(step.info_link);
  const rows = answersToRows(step.info_fields, step.info_response);
  const copyable = businessKeysIn(step.info_response);

  const save = async () => {
    setBusy(true);
    setError(null);
    const err = await onSaveStep(step.step_key, status, note);
    setBusy(false);
    if (err) return setError(err);
    onChanged();
  };

  const apply = async () => {
    setApplied(null);
    const r = await adminApi.setup.applyToBusiness(accountId, step.step_key);
    if (r.error) {
      if (r.status === 403) return onDenied();
      return setApplied(r.error.includes('nothing_to_apply') ? 'None of these answers match a business field.' : adminErrorText(r.error));
    }
    setApplied('Copied into the Business tab.');
    onChanged();
  };

  return (
    <li className="rounded-2xl border border-white/[0.07] bg-[#0f1424]">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full cursor-pointer items-center gap-4 p-5 text-left sm:px-6">
        <div className="min-w-0 flex-1">
          <div className="font-display text-base font-bold tracking-tight text-slate-100">{step.title}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip tone={TONE[step.status]}>{STATUS.find(([v]) => v === step.status)?.[1]}</Chip>
            {step.info_submitted_at && <Chip tone="gold">Info received</Chip>}
            {asks && !step.info_submitted_at && step.status !== 'done' && <Chip>Asked for info</Chip>}
            {step.emails_sent > 0 && <Chip>Emailed {step.emails_sent > 1 ? `${step.emails_sent}×` : relativeTime(step.last_email_at)}</Chip>}
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-8 border-t border-white/[0.06] p-5 sm:p-6">
          {/* status and the note the client sees */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[210px_1fr]">
              <Field id={`st-${step.id}`} label="Status">
                <select id={`st-${step.id}`} value={status} onChange={(e) => setStatus(e.target.value as StepStatus)} style={{ colorScheme: 'dark' }} className={inputCls}>
                  {STATUS.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </Field>
              <Field id={`nt-${step.id}`} label="Note the client sees">
                <input id={`nt-${step.id}`} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className={inputCls} />
              </Field>
            </div>
            {error && <Notice tone="error">{error}</Notice>}
            <Button onClick={save} disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save step'}</Button>
          </div>

          {/* what the client sent */}
          {step.info_submitted_at && (
            <div className="space-y-4 rounded-xl border border-[#f59e0b]/25 bg-[#f59e0b]/[0.05] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-100">What the client sent</div>
                <span className="text-xs text-slate-500">{relativeTime(step.info_submitted_at)}</span>
              </div>
              {rows.length === 0 ? (
                <p className="text-sm text-slate-400">They sent the form without answering anything.</p>
              ) : (
                <dl className="space-y-2.5">
                  {rows.map((r) => (
                    <div key={r.label} className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-6">
                      <dt className="text-sm text-slate-400">{r.label}</dt>
                      <dd className="break-words text-sm font-medium text-slate-100 sm:text-right">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {copyable.length > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button tone="quiet" onClick={apply}>Copy into business info</Button>
                  {applied && <span className="text-sm text-slate-300">{applied}</span>}
                </div>
              )}
            </div>
          )}

          {/* two tools: what we ask, and the email */}
          <div>
            <div role="tablist" className="mb-6 inline-flex rounded-xl border border-white/[0.07] bg-[#090d18] p-1">
              {([['request', 'What we ask for'], ['email', 'Email the client']] as const).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={panel === k}
                  onClick={() => setPanel(k)}
                  className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${panel === k ? 'bg-[#161d30] text-[#ffc174]' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            {panel === 'request' ? (
              <RequestEditor accountId={accountId} step={step} onSaved={onChanged} onDenied={onDenied} />
            ) : (
              <EmailComposer accountId={accountId} step={step} owner={overview.owner} emails={overview.emails} signer={signer} onSent={onChanged} />
            )}
          </div>
        </div>
      )}
    </li>
  );
};

/* ---------------------------------------------------------------- the tab */

export const SetupTab: React.FC<{
  accountId: string;
  signer?: string;
  onSaveStep: (key: string, status: StepStatus, note: string) => Promise<string | null>;
  onDenied: () => void;
  initial?: SetupOverview;
}> = ({ accountId, signer = 'The WedgeScale team', onSaveStep, onDenied, initial }) => {
  const [data, setData] = useState<SetupOverview | null>(initial ?? null);
  const [open, setOpen] = useState<string | null | undefined>(initial ? initial.steps.find((s) => s.status !== 'done')?.step_key ?? null : undefined);
  const [error, setError] = useState<string | null>(null);
  const sync = useSync();
  const opened = useRef(false);

  const load = useCallback(async () => {
    const r = await adminApi.setup.overview(accountId);
    if (r.error) {
      if (r.status === 403) return onDenied();
      setError(adminErrorText(r.error));
      return;
    }
    setError(null);
    const o = r.data as SetupOverview;
    setData(o);
    if (!opened.current) {
      opened.current = true;
      setOpen(o.steps.find((s) => s.status !== 'done')?.step_key ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  useSynced(load, accountId);

  if (!data) return <p className="py-16 text-center text-sm text-slate-400">{error ?? 'Loading setup…'}</p>;

  const done = data.steps.filter((s) => s.status === 'done').length;
  const received = data.steps.filter((s) => s.info_submitted_at && s.status !== 'done').length;
  const changed = () => { load(); sync?.syncAll(); };

  return (
    <div className="space-y-6">
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[15px] text-slate-300">
          {done} of {data.steps.length} steps done{received > 0 ? `, ${received} with info from the client waiting for you` : ''}.
        </p>
      </div>
      {data.steps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.09] p-10 text-center text-sm text-slate-400">This client has no setup steps.</div>
      ) : (
        <ol className="space-y-4">
          {data.steps.map((s) => (
            <StepCard
              key={s.id}
              accountId={accountId}
              step={s}
              overview={data}
              signer={signer}
              open={open === s.step_key}
              onToggle={() => setOpen(open === s.step_key ? null : s.step_key)}
              onSaveStep={onSaveStep}
              onChanged={changed}
              onDenied={onDenied}
            />
          ))}
        </ol>
      )}
    </div>
  );
};
