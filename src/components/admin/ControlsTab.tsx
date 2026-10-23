import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Button, Card, Chip, Field, Notice, Row, Switch, inputCls } from '../ui';
import { PAUSE_OPTIONS, adminErrorText, hoursToText, parseHours, pauseLeft, pauseUntilIso, readiness } from '../../lib/adminTools';
import { Updated } from '../Updated';
import { useAutoRefresh } from '../../lib/useAutoRefresh';

export interface Controls {
  engine_enabled: boolean;
  paused_until: string | null;
  test_mode: boolean;
  book_existing_customers: boolean;
  daily_message_cap: number;
  daily_conversation_cap: number;
  inspection_minutes: number;
  slot_step_minutes: number;
  min_notice_hours: number;
  max_days_ahead: number;
  concurrent_inspections: number;
  follow_up_schedule_hours: number[];
  reply_delay_min_seconds: number;
  reply_delay_max_seconds: number;
  ai_model: string | null;
  phone_number: string | null;
  forwarding_status: string;
  twilio_ready: boolean;
  registration_status: string | null;
  account_status: string | null;
  notification_phone: string | null;
  service_lat: number | null;
  service_lon: number | null;
  service_country: string | null;
  storm_mode: boolean | null;
  weather_error: string | null;
  pending_events: number;
  failed_events: number;
}

type Form = Record<string, string>;

const formFrom = (c: Controls): Form => ({
  dailyMsg: String(c.daily_message_cap),
  dailyConv: String(c.daily_conversation_cap),
  inspection: String(c.inspection_minutes),
  step: String(c.slot_step_minutes),
  notice: String(c.min_notice_hours),
  ahead: String(c.max_days_ahead),
  concurrent: String(c.concurrent_inspections),
  followUps: hoursToText(c.follow_up_schedule_hours),
  delayMin: String(c.reply_delay_min_seconds),
  delayMax: String(c.reply_delay_max_seconds),
  aiModel: c.ai_model ?? '',
  phone: c.phone_number ?? '',
  forwarding: c.forwarding_status || 'not_set',
  lat: c.service_lat == null ? '' : String(c.service_lat),
  lon: c.service_lon == null ? '' : String(c.service_lon),
  country: c.service_country || 'US',
});

const whole = (text: string, lo: number, hi: number, name: string): number | string => {
  const n = Number(text);
  if (!text.trim() || !Number.isInteger(n) || n < lo || n > hi) return `${name} must be a whole number from ${lo} to ${hi}.`;
  return n;
};

const Select: React.FC<{ id: string; value: string; onChange: (v: string) => void; options: [string, string][] }> = ({ id, value, onChange, options }) => (
  <select id={id} value={value} onChange={(e) => onChange(e.target.value)} style={{ colorScheme: 'dark' }} className={inputCls}>
    {options.map(([v, l]) => (
      <option key={v} value={v}>
        {l}
      </option>
    ))}
  </select>
);

const Grid: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">{children}</div>;

