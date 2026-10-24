import React, { useCallback, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { adminApi } from '../../../api';
import { Button, Chip, Field, Notice, inputCls } from '../../../components/ui';
import { APP_URL } from '../../../lib/config';
import { useIntegration } from '../../../integrations';
import { useSynced, useSync } from '../../../lib/sync';
import { adminErrorText, relativeTime } from '../../../domain/index';
import {
  EMPTY_DRAFT, FIELD_TYPES, INFO_PRESETS, STEP_ACTIONS, answersToRows, buildStepEmail, businessKeysIn, cleanDraft, draftAsks, draftFromStep, keyFromLabel, mailtoHref, mailtoTooLong,
  stepChanges, suggestPreset, validateDraft,
} from '../../../domain/setup';
import type { FieldType, InfoField, RequestDraft } from '../../../domain/setup';
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

/** Only the fields. It holds no state and has no Save button: the step card owns the one Save for everything. */
const RequestForm: React.FC<{ step: SetupStep; draft: RequestDraft; onChange: (next: RequestDraft) => void }> = ({ step, draft, onChange }) => {
  const suggestion = suggestPreset(step);
  const google = useIntegration('google_calendar');
  const asks = draftAsks(draft);
  const set = (patch: Partial<RequestDraft>) => onChange({ ...draft, ...patch });
  const setField = (i: number, patch: Partial<InfoField>) => set({ fields: draft.fields.map((f, n) => (n === i ? { ...f, ...patch } : f)) });

  const applyPreset = (id: string) => {
    const p = INFO_PRESETS.find((x) => x.id === id);
    if (!p) return;
    set({ prompt: p.prompt, fields: p.fields.map((f) => ({ ...f })), action: p.action ?? null });
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
        <textarea id={`prompt-${step.id}`} rows={2} maxLength={600} value={draft.prompt} onChange={(e) => set({ prompt: e.target.value })} className={`${inputCls} h-auto py-3`} placeholder="One or two sentences" />
      </Field>

      <div className="space-y-3">
        {draft.fields.map((f, i) => (
          <div key={f.key} className="space-y-3 rounded-xl border border-white/[0.06] bg-[#0a0f1d] p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
              <input
                aria-label={`Question ${i + 1}`}
                value={f.label}
                maxLength={120}
                placeholder="The question"
                onChange={(e) => setField(i, { label: e.target.value })}
                onBlur={() => {
                  if (/^field_/.test(f.key) && f.label.trim()) setField(i, { key: uniqueKey(f.label, draft.fields.filter((_, n) => n !== i).map((x) => x.key)) });
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
              <button type="button" onClick={() => set({ fields: draft.fields.filter((_, n) => n !== i) })} className="cursor-pointer text-sm text-slate-500 transition-colors hover:text-red-400">
                Remove
              </button>
            </div>
          </div>
        ))}
        {draft.fields.length < 8 && (
          <Button tone="quiet" onClick={() => set({ fields: [...draft.fields, { key: `field_${draft.fields.length + 1}_${Math.random().toString(36).slice(2, 5)}`, label: '', type: 'text' }] })}>
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
          <select id={`act-${step.id}`} value={draft.action ?? ''} onChange={(e) => set({ action: e.target.value || null })} style={{ colorScheme: 'dark' }} className={inputCls}>
            {STEP_ACTIONS.map(([v, l]) => (
              <option key={v} value={v}>{l}{v === 'connect_calendar' && !google.plugged ? ' (not plugged in yet)' : ''}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
          <Field id={`lnk-${step.id}`} label="Or a link of your own" hint="Must start with https://">
            <input id={`lnk-${step.id}`} type="url" value={draft.link} maxLength={500} placeholder="https://" onChange={(e) => set({ link: e.target.value })} className={inputCls} />
          </Field>
          <Field id={`lbl-${step.id}`} label="Button text">
            <input id={`lbl-${step.id}`} value={draft.linkLabel} maxLength={60} placeholder="Open the form" onChange={(e) => set({ linkLabel: e.target.value })} className={inputCls} />
          </Field>
        </div>
      </div>

      {asks && (
        <button type="button" onClick={() => onChange(EMPTY_DRAFT)} className="cursor-pointer text-sm text-slate-500 transition-colors hover:text-red-400">
          Stop asking the client for anything on this step
        </button>
      )}
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

      {!email.plugged && <Notice tone="info">Sending from here is not plugged in yet, so use Open in my email app or Copy. The set-up guide is in the Wiki (footer link).</Notice>}
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
  const [draft, setDraft] = useState<RequestDraft>(() => draftFromStep(step));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);

  const changes = stepChanges(step, status, note, draft);
  const asks = step.info_fields.length > 0 || step.action !== null || Boolean(step.info_link);
  const rows = answersToRows(step.info_fields, step.info_response);
  const copyable = businessKeysIn(step.info_response);

  const edit = <T,>(setter: (v: T) => void) => (v: T) => {
    setSaved(false);
    setter(v);
  };

  /** One press saves both halves: the status and note, and what the client is asked. */
  const save = async () => {
    const problem = validateDraft(draft);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    if (changes.statusOrNote) {
      const err = await onSaveStep(step.step_key, status, note);
      if (err) {
        setBusy(false);
        return setError(err);
      }
    }
    if (changes.request) {
      const c = cleanDraft(draft);
      const r = await adminApi.setup.setRequest(accountId, step.step_key, { prompt: c.prompt, fields: c.fields, action: c.action, link: c.link || null, linkLabel: c.linkLabel || null });
      if (r.error) {
        setBusy(false);
        if (r.status === 403) return onDenied();
        return setError(r.error.includes('bad_fields') ? 'Check the questions: each needs a label and a different name.' : adminErrorText(r.error));
      }
    }
    setBusy(false);
    setSaved(true);
    onChanged();
  };

  const discard = () => {
    setStatus(step.status);
    setNote(step.note ?? '');
    setDraft(draftFromStep(step));
    setError(null);
    setSaved(false);
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

          {/* ONE form: where the step stands, and what the client is asked. One Save at the bottom. */}
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="text-sm font-semibold text-slate-100">Where this step stands</div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[210px_1fr]">
                <Field id={`st-${step.id}`} label="Status">
                  <select id={`st-${step.id}`} value={status} onChange={(e) => edit(setStatus)(e.target.value as StepStatus)} style={{ colorScheme: 'dark' }} className={inputCls}>
                    {STATUS.map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </Field>
                <Field id={`nt-${step.id}`} label="Note the client sees" hint="Shown to them with what we need from them. Optional.">
                  <input id={`nt-${step.id}`} value={note} maxLength={300} onChange={(e) => edit(setNote)(e.target.value)} placeholder="Optional" className={inputCls} />
                </Field>
              </div>
            </div>

            <RequestForm step={step} draft={draft} onChange={edit(setDraft)} />

            {error && <Notice tone="error">{error}</Notice>}
            <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-6">
              <Button onClick={save} disabled={!changes.any || busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
              {changes.any && !busy && <Button tone="quiet" onClick={discard}>Discard changes</Button>}
              {changes.any && <span className="text-sm text-slate-400">You have unsaved changes.</span>}
              {saved && !changes.any && <Notice tone="ok">Saved</Notice>}
            </div>
          </div>

          {/* a separate action, not part of the form */}
          <div className="space-y-5 border-t border-white/[0.06] pt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Email the client about this</div>
                <p className="mt-1 text-[13px] text-slate-500">Writes a first draft from this step. You can edit it before it goes.</p>
              </div>
              <Button tone="quiet" onClick={() => setEmailOpen((v) => !v)}>{emailOpen ? 'Close the email' : 'Write an email'}</Button>
            </div>
            {emailOpen && (
              <>
                {changes.any && <Notice tone="info">You have unsaved changes. Save first, so the email matches what the client will see.</Notice>}
                <EmailComposer accountId={accountId} step={step} owner={overview.owner} emails={overview.emails} signer={signer} onSent={onChanged} />
              </>
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