export const ControlsTab: React.FC<{ accountId: string; onDenied: () => void; initial?: Controls }> = ({ accountId, onDenied, initial }) => {
  const [c, setC] = useState<Controls | null>(initial ?? null);
  const [f, setF] = useState<Form>(initial ? formFrom(initial) : {});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(Date.now());
  // true while there are edits that are not saved yet. A refresh must never overwrite them.
  const dirty = useRef(false);

  const apply = (data: Controls, resetForm = true) => {
    setC(data);
    if (resetForm) {
      setF(formFrom(data));
      dirty.current = false;
    }
  };

  const fail = (message: string) => {
    if (message.includes('forbidden')) return onDenied();
    setError(adminErrorText(message));
  };

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('admin_get_controls', { p_account_id: accountId });
    if (err) return fail(err.message);
    setError(null);
    apply(data as Controls, !dirty.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // loads on its own, then keeps itself up to date
  const { updatedAt, refreshing, refresh } = useAutoRefresh(load, accountId);

  // keep "2h 10m left" honest while the tab is open
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const patch = async (key: string, body: Record<string, unknown>): Promise<boolean> => {
    setBusy(key);
    setError(null);
    setSaved(null);
    const { data, error: err } = await supabase.rpc('admin_update_controls', { p_account_id: accountId, p_patch: body });
    setBusy(null);
    if (err) {
      fail(err.message);
      return false;
    }
    apply(data as Controls);
    setSaved(key);
    setTimeout(() => setSaved((s) => (s === key ? null : s)), 3000);
    return true;
  };

  const set = (k: string) => (v: string) => {
    dirty.current = true;
    setF((prev) => ({ ...prev, [k]: v }));
  };

  const saveLimits = () => {
    const a = whole(f.dailyMsg, 1, 5000, 'Daily messages');
    const b = whole(f.dailyConv, 1, 1000, 'Daily new conversations');
    if (typeof a === 'string') return setError(a);
    if (typeof b === 'string') return setError(b);
    patch('limits', { daily_message_cap: a, daily_conversation_cap: b });
  };

  const saveBooking = () => {
    const vals = [
      whole(f.notice, 0, 168, 'Minimum notice'),
      whole(f.ahead, 1, 60, 'Days ahead'),
      whole(f.concurrent, 1, 10, 'Simultaneous inspections'),
    ];
    const bad = vals.find((v) => typeof v === 'string');
    if (bad) return setError(bad as string);
    patch('booking', {
      inspection_minutes: Number(f.inspection),
      slot_step_minutes: Number(f.step),
      min_notice_hours: vals[0],
      max_days_ahead: vals[1],
      concurrent_inspections: vals[2],
    });
  };

  const saveTiming = () => {
    const hours = parseHours(f.followUps);
    if (!hours.ok) return setError(hours.error);
    const lo = whole(f.delayMin, 0, 600, 'Shortest reply delay');
    const hi = whole(f.delayMax, 0, 600, 'Longest reply delay');
    if (typeof lo === 'string') return setError(lo);
    if (typeof hi === 'string') return setError(hi);
    if (hi < lo) return setError('The longest reply delay cannot be shorter than the shortest.');
    patch('timing', {
      follow_up_schedule_hours: hours.hours,
      reply_delay_min_seconds: lo,
      reply_delay_max_seconds: hi,
      ai_model: f.aiModel.trim() || null,
    });
  };

  const savePhone = () => {
    const phone = f.phone.trim();
    if (phone && !/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(phone)) return setError('Enter the number like +12145550100.');
    patch('phone', { phone_number: phone || null, forwarding_status: f.forwarding });
  };

  const saveLocation = () => {
    const lat = f.lat.trim() === '' ? null : Number(f.lat);
    const lon = f.lon.trim() === '' ? null : Number(f.lon);
    if ((lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) || (lon !== null && (Number.isNaN(lon) || lon < -180 || lon > 180))) {
      return setError('Latitude must be between -90 and 90, and longitude between -180 and 180.');
    }
    if ((lat === null) !== (lon === null)) return setError('Enter both latitude and longitude, or leave both empty.');
    patch('location', { service_lat: lat, service_lon: lon, service_country: f.country });
  };

  const flipEngine = async () => {
    if (!c) return;
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 6000);
      return;
    }
    setConfirming(false);
    setBusy('engine');
    setError(null);
    const { error: err } = await supabase.rpc('admin_set_engine_enabled', { p_account_id: accountId, p_enabled: !c.engine_enabled });
    setBusy(null);
    if (err) return fail(err.message);
    await load();
  };

  const retry = async () => {
    setBusy('retry');
    setError(null);
    const { error: err } = await supabase.rpc('admin_retry_failed_events', { p_account_id: accountId });
    setBusy(null);
    if (err) return fail(err.message);
    await load();
  };

  if (!c) return <p className="py-16 text-center text-sm text-slate-400">{error ?? 'Loading controls…'}</p>;

  const left = pauseLeft(c.paused_until, now);
  const ready = readiness(c);
  const on = c.engine_enabled;
  const saveNote = (k: string) => (saved === k ? <Notice tone="ok">Saved</Notice> : null);

  const check = (ok: boolean) => <Chip tone={ok ? 'ok' : 'plain'}>{ok ? 'Done' : 'Missing'}</Chip>;

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <Updated at={updatedAt} refreshing={refreshing} onRefresh={refresh} />
      </div>
      {error && <Notice tone="error">{error}</Notice>}

      <Card
        title="Texting engine"
        hint="Turning it off stops all texting for this client at once. It can only be turned on when everything below is ready."
        action={
          <Chip tone={on && !left ? 'gold' : 'plain'}>
            {on ? (left ? `Paused · ${left}` : test_label(c.test_mode)) : 'Off'}
          </Chip>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button
            tone={confirming ? (on ? 'danger' : 'primary') : 'quiet'}
            onClick={flipEngine}
            disabled={busy === 'engine' || (!on && !ready.ready)}
          >
            {busy === 'engine' ? 'Working…' : confirming ? (on ? 'Confirm: stop texting' : 'Confirm: start texting') : on ? 'Turn off' : 'Turn on'}
          </Button>
          {on &&
            (left ? (
              <Button tone="quiet" disabled={busy === 'pause'} onClick={() => patch('pause', { paused_until: null })}>
                Resume now
              </Button>
            ) : (
              PAUSE_OPTIONS.map((p) => (
                <Button key={p.hours} tone="quiet" disabled={busy === 'pause'} onClick={() => patch('pause', { paused_until: pauseUntilIso(p.hours) })}>
                  Pause {p.label}
                </Button>
              ))
            ))}
        </div>

        <div className="space-y-4 rounded-xl border border-white/[0.06] bg-[#0a0f1d] p-5">
          <div className="text-sm font-semibold text-slate-300">Ready to turn on?</div>
          <Row label="Account is live" value={check(ready.accountLive)} />
          <Row label="Registration approved" value={check(ready.registrationApproved)} />
          <Row label="Texting number set" value={check(ready.numberSet)} />
          <Row label="Phone service connected" value={check(ready.phoneServiceReady)} />
          <Row label="Call forwarding verified" value={check(ready.forwardingVerified)} />
        </div>

        <Switch
          label="Test mode"
          hint="Only the owner's own notification number is texted. Use it to rehearse before real homeowners are involved."
          checked={c.test_mode}
          disabled={busy === 'test'}
          onChange={(v) => patch('test', { test_mode: v })}
        />
        <Switch
          label="Book existing customers"
          hint="Off: past and recurring customers are flagged and the owner gets their details. On: they are offered inspection times like homeowners."
          checked={c.book_existing_customers}
          disabled={busy === 'existing'}
          onChange={(v) => patch('existing', { book_existing_customers: v })}
        />
      </Card>

      <Card title="Limits" hint="Spending and safety caps. A runaway conversation or a flood of calls stops here.">
        <Grid>
          <Field id="cap-msg" label="Messages per day" hint="All texts sent for this client in one day.">
            <input id="cap-msg" inputMode="numeric" value={f.dailyMsg} onChange={(e) => set('dailyMsg')(e.target.value)} className={inputCls} />
          </Field>
          <Field id="cap-conv" label="New conversations per day" hint="Missed calls that get a first text in one day.">
            <input id="cap-conv" inputMode="numeric" value={f.dailyConv} onChange={(e) => set('dailyConv')(e.target.value)} className={inputCls} />
          </Field>
        </Grid>
        <div className="flex items-center gap-4">
          <Button onClick={saveLimits} disabled={busy === 'limits'}>{busy === 'limits' ? 'Saving…' : 'Save limits'}</Button>
          {saveNote('limits')}
        </div>
      </Card>

      <Card title="Booking rules" hint="How inspection times are offered. Applies to the next conversation.">
        <Grid>
          <Field id="b-len" label="Inspection length">
            <Select id="b-len" value={f.inspection} onChange={set('inspection')} options={[['30', '30 minutes'], ['45', '45 minutes'], ['60', '1 hour'], ['90', '1.5 hours'], ['120', '2 hours']]} />
          </Field>
          <Field id="b-step" label="Offer times every">
            <Select id="b-step" value={f.step} onChange={set('step')} options={[['15', '15 minutes'], ['30', '30 minutes'], ['60', '1 hour'], ['120', '2 hours']]} />
          </Field>
          <Field id="b-notice" label="Minimum notice (hours)" hint="Nothing is offered sooner than this.">
            <input id="b-notice" inputMode="numeric" value={f.notice} onChange={(e) => set('notice')(e.target.value)} className={inputCls} />
          </Field>
          <Field id="b-ahead" label="Offer up to (days ahead)">
            <input id="b-ahead" inputMode="numeric" value={f.ahead} onChange={(e) => set('ahead')(e.target.value)} className={inputCls} />
          </Field>
          <Field id="b-conc" label="Inspections at the same time" hint="How many crews can inspect at once.">
            <input id="b-conc" inputMode="numeric" value={f.concurrent} onChange={(e) => set('concurrent')(e.target.value)} className={inputCls} />
          </Field>
        </Grid>
        <div className="flex items-center gap-4">
          <Button onClick={saveBooking} disabled={busy === 'booking'}>{busy === 'booking' ? 'Saving…' : 'Save booking rules'}</Button>
          {saveNote('booking')}
        </div>
      </Card>

      <Card title="Timing and model" hint="Follow-ups, the human-like reply delay, and which AI model writes the texts.">
        <Field id="t-follow" label="Follow-ups (hours after the call)" hint="Separate with commas, in increasing order. Example: 4, 24, 72, 120, 168. Leave empty for none.">
          <input id="t-follow" value={f.followUps} onChange={(e) => set('followUps')(e.target.value)} className={inputCls} />
        </Field>
        <Grid>
          <Field id="t-min" label="Shortest reply delay (seconds)">
            <input id="t-min" inputMode="numeric" value={f.delayMin} onChange={(e) => set('delayMin')(e.target.value)} className={inputCls} />
          </Field>
          <Field id="t-max" label="Longest reply delay (seconds)">
            <input id="t-max" inputMode="numeric" value={f.delayMax} onChange={(e) => set('delayMax')(e.target.value)} className={inputCls} />
          </Field>
        </Grid>
        <Field id="t-model" label="AI model override" hint="Leave empty to use the default model.">
          <input id="t-model" value={f.aiModel} onChange={(e) => set('aiModel')(e.target.value)} placeholder="Default" className={inputCls} />
        </Field>
        <div className="flex items-center gap-4">
          <Button onClick={saveTiming} disabled={busy === 'timing'}>{busy === 'timing' ? 'Saving…' : 'Save timing'}</Button>
          {saveNote('timing')}
        </div>
      </Card>

      <Card title="Texting number and forwarding" hint="The number homeowners text, and whether the owner's missed calls are forwarded to it.">
        <Grid>
          <Field id="p-num" label="Texting number" hint="Like +12145550100. Set when the number is bought.">
            <input id="p-num" value={f.phone} onChange={(e) => set('phone')(e.target.value)} placeholder="Not set up" className={inputCls} />
          </Field>
          <Field id="p-fwd" label="Call forwarding">
            <Select id="p-fwd" value={f.forwarding} onChange={set('forwarding')} options={[['not_set', 'Not set'], ['pending', 'Waiting for the owner'], ['verified', 'Verified']]} />
          </Field>
        </Grid>
        <div className="space-y-3">
          <Row label="Registration" value={(c.registration_status || '').replace(/_/g, ' ')} />
          <Row label="Phone service" value={c.twilio_ready ? 'Connected' : 'Not connected'} />
          <Row label="Owner's notification number" value={c.notification_phone || ''} />
        </div>
        <div className="flex items-center gap-4">
          <Button onClick={savePhone} disabled={busy === 'phone'}>{busy === 'phone' ? 'Saving…' : 'Save number'}</Button>
          {saveNote('phone')}
        </div>
      </Card>

      <Card title="Weather location" hint="The middle of the service area. Weather alerts are looked up for this point. A homeowner's address is never sent to a weather service.">
        <Grid>
          <Field id="w-lat" label="Latitude">
            <input id="w-lat" inputMode="decimal" value={f.lat} onChange={(e) => set('lat')(e.target.value)} placeholder="32.7767" className={inputCls} />
          </Field>
          <Field id="w-lon" label="Longitude">
            <input id="w-lon" inputMode="decimal" value={f.lon} onChange={(e) => set('lon')(e.target.value)} placeholder="-96.7970" className={inputCls} />
          </Field>
          <Field id="w-ctry" label="Country" hint="Weather alerts cover the US for now.">
            <Select id="w-ctry" value={f.country} onChange={set('country')} options={[['US', 'United States'], ['CA', 'Canada']]} />
          </Field>
        </Grid>
        <Row label="Right now" value={c.service_lat == null ? 'Needs coordinates' : c.weather_error ? `Error: ${c.weather_error}` : c.storm_mode ? 'Storm mode' : 'Clear'} />
        <div className="flex items-center gap-4">
          <Button onClick={saveLocation} disabled={busy === 'location'}>{busy === 'location' ? 'Saving…' : 'Save location'}</Button>
          {saveNote('location')}
        </div>
      </Card>

      <Card title="Health" hint="Texts waiting to be handled, and any that failed.">
        <Row label="Waiting" value={String(c.pending_events)} />
        <Row label="Failed" value={String(c.failed_events)} />
        <div>
          <Button tone="quiet" onClick={retry} disabled={busy === 'retry' || c.failed_events === 0}>
            {busy === 'retry' ? 'Retrying…' : 'Retry failed'}
          </Button>
        </div>
      </Card>
    </div>
  );
};

function test_label(test: boolean): string {
  return test ? 'On · test mode' : 'On';
}
